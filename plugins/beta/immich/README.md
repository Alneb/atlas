# Immich

Your Immich photos in Atlas. The photos stay on Immich (never a copy of the library); Atlas lists the newest, finds
one by what is in it, opens it in its image viewer, and sends a picture of the vault to Immich.

## What it adds

- **Photos**, a tab of the Libraries page (the command "Immich: photos"): the newest 2 000 photos and videos, by album and
  month (the side list: the albums first — the 40 biggest, each with all its photos, older ones too — then the months,
  newest first), the people Immich recognised as filters, each with its thumbnail and when, where and who under its
  name. The search box searches file names, places, people and descriptions; older photos come through the smart search.
  - **Open** keeps the photo with the local copies of remote files (`.atlas/remote/immich/photos/<id>/<file>`) and
    opens it in the image viewer — the original, or Immich's JPEG preview for a HEIC or raw file a page cannot draw.
    A video opens in Immich, which plays it.
  - **In Immich** opens its page there, in the system's browser.
- **Search by what is in them** ("Immich: search photos by what is in them…"): Immich's smart search ("a dog on the
  beach", "the whiteboard"), its answers listed as you type (an older Atlas asks first, then lists).
- **Send to Immich**, in the file and tab menus for a picture or a video, and "Immich: send the open picture": the file
  goes to Immich's upload (`POST /api/assets`, named for this device by its vault path, so sending it again is a
  duplicate Immich recognises). Needs an Atlas with plugin API 37 (the core's `multipart` fetch).
- **The block `immich.recent`** (option: how many): the latest photos as a strip of thumbnails, each a link into Immich.
- **A tool for agents** (`atlas mcp`): `immich_search`, the smart search answered with file, time, place, people, link.

Thumbnails are fetched by the core into the plugin's cache (`fetch` with `saveTo`) and shown from there: the API key
never reaches the page.

## Settings

- **Immich address**: `https://photos.example.org`. A sign-in in front of it (Authelia…) is offered by Atlas.
- **API key** (a secret): Immich → Account settings → API keys, with the asset and search permissions (upload too, for
  Send to Immich); sent as `x-api-key` by the core.
- **This device's name**: how Immich names the device a sent picture came from (default `atlas`).

## How it fits

No requirements. Not built yet: albums (a tab per album, an album's note through the catalog), picking a photo into a
note.

## Platforms

Linux untested against a real Immich (tried against a stand-in of its API); Android: `phone = true`; the others
untested.

## Status

Beta (`plugins/beta/`). Tests: `node --test plugins/beta/immich/im.test.mjs` (its logic on cut-down answers of
Immich's API) and `ui/tests/immich.spec.ts` (the block, the library and Open, the agent's tool, sending, against a
stand-in).
