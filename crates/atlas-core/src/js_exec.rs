//! `atlas.exec` for a JavaScript helper (docs/design/DESIGN-js-helpers.md, "atlas.exec"): one of the programs its
//! manifest names (`[permissions] exec = ["pandoc"]`) run by the core with no shell, on a thread of its own, so the
//! helper's other calls go on meanwhile. Only the helper's own script reaches it (js_helper.rs), never an HTTP route: a
//! page could otherwise drive a plugin's programs with arguments of its choosing.
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// What is kept of each of stdout and stderr; the rest is dropped and said (`truncated`).
const MAX_OUTPUT: usize = 8 << 20;
/// Seconds a run may take when the script does not say, and at most.
const DEFAULT_SECS: u64 = 60;
const MAX_SECS: u64 = 600;

/// One run as the script asks it (`atlas.exec(program, args, {stdin, cwd, timeout})`).
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Run {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    /// Text written to the program's standard input, then closed.
    pub stdin: Option<String>,
    /// Vault-relative folder to run in (default: the vault).
    pub cwd: Option<String>,
    /// Seconds (default 60, at most 600); the program is killed past it.
    pub timeout: Option<u64>,
    /// `"C"`: the program answers in English whatever the machine's language (LC_ALL, LANG), for a script that reads
    /// its words. The only environment a script sets: any other variable (LD_PRELOAD…) could make a named program run
    /// code it does not name.
    pub locale: Option<Locale>,
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub enum Locale {
    C,
}

/// The run checked: the program is one the manifest allows and is on this machine; the folder is inside the vault.
/// Refused with the reason the script shows.
pub fn check(root: &Path, allowed: &[String], run: &Run) -> Result<(PathBuf, PathBuf), String> {
    let name = run.program.as_str();
    if name.is_empty() || name.contains(['/', '\\']) {
        return Err(format!("exec: {name:?}: a program's name, not a path"));
    }
    if !allowed.iter().any(|a| a == name) {
        return Err(format!("exec: {name:?} is not in the manifest's [permissions] exec ({})", if allowed.is_empty() { "empty".into() } else { allowed.join(", ") }));
    }
    // in a Flatpak the program is the host's (platform/host.rs): the sandbox's runtime has none of the user's
    let exe = if crate::platform::host::sandboxed() { crate::platform::host::find(name) } else { on_path(name) };
    let exe = exe.ok_or_else(|| format!("exec: {name:?} is not installed on this machine (not on the PATH)"))?;
    let cwd = match run.cwd.as_deref().filter(|c| !c.is_empty()) {
        Some(c) => crate::paths::safe_join(root, c).map_err(|e| format!("exec: cwd: {e}"))?,
        None => root.to_path_buf(),
    };
    Ok((exe, cwd))
}

/// `name` found on the PATH (with Windows' extensions there).
fn on_path(name: &str) -> Option<PathBuf> {
    let exts: &[&str] = if cfg!(windows) { &["", ".exe", ".cmd", ".bat"] } else { &[""] };
    std::env::split_paths(&std::env::var_os("PATH")?).flat_map(|dir| exts.iter().map(move |e| dir.join(format!("{name}{e}")))).find(|p| p.is_file())
}

/// Runs it to the end, the time limit or `halt` (its helper stopped): `{status, stdout, stderr}` (status null when killed,
/// with `timedOut` or `stopped`), the output as text (invalid UTF-8 replaced), each kept to [`MAX_OUTPUT`] with `truncated`.
pub fn run(exe: &Path, cwd: &Path, r: &Run, halt: &std::sync::atomic::AtomicBool) -> Result<Value, String> {
    let name = &r.program;
    let mut cmd = Command::new(exe);
    cmd.args(&r.args).current_dir(cwd);
    if r.locale == Some(Locale::C) {
        cmd.env("LC_ALL", "C").env("LANG", "C");
    }
    let mut cmd = crate::platform::host::std_command(cmd).map_err(|e| format!("exec: {name}: {e}"))?;
    crate::platform::proc::own_group_blocking(&mut cmd);
    let mut child = cmd
        .stdin(if r.stdin.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("exec: {name}: {e}"))?;
    // stdin and both pipes on threads of their own: a program that fills one pipe while we wait on another never stalls
    let feed = r.stdin.clone().zip(child.stdin.take()).map(|(text, mut pipe)| std::thread::spawn(move || { let _ = pipe.write_all(text.as_bytes()); }));
    let drain = |pipe: Option<Box<dyn Read + Send>>| std::thread::spawn(move || {
        let (mut kept, mut more) = (Vec::new(), false);
        if let Some(mut p) = pipe {
            let mut buf = [0u8; 64 << 10];
            while let Ok(n) = p.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let room = MAX_OUTPUT.saturating_sub(kept.len());
                kept.extend_from_slice(&buf[..n.min(room)]);
                more |= n > room;
            }
        }
        (String::from_utf8_lossy(&kept).into_owned(), more)
    });
    let out = drain(child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
    let err = drain(child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>));
    let limit = Duration::from_secs(r.timeout.unwrap_or(DEFAULT_SECS).clamp(1, MAX_SECS));
    let t0 = Instant::now();
    let halted = || halt.load(std::sync::atomic::Ordering::Relaxed);
    let status = loop {
        match child.try_wait().map_err(|e| format!("exec: {name}: {e}"))? {
            Some(s) => break Some(s),
            None if t0.elapsed() > limit || halted() => {
                // the whole group: a child of the program holding the pipes would keep the readers waiting
                crate::platform::proc::stop_group(child.id(), crate::platform::proc::Stop::Kill);
                let _ = child.wait();
                break None;
            }
            None => std::thread::sleep(Duration::from_millis(20)),
        }
    };
    if let Some(f) = feed {
        let _ = f.join();
    }
    let ((stdout, more_out), (stderr, more_err)) = (out.join().unwrap_or_default(), err.join().unwrap_or_default());
    let mut v = json!({ "status": status.and_then(|s| s.code()), "stdout": stdout, "stderr": stderr });
    if status.is_none() {
        v[if halted() { "stopped" } else { "timedOut" }] = json!(true);
    }
    if more_out || more_err {
        v["truncated"] = json!(true);
    }
    Ok(v)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn ask(program: &str, args: &[&str]) -> Run {
        Run { program: program.into(), args: args.iter().map(|s| s.to_string()).collect(), stdin: None, cwd: None, timeout: None, locale: None }
    }

    #[test]
    fn only_a_named_installed_program_runs_inside_the_vault() {
        let dir = tempfile::tempdir().unwrap();
        let allowed = vec!["sh".to_string(), "no-such-program-atlas".to_string()];
        assert!(check(dir.path(), &allowed, &ask("cat", &[])).unwrap_err().contains("not in the manifest"));
        assert!(check(dir.path(), &allowed, &ask("/bin/sh", &[])).unwrap_err().contains("not a path"));
        assert!(check(dir.path(), &allowed, &ask("no-such-program-atlas", &[])).unwrap_err().contains("not installed"));
        let outside = Run { cwd: Some("../..".into()), ..ask("sh", &[]) };
        assert!(check(dir.path(), &allowed, &outside).is_err(), "a folder outside the vault");
        assert!(check(dir.path(), &allowed, &ask("sh", &[])).is_ok());
    }

    #[test]
    fn a_run_answers_its_status_and_output_and_is_killed_past_its_time() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("sub")).unwrap();
        let allowed = vec!["sh".to_string()];
        let go = |r: Run| {
            let (exe, cwd) = check(dir.path(), &allowed, &r).unwrap();
            run(&exe, &cwd, &r, &std::sync::atomic::AtomicBool::new(false)).unwrap()
        };
        let v = go(Run { stdin: Some("from stdin".into()), cwd: Some("sub".into()), ..ask("sh", &["-c", "cat; echo; basename \"$PWD\"; echo oops >&2; exit 3"]) });
        assert_eq!(v, json!({ "status": 3, "stdout": "from stdin\nsub\n", "stderr": "oops\n" }));
        let v = go(Run { locale: Some(Locale::C), ..ask("sh", &["-c", "echo $LC_ALL $LANG"]) });
        assert_eq!(v["stdout"], "C C\n");
        assert!(serde_json::from_str::<Run>(r#"{"program":"sh","locale":"fr_FR"}"#).is_err(), "C or nothing");
        let t0 = Instant::now();
        let v = go(Run { timeout: Some(1), ..ask("sh", &["-c", "sleep 30"]) });
        assert_eq!((v["status"].clone(), v["timedOut"].clone()), (Value::Null, json!(true)));
        assert!(t0.elapsed() < Duration::from_secs(10));
    }

    #[test]
    fn a_run_ends_when_its_helper_stops() {
        let dir = tempfile::tempdir().unwrap();
        let r = ask("sh", &["-c", "sleep 30"]);
        let (exe, cwd) = check(dir.path(), &["sh".to_string()], &r).unwrap();
        let halt = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let h = halt.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(200));
            h.store(true, std::sync::atomic::Ordering::Relaxed);
        });
        let t0 = Instant::now();
        let v = run(&exe, &cwd, &r, &halt).unwrap();
        assert_eq!((v["status"].clone(), v["stopped"].clone(), v.get("timedOut")), (Value::Null, json!(true), None));
        assert!(t0.elapsed() < Duration::from_secs(10));
    }
}
