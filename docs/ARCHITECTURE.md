# Atlas — architecture and the v0 API contract

Atlas is a personal desktop workspace app: Obsidian + Notion + Zotero + VS Code + a Claude Code
terminal, in one window, over **plain files**. Principles: [PHILOSOPHY.md](PHILOSOPHY.md).

## Shape
```
Tauri v2 window ─► ui/ (Svelte 5 + Vite + TS, dockview-core panes)
                     │ HTTP + WebSocket on 127.0.0.1 — the ONE transport (also the automation API)
                  crates/atlas-core (Rust lib: axum server, workspace, commands, pty, events)
                  crates/atlas      (Rust bin: `atlas serve|capture|cmd|open|today`)
                  crates/atlas-app/        (Rust bin: starts atlas-core in-process, opens the window)
                     │
                  workspace folder (any folder) + optional .atlas/
```
Invariants:
1. **Files are the truth.** Nothing lives only in Atlas. `.atlas/cache/` is deletable at any time.
2. **Zero required fields.** No action asks for metadata before it lets the user type.
3. **Every action is a command** in one registry, reachable identically from palette, keybinding,
   CLI and HTTP. Claude/user extensions are scripts in `.atlas/commands/`, no recompile.
4. **Invalid states unrepresentable:** commands, pane kinds, event kinds are Rust enums (serde
   tagged); TS types are generated from them with `ts-rs` into `ui/src/lib/gen/`.

## Workspace config — `.atlas/config.toml` (optional; every key has a default)
```toml
log_dir   = "log"             # daily capture: <log_dir>/YYYY-MM-DD.md, no frontmatter
focus     = "FOCUS.md"        # user-owned; Atlas only displays it
lectures  = "notes/lectures"  # <lectures>/<course-slug>/YYYY-MM-DD.md
ignore    = ["runs", "lib", "archive", "node_modules", "target", ".git"]  # for tree/tasks/search walks
vim       = true
```

## Discovery for CLI / scripts / Claude
On start the server writes `<workspace>/.atlas/cache/server.json` = `{"port":N,"pid":P,"root":"/abs"}`.
The CLI walks up from cwd to find it. If none, `atlas` commands that only touch files
(`capture`) work directly on disk — **Atlas never has to be running for files to be written**.

## Security (localhost)
Every `/api` HTTP request must carry header `x-atlas: 1` (forces a CORS preflight that the server
refuses for foreign origins → blocks drive-by POSTs from web pages). WebSockets check `Origin` is
absent, `tauri://localhost`, `http://tauri.localhost` or `http://127.0.0.1:<port>`/`http://localhost:<port>`
(and the Vite dev origin `http://localhost:5173`). Bind 127.0.0.1 only.

## HTTP API v0 (JSON unless noted; paths are workspace-relative, `..` rejected)
| method & path | body / query | response |
|---|---|---|
| `GET /api/workspace` | – | `{root, name, config}` |
| `GET /api/tree` | `?path=` (default root) | `[{name, path, kind:"dir"\|"file"}]` sorted dirs-first; config `ignore` honored at any depth, dotfiles hidden except `.atlas` |
| `GET /api/file` | `?path=` | `{path, text, mtime}` (text files ≤ 5 MB) |
| `PUT /api/file` | `{path, text, base_mtime?}` | `{mtime}`; atomic write (tmp + rename); 409 if `base_mtime` given and file changed |
| `GET /api/raw` | `?path=` | bytes, guessed `content-type` (PDF/images/etc) |
| `GET /api/today` | – | `{date, focus:{path, text\|null}, log:{path, text\|null}, tasks:[{path, line, text}], activity:{commits:[{hash, subject, time}], changed:[{path, mtime}]}}` — tasks = unchecked `- [ ]` lines in workspace `.md` (ignore list honored, cap 200); commits = `git log --since=yesterday` (if a git repo); changed = files modified in last 36 h (cap 50) |
| `POST /api/capture` | `{text}` | `{path, line}` — appends `- HH:MM text` to today's log (creates `# YYYY-MM-DD\n\n` header if new). Multi-line text: first line gets the bullet, the rest indented 2 spaces |
| `GET /api/lectures` | – | `[{course, slug, last}]` |
| `POST /api/lecture` | `{course}` | `{path}` — creates `<lectures>/<slug>/YYYY-MM-DD.md` with `# <course> — YYYY-MM-DD\n\n` if missing |
| `GET /api/search` | `?q=` | `{files:[path], lines:[{path, line, text}]}` — filename fuzzy-ish contains + `rg --json` content (cap 200) |
| `GET /api/commands` | – | `[{id, title, keys?, source:"builtin"\|"script", description?}]` |
| `POST /api/cmd/:id` | `{args:{...}}` | `{ok, result}` / `{ok:false, error}` |
| `WS /api/events` | – | server→client JSON: `{"type":"fs","paths":[..]}`, `{"type":"gone","paths":[..]}` (the paths of the next `fs` batch that no longer exist; a listener that skips rewrites of known files still sees removals — `onFilesAddedOrRemoved` in `ui/src/lib/vault.ts`), `{"type":"open","path","line?"}`, `{"type":"notify","title","body?"}`, `{"type":"focus","pane":"today"\|"terminal"\|...}` |
| `WS /api/pty` | `?preset=shell\|claude&cols&rows&cwd?&command?&session?&key?` | binary frames = pty bytes both ways; text frames client→server `{"resize":[cols,rows]}` or `"end"`. `claude` preset runs `claude` in the workspace root; `shell` runs `$SHELL`. With `key` the terminal outlives its socket (a page reload takes it over, with its last 1 MB of output; 10 min grace) and `"end"` kills it; without, the child is killed when the socket closes (TERMINAL.md) |

Built-in commands (ids): `capture {text}`, `lecture.new {course}`, `open {path, line?}` (emits an
`open` event → UI opens a pane), `notify {title, body?}`, `focus {pane}`, `today` (returns /api/today).
Script commands: `.atlas/commands/<id>.toml` = `{title, run = "python3 x.py", keys?, description?}`;
args sent as JSON on stdin, stdout returned (parsed as JSON if it parses), cwd = workspace root,
30 s timeout, stderr returned on failure. The server re-reads the folder on each `/api/commands`.

## UI (ui/)
- Layout: left activity rail (Today, Files, Search, Lectures, Commands) + dockview-core panes;
  bottom status bar (workspace, vim mode, server state). Layout JSON persisted in localStorage.
- Pane kinds: `today`, `editor{path}`, `terminal{preset}`, `files`, `search`, `pdf{path}`
  (Atlas's PDFium reader with its marking tools), `image{path}`, `web{url}`.
- Editor: CodeMirror 6 + `@replit/codemirror-vim` (**on by default**), markdown live preview from
  vendored obsidian-web `live-preview.js` with KaTeX as `renderMath`, code languages via
  `@codemirror/language-data`; autosave 600 ms after typing stops (PUT with `base_mtime`); reloads on
  `fs` event when not dirty.
- Today: FOCUS.md rendered (markdown-it + KaTeX) with an edit button; capture box auto-focused —
  Enter sends, Shift+Enter newline; today's log rendered below; open tasks; activity.
- Global keys: `Ctrl+K` palette (commands + files + headings), `Ctrl+Alt+C` focus capture,
  `Ctrl+Alt+L` new lecture note, `` Ctrl+` `` terminal, `Ctrl+Alt+K` Claude terminal, `Ctrl+P` file
  quick-open, `Ctrl+W` close pane. Keymap overridable by `.atlas/keys.toml` later.
- Look: CSS variables, dark (default) + light themes, Inter + JetBrains Mono (bundled via
  `@fontsource`), no CDN anything (offline desktop app).
- Dev: `npm --prefix ui run dev` (Vite on :5173, proxies `/api` + WS to `127.0.0.1:7717`) against
  `cargo run -p atlas -- serve <ws> --port 7717`. Prod: atlas-core serves `ui/dist` (embedded with
  `include_dir` / `rust-embed`) at `/`.


## v0 implementation notes (as built — these refine the contract above)
1. **Times** (`mtime`, commit `time`) are integer **ms since epoch** (Rust newtype `Mtime`); commit `hash` is short.
2. **Errors:** non-2xx `/api` bodies are `{error, mtime?}`; 409 carries the current disk mtime (absent if deleted).
   400 bad path/body · 403 guard · 404 · 409 stale/missing with `base_mtime` · 413 > 5 MB · 415 not UTF-8.
   PUT creates parent dirs and keeps permissions.
3. **`POST /api/cmd/:id` always answers 200**; outcome only in `{ok, result}` / `{ok:false, error}`. Empty body = `{args:{}}`.
4. Built-ins: `open`/`notify`/`focus` return `{delivered:n}` and fail when no UI is listening (so `atlas open`
   errors with no window); `open` checks existence; `lecture.new` does **not** emit `open` (the UI opens the
   returned path); `capture` and PUT publish an `fs` event immediately. `focus.pane` is a closed enum:
   today, files, search, lectures, commands, terminal, claude, editor.
5. `/api/lectures`: `last` = `YYYY-MM-DD` or null, course from the newest note's `# X — date` heading, newest first.
6. Tasks: `text` after the checkbox; bullets `-*+` at any indent; code fences skipped; `line` 1-based.
7. **Ignore list:** entry without `/` matches a name at any depth; with `/` a workspace-relative prefix.
8. Search: filename = all whitespace tokens contained (basename hits first); content = `rg` fixed-string smart-case,
   honoring `.gitignore` + ignore list, hidden skipped; 200 cap each; no `rg` → empty `lines`.
9. **Scripts:** id = toml stem (dots allowed); run via `sh -c` in its own process group (timeout kills the group);
   env `ATLAS_ROOT`, `ATLAS_COMMAND`; broken manifests and ids shadowing built-ins skipped with a warning.
10. **Security beyond the contract:** Host header must be loopback (127.0.0.1, localhost, [::1], tauri.localhost) —
    closes DNS rebinding, which would defeat `x-atlas`; WS Origin also accepts `http://127.0.0.1:5173`; no CORS headers ever.
11. PTY: non-resize text frames are input; `cwd` honored; env `TERM=xterm-256color`, `COLORTERM=truecolor`;
    spawn errors are printed into the terminal.
12. Config re-read per request (malformed config fails `serve` at start). Watcher: one non-recursive watch per
    non-ignored dir (ignored trees cost no inotify), new dirs picked up, `.atlas/` reported but not `.atlas/cache`.
13. `server.json` removed on graceful shutdown; a stale one is harmless (CLI verifies port answers for the same root).
14. Tauri (`atlas-app`): sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Wayland if unset, serves on port 0 in-process,
    window → `http://127.0.0.1:<port>/`; `ATLAS_UI_URL` overrides (e.g. Vite). No IPC is used.

Gates (2026-10-05): `cargo test --workspace` **67 passed / 0 failed** (29 unit, 34 ts-rs exports, 3 server
integration incl. pty `echo` round-trip and events WS, 1 CLI); clippy `-D warnings` clean; fmt clean.
Known gaps: `/api/raw` reads whole files (no Range); watcher ignore list read once; no rename pairing.

### Claude link: UI state + `atlas mcp` (slice 1b, first part)
15. **`GET/PUT /api/ui/state`** (`UiState` = `active` pane, `open` panes, `selection` {path, 1-based
    `from_line`/`to_line`, text ≤ 20 kB}). In memory only: it describes this window session, not the files.
    The UI (`ui/src/lib/uistate.ts`) PUTs it debounced 300 ms on dock active/add/remove and on every editor
    selection change; a selection whose editor closed is dropped.
16. **`atlas mcp`**: stdio MCP server (hand-rolled newline JSON-RPC, tools only, protocol `2025-06-18`).
    Tools: `atlas_context`, `atlas_open`, `atlas_notify` (need the window → `isError` with a clear message
    otherwise), `atlas_capture`, `atlas_today`, `atlas_search`, `atlas_commands`, `atlas_run` (work without the
    window; go through the live server when there is one so the UI sees the change). The server is
    re-discovered per call, so opening/closing the window mid-conversation works. Register it in a workspace's
    `.mcp.json` as `{"mcpServers": {"atlas": {"command": "atlas", "args": ["mcp"]}}}`.
    Also `atlas_templates` and `atlas_new_note` (a note from one of the vault's templates at
    an exact path, properties set from `fields`, an existing path refused; docs/guides/NOTES-SYSTEM.md), and the
    instructions the server sends at `initialize` (`INSTRUCTIONS` in `crates/atlas/src/mcp.rs`) tell agents to
    create notes that way and name the SSH plugin's `ssh_terminal` for a visible terminal tab. Every switched-on
    plugin's `[[tool]]`s follow the built-in ones (`plugin_tools.rs`; docs/guides/PLUGIN-API.md).

Gates (2026-10-05): `cargo test --workspace` **71 passed / 0 failed** (+3 MCP stdio tests, +1 Today
test); clippy `-D warnings` clean. UI: `npm run check` 0 errors / 322 files; `npm run build` ok; Playwright
**3 passed** (`ui/tests/smoke.spec.ts`: Today renders focus with comments hidden + tasks + focused capture;
palette → editor; editor selection → `/api/ui/state`). Run: `npm run build && npx playwright test` in `ui/`
(the config starts `cargo run -p atlas -- serve` on a throwaway workspace, port 7720; set `ATLAS_PW_CHROME` to a
Chromium binary if Playwright's pinned browser is not downloaded). Verified by hand: `atlas_context` over stdio
returns the state PUT into a live server on a real vault.


### Later additions (rounds 2–6 of feedback)
17. **Settings are generated** from the Config JSON schema (schemars; doc comments = descriptions);
    `GET/PUT /api/config` (toml_edit: only changed keys, comments kept), `GET /api/config/suggestions`
    (detect.rs: claude installs/accounts, fonts, VS Code themes, LaTeX Suite snippet files; cached 5 min).
    Rule: **every new feature adds its settings as Config fields**.
18. **Git**: `/api/git/{log,commit,status,diff,stage}`; commits classified you/claude × work/housekeeping.
19. **fs watcher**: raw notify watcher, `Access` events ignored (they fed an endless read→event loop).
20. **UI diagnostics**: `POST /api/ui/log` → `.atlas/cache/ui.log` (uncaught errors, layout overflow
    and shell-scroll self-checks) — how WebKitGTK-only bugs are seen.
21. **CodeMirror chrome is a theme extension** (`ui/src/lib/editor/theme.ts`): the base theme beats plain CSS.
22. **VS Code themes** (`ui.vscode_theme`, `/api/theme/vscode`): colors → tokens, tokenColors → `--syn-*`
    by VS Code scope matching; WCAG contrast floor on text/icon/scrollbar tokens.
23. **LaTeX Suite** (`ui/src/lib/editor/latex-suite.ts`, `/api/snippets`): user's own snippet file;
    tab stops renumbered (+1) because LaTeX Suite's `$0` is the first stop, CodeMirror's the last.
24. **Library** (`refs.rs`, `/api/refs`, `/api/refs/add`, `/api/refs/bibtex`): `refs/papers/<key>/info.yaml`;
    add by DOI (Crossref) / arXiv (+PDF); `refs.bib` rewritten after each add — byte-identical to the
    former `scripts/vault/refs_bib.py` on the 54 real entries.
25. **Table pane** for .tsv/.csv; **terminal panel** hide/show/right-dock/min size; Claude PTY env cleaned.


### PDF annotation (slice 2)
- `PUT /api/raw?path=&base_mtime=` — binary body (route-local limit 512 MB vs the 12 MB global JSON limit),
  atomic tmp+rename through the same `write_bytes` as text PUT, 409 on stale `base_mtime`. Before a file's
  first overwrite its original is kept at `.atlas/originals/<path>` (hard link when possible).
- `GET`/`HEAD /api/raw` send `x-atlas-mtime` (ms) so binary editors get their base mtime.
- The PDF pane is Atlas's own reader over one engine per document — PDFium in a worker, or pdf.js as the backup
  (Settings → PDF → engine) — with its text layer, links, find, outline, its own highlight,
  pen and text-note tools); marks are saved into the PDF's companion drawing `x.pdf.excalidraw`, never into the PDF.


### Drawing (slice 3)
- Pane kind `excalidraw {path}`; `specForPath` routes `.excalidraw` to it. An `.rnote` is an input: the Rnote plugin
  claims it (`claims = ["*.rnote"]`, its view converts it into an `.excalidraw` beside it and opens that). The core's
  Rnote pane, its `draw.rnote_open` / `draw.rnote_export` built-ins and `[draw] rnote_*` settings were removed
 .
- Settings `[pdf]` and `[draw]`.
- Playwright isolation: `ATLAS_PW_WS`, `ATLAS_PW_PORT`.


### Runs (slice 5)
- Runs moved out of the core into a workspace plugin (`<vault>/.atlas/plugins/runs/`); the core keeps only the
  generic plugin host: `GET /api/plugins`, `POST /api/plugins/{id}/data`, pane kind `plugin`. See [PLUGINS.md](guides/PLUGINS.md).


### Links & Bases (slice 4)
- `links.rs`: one mtime-cached parse of every `.md` (links + frontmatter) → `GET /api/backlinks`; Obsidian-style
  resolution. `bases/`: Obsidian `.base` evaluation (engine lifted from obsidian-web) → `GET /api/base`; typed
  `BaseCell` union. UI: "Linked mentions" footer, `![[x.base]]` live tables, Base pane. `[editor]` settings
  `backlinks`, `index_exclude`, `date_names`.
- `link_targets.rs`: the `[[` list over the same cache → `GET /api/link-targets?q=&from=`
  (`LinkTarget {path, link, kind, alias, title, near}`). Rank: name starts with the query, name holds every word,
  an alias or `title:` does (then `[[link|alias]]`), the path does; within each, the notes linked from or to `from`,
  then those changed in the last week, then the newest. Kinds by shape (a note with a `message-id` is mail); code and
  build output (`.aux`, `.pyc`…) only when an extension is typed. ~40 ms on a large real vault (44 k files, 1.3 k
  notes), ~0.2 s for the first scan. The editor (`md-complete.ts` `linkResult`) adds a preview of the selected note,
  a "new note" row, block ids after `#^`; the native capture window is meant to ask the same endpoint.


### Language servers (slice 1b)
- `lsp.rs`: `GET /api/lsp` (servers per language) + `GET /api/lsp/{lang}` WebSocket relay (stdio framing ↔ one
  JSON message per frame). UI: `@codemirror/lsp-client`, one client per language. `[lsp]` settings.
  Details: [LSP-language-servers.md](guides/LSP-language-servers.md).


### Commands, shortcuts, UX audit
- `GET /api/commands` now carries each script's `file` and `origin` (who added it, from git); `POST /api/commands`
  writes a new `.atlas/commands/<id>.toml` (no overwrite, no shadowing a built-in); manifests may set
  `timeout_secs`. `GET/PUT /api/keys` ↔ `.atlas/keys.toml` (`id = "Ctrl+Alt+X"`, `""` unbinds; toml_edit keeps
  comments). UI: `lib/keymap.svelte.ts` merges defaults < overrides for every command; `panes/Commands.svelte`.
- UX audit (`ui/ux/`, `npm run ux`, workspace command `ux.audit`): user journeys on a copy of a real vault.


### Round 14: send to Claude, tree git status, citations, LaTeX fixes
- **Send to Claude** (`ui.sendToClaude`, Ctrl+Alt+Enter): `@path#Lx-y` for the reported selection (or `@path`)
  pasted into the Claude terminal via `registry.terminals` (each Terminal registers ready/paste/focus).
- **Git status in the tree** (`files.git_status`): `lib/gitstatus.svelte.ts` (status → file change, folders get
  the loudest change below); refreshed with the tree, on window focus and after Git-pane stage/commit.
- **Citations** (`editor.citation_completion`): `citeSource` in `editor/md-complete.ts` — `@` in notes →
  `[@key]`, `\cite{…}` in notes and `.tex` (registered as ONE stable languageData function — see commit 0dda1f4).
- **LaTeX in .tex**: `texMathMode` decides math vs text (no more "whole file is math"); `${VISUAL}` snippets
  wrap a selection only. **LSP client**: answers server requests (`workspace/configuration`) and sends
  `workspaceFolders`.
- Shell fixes found by the UX audit: settings writes queued; `focusOrOpen` reveals a hidden panel; hiding the
  terminal panel moves keyboard focus out of it; `--accent-fg` token; `needs_args` built-ins hidden.


### Round 15: the audit's "missing" list, built
- **Today**: ‹ › browse days that have a log. **Bases**: double-click a property cell → `PUT /api/property`
  (`frontmatter.rs`: rewrites only that key's block). **Library**: drop PDFs → `POST /api/refs/pdf`
  (DOI/arXiv id from `pdftotext` → metadata, else named after the file). **Tables**: quick SVG plot
  (`components/Plot.svelte`; X = an increasing column else the row number). **Scheduled commands**:
  `schedule = "daily 03:00" | "every 2h" | "hourly"` (`schedule.rs`, `[automation] run_schedules`).
  **Graph** (`panes/Graph.svelte`, `GET /api/graph`).
- UX audit after: 116 steps, 0 broken, 0 slow, 0 missing; pane kinds 21/21.
