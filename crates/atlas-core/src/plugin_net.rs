//! The network, for plugins: `atlas.fetch(url, init)` is a request made here, by the core, on the
//! plugin's behalf (docs/guides/PLUGINS.md "v4"). Why here and not in the page: no CORS; a timeout and a
//! size limit; **only the hosts the plugin's manifest lists** (`[permissions] net = [...]`); and a
//! header may name a secret instead of carrying it, so a token never has to exist in the page.
use crate::plugins::{self, Permissions};
use crate::secrets::Store;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io::Read;
use std::path::Path;
use std::time::Duration;
use ts_rs::TS;

const DEFAULT_TIMEOUT: u64 = 30;
const MAX_TIMEOUT: u64 = 300;
/// More than this is not read: a plugin wanting a big file asks for `save_to`.
const MAX_TEXT: u64 = 8 * 1024 * 1024;
const MAX_FILE: u64 = 512 * 1024 * 1024;

/// A header's value: the text itself, a secret of the plugin, or one of its OpenID sign-ins (`plugin_oauth`) as
/// `Bearer <access token>` — the last two filled in by the core.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(untagged)]
#[ts(export)]
pub enum HeaderValue {
    Text(String),
    Secret {
        secret: String,
        /// Written before the secret (`"Bearer "`).
        #[serde(default)]
        prefix: String,
    },
    /// `{ oauth: "authelia" }`: the plugin's sign-in of that name (`atlas.oauth.signIn`), renewed when needed.
    Oauth { oauth: String },
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct FetchRequest {
    pub url: String,
    #[serde(default)]
    #[ts(optional)]
    pub method: Option<String>,
    #[serde(default)]
    pub headers: BTreeMap<String, HeaderValue>,
    #[serde(default)]
    #[ts(optional)]
    pub body: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub timeout_secs: Option<u64>,
    /// Write the answer's body to this file of the plugin's cache (`.atlas/cache/plugins/<id>/<save_to>`)
    /// instead of returning it as text: pictures, PDFs, anything large. The path comes back in `saved`.
    #[serde(default)]
    #[ts(optional)]
    pub save_to: Option<String>,
    /// Where `save_to` is: the cache (default) or the local copies of remote files.
    #[serde(default)]
    #[ts(optional)]
    pub save_in: Option<SaveIn>,
    /// Send this vault file's bytes as the body (an upload; any file type) instead of `body`.
    #[serde(default)]
    #[ts(optional)]
    pub body_file: Option<String>,
    /// A form (`application/x-www-form-urlencoded`) instead of `body`, its fields text or a secret of the plugin filled
    /// in here — for a service that wants its key as a form field (FreshRSS's Fever API), so the key never reaches a page.
    #[serde(default)]
    #[ts(optional)]
    pub form: Option<BTreeMap<String, HeaderValue>>,
    /// One try among several (a paper's copies, best first): a sign-in met is answered in `signin` but not offered
    /// to the user — the plugin asks again without `quiet` if no other try worked.
    #[serde(default)]
    #[ts(optional)]
    pub quiet: Option<bool>,
}

/// The folders a plugin's `save_to` may write into.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum SaveIn {
    /// `.atlas/cache/plugins/<id>/`: thumbnails, covers, anything the plugin can fetch again.
    #[default]
    Cache,
    /// `.atlas/remote/<id>/`: the local copy of a remote file, opened in the editor and saved back
    /// (ui lib/file-sources.svelte.ts). Out of the vault's git, its search and `[[`.
    Remote,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct FetchResponse {
    pub status: u16,
    pub ok: bool,
    /// Lower-case names.
    pub headers: BTreeMap<String, String>,
    /// The body as text (empty with `save_to`).
    pub text: String,
    /// The vault-relative path the body was written to (`save_to`).
    #[ts(optional)]
    pub saved: Option<String>,
    /// The address answered from, after redirects.
    pub url: String,
    /// A sign-in stands in front of the service (a gate's portal where the service was asked): the answer is the
    /// gate's, not the service's. The page offers the sign-in; a helper passes this on as its own answer.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub signin: Option<crate::service_signin::Needed>,
}

/// Is `host` one the manifest lists? `example.org` is that host only; `*.example.org` is any
/// host under it (not `example.org` itself); `*` alone is any host at all — what a web clipper
/// needs, and what Settings then says in so many words. Compared without case.
pub fn host_allowed(allowed: &[String], host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty() {
        return false;
    }
    allowed.iter().map(|a| a.trim().to_ascii_lowercase()).any(|a| a == "*" || match a.strip_prefix("*.") {
        Some(base) => host.len() > base.len() + 1 && host.ends_with(base) && host.as_bytes()[host.len() - base.len() - 1] == b'.',
        None => host == a,
    })
}

/// Is `host` named by the manifest itself (exactly or under a `*.`)? A lone `*` reaches every host but is not trusted
/// with the user's sign-ins: those go only to hosts the plugin lists.
fn host_named(allowed: &[String], host: &str) -> bool {
    let named: Vec<String> = allowed.iter().filter(|a| a.trim() != "*").cloned().collect();
    host_allowed(&named, host)
}

/// The request's address, if the plugin may go there.
pub(crate) fn checked_url(perm: &Permissions, id: &str, url: &str) -> Result<reqwest::Url> {
    let u = reqwest::Url::parse(url).map_err(|e| Error::BadRequest(format!("fetch: {url:?}: {e}")))?;
    if !matches!(u.scheme(), "http" | "https") {
        return Err(Error::BadRequest(format!("fetch: only http and https ({url})")));
    }
    let host = u.host_str().unwrap_or_default();
    if !host_allowed(&perm.net, host) {
        return Err(Error::BadRequest(format!(
            "fetch: plugin {id} may not reach {host} — list it in its plugin.toml: [permissions] net = [\"{host}\"]"
        )));
    }
    Ok(u)
}

/// Where `save_to` lands: inside the plugin's own cache or remote-copies folder, nowhere else.
fn save_path(root: &Path, id: &str, save_to: &str, into: SaveIn) -> Result<(std::path::PathBuf, String)> {
    let clean = save_to.trim().trim_start_matches('/');
    if clean.is_empty() || clean.split('/').any(|p| p.is_empty() || p == "." || p == "..") {
        return Err(Error::BadPath(format!("save_to: {save_to:?}")));
    }
    let rel = match into {
        SaveIn::Cache => format!(".atlas/cache/plugins/{id}/{clean}"),
        SaveIn::Remote => {
            remote_ignored(root)?;
            format!("{REMOTE}/{id}/{clean}")
        }
    };
    Ok((crate::paths::safe_join(root, &rel)?, rel))
}

/// The local copies of remote files (every plugin's): `.atlas/remote/<plugin>/<place>/<path>`.
pub const REMOTE: &str = ".atlas/remote";

/// Copies of remote files are not the vault's history: the folder carries a `.gitignore` of its own.
fn remote_ignored(root: &Path) -> Result<()> {
    let ignore = root.join(REMOTE).join(".gitignore");
    if !ignore.exists() {
        crate::vault_write::write(&ignore, "# local copies of remote files (SSH, copyparty…): not part of the vault's history\n*\n".as_bytes())?;
    }
    Ok(())
}

/// One request for plugin `id`. Blocking: call it from a blocking task.
/// A header's or a form field's value: its text, or the plugin's secret (or OpenID token) filled in here, by the core.
pub(crate) fn header_value(perm: &Permissions, secrets: &Store, id: &str, v: &HeaderValue) -> Result<String> {
    match v {
        HeaderValue::Text(t) => Ok(t.clone()),
        HeaderValue::Secret { secret, prefix } => {
            if !perm.secrets {
                return Err(Error::BadRequest(format!("fetch: plugin {id} uses a secret without [permissions] secrets = true")));
            }
            let v = secrets.get(id, secret)?.ok_or_else(|| Error::BadRequest(format!("fetch: plugin {id} has no secret {secret:?} (set it in its settings)")))?;
            Ok(format!("{prefix}{v}"))
        }
        HeaderValue::Oauth { oauth } => {
            if !perm.secrets {
                return Err(Error::BadRequest(format!("fetch: plugin {id} uses a sign-in without [permissions] secrets = true")));
            }
            Ok(format!("Bearer {}", crate::plugin_oauth::access_token(secrets, id, oauth)?))
        }
    }
}

/// A kept sign-in (a gate's cookie) for this address, when the plugin names its host and brings no cookie of its own.
pub(crate) fn kept_cookie(perm: &Permissions, secrets: &Store, url: &reqwest::Url, headers: &BTreeMap<String, HeaderValue>) -> Result<Option<String>> {
    if !host_named(&perm.net, url.host_str().unwrap_or_default()) || headers.keys().any(|n| n.eq_ignore_ascii_case("cookie")) {
        return Ok(None);
    }
    crate::service_signin::cookie_header(secrets, url)
}

pub fn fetch(root: &Path, secrets: &Store, id: &str, req: &FetchRequest) -> Result<FetchResponse> {
    let perm = plugins::permissions(root, id)?;
    let url = checked_url(&perm, id, &req.url)?;
    let method = reqwest::Method::from_bytes(req.method.as_deref().unwrap_or("GET").to_ascii_uppercase().as_bytes())
        .map_err(|_| Error::BadRequest(format!("fetch: method {:?}", req.method)))?;
    let allowed = perm.net.clone();
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(req.timeout_secs.unwrap_or(DEFAULT_TIMEOUT).clamp(1, MAX_TIMEOUT)))
        .user_agent(concat!("Atlas/", env!("CARGO_PKG_VERSION"), " (plugin)"))
        // a redirect is followed only to a host the plugin may reach: an allowed host cannot hand it on to another
        .redirect(reqwest::redirect::Policy::custom(move |a| {
            if a.previous().len() >= 8 || !host_allowed(&allowed, a.url().host_str().unwrap_or_default()) {
                a.stop()
            } else {
                a.follow()
            }
        }))
        .build()
        .map_err(|e| Error::Other(e.into()))?;
    let asked = url.clone();
    // the OpenID sign-in a header asks for (`{ oauth: name }`): made silently when it can be, else said before anything is sent
    let oauth = req.headers.values().find_map(|v| match v {
        HeaderValue::Oauth { oauth } => Some(oauth.clone()),
        _ => None,
    });
    let token_needed = |name: &str| crate::service_signin::Needed::Token { host: asked.host_str().unwrap_or_default().to_ascii_lowercase(), name: name.into(), page: asked.to_string() };
    if let Some(name) = oauth.as_deref().filter(|_| perm.secrets) {
        if !crate::plugin_oauth::ready(root, secrets, id, name, asked.as_str())? {
            return Ok(FetchResponse { status: 401, ok: false, headers: BTreeMap::new(), text: String::new(), saved: None, url: asked.to_string(), signin: Some(token_needed(name)) });
        }
    }
    let mut call = client.request(method, url);
    let wants_json = req.headers.iter().any(|(n, v)| n.eq_ignore_ascii_case("accept") && matches!(v, HeaderValue::Text(t) if t.contains("json")));
    // a kept sign-in to this site (a gate's cookie), unless the plugin brings cookies of its own
    if let Some(c) = kept_cookie(&perm, secrets, &asked, &req.headers)? {
        call = call.header("cookie", c);
    }
    let value = |v: &HeaderValue| header_value(&perm, secrets, id, v);
    for (name, v) in &req.headers {
        call = call.header(name.as_str(), value(v)?);
    }
    if let Some(file) = &req.body_file {
        let path = crate::paths::safe_join(root, file)?;
        if std::fs::metadata(&path)?.len() > MAX_FILE {
            return Err(Error::TooLarge(format!("fetch: body_file more than {} MB", MAX_FILE / 1024 / 1024)));
        }
        call = call.body(std::fs::read(path)?);
    } else if let Some(form) = &req.form {
        let pairs = form.iter().map(|(k, v)| Ok((k.clone(), value(v)?))).collect::<Result<Vec<(String, String)>>>()?;
        call = call.form(&pairs); // url-encoded, with its content type
    } else if let Some(body) = &req.body {
        call = call.body(body.clone());
    }
    let res = call.send().map_err(|e| Error::BadRequest(format!("fetch: {}", e.without_url())))?;
    let status = res.status();
    let headers: BTreeMap<String, String> = res.headers().iter().map(|(k, v)| (k.as_str().to_string(), String::from_utf8_lossy(v.as_bytes()).into_owned())).collect();
    let bearer = status.as_u16() == 401 && headers.get("www-authenticate").is_some_and(|c| c.to_ascii_lowercase().contains("bearer"));
    let signin = match (&oauth, bearer) {
        (Some(name), true) => Some(token_needed(name)), // the token was refused: sign in again
        _ => crate::service_signin::detect(&asked, res.url(), status.as_u16(), &headers, wants_json),
    };
    let final_url = res.url().to_string();
    if signin.is_some() {
        // the gate's page, not what was asked for: nothing is saved, nothing read
        return Ok(FetchResponse { status: status.as_u16(), ok: false, headers, text: String::new(), saved: None, url: final_url, signin });
    }
    let (text, saved) = match req.save_to.as_deref() {
        Some(to) => {
            let (abs, rel) = save_path(root, id, to, req.save_in.unwrap_or_default())?;
            // streamed into a temporary file: one too large never replaces what was there
            crate::vault_write::write_with(&abs, |out| {
                if std::io::copy(&mut res.take(MAX_FILE + 1), out)? > MAX_FILE {
                    return Err(Error::TooLarge(format!("fetch: more than {} MB", MAX_FILE / 1024 / 1024)));
                }
                Ok(())
            })?;
            (String::new(), Some(rel))
        }
        None => {
            let mut bytes = Vec::new();
            res.take(MAX_TEXT + 1).read_to_end(&mut bytes)?;
            if bytes.len() as u64 > MAX_TEXT {
                return Err(Error::TooLarge(format!("fetch: more than {} MB — ask for save_to", MAX_TEXT / 1024 / 1024)));
            }
            (String::from_utf8_lossy(&bytes).into_owned(), None)
        }
    };
    Ok(FetchResponse { status: status.as_u16(), ok: status.is_success(), headers, text, saved, url: final_url, signin })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};

    #[test]
    fn hosts_are_matched_exactly_or_under_a_star() {
        let list = ["links.example.org".to_string(), "*.arxiv.org".to_string()];
        assert!(host_allowed(&list, "links.example.org") && host_allowed(&list, "LINKS.example.org."));
        assert!(host_allowed(&list, "export.arxiv.org") && host_allowed(&list, "a.b.arxiv.org"));
        assert!(!host_allowed(&list, "arxiv.org"), "the star is for hosts under it");
        assert!(!host_allowed(&list, "evilarxiv.org") && !host_allowed(&list, "example.org") && !host_allowed(&list, "links.example.org.evil.com"));
        assert!(!host_allowed(&[], "anything.org"));
        assert!(host_allowed(&["*".to_string()], "anything.org") && !host_allowed(&["*".to_string()], ""), "a lone star is every host");
    }

    /// A one-request HTTP server on a free local port: answers what it is told and hands back what it was sent.
    fn serve_once(answer: &'static str) -> (u16, std::thread::JoinHandle<String>) {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let t = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let mut seen = String::new();
            let mut r = BufReader::new(s.try_clone().unwrap());
            loop {
                let mut line = String::new();
                if r.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                    break;
                }
                seen.push_str(&line);
            }
            // the body, when there is one, follows the headers
            let len = seen.lines().find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|n| n.trim().parse::<usize>().unwrap())).unwrap_or(0);
            let mut body = vec![0; len];
            r.read_exact(&mut body).unwrap();
            seen.push_str(&String::from_utf8_lossy(&body));
            s.write_all(answer.as_bytes()).unwrap();
            seen
        });
        (port, t)
    }

    fn plugin(root: &Path, toml: &str) {
        let d = root.join(".atlas/plugins/net");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("plugin.toml"), toml).unwrap();
    }

    #[test]
    fn a_plugin_reaches_only_the_hosts_it_declared_and_its_secret_is_filled_in_by_the_core() {
        let (vault, sdir) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let secrets = Store::in_dir(sdir.path(), vault.path());
        secrets.set("net", "token", "tok-123").unwrap();
        let req = |url: String, save_to: Option<&str>| FetchRequest {
            url,
            method: None,
            quiet: None,
            headers: BTreeMap::from([("Authorization".to_string(), HeaderValue::Secret { secret: "token".into(), prefix: "Bearer ".into() }), ("X-Plain".to_string(), HeaderValue::Text("yes".into()))]),
            body: None,
            timeout_secs: Some(5),
            save_to: save_to.map(Into::into),
            save_in: None,
            body_file: None,
            form: None,
        };

        // not declared: refused before anything is sent, with the line to add
        plugin(vault.path(), "title = \"Net\"\n");
        let e = fetch(vault.path(), &secrets, "net", &req("http://127.0.0.1:9/x".into(), None)).unwrap_err().to_string();
        assert!(e.contains("may not reach 127.0.0.1") && e.contains("[permissions] net"), "{e}");

        // declared, but the secret is not: refused
        plugin(vault.path(), "title = \"Net\"\n[permissions]\nnet = [\"127.0.0.1\"]\n");
        let e = fetch(vault.path(), &secrets, "net", &req("http://127.0.0.1:9/x".into(), None)).unwrap_err().to_string();
        assert!(e.contains("secrets = true"), "{e}");

        plugin(vault.path(), "title = \"Net\"\n[permissions]\nnet = [\"127.0.0.1\"]\nsecrets = true\n");
        let (port, server) = serve_once("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}");
        let r = fetch(vault.path(), &secrets, "net", &req(format!("http://127.0.0.1:{port}/api?q=1"), None)).unwrap();
        assert_eq!((r.status, r.ok, r.text.as_str(), r.headers["content-type"].as_str()), (200, true, "{\"ok\":true}", "application/json"));
        let sent = server.join().unwrap().to_ascii_lowercase();
        assert!(sent.starts_with("get /api?q=1 ") && sent.contains("authorization: bearer tok-123") && sent.contains("x-plain: yes"), "{sent}");

        // a body saved to the plugin's cache folder — and nowhere else
        let (port, server) = serve_once("HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\n\u{1}\u{2}\u{3}\u{4}");
        let r = fetch(vault.path(), &secrets, "net", &req(format!("http://127.0.0.1:{port}/p.bin"), Some("covers/p.bin"))).unwrap();
        server.join().unwrap();
        assert_eq!(r.saved.as_deref(), Some(".atlas/cache/plugins/net/covers/p.bin"));
        assert_eq!(std::fs::read(vault.path().join(".atlas/cache/plugins/net/covers/p.bin")).unwrap(), [1, 2, 3, 4]);
        assert!(fetch(vault.path(), &secrets, "net", &req("http://127.0.0.1:9/x".into(), Some("../../config.toml"))).is_err());
        assert!(fetch(vault.path(), &secrets, "net", &req("file:///etc/passwd".into(), None)).is_err());

        // a remote file's local copy: in .atlas/remote/<id>/, which keeps out of the vault's git
        let (port, server) = serve_once("HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nabc");
        let r = fetch(vault.path(), &secrets, "net", &FetchRequest { save_in: Some(SaveIn::Remote), ..req(format!("http://127.0.0.1:{port}/a.txt"), Some("srv/dir/a.txt")) }).unwrap();
        server.join().unwrap();
        assert_eq!(r.saved.as_deref(), Some(".atlas/remote/net/srv/dir/a.txt"));
        assert!(std::fs::read_to_string(vault.path().join(".atlas/remote/.gitignore")).unwrap().contains("\n*\n"));

        // and sent back as a body, bytes as they are
        std::fs::write(vault.path().join(".atlas/remote/net/srv/dir/a.txt"), b"new \x00 bytes").unwrap();
        let (port, server) = serve_once("HTTP/1.1 201 Created\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        let up = FetchRequest { method: Some("PUT".into()), body_file: Some(".atlas/remote/net/srv/dir/a.txt".into()), ..req(format!("http://127.0.0.1:{port}/dir/a.txt"), None) };
        assert_eq!(fetch(vault.path(), &secrets, "net", &up).unwrap().status, 201);
        let sent = server.join().unwrap();
        assert!(sent.starts_with("PUT /dir/a.txt ") && sent.ends_with("new \0 bytes"), "{sent:?}");
        assert!(fetch(vault.path(), &secrets, "net", &FetchRequest { body_file: Some("../outside".into()), ..req("http://127.0.0.1:9/x".into(), None) }).is_err());

        // a form whose key field is the plugin's secret, filled in here (FreshRSS's Fever API): never in a page
        let (port, server) = serve_once("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
        let form = BTreeMap::from([("api_key".to_string(), HeaderValue::Secret { secret: "token".into(), prefix: String::new() }), ("q".to_string(), HeaderValue::Text("a b&c".into()))]);
        let post = FetchRequest { method: Some("POST".into()), headers: BTreeMap::new(), form: Some(form), ..req(format!("http://127.0.0.1:{port}/fever"), None) };
        assert_eq!(fetch(vault.path(), &secrets, "net", &post).unwrap().status, 200);
        let sent = server.join().unwrap();
        assert!(sent.to_ascii_lowercase().contains("content-type: application/x-www-form-urlencoded"), "{sent}");
        assert!(sent.ends_with("api_key=tok-123&q=a+b%26c"), "{sent}");
    }

    #[test]
    fn a_missing_or_refused_openid_sign_in_is_reported_for_the_page_to_offer() {
        let (vault, sdir) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let secrets = Store::in_dir(sdir.path(), vault.path());
        plugin(vault.path(), "title = \"Net\"\n[permissions]\nnet = [\"127.0.0.1\"]\nsecrets = true\n");
        let req = |port: u16| FetchRequest {
            url: format!("http://127.0.0.1:{port}/api/items"),
            method: None,
            quiet: None,
            headers: BTreeMap::from([("Authorization".to_string(), HeaderValue::Oauth { oauth: "svc".into() })]),
            body: None,
            timeout_secs: Some(5),
            save_to: None,
            save_in: None,
            body_file: None,
            form: None,
        };
        let token = |port: u16| Some(crate::service_signin::Needed::Token { host: "127.0.0.1".into(), name: "svc".into(), page: format!("http://127.0.0.1:{port}/api/items") });

        // not signed in yet: said before anything is sent (port 9 is never asked)
        let r = fetch(vault.path(), &secrets, "net", &req(9)).unwrap();
        assert_eq!((r.status, r.ok, r.signin), (401, false, token(9)));

        // signed in, but the service refuses the token with a Bearer challenge: sign in again
        secrets.set("net", "oauth.svc", r#"{"access":"acc-1","token_endpoint":"http://127.0.0.1:9/token","client_id":"atlas"}"#).unwrap();
        let (port, server) = serve_once("HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Bearer error=\"invalid_token\"\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
        let r = fetch(vault.path(), &secrets, "net", &req(port)).unwrap();
        assert!(server.join().unwrap().to_ascii_lowercase().contains("authorization: bearer acc-1"));
        assert_eq!(r.signin, token(port));

        // ended with no refresh token: as good as none
        secrets.set("net", "oauth.svc", r#"{"access":"old","expires":1,"token_endpoint":"http://127.0.0.1:9/token","client_id":"atlas"}"#).unwrap();
        assert_eq!(fetch(vault.path(), &secrets, "net", &req(9)).unwrap().signin, token(9));
        secrets.set("net", "oauth.svc", r#"{"access":"acc-1","token_endpoint":"http://127.0.0.1:9/token","client_id":"atlas"}"#).unwrap();

        // accepted: an answer, no sign-in
        let (port, server) = serve_once("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n[]");
        let r = fetch(vault.path(), &secrets, "net", &req(port)).unwrap();
        server.join().unwrap();
        assert_eq!((r.ok, r.signin, r.text.as_str()), (true, None, "[]"));
    }

    #[test]
    fn a_gate_in_front_is_reported_and_its_kept_sign_in_is_sent_only_to_plugins_that_name_the_host() {
        let (vault, sdir) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let secrets = Store::in_dir(sdir.path(), vault.path());
        plugin(vault.path(), "title = \"Net\"\n[permissions]\nnet = [\"127.0.0.1\"]\n");
        let req = |port: u16| FetchRequest {
            url: format!("http://127.0.0.1:{port}/api/links"),
            method: None,
            quiet: None,
            headers: BTreeMap::from([("Accept".to_string(), HeaderValue::Text("application/json".into()))]),
            body: None,
            timeout_secs: Some(5),
            save_to: Some("never.json".into()),
            save_in: None,
            body_file: None,
            form: None,
        };

        // the gate sends an API request to its portal on another host: a sign-in, not an answer — and nothing saved
        let (port, server) = serve_once("HTTP/1.1 302 Found\r\nLocation: https://auth.example.org/?rd=x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        let r = fetch(vault.path(), &secrets, "net", &req(port)).unwrap();
        let sent = server.join().unwrap().to_ascii_lowercase();
        assert!(!sent.contains("cookie:"), "nothing kept yet: {sent}");
        assert_eq!(r.signin, Some(crate::service_signin::Needed::Door { host: "127.0.0.1".into(), page: format!("http://127.0.0.1:{port}/api/links") }));
        assert!(!r.ok && r.saved.is_none() && !vault.path().join(".atlas/cache/plugins/net/never.json").exists());

        // signed in (the desktop's window kept the gate's cookie): the next request carries it and is answered
        let cookie = crate::service_signin::Cookie { name: "authelia_session".into(), value: "s3cr3t".into(), domain: "127.0.0.1".into(), host_only: true, path: "/".into(), secure: false, expires: None };
        crate::service_signin::keep(&secrets, "127.0.0.1", vec![cookie]).unwrap();
        let (port, server) = serve_once("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n[]");
        let r = fetch(vault.path(), &secrets, "net", &FetchRequest { save_to: None, ..req(port) }).unwrap();
        assert!(server.join().unwrap().to_ascii_lowercase().contains("cookie: authelia_session=s3cr3t"));
        assert_eq!((r.ok, r.signin, r.text.as_str()), (true, None, "[]"));

        // a plugin that may reach every host (`*`) is not trusted with the user's sign-ins
        plugin(vault.path(), "title = \"Net\"\n[permissions]\nnet = [\"*\"]\n");
        let (port, server) = serve_once("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        fetch(vault.path(), &secrets, "net", &FetchRequest { save_to: None, ..req(port) }).unwrap();
        assert!(!server.join().unwrap().to_ascii_lowercase().contains("cookie:"));
    }
}
