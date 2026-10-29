# Downloader

Hands the address of a captured thing — a YouTube Music song, a video, an album page — to a download service on your
server, which fetches it into a library. A preset says which service:

- **MeTube** — `POST <address>/add` with the address, best quality, `mp3` for a song.
- **TubeArchivist** — the video archive: the YouTube id goes to its download queue (`POST /api/download/`,
  `Authorization: Token …`), and the note links the archived copy (`tubearchivist: <address>/video/<id>/`).
- **custom** — the request described in the settings (where, which method, and a body with the thing's values filled
  in), for a yt-dlp web interface or your own endpoint.

## What it adds

- `[contributes.catalog] links = [{ kind = "*", tool = "send" }]`: after the catalog files a thing of a kind listed in
  **Kinds to send**, `send` makes the request and the note gets the answer property (`downloaded: requested`, or
  TubeArchivist's link). A note that already has that property is not sent again, so a catalog **Update** does not
  queue the same thing twice.
- The tool `send` (`downloader_send` for agents).

## Settings

- **Service** (`custom`): `custom`, `MeTube` or `TubeArchivist`.
- **Address**: the service's address (`https://tube.example.org`); for custom, the request's address, where `{url}`,
  `{id}`… may appear (URL-escaped).
- *custom only*: **Method** (POST, GET or PUT); **Body (JSON)** (`{"url": "{url}"}`: `{url}`, `{kind}`, `{title}`,
  `{artist}`, `{id}` are filled in, JSON-escaped; a body that is not JSON is reported before anything is sent);
  **Token header** (the header the token goes in: `Authorization`, `X-Api-Key`).
- **Token** (optional, a secret): TubeArchivist's API token (Settings → Integrations), or custom's; put in by Atlas's
  core, never seen by the helper.
- **Kinds to send** (`song`): the catalog kinds handed over; others are left alone. TubeArchivist takes only things
  with a YouTube id (videos, YouTube Music songs).
- **Send every captured thing** (on): off, a thing is sent only when its kind's rule asks for it
  (`links: { downloader: { send: true } }`).
- **Property it writes** (*More*; empty: `downloaded`, TubeArchivist `tubearchivist`).

Behind a sign-in proxy (Authelia and the like), Atlas offers the sign-in.

## How it fits

No `requires`: the contribution is used while the catalog runs; videos and songs come from Catalog · Open sources. It
replaces the **TubeArchivist** plugin (`replaces`): installing it carries TubeArchivist's address, token and switch
over, with the TubeArchivist preset and `video` as the kind to send — unless this vault had Downloader set up already,
whose own settings win (TubeArchivist's settings file is then in `.atlas/trash/`). One service per vault.

## Platforms

Linux works; the others are untested. The helper is JavaScript run inside Atlas's core.

## Status

Beta. Unit tests in `helper/helper.test.ts` (custom, MeTube, not sending twice) and `helper/tubearchivist.test.ts`.
TubeArchivist's request was written from its REST API; check it against your server's version.
