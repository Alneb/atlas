# Plugins v4 — the foundations (decided 2026-10-14: section 11; what is built: "Built so far")

The goal: a plugin system that is flexible yet robust enough to allow almost anything; plugins that can run code so they are fast; the papers Library kept separate, since it serves science and not every way of using the app; and the rule that **what is not for every vault is a plugin**.

This note says what a plugin can do today, what v4 adds, the shape of each addition, what is promised to stay stable, the order of building, and **five questions** at the end where the answer changes what gets built. Everything before the questions is my recommendation, written so there is something concrete to disagree with.

## Built so far

- 2026-10-14 — `atlas.shell.menu(where, fn)` (section 3.2): it does not depend on any of the five questions. `ui/src/lib/plugin-menus.ts`, test `plugin-menus.spec.ts`, described for authors in `PLUGINS.md` ("v4"). If the grouping by area (`atlas.shell.…`) is not wanted, renaming it is one line in `plugins.svelte.ts`.
- 2026-10-14 — `atlas.shell.statusItem(…)` (section 3.2): `ui/src/lib/plugin-status.svelte.ts`, drawn by `StatusBar.svelte`; same test.
- 2026-10-14 — the per-plugin log and the guard around every plugin callback (section 5, and decision 2 of section 11): `ui/src/lib/plugin-log.svelte.ts`, shown in Settings → Plugins; in memory for now.
- 2026-10-14 — `atlas.editor.registerFence` (section 3.1), `ui/src/lib/fences.ts`: the fence is mounted over its ordinary code block after rendering, so the markdown renderer and its cache know nothing of plugins.
- 2026-10-14 — distribution (section 6, as changed by decision 3): `plugin_install.rs`, `atlas plugin install / update / remove / list`, the same three in Settings. Always a copy in the vault; switched off on arrival; nothing deleted.
- 2026-10-14 — the helper (section 3.6): `helper.rs`, `[helper] run`, `atlas.helper.call / on / state / restart`, the event `plugin` on the existing event socket. As sketched, except: no `ready` first line is awaited (calls are written at once; the pipe holds them), no `start = "on"`, and calls go over HTTP (answers) with events over the socket.
- 2026-10-14 — what a plugin may do is listed under it in Settings (section 5); no confirm step when a plugin is switched on yet.
- 2026-10-14 — `atlas.fetch` and `atlas.secrets` (sections 3.4, 3.5) with `[permissions] net / secrets` (section 4): `plugin_net.rs`, `secrets.rs`. The secret store is the file fallback of 3.5 only; the keyring is not built. Added beyond the sketch: redirects only to listed hosts, and `saveTo` for binary answers.
- 2026-10-14 — after the first round: `atlas.editor.toolbar` (tools above a code file), `atlas.terminal.run` (a command typed and entered in the shell terminal), `atlas.capture` (text captured as the capture box does), `net = ["*"]` for any host. Example plugins grew to eight — wordcount, ttrpg, helper-python, run-tools, clip (with Linkwarden), ntfy (both ways, with a helper), memos — each installed as it is and used by a spec.
- 2026-10-14 — `atlas.shell.sideTool` (section 3.2), built as that section's note proposed: a block in the side zone (`side-tools.svelte.ts`, `specZone`, `SideId`). **Section 3.2 is now complete.**
- 2026-10-14 — the rest of section 3.1: `registerCompletion`, `registerKey`, `onPaste` / `onDrop`, `registerDecoration`, `extension` + `codemirror` (`ui/src/lib/editor/plugin-hooks.ts`). One thing the sketch missed: a plugin has no way to import the editor library, so the escape hatch needs Atlas to hand over its own copies of the modules (`atlas.editor.codemirror`).
- 2026-10-14 — `api` / `needs` in the manifest and `atlas.version` (sections 4, 5).
- 2026-10-14 — settings from a schema (section 3.7): `[[setting]]` fields in `plugin.toml`, a form in Settings, values written back into `[settings]` with comments kept; kinds text, number, toggle, list, choice. Different from the sketch in 3.7 in one way, on purpose: a value equal to its default is not written. The manifest stays strict (`deny_unknown_fields`): an unknown key is an error shown in Settings, not silently ignored — a typo should be seen (this replaces point 4 of section 9).
- 2026-10-14 — events (section 3.3), the part done in the page: `atlas.on("file:open" | "file:save" | "file:create" | "file:rename" | "file:delete" | "capture", fn)`, `ui/src/lib/plugin-events.ts`. `command` too (one place: `allCommands()`). Left: `app:start`, `vault:switch`, the tick; and file events for changes made outside Atlas with their kind (the core's watcher only says "these paths changed").

## 1. Where we are (v3, 2026-10-14)

A plugin is a folder `.atlas/plugins/<id>/` in a vault: `plugin.toml`, an optional `main.js` (`register(atlas)`, re-run on every save), an optional `view.js` (a pane), an optional data script in any language (started once per call), free-form `[settings]`. Through `atlas` (`PluginApi` in `ui/src/lib/plugins.svelte.ts`, 30 members) it can register blocks, row views, commands, `@` entity kinds and suggestions; read files, tables, thumbnails, note properties; query Bases; write one property; create a file; open things; follow what the user is looking at. Hot reload, on/off per vault, templates for a new plugin and a new block. One built-in plugin (the Library) is compiled into the app and only *gated* like a plugin.

Measured against "almost anything", eight things are missing: editor hooks, shell hooks, events, a native side that stays alive, network and secrets, distribution, robustness, and the Library actually living outside the core.

## 2. The shape of v4 in one paragraph

**The `atlas` object grows by area, the manifest declares what a plugin needs, and the core becomes the gate for everything that leaves the page.** A plugin's JavaScript still runs in the app's page (that is what lets a block draw with plain DOM and reload in 250 ms). What is new runs *through the core*: network calls, secrets, and a long-lived helper process. Because the core is in the path, it can enforce what the manifest declared, log it, and stop it. Every registration, old or new, returns its undo and is undone on reload or switch-off (the existing `own(pluginId, dispose)` rule) — no new lifecycle concept.

## 3. The API by area

Old flat names (`atlas.registerBlock`, `atlas.readText`, …) keep working for ever; the new members are grouped so the object stays readable. Each `register…` returns a function that undoes it.

### 3.1 `atlas.editor` — hooks into the one editor (2.2)

| member | what it does | shape |
|---|---|---|
| `registerCompletion(source)` | a completion source in notes and/or code | `{ trigger?: string \| RegExp, where?: "note" \| "code" \| "all", complete({ path, line, before, word }) → [{ label, detail?, insert, kind? }] \| Promise }` |
| `registerFence(name, render)` | draws a ```` ```name ```` block in live preview and reading view | `render(host, { source, path, props }) → cleanup` — the same signature as a block's, so a fence renderer and a block are one function |
| `registerKey(keys, run, where?)` | a key inside the editor, ahead of vim when asked | `run({ path, selection, replace(text), insert(text), line })`; returns `true` when it took the key |
| `onPaste(fn)` / `onDrop(fn)` | may turn pasted or dropped data into text | `fn({ text?, html?, files, path }) → string \| null \| Promise` (`null`: not mine) |
| `registerDecoration(pattern, render)` | marks or replaces every match of a pattern | `pattern: RegExp`, `render(match) → { class?: string, widget?: (host) => cleanup, title?: string }` |
| `extension(ext)` | **escape hatch**: a raw CodeMirror 6 extension | marked unstable (see question 2) |

Why small shapes instead of handing out CodeMirror: the editor library has changed its API under us once already, and a plugin written against `{ label, insert }` survives that; one written against `CompletionContext` does not. All five are implemented once in a new `ui/src/lib/editor/plugin-hooks.ts` (one compartment, reconfigured when the set of registrations changes), wired with one line in `create.ts` — tabs and embedded editors get them together.

### 3.2 `atlas.shell` — hooks into the frame (2.3)

| member | what it does |
|---|---|
| `menu(where, fn)` | rows in a right-click menu. `where`: `"file"`, `"tab"`, `"editor"`, `"block"`. `fn(target) → MenuItem[]` (the `ContextMenu.svelte` item: `label`, `run`, `icon?`, `hint?`, `detail?`). Plugin rows come after the app's, under a separator |
| `statusItem({ id, text, title?, run? })` | a cell in the status bar; returns `{ set(text), remove() }` |
| `sideTool({ id, title, icon, mount })` | a tool in the side panel next to Files / Search / Outline / Git |
| *(nothing new)* toolbar buttons | already there: a command with `icon` and `label` can be listed in any toolbar's `items:` |
| *(nothing new)* a part of Today | already there: Today is a page of blocks; a plugin's block is listed in it |

**How the side tool should be built (looked at 2026-10-14, not built):** the side panel's tools are a closed list of pane kinds today (`SIDE_KINDS = files, search, outline, git` in `side-panel.svelte.ts`; `isSideKind` asks `paneZone(kind)`; `dock.ts` and `SidePanel.svelte` both go through that list). Rather than a fifth special case, a side tool is **a block that says `zone: "side"`** when it is registered: `registerBlock(type, render, { title, icon, zone: "side" })`. The work is then in three places: the side panel's row of tools is built from `SIDE_KINDS` plus the registered side blocks; `sidePanel.kind` becomes a string id (a kind, or `block:<type>`); and `dock.ts` decides the zone from the spec, not only from its kind. `atlas.shell.sideTool` is then sugar over `registerBlock`.

The four menu builders that exist today (`sidebar.svelte.ts` for tabs, `Files.svelte`, `editor/menu.ts`, `Page.svelte` for blocks) each gain one call, `...pluginMenu("file", target)`.

### 3.3 `atlas.on(event, fn)` — events (2.5)

`file:open`, `file:save`, `file:rename`, `file:delete`, `app:start`, `vault:switch`, `capture`, `command` (any command run, with its id), `tick` (a schedule: `atlas.every("15m", fn)` is sugar over it). File events come from the core's watcher (so they also fire for changes made outside Atlas); `file:open` and `command` are UI-side. One typed union `PluginEvent` — a misspelt event name is a type error for an author using the shipped types, and a console warning otherwise.

### 3.4 `atlas.fetch(url, init)` — the network, through the core (2.6)

Same call shape as the browser's `fetch`, but the request is made by the core (`POST /api/plugins/{id}/fetch`): no CORS, a timeout (default 30 s), a size cap, and **only to hosts listed in the manifest** (`[permissions] net = ["linkwarden.example.org", "*.arxiv.org"]`). A header value may name a secret instead of carrying it: `headers: { Authorization: { secret: "token", prefix: "Bearer " } }` — the core fills it in, so the token never has to exist in the page.

### 3.5 `atlas.secrets` — per plugin and per vault, outside the vault's git (2.7)

`get(name)`, `set(name, value)`, `delete(name)`, `has(name)`. Stored in the desktop keyring (Secret Service on KDE) under `atlas/<vault id>/<plugin id>/<name>`; where there is no keyring (a headless `atlas serve`), a file `~/.config/atlas/secrets/<vault id>.json` with mode 0600. A settings field of kind `secret` (3.7) writes here, shows only "set / not set", and never puts the value in `config.toml`.

### 3.6 `atlas.helper` — a long-lived process per plugin (2.8)

This is the "plugins execute code so that they are fast" part, and what makes mail, SSH, a database or the Library possible outside the core.

```toml
[helper]
run = "\"$ATLAS_PLUGIN_DIR/bin/library-helper\""   # any language; cwd = the vault
start = "lazy"        # "lazy" (first call) or "on" (with the plugin)
```

- **Protocol**: one JSON object per line on stdin / stdout (the shape of JSON-RPC without the ceremony). Request `{"id": 7, "method": "search", "params": {…}}` → reply `{"id": 7, "result": …}` or `{"id": 7, "error": {"message": …}}`. A line without `id` from the helper is an **event** `{"event": "imported", "data": {…}}`, delivered to `atlas.helper.on("imported", fn)`. stderr is the helper's log.
- **From the page**: `await atlas.helper.call("search", { q })`, `atlas.helper.on(event, fn)`, `atlas.helper.state()` (`stopped`, `starting`, `ready`, `crashed`). Calls go over the existing websocket, so a reply costs one round trip, not a process start.
- **Lifecycle, in the core** (`crates/atlas-core/src/helper.rs`, new): started in its own process group; a first line `{"ready": true, "protocol": 1}` is awaited (5 s) before calls are sent; on exit it is restarted with back-off (1 s, 2 s, 4 s … capped at 1 min, given up after five crashes in ten minutes, with a toast and a line in the plugin's log); stopped — whole group — when the plugin is switched off, the vault is closed, or Atlas exits. Calls in flight when it dies are answered with an error, never left hanging.
- **Large data** does not go through JSON: the helper writes a file under `$ATLAS_PLUGIN_CACHE` and returns its path; the page reads it with `fileUrl` / `thumbUrl` as today.
- The data script of v1 stays (one call, one process) — right for an indexer that runs for 30 ms twice a day.

### 3.7 Settings from a schema (2.4)

```toml
[[setting]]
key = "server"
label = "Server address"
kind = "text"            # text · number · toggle · list · choice · secret · folder · file
hint = "https://…"
default = ""
```

The same field shapes and the same form code as a block's options (`SettingField.svelte`), so a plugin gets a page in Settings with no code. Values are written to that plugin's `[settings]` in `plugin.toml` — except `secret`, which goes to 3.5. `atlas.plugin.settings` stays how they are read; `atlas.onSettings(fn)` tells a running plugin they changed.

## 4. The manifest in v4

```toml
title = "Linkwarden"
version = "0.3.0"
api = 4                       # the API the plugin was written for
needs = ">=0.9"               # the Atlas version; older → listed as "needs a newer Atlas", not loaded
[permissions]
net = ["links.example.org"]   # hosts atlas.fetch may reach
secrets = true                # may use atlas.secrets
helper = true                 # may start its helper
notes = "write"               # "read" (default) or "write": createFile / writeProperty / saving a note
```

A v3 manifest (no `api`) keeps loading exactly as today with today's rights; it simply cannot use `fetch`, `secrets` or `helper` until it declares them.

## 5. Robustness (2.9) — and what permissions honestly are

- **Permissions are a shown, declared list, enforced where the core is the gate.** When a plugin is switched on, Settings shows what it asked for in plain words ("talks to links.example.org · keeps a secret · runs a program of its own · writes notes") and the user confirms once; a later change of the list asks again. `fetch`, `secrets`, `helper` and writes are refused by the core without the permission. **This is not a sandbox**: the JavaScript runs in the app's page and a hostile plugin could reach around the API. The model stays "a vault's `.atlas/` is trusted, read it before opening someone else's vault"; the list protects against mistakes and surprises, not against malice. (Question 1 is whether that is enough.)
- **An error log per plugin**: `.atlas/cache/plugins/<id>.log` (exceptions in `register`, `mount`, an event handler; the helper's stderr; refused calls), a "Log" button next to the plugin in Settings, and a badge when there is something new.
- **A plugin that hangs.** A `mount` that awaits for ever is detected (a "still loading — stop?" row after 5 s). A synchronous endless loop freezes the page and cannot be interrupted from inside it; the defence is a **start-up guard**: the id of the plugin being loaded is written to `.atlas/cache/loading`, cleared when it returns; if Atlas starts and finds a name there, that plugin starts switched off with a toast saying why.
- **API version**: `atlas.version` (the API number) and `atlas.app` (the Atlas version); `needs` checked before loading.

## 6. Distribution (2.10)

- `atlas plugin install <folder | git URL | .zip / .tar.gz>` and the same from Settings → Plugins ("Install…"). Git is cloned, an archive unpacked; the manifest is read and its permissions shown **before** anything is switched on.
- ~~Shared between vaults without copying~~ **(not done, by decision 3 of section 11: a plugin is always copied into its vault; the rest of this bullet is kept only as the record of what was proposed)**: installed plugins live once in `~/.local/share/atlas/plugins/<id>/`; a vault uses one by listing it, `[plugins] use = ["linkwarden"]`, and keeps its own settings for it in `.atlas/plugin-settings/<id>.toml`. A folder in the vault's own `.atlas/plugins/` wins over a shared one of the same id (that is how one is developed or forked). Each vault stays self-contained in what it *says*; the code it names must be installed, and a missing one is listed as "not installed" with the place to get it.
- `atlas plugin update [id]` (git pull, or re-fetch the archive), `atlas plugin remove <id>` (asks; the vault's settings file is kept).

## 7. For authors (2.11)

- `atlas.d.ts`, generated from `PluginApi` at build time and shipped; "New plugin" writes a `jsconfig.json` pointing at it, so any editor completes and checks `atlas.` with no build step.
- `atlas plugin test <folder>`: loads the plugin in a headless page against a throwaway vault, runs its `test.js` (`export default async function (atlas, t)`), prints pass / fail. The same harness the app's own plugin specs use.
- `plugins/`: one small plugin per area (a fence renderer, a menu entry, a status item, a fetch with a secret, a helper in Python and one in Rust).

## 8. The proofs

- **The Library becomes a plugin with a helper (2.12).** `refs.rs`, `connector.rs` and the PDF text / thumbnail code move from `atlas-core` into a crate `plugins/library/helper/`; `Library.svelte` becomes the plugin's `view.js` + blocks; the `@` / `\cite{` completion becomes a `registerCompletion`. If any of that cannot be done with sections 3–6, the API is what gets fixed, not the Library special-cased. Its tests (import 3 000 entries, list, search, the connector) keep their current timings as the bar.
- **Language servers as plugins (2.13)**: a plugin declares `[[language]] name, files, server command, how to find or install it, settings`; the table in the core goes away.

## 9. What is promised to stay stable

1. Everything in `PluginApi` up to v3 keeps its name and behaviour.
2. The small shapes of section 3 (completion item, menu item, fence renderer = block renderer, event names).
3. The helper protocol, versioned by the `protocol` number in its first line.
4. The manifest keys of section 4; unknown keys are ignored with a note in the log, never an error.

Not promised: `atlas.editor.extension` (raw CodeMirror), any CSS class of the app other than the documented variables, and the DOM around a block.

## 10. Order of building

**State on 2026-10-14 (end of the day's work):** steps 1–8 of the list below are built (see "Built so far" at the top), except: a confirm when a plugin with permissions is switched on (it is installed switched off and its permissions are listed, which covers the same ground), the watchdog for a `mount` that never returns, events `app:start` / `vault:switch` / tick, the desktop keyring, and a declared listening port for a helper. Step 9 has the examples but not the type definitions or `atlas plugin test`. Steps 10 (the Library and the language servers as plugins) and 11 (the docs rewritten as one text) are not started; `PLUGIN-API.md` is the one-page reference meanwhile.

### The order as it was planned

Each step lands green with a spec and an example plugin, and is usable on its own:

1. manifest v4 + permissions shown + per-plugin log (the frame everything else reports into)
2. settings from a schema
3. events
4. shell hooks (menus, status item, side tool)
5. editor hooks
6. `fetch` + secrets
7. the helper
8. distribution, shared plugins
9. types, test harness, examples
10. the Library moved out; language servers as plugins
11. `PLUGINS.md`, `EXTENDING.md`, `DEVELOPING.md` rewritten around it

Steps 1–5 are UI-side and small; 6–7 are the core work; 10 is the largest single piece and the real test.

## 11. Decided (2026-10-14)

The answers to the questions below: no sandbox; flexible and robust, the design's choice; plugins copied into each vault; question 4 to be put in plain words; design for a tabletop RPG plugin as an example plus every plugin already asked for; and new Markdown files created in the right folders.

1. **No sandbox.** Plugins run in the page; the core gates the network, secrets and helpers; permissions are a shown list.
2. **Flexible and robust, my choice:** both. The small stable shapes of section 3.1 are the normal way, and `atlas.editor.extension(ext)` hands over the raw editor for what they do not cover, marked unstable. Robust means: every plugin callback is called inside a guard, a failure is written to that plugin's log (`plugin-log.svelte.ts`) and takes away only that plugin's contribution, never the editor or the menu.
3. **Copied into each vault.** A plugin always lives in the vault's `.atlas/plugins/<id>/`; there is no machine-wide plugin folder and no `[plugins] use`. `atlas plugin install <folder | git URL | archive>` copies it in; `update` replaces the copy (settings kept); the same plugin in two vaults is two copies, each vault complete on its own. **Section 6 is changed accordingly: ignore its "shared between vaults" bullet.**
4. **Not understood as asked — so, in plain words, and decided by me until told otherwise:** the Library (papers) is fast because part of it is compiled Rust code. When it becomes a plugin, that compiled part has to live somewhere and be built by something. It stays in this repository and is built together with Atlas, so installing Atlas still gives a working Library with nothing extra to do. Nothing changes for whoever installs Atlas.
5. **The plugins to design for** — a tabletop RPG plugin as the example of one written for fun, and every plugin already asked for: web clippers per site, Linkwarden, SSH hosts, mail, ntfy, Paperless, Immich, FreshRSS, copyparty, Jellyfin / audiobookshelf / TubeArchivist / Suwayomi / kiwix, memos, the budget, calendar and contacts, printing, run tools for Rust / Python / LaTeX, language servers, the Library, collections of books / films / games. What each family needs from the API is the table in section 12.
6. Not about plugins: new notes must land in the right folder — built the same day (`NOTES-SYSTEM.md`, "Where a new note goes").

## 12. What the wanted plugins need (the check of this design)

| plugin family | needs | covered by |
|---|---|---|
| **TTRPG** (characters, sessions, dice, stat blocks, initiative, maps) | notes of a kind created in their own folder; a fenced block per stat block / dice roll; inline dice in text; a table of characters; a side tool for the session; commands with keys; pictures | templates with `create_in:` · `registerFence` · `registerDecoration` + `registerCompletion` · Bases / `query` · a side tool · `registerCommand` · blocks. **Nothing needs a helper or the network: this plugin is pure files + JavaScript, and should be the first full example.** |
| **Server services** (Linkwarden, Paperless, Immich, FreshRSS, memos, Jellyfin…, the budget, ntfy out) | calls to a server with a token, a block listing things, a mention kind (`@doc:`), "send this file there" in the file menu, a settings page | `atlas.fetch` + `atlas.secrets` · blocks · `registerEntities` · `shell.menu("file")` · settings from a schema |
| **Things that stay connected** (mail, ntfy in, SSH, calendar sync) | a process that lives as long as the plugin, events pushed to the page, a status cell | `atlas.helper` · `helper.on` · `shell.statusItem` |
| **Web clippers** | a URL in → a note out from a template, per site rules, from the capture box | `atlas.fetch` · `createFile` / new note with a template · an event `capture` |
| **Run tools, language servers** | a toolbar on a code tab, a process per run with its output streamed, problems | a helper · **a gap: a per-file tool bar and a problems source are not in sections 3.1–3.2; they are added to step 5 of the order as `atlas.editor.toolbar` and `atlas.editor.diagnostics`** |
| **Collections** (books, films, games) | a note kind, a gallery view, a lookup by title on a web service | templates · `registerView` · `atlas.fetch` |
| **The Library** | fast native code, a pane, completion in the editor, a listening port | a helper · `view.js` · `registerCompletion` · **a gap: a helper that listens on a port must declare it (`[permissions] listen = [23119]`)** |

Two gaps found by this table and added to the design: an editor tool bar with a diagnostics source, and a declared listening port for a helper.

## 13. The questions as they were asked

1. **Is "declared, shown and enforced by the core — but not a sandbox" enough?** The alternative is to run a plugin's code in an isolated frame or worker. That would contain a hostile plugin, but a block could no longer draw with plain DOM into the page: every block would be its own embedded frame (slower, no shared styles, harder hover sync), and all the existing plugins would have to be rewritten. *Recommended: not a sandbox* — you write or read the plugins you run; the helper and the network are where real damage could happen, and those are gated.
2. **A raw CodeMirror escape hatch (`atlas.editor.extension`)?** With it a plugin can do anything the editor can (a vim-mode tweak, a custom widget) at the price of breaking when the editor library changes. *Recommended: yes, clearly marked unstable*, because "almost anything" is the stated goal.
3. **Shared plugins: installed once per machine and named by each vault (section 6), or always copied into the vault?** Named-once means one update serves the work and the personal vault, but a vault moved to another machine needs its plugins installed there. Copied means fully self-contained vaults and drift between copies. *Recommended: installed once, named per vault, with a local folder overriding.*
4. **The Library's helper: Rust, inside this repo (`plugins/library/`), built and installed with the app?** Or a separate repository from the start? *Recommended: in this repo for now* — one build, one gate — and split out when the repo is published (roadmap step 11).
5. An open one, to think about rather than pick: **when you imagine a plugin you would write yourself on a free evening — what is it, and what would it need to touch?** If it is not covered by sections 3.1–3.6, that is the gap to design for before building.
