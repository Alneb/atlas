//! A plugin's helper calling back into the core (docs/guides/PLUGIN-API.md, "Calling Atlas back"). The user: *"it would be
//! great to have a python library to have an api so the python sideload can talk to the rust backend, same for rust
//! compiled executables"* — and, asked how: over the helper's own pipe, not a web interface.
//!
//! The helper writes `{"call": n, "verb": "GET", "path": "/api/file?path=a.md", "body": …}` on its stdout; the core runs
//! it through the vault's own router **in-process** (no socket, no port, no key: the pipe is the identity) and writes
//! `{"reply": n, "status": 200, "body": …}` to the helper's stdin. So a helper reaches exactly the API the pages use —
//! one implementation of every file, note and search operation — on the machine running the server. The libraries:
//! `crates/atlas-core/sdk/python/atlas_plugin.py` (`import atlas_plugin`) and the `atlas-plugin` crate.
use std::path::{Path, PathBuf};

/// Marks a request as a plugin's helper's own (a request extension: a network request can never carry one). The
/// guards let it through as the vault's owner, within [`may`].
#[derive(Clone, Debug)]
pub struct Caller(pub String);

/// The Python library, written beside the vault's cache for `PYTHONPATH` (`import atlas_plugin`).
const PYTHON_SDK: &str = include_str!("../sdk/python/atlas_plugin.py");

/// What a plugin's helper may reach: everything a signed-in page may, except another plugin's secrets and the sign-ins.
pub fn may(id: &str, path: &str) -> bool {
    // the user's sign-ins (to services, OAuth returns) are the page's and the sign-in window's, never a helper's
    if path.starts_with("/api/signin") {
        return false;
    }
    match path.strip_prefix("/api/plugins/").and_then(|r| r.split_once('/')) {
        Some((other, rest)) if rest.starts_with("secrets") => other == id,
        _ => true,
    }
}

/// The environment a plugin's program starts with, beside `ATLAS_ROOT` / `ATLAS_PLUGIN_DIR` / `…_TARGET`:
/// `ATLAS_PLUGIN_ID`, and `PYTHONPATH` led by the library's folder.
pub fn env(root: &Path, id: &str) -> Vec<(&'static str, String)> {
    let mut out = vec![("ATLAS_PLUGIN_ID", id.to_string())];
    match python_dir(root) {
        Ok(dir) => {
            let rest = std::env::var("PYTHONPATH").unwrap_or_default();
            let dir = dir.to_string_lossy().into_owned();
            out.push(("PYTHONPATH", if rest.is_empty() { dir } else { format!("{dir}:{rest}") }));
        }
        Err(e) => eprintln!("atlas: the plugins' Python library could not be written: {e}"),
    }
    out
}

/// `.atlas/cache/sdk/python/` with the library as this build carries it (rewritten only when it differs).
fn python_dir(root: &Path) -> std::io::Result<PathBuf> {
    let dir = root.join(".atlas/cache/sdk/python");
    let file = dir.join("atlas_plugin.py");
    if std::fs::read_to_string(&file).ok().as_deref() != Some(PYTHON_SDK) {
        crate::vault_write::cache::write(&file, PYTHON_SDK.as_bytes()).map_err(std::io::Error::other)?;
    }
    Ok(dir)
}

/// A call line from a helper, parsed: the verb is checked here so the router only sees the four the API uses.
#[derive(Debug, PartialEq)]
pub struct Call {
    pub n: u64,
    pub verb: axum::http::Method,
    pub path: String,
    pub body: Option<serde_json::Value>,
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
        Some(Ok(Call { n, verb, path, body: msg.get("body").cloned().filter(|b| !b.is_null()) }))
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
        assert!(!may("demo-a", "/api/signin/door") && !may("demo-a", "/api/signin"), "a helper never plants or reads a sign-in");
    }

    #[test]
    fn a_call_line_is_read_or_refused_with_its_reason() {
        let m = |v: serde_json::Value| v.as_object().unwrap().clone();
        let ok = Call::parse(&m(json!({"call": 3, "verb": "PUT", "path": "/api/file", "body": {"path": "a.md", "text": "x"}}))).unwrap().unwrap();
        assert_eq!((ok.n, ok.verb, ok.path.as_str()), (3, axum::http::Method::PUT, "/api/file"));
        assert!(Call::parse(&m(json!({"id": 1, "result": 2}))).is_none(), "an answer is not a call");
        assert!(Call::parse(&m(json!({"call": 4, "path": "/login"}))).unwrap().is_err());
        assert!(Call::parse(&m(json!({"call": 5, "verb": "PATCH", "path": "/api/file"}))).unwrap().is_err());
    }

    #[test]
    fn the_environment_names_the_plugin_and_leads_with_the_library() {
        let root = tempfile::tempdir().unwrap();
        let env: std::collections::HashMap<_, _> = env(root.path(), "demo-c").into_iter().collect();
        assert_eq!(env["ATLAS_PLUGIN_ID"], "demo-c");
        assert!(env["PYTHONPATH"].starts_with(&root.path().join(".atlas/cache/sdk/python").to_string_lossy().into_owned()));
        assert!(root.path().join(".atlas/cache/sdk/python/atlas_plugin.py").is_file());
    }
}
