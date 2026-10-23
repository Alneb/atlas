# Shared companion notes, hidden or shown, edited live (plan)

The requirements (2026-10-18):
- **All metadata in Markdown files**, never loose JSON or YAML files. Settings stay TOML; only the base things in
  `.atlas/` (the vault's own machinery) stay as they are.
- **The file explorer shows extensions; search does not**: search opens the original file or its Markdown note,
  whichever the note's property says — a PDF opens the PDF, and the viewer shows the notes inside.
- **Companion notes**: some are human-readable, with blocks that show the data; others are only metadata and hidden —
  a property says which. The vault stays neat: most companion notes are invisible and only hold the data plugin
  views show.
- **Several writers on one note**: several plugins and systems (the canvas, the phone apps' readers) use the same note
  without conflicting.
- **Live editing between devices**: with a server and a phone app, or two servers at once, notes are edited live and
  both devices see changes in real time over WebSockets — above all in Excalidraw, where the other device also sees a
  pointer where the pen is and strokes appear as on a drawing tablet.

## 1. One companion note per thing, with a declared face

A thing that is not markdown (a PDF, a book, a drawing, a mail, a film) has **one** companion note,
`<file>.md` beside it (or the note the feature names: a reference's `<key>.md`). Its properties say how it is met:

| property | values | meaning |
|---|---|---|
| `companion` | the file it is about (`[[chap_rg.pdf]]`) | marks the note as a companion; search folds the two into one hit |
| `opens` | `file` (default for PDFs, books, drawings, pictures) · `note` | what a search hit, a link chip, quick open open: the PDF (its viewer shows this note inside it) or the note |
| `shown` | `false` (default for a companion) · `true` | `false`: hidden — out of the file tree (unless "show hidden"), out of search as its own hit, out of Bases' "all notes"; still linkable, backlinked, indexed for the thing's hit. `true`: a readable note with blocks that draw the data |

Today's companions and where they go: the drawing note `<drawing>.md` (drawing_note.rs: pages list → hidden), the PDF
notes of the readers (`chap_rg.pdf.md`: hidden, shown inside the reader), a reference's `<key>.md` (shown: it is the
user's reading note), mail notes (shown), catalog items (shown). The explorer shows extensions; search and everything
else show names alone (memory: feedback_no_extensions.md).

## 2. Several writers, one note, no conflicts

Writers of the same companion: the PDF reader (progress, highlights), the notepad/canvas (ink pages), the phone
readers (books, manga), plugins (catalog refresh, Zotero sync), the user in the editor. Rules:

1. **Nobody writes the whole file** except the editor the user types in. A feature changes **its own properties** —
   `POST /api/frontmatter/edit` (frontmatter.rs `set_property`: one key's block replaced, the rest byte for byte) — or
   **its own section**, a fenced region it owns (`<!-- atlas:<owner> -->…<!-- /atlas:<owner> -->`, as the annotation
   export and the drawing note already do), through one core call `PUT /api/note/section {path, owner, text}`.
2. **Namespaced properties** for data only one feature reads (`reading_at`, `reading_progress` — the books session's
   names; `ink_pages`…); shared ones (`title`, `authors`, `cover`) have one owner, the others read them.
3. **The core serialises** edits to one file (a per-path lock in the server; the phone app's in-app core the same),
   re-reading the file under the lock, so two features editing different keys never lose each other's change; the
   editor's own save keeps its `base_mtime` guard and, when the file moved under it, merges (below) instead of failing.
4. Android's `VaultFiles` (local vault) gets the same two calls in Java (one helper), so a reader on the phone and the
   notepad on the same note cannot clobber each other offline either.

## 3. Live editing between devices (websockets)

The server already pushes file events over a websocket (`Event::Fs`). Live editing adds:

- **Notes**: a CRDT per open note (Yjs, `y-codemirror.next` in the editor; `yrs` in the Rust core so the server holds
  the document and writes the markdown file — the file stays the truth on disk). Devices with the note open join a
  room `doc:<path>` over the server's websocket; edits merge character by character; others' cursors and selections
  are shown with the device's name. A device offline keeps its updates and merges when back. Section and property
  edits of §2 go through the same document when it is open (so a reader's progress update and the user's typing merge).
- **Excalidraw**: its collaboration API (`updateScene` with element versions/`versionNonce`, `collaborators` with
  pointers). Elements merged by id + version (Excalidraw's own reconciliation); each device sends its **pointer and
  pen** (position, pressure, tool, button state, e-ink pen hover) ~30×/s while drawing, so the other screen shows a
  pointer where the pen is and the stroke growing as it is drawn — like a drawing tablet. The Boox notepad (native)
  speaks the same room protocol from Java (strokes as they are made, its pen position from PenInput).
- **Two servers** (the desktop's local core and a remote server both open on one vault): each core relays a room's updates to
  the other through the same websocket when both serve one vault (a vault's `remote` link), else the file sync merges.

## 4. Order of work

1. `companion` / `opens` / `shown` properties: the core's index and the explorer/search honour them; existing
   companions marked through their features (drawing_note.rs, the readers) — dry run, then a confirmation.
2. `PUT /api/note/section` + the per-path lock; the readers and the notepad moved onto it (their sessions' lanes:
   books, manga, notepad).
3. Live notes (Yjs/yrs rooms), then live drawings with pointers and pens, then the Boox notepad joining.

## Decisions (2026-10-18)

1. Hidden companions: **invisible, with a button to show them** → invisible in the tree and search, an explorer button
   shows them; a study of two real vaults' trees (what repeats: `x.pdf` + `x.pdf.md` + `x.pdf.excalidraw`,
   `<key>/<key>.md`, mail folders) before the change, so they look tidy without repetition. A mail note says so in a
   property (`type: email-thread` is there; `view: mail`) and opens in the mail's own reading view; the Email pane
   rewrite is still to do.
2. Live editing: **the same server first**, and the desktop's vault chooser gains what Android's has: add a server
   (its address, sign-in through Authelia in the browser), list its vaults, open one.

3. The tree study (2026-10-18): a large research vault repeats in three shapes — 1,050 mail attachment folders
   (`<mail> files/` beside `<mail>.md`), 64 folder notes (`refs/papers/<key>/<key>.md` beside the PDF in the same
   folder), drawing trios (`x.excalidraw` + `x.excalidraw.svg` + the companion `x.md`); a few `x.pdf.md`. A personal
   vault is small (notes/, files/). How to hide — **shape + property**: what is clearly derived folds
   by its shape with no file touched (`<mail> files/` under its mail), companion notes hide by `shown: false` written by
   their feature (new ones at once, existing ones through a dry-run regeneration approved first), and a "Show
   hidden" button in the explorer. Excalidraw's SVG exports go: the app renders drawings embedded anyway, and every
   file should render when embedded → `[draw] export_svg` goes (no `<drawing>.svg` written on save), an export on
   demand instead, the existing exports to the Trash through the drawings command (dry run first); every kind of file
   gets an embed (tables, audio/video, code, a file card for the rest). Folder notes: **"Folder is the note"** — a
   folder holding `<folder>.md` is one row in the tree: a click opens the note, the arrow shows the rest.

4. PDFs (2026-10-18): a PDF's notes had become an Excalidraw file with its own note, too much — one PDF had
   `chap_rg.md` (the Books reader's progress), `chap_rg.pdf.md` (drawing_note.rs's note of the ink, 121 page links),
   the paper note `anonchaprg.md`, and the ink `chap_rg.pdf.excalidraw`. Chosen: **one note + hidden ink**: a PDF has
   ONE companion note — the paper note when it is a reference, else `<name>.md` — holding the reading progress and
   `ink: [[x.pdf.excalidraw]]` as properties; a drawing that is a PDF's ink gets no drawing note; the `.excalidraw`
   stays (the ink itself) and hides under the PDF in the tree; existing extra notes merged through a dry run approved
   first, the old ones to the Trash.


## Done so far (2026-10-18)

- **A file's ink gets no note of its own**: `drawing_note::ink_of` (`chap.pdf.excalidraw` → `chap.pdf`, any file
  extension but md); `drawing_note::update` writes nothing for it — the desktop and the Boox notepad (JNI) alike.
- **`companion::entry_owner`**: a file inside a folder entry (a paper's folder, its note carrying `citekey`) belongs to
  that note; `POST /api/companion` with `find: true` says which note owns a file without making one (the readers look
  up where you are with it and write their own note shape only when they must).
- **`atlas companions [--apply]`** (`companion_tidy.rs`): what earlier versions left — a note of a file's ink, a
  reader's note beside the paper's (its reading place merged into the paper's note, unless the paper's is newer),
  drawings' `.svg` exports — listed, then copied to `.atlas/trash/<time>-companions/` and sent to the Trash. A note
  with anything written by a person in it is left. Run on two real vaults (8 and 1 files), confirmed, 2026-10-18; the
  trash was then cleaned (the vaults' `.atlas/trash/` emptied, the tidied files removed from the desktop
  Trash).
- **No SVG beside a drawing**: `[draw] export_svg` removed; "Drawing: export as SVG (beside it)" on demand.
- **Books and Manga on the one note** (04178ad): the plugin API `atlas.companion(path, {find})`; Books (web and Boox)
  keep where you are and highlights in the book's one note; Manga's `reading.json` became the series note's
  properties (`reading_chapter`, `reading_page`, `last_read`, `chapter_progress`, `reader_options`).
- **The tree** (ui/src/lib/tree-view.svelte.ts): satellites fold by shape (`<name> files/` beside `<name>.md`; a file's
  ink `x.pdf.excalidraw` / `x.cbz.ink.json`; a leftover `x.pdf.md`), a note with `shown: false` hides (the core's tree
  listing says `unshown`), a folder with its own note (`note` in the listing) is that note's row — its name opens the
  note, the chevron folds it, and the note leaves its children. The eye in the Files head ("Show hidden files")
  shows everything (per viewer). The phone's list folds the same, but keeps a folder's own note (a tap goes into a
  folder there).
- **Drawing notes are hidden companions**: a new one gets `shown: false`; the
  older ones get it through `atlas companions` (`Hide`).
- Still open: search giving one hit per thing (the PDF with its note's words, the drawing with its note's text),
  live editing (§3), the section API (§2).
- **Live drawings, step 1** (2026-10-18): `/api/live?path=…&name=…` (core live.rs) — a room per open file that relays each
  device's messages to the others, stamped with who sent them (`{"from", "m"}`), and says who comes and goes; the
  client (ui lib/live.ts) stays joined (reconnects). An Excalidraw pane shares itself (lib/draw-live.ts): the changed
  elements by version every ~60 ms, merged on the other side with Excalidraw's `reconcileElements`, out of the undo
  history; the pointer and the pen's down/up ~30×/s, drawn as a collaborator's cursor with the device's name
  ("desktop", "Boox"); a newcomer gets the whole scene. The pane says "Live · Boox" while another device is there;
  another device's save is merged in instead of reloading, and a save that crossed theirs (409) merges theirs and
  saves on top. Spec: draw-live.spec (two windows). The stroke shows growing while it is drawn: the element in
  progress (Excalidraw's `newElement`) goes ~20×/s as a draft, shown on the others as `live-draft-<device>` (marked
  `atlasDraft`, never saved nor sent on) until the finished stroke takes its place. **Still open**: the Boox's native notepad
  speaking the same room from Java (PenInput's samples), pictures (their files go through the saved drawing), and live
  notes (Yjs/yrs for text).
- **Live notes** (2026-10-18, lib/note-live.ts): a note's text is a Yjs document shared through its live room (the same
  relay; nothing new on the server): edits merge character by character (y-codemirror.next's `yCollab` on the editor),
  the other devices' cursors show with their names, "Live · desktop" on the pane. Joining: the first device seeds the
  document from the note's text under one fixed author (two that start together merge without doubling it); a later
  one asks those there (`sync1` → `sync2`) and takes their text before it edits (3 s without an answer: seeds itself).
  Each device keeps saving the file; a save that crossed another device's is saved on top (the shared text is the
  truth), and the file watcher does not reload under the shared text. `[editor] live` (Settings → Editor) turns live
  notes and drawings off. Spec: note-live (two windows, vim-aware typing). Still open: the Boox's native notepad in
  the room; two devices that first meet with different texts on disk (seeded apart) — rare, they should be told.
- **The Boox's notepad in the rooms** (2026-10-18): LiveSocket.java (the app's WebSocket client, `host.live`), the
  notepad's Scene sends its changed elements and its pen, takes the others' by version and draws their pens with
  names. Built and compiled; first run on the device still to do. Only for a vault on a server (rooms are per server).
