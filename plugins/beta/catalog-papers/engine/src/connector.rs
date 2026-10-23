//! The Zotero Connector protocol (the official Zotero browser extension), answered by the helper while the plugin is
//! on and its `connector` setting says so, so "Save to Zotero" saves into the vault's references when Zotero itself is
//! not running. Read from Zotero 10's own `server_connector.js` / `saveSession.js` (connector API v3): the extension
//! translates the page, POSTs the items to /connector/saveItems, then uploads each PDF to /connector/saveAttachment
//! with the browser's cookies (so paywalled PDFs work). Only 127.0.0.1:23119; while Zotero holds the port the
//! listener waits and retries, so both can be installed. Moved from the core (axum) onto a small std listener: the
//! requests are a handful of short POSTs, one at a time.
use crate::entry::{self, Companion};
use crate::net::Net;
use crate::refs::{citekey, Lib, Res, Trash};
use crate::settings::Settings;
use serde_json::{json, Value};
use serde_yaml::Mapping;
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub const PORT: u16 = 23119;
const API_VERSION: &str = "3";
/// A PDF uploaded by the extension can be large; anything above is refused.
const MAX_BODY: usize = 200 * 1024 * 1024;

/// What the connector needs beyond the vault's files: the library's seams, the current settings, the core's capture
/// (so a film saved from the browser is filed by the catalog) and a word that files changed.
pub trait Host {
    fn net(&self) -> &dyn Net;
    fn companion(&self) -> &dyn Companion;
    fn trash(&self) -> &dyn Trash;
    fn settings(&self) -> Settings;
    /// A capture as the capture box makes it: today's log line, then the capture hooks (the catalog).
    fn capture(&self, text: &str) -> Res<()>;
    /// Vault paths written just now (the entries' notes, refs.bib).
    fn changed(&self, _paths: Vec<String>) {}
}

// --- HTTP, as little as the extension needs -----------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct Request {
    pub method: String,
    pub path: String,
    /// lower-case names
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Request {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
    }
    fn json(&self) -> Value {
        serde_json::from_slice(&self.body).unwrap_or(Value::Null)
    }
    /// `X-Metadata`: whose attachment this is.
    fn metadata(&self) -> Option<Value> {
        self.header("x-metadata").and_then(|s| serde_json::from_str(s).ok())
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Response {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

impl Response {
    fn empty(status: u16) -> Response {
        Response { status, headers: vec![], body: vec![] }
    }
    fn json(status: u16, v: Value) -> Response {
        Response { status, headers: vec![("content-type", "application/json".into())], body: v.to_string().into_bytes() }
    }
    fn text(status: u16, t: impl Into<String>) -> Response {
        Response { status, headers: vec![("content-type", "text/plain; charset=utf-8".into())], body: t.into().into_bytes() }
    }
}

// --- the session of one "Save to Zotero" click -------------------------------------------------------------------

/// The items one click created (connector id → entry folder), and those sent to the capture instead.
#[derive(Default)]
struct Session {
    items: HashMap<String, PathBuf>,
    captured: HashSet<String>,
}

/// Zotero's item types that are not references: a page, a film, a recording, a post… They are captured instead, so
/// the catalog files them as what they are (a film in Films), from the browser's Zotero button.
const NOT_REFERENCES: [&str; 12] = ["webpage", "film", "videoRecording", "audioRecording", "podcast", "blogPost", "forumPost", "tvBroadcast", "radioBroadcast", "artwork", "computerProgram", "instantMessage"];

/// An item to capture rather than file as a reference → the capture's text ("title url"); None: a reference.
fn as_capture(item: &Value) -> Option<String> {
    let kind = item["itemType"].as_str().unwrap_or("");
    let url = item["url"].as_str().filter(|u| u.starts_with("http"))?;
    if !NOT_REFERENCES.contains(&kind) {
        return None;
    }
    let title = item["title"].as_str().unwrap_or("").trim();
    Some(if title.is_empty() || title == url { url.to_string() } else { format!("{title} {url}") })
}

/// A translator's item → the entry's fields (Zotero-shaped; written into its note).
fn item_meta(item: &Value) -> Mapping {
    let mut m = Mapping::new();
    let o = item.as_object().cloned().unwrap_or_default();
    m.insert("title".into(), o.get("title").and_then(Value::as_str).unwrap_or("untitled").into());
    m.insert("type".into(), o.get("itemType").and_then(Value::as_str).unwrap_or("document").into());
    for c in o.get("creators").and_then(Value::as_array).into_iter().flatten() {
        let role = c["creatorType"].as_str().unwrap_or("author").to_string();
        let name = match (c["lastName"].as_str(), c["firstName"].as_str()) {
            (Some(l), Some(f)) if !f.is_empty() => format!("{l}, {f}"),
            (Some(l), _) => l.to_string(),
            _ => c["name"].as_str().unwrap_or_default().to_string(),
        };
        if let serde_yaml::Value::Sequence(v) = m.entry(role.into()).or_insert_with(|| serde_yaml::Value::Sequence(vec![])) {
            v.push(name.into());
        }
    }
    let tags: Vec<serde_yaml::Value> =
        o.get("tags").and_then(Value::as_array).into_iter().flatten().filter_map(|t| t.as_str().or_else(|| t["tag"].as_str()).map(Into::into)).collect();
    if !tags.is_empty() {
        m.insert("tags".into(), serde_yaml::Value::Sequence(tags));
    }
    const SKIP: [&str; 9] = ["id", "itemType", "title", "creators", "tags", "notes", "attachments", "seeAlso", "complete"];
    for (k, v) in &o {
        if let Some(s) = v.as_str().filter(|s| !s.is_empty() && !SKIP.contains(&k.as_str())) {
            m.insert(k.as_str().into(), s.into());
        }
    }
    m.insert("dateAdded".into(), chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string().into());
    m
}

/// Plain text of a note's HTML: paragraphs and line breaks kept, tags dropped.
fn strip_html(s: &str) -> String {
    let s = s.replace("</p>", "\n\n").replace("<br>", "\n").replace("<br/>", "\n");
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ").trim().to_string()
}

/// The first four-digit run of a date ("1963-11-26", "Nov 1963").
fn year_in(d: &str) -> Option<String> {
    let b = d.as_bytes();
    (0..b.len().saturating_sub(3)).find(|&i| b[i..i + 4].iter().all(u8::is_ascii_digit)).map(|i| d[i..i + 4].to_string())
}

fn strings(v: Option<&serde_yaml::Value>) -> Vec<String> {
    v.and_then(|v| v.as_sequence()).map(|s| s.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default()
}

pub struct Connector<H: Host> {
    host: H,
    root: PathBuf,
    sessions: Mutex<HashMap<String, Session>>,
}

impl<H: Host> Connector<H> {
    /// `root`: the vault, canonical.
    pub fn new(host: H, root: PathBuf) -> Self {
        Connector { host, root, sessions: Mutex::default() }
    }

    fn lib<'a>(&'a self, cfg: &'a Settings) -> Lib<'a> {
        Lib { root: &self.root, cfg, net: self.host.net(), made: self.host.companion(), trash: self.host.trash() }
    }

    fn sessions(&self) -> std::sync::MutexGuard<'_, HashMap<String, Session>> {
        self.sessions.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// One request → its answer, the guard first.
    pub fn handle(&self, req: &Request) -> Response {
        // Zotero's rule: a request from a browser must carry the connector header, which a web page cannot add without
        // a CORS preflight that is never granted — so pages cannot write into the library
        let browser = req.header("user-agent").is_some_and(|u| u.starts_with("Mozilla/")) || req.header("origin").is_some();
        let allowed = req.header("x-zotero-connector-api-version").is_some() || req.header("zotero-allowed-request").is_some();
        let navigate_ping = req.path == "/connector/ping" && req.header("sec-fetch-mode") == Some("navigate");
        if browser && !allowed && !navigate_ping {
            return Response::empty(403);
        }
        let mut res = self.route(req);
        res.headers.push(("X-Zotero-Version", "7.0.0 (Atlas)".into()));
        res.headers.push(("X-Zotero-Connector-API-Version", API_VERSION.into()));
        res
    }

    fn route(&self, req: &Request) -> Response {
        let path = req.path.split('?').next().unwrap_or_default();
        match (req.method.as_str(), path) {
            ("GET", "/connector/ping") => Response {
                status: 200,
                headers: vec![("content-type", "text/html".into())],
                body: b"<!DOCTYPE html><html><body>Zotero is running (Atlas)</body></html>".to_vec(),
            },
            ("POST", "/connector/ping") => Response::json(
                200,
                json!({ "prefs": {
                    "automaticSnapshots": true, "downloadAssociatedFiles": true, "supportsAttachmentUpload": true,
                    "supportsTagsAutocomplete": false, "canUserAddNote": true,
                    "googleDocsAddNoteEnabled": false, "googleDocsAddAnnotationEnabled": false, "googleDocsCitationExplorerEnabled": false,
                }}),
            ),
            ("POST", "/connector/getSelectedCollection") => self.selected_collection(),
            ("POST", "/connector/saveItems") => self.save_items(&req.json()),
            ("POST", "/connector/saveAttachment") => self.save_attachment(req.metadata(), req.header("content-type").unwrap_or(""), &req.body),
            ("POST", "/connector/saveSnapshot") => self.save_snapshot(&req.json()),
            ("POST", "/connector/saveSingleFile") => self.save_single_file(req),
            ("POST", "/connector/updateSession") => self.update_session(&req.json()),
            ("POST", "/connector/hasAttachmentResolvers") => Response::json(200, json!(false)),
            ("POST", "/connector/getClientHostnames" | "/connector/proxies") => Response::json(200, json!([])),
            ("POST", "/connector/delaySync") => Response::empty(204),
            (_, p) if p.starts_with("/connector/") => Response::empty(405),
            _ => Response::empty(404),
        }
    }

    /// The library's collections, as the extension's folder picker expects (`L1`, `C<n>`).
    fn targets(&self, cfg: &Settings) -> Vec<String> {
        let mut names: Vec<String> = self.lib(cfg).list().unwrap_or_default().into_iter().flat_map(|p| p.collections).collect();
        names.sort();
        names.dedup();
        names
    }

    fn selected_collection(&self) -> Response {
        let cfg = self.host.settings();
        let mut list = vec![json!({ "id": "L1", "name": "Atlas Library", "filesEditable": true, "level": 0 })];
        list.extend(self.targets(&cfg).iter().enumerate().map(|(i, n)| json!({ "id": format!("C{}", i + 1), "name": n, "filesEditable": true, "level": 1 })));
        Response::json(
            200,
            json!({ "libraryID": 1, "libraryName": "Atlas Library", "libraryEditable": true, "filesEditable": true,
                "editable": true, "id": null, "name": "Atlas Library", "targets": list, "tags": {} }),
        )
    }

    /// The entry for an item (or the one with its DOI already) → its folder.
    fn create_entry(&self, cfg: &Settings, item: &Value) -> Res<PathBuf> {
        let lib = self.lib(cfg);
        let mut m = item_meta(item);
        if let Some(d) = m.get("DOI").and_then(|v| v.as_str()).map(str::to_lowercase) {
            if let Some(p) = lib.list()?.into_iter().find(|p| p.doi.as_deref().map(str::to_lowercase).as_deref() == Some(d.as_str())) {
                return Ok(self.root.join(&p.dir));
            }
        }
        let base = atlas_text::paths::safe_join(&self.root, &cfg.dir)?;
        let year = m.get("date").and_then(|v| v.as_str()).and_then(year_in);
        let title = m.get("title").and_then(|v| v.as_str()).unwrap_or("untitled").to_string();
        let key = citekey(&strings(m.get("author")), year.as_deref(), &title, &|k| base.join(k).exists());
        let dir = base.join(&key);
        std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        m.insert("citekey".into(), key.into());
        m.insert("saved_from".into(), "browser (Zotero Connector)".into());
        entry::write(self.host.companion(), &dir, &m)?;
        let notes: Vec<String> = item["notes"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|n| n["note"].as_str().or(n.as_str()).map(strip_html))
            .filter(|n| !n.is_empty())
            .collect();
        if !notes.is_empty() {
            entry::append_note(&dir, &notes.join("\n\n---\n\n"))?;
        }
        Ok(dir)
    }

    /// refs.bib rewritten, the changed notes said.
    fn finish(&self, cfg: &Settings, dirs: &[PathBuf]) {
        if let Err(e) = self.lib(cfg).write_bib() {
            eprintln!("papers: connector: refs.bib: {e}");
        }
        let notes = dirs.iter().filter_map(|d| atlas_text::paths::rel_path(&self.root, &d.join(entry::note_file(&entry::key_of(d)))));
        self.host.changed(notes.chain(std::iter::once(cfg.bib.clone())).collect());
    }

    fn save_items(&self, data: &Value) -> Response {
        let cfg = self.host.settings();
        let sid = data["sessionID"].as_str().unwrap_or("").to_string();
        let mut session = Session::default();
        for item in data["items"].as_array().into_iter().flatten() {
            let id = item["id"].as_str().unwrap_or("").to_string();
            if let Some(text) = as_capture(item) {
                // a capture like any other: its line in today's log, then the capture hooks (the catalog files it)
                match self.host.capture(&text) {
                    Ok(()) => drop(session.captured.insert(id)),
                    Err(e) => return Response::text(500, e),
                }
                continue;
            }
            match self.create_entry(&cfg, item) {
                Ok(dir) => drop(session.items.insert(id, dir)),
                Err(e) => return Response::text(500, e),
            }
        }
        let dirs: Vec<PathBuf> = session.items.values().cloned().collect();
        if !dirs.is_empty() {
            self.finish(&cfg, &dirs); // only captures: the library and refs.bib are left as they were
        }
        self.sessions().insert(sid, session);
        Response::json(201, json!({}))
    }

    /// A PDF (or other file) for an item of the session; the body is the file, `X-Metadata` says whose.
    fn save_attachment(&self, meta: Option<Value>, ctype: &str, body: &[u8]) -> Response {
        let Some(meta) = meta else { return Response::json(400, json!({ "error": "METADATA_NOT_PROVIDED" })) };
        let (sid, parent) = (meta["sessionID"].as_str().unwrap_or(""), meta["parentItemID"].as_str().unwrap_or(""));
        let dir = {
            let sessions = self.sessions();
            let session = sessions.get(sid);
            if session.is_some_and(|s| s.captured.contains(parent)) {
                return Response::empty(201); // a captured page's snapshot: the catalog reads the page itself
            }
            session.and_then(|s| s.items.get(parent).cloned())
        };
        let Some(dir) = dir else { return Response::json(400, json!({ "error": "SESSION_NOT_FOUND" })) };
        let ext = if ctype.contains("pdf") || body.starts_with(b"%PDF") { "pdf" } else if ctype.contains("html") { "html" } else { "bin" };
        let key = entry::key_of(&dir);
        let mut name = format!("{key}.{ext}");
        let mut n = 1;
        while dir.join(&name).exists() {
            n += 1;
            name = format!("{key}-{n}.{ext}");
        }
        if let Err(e) = std::fs::write(dir.join(&name), body) {
            return Response::text(500, e.to_string());
        }
        let mut m = entry::read(&dir).unwrap_or_default();
        if let serde_yaml::Value::Sequence(v) = m.entry("files".into()).or_insert_with(|| serde_yaml::Value::Sequence(vec![])) {
            v.push(name.into());
        }
        if let Err(e) = entry::write(self.host.companion(), &dir, &m) {
            return Response::text(500, e);
        }
        self.finish(&self.host.settings(), &[dir]);
        Response::empty(201)
    }

    /// A page with no translator: a `webpage` item (captured; its HTML snapshot may follow via saveSingleFile).
    fn save_snapshot(&self, data: &Value) -> Response {
        let url = data["url"].as_str().unwrap_or_default();
        let item = json!({ "id": url, "itemType": "webpage", "title": data["title"].as_str().unwrap_or(url), "url": url,
            "accessDate": chrono::Local::now().format("%Y-%m-%d").to_string() });
        self.save_items(&json!({ "sessionID": data["sessionID"], "items": [item] }))
    }

    fn save_single_file(&self, req: &Request) -> Response {
        // newer connectors send the snapshot like an attachment (X-Metadata); the parent is the page URL
        match req.metadata() {
            Some(meta) => self.save_attachment(Some(json!({ "sessionID": meta["sessionID"], "parentItemID": meta["url"] })), "text/html", &req.body),
            None => Response::empty(200), // an older multipart snapshot: the page entry already exists
        }
    }

    /// The popup after a save: another collection (`C<n>`), tags, a note — applied to the session's entries.
    fn update_session(&self, data: &Value) -> Response {
        let sid = data["sessionID"].as_str().unwrap_or("");
        let Some(dirs) = self.sessions().get(sid).map(|s| s.items.values().cloned().collect::<Vec<_>>()) else {
            return Response::json(400, json!({ "error": "SESSION_NOT_FOUND" }));
        };
        let cfg = self.host.settings();
        let names = self.targets(&cfg);
        let target = data["target"].as_str().unwrap_or("L1");
        let collection = target.strip_prefix('C').and_then(|n| n.parse::<usize>().ok()).and_then(|n| names.get(n.checked_sub(1)?).cloned());
        let tags: Vec<String> = match &data["tags"] {
            Value::String(s) => s.split(',').map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).collect(),
            Value::Array(a) => a.iter().filter_map(|t| t.as_str().map(String::from)).collect(),
            _ => vec![],
        };
        let note = data["note"].as_str().map(strip_html).filter(|n| !n.is_empty());
        let seq = |values: Vec<String>| serde_yaml::Value::Sequence(values.into_iter().map(Into::into).collect());
        for dir in &dirs {
            let mut m = entry::read(dir).unwrap_or_default();
            m.insert("collections".into(), seq(collection.clone().into_iter().collect())); // the picker replaces the target
            let mut all = strings(m.get("tags"));
            for t in &tags {
                if !all.contains(t) {
                    all.push(t.clone());
                }
            }
            if !all.is_empty() {
                m.insert("tags".into(), seq(all));
            }
            let wrote = entry::write(self.host.companion(), dir, &m).and_then(|_| note.as_deref().map_or(Ok(()), |n| entry::append_note(dir, n)));
            if let Err(e) = wrote {
                eprintln!("papers: connector: {}: {e}", dir.display());
            }
        }
        self.finish(&cfg, &dirs);
        Response::json(200, json!({}))
    }
}

// --- the listener ------------------------------------------------------------------------------------------------

/// Reads one request (headers, then `Content-Length` bytes of body).
fn read_request(stream: &mut impl Read) -> Result<Request, (u16, String)> {
    let mut buf = Vec::with_capacity(4096);
    let mut chunk = [0u8; 8192];
    let head_end = loop {
        let n = stream.read(&mut chunk).map_err(|e| (400, e.to_string()))?;
        if n == 0 {
            return Err((400, "closed before the headers ended".into()));
        }
        buf.extend_from_slice(&chunk[..n]);
        if let Some(i) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break i + 4;
        }
        if buf.len() > 64 * 1024 {
            return Err((431, "headers too large".into()));
        }
    };
    let mut headers = [httparse::EMPTY_HEADER; 64];
    let mut parsed = httparse::Request::new(&mut headers);
    parsed.parse(&buf[..head_end]).map_err(|e| (400, e.to_string()))?;
    let mut req = Request {
        method: parsed.method.unwrap_or("GET").to_string(),
        path: parsed.path.unwrap_or("/").to_string(),
        headers: parsed.headers.iter().map(|h| (h.name.to_ascii_lowercase(), String::from_utf8_lossy(h.value).into_owned())).collect(),
        body: buf[head_end..].to_vec(),
    };
    if req.header("transfer-encoding").is_some_and(|t| t.contains("chunked")) {
        return Err((411, "a body needs a Content-Length".into()));
    }
    let len: usize = req.header("content-length").and_then(|l| l.trim().parse().ok()).unwrap_or(0);
    if len > MAX_BODY {
        return Err((413, "too large".into()));
    }
    while req.body.len() < len {
        let n = stream.read(&mut chunk).map_err(|e| (400, e.to_string()))?;
        if n == 0 {
            break;
        }
        req.body.extend_from_slice(&chunk[..n]);
    }
    req.body.truncate(len);
    Ok(req)
}

fn write_response(stream: &mut impl Write, res: &Response) -> std::io::Result<()> {
    let reason = match res.status {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "",
    };
    let mut head = format!("HTTP/1.1 {} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n", res.status, res.body.len());
    for (k, v) in &res.headers {
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    stream.write_all(&res.body)?;
    stream.flush()
}

/// One connection: one request, its answer, closed.
fn serve_one<H: Host>(c: &Connector<H>, mut stream: std::net::TcpStream) {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let res = match read_request(&mut stream) {
        Ok(req) => {
            if req.header("expect").is_some_and(|e| e.eq_ignore_ascii_case("100-continue")) {
                let _ = stream.write_all(b"HTTP/1.1 100 Continue\r\n\r\n");
            }
            c.handle(&req)
        }
        Err((status, why)) => Response::text(status, why),
    };
    let _ = write_response(&mut stream, &res);
}

/// The listener while the connector is wanted: stopped by [`Listener::stop`] (the setting switched off, the helper
/// ending). A port held by Zotero (or another vault's Atlas) is tried again each minute.
pub struct Listener {
    stop: Arc<AtomicBool>,
    bound: Arc<AtomicBool>,
    pub port: u16,
}

impl Listener {
    pub fn start<H: Host + Send + 'static>(c: Connector<H>, port: u16) -> Listener {
        let (stop, bound) = (Arc::new(AtomicBool::new(false)), Arc::new(AtomicBool::new(false)));
        let (s, b) = (stop.clone(), bound.clone());
        std::thread::spawn(move || {
            let mut said = false;
            while !s.load(Ordering::Relaxed) {
                match std::net::TcpListener::bind(("127.0.0.1", port)) {
                    Ok(l) => {
                        eprintln!("papers: Zotero Connector endpoint on 127.0.0.1:{port} (browser saves go to the references)");
                        b.store(true, Ordering::Relaxed);
                        let _ = l.set_nonblocking(true); // so a stop is seen between connections
                        while !s.load(Ordering::Relaxed) {
                            match l.accept() {
                                Ok((stream, _)) => serve_one(&c, stream),
                                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(150)),
                                Err(e) => eprintln!("papers: connector: {e}"),
                            }
                        }
                        b.store(false, Ordering::Relaxed);
                        return;
                    }
                    Err(_) if !said => {
                        eprintln!("papers: port {port} is taken (Zotero is running?) — the browser saves to Zotero; retrying each minute");
                        said = true;
                    }
                    Err(_) => {}
                }
                for _ in 0..60 {
                    if s.load(Ordering::Relaxed) {
                        return;
                    }
                    std::thread::sleep(Duration::from_secs(1));
                }
            }
        });
        Listener { stop, bound, port }
    }

    /// Whether the port is ours now (false: waiting for Zotero to let it go).
    pub fn listening(&self) -> bool {
        self.bound.load(Ordering::Relaxed)
    }

    pub fn stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

impl Drop for Listener {
    fn drop(&mut self) {
        self.stop();
    }
}

/// The port to listen on: 23119, or `ATLAS_CONNECTOR_PORT` (tests, two vaults).
pub fn port() -> u16 {
    std::env::var("ATLAS_CONNECTOR_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(PORT)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entry::tests::Plain;
    use crate::net::fake::Table;
    use crate::refs::tests::TempTrash;

    struct TestHost {
        root: PathBuf,
        net: Table,
        captured: Mutex<Vec<String>>,
        trash: TempTrash,
    }

    impl Host for TestHost {
        fn net(&self) -> &dyn Net {
            &self.net
        }
        fn companion(&self) -> &dyn Companion {
            &Plain
        }
        fn trash(&self) -> &dyn Trash {
            &self.trash
        }
        fn settings(&self) -> Settings {
            Settings::default()
        }
        fn capture(&self, text: &str) -> Res<()> {
            self.captured.lock().unwrap().push(text.to_string());
            Ok(())
        }
    }

    fn app() -> (tempfile::TempDir, Connector<TestHost>) {
        let t = tempfile::tempdir().unwrap();
        let root = t.path().canonicalize().unwrap();
        std::fs::create_dir_all(root.join("refs/papers")).unwrap();
        let host = TestHost { root: root.clone(), net: Table::default(), captured: Mutex::default(), trash: TempTrash(root.clone()) };
        (t, Connector::new(host, root))
    }

    fn req(path: &str, body: Value, browser: bool) -> Request {
        let mut headers = vec![("content-type".to_string(), "application/json".to_string()), ("user-agent".to_string(), "Mozilla/5.0".to_string())];
        if browser {
            headers.push(("origin".into(), "https://evil.example".into()));
        } else {
            headers.push(("x-zotero-connector-api-version".into(), "3".into()));
        }
        Request { method: "POST".into(), path: path.into(), headers, body: body.to_string().into_bytes() }
    }

    fn attachment(meta: Value, ctype: &str, body: &[u8]) -> Request {
        let headers = vec![
            ("content-type".to_string(), ctype.to_string()),
            ("x-zotero-connector-api-version".to_string(), "3".to_string()),
            ("x-metadata".to_string(), meta.to_string()),
        ];
        Request { method: "POST".into(), path: "/connector/saveAttachment".into(), headers, body: body.to_vec() }
    }

    #[test]
    fn web_pages_cannot_write_the_extension_can() {
        let (_t, a) = app();
        assert_eq!(a.handle(&req("/connector/saveItems", json!({ "sessionID": "s", "items": [] }), true)).status, 403);
        let r = a.handle(&req("/connector/ping", json!({}), false));
        assert_eq!(r.status, 200);
        assert!(r.headers.contains(&("X-Zotero-Connector-API-Version", "3".into())));
    }

    #[test]
    fn a_film_from_the_browser_is_captured_for_the_catalog_not_filed_as_a_reference() {
        let (t, a) = app();
        let film = json!({ "id": "f1", "itemType": "film", "title": "The Realm", "url": "https://letterboxd.com/film/the-realm-2018/" });
        assert_eq!(a.handle(&req("/connector/saveItems", json!({ "sessionID": "s2", "items": [film] }), false)).status, 201);
        assert_eq!(std::fs::read_dir(t.path().join("refs/papers")).map(|d| d.count()).unwrap_or(0), 0, "not a reference");
        assert_eq!(*a.host.captured.lock().unwrap(), ["The Realm https://letterboxd.com/film/the-realm-2018/"]);
        // its snapshot, sent after: taken and dropped (the catalog reads the page itself)
        let snap = attachment(json!({ "sessionID": "s2", "parentItemID": "f1", "title": "Snapshot" }), "text/html", b"<html></html>");
        assert_eq!(a.handle(&snap).status, 201);
        assert!(a.host.root.join("refs/papers").read_dir().unwrap().next().is_none());
    }

    #[test]
    fn save_items_then_pdf_then_popup_update() {
        let (t, a) = app();
        let item = json!({ "id": "abc", "itemType": "journalArticle", "title": "Electron correlations in narrow energy bands",
            "creators": [{ "firstName": "J.", "lastName": "Hubbard", "creatorType": "author" }], "date": "1963-11-26",
            "DOI": "10.1098/rspa.1963.0204", "publicationTitle": "Proc. R. Soc. Lond. A", "tags": [{ "tag": "Hubbard model" }],
            "notes": [{ "note": "<p>Saved from the browser</p>" }] });
        assert_eq!(a.handle(&req("/connector/saveItems", json!({ "sessionID": "s1", "items": [item.clone()] }), false)).status, 201);
        let dir = t.path().join("refs/papers/hubbard1963electron");
        let m = entry::read(&dir).unwrap();
        assert!(!dir.join("info.yaml").exists(), "the fields are the note's properties");
        assert_eq!(m["title"], "Electron correlations in narrow energy bands");
        assert_eq!(m["author"][0], "Hubbard, J.");
        assert_eq!(m["DOI"], "10.1098/rspa.1963.0204");
        // the note is named after the citekey and starts with the paper's properties
        let note = std::fs::read_to_string(dir.join("hubbard1963electron.md")).unwrap();
        assert!(note.starts_with("---\ntype: literature\ncitekey: hubbard1963electron\n") && note.contains("Saved from the browser"), "{note}");
        assert!(!dir.join("notes.md").exists());
        assert!(std::fs::read_to_string(t.path().join("refs/refs.bib")).unwrap().contains("hubbard1963electron"));
        // the PDF, uploaded by the extension with the browser's cookies
        let pdf = attachment(json!({ "sessionID": "s1", "parentItemID": "abc", "title": "Full Text PDF" }), "application/pdf", b"%PDF-1.4 test");
        assert_eq!(a.handle(&pdf).status, 201);
        assert!(dir.join("hubbard1963electron.pdf").exists());
        assert_eq!(a.handle(&attachment(json!({ "sessionID": "nope", "parentItemID": "abc" }), "application/pdf", b"%PDF")).status, 400);
        // popup: tags and a note
        let r = a.handle(&req("/connector/updateSession", json!({ "sessionID": "s1", "target": "L1", "tags": "dmft, review", "note": "read §3" }), false));
        assert_eq!(r.status, 200);
        let m = entry::read(&dir).unwrap();
        assert_eq!(m["tags"].as_sequence().unwrap().len(), 3);
        assert_eq!(m["files"][0], "hubbard1963electron.pdf");
        assert!(std::fs::read_to_string(dir.join("hubbard1963electron.md")).unwrap().contains("read §3"));
        // the same DOI again is the same entry, not a duplicate
        a.handle(&req("/connector/saveItems", json!({ "sessionID": "s2", "items": [item] }), false));
        assert_eq!(std::fs::read_dir(t.path().join("refs/papers")).unwrap().count(), 1);
        // the picker lists the collections; another one chosen in the popup replaces the target
        let mut m = entry::read(&dir).unwrap();
        m.insert("collections".into(), serde_yaml::Value::Sequence(vec!["DMFT".into()]));
        entry::write(&Plain, &dir, &m).unwrap();
        let picker: Value = serde_json::from_slice(&a.handle(&req("/connector/getSelectedCollection", json!({}), false)).body).unwrap();
        assert_eq!(picker["targets"][1]["name"], "DMFT");
    }

    /// The real listener on a free port: a raw request in, the extension's answer out.
    #[test]
    fn the_listener_answers_over_tcp_and_stops() {
        let (_t, a) = app();
        let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let l = Listener::start(a, port);
        let mut tries = 0;
        let mut stream = loop {
            match std::net::TcpStream::connect(("127.0.0.1", port)) {
                Ok(s) => break s,
                Err(_) if tries < 50 => {
                    tries += 1;
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(e) => panic!("{e}"),
            }
        };
        assert!(l.listening());
        let body = "{}";
        write!(stream, "POST /connector/ping HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Zotero-Connector-API-Version: 3\r\nContent-Length: {}\r\n\r\n{body}", body.len()).unwrap();
        let mut out = String::new();
        stream.read_to_string(&mut out).unwrap();
        assert!(out.starts_with("HTTP/1.1 200 OK") && out.contains("X-Zotero-Connector-API-Version: 3") && out.contains("supportsAttachmentUpload"), "{out}");
        l.stop();
    }
}
