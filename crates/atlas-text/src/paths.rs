//! Vault-relative paths: every path from outside goes through [`safe_join`], so nothing reaches outside the vault —
//! not via `..`, absolute paths, or symlinks. Shared by the core (paths.rs wraps it) and the plugin engines.
use std::path::{Component, Path, PathBuf};

/// Resolve a client path (`a/b.md`, `""` = root) inside `root` (canonical is fastest: another is canonicalized on a miss).
/// The target need not exist (PUT creates files), but its deepest existing ancestor must
/// canonicalize to somewhere under `root`.
/// The error is the reason, with the path: `"../x": `..` is not allowed`.
pub fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let bad = |why: &str| format!("{rel:?}: {why}");
    if rel.contains('\0') {
        return Err(bad("NUL byte"));
    }
    let mut out = root.to_path_buf();
    for comp in Path::new(rel).components() {
        match comp {
            Component::Normal(c) => out.push(c),
            Component::CurDir => {}
            Component::ParentDir => return Err(bad("`..` is not allowed")),
            Component::RootDir | Component::Prefix(_) => return Err(bad("absolute paths are not allowed")),
        }
    }
    // Symlink escape check on the deepest ancestor that exists.
    let mut probe = out.as_path();
    let root = plain(root);
    loop {
        match probe.canonicalize() {
            Ok(real) => {
                // A root given uncanonical (Windows' short `RUNNER~1` temp names) is canonicalized only on a miss.
                let real = plain(&real);
                if !real.starts_with(&root) && !root.canonicalize().is_ok_and(|r| real.starts_with(plain(&r))) {
                    return Err(bad("resolves outside the workspace"));
                }
                break;
            }
            Err(_) => match probe.parent() {
                Some(p) => probe = p,
                None => return Err(bad("no existing ancestor")),
            },
        }
    }
    Ok(out)
}

/// `p` without Windows' verbatim prefix: `canonicalize` there answers `\\?\C:\…`, which names the same folder as
/// `C:\…` but never `starts_with` it. Elsewhere `p` itself.
pub fn plain(p: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let s = p.as_os_str().to_string_lossy();
        if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    p.to_path_buf()
}

/// Workspace-relative, forward-slash form of an absolute path under `root`.
pub fn rel_path(root: &Path, abs: &Path) -> Option<String> {
    let rel = abs.strip_prefix(root).ok()?;
    let parts: Vec<_> = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
    Some(parts.join("/"))
}


#[cfg(test)]
mod tests {
    use super::*;

    /// A root given in another form than its canonical one (Windows' short `RUNNER~1` temp names; here a symlink to it)
    /// still contains its own files, and `..` or a symlink out of it is still refused.
    #[cfg(unix)]
    #[test]
    fn a_root_not_given_canonical_still_holds_its_files() {
        let d = tempfile::tempdir().unwrap();
        let real = d.path().join("real");
        std::fs::create_dir_all(real.join("notes")).unwrap();
        std::fs::write(real.join("notes/a.md"), "x").unwrap();
        let link = d.path().join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        assert_eq!(safe_join(&link, "notes/a.md").unwrap(), link.join("notes/a.md"));
        assert_eq!(safe_join(&link, "notes/new.md").unwrap(), link.join("notes/new.md"), "a file not there yet");
        assert!(safe_join(&link, "../real/notes/a.md").is_err());
        std::fs::create_dir_all(d.path().join("elsewhere")).unwrap();
        std::fs::write(d.path().join("elsewhere/b.md"), "x").unwrap();
        std::os::unix::fs::symlink(d.path().join("elsewhere"), real.join("out")).unwrap();
        assert!(safe_join(&link, "out/b.md").unwrap_err().contains("outside the workspace"), "a symlink out of it");
    }
}
