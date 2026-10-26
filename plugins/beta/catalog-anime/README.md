# Catalog · Manga and anime

Manga and anime for the catalog from AniList, MyAnimeList and MangaDex links, filled in by AniList, with no key. A
subplugin of the Library (`catalog`).

- Recognised: AniList manga and anime links, MyAnimeList manga and anime links, MangaDex title links (matched to
  AniList through the links MangaDex keeps).
- AniList gives the title and the original one, the author or studio, the first year, chapters, volumes or episodes,
  whether it is still coming out, genres, the description and the cover.

## Needs

The Library plugin (`requires = ["catalog"]`) and Python 3 on the machine running Atlas's server (`helper.py`;
standard library only). Requests go through Atlas's core to `graphql.anilist.co` and `api.mangadex.org`.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`python3 test_helper.py` (AniList's and MangaDex's answers, cut down).
