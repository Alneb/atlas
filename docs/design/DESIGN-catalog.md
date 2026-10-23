# Capture and catalog (design, 2026-10-15)

## What was asked

A capture-and-catalog system (2026-10-15). Papers should be detected and routed through the Zotero plugin, and the clip
and Zotero plugins are related: rather than separate libraries (music, YouTube, films…), they merge or at least
interact, expanded to work for anything — any website, with templates for many sites (YouTube, Letterboxd, IMDb, TVDB,
Wikipedia…). Some sources relate to plugins for services on your own server, and the aim is fully automated and
synchronised: a film gets metadata from Letterboxd, IMDb or Jellyfin, links to Jellyfin, and syncs its review to or from
Letterboxd. That is only an example; the system must be very general (Last.fm, ListenBrainz, MusicBrainz, Discogs,
Bandcamp…), and include the existing one for scientific literature. Automation matters most, with a powerful,
good-looking UI and UX that allows many things.

The same wish earlier (2026-10-14): *collections — movies, music, manga, books — organised with data from the internet and from the server (Jellyfin, audiobookshelf, Suwayomi, TubeArchivist…), automated as far as possible, as plugins.*

**Today's answer to the question**: no — a paper's address pasted into a capture box is captured as text; the clip plugin makes a web-page note and saves it to Linkwarden; the Zotero sync makes paper notes only for what is already in Zotero. Nothing recognises *what* a link is and routes it. This design is that missing piece.

## The idea in one paragraph

One **capture-and-catalog system**: anything — a link, a file, an ID, a title — goes in through one door (the capture window, the capture bar, the browser clip, a drop, an agent's tool, a sync); it is **recognised** (this URL is a Letterboxd film, that DOI is a paper, this is a Bandcamp album); its **metadata is fetched** from the best sources and merged; it becomes **a note of its kind** in its library folder (PHILOSOPHY §1: a companion note — properties + a block that shows the thing), deduplicated by its external IDs; and it stays **synchronised** with the services it lives in (the Jellyfin item, the Letterboxd review, the Zotero entry, the ListenBrainz scrobbles), automatically and on a schedule. Libraries are views over those notes — grids of covers, tables, filters — not separate databases. Papers are one kind among many: the Zotero plugin becomes the paper kind's source and sync, the clip plugin the generic web kind.

## The pieces

| Piece | What it is | Today |
|---|---|---|
| **Kind** | a declared type: `movie`, `show`, `episode`, `album`, `track`, `artist`, `book`, `manga`, `video` (YouTube), `paper`, `article` (any web page), `place`, `person`… — its folder, its properties (from the property spec, `templates/properties.yaml`), its note template, its block, which IDs identify it (`imdb`, `tmdb`, `musicbrainz`, `doi`, `isbn`, `youtube`…) | papers only (`refs/papers`, the reading note) |
| **Recogniser** | URL / text → (kind, IDs): `letterboxd.com/film/<slug>` → movie; `youtube.com/watch?v=` → video; `doi.org/10.…` / arXiv → paper; `bandcamp.com/album/` → album; anything else → article | none |
| **Source** | (kind, IDs) → metadata, merged by priority: TMDB / IMDb / Letterboxd / Wikidata for films; MusicBrainz / Discogs / Bandcamp for music; YouTube's oEmbed / yt-dlp for videos; Crossref / arXiv / Zotero for papers; OpenGraph + JSON-LD + readability for any page; Wikipedia for a summary | Zotero (papers); the clip plugin (OpenGraph + readability) |
| **Link / sync** | a service that holds the same thing: Jellyfin (the file, watched state, a link to play it), Letterboxd (diary, rating, review — read by RSS; writing as far as the site allows), ListenBrainz / Last.fm (scrobbles, loves), TubeArchivist (the archived video), Audiobookshelf, Suwayomi, Immich, Linkwarden (every captured link), Zotero (papers) | Zotero → notes; clip → Linkwarden |
| **Library** | a view over the notes of a kind: covers grid, table, filters (genre, year, watched, rating), sorting, grouping — the Library pane for papers, generalised | the papers Library |
| **Door** | where things come in: the capture window and bar (a URL pasted → a preview card "Add film *Dune* (2021) — Letterboxd, TMDB" with the kind's fields, Enter adds), the browser clip, a drop on a library, an MCP tool (`catalog_add`), a sync (a new Jellyfin item, a new Letterboxd diary entry, a paper added in Zotero) | text capture; clip; Zotero sync |

## How it is built (Atlas's way: files, blocks, commands, plugins)

The shape (2026-10-15): one meta plugin, and subplugins for the different systems.

- **A meta plugin, `catalog`**, and **subplugins for the different systems** (`catalog-tmdb`, `catalog-letterboxd`, `catalog-jellyfin`, `catalog-musicbrainz`, `catalog-youtube`, `catalog-zotero`, `catalog-web` (today's clip), …). The meta plugin owns what is shared: the kinds, the router (recognise → fetch → merge → write), merging field by field by the kind's source priority, deduplication (an index of external IDs → note), note writing (only through this path — PHILOSOPHY §2), schedules, the capture preview card, the library and item blocks. A subplugin declares `requires = ["catalog"]` and what it contributes — `[[recognizer]]` (URL patterns → kind + IDs), `[[source]]` (kind → metadata), `[[link]]` (a service holding the item: its URL, its state, a sync) — served by its helper (`recognize(text)`, `fetch(kind, ids)`, `sync(note)`), like `[[tool]]` today. Switching a subplugin on or off adds or removes one system; nothing else changes.
- What the plugin system needs for this: a plugin naming another as required (load order, a clear message when it is missing), and a plugin offering an API to the plugins that require it (the meta plugin's `register` gets the subplugins' declarations).
- **Kinds are files** (`.atlas/kinds/*.yaml` or the property spec): a vault declares the kinds it wants (the PhD vault: paper, article; the personal vault: movie, show, album, video, book, manga…).
- **The note**: `<library>/<title (year)>.md` with properties (title, year, ids, cover, rating, status, links to each service) and the kind's block (`catalog.item`: cover, facts, the services' links and states, actions: refresh, sync now, open in Jellyfin, rate). The user's own text below it is never overwritten; a refresh rewrites only the properties it owns.
- **Libraries are blocks** (`catalog.library` with `kind:`, filters, view = grid | table | list), placed on a page or opened as a tab; the papers Library becomes this block with `kind: paper`.
- **Plugins that become sources / links** (the services of a self-hosted server): Jellyfin, TubeArchivist, Audiobookshelf, Immich, Suwayomi, Linkwarden, Paperless (documents as a kind), FreshRSS (articles in), copyparty (files), ntfy (notify when a sync adds things); and internet sources: TMDB, IMDb (via TMDB / Wikidata IDs), Letterboxd, TVDB, Wikipedia/Wikidata, MusicBrainz, Discogs, Bandcamp, Last.fm, ListenBrainz, YouTube, Crossref, arXiv, Zotero, OpenLibrary, AniList / MangaDex.
- **UI / UX**: the capture preview card (recognised kind, cover, fields, which library, "also add to Linkwarden"); a library's covers grid with hover previews and quick filters; the item block with its services' states; a "Sync" status in the status bar; every automatic action logged (narrated) and undoable (trash).

## Order of work (proposed)

1. **The meta plugin** (with `requires` in the plugin system): kinds (files), the ID index, the router (recognise → fetch → merge → write), `[[source]]` / `[[recognizer]]` in the plugin API; the capture window / bar / clip / MCP tool all call the router. Papers move onto it: DOI / arXiv recognised → added to Zotero → the Zotero sync makes the note (*"route those though the zotero plugin"*); the clip plugin becomes the `article` kind's source (OpenGraph + readability) and Linkwarden its link.
2. **The library block** (grid / table, filters), the papers Library rebuilt on it.
3. **Movies first**: TMDB + Letterboxd (RSS) + Jellyfin (link, watched) + Wikipedia; the review sync from Letterboxd.
4. **Music**: MusicBrainz + Bandcamp + Discogs; ListenBrainz / Last.fm scrobbles.
5. **Video**: YouTube + TubeArchivist. Then books (OpenLibrary, Audiobookshelf), manga (MangaDex/AniList, Suwayomi), the rest.

**Watch out**: services without an API (Letterboxd writes) — say what can be synced and how, never scrape against a site's terms silently; rate limits (cache per source, schedules not loops); secrets in the secret store (as Email does); the property spec stays the one place that says what a kind's properties are; dedupe before writing; never rewrite the user's text in a note.
