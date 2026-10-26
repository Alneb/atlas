//! A template merged into a note that already has content (docs/design/DESIGN-templates-automation.md "Merging"):
//! only what the note lacks is added, nothing of the note's is changed, removed or moved.
//!
//! - **Properties**: a key the note lacks comes as the template writes it; an empty one is filled; a list gets the
//!   template's items it lacks, after its own; any other value the note has stays.
//! - **Sections**: a heading the note lacks comes with its content, after the section the template puts before it
//!   (else at the end); a heading the note has, left empty, gets the template's content.
//! - **Blocks**: a fenced block of the template (` ```view `, ` ```base `…) the note does not have, by its language
//!   and its first line, is added at the end of its section.
use crate::frontmatter::{has_property, set_property};
use serde_yaml::Value;

/// The merged text and what was added, in words (`tags: idea`, `## Summary`, "a view block"), for the notice.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Merged {
    pub text: String,
    pub added: Vec<String>,
}

pub fn merge(note: &str, template: &str) -> Merged {
    let mut added = vec![];
    let text = merge_properties(note, template, &mut added);
    let text = merge_body(&text, template, &mut added);
    Merged { text, added }
}

/// `(frontmatter body, the rest)`; no frontmatter: `("", text)`.
fn split(text: &str) -> (&str, &str) {
    let (yaml, body) = crate::frontmatter::split(text);
    (yaml.unwrap_or(""), body)
}

fn merge_properties(note: &str, template: &str, added: &mut Vec<String>) -> String {
    let (tfm, _) = split(template);
    let Ok(Value::Mapping(want)) = serde_yaml::from_str::<Value>(tfm) else { return note.to_string() };
    let (nfm, _) = split(note);
    // a note whose properties are not YAML is left as it is: a merge must never break it further
    let have = match serde_yaml::from_str::<Value>(nfm) {
        Ok(Value::Mapping(m)) => m,
        Ok(Value::Null) => serde_yaml::Mapping::new(),
        _ if nfm.is_empty() => serde_yaml::Mapping::new(),
        _ => return note.to_string(),
    };
    let mut out = note.to_string();
    for (k, v) in want {
        let Some(key) = k.as_str() else { continue };
        let empty = |v: &Value| v.is_null() || v.as_str().is_some_and(|s| s.trim().is_empty()) || v.as_sequence().is_some_and(|s| s.is_empty());
        match have.get(key) {
            _ if empty(&v) && has_property(&out, key) => {}
            Some(h) if !empty(h) => {
                // a list gets the template's items it lacks; any other value the note has stays
                let (Some(h), Some(w)) = (h.as_sequence(), v.as_sequence()) else { continue };
                let new: Vec<Value> = w.iter().filter(|x| !h.contains(x)).cloned().collect();
                if new.is_empty() {
                    continue;
                }
                let words: Vec<String> = new.iter().map(word).collect();
                out = set_property(&out, key, &Value::Sequence(h.iter().cloned().chain(new).collect()));
                added.push(format!("{key}: {}", words.join(", ")));
            }
            _ => {
                out = set_property(&out, key, &v);
                added.push(if empty(&v) { key.to_string() } else { format!("{key}: {}", word(&v)) });
            }
        }
    }
    out
}

fn word(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Sequence(s) => s.iter().map(word).collect::<Vec<_>>().join(", "),
        v => serde_yaml::to_string(v).map(|s| s.trim().to_string()).unwrap_or_default(),
    }
}

/// A section: its heading line (none for what comes before the first heading) and the lines under it.
struct Section {
    heading: Option<String>,
    body: Vec<String>,
}

/// A heading line outside code fences: `#…# text`.
fn heading_key(line: &str) -> Option<String> {
    let t = line.trim_start_matches('#');
    (t.len() < line.len() && t.starts_with(' ') && line.len() - t.len() <= 6).then(|| t.trim().to_lowercase())
}

fn sections(body: &str) -> Vec<Section> {
    let mut out = vec![Section { heading: None, body: vec![] }];
    let mut fence = false;
    for line in body.lines() {
        if line.trim_start().starts_with("```") {
            fence = !fence;
        }
        if !fence && heading_key(line).is_some() {
            out.push(Section { heading: Some(line.to_string()), body: vec![] });
        } else {
            out.last_mut().expect("one at least").body.push(line.to_string());
        }
    }
    out
}

/// The fenced blocks of some lines, each as its text and its identity (language and first line).
fn blocks(lines: &[String]) -> Vec<(String, String)> {
    let mut out = vec![];
    let mut cur: Option<Vec<&str>> = None;
    let lines = lines.iter().map(String::as_str);
    for l in lines {
        match cur.as_mut() {
            None if l.trim_start().starts_with("```") && l.trim().len() > 3 => cur = Some(vec![l]),
            None => {}
            Some(b) => {
                b.push(l);
                if l.trim() == "```" {
                    let id = format!("{}\n{}", b[0].trim(), b.get(1).map_or("", |s| s.trim()));
                    out.push((b.join("\n"), id));
                    cur = None;
                }
            }
        }
    }
    out
}

fn merge_body(note: &str, template: &str, added: &mut Vec<String>) -> String {
    let (_, tbody) = split(template);
    let fm_len = note.len() - split(note).1.len();
    let (head, body) = note.split_at(fm_len);
    let mut have = sections(body);
    let want = sections(tbody);
    if body.trim().is_empty() {
        // nothing written yet: the template's body as it is
        if tbody.trim().is_empty() {
            return note.to_string();
        }
        added.push("the template's text".into());
        return format!("{head}{}", tbody);
    }
    let key = |s: &Section| s.heading.as_deref().and_then(heading_key);
    let known: Vec<String> = have.iter().filter_map(key).collect();
    let all_ids: Vec<String> = blocks(&body.lines().map(String::from).collect::<Vec<_>>()).into_iter().map(|b| b.1).collect();
    let mut after: Option<String> = None; // the template's previous heading the note has
    for w in &want {
        let Some(k) = key(w) else { continue };
        let w_body = w.body.clone();
        if let Some(i) = have.iter().position(|h| key(h).as_deref() == Some(k.as_str())) {
            let h = &mut have[i];
            if h.body.iter().all(|l| l.trim().is_empty()) && w_body.iter().any(|l| !l.trim().is_empty()) {
                h.body = w_body;
                added.push(format!("{} (its text)", w.heading.as_deref().unwrap_or_default().trim()));
            } else {
                // its blocks the note has nowhere, at the end of the section
                for (text, id) in blocks(&w_body) {
                    if !all_ids.contains(&id) {
                        trim_end(&mut h.body);
                        h.body.push(String::new());
                        h.body.extend(text.lines().map(String::from));
                        added.push(format!("a {} block", id.trim_start_matches('`').split_whitespace().next().unwrap_or("code")));
                    }
                }
            }
            after = Some(k);
            continue;
        }
        if known.contains(&k) {
            continue;
        }
        let at = after.as_ref().and_then(|a| have.iter().position(|h| key(h).as_deref() == Some(a.as_str()))).map_or(have.len(), |i| i + 1);
        // the section before keeps one blank line before the new heading
        if let Some(prev) = at.checked_sub(1).and_then(|i| have.get_mut(i)) {
            trim_end(&mut prev.body);
            prev.body.push(String::new());
        }
        have.insert(at, Section { heading: w.heading.clone(), body: w_body });
        added.push(w.heading.as_deref().unwrap_or_default().trim().to_string());
        after = Some(k);
    }
    let mut out = String::from(head);
    for (i, s) in have.iter().enumerate() {
        if let Some(h) = &s.heading {
            out.push_str(h);
            out.push('\n');
        }
        let mut lines = s.body.clone();
        if i + 1 == have.len() {
            trim_end(&mut lines);
        }
        for l in lines {
            out.push_str(&l);
            out.push('\n');
        }
    }
    if !body.ends_with('\n') && out.ends_with('\n') && added.is_empty() {
        out.pop();
    }
    out
}

fn trim_end(lines: &mut Vec<String>) {
    while lines.last().is_some_and(|l| l.trim().is_empty()) {
        lines.pop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEMPLATE: &str = "---\ntype: lecture\ncourse:\ntags:\n  - lecture\n  - todo\n---\n# Notes\n\n## Summary\n\nWhat it was about.\n\n## Questions\n\n```view\ntype: tasks\n```\n";

    #[test]
    fn a_note_gets_what_it_lacks_and_keeps_what_it_has() {
        let note = "---\ntype: seminar\ntags: [physics]\n---\n# Notes\n\nMy own words.\n\n## Questions\n\nWhy?\n";
        let m = merge(note, TEMPLATE);
        assert!(m.text.starts_with("---\ntype: seminar\n"), "a value the note has stays: {}", m.text);
        assert!(m.text.contains("tags:\n  - physics\n  - lecture\n  - todo\n"), "the list grows after its own items: {}", m.text);
        assert!(m.text.contains("course:\n"), "a key it lacks: {}", m.text);
        assert!(m.text.contains("# Notes\n\nMy own words.\n\n## Summary\n\nWhat it was about.\n\n## Questions\n\nWhy?\n"), "the section in the template's place: {}", m.text);
        assert!(m.text.ends_with("Why?\n\n```view\ntype: tasks\n```\n"), "the block it lacks, at its section's end: {}", m.text);
        assert_eq!(m.added, ["course", "tags: lecture, todo", "## Summary", "a view block"]);
        // merged again: nothing more
        let again = merge(&m.text, TEMPLATE);
        assert_eq!(again.text, m.text);
        assert!(again.added.is_empty(), "{:?}", again.added);
    }

    #[test]
    fn an_empty_section_or_value_is_filled_and_an_empty_note_takes_the_whole_template() {
        let note = "---\ntype:\n---\n## Summary\n\n";
        let m = merge(note, TEMPLATE);
        assert!(m.text.starts_with("---\ntype: lecture\n"), "{}", m.text);
        assert!(m.text.contains("## Summary\n\nWhat it was about.\n"), "{}", m.text);
        let blank = merge("---\ntitle: x\n---\n", TEMPLATE);
        assert!(blank.text.ends_with("---\n# Notes\n\n## Summary\n\nWhat it was about.\n\n## Questions\n\n```view\ntype: tasks\n```\n"), "{}", blank.text);
        assert!(blank.text.starts_with("---\ntitle: x\n"));
    }

    #[test]
    fn a_note_without_properties_gets_them_and_broken_properties_are_left_alone() {
        let m = merge("Some text.\n", "---\ntype: idea\n---\n");
        assert_eq!(m.text, "---\ntype: idea\n---\nSome text.\n");
        let broken = "---\ntype: [unclosed\n---\nText\n";
        assert_eq!(merge(broken, "---\ntype: idea\n---\n").text, broken);
    }

    #[test]
    fn headings_inside_code_are_not_sections() {
        let note = "Text\n\n```md\n## Summary\n```\n";
        let m = merge(note, "---\n---\n## Summary\n\nS.\n");
        assert!(m.text.ends_with("```\n\n## Summary\n\nS.\n"), "{}", m.text);
    }
}
