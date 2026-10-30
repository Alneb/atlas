# Markdown rendering — matching Obsidian on real notes

Markdown rendering had many problems (HTML boxes did not render, among others); every note is
checked to render correctly. Target: **exactly Obsidian** (the notes were written there), with a better display of
properties.

## The tool that checks "every single one": `npm run audit:md`
`ui/audit/render.spec.ts` (+ `render.config.ts`, `sample.ts`) copies the note folders of a workspace
(a real vault, `ATLAS_AUDIT_SOURCE`; dirs `notes,log` + FOCUS.md; env `ATLAS_AUDIT_DIRS`, `ATLAS_AUDIT_WS`,
`ATLAS_AUDIT_OUT`, `ATLAS_AUDIT_PORT`=7750, `ATLAS_PW_CHROME`), serves the copy with the real `atlas` binary,
opens **every** `.md` in the live-preview editor and scrolls it end to end. On each screen it flags, shape-based
(no per-note lists): raw `$math$` / `$$` / `![[embed]]` / HTML tags in rendered prose (caret line excluded),
KaTeX errors, missing embeds and broken images, tables that overflow (hidden columns), fold arrows not on their
line, a bare "Properties" chip, page errors. Output: `audit-report/REPORT.md` (totals per kind, then per note).
Build first: `npm run build && (cd .. && cargo build -p atlas)`. ~5–7 min for 104 notes.

| run | notes with problems | findings |
|---|---|---|
| before (master `2678c2d`) | 104 / 104 | 528 (371 fold arrows, 101 broken images, 26 KaTeX, 23 raw math, 3 raw `$$`, 2 raw HTML, 1 table) |
| after the parser + resolution fixes | 104 / 104 | 116 (106 were the audit misreading CodeMirror's hidden gutter spacer) |
| after | **4 / 104** | 11 — all in the sources, see below |

## Root causes and fixes
1. **`$$` paired only at line ends** (Internship Porto: 9 KaTeX errors, every later formula desynced). Obsidian
   pairs `$$` wherever it sits: `…\ket{e} $$which in space…` closes mid-line with prose after it. Both parsers
   now pair the same way — the editor's lezer `BlockMath` (`vendor/obsidian-web/obsidian-syntax.js`) and the
   reader's markdown-it rule (`lib/markdown.ts`). The node ends at the end of the closing line; trailing prose
   renders with the block (markdown-it emits it as a paragraph). `$$$$` (close + reopen on one line,
   Quantum Matter May 27th) stays ONE editor node, because a block replaced from mid-line cannot be drawn.
2. **Indented continuation prose became code** (Renormalization Group: 14 raw `$a$`). The vault indents
   text under list items / after `$$` blocks with a tab or 4 spaces; CommonMark makes that an indented code
   block. Indented code is off in both parsers (`{ remove: ["IndentedCode"] }`, `md.disable("code")`). Fenced code
   is unaffected.
3. **Attachments resolved only beside the note** (101 broken images). Obsidian resolves `![[Pasted image ….png]]`
   by file name anywhere in the vault (attachments live in `notes/attachments/`). New `GET /api/files` (every
   workspace file, ignore rules applied) + `ui/src/lib/vault.ts`: a synchronous resolver with the same rules as
   the core's `links.rs` — explicit path (root first for wikilinks, note-relative first for md links), then by
   name: same folder first, then shortest path. Refreshed on fs events that add/remove files. Used by editor
   embeds, reader images, wikilink clicks and unresolved-link styling. Editors wait for the list before the
   first render (no flash of "missing").
4. **`![[x.png |center | 600]]`**: the space before `|` broke the target; `split("|", 2)` dropped the third part.
   Targets are trimmed; `|600` / `|600x400` set the width and `|center` (the vault's CSS snippet) centers.
   Images are left-aligned by default, as in Obsidian.
5. **Raw HTML not rendered** (`<sup>nd</sup>`, `<u>`, 20 `<img src="data:…base64">` in two lecture notes).
   Reader: markdown-it `html: true`, output sanitized with **DOMPurify** (scripts, handlers, `<style>` and frames
   go — the page holds the API that runs commands); local `<img src>` gets `data-src` and is fetched with the API
   header like other images. One line shown outside a note (a capture in the Captures list, a task's text on Today)
   goes through `renderInlineMarkdown`, the same purifier: never `md.renderInline` straight into `{@html}` (a clipped
   page's frame there once loaded a site whose script took over the whole window). Editor: inline `HTMLTag` nodes — paired inline elements (`u sup sub b i em strong
   mark s del kbd small span font …`) hide their tags and mark the content with the real element
   (`Decoration.mark({ tagName })`, safe `style`/`color`/`title` only) until the caret enters; void elements
   (`<img>`, `<br>`) become a widget with sanitized HTML; HTML blocks render through the reader.
6. **Tables hid columns** (Ultracold Atoms 15-01): `width: max-content` made a long row push columns 2–3
   off-screen. Now `width: auto; min-width: 50%` with wrapping cells (the scroll wrapper stays for unbreakable
   math).
7. **KaTeX vs MathJax habits**: `\newcommand{\div}` over a built-in (and the same note rendered twice) and
   `\text{Nb_3Ge}` failed. `math.ts` `compat()` rewrites `\newcommand` → `\renewcommand` when the name exists
   (tested by asking KaTeX, cached) and escapes `_`/`^` inside `\text{}`.
8. **Fold arrows beside ordinary paragraphs**: lang-markdown makes every multi-line block foldable. Obsidian
   folds headings and lists only → `foldNodeProp` overrides (paragraphs, quotes, code, tables, math: none; lists
   inside the frontmatter: none). Arrows show on gutter hover (always when folded). The Properties widget had a
   CSS margin — CodeMirror measures block widgets by their border box, so margins shifted the gutter 15 px:
   now padding.
9. **An inline formula drawn over the previous word in list items** ("len𝑔th"): list lines hang their marker
   with `text-indent: -28px`, which inline-block children inherit. Reset on inline widgets. Continuation lines of
   a list item (`cm-list-cont`) no longer outdent their first row.
10. **Properties**: the frontmatter was an empty "PROPERTIES" chip. Now an Obsidian-style panel
    (`lib/properties.ts`): a row per key, type icon inferred from the value's shape (date, list, link, number,
    checkbox, tags, text — never from known key names), wikilinks as clickable pills (dimmed when unresolved),
    tags as pills, `Empty` for empty values, YAML errors said plainly; collapsible (remembered per viewer).
    Clicking elsewhere still reveals the YAML for editing.
    This table is the `inline` choice of `[editor] properties`; the default is `hidden` (one
    faint "Properties" line), and `panel` edits them beside the note (NOTES-SYSTEM.md, "Properties"). The audits
    serve the settings with `inline` (`ui/audit/props-inline.ts`), so their "bare chip" check still means
    "the table did not draw".
11. Smaller: a rendered block's hover tint is now neutral (the accent read as "selected"); a remote `![](url)`
    that is not an image (YouTube) becomes a link instead of a "missing" chip; unresolved links are dimmed.

## What is left (in the sources — not guessed at)
- `notes/Doi-Peliti.md`: conversion debris — `$[]()$` inside a formula, `\!\right)` outside its `\left(` group
  (3 KaTeX errors, 1 raw formula). Needs the author's intent.
- `notes/lectures/ionp/Integrated Optics Notes.md`: a `$$` opened before `\begin{align}` whose closer comes much
  later (prose "with $k^2=…$" falls inside the formula), and 4 images (`image.png`, `image-2.png`, `image-3.png`,
  `image-4.png`) that are not in the workspace or the vault.
- Ink plugin (`handdrawn-ink` / `handwritten-ink`) blocks point at `.drawing` files that are not in the vault
  (0 found under `~/.obsidian`); they now render as a card naming the missing file instead of their JSON.

## Drawings: `![[x.excalidraw]]` (added the same day)
The vault's 21 Excalidraw embeds name `x.excalidraw` while the file is the Obsidian plugin's `x.excalidraw.md`
(Obsidian appends `.md`; `vault.ts` now tries `<target>.md` after an exact name). The renderer emits a
placeholder (`.drawing-embed[data-src]`, with `|600` / `|center`); `lib/draw-embed.ts` fills it: the scene JSON
comes from the ```` ```compressed-json ```` block (LZString base64, `lz-string`) or ```` ```json ````, or the file
itself for Atlas's own `.excalidraw`; Excalidraw's `exportToSvg` draws it for the app theme (dark mode inverts
strokes, as the plugin does). Excalidraw loads only when a note has a drawing. Natural size from the scene,
never wider than the note. A file that does not resolve or decode shows a dashed "drawing …: reason" box (the
audit counts those as "drawing not rendered").

### Editing them
`.excalidraw.md` files now open in the Excalidraw pane (`specForPath`), and an embedded drawing has an
"Edit drawing" button (shown on hover; a button so the click opens the drawing instead of revealing the note's
source). The pane decodes the plugin block, edits as usual, and on save writes the scene back **into the same
block** (`writeSceneInto`): LZString base64 in 256-character lines separated by blank lines — the plugin's own
layout, measured on the vault's files — with the rest of the file untouched. The "## Text Elements" index goes
stale until Obsidian next opens the file (the plugin rebuilds it). No `.svg` sidecar for plugin files.

## Speed on the largest notes (measured on a debug build, headless)
| note | size | shown | per keystroke | scroll to end |
|---|---|---|---|---|
| Integrated Optics Notes (inline base64 images) | 4.5 MB | 613 ms | 29 ms | 56 ms |
| Supercond, Carlos | 3.0 MB | 237 ms | 19 ms | 52 ms |
| 2024 exam | 20 KB | 50 ms | 5 ms | 52 ms |
| Renormalization Group | 15 KB | 114 ms | 6 ms | 53 ms |
Keystroke times include Playwright's own ~5 ms. Nothing to fix; the base64 notes cost what their size suggests.

Today's FOCUS and log cards (the read-only renderer, `components/Markdown.svelte`) drop a leading frontmatter
block (`stripFrontmatter`), so a FOCUS.md with properties shows its body, not YAML.

## Regression tests
`ui/tests/md-render.spec.ts` — 13 tests (the 13th: edit a plugin drawing, check the saved block decodes to the new scene), each a shape from a real note (mid-line closer, `$$$$`, indented prose,
hanging-indent math position, `![[x | center | 120]]` resolved from another folder, inline/block HTML, wrapping
table, properties panel, KaTeX compat, folds only on headings/lists, an Excalidraw-plugin drawing from a
compressed-json fixture, an Ink block). Fixtures are written through the API.


## Line breaks inside a paragraph

Obsidian's "Strict line breaks" is off by default (and in the real vaults tested): a single newline inside a paragraph
shows as a line break in rendered Markdown. Atlas's renderer had `breaks: false` (CommonMark's rule), so rendered
views — the Today log, embeds, previews, callouts in HTML — ran such lines together (seen: the OCR plugin's callout of
a screenshot's lines). Now `breaks: true`, and `[editor] strict_line_breaks = true` gives the CommonMark rule for a
vault that turned Obsidian's setting on (markdown.ts follows the setting; each render cache clears when it changes).
Live preview was never affected: its lines are the source's. Spec: `line-breaks.spec.ts`; the full e2e (311) passed.


## Foldable callouts in rendered views

`> [!x]-` is folded in Obsidian's reading view and `> [!x]+` open but foldable; Atlas's rendered HTML ignored the marker
(the OCR plugin's folded text showed in full in Today's log). Now a foldable callout renders as `<details>` (open for
`+`) with its title as the `<summary>` and a chevron; a plain `[!x]` stays a `<div>`. Spec: `line-breaks.spec.ts`; audit
unchanged (117 notes, the same 2 with known findings).
