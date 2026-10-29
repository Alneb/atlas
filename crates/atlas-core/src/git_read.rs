//! A repository read in process (gix), for a computer without the `git` program (the phone, Windows without Git, a
//! Flatpak without the host's): the status, the history, a commit's detail and patch, a file's diff and blame, when
//! files were first committed. Ahead/behind and the upstream need git (they stay empty); writing always goes through
//! git.rs. Patches are unified diffs made here (`similar`), as git prints them.
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

fn fail(e: impl std::fmt::Display) -> Error {
    Error::BadRequest(format!("reading the repository: {e}"))
}

fn open(root: &Path) -> Option<gix::Repository> {
    gix::discover(root).ok()
}

/// A commit as read here: its full hash, message, author, time (unix seconds) and the paths it changed against its
/// first parent (all of them for a first commit).
pub struct Read {
    pub hash: String,
    pub subject: String,
    pub body: String,
    pub author: String,
    pub time: i64,
    pub files: Vec<(String, Change)>,
}

/// A changed path, how, and its blob before and after.
type Changed = (String, Change, Option<gix::ObjectId>, Option<gix::ObjectId>);

/// Each path that differs between two trees (none: the empty tree), with how.
fn changes(repo: &gix::Repository, old: Option<gix::Tree<'_>>, new: &gix::Tree<'_>) -> Result<Vec<Changed>> {
    use gix::object::tree::diff::ChangeDetached as C;
    let old = old.unwrap_or_else(|| repo.empty_tree());
    let mut out = vec![];
    for c in repo.diff_tree_to_tree(Some(&old), Some(new), None).map_err(fail)? {
        match c {
            C::Addition { location, id, entry_mode, .. } if entry_mode.is_blob() => out.push((location.to_string(), Change::Added, None, Some(id))),
            C::Deletion { location, id, entry_mode, .. } if entry_mode.is_blob() => out.push((location.to_string(), Change::Deleted, Some(id), None)),
            C::Modification { location, previous_id, id, entry_mode, .. } if entry_mode.is_blob() => out.push((location.to_string(), Change::Modified, Some(previous_id), Some(id))),
            C::Rewrite { location, source_id, id, entry_mode, .. } if entry_mode.is_blob() => out.push((location.to_string(), Change::Renamed, Some(source_id), Some(id))),
            _ => {}
        }
    }
    Ok(out)
}

fn read_commit(repo: &gix::Repository, c: &gix::Commit<'_>, with_files: bool) -> Result<Read> {
    let msg = c.message_raw().map_err(fail)?.to_string();
    let (subject, body) = msg.split_once('\n').map_or((msg.trim().to_string(), String::new()), |(s, b)| (s.trim().to_string(), b.trim().to_string()));
    let author = c.author().map_err(fail)?;
    let files = if with_files {
        let parent = c.parent_ids().next().and_then(|p| p.object().ok()?.try_into_commit().ok()?.tree().ok());
        changes(repo, parent, &c.tree().map_err(fail)?)?.into_iter().map(|(p, ch, ..)| (p, ch)).collect()
    } else {
        vec![]
    };
    Ok(Read { hash: c.id.to_string(), subject, body, author: author.name.to_string(), time: c.time().map_err(fail)?.seconds, files })
}

/// Commits from HEAD, newest first, committed in [since, until] (unix seconds), `skip` then at most `limit`.
pub fn commits(root: &Path, since: Option<i64>, until: Option<i64>, skip: usize, limit: usize, with_files: bool) -> Result<Vec<Read>> {
    let Some(repo) = open(root) else { return Ok(vec![]) };
    let Ok(head) = repo.head_id() else { return Ok(vec![]) }; // no commit yet
    let walk = repo.rev_walk([head]).sorting(gix::revision::walk::Sorting::ByCommitTime(Default::default())).all().map_err(fail)?;
    let mut out = vec![];
    for info in walk {
        let info = info.map_err(fail)?;
        let c = info.object().map_err(fail)?;
        let t = c.time().map_err(fail)?.seconds;
        if until.is_some_and(|u| t > u) {
            continue;
        }
        if since.is_some_and(|s| t < s) {
            break; // newest first: the rest are older
        }
        out.push(read_commit(&repo, &c, with_files)?);
    }
    Ok(out.into_iter().skip(skip).take(limit).collect())
}

/// The paths of the index (what git tracks).
pub fn tracked(root: &Path) -> Result<Vec<String>> {
    let Some(repo) = open(root) else { return Ok(vec![]) };
    let idx = repo.index_or_empty().map_err(fail)?;
    Ok(idx.entries().iter().map(|e| e.path(&idx).to_string()).collect())
}

fn blob_text(repo: &gix::Repository, id: Option<gix::ObjectId>) -> String {
    id.and_then(|id| repo.find_object(id).ok()).map(|o| String::from_utf8_lossy(&o.data).into_owned()).unwrap_or_default()
}

/// One file's change as git prints it: the `diff --git` header, then the hunks (3 lines of context).
fn unified(path: &str, old_path: &str, old: &str, new: &str, change: Change) -> String {
    let (a, b) = (if change == Change::Added { "/dev/null".to_string() } else { format!("a/{old_path}") }, if change == Change::Deleted { "/dev/null".to_string() } else { format!("b/{path}") });
    let mut out = format!("diff --git a/{old_path} b/{path}\n");
    match change {
        Change::Added => out += "new file mode 100644\n",
        Change::Deleted => out += "deleted file mode 100644\n",
        _ => {}
    }
    let text = similar::TextDiff::from_lines(old, new).unified_diff().context_radius(3).header(&a, &b).to_string();
    out + &text
}

/// A commit's detail read here: its files with lines added and removed, and the whole patch.
pub fn commit_detail(root: &Path, hash: &str) -> Result<(Read, Vec<crate::api::FileStat>, String)> {
    let repo = open(root).ok_or_else(|| fail("not a repository"))?;
    let c = repo.rev_parse_single(hash).map_err(fail)?.object().map_err(fail)?.try_into_commit().map_err(fail)?;
    let read = read_commit(&repo, &c, false)?;
    let parent = c.parent_ids().next().and_then(|p| p.object().ok()?.try_into_commit().ok()?.tree().ok());
    let (mut stats, mut patch) = (vec![], String::new());
    for (path, change, old, new) in changes(&repo, parent, &c.tree().map_err(fail)?)? {
        let (o, n) = (blob_text(&repo, old), blob_text(&repo, new));
        let d = similar::TextDiff::from_lines(&o, &n);
        let count = |tag| d.iter_all_changes().filter(|x| x.tag() == tag).count() as u32;
        stats.push(crate::api::FileStat { path: path.clone(), added: Some(count(similar::ChangeTag::Insert)), removed: Some(count(similar::ChangeTag::Delete)) });
        patch += &unified(&path, &path, &o, &n, change);
    }
    Ok((Read { files: vec![], ..read }, stats, patch))
}

/// One file's diff: the work tree against the index, or (`staged`) the index against HEAD; a file not in the index
/// against nothing.
pub fn diff(root: &Path, rel: &str, staged: bool) -> Result<String> {
    let Some(repo) = open(root) else { return Ok(String::new()) };
    let idx = repo.index_or_empty().map_err(fail)?;
    let in_index = idx.entry_by_path(rel.into()).map(|e| e.id);
    let (old, new, change) = if staged {
        let head = repo.head_commit().ok().and_then(|c| c.tree().ok()).and_then(|t| t.lookup_entry_by_path(rel).ok().flatten()).map(|e| e.object_id());
        let ch = match (head, in_index) { (None, Some(_)) => Change::Added, (Some(_), None) => Change::Deleted, _ => Change::Modified };
        (blob_text(&repo, head), blob_text(&repo, in_index), ch)
    } else {
        let disk = std::fs::read(root.join(rel)).ok().map(|b| String::from_utf8_lossy(&b).into_owned());
        let ch = match (in_index, &disk) { (None, Some(_)) => Change::Added, (Some(_), None) => Change::Deleted, _ => Change::Modified };
        (blob_text(&repo, in_index), disk.unwrap_or_default(), ch)
    };
    Ok(if old == new { String::new() } else { unified(rel, rel, &old, &new, change) })
}

/// Who last changed each line of `rel` as committed at HEAD.
pub fn blame(root: &Path, rel: &str) -> Result<crate::api::Blame> {
    let mut b = crate::api::Blame::default();
    let Some(repo) = open(root) else { return Ok(b) };
    let Ok(head) = repo.head_id() else { return Ok(b) };
    let Ok(out) = repo.blame_file(rel.into(), head, Default::default()) else { return Ok(b) }; // a file git does not know
    let mut entries = out.entries;
    entries.sort_by_key(|e| e.start_in_blamed_file);
    for e in entries {
        let hash = e.commit_id.to_string();
        if !b.commits.contains_key(&hash) {
            let c = repo.find_commit(e.commit_id).map_err(fail)?;
            let r = read_commit(&repo, &c, false)?;
            b.commits.insert(hash.clone(), crate::api::BlameCommit { author: r.author, time: r.time, summary: r.subject });
        }
        b.lines.extend(std::iter::repeat_n(hash, e.len.get() as usize));
    }
    Ok(b)
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

    /// History, a commit's files and patch, a diff and blame read here say what git says.
    #[test]
    fn history_detail_diff_and_blame_as_git_has_them() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        let git = |args: &[&str]| {
            let o = std::process::Command::new("git").arg("-C").arg(r).args(["-c", "user.name=T", "-c", "user.email=t@example.org"]).args(args).output().unwrap();
            assert!(o.status.success(), "git {args:?}");
            String::from_utf8_lossy(&o.stdout).into_owned()
        };
        git(&["init", "-q", "-b", "main"]);
        std::fs::write(r.join("a.md"), "one\ntwo\nthree\n").unwrap();
        git(&["add", "."]);
        git(&["commit", "-q", "-m", "first\n\nthe body"]);
        std::fs::write(r.join("a.md"), "one\n2\nthree\nfour\n").unwrap();
        std::fs::write(r.join("b.md"), "b\n").unwrap();
        git(&["add", "."]);
        git(&["commit", "-q", "-m", "second"]);

        let log = commits(r, None, None, 0, 10, true).unwrap();
        assert_eq!(log.iter().map(|c| c.subject.as_str()).collect::<Vec<_>>(), ["second", "first"]);
        assert_eq!(log[1].body, "the body");
        assert_eq!(log[0].hash, git(&["rev-parse", "HEAD"]).trim());
        let mut files = log[0].files.clone();
        files.sort_by(|a, b| a.0.cmp(&b.0));
        assert_eq!(files, [("a.md".to_string(), Change::Modified), ("b.md".to_string(), Change::Added)]);
        assert_eq!(commits(r, None, None, 1, 10, false).unwrap().len(), 1, "skipped one");

        let (_, stats, patch) = commit_detail(r, &log[0].hash[..7]).unwrap();
        let theirs = git(&["show", "--format=", "--numstat", "HEAD"]);
        for st in &stats {
            assert!(theirs.contains(&format!("{}\t{}\t{}", st.added.unwrap(), st.removed.unwrap(), st.path)), "{st:?} in {theirs}");
        }
        assert!(patch.contains("diff --git a/a.md b/a.md") && patch.contains("-two\n+2\n") && patch.contains("+four") && patch.contains("--- /dev/null"));

        std::fs::write(r.join("a.md"), "one\n2\nTHREE\nfour\n").unwrap();
        let ours = diff(r, "a.md", false).unwrap();
        assert!(ours.contains("-three\n+THREE\n"), "{ours}");
        assert_eq!(diff(r, "a.md", true).unwrap(), "", "nothing staged");
        std::fs::write(r.join("new.md"), "n\n").unwrap();
        assert!(diff(r, "new.md", false).unwrap().contains("+n"));

        let b = blame(r, "a.md").unwrap();
        let first = git(&["rev-parse", "HEAD~1"]).trim().to_string();
        assert_eq!(b.lines, [first.clone(), log[0].hash.clone(), first, log[0].hash.clone()]);
        assert_eq!(b.commits[&log[0].hash].summary, "second");
        assert_eq!(tracked(r).unwrap(), ["a.md", "b.md"]);
    }
}
