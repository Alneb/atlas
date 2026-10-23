# Libraries everywhere: drawings, papers, comics, ebooks, audiobooks — on the desktop, the phone and the Boox

What the Android app should open on (2026-10-19): a **Library** item in its bottom bar showing every Excalidraw drawing as a library with filters, the notepad able to edit a drawing's properties so it can be filtered; then libraries of comics (including Suwayomi/Tachiyomi on the server), ebooks (including remote folders on the server) and audiobooks (integrated with Audiobookshelf — on the phone and the desktop, not the Boox). A work vault wants only the drawings library and the papers / science library; a leisure vault wants the rest. The desktop gets the same, respectively.

Decided before it: PDF notes live in the companion drawing; audiobooks from Audiobookshelf first, local files too. The review this builds on: docs/refactor/REFACTOR-core-to-plugins.md.

## The shape

- **A library is a `LibrarySource`** (`ui/src/lib/library.ts`, REFACTOR-libraries.md): items, tabs, groups, tags, covers, a detail with actions. One page draws any of them (`components/library/Library.svelte`).
- **New: a registry of libraries** (`ui/src/lib/libraries.svelte.ts`): the core and plugins **register** their sources (`atlas.registerLibrary({ id, title, icon, source })`) instead of each mounting its own page. The vault decides which show and in what order: `[ui] libraries = ["drawings", "references"]` (empty: every one its plugins give).
- **New: the Libraries page** (`panes/Libraries.svelte`, view `libraries`): the vault's libraries as tabs (a rail on a wide window), the chosen one drawn below; it remembers the last one. On the desktop a command and the side bar; **on Android a "Library" item in the bottom bar** (Home · Library · Files · Search · Settings).
- **Per vault, by its plugins and that setting**: a work vault — Drawings, References/science; a leisure vault — Drawings, the catalog (films, music…), Comics, Books, Audiobooks.

## The libraries

| Library | Items | Groups / tags / tabs | Cover | Open | Where it lives |
|---|---|---|---|---|---|
| **Drawings** | every `.excalidraw` that is a drawing (not a file's ink: `x.pdf.excalidraw` belongs to the PDF), with its companion note's properties (`x.excalidraw` → `x.md`, drawing_note.rs) | tabs: the top folder; groups: the note's `project` / `topics` links; tags: `tags` | its first page drawn (`sceneSvg`), only when near the view | the notepad (Boox) / the Excalidraw pane | the core today (Excalidraw is), the notepad plugin later (REFACTOR-core-to-plugins #2) |
| **References / science** | papers, books, theses, notes | Zotero collections | — | Read / Open PDF | `catalog-papers` (built-in `library` until step 4 of REFACTOR-libraries) |
| **Catalog** | films, albums, … | kinds as tabs, shelves | the kind's cover | the note | `catalog` |
| **Comics** | the vault's `.cbz` series + **Suwayomi** (a self-hosted Tachiyomi server, e.g. `manga.example.org`) | series, the server's categories | the series cover | the manga reader | `manga` (+ a Suwayomi source) |
| **Books** | the vault's books + **remote folders on the server** (copyparty / the explorer's file sources) | shelves | the book's cover | the books reader | `books` |
| **Audiobooks** | **Audiobookshelf** (e.g. `audiobooks.example.org`) first, then local `m4b`/`mp3` folders — phone and desktop, not the Boox | series, authors | ABS covers | a player (new): chapters, speed, sleep timer, position synced with ABS and kept in the book's note | a new `audiobooks` plugin (with `catalog-audiobookshelf`) |

## Editing a drawing's properties (the notepad)

The filters need something to filter: a drawing's companion note keeps the owner's own keys (drawing_note.rs writes only its own and the part between its markers). The notepad gets a **Properties** sheet (Android `NotepadView`; the desktop's notepad bar) editing that note's frontmatter: `tags`, `project`, `topics`, any key — the same property editor as notes, values completed from the vault.

## PDF notes: one store

Every device writes a PDF's notes and ink to its companion drawing `x.pdf.excalidraw` (the PDF is never modified); the desktop's PDF pane draws that drawing as a layer over its pages and its "highlights" go there; "Export with notes" still writes a flattened copy. The desktop's in-PDF annotations (`pdf-viewer.ts` `saveDocument`) stop.

**Built (2026-10-20):**

- **Shown** — `ui/src/lib/pdf-ink.ts` `attachPdfInk`: the companion drawing's page frames are found by their PDF page picture (`customData.atlasPage = { file, page }`, InkStore.java's layout); each page's ink — everything in its frame but the picture — is exported by Excalidraw as a see-through SVG cropped to the frame and laid over pdf.js's `.page[data-page-number=N]` (`img.atlas-ink`, `pointer-events: none`), drawn when pdf.js draws the page (`pagerendered`) and again when the drawing changes on disk (another device's save). Excalidraw is loaded only for a PDF that has a companion drawing.
- **Written** — `ui/src/lib/pdf-ink-save.ts` `writeMarks`: Ctrl+S in the PDF pane takes pdf.js's editors' marks (`annotationStorage.serializable`: ink 15, highlight 9, free text 3; marks on the PDF's own annotations — an `id` — are left out) and adds them to the companion: ink as freedraw lines, a highlight as a see-through box per quad (`customData.atlasHighlight = { page, mark, rect }`, the rect in PDF points so the passage can be read back), a text note as a text element. A page without a frame gets one where the Boox would put it (`addPageFrame`, InkStore `addPage`: four a row, A4's width; the picture's file id Java's `String.hashCode`, `javaHash`). The document is then opened again at the same place and the marks show from the drawing. The PDF is no longer written (`pdf-save.ts` and `Viewer.save` removed).
- **Read back** — `scripts/vault/pdf_annotations.py` (`Highlights into the note`) reads the companion after the PDF's own annotations (`companion_marks`): a highlight's passage under its boxes, text notes, one "handwritten mark" per inked page. Links are `[[x.pdf#page=N|p.N]]` (a drawing's mark has no PDF annotation id).
- Tests: `ui/tests/pdf-ink.spec.ts` (a one-page PDF made in the test; the layer over the page, redrawn on another save), `pdf-annotate.spec.ts` (Ctrl+S: the PDF byte for byte unchanged, the drawing holding ink, highlight and the page; the export finds the passage), `scripts/vault/tests/test_pdf_annotations.py` (the companion's marks).
- **Erased** — the pane's Eraser (E): a click takes the drawing's mark under it out (`eraseAt`: the smallest mark there, a line's box from its points; `isDeleted` with its version moved on, as Excalidraw deletes, so another device merging takes it out too).
- **Not yet**: moving a saved mark from the desktop pane (it is the drawing's: open `x.pdf.excalidraw`); "merge into the PDF" as an option (project_paper_core.md).


## Order of work

1. The registry, the Libraries page, `[ui] libraries`, the Drawings library; the catalog and References registered; Android's bottom-bar item.
2. The notepad's Properties sheet (Android native, desktop).
3. PDF notes in the companion drawing on the desktop (the PDF pane's layer). — DONE.
4. Comics: the manga plugin's source + Suwayomi (GraphQL behind Authelia: the plugin's fetch with the server sign-in).
5. Books: the books plugin's source + remote folders.
6. Audiobooks: Audiobookshelf's API (sign-in, libraries, items, progress), a player on the desktop and the phone; then local files.
7. The Android app polished as a reader first: open-with from other apps, files outside the vault.
