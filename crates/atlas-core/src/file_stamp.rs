//! What tells one version of a file (or a folder's list of entries) from the next without reading it: its size, time
//! and inode. For caches of parsed files that nearly every request asks for (`config.toml`, the plugins' manifests).
use std::path::Path;
use std::time::{Duration, SystemTime};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct FileStamp {
    len: u64,
    modified: SystemTime,
    #[cfg(unix)]
    ino: u64,
}

/// A path as a cache key sees it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Seen {
    Missing,
    Stamped(FileStamp),
    /// Changed in the last 2 s: file times are coarse (a few ms), so a same-size rewrite in place right after could
    /// carry the same stamp (git's "racy" rule). Never kept.
    Fresh,
}

const SETTLE: Duration = Duration::from_secs(2);

pub fn seen(path: &Path) -> Seen {
    let Ok(m) = std::fs::metadata(path) else { return Seen::Missing };
    let Ok(modified) = m.modified() else { return Seen::Fresh };
    if !modified.elapsed().is_ok_and(|age| age >= SETTLE) {
        return Seen::Fresh;
    }
    Seen::Stamped(FileStamp {
        len: m.len(),
        modified,
        #[cfg(unix)]
        ino: std::os::unix::fs::MetadataExt::ino(&m),
    })
}

/// The stamps of `paths`, in order; None when one of them is fresh (nothing may be kept for it yet).
pub fn key<P: AsRef<Path>>(paths: impl IntoIterator<Item = P>) -> Option<Vec<Seen>> {
    paths.into_iter().map(|p| Some(seen(p.as_ref())).filter(|s| *s != Seen::Fresh)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_is_a_key_a_fresh_one_is_not() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("a");
        assert_eq!(key([&f]), Some(vec![Seen::Missing]));
        std::fs::write(&f, "x").unwrap();
        assert_eq!(seen(&f), Seen::Fresh);
        assert_eq!(key([&f]), None);
        let old = SystemTime::now() - Duration::from_secs(10);
        std::fs::File::options().write(true).open(&f).unwrap().set_modified(old).unwrap();
        assert!(matches!(seen(&f), Seen::Stamped(_)));
    }
}
