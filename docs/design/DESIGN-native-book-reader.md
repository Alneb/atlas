# The native book reader (Books plugin, Android side)

The user, 2026-10-18: *"the ebook reader also should be native right? it should be very personalizable like koreader
but with an actually not insane UX/UI"* · *"but make the UI/UX good, read some design guide or other open source
apps"*. Asked and answered the same day:

- **How the text is laid out → "Native shell + text view"**: every screen, menu, setting, page turn, the pen and the
  e-ink refreshes are native; each chapter's XHTML is laid out by a WebView that does nothing else (an EPUB is HTML and
  CSS: tables, ruby, pictures, footnotes come out right). A fully native text engine (KOReader's crengine) was offered
  and declined: months of CSS work before real books look right.
- **Which settings → all four groups**: typography; page and turning; per-book profiles; reading tools.

## What the good readers do (read before designing)

| App | What it gets right | What to avoid |
|---|---|---|
| **Apple Books** | the page is only text; one tap in the middle brings the chrome; "Themes & Settings" is one sheet: a row of themes (presets that carry font, size, spacing, colour) at the top, the text size as A− / A+ right there, "Customise" opens the rest; after a jump a "Back to page N" chip | few settings for power users |
| **Kindle** | the "Aa" sheet in tabs — Font, Layout, More (progress shown how, the clock) — and **Themes: "Save current settings"**, several of your own | presets overriding what you set by hand without saying so |
| **Foliate / Readest** (open source, Foliate's rewrite) | chrome that hides itself; a customisable footer (clock, time left in the chapter and the book, percent); footnotes in a popover; a location popover (jump to a page / chapter, reading-time estimates); dictionary and Wikipedia on the page; paginated or scrolled; per-theme colours | — |
| **Moon+ Reader** | settings placed where you need them; tap zones you can set (left-handed); position synced across devices | a crowded options screen |
| **KOReader** | everything can be set, per book; e-ink aware (refresh rate, no animation); the footer's many items; statistics | menus nested many levels deep in toolbar tabs, words like "Render mode" and "Embedded style" with no explanation: the "steep learning curve" users complain of (MobileRead, LWN) |
| **Mihon** (already followed by the manga reader) | tap zones as named presets (default, Kindle, edge, L-shaped…) with a picture; "flash on page change" for e-ink | — |

Material 3 (the app's frame): settings that change what is on screen go in a **bottom sheet with the page live behind
it** (the text reflows while you slide), not a separate settings screen; 48 dp targets; a slider for a continuous value
with its value shown; segmented buttons for 2–5 exclusive choices.

## The shape

**Library** — the books of the folder (setting `folder`, default `books/`), covers in a grid, "Continue reading" (the
last book, big) at the top; sort by recent / title / author; a book's long press: details (title, author, progress,
the note), open its note, mark read.

**Reading** — only the text, a slim footer (configurable) and nothing else. Taps: left / right turn (zones as Mihon's
presets, the manga reader's code), middle shows the chrome. Volume keys turn. On e-ink no animation, a calm refresh
every page and a full one every N (setting).

**The chrome** (a tap in the middle; another tap or a turn hides it):
- top: ‹ back · the book's title and chapter · search · bookmark this page (a ribbon, filled when marked);
- bottom: the slider over the whole book with ticks at chapters, "page 12 of 30 in this chapter · 34 %"; buttons
  **Contents** (TOC with where you are, bookmarks and highlights as tabs), **Aa** (the sheet below), **Notes** (open
  the book's note);
- after a jump (slider, contents, search, a link): a chip "Back to p. 12" for a few seconds.

**The Aa sheet** (bottom sheet, page live above it):
1. **Themes** — a row of cards drawn in their own look: *Original*, *Quiet* (sans, airy), *Paper* (serif, justified,
   hyphenated), *Bold* (heavier, larger), your own, and **+ Save these**. A theme carries every setting below. A card
   is marked when the settings match it; a change by hand un-marks it rather than silently overriding.
2. Text size: **A− [ 19 ] A+** (and the slider in "Text").
3. Tabs:
   - **Text** — font (the book's own · serif · sans · your fonts from `fonts/` in the vault), size, weight, line
     spacing, paragraph spacing, first-line indent, justified, hyphenation, the book's own styles (on/off, explained:
     "use the book's fonts, sizes and spacing").
   - **Page** — margins (one slider, or each side), two columns in landscape, paged / scrolled, colours (white,
     sepia, dark, black; on e-ink: white and black only).
   - **Turning** — tap zones (picture of the zones), invert, volume keys, full refresh every N pages (e-ink).
   - **Footer** — what it shows, in order: page in chapter, pages left in chapter, book percent, time, battery,
     chapter title; a preview line.
4. Bottom: **"For this book only"** switch — off: the settings are yours everywhere (the plugin's settings, the
   desktop's Settings shows the same); on: kept for this book (`reading.json`), shown with a "this book" badge and a
   "Use my usual settings" button.

**Selecting text** — a long press selects a word (handles to extend); a native bar: **Highlight · Note · Look up ·
Copy · Search**. Look up: the phone's dictionary apps (Android's "process text" — ColorDict, Aard, the Boox's own),
else Wikipedia's summary in a sheet. The pen: a line under or through words highlights them (the web reader's rule),
a bar down the margin highlights its lines; the eraser on a highlight removes it.

**Footnotes** — a link to a footnote (`epub:type="noteref"`, or a link into an aside / a notes file) opens its text in
a small sheet, not a jump.

## Where things are kept (one shape for the phone, the desktop and the server)

- **Your settings** → the plugin's settings (`plugin.toml` `[settings]` / the vault's settings store), edited from the
  sheet and from Settings alike (Host.saveSettings).
- **Themes you saved** → `<folder>/reading.json` `themes: [{ name, options }]`.
- **Where you are, per book** → `reading.json` `books[<path>] = { spine, at, updated }` (the web reader's shape),
  plus `options` (this book's own settings) and `bookmarks: [{ spine, at, label }]`. Writers keep every field they do
  not set (read again before each write).
- **Highlights and notes** → the book's companion note `<book>.md` (docs/PHILOSOPHY.md §1), appended as the web
  reader does: `> passage` / `> — chapter`, a note under it. The note is the user's; the reader marks the quoted
  passages when a chapter opens.
- **Statistics** (later) → `reading.json` `books[<path>].time` (seconds read, per day).

## Formats

Two kinds of book, one reader:
- **Reflowable** — laid out in your typography by the text view, highlights anchored to the text (`Doc`): **EPUB**
  (first), **MOBI / AZW3** (PalmDOC / KF8: the records decompressed into XHTML chapters), **FB2** (XML → XHTML), **plain
  text** (paragraphs → XHTML).
- **Fixed pages** — each page a picture, the pen writes on it: **PDF** (Android's PdfRenderer; pdf.js on the web),
  **DjVu** (needs a decoder: DjVuLibre built for Android, later), **comics** (CBZ: the manga plugin's).

**Built (2026-10-18, `Formats.java` + `MemDoc.java`)**: each non-EPUB book becomes a `MemDoc` — chapters as HTML entries
(`c<N>.html`, served as `text/html` so a Mobipocket's loose HTML parses) and pictures as `img/<id>` — and the reader
shows it exactly as an EPUB:
- **MOBI / AZW / PRC (Mobipocket)**: the Palm database's records; PalmDOC LZ77 decompressed, each record's trailing
  entries cut (the header's extra-data flags, calibre's rule); text in the header's encoding (UTF-8 or Windows-1252);
  chapters at `<mbp:pagebreak>`, named by their first heading or first short line; `<img recindex>` → the image
  records from the first-image index; title, author and cover from EXTH (100, 503, 201). Locked (DRM) and HUFF/CDIC
  books are refused with the reason.
- **AZW3 (KF8)**: the same records; the CSS flows after the last `</html>` dropped; chapters at each part's XML
  declaration; `kindle:embed:XXXX` → its picture; `kindle:pos` links made harmless (no target yet).
- **FB2 / .fb2.zip**: XmlPullParser; each top-level `<section>` a chapter, the notes body after them; title, authors,
  cover from `<title-info>`; `<binary>` pictures; FB2 elements mapped to HTML (title → h2, emphasis, strong, epigraph →
  blockquote, verse, empty-line, image, links with `type="note"` as noterefs).
- **Plain text**: UTF-8 (else Windows-1252); paragraphs at blank lines; chapters at heading lines ("Chapter 3",
  "CAPÍTULO IV", "Part One", a lone roman numeral), else every ~60 kB. Listed in the library; never taken from a note's
  own opening (`.txt` stays a note elsewhere).
- Checked on the host with calibre-made books (`ebook-convert` of a three-chapter Spanish test with a picture and a
  footnote): MOBI 4 chapters + contents, AZW3 3 chapters, TXT 3 chapters, pictures found; FB2 needs the device
  (android.util.Xml).
- **DjVu: not yet** — it needs DjVuLibre (C++) built with the NDK; **CBR** needs RAR (not in the platform). Comics as
  CBZ stay the manga plugin's.

**Also built then**: **footnotes** — a tap on a note's mark (EPUB 3 `noteref`, DPUB `doc-noteref`, or a short number /
star in superscript) shows the note's text over the page with "Go to the note" (same chapter: from the page; another
file: read from the book, `textById`); **search** — the top bar's search: a word or phrase, every place in the book
(chapter, a line around it), a tap opens it marked (marks.js `markFound`, counted the same way). A PDF and its notes can
be **merged into a new PDF** from Notepad's menu (`x (with notes).pdf`; the PDF itself untouched; pages rendered at
1600 px+).

## One paper

*"pdf's need to be coherently handled by both the notes app and the ebook app"* · *"merge the three native plugins
that use the pen into a coherent thing … while keeping their functions separate"* — answered: **shared core, three
plugins**, and for a fixed-page document's annotations **a companion drawing that links to it**:

- The app owns the paper: the pen engine (Notepad's), the page sources (blank, PDF, DjVu, comic pages), Onyx's ink,
  palm rejection (`PenInput`), ink over a page (`PageInk`). Notepad (write), Books (read) and Manga (comics) are faces.
- `x.pdf` → `x.pdf.excalidraw` beside it: one frame per page, linked to `[[x.pdf#page=N]]`, **no page picture in the
  file** — the page is drawn on the fly under the frame (PdfRenderer natively, pdf.js on the web); only what is on top
  is saved: ink, highlights, text notes. Notepad opening the PDF and the book reader opening it show the same file.
- Later, an option: merge the annotations into the PDF as standard annotations, or write into the PDF directly.

## Built in steps

1. Epub (container → OPF → spine, metadata, cover, nav / NCX) in Java; the library; the reader with the WebView laid
   out in columns, page turns, the footer, the chrome, the contents; where you are shared with the web reader.
1b. Linked PDF pages in the companion drawing (no copied pictures), natively and on the web; PDFs in the book reader
   through it; manga's ink moved to it.
2. The Aa sheet: themes, tabs, live preview, "For this book only".
3. Selection bar, highlights, look up, footnotes, bookmarks, search, the pen.
4. Statistics, two columns, your own fonts.


## Where it stands (2026-10-18)

- **Built** (088226b, d75e7af, e11912d's parent): EPUB reader (library, reader, chrome, contents, slider, "Back to…",
  Aa sheet with themes and "For this book only"); linked PDF pages (PageSource natively, pdf.js on the web; no copied
  pictures); PDFs in the book reader with Notepad's ink (`PdfView`), "Write on it" ↔ "The PDF in the reader".
- **Next**: selection bar (Highlight · Note · Look up · Copy · Search), highlights marked, footnote popups, bookmarks,
  search; the pen in the reflowed reader (PenInput → highlight); the footer's items; MOBI / AZW3, FB2, TXT; DjVu
  (a decoder); the PDF reader drawing the companion's text and shapes, not only its strokes; highlights and text notes
  on PDFs kept in the companion; "merge into the PDF" as an option; manga's `.ink.json` moved to a companion.
