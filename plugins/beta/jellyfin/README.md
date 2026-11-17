# Jellyfin

Your Jellyfin films and series in Atlas: a library to choose from, a film played in mpv from where you left it, where
you are written back to Jellyfin, and the film's note open beside it, to write in while you watch.

## What it adds

- **Films and series** on the Libraries page (command "Jellyfin: films and series"): what you watched or started —
  posters, how far you are, watched marks, genres as groups, sorted by last watched, title or year. A film's card:
  **Watch** (or *Go on watching*), **Its note**; a series': **Next episode** (Jellyfin's next up, else the first) and
  **Episodes…** (every episode in the chooser, watched or how far, a pick plays it).
- **The server's own tab** (the **Jellyfin** button in the library's header, or the command "Jellyfin: the server's
  films and series"): everything on the server, yours or not — Continue first, then every cover, All / Films / Series
  and a filter; a click plays a film or asks a series' episode. A film enters the library once you watch it.
- **Watching** plays the file as it is on the server (no transcoding) in the app's player: on the desktop that is
  **mpv in its own window** (every codec, the subtitles and audio tracks in the file and the server's subtitle files beside it, your own
  `mpv.conf`), shown and
  controlled in the lower bar like an audiobook. The token goes in through Atlas's core (`atlas.media`): the page and
  mpv never see it.
- **Where you are goes back to Jellyfin**: the play session is opened, kept up every 15 s and on pause, and stopped at
  the end or on close — Jellyfin's "continue watching" and played marks stay right, on its other apps too.
- **Notes while watching**: a film's or a series' note is the catalog's (Catalog · Films & Series), found by its
  TMDB/IMDb ids wherever it is (docs/design/DESIGN-server-libraries.md: one note per thing, made when it becomes yours).
  A film you go on watching (past its start) opens beside the player with its note; one you have only just started has
  none until you ask: **Its note** makes it (with what Jellyfin knows — title, year, genres, synopsis —
  below what the catalog's sources say). An episode's note is its series'. Without the Catalog plugin there are no
  film notes. In it:
  - **Super+Alt+T** writes the time as a link, `[[Arrival (2016)#t=1:02:03]]` — a click on it later seeks the film
    there;
  - **Super+Alt+S** quotes the subtitle shown, with its time;
  - **Super+Alt+F** attaches the frame shown (into the note's attachment folder) with its time.
- **The block `jellyfin.watched`** (option: at most how many, 10): what you watched lately, newest first.

## Settings

- **Jellyfin address**: `https://media.example.org`.
- **Access token** (a secret): filled by the command **"Jellyfin: sign in"** — Jellyfin's Quick Connect: Atlas shows a
  code, you approve it in Jellyfin (your user menu → Quick Connect), no password typed here. Or paste an API key
  (Dashboard → API keys). A sign-in gate in front of the server (Authelia…) is passed as for any plugin (Settings →
  Sign-ins).
- **This device's id** (`atlas`).

## How it fits

The logic without a page is `jf.js` (`node --test plugins/beta/jellyfin/jf.test.mjs`); the helper
(`helper/helper.ts` → `helper.js`) only turns the player's reports into Jellyfin's session requests. The video engine
is the core's (`mpv.rs`); on the phone a film still plays its sound only, until mpv is built into the app
(docs/design/DESIGN-video-player.md). Not yet: live TV.
