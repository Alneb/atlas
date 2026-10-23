# Books — an EPUB library and reader

The design: docs/design/DESIGN-pen-eink-reader.md.

- **Library**: every `.epub` under the library folder (setting `folder`, default `books/`, subfolders included), with
  its cover, title and author from the book's package; the books you read most recently first.
- **Reader**: the book's chapters reflowed in your typography (font, size, line height, side margins, justified) inside a
  **sandboxed frame** — a book's own scripts never run, its stylesheets and pictures come along (as blob URLs, also the
  `url(...)`s inside its CSS). **Paged** by CSS columns (always on e-ink, with a full refresh every few pages, as Mihon's
  "flash on page change") or **scrolled**; arrows / Page Up / Page Down / Space / taps on the sides turn pages and run on
  into the next or previous chapter. **Contents** from the EPUB 3 nav (or the EPUB 2 NCX), with nesting and `#anchors`;
  links inside the book are followed inside it, web links open outside.
- **Where you are**: `<folder>/reading.json` — `{ books: { <path>: { spine, at, updated } }, last }` (`at`: how far into
  the chapter, 0–1) — read again before each write, so another device's progress is kept; the phone and the desktop
  carry on from each other (same shape as the manga plugin's).
- **A click opens it here** (`claims = ["*.epub"]`, plugin API 7): an `.epub` anywhere in the vault opens straight in the reader from the file tree, a link or the palette (a vault rule in Settings → Files & search → Open with wins); `[[book.epub#Chapter 3]]` opens at that entry of the contents.
- **Highlights → the book's note** (docs/PHILOSOPHY.md §1, a companion note for what is not Markdown): select a passage,
  **Highlight** — it is appended to `<book>.md` beside the book (made the first time with `book: [[x.epub]]`, title and
  author as properties, a "Highlights" heading) as `> passage` / `> — <chapter label>, chapter N`. The note is yours:
  write around the quotes, link it, search it; the reader only appends, and marks every quoted passage when a chapter
  opens (also across elements; on e-ink an underline instead of a tint). Reflowed text has no fixed pages, which is why
  annotations are anchored to the text, not to positions.
- **Search the book** (**Search**, or `/` / Ctrl+F in the reader): every place the words occur, in every chapter (any
  case, whitespace as one space), listed under the chapter's name with a line around each; a click opens that chapter
  at the page of the find, marked (`mark.atlas-found`, outlined on e-ink). Each chapter's text is read once per opening
  (`chapterDoc` + `textMap`, the same text the reader shows, so the n-th find in the list is the n-th in the page).
- Two highlights in one paragraph are both marked: passages are wrapped from the last to the first (wrapping splits
  the text, and front to back the second was looked for where the text had been).
- Not yet: pen ink over a book (reflowed text moves under it: ink needs fixed pages — PDFs, comics), a native Android
  screen (the web pane is used in the apps), removing a highlight from the reader (delete it in the note).
- Test: `ui/tests/example-books.spec.ts` (an EPUB built in the test: library, paging, contents with an anchor, the book's
  CSS kept and its script not run, the saved place).
