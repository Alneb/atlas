//! AI agents as plugins (docs/refactor/REFACTOR-agents-as-plugins.md). A plugin declares an agent in its manifest (`[[agent]]`): how its
//! terminal is started, with `{setting}` placeholders filled from the plugin's own settings. The core knows no agent by
//! name: it starts what the declaration says, hands the terminal its MCP token (agents.rs) and resumes a tab's session.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[ts(export)]
pub struct AgentDecl {
    /// Unique within its plugin (`claude`); the terminal's preset is `<plugin>/<id>`.
    pub id: String,
    /// "Claude": the + menu's "Claude session", the palette's "New Claude session".
    pub title: String,
    #[serde(default)]
    #[ts(optional)]
    pub icon: Option<String>,
    /// The command line. `{key}` is the plugin's setting `key`; `{key:fallback}` uses `fallback` when it is empty.
    pub command: String,
    /// Environment for the terminal; an entry whose value is empty once filled is not set.
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    /// Arguments starting the tab's own session (`{session}`: the tab's id, a UUID kept in its saved layout)…
    #[serde(default)]
    pub new_session: Vec<String>,
    /// …and resuming it, used when `session_file` exists.
    #[serde(default)]
    pub resume_session: Vec<String>,
    /// A file the agent writes for a session it has: `{session}` and settings filled, one `*` for any folder.
    #[serde(default)]
    #[ts(optional)]
    pub session_file: Option<String>,
    /// How the agent's commits are recognised (the trailer or author it writes), lower case.
    #[serde(default)]
    pub commit_marks: Vec<String>,
    /// What "send the selection to the agent" types: `{path}`, `{from}`, `{to}`.
    #[serde(default)]
    #[ts(optional)]
    pub send_selection: Option<String>,
}

/// `{key}` / `{key:fallback}` filled from the settings (text values; other kinds as TOML writes them), `~/` expanded.
pub fn fill(template: &str, settings: &toml::Table, session: Option<&str>) -> String {
    let mut out = String::new();
    let mut rest = template;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let Some(close) = rest[open..].find('}') else { break };
        let inner = &rest[open + 1..open + close];
        let (key, fallback) = inner.split_once(':').unwrap_or((inner, ""));
        let value = if key == "session" {
            session.unwrap_or_default().to_string()
        } else {
            match settings.get(key) {
                Some(toml::Value::String(s)) => s.trim().to_string(),
                Some(v) => v.to_string(),
                None => String::new(),
            }
        };
        out.push_str(if value.is_empty() { fallback } else { &value });
        rest = &rest[open + close + 1..];
    }
    out.push_str(rest);
    crate::pty::expand_home_words(&out)
}

/// Whether the file a session leaves exists: `session_file` filled, its one `*` any folder.
pub fn has_session(pattern: &str) -> bool {
    match pattern.split_once("/*/") {
        None => Path::new(pattern).exists(),
        Some((dir, file)) => std::fs::read_dir(dir).into_iter().flatten().flatten().any(|e| e.path().join(file).exists()),
    }
}

/// The agent's terminal: its command line split into program and arguments, its environment, its session arguments.
pub fn command(decl: &AgentDecl, settings: &toml::Table, session: Option<&str>) -> (String, Vec<String>, Vec<(String, String)>) {
    let line = fill(&decl.command, settings, None);
    let mut words = line.split_whitespace().map(str::to_string);
    let program = words.next().unwrap_or_default();
    let mut args: Vec<String> = words.collect();
    if let Some(id) = session.filter(|id| crate::pty::is_uuid(id)) {
        let resume = decl.session_file.as_deref().is_some_and(|f| has_session(&fill(f, settings, Some(id))));
        let extra = if resume { &decl.resume_session } else { &decl.new_session };
        args.extend(extra.iter().map(|a| fill(a, settings, Some(id))));
    }
    let env = decl.env.iter().map(|(k, v)| (k.clone(), fill(v, settings, None))).filter(|(_, v)| !v.is_empty()).collect();
    (program, args, env)
}

/// Every agent the plugins that can run declare, with their settings: (plugin, declaration, settings).
pub fn declared(root: &Path, off: &[String]) -> Vec<(String, AgentDecl, toml::Table)> {
    let all = crate::plugins::list(root);
    all.iter()
        .filter(|p| crate::plugins::blocked(&all, off, &p.id).is_none())
        .filter_map(|p| crate::plugins::agent_parts(root, &p.id).ok().map(|(agents, settings)| (p.id.clone(), agents, settings)))
        .flat_map(|(plugin, agents, settings)| agents.into_iter().map(move |a| (plugin.clone(), a, settings.clone())))
        .collect()
}

/// The declaration a terminal names (`<plugin>/<id>`), or the first agent with that id (`claude`: a tab saved with
/// the old built-in preset finds the Claude plugin).
pub fn find(root: &Path, off: &[String], name: &str) -> Option<(AgentDecl, toml::Table)> {
    let (plugin, id) = name.split_once('/').map_or((None, name), |(p, i)| (Some(p), i));
    declared(root, off).into_iter().find(|(p, a, _)| a.id == id && plugin.is_none_or(|w| w == p)).map(|(_, a, s)| (a, s))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claude() -> AgentDecl {
        toml::from_str(
            r#"id = "claude"
title = "Claude"
command = "{command:claude}"
env = { CLAUDE_CONFIG_DIR = "{account}" }
new_session = ["--session-id", "{session}"]
resume_session = ["--resume", "{session}"]
session_file = "{account:~/.claude}/projects/*/{session}.jsonl"
"#,
        )
        .unwrap()
    }

    #[test]
    fn a_declared_agent_starts_from_its_settings_and_resumes_its_own_session() {
        let t = tempfile::tempdir().unwrap();
        let id = "0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9";
        let mut s = toml::Table::new();
        let (p, a, env) = command(&claude(), &s, None);
        assert_eq!((p.as_str(), a.len(), env.len()), ("claude", 0, 0), "defaults; an empty account sets nothing");
        s.insert("command".into(), "claude-acc personal --x".into());
        s.insert("account".into(), t.path().to_string_lossy().into_owned().into());
        let (p, a, env) = command(&claude(), &s, Some(id));
        assert_eq!((p.as_str(), a), ("claude-acc", vec!["personal".to_string(), "--x".into(), "--session-id".into(), id.into()]));
        assert_eq!(env, vec![("CLAUDE_CONFIG_DIR".to_string(), t.path().to_string_lossy().into_owned())]);
        std::fs::create_dir_all(t.path().join("projects/-home-x")).unwrap();
        std::fs::write(t.path().join(format!("projects/-home-x/{id}.jsonl")), "").unwrap();
        assert_eq!(command(&claude(), &s, Some(id)).1[2..], ["--resume".to_string(), id.into()], "the transcript exists: resumed");
        assert_eq!(command(&claude(), &s, Some("not; a uuid")).1.len(), 2, "only a UUID reaches the arguments");
    }

    #[test]
    fn placeholders_take_settings_fallbacks_and_home() {
        let mut s = toml::Table::new();
        s.insert("n".into(), toml::Value::Integer(3));
        let home = std::env::var("HOME").unwrap();
        assert_eq!(fill("a {missing:~/x} {n} {} b", &s, None), format!("a {home}/x 3  b"));
    }
}
