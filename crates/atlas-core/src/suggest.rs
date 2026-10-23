//! The toolsmith (docs/guides/MALLEABLE.md R5: tools should not have to be asked for): Atlas
//! notices what the workspace already does and drafts a tool for it. Drafts are computed, never
//! written until kept (inert, reversible); a dismissed one does not come back.
//!
//! Miner 1 — a database for a folder of alike notes: when ≥ 4 notes in one folder share ≥ 2
//! frontmatter keys and no `.base` mentions that folder, draft `<folder>.base` (a table of those
//! keys, plus a board when one key has a few distinct values). Shape-based, no list of names.
//!
//! From the usage journal (`usage.rs`), both drafting `.page` files:
//! Miner 2 — notes used together: two notes opened in the same sitting (gaps < 30 min) at least 3
//! times over ≥ 2 days → a page showing both side by side.
//! Miner 3 — a search the user keeps acting on (≥ 3 times, ≥ 2 days) → a page with a live `search` block.
use crate::api::{DraftFile, ToolDraft};
use crate::{links, usage};
use crate::{Error, Result, Workspace};
use std::collections::{BTreeMap, BTreeSet};

const DISMISSED: &str = ".atlas/suggestions-dismissed.txt";
const MIN_NOTES: usize = 4;
/// Keys that say nothing about the notes' own shape.
const GENERIC: &[&str] = &["tags", "tag", "aliases", "alias", "cssclasses", "cssclass", "title", "publish", "permalink"];

fn dismissed(ws: &Workspace) -> BTreeSet<String> {
    std::fs::read_to_string(ws.root().join(DISMISSED)).unwrap_or_default().lines().map(str::to_string).collect()
}

/// Notes a plugin wrote (`excalidraw-plugin: parsed`…): their frontmatter is the tool's, not yours.
fn tool_written(props: &crate::note_props::Props) -> bool {
    props.keys().any(|k| k.to_lowercase().ends_with("-plugin") || k.to_lowercase().ends_with("_plugin"))
}

/// A folder whose notes share properties.
struct Alike<'a> {
    dir: String,
    keys: Vec<String>,
    props: Vec<&'a crate::note_props::Props>,
}

/// Does an existing `.base` already filter on this folder?
fn covered(bases: &[String], dir: &str) -> bool {
    bases.iter().any(|b| b.contains(&format!("\"{dir}\"")) || b.contains(&format!("'{dir}'")))
}

/// The `.base` drafted for `dir`: a table, and a board when one key splits the notes into a few
/// groups. `folders` = how many alike sub-folders it stands for (a merged draft).
fn base_draft(dir: &str, keys: &[String], props: &[&crate::note_props::Props], folders: Option<usize>) -> ToolDraft {
    let group = keys.iter().find(|k| {
        let vals: BTreeSet<String> = props.iter().filter_map(|p| p.get(k.as_str()).and_then(|v| v.as_str()).map(str::to_lowercase)).collect();
        (2..=8).contains(&vals.len()) && vals.len() < props.len()
    });
    let name = dir.rsplit('/').next().unwrap_or(dir);
    let order = std::iter::once("file.name".to_string()).chain(keys.iter().cloned()).collect::<Vec<_>>().join(", ");
    let mut text = format!(
        "# Made by Atlas from the notes in {dir}/ (they share {}). Edit freely.\nfilters: 'file.inFolder(\"{dir}\")'\nviews:\n  - type: table\n    name: All\n    order: [{order}]\n",
        keys.join(", ")
    );
    if let Some(g) = group {
        text.push_str(&format!("  - type: board\n    name: By {g}\n    groupBy:\n      property: {g}\n    order: [{order}]\n"));
    }
    let parent = dir.rsplit_once('/').map_or(String::new(), |(p, _)| format!("{p}/"));
    let whose = folders.map_or(format!("{dir}/"), |n| format!("the {n} folders of {dir}/"));
    ToolDraft {
        id: format!("base:{dir}"),
        title: format!("A database of {name}"),
        why: format!("{} notes in {whose} share {} — a table{} of them.", props.len(), keys.join(", "), if group.is_some() { " and a board" } else { "" }),
        files: vec![DraftFile { path: format!("{parent}{name}.base"), text }],
    }
}

fn folder_bases(ws: &Workspace) -> Result<Vec<ToolDraft>> {
    let cfg = ws.config()?;
    let vault = links::vault(ws.root(), &cfg);
    // what the existing bases already cover
    let bases: Vec<String> = crate::walk::files(ws.root(), &cfg)
        .filter(|(_, rel)| rel.ends_with(".base"))
        .filter_map(|(abs, _)| std::fs::read_to_string(abs).ok())
        .collect();
    let mut by_dir: BTreeMap<String, Vec<&crate::note_props::Props>> = BTreeMap::new();
    for (path, parsed, _) in &vault.notes {
        let Some((dir, _)) = path.rsplit_once('/') else { continue };
        if !parsed.props.is_empty() && !tool_written(&parsed.props) {
            by_dir.entry(dir.to_string()).or_default().push(&parsed.props);
        }
    }
    // one candidate per folder of alike notes
    let mut found: Vec<Alike> = Vec::new();
    for (dir, props) in by_dir {
        if props.len() < MIN_NOTES || covered(&bases, &dir) {
            continue;
        }
        // keys present in at least 3 of 4 notes
        let mut count: BTreeMap<String, usize> = BTreeMap::new();
        for p in &props {
            for k in p.keys() {
                if !GENERIC.contains(&k.to_lowercase().as_str()) {
                    *count.entry(k.to_string()).or_default() += 1;
                }
            }
        }
        let keys: Vec<String> = count.iter().filter(|(_, n)| **n * 4 >= props.len() * 3).map(|(k, _)| k.clone()).collect();
        if keys.len() >= 2 {
            found.push(Alike { dir, keys, props });
        }
    }
    // sibling folders with the same properties (one per course, per year…) are one database of
    // their parent, not a card each
    let mut families: BTreeMap<(String, Vec<String>), Vec<Alike>> = BTreeMap::new();
    for a in found {
        let parent = a.dir.rsplit_once('/').map_or(String::new(), |(p, _)| p.to_string());
        families.entry((parent, a.keys.clone())).or_default().push(a);
    }
    let mut out = Vec::new();
    for ((parent, keys), mut members) in families {
        if members.len() >= 2 && !parent.is_empty() {
            if !covered(&bases, &parent) {
                let props: Vec<&crate::note_props::Props> = members.iter().flat_map(|m| m.props.iter().copied()).collect();
                out.push(base_draft(&parent, &keys, &props, Some(members.len())));
            }
        } else {
            out.extend(members.drain(..).map(|m| base_draft(&m.dir, &m.keys, &m.props, None)));
        }
    }
    Ok(out)
}

const SITTING_SECS: i64 = 30 * 60;
const MIN_TIMES: usize = 3;
/// A sitting that opened more notes than this was browsing, not working with a set.
const MAX_SITTING_NOTES: usize = 6;

fn day(t: i64) -> i64 {
    t.div_euclid(86_400)
}

/// The text of every `.page` file: a draft whose content one already holds is not offered.
fn pages(ws: &Workspace) -> Result<Vec<String>> {
    let cfg = ws.config()?;
    Ok(crate::walk::files(ws.root(), &cfg)
        .filter(|(_, rel)| rel.ends_with(".page"))
        .filter_map(|(abs, _)| std::fs::read_to_string(abs).ok())
        .collect())
}

fn stem(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.strip_suffix(".md").unwrap_or(name)
}

/// JSON strings are valid YAML scalars: safe quoting for paths and queries.
fn q(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_default()
}

fn notes_together(ws: &Workspace, log: &[usage::Entry], existing: &[String]) -> Vec<ToolDraft> {
    let mut sittings: Vec<(BTreeSet<&str>, i64)> = Vec::new();
    let mut last: Option<i64> = None;
    for e in log {
        let usage::UsageEvent::Open { path } = &e.event else { continue };
        if !path.ends_with(".md") || !ws.root().join(path).is_file() {
            continue;
        }
        if last.is_none_or(|l| e.t - l > SITTING_SECS) {
            sittings.push((BTreeSet::new(), day(e.t)));
        }
        last = Some(e.t);
        sittings.last_mut().expect("pushed above").0.insert(path.as_str());
    }
    let mut pairs: BTreeMap<(&str, &str), (usize, BTreeSet<i64>)> = BTreeMap::new();
    for (notes, d) in sittings.iter().filter(|(n, _)| (2..=MAX_SITTING_NOTES).contains(&n.len())) {
        let v: Vec<&str> = notes.iter().copied().collect();
        for (i, a) in v.iter().enumerate() {
            for b in &v[i + 1..] {
                let e = pairs.entry((*a, *b)).or_default();
                e.0 += 1;
                e.1.insert(*d);
            }
        }
    }
    let mut hot: Vec<_> = pairs.into_iter().filter(|(_, (n, days))| *n >= MIN_TIMES && days.len() >= 2).collect();
    hot.sort_by(|x, y| y.1 .0.cmp(&x.1 .0).then(x.0.cmp(&y.0)));
    hot.into_iter()
        .filter(|((a, b), _)| !existing.iter().any(|p| p.contains(&q(a)) && p.contains(&q(b))))
        .take(3)
        .map(|((a, b), (n, days))| {
            let (sa, sb) = (stem(a), stem(b));
            let file = format!("pages/{}+{}.page", crate::paths::slugify(sa), crate::paths::slugify(sb));
            ToolDraft {
                id: format!("page:together:{a}|{b}"),
                title: format!("A page for {sa} + {sb}"),
                why: format!("You opened {sa} and {sb} together in {n} sittings over {} days — one page shows both.", days.len()),
                files: vec![DraftFile {
                    path: file,
                    text: format!(
                        "# Made by Atlas: you open these two together. Reshape freely (Edit layout).\ntitle: {}\nrows:\n  - columns:\n      - [{{ note: {} }}]\n      - [{{ note: {} }}]\n",
                        q(&format!("{sa} + {sb}")),
                        q(a),
                        q(b)
                    ),
                }],
            }
        })
        .collect()
}

fn repeated_searches(log: &[usage::Entry], existing: &[String]) -> Vec<ToolDraft> {
    let mut seen: BTreeMap<String, (usize, BTreeSet<i64>)> = BTreeMap::new();
    for e in log {
        let usage::UsageEvent::Search { q: query } = &e.event else { continue };
        let k = query.trim().to_lowercase();
        if k.chars().count() >= 2 {
            let s = seen.entry(k).or_default();
            s.0 += 1;
            s.1.insert(day(e.t));
        }
    }
    seen.into_iter()
        .filter(|(k, (n, days))| *n >= MIN_TIMES && days.len() >= 2 && !existing.iter().any(|p| p.contains(&format!("q: {}", q(k)))))
        .map(|(k, (n, days))| ToolDraft {
            id: format!("page:search:{k}"),
            title: format!("A live search for “{k}”"),
            why: format!("You searched “{k}” and opened a result {n} times over {} days — a page keeps the results live.", days.len()),
            files: vec![DraftFile {
                path: format!("pages/search-{}.page", crate::paths::slugify(&k)),
                text: format!("# Made by Atlas: a search you keep running. The block re-runs as files change.\ntitle: {}\nrows:\n  - [{{ view: search, q: {} }}]\n", q(&format!("Search: {k}")), q(&k)),
            }],
        })
        .collect()
}

/// Every current draft, minus the dismissed ones.
pub fn suggestions(ws: &Workspace) -> Result<Vec<ToolDraft>> {
    let gone = dismissed(ws);
    let mut log = usage::read(ws);
    log.sort_by_key(|e| e.t); // appended in arrival order; sittings need time order
    let existing = pages(ws)?;
    let mut all = folder_bases(ws)?;
    all.extend(notes_together(ws, &log, &existing));
    all.extend(repeated_searches(&log, &existing));
    Ok(all.into_iter().filter(|d| !gone.contains(&d.id)).collect())
}

/// Writes a draft's files (never over an existing file); returns their paths.
pub fn keep(ws: &Workspace, id: &str) -> Result<Vec<String>> {
    let d = suggestions(ws)?.into_iter().find(|d| d.id == id).ok_or_else(|| Error::NotFound(format!("suggestion {id}")))?;
    let mut paths = Vec::new();
    for f in &d.files {
        let abs = ws.resolve(&f.path)?;
        if abs.exists() {
            return Err(Error::Conflict { current: None });
        }
        crate::vault_write::write(&abs, f.text.as_bytes())?;
        paths.push(f.path.clone());
    }
    Ok(paths)
}

pub fn dismiss(ws: &Workspace, id: &str) -> Result<()> {
    crate::vault_write::append(&ws.root().join(DISMISSED), format!("{id}\n").as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_journal_drafts_pages_for_notes_used_together_and_repeated_searches() {
        let d = tempfile::tempdir().unwrap();
        for f in ["notes/a.md", "notes/b.md", "notes/c.md"] {
            std::fs::create_dir_all(d.path().join("notes")).unwrap();
            std::fs::write(d.path().join(f), "x\n").unwrap();
        }
        let ws = Workspace::open(d.path()).unwrap();
        let open = |p: &str, t: i64| usage::record_at(&ws, usage::UsageEvent::Open { path: p.into() }, t).unwrap();
        let search = |s: &str, t: i64| usage::record_at(&ws, usage::UsageEvent::Search { q: s.into() }, t).unwrap();
        let day = 86_400;
        for (k, t0) in [0, day, 2 * day].into_iter().enumerate() {
            open("notes/a.md", t0);
            open("notes/b.md", t0 + 600); // same sitting
            if k == 0 {
                open("notes/c.md", t0 + 3 * 3600); // a later sitting, alone
            }
            search(if k == 1 { " Hubbard " } else { "hubbard" }, t0 + 60);
        }
        search("once", 0);
        let s = suggestions(&ws).unwrap();
        let ids: Vec<&str> = s.iter().map(|x| x.id.as_str()).collect();
        assert_eq!(ids, ["page:together:notes/a.md|notes/b.md", "page:search:hubbard"], "{s:?}");
        // the drafts are real pages
        for d in &s {
            let p = crate::page::parse(&d.files[0].text).unwrap();
            assert_eq!(p.rows.len(), 1, "{}", d.files[0].text);
        }
        assert!(s[1].files[0].text.contains("view: search, q: \"hubbard\""));
        // kept → covered by a page now → not offered again
        keep(&ws, "page:search:hubbard").unwrap();
        assert!(!suggestions(&ws).unwrap().iter().any(|x| x.id == "page:search:hubbard"));
    }

    /// A real vault: five lecture folders with the same properties gave five near-identical
    /// cards, which confused more than helped. They are one database of the parent folder.
    #[test]
    fn sibling_folders_with_the_same_properties_are_one_database() {
        let d = tempfile::tempdir().unwrap();
        for course in ["qm", "em", "topo"] {
            for i in 0..4 {
                let p = d.path().join(format!("notes/lectures/{course}/l{i}.md"));
                std::fs::create_dir_all(p.parent().unwrap()).unwrap();
                std::fs::write(p, format!("---\ntype: lecture\ncourse: {course}\ndate: 2025-01-0{i}\n---\n")).unwrap();
            }
        }
        let ws = Workspace::open(d.path()).unwrap();
        let s = suggestions(&ws).unwrap();
        assert_eq!(s.iter().map(|x| x.id.as_str()).collect::<Vec<_>>(), ["base:notes/lectures"], "{s:?}");
        assert!(s[0].why.starts_with("12 notes in the 3 folders of notes/lectures/"), "{}", s[0].why);
        let f = &s[0].files[0];
        assert_eq!(f.path, "notes/lectures.base");
        assert!(f.text.contains("property: course"), "the course splits them → a board: {}", f.text);
        assert_eq!(crate::bases::evaluate(d.path(), &ws.config().unwrap(), &f.text, None).views[0].rows.len(), 12);
    }

    #[test]
    fn a_folder_of_alike_notes_gets_a_database_until_kept_or_dismissed() {
        let d = tempfile::tempdir().unwrap();
        let w = |p: &str, s: &str| {
            let p = d.path().join(p);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, s).unwrap();
        };
        for (i, st) in ["todo", "done", "todo", "done", "todo"].iter().enumerate() {
            w(&format!("work/items/i{i}.md"), &format!("---\nstatus: {st}\nprio: {i}\ntags: [x]\n---\n"));
        }
        w("work/other/a.md", "---\nstatus: x\n---\n"); // too few
        // drawings a plugin wrote: not a database of yours
        for i in 0..5 {
            w(&format!("work/attachments/d{i}.excalidraw.md"), "---\nexcalidraw-plugin: parsed\ntype: drawing\ndate: 2025-01-01\n---\n");
        }
        let ws = Workspace::open(d.path()).unwrap();
        let s = suggestions(&ws).unwrap();
        assert_eq!(s.len(), 1, "{s:?}");
        assert_eq!(s[0].id, "base:work/items");
        let f = &s[0].files[0];
        assert_eq!(f.path, "work/items.base");
        assert!(f.text.contains("file.inFolder(\"work/items\")") && f.text.contains("order: [file.name, prio, status]"), "{}", f.text);
        assert!(f.text.contains("groupBy:\n      property: status"), "status splits into 2 groups → a board");
        assert!(!f.text.contains("tags"), "generic keys are not columns");
        // the draft evaluates as a real base
        let r = crate::bases::evaluate(d.path(), &ws.config().unwrap(), &f.text, None);
        assert_eq!(r.views[0].rows.len(), 5);
        assert_eq!(keep(&ws, "base:work/items").unwrap(), ["work/items.base"]);
        assert!(suggestions(&ws).unwrap().is_empty(), "covered by the new base now");
        std::fs::remove_file(d.path().join("work/items.base")).unwrap();
        dismiss(&ws, "base:work/items").unwrap();
        assert!(suggestions(&ws).unwrap().is_empty(), "dismissed stays dismissed");
    }
}
