# Codex

OpenAI's Codex CLI as one of Atlas's AI agents.

## What it adds

- **An agent** (`[[agent]]`): Codex sessions in Atlas's terminal (the terminal's "+" menu, Super+K, "New AI agent
  session"), with the command and Codex home of the settings. "Send the selection to the AI agent" types
  `@path (lines a-b)` into the Codex tab in front.

Codex chooses a conversation's id itself and cannot be told one at the start, so unlike Claude and pi a tab does not
reopen its own conversation after a restart: it starts a new one. `/resume` inside Codex (or a Command of
`codex resume --last`) picks up an earlier one.

## Settings

- **Command** (`codex`): what a session runs — `codex`, a path, or a wrapper; options go here too
  (`codex --model gpt-5-codex`, `codex --full-auto`).
- **Codex home** (optional): a Codex configuration folder (`CODEX_HOME`: `config.toml`, the sign-in, sessions), to run
  as another account. Empty: Codex's own (`~/.codex`).

## How it fits

No requirements and no helper: the plugin is only the declaration. Codex reaches the vault through Atlas's MCP server
like any agent. Register it once, in `~/.codex/config.toml` (or the Codex home's):

```toml
[mcp_servers.atlas]
command = "atlas"
args = ["mcp"]
env_vars = ["ATLAS_AGENT_TOKEN"]
```

Codex starts an MCP server with only a few of its own variables; `env_vars` passes the token on. In an Atlas agent tab
the token is already set (`ATLAS_AGENT_TOKEN`, the terminals' shared agent token; Settings → AI agents can switch it
off). For a Codex started outside Atlas, make a token there and write it as `env = { ATLAS_AGENT_TOKEN = "<token>" }`
instead.

## Needs

The Codex CLI installed (`npm install -g @openai/codex`) and signed in (`codex login`) on the machine running Atlas's
core.

## Platforms

Untested everywhere (Codex was not installed where it was written; the plugin is only a command line). Not on the
phone: a terminal agent.

## Status

Beta. The agent mechanism is the core's (`agent_terminals.rs`, tested with a fake agent); this plugin adds no code.
