//! The vault's libraries (`[ui] libraries`; docs/design/DESIGN-android-native-app.md §4): each a view over files with a
//! kind — a folder's files or a Base's notes — or one Atlas or a plugin gives, named by its id. The core decides what a
//! library holds, in what order, and what goes on with it (its Continue row); the page and the phone's native Library
//! only draw it (`GET /api/libraries`, `GET /api/library?id=`, `POST /api/libraries/add`).
//!
//! The libraries a plugin or Atlas gives live in the page (their sources are its code); the list names them only to
//! order or hide them. One rule for those (ui/src/lib/libraries.svelte.ts applies it): when the list names none of
//! them, every one shows; when it names some, only those not hidden.
use crate::api::Mtime;
use crate::config::{Config, LibraryKind, LibraryLayout, LibrarySpec};
use crate::error::{Error, Result};
use crate::workspace::Workspace;
use serde::{Deserialize, Deserializer, Serialize};
use std::cmp::Ordering;
use ts_rs::TS;

/// Items in the Continue row at most.
const CONTINUE: usize = 12;

/// `[ui] libraries` as written before entries had fields (`["drawings", "references"]`) or with them: a bare string is
/// the entry with that id. Nothing is rewritten: the old form reads as it is, and is written in the new one only when
/// Settings changes the list.
pub fn specs_any<'de, D: Deserializer<'de>>(d: D) -> std::result::Result<Vec<LibrarySpec>, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Any {
        Id(String),
        Full(LibrarySpec),
    }
    Ok(Vec::<Any>::deserialize(d)?
        .into_iter()
        .map(|a| match a {
            Any::Id(id) => LibrarySpec { id, ..LibrarySpec::default() },
            Any::Full(s) => s,
        })
        .collect())
}

/// Where a library's items come from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum LibrarySource {
    /// A vault folder's files (`folder`).
    Folder,
    /// A `.base`'s notes (`base`).
    Base,
    /// A library Atlas or a plugin gives, drawn by the page only (its source is the page's code).
    Given,
}

pub fn source_of(spec: &LibrarySpec) -> LibrarySource {
    if !clean(&spec.folder).is_empty() || spec.folder.trim() == "/" {
        LibrarySource::Folder
    } else if !spec.base.trim().is_empty() {
        LibrarySource::Base
    } else {
        LibrarySource::Given
    }
}

/// One library as the list gives it, resolved: its title and icon filled in.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LibraryInfo {
    pub id: String,
    /// Its own, else the folder's or Base's name; for a given library, its id (the page knows its giver's title).
    pub title: String,
    pub kind: LibraryKind,
    /// One of the app's icon names, by kind (the page's and the phone's sets both have it).
    pub icon: String,
    pub source: LibrarySource,
    pub folder: String,
    pub base: String,
    pub sort: String,
    pub layout: LibraryLayout,
    pub hidden: bool,
}

/// One thing in a library: a file (a book, an album) with what its note says about it, or a note.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LibraryThing {
    /// The vault file it is: what opens.
    pub path: String,
    /// Its note (the companion note that stands for a file, or the note itself); None: it has none.
    pub note: Option<String>,
    pub title: String,
    /// The line under the title: its author, else the folder it is in.
    pub sub: String,
    /// A picture for it, a vault path for `/api/thumb` (its `cover` property, else the file itself when it has a
    /// picture: an EPUB, a CBZ, a PDF, an image) or an address; None: the kind's icon.
    pub cover: Option<String>,
    /// How far along, 0–1, from its note's `progress` (`42%` or `0.42`); None: not begun or not said.
    pub progress: Option<f64>,
    /// When last read or heard, from its note's `last_read`.
    pub last_read: Option<Mtime>,
    pub modified: Mtime,
    /// The folders it is in under the library's folder (`Sci-fi/Asimov`): the page's groups.
    pub group: String,
}

/// A library with its items, sorted, and what you were in the middle of.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LibraryView {
    pub library: LibraryInfo,
    /// Begun, not finished, by when last used, the newest first.
    #[serde(rename = "continue")]
    #[ts(rename = "continue")]
    pub continuing: Vec<LibraryThing>,
    pub items: Vec<LibraryThing>,
}

/// `POST /api/libraries/add`: a folder or a Base shown as a library ("Show as a library", Settings → Libraries → Add).
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(default)]
#[ts(export)]
pub struct LibraryAdd {
    pub folder: String,
    pub base: String,
    /// None: guessed from the files it holds.
    pub kind: Option<LibraryKind>,
    pub title: String,
}

/// The icon a kind is drawn with.
pub fn icon_of(kind: LibraryKind) -> &'static str {
    match kind {
        LibraryKind::Any => "folder",
        LibraryKind::Notes => "notes",
        LibraryKind::Books => "library",
        LibraryKind::Comics => "file",
        LibraryKind::Audio => "headphones",
        LibraryKind::Video => "film",
        LibraryKind::Pictures => "image",
        LibraryKind::Papers => "pdf",
        LibraryKind::Drawings => "pen",
    }
}

/// The kind a file's name says it is, by its extension; None: none of them (a `.txt`, a `.json`).
pub fn kind_of_file(name: &str) -> Option<LibraryKind> {
    let lower = name.to_ascii_lowercase();
    let ext = lower.rsplit_once('.').map_or("", |(_, e)| e);
    Some(match ext {
        "md" => LibraryKind::Notes,
        "epub" | "mobi" | "azw" | "azw3" | "fb2" | "djvu" => LibraryKind::Books,
        "cbz" | "cbr" | "cb7" => LibraryKind::Comics,
        "m4b" | "mp3" | "m4a" | "ogg" | "oga" | "opus" | "flac" | "wav" | "aac" => LibraryKind::Audio,
        "mp4" | "mkv" | "webm" | "mov" | "avi" => LibraryKind::Video,
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "jxl" | "heic" | "bmp" | "svg" => LibraryKind::Pictures,
        "pdf" => LibraryKind::Papers,
        "excalidraw" => LibraryKind::Drawings,
        _ => return None,
    })
}

/// Whether a library of `kind` holds a file named `name` (a books library holds PDFs too).
pub fn holds(kind: LibraryKind, name: &str) -> bool {
    match (kind, kind_of_file(name)) {
        (LibraryKind::Any, _) => true,
        (LibraryKind::Books, Some(LibraryKind::Papers)) => true,
        (k, Some(f)) => k == f,
        (_, None) => false,
    }
}

/// The kind most of `names` are (notes count only when nothing else is there); Any when none is.
pub fn guess_kind<'a>(names: impl IntoIterator<Item = &'a str>) -> LibraryKind {
    let mut counts: Vec<(LibraryKind, usize)> = Vec::new();
    for k in names.into_iter().filter_map(kind_of_file) {
        match counts.iter_mut().find(|(x, _)| *x == k) {
            Some((_, n)) => *n += 1,
            None => counts.push((k, 1)),
        }
    }
    let things = counts.iter().filter(|(k, _)| *k != LibraryKind::Notes);
    match things.max_by_key(|(_, n)| *n) {
        Some((k, _)) => *k,
        None if !counts.is_empty() => LibraryKind::Notes,
        None => LibraryKind::Any,
    }
}

/// A library's order: by what, and which way.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SortKey {
    Title,
    Modified,
    LastRead,
    Property(String),
}

/// `sort` as written: `title` (or empty), `modified`, `last_read`, any property; `-` first: descending.
pub fn sort_order(sort: &str) -> (SortKey, bool) {
    let s = sort.trim();
    let (desc, key) = s.strip_prefix('-').map_or((false, s), |k| (true, k.trim()));
    let key = match key {
        "" | "title" | "name" => SortKey::Title,
        "modified" => SortKey::Modified,
        "last_read" => SortKey::LastRead,
        p => SortKey::Property(p.to_string()),
    };
    (key, desc)
}

/// Every library of the vault's list, resolved.
pub fn list(cfg: &Config) -> Vec<LibraryInfo> {
    cfg.ui.libraries.iter().map(info).collect()
}

pub fn info(spec: &LibrarySpec) -> LibraryInfo {
    let source = source_of(spec);
    let named = match source {
        LibrarySource::Folder => last_part(&spec.folder).to_string(),
        LibrarySource::Base => last_part(&spec.base).trim_end_matches(".base").to_string(),
        LibrarySource::Given => spec.id.clone(),
    };
    LibraryInfo {
        id: spec.id.clone(),
        title: if spec.title.trim().is_empty() { named } else { spec.title.trim().to_string() },
        kind: spec.kind,
        icon: icon_of(spec.kind).to_string(),
        source,
        folder: clean(&spec.folder).to_string(),
        base: clean(&spec.base).to_string(),
        sort: spec.sort.clone(),
        layout: spec.layout,
        hidden: spec.hidden,
    }
}

/// `GET /api/library?id=`: a folder's or a Base's library with its items, in its own order or in `sort` (`&sort=`: the
/// order chosen on a screen for now, the list left as it is).
pub fn view(ws: &Workspace, id: &str, sort: Option<&str>) -> Result<LibraryView> {
    let cfg = ws.config()?;
    let spec = cfg.ui.libraries.iter().find(|s| s.id == id).ok_or_else(|| Error::NotFound(format!("no library {id}")))?;
    let library = info(spec);
    let mut items = match library.source {
        LibrarySource::Folder => folder_things(ws, &cfg, &library.folder, spec.kind)?,
        LibrarySource::Base => base_things(ws, &cfg, &library.base)?,
        LibrarySource::Given => return Err(Error::BadRequest(format!("{id} is a library the page gives, not a folder or a Base"))),
    };
    let (key, desc) = sort_order(sort.unwrap_or(&spec.sort));
    sort_things(&mut items, &key, desc);
    let continuing = continue_row(&items);
    Ok(LibraryView { library, continuing, items: items.into_iter().map(|(t, _)| t).collect() })
}

/// A thing with its note's properties (what a property sort reads).
type Sortable = (LibraryThing, Vec<(String, serde_yaml::Value)>);

fn sort_things(items: &mut [Sortable], key: &SortKey, desc: bool) {
    let title = |a: &LibraryThing, b: &LibraryThing| natural(&a.title, &b.title).then_with(|| a.path.cmp(&b.path));
    items.sort_by(|(a, av), (b, bv)| {
        let by = match key {
            SortKey::Title => Ordering::Equal,
            SortKey::Modified => a.modified.cmp(&b.modified),
            SortKey::LastRead => a.last_read.cmp(&b.last_read),
            SortKey::Property(k) => cmp_values(prop(av, k), prop(bv, k)),
        };
        let by = if desc { by.reverse() } else { by };
        // with no title order asked, a descending title sort is the title backwards
        if *key == SortKey::Title && desc { title(b, a) } else { by.then_with(|| title(a, b)) }
    });
}

fn prop<'a>(props: &'a [(String, serde_yaml::Value)], key: &str) -> Option<&'a serde_yaml::Value> {
    props.iter().find(|(k, _)| k == key).map(|(_, v)| v)
}

/// Property values compared: numbers as numbers, the rest as text; a missing one last.
fn cmp_values(a: Option<&serde_yaml::Value>, b: Option<&serde_yaml::Value>) -> Ordering {
    match (a, b) {
        (None, None) => Ordering::Equal,
        (None, _) => Ordering::Greater,
        (_, None) => Ordering::Less,
        (Some(x), Some(y)) => match (x.as_f64(), y.as_f64()) {
            (Some(x), Some(y)) => x.partial_cmp(&y).unwrap_or(Ordering::Equal),
            _ => natural(&text_of(x), &text_of(y)),
        },
    }
}

/// Case-insensitive, with runs of digits compared as numbers ("Vol 2" before "Vol 10").
fn natural(a: &str, b: &str) -> Ordering {
    let (mut x, mut y) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (x.peek().copied(), y.peek().copied()) {
            (None, None) => return a.cmp(b),
            (None, _) => return Ordering::Less,
            (_, None) => return Ordering::Greater,
            (Some(c), Some(d)) if c.is_ascii_digit() && d.is_ascii_digit() => {
                let take = |it: &mut std::iter::Peekable<std::str::Chars>| {
                    let mut n = String::new();
                    while let Some(c) = it.peek().copied().filter(char::is_ascii_digit) {
                        n.push(c);
                        it.next();
                    }
                    n
                };
                let (m, n) = (take(&mut x), take(&mut y));
                let (m, n) = (m.trim_start_matches('0'), n.trim_start_matches('0'));
                let o = m.len().cmp(&n.len()).then_with(|| m.cmp(n));
                if o != Ordering::Equal {
                    return o;
                }
            }
            (Some(c), Some(d)) => {
                let o = c.to_lowercase().cmp(d.to_lowercase());
                if o != Ordering::Equal {
                    return o;
                }
                x.next();
                y.next();
            }
        }
    }
}

/// The Continue row: begun (a `last_read`), not finished (progress below 1, or none said), the newest first.
fn continue_row(items: &[Sortable]) -> Vec<LibraryThing> {
    let mut row: Vec<&LibraryThing> = items.iter().map(|(t, _)| t).filter(|t| t.last_read.is_some() && t.progress.is_none_or(|p| p < 1.0)).collect();
    row.sort_by(|a, b| b.last_read.cmp(&a.last_read).then_with(|| a.path.cmp(&b.path)));
    row.into_iter().take(CONTINUE).cloned().collect()
}

fn folder_things(ws: &Workspace, cfg: &Config, folder: &str, kind: LibraryKind) -> Result<Vec<Sortable>> {
    let root = ws.root();
    let start = ws.resolve(folder)?;
    if !start.is_dir() {
        return Err(Error::NotFound(format!("no folder {folder}")));
    }
    let snap = crate::links::scan(root, cfg);
    let props = |rel: &str| snap.parsed.get(rel).and_then(|p| p.props_whole());
    let mut out = Vec::new();
    for (abs, rel) in crate::walk::files_under(root, &start, cfg) {
        let name = rel.rsplit('/').next().unwrap_or(&rel);
        if !holds(kind, name) || (name.ends_with(".md") && cfg.index_excluded(&rel)) {
            continue;
        }
        // a file that is part of another thing (a PDF's ink, a book's note, a mail's attachment) is not a thing here
        if crate::companion::thing_in(root, &rel, props).is_some() {
            continue;
        }
        let note = if name.ends_with(".md") {
            Some(rel.clone())
        } else {
            Some(crate::companion::stands_for_in(root, &rel, props)).filter(|n| n != &rel && n.ends_with(".md"))
        };
        let modified = std::fs::metadata(&abs).map_or(Mtime(0), |m| Mtime::of(&m).unwrap_or(Mtime(0)));
        let group = clean(rel.strip_prefix(folder).unwrap_or(&rel)).rsplit_once('/').map_or(String::new(), |(d, _)| d.to_string());
        let p = note_props(note.as_deref(), &props);
        out.push(thing(root, &rel, note, modified, group, p));
    }
    // a note that stands for a file listed here (a book's note in a library of every file) is that file, not a thing
    let noted: std::collections::HashSet<String> = out.iter().filter(|(t, _)| t.note.as_deref() != Some(&t.path)).filter_map(|(t, _)| t.note.clone()).collect();
    out.retain(|(t, _)| !noted.contains(&t.path));
    Ok(out)
}

fn base_things(ws: &Workspace, cfg: &Config, base: &str) -> Result<Vec<Sortable>> {
    let root = ws.root();
    let src = std::fs::read_to_string(ws.resolve(base)?).map_err(|e| Error::NotFound(format!("{base}: {e}")))?;
    let result = crate::bases::evaluate(root, cfg, &src, None);
    if let Some(e) = result.error {
        return Err(Error::BadRequest(format!("{base}: {e}")));
    }
    let snap = crate::links::scan(root, cfg);
    let props = |rel: &str| snap.parsed.get(rel).and_then(|p| p.props_whole());
    let Some(first) = result.views.into_iter().next() else { return Ok(Vec::new()) };
    Ok(first
        .rows
        .into_iter()
        .map(|row| {
            let modified = snap.parsed.get(&row.path).and_then(|p| p.mtime).map_or(Mtime(0), mtime_of);
            let p = note_props(Some(&row.path), &props);
            thing(root, &row.path, Some(row.path.clone()), modified, String::new(), p)
        })
        .collect())
}

/// A note's properties, cloned out of the index (none: no note, or none written).
fn note_props<'p>(note: Option<&str>, props: &impl Fn(&str) -> Option<&'p crate::note_props::Props>) -> Vec<(String, serde_yaml::Value)> {
    note.and_then(props).map_or_else(Vec::new, |p| p.iter().map(|(k, v)| (k.to_string(), v.clone())).collect())
}

fn thing(root: &std::path::Path, rel: &str, note: Option<String>, modified: Mtime, group: String, props: Vec<(String, serde_yaml::Value)>) -> Sortable {
    let get = |k: &str| prop(&props, k);
    let name = last_part(rel);
    let stem = name.rsplit_once('.').map_or(name, |(s, _)| s);
    let title = get("title").map(text_of).filter(|t| !t.is_empty()).unwrap_or_else(|| stem.to_string());
    let author = ["author", "authors", "creator", "artist"].iter().find_map(|k| get(k).map(text_of).filter(|t| !t.is_empty()));
    let cover = get("cover").map(text_of).filter(|c| !c.is_empty()).and_then(|c| cover_path(root, rel, &c)).or_else(|| has_picture(name).then(|| rel.to_string()));
    let progress = get("progress").and_then(share);
    let last_read = get("last_read").and_then(|v| when(&text_of(v)));
    let sub = author.unwrap_or_else(|| group.replace('/', " › "));
    (LibraryThing { path: rel.to_string(), note, title, sub, cover, progress, last_read, modified, group }, props)
}

/// A `cover` property as a picture: an address as it is; a `[[link]]` or a path, found as written, beside the item,
/// or at the vault's top.
fn cover_path(root: &std::path::Path, rel: &str, cover: &str) -> Option<String> {
    let c = cover.trim().trim_start_matches('!');
    if c.starts_with("http://") || c.starts_with("https://") {
        return Some(c.to_string());
    }
    let target = c.strip_prefix("[[").and_then(|s| s.strip_suffix("]]")).map_or(c, |s| s.split('|').next().unwrap_or(s)).trim();
    let dir = rel.rsplit_once('/').map_or("", |(d, _)| d);
    [if dir.is_empty() { target.to_string() } else { format!("{dir}/{target}") }, target.trim_start_matches('/').to_string()]
        .into_iter()
        .find(|p| root.join(p).is_file())
}

/// Files `/api/thumb` makes a picture of.
fn has_picture(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    matches!(kind_of_file(&lower), Some(LibraryKind::Pictures | LibraryKind::Papers | LibraryKind::Comics))
        || lower.ends_with(".epub")
        || lower.ends_with(".cbz")
}

/// `42%`, `0.42` or `42` (read as a share when above 1) → 0.42, within 0–1.
fn share(v: &serde_yaml::Value) -> Option<f64> {
    let t = text_of(v);
    let t = t.trim();
    let (num, pct) = t.strip_suffix('%').map_or((t, false), |n| (n.trim(), true));
    let n: f64 = num.parse().ok()?;
    let n = if pct || n > 1.0 { n / 100.0 } else { n };
    n.is_finite().then(|| n.clamp(0.0, 1.0))
}

/// An ISO time or a date as ms since 1970.
fn when(s: &str) -> Option<Mtime> {
    let s = s.trim();
    let ms = chrono::DateTime::parse_from_rfc3339(s)
        .map(|t| t.timestamp_millis())
        .ok()
        .or_else(|| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S").ok().map(|t| t.and_utc().timestamp_millis()))
        .or_else(|| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok().map(|d| d.and_hms_opt(0, 0, 0).unwrap_or_default().and_utc().timestamp_millis()))?;
    u64::try_from(ms).ok().map(Mtime)
}

fn mtime_of(t: std::time::SystemTime) -> Mtime {
    Mtime(t.duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64))
}

/// A property value as one line of text (a list joined with commas).
fn text_of(v: &serde_yaml::Value) -> String {
    use serde_yaml::Value as Y;
    match v {
        Y::String(s) => s.clone(),
        Y::Number(n) => n.to_string(),
        Y::Bool(b) => b.to_string(),
        Y::Sequence(items) => items.iter().map(text_of).filter(|t| !t.is_empty()).collect::<Vec<_>>().join(", "),
        _ => String::new(),
    }
}

/// `POST /api/libraries/add`: the folder or Base added to the list (its kind guessed when not given) and the config
/// saved; one already there comes back as it is (shown again when it was hidden).
pub fn add(ws: &Workspace, req: &LibraryAdd) -> Result<LibrarySpec> {
    let (folder, base) = (clean(&req.folder).to_string(), clean(&req.base).to_string());
    if folder.is_empty() == base.is_empty() {
        return Err(Error::BadRequest("a library is a folder or a Base: give one of them".into()));
    }
    let root = ws.root();
    let mut cfg = ws.config()?;
    if !folder.is_empty() && !ws.resolve(&folder)?.is_dir() {
        return Err(Error::NotFound(format!("no folder {folder}")));
    }
    if !base.is_empty() && (!base.ends_with(".base") || !ws.resolve(&base)?.is_file()) {
        return Err(Error::NotFound(format!("no Base {base}")));
    }
    let same = |s: &LibrarySpec| (!folder.is_empty() && clean(&s.folder) == folder) || (!base.is_empty() && clean(&s.base) == base);
    if let Some(i) = cfg.ui.libraries.iter().position(same) {
        if cfg.ui.libraries[i].hidden {
            cfg.ui.libraries[i].hidden = false;
            Config::save(root, &cfg)?;
        }
        return Ok(cfg.ui.libraries[i].clone());
    }
    let kind = match req.kind {
        Some(k) => k,
        None if !folder.is_empty() => {
            let files = crate::walk::files_under(root, &ws.resolve(&folder)?, &cfg);
            guess_kind(files.iter().map(|(_, rel)| last_part(rel)))
        }
        None => LibraryKind::Notes,
    };
    let named = if folder.is_empty() { last_part(&base).trim_end_matches(".base") } else { last_part(&folder) };
    let spec = LibrarySpec {
        id: unique_id(&cfg.ui.libraries, &slug(if req.title.trim().is_empty() { named } else { &req.title })),
        title: req.title.trim().to_string(),
        kind,
        folder,
        base,
        // what you were reading first, where the kind is read or heard; by title elsewhere
        sort: if matches!(kind, LibraryKind::Books | LibraryKind::Comics | LibraryKind::Audio) { "-last_read".into() } else { String::new() },
        layout: if matches!(kind, LibraryKind::Notes | LibraryKind::Any) { LibraryLayout::List } else { LibraryLayout::Covers },
        hidden: false,
    };
    cfg.ui.libraries.push(spec.clone());
    Config::save(root, &cfg)?;
    Ok(spec)
}

/// `base` itself, else with `-2`, `-3`… — never an id the list already has.
fn unique_id(list: &[LibrarySpec], base: &str) -> String {
    let base = if base.is_empty() { "library" } else { base };
    let taken = |id: &str| list.iter().any(|s| s.id == id);
    if !taken(base) {
        return base.to_string();
    }
    (2..).map(|n| format!("{base}-{n}")).find(|id| !taken(id)).unwrap_or_default()
}

fn slug(t: &str) -> String {
    let mut out = String::new();
    for c in t.to_lowercase().chars() {
        if c.is_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    out.trim_end_matches('-').to_string()
}

fn clean(p: &str) -> &str {
    p.trim().trim_matches('/')
}

fn last_part(p: &str) -> &str {
    let p = clean(p);
    p.rsplit('/').next().unwrap_or(p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn vault(config: &str) -> (tempfile::TempDir, Workspace) {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir_all(d.path().join(".atlas")).unwrap();
        fs::write(d.path().join(crate::config::CONFIG_FILE), config).unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        (d, ws)
    }

    fn write(d: &tempfile::TempDir, rel: &str, text: &str) {
        let p = d.path().join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    #[test]
    fn the_old_list_of_ids_reads_as_given_libraries() {
        let (_d, ws) = vault("[ui]\nlibraries = [\"drawings\", { id = \"books\", kind = \"books\", folder = \"Books\", layout = \"list\" }]\n");
        let list = list(&ws.config().unwrap());
        assert_eq!(list.len(), 2);
        assert_eq!((list[0].id.as_str(), list[0].source, list[0].kind), ("drawings", LibrarySource::Given, LibraryKind::Any));
        assert_eq!((list[1].title.as_str(), list[1].source, list[1].layout, list[1].icon.as_str()), ("Books", LibrarySource::Folder, LibraryLayout::List, "library"));
    }

    #[test]
    fn a_saved_list_round_trips_one_entry_a_line() {
        let (d, ws) = vault("# mine\n[ui]\nlibraries = [\"drawings\"]\n");
        let mut cfg = ws.config().unwrap();
        cfg.ui.libraries.push(LibrarySpec { id: "comics".into(), kind: LibraryKind::Comics, folder: "Comics".into(), ..Default::default() });
        Config::save(d.path(), &cfg).unwrap();
        let text = fs::read_to_string(d.path().join(crate::config::CONFIG_FILE)).unwrap();
        assert!(text.starts_with("# mine"), "comments kept: {text}");
        assert!(text.contains("\n  { id = \"comics\", folder = \"Comics\", kind = \"comics\", layout = \"covers\" },\n"), "one entry a line, defaults left out: {text}");
        assert_eq!(ws.config().unwrap().ui.libraries, cfg.ui.libraries);
    }

    #[test]
    fn kinds_by_shape() {
        assert_eq!(guess_kind(["a.epub", "b.epub", "c.pdf", "a.md", "b.md", "c.md"]), LibraryKind::Books);
        assert_eq!(guess_kind(["a.md", "b.md"]), LibraryKind::Notes);
        assert_eq!(guess_kind(["x.json"]), LibraryKind::Any);
        assert!(holds(LibraryKind::Books, "x.PDF") && !holds(LibraryKind::Papers, "x.epub") && holds(LibraryKind::Any, "x.json"));
        assert_eq!(sort_order("-last_read"), (SortKey::LastRead, true));
        assert_eq!(sort_order("year"), (SortKey::Property("year".into()), false));
        assert_eq!(natural("Vol 2", "vol 10"), Ordering::Less);
    }

    #[test]
    fn a_folder_library_lists_its_things_with_their_notes_and_what_goes_on() {
        let (d, ws) = vault("[ui]\nlibraries = [{ id = \"books\", kind = \"books\", folder = \"Books\", sort = \"-last_read\" }]\n");
        write(&d, "Books/Dune.epub", "x");
        write(&d, "Books/Dune.md", "---\ntitle: Dune\nauthor: Frank Herbert\nprogress: 42%\nlast_read: 2026-11-15T10:00:00Z\n---\n");
        write(&d, "Books/Sci-fi/Solaris.epub", "x");
        write(&d, "Books/Sci-fi/Solaris.md", "---\nprogress: 100%\nlast_read: 2026-11-16T11:00:00Z\n---\n");
        write(&d, "Books/Hyperion.pdf", "x");
        write(&d, "Books/Hyperion.pdf.excalidraw", "{}");
        write(&d, "Books/notes.txt", "not a book");
        let v = view(&ws, "books", None).unwrap();
        let paths: Vec<&str> = v.items.iter().map(|t| t.path.as_str()).collect();
        assert_eq!(paths, ["Books/Sci-fi/Solaris.epub", "Books/Dune.epub", "Books/Hyperion.pdf"], "newest read first, never read last; no notes, no ink");
        let dune = &v.items[1];
        assert_eq!((dune.title.as_str(), dune.sub.as_str(), dune.note.as_deref(), dune.progress), ("Dune", "Frank Herbert", Some("Books/Dune.md"), Some(0.42)));
        assert_eq!(dune.cover.as_deref(), Some("Books/Dune.epub"), "an EPUB is its own picture");
        assert_eq!(v.items[0].sub, "Sci-fi", "no author: its folder");
        let cont: Vec<&str> = v.continuing.iter().map(|t| t.path.as_str()).collect();
        assert_eq!(cont, ["Books/Dune.epub"], "finished and never begun stay out");
    }

    #[test]
    fn a_given_library_has_no_items_here() {
        let (_d, ws) = vault("[ui]\nlibraries = [\"drawings\"]\n");
        assert!(matches!(view(&ws, "drawings", None), Err(Error::BadRequest(_))));
        assert!(matches!(view(&ws, "nope", None), Err(Error::NotFound(_))));
    }

    #[test]
    fn a_base_library_lists_its_notes() {
        let (d, ws) = vault("[ui]\nlibraries = [{ id = \"films\", base = \"Films.base\", layout = \"list\", sort = \"year\" }]\n");
        write(&d, "Films.base", "filters:\n  and:\n    - type == \"film\"\nviews:\n  - type: table\n    name: all\n");
        write(&d, "notes/Alien.md", "---\ntype: film\nyear: 1979\n---\n");
        write(&d, "notes/Arrival.md", "---\ntype: film\nyear: 2016\ncover: arrival.jpg\n---\n");
        write(&d, "notes/arrival.jpg", "x");
        write(&d, "notes/Other.md", "---\ntype: book\n---\n");
        let v = view(&ws, "films", None).unwrap();
        let by_year: Vec<String> = view(&ws, "films", Some("-year")).unwrap().items.into_iter().map(|t| t.title).collect();
        assert_eq!(by_year, ["Arrival", "Alien"], "a screen's own order");
        let titles: Vec<&str> = v.items.iter().map(|t| t.title.as_str()).collect();
        assert_eq!(titles.len(), 2, "{titles:?}");
        assert!(titles.contains(&"Alien") && titles.contains(&"Arrival"));
        let arrival = v.items.iter().find(|t| t.title == "Arrival").unwrap();
        assert_eq!(arrival.cover.as_deref(), Some("notes/arrival.jpg"), "cover beside the note");
    }

    #[test]
    fn adding_a_folder_guesses_its_kind_once() {
        let (d, ws) = vault("[ui]\nlibraries = [\"drawings\"]\n");
        write(&d, "Comics/One/1.cbz", "x");
        write(&d, "Comics/One/2.cbz", "x");
        write(&d, "Comics/readme.md", "x");
        let spec = add(&ws, &LibraryAdd { folder: "/Comics/".into(), ..Default::default() }).unwrap();
        assert_eq!((spec.id.as_str(), spec.kind, spec.layout, spec.sort.as_str()), ("comics", LibraryKind::Comics, LibraryLayout::Covers, "-last_read"));
        let again = add(&ws, &LibraryAdd { folder: "Comics".into(), ..Default::default() }).unwrap();
        assert_eq!(again, spec, "the same folder is the same library");
        let ids: Vec<String> = ws.config().unwrap().ui.libraries.into_iter().map(|s| s.id).collect();
        assert_eq!(ids, ["drawings", "comics"]);
        assert!(matches!(add(&ws, &LibraryAdd { folder: "Nope".into(), ..Default::default() }), Err(Error::NotFound(_))));
        assert!(matches!(add(&ws, &LibraryAdd::default()), Err(Error::BadRequest(_))));
    }
}
