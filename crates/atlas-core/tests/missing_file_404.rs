//! A file that is not there is the caller's 404, not a server error: an embed naming a base that is gone gets "not
//! found", the one answer the UI can word for it.
#![allow(clippy::disallowed_methods)] // a test writes its fixtures directly
use atlas_core::local_lock::Lock;
use atlas_core::server::{serve_on, Listen};
use reqwest::StatusCode;

#[tokio::test]
async fn a_missing_base_is_not_found() {
    let vault = tempfile::tempdir().unwrap();
    std::fs::write(vault.path().join("note.md"), "# Note\n").unwrap();
    let srv = serve_on(vault.path().to_path_buf(), Listen::Local(0, Lock::Open)).await.unwrap();
    let get = |path: &str| reqwest::Client::new().get(format!("{}{path}", srv.url())).header("x-atlas", "1").send();
    let r = get("api/base?path=gone.base").await.unwrap();
    assert_eq!(r.status(), StatusCode::NOT_FOUND);
    assert!(r.text().await.unwrap().contains("not found"));
    srv.shutdown().await.unwrap();
}
