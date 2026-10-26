# Rnote

Opens `.rnote` files as Excalidraw drawings: clicking one converts it into an `.excalidraw` beside it and opens that.
The `.rnote` stays as it is, an input that is never edited. The conversion runs in the page, so Rnote itself is not
needed.

- Pen strokes keep their own pressures; shapes, text, pictures (PNG) and vector images (SVG, e.g. slides) come along.
  Whatever could not be converted is counted in the notice.
- Written as `name.excalidraw`, never over another file (`name (2).excalidraw` when the name is taken); a drawing made
  from the same file before is reused instead of made again.
- In a file's right-click menu: "Open as a drawing (Excalidraw)"; on a folder, "Convert the Rnote files here to
  drawings" (its subfolders too, nothing opened, one summary at the end). Also the command "Open the Rnote file as a
  drawing".

## Settings

None.

## Needs

Nothing.

## Platforms

Linux works; macOS, Windows and a server are untested; not in the phone app (no `phone = true`).

## Tests

`ui/tests/example-rnote.spec.ts` and `ui/tests/draw.spec.ts`.
