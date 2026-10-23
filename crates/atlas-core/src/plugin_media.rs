//! A plugin's media — an audiobook, a film, a podcast — played by the page from a server that wants the plugin's secret
//! on every request (Audiobookshelf's token), without the secret ever reaching the page (docs/design/DESIGN-audiobooks.md;
//! PLUGIN-API.md `atlas.media`). The plugin asks for an address (`POST /api/plugins/<id>/media`): the core checks the
//! address against the plugin's `[permissions] net`, fills its headers in (secrets, a kept sign-in's cookie) and keeps
//! them in memory under a random ticket; `<audio src>` then asks `/media/<ticket>`, which the core answers by asking the
//! server with those headers, the page's `Range` passed through (seeking) and the bytes streamed as they come.
use crate::plugin_net::{self, HeaderValue};
use crate::secrets::Store;
use crate::{plugins, Result};
use axum::body::Body;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// What a plugin asks to play: the address and its headers (a secret named, filled in here).
#[derive(Debug, Clone, Deserialize)]
pub struct MediaRequest {
    pub url: String,
    #[serde(default)]
    pub headers: BTreeMap<String, HeaderValue>,
}

/// The page's address for it (`/media/<ticket>`, under the vault's prefix).
#[derive(Debug, Clone, Serialize)]
pub struct MediaAddress {
    pub src: String,
    /// The ticket alone: a page reached through the desktop's bridge (`/remote/<host>/…`) builds the address on its base.
    pub ticket: String,
}

/// An address the core will ask, with the headers it was given (secrets in), for whom, since when.
struct Ticket {
    plugin: String,
    url: reqwest::Url,
    headers: Vec<(String, String)>,
    made: Instant,
}

/// A ticket lasts a day (a long audiobook is played over hours, paused, taken up again); a few hundred at most.
const LIFE: Duration = Duration::from_secs(24 * 3600);
const MAX: usize = 512;

/// The tickets of a vault's core (in memory: a restart asks again, the page does it when playing fails).
#[derive(Default)]
pub struct Media {
    tickets: Mutex<HashMap<String, Ticket>>,
}

/// What the page's request may pass on to the server: its place and what it accepts, nothing of the page's own.
const PASS: [&str; 3] = ["range", "if-range", "accept"];
/// What the server's answer may bring back: what a media element reads, nothing that sets anything on the page.
const BACK: [&str; 7] = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag", "cache-control"];

impl Media {
    /// The plugin's request checked and filled in; its ticket.
    pub fn prepare(&self, root: &Path, secrets: &Store, id: &str, req: &MediaRequest) -> Result<String> {
        let perm = plugins::permissions(root, id)?;
        let url = plugin_net::checked_url(&perm, id, &req.url)?;
        let mut headers = Vec::new();
        for (name, v) in &req.headers {
            headers.push((name.clone(), plugin_net::header_value(&perm, secrets, id, v)?));
        }
        if let Some(c) = plugin_net::kept_cookie(&perm, secrets, &url, &req.headers)? {
            headers.push(("cookie".into(), c));
        }
        let ticket = crate::auth::random_hex(16);
        let mut all = self.tickets.lock().unwrap_or_else(|e| e.into_inner());
        all.retain(|_, t| t.made.elapsed() < LIFE);
        if all.len() >= MAX {
            if let Some(oldest) = all.iter().min_by_key(|(_, t)| t.made).map(|(k, _)| k.clone()) {
                all.remove(&oldest);
            }
        }
        all.insert(ticket.clone(), Ticket { plugin: id.into(), url, headers, made: Instant::now() });
        Ok(ticket)
    }

    /// Who a ticket plays for (None: unknown or run out).
    pub fn plugin_of(&self, ticket: &str) -> Option<String> {
        let all = self.tickets.lock().unwrap_or_else(|e| e.into_inner());
        all.get(ticket).filter(|t| t.made.elapsed() < LIFE).map(|t| t.plugin.clone())
    }

    /// The server's answer to the page's request for `ticket`, streamed.
    pub async fn play(&self, ticket: &str, page: &HeaderMap) -> Response {
        let found = {
            let all = self.tickets.lock().unwrap_or_else(|e| e.into_inner());
            all.get(ticket).filter(|t| t.made.elapsed() < LIFE).map(|t| (t.url.clone(), t.headers.clone()))
        };
        let Some((url, headers)) = found else {
            return (StatusCode::NOT_FOUND, "this media address ran out: play it again").into_response();
        };
        let mut req = client().get(url).header("accept-encoding", "identity");
        for (k, v) in &headers {
            req = req.header(k.as_str(), v.as_str());
        }
        for k in PASS {
            if let Some(v) = page.get(k) {
                req = req.header(k, v.as_bytes());
            }
        }
        let res = match req.send().await {
            Ok(r) => r,
            Err(e) => return (StatusCode::BAD_GATEWAY, format!("the server did not answer: {}", e.without_url())).into_response(),
        };
        if res.status().is_redirection() {
            return (StatusCode::UNAUTHORIZED, "the server asks for a sign-in").into_response();
        }
        let mut out = Response::builder().status(res.status().as_u16());
        for (k, v) in res.headers() {
            if BACK.contains(&k.as_str()) {
                out = out.header(k.as_str(), v.as_bytes());
            }
        }
        out.body(Body::from_stream(res.bytes_stream())).unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
    }
}

fn client() -> &'static reqwest::Client {
    static C: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(concat!("Atlas/", env!("CARGO_PKG_VERSION"), " (plugin media)"))
            .connect_timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none()) // a redirect is a sign-in in front: said, never followed
            .build()
            .expect("a client")
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn plugin(vault: &Path, toml: &str) {
        let d = vault.join(".atlas/plugins/abs");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("plugin.toml"), toml).unwrap();
    }

    /// A server answering one request: what it was asked (its headers), a 206 with the bytes of the range asked.
    fn server() -> (u16, std::sync::mpsc::Receiver<String>) {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let mut buf = [0u8; 4096];
            let n = s.read(&mut buf).unwrap();
            let asked = String::from_utf8_lossy(&buf[..n]).to_string();
            tx.send(asked).unwrap();
            let body = b"0123456789";
            write!(s, "HTTP/1.1 206 Partial Content\r\nContent-Type: audio/mpeg\r\nContent-Range: bytes 2-11/100\r\nContent-Length: {}\r\nSet-Cookie: x=1\r\n\r\n", body.len()).unwrap();
            s.write_all(body).unwrap();
        });
        (port, rx)
    }

    #[tokio::test]
    async fn a_plugins_media_is_played_with_its_secret_which_the_page_never_sees() {
        let vault = tempfile::tempdir().unwrap();
        let sdir = tempfile::tempdir().unwrap();
        let secrets = Store::in_dir(sdir.path(), vault.path());
        secrets.set("abs", "token", "tok-abs").unwrap();
        plugin(vault.path(), "title = \"ABS\"\n[permissions]\nnet = [\"127.0.0.1\"]\nsecrets = true\n");
        let media = Media::default();
        let (port, asked) = server();
        let req = MediaRequest {
            url: format!("http://127.0.0.1:{port}/api/items/1/file/2"),
            headers: BTreeMap::from([("Authorization".to_string(), HeaderValue::Secret { secret: "token".into(), prefix: "Bearer ".into() })]),
        };
        let ticket = media.prepare(vault.path(), &secrets, "abs", &req).unwrap();
        assert_eq!(ticket.len(), 32);
        assert!(!ticket.contains("tok-abs"));
        assert_eq!(media.plugin_of(&ticket).as_deref(), Some("abs"));
        let mut page = HeaderMap::new();
        page.insert("range", "bytes=2-".parse().unwrap());
        page.insert("cookie", "atlas-page=1".parse().unwrap()); // the page's own: never passed on
        let res = media.play(&ticket, &page).await;
        assert_eq!(res.status(), 206);
        assert_eq!(res.headers().get("content-range").unwrap(), "bytes 2-11/100");
        assert!(res.headers().get("set-cookie").is_none(), "nothing the server sets reaches the page");
        let body = axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap();
        assert_eq!(&body[..], b"0123456789");
        let asked = asked.recv().unwrap().to_ascii_lowercase();
        assert!(asked.contains("authorization: bearer tok-abs"), "{asked}");
        assert!(asked.contains("range: bytes=2-"), "{asked}");
        assert!(!asked.contains("atlas-page"), "{asked}");
        // unknown tickets and hosts the plugin may not reach
        assert_eq!(media.play("nope", &HeaderMap::new()).await.status(), 404);
        let far = MediaRequest { url: "http://example.org/a.mp3".into(), headers: BTreeMap::new() };
        assert!(media.prepare(vault.path(), &secrets, "abs", &far).is_err());
    }
}
