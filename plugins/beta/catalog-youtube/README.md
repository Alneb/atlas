# Catalog · YouTube

YouTube videos and YouTube Music songs for the catalog, kept with their clean address. A subplugin of the Library
(`catalog`).

- Recognised by shape: `youtu.be`, `watch`, `shorts`, `live`, `embed` and `music.youtube.com` links.
- Kept as the clean watch address (no `?si=` or other tracking), which is what a downloader is handed.
- Filled in from YouTube's oEmbed: title, channel, the largest thumbnail. A YouTube Music link is a song; its artist is
  the channel without " - Topic".

## Needs

The Catalog plugin (`requires = ["catalog"]`); nothing installed: the helper is JavaScript run inside Atlas's core
(`helper.js`, built from `helper/helper.ts`). Requests go through Atlas's core.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`node scripts/dev/plugin-ui.mjs --check plugins/beta/catalog-youtube` (types, the committed build, `helper/helper.test.ts` offline).
