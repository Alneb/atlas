//! A CalDAV client (RFC 4791 over RFC 4918): find the user's calendars from the server's address, list events in a
//! range, and write or remove one event by its UID — conditionally (If-None-Match / If-Match), so adding the same UID
//! again never makes a second event and nobody's newer edit is overwritten blindly.
use crate::ics::{self, Listed};
use crate::uid::resource_name;
use crate::xml::{self, Response, APPLE, CALDAV, CS, DAV};
use chrono::{Duration, NaiveDate};
use reqwest::blocking::Client as Http;
use reqwest::Method;
use serde::Serialize;
use std::fmt;
use url::Url;

/// Why a CalDAV call failed, worded for the user.
#[derive(Debug, Clone, PartialEq)]
pub enum DavError {
    /// 401: the user name or app password was refused
    Auth { host: String },
    /// no answer at all (DNS, refused, TLS, timeout)
    Network { host: String, why: String },
    /// an answer the operation cannot go on with
    Status { what: String, code: u16, body: String },
    /// the setup is incomplete, or the server's answer made no sense
    Setup(String),
}

impl fmt::Display for DavError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DavError::Auth { host } => write!(f, "app password rejected: {host} refused the user name or app password (401). Check the account in Settings → Plugins → Calendar → Accounts"),
            DavError::Network { host, why } => write!(f, "cannot reach {host}: {why}"),
            DavError::Status { what, code, body } => {
                let more = if body.is_empty() { String::new() } else { format!(" ({body})") };
                match code {
                    403 => write!(f, "{what}: the server refused it (403 Forbidden){more} — a read-only calendar, or an account without rights to it"),
                    404 | 410 => write!(f, "{what}: not found ({code}){more} — check the server address and the calendar"),
                    405 | 501 => write!(f, "{what}: the server does not do this ({code}){more} — is the address a CalDAV one?"),
                    412 => write!(f, "{what}: changed on the server meanwhile (412); try again"),
                    507 => write!(f, "{what}: the server is out of space (507)"),
                    _ => write!(f, "{what}: the server answered {code}{more}"),
                }
            }
            DavError::Setup(why) => f.write_str(why),
        }
    }
}

impl std::error::Error for DavError {}

pub type Result<T> = std::result::Result<T, DavError>;

/// What the plugin needs to talk to one server (an account card and its `accounts.<name>.password` secret).
#[derive(Debug, Clone)]
pub struct Account {
    pub url: String,
    pub user: String,
    pub password: String,
}

/// An answer, read whole.
#[derive(Debug, Clone)]
pub struct Resp {
    pub status: u16,
    pub etag: Option<String>,
    pub body: String,
    /// where the answer came from after redirects
    pub url: Url,
    /// the `Location` header of an answer that is not a redirect (a push subscription's address)
    pub location: Option<String>,
}

/// A calendar collection on the server.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Calendar {
    pub url: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// VEVENT, VTODO…; empty when the server does not say (then: everything)
    pub components: Vec<String>,
    pub writable: bool,
}

impl Calendar {
    pub fn takes_events(&self) -> bool {
        self.components.is_empty() || self.components.iter().any(|c| c == "VEVENT")
    }
}

/// An event as stored on the server.
#[derive(Debug, Clone, Serialize)]
pub struct Stored {
    pub href: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub etag: Option<String>,
    #[serde(flatten)]
    pub event: Listed,
}

/// What writing an event did.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    /// new on the server
    Added,
    /// there already, and changed to what was given
    Updated,
    /// there already with the same content (or, for an invite, kept as the server has it)
    Unchanged,
}

/// What to do when the UID is already on the server.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Existing {
    /// write ours over it unless its X-ATLAS-HASH says it already holds the same thing
    Update,
    /// leave it (an invite the user may have answered in another program)
    Keep,
}

/// A PUT's condition.
enum Cond<'a> {
    /// only if nothing is there (a new event)
    Absent,
    /// only if it is still the version we read
    Is(&'a str),
    /// whatever is there (the server gave no ETag to check against)
    Any,
}

enum Located {
    Calendar(Calendar),
    Home(Url),
}

enum Put {
    Done,
    /// 412: the condition failed
    Precondition,
    /// 403 / 409: the server refuses this resource (the UID already stored under another name: no-uid-conflict; or
    /// the data: valid-calendar-data) — with the server's reason
    Conflict(String),
}

const CAL_PROPS: &str = "<d:resourcetype/><d:displayname/><c:supported-calendar-component-set/><a:calendar-color/><d:current-user-privilege-set/>";
const REDIRECTS: usize = 5;

pub struct Client {
    http: Http,
    base: Url,
    user: String,
    password: String,
}

/// A collection's address always ends in `/`, so joining a resource name adds to it instead of replacing its last part.
pub fn as_dir(mut u: Url) -> Url {
    if !u.path().ends_with('/') {
        let p = format!("{}/", u.path());
        u.set_path(&p);
    }
    u
}

/// A short excerpt of an error body: a WebDAV `<error>`'s precondition names (`valid-calendar-data`,
/// `no-uid-conflict`), else its text without tags.
fn excerpt(body: &str) -> String {
    if body.contains("<error") || body.contains(":error") {
        let names: Vec<String> = regex::Regex::new(r"<(?:[\w-]+:)?([\w-]+)[^>]*/>")
            .map(|r| r.captures_iter(body).map(|c| c[1].to_string()).collect())
            .unwrap_or_default();
        if !names.is_empty() {
            return names.join(", ");
        }
    }
    let no_tags = regex::Regex::new(r"<[^>]*>").map(|r| r.replace_all(body, " ").into_owned()).unwrap_or_default();
    let words = no_tags.split_whitespace().collect::<Vec<_>>().join(" ");
    words.chars().take(160).collect()
}

/// A reqwest failure with its causes (a TLS or DNS reason is in the chain, not the top message).
fn network_why(e: &reqwest::Error) -> String {
    let mut parts = vec![if e.is_timeout() {
        "no answer in time".to_string()
    } else if e.is_connect() {
        "could not connect".to_string()
    } else {
        "the request failed".to_string()
    }];
    let mut src = std::error::Error::source(e);
    while let Some(s) = src {
        let t = s.to_string();
        if !parts.iter().any(|p| p.contains(&t)) {
            parts.push(t);
        }
        src = s.source();
    }
    parts.join(": ")
}

fn propfind_body(props: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/" xmlns:cs="http://calendarserver.org/ns/" xmlns:card="urn:ietf:params:xml:ns:carddav" xmlns:p="https://bitfire.at/webdav-push"><d:prop>{props}</d:prop></d:propfind>"#
    )
}

fn query_body(filter: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">{filter}</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>"#
    )
}

/// A calendar from a PROPFIND response, when the resource is one.
pub fn calendar_of(r: &Response, base: &Url) -> Option<Calendar> {
    r.prop(DAV, "resourcetype")?.child(CALDAV, "calendar")?;
    let url = as_dir(base.join(&r.href).ok()?);
    let fallback = url
        .path_segments()
        .and_then(|mut s| s.rfind(|x| !x.is_empty()).map(str::to_string))
        .unwrap_or_else(|| url.to_string());
    let components = r
        .prop(CALDAV, "supported-calendar-component-set")
        .map(|s| s.all(CALDAV, "comp").filter_map(|c| c.attr("name")).map(|n| n.to_ascii_uppercase()).collect())
        .unwrap_or_default();
    // a privilege set lists what this user may do; without one, assume writing is allowed and let the PUT say
    let writable = r
        .prop(DAV, "current-user-privilege-set")
        .is_none_or(|set| ["write", "write-content", "all", "bind"].iter().any(|p| set.find(DAV, p).is_some()));
    Some(Calendar {
        url: url.to_string(),
        name: r.text(DAV, "displayname").unwrap_or(fallback),
        color: r.text(APPLE, "calendar-color"),
        components,
        writable,
    })
}

impl Client {
    pub fn new(acc: &Account) -> Result<Client> {
        let (url, user) = (acc.url.trim(), acc.user.trim());
        if url.is_empty() || user.is_empty() || acc.password.is_empty() {
            return Err(DavError::Setup("the account is not set up: fill in its server address, user name and app password in Settings → Plugins → Calendar → Accounts".into()));
        }
        let with_scheme = if url.contains("://") { url.to_string() } else { format!("https://{url}") };
        let base = Url::parse(&with_scheme)
            .map_err(|e| DavError::Setup(format!("the server address {url:?} is not an address: {e}")))?;
        if !matches!(base.scheme(), "http" | "https") {
            return Err(DavError::Setup(format!("the server address must start with https:// (got {url:?})")));
        }
        let http = Http::builder()
            .redirect(reqwest::redirect::Policy::none()) // followed by hand, keeping the method (PROPFIND, REPORT)
            .timeout(std::time::Duration::from_secs(30))
            .user_agent(concat!("Atlas-dav/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|e| DavError::Setup(format!("the HTTP client could not start: {e}")))?;
        Ok(Client { http, base: as_dir(base), user: user.to_string(), password: acc.password.clone() })
    }

    pub fn base(&self) -> &Url {
        &self.base
    }

    pub(crate) fn host(u: &Url) -> String {
        u.host_str()
            .map(|h| match u.port() {
                Some(p) => format!("{h}:{p}"),
                None => h.to_string(),
            })
            .unwrap_or_else(|| u.to_string())
    }

    /// One request, redirects followed with the same method; 401 is always `Auth`, anything else the caller's to judge.
    pub(crate) fn send(
        &self,
        method: &str,
        url: &Url,
        depth: Option<&str>,
        body: Option<(&str, String)>,
        extra: &[(&str, &str)],
    ) -> Result<Resp> {
        let m = Method::from_bytes(method.as_bytes()).map_err(|e| DavError::Setup(e.to_string()))?;
        let mut at = url.clone();
        for _ in 0..=REDIRECTS {
            let mut req = self.http.request(m.clone(), at.clone()).basic_auth(&self.user, Some(&self.password));
            if let Some(d) = depth {
                req = req.header("Depth", d);
            }
            for (k, v) in extra {
                req = req.header(*k, *v);
            }
            if let Some((ctype, text)) = &body {
                req = req.header("Content-Type", *ctype).body(text.clone());
            }
            let r = req.send().map_err(|e| DavError::Network { host: Self::host(&at), why: network_why(&e) })?;
            let status = r.status().as_u16();
            if (300..400).contains(&status) && status != 304 {
                if let Some(next) =
                    r.headers().get("location").and_then(|l| l.to_str().ok()).and_then(|l| at.join(l).ok())
                {
                    at = next;
                    continue;
                }
            }
            if status == 401 {
                return Err(DavError::Auth { host: Self::host(&at) });
            }
            let etag = r.headers().get("etag").and_then(|e| e.to_str().ok()).map(str::to_string);
            let location = r.headers().get("location").and_then(|e| e.to_str().ok()).map(str::to_string);
            let body = r.text().unwrap_or_default();
            return Ok(Resp { status, etag, body, url: at, location });
        }
        Err(DavError::Status { what: format!("{method} {}", url.path()), code: 310, body: "too many redirects".into() })
    }

    /// A PROPFIND that must answer 207: the responses, and the address they are relative to.
    pub(crate) fn propfind(&self, url: &Url, depth: &str, props: &str) -> Result<(Url, Vec<Response>)> {
        let r = self.send(
            "PROPFIND",
            url,
            Some(depth),
            Some(("application/xml; charset=utf-8", propfind_body(props))),
            &[],
        )?;
        if r.status != 207 {
            return Err(DavError::Status {
                what: format!("PROPFIND {}", url.path()),
                code: r.status,
                body: excerpt(&r.body),
            });
        }
        let rs = xml::multistatus(&r.body).map_err(DavError::Setup)?;
        Ok((r.url, rs))
    }

    /// Where the address leads: a calendar itself, or the user's calendar home — current-user-principal →
    /// calendar-home-set (RFC 4791 §6.2, RFC 5397), through `/.well-known/caldav` (RFC 6764) when the address given is
    /// the server's top.
    fn locate(&self) -> Result<Located> {
        let first = format!("<d:current-user-principal/><c:calendar-home-set/>{CAL_PROPS}");
        let (mut principal, mut home) = (None, None);
        match self.propfind(&self.base, "0", &first) {
            Ok((at, rs)) => {
                if let Some(cal) = rs.first().and_then(|r| calendar_of(r, &at)) {
                    return Ok(Located::Calendar(cal));
                }
                home = rs.iter().find_map(|r| r.href_in(CALDAV, "calendar-home-set")).and_then(|h| at.join(&h).ok());
                principal =
                    rs.iter().find_map(|r| r.href_in(DAV, "current-user-principal")).and_then(|h| at.join(&h).ok());
            }
            Err(e @ DavError::Auth { .. }) | Err(e @ DavError::Network { .. }) => return Err(e),
            Err(_) => {} // not a DAV address: the well-known one may be
        }
        if home.is_none() && principal.is_none() {
            let wk = self.base.join("/.well-known/caldav").map_err(|e| DavError::Setup(e.to_string()))?;
            match self.propfind(&wk, "0", "<d:current-user-principal/>") {
                Ok((at, rs)) => {
                    principal =
                        rs.iter().find_map(|r| r.href_in(DAV, "current-user-principal")).and_then(|h| at.join(&h).ok())
                }
                // RustiCal answers the top's PROPFIND 405 before asking who is calling: the 401 comes only here
                Err(e @ DavError::Auth { .. }) | Err(e @ DavError::Network { .. }) => return Err(e),
                Err(_) => {}
            }
        }
        if home.is_none() {
            let Some(p) = principal else {
                return Err(DavError::Setup(format!(
                    "no CalDAV account found at {}: give the server's CalDAV address (RustiCal: https://host/caldav/, Nextcloud: https://host/remote.php/dav/, Radicale: https://host/)",
                    self.base
                )));
            };
            let (at, rs) = self.propfind(&p, "0", "<c:calendar-home-set/>")?;
            home = rs.iter().find_map(|r| r.href_in(CALDAV, "calendar-home-set")).and_then(|h| at.join(&h).ok());
        }
        home.map(|h| Located::Home(as_dir(h)))
            .ok_or_else(|| DavError::Setup(format!("the server at {} names no calendar home for this user", self.base)))
    }

    /// The user's calendar home (where their calendars are made).
    pub fn home(&self) -> Result<Url> {
        match self.locate()? {
            Located::Home(h) => Ok(h),
            Located::Calendar(c) => Err(DavError::Setup(format!("{} is a calendar, not an account's address", c.url))),
        }
    }

    /// The user's calendars; an address that is itself a calendar is that one calendar.
    pub fn discover(&self) -> Result<Vec<Calendar>> {
        match self.locate()? {
            Located::Calendar(c) => Ok(vec![c]),
            Located::Home(home) => {
                let (at, rs) = self.propfind(&home, "1", CAL_PROPS)?;
                Ok(rs.iter().filter_map(|r| calendar_of(r, &at)).collect())
            }
        }
    }

    /// The calendar a setting names: its address (as Settings suggests it), a path on the server, or its name; empty:
    /// the first calendar that takes events and may be written.
    pub fn resolve(&self, setting: &str) -> Result<Url> {
        let s = setting.trim();
        if s.starts_with("http://") || s.starts_with("https://") {
            return Url::parse(s).map(as_dir).map_err(|e| DavError::Setup(format!("the calendar address {s:?}: {e}")));
        }
        if s.starts_with('/') {
            return self.base.join(s).map(as_dir).map_err(|e| DavError::Setup(e.to_string()));
        }
        let cals = self.discover()?;
        let pick = if s.is_empty() {
            cals.iter().find(|c| c.takes_events() && c.writable)
        } else {
            cals.iter()
                .find(|c| c.name.eq_ignore_ascii_case(s) || c.url.trim_end_matches('/').ends_with(&format!("/{s}")))
        };
        match pick {
            Some(c) => Url::parse(&c.url).map_err(|e| DavError::Setup(e.to_string())),
            None if cals.is_empty() => Err(DavError::Setup("the server has no calendar for this user".into())),
            None => Err(DavError::Setup(format!(
                "no calendar {s:?}{} on the server; it has: {}",
                if s.is_empty() { " that takes events" } else { "" },
                cals.iter().map(|c| c.name.as_str()).collect::<Vec<_>>().join(", ")
            ))),
        }
    }

    fn report(&self, cal: &Url, filter: &str) -> Result<Vec<Stored>> {
        let r =
            self.send("REPORT", cal, Some("1"), Some(("application/xml; charset=utf-8", query_body(filter))), &[])?;
        if r.status != 207 {
            return Err(DavError::Status {
                what: format!("REPORT {}", cal.path()),
                code: r.status,
                body: excerpt(&r.body),
            });
        }
        let mut out = Vec::new();
        for resp in xml::multistatus(&r.body).map_err(DavError::Setup)? {
            let Some(data) = resp.prop(CALDAV, "calendar-data") else { continue };
            let href = r.url.join(&resp.href).map(|u| u.to_string()).unwrap_or(resp.href.clone());
            let etag = resp.text(DAV, "getetag");
            match ics::events_of(&data.text) {
                Ok(evs) => {
                    out.extend(evs.into_iter().map(|event| Stored { href: href.clone(), etag: etag.clone(), event }))
                }
                Err(e) => eprintln!("dav: {href}: its calendar data could not be read ({e}); left out"),
            }
        }
        Ok(out)
    }

    /// The events overlapping `from`..=`to` (whole days, UTC), by start.
    pub fn events(&self, cal: &Url, from: NaiveDate, to: NaiveDate) -> Result<Vec<Stored>> {
        let range = format!(
            r#"<c:time-range start="{}T000000Z" end="{}T000000Z"/>"#,
            from.format("%Y%m%d"),
            (to + Duration::days(1)).format("%Y%m%d")
        );
        let mut evs = self.report(cal, &range)?;
        evs.sort_by(|a, b| a.event.start.cmp(&b.event.start));
        Ok(evs)
    }

    /// The stored event with this UID, wherever it is in the calendar (its address, ETag and text).
    pub fn find_uid(&self, cal: &Url, uid: &str) -> Result<Option<(Url, Option<String>, String)>> {
        let filter = format!(
            r#"<c:prop-filter name="UID"><c:text-match collation="i;octet">{}</c:text-match></c:prop-filter>"#,
            xml::escape(uid)
        );
        let r =
            self.send("REPORT", cal, Some("1"), Some(("application/xml; charset=utf-8", query_body(&filter))), &[])?;
        if r.status != 207 {
            return Err(DavError::Status {
                what: format!("REPORT {}", cal.path()),
                code: r.status,
                body: excerpt(&r.body),
            });
        }
        for resp in xml::multistatus(&r.body).map_err(DavError::Setup)? {
            let Some(data) = resp.prop(CALDAV, "calendar-data") else { continue };
            if ics::events_of(&data.text).is_ok_and(|evs| evs.iter().any(|e| e.uid == uid)) {
                let href = r.url.join(&resp.href).map_err(|e| DavError::Setup(e.to_string()))?;
                return Ok(Some((href, resp.text(DAV, "getetag"), data.text.clone())));
            }
        }
        Ok(None)
    }

    /// GET: (ETag, text), or None when it is not there.
    fn get(&self, url: &Url) -> Result<Option<(Option<String>, String)>> {
        let r = self.send("GET", url, None, None, &[])?;
        match r.status {
            200..=299 => Ok(Some((r.etag, r.body))),
            404 | 410 => Ok(None),
            code => Err(DavError::Status { what: format!("GET {}", url.path()), code, body: excerpt(&r.body) }),
        }
    }

    fn put(&self, url: &Url, ics: &str, cond: Cond) -> Result<Put> {
        let header = match cond {
            Cond::Absent => Some(("If-None-Match", "*")),
            Cond::Is(etag) => Some(("If-Match", etag)),
            Cond::Any => None,
        };
        let extra: Vec<(&str, &str)> = header.into_iter().collect();
        let r = self.send("PUT", url, None, Some(("text/calendar; charset=utf-8", ics.to_string())), &extra)?;
        match r.status {
            200..=299 => Ok(Put::Done),
            412 => Ok(Put::Precondition),
            403 | 409 => Ok(Put::Conflict(excerpt(&r.body))),
            code => Err(DavError::Status { what: format!("PUT {}", url.path()), code, body: excerpt(&r.body) }),
        }
    }

    fn delete(&self, url: &Url, etag: Option<&str>) -> Result<bool> {
        let extra: Vec<(&str, &str)> = etag.map(|e| ("If-Match", e)).into_iter().collect();
        let r = self.send("DELETE", url, None, None, &extra)?;
        match r.status {
            200..=299 => Ok(true),
            404 | 410 => Ok(false),
            code => Err(DavError::Status { what: format!("DELETE {}", url.path()), code, body: excerpt(&r.body) }),
        }
    }

    /// Writes the calendar object `ics` (one event, UID `uid`) into `cal`. New: added under `<uid>.ics`. There already
    /// (under any name): kept, or updated when its X-ATLAS-HASH differs from `hash` — with If-Match on the ETag read.
    pub fn upsert(
        &self,
        cal: &Url,
        uid: &str,
        ics: &str,
        hash: Option<&str>,
        existing: Existing,
    ) -> Result<(Outcome, Url)> {
        let cal = as_dir(cal.clone());
        let href = cal.join(&resource_name(uid)).map_err(|e| DavError::Setup(e.to_string()))?;
        let what = |u: &Url| format!("PUT {}", u.path());
        // a UID Atlas did not make (an invite) may already be stored under another program's name, and not every
        // server refuses a second copy (RustiCal has no no-uid-conflict check): look it up first
        let elsewhere = if uid.starts_with("atlas-") { None } else { self.find_uid(&cal, uid)? };
        let found = if elsewhere.is_some() {
            elsewhere
        } else {
            match self.put(&href, ics, Cond::Absent)? {
                Put::Done => return Ok((Outcome::Added, href)),
                Put::Precondition => match self.get(&href)? {
                    Some((etag, text)) => Some((href.clone(), etag, text)),
                    None => self.find_uid(&cal, uid)?,
                },
                Put::Conflict(why) => match self.find_uid(&cal, uid)? {
                    Some(f) => Some(f),
                    None => return Err(DavError::Status { what: what(&href), code: 403, body: why }),
                },
            }
        };
        let Some((at, etag, text)) = found else {
            // gone between the two calls: write it new
            return match self.put(&href, ics, Cond::Absent)? {
                Put::Done => Ok((Outcome::Added, href)),
                _ => Err(DavError::Status { what: what(&href), code: 412, body: String::new() }),
            };
        };
        if existing == Existing::Keep || hash.is_some_and(|h| ics::unfold(&text).contains(&format!("X-ATLAS-HASH:{h}")))
        {
            return Ok((Outcome::Unchanged, at));
        }
        let cond = etag.as_deref().map_or(Cond::Any, Cond::Is);
        match self.put(&at, ics, cond)? {
            Put::Done => Ok((Outcome::Updated, at)),
            Put::Precondition => Err(DavError::Status { what: what(&at), code: 412, body: String::new() }),
            Put::Conflict(why) => Err(DavError::Status { what: what(&at), code: 403, body: why }),
        }
    }

    /// Removes the event with this UID; false when the calendar has none.
    pub fn remove(&self, cal: &Url, uid: &str) -> Result<bool> {
        let cal = as_dir(cal.clone());
        let href = cal.join(&resource_name(uid)).map_err(|e| DavError::Setup(e.to_string()))?;
        let found = match self.get(&href)? {
            Some((etag, _)) => Some((href, etag)),
            None => self.find_uid(&cal, uid)?.map(|(u, e, _)| (u, e)),
        };
        match found {
            Some((u, etag)) => self.delete(&u, etag.as_deref()),
            None => Ok(false),
        }
    }
}


/// What changed in a collection since a sync-token (RFC 6578).
#[derive(Debug, Default)]
pub struct Delta {
    /// (address, ETag) of new or changed members
    pub changed: Vec<(String, Option<String>)>,
    pub removed: Vec<String>,
    pub token: Option<String>,
}

/// The state a collection reports in one PROPFIND: (getctag, sync-token).
pub type CollectionState = (Option<String>, Option<String>);

impl Client {
    /// A collection's change tag and sync-token (either may be missing: then the ETag listing decides).
    pub fn state(&self, coll: &Url) -> Result<CollectionState> {
        let (_, rs) = self.propfind(coll, "0", "<cs:getctag/><d:sync-token/>")?;
        let r = rs.first();
        Ok((r.and_then(|r| r.text(CS, "getctag")), r.and_then(|r| r.text(DAV, "sync-token"))))
    }

    /// Every member of a collection with its ETag (sub-collections and the collection itself left out).
    pub fn listing(&self, coll: &Url) -> Result<Vec<(String, Option<String>)>> {
        let coll = as_dir(coll.clone());
        let (at, rs) = self.propfind(&coll, "1", "<d:resourcetype/><d:getetag/>")?;
        Ok(rs
            .iter()
            .filter(|r| r.prop(DAV, "resourcetype").is_none_or(|t| t.child(DAV, "collection").is_none()))
            .filter_map(|r| {
                let u = at.join(&r.href).ok()?;
                (as_dir(u.clone()) != coll).then(|| (u.to_string(), r.text(DAV, "getetag")))
            })
            .collect())
    }

    /// RFC 6578 sync-collection from `token`; an error when the server refuses the token (then: the full listing).
    pub fn changes(&self, coll: &Url, token: &str) -> Result<Delta> {
        let body = format!(
            r#"<?xml version="1.0" encoding="utf-8"?><d:sync-collection xmlns:d="DAV:"><d:sync-token>{}</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/></d:prop></d:sync-collection>"#,
            xml::escape(token)
        );
        let r = self.send("REPORT", coll, None, Some(("application/xml; charset=utf-8", body)), &[])?;
        if r.status != 207 {
            return Err(DavError::Status { what: format!("REPORT sync-collection {}", coll.path()), code: r.status, body: excerpt(&r.body) });
        }
        let root = xml::parse(&r.body).map_err(DavError::Setup)?;
        let mut d = Delta { token: root.child(DAV, "sync-token").map(|t| t.trimmed().to_string()), ..Delta::default() };
        for resp in xml::multistatus(&r.body).map_err(DavError::Setup)? {
            let Ok(u) = r.url.join(&resp.href) else { continue };
            if as_dir(u.clone()) == as_dir(coll.clone()) {
                continue;
            }
            if resp.status == Some(404) {
                d.removed.push(u.to_string());
            } else {
                d.changed.push((u.to_string(), resp.text(DAV, "getetag")));
            }
        }
        Ok(d)
    }

    /// The members at these addresses, whole: (address, ETag, text). `kind` is the report's
    /// (`c:calendar-multiget` / `card:addressbook-multiget`) and `data` its property (`c:calendar-data`…).
    pub fn multiget(&self, coll: &Url, hrefs: &[String], card: bool) -> Result<Vec<(String, Option<String>, String)>> {
        let (report, data, ns, prop) = if card {
            ("card:addressbook-multiget", "card:address-data", crate::xml::CARDDAV, "address-data")
        } else {
            ("c:calendar-multiget", "c:calendar-data", CALDAV, "calendar-data")
        };
        let mut out = Vec::new();
        for chunk in hrefs.chunks(50) {
            let list: String = chunk
                .iter()
                .filter_map(|h| Url::parse(h).ok())
                .map(|u| format!("<d:href>{}</d:href>", xml::escape(u.path())))
                .collect();
            let body = format!(
                r#"<?xml version="1.0" encoding="utf-8"?><{report} xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><{data}/></d:prop>{list}</{report}>"#
            );
            let r = self.send("REPORT", coll, Some("1"), Some(("application/xml; charset=utf-8", body)), &[])?;
            if r.status != 207 {
                return Err(DavError::Status { what: format!("REPORT multiget {}", coll.path()), code: r.status, body: excerpt(&r.body) });
            }
            for resp in xml::multistatus(&r.body).map_err(DavError::Setup)? {
                let Some(text) = resp.prop(ns, prop).map(|p| p.text.clone()) else { continue };
                let Ok(u) = r.url.join(&resp.href) else { continue };
                out.push((u.to_string(), resp.text(DAV, "getetag"), text));
            }
        }
        Ok(out)
    }

    /// GET one member: (ETag, text), None when gone.
    pub fn fetch(&self, href: &Url) -> Result<Option<(Option<String>, String)>> {
        self.get(href)
    }

    /// Writes a whole calendar object: new (`if_match` None: only if nothing is there) or over the version read.
    /// Answers the new ETag when the server gives one.
    pub fn write(&self, href: &Url, text: &str, if_match: Option<&str>) -> Result<Option<String>> {
        let extra: Vec<(&str, &str)> = match if_match {
            Some(e) => vec![("If-Match", e)],
            None => vec![("If-None-Match", "*")],
        };
        let r = self.send("PUT", href, None, Some(("text/calendar; charset=utf-8", text.to_string())), &extra)?;
        match r.status {
            200..=299 => Ok(r.etag),
            code => Err(DavError::Status { what: format!("PUT {}", href.path()), code, body: excerpt(&r.body) }),
        }
    }

    /// Deletes a member, only if it is still the version read.
    pub fn erase(&self, href: &Url, etag: Option<&str>) -> Result<bool> {
        self.delete(href, etag)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errors_say_what_to_do() {
        let auth = DavError::Auth { host: "dav.example.org".into() }.to_string();
        assert!(auth.starts_with("app password rejected") && auth.contains("Settings"), "{auth}");
        let s = DavError::Status { what: "PUT /c/x.ics".into(), code: 403, body: String::new() }.to_string();
        assert!(s.contains("403 Forbidden") && s.contains("read-only"), "{s}");
        assert!(DavError::Status { what: "PROPFIND /".into(), code: 405, body: "Method Not Allowed".into() }
            .to_string()
            .contains("CalDAV"));
        // as RustiCal refuses an event without DTSTAMP
        let body = "<?xml version=\"1.0\"?>\n<error xmlns=\"DAV:\">\n <valid-calendar-data xmlns=\"urn:ietf:params:xml:ns:caldav\"/>\n</error>";
        assert_eq!(excerpt(body), "valid-calendar-data");
        assert_eq!(excerpt("<html><body><h1>Bad  gateway</h1></body></html>"), "Bad gateway");
    }

    #[test]
    fn an_incomplete_setup_or_a_bad_address_is_said_before_any_request() {
        let acc = |url: &str, pw: &str| Account { url: url.into(), user: "alice".into(), password: pw.into() };
        assert!(Client::new(&acc("https://dav.example.org", "")).err().unwrap().to_string().contains("not set up"));
        assert!(Client::new(&acc("ftp://x", "p")).err().unwrap().to_string().contains("https://"));
        let c = Client::new(&acc("dav.example.org/remote.php/dav", "p")).unwrap();
        assert_eq!(c.base().as_str(), "https://dav.example.org/remote.php/dav/", "https added, a collection ends in /");
    }

    #[test]
    fn calendars_are_read_from_a_home_listing() {
        let x = r#"<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
 <d:response><d:href>/dav/alice/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/dav/alice/work/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Work</d:displayname>
   <d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/dav/alice/tasks</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
   <c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>
   <d:current-user-privilege-set><d:privilege><d:all/></d:privilege></d:current-user-privilege-set></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>"#;
        let base = Url::parse("https://h.example/dav/alice/").unwrap();
        let cals: Vec<Calendar> = xml::multistatus(x).unwrap().iter().filter_map(|r| calendar_of(r, &base)).collect();
        assert_eq!(cals.len(), 2, "the home itself is not a calendar");
        assert_eq!(
            (cals[0].name.as_str(), cals[0].url.as_str(), cals[0].writable, cals[0].takes_events()),
            ("Work", "https://h.example/dav/alice/work/", false, true)
        );
        assert_eq!(
            (cals[1].name.as_str(), cals[1].url.as_str(), cals[1].writable, cals[1].takes_events()),
            ("tasks", "https://h.example/dav/alice/tasks/", true, false)
        );
    }
}
