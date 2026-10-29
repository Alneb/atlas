# The plugin API on one page (API 9)

For someone writing a plugin. This page says **what exists and how to call it**; why each piece is the way it is, and how it is built, is in [PLUGINS.md](PLUGINS.md) ("v4"). The source of truth is the interface `PluginApi` in `ui/src/lib/plugin-api.ts`: if this page and that file disagree, the file is right and this page needs fixing.

Working examples to copy from, in `plugins/`: `wordcount/` (smallest), `ttrpg/` (most of the page side), `helper-python/` (a helper process), `run-tools/` (Run / Test above code files), `clip/` (a web page into a note, and Linkwarden), `ntfy/` (to and from the phone), `memos/` (a line to a memos server), `ssh/` (a pane per host — the Files pane over sftp — opened with `openView`), `email/` (a full pane: folders, list, reading view, replies).

## A plugin is a folder

```
.atlas/plugins/<id>/          id: letters, digits, - and _
  plugin.toml                 the manifest (only `title` is required)
  main.js                     export function register(atlas) { … }   — runs at start and again on every save
  view.js                     export default function mount(host, atlas) { … }   — optional: a pane of its own
  anything else               a data script, a helper, styles, pictures
```

Everything a plugin registers is undone when it reloads or is switched off; you never clean up registrations yourself. A function you hand to Atlas may throw: the failure is written to the plugin's log (Settings → Plugins → "N problems") and costs only that one row, block or key.

Get one: **Settings → Plugins → New block / New plugin** writes a working one; `atlas plugin install <folder | git address | archive>` copies someone else's in (switched off until you switch it on).

## The manifest — `plugin.toml`

```toml
title = "TTRPG"                       # required
description = "one line"
icon = "table"                        # an app icon name
version = "0.1.0"                     # shown
api = 4                               # the plugin API it was written for
needs = ">=0.1"                       # the oldest Atlas it works with (older: listed with the reason, not loaded)
keys = "Ctrl+Alt+R"                   # default key for its pane
rail = true                           # a tile for its pane among the apps atop the left bar (a vault may hide or move it: [ui] apps_hidden / apps_order)
view = "view.js"                      # default when the file exists
main = "main.js"                      # default when the file exists
opens = ["*.tsv", "runs/**"]          # files its pane offers to open ("Open with…")
claims = ["*.epub"]                   # (API 7) files its pane is the DEFAULT view of: a click in the tree or a link opens
                                      #   them there, unless the vault's [files] open_with says otherwise; implies opens
data = "python3 \"$ATLAS_PLUGIN_DIR/data.py\""   # a script run once per atlas.data(args) call
timeout_secs = 30

[settings]                            # starting values only — the vault's own are in .atlas/plugin-settings/<id>.toml
dir = "runs"

[[setting]]                           # the settings as a form in Settings (one table per field)
key = "dir"
label = "Folder"
kind = "text"                         # text · longtext (several lines: a box) · number · toggle · list · choice (+ choices = [...]) · secret · records
hint = "where the runs are"
default = "runs"
when = { mode = "local" }             # shown and saved only while the field `mode` is "local" (or ["a", "b"], true / false)
group = "Paths"                       # drawn with the other "Paths" fields under a heading that starts closed
suggest = "folders"                   # text only: the [helper] method answering [{value, label}] — what it finds on the
                                      #   machine, offered under the box when the form opens (the Claude plugin's commands)

[[setting]]                           # a list of cards: [[settings.hosts]] tables, the first is the main one
key = "hosts"
kind = "records"
add = "Add host"                      # the button's label
name = "name"                         # the field that names a card (default "name"; added when not declared)
actions = [{ label = "Connect", command = "connect", when = { kind = "ssh" } }]   # on each card: runs your command with { setting, record }
list_actions = [{ label = "Import…", command = "import" }]                         # under the list: { setting }
fields = [
  { key = "kind", kind = "choice", choices = ["ssh", "mosh"], default = "ssh" },
  { key = "password", kind = "secret" },                                         # kept as hosts.<card name>.password
  { key = "token", kind = "secret", readonly = true },                           # shown as Set / Not set yet, set by the plugin
]

[permissions]                         # nothing outside the page unless it is written here
net = ["links.example.org", "*.arxiv.org"]   # or ["*"]: any host
secrets = true
exec = ["pandoc"]                     # programs a JavaScript helper may run (atlas.exec): by name, on the PATH

[helper]                              # a program of its own, kept running
run = "python3 -u \"$ATLAS_PLUGIN_DIR/helper.py\""
start = "open"                        # optional: start it with the vault (it listens for something itself);
                                      # default "call": at the first call
idle = "10m"                          # optional (API 15): stopped after this long with no call, started again by
                                      # the next — for a helper that only answers; unset: it runs until Atlas stops

[[tool]]                              # offered to agents (`atlas mcp`) as <plugin id>_<name>; needs [helper]
name = "open"
description = "what it does and when to use it"   # the agent reads only this
input = { host = "string", wait = "number?" }     # or { type, description, optional = true } per key
method = "open"                       # the helper method (default: the name)
secrets = ["token"]                   # handed to the helper with each call; "*" = all of the plugin's
timeout_secs = 60                     # how long a call may run (default 60); the agent's bridge waits as long
schedule = "every 1h"                 # optional: called with {} on this schedule while the vault is served (a sync)
on = "capture"                        # optional: called with { text, path, line } after every capture, from any door
template = "weather"                  # optional: answers {{weather.…}} in a note made from a template (below)
```

A plugin's modules (`main.js`, `view.js`) are loaded from their own URL, so they import as any web module does: by a relative path, statically or with `import()`, and a sibling plugin's file as `../zip/zip.js` — see "A plugin's own files by URL" below. Since API 9 modules load by URL, so dynamic imports and `import.meta.url` work too.

An unknown key is an error shown in Settings (a typo should be seen), not ignored.

- **`schedule`** uses the vault commands' words (`every 30m`, `every 2h`, `daily 03:00`, `hourly`; 5-minute floor) and runs in the server's helpers, recorded in `.atlas/cache/schedule.json` / `schedule.log` as `plugin.<id>.<tool>`; a failure is a notice. An answer's `summary` is what the log keeps. Example: `catalog-letterboxd`'s `sync`.
- **`on = "capture"`**: after a capture is written — the app's box, the phone, the desktop's capture window, `atlas capture`, an agent — the tool runs in the background (`capture_hooks.rs`); the capture never waits for it. Answer `{ skipped }` to leave it alone, or `{ path, notice? }` (a note): the capture's line gets ` → [[note]]` and the user the notice. Example: the catalog's `capture`, which files a link or identifier and never searches on plain words.
- **`on = "fs"`**: called with `{ paths }` (vault-relative) for each batch of files the vault's watcher saw change: Atlas's own writes, Syncthing's, any program's; never `.atlas/cache` or the trash. One call at a time; the batches that arrive meanwhile are joined into the next call (`capture_hooks.rs spawn_fs`). Example: the Syncthing plugin's `scan`.
- **`on = "log"`**: today's log was just made by the log card's button (`POST /api/log/today`, `capture_hooks::log_made`): the tool runs in the background with `{ text: "", path, line: 1 }`. Example: the Weather plugin's `log_made`, which writes the day's weather on it.
- A helper is restarted on its next call once its `plugin.toml` is newer than the running helper (an `atlas plugin update`, a copy): the new code runs without restarting Atlas.
- **A tool as a view's source**: a ```` ```view ```` block with `from: plugin:<id>/<tool>` (and `args:`, the tool's input) shows the tool's answer in any view (calendar, list, table…). The answer becomes rows by its shape (`views::plugin_rows`): an array of objects, or the first array in an object (`{events: […]}`). A row's title is `title`, `summary` or `name`; its date is the day of `date`, `start` or `due`; it opens `path`, or a `source` that is a note; every other plain field is a prop. The call is an ordinary tool call, with the plugin's permissions and secrets (`views::from_plugin`, asked by the server's `POST /api/view`). Example: the DAV plugin's events in the calendar view, `type: calendar` / `from: plugin:dav/events` / `args: {to: 2026-12-31}`.
- **`template = "<name>"`**: the tool provides a template value. A note made from a template that uses `{{<name>…}}` (or includes one that does) gets the tool's answer as that value, asked with `{ title }` just before the note is made and only then (`template_values.rs`; docs/guides/TEMPLATES.md "Values from plugins"). The template stays data; the program is the plugin, with its permissions. Example: the Weather plugin's `now` (`template = "weather"`). A capture made with no Atlas serving the vault is kept in `.atlas/pending/` and the `on = "capture"` tools run on it when the vault is next served.
- A Python helper may call Atlas while Atlas calls it (a sync asking the catalog, which asks this helper's lookup): `atlas_plugin` answers such a request at once, nested, instead of queueing it behind the call that waits for it.

### Platforms — `[platforms]`

A plugin says where it runs, platform by platform: the three desktops (`linux`, `macos`, `windows`), the phone app (`android`) and a server (`server`: a core started by `atlas serve` or the Docker image, whatever system is under it). Each is `"works"` (tried there), `"untested"`, or `"no"`, bare or with a reason:

```toml
[platforms]
linux = "works"
macos = { support = "untested", why = "CUPS ships with macOS" }
windows = { support = "no", why = "no `lp` (CUPS) on Windows" }
server = "works"
```

- **A platform not named is `untested`**, except `android`, which is `no` unless `phone = true` (the phone app starts only plugins made for it; `phone = true` is short for `android = "works"`).
- **Only `no` stops a plugin.** Where its core runs on a platform it says `no` for, the core does not run its helper, tools or contributions (`plugins::blocked`), the page does not load it, and Settings shows the reason ("Print does not run on Windows: no `lp`…"). Inside the phone app the page checks the `android` entry, even on a server's vault. A plugin that `requires` a stopped one stops too.
- **Settings shows all five** on the plugin's row and page (works ✓, untested ?, no ✕, the reason on hover). `/api/plugins` gives them as `platforms: [{ platform, support, why? }]` in that order, plus `not_here`, the reason it cannot run on this core's platform.
- An unknown platform name is a manifest error: the plugin is listed with the error, not loaded.

The core knows its platform from its build (`platform::Platform::os()`) and from server mode (`Platform::mark_server()` when `atlas serve` starts listening).

### A meta plugin and its subplugins — `requires`, `[contributes.<id>]`

A plugin can be built on another (the catalog and its `catalog-*` sources):

```toml
title = "TMDB"
requires = ["catalog"]            # not loaded while catalog is missing, broken or off (Settings says why)
# or, with the oldest version of each it works with (API 16):  requires = { catalog = ">=0.5" }

[contributes.catalog]             # any TOML: the core does not read it, it hands it to `catalog`
recognize = [{ pattern = "themoviedb\\.org/movie/(\\d+)", kind = "movie", id = "tmdb" }]
sources = [{ kind = "movie", tool = "lookup" }]
```

- Contributing is **optional**: a plugin with only `[contributes.catalog]` (a service's own plugin, such as Jellyfin or TubeArchivist) runs whether or not the catalog does, and its table is simply unused while the catalog is off. A subplugin that is nothing without its meta plugin says `requires = ["catalog"]` (before that, contributing implied requiring). A requirement at any depth counts, and an installed version older than the table asks for blocks as a missing one does ("needs catalog 0.5 or newer; this vault has 0.4.2"). The rule lives in the core only (`plugins::blocked`): `GET /api/plugins` fills each plugin's `blocked` (`?platform=android` as the phone app sees them), and the page reads it (`pluginBlocked`), re-reading the list when `[plugins] off` changes. A blocked plugin's main.js, pane, commands and tools are all off, and the plugins it requires start before it.
- A catalog source with no program of its own can be read by the catalog's engine: `engine = "clip"` `{ url }` → a web page's `kind`, `ids`, `fields` (title, site, author, published, updated, description, keywords, language, reading time, cover, journal, and a film's, a record's or a book's own: director, cast, artist, pages…) and readable `text` as Markdown (clip.rs) — the catalog's `catalog-web` is a manifest pointing at it.
- The meta plugin reads what every plugin that can run contributes to it: `GET /api/plugins/<its id>/contributions` → `{ "<plugin id>": <its table as JSON>, … }` — from its helper over the pipe (`atlas.get(…)`, `Atlas::get`) or from its page (`fetch`). The shape of the table is the meta plugin's to check and document.

### Roles — `provides`

The core and the page never name a plugin to get something done; they name a **role**, and whichever plugin can run and
`provides` it answers (the first by id when several do; `plugins::provider`):

```toml
provides = ["references"]         # catalog-papers: the references library (citations, PDFs, Zotero)
```

Roles in use: `catalog` (the capture box's hint, and the target of `[contributes.catalog]`), `references` (the papers
library the page's citations and PDF import call). A vault can swap one plugin for another that provides the same role.

### Settings

- **Where the values live**: the vault's own values are in **`.atlas/plugin-settings/<id>.toml`**, a plain TOML table (top-level
  keys, `[[<records key>]]` cards), outside the plugin's folder — so updating, reinstalling or removing a plugin never
  touches them. A manifest's `[settings]` are only starting values: the file is laid over them key by key, and the first
  save (or `atlas plugin update`) moves any manifest values into the file, comments kept, and takes `[settings]` out of
  the vault's copy of the manifest. The plugin reloads when its settings file changes.
- Saving the form writes that settings file (comments kept). An empty field, or one set to its default, is taken out; so is a field whose `when` does not hold (a hidden records field is left as it is). `atlas.plugin.settings` always has the defaults filled in — in every card too, for the fields that apply — and a records field missing from the file is `[]`.
- A `secret` goes to the store outside the vault, never the file: `<key>` for a top-level field, `<key>.<card name>.<field>` for a card's. The form shows only whether it is set; left empty, it is kept. Removing a card forgets its secrets.
- A card's name: unique, letters, digits and `. @ - _`. **A saved card can be renamed**: the form sends
  `renamed_from` on the card, the core moves its secrets to the new name and tells the plugin
  (`atlas.helper.on("settings:renamed", ({ key, from, to }) => …)`) so it can move what it keeps by the name (Email moves
  `mail/<old>/` and its fetch progress).
- A records field is saved whole: send the full list, in order (the first card is the main one).
- `atlas.plugin.saveSettings(values)` saves as the form does: declared keys, a records field as its list, `null` to take a key out — also a key no longer declared, which is how a new version moves old settings (`plugins/beta/email/`: flat settings and `accounts.json` become cards; secrets are renamed with `atlas.secrets`). It resolves once the plugin was reloaded with them, so **do not await it inside `register`** (call it from a command, or start it there without awaiting). `atlas.plugin.openSettings()` opens the form.
- A card's button saves the form first, then calls your command's `run({ setting, record })`; a list button `run({ setting })`. Commands run from the palette get no argument.

#### Accounts, folded fields and sections you draw (v12, Settings v2)

Settings were hard to use, and remote servers poorly handled. Settings has an **Accounts** page above everything else: every plugin's accounts in one list, each with its state, opened in place to change, test or sign in. A plugin opts in per records field:

```toml
[[setting]]
key = "accounts"
kind = "records"
fields = [ … ]
account = { kind = "Mail", summary = "{user} · {imap_host}", status = "account_status", test = "test_account", presets = [
  { label = "Gmail", hint = "with an app password", values = { auth = "password", imap_host = "imap.gmail.com" } },
] }
```

- `kind`: what one is, in a word ("Mail", "Calendar", "Bank") — the list's heading and the Add menu's.
- `summary`: the line under the card's name, `{field}` filled from the card; a part whose field is empty drops out with its `·`.
- `status`: a helper method called with `{ setting, records, settings }` (the saved cards) → `{ "<card name>": { state: "ok" | "warn" | "error" | "busy", text } }`. Asked when Settings opens and after each save; an `error` puts a red dot on the Accounts entry.
- `test`: a helper method called with `{ setting, record, settings }` — the card **as typed, not saved**, a typed secret under its field's key (`record.password`), else the kept one through `secrets` → `{ ok, text }`, shown under the card.
- `presets`: Add offers them first (then "Other…"); `values` start the new card.
- A card is saved alone (Save under it): the records field is written with that card changed, the plugin's other settings as they are. Its `actions` (Sign in) save it first, then run. On the plugin's own page the same list stands above the form, which no longer shows the field.

On any `[[setting]]`:
- `advanced = true`: folded under "Advanced", closed, at the end of the form.
- `hidden = true`: kept in the settings, never in the form — what the plugin's own page writes (a pane's colours, the calendars it hides).
- `group = "…"`: on a plugin's page each group is a card of its own with a heading (fields as rows: label and hint at the left, the control at the right).

A section the plugin draws itself, among its settings — a rules editor, calendars with their colours:

```js
atlas.plugin.registerSettingsSection?.({ id: "rules", title: "Rules", hint: "What happens to new mail by itself.", place: "after",
  mount(host, ctx) {           // ctx.settings() · ctx.save(patch) → true once saved · ctx.call(method, params, timeoutSecs)
    const app = mount(Rules, { target: host, props: { … } });
    return () => unmount(app);
  } });
```

`place`: `"before"` or `"after"` (default) the generated settings. Settings a section changes go through `ctx.save`, so the settings file stays the one truth (Settings as text, Claude's view of the settings). Email draws its rules there (`plugins/beta/email/ui/src/main.ts`).

## A pane in Svelte — `ui/` built by `scripts/dev/plugin-ui.mjs`

A plugin of this repo may write its pane and its page side in Svelte 5 + TypeScript instead of plain JS. What reaches a vault is still `view.js` / `main.js`: the sources are built, and the build is committed beside them (as a helper's `bin/` is).

```
plugins/<tier>/<id>/
  ui/tsconfig.json        { "extends": "../../../../ui/tsconfig.json", "include": ["src/**/*.ts", "src/**/*.svelte"] }
  ui/src/view.ts          export default function (host, atlas) { const app = mount(App, { target: host, props: { atlas } }); return () => unmount(app); }
  ui/src/main.ts          export function register(atlas) { … }   (blocks mounted with svelte's mount() the same way)
  view.js  main.js  ui-lib/   the build: committed
```

- `node scripts/dev/plugin-ui.mjs plugins/<tier>/<id>` builds it with the app's own toolchain (`ui/node_modules`: one Svelte and Vite for the repo, no second `package.json`). The script links `ui/node_modules` into the plugin's `ui/` (git-ignored) so `import … from "svelte"` resolves. Component styles are injected by the components (`css: "injected"`), so there is no stylesheet to load. Svelte's runtime goes once into `ui-lib/`, under stable names, and both entries import it.
- Types: `import type { PluginApi } from "<repo>/ui/src/lib/plugin-api"`, the contract itself, erased at build.
- `--check` (the gate's `ui` stage, for every plugin with a `ui/`): `svelte-check` with warnings as errors, then a fresh build compared with the committed one. A stale `view.js` fails the gate.
- Draw with the app's CSS variables and shared classes (Styling, below). A prop read once at mount (`atlas`) still goes through `$derived` or a closure, which `--check` enforces.
- Example: `plugins/beta/finance/ui/` (a pane with three tabs, three blocks, a keyboard queue).


## A plugin's own files by URL — modules, fonts, pictures, workers (v9)

Every file in the plugin's folder has an address the page can load: **`atlas.assetUrl("fonts/serif.woff2")`** (relative to the folder) → `…/plugin-files/<rev>/.atlas/plugins/<id>/fonts/serif.woff2`, served by the core with its type (`font/woff2`, `text/javascript`, `image/png`, `application/wasm`…; HTML as plain text) on the desktop, on a server (under its `/v/<name>/`, behind its sign-in) and in the phone's app. Use it wherever a URL is wanted:

```js
const face = new FontFace("Book", `url(${atlas.assetUrl("fonts/serif.woff2")})`);   // or a <style> @font-face
img.src = atlas.assetUrl("pics/cover.png");
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" }); // the same, from a module
const { pdf } = await import("./lib/heavy.js");                                       // loaded when needed
```

- `atlas.assetUrl("fonts/")` (ending in `/`) is the folder's address: a base for a library that fetches its own files (Excalidraw's `window.EXCALIDRAW_ASSET_PATH`, pdf.js's `cMapUrl`).
- Only the plugin's own folder: a path with `..`, a hidden part (`.git`) or a link leading out of the folder is refused (by `assetUrl`, and by the core whatever the URL). `.atlas/init.js` is served too (so it may import `./plugins/<id>/x.js`), nothing else of `.atlas/`.
- **Modules are loaded the same way**, so a module's `import.meta.url` is its address and every relative import resolves as in a browser — static, dynamic, a worker's, `new URL("./x", import.meta.url)`. The `<rev>` part changes whenever a file under `.atlas/plugins/` changes (a page keeps an imported module for its life): an edited module runs on the plugin's next load (at once: the plugin reloads on the save). Files are revalidated on each page load (`no-cache` + ETag: an unchanged one costs a 304).
- **Sharing a module between plugins** — one copy of a library for every plugin that needs it: put it in a *library plugin* (a folder with a `plugin.toml` and the module; no pane, no `main.js`) and import it by its path beside yours, declaring it:

  ```toml
  requires = ["zip"]       # Books and Manga: blocked (and Settings says why) while the Zip archives plugin is missing or off
  ```
  ```js
  import { zipIndex, zipBlob } from "../zip/zip.js";   // plugins/beta/zip: zipIndex(buf) → Map(name → entry), zipBlob(buf, entry, type?) → Blob
  ```

  Plugins sit side by side in `.atlas/plugins/` as they do in the repo's `plugins/<tier>/`, so the same import works in the page, in node (a spec importing `view.js`) and on an older Atlas (API < 9 rewrote relative imports itself). A library's own change reaches the plugins that import it when they next reload. There are no bare specifiers (`"atlas:zip"`): a module of the core's own that plugins may use is offered on `atlas` (`atlas.editor.codemirror`), and the core carries no plugin's library (PHILOSOPHY.md §3).
- `atlas.fileUrl(path)` stays the way to show a *vault* file (a picture of a note, a book): it is read through the API and handed over as a `blob:` URL.


## `atlas` — by what you want to do

Every `register…` / `on…` returns a function that undoes it (rarely needed).

### Know where you are
| | |
|---|---|
| `atlas.version` | the API number (14; test it before using something newer) |
| `atlas.plugin` | your manifest as Atlas read it: `id`, `title`, `version`, `settings` (with defaults filled in), `fields`, … |
| `await atlas.plugin.saveSettings(values)` / `atlas.plugin.openSettings()` | save your settings as the form does (see "Settings") / open your page in Settings: your form inline, your problems, your actions |
| `atlas.path` | in a pane opened on a file ("Open with…"): that file |
| `atlas.arg` | in a pane opened by `openView(arg)`: that string (a host, an account; JSON for more) |
| `atlas.anchor` (v7) | in a pane opened by a link with `#…`: what follows it (`Chapter 3` of `[[x.epub#Chapter 3]]`, `page=3`) |
| `atlas.pane` (v7) | in a pane (view.js; undefined in main.js and blocks): the editor contract, see "A file's editor" below |
| `atlas.live.join(path, on)` (v8) | the file's live room (core `live.rs`, the same the notes and drawings use): `on.message(from, m)`, `hello(others)`, `joined({peer,name})`, `left(peer)`, `writing()` (this device became the one that saves); returns `{ send(m), peers(), others(), writes(), close() }`. Only the device whose `writes()` is true saves the file (in a mirrored vault the room is the server's). Left when the plugin unloads. |
| `await atlas.pen.shape(xyt)` (v8) | the core's pen recogniser (atlas-pen, the phone's own): a held stroke as `[x, y, t, …]` (null breaks a line) → `{ wire }`, the recognised shape's points (`[]`: none); what the drawings use to snap a held stroke (`lib/pen-shapes.ts`). |
| `atlas.context()` | what the user is looking at: `active`, `open`, `selection` (`path`, lines, `text`), `section`, `hover` |
| `atlas.onContext(fn)` | called with a new snapshot on every change |
| `atlas.hover(path \| null, line?)` | point at a note: other panes highlight it |

### Files and notes
| | |
|---|---|
| `await atlas.readText(path)` | a file's text |
| `await atlas.list(dir)` | a folder's entries, one level: `{ name, path, dir, ignored, size?, mtime? }` (`""` = the vault's top) |
| `await atlas.exists(path)` | whether a file or folder is there — never an error and never a 404 in the console; ask it before `list` of a folder that may be missing |
| `await atlas.writeText(path, text, { baseMtime? })` | write a file whole → `{ mtime }`; with `baseMtime`, a 409 when it changed on disk since. For the plugin's own files (a `reading.json`), never the user's notes |
| `await atlas.capture(text)` | capture as the capture box does (today's log, or a note); `[] ` makes a to-do |
| `await atlas.createFile(path, text)` | a new file; `false` (nothing written) when it exists |
| `await atlas.noteProps(path)` | a note's frontmatter as an object |
| `await atlas.writeProperty(path, key, value)` | one frontmatter key (an array → a YAML list) |
| `await atlas.query(basesYaml, thisPath?)` | Bases filters / views over all notes → `{ views: [{ rows: [{ path, cells, edit }] }] }` |
| `await atlas.view(src, path?)` | the rows a ```` ```view ```` block of this YAML gets (`type: task-list\nfrom: tasks\ndue: today`) → `{ kind, rows: [{ path, line, title, date, done, props }] }` |
| `await atlas.table(path)` | a TSV / CSV parsed |
| `await atlas.fileUrl(path)` / `thumbUrl(path, width?)` | an address for `<img src>`; thumbnails are made small by the core (up to 2048 px; smaller pictures pass through untouched) and a JPEG XL always comes back as PNG — show pictures from the network through `thumbUrl`, since WebKit can hang on a JXL and Chromium shows none |
| `atlas.assetUrl(rel)` (v9) | the address of a file of the plugin's own folder (`fonts/x.woff2`, `cover.png`, `worker.js`) for a font, a picture, a worker, an `import()` — see "A plugin's own files by URL" |
| `await atlas.thumbUrl(path, width?)` | the address of a downscaled copy of a vault picture (at most `width` px, 320 by default), for galleries and covers: a figure shown small is never loaded full size |
| `atlas.trash(path)` (v10) | a file to the vault's Trash (`.atlas/trash/`, taken back from there) — a library's Delete… |
| `atlas.companion(path, { find?, title?, properties? })` | the one note of a file (a book, a PDF, a series folder `x/`), made by the core when missing — the vault's template rules (`apply_when: { file: … }`), the file's block, your `properties` — exactly as every device makes it; `find: true` only says which. Never write a companion note's text yourself |
| `atlas.templates()` (v13) | the vault's templates: name, title, folder, questions (`asks`), when each applies by itself (`applies`, in words) |
| `atlas.newNote({ title, folder?, template?, values?, body? })` (v13) | a new note made the way every new note is: the template named, else the vault's rules for that folder, else its default template; `values` answer the template's questions → its path. Use it instead of writing a new note's text |
| `atlas.applyTemplate(path, template)` (v13) | a template merged into an existing note — only what it lacks (properties, list items, sections, blocks) → what was added |
| `atlas.marks(file)` (v14) | the marks of a PDF or a book of pictures (a manga chapter: an archive, or a folder ending in `/`) → `{ note, marks }`: the note that keeps them (a chapter's: its series' note, a block per chapter) — watch it with `onFilesChanged` |
| `atlas.marksSvg(marks, page, size?)` (v14) | a page's marks drawn as Atlas draws them (ink with its pressure, highlights, post-its…) → an `<svg>` filling its positioned parent; `size` the page in the marks' space (PDF points; default a picture page, 1000 × 1000) |
| `atlas.open(path, line?, { beside? })` / `openTable(path)` | open in a tab |
| `atlas.openNative(path)` (v6) | hand `path` to the phone app's own reader (a native plugin whose `opens` takes it: an `.epub`, a `.cbz`, a chapter folder, `suwayomi:<id>/<name>`); `true` when the app took it, `false` on the desktop or in a browser — show it in the page then. A library stays the page's on the phone too; only its reader is native (Books' and Manga's Read) |
| `atlas.onFilesChanged((paths) => …)` | any change on disk, also from other programs |
| `atlas.files.source({ title, icon?, places, list, local, save?, mkdir?, rename?, remove?, upload?, download?, onPlaces?, thumb?, hideEmpty? })` | your places (hosts, servers) in Atlas's explorer, one source per plugin; a remote file opens from its local copy in `.atlas/remote/<your id>/` and every save of it comes to `save(local, force)` → `{ saved }` / `{ changed }` / `{ waiting }`; `thumb(place, path, width)` → image bytes (a `Blob`), a vault path of an image (e.g. the `saved` of an `atlas.fetch`), or `null`, for the Thumbnails view; `hideEmpty: true` hides the source's group while it has no places. Offline comes free: Atlas remembers each copy your `local` returned, and when a later `local` throws (the server out of reach) it opens that copy instead and says so — don't keep a copy map of your own for that. Your places also show in the vault's tree (folded until opened, listed through `list`, opened through `local`); a `list` or `save` that meets a sign-in answers `{ waiting }` rather than throwing. Examples: `ssh`, `copyparty` |
| `atlas.files.explore({ source?, place?, path? })` | open the explorer there (default: your source) |
| `atlas.files.list(source, place, path)` / `atlas.files.local(source, place, path)` | any file source's folder (`{ path, entries }`), and a vault path to open one of its files (a fresh local copy of a remote one): another plugin's server read as the explorer reads it — Books' server folders through copyparty. Rejects when that source's plugin is off |
| `atlas.plugin.registerSettingsSection({ id, title, hint?, place?, mount })` (v12) | a section the plugin draws on its page in Settings (Settings, "Accounts, folded fields and sections you draw") |
| `atlas.files.thumb(source, place, path)` (v11) | a URL of the source's own picture of a file (copyparty's thumbnail of a PDF), as the explorer's Thumbnails view gets it, three at a time and kept for the run; null when it has none — Books' covers of a server's books |

### Things that happen — `atlas.on(type, fn)`
`file:open` `{ path }` · `file:save` `{ path }` · `file:create` `{ path }` · `file:rename` `{ from, to }` · `file:delete` `{ path }` · `capture` `{ path, text }` · `command` `{ id }`. About what is done **in Atlas**; listeners run after the action and cannot break it.

### Add to notes and pages
| | |
|---|---|
| `atlas.registerBlock("id.name", (host, block) => cleanup, { title?, options? })` | a block for ```` ```view ```` in notes and for pages; `block`: `options`, `note`, `src`, `props()` |
| `atlas.editor.registerFence("statblock", (host, { source, path, props }) => cleanup)` | draws every ```` ```statblock ```` fence |
| `atlas.registerEmbed(patterns, (host, embed) => cleanup)` (v7) | draws `![[file]]` for these files: `patterns` an extension (`"epub"`, `".excalidraw.md"`), a glob (`"maps/*.json"`) or a list of them; `embed`: `path` (resolved as a link is), `anchor` (after `#`), `options` (after `\|`, split: `["600", "center"]`), `width` (`\|600` as px), `note` (the note it is in), `compact` (a card on Home: draw small), `open()` (as a click on its link). May be async. Asked before the core's own embeds — the newest registration wins, so a plugin can take over the core's drawing embed; pictures stay the core's. Drawn embeds are drawn again when the registration comes, changes (a reload) or goes (switched off) |
| `atlas.registerView(type, render)` | a row view (rows come from the block's `from:`) |
| `atlas.registerNoteView(name, { title, types?, render })` | a kind of note drawn the plugin's way (a mail note as the mail): a note whose `view` property is `name`, or whose `type` is in `types`, opens drawn by `render(host, { path, text, props, showNote })` → cleanup (again on each change of its text); the pane's "Show as note" / "Show as <title>" switches (ui/src/lib/note-views.svelte.ts) |
| `atlas.registerEntities({ prefix, get, list? })` | an `@prefix:id` mention kind |
| `atlas.registerSuggestion(provider)` | offer a view for the section under the caret |
| `atlas.mountBlock(host, block, notePath?)` | draw any block inside yours |
| `atlas.plot(host, { x, ys, xLabel?, yLabels? })` | Atlas's plot |
| `atlas.mountLibrary(host, source)` | Atlas's library page (the one References is) over your items: `source` is a `LibrarySource` (`ui/src/lib/library.ts`) — `load()` → items, `detail(item)` → fields, actions, links, a choice; optional tabs, groups, layouts (`list`, `covers`), sorts, an add box, a file watch. Returns the cleanup. The catalog's Library app is one |
| `atlas.registerLibrary(source)` | The same `LibrarySource` as one of the vault's libraries: a tab of Atlas's Libraries page (the phone's **Library** in its bottom bar), shown as the vault's `[ui] libraries` says. Returns its removal; feature-detect it (`atlas.registerLibrary?.(…)`). The catalog registers its Library as "Catalog" |

### A file's editor — `claims` and `atlas.pane` (v7)
A plugin with a pane (`view.js`) becomes the view a file type opens in on a click (the file tree, a link, the palette) with `claims = ["*.epub"]` in its manifest. Which view a plain open uses, first that applies: the vault's `[files] open_with` for the extension, a plugin's claim (enabled plugins only; two claiming the same file: the first to load), Atlas's built-in viewer. Settings → Files & search → Open with lists the rules and, under them, what each enabled plugin claims; Settings → Plugins says "opens *.epub by default" under the plugin. In the pane:

```js
export default function mount(host, atlas) {
  // atlas.path: the file; atlas.anchor: the link's #… ("Chapter 3"), or undefined
  atlas.pane.onSave(async () => { await atlas.writeText(atlas.path, serialise()); }); // Ctrl+S, closing the tab, leaving
  editor.oninput = () => atlas.pane.setDirty(true);                                    // the tab's unsaved dot
  atlas.pane.onAnchor((a) => goTo(a));                                                 // a later [[file#…]] while open
}
```

`atlas.pane.close()` closes the tab (saving first, as closing it by hand does): for a view that hands the file on, such as the Rnote plugin's, which converts the `.rnote` it claims, opens the drawing, then closes itself.

`setDirty(true)` puts the dot on the tab; while it is on, Back keeps the tab. The save hook runs on Ctrl+S in the pane (keys inside an iframe of your own stay there: forward them), on closing the tab (awaited up to 2 s, as the core's editors), on the window closing or reloading and on switching workspace — each only while dirty. When it resolves the dot goes; when it throws the dot stays and the error is shown and logged. One hook per pane: a later `onSave` replaces it. When the plugin's files change the pane saves (if dirty) before it is mounted again. Examples: `plugins/beta/books` (claims `.epub`, opens at the contents entry the anchor names), `plugins/beta/manga` (claims `.cbz`; `.cbr` is RAR, which the web side cannot read).

### Add to the editor — `atlas.editor`
| | |
|---|---|
| `registerCompletion({ where?, trigger?, complete })` | `complete({ path, line, before, word })` → `[{ label, detail?, insert?, kind? }]`; `trigger`: only when the text before the caret ends like it |
| `registerKey("Ctrl+Alt+J", (t) => …, where?)` | `t`: `path`, `line`, `selection`, `replace(text)`, `insert(text)`; return `false` to pass the key on |
| `onPaste(fn)` / `onDrop(fn)` | `fn({ text, html, files, path })` → text to insert, or `null` |
| `registerDecoration(/pattern/, (m) => ({ class?, title?, replace?(host) }))` | mark or redraw every match |
| `toolbar((file) => [{ label, title?, run }])` | buttons in the bar above a code file, for the files you choose by `file.path` (run, build, test) |
| `extension(ext)` + `codemirror.{ state, view }` | **escape hatch**: a raw CodeMirror 6 extension, built from Atlas's own copies of the library. Unstable |

`where` is `"note"`, `"code"` or `"all"`.

### Add to the frame
| | |
|---|---|
| `atlas.registerNew({ id, title, detail?, icon?, run })` | a kind of new thing in **New…** (the command `ui.new`; the phone app's + button): `run` makes it — asking what it needs with `atlas.pick` — places it where it belongs and opens it (e.g. the Lectures plugin: a lecture note, a lecture drawing) |
| `atlas.registerCommand({ id, title, keys?, run })` | in the palette as `plugin.<plugin id>.<id>`; bindable; usable in toolbars. `run(arg)`: a settings card's button passes `{ setting, record }`, a button under the cards `{ setting }`; the palette and keys pass nothing |
| `atlas.shell.menu(where, (target) => rows)` | rows in a right-click menu: `"file"` `{ path, dir }` · `"tab"` `{ path?, kind }` · `"editor"` `{ path, selection }` · `"block"` `{ type, note }` · `"terminal"` `{}` (the terminal's "+" menu: something to start); a row: `{ label, run, icon?, hint?, detail?, danger?, disabled? }` |
| `atlas.shell.statusItem({ id, text, title?, run? })` | a cell in the status bar → `{ set(text, title?), remove() }` |
| `atlas.shell.greetingItem({ id, text, icon?, title?, order?, run? })` | a chip under the date in Today's greeting (the Weather plugin's sky and place, the Home plugin's week, moon and what is due), lower `order` first → `{ set(text, title?), remove() }` |
| `atlas.shell.sideTool({ id, title, icon?, mount })` | a tool in the side panel, with a command "Side panel: <title>" |
| `atlas.pick({ placeholder, items, typed?, onpick })` | ask the user to choose or type, in the palette; returns a function that closes it if it is still showing |
| `atlas.signIn(url, back)` | an OAuth sign-in page whose answer comes back to `back` (a localhost address such as `https://localhost`): the desktop app shows it in a window of its own and resolves with the address it ended on (`?code=…` or `?error=…`); in a browser it opens a tab and never resolves, so keep a way to paste that address (plugins/beta/email) |
| `atlas.signInReturned?.(back)` | in a browser, the address a sign-in to `back` came back to while no tab was waiting for it (the one that asked was closed or reloaded): kept 30 minutes by the server's return page and handed out once; check it when the pane opens. Test for it: absent before the server keeps returns |
| `atlas.toast(title, body?, kind?)` | a notification |
| `atlas.eink.on` / `atlas.eink.refresh()` | whether the e-ink mode is on; one full refresh of the screen against ghosts (on a Boox Onyx's own, elsewhere a black-white flash) — e.g. a reader's page turn |
| `atlas.eink.pen(host, take, opts?)` (v5) | the phone app's native pen over `host` (on a Boox: the firmware's instant line, and every sample of each stroke) — `take([{clientX, clientY, pressure}, …])` per stroke, in the page's CSS px; `opts`: `active()` (wanted now?), `top` (a strip left to the fingers), `line()` → `[width, onyxStyle]` (0 pencil, 1 brush, 2 marker). Returns `{ sync(), off() }`, or `null` where there is no native pen (read pointer events there). One holder at a time (`ui/src/lib/pen-target.ts`). The book reader's pen highlights use it |
| `atlas.openView(arg?, { title?, icon?, beside? })` | open the plugin's pane (`view.js`) in a tab, or show the one already open on that `arg`. Each `arg` is a tab of its own, kept in the layout; the pane reads it as `atlas.arg`. `title` names the tab, `icon` is an app icon name |

### Reach outside the page
| | |
|---|---|
| `await atlas.data(args)` | run the manifest's `data` script once (stdin `{ settings, args }`, stdout JSON) |
| `await atlas.fetch(url, { method?, headers?, body?, timeout?, saveTo? })` | a request made by the core to a host listed in `[permissions] net`; → `{ status, ok, headers, url, saved?, text(), json() }`. A header may be `{ secret: "token", prefix: "Bearer " }`; `saveTo` writes the body to the plugin's cache folder (`saveIn: "remote"`: to the local copies of remote files, `.atlas/remote/<id>/`, which the explorer opens); `bodyFile: <vault path>` sends that file's bytes as the body (an upload). A sign-in in front of the service (Authelia, Authentik…) comes back as `signin: { kind: "door", host, page }` with `ok: false`: Atlas has offered the sign-in and sends it with later requests to hosts your `net` names. With a header `{ oauth: name }` whose sign-in is not made yet (nothing is sent then), or that the service refuses with a `Bearer` 401, the answer carries `signin: { kind: "token", host, name, page }`: Atlas offers the OpenID sign-in, its provider found from the service — so a plugin can just send `{ oauth: "svc" }` and retry once signed in |
| `await atlas.media(url, { headers? })` | an address to play (`<audio src>`, `<video src>`) for media on a server that wants your secret on every request: the core keeps the headers — `{ secret: "token", prefix: "Bearer " }` filled in by the core, never in the page — under a random ticket for a day and answers `/media/<ticket>` by asking the server with them, the player's `Range` passed through (seeking) and the bytes streamed. Same hosts as `fetch` (`[permissions] net`). Core: `plugin_media.rs`; the Audiobooks plugin plays Audiobookshelf with it |
| `atlas.secrets.get / set / delete / has (name)` | this plugin's secrets in this vault, kept outside the vault (`[permissions] secrets = true`). `get` answers only the plugin's helper: a page is refused (a secret's value never reaches a page — let `fetch` fill it in, or use it in the helper, which gets the secrets with each call as `params.secrets`) |
| `await atlas.oauth.signIn(name, { issuer?, resource?, clientId?, redirect?, scopes? })` | an OpenID Connect sign-in (Authelia as an OIDC provider, or any other): authorization code + PKCE as a public client. The provider is `issuer`; else the one the service at `resource` names when asked without a token (its 401's `WWW-Authenticate: Bearer resource_metadata=…`, RFC 9728, or its `/.well-known/oauth-protected-resource`); else the vault's (Settings → Plugins, `[plugins] oidc_issuer`). `clientId` and `redirect` fall back to the vault's `oidc_client_id` / `oidc_redirect`, so one client registered at Authelia serves every plugin. A service behind a sign-in *door* (a redirect to the portal) is said to be one: sign in to it with `atlas.signIn` instead; the provider's page opens in the desktop's sign-in window, the tokens stay with the core, once per provider and shared by every plugin of the vault (the plugin's secret `oauth.<name>` only names the provider): a second plugin asking `{ oauth: name }` takes the vault's provider's token with no click, and with a gate session kept (a door signed in) the core gets a first token silently (`prompt=none`), so the window shows only when the provider insists. Then a header `{ oauth: name }` in `fetch` is `Bearer <access token>`, renewed by the core with the refresh token (scope `offline_access`, the default with `openid`). `oauth.status(name)` → `{ signed_in, expires, renews }`; `oauth.signOut(name)`; in a browser the page opens in a tab and never comes back by itself: let the user paste the address it ended on into `oauth.finish(address)`. Needs `secrets = true` and the provider's host in `net`. Since API 4 of 2026-10-17 — test `atlas.oauth` before using it |
| `await atlas.helper.call(method, params?, { timeout? })` | ask the `[helper]` program; `helper.on(event, fn)`, `helper.state()`, `helper.restart()` |
| `await atlas.terminal.run(command)` | type a command into the shell terminal and enter it (opened when there is none): the user sees the command and its output. `false` when no terminal became ready |
| `await atlas.terminal.open(command, title?)` | a terminal tab of its own running the command directly (`sh -c`, no interactive shell: no rc files, no login banner); the tab closes when the command ends. For a session (ssh) or a prompt the user must answer |
| `await atlas.terminal.shell()` (API 17) | what words the terminal's shell reads: `"posix"` (sh, bash, zsh, fish…), `"powershell"` or `"cmd"` — the shell of the machine the terminal runs on (a server's too), so a command typed with `run` is quoted for it. Run tools is the example |
| `atlas.other(id)` | another plugin's `settings` and `data(args)`; `null` when absent or off |

## The helper's protocol

One JSON object per line on stdin / stdout. Flush every line.

```
Atlas → helper   {"id": 7, "method": "search", "params": {"q": "x"}}
helper → Atlas   {"id": 7, "result": …}            or   {"id": 7, "error": "why"}
helper → Atlas   {"event": "progress", "data": …}  (no id: an event for atlas.helper.on)
```

A tool call arrives as a request for its `method`, with the agent's arguments plus `settings` and `secrets` in `params`. A call that must wait on the user (a login, a 2FA) should return a "come back" answer within a few seconds rather than block, so the agent can tell the user what is going on (the SSH plugin's `ssh_open` returns `waiting_for_login`).

A tool that must make something happen **in the user's window** (open a tab, show a panel) cannot do it from the helper: it prints an event with an id, the page's `atlas.helper.on` listener does the work and calls a helper method with that id to say it is done, and only then does the tool answer. With no page listening (Atlas closed: `atlas mcp` then runs the helper itself) nobody answers, and the tool says so after a few seconds instead of claiming success. The SSH plugin's `ssh_terminal` is the example: `terminal` → a `tab` event → `atlas.terminal.open` → `tab_opened {id, ok}`.

stderr and non-JSON lines go to `.atlas/cache/plugins/<id>.log`. Environment: `ATLAS_ROOT` (the vault, also the working folder), `ATLAS_PLUGIN_DIR`, `ATLAS_PLUGIN_CACHE`, `ATLAS_PLUGIN_TARGET`, `ATLAS_PLUGIN_ID`, and `PYTHONPATH` led by the `atlas_plugin` library (below). A helper may also **call the core back** over the same pipe (below). Started by the first call; restarted by the next call after it exits; left stopped after five starts in ten minutes; stopped with the plugin and with Atlas, and — with `[helper] idle` — after that long with no call and none waiting (never under a call; at least a minute; not counted as a crash). Give `idle` to a helper that keeps nothing running between calls (a lookup, a conversion): each one idle costs a process's memory. A helper that listens (mail, push, a connector) leaves it out.

### Calling Atlas back — `atlas_plugin` (Python) and `atlas-plugin` (Rust)

A Python library (and the same for compiled Rust executables) lets a helper talk to the Rust backend, over the helper's **own pipe** rather than a web interface.

A helper calls the core on the same pipe it answers on. It writes a call on **stdout**; the core runs it through the vault's own API **in-process** (the same routes the pages use: no socket, no port, no key — the pipe is the identity) and writes the reply to the helper's **stdin**:

```
helper → Atlas   {"call": 4, "verb": "GET", "path": "/api/file?path=notes/a.md"}
Atlas → helper   {"reply": 4, "status": 200, "body": {"path": "notes/a.md", "text": "…", "mtime": …}}
```

`verb` is GET, POST, PUT or DELETE; `path` must start with `/api/`; `body` is JSON. `status` is the API's own (a 4xx carries `{"error": "why"}`). A request from the core can arrive while a call waits for its reply: the libraries keep it and answer it next. What a helper reaches: everything a signed-in page may, **except another plugin's secrets** (403; `helper_api::may`). In server mode it acts as the vault's owner. Where nothing serves the vault (`atlas mcp` running a helper with Atlas closed) a call is answered 503.

**Python** — `import atlas_plugin as atlas` (the core writes the library to `<vault>/.atlas/cache/sdk/python/` and puts it first on the helper's `PYTHONPATH`; standard library only; source `crates/atlas-core/sdk/python/atlas_plugin.py`):

```python
import atlas_plugin as atlas

@atlas.method
def tidy(params):                          # answered when Atlas (a tool, a page) calls "tidy"
    text = atlas.read("notes/Inbox.md")
    atlas.write("notes/Inbox.md", text.strip() + "\n")
    hits = atlas.search("todo")["lines"]
    token = atlas.secret("token")          # this plugin's own secret (None when unset)
    atlas.event("progress", {"done": 1})   # for the page's atlas.helper.on("progress", …)
    return {"hits": len(hits)}

atlas.serve()                              # the loop, until Atlas closes stdin
```

Also: `files(index=False)`, `tree(folder)`, `today()`, `capture(text)`, `set_secret(name, value)`, and `get(path, **query)` / `post(path, body)` / `put(path, body)` / `call(verb, path, body, query)` for any other endpoint. Errors raise `atlas.AtlasError` (`.status`).

**The web**: `atlas.fetch(url, headers=…, every=1.0, missing=(404,))` → the page's text through the core's fetch (only the manifest's `net` hosts), `None` for a `missing` status; `atlas.fetch_json(url, …)` parses it. It paces itself (at most one request to a host every `every` seconds: MusicBrainz asks 1, arXiv 3, Wikipedia ~0.25) and waits out a busy answer (429, 502–504) or a dropped connection, after 2 s and 6 s, before raising `AtlasError("<host> answered N")`. Use it instead of `post("/api/plugins/<id>/fetch", …)` by hand. (A 1000-capture run once lost 320 Wikipedia and 22 arXiv lookups to 429s without it.)

**Rust** — the `atlas-plugin` crate (`crates/atlas-plugin`; only std and serde_json, so a static musl build stays small): `Atlas::new()` with `read`, `write`, `files`, `tree`, `search`, `capture`, `secret`, `set_secret`, `get` / `post` / `put` / `call(Verb, …)`; `Methods::add(name, |params| …)` and `serve(methods)`; `event(name, data)`. A whole helper is `crates/atlas-plugin/examples/notes-count.rs`.

Data scripts (`data = …`) cannot call back: their stdout is their result. A plugin that needs the core from its script makes it a helper.

Checked by `server::tests::a_python_helper_calls_the_core_back_over_its_pipe` (a real vault, a Python helper writing and reading a note, refused another plugin's secret), `helper_api::tests`, and the crate's own tests.

### Any program, not only Python

`[helper] run` and `data` are command lines run on the machine running Atlas's server, so the helper can be **any program speaking the protocol above** — a Python script, or a binary compiled from Rust, C++, Go. Everything a helper does (files, notes, the network, secrets) happens on that machine; the page only shows it, so a plugin with a helper works the same from a browser or a phone talking to a remote server.

A line is a program and its arguments: words quoted with `"…"` or `'…'`, `\` escapes, `$VAR`, `${VAR}`, `${VAR:-default}` and a leading `~/`. Atlas reads it itself and starts the program without a shell, so the same line works on Windows, which has no `sh`. An expanded variable stays one argument, spaces and all. A line that uses more of the shell (pipes, `&&`, `;`, redirects, globs, `$(…)`) is run by `sh -c`: on Windows that needs Git for Windows' `sh` on the PATH. Keep plugin lines to the simple shape (`crates/atlas-core/src/platform/run_line.rs`; a test checks every bundled plugin).

A compiled helper is built per platform. `ATLAS_PLUGIN_TARGET` is `<arch>-<os>` of the server (`x86_64-linux`, `aarch64-android`, `aarch64-macos`, `x86_64-windows`), so a plugin can carry one build per platform. On Windows the program's `.exe` is found without being written:

```toml
[helper]
run = "\"$ATLAS_PLUGIN_DIR/bin/$ATLAS_PLUGIN_TARGET/helper\""
```

Build Linux helpers **static** (`cargo build --target x86_64-unknown-linux-musl`, or `-static` for C/C++): the same file then runs on the desktop and in the server's container (Debian, an older glibc than a desktop's), wherever the vault is served. Keep the executable bit (installing from a folder, an archive or git keeps it). On Android, a phone may run programs only from inside the app's APK: there the helpers are compiled into atlas.apk (`crates/atlas-android/helpers/`) and found by name on `PATH`, with `python3` among them (docs/guides/ANDROID.md, "Python and helpers"). The test `helper::a_compiled_helper_runs_like_a_script` builds one with `rustc`.

### JavaScript helpers — `[helper] js` (API 16)

```toml
[helper]
js = "helper.js"          # run inside the core by QuickJS: no process, no Python, the same on the phone
```

A helper may instead be a script the core runs itself: one QuickJS context per plugin, on a thread of its own,
speaking the same protocol as a process helper (the global `atlas` turns each call into those lines). The repo's
plugins write it in TypeScript, `helper/helper.ts`, and commit the build: `node scripts/dev/plugin-ui.mjs <plugin>`
builds `helper.js`; `--check` type-checks it, checks the build is current and runs `helper/*.test.ts` in node against
a stand-in core (`import { harness } from "atlas-helper/testing"`: `harness.web`, `harness.api`, `harness.zips`, `harness.exec` with the runs asked in `harness.ran`). The
types are `crates/atlas-core/sdk/js/atlas-helper.d.ts`.

- **Methods**: `atlas.method(name, fn)` / `atlas.methods({…})`; `fn(params)` returns (or resolves to) the answer.
- **Files and the core**: `read`, `write`, `files`, `tree`, `search`, `today`, `capture`, `secret`, `setSecret`,
  `get` / `post` / `put` / `del` / `call` for any endpoint; errors are `AtlasError` (`.status`).
- **The web**: `fetch(url, {method, headers, body, timeout, every, missing, waits})` → text (`null` for a `missing`
  status), `fetchJson`, `fetchResponse` (the whole answer), `download` (streamed into the plugin's cache), within
  `[permissions] net`. A header may be `{ secret: "token", prefix: "Bearer " }`, filled in by the core.
- **Native primitives** (done in Rust, one call each): `html.select`, `html.unescape`, `csv.parse`, `zip.list`,
  `zip.read`, `hash.sha256`; `url.quote`, `url.resolve`, `text.title` in script.
- **Programs** (API 17): `await atlas.exec(program, args, { stdin, cwd, timeout, locale })` → `{ status, stdout, stderr }`
  (`timedOut`, `truncated` when so). Only a program the manifest names, `[permissions] exec = ["pandoc"]`, found on
  the PATH (a path is refused), started with no shell, `cwd` inside the vault (default the vault), killed with its
  children after `timeout` seconds (default 60, at most 600), each output kept to 8 MB; `locale: "C"` makes it
  answer in English (LC_ALL, LANG), the only environment a script may set. Where the program is not
  installed (the phone) it throws, saying so: test for it and degrade. Only the helper's script reaches it, never a
  page.
- **What QuickJS lacks**: no `fetch`, `URL`, `TextEncoder`, `btoa`, no Node modules; `console` and timers come from the
  core. The node harness removes them too, so a helper leaning on Node fails its tests.
- **Limits**: 128 MB of memory per context, 5 s of CPU per turn (a call and the promise jobs it starts); past them
  the call fails and the next one starts the helper again.

Design and measurements: docs/design/DESIGN-js-helpers.md.

## Native Android side (`[android]`)

A plugin may also carry a native side for the Atlas and Atlas-for-Boox apps — where Java does better than the page: codecs, the e-ink refresh, the pen. Examples: `plugins/beta/manga/` and `plugins/beta/books/` (readers: their libraries are the page's, which hand a book over with `atlas.openNative`). The notepad (pen drawings on a Boox, saved as `.excalidraw`) began as one and is now the app's own screen, the same interface (`org.atlas.notepad`; docs/guides/NOTEPAD.md).

```toml
[android]
main = "org.atlas.plugins.manga.Manga"   # a class in the plugin's android/*.java implementing org.atlas.capture.NativePlugin
opens = ["*.cbz"]                        # vault files the app opens with it instead of the web pane
```

(`place = "…"`, an entry of its own in the app, is still parsed but unused: the app's places are the page's libraries.)

- **`NativePlugin`** (`crates/atlas-android/android/java/org/atlas/capture/NativePlugin.java`): `String id()` (the folder's name) · `boolean opens(String path)` (may narrow `[android] opens` — the notepad claims `.excalidraw` only when `Host.einkScreen()`, so a phone keeps the web Excalidraw) · `View view(Host host, String path)` (`path` a vault path or an address of its own like `suwayomi:<id>/<name>`; never empty since `place()` went). A screen with places inside it implements **`NativePlugin.Back`** — `boolean back()`, `false` when at its top and the app should take Back.
- **Compiled in, never loaded from a vault**: `crates/atlas-android/build-apk.sh` runs `crates/atlas-android/native-plugins.sh`, which finds every `plugins/<tier>/<id>/plugin.toml` with an `[android] main`, hands its `android/` folder to javac with the app, and generates `NativePlugins.java` (the list the app reads). A new native side needs a new APK; each vault still switches the plugin on and off.
- **`Host`** — what a native side may do, nothing more:
  - the app: `activity()`, `look()` (the app's palette and widgets)
  - files (vault paths, never outside the vault): `list`, `isDir`, `exists`, `modified`, `read` (a stream), `readText`, `local` (a `File`, for `ZipFile`), `write` (whole, atomically)
  - drawings: `drawingSaved(path, scene)` — the companion `.md` written by the core's `drawing_note`
  - settings: `settings()` — the same values the web side reads, never null
  - e-ink: `eink()`, static `einkScreen()`, `einkRefresh()`
  - pictures: `decode(bytes, maxW, maxH)`, `pickPicture(done)`, `hasCamera()`, `takePhoto(done)`, the `Picture` callback
  - the pen: `PENS`, `penInk`, `penDefaults`, `penOutput`, `penShape(xyt, openink)`; `quickInk(view)` → `QuickInk` (`area`, `up`, `repaint`, `stop`)
  - back to the app: `open(path)`, `openLink(link, from)`; and `toast(text)`
- The web side and the native side are separate and both optional; the web Settings shows the plugin's settings for both.

## Styling

Draw with plain DOM and the app's CSS variables so the plugin follows the theme: `--bg`, `--bg-elev`, `--bg-hover`, `--text`, `--text-muted`, `--text-faint`, `--accent`, `--accent-soft`, `--border`, `--radius`, `--radius-sm`, `--font-mono`, `--ui-scale`, `--red`, `--yellow`, `--green`.

**Shared looks (classes, `ui/src/styles/base.css`)** — so a plugin's empty, loading and error states look like Atlas's own:

- `.atlas-notice` — a message in place of content: a calm box (muted text, `--bg-alt`). Add `.error` for a failure: a red edge, **never red text**. Put the way out inside it, in a `.actions` row of buttons (Sign in, Settings…, Try again) — an error without a next step is a dead end.
- `.atlas-empty` — one faint line: "Nothing unread.", "Reading the inbox…".
- `.atlas-btn` (`.primary` for the main action) — a small button in the app's style.

Strip the transport's prefix from an error before showing it (`POST /api/…: 500 …: plugin x: method: RuntimeError: ` says nothing to the user). The email, clip and ssh examples each carry a 12-line `notice(text, { error, actions })` helper that does both.

A **side tool** (`atlas.shell.sideTool`) gets the same heading (its title, in the side panel's small caps) and margins as the built-in tools; draw only the content.

### Compiled helpers and release archives

A plugin whose helper is a Rust crate keeps it in `engine/` (its `Cargo.toml`); `scripts/dev/plugin-pack.mjs` builds
every such engine and packs every plugin, so no plugin carries a build script of its own (its `engine/build.sh` is one
line calling it):

- `node scripts/dev/plugin-pack.mjs engines [--target <arch>-<os>] [--only id,…] [--keep-going]` builds the crate's
  binary (the one the `run` line names, when it has several) into `bin/<arch>-<os>/`. Targets: `x86_64-linux` and
  `aarch64-linux` (static, musl; a crate with C++ inside says `[package.metadata.atlas] libc = "gnu"` and is built on
  an old glibc instead), `x86_64-macos`, `aarch64-macos`, `x86_64-windows`. Default: this machine.
- `node scripts/dev/plugin-pack.mjs pack [--out dir] [--bins dir]` makes one `atlas-plugin-<id>.tar.gz` per plugin of
  `plugins/stable` and `plugins/beta`: its tracked files without its sources (`engine/`, `ui/`), plus every platform's
  `bin/` that was built, in one archive for every desktop. Beside them, `plugins.json` lists each one's id, title,
  version, tier, platforms (`"any"` for a plugin with no engine) and sha256.

CI builds the engines on Linux (x86_64 and arm64), macOS (both) and Windows, packs them, and keeps the archives as the
run's artifact `plugins`; a release attaches them (`.github/workflows/packages.yml`). Atlas installs an archive from a
file or from its web address; `atlas-plugin-<id>.tar.gz` installs as `<id>`, and an address such as
`https://github.com/<owner>/atlas/releases/latest/download/atlas-plugin-<id>.tar.gz` is kept, so `atlas plugin
update <id>` fetches the newest release. Public release files need no sign-in or token. On macOS the download's
quarantine mark is taken off the unpacked files (the plugin is installed switched off, as any).

## From a terminal

`atlas plugin list` · `atlas plugin install <from> [--id name] [--on]` (`<from>`: a folder, a git address, a `.zip` /
`.tar.gz` file or its web address) · `atlas plugin update <id>` · `atlas plugin remove <id>` · `atlas cmd plugin.<plugin id>.<command id>` runs one of its commands.

## What is promised to stay

Every name on this page, with these shapes; the helper protocol; the manifest keys. Not promised: `atlas.editor.extension` (it follows the editor library), the app's CSS classes, the DOM around a block.
