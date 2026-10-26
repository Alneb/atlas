//! `WS /api/pty`: a real pty per terminal tab. Binary frames carry bytes both ways; a text frame
//! `{"resize":[cols,rows]}` resizes, `"end"` ends it (the tab was closed). A socket opened with the
//! tab's `key` takes over that tab's running terminal after a page reload ([`Sessions`]); when the
//! child exits, the socket closes with code 1000 ("exited"), which the page reads as "close the tab".
use crate::api::{PtyControl, PtyPreset, PtyQuery};
use crate::Workspace;
use axum::extract::ws::{close_code, CloseFrame, Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::broadcast;

fn command(ws: &Workspace, q: &PtyQuery) -> anyhow::Result<CommandBuilder> {
    let cwd = match &q.cwd {
        Some(rel) => ws.resolve(rel)?,
        None => ws.root().to_path_buf(),
    };
    let mut cmd = match q.preset {
        _ if q.command.is_some() => command_line(q.command.as_deref().unwrap_or_default(), &cwd)?,
        // an agent tab is always a plugin's agent (agent_terminals.rs): `agent` names it; a tab of the old "claude"
        // preset (a saved layout, Super+K) takes the `claude` agent, else the first one a plugin declares
        PtyPreset::Claude => {
            let off = ws.config().map(|c| c.plugins.off).unwrap_or_default();
            let found = match q.agent.as_deref() {
                Some(name) => crate::agent_terminals::find(ws.root(), &off, name),
                None => crate::agent_terminals::find(ws.root(), &off, "claude")
                    .or_else(|| crate::agent_terminals::declared(ws.root(), &off).into_iter().next().map(|(_, a, s)| (a, s))),
            };
            let (decl, settings) = found.ok_or_else(|| {
                anyhow::anyhow!("no AI agent here: switch on a plugin that declares one (Settings → Plugins: Claude)")
            })?;
            let (program, args, env) = crate::agent_terminals::command(&decl, &settings, q.session.as_deref());
            let mut cmd = CommandBuilder::new(program);
            cmd.args(args);
            for (k, v) in env {
                cmd.env(k, v);
            }
            // an agent terminal: `atlas mcp`, started by the agent, inherits its token (agents.rs)
            if let Some(token) = crate::agents::Agents::here().terminal_token() {
                cmd.env("ATLAS_AGENT_TOKEN", token);
            }
            cmd
        }
        PtyPreset::Shell => {
            let mut cmd = CommandBuilder::new(login_shell());
            // a new shell runs in the vault's Python environment (python_env.rs), as VS Code's terminal does
            if let Some(env) = ws.config().ok().and_then(|c| crate::python_env::chosen(&c, ws.root())) {
                for (k, v) in crate::python_env::vars(&env) {
                    cmd.env(k, v);
                }
            }
            cmd
        }
    };
    // Atlas launched from inside a Claude Code session would hand its session markers to every
    // terminal; a `claude` started there then thinks it is a child session (no transcript, wrong
    // account/socket). Terminals must look like a fresh login shell.
    for (k, _) in std::env::vars_os() {
        if k.to_str().is_some_and(is_claude_session_var) {
            cmd.env_remove(&k);
        }
    }
    cmd.cwd(cwd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("ATLAS_ROOT", ws.root());
    Ok(cmd)
}

/// The user's shell for a terminal tab: `$SHELL` (else `/bin/sh`); on Windows PowerShell 7, else Windows
/// PowerShell, else `%COMSPEC%` (cmd).
fn login_shell() -> String {
    if cfg!(windows) {
        let found = ["pwsh", "powershell"].iter().find(|p| which(p));
        return found.map(|p| p.to_string()).unwrap_or_else(|| std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into()));
    }
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into())
}

fn which(name: &str) -> bool {
    std::env::var_os("PATH").is_some_and(|p| std::env::split_paths(&p).any(|d| crate::platform::run_line::executable(&d.join(name)).is_some()))
}

/// A tab that runs one command line, started as every command line is (platform/run_line.rs): a program and its
/// arguments, or `sh -c` (on Windows Git's) when the line needs a shell.
fn command_line(line: &str, cwd: &Path) -> anyhow::Result<CommandBuilder> {
    let plan = crate::platform::run_line::plan(line, cwd, &[]).map_err(anyhow::Error::msg)?;
    let mut cmd = CommandBuilder::new(plan.program);
    cmd.args(plan.args);
    Ok(cmd)
}

/// Every word of a command line or a value through `expand_home`.
pub(crate) fn expand_home_words(line: &str) -> String {
    line.split(' ').map(expand_home).collect::<Vec<_>>().join(" ")
}

/// `~/x` → `$HOME/x`, so settings can name per-user binaries portably.
pub(crate) fn expand_home(word: &str) -> String {
    crate::platform::dirs::expand_tilde(word).to_string_lossy().into_owned()
}

/// A session id as agents write them (a UUID, 8-4-4-4-12 hex): nothing else reaches an agent's arguments.
pub(crate) fn is_uuid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts.iter().map(|p| p.len()).eq([8, 4, 4, 4, 12]) && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_hexdigit()))
}

/// Per-session Claude Code markers (shape-based, so new `CLAUDE_CODE_*` vars are covered).
/// `CLAUDE_CONFIG_DIR` and API keys are user choices, not session state, and are kept.
fn is_claude_session_var(k: &str) -> bool {
    k == "CLAUDECODE" || k.starts_with("CLAUDE_CODE_") || matches!(k, "CLAUDE_PID" | "CLAUDE_EFFORT" | "CLAUDE_TMPDIR")
}

/// The terminals of one server that outlive their socket: a page reload (a new interface is
/// installed by every commit) must not kill the shells and Claude sessions in its tabs. A socket
/// opened with `key` (the tab's id) takes over that key's terminal if it is still running; a socket
/// that drops without saying "end" leaves the terminal running for [`GRACE`], then it is killed.
#[derive(Default, Clone)]
pub struct Sessions(Arc<Mutex<HashMap<String, Arc<Pty>>>>);

/// How long a terminal whose page went away waits to be taken over (a reload takes seconds).
pub const GRACE: Duration = Duration::from_secs(600);
/// What a socket that takes over a terminal is sent first: the screen's recent output.
const REPLAY: usize = 1024 * 1024;

/// One running terminal: its program, the pty's two ends, the recent output, and its watchers.
pub struct Pty {
    /// None once closed (Windows, after the program ended: [`Pty::close_when_done`]).
    master: Mutex<Option<Box<dyn portable_pty::MasterPty + Send>>>,
    child: Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
    input: std::sync::mpsc::Sender<Vec<u8>>,
    /// Recent output and the live feed, under one lock so a new watcher misses nothing in between.
    out: Mutex<(VecDeque<u8>, broadcast::Sender<Out>)>,
    /// Which socket holds it; a socket that lost it to a newer one leaves without killing it.
    holder: AtomicU64,
}

#[derive(Clone)]
enum Out {
    Data(Arc<Vec<u8>>),
    Exited,
}

static SOCKETS: AtomicU64 = AtomicU64::new(1);

impl Pty {
    fn start(ws: &Workspace, q: &PtyQuery) -> anyhow::Result<Arc<Self>> {
        let size = PtySize { cols: q.cols.unwrap_or(80), rows: q.rows.unwrap_or(24), pixel_width: 0, pixel_height: 0 };
        let pair = native_pty_system().openpty(size)?;
        let child = pair.slave.spawn_command(command(ws, q)?)?;
        let mut reader = pair.master.try_clone_reader()?;
        let mut writer = pair.master.take_writer()?;
        // portable-pty is blocking IO: one thread per direction
        let (input, in_rx) = std::sync::mpsc::channel::<Vec<u8>>();
        std::thread::spawn(move || {
            for chunk in in_rx {
                if writer.write_all(&chunk).and_then(|_| writer.flush()).is_err() {
                    break;
                }
            }
        });
        let pty = Arc::new(Pty {
            master: Mutex::new(Some(pair.master)),
            child: Mutex::new(child),
            input,
            out: Mutex::new((VecDeque::new(), broadcast::channel(1024).0)),
            holder: AtomicU64::new(0),
        });
        let feed = Arc::clone(&pty);
        std::thread::spawn(move || {
            let mut buf = [0u8; 16 * 1024];
            while let Ok(n @ 1..) = reader.read(&mut buf) {
                let mut out = feed.out.lock().unwrap();
                out.0.extend(&buf[..n]);
                let over = out.0.len().saturating_sub(REPLAY);
                out.0.drain(..over);
                let _ = out.1.send(Out::Data(Arc::new(buf[..n].to_vec())));
            }
            let _ = feed.out.lock().unwrap().1.send(Out::Exited); // the program ended, the pty closed
        });
        if cfg!(windows) {
            Self::close_when_done(Arc::clone(&pty));
        }
        Ok(pty)
    }

    fn resize(&self, cols: u16, rows: u16) {
        if let Some(m) = self.master.lock().unwrap().as_ref() {
            let _ = m.resize(PtySize { cols, rows, pixel_width: 0, pixel_height: 0 });
        }
    }

    /// ConPTY keeps its output open after the program ends, so the read above never ends by itself; closing the
    /// pseudo console once the program is gone flushes the rest and ends it, in order (Unix needs none of this).
    fn close_when_done(pty: Arc<Self>) {
        std::thread::spawn(move || {
            while !pty.exited() {
                std::thread::sleep(Duration::from_millis(100));
            }
            pty.master.lock().unwrap().take();
        });
    }

    async fn kill(self: Arc<Self>) {
        let _ = self.child.lock().unwrap().kill();
        let _ = tokio::task::spawn_blocking(move || self.child.lock().unwrap().wait()).await;
    }

    fn exited(&self) -> bool {
        matches!(self.child.lock().unwrap().try_wait(), Ok(Some(_)))
    }
}

impl Sessions {
    /// The running terminal under `key`, if any.
    fn take_over(&self, key: &str) -> Option<Arc<Pty>> {
        let mut all = self.0.lock().unwrap();
        match all.get(key) {
            Some(p) if p.exited() => {
                all.remove(key);
                None
            }
            found => found.cloned(),
        }
    }

    fn forget(&self, key: &str, pty: &Arc<Pty>) {
        let mut all = self.0.lock().unwrap();
        if all.get(key).is_some_and(|p| Arc::ptr_eq(p, pty)) {
            all.remove(key);
        }
    }

    /// How many terminals are running (tests).
    pub fn len(&self) -> usize {
        self.0.lock().unwrap().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

pub async fn session(socket: WebSocket, ws: Workspace, q: PtyQuery, sessions: Sessions) {
    if let Err(e) = run(socket, ws, q, sessions).await {
        eprintln!("atlas: pty session ended with error: {e:#}");
    }
}

/// How a socket left its terminal.
enum Left {
    /// The program ended: the page closes the tab.
    Exited,
    /// The page said "end" (the tab was closed): the program is killed.
    Ended,
    /// The socket dropped (a reload): the program keeps running for [`GRACE`].
    Dropped,
    /// A newer socket took the terminal over.
    TakenOver,
}

async fn run(socket: WebSocket, ws: Workspace, q: PtyQuery, sessions: Sessions) -> anyhow::Result<()> {
    let (mut sink, mut stream) = socket.split();
    let key = q.key.clone().filter(|k| !k.is_empty());
    let resumed = key.as_deref().and_then(|k| sessions.take_over(k));
    let pty = match resumed.clone() {
        Some(p) => p,
        None => match Pty::start(&ws, &q) {
            Ok(p) => p,
            Err(e) => {
                // Show the failure in the terminal itself; the user is looking there.
                let _ = sink.send(Message::Binary(format!("atlas: could not start terminal: {e}\r\n").into_bytes().into())).await;
                return Err(e);
            }
        },
    };
    if let (Some(k), None) = (&key, &resumed) {
        sessions.0.lock().unwrap().insert(k.clone(), Arc::clone(&pty));
    }
    let me = SOCKETS.fetch_add(1, Ordering::Relaxed);
    pty.holder.store(me, Ordering::SeqCst);
    let (replay, mut feed) = {
        let out = pty.out.lock().unwrap();
        (resumed.is_some().then(|| out.0.iter().copied().collect::<Vec<u8>>()), out.1.subscribe())
    };
    if let Some(bytes) = replay.filter(|b| !b.is_empty()) {
        sink.send(Message::Binary(bytes.into())).await?;
    }
    if let (Some(_), Some(cols), Some(rows)) = (&resumed, q.cols, q.rows) {
        // the new page's size, and a redraw: a full-screen program (Claude) repaints on a size change
        pty.resize(cols.saturating_sub(1).max(1), rows);
        pty.resize(cols, rows);
    }

    let left = loop {
        tokio::select! {
            out = feed.recv() => match out {
                Ok(Out::Data(bytes)) => if sink.send(Message::Binary(bytes.to_vec().into())).await.is_err() { break Left::Dropped },
                Ok(Out::Exited) | Err(broadcast::error::RecvError::Closed) => break Left::Exited,
                Err(broadcast::error::RecvError::Lagged(_)) => {} // a slow page loses some output, not the terminal
            },
            msg = stream.next() => match msg {
                Some(Ok(Message::Binary(b))) => { let _ = pty.input.send(b.to_vec()); }
                Some(Ok(Message::Text(t))) => match serde_json::from_str::<PtyControl>(&t) {
                    Ok(PtyControl::Resize((cols, rows))) => pty.resize(cols, rows),
                    Ok(PtyControl::End) => break Left::Ended,
                    // Lenient: a client sending keystrokes as text frames still works.
                    Err(_) => { let _ = pty.input.send(t.as_bytes().to_vec()); }
                },
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break Left::Dropped,
                Some(Ok(_)) => {}
            },
        }
        if pty.holder.load(Ordering::SeqCst) != me {
            break Left::TakenOver;
        }
    };
    let left = match (left, &key) {
        (Left::Dropped, None) => Left::Ended, // nothing could take it over
        (l, _) => l,
    };
    match left {
        Left::Exited | Left::Ended => {
            if let Some(k) = &key {
                sessions.forget(k, &pty);
            }
            Arc::clone(&pty).kill().await;
        }
        Left::Dropped => {
            let (sessions, key, pty) = (sessions.clone(), key.clone().unwrap_or_default(), Arc::clone(&pty));
            tokio::spawn(async move {
                tokio::time::sleep(GRACE).await;
                if pty.holder.load(Ordering::SeqCst) == me {
                    sessions.forget(&key, &pty);
                    pty.kill().await;
                }
            });
        }
        Left::TakenOver => {}
    }
    let exited = matches!(left, Left::Exited);
    let frame = exited.then(|| CloseFrame { code: close_code::NORMAL, reason: "exited".into() });
    let _ = sink.send(Message::Close(frame)).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{expand_home, is_claude_session_var, is_uuid};

    #[test]
    fn only_a_uuid_reaches_an_agents_arguments_as_its_session() {
        assert!(is_uuid("6083693f-c989-4e8e-ac75-efbc9108326d"));
        assert!(!is_uuid("6083693f-c989-4e8e-ac75-efbc9108326d; rm -rf ~"));
        assert!(!is_uuid("--continue"));
    }

    #[test]
    fn expands_leading_tilde_only() {
        let home = crate::platform::dirs::home().unwrap();
        assert_eq!(expand_home("~/.local/bin/claude"), home.join(".local/bin/claude").to_string_lossy());
        assert_eq!(expand_home("claude"), "claude");
        assert_eq!(expand_home("/a/~/b"), "/a/~/b");
    }

    #[test]
    fn strips_session_markers_keeps_user_choices() {
        for k in
            ["CLAUDECODE", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_NEW_THING", "CLAUDE_PID"]
        {
            assert!(is_claude_session_var(k), "{k}");
        }
        for k in ["CLAUDE_CONFIG_DIR", "ANTHROPIC_API_KEY", "PATH", "CLAUDE"] {
            assert!(!is_claude_session_var(k), "{k}");
        }
    }
}
