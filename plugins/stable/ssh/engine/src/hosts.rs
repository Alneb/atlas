//! The hosts of an ssh config: `Host` names (wildcard patterns are not hosts), with the first `HostName`, `User` and
//! `Port` each one meets, as ssh takes them; `Include` lines followed, relative ones from ~/.ssh as ssh does. Plus the
//! settings' extra hosts (`user@host:port`).
use crate::shell;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Host {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<String>,
    /// The config file it was read from, or `settings`.
    pub from: String,
}

impl Host {
    /// Typed in the settings or by an agent, not in the config.
    pub fn is_extra(&self) -> bool {
        self.from == "settings"
    }
}

pub fn home() -> PathBuf {
    PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
}

pub fn expand_home(p: &str) -> PathBuf {
    match p.strip_prefix('~') {
        Some("") => home(),
        Some(rest) if rest.starts_with('/') => home().join(&rest[1..]),
        _ => PathBuf::from(p),
    }
}

/// The hosts of the config at `path` (and what it includes), in the order met; `hosts` grows.
pub fn read_config(path: &Path, hosts: &mut Vec<Host>, seen: &mut HashSet<PathBuf>) {
    let Ok(path) = path.canonicalize() else { return };
    if !path.is_file() || !seen.insert(path.clone()) {
        return;
    }
    let text = String::from_utf8_lossy(&std::fs::read(&path).unwrap_or_default()).into_owned();
    let mut current: Vec<usize> = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.replacen('=', " ", 1);
        let (key, value) = line.split_once(char::is_whitespace).unwrap_or((&line, ""));
        let (key, value) = (key.to_lowercase(), value.trim());
        match key.as_str() {
            "include" => {
                for pattern in shell::split(value) {
                    let mut p = expand_home(&pattern);
                    if p.is_relative() {
                        p = home().join(".ssh").join(p);
                    }
                    for inc in glob(&p) {
                        read_config(&inc, hosts, seen);
                    }
                }
            }
            "host" => {
                current.clear();
                for name in shell::split(value) {
                    if name.contains(['*', '?', '!']) {
                        continue;
                    }
                    let i = hosts.iter().position(|h| h.name == name).unwrap_or_else(|| {
                        hosts.push(Host { name: name.clone(), hostname: None, user: None, port: None, from: path.to_string_lossy().into_owned() });
                        hosts.len() - 1
                    });
                    current.push(i);
                }
            }
            "match" => current.clear(),
            "hostname" | "user" | "port" => {
                for &i in &current {
                    let h = &mut hosts[i];
                    let slot = match key.as_str() {
                        "hostname" => &mut h.hostname,
                        "user" => &mut h.user,
                        _ => &mut h.port,
                    };
                    slot.get_or_insert_with(|| value.to_string()); // ssh takes the first value it meets
                }
            }
            _ => {}
        }
    }
}

/// `user@host:port` (user and port optional) as a host.
pub fn extra_host(spec: &str) -> Host {
    let spec = spec.trim();
    let (user, rest) = match spec.rsplit_once('@') {
        Some((u, r)) => (Some(u.to_string()).filter(|u| !u.is_empty()), r),
        None => (None, spec),
    };
    let (host, port) = match rest.split_once(':') {
        Some((h, p)) => (h, Some(p.to_string()).filter(|p| !p.is_empty())),
        None => (rest, None),
    };
    Host { name: spec.to_string(), hostname: Some(host.to_string()), user, port, from: "settings".into() }
}

/// The files a pattern names (`*` and `?` in any part, a hidden name only when the pattern says `.`), sorted.
fn glob(pattern: &Path) -> Vec<PathBuf> {
    let mut found = vec![PathBuf::new()];
    for part in pattern.components() {
        let part = part.as_os_str().to_string_lossy();
        if !part.contains(['*', '?']) {
            found.iter_mut().for_each(|p| p.push(part.as_ref()));
            continue;
        }
        let mut next = Vec::new();
        for dir in &found {
            let Ok(entries) = std::fs::read_dir(if dir.as_os_str().is_empty() { Path::new(".") } else { dir }) else { continue };
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if (part.starts_with('.') || !name.starts_with('.')) && wildcard(&part, &name) {
                    next.push(dir.join(name));
                }
            }
        }
        found = next;
    }
    found.retain(|p| p.exists());
    found.sort();
    found
}

/// `*` any run of characters, `?` one.
fn wildcard(pattern: &str, name: &str) -> bool {
    fn go(p: &[char], n: &[char]) -> bool {
        match (p.first(), n.first()) {
            (None, None) => true,
            (Some('*'), _) => go(&p[1..], n) || (!n.is_empty() && go(p, &n[1..])),
            (Some('?'), Some(_)) => go(&p[1..], &n[1..]),
            (Some(a), Some(b)) if a == b => go(&p[1..], &n[1..]),
            _ => false,
        }
    }
    go(&pattern.chars().collect::<Vec<_>>(), &name.chars().collect::<Vec<_>>())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosts_come_from_the_config_and_what_it_includes_patterns_left_out_first_values_kept() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("conf.d")).unwrap();
        std::fs::write(d.path().join("conf.d/lab"), "Host lab gpu\n  HostName lab.example.org\n  User me\n").unwrap();
        std::fs::write(d.path().join("conf.d/.hidden"), "Host secret\n").unwrap();
        let main = d.path().join("config");
        std::fs::write(&main, format!("Host iq\n  HostName=iq.example.org\n  Port 2222\n  HostName other\nHost *.lan !x\n  User nobody\nInclude {}/conf.d/*\nMatch all\n  User ignored\n", d.path().display())).unwrap();
        let mut hosts = Vec::new();
        read_config(&main, &mut hosts, &mut HashSet::new());
        let got: Vec<_> = hosts.iter().map(|h| (h.name.as_str(), h.hostname.as_deref(), h.user.as_deref(), h.port.as_deref())).collect();
        assert_eq!(got, [("iq", Some("iq.example.org"), None, Some("2222")), ("lab", Some("lab.example.org"), Some("me"), None), ("gpu", Some("lab.example.org"), Some("me"), None)]);
    }

    #[test]
    fn an_extra_host_is_user_at_host_colon_port() {
        let h = extra_host(" me@box.example.org:2200 ");
        assert_eq!((h.name.as_str(), h.hostname.as_deref(), h.user.as_deref(), h.port.as_deref(), h.is_extra()), ("me@box.example.org:2200", Some("box.example.org"), Some("me"), Some("2200"), true));
        assert_eq!(extra_host("box").user, None);
    }
}
