# Vertical tabs (Zen-style) and a calmer shell

What the user gets: one left sidebar, styled after the Zen browser, that replaces both the activity rail and dockview's horizontal tab strips.
- **Top:** the brand and the workspace name, a collapse button (`Ctrl+Alt+S`), and the view buttons (Today, Files, Search, Outline, Library, Git, then any workspace plugins).
- **Pinned tabs (Zen's "Essentials"):** a grid of tiles. You pin with right-click → Pin, with `Ctrl+Alt+P`, or by dragging a tab onto the grid. Pins are kept in localStorage `atlas.pins.v1`, so they survive a restart. A pinned tab you closed stays as a dimmed "resting" tile, and clicking it opens the tab again.
- **"Open a file"** opens the Ctrl+P palette.
- **Every open tab, from every dockview group:** each row has an icon, a title, a dirty dot and a × button. Once the window is split, the rows are grouped under small headers ("Side panel", "Editor 1/2", "Terminal"). The terminal header has a "+" for a new shell.
  - The active tab is drawn as a card. The tab each other split is showing is drawn in a brighter colour.
  - Click a row to focus that tab. Middle-click or × closes it. Double-click a terminal row to rename it.
  - Right-click a row for: Pin/Unpin, Split right, Reveal in file tree, Copy path, Rename (terminals), Close, and Close others in this group.
  - Drag a row up or down to reorder it, onto another group's rows to move it there, onto the pinned grid to pin it, or onto the editor area to split. The drag uses dockview's own `PanelTransfer` payload, so dockview's drop overlays work natively.
- **Bottom:** Terminal, Claude, New lecture note, Commands, Settings, and the theme toggle.
- **Collapsed:** the sidebar becomes a 52px strip of icons. File tabs show two-letter monograms (e.g. "Bl" for Bloch Theorem), because their icons all look alike. Hovering for about 220ms opens the full sidebar as an overlay above the panes. The width can be dragged at the right edge (180–440px; double-click resets it). Width and collapsed state are kept in `atlas.sidebar.v1`.
- **Keys:**
  - `Ctrl+Tab` / `Ctrl+Shift+Tab`: the glance (below); with `[ui] tab_switcher = cycle`, the next / previous tab in sidebar order.
  - `Ctrl+1..8` go to the nth tab, pins first; `Ctrl+9` goes to the last one.
  - `Ctrl+W` closes the current tab.
  - `Ctrl+Shift+A` puts the keyboard in the tab list (the same key as Chrome's tab search). In the list: `j`/`k` or the arrows move, `g`/`G` jump to the first/last, `Enter`/`l`/`o` open, `x` closes, `p` pins, `/` filters, and `Esc` goes back to the pane. When the sidebar is collapsed, the list opens over the panes.
- **Setting:** `[ui] tabs = "vertical" | "horizontal"` (`TabsLayout` in config.rs; vertical is the default; the Settings pane shows it automatically). Horizontal keeps the old rail and tab strips. The layout is cached in localStorage `atlas.tabs`, so a restart does not flash the other layout.

## Decisions
- **Dockview stays the source of truth** for which tabs are open and in what order. `lib/tabs.svelte.ts` only mirrors the dock (refreshed on dock events, once per animation frame) and moves panels through `api.moveTo`. Because of this, tab order and splits are restored by the existing layout save.
- **Tab strips are hidden** (`group.header.hidden`) and no minimal header is kept. All dragging starts from the sidebar, and dropping onto a pane's content still splits. In vertical mode the editor's breadcrumb bar works as the page's title bar.
- **No workspaces switcher.** Atlas has one workspace per server, and there are no saved layouts that a switcher could select. The sidebar shows the workspace name instead. Adding a switcher would have been a half-feature.
- **The toolbar is split in two.** Views sit at the top and the "make / look up" buttons sit at the bottom, so the top row fits on one line. The shared button lists live in `lib/toolbar.ts`, used by both Rail and Sidebar.
- **Calmer chrome (SilverBullet-inspired), in `styles/chrome.css`, vertical mode only:**
  - no tab strip;
  - the breadcrumb bar is 36px tall, with no rule under it and the file name in semibold;
  - group cards have no shadow, and the accent border on the active group appears only when the window is split;
  - the dock gets 8px of padding;
  - the status bar no longer repeats the workspace name.
  - Markdown rendering and the note column width (`editor.prose_width`, already a centred column like SilverBullet's) are untouched.

## Verified
- Before/after screenshots of the whole window, on a temp copy of a real vault's `notes/` with a split (in `docs/img/vertical-tabs/`):
  - `before-{dark,light,vscode}.png`
  - `after-{dark,light,vscode,collapsed,hover}.png`
  - `vscode` = the user's xy-zed theme, copied into the temp workspace.
- What changed between them: before, the main group's tab strip overflowed (tabs cut off behind a "2" dropdown). After, every tab is readable, the splits are labelled, and there is less chrome above the note.
- `tests/vertical-tabs.spec.ts` (3 tests) covers the user flow:
  - open notes, find a tab with `/`, pin, drag to reorder, middle-click close, split, collapse and hover-expand;
  - a reload restores pins, order, split and collapsed state;
  - a keyboard-only pass;
  - horizontal mode.
- Screenshots of each step go to `$ATLAS_SHOTS`.
- Specs that used `.dv-tab` (bases, plugins, terminal-tabs, ux/depth, ux/journeys) now use the sidebar.

## Limitations / open
- No tab folders and no multi-select "open in split view".
- Pins are per browser profile (localStorage), like the layout, not per workspace file.
- Tests that type right after a note opens have to wait for the editor to take focus. This existed before this work: keys typed into the palette in that moment are lost.


## Since the sidebar became a page (2026-10-13)

The behaviour described above is unchanged, but the code moved: `Sidebar.svelte` is now only the frame, and the toolbar, the pinned tiles and the tab list are the blocks `toolbar`, `pins` and `tabs` (`ui/src/components/sidebar/`), arranged by `.atlas/sidebar.page`; their shared state and handlers are in `ui/src/lib/sidebar.svelte.ts`. Pins are kept in `.atlas/bookmarks.yaml`, not in the browser. The "no workspaces switcher" note above is out of date: named workspaces exist (Ctrl+Alt+W). See [SHELL.md](SHELL.md).

The side panel (files, search, outline, git) can be hidden without closing its tabs: Ctrl+B, the button in the bottom toolbar, or the button in its group head (the terminal's group head has the same). It always spans the window's left edge; the terminal sits under the editors, whichever was opened first.


## Hover previews and the Ctrl+Tab glance (2026-10-14)

Wanted: previews of links and of the left panel's tab list — but no previews on hover — and Ctrl+Tab as a glance view, only for the focused tab.

- **Previews** (`ui/src/lib/preview.ts`, installed once by `App.svelte`): resting the pointer ~0.45 s on a `[[link]]`, a `[text](note.md)` / `[text](https://…)` link (in the editor or the reading view) or a tab in the left bar shows a card: the note rendered (frontmatter left out), a picture's thumbnail, a PDF's first page, a code file's first 30 lines, a web address. `targetOf(el)` is the one place that says what an element points at: wikilinks by `data-target` / `data-href`, markdown links by the `data-href` the live preview now puts on `.cm-link`, tabs by `data-tab-id`; links resolve from the note around them (`data-note` on the editor and on the reading view). The card stays while the pointer is on it (it scrolls); a click, a key, or leaving hides it. A file that cannot be read gives no card rather than an error. Settings: `[editor] link_preview`, `[ui] tab_preview` (on; off brings back the tab's tooltip). Test: `hover-preview.spec.ts`.
- **Glance** (`ui/src/lib/tab-glance.ts`, `[ui] tab_switcher = glance`, the default): Ctrl+Tab shows the **focused split's** tabs only, most recently used first (`trackRecent` follows `onDidActivePanelChange` per group), as cards drawn with the same `drawPreview`; Tab / Shift+Tab move while Ctrl is held, letting go of Ctrl switches, Esc keeps the tab you were on, the window losing focus switches. A quick Ctrl+Tab (let go within 120 ms, before the cards are drawn) goes straight to the previous tab, like Alt+Tab. Test: `tab-glance.spec.ts`; `vertical-tabs.spec.ts` follows the new order.
- Not checked in the desktop window (WebKitGTK) by a test: Playwright's WebKit lacks system libraries on this machine (`libicu74`, `libjpeg-turbo8`); the desktop check is by hand.


## 2026-10-17: apps, the side panel's own row, Zen splits, fullscreen that keeps them

The requests, in order: the places (Files, Search…) on top, the bottom icons for Settings and general actions, those places no longer normal tabs nor counted as tabs, and the pinned tabs reworked; Home, Email and the plugins' dynamic apps separated from normal tabs (related to pinned tabs); better tab movement in the left panel, and splits in the editor and the terminal shown as in Zen — split in the left tab list as well, kept in fullscreen, with a small button to unsplit; in fullscreen the left panel stays small unless clicked on an empty space or needed by a tool, never automatically.

What the bar is now, top to bottom:
- **Apps** (`ui/src/lib/apps.svelte.ts`, drawn by the `pins` block, `SidePins.svelte`): Home (the home document's tab, or Today), the built-in plugins' panes (Library) and every vault plugin with a view that asked for a button (`rail = true`: Email). Icon tiles, always there; an open app is underlined, the one on screen lit; middle-click or right-click → Close closes it. An app is **not a tab**: never a row of the list, never counted by Ctrl+1…9 (`tabs.apps`, kept out of `tabs.groups`). This is the "relation to pinned tabs": apps are the built-in Essentials, pins the user's own — the same strip.
- **Pins**, as before, under the apps.
- **The tab list**: one section per zone, Terminal then Editor (no "Side panel" section: the side tools are not tabs; no "Editor 1 / Editor 2": a split is not two lists). A zone split into several dockview groups shows, as in Zen's split view, **one split row**: what each half displays, side by side in one frame; a tab dropped on a half joins that half's group and shows there; the small round button on the row's corner **unsplits** (`unsplit(zone)`: every tab moves into the active group, which keeps showing what it showed). The tabs behind the halves are listed below. Rows slide to their new place (`animate:flip`), and the room under a section's last row takes a drop (the tab goes to the end).
- **The side panel** (in the bar) with its heading `SideHead.svelte`: Files, Search, Outline, Git, the plugins' tools, hide, move. **The same row** heads the side column when the panel sits beside the editors (a dockview prefix header action, `SideHeadActions` in dock.ts; the column's tab strip hidden by CSS `.atlas-side-group`).
- **The footer**: New…, the side panel's show/hide, commands, settings, theme. Collapsed to icons, the side tools stand in the footer (the panel's row is not drawn then). The horizontal-tabs rail shows apps, tools and footer.

**Fullscreen** (`fullscreen.svelte.ts`) no longer maximizes one dockview group: it hides the groups of the other zones (remembered, shown back on leaving — a panel hidden before stays hidden), so **a split stays a split**. It still follows the keys between the editors and the terminal; a side tool asked for meanwhile opens beside them. The layout is not autosaved while fullscreen. The phone keeps the one-pane maximize (`toggleFullscreen(true)`). In fullscreen the bar is icons and **does not open on hover**: a click on its empty space, or a side tool that needs it (`atlas-side-needed`, sent by `showSide`), opens it *held* — it stays when the pointer leaves, and closes on a press elsewhere, Escape, or once a tab or app is chosen.

Specs: `fullscreen.spec.ts` (hover does not open, a click does; the split survives F11; unsplit), `side-panel.spec.ts`, `shell-files.spec.ts`, `plugin-side-tool.spec.ts`.
