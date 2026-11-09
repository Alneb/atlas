//! A guest folder (docs/design/DESIGN-guest-folder.md): a folder that is not a vault, opened for a while in a window of
//! its own with the opener vault's plugins, never remembered, and read-only until the window's Edit switch is on.
//!
//! The core finds a vault's state at `<root>/.atlas`; a guest's is kept out of the folder in this machine's cache
//! (`~/.cache/atlas/guests/<hash>/.atlas`) and reached through one symlink, `<folder>/.atlas`, made when it opens and
//! removed at the next start of the desktop's core ([`sweep`]). In that `.atlas`: `plugins` and `plugin-settings`
//! link to the opener's (the same viewers and editors, the same settings), `config.toml` is the opener's with its
//! schedules off, `guest.toml` says whose guest it is.
use crate::vault_write::{self, outside, ContentHash, WriteGuard, WriteKind};
use crate::{Error, Result, Workspace};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use ts_rs::TS;

const MARK: &str = "guest.toml";
/// Linked from the opener's `.atlas`, so a guest has its plugins and their settings.
const SHARED: [&str; 2] = ["plugins", "plugin-settings"];

/// `GET /api/guest`: what this window shows when it is a guest (`null` for a vault).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GuestInfo {
    /// The guest folder.
    pub folder: String,
    /// The vault it was opened from (its plugins and settings).
    pub from: String,
    /// Whether its files may be changed now (the window's Edit switch).
    pub editing: bool,
}

/// `POST /api/guest/edit`.
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct GuestEdit {
    pub on: bool,
}

/// Why a folder cannot be opened as a guest.
#[derive(Debug)]
pub enum Refused {
    /// It has an `.atlas/` of its own: a vault, opened as one.
    AVault,
    Other(Error),
}

impl From<Error> for Refused {
    fn from(e: Error) -> Self {
        Refused::Other(e)
    }
}
impl From<std::io::Error> for Refused {
    fn from(e: std::io::Error) -> Self {
        Refused::Other(e.into())
    }
}

#[derive(Serialize, Deserialize)]
struct Mark {
    folder: String,
    from: String,
}

/// Where guests keep their state: `$ATLAS_GUESTS` (a test's), else `guests/` in Atlas's cache folder.
fn home() -> PathBuf {
    std::env::var_os("ATLAS_GUESTS").map(PathBuf::from).unwrap_or_else(|| crate::platform::dirs::atlas(crate::platform::dirs::Base::Cache).join("guests"))
}

/// The guest state of `folder` (canonical): one per folder, so opening it again finds the same index.
fn slot(folder: &Path) -> PathBuf {
    let h = Sha256::digest(folder.to_string_lossy().as_bytes());
    home().join(h.iter().take(8).map(|b| format!("{b:02x}")).collect::<String>())
}

/// Readies `folder` as a guest of the vault at `opener` and gives back its canonical path, the root to serve. Opened
/// again, the same state is reused (its config refreshed from the opener).
pub fn prepare(folder: &Path, opener: &Path) -> std::result::Result<PathBuf, Refused> {
    let folder = crate::paths::real(folder).map_err(|_| Error::NotFound(format!("no folder {}", folder.display())))?;
    if !folder.is_dir() {
        return Err(Error::BadRequest(format!("{} is not a folder", folder.display())).into());
    }
    let opener = crate::paths::real(opener)?;
    if folder.starts_with(&opener) || opener.starts_with(&folder) {
        return Err(Error::BadRequest("a guest folder is outside the vault: this one is the vault, or holds it, or is in it".into()).into());
    }
    let link = folder.join(".atlas");
    let state = slot(&folder).join(".atlas");
    match link.symlink_metadata() {
        Ok(m) if m.file_type().is_symlink() && std::fs::read_link(&link).is_ok_and(|t| t == state) => {}
        Ok(_) => return Err(Refused::AVault),
        Err(_) => {}
    }
    outside::mkdir(&state.join("cache"))?;
    for name in SHARED {
        let (mine, theirs) = (state.join(name), opener.join(".atlas").join(name));
        if mine.symlink_metadata().is_err() && theirs.is_dir() {
            outside::symlink_dir(&theirs, &mine)?;
        }
    }
    outside::write(&state.join("config.toml"), guest_config(&opener)?.as_bytes())?;
    let mark = Mark { folder: folder.to_string_lossy().into_owned(), from: opener.to_string_lossy().into_owned() };
    outside::write(&state.join(MARK), toml::to_string(&mark).map_err(|e| Error::Other(e.into()))?.as_bytes())?;
    if link.symlink_metadata().is_err() {
        outside::symlink_dir(&state, &link).map_err(|e| Error::BadRequest(format!("{} cannot be opened as a guest: its .atlas link was refused ({e})", folder.display())))?;
    }
    Ok(folder)
}

/// The opener's config with what reaches outside the window off: its scheduled commands.
fn guest_config(opener: &Path) -> Result<String> {
    let text = std::fs::read_to_string(opener.join(crate::config::CONFIG_FILE)).unwrap_or_default();
    let mut t: toml::Table = toml::from_str(&text).unwrap_or_default();
    let auto = t.entry("automation").or_insert_with(|| toml::Value::Table(Default::default()));
    if let Some(a) = auto.as_table_mut() {
        a.insert("run_schedules".into(), toml::Value::Boolean(false));
        a.remove("schedules_on");
    }
    let body = toml::to_string(&t).map_err(|e| Error::Other(e.into()))?;
    Ok(format!("# A guest folder's settings: its opener's, schedules off. Rewritten each time it opens.\n{body}"))
}

/// Whose guest the folder at `root` is; `None` for a vault.
fn mark_of(root: &Path) -> Option<Mark> {
    let link = root.join(".atlas");
    if !link.symlink_metadata().ok()?.file_type().is_symlink() {
        return None;
    }
    toml::from_str(&std::fs::read_to_string(link.join(MARK)).ok()?).ok()
}

pub fn is_guest(root: &Path) -> bool {
    mark_of(root).is_some()
}

/// Refuses every change outside its `.atlas` while editing is off.
struct ReadOnly {
    editing: AtomicBool,
}

impl WriteGuard for ReadOnly {
    fn before(&self, rel: &str, _: &WriteKind, _: Option<ContentHash>) -> Result<()> {
        if self.editing.load(Ordering::Relaxed) || rel == ".atlas" || rel.starts_with(".atlas/") {
            return Ok(());
        }
        Err(Error::BadRequest(format!("read-only guest folder: switch Edit on in its window to change {rel}")))
    }
    fn after(&self, _: &str, _: &WriteKind, _: Option<ContentHash>) {}
}

static GUESTS: Mutex<Vec<(PathBuf, Arc<ReadOnly>)>> = Mutex::new(Vec::new());

fn guard(root: &Path) -> Option<Arc<ReadOnly>> {
    GUESTS.lock().unwrap_or_else(|e| e.into_inner()).iter().find(|(r, _)| r == root).map(|(_, g)| g.clone())
}

/// When the vault served at `ws` is a guest: its writes guarded, read-only to begin with.
pub fn install(ws: &Workspace) {
    if !is_guest(ws.root()) {
        return;
    }
    let g = Arc::new(ReadOnly { editing: AtomicBool::new(false) });
    GUESTS.lock().unwrap_or_else(|e| e.into_inner()).retain(|(r, _)| r != ws.root());
    GUESTS.lock().unwrap_or_else(|e| e.into_inner()).push((ws.root().to_path_buf(), g.clone()));
    ws.set_write_guard(g);
}

/// The guest served at `root`, or `None` for a vault.
pub fn info(root: &Path) -> Option<GuestInfo> {
    let m = mark_of(root)?;
    let editing = guard(root).is_some_and(|g| g.editing.load(Ordering::Relaxed));
    Some(GuestInfo { folder: m.folder, from: m.from, editing })
}

/// The window's Edit switch.
pub fn set_editing(root: &Path, on: bool) -> Result<GuestInfo> {
    let g = guard(root).ok_or_else(|| Error::BadRequest("not a guest folder".into()))?;
    g.editing.store(on, Ordering::Relaxed);
    info(root).ok_or_else(|| Error::NotFound("the guest's state is gone".into()))
}

/// At the desktop core's start, before any guest is served: every guest of an earlier run forgotten — its folder's
/// `.atlas` link removed (only when it still points at that state), its state deleted. Returns how many.
pub fn sweep() -> usize {
    let Ok(dir) = std::fs::read_dir(home()) else { return 0 };
    let mut n = 0;
    for slot in dir.flatten().map(|e| e.path()) {
        let state = slot.join(".atlas");
        if let Some(m) = std::fs::read_to_string(state.join(MARK)).ok().and_then(|t| toml::from_str::<Mark>(&t).ok()) {
            let link = Path::new(&m.folder).join(".atlas");
            if std::fs::read_link(&link).is_ok_and(|t| t == state) {
                // the folder's own entry: through its guard when one is still installed (it allows `.atlas`)
                if let Err(e) = vault_write::remove_file(&link) {
                    eprintln!("atlas: the guest link {} stays: {e}", link.display());
                    continue;
                }
            }
        }
        match outside::remove_dir_all(&slot) {
            Ok(()) => n += 1,
            Err(e) => eprintln!("atlas: the guest state {} stays: {e}", slot.display()),
        }
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One test, as `ATLAS_GUESTS` is process-wide.
    #[test]
    fn a_guest_has_the_openers_plugins_writes_only_its_state_until_edit_and_is_swept() {
        let d = tempfile::tempdir().unwrap();
        std::env::set_var("ATLAS_GUESTS", d.path().join("guests"));
        let (vault, folder) = (d.path().join("vault"), d.path().join("docs"));
        std::fs::create_dir_all(vault.join(".atlas/plugins/viewer")).unwrap();
        std::fs::write(vault.join(".atlas/config.toml"), "[automation]\nschedules_on = [\"desk\"]\n\n[editor]\nvim = true\n").unwrap();
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("a.md"), "# A\n").unwrap();

        // the vault itself, or a folder inside it, is no guest
        assert!(matches!(prepare(&vault.join(".atlas"), &vault), Err(Refused::Other(_))));
        let root = prepare(&folder, &vault).map_err(|e| format!("{e:?}")).unwrap();
        assert!(is_guest(&root) && !is_guest(&vault));
        assert!(root.join(".atlas/plugins/viewer").is_dir(), "the opener's plugins");
        let cfg = std::fs::read_to_string(root.join(".atlas/config.toml")).unwrap();
        assert!(cfg.contains("run_schedules = false") && !cfg.contains("schedules_on") && cfg.contains("vim = true"), "{cfg}");
        // opened again: the same state
        assert_eq!(prepare(&folder, &vault).map_err(|e| format!("{e:?}")).unwrap(), root);
        // a folder with its own .atlas is a vault
        assert!(matches!(prepare(&vault, &folder), Err(Refused::AVault) | Err(Refused::Other(_))));

        let ws = Workspace::open(&root).unwrap();
        install(&ws);
        assert!(!info(&root).unwrap().editing);
        assert!(vault_write::write(&root.join("a.md"), b"changed").is_err(), "read-only until Edit");
        vault_write::cache::write(&root.join(".atlas/cache/x.json"), b"{}").unwrap();
        assert_eq!(std::fs::read_to_string(root.join("a.md")).unwrap(), "# A\n");
        assert!(set_editing(&root, true).unwrap().editing);
        vault_write::write(&root.join("a.md"), b"changed").unwrap();
        ws.clear_write_guard();

        assert_eq!(sweep(), 1);
        assert!(root.join(".atlas").symlink_metadata().is_err(), "the link is gone");
        assert_eq!(std::fs::read_to_string(root.join("a.md")).unwrap(), "changed", "the folder's files are kept");
        assert!(vault.join(".atlas/plugins/viewer").is_dir(), "the opener's plugins are kept");
    }
}
