//! Workspace plugins: `.atlas/plugins/<id>/plugin.toml` + a view module (+ an optional data script).
//! The core knows nothing about what a plugin shows: it lists manifests and runs a plugin's data
//! script (stdin = JSON `{settings, args}`, stdout = JSON), exactly like a workspace command.
//! Special-purpose views (simulation runs, …) live with the project that needs them.
//! v3 (docs/refactor/REFACTOR-plugins-v3.md): a plugin is data + pieces. `main.js` registers blocks, commands
//! and entity kinds at startup (no pane needed); the pane (`view.js`) and the rail button are opt-in.
use crate::commands::{run_script, ScriptCommand, ScriptManifest, SCRIPT_TIMEOUT};
pub use crate::plugin_settings::SettingField;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;
use ts_rs::TS;

pub const PLUGINS_DIR: &str = ".atlas/plugins";

/// `$ATLAS_PLUGIN_TARGET` for a plugin's programs: `<arch>-<os>` of the machine running the server (`x86_64-linux`,
/// `aarch64-android`), so a plugin can carry compiled helpers per platform: `run = "\"$ATLAS_PLUGIN_DIR/bin/$ATLAS_PLUGIN_TARGET/helper\""`.
pub fn target() -> String {
    format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS)
}

/// `plugin.toml`. Every field but `title` is optional.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    title: String,
    #[serde(default)]
    description: Option<String>,
    /// One of the app's icon names; unknown names fall back to a generic plugin icon.
    #[serde(default)]
    icon: Option<String>,
    /// Default shortcut for opening the plugin (rebindable like any command).
    #[serde(default)]
    keys: Option<String>,
    /// ES module of the plugin's own pane (default `view.js` when that file exists); none = no pane.
    #[serde(default)]
    view: Option<String>,
    /// ES module run at startup and on every change, exporting `register(atlas)`: blocks, commands,
    /// entities (default `main.js` when that file exists).
    #[serde(default)]
    main: Option<String>,
    /// A button in the sidebar rail for the pane. Off unless asked: plugins do not claim the chrome.
    #[serde(default)]
    rail: bool,
    /// Files the pane can show (`*.tsv`, `runs/**`): offered in "Open with…"; the pane gets `atlas.path`.
    #[serde(default)]
    opens: Vec<String>,
    /// Files the pane is the default editor of (`*.epub`): a plain open (a click in the tree, a link) shows them there
    /// unless the vault's `[files] open_with` names another view. Implies `opens`; needs a pane.
    #[serde(default)]
    claims: Vec<String>,
    /// Shell command (cwd = workspace root, `$ATLAS_PLUGIN_DIR` = the plugin folder) printing JSON.
    #[serde(default)]
    data: Option<String>,
    #[serde(default)]
    timeout_secs: Option<u64>,
    /// Free-form defaults handed to the data script and the view (the plugin's own settings).
    #[serde(default)]
    settings: toml::Table,
    /// `[[setting]]`: the settings as form fields — Settings then shows a form for the plugin, and
    /// a field's `default` stands in while `[settings]` does not have the key.
    #[serde(default, rename = "setting", deserialize_with = "crate::plugin_settings::checked_fields")]
    fields: Vec<SettingField>,
    /// The plugin's own version (shown; nothing is decided by it yet).
    #[serde(default)]
    version: Option<String>,
    /// It runs on phones (`phone = true`): the phone apps start only plugins marked so.
    #[serde(default)]
    phone: bool,
    /// The plugin API the plugin was written for (`atlas.version` in the page).
    #[serde(default)]
    api: Option<u32>,
    /// What the plugin asks to be allowed to do outside the page.
    #[serde(default)]
    permissions: Permissions,
    /// A program of the plugin's own that stays running (helper.rs).
    #[serde(default)]
    helper: Option<HelperManifest>,
    /// The oldest Atlas it works with: `">=0.3"` or `"0.3.1"`. An older Atlas lists the plugin with
    /// that as its error instead of loading it.
    #[serde(default)]
    needs: Option<String>,
    /// `[[tool]]`: helper methods offered to agents (`atlas mcp`) — plugin_tools.rs.
    #[serde(default, rename = "tool")]
    tools: Vec<crate::plugin_tools::ToolManifest>,
    /// What an agent must know to use the plugin's tools rather than going around them ("for a command on a host, use
    /// ssh_open and ssh_run, never ssh in your own shell"): added to `atlas mcp`'s instructions while the plugin is on.
    #[serde(default)]
    for_agents: Option<String>,
    /// Plugins this one builds on (`["catalog"]`): it is not loaded while one of them is missing, broken or off.
    #[serde(default)]
    requires: Vec<String>,
    /// `[[agent]]`: AI agents whose terminals this plugin declares (agent_terminals.rs).
    #[serde(default, rename = "agent")]
    agents: Vec<crate::agent_terminals::AgentDecl>,
    /// `[contributes.<plugin id>]`: tables for another plugin (a meta plugin's subplugins), which the core does not
    /// read — it hands them to that plugin (`contributions`). Contributing is optional: a service's own plugin (Jellyfin,
    /// TubeArchivist) keeps working with the meta plugin off, its table simply unused. `requires` is the hard dependency.
    #[serde(default)]
    contributes: std::collections::BTreeMap<String, toml::Table>,
    /// `[android]`: the plugin's native side, compiled into the Atlas apps (docs/refactor/REFACTOR-native-plugins.md,
    /// read by crates/atlas-android/native-plugins.sh). The core only checks its shape.
    #[serde(default)]
    #[allow(dead_code)]
    android: Option<AndroidManifest>,
}

impl Manifest {
}

/// `[android]`.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(dead_code)]
struct AndroidManifest {
    /// The Java class implementing `org.atlas.capture.NativePlugin`.
    main: String,
    /// Vault paths the app opens natively instead of in a web tab (`*.cbz`).
    #[serde(default)]
    opens: Vec<String>,
    /// Unused since 2026-10-20 (the libraries are the page's; a native side is a reader): still accepted, so a vault
    /// whose copy predates that keeps parsing.
    #[serde(default)]
    #[allow(dead_code)]
    place: Option<String>,
}

/// `[helper]`.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct HelperManifest {
    /// Shell command (cwd = the vault; `$ATLAS_PLUGIN_DIR`, `$ATLAS_PLUGIN_CACHE`, `$ATLAS_ROOT` set).
    run: String,
    /// When the helper starts: at its first call (the default), or with the vault (`"open"`: it listens for
    /// something itself, as catalog-papers' Zotero Connector does).
    #[serde(default)]
    start: HelperStart,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Deserialize)]
#[serde(rename_all = "lowercase")]
enum HelperStart {
    #[default]
    Call,
    Open,
}

/// The plugins whose helper starts with the vault (`[helper] start = "open"`) and that can run with this `off` list.
pub fn helpers_started_with_vault(root: &Path, off: &[String]) -> Vec<String> {
    let all = list(root);
    all.iter()
        .filter(|p| p.has_helper && blocked(&all, off, &p.id).is_none())
        .filter(|p| read_manifest(root, &p.id).ok().and_then(|m| m.helper).is_some_and(|h| h.start == HelperStart::Open))
        .map(|p| p.id.clone())
        .collect()
}

/// The command that starts plugin `id`'s helper.
pub fn helper_command(root: &Path, id: &str) -> Result<String> {
    if !valid_id(id) {
        return Err(Error::BadRequest(format!("bad plugin id {id:?}")));
    }
    read_manifest(root, id)?
        .helper
        .map(|h| h.run)
        .ok_or_else(|| Error::BadRequest(format!("plugin {id} has no helper: add [helper] run = \"…\" to its plugin.toml")))
}

/// `[permissions]`: what a plugin may do through the core. Nothing unless it is written here, and
/// Settings shows it in plain words.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields, default)]
#[ts(export)]
pub struct Permissions {
    /// Hosts `atlas.fetch` may reach: `"links.example.org"`, or `"*.example.org"` for any host under it.
    pub net: Vec<String>,
    /// May keep secrets (`atlas.secrets`, a header filled in from one).
    pub secrets: bool,
}

/// What running one of plugin `id`'s tools needs: its tools, permissions and settings (with defaults).
pub fn tool_parts(root: &Path, id: &str) -> Result<(Vec<crate::plugin_tools::ToolManifest>, Permissions, toml::Table)> {
    if !valid_id(id) {
        return Err(Error::BadRequest(format!("bad plugin id {id:?}")));
    }
    let m = read_manifest(root, id)?;
    let settings = settings_with_defaults(&m);
    Ok((m.tools, m.permissions, settings))
}

/// The plugin's word to agents (`for_agents`), when it has one.
pub fn for_agents(root: &Path, id: &str) -> Option<String> {
    valid_id(id).then(|| read_manifest(root, id).ok()?.for_agents.filter(|t| !t.trim().is_empty())).flatten()
}

/// The agents plugin `id` declares, with its settings (defaults filled).
pub fn agent_parts(root: &Path, id: &str) -> Result<(Vec<crate::agent_terminals::AgentDecl>, toml::Table)> {
    if !valid_id(id) {
        return Err(Error::BadRequest(format!("bad plugin id {id:?}")));
    }
    let m = read_manifest(root, id)?;
    let settings = settings_with_defaults(&m);
    Ok((m.agents, settings))
}

/// The permissions plugin `id` declares.
pub fn permissions(root: &Path, id: &str) -> Result<Permissions> {
    if !valid_id(id) {
        return Err(Error::BadRequest(format!("bad plugin id {id:?}")));
    }
    Ok(read_manifest(root, id)?.permissions)
}

/// The plugin API this Atlas offers, the page's `PLUGIN_API_VERSION` (ui/src/lib/plugin-api.ts): v4 `atlas.on`,
/// `atlas.shell`, settings from a schema; v5 the native pen; v6 `openNative`; v7 the editor contract (`claims`,
/// `atlas.pane`, `atlas.anchor`) and `registerEmbed`; v8 `atlas.live.join` and `atlas.pane.close`; v9 `atlas.assetUrl`
/// (a plugin's own files by URL, plugin_files.rs); v10 `atlas.trash`; v11 `atlas.files.thumb`; v12 Settings v2: accounts
/// (`account = {…}` on a records field), `advanced` / `hidden` fields, `atlas.plugin.registerSettingsSection`.
pub const API_VERSION: u32 = 12;

/// `"1.2.3"` → `[1, 2, 3]` (missing parts are 0; anything after a non-digit part is ignored).
fn version_parts(v: &str) -> [u64; 3] {
    let mut out = [0; 3];
    for (slot, part) in out.iter_mut().zip(v.trim().split('.')) {
        let digits: String = part.chars().take_while(char::is_ascii_digit).collect();
        match digits.parse() {
            Ok(n) => *slot = n,
            Err(_) => break,
        }
    }
    out
}

/// Why this Atlas cannot run the plugin, if it cannot.
fn too_old_for(m: &Manifest, app: &str) -> Option<String> {
    if let Some(api) = m.api.filter(|a| *a > API_VERSION) {
        return Some(format!("written for plugin API {api}; this Atlas has {API_VERSION} — update Atlas"));
    }
    let needs = m.needs.as_deref()?.trim().trim_start_matches(">=").trim().trim_start_matches('v');
    (version_parts(needs) > version_parts(app)).then(|| format!("needs Atlas {needs} or newer; this is {app}"))
}

/// `[settings]` with each declared field's default where the key is missing (plugin_settings.rs).
fn settings_with_defaults(m: &Manifest) -> toml::Table {
    crate::plugin_settings::with_defaults(&m.settings, &m.fields)
}

/// A manifest's settings form read from its text: the declared fields and the settings with their defaults. The phone
/// apps draw a built-in plugin's form from the manifest they carry while the vault has no folder for it yet.
pub fn form_of(manifest: &str) -> Result<(Vec<SettingField>, Value)> {
    let m: Manifest = toml::from_str(manifest).map_err(|e| Error::BadRequest(format!("plugin.toml: {e}")))?;
    let settings = serde_json::to_value(settings_with_defaults(&m)).unwrap_or(Value::Null);
    Ok((m.fields, settings))
}

/// Writes the declared settings the form sent into the plugin's settings file (`.atlas/plugin-settings/<id>.toml`;
/// `plugin_settings::apply` says what is written), then keeps and forgets secrets as it says.
/// Anything refused: nothing is written.
/// Returns the cards renamed (records key, old name, new name): the plugin is told, to move what it keeps by name.
pub fn save_settings(root: &Path, secrets: &crate::secrets::Store, id: &str, values: &serde_json::Map<String, Value>) -> Result<Vec<(String, String, String)>> {
    if !valid_id(id) {
        return Err(Error::BadRequest(format!("bad plugin id {id:?}")));
    }
    move_settings_out(root, id)?; // an older vault's [settings] first become the file this writes
    let m = read_manifest(root, id)?;
    let rel = settings_rel(id);
    // the form's rules (plugin_settings::apply) edit a `[settings]` table: the file's values under one, and back
    let current = std::fs::read_to_string(root.join(&rel)).unwrap_or_default();
    let file: toml_edit::DocumentMut = current.parse().map_err(|e| Error::BadRequest(format!("{rel}: {e}")))?;
    let mut doc = toml_edit::DocumentMut::new();
    let mut under = toml_edit::Table::new();
    for (k, v) in file.iter() {
        under.insert(k, v.clone());
    }
    doc.insert("settings", toml_edit::Item::Table(under));
    let saved = crate::plugin_settings::apply(id, &doc.to_string(), &m.fields, &m.settings, m.permissions.secrets, values).map_err(|e| Error::BadRequest(format!("{rel}: {e}")))?;
    let after: toml_edit::DocumentMut = saved.text.parse().map_err(|e| Error::BadRequest(format!("{rel}: {e}")))?;
    let mut out = toml_edit::DocumentMut::new();
    if let Some(t) = after.get("settings").and_then(toml_edit::Item::as_table) {
        for (k, v) in t.iter() {
            out.insert(k, v.clone());
        }
    }
    write_settings_file(root, id, &out.to_string())?;
    for (name, text) in saved.set {
        secrets.set(id, &name, &text)?;
    }
    for name in saved.forget {
        secrets.delete(id, &name)?;
    }
    for (from, to) in &saved.moved {
        if let Some(v) = secrets.get(id, from)? {
            secrets.set(id, to, &v)?;
            secrets.delete(id, from)?;
        }
    }
    Ok(saved.renamed)
}

/// The module a manifest names, or the conventional file when it exists.
fn module(root: &Path, id: &str, named: Option<String>, conventional: &str) -> Option<String> {
    let dir = format!("{PLUGINS_DIR}/{id}");
    match named {
        Some(m) => Some(format!("{dir}/{m}")),
        None => root.join(&dir).join(conventional).is_file().then(|| format!("{dir}/{conventional}")),
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct Plugin {
    pub id: String,
    pub title: String,
    #[ts(optional)]
    pub description: Option<String>,
    #[ts(optional)]
    pub icon: Option<String>,
    #[ts(optional)]
    pub keys: Option<String>,
    /// Workspace-relative path of the pane module; none = the plugin has no pane.
    #[ts(optional)]
    pub view: Option<String>,
    /// Workspace-relative path of the startup module (`register(atlas)`).
    #[ts(optional)]
    pub main: Option<String>,
    /// Shown in the sidebar rail (opt-in).
    pub rail: bool,
    /// Globs of files its pane opens ("Open with…"): the manifest's `opens` and `claims`.
    pub opens: Vec<String>,
    /// Globs of files its pane is the default for (`claims`): after the vault's `[files] open_with`, before the core's viewers.
    pub claims: Vec<String>,
    pub has_data: bool,
    /// `[settings]`, with the defaults of the declared fields where a key is missing.
    #[ts(type = "Record<string, unknown>")]
    pub settings: Value,
    /// The declared settings (`[[setting]]`): Settings draws the plugin's form from them.
    pub fields: Vec<SettingField>,
    pub permissions: Permissions,
    /// It has a `[helper]`: a program of its own that the core runs.
    pub has_helper: bool,
    /// Where it was installed from (the `.source` file an install leaves): it can be updated from there.
    #[ts(optional)]
    pub from: Option<String>,
    #[ts(optional)]
    pub version: Option<String>,
    /// Marked to run on phones (`phone = true`): the phone apps start only these.
    pub phone: bool,
    /// Set when the manifest does not parse: the plugin is listed (so the user sees why), not loaded.
    #[ts(optional)]
    pub error: Option<String>,
    /// The plugins it builds on (`requires`): loaded only while all of them are.
    pub requires: Vec<String>,
    /// The AI agents it declares (`[[agent]]`): the terminal + menu and the palette offer a session of each.
    pub agents: Vec<crate::agent_terminals::AgentDecl>,
    /// What it adds that is not a pane or a script, in words for Settings: its scheduled runs, its capture hook,
    /// its template values, its tools for agents, what it gives another plugin (`[contributes]`).
    pub parts: Vec<String>,
}

impl Plugin {
    /// A plugin that is listed but not loaded (its `error` says why): nothing of it is offered.
    fn unloaded(id: String) -> Self {
        Self {
            title: id.clone(),
            id,
            description: None,
            icon: None,
            keys: None,
            view: None,
            main: None,
            rail: false,
            opens: Vec::new(),
            claims: Vec::new(),
            has_data: false,
            settings: Value::Null,
            fields: Vec::new(),
            phone: false,
            permissions: Permissions::default(),
            has_helper: false,
            from: None,
            version: None,
            error: None,
            requires: Vec::new(),
            agents: Vec::new(),
            parts: Vec::new(),
        }
    }
}

/// `parts` of a manifest (see `Plugin::parts`), e.g. "sync every 6h", "reads every capture", "{{weather}} in
/// templates", "2 tools for agents", "fills in book, science_book for catalog".
/// What "Open with…" offers the pane for: `opens`, and every claimed glob not already there.
fn opens_and_claims(m: &Manifest) -> Vec<String> {
    let mut out = m.opens.clone();
    for c in &m.claims {
        if !out.contains(c) { out.push(c.clone()); }
    }
    out
}

fn parts_of(m: &Manifest) -> Vec<String> {
    let mut out: Vec<String> = m.agents.iter().map(|a| format!("{} sessions in the terminal", a.title)).collect();
    if !m.claims.is_empty() { out.push(format!("opens {} by default", m.claims.join(", "))); }
    for t in &m.tools {
        if let Some(when) = &t.schedule { out.push(format!("{} {when}", t.name)); }
        if t.on.as_deref() == Some("capture") { out.push("reads every capture".into()); }
        if let Some(name) = &t.template { out.push(format!("{{{{{name}}}}} in templates")); }
    }
    match m.tools.len() {
        0 => {}
        1 => out.push("1 tool for agents".into()),
        n => out.push(format!("{n} tools for agents")),
    }
    for (target, table) in &m.contributes {
        let kinds: Vec<String> = table.get("sources").and_then(|v| v.as_array()).into_iter().flatten()
            .filter_map(|src| src.get("kind"))
            .flat_map(|k| match k {
                toml::Value::String(s) => vec![s.clone()],
                toml::Value::Array(a) => a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect(),
                _ => Vec::new(),
            })
            .fold(Vec::new(), |mut seen, k| { if !seen.contains(&k) { seen.push(k); } seen });
        if kinds.iter().any(|k| k == "*") { out.push(format!("fills in any kind for {target}")); }
        else if !kinds.is_empty() { out.push(format!("fills in {} for {target}", kinds.join(", "))); }
        if table.get("recognize").and_then(|v| v.as_array()).is_some_and(|a| !a.is_empty()) { out.push(format!("recognises its links for {target}")); }
        if table.get("kinds").and_then(|v| v.as_array()).is_some_and(|a| !a.is_empty()) { out.push(format!("adds kinds to {target}")); }
        if table.get("pdf_sources").and_then(|v| v.as_array()).is_some_and(|a| !a.is_empty()) { out.push(format!("finds PDFs for {target}")); }
    }
    out
}

/// The `from` of the `.source` file an install leaves in a plugin's folder.
fn installed_from(root: &Path, id: &str) -> Option<String> {
    let text = std::fs::read_to_string(root.join(PLUGINS_DIR).join(id).join(".source")).ok()?;
    toml::from_str::<toml::Table>(&text).ok()?.get("from")?.as_str().map(str::to_string)
}

/// What an installer needs to know of a manifest before it lets it into a vault.
pub struct Summary {
    pub title: String,
    pub version: Option<String>,
    pub permissions: Permissions,
    pub has_helper: bool,
}

/// Reads a `plugin.toml` text as this Atlas would: an error when it does not parse or needs a newer Atlas.
pub fn summary_of(text: &str) -> std::result::Result<Summary, String> {
    let m: Manifest = toml::from_str(text).map_err(|e| e.to_string())?;
    if let Some(why) = too_old_for(&m, env!("CARGO_PKG_VERSION")) {
        return Err(why);
    }
    Ok(Summary { title: m.title, version: m.version, has_helper: m.helper.is_some(), permissions: m.permissions })
}

/// The `[settings]` a vault has in its copy of a manifest (None: none, or the text does not parse).
pub fn own_settings(text: &str) -> Option<toml::Table> {
    // only [settings]: the old copy's schema may be one this Atlas no longer reads, its values still count
    #[derive(Deserialize)]
    struct Own {
        #[serde(default)]
        settings: toml::Table,
    }
    toml::from_str::<Own>(text).ok().map(|m| m.settings).filter(|t| !t.is_empty())
}

pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && !id.starts_with('.') && id.chars().all(|c| c.is_ascii_alphanumeric() || "_-".contains(c))
}

fn read_manifest(root: &Path, id: &str) -> Result<Manifest> {
    let text = std::fs::read_to_string(root.join(PLUGINS_DIR).join(id).join("plugin.toml"))?;
    let mut m: Manifest = toml::from_str(&text).map_err(|e| Error::BadRequest(format!("{PLUGINS_DIR}/{id}/plugin.toml: {e}")))?;
    // the vault's settings file over the manifest's own [settings] (key by key: a value added to the manifest later,
    // by hand, still counts until the next save moves it into the file)
    if let Some(own) = settings_file_values(root, id)? {
        m.settings.extend(own);
    }
    Ok(m)
}

/// Where a vault keeps a plugin's settings: beside the plugins' folders, not in one, so updating, reinstalling or removing a
/// plugin never touches what the vault chose. A manifest's own `[settings]` are only the starting values (and an older
/// vault's, until its first save moves them here).
pub const SETTINGS_DIR: &str = ".atlas/plugin-settings";
fn settings_rel(id: &str) -> String {
    format!("{SETTINGS_DIR}/{id}.toml")
}

/// The settings file's values (None: the vault has none for this plugin yet).
fn settings_file_values(root: &Path, id: &str) -> Result<Option<toml::Table>> {
    match std::fs::read_to_string(root.join(settings_rel(id))) {
        Ok(text) => toml::from_str(&text).map(Some).map_err(|e| Error::BadRequest(format!("{}: {e}", settings_rel(id)))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Writes a plugin's settings file (a table of values, as TOML).
fn write_settings_file(root: &Path, id: &str, text: &str) -> Result<()> {
    let path = crate::paths::safe_join(root, &settings_rel(id))?;
    let head = format!("# Settings of the plugin {id}, as Settings → Plugins & automation writes them (secrets are kept outside the vault).\n");
    crate::vault_write::write(&path, format!("{head}{}", text.trim_start_matches(&head)).as_bytes())
}

/// A vault copy of a manifest that still holds `[settings]` (from before the settings file): its values move to the
/// file — only when the vault has no file yet — and the manifest keeps none, so there is one place to look.
pub fn move_settings_out(root: &Path, id: &str) -> Result<()> {
    let rel = format!("{PLUGINS_DIR}/{id}/plugin.toml");
    let Ok(text) = std::fs::read_to_string(root.join(&rel)) else { return Ok(()) };
    if own_settings(&text).is_none() {
        return Ok(());
    }
    let mut doc: toml_edit::DocumentMut = text.parse().map_err(|e| Error::BadRequest(format!("{rel}: {e}")))?;
    // the table's own lines, comments kept (`sides = 20 # the classic`), into the file — a key the file has wins
    let current = std::fs::read_to_string(root.join(settings_rel(id))).unwrap_or_default();
    let mut file: toml_edit::DocumentMut = current.parse().map_err(|e| Error::BadRequest(format!("{}: {e}", settings_rel(id))))?;
    if let Some(t) = doc.get("settings").and_then(toml_edit::Item::as_table) {
        for (k, v) in t.iter() {
            if !file.contains_key(k) {
                file.insert(k, v.clone());
            }
        }
    }
    write_settings_file(root, id, &file.to_string())?;
    doc.remove("settings");
    crate::vault_write::write(&crate::paths::safe_join(root, &rel)?, doc.to_string().as_bytes())?;
    Ok(())
}

/// A section the vault's config once kept for what is now plugin `id` (`[refs]` → catalog-papers) becomes the plugin's
/// starting values: each key its settings file lacks is copied in; keys it has win, so this runs at every start and
/// changes nothing after the first. The config's section is left where it is. Nothing when the
/// plugin is not in the vault or the config has no such section.
pub fn adopt_config_section(root: &Path, section: &str, id: &str) -> Result<()> {
    if !root.join(PLUGINS_DIR).join(id).join("plugin.toml").is_file() {
        return Ok(());
    }
    let Ok(text) = std::fs::read_to_string(root.join(crate::config::CONFIG_FILE)) else { return Ok(()) };
    let cfg: toml::Table = toml::from_str(&text).map_err(|e| Error::BadRequest(format!("{}: {e}", crate::config::CONFIG_FILE)))?;
    let Some(old) = cfg.get(section).and_then(toml::Value::as_table) else { return Ok(()) };
    let current = std::fs::read_to_string(root.join(settings_rel(id))).unwrap_or_default();
    let mut file: toml_edit::DocumentMut = current.parse().map_err(|e| Error::BadRequest(format!("{}: {e}", settings_rel(id))))?;
    let mut added = false;
    for (k, v) in old {
        if !file.contains_key(k) {
            let item = toml_edit::value(v.to_string().parse::<toml_edit::Value>().map_err(|e| Error::BadRequest(format!("[{section}] {k}: {e}")))?);
            file.insert(k, item);
            added = true;
        }
    }
    if added {
        write_settings_file(root, id, &file.to_string())?;
    }
    Ok(())
}

/// Every plugin folder holding a `plugin.toml`, sorted by id.
pub fn list(root: &Path) -> Vec<Plugin> {
    let mut ids: Vec<String> = std::fs::read_dir(root.join(PLUGINS_DIR))
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().join("plugin.toml").is_file())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|id| valid_id(id))
        .collect();
    ids.sort();
    ids.into_iter()
        .map(|id| {
            match read_manifest(root, &id) {
                Ok(m) if too_old_for(&m, env!("CARGO_PKG_VERSION")).is_some() => Plugin {
                    error: too_old_for(&m, env!("CARGO_PKG_VERSION")),
                    title: m.title,
                    description: m.description,
                    version: m.version,
                    ..Plugin::unloaded(id)
                },
                Ok(m) => Plugin {
                    // a vault may hide the plugin's app tile: its setting `rail` (a switch the plugin declares) wins over
                    // the manifest — the catalog's Library app is one vault's, not another's
                    rail: m.settings.get("rail").and_then(toml::Value::as_bool).unwrap_or(m.rail),
                    // first, while the manifest is whole: the fields below take it apart
                    settings: serde_json::to_value(settings_with_defaults(&m)).unwrap_or(Value::Null),
                    parts: parts_of(&m),
                    opens: opens_and_claims(&m),
                    agents: m.agents.clone(),
                    requires: m.requires.clone(),
                    view: module(root, &id, m.view, "view.js"),
                    main: module(root, &id, m.main, "main.js"),
                    claims: m.claims,
                    title: m.title,
                    description: m.description,
                    icon: m.icon,
                    keys: m.keys,
                    has_data: m.data.is_some(),
                    fields: m.fields,
                    phone: m.phone,
                    permissions: m.permissions,
                    has_helper: m.helper.is_some(),
                    from: installed_from(root, &id),
                    version: m.version,
                    error: None,
                    id,
                },
                Err(e) => Plugin { error: Some(e.to_string()), ..Plugin::unloaded(id) },
            }
        })
        .collect()
}

/// Why plugin `id` cannot run with these plugins and this `off` list: itself off or broken, or a plugin it requires
/// (at any depth) missing, broken or off. None: it can run.
pub fn blocked(plugins: &[Plugin], off: &[String], id: &str) -> Option<String> {
    fn walk(plugins: &[Plugin], off: &[String], id: &str, seen: &mut Vec<String>) -> Option<String> {
        if seen.iter().any(|s| s == id) {
            return Some(format!("requires itself through {}", seen.join(" → ")));
        }
        let Some(p) = plugins.iter().find(|p| p.id == id) else { return Some(format!("needs the plugin {id}, which is not installed")) };
        if let Some(e) = &p.error {
            return Some(format!("{} cannot load: {e}", p.title));
        }
        if off.iter().any(|o| o == id) {
            return Some(format!("{} is switched off", p.title));
        }
        seen.push(id.to_string());
        let why = p.requires.iter().find_map(|r| walk(plugins, off, r, seen).map(|w| format!("needs {r}: {w}")));
        seen.pop();
        why
    }
    walk(plugins, off, id, &mut Vec::new())
}

/// The `[contributes.<target>]` tables of every plugin that can run, by plugin id, as JSON — what a meta plugin
/// (`target`) builds itself from. A plugin that cannot run contributes nothing.
pub fn contributions(root: &Path, off: &[String], target: &str) -> Result<serde_json::Map<String, Value>> {
    if !valid_id(target) {
        return Err(Error::BadRequest(format!("bad plugin id {target:?}")));
    }
    let all = list(root);
    let mut out = serde_json::Map::new();
    // Contributing does not imply `requires`: any runnable plugin with a `[contributes.<target>]` table counts.
    for p in all.iter().filter(|p| p.id != target) {
        if blocked(&all, off, &p.id).is_some() {
            continue;
        }
        // An unreadable manifest of another plugin never breaks the target's list.
        let Ok(mut m) = read_manifest(root, &p.id) else { continue };
        if let Some(t) = m.contributes.remove(target) {
            out.insert(p.id.clone(), serde_json::to_value(t).map_err(|e| Error::Other(e.into()))?);
        }
    }
    Ok(out)
}

/// Run the plugin's data script with `{settings, args}` on stdin; its JSON stdout is the result.
pub async fn data(root: &Path, id: &str, args: Value) -> Result<Value> {
    if !valid_id(id) {
        return Err(Error::BadRequest(format!("bad plugin id {id:?}")));
    }
    let m = read_manifest(root, id)?;
    let settings = settings_with_defaults(&m);
    let Some(run) = m.data else { return Err(Error::BadRequest(format!("plugin {id} has no data script"))) };
    let dir = root.join(PLUGINS_DIR).join(id);
    let script = ScriptCommand {
        id: format!("plugin.{id}"),
        manifest: ScriptManifest {
            title: m.title,
            // exported (not a `VAR=… cmd` prefix, which the shell expands too late) so the command
            // can name its own files: `python3 "$ATLAS_PLUGIN_DIR/index.py"`
            run: format!("export ATLAS_PLUGIN_DIR={} ATLAS_PLUGIN_TARGET={}; {run}", shell_quote(&dir.to_string_lossy()), target()),
            keys: None,
            description: None,
            timeout_secs: m.timeout_secs,
            schedule: None,
        },
    };
    let timeout = m.timeout_secs.map(Duration::from_secs).unwrap_or(SCRIPT_TIMEOUT);
    run_script(root, &script, &json!({ "settings": settings, "args": args }), timeout).await
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plugin(root: &Path, id: &str, toml: &str) {
        let d = root.join(PLUGINS_DIR).join(id);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("plugin.toml"), toml).unwrap();
    }

    /// `[helper] start = "open"`: started with the vault — only when the plugin can run.
    #[test]
    fn helpers_that_start_with_the_vault() {
        let d = tempfile::tempdir().unwrap();
        plugin(d.path(), "listens", "title = \"L\"\n[helper]\nrun = \"true\"\nstart = \"open\"\n");
        plugin(d.path(), "lazy", "title = \"Z\"\n[helper]\nrun = \"true\"\n");
        assert_eq!(helpers_started_with_vault(d.path(), &[]), ["listens"]);
        assert!(helpers_started_with_vault(d.path(), &["listens".into()]).is_empty());
    }

    /// The config's old section becomes the plugin's starting values once; the plugin's own values win.
    #[test]
    fn a_config_section_becomes_a_plugins_settings() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".atlas")).unwrap();
        std::fs::write(d.path().join(crate::config::CONFIG_FILE), "[refs]\ndir = \"lit\"\nconnector = true\n").unwrap();
        adopt_config_section(d.path(), "refs", "papers").unwrap();
        assert!(!d.path().join(settings_rel("papers")).exists(), "no plugin, nothing written");
        plugin(d.path(), "papers", "title = \"P\"\n");
        std::fs::create_dir_all(d.path().join(SETTINGS_DIR)).unwrap();
        std::fs::write(d.path().join(settings_rel("papers")), "connector = false\n").unwrap();
        adopt_config_section(d.path(), "refs", "papers").unwrap();
        let t: toml::Table = toml::from_str(&std::fs::read_to_string(d.path().join(settings_rel("papers"))).unwrap()).unwrap();
        assert_eq!((t["dir"].as_str(), t["connector"].as_bool()), (Some("lit"), Some(false)));
        let before = std::fs::read_to_string(d.path().join(settings_rel("papers"))).unwrap();
        adopt_config_section(d.path(), "refs", "papers").unwrap();
        assert_eq!(std::fs::read_to_string(d.path().join(settings_rel("papers"))).unwrap(), before, "the second start changes nothing");
    }

    /// `claims`: listed apart, added to `opens` (once), and said in Settings' words.
    #[test]
    fn claims_are_opens_too_and_said() {
        let d = tempfile::tempdir().unwrap();
        plugin(d.path(), "books", "title = \"Books\"\nopens = [\"*.epub\"]\nclaims = [\"*.epub\", \"*.fb2\"]\n");
        let p = list(d.path()).into_iter().find(|p| p.id == "books").unwrap();
        assert_eq!(p.error, None);
        assert_eq!(p.claims, ["*.epub", "*.fb2"]);
        assert_eq!(p.opens, ["*.epub", "*.fb2"]);
        assert!(p.parts.iter().any(|x| x == "opens *.epub, *.fb2 by default"), "{:?}", p.parts);
    }

    /// Every plugin this repo ships parses (a new table such as `[android]` must be known to the manifest).
    #[test]
    fn every_shipped_plugin_manifest_parses() {
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../plugins");
        let mut n = 0;
        for tier in std::fs::read_dir(&repo).unwrap().flatten() {
            for p in std::fs::read_dir(tier.path()).into_iter().flatten().flatten() {
                let toml_path = p.path().join("plugin.toml");
                let Ok(text) = std::fs::read_to_string(&toml_path) else { continue };
                toml::from_str::<Manifest>(&text).unwrap_or_else(|e| panic!("{}: {e}", toml_path.display()));
                n += 1;
            }
        }
        assert!(n > 10, "only {n} plugins found under {}", repo.display());
    }

    #[test]
    fn lists_plugins_and_reports_broken_manifests() {
        let t = tempfile::tempdir().unwrap();
        plugin(t.path(), "hello", "title = \"Hello\"\nicon = \"table\"\nkeys = \"Ctrl+Alt+H\"\ndata = \"echo 1\"\n[settings]\ndir = \"runs\"\n");
        plugin(t.path(), "broken", "title = 3\n");
        std::fs::create_dir_all(t.path().join(PLUGINS_DIR).join("not-a-plugin")).unwrap();
        let ps = list(t.path());
        assert_eq!(ps.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["broken", "hello"]);
        assert!(ps[0].error.as_deref().unwrap().contains("plugin.toml"));
        let h = &ps[1];
        assert_eq!((h.title.as_str(), h.view.as_deref(), h.has_data, h.rail), ("Hello", None, true, false), "no view.js: no pane");
        assert_eq!(h.settings["dir"], "runs");
        // conventional modules are picked up when present; the rail is opt-in
        plugin(t.path(), "runs", "title = \"Runs\"\nrail = true\n");
        for f in ["view.js", "main.js"] {
            std::fs::write(t.path().join(PLUGINS_DIR).join("runs").join(f), "").unwrap();
        }
        let r = list(t.path()).into_iter().find(|p| p.id == "runs").unwrap();
        assert_eq!((r.view.as_deref(), r.main.as_deref(), r.rail), (Some(".atlas/plugins/runs/view.js"), Some(".atlas/plugins/runs/main.js"), true));
    }

    #[test]
    fn declared_settings_have_defaults_and_are_saved_into_the_file_without_losing_its_comments() {
        let t = tempfile::tempdir().unwrap();
        let toml = "# my plugin\ntitle = \"Dice\"\nversion = \"0.2.0\"\n\n[settings]\nsides = 20 # the classic\nfree = \"kept\"\n\n[[setting]]\nkey = \"sides\"\nlabel = \"Sides\"\nkind = \"number\"\ndefault = 6\n\n[[setting]]\nkey = \"system\"\nkind = \"choice\"\nchoices = [\"dnd5e\", \"pf2e\"]\ndefault = \"dnd5e\"\n\n[[setting]]\nkey = \"tags\"\nkind = \"list\"\n\n[[setting]]\nkey = \"loud\"\nkind = \"toggle\"\n";
        plugin(t.path(), "dice", toml);
        let sdir = tempfile::tempdir().unwrap();
        let store = crate::secrets::Store::in_dir(sdir.path(), t.path());
        let p = list(t.path()).remove(0);
        assert_eq!(p.error, None);
        assert_eq!((p.version.as_deref(), p.fields.len()), (Some("0.2.0"), 4));
        assert_eq!(p.fields[1].label, "system", "a field without a label is named by its key");
        assert_eq!((&p.settings["sides"], &p.settings["system"], &p.settings["free"]), (&json!(20), &json!("dnd5e"), &json!("kept")), "the file's value, else the default");
        let form = json!({ "sides": 12, "system": "pf2e", "tags": ["npc", "boss"], "loud": true });
        save_settings(t.path(), &store, "dice", form.as_object().unwrap()).unwrap();
        // the values went to the vault's settings file (comments kept); the manifest keeps its own comments, no values
        let text = std::fs::read_to_string(t.path().join(SETTINGS_DIR).join("dice.toml")).unwrap();
        assert!(text.contains("sides = 12 # the classic") && text.contains("free = \"kept\""), "{text}");
        let manifest = std::fs::read_to_string(t.path().join(PLUGINS_DIR).join("dice/plugin.toml")).unwrap();
        assert!(manifest.starts_with("# my plugin\n") && !manifest.contains("[settings]"), "{manifest}");
        let p = list(t.path()).remove(0);
        assert_eq!(p.error, None, "the file still parses");
        assert_eq!((&p.settings["sides"], &p.settings["system"], &p.settings["tags"], &p.settings["loud"]), (&json!(12), &json!("pf2e"), &json!(["npc", "boss"]), &json!(true)));
        // emptied: out of the file, the default is back
        save_settings(t.path(), &store, "dice", json!({ "sides": "" }).as_object().unwrap()).unwrap();
        assert_eq!(list(t.path())[0].settings["sides"], json!(6));
        // refused, and nothing written: an undeclared key, a wrong kind, a value outside the choices
        for bad in [json!({ "free": "x" }), json!({ "sides": "many" }), json!({ "system": "gurps" })] {
            assert!(save_settings(t.path(), &store, "dice", bad.as_object().unwrap()).is_err(), "{bad}");
        }
        assert_eq!(list(t.path())[0].settings["system"], json!("pf2e"));
        // a secret goes to the store outside the vault, never into the file; empty leaves it as it is
        plugin(t.path(), "mail", "title = \"Mail\"\n[permissions]\nsecrets = true\n\n[[setting]]\nkey = \"password\"\nkind = \"secret\"\n\n[[setting]]\nkey = \"user\"\nkind = \"text\"\n");
        save_settings(t.path(), &store, "mail", json!({ "password": "hunter2", "user": "me" }).as_object().unwrap()).unwrap();
        let text = std::fs::read_to_string(t.path().join(SETTINGS_DIR).join("mail.toml")).unwrap();
        assert!(text.contains("user = \"me\"") && !text.contains("hunter2"), "{text}");
        assert_eq!(store.get("mail", "password").unwrap().as_deref(), Some("hunter2"));
        save_settings(t.path(), &store, "mail", json!({ "password": "" }).as_object().unwrap()).unwrap();
        assert_eq!(store.get("mail", "password").unwrap().as_deref(), Some("hunter2"));
        assert!(list(t.path()).iter().find(|p| p.id == "mail").unwrap().settings.get("password").is_none());
        plugin(t.path(), "nosec", "title = \"N\"\n[[setting]]\nkey = \"k\"\nkind = \"secret\"\n");
        assert!(save_settings(t.path(), &store, "nosec", json!({ "k": "v" }).as_object().unwrap()).is_err(), "no permission, no secret");

        // a plugin with fields and no [settings] table yet
        plugin(t.path(), "bare", "title = \"Bare\"\n\n[[setting]]\nkey = \"n\"\nkind = \"number\"\n");
        save_settings(t.path(), &store, "bare", json!({ "n": 3 }).as_object().unwrap()).unwrap();
        let bare = list(t.path()).into_iter().find(|p| p.id == "bare").unwrap();
        assert_eq!((bare.error.clone(), &bare.settings["n"], bare.fields.len()), (None, &json!(3), 1), "{}", std::fs::read_to_string(t.path().join(PLUGINS_DIR).join("bare/plugin.toml")).unwrap());
    }

    #[test]
    fn records_keep_their_secrets_by_card_forget_them_with_the_card_and_survive_an_update() {
        let t = tempfile::tempdir().unwrap();
        let manifest = "title = \"Mail\"\n[permissions]\nsecrets = true\n\n[[setting]]\nkey = \"accounts\"\nkind = \"records\"\nfields = [{ key = \"user\", kind = \"text\" }, { key = \"password\", kind = \"secret\" }, { key = \"port\", kind = \"number\", default = 993 }]\n";
        plugin(t.path(), "mail", manifest);
        let sdir = tempfile::tempdir().unwrap();
        let store = crate::secrets::Store::in_dir(sdir.path(), t.path());
        let cards = json!({ "accounts": [{ "name": "me@uni.example.org", "user": "me", "password": "pw" }, { "name": "home", "port": 143 }] });
        save_settings(t.path(), &store, "mail", cards.as_object().unwrap()).unwrap();
        assert_eq!(store.get("mail", "accounts.me@uni.example.org.password").unwrap().as_deref(), Some("pw"), "a card's secret, under its name");
        let p = list(t.path()).remove(0);
        assert_eq!(p.settings["accounts"], json!([{ "name": "me@uni.example.org", "user": "me", "port": 993 }, { "name": "home", "port": 143 }]));
        // the cards are in the vault's settings file, not the manifest: an update replaces the manifest, they stay
        let file = std::fs::read_to_string(t.path().join(SETTINGS_DIR).join("mail.toml")).unwrap();
        assert!(file.contains("[[accounts]]") && !file.contains("pw"), "{file}");
        assert!(!std::fs::read_to_string(t.path().join(PLUGINS_DIR).join("mail/plugin.toml")).unwrap().contains("[settings"));
        plugin(t.path(), "mail", &format!("# v2\n{manifest}"));
        assert_eq!(list(t.path()).remove(0).settings["accounts"].as_array().map(Vec::len), Some(2));
        // renamed: its secret follows it, nothing is forgotten, and the plugin is told
        let renamed = save_settings(t.path(), &store, "mail", json!({ "accounts": [{ "name": "uni", "renamed_from": "me@uni.example.org", "user": "me" }, { "name": "home", "port": 143 }] }).as_object().unwrap()).unwrap();
        assert_eq!(renamed, vec![("accounts".to_string(), "me@uni.example.org".to_string(), "uni".to_string())]);
        assert_eq!(store.get("mail", "accounts.uni.password").unwrap().as_deref(), Some("pw"));
        assert_eq!(store.get("mail", "accounts.me@uni.example.org.password").unwrap(), None);
        assert!(!std::fs::read_to_string(t.path().join(SETTINGS_DIR).join("mail.toml")).unwrap().contains("renamed_from"));
        save_settings(t.path(), &store, "mail", json!({ "accounts": [{ "name": "me@uni.example.org", "renamed_from": "uni", "user": "me" }, { "name": "home", "port": 143 }] }).as_object().unwrap()).unwrap();
        // the card removed: its secret goes with it
        save_settings(t.path(), &store, "mail", json!({ "accounts": [{ "name": "home" }] }).as_object().unwrap()).unwrap();
        assert_eq!(store.get("mail", "accounts.me@uni.example.org.password").unwrap(), None);
        assert_eq!(list(t.path())[0].settings["accounts"], json!([{ "name": "home", "port": 993 }]));
    }

    /// An older vault kept its values in the manifest's [settings]: they count until the first save, which moves them
    /// (every key, declared or not) to the settings file and leaves the manifest without them.
    #[test]
    fn settings_in_an_old_manifest_move_to_the_settings_file_at_the_first_save() {
        let t = tempfile::tempdir().unwrap();
        plugin(t.path(), "runs", "title = \"Runs\"\n[settings]\ndir = \"notes/runs\"\nfree = 7\n\n[[setting]]\nkey = \"dir\"\nkind = \"text\"\n");
        assert_eq!(list(t.path())[0].settings["dir"], json!("notes/runs"), "read from the manifest until then");
        let sdir = tempfile::tempdir().unwrap();
        save_settings(t.path(), &crate::secrets::Store::in_dir(sdir.path(), t.path()), "runs", json!({ "dir": "runs" }).as_object().unwrap()).unwrap();
        let p = list(t.path()).remove(0);
        assert_eq!((&p.settings["dir"], &p.settings["free"]), (&json!("runs"), &json!(7)));
        assert!(!std::fs::read_to_string(t.path().join(PLUGINS_DIR).join("runs/plugin.toml")).unwrap().contains("[settings]"));
        let file = std::fs::read_to_string(t.path().join(SETTINGS_DIR).join("runs.toml")).unwrap();
        assert!(file.starts_with("# Settings of the plugin runs") && file.contains("dir = \"runs\"") && file.contains("free = 7"), "{file}");
    }

    /// The email migration: an older vault's flat keys in the manifest, an empty settings file; the save sends them as
    /// null with the cards — they are gone from the file, the rest of [settings] stays.
    #[test]
    fn keys_sent_as_null_leave_the_settings_file_even_when_they_came_from_the_manifest() {
        let t = tempfile::tempdir().unwrap();
        plugin(t.path(), "mail", "title = \"Mail\"\n[settings]\nauth = \"outlook\"\nuser = \"me\"\nfolder = \"notes/mail\" # kept\n\n[[setting]]\nkey = \"accounts\"\nkind = \"records\"\nfields = [{ key = \"user\", kind = \"text\" }]\n\n[[setting]]\nkey = \"folder\"\nkind = \"text\"\n");
        std::fs::create_dir_all(t.path().join(SETTINGS_DIR)).unwrap();
        std::fs::write(t.path().join(SETTINGS_DIR).join("mail.toml"), "").unwrap();
        let sdir = tempfile::tempdir().unwrap();
        save_settings(t.path(), &crate::secrets::Store::in_dir(sdir.path(), t.path()), "mail", json!({ "accounts": [{ "name": "uni", "user": "me" }], "auth": null, "user": null }).as_object().unwrap()).unwrap();
        let file = std::fs::read_to_string(t.path().join(SETTINGS_DIR).join("mail.toml")).unwrap();
        assert!(!file.contains("auth =") && !file.contains("\nuser = \"me\"\n\n") && file.contains("folder = \"notes/mail\" # kept") && file.contains("[[accounts]]"), "{file}");
    }

    #[test]
    fn a_plugin_that_needs_a_newer_atlas_is_listed_with_the_reason_and_not_loaded() {
        let m = |extra: &str| toml::from_str::<Manifest>(&format!("title = \"T\"\n{extra}")).unwrap();
        assert_eq!(too_old_for(&m(""), "0.1.0"), None);
        assert_eq!(too_old_for(&m("needs = \">=0.1\""), "0.1.0"), None);
        assert_eq!(too_old_for(&m("needs = \"0.1.0\"\napi = 4"), "0.1.0"), None);
        assert!(too_old_for(&m("needs = \">= 0.10\""), "0.9.3").unwrap().contains("needs Atlas 0.10"), "10 is more than 9: numbers, not text");
        assert!(too_old_for(&m("api = 99"), "0.1.0").unwrap().contains("API 99"));
        let t = tempfile::tempdir().unwrap();
        plugin(t.path(), "future", "title = \"From the future\"\nneeds = \">=99.0\"\n");
        std::fs::write(t.path().join(PLUGINS_DIR).join("future/main.js"), "").unwrap();
        let p = list(t.path()).remove(0);
        assert_eq!((p.title.as_str(), p.main), ("From the future", None), "named, not loaded");
        assert!(p.error.unwrap().contains("needs Atlas 99.0"));
    }

    #[tokio::test]
    async fn data_script_gets_settings_args_and_its_folder() {
        let t = tempfile::tempdir().unwrap();
        plugin(
            t.path(),
            "echo",
            "title = \"Echo\"\ndata = \"python3 \\\"$ATLAS_PLUGIN_DIR/echo.py\\\"\"\n[settings]\nk = 2\n",
        );
        let script = "import json,os,sys\nd = json.load(sys.stdin)\nprint(json.dumps([d, os.path.basename(os.environ['ATLAS_PLUGIN_DIR'])]))\n";
        std::fs::write(t.path().join(PLUGINS_DIR).join("echo/echo.py"), script).unwrap();
        let v = data(t.path(), "echo", json!({ "q": "x" })).await.unwrap();
        assert_eq!(v, json!([{ "settings": { "k": 2 }, "args": { "q": "x" } }, "echo"]));
        assert!(data(t.path(), "../etc", json!({})).await.is_err());
        assert!(data(t.path(), "missing", json!({})).await.is_err());
    }

    /// Settings says what a helper-only plugin adds instead of "nothing registered yet".
    #[test]
    fn a_plugins_parts_say_what_it_adds_in_words() {
        let t = tempfile::tempdir().unwrap();
        plugin(t.path(), "abs", concat!(
            "title = \"ABS\"\n[helper]\nrun = \"true\"\n",
            "[[tool]]\nname = \"lookup\"\ndescription = \"x\"\n",
            "[[tool]]\nname = \"sync\"\ndescription = \"x\"\nschedule = \"every 6h\"\n",
            "[[tool]]\nname = \"read\"\ndescription = \"x\"\non = \"capture\"\n",
            "[[tool]]\nname = \"now\"\ndescription = \"x\"\ntemplate = \"weather\"\n",
            "[contributes.catalog]\nrecognize = [{ pattern = \"x\", kind = \"book\", id = \"abs\" }]\n",
            "sources = [{ kind = [\"book\", \"science_book\"], tool = \"lookup\" }, { kind = \"book\", tool = \"sync\" }]\n",
            "[contributes.catalog-papers]\npdf_sources = [{ tool = \"lookup\" }]\n",
        ));
        let p = list(t.path()).into_iter().find(|p| p.id == "abs").unwrap();
        assert_eq!(p.parts, [
            "sync every 6h", "reads every capture", "{{weather}} in templates", "4 tools for agents",
            "fills in book, science_book for catalog", "recognises its links for catalog", "finds PDFs for catalog-papers",
        ]);
    }

    #[test]
    fn a_subplugin_contributes_to_its_meta_plugin_only_while_both_can_run() {
        let t = tempfile::tempdir().unwrap();
        plugin(t.path(), "catalog", "title = \"Catalog\"\n");
        plugin(t.path(), "catalog-tmdb", "title = \"TMDB\"\nrequires = [\"catalog\"]\n[contributes.catalog]\nsources = [{ kind = \"movie\", tool = \"lookup\" }]\n");
        // a service's own plugin: its block works on its own, and it also gives the catalog a link when there is one
        plugin(t.path(), "jellyfin", "title = \"Jellyfin\"\n[contributes.catalog]\nlinks = [{ kind = \"movie\", tool = \"item\" }]\n");
        plugin(t.path(), "catalog-wiki", "title = \"Wiki\"\nrequires = [\"catalog\", \"wikidata\"]\n[contributes.catalog]\nsources = []\n");
        plugin(t.path(), "loop-a", "title = \"A\"\nrequires = [\"loop-b\"]\n");
        plugin(t.path(), "loop-b", "title = \"B\"\nrequires = [\"loop-a\"]\n");
        let all = list(t.path());
        let tmdb = all.iter().find(|p| p.id == "catalog-tmdb").unwrap();
        assert_eq!(tmdb.requires, ["catalog"]);
        assert!(all.iter().find(|p| p.id == "jellyfin").unwrap().requires.is_empty(), "contributing is optional");
        assert_eq!(blocked(&all, &["catalog".into()], "jellyfin"), None, "the service's plugin runs with the catalog off");
        assert_eq!(blocked(&all, &[], "catalog-tmdb"), None);
        assert_eq!(blocked(&all, &["catalog".into()], "catalog-tmdb").as_deref(), Some("needs catalog: Catalog is switched off"));
        assert_eq!(blocked(&all, &[], "catalog-wiki").as_deref(), Some("needs wikidata: needs the plugin wikidata, which is not installed"));
        assert!(blocked(&all, &[], "loop-a").unwrap().contains("requires itself"));

        let c = contributions(t.path(), &[], "catalog").unwrap();
        assert_eq!(c.keys().collect::<Vec<_>>(), ["catalog-tmdb", "jellyfin"], "the wiki one cannot run");
        assert_eq!(c["catalog-tmdb"]["sources"][0]["tool"], "lookup");
        let c = contributions(t.path(), &["catalog-tmdb".into()], "catalog").unwrap();
        assert_eq!(c.keys().collect::<Vec<_>>(), ["jellyfin"], "a switched-off subplugin contributes nothing");
    }
}
