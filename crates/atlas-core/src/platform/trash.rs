//! The desktop's own Trash, where a deleted file stays recoverable from the file manager: on Linux `gio trash` (the
//! freedesktop Trash every desktop shows), on macOS the Finder's Trash and on Windows the Recycle Bin (the `trash`
//! crate's native calls). A phone has none: the caller then uses the vault's `.atlas/trash/` (files.rs `trash`).
use std::path::Path;

/// Moves `p` to the system Trash; an error when there is none or it refused (the caller falls back).
pub fn to_system(p: &Path) -> Result<(), String> {
    #[cfg(all(target_os = "linux", not(target_os = "android")))]
    {
        match std::process::Command::new("gio").arg("trash").arg(p).output() {
            Ok(o) if o.status.success() => Ok(()),
            Ok(o) => Err(format!("gio trash: {}", String::from_utf8_lossy(&o.stderr).trim())),
            Err(e) => Err(format!("gio trash: {e}")),
        }
    }
    #[cfg(any(target_os = "macos", windows))]
    {
        trash::delete(p).map_err(|e| e.to_string())
    }
    #[cfg(not(any(all(target_os = "linux", not(target_os = "android")), target_os = "macos", windows)))]
    {
        let _ = p;
        Err("no system Trash here".into())
    }
}
