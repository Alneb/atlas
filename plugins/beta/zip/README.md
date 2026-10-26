# Zip archives

A library other plugins use: reads zip archives in the page. It has no pane, no command and no `main.js`; Books (EPUB)
and Manga (CBZ) import it and declare `requires = ["zip"]` (`docs/guides/PLUGIN-API.md`, "Sharing a module between
plugins").

- `zipIndex(buf)`: every entry of a zip (an `ArrayBuffer`), read once from its central directory.
- `zipBlob(buf, entry, type)`: one entry's bytes as a Blob, inflated on demand with the browser's
  `DecompressionStream`.
- Stored and deflated entries are read; ZIP64 is not.

```js
import { zipIndex, zipBlob } from "../zip/zip.js";
```

## Settings

None.

## Needs

Nothing.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Tests

Through the plugins that use it: `ui/tests/example-books.spec.ts`, `ui/tests/example-manga.spec.ts`,
`ui/tests/plugin-assets.spec.ts`.
