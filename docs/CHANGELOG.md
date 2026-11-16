# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/) once 1.0 is out.

## [Unreleased]

### Added
- The Plan plugin (beta) nudges you about open tasks when they fit your day: a task dated within a week or overdue,
  or marked ⏫/🔺, gets a notification at the first free gap in your calendar that holds it, outside quiet hours,
  once per morning, afternoon or evening, with **Done** (ticks it), **Snooze to 16:30** (the next free slot) and
  **Open**. Ordinary tasks share a daily budget that is measured from what you acted on (important ones are exempt),
  a morning digest says what is overdue and due today, and a task ticked anywhere is never nudged again. What it did
  and what you answered is kept as notes, one per device and month (`plan/ledger/`); Settings → Plan shows why each
  task is or is not nudged. Ticking a task now writes its `✅ date` before its block id, which stays last.
- Web tabs block ads and trackers with the browsing windows' lists (Atlas's own page spared), and their page script's
  messages carry a secret token, from an isolated world (a WebKit script world on Linux and macOS, the app's WebView2
  extension's content script on Windows) and only to Atlas's own page, so a framed site cannot pose as it. "Web tabs:
  forget sign-ins and site data" (also in Settings → Web) clears every website's cookies, storage and caches, keeping
  Atlas's own, after a confirmation.
- AI agents reach more of Atlas through MCP: the window's commands (`atlas_ui_commands`, `atlas_ui_command`, shown as
  a toast "An agent ran …"), reads of backlinks, tags, properties, bases, views, captures, activity, sync state and the
  settings, setting one property (`atlas_set_property`, the same writer as the Properties panel), triaging captures
  (`atlas_triage`), moving or renaming with the links rewritten (`atlas_move`, never over an existing file), and the
  notices that came while nobody looked (`atlas_notices`, `atlas_notice_withdraw`; `GET /api/notices`). Plugins'
  notice/plan/log hooks are no longer offered to agents.
- A note whose first `# heading` says its file name is renamed when that heading is edited (once the caret leaves the
  line), its tab following; off with "The title heading renames the file" (`[editor] heading_renames`, Settings →
  Appearance).
- A note's date at the right of its breadcrumbs: the day it was made (its `created:` / `date:` property, else its first
  commit, else the file's creation — the rule the Activity card uses), the full time and its last change on hover.
  From `GET /api/file/made`.
- Today's Activity card lists notes only; a file button in its header (or "+ N files hidden — show" under the list) brings
  files back, remembered as `[activity] show_files` (Settings → Home & Today). Made notes gather by folder like
  changed ones, and many rows in sibling folders (a run per folder) gather under their parent; the tabs stay on one row.
- A Sync conflicts view lists every Syncthing conflict copy left to settle — the note, the device (its short
  Syncthing ID) and the date — with the note banner's ways out (Compare…, Show beside, Keep this one, Take the
  other). It opens from the command "Sync conflicts" and from a line in Settings → Files & search that shows only
  while copies are left; on the phone too. `GET /api/sync/conflicts` is the one listing behind it and the banner.
- Settings → Vaults & sync: each vault on the device with its sync state in one plain line — what carries its files
  (Syncthing or the mirror), whether its server answers or wants a sign-in, the last catch-up, writes refused as
  behind or held by another device, captures waiting and conflict copies left. The phone's vault list and a vault's
  details show the same words, from the same `GET /api/sync/state`. A server that stops answering, a sign-in it
  wants and a refused write are also notices, each told once until it clears.
- Deadlines: what must be done by a day — tasks with 📅, notes with `due:` (never mail, never done ones) and the
  events of calendars marked as deadline calendars (Calendar 1.7.0) — in one list grouped Overdue · Today · This week
  · Later. It is a box on Home (new homes have it; Settings → Home & Today → "Add the deadlines box" adds it to an
  existing one), a Deadlines page of its own (a tile beside Home and the "Deadlines" command; the list and a month
  calendar), and what the Today chips count. A task is ticked from the box; a view block says `from: deadlines`.
- Notifications get buttons: an event's reminder rings with **Open** and **Snooze 10 min** on the desktop (D-Bus on
  Linux, toasts on Windows) and the phone. Plugins can put their own buttons on a notice (`actions`), answered by
  their `on = "notice"` tool, and take a notice away again (`withdraw`), its system notification closed. The in-app pop-ups show the same buttons;
  a notice taken away also leaves the pop-ups and the tray's list of unseen notices. Ticking a task done takes away
  the notices about it (a notice names its task as `subject`), and a reminder whose event was deleted goes while it
  still shows.
- A DOI link (`[Hedin 1965](https://doi.org/10.…)`) whose paper is in the library reads and opens as that paper's
  `[[citekey]]` note, in the editor and the reading view, its words unchanged (hover preview, right-click menu;
  Shift+click still opens the page). One not in the library offers Catalog's "Add to the catalog" dialog on a click
  or from "Add to library…" in its menu; a note's unfiled `sources` use the same dialog.
- Phone: on Android 12+ the app takes the wallpaper's colours (Material You), the page too when the vault keeps
  Atlas's own palette; a resizable home-screen widget shows today's log, the open tasks and a Capture button, in the
  vault's palette.
- Calendar 1.6.0: event reminders. An event's own alerts (before or after its start or end, or at a set moment; a
  repeating event's next occurrences) ring as desktop notifications with the title, the time and the place; a click
  opens the note the event came from. A calendar's default alert from the server rings for events without one, and
  Settings → Calendar → Reminders can add one of its own (off by default) or switch reminders off. Each rings once,
  not again after a restart, and follows an event moved or deleted just before. Plugins can plan such notices too
  (`on = "plan"` tools).

### Changed
- The phone's capture box opens ready to type: the keyboard comes with the window, and the core (the hint, the
  completions, a share's text) answers on a thread of its own instead of before the first frame. The screen's
  picture is written after the box opens; the accessibility button, gesture and volume keys no longer wait for a
  shade that is not there. Each step's time is in logcat under the tag `AtlasCapture`.
- Links shared from phone apps come out clean: the text is read from every place apps put it (the text, its ClipData,
  several texts, an HTML text's links, the subject), the subject becomes a title (`Watch "…" on YouTube` → the
  quoted title; an app's own name is dropped), and more tracking parameters go (Reddit's `share_*`, Spotify's `dlsi`,
  Google Maps' `g_st`, Facebook's `mibextid`, TikTok's, and X's `s` and `t` on X only). Catalog 0.9.2 compares
  addresses with the same rule, so a link read in a screenshot by OCR is the same item as the clean one.
- Tasks: a task whose line ends in an Obsidian block id (`^abc`) is found by it, so ticking it on Home, in a task
  block or by an agent works after lines above it moved; the id no longer shows in the task's title. The task
  dialog's line is written by the core, in Obsidian Tasks' order. A recurring task's next occurrence does not copy
  the id.
- Linux desktop: web tabs are always frames inside their pane. The older native view laid over the pane (which blinked
  under menus and drew wrongly) and its `[web] tab_view` setting are removed.
- Export's Typst PDF has a look of its own instead of pandoc's bare template: a coloured title block and headings,
  running heads, tinted code and quotes, ruled tables, Libertinus Math beside Libertinus text.
- A hovered link to a heading or a block previews that section, not the top of the note; a link to an equation
  (`[[Note#^eq-gap]]`, `[[#^eq-gap]]`) shows the equation with its number.
- Numbered equations: each row of an `align`, `gather` or `eqnarray` gets its own number, as in LaTeX; a row's
  `\label` names that row, `\notag` skips it.
- A note's top strip reads as rows: a hairline under the path, then the format bar and the Properties heading over
  one continuous line (the two share their height, even when a narrow bar wraps). The heading lost its inline rule,
  and a button at the end of the path shows or hides the Properties panel, lit while it is open.

### Fixed
- Spelling 0.4.0: check several languages — Settings → Spelling lists every installed one with a switch, the main one
  and each one's dictionary picked from what is installed (no more typed `en=en_GB` or language codes; older settings
  keep working). The lower bar's cell names the note it describes, follows the active tab and the focused editor at
  once, and is gone for anything that is not a Markdown note or the mail being written (code files, PDFs, terminals).
- Spelling 0.3.3: Settings → Spelling lists your words (and what the vault taught) once they are read, instead of
  "None yet" when the page opened before they were.
- Export 1.5.0: a note whose math uses ⟨ ⟩, ħ, ∩ or a circled operator compiles through Typst again (pandoc writes
  their old names, which Typst 0.15 removed; they are renamed in math). In two columns a display wider than its
  column is shrunk to fit instead of running over the other column, on both PDF roads.
- Calendar 1.5.3: the week and day views lay overlapping events out as Google Calendar does. Events that start
  together share the width only where they really overlap, and each widens across free columns; one starting later
  is drawn over a running one, indented, so a long event keeps its width. A narrow block shows its title on two lines
  instead of cutting both title and time; the whole event is in its tooltip.
- Dim terminal text (SGR 2) is readable in the light theme: xterm asked it only half the minimum contrast; it now
  gets the theme's full bar in both renderers (a checked build-time rewrite, `ui/scripts/dep-rewrites.ts`).
- Email 1.7.2: Outlook's mail server refusing an access token ("AUTHENTICATE failed.") no longer asks for a new
  sign-in: the token is renewed and tried again, as Thunderbird does; a fresh token refused while Microsoft still
  renews the sign-in is reported as the server's trouble and retried by itself.
- Email 1.7.1: Shift+click on a link in a message opens the system's browser in the desktop app too. Its WebKit ran
  no listener inside the message's frame (links, Ctrl+F, the frame's height following a picture or an unfolded
  quote); the frame now allows scripts, while its Content-Security-Policy (`script-src 'none'`) still refuses every
  script of the mail.

## [0.2.11] - 2026-11-12

### Added
- Export 1.4.0: a link to a numbered equation is a real link in the PDF — `\label` and `\eqref` on the LaTeX road, a
  `<eq-n>` label and a link to it on the Typst road; Word keeps the plain "(n)".
- A DOI link the library has not got yet is marked in the live editor too (dashed), as in the reading view.
- One look per device: the theme, colour schemes, contrast, shapes, accent and text size are kept by the device and
  drawn the same in every vault it opens (two vaults no longer look different on one phone); seeded once from the
  first vault shown. Settings → Appearance → This device → "Its own look" off brings back each vault's own.
- `[editor] vim_clipboard` (on by default): with vim keys, a yank (`y`, a visual yank) also copies to the system
  clipboard; deletes stay in vim's registers.

### Fixed
- Links in the editor take their colour again when a note is made, moved or deleted: a link no longer stays
  "missing" (or found) until its line is edited.
- copyparty 0.4.1: a PDF on a server with a password is filed (downloaded with the password, then read as a dropped
  PDF); the catalog could not fetch it.
- A terminal could stop selecting (no drag highlight, no double-click on a word) after a divider drag whose release
  was missed; any later press now ends that drag.
- An equation's number no longer covers the last terms of a display wider than the page: it follows the formula.
- Papers 0.7.1: a PDF already in the library is recognised by its content only; another work under the same file
  name (two `main.pdf`) gets its own entry instead of the first one's note.
- Papers 0.7.1: a PDF with no identifier and no readable first page is named from its Info dictionary (title,
  author, year made) before its file name; several people in one author string (an index's "A B, C D, E F") are
  split into one author each.
- Catalog 0.9.1: the page reader no longer fetches a link to a file (a PDF over 8 MB failed with "file too large").

## [0.2.10] - 2026-11-12

### Added
- Numbered figures: an embed line ending in a block id (`![[gap.png|Caption]] ^fig-gap`) is "Figure n", captioned
  under the picture; links read "Figure 2" / "Note, Figure 2"; `![[Note#^fig-gap]]` embeds it with its caption.
- A note's sources: a DOI, arXiv id or PDF link the library lacks shows red in the properties panel; a click files
  it through the catalog and opens its note.
- copyparty 0.4.0: a link to a server's file opens the file in Atlas; agents' tools to list or find files on a server
  and file one through the catalog.
- Papers 0.6.0: a PDF without identifiers is named from its first page (title, authors, year → `author2026word`).
- Papers 0.7.0: books (type book: an ISBN, a book's DOI, a long PDF) are kept in `refs/books/<key>/` beside the papers,
  in refs.bib with them; `shelve` moves the books filed before.
- Catalog 0.9.0: `instead` — with Catalog · Science installed every book is a reference book; without it, books are
  books (no guess from subjects).
- Numbered equations: `\label{…}` inside `$$…$$` (or `$$ … $$ ^id`) numbers a display, as do `equation`/`align`
  environments; links `[[#^id]]` / `[[Note#^id]]` read "(3)" / "Note (3)" and follow; `![[Note#^id]]` embeds one
  formula; completion lists labels. Export numbers them over the whole document (an embedded note continues).
- A DOI link opens its paper's note, or offers to add the paper to the library (note and PDF).
- Appearance per device: "This device" keeps its own look; "Follow the system's theme".
- `atlas.openLink` (plugin API 28): every web link opens the same way; Shift+click opens the browser, in mail too.
- Email 1.7.0: a POP account's mail that only Thunderbird keeps is put back on its server; sign-in trouble is told
  apart from a connection that failed (offline accounts retry, refused credentials wait).
- Export 1.3.0: the LaTeX layout (plain, article, chapters) in the dialog.
- System notifications have a lifetime (`[notifications] system_seconds`).

### Changed
- Catalog · Open sources is split again into Catalog · Books, Music, Manga and anime, YouTube and Wikipedia (0.3.0).

### Fixed
- Catalog: a link straight to a PDF that no source knows is filed (its plugin names it) instead of refused.
- Catalog · Books: a book's co-authors that Open Library keeps only on the edition (Ashcroft and Mermin).
- A block id at the end of a paragraph no longer shows in the reading view.
- A file sent from the phone without a note lands beside the day's log, not at the vault's top.
- The phone's bars no longer turn black from a transparent colour.
- A resolver's redirect (doi.org to a publisher) is no longer taken for a sign-in page.
- Links to a place in the same note (`[[#…]]`) no longer show as missing; the Properties panel's heading has its line.

## [0.2.9] - 2026-11-09

### Added
- Phone: the capture box floats over the app below, which keeps running (opened from the accessibility button,
  gesture, volume keys or tile); switch "Over the app, which keeps running" in Settings → Capture.
- Phone: more ways into the capture box — a Capture icon of its own (home screen, Quick Tap) and an always-there quiet
  notification, both switches in Settings → Capture; launcher shortcuts New note and Today.
- Phone: the capture box's tools in one row of icons (to-do, date, link, tag, photo, draw); a camera photo joins the
  pictures.
- Touch: a held picture opens alone to zoom; KDE tablet mode takes the touch layout (menus, fields, switches and
  scrollbars sized for a finger, key hints hidden); a Wacom pen reaches drawings as a pen, with pressure and tilt.
- zstd: a plugin that opens `*.zst` files as the file they hold; its cache prunes itself.
- Releases attach the bare `atlas-app` binary.

### Fixed
- Phone: long note titles wrap; escapes read as Obsidian draws them; properties open as a full sheet; the bars take the
  vault's palette; Settings has no desktop-only sections; the + steps aside while the keyboard is up.
- Calendar: all-day bars sit on their own days in week view, not all on Monday.
- Programs started from the AppImage get the system's libraries, not the bundle's (ssh's libcrypto).
- Segmented tabs wrap instead of overlapping in a narrow card.

## [0.2.8] - 2026-11-09

### Added
- Guest folders: **Vault: open a folder as a guest…** opens a folder that is not a vault in a window of its own, with
  this vault's plugins, kept out of the vault's search, links and vault list, and read-only until its **Edit** switch
  is on; it is forgotten at the next start.
- **Notes: triage**, a Base of the notes that wait for a decision: unsorted, untagged, orphaned, stale.
- Captures: **Catalogue** files a capture as its note; a captured PDF link becomes a reference (DOI, arXiv or ISBN
  read from its first pages; books by ISBN). Papers 0.5.
- Email: `email_open` lets an agent show one mail in the Email pane; a reply shows the mail it answers under the box.
- MCP: `atlas_tasks` and `atlas_task_done`.
- The editor colours brackets by depth; Phosphor icons at full contrast.
- Search ranks the files whose text matches: a name or heading that says the word first, then notes, then the files
  with more matches, then the newest; each shows its first lines and its number of matches, a page of 50 at a time
  with "Show more" (before: the first 200 lines found, in no useful order, and 50 names).
- Enter after a `$$` alone on its line brings the closing `$$`, so an unclosed formula no longer turns the text
  below it into math.
- Settings → Spelling shows the installed languages and their dictionaries, the main language, and the words you
  added (add and remove them there). Spelling 0.3.0.
- The desktop starts its other vaults in the background shortly after launch: a first switch is a page load.
- Settings shows the commit Atlas was built from and the real plugin API (it showed the HTTP API's level).

### Fixed
- The Predictor and Spelling no longer lose their counts on a busy machine: a JavaScript helper's time limit counts
  its own CPU time, not the clock, so a helper waiting for the CPU is no longer stopped as a runaway loop.
- Spelling's suggestions on right-click in the mail composer (it had no right-click menu).
- A sent reply's draft leaves the conversation.
- A plugin's tool calls never block the core's other requests.
- A server that leaves out its intermediate certificate is reached.
- Phone captures get their OCR on the desktop.
- The desktop core keeps its port across restarts, so the page keeps its storage.
- PDF sources fetch quietly, with one short notice when none has the PDF.
- Calendar: an ntfy token counts when a user is named without a password.
- A title taken from a percent-encoded file name reads as text.
- The mirror sends no file bytes while Syncthing carries the vault.
- A release's plugin archives and draft are made even when a platform's plugin engine job was cancelled.

### Changed
- Delete goes to the system Trash on macOS and Windows too (it went to the vault's `.atlas/trash/`), and a pasted
  picture is read from the clipboard there as on Linux.
- No Python in the app: the core no longer writes a Python plugin library into each vault, and the server image
  drops `python3`. Every plugin helper is JavaScript in the core or compiled.

## [0.2.7] - 2026-11-05

### Added
- Spelling and the Predictor work in the mail composer: its text is a small Atlas editor (`atlas.editor.prose`,
  plugin API 25) that carries the plugins' editor hooks.
- The Predictor finishes words from the language's Hunspell dictionary as well as the vault (the vault's most used
  first, then the shortest), and keeps its counts current as notes are saved.
- Spelling's bottom-bar cell opens a panel: the note's language to switch, and every marked word with its line and
  suggestions; choosing one selects it.
- The capture box (`atlas-capture`) ships in the `.deb`, `.rpm`, Windows installer and macOS app, with its menu
  entries on Linux and a Start-menu shortcut on Ctrl+Alt+Shift+C on Windows; the `atlas` CLI is now in the Windows
  and macOS packages too. The AppImage and the Flatpak carry it as well (`atlas-app --capture` starts it), and on
  macOS Atlas takes Ctrl+Cmd+C as its global key while it runs.
- Search: a PDF switch in the Search pane narrows a search to the PDFs' text (which the normal search still lists after the notes').
- Search is faster: files read on several threads, notes first, pictures, binaries and number tables left out; names
  and titles show at once, before the lines.
- Keys on macOS and Windows: Atlas's Super shortcuts are Ctrl+Cmd on a Mac (Cmd stays copy and paste) and Ctrl+Alt on
  Windows (which keeps its Win keys); AltGr never runs a shortcut.
- Plugins: an installed plugin starts switched on (`atlas plugin install --off` keeps it off), and a new vault starts
  with every built-in plugin on, the Library included.
- Snippets: the vault's own file is the one set (a vault with none gets the LaTeX set as `.atlas/snippets/latex.js`);
  automatic spacing, matrices by size, units and the other ready sets are options declared in that file; Settings lists
  every snippet, drawn, with a switch on each snippet and each option.
- Snippets: in math a trigger typed from its first letter fires at once (`ket`, `frac`, `ee`, `cdot`), Undo after an
  expansion leaves the trigger as typed, a Space right after one adds nothing, and `^`/`_` take away the spaces before
  them. Short starts and typo spellings no longer crowd the list.
- Math: a display block whose first line is `align` (`$$align`, then plain lines) is drawn as an align with each line
  at its first relation; the Snippets option Auto-align types it with `malign`. The exports write it as `aligned`.
- Math source: `\left` and `\right` are drawn small and faint, their brackets bold in a colour per depth.
- Ctrl over a ```tikz drawing shows it large, as over a picture.
- Predictor, a plugin: the likely rest of a word, and the next word when the vault is sure, faint after the caret in
  a note's prose (never in math or code), learned from the vault per language; Tab or → at the end of a line takes it,
  Ctrl+→ one word.
- Spelling, a plugin: a wavy line under a misspelled word of a note's prose, from the machine's Hunspell dictionaries
  and the vault's own words (a word the vault uses often counts as right); right-click for suggestions or to add the
  word to the vault's list. Each note's language is its `lang:` property or guessed from its words.
- Vim: in a formula or a `.tex` file a command is one word (`dw` on `\alpha` takes the backslash with it); the
  block cursor blinks between filled and hollow, and stays hollow when the editor is not focused.
- The render audit keeps its temporary files in `target/` and keeps a finding only when a second look shows it.

### Fixed
- Snippets: with LaTeX switched off, the plugin no longer writes its own set, which used to end an old snippets
  file for good.
- Vim's block cursor is solid again, hollow with a clean edge when the editor is not focused.
- Export: formulas using Atlas's own macros (`\ket`, `\bra`, `\braket`, `\Tr`, `\mbox`) are defined in each
  exported document (`\providecommand` in LaTeX, kept as written), so LaTeX no longer stops and Typst and Word draw
  them; a heading right after a line of text is a heading; `$$\begin{align}…$$`
  is written as `aligned`, which LaTeX takes inside display math.
- An `align` with equation numbers no longer shows a horizontal scrollbar (the numbers took the hashtag style).
- A sideways swipe over anything that scrolls sideways is its scrolling, even at its end, never back or forward.
- Markdown: an unclosed `$$` stays text instead of turning the rest of the note into one formula.

## [0.2.6] - 2026-11-04

### Added
- Email: a conversation's single message (a draft too) can be deleted on its own, to Trash with Undo.
- Email: an Outlook mailbox whose organisation turns SMTP sign-in off sends through Exchange instead.
- Settings: the corner the notices appear in; the overview says which Atlas, plugin API and interface build run.
- Snippets: a LaTeX pack shipped with the plugin, on by itself in a vault with no snippets of its own; a vault's own
  trigger wins over a pack's.
- The `.deb` and `.rpm` install the `atlas` command line beside the app.
- Android capture: a tap on the vault cycles to the next one, as on the desktop; a long press lists them.
- Web tabs show the address of the link under the pointer in a corner, as a browser's status bar.

### Fixed
- Finance: a bank that refuses how far back a sync asks (Enable Banking's "Wrong transactions period") is asked again
  for a shorter period.
- Finance: the banks' sites list ships neutral examples; a vault's own `finance/banks.toml` lists its banks.
- PDF: dragging the scrollbar also panned the pages against it, so the view could spring back where the drag began.
- Android: saving into a vault on the phone's storage failed with "permission denied" (Android refuses hard links
  there); the capture box also says plainly when the app may not write a folder.
- Email: a reply selects the account and address the mail was written to; a reopened draft keeps its address.
- Export: every LaTeX PDF failed ("Missing \begin{document}"): pandoc read the preamble as inline text.
- OCR: the text under a picture reads as paragraphs, words cut at a line's end joined again.
- Today on a phone: the log card's header keeps one line.
- macOS: Cmd+C / V / X in the editor are never taken by a plugin's Super key.

## [0.2.5] - 2026-11-03

### Added
- Captures: a Delete answer (button and the Delete key), the capture kept in the vault's trash; a capture's pictures
  shown under it, large with Ctrl as in a note.
- Web tabs show any site inside the pane on Linux (a libsoup hook in WebKit's network process) and Windows (a WebView2
  extension), signed in; Shift+click opens the system's browser.

### Fixed
- Today: the day's card no longer redraws on every save of the log, nor asks the calendar again each time.
- The gate's style check knows the high-contrast layer as a token file.

## [0.2.1] - 2026-11-02

### Added
- Calendar: Outlook / Microsoft 365 calendars over Exchange, signed in through the Email plugin's Outlook account of
  the same address (no password); events read, created, edited, moved and deleted like CalDAV ones.
- Meetings: a Guests field in the event editor (invitations, updates and cancellations sent by Exchange, or by a CalDAV
  server that schedules); Email's Meeting button opens a new event with the conversation's subject and people;
  Accept / Maybe / Decline on an Outlook invitation answered by Exchange itself.
- Email: reply and forward open in a popup with a toolbar.
- Plugins call each other by role (`@mail`, `@calendar`) instead of by id.
- Snippets: a plugin of JavaScript modules; Tab walks a formula's brackets.
- Appearance: colour palettes by day and night, a paper shape, serif note fonts; app-wide menus, Ctrl+click
  definitions, dialogs for import, add, sign-in and new event, recent commands.
- Web tab: back and forward through its history, mouse side buttons. RAR archives on the phone.
- Android: system notices, 48 dp touch targets.

### Fixed
- Races and missing locks in the core (notes, settings, secrets, marks, the mirror, the watcher, captures).
- One reader for headings, tags, task fields, fences and links in the UI and the core; Bases filters and formulas.
- Mail: notes' names, rules keep comments and order, send-later once, IMAP quoting and reconnects, links for agents.
- Calendar: recurrence tails, the cache kept when settings cannot be read, invitation alarms.
- Find in pages and mail, pasted pictures, actions after an import cycle, local days and DST gaps.

## [0.2.0] - 2026-10-30

### Added
- TikZ in the page: TikZ fences drawn by TeX in WebAssembly, Feynman diagrams (tikz-feynman) included; Export turns
  them into `tikzpicture`.
- Tables edited in place: the caret where clicked, arrow keys, a cell menu (insert, move, align, sort, delete).
- System notifications on Linux over D-Bus; a click brings Atlas forward and opens the note.
- `atlas.exec`: a JavaScript plugin helper runs the programs its manifest names, and stops them when asked (Export and
  Print have a Stop). Typst export dialog; plugin dialogs and reader panes.
- `[automation] schedules_on`: a vault's scheduled jobs run only on the named computers.
- Capture box: copied pictures and local files, a copied link alone on the line, the primary selection as a quote;
  on Android, Capture on selected text. On the phone, a tap on "+" makes something new and a long press captures.
- Letterboxd export of watched films, ratings, diary, reviews and likes.
- The Flatpak runs what a vault runs (plugin helpers, terminals, language servers, git, poppler) on the host;
  `packaging/flatpak/build-local.sh` builds and installs it on a desktop.

### Changed
- Settings regrouped; plugin tiers by daily use. The GNOME 50 runtime for the Flatpak.
- Live rooms that fell back to the local core rejoin the server's once it answers.
- Caches carry their own `.gitignore`, so they stay out of git and the Git pane.
- Long lists windowed (file tree, a base's table); loading a big PDF is linear again (lopdf 0.46).

### Fixed
- A sync conflict copy older than its base is never merged over the file.
- The main window fits screens smaller than its default size; a browser sign-in shows without reopening Settings.
- Tabs that shook on close, PDF white pages and scroll, LaTeX in table cells, mail attachments for agents.
- Tests that failed on Windows (path separators, `\\?\` paths).

## [0.1.0] - 2026-10-26

### Added
- First public release: the desktop app (Linux, with first macOS and Windows builds), the `atlas` CLI, the server
  mode with its Docker image and `compose.yaml`, the Android capture app, and the plugins in `plugins/stable/` and
  `plugins/beta/`.
- Packages for Linux: AppImage, `.deb`, `.rpm` and Flatpak, built by the Packages workflow.
- Packages for macOS (an ad-hoc-signed `.dmg`) and Windows (an NSIS installer), from the same workflow; neither is
  notarized or code-signed yet, so the first launch asks for confirmation.
- The Android APKs (Atlas, Atlas for Boox, Atlas capture) with the release, signed with the project's key so later
  ones install as updates.
- LaTeX is a built-in plugin with its own `[latex]` settings (the old `[editor]` keys move there on load); switched
  off, its editor features and routes go away.
- `AGENTS.md`: rules for AI coding agents working in the repository, and a `tidy` stage in the gate.
- [Plugin maturity](guides/PLUGIN-MATURITY.md): what beta and stable promise, and the criteria for stable.

[Unreleased]: https://github.com/Alneb/atlas/compare/v0.2.7...HEAD
[0.2.7]: https://github.com/Alneb/atlas/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/Alneb/atlas/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/Alneb/atlas/compare/v0.2.1...v0.2.5
[0.2.1]: https://github.com/Alneb/atlas/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Alneb/atlas/compare/v0.1.1...v0.2.0
[0.1.0]: https://github.com/Alneb/atlas/releases/tag/v0.1.0
