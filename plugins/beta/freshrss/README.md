# FreshRSS

Your FreshRSS feeds in Atlas: a reader with your feeds, their unread counts and the articles, the read and starred
marks kept on FreshRSS (so its web page and your phone's app agree), an article kept as a note when it matters, the
unread ones in a block, and tools for agents.

## What it adds

- **The reader** (the command "FreshRSS: read"): the feeds on the left by folder, with **All articles** and
  **Starred**; the articles of the one chosen in the middle (unread ones bold, only the unread by default, more as you
  scroll); the article on the right. Opening an article marks it read on FreshRSS. Under its title: **Star**,
  **Mark unread**, **Keep** (a note of it, beside), **Open** (its page, as Atlas opens links). Keys while the reader
  has them: `j` / `k` next and previous, `s` star, `m` read or unread, `o` open, `v` keep.
  - The article's HTML is cleaned by the core's one cleaner of untrusted HTML (the mail reader's: no scripts, frames,
    forms, handlers) and drawn in the mail reader's own sandboxed frame, in the app's colours (a dark theme remaps the
    article's own). Its pictures load from the feed's site unless "Show the articles' pictures" is off.
- **The block `freshrss.unread`** (option: at most how many): the unread articles with their feed, each with **Save**,
  and a way into the reader.
- **Keep / Save** writes `notes/reading/<title>.md` (the folder is a setting): `type: article`, the source, the feed and
  the day as properties, the article's text as the body. A note already there is never written over.
- **Tools for agents** (`atlas mcp`): `freshrss_unread` (the unread articles), `freshrss_read` (one article's whole
  text, no HTML), `freshrss_save` (Keep).

## Settings

- **FreshRSS address**: `https://rss.example.org`.
- **Connect with**: `greader` (the default: the Google Reader API — folders, unread counts, read and starred marks) or
  `fever` (the older Fever API, one key).
- Google Reader: **User name** and **API password** (FreshRSS → Settings → Profile → API password; Administration →
  Authentication → Allow API access). The password is sent once by the core, as ClientLogin's form field; the session
  token stays in the helper's memory and is renewed when FreshRSS forgets it.
- Fever: **Fever API key** (the md5 of `user:API password`), filled in by the core as Fever's form field.
- **Folder for kept articles** (`notes/reading`), **Show the articles' pictures** (on).

## How it fits

No requirements. Everything goes through the helper (run in the core, `helper/helper.ts`): the page never holds a
password, a key or a token, and the phone and agents read the same way.

## Platforms

Linux untested against a real FreshRSS (tried against stand-ins of both APIs); Android: `phone = true`; the others
untested.

## Status

Beta (`plugins/beta/`). Needs plugin API 37 (`atlas.html.clean`). Tests: `node --test plugins/beta/freshrss/fr.test.mjs`
(both APIs' answers into one article shape, the marks) and `ui/tests/freshrss.spec.ts` (the block, Save, the tools over
Fever; the reader over Google Reader: sign-in, feeds, an article cleaned in the frame, marked read).

## Notices of new articles

With **Tell me of new articles** on (Settings → Plugins → FreshRSS), the `check` round runs every 30 minutes and
sends one notice of the unread articles that came since the last round (it replaces the last one; opening it opens
FreshRSS). The first round only notes the time. What a round saw is kept in `.atlas/cache/freshrss.json`.
