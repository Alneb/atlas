//! A link to a folder (a guest folder's `.atlas`, guest.rs), made and read alike on every system. On Windows a
//! symlink needs developer mode or an administrator; a **junction** (a folder-only link of NTFS) needs neither, so it
//! is made when the symlink is refused. Both read back with `read_link` and are `is_symlink()` to Rust's std (a junction
//! is a name-surrogate reparse point), and both go with `remove_dir` (vault_write.rs `remove_link`).
use std::path::{Path, PathBuf};

/// `link` made a link to the folder `target` (absolute: a junction holds a full path).
pub fn folder(target: &Path, link: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, link)
    }
    #[cfg(windows)]
    {
        match std::os::windows::fs::symlink_dir(target, link) {
            // ERROR_PRIVILEGE_NOT_HELD (1314): no developer mode, not an administrator
            Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied || e.raw_os_error() == Some(1314) => junction(target, link)
                .map_err(|j| std::io::Error::new(j.kind(), format!("a symlink was refused ({e}), and a junction too ({j})"))),
            r => r,
        }
    }
}

/// A junction through `mklink /J` (cmd's own: no crate, no Windows API calls of our own), its window hidden.
#[cfg(windows)]
pub fn junction(target: &Path, link: &Path) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new("cmd")
        .arg("/C")
        .arg("mklink")
        .arg("/J")
        .arg(link)
        .arg(plain(target))
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()?;
    if out.status.success() && link.symlink_metadata().is_ok() {
        return Ok(());
    }
    let said = String::from_utf8_lossy(&out.stderr).trim().to_string();
    Err(std::io::Error::other(if said.is_empty() { format!("mklink /J ended with {}", out.status) } else { said }))
}

/// Whether `link` is a link (symlink or junction) to `target`: the two compared without Windows' verbatim prefix
/// (`\\?\C:\…`, which a junction reads back with and a path built here has not).
pub fn points_at(link: &Path, target: &Path) -> bool {
    std::fs::read_link(link).is_ok_and(|t| plain(&t) == plain(target))
}

/// `\\?\C:\x` → `C:\x`; any other path as it is.
fn plain(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with("UNC\\") => PathBuf::from(rest),
        _ => p.to_path_buf(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_folder_link_reads_back_as_pointing_at_its_target() {
        let d = tempfile::tempdir().unwrap();
        let (target, link) = (d.path().join("state"), d.path().join("guest/.atlas"));
        std::fs::create_dir_all(&target).unwrap();
        std::fs::create_dir_all(link.parent().unwrap()).unwrap();
        folder(&target, &link).unwrap();
        assert!(link.symlink_metadata().unwrap().file_type().is_symlink());
        assert!(points_at(&link, &target));
        assert!(!points_at(&link, &d.path().join("other")));
        std::fs::write(target.join("a"), "x").unwrap();
        assert_eq!(std::fs::read_to_string(link.join("a")).unwrap(), "x", "reached through the link");
    }

    #[test]
    fn the_verbatim_prefix_is_not_a_difference() {
        assert_eq!(plain(Path::new(r"\\?\C:\Users\u\x")), PathBuf::from(r"C:\Users\u\x"));
        assert_eq!(plain(Path::new(r"\\?\UNC\host\share")), PathBuf::from(r"\\?\UNC\host\share"));
        assert_eq!(plain(Path::new("/home/u/x")), PathBuf::from("/home/u/x"));
    }

    /// The fallback itself, on the Windows runner (which may have developer mode on, so the symlink path alone would
    /// never try it): a junction made, read as a link to its target, and removed by `remove_dir` leaving the target.
    #[cfg(windows)]
    #[test]
    fn a_junction_is_a_link_to_its_folder() {
        let d = tempfile::tempdir().unwrap();
        let (target, link) = (d.path().join("state"), d.path().join("j"));
        std::fs::create_dir_all(&target).unwrap();
        std::fs::write(target.join("a"), "x").unwrap();
        junction(&target, &link).unwrap();
        assert!(link.symlink_metadata().unwrap().file_type().is_symlink(), "a junction is a link to std");
        assert!(points_at(&link, &target), "{:?} vs {:?}", std::fs::read_link(&link), target);
        assert_eq!(std::fs::read_to_string(link.join("a")).unwrap(), "x");
        std::fs::remove_dir(&link).unwrap();
        assert!(target.join("a").exists(), "only the link went");
    }
}
