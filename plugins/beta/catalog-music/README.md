# Catalog · Music

Albums, songs and artists from any music link, filled in by MusicBrainz, with no key. A subplugin of the Library
(`catalog`).

- Recognised: Spotify, Bandcamp, Apple Music, Deezer, Tidal, Discogs, MusicBrainz and YouTube Music (album playlist)
  links.
- The page says what it is (read by `catalog-web`); MusicBrainz then gives the clean names, the first release year,
  genres, the label and the cover (Cover Art Archive), found by the link itself or by artist and title.
- MusicBrainz is asked at most once a second, as it asks of programs.

## Needs

The Catalog plugin (`requires = ["catalog"]`); nothing installed: the helper is JavaScript run inside Atlas's core (`helper.js`, built from `helper/helper.ts`). Requests go through Atlas's core.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`node scripts/dev/plugin-ui.mjs --check plugins/beta/catalog-music` (`helper/helper.test.ts`, offline).
