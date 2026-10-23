//! Reading the finance folder from wherever the vault is: a folder on disk (the CLI, tests) or the core over the
//! helper's pipe (the plugin). Both list paths relative to the vault and read text.
use crate::book::{book, Ledger};
use crate::model::*;
use crate::notes::Notes;
use crate::parse::parse_file;
use std::path::{Path, PathBuf};

pub trait Source {
    /// Every file path under `folder` (relative to the vault, `/`-separated).
    fn files(&self, folder: &str) -> Result<Vec<String>, String>;
    fn read(&self, path: &str) -> Result<String, String>;
}

pub struct Dir(pub PathBuf);

impl Source for Dir {
    fn files(&self, folder: &str) -> Result<Vec<String>, String> {
        fn walk(root: &Path, dir: &Path, out: &mut Vec<String>) {
            let Ok(rd) = std::fs::read_dir(dir) else { return };
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() {
                    walk(root, &p, out);
                } else if let Ok(rel) = p.strip_prefix(root) {
                    out.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
        let mut out = vec![];
        walk(&self.0, &self.0.join(folder), &mut out);
        Ok(out)
    }
    fn read(&self, path: &str) -> Result<String, String> {
        std::fs::read_to_string(self.0.join(path)).map_err(|e| format!("{path}: {e}"))
    }
}

/// A source with one file's text replaced (or added): the books as they would be after a write, checked before it.
pub struct Overlay<'a> {
    pub base: &'a dyn Source,
    pub path: String,
    pub text: String,
}

impl Source for Overlay<'_> {
    fn files(&self, folder: &str) -> Result<Vec<String>, String> {
        let mut out = self.base.files(folder)?;
        if !out.contains(&self.path) && self.path.starts_with(&format!("{}/", folder.trim_end_matches('/'))) {
            out.push(self.path.clone());
        }
        Ok(out)
    }
    fn read(&self, path: &str) -> Result<String, String> {
        if path == self.path { Ok(self.text.clone()) } else { self.base.read(path) }
    }
}

pub struct Loaded {
    pub ledger: Ledger,
    pub notes: Notes,
}

/// Every `*.fin` and finance note under `folder`, sorted by path, parsed and booked. Parse and note findings come
/// first in `ledger.diags`, then booking's.
pub fn load(src: &dyn Source, folder: &str) -> Result<Loaded, String> {
    let mut paths = src.files(folder)?;
    paths.sort();
    let (mut journal, mut notes, mut diags) = (Journal::default(), Notes::default(), vec![]);
    for p in &paths {
        if let Some(name) = p.strip_prefix(&format!("{}/", folder.trim_end_matches('/'))).filter(|n| crate::notes::DATA_FILES.contains(n)) {
            notes.data.insert(name.to_string(), src.read(p)?);
        } else if p.ends_with(".fin") {
            parse_file(p, &src.read(p)?, &mut journal, &mut diags);
        } else if p.ends_with(".md") {
            let text = src.read(p)?;
            notes.add(p, &text, &mut diags);
            notes.rules.add(p, &text, &mut diags);
        }
    }
    let mut ledger = book(journal, &notes);
    diags.append(&mut ledger.diags);
    diags.extend(crate::statement::check_notes(&ledger, &notes));
    ledger.diags = diags;
    Ok(Loaded { ledger, notes })
}

/// The same from texts in memory (a migration checked before anything is written).
pub fn load_texts(files: &[(String, String)]) -> Loaded {
    let (mut journal, mut notes, mut diags) = (Journal::default(), Notes::default(), vec![]);
    let mut sorted: Vec<_> = files.iter().collect();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    for (p, text) in sorted {
        if let Some(name) = p.strip_prefix("finance/").filter(|n| crate::notes::DATA_FILES.contains(n)) {
            notes.data.insert(name.to_string(), text.clone());
        } else if p.ends_with(".fin") {
            parse_file(p, text, &mut journal, &mut diags);
        } else if p.ends_with(".md") {
            notes.add(p, text, &mut diags);
            notes.rules.add(p, text, &mut diags);
        }
    }
    let mut ledger = book(journal, &notes);
    diags.append(&mut ledger.diags);
    diags.extend(crate::statement::check_notes(&ledger, &notes));
    ledger.diags = diags;
    Loaded { ledger, notes }
}
