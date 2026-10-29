//! The Syncthing plugin's helper (plugin.toml `[helper]`): serves `scan` over the helper pipe. Syncthing's REST API is
//! asked through the core's fetch (`[permissions] net`: 127.0.0.1, localhost).
use atlas_plugin::{error, Atlas, Methods};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use syncthing::{scan, Fail, Machine};

/// One request to Syncthing through the core: its JSON answer, `Unreachable` when nothing answered at the address.
fn request(atlas: &Atlas, method: &str, url: &str, key: &str) -> Result<Value, Fail> {
    let ask = json!({ "url": url, "method": method, "headers": { "X-API-Key": key }, "timeout_secs": 10 });
    let r = atlas.post("/api/plugins/syncthing/fetch", &ask).map_err(|e| Fail::Unreachable(e.why))?;
    if r["ok"] != true {
        return Err(Fail::Refused(format!("Syncthing answered {} at {url}", r["status"])));
    }
    let text = r["text"].as_str().unwrap_or_default();
    Ok(if text.trim().is_empty() { Value::Null } else { serde_json::from_str(text).unwrap_or(Value::Null) })
}

fn main() {
    let atlas = Atlas::new();
    let root = PathBuf::from(std::env::var_os("ATLAS_ROOT").unwrap_or_else(|| ".".into()));
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from).unwrap_or_default();
    let read = |p: &Path| std::fs::read_to_string(p).ok();
    let real = |p: &Path| std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    let mut methods = Methods::new();
    methods.add("scan", move |params| {
        let m = Machine { home: home.clone(), read: &read, real: &real };
        scan(&|method: &str, url: &str, key: &str| request(&atlas, method, url, key), &m, &root, &params).map_err(error)
    });
    atlas_plugin::serve(methods);
}
