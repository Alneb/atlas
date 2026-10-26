# Catalog · Music

Albums, songs and artists from any music link, filled in by MusicBrainz, with no key. A subplugin of the Library
(`catalog`).

- Recognised: Spotify, Bandcamp, Apple Music, Deezer, Tidal, Discogs, MusicBrainz and YouTube Music (album playlist)
  links.
- The page says what it is (read by `catalog-web`); MusicBrainz then gives the clean names, the first release year,
  genres, the label and the cover (Cover Art Archive), found by the link itself or by artist and title.
- MusicBrainz is asked at most once a second, as it asks of programs.

## Needs

The Library plugin (`requires = ["catalog"]`) and Python 3 on the machine running Atlas's server (`helper.py`;
standard library only). Requests go through Atlas's core.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`python3 test_helper.py` (MusicBrainz's answers, cut down; offline).
