//! Workspace-relative path handling. Every path from the wire goes through [`safe_join`], so no
//! request can reach outside the workspace — not via `..`, absolute paths, or symlinks.
use crate::{Error, Result};
use std::path::{Path, PathBuf};

/// Resolve a client path (`a/b.md`, `""` = root) inside `root` (which must be canonical): atlas-text's guard.
pub fn safe_join(root: &Path, rel: &str) -> Result<PathBuf> {
    atlas_text::paths::safe_join(root, rel).map_err(Error::BadPath)
}

pub use atlas_text::paths::rel_path;

#[cfg(test)]
mod tests {
    use super::*;

    fn ws() -> (tempfile::TempDir, PathBuf) {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().canonicalize().unwrap();
        std::fs::create_dir_all(root.join("notes")).unwrap();
        std::fs::write(root.join("notes/a.md"), "x").unwrap();
        (d, root)
    }

    #[test]
    fn joins_plain_and_new_paths() {
        let (_d, root) = ws();
        assert_eq!(safe_join(&root, "notes/a.md").unwrap(), root.join("notes/a.md"));
        assert_eq!(safe_join(&root, "./notes/new/deep.md").unwrap(), root.join("notes/new/deep.md"));
        assert_eq!(safe_join(&root, "").unwrap(), root);
    }

    #[test]
    fn rejects_parent_and_absolute() {
        let (_d, root) = ws();
        assert!(matches!(safe_join(&root, "../etc/passwd"), Err(Error::BadPath(_))));
        assert!(matches!(safe_join(&root, "notes/../../x"), Err(Error::BadPath(_))));
        assert!(matches!(safe_join(&root, "notes/.."), Err(Error::BadPath(_))));
        assert!(matches!(safe_join(&root, "/etc/passwd"), Err(Error::BadPath(_))));
        assert!(matches!(safe_join(&root, "a\0b"), Err(Error::BadPath(_))));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape_but_allows_internal_links() {
        let (_d, root) = ws();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret"), "s").unwrap();
        std::os::unix::fs::symlink(outside.path(), root.join("escape")).unwrap();
        std::os::unix::fs::symlink(root.join("notes"), root.join("inner")).unwrap();
        assert!(matches!(safe_join(&root, "escape/secret"), Err(Error::BadPath(_))));
        assert!(matches!(safe_join(&root, "escape/new-file"), Err(Error::BadPath(_))));
        assert!(safe_join(&root, "inner/a.md").is_ok());
    }

    #[test]
    fn rel_path_uses_forward_slashes() {
        let (_d, root) = ws();
        assert_eq!(rel_path(&root, &root.join("notes").join("a.md")).as_deref(), Some("notes/a.md"));
        assert_eq!(rel_path(&root, Path::new("/elsewhere")), None);
    }
}

/// ASCII slug: common Latin accents folded, everything else non-alphanumeric → `-`.
pub fn slugify(course: &str) -> String {
    let mut out = String::new();
    for c in course.trim().chars().flat_map(char::to_lowercase) {
        let c = fold_accent(c);
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    out.trim_end_matches('-').to_string()
}

fn fold_accent(c: char) -> char {
    match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => 'a',
        'è' | 'é' | 'ê' | 'ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' => 'i',
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' => 'o',
        'ù' | 'ú' | 'û' | 'ü' => 'u',
        'ç' => 'c',
        'ñ' => 'n',
        'ý' | 'ÿ' => 'y',
        c => c,
    }
}

#[cfg(test)]
mod slug_tests {
    #[test]
    fn slugs_fold_accents_and_collapse_separators() {
        assert_eq!(super::slugify("  Física Cuántica — II "), "fisica-cuantica-ii");
        assert_eq!(super::slugify("Many-body physics"), "many-body-physics");
        assert_eq!(super::slugify("¿?"), "");
    }
}
