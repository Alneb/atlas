//! The one place the core changes files on disk (docs/refactor/REFACTOR-vault-write.md).
//!
//! Vault content goes through the top-level functions, which ask the vault's [`WriteGuard`] first (the mirror's
//! lease, docs/design/DESIGN-mirror-v2.md §2) and tell it the new content's hash after. Per-device state that is
//! never synced goes through [`cache`]; files outside every vault (~/.config, ~/.local/state, secrets) through
//! [`outside`]. Neither asks the guard. Raw `std::fs` writes elsewhere are a clippy error (crates/atlas-core/clippy.toml).
#![allow(clippy::disallowed_methods)] // the funnel itself

use crate::{Error, Result, Workspace};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

/// SHA-256 of a file's bytes: the version the mirror's lease table keeps per path. Hex on the wire.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct ContentHash(pub [u8; 32]);

impl ContentHash {
    pub fn of(bytes: &[u8]) -> Self {
        Self(Sha256::digest(bytes).into())
    }
    pub fn to_hex(&self) -> String {
        self.0.iter().map(|b| format!("{b:02x}")).collect()
    }
    pub fn from_hex(s: &str) -> Option<Self> {
        if s.len() != 64 || !s.is_ascii() {
            return None;
        }
        let mut out = [0u8; 32];
        for (i, b) in out.iter_mut().enumerate() {
            *b = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).ok()?;
        }
        Some(Self(out))
    }
}

impl std::fmt::Debug for ContentHash {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ContentHash({})", self.to_hex())
    }
}

impl serde::Serialize for ContentHash {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_hex())
    }
}

impl<'de> serde::Deserialize<'de> for ContentHash {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        Self::from_hex(&s).ok_or_else(|| serde::de::Error::custom(format!("not a SHA-256 hex digest: {s}")))
    }
}

/// What a change does to `rel` (vault-relative, `/`-separated).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WriteKind {
    /// Replace (or make) the file's whole content.
    Write,
    /// Make the file only if there is none.
    Create,
    /// Add bytes at the end (a log, a capture inbox).
    Append,
    /// Move `rel` (a file or a folder) to `to`.
    Rename { to: String },
    /// Delete the file.
    Remove,
    /// Delete the folder and everything in it.
    RemoveDir,
    /// Make the folder (and its parents).
    Mkdir,
}

/// Asked before every change to a vault's content and told after it. `before` refusing stops the change.
pub trait WriteGuard: Send + Sync {
    /// `current`: the hash of the file on disk now (`None`: absent, or a folder).
    fn before(&self, rel: &str, kind: &WriteKind, current: Option<ContentHash>) -> Result<()>;
    /// `new`: the hash of what is on disk now (`None` after a removal, or for a folder).
    fn after(&self, rel: &str, kind: &WriteKind, new: Option<ContentHash>);
    /// `before` allowed the change but it failed: what `before` took is handed back (a lease would stay held otherwise).
    fn abort(&self, _rel: &str, _kind: &WriteKind) {}
}

/// The default: every write allowed, nothing to tell.
pub struct NoGuard;

impl WriteGuard for NoGuard {
    fn before(&self, _: &str, _: &WriteKind, _: Option<ContentHash>) -> Result<()> {
        Ok(())
    }
    fn after(&self, _: &str, _: &WriteKind, _: Option<ContentHash>) {}
}

/// Guards by canonical vault root. Process-wide rather than in `Workspace`, so a write reached through a bare root
/// path (many modules take `root: &Path`) or a freshly opened `Workspace` is still guarded.
static GUARDS: RwLock<Vec<(PathBuf, Arc<dyn WriteGuard>)>> = RwLock::new(Vec::new());

impl Workspace {
    /// Every later change to this vault's files (by any `Workspace` on the same root) asks `guard`.
    pub fn set_write_guard(&self, guard: Arc<dyn WriteGuard>) {
        let mut g = GUARDS.write().unwrap_or_else(|e| e.into_inner());
        g.retain(|(r, _)| r != self.root());
        g.push((self.root().to_path_buf(), guard));
    }
    /// Back to [`NoGuard`].
    pub fn clear_write_guard(&self) {
        GUARDS.write().unwrap_or_else(|e| e.into_inner()).retain(|(r, _)| r != self.root());
    }
}

/// The guard of the vault holding `abs`, with that vault's root; `None` when no vault there has one (the common
/// case, which then costs no hashing).
fn guard_of(abs: &Path) -> Option<(Arc<dyn WriteGuard>, PathBuf)> {
    let guards = GUARDS.read().unwrap_or_else(|e| e.into_inner());
    if guards.is_empty() {
        return None;
    }
    let find = |p: &Path| {
        guards.iter().filter(|(root, _)| p.starts_with(root)).max_by_key(|(root, _)| root.as_os_str().len()).cloned()
    };
    find(abs).or_else(|| find(&canonical(abs)?)).map(|(root, g)| (g, root))
}

/// `abs` through its deepest existing ancestor's canonical path (a symlink, `..`, a non-canonical root).
fn canonical(abs: &Path) -> Option<PathBuf> {
    let base = abs.ancestors().find(|a| a.exists())?;
    Some(crate::paths::real(base).ok()?.join(abs.strip_prefix(base).ok()?))
}

/// `abs` relative to `root`, `/`-separated; the absolute path when it is elsewhere.
fn rel_of(root: &Path, abs: &Path) -> String {
    crate::paths::rel_path(root, abs)
        .or_else(|| crate::paths::rel_path(root, &canonical(abs)?))
        .unwrap_or_else(|| abs.to_string_lossy().into_owned())
}

fn hash_file(abs: &Path) -> Result<Option<ContentHash>> {
    match std::fs::read(abs) {
        Ok(bytes) => Ok(Some(ContentHash::of(&bytes))),
        Err(e) if matches!(e.kind(), std::io::ErrorKind::NotFound | std::io::ErrorKind::IsADirectory) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// The hash of `rel` as it is on disk; `None` when there is no such file.
pub fn disk_hash(ws: &Workspace, rel: &str) -> Result<Option<ContentHash>> {
    hash_file(&ws.resolve(rel)?)
}

/// Runs `op` (the IO of one change to `abs`) between the guard's `before` and `after`. `hashed` is where the content
/// is afterwards (the destination of a move); `None` when nothing is left to hash.
fn run<T>(abs: &Path, kind: impl FnOnce(&dyn Fn(&Path) -> String) -> WriteKind, hashed: Option<&Path>, op: impl FnOnce() -> Result<T>) -> Result<T> {
    let out = run_guarded(abs, kind, hashed, op);
    // after the IO, failed or not: the note index walks again on its next request (vault_changes.rs)
    crate::vault_changes::touched(abs);
    if let Some(to) = hashed.filter(|to| *to != abs) {
        crate::vault_changes::touched(to);
    }
    out
}

fn run_guarded<T>(abs: &Path, kind: impl FnOnce(&dyn Fn(&Path) -> String) -> WriteKind, hashed: Option<&Path>, op: impl FnOnce() -> Result<T>) -> Result<T> {
    let Some((guard, root)) = guard_of(abs) else { return op() };
    let rel = rel_of(&root, abs);
    let kind = kind(&|p| rel_of(&root, p));
    guard.before(&rel, &kind, hash_file(abs)?)?;
    let done = op().and_then(|out| match hashed {
        Some(p) if p.is_file() => Ok((out, hash_file(p)?)),
        _ => Ok((out, None)),
    });
    match done {
        Ok((out, new)) => {
            guard.after(&rel, &kind, new);
            Ok(out)
        }
        Err(e) => {
            guard.abort(&rel, &kind);
            Err(e)
        }
    }
}

/// A change made by something else (an outside program: `gio trash`, `git`), still asked of and told to the guard.
pub fn guarded<T>(abs: &Path, kind: WriteKind, op: impl FnOnce() -> Result<T>) -> Result<T> {
    let hashed = matches!(kind, WriteKind::Write | WriteKind::Create | WriteKind::Append).then_some(abs);
    run(abs, |_| kind, hashed, op)
}

/// Replace `abs` atomically (a temporary file beside it renamed into place); parents made, permissions kept.
pub fn write(abs: &Path, bytes: &[u8]) -> Result<()> {
    run(abs, |_| WriteKind::Write, Some(abs), || raw::atomic(abs, raw::Replace::Always, |f| Ok(f.write_all(bytes)?)).map(|_| ()))
}

/// A folder of Atlas's own that is not the vault's history (caches, local copies of remote files): it carries a
/// `.gitignore` of `*`, written once, so git and the Git pane leave it out without the vault's own rules.
pub fn ignored_folder(dir: &Path, why: &str) -> Result<()> {
    let ignore = dir.join(".gitignore");
    if !ignore.exists() {
        write(&ignore, format!("# {why}: not part of the vault's history\n*\n").as_bytes())?;
    }
    Ok(())
}

/// [`write`] with the content streamed in by `fill` (a download); an error from `fill` leaves the old file as it was.
pub fn write_with(abs: &Path, fill: impl FnOnce(&mut std::fs::File) -> Result<()>) -> Result<()> {
    run(abs, |_| WriteKind::Write, Some(abs), || raw::atomic(abs, raw::Replace::Always, fill).map(|_| ()))
}

/// Whether [`create`] made the file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub enum Created {
    New,
    /// A file of that name was there (kept as it was).
    Taken,
}

/// Make `abs` with `bytes` only if there is no such file, atomically (two writers never both "create" it).
pub fn create(abs: &Path, bytes: &[u8]) -> Result<Created> {
    run(abs, |_| WriteKind::Create, Some(abs), || raw::atomic(abs, raw::Replace::IfAbsent, |f| Ok(f.write_all(bytes)?)))
}

/// Add `bytes` at the end of `abs` (made, with its parents, when missing).
pub fn append(abs: &Path, bytes: &[u8]) -> Result<()> {
    run(abs, |_| WriteKind::Append, Some(abs), || raw::append(abs, bytes))
}

/// Move a file or folder; the destination's parents are made. Replaces a file at `to` (as `rename(2)`): callers that
/// must not overwrite check first.
pub fn rename(from: &Path, to: &Path) -> Result<()> {
    run(from, |rel| WriteKind::Rename { to: rel(to) }, Some(to), || raw::rename(from, to))
}

/// Copy a file's bytes to `to` (replacing it; parents made).
pub fn copy(from: &Path, to: &Path) -> Result<()> {
    run(to, |_| WriteKind::Write, Some(to), || raw::copy(from, to))
}

/// `to` becomes a hard link to `from` when the filesystem allows, else a copy (an untouched original kept for free).
pub fn link_or_copy(from: &Path, to: &Path) -> Result<()> {
    run(to, |_| WriteKind::Create, Some(to), || {
        raw::mkdir_parent(to)?;
        if std::fs::hard_link(from, to).is_err() {
            std::fs::copy(from, to)?;
        }
        Ok(())
    })
}

pub fn remove_file(abs: &Path) -> Result<()> {
    run(abs, |_| WriteKind::Remove, None, || Ok(std::fs::remove_file(abs)?))
}

pub fn remove_dir_all(abs: &Path) -> Result<()> {
    run(abs, |_| WriteKind::RemoveDir, None, || Ok(std::fs::remove_dir_all(abs)?))
}

/// Make a folder and its parents (no error when it exists).
pub fn mkdir(abs: &Path) -> Result<()> {
    run(abs, |_| WriteKind::Mkdir, None, || Ok(std::fs::create_dir_all(abs)?))
}

/// The IO itself, shared by the three families; never asks a guard.
mod raw {
    use super::*;

    use crate::files::WRITE_TMP;

    pub enum Replace {
        Always,
        /// Linked into place, which fails when the name is taken.
        IfAbsent,
    }

    pub fn mkdir_parent(abs: &Path) -> Result<()> {
        if let Some(dir) = abs.parent() {
            std::fs::create_dir_all(dir)?;
        }
        Ok(())
    }

    pub fn atomic(abs: &Path, mode: Replace, fill: impl FnOnce(&mut std::fs::File) -> Result<()>) -> Result<Created> {
        let dir = abs.parent().ok_or_else(|| Error::BadPath(abs.display().to_string()))?;
        std::fs::create_dir_all(dir)?;
        let existing = std::fs::metadata(abs).ok();
        if matches!(mode, Replace::IfAbsent) && existing.is_some() {
            return Ok(Created::Taken);
        }
        let file_name = abs.file_name().unwrap_or_default().to_string_lossy();
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
        let tmp = dir.join(format!(".{file_name}{WRITE_TMP}{}-{nanos}", std::process::id()));
        let result = (|| -> Result<Created> {
            let mut f = std::fs::File::create(&tmp)?;
            fill(&mut f)?;
            f.sync_all()?;
            // keep e.g. the executable bit of a script edited in Atlas
            if let Some(meta) = &existing {
                std::fs::set_permissions(&tmp, meta.permissions())?;
            }
            match mode {
                Replace::IfAbsent => {
                    // made since the check above: that file is kept
                    let linked = std::fs::hard_link(&tmp, abs);
                    std::fs::remove_file(&tmp)?;
                    match linked {
                        Ok(()) => Ok(Created::New),
                        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Ok(Created::Taken),
                        Err(e) => Err(e.into()),
                    }
                }
                Replace::Always => {
                    std::fs::rename(&tmp, abs)?;
                    Ok(Created::New)
                }
            }
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(&tmp);
        }
        result
    }

    pub fn append(abs: &Path, bytes: &[u8]) -> Result<()> {
        mkdir_parent(abs)?;
        std::fs::OpenOptions::new().create(true).append(true).open(abs)?.write_all(bytes)?;
        Ok(())
    }

    pub fn rename(from: &Path, to: &Path) -> Result<()> {
        mkdir_parent(to)?;
        Ok(std::fs::rename(from, to)?)
    }

    pub fn copy(from: &Path, to: &Path) -> Result<()> {
        mkdir_parent(to)?;
        std::fs::copy(from, to)?;
        Ok(())
    }

    /// Readable by this user only, written whole then renamed over the old one.
    pub fn private(abs: &Path, bytes: &[u8]) -> Result<()> {
        mkdir_parent(abs)?;
        // unique per write, not per process: two threads sharing one O_TRUNC temp file would interleave their bytes
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
        let tmp = abs.with_extension(format!("tmp-{}-{nanos}", std::process::id()));
        let mut opts = std::fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut opts, 0o600);
        let result = (|| -> Result<()> {
            let mut f = opts.open(&tmp)?;
            f.write_all(bytes)?;
            f.sync_all()?;
            Ok(std::fs::rename(&tmp, abs)?)
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(&tmp);
        }
        result
    }
}

/// Per-device state inside a vault that is never vault content: `.atlas/cache/**` (the index, thumbnails, PDF text,
/// logs, layouts, recovery copies). No guard: no other device ever reads it as the vault's.
pub mod cache {
    use super::*;

    fn check(abs: &Path) {
        debug_assert!(is_cache(abs), "{} is not under a vault's .atlas/cache/: write it with vault_write::write", abs.display());
    }

    /// Whether `abs` is per-device state (under some `.atlas/cache/`).
    pub fn is_cache(abs: &Path) -> bool {
        // by components, so `\` (Windows) counts as well as `/`
        let parts: Vec<_> = abs.components().map(|c| c.as_os_str()).collect();
        parts.windows(2).any(|w| w[0] == ".atlas" && w[1] == "cache")
    }

    pub fn write(abs: &Path, bytes: &[u8]) -> Result<()> {
        check(abs);
        raw::atomic(abs, raw::Replace::Always, |f| Ok(f.write_all(bytes)?)).map(|_| ())
    }
    pub fn append(abs: &Path, bytes: &[u8]) -> Result<()> {
        check(abs);
        raw::append(abs, bytes)
    }
    pub fn rename(from: &Path, to: &Path) -> Result<()> {
        check(from);
        check(to);
        raw::rename(from, to)
    }
    /// Copy a file into the cache (`from` may be anywhere).
    pub fn copy(from: &Path, to: &Path) -> Result<()> {
        check(to);
        raw::copy(from, to)
    }
    pub fn remove_file(abs: &Path) -> Result<()> {
        check(abs);
        Ok(std::fs::remove_file(abs)?)
    }
    pub fn remove_dir_all(abs: &Path) -> Result<()> {
        check(abs);
        Ok(std::fs::remove_dir_all(abs)?)
    }
    pub fn mkdir(abs: &Path) -> Result<()> {
        check(abs);
        Ok(std::fs::create_dir_all(abs)?)
    }
    /// A file to stream into (a child process's log); truncated, parents made.
    pub fn file(abs: &Path) -> Result<std::fs::File> {
        check(abs);
        raw::mkdir_parent(abs)?;
        Ok(std::fs::File::create(abs)?)
    }
}

/// Files outside every vault: Atlas's own config and state (~/.config/atlas, ~/.local/state/atlas), the secrets store,
/// and work folders in the system temp dir. No guard: they are not a vault's content.
pub mod outside {
    use super::*;

    fn check(abs: &Path) {
        debug_assert!(guard_of(abs).is_none(), "{} is inside a guarded vault: write it with vault_write::write", abs.display());
    }

    pub fn write(abs: &Path, bytes: &[u8]) -> Result<()> {
        check(abs);
        raw::atomic(abs, raw::Replace::Always, |f| Ok(f.write_all(bytes)?)).map(|_| ())
    }
    /// Readable by this user only (0600): a password's hash, tokens.
    pub fn write_private(abs: &Path, bytes: &[u8]) -> Result<()> {
        check(abs);
        raw::private(abs, bytes)
    }
    pub fn append(abs: &Path, bytes: &[u8]) -> Result<()> {
        check(abs);
        raw::append(abs, bytes)
    }
    pub fn remove_file(abs: &Path) -> Result<()> {
        check(abs);
        Ok(std::fs::remove_file(abs)?)
    }
    pub fn remove_dir_all(abs: &Path) -> Result<()> {
        check(abs);
        Ok(std::fs::remove_dir_all(abs)?)
    }
    pub fn mkdir(abs: &Path) -> Result<()> {
        check(abs);
        Ok(std::fs::create_dir_all(abs)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Log(Mutex<Vec<String>>, bool);
    impl WriteGuard for Log {
        fn before(&self, rel: &str, kind: &WriteKind, current: Option<ContentHash>) -> Result<()> {
            self.0.lock().unwrap().push(format!("before {rel} {kind:?} {}", current.is_some()));
            if self.1 { Err(Error::BadRequest("held".into())) } else { Ok(()) }
        }
        fn after(&self, rel: &str, kind: &WriteKind, new: Option<ContentHash>) {
            self.0.lock().unwrap().push(format!("after {rel} {kind:?} {}", new.map(|h| h.to_hex()[..8].to_string()).unwrap_or_default()));
        }
    }

    #[test]
    fn hex_round_trips_and_rejects_junk() {
        let h = ContentHash::of(b"abc");
        assert_eq!(h.to_hex(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(ContentHash::from_hex(&h.to_hex()), Some(h));
        assert_eq!(serde_json::from_str::<ContentHash>(&serde_json::to_string(&h).unwrap()).unwrap(), h);
        assert!(ContentHash::from_hex("zz").is_none());
        assert!(ContentHash::from_hex(&"g".repeat(64)).is_none());
    }

    #[test]
    fn every_change_asks_the_guard_and_tells_it_the_new_hash() {
        let d = tempfile::tempdir().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let log = Arc::new(Log::default());
        ws.set_write_guard(log.clone());
        let a = ws.resolve("n/a.md").unwrap();
        write(&a, b"abc").unwrap();
        append(&a, b"d").unwrap();
        assert_eq!(create(&a, b"x").unwrap(), Created::Taken);
        rename(&a, &ws.resolve("b.md").unwrap()).unwrap();
        remove_file(&ws.resolve("b.md").unwrap()).unwrap();
        // a bare root path (not canonical) finds the same guard
        mkdir(&d.path().join("sub/./x")).unwrap();
        assert_eq!(disk_hash(&ws, "b.md").unwrap(), None);
        let abcd = ContentHash::of(b"abcd").to_hex()[..8].to_string();
        let got = log.0.lock().unwrap().clone();
        assert_eq!(got[0], "before n/a.md Write false");
        assert_eq!(got[1], format!("after n/a.md Write {}", &ContentHash::of(b"abc").to_hex()[..8]));
        assert_eq!(got[3], format!("after n/a.md Append {abcd}"));
        assert_eq!(got[6], "before n/a.md Rename { to: \"b.md\" } true");
        assert_eq!(got[7], format!("after n/a.md Rename {{ to: \"b.md\" }} {abcd}"));
        assert_eq!(got[9], "after b.md Remove ");
        assert!(got[10].starts_with("before sub/") && got[10].contains("Mkdir"), "{got:?}");
        ws.clear_write_guard();
    }

    #[derive(Default)]
    struct Aborts(Mutex<Vec<String>>);
    impl WriteGuard for Aborts {
        fn before(&self, _: &str, _: &WriteKind, _: Option<ContentHash>) -> Result<()> {
            Ok(())
        }
        fn after(&self, rel: &str, _: &WriteKind, _: Option<ContentHash>) {
            self.0.lock().unwrap().push(format!("after {rel}"));
        }
        fn abort(&self, rel: &str, _: &WriteKind) {
            self.0.lock().unwrap().push(format!("abort {rel}"));
        }
    }

    #[test]
    fn a_failed_change_hands_back_what_before_took() {
        let d = tempfile::tempdir().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        let log = Arc::new(Aborts::default());
        ws.set_write_guard(log.clone());
        // a move of a file that is not there fails in the IO, after the guard allowed it
        assert!(rename(&ws.resolve("gone.md").unwrap(), &ws.resolve("b.md").unwrap()).is_err());
        write(&ws.resolve("a.md").unwrap(), b"x").unwrap();
        assert_eq!(*log.0.lock().unwrap(), vec!["abort gone.md".to_string(), "after a.md".to_string()]);
        ws.clear_write_guard();
    }

    #[test]
    fn a_refusing_guard_stops_the_write() {
        let d = tempfile::tempdir().unwrap();
        let ws = Workspace::open(d.path()).unwrap();
        ws.set_write_guard(Arc::new(Log(Mutex::default(), true)));
        assert!(write(&ws.resolve("a.md").unwrap(), b"x").is_err());
        assert!(!ws.resolve("a.md").unwrap().exists());
        // per-device state never asks
        cache::write(&ws.cache_dir().join("x.json"), b"{}").unwrap();
        ws.clear_write_guard();
    }
}
