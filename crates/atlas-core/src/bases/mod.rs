//! Obsidian Bases: a `.base` file (YAML) is a database view over the notes' frontmatter —
//! `filters`, `formulas`, `properties` (display names) and `views` (tables). The expression
//! engine (`expr`, `value`, `dates`) is lifted verbatim from obsidian-web (DECISION doc);
//! this module feeds it Atlas's link index and returns typed cells for the UI.
pub(crate) use atlas_template::dates;
mod edit;
mod expr;
mod value;

pub use edit::{edit_view, new_row, prefill};

use crate::api::{BaseCell, BaseColumn, BaseResult, BaseRow, BaseView};
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

fn tags_of(props: &crate::note_props::Props) -> Vec<String> {
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
            "tags" => Val::List(tags_of(&self.data.props).into_iter().map(Val::Str).collect()),
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

/// Evaluates the `.base` at `base_path` (workspace-relative); `this` is the note embedding it
/// (Obsidian's `this.file`), else the base file itself.
pub fn evaluate(root: &Path, cfg: &Config, base_src: &str, this: Option<&str>) -> BaseResult {
    let base: BaseFile = match serde_yaml::from_str(base_src) {
        Ok(b) => b,
        Err(e) => return BaseResult { views: Vec::new(), error: Some(format!("could not read the base: {e}")) },
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
                })
                .collect();
            let rows = rows
                .iter()
                .map(|ctx| BaseRow {
                    group: group_by.as_ref().map(|g| cell_text(&cell(&resolve_field(ctx, g), &resolve))),
                    edit: columns_raw(&order, ctx.note),
                    is_list: order.iter().map(|id| raw_value(id, ctx.note).is_some_and(|v| v.is_sequence())).collect(),
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
            }
        })
        .collect();
    BaseResult { views, error: None }
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
    fn a_broken_base_reports_instead_of_failing() {
        let d = tempfile::tempdir().unwrap();
        let r = evaluate(d.path(), &Config::default(), "views: [oops", None);
        assert!(r.error.is_some() && r.views.is_empty());
    }
}
