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
What the user does with a key or the command palette, atlas_ui_command does (atlas_ui_commands lists them); a command that \
deletes or sends still asks the user in the window. Read the vault's structure with atlas_backlinks, atlas_tags, atlas_properties, \
atlas_base and atlas_view (the same queries its Bases and view blocks run); set a note's property with atlas_set_property. \
Move or rename a file with atlas_move (its links follow; never `mv`); file the user's captures with atlas_captures and atlas_triage; \
read the settings with atlas_settings; see what the user missed with atlas_notices. \
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
            "path": {"type": "string"}, "line": {"type": "integer", "description": "1-based, from atlas_tasks"}, "text": {"type": "string", "description": "the task's text from atlas_tasks"},
            "block": {"type": "string", "description": "the task's block id from atlas_tasks, when it has one: found by it even after its line moved"}
        }), &["path", "line", "text"])},
        {"name": "atlas_search", "description": "Search workspace file names and contents (ripgrep, honors the Atlas ignore list).", "inputSchema": s(json!({"query": {"type": "string"}}), &["query"])},
        {"name": "atlas_commands", "description": "List Atlas commands (built-ins and the workspace's .atlas/commands scripts).", "inputSchema": s(json!({}), &[])},
        {"name": "atlas_run", "description": "Run an Atlas command by id with JSON args (see atlas_commands).", "inputSchema": s(json!({"id": {"type": "string"}, "args": {"type": "object"}}), &["id"])},
        {"name": "atlas_templates", "description": "The vault's note templates (what atlas_new_note takes): each one's name, the folder its notes are filed in, the properties its frontmatter defines, and the questions it asks (`prompts`, answered through atlas_new_note's `fields`).", "inputSchema": s(json!({}), &[])},
        {"name": "atlas_ui_commands", "description": "The commands of the user's Atlas window — the command palette's: the app's (`ui.*`) and the plugins' (`plugin.<id>.<command>`), each id and title. Run one with atlas_ui_command. Needs the Atlas window.", "inputSchema": s(json!({"query": {"type": "string", "description": "words the title or id must contain (case-insensitive)"}}), &[])},
        {"name": "atlas_ui_command", "description": "Run one of the window's commands by id (from atlas_ui_commands), as the user's key or the palette would: open a pane, toggle a panel, start a plugin's dialog. It acts on what the user is looking at (atlas_context). A command that deletes, sends or asks something shows its question to the user in the window; you cannot answer it. Only when the user asked for what it does. Needs the Atlas window.", "inputSchema": s(json!({"id": {"type": "string"}}), &["id"])},
        {"name": "atlas_backlinks", "description": "The notes that link to a note (wikilinks and Markdown links), each with the lines that link, and its unlinked mentions.", "inputSchema": s(json!({"path": {"type": "string", "description": "workspace-relative note path"}}), &["path"])},
        {"name": "atlas_tags", "description": "Every #tag of the vault's notes (inline and in properties) with how many notes use it.", "inputSchema": s(json!({}), &[])},
        {"name": "atlas_properties", "description": "The properties the vault's notes use (frontmatter keys), each with its type and commonest values: which names and values to use with atlas_set_property or atlas_new_note's fields.", "inputSchema": s(json!({}), &[])},
        {"name": "atlas_set_property", "description": "Set one property in a note's frontmatter (made when missing), as the properties panel does; open editors follow. `value` is text, a number, a boolean, a list, or null (the key left empty). Only when the user asked for this change.", "inputSchema": s(json!({
            "path": {"type": "string", "description": "workspace-relative .md note"}, "key": {"type": "string"}, "value": {"description": "text | number | boolean | list | null"}
        }), &["path", "key", "value"])},
        {"name": "atlas_base", "description": "Run a Bases query (Obsidian's .base format: filters, formulas, views) as the vault's Base panes do: the rows (each note's path and its columns) of each view. Give the path of a .base file, or its YAML text in `src`.", "inputSchema": s(json!({
            "path": {"type": "string", "description": "a .base file"}, "src": {"type": "string", "description": "the base's YAML, instead of a file"},
            "this": {"type": "string", "description": "the note it is embedded in (its `this.file`)"}
        }), &[])},
        {"name": "atlas_view", "description": "Run a ```view block (the vault's views: tasks, notes, deadlines, a plugin's rows such as `from: plugin:dav/events`) as a note shows it: its rows. `src` is the block's text, `path` the note it lives in.", "inputSchema": s(json!({"src": {"type": "string"}, "path": {"type": "string", "description": "the note the block is in (relative paths and `this` resolve from it)"}}), &["src", "path"])},
        {"name": "atlas_captures", "description": "What was captured (the capture box, the phone, the share sheet): each capture with its text, where it was written and whether it is triaged yet.", "inputSchema": s(json!({}), &[])},
        {"name": "atlas_triage", "description": "Triage one capture from atlas_captures, as the Captures block's buttons do: `task` (an open task), `done`, `dismiss`, `reopen`, `file` (its text added to the note `note`, made when missing, and the capture linked to it), `link` (linked to the existing note `note`, not copied), `delete` (taken out of the log; kept in .atlas/trash/). Give path, line and source exactly as atlas_captures listed them: a line edited since is refused. Only when the user asked; `delete` only when they asked for that capture to go.", "inputSchema": s(json!({
            "path": {"type": "string"}, "line": {"type": "integer", "description": "from atlas_captures (0 for a note of the inbox)"},
            "source": {"type": "string", "description": "the capture's `source` from atlas_captures"},
            "action": {"type": "string", "enum": ["task", "done", "dismiss", "reopen", "file", "link", "delete"]},
            "note": {"type": "string", "description": "for file and link: the note's vault path"}
        }), &["path", "line", "action"])},
        {"name": "atlas_move", "description": "Move or rename a file or folder in the vault as the file explorer does: every [[wikilink]] and Markdown link to it (and a moved note's own relative links) rewritten for its new place. Never replaces anything: a `to` that exists is refused. Use it instead of `mv`, which breaks the links. Only when the user asked.", "inputSchema": s(json!({
            "from": {"type": "string", "description": "workspace-relative"}, "to": {"type": "string", "description": "workspace-relative, the new path itself (not a folder to move into)"}
        }), &["from", "to"])},
        {"name": "atlas_settings", "description": "The vault's settings as Atlas reads them (.atlas/config.toml merged with the defaults; no secrets live there). Read-only: a change is the user's, in Settings (atlas_ui_command can open it).", "inputSchema": s(json!({"section": {"type": "string", "description": "one top-level key (e.g. editor, notifications); default: all"}}), &[])},
        {"name": "atlas_notices", "description": "The notices (toasts, system notifications) that came while the user was not looking at Atlas and that they have not seen since, newest first: title, body, source, id, subject, the note it opens. Needs Atlas running.", "inputSchema": s(json!({}), &[])},
        {"name": "atlas_notice_withdraw", "description": "Take notices away (the system's notification, the tray's list, the toasts) because they are no longer news: by a notice's `id` or its `subject` from atlas_notices (a subject takes every notice about that thing). Only when the user asked, or the thing it announced is done. Needs Atlas running.", "inputSchema": s(json!({"id": {"type": "string", "description": "a notice's id or subject"}}), &["id"])},
        {"name": "atlas_activity", "description": "One day's activity in the vault: the notes and files made or changed, the commits. Default: today.", "inputSchema": s(json!({"day": {"type": "string", "description": "YYYY-MM-DD"}}), &[])},
        {"name": "atlas_sync", "description": "The vault's sync state in plain words (Syncthing, the mirror, git) and the conflict copies left to settle.", "inputSchema": s(json!({}), &[])},
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
        "atlas_context" => {
            let mut state = need()?.get("/api/ui/state").await?;
            if let Some(m) = state.as_object_mut() {
                m.remove("commands"); // atlas_ui_commands lists them
            }
            state
        }
        "atlas_ui_commands" => ui_commands(need()?, a["query"].as_str()).await?,
        "atlas_ui_command" => {
            let (s, id) = (need()?, str_arg("id")?);
            // a window that lists its commands refuses one it does not have (a guessed id), saying so
            if let Some(list) = ui_commands(s, None).await.ok().and_then(|k| k["commands"].as_array().cloned()) {
                if !list.iter().any(|c| c["id"] == id.as_str()) {
                    return Err(anyhow!("the window has no command `{id}` (see atlas_ui_commands)"));
                }
            }
            s.cmd("palette", json!({"command": id})).await?
        }
        "atlas_backlinks" => serde_json::to_value(atlas_core::links::backlinks(ws.root(), &ws.config()?, &str_arg("path")?))?,
        "atlas_tags" => serde_json::to_value(atlas_core::tags::all(ws.root(), &ws.config()?))?,
        "atlas_properties" => serde_json::to_value(atlas_core::property_spec::known(ws.root(), &ws.config()?))?,
        "atlas_set_property" => {
            let e = atlas_core::api::PropertyEdit { path: str_arg("path")?, key: str_arg("key")?, text: String::new(), list: false, value: Some(a.get("value").cloned().unwrap_or(Value::Null)) };
            atlas_core::frontmatter::set_in_note(ws, &e)?;
            json!({"path": e.path, "key": e.key})
        }
        "atlas_base" => {
            let src = match (a["src"].as_str(), a["path"].as_str()) {
                (Some(src), _) => src.to_string(),
                (None, Some(p)) => std::fs::read_to_string(ws.resolve(p)?)?,
                (None, None) => return Err(anyhow!("give `path` (a .base file) or `src` (its YAML)")),
            };
            serde_json::to_value(atlas_core::bases::evaluate(ws.root(), &ws.config()?, &src, a["this"].as_str()))?
        }
        "atlas_view" => {
            let (src, path) = (str_arg("src")?, str_arg("path")?);
            // a plugin's rows run its tool: in the window's helper when it is open, else in this process's own
            match server {
                Some(s) => s.post("/api/view", &json!({"path": path, "src": src}), std::time::Duration::from_secs(60)).await?,
                None => match atlas_core::views::from_plugin(ws, local, &path, &src).await {
                    Some(r) => serde_json::to_value(r?)?,
                    None => serde_json::to_value(atlas_core::views::evaluate(ws, &path, &src)?)?,
                },
            }
        }
        "atlas_captures" => serde_json::to_value(atlas_core::captures::list(ws.root(), &ws.config()?))?,
        "atlas_triage" => {
            let req = triage_request(a)?;
            // through the window's server when it is open (its editors follow), else the same core function here
            match server {
                Some(s) => drop(s.post("/api/captures/triage", &serde_json::to_value(&req)?, std::time::Duration::from_secs(30)).await?),
                None => drop(atlas_core::captures::triage(ws.root(), &ws.config()?, &req, chrono::Local::now().naive_local())?),
            }
            json!({"path": req.path, "action": a["action"]})
        }
        "atlas_move" => {
            let (from, to) = (str_arg("from")?, str_arg("to")?);
            match server {
                Some(s) => s.post("/api/fs/move", &json!({"from": from, "to": to}), std::time::Duration::from_secs(60)).await?,
                None => {
                    let r = atlas_core::relink::move_with_links(ws, &from, &to)?;
                    json!({"links": r.links, "notes": r.notes})
                }
            }
        }
        "atlas_settings" => {
            let all = serde_json::to_value(ws.config()?)?;
            match a["section"].as_str() {
                None => json!({"path": atlas_core::config::CONFIG_FILE, "settings": all}),
                Some(k) => match all.get(k) {
                    Some(v) => json!({"path": atlas_core::config::CONFIG_FILE, "settings": {k: v}}),
                    None => return Err(anyhow!("no setting `{k}`; the sections are: {}", all.as_object().map(|m| m.keys().cloned().collect::<Vec<_>>().join(", ")).unwrap_or_default())),
                },
            }
        }
        "atlas_notices" => need()?.get("/api/notices").await?,
        "atlas_notice_withdraw" => {
            let id = str_arg("id")?;
            need()?.post("/api/notices/withdraw", &json!({"id": id}), std::time::Duration::from_secs(10)).await?;
            json!({"withdrawn": id})
        }
        "atlas_activity" => {
            let day = match a["day"].as_str() {
                Some(d) => chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").map_err(|_| anyhow!("`day` is YYYY-MM-DD"))?,
                None => chrono::Local::now().date_naive(),
            };
            serde_json::to_value(today::day_activity(ws.root(), &ws.config()?, day))?
        }
        "atlas_sync" => json!({
            "state": atlas_core::sync_state::status(ws.root()),
            "conflicts": atlas_core::sync_merge::left_copies(ws.root(), None),
        }),
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
            let t = atlas_core::api::TaskRef { path: str_arg("path")?, line, text: Some(str_arg("text")?), block: a["block"].as_str().map(str::to_string) };
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

/// `atlas_ui_commands`: the window's command list (it sends it with its state), filtered by words.
async fn ui_commands(s: &Server, query: Option<&str>) -> Result<Value> {
    let state = s.get("/api/ui/state").await?;
    let words: Vec<String> = query.unwrap_or("").to_lowercase().split_whitespace().map(String::from).collect();
    let all = state["commands"].as_array().cloned().ok_or_else(|| anyhow!("the window has not listed its commands (an Atlas window older than this tool: reload it)"))?;
    let hit = |c: &Value| {
        let hay = format!("{} {}", c["id"].as_str().unwrap_or(""), c["title"].as_str().unwrap_or("")).to_lowercase();
        words.iter().all(|w| hay.contains(w.as_str()))
    };
    Ok(json!({ "commands": all.into_iter().filter(hit).collect::<Vec<_>>() }))
}

/// `atlas_triage`'s arguments as the core's triage request (`action` + `note` → the tagged action).
fn triage_request(a: &Value) -> Result<atlas_core::api::TriageRequest> {
    use atlas_core::api::TriageAction;
    let path = a["path"].as_str().ok_or_else(|| anyhow!("missing argument `path`"))?.to_string();
    let line = a["line"].as_u64().and_then(|l| u32::try_from(l).ok()).ok_or_else(|| anyhow!("missing argument `line`"))?;
    let note = || a["note"].as_str().filter(|n| !n.trim().is_empty()).map(str::to_string).ok_or_else(|| anyhow!("`file` and `link` need `note`, the note's vault path"));
    let action = match a["action"].as_str().unwrap_or("") {
        "task" => TriageAction::Task,
        "done" => TriageAction::Done,
        "dismiss" => TriageAction::Dismiss,
        "reopen" => TriageAction::Reopen,
        "file" => TriageAction::File { note: note()? },
        "link" => TriageAction::Link { note: note()? },
        "delete" => TriageAction::Delete,
        other => return Err(anyhow!("unknown action `{other}`: task, done, dismiss, reopen, file, link or delete")),
    };
    // a log's line is written only while it is still what was read (`source`); a note of the inbox (line 0) has none
    let source = match (line, a["source"].as_str()) {
        (0, s) => s.unwrap_or("").to_string(),
        (_, Some(s)) => s.to_string(),
        (_, None) => return Err(anyhow!("missing argument `source`: the capture's line as atlas_captures listed it")),
    };
    Ok(atlas_core::api::TriageRequest { path, line, source, action })
}

/// `atlas_tasks`: the vault's tasks as `GET /api/tasks` lists them (`today::listed`), filtered as asked.
fn tasks_listed(ws: &Workspace, a: &Value) -> Result<Value> {
    let status = match a["status"].as_str() {
        Some("done") => today::Status::Done,
        Some("all") => today::Status::All,
        _ => today::Status::Open,
    };
    let words: Vec<String> = a["query"].as_str().unwrap_or("").to_lowercase().split_whitespace().map(String::from).collect();
    let by = match a["due_by"].as_str() {
        Some(d) => Some(chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").map_err(|_| anyhow!("`due_by` is YYYY-MM-DD"))?.to_string()),
        None => None,
    };
    let limit = a["limit"].as_u64().unwrap_or(200) as usize;
    let out: Vec<today::Listed> = today::listed(ws.root(), &ws.config()?, status)
        .into_iter()
        .filter(|t| {
            let low = t.text.to_lowercase();
            words.iter().all(|w| low.contains(w.as_str()))
        })
        // `YYYY-MM-DD` compares as text
        .filter(|t| by.as_ref().is_none_or(|by| t.due.as_ref().or(t.scheduled.as_ref()).is_some_and(|d| d <= by)))
        .take(limit)
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
