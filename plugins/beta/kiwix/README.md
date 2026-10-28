# Kiwix

Your [kiwix-serve](https://kiwix.org)'s offline library — Wikipedia, Wiktionary, Stack Exchange sites, DevDocs, any
`.zim` archive it serves — searched from a pane of Atlas. Copy the folder into a vault's `.atlas/plugins/`, set the
server's address in Settings → Plugins → Kiwix, then run **Kiwix: search the offline library** (or its rail button).

| file | what it is |
|---|---|
| `plugin.toml` | the manifest: the address, the books to offer, `net = ["*"]` (the address is a setting) |
| `main.js` | the command that opens the pane |
| `view.js` | the pane: kiwix-serve's own HTTP API through `atlas.fetch` (the core makes the request: no CORS) |

The pane:

- **A book**: the server's catalog (`/catalog/v2/entries`, OPDS), narrowed to the books whose name or title holds one
  of the words of **Books to offer** (`wikipedia, wiktionary`; empty: all). The book chosen is kept per device.
- **Titles while typing**: `/suggest?content=<book>&term=…` — the articles whose title starts so.
- **The full text on Enter**: `/search?content=<book>&pattern=…&format=xml` — the first 25 hits with their snippets.
- **An article** is a link to `<server>/content/<book>/<path>`: Atlas opens it as any web page (a tab, as
  `[web] open_links` says), read on the server as kiwix-serve renders it.
- **Save** captures the article's address, as the capture box would; the catalog (with `catalog-web`) files it as a
  note with the page's readable text. The archive itself stays on the server.

A sign-in in front of the server (Authelia and the like) is offered by Atlas; the pane says to sign in first.

Not done: one search over several books at once (libkiwix's `books.id=` filters), the library's thumbnails, reading an
article inside the pane.

Tests: `ui/tests/example-kiwix.spec.ts` against a stand-in kiwix-serve written in the spec.
