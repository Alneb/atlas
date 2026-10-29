//! Atlas inside a Flatpak. What a vault runs (plugin helpers, vault commands, `atlas.exec`, terminal tabs, language
//! servers) is the user's, installed on the host, not in the sandbox's runtime, so it is started there through
//! `flatpak-spawn --host` (the manifest's `--talk-name=org.freedesktop.Flatpak`). Outside a Flatpak nothing here
//! changes a command.
//!
//! The environment a command is given (a helper's key, an agent tab's token) never goes on a command line, where any
//! local user could read it: it is written to a file only this user can read, in the sandbox's own `/tmp`. The
//! sandbox's `sh` opens it as fd 3, deletes it, and becomes `flatpak-spawn --env-fd=3`. A pipe would need a raw
//! `pre_exec`, and a terminal's pty closes every fd but 0–2 in the child, so the file is the one way that serves all.
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Whether this process runs in a Flatpak sandbox (Flatpak puts `/.flatpak-info` in every one).
pub fn sandboxed() -> bool {
    static IN: OnceLock<bool> = OnceLock::new();
    *IN.get_or_init(|| cfg!(target_os = "linux") && Path::new("/.flatpak-info").is_file())
}

/// Opens the environment file as fd 3, deletes it, and starts the rest of the arguments with it.
const WITH_ENV: &str = r#"exec 3<"$1" && rm -f -- "$1" && shift && exec flatpak-spawn --env-fd=3 "$@""#;

/// The program and arguments that start `program args` on the host, in `cwd`, with `env` added to the host session's
/// own environment. The caller sets nothing else on the process: stdio, groups and the rest apply as before.
/// `--watch-bus` ends the host's process when ours ends, even by SIGKILL (a timeout, a stopped helper); a SIGTERM
/// is passed on by flatpak-spawn itself.
pub fn wrap(program: &OsStr, args: &[OsString], cwd: Option<&Path>, env: &[(OsString, OsString)]) -> std::io::Result<(OsString, Vec<OsString>)> {
    let spawn = spawn_args(program, args, cwd);
    if env.is_empty() {
        return Ok(("flatpak-spawn".into(), spawn));
    }
    with_env_file(WITH_ENV, env, spawn)
}

/// Like [`wrap`], for a terminal tab whose pty is the process's stdin. Flatpak's session helper makes that pty the
/// host shell's controlling terminal (Ctrl+C, job control, `/dev/tty`), but only if the sandbox's side holds none: a
/// session leader that opens its terminal takes it (bash does at start, so the `sh` that reads the variables would),
/// and then the host's shell has none. So the leader is `timeout --foreground 0` (no limit): it opens nothing,
/// runs the rest as a child that can take no terminal, and passes on the signals it gets.
pub fn wrap_terminal(argv: &[OsString], cwd: Option<&Path>, env: &[(OsString, OsString)]) -> std::io::Result<(OsString, Vec<OsString>)> {
    let (program, args) = with_env_file(WITH_ENV, env, spawn_args(&argv[0], &argv[1..], cwd))?;
    let mut out: Vec<OsString> = vec!["--foreground".into(), "0".into(), program];
    out.extend(args);
    Ok(("timeout".into(), out))
}

/// `flatpak-spawn`'s arguments that start `program args` on the host, in `cwd`.
fn spawn_args(program: &OsStr, args: &[OsString], cwd: Option<&Path>) -> Vec<OsString> {
    let mut spawn: Vec<OsString> = vec!["--host".into(), "--watch-bus".into()];
    if let Some(cwd) = cwd {
        let mut d = OsString::from("--directory=");
        d.push(cwd);
        spawn.push(d);
    }
    spawn.push("--".into());
    spawn.push(program.into());
    spawn.extend(args.iter().cloned());
    spawn
}

/// `sh -c script` with `env` in a private file as its first argument and `spawn` (flatpak-spawn's) after it.
fn with_env_file(script: &str, env: &[(OsString, OsString)], spawn: Vec<OsString>) -> std::io::Result<(OsString, Vec<OsString>)> {
    let file = env_file(env)?;
    let mut out: Vec<OsString> = vec!["-c".into(), script.into(), "atlas-host".into(), file.into_os_string()];
    out.extend(spawn);
    Ok(("sh".into(), out))
}

/// `env` in `env -0` form (`NAME=value\0`), in a new file only this user can read.
fn env_file(env: &[(OsString, OsString)]) -> std::io::Result<PathBuf> {
    static N: AtomicU64 = AtomicU64::new(0);
    let path = std::env::temp_dir().join(format!("atlas-env-{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
    let mut bytes = Vec::new();
    for (k, v) in env {
        bytes.extend_from_slice(k.as_encoded_bytes());
        bytes.push(b'=');
        bytes.extend_from_slice(v.as_encoded_bytes());
        bytes.push(0);
    }
    crate::vault_write::outside::write_private(&path, &bytes).map_err(std::io::Error::other)?;
    Ok(path)
}

/// `cmd` as it starts on the host when Atlas is sandboxed, else `cmd` unchanged. Only the program, arguments, folder
/// and the variables `cmd` sets carry over: build `cmd` with those, then set stdio and the rest on what comes back.
pub fn std_command(cmd: std::process::Command) -> std::io::Result<std::process::Command> {
    if !sandboxed() {
        return Ok(cmd);
    }
    let args: Vec<OsString> = cmd.get_args().map(OsStr::to_os_string).collect();
    // a variable `cmd` removes is not set on the host's side at all: the host session's environment is fresh
    let env: Vec<(OsString, OsString)> = cmd.get_envs().filter_map(|(k, v)| Some((k.to_os_string(), v?.to_os_string()))).collect();
    let (program, args) = wrap(cmd.get_program(), &args, cmd.get_current_dir(), &env)?;
    let mut out = std::process::Command::new(program);
    out.args(args);
    Ok(out)
}

/// Where `name` is on the host's PATH (None outside a Flatpak, or when the host has no such program). Asked of the
/// host with `command -v`, remembered for a minute: a Settings page lists many servers at once.
pub fn find(name: &str) -> Option<PathBuf> {
    if !sandboxed() || name.is_empty() || name.contains('/') {
        return None;
    }
    type Seen = std::collections::HashMap<String, (Instant, Option<PathBuf>)>;
    static SEEN: OnceLock<Mutex<Seen>> = OnceLock::new();
    let seen = SEEN.get_or_init(Mutex::default);
    if let Some((at, p)) = seen.lock().ok()?.get(name) {
        if at.elapsed() < Duration::from_secs(60) {
            return p.clone();
        }
    }
    let found = std::process::Command::new("flatpak-spawn")
        .args(["--host", "sh", "-c", r#"command -v -- "$1""#, "sh", name])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|p| p.starts_with('/'))
        .map(PathBuf::from);
    if let Ok(mut s) = seen.lock() {
        s.insert(name.to_string(), (Instant::now(), found.clone()));
    }
    found
}

/// The host user's login shell, for a terminal tab: the sandbox's `$SHELL` may name a program only the host has, or
/// none. The host session's `$SHELL`, else the passwd entry's. None outside a Flatpak.
pub fn shell() -> Option<String> {
    if !sandboxed() {
        return None;
    }
    static SHELL: OnceLock<Option<String>> = OnceLock::new();
    SHELL
        .get_or_init(|| {
            let o = std::process::Command::new("flatpak-spawn")
                .args(["--host", "sh", "-c", r#"printf %s "${SHELL:-$(getent passwd "$(id -un)" | cut -d: -f7)}""#])
                .stdin(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .output()
                .ok()?;
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            (o.status.success() && s.starts_with('/')).then_some(s)
        })
        .clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_command_with_variables_reads_them_from_a_private_file_and_only_its_name_is_on_the_line() {
        let env = [(OsString::from("ATLAS_PLUGIN_KEY"), OsString::from("k-secret"))];
        let (program, args) = wrap(OsStr::new("python3"), &["-u".into(), "helper.py".into()], Some(Path::new("/home/u/vault")), &env).unwrap();
        assert_eq!(program, "sh");
        let line: Vec<String> = args.iter().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(line[..3], ["-c", WITH_ENV, "atlas-host"]);
        assert_eq!(line[4..], ["--host", "--watch-bus", "--directory=/home/u/vault", "--", "python3", "-u", "helper.py"]);
        assert!(!line.iter().any(|a| a.contains("k-secret")), "the key is not on the command line");
        let file = PathBuf::from(&line[3]);
        assert_eq!(std::fs::read(&file).unwrap(), b"ATLAS_PLUGIN_KEY=k-secret\0");
        #[cfg(unix)]
        assert_eq!(std::os::unix::fs::PermissionsExt::mode(&std::fs::metadata(&file).unwrap().permissions()) & 0o777, 0o600);
        std::fs::remove_file(file).unwrap();
    }

    #[test]
    fn a_command_without_variables_is_flatpak_spawn_itself() {
        let (program, args) = wrap(OsStr::new("lpstat"), &["-e".into()], None, &[]).unwrap();
        assert_eq!(program, "flatpak-spawn");
        assert_eq!(args, ["--host", "--watch-bus", "--", "lpstat", "-e"]);
    }

    #[test]
    fn a_terminal_is_led_by_timeout_so_no_shell_in_the_sandbox_takes_its_pty() {
        let env = [(OsString::from("ATLAS_ROOT"), OsString::from("/home/u/vault"))];
        let (program, args) = wrap_terminal(&["/usr/bin/zsh".into(), "-l".into()], None, &env).unwrap();
        assert_eq!(program, "timeout");
        let line: Vec<String> = args.iter().map(|a| a.to_string_lossy().into_owned()).collect();
        assert_eq!(line[..5], ["--foreground", "0", "sh", "-c", WITH_ENV]);
        assert_eq!(line[7..], ["--host", "--watch-bus", "--", "/usr/bin/zsh", "-l"]);
        std::fs::remove_file(&line[6]).unwrap();
    }

    /// The shell step itself, with a stand-in for flatpak-spawn that prints fd 3 and its arguments: the file is read
    /// once and gone before the program starts.
    #[cfg(unix)]
    #[test]
    fn the_shell_step_hands_the_file_over_as_fd_3_and_deletes_it() {
        let bin = tempfile::tempdir().unwrap();
        let fake = bin.path().join("flatpak-spawn");
        std::fs::write(&fake, "#!/bin/sh\nfor a in \"$@\"; do printf '[%s]' \"$a\"; done; echo; tr '\\0' '\\n' <&3\n").unwrap();
        std::fs::set_permissions(&fake, std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();
        let env = [(OsString::from("A"), OsString::from("1 2")), (OsString::from("B"), OsString::from("x=y"))];
        let (program, args) = wrap(OsStr::new("prog"), &["a b".into()], None, &env).unwrap();
        let file = PathBuf::from(&args[3]);
        let path = format!("{}:{}", bin.path().display(), std::env::var("PATH").unwrap_or_default());
        let out = std::process::Command::new(program).args(&args).env("PATH", path).output().unwrap();
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
        let text = String::from_utf8_lossy(&out.stdout);
        assert_eq!(text, "[--env-fd=3][--host][--watch-bus][--][prog][a b]\nA=1 2\nB=x=y\n");
        assert!(!file.exists(), "the file is gone once handed over");
    }
}
