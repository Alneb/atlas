# Catalog · Science

Everything science: papers by DOI or arXiv id into References, with their metadata and the open-access PDF, a
`refs.bib` kept up to date, and an answer to the Zotero browser extension. It is the references library itself — its
helper serves the References view — and the catalog's source for the `paper` kind. A subplugin of the Library
(`catalog`).

## What it does

- **Recognised**: a DOI (bare, `doi:` or a `doi.org` link) and an arXiv id (bare as `arXiv:…`, or an `arxiv.org` abs
  or pdf link) are papers.
- **Metadata**: OpenAlex (any DOI) or arXiv itself (an arXiv id) say what it is: title, authors, year, venue,
  abstract, its other identifier; Crossref records are read too.
- **One folder per reference**: `refs/papers/<citekey>/` holds `<citekey>.md`, the note whose properties are the
  reference's fields (Zotero's field names), and its PDF beside it — so an added paper looks like every paper already
  in the library (`docs/guides/ZOTERO.md`).
- **The open-access PDF**: arXiv's, else OpenAlex's and Unpaywall's, then the further indexes (Semantic Scholar,
  Europe PMC, CORE), then the PDF sources other plugins contribute (`docs/guides/PAPERS-PDF-SOURCES.md`).
- **References view**: list, add (by DOI, arXiv id or URL), import a PDF, attach, edit, merge, change type, delete
  (to the trash), BibTeX; `refs.bib` is rewritten after every change.
- **Zotero Connector**: when switched on, "Save to Zotero" in the official browser extension saves into the vault's
  references, PDFs included (uploaded by the browser, so a paywalled one works). It listens on `127.0.0.1:23119` only
  while Zotero itself is closed; while Zotero holds the port it waits and retries, so both can be installed.
- **The `paper` kind** for the catalog: notes in `refs/papers/<citekey>/<citekey>.md`, a Papers library as a table
  (to-read, reading, read), never sent to Linkwarden.
- **Tools**: `lookup` (a paper's metadata) and `add` (the paper into the library, answering its note).

## Settings

- **Folder of your references** (`refs/papers`): one folder per reference.
- **BibTeX file** (`refs/refs.bib`): written after every change; never edit it by hand.
- **Download the PDF when adding a paper** (on).
- **Your email, for OpenAlex and Unpaywall** (optional): sent with the open-access lookups, as they ask; Unpaywall only
  answers with it.
- **Answer the Zotero browser extension** (off): one vault only, the one you browse for.
- **Ask other plugins for a PDF** (on), and **Order of the PDF sources**: plugin ids, first asked first; `-id`
  switches one off; sources not named are asked after, by id.
- **More open-access indexes, in order** (`semanticscholar, europepmc, core`).
- **CORE API key** (optional, a secret; free at core.ac.uk), sent by Atlas's core as a header — the helper never holds
  it.

## Needs

The Library plugin (`requires = ["catalog"]`). The network goes through Atlas's core: Crossref, arXiv, OpenAlex,
Unpaywall, Semantic Scholar, Europe PMC, CORE, and wherever they say a PDF is. The helper is a Rust binary that must be
built (below); it starts with the vault, so the connector is up when its setting is on.

## Platforms

Linux works; the others are untested; not in the phone app.

## Build

`bash engine/build.sh` builds the helper into `bin/<arch>-linux/papers` (static with the musl target when it is
installed), which git ignores.

## Tests

`cargo test -p atlas-papers` (the library on a temp folder, the network answered from a table) and
`ui/tests/library.spec.ts`.
