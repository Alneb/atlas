# Plugins v3 — pieces, not apps (and run notes)

Session 111, 2026-10-08.

## Why
After real use of the Runs plugin: plugins were too integrated, not flexible.
Asked what that meant, they picked **all four**:
1. A plugin is a closed app (Runs is one fixed screen).
2. It can't be reshaped without code.
3. It is stuck in the chrome (rail button, palette entry, shortcut and pane, always).
4. Plugins can't build on each other.

Then, verbatim: *"Actually all actual edition of things will be done by you but i dont want to recompile, and i want
to update automatically"*. Asked where they want to look at a run, they chose **inside a note**.

This is MALLEABLE.md R2 (tools, not apps: data, computations and views kept separate), R4 (dynamic documents) and
R6 (in-place toolchain, no rebuild), applied to plugins.

## Before / after
| | v2 (before) | v3 (now) |
|---|---|---|
| what a plugin is | a pane module (`view.js`, required) + an optional data script | data script + **any mix** of: `main.js` (registers pieces), `view.js` (a pane), nothing visible at all |
| when its code runs | only when its pane is opened | `main.js` at startup, then **again on every save** of any `.js/.css/.json` in its folder |
| chrome | always a rail button + a palette entry + a pane | rail button only with `rail = true`; palette entry only if it has a pane; commands it registers itself |
| pieces in notes | `registerView` (rows-fed view types) only from an open pane | `registerBlock(type, render)`: self-fed blocks for ```` ```view ```` and `.page`, which get their options and **the note they sit in** (`props()` = its frontmatter) |
| composition | none | `atlas.mountBlock(host, block)` draws any block (built-in or another plugin's); `atlas.other(id)` gives another plugin's settings and data |
| generic helpers | `fileUrl`, `openTable` | + `thumbUrl` (core thumbnails), `table(path)` (any size), `plot(host, {x, ys})` (Atlas's plot), `noteProps`, `createFile` |
| lifetime | registrations leaked until reload | every registration is **owned** by its plugin and undone on reload, on switch-off, or when the plugin is deleted |
| blocks that load early | "No view called …" error | a plugin block shows "Waiting for the plugin…" and draws when the plugin registers; it **redraws on re-registration** (hot reload) |

## The manifest (additions)
```toml
title = "Runs"
rail = true            # opt-in sidebar button for the pane
view = "view.js"       # the pane; default: view.js when present; none = no pane
main = "main.js"       # startup module; default: main.js when present
```
`crates/atlas-core/src/plugins.rs`: `Plugin { view: Option, main: Option, rail }`. Conventional files are picked up
only when they exist, so a plugin made only of `main.js` has no pane and takes no chrome.

## The runtime (ui/src/lib/plugins.svelte.ts)
- `startMain(p)`:
  - undoes everything `p` registered (`disposeAll`);
  - imports `main.js` from a fresh blob URL (no cache, no build);
  - calls `register(atlas)`. If that returns a function, it is kept as the plugin's own cleanup.
  - A failure becomes a toast and `plugins.errors[id]`, shown in Settings → Plugins.
- `watchPlugins()`:
  - a `plugin.toml` change → reload the list (and every main);
  - any other `.js/.css/.json` change in a plugin folder → re-run that plugin's main (debounced 200 ms);
  - switching a plugin off in Settings → its registrations are undone.
- Blocks (`lib/views.ts`):
  - `registerOwnView(type, (host, src, notePath) → cleanup)`. Type names may contain dots (`runs.plot`).
  - Watchers per type redraw mounted blocks on (re)registration, once per microtask, so unregister+register
    draws once.
  - A block whose renderer throws shows its error in place; the note keeps working.

## The runs plugin, rebuilt as pieces (`<vault>/.atlas/plugins/runs/`)
- `main.js` registers three blocks:
  - `runs.params`: parameters + swept axes; option `only: [...]`.
  - `runs.plot`: picks the run's main table (a `cdmft` table first, else the longest). x = the swept physics axis
    present in the table (U, mu, beta…); options `x:`, `y: [...]`, `table:`.
    - Default y, **from the run's own figure names**: a figure `…_E0.png` means the user plots E0. Exact column
      names come first, then numbered columns `E0_1…`; else the most-varying columns.
  - `runs.figures`: a thumbnail grid (`thumbUrl`), captions cut to the part that differs between figures
    (`shortNames`, shape-based); option `limit:`.
  - It also registers a command: "Runs: open the note of the run…" (for a file inside a run).
- **Run notes**:
  - `index.py` with `args.note = <run path>` returns `{path, text}`: `notes/runs/<run>.md`
    (`[settings] notes_dir`), with frontmatter `run: <path>` and the three blocks.
  - Created once (`createFile` never overwrites), then the note is the user's.
  - Every block reads `run:` from its note, so changing that one line re-targets them all (Embark).
- `index.py` with `args.run` returns one run (blocks ask for theirs).
- The Runs list (`view.js`) stays as the way to **find** runs. It has a **Note** button and the `n` key, and keeps its
  rail button (`rail = true`).

Measured on a large real vault (headless Chromium driving `atlas serve --port 7799 ~/Notes`): Runs → `n` → the note with
params, plot and 24 thumbnails drawn in **~340 ms**; longest main-thread task 181 ms.

## Tests
- `ui/tests/plugins-v3.spec.ts`. A `main.js`-only plugin:
  - has no rail button;
  - its block in a note gets its options and the note's frontmatter;
  - a block made of another block (`mountBlock`) works, and another plugin's settings (`other`) are readable;
  - a registered command runs from the palette;
  - editing `main.js` redraws the open note's blocks with the new code;
  - switching the plugin off makes them wait, and switching it back on brings them back.
- `plugins.spec.ts` and `settings.spec.ts` fixtures add `rail = true` (the rail is opt-in now).
- Rust: `plugins::tests` covers conventional modules, the opt-in rail, and no pane without `view.js`.

## Watch out for
- `main.js` runs with the app's privileges (same trust as v2's `view.js`: workspace code). It is imported as a blob,
  so **relative imports do not work**; a plugin is one module per entry point (shape-shared logic goes into its data
  script, as run notes do through `index.py`).
- A block type registered by two plugins: the last registration wins, and undoing the first leaves the second.
- Data scripts are not "reloaded": they run fresh on every `data()` call anyway.
