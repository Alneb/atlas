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
    complete::what_it_becomes(None, text)
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

/// A built-in plugin's form from the manifest the app carries (`{fields, settings}` with defaults, or `{error}`): what
/// Settings and the plugin read while the vault has no folder for it.
pub fn plugin_form(manifest: &str) -> Value {
    match atlas_core::plugins::form_of(manifest) {
        Ok((fields, settings)) => json!({ "fields": fields, "settings": settings }),
        Err(e) => json!({ "error": e.to_string() }),
    }
}

#[cfg(test)]
mod plugin_tests {
    use super::*;

    #[test]
    fn a_carried_manifest_gives_its_form_with_defaults() {
        let f = plugin_form("title = \"Notepad\"\n[[setting]]\nkey = \"width\"\nlabel = \"Width\"\nkind = \"choice\"\nchoices = [\"thin\", \"normal\"]\ndefault = \"normal\"\n");
        assert_eq!(f["fields"][0]["key"], "width");
        assert_eq!(f["settings"]["width"], "normal", "the default filled in");
        assert!(plugin_form("not toml [").get("error").is_some());
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
