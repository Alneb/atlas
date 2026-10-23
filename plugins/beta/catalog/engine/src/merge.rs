//! Field-by-field merge of what the sources answered. For each field: the kind's own order for it (or for `"*"`)
//! decides first, then the source's priority, then the plugin id. Empty values never win. Every field remembers
//! where it came from, so the item block can say "year from TMDB" and a refresh can be explained.
use crate::kind::Kind;
use crate::model::{Fields, IdName, Ids, PluginId};
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

/// One source's answer.
#[derive(Debug, Clone)]
pub struct Fetched {
    pub plugin: PluginId,
    pub priority: i32,
    pub ids: Ids,
    pub fields: Fields,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Merged {
    pub ids: Ids,
    pub fields: Fields,
    /// field → the plugin its value came from
    pub from: BTreeMap<String, PluginId>,
    /// two sources gave different values for the same ID: kept the first, said here
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub conflicts: Vec<String>,
}

fn empty(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::String(s) => s.trim().is_empty(),
        Value::Array(a) => a.is_empty(),
        Value::Object(o) => o.is_empty(),
        _ => false,
    }
}

/// The rank of `plugin` for `field` in `kind`: (position in the kind's list or after all of them, -priority, id).
fn rank<'a>(kind: &'a Kind, field: &str, f: &'a Fetched) -> (usize, i32, &'a str) {
    let listed = kind.priority.get(field).or_else(|| kind.priority.get("*"));
    let pos = listed.and_then(|l| l.iter().position(|p| *p == f.plugin)).unwrap_or(usize::MAX);
    (pos, -f.priority, f.plugin.as_str())
}

pub fn merge(kind: &Kind, known: &Ids, answers: &[Fetched]) -> Merged {
    let mut m = Merged { ids: known.clone(), ..Merged::default() };
    // IDs: what was known first, then each source in priority order; a disagreement is reported, never overwritten
    let mut by_priority: Vec<&Fetched> = answers.iter().collect();
    by_priority.sort_by(|a, b| b.priority.cmp(&a.priority).then_with(|| a.plugin.cmp(&b.plugin)));
    for f in &by_priority {
        for (id, v) in &f.ids {
            let v = crate::model::normalise(id, v);
            match m.ids.get(id) {
                None => {
                    m.ids.insert(id.clone(), v);
                }
                Some(old) if *old != v => m.conflicts.push(format!("{}: {id} {v} (kept {old})", f.plugin)),
                Some(_) => {}
            }
        }
    }
    let names: std::collections::BTreeSet<&String> = answers.iter().flat_map(|f| f.fields.keys()).collect();
    for name in names {
        let best = answers.iter().filter(|f| f.fields.get(name).is_some_and(|v| !empty(v))).min_by(|a, b| rank(kind, name, a).cmp(&rank(kind, name, b)));
        if let Some(f) = best {
            m.fields.insert(name.clone(), f.fields[name].clone());
            m.from.insert(name.clone(), f.plugin.clone());
        }
    }
    m
}

/// IDs of `kind` that a merged answer has, for deduplication and the note's ID properties.
pub fn identifying(kind: &Kind, ids: &Ids) -> Ids {
    let wanted: Vec<&IdName> = kind.ids.iter().map(|i| &i.id).collect();
    ids.iter().filter(|(k, _)| wanted.contains(k)).map(|(k, v)| (k.clone(), v.clone())).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::KindName;
    use serde_json::json;

    fn fetched(plugin: &str, priority: i32, ids: Value, fields: Value) -> Fetched {
        Fetched { plugin: PluginId::new(plugin), priority, ids: serde_json::from_value(ids).unwrap(), fields: serde_json::from_value(fields).unwrap() }
    }

    #[test]
    fn the_kind_decides_first_then_priority_and_empty_values_never_win() {
        let mut kind: Kind = serde_yaml::from_str("name: movie\nfolder: Films\nids: [{ id: tmdb }, { id: imdb }]\n").unwrap();
        kind.priority.insert("overview".into(), vec![PluginId::new("catalog-wikipedia")]);
        let answers = [
            fetched("catalog-tmdb", 60, json!({"tmdb": "438631", "imdb": "tt1160419"}), json!({"title": "Dune", "year": 2021, "overview": "Paul…", "cover": ""})),
            fetched("catalog-wikipedia", 30, json!({"imdb": "tt9999999"}), json!({"title": "Dune (2021 film)", "overview": "Dune is a 2021 epic…", "cover": "https://upload/x.jpg"})),
        ];
        let m = merge(&kind, &Ids::from([(IdName::new("tmdb"), "438631".into())]), &answers);
        assert_eq!(m.fields["title"], json!("Dune"));
        assert_eq!(m.fields["overview"], json!("Dune is a 2021 epic…"));
        assert_eq!(m.from["overview"].as_str(), "catalog-wikipedia");
        assert_eq!(m.fields["cover"], json!("https://upload/x.jpg")); // TMDB's empty cover did not win
        assert_eq!(m.ids[&IdName::new("imdb")], "tt1160419");
        assert_eq!(m.conflicts.len(), 1, "{:?}", m.conflicts);
        assert_eq!(identifying(&kind, &m.ids).len(), 2);
        let _ = KindName::new("movie");
    }
}
