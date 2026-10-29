//! Syncthing, scan now: the vault's changed paths → `POST /rest/db/scan?folder=<id>&sub=<path>` on this computer's
//! Syncthing. The folder holding the vault is found by its path, the API key read from Syncthing's own config when none
//! is set. The logic takes its transport and file reader, so the tests run offline.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// Where Syncthing keeps its config: 2.x in ~/.local/state, 1.x in ~/.config.
pub const CONFIGS: [&str; 2] = [".local/state/syncthing/config.xml", ".config/syncthing/config.xml"];
pub const DEFAULT_URL: &str = "http://127.0.0.1:8384";

/// Why a request to Syncthing gave no answer.
#[derive(Debug, Clone, PartialEq)]
pub enum Fail {
    /// Nothing answered at the address (not running): skipped quietly.
    Unreachable(String),
    /// Syncthing answered with an error (a wrong key): a real failure.
    Refused(String),
}

/// One request to Syncthing's REST API with its key: the JSON answer (null for an empty body).
pub type Request<'a> = &'a dyn Fn(&str, &str, &str) -> Result<Value, Fail>;

/// The GUI's API key in Syncthing's config.xml, read by `read` (a path under `home` → its text).
pub fn key_from_config(home: &Path, read: &dyn Fn(&Path) -> Option<String>) -> Option<String> {
    CONFIGS.iter().find_map(|c| {
        let text = read(&home.join(c))?;
        let start = text.find("<apikey>")? + "<apikey>".len();
        let end = text[start..].find("</apikey>")? + start;
        Some(text[start..end].trim().to_string()).filter(|k| !k.is_empty())
    })
}

/// `~/x` against `home`; anything else as it is.
fn expand(path: &str, home: &Path) -> PathBuf {
    match path.strip_prefix("~/") {
        Some(rest) => home.join(rest),
        None if path == "~" => home.to_path_buf(),
        None => PathBuf::from(path),
    }
}

/// The deepest Syncthing folder holding `root`: its id and the vault's path inside it ("" at its top). `real` resolves
/// links (the vault may be reached through one).
pub fn folder_of(folders: &[Value], root: &Path, home: &Path, real: &dyn Fn(&Path) -> PathBuf) -> Option<(String, String)> {
    let root = real(root);
    folders
        .iter()
        .filter_map(|f| {
            let path = f["path"].as_str().filter(|p| !p.is_empty())?;
            let path = real(&expand(path.trim_end_matches('/'), home));
            let inside = root.strip_prefix(&path).ok()?;
            Some((f["id"].as_str()?.to_string(), inside.to_string_lossy().into_owned(), path.components().count()))
        })
        .max_by_key(|(_, _, depth)| *depth)
        .map(|(id, inside, _)| (id, inside))
}

/// `application/x-www-form-urlencoded` for a query value (space as `+`).
fn form(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            b' ' => "+".into(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// What the machine offers the scan: its home folder, a file reader and the path resolver.
pub struct Machine<'a> {
    pub home: PathBuf,
    pub read: &'a dyn Fn(&Path) -> Option<String>,
    pub real: &'a dyn Fn(&Path) -> PathBuf,
}

/// The `scan` tool: each changed path (the cache never) scanned in the vault's Syncthing folder. A machine with no
/// Syncthing (the server, a phone the vault also syncs to) is skipped quietly rather than failing every batch; a key
/// that is set but wrong still fails.
pub fn scan(request: Request, m: &Machine, root: &Path, params: &Value) -> Result<Value, String> {
    let (settings, secrets) = (&params["settings"], &params["secrets"]);
    let url = settings["url"].as_str().filter(|u| !u.trim().is_empty()).unwrap_or(DEFAULT_URL).trim().trim_end_matches('/').to_string();
    let Some(key) = secrets["api_key"].as_str().filter(|k| !k.is_empty()).map(str::to_string).or_else(|| key_from_config(&m.home, m.read)) else {
        return Ok(json!({ "skipped": "no Syncthing on this machine (no API key set, none in its config)" }));
    };
    let (folder, inside) = match settings["folder"].as_str().map(str::trim).filter(|f| !f.is_empty()) {
        Some(f) => (f.to_string(), String::new()),
        None => {
            let folders = match request("GET", &format!("{url}/rest/config/folders"), &key) {
                Ok(v) => v,
                Err(Fail::Unreachable(why)) => return Ok(json!({ "skipped": format!("Syncthing is not running at {url} ({why})") })),
                Err(Fail::Refused(why)) => return Err(why),
            };
            match folder_of(folders.as_array().map(Vec::as_slice).unwrap_or_default(), root, &m.home, m.real) {
                Some(found) => found,
                None => return Ok(json!({ "skipped": "no Syncthing folder holds this vault" })),
            }
        }
    };
    let paths: Vec<&str> = params["paths"].as_array().into_iter().flatten().filter_map(Value::as_str).filter(|p| !p.is_empty() && !p.starts_with(".atlas/cache/")).collect();
    for p in &paths {
        let sub = if inside.is_empty() { p.to_string() } else { format!("{inside}/{p}") };
        request("POST", &format!("{url}/rest/db/scan?folder={}&sub={}", form(&folder), form(&sub)), &key).map_err(|f| match f {
            Fail::Unreachable(why) | Fail::Refused(why) => why,
        })?;
    }
    Ok(json!({ "folder": folder, "scanned": paths.len() }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn machine<'a>(read: &'a dyn Fn(&Path) -> Option<String>) -> Machine<'a> {
        Machine { home: PathBuf::from("/home/u"), read, real: &|p: &Path| p.to_path_buf() }
    }
    const NONE: &dyn Fn(&Path) -> Option<String> = &|_: &Path| None;

    #[test]
    fn the_deepest_folder_holding_the_vault() {
        let folders = [json!({"id": "home", "path": "~"}), json!({"id": "work", "path": "/home/u/Work/"}), json!({"id": "other", "path": "/home/u/Workx"})];
        let (home, real) = (Path::new("/home/u"), &|p: &Path| p.to_path_buf());
        assert_eq!(folder_of(&folders, Path::new("/home/u/Work"), home, real), Some(("work".into(), "".into())));
        assert_eq!(folder_of(&folders, Path::new("/home/u/Work/sub"), home, real), Some(("work".into(), "sub".into())));
        assert_eq!(folder_of(&folders, Path::new("/home/u/Workx2"), home, real), Some(("home".into(), "Workx2".into())), "a name's prefix is not a folder");
        assert_eq!(folder_of(&folders, Path::new("/srv/elsewhere"), home, real), None);
    }

    #[test]
    fn the_key_from_syncthings_config() {
        let read = |p: &Path| (p == Path::new("/home/u/.local/state/syncthing/config.xml")).then(|| "<gui><apikey> abc123 </apikey></gui>".to_string());
        assert_eq!(key_from_config(Path::new("/home/u"), &read), Some("abc123".into()));
        assert_eq!(key_from_config(Path::new("/home/u"), NONE), None);
    }

    #[test]
    fn each_changed_path_scanned_in_the_vaults_folder_and_the_cache_never() {
        let asked = RefCell::new(vec![]);
        let request = |method: &str, url: &str, key: &str| {
            asked.borrow_mut().push((method.to_string(), url.to_string(), key.to_string()));
            Ok(if url.ends_with("/rest/config/folders") { json!([{"id": "work", "path": "/home/u/Work"}]) } else { Value::Null })
        };
        let params = json!({"paths": ["notes/a b.md", ".atlas/cache/x"], "secrets": {"api_key": "k"}, "settings": {}});
        assert_eq!(scan(&request, &machine(NONE), Path::new("/home/u/Work"), &params), Ok(json!({"folder": "work", "scanned": 1})));
        assert_eq!(asked.borrow().last().unwrap(), &("POST".into(), "http://127.0.0.1:8384/rest/db/scan?folder=work&sub=notes%2Fa+b.md".into(), "k".into()));
    }

    #[test]
    fn no_folder_no_key_or_no_syncthing_running_is_skipped_quietly() {
        let empty = |_: &str, _: &str, _: &str| Ok(json!([]));
        let with_key = json!({"paths": ["a.md"], "secrets": {"api_key": "k"}});
        assert!(scan(&empty, &machine(NONE), Path::new("/v"), &with_key).unwrap()["skipped"].is_string());
        assert!(scan(&empty, &machine(NONE), Path::new("/v"), &json!({"paths": ["a.md"]})).unwrap()["skipped"].is_string());
        let down = |_: &str, _: &str, _: &str| Err(Fail::Unreachable("connection refused".into()));
        assert!(scan(&down, &machine(NONE), Path::new("/v"), &with_key).unwrap()["skipped"].as_str().unwrap().contains("not running"));
        let wrong = |_: &str, _: &str, _: &str| Err(Fail::Refused("Syncthing answered 403".into()));
        assert_eq!(scan(&wrong, &machine(NONE), Path::new("/v"), &with_key), Err("Syncthing answered 403".into()), "a wrong key is a failure");
    }
}
