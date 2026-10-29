//! The Claude plugin's helper, its pure parts: which Claude Code accounts this computer has, which one Atlas's Claude
//! runs as, and the usage endpoint's answer read into limits. The files and the network come in from main.rs, so the
//! tests run on a throwaway home.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const URL: &str = "https://api.anthropic.com/api/oauth/usage";

/// An account: its name (the folder's) and its `.credentials.json`.
#[derive(Debug, Clone, PartialEq)]
pub struct Account {
    pub name: String,
    pub credentials: PathBuf,
}

fn real(p: &Path) -> PathBuf {
    std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}

/// Every account: `$CLAUDE_CONFIG_DIR`, `~/.claude` (the default) and, when claude-switch is installed, its accounts
/// (`~/.claude-switch/**/.credentials.json`) — found by their shape, so a new one appears by itself; one per real file.
pub fn accounts(home: &Path, config_dir: Option<&Path>) -> Vec<Account> {
    let mut found: Vec<Account> = Vec::new();
    let mut add = |name: String, path: PathBuf| {
        if path.is_file() && !found.iter().any(|a| real(&a.credentials) == real(&path)) {
            found.push(Account { name, credentials: path });
        }
    };
    if let Some(dir) = config_dir {
        let name = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "claude".into());
        add(name, dir.join(".credentials.json"));
    }
    add("default".into(), home.join(".claude/.credentials.json"));
    let mut switch = Vec::new();
    walk(&home.join(".claude-switch"), 6, &mut switch);
    switch.sort();
    for path in switch {
        let name = path.parent().and_then(Path::file_name).map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        add(name, path);
    }
    found
}

fn walk(dir: &Path, depth: u32, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() && depth > 0 {
            walk(&p, depth - 1, out);
        } else if p.file_name().is_some_and(|n| n == ".credentials.json") {
            out.push(p);
        }
    }
}

/// The account's address, as Claude Code keeps it beside the credentials: `<dir>/.claude.json`, or for `~/.claude`
/// the `~/.claude.json` next to it.
pub fn email_of(credentials: &Path) -> Option<String> {
    let folder = credentials.parent()?;
    let beside = PathBuf::from(format!("{}.json", folder.to_string_lossy().trim_end_matches('/')));
    [folder.join(".claude.json"), beside].iter().find_map(|f| {
        let v: Value = serde_json::from_str(&std::fs::read_to_string(f).ok()?).ok()?;
        v["oauthAccount"]["emailAddress"].as_str().filter(|s| !s.is_empty()).map(String::from)
    })
}

/// `~/x` → the home's x.
pub fn expand(path: &str, home: &Path) -> PathBuf {
    match path.strip_prefix("~") {
        Some(rest) if rest.is_empty() || rest.starts_with('/') => home.join(rest.trim_start_matches('/')),
        _ => PathBuf::from(path),
    }
}

/// A path as a person reads it: the home as `~`.
pub fn tilde(path: &Path, home: &Path) -> String {
    match path.strip_prefix(home) {
        Ok(rest) if rest.as_os_str().is_empty() => "~".into(),
        Ok(rest) => format!("~/{}", rest.to_string_lossy()),
        Err(_) => path.to_string_lossy().into_owned(),
    }
}

/// The config folder Atlas's Claude sessions run as: the Account setting, else the vault's older
/// `[terminal] claude_account`, else `$CLAUDE_CONFIG_DIR`, else `~/.claude`.
pub fn in_use(setting: &str, vault_config: &str, config_dir: Option<&Path>, home: &Path) -> PathBuf {
    let older = toml::from_str::<toml::Table>(vault_config).ok().and_then(|t| t.get("terminal")?.get("claude_account")?.as_str().map(String::from));
    let chosen = Some(setting.trim().to_string()).filter(|s| !s.is_empty()).or(older.filter(|s| !s.trim().is_empty()));
    let folder = match (chosen, config_dir) {
        (Some(c), _) => expand(&c, home),
        (None, Some(d)) => d.to_path_buf(),
        (None, None) => home.join(".claude"),
    };
    real(&folder)
}

/// The limits as [{kind, label, percent, resets_at, weekly}], read from `limits[]` (any kind the API adds), else
/// from the older `five_hour` / `seven_day` blocks.
pub fn limits(data: &Value) -> Vec<Value> {
    let mut out: Vec<Value> = data["limits"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|l| {
            let percent = l["percent"].as_f64()?;
            let kind = l["kind"].as_str().or(l["group"].as_str()).unwrap_or("limit").to_string();
            let weekly = kind.to_lowercase().contains("week") || kind.contains("seven_day");
            let label = l["label"].as_str().or(l["title"].as_str()).map(String::from).unwrap_or_else(|| {
                if weekly { "week".into() } else if kind == "session" { "session (5 h)".into() } else { kind.replace('_', " ") }
            });
            Some(json!({ "kind": kind, "label": label, "percent": percent, "resets_at": l["resets_at"], "weekly": weekly }))
        })
        .collect();
    if out.is_empty() {
        for (key, label, weekly) in [("five_hour", "session (5 h)", false), ("seven_day", "week", true), ("seven_day_opus", "week, Opus", true)] {
            if let Some(p) = data[key]["utilization"].as_f64() {
                out.push(json!({ "kind": key, "label": label, "percent": p, "resets_at": data[key]["resets_at"], "weekly": weekly }));
            }
        }
    }
    out
}

/// One account's answer for the page.
pub fn shape(name: &str, folder: &str, data: &Value) -> Value {
    let extra = &data["extra_usage"];
    let credits = extra["is_enabled"].as_bool().unwrap_or(false) && !extra["spend_limit_reached"].as_bool().unwrap_or(false);
    json!({ "name": name, "folder": folder, "limits": limits(data), "credits": credits })
}

/// The session hooks' cache of an account's answer (they keep one per account in the temp folder): asking the
/// endpoint twice for the same numbers gets a 429.
pub fn hooks_cache(tmp: &Path, credentials: &Path) -> PathBuf {
    let flat: String = credentials.to_string_lossy().chars().map(|c| if c.is_alphanumeric() { c } else { '_' }).collect();
    let tail: String = flat.chars().rev().take(60).collect::<Vec<_>>().into_iter().rev().collect();
    tmp.join(format!("claude_usage_5h_{tail}.json"))
}

/// The access token of an account's credentials file.
pub fn token(credentials: &str) -> Option<String> {
    let v: Value = serde_json::from_str(credentials).ok()?;
    v["claudeAiOauth"]["accessToken"].as_str().filter(|s| !s.is_empty()).map(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accounts_by_their_shape_with_their_addresses_and_the_one_in_use() {
        let h = tempfile::tempdir().unwrap();
        let home = h.path();
        for d in [".claude", ".claude-switch/accounts/personal", ".claude-switch/accounts/work"] {
            std::fs::create_dir_all(home.join(d)).unwrap();
            std::fs::write(home.join(d).join(".credentials.json"), r#"{"claudeAiOauth":{"accessToken":"t"}}"#).unwrap();
        }
        std::fs::write(home.join(".claude.json"), r#"{"oauthAccount":{"emailAddress":"alice@example.org"}}"#).unwrap();
        std::fs::write(home.join(".claude-switch/accounts/work/.claude.json"), r#"{"oauthAccount":{"emailAddress":"bob@example.org"}}"#).unwrap();
        let names: Vec<_> = accounts(home, None).into_iter().map(|a| a.name).collect();
        assert_eq!(names, ["default", "personal", "work"]);
        let all = accounts(home, Some(&home.join(".claude-switch/accounts/work")));
        assert_eq!(all.len(), 3, "the config dir is not counted twice");
        assert_eq!(email_of(&home.join(".claude/.credentials.json")).as_deref(), Some("alice@example.org"));
        assert_eq!(email_of(&home.join(".claude-switch/accounts/work/.credentials.json")).as_deref(), Some("bob@example.org"));
        assert_eq!(email_of(&home.join(".claude-switch/accounts/personal/.credentials.json")), None);
        let personal = real(&home.join(".claude-switch/accounts/personal"));
        assert_eq!(in_use("~/.claude-switch/accounts/personal", "", None, home), personal);
        assert_eq!(in_use("", "[terminal]\nclaude_account = \"~/.claude-switch/accounts/personal\"\n", None, home), personal);
        assert_eq!(in_use("", "", None, home), real(&home.join(".claude")));
        assert_eq!(tilde(&home.join(".claude"), home), "~/.claude");
        assert_eq!(token(r#"{"claudeAiOauth":{"accessToken":"abc"}}"#).as_deref(), Some("abc"));
    }

    #[test]
    fn limits_from_the_list_or_the_older_blocks() {
        let new = json!({ "limits": [{ "kind": "session", "percent": 42.0, "resets_at": "x" }, { "kind": "weekly_all", "percent": 10 }], "extra_usage": { "is_enabled": true } });
        let s = shape("a", "f", &new);
        assert_eq!(s["limits"][0]["label"], "session (5 h)");
        assert_eq!(s["limits"][1]["weekly"], true);
        assert_eq!(s["credits"], true);
        let old = json!({ "five_hour": { "utilization": 12.5 }, "seven_day": { "utilization": 3 } });
        let l = limits(&old);
        assert_eq!((l[0]["label"].as_str(), l[0]["percent"].as_f64(), l[1]["weekly"].as_bool()), (Some("session (5 h)"), Some(12.5), Some(true)));
        assert!(hooks_cache(Path::new("/tmp"), Path::new("/home/u/.claude/.credentials.json")).to_string_lossy().starts_with("/tmp/claude_usage_5h_"));
    }
}
