//! A drawing's companion note (PHILOSOPHY §1: a thing that is not Markdown gets a note): `x.excalidraw` → `x.md`
//! beside it, as the books plugin keeps `x.epub` → `x.md`. What the drawing holds becomes linkable and searchable
//! there: properties (the drawing, its page count), the drawing itself as an embed, then its pages, the notes its
//! elements link to (so they get the drawing in their backlinks) and its text. Written on every save of the drawing,
//! by the desktop (`file_put`) and by the Boox's Notepad (JNI), from this one function.
//!
//! The note is the user's too: only the frontmatter keys below and the part between the two markers are Atlas's;
//! anything written around them stays. A `x.md` that does not name the drawing in `drawing:` is someone else's note
//! and is never touched. The output depends only on the drawing (no dates), so two devices write the same note.
use serde_json::Value;

const START: &str = "<!-- atlas:drawing — written from the drawing on each save; write outside these lines -->";
const END: &str = "<!-- /atlas:drawing -->";

/// `notes/a.excalidraw` → `notes/a.md`; None for anything that is not a drawing.
pub fn note_path(drawing: &str) -> Option<String> {
    let stem = drawing.strip_suffix(".excalidraw")?;
    (!stem.is_empty() && !stem.ends_with('/')).then(|| format!("{stem}.md"))
}

/// `chap.pdf.excalidraw` → `chap.pdf`: a drawing that is a file's ink (a PDF's or a book's pages drawn on), which gets
/// no note of its own — the file's note is the one. None for a drawing.
pub fn ink_of(drawing: &str) -> Option<&str> {
    let file = drawing.strip_suffix(".excalidraw")?;
    let ext = file.rsplit('/').next()?.rsplit_once('.')?.1;
    // an extension has a letter: `lecture 14.37.13.excalidraw` (Obsidian's timestamped names) is a drawing
    let is_ext = ext.len() <= 8 && ext.chars().all(|c| c.is_ascii_alphanumeric()) && ext.chars().any(|c| c.is_ascii_alphabetic());
    (is_ext && !ext.eq_ignore_ascii_case("md")).then_some(file)
}

/// A note's body without the generated part: what the user wrote around it.
pub fn outside(body: &str) -> String {
    match (body.find(START), body.find(END)) {
        (Some(a), Some(b)) if a < b => format!("{}{}", &body[..a], &body[b + END.len()..]),
        _ => body.to_string(),
    }
}

/// What a drawing holds that a note can show: its pages (frames, in reading order), the notes its elements link to
/// (`[[note]]` links and wikilinks inside text, first seen first), its text elements.
#[derive(Debug, Default, PartialEq)]
pub struct Facts {
    pub pages: Vec<String>,
    pub links: Vec<String>,
    pub texts: Vec<String>,
}

/// `[[target#part|alias]]` → `target` for each wikilink in `s`.
fn wikilinks(s: &str) -> impl Iterator<Item = &str> {
    s.split("[[").skip(1).filter_map(|rest| {
        let inner = &rest[..rest.find("]]")?];
        let target = inner.split(['|', '#']).next()?.trim();
        (!target.is_empty()).then_some(target)
    })
}

pub fn facts(scene: &Value) -> Facts {
    let live: Vec<&Value> = scene["elements"].as_array().map(|a| a.iter().filter(|e| e["isDeleted"] != true).collect()).unwrap_or_default();
    let num = |e: &Value, k: &str| e[k].as_f64().unwrap_or(0.0);
    // pages: frames top to bottom, then left to right (ui/src/lib/draw-pages.ts pagesOf); unnamed ones are "Page N"
    let mut frames: Vec<&Value> = live.iter().copied().filter(|e| e["type"] == "frame").collect();
    frames.sort_by(|a, b| num(a, "y").total_cmp(&num(b, "y")).then(num(a, "x").total_cmp(&num(b, "x"))));
    let pages = frames
        .iter()
        .enumerate()
        .map(|(i, f)| f["name"].as_str().map(str::trim).filter(|n| !n.is_empty()).map_or_else(|| format!("Page {}", i + 1), String::from))
        .collect();
    let mut links: Vec<String> = Vec::new();
    let mut texts = Vec::new();
    let mut add = |t: &str| {
        if !links.iter().any(|l| l == t) {
            links.push(t.to_string());
        }
    };
    for e in &live {
        if let Some(l) = e["link"].as_str() {
            wikilinks(l).for_each(&mut add);
        }
        if e["type"] == "text" {
            // the text as typed (`originalText` keeps no wrapping), one line per paragraph
            let t = e["originalText"].as_str().or(e["text"].as_str()).unwrap_or("").trim();
            if !t.is_empty() {
                wikilinks(t).for_each(&mut add);
                texts.push(t.split_whitespace().collect::<Vec<_>>().join(" "));
            }
        }
    }
    Facts { pages, links, texts }
}

/// The frontmatter's lines (empty without one).
fn frontmatter(text: &str) -> &str {
    atlas_text::frontmatter::split(text).0.unwrap_or("")
}

/// Atlas's part of the body, between the markers.
fn generated(name: &str, f: &Facts) -> String {
    let mut out = format!("{START}\n![[{name}]]\n");
    if !f.pages.is_empty() {
        out.push_str("\n## Pages\n\n");
        for p in &f.pages {
            out.push_str(&format!("- [[{name}#{p}|{p}]]\n"));
        }
    }
    if !f.links.is_empty() {
        out.push_str("\n## Links\n\n");
        for l in &f.links {
            out.push_str(&format!("- [[{l}]]\n"));
        }
    }
    if !f.texts.is_empty() {
        out.push_str("\n## Text\n\n");
        for t in &f.texts {
            out.push_str(&format!("> {t}\n\n"));
        }
        out.pop();
    }
    out.push_str(END);
    out
}

/// The companion note for drawing `name` (its file name) with these facts, given what the note holds now: Some(new
/// text) when it should be written, None when it is already right or is not the drawing's note.
pub fn note(name: &str, f: &Facts, existing: Option<&str>) -> Option<String> {
    let link = format!("[[{name}]]");
    let body = generated(name, f);
    let props = |text: &str| {
        let t = crate::frontmatter::set_property(text, "drawing", &serde_yaml::Value::String(link.clone()));
        crate::frontmatter::set_property(&t, "pages", &serde_yaml::Value::from(f.pages.len() as u64))
    };
    let new = match existing {
        // a new note is a hidden companion (the drawing is what you meet); `shown: true` makes it a note of the tree
        None => crate::frontmatter::set_property(&props(&format!("{body}\n")), "shown", &serde_yaml::Value::Bool(false)),
        Some(text) => {
            if !frontmatter(text).lines().any(|l| l.starts_with("drawing:") && l.contains(&link)) {
                return None; // a note of the same name the user wrote: not ours
            }
            let replaced = match (text.find(START), text.find(END)) {
                (Some(a), Some(b)) if a < b => format!("{}{body}{}", &text[..a], &text[b + END.len()..]),
                _ => format!("{}\n{body}\n", text.trim_end()), // the markers were deleted: put the part back at the end
            };
            props(&replaced)
        }
    };
    (existing != Some(new.as_str())).then_some(new)
}

/// Drawing `from` was renamed or moved to `to`: its companion note goes with it (`a.md` → `b.md`), its `drawing:` link
/// naming the new file. A note of that name that
/// is not the drawing's, or a note already at the new place, stays where it is. The new note's path when it moved.
pub fn moved(ws: &crate::Workspace, from: &str, to: &str) -> crate::Result<Option<String>> {
    let (Some(old), Some(new)) = (note_path(from), note_path(to)) else { return Ok(None) };
    let (a, b) = (ws.resolve(&old)?, ws.resolve(&new)?);
    let Ok(text) = std::fs::read_to_string(&a) else { return Ok(None) };
    let old_link = format!("[[{}]]", from.rsplit('/').next().unwrap_or(from));
    if b.exists() || !frontmatter(&text).lines().any(|l| l.starts_with("drawing:") && l.contains(&old_link)) {
        return Ok(None);
    }
    let link = format!("[[{}]]", to.rsplit('/').next().unwrap_or(to));
    crate::vault_write::write(&b, crate::frontmatter::set_property(&text, "drawing", &serde_yaml::Value::String(link)).as_bytes())?;
    crate::vault_write::remove_file(&a)?;
    Ok(Some(new))
}

/// After drawing `rel` was saved with `scene` (its JSON text): its companion note brought up to date. Returns the
/// note's path when it was written. A scene that is not JSON writes nothing (the drawing is saved all the same).
pub fn update(ws: &crate::Workspace, rel: &str, scene: &str) -> crate::Result<Option<String>> {
    let Some(path) = note_path(rel) else { return Ok(None) };
    if ink_of(rel).is_some_and(|file| ws.resolve(file).is_ok_and(|p| p.is_file())) {
        return Ok(None); // a file's ink: its file's note is the one
    }
    let Ok(scene) = serde_json::from_str::<Value>(scene) else { return Ok(None) };
    let name = rel.rsplit('/').next().unwrap_or(rel);
    let existing = std::fs::read_to_string(ws.resolve(&path)?).ok();
    let Some(text) = note(name, &facts(&scene), existing.as_deref()) else { return Ok(None) };
    let req = crate::api::FileWrite { path: path.clone(), text, base_mtime: None, only_new: false, apply_here: false };
    crate::files::write_text(ws, &req)?;
    Ok(Some(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_renamed_drawing_takes_its_note_along() {
        let d = tempfile::tempdir().unwrap();
        let ws = crate::Workspace::open(d.path()).unwrap();
        std::fs::create_dir_all(d.path().join("notes")).unwrap();
        std::fs::write(d.path().join("notes/a.excalidraw"), "{}").unwrap();
        std::fs::write(d.path().join("notes/a.md"), "---\ndrawing: '[[a.excalidraw]]'\ntags: [qft]\n---\nmine\n").unwrap();
        crate::files::move_path(&ws, "notes/a.excalidraw", "notes/b.excalidraw").unwrap();
        assert!(!d.path().join("notes/a.md").exists());
        let note = std::fs::read_to_string(d.path().join("notes/b.md")).unwrap();
        assert!(note.contains("[[b.excalidraw]]") && note.contains("qft") && note.contains("mine"), "{note}");
        // a note of the same name that is not the drawing's stays
        std::fs::write(d.path().join("notes/c.excalidraw"), "{}").unwrap();
        std::fs::write(d.path().join("notes/c.md"), "# my own c\n").unwrap();
        crate::files::move_path(&ws, "notes/c.excalidraw", "notes/e.excalidraw").unwrap();
        assert!(d.path().join("notes/c.md").exists() && !d.path().join("notes/e.md").exists());
    }

    fn scene() -> Value {
        json!({ "type": "excalidraw", "elements": [
            { "id": "f2", "type": "frame", "x": 0, "y": 1171, "name": null },
            { "id": "f1", "type": "frame", "x": 0, "y": 0, "name": "Intro" },
            { "id": "s", "type": "freedraw", "x": 5, "y": 5, "link": "[[Quantum field theory#Gauge|QFT]]" },
            { "id": "t", "type": "text", "x": 5, "y": 50, "text": "see [[Peskin]]\nch. 3", "originalText": "see [[Peskin]]\nch. 3" },
            { "id": "d", "type": "text", "x": 5, "y": 90, "text": "gone", "isDeleted": true },
        ]})
    }

    #[test]
    fn a_files_ink_gets_no_note_of_its_own() {
        assert_eq!(ink_of("refs/k/chap_rg.pdf.excalidraw"), Some("refs/k/chap_rg.pdf"));
        assert_eq!(ink_of("books/q.epub.excalidraw"), Some("books/q.epub"));
        assert_eq!(ink_of("notes/drawings/2026-10-18-132320.excalidraw"), None);
        assert_eq!(ink_of("notes/v1.2 plan.excalidraw"), None, "a name with a dot is not a file's");
        assert_eq!(ink_of("notes/attachments/2024 exam 2025-11-24 14.37.13.excalidraw"), None, "a time is not an extension");
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("chap.pdf"), "%PDF").unwrap();
        let ws = crate::Workspace::open(d.path()).unwrap();
        assert_eq!(update(&ws, "chap.pdf.excalidraw", "{\"elements\": []}").unwrap(), None);
        assert!(!d.path().join("chap.pdf.md").exists());
        assert_eq!(update(&ws, "plan.excalidraw", "{\"elements\": []}").unwrap().as_deref(), Some("plan.md"));
    }

    #[test]
    fn a_drawing_note_is_named_beside_it() {
        assert_eq!(note_path("notes/lectures/qft 1.excalidraw").as_deref(), Some("notes/lectures/qft 1.md"));
        assert_eq!(note_path("notes/a.png"), None);
        assert_eq!(note_path("notes/.excalidraw"), None);
    }

    #[test]
    fn the_facts_are_pages_links_and_text() {
        let f = facts(&scene());
        assert_eq!(f.pages, ["Intro", "Page 2"]);
        assert_eq!(f.links, ["Quantum field theory", "Peskin"]);
        assert_eq!(f.texts, ["see [[Peskin]] ch. 3"]);
    }

    #[test]
    fn a_new_note_then_the_users_writing_kept() {
        let f = facts(&scene());
        let first = note("qft 1.excalidraw", &f, None).unwrap();
        assert!(first.starts_with("---\ndrawing: '[[qft 1.excalidraw]]'\npages: 2\nshown: false\n---\n"), "{first}");
        assert!(first.contains("![[qft 1.excalidraw]]") && first.contains("- [[qft 1.excalidraw#Intro|Intro]]") && first.contains("- [[Peskin]]"));
        assert_eq!(note("qft 1.excalidraw", &f, Some(&first)), None, "already right: not written again");

        let mine = first.replace("---\n<!--", "---\n# My lecture\n\nWhat I think.\n\n<!--").replace("shown: false\n", "shown: true\ntags: [lecture]\n") + "\nAfter.\n";
        let fewer = Facts { pages: vec!["Intro".into()], ..Facts::default() };
        let next = note("qft 1.excalidraw", &fewer, Some(&mine)).unwrap();
        assert!(next.contains("# My lecture\n\nWhat I think.\n\n<!-- atlas:drawing") && next.ends_with("<!-- /atlas:drawing -->\n\nAfter.\n"), "{next}");
        assert!(next.contains("pages: 1") && next.contains("tags: [lecture]") && !next.contains("[[Peskin]]"), "{next}");
        assert!(next.contains("shown: true"), "the user's choice to show it is kept: {next}");
    }

    #[test]
    fn a_note_that_is_not_the_drawings_is_left_alone() {
        assert_eq!(note("qft 1.excalidraw", &Facts::default(), Some("# qft 1\n\nmy own note\n")), None);
    }
}
