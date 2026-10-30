//! The shared `git status` answer must not outlive a change git itself made: a `git add` or `git commit` run in a
//! terminal touches no watched file (`.git/` is not watched), so only the index tells the cache it is stale.
#![allow(clippy::disallowed_methods)] // a test writes its fixtures directly
use atlas_core::api::Change;
use std::path::Path;
use std::process::Command;

fn git(root: &Path, args: &[&str]) {
    let ok = Command::new("git").arg("-C").arg(root).args(args).status().expect("git runs").success();
    assert!(ok, "git {args:?}");
}

#[test]
fn a_git_add_outside_atlas_is_seen_at_once() {
    if Command::new("git").arg("--version").output().is_err() {
        eprintln!("skipped: no git program");
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-q"]);
    std::fs::write(root.join("a.md"), "# a\n").unwrap();

    let before = atlas_core::git::status(root).unwrap();
    let a = before.entries.iter().find(|e| e.path == "a.md").expect("listed");
    assert_eq!((a.staged, a.unstaged), (None, Some(Change::Untracked)));

    git(root, &["add", "a.md"]); // within the cache's freshness, and no file event
    let after = atlas_core::git::status(root).unwrap();
    let a = after.entries.iter().find(|e| e.path == "a.md").expect("listed");
    assert_eq!((a.staged, a.unstaged), (Some(Change::Added), None), "a stale status");
}
