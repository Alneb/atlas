//! Kinds: what a thing is, where its note lives, which IDs identify it and which properties the catalog owns.
//! Three origins, later ones winning by name: the catalog's own (`article`), a subplugin's `kinds = [...]`, and the
//! vault's `.atlas/kinds/<name>.yaml` — so a vault can rename a folder or reorder sources without touching a plugin.
use crate::model::{Fields, IdName, Ids, KindName, PluginId};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub const KINDS_DIR: &str = ".atlas/kinds";
/// The catalog's own kind: any web page, what a link is when nothing knows more.
pub const WEB_PAGE: &str = "article";

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Kind {
    pub name: KindName,
    /// shown in the preview card and the library ("Film"); default: the name
    #[serde(default)]
    pub label: Option<String>,
    /// the library: where new notes of this kind go
    pub folder: String,
    /// the note's file name from its fields: `{title} ({year})`; a missing field drops its brackets
    #[serde(default = "default_note_name")]
    pub note_name: String,
    /// the IDs that identify a thing of this kind, in order of trust, and where each lives in the note
    pub ids: Vec<IdProperty>,
    /// the properties the catalog writes and refreshes; every other property, and the body, are the user's.
    /// Empty: every field a source gave.
    #[serde(default)]
    pub properties: Vec<String>,
    /// per field, the sources to prefer in order (`"*"`: any field); a source not listed ranks by its own priority
    #[serde(default)]
    pub priority: BTreeMap<String, Vec<PluginId>>,
    /// the note's `type:` property (default: the kind's name; the paper notes say `literature`)
    #[serde(default, rename = "type")]
    pub note_type: Option<String>,
    /// the block that shows the thing in its note
    #[serde(default = "default_block")]
    pub block: String,
    /// who writes the note: the catalog, or a feature that already owns these notes (PHILOSOPHY §2)
    #[serde(default)]
    pub writer: Writer,
    /// the linked services for this kind: `{ catalog-linkwarden: { collection: Films } }`, or `false` to leave one out
    #[serde(default)]
    pub links: BTreeMap<PluginId, crate::rules::LinkChoice>,
    /// a vault note whose text is a new note's body: `{{field}}` filled in, `{{block}}` the kind's block
    #[serde(default)]
    pub template: Option<String>,
    /// without a template: the field written under the block as the note's text (a web page's readable text)
    #[serde(default)]
    pub body: Option<String>,
    /// how its collection looks: layout, shelves, cover, key fields (docs/design/DESIGN-collections.md)
    #[serde(default)]
    pub library: crate::collection::Library,
    /// a field written under this vault's own property name: `{ cast: actors, cover: poster }`
    #[serde(default)]
    pub rename: BTreeMap<String, String>,
    /// fields written as `[[links]]` (people, genres): each name a note of its own
    #[serde(default)]
    pub as_links: Vec<String>,
    /// properties a new note starts with, never refreshed: `{ topics: ["[[Cinema]]"], date: "{now}" }`
    /// (`{today}` → 2026-10-17, `{now}` → 2026-10-17 13:45)
    #[serde(default)]
    pub set: Fields,
    /// languages (`es`) in which a thing keeps its original title, the translated one kept as `aka`
    #[serde(default)]
    pub original_title: Vec<String>,
}

/// An ID and the property that holds it: `{ id: doi, property: source, prefix: "https://doi.org/" }` reads and writes
/// `source: https://doi.org/10.…`, as the paper notes already do.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct IdProperty {
    pub id: IdName,
    #[serde(default)]
    pub property: Option<String>,
    #[serde(default)]
    pub prefix: String,
}

impl IdProperty {
    pub fn property(&self) -> &str {
        self.property.as_deref().unwrap_or(self.id.as_str())
    }
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize, Serialize)]
#[serde(tag = "by", rename_all = "lowercase", deny_unknown_fields)]
pub enum Writer {
    /// the catalog writes `<folder>/<note_name>.md`
    #[default]
    Catalog,
    /// a plugin's tool writes the note and answers `{ path }` (papers: Zotero, then the paper-note generator)
    Plugin { plugin: PluginId, tool: String },
}

fn default_note_name() -> String {
    "{title}".into()
}
fn default_block() -> String {
    "catalog.item".into()
}

impl Kind {
    pub fn label(&self) -> &str {
        self.label.as_deref().unwrap_or(self.name.as_str())
    }

    pub fn note_type(&self) -> &str {
        self.note_type.as_deref().unwrap_or(self.name.as_str())
    }

    pub fn owns(&self, property: &str) -> bool {
        let field = self.field_of(property);
        self.properties.is_empty() || self.properties.iter().any(|p| p == field) || self.ids.iter().any(|i| i.property() == property)
    }

    /// The property a field is written as in this vault (`cast` → `actors`).
    pub fn property_of<'a>(&'a self, field: &'a str) -> &'a str {
        self.rename.get(field).map(String::as_str).unwrap_or(field)
    }

    /// The field a property holds (`actors` → `cast`): the inverse of `property_of`.
    pub fn field_of<'a>(&'a self, property: &'a str) -> &'a str {
        self.rename.iter().find(|(_, p)| *p == property).map(|(f, _)| f.as_str()).unwrap_or(property)
    }

    /// A field's value as this vault writes it: names as `[[links]]` when the kind says so.
    pub fn shown(&self, field: &str, v: &Value) -> Value {
        if !self.as_links.iter().any(|f| f == field) {
            return v.clone();
        }
        let link = |x: &Value| match x {
            Value::String(s) if !s.trim().is_empty() && !s.trim_start().starts_with("[[") => Value::String(format!("[[{}]]", s.trim().replace(['[', ']', '|', '#'], ""))),
            x => x.clone(),
        };
        match v {
            Value::Array(a) => Value::Array(a.iter().map(link).collect()),
            v => link(v),
        }
    }

    /// The IDs a note's properties carry (prefixes stripped, values normalised).
    pub fn ids_in(&self, props: &Fields) -> Ids {
        let mut out = Ids::new();
        for i in &self.ids {
            let Some(v) = props.get(i.property()).and_then(Value::as_str) else { continue };
            let Some(v) = v.trim().strip_prefix(i.prefix.as_str()) else { continue };
            if !v.is_empty() {
                out.entry(i.id.clone()).or_insert_with(|| crate::model::normalise(&i.id, v));
            }
        }
        out
    }

    /// The properties that hold `ids` (the first ID wins a property two IDs share, as `source` for doi and arxiv).
    pub fn id_properties(&self, ids: &Ids) -> Vec<(String, String)> {
        let mut out: Vec<(String, String)> = Vec::new();
        for i in &self.ids {
            let Some(v) = ids.get(&i.id) else { continue };
            if out.iter().all(|(p, _)| p != i.property()) {
                out.push((i.property().to_string(), format!("{}{v}", i.prefix)));
            }
        }
        out
    }

    /// The note's path for these fields: `<folder>/<note_name>.md`, the name safe as a file name and a wikilink.
    pub fn note_path(&self, fields: &Fields) -> String {
        self.note_path_in(&self.folder, fields)
    }

    /// The same in another folder (a rule's).
    pub fn note_path_in(&self, folder: &str, fields: &Fields) -> String {
        let name = fill(&self.note_name, fields);
        let name = if name.is_empty() { "Untitled".to_string() } else { name };
        format!("{}/{}.md", folder.trim_end_matches('/'), name)
    }
}

/// `{title} ({year})` with the fields: a placeholder without a value takes its surrounding brackets with it;
/// characters a file name or a wikilink cannot hold become spaces.
fn fill(template: &str, fields: &Fields) -> String {
    let re = regex::Regex::new(r"(\(\s*)?\{(\w+)\}(\s*\))?").expect("static pattern");
    let filled = re.replace_all(template, |c: &regex::Captures| {
        let v = fields.get(&c[2]).map(text_of).unwrap_or_default();
        if v.is_empty() {
            String::new()
        } else {
            format!("{}{v}{}", c.get(1).map_or("", |m| m.as_str()), c.get(3).map_or("", |m| m.as_str()))
        }
    });
    let safe: String = filled.chars().map(|c| if "/\\:*?\"<>|#^[]\n\r\t".contains(c) { ' ' } else { c }).collect();
    let words: Vec<&str> = safe.split_whitespace().collect();
    let mut name = words.join(" ");
    name.truncate(name.char_indices().nth(120).map_or(name.len(), |(i, _)| i));
    name.trim_end_matches(['.', ' ']).to_string()
}

/// A field as plain text: strings as they are, numbers printed, a list's first element.
pub fn text_of(v: &Value) -> String {
    match v {
        Value::String(s) => s.trim().to_string(),
        Value::Number(n) => n.to_string(),
        Value::Array(a) => a.first().map(text_of).unwrap_or_default(),
        _ => String::new(),
    }
}

/// The kind files built into the engine (`engine/kinds/*.yaml`).
const SHIPPED: &[(&str, &str)] = &[
    ("movie.yaml", include_str!("../kinds/movie.yaml")),
    ("show.yaml", include_str!("../kinds/show.yaml")),
    ("video.yaml", include_str!("../kinds/video.yaml")),
    ("song.yaml", include_str!("../kinds/song.yaml")),
    ("album.yaml", include_str!("../kinds/album.yaml")),
    ("artist.yaml", include_str!("../kinds/artist.yaml")),
    ("book.yaml", include_str!("../kinds/book.yaml")),
    ("science_book.yaml", include_str!("../kinds/science_book.yaml")),
    ("manga.yaml", include_str!("../kinds/manga.yaml")),
    ("anime.yaml", include_str!("../kinds/anime.yaml")),
];

/// Where a kind came from, so Settings and the log can say why it looks the way it does.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "from", content = "where", rename_all = "lowercase")]
pub enum Origin {
    Catalog,
    Plugin(PluginId),
    Vault(String),
}

/// Every kind known, by name; the later origin wins.
#[derive(Debug, Clone, Default)]
pub struct Kinds(BTreeMap<KindName, (Kind, Origin)>);

impl Kinds {
    /// The catalog's own kinds: any web page, and the files in `engine/kinds/` (film, series, video, song, album, artist,
    /// book, manga, anime) — so a film is a film whichever sources are switched on; sources only add what they know.
    pub fn builtin() -> Kinds {
        let mut k = Kinds::default();
        for (file, text) in SHIPPED {
            let kind = Kinds::parse_vault_file(file, text).unwrap_or_else(|e| panic!("a shipped kind file is broken: {e}"));
            k.put(kind, Origin::Catalog);
        }
        k.put(
            Kind {
                name: KindName::new(WEB_PAGE),
                label: Some("Web page".into()),
                folder: "notes/clips".into(),
                note_name: default_note_name(),
                ids: vec![IdProperty { id: IdName::new("url"), property: Some("source".into()), prefix: String::new() }],
                properties: ["type", "title", "site", "author", "published", "description", "cover"].map(String::from).to_vec(),
                priority: BTreeMap::new(),
                note_type: None,
                block: default_block(),
                writer: Writer::Catalog,
                links: BTreeMap::new(),
                template: None,
                body: Some("text".into()),
                library: crate::collection::Library { title: Some("Web pages".into()), cover: Some("cover".into()), key: vec!["site".into(), "published".into()], icon: Some("globe".into()), ..Default::default() },
                rename: BTreeMap::new(),
                as_links: Vec::new(),
                set: Fields::new(),
                original_title: Vec::new(),
            },
            Origin::Catalog,
        );
        k
    }

    pub fn put(&mut self, kind: Kind, origin: Origin) {
        self.0.insert(kind.name.clone(), (kind, origin));
    }

    pub fn get(&self, name: &KindName) -> Option<&Kind> {
        self.0.get(name).map(|(k, _)| k)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&Kind, &Origin)> {
        self.0.values().map(|(k, o)| (k, o))
    }

    /// A vault's `.atlas/kinds/<name>.yaml`; the file name must match `name:` so a kind has one file.
    pub fn parse_vault_file(path: &str, text: &str) -> Result<Kind, String> {
        let kind: Kind = serde_yaml::from_str(text).map_err(|e| format!("{path}: {e}"))?;
        let stem = path.rsplit('/').next().unwrap_or(path).trim_end_matches(".yaml").trim_end_matches(".yml");
        if stem != kind.name.as_str() {
            return Err(format!("{path}: the file is named {stem:?} but declares the kind {:?}", kind.name.as_str()));
        }
        Ok(kind)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fields(v: Value) -> Fields {
        serde_json::from_value(v).unwrap()
    }

    #[test]
    fn note_names_drop_the_brackets_of_a_missing_field_and_unsafe_characters() {
        let mut k = Kinds::builtin().get(&KindName::new("article")).unwrap().clone();
        k.note_name = "{title} ({year})".into();
        assert_eq!(k.note_path(&fields(json!({"title": "Dune", "year": 2021}))), "notes/clips/Dune (2021).md");
        assert_eq!(k.note_path(&fields(json!({"title": "Dune"}))), "notes/clips/Dune.md");
        assert_eq!(k.note_path(&fields(json!({"title": "A/B: #1 [draft]?"}))), "notes/clips/A B 1 draft.md");
        assert_eq!(k.note_path(&fields(json!({}))), "notes/clips/Untitled.md");
    }

    #[test]
    fn ids_are_read_from_and_written_to_their_properties_with_prefixes() {
        let k: Kind = serde_yaml::from_str(
            "name: paper\nfolder: refs/papers\nids:\n  - { id: doi, property: source, prefix: 'https://doi.org/' }\n  - { id: arxiv, property: source, prefix: 'https://arxiv.org/abs/' }\n  - { id: citekey }\nwriter: { by: plugin, plugin: catalog-zotero, tool: add }\n",
        )
        .unwrap();
        let ids = k.ids_in(&fields(json!({"source": "https://doi.org/10.1103/RevModPhys.77.1027", "citekey": "maier2005quantum"})));
        assert_eq!(ids.get(&IdName::new("doi")).map(String::as_str), Some("10.1103/revmodphys.77.1027"));
        assert_eq!(ids.get(&IdName::new("arxiv")), None);
        assert_eq!(k.id_properties(&ids), vec![("source".into(), "https://doi.org/10.1103/revmodphys.77.1027".into()), ("citekey".into(), "maier2005quantum".into())]);
        assert_eq!(k.writer, Writer::Plugin { plugin: PluginId::new("catalog-zotero"), tool: "add".into() });
    }

    #[test]
    fn a_vault_kind_file_must_be_named_after_its_kind_and_typos_are_errors() {
        assert!(Kinds::parse_vault_file(".atlas/kinds/movie.yaml", "name: movie\nfolder: Films\nids: [{ id: tmdb }]\n").is_ok());
        let e = Kinds::parse_vault_file(".atlas/kinds/film.yaml", "name: movie\nfolder: Films\nids: []\n").unwrap_err();
        assert!(e.contains("declares the kind"), "{e}");
        let e = Kinds::parse_vault_file(".atlas/kinds/movie.yaml", "name: movie\nfolder: Films\nids: []\nfoldr: x\n").unwrap_err();
        assert!(e.contains("unknown field"), "{e}");
    }

    #[test]
    fn the_shipped_kinds_parse_and_a_film_reads_well() {
        let k = Kinds::builtin();
        assert_eq!(k.iter().count(), SHIPPED.len() + 1);
        let film = k.get(&KindName::new("movie")).unwrap();
        assert_eq!((film.folder.as_str(), film.property_of("cast"), film.body.as_deref()), ("notes/films", "cast", Some("description")));
        assert_eq!(film.shown("director", &json!("Denis Villeneuve")), json!("[[Denis Villeneuve]]"));
    }
}
