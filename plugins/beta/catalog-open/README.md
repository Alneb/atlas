# Catalog · Open sources

The catalog's sources that need no account, in one plugin. Each is a source of its own and can be left out in the
settings:

- **anime** — manga and anime from an AniList, MyAnimeList or MangaDex link. AniList gives the title and the original
  one, the author or studio, the first year, chapters, volumes or episodes, whether it is still coming out, genres, the
  description and the cover. A MangaDex title is matched to AniList through the links MangaDex keeps.
- **books** — a book by ISBN (typed, pasted, or in a link), an Open Library link or a Goodreads link. Open Library gives
  the title, the authors, the first year, the pages, the publisher, subjects as genres, the description and the cover.
  A book whose subjects are physics, mathematics, a science or a textbook (never science fiction) is filed as a
  **science book**, in its own library.
- **music** — albums, songs and artists from a Bandcamp, Spotify, Apple Music, Deezer, Tidal, Discogs, MusicBrainz or
  YouTube Music (album playlist) link. MusicBrainz gives the clean names, the first release year, genres, the label and
  the cover (Cover Art Archive), found by the link itself or by the artist and title the linked page gave. MusicBrainz
  is asked at most once a second, as it asks.
- **youtube** — YouTube videos and YouTube Music songs. A link is recognised by its shape (`youtu.be`, `watch`,
  `shorts`, `live`, `embed`, `music.youtube.com`), kept as its clean watch address (no `?si=` or other tracking), and
  filled in from YouTube's oEmbed: title, channel, the largest thumbnail. A YouTube Music link is a song, its artist
  the channel without " - Topic". The clean address is what a downloader is handed.
- **wikipedia** — a Wikipedia page about a film, a series, an album, a song, a book, a manga or a band is filed as that
  thing, not as a web page. Wikipedia's own one-line description says what it is, and the page's links give the IDs the
  other sources need (IMDb, MusicBrainz, Open Library, AniList…). Any language's Wikipedia; not Wikidata.

## What it adds

- `[contributes.catalog]`: 30 link patterns (anime 5, books 5, music 17, YouTube 3); four sources — `anime` for manga
  and anime, `books` for books and science books, `music` for albums, songs and artists (priority 65 each), `youtube`
  for videos and songs (priority 60); and the `wikipedia` recognizer, asked when no pattern recognised the text.
- One tool per source: `anime`, `books`, `music`, `youtube` (`{ kind, ids?, url?, hints? }` → the catalog's fields) and
  `wikipedia` (`{ text, url? }` → candidates with their kind and IDs).

## Settings

- **Sources** — the sources used, among `anime`, `books`, `music`, `wikipedia` and `youtube` (all of them by default).
  One left out is never asked: its links are still recognised as what they are, and the note gets what the linked page
  and the other sources say.
- **Contact for Wikipedia** (optional) — an email or web address sent in the request's user agent; Wikimedia throttles
  programs that give none.

## How it fits

`requires = ["catalog"]`. It replaces the five plugins it was made of (`catalog-anime`, `catalog-books`,
`catalog-music`, `catalog-wikipedia`, `catalog-youtube`): installing it carries their settings over and moves their
folders to `.atlas/trash/` (`replaces`, PLUGIN-API.md). Music works best with the catalog reading the linked page: the
page names the artist and title MusicBrainz is then searched by. Audiobookshelf adds the narrator and listening time to
the same book notes; Downloader acts on the videos and songs it files.

## Platforms

Linux works; the others are untested. The helper is JavaScript run inside Atlas's core (`helper/`, built into
`helper.js` by `scripts/dev/plugin-ui.mjs`).

## Status

Beta. Unit tests per source in `helper/<source>.test.ts`, and the `sources` setting in `helper/helper.test.ts`.
