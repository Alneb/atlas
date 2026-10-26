//! Git integration: classified log, commit details, status, diff, stage/unstage, commit.
//! Shells out to `git`.
use crate::api::{
    Blame, BlameCommit, Change, CommandOrigin, Commit, CommitBy, CommitDetail, CommitKind, FileStat, GitRepo, GitStatus, Mtime, Patch, StatusEntry,
};
use crate::{Error, Result, Workspace};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

/// Patches larger than this are cut (the UI says so); a diff view is not a file viewer.
pub const MAX_PATCH: usize = 1 << 20;

fn git(root: &Path, args: &[&str]) -> std::io::Result<Output> {
    Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        // status / diff never rewrite .git/index in passing (as editors do): no lock fights, no write per look
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(Stdio::null())
        .output()
}

impl GitStatus {
    fn empty(repo: GitRepo) -> Self {
        GitStatus { repo, branch: None, upstream: None, ahead: 0, behind: 0, entries: Vec::new() }
    }
}

/// What a newcomer without git is told, instead of the system's "No such file or directory".
const NO_GIT: &str = "git is not installed on this computer: the Git panel, a note's history and the commits in Activity need it (install git from the system's packages)";

/// git could not be started.
fn not_started(e: std::io::Error) -> Error {
    Error::BadRequest(if e.kind() == std::io::ErrorKind::NotFound { NO_GIT.into() } else { format!("git: {e}") })
}

/// Runs git and returns stdout; a non-zero exit becomes a BadRequest carrying git's own message.
fn git_ok(root: &Path, args: &[&str]) -> Result<String> {
    let out = git(root, args).map_err(not_started)?;
    if !out.status.success() {
        let msg = String::from_utf8_lossy(&out.stderr);
        let msg = if msg.trim().is_empty() { String::from_utf8_lossy(&out.stdout) } else { msg };
        return Err(Error::BadRequest(format!("git {}: {}", args[0], msg.trim())));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// git's own refusal for a folder outside any repository: an answer for status and diff, not a failure.
fn outside_git(e: &Error) -> bool {
    matches!(e, Error::BadRequest(why) if why.to_lowercase().contains("not a git repository")) // status says "not", diff "Not"
}

/// Files that only record or render other work (history, session logs, HTML views).
fn is_meta(path: &str) -> bool {
    path == "docs/HISTORY.md" || path.starts_with("docs/memory/sessions/") || path.ends_with(".html")
}

/// The agents whose commits are recognised, with their marks (agent_terminals.rs `commit_marks`): only what the agent
/// plugins that are on declare — a vault without one sees every commit as the user's.
pub(crate) fn agent_marks(root: &Path) -> Vec<(String, Vec<String>)> {
    let off = crate::Workspace::open(root).and_then(|w| w.config()).map(|c| c.plugins.off).unwrap_or_default();
    crate::agent_terminals::declared(root, &off)
        .into_iter()
        .filter(|(_, a, _)| !a.commit_marks.is_empty())
        .map(|(_, a, _)| (a.title, a.commit_marks.iter().map(|m| m.to_lowercase()).collect()))
        .collect()
}

/// Shape-based: an agent's commit (one of its marks in the author or the message), and housekeeping = touches only
/// meta files.
fn classify(author: &str, body: &str, files: &[String], marks: &[(String, Vec<String>)]) -> (CommitBy, Option<String>, CommitKind) {
    let (author, body) = (author.to_lowercase(), body.to_lowercase());
    let agent = marks.iter().find(|(_, ms)| ms.iter().any(|m| author.contains(m.as_str()) || body.contains(m.as_str()))).map(|(t, _)| t.clone());
    let by = if agent.is_some() { CommitBy::Agent } else { CommitBy::You };
    let kind =
        if !files.is_empty() && files.iter().all(|f| is_meta(f)) { CommitKind::Housekeeping } else { CommitKind::Work };
    (by, agent, kind)
}

/// Who added `rel` (its first commit) and when; None when untracked or not a repo.
pub fn file_origin(root: &Path, rel: &str) -> Option<CommandOrigin> {
    let out = git(root, &["log", "--diff-filter=A", "--format=%x1e%an%x1f%ct%x1f%b", "--", rel]).ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let first = text.split('\x1e').rfind(|r| !r.trim().is_empty())?;
    let mut f = first.split('\x1f');
    let (author, ts, body) = (f.next()?, f.next()?, f.next().unwrap_or(""));
    let (by, agent, _) = classify(author, body, &[], &agent_marks(root));
    Some(CommandOrigin { by, agent, time: Mtime(ts.trim().parse::<u64>().ok()? * 1000) })
}

const LOG_FORMAT: &str = "--format=%x1e%h%x1f%s%x1f%ct%x1f%an%x1f%b%x1f";

fn parse_log(text: &str, marks: &[(String, Vec<String>)]) -> Vec<Commit> {
    text.split('\x1e')
        .filter_map(|rec| {
            let (head, names) = rec.rsplit_once('\x1f')?;
            let mut f = head.split('\x1f');
            let (hash, subject, ts, author, body) =
                (f.next()?, f.next()?, f.next()?, f.next()?, f.next().unwrap_or(""));
            let files: Vec<String> = names.lines().map(str::trim).filter(|l| !l.is_empty()).map(String::from).collect();
            let (by, agent, kind) = classify(author, body, &files, marks);
            Some(Commit {
                hash: hash.into(),
                subject: subject.into(),
                time: Mtime(ts.trim().parse::<u64>().ok()? * 1000),
                by,
                agent,
                kind,
                files: files.len() as u32,
            })
        })
        .collect()
}

/// Recent commits, newest first. `since` is a git date (`yesterday`); empty when not a repo.
pub fn log(root: &Path, since: Option<&str>, skip: u32, limit: u32) -> Vec<Commit> {
    let (skip, limit) = (format!("--skip={skip}"), format!("--max-count={limit}"));
    let mut args = vec!["log", LOG_FORMAT, "--name-only", &skip, &limit];
    let since_arg;
    if let Some(s) = since {
        since_arg = format!("--since={s}");
        args.push(&since_arg);
    }
    match git(root, &args) {
        Ok(out) if out.status.success() => parse_log(&String::from_utf8_lossy(&out.stdout), &agent_marks(root)),
        _ => Vec::new(),
    }
}

fn check_hash(hash: &str) -> Result<()> {
    let ok = (4..=40).contains(&hash.len()) && hash.bytes().all(|b| b.is_ascii_hexdigit());
    if ok {
        Ok(())
    } else {
        Err(Error::BadRequest(format!("not a commit hash: {hash}")))
    }
}

fn cut(mut patch: String) -> Patch {
    let truncated = patch.len() > MAX_PATCH;
    if truncated {
        let mut end = MAX_PATCH;
        while !patch.is_char_boundary(end) {
            end -= 1;
        }
        patch.truncate(end);
    }
    Patch { patch, truncated }
}

pub fn commit_detail(root: &Path, hash: &str) -> Result<CommitDetail> {
    check_hash(hash)?;
    let head = git_ok(root, &["show", "-s", "--format=%H%x1f%s%x1f%ct%x1f%an%x1f%b", hash])?;
    let mut f = head.splitn(5, '\x1f');
    let bad = || Error::BadRequest(format!("unreadable commit {hash}"));
    let (full, subject, ts, author) =
        (f.next().ok_or_else(bad)?, f.next().ok_or_else(bad)?, f.next().ok_or_else(bad)?, f.next().ok_or_else(bad)?);
    let body = f.next().unwrap_or("").trim_end().to_string();
    // --root: the first commit diffs against the empty tree instead of showing nothing.
    let numstat = git_ok(root, &["show", "--root", "--format=", "--numstat", hash])?;
    let files: Vec<FileStat> = numstat
        .lines()
        .filter_map(|l| {
            let mut c = l.splitn(3, '\t');
            let (a, r, p) = (c.next()?, c.next()?, c.next()?);
            Some(FileStat { path: p.into(), added: a.parse().ok(), removed: r.parse().ok() })
        })
        .collect();
    let names: Vec<String> = files.iter().map(|f| f.path.clone()).collect();
    let (by, agent, kind) = classify(author, &body, &names, &agent_marks(root));
    let patch = cut(git_ok(root, &["show", "--root", "--format=", "--patch", "--no-color", hash])?);
    Ok(CommitDetail {
        hash: full.into(),
        subject: subject.into(),
        body,
        author: author.into(),
        time: Mtime(ts.trim().parse::<u64>().map_err(|_| bad())? * 1000),
        by,
        agent,
        kind,
        files,
        patch,
    })
}

fn change(c: u8) -> Option<Change> {
    match c {
        b'M' | b'T' => Some(Change::Modified),
        b'A' | b'C' => Some(Change::Added),
        b'D' => Some(Change::Deleted),
        b'R' => Some(Change::Renamed),
        b'U' => Some(Change::Conflicted),
        _ => None,
    }
}

fn parse_status(text: &str) -> GitStatus {
    let mut st = GitStatus::empty(GitRepo::Repo);
    let mut it = text.split('\0').filter(|s| !s.is_empty());
    while let Some(rec) = it.next() {
        if let Some(b) = rec.strip_prefix("## ") {
            // "master...origin/master [ahead 1, behind 2]" | "No commits yet on master" | "HEAD (no branch)"
            let (names, counts) = b.split_once(" [").map_or((b, ""), |(n, c)| (n, c));
            let (local, up) = names.split_once("...").map_or((names, None), |(l, u)| (l, Some(u)));
            st.branch = Some(local.trim_start_matches("No commits yet on ").to_string());
            st.upstream = up.map(String::from);
            for part in counts.trim_end_matches(']').split(", ") {
                if let Some(n) = part.strip_prefix("ahead ") {
                    st.ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = part.strip_prefix("behind ") {
                    st.behind = n.parse().unwrap_or(0);
                }
            }
            continue;
        }
        let (Some(&x), Some(&y), Some(path)) = (rec.as_bytes().first(), rec.as_bytes().get(1), rec.get(3..)) else {
            continue;
        };
        let orig = if x == b'R' || x == b'C' { it.next().map(String::from) } else { None };
        let conflict = x == b'U' || y == b'U' || (x == y && (x == b'A' || x == b'D'));
        let (staged, unstaged) = match (x, y) {
            _ if conflict => (None, Some(Change::Conflicted)),
            (b'?', b'?') => (None, Some(Change::Untracked)),
            _ => (change(x), change(y)),
        };
        st.entries.push(StatusEntry { path: path.into(), orig, staged, unstaged });
    }
    st
}

/// How long one `git status` answers every page that asks. A file change ([`files_changed`]) or anything
/// Atlas does to git ([`forget_status`]) forgets it at once.
const STATUS_FRESH: Duration = Duration::from_millis(1500);
/// A vault's root → when an answer was made, and the answer.
type Shared<T> = LazyLock<Mutex<HashMap<PathBuf, (Instant, T)>>>;
static STATUS: Shared<GitStatus> = LazyLock::new(Mutex::default);

/// The working tree's status, shared for [`STATUS_FRESH`]: the lock is held while git runs, so pages asking at the
/// same moment wait for the one run instead of starting their own.
pub fn status(root: &Path) -> Result<GitStatus> {
    let mut cache = STATUS.lock().unwrap();
    if let Some((at, st)) = cache.get(root) {
        if at.elapsed() < STATUS_FRESH {
            return Ok(st.clone());
        }
    }
    let st = status_now(root)?;
    cache.insert(root.to_path_buf(), (Instant::now(), st.clone()));
    Ok(st)
}

/// A file changed (the watcher): the next status is git's own again — the cache only joins pages asking about the
/// same change.
pub fn files_changed(root: &Path) {
    STATUS.lock().unwrap().remove(root);
}

/// After a stage, commit, discard, pull: the next status (and Home's commits) are git's own again.
pub fn forget_status(root: &Path) {
    STATUS.lock().unwrap().remove(root);
    YESTERDAY.lock().unwrap().remove(root);
}

/// Home's "since yesterday" commits, shared for a few seconds: Home refreshes on every file event, a commit is rarer.
static YESTERDAY: Shared<Vec<Commit>> = LazyLock::new(Mutex::default);

/// What git knows of when a vault's files were made: the files it tracks, and those first committed between `since` and
/// `until` (seconds since 1970) with that commit's time. A save that rewrites a file (an editor's, Syncthing's, git's
/// own) does not make it new; its first commit does. None outside git.
pub struct Births {
    pub tracked: std::collections::HashSet<String>,
    pub added: std::collections::HashMap<String, i64>,
}

pub fn births(root: &Path, since: i64, until: i64) -> Option<Births> {
    let tracked = git_ok(root, &["ls-files", "-z"]).ok()?;
    let log = git_ok(root, &["log", "--relative", "--diff-filter=A", "--name-only", "--format=%x01%at", &format!("--since=@{since}"), &format!("--until=@{until}")]).ok()?;
    let mut added = std::collections::HashMap::new();
    let mut at = 0;
    for line in log.lines() {
        match line.strip_prefix('\u{1}') {
            Some(t) => at = t.trim().parse().unwrap_or(0),
            None if !line.trim().is_empty() => drop(added.entry(line.trim().to_string()).or_insert(at)), // newest first: keep the first seen
            None => {}
        }
    }
    Some(Births { tracked: tracked.split('\0').filter(|p| !p.is_empty()).map(str::to_string).collect(), added })
}

pub fn log_since_yesterday(root: &Path) -> Vec<Commit> {
    let mut cache = YESTERDAY.lock().unwrap();
    if let Some((at, c)) = cache.get(root) {
        if at.elapsed() < Duration::from_secs(10) {
            return c.clone();
        }
    }
    let c = log(root, Some("yesterday"), 0, 300);
    cache.insert(root.to_path_buf(), (Instant::now(), c.clone()));
    c
}

fn status_now(root: &Path) -> Result<GitStatus> {
    let text = match git_ok(root, &["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"]) {
        // a vault outside git is an answer, not a failure: every page asking would otherwise log an error each time
        Err(e) if outside_git(&e) => return Ok(GitStatus::empty(GitRepo::Outside)),
        // no git program: the changes read in process (git_read.rs), said as git missing (no pull, push or commit here)
        Err(Error::BadRequest(why)) if why == NO_GIT => {
            let st = crate::git_read::status(root)?;
            return Ok(GitStatus { repo: if st.repo == GitRepo::Repo { GitRepo::NoGit } else { st.repo }, ..st });
        }
        other => other?,
    };
    let mut st = parse_status(&text);
    // a save in flight is not a change of the user's
    st.entries.retain(|e| !crate::files::is_write_tmp(&e.path));
    Ok(st)
}

/// Working-tree diff of one file (`staged` = index vs HEAD). Untracked files diff against nothing.
pub fn diff(root: &Path, rel: &str, staged: bool) -> Result<Patch> {
    let mut args = vec!["diff", "--no-color"];
    if staged {
        args.push("--cached");
    }
    args.extend(["--", rel]);
    let text = match git_ok(root, &args) {
        Err(e) if outside_git(&e) => return Ok(cut(String::new())), // no repository: nothing changed against it
        other => other?,
    };
    if !text.is_empty() || staged {
        return Ok(cut(text));
    }
    // `--no-index` exits 1 when files differ, so read stdout regardless of status.
    let out = git(root, &["diff", "--no-color", "--no-index", "--", "/dev/null", rel]).map_err(not_started)?;
    Ok(cut(String::from_utf8_lossy(&out.stdout).into_owned()))
}

/// Who last changed each line of `rel` (`git blame --porcelain`); unsaved lines count as the file on disk has them.
pub fn blame(root: &Path, rel: &str) -> Result<Blame> {
    match git_ok(root, &["blame", "--porcelain", "--", rel]) {
        Ok(text) => Ok(read_blame(&text)),
        // outside a repository, or a file git does not know: no history to show
        Err(e) if outside_git(&e) || matches!(&e, Error::BadRequest(w) if w.contains("no such path") || w.contains("no such ref")) => Ok(Blame::default()),
        Err(e) => Err(e),
    }
}

/// The porcelain format: a `<hash> <orig> <final> [<count>]` header per line, the commit's `author`, `author-time` and
/// `summary` the first time it appears, then the line itself after a tab.
fn read_blame(text: &str) -> Blame {
    let mut b = Blame::default();
    let mut cur: Option<String> = None;
    for line in text.lines() {
        if line.starts_with('\t') {
            if let Some(h) = cur.take() {
                b.lines.push(h);
            }
            continue;
        }
        let mut parts = line.splitn(2, ' ');
        let (key, rest) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
        if key.len() == 40 && key.bytes().all(|c| c.is_ascii_hexdigit()) {
            b.commits.entry(key.to_string()).or_insert(BlameCommit { author: String::new(), time: 0, summary: String::new() });
            cur = Some(key.to_string());
            continue;
        }
        let Some(c) = cur.as_ref().and_then(|h| b.commits.get_mut(h)) else { continue };
        match key {
            "author" => c.author = rest.to_string(),
            "author-time" => c.time = rest.parse().unwrap_or(0),
            "summary" => c.summary = rest.to_string(),
            _ => {}
        }
    }
    b
}

pub fn stage(root: &Path, rels: &[String], on: bool) -> Result<()> {
    if rels.is_empty() {
        return Ok(());
    }
    let mut args: Vec<&str> = if on { vec!["add", "-A", "--"] } else { vec!["restore", "--staged", "--"] };
    args.extend(rels.iter().map(String::as_str));
    git_ok(root, &args).map(drop)
}

/// Throws away the unstaged changes of files: tracked ones go back to their index version,
/// untracked ones go to the Trash. The current text of each is copied to
/// `.atlas/cache/discarded/<stamp>/` first, so a slip is recoverable. Returns that folder.
pub fn discard(ws: &Workspace, rels: &[String]) -> Result<String> {
    let root = ws.root();
    let untracked: Vec<&String> = {
        let st = status(root)?;
        rels.iter().filter(|r| st.entries.iter().any(|e| &e.path == *r && e.unstaged == Some(Change::Untracked))).collect()
    };
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let keep = format!("{}/discarded/{stamp}", ws.rel(&ws.cache_dir()));
    for rel in rels {
        let src = ws.resolve(rel)?;
        if src.is_file() {
            crate::vault_write::cache::copy(&src, &root.join(&keep).join(rel))?;
        }
    }
    let tracked: Vec<&str> = rels.iter().filter(|r| !untracked.contains(r)).map(String::as_str).collect();
    if !tracked.is_empty() {
        let mut args = vec!["restore", "--worktree", "--"];
        args.extend(tracked);
        git_ok(root, &args)?;
    }
    for rel in untracked {
        crate::files::trash(ws, rel)?;
    }
    Ok(keep)
}

/// `git apply` of a patch (one hunk, from the diff view): to the index (`cached`: stage /
/// unstage a hunk) or the working tree (discard a hunk, with `reverse`).
pub fn apply(root: &Path, patch: &str, cached: bool, reverse: bool) -> Result<()> {
    use std::io::Write;
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(root).args(["apply", "--whitespace=nowarn"]).env("LC_ALL", "C");
    if cached {
        cmd.arg("--cached");
    }
    if reverse {
        cmd.arg("--reverse");
    }
    let mut child = cmd
        .arg("-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(not_started)?;
    child.stdin.take().expect("piped").write_all(patch.as_bytes())?;
    let out = child.wait_with_output()?;
    if !out.status.success() {
        return Err(Error::BadRequest(format!("git apply: {}", String::from_utf8_lossy(&out.stderr).trim())));
    }
    Ok(())
}

/// Which way a sync goes. Neither ever runs by itself: the user presses the button.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sync {
    /// `git pull --ff-only`: never creates a merge commit behind the user's back.
    Pull,
    Push,
}

/// Pull or push the current branch with its upstream. No prompts: a remote that needs a password
/// fails with git's message (use a terminal for that once).
pub fn sync(root: &Path, way: Sync) -> Result<String> {
    let args: &[&str] = match way {
        Sync::Pull => &["pull", "--ff-only"],
        Sync::Push => &["push"],
    };
    let out = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_SSH_COMMAND", std::env::var("GIT_SSH_COMMAND").unwrap_or_else(|_| "ssh -o BatchMode=yes".into()))
        .stdin(Stdio::null())
        .output()
        .map_err(not_started)?;
    let text = format!("{}{}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
    if !out.status.success() {
        return Err(Error::BadRequest(format!("git {}: {}", args[0], text.trim())));
    }
    Ok(text.trim().lines().last().unwrap_or("done").to_string())
}

/// Commits the index. Hooks run (e.g. a pre-commit gate); their output is the error message.
pub fn commit(root: &Path, message: &str) -> Result<String> {
    if message.trim().is_empty() {
        return Err(Error::BadRequest("empty commit message".into()));
    }
    git_ok(root, &["commit", "-q", "-m", message])?;
    Ok(git_ok(root, &["rev-parse", "--short", "HEAD"])?.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> (tempfile::TempDir, Workspace) {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        for a in [&["init", "-q"][..], &["config", "user.email", "t@t"], &["config", "user.name", "t"], &["config", "core.autocrlf", "false"]] {
            git_ok(r, a).unwrap();
        }
        std::fs::write(r.join("a.md"), "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n").unwrap();
        git_ok(r, &["add", "-A"]).unwrap();
        git_ok(r, &["commit", "-q", "-m", "init"]).unwrap();
        let ws = Workspace::open(r).unwrap();
        (d, ws)
    }

    /// Pages asking at once share one `git status`; a file change (the watcher) or a git action makes the next one fresh.
    #[test]
    fn one_status_answers_until_a_change_is_seen() {
        let (d, _ws) = repo();
        let r = d.path();
        let paths = |st: &GitStatus| st.entries.iter().map(|e| e.path.clone()).collect::<Vec<_>>();
        assert!(status(r).unwrap().entries.is_empty());
        std::fs::write(r.join("new.md"), "x").unwrap();
        assert!(status(r).unwrap().entries.is_empty(), "within the window, the shared answer");
        files_changed(r);
        assert_eq!(paths(&status(r).unwrap()), ["new.md"]);
        stage(r, &["new.md".into()], true).unwrap();
        forget_status(r);
        assert!(status(r).unwrap().entries[0].staged.is_some());
    }

    #[test]
    fn discard_restores_tracked_trashes_untracked_and_keeps_a_copy() {
        let (d, ws) = repo();
        let r = d.path();
        std::fs::write(r.join("a.md"), "changed\n").unwrap();
        std::fs::write(r.join("new.md"), "fresh\n").unwrap();
        let keep = discard(&ws, &["a.md".into(), "new.md".into()]).unwrap();
        assert!(std::fs::read_to_string(r.join("a.md")).unwrap().starts_with("one\n"));
        assert!(!r.join("new.md").exists());
        assert_eq!(std::fs::read_to_string(r.join(&keep).join("a.md")).unwrap(), "changed\n");
        assert_eq!(std::fs::read_to_string(r.join(&keep).join("new.md")).unwrap(), "fresh\n");
    }

    #[test]
    fn apply_stages_one_hunk_of_two() {
        let (d, _ws) = repo();
        let r = d.path();
        std::fs::write(r.join("a.md"), "ONE\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nTEN\n").unwrap();
        let p = diff(r, "a.md", false).unwrap().patch;
        // the header plus the first hunk only (what the diff view sends)
        let second = p.match_indices("\n@@").nth(1).map(|(i, _)| i + 1).unwrap_or(p.len());
        apply(r, &p[..second], true, false).unwrap();
        let staged = diff(r, "a.md", true).unwrap().patch;
        assert!(staged.contains("+ONE") && !staged.contains("+TEN"), "{staged}");
        // and back out of the index
        apply(r, &p[..second], true, true).unwrap();
        assert!(diff(r, "a.md", true).unwrap().patch.is_empty());
        assert!(apply(r, "garbage", true, false).is_err());
    }

    #[test]
    fn classifies_by_author_trailer_and_meta_files() {
        let f = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let marks = vec![("Claude".to_string(), vec!["co-authored-by: claude".to_string()]), ("Codex".to_string(), vec!["codex".to_string()])];
        assert_eq!(classify("alice", "", &f(&["src/a.rs"]), &marks), (CommitBy::You, None, CommitKind::Work));
        let trailer = "x\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";
        assert_eq!(
            classify("alice", trailer, &f(&["docs/HISTORY.md"]), &marks),
            (CommitBy::Agent, Some("Claude".to_string()), CommitKind::Housekeeping)
        );
        assert_eq!(classify("codex-bot", "", &f(&["a.rs"]), &marks).1.as_deref(), Some("Codex"), "each agent by its own marks");
        let mixed = f(&["docs/memory/sessions/s.md", "notes/a.md"]);
        assert_eq!(classify("alice", trailer, &mixed, &marks).2, CommitKind::Work);
    }

    #[test]
    fn parses_status_branch_renames_untracked_conflicts() {
        let raw =
            "## master...origin/master [ahead 2, behind 1]\0M  a.rs\0 M b.md\0R  new.md\0old.md\0?? n.txt\0UU c.rs\0";
        let st = parse_status(raw);
        assert_eq!(
            (st.branch.as_deref(), st.upstream.as_deref(), st.ahead, st.behind),
            (Some("master"), Some("origin/master"), 2, 1)
        );
        let e: Vec<_> = st.entries.iter().map(|e| (e.path.as_str(), e.staged, e.unstaged)).collect();
        assert_eq!(
            e,
            vec![
                ("a.rs", Some(Change::Modified), None),
                ("b.md", None, Some(Change::Modified)),
                ("new.md", Some(Change::Renamed), None),
                ("n.txt", None, Some(Change::Untracked)),
                ("c.rs", None, Some(Change::Conflicted)),
            ]
        );
        assert_eq!(st.entries[2].orig.as_deref(), Some("old.md"));
    }

    #[test]
    fn real_repo_roundtrip() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        for a in [&["init", "-q"][..], &["config", "user.name", "T"], &["config", "user.email", "t@t"]] {
            git_ok(r, a).unwrap();
        }
        std::fs::write(r.join("a.md"), "one\n").unwrap();
        assert_eq!(status(r).unwrap().entries[0].unstaged, Some(Change::Untracked));
        assert!(diff(r, "a.md", false).unwrap().patch.contains("+one"));
        stage(r, &["a.md".into()], true).unwrap();
        let h = commit(r, "first").unwrap();
        let c = &log(r, None, 0, 10)[0];
        assert_eq!((c.hash.as_str(), c.by, c.kind, c.files), (h.as_str(), CommitBy::You, CommitKind::Work, 1));
        let d = commit_detail(r, &h).unwrap();
        assert_eq!(d.files[0].added, Some(1));
        assert!(d.patch.patch.contains("+one"));
        assert!(commit_detail(r, "zz; rm -rf").is_err());
        assert!(commit(r, "  ").is_err());
        // blame: the committed line is the commit's; a line added since, nobody's yet
        std::fs::write(r.join("a.md"), "one\ntwo\n").unwrap();
        let b = blame(r, "a.md").unwrap();
        assert_eq!(b.lines.len(), 2);
        assert!(b.lines[0].starts_with(&h) || h.starts_with(&b.lines[0][..h.len().min(40)]), "{b:?} {h}");
        assert_eq!((b.commits[&b.lines[0]].author.as_str(), b.commits[&b.lines[0]].summary.as_str()), ("T", "first"));
        assert!(b.lines[1].bytes().all(|c| c == b'0'), "not committed yet: {b:?}");
        std::fs::write(r.join("new.md"), "x\n").unwrap();
        assert_eq!(blame(r, "new.md").unwrap(), Blame::default(), "a file git does not track: no history, no error");
    }

    #[test]
    fn a_folder_outside_git_says_so_instead_of_failing() {
        let d = tempfile::tempdir().unwrap();
        let st = status(d.path()).unwrap();
        assert!(st.repo == GitRepo::Outside && st.entries.is_empty() && st.branch.is_none());
        std::fs::write(d.path().join("a.md"), "x").unwrap();
        assert!(diff(d.path(), "a.md", false).unwrap().patch.is_empty(), "an opened file's gutter asks: no error");
        assert_eq!(blame(d.path(), "a.md").unwrap(), Blame::default());
    }
}
