//! The user's folders per operating system. `XDG_*` variables win everywhere when set (tests point them at a
//! throwaway folder on every OS); otherwise Linux uses the XDG defaults, macOS `~/Library/…`, Windows the known
//! folders from the environment (`%APPDATA%`, `%LOCALAPPDATA%`).
use std::path::{Path, PathBuf};

/// The kinds of per-user folder Atlas keeps things in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Base {
    /// Settings the user may edit (`vaults.toml`, `server.toml`).
    Config,
    /// Things kept across runs that are not settings (sessions, the device id).
    State,
    /// Installed data (the UI, the welcome vault).
    Data,
    /// Re-creatable downloads (filter lists).
    Cache,
    /// Per-login secrets that must not outlive it or be synced (the local key).
    Runtime,
}

/// The home folder: `$HOME`, else `%USERPROFILE%` (Windows sets only the latter).
pub fn home() -> Option<PathBuf> {
    [std::env::var_os("HOME"), std::env::var_os("USERPROFILE")].into_iter().flatten().find(|h| !h.is_empty()).map(PathBuf::from)
}

/// The OS folder for `base`, without Atlas's own sub-folder.
pub fn base(base: Base) -> PathBuf {
    let var = |name: &str| std::env::var_os(name).filter(|v| !v.is_empty()).map(PathBuf::from);
    let xdg = match base {
        Base::Config => "XDG_CONFIG_HOME",
        Base::State => "XDG_STATE_HOME",
        Base::Data => "XDG_DATA_HOME",
        Base::Cache => "XDG_CACHE_HOME",
        Base::Runtime => "XDG_RUNTIME_DIR",
    };
    if let Some(p) = var(xdg) {
        return p;
    }
    let home = home().unwrap_or_default();
    if cfg!(windows) {
        // roaming for what the user would want on another machine, local for the rest
        let roaming = || var("APPDATA").unwrap_or_else(|| home.join("AppData/Roaming"));
        let local = || var("LOCALAPPDATA").unwrap_or_else(|| home.join("AppData/Local"));
        match base {
            Base::Config | Base::Data => roaming(),
            Base::State | Base::Cache => local(),
            Base::Runtime => std::env::temp_dir(),
        }
    } else if cfg!(target_os = "macos") {
        match base {
            Base::Config | Base::Data | Base::State => home.join("Library/Application Support"),
            Base::Cache => home.join("Library/Caches"),
            Base::Runtime => std::env::temp_dir(),
        }
    } else {
        match base {
            Base::Config => home.join(".config"),
            Base::State => home.join(".local/state"),
            Base::Data => home.join(".local/share"),
            Base::Cache => home.join(".cache"),
            Base::Runtime => std::env::temp_dir(),
        }
    }
}

/// Atlas's folder of `kind`: [`base`]`/atlas`.
pub fn atlas(kind: Base) -> PathBuf {
    base(kind).join("atlas")
}

/// `~/x` → the home folder joined with `x`; anything else unchanged. (`~\x` too on Windows.)
pub fn expand_tilde(p: &str) -> PathBuf {
    let rest = p.strip_prefix("~/").or_else(|| if cfg!(windows) { p.strip_prefix("~\\") } else { None });
    match (rest, home()) {
        (Some(rest), Some(h)) => h.join(rest),
        _ => PathBuf::from(p),
    }
}

/// The reverse of [`expand_tilde`], for showing a path: under home → `~/…`.
pub fn tilde(p: &Path) -> String {
    match home().and_then(|h| p.strip_prefix(h).ok().map(Path::to_path_buf)) {
        Some(rest) => format!("~/{}", rest.display()),
        None => p.display().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tilde_round_trips_under_home() {
        let Some(h) = home() else { return };
        let p = expand_tilde("~/notes/a.md");
        assert_eq!(p, h.join("notes/a.md"));
        assert_eq!(tilde(&p), "~/notes/a.md");
        assert_eq!(expand_tilde("/abs/x"), PathBuf::from("/abs/x"));
        assert_eq!(expand_tilde("rel/x"), PathBuf::from("rel/x"));
    }
}
