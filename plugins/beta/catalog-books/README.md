# Catalog · Books

Books for the catalog, filled in by Open Library, with no key. A subplugin of the Library (`catalog`).

- Recognised: an ISBN (typed, pasted, or on a page), an Open Library work or edition link, a Goodreads book link.
- Open Library gives the title, the authors, the first year, the pages, the publisher, subjects as genres, the
  description and the cover.
- A book whose subjects are physics, mathematics, a science or a textbook (never science fiction) is a science book,
  kept in its own library.

## Needs

The Catalog plugin (`requires = ["catalog"]`); nothing installed: the helper is JavaScript run inside Atlas's core (`helper.js`, built from `helper/helper.ts`). Requests go through Atlas's core.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`node scripts/dev/plugin-ui.mjs --check plugins/beta/catalog-books` (`helper/helper.test.ts`, offline).
