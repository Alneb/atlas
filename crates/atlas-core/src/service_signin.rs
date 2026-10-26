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

/// Keep what a sign-in window ended with on `host` (replacing an earlier sign-in there).
pub fn keep(store: &Store, host: &str, cookies: Vec<Cookie>) -> Result<()> {
    let entry = Entry { at: now(), cookies, renewed: None, ended: false };
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
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(std::time::Duration::from_secs(20)).build().map_err(|e| crate::Error::Other(e.into()))?;
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
            "domain" if !v.is_empty() => (c.domain, c.host_only) = (v.trim_start_matches('.').to_string(), false),
            "path" if v.starts_with('/') => c.path = v.to_string(),
            "secure" => c.secure = true,
            "max-age" => max_age = v.parse::<i64>().ok(),
            "expires" => c.expires = chrono::NaiveDateTime::parse_from_str(v, "%a, %d %b %Y %H:%M:%S GMT").ok().map(|t| t.and_utc().timestamp().max(0) as u64),
            _ => {}
        }
    }
    if let Some(m) = max_age {
        c.expires = Some((now() as i64 + m).max(0) as u64);
    }
    Some(c)
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
            "HTTP/1.1 302 Found\r\nLocation: https://auth.example.org/?rd=x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
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
        // the plugins it goes to: those naming a host it covers — never a lone `*`, never another domain
        let p = |id: &str, net: &[&str]| (id.to_string(), net.iter().map(|s| s.to_string()).collect::<Vec<_>>());
        let users = with_users(&store, &[p("links", &["links.example.org"]), p("media", &["*.example.org"]), p("clipper", &["*"]), p("other", &["other.net"])]).unwrap();
        assert_eq!(users[0].plugins, ["links", "media"]);
        assert!(forget(&store, "links.example.org").unwrap());
        assert_eq!(header("https://links.example.org/api"), None);
    }
}
