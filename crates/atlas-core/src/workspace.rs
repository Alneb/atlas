//! A workspace is any folder; `.atlas/` inside it is optional.
use crate::api::WorkspaceInfo;
use crate::config::Config;
use crate::{paths, Error, Result};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct Workspace {
    /// Canonical, so `paths::safe_join`'s prefix check is meaningful.
    root: PathBuf,
}

impl Workspace {
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref();
        let root = crate::paths::real(root).map_err(|e| Error::BadPath(format!("{}: {e}", root.display())))?;
        if !root.is_dir() {
            return Err(Error::BadPath(format!("{} is not a directory", root.display())));
        }
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn name(&self) -> String {
        self.root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "/".into())
    }

    /// Re-read on every call: the file is the truth and it is tiny.
    pub fn config(&self) -> Result<Config> {
        Ok(Config::load(&self.root)?)
    }

    pub fn resolve(&self, rel: &str) -> Result<PathBuf> {
        paths::safe_join(&self.root, rel)
    }

    pub fn rel(&self, abs: &Path) -> String {
        paths::rel_path(&self.root, abs).unwrap_or_else(|| abs.to_string_lossy().into_owned())
    }

    pub fn info(&self) -> Result<WorkspaceInfo> {
        Ok(WorkspaceInfo { root: self.root.to_string_lossy().into_owned(), name: self.name(), config: self.config()? })
    }

    pub fn cache_dir(&self) -> PathBuf {
        self.root.join(".atlas/cache")
    }
}

/// Walk up from `start` to the first folder containing `.atlas/`; `None` if there is none.
pub fn find_root(start: &Path) -> Option<PathBuf> {
    start.ancestors().find(|d| d.join(".atlas").is_dir()).map(Path::to_path_buf)
}
