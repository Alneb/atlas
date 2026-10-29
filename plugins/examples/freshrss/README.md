# FreshRSS

Your FreshRSS unread articles in a block, and an article into a note with a click. Also an example of a block fed by
`atlas.fetch`, through FreshRSS's Fever API, with the key filled into the form by the core so it never reaches the page.

## What it adds

- **The block `freshrss.unread`** (option: at most how many, 15): the unread articles as links; each has **Save**.
- **Save** writes `<folder>/<title>.md` with `type: article`, `source:` and `saved:` properties and the article's text
  (never over an existing note), then opens it.

## Settings

- **FreshRSS address**: `https://rss.example.org`.
- **Fever API key** (a secret): the md5 of `user:API password` (FreshRSS → Settings → Profile → API password).
- **Folder for saved articles** (`notes/reading`).

## How it fits

No requirements. Its notes are written by the plugin itself, not by the catalog: they do not get the catalog's
metadata, and the same article captured as a link becomes a second note in the catalog's web pages.

## Platforms

Linux works; Android works (`phone = true`); the others are untested.

## Status

An example (`plugins/examples/`): small, working, meant to be copied. No tests.
