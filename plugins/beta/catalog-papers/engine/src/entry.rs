//! A reference's fields live in its note's properties: `<refs.dir>/<key>/<key>.md`. Zotero's field names are kept, except four the note already uses for its own meaning (RENAMED). The rest of
//! the crate sees Zotero-shaped mappings, as `info.yaml` had them; an `info.yaml` not folded yet is still read, and the
//! first write folds it into the note. Moved out of
//! the core with the rest of References (REFACTOR-references-plugin.md).
use atlas_text::frontmatter::{remove_property, set_property};
use serde_yaml::{Mapping, Value};
use std::path::Path;

/// Makes the note of a new entry (the core's companion note: the vault's literature template, the entry's title and
/// key) — the helper asks the core; tests write a plain one.
pub trait Companion {
    fn make(&self, dir: &Path, key: &str, m: &Mapping) -> Result<(), String>;
}

/// `<key>.md`: the entry's note, named after its folder (`[[citekey]]` links it).
pub fn note_file(key: &str) -> String {
    format!("{key}.md")
}

/// The file every entry had before 2026-10-18.
pub const LEGACY: &str = "info.yaml";
/// The name every entry's note had before 2026-10-14 (the Zotero import, older Atlas).
pub const LEGACY_NOTE: &str = "notes.md";
/// The block that draws the paper inside its note (the UI's `library.paper` block).
pub const BLOCK: &str = "```view\ntype: library.paper\n```\n";

/// Whether an entry's folder holds its note under either name.
pub fn has_note(dir: &Path, key: &str) -> bool {
    dir.join(note_file(key)).is_file() || dir.join(LEGACY_NOTE).is_file()
}

/// A new entry's note when the vault's own (its literature template, made by the core) cannot be had: the shape the
/// core gives one without a template — kind and key, title, the paper's block, a place to write.
pub fn plain_note(key: &str, title: &str, today: &str) -> String {
    let mut fm = "---\n---\n".to_string();
    for (k, v) in [("type", "literature"), ("citekey", key), ("title", title), ("created", today)] {
        fm = set_property(&fm, k, &Value::from(v));
    }
    format!("{fm}# {title}\n\n{BLOCK}\n## Notes\n\n")
}

/// What a new entry's note is made with (the core's `/api/companion`, in this order; the vault's template's own names
/// and values win there): the kind of note, the key, title, authors, year, and where to read it online.
pub fn companion_properties(key: &str, m: &Mapping) -> Mapping {
    // a number too: `date: 1963` is a YAML integer
    let get = |k: &str| {
        let v = match m.get(k)? {
            Value::String(s) => s.trim().to_string(),
            Value::Number(n) => n.to_string(),
            _ => return None,
        };
        (!v.is_empty()).then_some(v)
    };
    let source = get("DOI").map(|d| format!("https://doi.org/{d}")).or_else(|| crate::refs::arxiv_of(m).map(|a| format!("https://arxiv.org/abs/{a}"))).or_else(|| get("url"));
    let year = get("date").as_deref().and_then(crate::refs::year_of).and_then(|y| y.parse::<u64>().ok());
    let authors: Vec<Value> = m.get("author").and_then(Value::as_sequence).cloned().unwrap_or_default();
    let mut out = Mapping::new();
    out.insert("type".into(), "literature".into());
    out.insert("citekey".into(), get("citekey").unwrap_or_else(|| key.to_string()).into());
    out.insert("title".into(), get("title").unwrap_or_else(|| key.to_string()).into());
    if !authors.is_empty() {
        out.insert("authors".into(), Value::Sequence(authors));
    }
    if let Some(y) = year {
        out.insert("year".into(), y.into());
    }
    if let Some(s) = source {
        out.insert("source".into(), s.into());
    }
    out
}

/// Adds `text` at the end of the entry's note unless it is there already (a note sent from the browser).
pub fn append_note(dir: &Path, text: &str) -> Result<(), String> {
    let path = dir.join(note_file(&key_of(dir)));
    let old = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    if old.contains(text.trim()) {
        return Ok(());
    }
    std::fs::write(&path, format!("{}\n\n{}\n", old.trim_end(), text.trim())).map_err(|e| format!("{}: {e}", path.display()))
}

/// (Zotero's name, the note's): the note's `type` is its kind of note (literature), `date` when it was made, `tags`
/// its Obsidian tags; `authors` is the note's name for the same list.
pub const RENAMED: &[(&str, &str)] = &[("type", "itemType"), ("date", "published"), ("author", "authors"), ("tags", "keywords")];

fn note_name(z: &str) -> &str {
    RENAMED.iter().find(|(a, _)| *a == z).map_or(z, |(_, b)| b)
}

/// The note's own meaning of a name that is renamed (its `type`, `date`, `tags`): never read as the entry's.
fn own(note: &str) -> bool {
    RENAMED.iter().any(|(z, n)| *z == note && *n != note)
}

pub fn key_of(dir: &Path) -> String {
    dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

/// The note's frontmatter as a mapping (None: no note, or no properties).
fn note_props(text: &str) -> Option<Mapping> {
    let rest = text.strip_prefix("---\n")?;
    let end = rest.find("\n---").map(|i| i + 1).unwrap_or(0);
    serde_yaml::from_str::<Value>(&rest[..end]).ok()?.as_mapping().cloned()
}

/// The entry in `dir`, Zotero-shaped. None when the folder holds no entry: no `info.yaml`, and no note naming a
/// `citekey` or an `itemType`.
pub fn read(dir: &Path) -> Option<Mapping> {
    if let Ok(t) = std::fs::read_to_string(dir.join(LEGACY)) {
        return serde_yaml::from_str::<Value>(&t).ok()?.as_mapping().cloned();
    }
    let props = note_props(&std::fs::read_to_string(dir.join(note_file(&key_of(dir)))).ok()?)?;
    if !props.contains_key("citekey") && !props.contains_key("itemType") {
        return None;
    }
    let mut m = Mapping::new();
    for (k, v) in props {
        let Some(name) = k.as_str() else { continue };
        if own(name) {
            continue;
        }
        let z = RENAMED.iter().find(|(_, n)| *n == name).map_or(name, |(z, _)| z);
        m.insert(z.into(), v);
    }
    Some(m)
}

/// Writes the entry `m` (Zotero-shaped) into its note: the note is made first when missing (the vault's literature
/// template), each changed field set in place, a field the entry no longer has removed; the user's own properties
/// and text stay as they are. An `info.yaml` is folded in and removed.
pub fn write(made: &dyn Companion, dir: &Path, m: &Mapping) -> Result<(), String> {
    let old = read(dir).unwrap_or_default();
    let key = key_of(dir);
    let path = dir.join(note_file(&key));
    if !path.is_file() {
        made.make(dir, &key, m)?;
    }
    let before = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    let props = note_props(&before).unwrap_or_default();
    let mut text = before.clone();
    for (k, v) in m {
        let Some(z) = k.as_str() else { continue };
        let n = note_name(z);
        if props.get(n) != Some(v) {
            text = set_property(&text, n, v);
        }
    }
    for k in old.keys().filter_map(Value::as_str).filter(|k| !m.contains_key(*k)) {
        text = remove_property(&text, note_name(k));
    }
    if text != before {
        std::fs::write(&path, text).map_err(|e| format!("{}: {e}", path.display()))?;
    }
    match std::fs::remove_file(dir.join(LEGACY)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("{}: {e}", dir.join(LEGACY).display())),
        _ => Ok(()),
    }
}

/// Folds the entry's `info.yaml` into its note (`atlas refs fold`); false when there was none to fold.
pub fn fold(made: &dyn Companion, dir: &Path) -> Result<bool, String> {
    if !dir.join(LEGACY).is_file() {
        return Ok(false);
    }
    let m = read(dir).unwrap_or_default();
    write(made, dir, &m)?;
    Ok(true)
}

#[cfg(test)]
pub mod tests {
    use super::*;

    /// A plain note, as the core's companion makes it without a template.
    pub struct Plain;
    impl Companion for Plain {
        fn make(&self, dir: &Path, key: &str, m: &Mapping) -> Result<(), String> {
            let title = m.get("title").and_then(Value::as_str).unwrap_or(key);
            std::fs::write(dir.join(note_file(key)), plain_note(key, title, "2026-10-18")).map_err(|e| e.to_string())
        }
    }

    const NOTE: &str = "---\ndate: 2026-10-15 12:17\ntype: Literature\ncitekey: anderson1972more\nauthors:\n  - Anderson, P. W.\nyear: 1972\nstatus: \"[[to-read]]\"\ntitle: More Is Different\n---\n# More Is Different\n\nmy words\n";
    const INFO: &str = "title: More Is Different\ntype: journalArticle\nauthor:\n- Anderson, P. W.\ndate: 1972-08-04\nDOI: 10.1126/science.177.4047.393\ntags: [emergence]\ncitekey: anderson1972more\nfiles:\n- a.pdf\nabstractNote: |-\n  line one\n  line two\n";

    #[test]
    fn the_companion_properties_keep_their_order_and_a_year_given_as_a_number() {
        // the e2e vault's Hubbard entry: `date: 1963`, a YAML integer, no DOI
        let m: Mapping = serde_yaml::from_str("title: Electron correlations\nauthor:\n- Hubbard, J.\ndate: 1963\n").unwrap();
        let yaml = serde_yaml::to_string(&companion_properties("hubbard1963electron", &m)).unwrap();
        assert_eq!(yaml, "type: literature\ncitekey: hubbard1963electron\ntitle: Electron correlations\nauthors:\n- Hubbard, J.\nyear: 1963\n");
    }

    #[test]
    fn a_new_entrys_note_gets_its_key_title_authors_year_and_source() {
        let m: Mapping = serde_yaml::from_str(INFO).unwrap();
        let p = companion_properties("anderson1972more", &m);
        assert_eq!(
            serde_yaml::to_string(&p).unwrap(),
            "type: literature\ncitekey: anderson1972more\ntitle: More Is Different\nauthors:\n- Anderson, P. W.\nyear: 1972\nsource: https://doi.org/10.1126/science.177.4047.393\n"
        );
        let bare: Mapping = serde_yaml::from_str("title: T\nurl: https://arxiv.org/abs/2101.00001\n").unwrap();
        assert_eq!(companion_properties("k", &bare)["source"], "https://arxiv.org/abs/2101.00001");
    }

    fn entry() -> (tempfile::TempDir, std::path::PathBuf) {
        let d = tempfile::tempdir().unwrap();
        let dir = d.path().join("refs/papers/anderson1972more");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("anderson1972more.md"), NOTE).unwrap();
        std::fs::write(dir.join(LEGACY), INFO).unwrap();
        (d, dir)
    }

    #[test]
    fn info_yaml_is_folded_into_the_note_keeping_the_users_properties_and_text() {
        let (_d, dir) = entry();
        let before = read(&dir).unwrap();
        assert!(fold(&Plain, &dir).unwrap());
        assert!(!dir.join(LEGACY).exists());
        let text = std::fs::read_to_string(dir.join("anderson1972more.md")).unwrap();
        assert!(text.contains("type: Literature") && text.contains("date: 2026-10-15 12:17"), "the note's own type and date stay:\n{text}");
        assert!(text.contains("itemType: journalArticle") && text.contains("published: 1972-08-04") && text.contains("keywords:\n  - emergence"), "{text}");
        assert!(text.contains("status: \"[[to-read]]\"") && text.ends_with("# More Is Different\n\nmy words\n"), "{text}");
        let after = read(&dir).unwrap();
        for (k, v) in &before {
            assert_eq!(after.get(k), Some(v), "read back under Zotero's name, unchanged: {k:?}");
        }
        assert!(!fold(&Plain, &dir).unwrap(), "once");
    }

    #[test]
    fn a_write_changes_only_the_entrys_fields_and_removes_what_it_dropped() {
        let (_d, dir) = entry();
        fold(&Plain, &dir).unwrap();
        let mut m = read(&dir).unwrap();
        m.insert("type".into(), "book".into());
        m.remove("tags");
        write(&Plain, &dir, &m).unwrap();
        let text = std::fs::read_to_string(dir.join("anderson1972more.md")).unwrap();
        assert!(text.contains("itemType: book") && !text.contains("keywords") && text.contains("type: Literature"), "{text}");
        assert_eq!(read(&dir).unwrap().get("type").and_then(Value::as_str), Some("book"));
    }

    #[test]
    fn a_new_entry_gets_its_note_and_a_folder_without_one_is_no_entry() {
        let d = tempfile::tempdir().unwrap();
        let dir = d.path().join("refs/papers/kitaev2006");
        std::fs::create_dir_all(&dir).unwrap();
        assert!(read(&dir).is_none());
        let m: Mapping = serde_yaml::from_str("title: Anyons\ntype: journalArticle\ncitekey: kitaev2006\n").unwrap();
        write(&Plain, &dir, &m).unwrap();
        let text = std::fs::read_to_string(dir.join("kitaev2006.md")).unwrap();
        assert!(text.contains("itemType: journalArticle") && text.contains("library.paper"), "{text}");
        assert_eq!(read(&dir).unwrap().get("title").and_then(Value::as_str), Some("Anyons"));
        append_note(&dir, "from the browser").unwrap();
        append_note(&dir, "from the browser").unwrap();
        let text = std::fs::read_to_string(dir.join("kitaev2006.md")).unwrap();
        assert_eq!(text.matches("from the browser").count(), 1, "once: {text}");
        assert!(has_note(&dir, "kitaev2006"));
    }
}
