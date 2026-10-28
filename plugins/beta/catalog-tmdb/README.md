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

The Catalog plugin (`requires = ["catalog"]`); nothing installed: the helper is JavaScript run inside Atlas's core
(`helper.js`, built from `helper/helper.ts`). Requests go through Atlas's core.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`node scripts/dev/plugin-ui.mjs --check plugins/beta/catalog-tmdb` (`helper/helper.test.ts`, offline).
