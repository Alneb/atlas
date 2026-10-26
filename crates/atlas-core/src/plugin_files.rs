//! A plugin's own files by URL — `GET /plugin-files/<rev>/<vault path>` (PLUGIN-API.md "A plugin's own files"): its
//! modules, fonts, pictures and workers, loaded by `import()`, `@font-face`, `<img>`, `new Worker`, none of which can
//! send `x-atlas`, so the route is outside `/api` (as `/media/` is); the sign-in still applies (server.rs `guard`).
//! Only `.atlas/init.js` and files inside `.atlas/plugins/<id>/`: no dot segment below the plugin's folder (`..`,
//! `.git`, `.source`), no symlink out of it. `<rev>` is the page's, so a changed module is a new URL (ES modules are
//! cached by URL for the page's life); it is not read here.
use crate::error::{Error, Result};
use crate::plugins::{valid_id, PLUGINS_DIR};
use std::path::{Path, PathBuf};

/// The one file outside a plugin's folder served here: the vault's startup script (MALLEABLE.md rung 8).
const INIT: &str = ".atlas/init.js";

/// A file found for the route, with what its response needs.
#[derive(Debug)]
pub struct Found {
    pub path: PathBuf,
    pub mime: &'static str,
    pub len: u64,
    /// `"<mtime ns>-<len>"`: the answer to `If-None-Match`, so an unchanged file costs a 304.
    pub etag: String,
}

/// Whether `rev` is a page's revision: a short run of digits and lowercase letters.
pub fn valid_rev(rev: &str) -> bool {
    (1..=16).contains(&rev.len()) && rev.bytes().all(|b| b.is_ascii_digit() || b.is_ascii_lowercase())
}

/// `rel` (a vault path) → the file, if it is a plugin's own (or `.atlas/init.js`); else why not.
pub fn locate(root: &Path, rel: &str) -> Result<Found> {
    let bad = |why: &str| Error::BadPath(format!("{rel:?}: {why}"));
    let (base, rest) = if rel == INIT {
        (root.join(".atlas"), "init.js")
    } else {
        let inside = rel.strip_prefix(PLUGINS_DIR).and_then(|r| r.strip_prefix('/')).ok_or_else(|| bad("not a plugin's file"))?;
        let (id, rest) = inside.split_once('/').ok_or_else(|| bad("not a file of a plugin's folder"))?;
        if !valid_id(id) {
            return Err(bad("not a plugin id"));
        }
        if rest.split('/').any(|s| s.is_empty() || s.starts_with('.')) {
            return Err(bad("an empty or dot segment"));
        }
        (root.join(PLUGINS_DIR).join(id), rest)
    };
    // the folder itself may be a link (a plugin checked out elsewhere); nothing inside may lead out of it
    let base = crate::paths::real(&base).map_err(|_| Error::NotFound(rel.into()))?;
    let path = crate::paths::safe_join(&base, rest)?;
    let meta = std::fs::metadata(&path).map_err(|_| Error::NotFound(rel.into()))?;
    if !meta.is_file() {
        return Err(Error::NotFound(rel.into()));
    }
    let mtime = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_nanos());
    Ok(Found { mime: mime_of(&path), len: meta.len(), etag: format!("\"{mtime:x}-{:x}\"", meta.len()), path })
}

/// The type a browser needs to use the file: a module must be JavaScript, a font a font, or it is refused.
fn mime_of(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json" | "map") => "application/json",
        Some("wasm") => "application/wasm",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        Some("svg") => "image/svg+xml",
        Some("html" | "htm") => "text/plain; charset=utf-8", // never a page of this origin (it would run with the app's rights)
        _ => mime_guess::from_path(path).first_raw().unwrap_or("application/octet-stream"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> tempfile::TempDir {
        let t = tempfile::tempdir().unwrap();
        let p = t.path().join(PLUGINS_DIR).join("books");
        std::fs::create_dir_all(p.join("fonts")).unwrap();
        std::fs::write(p.join("view.js"), "export default 1;").unwrap();
        std::fs::write(p.join("fonts/a.woff2"), [0u8; 4]).unwrap();
        std::fs::write(p.join("cover.png"), [0x89, b'P', b'N', b'G']).unwrap();
        std::fs::write(p.join("page.html"), "<script>").unwrap();
        std::fs::write(p.join(".source"), "git").unwrap();
        std::fs::write(t.path().join(".atlas/init.js"), "").unwrap();
        std::fs::write(t.path().join("secret.md"), "mine").unwrap();
        t
    }

    #[test]
    fn a_plugins_files_with_their_types() {
        let t = vault();
        let mime = |rel: &str| locate(t.path(), rel).map(|f| f.mime).unwrap_or_else(|e| panic!("{rel}: {e}"));
        assert_eq!(mime(".atlas/plugins/books/view.js"), "text/javascript; charset=utf-8");
        assert_eq!(mime(".atlas/plugins/books/fonts/a.woff2"), "font/woff2");
        assert_eq!(mime(".atlas/plugins/books/cover.png"), "image/png");
        assert_eq!(mime(".atlas/plugins/books/page.html"), "text/plain; charset=utf-8", "never served as a page");
        assert_eq!(mime(".atlas/init.js"), "text/javascript; charset=utf-8");
        let f = locate(t.path(), ".atlas/plugins/books/view.js").unwrap();
        assert_eq!(f.len, 17);
        assert!(f.etag.starts_with('"') && f.etag.ends_with("-11\""), "{}", f.etag);
    }

    #[test]
    fn nothing_outside_a_plugins_folder() {
        let t = vault();
        for rel in [
            "secret.md",
            ".atlas/config.toml",
            ".atlas/plugins/books/../../../secret.md",
            ".atlas/plugins/books/fonts/../view.js",
            ".atlas/plugins/books/.source",
            ".atlas/plugins/../secret.md",
            ".atlas/plugins/books",
            ".atlas/plugins/books/",
            ".atlas/plugins/bo oks/view.js",
            ".atlas/plugins//view.js",
        ] {
            assert!(matches!(locate(t.path(), rel), Err(Error::BadPath(_))), "{rel} must be refused");
        }
        assert!(matches!(locate(t.path(), ".atlas/plugins/books/none.js"), Err(Error::NotFound(_))));
        assert!(matches!(locate(t.path(), ".atlas/plugins/books/fonts"), Err(Error::NotFound(_))), "a folder is no file");
    }

    #[cfg(unix)]
    #[test]
    fn a_link_may_not_lead_out_but_the_folder_may_be_one() {
        let t = vault();
        let books = t.path().join(PLUGINS_DIR).join("books");
        std::os::unix::fs::symlink(t.path().join("secret.md"), books.join("out.js")).unwrap();
        assert!(matches!(locate(t.path(), ".atlas/plugins/books/out.js"), Err(Error::BadPath(_))));
        let elsewhere = tempfile::tempdir().unwrap();
        std::fs::write(elsewhere.path().join("zip.js"), "export {};").unwrap();
        std::os::unix::fs::symlink(elsewhere.path(), t.path().join(PLUGINS_DIR).join("zip")).unwrap();
        assert!(locate(t.path(), ".atlas/plugins/zip/zip.js").is_ok(), "a plugin checked out elsewhere");
    }

    #[test]
    fn revisions() {
        assert!(valid_rev("0") && valid_rev("k3x9"));
        assert!(!valid_rev("") && !valid_rev("..") && !valid_rev("A") && !valid_rev("12345678901234567"));
    }
}
