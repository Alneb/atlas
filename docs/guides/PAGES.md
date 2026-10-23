# Pages — screens you arrange by hand

A `.page` file is a screen made of blocks: rows, and optionally columns inside a row. The home screen is one (`Home.page`). Phase 2 of the overhaul (`~/.claude/plans/prancy-swinging-kay.md`) made pages editable **by hand**; before, the only way to reshape one was to edit its YAML.

## The file

```yaml
# comments above the keys are kept
title: Today
rows:
  - [greeting]                                   # a row: a list of blocks, top to bottom
  - columns:                                     # or columns, each a list of blocks
      - [focus, log]
      - [tasks, {view: calendar, from: tasks, title: This week}]
    widths: [2, 1]                               # optional relative widths
  - [{view: pdf, path: refs/papers/x/paper.pdf, height: 500}]
```

A block is a bare name (`tasks`) or `{view: <type>, …options, title: …}`. Any block of the registry works (the page's "add a block" chooser lists them). Older shorthands still read: `{note: x.md}`, `{base: x.base}`, `{text: "markdown"}`; the first hand edit rewrites them as `{view: note, path: x.md}` and so on.

Three content blocks exist for pages: `note` (a note rendered; "open as a tab" edits it), `text` (markdown written in the page file itself), `base` (a database table; as a tab it is the Base pane).

## Arranging

**Arrange** (top right of a page) turns every block into an object with a bar:

| gesture | what it does |
|---|---|
| drag a block's bar onto a slot | moves it: between blocks, into another column, to a new row |
| **+** on a slot | adds a block there: a chooser of every block type; a block that shows a file then asks which file |
| **+** at the right edge of a row | adds a block in a new column |
| the bar's menu (▾) | Title…, Height… (for blocks that fill a box), Move up / down / to a new column / to its own row, Duplicate, Remove |
| drag the gap between two columns | resizes them (`widths:`) |
| **Undo** / Ctrl+Z | takes back the last change (up to 30) |
| **Done** / Esc | leaves arrange mode |

Every drag has a menu alternative, so the whole thing works from the keyboard.

**Each gesture is one write of the file.** There is no second copy of the layout anywhere: the page is redrawn from the model, the model is written to the YAML, and "Edit as text" shows exactly what the gestures produced.

## How it is built

- `ui/src/lib/page-doc.ts` — the model and its edits, with no UI in it.
  - `parsePage(text)` → `{ model, doc }`; `writePage(model, doc)` → text. Only the `rows` key is rewritten, through the `yaml` library's document API, so the title, any other keys and the comments above them survive. Comments *inside* the old `rows` are not kept (stated limit).
  - Pure edit functions on the model: `insertBlock`, `insertRow`, `insertColumn`, `moveBlock` (to a `Drop`: `at` / `row` / `column`), `removeBlock`, `setWidths`. Emptied rows and columns disappear (`tidy`).
  - Output style: one line per list of blocks, so a page reads — and diffs — as its layout.
- `ui/src/panes/Page.svelte` — draws the model (each block through `mountBlock`, so a page shows exactly what a note would) and holds arrange mode: slots, the bar, the menu, column resizing, undo. Saving uses `PUT /api/file` with `base_mtime`; a conflict (the file changed on disk meanwhile) reloads the page and says so.
- The block chooser is the palette's `pick` — Atlas's one chooser, the same as "Open with…".
- A block declares what the chooser needs to know in `lib/blocks.ts`: `file` (it shows a file: ask which), `card` (content that sits on a card surface), `height` (it fills a box).

## What to watch out for

- Moving a block to another column remounts it (an embedded terminal restarts). Reordering inside one column keeps it.
- Dragging a block's height by its corner (a framed block) is not saved yet; **Height…** in the menu is.
- The core keeps a small `.page` reader (`crates/atlas-core/src/page.rs`) for two things only: the home page's title and checking the pages the toolsmith drafts. The route `GET /api/page` and its generated TypeScript types were removed (the UI's model is `ui/src/lib/page-doc.ts`).
- **Options…** in a block's menu (while arranging) opens a form with the block's options: where a list's rows come from, a database's view, a terminal's preset, a file's path… Saving writes them into the `.page`; an emptied field removes its key. The form is drawn from the fields the block declares (`{ key, label, hint?, kind }` with `kind` one of `text`, `number`, `toggle`, `list` (comma-separated, written as a YAML list) or `choice` (with `choices: [...]`)): built-in blocks in `ui/src/lib/block-options.ts` (`BUILTIN_FIELDS`, and `ROW_VIEW_FIELDS` shared by every row view), a plugin's block as the third argument of `registerBlock`. A block that declares nothing has no Options… and is configured as text (Edit layout). Options that are structures (`filters:`) stay text. In a note a block is its own text, so there is no form there. Code: `components/BlockOptions.svelte`, `optionFields` in `blocks.ts`; test `block-options.spec.ts`.

## Tests

`ui/tests/page-arrange.spec.ts`: add through the chooser, move by menu and by drag, remove, undo — asserting the file's text after each gesture and that the leading comment and title are untouched; a block that shows a file asks which one; old shorthands still read.
