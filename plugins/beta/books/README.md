# Books

An EPUB reader in your own typography, paged (always on an e-ink screen) or scrolled, that carries on from where you
left on any device; and the **E-books** library of the Libraries page: the books of a vault folder and of folders on
your file server. A `.epub` anywhere in the vault opens in it on a click.

## What it adds

- **The reader** (the plugin's pane; `claims = ["*.epub"]`): the book's chapters reflowed in your typography inside a
  sandboxed frame (a book's own scripts never run; its styles and pictures come along), paged by columns or scrolled;
  keys, taps and the e-ink refresh turn pages and run on into the next chapter. **Contents** from the EPUB's navigation,
  nested, with anchors: `[[book.epub#Chapter 3]]` opens at that entry. **Search the book** (`/`, Ctrl+F): every place
  the words occur, by chapter.
- **The book's note**: `book.epub` → `book.md` beside it, made through Atlas's companion-note rule (`book: [[…]]`,
  title, author). It keeps where you are (`progress`, `reading_chapter`, `reading_at`, `last_read` — the same
  properties the phone's native reader writes) and your **highlights**, appended as quotes under "Highlights" with the
  chapter; quoted passages are marked when the chapter opens. An older `<folder>/reading.json` is still read for a book
  not yet moved.
- **The E-books library** (Libraries page, id `books`): the vault's EPUB, PDF and DjVu files under the library folder
  and the books in the server folders of the **Folders on a server** setting, grouped by folder; covers from Atlas's
  thumbnails (or the server's). A server's book is fetched when opened.
- **DjVu**: made once into a PDF in the plugin's cache by Atlas's core (djvu-rs: the pages as they are, the book's
  OCR text kept, so it can be searched and selected) and opened in Atlas's PDF viewer; the vault's file is never touched.
- **On the phone**: a native reader (`android/`, `[android]` in the manifest) opens EPUB, MOBI, AZW/AZW3, PRC, FB2;
  the library stays the page's, and hands a book over with `atlas.openNative`.
- The command **Books: library** opens the E-books library; the reader's **‹ Library** goes back there. The pane is only
  the reader: books are listed in one place.

## Settings

- **Library folder** (`books`): every book in it (EPUB, PDF, MOBI, AZW3, FB2, TXT; subfolders too).
- **Folders on a server** (cards): **Server** (its name in copyparty's settings), **Folder** on it (`/data/Books`),
  **Through** (the plugin whose file source reaches it; empty: copyparty).
- The reader: **Font** (serif, sans-serif, the book's own, the app's), **Text size (px)** (19), **Line height**
  (1.55), **Side margins (px)** (28), **Justified text** (on), **Turning** (paged, scrolled).
- Used by the phone's native reader only: **Page colours**, **Text weight**, **Space between paragraphs**,
  **First-line indent**, **Hyphenation**, **The book's own styles**, **Tap zones**, **Inverted taps**, **Volume keys
  turn pages**, **Full e-ink refresh every N pages**, and **Your reading themes** (saved from the reader's Aa sheet).

## How it fits

- The EPUB is read in the page with the app's own zip reader (`atlas.zip`, plugin API 20).
- Server folders are read through another plugin's file source (copyparty by default).
- The catalog's **Books** library is a different list: catalogued book notes in `notes/books/`, not files.

## Needs

Nothing: EPUB is read in the page, DjVu converted by the core (the helper, `helper/helper.ts`, runs inside it).

## Platforms

Linux works; Android works (`phone = true`, with the native reader); macOS, Windows and a server are untested.

## Status

Beta. Tests: `ui/tests/example-books.spec.ts` (an EPUB built in the test: opened from E-books, paging, contents, styles
kept and scripts not run, the saved place) and the core's `convert::tests` (DjVu). Ink over a reflowed book is not supported (it needs fixed pages).
