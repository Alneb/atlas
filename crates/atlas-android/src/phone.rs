//! What the phone's screen asks of Rust. Offsets the screen sees are UTF-16 (Java strings).
use atlas_capture::complete::{self, Names};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

fn names() -> &'static Mutex<HashMap<PathBuf, Arc<Names>>> {
    static N: OnceLock<Mutex<HashMap<PathBuf, Arc<Names>>>> = OnceLock::new();
    N.get_or_init(Default::default)
}

/// Reads the vault's note names and tags in the background; completions use them once there.
pub fn prepare(vault: &Path) {
    let root = vault.to_path_buf();
    std::thread::spawn(move || {
        if let Some(n) = Names::load(&root) {
            names().lock().unwrap().insert(root, Arc::new(n));
        }
    });
}

fn byte_of(text: &str, utf16: usize) -> usize {
    let mut n = 0;
    for (b, c) in text.char_indices() {
        if n >= utf16 {
            return b;
        }
        n += c.len_utf16();
    }
    text.len()
}

fn utf16_of(text: &str, byte: usize) -> usize {
    text[..byte.min(text.len())].encode_utf16().count()
}

/// The completions at the caret: `[{label, detail, icon, insert, from, to, more, newLine}]`.
pub fn suggest(vault: &Path, text: &str, caret_utf16: usize) -> Value {
    let n = names().lock().unwrap().get(vault).cloned().unwrap_or_default();
    let caret = byte_of(text, caret_utf16);
    let items = complete::suggest(text, caret, &n);
    Value::Array(
        items
            .into_iter()
            .map(|s| {
                json!({ "label": s.label, "detail": s.detail, "icon": icon_name(s.icon), "insert": s.insert,
                        "from": utf16_of(text, s.replace.start), "to": utf16_of(text, s.replace.end), "more": s.more, "newLine": s.new_line })
            })
            .collect(),
    )
}

/// `ChevronsUp` → `chevrons_up`: the drawable's name (res/drawable/ic_<name>.xml).
pub fn icon_name(icon: atlas_capture::icons::Icon) -> String {
    let mut out = String::new();
    for (i, c) in format!("{icon:?}").chars().enumerate() {
        if c.is_uppercase() && i > 0 {
            out.push('_');
        }
        out.push(c.to_ascii_lowercase());
    }
    out
}

pub fn describe(text: &str) -> String {
    complete::what_it_becomes(text)
}

/// Writes the capture: `{path, line}` or `{error}`.
pub fn save(vault: &Path, text: &str) -> Value {
    match atlas_capture::send::capture(vault, text) {
        Ok((path, line)) => json!({ "path": path, "line": line }),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

/// Copies a file (a screenshot, a shared file) beside today's log note: `{path, embed}` or `{error}`.
pub fn attach(vault: &Path, name: &str, source: &Path) -> Value {
    match atlas_capture::send::attach(vault, name, source) {
        Ok((path, embed)) => json!({ "path": path, "embed": embed }),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

/// Folders under `root` that are vaults (holding `.atlas` or `.obsidian`), at most 4 levels down; hidden folders and
/// Android's own are skipped. → `[{name, path, kind}]`.
pub fn find_vaults(root: &Path) -> Value {
    fn walk(dir: &Path, depth: u8, out: &mut Vec<Value>) {
        for kind in ["atlas", "obsidian"] {
            if dir.join(format!(".{kind}")).is_dir() {
                let name = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                out.push(json!({ "name": name, "path": dir.display().to_string(), "kind": kind }));
                return;
            }
        }
        if depth == 0 {
            return;
        }
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        let mut subs: Vec<PathBuf> = rd
            .flatten()
            .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
            .map(|e| e.path())
            .filter(|p| p.file_name().is_some_and(|n| !n.to_string_lossy().starts_with('.') && n != "Android"))
            .collect();
        subs.sort();
        for s in subs {
            walk(&s, depth - 1, out);
        }
    }
    let mut out = Vec::new();
    walk(root, 4, &mut out);
    Value::Array(out)
}

/// After a native screen saved drawing `rel` with `scene`: its companion note brought up to date, the desktop's own
/// function (atlas_core::drawing_note) → `{note}` (the path written, or null) or `{error}`.
pub fn drawing_saved(vault: &Path, rel: &str, scene: &str) -> Value {
    let done = atlas_core::Workspace::open(vault).and_then(|ws| atlas_core::drawing_note::update(&ws, rel, scene));
    match done {
        Ok(note) => serde_json::json!({ "note": note }),
        Err(e) => serde_json::json!({ "error": e.to_string() }),
    }
}

/// A plugin switched on or off in this vault (`plugins.off` in its config, as the desktop's Settings does): `{}` or `{error}`.
/// The vault's settings as `GET /api/config` answers them — `{config, schema}` — so the app draws them natively the
/// same way for a vault here and on a server (SettingsPages), or `{error}`.
/// The one note of a file (atlas_core::companion: a paper's PDF has the paper's note, else `<name>.md` beside it), only
/// found — the reader writes its own note when it must: `{path, created}` or `{error}`.
pub fn companion_note(vault: &Path, request: &str) -> Value {
    let cfg = atlas_core::config::Config::load(vault).unwrap_or_default();
    // the body `POST /api/companion` takes, so a vault here and one on a server are asked alike
    let req: atlas_core::api::CompanionRequest = match serde_json::from_str(request) {
        Ok(r) => r,
        Err(e) => return json!({ "error": format!("companion request: {e}") }),
    };
    match atlas_core::companion::ensure(vault, &cfg, &req, chrono::Local::now().naive_local()) {
        Ok(n) => json!({ "path": n.path, "created": n.created }),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

/// A PDF's marks from its note's block (core pdf_marks.rs): `{note, marks}` or `{error}`.
pub fn pdf_marks(vault: &Path, pdf: &str) -> Value {
    let cfg = atlas_core::config::Config::load(vault).unwrap_or_default();
    match atlas_core::pdf_marks::marks_of(vault, &cfg, pdf) {
        Ok(m) => json!(m),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

/// `ops` (a JSON array of `{op: "put", mark} | {op: "remove", id}`) applied to a PDF's note: the marks after, or
/// `{error}`.
pub fn change_pdf_marks(vault: &Path, pdf: &str, ops: &str) -> Value {
    let cfg = atlas_core::config::Config::load(vault).unwrap_or_default();
    let ops: Vec<atlas_core::pdf_marks::Op> = match serde_json::from_str(ops) {
        Ok(o) => o,
        Err(e) => return json!({ "error": format!("the marks' changes: {e}") }),
    };
    match atlas_core::pdf_marks::change(vault, &cfg, pdf, ops, chrono::Local::now().naive_local()) {
        Ok((m, _)) => json!(m),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

/// "Export with marks" (core pdf_export.rs): `x (marked).pdf` beside the PDF, its marks as real annotations — what was
/// written (`{path, annotations, bookmarks, skipped, rewritten}`), or `{error}`.
pub fn export_pdf_marks(vault: &Path, pdf: &str) -> Value {
    match atlas_core::Workspace::open(vault).and_then(|ws| atlas_core::pdf_export::export(&ws, pdf, atlas_core::pdf_export::Mode::Annotations)) {
        Ok(r) => json!(r),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

pub fn config(vault: &Path) -> Value {
    match atlas_core::config::Config::load(vault) {
        Ok(c) => json!({ "config": c, "schema": atlas_core::config::Config::schema() }),
        Err(e) => json!({ "error": format!("{e:#}") }),
    }
}

/// The vault's settings written as `PUT /api/config` writes them (`config`: the whole config, JSON): `{}` or `{error}`.
pub fn config_save(vault: &Path, config: &str) -> Value {
    let cfg: atlas_core::config::Config = match serde_json::from_str(config) {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("not a config: {e}") }),
    };
    match atlas_core::config::Config::save(vault, &cfg) {
        Ok(()) => json!({}),
        Err(e) => json!({ "error": format!("{e:#}") }),
    }
}

pub fn set_plugin_on(vault: &Path, id: &str, on: bool) -> Value {
    let mut cfg = match atlas_core::config::Config::load(vault) {
        Ok(c) => c,
        Err(e) => return json!({ "error": format!("{e:#}") }),
    };
    cfg.plugins.off.retain(|o| o != id);
    if !on {
        cfg.plugins.off.push(id.to_string());
    }
    match atlas_core::config::Config::save(vault, &cfg) {
        Ok(()) => json!({}),
        Err(e) => json!({ "error": format!("{e:#}") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offsets_are_utf16_and_vaults_are_found() {
        let t = "é 📅 [[ko";
        assert_eq!(byte_of(t, utf16_of(t, t.len())), t.len());
        assert_eq!(utf16_of(t, "é 📅".len()), 4, "📅 is two UTF-16 units");
        let d = std::env::temp_dir().join(format!("atlas-android-{}", std::process::id()));
        std::fs::create_dir_all(d.join("Sync/Notes/.obsidian")).unwrap();
        std::fs::create_dir_all(d.join("Android/data/x/.atlas")).unwrap();
        std::fs::create_dir_all(d.join("Notes/log")).unwrap();
        let v = find_vaults(&d);
        assert_eq!(v.as_array().unwrap().len(), 1, "{v}");
        assert_eq!(v[0]["name"], "Notes");
        assert_eq!(suggest(&d.join("Notes"), "call @tom", 9)[0]["insert"], "tomorrow ");
        let saved = save(&d.join("Notes"), "[] call x");
        assert!(saved["path"].as_str().unwrap().starts_with("log/"), "{saved}");
        std::fs::write(d.join("shot.png"), b"png").unwrap();
        let a = attach(&d.join("Notes"), "shot.png", &d.join("shot.png"));
        assert_eq!(a["embed"], "![[shot.png]]", "{a}");
        assert_eq!(icon_name(atlas_capture::icons::Icon::ChevronsUp), "chevrons_up");
        std::fs::remove_dir_all(&d).ok();
    }
}

/// The vault's plugins for the native sides (docs/refactor/REFACTOR-native-plugins.md): `[{id, on, why, settings}]` — `on`
/// false when the vault switched it off or it cannot run here, `why` saying which (plugins::blocked), `settings` with the defaults filled in, the
/// same values the plugin's web side reads. A plugin switched off but not installed here is listed too (`on` false,
/// no settings): the app's built-in plugins run in every vault that does not switch them off.
pub fn plugins(vault: &Path) -> Value {
    let off = atlas_core::config::Config::load(vault).map(|c| c.plugins.off).unwrap_or_default();
    let all = atlas_core::plugins::list(vault);
    let mut rows: Vec<Value> = all
        .iter()
        // `off`: switched off by the vault's config.toml — the one thing that stops a plugin built into the app
        // (VaultFiles.on), which runs whatever the vault's own copy of it says
        .map(|p| {
            let why = atlas_core::plugins::blocked(&all, &off, &p.id);
            json!({ "id": p.id, "title": p.title, "description": p.description, "phone": p.phone, "on": why.is_none(), "why": why, "off": off.contains(&p.id), "settings": p.settings, "fields": p.fields })
        })
        .collect();
    rows.extend(off.iter().filter(|id| !all.iter().any(|p| &p.id == *id)).map(|id| json!({ "id": id, "on": false, "off": true, "settings": {} })));
    Value::Array(rows)
}

/// A built-in plugin's form from the manifest the app carries (`{fields, settings}` with defaults, or `{error}`): what
/// Settings and the plugin read while the vault has no folder for it.
pub fn plugin_form(manifest: &str) -> Value {
    match atlas_core::plugins::form_of(manifest) {
        Ok((fields, settings)) => json!({ "fields": fields, "settings": settings }),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

/// Plugin `id`'s settings changed from the app's own Settings (`values`: a JSON object of key → value), written as the
/// server writes them (plugins::save_settings: into its plugin.toml, secrets to the store): `{}` or `{error}`.
pub fn save_plugin_settings(vault: &Path, id: &str, values: &str) -> Value {
    let values: serde_json::Map<String, Value> = match serde_json::from_str(values) {
        Ok(v) => v,
        Err(e) => return json!({ "error": format!("not settings: {e}") }),
    };
    match atlas_core::plugins::save_settings(vault, &atlas_core::secrets::Store::for_vault(vault), id, &values) {
        Ok(_) => json!({}), // the renamed cards matter to a running plugin, not to the phone
        Err(e) => json!({ "error": e.to_string() }),
    }
}

#[cfg(test)]
mod plugin_tests {
    use super::*;

    #[test]
    fn the_config_read_and_saved_as_the_server_does() {
        let d = tempfile::tempdir().unwrap();
        let got = config(d.path());
        assert!(got["schema"]["properties"].is_object() && got["config"].is_object(), "{got}");
        let mut c = got["config"].clone();
        c["ui"]["font_size"] = json!(17);
        assert_eq!(config_save(d.path(), &c.to_string()), json!({}));
        assert_eq!(config(d.path())["config"]["ui"]["font_size"], 17);
        assert!(config_save(d.path(), "[1]").get("error").is_some());
    }

    #[test]
    fn a_carried_manifest_gives_its_form_with_defaults() {
        let f = plugin_form("title = \"Notepad\"\n[[setting]]\nkey = \"width\"\nlabel = \"Width\"\nkind = \"choice\"\nchoices = [\"thin\", \"normal\"]\ndefault = \"normal\"\n");
        assert_eq!(f["fields"][0]["key"], "width");
        assert_eq!(f["settings"]["width"], "normal", "the default filled in");
        assert!(plugin_form("not toml [").get("error").is_some());
    }

    #[test]
    fn a_broken_copy_cannot_run_but_is_not_off() {
        // the app's own Notepad runs whatever the vault's copy says (VaultFiles.on reads `off`, not `on`)
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(".atlas/plugins/notepad");
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("plugin.toml"), "not toml [").unwrap();
        let rows = plugins(d.path());
        assert_eq!((rows[0]["on"].as_bool(), rows[0]["off"].as_bool()), (Some(false), Some(false)), "{rows}");
    }

    #[test]
    fn the_vaults_plugins_with_their_settings_and_whether_they_run() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(".atlas/plugins/manga");
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("plugin.toml"), "title = \"Manga\"\napi = 4\n[[setting]]\nkey = \"direction\"\nlabel = \"Direction\"\nkind = \"text\"\ndefault = \"rtl\"\n").unwrap();
        let rows = plugins(d.path());
        assert_eq!(rows[0]["id"], "manga");
        assert_eq!(rows[0]["on"], true);
        assert_eq!(rows[0]["settings"]["direction"], "rtl", "the default filled in");
        std::fs::write(d.path().join(".atlas/config.toml"), "[plugins]\noff = [\"manga\"]\n").unwrap();
        assert_eq!((plugins(d.path())[0]["on"].as_bool(), plugins(d.path())[0]["off"].as_bool()), (Some(false), Some(true)), "switched off in this vault");
        std::fs::write(d.path().join(".atlas/config.toml"), "[plugins]\noff = [\"notepad\"]\n").unwrap();
        let rows = plugins(d.path());
        assert_eq!((rows[1]["id"].as_str(), rows[1]["off"].as_bool()), (Some("notepad"), Some(true)), "a built-in switched off, not installed");
        assert_eq!(rows[0]["off"], false, "manga no longer in the list: not off");
        assert_eq!(rows[0]["fields"][0]["key"], "direction", "the fields the app's form draws");
        assert_eq!(save_plugin_settings(d.path(), "manga", r#"{"direction":"ltr"}"#), json!({}));
        assert_eq!(plugins(d.path())[0]["settings"]["direction"], "ltr", "saved where the server saves it");
    }

    #[test]
    fn a_plugin_switched_off_and_on_again() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join(".atlas")).unwrap();
        assert_eq!(set_plugin_on(d.path(), "notepad", false), json!({}));
        assert_eq!((plugins(d.path())[0]["id"].as_str(), plugins(d.path())[0]["on"].as_bool()), (Some("notepad"), Some(false)));
        assert_eq!(set_plugin_on(d.path(), "notepad", false), json!({}), "twice off: listed once");
        assert_eq!(atlas_core::config::Config::load(d.path()).unwrap().plugins.off, vec!["notepad".to_string()]);
        assert_eq!(set_plugin_on(d.path(), "notepad", true), json!({}));
        assert!(atlas_core::config::Config::load(d.path()).unwrap().plugins.off.is_empty(), "on again");
    }

    #[test]
    fn every_icon_the_java_asks_for_is_drawn() {
        // a name with no icon crashed the app on start (the bottom bar's Library, 2026-10-20): the names the Java gives
        // Look.icon, in a call or in the bottom bar's { "icon", "Label" } list, each one of the icons drawn
        let names: std::collections::HashSet<String> = atlas_capture::icons::Icon::ALL.iter().map(|i| icon_name(*i)).collect();
        let call = regex::Regex::new(r#"\.icon\([^,()]+(?:\(\))?, "([a-z_]+)""#).unwrap();
        let bar = regex::Regex::new(r#"\{ "([a-z_]+)", "[A-Z][a-z]+" \}"#).unwrap();
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let mut missing = Vec::new();
        for dir in ["crates/atlas-android/android/java", "plugins"] {
            for e in walkdir::WalkDir::new(root.join(dir)).into_iter().flatten().filter(|e| e.path().extension().is_some_and(|x| x == "java")) {
                let text = std::fs::read_to_string(e.path()).unwrap();
                for c in call.captures_iter(&text).chain(bar.captures_iter(&text)) {
                    if !names.contains(&c[1]) { missing.push(format!("{}: {}", e.path().display(), &c[1])); }
                }
            }
        }
        assert!(missing.is_empty(), "icons asked for but not drawn: {missing:?}");
    }
}
