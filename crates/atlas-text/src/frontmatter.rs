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

/// The frontmatter's body (between the fences) as a byte range of `text`, when the note has one.
fn body_range(text: &str) -> Option<(usize, usize)> {
    let rest = text.strip_prefix("---\n")?;
    let end = rest.find("\n---").map(|i| i + 1).or_else(|| rest.starts_with("---").then_some(0))?;
    Some((4, 4 + end))
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

