# Claude usage

A status-bar cell — **Claude 42 %** — with how much of the Claude plan's limits is used by the Claude Code account Atlas runs Claude as: its session (5-hour) limit in the bar (⚠ from **Warn from**, 80 %), its limits with when they reset on hover, and a notice once per 5-hour window when the session limit passes the warning. A click (or **Claude: show usage**) looks again at once. Asked by the user on 2026-10-15: *"also you should write an usage indicator into the app when using claude"*.

**Where the numbers come from.** The same request as `claude-acc usage` and Claude Code's session hooks (`~/.claude/hooks/usagelib.py`): `GET https://api.anthropic.com/api/oauth/usage` with the account's own access token, read from its `.credentials.json` at each look — `$CLAUDE_CONFIG_DIR`, `~/.claude` and every `~/.claude-switch/**/.credentials.json`. Each account is named by its **email**, read from Claude Code's own `.claude.json` beside the credentials (`~/.claude.json` for `~/.claude`); an account without one is named by its folder ("default", "personal"). The token is never stored or sent anywhere else. The limits are read shape-based from `limits[]` (a kind the API adds later appears by itself), else from the older `five_hour` / `seven_day` blocks. Answers are cached 90 s per account in the helper (`usage.py`); the bar asks every **Look every** minutes (2). An account that cannot be read (offline, signed out) says why on hover; the others are still shown.

**For Claude.** The `[[tool]]` `usage` is offered through `atlas mcp` as `claude_usage`: an agent can see the plan's state without reading credentials itself.

Tests: `scripts/vault/tests/test_claude_usage_plugin.py` (accounts found by shape, limits from `limits[]` and from the old blocks, an error per account, the cache).


**Which account**: the cell shows the account Atlas's Claude sessions run as — the vault's `[terminal] claude_account`, else `$CLAUDE_CONFIG_DIR`, else `~/.claude` (`usage.py` `in_use`) — not the one that has used the most; it is marked ▸ on hover, where the others stay, and every account still warns past **Warn at**. **429 Too Many Requests**: the usage endpoint refuses a second poller, and Claude Code's session hooks already ask after every tool call; so the plugin first reads the hooks' own per-account copy (`/tmp/claude_usage_5h_<account>.json`, `~/.claude/hooks/usagelib.py`) when it is under 90 s old, and when a look fails it shows the last numbers known, dated ("as of 4 min ago"), instead of an error.

**Only the current account; one notice per window**.
- `usage.py` `usage` now answers for the current account only (`in_use`): one request instead of one per account, and no 401/429 lines for accounts the user is not using. The discovery of `~/.claude-switch` accounts stays, but as an option — the tool's `{"all": true}` lists every account found, and with no claude-switch installed (or a configured folder with no sign-in) the current account is still asked, or says "not signed in (no …/.credentials.json)".
- **Why the notices repeated.** The endpoint's `resets_at` moves by a fraction of a second on every request (`2026-10-15T20:29:59.686378+00:00`, then `….846544` three seconds later). The "already announced" key held `resets_at`, so every look (each 2 min) was a new limit and toasted again — for every account over the line, and once more after every restart since the set lived in memory.
- **Now** (`main.js` `announce`): the key is `folder:kind` without the time, and holds the window's end. A limit is announced when it passes **Warn from**, not again until that window has ended, and re-armed when it falls below (a new window starts near 0 %). The record is kept in `localStorage` (`atlas.claude.warned`), so a restart does not repeat it; numbers that are hours old (`stale`) never announce. Only the current account announces.
- Tests: `scripts/vault/tests/test_claude_usage_plugin.py` — `test_without_claude_switch_only_the_current_account_is_asked`, and `NoticeTest`, which runs `main.js` under node with a fake `atlas`: ten looks with jittering reset times, a restart, a new window, stale numbers and another account give 1, 1, 2, 2, 2 notices (the old code: 10, 11, 12, 13, 14).


**Atlas as Claude Code's MCP server, with a token of its own**. On a locked Atlas, `atlas mcp` gets in only with an agent's token (Settings → AI agents, core `agents.rs`). The core shows only the generic MCP entry (`atlas mcp` with `ATLAS_AGENT_TOKEN`); Claude Code takes it in with:

```sh
claude mcp add atlas --scope user -e ATLAS_AGENT_TOKEN=atl_… -- atlas mcp
```

(or the entry pasted into a project's `.mcp.json`). This lives here and not in the core because how an agent registers an MCP server is that agent's business. When agents become plugins, this line becomes the Claude plugin's `[[agent]] mcp_add`, and Settings → AI agents shows it beside the token.
