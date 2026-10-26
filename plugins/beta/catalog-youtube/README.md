# Catalog · YouTube

YouTube videos and YouTube Music songs for the catalog, kept with their clean address. A subplugin of the Library
(`catalog`).

- Recognised by shape: `youtu.be`, `watch`, `shorts`, `live`, `embed` and `music.youtube.com` links.
- Kept as the clean watch address (no `?si=` or other tracking), which is what a downloader is handed.
- Filled in from YouTube's oEmbed: title, channel, the largest thumbnail. A YouTube Music link is a song; its artist is
  the channel without " - Topic".

## Needs

The Library plugin (`requires = ["catalog"]`) and Python 3 on the machine running Atlas's server (`helper.py`;
standard library only). Requests go through Atlas's core.

## Platforms

Linux works; the others are untested; not in the phone app.

## Tests

`python3 test_helper.py` (offline), `python3 test_helper.py --live` (asks YouTube's oEmbed).
