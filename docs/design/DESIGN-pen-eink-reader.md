# Pen, e-ink and reading on the phone (and the Boox)

The requirements (2026-10-16): Rnote only on the desktop (or a server where it is installed) — Rnote files are inputs, not outputs; Excalidraw working correctly on Android; an e-ink mode for a Boox e-ink tablet; and Excalidraw (or something else) working well enough to replace the Boox's own drawing app.

Their answers to the questions put the same day:

- **The pen on the Boox**: the native Boox pen (*"So probably 1, but if you can modify excalidraw to be native that would be amazing"*) — a native drawing screen that writes Excalidraw files.
- **What the Boox app is used for**: handwritten notes, annotating PDFs, quick scratch — *"Also it would be amazing if it could be a good ebook and manga reader where I can annotate everything in the same app"*.
- **E-ink mode**: detected on a Boox, plus a setting (auto / on / off).
- **Rnote**: *"I would just like to autoconvert them all to excalidraw, which is the prefered format, if possible"*.

## One format: Excalidraw

Every drawing, handwritten page and annotation is an `.excalidraw` file (JSON; the desktop's Excalidraw pane edits it, Obsidian's Excalidraw plugin reads it). Everything is a file and linkable (PHILOSOPHY §1): a handwritten note is `[[2026-10-16 lecture.excalidraw]]`, embedded in a note like a picture. What writes it on the phone — the web Excalidraw or the native pen screen — is a view of the same file, never a second format.

## Rnote → Excalidraw

`.rnote` is gzipped JSON (`{version, data: {engine_snapshot: {document, stroke_components, …}}}`). Measured on 15 real files (versions 0.11–0.13): 79 384 brush strokes (all `smooth` style, all `lineto` segments with a pressure per point), 129 shapes (125 lines, 3 ellipses, 1 rectangle), 2 text boxes, 19 bitmap images (raw pixels, base64), 64 vector images (SVG — slides, 1280 × 720). The document's background (colour, `grid` pattern, its size) and page format (1123 × 1587 at 96 dpi, A4) too.

The mapping, exact for everything seen:

| Rnote | Excalidraw |
|---|---|
| `brushstroke` (points + pressures, `stroke_width`, `stroke_color`) | `freedraw` element: `points` relative to its `x, y`, `pressures`, `simulatePressure: false`, `strokeWidth`, `strokeColor` |
| `shapestroke` `line` / `rect` / `ellipse` | `line` (two points) / `rectangle` / `ellipse` |
| `textstroke` (text, affine transform, font size, colour, max width) | `text` element (`fontSize`, `width` = max width) |
| `bitmapimage` (raw RGBA, its rectangle and transform) | `image` element + a PNG in the scene's `files` (data URL) |
| `vectorimage` (SVG data, rectangle, transform) | `image` element + an `image/svg+xml` file |
| `document.background` | the scene's `viewBackgroundColor`; the grid as Excalidraw's grid |
| quadratic / cubic segments (none seen) | sampled into points |

Where: **the Rnote plugin** (`plugins/beta/rnote`, JavaScript in the page). A first version was Rust in atlas-core (`rnote_convert.rs`, branch `boox`); it was the specification for the plugin and then removed. In the page: gzip through `DecompressionStream`, pictures un-premultiplied and PNG-encoded through an `OffscreenCanvas`, so the desktop, the server's browser and the phone all convert the same way, with no Rnote installed. **Converted, not replaced**: `<name>.rnote` → `<name>.excalidraw` beside it (never overwriting; a name taken gets ` (2)`; one made from this `.rnote` before — `atlas.from = "rnote"` — is reused), the `.rnote` left as the input it is. Opening an `.rnote` anywhere (the core's Rnote pane hands it to the plugin's `convert` command and closes) opens the drawing; the file menu has "Open as a drawing (Excalidraw)". The write is the plugin API's `createFile`, which is now one exclusive write on the server (`FileWrite.only_new`: no probing GET, no race). Not built: converting a whole folder at once (`atlas rnote-convert`). Tests: `ui/tests/example-rnote.spec.ts` (the converter, every kind in the user's files), `ui/tests/draw.spec.ts` (an `.rnote` opened in the app).

Rnote itself: no new `.rnote` is ever made ("New handwritten note (Rnote)" and `draw.rnote_new` go); "open in Rnote" stays on the desktop where Rnote is installed.

## Excalidraw in the app

The web Excalidraw in the phone's WebView: touch drawing, pen pressure (Pointer Events carry `pressure`), pinch zoom, the keyboard for text, saving through the core. To check in the emulator (and on the user's phone): the pane in the phone layout, the toolbar's size, no page zoom stealing pinches (`touch-action`), save on leaving.

## E-ink mode

**On when**: a setting `ui.eink = "auto" | "on" | "off"`; *auto* is on in the app on a Boox (Onyx's `android.onyx.ViewUpdateHelper` class is there, else `Build.MANUFACTURER` / `BRAND` say Onyx or Boox; told to the page by the bridge) and in a browser whose screen reports `(update: slow)`.

**What changes** (an `html.eink` class, base.css and the components' own rules):

- black on white, no greys for meaning: muted text darker, faint lines black hairlines; the accent is black (or bold / underlined), selection and the current item marked by a frame or inverted, not by a tint;
- no shadows, blurs, gradients or translucent scrims (they become dither on e-ink);
- **no motion**: transitions and animations off, scrolling by page (no smooth scroll), no blinking caret where it can be avoided (each change is a refresh);
- larger default text, heavier strokes for icons;
- the native shell's `Look` the same (no ripple, no elevation, black hairlines).

**Against ghosting**. Every partial update leaves a faint ghost; they pile up until a full refresh (black, then white: the GC16 waveform) clears them. So besides the look, `lib/eink.ts`:

- **refreshes the whole screen where ghosts come from**: another tab to the front (250 ms after, once it has drawn) and a scroll come to rest (`scrollend`, caught for every scroller: a note, a PDF's pages, a list). At most one refresh per 400 ms. Setting `ui.eink_refresh`: `often` (both, the default) / `navigation` (tabs only) / `manual`; the command **E-ink: clear the screen** any time;
- in the **phone app on a Boox**, with Onyx's own call through the bridge (`AtlasNative.einkRefresh` → `Look.fullRefresh`): `ViewUpdateHelper.applyGCOnce()` (the next update a full GC) then `repaintEverything()`, which is what Onyx's framework itself does after a scroll; else `View.refreshScreen(98)` (GC16 | full | wait, the view's rectangle). All by reflection, nothing on other devices;
- in a **browser** (the web UI on the Boox's browser, or any e-ink screen): a veil over everything, black for ~90 ms then white for ~90 ms (`.eink-flash`), which the panel answers with a clearing refresh;
- nothing that moves: transitions and animations off (also what `ui.motion` keeps), `scroll-behavior: auto`, the editor's caret steady (its blink is a CSS animation), the terminal's cursor steady (xterm blinks from JavaScript: `cursorBlink` off), no hover shadows.

What Onyx's framework does on its own (traced in the boox_5c_re reverse-engineering project, firmware 4.2.1 framework.jar; its docs/ONYX-EPD-PEN.md): every View and WebView calls `beforeScroll` / `afterScroll`; a WebView switches to the fast A2 waveform while dragging (`autoA2ForScrolling`, on by default, from 5 px) and, after `SCROLL_REFRESH_DELAY` (1000 ms), clears with `applyGCOnce()` + `repaintEverything()` if the user's per-app settings say so; a per-app "full refresh every N" (`gcInterval`, 20) counts partial updates in SurfaceFlinger. Those per-app settings live in Onyx's system MMKV behind `IOECService`; there is no manifest key for an app to declare its own defaults, so Atlas does its own refreshes and leaves the A2-while-dragging on.

**Onyx's injected CSS is turned off** in the app's WebView (`Look.noInjectedCss` → `WebView.setCssInjectEnabled(false)`): Onyx injects `<style id="onyx-eac-injected-style">` with `!important` colours, weights and `a { text-decoration: none }` from the per-app E-ink settings into any *network* page, and Atlas's page is one (127.0.0.1); left on, it would override Atlas's own e-ink look.

**Colour e-ink**: the Boox tested is a Note Air 5C (a colour panel). The e-ink palette keeps its status colours dark rather than dropping colour.


### Excalidraw on e-ink, and Onyx's instant ink over the WebView

The first try on the Boox: the lines were too thick, the tools did not follow the workflow, fullscreen was missing, and it felt less responsive (polling less) than the Boox's own drawing. What changed (lib/draw-excalidraw.ts, `DrawOptions.pen`, on whenever `html.eink` is):

- **A notepad, not a diagram tool**: the pen tool picked at open; width 1 (Excalidraw's thinnest), roughness 0, black; Excalidraw's `penMode` (the pen draws, a finger pans); a ⛶ button at the top right for fullscreen (Super+F's `toggleFullscreen`).
- **Every pen sample kept**: Excalidraw reads one move a frame (it throttles, and never reads `getCoalescedEvents()`); `collectPenStrokes` keeps every sample of a pen stroke (coalesced events included) and, when the pen lifts, the finished freedraw element gets all of them with their pressures (`newElementWith`). A move carrying 20 samples kept 3 points before, 20 now (draw.spec). The line drawn *while* the pen moves is still Excalidraw's.
- **Onyx's instant ink over the WebView** (the Boox app only): the page tells the app where the drawing is (`AtlasNative.ink(left, top, width, height, lineWidth)`, CSS px; zeros = off) whenever the pen tool, the size, the zoom or the visibility changes; `OnyxInk.area` sets the handwriting region there (view px, the toolbar strip — 64 CSS px — left out) and the pen state RENDER. From boox-5c-re-2c's reading of framework.jar 4.2.1 / SurfaceFlinger / libonyx_pen_touch_reader.so: **raw mode does not swallow the pen's MotionEvents** (nothing grabs the evdev; Onyx's hooks in `ViewRootImpl` only observe), so the firmware draws the line at once and the page still records the stroke. On a stylus pen-up (an `OnTouchListener` that only observes) the app pauses the ink (state 3), waits 120 ms for the page to draw its stroke, posts and turns RENDER on again — the SDK's "programmatic content change" pattern. If ghost ink stays: `ViewUpdateHelper.handwritingRepaint(view, l, t, r, b)` over the stroke's rectangle (not used yet). `onPause` stops it; the page asks again on `visibilitychange`. **Not yet tried on the device.**
- **The rest of the app on e-ink**: text 10 % bigger (`--eink-scale` folded into `--ui-scale`, the editors' sizes too) and weight 500, borders darker (#5a5a5a), icon strokes 1.75 → 2.25. The explorer for touch: a tap opens, rows 44 px and buttons 40 px on a coarse pointer, no drag (a long press is the menu), the places as a menu when the pane is too narrow for their column.

## The pen on the Boox

E-ink's refresh makes any ordinary canvas lag a stroke behind the pen. Boox's own notes app draws with the **Onyx pen SDK** (`com.onyx.android.sdk.pen.TouchHelper`, raw drawing: the strokes go straight to the e-ink panel's fast mode, the app is told the points afterwards). The plan:

- a **native pen screen** (`PenActivity`, Java) that opens an `.excalidraw` file: shows what is there (freedraw strokes drawn natively; other elements as a picture the web renders), draws new strokes with `TouchHelper` raw drawing on a Boox and a plain fast `Canvas` elsewhere, the pen's pressure and its eraser end, palm rejection (only the stylus draws), pages (A4 portrait, a template: blank / lined / grid), and writes the strokes back as `freedraw` elements — the desktop opens the same file in Excalidraw;
- the SDK is a Maven AAR; without Gradle, its `classes.jar` and native libraries go into the APK the way `build-apk.sh` already puts the Rust library in (`get-toolchain.sh` fetches it).

## Reading and annotating

A good ebook and manga reader, where everything can be annotated in the same app: EPUB (reflowed text, the reader's typography, e-ink paging) and comics/manga (CBZ/CBR, folders of pictures; right-to-left, double pages), PDFs as now — with pen annotations over any page, kept as files (an annotation layer per book: `.excalidraw` per page or one beside the book, linkable like a PDF passage). To design with the user after the pen screen.

**Decisions (2026-10-16)**: the reader is a plugin first; comics can be simple files, with Suwayomi integration too (the codecs matter); the best drawing experience possible; the Boox features in their own APK (`atlas-boox.apk`).

The plan:
- **Two plugins**:
  - **`books`** (`plugins/beta/books`): EPUB reflowed in the reader's typography (font, size, margins, line height, justified or not; e-ink: paged, never scrolled), a table of contents, where you are kept as a file;
  - **`manga`** (`plugins/beta/manga`), shaped like **Tachiyomi / Mihon**: a **Library** (cover grid or list, categories, unread / downloaded badges, filter and sort, search), a **series page** (cover, description, genres, the chapters with read / unread / bookmarked, read from where you left, mark read, download for offline), **Updates** (new chapters), **History**, **Browse** (its sources: the vault's own files and the Suwayomi server); and the **reader with Mihon's options**: reading mode (left to right, right to left, vertical, webtoon / continuous vertical, with side padding), page layout (single, double, automatic) and splitting or rotating wide pages, scale (fit screen / width / height, original, smart fit) and zoom start position, crop borders, tap zones (default, L-shaped, Kindle, edge, right-and-left, off; invert), the volume keys turning pages, background (white, black, grey, automatic), page number shown, keep the screen on, grayscale and a colour filter, and **flash on page change** (Mihon's e-ink option: the full refresh per page, its colour and every-N-pages, here lib/eink.ts's refresh). Options per series override the defaults, as in Mihon. All of it in the plugin's Settings (PLUGIN-API, "Settings");
  both: paging by tap zones and keys, a full refresh per page turn on e-ink (`einkRefresh`, lib/eink.ts); where you are kept as a file beside the book (everything is a file), so another device opens at the same page; a companion note per book (PHILOSOPHY §1) with its metadata and a block that opens it.
- **Comics as plain files**: `.cbz` (a zip: read by entry, never unpacked whole), a folder of pictures, `.cbr` later (RAR needs a C library).
- **Suwayomi** (a self-hosted Tachiyomi / Mihon server): through **OPDS + OPDS-PSE** (`/api/opds/v1.2`, page streaming), the open standard Suwayomi, Komga and Kavita all serve — one integration, several servers; a series and its chapters as places in Atlas's explorer (`atlas.files.source`), pages streamed, a chapter kept as a `.cbz` in the vault on request; sign-in through the plugin's settings (and Authelia in front, `signin: door`).
- **Codecs**: manga sources serve JPEG, PNG, WebP, AVIF, GIF and more and more **JPEG XL**. A WebView decodes JPEG / PNG / WebP / GIF / AVIF; JPEG XL only from Chromium 155 (October 2026, the jxl-rs decoder), and a Boox's WebView may be older. So the reader **asks the page at run time** (`createImageBitmap` of a tiny sample per format, cached) and sends what it cannot decode to the core, which decodes it (`jxl-oxide`, pure Rust, so the Android build needs no C) and answers a PNG / WebP: one core image endpoint shared with thumbnails, any format the core learns reaches every plugin.
- **Writing on top**: the pen canvas (PenView + Onyx's instant ink in the Boox app; Excalidraw with the pen's pressure elsewhere) over a page, its strokes kept as an `.excalidraw` per page beside the book (`<book>.notes/<page>.excalidraw`), linkable like a PDF passage (`[[book.cbz#page=12]]`).



## Built 2026-10-17: pages, links, page embeds, the notepad's "More"

Used for lecture notes and quick sketches (2026-10-17): pages matter a lot, links too, and drawings must be easy to embed in Markdown notes and open in the app. On the bar, the four-squares icon was unclear and the settings icon hid a lot of UI.

- **Pages** (`ui/src/lib/draw-pages.ts`): a page is an Excalidraw **frame** of A4 portrait proportions (794 × 1123 scene units, 48 apart), named "Page N" when made; pages are read top to bottom, then left to right; the page on screen is the one under the view's middle (`pageAt`); a new page goes under the last, the first one where the drawing already is (`nextPage`). The notepad bar: "+ Page" while there are none, then "‹ n / N ›" and "+"; `Drawing.showPage(n | ref)` fits a page to the screen. Frames are plain Excalidraw: Excalidraw and Obsidian's plugin open the file as it is. Strokes drawn inside a frame belong to it (Excalidraw's own `frameId`).
- **Links**: an element's link may be `[[note]]` (`[[note#heading|alias]]`), as Obsidian's Excalidraw plugin stores it (`wikiTarget`); `onLinkOpen` opens the note in Atlas, resolved from the drawing's folder (a web address stays Excalidraw's). The notepad's More → "Link to a note…" sets it on the selection through the palette's picker (a new name is offered too).
- **Page embeds**: `![[lecture.excalidraw#Page 2]]` (or Obsidian's `#^frame=<id>`, or any frame's own name — `frameRef`) draws that page only, cut at its edges (`sceneSvg(json, dark, page)`, Excalidraw's `exportingFrame`); its button reads "Edit Page 2" and opens the drawing at that page (`PaneSpec.page`; an open drawing is moved there through `drawingPages`, as PDFs are through `pdfPages`). More → "Copy this page's embed" puts the `![[…#Page N]]` line on the clipboard.
- **The bar**: the paper by its name ("Paper: Lines"); "More" lists Text, Rectangle, Ellipse, Arrow, Line, Picture…, Link to a note…, Copy this page's embed, and Excalidraw's whole interface last (`NoteTool` covers Excalidraw's tools).
- Tests: `tests/draw-pages.spec.ts` (pure), `eink.spec.ts` (pages from the bar, palm, crisp strokes), `md-render.spec.ts` (a page embed, opening at it).
