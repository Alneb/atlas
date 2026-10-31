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
}

/// For each note, the file each of its links points at (`None`: unresolved), in [`Parsed::links`] order.
type Resolved = HashMap<String, Box<[Option<FileId>]>>;

/// The vaults' indexes, the most recently used first. The desktop's one core serves several vaults, so one slot would
/// rebuild from scratch on every switch; a vault unused for [`IDLE`] (or beyond [`WARM_VAULTS`]) is dropped.
struct Warm {
    root: PathBuf,
    used: Instant,
    index: Arc<Index>,
    /// The vault's generation read before the index's walk, and when (None: no watcher vouches for this vault).
    walked: Option<(Stamp, Instant)>,
}
static CACHE: Mutex<Vec<Warm>> = Mutex::new(Vec::new());
const WARM_VAULTS: usize = 3;
const IDLE: Duration = Duration::from_secs(30 * 60);
/// How long an unchanged generation is taken at its word before walking anyway (a blind spot the watcher cannot see,
/// e.g. a folder moved in during its 250 ms batch, lasts at most this long).
const TRUST: Duration = Duration::from_secs(30);

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

/// Each line of a markdown text that may hold links, with its 1-based number and its byte offset in `text`; fenced
/// code is skipped. The one walk over a note both the index ([`parse`]) and the link rewrite on a move use.
pub(crate) fn link_lines<'a>(text: &'a str, mut f: impl FnMut(u32, usize, &'a str, LineKind<'_>)) {
    let mut fence: Option<&str> = None;
    let mut in_fm = text.starts_with("---\n") || text.starts_with("---\r\n");
    let mut key = String::new();
    let mut at = 0;
    for (i, raw) in text.split_inclusive('\n').enumerate() {
        let offset = at;
        at += raw.len();
        let line = raw.strip_suffix('\n').map_or(raw, |l| l.strip_suffix('\r').unwrap_or(l));
        if in_fm {
            if i > 0 && line.trim_end() == "---" {
                in_fm = false;
            } else if i > 0 {
                if let Some((k, _)) = line.split_once(':').filter(|(k, _)| !k.starts_with([' ', '-', '\t'])) {
                    key = k.trim().to_string();
                }
                f(i as u32 + 1, offset, line, LineKind::Front(&key));
            }
            continue;
        }
        let t = line.trim_start();
        if let Some(fc) = fence {
            if t.starts_with(fc) {
                fence = None;
            }
            continue;
        }
        if t.starts_with("```") || t.starts_with("~~~") {
            fence = Some(&t[..3]);
            continue;
        }
        f(i as u32 + 1, offset, line, LineKind::Text);
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
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'`' => {
                // inline code: skip to the matching run of backticks
                let run = b[i..].iter().take_while(|&&c| c == b'`').count();
                let tick = "`".repeat(run);
                i = line[i + run..].find(&tick).map_or(b.len(), |j| i + run + j + run);
            }
            b'[' if b.get(i + 1) == Some(&b'[') => {
                let embed = i > 0 && b[i - 1] == b'!';
                match line[i + 2..].find("]]") {
                    Some(j) => {
                        let inner = &line[i + 2..i + 2 + j];
                        // in a table the alias's bar is written `\|` (Obsidian): the backslash is not the target's
                        let end = inner.find('|').map_or(inner.len(), |k| if inner[..k].ends_with('\\') { k - 1 } else { k });
                        push(i + 2, i + 2 + end, true, embed);
                        i += 2 + j + 2;
                    }
                    None => break,
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

pub(crate) fn decode(t: &str) -> String {
    t.replace("%20", " ")
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
        let has_ext = t.rsplit('/').next().is_some_and(|n| n.contains('.'));
        let cands: Vec<String> = if has_ext { vec![t.to_string()] } else { vec![format!("{t}.md"), t.to_string()] };
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
            hits.sort_by_key(|p| (dir_of(p) != dir_of(from), p.len()));
            hits.first().map(|p| p.to_string())
        })
    }
}

/// The frontmatter mapping at the top of a note (empty when absent or malformed).
pub(crate) fn frontmatter(text: &str) -> serde_yaml::Mapping {
    atlas_text::frontmatter::mapping(text)
}

/// The vault's index, current: the walk is done on every call, and only the notes whose mtime changed are read again.
/// When nothing changed the same `Arc` comes back, so a request costs the walk and a few stats — never a copy.
fn scan(root: &Path, cfg: &Config) -> Arc<Index> {
    let mut warm = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    // read before the walk: a change while it runs makes the next request walk again
    let stamp = crate::vault_changes::stamp(root, cfg);
    refresh(&mut warm, root, Instant::now(), stamp, |prev| rebuild(root, cfg, prev))
}

/// `root`'s entry of the warm list brought up to date by `build` — or kept without a walk when its watcher saw no change
/// since (the same `stamp`, within [`TRUST`]) — and moved to the front; vaults idle for [`IDLE`] or beyond the first
/// [`WARM_VAULTS`] are dropped (their memory with them).
fn refresh(
    warm: &mut Vec<Warm>,
    root: &Path,
    now: Instant,
    stamp: Option<Stamp>,
    build: impl FnOnce(Option<Arc<Index>>) -> Arc<Index>,
) -> Arc<Index> {
    let prev = warm.iter().position(|w| w.root == root).map(|i| warm.remove(i));
    let unchanged = |w: &Warm| {
        stamp.is_some() && w.walked.is_some_and(|(s, at)| Some(s) == stamp && now.saturating_duration_since(at) < TRUST)
    };
    let (index, walked) = match prev {
        Some(w) if unchanged(&w) => (w.index, w.walked),
        prev => (build(prev.map(|w| w.index)), stamp.map(|s| (s, now))),
    };
    warm.retain(|w| now.saturating_duration_since(w.used) < IDLE);
    warm.insert(0, Warm { root: root.to_path_buf(), used: now, index: index.clone(), walked });
    warm.truncate(WARM_VAULTS);
    index
}

/// `prev`'s index brought up to date: unchanged notes keep their `Arc<Parsed>`, an unchanged file list keeps its
/// [`Names`], and an index with nothing changed is returned as is.
fn rebuild(root: &Path, cfg: &Config, prev: Option<Arc<Index>>) -> Arc<Index> {
    let mut files = Vec::new();
    let mut parsed: FileCache = HashMap::new();
    let mut reused = 0;
    for (abs, rel) in walk::files(root, cfg) {
        if rel.to_lowercase().ends_with(".md") && !cfg.index_excluded(&rel) {
            if let Ok(meta) = abs.metadata() {
                let mtime = meta.modified().ok();
                let p = match prev.as_ref().and_then(|i| i.parsed.get(&rel)) {
                    Some(p) if p.mtime == mtime => {
                        reused += 1;
                        p.clone()
                    }
                    _ => Arc::new(parse_note(&abs, &meta)),
                };
                parsed.insert(rel.clone(), p);
            }
        }
        files.push(rel);
    }
    let same_files = prev.as_ref().is_some_and(|i| i.names.files == files);
    match prev {
        Some(i) if same_files && reused == parsed.len() && reused == i.parsed.len() => i,
        Some(i) if same_files => Arc::new(Index::new(i.names.clone(), shrunk(parsed))),
        _ => Arc::new(Index::new(Arc::new(Names::new(files)), shrunk(parsed))),
    }
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
        Index { names, parsed, resolved: std::sync::OnceLock::new() }
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

    /// The files each note's links resolve to (unresolved links left out).
    pub fn targets<'a>(&'a self, src: &'a str) -> impl Iterator<Item = String> + 'a {
        self.links_of(src).filter_map(|(_, t)| t.map(str::to_string))
    }

    /// How many files share this file name (any case) — more than one: a link needs the path.
    pub fn same_name(&self, file_name: &str) -> usize {
        self.names.by_name.get(file_name.to_lowercase().as_str()).map_or(0, Vec::len)
    }
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
    // A quick "may name it somewhere" before the line-by-line check, without lowercasing the whole note. Case folding
    // matches whatever `to_lowercase` would, except U+0130 (İ, which lowercases to two chars): such a note is checked.
    let any_case = regex::RegexBuilder::new(&regex::escape(&needle)).case_insensitive(true).build().ok();
    let named = |text: &str| any_case.as_ref().is_none_or(|re| re.is_match(text)) || text.contains('\u{130}');
    let mut out = Vec::new();
    let mut srcs: Vec<&String> = parsed.keys().filter(|s| s.as_str() != path).collect();
    srcs.sort();
    for src in srcs {
        let p = &parsed[src];
        // the text is read here, not kept in the index; a note that never names the file is passed over whole
        if p.size > TEXT_BYTES {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(root.join(src)) else { continue };
        if !named(&text) {
            continue;
        }
        let linking: std::collections::HashSet<u32> = index.links_of(src).filter(|(_, t)| *t == Some(path)).map(|(l, _)| l.line).collect();
        let mut fence = false;
        let mut in_fm = text.starts_with("---\n");
        for (i, line) in text.lines().enumerate() {
            let t = line.trim_start();
            if in_fm {
                if i > 0 && line.trim_end() == "---" {
                    in_fm = false;
                }
                continue;
            }
            if t.starts_with("```") || t.starts_with("~~~") {
                fence = !fence;
                continue;
            }
            let n = i as u32 + 1;
            if fence || linking.contains(&n) || !mentions(&line.to_lowercase(), &needle) {
                continue;
            }
            out.push(Backlink { source: src.clone(), line: n, context: context(line), embed: false, relation: None });
            if out.len() >= MAX {
                return out;
            }
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
    let low = l.to_lowercase();
    let needle = name.to_lowercase();
    let word = |c: Option<char>| c.is_some_and(|c| c.is_alphanumeric() || c == '_');
    let mut from = 0;
    while let Some(i) = low[from..].find(&needle).map(|i| i + from) {
        let (before, after) = (low[..i].chars().next_back(), low[i + needle.len()..].chars().next());
        let in_link = low[..i].rfind("[[").is_some_and(|o| low[..i].rfind("]]").is_none_or(|c| c < o));
        if !word(before) && !word(after) && !in_link {
            let written = &l[i..i + needle.len()];
            let link = if written == name { format!("[[{name}]]") } else { format!("[[{name}|{written}]]") };
            l.replace_range(i..i + needle.len(), &link);
            return Some(lines.join("\n"));
        }
        from = i + needle.len();
    }
    None
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
            ["notes/a.md", "notes/lectures/b.md", "other/b.md", "notes/img/fig.png", "notes/x y.md"]
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
        assert_eq!(n.resolve(&m("lectures/b.md"), "notes/a.md").as_deref(), Some("notes/lectures/b.md"));
        assert_eq!(n.resolve(&m("x%20y.md"), "notes/a.md").as_deref(), Some("notes/x y.md"));
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
    fn several_vaults_stay_warm_until_idle_or_too_many() {
        let empty = || Arc::new(Index::new(Arc::new(Names::new(Vec::new())), HashMap::new()));
        let (mut warm, t0) = (Vec::new(), Instant::now());
        let a = refresh(&mut warm, Path::new("/a"), t0, None, |_| empty());
        refresh(&mut warm, Path::new("/b"), t0, None, |_| empty());
        let again = refresh(&mut warm, Path::new("/a"), t0, None, |prev| prev.expect("a is still warm"));
        assert!(Arc::ptr_eq(&a, &again), "switching vaults does not drop the other's index");
        for v in ["/c", "/d"] {
            refresh(&mut warm, Path::new(v), t0, None, |_| empty());
        }
        let roots = |w: &Vec<Warm>| w.iter().map(|w| w.root.to_string_lossy().into_owned()).collect::<Vec<_>>();
        assert_eq!(roots(&warm), ["/d", "/c", "/a"], "the least recently used goes first");
        refresh(&mut warm, Path::new("/d"), t0 + IDLE + Duration::from_secs(1), None, |prev| prev.unwrap());
        assert_eq!(roots(&warm), ["/d"], "idle vaults are dropped");
    }

    #[test]
    fn an_unchanged_watched_vault_is_not_walked_again() {
        let empty = || Arc::new(Index::new(Arc::new(Names::new(Vec::new())), HashMap::new()));
        let root = Path::new("/links-trust-test");
        let cfg = Config::default();
        let feed = crate::vault_changes::Feed::new(root, &cfg);
        feed.register();
        let (mut warm, t0) = (Vec::new(), Instant::now());
        let stamp = || crate::vault_changes::stamp(root, &cfg);
        let first = refresh(&mut warm, root, t0, stamp(), |_| empty());
        let kept = refresh(&mut warm, root, t0, stamp(), |_| panic!("no change: no walk"));
        assert!(Arc::ptr_eq(&first, &kept));
        feed.changed();
        let mut walked = false;
        refresh(&mut warm, root, t0, stamp(), |prev| {
            walked = true;
            prev.unwrap()
        });
        assert!(walked, "a change: walked again");
        let mut walked = false;
        refresh(&mut warm, root, t0 + TRUST, stamp(), |prev| {
            walked = true;
            prev.unwrap()
        });
        assert!(walked, "trusted for a while only");
        let mut walked = false;
        refresh(&mut warm, root, t0 + TRUST, None, |prev| {
            walked = true;
            prev.unwrap()
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

