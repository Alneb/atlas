# Catalog · Wikipedia

A Wikipedia page about a film, a series, an album, a song, a book, a manga or an artist is filed as that thing, not as
a web page. A subplugin of the Library (`catalog`).

- Wikipedia's own one-line description says what the page is about.
- The page's links give the IDs the other sources need (IMDb, MusicBrainz, Goodreads, AniList…), so they fill in the
  rest.
- Any language's Wikipedia; no key.

## Settings

- **Contact for Wikipedia** (optional): an e-mail or web address Wikipedia may reach you at; Wikimedia throttles
  programs that give none.

## Needs

The Library plugin (`requires = ["catalog"]`) and Python 3 on the machine running Atlas's server (`helper.py`;
standard library only). Requests go through Atlas's core.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`python3 test_helper.py` (Wikipedia summaries and pages, cut down).
