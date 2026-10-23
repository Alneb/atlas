//! The vault's own routing, without code: `.atlas/catalog/rules.yaml`, a list of `when` → `then`, applied in order
//! after the merge. A rule can send a thing to another folder, add tags, set properties, and switch a linked service
//! off or give it options (a Linkwarden collection). The kind's own `links:` is the starting point; rules refine it.
//!
//! ```yaml
//! - name: documentaries apart
//!   when: { kind: movie, fields: { genres: Documentary } }
//!   then: { folder: Films/Documentaries, tags: [doc] }
//! - when: { site: "*.substack.com" }
//!   then: { tags: [newsletter], links: { catalog-linkwarden: { collection: Newsletters } } }
//! - when: { kind: paper }
//!   then: { links: { catalog-linkwarden: false } }
//! ```
use crate::contrib::OneOrMany;
use crate::kind::{text_of, Kind};
use crate::model::{Fields, PluginId};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

pub const RULES_FILE: &str = ".atlas/catalog/rules.yaml";

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rule {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub when: When,
    pub then: Then,
}

/// All given conditions must hold; an empty `when` matches everything.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct When {
    pub kind: Option<OneOrMany>,
    /// the address's host: `example.org` (and its subdomains) or `*.example.org`
    pub site: Option<String>,
    /// field → a value it equals or (for a list) contains, case-insensitive; or `{ matches: <regex> }`
    pub fields: BTreeMap<String, Match>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Match {
    // first: an untagged `Is(Value)` would take any map, `{ matches: … }` included
    Pattern {
        #[serde(with = "serde_regex_str")]
        matches: regex::Regex,
    },
    Is(Value),
}

mod serde_regex_str {
    use serde::{Deserialize, Deserializer};
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<regex::Regex, D::Error> {
        let s = String::deserialize(d)?;
        regex::RegexBuilder::new(&s).case_insensitive(true).build().map_err(serde::de::Error::custom)
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Then {
    pub folder: Option<String>,
    pub tags: Vec<String>,
    pub set: Fields,
    pub links: BTreeMap<PluginId, LinkChoice>,
}

/// A linked service for this thing: `false` (not this one), `true`, or options handed to its tool.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(untagged)]
pub enum LinkChoice {
    Switch(bool),
    Options(Map<String, Value>),
}

impl LinkChoice {
    pub fn on(&self) -> bool {
        !matches!(self, LinkChoice::Switch(false))
    }
    pub fn options(&self) -> Value {
        match self {
            LinkChoice::Options(o) => Value::Object(o.clone()),
            LinkChoice::Switch(_) => Value::Object(Map::new()),
        }
    }
}

/// Where and how one thing is filed, after the kind and the rules.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Placement {
    pub folder: String,
    pub tags: Vec<String>,
    pub set: Fields,
    pub links: BTreeMap<PluginId, LinkChoice>,
    /// the rules that applied, by name or number, for the narration
    pub applied: Vec<String>,
}

impl Placement {
    /// The fields with the rules' properties set and their tags added to `tags`.
    pub fn apply(&self, fields: &Fields) -> Fields {
        let mut out = fields.clone();
        out.extend(self.set.clone());
        if !self.tags.is_empty() {
            let mut tags: Vec<Value> = match out.get("tags") {
                Some(Value::Array(a)) => a.clone(),
                Some(Value::String(s)) if !s.is_empty() => vec![Value::String(s.clone())],
                _ => Vec::new(),
            };
            for t in &self.tags {
                if !tags.iter().any(|x| text_of(x).eq_ignore_ascii_case(t)) {
                    tags.push(Value::String(t.clone()));
                }
            }
            out.insert("tags".into(), Value::Array(tags));
        }
        out
    }

    /// The properties the rules add, which the note owns beside the kind's.
    pub fn keys(&self) -> Vec<String> {
        let mut k: Vec<String> = self.set.keys().cloned().collect();
        if !self.tags.is_empty() {
            k.push("tags".into());
        }
        k
    }
}

fn host_of(url: &str) -> Option<String> {
    let rest = url.split_once("://")?.1;
    let host = rest.split(['/', '?', '#']).next()?.to_ascii_lowercase();
    Some(host.trim_start_matches("www.").to_string())
}

fn site_matches(want: &str, host: &str) -> bool {
    let want = want.trim().trim_start_matches("*.").to_ascii_lowercase();
    host == want || host.ends_with(&format!(".{want}"))
}

fn value_matches(m: &Match, v: &Value) -> bool {
    match (m, v) {
        (Match::Pattern { matches }, Value::Array(a)) => a.iter().any(|x| matches.is_match(&text_of(x))),
        (Match::Pattern { matches }, v) => matches.is_match(&text_of(v)),
        (Match::Is(want), Value::Array(a)) => a.iter().any(|x| text_of(x).eq_ignore_ascii_case(&text_of(want))),
        (Match::Is(want), v) => text_of(v).eq_ignore_ascii_case(&text_of(want)),
    }
}

impl When {
    fn holds(&self, kind: &Kind, fields: &Fields, url: Option<&str>) -> bool {
        if self.kind.as_ref().is_some_and(|k| !k.has(&kind.name)) {
            return false;
        }
        if let Some(site) = &self.site {
            let host = url.and_then(host_of).or_else(|| fields.get("site").map(text_of));
            if !host.is_some_and(|h| site_matches(site, &h)) {
                return false;
            }
        }
        self.fields.iter().all(|(k, m)| fields.get(k).is_some_and(|v| value_matches(m, v)))
    }
}

/// The kind's defaults, then every rule that holds, in file order.
pub fn place(kind: &Kind, rules: &[Rule], fields: &Fields, url: Option<&str>) -> Placement {
    let mut p = Placement { folder: kind.folder.clone(), links: kind.links.clone(), ..Placement::default() };
    for (i, r) in rules.iter().enumerate() {
        if !r.when.holds(kind, fields, url) {
            continue;
        }
        if let Some(f) = &r.then.folder {
            p.folder = f.trim_end_matches('/').to_string();
        }
        for t in &r.then.tags {
            if !p.tags.contains(t) {
                p.tags.push(t.clone());
            }
        }
        p.set.extend(r.then.set.clone());
        p.links.extend(r.then.links.clone());
        p.applied.push(r.name.clone().unwrap_or_else(|| format!("rule {}", i + 1)));
    }
    p
}

/// Every folder a kind's notes may be in (its own and any rule's), for deduplication.
pub fn folders(kind: &Kind, rules: &[Rule]) -> Vec<String> {
    let mut out = vec![kind.folder.trim_end_matches('/').to_string()];
    for r in rules {
        if r.when.kind.as_ref().is_none_or(|k| k.has(&kind.name)) {
            if let Some(f) = &r.then.folder {
                let f = f.trim_end_matches('/').to_string();
                if !out.iter().any(|o| f.starts_with(&format!("{o}/")) || *o == f) {
                    out.push(f);
                }
            }
        }
    }
    out
}

pub fn parse(text: &str) -> Result<Vec<Rule>, String> {
    if text.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_yaml::from_str(text).map_err(|e| format!("{RULES_FILE}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kind::Kinds;
    use crate::model::KindName;
    use serde_json::json;

    const RULES: &str = "
- name: documentaries apart
  when: { kind: movie, fields: { genres: documentary } }
  then: { folder: Films/Documentaries, tags: [doc] }
- when: { site: '*.substack.com' }
  then: { tags: [newsletter], links: { catalog-linkwarden: { collection: Newsletters } } }
- when: { kind: article, fields: { title: { matches: '^\\[pdf\\]' } } }
  then: { set: { format: pdf }, links: { catalog-linkwarden: false } }
";

    #[test]
    fn rules_route_tag_set_and_switch_links_in_order() {
        let rules = parse(RULES).unwrap();
        let article = Kinds::builtin().get(&KindName::new("article")).unwrap().clone();
        let f: Fields = serde_json::from_value(json!({"title": "Weekly notes", "tags": ["clip"]})).unwrap();
        let p = place(&article, &rules, &f, Some("https://someone.substack.com/p/x"));
        assert_eq!(p.folder, "notes/clips");
        assert_eq!(p.applied, ["rule 2"]);
        assert_eq!(p.links[&PluginId::new("catalog-linkwarden")].options(), json!({"collection": "Newsletters"}));
        assert_eq!(p.apply(&f)["tags"], json!(["clip", "newsletter"]));

        let f: Fields = serde_json::from_value(json!({"title": "[PDF] A report"})).unwrap();
        let p = place(&article, &rules, &f, Some("https://example.org/r.pdf"));
        assert!(!p.links[&PluginId::new("catalog-linkwarden")].on());
        assert_eq!(p.apply(&f)["format"], json!("pdf"));

        let movie: Kind = serde_yaml::from_str("name: movie\nfolder: Films\nids: [{ id: tmdb }]\n").unwrap();
        let f: Fields = serde_json::from_value(json!({"title": "Free Solo", "genres": ["Documentary", "Sport"]})).unwrap();
        let p = place(&movie, &rules, &f, None);
        assert_eq!((p.folder.as_str(), p.applied.as_slice()), ("Films/Documentaries", &["documentaries apart".to_string()][..]));
        assert_eq!(folders(&movie, &rules), ["Films"], "a subfolder of the library is searched with it");
    }

    #[test]
    fn a_typo_in_the_rules_is_an_error_naming_the_file() {
        let e = parse("- when: { kidn: movie }\n  then: {}\n").unwrap_err();
        assert!(e.starts_with(RULES_FILE) && e.contains("unknown field"), "{e}");
    }
}
