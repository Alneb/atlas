//! The UI from disk, so a new interface needs no new program: `packaging/install.sh` copies the
//! built UI to `~/.local/share/atlas/ui` (or `$ATLAS_UI_DIR`), the server serves it from there, and
//! an open window reloads itself when its build changes (`GET /api/ui/build`; ui/src/lib/ui-reload.ts).
//! Only when `$ATLAS_UI_DIR` names it: the desktop app sets it (to the installed folder, when there
//! is one); `atlas serve` and the tests keep the UI built into the program, the one being tested.
use std::path::{Component, Path, PathBuf};

/// The folder `$ATLAS_UI_DIR` names, when it holds an `index.html`.
pub fn dir() -> Option<PathBuf> {
    let d = PathBuf::from(std::env::var_os("ATLAS_UI_DIR")?);
    d.join("index.html").is_file().then_some(d)
}

/// Where `packaging/install.sh` puts the UI: `$XDG_DATA_HOME/atlas/ui` (`~/.local/share/atlas/ui`).
pub fn installed() -> Option<PathBuf> {
    let d = crate::platform::dirs::atlas(crate::platform::dirs::Base::Data).join("ui");
    d.join("index.html").is_file().then_some(d)
}

/// A file of the installed UI: its bytes and content type. Only plain relative paths (no `..`).
pub fn get(dir: &Path, path: &str) -> Option<(Vec<u8>, String)> {
    let rel = Path::new(path);
    if !rel.components().all(|c| matches!(c, Component::Normal(_))) {
        return None;
    }
    let file = dir.join(rel);
    let bytes = std::fs::read(&file).ok()?;
    Some((bytes, mime_guess::from_path(&file).first_or_octet_stream().to_string()))
}

/// What identifies the UI being served: a hash of the installed `index.html` (it names every
/// bundle by its content hash), or "built-in". A window compares it with the one it loaded — by
/// content, not modification time, so reinstalling the same interface (a commit that changed only
/// Rust or docs) does not reload the window.
pub fn build() -> String {
    dir().and_then(|d| std::fs::read(d.join("index.html")).ok()).map_or_else(
        || "built-in".into(),
        |bytes| format!("{:016x}", bytes.iter().fold(0xcbf2_9ce4_8422_2325_u64, |h, b| (h ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3))),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_come_from_the_folder_and_nothing_outside_it() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("index.html"), "<p>new</p>").unwrap();
        std::fs::create_dir_all(d.path().join("assets")).unwrap();
        std::fs::write(d.path().join("assets/a.js"), "x").unwrap();
        assert_eq!(get(d.path(), "assets/a.js").unwrap().1, "text/javascript");
        assert!(get(d.path(), "../etc/passwd").is_none());
        assert!(get(d.path(), "/etc/passwd").is_none());
    }
}
