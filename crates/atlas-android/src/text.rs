//! The text rules the Java screens once kept copies of, now the core's own: a link's tracking taken off (atlas-text
//! links.rs), a share's text and quote (atlas-capture share.rs), a pen stroke's samples (pdf_marks.rs `Samples`) and a
//! note's properties (atlas-text frontmatter.rs). Through glue.rs; "" stands for Java's null both ways.
use atlas_core::pdf_marks::{Sample, Samples};
use atlas_text::frontmatter;
use serde_json::{Map, Value as Json};
use serde_yaml::Value;

/// `text` with the share-tracking parameters taken off every address in it.
pub fn untracked(text: &str) -> String {
    atlas_text::links::untracked(text)
}

/// A share's text, its subject first when the text does not already hold it.
pub fn share_text(subject: &str, text: &str) -> String {
    atlas_capture::share::with_subject(subject, text)
}

/// Selected text as a Markdown quote; "" when nothing is selected.
pub fn share_quote(text: &str) -> String {
    let t = text.trim();
    if t.is_empty() { String::new() } else { atlas_capture::share::quote(t) }
}

/// A share goes under an unsent draft, never over it.
pub fn under_draft(draft: &str, shared: &str) -> String {
    atlas_capture::share::under_draft(draft, shared)
}

/// Six numbers a sample: x, y (PDF points), pressure, tiltX, tiltY, t (ms).
const N: usize = 6;

/// A stroke's samples, six numbers each, as every device stores them in a PDF's note.
pub fn samples_encode(s: &[f64]) -> String {
    Samples(s.chunks_exact(N).map(|c| Sample { x: c[0], y: c[1], pressure: c[2], tilt_x: c[3], tilt_y: c[4], t: c[5].max(0.0).round() as u32 }).collect())
        .encode()
}

/// The samples back, six numbers each; an unreadable string gives none.
pub fn samples_decode(text: &str) -> Vec<f64> {
    Samples::decode(text)
        .map(|s| s.0.iter().flat_map(|p| [p.x, p.y, p.pressure, p.tilt_x, p.tilt_y, f64::from(p.t)]).collect())
        .unwrap_or_default()
}

/// A property's value as the plugins read it: a scalar's text; an unquoted `[[link]]` (which YAML reads as a list in
/// a list) as the link.
fn shown(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
        Value::Sequence(outer) => match outer.as_slice() {
            [Value::Sequence(inner)] => match inner.as_slice() {
                [Value::String(s)] => format!("[[{s}]]"),
                _ => String::new(),
            },
            _ => String::new(),
        },
        _ => String::new(),
    }
}

/// An unquoted `[[link]]`, which YAML reads as a list holding a list.
fn is_link(items: &[Value]) -> bool {
    matches!(items, [Value::Sequence(_)])
}

/// The note's top-level properties as `{key: text}` (lists and maps as "").
pub fn props_read(text: &str) -> Json {
    let out: Map<String, Json> = frontmatter::mapping(text)
        .iter()
        .filter_map(|(k, v)| {
            let text = match v { Value::Sequence(items) if !is_link(items) => String::new(), v => shown(v) };
            Some((k.as_str()?.to_string(), Json::String(text)))
        })
        .collect();
    Json::Object(out)
}

/// A value typed as text into YAML: numbers and booleans typed, the rest strings (core `parse_cell`); "" kept "".
fn typed(text: &str) -> Value {
    if text.is_empty() { Value::String(String::new()) } else { frontmatter::parse_cell(text, false) }
}

/// `text` with each key of `set` given its value (JSON null: the key removed); every other line stays as written.
pub fn props_set(text: &str, set: &Map<String, Json>) -> String {
    set.iter().fold(text.to_string(), |t, (k, v)| match v.as_str() {
        Some(s) => frontmatter::set_property(&t, k, &typed(s)),
        None => frontmatter::remove_property(&t, k),
    })
}

/// A list property's items: a block or flow list, or one value as one item.
pub fn props_list(text: &str, key: &str) -> Vec<String> {
    match frontmatter::mapping(text).get(key) {
        None | Some(Value::Null) => vec![],
        Some(Value::Sequence(items)) if !is_link(items) => items.iter().map(shown).filter(|s| !s.is_empty()).collect(),
        Some(v) => vec![shown(v)].into_iter().filter(|s| !s.is_empty()).collect(),
    }
}

/// `text` with `key` as a block list of these items, as Obsidian writes one (none: the key removed).
pub fn props_set_list(text: &str, key: &str, items: &[String]) -> String {
    if items.is_empty() {
        return frontmatter::remove_property(text, key);
    }
    frontmatter::set_property(text, key, &Value::Sequence(items.iter().map(|i| typed(i)).collect()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_selection_is_quoted_and_links_untracked() {
        assert_eq!(share_quote("spin liquid\n\nground state\n"), "> spin liquid\n>\n> ground state");
        assert_eq!(share_quote("  "), "");
        assert_eq!(untracked("see https://youtu.be/abc?si=XYZ"), "see https://youtu.be/abc");
    }

    #[test]
    fn samples_are_the_core_codec() {
        let s = [100.0, 500.0, 0.8, 0.25, -0.125, 0.0, 100.37, 499.89, 0.81, 0.25, -0.125, 8.0, 99.5, 501.25, 0.0, -1.0, 1.0, 17.0];
        let want = "oJwBoI0GwAz0A_kBAEoVFAAAEK0BkALTDMMTyhES";
        assert_eq!(samples_encode(&s), want);
        let back = samples_decode(want);
        assert_eq!(back.len(), s.len());
        assert!(back.iter().zip(s).all(|(a, b)| (a - b).abs() < 1e-9), "{back:?}");
        assert!(samples_decode("not base64!").is_empty());
    }

    #[test]
    fn properties_touch_only_their_keys() {
        let note = "---\ntitle: Dune\n# kept\ntags:\n  - book\n  - sf\npage: 12\nproject: [[Thesis]]\n---\nbody\n";
        let p = props_read(note);
        assert_eq!(p["title"], "Dune");
        assert_eq!(p["page"], "12");
        assert_eq!(p["tags"], "");
        assert_eq!(p["project"], "[[Thesis]]");
        assert_eq!(props_list(note, "tags"), ["book", "sf"]);
        assert_eq!(props_list(note, "project"), ["[[Thesis]]"]);
        assert_eq!(props_list(note, "title"), ["Dune"]);
        assert!(props_list(note, "none").is_empty());
        let mut set = Map::new();
        set.insert("page".into(), Json::String("13".into()));
        set.insert("title".into(), Json::Null);
        set.insert("status".into(), Json::String("reading: half".into()));
        let out = props_set(note, &set);
        assert!(out.contains("page: 13\n") && !out.contains("title:") && out.contains("# kept\n") && out.ends_with("---\nbody\n"), "{out}");
        assert_eq!(props_read(&out)["status"], "reading: half");
        let listed = props_set_list(note, "tags", &["qft".into(), "[[Exam]]".into()]);
        assert_eq!(props_list(&listed, "tags"), ["qft", "[[Exam]]"]);
        assert!(!props_set_list(note, "tags", &[]).contains("tags"));
        let fresh = props_set("just text\n", &set);
        assert!(fresh.starts_with("---\n") && fresh.ends_with("---\njust text\n"), "{fresh}");
    }
}
