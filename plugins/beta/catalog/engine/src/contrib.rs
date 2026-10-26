//! What subplugins give the catalog: each enabled plugin's `[contributes.catalog]` table (handed over by the core,
//! which does not read it), checked here and gathered into one [`Registry`]. A bad table costs only that plugin's
//! piece, said in the narration, never the whole catalog.
use crate::kind::{Kind, Kinds, Origin};
use crate::model::{IdName, KindName, Narration, PluginId, Stage};
use serde::Deserialize;
use serde_json::Value;

/// `[contributes.catalog]` of one plugin.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Contribution {
    /// kinds this plugin brings (a vault's `.atlas/kinds/` file of the same name wins)
    pub kinds: Vec<Kind>,
    /// text → (kind, ID) by a regular expression, so recognising starts no process
    pub recognize: Vec<PatternSpec>,
    /// recognising by code, for what a pattern cannot say: a tool `{ text, url }` → `{ candidates: [{ kind, ids }] }`,
    /// asked only when no pattern knew the text
    pub recognizers: Vec<RecognizerSpec>,
    /// metadata for a kind, answered by one of the plugin's tools
    pub sources: Vec<SourceSpec>,
    /// a service holding the same thing, kept in step by a tool
    pub links: Vec<LinkSpec>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PatternSpec {
    pub pattern: String,
    pub kind: KindName,
    pub id: IdName,
    /// the capture group holding the ID (default 1; 0 = the whole match)
    #[serde(default = "one")]
    pub group: usize,
}

fn one() -> usize {
    1
}

/// One name or several: `kind = "movie"`, `kind = ["movie", "show"]`, or `kind = "*"` for every kind (Linkwarden keeps
/// every captured link, whatever it turned out to be).
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum OneOrMany {
    One(KindName),
    Many(Vec<KindName>),
}

impl OneOrMany {
    pub fn has(&self, k: &KindName) -> bool {
        match self {
            OneOrMany::One(x) => x == k || x.as_str() == "*",
            OneOrMany::Many(xs) => xs.contains(k),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RecognizerSpec {
    pub tool: String,
}

/// How a source is asked: exactly one of `tool = "…"` (the plugin's own), `api = "/api/…"` (a core route, POSTed)
/// or `engine = "clip"` (read by this engine itself).
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase", from = "ViaSpec")]
pub enum Via {
    Tool(String),
    Api(String),
    Engine(EngineSource),
}

/// What the catalog engine answers itself, with no plugin program behind it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineSource {
    /// A web page read here: its own metadata and readable text (clip.rs; the page fetched through the core).
    Clip,
}

/// [`Via`] as written. `api = "/api/clip"` was the clip's name when the core read pages, in manifests still installed.
#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum ViaSpec {
    Tool(String),
    Api(String),
    Engine(EngineSource),
}

impl From<ViaSpec> for Via {
    fn from(v: ViaSpec) -> Self {
        match v {
            ViaSpec::Tool(t) => Via::Tool(t),
            ViaSpec::Api(a) if a == "/api/clip" => Via::Engine(EngineSource::Clip),
            ViaSpec::Api(a) => Via::Api(a),
            ViaSpec::Engine(e) => Via::Engine(e),
        }
    }
}

impl std::fmt::Display for Via {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Via::Tool(t) => write!(f, "tool {t}"),
            Via::Api(a) => write!(f, "{a}"),
            Via::Engine(EngineSource::Clip) => write!(f, "the page itself"),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct SourceSpec {
    pub kind: OneOrMany,
    /// who answers: the plugin's `[[tool]]`, a core API (`api = "/api/…"`, POSTed) or this engine (`engine = "clip"`)
    /// — so a subplugin made only of a manifest can use what is already there. Input `{ kind, ids, url }` → `{ kind?, ids?, fields }`
    /// (or `{ signin }`)
    #[serde(flatten)]
    pub via: Via,
    /// higher wins a field no kind priority decides (default 50)
    #[serde(default = "fifty")]
    pub priority: i32,
    /// the IDs it needs at least one of (empty: any; e.g. TMDB needs `tmdb` or `imdb`, a search source none);
    /// `url` is also met by the address the thing was captured from
    #[serde(default)]
    pub needs: Vec<IdName>,
}

fn fifty() -> i32 {
    50
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LinkSpec {
    pub kind: OneOrMany,
    /// the plugin's `[[tool]]`: input `{ kind, ids, path, props }` → `{ fields?, url? }`
    pub tool: String,
    /// how often to sync on its own: `"30m"`, `"6h"`, `"1d"`; none = only when asked
    #[serde(default)]
    pub every: Option<String>,
}

/// A compiled pattern with its plugin.
#[derive(Debug, Clone)]
pub struct Pattern {
    pub plugin: PluginId,
    pub re: regex::Regex,
    pub kind: KindName,
    pub id: IdName,
    pub group: usize,
}

#[derive(Debug, Clone)]
pub struct Source {
    pub plugin: PluginId,
    pub spec: SourceSpec,
}

#[derive(Debug, Clone)]
pub struct Link {
    pub plugin: PluginId,
    pub spec: LinkSpec,
}

/// Everything the enabled subplugins contribute, checked.
#[derive(Debug, Clone, Default)]
pub struct Registry {
    pub kinds: Kinds,
    pub patterns: Vec<Pattern>,
    pub recognizers: Vec<(PluginId, RecognizerSpec)>,
    pub sources: Vec<Source>,
    pub links: Vec<Link>,
    /// the vault's `.atlas/catalog/rules.yaml` (filled in by the engine's load)
    pub rules: Vec<crate::rules::Rule>,
}

impl Registry {
    /// From the core's `{ "<plugin id>": <its contributes.catalog table as JSON>, … }`, on top of `kinds`
    /// (the catalog's own); each problem is narrated and skipped.
    pub fn build(mut kinds: Kinds, contributions: &serde_json::Map<String, Value>, say: &mut Narration) -> Registry {
        let mut patterns = Vec::new();
        let mut recognizers = Vec::new();
        let mut sources = Vec::new();
        let mut links = Vec::new();
        for (id, table) in contributions {
            let plugin = PluginId::new(id.clone());
            let c: Contribution = match serde_json::from_value(table.clone()) {
                Ok(c) => c,
                Err(e) => {
                    say.problem(Stage::Load, format!("{id}: its [contributes.catalog] is not understood ({e}); left out"));
                    continue;
                }
            };
            let n = (c.kinds.len(), c.recognize.len(), c.sources.len(), c.links.len());
            for k in c.kinds {
                kinds.put(k, Origin::Plugin(plugin.clone()));
            }
            for p in c.recognize {
                match regex::Regex::new(&p.pattern) {
                    Ok(re) if p.group < re.captures_len() => patterns.push(Pattern { plugin: plugin.clone(), re, kind: p.kind, id: p.id, group: p.group }),
                    Ok(_) => say.problem(Stage::Load, format!("{id}: pattern {:?} has no group {}; left out", p.pattern, p.group)),
                    Err(e) => say.problem(Stage::Load, format!("{id}: pattern {:?} does not compile ({e}); left out", p.pattern)),
                }
            }
            recognizers.extend(c.recognizers.into_iter().map(|r| (plugin.clone(), r)));
            sources.extend(c.sources.into_iter().map(|spec| Source { plugin: plugin.clone(), spec }));
            links.extend(c.links.into_iter().map(|spec| Link { plugin: plugin.clone(), spec }));
            say.say(Stage::Load, format!("{id}: {} kinds, {} patterns, {} sources, {} links", n.0, n.1, n.2, n.3));
        }
        Registry { kinds, patterns, recognizers, sources, links, rules: Vec::new() }
    }

    /// The sources for a kind, best first (priority, then plugin id so the order never wobbles).
    pub fn sources_for(&self, kind: &KindName) -> Vec<&Source> {
        let mut v: Vec<&Source> = self.sources.iter().filter(|s| s.spec.kind.has(kind)).collect();
        v.sort_by(|a, b| b.spec.priority.cmp(&a.spec.priority).then_with(|| a.plugin.cmp(&b.plugin)));
        v
    }

    pub fn links_for(&self, kind: &KindName) -> Vec<&Link> {
        self.links.iter().filter(|l| l.spec.kind.has(kind)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_bad_table_or_pattern_costs_only_its_piece() {
        let c = json!({
            "catalog-tmdb": {
                "recognize": [{ "pattern": "themoviedb\\.org/movie/(\\d+)", "kind": "movie", "id": "tmdb" }, { "pattern": "(unclosed", "kind": "movie", "id": "tmdb" }],
                "sources": [{ "kind": ["movie", "show"], "tool": "lookup", "priority": 60 }],
                "kinds": [{ "name": "movie", "folder": "Films", "ids": [{ "id": "tmdb" }] }]
            },
            "catalog-typo": { "sourcess": [] },
            "catalog-wiki": { "sources": [{ "kind": "movie", "tool": "summary" }] }
        });
        let mut say = Narration::default();
        let r = Registry::build(Kinds::builtin(), c.as_object().unwrap(), &mut say);
        assert_eq!(r.patterns.len(), 1);
        assert!(r.kinds.get(&KindName::new("movie")).is_some());
        assert!(r.kinds.get(&KindName::new("article")).is_some());
        let order: Vec<&str> = r.sources_for(&KindName::new("movie")).iter().map(|s| s.plugin.as_str()).collect();
        assert_eq!(order, ["catalog-tmdb", "catalog-wiki"]);
        let problems: Vec<&str> = say.0.iter().filter(|s| s.problem).map(|s| s.explanation.as_str()).collect();
        assert_eq!(problems.len(), 2, "{problems:?}");
        assert!(problems.iter().any(|p| p.starts_with("catalog-typo")));
    }

    #[test]
    fn the_page_reader_is_the_engines_own_source_and_its_old_name_still_reads() {
        let spec = |v: serde_json::Value| serde_json::from_value::<SourceSpec>(v).unwrap().via;
        assert_eq!(spec(serde_json::json!({ "kind": "*", "engine": "clip" })), Via::Engine(EngineSource::Clip));
        assert_eq!(spec(serde_json::json!({ "kind": "*", "api": "/api/clip" })), Via::Engine(EngineSource::Clip), "a manifest from before");
        assert_eq!(spec(serde_json::json!({ "kind": "*", "api": "/api/other" })), Via::Api("/api/other".into()));
        assert!(serde_json::from_value::<SourceSpec>(serde_json::json!({ "kind": "*", "engine": "nope" })).is_err());
    }
}
