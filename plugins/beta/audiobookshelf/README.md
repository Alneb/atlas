# Audiobookshelf

Your Audiobookshelf server in Atlas, with one address and one token:

- **To listen**: the **Audiobooks** library of the Libraries page and a player with chapters, speed, a sleep timer and
  your place written back to the server, on the desktop and the phone. The audio is played through Atlas's core
  (`atlas.media`), which adds the token, so the token never reaches the page.
- **For the catalog**: a book catalogued anywhere is looked up on the server, and its note gets the narrator, the
  listening time and a link to the audiobook; a book you listen to gets its one note (the catalog's rule: once you are
  past its start or finish it), never the server's whole library.

Nothing is asked of the server until its address and token are set.

**Signing in:** with the server's address set, the command *Audiobookshelf: sign in (OpenID, Authelia…)* signs in
through the server's own OpenID sign-in (Settings → Authentication → OpenID Connect in Audiobookshelf; Authelia,
Authentik or any provider in front of it), the way its own apps do: the server's page in a sign-in window, PKCE, the
return address `audiobookshelf://oauth` (allowed by default; another one in the setting *OpenID return address* must
be in the server's Allowed Mobile Redirect URIs). The token the server answers is kept as the plugin's secret. A
pasted API token still works.

This plugin is kept out of the public repository for now (`publish/overlay.txt`).

## What it adds

The modules: `abs.js` (the server's API for the page), `shelf.js` (its answers as cards, pure), `cards.js` (cards,
rows, the style), `home.js` (the home), `bookmarks.js` (the Bookmarks tab), `readalong.js` (Read along), `podcast.js` (a podcast's episodes), `keep.js` (Keep offline), `play.js` (a book handed to the app's player: the pane's ▶ and the Books reader's), `view.js` (the pane: the home or the player), `main.js` (the library, the
commands), `helper/` (the catalog and the player's reports, run in the core).

- **The Audiobooks library** (Libraries page, id `audiobooks`): every book of the server, with cover, author, narrator,
  length and progress; grouped by series or author; sorted by last listened, title or author.
- **The Podcasts library** (Libraries page, id `podcasts`): every podcast of the server's podcast libraries, with
  its cover, author and number of episodes, sorted by last listened or title. A podcast opens on its **episodes**
  (the pane's `show:<item>`): newest first, each with its date, length and how far you are (played ones marked). An
  episode plays in the player as a book does (`<item>/<episode>`, the server's `POST /api/items/<id>/play/<episode>`),
  its place kept per episode; Bookmarks and Read along are a book's and not shown for it.
- **The home** (the command *Audiobooks: shelves and search*, or *Shelves* in the library's header; the pane opened
  with no book): the server's own shelves for you, per library — Continue listening, Continue series, Recently added,
  Recent series, Discover, Listen again, Newest episodes (`/api/libraries/<id>/personalized`) — then your collections
  and playlists (`…/collections`, `…/playlists`), and the server's own search over every library (`…/search`: books,
  podcasts, series, authors; an author opens with their books, `/api/authors/<id>?include=items`). A card opens its book
  in the player; a series, a collection or a playlist opens as a sheet of its books. Covers are kept in the plugin's
  cache and asked once. The library's groups list collections and playlists beside series and authors.
  Under the shelves, **your listening** (`/api/me/listening-stats`, the server's count of every app's sessions):
  today, the last seven days (bars), the time in all, and the five items you listened to most.
- **The player** (the plugin's pane, opened on a book): play / pause, skip back and forward, a position bar, chapters,
  speed (remembered on each device), a sleep timer (minutes or end of chapter). The playing itself is the app's one
  player (`atlas.player`, API 29), outside the pane: closing the pane does not stop the book, a second book replaces
  the first, and the status bar shows what plays (a click opens the pane again, which shows the book as it plays). On
  the phone the app's media service plays it, with the screen off, the lock screen's, the notification's and a
  headset's controls; on the desktop media keys and a headset play, pause, skip and go to the previous / next chapter.
- **Bookmarks** (the player's Bookmarks tab, beside Chapters): the book's bookmarks on the server (`/api/me`'s
  `bookmarks`), one added at the time you are at with a note (`POST /api/me/item/<id>/bookmark`), a click to go there,
  ✕ to remove one (`DELETE …/bookmark/<time>`) — the same ones Audiobookshelf's own apps show. **Into the note** writes
  the bookmark into the book's note as a time link, `- [[Dune#t=1:02:03]] the note`, under its `## Bookmarks` heading
  (made at the end when missing), with `atlas.player.timeLink`, the app's one form for it. The note is the catalog's
  (found by the book's Audiobookshelf id, or made then: the catalog's `note` tool, `why: wrote`), remembered on the device and handed to the
  player with the book, so a click on such a link seeks the book. Only that click writes into the note; with the
  catalog off the link is copied instead.
- **Read along** (the player's *Read along*, shown when the item carries its ebook, `media.ebookFile`): the ebook is
  fetched once into the local copies of remote files (`.atlas/remote/audiobookshelf/ebooks/<item>/<file>`,
  `/api/items/<id>/ebook`) and opened beside the player by the app's reader (the phone's own reader first; a PDF at
  its page). Its place is kept twice — Audiobookshelf's `ebookLocation` (a page for a PDF, an EPUB CFI) and
  `ebookProgress`, and the readers' properties in the ebook's note (`reading_page`, or `reading_chapter` and
  `reading_at`, with `progress` and `last_read`) — and the newer side wins: the server's seeds the note when the ebook
  is opened, the note's goes to the server (`PATCH /api/me/progress/<id>`) every 30 s and when the player closes.
  They meet at the page or the chapter: a CFI's place inside a chapter is not carried over. Only properties are written
  into the note.
- **Keep offline** (the player's button, for a book or an episode): its tracks are downloaded through the core into
  this device's cache (`.atlas/cache/plugins/audiobookshelf/kept/<item>[_<episode>]/`, with a `kept.json` of the
  title, chapters and tracks written last), a track at a time (the core's limits: 300 s and 512 MB a file). A kept
  item plays from those files (`atlas.media({ file })`, plugin API 32), opening the server's session beside it when
  the server answers and playing alone when it does not; **Kept offline · Remove** sends the copy to the trash. Each
  device keeps its own.
- **Where you are, synced by Atlas** (`[media] progress`): the player reports every 15 s while playing, on pause, at the
  end and on close, also with no pane open; the core calls the helper's `progress`, which sends it to the play
  session's `/sync` (`/close` at the end) with the token the core adds. A session the server ended (or a restarted
  server) is opened again and the report sent there, the time listened kept until the server has it. Each device is its
  own in Audiobookshelf's sessions; the time listened is counted by the clock, whatever the speed, as its own apps do. With the server out of reach, a report is kept by
  the helper (`.atlas/cache/audiobookshelf-pending.json`) and sent as a local session (`POST /api/session/local`, what
  Audiobookshelf's apps send after listening to a download) once a later report gets through.
- **The Books reader's ▶**: a book whose note has `audiobookshelf: <item id>` (or an `audiobook:` link to the item)
  gets a ▶ in the Books reader; this plugin answers it — on the page the window events `atlas-audiobook:ask` and
  `atlas-audiobook:play` (main.js, only while a server is set), on the phone its place `audiobookshelf:play/<item>`,
  the book's screen with the book played over it — and plays the book through `play.js`, the pane's own path.
- The command **Audiobooks: library**: opens the Libraries page at Audiobooks (`atlas.openLibrary`, API 19; an older
  Atlas gets no command).
- `[contributes.catalog]`: a source for `book` and `science_book` (the `lookup` tool, priority 40, asked when the book
  has an Audiobookshelf id or an ISBN). The item is found by its id, else by ISBN, else by the exact title.
- **A book's note when it becomes yours** (DESIGN-server-libraries.md §3): the player's report (desktop and phone
  alike, the helper's `progress`) asks the catalog's `note` tool once a book is past its start (1 %) or played to its
  end, once per book (`.atlas/cache/<id>-noted.json`); the note is found by the book's ids wherever it is, else made in
  the catalog's books folder. A podcast's episode is not a book.
- **`sync`** (every 6 hours): the books you started or finished on the server — also in Audiobookshelf's own apps — go
  through the same `note` tool, 30 a run at most; a book you never started gets no note. A finished book gets the
  finished shelf (through `add` when its note was already there: `note` gives a found note only its ids). What was
  sent is remembered, so a run sends only what changed. With the catalog off it files nothing and says so. Notes an
  older `sync` filed for books never opened are left alone.
- Tools: `lookup`, `sync` (`audiobookshelf_lookup`, `audiobookshelf_sync` for agents).

## Settings

- **Audiobookshelf address**: `https://abs.example.org`, the address you open Audiobookshelf at.
- **API token** (a secret): Audiobookshelf → Settings → API Keys (newer versions) or your user's API token (older).
- **Skip back / forward (seconds)** (30).
- **Shelf for finished audiobooks** (`[[read]]`): the status a book you finished gets in the catalog; empty leaves it as
  it is.

## On the phone: a listening app of its own

On Android the plugin is native (`android/`, `[android] main` in its manifest), built into the Atlas apps like Manga:

- **Home** (`audiobookshelf:home`): per library, the server's own shelves for you — Continue listening, Recently
  added, Continue series, Discover, Listen again, Newest episodes — then your collections and playlists; the bar's
  search asks the server's search of every library as you type.
- **Library** (`audiobookshelf:library`): every book as covers in a grid or a list (kept on the device), and its series,
  authors, collections and playlists as tabs, each opening its books; a filter by title, author, narrator or series.
- **A book** (`audiobookshelf:book/<item id>`): cover, details, description, its chapters and your bookmarks (added
  where the player is, removed with a long press); one button plays it — *Play*, or *Go on* from where the server says
  you are, whichever device you listened on — and *From the start*.
- **Played from another plugin** (`audiobookshelf:play/<item id>`): the book's screen with the book playing from where
  you were and its player over it — what the Books reader's ▶ opens above itself (`Host.openOver`); offered only once
  the server's address is set (`ready`).
- **The player** (`audiobookshelf:playing`): cover, chapter, the bar through the book, ±skip, chapter by chapter, speed,
  the sleep timer, the chapters; a mini player along the bottom of every place while a book plays.

It is the page's client in Java, not a second one: every request goes through the vault's core with the token as the
plugin's secret header (filled in there, never in Java), the audio plays in the app's one player (`MediaService`, the
lock screen, a headset), and where you are reaches the server through the same `[media] progress` helper call as from
the page. Covers are kept where the page keeps them. The server's answers are read by small plain-Java classes
(`Cards`, `Book`, `Clock`, `State`) tested on the JVM (`crates/atlas-android/android/test/run.sh`). Read-along,
podcasts' own pane, listening stats and kept downloads stay the page's pane.

## How it fits

No requirements: the library and the player work alone; the catalog source and `sync` are used while the catalog runs.
It replaces the **Audiobooks** and **Catalog · Audiobookshelf** plugins (`replaces`): installing it carries their
address, token and settings over and moves their folders to `.atlas/trash/`.

## Platforms

Linux works; Android works (`phone = true`; the helper is JavaScript run inside Atlas's core); the others are untested.

## Status

Beta. Unit tests on cut-down copies of Audiobookshelf's answers (`helper/helper.test.ts`: lookup, sync, and `progress`
— synced, a lost session opened again, closing; the home's shelves, collections, playlists and search hits as cards,
`shelf.js`; bookmarks, and one written into a note's Bookmarks section; the read-along places translated both ways and the newer side chosen; a podcast's episodes, and an episode's report synced and its session opened again as itself; the listening stats' week and most-listened list; a kept item's files, and reports kept offline then sent as a local session); the pane against a stand-in server in `ui/tests/private/audiobookshelf-client.spec.ts` (screenshots in
both themes); a kept file served with ranges in `plugin_media.rs`'s tests; the app's player in `ui/tests/player.spec.ts` and its phone side's
arithmetic on the JVM; the phone's native screens' reading of the answers (`CardsTest`, `BookTest`) on the JVM. Tried against a stand-in server, not yet a live Audiobookshelf; the phone's background playback
needs a device to confirm.
