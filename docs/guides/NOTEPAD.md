# Notepad — pen drawings on the Boox, natively

Excalidraw on the Boox should look like the native app as far as possible — or Atlas has its own app that saves in the
Excalidraw file format (2026-10-17) — with feature parity with Boox Notes, plus the best of Rnote, Excalidraw and the
Obsidian Excalidraw plugin, for a seamless fit with Atlas. This is that app: a native screen of the Atlas apps (Java, `crates/atlas-android/android/java/org/atlas/notepad/`) that opens `.excalidraw` files on an e-ink screen (a Boox, or the Boox app
anywhere); a phone and the desktop keep Excalidraw. It is part of the app itself, not a plugin: always there on an
e-ink screen, its settings in Settings → Drawing (`[draw]`) on every device (docs/refactor/REFACTOR-notepad-into-core.md).

## Using it

- **The toolbar** (one row, scrolled sideways on a narrow screen): ✕ · the drawing's name · **Pen** · the colour ·
  **Eraser** · **Lasso** · Undo / Redo · ‹ page › · **Pages**. A tap takes a tool in hand; a second tap on the tool in
  hand opens its menu (pens and width; whole strokes / part of strokes / clear page).
- **Pens**: Boox Notes' seven (ballpoint, fountain, brush, marker, square, pencil, charcoal), with the width formulas
  decoded from `libneo_pen.so`, from the openink engine of the boox_5c_re project (vendored as
  `crates/vendor/openink-stroke`, `scripts/dev/sync-openink.sh`), called through `Host.penInk`
  (`crates/atlas-android/src/ink.rs`). Each pen's width at the screen's dpi; the menu scales it.
- **Colours**: black, two greys, red, blue, green, orange, purple (Excalidraw's own values, so the desktop's palette shows
  them chosen). With a selection, the colour menu recolours it.
- **Shapes**: hold the pen still for half a second at the end of a stroke and it becomes a clean line, rectangle,
  ellipse or triangle (Boox Notes' gesture; the recogniser is open, in Rust: `crates/atlas-android/src/shape.rs`). By default
  **openink**'s recogniser snaps it (also polygons, arcs and arrows; the setting *Shape recogniser* picks Atlas's earlier one;
  `openink-shape` from the boox_5c_re repo, mapped in `shape_openink.rs`); its weights were trained partly on Google's
  Quick, Draw! dataset (CC BY 4.0), credited here as that licence asks. They
  are Excalidraw's own elements, so the desktop edits them as shapes. Off with the setting *Shapes from a held stroke*.
- **The line under the pen** is Onyx's instant ink (`Host.quickInk`), off while erasing, with the lasso, while fingers
  move the page and while a shape is snapped; the stroke's real ink replaces it at pen-up.
- **Erasers**: the pen's eraser end, its button, or **Eraser**: whole strokes, or **part of strokes** — only what it
  passes is taken, the rest of the stroke stays as its own strokes (Boox Notes' area eraser, Rnote's split eraser).
  Shapes, text and pictures go whole. **Clear this page** in the eraser's menu.
- **Shapes**: drag from corner to corner to draw a line, arrow, rectangle, ellipse, diamond or triangle (tap the
  button again to choose), in the pen's colour and about its width — Excalidraw's own elements.
  An arrow started or ended on a shape stays attached to it: move or resize the shape and the arrow follows.
  **XY axes** (Shapes → *Axes, positive* or *Axes, ±*): drag a box and the axes fill it, ticked on the paper's ruling,
  one group the desktop moves as one. Papers: blank, lines, grid, dots, fine grid, graph (a heavier line every five)
  and music staves.
- **Text**: tap the page to type a text there (the keyboard comes up), tap a text to change it, empty it to remove
  it; tap the button again for Small / Medium / Large / Very large (Excalidraw's sizes).
- **Favourites**: the pen menu's "Add this pen to the favourites" puts the pen, width and colour in hand as a dot on
  the toolbar (up to six); tap a dot to take that pen up, long press to remove it. Kept on the device, with the pen
  last used, which the next drawing opens with.
- **Pictures**: the picture button opens the system's picker (or, where there is a camera, offers a photo taken now); the picture lands in the middle of the view, already
  chosen, so the corner square sizes it. Stored in the drawing as Excalidraw stores pictures (made ≤ 1600 px).
- **Ruler**: pen menu → Show the ruler; move it with a finger, turn it by its knob; write along either long edge and
  the line comes out straight.
- **Scribble to erase**: scribble back and forth over strokes and they go (the setting "Scribble to erase").
- **Export**: Pages → Export writes the drawing as a PDF (every page, A4, with its paper) or the open page as a PNG,
  beside the drawing in the vault.
- **Lasso**: circle what to take (an item is taken when most of it is inside); drag inside the box (pen or finger) to
  move it, the square at its corner resizes it (proportions kept), the knob above it turns it (snaps to 15°);
  **Copy**, **Cut**, **Duplicate**, **Colour**, **Link** (to a note: its name, suggested from the vault as you type), **Delete**, **Done** on the bar over the page. Back puts the
  selection down. **Pages → Paste** puts what was copied at the same place on the page in view — another page, or
  another drawing.
- **Fingers**: two move and zoom the page; one swiped in from a side (15 %) turns it, as a reader, and otherwise moves nothing (a resting palm drags nothing); a short tap with two fingers undoes, with three redoes; a palm while
  the pen is down is ignored. One clean e-ink refresh after moving and after a page turn.
- **Links**: a tap on an element that carries a `[[note]]` link (made on the desktop, "Link to a note…") opens the note
  in Atlas, resolved from the drawing's folder as the desktop does (`atlasShell.link`).
- **Pages**: the web notepad's notebook (`ui/src/lib/draw-pages.ts`): A4 frames named "Page N", one under the other;
  ‹ › turn pages (fitted to the width), **Pages → New page** adds one under the last, **Pages → All pages…** shows them all small (tap to go, long press to
  move earlier / later, duplicate or delete; all undoable); a stroke belongs to the page it
  starts on (`frameId`), so a page embeds in a note as on the desktop. **Paper**: blank, lines, grid or dots per page
  (Boox Notes' templates), kept in the frame's `customData.atlasTemplate`; the setting *Paper of a new page*.
- **Everything else in the drawing is shown**: rectangles, ellipses, diamonds, lines, arrows, text and pictures made on
  the desktop are drawn as Excalidraw draws them (clean), and can be lassoed, moved, recoloured, duplicated and erased.

## The file

- Every stroke is a `freedraw` (points + pressures: every Excalidraw draws it), with `customData.openink = { pen,
  config[6], tilt, t }` — a stroke is a pure function of its samples and config, so a Boox redraws it exactly — and
  `customData.atlasPen` (ballpoint / fountain / highlighter) for the web notepad's outline. Strokes from elsewhere are
  drawn with the closest pen.
- Saving reads the file again and changes only what this screen did (items added, changed or erased, pages added or
  given a paper), each changed element where it stood: what the desktop or another device wrote meanwhile stays.
- **The companion note**: each save also writes `<name>.md` beside the drawing (PHILOSOPHY §1) — properties `drawing: [[x.excalidraw]]` and
  `pages: N`, the drawing embedded, its pages as links, the notes its elements link to (so they show the drawing in
  their backlinks) and its text. Atlas writes only between its two markers and those two properties; whatever you write
  around them stays. The same function writes it on a desktop save (`atlas_core::drawing_note`).

## Settings

In Settings → Drawing (`[draw]` in `.atlas/config.toml`, `DrawConfig` in `crates/atlas-core/src/config.rs`): *Pen at the start*, *Paper of a new page*, *Shapes from a held stroke*, *Shape recogniser*, *Scribble to erase*, and
the toolbar's defaults: *Start with the pen last used* (on: the last pen, width and colour win over the defaults),
*Pen width*, *Colour*, *Eraser* (whole strokes or part of strokes), *Shape* and *Text size at the start*.

The toolbar never scrolls: `fitBar` keeps it at full
size when it fits, else narrows every tool (≤ 36 dp, 2 dp padding), else drops the title too, on every size change
(a turn of the screen included). On a phone-narrow screen the tools show their icons only; the lasso bar is icons
only everywhere, each name a long-press tooltip.

## PDFs, links, the file picker

- **Insert → A PDF**: one page, or *the whole PDF*: a new notebook page per PDF page (≤ 60), the page fitted on it as a
  picture linked to `[[x.pdf#page=N]]`, all one undo step.
- **A PDF opened on the Boox** goes to the book reader (Books' `PdfView`), whose pen, text boxes and highlights are
  saved into the PDF's note, its `pdf-marks` block — the one store the desktop reads and writes too
  (docs/design/DESIGN-pdf-notes.md). An older `x.pdf.excalidraw` still opens here as a notebook until
  `atlas pdf-marks migrate` moves its ink into the note; no new one is made.
- **The file picker** (`FilePicker.java`, for links and PDFs): browse folder by folder, the recently chosen on top, or
  type to search the whole vault, names first, then folders.
- **Pages → Open in Excalidraw (all its tools)**: the drawing in the web editor this once (fills, stroke styles,
  fonts, the library, frames), for what the pen screen does not do.

## Shapes, arrows, the palm, the screen (2026-10-18)

- **Regular shapes**: whatever recogniser answers, its shape goes through `crates/atlas-android/src/regular.rs` — a box with
  sides within 15 % becomes a square, an ellipse with axes within 18 % a circle, a triangle with sides within 20 %
  equilateral (on a level base when nearly level), a 5–8-gon with sides within 25 % regular; lines and open paths
  (arrow shafts) go onto the axes and diagonals within 7°, boxes and ellipses level within 10°.
- **Arrows drawn in two strokes**: a nearly straight shaft, then a "V" whose point is at one of its ends with both
  barbs pointing back, is an arrow by plain geometry (`arrow.rs`), before either recogniser; the head may come up to
  2 s after the shaft. A one-stroke arrow is openink's to read.
- **Palm rejection**: a finger gesture is a palm — it moves nothing, and a pan it already made is undone — when the
  pen hovered or touched in the last 0.7 s (Onyx's pens report hovering about 1 cm above the glass), a pen is among
  its pointers, or the contact is wider than 15 mm. The pen still writes while the palm rests.
- **A PDF's pages are paper**: pictures of a PDF's pages (Insert → the whole PDF, a PDF opened to write on, or any
  picture linked `x.pdf#page=N`) are locked (Excalidraw's `locked`): the eraser, the scribble, the lasso and Clear page
  leave them; deleting the page takes it.
- **The screen never turns by itself** here: it is held as it opened, and the toolbar's turn button (and Pages →
  The screen button) lists the four ways: portrait, landscape, either upside down; File (the bar) copies the link, moves, deletes, exports.
- **Pages as a grid** (Rnote's layout): a new page takes the first free slot of a grid "Pages side by side" wide
  (setting, 2 by default; 1 is one under another); Pages → "Arrange the pages in a grid" moves an older drawing's
  pages, each with what is on it (one undo). A drawing is never rearranged unasked.
- **The picker**: "From the phone's gallery…" first, then the vault's pictures as a gallery of thumbnails; Insert →
  A picture uses it (a vault picture is linked, a gallery one copied into the drawing).
- **A server's vault** works as a phone's: Notepad stays on whatever the server makes of its manifest, and its saves
  made offline wait on the device and are sent later (`PendingWrites`), an HTTP refusal keeping them too.

## Not yet

Tried on the Boox itself (the emulator has seen round 2); handwriting to text (no open engine).
