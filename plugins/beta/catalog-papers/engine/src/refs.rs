//! The references library over plain files: `<dir>/<citekey>/<citekey>.md`, whose properties are the entry's
//! Zotero-shaped fields (entry.rs) + PDFs beside it. Add by DOI / arXiv id / URL (remote.rs), import a PDF, edit,
//! merge, type, delete; `refs.bib` is derived and rewritten after every change. Moved from the core
//! (docs/refactor/REFACTOR-references-plugin.md); everything outside the vault's files goes through a seam — the
//! network ([`Net`]), a new entry's note ([`Companion`]), the Trash ([`Trash`]) — so tests run on a temp folder.
use crate::entry::{self, Companion};
use crate::net::{Miss, Net};
use crate::remote::{self, parse_arxiv, parse_doi};
use crate::settings::Settings;
use atlas_text::paths::{rel_path, safe_join};
use serde::{Deserialize, Serialize};
use serde_yaml::{Mapping, Value};
use std::path::{Path, PathBuf};

pub type Res<T> = Result<T, String>;

/// Moves a vault path to the Trash (recoverable): the helper's asks the core (`POST /api/fs/trash`); tests move it
/// into the temp vault's `.atlas/trash/`. → where it went.
pub trait Trash {
    fn trash(&self, rel: &str) -> Res<String>;
}

// The UI's types (the core's api.rs `Paper`, `PaperAdded`, `PaperEdit`): the same JSON field names.

/// One library entry, summarised from its note's properties (all fields stay there).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Paper {
    pub key: String,
    /// Workspace-relative folder of the entry.
    pub dir: String,
    pub title: String,
    /// Zotero item type (journalArticle, book, preprint, …).
    pub kind: String,
    /// "Last, First" as stored.
    pub authors: Vec<String>,
    pub year: Option<String>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub arxiv: Option<String>,
    pub url: Option<String>,
    pub abstract_text: Option<String>,
    pub collections: Vec<String>,
    pub tags: Vec<String>,
    /// Workspace-relative PDF, when there is one.
    pub pdf: Option<String>,
    /// `dateAdded`, "YYYY-MM-DD hh:mm:ss", for sorting.
    pub added: Option<String>,
    pub has_notes: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PaperAdded {
    pub paper: Paper,
    /// false when the DOI / arXiv id (or the same PDF) was already in the library.
    pub created: bool,
    pub pdf: bool,
    /// No PDF came and a copy stood behind a sign-in (a publisher's): its address, offered only if no PDF source
    /// finds one either.
    pub gate: Option<String>,
}

/// The fields the References view edits in place (the note's other properties are kept).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PaperEdit {
    pub key: String,
    pub title: String,
    pub authors: Vec<String>,
    /// A year or a full date.
    pub date: String,
    pub venue: String,
    pub collections: Vec<String>,
    pub tags: Vec<String>,
}

/// How a PDF is filed by `import_pdf_with` (`import`, the References move): its type (`book`, `thesis`, `manuscript`
/// for lecture notes; a paper's comes from its DOI), the collections it joins, and whether the file keeps its own
/// name — so `[[its name.pdf]]` links in the notes still find it.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(default)]
pub struct ImportOpts {
    pub kind: Option<String>,
    pub collections: Vec<String>,
    pub keep_name: bool,
}

/// What `fold_all` did (or would do): the entries with an `info.yaml` and how many fields each has, and where the
/// files were copied first.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Folded {
    pub entries: Vec<(String, usize)>,
    pub snapshot: Option<String>,
}

fn s(m: &Mapping, k: &str) -> Option<String> {
    match m.get(k)? {
        Value::String(v) => Some(v.clone()).filter(|v| !v.trim().is_empty()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn list(m: &Mapping, k: &str) -> Vec<String> {
    match m.get(k) {
        Some(Value::Sequence(v)) => v.iter().filter_map(|x| x.as_str().map(String::from)).collect(),
        Some(Value::String(v)) => vec![v.clone()],
        _ => Vec::new(),
    }
}

/// The first four-digit run of a date ("1963-11-26", "Nov 1963").
pub fn year_of(date: &str) -> Option<String> {
    date.split(|c: char| !c.is_ascii_digit()).find(|p| p.len() == 4).map(String::from)
}

/// arXiv id from an explicit field, the URL or `extra`.
pub(crate) fn arxiv_of(m: &Mapping) -> Option<String> {
    let hay = [s(m, "arxiv"), s(m, "archiveID"), s(m, "url"), s(m, "extra")].into_iter().flatten().collect::<Vec<_>>().join(" ");
    parse_arxiv(&hay)
}

fn now_stamp() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn io(path: &Path) -> impl Fn(std::io::Error) -> String + '_ {
    move |e| format!("{}: {e}", path.display())
}

/// Better-BibTeX-style key: first author's last name + year + first significant title word; `taken` keys get a letter.
pub fn citekey(authors: &[String], year: Option<&str>, title: &str, taken: &dyn Fn(&str) -> bool) -> String {
    const STOP: &[&str] = &["a", "an", "the", "on", "of", "in", "for", "and", "to", "with", "from", "at", "by", "is", "are"];
    let ascii = |x: &str| -> String {
        x.chars()
            .filter_map(|c| match c {
                'á' | 'à' | 'ä' | 'â' | 'ã' => Some('a'),
                'é' | 'è' | 'ë' | 'ê' => Some('e'),
                'í' | 'ì' | 'ï' | 'î' => Some('i'),
                'ó' | 'ò' | 'ö' | 'ô' | 'õ' => Some('o'),
                'ú' | 'ù' | 'ü' | 'û' => Some('u'),
                'ñ' => Some('n'),
                'ç' => Some('c'),
                'ß' => Some('s'),
                c if c.is_ascii_alphanumeric() => Some(c.to_ascii_lowercase()),
                _ => None,
            })
            .collect()
    };
    let last = authors.first().map(|a| a.split(',').next().unwrap_or(a).split_whitespace().last().unwrap_or("").to_lowercase()).unwrap_or_default();
    let word = title.split(|c: char| !c.is_alphanumeric()).map(str::to_lowercase).find(|w| w.len() > 2 && !STOP.contains(&w.as_str())).unwrap_or_default();
    let base = format!("{}{}{}", ascii(&last), year.unwrap_or(""), ascii(&word));
    let base = if base.is_empty() { "ref".to_string() } else { base };
    if !taken(&base) {
        return base;
    }
    ('a'..='z').map(|c| format!("{base}{c}")).find(|k| !taken(k)).unwrap_or(base)
}

// --- BibTeX (same mapping as tools/refs_bib.py) -------------------------------------------------------------------

const KIND: &[(&str, &str)] = &[
    ("journalArticle", "article"),
    ("book", "book"),
    ("bookSection", "incollection"),
    ("thesis", "phdthesis"),
    ("conferencePaper", "inproceedings"),
    ("preprint", "misc"),
    ("report", "techreport"),
    ("manuscript", "unpublished"),
];
const FIELD: &[(&str, &str)] = &[
    ("title", "title"),
    ("publicationTitle", "journal"),
    ("volume", "volume"),
    ("issue", "number"),
    ("pages", "pages"),
    ("publisher", "publisher"),
    ("place", "address"),
    ("DOI", "doi"),
    ("url", "url"),
    ("ISBN", "isbn"),
    ("ISSN", "issn"),
    ("university", "school"),
    ("series", "series"),
    ("edition", "edition"),
    ("bookTitle", "booktitle"),
    ("proceedingsTitle", "booktitle"),
    ("archiveID", "eprint"),
    ("repository", "publisher"),
];

fn esc(v: &str) -> String {
    v.replace('&', r"\&").replace('%', r"\%").replace('#', r"\#")
}

pub fn bibtex_entry(key: &str, m: &Mapping) -> String {
    let kind = s(m, "type").and_then(|t| KIND.iter().find(|(z, _)| *z == t).map(|(_, b)| *b)).unwrap_or("misc");
    let mut lines = vec![format!("@{kind}{{{key},")];
    for role in ["author", "editor"] {
        let v = list(m, role);
        if !v.is_empty() {
            lines.push(format!("  {role} = {{{}}},", v.join(" and ")));
        }
    }
    if let Some(y) = s(m, "date").and_then(|d| year_of(&d)) {
        lines.push(format!("  year = {{{y}}},"));
    }
    for (z, b) in FIELD {
        if let Some(v) = s(m, z) {
            lines.push(format!("  {b} = {{{}}},", esc(&v)));
        }
    }
    lines.push("}".into());
    lines.join("\n")
}

/// Where a plugin's PDF source may leave a download for `attach_pdf`: a plugin's cache (the core's fetch `save_to`).
const PLUGIN_CACHE: &str = ".atlas/cache/plugins/";

/// The library of one vault, with its seams.
pub struct Lib<'a> {
    pub root: &'a Path,
    pub cfg: &'a Settings,
    pub net: &'a dyn Net,
    pub made: &'a dyn Companion,
    pub trash: &'a dyn Trash,
}

impl Lib<'_> {
    fn base(&self) -> Res<PathBuf> {
        safe_join(self.root, &self.cfg.dir)
    }

    fn rel(&self, p: &Path) -> String {
        rel_path(self.root, p).unwrap_or_default()
    }

    pub fn paper_of(&self, dir: &Path, key: &str, m: &Mapping) -> Paper {
        let key = s(m, "citekey").unwrap_or_else(|| key.to_string());
        let pdf = list(m, "files")
            .iter()
            .find(|f| f.to_lowercase().ends_with(".pdf"))
            .map(|f| dir.join(f))
            .filter(|p| p.is_file())
            .or_else(|| std::fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).find(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("pdf"))))
            .and_then(|p| rel_path(self.root, &p));
        Paper {
            has_notes: entry::has_note(dir, &key),
            dir: self.rel(dir),
            title: s(m, "title").unwrap_or_else(|| key.to_string()),
            kind: s(m, "type").unwrap_or_else(|| "document".into()),
            authors: list(m, "author"),
            year: s(m, "date").and_then(|d| year_of(&d)),
            venue: s(m, "publicationTitle").or_else(|| s(m, "proceedingsTitle")).or_else(|| s(m, "bookTitle")).or_else(|| s(m, "publisher")).or_else(|| s(m, "university")),
            doi: s(m, "DOI"),
            arxiv: arxiv_of(m),
            url: s(m, "url"),
            abstract_text: s(m, "abstractNote"),
            collections: list(m, "collections"),
            tags: list(m, "tags"),
            pdf,
            added: s(m, "dateAdded"),
            key,
        }
    }

    /// The entry of one folder (None: no entry there).
    pub fn paper_in(&self, dir: &Path) -> Option<Paper> {
        let m = entry::read(dir)?;
        Some(self.paper_of(dir, &entry::key_of(dir), &m))
    }

    /// Every entry, newest year first. No folder yet: an empty library (the view says how to add one).
    pub fn list(&self) -> Res<Vec<Paper>> {
        let base = self.base()?;
        let entries = match std::fs::read_dir(&base) {
            Ok(e) => e,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(io(&base)(e)),
        };
        let mut out: Vec<Paper> = entries.flatten().filter_map(|e| self.paper_in(&e.path())).collect();
        out.sort_by(|a, b| b.year.cmp(&a.year).then_with(|| a.key.cmp(&b.key)));
        Ok(out)
    }

    fn find(&self, key: &str) -> Res<Paper> {
        self.list()?.into_iter().find(|p| p.key == key).ok_or_else(|| format!("no reference {key}"))
    }

    /// Writes an entry into its note (entry.rs), then refs.bib.
    fn save(&self, dir: &Path, m: &Mapping) -> Res<()> {
        entry::write(self.made, dir, m)
    }

    fn saved(&self, dir: &Path, key: &str, m: &Mapping) -> Res<Paper> {
        self.save(dir, m)?;
        self.write_bib()?;
        Ok(self.paper_of(dir, key, m))
    }

    /// The entry's note (made when an older entry has none yet: the fold) → its vault path.
    pub fn note(&self, key: &str) -> Res<String> {
        let p = self.find(key)?;
        let dir = safe_join(self.root, &p.dir)?;
        let file = entry::note_file(&entry::key_of(&dir));
        if !dir.join(&file).is_file() {
            self.save(&dir, &entry::read(&dir).unwrap_or_default())?;
        }
        Ok(format!("{}/{file}", p.dir))
    }

    /// Every entry's note made where it is missing (`atlas paper-notes`), so `[[citekey]]` always links → the notes made.
    pub fn notes(&self) -> Res<Vec<String>> {
        let mut made = Vec::new();
        for p in self.list()? {
            let dir = safe_join(self.root, &p.dir)?;
            if !dir.join(entry::note_file(&entry::key_of(&dir))).is_file() {
                made.push(self.note(&p.key)?);
            }
        }
        Ok(made)
    }

    /// refs.bib from every entry → how many it holds.
    pub fn write_bib(&self) -> Res<usize> {
        let base = self.base()?;
        let mut dirs: Vec<_> = std::fs::read_dir(&base).map_err(io(&base))?.flatten().map(|e| e.path()).collect();
        dirs.sort();
        let entries: Vec<String> = dirs
            .iter()
            .filter_map(|d| {
                let m = entry::read(d)?;
                Some(bibtex_entry(&s(&m, "citekey").unwrap_or_else(|| entry::key_of(d)), &m))
            })
            .collect();
        let text = format!("% Generated by Atlas from the notes of {}/* — do not edit.\n\n{}\n", self.cfg.dir, entries.join("\n\n"));
        let bib = safe_join(self.root, &self.cfg.bib)?;
        if let Some(parent) = bib.parent() {
            std::fs::create_dir_all(parent).map_err(io(parent))?;
        }
        std::fs::write(&bib, text).map_err(io(&bib))?;
        Ok(entries.len())
    }

    /// One entry as BibTeX ("copy BibTeX").
    pub fn bibtex(&self, key: &str) -> Res<String> {
        let dir = safe_join(self.root, &format!("{}/{key}", self.cfg.dir))?;
        let m = entry::read(&dir).ok_or_else(|| format!("no reference {key}"))?;
        Ok(bibtex_entry(&s(&m, "citekey").unwrap_or_else(|| key.into()), &m))
    }

    /// The key a paper gets in this vault: [`citekey`], unique against the entries already there.
    pub fn next_citekey(&self, authors: &[String], year: Option<&str>, title: &str) -> Res<String> {
        let base = self.base()?;
        Ok(citekey(authors, year, title, &|k| base.join(k).exists()))
    }

    // --- adding ------------------------------------------------------------------------------------------------

    /// Add a paper from a DOI, an arXiv id, or a doi.org / arxiv.org URL. A DOI or arXiv id already there is not
    /// added again (that entry is answered).
    pub fn add(&self, input: &str) -> Res<PaperAdded> {
        let existing = self.list().unwrap_or_default();
        let ax = parse_arxiv(input).filter(|_| input.to_lowercase().contains("arxiv") || parse_doi(input).is_none());
        let doi = if ax.is_none() { parse_doi(input) } else { None };
        let same = |p: &&Paper| {
            (doi.is_some() && p.doi.as_deref().map(str::to_lowercase) == doi.as_deref().map(str::to_lowercase)) || (ax.is_some() && p.arxiv == ax)
        };
        if let Some(p) = existing.iter().find(same) {
            return Ok(PaperAdded { paper: p.clone(), created: false, pdf: false, gate: None });
        }
        let mut m = match (&doi, &ax) {
            (Some(d), _) => remote::crossref(self.net, d)?,
            (None, Some(a)) => remote::arxiv(self.net, a)?,
            _ => return Err(format!("not a DOI or arXiv id: {input}")),
        };
        let title = s(&m, "title").unwrap_or_default();
        let year = s(&m, "date").and_then(|d| d.get(..4).map(String::from));
        let key = self.next_citekey(&list(&m, "author"), year.as_deref(), &title)?;
        let dir = self.base()?.join(&key);
        std::fs::create_dir_all(&dir).map_err(io(&dir))?;
        m.insert("citekey".into(), key.clone().into());
        m.insert("dateAdded".into(), now_stamp().into());
        let got = if self.cfg.download_pdfs { self.fetch_pdf(&dir, &key, ax.as_deref(), &mut m)? } else { Err(None) };
        let paper = self.saved(&dir, &key, &m)?;
        Ok(PaperAdded { paper, created: true, pdf: got.is_ok(), gate: got.err().flatten() })
    }

    /// The PDF: arXiv's, else an open-access copy the indexes know; a publisher's paywalled PDF is left to the user
    /// (or to the PDF sources other plugins add). → saved, or not and the first copy behind a sign-in.
    fn fetch_pdf(&self, dir: &Path, key: &str, ax: Option<&str>, m: &mut Mapping) -> Res<Result<(), Option<String>>> {
        let from_entry = m.get("archiveID").and_then(Value::as_str).and_then(|v| v.strip_prefix("arXiv:")).map(String::from);
        let arxiv_pdf = ax.map(String::from).or(from_entry).map(|a| (format!("https://arxiv.org/pdf/{a}"), "arXiv"));
        let doi = s(m, "DOI");
        let more = remote::Index::order(&self.cfg.indexes);
        let tries = arxiv_pdf.into_iter().chain(doi.iter().flat_map(|d| remote::open_access_pdfs(self.net, d, &self.cfg.email, &more)));
        let mut gate = None;
        for (url, from) in tries {
            match self.net.pdf(&url) {
                Ok(b) => {
                    let name = format!("{key}.pdf");
                    std::fs::write(dir.join(&name), &b).map_err(io(dir))?;
                    m.insert("files".into(), Value::Sequence(vec![name.into()]));
                    m.insert("pdfFrom".into(), format!("{from}: {url}").into());
                    return Ok(Ok(()));
                }
                Err(Miss::Gate(u)) => gate = gate.or(Some(u)),
                Err(Miss::Other(_)) => {}
            }
        }
        Ok(Err(gate))
    }

    /// A PDF dropped on the library: a DOI (the published version) or else an arXiv id on its first pages gives the
    /// metadata, as `add` does; without one (or offline) the entry is named after the file. The PDF goes into the
    /// entry's folder unless it already has one.
    pub fn import_pdf(&self, name: &str, bytes: &[u8]) -> Res<PaperAdded> {
        self.import_pdf_with(name, bytes, &ImportOpts::default())
    }

    pub fn import_pdf_with(&self, name: &str, bytes: &[u8], opts: &ImportOpts) -> Res<PaperAdded> {
        if !bytes.starts_with(b"%PDF") {
            return Err(format!("{name} is not a PDF"));
        }
        let file = name.rsplit('/').next().unwrap_or(name).to_string();
        // the same file filed already — by its name, or by its content under another name (2026-10-18: 24 loose copies
        // of a real library's Zotero PDFs were filed twice): that entry, nothing added
        if opts.keep_name {
            let digest = sha(bytes);
            let same = |p: &Paper| {
                p.pdf.as_deref().is_some_and(|f| f.rsplit('/').next() == Some(file.as_str()))
                    || p.pdf.as_deref().and_then(|f| std::fs::read(self.root.join(f)).ok()).is_some_and(|b| b.len() == bytes.len() && sha(&b) == digest)
            };
            if let Some(p) = self.list()?.into_iter().find(|p| same(p)) {
                return Ok(PaperAdded { paper: p, created: false, pdf: true, gate: None });
            }
        }
        let text = pdf_text(bytes);
        let id = parse_doi(&text).or_else(|| parse_arxiv(&text).map(|a| format!("arXiv:{a}")));
        let mut added = match id.and_then(|i| self.add(&i).ok()) {
            Some(a) => a,
            None => self.entry_named_after(name)?,
        };
        // the user's own file: under its own name when asked (first among the files), else `<key>.pdf` when it has none
        let dir = safe_join(self.root, &added.paper.dir)?;
        let mut m = entry::read(&dir).unwrap_or_default();
        let mut changed = false;
        if opts.keep_name || added.paper.pdf.is_none() {
            let file = if opts.keep_name { file } else { format!("{}.pdf", added.paper.key) };
            if !dir.join(&file).exists() {
                std::fs::write(dir.join(&file), bytes).map_err(io(&dir))?;
            }
            let mut files: Vec<Value> = m.get("files").and_then(Value::as_sequence).cloned().unwrap_or_default();
            if !files.iter().any(|f| f.as_str() == Some(file.as_str())) {
                files.insert(0, file.into());
            }
            m.insert("files".into(), Value::Sequence(files));
            changed = true;
        }
        if let Some(kind) = opts.kind.as_deref().filter(|k| !k.is_empty()) {
            m.insert("type".into(), kind.into());
            changed = true;
        }
        if !opts.collections.is_empty() {
            join_all(&mut m, "collections", opts.collections.iter().map(|c| Value::from(c.as_str())));
            changed = true;
        }
        if changed {
            self.save(&dir, &m)?;
            added.paper = self.paper_of(&dir, &added.paper.key, &m);
            added.pdf = added.paper.pdf.is_some();
        }
        self.write_bib()?;
        Ok(added)
    }

    /// An entry for a PDF without identifiers: its title from the file's name.
    fn entry_named_after(&self, name: &str) -> Res<PaperAdded> {
        let stem = name.rsplit('/').next().unwrap_or(name).trim_end_matches(".pdf").trim_end_matches(".PDF");
        let title: String = stem.replace(['_', '-'], " ").split_whitespace().collect::<Vec<_>>().join(" ");
        let base = self.base()?;
        let key = citekey(&[], None, &title, &|k| base.join(k).exists());
        let dir = base.join(&key);
        std::fs::create_dir_all(&dir).map_err(io(&dir))?;
        let mut m = Mapping::new();
        m.insert("title".into(), title.into());
        m.insert("type".into(), "document".into());
        m.insert("citekey".into(), key.clone().into());
        m.insert("dateAdded".into(), now_stamp().into());
        self.save(&dir, &m)?;
        Ok(PaperAdded { paper: self.paper_of(&dir, &key, &m), created: true, pdf: false, gate: None })
    }

    /// A PDF a plugin found (the PDF sources, docs/guides/PLUGIN-API.md) becomes the paper's: `file` is a download in a
    /// plugin's cache, `from` says where it came from (kept as `pdfFrom`). Only a real PDF, only from a plugin's
    /// cache, and never over a PDF the paper already has.
    pub fn attach_pdf(&self, key: &str, file: &str, from: &str) -> Res<Paper> {
        let paper = self.find(key)?;
        if !file.starts_with(PLUGIN_CACHE) || file.contains("..") {
            return Err(format!("{file}: a PDF to attach comes from a plugin's cache ({PLUGIN_CACHE}<id>/…)"));
        }
        let dir = safe_join(self.root, &paper.dir)?;
        let mut m = entry::read(&dir).unwrap_or_default();
        if m.get("files").and_then(Value::as_sequence).is_some_and(|f| !f.is_empty()) {
            return Err(format!("{key} has a PDF already"));
        }
        let src = safe_join(self.root, file)?;
        let bytes = std::fs::read(&src).map_err(io(&src))?;
        if !bytes.starts_with(b"%PDF") {
            return Err(format!("{file} is not a PDF"));
        }
        let name = format!("{key}.pdf");
        std::fs::write(dir.join(&name), &bytes).map_err(io(&dir))?;
        let _ = std::fs::remove_file(&src); // moved, not copied: the cache keeps no second one
        m.insert("files".into(), Value::Sequence(vec![name.into()]));
        m.insert("pdfFrom".into(), from.trim().to_string().into());
        self.saved(&dir, &paper.key, &m)
    }

    // --- changing ----------------------------------------------------------------------------------------------

    /// The edited fields into the entry's note (everything else kept), then refs.bib.
    pub fn edit(&self, e: &PaperEdit) -> Res<Paper> {
        let paper = self.find(&e.key)?;
        let dir = safe_join(self.root, &paper.dir)?;
        let mut m = entry::read(&dir).unwrap_or_default();
        // the venue lives in the field the item type uses (journal, proceedings, book, publisher)
        let venue_key = ["publicationTitle", "proceedingsTitle", "bookTitle", "publisher"].into_iter().find(|k| m.contains_key(*k)).unwrap_or("publicationTitle");
        let seq = |xs: &[String]| Value::Sequence(xs.iter().map(|x| x.trim()).filter(|x| !x.is_empty()).map(Value::from).collect());
        for (k, v) in [
            ("title", Value::from(e.title.trim())),
            ("author", seq(&e.authors)),
            ("date", Value::from(e.date.trim())),
            (venue_key, Value::from(e.venue.trim())),
            ("collections", seq(&e.collections)),
            ("tags", seq(&e.tags)),
        ] {
            let empty = matches!(&v, Value::String(x) if x.is_empty()) || matches!(&v, Value::Sequence(x) if x.is_empty());
            if empty {
                m.remove(k);
            } else {
                m.insert(k.into(), v);
            }
        }
        self.saved(&dir, &paper.key, &m)
    }

    /// An entry's type (`book`, `thesis`, `manuscript`…), as its note (`itemType`) and refs.bib say it.
    pub fn set_type(&self, key: &str, kind: &str) -> Res<Paper> {
        let paper = self.find(key)?;
        let dir = safe_join(self.root, &paper.dir)?;
        let mut m = entry::read(&dir).unwrap_or_default();
        m.insert("type".into(), kind.trim().into());
        self.saved(&dir, &paper.key, &m)
    }

    /// Two entries that are one reference (the same PDF filed twice): `into` keeps its metadata and gains `dup`'s type
    /// when it has none of its own beyond the default, its collections and tags; `dup` goes to the Trash.
    pub fn merge(&self, dup: &str, into: &str) -> Res<Paper> {
        if dup == into {
            return Err("an entry is not merged into itself".into());
        }
        let all = self.list()?;
        let (Some(d), Some(i)) = (all.iter().find(|p| p.key == dup), all.iter().find(|p| p.key == into)) else {
            return Err(format!("no reference {dup} or {into}"));
        };
        let dir = safe_join(self.root, &i.dir)?;
        let mut m = entry::read(&dir).unwrap_or_default();
        let from = entry::read(&safe_join(self.root, &d.dir)?).unwrap_or_default();
        let own_type = s(&m, "type").filter(|t| t != "document" && t != "journalArticle");
        if let (None, Some(t)) = (own_type, s(&from, "type").filter(|t| t != "document")) {
            m.insert("type".into(), t.into());
        }
        for key in ["collections", "tags"] {
            join_all(&mut m, key, from.get(key).and_then(Value::as_sequence).into_iter().flatten().cloned());
        }
        self.save(&dir, &m)?;
        self.trash.trash(&d.dir)?;
        self.write_bib()?;
        Ok(self.paper_of(&dir, &i.key, &m))
    }

    /// Removes an entry: its folder goes to the Trash (recoverable), refs.bib is rewritten. → where it went.
    pub fn delete(&self, key: &str) -> Res<String> {
        let paper = self.find(key)?;
        let to = self.trash.trash(&paper.dir)?;
        self.write_bib()?;
        Ok(to)
    }

    /// Every entry's `info.yaml` folded into its note (entry.rs). A dry run (`apply` false) only lists them; applied,
    /// each `info.yaml` and note is first copied to `.atlas/trash/<time>-refs-before-fold/<key>/`, then refs.bib rewritten.
    pub fn fold_all(&self, apply: bool) -> Res<Folded> {
        let base = self.base()?;
        let mut dirs: Vec<_> = match std::fs::read_dir(&base) {
            Ok(r) => r.flatten().map(|e| e.path()).filter(|d| d.join(entry::LEGACY).is_file()).collect(),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(e) => return Err(io(&base)(e)),
        };
        dirs.sort();
        let entries: Vec<(String, usize)> = dirs.iter().map(|d| (entry::key_of(d), entry::read(d).map_or(0, |m| m.len()))).collect();
        if !apply || dirs.is_empty() {
            return Ok(Folded { entries, snapshot: None });
        }
        let snap = format!(".atlas/trash/{}-refs-before-fold", chrono::Local::now().format("%Y%m%d-%H%M%S"));
        for d in &dirs {
            let key = entry::key_of(d);
            let to = self.root.join(&snap).join(&key);
            std::fs::create_dir_all(&to).map_err(io(&to))?;
            for f in [entry::LEGACY.to_string(), entry::note_file(&key), entry::LEGACY_NOTE.to_string()] {
                if d.join(&f).is_file() {
                    std::fs::copy(d.join(&f), to.join(&f)).map_err(io(&to))?;
                }
            }
        }
        for d in &dirs {
            entry::fold(self.made, d)?;
        }
        self.write_bib()?;
        Ok(Folded { entries, snapshot: Some(snap) })
    }
}

/// `values` added to the list under `key`, each once; the key stays absent when the list would be empty.
fn join_all(m: &mut Mapping, key: &str, values: impl Iterator<Item = Value>) {
    let mut have: Vec<Value> = m.get(key).and_then(Value::as_sequence).cloned().unwrap_or_default();
    for v in values {
        if !have.contains(&v) {
            have.push(v);
        }
    }
    if !have.is_empty() {
        m.insert(key.into(), Value::Sequence(have));
    }
}

fn sha(bytes: &[u8]) -> [u8; 32] {
    use sha2::Digest;
    sha2::Sha256::digest(bytes).into()
}

/// Text of a PDF's first pages (`pdftotext`; empty when it is not installed or fails).
fn pdf_text(bytes: &[u8]) -> String {
    let tmp = std::env::temp_dir().join(format!("atlas-papers-import-{}-{:x}.pdf", std::process::id(), sha(bytes)[0]));
    if std::fs::write(&tmp, bytes).is_err() {
        return String::new();
    }
    let out = std::process::Command::new("pdftotext").args(["-l", "2", "-q"]).arg(&tmp).arg("-").output();
    let _ = std::fs::remove_file(&tmp);
    out.ok().filter(|o| o.status.success()).map(|o| String::from_utf8_lossy(&o.stdout).into_owned()).unwrap_or_default()
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::entry::tests::Plain;
    use crate::net::fake::{Answer, Table};

    /// The Trash of a temp vault: `.atlas/trash/<n>/<path>`.
    pub struct TempTrash(pub PathBuf);
    impl Trash for TempTrash {
        fn trash(&self, rel: &str) -> Res<String> {
            let from = safe_join(&self.0, rel)?;
            if !from.exists() || rel.trim_matches('/').is_empty() {
                return Err(format!("{rel}: not there"));
            }
            let to = self.0.join(".atlas/trash/1").join(rel);
            std::fs::create_dir_all(to.parent().unwrap()).map_err(|e| e.to_string())?;
            std::fs::rename(&from, &to).map_err(|e| e.to_string())?;
            Ok(".atlas/trash/1".into())
        }
    }

    /// A temp vault and what a library over it needs (no network unless a test gives a table).
    pub struct Vault {
        pub d: tempfile::TempDir,
        pub root: PathBuf,
        pub cfg: Settings,
        pub net: Table,
        pub trash: TempTrash,
    }

    impl Default for Vault {
        fn default() -> Self {
            Self::new()
        }
    }

    impl Vault {
        pub fn new() -> Vault {
            let d = tempfile::tempdir().unwrap();
            let root = d.path().canonicalize().unwrap();
            Vault { d, trash: TempTrash(root.clone()), root, cfg: Settings::default(), net: Table::default() }
        }
        pub fn lib(&self) -> Lib<'_> {
            Lib { root: &self.root, cfg: &self.cfg, net: &self.net, made: &Plain, trash: &self.trash }
        }
    }

    /// A plugin's PDF source left a download in its cache: it becomes the paper's PDF, once, and only a real PDF from
    /// a plugin's cache does.
    #[test]
    fn a_pdf_a_plugin_found_is_attached_from_its_cache_only() {
        let v = Vault::new();
        let lib = v.lib();
        let root = &v.root;
        std::fs::create_dir_all(root.join("refs/papers/kitaev2006")).unwrap();
        std::fs::write(root.join("refs/papers/kitaev2006/info.yaml"), "citekey: kitaev2006\ntitle: Anyons\nDOI: 10.1016/j.aop.2005.10.005\n").unwrap();
        let cache = root.join(".atlas/cache/plugins/oa");
        std::fs::create_dir_all(&cache).unwrap();
        std::fs::write(cache.join("x.pdf"), b"%PDF-1.4\n%%EOF\n").unwrap();
        std::fs::write(cache.join("page.html"), b"<html>paywall</html>").unwrap();
        std::fs::write(root.join("notes.pdf"), b"%PDF-1.4\n").unwrap();
        assert!(lib.attach_pdf("kitaev2006", "notes.pdf", "x").is_err(), "not from a plugin's cache");
        assert!(lib.attach_pdf("kitaev2006", ".atlas/cache/plugins/oa/page.html", "x").is_err(), "not a PDF");
        assert!(lib.attach_pdf("nope", ".atlas/cache/plugins/oa/x.pdf", "x").is_err());
        let p = lib.attach_pdf("kitaev2006", ".atlas/cache/plugins/oa/x.pdf", "Semantic Scholar: https://s.example/x.pdf").unwrap();
        assert_eq!(p.pdf.as_deref(), Some("refs/papers/kitaev2006/kitaev2006.pdf"));
        assert!(!cache.join("x.pdf").exists(), "moved out of the cache");
        let info = std::fs::read_to_string(root.join("refs/papers/kitaev2006/kitaev2006.md")).unwrap();
        assert!(!root.join("refs/papers/kitaev2006/info.yaml").exists(), "folded into the note");
        assert!(info.contains("pdfFrom: 'Semantic Scholar: https://s.example/x.pdf'") || info.contains("pdfFrom: \"Semantic Scholar"), "{info}");
        std::fs::write(cache.join("y.pdf"), b"%PDF-1.4\n").unwrap();
        assert!(lib.attach_pdf("kitaev2006", ".atlas/cache/plugins/oa/y.pdf", "x").is_err(), "never over a PDF it has");
    }

    /// The References move: a book's PDF filed with its type and collection, under its own file name (links keep
    /// finding it); refs.bib says @book; the type of an entry can be set after.
    #[test]
    fn a_pdf_is_filed_with_its_type_collection_and_own_name() {
        let v = Vault::new();
        let lib = v.lib();
        let opts = ImportOpts { kind: Some("book".into()), collections: vec!["Many-body".into()], keep_name: true };
        let a = lib.import_pdf_with("Coleman - Introduction to Many-Body Physics.pdf", b"%PDF-1.4\n%%EOF\n", &opts).unwrap();
        assert_eq!(a.paper.pdf.as_deref(), Some(format!("{}/Coleman - Introduction to Many-Body Physics.pdf", a.paper.dir).as_str()));
        let info = std::fs::read_to_string(v.root.join(&a.paper.dir).join(format!("{}.md", a.paper.key))).unwrap();
        assert!(info.contains("itemType: book") && info.contains("- Many-body"), "{info}");
        assert!(std::fs::read_to_string(v.root.join("refs/refs.bib")).unwrap().contains(&format!("@book{{{}", a.paper.key)));
        let again = lib.import_pdf_with("Coleman - Introduction to Many-Body Physics.pdf", b"%PDF-1.4\n", &opts).unwrap();
        assert_eq!((again.created, again.paper.key.as_str()), (false, a.paper.key.as_str()), "the same file again: that entry");
        // the same bytes under another name: that entry, nothing added
        let renamed = lib.import_pdf_with("Coleman 2015.pdf", b"%PDF-1.4\n%%EOF\n", &opts).unwrap();
        assert_eq!((renamed.created, renamed.paper.key.as_str()), (false, a.paper.key.as_str()));
        // two entries that are one: merged, the type and collections kept, the copy to the Trash
        let other = lib.import_pdf_with("Other.pdf", b"%PDF-1.4\nother\n", &ImportOpts { collections: vec!["DCA".into()], keep_name: true, ..Default::default() }).unwrap();
        let m = lib.merge(&other.paper.key, &a.paper.key).unwrap();
        assert_eq!(m.collections, vec!["Many-body".to_string(), "DCA".into()]);
        assert!(!v.root.join(&other.paper.dir).exists(), "the copy is in the Trash");
        assert!(v.root.join(".atlas/trash/1").join(&other.paper.dir).is_dir());
        assert!(lib.merge(&a.paper.key, &a.paper.key).is_err());
        lib.set_type(&a.paper.key, "manuscript").unwrap();
        assert!(std::fs::read_to_string(v.root.join("refs/refs.bib")).unwrap().contains(&format!("@unpublished{{{}", a.paper.key)));
    }

    #[test]
    fn a_dropped_pdf_without_ids_becomes_an_entry_named_after_the_file() {
        let v = Vault::new();
        let lib = v.lib();
        assert!(lib.import_pdf("x.pdf", b"not a pdf").is_err());
        let pdf = b"%PDF-1.4\n%%EOF\n"; // no text, no DOI: offline-safe
        let a = lib.import_pdf("Spectral_functions-notes.pdf", pdf).unwrap();
        assert_eq!(a.paper.title, "Spectral functions notes");
        assert_eq!(a.paper.key, "spectral");
        assert!(a.created && a.pdf);
        assert_eq!(a.paper.pdf.as_deref(), Some("refs/papers/spectral/spectral.pdf"));
        assert_eq!(std::fs::read(v.root.join("refs/papers/spectral/spectral.pdf")).unwrap(), pdf);
        let again = lib.import_pdf("Spectral_functions-notes.pdf", pdf).unwrap();
        assert_eq!(again.paper.key, "spectrala", "a second drop never overwrites");
        assert!(std::fs::read_to_string(v.root.join("refs/refs.bib")).unwrap().contains("spectrala"));
        let ed = PaperEdit {
            key: "spectral".into(),
            title: "Spectral functions".into(),
            authors: vec!["Mahan, Gerald".into(), " ".into()],
            date: "2000".into(),
            venue: "Plenum".into(),
            collections: vec!["Books".into()],
            tags: vec![],
        };
        let p = lib.edit(&ed).unwrap();
        assert_eq!((p.title.as_str(), p.year.as_deref(), p.collections.clone()), ("Spectral functions", Some("2000"), vec!["Books".to_string()]));
        assert_eq!(p.authors, vec!["Mahan, Gerald"]);
        let info = std::fs::read_to_string(v.root.join("refs/papers/spectral/spectral.md")).unwrap();
        assert!(info.contains("citekey: spectral") && info.contains("files:") && !info.contains("keywords:"), "other fields kept, empty dropped: {info}");
        assert_eq!(lib.delete("spectrala").unwrap(), ".atlas/trash/1");
        assert!(!v.root.join("refs/papers/spectrala").exists());
        assert!(!std::fs::read_to_string(v.root.join("refs/refs.bib")).unwrap().contains("spectrala"));
        assert!(lib.delete("nope").is_err());
    }

    #[test]
    fn citekey_matches_existing_style_and_dedupes() {
        let a = vec!["Altland, Alexander".to_string()];
        assert_eq!(citekey(&a, Some("2023"), "Condensed Matter Field Theory", &|_| false), "altland2023condensed");
        assert_eq!(citekey(&["Sénéchal, David".into()], Some("2008"), "The Theory of...", &|_| false), "senechal2008theory");
        assert_eq!(citekey(&a, Some("2023"), "Condensed", &|k| k == "altland2023condensed"), "altland2023condenseda");
    }

    #[test]
    fn lists_library_and_writes_bib_like_refs_bib_py() {
        let v = Vault::new();
        let lib = v.lib();
        assert!(lib.list().unwrap().is_empty(), "no folder yet: an empty library");
        let p = v.root.join("refs/papers/anderson1972more");
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("info.yaml"), "title: More Is Different\ntype: journalArticle\nauthor:\n- Anderson, P. W.\ndate: 1972-08-04\npublicationTitle: Science\nDOI: 10.1126/science.177.4047.393\ncitekey: anderson1972more\ncollections: [Philosophy]\nfiles: [a.pdf]\n").unwrap();
        std::fs::write(p.join("a.pdf"), "%PDF").unwrap();
        let l = lib.list().unwrap();
        assert_eq!((l[0].key.as_str(), l[0].year.as_deref(), l[0].pdf.as_deref()), ("anderson1972more", Some("1972"), Some("refs/papers/anderson1972more/a.pdf")));
        assert_eq!(l[0].collections, vec!["Philosophy"]);
        assert!(l[0].tags.is_empty());
        assert_eq!(lib.write_bib().unwrap(), 1);
        let bib = std::fs::read_to_string(v.root.join("refs/refs.bib")).unwrap();
        assert!(bib.contains("@article{anderson1972more,") && bib.contains("journal = {Science}") && bib.contains("year = {1972}"), "{bib}");
        assert!(lib.bibtex("anderson1972more").unwrap().starts_with("@article{anderson1972more,"));
        // the fold: listed on a dry run, the files copied to the Trash first, then folded
        let dry = lib.fold_all(false).unwrap();
        assert_eq!((dry.entries.len(), dry.snapshot), (1, None));
        let done = lib.fold_all(true).unwrap();
        let snap = done.snapshot.unwrap();
        assert!(v.root.join(&snap).join("anderson1972more/info.yaml").is_file() && !p.join("info.yaml").exists());
        assert_eq!(lib.list().unwrap()[0].collections, vec!["Philosophy"], "read back from the note");
    }

    /// Adding by DOI and by arXiv id on recorded answers: Crossref's or arXiv's metadata, the PDF from arXiv or an
    /// open-access copy, the same paper again not added twice.
    #[test]
    fn adds_from_crossref_and_arxiv_through_the_net() {
        let mut v = Vault::new();
        let work = serde_json::json!({ "message": { "title": ["More Is Different"], "type": "journal-article",
            "author": [{ "family": "Anderson", "given": "P. W." }], "issued": { "date-parts": [[1972, 8, 4]] } } });
        let oa = serde_json::json!({ "doi": "https://doi.org/10.1126/science.177.4047.393", "best_oa_location": { "is_oa": true, "pdf_url": "https://repo.example/more.pdf" } });
        let atom = "<feed><entry><title>Quantum spin liquids</title><published>2000-05-12T00:00:00Z</published><author><name>Leon Balents</name></author></entry></feed>";
        v.net = Table::default()
            .on("https://api.crossref.org/works/10.1126/science.177.4047.393", Answer::Json(work))
            .on("https://api.openalex.org/works/doi:10.1126/science.177.4047.393", Answer::Json(oa))
            .on("https://repo.example/more.pdf", Answer::Bytes(b"%PDF-1.5 more".to_vec()))
            .on("https://export.arxiv.org/api/query?id_list=cond-mat/0005226", Answer::Text(atom.into()))
            .on("https://arxiv.org/pdf/cond-mat/0005226", Answer::Bytes(b"<html>busy</html>".to_vec()));
        let lib = v.lib();
        let a = lib.add("10.1126/science.177.4047.393").unwrap();
        assert!(a.created && a.pdf && a.paper.key == "anderson1972more", "{:?}", a.paper);
        let note = std::fs::read_to_string(v.root.join("refs/papers/anderson1972more/anderson1972more.md")).unwrap();
        assert!(note.contains("pdfFrom: 'OpenAlex: https://repo.example/more.pdf'") && note.contains("library.paper"), "{note}");
        let b = lib.add("arXiv:cond-mat/0005226").unwrap();
        assert!(b.created && !b.pdf, "arXiv answered a page, not a PDF: {:?}", b.paper);
        assert_eq!(b.paper.arxiv.as_deref(), Some("cond-mat/0005226"));
        assert!(!lib.add("https://doi.org/10.1126/science.177.4047.393").unwrap().created, "dedup");
        assert!(lib.add("hello").is_err());
        assert!(lib.add("10.1/unknown").unwrap_err().contains("Crossref"));
    }
}
