# Rnote

Opens `.rnote` files (from the Rnote handwriting app) as Excalidraw drawings: a click on one converts it into an
`.excalidraw` beside it and opens that. The `.rnote` stays as it is, an input never edited. The conversion runs in the
page, so Rnote itself is not needed.

## What it adds

- **A click opens it** (`claims = ["*.rnote"]`): the pane converts the file, opens the drawing, and closes itself.
- Pen strokes keep their pressures; shapes, text, PNG pictures and SVG images (slides) come along. Whatever could not
  be converted is counted in the notice.
- Written as `name.excalidraw`, never over another file (`name (2).excalidraw` when taken); a drawing made from the
  same file before is reused.
- **Menus**: "Open as a drawing (Excalidraw)" on an `.rnote`; on a folder, "Convert the Rnote files here to drawings"
  (subfolders too, one summary at the end). The command **Open the Rnote file as a drawing**.

## Settings

None.

## How it fits

No requirements. The drawings it makes are ordinary Excalidraw files with Atlas's drawing features.

## Platforms

Linux works; macOS, Windows and a server are untested; not in the phone app.

## Status

Beta. Tests: `ui/tests/example-rnote.spec.ts`, `ui/tests/draw.spec.ts`. No unit tests.
