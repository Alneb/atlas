//! LaTeX Suite snippets: serve the user's snippet sources (parsed in the UI, which owns the JS
//! format) and discover them from Obsidian vaults for the Settings dropdowns.
use crate::api::{Snippets, Suggestion};
use crate::{Error, Result};
use std::path::{Path, PathBuf};

/// `~/…` is under home; a relative path is inside the vault (so a vault can carry its own snippets).
fn expand(root: &Path, p: &str) -> PathBuf {
    root.join(crate::platform::dirs::expand_tilde(p)) // an absolute path (home's too) stays itself
}

use crate::platform::dirs::tilde;

/// A file, every file of a folder (the plugin's "snippets folder" mode), or a plugin `data.json`
/// (its inline `snippets` string).
fn sources(path: &Path) -> Result<Vec<String>> {
    if path.is_dir() {
        let mut files: Vec<PathBuf> =
            std::fs::read_dir(path)?.flatten().map(|e| e.path()).filter(|p| p.is_file()).collect();
        files.sort();
        return Ok(files.iter().filter_map(|f| std::fs::read_to_string(f).ok()).collect());
    }
    let text = std::fs::read_to_string(path).map_err(|e| Error::NotFound(format!("{}: {e}", path.display())))?;
    if path.file_name().is_some_and(|n| n == "data.json") {
        let v: serde_json::Value = serde_json::from_str(&text).map_err(|e| Error::BadRequest(e.to_string()))?;
        return Ok(v["snippets"].as_str().map(|s| vec![s.to_string()]).unwrap_or_default());
    }
    Ok(vec![text])
}

pub fn load(root: &Path, file: &str, variables: &str) -> Result<Snippets> {
    if file.trim().is_empty() {
        return Ok(Snippets { sources: Vec::new(), variables: String::new() });
    }
    let vars = if variables.trim().is_empty() {
        String::new()
    } else {
        std::fs::read_to_string(expand(root, variables.trim())).unwrap_or_default()
    };
    Ok(Snippets { sources: sources(&expand(root, file.trim()))?, variables: vars })
}

/// LaTeX Suite configs in Obsidian vaults under home (`<vault>/.obsidian/plugins/obsidian-latex-suite/data.json`),
/// resolved to (snippet files, variable files) the way the plugin resolves them.
pub fn discover() -> (Vec<Suggestion>, Vec<Suggestion>) {
    let Some(home) = crate::platform::dirs::home() else { return (Vec::new(), Vec::new()) };
    let mut files = vec![Suggestion { value: String::new(), label: "None".into() }];
    let mut vars = vec![Suggestion { value: String::new(), label: "None".into() }];
    let skip = ["node_modules", "target", "runs", "lib", "archive", ".git", ".cache", ".local", ".cargo", ".rustup"];
    for e in walkdir::WalkDir::new(&home)
        .max_depth(5)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !skip.contains(&e.file_name().to_string_lossy().as_ref()))
        .flatten()
        .take(300_000)
    {
        let p = e.path();
        if !(p.ends_with("plugins/obsidian-latex-suite/data.json")) {
            continue;
        }
        let Some(vault) = p.ancestors().nth(4) else { continue };
        let Ok(v) =
            std::fs::read_to_string(p).map(|t| serde_json::from_str::<serde_json::Value>(&t).unwrap_or_default())
        else {
            continue;
        };
        let name = vault.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if v["loadSnippetsFromFile"].as_bool() == Some(true) {
            if let Some(loc) = v["snippetsFileLocation"].as_str() {
                files.push(Suggestion {
                    value: tilde(&vault.join(loc)),
                    label: format!("{} — vault {name}", tilde(&vault.join(loc))),
                });
            }
        }
        files.push(Suggestion { value: tilde(p), label: format!("inline snippets in vault {name}'s plugin settings") });
        if let Some(loc) = v["snippetVariablesFileLocation"]
            .as_str()
            .filter(|_| v["loadSnippetVariablesFromFile"].as_bool() == Some(true))
        {
            vars.push(Suggestion {
                value: tilde(&vault.join(loc)),
                label: format!("{} — vault {name}", tilde(&vault.join(loc))),
            });
        }
    }
    (files, vars)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_file_folder_and_plugin_data_json() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("s.js"), "[{trigger:'mk', replacement:'$$0$', options:'tA'}]").unwrap();
        std::fs::create_dir(d.path().join("dir")).unwrap();
        std::fs::write(d.path().join("dir/a.js"), "[1]").unwrap();
        std::fs::write(d.path().join("dir/b.js"), "[2]").unwrap();
        std::fs::write(d.path().join("data.json"), r#"{"snippets":"[{trigger:'x'}]"}"#).unwrap();
        // relative to the vault, and absolute
        let (root, abs) = (d.path(), d.path().join("s.js").to_string_lossy().into_owned());
        assert_eq!(load(root, "s.js", "").unwrap().sources.len(), 1);
        assert_eq!(load(Path::new("/elsewhere"), &abs, "").unwrap().sources.len(), 1);
        assert_eq!(load(root, "dir", "").unwrap().sources, vec!["[1]", "[2]"]);
        assert_eq!(load(root, "data.json", "").unwrap().sources, vec!["[{trigger:'x'}]"]);
        assert!(load(root, "", "").unwrap().sources.is_empty());
    }
}
