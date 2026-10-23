//! Whether a vault may have changed since a moment: what lets the note index (links.rs) skip its walk when nothing
//! did. A vault's watcher (events.rs) holds a [`Feed`]; every change it sees, and every write Atlas makes through
//! vault_write, moves the vault's generation on. A [`Stamp`] is only given while the watcher covers every folder the
//! walk enters, with the walk's own configuration — anything less, and the caller walks as before.
use crate::config::Config;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::SeqCst};
use std::sync::{Arc, RwLock};

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
}

impl Shared {
    fn changed(&self) {
        self.gen.store(NEXT.fetch_add(1, SeqCst), SeqCst);
    }
}

/// A watcher's side: made before its watches are added, [`Feed::register`]ed once they all are; unregistered on drop.
pub struct Feed(Arc<Shared>);

/// What the watcher's callback keeps to report a change.
#[derive(Clone)]
pub struct Bump(Arc<Shared>);

impl Bump {
    pub fn changed(&self) {
        self.0.changed();
    }
}

impl Feed {
    pub fn new(root: &Path, cfg: &Config) -> Self {
        let s = Shared {
            root: root.to_path_buf(),
            key: walk_key(cfg),
            gen: AtomicU64::new(0),
            whole: AtomicBool::new(true),
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
    for s in FEEDS.read().unwrap_or_else(|e| e.into_inner()).iter().filter(|s| abs.starts_with(&s.root)) {
        s.changed();
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
        let mut other = cfg.clone();
        other.ignore.push("runs".into());
        assert_eq!(stamp(root, &other), None, "another configuration: the watcher's folders may not be the walk's");
        feed.missed();
        assert_eq!(stamp(root, &cfg), None, "a folder without its watch");
        drop(feed);
        assert_eq!(stamp(root, &cfg), None);
    }
}
