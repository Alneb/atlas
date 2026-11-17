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
    /// What the plugins it replaces (`replaces`) left, moved to the trash: their folders and settings files.
    pub adopted: Vec<String>,
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

/// The newest change of a file under `dir` (its `target/` build folder left out), None when there is no file.
fn newest(dir: &Path) -> Option<std::time::SystemTime> {
    walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_entry(|e| e.file_name() != "target")
        .flatten()
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok()?.modified().ok())
        .max()
}

/// A folder whose compiled engine is older than its source is refused: the plugin would ship a binary that lacks
/// what its manifest and page already call (a method added to `engine/src` after the last build). Checked for this
/// computer's build (`bin/<target>/`, else all of `bin/`); a folder with no engine or no build is let through.
fn stale_engine(dir: &Path) -> Result<()> {
    let engine = dir.join("engine");
    if !engine.join("Cargo.toml").is_file() {
        return Ok(());
    }
    let bin = Some(dir.join("bin").join(plugins::target())).filter(|b| b.is_dir()).unwrap_or_else(|| dir.join("bin"));
    let (Some(built), Some(source)) = (newest(&bin), newest(&engine)) else { return Ok(()) };
    if built < source {
        let day = |t: std::time::SystemTime| chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%d %H:%M").to_string();
        return Err(Error::BadRequest(format!(
            "{}: its engine build ({}) is older than its source ({}): rebuild it first (bash engine/build.sh)",
            dir.display(),
            day(built),
            day(source)
        )));
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
            stale_engine(p)?;
            copy_dir(p, work)?;
            Ok(None)
        }
        Source::Git(url) => {
            let mut clone = std::process::Command::new("git");
            clone.args(["clone", "--quiet", "--depth", "1", "--", url]).arg(work);
            run(&mut crate::platform::host::std_command(clone)?, "git clone")?;
            let mut head = std::process::Command::new("git");
            head.arg("-C").arg(work).args(["rev-parse", "HEAD"]);
            let out = crate::platform::host::std_command(head)?.output()?;
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

/// Unpacks an archive into `work` (paths that would leave it refused). On macOS the quarantine mark of a downloaded archive would stop the plugin's
/// programs from starting, so it is taken off what was unpacked (the plugin is installed off: a person switches it on).
fn unpack(archive: &Path, work: &Path) -> Result<()> {
    vault_write::cache::mkdir(work)?;
    // zip and tar(.gz) in process, the same on every system (programs' modes kept); another compression by tar
    if !crate::convert::unpack_whole(archive, work).map_err(|e| Error::CommandFailed(format!("unpacking the plugin: {e}")))? {
        run(std::process::Command::new("tar").arg("-xf").arg(archive).arg("-C").arg(work), "tar")?;
    }
    if cfg!(target_os = "macos") {
        let _ = std::process::Command::new("xattr").args(["-dr", "com.apple.quarantine"]).arg(work).output();
    }
    Ok(())
}

/// Fetches `url` into `to` (redirects followed: a release's `latest/download/…` address is one).
fn download(url: &str, to: &Path) -> Result<()> {
    let client = reqwest::blocking::Client::builder().use_preconfigured_tls(crate::tls_chain::config())
        .user_agent(concat!("atlas/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| Error::CommandFailed(format!("download: {e}")))?;
    // the address without its query in what is said: a release's address may carry a token there
    let shown = url.split(['?', '#']).next().unwrap_or(url);
    let failed = |e: reqwest::Error| Error::CommandFailed(format!("download {shown}: {}", e.without_url()));
    let mut res = client.get(url).send().and_then(|r| r.error_for_status()).map_err(failed)?;
    // streamed to the file, not held whole in memory
    let mut file = vault_write::cache::file(to)?;
    res.copy_to(&mut file).map_err(failed)?;
    Ok(())
}

fn stamp() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

/// Moves a plugin folder to the vault's trash; returns where (relative to the vault).
fn to_trash(root: &Path, id: &str) -> Result<String> {
    crate::files::to_vault_trash(root, &format!("{PLUGINS_DIR}/{id}"))
}

/// Plugin `id` takes the place of those it `replaces`: each one's settings carried into its own (renamed where the
/// manifest says; its keys win), its secrets copied where it has none of that name, its settings file and folder moved
/// to the trash, its id taken out of `[plugins] off`. When the vault had replaced plugins and every one was off, `id`
/// is switched off too — only while `id` is `fresh` (new to this vault), never a plugin the vault already used. Returns
/// what went to the trash; a vault with none of them is left as it is, so this runs at every start.
pub fn adopt_replaced(root: &Path, secrets: &crate::secrets::Store, id: &str, fresh: bool) -> Result<Vec<String>> {
    let off = crate::workspace::Workspace::open(root)?.config()?.plugins.off;
    let mut trashed = Vec::new();
    let mut had = Vec::new();
    for r in plugins::replaces(root, id) {
        let folder = root.join(PLUGINS_DIR).join(&r.id);
        if folder.is_dir() {
            had.push(off.contains(&r.id));
            if off.contains(&r.id) {
                plugins::settings_if_off(root, &r, id)?;
            }
        }
        if plugins::carry_settings(root, &r, id)? {
            trashed.push(crate::files::to_vault_trash(root, &plugins::settings_path(&r.id))?);
        }
        for name in secrets.names(&r.id)? {
            let new = r.renamed(&name);
            if secrets.get(id, new)?.is_none() {
                if let Some(v) = secrets.get(&r.id, &name)? {
                    secrets.set(id, new, &v)?;
                }
            }
        }
        if folder.is_dir() {
            trashed.push(to_trash(root, &r.id)?);
        }
        if off.contains(&r.id) {
            set_off(root, &r.id, false)?;
        }
    }
    if fresh && !had.is_empty() && had.iter().all(|was_off| *was_off) {
        set_off(root, id, true)?;
    }
    Ok(trashed)
}

/// [`adopt_replaced`] for every plugin of the vault, at its start: a merged plugin copied in by hand (not installed)
/// takes over too. "Fresh" there means the vault has no settings file for it yet. Failures are said on stderr.
pub fn adopt_all_replaced(root: &Path) {
    let secrets = crate::secrets::Store::for_vault(root);
    for p in plugins::list(root).into_iter().filter(|p| p.error.is_none()) {
        let fresh = !root.join(plugins::settings_path(&p.id)).exists();
        match adopt_replaced(root, &secrets, &p.id, fresh) {
            Ok(moved) if !moved.is_empty() => eprintln!("atlas: plugin {} took over what it replaces; moved to the trash: {}", p.id, moved.join(", ")),
            Ok(_) => {}
            Err(e) => eprintln!("atlas: plugin {}: taking over the plugins it replaces failed: {e}", p.id),
        }
    }
}

/// `[plugins] off` of the vault's config: `id` in it or out of it (comments kept).
pub fn set_off(root: &Path, id: &str, off: bool) -> Result<()> {
    let path = root.join(".atlas/config.toml");
    // under the lock Settings saves take (Config::save): a switch and a save at once both stay
    vault_write::locked(&path, || set_off_in(&path, id, off))
}

fn set_off_in(path: &Path, id: &str, off: bool) -> Result<()> {
    let text = std::fs::read_to_string(path).unwrap_or_default();
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
    vault_write::write(path, doc.to_string().as_bytes())
}

/// Installs (or, with `replace`, updates) a plugin. An update keeps the vault's own `[settings]`.
pub fn install(root: &Path, source: &Source, id: Option<&str>, replace: bool) -> Result<Installed> {
    // two installs at once (Update clicked on two plugins) each get their own folder
    let work = vault_write::cache::unique(&root.join(format!(".atlas/cache/plugin-install-{}", stamp())));
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
        if dest.exists() && !replace {
            return Err(Error::BadRequest(format!("{PLUGINS_DIR}/{id} is already there: update it instead (or remove it first)")));
        }
        // the files the release brought: an update carries over only the others (the plugin's own), so a file a later
        // release drops does not come back
        let shipped: Vec<String> = walkdir::WalkDir::new(&from)
            .into_iter()
            .flatten()
            .filter(|e| e.file_type().is_file())
            .filter_map(|e| e.path().strip_prefix(&from).ok().map(|r| r.to_string_lossy().replace('\\', "/")))
            .collect();
        // and what they were, so a later look can tell a copy changed in the vault from the one installed (`changed_here`)
        let digest = digest_of(&from, &shipped);
        let listed = toml::Value::Array(shipped.into_iter().map(toml::Value::String).collect());
        vault_write::cache::write(
            &from.join(SOURCE_FILE),
            format!("# Where this plugin was installed from (`atlas plugin update {id}` goes back there).\nkind = {:?}\nfrom = {:?}\ninstalled = {:?}\n{}shipped = {listed}\ndigest = {digest:?}\n", source.kind(), source.recorded(), chrono::Local::now().format("%Y-%m-%d").to_string(), commit.map(|c| format!("commit = {c:?}\n")).unwrap_or_default()).as_bytes(),
        )?;
        // a plugin installed is meant to be used: it starts on, also when an earlier copy had been switched off (an
        // update keeps whatever the vault chose)
        let on = if !dest.exists() { set_off(root, &id, false).map(|_| true)? } else { !crate::workspace::Workspace::open(root)?.config()?.plugins.off.contains(&id) };
        // from here on the old copy is in the Trash: only the move into place is left to fail
        let mut replaced = None;
        if dest.exists() {
            // the vault's settings live in .atlas/plugin-settings/, which an update never touches; an older copy's
            // [settings] move there before the copy goes to the Trash
            plugins::move_settings_out(root, &id)?;
            replaced = Some(to_trash(root, &id)?);
        }
        if let Err(e) = vault_write::rename(&from, &dest) {
            // the old copy back from the Trash: a failed update must not leave the vault without the plugin
            if let Some(t) = &replaced {
                let _ = vault_write::rename(&root.join(t), &dest);
            }
            return Err(e);
        }
        let adopted = adopt_replaced(root, &crate::secrets::Store::for_vault(root), &id, replaced.is_none())?;
        Ok(Installed { id, title: m.title, version: m.version, permissions: m.permissions, has_helper: m.has_helper, replaced, on, adopted })
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
    /// What it does, in a line (its manifest's `description`; an older index has none).
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Its icon, an Atlas icon name (its manifest's `icon`).
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// The archive's size in bytes, when the index says it.
    #[ts(optional, type = "number")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    /// Installed here at an older version than the release's: an update is there to take (never a downgrade).
    pub update: bool,
}

#[derive(Deserialize)]
struct IndexEntry {
    id: String,
    title: String,
    version: Option<String>,
    tier: String,
    file: String,
    platforms: Platforms,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    icon: Option<String>,
    #[serde(default)]
    size: Option<u64>,
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

/// Whether version `a` is after `b`, number by number (`1.10.0` after `1.9.2`); a part that is not a number counts as 0,
/// and an installed copy without a version is older than any.
fn newer(a: &str, b: &str) -> bool {
    let parts = |v: &str| v.trim().trim_start_matches('v').split(['.', '-', '+']).map(|x| x.parse::<u64>().unwrap_or(0)).collect::<Vec<_>>();
    b.trim().is_empty() || parts(a) > parts(b)
}

/// The plugins the release at `index` (a plugins.json address) offers, marked with what this vault has.
pub fn available(root: &Path, index: &str) -> Result<Vec<Available>> {
    if index.trim().is_empty() {
        return Ok(Vec::new());
    }
    let work = vault_write::cache::unique(&root.join(format!(".atlas/cache/plugin-index-{}", stamp()))).with_extension("json");
    let got = download(index, &work).and_then(|_| Ok(std::fs::read_to_string(&work)?));
    let _ = vault_write::cache::remove_file(&work);
    let entries: Vec<IndexEntry> = serde_json::from_str(&got?).map_err(|e| Error::BadRequest(format!("{index}: not a plugin index: {e}")))?;
    let base = index.rsplit_once('/').map(|(b, _)| b).unwrap_or(index);
    let here = plugins::target();
    let have = plugins::list(root);
    Ok(entries
        .into_iter()
        .map(|e| {
            let installed = have.iter().find(|p| p.id == e.id).map(|p| p.version.clone().unwrap_or_default());
            Available {
                runs_here: match &e.platforms {
                    Platforms::Any(_) => true,
                    Platforms::Built(list) => list.contains(&here),
                },
                update: installed.as_deref().is_some_and(|v| e.version.as_deref().is_some_and(|r| newer(r, v))),
                installed,
                url: format!("{base}/{}", e.file),
                id: e.id,
                title: e.title,
                version: e.version,
                tier: e.tier,
                description: e.description,
                icon: e.icon,
                size: e.size,
            }
        })
        .collect())
}

/// Installs again from where the plugin came (`.source`).
pub fn update(root: &Path, id: &str) -> Result<Installed> {
    if !plugins::valid_id(id) {
        return Err(Error::BadRequest(format!("bad plugin id {id:?}")));
    }
    let t = source_record(root, id).ok_or_else(|| Error::BadRequest(format!("plugin {id} was not installed from anywhere (no readable {SOURCE_FILE} in its folder): nothing to update from")))?;
    let from = t.get("from").and_then(|v| v.as_str()).ok_or_else(|| Error::BadRequest(format!("{SOURCE_FILE}: no `from`")))?;
    reinstall(root, id, &Source::parse(from))
}

/// The `.source` an install left in plugin `id`'s folder, read; None when there is none or it does not parse.
fn source_record(root: &Path, id: &str) -> Option<toml::Table> {
    toml::from_str(&std::fs::read_to_string(root.join(PLUGINS_DIR).join(id).join(SOURCE_FILE)).ok()?).ok()
}

/// The files the last install of `id` brought (`shipped`; an install from before it was kept, or a copy made by hand:
/// none known).
fn shipped_of(record: Option<&toml::Table>) -> Vec<String> {
    record.and_then(|t| t.get("shipped")?.as_array().cloned()).into_iter().flatten().filter_map(|v| v.as_str().map(str::to_string)).collect()
}

/// Plugin `id`, already in the vault, installed over from `source`. Files the plugin made in its folder (an accounts
/// list) are not in the source: they survive. The ones the last install brought do not (a file a later version drops
/// does not come back).
fn reinstall(root: &Path, id: &str, source: &Source) -> Result<Installed> {
    let shipped: std::collections::HashSet<String> = shipped_of(source_record(root, id).as_ref()).into_iter().collect();
    let dir = root.join(PLUGINS_DIR).join(id);
    let mut own = vec![];
    for e in walkdir::WalkDir::new(&dir).into_iter().flatten().filter(|e| e.file_type().is_file()) {
        if let Ok(rel) = e.path().strip_prefix(&dir) {
            let rel_s = rel.to_string_lossy().replace('\\', "/");
            if rel_s != SOURCE_FILE && !shipped.contains(&rel_s) {
                own.push((rel.to_path_buf(), std::fs::read(e.path())?));
            }
        }
    }
    let done = install(root, source, Some(id), true)?;
    for (rel, bytes) in own {
        let _ = vault_write::create(&dir.join(&rel), &bytes)?; // one the new version ships wins
    }
    Ok(done)
}

/// One fingerprint of a plugin's files as installed (sha-256 over each path and its bytes, in order). `plugin.toml` is
/// left out: older vaults keep their settings in it and the phone's own settings form rewrites it, and an update
/// carries those settings over anyway (`move_settings_out`). A file listed but missing counts as a change.
fn digest_of(dir: &Path, files: &[String]) -> String {
    use sha2::Digest;
    let mut names: Vec<&String> = files.iter().filter(|f| *f != "plugin.toml" && *f != SOURCE_FILE).collect();
    names.sort();
    let mut h = sha2::Sha256::new();
    for f in names {
        h.update(f.as_bytes());
        h.update([0]);
        match std::fs::read(dir.join(f)) {
            Ok(bytes) => {
                h.update((bytes.len() as u64).to_le_bytes());
                h.update(&bytes);
            }
            Err(_) => h.update(b"\x01missing"),
        }
    }
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Whether plugin `id`'s folder was changed in the vault since it was installed: its shipped files no longer match the
/// digest the install recorded. Unknown (no `.source`, or one from before digests were kept) is "not changed": the
/// caller then relies on the version alone.
fn changed_here(root: &Path, id: &str) -> bool {
    let Some(t) = source_record(root, id) else { return false };
    let Some(recorded) = t.get("digest").and_then(|v| v.as_str()) else { return false };
    digest_of(&root.join(PLUGINS_DIR).join(id), &shipped_of(Some(&t))) != recorded
}

// ---- the plugins an app carries (the phone app's APK: crates/atlas-android/build-apk.sh, scripts/dev/bundle-plugins.mjs)

/// What [`sync_bundled`] did to a vault, for the app to say in a line.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct BundledReport {
    /// Plugins the vault had at an older version, now the carried one.
    pub updated: Vec<BundledChange>,
    /// Carried plugins installed in place of older plugins the vault had (`replaces`); those went to the trash.
    pub replaced: Vec<BundledChange>,
    /// Plugins with a newer carried version that were not touched, and why (changed in the vault, the install failed).
    pub left: Vec<BundledLeft>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct BundledChange {
    pub id: String,
    pub title: String,
    /// The vault's version before (an update; None: it had none).
    pub from: Option<String>,
    pub to: Option<String>,
    /// The plugins it took the place of (a replacement).
    pub replaces: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct BundledLeft {
    pub id: String,
    pub title: String,
    pub why: String,
}

/// What to do with one carried plugin in a vault: an exhaustive set, decided before anything is written.
#[derive(Debug, PartialEq)]
enum BundledStep {
    /// The vault has it at an older version and unchanged: install the carried one over it.
    Update { from: Option<String> },
    /// The vault lacks it but has plugins it replaces: install it, which retires them (`adopt_replaced`).
    Replace(Vec<String>),
    /// The vault has an older copy changed in place: left as it is, and said.
    Leave(String),
    /// Same or newer here, or a plugin this vault never had: the vault decides.
    Nothing,
}

/// The vault's own copy's `version` (its manifest read loosely: one this Atlas no longer parses still says it).
fn vault_version(root: &Path, id: &str) -> Option<String> {
    let text = std::fs::read_to_string(root.join(PLUGINS_DIR).join(id).join("plugin.toml")).ok()?;
    toml::from_str::<toml::Table>(&text).ok()?.get("version")?.as_str().map(str::to_string)
}

fn bundled_step(root: &Path, id: &str, carried: &plugins::Summary) -> BundledStep {
    if root.join(PLUGINS_DIR).join(id).is_dir() {
        let have = vault_version(root, id);
        let Some(to) = carried.version.as_deref() else { return BundledStep::Nothing };
        if !newer(to, have.as_deref().unwrap_or_default()) {
            return BundledStep::Nothing;
        }
        if changed_here(root, id) {
            return BundledStep::Leave(format!("changed in this vault since it was installed ({} here, {to} in the app)", have.as_deref().unwrap_or("no version")));
        }
        return BundledStep::Update { from: have };
    }
    let had: Vec<String> = carried.replaces.iter().filter(|r| root.join(PLUGINS_DIR).join(r).is_dir()).cloned().collect();
    if had.is_empty() { BundledStep::Nothing } else { BundledStep::Replace(had) }
}

/// The carried plugins in `bundled` (one folder per id, each holding its `plugin.toml`), read; a folder that does not
/// read as a plugin this Atlas runs is skipped and said on stderr.
fn carried(bundled: &Path) -> Vec<(String, PathBuf, plugins::Summary)> {
    let mut out: Vec<_> = std::fs::read_dir(bundled)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().join("plugin.toml").is_file())
        .filter_map(|e| {
            let id = e.file_name().to_string_lossy().into_owned();
            let text = std::fs::read_to_string(e.path().join("plugin.toml")).ok()?;
            match plugins::summary_of(&text) {
                Ok(m) if plugins::valid_id(&id) => Some((id, e.path(), m)),
                Ok(_) => None,
                Err(why) => {
                    eprintln!("atlas: carried plugin {id}: {why}");
                    None
                }
            }
        })
        .collect();
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

/// Brings the vault's plugins up to the versions an app carries (`bundled`): each one the vault has at an older
/// version is updated through the install path (its settings and own files kept, the old copy to the trash); each one
/// that replaces plugins the vault has is installed in their place. A copy changed in the vault is left and reported.
/// Plugins the vault does not have and that replace nothing are not added: the vault decides (`add_bundled`).
pub fn sync_bundled(root: &Path, bundled: &Path) -> BundledReport {
    let mut report = BundledReport::default();
    for (id, dir, m) in carried(bundled) {
        let left = |why: String| BundledLeft { id: id.clone(), title: m.title.clone(), why };
        match bundled_step(root, &id, &m) {
            BundledStep::Nothing => {}
            BundledStep::Leave(why) => report.left.push(left(why)),
            BundledStep::Update { from } => {
                let before = source_record(root, &id);
                let updated = reinstall(root, &id, &Source::Folder(dir.clone())).and_then(|_| keep_origin(root, &id, before.as_ref()));
                match updated {
                    Ok(()) => report.updated.push(BundledChange { id: id.clone(), title: m.title.clone(), from, to: m.version.clone(), replaces: vec![] }),
                    Err(e) => report.left.push(left(format!("the update failed: {e}"))),
                }
            }
            BundledStep::Replace(had) => match install(root, &Source::Folder(dir.clone()), Some(&id), false) {
                Ok(_) => report.replaced.push(BundledChange { id: id.clone(), title: m.title.clone(), from: None, to: m.version.clone(), replaces: had }),
                Err(e) => report.left.push(left(format!("installing it in place of {} failed: {e}", had.join(", ")))),
            },
        }
    }
    report
}

/// After an update from the app's carried copy: a `.source` that pointed somewhere every device reaches (a release's
/// address, a git repository) keeps pointing there, so `atlas plugin update` on a desktop sharing the vault still
/// works; the record of what was installed (`shipped`, `digest`) is the new one's.
fn keep_origin(root: &Path, id: &str, before: Option<&toml::Table>) -> Result<()> {
    let reachable = |t: &toml::Table| matches!(t.get("kind").and_then(|v| v.as_str()), Some("git" | "download"));
    let (Some(old), Some(mut now)) = (before.filter(|t| reachable(t)), source_record(root, id)) else { return Ok(()) };
    for k in ["kind", "from"] {
        if let Some(v) = old.get(k) {
            now.insert(k.into(), v.clone());
        }
    }
    now.remove("commit"); // the carried copy is not that commit
    let text = toml::to_string(&now).map_err(|e| Error::BadRequest(format!("{SOURCE_FILE}: {e}")))?;
    vault_write::write(&root.join(PLUGINS_DIR).join(id).join(SOURCE_FILE), format!("# Where this plugin was installed from (`atlas plugin update {id}` goes back there); updated from the copy an app carries.\n{text}").as_bytes())
}

/// Plugin `id` of those an app carries, added to a vault that lacks it (the person chose it in Settings).
pub fn add_bundled(root: &Path, bundled: &Path, id: &str) -> Result<Installed> {
    if !plugins::valid_id(id) || !bundled.join(id).join("plugin.toml").is_file() {
        return Err(Error::NotFound(format!("no carried plugin {id}")));
    }
    install(root, &Source::Folder(bundled.join(id)), Some(id), false)
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
    #[test]
    fn an_update_is_a_newer_version_never_an_older_one() {
        assert!(newer("1.8.1", "1.8.0") && newer("1.10.0", "1.9.2") && newer("0.2.0", ""));
        assert!(!newer("1.8.0", "1.8.1") && !newer("1.8.0", "1.8.0") && !newer("1.8.0", "v1.8.0"));
    }

    #[test]
    fn a_folder_whose_engine_build_is_older_than_its_source_is_refused() {
        let d = tempfile::tempdir().unwrap();
        let (bin, src) = (d.path().join("bin").join(crate::plugins::target()), d.path().join("engine/src"));
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(d.path().join("engine/Cargo.toml"), "[package]\n").unwrap();
        std::fs::write(src.join("main.rs"), "fn main() {}\n").unwrap();
        std::fs::write(bin.join("engine"), b"old").unwrap();
        let set = |p: &std::path::Path, secs: u64| filetime::set_file_mtime(p, filetime::FileTime::from_unix_time(secs as i64, 0)).unwrap();
        set(&bin.join("engine"), 1_000);
        set(&src.join("main.rs"), 2_000);
        set(&d.path().join("engine/Cargo.toml"), 1_000);
        let e = super::stale_engine(d.path()).unwrap_err().to_string();
        assert!(e.contains("older than its source"), "{e}");
        set(&bin.join("engine"), 3_000);
        super::stale_engine(d.path()).unwrap();
        // a build folder of the engine's own is not its source
        std::fs::create_dir_all(d.path().join("engine/target")).unwrap();
        std::fs::write(d.path().join("engine/target/x"), b"").unwrap();
        set(&d.path().join("engine/target/x"), 9_000);
        super::stale_engine(d.path()).unwrap();
    }

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
        std::fs::write(src.join("old.js"), "// dropped by 0.2.0").unwrap();
        let got = install(root, &Source::Folder(src.clone()), None, false).unwrap();
        assert_eq!((got.id.as_str(), got.title.as_str(), got.version.as_deref(), got.on, &got.replaced), ("dice-plugin", "Dice", Some("0.1.0"), true, &None));
        assert_eq!(got.permissions.net, ["dice.example.org"]);
        let dir = root.join(PLUGINS_DIR).join("dice-plugin");
        assert!(dir.join("main.js").is_file() && !dir.join(".git").exists(), "its files, not its version control");
        assert!(!crate::workspace::Workspace::open(root).unwrap().config().unwrap().plugins.off.contains(&"dice-plugin".to_string()), "it starts switched on");
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
        std::fs::remove_file(src.join("old.js")).unwrap();
        std::fs::write(dir.join("accounts.json"), "[]").unwrap(); // made by the plugin itself
        let up = update(root, "dice-plugin").unwrap();
        assert!(dir.join("accounts.json").is_file() && !dir.join("old.js").exists(), "the plugin's own file kept, the dropped one not brought back");
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

    /// The plugins an app carries: an older unchanged copy is updated (its settings and own files kept), the same
    /// version is left alone, one replacing a plugin the vault has is installed in its place (the old one to the
    /// trash, its settings carried), an older copy changed in the vault is left and said, and a plugin the vault never
    /// had is not added until asked.
    #[test]
    fn bundled_plugins_update_older_copies_replace_retired_ones_and_leave_changed_ones() {
        let (vault, elsewhere, app) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let root = vault.path();
        let plugin = |dir: &Path, id: &str, toml: &str, js: &str| {
            let d = dir.join(id);
            std::fs::create_dir_all(&d).unwrap();
            std::fs::write(d.join("plugin.toml"), toml).unwrap();
            std::fs::write(d.join("main.js"), js).unwrap();
            d
        };
        let put = |rel: &str, text: &str| {
            std::fs::create_dir_all(root.join(rel).parent().unwrap()).unwrap();
            std::fs::write(root.join(rel), text).unwrap();
        };
        // what the app carries
        let carried = app.path();
        plugin(carried, "books", "title = \"Books\"\nversion = \"0.15.0\"\n", "// books 0.15\n");
        plugin(carried, "plan", "title = \"Plan\"\nversion = \"0.6.0\"\n", "// plan 0.6\n");
        plugin(carried, "audiobookshelf", "title = \"Audiobookshelf\"\nversion = \"0.6.0\"\nreplaces = [\"catalog-audiobookshelf\"]\n", "// abs 0.6\n");
        plugin(carried, "manga", "title = \"Manga\"\nversion = \"0.10.1\"\n", "// manga 0.10.1\n");
        plugin(carried, "weather", "title = \"Weather\"\nversion = \"0.4.1\"\n", "// weather\n");
        // the vault: books installed at an older version (with a file of its own and a setting), plan at the same
        // version, a retired plugin copied in by hand, manga installed old and then edited in place
        let old_books = plugin(elsewhere.path(), "books", "title = \"Books\"\nversion = \"0.12.0\"\n\n[settings]\nfont = \"serif\"\n", "// books 0.12\n");
        install(root, &Source::Folder(old_books), Some("books"), false).unwrap();
        put(&format!("{PLUGINS_DIR}/books/marks.json"), "[]");
        let same = plugin(elsewhere.path(), "plan", "title = \"Plan\"\nversion = \"0.6.0\"\n", "// plan, the vault's\n");
        install(root, &Source::Folder(same), Some("plan"), false).unwrap();
        put(&format!("{PLUGINS_DIR}/catalog-audiobookshelf/plugin.toml"), "title = \"Catalog Audiobookshelf\"\nversion = \"0.2.0\"\n");
        put(".atlas/plugin-settings/catalog-audiobookshelf.toml", "server = \"https://books.example.org\"\n");
        let old_manga = plugin(elsewhere.path(), "manga", "title = \"Manga\"\nversion = \"0.9.0\"\n", "// manga 0.9\n");
        install(root, &Source::Folder(old_manga), Some("manga"), false).unwrap();
        assert!(!changed_here(root, "manga"), "just installed: unchanged");
        put(&format!("{PLUGINS_DIR}/manga/main.js"), "// manga 0.9, fixed by hand\n");
        assert!(changed_here(root, "manga"), "an edited file is a change");

        let got = sync_bundled(root, carried);
        let ids = |v: &[BundledChange]| v.iter().map(|c| c.id.clone()).collect::<Vec<_>>();
        assert_eq!(ids(&got.updated), ["books"], "{got:?}");
        assert_eq!((got.updated[0].from.as_deref(), got.updated[0].to.as_deref()), (Some("0.12.0"), Some("0.15.0")));
        assert_eq!(ids(&got.replaced), ["audiobookshelf"], "{got:?}");
        assert_eq!(got.replaced[0].replaces, ["catalog-audiobookshelf"]);
        assert_eq!(got.left.iter().map(|l| l.id.as_str()).collect::<Vec<_>>(), ["manga"], "{got:?}");
        assert!(got.left[0].why.contains("changed in this vault"), "{}", got.left[0].why);

        let dir = |id: &str| root.join(PLUGINS_DIR).join(id);
        // older → updated, keeping the vault's setting and the plugin's own file; the old copy in the trash
        assert_eq!(std::fs::read_to_string(dir("books").join("main.js")).unwrap(), "// books 0.15\n");
        assert!(dir("books").join("marks.json").is_file(), "the plugin's own file survives the update");
        assert!(std::fs::read_to_string(root.join(".atlas/plugin-settings/books.toml")).unwrap().contains("serif"), "the setting carried");
        // same version → nothing
        assert_eq!(std::fs::read_to_string(dir("plan").join("main.js")).unwrap(), "// plan, the vault's\n");
        // replaced → the new plugin in, the old one in the trash with its settings carried
        assert!(dir("audiobookshelf").join("main.js").is_file() && !dir("catalog-audiobookshelf").exists());
        let trash = root.join(".atlas/trash");
        let trashed: Vec<String> = walkdir::WalkDir::new(&trash).into_iter().flatten().map(|e| e.path().to_string_lossy().into_owned()).collect();
        assert!(trashed.iter().any(|p| p.contains("catalog-audiobookshelf")), "the retired plugin is in the trash: {trashed:?}");
        assert!(std::fs::read_to_string(root.join(".atlas/plugin-settings/audiobookshelf.toml")).unwrap().contains("books.example.org"), "its settings carried");
        assert!(!crate::workspace::Workspace::open(root).unwrap().config().unwrap().plugins.off.contains(&"audiobookshelf".to_string()), "on, as the one it replaces was");
        // changed in the vault → left as it is
        assert_eq!(std::fs::read_to_string(dir("manga").join("main.js")).unwrap(), "// manga 0.9, fixed by hand\n");
        // never had → not added
        assert!(!dir("weather").exists());
        // a second look changes nothing (manga still left and said)
        let again = sync_bundled(root, carried);
        assert!(again.updated.is_empty() && again.replaced.is_empty() && again.left.len() == 1, "{again:?}");
        // the vault asks for one it lacks
        let added = add_bundled(root, carried, "weather").unwrap();
        assert_eq!((added.id.as_str(), added.version.as_deref()), ("weather", Some("0.4.1")));
        assert!(add_bundled(root, carried, "nothing-such").is_err());

        // a copy made by hand (no record of its install) is updated by version alone; one from a release keeps its
        // address, so a desktop sharing the vault still updates from there
        put(&format!("{PLUGINS_DIR}/weather/plugin.toml"), "title = \"Weather\"\nversion = \"0.1.0\"\n");
        std::fs::remove_file(dir("weather").join(SOURCE_FILE)).unwrap();
        let rel = format!("{PLUGINS_DIR}/plan/{SOURCE_FILE}");
        let plan_src = std::fs::read_to_string(root.join(&rel)).unwrap();
        put(&rel, &plan_src.replace("kind = \"folder\"", "kind = \"download\"").lines().map(|l| if l.starts_with("from") { "from = \"https://example.org/atlas-plugin-plan.tar.gz\"".to_string() } else { l.to_string() }).collect::<Vec<_>>().join("\n"));
        put(&format!("{PLUGINS_DIR}/plan/plugin.toml"), "title = \"Plan\"\nversion = \"0.5.0\"\n");
        let third = sync_bundled(root, carried);
        assert_eq!(ids(&third.updated), ["plan", "weather"], "{third:?}");
        let rec = source_record(root, "plan").unwrap();
        assert_eq!((rec["kind"].as_str(), rec["from"].as_str()), (Some("download"), Some("https://example.org/atlas-plugin-plan.tar.gz")));
        assert!(rec.contains_key("digest"));
    }

    /// A merged plugin takes over those it `replaces`: settings (renamed) and secrets carried, folders and settings files
    /// to the trash, their ids out of `off`; it starts off only when every one it replaces was off.
    #[test]
    fn a_merged_plugin_takes_over_the_plugins_it_replaces() {
        let (vault, keys) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let root = vault.path();
        let secrets = crate::secrets::Store::in_dir(keys.path(), root);
        let put = |rel: &str, text: &str| {
            std::fs::create_dir_all(root.join(rel).parent().unwrap()).unwrap();
            std::fs::write(root.join(rel), text).unwrap();
        };
        put(&format!("{PLUGINS_DIR}/ntfy/plugin.toml"), "title = \"ntfy\"\n");
        put(&format!("{PLUGINS_DIR}/tube/plugin.toml"), "title = \"Tube\"\n");
        put(".atlas/plugin-settings/ntfy.toml", "topic = \"mine\"\nserver = \"https://push.example.org\"\n");
        put(".atlas/plugin-settings/tube.toml", "address = \"https://tube.example.org\"\n");
        put(".atlas/plugin-settings/merged.toml", "server = \"https://kept.example.org\"\n");
        put(".atlas/config.toml", "[plugins]\noff = [\"ntfy\", \"tube\"]\n");
        secrets.set("tube", "token", "t1").unwrap();
        put(&format!("{PLUGINS_DIR}/merged/plugin.toml"), "title = \"Merged\"\n[replaces]\nntfy = { rename = { topic = \"phone_topic\" } }\ntube = { set = { preset = \"Tube\" } }\n");

        let moved = adopt_replaced(root, &secrets, "merged", true).unwrap();
        assert_eq!(moved.len(), 4, "two folders and two settings files: {moved:?}");
        assert!(moved.iter().all(|m| root.join(m).exists()), "in the trash, not gone");
        assert!(!root.join(PLUGINS_DIR).join("ntfy").exists() && !root.join(".atlas/plugin-settings/tube.toml").exists());
        let t: toml::Table = toml::from_str(&std::fs::read_to_string(root.join(".atlas/plugin-settings/merged.toml")).unwrap()).unwrap();
        assert_eq!(t["phone_topic"].as_str(), Some("mine"), "renamed on the way");
        assert_eq!(t["server"].as_str(), Some("https://kept.example.org"), "the new plugin's own value wins");
        assert_eq!(t["address"].as_str(), Some("https://tube.example.org"));
        assert_eq!(t["preset"].as_str(), Some("Tube"), "`set` comes with the plugin's settings");
        assert_eq!(secrets.get("merged", "token").unwrap().as_deref(), Some("t1"), "the secret carried over");
        let off = crate::workspace::Workspace::open(root).unwrap().config().unwrap().plugins.off;
        assert_eq!(off, ["merged"], "the old ids leave `off`; every replaced one was off, so the fresh plugin is off");
        assert!(adopt_replaced(root, &secrets, "merged", true).unwrap().is_empty(), "a second start changes nothing");

        // a plugin the vault already used is never switched off by what it absorbs
        put(&format!("{PLUGINS_DIR}/ntfy/plugin.toml"), "title = \"ntfy\"\n");
        put(".atlas/config.toml", "[plugins]\noff = [\"ntfy\"]\n");
        adopt_replaced(root, &secrets, "merged", false).unwrap();
        assert!(crate::workspace::Workspace::open(root).unwrap().config().unwrap().plugins.off.is_empty());
    }

    /// A plugin folded into a setting (`if_off`): the vault that had it off gets the setting off; one that had it on
    /// keeps the setting's default.
    #[test]
    fn a_plugin_folded_into_a_setting_carries_its_off_state() {
        let (vault, keys) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let root = vault.path();
        let secrets = crate::secrets::Store::in_dir(keys.path(), root);
        let put = |rel: &str, text: &str| {
            std::fs::create_dir_all(root.join(rel).parent().unwrap()).unwrap();
            std::fs::write(root.join(rel), text).unwrap();
        };
        let catalog = format!("{PLUGINS_DIR}/catalog/plugin.toml");
        put(&catalog, "title = \"Catalog\"\n[replaces]\ncatalog-web = { if_off = { read_pages = false } }\n");
        put(&format!("{PLUGINS_DIR}/catalog-web/plugin.toml"), "title = \"Web\"\n");
        put(".atlas/config.toml", "[plugins]\noff = [\"catalog-web\"]\n");
        adopt_replaced(root, &secrets, "catalog", false).unwrap();
        let t: toml::Table = toml::from_str(&std::fs::read_to_string(root.join(".atlas/plugin-settings/catalog.toml")).unwrap()).unwrap();
        assert_eq!(t["read_pages"].as_bool(), Some(false));
        assert!(!root.join(PLUGINS_DIR).join("catalog-web").exists(), "its folder to the trash");

        std::fs::remove_file(root.join(".atlas/plugin-settings/catalog.toml")).unwrap();
        put(&format!("{PLUGINS_DIR}/catalog-web/plugin.toml"), "title = \"Web\"\n");
        put(".atlas/config.toml", "");
        adopt_replaced(root, &secrets, "catalog", false).unwrap();
        assert!(!root.join(".atlas/plugin-settings/catalog.toml").exists(), "on: nothing to write, the default stands");
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
