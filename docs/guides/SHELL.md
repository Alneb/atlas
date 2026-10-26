# The shell is files — vaults, layouts, workspaces, bookmarks, the sidebar

Phase 3 of the shell overhaul. Before it, what was open and where lived in the browser's `localStorage`: invisible, not shared between the desktop app and a browser, and with no way to name an arrangement. The desktop app also opened one hard-coded vault by default. Now:

| what | where it lives | who writes it |
|---|---|---|
| the list of vaults | `~/.config/atlas/vaults.toml` (the only Atlas file outside a vault; `$ATLAS_VAULTS` overrides) | the desktop app when it opens a vault; the vault chooser |
| the current layout (tabs, splits) | `<vault>/.atlas/cache/layout.json` — per machine, deletable | the UI, 0.4 s after a change and when the window closes |
| named workspaces | `<vault>/.atlas/workspaces/<name>.json` | "Workspace: save the current tabs as…" |
| pinned tabs and bookmarks | `<vault>/.atlas/bookmarks.yaml` | pinning a tab; "Bookmark: add…"; the user, as text |
| the sidebar's content | `<vault>/.atlas/sidebar.page` (a built-in default until the file exists) | "Sidebar: arrange its blocks…"; the user, as text |
| recently opened files | the usage journal `<vault>/.atlas/cache/usage.jsonl` (`GET /api/recent`) — every window and device that opens a file in the vault, deletable | the core, when a pane shows a file |

What is still only in the browser: the sidebar's width and whether it is collapsed, the folded state of the properties and backlinks panels, PDF zoom — per-window comforts, not content.

## Vaults

A vault is any folder. Everything specific to it — settings, plugins, pages, workspaces, the starter kit — is in its own `.atlas/`, so a work vault (runs, lectures, Zotero) and a personal one share nothing but the app. Choose the vault as in Obsidian; each vault is modular.

- **Chooser**: the vault's name at the top of the sidebar, or **Vault: switch, open or create…** (Ctrl+Alt+V). It lists known vaults, most recent first (the current one and missing folders are marked). Typing a path opens that folder as a vault; if it does not exist, Atlas asks before creating it. "Forget" removes an entry from the list and never touches the folder.
- **One window per vault**: opening a vault starts another `atlas-app <folder>` (its own core, its own port). Vaults run apart, like Obsidian's vault windows.
- **Starting the app**: `atlas-app <folder>` opens that folder; with no argument it opens the most recently opened vault; on a first run (empty list) it opens a small Welcome vault in `~/.local/share/atlas/Welcome` whose home page says how to open a real one.
- **The list is written by the desktop app only.** `atlas serve <folder>` (development, tests, audits) never adds to it, so throwaway folders do not appear in the chooser.

Code: `crates/atlas-core/src/vaults.rs` (`list`, `remember`, `forget`, `resolve`, `open_window`; two tests), routes `GET /api/vaults`, `POST /api/vaults/open {path, create}`, `POST /api/vaults/forget {path}`; `crates/atlas-app/src/main.rs` (`vault_to_open`); `ui/src/lib/vaults.ts` (the chooser, built on the palette's `pick`).

How the app binary is found when opening a vault: `$ATLAS_APP`, else the running program if it is `atlas-app`, else an `atlas-app` beside it, else `atlas-app` on the PATH. From the browser dev loop this opens a real app window.

## Layout and workspaces

- **The current layout** is restored when Atlas starts and saved as it changes. Setting **Appearance → Reopen the tabs of the last session** (`[ui] restore_layout`, on by default) turns the restore off for fresh starts; a *reload* of the same window keeps its tabs either way (a per-window marker in `sessionStorage`).
- The old `localStorage` layout is read once (so nothing is lost on the first start after this change), then dropped.
- **A workspace** is a named copy of the layout. **Workspace: save the current tabs as…** writes it; **Workspace: switch to…** (Ctrl+Alt+W) lists them; each saved workspace is also its own command (**Workspace: Read paper**), so it can be given a shortcut in Settings → Keyboard. Switching saves unsaved text first, then replaces what is open.
- Because workspaces are plain JSON files in the vault, they can be versioned, copied to another vault, or written by a script.

Code: `ui/src/lib/workspaces.ts` (`restoreLayout`, `autosaveLayout`, `saveWorkspace`, `switchWorkspace`, the commands); `ui/src/lib/dock.ts` exposes the layout as data (`currentLayout`, `applyLayout`, `onLayoutChange`) and no longer touches storage.

## Bookmarks and pins

One file, two lists:

```yaml
# .atlas/bookmarks.yaml
pins: [log/2026-10-13.md, {view: library}]        # the tiles at the top of the sidebar; Ctrl+1…8
bookmarks:
  - notes/dmft.md                                  # a file
  - {path: notes/dmft.md, heading: Self-energy}    # a heading in it
  - {search: "tag:todo"}                           # a saved search
  - {command: workspace.Read paper}                # any command (a workspace, a script, a plugin's)
  - {url: https://arxiv.org, title: arXiv}         # a web page
  - {view: runs.plot, run: X}                      # any block, opened as a tab
```

- **Adding**: **Bookmark: add this tab, heading or search…** (Ctrl+Alt+B) offers the current tab and the heading under the caret; typing instead keeps a search (or a web address). Pin a tab as before (right-click → Pin, Ctrl+Alt+P, or drag it onto the tiles).
- **Using**: the `bookmarks` block lists them in the sidebar (hidden while there are none); **Bookmarks: open…** (Ctrl+Shift+B) lists them in the palette, with "Remove …" and "Edit the bookmarks file" entries; every bookmark is also the command `bookmark.<name>`, so it can have a shortcut in Settings → Keyboard.
- **The file is rewritten list by list** through the YAML document, so the comments above `pins:` and `bookmarks:` stay; comments inside a list do not.
- Pins that older versions kept in the browser move into the file on the first start.

Code: `ui/src/lib/bookmarks.svelte.ts` — `Target` is a closed union (file, view, search, command, url) with exhaustive switches for reading, writing, the title, the icon and opening; `bookmarkOf(spec)` turns an open pane into an entry (a file path when the file opens that way by itself, else the pane as a block: `{view: terminal, n: 2}`), `bookmarkSpec` the reverse through `blockTab` (lib/blocks.ts), so anything that can be a block can be bookmarked or pinned. `tabs.svelte.ts` no longer stores pins; it follows `onPins`.

## The sidebar is a page

`.atlas/sidebar.page` lists the sidebar's blocks top to bottom, in the page format (PAGES.md; columns are ignored — a sidebar is one column). Until the file exists, this built-in default is used (`DEFAULT_SIDEBAR` in `ui/src/lib/sidebar.svelte.ts`):

```yaml
title: Sidebar
rows:
  - [pins]
  - [bookmarks]
  - [tabs]
  - [{view: toolbar, items: [ui.today, plugins, ui.files, ui.search, ui.outline, ui.git, spacer, ui.commands, ui.settings, ui.theme]}]
```

**Why this shape**: the bar used to open with two rows of icons, the app's tools above a line and the plugins' below; once Files / Search / Outline / Git lived in the side panel the upper row held one button. Three options were drawn and **C** was chosen: the top is the vault and the tabs, and everything that launches something is one row at the bottom — Home, each plugin's button, the side panel's four tools (left out while that panel is in the bar and shows them itself), then the palette, Settings and the theme at the far end. A vault that already has a `sidebar.page` keeps it: the file is the truth; delete it (or copy the lines above) to get the new shape.

- **Arranging**: **Sidebar: arrange its blocks…** writes the default file (once) and opens it as a page; the page's Arrange mode moves, adds and removes blocks, and the sidebar follows each save. Or edit the text.
- **Its own blocks** (`ui/src/lib/sidebar-blocks.ts`, components in `ui/src/components/sidebar/`): `toolbar`, `pins`, `bookmarks`, `tabs`. They are ordinary blocks, so they also work on any page.
- **A toolbar's buttons are command ids.** A button takes its icon, short name and shortcut from the command (`icon` / `label` on the action in `actions.ts`). Three words are not commands: `plugins` (a button per plugin with a view; no line before them any more), `divider` (a line, wherever you want one; in the expanded sidebar it also starts a new row) and `spacer`. To dress a command of your own: `{command: refs.bib, icon: library, title: Rebuild refs}`. An id that names no command is left out. In the wide bar the buttons share one row: nine fit the default width (each at least 24 px, growing to 36 px when there is room); more wrap to a second row.
- **Any other block can live in the sidebar**: `outline`, `backlinks`, `files`, `{view: calendar, from: tasks}`… A pane block is 420 px tall unless it says `height:`. Such guest blocks are hidden while the sidebar is collapsed to icons; the four own blocks stand as icons.
- **Layout rule**: the `tabs` block takes the free height; blocks after it stay at the bottom; the part above scrolls when crowded.
- **A plugin's tool in the side panel** (`atlas.shell.sideTool`): listed in `ui/src/lib/side-tools.svelte.ts`; in the bar its button follows the four built-in ones, beside the editors it is a tab of the side column. The side panel's choice is a `SideId` (a kind, or `tool:<block type>`).
- **The activity rail** (horizontal-tabs layout) shows the buttons of the file's toolbars.
- A file that does not parse keeps the last good sidebar and shows the error at its foot.

Code: `ui/src/components/Sidebar.svelte` is only the frame (vault name, collapse, hover-peek, resize) and mounts each block with host `"side"`; `ui/src/lib/sidebar.svelte.ts` holds the file's model and the state the sidebar's blocks share (keyboard cursor over pins and tabs, filter, drag, menu, rename); `ui/src/lib/toolbar.ts` resolves items to buttons. A block marked `bare` (lib/blocks.ts) is a part of the shell: no frame, no "open as a tab" button.

## The two tool panels: where they sit

Two groups of tools sit around the editors, and each has two places, chosen by a setting and by one button on its heading in the tab list:

| panel | setting | places |
|---|---|---|
| Terminal (shells, Claude sessions) | `[terminal] position` | `bottom` (default) or `right` |
| Side panel (files, search, outline, git) | `[ui] side_panel` | `dock` (default): a column of its own left of the editors · `sidebar`: in the left bar, right under the tab list, down to the toolbar (vertical tabs only) |

**The shape that every placement keeps** (`split()` in `ui/src/lib/dock-panels.ts`): the terminal takes the window's whole bottom (or right) edge whatever was opened first; the side panel sits left of the editors, above (left of) the terminal; an editor opened when none is open goes back *between* the two, and both keep the size they had. Before this was one function, closing the last editor tab and opening another put the editor beside whichever tool panel was active and gave the side panel half the window. The sizes are remembered by `noteToolSizes()` (called on every layout change while an editor is open), because dockview gives a removed group's space to its neighbours and forgets what they had. Switching the terminal's edge while it is open (`placeTerminalPanel`) makes a new group along the whole new edge and moves the shells into it, so the rule holds there too.

**The side panel in the left bar** (`ui/src/lib/side-panel.svelte.ts`, `ui/src/components/sidebar/SidePanel.svelte`): the four tools are the same panes as in the dock, mounted as blocks (`mountBlock(…, "side")`), one row of icons to switch between them, each kept alive once opened (the file tree keeps its open folders, the search its results). **One row is its whole heading**: the four tool icons, then hide and "back beside the editors" — the tab list shows no "Side panel" heading in this mode (the first version had both, and the panel pinned to the bottom of the bar with a gap above it). **The panel has a height of its own** (320 px at first): its top edge is a handle (drag it, or focus it and press Up / Down), the tab list above takes the rest of the bar and scrolls when crowded, and the panel never gives way to it — the second version let the panel take the free height, and it got too small with many tabs open; it is now a fixed size that can be moved. `sizeSide` / `SIDE_HEIGHT` in `side-panel.svelte.ts`; the height is kept in `shell.json` with the tool and the visibility; in a short window the tab list keeps 140 px. Hidden, the panel is just its row. The blocks' hover button ("open as tab") is switched off there: the heading's move button is that. Nothing else in the app knows about the mode: `open()` in `dock.ts` hands a side-zone pane to `showSide(kind)` when `sideInBar()` is true, so every command, shortcut (Ctrl+Shift+E / F / O / G) and plugin call that opens Files or Search reaches the bar; `toggleSidePanel` (Ctrl+B) hides and shows it; `moveSidePanel()` follows the setting — the docked tools leave the dock for the bar (the one in front stays in front) and come back as a dock tab when the setting returns to `dock`. Which tool shows and whether the panel shows are per-machine choices kept, with the sidebar's width and collapsed state, in **`.atlas/cache/shell.json`** (`ui/src/lib/shell-prefs.ts`): a part of the shell registers `shellPart(name, {get, set})`, the file is read once at start (only when "reopen the last tabs at start" is on, like the layout) and written a moment after a change. So the desktop app and a browser tab on the same vault agree; the browser's storage keeps a copy only to draw the first frame where it was. Test: `ui/tests/shell-prefs.spec.ts`.

The heading buttons (`SideTabs.svelte`, one `head` snippet): show / hide as one icon (minus = shown, chevron = hidden); Side panel: move it into the bar / back beside the editors; Terminal: dock bottom / right, and **"+" — a menu with "Shell" and "Claude session"**, each opening another numbered one (also the commands `ui.terminal.new`, `ui.claude.new`).

**One order of headings** (`rows` in `SideTabs.svelte`, `ZONE_RANK` in `tabs.svelte.ts`): Side panel, Terminal, then the editor splits — whether a tool panel has tabs or is empty. Before, an empty panel's heading went to the end of the list, so which of the two was on top depended on what had been opened. **A restored layout is put back in shape** (`keepShape()` in `dock-panels.ts`, called after `applyLayout` and when a panel is shown): a layout file saved by an older build could have the terminal beside the side panel; it is moved along the whole edge at the size it had.

Tests: `ui/tests/terminal-dock.spec.ts` (both opening orders; closing the last editor and opening one keeps places and sizes; docking right and back), `ui/tests/side-panel.spec.ts` (into the bar and back, right under the tabs with one heading, the shortcuts reach it; the headings' order), `ui/tests/terminal-tabs.spec.ts` (the "+" menu, two Claude sessions).

## Fullscreen

A fullscreen mode for both the terminal and the main editor window.

**F11** (command `ui.fullscreen`, in the palette as "Fullscreen", rebindable in Settings → Keyboard) gives the tab that has the keys the whole window: a terminal, an editor, or any other tab. The left bar, the rail and the status bar step aside and the tab's group is maximized in the dock. F11 again puts everything back exactly as it was. It is a look, not a layout: nothing is saved, and a reload always comes back with the bars.

How (`ui/src/lib/fullscreen.svelte.ts`, about 30 lines): `fullscreen.on` is a rune that `App.svelte` turns into the class `full` on the shell (the bars are hidden with CSS, not unmounted, so nothing reloads); the group is maximized with dockview's own `maximizeGroup`. The order matters: the bars go and the dock is laid out at its new size *before* the group is maximized. Done the other way round, the resize that happens while a group is maximized is not shared out again on the way back, and the terminal came back 21 px taller (the status bar's height). The module follows `onDidMaximizedGroupChange`, so leaving in any other way (closing the last tab of the group) also brings the bars back. A layout saved while fullscreen carries the maximized group, so `attachFullscreen` leaves it whenever a layout is loaded and at start: the app never opens locked into one pane with the bars gone.

Test: `ui/tests/fullscreen.spec.ts` (the terminal, then the editor, take the window; sizes come back; a reload is not locked in).

**The dock never scrolls** (`ui/tests/layout-overflow.spec.ts`): `ui.log` showed "layout overflow" for months — the dock twice as tall as its box. Cause: a pane that is kept alive while hidden (terminal, PDF: dockview's `always` renderer) lives in an overlay that gets its position when it is first shown; a tab restored from the layout but never shown had none, so its overlay (height 100 %) sat in normal flow *under* the dock. One rule in `styles/dockview-theme.css` gives an unplaced overlay `top: 0; left: 0`.

## What to watch out for

- **Two windows on one vault** (the desktop app and a browser tab, or two tabs) share `layout.json`. Each window also keeps its own layout in `sessionStorage` and a reload restores *that*, so one window's tabs no longer replace the other's when it reloads (reported: moving things in one moved them in the other). The file is what a fresh start reads: the last window to change wins there.
- **Switching workspace closes the terminals of the old layout** (their shells end with their tabs). Obsidian's workspaces behave the same; keeping terminals alive across a switch is not done.
- **The save must survive the window closing**: it is sent with `keepalive` (a normal request in flight is cancelled by a reload — this was a real bug while building it). Browsers cap such bodies at ~64 kB; a larger layout falls back to a normal request.
- **Tests**: the fixture vault sets `restore_layout = false`, because the layout is now a file of the vault and every test must start clean; the test server gets its own `ATLAS_VAULTS` file and `ATLAS_APP=true` so "open a vault" starts nothing.
- **Missing folders must not log 404s** on start: `workspaces.ts` asks through the parents' listings (`exists`) before reading.
- **Bookmarks, pins and the sidebar file are shared by every test** (they are files of the fixture vault): specs that pin reset `.atlas/bookmarks.yaml` first; the sidebar spec puts the default back.
- **A block element stops key events** (lib/blocks.ts), so the sidebar's j/k handler is attached inside the `pins` and `tabs` blocks, not on the frame.
- **Global class names**: the shared styles of the sidebar's blocks are in `styles/chrome.css` under `side-` names (`.side-tool`, `.side-toolbar`, `.side-row`, `.side-head`); a first version called one `.tool` and broke the page header's buttons, which use that name locally.
- **A pinned block tab** (not a pane kind) is identified by its YAML; after a reload its tile may not recognise the still-open tab as its own when the YAML was written differently (a second tab opens on click). Known and left.
- **The bookmarks file is not re-read after Atlas's own write** (the text of the last write is remembered), so a slow file event cannot undo a newer change.

## Tests

`ui/tests/sidebar-page.spec.ts`: bookmark a tab → it is in the sidebar and the file as a plain path; a typed text becomes a saved search; pinning writes the same file and keeps its top comment; a reload reads them back; the bookmark's own command opens it; the file edited as text is followed. The default sidebar with no file; the arrange command writes the file and opens the page; an edited file changes the buttons (one dressed), adds an outline under the tabs; a broken file keeps the last good sidebar and names the problem.

`ui/tests/shell-files.spec.ts`: save a workspace → its file exists → close the tabs → the workspace's own command brings them back → the current layout file holds them → a reload keeps them; the vault chooser opens from the sidebar, a typed missing folder is created only after the explicit choice, the vault is listed, and forgetting it leaves the list. Core: `vaults.rs` tests (order, de-duplication, missing folders, forget never deletes, typed paths).


**No button twice**: while the side panel is in the bar, the bar's toolbar leaves out the four commands the panel's own row has (`SIDE_COMMANDS` in `side-panel.svelte.ts`, the `skip` argument of `toolItems`); they were duplicated when the panel was split out, except the Today page.

**A tab does not outlive its file** (`ui/src/lib/gone-files.ts`): on a file event a tab whose file no longer exists closes (deleted in the Files pane, in a terminal, by git); a tab with unsaved text stays and says so. A rename or move made in the Files pane reopens the file's tabs at the new path. **Tab names**: a file whose name says nothing alone (`notes.md`, `index.md`, `README.md`, `info.yaml`, `main.*`) is shown as `folder · name` — a paper's notes read `anderson1972more · notes` (`tabName` in `panes.ts`).
