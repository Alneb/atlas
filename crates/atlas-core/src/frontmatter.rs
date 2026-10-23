//! Editing one frontmatter property in place: the pure edits live in `atlas-text` (shared with the plugin engines);
//! here, what the properties panel may send (`POST /api/frontmatter/edit`).
use crate::api::FrontmatterEdit;
use crate::{Error, Result};
pub use atlas_text::frontmatter::*;

/// A key the panel may write: one plain line, no `:`, not starting like a list item or a comment.
fn plain_key(key: &str) -> Result<&str> {
    let k = key.trim();
    if k.is_empty() || k.contains([':', '\n', '\r']) || k.starts_with(['-', '#', '"', '\'']) {
        return Err(Error::BadRequest(format!("`{key}` is not a property name")));
    }
    Ok(k)
}

/// One properties-panel edit applied to the note's text (`POST /api/frontmatter/edit`).
pub fn apply(text: &str, edit: &FrontmatterEdit) -> Result<String> {
    match edit {
        FrontmatterEdit::Set { key, value } => {
            let v = serde_yaml::to_value(value).map_err(|e| Error::BadRequest(e.to_string()))?;
            Ok(set_property(text, plain_key(key)?, &v))
        }
        FrontmatterEdit::Remove { key } => Ok(remove_property(text, key.trim())),
        FrontmatterEdit::Rename { from, to } => {
            let to = plain_key(to)?;
            if from.trim() != to && has_property(text, to) {
                return Err(Error::BadRequest(format!("the note already has a property `{to}`")));
            }
            Ok(rename_property(text, from.trim(), to))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_yaml::Value;

    const NOTE: &str = "---\n# kept comment\ntype: Lecture\ntopics:\n  - \"[[Physics]]\"\n  - \"[[Optics]]\"\ndate: 2025-09-18\n---\n# Body\n";

    #[test]
    fn replaces_one_key_and_keeps_everything_else() {
        let out = set_property(NOTE, "type", &parse_cell("Seminar", false));
        assert_eq!(out, NOTE.replace("type: Lecture", "type: Seminar"));
        let out = set_property(NOTE, "topics", &parse_cell("[[Physics]], [[Quantum Optics]]", true));
        assert!(out.contains("topics:\n  - '[[Physics]]'\n  - '[[Quantum Optics]]'\ndate: 2025-09-18\n"), "{out}");
        assert!(out.starts_with("---\n# kept comment\ntype: Lecture\n") && out.ends_with("---\n# Body\n"));
    }

    #[test]
    fn adds_missing_keys_and_frontmatter() {
        let out = set_property(NOTE, "rating", &parse_cell("4", false));
        assert!(out.contains("date: 2025-09-18\nrating: 4\n---\n"), "{out}");
        assert_eq!(set_property("# Plain\n", "done", &parse_cell("true", false)), "---\ndone: true\n---\n# Plain\n");
        assert_eq!(set_property(NOTE, "type", &parse_cell("", false)), NOTE.replace("type: Lecture", "type:"));
    }

    #[test]
    fn values_keep_their_type() {
        assert_eq!(parse_cell("12", false), Value::Number(12.into()));
        assert_eq!(parse_cell("false", false), Value::Bool(false));
        assert_eq!(parse_cell("[[Note]]", false), Value::String("[[Note]]".into()));
        assert_eq!(parse_cell("yes", false), Value::String("yes".into()), "YAML 1.2, like Obsidian: not a boolean");
    }

    #[test]
    fn removes_and_renames_keeping_the_rest() {
        let out = remove_property(NOTE, "topics");
        assert_eq!(out, "---\n# kept comment\ntype: Lecture\ndate: 2025-09-18\n---\n# Body\n");
        assert_eq!(remove_property("---\nonly: 1\n---\n# B\n", "only"), "# B\n", "the last one takes the fences");
        assert_eq!(remove_property(NOTE, "missing"), NOTE);
        let out = rename_property(NOTE, "topics", "subjects");
        assert_eq!(out, NOTE.replace("topics:", "subjects:"));
    }

    #[test]
    fn panel_edits_validate_and_type_values() {
        let set = |k: &str, v: serde_json::Value| apply(NOTE, &FrontmatterEdit::Set { key: k.into(), value: v });
        assert!(set("rating", serde_json::json!(4)).unwrap().contains("rating: 4\n---"));
        assert!(set("day", serde_json::json!("2026-10-14")).unwrap().contains("day: 2026-10-14\n"), "a date stays unquoted");
        let links = set("up", serde_json::json!(["[[A]]", "[[B c]]"])).unwrap();
        assert!(links.contains("up:\n  - '[[A]]'\n  - '[[B c]]'\n"), "{links}");
        assert!(set("done", serde_json::json!(true)).unwrap().contains("done: true\n"));
        assert!(set("empty", serde_json::Value::Null).unwrap().contains("empty:\n---"));
        assert!(set("bad: key", serde_json::json!(1)).is_err());
        let clash = apply(NOTE, &FrontmatterEdit::Rename { from: "type".into(), to: "date".into() });
        assert!(clash.is_err(), "renaming onto an existing key would lose a value");
        assert!(has_property(NOTE, "date") && !has_property(NOTE, "kept comment"));
    }
}
