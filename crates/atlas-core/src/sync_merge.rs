//! Syncthing's conflict copies merged away (docs/design/DESIGN-mirror-v2.md §4). With the server answering, leases make
//! conflicts impossible; offline, two devices can still change a note at once, and Syncthing keeps one side as the file
//! and the other as `name.sync-conflict-<date>-<time>-<device>.ext`. The core merges the two against the base (the last
//! version both had, kept by mirror_guard.rs at each leased write) line by line, writes the result (with a lease) and
//! moves the conflict copy to `.atlas/trash/`. Only when both sides changed the same lines is it left for the user.
use crate::events::EventBus;
use crate::{mirror_guard, vault_write, Workspace};
use std::path::Path;

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
    /// left for the user (both changed the same lines, no base, not text, or the write was refused for now)
    Left(String),
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
    let (theirs, ours) = (read(copy)?, read(&orig).unwrap_or_default());
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
    let Ok(base) = std::fs::read_to_string(mirror_guard::base_path(ws.root(), &orig)) else {
        return Ok(Settled::Left("no base kept for it".into()));
    };
    match merge3(&base, &ours, &theirs) {
        Merged::Clashed => Ok(Settled::Left("both sides changed the same lines".into())),
        Merged::Clean(text) => {
            if let Err(e) = vault_write::write(&ws.resolve(&orig)?, text.as_bytes()) {
                return Ok(Settled::Left(format!("the merge was not written yet: {e}")));
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

/// Settles `copy` and logs what was done; `Some(why)` when it is left for the user.
fn settle_logged(ws: &Workspace, copy: &str) -> Option<String> {
    match settle(ws, copy) {
        Ok(Settled::Merged) => eprintln!("atlas: sync: {copy} merged into {}", original_of(copy).unwrap_or_default()),
        Ok(Settled::Same) => eprintln!("atlas: sync: {copy} was the same text; trashed"),
        Ok(Settled::Left(why)) => return Some(why),
        Err(e) => eprintln!("atlas: sync: {copy}: {e}"),
    }
    None
}

/// A copy that arrived while Atlas runs: the user is told at once (the two versions side by side in its note).
fn settle_arrived(ws: &Workspace, bus: &EventBus, copy: &str) {
    let Some(why) = settle_logged(ws, copy) else { return };
    eprintln!("atlas: sync: {copy} left for the user: {why}");
    let orig = original_of(copy).unwrap_or_default();
    bus.publish(crate::api::Event::Notify {
        title: format!("{orig}: two versions to settle"),
        body: Some(format!("Syncthing kept the other device's version as {copy} ({why}). Keep what you want in {orig}, then delete the copy.")),
    });
}

/// The copies found at start, mostly older than the bases a merge needs: the ones left make one line and one notice,
/// not one each (each note still shows its copies side by side when opened).
fn settle_found(ws: &Workspace, bus: &EventBus) {
    let left: Vec<String> = all_copies(ws.root()).into_iter().filter(|c| settle_logged(ws, c).is_some()).collect();
    if left.is_empty() {
        return;
    }
    let some = left.iter().take(5).cloned().collect::<Vec<_>>().join(", ");
    let more = if left.len() > 5 { format!(" and {} more", left.len() - 5) } else { String::new() };
    eprintln!("atlas: sync: {} conflict copies left for the user (no base or the same lines changed): {some}{more}", left.len());
    bus.publish(crate::api::Event::Notify {
        title: format!("{} Syncthing conflict copies to settle", left.len()),
        body: Some(format!("{some}{more}. Each note shows its copy side by side when opened; keep what you want, then delete the copy.")),
    });
}

/// Watches the vault for conflict copies (and settles the ones already there) for as long as the vault is served.
pub fn spawn(ws: Workspace, bus: EventBus) -> tokio::task::JoinHandle<()> {
    let mut rx = bus.on_fs();
    tokio::spawn(async move {
        let (first, b) = (ws.clone(), bus.clone());
        let _ = tokio::task::spawn_blocking(move || settle_found(&first, &b)).await;
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
            let (ws, b) = (ws.clone(), bus.clone());
            let _ = tokio::task::spawn_blocking(move || copies.iter().filter(|c| ws.root().join(c).is_file()).for_each(|c| settle_arrived(&ws, &b, c))).await;
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
