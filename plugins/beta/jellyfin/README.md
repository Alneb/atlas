# Jellyfin

What you watched lately on Jellyfin, in a block. Also a small example of a block over a media server's API.

- The `jellyfin.watched` block lists the films and episodes the user played, newest first, with the day each was
  last played (option: at most N, 10 by default).
- The API key is added by Atlas's core (as `X-Emby-Token`) and never reaches the page.
- Written against Jellyfin's 10.x API.

```view
type: jellyfin.watched
limit: 10
```

## Settings

- **Jellyfin server** (`https://media.example.org`).
- **User id**: Jellyfin → Dashboard → Users → the user's page, the id in its address.
- **API key** (a secret): Jellyfin → Dashboard → API keys.

## Needs

A Jellyfin server, a user id and an API key.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Tests

`ui/tests/example-jellyfin.spec.ts`.
