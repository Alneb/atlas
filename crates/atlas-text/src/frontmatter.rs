//! Editing one frontmatter property in place (Bases cells, Notion-style). The rest of the file —
//! other keys, their order, comments, the body — is kept byte for byte: only the block of the edited
//! key (its line and any indented continuation lines) is replaced.
use serde_yaml::Value;

/// YAML for `key: value`; a list becomes block style (the vault's convention), strings are quoted
/// when YAML would otherwise read them as something else (`[[links]]`, `yes`, `12:30`…).
fn render(key: &str, value: &Value) -> String {
    match value {
        Value::Sequence(items) if !items.is_empty() => {
            let mut out = format!("{key}:\n");
            for it in items {
                out.push_str(&format!("  - {}\n", scalar(it)));
            }
            out
        }
        Value::Null => format!("{key}:\n"),
        v => format!("{key}: {}\n", scalar(v)),
    }
}

fn scalar(v: &Value) -> String {
    serde_yaml::to_string(v).map(|s| s.trim_end().to_string()).unwrap_or_default()
}

/// The text the user typed in a cell → a YAML value. `list` keeps a list a list (comma-separated);
/// numbers and booleans stay typed; `[[links]]` and everything else stay strings.
pub fn parse_cell(text: &str, list: bool) -> Value {
    let one = |t: &str| -> Value {
        let t = t.trim();
        if t.is_empty() {
            return Value::Null;
        }
        if !t.contains("[[") {
            if let Ok(v @ (Value::Number(_) | Value::Bool(_))) = serde_yaml::from_str::<Value>(t) {
                return v;
            }
        }
        Value::String(t.to_string())
    };
    if list {
        Value::Sequence(text.split(',').map(one).filter(|v| !v.is_null()).collect())
    } else {
        one(text)
    }
}

/// Where a note's frontmatter is: the YAML between the fences, and where the body starts (after the closing fence's
/// line), as byte offsets of `text`. The opening fence is the first line (after a BOM); the closing one is the next line
/// that is `---` (or YAML's `...`) alone, trailing spaces allowed; CRLF line ends count. None: no frontmatter, or one
/// never closed. The UI reads it the same way (property-model.ts `frontmatterOf`).
fn fences(text: &str) -> Option<(std::ops::Range<usize>, usize)> {
    let bom = if text.starts_with('\u{feff}') { '\u{feff}'.len_utf8() } else { 0 };
    let t = &text[bom..];
    let open = if t.starts_with("---\n") { 4 } else if t.starts_with("---\r\n") { 5 } else { return None };
    let start = bom + open;
    let mut at = start;
    loop {
        let end = text[at..].find('\n').map_or(text.len(), |i| at + i);
        if matches!(text[at..end].trim_end(), "---" | "...") {
            return Some((start..at, (end + 1).min(text.len())));
        }
        if end == text.len() {
            return None;
        }
        at = end + 1;
    }
}

/// A note split at its frontmatter: the YAML between the fences (None when it has none) and the body after them.
/// The one reader of the fences, for the core and the plugin engines alike.
pub fn split(text: &str) -> (Option<&str>, &str) {
    match fences(text) {
        Some((yaml, body)) => (Some(&text[yaml]), &text[body..]),
        None => (None, text),
    }
}

/// Where the frontmatter's YAML is in `text` (byte offsets), for an edit in place; None without one.
pub fn yaml_range(text: &str) -> Option<std::ops::Range<usize>> {
    fences(text).map(|(r, _)| r)
}

/// The frontmatter's YAML of a file read only in part (its first kilobytes): up to the closing fence, or to the end of
/// what was read when the fence lies past it. None: the text does not open with a frontmatter.
pub fn yaml_head(text: &str) -> Option<&str> {
    if let (Some(yaml), _) = split(text) {
        return Some(yaml);
    }
    let t = text.strip_prefix('\u{feff}').unwrap_or(text);
    t.strip_prefix("---\n").or_else(|| t.strip_prefix("---\r\n"))
}

/// The frontmatter as a YAML mapping (empty when there is none or it does not read as one).
pub fn mapping(text: &str) -> serde_yaml::Mapping {
    split(text).0.and_then(|y| serde_yaml::from_str::<Value>(y).ok()).and_then(|v| v.as_mapping().cloned()).unwrap_or_default()
}

/// The frontmatter's body (between the fences) as a byte range of `text`, when the note has one.
fn body_range(text: &str) -> Option<(usize, usize)> {
    fences(text).map(|(r, _)| (r.start, r.end))
}

/// A top-level `key:` line (not a list item, not an indented continuation).
fn is_key_line(line: &str, key: &str) -> bool {
    !line.starts_with([' ', '\t', '-', '#'])
        && line.split_once(':').is_some_and(|(k, _)| k.trim().trim_matches(['"', '\'']) == key)
}

/// Byte range, inside the frontmatter body `fm`, of `key`'s line and its continuation lines.
fn key_block(fm: &str, key: &str) -> Option<(usize, usize)> {
    let mut at = 0;
    let mut lines = fm.split_inclusive('\n').peekable();
    while let Some(line) = lines.next() {
        let start = at;
        at += line.len();
        if is_key_line(line, key) {
            while let Some(l) = lines.next_if(|l| l.starts_with([' ', '\t']) || l.starts_with("- ")) {
                at += l.len();
            }
            return Some((start, at));
        }
    }
    None
}

/// `text` with `key` set to `value` (added at the end of the frontmatter, or in a new one).
pub fn set_property(text: &str, key: &str, value: &Value) -> String {
    let block = render(key, value);
    let Some((a, b)) = body_range(text) else {
        return format!("---\n{block}---\n{text}");
    };
    match key_block(&text[a..b], key) {
        Some((s, e)) => format!("{}{block}{}", &text[..a + s], &text[a + e..]),
        None => format!("{}{block}{}", &text[..b], &text[b..]),
    }
}

/// `text` without `key`; the fences go too when it was the last property (as in Obsidian).
pub fn remove_property(text: &str, key: &str) -> String {
    let Some((a, b)) = body_range(text) else { return text.to_string() };
    let Some((s, e)) = key_block(&text[a..b], key) else { return text.to_string() };
    let out = format!("{}{}", &text[..a + s], &text[a + e..]);
    match out.strip_prefix("---\n---") {
        Some(body) => body.strip_prefix('\n').unwrap_or(body).to_string(),
        None => out,
    }
}

/// `text` with the key `from` called `to`; its value, place and formatting stay.
pub fn rename_property(text: &str, from: &str, to: &str) -> String {
    let Some((a, b)) = body_range(text) else { return text.to_string() };
    let Some((s, _)) = key_block(&text[a..b], from) else { return text.to_string() };
    let line = a + s;
    let colon = line + text[line..].find(':').unwrap_or(0);
    format!("{}{}{}", &text[..line], to, &text[colon..])
}

/// Whether the note's frontmatter has `key`.
pub fn has_property(text: &str, key: &str) -> bool {
    body_range(text).is_some_and(|(a, b)| key_block(&text[a..b], key).is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_reader_of_the_fences_for_every_spelling() {
        assert_eq!(split("---\ntitle: x\n---\nbody\n"), (Some("title: x\n"), "body\n"));
        assert_eq!(split("\u{feff}---\r\ntitle: x\r\n---\r\nbody"), (Some("title: x\r\n"), "body"), "a BOM, CRLF");
        assert_eq!(split("---\n---\nbody"), (Some(""), "body"), "an empty one");
        assert_eq!(split("---\na: 1\n---"), (Some("a: 1\n"), ""), "nothing after it");
        assert_eq!(split("---\na: 1\n----\nb: 2\n---\nbody"), (Some("a: 1\n----\nb: 2\n"), "body"), "only `---` alone closes it");
        assert_eq!(split("---\na: 1\n... \nbody"), (Some("a: 1\n"), "body"), "YAML's own end, as the UI reads it");
        assert_eq!(split("---\na: 1\nnever closed"), (None, "---\na: 1\nnever closed"));
        assert_eq!(split("text\n---\n"), (None, "text\n---\n"));
        assert_eq!(mapping("---\r\ntags: [a]\r\n---\r\n").get("tags").and_then(Value::as_sequence).map(Vec::len), Some(1));
        assert!(mapping("---\n: : bad\n---\n").is_empty());
        assert_eq!(set_property("\u{feff}---\r\na: 1\r\n---\r\nbody", "b", &Value::from(2)), "\u{feff}---\r\na: 1\r\nb: 2\n---\r\nbody");
    }
}
