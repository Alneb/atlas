# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/) once 1.0 is out.

## [Unreleased]

## [0.2.10] - 2026-11-10

### Added
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

### Fixed
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
