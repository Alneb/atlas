//! A plugin's helper written in JavaScript (`[helper] js = "helper.js"`), run inside the core by QuickJS instead of as
//! a process (docs/design/DESIGN-js-helpers.md). One runtime and context per plugin, on a thread of its own, speaking
//! the same JSON lines as a process helper (helper.rs reads them the same way): the SDK prelude (sdk/js/prelude.js)
//! turns `atlas.*` into those lines, so calls back, `fetch` within `[permissions] net` and secrets go through the
//! vault's routes exactly as a Python helper's do.
//!
//! Limits, per context: [`Limits::memory`] (QuickJS's allocator refuses more; the allocation throws), and
//! [`Limits::turn`], the CPU time one turn (a call, a reply, a timer, and the promise jobs they start) may take before
//! the interrupt handler ends it — a helper stuck in a loop is then stopped, its calls fail, and the next call starts it
//! again (counted as a crash by helper.rs).
use rquickjs::{CatchResultExt, Context, Ctx, Function, Object, Runtime};
use std::cell::{Cell, RefCell};
use std::cmp::Reverse;
use std::collections::BinaryHeap;
use std::path::PathBuf;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};

/// The SDK every JS helper starts with: `atlas.*`, `console`, timers.
pub const PRELUDE: &str = include_str!("../sdk/js/prelude.js");

#[derive(Clone, Copy, Debug)]
pub struct Limits {
    /// Bytes the context may hold.
    pub memory: usize,
    /// CPU time of one turn.
    pub turn: Duration,
}

pub const LIMITS: Limits = Limits { memory: 128 << 20, turn: Duration::from_secs(5) };

/// What the helper says: a protocol line, a log line, or that it ended (and why).
#[derive(Debug, PartialEq)]
pub enum Out {
    Line(String),
    Log(String),
    Exit(String),
}

enum In {
    Line(String),
    /// An `atlas.exec` run ended: the script's run number and its answer (js_exec.rs), as JSON.
    Exec(u64, String),
    Stop,
}

/// The core's end of a running JS helper. Dropping it stops the helper.
pub struct Handle {
    tx: mpsc::Sender<In>,
    stop: Arc<AtomicBool>,
}

impl Handle {
    /// One protocol line to the helper; an error once it has ended.
    pub fn send(&self, line: &str) -> std::io::Result<()> {
        self.tx.send(In::Line(line.to_string())).map_err(|_| std::io::Error::new(std::io::ErrorKind::BrokenPipe, "the JS helper has ended"))
    }

    /// Ends it, interrupting a turn in progress.
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
        let _ = self.tx.send(In::Stop);
    }
}

impl Drop for Handle {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Starts plugin `id`'s helper from `file` on a thread of its own. Its lines come out of the receiver, which ends with
/// one [`Out::Exit`].
/// `exec`: the programs its manifest lets it run (`[permissions] exec`).
pub fn start(root: &std::path::Path, id: &str, file: PathBuf, limits: Limits, exec: Vec<String>) -> std::io::Result<(Handle, UnboundedReceiver<Out>)> {
    let (tx, rx) = mpsc::channel();
    let (out, outs) = unbounded_channel();
    let stop = Arc::new(AtomicBool::new(false));
    let (root, id, halt, inbox) = (root.to_path_buf(), id.to_string(), stop.clone(), tx.clone());
    std::thread::Builder::new().name(format!("js-helper:{id}")).stack_size(8 << 20).spawn(move || {
        let status = match Engine::new(&root, &id, limits, out.clone(), halt, Exec { allowed: exec, inbox }) {
            Ok(engine) => engine.run(&file, rx),
            Err(e) => format!("the JavaScript engine did not start: {e}"),
        };
        let _ = out.send(Out::Exit(status));
    })?;
    Ok((Handle { tx, stop }, outs))
}

/// What `atlas.exec` may run, and where a finished run's answer goes (the engine's own inbox: one more turn).
pub(crate) struct Exec {
    allowed: Vec<String>,
    inbox: mpsc::Sender<In>,
}

/// Why a turn ended the helper.
#[derive(Debug)]
struct Fatal(String);

/// One plugin's QuickJS runtime and context, with its timers. Lives on one thread.
/// Timers due, soonest first: (when, the script's timer id).
type Timers = Rc<RefCell<BinaryHeap<Reverse<(Instant, u64)>>>>;

pub(crate) struct Engine {
    rt: Runtime,
    ctx: Context,
    out: UnboundedSender<Out>,
    limits: Limits,
    deadline: Rc<Cell<Option<Instant>>>,
    tripped: Rc<Cell<bool>>,
    stop: Arc<AtomicBool>,
    timers: Timers,
}

impl Engine {
    pub(crate) fn new(root: &std::path::Path, id: &str, limits: Limits, out: UnboundedSender<Out>, stop: Arc<AtomicBool>, exec: Exec) -> rquickjs::Result<Self> {
        let rt = Runtime::new()?;
        rt.set_memory_limit(limits.memory);
        rt.set_max_stack_size(1 << 20);
        let (deadline, tripped) = (Rc::new(Cell::new(None::<Instant>)), Rc::new(Cell::new(false)));
        let (d, t, s) = (deadline.clone(), tripped.clone(), stop.clone());
        rt.set_interrupt_handler(Some(Box::new(move || {
            let over = d.get().is_some_and(|d| Instant::now() > d);
            if over {
                t.set(true);
            }
            over || s.load(Ordering::Relaxed)
        })));
        let ctx = Context::full(&rt)?;
        let timers = Rc::new(RefCell::new(BinaryHeap::new()));
        ctx.with(|ctx| -> rquickjs::Result<()> {
            let host = Object::new(ctx.clone())?;
            host.set("id", id)?;
            let o = out.clone();
            host.set("send", Function::new(ctx.clone(), move |line: String| { let _ = o.send(Out::Line(line)); })?)?;
            let o = out.clone();
            host.set("log", Function::new(ctx.clone(), move |line: String| { let _ = o.send(Out::Log(line)); })?)?;
            let heap = timers.clone();
            host.set("timer", Function::new(ctx.clone(), move |n: f64, ms: f64| {
                heap.borrow_mut().push(Reverse((Instant::now() + Duration::from_millis(ms.max(0.0) as u64), n as u64)));
            })?)?;
            // the heavy primitives, natively (js_native.rs): JSON in, JSON out, a thrown Error on failure
            let (vault, me) = (root.to_path_buf(), id.to_string());
            host.set("native", Function::new(ctx.clone(), move |ctx: Ctx<'_>, op: String, args: String| -> rquickjs::Result<String> {
                let args = serde_json::from_str(&args).unwrap_or(serde_json::Value::Null);
                match crate::js_native::call(&vault, &me, &op, &args) {
                    Ok(v) => Ok(v.to_string()),
                    Err(why) => Err(rquickjs::Exception::throw_message(&ctx, &why)),
                }
            })?)?;
            // a program run off the context's thread; its answer comes back as a turn (`__atlas_exec`), so the
            // script's other calls and timers go on meanwhile
            // the helper stopped (a Stop in its page, switched off): its programs are ended too
            let (root, Exec { allowed, inbox }, halt) = (root.to_path_buf(), exec, stop.clone());
            host.set("exec", Function::new(ctx.clone(), move |n: f64, ask: String| {
                let (n, root, allowed, inbox, halt) = (n as u64, root.clone(), allowed.clone(), inbox.clone(), halt.clone());
                std::thread::spawn(move || {
                    let answer = serde_json::from_str::<crate::js_exec::Run>(&ask)
                        .map_err(|e| format!("exec: {e}"))
                        .and_then(|run| crate::js_exec::check(&root, &allowed, &run).and_then(|(exe, cwd)| crate::js_exec::run(&exe, &cwd, &run, &halt)))
                        .unwrap_or_else(|why| serde_json::json!({ "error": why }));
                    let _ = inbox.send(In::Exec(n, answer.to_string()));
                });
            })?)?;
            ctx.globals().set("__host", host)?;
            Ok(())
        })?;
        Ok(Self { rt, ctx, out, limits, deadline, tripped, stop, timers })
    }

    /// Evaluates the prelude and the helper's script.
    pub(crate) fn load(&self, name: &str, source: &str) -> Result<(), String> {
        for (file, code) in [("prelude.js", PRELUDE), (name, source)] {
            let failed = self
                .turn(|ctx| {
                    let mut o = rquickjs::context::EvalOptions::default();
                    o.filename = Some(file.to_string());
                    o.strict = false; // a bundle says "use strict" itself when it wants it
                    ctx.eval_with_options::<(), _>(code, o)
                })
                .map_err(|Fatal(why)| format!("{file}: {why}"))?;
            if let Some(why) = failed {
                return Err(format!("{file}: {why}"));
            }
        }
        Ok(())
    }

    /// An `atlas.exec` run's answer, to the promise the script holds for it.
    fn exec_ended(&self, n: u64, answer: &str) -> Result<(), Fatal> {
        let failed = self.turn(|ctx| ctx.globals().get::<_, Function>("__atlas_exec")?.call::<_, ()>((n as f64, answer)))?;
        self.uncaught(failed);
        Ok(())
    }

    /// One protocol line from the core.
    fn receive(&self, line: &str) -> Result<(), Fatal> {
        let failed = self.turn(|ctx| ctx.globals().get::<_, Function>("__atlas_receive")?.call::<_, ()>((line,)))?;
        self.uncaught(failed);
        Ok(())
    }

    fn uncaught(&self, why: Option<String>) {
        if let Some(why) = why {
            let _ = self.out.send(Out::Log(format!("uncaught: {why}")));
        }
    }

    /// Runs the timers that are due; when the next one is.
    fn fire_due(&self) -> Result<Option<Instant>, Fatal> {
        loop {
            let due = {
                let mut heap = self.timers.borrow_mut();
                match heap.peek() {
                    Some(Reverse((at, _))) if *at <= Instant::now() => heap.pop().map(|Reverse((_, n))| n),
                    Some(Reverse((at, _))) => return Ok(Some(*at)),
                    None => return Ok(None),
                }
            };
            if let Some(n) = due {
                let failed = self.turn(|ctx| ctx.globals().get::<_, Function>("__atlas_timer")?.call::<_, ()>((n as f64,)))?;
                self.uncaught(failed);
            }
        }
    }

    /// Bytes the context holds now (measured by the tests).
    #[cfg(test)]
    pub(crate) fn memory(&self) -> i64 {
        self.rt.run_gc();
        self.rt.memory_usage().memory_used_size
    }

    /// Runs `f` and the promise jobs it leaves, within the turn's CPU time: `f`'s own error, if any (a job's is logged).
    /// Running over the time, being stopped, or memory running out where nothing could catch it ends the helper.
    fn turn(&self, f: impl for<'js> FnOnce(&Ctx<'js>) -> rquickjs::Result<()>) -> Result<Option<String>, Fatal> {
        self.deadline.set(Some(Instant::now() + self.limits.turn));
        self.tripped.set(false);
        let own = self.ctx.with(|ctx| f(&ctx).catch(&ctx).err().map(|e| e.to_string()));
        let mut errors: Vec<String> = own.iter().filter(|w| w.contains("out of memory")).cloned().collect();
        loop {
            for why in errors.drain(..) {
                if self.ended() {
                    break; // the interrupt's own throw
                }
                if why.contains("out of memory") {
                    // a throw the script could not even catch: what it holds is unknown, so it starts again
                    self.deadline.set(None);
                    return Err(Fatal(format!("it ran out of its {} MB of memory", self.limits.memory >> 20)));
                }
                let _ = self.out.send(Out::Log(format!("uncaught: {why}")));
            }
            if self.ended() {
                break;
            }
            match self.rt.execute_pending_job() {
                Ok(true) => {}
                Ok(false) => break,
                Err(e) => errors.push(e.0.with(|ctx| rquickjs::CaughtError::from_error(&ctx, rquickjs::Error::Exception).to_string())),
            }
        }
        self.deadline.set(None);
        if self.tripped.get() {
            return Err(Fatal(format!("it used more than {} s of CPU at once (a loop that does not end?)", self.limits.turn.as_secs_f32())));
        }
        if self.stop.load(Ordering::Relaxed) {
            return Err(Fatal("stopped".into()));
        }
        Ok(own)
    }

    fn ended(&self) -> bool {
        self.tripped.get() || self.stop.load(Ordering::Relaxed)
    }

    /// Loads `file` and answers lines until stopped; why it ended.
    fn run(self, file: &std::path::Path, rx: mpsc::Receiver<In>) -> String {
        let name = file.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let source = match std::fs::read_to_string(file) {
            Ok(s) => s,
            Err(e) => return format!("{}: {e}", file.display()),
        };
        if let Err(why) = self.load(&name, &source) {
            return why;
        }
        let mut next: Option<Instant> = None;
        loop {
            let got = match next {
                Some(at) => rx.recv_timeout(at.saturating_duration_since(Instant::now())),
                None => rx.recv().map_err(|_| mpsc::RecvTimeoutError::Disconnected),
            };
            let step = match got {
                Ok(In::Line(line)) => self.receive(&line),
                Ok(In::Exec(n, answer)) => self.exec_ended(n, &answer),
                Ok(In::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => return "stopped".into(),
                Err(mpsc::RecvTimeoutError::Timeout) => Ok(()),
            };
            match step.and_then(|()| self.fire_due()) {
                Ok(at) => next = at,
                Err(Fatal(why)) => return why,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn helper(code: &str, limits: Limits) -> (Handle, UnboundedReceiver<Out>, tempfile::TempDir) {
        let t = tempfile::tempdir().unwrap();
        let file = t.path().join("helper.js");
        std::fs::write(&file, code).unwrap();
        let (h, rx) = start(t.path(), "demo", file, limits, vec!["sh".into()]).unwrap();
        (h, rx, t)
    }

    /// The next protocol line (logs kept aside), as JSON.
    async fn line(rx: &mut UnboundedReceiver<Out>, logs: &mut Vec<String>) -> Value {
        loop {
            match tokio::time::timeout(Duration::from_secs(10), rx.recv()).await.expect("a line in time").expect("not ended") {
                Out::Line(l) => return serde_json::from_str(&l).unwrap(),
                Out::Log(l) => logs.push(l),
                Out::Exit(why) => panic!("exited: {why} — logs: {logs:?}"),
            }
        }
    }

    async fn exit(rx: &mut UnboundedReceiver<Out>) -> String {
        loop {
            match tokio::time::timeout(Duration::from_secs(10), rx.recv()).await.expect("an exit in time") {
                Some(Out::Exit(why)) => return why,
                Some(_) => {}
                None => panic!("closed without an exit"),
            }
        }
    }

    const ECHO: &str = r#"
        let n = 0;
        atlas.method("echo", (p) => ({ got: p, calls: ++n }));
        atlas.method("later", async (p) => { await atlas.sleep(p.ms); return "waited"; });
        atlas.method("fail", () => { throw new Error("no such thing"); });
        atlas.method("note", async () => (await atlas.read("a.md")).toUpperCase());
        atlas.method("web", async () => atlas.fetchJson("https://api.example.org/x", { waits: [0] }));
        atlas.method("links", (p) => atlas.html.select(p.html, "a").map((a) => a.attrs.href));
        atlas.method("bad", () => atlas.html.select("", "a["));
        atlas.method("ping", () => { atlas.event("progress", { n }); console.log("pinged", { n }); return null; });
    "#;

    #[tokio::test]
    async fn a_js_helper_answers_with_the_protocol_of_every_helper() {
        let (h, mut rx, _t) = helper(ECHO, LIMITS);
        let mut logs = vec![];
        h.send(r#"{"id":1,"method":"echo","params":{"x":1}}"#).unwrap();
        assert_eq!(line(&mut rx, &mut logs).await, json!({ "id": 1, "result": { "got": { "x": 1 }, "calls": 1 } }));
        h.send(r#"{"id":2,"method":"echo","params":"two"}"#).unwrap();
        assert_eq!(line(&mut rx, &mut logs).await["result"]["calls"], 2, "one context: it counted both");
        h.send(r#"{"id":3,"method":"fail"}"#).unwrap();
        assert_eq!(line(&mut rx, &mut logs).await, json!({ "id": 3, "error": "Error: no such thing" }));
        h.send(r#"{"id":4,"method":"nope"}"#).unwrap();
        assert!(line(&mut rx, &mut logs).await["error"].as_str().unwrap().contains("has: bad, echo, fail, later, links, note, ping, web"));
        h.send(r#"{"id":5,"method":"ping"}"#).unwrap();
        assert_eq!(line(&mut rx, &mut logs).await, json!({ "event": "progress", "data": { "n": 2 } }));
        assert_eq!(line(&mut rx, &mut logs).await, json!({ "id": 5, "result": null }));
        assert_eq!(logs, vec![r#"pinged {"n":2}"#.to_string()], "console → the plugin's log");
        // the native primitives (js_native.rs) answer plain data, and their failure is a thrown Error
        h.send(r#"{"id":8,"method":"links","params":{"html":"<a href='/x'>x</a> <a href='/y'>y</a>"}}"#).unwrap();
        assert_eq!(line(&mut rx, &mut logs).await, json!({ "id": 8, "result": ["/x", "/y"] }));
        h.send(r#"{"id":9,"method":"bad"}"#).unwrap();
        assert!(line(&mut rx, &mut logs).await["error"].as_str().unwrap().starts_with("Error: html.select"));
        // timers: a call waiting on one does not hold up the next
        h.send(r#"{"id":6,"method":"later","params":{"ms":150}}"#).unwrap();
        h.send(r#"{"id":7,"method":"echo","params":0}"#).unwrap();
        assert_eq!(line(&mut rx, &mut logs).await["id"], 7);
        assert_eq!(line(&mut rx, &mut logs).await, json!({ "id": 6, "result": "waited" }));
        drop(h);
        assert_eq!(exit(&mut rx).await, "stopped");
    }

    /// `atlas.exec`: a program its manifest names runs off the context's thread, so a call waiting on it does not hold
    /// up the next; one it does not name is refused with the reason.
    #[cfg(unix)]
    #[tokio::test]
    async fn exec_runs_a_named_program_while_the_helper_answers_other_calls() {
        let (h, mut rx, _t) = helper(r#"
            atlas.method("run", (p) => atlas.exec("sh", ["-c", p.cmd], { stdin: p.stdin }));
            atlas.method("echo", (p) => p);
            atlas.method("denied", () => atlas.exec("cat"));
        "#, LIMITS);
        let mut logs = vec![];
        h.send(r#"{"id":1,"method":"run","params":{"cmd":"cat; sleep 0.3; echo done >&2; exit 4","stdin":"in"}}"#).unwrap();
        h.send(r#"{"id":2,"method":"echo","params":"meanwhile"}"#).unwrap();
        assert_eq!(line(&mut rx, &mut logs).await, json!({ "id": 2, "result": "meanwhile" }), "answered while the program runs");
        assert_eq!(line(&mut rx, &mut logs).await, json!({ "id": 1, "result": { "status": 4, "stdout": "in", "stderr": "done\n" } }));
        h.send(r#"{"id":3,"method":"denied"}"#).unwrap();
        assert!(line(&mut rx, &mut logs).await["error"].as_str().unwrap().contains("not in the manifest's [permissions] exec (sh)"));
    }

    /// `atlas.read` and `atlas.fetch*` are calls back (`{"call"}`), answered by the core (`{"reply"}`).
    #[tokio::test]
    async fn calls_back_and_fetch_go_through_the_core() {
        let (h, mut rx, _t) = helper(ECHO, LIMITS);
        let mut logs = vec![];
        h.send(r#"{"id":1,"method":"note"}"#).unwrap();
        let c = line(&mut rx, &mut logs).await;
        assert_eq!((c["verb"].as_str(), c["path"].as_str()), (Some("GET"), Some("/api/file?path=a.md")));
        h.send(&json!({ "reply": c["call"], "status": 200, "body": { "text": "hello" } }).to_string()).unwrap();
        assert_eq!(line(&mut rx, &mut logs).await, json!({ "id": 1, "result": "HELLO" }));

        h.send(r#"{"id":2,"method":"web"}"#).unwrap();
        let c = line(&mut rx, &mut logs).await;
        assert_eq!((c["verb"].as_str(), c["path"].as_str(), c["body"]["url"].as_str()), (Some("POST"), Some("/api/plugins/demo/fetch"), Some("https://api.example.org/x")));
        assert_eq!(c["body"]["headers"]["Accept"], "application/json");
        // the core refuses a host the manifest does not list: the method fails with the core's reason
        h.send(&json!({ "reply": c["call"], "status": 400, "body": { "error": "fetch: plugin demo may not reach api.example.org" } }).to_string()).unwrap();
        let a = line(&mut rx, &mut logs).await;
        assert!(a["error"].as_str().unwrap().contains("may not reach api.example.org"), "{a}");

        h.send(r#"{"id":3,"method":"web"}"#).unwrap();
        let c = line(&mut rx, &mut logs).await;
        h.send(&json!({ "reply": c["call"], "status": 200, "body": { "status": 200, "ok": true, "text": "{\"a\":1}", "headers": {} } }).to_string()).unwrap();
        assert_eq!(line(&mut rx, &mut logs).await, json!({ "id": 3, "result": { "a": 1 } }));
    }

    /// The SDK's text helpers run in QuickJS, not only in node's V8 (the helpers' own tests): Unicode classes, lookbehind.
    #[tokio::test]
    async fn the_sdks_text_helpers_work_in_quickjs() {
        let code = r#"atlas.method("t", () => [
            atlas.url.quote("10.1/A b!(x)"), atlas.url.quote("a/b c", ""),
            atlas.url.resolve("//m.example.org/1/x.pdf", "https://h.example.org/"), atlas.url.resolve("/d/x.pdf?a=1", "https://h.example.org/p/q"),
            atlas.url.resolve("x.pdf", "http://10.0.0.1:8080/"), atlas.url.resolve("y.pdf", "https://h.example.org/p/q"),
            atlas.html.unescape("a&amp;b &#39;c&#x27; &eacute; &lt;"), atlas.text.title("arrakis (imaginary place) álbum 3d"),
            "álbum de Rosalía".replace(/(?<![\p{L}])álbum/u, "ALBUM"),
        ]);"#;
        let (h, mut rx, _t) = helper(code, LIMITS);
        let mut logs = vec![];
        h.send(r#"{"id":1,"method":"t"}"#).unwrap();
        let want = json!(["10.1/A%20b%21%28x%29", "a%2Fb%20c", "https://m.example.org/1/x.pdf", "https://h.example.org/d/x.pdf?a=1",
            "http://10.0.0.1:8080/x.pdf", "https://h.example.org/p/y.pdf", "a&b 'c' é <", "Arrakis (Imaginary Place) Álbum 3D", "ALBUM de Rosalía"]);
        assert_eq!(line(&mut rx, &mut logs).await, json!({ "id": 1, "result": want }));
    }

    #[tokio::test]
    async fn a_turn_that_never_ends_stops_the_helper() {
        let (h, mut rx, _t) = helper(r#"atlas.method("spin", () => { for (;;) {} });"#, Limits { turn: Duration::from_millis(200), ..LIMITS });
        let t0 = Instant::now();
        h.send(r#"{"id":1,"method":"spin"}"#).unwrap();
        let why = exit(&mut rx).await;
        assert!(why.contains("CPU"), "{why}");
        assert!(t0.elapsed() < Duration::from_secs(3), "interrupted in time: {:?}", t0.elapsed());
        assert!(h.send("{}").is_err(), "ended");
    }

    #[tokio::test]
    async fn the_memory_limit_fails_the_call_not_the_core() {
        let code = r#"
            atlas.method("hog", () => { const a = []; for (;;) a.push("x".repeat(1 << 16) + a.length); });
            atlas.method("small", () => 1);
        "#;
        let (h, mut rx, _t) = helper(code, Limits { memory: 16 << 20, ..LIMITS });
        let mut logs = vec![];
        h.send(r#"{"id":1,"method":"hog"}"#).unwrap();
        loop {
            match tokio::time::timeout(Duration::from_secs(10), rx.recv()).await.unwrap().unwrap() {
                Out::Line(l) => {
                    let a: Value = serde_json::from_str(&l).unwrap();
                    assert!(a["error"].as_str().unwrap().contains("out of memory"), "{a}");
                    // what it held is garbage now: it goes on answering
                    h.send(r#"{"id":2,"method":"small"}"#).unwrap();
                    assert_eq!(line(&mut rx, &mut logs).await, json!({ "id": 2, "result": 1 }));
                    break;
                }
                Out::Exit(why) => {
                    assert!(why.contains("memory"), "{why}");
                    break;
                }
                Out::Log(l) => logs.push(l),
            }
        }
    }

    #[tokio::test]
    async fn a_broken_script_says_where() {
        let (_h, mut rx, _t) = helper("atlas.method('x', () => 1);\nthis is not javascript", LIMITS);
        let why = exit(&mut rx).await;
        assert!(why.contains("helper.js:2"), "the file and line: {why}");
    }

    /// What an idle helper costs: printed for the design note (`-- --nocapture`).
    #[test]
    fn an_idle_context_is_small() {
        let (out, _rx) = unbounded_channel();
        let e = Engine::new(std::path::Path::new("."), "demo", LIMITS, out, Arc::default(), Exec { allowed: vec![], inbox: mpsc::channel().0 }).unwrap();
        e.load("helper.js", ECHO).unwrap();
        let used = e.memory();
        println!("an idle JS helper context: {} KB", used / 1024);
        assert!(used < 2 << 20, "{used} bytes");
    }
}
