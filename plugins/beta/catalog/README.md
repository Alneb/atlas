# Catalog

Anything you capture — a link, a DOI, an arXiv id, an ISBN, an IMDb id — is recognised, looked up in every source the
switched-on source plugins offer, and written as one note of its kind (a film, an album, a book, a video, a web page…)
in that kind's folder. The notes stay yours: a later refresh changes only the properties the catalog owns. The
catalog's notes then show as libraries on Atlas's **Libraries** page (Films & Series, Music, Anime & Manga, Books,
Videos, Web pages), each kind a tab.

The work runs in a helper (Rust) that reaches Atlas back through its pipe; the page side draws blocks and registers the
libraries.

## How a thing is filed

1. **Recognise**: every source plugin's patterns are matched (a link no pattern knows is a web page); when no pattern
   matched, the plugins' recognisers are asked (TMDB's title search, Wikipedia's page reader).
2. **Fetch and merge**: every source for that kind is asked; their answers are merged field by field (a kind can say
   which source to prefer per field). Words several things match are never filed on a guess.
3. **Find**: a note that already holds the thing (by its IDs, else by its name) is filled in instead of a new one
   being made.
4. **Write**: `<kind folder>/<note name>.md` with the kind's properties and its block (`catalog.item`), and the text
   field the kind names (a synopsis, a page's readable text) below. A kind may hand writing to the plugin that owns
   those notes (papers: catalog-papers).
5. **Link**: every "link" plugin is told (Linkwarden saves the address, Downloader or TubeArchivist fetch it) and
   what it answers becomes properties.

Each step is narrated (the tools answer their `steps`).

## What it adds

- **Libraries** on the Libraries page, one per group of kinds (`library.in` of each kind), ids `catalog.<group>` such
  as `catalog.films-series`. Items are the vault's notes whose `type` is a kind's type, wherever they are; tabs are
  kinds; groups are shelves (`status`); tags are `genres`, `topics`, `tags`. The detail has Open note, Open on
  <service>, Copy link, Update, Edit, a shelf choice and Delete (to the trash). Papers are left to References.
- **The Catalog pane** (a left-bar tile, `view.js`): every kind in one library page, papers included.
- **Blocks**: `catalog.item` (the top of a catalogued note: cover, key fields, shelf chips, a five-star rating, buttons
  to the services, Refresh), `catalog.library` (a collection over its `.base` as shelves, covers or a table, with
  search, shelf chips and drag between shelves), `catalog.collections` (every collection as a tile, and a box that
  previews before adding — the one place that lets you pick among several matches), `catalog.app` (the all-kinds
  library page).
- **Collections**: with a kind's first note, its folder gets an Obsidian Bases file and an index page
  (`notes/films/Films.base`, `Films.md`), and the vault gets `Collections.md`; after that they are your files and are
  not rewritten.
- **The command** "Add to the catalog…".
- **A capture hook**: a link or identifier captured anywhere (the capture box, the phone, the desktop capture window,
  an agent) is filed and the capture's line links to its note; plain words are left alone.
- **Tools** for agents and other plugins: `add`, `capture`, `preview` (what `add` would do, writing nothing),
  `recognize`, `refresh`, `kinds`.

## Kinds

Built in: film (`movie`), series (`show`), video, song, album, artist, book, science book, manga, anime, and web page
(`article`). Each says its folder (under `notes/`), note name, the IDs that identify it, the properties the catalog
owns, the fields written as links, and how its library looks. Plugins may add kinds (papers); a vault reshapes any of
them with `.atlas/kinds/<name>.yaml` (folder, names, property names via `rename`, starting properties via `set`,
languages that keep the original title). Rules without code go in `.atlas/catalog/rules.yaml`: `when` → `then`
(another folder, tags, properties, a link plugin switched off or given options).

## Settings

- **File links from every capture** (on): a link, DOI, ISBN or IMDb id captured anywhere becomes its note and the
  capture links to it. Off: only explicit adds.

## How it fits

- `provides = ["catalog"]`. Source plugins declare `requires = ["catalog"]` and a `[contributes.catalog]` table
  (`recognize`, `recognizers`, `sources`, `links`, `kinds`); the core hands the tables of every plugin that can run to
  the catalog (`GET /api/plugins/catalog/contributions`). A bad table costs only that plugin's part. See
  docs/guides/PLUGIN-API.md, "A meta plugin and its subplugins".
- Sources: the linked page itself (the catalog's own, "Read the page a link points to": off, a web page gets only a
  title made from its address; it was the Catalog · Web pages plugin), `catalog-tmdb`, `catalog-open` (books, music, anime, YouTube, Wikipedia — no keys), `audiobookshelf`,
  `catalog-papers`. Links: `catalog-linkwarden`, `downloader` (MeTube, TubeArchivist).
- Other plugins file through it: OCR (text read in screenshots), Kiwix and Linkwarden ("save" captures the address).

## Needs

Nothing outside Atlas: pages are fetched through Atlas's core (`net = ["*"]`, for the pages links point to). The
helper is built by `bash engine/build.sh` into `bin/<arch>-<os>/catalog` (not committed); in the phone app the app's
own copy runs.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Status

Beta. Tests: `cargo test -p atlas-catalog` (the engine against a vault in memory) and the specs
`ui/tests/catalog-library.spec.ts`, `catalog-collections.spec.ts`, `plugin-requires.spec.ts`. Known rough edges: the
same notes are reachable from several places (the Libraries tabs, the Catalog pane, each kind's index page,
`Collections.md`); adding by a title from the Libraries page or the command fails when several things match (use the
`catalog.collections` box); Update works only for notes inside their kind's folder; linked services are asked again on
every refresh.
