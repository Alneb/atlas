# Atlas on a phone: the web UI's phone layout

After the phone capture app worked (2026-10-16), the next goals: hook it up, run the full app on Android as well, and make the UI truly mobile-friendly and fast.

This file is about the third part: the web UI (`ui/`) used on a phone's screen — a phone's browser opening an Atlas server (docs/guides/SERVER.md), or one day the app itself on Android. The capture app is docs/ANDROID.md.

## What was there

Nothing for narrow screens: the desktop shell (a side bar or the rail, dockview's split groups with 30 px tabs, a status bar) at any width. On a 390 px phone the side bar alone took two thirds of the screen.

## The phone layout (first step, 2026-10-16)

- **When**: the window is at most 720 px wide (`PHONE_QUERY` in `ui/src/lib/phone.svelte.ts`; a CSS media query, so a narrow desktop window gets it too — the desktop layout does not fit there either). `<html class="phone">` is set for CSS anywhere.
- **One pane at a time**: the existing fullscreen (lib/fullscreen.svelte.ts) — the active tab's group maximized, following the keys and the taps, the side bar / rail / status bar hidden (not unmounted, so nothing reloads). `attachPhone` keeps it held while narrow (a restored layout or a new tab re-holds it) and lets go once wide again: the desktop layout comes back as it was.
- **The bottom bar** (`components/PhoneBar.svelte`), 56 px plus the system's gesture area (`env(safe-area-inset-bottom)`): **Home**, **Files**, **Search**, **Tabs** (the count; opens a sheet of the open tabs — tap to show one, × to close it), **Commands** (the palette: everything else is a command).
- **The side tools open as panes**: a vault whose Files / Search / Outline live in the left bar (`ui.side_panel = "sidebar"`) has no left bar on a phone, so `sideInBar()` is false there and they open as panes like any tab; once the screen is wide again (`onWide`), the ones opened that way go back to the left bar (`moveSidePanel`, the same move a settings change makes).
- **Larger for fingers**: the interface's scale ×1.15 (`--ui-scale-set` is what Settings → font size writes; base.css makes `--ui-scale` from it, larger under `html.phone`); the palette's rows 44 px and the palette at the top (room for the keyboard); toasts across the screen above the bottom bar.
- **The tab strip** stays at the top (it is the group's own), 42 px high and scrolling sideways; the shell starts under the system's status bar (`env(safe-area-inset-top)`).

## The phone guidelines followed (Material 3 and Apple's HIG, as they apply here)

The mobile web UI stays useful for the browser version and keeps getting work, following the phone UX/UI design guidelines and knowing most features matter less on a phone (2026-10-16). What those guidelines say, and what it means for Atlas:

- **Few places, always at hand**: a bottom navigation bar of 3–5 destinations, each an icon and a short label, the current one marked → Home, Files, Search, Tabs, Commands (`PhoneBar`). Everything else is a command (the palette), not a button.
- **Where am I, how do I go back**: a top app bar with the screen's name and Back → `PhoneTop` (the active tab's title; Back is the app's own back history, `navigate(-1)`, shown only when it goes somewhere).
- **One primary action, a floating button**: 56 px, 16 px from the edges, above the bottom bar → **Capture** (the palette in capture mode).
- **Touch targets of 44–48 px**: the bar's buttons (56 px), the palette's rows (44 px), the file tree's rows (40 px plus the 1.15 scale), the tabs sheet's rows (48 px).
- **Thumb reach**: what is used most at the bottom (the bar, the capture button, the tabs sheet rising from the bottom); the top for reading (the title).
- **No hover**: nothing only appears on hover — the side bar's hover-open is gone with the side bar; tooltips are not needed to use a screen.
- **Fewer features**: one pane at a time, no splits, no status bar, no side bar; the desktop's tools stay reachable through Commands and Search, not on screen.
- **Respect the system**: safe areas (`env(safe-area-inset-*)`), the system's back gesture (the browser's back), text at least 16 px for reading (the scale ×1.15).

## How it was checked

A read-only WebKit probe on the real vault (`scripts/dev/webkit-probe.mjs`'s `readOnlyPage`, 390×844, the build in `ui/dist`): phone class on, the bottom bar there, no left bar or icon strip, no sideways scroll; Home, the Tabs sheet (the 8 open tabs, × to close), Files and Search as full panes; then widened to 1400×860: the bottom bar gone, the desktop layout back, the side tools back in the left bar. Screenshots in both themes (the light one with the vault's own inline colours cleared).

## The second pass (2026-10-16)

Reported from the phone app: the notes renderer still had problems — PDFs and some blocks did not render correctly in Settings and in the app, and links were hard to tap. Checked with a Playwright phone probe (412×860, touch, both themes; with and without a fake `AtlasNative` bridge for the app's view) on a demo vault holding a PDF, a picture, a calendar view, tasks, a callout, a table, code, a Base and note embeds.

- **Settings**: on a phone a list of areas (48 px rows, the search box at 16 px so the browser does not zoom), one area opens as its own page with *‹ All settings*; no autofocus (it raised the keyboard). Option rows: the words get the width, a control that does not fit beside them goes under them, a switch stays at the right — by size, not by kind (`SettingField.svelte`).
- **Keyboard hints hidden** (class `keys-only`, base.css): shortcut chips in Settings, the Overview, the palette's rows and footer, the capture box's "Enter to save", the Commands pane's shortcut buttons — nothing to press on a phone.
- **Touch sizes**: `.icon-btn` 40 px (the Files pane's tools, every pane header), Search's option buttons 36 px, the PDF toolbar 50 px high with 40 px tools, scrolling sideways instead of squeezing (the file name is the top bar's there).
- **Links**: a tap on a link is taken at `touchend` (create.ts) — before, the tap first moved the caret onto the link's line, which revealed the `[[…]]` markup and moved the link from under the finger; now no caret moves and no keyboard opens. A larger invisible hit box around links on a phone (`::after`, markdown.css), the underline unchanged.
- **Embeds** (every width, not only phones): `![[x.pdf]]` mounts the PDF viewer in place (520 px; `#page=N` opens there) and `![[Note]]` / `![[Note#Heading]]` the note or only that section, as Obsidian does (`lib/embeds.ts`, `NoteBlock`'s `section`); before, both were link chips. Notes embedding notes stop two levels deep; a missing target keeps the chip. Test: `tests/embeds.spec.ts`.
- **The tabs sheet** closes on Escape; a tap leaves no focus ring on the bottom bar.

## The shape audit (2026-10-16)

The main risk on a phone is things stretched by the change of shape; everything must look right. A screenshot shows one place; the phone has dozens, and both themes. So `scripts/dev/phone-audit.mjs` opens each place on a phone-shaped **Chromium** (Android's WebView is Chromium; the desktop's WebKit is not what the phone runs) and judges every visible element by its shape, not by a list of components:

| finding | what it means |
|---|---|
| `page-scrolls-sideways` | the whole page is wider than the screen |
| `off-screen` | an element runs past the screen's side with no box around it that scrolls or clips sideways |
| `stretched-media` | a picture, canvas or `preserveAspectRatio="none"` SVG drawn out of its own proportions (> 4 %) |
| `stretched-icon` | a square icon drawn not square |
| `stretched-control` | a button stretched tall (> 3× its width) or across the screen and tall — a flex row's `stretch` on a phone's column |
| `text-spills` / `text-clipped` | text wider than its box, running out of it, or cut by it without an ellipsis |
| `squeezed` | a box with words narrower than a letter and a half |
| `small-text` | text under 11 px |
| `small-target` | a button or field under 32 px on its short side (outside the note's text) |

The places: Home, Files, Search, Settings (the list, an area), Commands, the graph, the Library, the palette, the tabs sheet and the capture box (browser), and **one note of each shape** found in the vault — the largest with a table, a callout, math, code, an embed, a picture, a Base, tasks, properties — and a PDF. The modes: the app's note view (a fake `AtlasNative` bridge, 412 × 700: the WebView between the native bars), a phone's browser (390 × 760), the app sideways (860 × 330), a small phone (360 × 640); light and dark for the first two. The report (`report.json`) and a screenshot per place go to `--out`.

Run it against a core serving a **copy** of a vault (the audit opens files; a browser's layout is saved):

```
rsync -a --exclude cache ~/Notes/.atlas <copy>/ && rsync -a ~/Notes/{notes,mail,Home.page,templates} <copy>/ && rsync -a --max-size=15m ~/Notes/refs <copy>/
ATLAS_UI_DIR=ui/dist ATLAS_SECRETS_DIR=<copy>-secrets target/debug/atlas serve <copy> --port 7790 &
node scripts/dev/phone-audit.mjs --url http://127.0.0.1:7790/ --vault <copy> --out <dir>
```

## Next (not done)

- ~~Touch sizes inside the panes~~ — **done** (2026-10-18; Android's 48 dp minimum, and a CSS px is a dp in the WebView): the note's format bar 44 × 48 px; the path crumbs 44 px tall; icon buttons stay 40 px to the eye but take taps 4 px above and below (an invisible `::after` strip, never sideways onto a neighbour; not on `.tipped` buttons, whose `::after` is their tooltip). (The file tree's rows are 40 px on a phone already; context menus' rows 44 px since.)
- ~~The keyboard~~ — **done**: `--keyboard` (lib/phone.svelte.ts, from `visualViewport`) is how much of the bottom the on-screen keyboard covers; the toasts, the capture button and the tabs sheet sit above it. In the app's WebView (`adjustResize`) it stays 0: the WebView itself shrinks.
- ~~Swipes~~ — between files: **done in the app** (a fling on the native top bar, docs/guides/ANDROID.md); from the left edge: dropped — the edges are the system's Back gesture on Android and in a phone's browser. In a phone's browser the same swipe on `PhoneTop` (spec `phone-back.spec.ts`).
- **Back** — **done** (`lib/back.ts`): open overlays register how they close; the app's system Back closes them first (`atlasShell.dismiss`), and in a phone's browser one guard history entry makes the system Back close an overlay, then go back a place (`navigate(-1)`), and only then leave Atlas (before, Back left Atlas at once: the app kept no browser history). Spec `phone-back.spec.ts`.
- **Sideways** — **done**: a phone turned sideways is a phone (`PHONE_QUERY` adds `(max-height: 480px) and (pointer: coarse)`), and inside the app the page is always one.
- **The shape audit**: `scripts/dev/phone-audit.mjs` — see below.
- ~~Speed on a phone~~ — **measured** with Chromium's CPU throttling (a 390 × 760 touch page; `ATLAS_PERF=1 npx playwright test tests/perf-phone.spec.ts`, which prints `[perf]` lines; it is skipped otherwise). A 1000-line note with math, links and tags; a key from its input event to the frame after next:

  | CPU | open the note | a key (median / worst) | Files | Search |
  |---|---|---|---|---|
  | 1× (this laptop) | 295 ms | 9 / 19 ms | 126 ms | 115 ms |
  | 4× (a mid-range phone) | 892 ms | 42 / 70 ms | 278 ms | 99 ms |
  | 6× (a slow phone) | 867 ms | 43 / 66 ms | 381 ms | 132 ms |

  Typing stays within three frames even at 6×; opening a very big note is the one wait near a second (its first
  render), and Files grows with the throttle (the folder's rows). Nothing here needs work now; the spec is there to
  measure again after a change to the editor or the phone views.
- The Tauri app on Android, and what "hook it up" means: open questions (2026-10-16).


## Files and Search on a phone (2026-10-17)

Files and Search get their own phone views instead of the desktop's, designed for normal phones and for the Boox.

- **Files** (`ui/src/components/PhoneFiles.svelte`, used by `panes/Files.svelte` while `phone.on`): the desktop's side-panel tree (16 px rows, hover buttons, drag and drop) was the phone's Files. Now one folder at a time, as a phone's files app: the folder's name large on top with the path above it as tappable crumbs, an **up** button, **Back goes up a folder** before it leaves Files (`closable` from `lib/back.ts`, so the app's system Back and a browser's Back both do it); rows of 60 px (× `--ui-scale`) with an icon tile, the name (notes without `.md`), *date · size*; folders first, then by name or **newest first** (a toggle, remembered); **new note / new folder here**; a long press is Files' own menu (the same `onContext`, through `.row[data-path]` / `.is-dir`); "Show in Files" (`atlas-active-file`) opens the file's folder and highlights it. The folder you were in is remembered (`atlas.phone.files.dir`). The desktop tree is unchanged on wide screens.
- **Search** (`panes/Search.svelte`, CSS under `html.phone`): a 48 px pill-shaped field at ≥ 16 px (no browser zoom on focus); no replace toggle and no expert switches (case, word, regex, agent files) on a phone; file hits as two-line rows (name, folder under it); line hits in the text font, wrapping to three lines, no line-number column; keyboard hints hidden (`keys-only`).
- **Both screens**: every size is `calc(N px * var(--ui-scale, 1))`, so a normal phone gets ×1.15 and the Boox ×1.15 × 1.25 (`--eink-scale`); on e-ink the revealed row is framed instead of tinted, rows are separated by hairlines (no rounded grey press states), and Search leaves no grey bar on the last-touched row.
- **SVG** (every width): opens as a picture now (`specForPath`); its code through *Open with → Text editor* (desktop menu, or the phone's ⋮ → Open with…).


## The audit on a real vault (938 findings → 3)

Run on a copy of a large real vault (notes, templates, refs ≤ 15 MB) with the commands above. What it found and what was done:
- **Audit noise, fixed in the audit** (`judge()` in scripts/dev/phone-audit.mjs): elements nobody sees were judged — side tools kept mounted but hidden on a phone (a search field "4 px wide", a drafts button "22 px wide"), dockview's screen-reader live region (1 px), pdf.js's see-through selection text. An element now counts only when it is on the screen, not cut away by a clipping box around it, larger than 1 px, and its text not transparent.
- **Small targets, fixed** (base.css, `html.phone`): the note's format bar (330 findings: 28×26 buttons → 40), Settings' switches (×1.5), the path crumbs (36), Today's rows and Settings' side list (44), `.btn`, `button.link`, form fields (40), the graph's checkboxes (26), the search pill's field fills the pill.
- **A real gap**: `>` typed first in the file finder (Ctrl+P) now turns it into the commands, as in VS Code (Palette.svelte; spec `command-bar.spec.ts`) — the audit's "Settings" step had stopped on "No matches".
- Left: 3 findings (a toggle's box in the graph pane and similar), below what a finger notices.
