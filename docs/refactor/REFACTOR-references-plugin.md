# References out of the core, into plugins (step 4 left: install)

References do not belong in the core; they belong in plugins (2026-10-18). The way chosen: **fold first, then move**. The fold is done (a70f831: an entry's fields are its note's properties; a real vault
folded, 64 entries). This document is the move of the library/refs code out of the core into the plugin. PHILOSOPHY §3: integrations are plugins; the core is generic.

## What is in the core today (2026-10-18)

| piece | lines | what it does | consumers |
|---|---|---|---|
| `crates/atlas-core/src/refs.rs` | 952 | list entries, add by DOI/arXiv (Crossref, arXiv, open-access PDFs), import a PDF, attach a plugin's PDF, edit, merge, set type, delete, BibTeX, refs.bib, citekeys, `fold_all` | server.rs `/api/refs*` (10 routes), `atlas refs …` CLI, reading_note.rs, connector.rs |
| `ref_entry.rs` | 164 | an entry's fields ↔ its note's properties | refs.rs, connector.rs |
| `reading_note.rs` | 357 | a paper's reading note (`<key>.md`, the literature template); **and** `for_pdf`: the note of any PDF | server.rs `/api/refs/note`, `/api/refs/pdf-note`, `atlas … ensure` (main.rs:613) |
| `connector.rs` | 429 | the Zotero Connector's endpoint on 127.0.0.1:23119 (the browser extension saves papers into the vault) | server.rs spawns it when `[refs] connector` is on |
| `config.rs` `RefsConfig` | — | dir, bib, download_pdfs, email, connector | Settings → References & PDF |
| `ui/src/panes/Library.svelte` | 369 | the References view (type chips, search, details, edit, add, delete) | the "References" app tile (builtin-plugins.ts "Scientific tools") |
| `ui/src/lib/papers.ts`, `entities.ts`, `components/blocks/PaperBlock.svelte` | — | open a paper / its note, citation completion and chips, the `library.paper` block | editor, PDF pane |

## Where each goes

- **`catalog-papers` plugin, a Rust helper** (`plugins/beta/catalog-papers/engine/`, built like the catalog's engine by
  `engine/build.sh`, one static binary per platform): refs.rs, ref_entry.rs, the paper half of reading_note.rs and
  connector.rs, as helper methods `list add import attach edit merge type delete bibtex bib citekey note fold`, and the
  Zotero Connector's listener on 23119 run by the helper while the plugin is on (its setting `connector`). The helper
  works on the vault's files directly (it runs where the server runs, `ATLAS_ROOT`), as the catalog engine does, and
  says changes to the core through the helper pipe (`atlas.event`) so pages refresh.
- **Stays in the core** (generic): `for_pdf` — the companion note of any PDF (DESIGN-shared-notes.md: companions are
  the core's), frontmatter editing, Bases queries, the PDF viewer, the `library.paper` block's renderer becomes the
  plugin's block (`registerBlock`).
- **The References view** becomes the plugin's view — the **Library app** with a research vault's kinds
  (`itemType` → paper / book / thesis / notes), so one app serves a research vault's references and a personal vault's films, series, music,
  manga; the References-only actions (Read, Open PDF, \cite, BibTeX, Add by DOI, Import PDF) come from catalog-papers.
- **The CLI** `atlas refs import|type|merge|fold` becomes the helper binary's own CLI (`catalog-papers fold --apply`),
  or `atlas plugin call catalog-papers <method>`.
- **Settings → References & PDF**: the plugin's settings form (its `[[setting]]`s: folder, bib, download PDFs, contact
  email, connector), values in `.atlas/plugin-settings/catalog-papers.toml`; the vault's `[refs]` read once as the
  starting values (moved, not lost).

## Steps (each committed on its own, the gate green between)

**Order chosen (2026-10-18):** the view first — with the fields now properties, the Library app (a catalog plugin
view) lists a vault's references through Bases queries without any refs code in the core, so a personal vault gets its library at
the same time; then the References-only actions move into the catalog-papers helper; then the core's modules go.


1. The engine crate: `git mv` the four modules into `plugins/beta/catalog-papers/engine/src/`, their core dependencies
   (paths, frontmatter, config's RefsConfig) as small copies or a shared tiny crate; its tests move with it.
2. The helper's methods and the Connector listener; `plugin.toml` `[helper]`, `[[setting]]`s.
3. The UI: `papers.ts`, `entities.ts`, PaperBlock and the References view call the plugin (`api.pluginHelper`); the
   view becomes the plugin's, the "Scientific tools" built-in drops it.
4. The core: `/api/refs*` routes, `RefsConfig`, `connector` spawn and `atlas refs` removed; `for_pdf` kept.
5. Specs: library, library-plugin, connector tests run against the plugin; the vault's plugin updated through
   `atlas plugin update`; desktop reinstalled; server bundle.

## Done so far

- **Step 0, the view** — 1532888: the Library app (catalog 0.2.0, `catalog.app` block mounted by `view.js`, an app tile
  "Library"): a chip per kind with notes, covers/table, shelves, search, the item panel (fields, services, shelf
  buttons). Seen on a copy of a personal vault (Films 20, Artists 6, Albums 2, Songs 2). Updated in the real vaults
  (`atlas plugin update catalog`). A research vault's references show as the catalog-papers kind "Papers" (type Literature).

- **Step 1, the engine** — 0ea3b4e: `plugins/beta/catalog-papers/engine` (crate `atlas-papers`, binary `papers`): every
  References method (list add import attach edit merge type delete bibtex bib citekey fold), the catalog's lookup/add
  (helper.py retired), the Zotero Connector's listener (std + httparse), network through the core's plugin fetch,
  notes through atlas-text; 25 tests. A new entry's note: the helper asks the core's `/api/refs/note` (to become the
  generic `/api/companion`). atlas-plugin lets several threads call the core.

- **Step 2, the UI** — 4a1971e: the References view calls the helper (`list add import edit delete bibtex`), PDF sources
  answer with a file the helper attaches.

- **Step 3, the core lets go** — 2026-10-18: `refs.rs`, `ref_entry.rs`, `connector.rs`, `RefsConfig`,
  every `/api/refs*` route and `atlas refs` are gone from the core (~1,550 lines).
  - `reading_note.rs` became **`companion.rs`**, generic: `POST /api/companion {path, title?, properties?, block?}` —
    a folder entry (`refs/papers/<key>/`) gets `<key>.md` with the properties it is given (the legacy `notes.md` still
    migrates), a file gets its entry's note when it lies in one (the folder note carries `citekey`), else `<name>.md`
    beside it with the file's block (a PDF's viewer, else `![[file]]`). The literature template shapes both, as before.
    A plain PDF's note no longer gets a `citekey` (it is no reference).
  - The engine asks it (`CoreApi::make` with `entry::companion_properties`: type, citekey, title, authors, year,
    source) instead of writing an `info.yaml` for the old route to find; new methods `note {key}` (the UI's
    `api.refsNote`) and `notes` (every missing note; `atlas paper-notes` now calls it).
  - The Connector: `[helper] start = "open"` (new, generic: `plugins::helpers_started_with_vault`, `Helpers::start`)
    starts the papers helper with the vault, which listens when its `connector` setting is on.
  - Settings: the vault's `[refs]` is copied into `.atlas/plugin-settings/catalog-papers.toml` at each start for the
    keys the file lacks (`plugins::adopt_config_section`; the config's own section is left alone, unread).
  - CLI: `atlas plugin call <id> <method> [json]` (in the running Atlas) replaces `atlas refs import|type|merge|fold`:
    `atlas plugin call catalog-papers import '{"path": "x.pdf"}'`, `… type '{"key": …, "kind": …}'`, `… merge`, `… fold`.
  - The phone: `pdf_note` → `companion::ensure`; VaultFiles posts `/api/companion` for a server's vault.
  - Kept as wire types in `api.rs` (the UI's generated types): `Paper`, `PaperEdit`, `PaperAdded`.
  - Gated and committed: scan, rust 614, clippy, py 112, ui and
    build pass; e2e passes after two fixes of its own — `/api/companion` takes `properties` as an object or YAML text
    (`mapping_or_yaml`; the engine sends text so the key order and a numeric `year` survive the JSON relay), and
    `api.refs()` asks `/api/plugins` first and is empty in a vault without catalog-papers (its helper's 404 was logged
    at every start: `[[` completion loads the library). The other e2e failures of that run were not step 3's (session
    030's log).

## Next (the switch-over), from the engine's report

1. PDF sources: a source answers `{file, from}` (its download in its cache) and the helper attaches it; the SDK's
   `attach_pdf` stops posting `/api/refs/attach` (it would deadlock: the helper waits on that source in `catalog_add`);
   papers-open-access and the other PDF sources return `attached` (via `attach_pdf`).
2. UI: `api.refs*` → `POST /api/plugins/catalog-papers/helper` (`list add edit delete bibtex`; `refsPdf` → upload to the
   plugin's cache, then `import {path}`); `refsNote` stays until `/api/companion`.
3. The core: start the helper with the vault when `connector` is on; copy `[refs]` into
   `.atlas/plugin-settings/catalog-papers.toml` once; then remove `/api/refs*`, refs.rs, ref_entry.rs, connector.rs and
   its spawn, RefsConfig, `atlas refs`; reading_note.rs recognises an entry without refs.rs and becomes `/api/companion`.
4. `atlas plugin update catalog-papers` in the vault; reinstall; server bundle.

## The engine's shape (decided 2026-10-18)

- **`plugins/beta/catalog-papers/engine`**, crate `atlas-papers`, binary `papers`, built by `engine/build.sh` like the
  catalog's (static musl when the target is installed). It replaces `helper.py`'s calls to `/api/refs/*`; the Python
  lookups (OpenAlex, arXiv, PDF sources) are ported into it so the plugin has one helper.
- **Depends on `atlas-plugin` only** (as the catalog engine): the network through the core's plugin fetch (its `net`
  permissions shown in Settings), never `reqwest` from the helper; property edits through `POST /api/frontmatter/edit`
  (one key at a time — the same path every writer of a shared note uses, DESIGN-shared-notes.md §2); the Trash through
  the core's trash API; PDFs read from disk under `ATLAS_ROOT` (the helper runs where the vault is).
- **Moves**: refs.rs (list/add/import/attach/edit/merge/type/delete/bibtex/bib/citekey/fold), ref_entry.rs,
  connector.rs (the helper listens on 127.0.0.1:23119 while the plugin is on). **Stays in the core, made generic**:
  reading_note.rs as the companion-note maker (a note for a file or a folder entry, from the vault's template, with the
  properties it is given) — `/api/refs/note` and `/api/refs/pdf-note` become one `/api/companion` call.

- **Shared without copies**: the pure frontmatter editing (`set_property`, `remove_property`, `rename_property`,
  `has_property`, `parse_cell`) and the vault-path guard (`safe_join`, `rel_path`) move into a tiny crate
  `crates/atlas-text` (no I/O, no core types) that atlas-core re-exports and the engine uses — one implementation.
- **Seams for tests**: the engine's network behind a `Net` trait (the helper's: the core's plugin fetch; tests: a fake),
  the companion note behind a `Companion` trait (the helper's: the core's companion call; tests: a temp vault).

## Watch out

- A vault's `.atlas/commands/refs.*.toml` and the scripts in `scripts/vault/` (zotero_sync, refs_bib) already read the notes
  (ref_entry.py) and keep working.
- The phone app: references opened on the phone go through the server's plugin helper (plugins run server-side).
