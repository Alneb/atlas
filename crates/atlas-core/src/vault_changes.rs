//! Whether a vault may have changed since a moment: what lets the note index (links.rs) skip its walk when nothing
//! did. A vault's watcher (events.rs) holds a [`Feed`]; every change it sees, and every write Atlas makes through
//! vault_write, moves the vault's generation on. A [`Stamp`] is only given while the watcher covers every folder the
//! walk enters, with the walk's own configuration — anything less, and the caller walks as before.
use crate::config::Config;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::SeqCst};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex, RwLock};

/// A vault's generation: equal stamps mean no change was seen in between. Drawn from one counter for every vault and
/// watcher, so a stamp of a stopped watcher never equals a later one's.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Stamp(u64);

static NEXT: AtomicU64 = AtomicU64::new(1);
static FEEDS: RwLock<Vec<Arc<Shared>>> = RwLock::new(Vec::new());

struct Shared {
    root: PathBuf,
    /// The configuration the watcher chose its folders with ([`walk_key`]).
    key: u64,
    gen: AtomicU64,
    /// Every folder got its watch (inotify's limit can refuse one: then this vault is never trusted).
    whole: AtomicBool,
    /// What the walk sees ([`walk::keep`]): a write Atlas makes elsewhere (a run's files in an ignored folder, its own
    /// cache) leaves the generation alone, or every such write would make the next index request walk the vault.
    walked: Config,
    /// Which paths each generation changed ([`since`]): what lets the index patch those paths instead of walking.
    log: Mutex<Log>,
}

/// The changed paths, generation by generation: `None` for a change whose paths are not known (a queue overflow, a
/// folder whose watch came after its files) — the index walks then. At most [`LOG_MAX`] entries; older ones drop off
/// and `floor` says from which generation on the log is whole.
struct Log {
    entries: VecDeque<(u64, Option<String>)>,
    floor: u64,
}

/// Enough for a burst of saves, a sync bringing a folder, a git checkout of a few hundred files; beyond, a walk.
const LOG_MAX: usize = 2048;

impl Shared {
    fn changed(&self) {
        self.moved(None);
    }

    fn changed_at(&self, rel: String) {
        self.moved(Some(rel));
    }

    fn moved(&self, rel: Option<String>) {
        let gen = NEXT.fetch_add(1, SeqCst);
        {
            let mut log = self.log.lock().unwrap_or_else(|e| e.into_inner());
            log.entries.push_back((gen, rel));
            while log.entries.len() > LOG_MAX {
                if let Some((g, _)) = log.entries.pop_front() {
                    log.floor = g;
                }
            }
        }
        // stored after the log has it: a stamp read now never misses its paths
        self.gen.store(gen, SeqCst);
    }
}

/// A watcher's side: made before its watches are added, [`Feed::register`]ed once they all are; unregistered on drop.
pub struct Feed(Arc<Shared>);

/// What the watcher's callback keeps to report a change.
#[derive(Clone)]
pub struct Bump(Arc<Shared>);

impl Bump {
    /// A change whose paths are not known (an error, an overflow): the next index request walks.
    pub fn changed(&self) {
        self.0.changed();
    }

    /// These paths (vault-relative, as the walk names them) changed: created, written, removed or renamed.
    pub fn changed_paths<I: IntoIterator<Item = String>>(&self, rels: I) {
        let mut any = false;
        for rel in rels {
            any = true;
            self.0.changed_at(rel);
        }
        if !any {
            self.0.changed();
        }
    }
}

impl Feed {
    pub fn new(root: &Path, cfg: &Config) -> Self {
        let s = Shared {
            root: root.to_path_buf(),
            key: walk_key(cfg),
            gen: AtomicU64::new(0),
            whole: AtomicBool::new(true),
            walked: cfg.clone(),
            log: Mutex::new(Log { entries: VecDeque::new(), floor: 0 }),
        };
        s.changed();
        Feed(Arc::new(s))
    }

    pub fn bump(&self) -> Bump {
        Bump(self.0.clone())
    }

    pub fn changed(&self) {
        self.0.changed();
    }

    /// A folder could not be watched: changes under it would go unseen.
    pub fn missed(&self) {
        self.0.whole.store(false, SeqCst);
    }

    /// The watches are all in place: from now on the generation speaks for the vault.
    pub fn register(&self) {
        self.0.changed();
        FEEDS.write().unwrap_or_else(|e| e.into_inner()).push(self.0.clone());
    }
}

impl Drop for Feed {
    fn drop(&mut self) {
        FEEDS.write().unwrap_or_else(|e| e.into_inner()).retain(|s| !Arc::ptr_eq(s, &self.0));
    }
}

/// Atlas changed `abs` itself (vault_write): told at once, not when the watcher's event arrives.
pub(crate) fn touched(abs: &Path) {
    let feeds = FEEDS.read().unwrap_or_else(|e| e.into_inner());
    for s in feeds.iter() {
        let Ok(rel) = abs.strip_prefix(&s.root) else { continue };
        let rel = rel.to_string_lossy().replace('\\', "/");
        if crate::walk::keep(&s.walked, &rel) {
            s.changed_at(rel);
        }
    }
}

/// `root`'s generation now — read before a walk, so a change during it shows as a new stamp. None when no complete
/// watcher with this configuration speaks for the vault.
pub(crate) fn stamp(root: &Path, cfg: &Config) -> Option<Stamp> {
    let key = walk_key(cfg);
    let feeds = FEEDS.read().unwrap_or_else(|e| e.into_inner());
    let s = feeds.iter().find(|s| s.root == root && s.key == key && s.whole.load(SeqCst))?;
    Some(Stamp(s.gen.load(SeqCst)))
}

/// The paths changed in `root` since `from` (a stamp read before an earlier walk), each once — or None when some
/// change since has no known paths, the log no longer reaches back that far, or no complete watcher speaks for the
/// vault: then only a walk can say.
pub(crate) fn since(root: &Path, cfg: &Config, from: Stamp) -> Option<Vec<String>> {
    let key = walk_key(cfg);
    let feeds = FEEDS.read().unwrap_or_else(|e| e.into_inner());
    let s = feeds.iter().find(|s| s.root == root && s.key == key && s.whole.load(SeqCst))?;
    let log = s.log.lock().unwrap_or_else(|e| e.into_inner());
    if from.0 < log.floor {
        return None;
    }
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for (_, rel) in log.entries.iter().filter(|(g, _)| *g > from.0) {
        let rel = rel.as_ref()?;
        if seen.insert(rel.as_str()) {
            out.push(rel.clone());
        }
    }
    Some(out)
}

/// What decides which files the walk and the index see: the ignore list, the agent's files, the templates folder.
fn walk_key(cfg: &Config) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    (&cfg.ignore, &cfg.editor.index_exclude, &cfg.notes.templates).hash(&mut h);
    h.finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_stamp_moves_with_every_change_and_only_a_whole_feed_gives_one() {
        let root = Path::new("/vault-changes-test");
        let cfg = Config::default();
        let feed = Feed::new(root, &cfg);
        assert_eq!(stamp(root, &cfg), None, "not registered yet: the watches are being added");
        feed.register();
        let a = stamp(root, &cfg).expect("registered");
        assert_eq!(stamp(root, &cfg), Some(a));
        touched(&root.join("notes/x.md"));
        let b = stamp(root, &cfg).unwrap();
        assert_ne!(a, b, "Atlas's own write");
        feed.bump().changed();
        assert_ne!(stamp(root, &cfg), Some(b), "the watcher's event");
        touched(Path::new("/elsewhere/x.md"));
        let c = stamp(root, &cfg);
        touched(&root.join(".atlas/cache/recent.json"));
        assert_eq!(stamp(root, &cfg), c, "a write the walk never sees (Atlas's cache) changes nothing for the index");
        let mut other = cfg.clone();
        other.ignore.push("runs".into());
        assert_eq!(stamp(root, &other), None, "another configuration: the watcher's folders may not be the walk's");
        let d = stamp(root, &cfg).unwrap();
        touched(&root.join("notes/y.md"));
        feed.bump().changed_paths(["notes/z.md".to_string(), "notes/y.md".to_string()]);
        assert_eq!(since(root, &cfg, d), Some(vec!["notes/y.md".to_string(), "notes/z.md".to_string()]), "each path once");
        let e = stamp(root, &cfg).unwrap();
        assert_eq!(since(root, &cfg, e), Some(vec![]), "nothing since");
        feed.bump().changed();
        assert_eq!(since(root, &cfg, e), None, "a change with no paths: only a walk can say");
        let f = stamp(root, &cfg).unwrap();
        for i in 0..LOG_MAX + 1 {
            touched(&root.join(format!("n{i}.md")));
        }
        assert_eq!(since(root, &cfg, f), None, "the log no longer reaches back");
        feed.missed();
        assert_eq!(stamp(root, &cfg), None, "a folder without its watch");
        drop(feed);
        assert_eq!(stamp(root, &cfg), None);
    }
}
