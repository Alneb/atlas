//! Writing through a base: a new note that belongs to a view ("+ New", Notion), and view edits
//! (hide / show a column, add a board view) written back to the `.base` YAML.
use super::{evaluate, BaseFile, View};
use crate::api::{BaseRowCreated, ViewEdit};
use crate::config::Config;
use crate::{Error, Result};
use serde_yaml::{Mapping, Value};
use std::path::Path;

/// What a new note needs to land in a view: the folder from `file.inFolder("x")` /
/// `file.folder == "x"`, properties from `prop == value`, tags from `file.hasTag("t")` — read off
/// the `and` parts of the base's and the view's filters (an `or` / `not` cannot be prefilled).
pub fn prefill(base_src: &str, view: Option<&str>) -> (Option<String>, Vec<(String, Value)>) {
    let base: BaseFile = serde_yaml::from_str(base_src).unwrap_or_default();
    let v = pick(&base.views, view);
    let mut leaves = Vec::new();
    for f in [base.filters.as_ref(), v.and_then(|v| v.filters.as_ref())].into_iter().flatten() {
        and_leaves(f, &mut leaves);
    }
    let (mut folder, mut props, mut tags) = (None, Vec::<(String, Value)>::new(), Vec::new());
    for leaf in leaves {
        let leaf = leaf.trim();
        if let Some(x) = call_arg(leaf, "file.inFolder") {
            folder = Some(x);
        } else if let Some(x) = call_arg(leaf, "file.hasTag") {
            tags.push(Value::String(x));
        } else if let Some((k, val)) = leaf.split_once("==") {
            let k = k.trim().strip_prefix("note.").unwrap_or(k.trim());
            let Some(val) = literal(val.trim()) else { continue };
            if k == "file.folder" {
                folder = val.as_str().map(str::to_string);
            } else if !k.contains(['.', '(', ' ']) && !k.is_empty() {
                props.push((k.to_string(), val));
            }
        }
    }
    if !tags.is_empty() {
        props.push(("tags".into(), Value::Sequence(tags)));
    }
    (folder, props)
}

fn pick<'a>(views: &'a [View], name: Option<&str>) -> Option<&'a View> {
    name.and_then(|n| views.iter().find(|v| v.name.as_deref() == Some(n))).or(views.first())
}

/// The expression strings of a filter tree that must ALL hold (a list or an `and`).
fn and_leaves<'a>(node: &'a Value, out: &mut Vec<&'a str>) {
    match node {
        Value::String(s) => out.push(s),
        Value::Sequence(seq) => seq.iter().for_each(|i| and_leaves(i, out)),
        Value::Mapping(m) => {
            if let Some(and) = m.get("and") {
                and_leaves(and, out);
            }
        }
        _ => {}
    }
}

/// `name("x")` → x.
fn call_arg(s: &str, name: &str) -> Option<String> {
    let inner = s.strip_prefix(name)?.trim().strip_prefix('(')?.strip_suffix(')')?.trim();
    literal(inner)?.as_str().map(str::to_string)
}

/// A filter's literal: "text" / 'text', a number, true / false.
fn literal(s: &str) -> Option<Value> {
    let quoted = |q: char| s.strip_prefix(q).and_then(|r| r.strip_suffix(q)).filter(|r| !r.contains(q));
    if let Some(t) = quoted('"').or_else(|| quoted('\'')) {
        return Some(Value::String(t.to_string()));
    }
    match s {
        "true" => Some(Value::Bool(true)),
        "false" => Some(Value::Bool(false)),
        _ => s.parse::<f64>().ok().map(|n| serde_yaml::to_value(n).unwrap_or(Value::Null)),
    }
}

/// Creates `Untitled.md` (or `Untitled N.md`) where the view's notes live, with the prefilled
/// properties and the view's other property columns as empty keys (the Properties panel shows
/// them, ready to fill). Says whether the note now shows in the view.
pub fn new_row(root: &Path, cfg: &Config, base_rel: &str, base_src: &str, view: Option<&str>) -> Result<BaseRowCreated> {
    let (folder, props) = prefill(base_src, view);
    let folder = folder.or_else(|| {
        // no folder in the filters: where most of the view's notes already are, else beside the base
        let r = evaluate(root, cfg, base_src, None);
        let v = view.and_then(|n| r.views.iter().find(|v| v.name == n)).or(r.views.first())?;
        let mut count = std::collections::HashMap::<&str, u32>::new();
        for row in &v.rows {
            *count.entry(row.path.rsplit_once('/').map_or("", |(d, _)| d)).or_default() += 1;
        }
        count.into_iter().max_by_key(|(_, n)| *n).map(|(d, _)| d.to_string())
    });
    let folder = folder.unwrap_or_else(|| base_rel.rsplit_once('/').map_or(String::new(), |(d, _)| d.to_string()));
    let base: BaseFile = serde_yaml::from_str(base_src).map_err(|e| Error::BadRequest(format!("base: {e}")))?;
    let mut keys: Vec<(String, Option<Value>)> = props.into_iter().map(|(k, v)| (k, Some(v))).collect();
    for id in pick(&base.views, view).map(|v| v.order.as_slice()).unwrap_or_default() {
        if let Some(k) = super::prop_key(id) {
            if !keys.iter().any(|(x, _)| *x == k) {
                keys.push((k, None));
            }
        }
    }
    let mut fm = String::new();
    for (k, v) in &keys {
        match v {
            Some(v) => {
                let mut m = Mapping::new();
                m.insert(Value::String(k.clone()), v.clone());
                fm.push_str(&serde_yaml::to_string(&m).map_err(|e| Error::BadRequest(e.to_string()))?);
            }
            None => fm.push_str(&format!("{k}:\n")),
        }
    }
    let dir = root.join(&folder);
    let name = (0..1000)
        .map(|i| if i == 0 { "Untitled.md".to_string() } else { format!("Untitled {i}.md") })
        .find(|n| !dir.join(n).exists())
        .ok_or_else(|| Error::BadRequest("too many Untitled notes".into()))?;
    let rel = if folder.is_empty() { name } else { format!("{folder}/{name}") };
    let text = if fm.is_empty() { String::new() } else { format!("---\n{fm}---\n") };
    crate::vault_write::write(&root.join(&rel), text.as_bytes())?;
    let r = evaluate(root, cfg, base_src, None);
    let v = view.and_then(|n| r.views.iter().find(|v| v.name == n)).or(r.views.first());
    let matches = v.is_some_and(|v| v.rows.iter().any(|row| row.path == rel));
    Ok(BaseRowCreated { path: rel, matches })
}

/// Applies a view edit to the `.base` source and returns the new YAML. (Comments in the file are
/// not kept — Obsidian rewrites its bases the same way.)
pub fn edit_view(base_src: &str, view: &str, edit: &ViewEdit) -> Result<String> {
    let mut doc: Value = serde_yaml::from_str(base_src).map_err(|e| Error::BadRequest(format!("base: {e}")))?;
    // base-wide edits: the view only says where the editor was opened
    match edit {
        ViewEdit::BaseFilters { filters } => {
            match filters {
                Some(f) => set(&mut doc, "filters", f.to_yaml()),
                None => unset(&mut doc, "filters"),
            }
            return to_text(&doc);
        }
        ViewEdit::DisplayName { column, name } => {
            display_name(&mut doc, column, name.as_deref().map(str::trim).filter(|n| !n.is_empty()));
            return to_text(&doc);
        }
        _ => {}
    }
    let views = doc
        .get_mut("views")
        .and_then(Value::as_sequence_mut)
        .ok_or_else(|| Error::BadRequest("the base has no views".into()))?;
    let i = views
        .iter()
        .position(|v| v.get("name").and_then(Value::as_str) == Some(view))
        .or_else(|| (!views.is_empty() && views[0].get("name").is_none()).then_some(0))
        .ok_or_else(|| Error::NotFound(format!("view {view}")))?;
    let order = |v: &Value| -> Vec<Value> {
        v.get("order").and_then(Value::as_sequence).cloned().unwrap_or_else(|| vec![Value::String("file.name".into())])
    };
    let same = |a: &Value, id: &str| {
        let a = a.as_str().unwrap_or("");
        a == id || a.strip_prefix("note.") == Some(id) || id.strip_prefix("note.") == Some(a)
    };
    match edit {
        ViewEdit::Hide { column } => {
            let mut o = order(&views[i]);
            o.retain(|c| !same(c, column));
            set(&mut views[i], "order", Value::Sequence(o));
        }
        ViewEdit::Show { column } => {
            let mut o = order(&views[i]);
            if !o.iter().any(|c| same(c, column)) {
                o.push(Value::String(column.clone()));
            }
            set(&mut views[i], "order", Value::Sequence(o));
        }
        ViewEdit::Board { name, group_by } => {
            if views.iter().any(|v| v.get("name").and_then(Value::as_str) == Some(name)) {
                return Err(Error::Conflict { current: None });
            }
            let mut m = Mapping::new();
            m.insert("type".into(), "board".into());
            m.insert("name".into(), name.as_str().into());
            let mut g = Mapping::new();
            g.insert("property".into(), group_by.as_str().into());
            m.insert("groupBy".into(), Value::Mapping(g));
            m.insert("order".into(), Value::Sequence(order(&views[i])));
            if let Some(f) = views[i].get("filters") {
                m.insert("filters".into(), f.clone());
            }
            views.push(Value::Mapping(m));
        }
        ViewEdit::Filters { filters } => match filters {
            Some(f) => set(&mut views[i], "filters", f.to_yaml()),
            None => unset(&mut views[i], "filters"),
        },
        ViewEdit::Sort { sort } if sort.is_empty() => unset(&mut views[i], "sort"),
        ViewEdit::Sort { sort } => {
            let keys = sort.iter().map(|k| {
                let mut m = Mapping::new();
                m.insert("property".into(), k.property.as_str().into());
                m.insert("direction".into(), (if k.direction == crate::api::SortDir::Desc { "DESC" } else { "ASC" }).into());
                Value::Mapping(m)
            });
            set(&mut views[i], "sort", Value::Sequence(keys.collect()));
        }
        ViewEdit::Order { columns } => set(&mut views[i], "order", Value::Sequence(columns.iter().map(|c| Value::String(c.clone())).collect())),
        ViewEdit::Rename { name } | ViewEdit::Duplicate { name } => {
            let name = name.trim();
            if name.is_empty() {
                return Err(Error::BadRequest("a view needs a name".into()));
            }
            if views.iter().enumerate().any(|(j, v)| v.get("name").and_then(Value::as_str) == Some(name) && (j != i || matches!(edit, ViewEdit::Duplicate { .. }))) {
                return Err(Error::Conflict { current: None });
            }
            if matches!(edit, ViewEdit::Rename { .. }) {
                set(&mut views[i], "name", name.into());
            } else {
                let mut copy = views[i].clone();
                set(&mut copy, "name", name.into());
                views.insert(i + 1, copy);
            }
        }
        ViewEdit::Remove => {
            if views.len() == 1 {
                return Err(Error::BadRequest("a base keeps at least one view".into()));
            }
            views.remove(i);
        }
        ViewEdit::Add { name, kind } => {
            let name = name.trim();
            if name.is_empty() {
                return Err(Error::BadRequest("a view needs a name".into()));
            }
            if views.iter().any(|v| v.get("name").and_then(Value::as_str) == Some(name)) {
                return Err(Error::Conflict { current: None });
            }
            let mut m = Mapping::new();
            m.insert("type".into(), view_kind(kind)?.into());
            m.insert("name".into(), name.into());
            m.insert("order".into(), Value::Sequence(order(&views[i])));
            views.insert(i + 1, Value::Mapping(m));
        }
        ViewEdit::Kind { kind } => set(&mut views[i], "type", view_kind(kind)?.into()),
        ViewEdit::Width { column, width } => {
            let mut sizes = views[i].get("columnSize").and_then(Value::as_mapping).cloned().unwrap_or_default();
            let key = column_key(column);
            sizes.retain(|k, _| k.as_str().is_none_or(|k| column_key(k) != key));
            if let Some(w) = width.filter(|w| w.is_finite() && *w > 0.0) {
                sizes.insert(key.into(), Value::from(w.round() as i64));
            }
            if sizes.is_empty() {
                unset(&mut views[i], "columnSize");
            } else {
                set(&mut views[i], "columnSize", Value::Mapping(sizes));
            }
        }
        ViewEdit::Summary { column, summary } => {
            let mut sums = views[i].get("summaries").and_then(Value::as_mapping).cloned().unwrap_or_default();
            let key = column_key(column);
            sums.retain(|k, _| k.as_str().is_none_or(|k| column_key(k) != key));
            if let Some(s) = summary {
                sums.insert(key.into(), serde_yaml::to_value(s).map_err(|e| Error::BadRequest(e.to_string()))?);
            }
            if sums.is_empty() {
                unset(&mut views[i], "summaries");
            } else {
                set(&mut views[i], "summaries", Value::Mapping(sums));
            }
        }
        ViewEdit::Group { property: Some(p) } => {
            let mut g = Mapping::new();
            g.insert("property".into(), p.as_str().into());
            set(&mut views[i], "groupBy", Value::Mapping(g));
        }
        ViewEdit::Group { property: None } => {
            if views[i].get("type").and_then(Value::as_str) == Some("board") {
                return Err(Error::BadRequest("a board is grouped by a property: show it as a table first".into()));
            }
            unset(&mut views[i], "groupBy");
        }
        ViewEdit::Image { property: Some(p) } => set(&mut views[i], "image", column_key(p).into()),
        ViewEdit::Image { property: None } => unset(&mut views[i], "image"),
        ViewEdit::BaseFilters { .. } | ViewEdit::DisplayName { .. } => unreachable!("handled above"),
    }
    to_text(&doc)
}

fn to_text(doc: &Value) -> Result<String> {
    serde_yaml::to_string(doc).map_err(|e| Error::BadRequest(e.to_string()))
}

/// The view types Atlas draws; anything else would silently show as a table.
fn view_kind(kind: &str) -> Result<&str> {
    match kind {
        "table" | "cards" | "list" | "board" => Ok(kind),
        _ => Err(Error::BadRequest(format!("unknown view type {kind}"))),
    }
}

/// A column id as Obsidian keys it in `columnSize` / `properties`: `note.x` for a frontmatter property.
fn column_key(id: &str) -> String {
    match super::prop_key(id) {
        Some(k) => format!("note.{k}"),
        None => id.to_string(),
    }
}

/// Sets (or clears) `properties.<column>.displayName`, dropping the other spellings of the same column.
fn display_name(doc: &mut Value, column: &str, name: Option<&str>) {
    let key = column_key(column);
    let mut props = doc.get("properties").and_then(Value::as_mapping).cloned().unwrap_or_default();
    let mut meta = Mapping::new();
    props.retain(|k, v| {
        let same = k.as_str().is_some_and(|k| column_key(k) == key);
        if same {
            if let Some(m) = v.as_mapping() {
                meta.extend(m.clone());
            }
        }
        !same
    });
    match name {
        Some(n) => {
            meta.insert("displayName".into(), n.into());
        }
        None => {
            meta.remove("displayName");
        }
    }
    if !meta.is_empty() {
        props.insert(key.into(), Value::Mapping(meta));
    }
    if props.is_empty() {
        unset(doc, "properties");
    } else {
        set(doc, "properties", Value::Mapping(props));
    }
}

fn unset(v: &mut Value, key: &str) {
    if let Some(m) = v.as_mapping_mut() {
        m.remove(key);
    }
}

fn set(v: &mut Value, key: &str, val: Value) {
    if let Some(m) = v.as_mapping_mut() {
        m.insert(key.into(), val);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: &str = "filters:\n  and:\n    - file.inFolder(\"db/items\")\n    - type == \"Task\"\nviews:\n  - type: table\n    name: Open\n    filters:\n      and:\n        - status == \"todo\"\n        - or:\n            - prio == 1\n    order: [file.name, status, due]\n";

    #[test]
    fn prefill_reads_the_and_parts_only() {
        let (folder, props) = prefill(BASE, Some("Open"));
        assert_eq!(folder.as_deref(), Some("db/items"));
        assert_eq!(props, vec![("type".into(), Value::from("Task")), ("status".into(), Value::from("todo"))]);
        let (_, tagged) = prefill("filters: 'file.hasTag(\"paper\")'\nviews: [{type: table}]\n", None);
        assert_eq!(tagged, vec![("tags".into(), Value::Sequence(vec!["paper".into()]))]);
    }

    #[test]
    fn a_new_row_lands_in_the_view_with_empty_columns() {
        let d = tempfile::tempdir().unwrap();
        let r = new_row(d.path(), &Config::default(), "db/items.base", BASE, Some("Open")).unwrap();
        assert_eq!(r.path, "db/items/Untitled.md");
        assert!(!r.matches, "the `or: prio == 1` part cannot be prefilled → the UI says so");
        let plain = BASE.replace("        - or:\n            - prio == 1\n", "");
        assert!(new_row(d.path(), &Config::default(), "db/items.base", &plain, Some("Open")).unwrap().matches);
        let text = std::fs::read_to_string(d.path().join(&r.path)).unwrap();
        assert_eq!(text, "---\ntype: Task\nstatus: todo\ndue:\n---\n");
        assert!(d.path().join("db/items/Untitled 1.md").exists(), "never overwrites");
    }

    #[test]
    fn view_edits_rewrite_the_yaml() {
        let order = |src: &str| serde_yaml::from_str::<BaseFile>(src).unwrap().views[0].order.clone();
        let hidden = edit_view(BASE, "Open", &ViewEdit::Hide { column: "status".into() }).unwrap();
        assert_eq!(order(&hidden), ["file.name", "due"]);
        let shown = edit_view(&hidden, "Open", &ViewEdit::Show { column: "note.prio".into() }).unwrap();
        assert_eq!(order(&shown), ["file.name", "due", "note.prio"]);
        assert_eq!(order(&edit_view(&shown, "Open", &ViewEdit::Show { column: "prio".into() }).unwrap()).len(), 3, "no duplicate");
        let board = edit_view(BASE, "Open", &ViewEdit::Board { name: "Board".into(), group_by: "status".into() }).unwrap();
        let b: BaseFile = serde_yaml::from_str(&board).unwrap();
        assert_eq!(b.views[1].kind, "board");
        assert_eq!(b.views[1].group_by.as_ref().map(|g| g.property().to_string()).as_deref(), Some("status"));
        assert!(edit_view(BASE, "Nope", &ViewEdit::Hide { column: "x".into() }).is_err());
    }

    #[test]
    fn filters_sort_columns_and_views_are_edited_as_obsidian_writes_them() {
        use crate::api::{Filter, FilterGroup, SortDir, SortKey};
        let f = Filter::Group(FilterGroup::And(vec![Filter::Expr("status == \"todo\"".into()), Filter::Group(FilterGroup::Or(vec![Filter::Expr("prio == 1".into()), Filter::Expr("file.hasTag(\"urgent\")".into())]))]));
        let out = edit_view(BASE, "Open", &ViewEdit::Filters { filters: Some(f.clone()) }).unwrap();
        let doc: Value = serde_yaml::from_str(&out).unwrap();
        let view = &doc["views"][0];
        assert_eq!(Filter::from_yaml(&view["filters"]), Some(f), "read back the same: {out}");
        assert_eq!(view["filters"]["and"][1]["or"][1].as_str(), Some("file.hasTag(\"urgent\")"));
        assert!(doc["filters"]["and"].is_sequence(), "the base's own filter is not the view's");
        let cleared: Value = serde_yaml::from_str(&edit_view(&out, "Open", &ViewEdit::Filters { filters: None }).unwrap()).unwrap();
        assert!(cleared["views"][0].get("filters").is_none());

        let sorted: Value = serde_yaml::from_str(&edit_view(BASE, "Open", &ViewEdit::Sort { sort: vec![SortKey { property: "due".into(), direction: SortDir::Desc }] }).unwrap()).unwrap();
        assert_eq!((sorted["views"][0]["sort"][0]["property"].as_str(), sorted["views"][0]["sort"][0]["direction"].as_str()), (Some("due"), Some("DESC")));
        let ordered: Value = serde_yaml::from_str(&edit_view(BASE, "Open", &ViewEdit::Order { columns: vec!["due".into(), "file.name".into()] }).unwrap()).unwrap();
        assert_eq!(ordered["views"][0]["order"], serde_yaml::from_str::<Value>("[due, file.name]").unwrap());

        let two: Value = serde_yaml::from_str(&edit_view(BASE, "Open", &ViewEdit::Duplicate { name: "Mine".into() }).unwrap()).unwrap();
        assert_eq!((two["views"][1]["name"].as_str(), two["views"][1]["filters"]["and"][0].as_str()), (Some("Mine"), Some("status == \"todo\"")));
        let src = serde_yaml::to_string(&two).unwrap();
        assert!(matches!(edit_view(&src, "Mine", &ViewEdit::Rename { name: "Open".into() }), Err(Error::Conflict { .. })), "a name taken");
        let renamed: Value = serde_yaml::from_str(&edit_view(&src, "Mine", &ViewEdit::Rename { name: "Later".into() }).unwrap()).unwrap();
        assert_eq!(renamed["views"][1]["name"].as_str(), Some("Later"));
        let one: Value = serde_yaml::from_str(&edit_view(&src, "Mine", &ViewEdit::Remove).unwrap()).unwrap();
        let summed: Value = serde_yaml::from_str(&edit_view(BASE, "Open", &ViewEdit::Summary { column: "prio".into(), summary: Some(crate::api::SummaryKind::Sum) }).unwrap()).unwrap();
        assert_eq!(summed["views"][0]["summaries"]["note.prio"], "Sum");
        let unsummed: Value = serde_yaml::from_str(&edit_view(&to_text(&summed).unwrap(), "Open", &ViewEdit::Summary { column: "note.prio".into(), summary: None }).unwrap()).unwrap();
        assert!(unsummed["views"][0].get("summaries").is_none());
        let grouped: Value = serde_yaml::from_str(&edit_view(BASE, "Open", &ViewEdit::Group { property: Some("status".into()) }).unwrap()).unwrap();
        assert_eq!(grouped["views"][0]["groupBy"]["property"], "status");
        let pictured: Value = serde_yaml::from_str(&edit_view(BASE, "Open", &ViewEdit::Image { property: Some("cover".into()) }).unwrap()).unwrap();
        assert_eq!(pictured["views"][0]["image"], "note.cover");
        assert_eq!(one["views"].as_sequence().unwrap().len(), 1);
        assert!(edit_view(BASE, "Open", &ViewEdit::Remove).is_err(), "the last view stays");
    }

    #[test]
    fn base_wide_filters_and_display_names_leave_the_views_alone() {
        use crate::api::{Filter, FilterGroup};
        let f = Filter::Group(FilterGroup::Or(vec![Filter::Expr("file.hasTag(\"a\")".into())]));
        let doc: Value = serde_yaml::from_str(&edit_view(BASE, "Open", &ViewEdit::BaseFilters { filters: Some(f.clone()) }).unwrap()).unwrap();
        assert_eq!(Filter::from_yaml(&doc["filters"]), Some(f));
        assert_eq!(doc["views"][0]["filters"]["and"][0].as_str(), Some("status == \"todo\""), "the view's own filter stays");
        let none: Value = serde_yaml::from_str(&edit_view(BASE, "Open", &ViewEdit::BaseFilters { filters: None }).unwrap()).unwrap();
        assert!(none.get("filters").is_none());

        let src = "properties:\n  status:\n    displayName: Old\nviews: [{type: table, name: V}]\n";
        let named: Value = serde_yaml::from_str(&edit_view(src, "V", &ViewEdit::DisplayName { column: "note.status".into(), name: Some("State".into()) }).unwrap()).unwrap();
        assert_eq!(named["properties"], serde_yaml::from_str::<Value>("{note.status: {displayName: State}}").unwrap(), "one spelling, as Obsidian writes it");
        let back: Value = serde_yaml::from_str(&edit_view(&serde_yaml::to_string(&named).unwrap(), "V", &ViewEdit::DisplayName { column: "status".into(), name: None }).unwrap()).unwrap();
        assert!(back.get("properties").is_none());
    }

    #[test]
    fn widths_types_and_new_views() {
        let wide: Value = serde_yaml::from_str(&edit_view(BASE, "Open", &ViewEdit::Width { column: "status".into(), width: Some(151.4) }).unwrap()).unwrap();
        assert_eq!(wide["views"][0]["columnSize"], serde_yaml::from_str::<Value>("{note.status: 151}").unwrap());
        let src = serde_yaml::to_string(&wide).unwrap();
        let b: BaseFile = serde_yaml::from_str(&src).unwrap();
        assert_eq!(b.views[0].column_size.get("note.status"), Some(&151.0), "read back by the evaluator");
        let narrow: Value = serde_yaml::from_str(&edit_view(&src, "Open", &ViewEdit::Width { column: "note.status".into(), width: None }).unwrap()).unwrap();
        assert!(narrow["views"][0].get("columnSize").is_none());

        let cards: Value = serde_yaml::from_str(&edit_view(BASE, "Open", &ViewEdit::Kind { kind: "cards".into() }).unwrap()).unwrap();
        assert_eq!(cards["views"][0]["type"].as_str(), Some("cards"));
        assert!(edit_view(BASE, "Open", &ViewEdit::Kind { kind: "map".into() }).is_err());

        let two: Value = serde_yaml::from_str(&edit_view(BASE, "Open", &ViewEdit::Add { name: "Gallery".into(), kind: "cards".into() }).unwrap()).unwrap();
        let v = &two["views"][1];
        assert_eq!((v["name"].as_str(), v["type"].as_str()), (Some("Gallery"), Some("cards")));
        assert!(v.get("filters").is_none(), "a new view starts unfiltered");
        assert_eq!(v["order"], two["views"][0]["order"]);
        assert!(matches!(edit_view(BASE, "Open", &ViewEdit::Add { name: "Open".into(), kind: "table".into() }), Err(Error::Conflict { .. })));
    }
}
