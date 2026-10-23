//! A plugin's helper: a program of the plugin's own that stays running (docs/guides/PLUGINS.md "v4").
//! This is what lets a plugin be fast, keep a connection open (mail, SSH, a database) or use
//! compiled code — in any language, because the helper is only spoken to:
//!
//! * one JSON object per line, both ways;
//! * the core writes `{"id": 7, "method": "search", "params": …}` and the helper answers with a
//!   line carrying the same id: `{"id": 7, "result": …}` or `{"id": 7, "error": "why"}`;
//! * a line from the helper **without** an id is an event, `{"event": "new-mail", "data": …}`, sent
//!   on to the page (`atlas.helper.on`);
//! * stderr, and any line that is not JSON, go to the plugin's log file.
//!
//! The helper is started by the first call (`[helper] run = "…"` in plugin.toml; cwd = the vault,
//! `$ATLAS_ROOT`, `$ATLAS_PLUGIN_DIR`, `$ATLAS_PLUGIN_CACHE`), in its own process group. When it
//! exits, calls in flight fail and the next call starts it again — unless it has died too often.
use crate::api::Event;
use crate::events::EventBus;
use crate::{plugins, Error, Result};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::oneshot;

/// A call the helper does not answer in this time fails (the helper keeps running).
pub const CALL_TIMEOUT: Duration = Duration::from_secs(60);
/// Started this many times within [`CRASH_WINDOW`], it is left stopped until asked to restart.
const CRASH_LIMIT: usize = 5;
const CRASH_WINDOW: Duration = Duration::from_secs(600);

type Reply = oneshot::Sender<std::result::Result<Value, String>>;

struct Running {
    stdin: tokio::sync::Mutex<tokio::process::ChildStdin>,
    waiting: Mutex<HashMap<u64, Reply>>,
    next: AtomicU64,
    pid: Option<u32>,
    /// plugin.toml's mtime when it started: an update rewrites it, and the next call starts the new helper
    stamp: Option<std::time::SystemTime>,
}

impl Running {
    /// Everyone still waiting is told; nobody is left hanging.
    fn fail_all(&self, why: &str) {
        for (_, tx) in self.waiting.lock().unwrap().drain() {
            let _ = tx.send(Err(why.to_string()));
        }
    }

    fn kill(&self) {
        #[cfg(unix)]
        if let Some(pid) = self.pid {
            // the whole group: a helper started through `sh -c` is the shell's child
            let _ = std::process::Command::new("kill").args(["-TERM", "--", &format!("-{pid}")]).status();
        }
    }
}

#[derive(Default)]
struct Slot {
    running: Option<Arc<Running>>,
    starts: Vec<Instant>,
}

/// The helpers of one vault. Cheap to clone.
#[derive(Clone)]
pub struct Helpers {
    root: PathBuf,
    bus: EventBus,
    slots: Arc<Mutex<HashMap<String, Slot>>>,
    /// the vault's routes, answering the helpers' calls back in-process (helper_api.rs); unset where nothing serves the
    /// vault (`atlas mcp` running a helper itself), and a call is then answered 503
    routes: Arc<std::sync::OnceLock<axum::Router>>,
}

fn manifest_stamp(root: &Path, id: &str) -> Option<std::time::SystemTime> {
    std::fs::metadata(root.join(plugins::PLUGINS_DIR).join(id).join("plugin.toml")).and_then(|m| m.modified()).ok()
}

/// The log's last lines, for an error that would otherwise only say the helper is gone (a broken pipe).
fn log_tail(root: &Path, id: &str) -> String {
    let text = std::fs::read_to_string(root.join(".atlas/cache/plugins").join(format!("{id}.log"))).unwrap_or_default();
    let lines: Vec<&str> = text.lines().collect();
    lines[lines.len().saturating_sub(5)..].join(" · ")
}

fn log(root: &Path, id: &str, line: &str) {
    let file = root.join(".atlas/cache/plugins").join(format!("{id}.log"));
    let _ = crate::vault_write::cache::append(&file, format!("{} {line}\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S")).as_bytes());
}

impl Helpers {
    pub fn new(root: &Path, bus: EventBus) -> Self {
        Self { root: root.to_path_buf(), bus, slots: Arc::default(), routes: Arc::default() }
    }

    /// The routes the helpers' calls go through (the server, once the vault's router exists).
    pub fn answer_with(&self, routes: axum::Router) {
        let _ = self.routes.set(routes);
    }

    /// `stopped`, `running`, or `crashed` (died too often; `restart` clears it).
    pub fn state(&self, id: &str) -> &'static str {
        let slots = self.slots.lock().unwrap();
        match slots.get(id) {
            Some(s) if s.running.is_some() => "running",
            Some(s) if s.starts.len() >= CRASH_LIMIT => "crashed",
            _ => "stopped",
        }
    }

    pub fn stop(&self, id: &str) {
        let taken = self.slots.lock().unwrap().remove(id).and_then(|s| s.running);
        if let Some(r) = taken {
            r.fail_all("the helper was stopped");
            r.kill();
        }
    }

    pub fn stop_all(&self) {
        let ids: Vec<String> = self.slots.lock().unwrap().keys().cloned().collect();
        for id in ids {
            self.stop(&id);
        }
    }

    /// Starts the helper of `id` if it is not running (`[helper] start = "open"`).
    pub fn start(&self, id: &str) -> Result<()> {
        self.running(id).map(|_| ())
    }

    /// The running helper of `id`, started now if it is not.
    fn running(&self, id: &str) -> Result<Arc<Running>> {
        let mut slots = self.slots.lock().unwrap();
        let slot = slots.entry(id.to_string()).or_default();
        let stamp = manifest_stamp(&self.root, id);
        if let Some(r) = &slot.running {
            if r.stamp == stamp {
                return Ok(r.clone());
            }
            // the plugin was updated under its running helper (`atlas plugin update`, a copy): the old one goes
            log(&self.root, id, "[atlas] plugin.toml changed: the helper restarts");
            r.fail_all("the plugin was updated: its helper restarted");
            r.kill();
            slot.running = None;
        }
        let now = Instant::now();
        slot.starts.retain(|t| now.duration_since(*t) < CRASH_WINDOW);
        if slot.starts.len() >= CRASH_LIMIT {
            return Err(Error::CommandFailed(format!(
                "plugin {id}: its helper stopped {CRASH_LIMIT} times in ten minutes and is left stopped — see .atlas/cache/plugins/{id}.log, then restart it"
            )));
        }
        let run = plugins::helper_command(&self.root, id)?;
        let dir = self.root.join(plugins::PLUGINS_DIR).join(id);
        let cache = self.root.join(".atlas/cache/plugins").join(id);
        crate::vault_write::cache::mkdir(&cache)?;
        let mut cmd = tokio::process::Command::new("sh");
        cmd.arg("-c")
            .arg(&run)
            .current_dir(&self.root)
            .env("ATLAS_ROOT", &self.root)
            .env("ATLAS_PLUGIN_DIR", &dir)
            .env("ATLAS_PLUGIN_TARGET", plugins::target())
            .env("ATLAS_PLUGIN_CACHE", &cache)
            .envs(crate::helper_api::env(&self.root, id)) // the core's address and the plugin's key: helper_api.rs
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        cmd.process_group(0);
        let mut child = cmd.spawn().map_err(|e| Error::CommandFailed(format!("plugin {id}: helper: {e}")))?;
        let (stdin, stdout, stderr) = (child.stdin.take(), child.stdout.take(), child.stderr.take());
        let (Some(stdin), Some(stdout), Some(stderr)) = (stdin, stdout, stderr) else {
            return Err(Error::CommandFailed(format!("plugin {id}: helper: no pipes")));
        };
        let r = Arc::new(Running { stdin: tokio::sync::Mutex::new(stdin), waiting: Mutex::default(), next: AtomicU64::new(1), pid: child.id(), stamp });
        slot.running = Some(r.clone());
        slot.starts.push(now);
        log(&self.root, id, &format!("[atlas] helper started: {run}"));

        // stderr → the plugin's log
        let (root, pid) = (self.root.clone(), id.to_string());
        let errs = tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                log(&root, &pid, &l);
            }
        });
        // stdout → answers and events; when it ends the helper is gone
        let (me, pid, mine) = (self.clone(), id.to_string(), r.clone());
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                me.incoming(&pid, &mine, &l);
            }
            let status = child.wait().await.map(|s| s.to_string()).unwrap_or_else(|e| e.to_string());
            let _ = tokio::time::timeout(Duration::from_secs(1), errs).await; // its last words logged first
            log(&me.root, &pid, &format!("[atlas] helper exited: {status}"));
            mine.fail_all(&format!("the helper exited ({status}) — its log: {}", log_tail(&me.root, &pid)));
            // only if it is still the one in the slot (a restart may have put a new one there)
            let mut slots = me.slots.lock().unwrap();
            if let Some(s) = slots.get_mut(&pid) {
                if s.running.as_ref().is_some_and(|cur| Arc::ptr_eq(cur, &mine)) {
                    s.running = None;
                }
            }
            drop(slots);
            me.bus.publish(Event::Plugin { plugin: pid.clone(), event: "helper:exit".into(), data: json!({ "status": status }) });
        });
        Ok(r)
    }

    /// One line from the helper.
    fn incoming(&self, id: &str, r: &Arc<Running>, line: &str) {
        let Ok(Value::Object(mut msg)) = serde_json::from_str::<Value>(line) else {
            log(&self.root, id, line); // not JSON: a print the author left in
            return;
        };
        if let Some(call) = crate::helper_api::Call::parse(&msg) {
            let (routes, id, r) = (self.routes.get().cloned(), id.to_string(), r.clone());
            tokio::spawn(async move {
                let (n, status, body) = match call {
                    Err((n, why)) => (n, 400, json!({ "error": why })),
                    Ok(c) => {
                        let n = c.n;
                        let (status, body) = answer_call(routes, &id, c).await;
                        (n, status, body)
                    }
                };
                let line = format!("{}\n", json!({ "reply": n, "status": status, "body": body }));
                let _ = r.stdin.lock().await.write_all(line.as_bytes()).await;
            });
        } else if let Some(n) = msg.get("id").and_then(Value::as_u64) {
            let Some(tx) = r.waiting.lock().unwrap().remove(&n) else { return };
            let answer = match msg.remove("error") {
                Some(Value::Null) | None => Ok(msg.remove("result").unwrap_or(Value::Null)),
                Some(Value::String(s)) => Err(s),
                Some(Value::Object(o)) => Err(o.get("message").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| Value::Object(o).to_string())),
                Some(other) => Err(other.to_string()),
            };
            let _ = tx.send(answer);
        } else if let Some(event) = msg.get("event").and_then(Value::as_str).map(str::to_string) {
            self.bus.publish(Event::Plugin { plugin: id.to_string(), event, data: msg.remove("data").unwrap_or(Value::Null) });
        } else {
            log(&self.root, id, line);
        }
    }

    /// Ask the helper of plugin `id` and wait for its answer.
    pub async fn call(&self, id: &str, method: &str, params: Value, timeout: Duration) -> Result<Value> {
        let r = self.running(id)?;
        let n = r.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        r.waiting.lock().unwrap().insert(n, tx);
        let line = format!("{}\n", json!({ "id": n, "method": method, "params": params }));
        let wrote = { r.stdin.lock().await.write_all(line.as_bytes()).await };
        if let Err(e) = wrote {
            // the helper is gone: its exit, with the log's last lines, comes through `rx` once noticed
            return match tokio::time::timeout(Duration::from_secs(2), rx).await {
                Ok(Ok(Err(why))) => Err(Error::CommandFailed(format!("plugin {id}: {method}: {why}"))),
                _ => {
                    r.waiting.lock().unwrap().remove(&n);
                    Err(Error::CommandFailed(format!("plugin {id}: helper not reachable: {e} — its log: {}", log_tail(&self.root, id))))
                }
            };
        }
        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(Ok(v))) => Ok(v),
            Ok(Ok(Err(why))) => Err(Error::CommandFailed(format!("plugin {id}: {method}: {why}"))),
            Ok(Err(_)) => Err(Error::CommandFailed(format!("plugin {id}: {method}: the helper went away"))),
            Err(_) => {
                r.waiting.lock().unwrap().remove(&n);
                Err(Error::CommandFailed(format!("plugin {id}: {method}: no answer in {}s", timeout.as_secs())))
            }
        }
    }
}

/// One call back from a helper, through the vault's routes as the plugin (the guard reads the [`Caller`] mark).
///
/// [`Caller`]: crate::helper_api::Caller
async fn answer_call(routes: Option<axum::Router>, id: &str, c: crate::helper_api::Call) -> (u16, Value) {
    use tower::ServiceExt;
    let Some(routes) = routes else {
        return (503, json!({ "error": "Atlas is not serving this vault here (atlas mcp started the helper): start Atlas to call it back" }));
    };
    let mut req = axum::http::Request::builder().method(c.verb).uri(&c.path).header("content-type", "application/json");
    if let Some(ext) = req.extensions_mut() {
        ext.insert(crate::helper_api::Caller(id.to_string()));
    }
    let body = c.body.map_or_else(axum::body::Body::empty, |b| axum::body::Body::from(b.to_string()));
    let Ok(req) = req.body(body) else { return (400, json!({ "error": format!("not a request: {}", c.path) })) };
    let res = match routes.oneshot(req).await {
        Ok(r) => r,
        Err(e) => return (500, json!({ "error": e.to_string() })),
    };
    let status = res.status().as_u16();
    let bytes = axum::body::to_bytes(res.into_body(), 256 * 1024 * 1024).await.unwrap_or_default();
    let text = String::from_utf8_lossy(&bytes);
    (status, if text.trim().is_empty() { Value::Null } else { serde_json::from_str(&text).unwrap_or_else(|_| Value::String(text.into_owned())) })
}

impl Drop for Running {
    fn drop(&mut self) {
        self.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // a helper in ~15 lines of Python: echo, an event, a failure, a crash on demand
    const HELPER: &str = r#"
import json, sys
print("starting up", file=sys.stderr, flush=True)
n = 0
for line in sys.stdin:
    m = json.loads(line); n += 1
    if m["method"] == "echo":
        print(json.dumps({"id": m["id"], "result": {"got": m["params"], "calls": n}}), flush=True)
    elif m["method"] == "notify":
        print(json.dumps({"event": "ping", "data": {"n": n}}), flush=True)
        print(json.dumps({"id": m["id"], "result": None}), flush=True)
    elif m["method"] == "fail":
        print(json.dumps({"id": m["id"], "error": {"message": "no such thing"}}), flush=True)
    elif m["method"] == "die":
        sys.exit(3)
    elif m["method"] == "silent":
        pass
"#;

    fn vault() -> tempfile::TempDir {
        let t = tempfile::tempdir().unwrap();
        let d = t.path().join(".atlas/plugins/h");
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("helper.py"), HELPER).unwrap();
        std::fs::write(d.join("plugin.toml"), "title = \"H\"\n[helper]\nrun = \"python3 -u \\\"$ATLAS_PLUGIN_DIR/helper.py\\\"\"\n").unwrap();
        t
    }

    #[tokio::test]
    async fn a_helper_stays_alive_between_calls_sends_events_and_is_restarted_after_it_dies() {
        let t = vault();
        let bus = EventBus::default();
        let mut events = bus.subscribe();
        let h = Helpers::new(t.path(), bus);
        assert_eq!(h.state("h"), "stopped");
        let a = h.call("h", "echo", json!({ "x": 1 }), CALL_TIMEOUT).await.unwrap();
        let b = h.call("h", "echo", json!("two"), CALL_TIMEOUT).await.unwrap();
        assert_eq!((a, b), (json!({ "got": { "x": 1 }, "calls": 1 }), json!({ "got": "two", "calls": 2 })), "one process: it counted both calls");
        assert_eq!(h.state("h"), "running");

        h.call("h", "notify", Value::Null, CALL_TIMEOUT).await.unwrap();
        assert_eq!(events.recv().await.unwrap(), Event::Plugin { plugin: "h".into(), event: "ping".into(), data: json!({ "n": 3 }) });

        let e = h.call("h", "fail", Value::Null, CALL_TIMEOUT).await.unwrap_err().to_string();
        assert!(e.contains("no such thing"), "{e}");
        let e = h.call("h", "silent", Value::Null, Duration::from_millis(300)).await.unwrap_err().to_string();
        assert!(e.contains("no answer"), "{e}");

        // it dies in the middle of a call: the call fails, the next one starts a new process
        let e = h.call("h", "die", Value::Null, CALL_TIMEOUT).await.unwrap_err().to_string();
        assert!(e.contains("exited") || e.contains("went away"), "{e}");
        loop {
            if let Event::Plugin { event, .. } = events.recv().await.unwrap() {
                if event == "helper:exit" {
                    break;
                }
            }
        }
        assert_eq!(h.state("h"), "stopped");
        assert_eq!(h.call("h", "echo", json!(1), CALL_TIMEOUT).await.unwrap(), json!({ "got": 1, "calls": 1 }), "a new process, counting from one");

        let log = std::fs::read_to_string(t.path().join(".atlas/cache/plugins/h.log")).unwrap();
        assert!(log.contains("starting up") && log.contains("helper exited"), "{log}");
        h.stop("h");
        assert_eq!(h.state("h"), "stopped");
        // no [helper] in the manifest: a clear refusal
        std::fs::write(t.path().join(".atlas/plugins/h/plugin.toml"), "title = \"H\"\n").unwrap();
        let e = h.call("h", "echo", Value::Null, CALL_TIMEOUT).await.unwrap_err().to_string();
        assert!(e.contains("[helper]"), "{e}");
    }

    /// An update rewrites plugin.toml under a running helper: the next call gets the new helper, not the old one.
    #[tokio::test]
    async fn a_helper_is_restarted_once_its_plugin_is_updated() {
        let t = vault();
        let h = Helpers::new(t.path(), EventBus::default());
        h.call("h", "echo", json!(1), CALL_TIMEOUT).await.unwrap();
        assert_eq!(h.call("h", "echo", json!(2), CALL_TIMEOUT).await.unwrap()["calls"], 2);
        let toml = t.path().join(".atlas/plugins/h/plugin.toml");
        let f = std::fs::File::options().append(true).open(&toml).unwrap();
        f.set_modified(std::time::SystemTime::now() + Duration::from_secs(5)).unwrap();
        assert_eq!(h.call("h", "echo", json!(3), CALL_TIMEOUT).await.unwrap()["calls"], 1, "a new process, counting from one");
        h.stop("h");
    }

    /// A helper is any program speaking the protocol, not only a script: here one compiled from Rust, found by
    /// `$ATLAS_PLUGIN_TARGET` as a plugin carrying builds for several platforms would.
    #[tokio::test]
    async fn a_compiled_helper_runs_like_a_script() {
        let t = vault();
        let d = t.path().join(".atlas/plugins/h");
        let src = d.join("helper.rs");
        std::fs::write(&src, r#"use std::io::BufRead;
fn main() {
    for l in std::io::stdin().lock().lines() {
        let l = l.unwrap();
        let id: String = l.split("\"id\":").nth(1).unwrap().chars().take_while(|c| c.is_ascii_digit()).collect();
        println!("{{\"id\":{id},\"result\":\"{}\"}}", std::env::var("ATLAS_PLUGIN_TARGET").unwrap());
    }
}"#).unwrap();
        let out = d.join("bin").join(plugins::target());
        std::fs::create_dir_all(&out).unwrap();
        let built = std::process::Command::new(std::env::var("RUSTC").unwrap_or("rustc".into()))
            .arg("-O").arg("-o").arg(out.join("helper")).arg(&src).status().unwrap();
        assert!(built.success(), "rustc");
        std::fs::write(d.join("plugin.toml"), "title = \"H\"\n[helper]\nrun = \"\\\"$ATLAS_PLUGIN_DIR/bin/$ATLAS_PLUGIN_TARGET/helper\\\"\"\n").unwrap();
        let h = Helpers::new(t.path(), EventBus::default());
        assert_eq!(h.call("h", "anything", Value::Null, CALL_TIMEOUT).await.unwrap(), json!(plugins::target()));
        h.stop("h");
    }

    /// A helper that cannot start (its program missing on this machine) says why in the call's error, not a broken pipe.
    #[tokio::test]
    async fn a_helper_that_dies_at_once_tells_why_in_the_error() {
        let t = vault();
        std::fs::write(t.path().join(".atlas/plugins/h/plugin.toml"), "title = \"H\"\n[helper]\nrun = \"echo 'bin/x86_64-linux/h: not found' >&2; exit 127\"\n").unwrap();
        let h = Helpers::new(t.path(), EventBus::default());
        let e = h.call("h", "echo", Value::Null, Duration::from_secs(5)).await.unwrap_err().to_string();
        assert!(e.contains("not found"), "{e}");
        h.stop("h");
    }

    #[tokio::test]
    async fn a_helper_that_keeps_dying_is_left_stopped() {
        let t = vault();
        std::fs::write(t.path().join(".atlas/plugins/h/plugin.toml"), "title = \"H\"\n[helper]\nrun = \"exit 1\"\n").unwrap();
        let h = Helpers::new(t.path(), EventBus::default());
        let mut last = String::new();
        for _ in 0..CRASH_LIMIT + 2 {
            last = h.call("h", "echo", Value::Null, Duration::from_secs(5)).await.unwrap_err().to_string();
            // let the exit be noticed before asking again
            for _ in 0..200 {
                if h.state("h") != "running" {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }
        assert!(last.contains("left stopped"), "{last}");
        assert_eq!(h.state("h"), "crashed");
        h.stop("h"); // "restart": the count is forgotten
        assert_eq!(h.state("h"), "stopped");
    }
}
