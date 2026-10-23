# PDF sources for papers — how a plugin finds a paper's PDF

A generic way to add PDF downloaders to papers (2026-10-18). When a paper is added
(the catalog's `paper` kind: a DOI or an arXiv id captured anywhere, the Library's Add, an agent), the core's papers
feature first tries its own open-access sources — arXiv, OpenAlex, Unpaywall (with `[refs] email`). When none has a
PDF, **catalog-papers asks the PDF sources other plugins contribute**, one after the other, until one attaches a PDF.

## Writing a source

A plugin declares a tool as a PDF source for catalog-papers:

```toml
[permissions]
net = ["api.example.org", "*"]      # the index it asks, and the hosts it downloads from ("*": any; Settings shows it)

[[tool]]
name = "find_pdf"
description = "…"
input = { key = "string", doi = "string?", arxiv = "string?", title = "string?" }

[contributes.catalog-papers]
pdf_sources = [{ tool = "find_pdf", label = "my index" }]
```

The tool is called with `{ key, doi, arxiv, title, year, authors, settings }` and answers `{ "attached": true, "from":
"<where>" }` when it attached a PDF, else `{ "skipped": "<why>" }`. Attaching is one call of the Python SDK:

```python
atlas.attach_pdf(params["key"], url, "My index")   # True when the paper now has the PDF
```

It downloads `url` into the plugin's own cache through the core (the plugin's `net` permission applies), then
`POST /api/refs/attach { key, file, from }` moves it into the paper's folder (`refs/papers/<key>/<key>.pdf`), records
`pdfFrom: "<from>: <url>"` in `info.yaml` and rewrites refs.bib. The core keeps it only when the file is a PDF, comes from
a plugin's cache (`.atlas/cache/plugins/<id>/…`) and the paper has no PDF yet (`refs::attach_pdf`).

A source that fails (an exception, an index down) is noted and the next one asked; the add never fails because of a source.

## Order and switches (Settings → Catalog · Science)

- **Ask other plugins for a PDF** (`pdf_sources_on`, on by default).
- **Order of the PDF sources** (`pdf_order`): plugin ids, first asked first; `-<id>` switches one off; sources not named are
  asked after, by id. Each plugin's card in Settings → Plugins says "finds PDFs for catalog-papers".

The result shows in the capture's notice: "PDF from Europe PMC", or "No PDF found (more open access: no open copy in …)".

## Built in: the open-access indexes

Before any plugin's source is asked, catalog-papers ("Catalog · Science" since 2026-10-19) tries arXiv, then OpenAlex
and Unpaywall, then the indexes of its `indexes` setting in order: Semantic Scholar (`openAccessPdf`), Europe PMC
(full-text links that are open: `availabilityCode` OA or F, never subscription ones) and CORE (only with its free API
key, the plugin's `core_key` secret, sent by the core as `Authorization: Bearer …`). Each index is asked only when the
copies before it failed (`remote::open_access_pdfs`, lazy; test
`the_other_indexes_come_after_in_the_settings_order_and_only_when_the_ones_before_had_nothing`).

These three were the `papers-open-access` plugin (Python helper, 2026-10-18), folded into the engine on 2026-10-19
when science became one subplugin of the catalog. A
vault that had it installed removes it (`atlas plugin remove papers-open-access`); its settings were the defaults.
A new source is still a plugin of its own, on the contract above.
