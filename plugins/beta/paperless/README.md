# Paperless

Your Paperless-ngx documents in a note or a page: a block that searches them, each one a link that opens it in
Paperless. Also a small example of a block fed by `atlas.fetch`.

- The `paperless.search` block lists the documents matching a search (options: the search, at most N, 10 by
  default), with each document's date.
- **`@paperless:<id>`** in a note names a document: it shows its title and date (the 50 newest are offered as you
  type).
- The token is added by Atlas's core (`Authorization: Token …`) and never reaches the page.

```view
type: paperless.search
query: invoice
```

## Settings

- **Paperless server** (`https://paperless.example.org`).
- **API token** (a secret): Paperless → your profile → API auth token.

## Needs

A Paperless-ngx server and an API token.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Tests

`ui/tests/example-paperless.spec.ts`.
