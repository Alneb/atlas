# Native Android plugins

The requirement (2026-10-16): two plugins are native in both Android builds — which also fixes the codec problem — with Android plugins kept separate from JavaScript or server plugins, even though the same plugins also exist as web plugins. The two: **manga** (Tachiyomi / Mihon-like) and **books** (EPUB) — docs/design/DESIGN-pen-eink-reader.md.

## The shape

A plugin is still one folder (`plugins/<tier>/<id>/`). Its sides:

| side | files | runs in | declared by |
|---|---|---|---|
| web | `main.js`, `view.js` | the page (desktop, server's browser, the apps' WebView) | `plugin.toml` (API 4, docs/guides/PLUGIN-API.md) |
| helper | `helper.py` / a binary | beside the core | `[helper]` |
| **android** | `android/*.java` (package `org.atlas.plugins.<id>`) | the Atlas and Atlas-for-Boox apps, natively | **`[android]`** |

```toml
[android]
main = "org.atlas.plugins.manga.Manga"   # implements org.atlas.capture.NativePlugin
opens = ["*.cbz"]                        # files the app opens with it instead of the web pane (no .cbr: RAR is not read)
place = "Manga"                          # an entry of its own in the app (optional)
```

A plugin with both sides is "duplicated" on purpose: the web side for the desktop and the server, the native side where it does better — the codecs (Android decodes JPEG, PNG, WebP, GIF, AVIF and HEIF itself; JPEG XL by the app's Rust library, `jxl-oxide`, pure Rust), the e-ink refresh per page (`Look.fullRefresh`: Onyx's own call), the pen (PenView, Onyx's instant ink), memory (pages decoded at screen size, not whole).

## Compiled in, never loaded from the vault

The native side is **built into the APK** (`build-apk.sh` compiles every `plugins/*/*/android/*.java` with the app and generates `NativePlugins.java`, the list of `[android] main` classes — through `crates/atlas-android/native-plugins.sh <out/NativePlugins.java>`, which finds every `plugins/<tier>/<id>/plugin.toml` whose `[android]` table has `main`, prints its `android/` folder for javac, refuses a `main` with no `android/` folder, and writes `NativePlugins.ALL` / `byId(id)`). The app never loads code it finds in a vault: a vault syncs from other machines, and a signed APK that runs only what it was built with cannot be made to run anything else. The price: a new native plugin needs a new APK — the same as any app's features. Each vault still switches plugins on and off (`[plugins] off`), and a native side is offered only while its plugin is installed and on in that vault.

**Changed 2026-10-18: native Android plugins do not depend on being installed in a particular vault; they just work, and a TOML file can turn them off.** A plugin built into the app now runs in **every** vault, on the device or on a server, whether the vault has a folder for it or not, and whatever the vault's own copy of its `plugin.toml` says (an older copy the core refuses, a broken one). The one thing that stops it is the vault's `.atlas/config.toml`:

```toml
[plugins]
off = ["notepad"]   # this vault opens drawings in the web Excalidraw instead
```

How: every plugin row the app reads (`phone.rs::plugins` for a vault here, `VaultFiles.plugins` for a server's) carries `off` (listed in `[plugins] off`) beside `on` (the core's verdict: it loads and its requirements run); `VaultFiles.on(all, id)` reads `!off` for a built-in plugin and `on` for any other. The form a built-in plugin's settings are drawn from is the manifest the app carries (`VaultFiles.plugin`), so a vault without its folder still has its settings; the folder is written on the first save. Test: `phone.rs` `a_broken_copy_cannot_run_but_is_not_off`.

## The contract (`org.atlas.capture`)

- `NativePlugin`: `id()`, `opens(path)`, `place()` (or null), `View view(Host host, String path)` — `path` a vault path to open, or `""` for the plugin's own place.
- `NativePlugin.Back`: a plugin view with places inside it (manga: library → series → reader) implements `boolean back()`; `PluginActivity.onBackPressed` asks it first, and only a `false` (at its top) leaves the plugin.
- `Look` is public: its palette (`bg`, `text`, `muted`, `faint`, `accent`, …), `dp`, and its widgets (`label`, `button`, `heading`, `card`, `row`, `round`, `pressable`, `icon`) — so a plugin's screens look like the app's.
- The core's manifest knows `[android]` (`AndroidManifest`: `main`, `opens`, `place`; unknown keys refused like the rest of plugin.toml). Before this the manifest's `deny_unknown_fields` would have listed a plugin with an `[android]` table as broken on the desktop; `plugins::tests::every_shipped_plugin_manifest_parses` now parses every `plugins/*/*/plugin.toml`.
- `Host` (`crates/atlas-android/android/java/org/atlas/capture/Host.java`): what a native side may do, nothing more. Every public member, by group (vault paths are relative to the vault; a path resolving outside it is refused — `IOException` "outside the vault", or `false` / `0` / empty from the calls that do not throw):
  - **The app** — `Activity activity()` (the hosting `PluginActivity`, for a plugin's own views and dialogs); `Look look()` (the app's palette, `dp` and widgets, so a plugin's screens look like the app's).
  - **The vault's files** — `List<String> list(String dir)` (entries sorted case-insensitively, folders ending in `/`, hidden ones left out); `boolean isDir(String path)`; `boolean exists(String path)`; `long modified(String path)` (ms, `0` when unknown); `InputStream read(String path) throws IOException` (a stream); `String readText(String path)` (UTF-8, `null` on failure); `File local(String path) throws IOException` (the file itself, for `java.util.zip.ZipFile` and the like, which want a `File`); `void write(String path, byte[] bytes) throws IOException` (the file whole, through a hidden `.<name>.atlas-tmp` + `fsync` + rename, so a crash never leaves half of it; parent folders made).
  - **Drawings** — `void drawingSaved(String path, String scene)`: call after writing a `.excalidraw`; the companion note (`x.md` beside it, as on the desktop) is written by the core's `atlas_core::drawing_note::update` (through `Core.drawingSaved` → `phone.rs`). Never throws: a failure is a toast ("The drawing's note was not updated: …"); the drawing is saved either way.
  - **Settings** — `JSONObject settings()`: this plugin's settings in this vault, the same `[[setting]]` values its web side reads with the defaults filled in (from `Core.plugins`); **never null** — `{}` when it has none.
  - **E-ink** — `boolean eink()` (the app's e-ink mode is on for this activity's `Look`); `static boolean einkScreen()` (whether the app draws for e-ink — a Boox, or the Boox app anywhere, so the emulator shows its screens; static for `NativePlugin.opens`, which has no Context: the asking activity has made its `Look` by then); `void einkRefresh()` (one full refresh, clearing the ghosts — `Look.fullRefresh`, Onyx's own call; nothing off e-ink).
  - **Pictures** — `Bitmap decode(byte[] bytes, int maxW, int maxH)` (`Images.decode`: Android's decoders, then the Rust library's for JPEG XL, at most that size); `interface Picture { void picked(byte[] bytes, String type); }` (what the pickers hand back, on the UI thread); `void pickPicture(Picture done)` (the system's picker — gallery, files, a cloud drive — through `startActivityForResult`, `ACTION_GET_CONTENT` `image/*`; nothing when cancelled; a toast when no app can pick); `boolean hasCamera()` (a camera app answers `IMAGE_CAPTURE`; a Boox Note has none); `void takePhoto(Picture done)` (the camera app writes the full-size photo into `PhotoProvider`'s one file — `content://<package>.photos/photo.jpg`, not exported, a one-off grant on the Intent; `<queries>` for `IMAGE_CAPTURE` in the manifest so the camera is visible on Android 11+; handed back as `image/jpeg` and the file deleted); `void result(int request, int code, Intent data)` — package-private, not for plugins: `PluginActivity.onActivityResult` hands it the pickers' results, and it reads the bytes off the UI thread (a photo can be megabytes) and calls `done.picked(bytes, type)` back on it.
  - **The pen** (openink's pens through `Core`) — `static final String[] PENS` = `ballpoint, fountain, brush, marker, square, pencil, charcoal` (openink's order: the index is the `pen` code the calls take); `float[] penInk(int pen, float[] config, float[] samples)` (a stroke's ink, `Core.penInk`: its bounds, then polygons or dabs as `penOutput` says); `float[] penDefaults(int pen)` (the pen's knote2 config at this screen's `xdpi`, resolved); `int penOutput(int pen)` (`0` filled polygons, `1` translucent — the marker, `2` dabs); `float[] penShape(float[] xyt, boolean openink)` (the shape a stroke held still at its end was meant as, `Core.penShape`: in `x, y, t (ms)` per point; Atlas's recogniser `shape.rs` when `openink` is false — it reads the places only — or openink's `shape_openink.rs` when true; out in the shared wire format `[kind, …]`: `0` nothing fits / leave it ink · `1` line `x1, y1, x2, y2` · `2` rectangle and `3` ellipse `cx, cy, w, h, angle (radians)` · `4` triangle `x1, y1, x2, y2, x3, y3` (shape.rs only) · `5` path `closed, start head, end head (0/1), n, x1, y1, … xn, yn` — triangles, polygons, arrows, arcs (shape_openink.rs only)).
  - **Quick ink** — `QuickInk quickInk(android.view.View v)`: the screen's own ink under the pen before the view redraws — Onyx's instant ink on a Boox (`Ink.onyx(v)` when `eink()`), nothing elsewhere (`Ink.NONE`). `interface QuickInk`: `void area(int left, int top, int right, int bottom, float widthPx, int style)` (only inside this part of the view, in view px, the quick line `widthPx` wide; an empty area turns it off; `style` Onyx's stroke style — `0` one width, `1` following pressure, `2` marker); `void up()` (the view's own stroke is drawn: shown over the quick line); `void repaint(long afterMs)` (the view's picture changed by hand — undo, erase — shown once `afterMs` have passed); `void stop()`.
  - **The pen, read by the app** — `PenInput` (`new PenInput(context)`, one per view): `static pen(e)` (the tip or the eraser end), `static erasing(e)` (the eraser end or the button held), `saw(e)` (call on every touch and hover: remembers when the pen was near; returns whether `e` is the pen), `palm(e)` (a finger gesture that is the hand: the pen near within 700 ms, among the pointers, or a contact wider than 15 mm), `penJustNear(e)`. Notepad's page, PenCatcher (the pen over a web drawing) and PageInk all read the pen through it, so the palm rule is one rule.
  - **Ink over a picture** — `PageInk pageInk(ImageView image, PageInk.Taps taps)`: a view to lay over the image; hand it every touch first (`take(e)`: true when it took it — the pen's ink, the eraser, a palm, or a pen tap given back to `taps`), say whose ink it shows (`inkOf(path, PageInk.read(host, path))`, read off the UI thread) and which page (`page(n)`; again after the picture changes). Strokes are kept in the page's own coordinates in `<path>.ink.json` beside the file (`PageInk.file`: a folder's beside it too) — `{ "pages": { "<n>": [[width, x, y, x, y, …], …] } }`, fractions of the page — written through the vault (a server's too). Onyx's quick ink over the page while it shows; `clearPage()`, `hasInk()`, `flush()`. The manga reader uses it (and its web side shows the same ink, `inkPath` / `inkPaths`).
  - **Back to the app** — `void open(String path)` (the app on a vault path: a note, a drawing — `AtlasActivity.OPEN`, `CLEAR_TOP | SINGLE_TOP`); `void openLink(String link, String from)` (the app on a `[[note]]` link found in vault file `from`, resolved there as the desktop does — `AtlasActivity.LINK` / `LINK_FROM`).
  - **Messages** — `void toast(String s)` (a long `Toast`).
- `PluginActivity` hosts a plugin's view: the app's look, the system bars, Back.
- The web page asks the app before opening a file: the bridge's `nativeOpens(path)`; when a native side opens it, `openNative(path)` and the web tab is not made.

## The manga plugin's Android side

`plugins/beta/manga/android/`: `Manga` (the entry: place "Manga", opens `*.cbz`), `MangaScreen` (the stack library → series → reader, `Back`, the covers: first page of the first chapter decoded once at cell width on one thread, a 24 MB `LruCache`; an e-ink full refresh after each screen change), `LibraryView` (Mihon's Library: a `GridView` of 2:3 covers, auto-fit 128 dp columns, the unread count on a corner, the title on two lines; tap → series, long press → go on reading; an empty state naming the folder and where it is set), `SeriesView` (cover, title, "N chapters · M unread", Start / Continue / Read again — `resume`: the chapter last read if unfinished at its page, else the first unread, else the first; the chapters with read ones quiet and a begun one's page; long press marks read / unread → `Library.setRead`), and the earlier `Chapter`, `Library`, `ReaderView`. javac clean with the app; not run on a device or the emulator yet.

## The Notepad plugin's Android side

`plugins/beta/notepad/plugin.toml`:

```toml
[android]
main = "org.atlas.plugins.notepad.Notepad"
opens = ["*.excalidraw"]
```

No `place` (`Notepad.place()` is `null`): it opens drawings, it has no entry of its own. `Notepad.opens(path)` is `path.endsWith(".excalidraw") && Host.einkScreen()` — it claims a drawing **only on an e-ink screen** (a Boox, or the Boox app), so a phone keeps the web Excalidraw view and the desktop never sees the native side. `view(host, path)` is a `NotepadView`: knote2's pens (`Host.PENS` / `penInk`, openink's engine vendored in `crates/vendor/openink-stroke`), Onyx's instant ink under the pen (`Host.quickInk`), shapes from a held stroke (`Host.penShape`, the `shapes` setting choosing `atlas` or `openink`), pages and paper, pictures (`pickPicture` / `takePhoto`), saved into the same `.excalidraw` every Atlas opens, then `Host.drawingSaved` for the companion note. The rest of its design: plugins/beta/notepad/README.md.

## The manga plugin's web side

`plugins/beta/manga/main.js` (the command **Manga: library**) and `view.js` (the pane; a `.cbz` opens in it by "Open with…", manifest `opens`): the same three screens as the Android side, Library → Series → Reader, over the same files — the library folder from the plugin's settings, `<series>/reading.json` in the same shape (`{ chapters: { <name>: { read, page } }, last }`, a chapter's key its last path segment), so the phone and the desktop carry on from each other. Written through `atlas.list` / `atlas.readText` / `atlas.writeText` (the two plugin-API calls added for it).

- **.cbz unzipped in the page**: the zip's central directory read by hand (`zipEntries`; no ZIP64), each picture inflated on demand with `DecompressionStream("deflate-raw")` (stored entries as they are), `__MACOSX` left out, pages in natural order (`natural` = `Chapter.natural`: digit runs as numbers). The chapter's bytes come once through `atlas.fileUrl` (core's raw file → blob, cached by the page for its life — a very long library read in one sitting holds every chapter opened; to revisit if it shows).
- **Covers**: a `cover.jpg/png/webp` in the series folder (Mihon's convention) through `thumbUrl`, else the first chapter's first page; loaded as the card scrolls into view.
- **Reader**: paged (right to left — the default — left to right, vertical) or webtoon (all pages under each other, the page in view is where you are); tap zones — `zone()` is ReaderView.zone's, so both sides answer a tap alike (default thirds, Kindle, edge, right and left, L-shaped, off; `invert_taps`); keys ← → Space PageUp/PageDown; past the last page the next chapter, before the first the previous one's last page; the page number; the background setting.
- **Saving where you are**: the page shown is saved 400 ms after the reader rests on it, **flushed at once on a chapter change and on leaving** (a quick turn past the last page had lost the read mark — found by the spec), and one write at a time, each reading the file again just before writing so what the phone wrote meanwhile is kept.
- E-ink: a full refresh every `flash_every` page turns through `atlas.eink.refresh()` (added to the plugin API for it); not in webtoon, where the app already refreshes when a scroll rests.
- Not yet: Suwayomi, EPUB, writing on pages.
- Spec: `ui/tests/example-manga.spec.ts` (a series of two `.cbz` made in the test — deflated and stored entries, names out of order, a `__MACOSX` entry; the library's unread badge and cover, natural order, reading across the chapter boundary, `reading.json` checked field by field, a right-click marking unread).

## Not done here (later)

Server vaults (a vault on Atlas's server rather than in the phone's storage): the Host reads them over the server's file API — the local Host first. Native settings forms: the web Settings shows the plugin's settings for both sides.


## 2026-10-20: the libraries back on the page, only the readers native

Books and manga are native because of the pen; their libraries (the catalog) need not be — only the reader itself. The pen, the e-ink paging and the codecs are the reader's; a library is a list of covers, which the
page draws as well on the phone as on the desktop, and the page's libraries already had what the native ones lacked or
duplicated (Books: the server's folders through the file sources; Manga: the Suwayomi library).

- Before: `NativePlugin.place()` gave Books and Manga a place in the app, listed as tabs of the page's Libraries
  (`AtlasNative.nativePlaces()` → `registerNativeLibrary`, a tab opening `openPlace(plugin)` → `PluginActivity` on
  `""`), and the plugin's page library stepped aside for it (`libraries.svelte.ts` `replaced`).
- After: no places. The Libraries page lists the plugins' own libraries; their Read calls **`atlas.openNative(path)`**
  (plugin API v6 → `dock.openNative` → the shell's native opener → `AtlasNative.nativeOpens` / `openNative` →
  `PluginActivity.start(id, path)`), and shows the page's reader when it returns false (desktop, browser).
  `view(host, path)` is never called with an empty path.
- Removed: `place()` (NativePlugin, Books, Manga, Notepad), the `nativePlaces`/`openPlace` bridge, `registerNativeLibrary`
  and `LibraryEntry.go`, Books' `LibraryView` and `ServerBooks` (+ `Host.pluginSettings`, `openIn`, `openedFolder`), the
  covers in `BooksScreen`, `Shelf.scan`/`readingOf`; Manga's native library and series screens (its agent).
- Kept: the core's manifest still accepts `[android] place` (a vault's older copy keeps parsing; `#[allow(dead_code)]`).
- Watch: a server's book opens from its local copy (`atlas.files.local`), so its place is kept under that copy's path.
