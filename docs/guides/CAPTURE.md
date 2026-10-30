# Quick capture from anywhere on the desktop

The goal: a global KDE shortcut that opens a well-integrated, unobtrusive floating box to write something quickly, making capture easy, with completions. About vaults: a capture should be able to go to the work vault or the personal one.

## What there is

**A small native box above everything** — `atlas-capture` (crate `crates/atlas-capture`, drawn with egui; no web view). The first box rendered too slowly, and the capture box must not use WebKit. Starting a WebKit view was what made the old box slow; the native one is on screen at once.

- **Keys.** Type; **Enter** writes it and the box is gone (after showing where it went, `log/2026-10-14.md:7`, for two thirds of a second); **Esc** closes it, nothing written; when the open Atlas took the text but its answer never came, the box says it may be saved already and only **Ctrl+Enter** sends it again (`send::NotSaved::Unsure`), so a plain Enter cannot write it twice; **another window taking the focus** closes it too (only once it had the focus: a new window may start unfocused). **What was typed is never lost**: it is kept as that vault's draft (`src/draft.rs`, `$XDG_STATE_HOME/atlas/capture-drafts/`, written on every change, so a killed box keeps it too) and an empty box opens with it; saving or emptying the text removes it, and switching vault moves it. Pressing the key again while a box is open starts a second box, which takes the focus, closes the first and opens with its text, so a single-instance lock is not needed for this. The chips (screen, clipboard, page) are not kept. `ATLAS_CAPTURE_DRAFTS=<dir>` keeps them elsewhere, `=off` not at all (`scripts/dev/capture/look.sh` uses it). **Super+V** opens the vault list, **Super+↑ / Super+↓** switch vault (Super is Atlas's key, docs/guides/KEYS.md; Alt+V and Alt+↑/↓, the first keys, still work). The footer shows the keys: `Super+V` beside the vault pill when there are several vaults, `↑↓ Tab move · Enter take · Esc back` while a list is open.
- **What it looks like.** Atlas's colours (`look.rs`: the tokens of `ui/src/styles/tokens.css`, dark or light as the vault's `ui.theme`), the desktop's UI font (Inter when installed, else Noto Sans), Atlas's "A" tile, the text line, a hairline, then the footer: what the text will become once there is text ("a to-do, due tomorrow", "a line in today's log · mentions Friday"), the vault as a pill (a click lists the known vaults), and the two keys as quiet chips. Little guides on an empty box (see "Finished" below), no empty space below, but not bare either.
- **Completions.** `[[` a note's name, `#` a tag, `@` a day (`@today`, `@tomorrow`, `@mon`…`@sun`, `@+3d`), and on a to-do (`[] `, `todo `) the Obsidian Tasks fields — one letter of a field's first word is enough (`d` → due, `h` → high priority…); after a date field the dates by name. ↑ ↓ choose, Tab or Enter take, Esc closes the list. The list grows the window. The lists are the same as the web boxes' (`ui/src/lib/task-complete.ts`, `textarea-complete.ts`), copied in `complete.rs` — **change both** (tests on each side).
- **Where it writes.** Through the Atlas open on that vault (`vaults::running_server`), so its window updates and one core runs the vault's schedules; with none open, straight to the files (`capture::capture`), as `atlas capture` does. An Atlas that is listed but takes no connection (it crashed or is closing) counts as none: the capture goes to the files, never lost. Once the request has been sent, a failure is shown instead of writing again, since that Atlas may already have written it (`send.rs` `Post`). Days are read by one function for both (`capture::day_of`).
- **Which vault.** The one named on the command line or by `ATLAS_WORKSPACE`, else the one opened last, then the other known ones.
- `ATLAS_CAPTURE_TEXT="[] pay due" atlas-capture` starts with text typed — for screenshots and tests of the completions.

**The older box** — the desktop app as `atlas-app --capture` showing `capture.html` (its own small bundle) or `/#capture` (`ui/src/CaptureWindow.svelte`) — stays for `ATLAS_CAPTURE=webview`, and the page also works in a browser at `/#capture`.

**One web capture box.** The in-app popup and that window are two frames around one component, `ui/src/components/CaptureBox.svelte`: the hint line, completions, the guides, the To-do chip, pasted or dropped files beside today's log, the vault picker (shown when there are two or more vaults; Super+↑/↓ or Alt+↑/↓ as in the native box), and a failure kept in the box with the text. The popup (`QuickCapture.svelte`) adds the scrim, the draft, the triage count and the Captured notice; the window (`CaptureWindow.svelte`, 620×160, a one-line box) adds the vault list, where it went and closing itself. A file pasted while another vault is chosen is refused: files go beside this vault's log only. Today's box on Home is still its own (TodayParts.svelte).

**Lessons from making it**: a window built with `resizable(false)` is pinned to its first size on Wayland, so the completion list was cut off; a transparent window was drawn white by the compositor (no rounded corners); a border drawn on the window's edge is half clipped (it is drawn 1 px inside). Test windows opened on a desktop in use caught what was being typed there — **never open test windows on a desktop in use without asking**.

**Completions in the capture box of Today** (the web page): the same short forms and lists, `ui/src/lib/textarea-complete.ts` (a Svelte action for any plain text box). Test: `capture-hints.spec.ts`.

## Finished

What was still missing: a completion list for tasks; the links list was cut off by the window and its borders looked wrong; too much space below; no small guides; and rendering was still too slow.

- **Drawn on the CPU, no GL.** eframe and its GL context were replaced by winit + softbuffer, with egui's output painted by `raster.rs`. Launch to the first frame on screen (headless KWin, 20 launches each, taken in turn): **79 ms median before (55–84), 24 ms after (16–25)**. Cargo.lock lost 676 lines. The CPU and GL renderings were compared pixel for pixel.
- **Lists are never cut off.** On Wayland egui is told no window position, so the old "does the list fit" check never fired, and a resize asked before the compositor's first configure was lost. The box now measures its content every frame and asks again until the window has that size. The task-field lists (the core's `task_suggest`, with the web lists' icons) and the `[[` lists hang under the word being completed, at most 8 rows. The footer's keys change while a list is open.
- **Esc no longer loses the keys.** egui drops the text field's focus on Esc, so after Esc closed a list, typing did nothing. Found with real keys and fixed, with a test. Alt+V typed a "v": fixed.
- **The vault menu** opens on a click on the vault pill or Alt+V; Alt+↑/↓ still switch vault.
- **Little guides** on an empty box: `[]` to-do · `@fri` date · `[[` link · `#` tag. Read in the transcript, "and no little guides" came right after "are the modals done?": a complaint that there were none (this file used to read it the other way).
- **Border:** a crisp one-pixel edge inside the window, checked pixel by pixel. The corners stay square: rounded corners need a transparent window, and "the borders look weird" was said about the earlier rounded version.
- **Every capture box says the same words**: the empty box's prompt and its four guides (`[]` to-do · `@fri` date · `[[` link · `#` tag, each a chip that starts the text with it, its tooltip the form with examples) are `atlas_core::capture::{PROMPT, GUIDES}`; the web boxes (Today, the capture box of the popup and the window, the command bar's capture) show them through `CaptureGuides.svelte` from `ui/src/lib/capture-guides.ts`, the phone from `CaptureActivity.java` — both copies, compared with the core by atlas-capture's `every_capture_box_shows_the_cores_words`, so **change all three**. Where a capture went reads the same everywhere too: the shown path (no `.md`) and the line (`landedAt`).
- **The web capture page and Today's box** have the same layout. Every list row has an icon, and the list fits the window: it flips above the box when there is more room there, then scrolls. A CSS selector that painted every row's icon in the accent colour (instead of only the chosen row's) was fixed.
- **The shortcut:** `packaging/kde-shortcut.sh`, called from install.sh. It sets Meta+Shift+C (or `ATLAS_CAPTURE_KEY`) only when Atlas Capture has no key yet and the key is free everywhere. A dry run on a copy of a real `kglobalshortcutsrc` kept its existing Meta+T. It has not been run on a real config.

**How the native box was checked: never on a real desktop session.** In a nested `kwin_wayland --virtual` on a private D-Bus (`scripts/dev/capture/look.sh` with `shot.py` and `xtype.py`), with screenshots through KWin's screenshot API and real keys typed through the nested Xwayland. Every state (empty, typing, task fields, `[[` list, vault menu) was looked at in dark and light. A full keyboard run wrote `- [ ] pay the rent 📅 2026-10-15 [[Hamiltonian]] ok` into the second vault, and opening a second box closed the first.

**Watch out:**
- The first nested run was not yet on a private D-Bus and reached the real session bus. The screenshot request was refused there and nothing else happened.
- A nested KWin crash started KDE's crash handler (drkonqi) twice; both were stopped at once.
- Always use a private bus and `KDE_DEBUG=1`.

## Inside the app: the capture popup

**Super+C**, **Super+E twice** (the second press carries what was typed in the command bar), or the **Capture** tile in
the top bar open one popup over whatever pane is open (`components/QuickCapture.svelte`, `lib/quick-capture.svelte.ts`).
It never navigates. It holds the editor's selection when there is one, a draft left with Esc otherwise, and says what the
text becomes (the core's hint: a to-do due Friday, a link the catalog will file). It has a To-do switch, the same
completions as Home's box (`[[` notes, `@` dates, task fields), and a "N to triage" link to the captures still to sort.
Enter saves to the day's log through the core's capture, as every other door does.
A picture or file pasted or dropped into it is copied beside the day's log (`POST /api/attach`, the editor's own path:
`lib/attach.ts`) and its embed goes into the text on a line of its own; Save waits until the copies are written. The
pictures still embedded show as thumbnails under the text; a thumbnail's × takes its embed out (the file stays).
The "Captured" notice (every in-app door: the popup, the command bar) has **Open**, the line in its note, and **Undo**:
`POST /api/capture/undo` (`captures::undo`) takes the bullet and the lines under it out of the log, or a capture that
became a note of its own to the trash, and the text comes back in the popup. As triage does, it checks the line is still
the one written (`CaptureResult.source`); edited or filed meanwhile, nothing is touched and the notice says so.

**Triage by keyboard.** In the Captures view (`components/views/Captures.svelte`) a clicked row takes the keys: `j`/`k`
(or ↑/↓) move, `t` makes it a to-do, `f` files it into a note, `d` dismisses, `x` ticks a to-do, `u` reopens, Enter opens
its line. The focus stays in place as an answered row leaves the list, so a run of keys clears it; the keys are listed
over the rows while the list has the focus. What opens over the page (the command bar, this popup, a plugin's dialog)
gives the focus back when it closes (`lib/focus-return.ts`).

## Floating lists and the app's card

The capture window needed a redesign closer to the app's look, and the completion list should float instead of resizing the window.

**What changed.** On Wayland the box is now the app's capture card in a window that never resizes: the window opens at `FLOAT_WIDTH × FLOAT_HEIGHT` (the box plus a 14-pt margin for the shadow plus room for an 8-row list) and is **transparent** outside the card. The card is drawn like the Home page's focused capture box — rounded 12 pt, the accent border at 55 %, the soft `--accent-soft` ring and a shadow under it (`look::card_halo`) — and a list (task fields, `[[` notes, `#tags`, `@days`, the vault menu) hangs **under the card in the transparent area**, as the web box's list hangs under it. Nothing resizes when a list opens or closes; the window grows only if the text itself grows past the room.

**Clicks go through the empty part.** Only the card and the open list take the pointer: `src/region.rs` reaches winit's `wl_surface` through its raw handle and sets an input region (`wl_surface.set_input_region`) from the rectangles the frame drew (`Capture::hit`), on an event queue of its own on winit's connection. A click on the see-through part lands on the window below — which takes the focus, so the box closes as it does on any click outside.

**Transparency needed a patched softbuffer.** softbuffer 0.4 hands Wayland `Xrgb8888` buffers (opaque); `crates/vendor/softbuffer` is 0.4.8 with those two formats changed to `Argb8888` (`crates/vendor/softbuffer/ATLAS.md`, `[patch.crates-io]` in the root Cargo.toml). `raster.rs` now carries alpha: premultiplied ARGB, cleared to transparent when floating.

**X11 keeps the growing box.** Off Wayland (or with `ATLAS_CAPTURE_FLOAT=0`) the window is the box, opaque, and grows for a list as before: X11 has no alpha without a compositor's ARGB visual, and the keyboard check (`look.sh keys`, XTEST through Xwayland) runs that path.

**Checked.** Headless: `floating_a_list_opens_under_the_card_and_the_window_keeps_its_size` (the list under the card, inside the room, no size asked of the window, the pointer regions). In a hidden `kwin_wayland --virtual` (`look.sh shots`): every state in dark and light — the card stays where it is, the task list floats below it. `look.sh keys` (X11 path): a to-do with a date, a link, the vault menu, Enter — written as before. **Not seen on a real desktop**, and the click-through was not exercised in the hidden KWin (no Wayland pointer injection there). One oddity: after `look.sh shots` the nested KWin did not exit by itself once (killed by PID); the script's exit trap is the suspect, not the box.

## Setting it up (once)

On the development machine: nothing is bound to *Atlas Capture* yet; `Meta+A` already opens Atlas itself; `Meta+Space`, `Meta+Shift+C` and `Meta+C` were free. Suggested: **Meta+Shift+C** for the floating box.


`packaging/install.sh` installs the launcher `atlas-quick-capture` and the menu entry **Atlas Capture**. Then, in KDE: System Settings → Keyboard → Shortcuts → Add New → Application → *Atlas Capture*, and give it a key.

The menu entry starts the launcher by its full path (`~/.local/bin/atlas-quick-capture`), and the launcher adds `~/.cargo/bin` to its PATH: a KDE session's PATH has neither, and with `Exec=atlas-quick-capture` the entry did nothing at all (reported in).

`atlas-quick-capture` starts `atlas-capture` (the native box). `ATLAS_CAPTURE=webview` starts the older web box of the desktop app; `ATLAS_CAPTURE=dialog` a one-line KDE dialog and `atlas capture` — which is also what happens when neither is installed.

## How it works, and what to watch

- **One core per vault.** When Atlas is already open on the vault, the box talks to *that* Atlas: `vaults::running_server(root)` reads the vault's `.atlas/cache/server.json` and believes it only while the folder is the same and the process is alive. Only when no Atlas is open on it does the box start a core of its own, stopped when the box closes. Two cores on one vault would run its scheduled commands twice — the reason for this care.
- **Closing.** A web page cannot close a desktop window by itself. The page goes to `/__atlas_close`; the window's navigation handler (`on_navigation` in `crates/atlas-app/src/main.rs`) sees that address, exits the process and refuses the navigation. In a browser the address simply does not exist — the tests answer it themselves and count it.
- **Another vault.** `POST /api/capture` takes `vault: <path>`: accepted only for a folder in the list of known vaults (`~/.config/atlas/vaults.toml`), and written straight into that vault's files (`capture::capture`), whether or not an Atlas is open there (an open one notices the file change).
- **The app's first keys.** `ui/src/main.ts` imports both the app and the capture page up front and mounts one. A first version imported the chosen one with `await import(…)`; the app then mounted a moment later and a key pressed right after the page loaded was lost (a smoke test caught it).

## From the phone (the route taken)

The wish: a blazing fast way to capture things on the phone. The route that needs nothing new on the phone and nothing new on the server: **ntfy**, which many self-hosted servers already run.

- On the phone: the ntfy app, a topic of one's own (say `atlas-inbox`). To capture: open the app and type into that topic — or, from any app, **Share → ntfy → atlas-inbox**, which sends a link or a text in two taps. A home-screen shortcut to the topic makes it one tap to the box.
- In Atlas: the Notifications plugin (`plugins/beta/notifications/`), its **Topic to capture from** set to that topic (and the token, if the topic is protected). Its `sync` polls the topic every 5 minutes (the core's schedule) and when a page starts; every message becomes a capture in today's log — or a to-do with `[] `, a dated one with `@tomorrow`, exactly as typed in the capture box. A captured address alone is filed by the catalog when it runs.
- **While Atlas is closed** messages wait in ntfy (for as long as the server's cache keeps them). The helper keeps the id of the last message it captured (in the vault's cache) and asks ntfy for everything since (`?poll=1&since=<id>`): what was sent meanwhile is captured then, and nothing twice (one sync at a time).
- **Not checked on a real phone or server** — only against a stand-in in `example-notifications.spec.ts` and the helper's unit tests.

## Not done, and not checked

- **Not seen on a real screen**; checked in a nested KWin only (above). Fractional scaling is untested (the nested KWin gives its windows scale 1). Keys on native Wayland were not driven (only through Xwayland; both go through egui-winit).
- The older webview box does not grow; its list scrolls instead.
- `scripts/dev/capture/look.sh` was committed from scratch versions that ran; the committed form itself has not been run.
- Clipping an address typed alone into the box (the clip plugin listens to captures made in Atlas's own boxes, not to this one).
- The phone (roadmap 4.4) and the web clippers (4.5) are separate pieces.


## It crashed on every normal close (fixed)

The capture box closed normally but a crash notification followed. `coredumpctl` had a SIGSEGV of `atlas-capture` for each close. The faulting thread was smithay-clipboard's worker (egui's Wayland clipboard) destroying its `zwp_primary_selection_device_manager` proxy, while the main thread joined it from `drop(Shown)` at the end of `window::run`. winit's `run_app` takes the event loop **by value**: when it returns, the Wayland connection is already closed, and the clipboard tidied up its objects on that dead connection. Fix: `ApplicationHandler::exiting` drops the window, with egui's state and clipboard, while the loop and the connection still exist. Checked in a hidden KWin, with KWin's scripting closing the window (`workspace.windowList()` → `closeWindow()`): the installed build ended with signal 11, the fixed one with status 0 (and no `atlas-capture` core dump since).

## Besides the text: the page, the clipboard, the screenshots

The desktop box offers a screenshot or the clipboard too, and the last screenshot taken, not only a new one; a picture can be viewed bigger; and in a browser (or YouTube) the page's address is copied automatically.

A row of chips under the text (`src/extras.rs`, drawn at the text's left edge, inside the card), each found in the background when the box opens (`src/context.rs`) — the box is on screen before any of them is known, and none can fail it:

| chip | where it comes from | at the start | key |
|---|---|---|---|
| **the page** (its title) | the window you were on, when it is a browser: its history's newest visit whose title the window's caption holds | **on** | Super+U |
| **the clipboard** (its text, or a picture copied) | `wl-paste` (a picture as PNG when the clipboard holds one, e.g. a screenshot Spectacle copied) | off | Super+C |
| **Last screenshot** (thumbnail) | the newest picture in Spectacle's save folder (`imageSaveLocation` in spectaclerc, else Pictures/Screenshots) from the last 30 minutes | off | Super+Shift+S |
| **Screen** (thumbnail) | the window you were on, pictured by KWin as the box opens (see the next section); without KWin's permission, taken on the first click (the box drawn empty 160 ms, then Spectacle) | off | Super+S |

- **Saved**: the page goes on the capture's line after the text (`read later [Title](url)`); the clipboard's text on a line under it, except a copied link alone, which goes on the line as the page does (`extras::link_alone`; still offered off: the box cannot tell how old the clipboard is); each picture is copied beside today's log note (`send::attach`, the same function the phone uses) and embedded under the line (`![[Screen 2026-10-16 101010.png]]`). Nothing typed: the clipboard's text, else the picture's name (Screen / Last screenshot), is the line. `app::compose`.
- **Bigger**: the pointer on a picture's chip shows it large (up to 440×250) with what it is and its key; every chip's hover note names its key. The keys are drawn in the chips while the row has room; with many chips they move to the hover note so the labels stay readable. Long labels (a title, copied text) are cut to share the row, never overflowing the card.
- **The window you were on** (`context::window_under`): a one-line KWin script, loaded through `org.kde.kwin.Scripting`, calls back over D-Bus (to the box's own unique bus name) with the caption and class of the active window — or, when the box is already active, the topmost normal window that is not the box (skipped by process id). ~50 ms. Not KDE: no page, nothing else changes.
- **A browser** is recognised by shape, not a list: the class's desktop file (by name, `.<class>` suffix — a Flatpak id — or `StartupWMClass`) has `Categories=…WebBrowser`. Its histories are looked for only in its own folders: the Flatpak's `~/.var/app/<id>/`, else Firefox's family's dot folders and the `~/.config` folders named like the class — a `places.sqlite` (Firefox, Zen, LibreWolf…) or a `History` with `Preferences` beside it (Chromium's family). Walking all of `~/.config` and `~/.var/app` took 0.7 s; this takes ~0.2 s with the read.
- **Reading a history** (bundled SQLite, `rusqlite`): read-only in place; when the browser holds it locked (or a write-ahead log needs recovery), from a copy of the file and its `-wal` in the box's runtime folder, removed after. The newest 80 visits.
- **Matching** (`match_caption`): the longest stored title the caption holds wins — a site's home page ("YouTube") is in every one of its captions — then the newest. Compared **folded** (ASCII letters and digits; an accented letter dropped whole, composed or decomposed): Zen stores "María" decomposed (`Mari` + U+0301) while a caption may be composed; without the fold the real check found the YouTube home page instead of the video. No match: no page (never a guess).
- **Checked**: on a real Zen browser history (read-only), a pretended caption of a recently watched video ("(2) <video title> - YouTube — Zen Browser", the title with an accented name) → that video's watch URL in 228 ms; in a hidden KWin, the window under the box was found (Konsole, "not a browser") in 138 ms; Spectacle takes the nested screen in 407 ms. Tests: `the_page_and_a_picture_go_with_the_capture`, `super_s_takes_the_screen_without_the_box_in_it` (a stand-in for Spectacle: tests never touch the desktop), `context::tests` (shape search, a Firefox history, the caption match incl. decomposed titles), `extras::tests`.
- **`atlas-capture --context`** prints what the box would offer and why (the window, whether it is a browser, the page and how long it took, the clipboard, the last screenshot); `ATLAS_CAPTURE_WINDOW="caption|class"` pretends a window. `ATLAS_CAPTURE_NO_CONTEXT=1` gathers nothing; `ATLAS_CAPTURE_EXAMPLE_CHIPS=1` (or `=<a .png>`, offered as the last screenshot) shows example chips for screenshots (`look.sh shots`).
- The box is 111 pt tall now (was 83): the chips row. Pictures taken by the box live in `$XDG_RUNTIME_DIR/atlas-capture-<pid>/` and are removed when it closes.
- Not done: the browser's address when the history has no entry yet for a page opened seconds ago (Firefox writes visits at once; a page still loading has no title); X11 sessions take the screen with the box in it (no hiding there).


## The screen taken before you ask; plainer chips

The desktop box's UX is as simple as possible: the screenshot is taken before the chip appears, so it is faster, and discarded if not wanted.

- **The picture is taken as the box opens**, of **the window you were on** (`context::window_shot`): the KWin script now also returns the window's `internalId`, and KWin's ScreenShot2 `CaptureWindow` (native resolution, no decoration, cursor or shadow) draws that window on its own — the box, on screen or not, is never in it, so nothing waits for anything. Raw pixels come back over a pipe (QImage format 4–6 BGRA or 16–18 RGBA), are written as a PNG (fast compression) in the box's runtime folder: ~95 ms in a hidden KWin, before the chip shows. The **Screen** chip then has its thumbnail, starts **off**, and a click (or Super+S) only turns it on. Not chosen: deleted with the runtime folder when the box closes.
- **Permission**: KWin gives window pictures only to a program whose desktop file names it in `Exec=` and lists `X-KDE-DBUS-Restricted-Interfaces=org.kde.KWin.ScreenShot2`. The menu's "Atlas Capture" entry starts the wrapper script, so `install.sh` now also installs a hidden `atlas-capture-box.desktop` with `Exec=~/.cargo/bin/atlas-capture` (packaging/atlas-capture-box.desktop). Checked in a hidden KWin with the permission check on: with that file, the picture (100 ms); without it, "The process is not authorized to take a screenshot" (11 ms) — then the chip takes the screen on a click as before (the box hidden for 160 ms, Spectacle).
- **Plainer chips**: no keys drawn in them — a few words and a thumbnail; each chip's hover note says its key. Last screenshot is offered only when taken in the last 10 minutes (was 30): one taken just before, to go with the capture.
- `atlas-capture --context` also takes the window's picture and says how long it took; `ATLAS_CAPTURE_KEEP=1` keeps the pictures to look at.


## What is playing

Feature parity with the Android capture box. The phone offered the song or
video playing; the desktop box now does too: a **Playing** chip (Super+M, offered off, last in the row as in the
user's order "… link, youtube/etc"), read over MPRIS (`context::playing`) — the first player that says "Playing",
else one "Paused" (paused to capture it). It goes on the capture's line as "Artist – Title", linked when the player
gives a web address: Firefox's YouTube tab answers `xesam:url = https://www.youtube.com/watch?v=…`, so the catalog
files the video. A local file's path is never offered. Test: `what_is_playing_is_offered_by_artist_and_title_with_its_web_address`.

Still apart from the phone: files shared into the box (the desktop has drag and drop on the main window instead), the
pen canvas. The phone's "Catalogue it" chip (for server vaults) is not needed here: a capture through the open Atlas runs
the catalog's capture hook, which files every link in it by default (its `on_capture` setting) — a chip would file
them twice. A local vault's captures go through its open Atlas, whose capture
hooks (catalog, OCR) act on them; with no Atlas open the capture is written straight to the file and kept in
`.atlas/pending/<device>.jsonl` — synced with the vault (not in `.atlas/cache`, which Syncthing leaves per machine), so a
capture the phone made reaches the desktop — and the next Atlas to serve the vault runs the hooks on it first (385aa2f).


## What the catalog will make of it

The status line under the text says, as it is typed, what the catalog will file — "a line in today's log · catalogued
as a film" (an album, a paper, a web page…): the vault's catalog plugins' own `recognize` patterns, matched in the box
at once (`atlas_core::catalog_hint`, read again every 30 s; nothing asked of any service). Plain words get no mention.
Every box takes this line from one place, `atlas_core::capture::describe`: the desktop box and the web (`POST
/api/capture/describe`) with the vault's settings; the phone through JNI (`crates/atlas-android/src/phone.rs`) still
without its vault, so without the catalog's kind (the Android lane).
