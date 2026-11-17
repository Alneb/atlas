//! The player's video engine on the desktop (docs/design/DESIGN-video-player.md): one mpv, in its own window, driven
//! over its JSON IPC (`--input-ipc-server`). The page's `atlas.player` sends it an item (its tracks, where to start)
//! and reads its state back; mpv brings every codec, subtitles, hardware decoding and the owner's own `mpv.conf`.
//! Only the desktop's own core runs it (the window must open where the person sits — the same guard as revealing a
//! file in the file manager). Several tracks are laid over one timeline as an mpv EDL, so a seek is a seek in the item.
//! The frame shown is handed back as a PNG; the page attaches it to the note through the one attach path.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Where one track of the item comes from: an address mpv asks (a plugin's `/media/<ticket>`, made absolute by the
/// page), or a file of the vault (resolved here, never a path from outside it).
#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Source {
    Url { src: String },
    File { file: String },
}

#[derive(Debug, Clone, Deserialize)]
pub struct Track {
    #[serde(flatten)]
    pub source: Source,
    /// Its length in seconds (0: unknown — then it must be the only track).
    #[serde(default)]
    pub duration: f64,
}

/// What the page asks of the engine.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "cmd", rename_all = "lowercase")]
pub enum Command {
    Play {
        tracks: Vec<Track>,
        #[serde(default)]
        at: f64,
        #[serde(default)]
        title: String,
        #[serde(default = "one")]
        speed: f64,
        /// Subtitle files beside the film (a server's external ones), http(s) addresses.
        #[serde(default)]
        subs: Vec<String>,
    },
    Pause,
    Resume,
    Seek { at: f64 },
    Speed { speed: f64 },
    Close,
}
fn one() -> f64 {
    1.0
}

/// What the page reads back (polled while something plays).
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct State {
    /// mpv runs (false once its window was closed: the page reports the item closed).
    pub running: bool,
    pub at: f64,
    pub duration: f64,
    pub playing: bool,
    pub speed: f64,
    pub ended: bool,
    /// The subtitle line shown now ("" when none): quoted into a note.
    pub sub_text: String,
    pub error: String,
}

/// The one address mpv plays for an item: a lone track as itself, several as an EDL (each segment's address
/// length-prefixed, `%n%`, so commas and semicolons in it need no escaping).
pub fn address(tracks: &[(String, f64)]) -> Result<String> {
    match tracks {
        [] => Err(Error::BadRequest("nothing to play: no track".into())),
        [(one, _)] => Ok(one.clone()),
        many => {
            if let Some((t, _)) = many.iter().find(|(_, d)| *d <= 0.0) {
                return Err(Error::BadRequest(format!("{t}: a track of several needs its length")));
            }
            let parts: Vec<String> = many.iter().map(|(t, d)| format!("%{}%{t},0,{d}", t.len())).collect();
            Ok(format!("edl://{}", parts.join(";")))
        }
    }
}

/// The JSON line of one mpv command, with its request id.
pub fn line(id: u64, args: &[Value]) -> String {
    let mut s = json!({ "command": args, "request_id": id }).to_string();
    s.push('\n');
    s
}

/// One line mpv sent, folded into the state. Returns a reply `(request_id, error, data)` when it was one.
pub fn fold(st: &mut State, msg: &Value) -> Option<(u64, String, Value)> {
    if let Some(id) = msg.get("request_id").and_then(Value::as_u64) {
        let err = msg.get("error").and_then(Value::as_str).unwrap_or("success").to_string();
        return Some((id, err, msg.get("data").cloned().unwrap_or(Value::Null)));
    }
    match msg.get("event").and_then(Value::as_str) {
        Some("property-change") => {
            let d = msg.get("data");
            let num = || d.and_then(Value::as_f64);
            match msg.get("name").and_then(Value::as_str) {
                Some("time-pos") => st.at = num().unwrap_or(st.at),
                Some("duration") => st.duration = num().unwrap_or(st.duration),
                Some("speed") => st.speed = num().unwrap_or(st.speed),
                Some("pause") => st.playing = !d.and_then(Value::as_bool).unwrap_or(true),
                Some("eof-reached") => st.ended = d.and_then(Value::as_bool).unwrap_or(false),
                Some("sub-text") => st.sub_text = d.and_then(Value::as_str).unwrap_or("").to_string(),
                _ => {}
            }
        }
        Some("end-file") => {
            if msg.get("reason").and_then(Value::as_str) == Some("error") {
                let why = msg.get("file_error").and_then(Value::as_str).unwrap_or("unknown");
                st.error = format!("mpv could not play it ({why})");
                st.playing = false;
            }
        }
        Some("file-loaded") => st.error.clear(),
        _ => {}
    }
    None
}

/// The properties followed (their changes fold into the state).
const OBSERVED: [&str; 6] = ["time-pos", "duration", "speed", "pause", "eof-reached", "sub-text"];
const REPLY: Duration = Duration::from_secs(10);

type Pending = Arc<Mutex<HashMap<u64, mpsc::Sender<(String, Value)>>>>;

struct Session {
    child: std::process::Child,
    #[cfg(unix)]
    out: std::os::unix::net::UnixStream,
    state: Arc<Mutex<State>>,
    pending: Pending,
    next: u64,
    socket: PathBuf,
}

/// The core's one mpv (started at the first `play`, gone when its window closes or `close` is asked).
#[derive(Default)]
pub struct Mpv {
    session: Mutex<Option<Session>>,
}

impl Mpv {
    pub fn state(&self) -> State {
        let mut s = self.session.lock().unwrap_or_else(|e| e.into_inner());
        let alive = s.as_mut().is_some_and(|x| matches!(x.child.try_wait(), Ok(None)));
        if !alive {
            *s = None; // never started, or its window was closed
            return State::default();
        }
        let x = s.as_ref().expect("alive");
        let st = x.state.lock().unwrap_or_else(|e| e.into_inner()).clone();
        st
    }

    /// The frame shown now, as a PNG.
    pub fn frame(&self) -> Result<Vec<u8>> {
        let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
        let Some(s) = guard.as_mut() else { return Err(Error::NotFound("nothing plays in mpv".into())) };
        if !matches!(s.child.try_wait(), Ok(None)) {
            return Err(Error::NotFound("nothing plays in mpv".into()));
        }
        s.frame()
    }

    /// Runs the page's command (blocking: it may wait for mpv's answer). `root`: the vault, for its files.
    pub fn run(&self, root: &Path, cmd: Command) -> Result<Value> {
        let mut guard = self.session.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(s) = guard.as_mut() {
            if !matches!(s.child.try_wait(), Ok(None)) {
                *guard = None;
            }
        }
        match cmd {
            Command::Play { tracks, at, title, speed, subs } => {
                if let Some(bad) = subs.iter().find(|u| !(u.starts_with("http://") || u.starts_with("https://"))) {
                    return Err(Error::BadRequest(format!("{bad}: a subtitle is an http(s) address")));
                }
                let mut list = Vec::new();
                for t in &tracks {
                    let place = match &t.source {
                        Source::Url { src } if src.starts_with("http://") || src.starts_with("https://") => src.clone(),
                        Source::Url { src } => return Err(Error::BadRequest(format!("{src}: mpv plays http(s) addresses or vault files"))),
                        Source::File { file } => crate::paths::safe_join(root, file)?.to_string_lossy().into_owned(),
                    };
                    list.push((place, t.duration));
                }
                let addr = address(&list)?;
                if guard.is_none() {
                    *guard = Some(Session::start()?);
                }
                let s = guard.as_mut().expect("started");
                s.call(&[json!("set_property"), json!("start"), json!(format!("{at}"))])?;
                s.call(&[json!("set_property"), json!("speed"), json!(speed)])?;
                s.call(&[json!("set_property"), json!("force-media-title"), json!(title)])?;
                // one by one: the list option's separator (`:`) is in every address
                s.call(&[json!("change-list"), json!("sub-files"), json!("clr"), json!("")])?;
                for u in &subs {
                    s.call(&[json!("change-list"), json!("sub-files"), json!("append"), json!(u)])?;
                }
                s.call(&[json!("loadfile"), json!(addr), json!("replace")])?;
                s.call(&[json!("set_property"), json!("pause"), json!(false)])?;
                Ok(Value::Null)
            }
            Command::Close => {
                if let Some(mut s) = guard.take() {
                    let _ = s.call(&[json!("quit")]);
                    s.stop();
                }
                Ok(Value::Null)
            }
            other => {
                let s = guard.as_mut().ok_or_else(|| Error::NotFound("nothing plays in mpv".into()))?;
                match other {
                    Command::Pause => s.call(&[json!("set_property"), json!("pause"), json!(true)]),
                    Command::Resume => s.call(&[json!("set_property"), json!("pause"), json!(false)]),
                    Command::Seek { at } => s.call(&[json!("seek"), json!(at.max(0.0)), json!("absolute")]),
                    Command::Speed { speed } => s.call(&[json!("set_property"), json!("speed"), json!(speed.clamp(0.25, 4.0))]),
                    Command::Play { .. } | Command::Close => unreachable!("handled above"),
                }
            }
        }
    }
}

impl Session {
    #[cfg(not(unix))]
    fn start() -> Result<Session> {
        Err(Error::CommandFailed("the mpv engine runs on Linux and macOS for now".into()))
    }

    #[cfg(unix)]
    fn start() -> Result<Session> {
        use std::io::{BufRead, BufReader};
        let socket = std::env::temp_dir().join(format!("atlas-mpv-{}-{}.sock", std::process::id(), crate::auth::random_hex(4)));
        let mut cmd = std::process::Command::new(mpv_program());
        cmd.arg("--idle=yes")
            .arg("--force-window=yes")
            .arg("--keep-open=yes")
            .arg("--no-terminal")
            .arg(format!("--input-ipc-server={}", socket.display()))
            .args(extra_args())
            .stdin(std::process::Stdio::null());
        let child = spawn_tied(cmd)
            .map_err(|e| Error::CommandFailed(if e.kind() == std::io::ErrorKind::NotFound { "mpv is not installed (or not on PATH)".into() } else { format!("mpv did not start: {e}") }))?;
        let mut child = child;
        let mut tries = 0;
        let out = loop {
            match std::os::unix::net::UnixStream::connect(&socket) {
                Ok(s) => break s,
                Err(_) if tries < 50 && matches!(child.try_wait(), Ok(None)) => {
                    tries += 1;
                    std::thread::sleep(Duration::from_millis(100));
                }
                Err(e) => {
                    let _ = child.kill();
                    return Err(Error::CommandFailed(format!("mpv's control socket did not open: {e}")));
                }
            }
        };
        let state = Arc::new(Mutex::new(State { running: true, speed: 1.0, ..State::default() }));
        let pending: Pending = Arc::default();
        let (st2, p2, input) = (state.clone(), pending.clone(), out.try_clone()?);
        std::thread::spawn(move || {
            for l in BufReader::new(input).lines() {
                let Ok(l) = l else { break };
                let Ok(msg) = serde_json::from_str::<Value>(&l) else { continue };
                let reply = fold(&mut st2.lock().unwrap_or_else(|e| e.into_inner()), &msg);
                if let Some((id, err, data)) = reply {
                    if let Some(tx) = p2.lock().unwrap_or_else(|e| e.into_inner()).remove(&id) {
                        let _ = tx.send((err, data));
                    }
                }
            }
            st2.lock().unwrap_or_else(|e| e.into_inner()).running = false;
        });
        let mut s = Session { child, out, state, pending, next: 1, socket };
        for (i, p) in OBSERVED.iter().enumerate() {
            s.call(&[json!("observe_property"), json!(i + 1), json!(p)])?;
        }
        Ok(s)
    }

    /// One command, its answer waited for.
    #[cfg(unix)]
    fn call(&mut self, args: &[Value]) -> Result<Value> {
        use std::io::Write;
        let id = self.next;
        self.next += 1;
        let (tx, rx) = mpsc::channel();
        self.pending.lock().unwrap_or_else(|e| e.into_inner()).insert(id, tx);
        self.out.write_all(line(id, args).as_bytes()).map_err(|e| Error::CommandFailed(format!("mpv does not listen: {e}")))?;
        match rx.recv_timeout(REPLY) {
            Ok((err, data)) if err == "success" => Ok(data),
            Ok((err, _)) => Err(Error::CommandFailed(format!("mpv: {} — {err}", args.first().and_then(Value::as_str).unwrap_or("?")))),
            Err(_) => {
                self.pending.lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
                Err(Error::CommandFailed("mpv did not answer".into()))
            }
        }
    }
    #[cfg(not(unix))]
    fn call(&mut self, _args: &[Value]) -> Result<Value> {
        Err(Error::CommandFailed("the mpv engine runs on Linux and macOS for now".into()))
    }

    /// The frame shown now: mpv writes it to a temporary file, read back and removed.
    fn frame(&mut self) -> Result<Vec<u8>> {
        let tmp = std::env::temp_dir().join(format!("atlas-frame-{}.png", crate::auth::random_hex(6)));
        let made = self.call(&[json!("screenshot-to-file"), json!(tmp.to_string_lossy()), json!("video")]);
        let bytes = std::fs::read(&tmp);
        let _ = crate::vault_write::outside::remove_file(&tmp); // the system temp dir, no vault's
        made?;
        Ok(bytes?)
    }

    fn stop(&mut self) {
        for _ in 0..20 {
            if !matches!(self.child.try_wait(), Ok(None)) {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = crate::vault_write::outside::remove_file(&self.socket);
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Starts `cmd` so that it dies with the core (Linux: `PR_SET_PDEATHSIG`), never left playing with no one to stop it.
/// The signal follows the thread that spawned the child, not the process: every spawn happens on one thread that lives
/// as long as the core (the async runtime's blocking threads are reaped when idle and would end mpv mid-film).
#[cfg(target_os = "linux")]
fn spawn_tied(cmd: std::process::Command) -> std::io::Result<std::process::Child> {
    use std::os::unix::process::CommandExt;
    type Job = (std::process::Command, mpsc::Sender<std::io::Result<std::process::Child>>);
    static SPAWNER: std::sync::OnceLock<Mutex<mpsc::Sender<Job>>> = std::sync::OnceLock::new();
    let tx = SPAWNER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Job>();
        std::thread::Builder::new()
            .name("atlas-mpv-spawner".into())
            .spawn(move || {
                for (mut c, back) in rx {
                    // SAFETY: prctl is async-signal-safe; nothing else runs between fork and exec
                    unsafe {
                        c.pre_exec(|| {
                            libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                            Ok(())
                        });
                    }
                    let _ = back.send(c.spawn());
                }
            })
            .expect("a thread for mpv");
        Mutex::new(tx)
    });
    let (back, got) = mpsc::channel();
    let gone = || std::io::Error::other("the spawner thread is gone");
    tx.lock().unwrap_or_else(|e| e.into_inner()).send((cmd, back)).map_err(|_| gone())?;
    got.recv().map_err(|_| gone())?
}
#[cfg(not(target_os = "linux"))]
fn spawn_tied(mut cmd: std::process::Command) -> std::io::Result<std::process::Child> {
    cmd.spawn()
}

/// `ATLAS_MPV_ARGS`: more of mpv's options, split at spaces (the tests' `--vo=null --ao=null`: no window, no sound).
fn extra_args() -> Vec<String> {
    std::env::var("ATLAS_MPV_ARGS").map(|a| a.split_whitespace().map(String::from).collect()).unwrap_or_default()
}

/// `ATLAS_MPV` names another mpv (a test's, a build of one's own); else the one on PATH.
fn mpv_program() -> String {
    std::env::var("ATLAS_MPV").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "mpv".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_track_plays_as_itself_several_as_one_timeline() {
        assert_eq!(address(&[("https://a.example.org/x.mkv".into(), 0.0)]).unwrap(), "https://a.example.org/x.mkv");
        let two = address(&[("http://h/m/a,b".into(), 60.5), ("/v/c;d.mp3".into(), 30.0)]).unwrap();
        assert_eq!(two, "edl://%14%http://h/m/a,b,0,60.5;%10%/v/c;d.mp3,0,30");
        assert!(address(&[]).is_err());
        assert!(address(&[("a".into(), 10.0), ("b".into(), 0.0)]).is_err(), "a track of several without its length");
    }

    #[test]
    fn mpvs_lines_fold_into_the_state_and_replies_are_handed_back() {
        let mut st = State { running: true, speed: 1.0, ..State::default() };
        let ev = |s: &str| serde_json::from_str::<Value>(s).unwrap();
        assert!(fold(&mut st, &ev(r#"{"event":"property-change","id":1,"name":"time-pos","data":12.5}"#)).is_none());
        fold(&mut st, &ev(r#"{"event":"property-change","id":4,"name":"pause","data":false}"#));
        fold(&mut st, &ev(r#"{"event":"property-change","id":2,"name":"duration","data":5400}"#));
        fold(&mut st, &ev(r#"{"event":"property-change","id":6,"name":"sub-text","data":"Who goes there?"}"#));
        assert_eq!((st.at, st.duration, st.playing, st.sub_text.as_str()), (12.5, 5400.0, true, "Who goes there?"));
        // a property without a value (time-pos while nothing is loaded) keeps the last one
        fold(&mut st, &ev(r#"{"event":"property-change","id":1,"name":"time-pos"}"#));
        assert_eq!(st.at, 12.5);
        fold(&mut st, &ev(r#"{"event":"end-file","reason":"error","file_error":"loading failed"}"#));
        assert!(st.error.contains("loading failed") && !st.playing);
        fold(&mut st, &ev(r#"{"event":"file-loaded"}"#));
        assert_eq!(st.error, "");
        let r = fold(&mut st, &ev(r#"{"request_id":7,"error":"property not found","data":null}"#)).unwrap();
        assert_eq!((r.0, r.1.as_str()), (7, "property not found"));
        assert_eq!(line(3, &[json!("seek"), json!(10.0), json!("absolute")]), "{\"command\":[\"seek\",10.0,\"absolute\"],\"request_id\":3}\n");
    }

    #[test]
    fn the_pages_commands_are_typed() {
        let c: Command = serde_json::from_value(json!({ "cmd": "play", "tracks": [{ "src": "http://127.0.0.1:1/media/t", "duration": 0 }, { "file": "films/a.mkv" }], "at": 3 })).unwrap();
        let Command::Play { tracks, at, speed, subs, .. } = c else { panic!() };
        assert_eq!((at, speed, subs.len()), (3.0, 1.0, 0));
        assert_eq!(tracks[1].source, Source::File { file: "films/a.mkv".into() });
        assert!(serde_json::from_value::<Command>(json!({ "cmd": "eject" })).is_err());
    }

    /// A child outlives the thread that asked for it (the death signal follows the spawner thread, not the caller's).
    #[cfg(target_os = "linux")]
    #[test]
    fn a_tied_child_outlives_the_thread_that_asked_for_it() {
        let mut child = std::thread::spawn(|| {
            let mut c = std::process::Command::new("sleep");
            c.arg("30");
            spawn_tied(c).unwrap()
        })
        .join()
        .unwrap();
        std::thread::sleep(Duration::from_millis(300));
        assert!(matches!(child.try_wait(), Ok(None)), "killed when the asking thread ended");
        child.kill().unwrap();
        child.wait().unwrap();
    }

    /// The real mpv, no window and no sound, over a clip it makes itself (`av://lavfi`): skipped where mpv is missing.
    #[cfg(unix)]
    #[test]
    fn a_real_mpv_plays_seeks_grabs_a_frame_and_closes() {
        if std::process::Command::new(mpv_program()).arg("--version").output().is_err() {
            eprintln!("skipped: no mpv");
            return;
        }
        let vault = tempfile::tempdir().unwrap();
        let clip = vault.path().join("clip.mkv");
        let made = std::process::Command::new(mpv_program())
            .args(["--no-config", "--really-quiet", "av://lavfi:testsrc=duration=20:size=96x64:rate=10", "--ovc=ffv1", "--of=matroska"])
            .arg(format!("--o={}", clip.display()))
            .status()
            .unwrap();
        assert!(made.success() && clip.exists(), "mpv made no clip");
        std::env::set_var("ATLAS_MPV_ARGS", "--no-config --vo=null --ao=null --force-window=no");
        let mpv = Mpv::default();
        assert!(mpv.run(vault.path(), Command::Seek { at: 1.0 }).is_err(), "nothing plays yet");
        let tracks = vec![Track { source: Source::File { file: "clip.mkv".into() }, duration: 0.0 }];
        // a server's subtitle file beside the film, served over http as Jellyfin serves one
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let sub = format!("http://127.0.0.1:{}/sub.srt", l.local_addr().unwrap().port());
        std::thread::spawn(move || {
            for s in l.incoming().flatten() {
                use std::io::{Read, Write};
                let mut s = s;
                let mut buf = [0u8; 2048];
                let _ = s.read(&mut buf);
                let body = "1\n00:00:00,500 --> 00:00:19,000\nWho goes there?\n\n";
                let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
            }
        });
        assert!(mpv.run(vault.path(), Command::Play { tracks: tracks.clone(), at: 0.0, title: "t".into(), speed: 1.0, subs: vec![sub] }).is_ok());
        let wait = |f: &dyn Fn(&State) -> bool| {
            for _ in 0..100 {
                if f(&mpv.state()) {
                    return true;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            false
        };
        assert!(wait(&|s| s.running && s.duration > 19.0 && s.playing), "loaded: {:?}", mpv.state());
        assert!(wait(&|s| s.sub_text == "Who goes there?"), "the subtitle file shows: {:?}", mpv.state());
        mpv.run(vault.path(), Command::Pause).unwrap();
        mpv.run(vault.path(), Command::Seek { at: 12.0 }).unwrap();
        assert!(wait(&|s| !s.playing && (s.at - 12.0).abs() < 0.5), "paused at 12: {:?}", mpv.state());
        let png = mpv.frame().unwrap();
        assert_eq!(&png[1..4], b"PNG");
        assert!(mpv.run(vault.path(), Command::Play { tracks: vec![Track { source: Source::Url { src: "file:///etc/passwd".into() }, duration: 0.0 }], at: 0.0, title: String::new(), speed: 1.0, subs: vec!["file:///etc/x.srt".into()] }).is_err());
        mpv.run(vault.path(), Command::Close).unwrap();
        assert_eq!(mpv.state(), State::default());
        std::env::remove_var("ATLAS_MPV_ARGS");
    }
}
