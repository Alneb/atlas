//! The vault's property spec (`[editor] properties_spec`, `templates/properties.yaml` by default):
//! which kind each frontmatter key is (date, list, link…) and which keys a note `type:` has. Read
//! leniently — an unknown kind or a broken entry is reported and the rest is still used; with no
//! file at all the properties panel infers kinds from the values' shape.
use crate::api::{NoteTypeSpec, PropertyKind, PropertySpec, PropertySpecs};
use serde_yaml::Value;
use std::path::Path;

/// A kind's name in the spec → the kind. Obsidian's and common spellings are accepted too.
fn kind_of(name: &str) -> Option<PropertyKind> {
    Some(match name.trim().to_ascii_lowercase().as_str() {
        "text" | "string" | "str" => PropertyKind::Text,
        "number" | "int" | "integer" | "float" => PropertyKind::Number,
        "bool" | "boolean" | "checkbox" => PropertyKind::Bool,
        "date" => PropertyKind::Date,
        "datetime" | "date-time" | "time" => PropertyKind::Datetime,
        "list" | "multitext" => PropertyKind::List,
        "tags" | "tag" => PropertyKind::Tags,
        "link" | "wikilink" => PropertyKind::Link,
        "links" | "wikilinks" => PropertyKind::Links,
        "enum" | "select" | "choice" => PropertyKind::Enum,
        _ => return None,
    })
}

fn strings(v: Option<&Value>) -> Vec<String> {
    let scalar = |x: &Value| match x {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    };
    match v {
        Some(Value::Sequence(items)) => items.iter().filter_map(scalar).collect(),
        Some(x) => scalar(x).into_iter().collect(),
        None => Vec::new(),
    }
}

/// The spec in `text` (the file's content), with what could not be read in `problems`.
pub fn parse(text: &str) -> PropertySpecs {
    let mut out = PropertySpecs { found: true, ..Default::default() };
    let doc: Value = match serde_yaml::from_str(text) {
        Ok(v) => v,
        Err(e) => {
            out.problems.push(format!("not valid YAML: {e}"));
            return out;
        }
    };
    if let Some(Value::Mapping(props)) = doc.get("properties") {
        for (k, v) in props {
            let Some(key) = k.as_str() else { continue };
            // `key: date` is short for `key: {kind: date}`
            let name = v.as_str().or_else(|| v.get("kind").and_then(Value::as_str)).unwrap_or("text");
            let kind = kind_of(name).unwrap_or_else(|| {
                out.problems.push(format!("`{key}`: unknown kind `{name}` (read as text)"));
                PropertyKind::Text
            });
            let description = v.get("description").and_then(Value::as_str).unwrap_or_default().to_string();
            let format = v.get("format").and_then(Value::as_str).unwrap_or_default().to_string();
            let (values, suggest) = (strings(v.get("values")), strings(v.get("suggest")));
            out.properties.insert(key.to_string(), PropertySpec { kind, values, suggest, description, format });
        }
    }
    if let Some(Value::Mapping(types)) = doc.get("types") {
        for (k, v) in types {
            let Some(name) = k.as_str() else { continue };
            out.types.insert(
                name.to_string(),
                NoteTypeSpec { required: strings(v.get("required")), optional: strings(v.get("optional")) },
            );
        }
    }
    out
}

/// The spec file `rel` of the vault at `root`; an empty spec (not `found`) when there is none.
pub fn load(root: &Path, rel: &str) -> PropertySpecs {
    let rel = rel.trim();
    let read = (!rel.is_empty())
        .then(|| crate::paths::safe_join(root, rel).ok())
        .flatten()
        .and_then(|p| std::fs::read_to_string(p).ok());
    let mut spec = read.as_deref().map(parse).unwrap_or_default();
    spec.path = rel.to_string();
    spec
}

/// One property the vault's notes use: how many notes have it, and its commonest values (scalars and list items as
/// text, the most used first) — what the properties panel completes from.
#[derive(Debug, Clone, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct KnownProperty {
    pub key: String,
    pub notes: u32,
    pub values: Vec<String>,
}

/// Values longer than this (an abstract, a description) are not offered back.
const VALUE_MAX: usize = 80;
/// At most this many values per property.
const VALUES: usize = 40;

/// Every property of the vault's notes, the most used first.
pub fn known(root: &Path, cfg: &crate::config::Config) -> Vec<KnownProperty> {
    let vault = crate::links::vault(root, cfg);
    let mut by: std::collections::HashMap<String, (u32, std::collections::HashMap<String, u32>)> = Default::default();
    for (_, parsed, _) in &vault.notes {
        for (key, v) in parsed.props.iter() {
            let entry = by.entry(key.to_string()).or_default();
            entry.0 += 1;
            let items: Vec<&Value> = match v {
                Value::Sequence(xs) => xs.iter().collect(),
                other => vec![other],
            };
            for it in items {
                let text = match it {
                    Value::String(s) => s.trim().to_string(),
                    Value::Number(n) => n.to_string(),
                    Value::Bool(b) => b.to_string(),
                    _ => continue,
                };
                if !text.is_empty() && text.len() <= VALUE_MAX {
                    *entry.1.entry(text).or_default() += 1;
                }
            }
        }
    }
    let mut out: Vec<KnownProperty> = by
        .into_iter()
        .map(|(key, (notes, values))| {
            let mut vs: Vec<(String, u32)> = values.into_iter().collect();
            vs.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            KnownProperty { key, notes, values: vs.into_iter().take(VALUES).map(|(v, _)| v).collect() }
        })
        .collect();
    out.sort_by(|a, b| b.notes.cmp(&a.notes).then_with(|| a.key.cmp(&b.key)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const SPEC: &str = "properties:\n  created: {kind: date, description: When it was made}\n  date: {kind: datetime, format: \"YYYY-MM-DD HH:mm\"}\n  status: {kind: enum, values: [open, done, 3]}\n  up: {kind: links, suggest: [\"[[Hub]]\"]}\n  odd: {kind: colour}\n  done: checkbox\ntypes:\n  project:\n    required: [status, created]\n    optional: [up]\n";

    #[test]
    fn reads_kinds_values_and_types() {
        let s = parse(SPEC);
        assert!(s.found);
        assert_eq!(s.properties["created"].kind, PropertyKind::Date);
        assert_eq!(s.properties["created"].description, "When it was made");
        assert_eq!(s.properties["date"].format, "YYYY-MM-DD HH:mm");
        assert_eq!(s.properties["status"].values, ["open", "done", "3"]);
        assert_eq!(s.properties["up"].kind, PropertyKind::Links);
        assert_eq!(s.properties["up"].suggest, ["[[Hub]]"]);
        assert_eq!(s.properties["done"].kind, PropertyKind::Bool, "the short form, Obsidian's name");
        assert_eq!(s.properties["odd"].kind, PropertyKind::Text, "an unknown kind is text…");
        assert!(s.problems.iter().any(|p| p.contains("colour")), "…and said");
        assert_eq!(s.types["project"].required, ["status", "created"]);
        assert_eq!(s.types["project"].optional, ["up"]);
    }

    #[test]
    fn a_missing_or_broken_file_is_an_empty_spec() {
        let dir = tempfile::tempdir().unwrap();
        let s = load(dir.path(), "templates/properties.yaml");
        assert!(!s.found && s.properties.is_empty() && s.path == "templates/properties.yaml");
        std::fs::create_dir_all(dir.path().join("templates")).unwrap();
        std::fs::write(dir.path().join("templates/properties.yaml"), "properties: [unclosed").unwrap();
        let s = load(dir.path(), "templates/properties.yaml");
        assert!(s.found && s.properties.is_empty() && !s.problems.is_empty());
        assert!(!load(dir.path(), "../outside.yaml").found, "never outside the vault");
    }

    #[test]
    fn the_vaults_properties_are_known_with_their_commonest_values() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("a.md"), "---\nstatus: \"[[to-read]]\"\ngenres: [Drama, Comedy]\n---\n").unwrap();
        std::fs::write(d.path().join("b.md"), "---\nstatus: \"[[to-read]]\"\ngenres: [Drama]\nyear: 1999\n---\n").unwrap();
        std::fs::write(d.path().join("c.md"), "---\nstatus: \"[[read]]\"\n---\n").unwrap();
        let k = known(d.path(), &crate::config::Config::default());
        assert_eq!(k[0].key, "status", "the most used first");
        assert_eq!((k[0].notes, k[0].values.clone()), (3, vec!["[[to-read]]".to_string(), "[[read]]".to_string()]));
        let g = k.iter().find(|p| p.key == "genres").unwrap();
        assert_eq!(g.values, ["Drama", "Comedy"], "list items, the commonest first");
        assert_eq!(k.iter().find(|p| p.key == "year").unwrap().values, ["1999"]);
    }
}
