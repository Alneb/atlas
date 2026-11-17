# Catalog

Anything you capture — a link, a DOI, an arXiv id, an ISBN, an IMDb id — is recognised, looked up in every source the
switched-on source plugins offer, and written as one note of its kind (a film, an album, a book, a video, a web page…)
in that kind's folder. The notes stay yours: a later refresh changes only the properties the catalog owns. The
catalog's notes then show as libraries on the **Libraries** page (Films & Series with anime, Music, Comics, Books,
Videos, Web pages), each kind a tab — a page that is this plugin's own pane.

The work runs in a helper (Rust) that reaches Atlas back through its pipe; the page side draws blocks, registers the
libraries and is the Libraries page.

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

**A link to a file** (a PDF, an EPUB, a DjVu… — by the address's last segment) that no source plugin's pattern claims
(catalog-papers claims PDF links where it runs: a science vault files them as papers) is not read as a page. It is
downloaded through the core's fetch into the plugin's cache, checked to be the file (a sign-in or a "your download
starts" page is refused, saying so), moved into the **documents** folder under its own decoded name (`Group Theory
(2010).pdf`; `… 2.pdf` beside one of that name), and given its companion note through the core's one path
(`POST /api/companion`: `<name>.md` beside it, with the file's own block) carrying `type: document`, `url` and a title:
the one its first page gives as a reader would see it (a scan's page, which has no text, read by the OCR plugin when the
vault has it) (a line of words over a line of names, with `author` and
`year` then), else what the PDF's own Info dictionary says (its maker's title and author, when they read as such:
"Microsoft Word - x.docx" or "untitled" do not), else the file's name. The PDF naming is the catalog's
(`engine/src/first_page.rs`); catalog-papers links this engine as a library and names its references the same way. When a PDF's first 8 pages (the core's PDF text) give an ISBN that the book kind's sources know
(Catalog · Books: Open Library), it is filed as that book's note instead, with `file: [[the PDF]]` and the link as its
`source`. Captured again, the note that holds the link is found and nothing is downloaded twice. The tool `download`
does the same for any file link, even one another plugin would claim; `document_types` lists the extensions it keeps
(the Captures view offers **Download** for a link ending in one).

## The note of a thing (one note per thing)

Things that live elsewhere — an audiobook on Audiobookshelf, a series on Suwayomi, a film on Jellyfin — and things that
are vault files (an EPUB, a manga series' folder) get **one** note, and only once they are yours
(docs/design/DESIGN-server-libraries.md §3). The rule is here, in the tool `note`, which every plugin and both apps (the
page, the phone's native screens) ask; none of them writes such a note itself.

- **Which note**: the vault file's own note when the thing is a file (the core's companion: a note claiming the file by
  its `file` property — `file: "[[books/Dune.epub]]"` — else the one beside it), else the note of the kind's type that
  has one of its IDs, anywhere in the vault (`audiobookshelf`, `suwayomi`, `isbn`, `tmdb`, the source address…), else
  an ID-less note of its name in the kind's folder. A note found this way gets the IDs, `type` and `file` link it
  lacks, nothing else: the EPUB of a book whose audiobook already has a note joins that note.
- **When it is made**: when it becomes yours — read or listened past its start (1 %), a part of it finished, rated,
  reviewed, written on, or asked for. Opening or listing a thing never makes a note; a server with 800 items does not
  put 800 notes in the vault.
- **Where**: a server item's note in its kind's folder (`notes/books/`, `notes/manga/`), filed as `add` files anything
  (the kind's sources; what the server says fills the gaps, so a thing no source knows is filed too); a vault file's
  beside it (a folder's inside it), made by the core's companion path with the kind's type and IDs.

## What it adds

- **Libraries** on the Libraries page, one per group of kinds (`library.in` of each kind), ids `catalog.<group>` such
  as `catalog.films-series`. Items are the vault's notes whose `type` is a kind's type, wherever they are; tabs are
  kinds; groups are shelves (`status`); tags are `genres`, `topics`, `tags`. The detail has Open note, Open on
  <service>, Copy link, Update, Edit, a shelf choice and Delete (to the trash). Papers are left to References.
- **The Libraries page** — its pane (`view.js`, built from `ui/` by `scripts/dev/plugin-ui.mjs`; the role `libraries`):
  every library of the vault a tab, those of one subject one tab — its own, Atlas's Drawings and References, Books'
  E-books, Manga's and Audiobookshelf's. `atlas.openLibrary`, the Library tile and the phone's Library open it; with this
  plugin off there is no Libraries page. Its library page also draws the `catalog.library` and `catalog.app` blocks.
  A library whose items carry `progress` (0–1) and `lastUsed` gets a **Continue** row above the grid (the ones begun
  and not finished, latest first) and a bar under each cover; on a phone a tap on a cover opens the item.
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
- **Tools** for agents and other plugins: `add`, `note` (the note of a thing, above), `capture`, `download` (a file link kept as a file with its note),
  `preview` (what `add` would do, writing nothing), `recognize`, `refresh`, `kinds`.
- **The captures' triage** (the `captures` block, "Captures: triage") asks it by role: **Catalogue** (`c`) runs `add`
  on a capture and links the capture to the note made, or says why not; a capture that is a link to a file also
  offers **Download** (`w`), the `download` tool.

## Kinds

Built in: film (`movie`), series (`show`), video, song, album, artist, book, science book, manga, anime, and web page
(`article`). Each says its folder (under `notes/`), note name, the IDs that identify it, the properties the catalog
owns, the fields written as links, and how its library looks. Plugins may add kinds (papers); a vault reshapes any of
them with `.atlas/kinds/<name>.yaml` (folder, names, property names via `rename`, starting properties via `set`,
languages that keep the original title). Rules without code go in `.atlas/catalog/rules.yaml`: `when` → `then`
(another folder, tags, properties, a link plugin switched off or given options).

**Books or reference books.** A plugin may say that, while it is installed, one kind is filed as another
(`[contributes.catalog] instead = [{ of = "book", file_as = "science_book" }]`). Catalog · Science does: with it every
book is a reference book (`science_book`, beside the papers); without it, books are books. Nothing is guessed from a
book's subjects.

## Settings

- **File links from every capture** (on): a link, DOI, ISBN or IMDb id captured anywhere becomes its note and the
  capture links to it. Off: only explicit adds.
- **Documents folder** (`documents`): where a link to a file no other catalog plugin claims is downloaded, with its
  note beside it.

## How it fits

- `provides = ["catalog"]`. Source plugins declare `requires = ["catalog"]` and a `[contributes.catalog]` table
  (`recognize`, `recognizers`, `sources`, `links`, `kinds`); the core hands the tables of every plugin that can run to
  the catalog (`GET /api/plugins/catalog/contributions`). A bad table costs only that plugin's part. See
  docs/guides/PLUGIN-API.md, "A meta plugin and its subplugins".
- Sources: the linked page itself (the catalog's own, "Read the page a link points to": off, a web page gets only a
  title made from its address; it was the Catalog · Web pages plugin), `catalog-tmdb`, `catalog-books`, `catalog-music`, `catalog-anime`, `catalog-youtube`, `catalog-wikipedia` (no keys), `audiobookshelf`,
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
`ui/tests/catalog-library.spec.ts`, `catalog-collections.spec.ts`, `captures-catalog.spec.ts`, `plugin-requires.spec.ts`, and the page's own:
`libraries.spec.ts`, `library.spec.ts`, `library-subjects.spec.ts`, `library-plugin.spec.ts`; `node
scripts/dev/plugin-ui.mjs --check plugins/beta/catalog` (its types, and `view.js` current). Known rough edges: the
same notes are reachable from several places (the Libraries tabs, the `catalog.app` block, each kind's index page,
`Collections.md`); adding by a title from the Libraries page or the command fails when several things match (use the
`catalog.collections` box); Update works only for notes inside their kind's folder; linked services are asked again on
every refresh.
