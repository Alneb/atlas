//! The mirror's leases end to end (docs/design/DESIGN-mirror-v2.md §2): a server core with the password sign-in, a
//! desktop vault whose writes ask it over HTTP (signed in with the cookies the bridge keeps), and the server's own
//! saves taking the same table — so the two copies are never changed concurrently, what Syncthing makes a conflict of.
//! The content rides with the leases (step 7): a write reaches the other copy without Syncthing.
#![allow(clippy::disallowed_methods)] // a test writes its fixtures (and plays Syncthing) directly
use atlas_core::auth::{hash_password, Auth, AuthMode, ServerSettings};
use atlas_core::mirror_guard::{LeaseGuard, Remote};
use atlas_core::server::{serve_on, Listen};
use atlas_core::service_signin::{keep, Cookie};
use atlas_core::{vault_write, Workspace};
use reqwest::{redirect, StatusCode};
use std::sync::Arc;

#[tokio::test(flavor = "multi_thread")]
async fn the_mirror_carries_writes_both_ways_without_syncthing() {
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
    let guard = Arc::new(LeaseGuard::new(ws.root(), remote));
    ws.set_write_guard(guard.clone());

    let root = ws.root().to_path_buf();
    let put = |text: &str| http.put(format!("{base}/api/file")).header("x-atlas", "1").header("cookie", &session).json(&serde_json::json!({ "path": "log.md", "text": text }));
    let on_server = || std::fs::read_to_string(server.path().join("log.md")).ok();
    let here = || std::fs::read_to_string(desktop.path().join("log.md")).ok();
    let write = |text: &'static str| {
        let root = root.clone();
        tokio::task::spawn_blocking(move || vault_write::write(&root.join("log.md"), text.as_bytes()))
    };

    // the desktop writes v2 through the funnel: granted (both copies are v1), and the content rides with the lease —
    // the server's copy is v2 at once, no Syncthing needed
    write("v2\n").await.unwrap().unwrap();
    assert_eq!(on_server().as_deref(), Some("v2\n"));
    // the phone saves on the server, on top of v2
    assert!(put("v3 from the phone\n").send().await.unwrap().status().is_success());

    // the desktop's copy is behind (v2): a change computed from it is refused, and the server's v3 is brought here meanwhile
    let behind = write("desktop on v2\n").await.unwrap();
    assert!(matches!(behind, Err(atlas_core::Error::Conflict { .. })), "{behind:?}");
    assert_eq!(here().as_deref(), Some("v3 from the phone\n"), "the last version, pulled");
    assert_eq!(std::fs::read_to_string(atlas_core::mirror_guard::base_path(ws.root(), "log.md")).unwrap(), "v3 from the phone\n", "the base follows");
    // an append goes on top of it, and reaches the server
    let root2 = ws.root().to_path_buf();
    tokio::task::spawn_blocking(move || vault_write::append(&root2.join("log.md"), b"- from the desktop\n")).await.unwrap().unwrap();
    assert_eq!(on_server().as_deref(), Some("v3 from the phone\n- from the desktop\n"));

    // the phone writes again; the desktop writes nothing, and its catch-up brings it (and a note the phone made)
    assert!(put("v4 from the phone\n").send().await.unwrap().status().is_success());
    let made = http.put(format!("{base}/api/file")).header("x-atlas", "1").header("cookie", &session).json(&serde_json::json!({ "path": "notes/new.md", "text": "made on the phone\n" }));
    assert!(made.send().await.unwrap().status().is_success());
    let g = guard.clone();
    let brought = tokio::task::spawn_blocking(move || g.catch_up()).await.unwrap();
    assert_eq!(brought, 2);
    assert_eq!(here().as_deref(), Some("v4 from the phone\n"));
    assert_eq!(std::fs::read_to_string(desktop.path().join("notes/new.md")).unwrap(), "made on the phone\n");
    // a file changed here and never handed back (an offline edit) is left alone by the catch-up
    std::fs::write(desktop.path().join("notes/new.md"), "edited offline\n").unwrap();
    let g = guard.clone();
    assert_eq!(tokio::task::spawn_blocking(move || g.catch_up()).await.unwrap(), 0);

    // a deletion rides too
    let root3 = ws.root().to_path_buf();
    tokio::task::spawn_blocking(move || vault_write::remove_file(&root3.join("log.md"))).await.unwrap().unwrap();
    assert_eq!(on_server(), None, "removed on the server too");

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
