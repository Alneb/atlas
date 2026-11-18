//! Link index over the workspace's markdown: `[[wikilinks]]`, `![[embeds]]` and relative
//! `[text](path)` links, resolved Obsidian-style. Feeds backlinks (and later the graph).
//! Parsed links are cached per file by mtime, so a request re-reads only what changed.
use crate::api::{Backlink, Backlinks};
use crate::config::Config;
use crate::walk;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use crate::vault_changes::Stamp;
use std::time::{Duration, Instant, SystemTime};

#[path = "links_disk.rs"]
mod disk;

/// One link as written in a source note (target not yet resolved).
#[derive(Debug, Clone, PartialEq)]
struct RawLink {
    target: String,
    /// `[[…]]`/`![[…]]` resolve by name; `[](…)` relative to the source's folder.
    wiki: bool,
    embed: bool,
    line: u32,
    context: String,
    /// The property the link is the value of — `up: "[[Parent]]"` in the frontmatter, or
    /// `up:: [[Parent]]` in the text: what kind of link it is (a "typed" link).
    relation: Option<String>,
}

/// What one markdown file contributes: its links and its frontmatter (for Bases).
#[derive(Debug, Clone, Default)]
pub(crate) struct Parsed {
    links: Vec<RawLink>,
    pub props: crate::note_props::Props,
    pub size: u64,
    pub mtime: Option<SystemTime>,
    pub ctime: Option<SystemTime>,
    /// Its tags (tags.rs): frontmatter and inline, lower case.
    pub tags: Vec<String>,
    /// The words of its text, for [`unlinked`] to pass over a note that cannot name a file (empty above [`TEXT_BYTES`]).
    words: crate::word_bloom::Words,
}

impl Parsed {
    /// Its properties, when the note was read whole for them (a note above [`MAX_BYTES`] was not: it has none here).
    pub fn props_whole(&self) -> Option<&crate::note_props::Props> {
        (self.size <= MAX_BYTES).then_some(&self.props)
    }
}

/// Notes larger than this give no unlinked mentions. The text itself is never kept: it was 39 of the index's 47 MB
/// on a large real vault; [`unlinked`] reads it again from disk.
const TEXT_BYTES: u64 = 1 << 20;

/// Each note's parse, shared: a request takes the index by `Arc`, and a rebuild reuses every unchanged note's entry.
pub(crate) type FileCache = HashMap<String, Arc<Parsed>>;

/// One vault's index: every file (in [`Names`]) and every note's parse. Immutable once built; a change on disk makes
/// a new one that shares the unchanged parts.
pub(crate) struct Index {
    pub names: Arc<Names>,
    pub parsed: FileCache,
    /// Each note's links resolved, made by the first request that needs them and kept for the index's life: backlinks,
    /// Bases, tags and the link completion each resolved every link of the vault per request before.
    resolved: std::sync::OnceLock<Resolved>,
    /// How many notes link to each file, made once per index (search ranks by it).
    incoming: std::sync::OnceLock<HashMap<String, u32>>,
}

/// For each note, the file each of its links points at (`None`: unresolved), in [`Parsed::links`] order.
type Resolved = HashMap<String, Box<[Option<FileId>]>>;

/// The vaults' indexes, the most recently used first. The desktop's one core serves several vaults, so one slot would
/// rebuild from scratch on every switch; a vault unused for [`IDLE`] (or beyond [`WARM_VAULTS`]) is dropped — except a
/// vault [`keep_warm`] named (the desktop window's own), which is never dropped.
struct Warm {
    root: PathBuf,
    used: Instant,
    index: Arc<Index>,
    /// The vault's generation read before the index's walk (or patch), and when (None: no watcher vouches for it).
    walked: Option<(Stamp, Instant)>,
    /// When the index last walked the whole vault: patches are taken only within [`FULL_EVERY`] of it.
    full: Instant,
}
static CACHE: Mutex<Vec<Warm>> = Mutex::new(Vec::new());
/// The vaults whose index is never dropped, idle or not ([`keep_warm`]).
static KEPT: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());
const WARM_VAULTS: usize = 3;
const IDLE: Duration = Duration::from_secs(30 * 60);
/// How long an unchanged generation is taken at its word before walking anyway (a blind spot the watcher cannot see,
/// e.g. a folder moved in during its 250 ms batch, lasts at most this long).
const TRUST: Duration = Duration::from_secs(30);
/// How long patches (only the paths the watcher named) stand in for a walk before the whole vault is walked again — a
/// change no event told of is found within this long.
const FULL_EVERY: Duration = Duration::from_secs(5 * 60);
/// More changed paths than this: a walk is as quick (a sync bringing a big folder, a checkout).
const PATCH_MAX: usize = 400;

/// Files larger than this are not scanned (multi-MB transcripts, generated dumps).
const MAX_BYTES: u64 = 4 << 20;
const CONTEXT_CHARS: usize = 220;

/// Where a line of a note can hold links: in the frontmatter (under that property) or in the text. Code is never
/// visited.
#[derive(Clone, Copy)]
pub(crate) enum LineKind<'a> {
    Front(&'a str),
    Text,
}

/// A note's frontmatter as the one fence reader sees it (atlas_text::frontmatter: a BOM, CRLF, a `...` closer; an
/// opening `---` never closed is a rule, not frontmatter): the YAML's byte range and where the body starts (0, 0..0
/// without one).
fn front_matter(text: &str) -> (std::ops::Range<usize>, usize) {
    match atlas_text::frontmatter::split(text) {
        (Some(_), body) => (atlas_text::frontmatter::yaml_range(text).unwrap_or(0..0), text.len() - body.len()),
        (None, _) => (0..0, 0),
    }
}

/// Each line of a markdown text that may hold links, with its 1-based number and its byte offset in `text`; fenced
/// code is skipped. The one walk over a note both the index ([`parse`]) and the link rewrite on a move use.
pub(crate) fn link_lines<'a>(text: &'a str, mut f: impl FnMut(u32, usize, &'a str, LineKind<'_>)) {
    let mut fences = atlas_text::fence::Fences::default();
    let (yaml, body) = front_matter(text);
    let mut key = String::new();
    let mut at = 0;
    for (i, raw) in text.split_inclusive('\n').enumerate() {
        let offset = at;
        at += raw.len();
        let line = raw.strip_suffix('\n').map_or(raw, |l| l.strip_suffix('\r').unwrap_or(l));
        if offset < body {
            // the fences themselves are skipped
            if yaml.contains(&offset) {
                if let Some((k, _)) = line.split_once(':').filter(|(k, _)| !k.starts_with([' ', '-', '\t'])) {
                    key = k.trim().to_string();
                }
                f(i as u32 + 1, offset, line, LineKind::Front(&key));
            }
            continue;
        }
        if !fences.code(line) {
            f(i as u32 + 1, offset, line, LineKind::Text);
        }
    }
}

/// All links written in one markdown text; code (fenced and inline) is skipped. Links in the
/// frontmatter get the property as context (`topics: Condensed Matter`), not the YAML line.
fn parse(text: &str) -> Vec<RawLink> {
    let mut out = Vec::new();
    link_lines(text, |n, _, line, kind| {
        let before = out.len();
        parse_line(line, n, &mut out);
        match kind {
            LineKind::Front(key) => {
                for l in &mut out[before..] {
                    l.context = format!("{key}: {}", l.target);
                    l.relation = Some(key.to_string());
                }
            }
            // `key:: [[X]]` on a line of its own (a section property): the same kind of typed link
            LineKind::Text => {
                if let Some(key) = inline_key(line) {
                    for l in &mut out[before..] {
                        l.relation = Some(key.to_string());
                    }
                }
            }
        }
    });
    out
}

/// The key of a `key:: value` line (optionally a list item); None for anything else.
fn inline_key(line: &str) -> Option<&str> {
    let t = line.trim_start();
    let t = t.strip_prefix(['-', '*', '+']).map_or(t, str::trim_start);
    let (key, rest) = t.split_once("::")?;
    let ok = !key.is_empty()
        && key.chars().all(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | ' ' | '/'))
        && key.starts_with(|c: char| c.is_alphabetic() || c == '_')
        && rest.starts_with([' ', '\t']);
    ok.then_some(key.trim())
}

fn parse_line(line: &str, n: u32, out: &mut Vec<RawLink>) {
    for sp in link_spans(line) {
        out.push(RawLink { target: line[sp.start..sp.end].to_string(), wiki: sp.wiki, embed: sp.embed, line: n, context: context(line), relation: None });
    }
}

/// Where one link's target is written in its line: `[[target#a|alias]]` → `target#a`, `[t](target "title")` →
/// `target` (trimmed; never empty).
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct Span {
    pub start: usize,
    pub end: usize,
    pub wiki: bool,
    pub embed: bool,
}

/// The links of one line, in order; inline code skipped.
pub(crate) fn link_spans(line: &str) -> Vec<Span> {
    let b = line.as_bytes();
    let mut out = Vec::new();
    let mut push = |start: usize, end: usize, wiki: bool, embed: bool| {
        let t = &line[start..end];
        let lead = t.len() - t.trim_start().len();
        let t = t.trim();
        if !t.is_empty() {
            out.push(Span { start: start + lead, end: start + lead + t.len(), wiki, embed });
        }
    };
    let mut code = atlas_text::fence::code_spans(line).into_iter().peekable();
    let mut i = 0;
    let mut wiki_closes = true;
    while i < b.len() {
        match b[i] {
            // inline code (atlas_text's one reader): skipped whole; a backtick that opens none is text
            b'`' => {
                while code.next_if(|c| c.start < i).is_some() {} // spans a link stepped over
                i = code.next_if(|c| c.start == i).map_or(i + 1, |c| c.end);
            }
            b'[' if wiki_closes && b.get(i + 1) == Some(&b'[') => {
                let embed = i > 0 && b[i - 1] == b'!';
                match line[i + 2..].find("]]") {
                    // `[[ and [[Note]]`: a body with a `[` is not a link (the UI's wikilink-syntax.ts reads it so); the
                    // next `[[` is read on
                    Some(j) if line[i + 2..i + 2 + j].contains('[') => i += 2,
                    Some(j) => {
                        let inner = &line[i + 2..i + 2 + j];
                        // in a table the alias's bar is written `\|` (Obsidian): the backslash is not the target's
                        let end = inner.find('|').map_or(inner.len(), |k| if inner[..k].ends_with('\\') { k - 1 } else { k });
                        push(i + 2, i + 2 + end, true, embed);
                        i += 2 + j + 2;
                    }
                    // no `]]` in the rest of the line: no more wikilinks, but `[[x](y.md)` still has a markdown link
                    None => {
                        wiki_closes = false;
                        i += 1;
                    }
                }
            }
            b'[' => {
                // [text](target "title") — balanced only one level deep, enough for prose
                let Some(close) = line[i + 1..].find(']').map(|j| i + 1 + j) else { break };
                if b.get(close + 1) == Some(&b'(') {
                    if let Some(end) = line[close + 2..].find(')').map(|j| close + 2 + j) {
                        let embed = i > 0 && b[i - 1] == b'!';
                        let inside = &line[close + 2..end];
                        let lead = inside.len() - inside.trim_start().len();
                        let tok = inside.split_whitespace().next().unwrap_or("");
                        if is_local(tok) {
                            push(close + 2 + lead, close + 2 + lead + tok.len(), false, embed);
                        }
                        i = end + 1;
                        continue;
                    }
                }
                // not a link: step over this `[` only — it may enclose `[[wikilinks]]` (a YAML
                // flow list `topics: ["[[A]]", "[[B]]"]`, which jumping to `]` used to swallow)
                i += 1;
            }
            _ => i += 1,
        }
    }
    out
}

fn is_local(t: &str) -> bool {
    !(t.is_empty() || t.starts_with('#') || t.starts_with('<') || t.contains("://") || t.starts_with("mailto:"))
}

fn context(line: &str) -> String {
    let t = line.trim();
    if t.chars().count() <= CONTEXT_CHARS {
        return t.to_string();
    }
    t.chars().take(CONTEXT_CHARS).collect::<String>() + "…"
}

/// `a/b/../c` → `a/c`; None when it climbs out of the workspace.
fn normalize(p: &str) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    for s in p.split('/') {
        match s {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            s => parts.push(s),
        }
    }
    Some(parts.join("/"))
}

pub(crate) fn dir_of(p: &str) -> &str {
    p.rfind('/').map_or("", |i| &p[..i])
}

/// A target's `%XX` escapes decoded as the page's `decodeURI` does (`R%C3%A9union.md`, `x%20%281%29.md`), so a link the
/// editor opens is the one the index counts: reserved characters (`%23`, `%2F`) stay escaped, and a malformed escape or
/// one that is not UTF-8 keeps the target as written.
pub(crate) fn decode(t: &str) -> String {
    if !t.contains('%') {
        return t.to_string();
    }
    let b = t.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] != b'%' {
            out.push(b[i]);
            i += 1;
            continue;
        }
        let Some(v) = b.get(i + 1..i + 3).filter(|h| h.iter().all(u8::is_ascii_hexdigit)).and_then(|h| u8::from_str_radix(std::str::from_utf8(h).ok()?, 16).ok()) else { return t.to_string() };
        if v.is_ascii() && ";/?:@&=+$,#".contains(v as char) {
            out.extend_from_slice(&b[i..i + 3]);
        } else {
            out.push(v);
        }
        i += 3;
    }
    String::from_utf8(out).unwrap_or_else(|_| t.to_string())
}

/// A file of [`Names`]: its position in `files`. Each path is stored once; the lookups hold ids.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FileId(u32);

/// Every workspace file, indexed for Obsidian-style resolution.
pub(crate) struct Names {
    /// In walk order (what `/api/files` and the link targets list).
    files: Vec<String>,
    /// Ids sorted by path: the exact-path lookup, by binary search.
    sorted: Box<[FileId]>,
    /// lower-cased file name → its files
    by_name: HashMap<Box<str>, Vec<FileId>>,
}

impl Names {
    pub(crate) fn new(files: Vec<String>) -> Self {
        let id = |i: usize| FileId(u32::try_from(i).expect("fewer than 4 billion files"));
        let mut by_name: HashMap<Box<str>, Vec<FileId>> = HashMap::new();
        for (i, f) in files.iter().enumerate() {
            by_name.entry(f.rsplit('/').next().unwrap_or(f).to_lowercase().into()).or_default().push(id(i));
        }
        let mut sorted: Vec<FileId> = (0..files.len()).map(id).collect();
        sorted.sort_unstable_by(|a, b| files[a.0 as usize].cmp(&files[b.0 as usize]));
        sorted.dedup_by(|a, b| files[a.0 as usize] == files[b.0 as usize]);
        Names { files, sorted: sorted.into(), by_name }
    }

    pub(crate) fn files(&self) -> &[String] {
        &self.files
    }

    fn path(&self, id: FileId) -> &str {
        &self.files[id.0 as usize]
    }

    fn contains(&self, p: &str) -> bool {
        self.id_of(p).is_some()
    }

    /// The id of the file at exactly this path.
    fn id_of(&self, p: &str) -> Option<FileId> {
        self.sorted.binary_search_by(|&id| self.path(id).cmp(p)).ok().map(|i| self.sorted[i])
    }

    /// The file a link points at: explicit paths first, then by name (Obsidian's "shortest
    /// path"): same folder as the source wins, then the shortest path.
    fn resolve(&self, l: &RawLink, from: &str) -> Option<String> {
        self.resolve_target(&l.target, l.wiki, from)
    }

    /// How many files have this file name (any case).
    pub(crate) fn sharing(&self, file_name: &str) -> usize {
        self.by_name.get(file_name.to_lowercase().as_str()).map_or(0, Vec::len)
    }

    /// [`Self::resolve`] for a target as written (`[[target#x]]`'s `target#x`).
    pub(crate) fn resolve_target(&self, target: &str, wiki: bool, from: &str) -> Option<String> {
        let t = decode(target.split('#').next().unwrap_or(""));
        let t = t.trim();
        if t.is_empty() {
            return None;
        }
        // a dot is not always an extension: `[[Dr. Smith]]` is `Dr. Smith.md` (Obsidian tries both), a file by its full
        // name first
        let has_ext = t.rsplit('/').next().is_some_and(|n| n.contains('.'));
        let cands: Vec<String> = match () {
            _ if t.to_ascii_lowercase().ends_with(".md") => vec![t.to_string()],
            _ if has_ext => vec![t.to_string(), format!("{t}.md")],
            _ => vec![format!("{t}.md"), t.to_string()],
        };
        for c in &cands {
            let rel = normalize(&format!("{}/{c}", dir_of(from)));
            let root = normalize(c);
            // markdown links are relative to the source; wikilinks with a folder are from the root
            let order = if wiki { [root, rel] } else { [rel, root] };
            if let Some(hit) = order.into_iter().flatten().find(|p| self.contains(p)) {
                return Some(hit);
            }
        }
        if !wiki {
            return None;
        }
        cands.iter().find_map(|c| {
            let name = c.rsplit('/').next()?.to_lowercase();
            let suffix = format!("/{}", c.to_lowercase());
            let mut hits: Vec<&str> = self
                .by_name
                .get(name.as_str())?
                .iter()
                .map(|&id| self.path(id))
                .filter(|p| !c.contains('/') || p.to_lowercase().ends_with(&suffix))
                .collect();
            // then by path: the UI resolves the same way (ui/src/lib/vault.ts), whatever order each listed the files in
            hits.sort_by_key(|p| (dir_of(p) != dir_of(from), p.len(), *p));
            hits.first().map(|p| p.to_string())
        })
    }
}

/// The frontmatter mapping at the top of a note (empty when absent or malformed).
pub(crate) fn frontmatter(text: &str) -> serde_yaml::Mapping {
    atlas_text::frontmatter::mapping(text)
}

/// The vault's index, current: the walk is done on every call, and only the notes whose mtime changed are read again.
/// When nothing changed the same `Arc` comes back, so a request costs the walk and a few stats — never a copy. One
/// build per vault at a time (the page's first requests come together: one walk, the others wait for it), and the
/// other vaults' requests never wait on it.
pub(crate) fn scan(root: &Path, cfg: &Config) -> Arc<Index> {
    static BUILDING: crate::key_lock::KeyLocks = crate::key_lock::KeyLocks::new();
    let building = BUILDING.get(root);
    let _one = building.lock().unwrap_or_else(|e| e.into_inner());
    // read before the walk: a change while it runs makes the next request walk again
    let stamp = crate::vault_changes::stamp(root, cfg);
    refresh(&CACHE, root, Instant::now(), stamp, |prev, since| {
        // the watcher named every path changed since the last look: only those are looked at (no walk of the vault)
        if let (Some(i), Some(was)) = (&prev, since) {
            if let Some(paths) = crate::vault_changes::since(root, cfg, was).filter(|p| p.len() <= PATCH_MAX) {
                return (patch(root, cfg, i.clone(), &paths), false);
            }
        }
        (rebuild(root, cfg, prev), true)
    })
}

/// `root`'s entry of the warm list brought up to date by `build` — or kept without a walk when its watcher saw no change
/// since (the same `stamp`, within [`TRUST`]) — and moved to the front; vaults idle for [`IDLE`] or beyond the first
/// [`WARM_VAULTS`] are dropped (their memory with them). The list is locked only to look and to store, not for `build`.
/// `build` gets the index there was and, while patches may stand in for a walk ([`FULL_EVERY`]), the stamp it was
/// made at; it answers the new index and whether it walked the whole vault.
fn refresh(
    cache: &Mutex<Vec<Warm>>,
    root: &Path,
    now: Instant,
    stamp: Option<Stamp>,
    build: impl FnOnce(Option<Arc<Index>>, Option<Stamp>) -> (Arc<Index>, bool),
) -> Arc<Index> {
    let lock = || cache.lock().unwrap_or_else(|e| e.into_inner());
    let unchanged = |w: &Warm| {
        stamp.is_some() && w.walked.is_some_and(|(s, at)| Some(s) == stamp && now.saturating_duration_since(at) < TRUST)
    };
    let (prev, since, full) = {
        let mut warm = lock();
        match warm.iter().position(|w| w.root == root) {
            Some(i) if unchanged(&warm[i]) => {
                let w = warm.remove(i);
                return keep(&mut warm, root, now, w.index, w.walked, w.full);
            }
            Some(i) => {
                let w = &warm[i];
                let recent = now.saturating_duration_since(w.full) < FULL_EVERY;
                (Some(w.index.clone()), w.walked.map(|(s, _)| s).filter(|_| recent && stamp.is_some()), w.full)
            }
            None => (None, None, now),
        }
    };
    let (index, walked_all) = build(prev, since);
    keep(&mut lock(), root, now, index, stamp.map(|s| (s, now)), if walked_all { now } else { full })
}

/// `index` stored as `root`'s, at the front of the warm list. Idle vaults go, then the least recently used beyond
/// [`WARM_VAULTS`] — never a kept one ([`keep_warm`]).
fn keep(warm: &mut Vec<Warm>, root: &Path, now: Instant, index: Arc<Index>, walked: Option<(Stamp, Instant)>, full: Instant) -> Arc<Index> {
    let kept = KEPT.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let is_kept = |w: &Warm| kept.contains(&w.root);
    warm.retain(|w| w.root != root && (is_kept(w) || now.saturating_duration_since(w.used) < IDLE));
    warm.insert(0, Warm { root: root.to_path_buf(), used: now, index: index.clone(), walked, full });
    while warm.len() > WARM_VAULTS {
        let Some(i) = warm.iter().rposition(|w| !is_kept(w)) else { break };
        warm.remove(i);
    }
    index
}

/// `root`'s index (canonical, as `Workspace::root`) is never dropped for being idle or for other vaults being used:
/// the desktop's window comes back to its own vault after any time away, and would otherwise find the index of
/// thousands of notes to build again (0.2–0.5 s, docs/decisions/PERFORMANCE.md "Two vaults open").
pub(crate) fn keep_warm(root: &Path) {
    let mut kept = KEPT.lock().unwrap_or_else(|e| e.into_inner());
    if !kept.iter().any(|k| k == root) {
        kept.push(root.to_path_buf());
    }
}

/// Builds `root`'s index (and its links resolved) on a thread of its own at the lowest CPU priority, so the first
/// look at a vault started ahead of use (its graph, backlinks, Bases, tags) finds it built. One that is being built is
/// not built twice ([`scan`]'s lock); a request arriving meanwhile waits for this build instead of starting its own.
pub(crate) fn warm_in_background(root: &Path, cfg: &Config) {
    let (dir, cfg) = (root.to_path_buf(), cfg.clone());
    let spawned = std::thread::Builder::new().name("atlas-index-warm".into()).spawn(move || {
        lowest_priority();
        let t = Instant::now();
        let index = scan(&dir, &cfg);
        let _ = index.resolved();
        eprintln!("atlas: note index of {} built ahead — {} notes in {:.2}s", dir.display(), index.parsed.len(), t.elapsed().as_secs_f32());
    });
    if let Err(e) = spawned {
        eprintln!("atlas: note index of {} not built ahead: {e}", root.display());
    }
}

/// This thread at nice 19 (Linux and Android set the niceness per thread): background work never takes the CPU from
/// a window's requests or the owner's other programs.
pub(crate) fn lowest_priority() {
    #[cfg(any(target_os = "linux", target_os = "android"))]
    // SAFETY: gettid and setpriority take no pointers; a failure only leaves the thread at its priority
    unsafe {
        let tid = libc::syscall(libc::SYS_gettid) as libc::id_t;
        libc::setpriority(libc::PRIO_PROCESS, tid, 19);
    }
}

/// `prev`'s index brought up to date: unchanged notes keep their `Arc<Parsed>`, an unchanged file list keeps its
/// [`Names`], and an index with nothing changed is returned as is.
fn rebuild(root: &Path, cfg: &Config, prev: Option<Arc<Index>>) -> Arc<Index> {
    // no index in memory yet (a start): the parses kept on disk stand in for it (links_disk.rs)
    let kept = if prev.is_none() { disk::load(root) } else { FileCache::new() };
    let earlier = |rel: &str| prev.as_ref().map_or(kept.get(rel), |i| i.parsed.get(rel));
    let mut files = Vec::new();
    let mut parsed: FileCache = HashMap::new();
    let (mut reused, mut read) = (0, 0);
    for (abs, rel) in walk::files(root, cfg) {
        if rel.to_lowercase().ends_with(".md") && !cfg.index_excluded(&rel) {
            if let Ok(meta) = abs.metadata() {
                let mtime = meta.modified().ok();
                let p = match earlier(&rel) {
                    Some(p) if p.mtime == mtime && p.size == meta.len() => {
                        reused += 1;
                        p.clone()
                    }
                    _ => {
                        read += 1;
                        Arc::new(parse_note(&abs, &meta))
                    }
                };
                parsed.insert(rel.clone(), p);
            }
        }
        files.push(rel);
    }
    let same_files = prev.as_ref().is_some_and(|i| i.names.files == files);
    let gone = prev.as_ref().map_or(kept.len(), |i| i.parsed.len()) != reused;
    let index = match prev {
        Some(i) if same_files && read == 0 && !gone => return i,
        Some(i) if same_files => Arc::new(Index::new(i.names.clone(), shrunk(parsed))),
        _ => Arc::new(Index::new(Arc::new(Names::new(files)), shrunk(parsed))),
    };
    // what changed is kept for the next start (a start that read nothing new writes nothing)
    if read > 0 || gone {
        disk::save_in_background(root, index.clone());
    }
    index
}

/// `prev` with only `paths` looked at again (what the watcher named since it was made): each path — a file, or a
/// folder created, moved or removed with everything under it — is taken out, then what the walk would list at it now
/// (`walk::files_under`) goes back in, its notes read again; every other note keeps its parse, unread and unstatted.
/// New files go at the end of the walk order. The same `Arc` comes back when nothing the index holds changed.
fn patch(root: &Path, cfg: &Config, prev: Arc<Index>, paths: &[String]) -> Arc<Index> {
    let under = |f: &str, p: &str| f == p || f.strip_prefix(p).is_some_and(|r| r.starts_with('/'));
    let touched = |f: &str| paths.iter().any(|p| under(f, p));
    // what the walk would list at the changed paths now
    let mut now: Vec<(PathBuf, String)> = Vec::new();
    let mut listed = std::collections::HashSet::new();
    for p in paths {
        for (abs, rel) in walk::files_under(root, &root.join(p), cfg) {
            if listed.insert(rel.clone()) {
                now.push((abs, rel));
            }
        }
    }
    // a file still there keeps its place in the walk order; one gone leaves it; a new one goes at the end
    let had: std::collections::HashSet<&str> = prev.names.files.iter().map(String::as_str).collect();
    let mut files: Vec<String> = prev.names.files.iter().filter(|f| !touched(f) || listed.contains(f.as_str())).cloned().collect();
    files.extend(now.iter().filter(|(_, r)| !had.contains(r.as_str())).map(|(_, r)| r.clone()));
    let mut parsed: FileCache = prev.parsed.iter().filter(|(f, _)| !touched(f)).map(|(f, p)| (f.clone(), p.clone())).collect();
    let mut read = 0;
    for (abs, rel) in &now {
        if !rel.to_lowercase().ends_with(".md") || cfg.index_excluded(rel) {
            continue;
        }
        let Ok(meta) = abs.metadata() else { continue };
        let p = match prev.parsed.get(rel) {
            Some(p) if p.mtime == meta.modified().ok() && p.size == meta.len() => p.clone(),
            _ => {
                read += 1;
                Arc::new(parse_note(abs, &meta))
            }
        };
        parsed.insert(rel.clone(), p);
    }
    let same_files = files == prev.names.files;
    if same_files && read == 0 && parsed.len() == prev.parsed.len() {
        return prev;
    }
    let names = if same_files { prev.names.clone() } else { Arc::new(Names::new(files)) };
    let index = Arc::new(Index::new(names, shrunk(parsed)));
    disk::save_in_background(root, index.clone());
    index
}

fn shrunk(mut m: FileCache) -> FileCache {
    m.shrink_to_fit();
    m
}

/// One note read and parsed (empty above [`MAX_BYTES`] or when it is not UTF-8).
fn parse_note(abs: &Path, meta: &std::fs::Metadata) -> Parsed {
    let text = if meta.len() > MAX_BYTES { String::new() } else { std::fs::read_to_string(abs).unwrap_or_default() };
    let props = frontmatter(&text);
    let mut links = parse(&text);
    links.shrink_to_fit();
    Parsed {
        links,
        tags: crate::tags::of_note(&text, &props),
        words: match meta.len() > TEXT_BYTES {
            true => Default::default(),
            false => crate::word_bloom::Words::of(&text.to_lowercase()),
        },
        props: props.into(),
        size: meta.len(),
        mtime: meta.modified().ok(),
        ctime: meta.created().ok(),
    }
}

/// Every file, every note's parse, and the resolver — for a reader outside this module (link_targets.rs, relink.rs).
pub(crate) type Snapshot = Arc<Index>;

/// What [`Index::link_stats`] counts.
#[derive(Default)]
pub(crate) struct LinkStats {
    pub near: std::collections::HashSet<String>,
    /// distinct notes linking to a file (self-links left out)
    pub incoming: HashMap<String, u32>,
}

pub(crate) fn snapshot(root: &Path, cfg: &Config) -> Snapshot {
    scan(root, cfg)
}

impl Index {
    pub(crate) fn new(names: Arc<Names>, parsed: FileCache) -> Self {
        Index { names, parsed, resolved: std::sync::OnceLock::new(), incoming: std::sync::OnceLock::new() }
    }

    /// Every note's links resolved (once per index).
    fn resolved(&self) -> &Resolved {
        self.resolved.get_or_init(|| {
            self.parsed
                .iter()
                .map(|(src, p)| (src.clone(), p.links.iter().map(|l| self.names.resolve(l, src).and_then(|t| self.names.id_of(&t))).collect()))
                .collect()
        })
    }

    /// `src`'s links with the file each resolves to.
    fn links_of<'a>(&'a self, src: &'a str) -> impl Iterator<Item = (&'a RawLink, Option<&'a str>)> + 'a {
        let ids = self.resolved().get(src);
        self.parsed.get(src).into_iter().flat_map(move |p| {
            p.links.iter().enumerate().map(move |(i, l)| (l, ids.and_then(|t| t.get(i).copied().flatten()).map(|id| self.names.path(id))))
        })
    }

    /// Every file (ignore rules applied), in walk order.
    pub fn files(&self) -> &[String] {
        self.names.files()
    }

    /// In one pass over every link: the files `from` links to plus the notes linking to it (`near`), and how
    /// many notes link to each file (`incoming`).
    pub fn link_stats(&self, from: Option<&str>) -> LinkStats {
        let mut stats = LinkStats::default();
        for src in self.parsed.keys() {
            let mut seen = std::collections::HashSet::new();
            for t in self.links_of(src).filter_map(|(_, t)| t) {
                if Some(src.as_str()) == from {
                    stats.near.insert(t.to_string());
                } else if Some(t) == from {
                    stats.near.insert(src.clone());
                }
                if t != src.as_str() && seen.insert(t) {
                    match stats.incoming.get_mut(t) {
                        Some(n) => *n += 1,
                        None => {
                            stats.incoming.insert(t.to_string(), 1);
                        }
                    }
                }
            }
        }
        stats
    }

    /// How many distinct notes link to each file ([`LinkStats::incoming`]), kept for the index's life.
    pub fn incoming(&self) -> &HashMap<String, u32> {
        self.incoming.get_or_init(|| self.link_stats(None).incoming)
    }

    /// The files each note's links resolve to (unresolved links left out).
    pub fn targets<'a>(&'a self, src: &'a str) -> impl Iterator<Item = String> + 'a {
        self.links_of(src).filter_map(|(_, t)| t.map(str::to_string))
    }

    /// How many files share this file name (any case) — more than one: a link needs the path.
    pub fn same_name(&self, file_name: &str) -> usize {
        self.names.by_name.get(file_name.to_lowercase().as_str()).map_or(0, Vec::len)
    }
}

/// The properties other notes name a note not yet made through (`topics: "[[Optics]]"` → `topics`): its unresolved
/// links whose name is `stem`, any case, sorted and once each. What a new note's template rule `linked_by` reads.
pub fn relations_to_missing(root: &Path, cfg: &Config, stem: &str) -> Vec<String> {
    let index = scan(root, cfg);
    let want = stem.trim().to_lowercase();
    let mut out: Vec<String> = index
        .parsed
        .keys()
        .flat_map(|src| index.links_of(src).filter(|(l, t)| t.is_none() && l.wiki).filter_map(|(l, _)| l.relation.clone().filter(|_| link_stem(&l.target) == want)))
        .collect();
    out.sort();
    out.dedup();
    out
}

/// The note that claims `path` as its thing by property `key` (`file: "[[Dune.epub]]"`: a catalog note of a thing
/// whose file is in the vault — docs/design/DESIGN-server-libraries.md §3.5), the first by path. A folder (a manga
/// series) is no link target, so its claim is matched by the link's written path.
pub(crate) fn claimed_by(root: &Path, cfg: &Config, path: &str, key: &str) -> Option<String> {
    let index = scan(root, cfg);
    let want = path.trim_matches('/');
    let mut srcs: Vec<&String> = index.parsed.keys().filter(|s| s.as_str() != want).collect();
    srcs.sort();
    srcs.into_iter()
        .find(|src| {
            index.links_of(src).any(|(l, t)| {
                l.relation.as_deref() == Some(key)
                    && (t == Some(want) || (t.is_none() && decode(l.target.split(['#', '|']).next().unwrap_or("")).trim().trim_matches('/') == want))
            })
        })
        .cloned()
}

/// A wikilink's note name, lower case: no `#section`, `|label`, folder or `.md`.
fn link_stem(target: &str) -> String {
    let t = target.split(['#', '|']).next().unwrap_or("").trim();
    let t = t.rsplit('/').next().unwrap_or(t);
    t.strip_suffix(".md").unwrap_or(t).to_lowercase()
}

/// Notes that link to (or embed) `path`, sorted by source then line.
pub fn backlinks(root: &Path, cfg: &Config, path: &str) -> Backlinks {
    let index = scan(root, cfg);
    let mut links: Vec<Backlink> = index
        .parsed
        .keys()
        .filter(|src| src.as_str() != path)
        .flat_map(|src| {
            index.links_of(src).filter(move |(_, t)| *t == Some(path)).map(move |(l, _)| Backlink {
                source: src.clone(),
                line: l.line,
                context: l.context.clone(),
                embed: l.embed,
                relation: l.relation.clone(),
            })
        })
        .collect();
    links.sort_by(|a, b| a.source.cmp(&b.source).then(a.line.cmp(&b.line)));
    let unlinked = unlinked(root, &index, path);
    Backlinks { path: path.to_string(), links, unlinked }
}

/// Lines in other notes that NAME `path` (its file name, whole words, any case) without linking to
/// it — Obsidian's "unlinked mentions". Code, frontmatter and lines already linking here are skipped.
fn unlinked(root: &Path, index: &Index, path: &str) -> Vec<Backlink> {
    const MAX: usize = 200;
    let parsed = &index.parsed;
    let name = path.rsplit('/').next().unwrap_or(path).trim_end_matches(".md");
    if name.chars().count() < 3 {
        return Vec::new(); // "QM", "A": everywhere, meaningless
    }
    let needle = name.to_lowercase();
    let mut out = Vec::new();
    let mut srcs: Vec<&String> = parsed.keys().filter(|s| s.as_str() != path).collect();
    srcs.sort();
    for src in srcs {
        let p = &parsed[src];
        // the text is read here, not kept in the index; a note whose words cannot name the file is not read
        if p.size > TEXT_BYTES || !p.words.may_hold_all(&needle) {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(root.join(src)) else { continue };
        let linking: std::collections::HashSet<u32> = index.links_of(src).filter(|(_, t)| *t == Some(path)).map(|(l, _)| l.line).collect();
        // the lines the index reads links from (fenced code and the frontmatter left out)
        link_lines(&text, |n, _, line, kind| {
            if out.len() < MAX && matches!(kind, LineKind::Text) && !linking.contains(&n) && mentions(&line.to_lowercase(), &needle) {
                out.push(Backlink { source: src.clone(), line: n, context: context(line), embed: false, relation: None });
            }
        });
        if out.len() >= MAX {
            break;
        }
    }
    out
}

/// `needle` occurs as whole words (not inside a longer word, not inside `[[…]]`).
fn mentions(hay: &str, needle: &str) -> bool {
    let word = |c: Option<char>| c.is_some_and(|c| c.is_alphanumeric() || c == '_');
    let mut from = 0;
    while let Some(i) = hay[from..].find(needle).map(|i| i + from) {
        let before = hay[..i].chars().next_back();
        let after = hay[i + needle.len()..].chars().next();
        let in_link = hay[..i].rfind("[[").is_some_and(|o| hay[..i].rfind("]]").is_none_or(|c| c < o));
        if !word(before) && !word(after) && !in_link {
            return true;
        }
        from = i + needle.len().max(1);
    }
    false
}

/// Turns the first unlinked mention of `target`'s name on `line` of `source` into `[[name]]`
/// (keeping the written form as an alias when its case differs). Returns the new text.
pub fn link_mention(text: &str, line: u32, target: &str) -> Option<String> {
    let name = target.rsplit('/').next().unwrap_or(target).trim_end_matches(".md");
    let mut lines: Vec<String> = text.split('\n').map(String::from).collect();
    let l = lines.get_mut(line.checked_sub(1)? as usize)?;
    // matched on the line as written: offsets found in a lowercased copy are off wherever a letter's lowercase has
    // another length in UTF-8 (`İ`, the Kelvin and Ohm signs), and cut the line in the wrong place
    let any_case = regex::RegexBuilder::new(&regex::escape(name)).case_insensitive(true).build().ok()?;
    let word = |c: Option<char>| c.is_some_and(|c| c.is_alphanumeric() || c == '_');
    let written: &str = l;
    let at = any_case
        .find_iter(written)
        .find(|m| {
            let (head, tail) = (&written[..m.start()], &written[m.end()..]);
            let in_link = head.rfind("[[").is_some_and(|o| head.rfind("]]").is_none_or(|c| c < o));
            !word(head.chars().next_back()) && !word(tail.chars().next()) && !in_link
        })?
        .range();
    let written = written[at.clone()].to_string();
    let link = if written == name { format!("[[{name}]]") } else { format!("[[{name}|{written}]]") };
    l.replace_range(at, &link);
    Some(lines.join("\n"))
}

/// Every note with its parsed data and resolved outgoing links (unique, in order), plus who
/// links to each path — the vault view Bases evaluates over.
pub(crate) struct Vault {
    pub notes: Vec<(String, Arc<Parsed>, Vec<String>)>,
    pub incoming: HashMap<String, Vec<String>>,
    names: Arc<Names>,
}

impl Vault {
    /// Any file a `[[link]]` written in `from` points at (a picture as well as a note).
    pub fn resolve(&self, target: &str, from: &str) -> Option<String> {
        self.names.resolve_target(target, true, from)
    }
}

pub(crate) fn vault(root: &Path, cfg: &Config) -> Vault {
    let index = scan(root, cfg);
    let mut incoming: HashMap<String, Vec<String>> = HashMap::new();
    let mut notes: Vec<(String, Arc<Parsed>, Vec<String>)> = index
        .parsed
        .iter()
        .map(|(src, p)| {
            let mut out: Vec<String> = Vec::new();
            for t in index.links_of(src).filter_map(|(_, t)| t) {
                if !out.iter().any(|o| o == t) {
                    incoming.entry(t.to_string()).or_default().push(src.clone());
                    out.push(t.to_string());
                }
            }
            (src.clone(), p.clone(), out)
        })
        .collect();
    notes.sort_by(|a, b| a.0.cmp(&b.0));
    Vault { notes, incoming, names: index.names.clone() }
}

/// The notes and the links between them (markdown only; each pair once, self-links dropped).
pub fn graph(root: &Path, cfg: &Config) -> crate::api::Graph {
    let v = vault(root, cfg);
    let index: HashMap<&str, u32> = v.notes.iter().enumerate().map(|(i, (p, ..))| (p.as_str(), i as u32)).collect();
    let mut edges: Vec<[u32; 2]> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for (i, (_, _, out)) in v.notes.iter().enumerate() {
        for t in out {
            if let Some(&j) = index.get(t.as_str()) {
                let (a, b) = ((i as u32).min(j), (i as u32).max(j));
                if a != b && seen.insert((a, b)) {
                    edges.push([a, b]);
                }
            }
        }
    }
    let nodes = v.notes.iter().map(|(p, ..)| crate::api::GraphNode { path: p.clone() }).collect();
    crate::api::Graph { nodes, edges }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn targets(s: &str) -> Vec<(String, bool, bool)> {
        parse(s).into_iter().map(|l| (l.target, l.wiki, l.embed)).collect()
    }

    /// The parses kept on disk read back as they were made, and a start takes them for every note unchanged since —
    /// a changed note is read again.
    #[test]
    fn a_start_takes_the_parses_kept_on_disk_for_unchanged_notes() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        let cfg = Config::default();
        std::fs::write(r.join("a.md"), "---\ntitle: Alpha\nup: \"[[b]]\"\nn: 3\n---\nSee [[b#Sec|it]] and ![[fig.png]] #tag/x\n").unwrap();
        std::fs::write(r.join("b.md"), "# B\nback to [[a]]\n").unwrap();
        let first = rebuild(r, &cfg, None);
        disk::settle(); // the build's own save (any test's, at the lowest priority) is done before ours
        disk::save(r, &first.parsed).unwrap();
        let mut kept = disk::load(r);
        assert_eq!(kept.len(), 2);
        for (rel, p) in &first.parsed {
            let k = &kept[rel];
            assert_eq!((&k.links, &k.props, &k.tags, k.size, k.mtime, k.ctime), (&p.links, &p.props, &p.tags, p.size, p.mtime, p.ctime), "{rel}");
            assert_eq!(k.words.bits(), p.words.bits());
        }
        // marked so a reuse shows: the kept parse of a.md carries a tag the file does not have
        let mut marked = (*kept["a.md"]).clone();
        marked.tags.push("from-disk".into());
        kept.insert("a.md".into(), Arc::new(marked));
        disk::settle();
        disk::save(r, &kept).unwrap();
        std::thread::sleep(Duration::from_millis(20));
        std::fs::write(r.join("b.md"), "# B\nback to [[a]] and [[c]]\n").unwrap();
        let started = rebuild(r, &cfg, None);
        assert!(started.parsed["a.md"].tags.contains(&"from-disk".to_string()), "unchanged: taken from disk, not read");
        assert_eq!(started.parsed["b.md"].links.len(), 2, "changed: read again");
        // a damaged file is ignored
        std::fs::write(r.join(disk::FILE), b"ATNI\x01").unwrap();
        assert!(disk::load(r).is_empty());
    }

    /// On a real vault (read-only: nothing is written to it): every note read and parsed, against the same parses
    /// encoded and loaded back. `ATLAS_TEST_VAULT=… cargo test … -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn kept_parses_measured_on_a_real_vault() {
        let Ok(root) = std::env::var("ATLAS_TEST_VAULT") else { return eprintln!("skipped: ATLAS_TEST_VAULT is unset") };
        let root = Path::new(&root);
        let cfg = Config::load(root).unwrap();
        let t = Instant::now();
        let files: Vec<_> = walk::files(root, &cfg).collect();
        let walked = t.elapsed();
        let mut parsed = FileCache::new();
        for (abs, rel) in files.iter().filter(|(_, rel)| rel.to_lowercase().ends_with(".md") && !cfg.index_excluded(rel)) {
            if let Ok(meta) = abs.metadata() {
                parsed.insert(rel.clone(), Arc::new(parse_note(abs, &meta)));
            }
        }
        let read = t.elapsed() - walked;
        let t = Instant::now();
        let bytes = disk::encode(&parsed);
        let enc = t.elapsed();
        let t = Instant::now();
        let back = disk::decode(&bytes).unwrap();
        eprintln!("NOTES {} files walked in {walked:.0?}; {} notes read and parsed in {read:.0?}; kept: {} KB, written in {enc:.0?}, loaded in {:.0?}",
            files.len(), parsed.len(), bytes.len() >> 10, t.elapsed());
        assert_eq!(back.len(), parsed.len());
    }

    #[test]
    fn parses_wiki_md_and_embeds_but_not_code_or_urls() {
        let t = "See [[Green function|G]] and ![[fig.png]], [paper](../refs/a.md \"t\").\n\
                 `[[not a link]]` [web](https://x.org) [anchor](#h)\n```\n[[in fence]]\n```\n[[after#Sec]]";
        assert_eq!(
            targets(t),
            vec![
                ("Green function".into(), true, false),
                ("fig.png".into(), true, true),
                ("../refs/a.md".into(), false, false),
                ("after#Sec".into(), true, false),
            ]
        );
        assert_eq!(parse(t)[3].line, 6);
        let flow = parse("---\ntopics: [\"[[A]]\", \"[[B]]\"]\n---\n[x] [[C]]\n");
        assert_eq!(
            flow.iter().map(|l| l.target.as_str()).collect::<Vec<_>>(),
            vec!["A", "B", "C"],
            "flow lists and [x] keep their links"
        );
        let table = parse("| [[Hubbard model\\|Hubbard]] | [[Mott]] |\n");
        assert_eq!(table.iter().map(|l| l.target.as_str()).collect::<Vec<_>>(), vec!["Hubbard model", "Mott"], "a table's escaped alias bar");
        let open = parse("[[unclosed and [x](y.md), [[z](w.md)\n");
        assert_eq!(open.iter().map(|l| l.target.as_str()).collect::<Vec<_>>(), vec!["y.md", "w.md"], "an unclosed [[ hides no markdown link");
        let stray = parse("see [[ and [[Note]], [[a[[b]]\n");
        assert_eq!(stray.iter().map(|l| l.target.as_str()).collect::<Vec<_>>(), vec!["Note", "b"], "a stray [[ before a link, as the editor reads it");
        let ticks = parse("use ` then [[A]]\n``x` [[B]]`` [[C]] `[[D]]`\n");
        assert_eq!(ticks.iter().map(|l| l.target.as_str()).collect::<Vec<_>>(), vec!["A", "C"], "a lone backtick is text; code spans close on their own length");
        let fm = parse("---\ntype: x\ntopics:\n  - '[[Condensed Matter]]'\n---\nsee [[B]]\n");
        assert_eq!(
            fm.iter().map(|l| l.context.as_str()).collect::<Vec<_>>(),
            vec!["topics: Condensed Matter", "see [[B]]"]
        );
    }

    #[test]
    fn unlinked_mentions_and_linking_them() {
        assert!(mentions("the hubbard model", "hubbard"));
        assert!(!mentions("hubbardish", "hubbard") && !mentions("see [[hubbard]]", "hubbard"));
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("Hubbard model.md"), "# H\n").unwrap();
        std::fs::write(d.path().join("a.md"), "---\ntitle: Hubbard model\n---\nThe hubbard model, again.\nLinked: [[Hubbard model]] and hubbard model.\n```\nhubbard model\n```\n").unwrap();
        let bl = backlinks(d.path(), &Config::default(), "Hubbard model.md");
        assert_eq!(bl.links.len(), 1);
        assert_eq!(
            bl.unlinked.iter().map(|l| l.line).collect::<Vec<_>>(),
            vec![4],
            "frontmatter, linked lines and code are skipped"
        );
        let text = std::fs::read_to_string(d.path().join("a.md")).unwrap();
        let out = link_mention(&text, 4, "Hubbard model.md").unwrap();
        assert!(out.contains("The [[Hubbard model|hubbard model]], again."), "{out}");
        assert_eq!(
            link_mention(&text, 2, "Hubbard model.md"),
            Some(text.replacen("title: Hubbard model", "title: [[Hubbard model]]", 1))
        );
        assert_eq!(link_mention("nothing here", 1, "Hubbard model.md"), None);
        // CRLF frontmatter is skipped too; a `---` never closed is a rule, and the lines after it are text
        std::fs::write(d.path().join("b.md"), "---\r\ntitle: Hubbard model\r\n---\r\nThe hubbard model.\r\n").unwrap();
        std::fs::write(d.path().join("c.md"), "---\nThe hubbard model, under a rule.\n").unwrap();
        let mut got: Vec<(String, u32)> = backlinks(d.path(), &Config::default(), "Hubbard model.md").unlinked.into_iter().map(|l| (l.source, l.line)).collect();
        got.sort();
        assert_eq!(got, [("a.md".to_string(), 4), ("b.md".to_string(), 4), ("c.md".to_string(), 2)]);
        // a `~~~` inside a ``` block does not close it
        std::fs::write(d.path().join("f.md"), "```\n~~~\nhubbard model\n```\n").unwrap();
        assert!(backlinks(d.path(), &Config::default(), "Hubbard model.md").unlinked.iter().all(|l| l.source != "f.md"));
        // `Ω` (the Ohm sign, 3 bytes) lowercases to `ω` (2 bytes): the cut is made in the line as written
        assert_eq!(link_mention("1 \u{2126}, then the Hubbard model.", 1, "Hubbard model.md").as_deref(), Some("1 \u{2126}, then the [[Hubbard model]]."));
        // the word filter cuts names the way the line check reads them: `İ` lowercases to `i` and a combining dot
        std::fs::write(d.path().join("\u{130}zmir trip.md"), "").unwrap();
        std::fs::write(d.path().join("e.md"), "Plans for the \u{130}ZMIR TRIP.\n").unwrap();
        let bl = backlinks(d.path(), &Config::default(), "\u{130}zmir trip.md");
        assert_eq!(bl.unlinked.iter().map(|l| (l.source.as_str(), l.line)).collect::<Vec<_>>(), [("e.md", 1)]);
    }

    #[test]
    fn a_link_that_is_a_property_value_is_typed() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("Parent.md"), "# P\n").unwrap();
        std::fs::write(d.path().join("a.md"), "---\nup: \"[[Parent]]\"\n---\nPlain [[Parent]] here.\n").unwrap();
        std::fs::write(d.path().join("b.md"), "# B\nsource:: [[Parent]]\n- next:: [[Parent]]\nuse std::[[Parent]]\n").unwrap();
        let bl = backlinks(d.path(), &Config::default(), "Parent.md");
        let got: Vec<_> = bl.links.iter().map(|l| (l.source.as_str(), l.line, l.relation.as_deref())).collect();
        assert_eq!(
            got,
            vec![("a.md", 2, Some("up")), ("a.md", 4, None), ("b.md", 2, Some("source")), ("b.md", 3, Some("next")), ("b.md", 4, None)]
        );
    }

    #[test]
    fn graph_has_each_link_once() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("a.md"), "[[b]] and [[b]] and [[a]] and [[missing]]\n").unwrap();
        std::fs::write(d.path().join("b.md"), "back to [[a]]\n").unwrap();
        std::fs::write(d.path().join("c.md"), "alone\n").unwrap();
        let g = graph(d.path(), &Config::default());
        assert_eq!(g.nodes.iter().map(|n| n.path.as_str()).collect::<Vec<_>>(), vec!["a.md", "b.md", "c.md"]);
        assert_eq!(g.edges, vec![[0, 1]]);
    }

    #[test]
    fn reads_frontmatter() {
        let fm = frontmatter("---\ntype: Lecture\ntopics:\n  - \"[[Condensed Matter]]\"\n---\n# Body\n");
        assert_eq!(fm.get("type").and_then(|v| v.as_str()), Some("Lecture"));
        assert!(frontmatter("# no frontmatter\n").is_empty());
        assert!(frontmatter("---\n: : bad\n---\n").is_empty());
    }

    #[test]
    fn resolves_like_obsidian() {
        let files: Vec<String> =
            ["notes/a.md", "notes/lectures/b.md", "other/b.md", "notes/img/fig.png", "notes/x y.md", "people/Dr. Smith.md"]
                .map(String::from)
                .to_vec();
        let n = Names::new(files);
        let w = |t: &str| RawLink { target: t.into(), wiki: true, embed: false, line: 1, context: String::new(), relation: None };
        let m = |t: &str| RawLink { wiki: false, ..w(t) };
        assert_eq!(n.resolve(&w("a"), "notes/z.md").as_deref(), Some("notes/a.md"));
        assert_eq!(n.resolve(&w("B"), "other/q.md").as_deref(), Some("other/b.md"), "same folder wins");
        assert_eq!(n.resolve(&w("b"), "notes/z.md").as_deref(), Some("other/b.md"), "then shortest path");
        assert_eq!(n.resolve(&w("lectures/b"), "x.md").as_deref(), Some("notes/lectures/b.md"));
        assert_eq!(n.resolve(&w("fig.png"), "x.md").as_deref(), Some("notes/img/fig.png"));
        assert_eq!(n.resolve(&w("Dr. Smith"), "x.md").as_deref(), Some("people/Dr. Smith.md"), "a dot that is no extension");
        assert_eq!(n.resolve(&m("lectures/b.md"), "notes/a.md").as_deref(), Some("notes/lectures/b.md"));
        assert_eq!(n.resolve(&m("x%20y.md"), "notes/a.md").as_deref(), Some("notes/x y.md"));
        assert_eq!((decode("R%C3%A9union%20%281%29.md"), decode("a%23b"), decode("100%.md"), decode("%FF.md")), ("Réunion (1).md".into(), "a%23b".into(), "100%.md".into(), "%FF.md".into()), "as the page's decodeURI reads them");
        assert_eq!(decode("%+A.md"), "%+A.md", "two hex digits, no sign");
        assert_eq!(n.resolve(&m("b.md"), "notes/a.md"), None, "md links do not search by name");
        assert_eq!(n.resolve(&m("../../out.md"), "a.md"), None);
    }

    #[test]
    fn the_index_is_shared_until_a_note_changes() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("a.md"), "[[b]]\n").unwrap();
        std::fs::write(d.path().join("b.md"), "# B\n").unwrap();
        let cfg = Config::default();
        let first = rebuild(d.path(), &cfg, None);
        let same = rebuild(d.path(), &cfg, Some(first.clone()));
        assert!(Arc::ptr_eq(&first, &same), "nothing changed: the same index, no copy");
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(d.path().join("a.md"), "[[b]] again\n").unwrap();
        let next = rebuild(d.path(), &cfg, Some(same));
        assert!(!Arc::ptr_eq(&first, &next));
        assert!(Arc::ptr_eq(&first.names, &next.names), "same files: the resolver is kept");
        assert!(Arc::ptr_eq(&first.parsed["b.md"], &next.parsed["b.md"]), "an unchanged note is not read again");
        assert!(!Arc::ptr_eq(&first.parsed["a.md"], &next.parsed["a.md"]));
        std::fs::write(d.path().join("c.md"), "").unwrap();
        let more = rebuild(d.path(), &cfg, Some(next.clone()));
        assert!(!Arc::ptr_eq(&next.names, &more.names), "a new file: a new resolver");
        assert_eq!(more.names.resolve_target("c", true, "a.md").as_deref(), Some("c.md"));
    }

    #[test]
    fn a_patch_of_the_changed_paths_gives_the_index_a_walk_gives() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        let cfg = Config::default();
        std::fs::create_dir_all(r.join("notes")).unwrap();
        std::fs::write(r.join("notes/a.md"), "[[b]]").unwrap();
        std::fs::write(r.join("notes/b.md"), "# B").unwrap();
        std::fs::write(r.join("old.md"), "[[a]]").unwrap();
        let first = rebuild(r, &cfg, None);
        // a note written, a folder of notes arriving, a note removed
        std::thread::sleep(Duration::from_millis(20));
        std::fs::write(r.join("notes/a.md"), "[[b]] and [[c]]").unwrap();
        std::fs::create_dir_all(r.join("new/deep")).unwrap();
        std::fs::write(r.join("new/deep/c.md"), "#tag").unwrap();
        std::fs::write(r.join("new/pic.png"), "x").unwrap();
        std::fs::remove_file(r.join("old.md")).unwrap();
        let paths = ["notes/a.md", "new", "old.md"].map(String::from);
        let patched = patch(r, &cfg, first.clone(), &paths);
        let walked = rebuild(r, &cfg, None);
        let set = |i: &Index| { let mut f = i.names.files.clone(); f.sort(); f };
        assert_eq!(set(&patched), set(&walked), "the same files");
        let mut a: Vec<_> = patched.parsed.keys().cloned().collect();
        let mut b: Vec<_> = walked.parsed.keys().cloned().collect();
        a.sort();
        b.sort();
        assert_eq!(a, b, "the same notes");
        assert_eq!(patched.parsed["notes/a.md"].links.len(), 2, "the written note read again");
        assert!(Arc::ptr_eq(&patched.parsed["notes/b.md"], &first.parsed["notes/b.md"]), "an untouched note kept, unread");
        assert_eq!(patched.names.resolve_target("c", true, "notes/a.md").as_deref(), Some("new/deep/c.md"));
        // nothing the index holds changed: the same index
        let again = patch(r, &cfg, patched.clone(), &["notes/b.md".to_string()]);
        assert!(Arc::ptr_eq(&again, &patched));
    }

    #[test]
    fn several_vaults_stay_warm_until_idle_or_too_many() {
        let empty = || Arc::new(Index::new(Arc::new(Names::new(Vec::new())), HashMap::new()));
        let (warm, t0) = (Mutex::new(Vec::new()), Instant::now());
        let a = refresh(&warm, Path::new("/a"), t0, None, |_, _| (empty(), true));
        refresh(&warm, Path::new("/b"), t0, None, |_, _| (empty(), true));
        let again = refresh(&warm, Path::new("/a"), t0, None, |prev, _| (prev.expect("a is still warm"), true));
        assert!(Arc::ptr_eq(&a, &again), "switching vaults does not drop the other's index");
        for v in ["/c", "/d"] {
            refresh(&warm, Path::new(v), t0, None, |_, _| (empty(), true));
        }
        let roots = |w: &Mutex<Vec<Warm>>| w.lock().unwrap().iter().map(|w| w.root.to_string_lossy().into_owned()).collect::<Vec<_>>();
        assert_eq!(roots(&warm), ["/d", "/c", "/a"], "the least recently used goes first");
        refresh(&warm, Path::new("/d"), t0 + IDLE + Duration::from_secs(1), None, |prev, _| (prev.unwrap(), true));
        assert_eq!(roots(&warm), ["/d"], "idle vaults are dropped");
    }

    #[test]
    fn the_kept_vault_stays_warm_idle_or_not() {
        let empty = || Arc::new(Index::new(Arc::new(Names::new(Vec::new())), HashMap::new()));
        let (warm, t0) = (Mutex::new(Vec::new()), Instant::now());
        let own = Path::new("/kept-own-vault");
        keep_warm(own);
        let first = refresh(&warm, own, t0, None, |_, _| (empty(), true));
        for (i, v) in ["/kept-x", "/kept-y", "/kept-z"].iter().enumerate() {
            refresh(&warm, Path::new(v), t0 + IDLE * (i as u32 + 2), None, |_, _| (empty(), true));
        }
        let roots = |w: &Mutex<Vec<Warm>>| w.lock().unwrap().iter().map(|w| w.root.to_string_lossy().into_owned()).collect::<Vec<_>>();
        assert_eq!(roots(&warm), ["/kept-z", "/kept-own-vault"], "the others went idle; the kept one stays");
        for v in ["/kept-a", "/kept-b", "/kept-c"] {
            refresh(&warm, Path::new(v), t0 + IDLE * 5, None, |_, _| (empty(), true));
        }
        assert!(roots(&warm).contains(&own.to_string_lossy().into_owned()), "beyond WARM_VAULTS the kept one stays too");
        let again = refresh(&warm, own, t0 + IDLE * 5, None, |prev, _| (prev.expect("still warm"), true));
        assert!(Arc::ptr_eq(&first, &again));
    }

    #[test]
    fn an_index_warmed_in_the_background_is_the_one_a_request_finds() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("a.md"), "[[b]]\n").unwrap();
        std::fs::write(d.path().join("b.md"), "# B\n").unwrap();
        let cfg = Config::default();
        // kept: the other tests' vaults, built at the same time, would otherwise push it out of the few kept warm
        keep_warm(d.path());
        warm_in_background(d.path(), &cfg);
        let deadline = Instant::now() + Duration::from_secs(30);
        // stored once built, its links resolved just after
        let built = || CACHE.lock().unwrap().iter().find(|w| w.root == d.path() && w.index.resolved.get().is_some()).map(|w| w.index.clone());
        let warmed = loop {
            if let Some(i) = built() {
                break i;
            }
            assert!(Instant::now() < deadline, "the background build finished, its links resolved");
            std::thread::sleep(Duration::from_millis(10));
        };
        assert_eq!(warmed.parsed.len(), 2);
        assert!(Arc::ptr_eq(&warmed, &scan(d.path(), &cfg)), "a request finds that index, not one of its own");
    }

    #[test]
    fn a_vault_being_walked_does_not_hold_up_another() {
        let empty = || Arc::new(Index::new(Arc::new(Names::new(Vec::new())), HashMap::new()));
        let warm = Arc::new(Mutex::new(Vec::new()));
        let (started, wait) = std::sync::mpsc::channel();
        let (release, held) = std::sync::mpsc::channel::<()>();
        let slow = {
            let warm = warm.clone();
            std::thread::spawn(move || {
                refresh(&warm, Path::new("/slow"), Instant::now(), None, |_, _| {
                    started.send(()).unwrap();
                    held.recv().unwrap();
                    (empty(), true)
                });
            })
        };
        wait.recv().unwrap();
        refresh(&warm, Path::new("/quick"), Instant::now(), None, |_, _| (empty(), true));
        release.send(()).unwrap();
        slow.join().unwrap();
        assert_eq!(warm.lock().unwrap().len(), 2);
    }

    #[test]
    fn an_unchanged_watched_vault_is_not_walked_again() {
        let empty = || Arc::new(Index::new(Arc::new(Names::new(Vec::new())), HashMap::new()));
        let root = Path::new("/links-trust-test");
        let cfg = Config::default();
        let feed = crate::vault_changes::Feed::new(root, &cfg);
        feed.register();
        let (warm, t0) = (Mutex::new(Vec::new()), Instant::now());
        let stamp = || crate::vault_changes::stamp(root, &cfg);
        let first = refresh(&warm, root, t0, stamp(), |_, _| (empty(), true));
        let kept = refresh(&warm, root, t0, stamp(), |_, _| panic!("no change: no walk"));
        assert!(Arc::ptr_eq(&first, &kept));
        feed.changed();
        let mut asked = None;
        refresh(&warm, root, t0, stamp(), |prev, since| {
            asked = Some(since);
            (prev.unwrap(), false)
        });
        assert!(matches!(asked, Some(Some(_))), "a change: built again, given the stamp it was made at (a patch may do)");
        let mut walked = false;
        refresh(&warm, root, t0 + TRUST, stamp(), |prev, _| {
            walked = true;
            (prev.unwrap(), true)
        });
        assert!(walked, "trusted for a while only");
        let mut since_given = None;
        refresh(&warm, root, t0 + TRUST + FULL_EVERY, { feed.changed(); stamp() }, |prev, since| {
            since_given = Some(since);
            (prev.unwrap(), true)
        });
        assert_eq!(since_given, Some(None), "a whole walk is due again: no patch offered");
        let mut walked = false;
        refresh(&warm, root, t0 + TRUST, None, |prev, since| {
            assert!(since.is_none(), "no watcher: no patch");
            walked = true;
            (prev.unwrap(), true)
        });
        assert!(walked, "no watcher: always walked");
    }

    /// With a real watcher: an outside edit is seen once its event arrives, Atlas's own write at once.
    #[test]
    fn a_watched_vault_follows_outside_edits_and_its_own_writes() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().canonicalize().unwrap();
        std::fs::create_dir_all(root.join("notes")).unwrap();
        std::fs::write(root.join("notes/target.md"), "# T\n").unwrap();
        std::fs::write(root.join("a.md"), "nothing\n").unwrap();
        let cfg = Config::default();
        let _w = crate::events::spawn_watcher(&root, cfg.clone(), crate::events::EventBus::default()).unwrap();
        let count = || backlinks(&root, &cfg, "notes/target.md").links.len();
        assert_eq!(count(), 0);
        crate::vault_write::write(&root.join("a.md"), b"see [[target]]\n").unwrap();
        assert_eq!(count(), 1, "Atlas's own write: seen by the very next request");
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::create_dir_all(root.join("new")).unwrap();
        std::fs::write(root.join("new/b.md"), "[[target]] too\n").unwrap();
        let until = Instant::now() + Duration::from_secs(5);
        while count() != 2 && Instant::now() < until {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert_eq!(count(), 2, "an outside edit in a new folder, once the watcher saw it");
    }

    #[test]
    fn backlinks_follow_edits() {
        let d = tempfile::tempdir().unwrap();
        let w = |p: &str, s: &str| {
            let p = d.path().join(p);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, s).unwrap();
        };
        w("notes/target.md", "# T\n");
        w("notes/a.md", "intro\nsee [[target]] here\n");
        w("b.md", "![[target]] and [t](notes/target.md)\n");
        let cfg = Config::default();
        let bl = backlinks(d.path(), &cfg, "notes/target.md");
        let got: Vec<_> = bl.links.iter().map(|l| (l.source.as_str(), l.line, l.embed)).collect();
        assert_eq!(got, vec![("b.md", 1, true), ("b.md", 1, false), ("notes/a.md", 2, false)]);
        assert_eq!(bl.links[2].context, "see [[target]] here");
        let mut quiet = cfg.clone();
        quiet.editor.index_exclude = vec!["b.md".into()];
        assert_eq!(backlinks(d.path(), &quiet, "notes/target.md").links.len(), 1);
        // an edit is picked up (mtime changes; sleep past coarse filesystem timestamps)
        std::thread::sleep(std::time::Duration::from_millis(20));
        w("notes/a.md", "no link any more\n");
        assert_eq!(backlinks(d.path(), &cfg, "notes/target.md").links.len(), 2);
    }
}

