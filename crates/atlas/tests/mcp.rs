//! `atlas mcp` speaks JSON-RPC on stdio; file tools work without the window, UI tools fail loudly.
use serde_json::{json, Value};
use std::io::Write;
use std::process::{Command, Stdio};

fn session(ws: &std::path::Path, msgs: &[Value]) -> Vec<Value> {
    let mut child = Command::new(env!("CARGO_BIN_EXE_atlas"))
        .arg("--workspace")
        .arg(ws)
        .arg("mcp")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    for m in msgs {
        writeln!(stdin, "{m}").unwrap();
    }
    drop(stdin); // EOF ends the server
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success());
    String::from_utf8_lossy(&out.stdout).lines().map(|l| serde_json::from_str(l).unwrap()).collect()
}

fn call(id: u32, name: &str, args: Value) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "method": "tools/call", "params": {"name": name, "arguments": args}})
}

#[test]
fn handshake_tools_and_offline_calls() {
    let d = tempfile::tempdir().unwrap();
    std::fs::write(d.path().join("FOCUS.md"), "# Focus\nMott transition\n").unwrap();
    std::fs::write(d.path().join("hubbard.md"), "the Hubbard model at half filling\n").unwrap();
    let replies = session(
        d.path(),
        &[
            json!({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}}}),
            json!({"jsonrpc": "2.0", "method": "notifications/initialized"}),
            json!({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}),
            call(3, "atlas_capture", json!({"text": "IDEA: try the cumulant periodization"})),
            call(4, "atlas_today", json!({})),
            call(5, "atlas_search", json!({"query": "half filling"})),
            call(6, "atlas_context", json!({})),
            json!({"jsonrpc": "2.0", "id": 7, "method": "bogus"}),
        ],
    );
    assert_eq!(replies.len(), 7, "the notification gets no reply: {replies:?}");
    assert_eq!(replies[0]["result"]["serverInfo"]["name"], "atlas");
    let names: Vec<&str> = replies[1]["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"atlas_context") && names.contains(&"atlas_open") && names.len() == 10, "{names:?}");
    assert!(replies[2]["result"]["isError"].is_null(), "{}", replies[2]);
    let today = replies[3]["result"]["content"][0]["text"].as_str().unwrap();
    assert!(today.contains("cumulant periodization") && today.contains("Mott transition"), "{today}");
    assert!(replies[4]["result"]["content"][0]["text"].as_str().unwrap().contains("hubbard.md"));
    assert_eq!(replies[5]["result"]["isError"], true, "context needs the window");
    assert_eq!(replies[6]["error"]["code"], -32601);
}

#[test]
fn notes_from_the_vaults_templates_and_never_over_an_existing_one() {
    let d = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(d.path().join("templates")).unwrap();
    std::fs::write(d.path().join("templates/literature.md"), "---\ntype: Literature\ncreated: {{date}}\nsources:\ncreate_in: notes/papers\n---\n# {{title}}\n").unwrap();
    let new = |id, path: &str| call(id, "atlas_new_note", json!({"path": path, "template": "literature", "fields": {"sources": ["[[koch2008sum]]"]}, "text": "## What it says"}));
    let replies = session(
        d.path(),
        &[
            json!({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}),
            call(2, "atlas_templates", json!({})),
            new(3, "notes/papers/Sum rules"),
            new(4, "notes/papers/Sum rules.md"),
            call(5, "atlas_new_note", json!({"path": "notes/x.md", "fields": "type=idea"})),
        ],
    );
    let names: Vec<&str> = replies[0]["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"atlas_new_note") && names.contains(&"atlas_templates"), "{names:?}");
    let text = |i: usize| replies[i]["result"]["content"][0]["text"].as_str().unwrap().to_string();
    let templates: Value = serde_json::from_str(&text(1)).unwrap();
    assert_eq!(templates, json!([{"name": "literature", "default": false, "path": "templates/literature.md", "folder": "notes/papers", "properties": ["type", "created", "sources"], "prompts": [], "applies": ["the note of any file (the literature template)"], "asks": []}]));
    let made: Value = serde_json::from_str(&text(2)).unwrap();
    assert_eq!(made["path"], "notes/papers/Sum rules.md");
    let note = std::fs::read_to_string(d.path().join("notes/papers/Sum rules.md")).unwrap();
    assert!(note.starts_with("---\ntype: Literature\ncreated: 20") && note.contains("sources:\n  - '[[koch2008sum]]'\n---\n# Sum rules\n## What it says\n"), "{note}");
    assert_eq!(replies[3]["result"]["isError"], true, "the same path again is refused");
    assert!(text(3).contains("already exists"), "{}", text(3));
    assert_eq!(std::fs::read_to_string(d.path().join("notes/papers/Sum rules.md")).unwrap(), note, "and the note is untouched");
    assert_eq!(replies[4]["result"]["isError"], true, "fields must be an object");
    assert!(!d.path().join("notes/x.md").exists());
}

#[test]
fn a_plugins_word_to_agents_is_in_the_instructions_while_it_is_on() {
    let d = tempfile::tempdir().unwrap();
    for (id, words) in [("remote", "For a command on a host, use remote_run, never ssh in your own shell."), ("quiet", "Never shown: switched off.")] {
        std::fs::create_dir_all(d.path().join(format!(".atlas/plugins/{id}"))).unwrap();
        std::fs::write(d.path().join(format!(".atlas/plugins/{id}/plugin.toml")), format!("title = \"{id}\"\nfor_agents = \"{words}\"\n")).unwrap();
    }
    std::fs::write(d.path().join(".atlas/config.toml"), "[plugins]\noff = [\"quiet\"]\n").unwrap();
    let init = json!({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}}});
    let text = session(d.path(), &[init])[0]["result"]["instructions"].as_str().unwrap().to_string();
    assert!(text.contains("- [plugin remote] For a command on a host, use remote_run, never ssh in your own shell."), "{text}");
    assert!(!text.contains("Never shown"), "{text}");
}
