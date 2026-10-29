# Paperless

Your Paperless-ngx documents in notes: a block that searches them, and `@paperless:<id>` mentions that show a
document's title and date. Each document is a link that opens it in Paperless.

## What it adds

- **The block `paperless.search`** (options: the search, at most how many): `GET /api/documents/?query=…`, each result
  with its date.
- **Mentions** `@paperless:12`: the document's title and date; the completion lists the 50 newest.

## Settings

- **Paperless server**: `https://paperless.example.org`.
- **API token** (a secret): Paperless → your profile → API auth token; sent as `Authorization: Token …` by the core.

## How it fits

No requirements.

## Platforms

Linux works; Android works (`phone = true`); the others are untested.

## Status

An example (`plugins/examples/`): small, working, meant to be copied. No tests.
