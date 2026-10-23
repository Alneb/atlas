//! Long-lived remote shells an agent (atlas mcp) or the page talks to. Each is one `ssh -T <host>` running the remote
//! login shell, kept open between calls, so `cd`, variables and an activated environment stay. A command is written
//! to the shell followed by a marker line carrying its exit status; its output is what comes before the marker.
//! Sessions run with BatchMode (nobody can type into them): a host that wants a passphrase or 2FA is logged in to in
//! the page's login tab first (ssh.rs `login`). Everything sent and received goes to <cache>/sessions/<name>.log.
use crate::ssh::{self, Settings};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, LazyLock, Mutex};
use std::time::{Duration, Instant};

/// Longest a call blocks on a login: under the agent bridge's timeout; the agent calls again.
const CALL_WAIT: Duration = Duration::from_secs(25);

type Answer = Result<Value, String>;

struct Output {
    buf: Vec<u8>,
    /// bytes of `buf` already handed out
    taken: usize,
    /// ssh's stdout still open (the session's end; its stderr closes early, at `exec 2>&1`)
    open: bool,
}

pub struct Session {
    name: String,
    host: String,
    settings: Settings,
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    out: Mutex<Output>,
    arrived: Condvar,
    log: Mutex<std::fs::File>,
    log_path: std::path::PathBuf,
    /// the connection had dropped and this is a new shell: said once, with the next command's answer
    reconnected: AtomicBool,
}

static SESSIONS: LazyLock<Mutex<HashMap<String, Arc<Session>>>> = LazyLock::new(Default::default);
/// session → the marker of a command still running
static PENDING: LazyLock<Mutex<HashMap<String, String>>> = LazyLock::new(Default::default);

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn log_dir() -> std::path::PathBuf {
    ssh::cache_dir().join("sessions")
}

impl Session {
    fn spawn(name: &str, host: &str, settings: &Settings) -> Result<Arc<Session>, String> {
        let argv = settings.argv(host, &["-T", "-o", "BatchMode=yes"]);
        let mut child = Command::new(&argv[0]).args(&argv[1..]).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("{}: {e}", argv[0]))?;
        std::fs::create_dir_all(log_dir()).map_err(|e| e.to_string())?;
        let log_path = log_dir().join(format!("{name}.log"));
        let mut log = std::fs::OpenOptions::new().create(true).append(true).open(&log_path).map_err(|e| e.to_string())?;
        let _ = writeln!(log, "\n# {} session {name} on {host}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"));
        let (stdout, stderr) = (child.stdout.take(), child.stderr.take());
        let stdin = child.stdin.take().ok_or("no stdin")?;
        let s = Arc::new(Session {
            name: name.into(),
            host: host.into(),
            settings: settings.clone(),
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            out: Mutex::new(Output { buf: Vec::new(), taken: 0, open: true }),
            arrived: Condvar::new(),
            log: Mutex::new(log),
            log_path,
            reconnected: AtomicBool::new(false),
        });
        // the shell's output, and ssh's own messages (a refused login) — read to their end before the session counts as
        // ended, so a refusal is in what `start` answers
        let errors = stderr.map(|e| {
            let s = s.clone();
            std::thread::spawn(move || s.pump(e))
        });
        if let Some(o) = stdout {
            let s = s.clone();
            std::thread::spawn(move || {
                s.pump(o);
                if let Some(e) = errors {
                    let _ = e.join();
                }
                lock(&s.out).open = false;
                s.arrived.notify_all();
            });
        }
        s.write("exec 2>&1\n")?; // the remote shell's errors in the same stream, in order
        Ok(s)
    }

    fn pump(&self, mut from: impl Read) {
        let mut chunk = [0u8; 65536];
        while let Ok(n @ 1..) = from.read(&mut chunk) {
            let _ = lock(&self.log).write_all(&chunk[..n]);
            lock(&self.out).buf.extend_from_slice(&chunk[..n]);
            self.arrived.notify_all();
        }
    }

    fn alive(&self) -> bool {
        lock(&self.out).open && matches!(lock(&self.child).try_wait(), Ok(None))
    }

    fn write(&self, text: &str) -> Result<(), String> {
        if let Ok(Some(status)) = lock(&self.child).try_wait() {
            return Err(format!("session {} has ended (ssh exited with {})", self.name, status.code().map_or("a signal".into(), |c| c.to_string())));
        }
        let mut stdin = lock(&self.stdin);
        stdin.write_all(text.as_bytes()).and_then(|_| stdin.flush()).map_err(|e| format!("session {}: {e}", self.name))
    }

    fn note(&self, line: &str) {
        let _ = lock(&self.log).write_all(line.as_bytes());
    }

    /// Waits up to `limit` for `marker` after what was handed out → (the text before it, its exit status), or what came
    /// so far and None.
    fn until(&self, marker: &str, limit: Duration) -> (String, Option<i32>) {
        let end = Instant::now() + limit;
        let mut out = lock(&self.out);
        loop {
            if let Some((stop, after, status)) = find_marker(&out.buf, out.taken, marker) {
                let text = String::from_utf8_lossy(&out.buf[out.taken..stop]).into_owned();
                out.taken = after;
                return (text, Some(status));
            }
            let left = end.saturating_duration_since(Instant::now());
            if left.is_zero() || !out.open {
                let text = String::from_utf8_lossy(&out.buf[out.taken..]).into_owned();
                out.taken = out.buf.len();
                return (text, None);
            }
            out = self.arrived.wait_timeout(out, left).unwrap_or_else(|e| e.into_inner()).0;
        }
    }

    fn end(&self) {
        let _ = lock(&self.child).kill();
    }
}

/// `\n?<marker> <status>\n` in `buf` from `from` → (where the text stops, where the line ends, the status).
fn find_marker(buf: &[u8], from: usize, marker: &str) -> Option<(usize, usize, i32)> {
    let m = format!("{marker} ");
    let m = m.as_bytes();
    let mut at = from;
    while let Some(i) = buf.get(at..)?.windows(m.len()).position(|w| w == m).map(|i| i + at) {
        let digits = &buf[i + m.len()..];
        let n = digits.iter().take_while(|b| b.is_ascii_digit()).count();
        if n > 0 && digits.get(n) == Some(&b'\n') {
            let status = std::str::from_utf8(&digits[..n]).ok()?.parse().ok()?;
            let stop = if i > from && buf[i - 1] == b'\n' { i - 1 } else { i };
            return Some((stop, i + m.len() + n + 1, status));
        }
        if n == digits.len() {
            return None; // the line is not complete yet
        }
        at = i + 1;
    }
    None
}

fn marker() -> String {
    format!("__ATLAS_{}__", ssh::token())
}

/// A shell on `host` over the shared connection, or ssh's answer when it needs a login first.
fn start(name: &str, host: &str, s: &Settings) -> Result<Result<Arc<Session>, String>, String> {
    let sess = Session::spawn(name, host, s)?;
    let m = marker();
    sess.write(&format!("printf '\\n{m} %s\\n' $?\n"))?;
    let (text, status) = sess.until(&m, Duration::from_secs(30));
    if status.is_none() {
        sess.end();
        return Ok(Err(if text.trim().is_empty() { "no answer".into() } else { text.trim().to_string() }));
    }
    Ok(Ok(sess))
}

pub fn open(p: &Value) -> Answer {
    let s = Settings::of(p);
    let host = p["host"].as_str().map(str::trim).filter(|h| !h.is_empty()).ok_or("host: a name from ssh_hosts, or user@host[:port]")?;
    let name = ssh::safe(p["name"].as_str().filter(|n| !n.is_empty()).unwrap_or(host), ".-");
    open_named(&s, host, &name)
}

fn open_named(s: &Settings, host: &str, name: &str) -> Answer {
    if lock(&SESSIONS).get(name).is_some_and(|x| x.alive()) {
        return Ok(json!({ "session": name, "reused": true }));
    }
    let mut made = start(name, host, s)?;
    if made.is_err() && !s.connected(host) {
        if !ssh::login(s, host, CALL_WAIT, "Claude (Atlas) for a shell there") {
            return Ok(json!({ "waiting_for_login": host, "message": format!("The user is logging in to {host} in an Atlas terminal tab (passphrase / 2FA). Call ssh_open again in a moment.") }));
        }
        made = start(name, host, s)?;
    }
    let sess = made.map_err(|why| format!("could not open a shell on {host}: {why}"))?;
    lock(&SESSIONS).insert(name.to_string(), sess);
    Ok(json!({ "session": name, "host": host }))
}

/// The session a call names; one whose connection dropped is opened again first (logging in if the host asks).
fn get(p: &Value) -> Result<Arc<Session>, String> {
    let name = p["session"].as_str().unwrap_or_default();
    let Some(sess) = lock(&SESSIONS).get(name).cloned() else {
        let mut open: Vec<String> = lock(&SESSIONS).keys().cloned().collect();
        open.sort();
        return Err(format!("no session {name:?}; open one first (open: {open:?})"));
    };
    if sess.alive() {
        return Ok(sess);
    }
    lock(&PENDING).remove(name);
    let again = open_named(&sess.settings, &sess.host, &sess.name)?;
    if again.get("waiting_for_login").is_some() {
        return Err(format!("the connection to {} dropped; {}", sess.host, again["message"].as_str().unwrap_or_default()));
    }
    let fresh = lock(&SESSIONS).get(name).cloned().ok_or("the session went away")?;
    fresh.reconnected.store(true, Ordering::Relaxed);
    Ok(fresh)
}

fn seconds(v: &Value, default: f64) -> Duration {
    Duration::from_secs_f64(v.as_f64().filter(|s| *s > 0.0).unwrap_or(default))
}

pub fn run(p: &Value) -> Answer {
    let sess = get(p)?;
    if lock(&PENDING).contains_key(&sess.name) {
        return Err("a command is still running in this session: read its output first, or send it input".into());
    }
    let command = p["command"].as_str().ok_or("command: the shell command to run")?;
    let m = marker();
    sess.note(&format!("\n$ {command}\n"));
    sess.write(&format!("{command}\nprintf '\\n{m} %s\\n' $?\n"))?;
    let (output, status) = sess.until(&m, seconds(&p["timeout"], 30.0));
    let mut answer = json!({ "output": output });
    if sess.reconnected.swap(false, Ordering::Relaxed) {
        answer["reconnected"] = json!("the connection had dropped: this is a new shell (cd, variables, environments reset)");
    }
    match status {
        None => {
            lock(&PENDING).insert(sess.name.clone(), m);
            answer["running"] = json!(true);
        }
        Some(code) => answer["exit"] = json!(code),
    }
    Ok(answer)
}

pub fn read(p: &Value) -> Answer {
    let sess = get(p)?;
    let Some(m) = lock(&PENDING).get(&sess.name).cloned() else { return Ok(json!({ "output": "", "running": false })) };
    let (output, status) = sess.until(&m, seconds(&p["wait"], 10.0));
    Ok(match status {
        None => json!({ "output": output, "running": true }),
        Some(code) => {
            lock(&PENDING).remove(&sess.name);
            json!({ "output": output, "exit": code })
        }
    })
}

pub fn send(p: &Value) -> Answer {
    let sess = get(p)?;
    let text = p["text"].as_str().ok_or("text: the line to type")?;
    sess.note(&format!("\n> {text}\n"));
    sess.write(&if text.ends_with('\n') { text.to_string() } else { format!("{text}\n") })?;
    Ok(json!({ "sent": true }))
}

pub fn close(p: &Value) -> Answer {
    let sess = get(p)?;
    lock(&SESSIONS).remove(&sess.name);
    lock(&PENDING).remove(&sess.name);
    sess.end();
    Ok(json!({ "closed": sess.name }))
}

pub fn list(_p: &Value) -> Answer {
    let root = ssh::absolute(std::path::Path::new(&std::env::var("ATLAS_ROOT").unwrap_or_else(|_| ".".into())));
    let pending = lock(&PENDING).clone();
    let mut out: Vec<Value> = lock(&SESSIONS)
        .values()
        .map(|s| {
            let log = s.log_path.strip_prefix(&root).unwrap_or(&s.log_path).to_string_lossy().into_owned();
            json!({ "session": s.name, "host": s.host, "alive": s.alive(), "running": pending.contains_key(&s.name), "log": log })
        })
        .collect();
    out.sort_by(|a, b| a["session"].as_str().cmp(&b["session"].as_str()));
    Ok(Value::Array(out))
}

/// The live sessions on `host`, by name.
pub fn on_host(host: &str) -> Vec<String> {
    let mut names: Vec<String> = lock(&SESSIONS).values().filter(|s| s.host == host && s.alive()).map(|s| s.name.clone()).collect();
    names.sort();
    names
}

/// Every session on `host` ended (its connection was closed).
pub fn end_host(host: &str) {
    let gone: Vec<Arc<Session>> = {
        let mut all = lock(&SESSIONS);
        let names: Vec<String> = all.values().filter(|s| s.host == host).map(|s| s.name.clone()).collect();
        names.iter().filter_map(|n| all.remove(n)).collect()
    };
    for s in gone {
        lock(&PENDING).remove(&s.name);
        s.end();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_marker_ends_the_output_only_once_its_line_is_complete() {
        let b = b"hello\n__M__ 0\nnext\n__M__ 12";
        assert_eq!(find_marker(b, 0, "__M__"), Some((5, 14, 0)));
        assert_eq!(find_marker(b, 14, "__M__"), None, "no newline after the status yet");
        let b = b"said __M__ x\n__M__ 3\n";
        assert_eq!(find_marker(b, 0, "__M__"), Some((12, 21, 3)), "a mention that is not the marker line is output");
    }
}
