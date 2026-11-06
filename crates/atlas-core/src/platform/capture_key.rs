//! The desktop's global key for Atlas Capture (docs/guides/CAPTURE.md, "The global key"): what it is now, and setting
//! it from Settings → Desktop app, which a package (unlike install.sh) cannot do itself. KDE Plasma keeps it in
//! `kglobalshortcutsrc` (the same rules as packaging/kde-shortcut.sh: a key the user chose is kept, a key another
//! shortcut uses is not taken); GNOME in its custom keybindings; Windows' installer puts it on the Start-menu shortcut
//! and macOS's app registers it while it runs, so those two are only reported.
use std::process::Command;

/// The key offered when there is none (KDE's spelling; Super on screen).
pub const DEFAULT_KEY: &str = "Meta+Shift+C";
const KDE_FILE: &str = "kglobalshortcutsrc";
const KDE_ENTRY: &str = "atlas-capture.desktop";
const GNOME_SCHEMA: &str = "org.gnome.settings-daemon.plugins.media-keys";
const GNOME_PATH: &str = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/atlas-capture/";

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, ts_rs::TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum KeyDesktop {
    Kde,
    Gnome,
    Windows,
    Macos,
    /// Another Linux desktop: its own shortcut settings, by hand.
    Other,
}

/// What Settings shows: the key now (KDE's spelling), whether Atlas can set one here, and what to do otherwise.
#[derive(Clone, Debug, serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct CaptureKey {
    pub desktop: KeyDesktop,
    pub key: Option<String>,
    pub can_set: bool,
    /// One sentence: where the key lives, or why it cannot be set from here.
    pub note: String,
}

pub fn state() -> CaptureKey {
    match desktop() {
        KeyDesktop::Windows => fixed(KeyDesktop::Windows, "Ctrl+Alt+Shift+C", "The installer puts it on the Atlas Capture shortcut in the Start menu (its Properties change it)."),
        KeyDesktop::Macos => fixed(KeyDesktop::Macos, "Control+Super+C", "Atlas listens for it while it runs, in the tray too (ATLAS_CAPTURE_KEY changes it)."),
        KeyDesktop::Kde => kde_state(),
        KeyDesktop::Gnome => gnome_state(),
        KeyDesktop::Other => CaptureKey { desktop: KeyDesktop::Other, key: None, can_set: false, note: "Bind a key to the program atlas-capture in your desktop's keyboard shortcuts.".into() },
    }
}

/// Binds `key` (KDE's spelling) to Atlas Capture where Atlas can, and says what is bound after.
pub fn set(key: &str) -> Result<CaptureKey, String> {
    let key = key.trim();
    if !plausible_key(key) {
        return Err(format!("{key:?} is not a key: a modifier, + and a letter, like {DEFAULT_KEY}"));
    }
    match desktop() {
        KeyDesktop::Kde => kde_set(key)?,
        KeyDesktop::Gnome => gnome_set(key)?,
        _ => return Err("this desktop's key is not set from Atlas".into()),
    }
    Ok(state())
}

fn fixed(desktop: KeyDesktop, key: &str, note: &str) -> CaptureKey {
    CaptureKey { desktop, key: Some(key.into()), can_set: false, note: note.into() }
}

fn desktop() -> KeyDesktop {
    if cfg!(target_os = "windows") {
        return KeyDesktop::Windows;
    }
    if cfg!(target_os = "macos") {
        return KeyDesktop::Macos;
    }
    // a Flatpak's entries are named by its id and its config is its own: the desktop's settings, by hand
    if super::host::sandboxed() {
        return KeyDesktop::Other;
    }
    let names = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_ascii_lowercase();
    if names.split(':').any(|n| n == "kde") {
        KeyDesktop::Kde
    } else if names.split(':').any(|n| n == "gnome" || n == "unity" || n == "budgie") {
        KeyDesktop::Gnome
    } else {
        KeyDesktop::Other
    }
}

/// Modifiers then one key, `+` between: what both desktops accept from here.
fn plausible_key(key: &str) -> bool {
    let parts: Vec<&str> = key.split('+').collect();
    let (last, mods) = parts.split_last().map_or(("", &[][..]), |(l, m)| (*l, m));
    !mods.is_empty()
        && mods.iter().all(|m| ["Meta", "Ctrl", "Alt", "Shift"].contains(m))
        && !last.is_empty()
        && last.chars().all(|c| c.is_ascii_alphanumeric())
}

/// Runs a desktop tool; its trimmed output, or why it failed.
fn run(program: &str, args: &[&str]) -> Result<String, String> {
    let out = Command::new(program).args(args).output().map_err(|e| format!("{program}: {e}"))?;
    if !out.status.success() {
        return Err(format!("{program}: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

// ---- KDE Plasma ----

fn kde_read() -> Result<Option<String>, String> {
    let v = run("kreadconfig6", &["--file", KDE_FILE, "--group", "services", "--group", KDE_ENTRY, "--key", "_launch"])?;
    // a value is "keys,default,name"; several keys are separated by a tab, spelt \t
    let first = v.split(',').next().unwrap_or("").split("\\t").next().unwrap_or("").trim().to_string();
    Ok((!first.is_empty() && first != "none").then_some(first))
}

fn kde_state() -> CaptureKey {
    match kde_read() {
        Ok(key) => CaptureKey {
            desktop: KeyDesktop::Kde,
            can_set: kde_entry_installed(),
            note: if kde_entry_installed() { "Kept by KDE (System Settings → Shortcuts → Atlas Capture).".into() } else { "Atlas Capture's menu entry (atlas-capture.desktop) is not installed, so KDE has nothing to bind it to.".into() },
            key,
        },
        Err(e) => CaptureKey { desktop: KeyDesktop::Kde, key: None, can_set: false, note: format!("KDE's shortcuts could not be read ({e}).") },
    }
}

/// KDE binds a key to a menu entry: the packages and install.sh put `atlas-capture.desktop` among the applications.
fn kde_entry_installed() -> bool {
    let mut dirs = vec![super::dirs::base(super::dirs::Base::Data)];
    let system = std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    dirs.extend(system.split(':').filter(|d| !d.is_empty()).map(Into::into));
    dirs.iter().any(|d| d.join("applications").join(KDE_ENTRY).is_file())
}

fn kde_set(key: &str) -> Result<(), String> {
    if !kde_entry_installed() {
        return Err("atlas-capture.desktop is not installed: reinstall Atlas's package".into());
    }
    let path = super::dirs::base(super::dirs::Base::Config).join(KDE_FILE);
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    if let Some(by) = kde_taken_by(&text, key) {
        return Err(format!("{key} is already used by {by}: pick another"));
    }
    for (k, v) in [("_k_friendly_name", "Atlas Capture"), ("_launch", &format!("{key},none,Atlas Capture"))] {
        run("kwriteconfig6", &["--file", KDE_FILE, "--group", "services", "--group", KDE_ENTRY, "--key", k, v])?;
    }
    // kglobalaccel reads the file when it starts; a restart takes the new key at once (a missing unit is no error)
    let _ = run("systemctl", &["--user", "try-restart", "plasma-kglobalaccel.service"]);
    Ok(())
}

/// The group whose shortcut (or default) is `key` already, Atlas Capture's own aside.
fn kde_taken_by(text: &str, key: &str) -> Option<String> {
    let mut group = String::new();
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            group = line.to_string();
            continue;
        }
        if group.contains(KDE_ENTRY) || line.starts_with('#') {
            continue;
        }
        let Some((_, value)) = line.split_once('=') else { continue };
        // "keys,default keys,name": only the first two are keys
        let mut fields = value.splitn(3, ',');
        let keys = [fields.next().unwrap_or(""), fields.next().unwrap_or("")];
        if keys.iter().flat_map(|k| k.split("\\t")).any(|k| k.trim().eq_ignore_ascii_case(key)) {
            return Some(group.trim_matches(['[', ']']).replace("][", " → "));
        }
    }
    None
}

// ---- GNOME ----

fn gnome_state() -> CaptureKey {
    let listed = run("gsettings", &["get", GNOME_SCHEMA, "custom-keybindings"]).unwrap_or_default();
    let key = if listed.contains(GNOME_PATH) {
        run("gsettings", &["get", &format!("{GNOME_SCHEMA}.custom-keybinding:{GNOME_PATH}"), "binding"]).ok().and_then(|b| from_gnome(b.trim_matches('\'')))
    } else {
        None
    };
    let found = which_capture().is_some();
    CaptureKey {
        desktop: KeyDesktop::Gnome,
        key,
        can_set: found,
        note: if found { "Kept by GNOME (Settings → Keyboard → Custom Shortcuts).".into() } else { "The program atlas-capture is not on the PATH, so there is nothing to bind.".into() },
    }
}

fn gnome_set(key: &str) -> Result<(), String> {
    let program = which_capture().ok_or("atlas-capture is not on the PATH")?;
    let at = format!("{GNOME_SCHEMA}.custom-keybinding:{GNOME_PATH}");
    for (k, v) in [("name", "'Atlas Capture'".to_string()), ("command", format!("'{}'", program.display())), ("binding", format!("'{}'", to_gnome(key)))] {
        run("gsettings", &["set", &at, k, &v])?;
    }
    let listed = run("gsettings", &["get", GNOME_SCHEMA, "custom-keybindings"])?;
    if !listed.contains(GNOME_PATH) {
        run("gsettings", &["set", GNOME_SCHEMA, "custom-keybindings", &with_path(&listed, GNOME_PATH)])?;
    }
    Ok(())
}

/// The keybindings list (`@as []` or `['/a/', '/b/']`) with `path` added.
fn with_path(listed: &str, path: &str) -> String {
    let inner = listed.trim().trim_start_matches("@as").trim().trim_start_matches('[').trim_end_matches(']').trim();
    if inner.is_empty() { format!("['{path}']") } else { format!("[{inner}, '{path}']") }
}

fn which_capture() -> Option<std::path::PathBuf> {
    let beside = std::env::current_exe().ok()?.with_file_name("atlas-capture");
    if beside.is_file() {
        return Some(beside);
    }
    std::env::var_os("PATH").and_then(|p| std::env::split_paths(&p).map(|d| d.join("atlas-capture")).find(|f| f.is_file()))
}

/// `Meta+Shift+C` → `<Super><Shift>c`.
fn to_gnome(key: &str) -> String {
    let parts: Vec<&str> = key.split('+').collect();
    let (last, mods) = parts.split_last().unwrap_or((&"", &[]));
    let mods: String = mods.iter().map(|m| format!("<{}>", match *m { "Meta" => "Super", "Ctrl" => "Control", m => m })).collect();
    format!("{mods}{}", last.to_ascii_lowercase())
}

/// `<Super><Shift>c` → `Meta+Shift+C`; None for an empty binding.
fn from_gnome(binding: &str) -> Option<String> {
    let mut out = Vec::new();
    let mut rest = binding;
    while let Some(r) = rest.strip_prefix('<') {
        let (m, after) = r.split_once('>')?;
        out.push(match m { "Super" => "Meta", "Control" | "Primary" => "Ctrl", m => m }.to_string());
        rest = after;
    }
    (!rest.is_empty()).then(|| {
        out.push(rest.to_ascii_uppercase());
        out.join("+")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_kde_key_another_shortcut_uses_is_not_taken() {
        let file = "[services][atlas-capture.desktop]\n_launch=Meta+Shift+C,none,Atlas Capture\n\n[kwin]\nExpose=Ctrl+F9\\tMeta+Shift+X,Ctrl+F9,Toggle Present Windows\nOther=none,Meta+Shift+D,Defaults count\n";
        assert_eq!(kde_taken_by(file, "Meta+Shift+C"), None); // its own entry
        assert_eq!(kde_taken_by(file, "meta+shift+x").as_deref(), Some("kwin"));
        assert_eq!(kde_taken_by(file, "Meta+Shift+D").as_deref(), Some("kwin"));
        assert_eq!(kde_taken_by(file, "Toggle Present Windows"), None); // a name is not a key
    }

    #[test]
    fn keys_cross_between_kde_and_gnome_spellings() {
        assert_eq!(to_gnome("Meta+Shift+C"), "<Super><Shift>c");
        assert_eq!(from_gnome("<Super><Shift>c").as_deref(), Some("Meta+Shift+C"));
        assert_eq!(from_gnome("<Primary><Alt>k").as_deref(), Some("Ctrl+Alt+K"));
        assert_eq!(from_gnome(""), None);
        assert_eq!(with_path("@as []", "/x/"), "['/x/']");
        assert_eq!(with_path("['/a/']", "/x/"), "['/a/', '/x/']");
    }

    #[test]
    fn only_a_modifier_and_a_key_is_accepted() {
        assert!(plausible_key("Meta+Shift+C") && plausible_key("Ctrl+Alt+9"));
        assert!(!plausible_key("C") && !plausible_key("Meta+") && !plausible_key("Hyper+C") && !plausible_key("Meta+Shift+C;rm"));
    }
}
