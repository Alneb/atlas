# Quick capture from anywhere on the desktop

The goal (2026-10-14): a global KDE shortcut that opens a well-integrated, unobtrusive floating box to write something quickly, making capture easy, with completions. About vaults: a capture should be able to go to the work vault or the personal one.

## What there is

**A small native box above everything** — `atlas-capture` (crate `crates/atlas-capture`, drawn with egui; no web view). The first box rendered too slowly, and the capture box must not use WebKit (2026-10-14). Starting a WebKit view was what made the old box slow; the native one is on screen at once.

- **Keys.** Type; **Enter** writes it and the box is gone (after showing where it went, `log/2026-10-14.md:7`, for two thirds of a second); **Esc** closes it, nothing written; **another window taking the focus** closes it too (only once it had the focus: a new window may start unfocused). **Super+V** opens the vault list, **Super+↑ / Super+↓** switch vault (Super is Atlas's key, docs/guides/KEYS.md; Alt+V and Alt+↑/↓, the first keys, still work). The footer shows the keys: `Super+V` beside the vault pill when there are several vaults, `↑↓ Tab move · Enter take · Esc back` while a list is open.
- **What it looks like.** Atlas's colours (`look.rs`: the tokens of `ui/src/styles/tokens.css`, dark or light as the vault's `ui.theme`), the desktop's UI font (Inter when installed, else Noto Sans), Atlas's "A" tile, the text line, a hairline, then the footer: what the text will become once there is text ("a to-do, due tomorrow", "a line in today's log · mentions Friday"), the vault as a pill (a click lists the known vaults), and the two keys as quiet chips. Little guides on an empty box (see "Finished" below), no empty space below (*"too much space below"*), but not bare either (*"this is too simple now"*).
- **Completions.** `[[` a note's name, `#` a tag, `@` a day (`@today`, `@tomorrow`, `@mon`…`@sun`, `@+3d`), and on a to-do (`[] `, `todo `) the Obsidian Tasks fields — one letter of a field's first word is enough (`d` → due, `h` → high priority…); after a date field the dates by name. ↑ ↓ choose, Tab or Enter take, Esc closes the list. The list grows the window. The lists are the same as the web boxes' (`ui/src/lib/task-complete.ts`, `textarea-complete.ts`), copied in `complete.rs` — **change both** (tests on each side).
- **Where it writes.** Through the Atlas open on that vault (`vaults::running_server`), so its window updates and one core runs the vault's schedules; with none open, straight to the files (`capture::capture`), as `atlas capture` does. An Atlas that is listed but takes no connection (it crashed or is closing) counts as none: the capture goes to the files, never lost. Once the request has been sent, a failure is shown instead of writing again, since that Atlas may already have written it (`send.rs` `Post`). Days are read by one function for both (`capture::day_of`).
- **Which vault.** The one named on the command line or by `ATLAS_WORKSPACE`, else the one opened last, then the other known ones.
- `ATLAS_CAPTURE_TEXT="[] pay due" atlas-capture` starts with text typed — for screenshots and tests of the completions.

**The older box** — the desktop app as `atlas-app --capture` showing `capture.html` (its own small bundle) or `/#capture` (`ui/src/CaptureWindow.svelte`) — stays for `ATLAS_CAPTURE=webview`, and the page also works in a browser at `/#capture`.

**Lessons from making it** (2026-10-14): a window built with `resizable(false)` is pinned to its first size on Wayland, so the completion list was cut off; a transparent window was drawn white by the compositor (no rounded corners); a border drawn on the window's edge is half clipped (it is drawn 1 px inside). The test windows opened on the user's screen caught their typing — **do not open windows on the user's screen without asking**.

**Completions in the capture box of Today** (the web page): the same short forms and lists, `ui/src/lib/textarea-complete.ts` (a Svelte action for any plain text box). Test: `capture-hints.spec.ts`.

## Finished (2026-10-15)

What was still missing: a completion list for tasks; the links list was cut off by the window and its borders looked wrong; too much space below; no small guides; and rendering was still too slow.

- **Drawn on the CPU, no GL.** eframe and its GL context were replaced by winit + softbuffer, with egui's output painted by `raster.rs`. Launch to the first frame on screen (headless KWin, 20 launches each, taken in turn): **79 ms median before (55–84), 24 ms after (16–25)**. Cargo.lock lost 676 lines. The CPU and GL renderings were compared pixel for pixel.
- **Lists are never cut off.** On Wayland egui is told no window position, so the old "does the list fit" check never fired, and a resize asked before the compositor's first configure was lost. The box now measures its content every frame and asks again until the window has that size. The task-field lists (the core's `task_suggest`, with the web lists' icons) and the `[[` lists hang under the word being completed, at most 8 rows. The footer's keys change while a list is open.
- **Esc no longer loses the keys.** egui drops the text field's focus on Esc, so after Esc closed a list, typing did nothing. Found with real keys and fixed, with a test. Alt+V typed a "v": fixed.
- **The vault menu** opens on a click on the vault pill or Alt+V; Alt+↑/↓ still switch vault.
- **Little guides** on an empty box: `[]` to-do · `@fri` date · `[[` link · `#` tag. Read in the transcript, "and no little guides" came right after "are the modals done?": a complaint that there were none (this file used to read it the other way).
- **Border:** a crisp one-pixel edge inside the window, checked pixel by pixel. The corners stay square: rounded corners need a transparent window, and "the borders look weird" was said about the earlier rounded version.
- **The web capture page and Today's box** have the same layout and guides. Every list row has an icon, and the list fits the window: it flips above the box when there is more room there, then scrolls. A CSS selector that painted every row's icon in the accent colour (instead of only the chosen row's) was fixed.
- **The shortcut:** `packaging/kde-shortcut.sh`, called from install.sh. It sets Meta+Shift+C (or `ATLAS_CAPTURE_KEY`) only when Atlas Capture has no key yet and the key is free everywhere. A dry run on a copy of the user's `kglobalshortcutsrc` kept their existing Meta+T. It has not been run on the user's config.

**How the native box was checked: never on a real desktop session.** In a nested `kwin_wayland --virtual` on a private D-Bus (`scripts/dev/capture/look.sh` with `shot.py` and `xtype.py`), with screenshots through KWin's screenshot API and real keys typed through the nested Xwayland. Every state (empty, typing, task fields, `[[` list, vault menu) was looked at in dark and light. A full keyboard run wrote `- [ ] pay the rent 📅 2026-10-15 [[Hamiltonian]] ok` into the second vault, and opening a second box closed the first.

**Watch out:**
- The first nested run was not yet on a private D-Bus and reached the real session bus. The screenshot request was refused there and nothing else happened.
- A nested KWin crash started KDE's crash handler (drkonqi) twice; both were stopped at once.
- Always use a private bus and `KDE_DEBUG=1`.

## Floating lists and the app's card (2026-10-15)

The capture window needed a redesign closer to the app's look, and the completion list should float instead of resizing the window.

**What changed.** On Wayland the box is now the app's capture card in a window that never resizes: the window opens at `FLOAT_WIDTH × FLOAT_HEIGHT` (the box plus a 14-pt margin for the shadow plus room for an 8-row list) and is **transparent** outside the card. The card is drawn like the Home page's focused capture box — rounded 12 pt, the accent border at 55 %, the soft `--accent-soft` ring and a shadow under it (`look::card_halo`) — and a list (task fields, `[[` notes, `#tags`, `@days`, the vault menu) hangs **under the card in the transparent area**, as the web box's list hangs under it. Nothing resizes when a list opens or closes; the window grows only if the text itself grows past the room.

**Clicks go through the empty part.** Only the card and the open list take the pointer: `src/region.rs` reaches winit's `wl_surface` through its raw handle and sets an input region (`wl_surface.set_input_region`) from the rectangles the frame drew (`Capture::hit`), on an event queue of its own on winit's connection. A click on the see-through part lands on the window below — which takes the focus, so the box closes as it does on any click outside.

**Transparency needed a patched softbuffer.** softbuffer 0.4 hands Wayland `Xrgb8888` buffers (opaque); `crates/vendor/softbuffer` is 0.4.8 with those two formats changed to `Argb8888` (`crates/vendor/softbuffer/ATLAS.md`, `[patch.crates-io]` in the root Cargo.toml). `raster.rs` now carries alpha: premultiplied ARGB, cleared to transparent when floating.

**X11 keeps the growing box.** Off Wayland (or with `ATLAS_CAPTURE_FLOAT=0`) the window is the box, opaque, and grows for a list as before: X11 has no alpha without a compositor's ARGB visual, and the keyboard check (`look.sh keys`, XTEST through Xwayland) runs that path.

**Checked.** Headless: `floating_a_list_opens_under_the_card_and_the_window_keeps_its_size` (the list under the card, inside the room, no size asked of the window, the pointer regions). In a hidden `kwin_wayland --virtual` (`look.sh shots`): every state in dark and light — the card stays where it is, the task list floats below it. `look.sh keys` (X11 path): a to-do with a date, a link, the vault menu, Enter — written as before. **Not seen on the user's screen**, and the click-through was not exercised in the hidden KWin (no Wayland pointer injection there). One oddity: after `look.sh shots` the nested KWin did not exit by itself once (killed by PID); the script's exit trap is the suspect, not the box.

## Setting it up (once)

On the development machine (looked at 2026-10-14): nothing is bound to *Atlas Capture* yet; `Meta+A` already opens Atlas itself; `Meta+Space`, `Meta+Shift+C` and `Meta+C` were free. Suggested: **Meta+Shift+C** for the floating box.


`packaging/install.sh` installs the launcher `atlas-quick-capture` and the menu entry **Atlas Capture**. Then, in KDE: System Settings → Keyboard → Shortcuts → Add New → Application → *Atlas Capture*, and give it a key.

The menu entry starts the launcher by its full path (`~/.local/bin/atlas-quick-capture`), and the launcher adds `~/.cargo/bin` to its PATH: a KDE session's PATH has neither, and with `Exec=atlas-quick-capture` the entry did nothing at all (reported in).

`atlas-quick-capture` starts `atlas-capture` (the native box). `ATLAS_CAPTURE=webview` starts the older web box of the desktop app; `ATLAS_CAPTURE=dialog` a one-line KDE dialog and `atlas capture` — which is also what happens when neither is installed.

## How it works, and what to watch

- **One core per vault.** When Atlas is already open on the vault, the box talks to *that* Atlas: `vaults::running_server(root)` reads the vault's `.atlas/cache/server.json` and believes it only while the folder is the same and the process is alive. Only when no Atlas is open on it does the box start a core of its own, stopped when the box closes. Two cores on one vault would run its scheduled commands twice — the reason for this care.
- **Closing.** A web page cannot close a desktop window by itself. The page goes to `/__atlas_close`; the window's navigation handler (`on_navigation` in `crates/atlas-app/src/main.rs`) sees that address, exits the process and refuses the navigation. In a browser the address simply does not exist — the tests answer it themselves and count it.
- **Another vault.** `POST /api/capture` takes `vault: <path>`: accepted only for a folder in the list of known vaults (`~/.config/atlas/vaults.toml`), and written straight into that vault's files (`capture::capture`), whether or not an Atlas is open there (an open one notices the file change).
- **The app's first keys.** `ui/src/main.ts` imports both the app and the capture page up front and mounts one. A first version imported the chosen one with `await import(…)`; the app then mounted a moment later and a key pressed right after the page loaded was lost (a smoke test caught it).

## From the phone (2026-10-14: the route taken)

The wish: a blazing fast way to capture things on the phone. The route that needs nothing new on the phone and nothing new on the server: **ntfy**, which many self-hosted servers already run.

- On the phone: the ntfy app, a topic of one's own (say `atlas-inbox`). To capture: open the app and type into that topic — or, from any app, **Share → ntfy → atlas-inbox**, which sends a link or a text in two taps. A home-screen shortcut to the topic makes it one tap to the box.
- In Atlas: the example plugin `plugins/beta/ntfy/` copied into the vault, its **Topic to capture from** set to that topic (and the token, if the topic is protected). Its helper keeps the subscription open; every message becomes a capture in today's log — or a to-do with `[] `, a dated one with `@tomorrow`, exactly as typed in the capture box. A captured address alone is also clipped into a note when the clip example is installed too.
- **While Atlas is closed** messages wait in ntfy (for as long as the server's cache keeps them). The helper keeps the id of the last message it captured (in the plugin's cache folder) and, when it starts again, asks ntfy for everything since (`?since=<id>`): what was sent meanwhile is captured then, and nothing twice. Not tested end to end (the stand-in server ignores `since`).
- **Not checked on a real phone or server** — only against a stand-in in `example-ntfy.spec.ts`.

## Not done, and not checked

- **Not seen on a real screen**; checked in a nested KWin only (above). Fractional scaling is untested (the nested KWin gives its windows scale 1). Keys on native Wayland were not driven (only through Xwayland; both go through egui-winit).
- The older webview box does not grow; its list scrolls instead.
- `scripts/dev/capture/look.sh` was committed from scratch versions that ran; the committed form itself has not been run.
- Clipping an address typed alone into the box (the clip plugin listens to captures made in Atlas's own boxes, not to this one).
- The phone (roadmap 4.4) and the web clippers (4.5) are separate pieces.


## It crashed on every normal close (fixed 2026-10-15)

The capture box closed normally but a crash notification followed. `coredumpctl` had a SIGSEGV of `atlas-capture` for each close. The faulting thread was smithay-clipboard's worker (egui's Wayland clipboard) destroying its `zwp_primary_selection_device_manager` proxy, while the main thread joined it from `drop(Shown)` at the end of `window::run`. winit's `run_app` takes the event loop **by value**: when it returns, the Wayland connection is already closed, and the clipboard tidied up its objects on that dead connection. Fix: `ApplicationHandler::exiting` drops the window, with egui's state and clipboard, while the loop and the connection still exist. Checked in a hidden KWin, with KWin's scripting closing the window (`workspace.windowList()` → `closeWindow()`): the installed build ended with signal 11, the fixed one with status 0 (and no `atlas-capture` core dump since).

## Besides the text: the page, the clipboard, the screenshots (2026-10-16)

The desktop box offers a screenshot or the clipboard too, and the last screenshot taken, not only a new one; a picture can be viewed bigger; and in a browser (or YouTube) the page's address is copied automatically.

A row of chips under the text (`src/extras.rs`, drawn at the text's left edge, inside the card), each found in the background when the box opens (`src/context.rs`) — the box is on screen before any of them is known, and none can fail it:

| chip | where it comes from | at the start | key |
|---|---|---|---|
| **the page** (its title) | the window you were on, when it is a browser: its history's newest visit whose title the window's caption holds | **on** | Super+U |
| **the clipboard** (its text, or a picture copied) | `wl-paste` (a picture as PNG when the clipboard holds one, e.g. a screenshot Spectacle copied) | off | Super+C |
| **Last screenshot** (thumbnail) | the newest picture in Spectacle's save folder (`imageSaveLocation` in spectaclerc, else Pictures/Screenshots) from the last 30 minutes | off | Super+Shift+S |
| **Screen** (thumbnail) | the window you were on, pictured by KWin as the box opens (see the next section); without KWin's permission, taken on the first click (the box drawn empty 160 ms, then Spectacle) | off | Super+S |

- **Saved**: the page goes on the capture's line after the text (`read later [Title](url)`); the clipboard's text on a line under it; each picture is copied beside today's log note (`send::attach`, the same function the phone uses) and embedded under the line (`![[Screen 2026-10-16 101010.png]]`). Nothing typed: the clipboard's text, else the picture's name (Screen / Last screenshot), is the line. `app::compose`.
- **Bigger**: the pointer on a picture's chip shows it large (up to 440×250) with what it is and its key; every chip's hover note names its key. The keys are drawn in the chips while the row has room; with many chips they move to the hover note so the labels stay readable. Long labels (a title, copied text) are cut to share the row, never overflowing the card.
- **The window you were on** (`context::window_under`): a one-line KWin script, loaded through `org.kde.kwin.Scripting`, calls back over D-Bus (to the box's own unique bus name) with the caption and class of the active window — or, when the box is already active, the topmost normal window that is not the box (skipped by process id). ~50 ms. Not KDE: no page, nothing else changes.
- **A browser** is recognised by shape, not a list: the class's desktop file (by name, `.<class>` suffix — a Flatpak id — or `StartupWMClass`) has `Categories=…WebBrowser`. Its histories are looked for only in its own folders: the Flatpak's `~/.var/app/<id>/`, else Firefox's family's dot folders and the `~/.config` folders named like the class — a `places.sqlite` (Firefox, Zen, LibreWolf…) or a `History` with `Preferences` beside it (Chromium's family). Walking all of `~/.config` and `~/.var/app` took 0.7 s; this takes ~0.2 s with the read.
- **Reading a history** (bundled SQLite, `rusqlite`): read-only in place; when the browser holds it locked (or a write-ahead log needs recovery), from a copy of the file and its `-wal` in the box's runtime folder, removed after. The newest 80 visits.
- **Matching** (`match_caption`): the longest stored title the caption holds wins — a site's home page ("YouTube") is in every one of its captions — then the newest. Compared **folded** (ASCII letters and digits; an accented letter dropped whole, composed or decomposed): Zen stores "María" decomposed (`Mari` + U+0301) while a caption may be composed; without the fold the real check found the YouTube home page instead of the video. No match: no page (never a guess).
- **Checked**: on a real Zen browser history (read-only), a pretended caption of a recently watched video ("(2) <video title> - YouTube — Zen Browser", the title with an accented name) → that video's watch URL in 228 ms; in a hidden KWin, the window under the box was found (Konsole, "not a browser") in 138 ms; Spectacle takes the nested screen in 407 ms. Tests: `the_page_and_a_picture_go_with_the_capture`, `super_s_takes_the_screen_without_the_box_in_it` (a stand-in for Spectacle: tests never touch the desktop), `context::tests` (shape search, a Firefox history, the caption match incl. decomposed titles), `extras::tests`.
- **`atlas-capture --context`** prints what the box would offer and why (the window, whether it is a browser, the page and how long it took, the clipboard, the last screenshot); `ATLAS_CAPTURE_WINDOW="caption|class"` pretends a window. `ATLAS_CAPTURE_NO_CONTEXT=1` gathers nothing; `ATLAS_CAPTURE_EXAMPLE_CHIPS=1` (or `=<a .png>`, offered as the last screenshot) shows example chips for screenshots (`look.sh shots`).
- The box is 111 pt tall now (was 83): the chips row. Pictures taken by the box live in `$XDG_RUNTIME_DIR/atlas-capture-<pid>/` and are removed when it closes.
- Not done: the browser's address when the history has no entry yet for a page opened seconds ago (Firefox writes visits at once; a page still loading has no title); X11 sessions take the screen with the box in it (no hiding there).


## The screen taken before you ask; plainer chips (2026-10-16, later)

The desktop box's UX is as simple as possible: the screenshot is taken before the chip appears, so it is faster, and discarded if not wanted.

- **The picture is taken as the box opens**, of **the window you were on** (`context::window_shot`): the KWin script now also returns the window's `internalId`, and KWin's ScreenShot2 `CaptureWindow` (native resolution, no decoration, cursor or shadow) draws that window on its own — the box, on screen or not, is never in it, so nothing waits for anything. Raw pixels come back over a pipe (QImage format 4–6 BGRA or 16–18 RGBA), are written as a PNG (fast compression) in the box's runtime folder: ~95 ms in a hidden KWin, before the chip shows. The **Screen** chip then has its thumbnail, starts **off**, and a click (or Super+S) only turns it on. Not chosen: deleted with the runtime folder when the box closes.
- **Permission**: KWin gives window pictures only to a program whose desktop file names it in `Exec=` and lists `X-KDE-DBUS-Restricted-Interfaces=org.kde.KWin.ScreenShot2`. The menu's "Atlas Capture" entry starts the wrapper script, so `install.sh` now also installs a hidden `atlas-capture-box.desktop` with `Exec=~/.cargo/bin/atlas-capture` (packaging/atlas-capture-box.desktop). Checked in a hidden KWin with the permission check on: with that file, the picture (100 ms); without it, "The process is not authorized to take a screenshot" (11 ms) — then the chip takes the screen on a click as before (the box hidden for 160 ms, Spectacle).
- **Plainer chips**: no keys drawn in them — a few words and a thumbnail; each chip's hover note says its key. Last screenshot is offered only when taken in the last 10 minutes (was 30): one taken just before, to go with the capture.
- `atlas-capture --context` also takes the window's picture and says how long it took; `ATLAS_CAPTURE_KEEP=1` keeps the pictures to look at.


## What is playing (2026-10-17)

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


## What the catalog will make of it (2026-10-17)

The status line under the text says, as it is typed, what the catalog will file — "a line in today's log · catalogued
as a film" (an album, a paper, a web page…): the vault's catalog plugins' own `recognize` patterns, matched in the box
at once (`atlas_core::catalog_hint`, read again every 30 s; nothing asked of any service). Plain words get no mention.
The phone's box takes "what it becomes" from the same Rust code through JNI (`crates/atlas-android/src/phone.rs`): it
still calls `complete::what_it_becomes` alone — to switch to the catalog-aware line there (the Android lane).
