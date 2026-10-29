//! Atlas from a plugin's compiled helper (docs/guides/PLUGIN-API.md, "Calling Atlas back") — the Rust twin of the Python
//! library `atlas_plugin` (crates/atlas-core/sdk/python). A helper talks to the core over its own pipe: requests in on
//! stdin, answers out on stdout, and its calls back the same way (`{"call": n, "verb", "path", "body"}` out,
//! `{"reply": n, "status", "body"}` in); the core runs each through the vault's API in-process
//! (crates/atlas-core/src/helper_api.rs). No socket, no port, no key — and only std and serde_json, so a helper built
//! static (x86_64-unknown-linux-musl) runs on the desktop and in the server's container alike.
//!
//! ```no_run
//! use atlas_plugin::{serve, Atlas, Methods};
//! use serde_json::json;
//!
//! let mut m = Methods::new();
//! m.add("count_notes", |_params| {
//!     let n = Atlas::new().files(true)?.iter().filter(|p| p.ends_with(".md")).count();
//!     Ok(json!({ "notes": n }))
//! });
//! serve(m); // until Atlas closes stdin
//! ```
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap, VecDeque};
use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Condvar, Mutex};

/// Why a call did not give an answer: the core's own reason, or why it could not be reached.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error {
    /// the HTTP status the core answered with (none: no answer at all)
    pub status: Option<u16>,
    pub why: String,
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.why)
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

fn fail<T>(why: impl Into<String>) -> Result<T> {
    Err(Error { status: None, why: why.into() })
}

/// The HTTP verbs the API uses: a closed set, so a typo is a compile error.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verb {
    Get,
    Post,
    Put,
    Delete,
}

impl Verb {
    fn as_str(self) -> &'static str {
        match self {
            Verb::Get => "GET",
            Verb::Post => "POST",
            Verb::Put => "PUT",
            Verb::Delete => "DELETE",
        }
    }
}

/// The core serving this plugin's vault, reached over the helper's pipe. Cheap to make: it holds only the plugin's id.
#[derive(Debug, Clone, Default)]
pub struct Atlas {
    plugin: Option<String>,
}

static NEXT: AtomicU64 = AtomicU64::new(0);
/// The helper's stdin, shared by [`serve`] and every thread that calls the core.
static PIPE: Pipe = Pipe::new();

/// What a thread waits for on stdin: the core's next request ([`serve`]) or the reply to its own call.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Want {
    Request,
    Reply(u64),
}

/// Lines read but not yet taken: requests in order, replies by call number.
#[derive(Default)]
struct Inbox {
    requests: VecDeque<String>,
    replies: BTreeMap<u64, String>,
    /// a thread is blocked reading stdin; the others wait for what it files
    reading: bool,
    closed: bool,
}

impl Inbox {
    fn take(&mut self, want: Want) -> Option<String> {
        match want {
            Want::Request => self.requests.pop_front(),
            Want::Reply(n) => self.replies.remove(&n),
        }
    }

    /// A reply goes to its caller; anything else is a request for [`serve`] (which also says what is not JSON).
    fn file(&mut self, line: String) {
        match serde_json::from_str::<Value>(&line).ok().and_then(|m| m.get("reply").and_then(Value::as_u64)) {
            Some(n) => drop(self.replies.insert(n, line)),
            None => self.requests.push_back(line),
        }
    }
}

/// One reader at a time: a thread whose line has not come reads stdin itself when nobody does, files what it read
/// and wakes the others — so a helper may call the core from several threads (a listener beside [`serve`]).
struct Pipe {
    inbox: Mutex<Inbox>,
    arrived: Condvar,
}

impl Pipe {
    const fn new() -> Pipe {
        Pipe {
            inbox: Mutex::new(Inbox { requests: VecDeque::new(), replies: BTreeMap::new(), reading: false, closed: false }),
            arrived: Condvar::new(),
        }
    }

    /// The line `want`ed, read with `read` (one line; None at the end); None once the pipe is closed.
    fn next(&self, want: Want, read: &dyn Fn() -> Option<String>) -> Option<String> {
        let mut inbox = self.inbox.lock().unwrap_or_else(|e| e.into_inner());
        loop {
            if let Some(line) = inbox.take(want) {
                return Some(line);
            }
            if inbox.closed {
                return None;
            }
            if inbox.reading {
                inbox = self.arrived.wait(inbox).unwrap_or_else(|e| e.into_inner());
                continue;
            }
            inbox.reading = true;
            drop(inbox);
            let line = read();
            inbox = self.inbox.lock().unwrap_or_else(|e| e.into_inner());
            inbox.reading = false;
            match line {
                Some(l) => inbox.file(l),
                None => inbox.closed = true,
            }
            self.arrived.notify_all();
        }
    }
}

fn stdin_line() -> Option<String> {
    let mut l = String::new();
    (std::io::stdin().lock().read_line(&mut l).unwrap_or(0) > 0).then_some(l)
}

impl Atlas {
    pub fn new() -> Atlas {
        Atlas { plugin: std::env::var("ATLAS_PLUGIN_ID").ok().filter(|k| !k.is_empty()) }
    }

    /// One call to the API: `path` as the pages use it (`/api/file?path=…`); the JSON answer (`Null` when empty).
    pub fn call(&self, verb: Verb, path: &str, body: Option<&Value>) -> Result<Value> {
        self.exchange(verb, path, ("body", json!(body)))
    }

    /// A call whose body is a file's bytes (`PUT /api/raw`), base64 on the pipe.
    fn call_bytes(&self, verb: Verb, path: &str, bytes: &[u8]) -> Result<Value> {
        self.exchange(verb, path, ("bytes", Value::String(base64(bytes))))
    }

    fn exchange(&self, verb: Verb, path: &str, (key, body): (&str, Value)) -> Result<Value> {
        let n = NEXT.fetch_add(1, Ordering::Relaxed) + 1;
        let mut msg = json!({ "call": n, "verb": verb.as_str(), "path": path });
        msg[key] = body;
        send(&msg);
        // the core's requests read meanwhile are kept for `serve`
        let Some(line) = PIPE.next(Want::Reply(n), &stdin_line) else { return fail("Atlas closed the pipe") };
        let msg: Value = serde_json::from_str(&line).unwrap_or(Value::Null);
        let status = msg.get("status").and_then(Value::as_u64).unwrap_or(500) as u16;
        let value = msg.get("body").cloned().unwrap_or(Value::Null);
        if !(200..300).contains(&status) {
            let why = value.get("error").and_then(Value::as_str).map_or_else(|| value.to_string(), str::to_string);
            return Err(Error { status: Some(status), why: format!("{} {path}: {why}", verb.as_str()) });
        }
        Ok(value)
    }

    pub fn get(&self, path: &str) -> Result<Value> {
        self.call(Verb::Get, path, None)
    }

    pub fn post(&self, path: &str, body: &Value) -> Result<Value> {
        self.call(Verb::Post, path, Some(body))
    }

    pub fn put(&self, path: &str, body: &Value) -> Result<Value> {
        self.call(Verb::Put, path, Some(body))
    }

    // ---- files and notes ----------------------------------------------------------------------------------------

    /// A text file of the vault (a path from its top).
    pub fn read(&self, path: &str) -> Result<String> {
        let v = self.get(&format!("/api/file?path={}", q(path)))?;
        Ok(v["text"].as_str().unwrap_or_default().to_string())
    }

    /// Writes a text file of the vault (made with its folders when new); the open tabs follow.
    pub fn write(&self, path: &str, text: &str) -> Result<()> {
        self.put("/api/file", &json!({ "path": path, "text": text })).map(drop)
    }

    /// Writes any file of the vault as its bytes (a PDF, an attachment, a picture), made with its folders when new.
    pub fn write_bytes(&self, path: &str, bytes: &[u8]) -> Result<()> {
        self.call_bytes(Verb::Put, &format!("/api/raw?path={}", q(path)), bytes).map(drop)
    }

    /// Every file's path; `index`: only what search indexes.
    pub fn files(&self, index: bool) -> Result<Vec<String>> {
        let v = self.get(if index { "/api/files?index=true" } else { "/api/files" })?;
        Ok(v.as_array().map(|a| a.iter().filter_map(|p| p.as_str().map(str::to_string)).collect()).unwrap_or_default())
    }

    /// One folder's entries (`{name, path, kind: "dir" | "file", …}`).
    pub fn tree(&self, folder: &str) -> Result<Value> {
        self.get(&format!("/api/tree?path={}", q(folder)))
    }

    /// Full-text search: `{"files": […], "lines": [{path, line, text}]}`.
    pub fn search(&self, query: &str) -> Result<Value> {
        self.get(&format!("/api/search?q={}", q(query)))
    }

    /// A capture, as the capture box makes it (`[] …` a to-do, `@tomorrow` a date).
    pub fn capture(&self, text: &str) -> Result<Value> {
        self.post("/api/capture", &json!({ "text": text }))
    }

    // ---- this plugin's secrets (outside the vault; a program reads only its own plugin's) -----------------------

    fn secret_path(&self, name: &str) -> Result<String> {
        let Some(id) = &self.plugin else { return fail("ATLAS_PLUGIN_ID is not set: this program was not started by Atlas") };
        Ok(format!("/api/plugins/{}/secrets/{}", q(id), q(name)))
    }

    /// This plugin's secret `name` (None: not set).
    pub fn secret(&self, name: &str) -> Result<Option<String>> {
        Ok(self.get(&self.secret_path(name)?)?["value"].as_str().map(str::to_string))
    }

    pub fn set_secret(&self, name: &str, value: &str) -> Result<()> {
        self.put(&self.secret_path(name)?, &json!({ "value": value })).map(drop)
    }
}

// ---- writing the vault's files (PLUGIN-MATURITY.md, criterion 11) ----------------------------------------------

/// `path` from the vault's top when a helper Atlas started writes it: inside ATLAS_ROOT and not a cache. Through Atlas
/// the search index, the mirror and the open tabs follow; anything else (a test, a run by hand, a cache) is written
/// straight to the disk.
fn through_atlas(path: &std::path::Path) -> Option<String> {
    std::env::var("ATLAS_PLUGIN_ID").ok().filter(|id| !id.is_empty())?;
    let root = std::path::PathBuf::from(std::env::var_os("ATLAS_ROOT")?);
    let rel = path.strip_prefix(&root).ok()?;
    let rel = rel.components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/");
    (!rel.is_empty() && !rel.starts_with(".atlas/cache/")).then_some(rel)
}

/// Writes a file of the vault (an absolute path; its folders made when new), through Atlas when Atlas started this
/// program — and straight to the disk when Atlas answers that it is not serving the vault (`atlas mcp`).
pub fn write_file(path: impl AsRef<std::path::Path>, bytes: &[u8]) -> Result<()> {
    let path = path.as_ref();
    if let Some(rel) = through_atlas(path) {
        match Atlas::new().write_bytes(&rel, bytes) {
            Err(e) if e.status == Some(503) => {}
            done => return done,
        }
    }
    let io = |e: std::io::Error| error(format!("cannot write {}: {e}", path.display()));
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(io)?;
    }
    std::fs::write(path, bytes).map_err(io)
}

/// Moves a file or folder of the vault (absolute paths), through Atlas as [`write_file`] does: the links to it follow.
pub fn move_path(from: impl AsRef<std::path::Path>, to: impl AsRef<std::path::Path>) -> Result<()> {
    let (from, to) = (from.as_ref(), to.as_ref());
    if let (Some(a), Some(b)) = (through_atlas(from), through_atlas(to)) {
        match Atlas::new().post("/api/fs/move", &json!({ "from": a, "to": b })) {
            Err(e) if e.status == Some(503) => {}
            done => return done.map(drop),
        }
    }
    let io = |e: std::io::Error| error(format!("cannot move {}: {e}", from.display()));
    if let Some(dir) = to.parent() {
        std::fs::create_dir_all(dir).map_err(io)?;
    }
    std::fs::rename(from, to).map_err(io)
}

/// Standard base64 with padding (the pipe is JSON lines).
fn base64(b: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(b.len().div_ceil(3) * 4);
    for c in b.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            out.push(if i <= c.len() { A[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
        }
    }
    out
}

/// Percent-encodes a query or path part.
pub fn q(s: &str) -> String {
    s.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-._~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

// ---- the helper's side of the protocol --------------------------------------------------------------------------

type Method = Box<dyn FnMut(Value) -> Result<Value>>;

/// A helper's methods by name, for [`serve`].
#[derive(Default)]
pub struct Methods(HashMap<String, Method>);

impl Methods {
    pub fn new() -> Self {
        Self::default()
    }

    /// `f(params)` answers the method `name` (a tool's arguments arrive with `settings` and `secrets` beside them).
    pub fn add(&mut self, name: &str, f: impl FnMut(Value) -> Result<Value> + 'static) -> &mut Self {
        self.0.insert(name.to_string(), Box::new(f));
        self
    }
}

/// An event for the page's `atlas.helper.on(name, …)`.
pub fn event(name: &str, data: Value) {
    send(&json!({ "event": name, "data": data }));
}

fn send(v: &Value) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{v}");
    let _ = out.flush();
}

/// The helper's loop: one request per line on stdin, its answer on stdout, until stdin closes.
pub fn serve(mut methods: Methods) {
    // until Atlas closes stdin
    while let Some(line) = PIPE.next(Want::Request, &stdin_line) {
        if let Some(answer) = answer(&mut methods, line.trim()) {
            send(&answer);
        }
    }
}

/// The answer to one line (None: an empty line). Kept apart from the loop so it can be tested.
fn answer(methods: &mut Methods, line: &str) -> Option<Value> {
    let (id, name, params) = request(line)?;
    let outcome = methods.0.get_mut(&name).map(|f| f(params));
    Some(reply(id, &name, outcome, || methods.0.keys().cloned().collect()))
}

/// A request line's id, method and params (None: empty, or not JSON — said on stderr).
fn request(line: &str) -> Option<(Value, String, Value)> {
    if line.is_empty() {
        return None;
    }
    let Ok(req) = serde_json::from_str::<Value>(line) else {
        eprintln!("atlas-plugin: not JSON: {}", line.chars().take(200).collect::<String>());
        return None;
    };
    let id = req.get("id").cloned().unwrap_or(Value::Null);
    let name = req.get("method").and_then(Value::as_str).unwrap_or_default().to_string();
    Some((id, name, req.get("params").cloned().unwrap_or_else(|| json!({}))))
}

/// The answer line: the result, the method's reason, or (no such method) the ones there are.
fn reply(id: Value, name: &str, outcome: Option<Result<Value>>, names: impl FnOnce() -> Vec<String>) -> Value {
    match outcome {
        None => {
            let mut has = names();
            has.sort_unstable();
            json!({ "id": id, "error": format!("no method {name:?} (has: {})", if has.is_empty() { "none".into() } else { has.join(", ") }) })
        }
        Some(Ok(result)) => json!({ "id": id, "result": result }),
        Some(Err(e)) => json!({ "id": id, "error": e.why }),
    }
}

type SharedMethod = std::sync::Arc<dyn Fn(Value) -> Result<Value> + Send + Sync>;

/// A helper's methods for [`serve_threads`]: each may run beside the others, so they share their state themselves.
#[derive(Default, Clone)]
pub struct SharedMethods(HashMap<String, SharedMethod>);

impl SharedMethods {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, name: &str, f: impl Fn(Value) -> Result<Value> + Send + Sync + 'static) -> &mut Self {
        self.0.insert(name.to_string(), std::sync::Arc::new(f));
        self
    }
}

/// [`serve`], each request answered in a thread of its own: a long call (a command on a host) holds up no other, and a
/// call may wait for another one (the page saying a tab it was asked for is open).
pub fn serve_threads(methods: SharedMethods) {
    let methods = std::sync::Arc::new(methods);
    while let Some(line) = PIPE.next(Want::Request, &stdin_line) {
        let Some((id, name, params)) = request(line.trim()) else { continue };
        let m = methods.clone();
        std::thread::spawn(move || {
            let outcome = m.0.get(&name).map(|f| f(params));
            send(&reply(id, &name, outcome, || m.0.keys().cloned().collect()));
        });
    }
}

/// A failure with this reason, for a method's answer.
pub fn error(why: impl Into<String>) -> Error {
    Error { status: None, why: why.into() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn without_atlas_a_file_is_written_to_the_disk_with_its_folders() {
        // no ATLAS_PLUGIN_ID in a test: the disk, as in a run by hand
        let d = std::env::temp_dir().join(format!("atlas-plugin-test-{}", std::process::id()));
        write_file(d.join("a/b/x.md"), b"hi").unwrap();
        assert_eq!(std::fs::read(d.join("a/b/x.md")).unwrap(), b"hi");
        move_path(d.join("a/b"), d.join("c/b")).unwrap();
        assert!(d.join("c/b/x.md").is_file());
        assert_eq!(through_atlas(&d.join("c/b/x.md")), None);
        std::fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn base64_as_the_core_reads_it() {
        assert_eq!(base64(b"%PDF"), "JVBERg==");
        assert_eq!(base64(b"ab"), "YWI=");
        assert_eq!(base64(b"abc"), "YWJj");
        assert_eq!(base64(b""), "");
    }

    #[test]
    fn a_request_line_gets_its_answer_or_the_reason() {
        let mut m = Methods::new();
        m.add("twice", |p| Ok(json!(p["n"].as_i64().unwrap_or(0) * 2)));
        m.add("fails", |_| fail("no luck"));
        assert_eq!(answer(&mut m, r#"{"id":1,"method":"twice","params":{"n":21}}"#), Some(json!({"id":1,"result":42})));
        assert_eq!(answer(&mut m, r#"{"id":2,"method":"fails"}"#), Some(json!({"id":2,"error":"no luck"})));
        let none = answer(&mut m, r#"{"id":3,"method":"nope"}"#).unwrap();
        assert!(none["error"].as_str().unwrap().contains("has: fails, twice"));
        assert_eq!(answer(&mut m, ""), None);
    }

    /// A listener thread's call and `serve` share stdin: whoever reads files the line for whoever waits for it.
    #[test]
    fn replies_reach_their_caller_and_requests_wait_for_serve_whichever_thread_reads() {
        let pipe = std::sync::Arc::new(Pipe::new());
        let lines = std::sync::Arc::new(Mutex::new(VecDeque::from([
            r#"{"id":1,"method":"list"}"#.to_string(),
            r#"{"reply":7,"status":200,"body":{"ok":true}}"#.to_string(),
            r#"{"id":2,"method":"add"}"#.to_string(),
        ])));
        let src = lines.clone();
        let read = move || src.lock().unwrap().pop_front();
        let (p, r) = (pipe.clone(), read.clone());
        let caller = std::thread::spawn(move || p.next(Want::Reply(7), &r));
        let first = pipe.next(Want::Request, &read).unwrap();
        assert!(first.contains(r#""id":1"#), "{first}");
        assert!(caller.join().unwrap().unwrap().contains(r#""reply":7"#));
        assert!(pipe.next(Want::Request, &read).unwrap().contains(r#""id":2"#));
        assert_eq!(pipe.next(Want::Request, &read), None, "closed");
        assert_eq!(pipe.next(Want::Reply(8), &read), None, "a call after the end fails at once");
    }
}
