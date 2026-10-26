//! Vaults (docs/guides/SHELL.md): the folders the user works in, like Obsidian's vault list. A vault is
//! any folder; everything specific to it (plugins, settings, pages, workspaces) lives in its own
//! `.atlas/`, so the work vault and a personal vault share nothing but the app.
//!
//! The list is one small file, `~/.config/atlas/vaults.toml` — the only thing Atlas keeps outside
//! a vault. The desktop app writes it when it opens a vault or one of its windows takes the focus; a throwaway folder
//! (`throwaway`: the temp folder, a Cargo target/) never ends up in it.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ts_rs::TS;

/// One known vault. `missing`: its folder is gone (an unplugged drive, a moved folder).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Vault {
    pub name: String,
    pub path: String,
    /// When it was last opened (ms since epoch); the list is shown most recent first.
    #[ts(type = "number")]
    pub last_opened: i64,
    #[serde(default, skip_deserializing)]
    pub missing: bool,
    /// On a server: where the vault is (`/v/<name>/`); the picker goes there instead of opening a window.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub url: Option<String>,
    /// A local vault's copy on a server (`https://atlas.example.org/v/notes/`), kept in step by Syncthing: while it answers,
    /// a file open here is read, saved and edited live there, so only the server writes it and the two copies never
    /// conflict (docs/design/DESIGN-mirror.md).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub mirror: Option<String>,
    /// The desktop's one core: already started, so switching to it is only a page load.
    #[serde(default, skip_deserializing)]
    pub warm: bool,
}

/// `GET /api/vaults`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct VaultList {
    /// The vault this window shows.
    pub current: String,
    pub vaults: Vec<Vault>,
    /// Whether vaults can be opened, made and taken off the list here (the desktop); a server's are its folders.
    #[serde(default)]
    pub manage: bool,
}

/// `POST /api/vaults/open` and `/forget`: a folder; `create` makes it when it does not exist.
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct VaultRequest {
    pub path: String,
    #[serde(default)]
    pub create: bool,
}

/// `POST /api/vaults/mirror`: a local vault and its server copy's address (none: unlinked).
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct MirrorRequest {
    pub path: String,
    #[serde(default)]
    #[ts(optional)]
    pub mirror: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct ListFile {
    #[serde(default)]
    vault: Vec<Vault>,
}

/// Where the list lives: `$ATLAS_VAULTS`, else `vaults.toml` in Atlas's config folder (`~/.config/atlas/` on Linux).
pub fn list_file() -> PathBuf {
    if let Some(p) = std::env::var_os("ATLAS_VAULTS") {
        return PathBuf::from(p);
    }
    crate::platform::dirs::atlas(crate::platform::dirs::Base::Config).join("vaults.toml")
}

fn read(file: &Path) -> Vec<Vault> {
    let text = std::fs::read_to_string(file).unwrap_or_default();
    toml::from_str::<ListFile>(&text).map(|l| l.vault).unwrap_or_default()
}

fn write(file: &Path, vaults: Vec<Vault>) -> Result<()> {
    let text = toml::to_string(&ListFile { vault: vaults }).map_err(|e| Error::Other(e.into()))?;
    let text = format!("# Vaults Atlas has opened (most recent first). Removing an entry only forgets it.\n{text}");
    crate::vault_write::outside::write(file, text.as_bytes()) // ~/.config/atlas: this machine's list
}

/// The known vaults, most recently opened first.
pub fn list(file: &Path) -> Vec<Vault> {
    let mut v = read(file);
    for x in &mut v {
        x.missing = x.url.is_none() && !Path::new(&x.path).is_dir();
    }
    v.sort_by_key(|x| std::cmp::Reverse(x.last_opened));
    v
}

/// Records that `root` was opened now (adds it, or moves it to the top).
pub fn remember(file: &Path, root: &Path, now_ms: i64) -> Result<()> {
    let root = crate::paths::real(root).map_err(|e| Error::BadPath(format!("{}: {e}", root.display())))?;
    let path = root.to_string_lossy().into_owned();
    let name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone());
    let mut v = read(file);
    let mirror = v.iter().find(|x| x.path == path).and_then(|x| x.mirror.clone()); // a reopen keeps its mirror
    v.retain(|x| x.path != path);
    v.insert(0, Vault { name, path, last_opened: now_ms, missing: false, url: None, mirror, warm: false });
    write(file, v)
}

/// Links the local vault `path` to its copy on a server (`mirror`: a server vault's address), or unlinks it (None).
pub fn set_mirror(file: &Path, path: &str, mirror: Option<&str>) -> Result<()> {
    let mirror = match mirror.map(str::trim).filter(|m| !m.is_empty()) {
        Some(m) => Some(server_address(m).ok_or_else(|| Error::BadRequest(format!("{m}: a mirror is a server vault's address (https://…)")))?),
        None => None,
    };
    let mut v = read(file);
    let Some(entry) = v.iter_mut().find(|x| x.path == path && x.url.is_none()) else {
        return Err(Error::NotFound(format!("{path}: not a folder on the vault list")));
    };
    entry.mirror = mirror;
    write(file, v)
}

/// What a window started without knowing its vault shows: the folder asked for, else the vault
/// opened most recently that still exists, else `None` — a first run, the caller shows a welcome.
pub fn to_open(asked: Option<PathBuf>, file: &Path) -> Option<PathBuf> {
    asked.or_else(|| list(file).into_iter().find(|v| !v.missing && v.url.is_none()).map(|v| PathBuf::from(v.path)))
}

/// [`remember`] in the user's own list, now — unless `root` is a throwaway folder ([`throwaway`]). A list of its own
/// (`ATLAS_VAULTS`: the e2e suite's, whose vaults are all in the temp folder) keeps every vault.
pub fn remember_now(root: &Path) -> Result<()> {
    if throwaway(root) && std::env::var_os("ATLAS_VAULTS").is_none() {
        return Ok(());
    }
    remember(&list_file(), root, chrono::Utc::now().timestamp_millis())
}

/// A folder no one works in: under the system's temp folder (tests, audits) or inside a Cargo `target/` (probe copies
/// of a vault). Their windows take the focus like any other, which put them on the list. Judged by where it is, not by a list of names.
pub fn throwaway(root: &Path) -> bool {
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let tmp = std::env::temp_dir().canonicalize().unwrap_or_else(|_| std::env::temp_dir());
    root.starts_with(&tmp) || root.ancestors().any(|a| a.file_name().is_some_and(|n| n == "target") && a.parent().is_some_and(|p| p.join("Cargo.toml").is_file()))
}

/// A server's address typed where a folder goes (`https://atlas.example.org/v/notes/`): a vault on a server, opened in
/// a window on its page, whose sign-in in front (Authelia, a security key) happens in that window
/// (docs/design/DESIGN-desktop-remote.md). The address as kept, or None: a folder.
pub fn server_address(typed: &str) -> Option<String> {
    let url = reqwest::Url::parse(typed.trim()).ok()?;
    (matches!(url.scheme(), "http" | "https") && url.host_str().is_some()).then(|| url.to_string())
}

/// Records that the server vault at `url` was opened now: named for its host, and its vault when the address has one
/// (`atlas.example.org · notes`).
pub fn remember_server(file: &Path, url: &str, now_ms: i64) -> Result<()> {
    let u = reqwest::Url::parse(url).map_err(|e| Error::BadPath(format!("{url}: {e}")))?;
    let vault = u.path().strip_prefix("/v/").map(|p| p.trim_end_matches('/')).filter(|p| !p.is_empty());
    let host = u.host_str().unwrap_or(url);
    let name = vault.map_or_else(|| host.to_string(), |v| format!("{host} · {v}"));
    let mut v = read(file);
    v.retain(|x| x.path != url);
    v.insert(0, Vault { name, path: url.to_string(), last_opened: now_ms, missing: false, url: Some(url.to_string()), mirror: None, warm: false });
    write(file, v)
}

/// Drops a vault from the list. Its folder is not touched.
pub fn forget(file: &Path, path: &str) -> Result<()> {
    let mut v = read(file);
    v.retain(|x| x.path != path);
    write(file, v)
}

/// The folder a typed path names (`~` expanded); with `create`, made if it does not exist.
pub fn resolve(typed: &str, create: bool) -> Result<PathBuf> {
    let p = PathBuf::from(crate::pty::expand_home(typed.trim()));
    if !p.is_absolute() {
        return Err(Error::BadPath(format!("{typed}: a vault is a full path (/home/… or ~/…)")));
    }
    if !p.exists() && create {
        crate::vault_write::outside::mkdir(&p)?; // the new vault's own folder: no vault holds it yet
    }
    if !p.is_dir() {
        return Err(Error::NotFound(format!("{} is not a folder", p.display())));
    }
    Ok(p)
}

/// A vault Atlas has just created starts without the science plugins (the Library): they are one
/// switch away in Settings → Plugins. An existing folder is never given a config this way.
pub fn start_plain(root: &Path) -> Result<()> {
    let cfg = root.join(".atlas/config.toml");
    if !cfg.exists() {
        crate::vault_write::write(&cfg, format!("# Settings of this vault (Settings in Atlas edits this file; your comments are kept).\n\n[plugins]\n# built-in plugins this vault does not use; remove a name (or use Settings → Plugins) to switch it on\noff = [\"{}\"]\n", crate::config::LIBRARY_PLUGIN).as_bytes())?;
    }
    Ok(())
}

/// The address of an Atlas already serving this vault, if one is: from its `.atlas/cache/server.json`,
/// believed only while the folder is the same and that process is alive (a crash leaves the file behind).
pub fn running_server(root: &Path) -> Option<String> {
    let text = std::fs::read_to_string(root.join(".atlas/cache/server.json")).ok()?;
    let f: crate::api::ServerFile = serde_json::from_str(&text).ok()?;
    let same = Path::new(&f.root).canonicalize().ok()? == root.canonicalize().ok()?;
    (same && crate::platform::proc::pid_alive(f.pid)).then(|| format!("http://127.0.0.1:{}{}", f.port, f.path))
}

/// Another Atlas process serving `root` (its address), never this one: the desktop's one core starts a vault only when
/// nothing else runs it (two cores on one vault would run its schedules twice).
pub fn served_elsewhere(root: &Path) -> Option<String> {
    let text = std::fs::read_to_string(root.join(".atlas/cache/server.json")).ok()?;
    let f: crate::api::ServerFile = serde_json::from_str(&text).ok()?;
    (f.pid != std::process::id()).then_some(())?;
    running_server(root)
}

/// Opens `root` in a window of its own: a second `atlas-app`, so each vault runs apart from the
/// others. `$ATLAS_APP` names the program; otherwise the one running, one beside it, or `atlas-app`
/// on the PATH.
pub fn open_window(root: &Path) -> Result<()> {
    let app = std::env::var_os("ATLAS_APP").map(PathBuf::from).unwrap_or_else(|| {
        let me = std::env::current_exe().ok();
        let is_app = |p: &PathBuf| p.file_stem().is_some_and(|n| n == "atlas-app");
        let exe = format!("atlas-app{}", std::env::consts::EXE_SUFFIX);
        let beside = me.as_ref().and_then(|p| p.parent()).map(|d| d.join(&exe)).filter(|p| p.is_file());
        me.clone().filter(is_app).or(beside).unwrap_or_else(|| PathBuf::from("atlas-app"))
    });
    let mut cmd = std::process::Command::new(&app);
    cmd.arg(root).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    crate::platform::proc::detach(&mut cmd); // it outlives the window that opened it
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| Error::CommandFailed(format!("could not start {}: {e} (is the Atlas desktop app installed?)", app.display())))
}

#[cfg(test)]
mod tests {
    #[test]
    fn throwaway_folders_are_the_temp_folders_and_cargos_target() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(throwaway(tmp.path()), "under the temp folder");
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap(); // the workspace: Cargo.toml
        assert!(throwaway(&repo.join("target/probe-vault-phone")), "a probe copy in target/");
        // (a checkout that itself sits in another project's target/, as the publishing check's clone does, is throwaway)
        if !throwaway(repo) {
            assert!(!throwaway(&repo.join("docs")), "a folder of a project is not");
        }
        assert!(!throwaway(Path::new("/home/u/project/target/x")), "a target/ without a Cargo.toml beside it is not");
        assert!(!throwaway(Path::new("/srv/vaults/Work")));
    }
    use super::*;

    #[test]
    fn a_local_vault_keeps_its_mirror_across_reopens_and_a_mirror_must_be_a_server_address() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("vaults.toml");
        let phd = d.path().join("Work");
        std::fs::create_dir_all(&phd).unwrap();
        remember(&file, &phd, 1).unwrap();
        let path = crate::paths::real(&phd).unwrap().to_string_lossy().into_owned();
        set_mirror(&file, &path, Some("https://atlas.example.org/v/notes/")).unwrap();
        remember(&file, &phd, 2).unwrap();
        assert_eq!(list(&file)[0].mirror.as_deref(), Some("https://atlas.example.org/v/notes/"), "reopening keeps it");
        assert!(set_mirror(&file, &path, Some("~/elsewhere")).is_err(), "a folder is not a mirror");
        assert!(set_mirror(&file, "/not/listed", Some("https://a.example/v/x/")).is_err());
        set_mirror(&file, &path, None).unwrap();
        assert_eq!(list(&file)[0].mirror, None);
    }

    #[test]
    fn a_server_vault_is_kept_beside_the_folders_and_never_opened_as_one() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("vaults.toml");
        let a = d.path().join("work");
        std::fs::create_dir_all(&a).unwrap();
        assert_eq!(server_address("  https://atlas.example.org/v/notes/ ").as_deref(), Some("https://atlas.example.org/v/notes/"));
        assert_eq!(server_address("~/Notes"), None);
        assert_eq!(server_address("/srv/notes"), None);
        remember(&file, &a, 100).unwrap();
        remember_server(&file, "https://atlas.example.org/v/notes/", 200).unwrap();
        let l = list(&file);
        assert_eq!((l[0].name.as_str(), l[0].url.as_deref(), l[0].missing), ("atlas.example.org · notes", Some("https://atlas.example.org/v/notes/"), false));
        assert_eq!(to_open(None, &file), Some(crate::paths::real(&a).unwrap()), "a window without a folder opens the last folder, not the server");
    }

    #[test]
    fn a_window_without_a_folder_shows_the_last_vault_that_still_exists() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("vaults.toml");
        let (a, b) = (d.path().join("work"), d.path().join("personal"));
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        assert_eq!(to_open(None, &file), None, "first run: nothing remembered");
        remember(&file, &a, 100).unwrap();
        remember(&file, &b, 200).unwrap();
        assert_eq!(to_open(None, &file).unwrap().file_name().unwrap(), "personal");
        std::fs::remove_dir(&b).unwrap(); // the newest is gone (an unplugged disk): the next one
        assert_eq!(to_open(None, &file).unwrap().file_name().unwrap(), "work");
        assert_eq!(to_open(Some(PathBuf::from("/asked")), &file), Some(PathBuf::from("/asked")), "a folder asked for wins");
    }

    #[test]
    fn remembered_most_recent_first_and_forgotten_without_touching_the_folder() {
        let d = tempfile::tempdir().unwrap();
        let file = d.path().join("cfg/vaults.toml");
        let (a, b) = (d.path().join("work"), d.path().join("personal"));
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        assert!(list(&file).is_empty(), "no file yet");
        remember(&file, &a, 100).unwrap();
        remember(&file, &b, 200).unwrap();
        assert_eq!(list(&file).iter().map(|v| v.name.as_str()).collect::<Vec<_>>(), ["personal", "work"]);
        remember(&file, &a, 300).unwrap(); // opened again: moves up, not duplicated
        let l = list(&file);
        assert_eq!(l.iter().map(|v| v.name.as_str()).collect::<Vec<_>>(), ["work", "personal"]);
        assert_eq!(l.len(), 2);
        std::fs::remove_dir(&b).unwrap();
        assert!(list(&file).iter().find(|v| v.name == "personal").unwrap().missing);
        forget(&file, &l[0].path).unwrap();
        assert_eq!(list(&file).len(), 1);
        assert!(a.is_dir(), "forgetting never deletes");
    }

    #[test]
    fn a_vault_atlas_creates_starts_without_the_library_and_a_config_is_never_replaced() {
        let d = tempfile::tempdir().unwrap();
        start_plain(d.path()).unwrap();
        let cfg = crate::workspace::Workspace::open(d.path()).unwrap().config().unwrap();
        assert_eq!(cfg.plugins.off, [crate::config::LIBRARY_PLUGIN]);
        std::fs::write(d.path().join(".atlas/config.toml"), "vim = false\n").unwrap();
        start_plain(d.path()).unwrap();
        assert_eq!(std::fs::read_to_string(d.path().join(".atlas/config.toml")).unwrap(), "vim = false\n");
    }

    #[test]
    fn a_typed_path_must_be_a_full_path_to_a_folder_and_can_be_created() {
        let d = tempfile::tempdir().unwrap();
        let new = d.path().join("new/vault");
        assert!(resolve("notes", false).unwrap_err().to_string().contains("full path"));
        assert!(matches!(resolve(new.to_str().unwrap(), false), Err(Error::NotFound(_))));
        assert_eq!(resolve(new.to_str().unwrap(), true).unwrap(), new);
        assert!(new.is_dir());
    }

    #[test]
    fn a_running_atlas_is_found_only_while_it_is_alive_and_on_the_same_folder() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(running_server(d.path()), None, "no file");
        std::fs::create_dir_all(d.path().join(".atlas/cache")).unwrap();
        let file = |pid: u32, root: &Path| std::fs::write(d.path().join(".atlas/cache/server.json"), serde_json::json!({ "port": 4242, "pid": pid, "root": root }).to_string()).unwrap();
        file(std::process::id(), d.path());
        assert_eq!(running_server(d.path()).as_deref(), Some("http://127.0.0.1:4242"));
        file(u32::MAX - 7, d.path());
        assert_eq!(running_server(d.path()), None, "that process is gone: the file is stale");
        file(std::process::id(), &d.path().join("elsewhere"));
        assert_eq!(running_server(d.path()), None, "the file speaks of another folder");
    }
}
