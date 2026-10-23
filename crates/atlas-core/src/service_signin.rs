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
}

#[derive(Serialize, Deserialize)]
struct Entry {
    at: u64,
    cookies: Vec<Cookie>,
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

/// Keep what a sign-in window ended with on `host` (replacing an earlier sign-in there).
pub fn keep(store: &Store, host: &str, cookies: Vec<Cookie>) -> Result<()> {
    let entry = Entry { at: now(), cookies };
    store.set(SECTION, &key(host), &serde_json::to_string(&entry).map_err(|e| crate::Error::Other(e.into()))?)
}

pub fn forget(store: &Store, host: &str) -> Result<bool> {
    store.delete(SECTION, &key(host))
}

fn entries(store: &Store) -> Result<Vec<(String, Entry)>> {
    let mut out = Vec::new();
    for name in store.names(SECTION)? {
        let (Some(host), Some(raw)) = (name.strip_prefix("door."), store.get(SECTION, &name)?) else { continue };
        if let Ok(e) = serde_json::from_str::<Entry>(&raw) {
            out.push((host.to_string(), e));
        }
    }
    Ok(out)
}

pub fn list(store: &Store) -> Result<Vec<Kept>> {
    Ok(entries(store)?.into_iter().map(|(host, e)| Kept { host, at: e.at, cookies: e.cookies.len() }).collect())
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
/// - a redirect (not followed: another host) or an answer from another host that is a page → a gate's portal;
/// - 401 with no `WWW-Authenticate` challenge the plugin could answer itself (Basic, Bearer…), or with a page;
/// - a page where JSON was asked for.
pub fn detect(asked: &reqwest::Url, landed: &reqwest::Url, status: u16, headers: &BTreeMap<String, String>, wants_json: bool) -> Option<Needed> {
    let host = asked.host_str()?.to_ascii_lowercase();
    let kind = headers.get("content-type").map(|t| t.to_ascii_lowercase()).unwrap_or_default();
    let (html, json) = (kind.contains("text/html"), kind.contains("json"));
    let elsewhere = |u: &reqwest::Url| u.host_str().is_some_and(|h| !h.eq_ignore_ascii_case(&host));
    let location_elsewhere = headers.get("location").and_then(|l| asked.join(l).ok()).is_some_and(|u| elsewhere(&u));
    let door = match status {
        300..=399 => location_elsewhere,
        // a JSON 401 is the service's own answer (a missing token), not a gate's
        401 => html || location_elsewhere || (headers.get("www-authenticate").is_none() && !json),
        200..=299 => html && (elsewhere(landed) || wants_json),
        _ => false,
    };
    door.then(|| Needed::Door { host, page: asked.to_string() })
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(detect(&api, &url("https://auth.example.org/"), 200, &h(&[("content-type", "text/html; charset=utf-8")]), false), door);
        // HTML where JSON was asked for
        assert_eq!(detect(&api, &api, 200, &h(&[("content-type", "text/html")]), true), door);

        // not a gate: the service's own token check, its own redirect, a JSON answer, a web page asked for as a page
        assert_eq!(detect(&api, &api, 401, &h(&[("www-authenticate", "Bearer realm=\"api\"")]), true), None);
        assert_eq!(detect(&api, &api, 401, &h(&[("content-type", "application/json")]), true), None);
        assert_eq!(detect(&api, &api, 302, &h(&[("location", "/login")]), true), None);
        assert_eq!(detect(&api, &api, 200, &h(&[("content-type", "application/json")]), true), None);
        assert_eq!(detect(&api, &api, 200, &h(&[("content-type", "text/html")]), false), None);
        assert_eq!(detect(&api, &api, 404, &h(&[("content-type", "text/html")]), true), None);
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
        assert!(forget(&store, "links.example.org").unwrap());
        assert_eq!(header("https://links.example.org/api"), None);
    }
}
