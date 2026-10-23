//! Links follow a move. Before a file or folder
//! moves, [`plan`] notes which notes link into it (and which notes move); after, [`apply`] rewrites those links for the
//! new place — and a moved note's relative markdown links for its new folder. Obsidian's style is kept: a bare name
//! while it still finds the file, a path otherwise, `#anchor` and `|alias` untouched, `.md` written only if it was.
use crate::config::Config;
use crate::error::Result;
use crate::links::{self, Names};
use crate::vault_write;
use crate::workspace::Workspace;
use std::collections::HashMap;
use std::path::Path;

/// What a move will touch, taken before it.
pub struct Plan {
    /// the files before the move, resolved (shared with the link index)
    old: std::sync::Arc<Names>,
    /// old path → new path of every file that moves
    moved: HashMap<String, String>,
    /// notes (old paths) that may hold a link to rewrite
    sources: Vec<String>,
}

/// What [`apply`] changed: links rewritten, in which notes (their paths after the move).
#[derive(Debug, Default, PartialEq)]
pub struct Relinked {
    pub links: usize,
    pub notes: Vec<String>,
}

/// The move `from` → `to` (a file or a folder) as seen by the links, before it happens.
pub fn plan(root: &Path, cfg: &Config, from: &str, to: &str) -> Plan {
    let snap = links::snapshot(root, cfg);
    let (from, to) = (from.trim_matches('/'), to.trim_matches('/'));
    let moved: HashMap<String, String> = snap
        .files()
        .iter()
        .filter_map(|f| {
            let rest = f.strip_prefix(from).filter(|r| r.is_empty() || r.starts_with('/'))?;
            Some((f.clone(), format!("{to}{rest}")))
        })
        .collect();
    let sources = snap.parsed.keys().filter(|src| moved.contains_key(*src) || snap.targets(src).any(|t| moved.contains_key(&t))).cloned().collect();
    Plan { old: snap.names.clone(), moved, sources }
}

/// After the move: every planned note read again and its links rewritten (written only where one changed).
pub fn apply(ws: &Workspace, plan: &Plan) -> Result<Relinked> {
    let new_files: Vec<String> = plan.old.files().iter().map(|f| plan.moved.get(f).unwrap_or(f).clone()).collect();
    let new = Names::new(new_files);
    let mut out = Relinked::default();
    for src_old in &plan.sources {
        let src_new = plan.moved.get(src_old).unwrap_or(src_old);
        let Ok(abs) = ws.resolve(src_new) else { continue };
        let Ok(text) = std::fs::read_to_string(&abs) else { continue };
        let (next, n) = rewrite(&text, src_old, src_new, plan, &new);
        if n > 0 {
            vault_write::write(&abs, next.as_bytes())?;
            out.links += n;
            out.notes.push(src_new.clone());
        }
    }
    out.notes.sort();
    Ok(out)
}

/// One note's text with its links pointing at the moved files rewritten → (text, links changed).
fn rewrite(text: &str, src_old: &str, src_new: &str, plan: &Plan, new: &Names) -> (String, usize) {
    let mut edits: Vec<(usize, usize, String)> = Vec::new();
    links::link_lines(text, |_, offset, line, _| {
        for sp in links::link_spans(line) {
            let written = &line[sp.start..sp.end];
            let Some(was) = plan.old.resolve_target(written, sp.wiki, src_old) else { continue };
            let now = plan.moved.get(&was);
            // a link whose file stays put changes only when it is relative and its note moved
            if now.is_none() && (sp.wiki || src_old == src_new) {
                continue;
            }
            let target = now.unwrap_or(&was);
            let next = if sp.wiki { wiki_target(written, target, src_new, new) } else { markdown_target(written, target, src_new) };
            if next != written {
                edits.push((offset + sp.start, offset + sp.end, next));
            }
        }
    });
    let n = edits.len();
    let mut out = text.to_string();
    for (a, b, t) in edits.into_iter().rev() {
        out.replace_range(a..b, &t);
    }
    (out, n)
}

/// `(base, "#anchor")` of a written target.
fn split_anchor(written: &str) -> (&str, &str) {
    written.find('#').map_or((written, ""), |i| written.split_at(i))
}

/// A wikilink's target for `target`: the bare name when it still finds it from `src` (and the link had no folder), else
/// the path from the vault's top; `.md` only when the link wrote it.
fn wiki_target(written: &str, target: &str, src: &str, new: &Names) -> String {
    let (base, anchor) = split_anchor(written);
    let with_md = base.to_lowercase().ends_with(".md");
    let shown = |p: &str| if !with_md && p.to_lowercase().ends_with(".md") { p[..p.len() - 3].to_string() } else { p.to_string() };
    let name = shown(target.rsplit('/').next().unwrap_or(target));
    // a bare name only when it can mean nothing else: the one file of that name, or the one beside the note (Obsidian's
    // first choice) — a tie between folders is decided by nothing a reader sees
    let file = target.rsplit('/').next().unwrap_or(target);
    let unique = new.sharing(file) == 1 || links::dir_of(target) == links::dir_of(src);
    let by_name = !base.contains('/') && unique && new.resolve_target(&name, true, src).as_deref() == Some(target);
    format!("{}{anchor}", if by_name { name } else { shown(target) })
}

/// A markdown link's target for `target`: relative to `src`'s folder, spaces written as the link wrote them.
fn markdown_target(written: &str, target: &str, src: &str) -> String {
    let (base, anchor) = split_anchor(written);
    let rel = relative(links::dir_of(src), target);
    let rel = if base.contains(' ') { rel } else { rel.replace(' ', "%20") };
    format!("{rel}{anchor}")
}

/// `to` (from the vault's top) as seen from the folder `from_dir`: `a/b` → `a/c/x.md` = `c/x.md`, → `d.md` = `../../d.md`.
fn relative(from_dir: &str, to: &str) -> String {
    let from: Vec<&str> = from_dir.split('/').filter(|s| !s.is_empty()).collect();
    let to_parts: Vec<&str> = to.split('/').collect();
    let common = from.iter().zip(&to_parts).take_while(|(a, b)| a == b).count();
    let mut out: Vec<&str> = vec![".."; from.len() - common];
    out.extend(&to_parts[common..]);
    out.join("/")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault(files: &[(&str, &str)]) -> (tempfile::TempDir, Workspace) {
        let dir = tempfile::tempdir().unwrap();
        for (p, t) in files {
            let abs = dir.path().join(p);
            std::fs::create_dir_all(abs.parent().unwrap()).unwrap();
            std::fs::write(abs, t).unwrap();
        }
        let ws = Workspace::open(dir.path()).unwrap();
        (dir, ws)
    }

    fn mv(ws: &Workspace, from: &str, to: &str) -> Relinked {
        let cfg = ws.config().unwrap();
        let plan = plan(ws.root(), &cfg, from, to);
        let (a, b) = (ws.resolve(from).unwrap(), ws.resolve(to).unwrap());
        std::fs::create_dir_all(b.parent().unwrap()).unwrap();
        std::fs::rename(a, b).unwrap();
        apply(ws, &plan).unwrap()
    }

    fn read(ws: &Workspace, p: &str) -> String {
        std::fs::read_to_string(ws.resolve(p).unwrap()).unwrap()
    }

    #[test]
    fn a_renamed_note_keeps_its_links_by_name_anchor_and_alias() {
        let (_d, ws) = vault(&[
            ("notes/Hubbard.md", "# Hubbard\n"),
            ("notes/a.md", "see [[Hubbard]], [[Hubbard#Phases|the phases]] and ![[Hubbard]]\n```\n[[Hubbard]] in code\n```\n`[[Hubbard]]`\n"),
            ("b.md", "---\nup: \"[[Hubbard]]\"\n---\n[md](notes/Hubbard.md#Phases)\n"),
        ]);
        let r = mv(&ws, "notes/Hubbard.md", "notes/Hubbard model.md");
        assert_eq!(read(&ws, "notes/a.md"), "see [[Hubbard model]], [[Hubbard model#Phases|the phases]] and ![[Hubbard model]]\n```\n[[Hubbard]] in code\n```\n`[[Hubbard]]`\n");
        assert_eq!(read(&ws, "b.md"), "---\nup: \"[[Hubbard model]]\"\n---\n[md](notes/Hubbard%20model.md#Phases)\n");
        assert_eq!(r, Relinked { links: 5, notes: vec!["b.md".into(), "notes/a.md".into()] });
    }

    #[test]
    fn a_moved_folder_takes_path_links_and_its_notes_relative_links_along() {
        let (_d, ws) = vault(&[
            ("old/x.excalidraw", "{}"),
            ("old/note.md", "[up](../top.md) and [[x.excalidraw]]\n"),
            ("top.md", "[[old/x.excalidraw]] and [[note]] and [n](old/note.md)\n"),
        ]);
        let r = mv(&ws, "old", "new/place");
        assert_eq!(read(&ws, "top.md"), "[[new/place/x.excalidraw]] and [[note]] and [n](new/place/note.md)\n");
        assert_eq!(read(&ws, "new/place/note.md"), "[up](../../top.md) and [[x.excalidraw]]\n");
        assert_eq!(r.links, 3);
    }

    #[test]
    fn a_name_that_becomes_ambiguous_gets_its_path() {
        let (_d, ws) = vault(&[("a/Plan.md", ""), ("b/Plan 2.md", ""), ("c.md", "[[Plan 2]]\n")]);
        mv(&ws, "b/Plan 2.md", "b/Plan.md");
        assert_eq!(read(&ws, "c.md"), "[[b/Plan]]\n");
    }

    #[test]
    fn unrelated_notes_are_not_written() {
        let (_d, ws) = vault(&[("x.md", ""), ("y.md", "[[z]]\n")]);
        let r = mv(&ws, "x.md", "w.md");
        assert_eq!(r, Relinked::default());
    }
}
