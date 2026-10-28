# Catalog · Audiobookshelf

Your Audiobookshelf audiobooks as book notes, and the audiobook beside any book you catalogue. A subplugin of the
Library (`catalog`).

- A book catalogued anywhere is looked up on your server (by its Audiobookshelf id, its ISBN, else its exact title);
  its note gets the narrator, the listening time and a link to the audiobook (and the book's own details when Open
  Library has none).
- `sync` files the server's book libraries as book notes, finished ones on the finished shelf. It runs every 6 hours,
  a slice each run (a big library spreads over a few runs), remembering what it filed.
- Nothing is asked without a server and a token.

## Settings

- **Audiobookshelf address**: where you open Audiobookshelf (`https://abs.example.org`).
- **API token** (a secret): Audiobookshelf → Settings → API Keys (newer versions), or Settings → Users → your user.
- **Shelf for finished audiobooks** (`[[read]]`): the status a finished book gets; empty leaves it as it is.

## Needs

An Audiobookshelf server and the Library plugin (`requires = ["catalog"]`). The helper runs inside Atlas's core
(`helper.js`, built from `helper/helper.ts`); nothing to install. Requests go through the core, which adds the token.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`node scripts/dev/plugin-ui.mjs --check plugins/beta/catalog-audiobookshelf` (Audiobookshelf's answers, cut down).
