# Claude

Claude Code as one of Atlas's AI agents, and your Claude plan's usage in the status bar.

## What it adds

- **An agent** (`[[agent]]`): Claude Code sessions in Atlas's terminal (the terminal's "+" menu, Super+K). Each tab
  resumes its own conversation (`--session-id` / `--resume`), runs the command and account of the settings, and can
  receive the editor's selection as `@path#Lfrom-to`. Commits by Claude are recognised by their co-author line.
- **A status cell** — "Claude 42 %" — with the share of the 5-hour session limit used by the account Atlas runs Claude
  as, every limit with its reset time on hover, ⚠ from the warning level, and a notice once per window when the
  session limit passes it (remembered across restarts). A click, or **Claude: show usage**, looks again at once.
- **The tool `usage`** (`claude_usage` through `atlas mcp`): the plan's limits in percent with their reset times, for
  the current account or, with `all = true`, every account found on this computer. No secrets in the answer.

The numbers come from the same usage endpoint Claude Code itself uses, with the account's own access token read from
its credentials file at each look; the token is never stored or sent anywhere else. Answers are cached for 90 seconds;
when a look fails, the last numbers are shown with their age.

## Settings

- **Command** (`claude`): what a session runs — `claude`, a path, or a wrapper; commands found on the machine are
  offered.
- **Account folder** (optional): a Claude Code configuration folder (`CLAUDE_CONFIG_DIR`) to run as another account;
  folders found are offered. Empty: Claude Code's own.
- **Look every (minutes)** (2): how often the usage is asked at most; 0: only on "Claude: show usage".
- **Warn from (%)** (80).

## How it fits

No requirements. Agents reach Atlas through `atlas mcp` with a token of their own (Settings → AI agents); this plugin
is how Claude Code is started inside Atlas.

## Needs

Claude Code installed and signed in on the machine running Atlas's core. The usage helper is a small program of the
plugin's own (Rust, `engine/`, built into `bin/<target>/` by `engine/build.sh`): it reads Claude Code's credentials and
the session hooks' cache, outside the vault, and asks the usage endpoint through Atlas's fetch
(`net = ["api.anthropic.com"]`); the token is read at each look and sent nowhere else.

## Platforms

Linux works; the others are untested. It reads the account of the machine the core runs on, so on a served vault it
reports the server's account.

## Status

Beta. Tests: `cargo test -p atlas-claude` (accounts found by shape, their addresses, the account in use, limits from
both answer shapes). No end-to-end spec.
