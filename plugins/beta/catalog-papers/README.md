# Catalog · Science (References)

The references library: papers, books, theses and lecture notes as one folder each, with their metadata, the
open-access PDF, a `refs.bib` kept up to date, and an answer to the Zotero browser extension. Its helper serves the
**References** tab of the Libraries page and the PDF reader's paper actions, and it is also the catalog's source for
the `paper` kind: a DOI or an arXiv id captured anywhere becomes a reference.

## What it adds

- **Recognised**: a DOI (bare, `doi:` or a `doi.org` link) and an arXiv id (an `arxiv.org` abs or pdf link, or
  `arXiv:…`).
- **Metadata** from OpenAlex (any DOI) or arXiv (an arXiv id); Crossref records are read too.
- **One folder per reference**: `<folder>/<citekey>/` holds `<citekey>.md`, the note whose properties are the
  reference's fields (Zotero's field names), and its PDF (docs/guides/ZOTERO.md).
- **The open-access PDF**: arXiv's, else OpenAlex's and Unpaywall's, then the further indexes (Semantic Scholar, Europe
  PMC, CORE), then the PDF sources other plugins contribute (`[contributes.catalog-papers] pdf_sources`;
  docs/guides/PAPERS-PDF-SOURCES.md).
- **References** (the Libraries page's tab, drawn by Atlas): list, add by DOI / arXiv id / URL, drop a PDF to import
  it, edit, delete (the folder to the trash), BibTeX, `\cite`, reading notes; Zotero sync through a vault command when
  one exists. `refs.bib` is rewritten after every change.
- **The Zotero Connector**: when switched on, "Save to Zotero" in the official browser extension saves into the vault,
  PDFs included. It listens on `127.0.0.1:23119` only while Zotero itself is closed.
- **For the catalog**: patterns, a `lookup` source (priority 70) and the `paper` kind, whose notes this plugin writes
  (`writer = plugin`, the `add` tool) and which Linkwarden leaves out.
- Tools: `lookup`, `add`.

## Settings

- **Folder of your references** (`refs/papers`).
- **BibTeX file** (`refs/refs.bib`): written after every change; never edit it by hand.
- **Download the PDF when adding a paper** (on).
- **Your email, for OpenAlex and Unpaywall** (optional): sent with the open-access lookups, as they ask; Unpaywall only
  answers with it.
- **Answer the Zotero browser extension** (off): one vault only, the one you browse for.
- **Ask other plugins for a PDF** (on) and **Order of the PDF sources**: plugin ids, first asked first; `-id` switches
  one off; sources not named are asked after, by id.
- **More open-access indexes, in order** (`semanticscholar, europepmc, core`).
- **CORE API key** (optional, a secret; free at core.ac.uk), sent by Atlas's core as a header.

## How it fits

- `provides = ["references"]`: the page's citations, PDF import and the References tab ask whichever plugin provides
  that role. It has **no** `requires`: References works without the catalog; its catalog patterns count only where
  the catalog runs.
- The built-in **Library** (Settings → Plugins) is the page that shows References; switching it off hides the page,
  not this plugin.

## Needs

The network goes through Atlas's core (Crossref, arXiv, OpenAlex, Unpaywall, Semantic Scholar, Europe PMC, CORE, and
wherever a PDF is). The helper is built by `bash engine/build.sh` into `bin/<arch>-<os>/papers` (not committed); it
starts with the vault so the connector is up when its setting is on.

## Platforms

Linux works; the others are untested; not in the phone app.

## Status

Beta. Tests: `cargo test -p atlas-papers` and `ui/tests/library.spec.ts`. Known gaps: notes and PDFs are written to disk
directly rather than through Atlas's API; the catalog's `paper` kind keeps its folder at `refs/papers` whatever the
folder setting says; papers also appear in the Catalog pane, whose Edit and Delete do not go through this plugin.
