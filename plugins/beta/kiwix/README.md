# Kiwix

Your kiwix-serve's offline library — Wikipedia, Wiktionary, Stack Exchange sites, DevDocs, any `.zim` archive it serves
— searched from a pane of Atlas. An article opens as a web page; **Save** captures its address, which the catalog files
as a note. The archives stay on the server.

## What it adds

- **The Kiwix pane** (a left-bar tile, the command **Kiwix: search the offline library**):
  - **a book**: the server's catalog (`/catalog/v2/entries`), narrowed by the **Books to offer** words; the chosen
    book is remembered per device;
  - **titles while typing** (`/suggest`), and **the full text on Enter** (`/search`, the first 25 hits with snippets);
  - **an article** opens at `<server>/content/<book>/<path>` as any web page (a tab of Atlas, as `[web] open_links`
    says);
  - **Save** captures the article's address, as the capture box would.
- A sign-in in front of the server (Authelia and the like) is offered by Atlas; the pane says to sign in first.

## Settings

- **Kiwix address**: `https://wiki.example.org`, where you open kiwix-serve.
- **Books to offer**: words a book's name or title must contain, comma-separated (`wikipedia, wiktionary`); empty:
  every book.

## How it fits

No requirements. With the catalog on (and its "Read the page a link points to"), a saved article becomes a web-page note with its readable
text.

## Platforms

Linux works; Android works (`phone = true`); the others are untested.

## Status

Beta. Test: `ui/tests/example-kiwix.spec.ts` against a stand-in kiwix-serve. Not done: one search over several books,
the library's thumbnails, reading an article inside the pane.
