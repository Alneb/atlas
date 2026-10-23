//! Tags of the user's notes: frontmatter `tags:` and inline `#tag` in the text, nested with `/`
//! (`#physics/dmft` is also a note of `physics`). Read from the link index, so agent files and
//! templates have no tags, and a note is re-read only when it changes.
use crate::api::TagCount;
use crate::config::Config;
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

/// A tag as it is compared: no `#`, lower case, no empty or trailing segment.
fn clean(raw: &str) -> Option<String> {
    let t = raw.trim().trim_start_matches('#').trim_matches('/').to_lowercase();
    let ok = !t.is_empty()
        && t.chars().all(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | '/'))
        && t.chars().any(|c| !c.is_ascii_digit() && c != '/') // `#123` is an issue number, not a tag
        && !t.contains("//");
    ok.then_some(t)
}

/// The tags one note carries (sorted, unique): `tags:` / `tag:` in its frontmatter (a list, or
/// words separated by commas or spaces), every `#tag` in its text outside code, and its PDF marks' tags.
pub fn of_note(text: &str, props: &serde_yaml::Mapping) -> Vec<String> {
    let mut out = BTreeSet::new();
    for key in ["tags", "tag"] {
        match props.get(key) {
            Some(serde_yaml::Value::Sequence(list)) => out.extend(list.iter().filter_map(|v| v.as_str()).filter_map(clean)),
            Some(serde_yaml::Value::String(s)) => out.extend(s.split([',', ' ']).filter_map(clean)),
            _ => {}
        }
    }
    inline_tags(text, |_, t| out.extend(clean(t)));
    // a PDF's marks are the note's too: their tags, from its pdf-marks block (a fence, so not read as text above)
    if crate::pdf_marks::has_block(text) {
        out.extend(crate::pdf_marks::read(text).live().into_iter().flat_map(|m| m.tags.iter().filter_map(|t| clean(t))));
    }
    out.into_iter().collect()
}

fn tag_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '-' | '/')
}

/// Each `#tag` of a note's text (after the frontmatter, outside code): its byte offset in `text` (after the `#`) and
/// the tag as written. The one walk both [`of_note`] and [`rename_in`] use.
fn inline_tags(text: &str, mut f: impl FnMut(usize, &str)) {
    let body = body_of(text);
    let base = text.len() - body.len(); // the body is the text's tail
    let mut fenced = false;
    let mut at = 0;
    for raw in body.split_inclusive('\n') {
        let line_at = base + at;
        at += raw.len();
        let line = raw.trim_end_matches(['\n', '\r']);
        let t = line.trim_start();
        if t.starts_with("```") || t.starts_with("~~~") {
            fenced = !fenced;
            continue;
        }
        if fenced {
            continue;
        }
        // inline code is not text: every second piece between backticks is skipped
        let mut piece_at = 0;
        for (k, piece) in line.split('`').enumerate() {
            if k % 2 == 0 {
                let mut prev = ' ';
                for (i, c) in piece.char_indices() {
                    if c == '#' && (prev.is_whitespace() || matches!(prev, '(' | '[' | ',' | ';')) {
                        let rest = &piece[i + 1..];
                        let end = rest.find(|ch: char| !tag_char(ch)).unwrap_or(rest.len());
                        if end > 0 {
                            f(line_at + piece_at + i + 1, &rest[..end]);
                        }
                    }
                    prev = c;
                }
            }
            piece_at += piece.len() + 1;
        }
    }
}

/// Whether a tag as written is `from` or nested under it, and how many of its bytes are `from`'s.
fn renames(written: &str, from: &str) -> Option<usize> {
    let n = from.len();
    let head = written.get(..n)?;
    (head.eq_ignore_ascii_case(from) || head.to_lowercase() == from).then_some(n).filter(|_| written.len() == n || written[n..].starts_with('/'))
}

/// A note's text with the tag `from` (and the tags nested under it) renamed `to`: every `#from` in the text and every
/// `from` in the frontmatter's `tags:` / `tag:` → (text, tags renamed). Case as the user writes `to`.
pub fn rename_in(text: &str, from: &str, to: &str) -> (String, usize) {
    let to = to.trim().trim_start_matches('#').trim_matches('/');
    let Some(from) = clean(from).filter(|_| !to.is_empty() && to.chars().all(tag_char)) else { return (text.to_string(), 0) };
    let mut edits: Vec<(usize, usize)> = Vec::new();
    inline_tags(text, |at, written| {
        if let Some(n) = renames(written, &from) {
            edits.push((at, at + n));
        }
    });
    // the frontmatter's tag list: `tags: [a, b]`, `tags: a, b`, or one `- a` per line under it
    if let Some(rest) = text.strip_prefix("---\n").or_else(|| text.strip_prefix("---\r\n")) {
        let end = rest.find("\n---").map_or(0, |i| i + 1);
        let mut at = text.len() - rest.len();
        let mut in_tags = false;
        for raw in rest[..end].split_inclusive('\n') {
            let line = raw.trim_end_matches(['\n', '\r']);
            let top = !line.starts_with([' ', '\t', '-']);
            let value = if top {
                let key = line.split_once(':').map(|(k, _)| k.trim().to_lowercase());
                in_tags = matches!(key.as_deref(), Some("tags" | "tag"));
                line.find(':').map(|i| i + 1)
            } else {
                Some(0)
            };
            if let (true, Some(v)) = (in_tags, value) {
                let mut prev = ' ';
                for (i, c) in line[v..].char_indices() {
                    if tag_char(c) && !tag_char(prev) {
                        let word = &line[v + i..];
                        let len = word.find(|ch: char| !tag_char(ch)).unwrap_or(word.len());
                        if let Some(n) = renames(&word[..len], &from) {
                            edits.push((at + v + i, at + v + i + n));
                        }
                    }
                    prev = c;
                }
            }
            at += raw.len();
        }
    }
    edits.sort();
    let n = edits.len();
    let mut out = text.to_string();
    for (a, b) in edits.into_iter().rev() {
        out.replace_range(a..b, to);
    }
    (out, n)
}

/// The tag `from` renamed `to` in every note carrying it (or a tag nested under it) → (tags renamed, notes written).
pub fn rename(ws: &crate::workspace::Workspace, from: &str, to: &str) -> crate::error::Result<(usize, Vec<String>)> {
    let cfg = ws.config()?;
    let mut count = 0;
    let mut written = Vec::new();
    for path in notes(ws.root(), &cfg, from) {
        let abs = ws.resolve(&path)?;
        let Ok(text) = std::fs::read_to_string(&abs) else { continue };
        let (next, n) = rename_in(&text, from, to);
        if n > 0 {
            crate::vault_write::write(&abs, next.as_bytes())?;
            count += n;
            written.push(path);
        }
    }
    Ok((count, written))
}

/// The text after the frontmatter block.
fn body_of(text: &str) -> &str {
    let t = text.strip_prefix('\u{feff}').unwrap_or(text);
    let Some(rest) = t.strip_prefix("---\n").or_else(|| t.strip_prefix("---\r\n")) else { return t };
    rest.find("\n---").map_or("", |i| rest[i + 4..].split_once('\n').map_or("", |(_, b)| b))
}

/// `tag` itself and each of its parents: `a/b/c` → `a`, `a/b`, `a/b/c`.
fn with_parents(tag: &str) -> impl Iterator<Item = &str> {
    tag.char_indices().filter(|(_, c)| *c == '/').map(|(i, _)| &tag[..i]).chain(std::iter::once(tag))
}

/// Every tag in the vault with how many notes carry it (a nested tag counts for its parents too),
/// by name.
pub fn all(root: &Path, cfg: &Config) -> Vec<TagCount> {
    let mut count: BTreeMap<String, u32> = BTreeMap::new();
    for (_, parsed, _) in &crate::links::vault(root, cfg).notes {
        let mine: BTreeSet<&str> = parsed.tags.iter().flat_map(|t| with_parents(t)).collect();
        for t in mine {
            *count.entry(t.to_string()).or_default() += 1;
        }
    }
    count.into_iter().map(|(tag, notes)| TagCount { tag, notes }).collect()
}

/// The notes carrying `tag` or a tag nested under it, by path.
pub fn notes(root: &Path, cfg: &Config, tag: &str) -> Vec<String> {
    let Some(want) = clean(tag) else { return Vec::new() };
    let mut out: Vec<String> = crate::links::vault(root, cfg)
        .notes
        .into_iter()
        .filter(|(_, parsed, _)| parsed.tags.iter().any(|t| with_parents(t).any(|p| p == want)))
        .map(|(path, _, _)| path)
        .collect();
    out.sort();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags_come_from_frontmatter_and_text_but_not_from_code_headings_or_numbers() {
        let text = "---\ntags: [Physics/DMFT, todo]\n---\n# Heading\nSee #idea and (#physics/qmc), issue #42, colour `#fff`.\n```\n#notatag\n```\na#b is not one; C# neither\n";
        let props = crate::links::frontmatter(text);
        assert_eq!(of_note(text, &props), ["idea", "physics/dmft", "physics/qmc", "todo"]);
        assert_eq!(of_note("---\ntags: one, two three\n---\n", &crate::links::frontmatter("---\ntags: one, two three\n---\n")), ["one", "three", "two"]);
    }

    #[test]
    fn a_tag_is_renamed_in_the_text_nested_ones_and_the_frontmatter_but_not_in_code_or_lookalikes() {
        let text = "---\ntags: [Physics, physics/dmft, physicsy]\naliases: [physics]\n---\n#physics and #Physics/QMC, not #physicsy\n`#physics` stays\n```\n#physics\n```\n";
        let (out, n) = rename_in(text, "#physics", "science");
        assert_eq!(out, "---\ntags: [science, science/dmft, physicsy]\naliases: [physics]\n---\n#science and #science/QMC, not #physicsy\n`#physics` stays\n```\n#physics\n```\n");
        assert_eq!(n, 4);
        let list = "---\ntags:\n  - todo\n  - \"#todo/later\"\ntitle: todo\n---\n";
        assert_eq!(rename_in(list, "todo", "next").0, "---\ntags:\n  - next\n  - \"#next/later\"\ntitle: todo\n---\n");
    }

    #[test]
    fn nested_tags_count_for_their_parents_and_agent_files_have_none() {
        let d = tempfile::tempdir().unwrap();
        for (f, text) in [("notes/a.md", "#physics/dmft\n"), ("notes/b.md", "---\ntags: [physics]\n---\n"), ("notes/c.md", "#physics/dmft #todo\n"), ("docs/memory/m.md", "#physics #agent\n")] {
            std::fs::create_dir_all(d.path().join(f).parent().unwrap()).unwrap();
            std::fs::write(d.path().join(f), text).unwrap();
        }
        let cfg = Config::default();
        let got: Vec<(String, u32)> = all(d.path(), &cfg).into_iter().map(|t| (t.tag, t.notes)).collect();
        assert_eq!(got, [("physics".to_string(), 3), ("physics/dmft".to_string(), 2), ("todo".to_string(), 1)]);
        assert_eq!(notes(d.path(), &cfg, "#Physics"), ["notes/a.md", "notes/b.md", "notes/c.md"]);
        assert_eq!(notes(d.path(), &cfg, "physics/dmft"), ["notes/a.md", "notes/c.md"]);
        // `tag:` in search (quick open, the Search pane) lists those notes
        assert_eq!(crate::search::search(d.path(), &cfg, "tag:physics/dmft").files, ["notes/a.md", "notes/c.md"]);
    }

    #[test]
    fn a_pdf_marks_tags_are_the_notes() {
        let text = "# x\n\nmine #own\n\n```pdf-marks\nm-aaaaaaa1 postit p2 {\"version\":1,\"at\":[1,2],\"text\":\"why #question\",\"tags\":[\"question\"]}\n```\n";
        assert_eq!(of_note(text, &Default::default()), vec!["own".to_string(), "question".to_string()]);
    }
}
