# Audiobooks: Audiobookshelf first, a player on the desktop and the phone

## What was asked

Audiobooks on the phone and the desktop (not the Boox), integrated with Audiobookshelf: Audiobookshelf first (e.g.
`audiobooks.example.org`), local `m4b` / `mp3` folders too. (2026-10-19)

Part of the libraries plan (DESIGN-libraries-everywhere.md, step 6). Not built yet: this file is the plan and the one
question that decides its shape.

## What exists

- `plugins/beta/catalog-audiobookshelf` (0.1.0): the server's address and API token as this vault's settings (the token
  a secret, outside the vault); a book catalogued anywhere is looked up there (narrator, listening time, a link), and
  `sync` files the server's library as book notes. No playing.
- The Libraries page and `atlas.registerLibrary` (a source per library), `atlas.fetch` (the core makes the request:
  no CORS; a secret is filled in by the core, `{ secret: name }`, never seen by the page).

## The plan

1. **An `audiobooks` plugin** (web side: desktop and phone; not marked for the Boox) registering an **Audiobooks**
   library: the server's libraries (`GET /api/libraries`), their items (`GET /api/libraries/<id>/items`: title, author,
   narrator, duration, series; the cover `GET /api/items/<id>/cover`), where you are in each (`GET /api/me/progress/<id>`),
   shelves by series and author, "Continue listening" first.
2. **A player pane**: chapters (from the play session), speed (0.8–2.5×), a sleep timer (end of chapter, 15/30/60 min),
   ±30 s, the position written back to Audiobookshelf every 15 s and on pause (`POST /api/items/<id>/play` → a session;
   `POST /api/session/<sid>/sync` {currentTime, timeListened}; `…/close`) and into the book's note (`listening_at`,
   `last_listened`, as the readers write `reading_at`), so the phone and the desktop carry on from each other.
3. **Local files** next: a folder of the vault (`audiobooks/`), one book per folder or `.m4b`, chapters from the file's
   own marks, the position in the book's note only.

## The question (asked of the user before building)

The player's `<audio>` element fetches the audio itself. Audiobookshelf wants its **token** on every audio request
(`Authorization: Bearer`, or `?token=` in the address), and Atlas's rule is that a plugin's secret never reaches the
page (PLUGIN-API.md: the core fills it in). Two ways:

1. **(recommended) The core streams a plugin's media** — a new generic piece: `atlas.media(url, { headers: { Authorization:
   { secret } } })` gives the page a local address (`/api/plugins/<id>/media/<token>`) that the core serves by asking
   the server with the secret added, passing `Range` through (seeking) and the bytes as they come. Any plugin with media
   behind a secret (Jellyfin, Immich, a podcast feed) gets it. Cost: a core route with range support and its tests.
2. **The token in the page** (`?token=` in the audio address): no core work, but the token is in the page's memory and
   in the address the WebView keeps — against the rule above.

On the phone the WebView plays while the app is in front; listening with the screen off needs a native player (a media
session service) — later, if the user wants it.
