# Zotero → Atlas: sync, and saving from the browser

Added 2026-10-06. The Zotero library syncs with Zotero automatically, aims to replace it in every regard, and
integrates with the Obsidian side. Of Zotero's jobs the ones needed are: **save from the browser**, **annotate PDFs and
see the annotations in notes**, **cite while writing**. This page covers sync + browser saving; the Library screen and
its right panel (PDF preview, notes) are documented with the Library.

## 1. Sync (`scripts/vault/zotero_sync.py`, workspace command `refs.sync-zotero`, every 10 min)
One way, Zotero → `refs/papers`; Zotero is only read. The live library is found from Zotero's own
`extensions.zotero.dataDir` (here `~/QUARMEN/Zotero`; the old importer read a stale September copy). Three-way
per field against the last sync's state: changed only in Zotero → updated; only in Atlas → kept; both → Atlas's
kept and listed in `refs/ZOTERO-SYNC.md`. Zotero notes are marked blocks in the paper's reading note `<citekey>.md` (section 4); Zotero's trash is reported,
never deleted. First real run: 54 entries, 0 changes, `refs.bib` byte-identical. Details: TOOLS.md.
The real library this was built on has **no Zotero annotations** (0 in `itemAnnotations`), so annotations come from Atlas's own
PDF annotator, which exports them into the paper's reading note `<citekey>.md` ("To notes", or on every save with
`[pdf] export_on_save`).

## 2. Saving from the browser (`crates/atlas-core/src/connector.rs`)
Atlas speaks the **Zotero Connector protocol** (API v3), read from Zotero 10's own `server_connector.js` and
`saveSession.js` (inside its `app/omni.ja`), so the official Zotero browser extension — with its hundreds of
site translators — saves into the Atlas Library whenever Zotero itself is closed:

| endpoint | what Atlas does |
|---|---|
| `GET/POST /connector/ping` | "running", with the prefs the extension reads (`supportsAttachmentUpload: true` → it uploads PDFs itself, with the browser's cookies, so paywalled PDFs work) |
| `/connector/getSelectedCollection` | "Atlas Library" + the Library's collections as targets (`L1`, `C<n>`) |
| `/connector/saveItems` | each translated item → `refs/papers/<citekey>/info.yaml` (Zotero field names, creators as "Last, First", tags), notes → the reading note `<citekey>.md` (section 4); the same DOI reuses the existing entry; `refs.bib` rewritten; the Library refreshes (fs event) |
| `/connector/saveAttachment` | the PDF (body) for an item of the session (`X-Metadata`: sessionID, parentItemID) → `<citekey>.pdf` in the entry, added to `files` |
| `/connector/saveSnapshot`, `/saveSingleFile` | a page without a translator → a `webpage` entry; its HTML snapshot saved beside it |
| `/connector/updateSession` | the popup after saving: collection, tags, note → applied to the session's entries |
| `hasAttachmentResolvers`, `getClientHostnames`, `proxies`, `delaySync` | inert answers |

- **Guard (Zotero's own rule):** a request from a browser must carry `X-Zotero-Connector-API-Version` (or
  `Zotero-Allowed-Request`); a web page cannot add that header cross-origin without a CORS preflight, which is never
  granted — so pages cannot write into the Library. Only 127.0.0.1.
- **Port 23119, shared politely:** if Zotero (or another Atlas) holds it, Atlas says so once and retries every
  minute; with Zotero open, the extension keeps saving to Zotero (and the sync brings those items over).
- **Off by default** (`[refs] connector = false`): only the workspace you browse for should take the port — test
  and audit servers must never catch your saves. A research vault turns it on. `ATLAS_CONNECTOR_PORT` overrides the port.
- Checked: unit tests (guard; save → yaml/notes/bib; PDF upload; popup update; DOI dedupe) and a live server driven
  with curl (ping prefs, 403 for a page, 201 save → entry + refs.bib). Not yet seen with the real extension in a
  real browser — the first save the user makes is that test.

## 3. Cite while writing
Already there: `@` / `\cite{` completion from the Library, `refs.bib` regenerated on every change
(now also after every sync and browser save).

## 4. The reading note: `<citekey>.md`, with the paper and its PDF on top
A paper's note shows a view from the plugin with the PDF embedded and the rest of the information, along with a place to write notes (2026-10-14). Every note being called `notes.md` was bad for wikilinks. So a paper's note is **`<paper folder>/<citekey>.md`** — `refs/papers/maier2005quantum/maier2005quantum.md` — and `[[maier2005quantum]]` is unique and the same name as the citation `[@maier2005quantum]`.

**Made on first use, by one function** (the core's generic companion note, `crates/atlas-core/src/companion.rs`, `POST /api/companion`, asked by the catalog-papers plugin's `note` method with the paper's properties — since 2026-10-18 the core knows nothing of references): a citation chip's click, the Library's *Notes* / *Read* (and its `n` / `r` keys), *Paper: its notes beside the PDF* (Ctrl+Alt+L), the browser connector (Zotero notes and the popup's note are appended), and *To notes* in the PDF pane (the UI asks for the note before the export runs, so the export lands under the head). An existing note is only found, never rewritten. A new note is:

````markdown
---
type: literature
citekey: maier2005quantum
title: Quantum cluster theories
authors:
  - Maier, Thomas
  - Jarrell, Mark
year: 2005
source: https://doi.org/10.1103/RevModPhys.77.1027
created: 2026-10-14
---
# Quantum cluster theories

```view
type: library.paper
```

### Every paper has its note (2026-10-15)

Everything is a file and everything can be linked — papers in the library included. A note was made only when a paper was first opened, so on a real vault 40 of 54 papers had none and `[[citekey]]` led nowhere. `reading_note::ensure_all` makes the missing ones (the same `ensure`, the vault's `literature` template, existing notes never touched) and **`atlas paper-notes`** runs it from the command line; it was run once on that vault (40 notes made, from its template: `type: Literature`, `status: [[to-read]]`). The vault's Zotero sync command should end with `&& atlas paper-notes` so a paper synced from Zotero gets its note at once — **to add after the next install** (the installed `atlas` does not know the command yet, and the scheduled sync would fail every 10 minutes). Test: `every_paper_gets_its_note_and_a_written_one_is_left_alone`.

## Notes
````

- **The vault's template shapes it.** When `<[notes] templates>/literature.md` exists (for example: `type / created / source / authors / year / up`, then *What it says*, *What I think*, *Quotes and pages*), the note is that template filled in (`{{title}}`, `{{date}}`, Templater tags): the paper's properties go into the keys the template leaves empty, the missing ones (`citekey`, `title`) are added after them, values the template sets itself are kept, and the block goes under the template's `# ` title. The template's sections then replace `## Notes`. No template: the built-in shape above. `source` is the DOI link, else the arXiv page, else the entry's `url`.
- **The block** `library.paper` (`ui/src/components/blocks/PaperBlock.svelte`, registered in `lib/blocks.ts`): kind and year, the title (with its `<i>`/`$…$`), authors, venue, DOI / arXiv / URL links, collections and tags, the abstract (folded), buttons (copy the citekey, open the PDF in a tab, the Library, `info.yaml`), and **the PDF embedded** — the PDF block itself (`mountBlock` with `type: pdf`), so it is the same viewer as a tab, annotations and Ctrl+S included. Options: `key:` (which paper; default the note's `citekey` property, else the paper whose folder holds the note — so the block works in any note), `hide_pdf: true`, `pdf_height:` (760). While the Library is switched off (`[plugins] off`) the block says so.
- **The old name is migrated on first use.** A paper with a `notes.md` and no `<citekey>.md`: the first ask renames it — byte for byte when it already has a frontmatter; otherwise the head (properties, title, block) is put above its text, which stays as it was; an empty one counts as none. The Library's *notes* flag counts either name. So old vaults need nothing done; a real vault's 14 were migrated on 2026-10-14 through this same function.
- **The scripts** (`scripts/vault/zotero_sync.py`, `scripts/vault/pdf_annotations.py`) follow the same rule through `scripts/vault/reading_note.py` — the one second copy, because they run without Atlas. It does not read the template: a script makes a note only for a paper that has none yet (a new Zotero item with notes, an export run from a terminal), with the built-in head. Keep the two in step; tests on both sides (`reading_note::tests`, `scripts/vault/tests/`).


## Reading a paper, citing it, linking into it (2026-10-15)

- **Read** (the Library) opens the PDF alone (it used to open the note too, in another tab). The PDF's bar has **Note**: the paper's note (`<citekey>.md`) beside it (also Ctrl+Alt+L). **Highlights → note** (was "To notes") writes the highlights and their comments into that same note — *"the button to send the hihlights to the note its the same note right?"*: yes, one note per paper.
- **Citing is linking** (docs/PHILOSOPHY.md): a paper is cited as `[[citekey]]`, a link to its note. Typing `[[` finds papers by author, year or title words as well as by file name (`[[georges dmft` → `georges1996dynamical`, "Georges et al. 1996", the title on hover). The `@key` completion that wrote `[@key]` was removed (*"i think you made a @ command to cite things, we shouldnt"*); `[@key]` already in notes still draws as before. `\cite{` keeps completing citekeys in `.tex` files.
- **Places in a PDF, the Obsidian way**: `[[paper.pdf#page=3]]` opens page 3; `[[paper.pdf#page=3&selection=12,4,15,20|the words]]` (PDF++'s form: first and last text pieces of the page's text layer, offsets in them) opens the page and selects the passage. The PDF's **Copy link** button copies a link to the page in front — or, with text selected, to that passage, labelled with its words — ready to paste in a note (`lib/pdf-place.ts`).
- More in the PDF's bar: **Rotate**, **Two pages** (side by side), and the zoom label switches between fit width and the whole page.

## The browser's Zotero button saves more than papers (2026-10-17)

Atlas answers the Zotero Connector (connector.rs). A scholarly item (article, preprint, thesis, book, report…) is
filed in the papers library as before. An item Zotero types as something else — a web page, a film, a video or audio
recording, a podcast, a blog or forum post, a broadcast, an artwork, a program — is a **capture** instead: a line in
today's log with its title and address, then the capture hooks, so the catalog files it as what it is (a film in
Films, an album in Music, a page as a web clip). Its snapshot, if the connector sends one, is taken and dropped (the
catalog reads the page itself). Test: `a_film_from_the_browser_is_captured_for_the_catalog_not_filed_as_a_reference`.
