//! A plugin's media — an audiobook, a film, a podcast — played by the page from a server that wants the plugin's secret
//! on every request (Audiobookshelf's token), without the secret ever reaching the page (docs/design/DESIGN-audiobooks.md;
//! PLUGIN-API.md `atlas.media`). The plugin asks for an address (`POST /api/plugins/<id>/media`): the core checks the
//! address against the plugin's `[permissions] net`, fills its headers in (secrets, a kept sign-in's cookie) and keeps
//! them in memory under a random ticket; `<audio src>` then asks `/media/<ticket>`, which the core answers by asking the
//! server with those headers, the page's `Range` passed through (seeking) and the bytes streamed as they come.
//! A plugin may also name a file of its own cache instead (`{ file }`: a download kept for listening offline), which the
//! ticket serves from disk with the same ranges — one kind of address for the player, wherever the bytes are.
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

/// What a plugin asks to play: the address and its headers (a secret named, filled in here), or a file of its cache.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct MediaRequest {
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub headers: BTreeMap<String, HeaderValue>,
    /// A file of the plugin's own cache (`.atlas/cache/plugins/<id>/<file>`), played instead of `url`.
    #[serde(default)]
    pub file: Option<String>,
}

/// The page's address for it (`/media/<ticket>`, under the vault's prefix).
#[derive(Debug, Clone, Serialize)]
pub struct MediaAddress {
    pub src: String,
    /// The ticket alone: a page reached through the desktop's bridge (`/remote/<host>/…`) builds the address on its base.
    pub ticket: String,
}

/// What a ticket plays: an address the core asks with the headers it was given (secrets in), or a file on disk.
#[derive(Clone)]
enum Source {
    Server { url: reqwest::Url, headers: Vec<(String, String)> },
    File(std::path::PathBuf),
}

/// A ticket: what it plays, for whom, since when.
struct Ticket {
    plugin: String,
    source: Source,
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
        let source = match &req.file {
            Some(file) => {
                let path = plugin_net::cache_file(root, id, file)?;
                if !path.is_file() {
                    return Err(crate::Error::NotFound(format!("media: {file} is not in plugin {id}'s cache")));
                }
                Source::File(path)
            }
            None => {
                let perm = plugins::permissions(root, id)?;
                let url = plugin_net::checked_url(&perm, id, &req.url)?;
                let mut headers = Vec::new();
                for (name, v) in &req.headers {
                    headers.push((name.clone(), plugin_net::header_value(&perm, secrets, id, v)?));
                }
                headers.extend(plugin_net::kept_headers(&perm, secrets, &url, &req.headers)?.headers); // a gate's cookie, its bypass key
                Source::Server { url, headers }
            }
        };
        let ticket = crate::auth::random_hex(16);
        let mut all = self.tickets.lock().unwrap_or_else(|e| e.into_inner());
        all.retain(|_, t| t.made.elapsed() < LIFE);
        if all.len() >= MAX {
            if let Some(oldest) = all.iter().min_by_key(|(_, t)| t.made).map(|(k, _)| k.clone()) {
                all.remove(&oldest);
            }
        }
        all.insert(ticket.clone(), Ticket { plugin: id.into(), source, made: Instant::now() });
        Ok(ticket)
    }

    /// Who a ticket plays for (None: unknown or run out).
    pub fn plugin_of(&self, ticket: &str) -> Option<String> {
        let all = self.tickets.lock().unwrap_or_else(|e| e.into_inner());
        all.get(ticket).filter(|t| t.made.elapsed() < LIFE).map(|t| t.plugin.clone())
    }

    /// The answer to the page's request for `ticket`: the server's, streamed, or the kept file's.
    pub async fn play(&self, ticket: &str, page: &HeaderMap) -> Response {
        let found = {
            let all = self.tickets.lock().unwrap_or_else(|e| e.into_inner());
            all.get(ticket).filter(|t| t.made.elapsed() < LIFE).map(|t| t.source.clone())
        };
        match found {
            None => (StatusCode::NOT_FOUND, "this media address ran out: play it again").into_response(),
            Some(Source::File(path)) => serve_file(&path, page).await,
            Some(Source::Server { url, headers }) => from_server(url, &headers, page).await,
        }
    }
}

/// The page's request asked of the server with the ticket's headers; its answer streamed back.
async fn from_server(url: reqwest::Url, headers: &[(String, String)], page: &HeaderMap) -> Response {
    let mut req = client().get(url).header("accept-encoding", "identity");
    for (k, v) in headers {
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

/// What a `Range` header asks of a file of `len` bytes: all of it, the bytes `a..=b`, or nothing it has (416). One
/// range only (`bytes=a-b`, `a-`, `-n`), as a media element asks; several are served whole.
#[derive(Debug, PartialEq, Eq)]
enum Ranged {
    Whole,
    Part(u64, u64),
    Outside,
}

fn ranged(header: Option<&str>, len: u64) -> Ranged {
    let Some(spec) = header.and_then(|h| h.trim().strip_prefix("bytes=")) else { return Ranged::Whole };
    if spec.contains(',') {
        return Ranged::Whole;
    }
    let Some((a, b)) = spec.split_once('-') else { return Ranged::Whole };
    let (a, b) = (a.trim(), b.trim());
    let (start, end) = if a.is_empty() {
        // the last n bytes
        let Ok(n) = b.parse::<u64>() else { return Ranged::Whole };
        if n == 0 || len == 0 {
            return Ranged::Outside;
        }
        (len.saturating_sub(n), len - 1)
    } else {
        let Ok(start) = a.parse::<u64>() else { return Ranged::Whole };
        let end = if b.is_empty() { u64::MAX } else { b.parse::<u64>().unwrap_or(u64::MAX) };
        (start, end.min(len.saturating_sub(1)))
    };
    if start >= len || start > end {
        return Ranged::Outside;
    }
    Ranged::Part(start, end)
}

/// A kept file, with the range the page asks (seeking in a kept audiobook), streamed from disk.
async fn serve_file(path: &Path, page: &HeaderMap) -> Response {
    use tokio::io::{AsyncReadExt, AsyncSeekExt};
    let Ok(mut f) = tokio::fs::File::open(path).await else {
        return (StatusCode::NOT_FOUND, "the kept file is gone: keep it again").into_response();
    };
    let len = f.metadata().await.map(|m| m.len()).unwrap_or(0);
    let mime = mime_guess::from_path(path).first_or_octet_stream().essence_str().to_string();
    let out = Response::builder().header("content-type", mime).header("accept-ranges", "bytes");
    let built = match ranged(page.get("range").and_then(|v| v.to_str().ok()), len) {
        Ranged::Whole => out.status(200).header("content-length", len).body(Body::from_stream(tokio_util::io::ReaderStream::new(f))),
        Ranged::Part(start, end) => {
            if f.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
            out.status(206)
                .header("content-range", format!("bytes {start}-{end}/{len}"))
                .header("content-length", end - start + 1)
                .body(Body::from_stream(tokio_util::io::ReaderStream::new(f.take(end - start + 1))))
        }
        Ranged::Outside => out.status(416).header("content-range", format!("bytes */{len}")).body(Body::empty()),
    };
    built.unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

/// A report of the app's player (`POST /api/plugins/<id>/media/progress`, `atlas.player`) made ready for the plugin's
/// helper: the method its `[media] progress` names, and the report as a page's helper call gets its params (settings
/// and secrets put in here — the phone's player sends only the place, it never holds the plugin's token). A plugin with
/// no `[media] progress` is told so (404): the player then keeps the place to itself. Blocking: it reads the manifest
/// and the secrets.
pub fn progress_call(root: &Path, cfg: &crate::config::Config, secrets: &Store, id: &str, report: serde_json::Value) -> Result<(String, serde_json::Value)> {
    let method = plugins::media_progress(root, id)?.ok_or_else(|| crate::Error::NotFound(format!("plugin {id} takes no player reports ([media] progress)")))?;
    if !report.is_object() {
        return Err(crate::Error::BadRequest("a player report is an object".into()));
    }
    Ok((method, crate::plugin_tools::page_call_params(root, cfg, secrets, id, report)?))
}

fn client() -> &'static reqwest::Client {
    static C: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder().use_preconfigured_tls(crate::tls_chain::config())
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

    #[test]
    fn a_player_report_goes_to_the_method_media_progress_names_with_the_plugins_settings_and_secrets() {
        let vault = tempfile::tempdir().unwrap();
        let sdir = tempfile::tempdir().unwrap();
        let secrets = Store::in_dir(sdir.path(), vault.path());
        secrets.set("abs", "token", "tok-abs").unwrap();
        let cfg = crate::config::Config::default();
        let report = serde_json::json!({ "key": { "item": "li_1" }, "at": 12.5, "secrets": { "token": "forged" } });
        plugin(vault.path(), "title = \"ABS\"\n[permissions]\nsecrets = true\n[[setting]]\nkey = \"server\"\nkind = \"text\"\ndefault = \"https://abs.example.org\"\n");
        let none = progress_call(vault.path(), &cfg, &secrets, "abs", report.clone()).unwrap_err();
        assert!(matches!(none, crate::Error::NotFound(_)), "no [media] progress: {none}");
        plugin(vault.path(), "title = \"ABS\"\n[permissions]\nsecrets = true\n[media]\nprogress = \"progress\"\n[[setting]]\nkey = \"server\"\nkind = \"text\"\ndefault = \"https://abs.example.org\"\n");
        let (method, params) = progress_call(vault.path(), &cfg, &secrets, "abs", report).unwrap();
        assert_eq!(method, "progress");
        assert_eq!(params["at"], 12.5);
        assert_eq!(params["key"]["item"], "li_1");
        assert_eq!(params["settings"]["server"], "https://abs.example.org");
        assert_eq!(params["secrets"]["token"], "tok-abs", "the core's secret, never the report's own");
        assert!(progress_call(vault.path(), &cfg, &secrets, "abs", serde_json::json!([1])).is_err());
        // an unknown key in [media] is the manifest's error, not silently ignored
        plugin(vault.path(), "title = \"ABS\"\n[media]\nprogres = \"progress\"\n");
        assert!(progress_call(vault.path(), &cfg, &secrets, "abs", serde_json::json!({})).is_err());
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
            file: None,
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
        let far = MediaRequest { url: "http://example.org/a.mp3".into(), ..Default::default() };
        assert!(media.prepare(vault.path(), &secrets, "abs", &far).is_err());
    }

    #[test]
    fn a_range_is_read_as_a_media_element_asks_it() {
        assert_eq!(ranged(None, 100), Ranged::Whole);
        assert_eq!(ranged(Some("bytes=2-11"), 100), Ranged::Part(2, 11));
        assert_eq!(ranged(Some("bytes=90-"), 100), Ranged::Part(90, 99));
        assert_eq!(ranged(Some("bytes=90-500"), 100), Ranged::Part(90, 99), "past the end: to the end");
        assert_eq!(ranged(Some("bytes=-10"), 100), Ranged::Part(90, 99));
        assert_eq!(ranged(Some("bytes=-500"), 100), Ranged::Part(0, 99));
        assert_eq!(ranged(Some("bytes=100-"), 100), Ranged::Outside);
        assert_eq!(ranged(Some("bytes=5-1"), 100), Ranged::Outside);
        assert_eq!(ranged(Some("bytes=0-1,4-5"), 100), Ranged::Whole);
        assert_eq!(ranged(Some("items=0-1"), 100), Ranged::Whole);
    }

    #[tokio::test]
    async fn a_kept_file_of_the_plugins_cache_is_played_with_ranges_and_nothing_outside_it() {
        let vault = tempfile::tempdir().unwrap();
        let sdir = tempfile::tempdir().unwrap();
        let secrets = Store::in_dir(sdir.path(), vault.path());
        plugin(vault.path(), "title = \"ABS\"\n");
        let kept = vault.path().join(".atlas/cache/plugins/abs/kept/li_1");
        std::fs::create_dir_all(&kept).unwrap();
        std::fs::write(kept.join("1.mp3"), b"0123456789").unwrap();
        std::fs::write(vault.path().join("secret.md"), b"mine").unwrap();
        let media = Media::default();
        let file = |f: &str| MediaRequest { file: Some(f.into()), ..Default::default() };
        let ticket = media.prepare(vault.path(), &secrets, "abs", &file("kept/li_1/1.mp3")).unwrap();
        let whole = media.play(&ticket, &HeaderMap::new()).await;
        assert_eq!((whole.status().as_u16(), whole.headers().get("content-type").unwrap().to_str().unwrap()), (200, "audio/mpeg"));
        assert_eq!(&axum::body::to_bytes(whole.into_body(), 1 << 20).await.unwrap()[..], b"0123456789");
        let mut page = HeaderMap::new();
        page.insert("range", "bytes=2-5".parse().unwrap());
        let part = media.play(&ticket, &page).await;
        assert_eq!(part.status(), 206);
        assert_eq!(part.headers().get("content-range").unwrap(), "bytes 2-5/10");
        assert_eq!(&axum::body::to_bytes(part.into_body(), 1 << 20).await.unwrap()[..], b"2345");
        page.insert("range", "bytes=10-".parse().unwrap());
        assert_eq!(media.play(&ticket, &page).await.status(), 416);
        // only the plugin's own cache, only a file that is there
        for bad in ["../../../secret.md", "kept/li_1/none.mp3", "", "kept/../../../../secret.md"] {
            assert!(media.prepare(vault.path(), &secrets, "abs", &file(bad)).is_err(), "{bad}");
        }
        // a file gone after its ticket was made: said, not a crash
        std::fs::remove_file(kept.join("1.mp3")).unwrap();
        assert_eq!(media.play(&ticket, &HeaderMap::new()).await.status(), 404);
    }
}
