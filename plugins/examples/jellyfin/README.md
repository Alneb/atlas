# Jellyfin

What you watched lately on your Jellyfin server, in a block. Also an example of a block over a media server's API.

## What it adds

- **The block `jellyfin.watched`** (option: at most how many, 10): the user's played films and episodes, newest first,
  with the date last played. One request; the key goes in as `X-Emby-Token`, put in by Atlas's core.

## Settings

- **Jellyfin server**: `https://media.example.org`.
- **User id**: Jellyfin → Dashboard → Users → the user's page: the id in its address.
- **API key** (a secret): Jellyfin → Dashboard → API keys.

## How it fits

No requirements, and no `[contributes.catalog]`: it does not link catalogued films to Jellyfin, although parts of the
plugin documentation use it as the example of a service plugin that does.

## Platforms

Linux works; Android works (`phone = true`); the others are untested.

## Status

An example (`plugins/examples/`): small, working, meant to be copied. Written against Jellyfin 10.x; check it against your server's version. No tests.
