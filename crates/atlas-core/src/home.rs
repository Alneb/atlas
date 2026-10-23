//! The home document (docs/design/MALLEABLE.md, "everything is a file"): the first screen is a file the user
//! reshapes — by default `Home.page`, the Today dashboard as a layout (page.rs); a `.md` works too. Atlas writes it once, from the
//! template below, when it does not exist; after that it is the user's note and never rewritten.
use crate::{Result, Workspace};

/// A markdown home (`home = "Home.md"`): the same blocks, as view blocks in a note.
pub const MD_TEMPLATE: &str = r#"Your home page: a note like any other. Write in it, reorder or delete the blocks, add your own.

```view
type: greeting
```

```view
type: capture
```

```view
type: focus
```

```view
type: tasks
```
"#;

/// The home document's path, created from [`TEMPLATE`] if missing; None when `home` is off.
pub fn ensure(ws: &Workspace) -> Result<Option<String>> {
    let home = ws.config()?.home;
    if home.trim().is_empty() {
        return Ok(None);
    }
    let path = ws.resolve(&home)?;
    if !path.exists() {
        // a `.page` (the default): the Today dashboard as a layout file; a `.md`: blocks in a note
        let t = if home.ends_with(".page") { crate::page::HOME_TEMPLATE } else { MD_TEMPLATE };
        crate::vault_write::write(&path, t.as_bytes())?;
    }
    Ok(Some(home))
}

#[cfg(test)]
mod tests {
    #[test]
    fn written_once_then_left_alone() {
        let d = tempfile::tempdir().unwrap();
        let ws = crate::Workspace::open(d.path()).unwrap();
        assert_eq!(super::ensure(&ws).unwrap().as_deref(), Some("Home.page"));
        assert!(std::fs::read_to_string(d.path().join("Home.page")).unwrap().contains("title: Today"));
        std::fs::write(d.path().join("Home.page"), "mine").unwrap();
        super::ensure(&ws).unwrap();
        assert_eq!(std::fs::read_to_string(d.path().join("Home.page")).unwrap(), "mine", "never rewritten");
        std::fs::create_dir_all(d.path().join(".atlas")).unwrap();
        std::fs::write(d.path().join(".atlas/config.toml"), "home = \"\"\n").unwrap();
        assert_eq!(super::ensure(&ws).unwrap(), None);
    }
}
