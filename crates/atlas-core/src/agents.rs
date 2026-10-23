//! AI agents allowed into a locked local core (docs/design/DESIGN-local-lock.md, step 3): one named token per agent,
//! made in Settings → Agents and revoked one by one. `atlas mcp` sends its
//! agent's token (`ATLAS_AGENT_TOKEN`, from the agent's MCP config); a locked core turns away an `atlas mcp` without one.
//!
//! Per machine, not per vault: `$XDG_STATE_HOME/atlas/agents.json` (`ATLAS_AGENTS_FILE` names another), owner-only,
//! only hashes. Every core of this machine reads the same file, so a revoke reaches all of them at their next request.
use crate::auth::{Token, TOKEN_HEADER};
use axum::http::{header, HeaderMap};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// How stale an agent's "last used" may get before a request writes it again (a write per request would be wasteful).
const LAST_USED_STEP: u64 = 60;

pub fn agents_file() -> PathBuf {
    std::env::var_os("ATLAS_AGENTS_FILE").map(PathBuf::from).unwrap_or_else(|| crate::auth::state_file().with_file_name("agents.json"))
}

/// The agents of one file. Each call reads it afresh (a few hundred bytes), so there is no copy to go stale.
pub struct Agents {
    file: PathBuf,
}

impl Agents {
    pub fn new(file: PathBuf) -> Self {
        Agents { file }
    }

    /// This machine's agents ([`agents_file`]).
    pub fn here() -> Self {
        Self::new(agents_file())
    }

    pub fn list(&self) -> Vec<Token> {
        std::fs::read_to_string(&self.file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
    }

    fn save(&self, all: &[Token]) -> anyhow::Result<()> {
        crate::auth::write_private(&self.file, &serde_json::to_vec_pretty(all)?)
    }

    /// A new agent named `name` → its token, to show once (names are how one revokes, so a used name is refused).
    pub fn allow(&self, name: &str) -> anyhow::Result<String> {
        let name = name.trim();
        if name.is_empty() {
            anyhow::bail!("an agent needs a name (the agent and machine it is for)");
        }
        let mut all = self.list();
        if all.iter().any(|t| t.name == name) {
            anyhow::bail!("an agent named “{name}” exists: revoke it first, or pick another name");
        }
        let (token, rec) = crate::auth::new_token(name, crate::auth::Scope::Full);
        all.push(rec);
        self.save(&all)?;
        Ok(token)
    }

    pub fn revoke(&self, name: &str) -> anyhow::Result<bool> {
        let mut all = self.list();
        let before = all.len();
        all.retain(|t| t.name != name);
        if all.len() == before {
            return Ok(false);
        }
        self.save(&all)?;
        Ok(true)
    }

    /// The agent whose token the request carries (`Authorization: Bearer` or `x-atlas-token`), if any; notes its use.
    pub fn who(&self, h: &HeaderMap) -> Option<String> {
        let bearer = h.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("Bearer "));
        let own = h.get(TOKEN_HEADER).and_then(|v| v.to_str().ok());
        let hashes: Vec<String> = [bearer, own].into_iter().flatten().map(|t| crate::auth::sha256(t.trim())).collect();
        if hashes.is_empty() {
            return None;
        }
        let mut all = self.list();
        let i = all.iter().position(|t| hashes.iter().any(|h| crate::local_lock::same(h, &t.hash)))?;
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
        if all[i].last_used.is_none_or(|t| now.saturating_sub(t) >= LAST_USED_STEP) {
            all[i].last_used = Some(now);
            let _ = self.save(&all); // the agent is let in even if the note of it cannot be kept
        }
        Some(all[i].name.clone())
    }
}

/// The agent the terminals Atlas starts for an agent share: a vault's
/// `.mcp.json` is synced, so the token reaches `atlas mcp` through the terminal's environment instead.
pub const TERMINAL_AGENT: &str = "Agents in Atlas terminals";

/// The terminal agent's switch and token, owner-only beside the agents (the token in clear, as the machine key is).
#[derive(Default, serde::Serialize, serde::Deserialize)]
struct Terminals {
    #[serde(default)]
    off: bool,
    token: Option<String>,
}

impl Agents {
    fn terminals_file(&self) -> PathBuf {
        self.file.with_extension("terminals.json")
    }

    fn terminals(&self) -> Terminals {
        std::fs::read_to_string(self.terminals_file()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
    }

    /// `ATLAS_AGENT_TOKEN` for an agent terminal: the shared token while it is allowed; a new one on first use and
    /// after a revoke (a revoke rotates it: running sessions are out, new ones in); None while switched off.
    pub fn terminal_token(&self) -> Option<String> {
        let mut t = self.terminals();
        if t.off {
            return None;
        }
        if let Some(tok) = &t.token {
            let hash = crate::auth::sha256(tok);
            if self.list().iter().any(|a| a.name == TERMINAL_AGENT && crate::local_lock::same(&a.hash, &hash)) {
                return t.token;
            }
        }
        let _ = self.revoke(TERMINAL_AGENT);
        let tok = self.allow(TERMINAL_AGENT).map_err(|e| eprintln!("atlas: no agent token for the terminal: {e}")).ok()?;
        t.token = Some(tok.clone());
        crate::auth::write_private(&self.terminals_file(), &serde_json::to_vec(&t).ok()?).map_err(|e| eprintln!("atlas: the terminal agent's token not kept: {e}")).ok()?;
        Some(tok)
    }

    pub fn terminals_on(&self) -> bool {
        !self.terminals().off
    }

    /// Off: agent terminals get no token and the shared one is revoked; on: the next agent terminal makes one.
    pub fn set_terminals(&self, on: bool) -> anyhow::Result<()> {
        if !on {
            self.revoke(TERMINAL_AGENT)?;
        }
        let t = Terminals { off: !on, token: None };
        crate::auth::write_private(&self.terminals_file(), &serde_json::to_vec(&t)?)
    }
}

/// The MCP server entry an agent registers for its token (shown once beside it): the `mcpServers` shape MCP clients
/// share. How a given agent takes it in (its own command, its own file) belongs to that agent's plugin.
pub fn mcp_server(token: &str) -> serde_json::Value {
    serde_json::json!({ "mcpServers": { "atlas": { "command": "atlas", "args": ["mcp"], "env": { "ATLAS_AGENT_TOKEN": token } } } })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn bearer(t: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(header::AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {t}")).unwrap());
        h
    }

    #[test]
    fn an_agent_is_allowed_known_by_its_token_and_revoked() {
        let dir = tempfile::tempdir().unwrap();
        let a = Agents::new(dir.path().join("agents.json"));
        let t = a.allow("Claude Code").unwrap();
        assert!(t.starts_with("atl_"));
        assert!(a.allow(" Claude Code ").is_err(), "a used name");
        assert!(a.allow("  ").is_err(), "no name");
        assert_eq!(a.who(&bearer(&t)).as_deref(), Some("Claude Code"));
        assert!(a.list()[0].last_used.is_some(), "its use is noted");
        assert_eq!(a.who(&bearer("atl_nope")), None);
        assert_eq!(a.who(&HeaderMap::new()), None);
        // a second store on the same file (another core of this machine) sees the revoke at once
        assert!(Agents::new(dir.path().join("agents.json")).revoke("Claude Code").unwrap());
        assert_eq!(a.who(&bearer(&t)), None);
        assert!(!a.revoke("Claude Code").unwrap());
        assert!(!std::fs::read_to_string(dir.path().join("agents.json")).unwrap().contains(&t), "only hashes are kept");
    }

    #[test]
    fn agent_terminals_share_a_token_a_revoke_rotates_it_and_off_keeps_them_out() {
        let dir = tempfile::tempdir().unwrap();
        let a = Agents::new(dir.path().join("agents.json"));
        let first = a.terminal_token().expect("made on first use");
        assert_eq!(a.terminal_token().as_deref(), Some(first.as_str()), "every agent terminal shares it");
        assert_eq!(a.who(&bearer(&first)).as_deref(), Some(TERMINAL_AGENT));
        assert!(a.revoke(TERMINAL_AGENT).unwrap());
        let second = a.terminal_token().unwrap();
        assert_ne!(first, second, "a revoke rotates it");
        assert_eq!(a.who(&bearer(&first)), None);
        a.set_terminals(false).unwrap();
        assert!(!a.terminals_on() && a.terminal_token().is_none());
        assert_eq!(a.who(&bearer(&second)), None, "switching off revokes");
        a.set_terminals(true).unwrap();
        assert!(a.terminal_token().is_some());
    }
}
