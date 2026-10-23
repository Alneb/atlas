# AI agents as plugins (design, 2026-10-15)

The goal (2026-10-15): the Claude integration moves to a plugin, so that different AI agents are different plugins and the MCP server stays generic.

**Yes.** The MCP side is already generic: `atlas mcp` is a stdio MCP server any MCP client can register (Claude Code, Codex CLI, Gemini CLI, opencode…); its tools (`atlas_*` and every plugin's `[[tool]]`) know nothing about which agent calls them. What is Claude-specific is **inside Atlas's core and UI**, written before plugins existed. This file is the plan to move it out, so an agent is a plugin like email or ssh, and a second agent is a second plugin, not a second set of special cases.

## What is Claude-specific today (measured 2026-10-15)

| Where | What | Count of mentions |
|---|---|---|
| `crates/atlas-core/src/pty.rs` | the `Claude` terminal preset: the `[terminal] claude` command line, `claude_account` → `CLAUDE_CONFIG_DIR`, the OSC colour answers Claude Code asks for | 28 |
| `crates/atlas-core/src/detect.rs` | settings suggestions: Claude installs on PATH, claude-acc accounts | 33 |
| `crates/atlas-core/src/config.rs` | `[terminal] claude`, `claude_account`; `[activity] show_claude` | 10 |
| `crates/atlas-core/src/git.rs` | `CommitBy::Claude`: author or `Co-Authored-By: Claude` trailer | 5 |
| `ui/src/lib/actions.ts` | "Claude session" command, `@path#L10-20` sent to the Claude terminal | 11 |
| `ui/src/components/TodayParts.svelte`, `panes/Git.svelte`, `CommitRow.svelte` | Activity's "Claude" group and filter | ~15 |
| `ui/src/components/sidebar/SideTabs.svelte` | the + menu's "Claude session" | 3 |
| `[editor] index_exclude` (vault config) | the agent's files (`docs/`, `AGENTS.md`, `CLAUDE.md`) kept out of the knowledge base | config, already generic |
| `plugins/beta/claude-usage` | usage in the status bar | already a plugin |

## The shape after the move

A plugin declares an **agent** in its `plugin.toml`:

```toml
[[agent]]
id = "claude"
title = "Claude"
icon = "claude"
command = "claude"                        # a setting of the plugin, with detection offered by its helper
env = { CLAUDE_CONFIG_DIR = "{account}" } # {account}: the plugin's "account" setting (a folder)
commit_marks = ["co-authored-by: claude", "author:claude"]   # how its commits are recognised
send_selection = "@{path}#L{from}-{to}"   # what "send the selection to the agent" types
mcp_add = "claude mcp add atlas --scope user -e ATLAS_AGENT_TOKEN={token} -- atlas mcp"  # shown in Settings → AI agents beside a new token
```

The core keeps only generic things:

- **Agent terminals**: `PtyPreset::Agent { plugin, id }` started from the declaration (command, env with the plugin's settings filled in). The + menu lists every declared agent ("Claude session", "Codex session"…), the palette gets "New <title> session".
- **Commits by agents**: `CommitBy::Agent(String)` instead of `Claude`; `git.rs` matches each agent's `commit_marks`. Activity groups by agent ("Claude", "Codex"), `[activity] show_agents` replaces `show_claude` (read once from the old key).
- **Send the selection**: to the agent terminal in front, with that agent's `send_selection` pattern.
- **Detection** moves to the plugin's helper (`detect` method): the settings form already calls helpers for choices.
- The **MCP server** is unchanged; each agent plugin's README says how to register `atlas mcp` with that agent (`.mcp.json`, `codex mcp add`, …).

`plugins/claude/` then holds the Claude agent, its usage cell (today's `claude-usage`, merged in) and its README; `plugins/codex/` would be the second agent, a few lines.

## Order of work

1. API: `[[agent]]` in the manifest (`plugins.rs`, ts-rs types), `PtyPreset::Agent`, generic commit marks — with the Claude values as a built-in default so nothing changes for the user.
2. Move the Claude specifics into `plugins/claude` (settings migrated from `[terminal] claude` / `claude_account`, as email moved its flat settings into cards).
3. UI: the + menu, Activity groups and the selection command read the declared agents.
4. Remove the built-in default once the vault has the plugin; tests: a fake agent plugin (`sh -c` echo) starts a session, its commits are grouped.

**Watch out for**: the user's running Claude sessions (terminal tabs saved with `preset: "claude"` in the layout must reopen as the plugin's agent — map the old preset on load); the session hooks that read `CLAUDE_CONFIG_DIR` (unchanged: the plugin sets the same variable); never restarting or killing the Atlas terminal this work is done from.


## The built-in Claude removed (2026-10-18)

Claude out of the core as well: with the Claude plugin installed in the vaults that use it
(`atlas plugin install plugins/beta/claude --on`), the core keeps no Claude:
- `pty.rs`: an agent tab is always a plugin's agent; the `claude` preset (saved layouts, Super+K) takes the `claude`
  agent, else the first one a plugin declares, else says to switch one on. The built-in branch (`[terminal] claude`,
  `claude_account`, its own session lookup) is gone; the generic session resume is agent_terminals.rs's.
- `config.rs`: `[terminal] claude` / `claude_account` removed (old keys are ignored; the Claude plugin's settings file
  carries them, and usage.py still reads `claude_account` as a fallback).
- `detect.rs`: the Claude suggestions removed (the plugin's `suggest` gives them).
- `git.rs`: commits are an agent's only by the marks the agent plugins declare.
- UI: Super+K "AI agent terminal", "New AI agent session", "Send the selection to the AI agent" (no built-in pattern),
  the terminal "+" offers to switch an agent plugin on when there is none; Settings → "Terminal & agents".
- Tests: the e2e vault declares its agent as a plugin (`playwright.config.ts`: `.atlas/plugins/claude`, command `cat`).
Kept on purpose: the `claude` preset name (saved layouts), `is_claude_session_var` (Atlas started from inside a Claude
Code session must not hand its markers to every terminal — a property of the environment, not of the plugin), the
Activity card's `show_claude` switch (agent commits).
