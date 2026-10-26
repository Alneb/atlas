# Manga

Manga and comics like Mihon (Tachiyomi): a vault folder per series (its chapters are `.cbz` files or folders of
pictures) and a Suwayomi server (`suwayomi` setting, e.g. `https://manga.example.org`). Two sides
:

- **web** (`main.js`, `view.js`, `suwayomi.js`): the library and series pages, on the desktop, the server and the
  phone's Libraries page (Comics);
- **native** (`android/`): the reader on the phone and the Boox (it is native because of the pen). The web library
  hands it a chapter with `atlas.openNative(path)`: a vault `.cbz`, a vault folder of pictures, or a Suwayomi chapter
  `suwayomi:<chapter id>/<chapter name>` (a "/" in the name written "∕").

## The native reader

The user, on the Boox Note Air 5C: *"the manga app works really bad its really slow images don't load, it should
resemble as well mihon UI"*; *"the reader just straight up not rendering anything in manga, and it takes a while to
load the server and it says there is nothing there in the meantime"*; *"the pages that dont render is probably jxl but
there is no navigation in the manga reader"*. Then: *"books and manga are native because of the pen, but the catalog
does not need to be native — only the reader itself"* — so the native library and series screens were removed and
the library lives on the web side only.

### What was measured

- The user's Suwayomi serves pages as **JPEG XL** (`content-type: image/jxl`, the ISO box container
  `00 00 00 0C 4A 58 4C 20 …`), ~3.2 MB for a 1725 × 2475 page, **~4.5 s per page** to fetch; not a recompressed JPEG
  (jxl-oxide's `jpeg_reconstruction_status` is `Unavailable`), so there is no cheap path through BitmapFactory.
  Covers are AVIF.
- The app's JPEG XL decoder (`crates/atlas-android/src/image.rs`, jxl-oxide, through `Images.decode` /
  `Core.decodeJxl`) **does work on the Boox**: run in the installed APK's classes with `app_process` (a probe class,
  nothing tapped on the device): 1725 × 2475 in **~1.8 s** (jxl-oxide uses all cores through rayon; on this computer
  1.0 s on one thread, 0.37 s on four).
- On the Boox `BitmapFactory` gives null for AVIF; `ImageDecoder` reads its header but its decode did not finish in a
  shell process (it waits on a codec), so it is only tried for ISO-BMFF pictures (`ftyp` at byte 4), never for
  everything BitmapFactory refuses.

### The causes found (in the code before this change)

1. **Blank pages**: `ReaderView.show()` decoded a page for `getWidth() × getHeight()` — 0 before the view is laid
   out, clamped to 1 — so the first page of a vault chapter (opened in the constructor) and the page decoded ahead
   came out 1 × 1 pixel: nothing on screen. Pages are now decoded for the display's size (`DisplayMetrics`), never
   the view's.
2. **Slow, and stuck**: one single-thread executor did both the 4.5 s fetch and the ~2 s decode of every page, one
   after the other, and every page turned queued another job that ran even after you had moved on — five quick
   turns meant half a minute before the page you are on. A failed decode gave a blank page with no word.
3. **"Nothing there" while the server loads**: the native library showed "Nothing in manga/ yet" until Suwayomi
   answered, and covers, the server's library and opening a series all queued on one thread (a series opened only
   after every cover before it). The native library is gone now (the web side has it).
4. **The UI thread**: every page turned read and rewrote the series' note on the UI thread (`Library.mark`), and a
   vault chapter's `.cbz` was opened there (for a server's vault, a download).

### What changed

- **`Pages.java`** (new): a chapter's pages for the reader. Bytes fetched on a pool of 3 (Suwayomi pages in parallel;
  each kept whole in `cacheDir/suwayomi/<chapter>/<page>`, written to a `.part` and renamed so a cut-off fetch never
  leaves half a picture), decoded on a pool of 2 at the size shown, kept in a 128 MB LRU. Only pages near where you
  are are worked on (one behind, three ahead, the next chapter's first two): a page turned past is dropped before it
  costs a fetch or a decode, by path (a chapter opened again shares its pages). A failure answers with the reason in
  words (a web page instead of a picture: signed out; an AVIF the device cannot read; …). Out of memory empties the
  cache instead of killing the app.
- **`ReaderView.java`**: pages through `Pages` — from memory at once, else "Page N of M…" in the middle until it
  comes, or why it cannot; the next three and the one before asked for behind it; near a chapter's end the next
  chapter is opened and its first pages fetched, so going on costs no wait. Mihon's navigation: tap zones (sides turn,
  middle shows the bars; vertical and webtoon use top / bottom), the volume keys (their release taken too), the
  chapter list from the **top bar** (where you are in each, read ones quiet), at the bottom the chapter's title,
  "page N / M · chapter i / n", a page slider (mirrored for right to left; the page is opened when it is let go, not
  for every page passed), **Previous chapter / Next chapter**, Pen, Clear page, and **Settings**: reading mode (right
  to left, left to right, vertical, webtoon), scale (fit screen, fit width), inverted taps, volume keys, and on e-ink
  the full refresh every N pages. A mode or scale changed makes the reader again at the same page; it is kept in the
  series' note (`reader_options`) — a Suwayomi series has no note, so there it is the plugin's setting. On e-ink no
  animation (webtoon scrolls by a screen at once). Webtoon has a place per page, fills the pages near you and lets
  go of the far ones (their height kept, so nothing jumps), and goes on to the next chapter at the end.
- **`MangaScreen.java`**: now only the reader's frame. It takes the path handed over, finds the series away from the
  UI (a vault chapter's folder, listed; a Suwayomi chapter's manga, asked with `chapter(id) { manga { id title } }`
  and its chapters), opens at the page it was left on (a chapter read through starts again at its first page), and
  "Opening …" is shown meanwhile. A folder that holds no chapter goes back to the app (`host.openInWeb`).
- **`Manga.java`**: `place()` removed (the native library is no longer reachable); `opens()` takes a `.cbz`, a
  `suwayomi:` chapter, and a folder chapter handed with its trailing "/" (view.js's `chaptersOf` lists folders that
  way). Nothing else: `openPath` asks the app of every path, and an unresolved `[[Foo]]` has no extension either —
  claiming extensionless paths by their shape sent such links to the reader and back (narrowed in d1c6ca03).
- **`Library.java`**: where you are is saved behind the UI on one thread, the newest place per chapter only (pages
  turned fast write once; a chapter finished keeps its "read" when the next begins); one `place()` keeps the reader's
  copy and the note / the server in the same shape; a chapter read before stays read when read again. `scan`,
  `setRead` and the cover/unread fields went with the native library.
- **`Suwayomi.java`**: `series(chapter)` for the reader; `library()` and `cover()` went with the native library; no
  server set is said in words.
- **Removed**: `LibraryView.java`, `SeriesView.java` (the native library and series screens).

### Left

- AVIF pages inside a `.cbz` depend on `ImageDecoder` in the app (not checked on the device; the user's Suwayomi
  pages are JPEG XL, which is checked).
- A JPEG XL page still costs ~2 s to decode the first time on the Boox (prefetch hides it while reading on); a
  decoded copy kept on disk would make reopening a chapter instant — not done.
- Scale "fit height" and "original" behave as "fit screen".

## A `.cbz` opens here on a click

`claims = ["*.cbz"]` (plugin API 7; it was only "Open with…"): a `.cbz` clicked in the file tree, linked or picked in the palette opens in the web reader, unless a vault rule (Settings → Files & search → Open with) names another view. `.cbr` (RAR) is not claimed: the web side reads zip only.

## The web side and JPEG XL

On the desktop the Libraries page froze ~5 s after Comics was shown and WebKit killed it ~2 min later. Cause: one
Suwayomi cover (of 12 seen) is a JPEG XL codestream, and WebKit's decoder hung on it (`img.decode()` never settled in
Playwright's WebKit; AVIF, JPEG and WebP decoded). The pages are JPEG XL too, so the desktop reader could not have
shown them either (Chromium has no JXL decoder at all). Now every Suwayomi picture — covers at 300 px, pages at 2048 —
and a folder chapter's pictures are shown through `atlas.thumbUrl`: the core decodes JPEG XL itself (jxl-oxide, the
same decoder as the phone's) and answers PNG, and a 1500 × 2250 AVIF cover is no longer decoded to be shown 140 px
wide. A picture inside a `.cbz` is still unzipped in the page (JPEG XL is not in its picture pattern). Spec:
`example-manga.spec.ts` serves the stand-in server's cover as JPEG XL and waits for it to be decoded.

## The pen's ink

What the pen writes on a page (the Boox reader, `PageInk`) is kept by the core in the **series' note**, a
```` ```pdf-marks <chapter> ```` block per chapter, exactly as a PDF's marks are kept in its note
(docs/design/DESIGN-pdf-notes.md): pages from 1, places in fractions × 1000 of the page. The Boox writes it through
`InkStore.pictures`; the web reader reads it with `atlas.marks(chapter)` and draws it over the page with
`atlas.marksSvg` (plugin API 14; an older Atlas shows no ink). A server's (Suwayomi) chapter has no ink: it has no
vault file. (Before 0.5.0 the ink was a `<chapter>.ink.json` beside the chapter.)
