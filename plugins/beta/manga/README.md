# Manga

Manga and comics shaped like Mihon (Tachiyomi): a vault folder per series, its chapters `.cbz` files or folders of
pictures, plus your Suwayomi server's library. Read right to left, left to right, vertically or as a webtoon, from
where you left on any device; on e-ink with a flash between pages. A `.cbz` (and `.cbr`, `.cb7`, `.cbt`) opens in it on
a click.

## What it adds

- **The Comics library** (Libraries page, id `comics`): the folder's series and the Suwayomi library, grouped by where
  they come from; a series opens in the pane.
- **The pane**: the series page (chapters, read / unread, where you are) and the reader. The reader decodes the next
  four pages ahead (and opens the next chapter near the end), so a turn shows a page already drawn; a page that takes
  a moment shows a spinner, one that fails a Try again. Between two chapters it shows a page of its own (what was
  finished, what comes next and its pages, or that it was the last): one more turn crosses, so a turn back from a
  chapter's first page never lands in the previous chapter by accident. A bar along the bottom shows how far you are
  (from the right in right to left) and goes to a page on a click. Keys: the arrows (in the reading direction), Space
  / Shift+Space, Page Up / Down, Home / End; a page taller than the view (fit width) scrolls before it turns. **z** is a magnifier in the paged modes: the page twice as
  large where the pointer is, following it; z again, Escape or a turn ends it (the phone pinches). The
  wheel turns one page per gesture in the paged modes, after a pause at a tall page's edge. Tap zones as Mihon's. The
  reading mode and the scale are changed from the reader's bar (a tap in the middle) for this series: kept in its
  note's `reader_options` as the phone keeps them (a server's series: the plugin's settings).
- **Pictures**: JPEG, PNG, WebP, GIF, BMP, AVIF and JPEG XL pages. A JPEG XL or AVIF page (by its name or its first
  bytes) is decoded by Atlas's core, never by the page's engine: browsers and Android's WebView show no JPEG XL,
  WebKitGTK can hang on one, and AVIF is not decoded everywhere. In a `.cbz` such a page is written once into
  `.atlas/cache/plugins/manga/pages/` and shown through the core's thumbnails (up to 2048 px), as a folder's pictures
  and a Suwayomi page always are.
- The series are listed only on the Libraries page: the command **Manga: library** and the series page's
  **‹ Library** open it there.
- **Where you are** is kept per series in its one note, so devices carry on from each other. A series gets that note
  only once it is yours — a page turned past a chapter's first, a chapter finished or marked read, or **Its note**
  (the series page, on the desktop and the phone) — by the catalog's rule (its `note` tool;
  docs/design/DESIGN-server-libraries.md): a vault series' note is its folder's (`<series>/<series>.md`, made by the
  core), unless a catalog note claims the folder by `file:`; a Suwayomi series' note is the catalog's Manga note,
  found by its `suwayomi` id (`<source id>:<series url>`, which survives a reinstalled server), and tells which
  chapter you are at (`reading_chapter`, `last_read`) while the place itself stays on the server. Opening or listing a
  series never makes a note. Without the Catalog plugin a vault series still gets its folder's note; a server's none.
- **Other archives**: `.cbr`, `.cb7`, `.cbt` are unpacked once by Atlas's core into a cached `.cbz` (zip, tar and 7z on
  every platform; a real RAR through the machine's `bsdtar`, `unar` or `unrar`).
- **Suwayomi** (`suwayomi.js`): the server's library, chapters and pages through Atlas's fetch, and what you read
  written back to the server. Behind a sign-in proxy, Atlas offers the sign-in. What the server answered is kept: when
  it cannot be reached, the library and a series' chapters are the ones last seen (grouped as "offline: as last seen"),
  a chapter opened before reads from the kept pictures (a page is never downloaded twice), and where you are waits
  and is sent with the server's next answer.
  Its categories are folders under "Suwayomi" at the Comics side (Suwayomi › Weekly), its own Default left out. In the pane's Suwayomi library (its own tab) a search looks on
  every category, not only the one shown, as the phone's does. Its tabs are the phone's: **Reading** (the series started, last read first),
  **All** (every series: the default) and the categories; its bar sets **Library shows** and **Library order**, the
  phone's settings.
  A series' **New chapters?** asks the server to look at its source again; the command "Manga: look for new chapters
  on Suwayomi" starts the server's update of the whole library (new chapters then show as unread counts).
  **Keep 5 for offline** fetches every page of the next five unread chapters now, so they open without the server.
  **Browse Suwayomi** (the Comics page's header, or *Manga: browse Suwayomi's sources*) lists the server's sources by
  language with a filter; a source shows its Popular, Latest or a search as covers (More for the next page); a series
  found there shows who made it, its status and description, and **Add to library** (or Remove), then Read. Once in, its
  categories show as chips, each switched on or off with a click (the library's tabs).
  **Download on the server** queues the unread chapters in Suwayomi's own Downloads (`enqueueChapterDownloads`): the
  server keeps them, so they read even once their source is gone; a chapter it keeps shows ⤓. While it downloads the
  series' chapters, the series says so under the buttons: how many are left, the one under way and how far, the failed
  ones (`downloadStatus`, every 3 s).
- **On the phone**: a reader app of its own (`android/`). Its **library** (*Manga: library*) shows the Suwayomi
  server's categories as tabs, the vault's series in theirs and a **Reading** tab (started series, last read first);
  a tap opens the series' screen, whose Continue goes on where you were; covers in a grid or a list, unread counts, a filter, pull to refresh. A **series** (also what a tap in the
  page's Comics opens there) has Continue, its chapters read and unread, a long press to mark read or unread, keep
  one for offline or download it (or every unread one) on the server ("on the server" on its row), and **Keep the next 5 for offline**. The **reader** turns pages by swipe or tap in every mode,
  slides the page with the finger (not on e-ink), scrolls before it turns in fit width, zooms by pinch and double tap,
  and shows a page between chapters (what was finished, what is next, chapters missing), which a quick second swipe
  does not run past. It preloads as Mihon does: the page on screen first, then the next five the way you read, two
  behind and the next chapter's first three near a chapter's end, in that order (a page turned away from is dropped
  before it is fetched); a page on its way shows a spinner and its download's percentage; pages are decoded at about
  the screen's size (JPEG XL and AVIF in Rust, at the normal priority) and kept decoded in memory.
  Both sides keep a Suwayomi chapter's page list and pictures, a series' chapters and the covers in one place, the
  vault's `.atlas/cache/plugins/manga/suwayomi/` (`android/Kept.java` gives the layout): a chapter read once, or kept
  for offline on either side, opens and reads with the server out of reach, the library and its series as last seen.
  **Browse** (the phone library's **+**): the server's installed sources by language, a source's Popular, Latest or a
  search as covers loaded as you scroll, and a series' screen with its details and **Add to library** (with its
  categories), or, once in, its categories changed or Remove. The library's tabs follow the server's order of its
  categories. Installing sources stays in Suwayomi's own page; the desktop's Comics library has no Browse yet.

## Settings

- **Library folder** (`manga`): each folder in it is a series.
- **Suwayomi server**: `https://manga.example.org`; empty: none.
- **Reading mode** (right to left, left to right, vertical, webtoon), **Scale** (fit screen, width, height, original),
  **Tap zones**, **Invert tap zones**, **Volume keys turn pages**, **Background** (white, black, grey, automatic),
  **Show the page number**, **E-ink: flash on page change, every N pages** (1; 0 never).

## How it fits

- Archives are read in the page with the app's own zip reader (`atlas.zip`, plugin API 20).
- A series' note is the catalog's kind `manga` (one note per thing): the catalog's rule finds or makes it, never this
  plugin by writing a note.

## Needs

Nothing for `.cbz`, `.cb7`, `.cbt` and picture folders; `bsdtar`, `unar` or `unrar` for a RAR. The helper
(`helper/helper.ts`) runs inside the core.

## Platforms

Linux works; Android works (`phone = true`, with the native library, series and reader); macOS, Windows and a server are untested.

## Status

Beta. Tests: the core's `convert::tests` (archive conversion), `thumbs::tests` (a chapter's first page as its cover)
and an end-to-end spec: Comics on the Libraries page, a series and the reader in the pane. The phone side's plain
logic on the JVM (`crates/atlas-android/android/test/run.sh`): `KeptTest`, `GesturesTest`, `ShelfTest`, `BrowseTest`
(Browse against cut-down answers in Suwayomi's GraphQL shape).
