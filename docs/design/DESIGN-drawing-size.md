# Drawings kept small on disk

The user (2026-10-18): *"is there a way to make excalidraw and drawings in general take less space?"*, then *"make
sure this change happens everywhere that uses excalidraw in particular the boox native app"*. Asked, the user chose
**compact saving** and **smaller pictures** (kept inside the drawing), not pictures as separate files.

## What made a page weigh 22.9 MB

A real page drawn on a tablet, `notes/drawings/2026-10-17-032446.excalidraw` (measured 2026-10-18):

| part | size | why |
|---|---|---|
| 60 pictures (`files`, PNG data URLs) | 15.8 MB (11.8 MB of PNG + base64's third) | the Boox notepad put each PDF page in as a 1400 px PNG at full quality |
| elements, as saved | ~9 MB | the web pane saved with Excalidraw's `serializeAsJSON`: two-space indentation, every pen point's number on a line of its own |
| elements, compact | 2.6 MB | the same JSON without indentation |
| elements, compact, points to 0.1 px | 2.2 MB | |
| the 60 pictures as WebP ≤ 2000 px, q 0.82 | 3.0 MB | |
| … as JPEG q 85 | 6.7 MB | |
| … as lossless WebP (libwebp) | 5.3 MB | |
| the whole page through `atlas drawings` | 13.3 MB | the core's lossless WebP (`image` crate, pure Rust) packs less than libwebp; nothing lost. Saved again in the phone's or a browser's pane, its pictures become lossy WebP (desktop: JPEG) and the page ≈ 6 MB |
| gzip of the whole file | 12.3 MB | for comparison: compression of the file alone does little against base64 pictures |

## The rules (every writer)

- The scene's JSON **without indentation**.
- Pen **points to 0.1 px**, **pressures to 0.01** (invisible: a pressure step of 0.01 changes a Boox brush's width by
  under 0.5 %).
- **Pictures at most 2000 px** on their long side, **WebP** (quality 0.82 on the web, 85 on Android; WebP keeps
  transparency). Where the browser has no WebP encoder (WebKitGTK, the desktop app): an **opaque** picture becomes
  **JPEG** (same quality), one with transparency stays as it was. The core has no lossy WebP encoder: it writes
  **lossless WebP** (the `image` crate, pure Rust). A conversion that is not smaller is not kept.
- Pictures stay **inside** the drawing (Excalidraw's `files`): the file stays a plain `.excalidraw` that
  excalidraw.com and Obsidian's Excalidraw open.

## Where each writer does it

| writer | where | what |
|---|---|---|
| the drawing pane (desktop, browser, phone's WebView, the web notepad) | `ui/src/lib/draw-compact.ts`, used by `draw-excalidraw.ts` `serialize()` (now async) | compact JSON + rounding + pictures (each picture converted once per session, by its id) |
| a new drawing | `ui/src/lib/draw-new.ts` | compact empty scene |
| the Boox / Android notepad (native) | `plugins/beta/notepad/android/DrawingSize.java`: `webp()`, `point()`, `pressure()` | PDF pages (`pdfPagePicture`) and picked pictures as WebP; stroke points and pressures rounded (`Stroke.java`); its JSON was already compact (`JSONObject.toString()`) |
| the capture box's pen (Android) | `crates/atlas-android/.../PenView.java` | points and pressures rounded |
| the Rnote converter plugin | `plugins/beta/rnote/main.js` | already compact (`JSON.stringify(scene)`); its pictures as they were in the `.rnote` |
| drawings already on disk | `crates/atlas-core/src/drawing_compact.rs`, `atlas drawings [--apply]` | compact + rounding + pictures to lossless WebP; a dry run lists sizes; `--apply` copies each original to `.atlas/trash/<time>-drawings-before-compact/` first |

The core does **not** rewrite drawings as they are saved: the pane recognises its own save by comparing the file's text
with what it wrote (`Excalidraw.svelte` `ownWrite`, the fs listener), so a core that changed the text would make every
save look like someone else's change. Each writer writes the small form itself; the command catches what was written
before.

## Also on 2026-10-18

`GET /api/file` refused that drawing (413: the 5 MB limit for notes). A drawing may now be 128 MB through `/api/file`
(`files.rs` `text_limit`, the route's body limit), a note keeps 5 MB, on writes too (e311797).

## Not done

- A setting for lossless WebP (for sharp diagrams): the notepad reads only its own plugin settings, not the vault's
  `[draw]`, so one switch needs both wired; quality 85 on Android looks right on text pages.
- Pictures as files beside the drawing (offered; not chosen).
