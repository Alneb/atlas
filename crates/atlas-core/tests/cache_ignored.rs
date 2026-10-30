//! A served vault's caches carry a `.gitignore` of their own: git and the Git pane leave them out, whatever the
//! vault's own ignore rules are.
#![allow(clippy::disallowed_methods)] // a test writes its fixtures directly
use atlas_core::local_lock::Lock;
use atlas_core::server::{serve_on, Listen};

#[tokio::test]
async fn the_cache_folder_is_ignored_by_git() {
    let vault = tempfile::tempdir().unwrap();
    std::fs::write(vault.path().join("note.md"), "# Note\n").unwrap();
    let srv = serve_on(vault.path().to_path_buf(), Listen::Local(0, Lock::Open)).await.unwrap();
    let ignore = std::fs::read_to_string(vault.path().join(".atlas/cache/.gitignore")).unwrap();
    assert!(ignore.ends_with("\n*\n"), "{ignore}");
    srv.shutdown().await.unwrap();
}
