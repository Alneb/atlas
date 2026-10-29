# Immich

Your latest Immich photos as a strip of thumbnails in a note or a page. Also an example of `atlas.fetch` with
`saveTo`: the thumbnails are fetched by the core into the plugin's cache and shown from there, so the API key never
reaches the page.

## What it adds

- **The block `immich.recent`** (option: how many, 8): one search (`POST /api/search/metadata`, newest first), each
  thumbnail fetched and linked to the photo on the server.

## Settings

- **Immich server**: `https://photos.example.org`.
- **API key** (a secret): Immich → Account settings → API keys.

## How it fits

No requirements.

## Platforms

Linux works; Android works (`phone = true`); the others are untested.

## Status

An example (`plugins/examples/`): small, working, meant to be copied. Written against Immich's v1 API; check it against your server's version. No tests.
Thumbnails are fetched one after another.
