//! Vault-relative paths: every path from outside goes through [`safe_join`], so nothing reaches outside the vault —
//! not via `..`, absolute paths, or symlinks. Shared by the core (paths.rs wraps it) and the plugin engines.
use std::path::{Component, Path, PathBuf};

/// Resolve a client path (`a/b.md`, `""` = root) inside `root` (which must be canonical).
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
                if !plain(&real).starts_with(&root) {
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

