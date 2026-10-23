# The capture + organization metaplugin (`catalog`) — the rewrite plan

On top of [DESIGN-catalog.md](../design/DESIGN-catalog.md). This file says **how** it is built now that plugins run their logic on the server (PLUGIN-API.md "Calling Atlas back").

## What it is for (restated, to be checked against DESIGN-catalog.md)

One door for **anything** — a URL, an ID (DOI, ISBN, IMDb id), a file, a title — typed in the capture box/window, pasted, dropped, shared from the phone, clipped from the browser, asked by an agent, or arriving by a sync. Atlas **recognises what it is** (a film, an album, a paper, a YouTube video, a manga, any web page), **fetches metadata** from every source that knows it (internet services and your own server), **merges** it field by field, and **writes one note per thing** in that kind's library — properties + a block showing the thing (PHILOSOPHY §1), deduplicated by external IDs, the user's own text never touched. The note then **stays in sync** with the services that hold the same thing (Jellyfin: the file, watched; Letterboxd: rating, review; Zotero: the paper; ListenBrainz: scrobbles; Linkwarden: every captured link), automatically, on schedules. **Libraries are views** (covers grid / table / filters) over those notes, not databases. It is **very general**: a new system is a new subplugin; a new kind is a file. Papers are just one kind (DOI/arXiv → Zotero → paper note); today's clip plugin becomes the generic `article` kind. Automation first, and a powerful, good-looking UI (the preview card in the capture box, the library grid, the item block, a narrated sync status).

## The shape after the 2026-10-16 plugin changes

```
 capture box / window / phone share / clip / MCP / drop / schedule
                         │  POST /api/plugins/catalog/tools/add   (any client, remote too)
                         ▼
   catalog  (meta plugin; Rust helper on crates/atlas-plugin, static musl)
     recognise ── declarative patterns from every enabled subplugin (no process started)
     fetch     ── calls each source subplugin's tool THROUGH THE CORE  (helper call-back pipe)
     merge     ── per kind, per field, by the kind's source priority
     dedupe    ── ID index (.atlas/cache/catalog/ids.json, rebuilt from the notes' properties)
     write     ── the note, only through this path; owned properties only
     sync      ── links' tools on schedules; every action logged + undoable (.atlas/trash/)
                         │
   catalog-web · catalog-zotero · catalog-tmdb · catalog-jellyfin · catalog-letterboxd · …
   (subplugins: `requires = ["catalog"]`, a [contributes.catalog] table, tools served by their own helper or server.js)
```

- **Everything server-side**: the engine is the catalog's helper, so the phone, a browser on your server and agents call the same tool; page JS (`main.js`) only draws the preview card, the blocks and the commands.
- **The engine reaches the network only through the core** (`/api/plugins/catalog/fetch` over the pipe): the manifest's `net` list is enforced, secrets are filled in by the core, and the sign-in in front of a service (below) is the core's, written once.
- **Subplugins are called through the core** (`/api/plugins/<sub>/tools/<name>`), so a source can be a Rust helper, a Python helper or (later) QuickJS `server.js` — the engine does not care.

## Declaring a subplugin (decision)

Generic core keys, not catalog-specific ones, so any future meta plugin works the same way:

```toml
# .atlas/plugins/catalog-tmdb/plugin.toml
title = "TMDB"
requires = ["catalog"]                 # core: loaded after it; "needs Catalog (off)" when missing

[contributes.catalog]                  # core: unread, handed to `catalog` (GET /api/plugins/catalog/contributions)
recognize = [{ pattern = "themoviedb\\.org/movie/(\\d+)", kind = "movie", id = "tmdb" }]
sources   = [{ kind = ["movie", "show"], tool = "lookup", fields = ["title", "year", "cover", "genres", "overview"], priority = 50 }]
links     = [{ kind = "movie", tool = "state", every = "6h" }]

[[tool]]
name = "lookup"                        # input { kind, ids, hints } → { ids, fields }
```

- `requires`: the core sorts load order, refuses to start a plugin whose requirement is missing or off (a clear message in Settings), and switching the meta plugin off says which plugins it takes with it.
- `[contributes.<plugin>]`: free-form TOML the core does not read; the required plugin gets every enabled plugin's table. The catalog validates its own shape and reports problems in its log / Settings.
- Recognisers are data (regex → kind + ID name), so recognising a pasted URL starts no process; a subplugin may add a `recognize` *tool* for what a pattern cannot say.

## How it decides what a thing is

Four layers, cheapest first; each says in the narration what it concluded and why:

1. **The address's shape** — the subplugins' patterns, no network: `youtube.com/watch?v=`, `youtu.be/` → video (catalog-youtube); `letterboxd.com/film/`, `themoviedb.org/movie/`, `imdb.com/title/tt…` → film; `doi.org/10.…`, `arxiv.org/abs/` → paper; `bandcamp.com/album/`, `musicbrainz.org/release/` → album; `mangadex.org/title/` → manga.
2. **IDs in plain text** — the same patterns on text that is not a link: a bare DOI, `arXiv:2101.00001`, an ISBN, `tt1160419`.
3. **The page itself** — a link no pattern knows is read by catalog-web, which looks at what the page declares: OpenGraph `og:type` (`video.movie`, `music.album`, `book`, `video.other` with an `og:video` on YouTube), JSON-LD `@type` (`Movie`, `MusicAlbum`, `Book`, `VideoObject`, `ScholarlyArticle` with a DOI), `citation_doi` meta tags. Its answer carries `kind` + the IDs it found, and the engine **re-kinds** once: the thing becomes a film / video / paper and that kind's sources are asked, the page's own fields kept as one more (low) source. Built and tested (`a_link_whose_page_says_it_is_a_video_becomes_a_video`). Otherwise it stays a web page (`article`).
4. **Words only** (a title, "Dune 2021") — search sources (TMDB, MusicBrainz, OpenLibrary…) answer candidates; the card shows them ranked. Open question: pick the best on its own and let the user fix it, or always ask when it is not sure.

Then every source of the final kind is asked (rounds: IDs one source finds unlock others — Letterboxd's slug → TMDB id → IMDb id → Wikidata), merged field by field, deduplicated by any ID, and written to the kind's library.

## Linkwarden

Linkwarden is a **link** (sync) of the catalog, contributed by `catalog-linkwarden` with `kind = "*"`: **every capture that started from an address is saved there**, whatever kind it turned out to be, and the note gets `linkwarden:` (its address in Linkwarden) — so Linkwarden is the bookmark side and the note the knowledge side, never two disconnected copies. Defaults, all overridable in the kind's file: the Linkwarden **collection = the kind's library** (Films, Videos, Papers, Web), **tags** = the kind + the note's tags/genres; a kind can say `linkwarden: false` (e.g. papers, already kept by Zotero) or name another collection. Things captured without an address (an ISBN typed) get the best source's page as their link. Today's `clip` plugin's Linkwarden code moves here; its `linkwarden.links` block and Links side tool stay with it.

## Papers: PDFs recognised and fetched

- **Recognising a PDF** (a file dropped or shared, a PDF in the inbox, a link that answers `application/pdf`): `catalog-zotero`'s recogniser tool reads the PDF's own metadata (XMP `prism:doi` / `dc:identifier`, the Info dictionary) and its first pages' text (the core already extracts PDF text for search) for a DOI, an arXiv id (also the arXiv stamp in the margin) or an ISBN, and answers `paper` with those IDs. Nothing found → Crossref's bibliographic search on the first page's title, offered as candidates. The PDF then goes to Zotero as the item's attachment, so the paper note (`atlas paper-notes`) has it.
- **Getting the PDF from an identifier** — a chain of `pdf` sources, each a subplugin, tried in order until one gives a file, every step narrated:
  1. arXiv (`arxiv.org/pdf/<id>`), bioRxiv/medRxiv, PubMed Central;
  2. the open-access copies the indexes know: Unpaywall (best OA location by DOI), OpenAlex (`open_access.oa_url`), Semantic Scholar (`openAccessPdf`), CORE;
  3. the publisher through your own university access: a university's EZproxy / Shibboleth sign-in (e.g. `uni.example.org`), done once in a sign-in window like the services' (the core's door sign-in, above) and kept server-side;
  4. nothing: the note says "no PDF found" and offers "Attach a PDF…".
- **Not built**: shadow libraries. They serve copyrighted papers without the rights holders' permission, so they are not written as sources here. The chain is open, so this is about what ships here, not a limit of the design.

## Kinds are files

`.atlas/kinds/<kind>.yaml` in the vault (the PhD vault: `paper`, `article`; the personal vault: `movie`, `show`, `album`, `video`, `book`, `manga`…): its folder, note name template (`{title} ({year})`), the IDs that identify it, its properties (in agreement with `templates/properties.yaml`, the property spec stays the one place for a property's type), the source priority per field, its block. The catalog ships defaults for common kinds; a vault's file wins.

## Sign-in to services

Every source and link can sit behind Authelia (or Authentik, Keycloak, oauth2-proxy…), autodetected by shape, never a product switch. This is **one core implementation in `atlas.fetch` / `/api/plugins/{id}/fetch`**, which every plugin — the catalog and its helpers included — gets for free:

1. **HTTP guard (forward-auth "door")**: a 302 to a portal, or HTML where JSON was expected → the fetch answers `{ signin: { kind: "door", portal, host } }` instead of an error; the UI offers "Sign in to <host>" (a window on the portal, where WebAuthn / YubiKeys work; the system browser as fallback); the gate's session cookie is kept per host in the secret store (server side) and sent with that host's requests until the portal answers again.
2. **OIDC**: `/.well-known/openid-configuration` on the issuer → authorization code + PKCE through `atlas.signIn`; access + refresh tokens kept as secrets, refreshed by the core, sent as `Authorization: Bearer`.
3. A helper never sees the cookie or token values: the core adds them to the request. A tool call that hits "sign in needed" returns that as its answer (the "come back" pattern), so an agent or the phone can tell the user.

## Built so far

- **Core** — `requires = [...]` and `[contributes.<id>]` in `plugin.toml` (`plugins::blocked`, `plugins::contributions`, `GET /api/plugins/{id}/contributions`; the page's `pluginBlocked`, required plugins started first, Settings: "Not loaded — needs catalog: Catalog is switched off"); `POST /api/clip` (`clip.rs`: a page's kind from JSON-LD / `og:type` / the IDs it names, DOI / arXiv / YouTube / IMDb / ISBN, title, site, author, published, description, cover, journal, readable text as Markdown).
- **`catalog`** (`plugins/beta/catalog/`): `plugin.toml` (tools add / preview / recognize / refresh / kinds); `engine/` crate `atlas-catalog` (served over the helper pipe): kinds (`.atlas/kinds/*.yaml` > subplugins' > built-in `article`, IDs with property + prefix, `type`, `template`, `body`, `links`), contributions (kinds, recognize patterns, recognizer tools, sources by `tool` or core `api`, links, `"*"`), recognise, fetch rounds, re-kinding, merge, dedupe across the kind's folders, rules (`.atlas/catalog/rules.yaml`), write (catalog or a plugin's tool), sync links with options, sign-ins collected, narrated steps; `engine/build.sh`.
- **`catalog-web`**: a manifest only — `/api/clip` as a source for every kind with an address.
- **`catalog-linkwarden`**: the `save` link for every kind (Python helper; the token added by the core's fetch).
- Tests: `atlas-catalog` 18, `plugins::tests::a_subplugin_contributes_…`, `clip::tests`, `ui/tests/plugin-requires.spec.ts`.

## Which subplugins (proposal)

Sources: the wish list in DESIGN-catalog.md (YouTube, Letterboxd, IMDb, TVDB, Wikipedia, Last.fm, ListenBrainz, MusicBrainz, Discogs, Bandcamp; Jellyfin, Audiobookshelf, Suwayomi, TubeArchivist), the services on your own server, and the requirement that YouTube captures keep their URL.

### Two rules for where a contribution lives
1. **A service the user runs or uses for more than the catalog is one plugin**, and that plugin adds a `[contributes.catalog]` table. Jellyfin, Paperless, Immich, FreshRSS, Linkwarden, Zotero, TubeArchivist and Audiobookshelf already have (or will have) blocks and settings of their own. The catalog part goes into the same plugin, so there is one place for the address, the token and the sign-in, and never a `jellyfin` beside a `catalog-jellyfin`. This needs one core change: **a contribution is optional**. Today `contributes` also means `requires`, so the Jellyfin block would stop working with the catalog switched off. With the change, a contribution to a missing or switched-off plugin is simply not used. `requires` stays for a hard dependency.
2. **A data source that exists only to feed the catalog** is a `catalog-<name>` plugin: TMDB, MusicBrainz, OpenLibrary, AniList, Wikidata. There is no block, only recognisers and sources.

### The list, by kind (R = recognises, S = metadata source, L = link/sync, D = a door things come in by)

| plugin | kinds | role | access | notes |
|---|---|---|---|---|
| `catalog-web` ✅ | every address | S | none (core `/api/clip`) | built: OpenGraph, JSON-LD, readability, re-kinding |
| `linkwarden` (today `catalog-linkwarden` ✅) | `*` | L | token or the door | built: every captured address saved, collection = library |
| **`catalog-wikidata`** | every kind | S | none | the **ID hub**: IMDb ↔ TMDB ↔ Letterboxd ↔ MusicBrainz ↔ Discogs ↔ ISBN ↔ OpenLibrary ↔ AniList ↔ Wikipedia; the summary from Wikipedia. One SPARQL query turns any one ID into all the others, so every other source gets its key. Replaces scraping IMDb. |
| **`zotero`** (into the existing Zotero sync) | paper | R S L | local Zotero API / web API key | DOI, arXiv, ISBN for books-as-references; Crossref, arXiv, OpenAlex; writer = Zotero add → `atlas paper-notes`; the PDF chain (arXiv → Unpaywall/OpenAlex/CORE → university access) |
| **`catalog-youtube`** | video, song/album (YT Music) | R S | none (oEmbed); optional Data API key | youtu.be, watch, shorts, live, music.youtube.com; tracking stripped; channel, duration and chapters from the key or yt-dlp |
| **`tubearchivist`** | video | L | token + the door | hands the URL over to archive it; the note links the archived copy |
| **`downloader`** (generic) | song, album, video, any | L | per target | *"another app that downloads yt music into the music library"*: a POST of the URL to a configurable service (MeTube, a yt-dlp web UI) **or** a command (`yt-dlp -x … -o ~/Music/…`). The target is chosen per kind in the kind's file. |
| **`catalog-tmdb`** | movie, show, episode | S + search | free API key | titles, year, poster, cast, genres, overview; search for words ("Dune 2021") |
| **`catalog-letterboxd`** | movie | R L D | none (RSS) | film URLs recognised; the diary RSS read on a schedule → ratings, reviews, watched dates into the notes (and new films → notes). **Writing back is not possible**: Letterboxd has no public API, so no review sync to Letterboxd. |
| `catalog-imdb` | movie, show | R | — | recognition only (`tt…`); data via Wikidata/TMDB, no scraping |
| TVDB | show | S | paid / subscriber key | **proposed: skip**. TMDB covers series and needs only a free key. |
| **`jellyfin`** (existing plugin) | movie, show, album, book | L D | token + the door | the item in the library: a play link, watched state, a new item → a note |
| **`catalog-musicbrainz`** | album, track, artist | S + search | none (1 req/s) | plus Cover Art Archive for covers |
| `catalog-discogs` | album | S | free token | pressings, labels; second to MusicBrainz |
| `catalog-bandcamp` | album, track | R | none | recognition only; the page's JSON-LD through catalog-web |
| **`listenbrainz`** | track, album, artist | L D | token | loves, listen counts, "listened lately" |
| `lastfm` | track, album, artist | L | API key | the same for Last.fm, if the user still scrobbles there |
| **`catalog-openlibrary`** | book | R S + search | none | ISBN, covers, authors |
| `audiobookshelf` | book (audio) | L D | token + the door | the item, its progress |
| **`catalog-anilist`** | manga, anime | S + search | none (GraphQL) | MangaDex URLs recognised too |
| `suwayomi` | manga | L D | the door | the library item, chapters read |
| `paperless` (existing) | document | L D | token + the door | a document → a companion note (PHILOSOPHY §1); not media, but the same machine |
| `freshrss` (existing) | article | D | the door | starred articles → captured as articles |
| `immich` (existing) | photo, place | L | token + the door | later; photos are not a "library" kind for now |

Bold = the proposed first wave after papers + web. The order was decided as below.

### Decisions (2026-10-16)
- **Order**: Wikidata, then papers (important), then YouTube with TubeArchivist and the music downloader. The YT Music downloader is a separate service on the server, so `downloader` is a link that POSTs the URL to that service (address, token, the door). It is not a yt-dlp of Atlas's own.
- **One plugin per service**: Jellyfin, Paperless, TubeArchivist, Audiobookshelf and the rest each carry their own `[contributes.catalog]`. Core change: a contribution is optional (no implied `requires`).
- **TVDB and IMDb**: read from their normal websites. `catalog-imdb` and `catalog-tvdb` read the public title pages (their JSON-LD and meta tags, through `/api/clip`): one page per capture, cached, never crawled. Such pages change and sometimes put a bot check in front, so a failed read is reported as such and the other sources fill in.
- **Last.fm**: dropped (ListenBrainz covers the same). **Discogs**: kept (sometimes more complete), and given priority over MusicBrainz for the fields where it is richer (labels, pressings, tracklists of reissues).
- **Immich**: a source for the capture, so a **door**: a photo picked in Immich (or the latest ones) is captured, and the capture's note links the photo in Immich. It is not a library kind.
- **The UI matters as much as the engine**: it separates the collections, organises everything automatically and correctly, and makes good-looking blocks that render in the pages, plus index pages and Bases. Each kind is a **collection**: its folder, its `catalog.item` block at the top of every item's note (cover, key fields, links to the services, actions), an **index page** made with the kind's first item (a `catalog.library` block: a covers grid or table with filters, sorting and grouping) and a **`.base` file** (Obsidian Bases, so it also opens in Obsidian), plus a **Collections** home page listing every kind with counts and the latest additions. The index page and the base are made once, by the catalog, then they are the vault owner's. A later version never overwrites them; it offers a refresh (PHILOSOPHY §2).

### Why Wikidata comes first
Not for its own metadata (TMDB, MusicBrainz, Discogs and Crossref are richer), but because it is the **map between everyone's IDs**. Each service knows only its own number for a film. Wikidata's item for *Dune* (2021) lists its IMDb, TMDB, Letterboxd, TVDB, Rotten Tomatoes and Wikipedia identifiers in one place, and the same holds for albums (MusicBrainz, Discogs, Bandcamp), books (ISBN, OpenLibrary, Goodreads), manga (AniList, MangaDex, MyAnimeList) and papers (DOI, arXiv). So:
1. **Correct, not guessed**: from a Letterboxd link, every other source is asked by its exact ID instead of searching by title (where *Dune* 1984 and *Dune* 2021 get mixed up).
2. **No duplicates**: a film captured from Letterboxd today and from IMDb next month carries the same Wikidata ID, so the second capture finds the first note.
3. **Every source gets its key**: TMDB, TVDB and Discogs each need their own ID. Wikidata hands it over, so each new source plugin works from the first day without its own matching logic.
4. Free, no key, no sign-in, one query.
It is the plumbing that makes "organises everything automatically and correctly" true, so it comes before the sources that rely on it.

**Corrected after review** (is Wikidata complete enough?): it is not. In a live check (2026-10-16), famous items resolved (*Dune* 2021, *Breaking Bad*, *Berserk*, *Dune* the novel, "Attention Is All You Need"), but *OK Computer* gave **two** items for its MusicBrainz ID and was rightly skipped. Indie albums, Bandcamp releases, small videos, niche manga and most papers are often missing altogether. So Wikidata is **not** the backbone:
- **Every source answers the other IDs it knows**, and the engine's fetch rounds pass them on: TMDB `external_ids` (IMDb, TVDB, Wikidata), MusicBrainz URL relations (Discogs, Bandcamp, Wikidata), AniList (MyAnimeList), Crossref and OpenAlex (DOI, arXiv), OpenLibrary (ISBN, Goodreads). That is the main crosswalk.
- **`catalog-wikidata` is a low-priority fallback** (built, `plugins/beta/catalog-wikidata`). It costs one request and answers "skipped" when no item carries the ID, or when two do, which it never guesses. Possible later: when there are two hits, keep the one whose "instance of" matches the kind.
- The order of work is therefore papers next, then YouTube.

## Order of work

0. The helper call-back pipe lands first.
1. **Core**: `requires` + `[contributes.<id>]` in `plugins.rs` (+ `GET /api/plugins/{id}/contributions`), tests.
2. **Core**: the service sign-in in fetch (door + OIDC), tests with a stand-in portal and a stand-in OIDC issuer.
3. **`catalog` engine** (Rust helper): kinds, recognise, the ID index, fetch-through-core, merge, write (owned properties only), tools `recognize`, `preview`, `add`, `refresh`; tests on a temp vault.
4. **Papers + web pages** (the first slice): `catalog-web` (the article kind: OpenGraph, JSON-LD, readability → the planned core `POST /api/clip`; Linkwarden as a link — replaces `clip`), `catalog-zotero` (DOI / arXiv → added to Zotero → the existing paper-note path `atlas paper-notes`; Crossref / arXiv as sources).
5. **UI**: the capture preview card (box, window, phone), the `catalog.item` and `catalog.library` blocks (grid / table / filters); the papers Library rebuilt as `catalog.library kind: paper`. Screenshots in both themes.
6. Then movies (TMDB, Letterboxd RSS, Jellyfin, Wikipedia), music, video, books, manga.
7. **YouTube and YouTube Music keep their address**. `catalog-youtube` recognises `youtu.be/`, `youtube.com/watch`, `/shorts/` (kind `video`) and `music.youtube.com/watch` (kind `song`/`album`), and drops `?si=` and other tracking. It links videos to **TubeArchivist** (a link that hands the URL over), and YT Music to a generic **music downloader** link: a POST of the URL to a configurable service or a command (MeTube, yt-dlp, whatever you pick) that files into the music library. The phone side already sends the clean watch URL with every capture.

Step 2 (service sign-in, the door) is built: docs/design/SERVICE-SIGNIN.md. OIDC for plugins is the rest of step 2.

## Built first (2026-10-16)
- `catalog-wikidata`: the low-priority ID fallback (see "Why Wikidata", corrected).
- The collections UI and the engine's collection files: docs/design/DESIGN-collections.md, "Built".
- `catalog-papers`:
  - DOI and arXiv recognisers, and the `paper` kind (`refs/papers`, `type: Literature`, the DOI or arXiv id in `source` as the existing notes have it, so they deduplicate against the 54 already there).
  - Metadata: OpenAlex for DOIs, arXiv's own API for arXiv ids. An OpenAlex answer about another DOI is refused: OpenAlex merged *Attention Is All You Need* with a 2025 record in the live check.
  - Writer: `/api/refs/add` (the papers feature), then `/api/refs/note` (the reading note).
  - No Linkwarden for papers.
- The papers feature (`refs.rs`) now looks for a PDF in turn: arXiv, then OpenAlex's open locations (only for the DOI asked), then Unpaywall's (with `[refs] email`, a new setting). The first answer that is really a PDF is kept, with `pdfFrom` in `info.yaml`.


## Every capture, legible notes, many sources, tested on 1172 captures (2026-10-17)

The capture-and-organisation plugin must be very powerful, work from every app, and be tested on many different captures — at least 1000.

- **Captures from every app go through the catalog**: a plugin tool with `on = "capture"` is called after every
  capture (capture box, phone, `atlas capture`, agents) on the bus's own `Captured` channel (`capture_hooks.rs`); an
  answer with a `path` links the capture's line (`→ [[note]]`) and says so. The catalog's `capture` tool files only
  what a pattern recognises — a plain thought starts no search. The OCR plugin is the second listener: a screenshot's
  text, folded under it and handed to the catalog.
- **Kinds are files** (`engine/kinds/*.yaml`, built in): movie, show, video, song, album, artist, book, science_book,
  manga, anime; a subplugin's kinds replace them, a vault's `.atlas/kinds/<name>.yaml` replaces both. A kind says its
  folder, note name, IDs, properties (and their order), `rename` (a field under the vault's own name: `cast → actors`),
  `as_links`, `set` (fixed properties, `{now}`), `original_title: [es]` (a film keeps its Spanish title, the English
  one as `aka`), `library.index: false` (the vault has its own Bases). A vault can carry its own set.
- **One field vocabulary** for every source: title, original_title, aka, year, director, cast, creator, artist,
  album, genres, tracks, author, narrator, pages, duration ("2h 47m"), language, cover, description…; properties are
  written legibly (names, links, a year, a duration), IDs last, page text never.
- **Sources** (all keyless except TMDB): Letterboxd (films by slug, IMDb or TMDB id; the user's diary/films synced
  hourly with rating, date, review), MusicBrainz (Spotify/Bandcamp/Apple/Deezer/Tidal/Discogs/YT Music links, by link
  relation or a sure search), Open Library (ISBN → work; science books by subject), AniList/MangaDex, Wikipedia (a
  page's own description and external links, one query-API request), Audiobookshelf, OpenAlex/
  arXiv for papers (the core's citekey rule names the file). Wikidata was removed. IMDb answers programs with a bot check; IMDb ids go through Letterboxd's `/imdb/<id>/`.
- **Re-kinding** only by a source with priority ≥ 50 or for a link no pattern knew, never back to a web page.
- **The test**: `scripts/dev/catalog-probe/` — 780/1172 → 1143/1172. The losses were mostly rate limits (Wikipedia,
  arXiv) and an Open Library outage, fixed by `atlas.fetch` in the Python SDK (paced per host, patient with 429/50x
  and Retry-After) rather than per helper.

Watch out: Wikipedia throttles an address after a burst (set a contact in its settings); TMDB without its token gives
no word search and no series by IMDb id; the page reader's chrome filter is by class/id/role words (`CHROME` in
clip.rs) — a site naming its article body "sidebar-…" would lose text.

## Series listed as films, old notes by name, synopses in the film's language (2026-10-19)

After a Letterboxd import, Spanish films should be in Spanish, and Letterboxd needed parsing better. Three causes, three fixes (catalog 0.4.3, catalog-letterboxd and catalog-tmdb helpers):

- **A miniseries Letterboxd lists as a film** (Antidisturbios, 2020) carries TMDB's **series** id (`data-tmdb-type="tv"`); the helper dropped it, so TMDB was never asked and Letterboxd's English synopsis stayed. Now the id is kept as `tmdb: tv/<id>` — TMDB's own address form; a bare number stays the kind's own (a film for a film, a series for a series) — and catalog-tmdb reads either (`entry` / `ref`), on its API and on its website. Letterboxd's `/tmdb/<id>/` redirect is used only for a film id.
- **Twins of old notes**: the import made `El reino (2018).md` beside the user's own `El Reino.md`, written before the catalog and holding none of the kind's IDs, so the ID search could not see it. `find` now falls back to a note with none of the kind's IDs named as the thing is (`named_as`: its file name less a ` (year)`, or its `title`, equals the title, original title or other title — without case, accents or punctuation — and the years agree within one when both have one — a festival premiere and the release: Puparia 2020 / 2021, But I'm a Cheerleader 1999 / 2000). That note gets the IDs, and only its **gaps** are filled (`update(…, only_gaps)`): a property it already sets — the user's own poster picture, its creation `date`, a year — stays as written; it keeps its name and its text. A note with other IDs is never taken: it is another thing.
- **A synopsis in the wrong language never changed**: a refresh updates properties, never the note's text. Now `describe_again` also replaces the synopsis paragraph when it is **still word for word what a source wrote** (`note::with_description`: a paragraph of its own, equal to one of this refresh's answers, different from the winner) — the user's own words are never touched.

Tests: `a_refresh_gives_a_synopsis_in_the_films_language_and_finds_an_old_note_by_name`, `an_old_note_of_that_name_without_ids_is_the_thing`, `only_a_synopsis_still_in_a_sources_words_is_replaced`; the helpers' `test_a_miniseries_listed_as_a_film_keeps_its_tmdb_series`, `test_a_series_listed_as_a_film_is_read_from_its_series_page`.

Applied to a real vault the same evening: the five twins the import had made were merged into the new notes (their reviews were already there; `rating`, `scoreLB` and the vault's other own properties carried over; a journal's `[[La Haine]]` → `[[La Haine (1995)|La Haine]]`; both versions in `.atlas/trash/…-merged-film-twins`), and the old notes without IDs were looked up on TMDB, each added through the catalog only when exactly one film had its exact name and the catalog's preview landed on that very note (copies in `.atlas/trash/…-before-identify`). Then (catalog 0.4.5) `add` / `preview` take `note` — the existing note the user says the thing is, for an old note named otherwise ("Inglorious Basterds" for TMDB's "Inglourious Basterds"); the search text still has to find the chosen thing. Four of the five were done that way, each confirmed. Five had been left to decide by hand: a spelling differs from TMDB's (Inglorious Basterds, The Clockwork Orange, The French Dispatch) or nothing matched exactly (Tesis, Seis Días Corrientes).
