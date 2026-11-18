//! Search: filename "contains every token" match over the walk, plus ripgrep's searcher (its crates, linked in) for content.
use crate::api::{FileWrite, LineHit, ReplaceResult, SearchResults};
use crate::config::Config;
use crate::{files, walk, Error, Result, Workspace};
use grep_regex::{RegexMatcher, RegexMatcherBuilder};
use grep_searcher::{sinks::UTF8, BinaryDetection, Searcher, SearcherBuilder};
use std::path::Path;

/// Names listed at most (the pane shows them a page at a time).
pub const MAX_NAMES: usize = 1000;
/// Files with matching lines listed at most, best first; each shows its first [`LINES_PER_FILE`] lines.
pub const MAX_FILES: usize = 500;
/// Matching lines shown per file; `counts` has them all.
pub const LINES_PER_FILE: usize = 5;
/// A file's matches are counted up to this (a log full of the word ranks no higher than one with this many).
const MAX_COUNT: usize = 999;

/// Line-search options (the Search pane's Aa / whole-word / .* toggles).
#[derive(Debug, Clone, Copy, Default)]
pub struct Opts {
    pub case: bool,
    pub word: bool,
    pub regex: bool,
    /// Also look in the agent's own files (`editor.index_exclude`); off by default.
    pub agent: bool,
    /// Only the text of the vault's PDFs (pdf_text.rs's cache), not the files; without it the PDFs' hits come after
    /// the files' (a quarter of the results at most).
    pub pdf: bool,
    /// Which files' text is read: the notes (the default) or every text file.
    pub within: Within,
}

/// Which files a content search reads. Names are matched over every file either way.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Within {
    /// The notes (`.md`) and the PDFs' text: what is written to be read. Logs, a run's outputs, data and code are not
    /// (on a research vault they are most of the bytes and few of the answers).
    #[default]
    Notes,
    /// Every text file (the Search pane's "All files" switch).
    Everything,
}

impl Within {
    pub fn from_all(all: bool) -> Within {
        if all { Within::Everything } else { Within::Notes }
    }
    /// Whether this file's text is read.
    pub fn reads(self, rel: &str) -> bool {
        match self {
            Within::Everything => true,
            Within::Notes => rel.rsplit_once('.').is_some_and(|(_, ext)| ext.eq_ignore_ascii_case("md")),
        }
    }
}

pub fn search(root: &Path, cfg: &Config, q: &str) -> SearchResults {
    search_with(root, cfg, q, Opts::default())
}

pub fn search_with(root: &Path, cfg: &Config, q: &str, o: Opts) -> SearchResults {
    search_in_lane(root, cfg, q, o, None)
}

/// The newest search of each lane (vault, asker): a search that is no longer the newest of its lane stops reading.
static LANES: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<(std::path::PathBuf, String), u64>>> = std::sync::LazyLock::new(Default::default);

/// A search's turn in its lane: [`Turn::stale`] once a newer search of the same lane started. No lane: never stale.
pub struct Turn {
    lane: Option<((std::path::PathBuf, String), u64)>,
}

impl Turn {
    pub fn take(root: &Path, lane: Option<&str>) -> Turn {
        let lane = lane.filter(|l| !l.is_empty()).map(|l| {
            let key = (root.to_path_buf(), l.to_string());
            let mut lanes = LANES.lock().unwrap_or_else(|e| e.into_inner());
            let n = lanes.entry(key.clone()).or_default();
            *n += 1;
            (key, *n)
        });
        Turn { lane }
    }
    pub fn stale(&self) -> bool {
        self.lane.as_ref().is_some_and(|(key, n)| LANES.lock().unwrap_or_else(|e| e.into_inner()).get(key) != Some(n))
    }
}

/// [`search_with`] for an asker's `lane`: superseded by a newer search of the lane, it stops reading files and answers
/// what it found so far (the asker drops it anyway).
pub fn search_in_lane(root: &Path, cfg: &Config, q: &str, o: Opts, lane: Option<&str>) -> SearchResults {
    let turn = Turn::take(root, lane);
    let stop = || turn.stale();
    if q.trim().is_empty() {
        return SearchResults::default();
    }
    // `tag:physics/dmft` lists the notes with that tag (or one nested under it) — tags.rs
    if let Some(tag) = q.trim().strip_prefix("tag:") {
        return SearchResults { files: crate::tags::notes(root, cfg, tag), ..Default::default() };
    }
    // the vault's files from the link index (kept current by the watcher), not a walk per search: one list for both the
    // lines and the names
    let index = crate::links::snapshot(root, cfg);
    if let Some(files) = by_property(cfg, &index, q, o.agent) {
        return SearchResults { files, ..Default::default() };
    }
    let walked: Vec<(std::path::PathBuf, String)> = listed(cfg, &index, o.agent).map(|rel| (root.join(&rel), rel)).collect();
    crate::pdf_text::catch_up(root, cfg);
    if o.pdf {
        let mut out = SearchResults::default();
        let narrow = crate::search_index::Narrow::of(root, q, o.regex);
        let found = pdf_lines(root, cfg, q, o, &walked, &narrow, &stop);
        narrow.settle(root, cfg);
        for f in found.into_iter().take(MAX_FILES) {
            out.counts.insert(f.rel, f.count as u32);
            out.lines.extend(f.lines);
        }
        return out;
    }
    let props = |rel: &str| index.parsed.get(rel).and_then(|p| p.props_whole());
    let names = if o.regex { Vec::new() } else { match_names(root, walked.iter().map(|(_, rel)| rel.clone()), q, props) };
    // every file read (on several threads), the PDFs' text at the same time; then ranked, not in the walk's order
    // the on-disk index first leaves out the notes and PDF texts that cannot hold the query (search_index.rs)
    let narrow = crate::search_index::Narrow::of(root, q, o.regex);
    let texts: Vec<_> = walked.iter().filter(|&(abs, rel)| o.within.reads(rel) && small(abs) && narrow.keeps(abs, rel)).cloned().collect();
    let (found, pdf) = std::thread::scope(|s| {
        let pdf = s.spawn(|| pdf_lines(root, cfg, q, o, &walked, &narrow, &stop));
        (file_lines(q, o, texts.into_iter(), true, &stop), pdf.join().unwrap_or_default())
    });
    narrow.settle(root, cfg);
    let named: std::collections::HashSet<&str> = names.iter().map(String::as_str).collect();
    let incoming = index.incoming();
    let mut ranked: Vec<(Rank, FileLines)> = found.into_iter().map(|f| (rank(root, &f, &named, incoming), f)).collect();
    ranked.sort_by_key(|r| r.0);
    let mut out = SearchResults { files: Vec::new(), lines: Vec::new(), counts: Default::default() };
    // a hit in a hidden note is its thing's (a drawing's note text → the drawing; companion::thing_of), as the names are;
    // the notes' properties from the index (no note read for them; the watcher keeps it current without a walk)
    for (_, f) in ranked.into_iter().take(MAX_FILES) {
        let path = crate::companion::thing_in(root, &f.rel, props).filter(|t| !t.ends_with(".md")).unwrap_or(f.rel);
        *out.counts.entry(path.clone()).or_default() += f.count as u32;
        out.lines.extend(f.lines.into_iter().map(|l| LineHit { path: path.clone(), ..l }));
    }
    // the papers after the notes, a page of them at most
    for f in pdf.into_iter().take(MAX_FILES / 4) {
        out.counts.insert(f.rel.clone(), f.count as u32);
        out.lines.extend(f.lines);
    }
    out.files = names;
    out
}

/// How a file with matching lines ranks (smaller first): its name matches the query too; a heading or the title says
/// it; a note; more matches (up to [`MAX_COUNT`]); more notes linking to it (a hub of the vault above a stray note);
/// the newest. So a note about the thing leads, not the walk's order.
type Rank = (bool, bool, bool, std::cmp::Reverse<usize>, std::cmp::Reverse<u32>, std::cmp::Reverse<std::time::SystemTime>);
fn rank(root: &Path, f: &FileLines, named: &std::collections::HashSet<&str>, incoming: &std::collections::HashMap<String, u32>) -> Rank {
    let modified = std::fs::metadata(root.join(&f.rel)).and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
    let linked = incoming.get(&f.rel).copied().unwrap_or(0);
    (!named.contains(f.rel.as_str()), !f.titled, !f.rel.ends_with(".md"), std::cmp::Reverse(f.count), std::cmp::Reverse(linked), std::cmp::Reverse(modified))
}

/// Only the names [`search_with`] would list, without reading a file: what the Search pane shows at once, while the
/// files' lines are still being read.
pub fn names_with(root: &Path, cfg: &Config, q: &str, o: Opts) -> Vec<String> {
    if q.trim().is_empty() || o.regex || o.pdf {
        return Vec::new();
    }
    if let Some(tag) = q.trim().strip_prefix("tag:") {
        return crate::tags::notes(root, cfg, tag);
    }
    let index = crate::links::snapshot(root, cfg);
    if let Some(files) = by_property(cfg, &index, q, o.agent) {
        return files;
    }
    let props = |rel: &str| index.parsed.get(rel).and_then(|p| p.props_whole());
    match_names(root, listed(cfg, &index, o.agent), q, props)
}

/// `key:value` — the notes whose property `key` holds `value` (case ignored; a list's items each; a link's name
/// without its brackets), answered from the note index with no file read: those whose value is `value` first, then
/// those containing it, each by path. `None` when the query is not of that shape or no note has a property `key` (so
/// `http://…` or `note: …` stay a text search).
fn by_property(cfg: &Config, index: &crate::links::Snapshot, q: &str, agent: bool) -> Option<Vec<String>> {
    let (key, want) = q.trim().split_once(':')?;
    let want = want.trim().to_lowercase();
    if key.is_empty() || want.is_empty() || !key.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return None;
    }
    let shown = |v: &serde_yaml::Value| -> Option<String> {
        let s = match v {
            serde_yaml::Value::String(s) => s.clone(),
            serde_yaml::Value::Number(n) => n.to_string(),
            serde_yaml::Value::Bool(b) => b.to_string(),
            _ => return None,
        };
        let s = s.trim();
        Some(s.strip_prefix("[[").and_then(|x| x.strip_suffix("]]")).unwrap_or(s).to_lowercase())
    };
    let mut any = false;
    let mut hits: Vec<(bool, &str)> = Vec::new();
    for (rel, p) in &index.parsed {
        let Some(v) = p.props_whole().and_then(|props| props.get(key)) else { continue };
        any = true;
        if !agent && cfg.is_agent_file(rel) {
            continue;
        }
        let values: Vec<String> = match v {
            serde_yaml::Value::Sequence(items) => items.iter().filter_map(shown).collect(),
            v => shown(v).into_iter().collect(),
        };
        if values.iter().any(|x| x.contains(&want)) {
            hits.push((!values.iter().any(|x| *x == want), rel));
        }
    }
    hits.sort();
    any.then(|| hits.into_iter().map(|(_, rel)| rel.to_string()).take(MAX_NAMES).collect())
}

/// The PDFs' text (pdf_text.rs's cache), each hit mapped back to its PDF and page, most matches first; only PDFs this
/// walk found: the text of one deleted, moved or now excluded stays in the cache until the next pass.
fn pdf_lines(
    root: &Path,
    cfg: &Config,
    q: &str,
    o: Opts,
    walked: &[(std::path::PathBuf, String)],
    narrow: &crate::search_index::Narrow,
    stop: &(dyn Fn() -> bool + Sync),
) -> Vec<FileLines> {
    if !root.join(crate::pdf_text::CACHE).is_dir() {
        return Vec::new();
    }
    let pdfs: std::collections::HashSet<&str> = walked.iter().map(|(_, rel)| rel.as_str()).filter(|r| r.to_lowercase().ends_with(".pdf")).collect();
    let mut found: Vec<FileLines> = file_lines(q, o, text_files(root, cfg, o, crate::pdf_text::CACHE).filter(|(abs, rel)| narrow.keeps(abs, rel)), false, stop)
        .into_iter()
        .filter_map(|f| {
            let lines = crate::pdf_text::hits(f.lines, root);
            let rel = lines.first()?.path.clone();
            pdfs.contains(rel.as_str()).then_some(FileLines { rel, lines, ..f })
        })
        .collect();
    found.sort_by_key(|f| std::cmp::Reverse(f.count));
    found
}

/// The vault's files as the link index lists them (the walk's ignore rules, in its order), the agent's own left out
/// unless asked for.
fn listed<'a>(cfg: &'a Config, index: &'a crate::links::Snapshot, agent: bool) -> impl Iterator<Item = String> + 'a {
    index.files().iter().filter(move |rel| agent || !cfg.is_agent_file(rel)).cloned()
}

/// Every whitespace token must appear (case-insensitive) in the path; basename hits rank first.
pub fn match_files(root: &Path, cfg: &Config, q: &str, agent: bool) -> Vec<String> {
    match_names(root, walk::files(root, cfg).filter(|(_, rel)| agent || !cfg.is_agent_file(rel)).map(|(_, rel)| rel), q, |_| None)
}

/// How well a file's name answers the query, best first.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum NameRank {
    /// The name (without its extension) is the query: `Report.md` for "report".
    Exact,
    /// The name starts with the query.
    Starts,
    /// Every word of the query starts a word of the name ("cl dm" → "Cluster DMFT").
    WordStarts,
    /// Every word is somewhere in the name.
    InName,
    /// Only the folders and the name together hold every word.
    InPath,
}

fn name_rank(stem: &str, base: &str, tokens: &[String], whole: &str) -> NameRank {
    let words: Vec<&str> = stem.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()).collect();
    if stem == whole {
        NameRank::Exact
    } else if stem.starts_with(whole) {
        NameRank::Starts
    } else if tokens.iter().all(|t| words.iter().any(|w| w.starts_with(t.as_str()))) {
        NameRank::WordStarts
    } else if tokens.iter().all(|t| base.contains(t.as_str())) {
        NameRank::InName
    } else {
        NameRank::InPath
    }
}

/// [`match_files`] over paths already walked.
fn match_names<'p>(root: &Path, paths: impl Iterator<Item = String>, q: &str, props: impl Fn(&str) -> Option<&'p crate::note_props::Props> + Copy) -> Vec<String> {
    let tokens: Vec<String> = q.split_whitespace().map(str::to_lowercase).collect();
    let whole = tokens.join(" ");
    let mut hits: Vec<(NameRank, bool, usize, String)> = paths
        .filter_map(|rel| {
            let low = rel.to_lowercase();
            if !tokens.iter().all(|t| low.contains(t.as_str())) {
                return None;
            }
            let base = low.rsplit('/').next().unwrap_or(&low);
            let stem = base.rsplit_once('.').map_or(base, |(s, _)| s);
            let rank = name_rank(stem, base, &tokens, &whole);
            // then notes before other files, then the shorter name, then the path
            Some((rank, !low.ends_with(".md"), stem.len(), rel))
        })
        .collect();
    hits.sort();
    // one hit per thing: a PDF's ink, a mail's attachment, a hidden note are their thing's hit (companion::thing_of)
    let mut seen = std::collections::HashSet::new();
    hits.into_iter()
        .map(|(_, _, _, p)| crate::companion::thing_in(root, &p, props).unwrap_or(p))
        .filter(|p| seen.insert(p.clone()))
        .take(MAX_NAMES)
        .collect()
}

/// The lines matching `q` (fixed-string, smart-case unless the options say otherwise): each file's first
/// [`LINES_PER_FILE`], in the files' order.
pub fn rg_lines(root: &Path, cfg: &Config, q: &str, o: Opts) -> Vec<LineHit> {
    file_lines(q, o, text_files(root, cfg, o, "."), true, &|| false).into_iter().flat_map(|f| f.lines).collect()
}

/// One file's matches: its first [`LINES_PER_FILE`] lines, and how many there are (up to [`MAX_COUNT`]).
struct FileLines {
    rel: String,
    count: usize,
    /// A match in a heading (`# …`) or the `title:` property: the file is about it.
    titled: bool,
    lines: Vec<LineHit>,
}

/// ripgrep's searcher over these files (absolute, relative), every file read, in the files' order. The files are read
/// on several threads (a vault holds thousands; one thread took seconds); `sniff` first leaves out what is not worth
/// reading ([`worth_reading`]). `stop` true: the search was superseded, the files left are not read.
fn file_lines(q: &str, o: Opts, files: impl Iterator<Item = (std::path::PathBuf, String)>, sniff: bool, stop: &(dyn Fn() -> bool + Sync)) -> Vec<FileLines> {
    use std::sync::atomic::{AtomicUsize, Ordering::Relaxed};
    let Ok(m) = grep_matcher(q, o) else { return Vec::new() }; // a regex being typed
    let files: Vec<_> = files.collect();
    let next = AtomicUsize::new(0);
    let per_file = std::sync::Mutex::new(Vec::<(usize, FileLines)>::new());
    let workers = std::thread::available_parallelism().map_or(4, |n| n.get()).clamp(1, 8);
    let (next, per_file, files) = (&next, &per_file, &files);
    std::thread::scope(|s| {
        for _ in 0..workers {
            let m = m.clone();
            s.spawn(move || {
                let mut searcher = searcher();
                loop {
                    let i = next.fetch_add(1, Relaxed);
                    let Some((abs, rel)) = files.get(i) else { break };
                    if i % 64 == 0 && stop() {
                        break; // superseded: a newer search of the same lane runs
                    }
                    if sniff && !sniffed(abs, rel) {
                        continue;
                    }
                    let mut f = FileLines { rel: rel.clone(), count: 0, titled: false, lines: Vec::new() };
                    // a note is searched as its words (its HTML blanked, lines kept: search_text.rs); other files as they are
                    let note = rel.rsplit_once('.').is_some_and(|(_, e)| e.eq_ignore_ascii_case("md")).then(|| std::fs::read_to_string(abs).ok()).flatten();
                    let sink = UTF8(|n, line| {
                        if let Some(text) = shown_line(line) {
                            f.count += 1;
                            f.titled |= rel.ends_with(".md") && is_title(&text); // a `#` in code is a comment
                            if f.lines.len() < LINES_PER_FILE {
                                f.lines.push(LineHit { path: rel.clone(), line: n as u32, text });
                            }
                        }
                        Ok(f.count < MAX_COUNT)
                    });
                    let _ = match &note {
                        Some(text) => searcher.search_slice(&m, crate::search_text::searchable(text).as_bytes(), sink),
                        None => searcher.search_path(&m, abs, sink),
                    };
                    if f.count > 0 {
                        per_file.lock().unwrap_or_else(|e| e.into_inner()).push((i, f));
                    }
                }
            });
        }
    });
    let mut per_file = std::mem::take(&mut *per_file.lock().unwrap_or_else(|e| e.into_inner()));
    per_file.sort_by_key(|(i, _)| *i);
    per_file.into_iter().map(|(_, f)| f).collect()
}

/// A heading or the note's title property: a line that names what the file is about.
fn is_title(line: &str) -> bool {
    let t = line.trim_start();
    (t.starts_with('#') && t.trim_start_matches('#').starts_with(' ')) || t.starts_with("title:") || t.starts_with("aliases:")
}

/// Each file's [`worth_reading`] verdict, kept while its size and modified time stay the same: a vault's thousands of
/// binaries (archives, pictures, a run's outputs) are not opened again by every search.
static SNIFFED: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<std::path::PathBuf, (u64, std::time::SystemTime, bool)>>> =
    std::sync::LazyLock::new(Default::default);

/// [`worth_reading`], remembered in [`SNIFFED`]; a file that cannot be read is not worth it (and not remembered).
fn sniffed(abs: &Path, rel: &str) -> bool {
    let Ok(meta) = std::fs::metadata(abs) else { return false };
    let stamp = (meta.len(), meta.modified().unwrap_or(std::time::UNIX_EPOCH));
    if let Some(&(len, at, verdict)) = SNIFFED.lock().unwrap_or_else(|e| e.into_inner()).get(abs) {
        if (len, at) == stamp {
            return verdict;
        }
    }
    let verdict = worth_reading(abs, rel);
    SNIFFED.lock().unwrap_or_else(|e| e.into_inner()).insert(abs.to_path_buf(), (stamp.0, stamp.1, verdict));
    verdict
}

/// Worth a content search, by the file's first 4 KB (the shape, as rg's binary sniff; no list of extensions): not
/// binary (a NUL: pictures, PDFs, archives), not an SVG picture, and — unless a note — not a table of numbers (a run's
/// `.tsv`, a data dump), whose words are only a header: under one character in twenty is in a word of four or more
/// letters (so `1.5e-3`, `nan`, `inf` do not count as words).
fn worth_reading(abs: &Path, rel: &str) -> bool {
    use std::io::Read;
    let mut head = [0u8; 4096];
    let Ok(mut f) = std::fs::File::open(abs) else { return false };
    let mut n = 0;
    while n < head.len() {
        match f.read(&mut head[n..]) {
            Ok(0) | Err(_) => break,
            Ok(k) => n += k,
        }
    }
    let head = &head[..n];
    if head.contains(&0) {
        return false;
    }
    let text = String::from_utf8_lossy(head);
    let start = text.trim_start();
    if start.starts_with("<svg") || (start.starts_with("<?xml") && text.contains("<svg")) {
        return false;
    }
    if rel.ends_with(".md") {
        return true;
    }
    let (mut in_words, mut shown, mut run) = (0usize, 0usize, 0usize);
    for c in text.chars().chain(std::iter::once(' ')) {
        if c.is_alphabetic() {
            run += 1;
        } else {
            if run >= 4 {
                in_words += run;
            }
            run = 0;
        }
        if !c.is_whitespace() {
            shown += 1;
        }
    }
    shown < 200 || in_words * 20 >= shown
}

/// Binary files (a NUL byte) stop the search of that file, as rg does.
fn searcher() -> Searcher {
    SearcherBuilder::new().binary_detection(BinaryDetection::quit(0)).line_number(true).build()
}

/// [`matcher`]'s rules for ripgrep's searcher.
fn grep_matcher(q: &str, o: Opts) -> Result<RegexMatcher> {
    let insensitive = smart_insensitive(q, o);
    let re = matcher(q, o)?;
    RegexMatcherBuilder::new().case_insensitive(insensitive).build(re.as_str()).map_err(|e| Error::BadRequest(format!("bad pattern: {e}")))
}

/// Largest file searched, as rg's `--max-filesize`.
pub(crate) const MAX_FILE: u64 = 5 << 20;

/// The files searched in `dir` ("." = the workspace, by the walk's ignores and, unless `o.agent`, without the agent's
/// files; any other folder whole), at most [`MAX_FILE`] long, as (absolute, relative).
fn text_files<'a>(root: &'a Path, cfg: &'a Config, o: Opts, dir: &str) -> Box<dyn Iterator<Item = (std::path::PathBuf, String)> + 'a> {
    let files: Box<dyn Iterator<Item = (std::path::PathBuf, String)>> = if dir == "." {
        Box::new(walk::files(root, cfg).filter(move |(_, rel)| (o.agent || !cfg.is_agent_file(rel)) && o.within.reads(rel)))
    } else {
        Box::new(walkdir::WalkDir::new(root.join(dir)).into_iter().filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()).filter_map(|e| {
            let rel = crate::paths::rel_path(root, e.path())?;
            Some((e.into_path(), rel))
        }))
    };
    Box::new(files.filter(|(abs, _)| small(abs)))
}

/// At most [`MAX_FILE`] long.
fn small(abs: &Path) -> bool {
    std::fs::metadata(abs).is_ok_and(|m| m.len() <= MAX_FILE)
}

/// The same match rules as `rg` (which uses this regex engine): literal unless `regex`, whole
/// words with `word`, and smart case (insensitive unless `case` or the query has a capital).
pub fn matcher(q: &str, o: Opts) -> Result<regex::Regex> {
    let pat = if o.regex { q.to_string() } else { regex::escape(q) };
    let pat = if o.word { format!(r"\b(?:{pat})\b") } else { pat };
    let insensitive = smart_insensitive(q, o);
    regex::RegexBuilder::new(&pat)
        .case_insensitive(insensitive)
        .multi_line(true)
        .build()
        .map_err(|e| Error::BadRequest(format!("bad pattern: {e}")))
}

/// Smart case, as rg: insensitive unless `case` or the query has a capital — in a regex, a capital it would match
/// (`\S`, `\p{Greek}`, `(?P<Name>…)` are syntax, not capitals).
fn smart_insensitive(q: &str, o: Opts) -> bool {
    if o.case {
        return false;
    }
    if !o.regex {
        return !q.chars().any(char::is_uppercase);
    }
    let mut rest = q;
    while let Some(c) = rest.chars().next() {
        rest = &rest[c.len_utf8()..];
        if c == '\\' {
            // an escape: `\p{Name}` / `\pL` skip the class's name, any other skips its one character
            let Some(e) = rest.chars().next() else { break };
            rest = &rest[e.len_utf8()..];
            if matches!(e, 'p' | 'P') {
                rest = match rest.strip_prefix('{') {
                    Some(r) => r.split_once('}').map_or("", |(_, after)| after),
                    None => rest.chars().next().map_or(rest, |n| &rest[n.len_utf8()..]),
                };
            }
        } else if c == '(' {
            // a group's name (`(?P<Name>`, `(?<Name>`) is not matched
            if let Some(r) = rest.strip_prefix("?P<").or_else(|| rest.strip_prefix("?<")) {
                rest = r.split_once('>').map_or("", |(_, after)| after);
            }
        } else if c.is_uppercase() {
            return false;
        }
    }
    true
}

/// Replace every match in the workspace's text files (the files `rg` finds with these options,
/// optionally narrowed to `only`). Regex mode expands `$1` / `${name}`; literal mode inserts
/// `with` as written. Each file is rewritten atomically. Only what the search shows is replaced: a match on a line of
/// encoded data (a drawing's compressed scene, an inline picture) is left, or the picture would be broken.
pub fn replace(ws: &Workspace, q: &str, o: Opts, with: &str, only: Option<&[String]>) -> Result<ReplaceResult> {
    if q.is_empty() {
        return Err(Error::BadRequest("empty search".into()));
    }
    let re = matcher(q, o)?;
    let cfg = ws.config()?;
    let m = grep_matcher(q, o)?;
    let mut searcher = searcher();
    let found: Vec<String> = text_files(ws.root(), &cfg, o, ".")
        .filter(|(_, rel)| only.is_none_or(|o| o.iter().any(|p| p == rel)))
        .filter(|(abs, _)| {
            let mut hit = false;
            let _ = searcher.search_path(&m, abs, UTF8(|_, _| { hit = true; Ok(false) }));
            hit
        })
        .map(|(_, rel)| rel)
        .collect();
    let mut res = ReplaceResult::default();
    for path in found.iter().map(String::as_str) {
        let Ok(doc) = files::read_text(ws, path) else { continue }; // binary or vanished
        let (text, n) = replace_shown(&re, &doc.text, with, o.regex);
        if n == 0 {
            continue;
        }
        files::write_text(ws, &FileWrite { path: path.to_string(), text, base_mtime: Some(doc.mtime), only_new: false, apply_here: false })?;
        res.replacements += n as u32;
        res.files.push(path.to_string());
    }
    Ok(res)
}

/// `re`'s matches in `text` replaced (`$1` expanded when `expand`), except on lines the search does not show →
/// (text, replacements).
fn replace_shown(re: &regex::Regex, text: &str, with: &str, expand: bool) -> (String, usize) {
    let mut n = 0;
    let mut line = (0, 0, true); // the last line looked at: (start, end, shown) — one look per line, however many hits
    let out = re.replace_all(text, |c: &regex::Captures| {
        let m = c.get(0).expect("the whole match");
        if !(line.0..line.1).contains(&m.start()) {
            let start = text[..m.start()].rfind('\n').map_or(0, |i| i + 1);
            let end = text[m.start()..].find('\n').map_or(text.len(), |i| m.start() + i);
            line = (start, end.max(start + 1), shown_line(&text[start..end]).is_some());
        }
        if !line.2 {
            return m.as_str().to_string();
        }
        n += 1;
        let mut s = String::new();
        if expand { c.expand(with, &mut s) } else { s.push_str(with) }
        s
    });
    (out.into_owned(), n)
}

/// A matching line as the search lists it (trimmed, at most 400 characters); None for one it never lists.
fn shown_line(line: &str) -> Option<String> {
    let text: String = line.trim_end().chars().take(400).collect();
    (!looks_encoded(&text)).then_some(text)
}

/// A line that is encoded data, not words: an embedded picture's base64 (a drawing's `dataURL`, a note's inline
/// image) matched "epub" in random letters. By shape, not by file kind: a run of 120 or
/// more base64 characters without a space.
fn looks_encoded(text: &str) -> bool {
    let mut run = 0;
    for c in text.chars() {
        if c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=' {
            run += 1;
            if run >= 120 {
                return true;
            }
        } else {
            run = 0;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Where a search's time goes on a real vault, stage by stage, read-only (no PDF text catch-up, nothing written):
    /// `ATLAS_TEST_VAULT=<vault> cargo test -p atlas-core --lib search::tests::stages -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn stages() {
        let Ok(root) = std::env::var("ATLAS_TEST_VAULT") else { return eprintln!("skipped: ATLAS_TEST_VAULT is unset") };
        let root = std::path::Path::new(&root);
        let cfg = Config::load(root).unwrap();
        for q in ["zzqx", "zzqx"] {
            let t = std::time::Instant::now();
            let walked: Vec<_> = walk::files(root, &cfg).filter(|(_, rel)| !cfg.is_agent_file(rel)).collect();
            let walk = t.elapsed();
            let index = crate::links::snapshot(root, &cfg);
            let snap = t.elapsed();
            let props = |rel: &str| index.parsed.get(rel).and_then(|p| p.props_whole());
            let names = match_names(root, walked.iter().map(|(_, rel)| rel.clone()), q, props);
            let named = t.elapsed();
            let texts: Vec<_> = walked.iter().filter(|&(abs, _)| small(abs)).cloned().collect();
            let bytes: u64 = texts.iter().filter_map(|(abs, _)| std::fs::metadata(abs).ok()).map(|m| m.len()).sum();
            let sized = t.elapsed();
            // the sniff alone (remembered after the first query), then the search of what passed it
            let worth: Vec<_> = texts.iter().filter(|(abs, rel)| sniffed(abs, rel)).cloned().collect();
            let sniff = t.elapsed();
            // what the default search reads now: the notes only
            let t_notes = std::time::Instant::now();
            let notes = file_lines(q, Opts::default(), texts.iter().filter(|(_, rel)| Within::Notes.reads(rel)).cloned(), true, &|| false);
            eprintln!("{q:>12}: NOTES ONLY {} files hit, {:.0?} (+ walk/index/names {:.0?})", notes.len(), t_notes.elapsed(), named);
            let found = file_lines(q, Opts::default(), worth.iter().cloned(), false, &|| false);
            let read = t.elapsed();
            eprintln!("{q:>12}: sniff {} → {} worth reading {:.0?} | search {:.0?} on {} threads", texts.len(), worth.len(), sniff - sized, read - sniff,
                std::thread::available_parallelism().map_or(0, |n| n.get()));
            eprintln!(
                "{q:>12}: walk {} files {walk:.0?} | index {:.0?} | names {} {:.0?} | stat {} files {} MB {:.0?} | lines {} files {:.0?} | total {read:.0?}",
                walked.len(), snap - walk, names.len(), named - snap, texts.len(), bytes >> 20, sized - named, found.len(), read - sized
            );
        }
        // what is read in full: the files the sniff lets through, by extension, the biggest first
        let mut by: std::collections::HashMap<String, (usize, u64)> = Default::default();
        for (abs, rel) in walk::files(root, &cfg).filter(|(abs, rel)| small(abs) && worth_reading(abs, rel)) {
            let ext = rel.rsplit_once('.').map_or("", |(_, e)| e).to_lowercase();
            let e = by.entry(ext).or_default();
            e.0 += 1;
            e.1 += std::fs::metadata(&abs).map_or(0, |m| m.len());
        }
        let mut by: Vec<_> = by.into_iter().collect();
        by.sort_by_key(|(_, (_, b))| std::cmp::Reverse(*b));
        for (ext, (n, b)) in by.iter().take(15) {
            eprintln!("read: .{ext:<10} {n:>6} files {:>6} MB", b >> 20);
        }
    }

    #[test]
    fn smart_case_counts_only_the_capitals_a_pattern_matches() {
        let (lit, re) = (Opts::default(), Opts { regex: true, ..Opts::default() });
        assert!(smart_insensitive("note", lit) && !smart_insensitive("Note", lit));
        assert!(!smart_insensitive(r"\S", lit), "literal: the text as typed");
        for q in [r"\S+ items", r"\W\D\B", r"\p{Greek}x", r"\PLx", r"(?P<Name>a)", r"(?<Year>\d{4})"] {
            assert!(smart_insensitive(q, re), "{q}");
        }
        for q in [r"\SNote", r"\p{Greek}A", r"(?P<n>Ab)", "Ünder"] {
            assert!(!smart_insensitive(q, re), "{q}");
        }
        assert!(!smart_insensitive("note", Opts { case: true, ..Opts::default() }));
        assert!(matcher(r"\S+ items", re).unwrap().is_match("3 ITEMS"));
    }

    #[test]
    fn encoded_lines_are_not_hits() {
        let blob = "iVBORw0KGgo".repeat(20);
        assert!(looks_encoded(&format!("\"dataURL\": \"data:image/png;base64,{blob}\"")));
        assert!(!looks_encoded("The epub reader keeps your place in the note's properties."));
        assert!(!looks_encoded("a long path notes/lectures/supcondfatc/Supercond-Carlos-2026-week-03.md and more"));
    }

    #[test]
    fn options_case_word_regex() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("a.md"), "Hubbard model\nhubbardish\nU = 4.0\n").unwrap();
        let cfg = Config::default();
        let n = |q: &str, o: Opts| rg_lines(d.path(), &cfg, q, o).len();
        assert_eq!(n("hubbard", Opts::default()), 2, "smart case, substring");
        assert_eq!(n("hubbard", Opts { case: true, ..Default::default() }), 1);
        assert_eq!(n("hubbard", Opts { word: true, ..Default::default() }), 1);
        assert_eq!(n("U = \\d", Opts { regex: true, ..Default::default() }), 1);
        assert_eq!(n("U = \\d", Opts::default()), 0, "literal by default");
    }

    /// The agent's files (memories, session logs) are not found unless asked for: by text, by
    /// file name (quick open, `[[` completion) or by a replace across files.
    #[test]
    fn agent_files_are_searched_only_on_request() {
        let d = tempfile::tempdir().unwrap();
        for (f, text) in [("notes/a.md", "hubbard U\n"), ("docs/memory/log.md", "hubbard session\n"), ("AGENTS.md", "hubbard rules\n")] {
            std::fs::create_dir_all(d.path().join(f).parent().unwrap()).unwrap();
            std::fs::write(d.path().join(f), text).unwrap();
        }
        let ws = Workspace::open(d.path()).unwrap();
        let mut cfg = Config::default();
        cfg.editor.index_exclude = vec!["/docs".into(), "/AGENTS.md".into()];
        let all = Opts { agent: true, ..Default::default() };
        let paths = |o: Opts| { let mut p: Vec<String> = rg_lines(d.path(), &cfg, "hubbard", o).into_iter().map(|h| h.path).collect(); p.sort(); p };
        assert_eq!(paths(Opts::default()), ["notes/a.md"]);
        assert_eq!(paths(all), ["AGENTS.md", "docs/memory/log.md", "notes/a.md"]);
        assert_eq!(match_files(d.path(), &cfg, "log", false), Vec::<String>::new());
        assert_eq!(match_files(d.path(), &cfg, "log", true), ["docs/memory/log.md"]);
        // the default config keeps docs/memory apart, so a replace leaves it alone
        let r = replace(&ws, "hubbard", Opts::default(), "Hubbard", None).unwrap();
        assert!(!r.files.iter().any(|f| f.starts_with("docs/memory")), "{:?}", r.files);
        assert_eq!(std::fs::read_to_string(d.path().join("docs/memory/log.md")).unwrap(), "hubbard session\n");
    }

    #[test]
    fn replace_follows_the_search_options() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("notes")).unwrap();
        std::fs::write(d.path().join("notes/a.md"), "Colour colour colourful\n").unwrap();
        std::fs::write(d.path().join("notes/b.md"), "no match\n").unwrap();
        std::fs::write(d.path().join("notes/c.md"), "U = 4.0, U = 8.0\n").unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let read = |f: &str| std::fs::read_to_string(d.path().join(f)).unwrap();
        // whole word, smart case (lower-case query → insensitive)
        let r = replace(&ws, "colour", Opts { word: true, ..Default::default() }, "color", None).unwrap();
        assert_eq!((r.replacements, r.files.clone()), (2, vec!["notes/a.md".to_string()]));
        assert_eq!(read("notes/a.md"), "color color colourful\n");
        // regex with a capture group; literal mode would keep "$1" as text
        replace(&ws, r"U = (\d)\.0", Opts { regex: true, ..Default::default() }, "U=$1", None).unwrap();
        assert_eq!(read("notes/c.md"), "U=4, U=8\n");
        replace(&ws, "U=4", Opts::default(), "$1", Some(&["notes/other.md".to_string()])).unwrap();
        assert_eq!(read("notes/c.md"), "U=4, U=8\n", "`only` narrows the files");
        replace(&ws, "U=4", Opts::default(), "$1", None).unwrap();
        assert_eq!(read("notes/c.md"), "$1, U=8\n", "literal mode inserts the text as written");
        assert!(replace(&ws, "(", Opts { regex: true, ..Default::default() }, "x", None).is_err());
    }

    #[test]
    fn replace_leaves_encoded_lines_as_they_are() {
        let d = tempfile::tempdir().unwrap();
        let blob = "iVBORw0KGgoAbcAbc".repeat(10);
        let note = format!("abc here\n![x](data:image/png;base64,{blob})\nand abc\n");
        std::fs::write(d.path().join("a.md"), &note).unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let r = replace(&ws, "abc", Opts::default(), "xyz", None).unwrap();
        assert_eq!(r.replacements, 2, "only the two lines the search shows");
        assert_eq!(std::fs::read_to_string(d.path().join("a.md")).unwrap(), note.replace("abc here", "xyz here").replace("and abc", "and xyz"));
        assert_eq!(replace_shown(&regex::Regex::new("(a)").unwrap(), "a\na", "<$1>", true), ("<a>\n<a>".to_string(), 2));
    }

    #[test]
    fn a_sniff_is_remembered_until_the_file_changes() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("data");
        std::fs::write(&p, b"\0\x01binary").unwrap();
        assert!(!sniffed(&p, "data"));
        // the same size and time: the verdict kept (a file rewritten in place within the clock's step would be missed
        // until it changes again — size and time are what every watcher here trusts)
        assert!(!sniffed(&p, "data"));
        std::fs::write(&p, b"now plain words in a longer line of text").unwrap();
        assert!(sniffed(&p, "data"), "rewritten: sniffed again");
        assert!(!sniffed(&d.path().join("gone"), "gone"));
    }

    #[test]
    fn only_text_worth_reading_is_searched() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        let numbers: String = (0..400).map(|i| format!("{i}\t{:.4e}\t{:.3}\tnan\n", i as f64 * 1.5e-3, i as f64 / 7.0)).collect();
        std::fs::write(r.join("run.tsv"), format!("energy\tdensity\tfilling\tgap\n{numbers}")).unwrap();
        std::fs::write(r.join("plot.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>energy</text></svg>").unwrap();
        std::fs::write(r.join("blob.bin"), b"energy\0\x01\x02").unwrap();
        std::fs::write(r.join("table.md"), format!("energy\n{numbers}")).unwrap(); // a note is always read
        std::fs::write(r.join("script.py"), "# the energy of the bath\nprint(1)\n").unwrap();
        let every = Opts { within: Within::Everything, ..Default::default() };
        let mut hits: Vec<_> = search_with(r, &Config::default(), "energy", every).lines.into_iter().map(|l| l.path).collect();
        hits.sort();
        assert_eq!(hits, ["script.py", "table.md"]);
    }

    #[test]
    fn a_kept_mail_is_found_by_its_words_not_its_html() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::write(r.join("mail.md"), "# Booking\n<div class=\"email-html\">\n<a href=\"https://airline.example\">manage the booking</a>\n</div>\n").unwrap();
        assert!(search(r, &Config::default(), "airline").lines.is_empty(), "an attribute is not a word of the mail");
        assert!(search(r, &Config::default(), "email-html").lines.is_empty());
        let hits = search(r, &Config::default(), "manage").lines;
        assert_eq!(hits.iter().map(|h| (h.line, h.text.trim())).collect::<Vec<_>>(), [(3, "manage the booking")]);
    }

    #[test]
    fn of_equal_matches_the_note_more_notes_link_to_comes_first() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::write(r.join("hub.md"), "about spin waves\n").unwrap();
        std::fs::write(r.join("stray.md"), "about spin waves\n").unwrap();
        for i in 0..3 {
            std::fs::write(r.join(format!("l{i}.md")), "see [[hub]]\n").unwrap();
        }
        // the stray note is the newer: without the links it would lead
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(r.join("stray.md"), "about spin waves\n").unwrap();
        let order: Vec<String> = search(r, &Config::default(), "spin waves").lines.into_iter().map(|l| l.path).collect();
        assert_eq!(order, ["hub.md", "stray.md"]);
    }

    #[test]
    fn a_property_is_searched_by_key_and_value() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        let cfg = Config::default();
        std::fs::write(r.join("a.md"), "---\nstatus: Draft\nauthor: \"[[Ana Smith]]\"\n---\nx\n").unwrap();
        std::fs::write(r.join("b.md"), "---\nstatus: drafted\ntags: [x]\nauthor: [Bo, Ana Smith]\n---\ny\n").unwrap();
        std::fs::write(r.join("c.md"), "---\nstatus: done\n---\nsee http://example.org/x\n").unwrap();
        let files = |q: &str| search(r, &cfg, q).files;
        assert_eq!(files("status:draft"), ["a.md", "b.md"], "the exact value first, then those containing it");
        assert_eq!(files("author:ana smith"), ["a.md", "b.md"], "a link's name, a list's items");
        assert!(files("status:nothing").is_empty());
        assert_eq!(names_with(r, &cfg, "status:done", Opts::default()), ["c.md"], "the instant list too");
        assert!(!search(r, &cfg, "http://example").lines.is_empty(), "no property `http`: a text search");
    }

    /// The on-disk index changes what is read, never what is found: the same lines with and without it, a note
    /// edited after it was built found by its new words, and the PDFs' text narrowed the same way.
    #[test]
    fn the_index_finds_what_reading_every_note_finds() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        let cfg = Config::default();
        std::fs::create_dir_all(r.join("notes")).unwrap();
        for i in 0..30 {
            std::fs::write(r.join(format!("notes/n{i}.md")), format!("# Note {i}\nword{i} shared\n{}\n", if i % 3 == 0 { "Hubbard model" } else { "lattice" })).unwrap();
        }
        let lines = |q: &str, o: Opts| {
            let mut v: Vec<_> = search_with(r, &cfg, q, o).lines.into_iter().map(|l| (l.path, l.line)).collect();
            v.sort();
            v
        };
        let queries = [("hubbard", Opts::default()), ("word1", Opts::default()), ("Note 2", Opts::default()), ("sh", Opts::default()), (r"mod+el$", Opts { regex: true, ..Default::default() })];
        let before: Vec<_> = queries.iter().map(|(q, o)| lines(q, *o)).collect();
        assert_eq!(before[0].len(), 10);
        let files: Vec<_> = crate::links::snapshot(r, &cfg).files().iter().map(|rel| (r.join(rel), rel.clone())).collect();
        crate::search_index::build(&files, &r.join(crate::search_index::FILE)).unwrap();
        for ((q, o), want) in queries.iter().zip(&before) {
            assert_eq!(&lines(q, *o), want, "{q:?} with the index");
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(r.join("notes/n1.md"), "# Note 1\nnow about the Hubbard model\n").unwrap();
        assert_eq!(lines("hubbard", Opts::default()).len(), 11, "an edit is found before the index is rebuilt");
    }

    #[test]
    fn a_file_made_between_two_searches_is_found() {
        // the files come from the link index, not a walk: it must see a new one
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::write(r.join("a.md"), "the lattice\n").unwrap();
        assert_eq!(search(r, &Config::default(), "lattice").lines.len(), 1);
        std::fs::write(r.join("b.md"), "another lattice\n").unwrap();
        let res = search(r, &Config::default(), "lattice");
        assert_eq!(res.lines.len(), 2, "{res:?}");
        assert_eq!(names_with(r, &Config::default(), "b", Opts::default()), ["b.md"]);
    }

    #[test]
    fn by_default_only_the_notes_are_read_but_every_name_matches() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::write(r.join("note.md"), "the lattice\n").unwrap();
        std::fs::write(r.join("Upper.MD"), "the lattice\n").unwrap();
        std::fs::write(r.join("run.log"), "the lattice\n").unwrap();
        std::fs::write(r.join("lattice.py"), "the lattice\n").unwrap();
        let res = search(r, &Config::default(), "lattice");
        let mut read: Vec<_> = res.lines.iter().map(|l| l.path.as_str()).collect();
        read.sort();
        assert_eq!(read, ["Upper.MD", "note.md"]);
        assert_eq!(res.files, ["lattice.py"], "names are matched over every file");
        let every = Opts { within: Within::Everything, ..Default::default() };
        assert_eq!(search_with(r, &Config::default(), "lattice", every).lines.len(), 4);
        // replace follows the same rule: the log is left alone unless every file is asked for
        let ws = Workspace::open(r).unwrap();
        let done = replace(&ws, "lattice", Opts::default(), "chain", None).unwrap();
        assert_eq!(done.files.len(), 2);
        assert_eq!(std::fs::read_to_string(r.join("run.log")).unwrap(), "the lattice\n");
    }

    #[test]
    fn notes_lead_and_the_order_holds_across_threads() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        for i in 0..40 {
            std::fs::write(r.join(format!("a{i:02}.py")), "# the lattice\n").unwrap();
            std::fs::write(r.join(format!("z{i:02}.md")), "the lattice\n").unwrap();
        }
        let every = Opts { within: Within::Everything, ..Default::default() };
        let hits: Vec<_> = search_with(r, &Config::default(), "lattice", every).lines.into_iter().map(|l| l.path).collect();
        assert_eq!(hits.len(), 80);
        assert!(hits[..40].iter().all(|p| p.ends_with(".md")), "{hits:?}");
        assert_eq!(hits, search_with(r, &Config::default(), "lattice", every).lines.into_iter().map(|l| l.path).collect::<Vec<_>>());
    }

    /// The files with matching lines come best first, not in the walk's order: the name, then a heading, then a note,
    /// then how often; each lists a few lines and counts them all.
    #[test]
    fn matching_files_are_ranked_and_counted() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::create_dir_all(r.join("notes")).unwrap();
        std::fs::write(r.join("notes/aaa.md"), "in passing: the lattice\n").unwrap();
        std::fs::write(r.join("notes/bbb.md"), "lattice\n".repeat(12)).unwrap();
        std::fs::write(r.join("notes/ccc.md"), "# The lattice\nmore\n").unwrap();
        std::fs::write(r.join("notes/lattice-notes.md"), "one lattice\n").unwrap();
        std::fs::write(r.join("aaa.py"), "# lattice lattice lattice\nlattice\n").unwrap();
        let res = search_with(r, &Config::default(), "lattice", Opts { within: Within::Everything, ..Default::default() });
        let mut order: Vec<&str> = res.lines.iter().map(|l| l.path.as_str()).collect();
        order.dedup();
        assert_eq!(order, ["notes/lattice-notes.md", "notes/ccc.md", "notes/bbb.md", "notes/aaa.md", "aaa.py"]);
        assert_eq!(res.lines.iter().filter(|l| l.path == "notes/bbb.md").count(), LINES_PER_FILE);
        assert_eq!(res.counts["notes/bbb.md"], 12);
        assert_eq!(res.counts["notes/aaa.md"], 1);
    }

    #[test]
    fn one_hit_per_thing() {
        // a drawing, its ink-free hidden note, a PDF and its ink: each thing once, by name and by what its note says
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::create_dir_all(r.join("notes")).unwrap();
        std::fs::write(r.join("notes/qft.excalidraw"), "{}").unwrap();
        std::fs::write(r.join("notes/qft.md"), "---\ndrawing: '[[qft.excalidraw]]'\nshown: false\n---\n> renormalisation group\n").unwrap();
        std::fs::write(r.join("notes/qft.pdf"), "%PDF").unwrap();
        std::fs::write(r.join("notes/qft.pdf.excalidraw"), "{}").unwrap();
        let cfg = Config::default();
        assert_eq!(match_files(r, &cfg, "qft", false), ["notes/qft.excalidraw", "notes/qft.pdf"]);
        let hits = search(r, &cfg, "renormalisation").lines;
        assert_eq!(hits.iter().map(|h| h.path.as_str()).collect::<Vec<_>>(), ["notes/qft.excalidraw"]);
    }

    #[test]
    fn filenames_and_content() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::create_dir_all(r.join("notes/dmft")).unwrap();
        std::fs::create_dir_all(r.join("runs")).unwrap();
        std::fs::write(r.join("notes/dmft/bath.md"), "Hybridization $\\Delta(i\\omega)$\nSubbath fit\n").unwrap();
        std::fs::write(r.join("notes/bath-notes.md"), "nothing\n").unwrap();
        std::fs::write(r.join("runs/bath.tsv"), "subbath in ignored dir\n").unwrap();
        let cfg = Config::default();
        assert_eq!(match_files(r, &cfg, "bath", false), ["notes/dmft/bath.md", "notes/bath-notes.md"]);
        assert_eq!(match_files(r, &cfg, "dmft bath", false), ["notes/dmft/bath.md"]);
        let res = search(r, &cfg, "subbath");
        assert_eq!(res.lines, vec![LineHit { path: "notes/dmft/bath.md".into(), line: 2, text: "Subbath fit".into() }]);
        assert!(search(r, &cfg, "  ").files.is_empty());
        // `/runs` is the top-level folder only: notes about runs stay findable, by name and by content
        std::fs::create_dir_all(r.join("notes/runs")).unwrap();
        std::fs::write(r.join("notes/runs/alpha.md"), "subbath run note\n").unwrap();
        assert!(match_files(r, &cfg, "alpha", false).is_empty(), "the default `runs` matches at any depth");
        let rooted = Config { ignore: vec!["/runs".into()], ..Config::default() };
        assert_eq!(match_files(r, &rooted, "alpha", false), ["notes/runs/alpha.md"]);
        let mut hits: Vec<_> = search(r, &rooted, "subbath").lines.into_iter().map(|l| l.path).collect();
        hits.sort(); // ripgrep searches files in parallel: their order is not fixed
        assert_eq!(hits, ["notes/dmft/bath.md", "notes/runs/alpha.md"]);
    }

    /// The name that is the query leads, then one that starts with it, then words at word starts, then anywhere in the
    /// name, then only across the folders — not the shortest path first.
    #[test]
    fn a_name_that_is_the_query_leads() {
        let paths = ["a/Report draft 2.md", "notes/projects/Report.md", "x/reports/old.md", "Reporting.pdf", "y/Quarterly report.md", "Report.pdf"];
        let got = match_names(Path::new("/nonexistent"), paths.iter().map(|p| p.to_string()), "report", |_| None);
        assert_eq!(got, ["notes/projects/Report.md", "Report.pdf", "a/Report draft 2.md", "Reporting.pdf", "y/Quarterly report.md", "x/reports/old.md"]);
        let words = match_names(Path::new("/nonexistent"), ["b/Cluster DMFT.md", "a/xcl dmx.md"].iter().map(|p| p.to_string()), "cl dm", |_| None);
        assert_eq!(words, ["b/Cluster DMFT.md", "a/xcl dmx.md"], "word starts before letters inside words");
    }

    /// A newer search of the same lane makes the older one stale; another lane, or none, is never touched.
    #[test]
    fn a_newer_search_in_its_lane_supersedes_the_older() {
        let root = Path::new("/vault-lanes-test");
        let first = Turn::take(root, Some("pane-1"));
        let other = Turn::take(root, Some("pane-2"));
        let none = Turn::take(root, None);
        assert!(!first.stale());
        let second = Turn::take(root, Some("pane-1"));
        assert!(first.stale() && !second.stale(), "the older one stops");
        assert!(!other.stale() && !none.stale());
    }

}
