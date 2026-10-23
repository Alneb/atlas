//! The one workspace walk (tasks, changed files, filename search, watcher): dot-entries and the
//! config ignore list are skipped at any depth, symlinks are not followed.
use crate::config::Config;
use crate::paths::rel_path;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// The vault's own pages that are kept out of its root (the starter kit's Inbox, Next, Projects):
/// the one dot-folder the walks enter, so links, quick open and embeds still find them.
pub const PAGES: &str = ".atlas/pages";

/// Whether a walk should descend into / report `rel` (root itself is always kept).
pub fn keep(cfg: &Config, rel: &str) -> bool {
    let pages = rel == ".atlas" || rel == PAGES || rel.strip_prefix(PAGES).is_some_and(|r| r.starts_with('/') && !r[1..].split('/').any(|s| s.starts_with('.')));
    rel.is_empty() || pages || (!rel.split('/').any(|s| s.starts_with('.')) && !cfg.is_ignored(rel))
}

/// All regular files under `root` that pass [`keep`], as (absolute, relative) pairs.
pub fn files<'a>(root: &'a Path, cfg: &Config) -> impl Iterator<Item = (PathBuf, String)> + 'a {
    let cfg = cfg.clone();
    WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(move |e| rel_path(root, e.path()).is_some_and(|r| keep(&cfg, &r)))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(move |e| {
            let rel = rel_path(root, e.path())?;
            Some((e.into_path(), rel))
        })
}

/// All directories at or under `start` (inside `root`) that pass [`keep`].
pub fn dirs(root: &Path, start: &Path, cfg: &Config) -> Vec<PathBuf> {
    WalkDir::new(start)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| rel_path(root, e.path()).is_some_and(|r| keep(cfg, &r)))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_dir())
        .map(|e| e.into_path())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dot_folders_are_skipped_except_the_vaults_pages() {
        let d = tempfile::tempdir().unwrap();
        for f in ["notes/a.md", ".atlas/pages/Inbox.page", ".atlas/pages/.hidden/x.page", ".atlas/config.toml", ".atlas/cache/layout.json", ".git/HEAD"] {
            std::fs::create_dir_all(d.path().join(f).parent().unwrap()).unwrap();
            std::fs::write(d.path().join(f), "x").unwrap();
        }
        let mut got: Vec<String> = files(d.path(), &Config::default()).map(|(_, rel)| rel).collect();
        got.sort();
        assert_eq!(got, [".atlas/pages/Inbox.page", "notes/a.md"]);
    }
}
