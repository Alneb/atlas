//! The note index's parses kept on disk (docs/design/DESIGN-search-index.md §5): each note's properties, links, tags
//! and words with the size and modified time they were read at, in `.atlas/cache/search/notes.idx`. A start loads it
//! and reads again only the notes whose size or time differ — seconds of reading every note become milliseconds. A
//! cache: a missing, older or damaged file is ignored (every note is read, as before) and written again.
//!
//! ```text
//! "ATNI" · format version (u32) · the core's version (string) · notes (u32)
//! per note: path · size (u64) · modified, created (u64 ns since 1970, 0 = unknown)
//!           properties as YAML (string) · tags (u32 count, strings) · words (u32 count, u64s)
//!           links (u32 count; each: target · flags u8 (1 wiki, 2 embed, 4 has a relation) · line u32 · context · relation?)
//! strings: u32 byte length, UTF-8
//! ```
//! Written through vault_write::cache (beside, then renamed over); a save runs on a lowest-priority thread, at most one at a time per vault.

use super::{FileCache, Index, Parsed, RawLink};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering::Relaxed};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant, SystemTime};

pub const FILE: &str = ".atlas/cache/search/notes.idx";
const MAGIC: &[u8; 4] = b"ATNI";
/// Raised whenever what a note's parse holds, or how it is read, changes. The core's version is checked as well, so a
/// release never trusts another release's parses.
const VERSION: u32 = 1;
/// A vault's index is saved at most this often (each change is a rebuild; what a save misses, the next start reads).
const SAVE_GAP: Duration = Duration::from_secs(20);

/// The parses kept for `root`; empty when there is no usable file.
pub fn load(root: &Path) -> FileCache {
    std::fs::read(root.join(FILE)).ok().and_then(|b| decode(&b)).unwrap_or_default()
}

/// `index`'s parses written for the next start, on a background thread — unless one is being written for this vault
/// or the last started under [`SAVE_GAP`] ago.
/// A background save is under way ([`save_in_background`]: one at a time, for every vault).
static SAVING: AtomicBool = AtomicBool::new(false);

/// Waits until no background save is under way — for a test that writes the file itself right after a build (the
/// build's save, at the lowest priority, could otherwise land after it and put the build's parses back).
#[cfg(test)]
pub fn settle() {
    while SAVING.load(Relaxed) {
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
}

pub fn save_in_background(root: &Path, index: Arc<Index>) {
    static LAST: LazyLock<Mutex<Vec<(PathBuf, Instant)>>> = LazyLock::new(Default::default);
    {
        let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
        if last.iter().any(|(r, at)| r == root && at.elapsed() < SAVE_GAP) || SAVING.swap(true, Relaxed) {
            return;
        }
        last.retain(|(r, _)| r != root);
        last.push((root.to_path_buf(), Instant::now()));
    }
    let root = root.to_path_buf();
    let spawned = std::thread::Builder::new().name("note-index-save".into()).spawn(move || {
        super::lowest_priority();
        if let Err(e) = save(&root, &index.parsed) {
            eprintln!("atlas: note index of {} not saved: {e}", root.display());
        }
        SAVING.store(false, Relaxed);
    });
    if spawned.is_err() {
        SAVING.store(false, Relaxed);
    }
}

pub fn save(root: &Path, parsed: &FileCache) -> std::io::Result<()> {
    crate::vault_write::cache::write(&root.join(FILE), &encode(parsed)).map_err(std::io::Error::other)
}

fn ns(t: Option<SystemTime>) -> u64 {
    t.and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok()).map_or(0, |d| d.as_nanos() as u64)
}

fn time(ns: u64) -> Option<SystemTime> {
    (ns != 0).then(|| SystemTime::UNIX_EPOCH + Duration::from_nanos(ns))
}

struct Out(Vec<u8>);

impl Out {
    fn u32(&mut self, v: u32) {
        self.0.extend(v.to_le_bytes());
    }
    fn u64(&mut self, v: u64) {
        self.0.extend(v.to_le_bytes());
    }
    fn str(&mut self, s: &str) {
        self.u32(s.len() as u32);
        self.0.extend(s.as_bytes());
    }
}

pub(super) fn encode(parsed: &FileCache) -> Vec<u8> {
    let mut o = Out(Vec::with_capacity(parsed.len() * 2048));
    o.0.extend(MAGIC);
    o.u32(VERSION);
    o.str(env!("CARGO_PKG_VERSION"));
    o.u32(parsed.len() as u32);
    for (path, p) in parsed {
        o.str(path);
        o.u64(p.size);
        o.u64(ns(p.mtime));
        o.u64(ns(p.ctime));
        let props: serde_yaml::Mapping = p.props.iter().map(|(k, v)| (serde_yaml::Value::String(k.to_string()), v.clone())).collect();
        o.str(&if props.is_empty() { String::new() } else { serde_yaml::to_string(&props).unwrap_or_default() });
        o.u32(p.tags.len() as u32);
        for t in &p.tags {
            o.str(t);
        }
        o.u32(p.words.bits().len() as u32);
        for &w in p.words.bits() {
            o.u64(w);
        }
        o.u32(p.links.len() as u32);
        for l in &p.links {
            o.str(&l.target);
            o.0.push(l.wiki as u8 | (l.embed as u8) << 1 | (l.relation.is_some() as u8) << 2);
            o.u32(l.line);
            o.str(&l.context);
            if let Some(r) = &l.relation {
                o.str(r);
            }
        }
    }
    o.0
}

struct In<'a>(&'a [u8]);

impl<'a> In<'a> {
    fn take(&mut self, n: usize) -> Option<&'a [u8]> {
        let (a, b) = (self.0.get(..n)?, self.0.get(n..)?);
        self.0 = b;
        Some(a)
    }
    fn u8(&mut self) -> Option<u8> {
        Some(self.take(1)?[0])
    }
    fn u32(&mut self) -> Option<u32> {
        Some(u32::from_le_bytes(self.take(4)?.try_into().ok()?))
    }
    fn u64(&mut self) -> Option<u64> {
        Some(u64::from_le_bytes(self.take(8)?.try_into().ok()?))
    }
    fn str(&mut self) -> Option<&'a str> {
        let n = self.u32()? as usize;
        std::str::from_utf8(self.take(n)?).ok()
    }
    /// A count, refused when it could not fit in what is left (a damaged file must not allocate gigabytes).
    fn count(&mut self, each: usize) -> Option<usize> {
        let n = self.u32()? as usize;
        (n.saturating_mul(each) <= self.0.len()).then_some(n)
    }
}

pub(super) fn decode(bytes: &[u8]) -> Option<FileCache> {
    let mut i = In(bytes);
    if i.take(4)? != MAGIC || i.u32()? != VERSION || i.str()? != env!("CARGO_PKG_VERSION") {
        return None;
    }
    let n = i.count(4)?;
    let mut out = FileCache::with_capacity(n);
    for _ in 0..n {
        let path = i.str()?.to_string();
        let (size, mtime, ctime) = (i.u64()?, time(i.u64()?), time(i.u64()?));
        let yaml = i.str()?;
        let props: serde_yaml::Mapping = if yaml.is_empty() { Default::default() } else { serde_yaml::from_str(yaml).ok()? };
        let tags = (0..i.count(4)?).map(|_| i.str().map(String::from)).collect::<Option<Vec<_>>>()?;
        let words = (0..i.count(8)?).map(|_| i.u64()).collect::<Option<Box<[u64]>>>()?;
        let links = (0..i.count(13)?)
            .map(|_| {
                let target = i.str()?.to_string();
                let flags = i.u8()?;
                let line = i.u32()?;
                let context = i.str()?.to_string();
                let relation = if flags & 4 != 0 { Some(i.str()?.to_string()) } else { None };
                Some(RawLink { target, wiki: flags & 1 != 0, embed: flags & 2 != 0, line, context, relation })
            })
            .collect::<Option<Vec<_>>>()?;
        let parsed = Parsed { links, props: props.into(), size, mtime, ctime, tags, words: crate::word_bloom::Words::from_bits(words) };
        out.insert(path, Arc::new(parsed));
    }
    i.0.is_empty().then_some(out)
}
