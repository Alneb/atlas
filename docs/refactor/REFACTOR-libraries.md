# One library page, one catalog, science as one of its subplugins (plan, 2026-10-19)

## What was asked

The decision of 2026-10-19, after a review of what each plugin does:

- one central, agnostic plugin holds the agnostic logic, and each kind of capture has its own plugin with the logic
  that applies only to it — so all of science is one subplugin of the catalog;
- `clip` is dropped if `catalog-web` duplicates it (checked: it did);
- there are two library pages, one for scientific references and one of covers (whose thumbnails were broken), and
  both are the same thing, generic enough to be made by the same code;
- a research vault shows only the References page (the one below).

The References page:
- the kind tabs All / Papers / Books / Theses / Notes;
- Collections on the left;
- a list in the middle;
- a detail pane with **Read / Open PDF / Notes / name / \cite / BibTeX / Edit / Delete**.

Already done the same day:
- **Clip dropped** (ebcaa45). It duplicated `catalog-web`: its two unique pieces moved — the palette command to the
  catalog, the Linkwarden panel to `catalog-linkwarden`.
- **The thumbnails fixed** (167730f). A picture named in a property as a note names it now resolves. An empty cover
  property falls back to `poster`/`image`/… or to the first embedded picture.
- **A research vault shows only References.** The catalog's page is already off there (`rail = false` in its
  `plugin-settings/catalog.toml`, 2026-10-18).

## Where things are today

| Piece | What it is | Kind-specific? |
|---|---|---|
| `catalog` ("Library", id `catalog`) | the hub: recognise a capture, ask every source, write one note per item, kinds, collections pages, the **covers page** (`catalog.app` in main.js, plain DOM) | no — agnostic (good) |
| `catalog-papers` | DOI/arXiv source **and** the references library (refs/papers, refs.bib, Zotero connector, the References helper `list add edit delete bibtex`) | science |
| `papers-open-access` | a PDF finder for papers | science |
| core built-in `library` ("Scientific tools") | the **References page** (ui/src/panes/Library.svelte, Svelte), `@`/`\cite` completion, the PDF reader's paper actions | science, in the core (it should not be) |
| kind `science_book` | in the catalog's engine kinds | science |
| `catalog-books/-web/-wikipedia/-youtube/-tmdb/-letterboxd/-music/-anime/-audiobookshelf/-linkwarden` | sources, one per service | per kind (good) |

So the shape described is mostly there. Three things break it:
1. Science is spread over a core built-in, `catalog-papers`, `papers-open-access` and an engine kind.
2. The two library pages are two separate implementations: a Svelte pane in the core, and DOM code in the catalog.
3. The names are confusing: the catalog is titled "Library", References is also called "Library", and the built-in
   is "Scientific tools".

## The target

1. **`catalog`**, the agnostic hub, titled **Catalog**. It owns the capture pipeline, kinds, collections and **the
   library page**. The page is the generic one, in the core's UI (point 3).
2. **`catalog-science`**, one subplugin for all of science. It is `catalog-papers` renamed, with folded in:
   - `papers-open-access` (as one of its PDF sources);
   - the `science_book`, `thesis` and `lecture_notes` kinds;
   - the References helper and the Zotero connector and sync;
   - `@`/`\cite` completion and the PDF reader's paper actions, which today sit in the core built-in.

   The built-in `library` then has nothing left and goes. A vault's own PDF-source plugins stay separate and
   plug into `catalog-science`'s PDF sources, as today.
3. **One library page, two configurations.** A generic `Library` component in the core UI, driven by a **library
   source** that a plugin registers:

   ```ts
   atlas.registerLibrary({
     id, title, icon,
     tabs(): { id, title, count }[],                    // Papers / Books / Theses / Notes — or Films / Albums / …
     collections?(tab): { id, title, count }[],         // Zotero collections — or shelves (to-watch, watched…)
     items(tab, { q, collection, sort }): Row[],        // Row: { path, title, sub, cover?, flags[] }
     layout(tab): "list" | "covers" | "table",          // papers as a list, films as covers
     detail(row): { fields: [label, value][], actions: { label, icon?, primary?, run }[] },
     add?(text): Promise<string>,                       // "Add by DOI, arXiv id or URL", the catalog's add box
   });
   ```

   - **References** is `catalog-science`'s source: list layout, Zotero collections, the actions Read / Open PDF /
     Notes / \cite / BibTeX / Edit / Delete.
   - **The covers page** is the catalog's source: covers layout, shelves as collections, the kinds' key fields.

   Both are drawn by the same code (search, sort, tabs, collections column, detail pane, thumbnails through the
   covers fallback). Only the data and the actions differ.
4. **Per vault.** A vault shows the library sources its plugins register. A research vault switches the catalog's page off and
   keeps References; a personal vault does the opposite. That is the `rail` setting today, a per-source switch tomorrow.

## Steps (each committed with the gate green, a real vault checked read-only in WebKit after each)

1. **The generic page.** `ui/src/components/library/` (Library.svelte, LibraryList, LibraryCovers, LibraryDetail) plus
   `atlas.registerLibrary` in plugin-api.ts. The References page is re-implemented on it first, its data still coming
   from today's endpoints; the References spec must pass unchanged.
2. **The catalog's covers page on it.** `catalog.app` becomes a `registerLibrary` source. The DOM page in main.js goes
   (about 150 lines), and the covers fallback and shelves move into the source.
3. **`catalog-science`.**
   - `git mv plugins/beta/catalog-papers plugins/beta/catalog-science`, with the id kept as an alias so vaults update
     cleanly (`atlas plugin update` renames the folder and its settings file).
   - `papers-open-access` folded in, with its settings carried over.
   - The science kinds move from the engine's kinds to the plugin's `kinds/`.
4. **The core built-in goes.** References' remaining core endpoints (REFACTOR-references-plugin.md "Next", steps 1–3)
   finish the move. `@`/`\cite` completion becomes a `registerSuggestion` of `catalog-science`, and the PDF reader's
   paper actions become its `pdf` actions.
5. **Names.** The catalog plugin is titled **Catalog**, its page **Library**, and the science page **References**.
   Settings → Plugins shows `catalog-*` grouped under the Catalog.
6. **Vaults.** `atlas plugin update` in the real vaults. The research vault keeps only References, the personal vault only the covers page.

## Progress

- **Step 1 done (2026-10-19).** `ui/src/lib/library.ts` is the contract: a `LibrarySource` gives `load()` → `LibraryItem[]`
  (id, title, sub, cover, flags, tab, groups, tags, search text, sort values) and `detail(item)` → kind, title, lines,
  fields, actions, links, body. An action is a plain `run`, a `confirm` (asks first) or an `edit` (a form of fields
  with `save`), so a source never draws a dialog. Optional: tabs, groups' title, layouts (`list`, `covers`), sorts,
  an add box, a drop target, header tools (asked once), a file watch, single keys, `open` (double click / Enter).
  `components/library/Library.svelte` draws any source; `LibraryCover.svelte` turns a cover (an address, a vault path,
  a `[[name]]`, or a function that finds one later) into a thumbnail, or a letter tile.
  `lib/library-references.ts` is References on it, its data still from `api.refs*`; `panes/Library.svelte` is now
  the page over that source. The class names the specs use (`.library`, `.row .t/.m`, `.side`, `.tagitem`,
  `.detail h2/.abstract/.tags`) are the generic page's, so `library.spec.ts`, `blocks.spec.ts` and
  `library-plugin.spec.ts` pass unchanged. Checked on a copy of a real vault in WebKit: 64 references, tabs Papers 38 /
  Books 10 / Theses 6 / Notes 10, no page error.

- **Step 2 done (2026-10-19).** The catalog's `catalog.app` is a source on the same page: `librarySource(atlas)` in
  `plugins/beta/catalog/main.js` (catalog 0.4.0) gives one item per typed note (one Bases query for every kind), the
  kind as its tab (biggest first, asked after each load: `tabs` may be a function), its shelf as its group, its key
  fields as the line under the title, its cover through the old fallback (`noteCover`) as a function the cover asks
  when it nears the view. The detail is async (`detail` may return a promise): it reads the note's properties for the
  services it is in, and the shelf is a `choice`. About 180 lines of DOM code and their CSS went. The page reaches
  plugins as `atlas.mountLibrary(host, source)` (lazy-loaded, the host given the pane's height); a plugin view drawn
  as a block no longer shows the "open as a tab" button, which also pushed the pane into a sideways scroll.
  Spec `catalog-library.spec.ts` (a stand-in helper gives the kinds). Seen on a copy of a personal vault: 31 items, Films 20 /
  Artists 6 / Albums 2 / Songs 2 / Videos 1, posters, shelves, the detail with Letterboxd.
  Differences from the old app, on purpose: an "All" tab over every kind; the table is now the list; shelves at the
  side in alphabetical order (the old bar kept the kind's order).

- **Step 3, changed and done (2026-10-19).** The id stays `catalog-papers`: third-party PDF sources declare
  `requires = ["catalog-papers"]` and `[contributes.catalog-papers]`, and they are not ours to modify, so a rename would have
  needed an alias mechanism in the core for a folder name. The plugin is titled **Catalog · Science** (0.4.0) and holds
  all of science: `papers-open-access`'s three indexes (Semantic Scholar, Europe PMC, CORE with the `core_key`
  secret) are built into its engine after OpenAlex and Unpaywall (`remote::Index`, setting `indexes`), and that plugin
  is gone from the repo. `science_book` stays in the catalog's engine kinds: catalog-books files a book there from its
  subjects, and catalog-books must not depend on the science plugin.

## Watch out

- A real vault's References must never break in between. Step 1 keeps its data path and changes only the drawing.
- Third-party PDF-source plugins are not modified, moved or included. Their API with `catalog-papers`
  (a PDF source returning `{file, from}`) must keep working under `catalog-science`.
- Renaming a plugin id touches every vault's `.atlas/plugins/<id>/` and `plugin-settings/<id>.toml`. The update path
  must carry both over, with the old folder going to the Trash, never a hand-edit of the vault.
- A library source is JavaScript calling the UI: its rows come from Bases queries (the catalog) or the helper
  (science). The page must stay as fast as today's with ~400 papers, so it virtualises the list if needed.
