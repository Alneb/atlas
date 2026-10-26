# Immich

Your latest photos from Immich as a strip of thumbnails in a note or a page. Also a small example of `atlas.fetch`
with `saveTo`: the pictures are fetched by Atlas's core into the plugin's cache and shown from there.

- The `immich.recent` block shows the newest photos (option: how many, 8 by default); each opens in Immich.
- The API key is added by Atlas's core and never reaches the page.
- Written against Immich's v1 API (`/api/search/metadata`, `/api/assets/<id>/thumbnail`).

```view
type: immich.recent
count: 8
```

## Settings

- **Immich server** (`https://photos.example.org`).
- **API key** (a secret): Immich → Account settings → API keys.

## Needs

An Immich server and an API key for it.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Tests

`ui/tests/example-immich.spec.ts`.
