//! Sign-ins to the services plugins reach, written once for every plugin (docs/design/SERVICE-SIGNIN.md). A service behind a
//! forward-auth gate (Authelia, Authentik, oauth2-proxy…) is recognised by the shape of its answer, never by a product
//! name: the core says "sign in" instead of handing a plugin the portal's HTML, the desktop app shows the gate's page in
//! a window, and the cookies that window ends with are kept here and sent with that site's later requests. A plugin never
//! sees them.
use crate::secrets::Store;
use crate::Result;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};
use ts_rs::TS;

/// The secrets store's section for sign-ins: not a plugin id (those never start with `@`), so no plugin can read it.
const SECTION: &str = "@signin";

/// What stands in front of a service, as read from its answer: the fetch carries it instead of failing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "lowercase")]
#[ts(export)]
pub enum Needed {
    /// A gate in front of the host: open `page` in a sign-in window; when it lands back on `host`, its cookies are kept.
    Door { host: String, page: String },
    /// The service wants an OpenID token the plugin's sign-in `name` does not have (not made yet, ended, or refused
    /// by a Bearer 401): `atlas.oauth.signIn(name, { resource: page })` finds the provider from the service.
    Token { host: String, name: String, page: String },
}

/// A cookie as the sign-in window ended with it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Cookie {
    pub name: String,
    pub value: String,
    /// The host it was set for, or the domain it covers (`.example.org` / `example.org` with `host_only = false`).
    pub domain: String,
    #[serde(default)]
    pub host_only: bool,
    #[serde(default = "root_path")]
    pub path: String,
    #[serde(default)]
    pub secure: bool,
    /// Unix seconds; none = until the gate stops taking it.
    #[serde(default)]
    #[ts(optional, type = "number")]
    pub expires: Option<u64>,
}

fn root_path() -> String {
    "/".into()
}

/// One kept sign-in, as Settings lists it (no cookie values).
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct Kept {
    pub host: String,
    /// Unix seconds.
    #[ts(type = "number")]
    pub at: u64,
    pub cookies: usize,
    /// When the gate last took it (the keep-alive's visit), unix seconds.
    #[ts(optional, type = "number")]
    pub renewed: Option<u64>,
    /// The latest a cookie of it lasts, unix seconds (none: as long as the gate keeps the session).
    #[ts(optional, type = "number")]
    pub expires: Option<u64>,
    /// The gate stopped taking it: the next door met offers the sign-in again.
    pub ended: bool,
    /// The plugins it is sent for: those naming a host its cookies cover (`with_users`).
    #[serde(default)]
    pub plugins: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct Entry {
    at: u64,
    cookies: Vec<Cookie>,
    #[serde(default)]
    renewed: Option<u64>,
    #[serde(default)]
    ended: bool,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or_default()
}

fn key(host: &str) -> String {
    format!("door.{}", host.trim_end_matches('.').to_ascii_lowercase())
}

/// Does the cookie go to `host` / `path` over `https`? RFC 6265's domain and path matching.
fn applies(c: &Cookie, host: &str, path: &str, https: bool, at: u64) -> bool {
    let domain = c.domain.trim_start_matches('.').to_ascii_lowercase();
    let host_ok = host == domain || (!c.host_only && host.len() > domain.len() && host.ends_with(&domain) && host.as_bytes()[host.len() - domain.len() - 1] == b'.');
    let path_ok = path == c.path || (path.starts_with(&c.path) && (c.path.ends_with('/') || path.as_bytes().get(c.path.len()) == Some(&b'/')));
    host_ok && path_ok && (https || !c.secure) && c.expires.is_none_or(|e| e > at)
}

/// Where the sign-ins are kept: the device's store, not the vault's (a gate's session and a bypass key are this
/// machine's way past the gate, for every vault on it and for the phone's native screens). A vault's own `@signin`
/// section, from before, is moved there the first time it is asked (`Store::move_section`). Every read and write of
/// the section goes through here.
pub(crate) fn signins(store: &Store) -> Result<Store> {
    let device = store.device();
    store.move_section(SECTION, &device)?;
    Ok(device)
}

/// Keep what a sign-in window ended with on `host` (replacing an earlier sign-in there).
pub fn keep(store: &Store, host: &str, cookies: Vec<Cookie>) -> Result<()> {
    let store = &signins(store)?;
    let entry = Entry { at: now(), cookies, renewed: None, ended: false };
    store.set(SECTION, &key(host), &serde_json::to_string(&entry).map_err(|e| crate::Error::Other(e.into()))?)
}

pub fn forget(store: &Store, host: &str) -> Result<bool> {
    signins(store)?.delete(SECTION, &key(host))
}

fn entries(store: &Store) -> Result<Vec<(String, Entry)>> {
    let mut out = Vec::new();
    for (name, raw) in signins(store)?.values(SECTION, None)? {
        let Some(host) = name.strip_prefix("door.") else { continue };
        if let Ok(e) = serde_json::from_str::<Entry>(&raw) {
            out.push((host.to_string(), e));
        }
    }
    Ok(out)
}

pub fn list(store: &Store) -> Result<Vec<Kept>> {
    Ok(entries(store)?
        .into_iter()
        .map(|(host, e)| Kept { host, at: e.at, cookies: e.cookies.len(), renewed: e.renewed, expires: e.cookies.iter().filter_map(|c| c.expires).max(), ended: e.ended, plugins: vec![] })
        .collect())
}

/// `list` with each sign-in's plugins: those whose `[permissions] net` names a host (exactly or a `*.domain`, never a
/// lone `*`) that one of its cookies covers — the plugins the core sends it for.
pub fn with_users(store: &Store, plugins: &[(String, Vec<String>)]) -> Result<Vec<Kept>> {
    let entries: BTreeMap<String, Entry> = entries(store)?.into_iter().collect();
    let mut out = list(store)?;
    for k in &mut out {
        let Some(e) = entries.get(&k.host) else { continue };
        let covers = |host: &str| e.cookies.iter().any(|c| applies(c, host, &c.path, true, 0));
        k.plugins = plugins
            .iter()
            .filter(|(_, net)| net.iter().map(|n| n.trim().to_ascii_lowercase()).any(|n| n != "*" && covers(&n.replace("*.", "x."))))
            .map(|(id, _)| id.clone())
            .collect();
    }
    Ok(out)
}

/// How often a kept sign-in is visited: well inside the shortest idle limit seen (Authelia's `inactivity`, days).
const KEEP_ALIVE: std::time::Duration = std::time::Duration::from_secs(6 * 3600);

/// Every kept door visited once in a while with its cookies, so the gate's idle limit never ends the session between
/// uses (and the OpenID sign-ins renewed when long unused, `plugin_oauth::keep_alive`); a cookie the gate renews is kept, a session the gate no longer takes is marked ended (not forgotten). The
/// first visit a minute after start.
pub fn spawn_keep_alive(root: std::path::PathBuf) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        loop {
            let store = Store::for_vault(&root);
            let tokens = store.clone();
            let _ = tokio::task::spawn_blocking(move || crate::plugin_oauth::keep_alive(&tokens)).await;
            for (host, ended) in entries(&store).unwrap_or_default().into_iter().map(|(h, e)| (h, e.ended)) {
                if !ended {
                    if let Err(e) = touch(&store, &host).await {
                        eprintln!("atlas: keeping the sign-in to {host}: {e}");
                    }
                }
            }
            tokio::time::sleep(KEEP_ALIVE).await;
        }
    })
}

/// One visit to `host` with its kept cookies: renewed (and its new cookies kept), or ended.
async fn touch(store: &Store, host: &str) -> Result<()> {
    touch_at(store, host, &format!("https://{host}/")).await
}

async fn touch_at(store: &Store, host: &str, address: &str) -> Result<()> {
    let url = reqwest::Url::parse(address).map_err(|e| crate::Error::BadRequest(e.to_string()))?;
    let Some(cookie) = cookie_header(store, &url)? else { return Ok(()) };
    let client = reqwest::Client::builder().use_preconfigured_tls(crate::tls_chain::config()).redirect(reqwest::redirect::Policy::none()).timeout(std::time::Duration::from_secs(20)).build().map_err(|e| crate::Error::Other(e.into()))?;
    let res = client.get(url.clone()).header(reqwest::header::COOKIE, cookie).send().await.map_err(|e| crate::Error::Other(e.into()))?;
    let status = res.status().as_u16();
    let mut headers = BTreeMap::new();
    let mut set = Vec::new();
    for (k, v) in res.headers() {
        let v = v.to_str().unwrap_or_default().to_string();
        if k == reqwest::header::SET_COOKIE {
            set.push(v);
        } else {
            headers.insert(k.as_str().to_string(), v);
        }
    }
    let gate = detect(&url, &url, status, &headers, false).is_some();
    let store = &signins(store)?;
    let Some(raw) = store.get(SECTION, &key(host))? else { return Ok(()) };
    let Ok(mut e) = serde_json::from_str::<Entry>(&raw) else { return Ok(()) };
    if gate {
        e.ended = true;
    } else {
        e.renewed = Some(now());
        for line in &set {
            if let Some(fresh) = parse_set_cookie(line, host) {
                if let Some(c) = e.cookies.iter_mut().find(|c| c.name == fresh.name && c.domain.trim_start_matches('.') == fresh.domain.trim_start_matches('.')) {
                    *c = fresh;
                }
            }
        }
    }
    store.set(SECTION, &key(host), &serde_json::to_string(&e).map_err(|e| crate::Error::Other(e.into()))?)
}

/// A `Set-Cookie` line as a cookie of `host`: its name and value, Domain, Path, Secure, and its end from Max-Age (or
/// Expires, an HTTP date). None for a line with no `name=value`.
fn parse_set_cookie(line: &str, host: &str) -> Option<Cookie> {
    let mut parts = line.split(';').map(str::trim);
    let (name, value) = parts.next()?.split_once('=')?;
    let mut c = Cookie { name: name.trim().to_string(), value: value.trim().to_string(), domain: host.to_string(), host_only: true, path: root_path(), secure: false, expires: None };
    let mut max_age = None;
    for p in parts {
        let (k, v) = p.split_once('=').map_or((p, ""), |(k, v)| (k.trim(), v.trim()));
        match k.to_ascii_lowercase().as_str() {
            "domain" if !v.is_empty() => {
                let d = v.trim_start_matches('.').to_ascii_lowercase();
                // only the host itself or a domain above it (a browser refuses the cookie otherwise): no server sets
                // what another site is sent
                let h = host.rsplit_once(':').filter(|(_, port)| port.chars().all(|c| c.is_ascii_digit())).map_or(host, |(h, _)| h);
                let h = h.trim_end_matches('.').to_ascii_lowercase();
                if h != d && !h.ends_with(&format!(".{d}")) {
                    return None;
                }
                (c.domain, c.host_only) = (d, false);
            }
            "path" if v.starts_with('/') => c.path = v.to_string(),
            "secure" => c.secure = true,
            "max-age" => max_age = v.parse::<i64>().ok(),
            "expires" => c.expires = cookie_date(v),
            _ => {}
        }
    }
    if let Some(m) = max_age {
        c.expires = Some((now() as i64).saturating_add(m).max(0) as u64); // a huge Max-Age is "for good", not an overflow
    }
    Some(c)
}

/// An `Expires` date in seconds: `Wed, 21 Oct 2026 07:28:00 GMT` and the dashed form many servers send to clear a
/// cookie (`Thu, 01-Jan-1970 00:00:00 GMT`), two-digit years too. Unread, a cleared cookie would be kept for good.
fn cookie_date(v: &str) -> Option<u64> {
    let v = v.replace('-', " ");
    let t = ["%a, %d %b %Y %H:%M:%S GMT", "%A, %d %b %y %H:%M:%S GMT", "%a, %d %b %y %H:%M:%S GMT"].iter().find_map(|f| chrono::NaiveDateTime::parse_from_str(&v, f).ok())?;
    Some(t.and_utc().timestamp().max(0) as u64)
}

/// The `Cookie` header for a request to `url` from every kept sign-in that covers it: a gate's cookie usually covers
/// the whole domain, so one sign-in opens every service behind the same gate. `None` when nothing applies.
pub fn cookie_header(store: &Store, url: &reqwest::Url) -> Result<Option<String>> {
    let host = url.host_str().unwrap_or_default().trim_end_matches('.').to_ascii_lowercase();
    let (at, https) = (now(), url.scheme() == "https");
    // one value per name: the most recent sign-in wins
    let mut by_name: BTreeMap<String, (u64, String)> = BTreeMap::new();
    for (_, e) in entries(store)? {
        for c in e.cookies.iter().filter(|c| applies(c, &host, url.path(), https, at)) {
            if by_name.get(&c.name).is_none_or(|(t, _)| *t <= e.at) {
                by_name.insert(c.name.clone(), (e.at, c.value.clone()));
            }
        }
    }
    Ok((!by_name.is_empty()).then(|| by_name.into_iter().map(|(n, (_, v))| format!("{n}={v}")).collect::<Vec<_>>().join("; ")))
}

/// Is a sign-in in front of the service, judging by its answer? `asked` is the request's address, `landed` where the
/// answer came from after the redirects the plugin may follow, `wants_json` whether the request asked for JSON.
/// - a redirect (not followed: another host) or an answer from another host that is a page, when that address carries
///   the one asked for back (`?rd=`, `redirect_uri=`, `return_to=`…, by its host in a query value) → a gate's portal.
///   Without it the move to another host is a resolver's or a short link's (doi.org → the publisher), not a sign-in;
/// - 401 with no `WWW-Authenticate` challenge the plugin could answer itself (Basic, Bearer…), or with a page;
/// - a page where JSON was asked for.
pub fn detect(asked: &reqwest::Url, landed: &reqwest::Url, status: u16, headers: &BTreeMap<String, String>, wants_json: bool) -> Option<Needed> {
    let host = asked.host_str()?.to_ascii_lowercase();
    let kind = headers.get("content-type").map(|t| t.to_ascii_lowercase()).unwrap_or_default();
    let (html, json) = (kind.contains("text/html"), kind.contains("json"));
    let elsewhere = |u: &reqwest::Url| u.host_str().is_some_and(|h| !h.eq_ignore_ascii_case(&host));
    // a portal sends the visitor back afterwards: the address asked for is in one of its query values
    let sends_back = |u: &reqwest::Url| u.query_pairs().any(|(_, v)| v.to_ascii_lowercase().contains(&host));
    let portal = |u: &reqwest::Url| elsewhere(u) && sends_back(u);
    let location_elsewhere = headers.get("location").and_then(|l| asked.join(l).ok()).is_some_and(|u| portal(&u));
    let door = match status {
        300..=399 => location_elsewhere,
        // a JSON 401 is the service's own answer (a missing token), not a gate's
        401 => html || location_elsewhere || (headers.get("www-authenticate").is_none() && !json),
        200..=299 => html && (portal(landed) || wants_json),
        _ => false,
    };
    door.then(|| Needed::Door { host, page: asked.to_string() })
}

// ── a gate's bypass: a shared key in a header that skips the sign-in in front ────────────────────────────────────
// A reverse proxy may let a request holding a shared key past its gate (an Authelia bypass for native clients that
// cannot do a browser login). The key is a password to every host behind it, so it is sent only
// where it was meant for: to the hosts named — `abs.example.org` exactly, or `*.example.org` for its subdomains (never
// a look-alike: `evilexample.org`, `example.org.evil.net`) — only over https, and never on with a redirect to
// another host (the callers' clients follow none, or none off the host, when it is sent). Kept in the vault's secrets
// beside the gates' sessions, never shown to a page: listed by its hosts and header name only.

/// One bypass as it is listed: where it is sent and in which header; its value stays in the store.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct Bypass {
    /// `abs.example.org` or `*.example.org` (its subdomains), lowercase, one or more
    pub hosts: Vec<String>,
    /// the header's name (`X-Api-Key`…)
    pub header: String,
}

#[derive(Serialize, Deserialize)]
struct BypassKept {
    #[serde(flatten)]
    rule: Bypass,
    value: String,
}

const BYPASS: &str = "bypass";

/// Whether `pattern` (an exact host, or `*.domain` for its subdomains) names `host`. Never a bare `*`, never a
/// pattern with a wildcard elsewhere.
pub fn host_matches(pattern: &str, host: &str) -> bool {
    let (p, h) = (pattern.trim().trim_end_matches('.').to_ascii_lowercase(), host.trim().trim_end_matches('.').to_ascii_lowercase());
    if h.is_empty() || p.is_empty() {
        return false;
    }
    match p.strip_prefix("*.") {
        Some(domain) => !domain.is_empty() && !domain.contains('*') && h.len() > domain.len() + 1 && h.ends_with(&format!(".{domain}")),
        None => !p.contains('*') && p == h,
    }
}

/// A rule's hosts checked: each an exact host or `*.domain` with at least two labels (`*.org` would name a whole
/// top-level domain), and a header name that is a token.
fn checked(rule: &Bypass) -> Result<Bypass> {
    let bad = |why: String| crate::Error::BadRequest(why);
    let hosts: Vec<String> = rule.hosts.iter().map(|h| h.trim().trim_end_matches('.').to_ascii_lowercase()).filter(|h| !h.is_empty()).collect();
    if hosts.is_empty() {
        return Err(bad("a bypass needs the hosts it is for (abs.example.org, or *.example.org)".into()));
    }
    for h in &hosts {
        let bare = h.strip_prefix("*.").unwrap_or(h);
        let ok = !bare.contains('*') && bare.contains('.') && bare.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.') && !bare.starts_with('.') && !bare.contains("..");
        if !ok {
            return Err(bad(format!("{h:?} is not a host or a *.domain (two labels at least)")));
        }
    }
    let header = rule.header.trim().to_string();
    let reserved = ["cookie", "authorization", "host", "content-length", "transfer-encoding", "connection"];
    if header.is_empty() || !header.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') || reserved.contains(&header.to_ascii_lowercase().as_str()) {
        return Err(bad(format!("{header:?} is not a header name a bypass may use")));
    }
    Ok(Bypass { hosts, header })
}

fn bypasses(store: &Store) -> Result<Vec<BypassKept>> {
    Ok(signins(store)?.get(SECTION, BYPASS)?.and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default())
}

fn keep_bypasses(store: &Store, all: &[BypassKept]) -> Result<()> {
    let store = &signins(store)?;
    if all.is_empty() {
        store.delete(SECTION, BYPASS)?;
        return Ok(());
    }
    store.set(SECTION, BYPASS, &serde_json::to_string(all).map_err(|e| crate::Error::Other(e.into()))?)
}

/// The bypasses kept, without their values.
pub fn bypass_list(store: &Store) -> Result<Vec<Bypass>> {
    Ok(bypasses(store)?.into_iter().map(|b| b.rule).collect())
}

/// Keep a bypass (replacing one with the same header and hosts); `value` empty keeps the old value of that rule.
pub fn bypass_set(store: &Store, rule: &Bypass, value: &str) -> Result<()> {
    let rule = checked(rule)?;
    let mut all = bypasses(store)?;
    let old = all.iter().position(|b| b.rule.header.eq_ignore_ascii_case(&rule.header) && b.rule.hosts == rule.hosts);
    let value = match (value.trim(), old) {
        ("", Some(i)) => all[i].value.clone(),
        ("", None) => return Err(crate::Error::BadRequest("a bypass needs its key".into())),
        (v, _) => v.to_string(),
    };
    if let Some(i) = old {
        all.remove(i);
    }
    all.push(BypassKept { rule, value });
    keep_bypasses(store, &all)
}

/// Forget the bypass sent in `header` to `hosts`; whether there was one.
pub fn bypass_forget(store: &Store, rule: &Bypass) -> Result<bool> {
    let Ok(rule) = checked(rule) else { return Ok(false) };
    let mut all = bypasses(store)?;
    let before = all.len();
    all.retain(|b| !(b.rule.header.eq_ignore_ascii_case(&rule.header) && b.rule.hosts == rule.hosts));
    let gone = all.len() < before;
    keep_bypasses(store, &all)?;
    Ok(gone)
}

/// The bypass header for a request to `url`: its first rule naming the host, over https only.
pub fn bypass_header(store: &Store, url: &reqwest::Url) -> Result<Option<(String, String)>> {
    if url.scheme() != "https" && url.scheme() != "wss" {
        return Ok(None);
    }
    let host = url.host_str().unwrap_or_default();
    Ok(bypasses(store)?.into_iter().find(|b| b.rule.hosts.iter().any(|p| host_matches(p, host))).map(|b| (b.rule.header, b.value)))
}

/// Everything kept for a request to `url` — the gate's session cookie and the bypass header — as the headers to add:
/// the one place every outgoing path asks (plugins' fetch and media, remote vaults, the mirror, the phone's servers).
/// `secret`: one of them is a key that must not follow a redirect off the host (the bypass).
pub struct SiteHeaders {
    pub headers: Vec<(String, String)>,
    pub secret: bool,
}

pub fn site_headers(store: &Store, url: &reqwest::Url) -> Result<SiteHeaders> {
    let mut headers = Vec::new();
    if let Some(c) = cookie_header(store, url)? {
        headers.push(("cookie".to_string(), c));
    }
    let bypass = bypass_header(store, url)?;
    let secret = bypass.is_some();
    headers.extend(bypass);
    Ok(SiteHeaders { headers, secret })
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_sign_ins_are_the_devices_and_a_vaults_old_ones_move_there_once() {
        let sdir = tempfile::tempdir().unwrap();
        let (a, b) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let (va, vb) = (Store::in_dir(sdir.path(), a.path()), Store::in_dir(sdir.path(), b.path()));
        // from before: a vault kept its own sign-in, a key and a plugin secret
        va.set(SECTION, "door.old.example.org", r#"{"at":1,"cookies":[{"name":"s","value":"v","domain":"old.example.org","host_only":true,"path":"/","secure":true,"expires":null}]}"#).unwrap();
        va.set("net", "token", "plugin's own").unwrap();
        // the device already has a newer sign-in to the same host: it wins
        let device = Store::device_in(sdir.path());
        assert!(device.same(&va.device()) && device.same(&vb.device()), "one device store for every vault of the folder");
        bypass_set(&vb, &Bypass { hosts: vec!["atlas.example.org".into()], header: "X-Api-Key".into() }, "k").unwrap();
        // seen from the other vault: the key kept from the first, the old vault's sign-in moved over
        assert_eq!(bypass_list(&va).unwrap().len(), 1, "a key kept in one vault is the device's");
        assert_eq!(list(&vb).unwrap().iter().map(|k| k.host.as_str()).collect::<Vec<_>>(), ["old.example.org"]);
        assert!(va.names(SECTION).unwrap().is_empty(), "moved out of the vault's file");
        assert_eq!(va.get("net", "token").unwrap().as_deref(), Some("plugin's own"), "a plugin's secrets stay the vault's");
        let h = site_headers(&vb, &"https://atlas.example.org/v/notes/".parse().unwrap()).unwrap();
        assert!(h.headers.contains(&("X-Api-Key".to_string(), "k".to_string())));
        // a second vault with an older copy of the same host: the device's entry is kept
        vb.set(SECTION, "door.old.example.org", r#"{"at":0,"cookies":[]}"#).unwrap();
        assert_eq!(list(&vb).unwrap()[0].cookies, 1, "what the device has wins over a vault's leftover");
        assert!(vb.names(SECTION).unwrap().is_empty());
    }

    #[test]
    fn a_bypass_goes_only_to_the_hosts_it_names_over_https() {
        assert!(host_matches("abs.example.org", "ABS.example.org."));
        assert!(host_matches("*.example.org", "abs.example.org") && host_matches("*.example.org", "a.b.example.org"));
        assert!(!host_matches("*.example.org", "example.org"), "*.domain: its subdomains, not the domain itself");
        assert!(!host_matches("*.example.org", "evilexample.org") && !host_matches("*.example.org", "example.org.evil.net"));
        assert!(!host_matches("example.org", "abs.example.org") && !host_matches("*", "abs.example.org") && !host_matches("a*.example.org", "ab.example.org"));
        let (sdir, vault) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let store = Store::in_dir(sdir.path(), vault.path());
        let rule = Bypass { hosts: vec!["*.Example.org".into()], header: "X-Api-Key".into() };
        assert!(bypass_set(&store, &Bypass { hosts: vec!["*.org".into()], header: "X-Api-Key".into() }, "k").is_err(), "a whole top-level domain");
        assert!(bypass_set(&store, &Bypass { hosts: vec!["*".into()], header: "X-Api-Key".into() }, "k").is_err());
        assert!(bypass_set(&store, &Bypass { hosts: vec!["abs.example.org".into()], header: "Cookie".into() }, "k").is_err(), "not a header of the sign-ins'");
        assert!(bypass_set(&store, &rule, "").is_err(), "a new bypass needs its key");
        bypass_set(&store, &rule, "s3cret").unwrap();
        assert_eq!(bypass_list(&store).unwrap(), vec![Bypass { hosts: vec!["*.example.org".into()], header: "X-Api-Key".into() }], "listed without its value");
        let at = |u: &str| bypass_header(&store, &u.parse().unwrap()).unwrap();
        assert_eq!(at("https://abs.example.org/api/me"), Some(("X-Api-Key".into(), "s3cret".into())));
        assert_eq!(at("http://abs.example.org/api/me"), None, "never over plain http");
        assert_eq!(at("https://evilexample.org/"), None);
        assert_eq!(at("https://example.org/"), None);
        let h = site_headers(&store, &"https://abs.example.org/".parse().unwrap()).unwrap();
        assert!(h.secret && h.headers.iter().any(|(n, _)| n == "X-Api-Key"), "a secret: the callers follow no redirect off the host with it");
        bypass_set(&store, &rule, "").unwrap();
        assert_eq!(at("https://abs.example.org/").unwrap().1, "s3cret", "saved again without a value: the key kept");
        assert!(bypass_forget(&store, &rule).unwrap());
        assert_eq!(at("https://abs.example.org/"), None);
    }

    use super::*;

    /// A stand-in gated service: each connection gets the next canned answer.
    fn stand_in(answers: Vec<&'static str>) -> u16 {
        use std::io::{Read, Write};
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for (a, s) in answers.into_iter().zip(l.incoming()) {
                let mut s = s.unwrap();
                let mut buf = [0u8; 4096];
                let _ = s.read(&mut buf);
                let _ = s.write_all(a.as_bytes());
            }
        });
        port
    }

    #[tokio::test]
    async fn the_keep_alive_renews_a_kept_sign_in_and_marks_one_the_gate_refuses() {
        let (sdir, vault) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let store = Store::in_dir(sdir.path(), vault.path());
        let host = "127.0.0.1";
        let old = Cookie { name: "authelia_session".into(), value: "old".into(), domain: host.into(), host_only: true, path: "/".into(), secure: false, expires: None };
        keep(&store, host, vec![old]).unwrap();
        let port = stand_in(vec![
            "HTTP/1.1 200 OK\r\nSet-Cookie: authelia_session=new; Max-Age=3600; Path=/; HttpOnly\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
            "HTTP/1.1 302 Found\r\nLocation: https://auth.example.org/?rd=http%3A%2F%2F127.0.0.1%2F\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        ]);
        let at = format!("http://{host}:{port}/");
        touch_at(&store, host, &at).await.unwrap();
        let k = &list(&store).unwrap()[0];
        assert!(k.renewed.is_some() && !k.ended, "{k:?}");
        assert!(k.expires.is_some_and(|e| e > now() + 3000), "the renewed cookie's end kept: {k:?}");
        let header = cookie_header(&store, &format!("http://{host}/x").parse().unwrap()).unwrap();
        assert_eq!(header.as_deref(), Some("authelia_session=new"), "the gate's fresh value sent from now on");
        // the gate sends the visit to its portal: the session ended, kept to say so
        touch_at(&store, host, &at).await.unwrap();
        let k = &list(&store).unwrap()[0];
        assert!(k.ended, "{k:?}");
    }

    #[test]
    fn a_set_cookie_line_is_read() {
        let c = parse_set_cookie("sid=abc; Domain=.example.org; Path=/app; Secure; Expires=Wed, 21 Oct 2037 07:28:00 GMT", "a.example.org").unwrap();
        assert_eq!((c.name.as_str(), c.value.as_str(), c.domain.as_str(), c.host_only, c.path.as_str(), c.secure), ("sid", "abc", "example.org", false, "/app", true));
        assert_eq!(c.expires, Some(2139722880));
        assert!(parse_set_cookie("no pair here", "h").is_none());
        assert!(parse_set_cookie("sid=x; Domain=bank.example.com", "notes.example.org").is_none(), "another site's domain");
        assert!(parse_set_cookie("sid=x; Domain=ample.org", "notes.example.org").is_none(), "not at a dot");
        assert!(parse_set_cookie("sid=x; Domain=example.org", "notes.example.org:8443").is_some(), "a port is not the host's name");
        // the dashed date a server sends to clear a cookie is read, so the cookie counts as ended
        assert_eq!(parse_set_cookie("sid=deleted; expires=Thu, 01-Jan-1970 00:00:01 GMT", "h").unwrap().expires, Some(1));
        assert_eq!(cookie_date("Sunday, 06-Nov-94 08:49:37 GMT"), Some(784111777));
        assert_eq!(cookie_date("Wed, 21 Oct 2037 07:28:00 GMT"), Some(2139722880));
    }

    fn url(s: &str) -> reqwest::Url {
        s.parse().unwrap()
    }

    fn h(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn a_gate_is_known_by_the_shape_of_its_answer() {
        let api = url("https://links.example.org/api/v1/links");
        let door = Some(Needed::Door { host: "links.example.org".into(), page: api.to_string() });
        // Authelia / Authentik for a browser: 302 to the portal on another host
        assert_eq!(detect(&api, &api, 302, &h(&[("location", "https://auth.example.org/?rd=https%3A%2F%2Flinks.example.org%2F")]), true), door);
        // for an API request: 401 with no challenge the plugin could answer
        assert_eq!(detect(&api, &api, 401, &h(&[]), true), door);
        // the portal reached (its host allowed): a page from elsewhere
        assert_eq!(detect(&api, &url("https://auth.example.org/?rd=https%3A%2F%2Flinks.example.org%2Fapi"), 200, &h(&[("content-type", "text/html; charset=utf-8")]), false), door);
        // HTML where JSON was asked for
        assert_eq!(detect(&api, &api, 200, &h(&[("content-type", "text/html")]), true), door);

        // not a gate: the service's own token check, its own redirect, a JSON answer, a web page asked for as a page
        assert_eq!(detect(&api, &api, 401, &h(&[("www-authenticate", "Bearer realm=\"api\"")]), true), None);
        assert_eq!(detect(&api, &api, 401, &h(&[("content-type", "application/json")]), true), None);
        assert_eq!(detect(&api, &api, 302, &h(&[("location", "/login")]), true), None);
        assert_eq!(detect(&api, &api, 200, &h(&[("content-type", "application/json")]), true), None);
        assert_eq!(detect(&api, &api, 200, &h(&[("content-type", "text/html")]), false), None);
        assert_eq!(detect(&api, &api, 404, &h(&[("content-type", "text/html")]), true), None);
        // a resolver hands the page on: doi.org to the publisher's article, followed or not
        let doi = url("https://doi.org/10.1103/PhysRev.139.A796");
        let html = h(&[("content-type", "text/html")]);
        assert_eq!(detect(&doi, &url("https://journals.aps.org/pr/abstract/10.1103/PhysRev.139.A796"), 200, &html, false), None);
        assert_eq!(detect(&doi, &doi, 302, &h(&[("location", "https://link.aps.org/doi/10.1103/PhysRev.139.A796")]), false), None);
    }

    #[test]
    fn a_kept_sign_in_opens_every_service_behind_the_same_gate_and_only_those() {
        let (vault, sdir) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let store = Store::in_dir(sdir.path(), vault.path());
        let c = |name: &str, domain: &str, host_only: bool, secure: bool, expires: Option<u64>| Cookie { name: name.into(), value: format!("{name}-v"), domain: domain.into(), host_only, path: "/".into(), secure, expires };
        keep(&store, "links.example.org", vec![
            c("authelia_session", ".example.org", false, true, None),
            c("app", "links.example.org", true, false, None),
            c("old", "links.example.org", true, false, Some(1)),
        ])
        .unwrap();

        let header = |u: &str| cookie_header(&store, &url(u)).unwrap();
        assert_eq!(header("https://links.example.org/api").as_deref(), Some("app=app-v; authelia_session=authelia_session-v"));
        assert_eq!(header("https://media.example.org/x").as_deref(), Some("authelia_session=authelia_session-v"), "the gate's domain cookie covers its neighbours");
        assert_eq!(header("http://media.example.org/x"), None, "a secure cookie never goes over plain http");
        assert_eq!(header("https://example.org.evil.com/"), None);
        assert_eq!(header("https://notexample.org/"), None);

        let kept = list(&store).unwrap();
        assert_eq!((kept.len(), kept[0].host.as_str(), kept[0].cookies), (1, "links.example.org", 3));
        // the plugins it goes to: those naming a host it covers — never a lone `*`, never another domain
        let p = |id: &str, net: &[&str]| (id.to_string(), net.iter().map(|s| s.to_string()).collect::<Vec<_>>());
        let users = with_users(&store, &[p("links", &["links.example.org"]), p("media", &["*.example.org"]), p("clipper", &["*"]), p("other", &["other.net"])]).unwrap();
        assert_eq!(users[0].plugins, ["links", "media"]);
        assert!(forget(&store, "links.example.org").unwrap());
        assert_eq!(header("https://links.example.org/api"), None);
    }
}
