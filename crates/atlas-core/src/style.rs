//! CSS snippets (docs/guides/MALLEABLE.md, rung 2): `.atlas/snippets/*.css` restyle Atlas live, like
//! Obsidian snippets or Stylish. Every file applies unless `[ui] css_snippets_off` names it.
use crate::api::CssSnippet;
use std::path::Path;

pub const SNIPPETS_DIR: &str = ".atlas/snippets";

/// The workspace's snippets, by name (file stem), sorted; unreadable files are skipped.
pub fn css_snippets(root: &Path) -> Vec<CssSnippet> {
    let Ok(dir) = std::fs::read_dir(root.join(SNIPPETS_DIR)) else { return Vec::new() };
    let mut out: Vec<CssSnippet> = dir
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if p.extension()? != "css" {
                return None;
            }
            let name = p.file_stem()?.to_string_lossy().into_owned();
            Some(CssSnippet { path: format!("{SNIPPETS_DIR}/{name}.css"), css: std::fs::read_to_string(&p).ok()?, name })
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

#[cfg(test)]
mod tests {
    #[test]
    fn lists_css_files_only_sorted() {
        let d = tempfile::tempdir().unwrap();
        let s = d.path().join(super::SNIPPETS_DIR);
        std::fs::create_dir_all(&s).unwrap();
        std::fs::write(s.join("b.css"), "b{}").unwrap();
        std::fs::write(s.join("a.css"), "a{}").unwrap();
        std::fs::write(s.join("notes.txt"), "x").unwrap();
        let got = super::css_snippets(d.path());
        assert_eq!(got.iter().map(|x| (x.name.as_str(), x.css.as_str())).collect::<Vec<_>>(), [("a", "a{}"), ("b", "b{}")]);
        assert_eq!(got[0].path, ".atlas/snippets/a.css");
        assert!(super::css_snippets(&d.path().join("nope")).is_empty());
    }
}
