# Manga

Manga and comics shaped like Mihon (Tachiyomi): a vault folder per series, its chapters `.cbz` files or folders of
pictures, plus your Suwayomi server's library. Read right to left, left to right, vertically or as a webtoon, from
where you left on any device; on e-ink with a flash between pages. A `.cbz` (and `.cbr`, `.cb7`, `.cbt`) opens in it on
a click.

## What it adds

- **The Comics library** (Libraries page, id `comics`): the folder's series and the Suwayomi library, grouped by where
  they come from; a series opens in the pane.
- **The pane**: the series page (chapters, read / unread, where you are) and the reader (the reading mode and scale of
  the settings, tap zones, keys). The series are listed only on the Libraries page: the command **Manga: library**
  and the series page's **‹ Library** open it there.
- **Where you are** is kept per series in its note (the series folder's companion note), so devices carry on from each
  other.
- **Other archives**: `.cbr`, `.cb7`, `.cbt` are unpacked once by Atlas's core into a cached `.cbz` (zip, tar and 7z on
  every platform; a real RAR through the machine's `bsdtar`, `unar` or `unrar`).
- **Suwayomi** (`suwayomi.js`): the server's library, chapters and pages through Atlas's fetch, and what you read
  written back to the server. Behind a sign-in proxy, Atlas offers the sign-in.
- **On the phone**: a native reader (`android/`) takes a chapter handed over with `atlas.openNative` — a vault `.cbz`,
  a folder of pictures, or a Suwayomi chapter. It fetches pages in parallel, decodes them at the screen's size (JPEG
  XL included), keeps a memory cache and works only on the pages near where you are. The library stays the page's.

## Settings

- **Library folder** (`manga`): each folder in it is a series.
- **Suwayomi server**: `https://manga.example.org`; empty: none.
- **Reading mode** (right to left, left to right, vertical, webtoon), **Scale** (fit screen, width, height, original),
  **Tap zones**, **Invert tap zones**, **Volume keys turn pages**, **Background** (white, black, grey, automatic),
  **Show the page number**, **E-ink: flash on page change, every N pages** (1; 0 never).

## How it fits

- Archives are read in the page with the app's own zip reader (`atlas.zip`, plugin API 20).
- The catalog's **Anime & Manga** library is a different list: catalogued manga notes, not the files you read.

## Needs

Nothing for `.cbz`, `.cb7`, `.cbt` and picture folders; `bsdtar`, `unar` or `unrar` for a RAR. The helper
(`helper/helper.ts`) runs inside the core.

## Platforms

Linux works; Android works (`phone = true`, with the native reader); macOS, Windows and a server are untested.

## Status

Beta. Tests: the core's `convert::tests` (archive conversion), `thumbs::tests` (a chapter's first page as its cover)
and an end-to-end spec: Comics on the Libraries page, a series and the reader in the pane.
