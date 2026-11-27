# Paperless

Your Paperless-ngx documents in Atlas. The documents stay in Paperless (its OCR, tags, correspondents); Atlas lists
them, opens them in its PDF reader, and gives one a note when it matters to your work — an invoice for the finance
notes, a contract for a project — linked to the document by its id.

## What it adds

- **Documents**, a tab of the Libraries page (the command "Paperless: documents"): every document, newest first, with
  its correspondent, type and date under the title, its tags as the side list, its thumbnail as the cover. The search
  box searches titles, names and the start of each document's text.
  - **Open** keeps the document's PDF (the archived, searchable one Paperless made; the original when it made none)
    with the local copies of remote files, `.atlas/remote/paperless/documents/<id>/<title>.pdf`, and opens it in the
    PDF reader. It is fetched once; marks you make live in the PDF's own note as for any PDF.
  - **Its note** asks the catalog for the document's note (its `note` tool): found by `paperless_id` wherever it is,
    made in `documents/<title>.md` the first time, with date, correspondent, type, tags and a link to Paperless as
    properties. The note's text is yours; the catalog only fills properties it lacks.
  - **In Paperless** opens the document's page there, in the system's browser.
- **The block `paperless.search`** (options: the search, at most how many): the documents Paperless's search finds,
  each a link into Paperless with its date.
- **Mentions** `@paperless:12`: the document's title, correspondent, type and date; the completion lists the 50 newest.
- **Send to Paperless**, in the file and tab menus for a PDF, a picture or a document, and the command "Paperless: send
  the open file": the file goes to Paperless's upload (`post_document`, titled by its name); Paperless reads it in the
  background and it shows in Documents once done. Needs an Atlas with plugin API 37 (the core's `multipart` fetch);
  an older one does not offer it.
- **Tools for agents** (`atlas mcp`): `paperless_search` (Paperless's full-text search over the OCR'd text, titles,
  tags and correspondents; the documents best first) and `paperless_get` (one document's fields and whole text).

## Settings

- **Paperless address**: `https://paperless.example.org`. A sign-in in front of it (Authelia…) is offered by Atlas.
- **API token** (a secret): Paperless → your profile → API auth token; sent as `Authorization: Token …` by the core,
  never seen by the page.

## How it fits

- Its notes are the catalog's (the `paperwork` kind this plugin contributes, `[[contributes.catalog.kinds]]`):
  without the Catalog plugin the library, the reader, the block and the tools work; only **Its note** says it needs it.
- The catalog's Documents notes and this library share the Libraries page's Documents (one subject, two tabs).

## Platforms

Linux untested against a real Paperless (tried against a stand-in of its API); Android: `phone = true`; the others
untested.

## Status

Beta (`plugins/beta/`). Tests: `node --test plugins/beta/paperless/pl.test.mjs` (its logic on cut-down answers of
Paperless-ngx 2.x) and `ui/tests/paperless.spec.ts` (the block, the library, Open, sending, the agent's tools
against a stand-in).
