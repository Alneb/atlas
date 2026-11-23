# pi

The pi coding agent as one of Atlas's AI agents.

## What it adds

- **An agent** (`[[agent]]`): pi sessions in Atlas's terminal (the terminal's "+" menu, Super+K, "New AI agent
  session"). Each tab keeps its own conversation: Atlas starts pi with `--session-id <the tab's id>`, which opens the
  working folder's session with that id and makes it the first time, so a tab reopened after a restart is the same
  conversation. "Send the selection to the AI agent" types `@path (lines a-b)` into the pi tab in front.

## Settings

- **Command** (`pi`): what a session runs — `pi`, a path, or a wrapper; options go here too (`pi --model sonnet`,
  `pi --thinking high`).
- **Agent folder** (optional): pi's configuration folder (`PI_CODING_AGENT_DIR`: settings, sign-ins, sessions), to run
  a second setup side by side. Empty: pi's own (`~/.pi/agent`).

## How it fits

No requirements and no helper: the plugin is only the declaration. pi reaches the vault through Atlas's MCP server
like any agent. Register it once:

```sh
pi mcp add atlas -- atlas mcp
```

In an Atlas agent tab the agent finds its token already set (`ATLAS_AGENT_TOKEN`, the terminals' shared agent token;
Settings → AI agents can switch it off). To use Atlas's tools from a pi started outside Atlas, make a token there and add
`--env ATLAS_AGENT_TOKEN=<token>` to the line above.

`pi mcp list` then shows Atlas's tools (`atlas_*` and every plugin's).

## Needs

pi installed and signed in to a provider on the machine running Atlas's core (`pi auth`).

## Platforms

Linux works. macOS and Windows are untested (pi runs there; the plugin is only a command line). Not on the phone: a
terminal agent.

## Status

Beta. The agent mechanism is the core's (`agent_terminals.rs`, tested with a fake agent); this plugin adds no code.
