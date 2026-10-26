//! A template applied to a note that already exists (docs/design/DESIGN-templates-automation.md, "a property is
//! set"): when a save makes one of the note's properties a value some template's rule names (`apply_when:
//! { property: { type: lecture } }`), and it was not so before, that template is merged in (atlas-text `merge`:
//! only what the note lacks is added).
//!
//! Who writes the result: an editor that holds the note applies it itself, as one change of its own (undo, the
//! autosave); for any other writer (a plugin, an agent, the phone's native screens) the core writes it.
use crate::config::Config;
use crate::template_rules::{choose, Chosen, Moment};
use chrono::NaiveDateTime;
use std::path::Path;

/// A template merged in: which one, what it added, and the note's text after it.
#[derive(Debug, Clone)]
pub struct Applied {
    pub template: String,
    pub added: Vec<String>,
    pub text: String,
    /// `at_cursor`: the template's body, filled in, for the caller to put where it wants
    pub body: Option<String>,
}

/// The note's properties as text values: a list's items each, `[[links]]` as written.
fn values(text: &str) -> Vec<(String, String)> {
    let m = atlas_text::frontmatter::mapping(text);
    let scalar = |v: &serde_yaml::Value| match v {
        serde_yaml::Value::String(s) => Some(s.clone()),
        serde_yaml::Value::Number(n) => Some(n.to_string()),
        serde_yaml::Value::Bool(b) => Some(b.to_string()),
        _ => None,
    };
    let mut out = vec![];
    for (k, v) in m {
        let Some(k) = k.as_str() else { continue };
        match v {
            serde_yaml::Value::Sequence(items) => out.extend(items.iter().filter_map(scalar).map(|s| (k.to_string(), s))),
            v => out.extend(scalar(&v).map(|s| (k.to_string(), s))),
        }
    }
    out
}

/// After `rel` was saved from `before` to `after`: the template a property just set brings, merged into `after`.
/// None when no property became a value a rule names, or the merge adds nothing. A new file (no `before`) is left
/// alone — its template was chosen when it was made — and so are the templates themselves.
pub fn on_save(root: &Path, cfg: &Config, rel: &str, before: Option<&str>, after: &str, now: NaiveDateTime) -> Option<Applied> {
    let before = before?;
    let templates = format!("{}/", cfg.notes.templates.trim_matches('/'));
    if !rel.ends_with(".md") || rel.starts_with(&templates) {
        return None;
    }
    let had = values(before);
    let chosen: Chosen = values(after)
        .into_iter()
        .filter(|kv| !had.contains(kv))
        .find_map(|(k, v)| choose(root, cfg, &Moment::PropertySet { path: rel, key: &k, value: &v }))?;
    let text = crate::notes::template_text(root, cfg, &chosen.template).ok()?;
    let title = rel.rsplit('/').next().unwrap_or(rel).trim_end_matches(".md");
    let rendered = crate::notes::render_template(root, cfg, &text, title, now);
    let merged = atlas_text::merge::merge(after, &rendered);
    (!merged.added.is_empty()).then_some(Applied { template: chosen.template, added: merged.added, text: merged.text, body: None })
}

/// `template` merged into `text` as it is now (the editor's retry when it was typed in meanwhile). `at_cursor`
/// ("Insert template"): only its properties are merged, its body answered apart for the caller to place.
pub fn merge_into(root: &Path, cfg: &Config, rel: &str, template: &str, text: &str, at_cursor: bool, now: NaiveDateTime) -> crate::Result<Applied> {
    let t = crate::notes::template_text(root, cfg, template)?;
    let title = rel.rsplit('/').next().unwrap_or(rel).trim_end_matches(".md");
    let rendered = crate::notes::render_template(root, cfg, &t, title, now);
    if !at_cursor {
        let merged = atlas_text::merge::merge(text, &rendered);
        return Ok(Applied { template: template.to_string(), added: merged.added, text: merged.text, body: None });
    }
    let (props, body) = match atlas_text::frontmatter::split(&rendered) {
        (Some(yaml), body) => (format!("---\n{yaml}---\n"), body.trim_start_matches(['\r', '\n']).to_string()),
        (None, _) => (String::new(), rendered),
    };
    let merged = atlas_text::merge::merge(text, &props);
    Ok(Applied { template: template.to_string(), added: merged.added, text: merged.text, body: Some(body) })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now() -> NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(2026, 10, 25).unwrap().and_hms_opt(12, 0, 0).unwrap()
    }

    #[test]
    fn a_type_set_to_a_templates_value_merges_it_once() {
        let d = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(d.path().join("templates")).unwrap();
        std::fs::write(d.path().join("templates/movie.md"), "---\napply_when:\n  - property: { type: movie }\ntype: movie\ndirector:\nrating:\n---\n## Review\n").unwrap();
        let cfg = Config::default();
        let before = "---\ntype: idea\n---\nSeen last night.\n";
        let after = "---\ntype: movie\n---\nSeen last night.\n";
        let a = on_save(d.path(), &cfg, "notes/Heat.md", Some(before), after, now()).expect("merged");
        assert_eq!(a.template, "movie");
        assert_eq!(a.text, "---\ntype: movie\ndirector:\nrating:\n---\nSeen last night.\n\n## Review\n");
        assert!(!a.text.contains("apply_when"), "the template's own key stays in the template");
        // saved again with the type unchanged: nothing
        assert!(on_save(d.path(), &cfg, "notes/Heat.md", Some(&a.text), &a.text, now()).is_none());
        // a new file, or the template itself: left alone
        assert!(on_save(d.path(), &cfg, "notes/New.md", None, after, now()).is_none());
        assert!(on_save(d.path(), &cfg, "templates/x.md", Some(before), after, now()).is_none());
        // a tag added to a list counts as set
        std::fs::write(d.path().join("templates/idea.md"), "---\napply_when: { property: { tags: idea } }\nstatus: open\n---\n").unwrap();
        let a = on_save(d.path(), &cfg, "n.md", Some("---\ntags: [a]\n---\n"), "---\ntags: [a, idea]\n---\n", now()).expect("merged");
        assert!(a.text.contains("status: open"), "{}", a.text);
    }
}
