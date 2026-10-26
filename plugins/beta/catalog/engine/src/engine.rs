//! The pipeline: load → recognise → dedupe → fetch → merge → write → sync, each stage narrated. All it needs from
//! Atlas goes through [`Host`], so it is tested against a vault in memory and run against the core over the pipe.
use crate::contrib::Registry;
use crate::kind::{Kind, Kinds, Origin, Writer, KINDS_DIR};
use crate::merge::{identifying, merge, Fetched, Merged};
use crate::model::{Fields, Ids, KindName, Narration, PluginId, Stage};
use crate::recognize::{recognise, Candidate};
use crate::rules::{folders, place, Placement, RULES_FILE};
use serde::Serialize;
use serde_json::{json, Map, Value};

pub type Fail = String;

/// What the engine asks of Atlas. Every method is one call to the core.
pub trait Host {
    /// every enabled plugin's `[contributes.catalog]`, by plugin id
    fn contributions(&self) -> Result<Map<String, Value>, Fail>;
    /// `(path, text)` of each `.atlas/kinds/*.yaml`
    fn vault_kinds(&self) -> Result<Vec<(String, String)>, Fail>;
    /// a plugin's `[[tool]]` called through the core (its helper, its secrets, its sign-in)
    fn tool(&self, plugin: &PluginId, tool: &str, input: Value) -> Result<Value, Fail>;
    /// a core API answering a source (`api = "/api/…"`), POSTed with the source's input
    fn api(&self, path: &str, input: Value) -> Result<Value, Fail>;
    /// a web page read for a source (`engine = "clip"`): `{ url }` → `{ kind, ids, fields, text }` (clip.rs)
    fn clip(&self, input: Value) -> Result<Value, Fail>;
    /// every note under `folder` (any depth) with its properties
    fn notes_in(&self, folder: &str) -> Result<Vec<(String, Fields)>, Fail>;
    fn props(&self, path: &str) -> Result<Fields, Fail>;
    /// a vault file's text (None: there is none) — the rules, a kind's template
    fn read(&self, path: &str) -> Result<Option<String>, Fail>;
    fn exists(&self, path: &str) -> Result<bool, Fail>;
    fn create(&self, path: &str, text: &str) -> Result<(), Fail>;
    /// the local time as `YYYY-MM-DD HH:MM`, for a kind's `{now}` / `{today}`
    fn now(&self) -> String;
    fn set_property(&self, path: &str, key: &str, value: &Value) -> Result<(), Fail>;
}

/// A service in front that wants a sign-in before it answers (the core's fetch says so: Authelia's portal, an OIDC
/// provider); handed back to whoever asked so the user can be offered the sign-in.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SignIn {
    pub plugin: PluginId,
    pub detail: Value,
}

/// What the user chose on the capture card: a kind, and among several things a search found, the one with these IDs.
#[derive(Debug, Clone, Default)]
pub struct Pick {
    pub kind: Option<KindName>,
    pub ids: Option<Ids>,
    /// the user's own fields from a service that holds them (a sync): rating, watched, status, review — over every
    /// source, written and kept in step like a rule's `set`; a `review` goes into a new note's text, never a property
    pub own: Fields,
    /// the note the user says this thing is (an old note named otherwise: "Inglorious Basterds" for TMDB's
    /// "Inglourious Basterds"), instead of looking for one
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Preview {
    pub candidate: Candidate,
    pub label: String,
    pub merged: Merged,
    /// where the note is (when it exists) or would go
    pub path: String,
    pub exists: bool,
    /// the folder, tags, properties and linked services after the kind and the vault's rules
    pub placement: Placement,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub signin: Vec<SignIn>,
    /// the other things the text might be, for the card's "not this?"
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub others: Vec<Candidate>,
    /// found by searching words, not by an address or an ID in the text: with `others`, a guess to confirm
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub searched: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Created,
    Updated,
    Unchanged,
    /// written by the kind's own feature (papers: Zotero, then the paper notes)
    Delegated,
}

#[derive(Debug, Clone, Serialize)]
pub struct Added {
    pub path: String,
    pub outcome: Outcome,
    pub kind: KindName,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub signin: Vec<SignIn>,
}

/// Every answer carries the run's narration beside its result.
#[derive(Debug, Serialize)]
pub struct Told<T> {
    #[serde(flatten)]
    pub result: T,
    pub steps: Narration,
}

/// What a text could be, by the patterns alone (a struct: `Told` flattens its result into the answer's object).
#[derive(Debug, Serialize)]
pub struct Recognized {
    pub candidates: Vec<Candidate>,
}

/// What one round of sources gave: the merge, the answers it was made from, and a better kind if a source named one.
struct Got {
    merged: Merged,
    answers: Vec<Fetched>,
    /// another kind a source says the thing is, with that source's priority (the most trusted source's word)
    refined: Option<(KindName, i32)>,
}

/// A source at least this trusted (a metadata service, not a page's own tags) may re-kind a thing a pattern recognised.
const RE_KIND_TRUST: i32 = 50;

pub struct Engine<H: Host> {
    pub host: H,
}

impl<H: Host> Engine<H> {
    pub fn new(host: H) -> Self {
        Engine { host }
    }

    /// The catalog's kinds, the subplugins' contributions, and the vault's own kind files over both.
    pub fn load(&self, say: &mut Narration) -> Registry {
        let contributions = self.host.contributions().unwrap_or_else(|e| {
            say.problem(Stage::Load, format!("the subplugins' contributions could not be read ({e}); only web pages are known"));
            Map::new()
        });
        let mut reg = Registry::build(Kinds::builtin(), &contributions, say);
        match self.host.vault_kinds() {
            Ok(files) => {
                for (path, text) in files {
                    match Kinds::parse_vault_file(&path, &text) {
                        Ok(k) => {
                            say.say(Stage::Load, format!("{path}: the vault's own {} kind", k.name));
                            reg.kinds.put(k, Origin::Vault(path));
                        }
                        Err(e) => say.problem(Stage::Load, format!("{e}; left out")),
                    }
                }
            }
            Err(e) => say.problem(Stage::Load, format!("{KINDS_DIR} could not be read ({e})")),
        }
        match self.host.read(RULES_FILE).map(|t| t.map(|t| crate::rules::parse(&t))) {
            Ok(None) => {}
            Ok(Some(Ok(rules))) => {
                say.say(Stage::Load, format!("{RULES_FILE}: {} rules", rules.len()));
                reg.rules = rules;
            }
            Ok(Some(Err(e))) | Err(e) => say.problem(Stage::Load, format!("{e}; no rules applied until it is fixed")),
        }
        reg
    }

    pub fn recognize(&self, text: &str) -> Told<Recognized> {
        let mut say = Narration::default();
        let reg = self.load(&mut say);
        let candidates = recognise(&reg, text);
        say.say(Stage::Recognise, describe(&candidates));
        Told { result: Recognized { candidates }, steps: say }
    }

    /// Everything `add` would do, nothing written: the capture card shows this.
    pub fn preview(&self, text: &str, pick: &Pick) -> Result<Told<Preview>, Fail> {
        let mut say = Narration::default();
        let reg = self.load(&mut say);
        let p = self.look(&reg, text, pick, &mut say)?;
        Ok(Told { result: p, steps: say })
    }

    pub fn add(&self, text: &str, pick: &Pick) -> Result<Told<Added>, Fail> {
        let mut say = Narration::default();
        let reg = self.load(&mut say);
        let p = self.look(&reg, text, pick, &mut say)?;
        // words that several things match: never filed on a guess (the card, or the agent, picks one by its IDs)
        if p.searched && !p.others.is_empty() && pick.ids.is_none() {
            let all: Vec<String> = std::iter::once(&p.candidate).chain(&p.others).map(|c| format!("{} [{}]", c.label.as_deref().unwrap_or(c.kind.as_str()), show_ids(&c.ids))).collect();
            return Err(format!("several things match \"{text}\": {}; pick one by its ids", all.join("; ")));
        }
        let kind = reg.kinds.get(&p.candidate.kind).ok_or("the kind went away")?.clone();
        let (path, outcome) = self.write(&kind, &p, &mut say)?;
        let mut signin = p.signin;
        self.sync(&reg, &kind, &path, &p.merged, &p.placement, &mut signin, &mut say);
        Ok(Told { result: Added { path, outcome, kind: kind.name, signin }, steps: say })
    }

    /// Fetch again for a note the catalog knows, and bring its owned properties up to date.
    pub fn refresh(&self, path: &str) -> Result<Told<Added>, Fail> {
        let mut say = Narration::default();
        let reg = self.load(&mut say);
        let props = self.host.props(path)?;
        let (kind, ids) = reg
            .kinds
            .iter()
            .map(|(k, _)| k)
            .filter(|k| folders(k, &reg.rules).iter().any(|f| path.starts_with(&format!("{f}/"))))
            .map(|k| (k, k.ids_in(&props)))
            .find(|(_, ids)| !ids.is_empty())
            .ok_or_else(|| format!("{path} is not a note of any kind the catalog knows (no kind's folder with its IDs)"))?;
        let kind = kind.clone();
        say.say(Stage::Recognise, format!("{path}: a {} ({})", kind.label(), show_ids(&ids)));
        let candidate = Candidate { kind: kind.name.clone(), url: None, ids, by: Vec::new(), label: None };
        let mut signin = Vec::new();
        let Got { mut merged, answers, .. } = self.fetch(&reg, &kind, &candidate, &[], &mut signin, &mut say);
        let placement = self.placed(&reg, &kind, &mut merged, None, &mut say);
        let mut outcome = self.update(&kind, path, &merged, &placement, &props, false, &mut say)?;
        if self.describe_again(&kind, path, &merged, &answers, &mut say)? {
            outcome = Outcome::Updated;
        }
        self.sync(&reg, &kind, path, &merged, &placement, &mut signin, &mut say);
        Ok(Told { result: Added { path: path.into(), outcome, kind: kind.name, signin }, steps: say })
    }

    fn look(&self, reg: &Registry, text: &str, pick: &Pick, say: &mut Narration) -> Result<Preview, Fail> {
        let mut all = recognise(reg, text);
        let searched = all.is_empty();
        if all.iter().all(|c| c.by.is_empty()) {
            // no pattern knew it (at most the web-page fallback): the subplugins' own recognisers, by code
            let mut found = self.ask_recognizers(reg, text, all.first().and_then(|c| c.url.clone()), say);
            found.append(&mut all);
            all = found;
        }
        say.say(Stage::Recognise, describe(&all));
        if let Some(k) = &pick.kind {
            all.retain(|c| &c.kind == k);
        }
        let at = match &pick.ids {
            // the one the card picked: it shares an ID with the choice
            Some(ids) => all.iter().position(|c| c.ids.iter().any(|(k, v)| ids.get(k) == Some(v))).ok_or("the chosen thing is no longer among the matches")?,
            None if all.is_empty() => return Err(match &pick.kind {
                Some(k) => format!("the text is not a {k}"),
                None => "nothing to catalogue: no link, identifier or search result any source knows".into(),
            }),
            None => 0,
        };
        let mut candidate = all.remove(at);
        let mut kind = reg.kinds.get(&candidate.kind).ok_or_else(|| format!("{} is recognised but no plugin or vault file declares that kind", candidate.kind))?;
        let mut signin = Vec::new();
        let mut got = self.fetch(reg, kind, &candidate, &[], &mut signin, say);
        // a link no pattern knew, read by its source, may turn out to be a film, a video, an album (og:type, JSON-LD):
        // follow it once, keeping what the page said as one more answer — unless the user picked the kind. A kind a
        // pattern gave (a YouTube Music song, an IMDb film) is changed only by a trusted source (TMDB: a series), never
        // by the page's own tags, and never back to a plain web page.
        if let (None, Some((k, trust))) = (&pick.kind, got.refined.clone()) {
            let allowed = candidate.by.is_empty() || (trust >= RE_KIND_TRUST && k != KindName::new(crate::kind::WEB_PAGE));
            if let Some(better) = reg.kinds.get(&k).filter(|b| allowed && b.name != kind.name) {
                say.say(Stage::Recognise, format!("the page says it is a {} — asking that kind's sources", better.label()));
                candidate = Candidate { kind: better.name.clone(), ids: got.merged.ids.clone(), url: candidate.url, by: candidate.by, label: candidate.label };
                kind = better;
                got = self.fetch(reg, kind, &candidate, &got.answers, &mut signin, say);
            }
        }
        let mut merged = got.merged;
        // the address it was captured from stays with it (`source`), whatever else identifies it
        if let Some(u) = &candidate.url {
            let id = crate::model::IdName::new("url");
            let canonical = crate::model::normalise(&id, u);
            merged.ids.entry(id).or_insert(canonical);
        }
        titled(kind, &mut merged, candidate.url.as_deref(), say);
        if !merged.fields.contains_key("title") && kind.name.as_str() != crate::kind::WEB_PAGE {
            let problems: Vec<String> = say.problems().into_iter().filter(|p| p.contains(':')).collect();
            return Err(format!("no source knew this {} ({}){}", kind.label().to_lowercase(), show_ids(&merged.ids), if problems.is_empty() { String::new() } else { format!(": {}", problems.join("; ")) }));
        }
        let mut placement = self.placed(reg, kind, &mut merged, candidate.url.as_deref(), say);
        if !pick.own.is_empty() {
            say.say(Stage::Merge, format!("yours: {}", pick.own.keys().cloned().collect::<Vec<_>>().join(", ")));
            merged.fields.extend(pick.own.clone());
            placement.set.extend(pick.own.clone().into_iter().filter(|(k, _)| k != "review"));
        }
        let existing = match &pick.note {
            Some(note) if self.host.exists(note)? => {
                say.say(Stage::Dedupe, format!("{note}: the note you chose"));
                Some(note.clone())
            }
            Some(note) => return Err(format!("{note}: no such note")),
            None => self.find(kind, &folders(kind, &reg.rules), &merged.ids, &merged.fields, say)?,
        };
        let (path, exists) = match existing {
            Some(p) => (p, true),
            None => (kind.note_path_in(&placement.folder, &merged.fields), false),
        };
        Ok(Preview { label: kind.label().to_string(), candidate, merged, path, exists, placement, signin, others: all, searched })
    }

    /// The kind's defaults and the vault's rules applied: the fields get the rules' tags and properties.
    fn placed(&self, reg: &Registry, kind: &Kind, merged: &mut Merged, url: Option<&str>, say: &mut Narration) -> Placement {
        let p = place(kind, &reg.rules, &merged.fields, url);
        if !p.applied.is_empty() {
            say.say(Stage::Merge, format!("rules applied: {} → {}/", p.applied.join(", "), p.folder));
        }
        merged.fields = p.apply(&merged.fields);
        p
    }

    /// The recognisers subplugins wrote as code, each asked once; an unknown kind or a failure is narrated and skipped.
    fn ask_recognizers(&self, reg: &Registry, text: &str, url: Option<String>, say: &mut Narration) -> Vec<Candidate> {
        let mut out = Vec::new();
        for (plugin, r) in &reg.recognizers {
            match self.host.tool(plugin, &r.tool, json!({ "text": text, "url": url })) {
                Ok(v) => {
                    for c in v.get("candidates").and_then(Value::as_array).into_iter().flatten() {
                        let Some(kind) = c.get("kind").and_then(Value::as_str).map(KindName::new) else { continue };
                        if reg.kinds.get(&kind).is_none() {
                            say.problem(Stage::Recognise, format!("{plugin}: says {kind}, a kind nothing declares"));
                            continue;
                        }
                        let ids: Ids = c.get("ids").cloned().and_then(|x| serde_json::from_value::<Ids>(x).ok()).unwrap_or_default();
                        let ids = ids.into_iter().map(|(k, v)| { let n = crate::model::normalise(&k, &v); (k, n) }).collect();
                        let label = c.get("label").and_then(Value::as_str).map(str::to_string);
                        out.push(Candidate { kind, ids, url: url.clone(), by: vec![plugin.clone()], label });
                    }
                }
                Err(e) => say.problem(Stage::Recognise, format!("{plugin}: {e}")),
            }
        }
        out
    }

    /// Ask every source of the kind whose needed IDs are known; IDs one source finds can unlock another, so up to
    /// three rounds, each source asked once.
    fn fetch(&self, reg: &Registry, kind: &Kind, c: &Candidate, prior: &[Fetched], signin: &mut Vec<SignIn>, say: &mut Narration) -> Got {
        let mut answers: Vec<Fetched> = prior.to_vec();
        let mut refined: Option<(KindName, i32)> = None;
        let mut asked: Vec<(PluginId, String)> = Vec::new();
        let mut retried: Vec<PluginId> = Vec::new();
        let mut ids = c.ids.clone();
        for _round in 0..3 {
            let ready: Vec<_> = reg
                .sources_for(&kind.name)
                .into_iter()
                .filter(|s| !asked.contains(&(s.plugin.clone(), s.spec.via.to_string())))
                // `needs = ["url"]` is also met by the address the thing was captured from
                .filter(|s| s.spec.needs.is_empty() || s.spec.needs.iter().any(|n| ids.contains_key(n) || (n.as_str() == "url" && c.url.is_some())))
                .collect();
            if ready.is_empty() {
                break;
            }
            for s in ready {
                asked.push((s.plugin.clone(), s.spec.via.to_string()));
                let url = c.url.clone().or_else(|| ids.get(&crate::model::IdName::new("url")).cloned());
                // `languages`: where the vault keeps original titles, so a source can answer in that language too;
                // `hints`: what earlier answers said (a page's artist and title, for a source that searches by them)
                let hints: Fields = answers.iter().flat_map(|a| a.fields.iter()).filter(|(k, _)| k.as_str() != "text").map(|(k, v)| (k.clone(), v.clone())).rev().collect();
                let input = json!({ "kind": kind.name, "ids": ids, "url": url, "languages": kind.original_title, "hints": hints });
                let answer = match &s.spec.via {
                    crate::contrib::Via::Tool(t) => self.host.tool(&s.plugin, t, input),
                    crate::contrib::Via::Api(path) => self.host.api(path, input),
                    crate::contrib::Via::Engine(crate::contrib::EngineSource::Clip) => self.host.clip(input),
                };
                match answer {
                    Ok(v) if v.get("signin").is_some() => {
                        say.problem(Stage::Fetch, format!("{}: the service wants a sign-in first", s.plugin));
                        signin.push(SignIn { plugin: s.plugin.clone(), detail: v["signin"].clone() });
                    }
                    // "ask me again with what the others find" (a search source before the page has said a title)
                    Ok(v) if v.get("later").and_then(Value::as_bool) == Some(true) && !retried.contains(&s.plugin) => {
                        retried.push(s.plugin.clone());
                        asked.retain(|a| a.0 != s.plugin || a.1 != s.spec.via.to_string());
                        say.say(Stage::Fetch, format!("{}: waits for what the others find", s.plugin));
                    }
                    Ok(v) if v.get("later").and_then(Value::as_bool) == Some(true) => say.say(Stage::Fetch, format!("{}: nothing to go on", s.plugin)),
                    Ok(v) => {
                        if let Some(k) = v.get("kind").and_then(Value::as_str).filter(|k| *k != kind.name.as_str()) {
                            if refined.as_ref().is_none_or(|(_, p)| s.spec.priority > *p) {
                                refined = Some((KindName::new(k), s.spec.priority));
                            }
                        }
                        let f = Fetched {
                            plugin: s.plugin.clone(),
                            priority: s.spec.priority,
                            ids: v.get("ids").cloned().and_then(|x| serde_json::from_value(x).ok()).unwrap_or_default(),
                            fields: {
                                let mut f: Fields = v.get("fields").cloned().and_then(|x| serde_json::from_value(x).ok()).unwrap_or_default();
                                // a source may answer its readable text beside its fields (the clip does)
                                if let Some(t) = v.get("text").filter(|t| t.as_str().is_some_and(|t| !t.trim().is_empty())) {
                                    f.entry("text".into()).or_insert_with(|| t.clone());
                                }
                                f
                            },
                        };
                        say.say(Stage::Fetch, format!("{}: {} fields{}", s.plugin, f.fields.len(), if f.ids.is_empty() { String::new() } else { format!(", IDs {}", show_ids(&f.ids)) }));
                        for (k, v) in &f.ids {
                            ids.entry(k.clone()).or_insert_with(|| crate::model::normalise(k, v));
                        }
                        answers.push(f);
                    }
                    Err(e) => say.problem(Stage::Fetch, format!("{}: {e}", s.plugin)),
                }
            }
        }
        if asked.is_empty() {
            say.say(Stage::Fetch, format!("no source for {} is switched on: the note gets only what the text says", kind.label()));
        }
        let m = merge(kind, &c.ids, &answers);
        for c in &m.conflicts {
            say.problem(Stage::Merge, format!("IDs disagree — {c}"));
        }
        say.say(Stage::Merge, format!("{} fields from {} sources", m.fields.len(), answers.len()));
        Got { merged: m, answers, refined }
    }

    /// The note already holding one of these IDs, searched in the kind's library; else one with none of the kind's IDs
    /// (written by hand, or before the catalog) named as the thing is.
    fn find(&self, kind: &Kind, folders: &[String], ids: &Ids, fields: &Fields, say: &mut Narration) -> Result<Option<String>, Fail> {
        let wanted = identifying(kind, ids);
        let mut notes = Vec::new();
        for f in folders {
            notes.extend(self.host.notes_in(f)?);
        }
        for (path, props) in &notes {
            let have = kind.ids_in(props);
            if let Some((id, v)) = wanted.iter().find(|(id, v)| have.get(*id) == Some(*v)) {
                say.say(Stage::Dedupe, format!("already in the library: {path} (same {id} {v})"));
                return Ok(Some(path.clone()));
            }
        }
        if let Some((path, _)) = notes.iter().find(|(path, props)| kind.ids_in(props).is_empty() && named_as(path, props, fields)) {
            say.say(Stage::Dedupe, format!("already in the library: {path} (a note of that name without IDs: they are added to it)"));
            return Ok(Some(path.clone()));
        }
        say.say(Stage::Dedupe, format!("new to {}/", kind.folder));
        Ok(None)
    }

    fn write(&self, kind: &Kind, p: &Preview, say: &mut Narration) -> Result<(String, Outcome), Fail> {
        match &kind.writer {
            Writer::Plugin { plugin, tool } => {
                let input = json!({ "kind": kind.name, "ids": p.merged.ids, "fields": p.merged.fields, "url": p.candidate.url, "exists": p.exists.then_some(&p.path) });
                let v = self.host.tool(plugin, tool, input).map_err(|e| format!("{plugin} could not add it: {e}"))?;
                let path = v.get("path").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| p.path.clone());
                say.say(Stage::Write, format!("handed to {plugin} ({tool}), which keeps these notes: {path}"));
                if !p.exists {
                    crate::collection::ensure(&self.host, kind, say)?;
                }
                Ok((path, Outcome::Delegated))
            }
            Writer::Catalog if p.exists => {
                let current = self.host.props(&p.path)?;
                // a note written before the catalog, found by its name: what it says stays, only its gaps are filled
                let only_gaps = kind.ids_in(&current).is_empty();
                let outcome = self.update(kind, &p.path, &p.merged, &p.placement, &current, only_gaps, say)?;
                let reviewed = self.review_added(&p.path, &p.merged, say)?;
                Ok((p.path.clone(), if reviewed { Outcome::Updated } else { outcome }))
            }
            Writer::Catalog => {
                let path = self.free_path(&p.path)?;
                let template = match &kind.template {
                    Some(t) => Some(self.host.read(t)?.ok_or_else(|| format!("the {} kind's template {t} is missing", kind.name))?),
                    None => None,
                };
                crate::collection::ensure(&self.host, kind, say)?;
                self.host.create(&path, &crate::note::render(kind, &p.merged, &p.placement.keys(), template.as_deref(), &self.host.now()))?;
                say.say(Stage::Write, format!("wrote {path}"));
                Ok((path, Outcome::Created))
            }
        }
    }

    /// `only_gaps`: a property that already says something is left as it is.
    #[allow(clippy::too_many_arguments)]
    fn update(&self, kind: &Kind, path: &str, m: &Merged, placement: &Placement, current: &Fields, only_gaps: bool, say: &mut Narration) -> Result<Outcome, Fail> {
        if matches!(kind.writer, Writer::Plugin { .. }) {
            say.say(Stage::Write, format!("{path} is kept by its own feature; not rewritten here"));
            return Ok(Outcome::Unchanged);
        }
        let empty = |v: Option<&Value>| v.is_none_or(|v| v.is_null() || v.as_str() == Some("") || v.as_array().is_some_and(|a| a.iter().all(Value::is_null)));
        let mut changes = crate::note::changes(kind, m, &placement.keys(), current);
        if only_gaps {
            changes.retain(|(k, _)| empty(current.get(k)));
        }
        if changes.is_empty() {
            say.say(Stage::Write, format!("{path} is up to date"));
            return Ok(Outcome::Unchanged);
        }
        for (k, v) in &changes {
            self.host.set_property(path, k, v)?;
        }
        say.say(Stage::Write, format!("{path}: {} updated", changes.iter().map(|(k, _)| k.as_str()).collect::<Vec<_>>().join(", ")));
        Ok(Outcome::Updated)
    }

    /// The user's review (a sync's `own`) added under its heading to a note that has none yet: a film filed before its
    /// review was known. A note that already has a `## Review` keeps it as it is (it may be the user's own words now).
    fn review_added(&self, path: &str, m: &Merged, say: &mut Narration) -> Result<bool, Fail> {
        let Some(review) = m.fields.get("review").map(crate::kind::text_of).filter(|t| !t.trim().is_empty()) else { return Ok(false) };
        let Some(text) = self.host.read(path)? else { return Ok(false) };
        if text.lines().any(|l| l.trim_end() == "## Review") {
            return Ok(false);
        }
        self.host.create(path, &format!("{}\n\n## Review\n\n{}\n", text.trim_end(), review.trim()))?;
        say.say(Stage::Write, format!("{path}: your review added"));
        Ok(true)
    }

    /// The note's synopsis replaced by the one the sources now agree on — only while it is still a source's own words
    ///: a film first described by a source in the wrong language. True when changed.
    fn describe_again(&self, kind: &Kind, path: &str, m: &Merged, answers: &[Fetched], say: &mut Narration) -> Result<bool, Fail> {
        let (Writer::Catalog, Some(field)) = (&kind.writer, &kind.body) else { return Ok(false) };
        let Some(now) = m.fields.get(field).map(crate::kind::text_of).filter(|t| crate::note::prose(t)) else { return Ok(false) };
        let written: Vec<String> = answers.iter().filter_map(|a| a.fields.get(field)).map(crate::kind::text_of).collect();
        let Some(text) = self.host.read(path)? else { return Ok(false) };
        let Some(fresh) = crate::note::with_description(&text, &now, &written) else { return Ok(false) };
        self.host.create(path, &fresh)?;
        say.say(Stage::Write, format!("{path}: the synopsis, still a source's own words, replaced by the one the sources give now"));
        Ok(true)
    }

    /// `x.md`, else `x 2.md`, `x 3.md`… — a different thing with the same title never overwrites another's note.
    fn free_path(&self, path: &str) -> Result<String, Fail> {
        if !self.host.exists(path)? {
            return Ok(path.to_string());
        }
        let stem = path.trim_end_matches(".md");
        for n in 2..100 {
            let p = format!("{stem} {n}.md");
            if !self.host.exists(&p)? {
                return Ok(p);
            }
        }
        Err(format!("{path}: 99 notes of that name already"))
    }

    /// Tell every linked service about the note; what they answer (their address for it, a state) becomes properties.
    #[allow(clippy::too_many_arguments)]
    fn sync(&self, reg: &Registry, kind: &Kind, path: &str, m: &Merged, placement: &Placement, signin: &mut Vec<SignIn>, say: &mut Narration) {
        if matches!(kind.writer, Writer::Plugin { .. }) {
            return; // the owning feature syncs its own notes
        }
        for l in reg.links_for(&kind.name) {
            let choice = placement.links.get(&l.plugin);
            if choice.is_some_and(|c| !c.on()) {
                say.say(Stage::Sync, format!("{}: left out for this {} (kind or rule)", l.plugin, kind.label()));
                continue;
            }
            let options = choice.map(|c| c.options()).unwrap_or_else(|| json!({}));
            // `library`: the kind's name for people (a Linkwarden collection by default); `folder`: where the note is
            let input = json!({ "kind": kind.name, "library": kind.label(), "folder": placement.folder, "ids": m.ids, "path": path, "props": m.fields, "options": options });
            match self.host.tool(&l.plugin, &l.spec.tool, input) {
                Ok(v) if v.get("signin").is_some() => {
                    say.problem(Stage::Sync, format!("{}: the service wants a sign-in first", l.plugin));
                    signin.push(SignIn { plugin: l.plugin.clone(), detail: v["signin"].clone() });
                }
                Ok(v) => {
                    let fields: Fields = v.get("fields").cloned().and_then(|x| serde_json::from_value(x).ok()).unwrap_or_default();
                    let mut wrote = Vec::new();
                    for (k, val) in &fields {
                        match self.host.set_property(path, k, val) {
                            Ok(()) => wrote.push(k.as_str()),
                            Err(e) => say.problem(Stage::Sync, format!("{}: {k} not written ({e})", l.plugin)),
                        }
                    }
                    say.say(Stage::Sync, format!("{}: in step{}", l.plugin, if wrote.is_empty() { String::new() } else { format!(" ({})", wrote.join(", ")) }));
                }
                Err(e) => say.problem(Stage::Sync, format!("{}: {e}", l.plugin)),
            }
        }
    }
}

/// The note's title: the original one in the languages the kind keeps them in (`El reino`, aka `The Realm`), else
/// what the sources said, else words from the address (a site that keeps programs out still gets a readable name).
fn titled(kind: &Kind, m: &mut Merged, url: Option<&str>, say: &mut Narration) {
    fn text(m: &Merged, k: &str) -> Option<String> {
        m.fields.get(k).map(crate::kind::text_of).filter(|t| !t.is_empty())
    }
    let language = text(m, "language").map(|l| l.to_lowercase());
    if let (Some(lang), Some(original)) = (language, text(m, "original_title")) {
        if kind.original_title.iter().any(|l| l.eq_ignore_ascii_case(&lang)) && text(m, "title").as_deref() != Some(&original) {
            if let Some(t) = text(m, "title") {
                m.fields.insert("aka".into(), Value::String(t));
            }
            say.say(Stage::Merge, format!("titled {original:?}, its original ({lang}) title"));
            m.fields.insert("title".into(), Value::String(original));
            m.fields.remove("original_title");
        }
    }
    // only a web page takes its name from its address; a film or a book no source knew is not filed (`look`)
    if text(m, "title").is_none() && kind.name.as_str() == crate::kind::WEB_PAGE {
        if let Some(t) = url.and_then(title_from_url) {
            say.say(Stage::Merge, format!("no source gave a title: {t:?}, from the address"));
            m.fields.insert("title".into(), Value::String(t));
        }
    }
}

/// `…/questions/11227809/why-is-processing-a-sorted-array-faster` → "Why is processing a sorted array faster": the
/// last path segment that is words, not a number or an id; else the site's name.
pub fn title_from_url(url: &str) -> Option<String> {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    let rest = rest.split(['?', '#']).next().unwrap_or(rest);
    let mut parts = rest.split('/');
    let host = parts.next()?.trim_start_matches("www.").to_string();
    // a site's own route words (`/title/tt…`, `/watch`, `/dp/…`) are not the thing's name
    const ROUTES: &[&str] = &["title", "watch", "item", "items", "view", "show", "page", "post", "posts", "status", "comments", "questions", "article", "articles", "details", "product", "film", "movie", "album", "track", "index", "home", "playlist", "channel", "user", "search"];
    let wordy = |s: &&str| {
        !ROUTES.contains(&s.to_lowercase().as_str())
            && (s.chars().filter(|c| c.is_alphabetic()).count() >= 3 && s.chars().any(|c| matches!(c, '-' | '_' | '+')) || s.chars().all(|c| c.is_alphabetic()) && s.len() >= 4)
    };
    let seg = parts.filter(|s| !s.is_empty()).collect::<Vec<_>>().into_iter().rev().find(wordy);
    let words = match seg {
        Some(s) => {
            let s = s.rsplit_once('.').filter(|(_, ext)| ext.len() <= 4 && ext.chars().all(char::is_alphanumeric)).map_or(s, |(stem, _)| stem);
            s.replace(['-', '_', '+'], " ").split_whitespace().collect::<Vec<_>>().join(" ")
        }
        None => host,
    };
    let mut c = words.chars();
    c.next().map(|f| f.to_uppercase().chain(c).collect())
}

/// Whether a note is the thing these fields describe, by name: its file name (less a ` (year)`) or its `title` is the
/// thing's title, original title or other title, compared without case, accents or punctuation, and the years agree
/// within one when both have one (a festival premiere and the release: Puparia 2020 / 2021). Only for notes with none of the kind's IDs: a note with other IDs is another thing.
fn named_as(path: &str, props: &Fields, fields: &Fields) -> bool {
    fn plain(s: &str) -> String {
        let folded: String = s.chars().map(|c| match c {
            'á' | 'à' | 'ä' | 'â' => 'a', 'é' | 'è' | 'ë' | 'ê' => 'e', 'í' | 'ì' | 'ï' | 'î' => 'i', 'ó' | 'ò' | 'ö' | 'ô' => 'o', 'ú' | 'ù' | 'ü' | 'û' => 'u', 'ñ' => 'n', 'ç' => 'c',
            c => c,
        }).collect::<String>().to_lowercase();
        folded.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).collect::<Vec<_>>().join(" ")
    }
    let year = |f: &Fields| f.get("year").and_then(|v| v.as_i64().or_else(|| v.as_str()?.trim().parse().ok()));
    if let (Some(a), Some(b)) = (year(props), year(fields)) {
        if (a - b).abs() > 1 {
            return false;
        }
    }
    let stem = path.rsplit('/').next().unwrap_or(path).trim_end_matches(".md");
    let stem = stem.rsplit_once(" (").filter(|(_, y)| y.trim_end_matches(')').chars().all(|c| c.is_ascii_digit())).map_or(stem, |(t, _)| t);
    let mine: Vec<String> = [Some(stem), props.get("title").and_then(Value::as_str)].into_iter().flatten().map(plain).filter(|s| !s.is_empty()).collect();
    let titles = ["title", "original_title", "aka"].iter().filter_map(|k| fields.get(*k)).flat_map(|v| match v {
        Value::Array(a) => a.iter().filter_map(Value::as_str).map(str::to_string).collect(),
        v => v.as_str().map(str::to_string).into_iter().collect::<Vec<_>>(),
    });
    titles.map(|t| plain(&t)).any(|t| !t.is_empty() && mine.contains(&t))
}

fn show_ids(ids: &Ids) -> String {
    ids.iter().map(|(k, v)| format!("{k} {v}")).collect::<Vec<_>>().join(", ")
}

fn kinds_of(c: &[Candidate]) -> String {
    if c.is_empty() {
        return "nothing known".into();
    }
    c.iter().map(|c| c.kind.as_str()).collect::<Vec<_>>().join(", ")
}

fn describe(c: &[Candidate]) -> String {
    match c.first() {
        None => "no link or identifier any source knows".into(),
        Some(first) => {
            let by = if first.by.is_empty() { "a link no plugin knows more about".to_string() } else { first.by.iter().map(PluginId::as_str).collect::<Vec<_>>().join(", ") };
            let others = if c.len() > 1 { format!("; could also be: {}", kinds_of(&c[1..])) } else { String::new() };
            format!("a {} ({}) by {by}{others}", first.kind, show_ids(&first.ids))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::IdName;
    use std::cell::RefCell;
    use std::collections::BTreeMap;

    type ToolFn = dyn Fn(&str, &str, &Value) -> Result<Value, Fail>;

    /// A vault in memory, with subplugins answering their tools from a closure.
    struct Fake {
        files: RefCell<BTreeMap<String, String>>,
        contributions: Value,
        tools: Box<ToolFn>,
        calls: RefCell<Vec<String>>,
    }

    impl Host for Fake {
        fn contributions(&self) -> Result<Map<String, Value>, Fail> {
            Ok(self.contributions.as_object().cloned().unwrap_or_default())
        }
        fn vault_kinds(&self) -> Result<Vec<(String, String)>, Fail> {
            Ok(self.files.borrow().iter().filter(|(p, _)| p.starts_with(".atlas/kinds/")).map(|(p, t)| (p.clone(), t.clone())).collect())
        }
        fn tool(&self, plugin: &PluginId, tool: &str, input: Value) -> Result<Value, Fail> {
            self.calls.borrow_mut().push(format!("{plugin}.{tool}"));
            (self.tools)(plugin.as_str(), tool, &input)
        }
        fn notes_in(&self, folder: &str) -> Result<Vec<(String, Fields)>, Fail> {
            let pre = format!("{folder}/");
            Ok(self.files.borrow().iter().filter(|(p, _)| p.starts_with(&pre)).map(|(p, t)| (p.clone(), fm(t))).collect())
        }
        fn props(&self, path: &str) -> Result<Fields, Fail> {
            self.files.borrow().get(path).map(|t| fm(t)).ok_or_else(|| format!("{path}: not found"))
        }
        fn exists(&self, path: &str) -> Result<bool, Fail> {
            Ok(self.files.borrow().contains_key(path))
        }
        fn read(&self, path: &str) -> Result<Option<String>, Fail> {
            Ok(self.files.borrow().get(path).cloned())
        }
        fn api(&self, path: &str, input: Value) -> Result<Value, Fail> {
            self.calls.borrow_mut().push(path.to_string());
            (self.tools)("core", path, &input)
        }
        fn clip(&self, input: Value) -> Result<Value, Fail> {
            self.calls.borrow_mut().push("clip".to_string());
            (self.tools)("catalog", "clip", &input)
        }
        fn now(&self) -> String {
            "2026-10-17 13:45".into()
        }
        fn create(&self, path: &str, text: &str) -> Result<(), Fail> {
            self.files.borrow_mut().insert(path.into(), text.into());
            Ok(())
        }
        fn set_property(&self, path: &str, key: &str, value: &Value) -> Result<(), Fail> {
            let mut files = self.files.borrow_mut();
            let text = files.get(path).ok_or("missing")?.clone();
            let mut props = fm(&text);
            props.insert(key.into(), value.clone());
            let body = text.splitn(3, "---\n").nth(2).unwrap_or("").to_string();
            files.insert(path.into(), format!("---\n{}---\n{body}", serde_yaml::to_string(&props).unwrap()));
            Ok(())
        }
    }

    fn fm(t: &str) -> Fields {
        let Some(yaml) = atlas_text::frontmatter::split(t).0 else { return Fields::new() };
        serde_yaml::from_str::<Value>(yaml).ok().and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default()
    }

    fn web_and_linkwarden() -> Fake {
        Fake {
            files: RefCell::new(BTreeMap::from([("notes/mine.md".to_string(), "my own note\n".to_string())])),
            contributions: json!({
                "catalog-web": { "sources": [{ "kind": "article", "engine": "clip", "priority": 10 }] },
                "catalog-linkwarden": { "links": [{ "kind": "*", "tool": "save" }] }
            }),
            tools: Box::new(|plugin, tool, input| match (plugin, tool) {
                ("catalog", "clip") => {
                    assert!(input["url"].as_str().is_some_and(|u| u.contains("example.org/post")), "the page is read by its address: {input}");
                    Ok(json!({ "kind": "article", "fields": { "title": "A post: on things", "site": "example.org", "author": "", "text": "First paragraph." } }))
                }
                ("catalog-linkwarden", "save") => {
                    assert_eq!(input["ids"]["url"], "https://example.org/post");
                    Ok(json!({ "fields": { "linkwarden": "https://links.example.org/links/7" } }))
                }
                _ => Err(format!("no tool {plugin}.{tool}")),
            }),
            calls: RefCell::new(Vec::new()),
        }
    }

    #[test]
    fn a_link_becomes_one_note_saved_to_linkwarden_and_a_second_capture_finds_it() {
        let e = Engine::new(web_and_linkwarden());
        let first = e.add("look https://www.example.org/post?utm_source=x", &Pick::default()).unwrap();
        assert_eq!(first.result.outcome, Outcome::Created);
        assert_eq!(first.result.path, "notes/clips/A post on things.md");
        let text = e.host.files.borrow()[&first.result.path].clone();
        assert!(text.contains("source: https://example.org/post"), "{text}");
        assert!(text.contains("linkwarden: https://links.example.org/links/7"), "{text}");
        assert!(text.contains("```view\ntype: catalog.item\n```\n\nFirst paragraph.\n"), "the page's text under its block: {text}");
        assert!(first.steps.0.iter().all(|s| !s.problem), "{:?}", first.steps);

        let again = e.add("https://example.org/post", &Pick::default()).unwrap();
        assert_eq!(again.result.path, first.result.path);
        assert_eq!(again.result.outcome, Outcome::Unchanged);
        // the first web page made its collection once: a base, an index page showing it, the home of all collections
        let files = e.host.files.borrow();
        assert!(files["notes/clips/Web pages.base"].contains("file.inFolder(\"notes/clips\")"));
        assert!(files["notes/clips/Web pages.md"].contains("type: catalog.library\nbase: \"notes/clips/Web pages.base\"\nlayout: grid\n"));
        assert!(files[crate::collection::HOME].contains("type: catalog.collections"));
        assert_eq!(files.len(), 5, "no second note, no second collection: {:?}", files.keys().collect::<Vec<_>>());
    }

    #[test]
    fn a_kind_written_by_its_own_feature_is_handed_over_and_a_signin_is_reported() {
        let mut f = web_and_linkwarden();
        f.contributions = json!({
            "catalog-zotero": {
                "kinds": [{ "name": "paper", "type": "literature", "folder": "refs/papers", "ids": [{ "id": "doi", "property": "source", "prefix": "https://doi.org/" }],
                            "writer": { "by": "plugin", "plugin": "catalog-zotero", "tool": "add" } }],
                "recognize": [{ "pattern": "(10\\.\\d{4,9}/\\S+)", "kind": "paper", "id": "doi" }],
                "sources": [{ "kind": "paper", "tool": "crossref", "needs": ["doi"] }]
            },
            "catalog-jellyfin": { "sources": [{ "kind": "paper", "tool": "lookup", "priority": 1 }] }
        });
        f.tools = Box::new(|plugin, tool, input| match (plugin, tool) {
            ("catalog-zotero", "crossref") => Ok(json!({ "fields": { "title": "Quantum cluster theories", "year": 2005 } })),
            ("catalog-jellyfin", "lookup") => Ok(json!({ "signin": { "kind": "door", "host": "media.example.org" } })),
            ("catalog-zotero", "add") => {
                assert_eq!(input["ids"]["doi"], "10.1103/revmodphys.77.1027");
                Ok(json!({ "path": "refs/papers/maier2005quantum/maier2005quantum.md" }))
            }
            _ => Err(format!("no tool {plugin}.{tool}")),
        });
        let e = Engine::new(f);
        let r = e.add("10.1103/RevModPhys.77.1027", &Pick::default()).unwrap();
        assert_eq!(r.result.outcome, Outcome::Delegated);
        assert_eq!(r.result.path, "refs/papers/maier2005quantum/maier2005quantum.md");
        assert_eq!(r.result.signin.len(), 1);
        assert_eq!(r.result.signin[0].plugin.as_str(), "catalog-jellyfin");
        assert!(!e.host.calls.borrow().iter().any(|c| c.starts_with("catalog-linkwarden")), "the owning feature syncs its own notes");
    }

    #[test]
    fn a_vault_kind_file_moves_the_library_and_a_refresh_updates_only_owned_properties() {
        let f = web_and_linkwarden();
        f.files.borrow_mut().insert(
            ".atlas/kinds/article.yaml".into(),
            "name: article\ntype: clip\nfolder: Clips\nids: [{ id: url, property: source }]\nproperties: [title, site]\n".into(),
        );
        let e = Engine::new(f);
        let r = e.add("https://example.org/post", &Pick::default()).unwrap();
        assert_eq!(r.result.path, "Clips/A post on things.md");
        let text = e.host.files.borrow()[&r.result.path].clone();
        assert!(text.contains("\ntype: clip\n") && text.contains("linkwarden: "), "{text}");
        e.host.set_property(&r.result.path, "title", &json!("My title")).unwrap();
        e.host.set_property(&r.result.path, "rating", &json!(5)).unwrap();
        let again = e.refresh(&r.result.path).unwrap();
        assert_eq!(again.result.outcome, Outcome::Updated);
        let props = e.host.props(&r.result.path).unwrap();
        assert_eq!(props["title"], json!("A post: on things"));
        assert_eq!(props["rating"], json!(5));
        let _ = IdName::new("url");
    }

    #[test]
    fn a_link_whose_page_says_it_is_a_video_becomes_a_video() {
        let mut f = web_and_linkwarden();
        f.contributions = json!({
            "catalog-web": { "sources": [{ "kind": "article", "tool": "read", "priority": 10 }] },
            "catalog-youtube": {
                "kinds": [{ "name": "video", "folder": "Videos", "note_name": "{title} ({channel})", "ids": [{ "id": "youtube" }, { "id": "url", "property": "source" }] }],
                "sources": [{ "kind": "video", "tool": "details", "priority": 60, "needs": ["youtube"] }]
            }
        });
        f.tools = Box::new(|plugin, tool, input| match (plugin, tool) {
            // an embed page on some blog: the page's og:video names the YouTube id
            ("catalog-web", "read") => Ok(json!({ "kind": "video", "ids": { "youtube": "dQw4w9WgXcQ" }, "fields": { "title": "Some blog — a video", "cover": "https://blog/x.jpg" } })),
            ("catalog-youtube", "details") => {
                assert_eq!(input["ids"]["youtube"], "dQw4w9WgXcQ");
                Ok(json!({ "fields": { "title": "Never Gonna Give You Up", "channel": "Rick Astley" } }))
            }
            _ => Err(format!("no tool {plugin}.{tool}")),
        });
        let e = Engine::new(f);
        let r = e.add("https://blog.example/post-with-a-video", &Pick::default()).unwrap();
        assert_eq!(r.result.kind.as_str(), "video");
        assert_eq!(r.result.path, "Videos/Never Gonna Give You Up (Rick Astley).md");
        let props = e.host.props(&r.result.path).unwrap();
        assert_eq!(props["youtube"], json!("dQw4w9WgXcQ"));
        assert_eq!(props["cover"], json!("https://blog/x.jpg"), "the page's own answer is kept as a lower source");
    }

    #[test]
    fn words_are_searched_and_a_guess_among_several_is_never_filed_until_one_is_picked() {
        let mut f = web_and_linkwarden();
        f.contributions = json!({
            "catalog-tmdb": {
                "kinds": [{ "name": "movie", "folder": "Films", "note_name": "{title} ({year})", "ids": [{ "id": "tmdb" }] }],
                "recognizers": [{ "tool": "search" }],
                "sources": [{ "kind": "movie", "tool": "details", "needs": ["tmdb"] }]
            }
        });
        f.tools = Box::new(|plugin, tool, input| match (plugin, tool) {
            ("catalog-tmdb", "search") => Ok(json!({ "candidates": [
                { "kind": "movie", "ids": { "tmdb": "438631" }, "label": "Dune (2021), Denis Villeneuve" },
                { "kind": "movie", "ids": { "tmdb": "841" }, "label": "Dune (1984), David Lynch" }
            ] })),
            ("catalog-tmdb", "details") => Ok(match input["ids"]["tmdb"].as_str() {
                Some("841") => json!({ "fields": { "title": "Dune", "year": 1984 } }),
                _ => json!({ "fields": { "title": "Dune", "year": 2021 } }),
            }),
            _ => Err(format!("no tool {plugin}.{tool}")),
        });
        let e = Engine::new(f);
        let p = e.preview("Dune", &Pick::default()).unwrap().result;
        assert!(p.searched && p.others.len() == 1);
        assert_eq!(p.candidate.label.as_deref(), Some("Dune (2021), Denis Villeneuve"));
        let err = e.add("Dune", &Pick::default()).unwrap_err();
        assert!(err.contains("several things match") && err.contains("Dune (1984), David Lynch"), "{err}");
        assert!(e.host.files.borrow().keys().all(|k| !k.starts_with("Films/")), "nothing written on a guess");

        let lynch = Pick { kind: None, ids: Some(Ids::from([(IdName::new("tmdb"), "841".to_string())])), ..Pick::default() };
        // an old note named otherwise, chosen by the user: that note gets the IDs, only its gaps filled
        e.host.files.borrow_mut().insert("Films/Dune, Lynch's.md".into(), "---\ntype: movie\nyear: 1985\n---\nmine\n".into());
        let chosen = Pick { note: Some("Films/Dune, Lynch's.md".into()), ..lynch.clone() };
        let r = e.add("Dune", &chosen).unwrap();
        assert_eq!(r.result.path, "Films/Dune, Lynch's.md");
        assert_eq!(e.host.props(&r.result.path).unwrap()["year"], json!(1985), "what it says stays");
        assert_eq!(e.host.props(&r.result.path).unwrap()["tmdb"], json!("841"));
        assert!(e.add("Dune", &Pick { note: Some("Films/none.md".into()), ..lynch.clone() }).is_err());
        e.host.files.borrow_mut().remove("Films/Dune, Lynch's.md");
        let r = e.add("Dune", &lynch).unwrap();
        assert_eq!(r.result.path, "Films/Dune (1984).md");
    }

    #[test]
    fn a_refresh_gives_a_synopsis_in_the_films_language_and_finds_an_old_note_by_name() {
        let mut f = web_and_linkwarden();
        f.contributions = json!({
            "catalog-tmdb": {
                "kinds": [{ "name": "movie", "folder": "Films", "note_name": "{title} ({year})", "ids": [{ "id": "tmdb" }, { "id": "letterboxd" }], "body": "description" }],
                "recognize": [{ "pattern": "letterboxd\\.com/film/([\\w-]+)", "kind": "movie", "id": "letterboxd" }],
                "sources": [{ "kind": "movie", "tool": "details", "priority": 70, "needs": ["tmdb"] }, { "kind": "movie", "tool": "lookup", "priority": 60, "needs": ["letterboxd"] }]
            }
        });
        f.tools = Box::new(|_, tool, _| match tool {
            "lookup" => Ok(json!({ "ids": { "tmdb": "tv/96005" }, "fields": { "title": "Riot Police", "original_title": "Antidisturbios", "year": 2020, "description": "A look at riot police." } })),
            "details" => Ok(json!({ "fields": { "description": "Seis antidisturbios…" } })),
            _ => Err("no such tool".into()),
        });
        // written before the fix: the English synopsis Letterboxd gave, the user's review under it
        f.files.borrow_mut().insert("Films/Antidisturbios (2020).md".into(), "---\ntype: movie\nletterboxd: riot-police\n---\n\n```view\ntype: catalog.item\n```\n\nA look at riot police.\n\n## Review\n\nMine.\n".into());
        let e = Engine::new(f);
        let r = e.refresh("Films/Antidisturbios (2020).md").unwrap();
        assert_eq!(r.result.outcome, Outcome::Updated);
        let text = e.host.files.borrow()["Films/Antidisturbios (2020).md"].clone();
        assert!(text.contains("\n\nSeis antidisturbios…\n\n## Review\n\nMine.\n") && !text.contains("riot police."), "{text}");

        // an old hand-written note without IDs, named as the film: a capture adds to it instead of making a twin
        e.host.files.borrow_mut().insert("Films/Los Domingos.md".into(), "---\ntype: movie\nrating: 4\nyear: 2024\ntitle:\n---\nmy notes\n".into());
        let mut g = e;
        g.host.tools = Box::new(|_, tool, _| match tool {
            "lookup" => Ok(json!({ "fields": { "title": "Sundays", "original_title": "Los domingos", "year": 2025 } })),
            _ => Ok(json!({ "fields": {} })),
        });
        let added = g.add("https://letterboxd.com/film/sundays-2025/", &Pick::default()).unwrap();
        assert_eq!(added.result.path, "Films/Los Domingos.md");
        assert_eq!(g.host.props("Films/Los Domingos.md").unwrap()["letterboxd"], json!("sundays-2025"));
        assert!(g.host.files.borrow()["Films/Los Domingos.md"].contains("my notes"));
        let props = g.host.props("Films/Los Domingos.md").unwrap();
        assert_eq!((props["year"].clone(), props["title"].clone()), (json!(2024), json!("Sundays")), "what the old note says stays; its gaps are filled");
    }

    #[test]
    fn an_old_note_of_that_name_without_ids_is_the_thing() {
        let has = |p: &str, t: &str| named_as(p, &fm(t), &serde_json::from_value(json!({ "title": "The Realm", "original_title": "El reino", "year": 2018 })).unwrap());
        assert!(has("notes/films/El Reino.md", "---\nyear: 2018\n---\n"), "the original title, any case");
        assert!(has("notes/films/The realm (2018).md", ""), "the title, a year in the name");
        assert!(has("notes/films/x.md", "---\ntitle: \"The Realm!\"\n---\n"), "the title property, punctuation aside");
        assert!(!has("notes/films/El Reino.md", "---\nyear: 1999\n---\n"), "another year: another film");
        assert!(has("notes/films/El Reino.md", "---\nyear: 2017\n---\n"), "a premiere a year before the release");
        assert!(!has("notes/films/El Reino de los cielos.md", ""), "a longer name is another film");
        assert!(named_as("Films/Los Domingos.md", &Fields::new(), &serde_json::from_value(json!({ "title": "Sundays", "original_title": "Los domingos" })).unwrap()));
        assert!(named_as("Films/Átame.md", &Fields::new(), &serde_json::from_value(json!({ "title": "¡Átame!" })).unwrap()), "accents and marks aside");
    }

    #[test]
    fn a_sync_brings_a_review_and_a_like_to_a_film_filed_before_them() {
        let mut f = web_and_linkwarden();
        f.contributions = json!({
            "catalog-letterboxd": {
                "kinds": [{ "name": "movie", "folder": "Films", "note_name": "{title} ({year})", "ids": [{ "id": "letterboxd" }], "body": "description" }],
                "recognize": [{ "pattern": "letterboxd\\.com/film/([\\w-]+)", "kind": "movie", "id": "letterboxd" }],
                "sources": [{ "kind": "movie", "tool": "lookup", "priority": 60, "needs": ["letterboxd"] }]
            }
        });
        f.tools = Box::new(|_, tool, _| match tool {
            "lookup" => Ok(json!({ "fields": { "title": "Top Gun: Maverick", "year": 2022 } })),
            _ => Err("no such tool".into()),
        });
        let path = "Films/Top Gun: Maverick (2022).md";
        f.files.borrow_mut().insert(path.into(), "---\ntype: movie\nletterboxd: top-gun-maverick\nrating: 3.0\n---\n\n```view\ntype: catalog.item\n```\n".into());
        let e = Engine::new(f);
        let own: Fields = serde_json::from_value(json!({ "review": "Esta bien para entretenerse.", "liked": true, "watched": "2022-08-27" })).unwrap();
        let pick = Pick { own, ..Pick::default() };
        let r = e.add("https://letterboxd.com/film/top-gun-maverick/", &pick).unwrap();
        assert_eq!((r.result.path.as_str(), r.result.outcome), (path, Outcome::Updated));
        let text = e.host.files.borrow()[path].clone();
        assert!(text.ends_with("\n\n## Review\n\nEsta bien para entretenerse.\n"), "{text}");
        let props = e.host.props(path).unwrap();
        assert_eq!((props["liked"].clone(), props["watched"].clone()), (json!(true), json!("2022-08-27")));
        // a second sync with other words: the review there stays (it may be the user's own edit now)
        let own: Fields = serde_json::from_value(json!({ "review": "Otra cosa." })).unwrap();
        e.add("https://letterboxd.com/film/top-gun-maverick/", &Pick { own, ..Pick::default() }).unwrap();
        let again = e.host.files.borrow()[path].clone();
        assert!(again.matches("## Review").count() == 1 && !again.contains("Otra cosa"), "{again}");
    }

    #[test]
    fn plain_text_is_not_catalogued_and_says_why() {
        let e = Engine::new(web_and_linkwarden());
        let err = e.add("buy milk", &Pick::default()).unwrap_err();
        assert!(err.contains("nothing to catalogue"), "{err}");
    }

    #[test]
    fn titles_from_the_address_when_no_source_gives_one() {
        assert_eq!(title_from_url("https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster").as_deref(), Some("Why is processing a sorted array faster"));
        assert_eq!(title_from_url("https://blog.example.org/2024/11/28/Rust-1.83.0.html").as_deref(), Some("Rust 1.83.0"));
        assert_eq!(title_from_url("https://www.amazon.com/dp/B08N5WRWNW").as_deref(), Some("Amazon.com"));
        assert_eq!(title_from_url("https://www.imdb.com/title/tt0903747/").as_deref(), Some("Imdb.com"));
    }
}
