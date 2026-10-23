# Capturing what another app shows (design)

The user (2026-10-16): *"also please is there a way to make accesibility copy the youtube link from the app that would be amazing, also the song from youtube music for example, and from other apps such as instagram, etc"*.

## What Android allows, per kind of thing

| what | the reliable way | what it gives | permission |
|---|---|---|---|
| a YouTube video, an Instagram post, a page in any browser | **the share sheet**: Atlas as a share target (`ACTION_SEND`, text/plain) | the app's own link (`https://youtu.be/…`, `https://www.instagram.com/p/…`) and usually a title | none |
| the song playing (YouTube Music, Spotify, a podcast app) | **the system's media sessions** (`MediaSessionManager.getActiveSessions`, needs a notification listener) | title, artist, album, the app, the position; YouTube Music also gives the video id in its metadata on some versions | "notification access", granted once in system settings |
| anything else on screen, with no share button | **an accessibility service** reading the current window's view tree | the visible text (a title, a channel, a caption), the app's package, sometimes a URL in a browser's address bar | "accessibility", granted once; Google Play restricts it (fine for a sideloaded app) |

So the link from YouTube or Instagram is best taken from their own **Share** (one tap: Share → Atlas). The accessibility route cannot get YouTube's link: the app does not show it as text anywhere. It can only read the title and the channel, and a search would then have to find the video.

## The proposal: one gesture, the best source first

A quick-settings tile and a home-screen shortcut, **"Capture this"**:

1. If media is playing: the media session gives *"Song — Artist (YouTube Music)"* with a link built from what it carries (a YouTube Music or Spotify URL when the metadata has the id, else a search link).
2. Otherwise, the accessibility service reads the foreground app: its package name (→ "YouTube", "Instagram"), the largest text on screen (the title), and any URL-shaped text (a browser's address bar).
3. Either way the capture box opens pre-filled, as the share target already does, so the user sees what was taken before saving.

The share target stays the main way for links. The tile is for "what is this song" and for apps with no share button.

Each capture becomes a note through the catalog (recognise the URL, fetch the metadata, file it in its kind's library), so a YouTube link turns into a video note with its title, channel and thumbnail. That work belongs to the catalog session.

## Steps

1. Check the share target in atlas-capture.apk with YouTube, YouTube Music and Instagram links (it exists; confirm what each app sends).
2. The media-session reader (NotificationListenerService) and the tile.
3. The accessibility service (an `accessibilityservice` XML limited to window content, no gestures), off by default, with its setting explaining what it reads.

## Built (2026-10-16) — steps 2 and 3, and the YouTube address

The user, the same day: *"so its important that for youtube and ytmusic you get the url, because the idea will be to pass that to either tubearchivist or another app that downloads yt music into the music library"*. So a YouTube or YouTube Music capture always ends with the item's **watch address**; the hand-off (TubeArchivist for videos, a music downloader into the music library for YT Music) is the catalog's link step ( lane — told).

- **What is playing** (`Playing.java`, `MediaListener.java`): when the box opens it reads the system's media sessions — the one playing, else the one paused most recently — and offers a chip with the music icon: *Song — Artist*, off until tapped. On save it adds `[Song — Artist](address) (App)`. Android shows media sessions only to an app with **notification access**, so a `NotificationListenerService` exists that reads no notification; Settings → *Capture quickly* → **What is playing** (on / off · turn on) opens the system's page for it (this app's own row on Android 11+).
- **The address, by shape** (`Playing.link`): any `http(s)` address the session carries (media id, media URI); a `spotify:track|episode|album|show:…` URI → `open.spotify.com/…`; from an app whose package says `youtube`, a video id that is the whole media id or follows `v=` → `music.youtube.com/watch?v=…` (a package saying `music`) or `www.youtube.com/watch?v=…`. Never any 11 letters inside a longer id.
- **When a YouTube app's session carries no id**: YouTube's own search for "title artist" (`www.youtube.com/results`, the first `videoRenderer` — ads and shelves are other renderers; a consent cookie for the countries that get a consent page; 4 s / 5 s timeouts, off the main thread). The chip then reads *· link by search*; offline it reads *· no link*. Checked against a real results page (2026-10-16: "Never Gonna Give You Up Rick Astley" → `dQw4w9WgXcQ`).
- **Clean addresses** (`Links.untracked`): shared text and a browser's address lose the share-tracking parameters — `si` (YouTube, Spotify), `igsh`/`igshid` (Instagram), `fbclid`, `gclid`, `utm_*`, `feature=share…` — on any site; other parameters (`v`, `list`, `t`, `q`) stay.
- **Apps that are not browsers** (`Page.read`, accessibility, step 3): with no address on screen, the visible one-line text whose view id says `title`, else the longest one-line text (8–160 characters, with a space, not an address) is offered as a chip, off: *Title (App)*. A guess, so never on by default.
- Checks: `Playing.link`, `Playing.firstVideo`, `Links.untracked` — 13 cases run on the desktop JVM against android.jar (they are plain Java); the whole app compiles (javac). Not yet seen on a phone or the emulator.

Not done: an accessibility walk through YouTube's own Share → Copy link (fragile: it depends on the app's layout and language); the share target checked with each app's real share (step 1) — on the user's phone.

## Built (2026-10-21) — the app's own thing, not only a screenshot

The user: *"the android app it would be amazing if it could recognize better the youtube video we are in, or the spotify song, or even the letterbox page inside the app as well as the wikipedia one"*. `Onscreen.java` (plain Java, tested on the desktop JVM) recognises YouTube, YouTube Music, Spotify, Letterboxd and Wikipedia in their apps and in any browser: the address made canonical, the title cleaned; in an app with no address on screen, the app's own media session (YouTube, Spotify), else a lookup (Letterboxd's film slug checked against the year, Wikipedia's summary, YouTube's search). The details and the per-site table: docs/guides/ANDROID.md, "What is on screen".
