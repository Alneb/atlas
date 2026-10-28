# Catalog · Manga and anime

Manga and anime for the catalog from AniList, MyAnimeList and MangaDex links, filled in by AniList, with no key. A
subplugin of the Library (`catalog`).

- Recognised: AniList manga and anime links, MyAnimeList manga and anime links, MangaDex title links (matched to
  AniList through the links MangaDex keeps).
- AniList gives the title and the original one, the author or studio, the first year, chapters, volumes or episodes,
  whether it is still coming out, genres, the description and the cover.

## Needs

The Catalog plugin (`requires = ["catalog"]`); nothing installed: the helper is JavaScript run inside Atlas's core (`helper.js`, built from `helper/helper.ts`). Requests go through Atlas's core to `graphql.anilist.co` and `api.mangadex.org`.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`node scripts/dev/plugin-ui.mjs --check plugins/beta/catalog-anime` (`helper/helper.test.ts`, offline).
