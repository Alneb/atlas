# TubeArchivist

Captured videos archived on your TubeArchivist: a YouTube video filed by the Library (`catalog`) is queued for
download there, and its note links the archived copy (the `tubearchivist:` property).

- One request per video (`POST /api/download/`), through Atlas's core, which adds the token; behind a sign-in such as
  Authelia, Atlas offers the sign-in.
- Only YouTube videos are sent; anything else is left alone, and the reason is said.
- Written from TubeArchivist's REST API; check it against your server's version.

## Settings

- **TubeArchivist address** (`https://tube.example.org`).
- **API token** (a secret): TubeArchivist → Settings → Integrations → API token.
- **Archive every captured video** (on): off, a video is archived only when asked.

## Needs

A TubeArchivist server, the Library plugin (whose videos it receives; the manifest does not `require` it), and
Nothing installed: the helper is JavaScript run inside Atlas's core (`helper.js`, built from `helper/helper.ts`).

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`node scripts/dev/plugin-ui.mjs --check plugins/beta/tubearchivist` (the request TubeArchivist gets, and what is left alone: `helper/helper.test.ts`).
