# Library (catalog)

Anything you capture — a link, a DOI, an arXiv id, an ISBN, an IMDb id — is recognised, looked up in every source the
switched-on `catalog-*` plugins offer, and written as one note of its kind (a film, an album, a book, a paper, a web
page…) in that kind's library. It shows up as the Catalog app in the left bar (hidden or moved like any app: its right-click, or Settings → Appearance), as tabs of the Libraries page, as
blocks inside notes, and as the command "Add to the catalog…".

## What it does

- **Recognise → fetch → merge → write → link**: the helper finds what the text is (every subplugin's patterns and
  recognizers; a link nothing knows more about is still a web page), asks every source for that kind, merges their
  answers field by field (each field remembers which source gave it), and writes the note — or, when the thing is
  already in the vault, fills in that note. Each step is narrated.
- **Notes stay yours**: a refresh only changes the properties the catalog owns, never the note's text or any other
  property.
- **Kinds** say where a thing's note lives, which IDs identify it, which properties the catalog owns and how its
  library looks. The built-in ones (film, series, video, song, album, artist, book, science book, manga, anime) are in
  `engine/kinds/`; subplugins can add more (papers); a vault reshapes any of them with `.atlas/kinds/<name>.yaml`.
- **Rules without code**: `.atlas/catalog/rules.yaml`, a list of `when` → `then` applied after the merge — another
  folder, tags, properties, a linked service switched off or given options.
- **Collections**: with a kind's first note, its folder gets an Obsidian Bases file and an index page; afterwards they
  are the user's files and are not rewritten.
- **Blocks**: `catalog.library` (a collection as shelves, a covers grid or a table, with search, filters and sort),
  `catalog.item` (the top of a catalogued note: cover, key fields, shelf chips, a five-star rating, buttons to the
  services that hold it, Refresh), `catalog.collections` (every collection as a tile, with a capture box that
  previews before adding), `catalog.app` (the Catalog app).
- **From every capture**: a link or identifier captured anywhere (the capture box, the phone, an agent) is filed as
  `add` does; plain words are left alone.
- **Tools** for agents and other plugins: `add`, `capture`, `preview` (what `add` would do, writing nothing),
  `recognize`, `refresh`, `kinds`.

## Subplugins

Each source is its own plugin that `requires = ["catalog"]` and hands the catalog a `[contributes.catalog]` table
(patterns, sources, links, kinds): `catalog-web` (any web page), `catalog-tmdb`, `catalog-letterboxd`,
`catalog-books`, `catalog-audiobookshelf`, `catalog-music`, `catalog-anime`, `catalog-youtube`, `catalog-wikipedia`,
`catalog-papers` (papers and References), `catalog-linkwarden` (saves every link in Linkwarden). A bad table costs only
that plugin's piece, never the whole catalog. See `docs/guides/PLUGIN-API.md`, "A meta plugin and its subplugins".

## Settings

- **File links from every capture** (on): a link, DOI, ISBN or IMDb id captured anywhere becomes its note, and the
  capture links to it.

## Needs

Nothing outside Atlas: the network goes through Atlas's core (pages a link points to are read for `catalog-web`). The
helper is a Rust binary that must be built (below); with a served vault the server runs it. Without subplugins only
web pages are known.

## Platforms

Linux works; macOS, Windows and a server are untested. It is marked for the phone app (`phone = true`), where the
app's own copy of the helper runs.

## Build

`bash engine/build.sh` builds the helper into `bin/<arch>-linux/catalog` (static with the musl target when it is
installed), which git ignores.

## Tests

`cargo test -p atlas-catalog` (the engine against a vault in memory), and `ui/tests/catalog-library.spec.ts`,
`ui/tests/catalog-collections.spec.ts`, `ui/tests/plugin-requires.spec.ts`.
