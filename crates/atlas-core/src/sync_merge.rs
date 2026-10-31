//! Syncthing's conflict copies merged away (docs/design/DESIGN-mirror-v2.md §4). With the server answering, leases make
//! conflicts impossible; offline, two devices can still change a note at once, and Syncthing keeps one side as the file
//! and the other as `name.sync-conflict-<date>-<time>-<device>.ext`. The core merges the two against the base (the last
//! version both had, kept by mirror_guard.rs at each leased write) line by line, writes the result (with a lease) and
//! moves the conflict copy to `.atlas/trash/`. Only when both sides changed the same lines is it left for the user.
use crate::api::{Notice, NoticeLevel};
use crate::events::EventBus;
use crate::{mirror_guard, pdf_marks, vault_write, Workspace};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// `notes/a.sync-conflict-20261020-231529-H3IIIUW.md` → `notes/a.md`; `None`: not a conflict copy.
pub fn original_of(rel: &str) -> Option<String> {
    let (dir, name) = rel.rsplit_once('/').map_or(("", rel), |(d, n)| (d, n));
    if name.starts_with(".syncthing.") {
        return None; // Syncthing's own temporary while it downloads one
    }
    let at = name.find(".sync-conflict-")?;
    let rest = &name[at + ".sync-conflict-".len()..];
    // <8 digits>-<6 digits>-<device id prefix>, then the extension if there is one
    let (stamp, ext) = rest.split_once('.').map_or((rest, None), |(s, e)| (s, Some(e)));
    let mut parts = stamp.split('-');
    let ok = parts.next().is_some_and(|d| d.len() == 8 && d.bytes().all(|b| b.is_ascii_digit()))
        && parts.next().is_some_and(|t| t.len() == 6 && t.bytes().all(|b| b.is_ascii_digit()))
        && parts.next().is_some_and(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_alphanumeric()))
        && parts.next().is_none();
    if !ok || at == 0 {
        return None;
    }
    let file = format!("{}{}", &name[..at], ext.map(|e| format!(".{e}")).unwrap_or_default());
    Some(if dir.is_empty() { file } else { format!("{dir}/{file}") })
}

/// The result of a three-way merge.
#[derive(Debug, PartialEq, Eq)]
pub enum Merged {
    Clean(String),
    /// both sides changed the same lines: for the user
    Clashed,
}

/// diff3, by lines: what only one side changed is taken from it, the same change on both sides once.
pub fn merge3(base: &str, ours: &str, theirs: &str) -> Merged {
    let (b, o, t) = (lines(base), lines(ours), lines(theirs));
    // notes are small; a quadratic alignment of a huge file is not worth the wait
    if b.len().saturating_mul(o.len().max(t.len())) > 25_000_000 {
        return Merged::Clashed;
    }
    let (mo, mt) = (matches(&b, &o), matches(&b, &t));
    let mut out = String::new();
    let (mut pb, mut po, mut pt) = (0, 0, 0); // the next line of each not emitted yet
    // stable lines: a base line both sides kept, then the end of all three
    let stable = (0..b.len()).filter_map(|i| Some((i, mo[i]?, mt[i]?))).chain(std::iter::once((b.len(), o.len(), t.len())));
    for (sb, so, st) in stable {
        let (cb, co, ct) = (&b[pb..sb], &o[po..so], &t[pt..st]);
        let take = if co == ct || ct == cb {
            co
        } else if co == cb {
            ct
        } else {
            return Merged::Clashed;
        };
        take.iter().for_each(|l| out.push_str(l));
        if sb < b.len() {
            out.push_str(b[sb]);
        }
        (pb, po, pt) = (sb + 1, so + 1, st + 1);
    }
    Merged::Clean(out)
}

/// Lines with their endings, so the merge gives back the file byte for byte where nothing changed.
fn lines(s: &str) -> Vec<&str> {
    s.split_inclusive('\n').collect()
}

/// For each line of `a`, the line of `b` it is matched to by a longest common subsequence.
fn matches(a: &[&str], b: &[&str]) -> Vec<Option<usize>> {
    let (n, m) = (a.len(), b.len());
    let mut lcs = vec![0u32; (n + 1) * (m + 1)];
    let at = |i: usize, j: usize| i * (m + 1) + j;
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            lcs[at(i, j)] = if a[i] == b[j] { lcs[at(i + 1, j + 1)] + 1 } else { lcs[at(i + 1, j)].max(lcs[at(i, j + 1)]) };
        }
    }
    let (mut out, mut i, mut j) = (vec![None; n], 0, 0);
    while i < n && j < m {
        if a[i] == b[j] {
            out[i] = Some(j);
            (i, j) = (i + 1, j + 1);
        } else if lcs[at(i + 1, j)] >= lcs[at(i, j + 1)] {
            i += 1;
        } else {
            j += 1;
        }
    }
    out
}

/// What became of one conflict copy.
#[derive(Debug, PartialEq, Eq)]
pub enum Settled {
    /// merged into the file, the copy trashed
    Merged,
    /// the copy said what the file says: trashed
    Same,
    /// left for the user (both changed the same lines, no base, not text, the file gone)
    Left(String),
    /// merged, but the write was refused for now (another device holds the lease, or this copy is behind: the other
    /// side's core is likely settling the same copy): tried again a little later, the user not told yet
    Later(String),
}

/// The settled copy into `.atlas/trash/<stamp>/` (synced like the vault: the other device sees it there too), never the
/// desktop's Trash.
fn to_trash(ws: &Workspace, copy: &str) -> crate::Result<()> {
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    vault_write::rename(&ws.resolve(copy)?, &ws.root().join(".atlas/trash").join(stamp).join(copy))
}

/// Drawings merge element by element in their pane (Excalidraw.svelte `mergeTheirs`), not by lines.
fn by_lines(rel: &str) -> bool {
    !rel.ends_with(".excalidraw") && !rel.ends_with(".excalidraw.md")
}

/// Settles the conflict copy `copy` (vault-relative).
pub fn settle(ws: &Workspace, copy: &str) -> crate::Result<Settled> {
    let Some(orig) = original_of(copy) else { return Ok(Settled::Left("not a conflict copy".into())) };
    let read = |rel: &str| std::fs::read(ws.resolve(rel)?).map_err(crate::Error::from);
    let theirs = read(copy)?;
    // the file deleted or renamed since: merging into nothing would bring it back with half its text
    let Ok(ours) = read(&orig) else { return Ok(Settled::Left(format!("{orig} is not there any more"))) };
    if theirs == ours {
        to_trash(ws, copy)?;
        return Ok(Settled::Same);
    }
    if !by_lines(&orig) {
        return Ok(Settled::Left("a drawing: merged in its pane".into()));
    }
    let (Ok(theirs), Ok(ours)) = (String::from_utf8(theirs), String::from_utf8(ours)) else {
        return Ok(Settled::Left("not text".into()));
    };
    let base_file = mirror_guard::base_path(ws.root(), &orig);
    // the base is the copy's ancestor only if the copy was edited after it: Syncthing keeps the copy's own time, and a
    // copy older than the base (one left from before the last leased write) would undo everything written since
    let modified = |p: &Path| std::fs::metadata(p).and_then(|m| m.modified()).ok();
    if let (Some(b), Some(c)) = (modified(&base_file), modified(&ws.resolve(copy)?)) {
        if c < b {
            return Ok(Settled::Left("older than the last version kept here".into()));
        }
    }
    let base = std::fs::read_to_string(base_file).ok();
    let marks = pdf_marks::has_block(&ours) || pdf_marks::has_block(&theirs);
    let merged = match (base, marks) {
        // a note with PDF marks: its text by lines, its marks mark by mark (with no base, only when the text agrees)
        (Some(b), true) => pdf_marks::merge_notes(&b, &ours, &theirs).map(Merged::Clean),
        (None, true) if pdf_marks::outside(&ours) == pdf_marks::outside(&theirs) => pdf_marks::merge_notes(&ours, &ours, &theirs).map(Merged::Clean),
        (Some(b), false) => Some(merge3(&b, &ours, &theirs)),
        (None, _) => return Ok(Settled::Left("no base kept for it".into())),
    };
    match merged.unwrap_or(Merged::Clashed) {
        Merged::Clashed => Ok(Settled::Left("both sides changed the same lines".into())),
        Merged::Clean(text) => {
            // the merge took a while: an edit saved meanwhile would be written over, so it waits for the next pass
            let path = ws.resolve(&orig)?;
            if std::fs::read(&path).ok().as_deref() != Some(ours.as_bytes()) {
                return Ok(Settled::Later("the file changed while merging".into()));
            }
            if let Err(e) = vault_write::write(&path, text.as_bytes()) {
                return Ok(Settled::Later(format!("the merge was not written yet: {e}")));
            }
            to_trash(ws, copy)?;
            Ok(Settled::Merged)
        }
    }
}

/// Whether `rel` is in a folder of the vault's own files: not another program's hidden folder (`.obsidian/`, Obsidian's
/// `.trash/`, Syncthing's `.stversions/`, `.git/`), nor Atlas's per-device cache or its trash. Copies there are not ours.
fn in_vault_files(rel: &str) -> bool {
    let dirs: Vec<&str> = rel.split('/').collect();
    let dirs = &dirs[..dirs.len().saturating_sub(1)];
    dirs.iter().all(|d| !d.starts_with('.') || *d == ".atlas")
        && !matches!(dirs, [".atlas", "cache" | "trash" | "remote", ..])
}

/// Every conflict copy in the vault (at start: the ones Syncthing made while no core watched).
fn all_copies(root: &Path) -> Vec<String> {
    walkdir::WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| !e.file_type().is_dir() || e.depth() == 0 || crate::paths::rel_path(root, e.path()).is_some_and(|rel| in_vault_files(&format!("{rel}/x"))))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| crate::paths::rel_path(root, e.path()))
        .filter(|rel| original_of(rel).is_some())
        .collect()
}

/// Settles `copy` and logs what was done; `None` when nothing is left to do.
fn settle_logged(ws: &Workspace, copy: &str) -> Option<Settled> {
    match settle(ws, copy) {
        Ok(Settled::Merged) => eprintln!("atlas: sync: {copy} merged into {}", original_of(copy).unwrap_or_default()),
        Ok(Settled::Same) => eprintln!("atlas: sync: {copy} was the same text; trashed"),
        Ok(left @ (Settled::Left(_) | Settled::Later(_))) => return Some(left),
        Err(e) => eprintln!("atlas: sync: {copy}: {e}"),
    }
    None
}

/// How often, and how far apart, a merge whose write was refused is tried again before the user is told.
const RETRIES: u32 = 6;
const RETRY_AFTER: std::time::Duration = std::time::Duration::from_secs(5);

/// The copies the user was already told of, on this device (`.atlas/cache/sync-told.json`): a restart, or the watcher
/// seeing the same copy again, tells nothing new.
pub struct Told {
    file: PathBuf,
    set: Mutex<BTreeSet<String>>,
}

impl Told {
    pub fn of(ws: &Workspace) -> Arc<Self> {
        let file = ws.cache_dir().join("sync-told.json");
        let set = std::fs::read(&file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        Arc::new(Self { file, set: Mutex::new(set) })
    }

    /// Whether `copy` is news (remembered from now on).
    fn first_time(&self, copy: &str) -> bool {
        let mut set = self.set.lock().unwrap_or_else(|e| e.into_inner());
        let new = set.insert(copy.to_string());
        if new {
            self.save(&set);
        }
        new
    }

    /// Forgets the copies no longer there (settled or deleted): one that comes back is news again.
    fn keep_only(&self, present: &[String]) {
        let mut set = self.set.lock().unwrap_or_else(|e| e.into_inner());
        let before = set.len();
        set.retain(|c| present.contains(c));
        if set.len() != before {
            self.save(&set);
        }
    }

    fn save(&self, set: &BTreeSet<String>) {
        let saved = serde_json::to_vec(set).map_err(|e| crate::Error::Other(e.into())).and_then(|b| vault_write::cache::write(&self.file, &b));
        if let Err(e) = saved {
            eprintln!("atlas: sync: what was told not kept in {}: {e}", self.file.display());
        }
    }
}

/// The user is told of a copy left for them (the two versions side by side in its note), once per copy.
fn tell(bus: &EventBus, told: &Told, copy: &str, why: &str) {
    eprintln!("atlas: sync: {copy} left for the user: {why}");
    if !told.first_time(copy) {
        return; // told already; its note still shows it side by side
    }
    let orig = original_of(copy).unwrap_or_default();
    let notice = Notice::new(format!("{orig}: two versions to settle"))
        .body(format!("Syncthing kept the other device's version as {copy} ({why}). Keep what you want in {orig}, then delete the copy."));
    bus.publish(crate::api::Event::Notify(notice.source("sync").level(NoticeLevel::Warning).open(orig.as_str()).id(format!("sync:{copy}"))));
}

/// A copy that arrived while Atlas runs: settled, or the user told at once; `Some` when it is to be tried again.
fn settle_arrived(ws: &Workspace, bus: &EventBus, told: &Told, copy: &str) -> Option<String> {
    match settle_logged(ws, copy)? {
        Settled::Later(_) => Some(copy.to_string()),
        Settled::Left(why) => {
            tell(bus, told, copy, &why);
            None
        }
        Settled::Merged | Settled::Same => None,
    }
}

/// A refused merge, again after [`RETRY_AFTER`] — unless the copy went meanwhile (the other side's core settled it and
/// Syncthing brought that over). Out of tries, the user is told.
fn retry_later(ws: Workspace, bus: EventBus, told: Arc<Told>, copy: String, tries: u32) {
    tokio::spawn(async move {
        tokio::time::sleep(RETRY_AFTER).await;
        let (w, c) = (ws.clone(), copy.clone());
        let again = tokio::task::spawn_blocking(move || if w.root().join(&c).is_file() { settle_logged(&w, &c) } else { None }).await;
        match again {
            Ok(Some(Settled::Later(_))) if tries > 1 => retry_later(ws, bus, told, copy, tries - 1),
            Ok(Some(Settled::Later(why) | Settled::Left(why))) => tell(&bus, &told, &copy, &why),
            _ => {}
        }
    });
}

/// The copies found at start, mostly older than the bases a merge needs: the ones left make one line, and one notice
/// only when some were never told of (each note still shows its copies side by side when opened). Returns the ones to
/// try again.
fn settle_found(ws: &Workspace, bus: &EventBus, told: &Told) -> Vec<String> {
    let (mut left, mut later) = (Vec::new(), Vec::new());
    for c in all_copies(ws.root()) {
        match settle_logged(ws, &c) {
            Some(Settled::Later(_)) => later.push(c),
            Some(_) => left.push(c),
            None => {}
        }
    }
    told.keep_only(&left);
    if left.is_empty() {
        return later;
    }
    let list = |l: &[String]| {
        let more = if l.len() > 5 { format!(" and {} more", l.len() - 5) } else { String::new() };
        format!("{}{more}", l.iter().take(5).cloned().collect::<Vec<_>>().join(", "))
    };
    eprintln!("atlas: sync: {} conflict copies left for the user (no base or the same lines changed): {}", left.len(), list(&left));
    // a restart is not news: only copies never announced on this device make a notice
    let news: Vec<String> = left.iter().filter(|c| told.first_time(c)).cloned().collect();
    if news.is_empty() {
        return later;
    }
    let notice = Notice::new(format!("{} Syncthing conflict copies to settle", left.len()))
        .body(format!("New: {}. Each note shows its copy side by side when opened; keep what you want, then delete the copy.", list(&news)));
    bus.publish(crate::api::Event::Notify(notice.source("sync").level(NoticeLevel::Warning).id("sync:copies")));
    later
}

/// Watches the vault for conflict copies (and settles the ones already there) for as long as the vault is served.
pub fn spawn(ws: Workspace, bus: EventBus) -> tokio::task::JoinHandle<()> {
    let mut rx = bus.on_fs();
    tokio::spawn(async move {
        let told = Told::of(&ws);
        let (first, b, t) = (ws.clone(), bus.clone(), told.clone());
        let later = tokio::task::spawn_blocking(move || settle_found(&first, &b, &t)).await.unwrap_or_default();
        later.into_iter().for_each(|c| retry_later(ws.clone(), bus.clone(), told.clone(), c, RETRIES));
        loop {
            let paths = match rx.recv().await {
                Ok(paths) => paths,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => return,
            };
            let copies: Vec<String> = paths.into_iter().filter(|p| original_of(p).is_some() && in_vault_files(p)).collect();
            if copies.is_empty() {
                continue;
            }
            let (w, b, t) = (ws.clone(), bus.clone(), told.clone());
            let later = tokio::task::spawn_blocking(move || copies.iter().filter(|c| w.root().join(c).is_file()).filter_map(|c| settle_arrived(&w, &b, &t, c)).collect::<Vec<_>>()).await;
            later.unwrap_or_default().into_iter().for_each(|c| retry_later(ws.clone(), bus.clone(), told.clone(), c, RETRIES));
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn syncthings_conflict_names_and_nothing_else() {
        assert_eq!(original_of("notes/diff.sync-conflict-20261020-231529-H3IIIUW.md").as_deref(), Some("notes/diff.md"));
        assert_eq!(original_of("a.b.sync-conflict-20261020-231529-H3IIIUW.tar").as_deref(), Some("a.b.tar"));
        assert_eq!(original_of("Makefile.sync-conflict-20261020-231529-ABC").as_deref(), Some("Makefile"));
        for no in ["notes/a.md", ".syncthing.log.sync-conflict-20261020-235159-KBXGMIK.md.tmp", "a.sync-conflict-2026-231529-X.md", "a.sync-conflict-20261020-231529-.md", ".sync-conflict-20261020-231529-X.md"] {
            assert_eq!(original_of(no), None, "{no}");
        }
    }

    #[test]
    fn a_change_on_each_side_merges_and_the_same_lines_clash() {
        let base = "# Log\n- one\n- two\n- three\n";
        let ours = "# Log\n- one (desktop)\n- two\n- three\n";
        let theirs = "# Log\n- one\n- two\n- three\n- four (phone)\n";
        assert_eq!(merge3(base, ours, theirs), Merged::Clean("# Log\n- one (desktop)\n- two\n- three\n- four (phone)\n".into()));
        assert_eq!(merge3(base, ours, ours), Merged::Clean(ours.into()), "the same change once");
        assert_eq!(merge3(base, ours, "# Log\n- one (phone)\n- two\n- three\n"), Merged::Clashed);
        // a line removed on one side, another added on the other
        assert_eq!(merge3("a\nb\nc\n", "a\nc\n", "a\nb\nc\nd\n"), Merged::Clean("a\nc\nd\n".into()));
        // changes on neighbouring lines, nothing kept by both between them: for the user, as in diff3 (a last line given
        // its newline is a change of that line)
        assert_eq!(merge3("a\nb", "a (here)\nb", "a\nb\n"), Merged::Clashed);
        assert_eq!(merge3("", "x\n", ""), Merged::Clean("x\n".into()));
    }

    #[test]
    fn settling_merges_trashes_the_copy_and_leaves_a_clash_alone() {
        let d = tempfile::tempdir().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let copy = "log.sync-conflict-20261020-231529-H3IIIUW.md";
        std::fs::create_dir_all(d.path().join(".atlas/cache/sync-base")).unwrap();
        std::fs::write(d.path().join(".atlas/cache/sync-base/log.md"), "a\nb\n").unwrap();
        std::fs::write(d.path().join("log.md"), "a (here)\nb\n").unwrap();
        std::fs::write(d.path().join(copy), "a\nb\nc (there)\n").unwrap();
        assert_eq!(settle(&ws, copy).unwrap(), Settled::Merged);
        assert_eq!(std::fs::read_to_string(d.path().join("log.md")).unwrap(), "a (here)\nb\nc (there)\n");
        assert!(!d.path().join(copy).exists(), "trashed");
        assert_eq!(all_copies(d.path()), Vec::<String>::new(), "the trash is not searched");

        std::fs::write(d.path().join(copy), "a (there)\nb\n").unwrap();
        std::fs::write(d.path().join(".atlas/cache/sync-base/log.md"), "a\nb\n").unwrap();
        assert!(matches!(settle(&ws, copy).unwrap(), Settled::Left(_)));
        assert!(d.path().join(copy).exists(), "a clash stays for the user");
        assert_eq!(all_copies(d.path()), vec![copy.to_string()]);
        std::fs::write(d.path().join(copy), "a (here)\nb\nc (there)\n").unwrap();
        assert_eq!(settle(&ws, copy).unwrap(), Settled::Same);
    }

    #[test]
    fn a_copy_older_than_the_base_is_left_never_merged_over_the_file() {
        // a config written through the mirror long after an old conflict copy: merging against that base made the
        // copy's few lines replace the whole file
        let d = tempfile::tempdir().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let copy = ".atlas/config.sync-conflict-20261017-045849-J3SZH65.toml";
        let (full, old) = ("[ui]\ntheme = \"light\"\nside_panel = \"sidebar\"\n[editor]\nvim_keys = \"desktop\"\n", "[ui]\nside_panel = \"sidebar\"\n");
        std::fs::create_dir_all(d.path().join(".atlas/cache/sync-base/.atlas")).unwrap();
        std::fs::write(d.path().join(".atlas/config.toml"), full).unwrap();
        std::fs::write(d.path().join(".atlas/cache/sync-base/.atlas/config.toml"), full).unwrap();
        std::fs::write(d.path().join(copy), old).unwrap();
        let week_ago = std::time::SystemTime::now() - std::time::Duration::from_secs(7 * 86400);
        std::fs::File::options().write(true).open(d.path().join(copy)).unwrap().set_modified(week_ago).unwrap();
        assert!(matches!(settle(&ws, copy).unwrap(), Settled::Left(_)));
        assert_eq!(std::fs::read_to_string(d.path().join(".atlas/config.toml")).unwrap(), full, "the file is untouched");
        assert!(d.path().join(copy).exists(), "the copy stays for the user");
    }

    #[test]
    fn a_note_with_pdf_marks_merges_mark_by_mark_even_without_a_base() {
        let d = tempfile::tempdir().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let with = |line: &str| {
            let mut b = pdf_marks::Block::default();
            pdf_marks::apply(&mut b, vec![pdf_marks::Op::Put { mark: Box::new(pdf_marks::Mark::from_line(line).unwrap()) }]);
            pdf_marks::write("# x\n\nmy words\n", &b)
        };
        let copy = "x.sync-conflict-20261020-231529-H3IIIUW.md";
        std::fs::write(d.path().join("x.md"), with(r#"m-aaaaaaa1 bookmark p2 {"title":"here"}"#)).unwrap();
        std::fs::write(d.path().join(copy), with(r#"m-aaaaaaa2 bookmark p5 {"title":"there"}"#)).unwrap();
        assert_eq!(settle(&ws, copy).unwrap(), Settled::Merged);
        let note = std::fs::read_to_string(d.path().join("x.md")).unwrap();
        assert_eq!(pdf_marks::read(&note).live().len(), 2, "{note}");
        assert!(note.starts_with("# x\n\nmy words\n"), "{note}");
    }

    #[test]
    fn a_copy_of_a_file_gone_since_is_left_not_merged_into_an_empty_one() {
        let d = tempfile::tempdir().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let copy = "log.sync-conflict-20261020-231529-H3IIIUW.md";
        std::fs::create_dir_all(d.path().join(".atlas/cache/sync-base")).unwrap();
        std::fs::write(d.path().join(".atlas/cache/sync-base/log.md"), "a\nb\n").unwrap();
        std::fs::write(d.path().join(copy), "a\nb\n").unwrap(); // the base: "ours" (no file) would win as an empty text
        assert!(matches!(settle(&ws, copy).unwrap(), Settled::Left(_)));
        assert!(!d.path().join("log.md").exists(), "not brought back");
        assert!(d.path().join(copy).exists());
    }

    #[test]
    fn a_merge_whose_write_is_refused_for_now_is_tried_again_not_left() {
        struct Behind;
        impl vault_write::WriteGuard for Behind {
            fn before(&self, _: &str, _: &vault_write::WriteKind, _: Option<vault_write::ContentHash>) -> crate::Result<()> {
                Err(crate::Error::Conflict { current: None })
            }
            fn after(&self, _: &str, _: &vault_write::WriteKind, _: Option<vault_write::ContentHash>) {}
        }
        let d = tempfile::tempdir().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let copy = "log.sync-conflict-20261020-231529-H3IIIUW.md";
        std::fs::create_dir_all(d.path().join(".atlas/cache/sync-base")).unwrap();
        std::fs::write(d.path().join(".atlas/cache/sync-base/log.md"), "a\nb\n").unwrap();
        std::fs::write(d.path().join("log.md"), "a (here)\nb\n").unwrap();
        std::fs::write(d.path().join(copy), "a\nb\nc (there)\n").unwrap();
        ws.set_write_guard(std::sync::Arc::new(Behind));
        let got = settle(&ws, copy);
        ws.clear_write_guard();
        assert!(matches!(got.unwrap(), Settled::Later(_)));
        assert!(d.path().join(copy).exists());
        assert_eq!(std::fs::read_to_string(d.path().join("log.md")).unwrap(), "a (here)\nb\n");
    }

    #[test]
    fn a_copy_left_for_the_user_is_announced_once_not_at_every_start() {
        let d = tempfile::tempdir().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let bus = EventBus::default();
        let mut notices = bus.on_notice();
        let mut heard = || std::iter::from_fn(|| notices.try_recv().ok()).count();
        let (a, b) = ("runs/JOBSTATS.sync-conflict-20261027-190410-ABCDEFG.md", "runs/JOBSTATS.sync-conflict-20261028-113314-ABCDEFG.md");
        std::fs::create_dir_all(d.path().join("runs")).unwrap();
        std::fs::write(d.path().join("runs/JOBSTATS.md"), "mine\n").unwrap();
        std::fs::write(d.path().join(a), "theirs\n").unwrap(); // no base: left for the user
        settle_found(&ws, &bus, &Told::of(&ws));
        assert_eq!(heard(), 1, "the first start announces it");
        settle_found(&ws, &bus, &Told::of(&ws)); // a restart: what was told is read back
        assert_eq!(heard(), 0, "a restart is not news");
        let told = Told::of(&ws);
        assert_eq!(settle_arrived(&ws, &bus, &told, a), None);
        assert_eq!(heard(), 0, "the watcher seeing it again is not news either");
        std::fs::write(d.path().join(b), "theirs again\n").unwrap();
        assert_eq!(settle_arrived(&ws, &bus, &told, b), None);
        assert_eq!(heard(), 1, "a new copy is");
        settle_found(&ws, &bus, &Told::of(&ws));
        assert_eq!(heard(), 0);
        // settled by hand, then made again: news again
        std::fs::remove_file(d.path().join(a)).unwrap();
        settle_found(&ws, &bus, &Told::of(&ws));
        std::fs::write(d.path().join(a), "theirs\n").unwrap();
        settle_found(&ws, &bus, &Told::of(&ws));
        assert_eq!(heard(), 1);
    }

    #[test]
    fn other_programs_folders_are_not_searched() {
        for theirs in [".obsidian/appearance.sync-conflict-20260531-190730-FAF6EWY.json", ".trash/a.sync-conflict-20260609-154406-J3SZH65.md",
            ".stversions/n.sync-conflict-20260609-154406-J3SZH65~20260610-101010.md", ".atlas/cache/ui.sync-conflict-20261016-183728-FAF6EWY.log",
            ".git/x.sync-conflict-20260609-154406-J3SZH65", "notes/.hidden/n.sync-conflict-20260609-154406-J3SZH65.md"] {
            assert!(!in_vault_files(theirs), "{theirs}");
        }
        for ours in ["n.sync-conflict-20260609-154406-J3SZH65.md", "runs/.live.sync-conflict-20261020-152033-J3SZH65.json", ".atlas/config.sync-conflict-20261017-045849-J3SZH65.toml"] {
            assert!(in_vault_files(ours), "{ours}");
        }
        let d = tempfile::tempdir().unwrap();
        for f in [".obsidian/a.sync-conflict-20260531-190730-FAF6EWY.json", "notes/n.sync-conflict-20260609-154406-J3SZH65.md", "runs/.live.sync-conflict-20261020-152033-J3SZH65.json"] {
            std::fs::create_dir_all(d.path().join(f).parent().unwrap()).unwrap();
            std::fs::write(d.path().join(f), "x").unwrap();
        }
        let mut found = all_copies(d.path());
        found.sort();
        assert_eq!(found, vec!["notes/n.sync-conflict-20260609-154406-J3SZH65.md".to_string(), "runs/.live.sync-conflict-20261020-152033-J3SZH65.json".to_string()]);
    }
}
