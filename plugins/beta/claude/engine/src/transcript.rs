//! Claude Code's conversations, read for the plugin's rendered view (view.js): which ones this vault has, and one of
//! them as messages, a piece at a time. Claude Code keeps each conversation as `<account>/projects/<cwd>/<id>.jsonl`,
//! one JSON object per line, written as it goes; `<cwd>` is the folder it ran in with every other character than a
//! letter or a digit made `-`. Only what was said is kept: the person's words, Claude's text and thinking, each tool
//! asked for (its name and a short line of what) and its answer (cut); bookkeeping lines are left out.
use serde_json::{json, Value};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

/// The most read at once: a long conversation arrives in a few pieces, the newest last.
pub const PIECE: u64 = 4 << 20;
/// A tool's answer is cut to this many characters (a file read whole, a long build log).
const RESULT_CHARS: usize = 4000;

/// The folder Claude Code keeps the conversations of a session started in `cwd`.
pub fn project_dir(account: &Path, cwd: &Path) -> PathBuf {
    let name: String = cwd.to_string_lossy().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    account.join("projects").join(name)
}

/// Is `id` a conversation's id (a UUID), never a path.
pub fn is_id(id: &str) -> bool {
    let parts: Vec<&str> = id.split('-').collect();
    parts.iter().map(|p| p.len()).eq([8, 4, 4, 4, 12]) && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_hexdigit()))
}

/// The conversation an Atlas tab holds now: the one Claude Code last reported for it (the tab's session report,
/// `<vault>/.atlas/cache/agent-sessions/<tab>.json`, written by its SessionStart hook on /clear or a resume), else the
/// tab's own id.
pub fn tab_conversation(root: &Path, tab: &str) -> Option<String> {
    if !is_id(tab) {
        return None;
    }
    let report = root.join(".atlas/cache/agent-sessions").join(format!("{tab}.json"));
    let moved = std::fs::read_to_string(report).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|v| v["session_id"].as_str().map(str::to_string));
    Some(moved.filter(|id| is_id(id)).unwrap_or_else(|| tab.to_string()))
}

/// Each file's title, kept while its size stays: finding one reads up to a MB, and the view asks every few seconds
/// for tens of files (the helper answers one call at a time: an uncached list held up the conversation's own reads).
pub type Titles = std::collections::HashMap<PathBuf, (u64, String)>;

/// The conversations of `dir`, newest first: id, when last written (ms), size, and a title — Claude Code's own
/// (`ai-title`), else the first thing the person said.
pub fn conversations(dir: &Path, most: usize, titles: &mut Titles) -> Vec<Value> {
    let mut found: Vec<(u64, PathBuf, u64)> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            let id = p.file_stem()?.to_str()?.to_string();
            (p.extension()? == "jsonl" && is_id(&id)).then_some(())?;
            let m = e.metadata().ok()?;
            let ms = m.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as u64;
            Some((ms, p, m.len()))
        })
        .collect();
    found.sort_by_key(|a| std::cmp::Reverse(a.0));
    found.truncate(most);
    found
        .into_iter()
        .map(|(ms, p, size)| {
            let id = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            let t = match titles.get(&p) {
                Some((at, t)) if *at == size => t.clone(),
                _ => {
                    let t = title(&p);
                    titles.insert(p.clone(), (size, t.clone()));
                    t
                }
            };
            json!({ "id": id, "modified": ms, "size": size, "title": t })
        })
        .collect()
}

/// Claude Code's title for a conversation (its last `ai-title` in the first MB), else the person's first words.
fn title(file: &Path) -> String {
    let mut head = Vec::new();
    if let Ok(f) = std::fs::File::open(file) {
        let _ = f.take(1 << 20).read_to_end(&mut head);
    }
    let mut first = None;
    let mut named = None;
    for line in String::from_utf8_lossy(&head).lines() {
        let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
        if v["type"] == "ai-title" {
            if let Some(t) = ["aiTitle", "title"].iter().find_map(|k| v[*k].as_str()) {
                named = Some(t.to_string());
            }
        } else if first.is_none() && said_by_person(&v) {
            first = message_text(&v["message"]["content"]).filter(|t| !t.trim().is_empty());
        }
    }
    let t = named.or(first).unwrap_or_default();
    let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
    if t.chars().count() > 90 { format!("{}…", t.chars().take(90).collect::<String>()) } else { t }
}

/// A line the person typed (not a tool's answer, not a line Claude Code adds itself).
fn said_by_person(v: &Value) -> bool {
    v["type"] == "user" && v["isMeta"] != true && v["isSidechain"] != true && message_text(&v["message"]["content"]).is_some()
}

/// The text parts of a message's content (a string, or blocks of which the `text` ones count).
fn message_text(content: &Value) -> Option<String> {
    match content {
        Value::String(s) => Some(s.clone()),
        Value::Array(blocks) => {
            let texts: Vec<&str> = blocks.iter().filter(|b| b["type"] == "text").filter_map(|b| b["text"].as_str()).collect();
            (!texts.is_empty()).then(|| texts.join("\n\n"))
        }
        _ => None,
    }
}

/// A piece of conversation `file` from byte `from` (the `size` of the last piece): whole lines only, read into
/// entries `{ role, time, blocks: [{ kind: text|thinking|tool|result, … }] }`.
pub fn piece(file: &Path, from: u64) -> std::io::Result<Value> {
    let mut f = std::fs::File::open(file)?;
    let len = f.metadata()?.len();
    let restart = len < from; // replaced or cut: read again from the start
    let start = if restart { 0 } else { from };
    f.seek(SeekFrom::Start(start))?;
    let mut buf = Vec::new();
    let read = f.take(PIECE.min(len - start)).read_to_end(&mut buf)? as u64;
    // a line still being written is read with the next piece
    let end = buf.iter().rposition(|&b| b == b'\n').map_or(0, |i| i + 1);
    buf.truncate(end);
    let size = start + end as u64;
    let entries: Vec<Value> = String::from_utf8_lossy(&buf).lines().filter_map(|l| serde_json::from_str::<Value>(l).ok()).filter_map(|v| entry(&v)).collect();
    Ok(json!({ "size": size, "restart": restart, "more": read == PIECE && size < len, "entries": entries }))
}

/// One line of the file as an entry, or None for bookkeeping (titles, modes, snapshots, a sub-agent's own lines).
pub fn entry(v: &Value) -> Option<Value> {
    let role = v["type"].as_str().filter(|t| *t == "user" || *t == "assistant")?;
    if v["isMeta"] == true || v["isSidechain"] == true {
        return None;
    }
    let content = &v["message"]["content"];
    let blocks: Vec<Value> = match content {
        Value::String(s) => vec![json!({ "kind": "text", "text": s })],
        Value::Array(list) => list.iter().filter_map(block).collect(),
        _ => vec![],
    };
    if blocks.is_empty() {
        return None;
    }
    // a user line that only answers tools is the tools' answer, not the person
    let role = if role == "user" && blocks.iter().all(|b| b["kind"] == "result") { "tool" } else { role };
    Some(json!({ "role": role, "time": v["timestamp"].as_str().unwrap_or_default(), "id": v["message"]["id"].as_str().or(v["uuid"].as_str()).unwrap_or_default(), "blocks": blocks }))
}

fn block(b: &Value) -> Option<Value> {
    match b["type"].as_str()? {
        "text" => Some(json!({ "kind": "text", "text": b["text"].as_str()? })),
        "thinking" => b["thinking"].as_str().filter(|t| !t.trim().is_empty()).map(|t| json!({ "kind": "thinking", "text": t })),
        "tool_use" => Some(json!({ "kind": "tool", "name": b["name"].as_str().unwrap_or("tool"), "what": what(&b["input"]) })),
        "tool_result" => {
            let text = match &b["content"] {
                Value::String(s) => s.clone(),
                Value::Array(parts) => parts.iter().filter_map(|p| p["text"].as_str()).collect::<Vec<_>>().join("\n"),
                _ => String::new(),
            };
            let cut = text.chars().count() > RESULT_CHARS;
            let text = if cut { format!("{}\n…", text.chars().take(RESULT_CHARS).collect::<String>()) } else { text };
            Some(json!({ "kind": "result", "text": text, "error": b["is_error"] == true }))
        }
        _ => None,
    }
}

/// A tool call in one line: its description, command, file, pattern or query — the first of those it has.
fn what(input: &Value) -> String {
    let line = ["description", "command", "file_path", "path", "pattern", "query", "url", "prompt"]
        .iter()
        .find_map(|k| input[*k].as_str())
        .map(str::to_string)
        .unwrap_or_else(|| input.to_string());
    let line = line.lines().next().unwrap_or_default().to_string();
    if line.chars().count() > 160 { format!("{}…", line.chars().take(160).collect::<String>()) } else { line }
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9";

    #[test]
    fn a_vaults_conversations_live_under_its_folder_made_a_name() {
        assert_eq!(project_dir(Path::new("/h/.claude"), Path::new("/home/u/My Vault.x")), PathBuf::from("/h/.claude/projects/-home-u-My-Vault-x"));
        assert!(is_id(A) && !is_id("../x") && !is_id("0b1c2d3e"));
        let t = tempfile::tempdir().unwrap();
        assert_eq!(tab_conversation(t.path(), A).as_deref(), Some(A), "no report: the tab's own");
        let moved = "9b41ad3f-16d6-454e-956a-8cbf0de58e52";
        std::fs::create_dir_all(t.path().join(".atlas/cache/agent-sessions")).unwrap();
        std::fs::write(t.path().join(format!(".atlas/cache/agent-sessions/{A}.json")), format!(r#"{{"session_id":"{moved}"}}"#)).unwrap();
        assert_eq!(tab_conversation(t.path(), A).as_deref(), Some(moved), "moved by /clear");
        assert_eq!(tab_conversation(t.path(), "../x"), None);
    }

    #[test]
    fn what_was_said_is_kept_and_bookkeeping_left_out() {
        let lines = [
            json!({ "type": "ai-title", "aiTitle": "Fixing the scroll" }),
            json!({ "type": "user", "message": { "content": "What is $E=mc^2$?" }, "timestamp": "t1" }),
            json!({ "type": "user", "isMeta": true, "message": { "content": "caveat" } }),
            json!({ "type": "assistant", "message": { "id": "m1", "content": [{ "type": "thinking", "thinking": "hmm" }] } }),
            json!({ "type": "assistant", "message": { "id": "m1", "content": [{ "type": "tool_use", "name": "Bash", "input": { "command": "ls\nmore", "description": "List files" } }] } }),
            json!({ "type": "user", "message": { "content": [{ "type": "tool_result", "content": [{ "type": "text", "text": "a.md" }], "is_error": false }] } }),
            json!({ "type": "assistant", "message": { "id": "m2", "content": [{ "type": "text", "text": "It is **energy**: $$E=mc^2$$" }] } }),
            json!({ "type": "assistant", "isSidechain": true, "message": { "content": [{ "type": "text", "text": "a sub-agent" }] } }),
            json!({ "type": "mode", "mode": "x" }),
        ];
        let entries: Vec<Value> = lines.iter().filter_map(entry).collect();
        let roles: Vec<&str> = entries.iter().map(|e| e["role"].as_str().unwrap()).collect();
        assert_eq!(roles, ["user", "assistant", "assistant", "tool", "assistant"]);
        assert_eq!(entries[2]["blocks"][0], json!({ "kind": "tool", "name": "Bash", "what": "List files" }));
        assert_eq!(entries[3]["blocks"][0]["text"], "a.md");
        assert_eq!(entries[4]["blocks"][0]["text"], "It is **energy**: $$E=mc^2$$");

        let t = tempfile::tempdir().unwrap();
        let file = t.path().join(format!("{A}.jsonl"));
        let text: String = lines.iter().map(|l| format!("{l}\n")).collect();
        std::fs::write(&file, &text).unwrap();
        let list = conversations(t.path(), 10, &mut Titles::new());
        assert_eq!((list[0]["id"].as_str(), list[0]["title"].as_str()), (Some(A), Some("Fixing the scroll")));
        // pieces: whole lines, from where the last stopped; a shorter file is read again from its start
        std::fs::write(&file, format!("{text}{{\"type\":\"user\",\"mess")).unwrap();
        let p = piece(&file, 0).unwrap();
        assert_eq!((p["size"].as_u64(), p["entries"].as_array().unwrap().len()), (Some(text.len() as u64), 5), "the half-written line waits");
        std::fs::write(&file, format!("{text}{}\n", json!({ "type": "user", "message": { "content": "next" } }))).unwrap();
        let next = piece(&file, p["size"].as_u64().unwrap()).unwrap();
        assert_eq!(next["entries"][0]["blocks"][0]["text"], "next");
        assert_eq!(piece(&file, 1 << 30).unwrap()["restart"], true);
    }
}
