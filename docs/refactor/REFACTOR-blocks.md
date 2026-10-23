# Refactor — one block registry ("everything is a block")

Phase 1 of the overhaul plan (`~/.claude/plans/prancy-swinging-kay.md`, approved 2026-10-13). This file explains what changed, why, the shape before and after, and what to watch out for.

## Why

Atlas had two separate worlds:

- **Panes** — 22 kinds (Library, Git, Search, Files, PDF, editor, terminal…), a closed TypeScript union (`PaneSpec`) with a loader table in `App.svelte`. A pane could only be a tab.
- **Blocks** — Today's parts, calendar/list/table, settings pages, plugin blocks, kept in two maps inside `views.ts` (`registry` for row views, `own` for self-fed blocks). A block could only live in a note or a `.page`.

So the Library could not sit on the home page, a PDF could not sit beside the paragraph that discusses it, and a calendar could not be a tab. Embark's central move — a view opens *inline or beside* the document — was impossible. The user's words: the app must be flexible, and the code must be simple enough to maintain without Claude.

## Before → after

| | before | after |
|---|---|---|
| where "what can be drawn" is listed | `App.svelte` loader table + `views.ts` `registry` + `views.ts` `own` | `lib/blocks.ts` — one `Map<string, Block>` (row views stay a small sub-registry in `lib/views.ts`) |
| a pane inside a page or note | impossible | `{ view: library }`, `{ view: pdf, path: … }`, `{ view: editor, path: … }`, … |
| a block as a tab | impossible | every embedded block has an "open as a tab" button; pane kind `block` (`panes/Block.svelte`) |
| pane loader table | inside `App.svelte` | `lib/pane-components.ts` (shared by the dock and the registry) |
| plugin API | `registerBlock`, `registerView`, `mountBlock` | **unchanged** for plugins; they now land in the one registry |

## The pieces

- **`ui/src/lib/blocks.ts`** — the registry.
  - `Block { type, title, icon?, height?, tab?(ctx), mount(host, ctx) }`.
  - `BlockCtx { src, options, doc, host: "note" | "page" | "tab", setTitle }` — `doc` is the note or page holding the block (what "this section" and frontmatter refer to).
  - `registerBlock(b)` → undo function. Blocks already on screen redraw when their type is re-registered (plugin hot reload).
  - `mountBlock(el, doc, src, host)` — draws one block from its YAML. Order of resolution: a registered block → a dotted type waits for its plugin → anything else is a **row view** fed by the core's `POST /api/view`.
  - `hydrateBlocks(root, doc)` — mounts every ```` ```view ```` placeholder under a rendered piece of a note (live preview *and* the reading view; the reading view did not hydrate view blocks before).
- **Every pane is a block** through one adapter, `paneBlock(kind)`. No pane component was rewritten.
  - The pane's spec comes from the block's options: `specFromOptions(kind, options)` in `lib/panes.ts`, an exhaustive `switch` over `PaneKind` — a new pane kind fails `npm run check` until it says how it is embedded.
  - Instead of a dockview tab, an embedded pane gets a **shim** (`embedPanel`) with the only panel members panes use: `id`, `title`, `isActive`, `setTitle`, `updateParameters`, `onDidActiveChange`, `close`. `isActive` is "the keyboard is inside it", so an embedded editor never grabs the focus on load.
  - Embedded panes fill a box: default height 420 px, `height:` in the YAML overrides it, and the box can be pulled taller (CSS `resize`).
- **`lib/views.ts`** shrank to row views only: `renderView`, `registerView`, `rowViewTypes`.
- **Pane kind `block`** — `{ kind: "block", src, doc, title? }`; its id is the document plus a hash of the YAML, so the same block opened twice focuses the existing tab.

## Block names

A block's type is what `type:` (in a note) or `view:` (in a page) says.

- Built-in: `greeting`, `capture`, `focus`, `log`, `tasks`, `activity`, `settings`, `search` (a saved search's results), `suggestions`.
- Row views: `list`, `table`, `calendar` (+ plugin views).
- Panes: `today`, `editor`, `terminal`, `files`, `pdf`, `image`, `web`, `git`, `commit`, `diff`, `base`, `page`, `excalidraw`, `rnote`, `plugin`, `library`, `outline`, `commands`, `graph`.
- Three pane kinds share a name with an older, lighter block that files already use, so the pane gets its own name: **`search-pane`**, **`settings-pane`**, **`file-table`** (the `.tsv`/`.csv` viewer; `table` stays the row view).
- Plugins: dotted names (`runs.plot`).

Options per pane block: `path:` for file panes (`editor`, `pdf`, `image`, `file-table`, `base`, `page`, `excalidraw`, `rnote`, `diff` + `staged:`), `url:` for `web`, `hash:` for `commit`, `preset: shell | claude` for `terminal`, `id:` (+ `path:`) for `plugin`, `q:` for `search-pane`, and `height:` for any of them. A block missing what it needs says so in place ("a pdf block needs `path:`").

## What to watch out for

- **Two editors on one file** (a tab and an embed, or two embeds): each autosaves with `base_mtime`; the one that saves second while both are dirty shows the existing "changed on disk" banner. Clean editors reload on the file event. Not a data-loss path, but a visible one.
- **Registries keyed by panel id** (`editors`, `terminals`, `paneFocus`, `pdfPages` in `lib/registry.ts`) receive the shim's id (`<pane id>@embed<n>`). `kindOf(id)` still works (the kind is the part before the first `:`).
- **Embedded panes are not width-aware yet.** The Library's three columns are cramped below ~600 px; panes were laid out for a full tab. Follow-up: container queries per pane.
- **`Outline` embedded** follows the last focused editor, exactly as the pane does.
- **Not yet folded in** (still their own small mechanisms, to be moved onto the registry next): `![[x.base]]` embeds (`lib/bases.ts`), drawing embeds (`lib/draw-embed.ts`), image embeds (`lib/raw.ts`), and `lib/openers.ts` ("Open with…").

## Tests

- `ui/tests/blocks.spec.ts` — Library + editor + table file embedded in a page; a block lacking `path:` shows its error; the embedded Library opens as the real Library tab; a pane block inside a note; a calendar opened as a tab still reads its note.
- Unchanged and passing: `view-blocks`, `plugins-v3`, `plugins`, `settings`, `usage`, `suggest`, `mentions`, `latex-snippets`, `md-render`, `today-days`, `smoke`.


## Later in the same session: a fourth host and shell blocks

- `BlockHost` gained `"side"`: the sidebar mounts the blocks its file lists ([SHELL.md](../design/SHELL.md)).
- `Block.bare`: a part of the shell (`toolbar`, `pins`, `bookmarks`, `tabs`) — never framed, no "open as a tab" button.
- `blockTab(src, doc, title)`: the tab a block opens as (its own pane when it has one, else the block alone). The corner button and bookmarks both use it.
- `paneBlockType(kind)`: the block name of a pane kind (`search` → `search-pane`), for turning an open pane into a bookmark.
- `specFromOptions` reads `title` for pages, plugins and terminals, and `n` for terminals, so a pinned terminal keeps its number and name.
