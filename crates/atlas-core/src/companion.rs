//! Companion notes: the Markdown note a thing that is not Markdown gets, so it can be linked, searched and listed
//! (docs/PHILOSOPHY.md §1). Two shapes, one call (`POST /api/companion`):
//! - a **folder entry** (a reference's `refs/papers/<key>/`): its note `<folder>/<folder>.md`, with the properties
//!   the caller gives (the catalog-papers plugin: citekey, title, authors…) and the block that draws the entry;
//! - a **file** (a PDF): its folder entry's note when it lies in one, else `<name>.md` beside it in the same shape,
//!   with the file's own block.
//!
//! The vault's `literature` template shapes the note when there is one (its order, its names, its values win). A note
//! is made once and never rewritten; a legacy `notes.md` (the Zotero import) becomes the entry's note.
//! The core knows nothing of references here: what an entry is, and its fields, are the plugin's
//! (docs/refactor/REFACTOR-references-plugin.md).
use crate::api::{CompanionNote, CompanionRequest};
use crate::config::Config;
use crate::frontmatter::set_property;
use crate::{paths, vault_write, Error, Result};
use chrono::NaiveDateTime;
use serde_yaml::{Mapping, Value};
use std::path::Path;

/// The name an entry's note had before 2026-10-14 (the Zotero import, older Atlas).
pub const LEGACY: &str = "notes.md";
/// The vault's template for these notes, in `[notes] templates`, when it has one.
const TEMPLATE: &str = "literature";
/// The property that marks a folder's own note as an entry (a reference) a file inside it belongs to.
const ENTRY_MARK: &str = "citekey";

pub fn file_name(stem: &str) -> String {
    format!("{stem}.md")
}

/// What a note is made from: its title, its properties (in order) and the block that draws the thing.
struct Shape {
    title: String,
    props: Mapping,
    block: String,
}

/// `POST /api/companion`: the note of `path` — a folder entry or a file — made when missing.
pub fn ensure(root: &Path, cfg: &Config, req: &CompanionRequest, now: NaiveDateTime) -> Result<CompanionNote> {
    let rel = req.path.trim_matches('/');
    if rel.is_empty() {
        return Err(Error::BadRequest("companion: a path is needed".into()));
    }
    let abs = paths::safe_join(root, rel)?;
    let folder = abs.is_dir() || req.path.ends_with('/');
    let (dir, name) = rel.rsplit_once('/').unwrap_or(("", rel));
    let stem = if folder { name } else { name.rsplit_once('.').map_or(name, |(s, _)| s) };
    let mut shape = Shape {
        title: req.title.clone().filter(|t| !t.trim().is_empty()).unwrap_or_else(|| stem.to_string()),
        props: req.properties.clone(),
        block: String::new(),
    };
    if folder && req.find {
        return Ok(CompanionNote { path: format!("{rel}/{}", file_name(stem)), created: false, migrated_from: None });
    }
    if folder {
        shape.block = req.block.as_deref().map(view_block).unwrap_or_default();
        return entry_note(root, cfg, rel, stem, &shape, now);
    }
    if let Some(owner) = entry_owner(root, rel)? {
        return Ok(CompanionNote { path: owner, created: false, migrated_from: None });
    }
    let note = if dir.is_empty() { file_name(stem) } else { format!("{dir}/{}", file_name(stem)) };
    let path = paths::safe_join(root, &note)?;
    if path.is_file() || req.find {
        return Ok(CompanionNote { path: note, created: false, migrated_from: None });
    }
    shape.block = req.block.as_deref().map(view_block).unwrap_or_else(|| file_block(rel));
    let text = new_text(&shape, template(root, cfg, &shape.title, now)?.as_deref(), now);
    write_new(&path, &text)?;
    Ok(CompanionNote { path: note, created: true, migrated_from: None })
}

/// The folder entry's note that owns file `rel`, when `rel` sits in one: a paper's PDF has the paper's note, never a
/// second one.
pub fn entry_owner(root: &Path, rel: &str) -> Result<Option<String>> {
    let Some((dir, _)) = rel.trim_matches('/').rsplit_once('/') else { return Ok(None) };
    let owner = format!("{dir}/{}", file_name(dir.rsplit('/').next().unwrap_or(dir)));
    Ok(is_entry(&paths::safe_join(root, &owner)?).then_some(owner))
}

/// The thing a vault file belongs to, by its shape (the tree's rule, ui/src/lib/tree-view.svelte.ts): a file's ink
/// `x.pdf.excalidraw` / `x.cbz.ink.json` or a leftover `x.pdf.md` → `x.pdf`; a file in a mail's `<name> files/` →
/// `<name>.md`; a hidden note (`shown: false`) naming its thing (`drawing:`, `pdf:`, `book:`) → that thing. None: the
/// file is a thing of its own. Search gives one hit per thing with it.
pub fn thing_of(root: &Path, rel: &str) -> Option<String> {
    let (dir, name) = rel.rsplit_once('/').map_or(("", rel), |(d, n)| (d, n));
    let at = |n: &str| if dir.is_empty() { n.to_string() } else { format!("{dir}/{n}") };
    for suffix in [".excalidraw", ".ink.json", ".md"] {
        if let Some(owner) = name.strip_suffix(suffix) {
            let ext = owner.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase());
            if ext.is_some_and(|e| (1..=8).contains(&e.len()) && e.chars().all(|c| c.is_ascii_alphanumeric()) && e != "md" && e != "excalidraw")
                && root.join(at(owner)).is_file()
            {
                return Some(at(owner));
            }
        }
    }
    let mut parts = dir.rsplitn(2, '/');
    let (last, above) = (parts.next().unwrap_or(""), parts.next());
    if let Some(mail) = last.strip_suffix(" files") {
        let note = above.map_or(format!("{mail}.md"), |a| format!("{a}/{mail}.md"));
        if root.join(&note).is_file() {
            return Some(note);
        }
    }
    if name.ends_with(".md") {
        let text = std::fs::read_to_string(root.join(rel)).ok()?;
        let props: Mapping = split(&text).0.and_then(|f| serde_yaml::from_str(f).ok())?;
        if props.get("shown").and_then(Value::as_bool) == Some(false) {
            let link = ["drawing", "pdf", "book"].iter().find_map(|k| props.get(*k)?.as_str())?;
            let target = link.trim().strip_prefix("[[")?.strip_suffix("]]")?.split('|').next()?.trim();
            return root.join(at(target)).is_file().then(|| at(target));
        }
    }
    None
}

/// What stands for `rel` where each thing is listed once (Activity): a satellite's thing ([`thing_of`]); a file with a shown note (a book's, a manga series' entry
/// note) → that note, what a click opens; a file whose note is hidden (a PDF's) → the file itself.
pub fn stands_for(root: &Path, rel: &str) -> String {
    if let Some(thing) = thing_of(root, rel) {
        return thing;
    }
    let (dir, name) = rel.rsplit_once('/').unwrap_or(("", rel));
    let Some((stem, _)) = name.rsplit_once('.').filter(|_| !name.ends_with(".md")) else { return rel.to_string() };
    let beside = if dir.is_empty() { file_name(stem) } else { format!("{dir}/{}", file_name(stem)) };
    let note = entry_owner(root, rel).ok().flatten().or_else(|| root.join(&beside).is_file().then_some(beside));
    match note {
        Some(n) if thing_of(root, &n).as_deref() != Some(rel) => n,
        _ => rel.to_string(),
    }
}

/// The PDF whose note `note` is (the inverse of `ensure` for a PDF): `x.pdf` beside `x.md`; else, for a folder entry's
/// note, the PDF in its folder (the first by name); else the PDF its `view` block of type `pdf` shows.
pub fn pdf_of_note(root: &Path, note: &str) -> Option<String> {
    let note = note.trim_matches('/');
    let (dir, name) = note.rsplit_once('/').map_or(("", note), |(d, n)| (d, n));
    let stem = name.strip_suffix(".md")?;
    let at = |n: &str| if dir.is_empty() { n.to_string() } else { format!("{dir}/{n}") };
    let beside = at(&format!("{stem}.pdf"));
    if root.join(&beside).is_file() {
        return Some(beside);
    }
    let abs = paths::safe_join(root, note).ok()?;
    if is_entry(&abs) {
        let mut pdfs: Vec<String> = std::fs::read_dir(abs.parent()?).ok()?.flatten()
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| n.to_ascii_lowercase().ends_with(".pdf"))
            .collect();
        pdfs.sort();
        if let Some(first) = pdfs.first() {
            return Some(at(first));
        }
    }
    let text = std::fs::read_to_string(&abs).ok()?;
    let block = text.split("```view").skip(1).find(|b| b.lines().any(|l| l.trim() == "type: pdf"))?;
    let path = block.lines().take_while(|l| !l.starts_with("```")).find_map(|l| l.trim().strip_prefix("path:"))?.trim();
    let path = serde_json::from_str::<String>(path).unwrap_or_else(|_| path.trim_matches(['"', '\'']).to_string());
    root.join(&path).is_file().then_some(path)
}

/// Whether `note` is a folder entry's own note (its properties carry ENTRY_MARK).
fn is_entry(note: &Path) -> bool {
    let Ok(text) = std::fs::read_to_string(note) else { return false };
    split(&text).0.and_then(|fm| serde_yaml::from_str::<Mapping>(fm).ok()).is_some_and(|m| m.contains_key(ENTRY_MARK))
}

/// `<dir>/<stem>.md`, made or migrated from a legacy `notes.md`: renamed as it is when it already has properties,
/// else with the header (properties, title, block) put above its text; an empty one counts as none. Never replaces
/// a file's text.
fn entry_note(root: &Path, cfg: &Config, dir_rel: &str, stem: &str, shape: &Shape, now: NaiveDateTime) -> Result<CompanionNote> {
    let dir = paths::safe_join(root, dir_rel)?;
    let rel = format!("{dir_rel}/{}", file_name(stem));
    let path = dir.join(file_name(stem));
    if path.is_file() {
        return Ok(CompanionNote { path: rel, created: false, migrated_from: None });
    }
    let legacy = dir.join(LEGACY);
    let old = std::fs::read_to_string(&legacy).ok();
    let template = template(root, cfg, &shape.title, now)?;
    if old.as_deref().is_some_and(|t| t.starts_with("---\n")) {
        vault_write::rename(&legacy, &path)?;
    } else {
        let text = match old.as_deref().filter(|t| !t.trim().is_empty()) {
            Some(t) => format!("{}{}\n{t}", frontmatter(shape, template.as_deref(), now), heading(shape)),
            None => new_text(shape, template.as_deref(), now),
        };
        write_new(&path, &text)?;
        if old.is_some() {
            vault_write::remove_file(&legacy)?;
        }
    }
    let migrated_from = old.is_some().then(|| format!("{dir_rel}/{LEGACY}"));
    Ok(CompanionNote { path: rel, created: migrated_from.is_none(), migrated_from })
}

fn view_block(kind: &str) -> String {
    format!("```view\ntype: {kind}\n```\n")
}

/// The block that shows a file in its note: a PDF's viewer, else the file embedded.
fn file_block(rel: &str) -> String {
    if rel.to_ascii_lowercase().ends_with(".pdf") {
        format!("```view\ntype: pdf\npath: {}\n```\n", serde_json::to_string(rel).unwrap_or_default())
    } else {
        format!("![[{rel}]]\n")
    }
}

/// `create_new`: a file made meanwhile (another writer) is never replaced.
fn write_new(path: &Path, text: &str) -> Result<()> {
    match vault_write::create(path, text.as_bytes())? {
        vault_write::Created::New => Ok(()),
        vault_write::Created::Taken => Err(std::io::Error::from(std::io::ErrorKind::AlreadyExists).into()),
    }
}

/// The vault's literature template, filled in (`{{title}}`, `{{date}}`, Templater tags); None without one.
fn template(root: &Path, cfg: &Config, title: &str, now: NaiveDateTime) -> Result<Option<String>> {
    let rel = format!("{}/{TEMPLATE}.md", cfg.notes.templates.trim_matches('/'));
    match std::fs::read_to_string(paths::safe_join(root, &rel)?) {
        Ok(t) => Ok(Some(crate::notes::render_template(root, cfg, &t, title, now))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// The caller's properties, then `title` and the `created` stamp when it gave none (a note says when it was made).
fn properties(s: &Shape, now: NaiveDateTime) -> Vec<(String, Value)> {
    let mut out: Vec<(String, Value)> = s.props.iter().filter_map(|(k, v)| Some((k.as_str()?.to_string(), v.clone()))).collect();
    if !s.props.contains_key("title") {
        out.push(("title".into(), s.title.clone().into()));
    }
    if !s.props.contains_key("created") {
        out.push(("created".into(), now.format("%Y-%m-%d").to_string().into()));
    }
    out
}

fn blank(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => true,
        Some(Value::String(s)) => s.trim().is_empty(),
        Some(Value::Sequence(s)) => s.is_empty(),
        _ => false,
    }
}

/// The frontmatter block: the template's own (its order, its comments, its values) with the properties filled into
/// the keys it leaves empty and added after it.
fn frontmatter(s: &Shape, template: Option<&str>, now: NaiveDateTime) -> String {
    let inner = split(template.unwrap_or("")).0.map(|i| i.trim_end_matches('\n')).filter(|i| !i.trim().is_empty());
    let mut text = match inner {
        Some(i) => format!("---\n{i}\n---\n"),
        None => "---\n---\n".into(),
    };
    let have: Mapping = inner.and_then(|i| serde_yaml::from_str(i).ok()).unwrap_or_default();
    for (k, v) in properties(s, now) {
        let Some((k, v)) = their_key(&k, v, &have) else { continue };
        if blank(have.get(k.as_str())) {
            text = set_property(&text, &k, &v);
        }
    }
    text
}

/// A property under the template's own name for it (Atlas's writers follow the vault's spec): the
/// template's `sources` takes `source` as a list; a template with a `date` keeps that as the one creation stamp
/// (no `created` beside it). None: the template already has the thing under its own name.
fn their_key(k: &str, v: Value, have: &Mapping) -> Option<(String, Value)> {
    let has = |n: &str| have.contains_key(n);
    if k == "created" && has("date") {
        return None;
    }
    let plural = format!("{k}s");
    if !has(k) && has(&plural) {
        let list = match v {
            Value::Sequence(_) => v,
            one => Value::Sequence(vec![one]),
        };
        return Some((plural, list));
    }
    Some((k.to_string(), v))
}

fn heading(s: &Shape) -> String {
    format!("# {}\n\n{}", s.title, s.block)
}

/// A new note: the template's body with the block under its title, or (no template) title, block, `## Notes`.
fn new_text(s: &Shape, template: Option<&str>, now: NaiveDateTime) -> String {
    let fm = frontmatter(s, template, now);
    let Some(body) = template.map(|t| split(t).1) else { return format!("{fm}{}\n## Notes\n\n", heading(s)) };
    match body.lines().position(|l| l.starts_with("# ")) {
        Some(i) => {
            let mut lines: Vec<&str> = body.lines().collect();
            let rest = lines.split_off(i + 1);
            format!("{fm}{}\n\n{}{}{}", lines.join("\n"), s.block, if rest.first().is_some_and(|l| l.is_empty()) { "" } else { "\n" }, rest.join("\n") + "\n")
        }
        None => format!("{fm}{}\n{}", heading(s), body.trim_start_matches('\n')),
    }
}

/// (frontmatter without its fences, the body after it).
pub(crate) fn split(t: &str) -> (Option<&str>, &str) {
    let Some(rest) = t.strip_prefix("---\n") else { return (None, t) };
    if let Some(after) = rest.strip_prefix("---\n") {
        return (Some(""), after);
    }
    match rest.find("\n---\n") {
        Some(i) => (Some(&rest[..i + 1]), &rest[i + 5..]),
        None => match rest.strip_suffix("\n---") {
            Some(inner) => (Some(inner), ""),
            None => (None, t),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now() -> NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(2026, 10, 14).unwrap().and_hms_opt(10, 0, 0).unwrap()
    }
    fn vault() -> (tempfile::TempDir, Config) {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("refs/papers/maier2005quantum")).unwrap();
        (d, Config::default())
    }
    /// What catalog-papers asks for a paper (its engine's `companion_properties`).
    fn paper() -> CompanionRequest {
        let props = "type: literature\ncitekey: maier2005quantum\ntitle: 'Quantum cluster theories: a review'\nauthors:\n- Maier, Thomas\n- Jarrell, Mark\nyear: 2005\nsource: https://doi.org/10.1103/RevModPhys.77.1027\n";
        CompanionRequest {
            path: "refs/papers/maier2005quantum".into(),
            title: Some("Quantum cluster theories: a review".into()),
            properties: serde_yaml::from_str(props).unwrap(),
            block: Some("library.paper".into()),
            find: false,
        }
    }
    fn file(path: &str) -> CompanionRequest {
        CompanionRequest { path: path.into(), title: None, properties: Mapping::new(), block: None, find: false }
    }

    #[test]
    fn a_file_gets_its_entrys_note_or_one_of_its_own_beside_it() {
        let (d, cfg) = vault();
        ensure(d.path(), &cfg, &paper(), now()).unwrap();
        std::fs::write(d.path().join("refs/papers/maier2005quantum/Maier 2005 - Quantum.pdf"), b"%PDF").unwrap();
        let r = ensure(d.path(), &cfg, &file("refs/papers/maier2005quantum/Maier 2005 - Quantum.pdf"), now()).unwrap();
        assert_eq!(r.path, "refs/papers/maier2005quantum/maier2005quantum.md", "a paper's PDF: the paper's own note, not a second one");
        std::fs::create_dir_all(d.path().join("books")).unwrap();
        std::fs::write(d.path().join("books/Lecture notes.pdf"), b"%PDF").unwrap();
        let r = ensure(d.path(), &cfg, &file("books/Lecture notes.pdf"), now()).unwrap();
        assert_eq!((r.path.as_str(), r.created), ("books/Lecture notes.md", true));
        let text = std::fs::read_to_string(d.path().join("books/Lecture notes.md")).unwrap();
        assert!(text.starts_with("---\n") && text.contains("title: Lecture notes") && text.contains("# Lecture notes\n\n```view\ntype: pdf\npath: \"books/Lecture notes.pdf\"\n```\n"), "{text}");
        assert!(!ensure(d.path(), &cfg, &file("books/Lecture notes.pdf"), now()).unwrap().created, "made once");
        // a folder note that is no entry (an Obsidian folder note) does not take the files in its folder
        std::fs::write(d.path().join("books/books.md"), "---\ntype: folder\n---\n").unwrap();
        std::fs::write(d.path().join("books/Other.pdf"), b"%PDF").unwrap();
        assert_eq!(ensure(d.path(), &cfg, &file("books/Other.pdf"), now()).unwrap().path, "books/Other.md");
    }

    #[test]
    fn properties_given_as_yaml_text_keep_their_order() {
        // what a plugin sends: its JSON objects reach the core with sorted keys, YAML text does not
        let req: CompanionRequest = serde_json::from_str(r#"{"path": "refs/papers/k/", "properties": "type: literature\ncitekey: k\ntitle: T\nyear: 1963\n"}"#).unwrap();
        let keys: Vec<_> = req.properties.keys().filter_map(|k| k.as_str()).collect();
        assert_eq!(keys, ["type", "citekey", "title", "year"]);
        let obj: CompanionRequest = serde_json::from_str(r#"{"path": "x.pdf", "properties": {"b": 1, "a": 2}}"#).unwrap();
        assert_eq!(obj.properties.keys().filter_map(|k| k.as_str()).collect::<Vec<_>>(), ["b", "a"]);
    }

    #[test]
    fn a_new_entry_note_has_the_properties_given_the_block_and_a_place_to_write() {
        let (d, cfg) = vault();
        let r = ensure(d.path(), &cfg, &paper(), now()).unwrap();
        assert_eq!((r.path.as_str(), r.created, r.migrated_from.as_deref()), ("refs/papers/maier2005quantum/maier2005quantum.md", true, None));
        let text = std::fs::read_to_string(d.path().join(&r.path)).unwrap();
        assert_eq!(
            text,
            "---\ntype: literature\ncitekey: maier2005quantum\ntitle: 'Quantum cluster theories: a review'\nauthors:\n  - Maier, Thomas\n  - Jarrell, Mark\nyear: 2005\nsource: https://doi.org/10.1103/RevModPhys.77.1027\ncreated: 2026-10-14\n---\n# Quantum cluster theories: a review\n\n```view\ntype: library.paper\n```\n\n## Notes\n\n"
        );
        // the second time it is only found: the user's writing is never touched
        std::fs::write(d.path().join(&r.path), "mine\n").unwrap();
        assert!(!ensure(d.path(), &cfg, &paper(), now()).unwrap().created);
        assert_eq!(std::fs::read_to_string(d.path().join(&r.path)).unwrap(), "mine\n");
        assert!(matches!(ensure(d.path(), &cfg, &file(""), now()), Err(Error::BadRequest(_))));
    }

    #[test]
    fn a_satellite_belongs_to_its_thing() {
        let (d, _) = vault();
        let w = |rel: &str, text: &str| {
            std::fs::create_dir_all(d.path().join(rel).parent().unwrap()).unwrap();
            std::fs::write(d.path().join(rel), text).unwrap();
        };
        w("p/chap.pdf", "%PDF");
        w("p/chap.pdf.excalidraw", "{}");
        w("mail/a/2026 Hi.md", "# Hi");
        w("mail/a/2026 Hi files/x.txt", "x");
        w("n/d.excalidraw", "{}");
        w("n/d.md", "---\ndrawing: '[[d.excalidraw]]'\nshown: false\n---\n");
        w("n/mine.md", "---\ndrawing: '[[d.excalidraw]]'\n---\nmy own note about it");
        let of = |rel: &str| thing_of(d.path(), rel);
        assert_eq!(of("p/chap.pdf.excalidraw").as_deref(), Some("p/chap.pdf"));
        assert_eq!(of("mail/a/2026 Hi files/x.txt").as_deref(), Some("mail/a/2026 Hi.md"));
        assert_eq!(of("n/d.md").as_deref(), Some("n/d.excalidraw"));
        assert_eq!(of("n/mine.md"), None, "a shown note is a thing of its own");
        assert_eq!(of("p/chap.pdf"), None);
        assert_eq!(of("n/d.excalidraw"), None);
    }

    /// Activity lists each thing once: a PDF and its hidden note are the PDF, a book and its shown note are the note.
    #[test]
    fn a_file_and_its_note_stand_for_one_thing() {
        let (d, _) = vault();
        let w = |rel: &str, text: &str| {
            std::fs::create_dir_all(d.path().join(rel).parent().unwrap()).unwrap();
            std::fs::write(d.path().join(rel), text).unwrap();
        };
        w("p/a.pdf", "%PDF");
        w("p/a.md", "---
pdf: '[[a.pdf]]'
shown: false
---
");
        w("books/dune.epub", "PK");
        w("books/dune.md", "---
book: '[[dune.epub]]'
---
");
        w("p/alone.png", "png");
        let s = |rel: &str| stands_for(d.path(), rel);
        assert_eq!((s("p/a.pdf"), s("p/a.md")), ("p/a.pdf".into(), "p/a.pdf".into()));
        assert_eq!((s("books/dune.epub"), s("books/dune.md")), ("books/dune.md".into(), "books/dune.md".into()));
        assert_eq!(s("p/alone.png"), "p/alone.png");
        assert_eq!(s("n/plain.md"), "n/plain.md");
    }

    #[test]
    fn find_says_which_note_and_makes_none() {
        let (d, cfg) = vault();
        let find = |path: &str| ensure(d.path(), &cfg, &CompanionRequest { find: true, ..file(path) }, now()).unwrap();
        let r = find("books/quantum.epub");
        assert_eq!((r.path.as_str(), r.created), ("books/quantum.md", false));
        assert!(!d.path().join("books/quantum.md").exists());
        // a book inside a paper's folder: the paper's note (one note per thing)
        ensure(d.path(), &cfg, &paper(), now()).unwrap();
        assert_eq!(find("refs/papers/maier2005quantum/review.pdf").path, "refs/papers/maier2005quantum/maier2005quantum.md");
    }

    #[test]
    fn the_vaults_literature_template_shapes_the_note() {
        let (d, cfg) = vault();
        std::fs::create_dir_all(d.path().join("templates")).unwrap();
        std::fs::write(d.path().join("templates/literature.md"), "---\ntype: literature\ncreated: {{date}}\nsource:\nauthors:\nyear:\nup:\n---\n# {{title}}\n\n## What it says\n\n## What I think\n").unwrap();
        let r = ensure(d.path(), &cfg, &paper(), now()).unwrap();
        let text = std::fs::read_to_string(d.path().join(&r.path)).unwrap();
        assert_eq!(
            text,
            "---\ntype: literature\ncreated: 2026-10-14\nsource: https://doi.org/10.1103/RevModPhys.77.1027\nauthors:\n  - Maier, Thomas\n  - Jarrell, Mark\nyear: 2005\nup:\ncitekey: maier2005quantum\ntitle: 'Quantum cluster theories: a review'\n---\n# Quantum cluster theories: a review\n\n```view\ntype: library.paper\n```\n\n## What it says\n\n## What I think\n"
        );
    }

    #[test]
    fn the_template_s_own_names_are_used_one_date_and_sources_as_a_list() {
        let (d, cfg) = vault();
        std::fs::create_dir_all(d.path().join("templates")).unwrap();
        // the shape of the user's vault (templates/properties.yaml: `date` is the one stamp, `sources` a list)
        std::fs::write(d.path().join("templates/literature.md"), "---\ndate: {{date}} {{time}}\ntype: Literature\ncitekey:\nauthors:\nyear:\nsources:\n---\n# {{title}}\n").unwrap();
        let r = ensure(d.path(), &cfg, &paper(), now()).unwrap();
        let text = std::fs::read_to_string(d.path().join(&r.path)).unwrap();
        assert!(!text.contains("created:") && !text.contains("\nsource:"), "{text}");
        assert!(text.contains("type: Literature\n"), "the template's own value stays: {text}");
        assert!(text.contains("sources:\n  - https://doi.org/10.1103/RevModPhys.77.1027\n"), "{text}");
        assert!(text.contains("citekey: maier2005quantum\n"), "{text}");
    }

    #[test]
    fn a_legacy_notes_md_is_renamed_and_keeps_its_text() {
        let (d, cfg) = vault();
        let dir = d.path().join("refs/papers/maier2005quantum");
        std::fs::write(dir.join(LEGACY), "<div>Zotero note</div>\n").unwrap();
        let r = ensure(d.path(), &cfg, &paper(), now()).unwrap();
        assert_eq!(r.migrated_from.as_deref(), Some("refs/papers/maier2005quantum/notes.md"));
        assert!(!r.created && !dir.join(LEGACY).exists());
        let text = std::fs::read_to_string(dir.join("maier2005quantum.md")).unwrap();
        assert!(text.starts_with("---\ntype: literature\ncitekey: maier2005quantum\n"), "{text}");
        assert!(text.ends_with("```view\ntype: library.paper\n```\n\n<div>Zotero note</div>\n"), "{text}");
        // one that already has properties is renamed byte for byte; an empty one counts as none
        std::fs::remove_file(dir.join("maier2005quantum.md")).unwrap();
        std::fs::write(dir.join(LEGACY), "---\ntype: mine\n---\nkept\n").unwrap();
        ensure(d.path(), &cfg, &paper(), now()).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("maier2005quantum.md")).unwrap(), "---\ntype: mine\n---\nkept\n");
        std::fs::remove_file(dir.join("maier2005quantum.md")).unwrap();
        std::fs::write(dir.join(LEGACY), "").unwrap();
        ensure(d.path(), &cfg, &paper(), now()).unwrap();
        assert!(std::fs::read_to_string(dir.join("maier2005quantum.md")).unwrap().ends_with("## Notes\n\n"));
    }

    #[test]
    fn a_note_knows_its_pdf_beside_it_in_its_entry_or_by_its_block() {
        let d = tempfile::tempdir().unwrap();
        let w = |rel: &str, text: &str| { let p = d.path().join(rel); std::fs::create_dir_all(p.parent().unwrap()).unwrap(); std::fs::write(p, text).unwrap(); };
        w("books/x.pdf", "%PDF");
        w("books/x.md", "# x\n");
        w("refs/papers/k/b.pdf", "%PDF");
        w("refs/papers/k/a.pdf", "%PDF");
        w("refs/papers/k/k.md", "---\ncitekey: k\n---\n# k\n");
        w("notes/reading.md", "# r\n\n```view\ntype: pdf\npath: \"books/x.pdf\"\n```\n");
        w("notes/plain.md", "# p\n");
        assert_eq!(pdf_of_note(d.path(), "books/x.md").as_deref(), Some("books/x.pdf"));
        assert_eq!(pdf_of_note(d.path(), "refs/papers/k/k.md").as_deref(), Some("refs/papers/k/a.pdf"));
        assert_eq!(pdf_of_note(d.path(), "notes/reading.md").as_deref(), Some("books/x.pdf"));
        assert_eq!(pdf_of_note(d.path(), "notes/plain.md"), None);
    }
}
