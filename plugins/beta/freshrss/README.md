# FreshRSS

Your FreshRSS unread articles in a block, and an article into a note with a click. Also a small example of a block fed
by `atlas.fetch`.

- The `freshrss.unread` block lists the unread articles (option: at most N, 15 by default); each opens in the browser.
- "Save" makes a note of the article in the folder of the settings: its title, `type: article`, its `source` and the
  day it was saved, and its text.
- It talks to FreshRSS's Fever API; the key is filled in by Atlas's core, so it never reaches the page.

```view
type: freshrss.unread
limit: 15
```

## Settings

- **FreshRSS address** (`https://rss.example.org`).
- **Fever API key** (a secret): the md5 of `user:API password` (FreshRSS → Settings → Profile → API password).
- **Folder for saved articles** (`notes/reading`).

## Needs

A FreshRSS server with the API enabled.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Tests

`ui/tests/example-freshrss.spec.ts`.
