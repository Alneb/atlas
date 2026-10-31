# Extending Atlas from inside a vault

**Read this before adding anything to a vault.** It is for whoever extends Atlas — the user, or any AI agent working in a vault — and it is deliberately self-contained: every extension below is a plain file in the vault, takes effect on save, and needs **no rebuild of Atlas and no change to Atlas's source**. Print it in any vault with `atlas guide`.

## Use Atlas's tools before the files

Agents use the MCP before touching files directly. An agent working in a vault reaches it through **`atlas mcp`** first (register it in the agent's MCP config, e.g. `.mcp.json`): `atlas_search` to find, `atlas_new_note` (with `atlas_templates`) to create a note, `atlas_context` for what the user is looking at, `atlas_open` to show a file, `atlas_run` / `atlas_commands` for the vault's commands, and the plugins' tools (`email_*`, `ssh_*`, `claude_usage_*`, …). A tool keeps the vault's templates, properties, indexes and the user's open editors right; a direct file edit can miss all of them. Edit a file directly only for what no tool does — and say so. The MCP server repeats this to every agent that connects (`crates/atlas/src/mcp.rs`, `INSTRUCTIONS`).

## The one rule about scope

> **If it is about this vault's work, it lives in this vault's `.atlas/` (or is a page/note in the vault). If every vault would want it, it belongs in Atlas's core.**

Runs of a physics code, lecture notes, a reading workflow, a personal habit tracker: vault. A new kind of block every vault could use, a setting, a fix to rendering: core (then read `DEVELOPING.md` in the Atlas repo, `~/Projects/atlas/docs/`). When unsure, build it in the vault first; moving a working plugin into the core later is easy, the reverse is not. Never put vault-specific code in the core: the separation is deliberate.

Two more boundaries:
- **Notes are the user's knowledge; agent files are not.** Never write memories, session logs or plans into `notes/`, `log/` or other note folders, and never put the user's knowledge into `docs/memory/`. **Write into the user's notes only when the user explicitly asks for that piece of writing** (a report, a note, an edit they name) — never on your own initiative, and never add `[[links]]` from their notes to agent files. The vault says which files are the agent's with `[editor] index_exclude` in `.atlas/config.toml` (default `docs/memory`; a vault whose whole `docs/` is the agent's sets `["/docs", "/AGENTS.md", "/CLAUDE.md"]`): Atlas leaves those out of links, backlinks, the graph, `[[` completion, Bases, tasks, quick open, the activity list and search (the Search pane's Claude switch includes them); they show only in the file tree.
- **Nothing irreversible without a confirm.** Never overwrite or delete a user's note; propose, or write a new file.

## Pick the lightest rung that does the job

| you want to… | use | file(s) | skill needed |
|---|---|---|---|
| change a behaviour or the look within what exists | a setting | `.atlas/config.toml` (or Settings, Ctrl+,) | none |
| rebind or add a shortcut | keys | `.atlas/keys.toml` (`"command.id" = "Super+X"`, `""` unbinds) | none |
| restyle something | a CSS snippet | `.atlas/snippets/<name>.css` | a little CSS |
| a screen made of existing blocks | a page | `<Name>.page` (arrange it by hand in the app) | none / YAML |
| the same tabs for a task, one keystroke away | a workspace | `.atlas/workspaces/<name>.json` (save it from the app) | none |
| keep a file, heading, search, command or web page at hand | a bookmark (or a pin) | `.atlas/bookmarks.yaml` (Ctrl+Alt+B adds one) | none / YAML |
| change what the sidebar shows: its buttons, an outline or a calendar in it | the sidebar's page | `.atlas/sidebar.page` ("Sidebar: arrange its blocks…") | none / YAML |
| a table / board over notes' properties | a base | `<name>.base` | YAML |
| the same start for a kind of note | a template | `templates/<kind>.md` (`{{date}}`, `{{time}}`, `{{title}}`; Super+N uses it) | none |
| an inbox to go through, next steps of projects, a hierarchy by `up:` | the `review` block, `from: next-actions`, the `tree` view | in a page or a note (`NOTES-SYSTEM.md`; "Starter kit: add…" copies a working set) | YAML |
| live data inside a note | a block in the note | ```` ```view ```` fence with YAML | YAML |
| a computed value inside a sentence; data under a heading that blocks and formulas below it use | an inline expression; a section property | `` `= note.budget - section.cost` ``; `cost:: 40` | a little JavaScript |
| run a script from the palette, on a key, or on a schedule | a command | `.atlas/commands/<id>.toml` | shell |
| a small tweak in code, no ceremony | the vault's startup script | `.atlas/init.js` | JavaScript |
| a new block, command, mention kind, or a whole pane | a plugin | `.atlas/plugins/<id>/` | JavaScript (+ any language for its data) |

JavaScript is the only scripting language (decision D23); there is no Lua.

## Recipes

### A page
```yaml
# Reading.page
title: Reading
rows:
  - columns:
      - [{view: pdf, path: refs/papers/georges1996/paper.pdf, height: 700}]
      - [{view: editor, path: refs/papers/georges1996/georges1996.md, height: 420}, {view: calendar, from: tasks}]
    widths: [3, 2]
```
A block is a bare name (`tasks`) or `{view: <type>, …options, title: …}`. Open the page and press **Arrange** to reshape it by hand. Block types, their options and the format: [PAGES.md](PAGES.md).

### Bookmarks and the sidebar
```yaml
# .atlas/bookmarks.yaml — each bookmark is also a command (bookmark.<name>) that can have a shortcut
pins: [log/today.md, {view: library}]
bookmarks:
  - {path: notes/dmft.md, heading: Self-energy}
  - {search: "tag:todo"}
  - {command: refs.bib, title: Rebuild refs}
```
```yaml
# .atlas/sidebar.page — top to bottom; a toolbar's items are command ids
rows:
  - [{view: toolbar, items: [ui.today, ui.files, ui.search, {command: refs.bib, icon: library, title: Rebuild refs}, plugins]}]
  - [pins]
  - [bookmarks]
  - [tabs]
  - [{view: calendar, from: tasks}]
  - [{view: toolbar, items: [ui.panel, ui.claude, spacer, ui.settings, ui.theme]}]
```
Formats and rules: `SHELL.md`.

### A block in a note
````markdown
## This week
- [ ] read Georges 📅 2026-10-14

```view
type: calendar        # list | table | calendar | any block type (library, pdf, runs.plot…)
from: section         # section (default) | note | tasks | folder:<dir> | base:<file.base>
```
````

### A value in a sentence
```markdown
## Run A
run:: CDMFT_2x2_U8
started:: 2026-10-01
Running for `= days(section.started)` days; `= tasks.filter(t => !t.done).length` things left.
```
`note` is the frontmatter, `section` the `key:: value` lines of the section and of those around it, `props` both. Blocks under the heading read the same properties. Everything else: `EXPRESSIONS.md`.

### A command
```toml
# .atlas/commands/refs.bib.toml   (the id is the file name)
title = "Papers: rebuild refs.bib"
description = "Regenerate refs/refs.bib"
run = "python3 scripts/vault/refs_bib.py refs/papers refs/refs.bib"   # sh -c, cwd = the vault
keys = "Ctrl+Alt+B"          # optional
schedule = "daily 03:00"     # optional: "hourly", "every 2h", "daily HH:MM"
timeout_secs = 120           # optional (default 30)
```
Arguments arrive as JSON on stdin; stdout is the result (parsed as JSON when it parses). `$ATLAS_ROOT` is the vault. It appears in the palette at once, and `atlas cmd refs.bib` runs it from a terminal. A scheduled one that could do nothing this time (a server not reachable) prints `{"skipped": "why"}` and exits 0: logged, never a failure notice; `"notices": [{"title": …, "body": …, "level": "success", "open": "a/note.md"}]` in its answer become notices.

### The startup script
```js
// .atlas/init.js — reloaded on every save; same API as a plugin
export function register(atlas) {
  atlas.registerCommand({ id: "today-note", title: "Open today's note", keys: "Ctrl+Alt+T",
    run: () => atlas.open(`log/${new Date().toISOString().slice(0, 10)}.md`) });
}
```

### A plugin

Someone else's plugin is copied into the vault with `atlas plugin install <folder | git address | archive>` (or Settings → Plugins → Install…); it arrives switched off, with what it may do listed. `atlas plugin update <id>` keeps your settings; `atlas plugin remove <id>` moves it to `.atlas/trash/`.
```
.atlas/plugins/habits/
  plugin.toml      title = "Habits"            (only `title` is required)
  main.js          registers blocks / commands at startup and on every save
  data.py          optional: a script that returns JSON (any language)
  view.js          optional: a pane of its own (add `rail = true` for a sidebar button)
```
```toml
# plugin.toml
title = "Habits"
data = "python3 \"$ATLAS_PLUGIN_DIR/data.py\""   # stdin {settings, args} → stdout JSON
[settings]
dir = "log"
```
```js
// main.js
export function register(atlas) {
  // a block usable in any note or page as `type: habits.streak`
  atlas.registerBlock("habits.streak", (host, block) => {
    host.textContent = "…";
    atlas.data({ habit: block.options.habit }).then((d) => { host.textContent = `${d.streak} days`; });
    return atlas.onFilesChanged(() => { /* redraw */ });   // return a cleanup function
  });
  atlas.registerCommand({ id: "log", title: "Habits: log today", run: () => atlas.pick({ /* … */ }) });
}
```
Name a plugin's blocks `<plugin id>.<name>`: a dotted type waits for its plugin and redraws when the plugin is edited. Style with the app's CSS variables (`--bg`, `--bg-alt`, `--text`, `--text-muted`, `--accent`, `--border`, `--radius`, `--font-mono`, `--ui-scale`) so the plugin follows the theme; follow `UI-STYLE.md`.

**What `atlas` offers** (everything on one page: `PLUGIN-API.md`; full signatures with comments: `ui/src/lib/plugins.svelte.ts`, interface `PluginApi`; how and why: `PLUGINS.md`):
- files: `open` (`{ beside: true }` opens next to the active tab), `openTable`, `readText`, `createFile`, `fileUrl`, `thumbUrl`, `table`, `onFilesChanged`
- notes as data: `noteProps`, `writeProperty`, `query` (Bases YAML over all notes)
- what the user is looking at: `context`, `onContext`, `hover`
- the quickest start: **Settings → Plugins → New block** asks for a name and writes `.atlas/plugins/<name>/` with a manifest and a `main.js` holding one working block (`<name>.block`, with one option and its form field), opens the code, and the block is usable at once
- contributions: `registerBlock` (a third argument `{ title, options: [{ key: "goal", label: "Goal", kind: "number" }] }` names the block and gives it an Options… form in pages), `registerView` (a row view), `registerCommand`, `registerEntities` (an `@prefix:` mention kind), `registerSuggestion`
- a program of your own, kept running: `[helper] run = "…"` in `plugin.toml`, then `await helper.call("method", params)` and `helper.on("event", fn)` — JSON lines on its stdin / stdout, any language
- the network: `fetch(url, { headers: { Authorization: { secret: "token", prefix: "Bearer " } } })` — through the core, to hosts listed in `plugin.toml` (`[permissions] net = [...]`); `secrets.set / get / has / delete`
- events: `on("file:save", (e) => …)` — also `file:open`, `file:create`, `file:rename` (`e.from`, `e.to`), `file:delete`, `capture`; about what is done in Atlas (changes from outside: `onFilesChanged`)
- the editor: `editor.registerFence("statblock", (host, { source, path, props }) => …)` draws every ```` ```statblock ```` fence in notes; `editor.registerCompletion`, `editor.registerKey("Ctrl+Alt+J", (t) => t.insert("…"))`, `editor.onPaste`, `editor.onDrop`, `editor.registerDecoration(/\bd20\b/, () => ({ class: "dice" }))`; and `editor.extension(…)` with `editor.codemirror` for anything else (unstable)
- the frame: `shell.sideTool({ id, title, icon, mount })` — a tool of yours in the side panel; `shell.menu(where, fn)` — rows in the right-click menu of a `"file"`, a `"tab"`, the `"editor"` or a page `"block"`: `atlas.shell.menu("file", (t) => t.path.endsWith(".tsv") ? [{ label: "Plot this table", run: () => … }] : [])`; `shell.statusItem({ id, text, run? })` — a cell in the status bar, returns `{ set(text), remove() }`
- composing: `mountBlock` (draw any block inside yours), `other(id)` (another plugin's settings and data), `plot`, `pick`, `toast`
- its own: `plugin` (manifest and settings), `data(args)`, `path`. Declare the settings in `plugin.toml` as `[[setting]]` (`key`, `label`, `kind`: text / number / toggle / list / choice, `hint`, `default`) and Settings → Plugins gives the plugin a form; the values land in its `[settings]`

Examples to copy from: in the Atlas repository, `plugins/examples/wordcount/` (a block and a command in thirty commented lines) and `plugins/examples/init.js` (three small commands); in a research vault, a Runs plugin in `.atlas/plugins/runs/` (data script + blocks + a pane) and a Lectures plugin in `.atlas/plugins/lectures/` (a command with a chooser).

## Checking your work

- Everything above reloads on save: look at the app (or `http://localhost:5173` in the dev loop). A broken plugin shows its error as a toast and in Settings → Plugins; a broken page shows its error in place.
- The app's own log of UI errors: `.atlas/cache/ui.log`.
- From a terminal: `atlas cmd <id>` runs a command; `atlas open <file>` opens a file in the running window; `atlas mcp` gives an agent the same commands as tools.
- Try changes on a **copy** of the vault when they type into notes (the editor autosaves).

## When the vault is not enough

If the need is generic — a block every vault should have, a missing API on `atlas`, a setting, a rendering bug — it is a change to Atlas itself. That is a normal software change with gates: read the Atlas repository's `docs/CONTRIBUTING.md` and `docs/guides/DEVELOPING.md`. Prefer adding one small generic primitive to the core and keeping the specific part in the vault.
