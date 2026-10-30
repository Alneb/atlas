//! Server → UI events: one broadcast bus, fed by commands (open/notify/focus) and the fs watcher.
use crate::api::Event;
use crate::config::Config;
use crate::{paths, walk, Error, Result};
use notify::event::ModifyKind;
use notify::{RecursiveMode, Watcher};
use std::collections::{BTreeSet, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::Duration;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct EventBus(broadcast::Sender<Event>, broadcast::Sender<Captured>, broadcast::Sender<Vec<String>>, broadcast::Sender<crate::api::Notice>);

/// A capture just written, from any door (the app, the phone, the desktop box, an agent): what the server's capture
/// hooks act on (capture_hooks.rs). A channel of its own, so a hook never counts as a UI listening on the bus.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Captured {
    pub text: String,
    pub path: String,
    pub line: u32,
}

impl Default for EventBus {
    fn default() -> Self {
        Self(broadcast::channel(256).0, broadcast::channel(64).0, broadcast::channel(256).0, broadcast::channel(64).0)
    }
}

impl EventBus {
    pub fn subscribe(&self) -> broadcast::Receiver<Event> {
        self.0.subscribe()
    }

    /// A capture was written: the file changed for the UI, and the capture hooks get it.
    pub fn captured(&self, c: Captured) {
        self.publish(Event::Fs { paths: vec![c.path.clone()] });
        let _ = self.1.send(c);
    }

    pub fn on_captured(&self) -> broadcast::Receiver<Captured> {
        self.1.subscribe()
    }

    /// The paths of every `Fs` event, for the core's own watchers (sync_merge.rs): a channel of its own, like captures.
    pub fn on_fs(&self) -> broadcast::Receiver<Vec<String>> {
        self.2.subscribe()
    }

    /// Every notice, for the system's notifications (notify.rs): a channel of its own, so the notifier never counts as
    /// a UI reached.
    pub fn on_notice(&self) -> broadcast::Receiver<crate::api::Notice> {
        self.3.subscribe()
    }

    /// Number of listeners reached; an error when no UI is connected, so `atlas open` can say so.
    pub fn emit(&self, ev: Event) -> Result<usize> {
        if let Event::Notify(n) = &ev {
            let _ = self.3.send(n.clone());
        }
        self.0.send(ev).map_err(|_| Error::CommandFailed("no Atlas UI is connected to receive it".into()))
    }

    /// Fire-and-forget (fs changes with nobody listening are not an error).
    pub fn publish(&self, ev: Event) {
        match &ev {
            Event::Fs { paths } => drop(self.2.send(paths.clone())),
            Event::Notify(n) => drop(self.3.send(n.clone())),
            _ => {}
        }
        let _ = self.0.send(ev);
    }
}

/// Watched like the walks see the tree, plus `.atlas/` (commands, config, plugins) but never its
/// cache or trash.
fn watchable(cfg: &Config, rel: &str) -> bool {
    // a save's temporary twin is renamed into place: the real path's own event follows
    if crate::files::is_write_tmp(rel) {
        return false;
    }
    if rel == ".atlas" || rel.starts_with(".atlas/") {
        return ![".atlas/cache", ".atlas/trash"].iter().any(|x| rel == *x || rel.starts_with(&format!("{x}/")));
    }
    walk::keep(cfg, rel)
}

/// `dir` and every folder under it: for `.atlas/`, which the walks skip as a dot-dir. Without this an
/// installed plugin's folder was never watched, so editing its main.js reloaded nothing.
fn all_dirs(root: &Path, cfg: &Config, dir: &Path, out: &mut Vec<PathBuf>) {
    out.push(dir.to_path_buf());
    for e in std::fs::read_dir(dir).into_iter().flatten().flatten() {
        let path = e.path();
        // pruned here, not only filtered later: the cache holds thousands of folders
        let keep = paths::rel_path(root, &path).is_some_and(|r| watchable(cfg, &r));
        if keep && e.file_type().is_ok_and(|t| t.is_dir()) {
            all_dirs(root, cfg, &path, out);
        }
    }
}

/// Stops the watcher thread on drop.
pub struct WatcherGuard(Arc<AtomicBool>);

impl Drop for WatcherGuard {
    fn drop(&mut self) {
        self.0.store(true, Ordering::Relaxed);
    }
}

/// Real changes only. inotify also reports *reads* (IN_OPEN / IN_CLOSE_NOWRITE → `Access`), and
/// reacting to those fed a loop: an event made the UI list directories, which reported every
/// listed directory as changed, forever (the "Files is very slow" bug).
fn is_change(kind: &notify::EventKind) -> bool {
    use notify::event::MetadataKind;
    use notify::EventKind as K;
    match kind {
        K::Create(_) | K::Remove(_) => true,
        K::Modify(ModifyKind::Metadata(MetadataKind::AccessTime)) => false,
        K::Modify(_) => true,
        K::Access(_) | K::Any | K::Other => false,
    }
}

/// The vault's root as given and as the OS reports it: macOS's FSEvents names files by their canonical path
/// (`/private/var/…` for a root under `/var`), so an event under either form is the vault's.
#[derive(Clone)]
struct Root {
    given: PathBuf,
    real: PathBuf,
}

impl Root {
    fn new(given: &Path) -> Self {
        Root { given: given.to_path_buf(), real: paths::real(given).unwrap_or_else(|_| given.to_path_buf()) }
    }
    fn rel(&self, p: &Path) -> Option<String> {
        paths::rel_path(&self.given, p).or_else(|| paths::rel_path(&self.real, p))
    }
}

/// Per-directory non-recursive watches, so ignored trees (`runs/`, `node_modules/`) never cost
/// inotify watches; new directories are picked up as they appear. Changes are batched for 250 ms.
pub fn spawn_watcher(root: &Path, cfg: Config, bus: EventBus) -> Result<WatcherGuard> {
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let root = root.to_path_buf();
    // the note index's change feed (vault_changes.rs): moved on in the callback itself, not after the 250 ms batch
    let feed = crate::vault_changes::Feed::new(&root, &cfg);
    let named = Root::new(&root);
    let (bump, cb_root, cb_cfg) = (feed.bump(), named.clone(), cfg.clone());
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let seen = |ev: &notify::Event| {
            is_change(&ev.kind)
                && ev.paths.iter().any(|p| cb_root.rel(p).is_some_and(|r| !r.is_empty() && watchable(&cb_cfg, &r)))
        };
        // an error or a queue overflow may hide a change: counted as one
        if res.as_ref().map_or(true, |ev| ev.need_rescan() || seen(ev)) {
            bump.changed();
        }
        let _ = tx.send(res);
    })
    .map_err(|e| Error::Other(e.into()))?;
    let mut watched: HashSet<PathBuf> = HashSet::new();
    if !add_tree(&root, &cfg, &root, &mut watched, &mut watcher) {
        feed.missed();
    }
    feed.register();
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    std::thread::Builder::new().name("atlas-watch".into()).spawn(move || {
        while !stop_thread.load(Ordering::Relaxed) {
            let first = match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(ev) => ev,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            };
            // batch: everything that arrives within 250 ms of the first event
            let mut batch = vec![first];
            let until = std::time::Instant::now() + Duration::from_millis(250);
            while let Some(left) = until.checked_duration_since(std::time::Instant::now()) {
                match rx.recv_timeout(left) {
                    Ok(ev) => batch.push(ev),
                    Err(_) => break,
                }
            }
            let (mut changed, mut gone) = (BTreeSet::new(), BTreeSet::new());
            for ev in batch {
                let ev = match ev {
                    Ok(ev) if is_change(&ev.kind) => ev,
                    Ok(_) => continue,
                    Err(e) => {
                        eprintln!("atlas: watcher error: {e}");
                        continue;
                    }
                };
                // Windows also reports a folder as modified when a file in it changes: the file's own event says it
                let touched = matches!(ev.kind, notify::EventKind::Modify(ModifyKind::Any | ModifyKind::Data(_) | ModifyKind::Metadata(_)));
                for path in ev.paths {
                    let Some(rel) = named.rel(&path) else { continue };
                    if rel.is_empty() || !watchable(&cfg, &rel) {
                        continue;
                    }
                    let path = root.join(&rel); // the root's own form, as `watched` and add_tree know it
                    if path.is_dir() {
                        if touched {
                            continue;
                        }
                        if !add_tree(&root, &cfg, &path, &mut watched, &mut watcher) {
                            feed.missed();
                        }
                        feed.changed(); // files may have arrived in it before its watch did
                    } else if !path.exists() {
                        // A removed dir loses its inotify watch; forget it so a re-created one is re-added.
                        watched.retain(|w| !w.starts_with(&path));
                        gone.insert(rel.clone());
                    }
                    changed.insert(rel);
                }
            }
            // still there at the end of the batch (deleted, then saved again): not gone
            gone.retain(|rel: &String| !root.join(rel).exists());
            if !changed.is_empty() {
                crate::git::files_changed(&root);
                if !gone.is_empty() {
                    bus.publish(Event::Gone { paths: gone.into_iter().collect() });
                }
                bus.publish(Event::Fs { paths: changed.into_iter().collect() });
            }
        }
        drop(watcher);
    })?;
    Ok(WatcherGuard(stop))
}

/// False when a folder could not be watched (inotify's limit).
fn add_tree(root: &Path, cfg: &Config, dir: &Path, watched: &mut HashSet<PathBuf>, w: &mut impl Watcher) -> bool {
    // walk::dirs skips dot-dirs: `.atlas` and all below it (minus cache and trash, see watchable) is
    // listed here instead
    let in_atlas = paths::rel_path(root, dir).is_some_and(|r| r == ".atlas" || r.starts_with(".atlas/"));
    let mut dirs = if in_atlas { vec![] } else { walk::dirs(root, dir, cfg) };
    let atlas = if dir == root { root.join(".atlas") } else { dir.to_path_buf() };
    if (dir == root || in_atlas) && atlas.is_dir() {
        all_dirs(root, cfg, &atlas, &mut dirs);
    }
    let mut whole = true;
    for d in dirs {
        let rel = paths::rel_path(root, &d).unwrap_or_default();
        if !watchable(cfg, &rel) || watched.contains(&d) {
            continue;
        }
        match w.watch(&d, RecursiveMode::NonRecursive) {
            Ok(()) => {
                watched.insert(d);
            }
            // gone already (deleted while listed) is no blind spot
            Err(_) if !d.is_dir() => {}
            Err(_) => whole = false,
        }
    }
    whole
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An event named by the canonical path (macOS's FSEvents under a symlinked temp folder) is still the vault's.
    #[cfg(unix)]
    #[test]
    fn an_event_under_the_roots_real_path_is_the_vaults() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("real/notes")).unwrap();
        std::os::unix::fs::symlink(d.path().join("real"), d.path().join("link")).unwrap();
        let root = Root::new(&d.path().join("link"));
        let real = d.path().canonicalize().unwrap().join("real");
        assert_eq!(root.rel(&real.join("notes/a.md")).as_deref(), Some("notes/a.md"));
        assert_eq!(root.rel(&d.path().join("link/notes/a.md")).as_deref(), Some("notes/a.md"));
        assert_eq!(root.rel(&d.path().join("elsewhere/a.md")), None);
    }

    /// An installed plugin's files are watched, also in a plugin folder created after the start
    /// (`atlas plugin update` replaces the folder); `.atlas/trash` is not.
    #[test]
    fn plugin_folders_are_watched() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".atlas/plugins/a")).unwrap();
        let bus = EventBus::default();
        let mut rx = bus.subscribe();
        let _g = spawn_watcher(d.path(), Config::default(), bus).unwrap();
        std::thread::sleep(Duration::from_millis(150));
        let mut seen = |want: &str| {
            let end = std::time::Instant::now() + Duration::from_secs(3);
            while std::time::Instant::now() < end {
                if let Ok(Event::Fs { paths }) = rx.try_recv() {
                    if paths.iter().any(|p| p == want) {
                        return true;
                    }
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            false
        };
        std::fs::write(d.path().join(".atlas/plugins/a/main.js"), "x").unwrap();
        assert!(seen(".atlas/plugins/a/main.js"), "an edit in an existing plugin folder");
        std::fs::create_dir_all(d.path().join(".atlas/plugins/b")).unwrap();
        assert!(seen(".atlas/plugins/b"), "a new plugin folder");
        std::thread::sleep(Duration::from_millis(400));
        std::fs::write(d.path().join(".atlas/plugins/b/main.js"), "y").unwrap();
        assert!(seen(".atlas/plugins/b/main.js"), "an edit in the new folder");
        std::fs::create_dir_all(d.path().join(".atlas/trash/x")).unwrap();
        std::fs::write(d.path().join(".atlas/trash/x/main.js"), "z").unwrap();
        assert!(!seen(".atlas/trash/x/main.js"), "the trash is not watched");
    }

    /// Reading must not look like writing (that fed an endless event loop with the UI).
    #[test]
    fn reads_are_silent_writes_are_reported() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("notes/sub")).unwrap();
        let bus = EventBus::default();
        let mut rx = bus.subscribe();
        let _g = spawn_watcher(d.path(), Config::default(), bus).unwrap();
        // FSEvents may replay what was made just before the stream began (the folders above): only reads may count
        std::thread::sleep(Duration::from_millis(1000));
        while rx.try_recv().is_ok() {}
        for _ in 0..5 {
            for e in std::fs::read_dir(d.path().join("notes")).unwrap() {
                let _ = e.unwrap().metadata();
            }
            let _ = std::fs::read_dir(d.path().join("notes/sub")).unwrap().count();
        }
        std::thread::sleep(Duration::from_millis(900));
        assert!(rx.try_recv().is_err(), "directory reads produced an fs event");
        std::fs::write(d.path().join("notes/a.md"), "x").unwrap();
        std::thread::sleep(Duration::from_millis(900));
        match rx.try_recv() {
            Ok(Event::Fs { paths }) => assert!(paths.contains(&"notes/a.md".to_string()), "{paths:?}"),
            other => panic!("expected an fs event, got {other:?}"),
        }
    }

    /// A save (Atlas's temporary twin renamed into place) is one `fs` event naming the note, with no temporary
    /// path and nothing gone; a deletion is announced as `gone` before its `fs`.
    #[test]
    fn a_save_is_a_change_a_deletion_is_gone() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("notes")).unwrap();
        std::fs::write(d.path().join("notes/a.md"), "x").unwrap();
        let bus = EventBus::default();
        let mut rx = bus.subscribe();
        let _g = spawn_watcher(d.path(), Config::default(), bus).unwrap();
        std::thread::sleep(Duration::from_millis(150));
        let drain = |rx: &mut tokio::sync::broadcast::Receiver<Event>| {
            std::thread::sleep(Duration::from_millis(900));
            std::iter::from_fn(|| rx.try_recv().ok()).collect::<Vec<_>>()
        };
        let tmp = d.path().join("notes/.a.md.atlas-tmp-1-2");
        std::fs::write(&tmp, "y").unwrap();
        std::fs::rename(&tmp, d.path().join("notes/a.md")).unwrap();
        assert_eq!(drain(&mut rx), vec![Event::Fs { paths: vec!["notes/a.md".into()] }]);
        std::fs::remove_file(d.path().join("notes/a.md")).unwrap();
        assert_eq!(drain(&mut rx), vec![Event::Gone { paths: vec!["notes/a.md".into()] }, Event::Fs { paths: vec!["notes/a.md".into()] }]);
    }
}
