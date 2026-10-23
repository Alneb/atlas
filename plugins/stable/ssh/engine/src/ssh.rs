//! The one ssh command line every use shares — sessions, the login tab, the page's terminals, sftp — over one shared
//! connection per host (ControlMaster, kept up as long as the settings say), and logging in: when a host wants a
//! passphrase or 2FA, the page opens a terminal tab (a `login` event) where the user answers.
use crate::hosts::{self, Host};
use crate::proc;
use crate::shell;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

/// When the ssh config sets no ControlPath of its own.
const FALLBACK_SOCKET: &str = "~/.ssh/atlas-%C";
/// How long the user has to answer the passphrase / 2FA in the login tab before it is asked again.
const LOGIN_WAIT: Duration = Duration::from_secs(300);

/// ssh itself: `ATLAS_SSH_BIN` (the tests' stand-in) or `ssh`.
pub fn ssh_bin() -> String {
    std::env::var("ATLAS_SSH_BIN").unwrap_or_else(|_| "ssh".into())
}

pub fn sftp_bin() -> String {
    std::env::var("ATLAS_SFTP_BIN").unwrap_or_else(|_| "sftp".into())
}

/// The plugin's cache folder (`ATLAS_PLUGIN_CACHE`, set by the core).
pub fn cache_dir() -> PathBuf {
    absolute(Path::new(&std::env::var("ATLAS_PLUGIN_CACHE").unwrap_or_else(|_| ".atlas/cache/plugins/ssh".into())))
}

pub fn absolute(p: &Path) -> PathBuf {
    if p.is_absolute() { p.to_path_buf() } else { std::env::current_dir().unwrap_or_default().join(p) }
}

/// The plugin's settings, as each call brings them.
#[derive(Debug, Clone, Default)]
pub struct Settings {
    config: String,
    extra: Vec<String>,
    options: Vec<String>,
    persist: String,
}

impl Settings {
    pub fn of(p: &Value) -> Settings {
        let s = &p["settings"];
        let text = |k: &str| s[k].as_str().map(str::trim).filter(|t| !t.is_empty()).map(str::to_string);
        Settings {
            config: text("config").unwrap_or_else(|| "~/.ssh/config".into()),
            extra: s["extra"].as_array().map(|a| a.iter().filter_map(Value::as_str).map(str::trim).filter(|t| !t.is_empty()).map(str::to_string).collect()).unwrap_or_default(),
            options: text("options").map(|o| o.split_whitespace().map(str::to_string).collect()).unwrap_or_default(),
            persist: text("persist").unwrap_or_else(|| "yes".into()),
        }
    }

    pub fn persist(&self) -> &str {
        &self.persist
    }

    /// The config's hosts, then the extra ones.
    pub fn hosts(&self) -> Vec<Host> {
        let mut found = Vec::new();
        hosts::read_config(&hosts::expand_home(&self.config), &mut found, &mut HashSet::new());
        for spec in &self.extra {
            if !found.iter().any(|h| &h.name == spec) {
                found.push(hosts::extra_host(spec));
            }
        }
        found
    }

    /// The arguments that reach `name`: a config host by its name, any other as `-p port user@host`.
    pub fn target(&self, name: &str) -> Vec<String> {
        let known = self.hosts();
        let h = known.iter().find(|h| h.name == name).cloned().unwrap_or_else(|| hosts::extra_host(name));
        if !h.is_extra() {
            return vec![name.to_string()];
        }
        let host = h.hostname.clone().unwrap_or_default();
        let at = match &h.user { Some(u) => format!("{u}@{host}"), None => host };
        match &h.port { Some(p) => vec!["-p".into(), p.clone(), at], None => vec![at] }
    }

    /// One connection per host: the config's own ControlPath when it sets one (a plain `ssh host` elsewhere shares it
    /// too), else ours.
    fn control(&self, target: &[String]) -> Vec<String> {
        let mut args: Vec<String> = ["-o", "ControlMaster=auto", "-o", &format!("ControlPersist={}", self.persist), "-o", "ServerAliveInterval=60", "-o", "ServerAliveCountMax=5"].map(String::from).to_vec();
        if !has_own_socket(target) {
            args.extend(["-o".to_string(), format!("ControlPath={FALLBACK_SOCKET}")]);
        }
        args
    }

    /// `ssh <shared connection> <options> <more> <target>`.
    pub fn argv(&self, host: &str, more: &[&str]) -> Vec<String> {
        let target = self.target(host);
        let mut a = vec![ssh_bin()];
        a.extend(self.control(&target));
        a.extend(self.options.iter().cloned());
        a.extend(more.iter().map(|m| m.to_string()));
        a.extend(target);
        a
    }

    /// `ssh … -s host sftp`: the sftp subsystem over the shared connection, for the kept channel (wire.rs). Never a
    /// master of its own, never asking (the first value of an option wins, so these go before the shared ones).
    pub fn subsystem_argv(&self, host: &str) -> Vec<String> {
        let mut a = vec![ssh_bin()];
        a.extend(["-o", "ControlMaster=no", "-o", "BatchMode=yes"].map(String::from));
        a.extend(self.argv(host, &["-s"]).into_iter().skip(1));
        a.push("sftp".into());
        a
    }

    /// sftp over the same shared connection (`-b -`: commands on stdin).
    pub fn sftp_argv(&self, host: &str) -> Vec<String> {
        let target = self.target(host);
        let (port, target) = if target[0] == "-p" { (Some(target[1].clone()), target[2..].to_vec()) } else { (None, target) };
        let mut a = vec![sftp_bin()];
        if ssh_bin() != "ssh" {
            a.extend(["-S".to_string(), ssh_bin()]);
        }
        a.extend(self.control(&target));
        a.extend(self.options.iter().cloned());
        if let Some(p) = port {
            a.extend(["-P".to_string(), p]);
        }
        a.extend(["-b".to_string(), "-".to_string()]);
        a.extend(target);
        a
    }

    /// Whether the shared connection to `host` is up (then nothing is asked).
    pub fn connected(&self, host: &str) -> bool {
        proc::run(&self.argv(host, &["-O", "check"]), None, Duration::from_secs(10)).ok()
    }

    /// The shared connection, brought up without asking anything when keys suffice; false when the host wants a
    /// passphrase or 2FA.
    pub fn bring_up(&self, host: &str) -> bool {
        if self.connected(host) {
            return true;
        }
        let mut argv = self.argv(host, &["-o", "BatchMode=yes"]);
        argv.push("true".into());
        proc::quiet(&argv, Duration::from_secs(30))
    }

    /// When the shared connection to `host` started (seconds since 1970), from its master's process; None when down.
    pub fn master_since(&self, host: &str) -> Option<f64> {
        let r = proc::run(&self.argv(host, &["-O", "check"]), None, Duration::from_secs(10));
        let pid = regex::Regex::new(r"pid=(\d+)").ok()?.captures(&format!("{}{}", r.err, r.out))?.get(1)?.as_str().to_string();
        if !r.ok() {
            return None;
        }
        let started = || -> Option<f64> {
            let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
            let ticks: f64 = stat.rsplit_once(')')?.1.split_whitespace().nth(19)?.parse().ok()?; // field 22: start after boot
            let boot: f64 = std::fs::read_to_string("/proc/stat").ok()?.lines().find_map(|l| l.strip_prefix("btime "))?.trim().parse().ok()?;
            Some(boot + ticks / 100.0) // USER_HZ: 100 on Linux
        };
        Some(started().unwrap_or_else(now))
    }
}

pub fn now() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or_default()
}

/// Whether the ssh config gives `target` a ControlPath of its own (asked once per helper run).
fn has_own_socket(target: &[String]) -> bool {
    static SEEN: LazyLock<Mutex<HashMap<Vec<String>, bool>>> = LazyLock::new(Default::default);
    if let Some(&own) = SEEN.lock().unwrap_or_else(|e| e.into_inner()).get(target) {
        return own;
    }
    let mut argv = vec![ssh_bin(), "-G".into()];
    argv.extend(target.iter().cloned());
    let conf = proc::run(&argv, None, Duration::from_secs(10)).out;
    let own = conf.lines().find_map(|l| l.strip_prefix("controlpath ")).is_some_and(|p| p.trim() != "none");
    SEEN.lock().unwrap_or_else(|e| e.into_inner()).insert(target.to_vec(), own);
    own
}

/// A name with nothing a shell or a path would read: letters, digits and `_ . @ : -` kept (`keep`), the rest `_`.
pub fn safe(s: &str, keep: &str) -> String {
    s.chars().map(|c| if c.is_alphanumeric() || c == '_' || keep.contains(c) { c } else { '_' }).collect()
}

/// A fresh hex token (markers, tab ids): unguessable enough for a pipe nobody else writes to.
pub fn token() -> String {
    use std::hash::{BuildHasher, Hasher};
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or_default());
    format!("{:012x}", h.finish() & 0xffff_ffff_ffff)
}

static LOGINS: LazyLock<Mutex<HashMap<String, Instant>>> = LazyLock::new(Default::default);

/// Asks the page (once per LOGIN_WAIT) for the login tab on `host`, then waits up to `wait` for the connection: true
/// once it is up. ControlPersist keeps it after the tab's `ssh … true` returns, so the tab closes; AddKeysToAgent spares
/// the key's passphrase on a later reconnect (2FA is asked again).
pub fn login(s: &Settings, host: &str, wait: Duration, why: &str) -> bool {
    {
        let mut logins = LOGINS.lock().unwrap_or_else(|e| e.into_inner());
        if logins.get(host).is_none_or(|&until| until < Instant::now()) {
            logins.insert(host.to_string(), Instant::now() + LOGIN_WAIT);
            match login_script(s, host, why) {
                Ok(path) => atlas_plugin::event("login", json!({ "host": host, "command": format!("sh {}", shell::quote(&path.to_string_lossy())) })),
                Err(e) => eprintln!("atlas-ssh: the login script could not be written: {e}"),
            }
        }
    }
    let end = Instant::now() + wait;
    while Instant::now() < end {
        if s.connected(host) {
            LOGINS.lock().unwrap_or_else(|e| e.into_inner()).remove(host);
            return true;
        }
        std::thread::sleep(Duration::from_millis(1500));
    }
    false
}

/// The login tab's script: who asks and why, then `ssh … true` until it connects (Enter tries again, Ctrl+C gives up).
fn login_script(s: &Settings, host: &str, why: &str) -> std::io::Result<PathBuf> {
    let ssh = format!("{} true", shell::join(&s.argv(host, &["-o", "AddKeysToAgent=yes"])));
    let safe = safe(host, ".@:-"); // also what the header shows: nothing a shell would read
    let path = cache_dir().join(format!("login-{safe}.sh"));
    std::fs::create_dir_all(cache_dir())?;
    std::fs::write(
        &path,
        format!(
            "printf '\\033[1;33m⚠ SSH login to {safe}\\033[0m, asked by {why}.\\n'
printf 'Answer the prompts below (key passphrase, 2FA). This tab closes once connected; Ctrl+C refuses.\\n\\n'
until {ssh}; do
  printf '\\n\\033[31mNot connected.\\033[0m Enter: try again · Ctrl+C: give up '
  read _ || exit 1
done
printf '\\033[32mConnected.\\033[0m\\n'
sleep 1
"
        ),
    )?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_config_host_is_reached_by_its_name_any_other_by_user_host_and_port() {
        let s = Settings::of(&json!({ "settings": { "config": "/no/such/config", "extra": ["me@box.example.org:2200"] } }));
        assert_eq!(s.target("me@box.example.org:2200"), ["-p", "2200", "me@box.example.org"]);
        assert_eq!(s.target("other.example.org"), ["other.example.org"]);
        assert_eq!(safe("a b;c@d:1", ".@:-"), "a_b_c@d:1");
        assert_ne!(token(), token());
    }
}
