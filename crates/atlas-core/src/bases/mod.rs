//! Obsidian Bases: a `.base` file (YAML) is a database view over the notes' frontmatter —
//! `filters`, `formulas`, `properties` (display names) and `views` (tables). The expression
//! engine (`expr`, `value`, `dates`) is lifted verbatim from obsidian-web (DECISION doc);
//! this module feeds it Atlas's link index and returns typed cells for the UI.
pub(crate) use atlas_template::dates;
mod edit;
mod expr;
mod summary;
mod value;

pub use edit::{edit_view, new_row, prefill};

use crate::api::{BaseCell, BaseColumn, BaseResult, BaseRow, BaseView, ColumnSummary, PropertyKind, SummaryKind};
use crate::config::Config;
use crate::links::{self, Parsed};
use expr::{Context, Expr};
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use value::{from_yaml, Val};

#[derive(Debug, Deserialize, Default)]
struct BaseFile {
    #[serde(default)]
    filters: Option<serde_yaml::Value>,
    #[serde(default)]
    formulas: BTreeMap<String, String>,
    #[serde(default)]
    properties: BTreeMap<String, PropMeta>,
    #[serde(default)]
    views: Vec<View>,
}

#[derive(Debug, Deserialize, Default)]
struct PropMeta {
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct View {
    #[serde(rename = "type", default = "table")]
    kind: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    filters: Option<serde_yaml::Value>,
    #[serde(default)]
    order: Vec<String>,
    #[serde(default)]
    sort: Vec<SortSpec>,
    #[serde(default)]
    limit: Option<usize>,
    #[serde(rename = "columnSize", default)]
    column_size: BTreeMap<String, f64>,
    /// Obsidian's `groupBy: { property: x }` (a bare string works too); a `board` view's columns.
    #[serde(rename = "groupBy", default)]
    group_by: Option<GroupBy>,
    /// Obsidian's `summaries: {note.x: Sum}`; a name Atlas does not know (a custom formula summary) is left out.
    #[serde(default)]
    summaries: BTreeMap<String, serde_yaml::Value>,
    /// A cards view's picture: the property holding it (`note.cover`).
    #[serde(default)]
    image: Option<String>,
}

impl View {
    fn summary(&self, id: &str) -> Option<SummaryKind> {
        let key = prop_key(id).map(|k| format!("note.{k}"));
        let v = self.summaries.get(id).or_else(|| key.as_ref().and_then(|k| self.summaries.get(k)))
            .or_else(|| prop_key(id).and_then(|k| self.summaries.get(&k)))?;
        serde_yaml::from_value(v.clone()).ok()
    }
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum GroupBy {
    Bare(String),
    Spec { property: String },
}

impl GroupBy {
    fn property(&self) -> &str {
        match self {
            GroupBy::Bare(p) | GroupBy::Spec { property: p } => p,
        }
    }
}

fn table() -> String {
    "table".into()
}

#[derive(Debug, Deserialize)]
struct SortSpec {
    property: String,
    #[serde(default)]
    direction: Option<String>,
}

impl SortSpec {
    /// As the editor shows it: Obsidian's direction, ascending when none is written.
    fn key(&self) -> crate::api::SortKey {
        let desc = self.direction.as_deref().is_some_and(|d| d.eq_ignore_ascii_case("desc"));
        crate::api::SortKey { property: self.property.clone(), direction: if desc { crate::api::SortDir::Desc } else { crate::api::SortDir::Asc } }
    }
}

/// One note as Bases sees it (`file.*` fields + frontmatter).
struct Note<'a> {
    path: &'a str,
    name: String,
    data: &'a Parsed,
    out: &'a [String],
    incoming: &'a [String],
}

fn stem(p: &str) -> String {
    let n = p.rsplit('/').next().unwrap_or(p);
    n.strip_suffix(".md").unwrap_or(n).to_string()
}

fn local(t: Option<std::time::SystemTime>) -> Val {
    t.map_or(Val::Null, |t| Val::Date(chrono::DateTime::<chrono::Local>::from(t).naive_local()))
}

/// A note's tags, as Obsidian's `file.tags` gives them: its properties' as written, then the rest the index found (the
/// `#tags` in its text, its PDF marks' tags; tags.rs, lower case) that are not already there.
fn tags_of(props: &crate::note_props::Props, found: &[String]) -> Vec<String> {
    let mut out = own_tags(props);
    let have: std::collections::HashSet<String> = out.iter().map(|t| t.to_lowercase()).collect();
    out.extend(found.iter().filter(|t| !have.contains(*t)).cloned());
    out
}

/// The tags a note's properties name (`tags` / `tag`: a list, or words separated by commas or spaces).
fn own_tags(props: &crate::note_props::Props) -> Vec<String> {
    let mut out = Vec::new();
    for key in ["tags", "tag"] {
        let items: Vec<&str> = match props.get(key) {
            Some(serde_yaml::Value::String(s)) => s.split([',', ' ']).collect(),
            Some(serde_yaml::Value::Sequence(seq)) => seq.iter().filter_map(|v| v.as_str()).collect(),
            _ => Vec::new(),
        };
        out.extend(items.into_iter().map(|t| t.trim().trim_start_matches('#').to_string()).filter(|t| !t.is_empty()));
    }
    out
}

impl Note<'_> {
    fn props(&self) -> BTreeMap<String, Val> {
        self.data.props.iter().map(|(k, v)| (k.to_string(), from_yaml(v))).collect()
    }

    fn field(&self, name: &str) -> Val {
        let p = self.path;
        match name {
            "name" => Val::Str(self.name.clone()),
            "basename" => Val::Str(self.name.clone()),
            "path" => Val::Str(p.to_string()),
            "ext" => Val::Str(p.rsplit_once('.').map(|(_, e)| e.to_lowercase()).unwrap_or_default()),
            "folder" => Val::Str(p.rsplit_once('/').map(|(d, _)| d.to_string()).unwrap_or_default()),
            "size" => Val::Num(self.data.size as f64),
            "ctime" => local(self.data.ctime),
            "mtime" => local(self.data.mtime),
            "tags" => Val::List(tags_of(&self.data.props, &self.data.tags).into_iter().map(Val::Str).collect()),
            "links" => Val::List(self.out.iter().map(|t| Val::Link(stem(t))).collect()),
            "backlinks" => Val::List(self.incoming.iter().map(|t| Val::Link(stem(t))).collect()),
            "properties" => Val::Map(self.props()),
            _ => Val::Null,
        }
    }
}

struct Ctx<'a> {
    note: &'a Note<'a>,
    this: Option<&'a Note<'a>>,
    props: BTreeMap<String, Val>,
    formulas: BTreeMap<String, Val>,
}

impl Context for Ctx<'_> {
    fn file_field(&self, name: &str) -> Val {
        if name == "properties" {
            return Val::Map(self.props.clone());
        }
        self.note.field(name)
    }
    fn property(&self, name: &str) -> Val {
        self.props.get(name).cloned().unwrap_or(Val::Null)
    }
    fn has_property(&self, name: &str) -> bool {
        self.props.get(name).is_some_and(|v| !v.is_empty())
    }
    fn formula(&self, name: &str) -> Val {
        self.formulas.get(name).cloned().unwrap_or(Val::Null)
    }
    fn this_field(&self, name: &str) -> Val {
        // no host note: `this.file.name` is null, so `x != this.file.name` keeps rows
        self.this.map_or(Val::Null, |n| n.field(name))
    }
}

/// A recursive `and` / `or` / `not` tree of expression strings; a list is an implicit `and`.
/// Unparseable leaves pass (real vaults have typos; hiding rows silently would be worse).
fn passes(node: &serde_yaml::Value, ctx: &dyn Context) -> bool {
    use serde_yaml::Value as Y;
    match node {
        Y::String(s) => expr::parse(s).map_or(true, |e| expr::eval(&e, ctx).truthy()),
        Y::Sequence(seq) => seq.iter().all(|i| passes(i, ctx)),
        Y::Mapping(m) => m.iter().all(|(k, v)| {
            let items: Vec<&Y> = match v {
                Y::Sequence(seq) => seq.iter().collect(),
                other => vec![other],
            };
            match k.as_str().unwrap_or("") {
                // an empty group constrains nothing (one just added in the view's settings, not filled in yet)
                _ if items.is_empty() => true,
                "and" => items.iter().all(|i| passes(i, ctx)),
                "or" => items.iter().any(|i| passes(i, ctx)),
                "not" => !items.iter().any(|i| passes(i, ctx)),
                _ => true,
            }
        }),
        _ => true,
    }
}

fn resolve_field(ctx: &Ctx, id: &str) -> Val {
    if let Some(rest) = id.strip_prefix("formula.") {
        ctx.formula(rest)
    } else if let Some(rest) = id.strip_prefix("file.") {
        ctx.file_field(rest)
    } else {
        ctx.property(id.strip_prefix("note.").unwrap_or(id))
    }
}

/// The frontmatter value behind an editable column (`note.x` / bare `x`), if the note has it.
fn raw_value<'a>(id: &str, note: &'a Note) -> Option<&'a serde_yaml::Value> {
    if id.starts_with("file.") || id.starts_with("formula.") {
        return None;
    }
    note.data.props.get(id.strip_prefix("note.").unwrap_or(id))
}

fn yaml_text(v: &serde_yaml::Value) -> String {
    use serde_yaml::Value as Y;
    match v {
        Y::Null => String::new(),
        Y::Bool(b) => b.to_string(),
        Y::Number(n) => n.to_string(),
        Y::String(s) => s.clone(),
        Y::Sequence(seq) => seq.iter().map(yaml_text).collect::<Vec<_>>().join(", "),
        _ => String::new(),
    }
}

fn columns_raw(order: &[String], note: &Note) -> Vec<Option<String>> {
    order
        .iter()
        .map(|id| {
            let editable = !id.starts_with("file.") && !id.starts_with("formula.");
            editable.then(|| raw_value(id, note).map(yaml_text).unwrap_or_default())
        })
        .collect()
}

fn column_label(id: &str, props: &BTreeMap<String, PropMeta>) -> String {
    let bare = id.strip_prefix("note.").unwrap_or(id);
    [id.to_string(), format!("note.{bare}"), bare.to_string()]
        .iter()
        .find_map(|c| props.get(c)?.display_name.clone())
        .unwrap_or_else(|| {
            let last = id.rsplit('.').next().unwrap_or(id);
            let mut c = last.chars();
            c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
        })
}

fn cell(v: &Val, resolve: &dyn Fn(&str) -> Option<String>) -> BaseCell {
    match v {
        Val::Null | Val::Map(_) => BaseCell::Null,
        Val::Bool(b) => BaseCell::Bool { value: *b },
        Val::Num(n) => BaseCell::Num { value: *n },
        Val::Str(s) => BaseCell::Text { value: s.clone() },
        Val::Link(t) => {
            let (raw, alias) = t.split_once('|').map_or((t.trim(), None), |(a, b)| (a.trim(), Some(b.trim())));
            let target = raw.split('#').next().unwrap_or(raw).trim();
            BaseCell::Link { text: alias.unwrap_or(target).to_string(), path: resolve(target) }
        }
        Val::Date(d) => BaseCell::Date {
            text: d.format(if d.time() == chrono::NaiveTime::MIN { "%Y-%m-%d" } else { "%Y-%m-%d %H:%M" }).to_string(),
        },
        Val::List(items) => BaseCell::List { items: items.iter().map(|i| cell(i, resolve)).collect() },
    }
}

/// A card's picture from a property's value: a web address as written, a `[[link]]` or a path resolved in the
/// vault (a list: its first).
fn picture(v: &Val, from: &str, vault: &links::Vault) -> Option<String> {
    match v {
        Val::List(l) => l.iter().find_map(|i| picture(i, from, vault)),
        Val::Str(s) if s.starts_with("https://") || s.starts_with("http://") => Some(s.trim().to_string()),
        Val::Link(t) | Val::Str(t) => {
            let target = t.split('|').next().unwrap_or(t).trim();
            vault.resolve(target, from)
        }
        _ => None,
    }
}

/// A cell as plain text (board column titles; lists joined).
fn cell_text(c: &BaseCell) -> String {
    match c {
        BaseCell::Null => String::new(),
        BaseCell::Bool { value } => value.to_string(),
        BaseCell::Num { value } => value.to_string(),
        BaseCell::Text { value } => value.clone(),
        BaseCell::Link { text, .. } | BaseCell::Date { text } => text.clone(),
        BaseCell::List { items } => items.iter().map(cell_text).collect::<Vec<_>>().join(", "),
    }
}

/// The frontmatter key behind a column id (`note.x` / `x`); None for computed `file.*` / `formula.*`.
fn prop_key(id: &str) -> Option<String> {
    (!id.starts_with("file.") && !id.starts_with("formula.")).then(|| id.strip_prefix("note.").unwrap_or(id).to_string())
}

/// The kind a frontmatter value has by its shape (None for an empty one, which says nothing).
fn kind_of(key: &str, v: &serde_yaml::Value) -> Option<PropertyKind> {
    use serde_yaml::Value as Y;
    let wiki = |s: &str| s.starts_with("[[") && s.ends_with("]]");
    let tag_key = matches!(key.to_ascii_lowercase().as_str(), "tags" | "tag" | "aliases" | "alias" | "cssclasses");
    Some(match v {
        Y::Null => return None,
        Y::Bool(_) => PropertyKind::Bool,
        Y::Number(_) => PropertyKind::Number,
        Y::Sequence(_) if tag_key => PropertyKind::Tags,
        Y::Sequence(items) if !items.is_empty() && items.iter().all(|i| i.as_str().is_some_and(wiki)) => PropertyKind::Links,
        Y::Sequence(_) => PropertyKind::List,
        Y::String(_) if tag_key => PropertyKind::Tags,
        Y::String(s) if wiki(s.trim()) => PropertyKind::Link,
        Y::String(s) => match from_yaml(v) {
            Val::Date(d) if d.time() == chrono::NaiveTime::MIN && s.trim().len() == 10 => PropertyKind::Date,
            Val::Date(_) => PropertyKind::Datetime,
            _ => PropertyKind::Text,
        },
        _ => PropertyKind::Text,
    })
}

/// Every property of the notes, with the kind most of its values have.
fn kinds(notes: &[Note]) -> BTreeMap<String, PropertyKind> {
    let mut votes: HashMap<&str, Vec<(PropertyKind, u32)>> = HashMap::new();
    for n in notes {
        for (k, v) in n.data.props.iter() {
            let tally = votes.entry(k).or_default();
            let Some(kind) = kind_of(k, v) else { continue };
            match tally.iter_mut().find(|(x, _)| *x == kind) {
                Some((_, c)) => *c += 1,
                None => tally.push((kind, 1)),
            }
        }
    }
    votes
        .into_iter()
        .map(|(k, tally)| (k.to_string(), tally.into_iter().max_by_key(|(_, c)| *c).map_or(PropertyKind::Text, |(x, _)| x)))
        .collect()
}

/// Evaluates the `.base` at `base_path` (workspace-relative); `this` is the note embedding it
/// (Obsidian's `this.file`), else the base file itself.
pub fn evaluate(root: &Path, cfg: &Config, base_src: &str, this: Option<&str>) -> BaseResult {
    let base: BaseFile = match serde_yaml::from_str(base_src) {
        Ok(b) => b,
        Err(e) => {
            return BaseResult {
                views: Vec::new(),
                error: Some(format!("could not read the base: {e}")),
                filters: None,
                formulas: Vec::new(),
                kinds: BTreeMap::new(),
            }
        }
    };
    let _names = dates::names(cfg.editor.date_names == crate::config::DateNames::Spanish);
    let vault = links::vault(root, cfg);
    let none: Vec<String> = Vec::new();
    let notes: Vec<Note> = vault
        .notes
        .iter()
        .map(|(path, data, out)| Note {
            path,
            name: stem(path),
            data,
            out,
            incoming: vault.incoming.get(path).unwrap_or(&none),
        })
        .collect();
    let host = this.and_then(|t| notes.iter().find(|n| n.path == t));
    let by_stem: HashMap<String, &str> = {
        let mut m = HashMap::new();
        // shortest path wins for a shared name, like link resolution
        for n in notes.iter().rev() {
            m.insert(n.name.to_lowercase(), n.path);
        }
        m
    };
    let resolve = |t: &str| by_stem.get(&stem(t).to_lowercase()).map(|p| p.to_string());
    let formulas: Vec<(String, Option<Expr>)> =
        base.formulas.iter().map(|(k, v)| (k.clone(), expr::parse(v).ok())).collect();

    let views = base
        .views
        .iter()
        .map(|view| {
            let mut rows: Vec<Ctx> = notes
                .iter()
                .filter_map(|note| {
                    let mut ctx = Ctx { note, this: host, props: note.props(), formulas: BTreeMap::new() };
                    for (name, e) in &formulas {
                        let v = e.as_ref().map_or(Val::Null, |e| expr::eval(e, &ctx));
                        ctx.formulas.insert(name.clone(), v);
                    }
                    let ok = base.filters.as_ref().is_none_or(|f| passes(f, &ctx))
                        && view.filters.as_ref().is_none_or(|f| passes(f, &ctx));
                    ok.then_some(ctx)
                })
                .collect();
            rows.sort_by(|a, b| {
                view.sort
                    .iter()
                    .map(|s| {
                        let o = resolve_field(a, &s.property)
                            .cmp_val(&resolve_field(b, &s.property))
                            .unwrap_or(std::cmp::Ordering::Equal);
                        if s.direction.as_deref().is_some_and(|d| d.eq_ignore_ascii_case("desc")) {
                            o.reverse()
                        } else {
                            o
                        }
                    })
                    .find(|o| o.is_ne())
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            let count = rows.len() as u32;
            // properties the matching notes have that the view does not show (the "+ column" menu)
            let mut seen: BTreeMap<String, u32> = BTreeMap::new();
            for r in &rows {
                for k in r.note.data.props.keys() {
                    *seen.entry(k.to_string()).or_default() += 1;
                }
            }
            let shown: Vec<String> = view.order.iter().filter_map(|id| prop_key(id)).collect();
            let mut properties: Vec<(u32, String)> =
                seen.into_iter().filter(|(k, _)| !shown.contains(k)).map(|(k, n)| (n, k)).collect();
            properties.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
            rows.truncate(view.limit.unwrap_or(usize::MAX));
            let group_by = view.group_by.as_ref().map(|g| g.property().to_string());
            let order = if view.order.is_empty() { vec!["file.name".to_string()] } else { view.order.clone() };
            let columns = order
                .iter()
                .map(|id| BaseColumn {
                    id: id.clone(),
                    label: column_label(id, &base.properties),
                    width: view.column_size.get(id).or_else(|| view.column_size.get(&format!("note.{id}"))).copied(),
                    key: (!id.starts_with("file.") && !id.starts_with("formula."))
                        .then(|| id.strip_prefix("note.").unwrap_or(id).to_string()),
                    summary: view.summary(id).map(|kind| {
                        let vals: Vec<Val> = rows.iter().map(|r| resolve_field(r, id)).collect();
                        ColumnSummary { kind, value: summary::summarize(kind, &vals).unwrap_or_default() }
                    }),
                })
                .collect();
            let rows = rows
                .iter()
                .map(|ctx| BaseRow {
                    group: group_by.as_ref().map(|g| cell_text(&cell(&resolve_field(ctx, g), &resolve))),
                    image: view.image.as_ref().and_then(|p| picture(&resolve_field(ctx, p), ctx.note.path, &vault)),
                    edit: columns_raw(&order, ctx.note),
                    is_list: order.iter().map(|id| raw_value(id, ctx.note).is_some_and(|v| v.is_sequence())).collect(),
                    values: order
                        .iter()
                        .map(|id| raw_value(id, ctx.note).and_then(|v| serde_json::to_value(v).ok()).unwrap_or_default())
                        .collect(),
                    path: ctx.note.path.to_string(),
                    cells: order
                        .iter()
                        .map(|id| match id.as_str() {
                            "file.name" => {
                                BaseCell::Link { text: ctx.note.name.clone(), path: Some(ctx.note.path.to_string()) }
                            }
                            _ => cell(&resolve_field(ctx, id), &resolve),
                        })
                        .collect(),
                })
                .collect();
            BaseView {
                name: view.name.clone().unwrap_or_else(|| view.kind.clone()),
                kind: view.kind.clone(),
                group_key: group_by.as_deref().and_then(prop_key),
                group_by,
                columns,
                rows,
                count,
                properties: properties.into_iter().map(|(_, k)| k).collect(),
                filters: view.filters.as_ref().and_then(crate::api::Filter::from_yaml),
                sort: view.sort.iter().map(SortSpec::key).collect(),
                image: view.image.clone(),
            }
        })
        .collect();
    BaseResult {
        views,
        error: None,
        filters: base.filters.as_ref().and_then(crate::api::Filter::from_yaml),
        formulas: base.formulas.keys().cloned().collect(),
        kinds: kinds(&notes),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_group_lets_every_note_through() {
        let d = tempfile::tempdir().unwrap();
        for n in ["a", "b"] {
            std::fs::write(d.path().join(format!("{n}.md")), "x\n").unwrap();
        }
        for f in ["or: []", "and: []", "not: []"] {
            let src = format!("views:\n  - type: table\n    filters:\n      {f}\n");
            let r = evaluate(d.path(), &Config::default(), &src, None);
            assert_eq!((r.error.as_deref(), r.views[0].count), (None, 2), "{f}");
        }
    }

    /// The user's own topic base (from the Obsidian vault), over a tiny vault.
    const TOPIC: &str = r#"filters:
  and:
    - '!file.path.startsWith("templates")'
    - file.name != this.file.name
    - or:
        - topics.contains(link(this.file.name))
        - file.links.contains(this.file.name)
    - type != "Documentation"
formulas:
  Date: date(file.properties["date"]).format("YY.MM-DD")
  Links: file.backlinks.length+file.links.length
views:
  - type: table
    name: Total
    order: [formula.Date, file.name, formula.Links]
    sort:
      - property: formula.Date
        direction: DESC
  - type: table
    name: Lectures
    filters:
      and:
        - type == "Lecture"
    order: [file.name, type, topics]
"#;

    #[test]
    fn evaluates_the_users_topic_base() {
        let d = tempfile::tempdir().unwrap();
        let w = |p: &str, s: &str| {
            let p = d.path().join(p);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, s).unwrap();
        };
        w("notes/Condensed Matter.md", "# CM\n![[topic.base]]\n");
        w("notes/l1.md", "---\ntype: Lecture\ndate: 2025-02-03\ntopics:\n  - \"[[Condensed Matter]]\"\n---\nbody\n");
        w("notes/l2.md", "---\ntype: subtopic\ndate: 2025-03-01\n---\nsee [[Condensed Matter]]\n");
        w("notes/doc.md", "---\ntype: Documentation\ntopics: [\"[[Condensed Matter]]\"]\n---\n");
        w("templates/t.md", "---\ntopics: [\"[[Condensed Matter]]\"]\n---\n");
        w("notes/other.md", "nothing\n");
        let r = evaluate(d.path(), &Config::default(), TOPIC, Some("notes/Condensed Matter.md"));
        assert_eq!(r.error, None);
        let total = &r.views[0];
        let names: Vec<String> = total.rows.iter().map(|r| r.path.clone()).collect();
        assert_eq!(names, vec!["notes/l2.md", "notes/l1.md"], "filtered, sorted by date desc");
        // the view says its sort and filter, for the editor
        assert_eq!(total.sort, vec![crate::api::SortKey { property: "formula.Date".into(), direction: crate::api::SortDir::Desc }]);
        assert_eq!(total.columns.iter().map(|c| c.label.as_str()).collect::<Vec<_>>(), vec!["Date", "Name", "Links"]);
        assert!(matches!(&total.rows[0].cells[0], BaseCell::Text { value } if value == "25.03-01"));
        assert!(matches!(&total.rows[1].cells[2], BaseCell::Num { value } if *value == 1.0));
        let lectures = &r.views[1];
        assert_eq!(lectures.count, 1);
        assert!(matches!(&lectures.rows[0].cells[2], BaseCell::List { items }
            if matches!(&items[0], BaseCell::Link { text, path } if text == "Condensed Matter" && path.as_deref() == Some("notes/Condensed Matter.md"))));
        assert_eq!(lectures.columns[1].key.as_deref(), Some("type"));
    }

    #[test]
    fn a_property_named_like_a_function_is_still_a_property() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("a.md"), "---\ndate: 2025-02-01\n---\n").unwrap();
        std::fs::write(d.path().join("b.md"), "---\ndate: 2025-04-01\n---\n").unwrap();
        let src = "views:\n  - type: table\n    filters:\n      and:\n        - date < \"2025-03-01\"\n";
        let r = evaluate(d.path(), &Config::default(), src, None);
        assert_eq!(r.views[0].rows.iter().map(|r| r.path.as_str()).collect::<Vec<_>>(), vec!["a.md"]);
    }

    #[test]
    fn summaries_and_card_pictures() {
        let d = tempfile::tempdir().unwrap();
        let w = |n: &str, s: &str| std::fs::write(d.path().join(n), s).unwrap();
        w("a.md", "---\nprice: 3\ncover: \"[[a.png]]\"\n---\n");
        w("b.md", "---\nprice: 5\ncover: https://example.org/b.jpg\n---\n");
        w("a.png", "");
        let src = "views:\n  - type: cards\n    order: [file.name, price]\n    image: note.cover\n    summaries:\n      note.price: Sum\n      file.name: Nope\n";
        let v = &evaluate(d.path(), &Config::default(), src, None).views[0];
        let s = v.columns[1].summary.as_ref().unwrap();
        assert_eq!((s.kind, s.value.as_str()), (SummaryKind::Sum, "8"));
        assert!(v.columns[0].summary.is_none(), "an unknown summary is left out");
        let pics: Vec<_> = v.rows.iter().map(|r| r.image.as_deref()).collect();
        assert_eq!(pics, [Some("a.png"), Some("https://example.org/b.jpg")]);
    }

    #[test]
    fn property_kinds_follow_most_values() {
        let d = tempfile::tempdir().unwrap();
        let w = |n: &str, s: &str| std::fs::write(d.path().join(n), s).unwrap();
        w("a.md", "---\ndue: 2025-02-01\nprio: 2\ndone: true\ntags: [x]\nup: \"[[b]]\"\nsee: [\"[[a]]\"]\nat: 2025-02-01 10:30\n---\n");
        w("b.md", "---\ndue: 2025-03-01\nprio: high\nnote: hi\nlist: [1, 2]\n---\n");
        w("c.md", "---\nprio: 3\ndue:\n---\n");
        let r = evaluate(d.path(), &Config::default(), "views: [{type: table}]", None);
        let k = |p: &str| r.kinds.get(p).copied();
        use PropertyKind as K;
        assert_eq!(
            [k("due"), k("prio"), k("done"), k("tags"), k("up"), k("see"), k("at"), k("note"), k("list")],
            [Some(K::Date), Some(K::Number), Some(K::Bool), Some(K::Tags), Some(K::Link), Some(K::Links), Some(K::Datetime), Some(K::Text), Some(K::List)]
        );
    }

    #[test]
    fn file_tags_are_every_tag_of_the_note_as_in_obsidian() {
        let d = tempfile::tempdir().unwrap();
        let w = |n: &str, s: &str| std::fs::write(d.path().join(n), s).unwrap();
        w("a.md", "---\ntags: [Physics]\n---\nsome #inline/nested words, #physics again\n");
        w("b.md", "nothing\n\n```pdf-marks\nm-0000000a postit p1 {\"version\":1,\"at\":[1,2],\"text\":\"#question\",\"tags\":[\"question\"]}\n```\n");
        w("c.md", "no tags\n");
        let src = "filters: 'file.hasTag(\"inline\") || file.hasTag(\"question\")'\nviews:\n  - type: table\n    order: [file.name, file.tags]\n";
        let v = &evaluate(d.path(), &Config::default(), src, None).views[0];
        let paths: Vec<&str> = v.rows.iter().map(|r| r.path.as_str()).collect();
        assert_eq!(paths, ["a.md", "b.md"], "a by its inline tag, b by its PDF mark's tag");
        let tags = format!("{:?}", v.rows[0].cells[1]);
        assert!(tags.contains("\"Physics\"") && tags.contains("\"inline/nested\"") && !tags.contains("\"physics\""), "the property as written, no duplicate: {tags}");
    }

    #[test]
    fn a_broken_base_reports_instead_of_failing() {
        let d = tempfile::tempdir().unwrap();
        let r = evaluate(d.path(), &Config::default(), "views: [oops", None);
        assert!(r.error.is_some() && r.views.is_empty());
    }
}
