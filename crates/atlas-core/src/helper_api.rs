//! A plugin's helper calling back into the core (docs/guides/PLUGIN-API.md, "Calling Atlas back"). A helper in any
//! language (a compiled program, a script) can ask the core for things, over the helper's own pipe rather than
//! a web interface.
//!
//! The helper writes `{"call": n, "verb": "GET", "path": "/api/file?path=a.md", "body": …}` on its stdout (a file's bytes
//! as `"bytes": "<base64>"` in place of `body`, for `PUT /api/raw`: a PDF, an attachment); the core runs
//! it through the vault's own router **in-process** (no socket, no port, no key: the pipe is the identity) and writes
//! `{"reply": n, "status": 200, "body": …}` to the helper's stdin. So a helper reaches exactly the API the pages use —
//! one implementation of every file, note and search operation — on the machine running the server. The library: the
//! `atlas-plugin` crate; a helper run in the core (js_helper.rs) has the same calls as `atlas.*`.
use std::path::Path;

/// Marks a request as a plugin's helper's own (a request extension: a network request can never carry one). The
/// guards let it through as the vault's owner, within [`may`].
#[derive(Clone, Debug)]
pub struct Caller(pub String);

/// What a plugin's helper may reach: everything a signed-in page may, except the sign-ins and what acts as another
/// plugin: its secrets, its sign-ins, its fetch (which fills in its secrets), its settings, its update and removal.
/// Another plugin's data, contributions, helper and tools stay open: those run that plugin's own code.
pub fn may(id: &str, path: &str) -> bool {
    // the user's sign-ins (to services, OAuth returns) are the page's and the sign-in window's, never a helper's
    if path.starts_with("/api/signin") {
        return false;
    }
    const OWN: [&str; 6] = ["secrets", "oauth", "fetch", "settings", "update", "remove"];
    match path.strip_prefix("/api/plugins/").and_then(|r| r.split_once('/')) {
        Some((other, rest)) if OWN.iter().any(|o| rest.split('/').next() == Some(*o)) => other == id,
        _ => true,
    }
}

/// Whether a helper's write (any verb but GET) leaves other plugins' files alone: no target — a query parameter, or a
/// string in the JSON body under a key that names a file (`path`, `from`, `to`, `dest`, `paths`…, found by shape, not
/// by route) — lies in another plugin's folder or settings file, or is a folder holding them (`.atlas`, `.atlas/plugins`).
/// [`may`] sees only the URL; a file route carries its file in the body. `Err` says which target and why.
pub fn may_write(id: &str, uri: &str, body: Option<&serde_json::Value>) -> Result<(), String> {
    let mut targets = Vec::new();
    if let Ok(uri) = uri.parse::<axum::http::Uri>() {
        if let Ok(q) = axum::extract::Query::<Vec<(String, String)>>::try_from_uri(&uri) {
            targets.extend(q.0.into_iter().filter(|(k, _)| names_a_file(k)).map(|(_, v)| v));
        }
    }
    if let Some(b) = body {
        collect_targets(b, false, &mut targets);
    }
    match targets.iter().find(|t| !own_or_free(id, t)) {
        Some(t) => Err(format!("plugin {id} may not write {t:?}: another plugin's files (its code, manifest, settings) are its own")),
        None => Ok(()),
    }
}

/// A key that holds a vault path, by its name: `path`, `from`, `to`, `dest`, `src`, `target`, `dir`, `folder`, `file`
/// and their plurals or prefixed forms (`new_path`, `paths`).
fn names_a_file(key: &str) -> bool {
    let k = key.to_ascii_lowercase();
    let k = k.trim_end_matches('s');
    ["path", "from", "to", "dest", "src", "source", "target", "dir", "folder", "file", "pdf", "note"].iter().any(|n| k == *n || k.ends_with(&format!("_{n}")))
}

fn collect_targets(v: &serde_json::Value, keyed: bool, out: &mut Vec<String>) {
    match v {
        serde_json::Value::String(s) if keyed => out.push(s.clone()),
        serde_json::Value::Array(a) => a.iter().for_each(|x| collect_targets(x, keyed, out)),
        serde_json::Value::Object(m) => m.iter().for_each(|(k, x)| collect_targets(x, names_a_file(k), out)),
        _ => {}
    }
}

/// A vault path a helper `id` may write: anything but another plugin's folder or settings file, and the folders that
/// hold every plugin. Compared without case (a case-insensitive disk would take `.Atlas/Plugins/x` for the same).
fn own_or_free(id: &str, target: &str) -> bool {
    let t = target.replace('\\', "/").to_lowercase();
    let parts: Vec<&str> = t.split('/').filter(|p| !p.is_empty() && *p != ".").collect();
    let id = id.to_lowercase();
    match parts.as_slice() {
        [] => true, // the vault's top: a folder to write into (`dir: ""`), never one the core trashes or moves
        [".atlas"] | [".atlas", "plugins"] | [".atlas", "plugin-settings"] => false,
        [".atlas", "plugins", other, ..] => *other == id,
        [".atlas", "plugin-settings", file, ..] => file.strip_suffix(".toml").unwrap_or(file) == id,
        _ => true,
    }
}

/// The environment a plugin's program starts with, beside `ATLAS_ROOT` / `ATLAS_PLUGIN_DIR` / `…_TARGET`:
/// `ATLAS_PLUGIN_ID`. (`root` stays for what a later variable may need of the vault.)
pub fn env(_root: &Path, id: &str) -> Vec<(&'static str, String)> {
    vec![("ATLAS_PLUGIN_ID", id.to_string())]
}

/// A call line from a helper, parsed: the verb is checked here so the router only sees the four the API uses.
#[derive(Debug, PartialEq)]
pub struct Call {
    pub n: u64,
    pub verb: axum::http::Method,
    pub path: String,
    pub body: CallBody,
}

/// What a call sends: JSON for the API's own routes, a file's bytes for `/api/raw` — one or the other.
#[derive(Debug, PartialEq)]
pub enum CallBody {
    Empty,
    Json(serde_json::Value),
    Bytes(Vec<u8>),
}

impl Call {
    /// `{"call": n, "verb", "path", "body"?}` → a call, or why not (answered to the helper as a 400).
    pub fn parse(msg: &serde_json::Map<String, serde_json::Value>) -> Option<Result<Call, (u64, String)>> {
        let n = msg.get("call")?.as_u64()?;
        let verb = match msg.get("verb").and_then(|v| v.as_str()).unwrap_or("GET") {
            "GET" => axum::http::Method::GET,
            "POST" => axum::http::Method::POST,
            "PUT" => axum::http::Method::PUT,
            "DELETE" => axum::http::Method::DELETE,
            other => return Some(Err((n, format!("verb {other:?}: GET, POST, PUT or DELETE")))),
        };
        let path = msg.get("path").and_then(|p| p.as_str()).unwrap_or_default().to_string();
        if !path.starts_with("/api/") {
            return Some(Err((n, format!("path {path:?}: a call reaches the API only (/api/…)"))));
        }
        let body = match (msg.get("bytes").and_then(|b| b.as_str()), msg.get("body").filter(|b| !b.is_null())) {
            (Some(_), Some(_)) => return Some(Err((n, "a call sends `body` or `bytes`, not both".into()))),
            (Some(b64), None) => {
                use base64::Engine;
                match base64::engine::general_purpose::STANDARD.decode(b64) {
                    Ok(b) => CallBody::Bytes(b),
                    Err(e) => return Some(Err((n, format!("bytes: not base64 ({e})")))),
                }
            }
            (None, Some(j)) => CallBody::Json(j.clone()),
            (None, None) => CallBody::Empty,
        };
        Some(Ok(Call { n, verb, path, body }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_helper_reaches_only_its_own_plugins_secrets() {
        assert!(may("demo-a", "/api/plugins/demo-a/secrets/token"));
        assert!(!may("demo-a", "/api/plugins/demo-b/secrets/token"));
        assert!(!may("demo-a", "/api/plugins/demo-b/secrets"));
        assert!(may("demo-a", "/api/file"));
        assert!(!may("demo-a", "/api/plugins/demo-b/fetch") && !may("demo-a", "/api/plugins/demo-b/settings"), "never as another plugin");
        assert!(!may("demo-a", "/api/plugins/demo-b/oauth/start") && may("demo-a", "/api/plugins/demo-a/fetch"));
        assert!(may("demo-a", "/api/plugins/demo-b/tools/find") && may("demo-a", "/api/plugins/demo-b/helper"), "its code, its rules");
        assert!(!may("demo-a", "/api/signin/door") && !may("demo-a", "/api/signin"), "a helper never plants or reads a sign-in");
    }

    #[test]
    fn a_helper_writes_its_own_plugin_files_and_never_anothers() {
        use serde_json::json;
        let w = |uri: &str, body: serde_json::Value| may_write("demo-a", uri, Some(&body)).is_ok();
        assert!(w("/api/file", json!({ "path": "notes/x.md", "text": ".atlas/plugins/demo-b/view.js" })), "a text is not a target");
        assert!(w("/api/file", json!({ "path": ".atlas/plugins/demo-a/cache.json" })), "its own folder");
        assert!(!w("/api/file", json!({ "path": ".atlas/plugins/demo-b/view.js" })), "another's code");
        assert!(!w("/api/file", json!({ "path": "./.Atlas//Plugins/Demo-B/plugin.toml" })), "however spelled");
        assert!(!w("/api/file", json!({ "path": ".atlas\\plugins\\demo-b\\plugin.toml" })), "Windows separators");
        assert!(!w("/api/fs/move", json!({ "from": "notes/a.md", "to": ".atlas/plugins/demo-b/view.js" })), "moved over it");
        assert!(!w("/api/fs/trash", json!({ "paths": ["notes/a.md", ".atlas/plugins"] })), "every plugin at once");
        assert!(!w("/api/fs/trash", json!({ "path": ".atlas" })));
        assert!(!w("/api/file", json!({ "path": ".atlas/plugin-settings/demo-b.toml" })), "another's settings");
        assert!(w("/api/file", json!({ "path": ".atlas/plugin-settings/demo-a.toml" })));
        assert!(!w("/api/raw?path=.atlas%2Fplugins%2Fdemo-b%2Fbin%2Fx", json!(null)), "a query's path, decoded");
        assert!(w("/api/raw?path=refs%2Fa.pdf", json!(null)));
        assert!(!w("/api/fs/move", json!({ "items": [{ "new_path": ".atlas/plugins/demo-b/x" }] })), "nested, prefixed keys");
    }

    #[test]
    fn a_call_line_is_read_or_refused_with_its_reason() {
        let m = |v: serde_json::Value| v.as_object().unwrap().clone();
        let ok = Call::parse(&m(json!({"call": 3, "verb": "PUT", "path": "/api/file", "body": {"path": "a.md", "text": "x"}}))).unwrap().unwrap();
        assert_eq!((ok.n, ok.verb, ok.path.as_str()), (3, axum::http::Method::PUT, "/api/file"));
        assert!(Call::parse(&m(json!({"id": 1, "result": 2}))).is_none(), "an answer is not a call");
        assert!(Call::parse(&m(json!({"call": 4, "path": "/login"}))).unwrap().is_err());
        assert!(Call::parse(&m(json!({"call": 5, "verb": "PATCH", "path": "/api/file"}))).unwrap().is_err());
        let raw = Call::parse(&m(json!({"call": 6, "verb": "PUT", "path": "/api/raw?path=a.pdf", "bytes": "JVBERg=="}))).unwrap().unwrap();
        assert_eq!(raw.body, CallBody::Bytes(b"%PDF".to_vec()), "a file's bytes, base64 on the pipe");
        assert!(Call::parse(&m(json!({"call": 7, "path": "/api/raw", "bytes": "x", "body": {}}))).unwrap().is_err(), "not both");
        assert!(Call::parse(&m(json!({"call": 8, "path": "/api/raw", "bytes": "!!"}))).unwrap().is_err());
    }

    #[test]
    fn the_environment_names_the_plugin() {
        let root = tempfile::tempdir().unwrap();
        let env: std::collections::HashMap<_, _> = env(root.path(), "demo-c").into_iter().collect();
        assert_eq!(env["ATLAS_PLUGIN_ID"], "demo-c");
        assert!(!env.contains_key("PYTHONPATH") && !root.path().join(".atlas/cache/sdk").exists(), "no library written into the vault");
    }
}
