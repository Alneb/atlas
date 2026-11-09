//! `atlas mcp`: a stdio MCP server so Claude Code drives Atlas with the same commands as the user.
//! Hand-rolled JSON-RPC (tools only) — small enough that an SDK dependency would cost more than it saves.
use crate::Server;
use anyhow::{anyhow, Result};
use atlas_core::{commands, notes, plugin_tools, search, today, Workspace};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

const PROTOCOL: &str = "2025-06-18";
const INSTRUCTIONS: &str = "Atlas is the user's workspace app. Use these tools BEFORE touching the vault's files directly: \
search with atlas_search, create notes with atlas_new_note, read mail with email_*, run the vault's commands with atlas_run — \
a tool keeps the vault's templates, properties, indexes and the open editors right; edit a file directly only for what no tool does. \
Use atlas_context to see the file/selection they are looking at, atlas_open to show them a file, atlas_notify when a long task finishes. \
To create a note, use atlas_new_note with a template from atlas_templates rather than writing the file yourself: the note then has the properties the vault's templates define. \
Tools marked [plugin x] come from the vault's plugins and run in the same helper the user's Atlas window uses (a signed-in \
mailbox, an ssh connection the user already logged in to): prefer them to doing the same thing yourself.";

/// The instructions, with what each switched-on plugin tells agents (`for_agents` in its plugin.toml).
fn instructions(ws: &Workspace) -> String {
    let words = ws.config().map(|cfg| plugin_tools::guidance(ws.root(), &cfg)).unwrap_or_default();
    let mut out = INSTRUCTIONS.to_string();
    if !words.is_empty() {
        out.push_str("\n\nFrom the vault's plugins:");
        for (id, text) in words {
            out.push_str(&format!("\n- [plugin {id}] {text}"));
        }
    }
    out
}

/// The built-in tools, then every switched-on plugin's `[[tool]]` (plugin_tools.rs).
fn tools(ws: &Workspace) -> Value {
    let mut all = builtin_tools();
    let plugins = ws.config().map(|cfg| plugin_tools::list(ws.root(), &cfg)).unwrap_or_default();
    if let Some(a) = all.as_array_mut() {
        a.extend(plugins.iter().map(|t| json!({"name": t.mcp_name(), "description": format!("[plugin {}] {}", t.plugin, t.description), "inputSchema": t.schema})));
    }
    all
}

fn builtin_tools() -> Value {
    let s = |props: Value, req: &[&str]| json!({"type": "object", "properties": props, "required": req});
    json!([
        {"name": "atlas_context", "description": "What the user is looking at in Atlas right now: active pane, open panes, and the current editor selection (path, 1-based lines, text). Needs the Atlas window.", "inputSchema": s(json!({}), &[])},
        {"name": "atlas_open", "description": "Open a workspace file in the user's Atlas window, optionally at a line. Use it to show the user what you changed or found.", "inputSchema": s(json!({"path": {"type": "string", "description": "workspace-relative"}, "line": {"type": "integer"}}), &["path"])},
        {"name": "atlas_notify", "description": "Show a toast in the Atlas window (e.g. a long job finished).", "inputSchema": s(json!({"title": {"type": "string"}, "body": {"type": "string"}}), &["title"])},
        {"name": "atlas_capture", "description": "Append a timestamped line to today's log (the user's capture inbox). Only when the user asks.", "inputSchema": s(json!({"text": {"type": "string"}}), &["text"])},
        {"name": "atlas_today", "description": "Today's focus file, log, open tasks and recent activity (commits, changed files).", "inputSchema": s(json!({}), &[])},
        {"name": "atlas_tasks", "description": "The vault's tasks (Markdown `- [ ]` lines in every note, the Obsidian Tasks plugin's fields read): each one's path, line, text, title, due/scheduled/start dates, priority, tags. Open ones by default.", "inputSchema": s(json!({
            "status": {"type": "string", "enum": ["open", "done", "all"], "description": "default: open"},
            "query": {"type": "string", "description": "words the task must contain (case-insensitive), e.g. a #tag or a name"},
            "due_by": {"type": "string", "description": "YYYY-MM-DD: only tasks due (or scheduled) on or before that day"},
            "limit": {"type": "integer", "description": "default 200"}
        }), &[])},
        {"name": "atlas_task_done", "description": "Tick one task as done, as the user's checkbox does (the Tasks plugin's ✅ date; a recurring task gets its next occurrence). Give path, line and text as atlas_tasks listed them; a line that changed since is refused. To add a task, use atlas_capture with `[] text @date`.", "inputSchema": s(json!({
            "path": {"type": "string"}, "line": {"type": "integer", "description": "1-based, from atlas_tasks"}, "text": {"type": "string", "description": "the task's text from atlas_tasks"}
        }), &["path", "line", "text"])},
        {"name": "atlas_search", "description": "Search workspace file names and contents (ripgrep, honors the Atlas ignore list).", "inputSchema": s(json!({"query": {"type": "string"}}), &["query"])},
        {"name": "atlas_commands", "description": "List Atlas commands (built-ins and the workspace's .atlas/commands scripts).", "inputSchema": s(json!({}), &[])},
        {"name": "atlas_run", "description": "Run an Atlas command by id with JSON args (see atlas_commands).", "inputSchema": s(json!({"id": {"type": "string"}, "args": {"type": "object"}}), &["id"])},
        {"name": "atlas_templates", "description": "The vault's note templates (what atlas_new_note takes): each one's name, the folder its notes are filed in, the properties its frontmatter defines, and the questions it asks (`prompts`, answered through atlas_new_note's `fields`).", "inputSchema": s(json!({}), &[])},
        {"name": "atlas_new_note", "description": "Create a note from one of the vault's templates (see atlas_templates), the way the user's \"New note from a template\" does: its {{…}} filled in (docs/guides/TEMPLATES.md: dates, values, prompts, includes, if/each), the template's properties there, `fields` set (they also answer its {{prompt:…}} questions). Prefer this to writing a new note by hand. Refuses a path that exists (never overwrites); returns the path, the caret line, and `added`: fields the template does not define.", "inputSchema": s(json!({
            "path": {"type": "string", "description": "workspace-relative file path, e.g. notes/physics/Mott.md (.md added when missing); use the template's folder unless the user said otherwise"},
            "template": {"type": "string", "description": "a template name from atlas_templates; without it the note starts empty"},
            "title": {"type": "string", "description": "{{title}} in the template; default: the file name"},
            "fields": {"type": "object", "description": "properties to set: {name: text | number | boolean | list | null}", "additionalProperties": true},
            "text": {"type": "string", "description": "the body, appended after the template's text"}
        }), &["path"])},
    ])
}

async fn call(ws: &Workspace, local: &atlas_core::helper::Helpers, server: Option<&Server>, name: &str, a: &Value) -> Result<Value> {
    let need = || server.ok_or_else(|| anyhow!("the Atlas window is not running for {}", ws.root().display()));
    let str_arg = |k: &str| a[k].as_str().map(str::to_owned).ok_or_else(|| anyhow!("missing argument `{k}`"));
    Ok(match name {
        "atlas_context" => need()?.get("/api/ui/state").await?,
        "atlas_open" => need()?.cmd("open", json!({"path": str_arg("path")?, "line": a.get("line")})).await?,
        "atlas_notify" => need()?.cmd("notify", json!({"title": str_arg("title")?, "body": a.get("body")})).await?,
        "atlas_capture" => run(ws, server, "capture", json!({"text": str_arg("text")?})).await?,
        "atlas_today" => match server {
            Some(s) => s.get("/api/today").await?,
            None => serde_json::to_value(today::today(ws.root(), &ws.config()?)?)?,
        },
        "atlas_tasks" => tasks_listed(ws, a)?,
        "atlas_task_done" => {
            let line = a["line"].as_u64().and_then(|l| u32::try_from(l).ok()).ok_or_else(|| anyhow!("missing argument `line`"))?;
            let t = atlas_core::api::TaskRef { path: str_arg("path")?, line, text: Some(str_arg("text")?) };
            match server {
                Some(s) => s.post("/api/task/tick", &serde_json::to_value(&t)?, std::time::Duration::from_secs(30)).await?,
                None => {
                    today::tick_ref(ws, &t)?;
                    json!({})
                }
            }
        }
        "atlas_search" => serde_json::to_value(search::search(ws.root(), &ws.config()?, &str_arg("query")?))?,
        "atlas_commands" => serde_json::to_value(commands::list(ws.root()))?,
        "atlas_run" => run(ws, server, &str_arg("id")?, a.get("args").cloned().unwrap_or(json!({}))).await?,
        "atlas_templates" => serde_json::to_value(notes::templates(ws.root(), &ws.config()?)?)?,
        "atlas_new_note" => {
            let fields = match a.get("fields") {
                None | Some(Value::Null) => Default::default(),
                Some(Value::Object(m)) => m.clone(),
                Some(_) => return Err(anyhow!("`fields` is an object: {{property: value}}")),
            };
            let path = str_arg("path")?;
            let req = notes::NoteFile { path: &path, template: a["template"].as_str(), title: a["title"].as_str(), fields, text: a["text"].as_str() };
            serde_json::to_value(notes::new_note_file(ws.root(), &ws.config()?, &req)?)?
        }
        other => return plugin_tool(ws, local, server, other, a).await,
    })
}

/// `atlas_tasks`: the vault's tasks, read from the files (the same scan as Home's), filtered as asked.
fn tasks_listed(ws: &Workspace, a: &Value) -> Result<Value> {
    let status = a["status"].as_str().unwrap_or("open");
    let words: Vec<String> = a["query"].as_str().unwrap_or("").to_lowercase().split_whitespace().map(String::from).collect();
    let by = match a["due_by"].as_str() {
        Some(d) => Some(chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").map_err(|_| anyhow!("`due_by` is YYYY-MM-DD"))?),
        None => None,
    };
    let limit = a["limit"].as_u64().unwrap_or(200) as usize;
    let out: Vec<Value> = today::all_tasks(ws.root(), &ws.config()?)
        .into_iter()
        .filter(|(_, done)| match status {
            "done" => *done,
            "all" => true,
            _ => !*done,
        })
        .filter(|(h, _)| {
            let low = h.text.to_lowercase();
            words.iter().all(|w| low.contains(w.as_str()))
        })
        .map(|(h, done)| (atlas_core::tasks::parse(&h.text), h, done))
        .filter(|(t, _, _)| by.is_none_or(|by| t.due.or(t.scheduled).is_some_and(|d| d <= by)))
        .take(limit)
        .map(|(t, h, done)| {
            let day = |d: Option<chrono::NaiveDate>| d.map(|d| d.to_string());
            json!({ "path": h.path, "line": h.line, "text": h.text, "done": done, "title": t.title, "due": day(t.due), "scheduled": day(t.scheduled),
                    "start": day(t.start), "priority": format!("{:?}", t.priority).to_lowercase(), "tags": t.tags, "recurrence": t.recurrence })
        })
        .collect();
    Ok(json!({ "tasks": out }))
}

/// A plugin's tool: in the window's helper when the window is open (the session the user sees),
/// else in this process's own helper, which lives as long as the agent's MCP connection.
async fn plugin_tool(ws: &Workspace, local: &atlas_core::helper::Helpers, server: Option<&Server>, name: &str, a: &Value) -> Result<Value> {
    let cfg = ws.config()?;
    let t = plugin_tools::list(ws.root(), &cfg).into_iter().find(|t| t.mcp_name() == name).ok_or_else(|| anyhow!("unknown tool {name}"))?;
    let args = if a.is_null() { json!({}) } else { a.clone() };
    match server {
        // the tool's own timeout, plus a margin so the core's timeout error arrives before ours
        Some(s) => s.post(&format!("/api/plugins/{}/tools/{}", t.plugin, t.name), &args, t.timeout + std::time::Duration::from_secs(5)).await,
        None => {
            let store = atlas_core::secrets::Store::for_vault(ws.root());
            Ok(plugin_tools::call(ws.root(), &cfg, local, &store, &t.plugin, &t.name, args).await?)
        }
    }
}

/// Through the live server when there is one (so the UI updates), else locally.
async fn run(ws: &Workspace, server: Option<&Server>, id: &str, args: Value) -> Result<Value> {
    match server {
        Some(s) => s.cmd(id, args).await,
        None => {
            let bus = atlas_core::events::EventBus::default();
            Ok(commands::run(ws, &bus, commands::Command::resolve(ws.root(), id, args)?).await?)
        }
    }
}

async fn handle(ws: &Workspace, local: &atlas_core::helper::Helpers, msg: &Value) -> Option<Value> {
    let id = msg.get("id")?.clone(); // notifications (no id) get no reply
    let result = match msg["method"].as_str().unwrap_or("") {
        "initialize" => Ok(json!({
            "protocolVersion": msg["params"]["protocolVersion"].as_str().unwrap_or(PROTOCOL),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "atlas", "version": env!("CARGO_PKG_VERSION")},
            "instructions": instructions(ws)
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({"tools": tools(ws)})),
        "tools/call" => {
            let p = &msg["params"];
            // Re-discover per call: the window may have been opened or closed since the last one.
            let server = Server::find(ws).await;
            let out = call(ws, local, server.as_ref(), p["name"].as_str().unwrap_or(""), &p["arguments"]).await;
            Ok(match out {
                Ok(v) => json!({"content": [{"type": "text", "text": serde_json::to_string_pretty(&v).unwrap_or_default()}]}),
                Err(e) => json!({"content": [{"type": "text", "text": e.to_string()}], "isError": true}),
            })
        }
        m => Err(json!({"code": -32601, "message": format!("method not found: {m}")})),
    };
    Some(match result {
        Ok(r) => json!({"jsonrpc": "2.0", "id": id, "result": r}),
        Err(e) => json!({"jsonrpc": "2.0", "id": id, "error": e}),
    })
}

pub async fn serve(ws: Workspace) -> Result<()> {
    let _ = crate::CLIENT.set("mcp");
    // a core that keeps this agent out (agents off on a server, a locked desktop without this agent's token) says so
    // at once — never a quiet fallback to the files behind the user's back
    if let crate::Reach::Refused(why) = Server::reach(&ws).await {
        anyhow::bail!("the Atlas serving this vault turned this agent away: {why}");
    }
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    let mut out = tokio::io::stdout();
    let local = atlas_core::helper::Helpers::new(ws.root(), atlas_core::events::EventBus::default());
    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(msg) => handle(&ws, &local, &msg).await,
            Err(e) => Some(json!({"jsonrpc": "2.0", "id": null, "error": {"code": -32700, "message": e.to_string()}})),
        };
        if let Some(r) = reply {
            out.write_all(format!("{r}\n").as_bytes()).await?;
            out.flush().await?;
        }
    }
    Ok(())
}
