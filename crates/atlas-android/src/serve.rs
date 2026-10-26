//! The full app's core (docs/guides/ANDROID.md, "The full app"): Atlas's own server, run inside the app on 127.0.0.1 for the vault
//! in use, with the web UI it carries (rust-embed of ui/dist). The app's WebView shows that UI — the editor, LaTeX, Bases,
//! PDFs, plugin blocks — exactly as the desktop window shows its own; one implementation of each, not a second for the phone.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

fn runtime() -> &'static tokio::runtime::Runtime {
    static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RT.get_or_init(|| tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().thread_name("atlas-core").build().expect("a runtime"))
}

/// The servers running, by vault: started once, kept for the app's life (the watcher and the index stay warm).
fn running() -> &'static Mutex<HashMap<PathBuf, (u16, atlas_core::server::ServerHandle)>> {
    static R: OnceLock<Mutex<HashMap<PathBuf, (u16, atlas_core::server::ServerHandle)>>> = OnceLock::new();
    R.get_or_init(Default::default)
}

/// `{port, open}` of the vault's server (started now if it is not running), or `{error}`. The server is locked to this
/// app (local_lock.rs: every app on a phone reaches 127.0.0.1); `open` is a fresh one-time address that gives the
/// app's WebView the key's cookie. `home`: the app's own folder, Atlas's
/// home there (its settings, the list of vaults, caches) — a phone has no `$HOME` an app may write. `env`: what the
/// plugin helpers the core starts need (PATH with `python3` and the helpers, PYTHONHOME; the app's Helpers.java).
pub fn serve(vault: &Path, home: &Path, env: &Value) -> Value {
    // one start at a time: two calls for one vault would both start a server (one leaked)
    static STARTING: Mutex<()> = Mutex::new(());
    let _one = STARTING.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((port, h)) = running().lock().unwrap().get(vault) {
        return json!({ "port": port, "open": h.open_url() });
    }
    // the environment once, before the first server's threads exist (set_var with threads running is undefined
    // behaviour); every later call passes the same app folder and helpers
    static ENV: std::sync::Once = std::sync::Once::new();
    ENV.call_once(|| {
        if std::env::var_os("HOME").is_none_or(|h| h.is_empty() || h == "/") {
            for (k, sub) in [("HOME", ""), ("XDG_CONFIG_HOME", ".config"), ("XDG_DATA_HOME", ".local/share"), ("XDG_CACHE_HOME", ".cache"), ("XDG_STATE_HOME", ".local/state")] {
                unsafe { std::env::set_var(k, home.join(sub)) };
            }
        }
        for (k, v) in env.as_object().into_iter().flatten() {
            if let Some(v) = v.as_str() {
                unsafe { std::env::set_var(k, v) };
            }
        }
    });
    let locked = atlas_core::server::Listen::Local(0, atlas_core::local_lock::Lock::Locked { fixed: None });
    match runtime().block_on(atlas_core::server::serve_on(vault.to_path_buf(), locked)) {
        Ok(h) => {
            let (port, open) = (h.port(), h.open_url());
            running().lock().unwrap().insert(vault.to_path_buf(), (port, h));
            json!({ "port": port, "open": open })
        }
        Err(e) => json!({ "error": format!("{e:#}") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_vault_is_served_with_its_interface() {
        let d = std::env::temp_dir().join(format!("atlas-phone-serve-{}", std::process::id()));
        std::fs::create_dir_all(d.join(".atlas")).unwrap();
        std::fs::write(d.join("note.md"), "# Hi\n").unwrap();
        let a = serve(&d, &d.join("home"), &json!({}));
        let port = a["port"].as_u64().unwrap_or_else(|| panic!("{a}"));
        assert_eq!(serve(&d, &d.join("home"), &json!({}))["port"].as_u64(), Some(port), "started once");
        let get = |path: &str, extra: &str| {
            use std::io::{Read, Write};
            let mut s = std::net::TcpStream::connect(("127.0.0.1", port as u16)).unwrap();
            write!(s, "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nx-atlas: 1\r\n{extra}connection: close\r\n\r\n").unwrap();
            let mut out = String::new();
            s.read_to_string(&mut out).unwrap();
            out
        };
        assert!(get("/api/file?path=note.md", "").starts_with("HTTP/1.1 401"), "another app on the phone is refused");
        let open = a["open"].as_str().unwrap().to_string();
        let swap = get(open.trim_start_matches(&format!("http://127.0.0.1:{port}")), "");
        let cookie = swap.lines().find_map(|l| l.strip_prefix("set-cookie: ")).unwrap_or_else(|| panic!("{swap}"));
        let jar = format!("cookie: {}\r\n", cookie.split(';').next().unwrap());
        assert!(get("/api/file?path=note.md", &jar).contains("# Hi"), "the API, with the app's cookie");
        assert!(get("/", &jar).contains("<html"), "the interface");
        // the capture box writes through the running core, which must take the key it left (the Boox's "Not saved")
        let saved = crate::phone::save(&d, "a thought");
        assert!(saved.get("error").is_none(), "a capture with the core running: {saved}");
        std::fs::remove_dir_all(&d).ok();
    }
}

/// A folder vault's mirror on the phone (docs/design/DESIGN-mirror-v2.md): the in-app core is told the server vault holding the folder's copy — on its vault list,
/// as the desktop's — and given this app's sign-in for that server (`a=b; c=d`, the gate's session: Authelia's, for the
/// whole domain), so its writes take the server's leases and its live rooms are the server's, as the desktop's. After `serve`
/// (its environment says where the list and the sign-ins live). `mirror` empty: unlinked.
pub fn mirror(vault: &Path, mirror: &str, cookies: &str) -> Value {
    let run = || -> anyhow::Result<()> {
        let list = atlas_core::vaults::list_file();
        atlas_core::vaults::remember(&list, vault, chrono::Utc::now().timestamp_millis())?;
        let path = vault.canonicalize()?.to_string_lossy().into_owned();
        atlas_core::vaults::set_mirror(&list, &path, Some(mirror).filter(|m| !m.trim().is_empty()))?;
        keep_cookies(vault, mirror, cookies)?;
        // the running core's writes ask the server for leases from now on (DESIGN-mirror-v2.md §2, step 6): serve ran
        // before the list had the mirror
        atlas_core::mirror_guard::install_for_mirror(&atlas_core::Workspace::open(vault)?);
        Ok(())
    };
    match run() {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "error": format!("{e:#}") }),
    }
}

/// This app's cookies for `url` (`a=b; c=d`, as the WebView keeps them after a sign-in) kept as the in-app core's
/// sign-in to that host — the store the desktop's sign-in window fills — so plugins on the phone pass the same gate.
fn keep_cookies(vault: &Path, url: &str, cookies: &str) -> anyhow::Result<()> {
    let Some(host) = reqwest::Url::parse(url).ok().and_then(|u| u.host_str().map(str::to_string)) else { return Ok(()) };
    let domain = gate_domain(&host);
    let jar: Vec<atlas_core::service_signin::Cookie> = cookies
        .split(';')
        .filter_map(|kv| kv.split_once('='))
        .map(|(k, v)| atlas_core::service_signin::Cookie { name: k.trim().into(), value: v.trim().into(), domain: domain.clone(), host_only: false, path: "/".into(), secure: true, expires: None })
        .filter(|c| !c.name.is_empty())
        .collect();
    if !jar.is_empty() {
        atlas_core::service_signin::keep(&atlas_core::secrets::Store::for_vault(vault), &host, jar)?;
    }
    Ok(())
}

/// A door sign-in made in the app's own window (a plugin met a gate, SignInWebActivity): kept for the in-app core.
pub fn keep_signin(vault: &Path, url: &str, cookies: &str) -> Value {
    match keep_cookies(vault, url, cookies) {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "error": format!("{e:#}") }),
    }
}

/// `atlas.example.org` → `example.org`: where a sign-in in front keeps its session (as Web.java takes it).
fn gate_domain(host: &str) -> String {
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() <= 2 { host.to_string() } else { parts[parts.len() - 2..].join(".") }
}

#[cfg(test)]
mod mirror_tests {
    use super::*;

    #[test]
    fn a_folder_gets_its_mirror_and_the_phones_sign_in_for_that_server() {
        let home = tempfile::tempdir().unwrap();
        let vault = home.path().join("Work");
        std::fs::create_dir_all(vault.join(".atlas")).unwrap();
        // the list and the sign-ins where serve's environment puts them
        unsafe {
            std::env::set_var("ATLAS_VAULTS", home.path().join("vaults.toml"));
            std::env::set_var("ATLAS_SECRETS_DIR", home.path().join("secrets"));
        }
        let r = mirror(&vault, "https://atlas.example.org/v/work/", "authelia_session=abc; other=1");
        assert_eq!(r, json!({ "ok": true }), "{r}");
        let listed = atlas_core::vaults::list(&atlas_core::vaults::list_file());
        assert_eq!(listed[0].mirror.as_deref(), Some("https://atlas.example.org/v/work/"));
        let url = reqwest::Url::parse("https://atlas.example.org/v/work/api/file").unwrap();
        let sent = atlas_core::service_signin::cookie_header(&atlas_core::secrets::Store::for_vault(&vault), &url).unwrap();
        assert_eq!(sent.as_deref(), Some("authelia_session=abc; other=1"));
        assert_eq!(gate_domain("manga.example.org"), "example.org");
    }
}
