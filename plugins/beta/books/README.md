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
  properties the phone's native reader writes) and your **highlights**, kept as quotes at the end of the note's
  "## Highlights" section, each with its chapter and an anchor (`> — Title, chapter 4 <!-- atlas-hl k=1234 -->`, `k`
  the passage's place in the chapter's text): a phrase that occurs twice is marked where it was chosen, and only in its
  own chapter. Only quotes under that heading are highlights (your own quotes and callouts elsewhere are left alone);
  highlights written before the anchor are marked at their first occurrence, as before. A tap on a highlight in either
  reader offers *Remove* (its quote leaves the note). On the phone, a highlight in the Notes panel opens the book at it. An older `<folder>/reading.json` is still read for a book
  not yet moved.
- **Free ink** (Atlas with plugin API 30): **Pen** and **Eraser** in the reader's bar; each stroke is pinned to the
  character under its top left and kept in em, so it moves and scales with its words when the text reflows. Kept as
  `text-ink` marks in the book's note (the core's marks block); Ctrl+Z undoes, Esc puts the pen away. The phone's
  reader writes the same marks (docs/design/DESIGN-ebook-ink.md).
- **The audiobook** (the reader, on the desktop and the phone): when the book's note names its audiobook — the
  catalog's `audiobookshelf: <item id>`, or an `audiobook:` link to the item (`https://abs.example.org/item/<id>`) — and
  the Audiobookshelf plugin is on with its server set, the reader's bar has a **▶** that plays it through the app's one
  player (the Audiobookshelf plugin opens the session; on the phone its player opens over the reader, and Back comes
  back to the book). While the player holds the book, a row under the bar (on the phone, above the footer) shows play /
  pause, the time and the audio's chapter, with **Go to where the audio is** (the contents entry titled as the audio's
  chapter) and **Bring the audio here** (the audio from the chapter titled as the text's). Chapters meet by title,
  normalised: case, accents and punctuation aside, a leading "Chapter" dropped, and one title starting the other at a
  word's end ("Chapter 1" finds "1. Loomings", never "10. …"); a button whose chapter has no match is not shown, and
  with no audiobook plugin, no server or no audiobook named, there is no ▶. Within a chapter the two are not kept
  together yet.
- **The E-books library** (Libraries page, id `books`): the vault's EPUB, PDF and DjVu files under the library folder
  and the books in the server folders of the **Folders on a server** setting, grouped by folder; covers from Atlas's
  thumbnails (or the server's). A server's book is fetched when opened.
- **DjVu**: made once into a PDF in the plugin's cache by Atlas's core (djvu-rs: the pages as they are, the book's
  OCR text kept, so it can be searched and selected) and opened in Atlas's PDF viewer; the vault's file is never touched.
- **On the phone**: a native reader (`android/`, `[android]` in the manifest) opens EPUB, MOBI, AZW/AZW3, PRC, FB2;
  the library stays the page's, and hands a book over with `atlas.openNative`. PDFs open in its PDF reader (PDFium):
  **Contents** lists the PDF's own outline, the section you are in marked; every jump (contents, a link, find, the
  slider, a bookmark, the page strip) leaves a **Back to page N** chip for a few seconds, as the EPUB reader's "Back
  to" chapter. While the bars show, a **page strip** of small pictures runs along the bottom (drag it, tap a page).
  A **double tap** zooms to the text column under the finger (the core finds it, as for the desktop's double-click);
  **Find** shows its first match at once and counts on as it searches.
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
kept and scripts not run, the saved place) and the core's `convert::tests` (DjVu). Free ink: `ui/tests/books-ink.spec.ts`. The audiobook's chapter
matching: `ui/tests/books-audiobook.spec.ts` (`audiobook.js`) and the phone's `AudioChaptersTest` (`AudioChapters.java`),
on the same cases (`ui/tests/fixtures/audiobook-chapters.json`).
