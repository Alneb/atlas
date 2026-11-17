//! The pipeline: load → recognise → dedupe → fetch → merge → write → sync, each stage narrated. All it needs from
//! Atlas goes through [`Host`], so it is tested against a vault in memory and run against the core over the pipe.
use crate::contrib::Registry;
use crate::document::FileLink;
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
    /// every note in the vault having one of these properties, with its properties (the core's index, not a read of
    /// each note): a thing's note found by its IDs wherever it is
    fn notes_with(&self, properties: &[String]) -> Result<Vec<(String, Fields)>, Fail>;
    /// the note a vault file or folder has (`POST /api/companion` with `find`: a note claiming it by `file`, its entry's,
    /// or the one beside it), only when it exists
    fn companion_find(&self, file: &str) -> Result<Option<String>, Fail>;
    fn props(&self, path: &str) -> Result<Fields, Fail>;
    /// a vault file's text (None: there is none) — the rules, a kind's template
    fn read(&self, path: &str) -> Result<Option<String>, Fail>;
    fn exists(&self, path: &str) -> Result<bool, Fail>;
    fn create(&self, path: &str, text: &str) -> Result<(), Fail>;
    /// the local time as `YYYY-MM-DD HH:MM`, for a kind's `{now}` / `{today}`
    fn now(&self) -> String;
    fn set_property(&self, path: &str, key: &str, value: &Value) -> Result<(), Fail>;
    /// a file fetched through the core's fetch into this plugin's cache (`save_to` = `cache_name`), never read here
    fn download(&self, url: &str, cache_name: &str) -> Result<Downloaded, Fail>;
    /// a file moved through the core (`POST /api/fs/move`: never over another, the links follow)
    fn move_file(&self, from: &str, to: &str) -> Result<(), Fail>;
    /// the file's companion note, made by the core's one path (`POST /api/companion`) with these properties in order
    fn companion(&self, file: &str, title: &str, properties: &[(String, Value)]) -> Result<String, Fail>;
    /// a PDF's text as the core extracts it for search (pages end in a form feed); None: none (yet)
    fn pdf_text(&self, path: &str) -> Option<String>;
    /// a PDF's Info dictionary (its maker's title, author, date), read where the vault is; empty when unreadable
    fn pdf_info(&self, path: &str) -> crate::first_page::Info;
}

/// A file the core fetched into the plugin's cache.
#[derive(Debug, Clone)]
pub struct Downloaded {
    /// its vault path in the cache (`.atlas/cache/plugins/catalog/downloads/…`)
    pub saved: String,
    /// what the site said it is (`application/pdf`; a page: `text/html`)
    pub content_type: String,
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
    /// what the service holding the thing says about it (an Audiobookshelf item's title, author, cover): below every
    /// source, so a thing no source knows is still filed (the note of a thing, thing.rs)
    pub known: Fields,
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
    /// the file a link to a document was downloaded as (`documents/x.pdf`); `path` is its note
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
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

/// What a downloaded document's note says it is (`type: document`).
pub const DOCUMENT: &str = "document";
/// The kind an ISBN in a document's pages files it as (or the kind a vault files books as instead).
const BOOK: &str = "book";

pub struct Engine<H: Host> {
    pub host: H,
    /// where a link to a document no subplugin claims is downloaded (the `documents` setting)
    pub documents: String,
}

impl<H: Host> Engine<H> {
    pub fn new(host: H) -> Self {
        Engine { host, documents: "documents".into() }
    }

    /// The documents folder the `documents` setting names (blank: the default).
    pub fn with_documents(mut self, folder: &str) -> Self {
        let f = folder.trim().trim_matches('/');
        if !f.is_empty() {
            self.documents = f.to_string();
        }
        self
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
        if let Some(link) = self.unclaimed_file(&reg, text, pick) {
            return Ok(Told { result: self.document_preview(&reg, &link, &mut say)?, steps: say });
        }
        let p = self.look(&reg, text, pick, &mut say)?;
        Ok(Told { result: p, steps: say })
    }

    pub fn add(&self, text: &str, pick: &Pick) -> Result<Told<Added>, Fail> {
        let mut say = Narration::default();
        let reg = self.load(&mut say);
        if let Some(link) = self.unclaimed_file(&reg, text, pick) {
            return self.keep_file(&reg, &link, say);
        }
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
        Ok(Told { result: Added { path, outcome, kind: kind.name, signin, file: None }, steps: say })
    }

    /// The file a link points to (a PDF, an EPUB…) downloaded into the documents folder with its note, whoever else
    /// would claim the link: the captures' "Download".
    pub fn download(&self, text: &str) -> Result<Told<Added>, Fail> {
        let mut say = Narration::default();
        let reg = self.load(&mut say);
        let url = crate::recognize::first_url(text).ok_or("no link in the text")?;
        let link = FileLink::of(&url).ok_or_else(|| format!("{url} is not a link to a document (a PDF, an EPUB, a DjVu…)"))?;
        self.keep_file(&reg, &link, say)
    }

    /// A link to a document that no subplugin's pattern claims (catalog-papers claims PDFs where References runs), when
    /// nothing was picked on the card: kept as a file, not read as a page.
    fn unclaimed_file(&self, reg: &Registry, text: &str, pick: &Pick) -> Option<FileLink> {
        if pick.kind.is_some() || pick.ids.is_some() || pick.note.is_some() {
            return None;
        }
        let link = FileLink::of(&crate::recognize::first_url(text)?)?;
        recognise(reg, text).iter().all(|c| c.by.is_empty()).then_some(link)
    }

    /// The note that already holds this link (`url` or `source`): a document kept before, or the book it was filed as.
    fn kept(&self, reg: &Registry, link: &FileLink, say: &mut Narration) -> Result<Option<String>, Fail> {
        let want = link.canonical();
        let mut places = vec![self.documents.clone()];
        if let Some(book) = reg.kinds.get(&reg.filed_as(&KindName::new(BOOK))) {
            places.extend(folders(book, &reg.rules));
        }
        for f in places {
            for (path, props) in self.host.notes_in(&f)? {
                if ["url", "source"].iter().any(|k| props.get(*k).and_then(Value::as_str).is_some_and(|v| crate::model::canonical_url(v) == want)) {
                    say.say(Stage::Dedupe, format!("already kept: {path} (same link)"));
                    return Ok(Some(path));
                }
            }
        }
        Ok(None)
    }

    /// What `keep_file` would do, nothing fetched or written.
    fn document_preview(&self, reg: &Registry, link: &FileLink, say: &mut Narration) -> Result<Preview, Fail> {
        say.say(Stage::Recognise, format!("a link to a file ({}) no plugin claims: it would be downloaded into {}/ with its note", link.ext, self.documents));
        let url = crate::model::IdName::new("url");
        let candidate = Candidate { kind: KindName::new(DOCUMENT), ids: Ids::from([(url, link.canonical())]), url: Some(link.url.clone()), by: Vec::new(), label: None };
        let merged = Merged { ids: candidate.ids.clone(), fields: Fields::from([("title".to_string(), Value::String(link.stem().to_string()))]), ..Merged::default() };
        let (path, exists) = match self.kept(reg, link, say)? {
            Some(p) => (p, true),
            None => (format!("{}/{}.md", self.documents, link.stem()), false),
        };
        let placement = Placement { folder: self.documents.clone(), ..Placement::default() };
        Ok(Preview { candidate, label: "Document".into(), merged, path, exists, placement, signin: Vec::new(), others: Vec::new(), searched: false })
    }

    /// The file downloaded through the core into the documents folder under its own name, then its note: a book's
    /// (by the ISBN its first pages give, when a source knows it), else the companion note the core makes for a file.
    fn keep_file(&self, reg: &Registry, link: &FileLink, mut say: Narration) -> Result<Told<Added>, Fail> {
        let document = KindName::new(DOCUMENT);
        if let Some(path) = self.kept(reg, link, &mut say)? {
            return Ok(Told { result: Added { path, outcome: Outcome::Unchanged, kind: document, signin: Vec::new(), file: None }, steps: say });
        }
        let got = self.host.download(&link.url, &link.cache_name())?;
        if crate::document::is_page(&got.content_type) {
            return Err(format!("{} answered a web page ({}), not the file: a sign-in or a download page stands in front of it", link.url, got.content_type));
        }
        say.say(Stage::Fetch, format!("downloaded {} ({})", link.name, if got.content_type.is_empty() { "no content type" } else { &got.content_type }));
        let file = crate::document::free_name(&self.documents, link, |p| self.host.exists(p))?;
        self.host.move_file(&got.saved, &file)?;
        say.say(Stage::Write, format!("kept as {file}"));
        let text = if link.ext == "pdf" { self.pdf_words(&file, &mut say) } else { None };
        let isbn = text.as_deref().and_then(|t| recognise(reg, t).into_iter().find_map(|c| c.ids.get(&crate::model::IdName::new("isbn")).cloned()));
        if let Some(isbn) = &isbn {
            match self.as_book(reg, link, &file, isbn) {
                Ok(mut book) => {
                    say.say(Stage::Recognise, format!("its pages give ISBN {isbn}: filed as a book"));
                    say.0.append(&mut book.steps.0);
                    book.result.file = Some(file);
                    return Ok(Told { result: book.result, steps: say });
                }
                Err(e) => say.problem(Stage::Fetch, format!("ISBN {isbn}: not filed as a book ({e}); kept as a document")),
            }
        }
        let mut props = vec![("type".to_string(), Value::String(DOCUMENT.into())), ("url".to_string(), Value::String(link.url.clone()))];
        if let Some(isbn) = isbn {
            props.push(("isbn".into(), Value::String(isbn)));
        }
        // named as its first page names it (title, authors, year), else as its Info dictionary does, else by its file
        // name — the references' own reading (crate::first_page: `read`, then `from_info`)
        let first = text.as_deref().and_then(|t| crate::first_page::read(t.split('\x0c').next().unwrap_or(t), &link.name));
        let first = first.or_else(|| (link.ext == "pdf").then(|| crate::first_page::from_info(&self.host.pdf_info(&file), &link.name)).flatten());
        if let Some(p) = &first {
            say.say(Stage::Recognise, format!("it names itself: {}", p.title));
            if let Some(a) = crate::clip::names_value(p.authors.clone()) {
                props.push(("author".into(), a));
            }
            if let Some(y) = p.year.as_deref().and_then(|y| y.parse::<i64>().ok()) {
                props.push(("year".into(), Value::from(y)));
            }
        }
        let title = first.as_ref().map_or(link.stem(), |p| p.title.as_str());
        let note = self.host.companion(&file, title, &props)?;
        say.say(Stage::Write, format!("its note: {note}"));
        Ok(Told { result: Added { path: note, outcome: Outcome::Created, kind: document, signin: Vec::new(), file: Some(file) }, steps: say })
    }

    /// A downloaded PDF's first pages as text: the core's extraction, else — a scan, with no text at all — its first
    /// page read by the OCR plugin (`ocr.read`), when the vault has it.
    fn pdf_words(&self, file: &str, say: &mut Narration) -> Option<String> {
        let text = self.host.pdf_text(file).map(|t| crate::document::first_pages(&t));
        if text.as_deref().is_some_and(|t| t.chars().any(char::is_alphanumeric)) {
            return text;
        }
        match self.host.tool(&PluginId::new("ocr"), "read", json!({ "path": file })) {
            Ok(v) => {
                let read = v["text"].as_str().unwrap_or_default().to_string();
                say.say(Stage::Recognise, format!("a scan: its first page read by OCR ({} characters)", read.len()));
                Some(read).filter(|t| !t.trim().is_empty())
            }
            Err(e) => {
                say.say(Stage::Recognise, format!("a scan, not read (OCR: {e})"));
                None
            }
        }
    }

    /// The book an ISBN names, filed by the book kind's own sources (Catalog · Books: Open Library), the file linked
    /// from its note and the link kept as its source.
    fn as_book(&self, reg: &Registry, link: &FileLink, file: &str, isbn: &str) -> Result<Told<Added>, Fail> {
        let kind = reg.filed_as(&KindName::new(BOOK));
        let ids = Ids::from([(crate::model::IdName::new("isbn"), isbn.to_string())]);
        let own = Fields::from([("file".to_string(), Value::String(format!("[[{file}]]")))]);
        self.add(&format!("ISBN {isbn} {}", link.url), &Pick { kind: Some(kind), ids: Some(ids), own, note: None, known: Fields::new() })
    }

    /// Fetch again for a note the catalog knows, and bring its owned properties up to date.
    pub fn refresh(&self, path: &str) -> Result<Told<Added>, Fail> {
        let mut say = Narration::default();
        let reg = self.load(&mut say);
        let props = self.host.props(path)?;
        // by its `type` first, as the Libraries list it (a note moved out of its kind's folder is still that kind),
        // then by the kind's folder
        let typed = props.get("type").and_then(Value::as_str).map(type_word);
        let in_folder = |k: &Kind| folders(k, &reg.rules).iter().any(|f| path.starts_with(&format!("{f}/")));
        let kinds: Vec<&Kind> = reg.kinds.iter().map(|(k, _)| k).collect();
        let (kind, ids) = kinds
            .iter()
            .filter(|k| typed.as_deref() == Some(k.note_type().to_lowercase().as_str()))
            .chain(kinds.iter().filter(|k| in_folder(k)))
            .map(|k| (*k, k.ids_in(&props)))
            .find(|(_, ids)| !ids.is_empty())
            .ok_or_else(|| format!("{path} is not a note of any kind the catalog knows (no kind of its type or folder with its IDs)"))?;
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
        Ok(Told { result: Added { path: path.into(), outcome, kind: kind.name, signin, file: None }, steps: say })
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
        for c in &mut all {
            c.kind = reg.filed_as(&c.kind); // a book is a reference book while Catalog · Science says so
        }
        say.say(Stage::Recognise, describe(&all));
        if let Some(k) = &pick.kind {
            all.retain(|c| &c.kind == k);
        }
        let mut candidate = match &pick.ids {
            // the one the card picked: it shares an ID with the choice
            Some(ids) => match all.iter().position(|c| c.ids.iter().any(|(k, v)| ids.get(k) == Some(v))) {
                Some(at) => all.remove(at),
                // a caller that knows the thing's IDs and kind (a sync: an Audiobookshelf item, a Letterboxd film) whose
                // words no search finds again: filed from those IDs, which the kind's sources are asked by
                None => match &pick.kind {
                    Some(k) if reg.kinds.get(k).is_some() => {
                        say.say(Stage::Recognise, format!("a {k} by its IDs ({})", show_ids(ids)));
                        Candidate { kind: k.clone(), url: None, ids: ids.clone(), by: Vec::new(), label: None }
                    }
                    _ => return Err("the chosen thing is no longer among the matches".into()),
                },
            },
            None if all.is_empty() => return Err(match &pick.kind {
                Some(k) => format!("the text is not a {k}"),
                None => "nothing to catalogue: no link, identifier or search result any source knows".into(),
            }),
            None => all.remove(0),
        };
        candidate.kind = reg.filed_as(&candidate.kind);
        let mut kind = reg.kinds.get(&candidate.kind).ok_or_else(|| format!("{} is recognised but no plugin or vault file declares that kind", candidate.kind))?;
        let mut signin = Vec::new();
        let mut got = self.fetch(reg, kind, &candidate, &[], &mut signin, say);
        // a link no pattern knew, read by its source, may turn out to be a film, a video, an album (og:type, JSON-LD):
        // follow it once, keeping what the page said as one more answer — unless the user picked the kind. A kind a
        // pattern gave (a YouTube Music song, an IMDb film) is changed only by a trusted source (TMDB: a series), never
        // by the page's own tags, and never back to a plain web page.
        if let (None, Some((k, trust))) = (&pick.kind, got.refined.clone()) {
            let allowed = candidate.by.is_empty() || (trust >= RE_KIND_TRUST && k != KindName::new(crate::kind::WEB_PAGE));
            let k = reg.filed_as(&k);
            if let Some(better) = reg.kinds.get(&k).filter(|b| allowed && b.name != kind.name) {
                say.say(Stage::Recognise, format!("the page says it is a {} — asking that kind's sources", better.label()));
                candidate = Candidate { kind: better.name.clone(), ids: got.merged.ids.clone(), url: candidate.url, by: candidate.by, label: candidate.label };
                kind = better;
                got = self.fetch(reg, kind, &candidate, &got.answers, &mut signin, say);
            }
        }
        let mut merged = got.merged;
        for (k, v) in &pick.known {
            merged.fields.entry(k.clone()).or_insert_with(|| v.clone());
        }
        // the address it was captured from stays with it (`source`), whatever else identifies it
        if let Some(u) = &candidate.url {
            let id = crate::model::IdName::new("url");
            let canonical = crate::model::normalise(&id, u);
            merged.ids.entry(id).or_insert(canonical);
        }
        titled(kind, &mut merged, candidate.url.as_deref(), say);
        // a kind its own plugin writes names the note itself (References reads a PDF link's first page, else its
        // file name): only the kinds the catalog writes need a title from a source
        let names_itself = matches!(kind.writer, Writer::Plugin { .. }) && candidate.url.is_some();
        if !merged.fields.contains_key("title") && kind.name.as_str() != crate::kind::WEB_PAGE && !names_itself {
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
                // the plugin keeps these notes and their folder (References: refs.bib, the papers' folders), so the
                // catalog writes no collection files (base, index) into it
                say.say(Stage::Write, format!("handed to {plugin} ({tool}), which keeps these notes: {path}"));
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
        // the note as it stands: a link whose answer is already there (a download asked for) can say it is in step
        let note = self.host.props(path).unwrap_or_default();
        for l in reg.links_for(&kind.name) {
            let choice = placement.links.get(&l.plugin);
            if choice.is_some_and(|c| !c.on()) {
                say.say(Stage::Sync, format!("{}: left out for this {} (kind or rule)", l.plugin, kind.label()));
                continue;
            }
            let options = choice.map(|c| c.options()).unwrap_or_else(|| json!({}));
            // `library`: the kind's name for people (a Linkwarden collection by default); `folder`: where the note is
            let input = json!({ "kind": kind.name, "library": kind.label(), "folder": placement.folder, "ids": m.ids, "path": path, "props": m.fields, "note": note, "options": options });
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
/// last path segment that is words, not a number or an id (percent-decoded first: `Group%20Theory.pdf` is two words);
/// else the site's name.
pub fn title_from_url(url: &str) -> Option<String> {
    let rest = url.split_once("://").map_or(url, |(_, r)| r);
    let rest = rest.split(['?', '#']).next().unwrap_or(rest);
    let mut parts = rest.split('/');
    let host = parts.next()?.trim_start_matches("www.").to_string();
    // a site's own route words (`/title/tt…`, `/watch`, `/dp/…`) are not the thing's name
    const ROUTES: &[&str] = &["title", "watch", "item", "items", "view", "show", "page", "post", "posts", "status", "comments", "questions", "article", "articles", "details", "product", "film", "movie", "album", "track", "index", "home", "playlist", "channel", "user", "search"];
    let wordy = |s: &&str| {
        !ROUTES.contains(&s.to_lowercase().as_str())
            && (s.chars().filter(|c| c.is_alphabetic()).count() >= 3 && s.chars().any(|c| matches!(c, '-' | '_' | '+' | ' ')) || s.chars().all(|c| c.is_alphabetic()) && s.len() >= 4)
    };
    let segs: Vec<String> = parts.filter(|s| !s.is_empty()).map(atlas_text::links::percent_decoded).collect();
    let seg = segs.iter().map(String::as_str).rev().find(wordy);
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
pub(crate) fn named_as(path: &str, props: &Fields, fields: &Fields) -> bool {
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

/// A note's `type` as the Libraries compare it (main.js `linkText`): a link's shown text (`[[Film|Movie]]` → `movie`).
fn type_word(t: &str) -> String {
    let t = t.trim();
    let inner = t.strip_prefix("[[").and_then(|x| x.strip_suffix("]]")).unwrap_or(t);
    inner.rsplit('|').next().unwrap_or(inner).trim().to_lowercase()
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
        /// what a downloaded PDF's Info dictionary says (default: nothing)
        info: crate::first_page::Info,
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
        fn notes_with(&self, properties: &[String]) -> Result<Vec<(String, Fields)>, Fail> {
            Ok(self.files.borrow().iter().filter(|(p, _)| p.ends_with(".md")).map(|(p, t)| (p.clone(), fm(t))).filter(|(_, f)| properties.iter().any(|k| f.contains_key(k))).collect())
        }
        fn companion_find(&self, file: &str) -> Result<Option<String>, Fail> {
            // the core's rule: a note claiming the file by `file`, else `<name>.md` beside it when there is one
            let files = self.files.borrow();
            let link = format!("[[{}]]", file.trim_end_matches('/'));
            if let Some((p, _)) = files.iter().find(|(p, t)| p.ends_with(".md") && fm(t).get("file").and_then(Value::as_str) == Some(link.as_str())) {
                return Ok(Some(p.clone()));
            }
            let beside = match file.strip_suffix('/') {
                Some(dir) => format!("{dir}/{}.md", dir.rsplit('/').next().unwrap_or(dir)),
                None => format!("{}.md", file.rsplit_once('.').map_or(file, |(s, _)| s)),
            };
            Ok(files.contains_key(&beside).then_some(beside))
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
        fn download(&self, url: &str, cache_name: &str) -> Result<Downloaded, Fail> {
            self.calls.borrow_mut().push(format!("download {url}"));
            let v = (self.tools)("core", "download", &json!({ "url": url }))?;
            let saved = format!(".atlas/cache/plugins/catalog/{cache_name}");
            self.files.borrow_mut().insert(saved.clone(), "%PDF-1.7".into());
            Ok(Downloaded { saved, content_type: v["content_type"].as_str().unwrap_or_default().into() })
        }
        fn move_file(&self, from: &str, to: &str) -> Result<(), Fail> {
            let mut files = self.files.borrow_mut();
            if files.contains_key(to) {
                return Err(format!("{to} is there already"));
            }
            let body = files.remove(from).ok_or_else(|| format!("{from}: not found"))?;
            files.insert(to.into(), body);
            Ok(())
        }
        fn companion(&self, file: &str, title: &str, properties: &[(String, Value)]) -> Result<String, Fail> {
            // the core's shape: `<name>.md` beside the file, the caller's properties, then the title, the file's block
            let note = match file.strip_suffix('/') {
                Some(dir) => format!("{dir}/{}.md", dir.rsplit('/').next().unwrap_or(dir)),
                None => format!("{}.md", file.rsplit_once('.').unwrap().0),
            };
            // as JSON, which is YAML too: a title with a `: ` in it stays one value
            let mut fm: String = properties.iter().map(|(k, v)| format!("{k}: {v}\n")).collect();
            fm += &format!("title: {}\n", json!(title));
            self.files.borrow_mut().entry(note.clone()).or_insert(format!("---\n{fm}---\n# {title}\n\n```view\ntype: pdf\npath: \"{file}\"\n```\n"));
            Ok(note)
        }
        fn pdf_text(&self, path: &str) -> Option<String> {
            (self.tools)("core", "pdf_text", &json!({ "path": path })).ok().and_then(|v| v.as_str().map(str::to_string))
        }
        fn pdf_info(&self, _path: &str) -> crate::first_page::Info {
            self.info.clone()
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
            info: Default::default(),
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

        // a sync knowing the kind and IDs of something the words no longer find: filed by its IDs; without the kind, not
        let synced = Ids::from([(IdName::new("tmdb"), "693134".to_string())]);
        let r = e.add("Dune", &Pick { kind: Some(KindName::new("movie")), ids: Some(synced.clone()), ..Pick::default() }).unwrap();
        assert_eq!((r.result.path.as_str(), e.host.props(&r.result.path).unwrap()["tmdb"].clone()), ("Films/Dune (2021).md", json!("693134")));
        assert!(e.add("Dune", &Pick { ids: Some(synced), ..Pick::default() }).unwrap_err().contains("no longer among the matches"));
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
        // moved out of its kind's folder, it is still a film by its `type` (as the Libraries list it)
        e.host.files.borrow_mut().insert("projects/x/Riot.md".into(), "---\ntype: movie\nletterboxd: riot-police\n---\n".into());
        assert_eq!(e.refresh("projects/x/Riot.md").unwrap().result.kind.as_str(), "movie");

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

    const GROUP_THEORY: &str = "chapters 9 and 10 https://files.example.org/Livros/Group%20Theory%20(2010).pdf";

    /// A vault without catalog-papers: the core's fetch answers a PDF, its text as `pdf_text` says.
    fn documents_vault(pdf_text: Option<&'static str>) -> Fake {
        let mut f = web_and_linkwarden();
        f.tools = Box::new(move |plugin, tool, input| match (plugin, tool) {
            ("core", "download") => {
                assert!(input["url"].as_str().unwrap().ends_with("Group%20Theory%20(2010).pdf"), "the link as captured: {input}");
                Ok(json!({ "content_type": "application/pdf" }))
            }
            ("core", "pdf_text") => pdf_text.map(|t| json!(t)).ok_or_else(|| "no text".to_string()),
            ("catalog", "clip") => Err("a file, not a page: not read".into()),
            ("catalog-books", "lookup") => match input["ids"]["isbn"].as_str() {
                Some("9783540328971") => Ok(json!({ "fields": { "title": "Group Theory", "author": ["Mildred S. Dresselhaus"], "year": 2008 } })),
                _ => Ok(json!({ "fields": {} })),
            },
            _ => Err(format!("no tool {plugin}.{tool}")),
        });
        f
    }

    /// A document whose first page names it (lecture notes: a title, a line of names, a date) is titled as a reader
    /// would, with its author and year — catalog-papers' reader (`crate::first_page`); a page that names nothing
    /// leaves the file's name.
    #[test]
    fn a_downloaded_document_is_named_by_its_first_page() {
        let page = "Group Theory: Application to the Physics of Condensed Matter\nMildred S. Dresselhaus, Gene Dresselhaus and Ado Jorio\nPublished 2008\n\x0cContents\n";
        let e = Engine::new(documents_vault(Some(page)));
        let r = e.add(GROUP_THEORY, &Pick::default()).unwrap();
        assert_eq!(r.result.path, "documents/Group Theory (2010).md", "the note beside the file keeps the file's name");
        let props = fm(&e.host.files.borrow()[&r.result.path]);
        assert_eq!(props["title"], json!("Group Theory: Application to the Physics of Condensed Matter"));
        assert_eq!(props["author"], json!(["Mildred S. Dresselhaus", "Gene Dresselhaus", "Ado Jorio"]));
        assert_eq!(props["year"], json!(2008));
    }

    /// A page that names nothing (a scan): the PDF's Info dictionary names it, as it does a reference's
    /// (`first_page::from_info`): its title, its author, the year it was made.
    #[test]
    fn a_downloaded_document_whose_page_says_nothing_is_named_by_its_info() {
        let mut f = documents_vault(Some("ON TH E\nPROPERTIES OFA GAS\n"));
        f.info = crate::first_page::Info { title: Some("Group Theory and Its Applications".into()), author: Some("Mildred S. Dresselhaus".into()), created: Some("D:20100104120000".into()) };
        let e = Engine::new(f);
        let r = e.add(GROUP_THEORY, &Pick::default()).unwrap();
        let props = fm(&e.host.files.borrow()[&r.result.path]);
        assert_eq!(props["title"], json!("Group Theory and Its Applications"));
        assert_eq!(props["author"], json!("Mildred S. Dresselhaus"), "one author: a value, as the catalog writes one");
        assert_eq!(props["year"], json!(2010));
    }

    /// A scan has no text: its first page is read by the OCR plugin, and named from what it reads.
    #[test]
    fn a_downloaded_scan_is_named_by_its_first_page_read_by_ocr() {
        let mut f = documents_vault(None);
        let inner = std::mem::replace(&mut f.tools, Box::new(|_, _, _| Err(String::new())));
        f.tools = Box::new(move |plugin, tool, input| match (plugin, tool) {
            ("ocr", "read") => {
                assert_eq!(input["path"], json!("documents/Group Theory (2010).pdf"), "the file as kept");
                Ok(json!({ "text": "Group Theory: Application to the Physics of Condensed Matter\nMildred S. Dresselhaus, Gene Dresselhaus and Ado Jorio\nPublished 2008\n" }))
            }
            _ => inner(plugin, tool, input),
        });
        let e = Engine::new(f);
        let r = e.add(GROUP_THEORY, &Pick::default()).unwrap();
        let props = fm(&e.host.files.borrow()[&r.result.path]);
        assert_eq!(props["title"], json!("Group Theory: Application to the Physics of Condensed Matter"));
        assert_eq!(props["year"], json!(2008));

        // without the OCR plugin: the file's name, as before
        let e = Engine::new(documents_vault(None));
        let r = e.add(GROUP_THEORY, &Pick::default()).unwrap();
        assert_eq!(fm(&e.host.files.borrow()[&r.result.path])["title"], json!("Group Theory (2010)"));
    }

    fn with_books(mut f: Fake) -> Fake {
        f.contributions["catalog-books"] = json!({
            "recognize": [{ "pattern": "(?i)\\bISBN(?:-1[03])?:?\\s*([\\dX](?:[\\d\\- ]{8,15})[\\dX])\\b", "kind": "book", "id": "isbn" }],
            "sources": [{ "kind": "book", "tool": "lookup", "priority": 65, "needs": ["isbn"] }]
        });
        f
    }

    #[test]
    fn a_link_to_a_pdf_no_plugin_claims_is_downloaded_with_its_companion_note_once() {
        let e = Engine::new(documents_vault(None));
        let r = e.add(GROUP_THEORY, &Pick::default()).unwrap();
        assert_eq!((r.result.outcome, r.result.kind.as_str()), (Outcome::Created, DOCUMENT));
        assert_eq!((r.result.file.as_deref(), r.result.path.as_str()), (Some("documents/Group Theory (2010).pdf"), "documents/Group Theory (2010).md"));
        let files = e.host.files.borrow().clone();
        assert_eq!(files["documents/Group Theory (2010).pdf"], "%PDF-1.7", "moved out of the cache, not copied");
        assert!(!files.keys().any(|k| k.starts_with(".atlas/cache/")), "{:?}", files.keys());
        let props = fm(&files["documents/Group Theory (2010).md"]);
        assert_eq!((props["type"].clone(), props["url"].clone(), props["title"].clone()), (json!("document"), json!("https://files.example.org/Livros/Group%20Theory%20(2010).pdf"), json!("Group Theory (2010)")));
        let calls = e.host.calls.borrow().clone();
        assert!(!calls.iter().any(|c| c == "clip" || c.starts_with("catalog-linkwarden")), "never read as a page, never a web page's links: {calls:?}");

        // captured again: the note that holds the link, nothing downloaded twice
        let again = e.add(&format!("{GROUP_THEORY}?utm_source=x"), &Pick::default()).unwrap();
        assert_eq!((again.result.outcome, again.result.path.as_str()), (Outcome::Unchanged, "documents/Group Theory (2010).md"));
        assert_eq!(e.host.calls.borrow().iter().filter(|c| c.starts_with("download ")).count(), 1);

        // the folder is the `documents` setting's; the preview says where, fetching nothing
        let e = Engine::new(documents_vault(None)).with_documents("/Library/Docs/");
        let p = e.preview(GROUP_THEORY, &Pick::default()).unwrap().result;
        assert_eq!((p.path.as_str(), p.exists, p.label.as_str()), ("Library/Docs/Group Theory (2010).md", false, "Document"));
        assert!(e.host.calls.borrow().is_empty(), "{:?}", e.host.calls.borrow());
    }

    #[test]
    fn a_pdf_link_another_plugin_claims_is_its_own_and_download_keeps_the_file_anyway() {
        let mut f = documents_vault(None);
        f.contributions["catalog-papers"] = json!({
            "kinds": [{ "name": "paper", "folder": "refs/papers", "ids": [{ "id": "pdf", "property": "url" }], "writer": { "by": "plugin", "plugin": "catalog-papers", "tool": "add" } }],
            "recognize": [{ "pattern": "(?i)(https?://[^\\s<>\"]+\\.pdf(?:[?#][^\\s<>\"]*)?)", "kind": "paper", "id": "pdf" }]
        });
        let tools = std::mem::replace(&mut f.tools, Box::new(|_, _, _| Err("unset".into())));
        f.tools = Box::new(move |plugin, tool, input| match (plugin, tool) {
            ("catalog-papers", "add") => Ok(json!({ "path": "refs/papers/dresselhaus2008group/dresselhaus2008group.md" })),
            _ => tools(plugin, tool, input),
        });
        let e = Engine::new(f);
        let r = e.add(GROUP_THEORY, &Pick::default()).unwrap();
        assert_eq!((r.result.outcome, r.result.kind.as_str()), (Outcome::Delegated, "paper"));
        assert!(!e.host.calls.borrow().iter().any(|c| c.starts_with("download ")), "References downloads its own");

        let d = e.download(GROUP_THEORY).unwrap();
        assert_eq!((d.result.kind.as_str(), d.result.path.as_str()), (DOCUMENT, "documents/Group Theory (2010).md"));
        assert!(e.download("https://example.org/post").unwrap_err().contains("not a link to a document"));
    }

    #[test]
    fn an_isbn_in_the_first_pages_files_the_pdf_as_a_book_linking_the_file() {
        let e = Engine::new(with_books(documents_vault(Some("Group Theory\x0cSpringer\nISBN 978-3-540-32897-1\x0c"))));
        let r = e.add(GROUP_THEORY, &Pick::default()).unwrap();
        assert_eq!((r.result.outcome, r.result.kind.as_str(), r.result.path.as_str()), (Outcome::Created, "book", "notes/books/Group Theory.md"));
        assert_eq!(r.result.file.as_deref(), Some("documents/Group Theory (2010).pdf"));
        let props = e.host.props(&r.result.path).unwrap();
        assert_eq!((props["isbn"].clone(), props["file"].clone()), (json!("9783540328971"), json!("[[documents/Group Theory (2010).pdf]]")));
        assert_eq!(props["source"], json!("https://files.example.org/Livros/Group%20Theory%20(2010).pdf"));
        assert!(!e.host.files.borrow().contains_key("documents/Group Theory (2010).md"), "the book's note instead of a companion");
        // captured again: found as that book, by its link
        assert_eq!(e.add(GROUP_THEORY, &Pick::default()).unwrap().result.path, "notes/books/Group Theory.md");
    }

    #[test]
    fn an_isbn_no_source_knows_stays_on_the_document_and_a_page_is_no_file() {
        let e = Engine::new(with_books(documents_vault(Some("ISBN 0-306-40615-2\x0c"))));
        let r = e.add(GROUP_THEORY, &Pick::default()).unwrap();
        assert_eq!((r.result.kind.as_str(), r.result.path.as_str()), (DOCUMENT, "documents/Group Theory (2010).md"));
        assert_eq!(fm(&e.host.files.borrow()[&r.result.path])["isbn"], json!("0306406152"));
        assert!(r.steps.problems().iter().any(|p| p.contains("not filed as a book")), "{:?}", r.steps);

        let mut f = documents_vault(None);
        f.tools = Box::new(|_, tool, _| if tool == "download" { Ok(json!({ "content_type": "text/html; charset=utf-8" })) } else { Err("no".into()) });
        let e = Engine::new(f);
        assert!(e.add(GROUP_THEORY, &Pick::default()).unwrap_err().contains("answered a web page"));
        assert!(!e.host.files.borrow().keys().any(|k| k.starts_with("documents/")));
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
        // a file's own name, percent-encoded, over the folder it sits in
        assert_eq!(title_from_url("https://files.example.org/Livros/Group%20Theory%20Application%20to%20Condensed%20Matter.pdf").as_deref(), Some("Group Theory Application to Condensed Matter"));
        assert_eq!(title_from_url("https://files.example.org/Livros/Dresselhaus%20-%20Group%20Theory%20(2010).pdf").as_deref(), Some("Dresselhaus Group Theory (2010)"));
        assert_eq!(title_from_url("https://files.example.org/books/Teor%C3%ADa%20de%20grupos.pdf").as_deref(), Some("Teoría de grupos"));
        assert_eq!(atlas_text::links::percent_decoded("100%25 and 50% off"), "100% and 50% off");
    }

    // ---- the note of a thing (thing.rs) ------------------------------------------------------------------------

    fn no_sources(files: &[(&str, &str)]) -> Fake {
        Fake {
            files: RefCell::new(files.iter().map(|(p, t)| (p.to_string(), t.to_string())).collect()),
            contributions: json!({}),
            tools: Box::new(|plugin, tool, _| Err(format!("no tool {plugin}.{tool}"))),
            calls: RefCell::new(Vec::new()),
            info: Default::default(),
        }
    }

    fn book(ids: &[(&str, &str)], title: &str, file: Option<&str>) -> crate::thing::Thing {
        crate::thing::Thing {
            kind: Some(KindName::new("book")),
            ids: ids.iter().map(|(k, v)| (IdName::new(*k), v.to_string())).collect(),
            known: serde_json::from_value(json!({ "title": title, "author": "Frank Herbert" })).unwrap(),
            file: file.map(str::to_string),
            own: Fields::new(),
        }
    }

    #[test]
    fn a_server_item_gets_its_note_only_once_it_is_yours_and_only_one() {
        use crate::thing::Why;
        let e = Engine::new(no_sources(&[]));
        let dune = book(&[("audiobookshelf", "li_42")], "Dune", None);
        let looked = e.note_of(&dune, Why::Opened).unwrap();
        assert_eq!(looked.result.path, None, "listed or opened: no note");
        assert_eq!(e.note_of(&dune, Why::Progress(0.004)).unwrap().result.path, None, "a tap on play is not listening");
        assert!(e.host.files.borrow().is_empty(), "nothing written");
        let made = e.note_of(&dune, Why::Progress(0.3)).unwrap();
        assert!(made.result.made, "{:?}", made.steps);
        let path = made.result.path.clone().unwrap();
        assert_eq!(path, "notes/books/Dune.md");
        let text = e.host.files.borrow()[&path].clone();
        assert!(text.contains("type: book") && text.contains("audiobookshelf: li_42") && text.contains("author: '[[Frank Herbert]]'"), "{text}");
        // asked again from any side: the same note, never a second
        let again = e.note_of(&dune, Why::Rated).unwrap();
        assert_eq!((again.result.path.as_deref(), again.result.made), (Some(path.as_str()), false));
    }

    #[test]
    fn an_epub_joins_the_note_its_audiobook_made_and_claims_it() {
        use crate::thing::Why;
        let abs = "---\ntype: book\ntitle: Dune\nisbn: '9780441013593'\naudiobookshelf: li_42\n---\n\nMy review.\n";
        let e = Engine::new(no_sources(&[("notes/books/Dune.md", abs), ("books/Dune.epub", "PK")]));
        let epub = book(&[("isbn", "978-0-441-01359-3")], "Dune", Some("books/Dune.epub"));
        let r = e.note_of(&epub, Why::Opened).unwrap();
        assert_eq!(r.result.path.as_deref(), Some("notes/books/Dune.md"), "found by its ISBN: {:?}", r.steps);
        let text = e.host.files.borrow()["notes/books/Dune.md"].clone();
        assert!(text.contains("file: '[[books/Dune.epub]]'") && text.contains("My review."), "the file claimed, the rest untouched: {text}");
        assert_eq!(e.host.companion_find("books/Dune.epub").unwrap().as_deref(), Some("notes/books/Dune.md"), "the reader's own lookup finds it now");
        assert!(!e.host.files.borrow().contains_key("books/Dune.md"), "no second note beside the book");
    }

    #[test]
    fn a_vault_file_or_folder_gets_its_note_beside_it_through_the_core() {
        use crate::thing::Why;
        let e = Engine::new(no_sources(&[("books/Emma.epub", "PK")]));
        let emma = book(&[], "Emma", Some("books/Emma.epub"));
        assert_eq!(e.note_of(&emma, Why::Opened).unwrap().result.path, None);
        let r = e.note_of(&emma, Why::Wrote).unwrap();
        assert_eq!(r.result.path.as_deref(), Some("books/Emma.md"));
        assert!(e.host.files.borrow()["books/Emma.md"].contains("type: \"book\""), "the kind's type through the companion path");
        // a manga series' folder: its folder note, found from then on
        let berserk = crate::thing::Thing { kind: Some(KindName::new("manga")), file: Some("manga/Berserk/".into()), known: serde_json::from_value(json!({ "title": "Berserk" })).unwrap(), ..Default::default() };
        assert_eq!(e.note_of(&berserk, Why::Finished).unwrap().result.path.as_deref(), Some("manga/Berserk/Berserk.md"));
        assert!(!e.note_of(&berserk, Why::Opened).unwrap().result.made);
    }

    #[test]
    fn a_thing_found_by_id_anywhere_is_never_a_note_of_another_kind() {
        use crate::thing::Why;
        // a film note that happens to share an id property name is not the book
        let e = Engine::new(no_sources(&[("notes/films/X.md", "---\ntype: movie\nsource: https://x.org/a\n---\n")]));
        let b = book(&[("url", "https://x.org/a")], "X", None);
        assert_eq!(e.note_of(&b, Why::Opened).unwrap().result.path, None);
    }
}
