# Language servers (slice 1b: code intelligence)

Built 2026-10-06 (slice 1b of the plan: LSP via lsp-client).

## What the user gets
In any code file whose language has a server: completion from the server, hover docs, diagnostics
(squiggles + gutter), signature help, **F12** go to definition (opens the target file in a tab; files
outside the workspace — std lib, site-packages — show a toast instead), **F2** rename, **Shift+Alt+F**
format, **Shift+F12** references. Markdown notes are never sent to a server.

## Settings `[lsp]`
- `enabled` (true).
- `rust`, `python`, `latex`, `c`: empty = the first known server found (PATH, `~/.cargo/bin`,
  `~/.local/bin`): rust-analyzer · basedpyright-langserver / pyright-langserver / pylsp · texlab · clangd.
  `off` = none. Anything else = the command line; a relative path is from the workspace root, `~` expands.
- A research vault can set `python = "lib/<project>/venv/bin/pylsp"` — the project's own venv's pylsp, so hover and F12
  resolve numpy/scipy and the project's packages against what the scripts actually run with. Trade-off measured on
  one figure script: the venv's pylsp has jedi (+ black) but no
  pyflakes/pycodestyle, so **no lint diagnostics**; the system `/usr/bin/pylsp` gave 3 diagnostics after
  2.8 s but resolves imports against the system Python. Installing basedpyright (`uv tool install
  basedpyright`) would give both (its auto-detection picks it first); it was installed, see below.
- Installed on this machine (2026-10-06): rust-analyzer, pylsp, clangd, basedpyright, texlab.

## How it works
- `crates/atlas-core/src/lsp.rs`: `GET /api/lsp` → per language its extensions, the resolved command (or
  null) and the workspace `root_uri`. `GET /api/lsp/{rust|python|latex|c}` (WebSocket, Origin-checked like
  the PTY) spawns the server in the workspace root and relays: LSP `Content-Length` framing on stdio ↔ one
  text frame per JSON message. The process is killed when the socket closes (`kill_on_drop`); stderr goes
  to `.atlas/cache/lsp-<lang>.log` (truncated per start).
- `ui/src/lib/editor/lsp.ts`: one `LSPClient` per language for the whole window (one server process per
  language), created on the first file that needs it; `lspFor(path)` returns the client's plugin for the
  file's URI and language id (c/cpp, latex/bibtex). `create.ts` attaches it through a compartment once the
  connection is up, so opening a file never waits on a server. A closed socket forgets the client; the next
  editor starts a fresh server.
- `AtlasWorkspace` re-implements the library's (unexported) default workspace, tolerating the same file in
  two tabs (follows the newest view) and implementing `displayFile`: open the file in Atlas, then wait (≤ 5 s)
  for its editor to register through its LSP plugin.

## Tests
- Rust: framing round-trip (byte lengths, extra headers, EOF); command resolution (explicit path, relative
  to root, bare name not on PATH, `off`, `enabled = false`).
- Playwright `lsp.spec.ts` against `tests/fixtures/fake_ls.py`, a scripted server (initialize, a diagnostic on
  didOpen, hover, completion), so the test never depends on what is installed. The fixture config turns the
  other languages `off` so no real server starts during the suite.

## Not yet
- No status-bar indicator of server state; no "restart server" command (closing all files of the language
  does it).
- No `workspace/configuration` answers (servers use their defaults / config files).
- The IDE-protocol spike (Claude diffs in the editor) is still open.

## Update (same day): servers installed, client fixed
- Installed: **basedpyright 1.40.2** (`uv tool install basedpyright` →
  `~/.local/bin`) and **texlab 5.26.0** (release binary → `~/.local/bin/texlab`). Auto-detection now picks
  basedpyright for Python and texlab for LaTeX; the vault's `.atlas/config.toml` no longer pins pylsp.
- The vault's `pyrightconfig.json`: the project's venv, `basic` checking, heavy folders excluded.
- **Client bug found**: @codemirror/lsp-client never answers requests FROM the server and sends no
  `workspaceFolders`, so basedpyright ignored `pyrightconfig.json` (60 strict-mode warnings on
  `ch09_ipt.py` vs 0 from the CLI). `lib/editor/lsp.ts` now adds the workspace folder to `initialize` and
  answers server requests (`workspace/configuration` → empty settings, so the server's own config file
  decides; others → null). After: 0 warnings, scipy hover resolved from the venv.
- Verified on the UX copy: texlab completes `\begin{equ` → `equation` in 0.5 s (UX journey step).


## Checked again on 2026-10-13: what completes, and a server that does not start

Autocompletion of code inside code files. Tried on a scratch vault with the real servers of this machine (a second core on its own port; `[editor] vim` on, so the probe opens a line with `Go` first — typing straight away ran vim commands and looked like "no completion"):

| file | server | result |
|---|---|---|
| `.py` | pylsp (`/usr/bin/pylsp`) | `os.pa` → 32 entries (`pardir`, `path`, …); `ener` → the file's own `energy` first. Works while typing and on Ctrl+Space. |
| `.c` | clangd | `pri` → `printf(…)`. Works. |
| `.js` | none (not one of the four languages) | CodeMirror's own completion: the file's names and keywords (`area`, `return`). No types, no imports. |
| `.rs` | **does not start** | `~/.cargo/bin/rust-analyzer` is rustup's stand-in and the component is not installed: `error: Unknown binary 'rust-analyzer' in official toolchain 'stable-x86_64-unknown-linux-gnu'`. Fix on the machine: `rustup component add rust-analyzer`. |

Before today the Rust case was silent: the socket closed, the client was forgotten, and completion was just missing (plus an unhandled "Request timed out" in `.atlas/cache/ui.log` eight seconds later). Now `connect()` in `ui/src/lib/editor/lsp.ts` notes whether the server ever said anything; a server that closes without a word is reported once per language (`reportDead`): a 15-second error toast with the last line of `.atlas/cache/lsp-<lang>.log` and where to fix it (Settings → Code).

Not covered by a server: JavaScript/TypeScript, shell, Julia. Adding one is a line in `LspLang` (`crates/atlas-core/src/lsp.rs`: extensions, candidates, a setting) — not done, nobody asked for a specific one yet.


## Code actions (Ctrl+.)

`codeActions` in `ui/src/lib/editor/lsp.ts`: `textDocument/codeAction` for the caret or selection, with the diagnostics on those lines as context; the answers (those not `disabled`) are offered in the palette's chooser; the chosen action's `edit` is applied — to the open file through the editor (so it is one undo step), to other files on disk — then its `command` is sent as `workspace/executeCommand`. File operations inside an edit (create / rename / delete) are named in a toast and not done. A server that answers a command with its own `workspace/applyEdit` request is not handled yet. Tested with the fake server only (`ui/tests/lsp.spec.ts`).
