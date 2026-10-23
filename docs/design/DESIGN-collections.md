# Collections: how the catalog's libraries look and organise themselves (design)

The goal (2026-10-16): the UI separates the collections and organises everything automatically and correctly, with good-looking blocks that render in the pages, plus index pages and Bases. For the index page's look they chose **shelves by group**, and added *"all i guess it depends on the kind of library, look what i was doing in .obsidian"*, then *"that's just an inspiration"*. So all three layouts exist, each kind picks its default, and the personal vault is a source of ideas, not a format to reproduce.

## What the personal vault (`~/.obsidian`) does today (read-only look, for inspiration)
- An item note has a `type` (`movie`, `album`, `artist`, `song`, `TV Show`, `[[YouTube|YT Video]]`), a **`status` that is a link** (`[[inbox]]`, `[[to-watch]]`, `[[to-read]]`, `[[read]]`, `[[done]]`), **`topics` that link to an index note** (`[[Cinema]]`, `[[Music]]`), `rating`, `year`, `genres`, **people as links** (`director: "[[Wes Anderson]]"`), `poster` / `cover`, **`is_in_emserv`** (it is on the server's Jellyfin), `sources` (its addresses), `watched-on` / `reviewed`, an `icon`.
- New things land in `notes/Inbox` with status `[[inbox]]`.
- **One base per library** (`notes/Bases/01_movies.base`, `01_music.base`, `01_tv.base`), each with a table view ("Total") and a cards view of posters ("Poster"). The music base has one view per type (AllAlbums, AllArtists, AllSongs).
- **Index notes** (`notes/indexes/Cinema.md`, `Music.md`) are topic notes made of headings and embedded base views: "Movie Posters" `![[01_movies.base#Poster]]`, "All Movies", "All Notes".
- Bodies have the user's own sections, in Spanish: *Sinopsis*, *Review*; for albums *Cómo conocí*, *Impresiones*, and the album's songs as an embedded base.

Ideas taken from it: status as the main grouping (it *is* the shelves); a covers view beside a table; one base and one index page per library; links for people and topics; "is it on my server" as a first-class property; a body with headed sections the user fills in. Ideas not copied: hand-made templates per type, the Templater syntax, and typing `type` by hand. The catalog fills the properties itself.

## The pieces

### A collection = a kind's folder + its base + its index page
When the first thing of a kind is filed, the catalog makes, **once** (afterwards they are the user's files; PHILOSOPHY §2):
1. **The folder** (the kind's `folder`, e.g. `Films/`).
2. **`<folder>/<Library>.base`**, an Obsidian Bases file, so the collection also works in Obsidian. Its views:
   - **Shelves**: grouped by the kind's shelf property (`status` for films, shows, books, albums and papers; `type` for music, where albums, artists and songs are shelves). Cards with the cover.
   - **Covers**: a cards view of everything, by date added.
   - **Table**: every property the kind declares.
3. **`<folder>/<Library>.md`**, the index page: its properties (`type: collection`, `icon`), then the `catalog.library` block showing the base in the kind's default layout. The user can add headings, other blocks and text.

### A home for all collections
A `Collections.md` page (made with the first collection, in the vault's root or its index folder) holds the `catalog.collections` block: one tile per collection with its icon, count, the latest covers and a link to its index page, plus the **capture box** ("paste a link, a DOI, a title…") that shows the preview card before filing.

### The blocks (in the `catalog` plugin's `main.js`, drawn by Atlas, read from the files)
- **`catalog.library`**, options: `base` (the `.base` file), `view` (a view name), `layout` (`shelves` | `grid` | `table`), `group` (a property), `limit`. The rows come from Atlas's own Bases engine (`atlas.query`), so filters, sorting and formulas are the base's. One query implementation, and the file stays Obsidian's.
  - *shelves*: one horizontal row per group value (*To watch*, *Watching*, *Watched*…), counts in the heading, scrolling sideways, a group with nothing in it hidden. The groups follow the kind's shelf order, not the alphabet.
  - *grid*: covers in a responsive grid, the title and one or two key fields under each (year · rating).
  - *table*: the base's table (Atlas's Bases table is mounted for it).
  - Above every layout: a search field, filter chips from the kind's facets (genre, year, status, rating), a sort menu, the layout switch, and the count. Changing the layout or a filter on the page is remembered per page and **written back as the block's options** only when the user says "keep".
  - Clicking a cover opens the note; hovering shows its fields; dragging a cover onto another shelf changes the shelf property (`atlas.writeProperty`).
- **`catalog.item`**, at the top of every catalogued note: the cover, the title and year, the key fields of its kind (director, artists, authors, journal…), **status chips** (one click sets it), **rating stars**, the **services that hold it** as buttons made from its IDs (IMDb, Letterboxd, TMDB, Jellyfin "on the server", Linkwarden, Wikipedia, DOI / arXiv / PDF), and the actions **Refresh** (the catalog's `refresh` tool, only the catalog's own properties) and **Open the collection**.
- **`catalog.collections`**: the home's tiles and the capture box.

### Defaults per kind (each kind's file can change them: `library: { layout, group, shelves, cover, facets, key }`)
| kind | layout | shelves (group) | cover | key fields |
|---|---|---|---|---|
| movie, show | shelves | status: to watch → watching → watched → dropped | poster | year, director, rating, genres |
| album | shelves | status: to listen → listening → listened | cover | artists, year, rating |
| artist, track | grid / table | type | photo / cover | genres, rating |
| video | grid | channel or status | thumbnail | channel, duration, published |
| book, manga | shelves | status: to read → reading → read | cover | authors, year, rating |
| paper | **table** (a compact list: title, authors, year, venue, PDF) | status: to read → reading → read, or a project/topic | — | authors, year, journal, citekey |
| article (web page) | grid | site | image | site, published |

Statuses are **links** (`[[to-watch]]`), as in the user's vault, so a status note, if the user writes one, lists its things in its backlinks, and Obsidian shows them too. The catalog makes no status notes itself: an unresolved link groups just as well.

## Papers: Atlas does what Zotero does
How a captured paper reaches Zotero: ideally Atlas does everything Zotero does. So the paper kind's home is Atlas itself, and Zotero becomes an importer:
- **Capture**: a DOI, an arXiv id or link, an ISBN, a publisher's page, a PDF. A PDF is recognised from its own metadata and its first pages (REFACTOR-catalog.md, "Papers").
- **Metadata**: Crossref, arXiv and OpenAlex (also their cross-IDs: DOI ↔ arXiv ↔ PubMed), Semantic Scholar for abstracts.
- **The note**: written by the papers feature that exists (`refs.rs`: `refs/papers/<citekey>/info.yaml` + the reading note `<citekey>.md`, citekeys, dedupe, `refs.bib`), so it looks like every paper already in the vault.
- **The PDF**: the open-access chain (arXiv, Unpaywall, OpenAlex, Semantic Scholar, CORE, then the university's access through the door sign-in), saved beside the note. Annotations already live in the PDF pane.
- **What Zotero did that Atlas must do too** (to check one by one, in this order): collections (= folders or a `collections` property), tags, related items, attachments of any kind, notes (= the reading note), citation keys and `refs.bib` (exist), the browser's "Save to Zotero" (`connector.rs` exists: Atlas answers the Zotero browser extension), import from BibTeX/RIS, duplicate merging, retracted-paper warnings (Crossref), citing from a document (`[[citekey]]`, PHILOSOPHY §1).
- **Zotero stays as an importer**: the existing one-way sync (`scripts/vault/zotero_sync.py`) keeps bringing what is in Zotero. To avoid duplicates, it learns to match an existing folder by DOI / arXiv / ISBN, not only by `zotero_key`.

## Order of building
1. `catalog.library` (shelves / grid / table over a base, the toolbar) and `catalog.item`, tested on a copy of a vault with films and papers written by the engine.
2. The engine makes the collection's folder, base, index page and status notes on first use (Rust, with tests); the Collections home page and block.
3. `catalog-papers`: recognisers, sources, the write through `refs.rs`, the PDF chain. Zotero sync dedupes by DOI.
4. Screenshots in both themes (`docs/guides/UI-STYLE.md`) and on the phone's width.

## Built
- **Engine** (`plugins/beta/catalog/engine/src/collection.rs`): `library:` on every kind (`title`, `layout`, `group`, `shelves`, `cover`, `key`, `icon`). With the kind's first note, whoever writes it (the catalog, or a plugin such as catalog-papers), the engine makes the base, the index page and `Collections.md`, each only when missing. A new note starts on the first shelf (`status: "[[to-watch]]"`).
- **Blocks** (`plugins/beta/catalog/main.js`):
  - `catalog.library`: shelves in the kind's order (an empty shelf of that order stays as a drop target), covers, and a sortable table, with search and shelf chips. Move a thing by dragging its cover onto a shelf, or by right-click → "Move to shelf". The block re-reads when its folder changes.
  - `catalog.item`: cover, title and year, shelf chips, stars, key fields, services from any address property plus known IDs (IMDb, Letterboxd, TMDB, DOI, arXiv, MusicBrainz, Discogs, AniList, Open Library, YouTube), Refresh, and "Open <collection>".
  - `catalog.collections`: a tile per collection (count and the latest five covers), and the capture box with its preview card (Look up → Add / Open).
- **Found while testing**: inside a view block, a press on anything that is not a link or a button puts the editor's caret there (`live-preview.js` `enterOnClick`, and the native selection), so the block shows its source. The blocks stop `mousedown` and set `user-select: none` on their surfaces. Any interactive plugin block needs the same.
- **Tests**: `ui/tests/catalog-collections.spec.ts`. Five films, shelves in order, drag and the menu change `status` in the note, covers with chips, a sorted table, search, the item block's stars and links. Screenshots in both themes are saved to `ui/test-results/catalog-*.png`.
- **Not yet**: grouping by other properties from the page, writing a changed layout back to the block's options ("keep"), the phone check of the shelves, the tiles' look with real covers.
