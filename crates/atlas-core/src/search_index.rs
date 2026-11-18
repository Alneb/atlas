//! The search box's trigram index (docs/design/DESIGN-search-index.md §3): which notes and PDF texts *may* hold a query,
//! so a search reads those few instead of every note. It only narrows: the files it lets through are read and matched
//! exactly as before (search.rs `file_lines`), and any file it does not know as it is now (new, changed) is read anyway.
//!
//! The text indexed is what search matches: a note's [`searchable`](crate::search_text::searchable) text, a PDF's cached
//! text as it is — [`fold`]ed, then every three bytes of its UTF-8 (a *trigram*). A query folded is a substring of a
//! text folded only if each of its trigrams is in it, so no match is ever lost; a regex gives the literals every match
//! must hold ([`required`]).
//!
//! One immutable segment per vault, `.atlas/cache/search/trigrams.idx`, written beside and renamed over:
//!
//! ```text
//! header    "ATSI" · version · documents · trigrams · offsets of the three sections · end      (u32/u64, little endian)
//! documents per id: path length (u32) · path · size (u64) · modified, ns since 1970 (u64)
//! dictionary per trigram, sorted: trigram (u32) · offset into postings (u32) · byte length (u32)
//! postings  per trigram: its document ids ascending, as LEB128 deltas (mostly one byte each)
//! ```
//!
//! The header, documents and dictionary are kept in memory; a query reads only the postings of its trigrams. A bad or
//! older file is ignored (search reads every note, as with no index) and rebuilt.

use crate::config::Config;
use std::collections::HashMap;
use std::fs::File;
use std::io::{self, Write as _};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering::Relaxed};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant, SystemTime};

/// Where the segment lives in a vault.
pub const FILE: &str = ".atlas/cache/search/trigrams.idx";
const MAGIC: &[u8; 4] = b"ATSI";
/// Bumped whenever what is indexed changes (the searchable text, [`fold`], the format): an older segment is rebuilt.
const VERSION: u32 = 1;
const HEADER: usize = 4 + 4 + 4 + 4 + 8 * 4;
/// A new segment is built once this many indexed files are new or changed since it — or [`STALE_SHARE`] of them.
const STALE_FILES: usize = 64;
const STALE_SHARE: usize = 20; // 1 in 20 = 5 %
/// A vault's segment is rebuilt at most this often (a vault changing fast is served by the overlay meanwhile).
const REBUILD_GAP: Duration = Duration::from_secs(60);
/// Postings intersected at most per query, the shortest: more only narrows a little further, at a read each.
const MAX_LISTS: usize = 12;

/// Whether `rel` is a file the index covers: a note, or a PDF's cached text.
pub fn covers(rel: &str) -> bool {
    rel.starts_with(crate::pdf_text::CACHE) || rel.rsplit_once('.').is_some_and(|(_, e)| e.eq_ignore_ascii_case("md"))
}

/// `s` with each character mapped to one representative of its case class — what the search's case-insensitive match
/// treats as equal (simple case folding) is equal here: lowercase, plus the pairs lowercase alone keeps apart.
pub fn fold(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            'ſ' => out.push('s'),
            'ς' => out.push('σ'),
            'ϐ' => out.push('β'),
            'ϑ' | 'ϴ' => out.push('θ'),
            'ϕ' => out.push('φ'),
            'ϖ' => out.push('π'),
            'ϰ' => out.push('κ'),
            'ϱ' => out.push('ρ'),
            'ϵ' => out.push('ε'),
            'ẛ' => out.push('ṡ'),
            '\u{345}' | '\u{1FBE}' => out.push('ι'),
            '\u{1C80}' => out.push('в'),
            '\u{1C81}' => out.push('д'),
            '\u{1C82}' => out.push('о'),
            '\u{1C83}' => out.push('с'),
            '\u{1C84}' | '\u{1C85}' => out.push('т'),
            '\u{1C86}' => out.push('ъ'),
            '\u{1C87}' => out.push('ѣ'),
            '\u{1C88}' => out.push('ꙋ'),
            c if c.is_ascii() => out.push(c.to_ascii_lowercase()),
            c => out.extend(c.to_lowercase()),
        }
    }
    out
}

/// Every trigram of `bytes` (sorted, each once).
fn trigrams(bytes: &[u8]) -> Vec<u32> {
    let mut t: Vec<u32> = bytes.windows(3).map(|w| (w[0] as u32) << 16 | (w[1] as u32) << 8 | w[2] as u32).collect();
    t.sort_unstable();
    t.dedup();
    t
}

/// The literal strings every match of the query must contain: the query itself, or a regex's ([`required`]).
/// Empty: the index cannot narrow (every covered file is a candidate).
fn literals(q: &str, regex: bool) -> Vec<String> {
    if !regex {
        return vec![q.to_string()];
    }
    match regex_syntax::ParserBuilder::new().build().parse(q) {
        Ok(hir) => required(&hir).into_iter().filter_map(|b| String::from_utf8(b).ok()).collect(),
        Err(_) => Vec::new(), // a regex being typed: no search runs anyway
    }
}

/// The literals every match of `hir` holds: a concatenation's runs of literal characters and what its parts require;
/// a group or a repetition done at least once, its part's. An alternative, a class, an optional part require nothing
/// (sound, not complete: missing a literal only narrows less).
fn required(hir: &regex_syntax::hir::Hir) -> Vec<Vec<u8>> {
    use regex_syntax::hir::HirKind;
    match hir.kind() {
        HirKind::Literal(l) => vec![l.0.to_vec()],
        HirKind::Capture(c) => required(&c.sub),
        HirKind::Repetition(r) if r.min >= 1 => required(&r.sub),
        HirKind::Concat(parts) => {
            let mut out = Vec::new();
            let mut run: Vec<u8> = Vec::new();
            for p in parts {
                match p.kind() {
                    HirKind::Literal(l) => run.extend_from_slice(&l.0),
                    _ => {
                        out.extend((!run.is_empty()).then(|| std::mem::take(&mut run)));
                        out.extend(required(p));
                    }
                }
            }
            out.extend((!run.is_empty()).then_some(run));
            out
        }
        _ => Vec::new(),
    }
}

/// A file's size and modified time (ns since 1970): what tells the segment's copy from the file now.
type Stamp = (u64, u64);

fn stamp(meta: &std::fs::Metadata) -> Stamp {
    let ns = meta.modified().ok().and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok()).map_or(0, |d| d.as_nanos() as u64);
    (meta.len(), ns)
}

/// A loaded segment: its documents and dictionary in memory, its postings read on demand.
pub struct Segment {
    paths: Vec<String>,
    stamps: Vec<Stamp>,
    by_path: HashMap<String, u32>,
    /// (trigram, offset in the postings, byte length), sorted by trigram.
    dict: Vec<(u32, u32, u32)>,
    file: File,
    postings: u64,
}

impl Segment {
    /// The segment in `path`; `None` when it is missing, older, cut short or inconsistent.
    pub fn open(path: &Path) -> Option<Segment> {
        let file = File::open(path).ok()?;
        let len = file.metadata().ok()?.len();
        let mut h = [0u8; HEADER];
        read_at(&file, 0, &mut h).ok()?;
        let u32_at = |i: usize| u32::from_le_bytes(h[i..i + 4].try_into().unwrap());
        let u64_at = |i: usize| u64::from_le_bytes(h[i..i + 8].try_into().unwrap());
        if &h[..4] != MAGIC || u32_at(4) != VERSION {
            return None;
        }
        let (ndocs, ntri) = (u32_at(8) as usize, u32_at(12) as usize);
        let (docs_at, dict_at, post_at, end) = (u64_at(16), u64_at(24), u64_at(32), u64_at(40));
        if !(HEADER as u64 <= docs_at && docs_at <= dict_at && dict_at <= post_at && post_at <= end && end == len) || dict_at + ntri as u64 * 12 != post_at {
            return None;
        }
        let mut docs = vec![0u8; (dict_at - docs_at) as usize];
        read_at(&file, docs_at, &mut docs).ok()?;
        let (mut paths, mut stamps) = (Vec::with_capacity(ndocs), Vec::with_capacity(ndocs));
        let mut r = &docs[..];
        for _ in 0..ndocs {
            let n = u32::from_le_bytes(r.get(..4)?.try_into().ok()?) as usize;
            let path = std::str::from_utf8(r.get(4..4 + n)?).ok()?.to_string();
            let rest = r.get(4 + n..4 + n + 16)?;
            stamps.push((u64::from_le_bytes(rest[..8].try_into().ok()?), u64::from_le_bytes(rest[8..].try_into().ok()?)));
            paths.push(path);
            r = &r[4 + n + 16..];
        }
        if !r.is_empty() {
            return None;
        }
        let mut raw = vec![0u8; ntri * 12];
        read_at(&file, dict_at, &mut raw).ok()?;
        let room = end - post_at;
        let mut dict = Vec::with_capacity(ntri);
        for e in raw.chunks_exact(12) {
            let w = |i: usize| u32::from_le_bytes(e[i..i + 4].try_into().unwrap());
            let (t, off, n) = (w(0), w(4), w(8));
            if off as u64 + n as u64 > room || dict.last().is_some_and(|&(p, _, _)| p >= t) {
                return None;
            }
            dict.push((t, off, n));
        }
        let by_path = paths.iter().enumerate().map(|(i, p)| (p.clone(), i as u32)).collect();
        Some(Segment { paths, stamps, by_path, dict, file, postings: post_at })
    }

    pub fn len(&self) -> usize {
        self.paths.len()
    }

    pub fn is_empty(&self) -> bool {
        self.paths.is_empty()
    }

    /// The documents that may contain every one of `literals` (folded here), as a set over ids; `None` when the
    /// literals are too short to narrow (under three bytes) or a posting list cannot be read.
    fn candidates(&self, literals: &[String]) -> Option<Vec<bool>> {
        let mut wanted: Vec<u32> = literals.iter().flat_map(|l| trigrams(fold(l).as_bytes())).collect();
        wanted.sort_unstable();
        wanted.dedup();
        if wanted.is_empty() {
            return None;
        }
        let mut lists = Vec::with_capacity(wanted.len());
        for t in wanted {
            match self.dict.binary_search_by_key(&t, |e| e.0) {
                Ok(i) => lists.push(self.dict[i]),
                Err(_) => return Some(vec![false; self.len()]), // no file holds it
            }
        }
        lists.sort_by_key(|e| e.2);
        let mut ids: Option<Vec<u32>> = None;
        for &(_, off, n) in lists.iter().take(MAX_LISTS) {
            let next = self.postings(off, n)?;
            ids = Some(match ids {
                None => next,
                Some(have) => intersect(&have, &next),
            });
            if ids.as_ref().is_some_and(Vec::is_empty) {
                break;
            }
        }
        let mut set = vec![false; self.len()];
        for id in ids? {
            set[id as usize] = true;
        }
        Some(set)
    }

    /// One trigram's document ids; `None` on a read error or an id past the documents (a damaged file).
    fn postings(&self, off: u32, n: u32) -> Option<Vec<u32>> {
        let mut buf = vec![0u8; n as usize];
        read_at(&self.file, self.postings + off as u64, &mut buf).ok()?;
        let mut ids = Vec::with_capacity(buf.len());
        let (mut last, mut cur, mut shift) = (0u32, 0u32, 0u32);
        for b in buf {
            cur |= ((b & 0x7f) as u32).checked_shl(shift)?;
            if b & 0x80 != 0 {
                shift += 7;
                continue;
            }
            last = last.checked_add(cur)?;
            if last as usize >= self.len() {
                return None;
            }
            ids.push(last);
            (cur, shift) = (0, 0);
        }
        Some(ids)
    }
}

fn intersect(a: &[u32], b: &[u32]) -> Vec<u32> {
    let (mut i, mut j, mut out) = (0, 0, Vec::new());
    while i < a.len() && j < b.len() {
        match a[i].cmp(&b[j]) {
            std::cmp::Ordering::Less => i += 1,
            std::cmp::Ordering::Greater => j += 1,
            std::cmp::Ordering::Equal => {
                out.push(a[i]);
                i += 1;
                j += 1;
            }
        }
    }
    out
}

fn read_at(f: &File, off: u64, buf: &mut [u8]) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::FileExt;
        f.read_exact_at(buf, off)
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileExt;
        let mut n = 0;
        while n < buf.len() {
            match f.seek_read(&mut buf[n..], off + n as u64)? {
                0 => return Err(io::ErrorKind::UnexpectedEof.into()),
                k => n += k,
            }
        }
        Ok(())
    }
}

/// The files a segment of this vault covers now, as (absolute, relative): the notes the link index lists (the
/// agent's too: search filters them itself) and the PDFs' cached texts, each at most search's size limit.
fn covered_files(root: &Path, cfg: &Config) -> Vec<(PathBuf, String)> {
    let index = crate::links::snapshot(root, cfg);
    let notes = index.files().iter().filter(|rel| covers(rel)).map(|rel| (root.join(rel), rel.clone()));
    let pdfs = walkdir::WalkDir::new(root.join(crate::pdf_text::CACHE)).into_iter().filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()).filter_map(|e| {
        let rel = crate::paths::rel_path(root, e.path())?;
        Some((e.into_path(), rel))
    });
    notes.chain(pdfs).collect()
}

/// What the confirmation pass matches in this file, folded: a note's searchable text, any other file as it is.
fn indexed_text(abs: &Path, rel: &str) -> io::Result<String> {
    let bytes = std::fs::read(abs)?;
    let text = String::from_utf8_lossy(&bytes);
    Ok(if rel.starts_with(crate::pdf_text::CACHE) { fold(&text) } else { fold(&crate::search_text::searchable(&text)) })
}

/// What a build did, for its log line.
#[derive(Debug, Default)]
pub struct Built {
    pub files: usize,
    pub text_bytes: u64,
    pub index_bytes: u64,
    pub trigrams: usize,
}

/// A segment of `files` written to `out` (beside it, then renamed over). A file that cannot be read is left out: it
/// is then not in the segment, so search reads it directly.
pub fn build(files: &[(PathBuf, String)], out: &Path) -> io::Result<Built> {
    let mut paths: Vec<&str> = Vec::new();
    let mut stamps: Vec<Stamp> = Vec::new();
    // per trigram: the last id added and the postings so far, already delta-encoded
    let mut lists: HashMap<u32, (u32, Vec<u8>), TrigramHash> = HashMap::default();
    // a file's trigrams each once: a bit per possible trigram (2 MB), cleared after each file by its own list
    let mut seen = vec![0u64; 1 << 18];
    let mut fresh: Vec<u32> = Vec::new();
    let mut text_bytes = 0u64;
    for (abs, rel) in files {
        let Ok(meta) = std::fs::metadata(abs) else { continue };
        if meta.len() > crate::search::MAX_FILE {
            continue;
        }
        let Ok(text) = indexed_text(abs, rel) else { continue };
        let id = paths.len() as u32;
        paths.push(rel);
        stamps.push(stamp(&meta));
        text_bytes += meta.len();
        for w in text.as_bytes().windows(3) {
            let t = (w[0] as u32) << 16 | (w[1] as u32) << 8 | w[2] as u32;
            let (word, bit) = ((t >> 6) as usize, 1u64 << (t & 63));
            if seen[word] & bit == 0 {
                seen[word] |= bit;
                fresh.push(t);
            }
        }
        for t in fresh.drain(..) {
            seen[(t >> 6) as usize] = 0;
            let (last, buf) = lists.entry(t).or_insert((0, Vec::new()));
            let gap = if buf.is_empty() { id } else { id - *last };
            leb128(gap, buf);
            *last = id;
        }
    }
    let mut dict: Vec<(u32, Vec<u8>)> = lists.into_iter().map(|(t, (_, b))| (t, b)).collect();
    dict.sort_unstable_by_key(|e| e.0);

    let mut docs = Vec::new();
    for (p, (size, ns)) in paths.iter().zip(&stamps) {
        docs.extend((p.len() as u32).to_le_bytes());
        docs.extend(p.as_bytes());
        docs.extend(size.to_le_bytes());
        docs.extend(ns.to_le_bytes());
    }
    let (docs_at, dict_at) = (HEADER as u64, (HEADER + docs.len()) as u64);
    let post_at = dict_at + dict.len() as u64 * 12;
    let mut table = Vec::with_capacity(dict.len() * 12);
    let mut off = 0u64;
    for (t, b) in &dict {
        let start = u32::try_from(off).map_err(|_| io::Error::other("postings over 4 GB"))?;
        table.extend(t.to_le_bytes());
        table.extend(start.to_le_bytes());
        table.extend((b.len() as u32).to_le_bytes());
        off += b.len() as u64;
    }
    let end = post_at + off;
    let mut head = Vec::with_capacity(HEADER);
    head.extend(MAGIC);
    head.extend(VERSION.to_le_bytes());
    head.extend((paths.len() as u32).to_le_bytes());
    head.extend((dict.len() as u32).to_le_bytes());
    for v in [docs_at, dict_at, post_at, end] {
        head.extend(v.to_le_bytes());
    }

    if let Some(dir) = out.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = temp_beside(out);
    {
        let mut w = io::BufWriter::new(File::create(&tmp)?);
        w.write_all(&head)?;
        w.write_all(&docs)?;
        w.write_all(&table)?;
        for (_, b) in &dict {
            w.write_all(b)?;
        }
        w.into_inner().map_err(|e| e.into_error())?.sync_all()?;
    }
    std::fs::rename(&tmp, out)?;
    Ok(Built { files: paths.len(), text_bytes, index_bytes: end, trigrams: dict.len() })
}

/// Trigrams are already well spread 24-bit keys: one multiplication hashes them (SipHash took most of a build).
#[derive(Default, Clone, Copy)]
struct TrigramHash;
impl std::hash::BuildHasher for TrigramHash {
    type Hasher = TrigramHasher;
    fn build_hasher(&self) -> TrigramHasher {
        TrigramHasher(0)
    }
}
struct TrigramHasher(u64);
impl std::hash::Hasher for TrigramHasher {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.0 = (self.0 << 8 | b as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
        }
    }
    fn write_u32(&mut self, n: u32) {
        // the product's high bits folded down: the table indexes by the low ones
        let h = (n as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
        self.0 = h ^ (h >> 29);
    }
}

/// A temporary name beside `out`, unique to this write: two writers (a background rebuild and a direct one) never
/// rename each other's file away.
pub(crate) fn temp_beside(out: &Path) -> PathBuf {
    static N: AtomicUsize = AtomicUsize::new(0);
    let name = out.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    out.with_file_name(format!("{name}.{}-{}.tmp", std::process::id(), N.fetch_add(1, Relaxed)))
}

fn leb128(mut v: u32, out: &mut Vec<u8>) {
    while v >= 0x80 {
        out.push((v as u8) | 0x80);
        v >>= 7;
    }
    out.push(v as u8);
}

/// Each vault's segment as last loaded, with the file's modified time it was loaded at (another process — the CLI, a
/// second window's core — may have rebuilt it). `None`: none on disk, or a bad one.
static SEGMENTS: LazyLock<Mutex<HashMap<PathBuf, (Option<SystemTime>, Option<Arc<Segment>>)>>> = LazyLock::new(Default::default);

/// This vault's segment, reloaded when its file changed.
fn segment(root: &Path) -> Option<Arc<Segment>> {
    let path = root.join(FILE);
    let at = std::fs::metadata(&path).and_then(|m| m.modified()).ok();
    let mut all = SEGMENTS.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((was, seg)) = all.get(root) {
        if *was == at {
            return seg.clone();
        }
    }
    let seg = at.and_then(|_| Segment::open(&path)).map(Arc::new);
    all.insert(root.to_path_buf(), (at, seg.clone()));
    seg
}

/// One build at a time, whatever the vault; each vault's last start.
static BUILDING: AtomicBool = AtomicBool::new(false);
static LAST_BUILD: LazyLock<Mutex<HashMap<PathBuf, Instant>>> = LazyLock::new(Default::default);

/// A new segment for this vault built on a low-priority thread, unless one is being built or this vault's last build
/// started under [`REBUILD_GAP`] ago. Search goes on without waiting (the overlay covers what the old one lacks).
pub fn rebuild_in_background(root: &Path, cfg: &Config) {
    {
        let mut last = LAST_BUILD.lock().unwrap_or_else(|e| e.into_inner());
        if last.get(root).is_some_and(|t| t.elapsed() < REBUILD_GAP) || BUILDING.swap(true, Relaxed) {
            return;
        }
        last.insert(root.to_path_buf(), Instant::now());
    }
    let (root, cfg) = (root.to_path_buf(), cfg.clone());
    let spawned = std::thread::Builder::new().name("search-index".into()).spawn(move || {
        crate::links::lowest_priority();
        let t = Instant::now();
        let files = covered_files(&root, &cfg);
        match build(&files, &root.join(FILE)) {
            Ok(b) => eprintln!(
                "atlas: search index of {}: {} files, {} MB of text → {} MB, {} trigrams, in {:.1?}",
                root.display(), b.files, b.text_bytes >> 20, b.index_bytes >> 20, b.trigrams, t.elapsed()
            ),
            Err(e) => eprintln!("atlas: search index of {} not built: {e}", root.display()),
        }
        BUILDING.store(false, Relaxed);
    });
    if spawned.is_err() {
        BUILDING.store(false, Relaxed);
    }
}

/// One search's use of the index: which covered files may match. Files it does not cover, or whose size or modified
/// time differ from the segment's (the *overlay*), are always kept; [`Narrow::settle`] starts a rebuild when the
/// overlay has grown.
pub struct Narrow {
    seg: Option<Arc<Segment>>,
    /// Over the segment's ids; `None`: every covered file may match (a short query, no literal in a regex).
    hits: Option<Vec<bool>>,
    stale: AtomicUsize,
}

impl Narrow {
    /// The narrowing of the query `q` (a regex when `regex`) by this vault's segment.
    pub fn of(root: &Path, q: &str, regex: bool) -> Narrow {
        let seg = segment(root);
        let hits = seg.as_ref().and_then(|s| s.candidates(&literals(q, regex)));
        Narrow { seg, hits, stale: AtomicUsize::new(0) }
    }

    /// Whether the file at `abs` (`rel` in the vault) is to be read.
    pub fn keeps(&self, abs: &Path, rel: &str) -> bool {
        let Some(seg) = &self.seg else { return true };
        if !covers(rel) {
            return true;
        }
        let current = std::fs::metadata(abs).map(|m| stamp(&m)).ok();
        match seg.by_path.get(rel) {
            Some(&id) if current == Some(seg.stamps[id as usize]) => self.hits.as_ref().is_none_or(|h| h[id as usize]),
            _ => {
                self.stale.fetch_add(1, Relaxed);
                true
            }
        }
    }

    /// After the files were chosen: a rebuild when there is no segment yet or the overlay outgrew it.
    pub fn settle(&self, root: &Path, cfg: &Config) {
        let stale = self.stale.load(Relaxed);
        let due = match &self.seg {
            None => true,
            Some(s) => stale >= STALE_FILES || stale * STALE_SHARE >= s.len().max(1),
        };
        if due {
            rebuild_in_background(root, cfg);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault(files: &[(&str, &str)]) -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        for (rel, text) in files {
            let p = d.path().join(rel);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, text).unwrap();
        }
        d
    }

    fn all(root: &Path) -> Vec<(PathBuf, String)> {
        let mut v: Vec<_> = walkdir::WalkDir::new(root).into_iter().filter_map(|e| e.ok()).filter(|e| e.file_type().is_file())
            .filter_map(|e| { let rel = crate::paths::rel_path(root, e.path())?; covers(&rel).then(|| (e.into_path(), rel)) }).collect();
        v.sort();
        v
    }

    /// The files [`Narrow`] lets through for `q`.
    fn kept(root: &Path, q: &str, regex: bool) -> Vec<String> {
        let n = Narrow::of(root, q, regex);
        all(root).into_iter().filter(|(abs, rel)| n.keeps(abs, rel)).map(|(_, rel)| rel).collect()
    }

    /// A small deterministic generator (no test dependency for one property test).
    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            self.0
        }
        fn pick<'a>(&mut self, xs: &[&'a str]) -> &'a str {
            xs[(self.next() % xs.len() as u64) as usize]
        }
    }

    /// The property the index stands on: every file whose text holds the query (as search matches it: smart case,
    /// its words not its HTML) is kept. Random notes of mixed-case, accented and Greek words, every substring of
    /// their lines asked for.
    #[test]
    fn no_file_holding_the_query_is_ever_left_out() {
        let words = ["Hubbard", "lattice", "DMFT", "café", "Ωmega", "σigma", "ſtraße", "naïve", "<b>bold</b>", "&amp;", "x", "Ünïcode", "spin-orbit"];
        let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
        let mut files = Vec::new();
        for i in 0..40 {
            let text: String = (0..30).map(|k| format!("{}{}", rng.pick(&words), if k % 7 == 6 { "\n" } else { " " })).collect();
            files.push((format!("notes/n{i}.md"), text));
        }
        let refs: Vec<(&str, &str)> = files.iter().map(|(a, b)| (a.as_str(), b.as_str())).collect();
        let d = vault(&refs);
        let r = d.path();
        let b = build(&all(r), &r.join(FILE)).unwrap();
        assert_eq!(b.files, 40);
        let mut narrowed = 0;
        for _ in 0..400 {
            let (_, text) = &files[(rng.next() % 40) as usize];
            let shown = crate::search_text::searchable(text).into_owned();
            let line = shown.lines().nth((rng.next() % 4) as usize).unwrap_or("");
            let chars: Vec<char> = line.chars().collect();
            if chars.len() < 2 {
                continue;
            }
            let a = (rng.next() as usize) % (chars.len() - 1);
            let z = a + 1 + (rng.next() as usize) % (chars.len() - a - 1).min(12).max(1);
            let q: String = chars[a..z.min(chars.len())].iter().collect();
            if q.trim().is_empty() {
                continue;
            }
            let m = crate::search::matcher(&q, crate::search::Opts::default()).unwrap();
            let holding: Vec<String> = files.iter().filter(|(_, t)| m.is_match(&crate::search_text::searchable(t))).map(|(p, _)| p.clone()).collect();
            let got = kept(r, &q, false);
            for f in &holding {
                assert!(got.contains(f), "{f} holds {q:?} but was left out");
            }
            narrowed += (got.len() < files.len()) as usize;
        }
        assert!(narrowed > 100, "the index narrows most searches (did {narrowed})");
    }

    #[test]
    fn a_query_narrows_to_the_files_with_its_trigrams() {
        let d = vault(&[("a.md", "The Hubbard model\n"), ("b.md", "lattice gauge\n"), ("c.md", "<a href=\"hubbard.example\">link</a>\n")]);
        let r = d.path();
        build(&all(r), &r.join(FILE)).unwrap();
        assert_eq!(kept(r, "hubbard", false), ["a.md"], "c.md's address is markup, not a word");
        assert_eq!(kept(r, "HUBBARD", false), ["a.md"]);
        assert_eq!(kept(r, "zzz", false), Vec::<String>::new());
        assert_eq!(kept(r, "la", false).len(), 3, "under three bytes: no narrowing");
        assert_eq!(kept(r, r"hub+ard\s+model", true), ["a.md"], "a regex's literals narrow");
        assert_eq!(kept(r, "hubbard|lattice", true).len(), 3, "an alternative: no narrowing (sound, not complete)");
    }

    #[test]
    fn new_and_changed_files_are_read_until_the_next_build() {
        let d = vault(&[("a.md", "alpha\n"), ("b.md", "beta\n")]);
        let r = d.path();
        build(&all(r), &r.join(FILE)).unwrap();
        assert_eq!(kept(r, "gamma", false), Vec::<String>::new());
        std::thread::sleep(Duration::from_millis(20));
        std::fs::write(r.join("b.md"), "beta gamma\n").unwrap();
        std::fs::write(r.join("c.md"), "nothing\n").unwrap();
        let n = Narrow::of(r, "gamma", false);
        let got: Vec<_> = all(r).into_iter().filter(|(a, rel)| n.keeps(a, rel)).map(|(_, rel)| rel).collect();
        assert_eq!(got, ["b.md", "c.md"], "the overlay: changed and new files are read");
        assert_eq!(n.stale.load(Relaxed), 2);
        std::fs::remove_file(r.join("a.md")).unwrap();
        assert_eq!(kept(r, "alpha", false), ["b.md", "c.md"], "a deleted file is simply not listed; the overlay still read");
        // rebuilt: the new segment is picked up (its file changed) and knows them
        build(&all(r), &r.join(FILE)).unwrap();
        let n = Narrow::of(r, "gamma", false);
        assert_eq!(all(r).into_iter().filter(|(a, rel)| n.keeps(a, rel)).map(|(_, rel)| rel).collect::<Vec<_>>(), ["b.md"]);
        assert_eq!(n.stale.load(Relaxed), 0);
    }

    #[test]
    fn a_damaged_or_older_segment_is_ignored() {
        let d = vault(&[("a.md", "alpha beta gamma\n"), ("b.md", "delta\n")]);
        let r = d.path();
        let path = r.join(FILE);
        build(&all(r), &path).unwrap();
        assert!(Segment::open(&path).is_some());
        let good = std::fs::read(&path).unwrap();
        let mut older = good.clone();
        older[4] = 0;
        std::fs::write(&path, &older).unwrap();
        assert!(Segment::open(&path).is_none(), "another version");
        std::fs::write(&path, &good[..good.len() - 1]).unwrap();
        assert!(Segment::open(&path).is_none(), "cut short");
        std::fs::write(&path, b"ATSI").unwrap();
        assert!(Segment::open(&path).is_none());
        // with no usable segment, nothing is narrowed: search reads every file as before
        assert_eq!(kept(r, "delta", false).len(), 2);
    }

    #[test]
    fn folding_matches_the_searchs_case_rules() {
        assert_eq!(fold("ΣΑΣ ſ Straße K"), "σασ s straße k");
        assert_eq!(fold("ς"), fold("Σ"));
        let lit = |q: &str| literals(q, true);
        assert_eq!(lit("foo.*bar"), ["foo", "bar"]);
        assert_eq!(lit("(hello)+ world"), ["hello", " world"]);
        assert_eq!(lit("x?yz"), ["yz"]);
        assert!(lit("a|b").is_empty());
        assert!(lit("[abc]+").is_empty());
    }

    /// On a real vault (read-only: the segment is written to a temporary folder): the index's size against the text,
    /// how long a build takes, and what a query narrows to and costs. `ATLAS_TEST_VAULT=… cargo test … -- --ignored`.
    #[test]
    #[ignore]
    fn measured_on_a_real_vault() {
        let Ok(root) = std::env::var("ATLAS_TEST_VAULT") else { return eprintln!("skipped: ATLAS_TEST_VAULT is unset") };
        let root = Path::new(&root);
        let cfg = Config::load(root).unwrap();
        let files = covered_files(root, &cfg);
        let out = tempfile::tempdir().unwrap();
        let path = out.path().join("trigrams.idx");
        let t = Instant::now();
        let b = build(&files, &path).unwrap();
        eprintln!("BUILD {} files, {} MB text → {} MB index ({:.0} %), {} trigrams, {:.1?}",
            b.files, b.text_bytes >> 20, b.index_bytes >> 20, b.index_bytes as f64 * 100.0 / b.text_bytes.max(1) as f64, b.trigrams, t.elapsed());
        let t = Instant::now();
        let seg = Segment::open(&path).unwrap();
        eprintln!("OPEN {:.1?}", t.elapsed());
        for q in ["zzqx", "hubbard", "the", "self-energy", "Green's function", "ab"] {
            let t = Instant::now();
            let c = seg.candidates(&literals(q, false));
            let n = c.as_ref().map_or(seg.len(), |c| c.iter().filter(|&&x| x).count());
            eprintln!("QUERY {q:>18}: {n:>5} of {} candidates, {:.2?}", seg.len(), t.elapsed());
        }
    }
}
