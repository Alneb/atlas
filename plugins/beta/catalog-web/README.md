# Catalog · Web pages

Any web page into the catalog: what the page says about itself (title, author, date, cover, its kind and the IDs it
names) and its readable text. A subplugin of the Library (`catalog`); it has no settings and no pane of its own.

- One more, low-priority source for every kind, used whenever a link is captured.
- The page is read by Atlas's core (`POST /api/clip`): OpenGraph, Twitter cards, JSON-LD, `citation_*` tags, and its
  readable text as Markdown.
- A page that turns out to be a film or a video re-kinds the capture; any other link is filed as a web page.
- No program of its own: the manifest is all there is.

## Needs

The Library plugin (`requires = ["catalog"]`).

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

None of its own; the page reading is tested with the catalog's engine (`cargo test -p atlas-catalog`).
