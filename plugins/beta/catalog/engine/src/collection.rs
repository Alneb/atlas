//! A kind's collection (docs/design/DESIGN-collections.md): its folder, an Obsidian Bases file and an index page showing it
//! with the `catalog.library` block, plus one `Collections.md` home for all of them. Made once, with the kind's first
//! note; afterwards they are the user's files and are never rewritten (PHILOSOPHY §2).
use crate::engine::{Fail, Host};
use crate::kind::Kind;
use crate::model::{Narration, Stage};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const HOME: &str = "Collections.md";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Layout {
    /// one row per value of `group`, in the order of `shelves`
    Shelves,
    #[default]
    Grid,
    Table,
}

/// How a kind's library looks: `library:` in its kind file.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Library {
    /// the collection's name, for its base and index page ("Films"); default: the folder's last part
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub layout: Layout,
    /// the property the shelves are made of (`status`)
    #[serde(default)]
    pub group: Option<String>,
    /// the shelves in order; a new note goes on the first one, as a link (`status: "[[to-watch]]"`)
    #[serde(default)]
    pub shelves: Vec<String>,
    /// the property holding the picture (`poster`, `cover`)
    #[serde(default)]
    pub cover: Option<String>,
    /// the fields under each cover and at the top of the item's note
    #[serde(default)]
    pub key: Vec<String>,
    /// an Atlas icon name for the collection's tile and page
    #[serde(default)]
    pub icon: Option<String>,
    /// make the index page and `.base` with the first note (`false`: the vault has its own bases)
    #[serde(default = "yes")]
    pub index: bool,
    /// the library of Atlas's Library page this kind is a tab of (`in: Music`); none: one of its own (main.js `libraryOf`)
    #[serde(default, rename = "in", skip_serializing_if = "Option::is_none")]
    pub within: Option<String>,
}

fn yes() -> bool {
    true
}

impl Default for Library {
    fn default() -> Self {
        Library { title: None, layout: Layout::default(), group: None, shelves: Vec::new(), cover: None, key: Vec::new(), icon: None, index: true, within: None }
    }
}

impl Library {
    /// The shelf a new note starts on, as the property and its value (a link).
    pub fn first_shelf(&self) -> Option<(String, Value)> {
        Some((self.group.clone()?, Value::String(format!("[[{}]]", self.shelves.first()?))))
    }
}

/// The collection's name: its title, else the last part of its folder.
pub fn title(kind: &Kind) -> String {
    kind.library.title.clone().unwrap_or_else(|| {
        // the folder's last part, as a title ("notes/films" → "Films")
        let last = kind.folder.trim_end_matches('/').rsplit('/').next().unwrap_or(&kind.folder);
        let mut c = last.chars();
        c.next().map(|f| f.to_uppercase().chain(c).collect()).unwrap_or_default()
    })
}

fn yaml_str(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_default()
}

/// The Bases file: every note of the kind in its folder; views Shelves (when there is a group), Covers and Table.
pub fn base(kind: &Kind) -> String {
    let lib = &kind.library;
    let mut cols = vec!["file.name".to_string()];
    cols.extend(lib.key.iter().cloned());
    cols.extend(lib.group.iter().cloned());
    cols.dedup();
    let order = format!("[{}]", cols.join(", "));
    // the cards carry the picture as a column too: Obsidian reads `image`, Atlas's block reads the column
    let mut card_cols = cols.clone();
    card_cols.splice(1..1, lib.cover.iter().cloned());
    let cards = format!("[{}]", card_cols.join(", "));
    let image = lib.cover.as_ref().map(|c| format!("    image: note.{c}\n")).unwrap_or_default();
    let mut out = format!(
        "# The {} collection, made by the catalog with its first note (docs/design/DESIGN-collections.md). Yours to change.\nfilters:\n  and:\n    - file.inFolder({})\n    - type == {}\nviews:\n",
        title(kind),
        yaml_str(kind.folder.trim_end_matches('/')),
        yaml_str(kind.note_type())
    );
    if let Some(g) = &lib.group {
        out.push_str(&format!("  - type: cards\n    name: Shelves\n    groupBy:\n      property: note.{g}\n{image}    order: {cards}\n"));
    }
    out.push_str(&format!("  - type: cards\n    name: Covers\n{image}    order: {cards}\n    sort:\n      - property: file.ctime\n        direction: DESC\n"));
    out.push_str(&format!("  - type: table\n    name: Table\n    order: {order}\n"));
    out
}

/// The `catalog.library` block for a base, with the kind's look as its options.
pub fn library_block(kind: &Kind, base_path: &str) -> String {
    let lib = &kind.library;
    let mut out = format!("```view\ntype: catalog.library\nbase: {}\nlayout: {}\n", yaml_str(base_path), serde_json::to_value(lib.layout).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default());
    if let Some(g) = &lib.group {
        out.push_str(&format!("group: {g}\n"));
    }
    if !lib.shelves.is_empty() {
        out.push_str(&format!("shelves: [{}]\n", lib.shelves.iter().map(|s| yaml_str(s)).collect::<Vec<_>>().join(", ")));
    }
    if let Some(c) = &lib.cover {
        out.push_str(&format!("cover: {c}\n"));
    }
    if !lib.key.is_empty() {
        out.push_str(&format!("key: [{}]\n", lib.key.join(", ")));
    }
    out.push_str("```\n");
    out
}

pub fn index_page(kind: &Kind, base_path: &str) -> String {
    let icon = kind.library.icon.as_ref().map(|i| format!("icon: {i}\n")).unwrap_or_default();
    format!("---\ntype: collection\nkind: {}\n{icon}---\n\n{}", kind.name.as_str(), library_block(kind, base_path))
}

pub fn home() -> String {
    "---\ntype: collections\n---\n\n```view\ntype: catalog.collections\n```\n".to_string()
}

/// The collection's base, index page and the home, each made only when missing. Returns the index page's path.
pub fn ensure<H: Host + ?Sized>(host: &H, kind: &Kind, say: &mut Narration) -> Result<String, Fail> {
    let dir = kind.folder.trim_end_matches('/');
    let name = title(kind);
    if !kind.library.index {
        return Ok(format!("{dir}/{name}.md"));
    }
    let base_path = format!("{dir}/{name}.base");
    let index = format!("{dir}/{name}.md");
    let mut made = Vec::new();
    if !host.exists(&base_path)? {
        host.create(&base_path, &base(kind))?;
        made.push(base_path.clone());
    }
    if !host.exists(&index)? {
        host.create(&index, &index_page(kind, &base_path))?;
        made.push(index.clone());
    }
    if !host.exists(HOME)? {
        host.create(HOME, &home())?;
        made.push(HOME.to_string());
    }
    if !made.is_empty() {
        say.say(Stage::Write, format!("the first {} here: made its collection ({}), yours to change from now on", kind.label(), made.join(", ")));
    }
    Ok(index)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn film() -> Kind {
        serde_yaml::from_str(
            "name: movie\nlabel: Film\nfolder: Films\nids: [{ id: tmdb }]\nlibrary: { layout: shelves, group: status, shelves: [to-watch, watching, watched], cover: poster, key: [year, director, rating], icon: film }\n",
        )
        .unwrap()
    }

    #[test]
    fn a_kinds_collection_is_a_base_with_its_shelves_and_an_index_page_showing_it() {
        let k = film();
        let b = base(&k);
        assert!(b.contains("file.inFolder(\"Films\")") && b.contains("type == \"movie\""), "{b}");
        assert!(b.contains("name: Shelves\n    groupBy:\n      property: note.status\n    image: note.poster\n    order: [file.name, poster, year, director, rating, status]"), "{b}");
        assert!(b.contains("name: Covers") && b.contains("name: Table"));
        let base: serde_yaml::Value = serde_yaml::from_str(&b).expect("the base is YAML");
        assert_eq!(base["views"].as_sequence().unwrap().len(), 3);

        let page = index_page(&k, "Films/Films.base");
        assert!(page.starts_with("---\ntype: collection\nkind: movie\nicon: film\n---\n"), "{page}");
        assert!(page.contains("type: catalog.library\nbase: \"Films/Films.base\"\nlayout: shelves\ngroup: status\nshelves: [\"to-watch\", \"watching\", \"watched\"]\ncover: poster\nkey: [year, director, rating]\n"), "{page}");
        assert_eq!(k.library.first_shelf(), Some(("status".into(), Value::String("[[to-watch]]".into()))));
    }

    #[test]
    fn a_kind_without_shelves_gets_covers_and_a_table_only() {
        let k: Kind = serde_yaml::from_str("name: article\nfolder: Clips/Web\nids: [{ id: url }]\n").unwrap();
        assert_eq!(title(&k), "Web");
        let b = base(&k);
        assert!(!b.contains("Shelves") && b.contains("name: Covers"));
        assert_eq!(k.library.first_shelf(), None);
    }
}
