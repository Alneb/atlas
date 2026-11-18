//! The phone's way past a gate in front of its servers, from the core's one store (service_signin.rs): the device's
//! sign-ins (`device.json` in the secrets folder), the same the in-app core sends for plugins and the mirror. The
//! native screens (Server.java for a server vault, Web.java for Suwayomi/Audiobookshelf) ask here for what to send to
//! an address, and a header typed for a server ("A token or a header…") is kept here as a bypass rule for its host —
//! one mechanism instead of a per-server preference. Plain functions over JSON strings; `glue` hands them to Java.
use atlas_core::secrets::Store;
use atlas_core::service_signin::{self, Bypass};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

/// The secrets folder the in-app core uses (serve.rs sets HOME to the app's folder when Android gives none): asked
/// before any core runs, so it is worked out the same way here.
fn secrets_dir(home: &Path) -> PathBuf {
    if let Some(d) = std::env::var_os("ATLAS_SECRETS_DIR") {
        return PathBuf::from(d);
    }
    let home_set = std::env::var_os("HOME").is_some_and(|h| !h.is_empty() && h != "/");
    if home_set {
        atlas_core::vaults::list_file().parent().map(Path::to_path_buf).unwrap_or_default().join("secrets")
    } else {
        home.join(".config/atlas/secrets")
    }
}

/// The device's sign-ins, for the app whose folder is `home`.
pub fn device_store(home: &Path) -> Store {
    Store::device_in(&secrets_dir(home))
}

/// What to send to `url` past its gate: `{headers: {name: value}, secret}` (`secret`: a key that must not follow a
/// redirect off the host), or `{error}`.
pub fn site_headers(home: &Path, url: &str) -> Value {
    site_headers_in(&device_store(home), url)
}

fn site_headers_in(store: &Store, url: &str) -> Value {
    let Ok(u) = reqwest::Url::parse(url) else { return json!({ "error": format!("not an address: {url}") }) };
    match service_signin::site_headers(store, &u) {
        Ok(h) => {
            let headers: serde_json::Map<String, Value> = h.headers.into_iter().map(|(k, v)| (k, Value::String(v))).collect();
            json!({ "headers": headers, "secret": h.secret })
        }
        Err(e) => json!({ "error": e.to_string() }),
    }
}

/// `Name: value` typed for the server at `url` kept as a bypass rule for its host (an empty value keeps the key kept
/// for that header): `{ok, host, header}` or `{error}` saying why (the core's checks: header name, host).
pub fn keep_header(home: &Path, url: &str, line: &str) -> Value {
    keep_header_in(&device_store(home), url, line)
}

fn keep_header_in(store: &Store, url: &str, line: &str) -> Value {
    let Some(host) = reqwest::Url::parse(url).ok().and_then(|u| u.host_str().map(str::to_string)) else { return json!({ "error": format!("not an address: {url}") }) };
    let Some((name, value)) = line.split_once(':') else { return json!({ "error": "a header is typed as Name: value (X-Api-Key: …)" }) };
    let rule = Bypass { hosts: vec![host.clone()], header: name.trim().to_string() };
    match service_signin::bypass_set(store, &rule, value.trim()) {
        Ok(()) => json!({ "ok": true, "host": host, "header": rule.header }),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

/// A device token from the Atlas server at `url` with the gate's key this device keeps for its host — the sign-in
/// without any page (service_signin::atlas_token_by_gate_key): `{token}`, or `{error, status}` (`status` 0: no key kept
/// or no answer). `app`: `atlas`, `boox` or `capture`.
pub fn token_by_key(home: &Path, url: &str, app: &str, name: &str) -> Value {
    let store = device_store(home);
    let Ok(rt) = tokio::runtime::Builder::new_current_thread().enable_all().build() else { return json!({ "error": "no runtime", "status": 0 }) };
    match rt.block_on(service_signin::atlas_token_by_gate_key(&store, url, app, name)) {
        Ok(token) => json!({ "token": token }),
        Err(service_signin::NoToken::NoKey) => json!({ "error": "no key kept for this server", "status": 0 }),
        Err(service_signin::NoToken::Refused(status, why)) => json!({ "error": why, "status": status }),
        Err(service_signin::NoToken::Unreachable(why)) => json!({ "error": why, "status": 0 }),
    }
}

/// The header name of the key kept for `url`'s host, `{header}` (null: none) — the form says it is there, never its value.
pub fn kept_header(home: &Path, url: &str) -> Value {
    kept_header_in(&device_store(home), url)
}

fn kept_header_in(store: &Store, url: &str) -> Value {
    let header = reqwest::Url::parse(url).ok().and_then(|u| service_signin::bypass_header(store, &u).ok().flatten()).map(|(name, _)| name);
    json!({ "header": header })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_header_typed_for_a_server_is_a_bypass_of_its_host_sent_over_https_only() {
        // stores named directly: another test sets ATLAS_SECRETS_DIR for the process (serve.rs)
        let dir = tempfile::tempdir().unwrap();
        let store = Store::device_in(dir.path());
        assert!(keep_header_in(&store, "https://atlas.example.org/v/notes/", "no colon")["error"].is_string());
        assert!(keep_header_in(&store, "https://atlas.example.org/v/notes/", "Cookie: x")["error"].is_string(), "the sign-ins' own header");
        assert_eq!(keep_header_in(&store, "https://atlas.example.org/v/notes/", " X-Api-Key : k1 ")["ok"], true);
        let sent = site_headers_in(&store, "https://atlas.example.org/v/notes/api/file");
        assert_eq!(sent["headers"]["X-Api-Key"], "k1", "{sent}");
        assert_eq!(sent["secret"], true);
        assert!(site_headers_in(&store, "http://atlas.example.org/")["headers"].as_object().unwrap().is_empty(), "never over plain http");
        assert!(site_headers_in(&store, "https://other.example.org/")["headers"].as_object().unwrap().is_empty(), "only its host");
        assert_eq!(kept_header_in(&store, "https://atlas.example.org/")["header"], "X-Api-Key");
        // an empty value keeps the key; a vault's own core (its store in the same folder) sends the same device key
        assert_eq!(keep_header_in(&store, "https://atlas.example.org/", "X-Api-Key:")["ok"], true);
        let vault = tempfile::tempdir().unwrap();
        let from_vault = service_signin::bypass_header(&Store::in_dir(dir.path(), vault.path()), &"https://atlas.example.org/".parse().unwrap()).unwrap();
        assert_eq!(from_vault, Some(("X-Api-Key".into(), "k1".into())));
    }

    #[test]
    fn the_secrets_folder_is_the_in_app_cores() {
        assert!(secrets_dir(Path::new("/data/app")).ends_with("secrets"));
    }
}
