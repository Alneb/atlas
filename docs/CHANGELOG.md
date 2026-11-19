# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/) once 1.0 is out.

## [Unreleased]

### Added
- **A vault in a window of its own:** the vault switcher's **New window** opens another vault beside this one, this
  window staying where it is (desktop app).
- **A task's right-click offers Time-block…** (Home, Deadlines, task blocks): the calendar opens on the week to pick
  the slot. Plugins add their own rows to a task's menu (`atlas.shell.menu("task", …)`).
- **"No nudge until tomorrow"** in a task's right-click (Plan 0.12.0): Plan leaves it alone until the next morning.
- **A vault's notices on every device:** a notice raised on one device (or on the server) reaches the person's other
  devices through the vault's server within 15 seconds while Atlas shows the vault (a minute otherwise), and dismissing or withdrawing it on one takes it away on the
  others. Needs the server to run this version.
- **Settings → Notifications → "This device only":** the sources whose notices stay on the device that raised them.

### Changed
- **`atlas companions` removed:** the one-off migration to one note per thing (a PDF's or a book's earlier side
  notes and drawings' SVG exports) has run everywhere it was needed; a vault last opened with 0.4.1 or older can run it
  with that version first.
- **A vault opened on a computer for the first time is "always on"**: it starts with Atlas and keeps its schedules,
  plugin rounds and notices going with no window on it; Settings → Vaults & sync turns it off. A vault list from before
  the switch keeps the vaults opened in the last three days starting, as they did.

## [0.4.1] - 2026-11-18

### Added
- **Nudges for the to-dos you actually write** (Plan 0.11.0): an open task with no date — a daily log's `- [ ] …`
  line — may nudge once it has waited two days (Settings → Plan → "An undated task nudges after"; 0 turns it off),
  a little more insistent each day, within the day's budget. Before, only dated or ⏫ tasks could, which left most
  real to-dos out.
- **Link a mail to anything, from the mail** (Email 1.11.0): a **Link** button in the reader — to any note or a mail
  saved as a note, to an event, or copy the link. The link is kept in the conversation's own note (`links:`), so your
  notes are not written. Under the subject, **Linked** lists everything linked with the conversation both ways
  (notes, events, mails); a linked mail opens as the mail in the Email pane, not as its note.
- **Link a note or a mail from an event** (Calendar 1.13.0): the event card has **Link a note…** and **Link a
  mail…** (search your mail in the palette; the conversation is saved as a note and linked). Linked mails open in
  Email.
- **Plugin API 35:** `atlas.pickNote()` (the palette's note chooser), `atlas.backlinks(path)`, and a chooser's
  `search(q)` (choices that follow the typed text).

### Fixed
- **A paper's panel shows your notes:** the first lines of its note under the abstract, with "Open the notes".
- **An item's panel in the Library is readable in its narrow column** (Catalog 0.16.4): the picture on its own line
  above the fields instead of squeezing them (values broke inside words), the file's name and "Notes: yes" gone (the
  buttons say it), web addresses shown as links named by their site, and the linked mentions open under the item
  instead of folded at the foot of an empty column.
- **Library covers:** titles no longer drawn over the covers after coming back to the library (Catalog 0.16.1).
- **A book's panel shows all it knows** (authors, ISBN, edition, subjects… every property of its note), and its
  service is no longer listed twice (the "Open on …" button and the same link under it).
- **A paper's panel shows its note's details:** status, volume, issue, pages, publication date, publisher, ISSN,
  language, topics, project.
- **A library that needs signing in shows a Sign in button** (Audiobookshelf 0.16.1, any library's `setup`), never the
  request's error ("has no secret token").
- **The Library tile stays when References is switched off** (a vault of books and films, no papers): it opens the
  Library at its first library.
- **Kiwix has its own icon** (a globe), no longer the Library's (it looked like a second library).

## [0.4.0] - 2026-11-17

### Added
- **One tab per pane** (Settings → Appearance): opening a file replaces what the pane shows instead of adding a tab;
  splits keep one each, terminals keep their tabs, Back and Forward step through what it showed.
- **Right-click menus where things are drawn:** a mail conversation (Email 1.8.9: Reply, Reply all, Forward, Archive,
  Mark read, Star, Snooze…, Move to…, Label…, Save as note, Spam, Delete — on the conversation clicked, not the one open,
  with their keys; then its note's rows once saved), a task row (Mark done, then its note at the task's line), a search
  hit (Copy the line, leave its file out of the replace, then its file at the line), a PDF page (with words
  selected: Highlight, Underline, Strike through, Copy, Copy link to the passage; on a mark: its link, Delete; always:
  the link to the page clicked and its bookmark).
- **Right-click menus that fit (Calendar 1.12.0):** a right-click on a pane's open space offers that pane's own commands, its plugin's settings, its file, full screen and close; on a calendar event, Show, Edit…, Duplicate and Delete (and, for an event from a note, the note's rows).
- **`.zst` files without the `zstd` program (Zstandard 0.3.0, plugin API 34):** the core decompresses them itself (`atlas.convert.unzstd` for helpers), so they open on the phone too.
- **Syncthing and Catalog · Science on the phone (Syncthing 0.3.0, Catalog · Science 0.8.0):** their helpers are built into the Android apps; Syncthing there asks for its API key in its settings.
- **Suwayomi's downloads followed (Manga 0.18.0):** while the server downloads a series' chapters, the series shows
  how many are left, the one under way and how far it is, and any that failed.
- **Habits (Plan 0.10.0):** a note with `habit: gym` (or `running`, `sleep`, anything) is nagged in its window —
  every 30 minutes by default — until you press **Done** or **Skip today**. `habit gym mon wed fri 18:00` in any
  capture makes the note. Presets fill the days and the window; the ledger keeps what happened.
- **Drag a task onto the calendar's hours (Calendar 1.11.0):** a task of the Tasks & deadlines layer dragged from the
  all-day lane onto the hours is time-blocked there, an hour from where it lands.
- **Link an event while writing (Calendar 1.10.0):** `[[` and two letters offer your calendar's events of the weeks
  around today among the notes; picking one makes the event's note (once) and writes the link to it.
- **Block a task from its nudge (Plan 0.9.0):** with the Calendar plugin, a nudge has **Block 16:30** beside Snooze:
  that slot becomes an event for the task, with its note linking it and ⏳ on the task's line. The event reminds you
  then; the nudges wait until the block is over and come back if the task is still open.
- **The audiobook in the Books reader (Books 0.18.0, Audiobookshelf 0.15.0):** when a book's note names its
  audiobook (`audiobookshelf: <item id>` or an `audiobook:` link to the item) and the Audiobookshelf plugin is set up,
  the reader's bar on the desktop and on the phone has a ▶ that plays it through the app's one player. While it plays,
  a row in the reader shows play / pause, the time and the chapter, with **Go to where the audio is** and **Bring the
  audio here**, which bring the text and the audio to each other's chapter by its title.
- **A switch to a recently used vault finds its notes indexed:** a vault the desktop starts ahead has its note index
  built in the background at the lowest priority (the first graph of a 3,000-note vault: 1 s → 47 ms), and the
  window's own vault keeps its index however long it stays unused.
- **The PDF reader goes on to the next column:** zoomed to a column (a double-click on the page's white), Space,
  Page Down or ↓ at the column's end show the next column from its top — the one beside it, else the next page's
  first — instead of scrolling further down the page. The core's column finder gives it (`POST /api/pdf-column` with
  `after`); on the phone (Books 0.20.0) a turn at a zoomed column's end does the same, from the same finder.
- **Quiet hours measured, and nudges left to the phone's alarms (Plan 0.8.0):** each device writes, once a day, the
  hours it was in use as one line of its Plan ledger; from 14 days of them Settings → Plan → Why now? proposes the
  quiet hours (the longest run of hours unused, and with nothing ticked, on 80 % of the days), and the new **Quiet
  hours measured** toggle (off by default) makes the planner use them. The phone app now says which nudges it set
  exact alarms for (with the vault's presence, through the mirror server): when no computer is in use and the app is
  closed, a nudge the phone armed exactly rings there, and the planning computer and the server's ntfy fallback leave
  it alone; a new nudge, or one the phone could only set an inexact alarm for, stays with the planner.
- **A server vault's key past its gate, from the vault switcher:** a server vault's row (or a folder mirrored on a
  server) has **Key…**: a header key that the sign-in in front of it lets through (an Authelia bypass), the server's
  host filled in. It is the same key Settings → Sign-ins lists (one form for both), kept on this machine — also when
  the switcher is opened on a server vault's page — and sent by the bridge, the mirror and the plugins to that host
  over https only. The button reads **Key ✓** once a kept key names the host.
- **Manga: a series' note once it is yours (Manga 0.16.0, Catalog 0.12.1):** a series gets its one note when you turn a page past a
  chapter's first, finish or mark a chapter, or press **Its note** (new on the series page, desktop and phone) — not
  when you open it. A Suwayomi series' note is the catalog's Manga note, found again after a server reinstall by its
  source and address, and says which chapter you are at; a vault series' note stays its folder's.
- **Your libraries, and the servers' apart (plugin API 33, Catalog 0.12.0, Manga 0.15.0, Jellyfin 0.3.0):** a library
  is a folder or a Base of the vault with a kind — books, comics, audio, films, papers, pictures, drawings — in
  `[ui] libraries`; a folder's menu in the file explorer has **Show as a library** (its kind guessed from its files),
  and the new **Settings → Libraries** adds, orders, hides and sets each one's kind, order and layout. The core lists
  its things with what their notes say (author, cover, how far, when last read) and what you were in the middle of
  first. On the Libraries page a server's things are never mixed with yours: Suwayomi's series, a server folder's
  books, Jellyfin's films come under a **From <service>** band with a button into that service's app, and a library
  that is a server's alone is a tab after yours, under "On your servers". Covers are larger. The old list of library
  ids reads as it is.
- **The phone's Library is native:** your libraries as chips, then Continue, then the covers (or a list), with search
  and the order at the top, read from the vault's core so it shows while the page loads; Manga's and Audiobookshelf's
  apps are chips apart, under "Servers"; More… opens the page's other libraries. In Files, a folder's ⋮ has **Show as a
  library**.
- **Jellyfin's film notes are the catalog's (Jellyfin 0.3.0):** a film's or a series' note is found by its TMDB/IMDb
  ids through the catalog's one rule; a film you go on watching opens with its note, one only just started has none
  until *Its note* makes it. The "Folder for film notes" setting is gone (the catalog's Films folder holds them).
- **Audiobookshelf as a native app on the phone (Audiobookshelf 0.13.0):** the home (Continue listening, the
  server's shelves, search), the library (books as covers, series, authors, collections, playlists), a book's screen
  (details, chapters, bookmarks, Play / Go on) and the player (chapter, ±skip, speed, sleep, chapters) are Android
  screens over the app's one player, the requests through the core with the token never in Java, where you are synced
  as from the page. The shell's `TopBar`, `Tile`, `Json` and `PlaceList` are now shared by every native plugin.
- **One note per thing (Catalog 0.12.0):** a book on Audiobookshelf, a series on Suwayomi, a film on Jellyfin, an EPUB
  or a manga folder in the vault has one note, and gets it only once it is yours — read or listened past its start, a
  chapter finished, rated, reviewed, written on, or asked for; opening or listing never makes one. The rule is the
  catalog's tool `note`, asked by every plugin on the desktop and by the phone's native screens alike: it finds the
  thing's note by the vault file's own note, by its IDs anywhere in the vault, or by its name, and adds only the IDs
  and file link it lacks — so an EPUB joins the note its audiobook already has. A note that claims a file by its `file`
  property is now that file's note for every reader (the core's companion lookup).
- **Zoom to a PDF's column (Books 0.17.0):** on the phone a double tap, on the desktop a double-click on the page's
  white (between lines, a margin), zooms so the text column there fills the width — one column of a two-column paper,
  not a fixed 2.5×; again goes back. Both ask the core, which finds the column from the page's characters.
- **A page strip in the phone's PDF reader (Books 0.17.0):** while the bars show, the pages as small pictures along
  the bottom, the one read framed; drag the row, tap to jump. A turn while zoomed shows the next page sharp at once
  (the pages either side are drawn ahead at the zoomed size).
- **Find in a PDF on the phone shows the first match at once (Books 0.17.0):** pages are searched one by one from the
  one shown; the bar counts on as the rest come, ✕ stops it, and every match on the page is framed.
- **The agenda as a day, 3 days or a week (Calendar 1.9.0):** the Calendar's Agenda lists a day, three days or a week
  with every day said (or the coming 60 days, as before), the events beside the dated tasks, and a task's box ticks it
  through the core as Home does. Plugins tick a listed task with `atlas.tickTask` (plugin API 31).
- **The Agenda on the phone:** a native screen (the top bar's calendar button, the launcher's *Agenda*) lists a day,
  three days or a week — the Calendar's events and the dated tasks, every day said — from the same answers as the
  desktop's Agenda; a task opens at its line or is ticked from its menu, an event opens the Calendar at its day. The
  home-screen widget shows what is coming up next.
- **Books: free ink over a reflowed ebook page:** a Pen and an Eraser in the EPUB reader; the ink is pinned to the
  words under it and kept in em, so it stays with them after a font, margin or window change. Kept in the book's note
  as marks (plugin API 30: `atlas.changeMarks`, `atlas.samples`); the phone's reader writes the same marks and offers
  to move an older `.ink.json` into the note.
- **Audiobookshelf offline (Audiobookshelf 0.12.0, plugin API 32):** *Keep offline* in the player downloads a book or
  an episode to the device; it then plays from the kept files, with no server at all when it is out of reach, and the
  listening done offline is sent to the server as a local session once it answers again. A plugin's
  `atlas.media({ file })` plays a file of its own cache, served by the core with ranges.
- **Audiobookshelf's listening stats (Audiobookshelf 0.11.0):** the home ends with your listening, from the server's
  own stats (every app counted): today, the last seven days as bars, the time in all, and what you listened to most.
- **Audiobookshelf's podcasts (Audiobookshelf 0.10.0):** a Podcasts library beside Audiobooks on the Libraries page,
  a podcast opens on its episodes (newest first, each with its date, length and how far you are), and an episode plays
  in the player as itself, its place kept per episode on the server — also when the server ended its session.
- **Audiobookshelf's read-along (Audiobookshelf 0.9.0):** a book whose Audiobookshelf item carries its ebook gets
  *Read along* in the player: the ebook opens beside it (the phone's own reader first), at the place Audiobookshelf
  keeps (`ebookLocation`, `ebookProgress`) when that is newer than the ebook's note; the reader's newer place goes back
  to the server every 30 s and when the player closes, so Audiobookshelf's own apps open it there too. A plugin's
  `atlas.open(pdf, page)` reaches the phone's reader at that page.
- **Audiobookshelf's bookmarks (Audiobookshelf 0.8.0):** the player's Bookmarks tab lists the book's bookmarks from
  the server, adds one at the time you are at with a note, goes to one, removes one — the same ones Audiobookshelf's
  own apps show. *Into the note* writes a bookmark into the book's note (the catalog's) as a time link
  `[[Book#t=1:02:03]]`, which seeks the book when it plays. Plugins get the link's form as `atlas.player.timeLink`.
- **Audiobookshelf's shelves and search (Audiobookshelf 0.7.0):** the pane opened with no book (the command
  *Audiobooks: shelves and search*, or *Shelves* in the Audiobooks library's header) shows the server's own shelves
  for you — Continue listening, Recently added, Recent series, Discover, Listen again, Newest episodes — then your
  collections and playlists, and searches every library on the server (books, podcasts, series, authors). The
  library's groups list collections and playlists beside series and authors.
- **Who is where:** each device of a vault says which file it shows and where in it (a PDF's page, a note's line);
  the desktop's lower bar shows a chip per other device that opens that file at that place, and the phone's Files
  lists "On your other devices" above the vault's folders. The core keeps the last place of each (`GET /api/where`,
  a mirrored vault asking its server). Settings → Writing → "Show your other devices what this one shows" turns it
  off for a vault.
- **Plan: the habit knows the weekday:** a kind of task usually done at a different hour on some weekday is nudged at
  that weekday's hour; with few done times on a weekday, the every-day habit holds. Every task ticked counts now, not
  only the nudged ones (seen by the planner's 5-minute round).
- **Hooks for plugins:** a plugin can give something outside Atlas an address to call with no sign-in — a button of
  a notification sent through ntfy, a webhook — `POST /api/plugins/<id>/hook/<name>?t=<token>`, each token signed by
  the vault's core for one use and expiring by itself (at most a week); it reaches the plugin's `on = "hook"` tool.
  A server's gate must let these paths through (docs/guides/SERVER.md).
- **Plan: nudges through ntfy when no device runs Atlas (Plan 0.7.0, Notifications 0.6.0):** a vault kept on a
  server sends the nudges that come due through the Notifications plugin's ntfy while none of your devices has run
  Atlas for 10 minutes, with **Done** and **Snooze** buttons that work from the phone without the app; the message
  says only "A task is waiting" unless Settings → Plan allows the task's name. Notifications' `send` takes buttons.
- **Manga: Browse on the desktop:** the Suwayomi server's sources by language, a source's popular, latest or searched
  series, and a series found there added to the library — from the Comics page's header or a command; the phone opens
  its own Browse from the same command.
- **Manga: download on the server:** a Suwayomi series' unread chapters queued in Suwayomi's own Downloads, from the
  series on the desktop and a chapter's long press on the phone; the chapters the server keeps are marked.
- **A downloaded document is named by its first page:** a PDF kept from a link (Catalog) is titled as its first page
  names it, with its author and year, by the same reader the references use for a PDF without identifiers; else by
  its file name.
- **Close a guest folder without restarting:** a Close button on the guest bar, and Settings → Vaults & sync lists
  the guest folders open, each with Close. The core stops serving it, removes its link and Atlas's state for it, and
  leaves its files; its window closes by itself.
- **Notes while a film plays:** two settings under Writing (`[player]`): typing in a note pauses the film, which
  plays on a few seconds after the last key (`pause_on_type`, `resume_after`); and a line started while it plays
  begins with its time as a link that seeks it (`stamp_lines`), outside the properties and code. Both off by default.
- **Native Files and Search on the phone:** the bottom bar's Files and Search are now the app's own lists over the
  vault's core — folders with breadcrumbs, sticky sections, pull to refresh, a menu per row (open, open with, rename,
  copy a link, trash), and search results as you type with the desktop's ranking, a hit opening at its line. Both
  work while the note view is still loading or has failed; the page's panes stay for the desktop and the browser.
- **A link to a file is kept as the file (Catalog 0.11.0):** in a vault where no catalog plugin claims it (no
  Catalog · Papers), a captured or added link to a PDF, an EPUB, a DjVu… is downloaded into the documents folder (a
  setting, `documents`) under its own name, with its companion note (`type: document`, its `url`, a title from the
  name); an ISBN in a PDF's first pages files it as that book's note instead, linking the file. The captures' triage
  shows **Download** (`w`) on a capture that links to a file, beside **Catalogue** (`c`), and says the note made or
  why none was.
- **Manga's Browse on the phone (Manga 0.12.0):** the library's **+** opens the Suwayomi server's sources by
  language, a source's Popular, Latest or a search as covers that load as you scroll, and a series' screen with its
  author, status, genres and description and **Add to library** with its categories (or change them, or remove it).
  The library's tabs follow the categories' order on the server.
- **Reminders ring on time on the phone, asleep or closed:** the app keeps an exact alarm at each folder vault's next
  planned notice (a calendar reminder, a snoozed one, Plan's nudges with their 2-minute grace from `plan/next.md`);
  it wakes the app's own core, which rings it as it does when open. Where Android withholds exact alarms, an inexact
  one that still fires in Doze.
- **Android notifications by kind:** Reminders, Nudges, Mail, Sync and Other, each silenced or made louder on its own
  in Android's settings (the per-plugin channels of older builds are removed).
- **The phone's note view recovers by itself:** a crashed or killed page is made again where it was, with its open
  files (and stops after three crashes in two minutes, waiting for a tap); back in the app, a server that restarted
  or was updated reloads the page once; memory is let go when Android runs short. Each failure is logged by name
  (`adb logcat -s AtlasWeb`) and said in a toast.
- **Jellyfin 0.2.0, a client (beta, from the example):** films and series on the Libraries page (posters, Continue,
  watched marks), a film played in mpv from where it was left, where you are written back to Jellyfin's play session,
  the film's note beside it (the catalog's when it is on, else one made in the setting's folder), the sign-in by
  Jellyfin's Quick Connect (a code approved in Jellyfin, no password typed in Atlas).
- **Manga on the phone is a reader app of its own (Manga 0.11.0):** a native library with the Suwayomi server's
  categories as tabs, the vault's series beside them and a Reading tab that opens a series where it was left; covers in
  a grid or a list with unread counts, a filter, pull to refresh. A series screen with Continue (the half-read chapter,
  else the next unread), chapters read and unread, kept for offline, a long press to mark read or unread or keep one;
  the next five unread kept in one tap. In the reader, swipes and taps turn pages on phones and e-ink alike, the page
  slides with the finger, fit width scrolls before it turns, pinch and double tap zoom, and a page between chapters
  says what was finished, what comes next and whether chapters are missing. The library and series open offline as
  last seen.
- **Video plays in mpv, and notes are written while watching.** A film or an episode (a plugin's item marked
  `video`, or a video kept in the vault) plays in mpv's own window, driven by the desktop's core; the lower bar shows
  and controls it as it does an audiobook. In the note beside it, Super+Alt+T writes the time as a link
  (`[[film#t=1:02:03]]`; a click on one seeks the film, or starts a vault video there), Super+Alt+S quotes the subtitle
  shown, Super+Alt+F attaches the frame shown with its time.
- **A test that fails when the phone has no path for a feature:** every command, plugin and Settings page is found in
  the repository and must have a line in `crates/atlas-android/parity.toml` saying how the Android app does it — the
  page, a named native screen (checked to exist) or missing with a reason. The gaps are printed on every run; a new
  feature without a line, a native screen that does not exist, a stale line, or a plugin marked against its manifest
  fails with the line to paste (`cargo test -p atlas-android --lib -- parity`).
- **The phone app carries its plugins:** every plugin made for the phone comes inside the app, and a vault on the phone
  is brought up to them when it opens — an older copy is updated (settings kept, the old one in the trash), a retired
  plugin is replaced by its successor (Audiobookshelf for the old catalog one), and a copy changed in the vault is
  left as it is and said. A short message names what was updated. Plugins the vault does not have are listed in
  Settings → Plugins under "Built into this app", one tap adding one.
- **Settings → Sign-ins, one page for every way past a sign-in in front of a service:** a "Which one do I need?" line,
  then three sections — sessions kept from a sign-in gate (Authelia, Authentik…), OpenID providers with the vault's
  provider explained in plain words, and keys that skip the gate. Each kept item shows its hosts, since and until
  when, the plugins using it and a Forget button; empty sections say what will appear there and when. A key is
  entered in a password field, listed only as "key kept", and sent only to the hosts named (`abs.example.org` or
  `*.example.org`; `*.org` and `*` are refused with the reason), only over https. The page moved out of Accounts,
  and Settings now says "sign-in gate" everywhere for forward-auth (Server's sign-in choices included).
- **Audiobookshelf signs in through Authelia (Audiobookshelf 0.6.0):** the command *Audiobookshelf: sign in* uses the
  server's own OpenID sign-in (Authelia or any provider), as its apps do, and keeps the token; no token to paste.
  Plugins' sign-ins (`atlas.signIn`) now come back on the phone too, in the app's own sign-in window.
- **PDFs on the phone fit the width, crop their margins and keep the zoom (Books 0.15.0):** Settings → Fit: whole
  page or width; Margins: shown or cropped (found from the drawn page, so scans crop too). The zoom stays from page
  to page, and a turn on a page taller than the screen first steps down a screenful, then shows the next page from its
  top (back: the page before from its bottom). A finger moves any page larger than the screen.
- **Swipe between Home, Library, Files, Search and Settings on the phone:** a sideways fling on the bottom bar, or on
  a place's page where nothing scrolls sideways (tables, fields and selections keep their own gestures).
- **Audiobooks play on when their tab is closed (Audiobookshelf 0.5.0):** the app has one player now, outside any tab:
  closing the player's tab no longer stops the book, a second book replaces the first instead of playing over it, and
  the status bar shows what plays with a play/pause button (a click opens the player again). Where you are is sent to
  Audiobookshelf by Atlas itself every 15 s, on pause and at the end, also when the tab is gone; a session the server
  ended is opened again without losing the time listened. On the phone the player becomes the app's media service:
  it plays with the screen off, with the lock screen's, the notification's and a headset's controls (needs a device
  to confirm). Plugins play through it with `atlas.player` and hear where you are through `[media] progress`.
- **Book highlights stay where you made them (Books 0.14.0):** a highlight remembers its chapter and its place, so a
  phrase that occurs twice is marked where you chose it and not in other chapters; a new highlight goes under the
  note's *Highlights* heading instead of at the very end; quotes and callouts of your own elsewhere in the note are no
  longer taken for highlights; a tap on a highlight removes it (after asking); on the phone, a highlight in the Notes
  panel opens the book at it.
- **Books and comics from a server vault read offline on the phone:** a file opened once is kept on the device and
  opened from there when the server does not answer (the reader says *Offline — the copy on this device*); a download
  is streamed to the device instead of held in memory, a broken one never replaces the good copy, and a PDF no longer
  asks the server about the file at every page.
- **Continue where you left off (Catalog 0.10.0, Books 0.13.1, Manga 0.10.1, Audiobookshelf 0.4.1):** the Libraries
  page shows a Continue row of the books, comics and audiobooks you are in the middle of, latest first, and a progress
  bar under every cover; on a phone one tap on a cover opens it. Items show at once when you come back to the page.
- **Comics read offline on the phone and the Boox (Manga 0.10.0):** a Suwayomi chapter read once, or kept with
  *Keep 5 for offline*, opens in the native reader without the server, with its series' chapters as last seen. The web
  page and the native reader now keep one copy in the vault's cache instead of two that never met.
- **Contents and "Back to page N" in the phone's PDF reader (Books 0.13.0):** the Contents tab lists the PDF's own
  outline with the section you are in marked, and every jump — a section, a link, find, the slider, a bookmark —
  leaves a chip that takes you back to the page you left. The EPUB reader's chip is now the same one.
- **See what your other devices have open:** the status bar names the note (or PDF page) another device shows —
  the Boox, the phone, another window — and one click opens it here; also the command *Open what another device
  shows*.
- **Highlights can be removed on the Boox:** a pen tap on a highlight, underline or struck passage in a PDF offers
  Remove or another colour (yellow, green, blue, red); Undo takes it back, and the desktop sees the change.
- **Typing on the phone:** a row above the keyboard while a note is typed in — undo, redo, indent and outdent, to-do,
  list, heading, bold, italic, `[[`, a web link, a photo and dictation — and the note shrinks above it, so the caret is
  never hidden. In the phone app, upload buttons now open the system's file picker (they did nothing before).
- **Plan 0.6.0 nudges on the device you are at:** each device of a mirrored vault tells the server when it was last
  used; a nudge rings on the computer used in the last 5 minutes, else on the phone while Atlas runs there, else on
  the planning computer as before. Settings → Plan says which and why.
- **Plan 0.5.0 keeps nudging when the planning computer sleeps:** the planner writes its plan to `plan/next.md`;
  another device plans for itself once that is 2 hours old.
- **Plan 0.4.0 waits for you:** a nudge due now waits while no one has used the computer for 30 minutes (the screen
  locked or idle, as the system says) unless the task is urgent; Settings → Plan says when the computer was last used.
- **Back and Forward inside panes:** the mouse's side buttons, swipes, Super+[ / Super+] and the phone's Back step
  through the explorer's folders, a web tab's pages, Email's folders, searches and conversations (Email 1.8.6) and
  Calendar's views and dates (Calendar 1.8.3) before going to the previous pane.
- **File dialogs are the desktop's own on Linux** (KDE's on Plasma), through the portal.
- **Dismissing a notification reaches its plugin** (desktop, Android, Windows), as `atlas:dismissed` on its
  `on = "notice"` tool. **Plan 0.3.0 backs off:** each dismissal lowers that task's score for the day, and three in
  three days pause it until its line is edited or it comes due.
- **Plan 0.2.0 learns when you get things done:** once a kind of task (its first tag, else its folder) has 10 done
  times in the ledger, its nudge moves to the hour of the day it is usually done ("you usually finish #writing in the
  afternoon"); a nudge in the hour before lowers the next one's score. Settings → Plan lists each kind's hours.

### Changed
- **Mail search ranks by relevance (Email 1.9.0):** the best matches first — words in the subject, then the people,
  then the body, newer above older — with a switch back to newest first; a word being typed is answered from prefix
  indexes; when no word matches, parts of words in subjects and names are found (`attice` → "Lattice").
- **The mail index takes about an eighth of the space (Email 1.9.0):** kept messages are compressed and keep their big
  attachments' names and sizes, not their contents, which are fetched from the server when opened, saved or forwarded.
  Messages kept before are converted once in the background; nothing is downloaded again. The index file gives the
  freed space back to the disk (Email 1.9.1): on a real account set, 1.7 GB → 270 MB.
- **Search reads the notes, not the logs:** by default the Search pane, the palette and saved searches look in the notes'
  lines and the PDFs' text only; code, logs, a run's outputs and data files come in with the new **All** switch (Replace
  too). Any file still matches by its name. Binary files are no longer reopened by every search.
- **A kept mail is searched by its words:** its HTML (tags, links' addresses, styles, hidden ids) is no longer matched.
- **Mail in the vault's search (Email 1.10.0):** the Search pane lists the conversations matching the words in their
  own group under the files, from the mail's own index; a click opens it in the Email pane. Any plugin can answer the
  search (`on = "search"`). The keys reach those hits too (↓, Enter); the Email pane's Best match / Newest first
  switch shows for any search, not only one with operators (Email 1.10.1); quick open lists `key:value`'s notes.
- **Search by property:** `status:draft`, `author:smith` list the notes whose property holds the value, at once.
- **Search ranks notes many others link to first** when they match as well as a lone note.
- **A vault opens without reading every note again:** the note index (links, properties, tags) is kept on disk and
  only notes changed since are read at a start.
- **Search reads only the notes that can hold the query:** an index on disk (`.atlas/cache/search/`, under a tenth of the text's size, built in the background) lists them; what is found is the same, an edit is found at once.
- **A downloaded scan is named by its first page, read by OCR (Catalog 0.16.0, OCR 0.3.0):** a PDF with no text at
  all has its first page read by the OCR plugin (the page as the core draws it for its cover), then named as any
  document is — its title, authors and year, or an ISBN that files it as a book. Without the OCR plugin, the PDF's Info
  or its file name, as before. A plugin's helper now receives a non-text answer (a picture) as its bytes
  (`Atlas::get_bytes`).
- **Jellyfin follows the library rule (Jellyfin 0.4.0):** Films and series lists only what you watched or started;
  the whole server is its own tab — the **Jellyfin** button in the library's header, Continue first, then every
  cover by All / Films / Series with a filter; a click plays a film or asks a series' episode.
- **A downloaded document whose first page names nothing is named by the PDF itself (Catalog 0.15.0, Catalog ·
  Papers 0.7.3):** a scan or a poster gets the title and author its maker gave the PDF (its Info dictionary), as a
  reference already did; a tool's stand-in ("Microsoft Word - …", "untitled") is ignored. The PDF naming is now the
  catalog's, and catalog-papers uses the catalog's.
- **Apps in the phone's bottom bar:** a tap opens a menu of direct links — Manga, Audiobooks (each with its launcher
  icon, straight into its own screens) and the Agenda. The Library shows the same apps as a row of buttons at its top,
  always in view, instead of chips at the far end of its row of libraries.
- **The libraries list only what is yours; each server is its own tab (Catalog 0.14.0, Books 0.22.0, Manga 0.17.0,
  Audiobookshelf 0.16.0):** a server's things no longer fill the Libraries page under "From <service>". A thing joins
  the library once it is yours (read or listened past its start, a note, a bookmark); everything else is in the
  service's own tab, a button in the library's header: a server's shelf of books opens in the explorer on that
  folder, Suwayomi in the Manga pane's new library screen (its categories, unread counts, Browse sources; the command
  "Manga: Suwayomi's library"), Audiobookshelf in its own home. On the phone the buttons open the native Manga and
  Audiobooks screens. Audiobooks and podcasts you have started stay in the library.
- **The library's right-click menu (Catalog 0.13.0):** a right-click on a reference, a book or a film gives what its panel
  offers — Open, Read, Notes, its shelf, Edit, Delete… — then the rows every file has (Open beside, Show in the explorer,
  Copy link), instead of only the file's rows; on several picked, what can be done to all of them. Plugins open such
  a menu of their own with `atlas.shell.popMenu` (plugin API 34).
- **Books named as books (Books 0.21.0):** a shelf of downloaded books lists each by the title, author,
  series and year its file's name carries — "(Series) Author - Title_ Subtitle-Publisher (Year)", "[Author] Title",
  "Author - 2004 - Title" — with the author, year and folder under it instead of the server's whole path; sorts by
  author and year; the panel shows the file, its folder and the server, and a lettered tile while a cover loads.
- **A library item's panel says more:** under its buttons, its picture (a paper's first page, a book's cover) beside
  its fields (for a reference: citekey, added, PDF, notes), whatever the layout; the seldom-used actions (copy the
  citekey, `\cite` or BibTeX; Delete…) behind a "⋯" button (`more` on a library action, plugin API 34); the linked
  mentions right under the item instead of at the column's foot.
- **The library keeps its place:** coming back to a library (Back after opening a paper, another tab) finds the same
  item picked, the same tab, search, order and scroll; and the empty detail column stays at the right instead of
  dropping under the list.
- **A book gets its note once you are past its start (Books 0.19.0):** opening an e-book or a PDF in Books no longer
  makes its note; until you are 1 % in (or set a bookmark) its place stays in the library's `reading.json`, then the
  note is made and the place moves there — on the desktop and the phone alike, the catalog's one-note rule.
- **A PDF read on the desktop says its place in its note:** the PDF reader writes `reading_page`, `progress` and
  `last_read` into the PDF's note, the properties the phone's reader writes, after a page is held for a few seconds
  (and on closing), and opens at the note's page when another device read further since. So the phone and the desktop
  continue each other, the Libraries' Continue row lists a PDF read on the desktop, and Audiobookshelf's read-along
  follows it. A PDF with no note gets none from being read.
- **Audiobookshelf files only the books you listen to (Audiobookshelf 0.14.0):** a book gets its one note — the
  catalog's, found by its ids wherever it is — when you are past its start or finish it, on the desktop or the phone
  (or in Audiobookshelf's own apps, seen by the 6-hourly `sync`), and when you write a bookmark into it. `sync` no
  longer files the server's whole library; notes it filed before for books never opened are left as they are.
- **Only the vaults you used lately start ahead:** a desktop window starts the other vaults on its list 20 s
  after its own, so switching is a page load; it now starts only those opened in the last 3 days (at most 2). An older
  vault starts when you switch to it (a fraction of a second) and until then holds no watch on its folders, no
  threads and no scheduled jobs.
- **Sign-ins are the device's, not each vault's:** a gate's session, an OpenID sign-in and a bypass key kept in one
  vault now serve every vault on the machine and the server vaults reached from it (a vault's old ones move over the
  first time it is opened). On the phone, the header typed in **A token or a header…** is now that same kind of key for
  the server's host, and the phone's own screens for Suwayomi and Audiobookshelf send it too.
- **Deadlines are Home's:** the left bar has no Deadlines button any more (one app fewer); what is due is the
  deadlines box on Home, and a home document without it is offered the box once, with one click to add it. The
  Deadlines page stays in the command palette.
- **Background work runs where it belongs:** Finance's bank sync and prices, Notifications' poll and the feed polls of
  the catalog's services run on the vault's server when it has one (a device with a mirror leaves them to it), so one
  core writes their notes instead of each open one; Calendar, Syncthing and OCR say they run everywhere, and why. A
  plugin with a schedule or a file hook must now name its `background`, with its reason (PLUGIN-API.md). The server
  needs those plugins signed in.

### Fixed
- **A task dropped on the calendar's hours is time-blocked (Calendar 1.11.1):** it opened the new-event box instead.
- **Download offered for a captured link with brackets in it** (`Group Theory (2010).pdf`).
- **Mail that stopped updating (Email 1.8.7):** one sync stuck on a connection that went silent — a laptop asleep, a
  router that forgot it — held off every later sync of the account, with no error shown. A sync now gives up after
  20 minutes and starts afresh on new connections; the connections probe themselves while idle (a dead one fails in
  about a minute, not two hours); IDLE is renewed every 9 minutes; a reset or timed-out connection is retried at once.
- **Mail that never loaded on a network with broken IPv6 (Email 1.8.8):** the mail server's addresses were tried one
  after another, its IPv6 one first; where IPv6 is handed out but goes nowhere that attempt hung until the 30-second
  limit and IPv4 was never tried, so every sync failed. The addresses are now raced the way browsers do (Happy
  Eyeballs): IPv6 and IPv4 alternated, a new attempt every quarter second, the first connection up wins. Sending too.
- **A server blip is no longer a notice:** a mirrored vault's write that could not reach the server is sent once more
  on a fresh connection, kept connections are let go before a proxy drops them, and "<server> does not answer" comes
  only after two minutes of silence (the sync chip says offline at once). A sign-in the gate wants is still told at once.
- **A plugin's round runs on one machine:** a scheduled tool called by hand — a button, an agent over MCP on the
  server — runs only where the vault runs its rounds (`[automation] schedules_on`, the tool's `background`), and is
  refused elsewhere with where it runs; so the Runs round never runs on the server and the desktop at once.
- **Event notes written by one computer (Calendar 1.9.1):** after a sync, only the computer that runs the vault's
  schedules (`[automation] schedules_on`) brings the event notes up to date and offers to move a moved event's
  tasks; before, every open Atlas wrote the same notes, which sync could copy back and forth.
- **Sync failures say what happened and what to do:** a save the server refused names the note and where its newer
  version is (already here, not brought by Syncthing yet, or still reaching the server) instead of "Syncthing has not
  brought the server's newer copy yet"; a server that does not answer gives its reason; conflict copies point to Sync
  conflicts; and Settings → Vaults & sync and the phone's vault list say when this device's Syncthing is not running,
  has the folder or a device paused, or does not share the folder at all (read from Syncthing's own config). The
  phone's row for a server's vault says whether the server answers when it cannot read its state.
- **Manga and PDF pages turn again on phones:** a finger's touch was taken for a resting palm on phones that report
  a fingertip as wide, so swipes and taps in the manga and PDF readers did nothing. The size rule now applies only on
  a device with a pen.
- **The phone app's colours follow the vault's theme everywhere:** the bars' text and icons, Settings, sheets and
  the readers took the phone's light or dark mode while the page took the vault's theme and palette — unreadable bars
  with a dark vault on a light phone. The open-files count sits inside its icon at any font size.
- **Turned PDF pages on the phone:** on a page the PDF turns itself (landscape tables, scanned spreads) or whose box
  does not start at the corner, a long press selected other words or none, and highlights, ink and text boxes from
  the desktop were drawn in the wrong place. The phone's reader now maps the screen through each page's box and turn,
  as the desktop does.
- **Audiobookshelf 0.4.0's player holds up:** your speed is remembered, the audio is fetched again once and resumed
  when it stops working, quick skips no longer race, listening time is kept until the server has it, media keys and
  the lock screen show the book and its chapter.
- **Reading on the phone and the Boox no longer rewrites the book's note at every page** (Books 0.12.2, Manga 0.9.1):
  where you are is written on a new chapter, on leaving the reader, and otherwise every two minutes at most, and not
  at all when only the time would change — less sync traffic, fewer conflict copies.
- To-do, list and heading on an empty line leave the caret after the new `- [ ] `, not before it.
- A PDF tab's hover card shows the page it was left on instead of blank pages.

## [0.3.1] - 2026-11-16

### Added
- **Plugin store** in Settings → Plugins: every plugin of the release as a card, with search, filters (installed, not
  installed, updates; stable or beta), Install or Update in one click, and Update all. Never offers an older version.
- **Email 1.8:** "Link to an event…" and "Copy a link to paste in a note" in a mail's menu; `email_save_note` for agents.
- **Templates:** `apply_when: { linked_by: <property> }` gives a new note the template when other notes already name it
  through that property (a topic named under `topics:` is made as a topic). Following a link to a missing note makes it.
- **Formulas in Bases:** written, changed, renamed and removed from the Properties popover; Obsidian's functions for
  text, numbers, lists (`map`, `reduce`, `join`, `unique`…), dates (`.year`, `relative()`, `time()`) and `%`.
- **Dates read the same everywhere:** Bases, task chips, Deadlines and the note's date name near days (Today,
  Yesterday, Thursday) and shorten the rest; hover for the whole date and how far it is. A moment.js format of your
  own in Settings → Notes (`date_format`).

### Fixed
- Email: Enter on a focused button presses it; a failed archive no longer shows the previous folder's mail; the last message of a conversation opened from a note deletes the conversation; dropping mail on its own folder does nothing; "Always from this sender" reports a failure; single-key commands act only when the pane was used last.
- Files: thumbnails and the preview redraw for another or a changed file; the folder shown being moved still leads to the nearest one; an upload's "already exists" is the server's status, never a 409 in a message (a download could loop); dragging out a name with ':' works.
- Bases: a formula the core refuses keeps its text in the form; `repeat()` and `replace("")` no longer run away; a day that does not exist (31 February) with a timezone stays text.
- **Calendar 1.8.1:** the event card's Delete button deletes again; the card's quick create keeps what was typed.
- **Activity** keeps the day's notes listed when a run writes many files; its tabs fit a narrow card.
- **Plan 0.1.2:** no morning notice when nothing is due.
- **Deadlines** says what it would show when empty, and tints its groups by urgency.
- Copying from a terminal drops the padding and runs of blank lines.
- **PDF reader:** ← and → turn the page.
- **Calendar 1.8.2:** Enter in the card's title no longer creates an event when there is no calendar to write to; a
  note linked twice from one line no longer breaks the card's backlinks.
- **Deadlines:** a recurring deadline event shows every time it recurs (they collided), and "Today" moves on at
  midnight on a Home left open.
- **Plugin store:** Update all cannot run twice at once, two installs at once leave the right buttons, and an update
  that cannot run says why.
- **Formulas:** a formula cannot silently replace another of the same name.
- **Dates:** impossible dates (month 13, 25:00) stay text; every ISO offset reads; "a month ago", never "1 months";
  week tokens (`W`, `WW`) in your date format; a date without a time keeps only the day part of the format.
- **Email 1.8.1:** a file dragged from the file tree into a message is attached (it was dropped silently), and its
  path is no longer typed into the text.
- **Email 1.8.2:** recipients added after the last autosave are kept in the draft; Ctrl+Enter in To sends (what was
  typed becomes an address first); Enter on the triage card's buttons presses them; Archive or Delete pressed while
  the next conversation loads acts on the one shown, not the next; the same file attached twice draws right; an undone
  or failed send reopens with its text even from a closed composer.
- **Files:** clicking inside the rename box no longer cancels the rename; a file found with "Below" is renamed in its
  own folder (it was refused or moved up); a folder opens with its first row selected, not the old folder's row
  number; "Show in the explorer" goes to the vault even from a tab that had wandered to a server; a link that is a file
  no longer leaves the list on "Opening…"; the bar measures the room left by the preview (no buttons cut off), More
  holds Preview and Split when they do not fit, and a long path fades at its start.
- **Files, grid view:** tiles show whole again (they were cut to a list row's height); a tile's actions are small
  icons in its corner instead of a column of words over the picture.
- **Files, redesigned bar:** one row — the path as clickable crumbs, the filter with its "folders below" switch inside,
  icon buttons for new folder, upload, hidden files, preview and split. Folder tiles in the accent colour, files with a
  type badge, names on two lines; dates as everywhere else; a source that cannot be reached says so in one line.
- Pressing Esc in a toolbar popover (a base's Sort, Filter, Properties) no longer throws an error.

## [0.3.0] - 2026-11-16

Calendar, tasks and notifications work together in this release:
- **Plan (beta)** nudges you about due tasks when your day has room for them, with Done, Snooze and Open on the
  notification. A "Why now?" section in Settings explains each nudge.
- **Calendar 1.8** gives events notes and links. It also adds time-blocking a task and a layer of tasks and deadlines.
- **Deadlines** gets a Home box and a page of its own.
- **Notifications** have buttons on Linux, Windows and Android, and they disappear once dealt with.

Also new:
- **AI agents** reach far more of Atlas through MCP.
- **Web tabs** block ads and trackers.
- **Sync** says each vault's state in plain words, and a view lists the conflict copies left to settle.
- **The phone** takes Material You colours and has a home-screen widget.
- **Spelling** checks several languages.
- **Notes:** a note's title heading renames its file.

### Added
- Calendar 1.8: events get notes on demand ("Make a note" on an event, "Calendar: link this note to an event…"),
  kept in step with the event and marked cancelled when it is deleted; the event's card lists the note's links and
  backlinks. A **Tasks & deadlines** layer shows dated tasks and notes in the pane, and **Time-block…** turns a task
  into an event linked both ways: the task gets `⏳` and a link to the event's note; when the event moves, a toast
  offers to move the `⏳` too. Agents: `dav_link_event`, `dav_time_block`.
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
