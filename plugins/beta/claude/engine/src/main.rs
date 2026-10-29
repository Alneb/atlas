//! The Claude plugin's helper (plugin.toml `[helper]`): `usage` (the plan's limits of the account Atlas's Claude runs
//! as, or of every account), `commands` and `account_folders` (the settings' suggestions). The access token is read
//! from the credentials file at each look and only sent to the usage endpoint, through the core's fetch. Answers are
//! kept 90 s per account (the bar asks every couple of minutes, an agent may ask too); the session hooks' fresh copy
//! is used first, and on a failure the last numbers known are shown with their age.
use atlas_plugin::{Atlas, Methods};
use claude::{accounts, email_of, hooks_cache, in_use, shape, tilde, token, URL};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const TTL: Duration = Duration::from_secs(90);

fn age(t: SystemTime) -> Duration {
    SystemTime::now().duration_since(t).unwrap_or_default()
}

/// The hooks' copy of this account's answer when younger than `fresh` → (data, its time).
fn shared(credentials: &Path, fresh: Duration) -> Option<(Value, SystemTime)> {
    let f = hooks_cache(&std::env::temp_dir(), credentials);
    let at = std::fs::metadata(&f).ok()?.modified().ok()?;
    if age(at) >= fresh {
        return None;
    }
    let v: Value = serde_json::from_str(&std::fs::read_to_string(&f).ok()?).ok()?;
    v.get("raw").filter(|r| r.is_object()).map(|r| (r.clone(), at))
}

fn ask(atlas: &Atlas, credentials: &Path) -> Result<Value, String> {
    let tok = token(&std::fs::read_to_string(credentials).map_err(|e| e.to_string())?).ok_or("not signed in (no access token)")?;
    let req = json!({ "url": URL, "headers": { "Authorization": format!("Bearer {tok}"), "anthropic-beta": "oauth-2025-04-20", "Accept": "application/json" }, "timeout_secs": 10 });
    let r = atlas.post("/api/plugins/claude/fetch", &req).map_err(|e| e.why)?;
    if r["ok"] != true {
        return Err(format!("the usage endpoint answered {}", r["status"]));
    }
    serde_json::from_str(r["text"].as_str().unwrap_or_default()).map_err(|e| e.to_string())
}

struct Usage {
    atlas: Atlas,
    home: PathBuf,
    root: PathBuf,
    /// credentials → (when, answer)
    cache: HashMap<PathBuf, (SystemTime, Value)>,
    /// credentials → (when, the last answer read): shown, dated, when a look fails
    good: HashMap<PathBuf, (SystemTime, Value)>,
}

impl Usage {
    /// One account's answer: the hooks' fresh copy, else asked; on a failure the last known, else the reason.
    fn look(&mut self, credentials: &Path, name: &str, folder: &str) -> Value {
        let got = shared(credentials, TTL).map(Ok).unwrap_or_else(|| ask(&self.atlas, credentials).map(|d| (d, SystemTime::now())));
        match got {
            Ok((data, at)) => {
                let s = shape(name, folder, &data);
                self.good.insert(credentials.to_path_buf(), (at, s.clone()));
                s
            }
            Err(why) => {
                let late = shared(credentials, Duration::from_secs(6 * 3600)).map(|(d, at)| (at, shape(name, folder, &d)));
                let last = [self.good.get(credentials).cloned(), late].into_iter().flatten().max_by_key(|(at, _)| *at);
                match last {
                    Some((at, mut s)) => {
                        s["stale"] = json!(age(at).as_secs() / 60);
                        s
                    }
                    None => json!({ "name": name, "folder": folder, "limits": [], "credits": false, "error": why }),
                }
            }
        }
    }

    fn usage(&mut self, p: &Value) -> Value {
        let config = std::fs::read_to_string(self.root.join(".atlas/config.toml")).unwrap_or_default();
        let config_dir = std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from);
        let current = in_use(p["settings"]["account"].as_str().unwrap_or_default(), &config, config_dir.as_deref(), &self.home);
        let real = |c: &Path| c.parent().map(|d| std::fs::canonicalize(d).unwrap_or_else(|_| d.to_path_buf()));
        let mut found = accounts(&self.home, config_dir.as_deref());
        if p["all"] != true {
            // the other accounts are optional (claude-switch may not be there): the current one is asked even unlisted
            found.retain(|a| real(&a.credentials).as_deref() == Some(current.as_path()));
            if found.is_empty() {
                let name = if current == std::fs::canonicalize(self.home.join(".claude")).unwrap_or_default() { "default".into() } else { current.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default() };
                found.push(claude::Account { name, credentials: current.join(".credentials.json") });
            }
        }
        let mut out = Vec::new();
        for a in found {
            let name = email_of(&a.credentials).unwrap_or_else(|| a.name.clone());
            let is_current = real(&a.credentials).as_deref() == Some(current.as_path());
            if !a.credentials.is_file() {
                out.push(json!({ "name": name, "folder": a.name, "limits": [], "credits": false, "current": true, "error": format!("not signed in (no {})", a.credentials.display()) }));
                continue;
            }
            let answer = match self.cache.get(&a.credentials) {
                Some((at, v)) if age(*at) < TTL => v.clone(),
                _ => {
                    let v = self.look(&a.credentials, &name, &a.name);
                    // a failure is asked again in a minute, not after the whole TTL
                    let at = if v.get("error").is_some() || v.get("stale").is_some() { SystemTime::now() - TTL + Duration::from_secs(60) } else { SystemTime::now() };
                    self.cache.insert(a.credentials.clone(), (at, v.clone()));
                    v
                }
            };
            let mut answer = answer;
            answer["current"] = json!(is_current);
            out.push(answer);
        }
        json!({ "accounts": out })
    }
}

/// Every `claude` on PATH (one per real file) with its version, a wrapper script said as such, and
/// `claude-acc run <account>` per account when the switcher sits beside one.
fn commands(home: &Path) -> Value {
    let mut found: Vec<PathBuf> = Vec::new();
    for d in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
        let c = d.join("claude");
        if c.is_file() && !found.iter().any(|f| std::fs::canonicalize(f).ok() == std::fs::canonicalize(&c).ok()) {
            found.push(c);
        }
    }
    let version = |c: &PathBuf| -> Option<String> {
        if std::fs::read(c).ok().is_some_and(|b| b.starts_with(b"#!")) {
            return Some("wrapper script".into());
        }
        let out = std::process::Command::new(c).arg("--version").output().ok()?;
        String::from_utf8_lossy(&out.stdout).lines().next().map(|l| l.trim().to_string()).filter(|l| !l.is_empty())
    };
    // `--version` takes a few hundred ms each: asked side by side
    let versions: Vec<Option<String>> = std::thread::scope(|s| {
        let hs: Vec<_> = found.iter().map(|c| s.spawn(move || version(c))).collect();
        hs.into_iter().map(|h| h.join().ok().flatten()).collect()
    });
    let mut out = vec![json!({ "value": "claude", "label": "claude — first on PATH" })];
    for (c, v) in found.iter().zip(versions) {
        let t = tilde(c, home);
        out.push(json!({ "value": t, "label": match v { Some(v) => format!("{t} — {v}"), None => t.clone() } }));
    }
    if let Some(acc) = found.iter().map(|c| c.with_file_name("claude-acc")).find(|a| a.is_file()) {
        let listed = std::process::Command::new(&acc).arg("list").output().map(|o| String::from_utf8_lossy(&o.stdout).into_owned()).unwrap_or_default();
        // lines like "    personal": the header and "~/.claude/ (standard)" left out
        for name in listed.lines().skip(1).map(str::trim).filter(|n| !n.is_empty() && !n.contains('/') && !n.contains(' ')) {
            out.push(json!({ "value": format!("claude-acc run {name}"), "label": format!("claude-acc run {name} — account {name}") }));
        }
    }
    Value::Array(out)
}

/// The configuration folders holding credentials, each with its address; empty = Claude Code's own ~/.claude.
fn account_folders(home: &Path) -> Value {
    let default = std::fs::canonicalize(home.join(".claude")).ok();
    let mut out = vec![json!({ "value": "", "label": "Default (~/.claude)" })];
    for a in accounts(home, std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from).as_deref()) {
        let folder = a.credentials.parent().unwrap_or(Path::new("")).to_path_buf();
        if std::fs::canonicalize(&folder).ok() == default {
            continue;
        }
        let label = match email_of(&a.credentials) { Some(m) => format!("{} — {m}", a.name), None => a.name.clone() };
        out.push(json!({ "value": tilde(&folder, home), "label": label }));
    }
    Value::Array(out)
}

fn main() {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from).unwrap_or_default();
    let root = PathBuf::from(std::env::var_os("ATLAS_ROOT").unwrap_or_else(|| ".".into()));
    let mut usage = Usage { atlas: Atlas::new(), home: home.clone(), root, cache: HashMap::new(), good: HashMap::new() };
    let mut methods = Methods::new();
    methods.add("usage", move |p| Ok(usage.usage(&p)));
    let h = home.clone();
    methods.add("commands", move |_| Ok(commands(&h)));
    methods.add("account_folders", move |_| Ok(account_folders(&home)));
    atlas_plugin::serve(methods);
}
