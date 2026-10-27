# Boox Notes → Atlas drawings

Imports the notes of the Boox Notes app (Onyx's knote2) as Excalidraw drawings — one Atlas page per Boox page, the pen
strokes with their own pressure, outlined crisply (`customData.atlasPen`, ui/src/lib/draw-ink.ts).

- **Where it reads**: Boox Notes' KSync tree, `/sdcard/.ksync` — readable without root. In the Atlas app on the Boox
  the default works as it is; on a computer, copy it first (`adb pull /sdcard/.ksync ~/boox-ksync`) and set
  "Where the notes are" to that folder.
- **Commands**: "Boox Notes: import every note as a drawing", "Boox Notes: import a note…".
- **Writes** `<folder>/Boox <date> <id>.excalidraw` (titles live in Boox Notes' private database, which the KSync tree
  does not carry: rename freely — the importer remembers the file). Imported again, a drawing still exactly as the
  importer wrote it is refreshed; one edited since is **kept** and said so, never overwritten.
- **Typed text** (Notes' text boxes, plain or rich): Excalidraw text in the box's place and width, at its size, in
  Excalidraw's plain sans — no bold, italic or underline there, so those are dropped (`ksync_text.py`, read from the
  decompiled knote2's `EditTextShape`/`ShapeTextStyle`). A **rich-text page** keeps its words in a ProseMirror JSON
  file under the note's `resource/data/` (named `.html`); it is laid out at Notes' WebView sizes (16 px text, 28 px
  padding, times the note's dpi / 160). Checked on a real rich-text page.
- **Lines and shapes** (the line and shape tools, knote2's UNIVERSAL shape 40): their geometry is a GeoJSON-like
  `extra.featureCollection` — `LineString` → an Excalidraw line, `Polygon` → a closed line, `MultiPoint` "Oval" → an
  ellipse, turned with the shape (`ksync_shapes.py`); another kind is counted as not converted.
- **Moves and pages as Notes shows them** — two fixes to the vendored decoder, marked "Atlas fix" in `ksync.py`:
  `matrixValues` (a lasso's move, scale or turn) is stored as `{"values": [...]}`, which the decoder read as no
  matrix, so every moved stroke stayed where it was first drawn; and each `virtual/page/pb` file is a delta (the pages
  added then), which the decoder read as the whole list, so earlier pages came last and in no order; a page record
  with field 5 = 1 is a deleted page, left out with its shapes.
- **Erased strokes stay erased**: a shape whose newest version is REMOVED (`shapeStatus` 1) is left out — the old
  vendored decoder drew them back (21 of 43 shapes on one of the user's notes).
- **Strokes as the Boox Notepad saves them**: each knote2 pen becomes openink's (the engine Atlas's Boox Notepad draws
  with; `convert.py` `OPENINK`, from knote2's decompiled `ShapeFactory` constants: 2 pencil and 3 oily → ballpoint,
  4 and 5 fountain, 21 brush, 15 marker, 22 charcoal, 47 / 60 / 61 square nib), kept in `customData.openink.pen` with
  each point's time; `strokeWidth` is knote2's width over the web outline (`outline`, the same formula as
  Stroke.java and draw-ink.ts), so the web draws it as wide as the Boox and the Notepad reads the width back exactly.
  Pressure is knote2's raw value over the shape's `maxPressure` — linear, as the Notepad stores it. Tilt is not
  decoded yet (KNOTE2.md reads its i16 as two bytes, unconfirmed): only the pencil and charcoal would use it.
- **Not converted** (counted in the result): pictures and any geometry kind not above; "reference" shapes are copies
  of a stroke shown on a neighbouring page and are left out on purpose.
- **Checked on 25 real notes** (a copy of a Boox's KSync tree): 21 578 strokes, 64 lines and shapes, one rich-text
  page, nothing skipped or failed; pages rendered beside Notes' own PDF exports match page for page, moved strokes
  and ovals included.
- **Files**: `ksync.py` — the decoder, vendored from boox_5c_re (docs/scripts/ksync_decode.py, commit c4fe711; format
  in its docs/KNOTE2.md) with the two fixes above; `ksync_text.py` — the text boxes the decoder leaves out;
  `ksync_shapes.py` — the lines and shapes it leaves out; `convert.py` — pure conversion; `helper.py` — reads, writes through
  Atlas, remembers what it wrote (`imports.json` in the plugin's cache); `test_convert.py` — `python3 test_convert.py`
  (the conversion, and the whole way from a KSync tree built on disk to a kept edit).
