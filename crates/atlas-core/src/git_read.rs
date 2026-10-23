//! A repository's status read in process (gix), for a computer without the `git` program: the Git panel still lists
//! the changes. Ahead/behind and the upstream need git (they stay empty); writing always goes through git.rs.
use crate::api::{Change, GitRepo, GitStatus, StatusEntry};
use crate::{Error, Result};
use std::collections::BTreeMap;
use std::path::Path;

fn entry(m: &mut BTreeMap<String, StatusEntry>, p: String) -> &mut StatusEntry {
    m.entry(p.clone()).or_insert(StatusEntry { path: p, orig: None, staged: None, unstaged: None })
}

pub fn status(root: &Path) -> Result<GitStatus> {
    let fail = |e: &dyn std::fmt::Display| Error::BadRequest(format!("reading the repository: {e}"));
    let repo = match gix::discover(root) {
        Ok(r) => r,
        Err(_) => return Ok(GitStatus { repo: GitRepo::Outside, branch: None, upstream: None, ahead: 0, behind: 0, entries: Vec::new() }),
    };
    let branch = repo.head_name().ok().flatten().map(|n| n.shorten().to_string());
    let mut by_path: BTreeMap<String, StatusEntry> = BTreeMap::new();
    let iter = repo.status(gix::progress::Discard).map_err(|e| fail(&e))?.into_iter(None).map_err(|e| fail(&e))?;
    for item in iter {
        let Ok(item) = item else { continue };
        match item {
            gix::status::Item::IndexWorktree(i) => {
                use gix::status::index_worktree::iter::Summary as S;
                let Some(sum) = i.summary() else { continue };
                let change = match sum {
                    S::Added => Change::Untracked,
                    S::Removed => Change::Deleted,
                    S::Conflict => Change::Conflicted,
                    S::Renamed | S::Copied => Change::Renamed,
                    _ => Change::Modified,
                };
                entry(&mut by_path, i.rela_path().to_string()).unstaged = Some(change);
            }
            gix::status::Item::TreeIndex(c) => {
                use gix::diff::index::Change as C;
                let change = match &c {
                    C::Addition { .. } => Change::Added,
                    C::Deletion { .. } => Change::Deleted,
                    C::Modification { .. } => Change::Modified,
                    C::Rewrite { .. } => Change::Renamed,
                };
                entry(&mut by_path, c.location().to_string()).staged = Some(change);
            }
        }
    }
    // git's order: tracked files by path, then the untracked ones
    let mut entries: Vec<StatusEntry> = by_path.into_values().collect();
    entries.sort_by_key(|e| e.unstaged == Some(Change::Untracked));
    Ok(GitStatus { repo: GitRepo::Repo, branch, upstream: None, ahead: 0, behind: 0, entries })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The same changes as git's own status: untracked, modified, staged, deleted.
    #[test]
    fn reads_what_git_reads() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        let git = |args: &[&str]| assert!(std::process::Command::new("git").arg("-C").arg(r).args(["-c", "user.name=T", "-c", "user.email=t@example.org"]).args(args).output().unwrap().status.success(), "git {args:?}");
        git(&["init", "-q", "-b", "main"]);
        for f in ["kept.md", "gone.md", "edited.md"] {
            std::fs::write(r.join(f), "one\n").unwrap();
        }
        git(&["add", "."]);
        git(&["commit", "-q", "-m", "first"]);
        std::fs::write(r.join("edited.md"), "two\n").unwrap();
        std::fs::remove_file(r.join("gone.md")).unwrap();
        std::fs::write(r.join("new.md"), "x\n").unwrap();
        std::fs::write(r.join("staged.md"), "s\n").unwrap();
        git(&["add", "staged.md"]);
        let ours = status(r).unwrap();
        let theirs = crate::git::status(r).unwrap();
        let view = |s: &GitStatus| s.entries.iter().map(|e| (e.path.clone(), e.staged, e.unstaged)).collect::<Vec<_>>();
        assert_eq!(view(&ours), view(&theirs));
        assert_eq!(ours.branch.as_deref(), Some("main"));
    }
}
