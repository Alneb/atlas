//! One companion note per thing (docs/design/DESIGN-shared-notes.md §4). Earlier versions left extra files beside a PDF or a book; this finds them (a dry run) and tidies
//! them (`apply`): the reading place merged into the note that owns the file, the extras to the Trash after a copy in
//! `.atlas/trash/<time>-companions/`. `atlas companions [--apply]`. A note holding anything of the user's is left.
use crate::{companion, config::Config, files, walk, Result, Workspace};
use serde_yaml::{Mapping, Value};
use std::path::Path;

/// What the books' readers write about where you are (books Shelf.java, view.js): moved as they are.
const READING_KEYS: [&str; 7] = ["progress", "reading_page", "reading_chapter", "reading_at", "last_read", "reader_options", "reader_bookmarks"];

#[derive(Debug, PartialEq)]
pub enum Tidy {
    /// drawing_note's note of a file's ink (`x.pdf.md` for `x.pdf.excalidraw`): the ink belongs to its file's note.
    InkNote { note: String },
    /// A reader's note (`chap.md`) beside a file whose note is another one (`owner`): its reading place moves there.
    ReadingNote { note: String, owner: String },
    /// `x.excalidraw.svg`, written beside a drawing on every save before.
    SvgExport { file: String },
    /// A manga series' `reading.json` once its note holds the place (`chapter_progress`, written by the plugin).
    OldReading { file: String },
    /// A drawing's note from before companions were hidden: it gets `shown: false` (stays where it is).
    Hide { note: String },
    /// A folder's `reading.json` of the books' reader from before notes (`{books: {path: {spine, at, progress, updated}}}`):
    /// each book's place into its note, then the file to the Trash (one with the library's themes stays).
    BooksReading { file: String },
}

impl Tidy {
    /// The file that goes to the Trash.
    pub fn path(&self) -> &str {
        match self {
            Tidy::InkNote { note } | Tidy::ReadingNote { note, .. } => note,
            Tidy::SvgExport { file } | Tidy::OldReading { file } => file,
            Tidy::Hide { note } => note,
            Tidy::BooksReading { file } => file,
        }
    }
    pub fn what(&self) -> String {
        match self {
            Tidy::InkNote { note } => format!("{note}: the note of a file's ink, to the Trash"),
            Tidy::ReadingNote { note, owner } => format!("{note}: its reading place into {owner}, then to the Trash"),
            Tidy::SvgExport { file } => format!("{file}: a drawing's SVG export, to the Trash"),
            Tidy::OldReading { file } => format!("{file}: where you are is in the series' note now, to the Trash"),
            Tidy::Hide { note } => format!("{note}: a drawing's note, hidden in the tree (shown: false)"),
            Tidy::BooksReading { file } => format!("{file}: each book's place into its note, then to the Trash"),
        }
    }
}

/// The note's properties and its body.
fn parts(text: &str) -> (Mapping, &str) {
    let (fm, body) = companion::split(text);
    (fm.and_then(|f| serde_yaml::from_str(f).ok()).unwrap_or_default(), body)
}

/// `[[target|alias]]` (a property's value) → `target`.
fn link(v: Option<&Value>) -> Option<&str> {
    let s = v?.as_str()?.trim().strip_prefix("[[")?.strip_suffix("]]")?;
    Some(s.split('|').next()?.trim())
}

/// A body with nothing of the user's: blank lines and headings only (a reader's new note: its title, "## Highlights").
fn empty(body: &str) -> bool {
    body.lines().all(|l| l.trim().is_empty() || l.starts_with('#'))
}

/// `dir/name` (a note's sibling).
fn beside(note: &str, name: &str) -> String {
    match note.rsplit_once('/') {
        Some((dir, _)) => format!("{dir}/{name}"),
        None => name.to_string(),
    }
}

/// What would be tidied, in the vault's order.
pub fn plan(root: &Path, cfg: &Config) -> Result<Vec<Tidy>> {
    let mut out = Vec::new();
    for (path, rel) in walk::files(root, cfg) {
        if let Some(drawing) = rel.strip_suffix(".svg").filter(|d| d.ends_with(".excalidraw")) {
            if root.join(drawing).is_file() {
                out.push(Tidy::SvgExport { file: rel });
            }
            continue;
        }
        if let Some(dir) = rel.strip_suffix("/reading.json") {
            let note = format!("{dir}/{}", companion::file_name(dir.rsplit('/').next().unwrap_or(dir)));
            let text = std::fs::read_to_string(root.join(&note)).unwrap_or_default();
            if parts(&text).0.contains_key("chapter_progress") {
                out.push(Tidy::OldReading { file: rel });
            } else if books_of(&path).is_some_and(|(_, themes)| !themes) {
                out.push(Tidy::BooksReading { file: rel });
            }
            continue;
        }
        if !rel.ends_with(".md") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        let (props, body) = parts(&text);
        if let Some(file) = link(props.get("drawing")).and_then(crate::drawing_note::ink_of) {
            if root.join(beside(&rel, file)).is_file() && empty(&crate::drawing_note::outside(body)) {
                out.push(Tidy::InkNote { note: rel });
            }
            continue;
        }
        if link(props.get("drawing")).is_some_and(|d| root.join(beside(&rel, d)).is_file()) && !props.contains_key("shown") {
            out.push(Tidy::Hide { note: rel });
            continue;
        }
        let Some(file) = link(props.get("pdf")).or_else(|| link(props.get("book"))) else { continue };
        if let Some(owner) = companion::entry_owner(root, &beside(&rel, file))? {
            if owner != rel && empty(body) {
                out.push(Tidy::ReadingNote { note: rel, owner });
            }
        }
    }
    Ok(out)
}

/// A books' reading.json: its books' places, and whether it also keeps the library's themes (then it stays).
fn books_of(path: &Path) -> Option<(serde_json::Map<String, serde_json::Value>, bool)> {
    let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()?;
    let books = v.get("books")?.as_object()?.clone();
    Some((books, v.get("themes").is_some()))
}

/// One book's place from a reading.json, as the readers keep it in the note (books Shelf.java `update`).
fn place_props(book: &str, e: &serde_json::Value) -> Mapping {
    let pdf = book.to_ascii_lowercase().ends_with(".pdf");
    let pct = |f: f64, d: i32| { let m = 10f64.powi(d); let v = (f * 100.0 * m).round() / m; if v.fract() == 0.0 { format!("{}%", v as i64) } else { format!("{v}%") } };
    let mut m = Mapping::new();
    if let Some(p) = e.get("progress").and_then(serde_json::Value::as_f64) { m.insert("progress".into(), Value::String(pct(p, 1))); }
    if let Some(s) = e.get("spine").and_then(serde_json::Value::as_i64) {
        m.insert(if pdf { "reading_page" } else { "reading_chapter" }.into(), Value::Number((s + 1).into()));
        if !pdf { m.insert("reading_at".into(), Value::String(pct(e.get("at").and_then(serde_json::Value::as_f64).unwrap_or(0.0), 2))); }
    }
    if let Some(u) = e.get("updated").and_then(serde_json::Value::as_str) { m.insert("last_read".into(), Value::String(u.split('.').next().unwrap_or(u).trim_end_matches('Z').to_string() + "Z")); }
    m
}

/// The reading place of `note` written into `owner`, key by key, unless the owner's is the newer one.
fn merge_reading(note: &Mapping, owner_text: &str) -> String {
    let (owner, _) = parts(owner_text);
    let when = |m: &Mapping| m.get("last_read").and_then(Value::as_str).unwrap_or("").to_string();
    if !when(&owner).is_empty() && when(&owner) >= when(note) {
        return owner_text.to_string();
    }
    READING_KEYS.iter().fold(owner_text.to_string(), |t, k| match note.get(*k) {
        Some(v) => crate::frontmatter::set_property(&t, k, v),
        None => t,
    })
}

/// The plan carried out: each file copied to `.atlas/trash/<time>-companions/` (owners too, before their edit), the
/// reading places merged, the extras to the Trash. → the snapshot folder, when anything was done.
pub fn apply(ws: &Workspace, plan: &[Tidy]) -> Result<Option<String>> {
    if plan.is_empty() {
        return Ok(None);
    }
    let snap = format!(".atlas/trash/{}-companions", chrono::Local::now().format("%Y%m%d-%H%M%S"));
    let keep = |rel: &str| -> Result<()> {
        crate::vault_write::copy(&ws.resolve(rel)?, &ws.root().join(&snap).join(rel))
    };
    for t in plan {
        if let Tidy::BooksReading { file } = t {
            for (book, e) in books_of(&ws.resolve(file)?).map(|(b, _)| b).unwrap_or_default() {
                let note = companion::entry_owner(ws.root(), &book)?.unwrap_or_else(|| {
                    let stem = book.rsplit_once('.').map_or(book.as_str(), |(s, _)| s);
                    format!("{stem}.md")
                });
                let props = place_props(&book, &e);
                let at = ws.resolve(&note)?;
                let text = std::fs::read_to_string(&at).unwrap_or_else(|_| format!("---\ntitle: '{}'\n---\n", book.rsplit('/').next().unwrap_or(&book).replace('\'', "''")));
                let merged = merge_reading(&props, &text);
                if merged != text {
                    if at.is_file() { keep(&note)?; }
                    crate::vault_write::write(&at, merged.as_bytes())?;
                }
            }
        }
        if let Tidy::ReadingNote { note, owner } = t {
            let (props, _) = parts(&std::fs::read_to_string(ws.resolve(note)?)?);
            let owner_text = std::fs::read_to_string(ws.resolve(owner)?)?;
            let merged = merge_reading(&props, &owner_text);
            if merged != owner_text {
                keep(owner)?;
                crate::vault_write::write(&ws.resolve(owner)?, merged.as_bytes())?;
            }
        }
        keep(t.path())?;
        if let Tidy::Hide { note } = t {
            let text = std::fs::read_to_string(ws.resolve(note)?)?;
            crate::vault_write::write(&ws.resolve(note)?, crate::frontmatter::set_property(&text, "shown", &Value::Bool(false)).as_bytes())?;
            continue;
        }
        files::trash(ws, t.path())?;
    }
    Ok(Some(snap))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pdf_keeps_one_note_and_its_ink() {
        let d = tempfile::tempdir().unwrap();
        let w = |rel: &str, text: &str| {
            let p = d.path().join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, text).unwrap();
        };
        let paper = "refs/papers/k";
        w(&format!("{paper}/k.md"), "---\ncitekey: k\nfiles:\n  - chap.pdf\n---\n# chap\n\nMy reading notes.\n");
        w(&format!("{paper}/chap.pdf"), "%PDF");
        w(&format!("{paper}/chap.md"), "---\npdf: '[[chap.pdf]]'\ntitle: 'chap'\nprogress: 40%\nreading_page: 12\nlast_read: 2026-10-18T13:40:07Z\n---\n# chap\n");
        w(&format!("{paper}/chap.pdf.excalidraw"), "{}");
        let ink_note = crate::drawing_note::note("chap.pdf.excalidraw", &Default::default(), None).unwrap();
        w(&format!("{paper}/chap.pdf.md"), &ink_note);
        w("notes/d.excalidraw", "{}");
        w("notes/d.excalidraw.svg", "<svg/>");
        w("notes/d.md", "---\ndrawing: '[[d.excalidraw]]'\npages: 1\n---\n"); // from before: hidden now
        // a manga series: its reading.json goes once the note has the place, not before
        w("manga/One Piece/One Piece.md", "---\ntitle: One Piece\nchapter_progress: '{\"ch 1.cbz\":\"read\"}'\n---\n");
        w("manga/One Piece/reading.json", "{}");
        w("manga/Berserk/reading.json", "{}");
        // the books' reader of before notes: a paper's place into the paper's note, then the file goes
        w("refs/papers/z/z.md", "---\ncitekey: z\n---\n# Z\n");
        w("refs/papers/z/z.pdf", "%PDF");
        w("refs/papers/z/reading.json", r#"{"books": {"refs/papers/z/z.pdf": {"spine": 4, "at": 0, "progress": 0.103, "updated": "2026-10-18T11:59:40.479311Z"}}}"#);
        w("books/reading.json", r#"{"books": {}, "themes": {"night": {}}}"#); // the library's themes: stays
        // the user's own writing around a generated part: left
        w("notes/b.epub", "PK");
        w("notes/b.epub.excalidraw", "{}");
        w("notes/b.epub.md", &format!("{}\nMine.\n", crate::drawing_note::note("b.epub.excalidraw", &Default::default(), None).unwrap()));
        let ws = Workspace::open(d.path()).unwrap();
        let plan = plan(d.path(), &ws.config().unwrap()).unwrap();
        let mut got: Vec<&Tidy> = plan.iter().collect();
        got.sort_by_key(|t| t.path().to_string());
        assert_eq!(got, [
            &Tidy::OldReading { file: "manga/One Piece/reading.json".into() },
            &Tidy::SvgExport { file: "notes/d.excalidraw.svg".into() },
            &Tidy::Hide { note: "notes/d.md".into() },
            &Tidy::ReadingNote { note: format!("{paper}/chap.md"), owner: format!("{paper}/k.md") },
            &Tidy::InkNote { note: format!("{paper}/chap.pdf.md") },
            &Tidy::BooksReading { file: "refs/papers/z/reading.json".into() },
        ]);
        let snap = apply(&ws, &plan).unwrap().unwrap();
        let owner = std::fs::read_to_string(d.path().join(format!("{paper}/k.md"))).unwrap();
        assert!(owner.contains("reading_page: 12") && owner.contains("progress: 40%") && owner.contains("My reading notes."), "{owner}");
        assert!(std::fs::read_to_string(d.path().join("notes/d.md")).unwrap().contains("shown: false"));
        let z = std::fs::read_to_string(d.path().join("refs/papers/z/z.md")).unwrap();
        assert!(z.contains("reading_page: 5") && z.contains("progress: 10.3%") && z.contains("last_read: 2026-10-18T11:59:40Z"), "{z}");
        for t in plan.iter().filter(|t| !matches!(t, Tidy::Hide { .. })) {
            assert!(!d.path().join(t.path()).exists(), "{} gone", t.path());
            assert!(d.path().join(&snap).join(t.path()).exists(), "{} kept in the snapshot", t.path());
        }
        assert!(d.path().join(format!("{paper}/chap.pdf.excalidraw")).exists() && d.path().join("notes/b.epub.md").exists());
        assert!(plan_is_done(&ws), "a second run finds nothing");
    }

    fn plan_is_done(ws: &Workspace) -> bool {
        plan(ws.root(), &ws.config().unwrap()).unwrap().is_empty()
    }
}
