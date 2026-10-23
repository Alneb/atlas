//! `.atlas/keys.toml`: the user's keyboard shortcuts, `"<command id>" = "Ctrl+Alt+X"` (`""` unbinds).
//! Applies to built-in UI actions, server built-ins and workspace scripts alike; edited from the
//! Commands pane or by hand. Saving keeps the file's comments and order (toml_edit).
use crate::api::Keymap;
use crate::{Error, Result};
use std::path::Path;

pub const KEYS_FILE: &str = ".atlas/keys.toml";

pub fn load(root: &Path) -> Result<Keymap> {
    let Ok(text) = std::fs::read_to_string(root.join(KEYS_FILE)) else { return Ok(Keymap::default()) };
    let table: toml::Table = toml::from_str(&text).map_err(|e| Error::BadRequest(format!("{KEYS_FILE}: {e}")))?;
    let keys = table.into_iter().filter_map(|(k, v)| Some((k, v.as_str()?.to_string()))).collect();
    Ok(Keymap { keys })
}

/// Sets (or with `None`, removes → back to the default) one binding.
pub fn set(root: &Path, id: &str, keys: Option<&str>) -> Result<Keymap> {
    if id.is_empty() || id.len() > 120 {
        return Err(Error::BadRequest("bad command id".into()));
    }
    let path = root.join(KEYS_FILE);
    let existing = std::fs::read_to_string(&path).ok();
    let mut doc: toml_edit::DocumentMut =
        existing.as_deref().unwrap_or("").parse().map_err(|e| Error::BadRequest(format!("{KEYS_FILE}: {e}")))?;
    match keys {
        Some(k) => doc[id] = toml_edit::value(k.trim()),
        None => {
            doc.remove(id);
        }
    }
    // a fresh file starts with a header (a lone comment in an empty document would drift to the end)
    let header = if existing.is_none() {
        "# Keyboard shortcuts: command id = chord (\"\" unbinds). Edited by Atlas's Commands pane.\n"
    } else {
        ""
    };
    crate::vault_write::write(&path, format!("{header}{doc}").as_bytes())?;
    load(root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_reset_and_keep_comments() {
        let d = tempfile::tempdir().unwrap();
        assert!(load(d.path()).unwrap().keys.is_empty());
        set(d.path(), "ui.git", Some("Ctrl+Alt+G")).unwrap();
        let m = set(d.path(), "refs.bib", Some("")).unwrap();
        assert_eq!(m.keys.get("ui.git").map(String::as_str), Some("Ctrl+Alt+G"));
        assert_eq!(m.keys.get("refs.bib").map(String::as_str), Some(""), "explicit unbind is kept");
        let text = std::fs::read_to_string(d.path().join(KEYS_FILE)).unwrap();
        assert!(text.starts_with("# Keyboard shortcuts"));
        let m = set(d.path(), "ui.git", None).unwrap();
        assert!(!m.keys.contains_key("ui.git"));
    }
}
