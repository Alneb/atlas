//! The mirror's leases end to end (docs/design/DESIGN-mirror-v2.md §2): a server core with the password sign-in, a
//! desktop vault whose writes ask it over HTTP (signed in with the cookies the bridge keeps), and the server's own
//! saves taking the same table — so the two copies are never changed concurrently, what Syncthing makes a conflict of.
#![allow(clippy::disallowed_methods)] // a test writes its fixtures (and plays Syncthing) directly
use atlas_core::auth::{hash_password, Auth, AuthMode, ServerSettings};
use atlas_core::mirror_guard::{LeaseGuard, Remote};
use atlas_core::server::{serve_on, Listen};
use atlas_core::service_signin::{keep, Cookie};
use atlas_core::{vault_write, Workspace};
use reqwest::{redirect, StatusCode};
use std::sync::Arc;

#[tokio::test(flavor = "multi_thread")]
async fn a_desktop_write_takes_the_servers_lease_and_the_servers_stale_save_is_refused() {
    let (server, desktop, keys, secrets) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    for d in [&server, &desktop] {
        std::fs::write(d.path().join("log.md"), "v1\n").unwrap();
    }
    let settings = ServerSettings { auth: AuthMode::Password, password_hash: Some(hash_password("a long password").unwrap()), ..Default::default() };
    let srv = serve_on(server.path().to_path_buf(), Listen::Server { addr: "127.0.0.1:0".parse().unwrap(), auth: Box::new(Auth::new(settings, keys.path().join("server.json"))) }).await.unwrap();
    let base = format!("http://127.0.0.1:{}", srv.port());
    let http = reqwest::Client::builder().redirect(redirect::Policy::none()).build().unwrap();
    let ok = http.post(format!("{base}/login")).header("origin", &base).form(&[("password", "a long password"), ("next", "/")]).send().await.unwrap();
    let session = ok.headers()["set-cookie"].to_str().unwrap().split(';').next().unwrap().to_string();
    let (name, value) = session.split_once('=').unwrap();

    // the desktop: its vault mirrored to the server, signed in as the bridge would be
    let ws = Workspace::open(desktop.path()).unwrap();
    let store = atlas_core::secrets::Store::in_dir(secrets.path(), ws.root());
    let cookie = Cookie { name: name.into(), value: value.into(), domain: "127.0.0.1".into(), host_only: true, path: "/".into(), secure: false, expires: None };
    keep(&store, "127.0.0.1", vec![cookie]).unwrap();
    let remote = Remote { mirror: format!("{base}/"), holder: "desktop".into(), store };
    ws.set_write_guard(Arc::new(LeaseGuard::new(ws.root(), remote)));

    let root = ws.root().to_path_buf();
    let put = |text: &str| http.put(format!("{base}/api/file")).header("x-atlas", "1").header("cookie", &session).json(&serde_json::json!({ "path": "log.md", "text": text }));

    // the desktop writes v2 through the funnel: granted (both copies are v1), then handed back with v2's hash
    tokio::task::spawn_blocking(move || vault_write::write(&root.join("log.md"), b"v2\n")).await.unwrap().unwrap();
    // the phone saves on the server, whose copy is still v1: refused, never written on top of the old version
    let stale = put("phone edit on v1\n").send().await.unwrap();
    assert_eq!(stale.status(), StatusCode::CONFLICT, "{:?}", stale.text().await);
    assert_eq!(std::fs::read_to_string(server.path().join("log.md")).unwrap(), "v1\n");
    // Syncthing carries v2 over; now the server's save goes on top of it
    std::fs::write(server.path().join("log.md"), "v2\n").unwrap();
    assert!(put("v3 from the phone\n").send().await.unwrap().status().is_success());

    // the desktop's copy is now behind (v2 while the last version is v3): its write is refused too
    let root = ws.root().to_path_buf();
    let behind = tokio::task::spawn_blocking(move || vault_write::write(&root.join("log.md"), b"desktop on v2\n")).await.unwrap();
    assert!(matches!(behind, Err(atlas_core::Error::Conflict { .. })), "{behind:?}");
    assert_eq!(std::fs::read_to_string(desktop.path().join("log.md")).unwrap(), "v2\n");
    // a base was kept for the desktop's granted write
    assert_eq!(std::fs::read_to_string(atlas_core::mirror_guard::base_path(ws.root(), "log.md")).unwrap(), "v2\n");

    // a device may not pass itself off as the server's own core, nor reach outside the vault
    let ask = |body: serde_json::Value| http.post(format!("{base}/api/lease/ask")).header("x-atlas", "1").header("cookie", &session).json(&body);
    assert_eq!(ask(serde_json::json!({ "path": "log.md", "holder": "server", "have": null })).send().await.unwrap().status(), StatusCode::BAD_REQUEST);
    assert!(!ask(serde_json::json!({ "path": "../x.md", "holder": "desktop", "have": null })).send().await.unwrap().status().is_success());
    // and without signing in, nothing
    let anon = http.post(format!("{base}/api/lease/ask")).header("x-atlas", "1").json(&serde_json::json!({ "path": "log.md", "holder": "desktop", "have": null }));
    assert_eq!(anon.send().await.unwrap().status(), StatusCode::UNAUTHORIZED);
    ws.clear_write_guard();
}

/// Offline, Syncthing made a conflict copy (§4): the running core merges it into the note against the kept base and
/// trashes the copy, without anyone asking.
#[tokio::test(flavor = "multi_thread")]
async fn a_conflict_copy_syncthing_makes_is_merged_by_the_running_core() {
    let vault = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(vault.path().join(".atlas/cache/sync-base/notes")).unwrap();
    std::fs::create_dir_all(vault.path().join("notes")).unwrap();
    std::fs::write(vault.path().join(".atlas/cache/sync-base/notes/log.md"), "# Log\n- one\n- two\n").unwrap();
    std::fs::write(vault.path().join("notes/log.md"), "# Log\n- one, edited here\n- two\n").unwrap();
    let srv = atlas_core::serve(vault.path().to_path_buf(), 0).await.unwrap();
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    let copy = vault.path().join("notes/log.sync-conflict-20261020-231529-H3IIIUW.md");
    std::fs::write(&copy, "# Log\n- one\n- two\n- three, from the phone\n").unwrap();
    let until = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while copy.exists() && std::time::Instant::now() < until {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    assert!(!copy.exists(), "the copy is settled");
    let trashed = walkdir::WalkDir::new(vault.path().join(".atlas/trash")).into_iter().filter_map(|e| e.ok()).any(|e| e.file_name() == "log.sync-conflict-20261020-231529-H3IIIUW.md");
    assert!(trashed, "kept in the vault's trash");
    assert_eq!(std::fs::read_to_string(vault.path().join("notes/log.md")).unwrap(), "# Log\n- one, edited here\n- two\n- three, from the phone\n");
    drop(srv);
}
