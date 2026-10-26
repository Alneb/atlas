# Catalog · TMDB

Films and series for the catalog, from The Movie Database: search, details, posters and credits. A subplugin of the
Library (`catalog`); it works through the catalog's capture and "Add to the catalog…".

- A themoviedb.org film or series link is recognised.
- A bare title ("Dune 2021") is searched and the matches offered to pick from — never filed on a guess.
- Details: title, year, overview, genres, director and cast, poster, runtime and the other IDs (IMDb, TVDB).
- A film in a language the vault keeps originals in (`original_title: [es]` in its kind) also gets its title in that
  language.
- Works without a key, from themoviedb.org's own pages; with a token the API is used, which is faster and adds the
  IMDb and TVDB ids.

## Settings

- **API Read Access Token** (optional, a secret): themoviedb.org → Settings → API.
- **Language** (`en-US`): titles and overviews in this language when TMDB has them (`es-ES`, `fr-FR`…).

## Needs

The Library plugin (`requires = ["catalog"]`) and Python 3 on the machine running Atlas's server (the helper,
`helper.py`; standard library only). Requests go through Atlas's core.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`python3 test_helper.py` (TMDB's answers, cut down).
