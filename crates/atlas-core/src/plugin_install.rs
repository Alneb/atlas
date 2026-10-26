//! Installing a plugin: from a folder, a git address or an archive, **copied into the vault**
//! (`.atlas/plugins/<id>/`) — decided 2026-10-14: every vault carries its own plugins, complete on
//! its own. Nothing is ever deleted: what an install or a removal replaces is moved to
//! `.atlas/trash/`. A plugin arrives **switched off**: its manifest (and what it asks to be allowed)
//! is to be read in Settings before it runs.
use crate::plugins::{self, Permissions, PLUGINS_DIR};
use crate::{vault_write, Error, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ts_rs::TS;

/// Where a plugin was installed from, kept beside it (`.source`, TOML) so `update` can go back there.
const SOURCE_FILE: &str = ".source";
/// Not copied from a folder: version control, build output, dependencies fetched by a tool.
const SKIP: [&str; 4] = [".git", "node_modules", "target", "__pycache__"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Source {
    Folder(PathBuf),
    Git(String),
    Archive(PathBuf),
    /// An archive's web address (a release asset): downloaded, then unpacked like [`Source::Archive`].
    Download(String),
}

const ARCHIVES: [&str; 4] = [".zip", ".tar.gz", ".tgz", ".tar"];
/// What release archives are called (`atlas-plugin-<id>.tar.gz`, scripts/dev/plugin-pack.mjs): the id is the rest.
const RELEASE_PREFIX: &str = "atlas-plugin-";

impl Source {
    /// By shape: a web address of a `.zip`, `.tar.gz`, `.tgz` or `.tar` is a download; any other address or `…​.git`
    /// is git; such a file an archive; else a folder.
    pub fn parse(s: &str) -> Self {
        let t = s.trim();
        let l = t.to_ascii_lowercase();
        let web = l.starts_with("http://") || l.starts_with("https://");
        let archive = |path: &str| ARCHIVES.iter().any(|e| path.ends_with(e));
        if web && archive(l.split(['?', '#']).next().unwrap_or_default()) {
            Self::Download(t.to_string())
        } else if web || l.starts_with("git@") || l.starts_with("ssh://") || l.ends_with(".git") {
            Self::Git(t.to_string())
        } else if archive(&l) {
            Self::Archive(PathBuf::from(t))
        } else {
            Self::Folder(PathBuf::from(t))
        }
    }

    fn kind(&self) -> &'static str {
        match self {
            Self::Folder(_) => "folder",
            Self::Git(_) => "git",
            Self::Archive(_) => "archive",
            Self::Download(_) => "download",
        }
    }

    /// What `.source` keeps: a folder or archive as an absolute path (a relative one meant something only where
    /// `atlas` was run), an address as given.
    fn recorded(&self) -> String {
        match self {
            Self::Folder(p) | Self::Archive(p) => std::path::absolute(p).unwrap_or_else(|_| p.clone()).to_string_lossy().into_owned(),
            Self::Git(u) | Self::Download(u) => u.clone(),
        }
    }

    /// The id a plugin from here gets when none is given: the last part of the path or address.
    fn default_id(&self) -> String {
        // a path's own last part, an address's (or a Windows path given as a git source) after its last `/`, `\` or `:`
        let text = match self {
            Self::Folder(p) | Self::Archive(p) => p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            Self::Git(u) => u.clone(),
            Self::Download(u) => u.split(['?', '#']).next().unwrap_or_default().to_string(),
        };
        let last = text.trim_end_matches('/').rsplit(['/', '\\', ':']).next().unwrap_or_default();
        let stem = [".git", ".tar.gz", ".tgz", ".tar", ".zip"].iter().fold(last, |s, e| s.strip_suffix(e).unwrap_or(s));
        let stem = stem.strip_prefix(RELEASE_PREFIX).unwrap_or(stem);
        stem.chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '-' }).collect::<String>().trim_matches('-').to_string()
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct Installed {
    pub id: String,
    pub title: String,
    #[ts(optional)]
    pub version: Option<String>,
    pub permissions: Permissions,
    pub has_helper: bool,
    /// Where the plugin that was there before went (an update), relative to the vault.
    #[ts(optional)]
    pub replaced: Option<String>,
    /// Installed plugins start switched off.
    pub on: bool,
}

fn run(cmd: &mut std::process::Command, what: &str) -> Result<()> {
    let out = cmd.output().map_err(|e| match e.kind() {
        std::io::ErrorKind::NotFound => Error::CommandFailed(format!("{what}: {} is not installed on this computer", cmd.get_program().to_string_lossy())),
        _ => Error::CommandFailed(format!("{what}: {e}")),
    })?;
    if !out.status.success() {
        return Err(Error::CommandFailed(format!("{what}: {}", String::from_utf8_lossy(&out.stderr).trim())));
    }
    Ok(())
}

/// Into the install's work folder in the cache.
fn copy_dir(from: &Path, to: &Path) -> Result<()> {
    vault_write::cache::mkdir(to)?;
    for e in std::fs::read_dir(from)? {
        let e = e?;
        let name = e.file_name();
        let kind = e.file_type()?;
        // and no hidden folder: a tool's own (an editor's, an agent session's `.claude/`) is not the plugin's
        if SKIP.iter().any(|s| name == *s) || (kind.is_dir() && name.to_string_lossy().starts_with('.')) {
            continue;
        }
        let (src, dst) = (e.path(), to.join(&name));
        if kind.is_dir() {
            copy_dir(&src, &dst)?;
        } else if kind.is_file() {
            vault_write::cache::copy(&src, &dst)?;
        } // a link is not followed: a plugin is its own files
    }
    Ok(())
}

/// The folder holding `plugin.toml`: `dir` itself, or its only sub-folder (an archive of one folder).
fn plugin_root(dir: &Path) -> Result<PathBuf> {
    if dir.join("plugin.toml").is_file() {
        return Ok(dir.to_path_buf());
    }
    let subs: Vec<PathBuf> = std::fs::read_dir(dir)?.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
    match subs.as_slice() {
        [one] if one.join("plugin.toml").is_file() => Ok(one.clone()),
        _ => Err(Error::BadRequest("no plugin.toml there: not a plugin".into())),
    }
}

/// Brings the source's files into `work` (a fresh folder inside the vault's cache).
fn fetch(source: &Source, work: &Path) -> Result<Option<String>> {
    match source {
        Source::Folder(p) => {
            if !p.is_dir() {
                return Err(Error::NotFound(p.display().to_string()));
            }
            copy_dir(p, work)?;
            Ok(None)
        }
        Source::Git(url) => {
            run(std::process::Command::new("git").args(["clone", "--quiet", "--depth", "1", "--", url]).arg(work), "git clone")?;
            let out = std::process::Command::new("git").arg("-C").arg(work).args(["rev-parse", "HEAD"]).output()?;
            let commit = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let _ = vault_write::cache::remove_dir_all(&work.join(".git")); // a copy, not a checkout: the vault's own git tracks it
            Ok(Some(commit).filter(|c| !c.is_empty()))
        }
        Source::Archive(p) => {
            if !p.is_file() {
                return Err(Error::NotFound(p.display().to_string()));
            }
            unpack(p, work)?;
            Ok(None)
        }
        Source::Download(url) => {
            let name = url.split(['?', '#']).next().unwrap_or_default().rsplit('/').next().unwrap_or("plugin.tar.gz");
            let file = work.with_file_name(format!("{}-{name}", work.file_name().unwrap_or_default().to_string_lossy()));
            let got = download(url, &file).and_then(|_| unpack(&file, work));
            let _ = vault_write::cache::remove_file(&file);
            got?;
            Ok(None)
        }
    }
}

/// Unpacks an archive into `work`. On macOS the quarantine mark of a downloaded archive would stop the plugin's
/// programs from starting, so it is taken off what was unpacked (the plugin is installed off: a person switches it on).
fn unpack(archive: &Path, work: &Path) -> Result<()> {
    vault_write::cache::mkdir(work)?;
    if archive.to_string_lossy().to_ascii_lowercase().ends_with(".zip") {
        run(std::process::Command::new("unzip").arg("-q").arg(archive).arg("-d").arg(work), "unzip")?;
    } else {
        run(std::process::Command::new("tar").arg("-xf").arg(archive).arg("-C").arg(work), "tar")?;
    }
    if cfg!(target_os = "macos") {
        let _ = std::process::Command::new("xattr").args(["-dr", "com.apple.quarantine"]).arg(work).output();
    }
    Ok(())
}

/// Fetches `url` into `to` (redirects followed: a release's `latest/download/…` address is one).
fn download(url: &str, to: &Path) -> Result<()> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(concat!("atlas/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| Error::CommandFailed(format!("download: {e}")))?;
    let res = client.get(url).send().and_then(|r| r.error_for_status()).map_err(|e| Error::CommandFailed(format!("download {url}: {e}")))?;
    let bytes = res.bytes().map_err(|e| Error::CommandFailed(format!("download {url}: {e}")))?;
    vault_write::cache::write(to, &bytes)?;
    Ok(())
}

fn stamp() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

/// Moves a plugin folder to the vault's trash; returns where (relative to the vault).
fn to_trash(root: &Path, id: &str) -> Result<String> {
    // two removals in one second (an update, then a removal) each get a place of their own
    let now = stamp();
    let rel = (0..1000)
        .map(|n| format!(".atlas/trash/{now}{}/{PLUGINS_DIR}/{id}", if n == 0 { String::new() } else { format!("-{n}") }))
        .find(|r| !root.join(r).exists())
        .ok_or_else(|| Error::BadRequest("the trash is full for this second".into()))?;
    let dest = root.join(&rel);
    vault_write::rename(&root.join(PLUGINS_DIR).join(id), &dest)?;
    Ok(rel)
}

/// `[plugins] off` of the vault's config: `id` in it or out of it (comments kept).
pub fn set_off(root: &Path, id: &str, off: bool) -> Result<()> {
    let path = root.join(".atlas/config.toml");
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let mut doc: toml_edit::DocumentMut = text.parse().map_err(|e| Error::BadRequest(format!(".atlas/config.toml: {e}")))?;
    if !doc.contains_key("plugins") {
        doc["plugins"] = toml_edit::Item::Table(toml_edit::Table::new());
    }
    let table = doc["plugins"].as_table_mut().ok_or_else(|| Error::BadRequest(".atlas/config.toml: plugins is not a table".into()))?;
    let mut list: Vec<String> = table.get("off").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
    list.retain(|x| x != id);
    if off {
        list.push(id.to_string());
    }
    table["off"] = toml_edit::value(list.into_iter().collect::<toml_edit::Array>());
    vault_write::write(&path, doc.to_string().as_bytes())
}

/// Installs (or, with `replace`, updates) a plugin. An update keeps the vault's own `[settings]`.
pub fn install(root: &Path, source: &Source, id: Option<&str>, replace: bool) -> Result<Installed> {
    let work = root.join(format!(".atlas/cache/plugin-install-{}-{}", std::process::id(), stamp()));
    let _ = vault_write::cache::remove_dir_all(&work);
    let result = (|| -> Result<Installed> {
        let commit = fetch(source, &work)?;
        let from = plugin_root(&work)?;
        let id = id.map(str::to_string).unwrap_or_else(|| source.default_id());
        if !plugins::valid_id(&id) {
            return Err(Error::BadRequest(format!("{id:?} is not a plugin id (letters, digits, - and _): give one with --id")));
        }
        // the manifest must be one this Atlas reads, before anything in the vault changes
        let m = plugins::summary_of(&std::fs::read_to_string(from.join("plugin.toml"))?).map_err(|e| Error::BadRequest(format!("plugin.toml: {e}")))?;
        let dest = root.join(PLUGINS_DIR).join(&id);
        let mut replaced = None;
        if dest.exists() {
            if !replace {
                return Err(Error::BadRequest(format!("{PLUGINS_DIR}/{id} is already there: update it instead (or remove it first)")));
            }
            // the vault's settings live in .atlas/plugin-settings/, which an update never touches; an older copy's
            // [settings] move there before the copy goes to the Trash
            plugins::move_settings_out(root, &id)?;
            replaced = Some(to_trash(root, &id)?);
        }
        vault_write::cache::write(
            &from.join(SOURCE_FILE),
            format!("# Where this plugin was installed from (`atlas plugin update {id}` goes back there).\nkind = {:?}\nfrom = {:?}\ninstalled = {:?}\n{}", source.kind(), source.recorded(), chrono::Local::now().format("%Y-%m-%d").to_string(), commit.map(|c| format!("commit = {c:?}\n")).unwrap_or_default()).as_bytes(),
        )?;
        // a new plugin starts off — and the setting is written BEFORE its folder appears: an Atlas that
        // sees the folder first would start it for a moment (it did, in the tests)
        let on = if replaced.is_none() { set_off(root, &id, true).map(|_| false)? } else { !crate::workspace::Workspace::open(root)?.config()?.plugins.off.contains(&id) };
        vault_write::rename(&from, &dest)?;
        Ok(Installed { id, title: m.title, version: m.version, permissions: m.permissions, has_helper: m.has_helper, replaced, on })
    })();
    let _ = vault_write::cache::remove_dir_all(&work);
    result
}

/// A plugin a release offers (its `plugins.json`, written by scripts/dev/plugin-pack.mjs), as "Install a plugin" lists it.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct Available {
    pub id: String,
    pub title: String,
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// `stable` or `beta` (docs/guides/PLUGIN-MATURITY.md).
    pub tier: String,
    /// The archive's address: what installing it fetches, and what an update fetches again.
    pub url: String,
    /// Whether it runs where this vault is served: no engine, or one built for this platform.
    pub runs_here: bool,
    /// The version installed in this vault (empty: one without a version), none when it is not.
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed: Option<String>,
}

#[derive(Deserialize)]
struct IndexEntry {
    id: String,
    title: String,
    version: Option<String>,
    tier: String,
    file: String,
    platforms: Platforms,
}

/// `"any"` (plain files) or the platforms an engine was built for.
#[derive(Deserialize)]
#[serde(untagged)]
enum Platforms {
    Any(AnyWord),
    Built(Vec<String>),
}

/// Only the word `"any"`: another string is an index this Atlas does not read, not a plugin for every platform.
#[derive(Deserialize)]
enum AnyWord {
    #[serde(rename = "any")]
    Any,
}

/// The plugins the release at `index` (a plugins.json address) offers, marked with what this vault has.
pub fn available(root: &Path, index: &str) -> Result<Vec<Available>> {
    if index.trim().is_empty() {
        return Ok(Vec::new());
    }
    let work = root.join(format!(".atlas/cache/plugin-index-{}-{}.json", std::process::id(), stamp()));
    let got = download(index, &work).and_then(|_| Ok(std::fs::read_to_string(&work)?));
    let _ = vault_write::cache::remove_file(&work);
    let entries: Vec<IndexEntry> = serde_json::from_str(&got?).map_err(|e| Error::BadRequest(format!("{index}: not a plugin index: {e}")))?;
    let base = index.rsplit_once('/').map(|(b, _)| b).unwrap_or(index);
    let here = plugins::target();
    let have = plugins::list(root);
    Ok(entries
        .into_iter()
        .map(|e| Available {
            runs_here: match &e.platforms {
                Platforms::Any(_) => true,
                Platforms::Built(list) => list.contains(&here),
            },
            installed: have.iter().find(|p| p.id == e.id).map(|p| p.version.clone().unwrap_or_default()),
            url: format!("{base}/{}", e.file),
            id: e.id,
            title: e.title,
            version: e.version,
            tier: e.tier,
        })
        .collect())
}

/// Installs again from where the plugin came (`.source`).
pub fn update(root: &Path, id: &str) -> Result<Installed> {
    if !plugins::valid_id(id) {
        return Err(Error::BadRequest(format!("bad plugin id {id:?}")));
    }
    let text = std::fs::read_to_string(root.join(PLUGINS_DIR).join(id).join(SOURCE_FILE))
        .map_err(|_| Error::BadRequest(format!("plugin {id} was not installed from anywhere (no {SOURCE_FILE} in its folder): nothing to update from")))?;
    let t: toml::Table = toml::from_str(&text).map_err(|e| Error::BadRequest(format!("{SOURCE_FILE}: {e}")))?;
    let from = t.get("from").and_then(|v| v.as_str()).ok_or_else(|| Error::BadRequest(format!("{SOURCE_FILE}: no `from`")))?;
    // files the plugin made in its folder (an accounts list) are not in the source: they survive the update
    let dir = root.join(PLUGINS_DIR).join(id);
    let mut own = vec![];
    for e in walkdir::WalkDir::new(&dir).into_iter().flatten().filter(|e| e.file_type().is_file()) {
        if let Ok(rel) = e.path().strip_prefix(&dir) {
            own.push((rel.to_path_buf(), std::fs::read(e.path())?));
        }
    }
    let done = install(root, &Source::parse(from), Some(id), true)?;
    for (rel, bytes) in own {
        let to = dir.join(&rel);
        if !to.exists() {
            vault_write::write(&to, &bytes)?;
        }
    }
    Ok(done)
}

/// Takes a plugin out of the vault: its folder goes to `.atlas/trash/` (returned), nothing is deleted.
pub fn remove(root: &Path, id: &str) -> Result<String> {
    if !plugins::valid_id(id) || !root.join(PLUGINS_DIR).join(id).is_dir() {
        return Err(Error::NotFound(format!("{PLUGINS_DIR}/{id}")));
    }
    let to = to_trash(root, id)?;
    set_off(root, id, false)?;
    Ok(to)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(dir: &Path, version: &str) -> PathBuf {
        let p = dir.join("dice-plugin");
        std::fs::create_dir_all(p.join(".git")).unwrap();
        std::fs::write(p.join(".git/HEAD"), "x").unwrap();
        std::fs::write(p.join("main.js"), format!("// {version}\n")).unwrap();
        std::fs::write(p.join("plugin.toml"), format!("title = \"Dice\"\nversion = \"{version}\"\n\n[settings]\nsides = 6\n\n[[setting]]\nkey = \"sides\"\nkind = \"number\"\n\n[permissions]\nnet = [\"dice.example.org\"]\n")).unwrap();
        p
    }

    #[test]
    fn sources_are_told_apart_by_shape() {
        assert_eq!(Source::parse("https://example.org/me/atlas-dice.git"), Source::Git("https://example.org/me/atlas-dice.git".into()));
        assert_eq!(Source::parse("git@example.org:me/atlas-dice"), Source::Git("git@example.org:me/atlas-dice".into()));
        assert_eq!(Source::parse("~/Downloads/dice.tar.gz"), Source::Archive("~/Downloads/dice.tar.gz".into()));
        assert_eq!(Source::parse("../plugins/dice"), Source::Folder("../plugins/dice".into()));
        assert_eq!(Source::parse("https://example.org/me/atlas-dice.git").default_id(), "atlas-dice");
        assert_eq!(Source::parse("git@example.org:me/My Dice").default_id(), "My-Dice");
        assert_eq!(Source::parse("/x/dice v2.tar.gz").default_id(), "dice-v2");
        // a release asset: downloaded, and named without the archives' prefix
        let latest = "https://example.org/me/atlas/releases/latest/download/atlas-plugin-dice.tar.gz";
        assert_eq!(Source::parse(latest), Source::Download(latest.into()));
        assert_eq!(Source::parse(latest).default_id(), "dice");
        assert_eq!(Source::parse("https://example.org/dice.zip?token=x").default_id(), "dice");
        assert_eq!(Source::parse("https://example.org/me/dice"), Source::Git("https://example.org/me/dice".into()));
    }

    #[test]
    fn a_plugin_is_copied_in_switched_off_updated_keeping_its_settings_and_removed_to_the_trash() {
        let (vault, elsewhere) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let root = vault.path();
        let src = source(elsewhere.path(), "0.1.0");
        let got = install(root, &Source::Folder(src.clone()), None, false).unwrap();
        assert_eq!((got.id.as_str(), got.title.as_str(), got.version.as_deref(), got.on, &got.replaced), ("dice-plugin", "Dice", Some("0.1.0"), false, &None));
        assert_eq!(got.permissions.net, ["dice.example.org"]);
        let dir = root.join(PLUGINS_DIR).join("dice-plugin");
        assert!(dir.join("main.js").is_file() && !dir.join(".git").exists(), "its files, not its version control");
        assert!(std::fs::read_to_string(root.join(".atlas/config.toml")).unwrap().contains("off = [\"dice-plugin\"]"), "it starts switched off");
        assert!(std::fs::read_to_string(dir.join(SOURCE_FILE)).unwrap().contains("kind = \"folder\""));
        assert!(install(root, &Source::Folder(src.clone()), None, false).is_err(), "a second install does not overwrite");
        // a tool's hidden folder stays behind; a relative source is kept absolute (an update from anywhere finds it)
        std::fs::create_dir_all(src.join(".claude/.cc-writes")).unwrap();
        let rel = Source::Folder(src.strip_prefix(std::env::current_dir().unwrap()).map(Path::to_path_buf).unwrap_or_else(|_| src.clone()));
        install(root, &rel, Some("dice-again"), false).unwrap();
        let again = root.join(PLUGINS_DIR).join("dice-again");
        assert!(!again.join(".claude").exists(), "no hidden folder copied");
        assert!(std::fs::read_to_string(again.join(SOURCE_FILE)).unwrap().contains(&format!("from = {:?}", src.to_string_lossy())));
        remove(root, "dice-again").unwrap();

        // the user changes a setting and switches it on; the author ships 0.2.0; update
        std::fs::write(dir.join("plugin.toml"), std::fs::read_to_string(dir.join("plugin.toml")).unwrap().replace("sides = 6", "sides = 20")).unwrap();
        set_off(root, "dice-plugin", false).unwrap();
        source(elsewhere.path(), "0.2.0");
        let up = update(root, "dice-plugin").unwrap();
        assert_eq!((up.version.as_deref(), up.on), (Some("0.2.0"), true), "the new code, still switched on");
        let text = std::fs::read_to_string(dir.join("plugin.toml")).unwrap();
        assert!(text.contains("version = \"0.2.0\""), "the new manifest: {text}");
        let own = std::fs::read_to_string(root.join(".atlas/plugin-settings/dice-plugin.toml")).unwrap();
        assert!(own.contains("sides = 20"), "the vault's own setting survived, in its settings file: {own}");
        assert_eq!(crate::plugins::list(root)[0].settings["sides"], serde_json::json!(20));
        let old = root.join(up.replaced.unwrap());
        assert!(std::fs::read_to_string(old.join("main.js")).unwrap().contains("0.1.0"), "the old copy is in the trash, not gone");

        let to = remove(root, "dice-plugin").unwrap();
        assert!(!dir.exists() && root.join(to).join("plugin.toml").is_file());
        assert!(remove(root, "dice-plugin").is_err());

        // not a plugin, a bad id, a manifest this Atlas does not read: refused, the vault untouched
        assert!(install(root, &Source::Folder(elsewhere.path().join("nothing")), None, false).is_err());
        assert!(install(root, &Source::Folder(src.clone()), Some("../x"), false).is_err());
        std::fs::write(src.join("plugin.toml"), "titel = \"typo\"\n").unwrap();
        assert!(install(root, &Source::Folder(src), Some("bad"), false).is_err());
        assert!(!root.join(PLUGINS_DIR).join("bad").exists());
    }

    #[test]
    fn a_git_source_is_cloned_without_its_history_and_remembers_its_commit() {
        let (vault, elsewhere) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        // a repository on disk named like a remote (`….git`): the git path, without a network
        let repo = elsewhere.path().join("dice.git");
        std::fs::create_dir_all(&repo).unwrap();
        std::fs::write(repo.join("plugin.toml"), "title = \"Dice\"\nversion = \"2.0.0\"\n").unwrap();
        std::fs::write(repo.join("main.js"), "// v2\n").unwrap();
        let git = |args: &[&str]| assert!(std::process::Command::new("git").arg("-C").arg(&repo).args(args).output().unwrap().status.success(), "git {args:?}");
        git(&["init", "-q"]);
        git(&["-c", "user.name=T", "-c", "user.email=t@example.org", "add", "."]);
        git(&["-c", "user.name=T", "-c", "user.email=t@example.org", "commit", "-q", "-m", "v2"]);
        let got = install(vault.path(), &Source::parse(&repo.to_string_lossy()), None, false).unwrap();
        assert_eq!((got.id.as_str(), got.version.as_deref()), ("dice", Some("2.0.0")));
        let dir = vault.path().join(PLUGINS_DIR).join("dice");
        assert!(dir.join("main.js").is_file() && !dir.join(".git").exists(), "a copy, not a checkout");
        let source = std::fs::read_to_string(dir.join(SOURCE_FILE)).unwrap();
        assert!(source.contains("kind = \"git\"") && source.contains("commit = \""), "{source}");
    }

    #[test]
    fn an_archive_of_one_folder_installs_as_that_plugin() {
        let (vault, elsewhere) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        source(elsewhere.path(), "1.0.0");
        let tar = elsewhere.path().join("dice.tar.gz");
        let made = std::process::Command::new("tar").arg("-czf").arg(&tar).arg("-C").arg(elsewhere.path()).arg("dice-plugin").status().unwrap();
        assert!(made.success());
        let got = install(vault.path(), &Source::parse(&tar.to_string_lossy()), None, false).unwrap();
        assert_eq!((got.id.as_str(), got.version.as_deref()), ("dice", Some("1.0.0")), "named by the archive");
        assert!(vault.path().join(PLUGINS_DIR).join("dice/main.js").is_file());
    }

    /// Serves `body` once on a local port; returns the port.
    fn serve_once(body: Vec<u8>) -> u16 {
        let server = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = server.local_addr().unwrap().port();
        std::thread::spawn(move || {
            use std::io::{Read, Write};
            let (mut c, _) = server.accept().unwrap();
            let mut req = [0u8; 4096];
            let _ = c.read(&mut req);
            let _ = c.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).as_bytes());
            let _ = c.write_all(&body);
        });
        port
    }

    /// A release's index: each archive's address beside it, whether it runs here, and what the vault already has.
    #[test]
    fn a_release_index_lists_what_runs_here_and_what_is_installed() {
        let (vault, elsewhere) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        source(elsewhere.path(), "1.0.0");
        install(vault.path(), &Source::Folder(elsewhere.path().join("dice-plugin")), Some("dice"), false).unwrap();
        let index = serde_json::json!([
            {"id": "dice", "title": "Dice", "version": "1.1.0", "tier": "beta", "file": "atlas-plugin-dice.tar.gz", "platforms": "any", "size": 1, "sha256": "x"},
            {"id": "nowhere", "title": "Nowhere", "version": null, "tier": "stable", "file": "atlas-plugin-nowhere.tar.gz", "platforms": ["sparc-plan9"], "size": 1, "sha256": "x"},
        ]);
        let port = serve_once(index.to_string().into_bytes());
        let got = available(vault.path(), &format!("http://127.0.0.1:{port}/releases/latest/download/plugins.json")).unwrap();
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].url, format!("http://127.0.0.1:{port}/releases/latest/download/atlas-plugin-dice.tar.gz"));
        assert_eq!((got[0].runs_here, got[0].installed.as_deref()), (true, Some("1.0.0")));
        assert_eq!((got[1].runs_here, got[1].installed.as_deref()), (false, None));
        assert!(available(vault.path(), "").unwrap().is_empty(), "no index set: nothing offered");
    }

    /// A release asset's address: fetched (here from a one-shot local server), unpacked, and kept as the source.
    #[test]
    fn an_archive_address_is_downloaded_and_installed() {
        let (vault, elsewhere) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        source(elsewhere.path(), "1.2.0");
        let tar = elsewhere.path().join("pack.tar.gz");
        assert!(std::process::Command::new("tar").arg("-czf").arg(&tar).arg("-C").arg(elsewhere.path()).arg("dice-plugin").status().unwrap().success());
        let port = serve_once(std::fs::read(&tar).unwrap());
        let url = format!("http://127.0.0.1:{port}/download/atlas-plugin-dice.tar.gz");
        let got = install(vault.path(), &Source::parse(&url), None, false).unwrap();
        assert_eq!((got.id.as_str(), got.version.as_deref()), ("dice", Some("1.2.0")));
        let dir = vault.path().join(PLUGINS_DIR).join("dice");
        assert!(dir.join("main.js").is_file());
        let kept = std::fs::read_to_string(dir.join(SOURCE_FILE)).unwrap();
        assert!(kept.contains("kind = \"download\"") && kept.contains(&url), "{kept}");
        let left: Vec<_> = std::fs::read_dir(vault.path().join(".atlas/cache")).unwrap().flatten().map(|e| e.file_name()).collect();
        assert!(left.is_empty(), "the download and the work folder are gone: {left:?}");
    }
}
