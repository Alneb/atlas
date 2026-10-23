//! The local core locked to its own apps (docs/design/DESIGN-local-lock.md), over HTTP: a bare `x-atlas: 1` request is
//! refused, the key opens the API, a one-time link becomes the cookie and goes on to the page without its code, and
//! the key is left where this machine's `atlas` CLI reads it.
#![allow(clippy::disallowed_methods)] // a test writes its fixtures directly
use atlas_core::local_lock::Lock;
use atlas_core::server::{serve_on, Listen};
use reqwest::{redirect, StatusCode};

#[tokio::test]
async fn a_locked_core_answers_only_with_its_key() {
    let vault = tempfile::tempdir().unwrap();
    std::fs::write(vault.path().join("note.md"), "# Note\n").unwrap();
    let srv = serve_on(vault.path().to_path_buf(), Listen::Local(0, Lock::Locked { fixed: None })).await.unwrap();
    let base = format!("http://127.0.0.1:{}", srv.port());
    let key = srv.key().expect("locked").to_string();
    let file = atlas_core::auth::local_key_file(srv.port());
    assert_eq!(std::fs::read_to_string(&file).unwrap(), key, "the CLI's key file");
    let http = reqwest::Client::builder().redirect(redirect::Policy::none()).build().unwrap();
    let get = |path: &str| http.get(format!("{base}{path}")).header("x-atlas", "1");

    // another program: the old header is no credential any more; a page says where to open Atlas from
    assert_eq!(get("/api/file?path=note.md").send().await.unwrap().status(), StatusCode::UNAUTHORIZED);
    let page = get("/").send().await.unwrap();
    assert_eq!(page.status(), StatusCode::UNAUTHORIZED);
    assert!(page.text().await.unwrap().contains("Atlas is locked"));
    assert_eq!(get("/api/file?path=note.md").header("authorization", "Bearer atl_wrong").send().await.unwrap().status(), StatusCode::UNAUTHORIZED);

    // the key, as the CLI sends it, or in Atlas's own header
    let ok = get("/api/file?path=note.md").header("authorization", format!("Bearer {key}")).send().await.unwrap();
    assert_eq!(ok.status(), StatusCode::OK);
    assert_eq!(get("/api/file?path=note.md").header("x-atlas-token", &key).send().await.unwrap().status(), StatusCode::OK);

    // a window: its one-time link sets the cookie and goes on, once; the cookie then opens pages and the API
    let link = srv.open_url();
    let path = link.strip_prefix(base.as_str()).unwrap().to_string();
    let first = get(&format!("{path}&x=1")).send().await.unwrap();
    assert_eq!(first.status(), StatusCode::SEE_OTHER);
    assert_eq!(first.headers()["location"], "/?x=1", "the code left out of the address");
    let cookie = first.headers()["set-cookie"].to_str().unwrap().to_string();
    assert!(cookie.contains("HttpOnly") && cookie.contains("SameSite=Strict"), "{cookie}");
    assert_eq!(get(&path).send().await.unwrap().status(), StatusCode::UNAUTHORIZED, "a link works once");
    let jar = cookie.split(';').next().unwrap().to_string();
    assert_eq!(get("/").header("cookie", &jar).send().await.unwrap().status(), StatusCode::OK);
    assert_eq!(get("/api/file?path=note.md").header("cookie", &jar).send().await.unwrap().status(), StatusCode::OK);

    // a signed-in window asks for a link for the browser
    let more: serde_json::Value = http.post(format!("{base}/api/local/link")).header("x-atlas", "1").header("cookie", &jar).send().await.unwrap().json().await.unwrap();
    assert!(more["url"].as_str().unwrap().starts_with(&format!("{base}/?k=")), "{more}");
    assert_eq!(http.post(format!("{base}/api/local/link")).header("x-atlas", "1").send().await.unwrap().status(), StatusCode::UNAUTHORIZED);

    // the web-page defences stay: with the key, a bare request without x-atlas is still refused
    let bare = http.get(format!("{base}/api/file?path=note.md")).header("authorization", format!("Bearer {key}")).send().await.unwrap();
    assert_eq!(bare.status(), StatusCode::FORBIDDEN);
    srv.shutdown().await.unwrap();
    std::fs::remove_file(file).ok();
}

#[tokio::test]
async fn an_open_core_is_unchanged() {
    let vault = tempfile::tempdir().unwrap();
    std::fs::write(vault.path().join("note.md"), "# Note\n").unwrap();
    let srv = serve_on(vault.path().to_path_buf(), Listen::Local(0, Lock::Open)).await.unwrap();
    assert!(srv.key().is_none());
    assert_eq!(srv.open_url(), srv.url());
    let r = reqwest::Client::new().get(format!("{}api/file?path=note.md", srv.url())).header("x-atlas", "1").send().await.unwrap();
    assert_eq!(r.status(), StatusCode::OK);
    srv.shutdown().await.unwrap();
}
