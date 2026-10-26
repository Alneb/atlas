# Catalog · Books

Books for the catalog, filled in by Open Library, with no key. A subplugin of the Library (`catalog`).

- Recognised: an ISBN (typed, pasted, or on a page), an Open Library work or edition link, a Goodreads book link.
- Open Library gives the title, the authors, the first year, the pages, the publisher, subjects as genres, the
  description and the cover.
- A book whose subjects are physics, mathematics, a science or a textbook (never science fiction) is a science book,
  kept in its own library.

## Needs

The Library plugin (`requires = ["catalog"]`) and Python 3 on the machine running Atlas's server (`helper.py`;
standard library only). Requests go through Atlas's core.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`python3 test_helper.py` (Open Library's answers, cut down).
