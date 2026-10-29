//! Plugin tools: a plugin's helper methods offered to agents. `[[tool]]` in `plugin.toml` names a
//! method of its `[helper]`; `atlas mcp` lists every switched-on plugin's tools as MCP tools, and a
//! call runs in the same helper the page talks to (the window's, when it is open), so a session a
//! helper keeps — an ssh shell, a signed-in mailbox — is shared by the user's page and the agent.
//!
//! A call's params are one shape for the page and for agents: the tool's arguments, plus
//! `settings` (the plugin's, defaults filled in) and `secrets` (those the tool names). A helper may
//! answer with `"_secrets": {name: value}` to keep a value it obtained (a refreshed sign-in token):
//! the core stores it in the secret store and removes it from the answer.
use crate::config::Config;
use crate::helper::Helpers;
use crate::secrets::Store;
use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::path::Path;
use std::time::Duration;

/// `[[tool]]`.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ToolManifest {
    /// letters, digits and `_`; the MCP name is `<plugin>_<name>`
    pub name: String,
    /// What it does and when to use it — the agent reads only this.
    pub description: String,
    /// The helper method (default: the name).
    #[serde(default)]
    method: Option<String>,
    /// `key = "string"` (`"integer"`, `"number"`, `"boolean"`, `"array"`; a trailing `?` = optional),
    /// or `key = { type = "string", description = "…", optional = true }`.
    #[serde(default)]
    input: toml::Table,
    /// Secrets handed to the helper with each call (needs `[permissions] secrets = true`); `"*"` = all.
    #[serde(default)]
    secrets: Vec<String>,
    #[serde(default)]
    timeout_secs: Option<u64>,
    /// Called with `{}` on this schedule while the vault is served (`every 1h`, `daily 03:00`; schedule.rs): a sync.
    #[serde(default)]
    pub schedule: Option<String>,
    /// The template value it provides: `template = "weather"` answers `{{weather.…}}` in a note made from a template,
    /// called with `{ title }` just before (template_values.rs). Its answer is the value (an object, a list, text).
    #[serde(default)]
    pub template: Option<String>,
    /// `"capture"`: called with `{ text, path, line }` after every capture, from any door; `"log"`: today's log made;
    /// `"fs"`: `{ paths }` of files that changed (capture_hooks.rs).
    #[serde(default)]
    pub on: Option<String>,
}

/// The `for_agents` words of the plugins that can run here: (plugin, text), by id.
pub fn guidance(root: &Path, cfg: &Config) -> Vec<(String, String)> {
    let all = crate::plugins::list(root);
    all.iter()
        .filter(|p| crate::plugins::blocked(&all, &cfg.plugins.off, &p.id).is_none())
        .filter_map(|p| crate::plugins::for_agents(root, &p.id).map(|t| (p.id.clone(), t.trim().to_string())))
        .collect()
}

/// Every tool of the plugins that can run here: (plugin, tool).
fn runnable(root: &Path, cfg: &Config) -> Vec<(String, ToolManifest)> {
    let all = crate::plugins::list(root);
    let mut out = Vec::new();
    for p in &all {
        if crate::plugins::blocked(&all, &cfg.plugins.off, &p.id).is_some() {
            continue;
        }
        let Ok((tools, _, _)) = crate::plugins::tool_parts(root, &p.id) else { continue };
        out.extend(tools.into_iter().map(|t| (p.id.clone(), t)));
    }
    out
}

/// The tools of the plugins that can run here which act on `event` (`on = "capture"`): (plugin, tool).
pub fn listening(root: &Path, cfg: &Config, event: &str) -> Vec<(String, String)> {
    runnable(root, cfg).into_iter().filter(|(_, t)| t.on.as_deref() == Some(event)).map(|(p, t)| (p, t.name)).collect()
}

/// The tools that provide a template value (`template = "weather"`): (plugin, tool, value name).
pub fn providers(root: &Path, cfg: &Config) -> Vec<(String, String, String)> {
    runnable(root, cfg).into_iter().filter_map(|(p, t)| t.template.clone().map(|name| (p, t.name, name))).collect()
}

/// A plugin tool the scheduler runs: its plugin, its name, its schedule.
#[derive(Debug, Clone, PartialEq)]
pub struct Scheduled {
    pub plugin: String,
    pub tool: String,
    pub schedule: String,
}

/// Every scheduled tool of the plugins that can run in this vault (switched on, nothing they need missing).
pub fn scheduled(root: &Path, cfg: &Config) -> Vec<Scheduled> {
    let all = crate::plugins::list(root);
    let mut out = Vec::new();
    for p in &all {
        if crate::plugins::blocked(&all, &cfg.plugins.off, &p.id).is_some() {
            continue;
        }
        let Ok((tools, _, _)) = crate::plugins::tool_parts(root, &p.id) else { continue };
        out.extend(tools.into_iter().filter_map(|t| Some(Scheduled { plugin: p.id.clone(), schedule: t.schedule?, tool: t.name })));
    }
    out
}

/// A tool as listed for an agent.
#[derive(Debug, Clone, Serialize)]
pub struct Tool {
    pub plugin: String,
    pub name: String,
    pub description: String,
    /// JSON Schema of the arguments.
    pub schema: Value,
    /// How long a call may take (`timeout_secs`, else the helper default): a caller waits this long.
    #[serde(skip)]
    pub timeout: Duration,
}

impl Tool {
    /// The MCP tool name: `<plugin>_<tool>` with anything outside `[A-Za-z0-9_]` as `_`.
    pub fn mcp_name(&self) -> String {
        format!("{}_{}", self.plugin, self.name).chars().map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' }).collect()
    }
}

const TYPES: [&str; 5] = ["string", "integer", "number", "boolean", "array"];

fn schema(input: &toml::Table) -> std::result::Result<Value, String> {
    let (mut props, mut required) = (Map::new(), vec![]);
    for (key, spec) in input {
        let (ty, description, optional) = match spec {
            toml::Value::String(s) => (s.trim_end_matches('?').to_string(), None, s.ends_with('?')),
            toml::Value::Table(t) => (
                t.get("type").and_then(|v| v.as_str()).unwrap_or("string").to_string(),
                t.get("description").and_then(|v| v.as_str()).map(str::to_string),
                t.get("optional").and_then(|v| v.as_bool()).unwrap_or(false),
            ),
            _ => return Err(format!("input.{key}: a type name or a table")),
        };
        if !TYPES.contains(&ty.as_str()) {
            return Err(format!("input.{key}: {ty:?} is not one of {TYPES:?}"));
        }
        let mut p = json!({ "type": ty });
        if ty == "array" {
            p["items"] = json!({ "type": "string" });
        }
        if let Some(d) = description {
            p["description"] = json!(d);
        }
        props.insert(key.clone(), p);
        if !optional {
            required.push(key.clone());
        }
    }
    Ok(json!({ "type": "object", "properties": props, "required": required }))
}

/// How long a call of `t` may run: its `timeout_secs`, else the helper's default.
fn timeout_of(t: &ToolManifest) -> Duration {
    t.timeout_secs.map(Duration::from_secs).unwrap_or(crate::helper::CALL_TIMEOUT)
}

/// Every tool of the switched-on plugins that have a helper. A plugin whose manifest is broken is
/// left out (Settings shows why); a tool with a bad `input` is left out with the reason logged.
pub fn list(root: &Path, cfg: &Config) -> Vec<Tool> {
    let mut out = vec![];
    let all = crate::plugins::list(root);
    for p in &all {
        if !p.has_helper || crate::plugins::blocked(&all, &cfg.plugins.off, &p.id).is_some() {
            continue;
        }
        let Ok((tools, _, _)) = crate::plugins::tool_parts(root, &p.id) else { continue };
        for t in tools {
            match schema(&t.input) {
                Ok(schema) => out.push(Tool { plugin: p.id.clone(), timeout: timeout_of(&t), name: t.name, description: t.description, schema }),
                Err(e) => eprintln!("plugin {}: tool {}: {e}", p.id, t.name),
            }
        }
    }
    out
}

/// Runs tool `name` of plugin `id` with the agent's `args`.
pub async fn call(root: &Path, cfg: &Config, helpers: &Helpers, secrets: &Store, id: &str, name: &str, args: Value) -> Result<Value> {
    if let Some(why) = crate::plugins::blocked(&crate::plugins::list(root), &cfg.plugins.off, id) {
        return Err(Error::BadRequest(format!("plugin {id} cannot run: {why}")));
    }
    let (tools, perms, settings) = crate::plugins::tool_parts(root, id)?;
    let tool = tools.into_iter().find(|t| t.name == name).ok_or_else(|| Error::NotFound(format!("plugin {id} has no tool {name}")))?;
    let mut params = match args {
        Value::Object(m) => m,
        Value::Null => Map::new(),
        _ => return Err(Error::BadRequest("a tool's arguments are an object".into())),
    };
    params.insert("settings".into(), serde_json::to_value(settings).unwrap_or(Value::Null));
    let mut given = Map::new();
    if !tool.secrets.is_empty() {
        if !perms.secrets {
            return Err(Error::BadRequest(format!("plugin {id}: tool {name} names secrets, but [permissions] secrets is not true")));
        }
        // `"*"`: every secret of the plugin (names that vary, such as one password per account)
        let names = if tool.secrets.iter().any(|s| s == "*") { secrets.names(id)? } else { tool.secrets.clone() };
        for s in &names {
            if let Some(v) = secrets.get(id, s)? {
                given.insert(s.clone(), Value::String(v));
            }
        }
    }
    params.insert("secrets".into(), Value::Object(given));
    let answer = helpers.call(id, tool.method.as_deref().unwrap_or(&tool.name), Value::Object(params), timeout_of(&tool)).await?;
    keep_secrets(secrets, id, perms.secrets, answer)
}

/// A page's helper call as a tool's gets it: refused while the plugin is off or blocked; `params.settings` the plugin's
/// (defaults filled in) unless the page sent its own; `params.secrets` every one it keeps, when it may keep secrets (a
/// page's own `secrets` field is replaced, never trusted). Non-object params are passed as they are.
pub fn page_call_params(root: &Path, cfg: &Config, secrets: &Store, id: &str, params: Value) -> Result<Value> {
    if let Some(why) = crate::plugins::blocked(&crate::plugins::list(root), &cfg.plugins.off, id) {
        return Err(Error::BadRequest(format!("plugin {id} cannot run: {why}")));
    }
    let params = if params.is_null() { Value::Object(Map::new()) } else { params };
    let Value::Object(mut m) = params else { return Ok(params) };
    if !m.contains_key("settings") {
        let (_, _, settings) = crate::plugins::tool_parts(root, id)?;
        m.insert("settings".into(), serde_json::to_value(settings).unwrap_or(Value::Null));
    }
    let mut given = Map::new();
    if crate::plugins::permissions(root, id)?.secrets {
        for s in secrets.names(id)? {
            if let Some(v) = secrets.get(id, &s)? {
                given.insert(s, Value::String(v));
            }
        }
    }
    m.insert("secrets".into(), Value::Object(given));
    Ok(Value::Object(m))
}

/// Stores the `_secrets` of a helper's answer (when the plugin may keep secrets) and returns the
/// answer without them — they never reach the page or the agent.
pub fn keep_secrets(secrets: &Store, id: &str, allowed: bool, mut answer: Value) -> Result<Value> {
    if let Some(Value::Object(kept)) = answer.as_object_mut().and_then(|m| m.remove("_secrets")) {
        if !allowed {
            return Err(Error::BadRequest(format!("plugin {id}: its helper returned secrets, but [permissions] secrets is not true")));
        }
        for (k, v) in kept {
            match v.as_str() {
                Some(v) if !v.is_empty() => secrets.set(id, &k, v)?,
                _ => {
                    secrets.delete(id, &k)?;
                }
            }
        }
    }
    Ok(answer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_becomes_a_json_schema_with_optional_keys_left_out_of_required() {
        let t: toml::Table = toml::from_str("host = \"string\"\nlimit = \"integer?\"\nq = { type = \"string\", description = \"what\", optional = true }").unwrap();
        let s = schema(&t).unwrap();
        assert_eq!(s["required"], json!(["host"]));
        assert_eq!(s["properties"]["limit"]["type"], "integer");
        assert_eq!(s["properties"]["q"]["description"], "what");
        assert!(schema(&toml::from_str("x = \"date\"").unwrap()).is_err());
    }

    #[test]
    fn tools_are_listed_for_switched_on_plugins_with_a_helper_and_secrets_in_an_answer_are_kept() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join(".atlas/plugins/mail");
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("plugin.toml"), "title = \"Mail\"\n[helper]\nrun = \"true\"\n[permissions]\nsecrets = true\n[[tool]]\nname = \"inbox\"\ndescription = \"the inbox\"\ninput = { limit = \"integer?\" }\n[[tool]]\nname = \"wait\"\ndescription = \"a long one\"\ntimeout_secs = 400\n").unwrap();
        let mut cfg = Config::default();
        let tools = list(dir.path(), &cfg);
        assert_eq!(tools.len(), 2);
        assert_eq!(tools[0].mcp_name(), "mail_inbox");
        // the agent bridge waits as long as the tool may run (a 2FA login), not a fixed time
        assert_eq!(tools[0].timeout, crate::helper::CALL_TIMEOUT);
        assert_eq!(tools[1].timeout, Duration::from_secs(400));
        cfg.plugins.off.push("mail".into());
        assert!(list(dir.path(), &cfg).is_empty(), "a switched-off plugin offers nothing");

        let store = Store::in_dir(&dir.path().join("secrets"), dir.path());
        let out = keep_secrets(&store, "mail", true, json!({ "ok": 1, "_secrets": { "refresh": "r1" } })).unwrap();
        assert_eq!(out, json!({ "ok": 1 }));
        assert_eq!(store.get("mail", "refresh").unwrap().as_deref(), Some("r1"));
        assert!(keep_secrets(&store, "mail", false, json!({ "_secrets": { "x": "y" } })).is_err());
    }

    /// A page's helper call gets what a tool's gets: the saved settings (unless it sends its own) and the secrets;
    /// a switched-off plugin's helper is not started for a page either.
    #[test]
    fn a_page_call_carries_settings_and_secrets_and_is_refused_while_off() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join(".atlas/plugins/bell");
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("plugin.toml"), "title = \"Bell\"\n[helper]\nrun = \"true\"\n[permissions]\nsecrets = true\n[[setting]]\nkey = \"server\"\nkind = \"text\"\ndefault = \"https://ntfy.example.org\"\n").unwrap();
        let store = Store::in_dir(&dir.path().join("secrets"), dir.path());
        store.set("bell", "token", "t1").unwrap();
        let mut cfg = Config::default();
        let got = page_call_params(dir.path(), &cfg, &store, "bell", json!({ "secrets": { "token": "forged" } })).unwrap();
        assert_eq!(got["settings"]["server"], "https://ntfy.example.org");
        assert_eq!(got["secrets"], json!({ "token": "t1" }));
        let own = page_call_params(dir.path(), &cfg, &store, "bell", json!({ "settings": { "server": "typed" } })).unwrap();
        assert_eq!(own["settings"], json!({ "server": "typed" }), "a form's unsaved values are what it tests");
        cfg.plugins.off.push("bell".into());
        assert!(page_call_params(dir.path(), &cfg, &store, "bell", Value::Null).is_err());
    }
}
