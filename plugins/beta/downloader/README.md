# Downloader

Captured songs (and any other kind you choose) sent to a download service on your server — MeTube, a yt-dlp web UI or
your own. It acts on what the Library (`catalog`) files: each catalogued thing of a chosen kind has its address handed
to the service with one request, shaped in Settings.

- The request's address and body are templates: `{url}`, `{kind}`, `{title}`, `{artist}`, `{id}` are filled in.
- Kinds not in the list are left alone; a body that is not valid JSON is reported before anything is sent.
- The request goes through Atlas's core, which adds the token; behind a sign-in such as Authelia, Atlas offers the
  sign-in.
- The note gets `downloaded: requested`.

For MeTube, for example: address `https://dl.example.org/add`, method POST, body
`{"url": "{url}", "quality": "best", "format": "mp3"}`.

## Settings

- **Request address**, **Method** (POST, GET, PUT), **Body (JSON)** (`{"url": "{url}"}`).
- **Kinds to send** (`song`).
- **Token header** and **Token** (optional; the token a secret): e.g. `Authorization` or `X-Api-Key`.

## Needs

A download service, the Library plugin (whose filed things it receives; the manifest does not `require` it), and
Nothing installed: the helper is JavaScript run inside Atlas's core (`helper.js`, built from `helper/helper.ts`).

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`node scripts/dev/plugin-ui.mjs --check plugins/beta/downloader` (the request the settings make, and what is left alone: `helper/helper.test.ts`).
