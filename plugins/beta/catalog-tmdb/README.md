# Catalog · TMDB

Films and series for the catalog, from The Movie Database: a themoviedb.org link is recognised; a bare title
("Dune 2021") is searched and the matches offered to pick from; details come with the credits (director, cast),
genres, poster, runtime and the other IDs (IMDb, TVDB). A film whose language the vault keeps originals in (the kind's
`original_title`) also gets its title in that language.

## What it adds

- `[contributes.catalog]`: patterns for `themoviedb.org/movie/<id>` (film) and `themoviedb.org/tv/<id>` (series); a
  recogniser (the `search` tool, asked when no pattern matched); a source for `movie` and `show` (the `details` tool,
  priority 70, needs a TMDB or IMDb id).
- Tools: `search` (titles matching the words, a year narrowing it) and `details`.

## Settings

- **API Read Access Token** (optional, a secret): without it the film and series pages on themoviedb.org are read.
  With it (themoviedb.org → Settings → API) answers are faster and include the IMDb and TVDB ids.
- **Language** (`en-US`): titles and overviews in this language when TMDB has them (`es-ES`, `fr-FR`…).

## How it fits

`requires = ["catalog"]`. Works alongside Letterboxd and Wikipedia for films; IMDb links are recognised by
`catalog-letterboxd`.

## Platforms

Linux works; the others are untested. The helper is JavaScript run inside Atlas's core.

## Status

Beta. Unit tests in `helper/helper.test.ts` (`node scripts/dev/plugin-ui.mjs --check plugins/beta/catalog-tmdb`).
A search with several matches can be picked from only in the `catalog.collections` block for now.
