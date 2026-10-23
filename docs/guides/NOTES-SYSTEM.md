# A note system out of generic pieces — review, next actions, typed links, trees, templates, the starter kit

Phase 5 of the overhaul. The goal: the system of NoBoilerplate's Obsidian videos (fleeting → literature → atomic notes, projects with next actions, a daily review with snooze, `up:` links instead of folders). The decision on how: **generic primitives in the core, the system itself as an editable starter kit of files**; existing folders stay; nothing in the core knows the words "fleeting" or "project".

So this document has two halves: the primitives (useful to any vault, whatever its system), and the kit (one way to use them, as plain files).

## The primitives

### A review queue kept in the notes — the `review` block
```yaml
type: review
filters: 'type == "fleeting"'           # Bases filters: which notes. Without it: notes that have `review:`
types: [literature, atomic, project]    # what "Keep as…" offers
```
One note at a time, with its text. Each answer is a property written to that note, so the queue lives in the files and any other tool can read it:

| answer | key | writes |
|---|---|---|
| Open | O / Enter | nothing; opens the note |
| Keep as… | K | `type: <chosen>`, `review: done` |
| Tomorrow | T | `review: <tomorrow>` |
| Later | L | `review: <today + n days>`, `review_interval: <2n>` — 2 days, then 4, 8… |
| Done | D | `review: done` |
| Skip | N / P | nothing; next / previous |

A note is waiting when it matches the filters and has no `review:` (with filters — an inbox), or its `review:` date has come. `review: done` never returns. Without `filters`, the block shows whatever asked to come back: put `review: 2026-11-01` on any note and it appears that day. Code: `ui/src/components/views/Review.svelte` (UI only: `api.baseQuery` through `lib/base-rows.ts`, and `PUT /api/property`).

### Next actions — `from: next-actions`
```yaml
type: list
from: next-actions
filters: 'type == "project"'
```
One row per matching note: its **first unchecked task** (the next step of a project), with the note's name beside it. A note whose `start:` is in the future is left out until then. Rows are ordered by date — the task's own (`📅 2026-10-20`), else the note's `due:` — undated last. Ticking the checkbox ticks the task in its note, and the project's next task takes its place. Code: `next_actions` in `crates/atlas-core/src/views.rs`.

### Typed links
A link that is the value of a property — `up: "[[Thesis]]"` in the frontmatter, or `up:: [[Thesis]]` in the text — carries that property's name as its **relation**. `GET /api/backlinks` returns it (`Backlink.relation`), and the backlinks panel of the target shows, above the linked mentions, each relation with the notes that point here through it (`up 2 · Paper · Talk`). Code: `links.rs` (`RawLink.relation`, `inline_key`), `ui/src/components/Backlinks.svelte`.

### A tree by a property — the `tree` view
```yaml
type: tree
by: up                      # the property that names a note's parent (default: up)
filters: 'type == "project"'
```
Notes nested under the note their `by` property links to: a hierarchy made of properties, not folders. A note whose parent is not among the rows is a root. Rows of note sources (`folder:`, `filters:`, `base:`) now carry their property columns in `props` (a link as the path it resolves to); `by:` and `columns: [a, b]` add columns to carry. Code: `ui/src/components/views/TreeView.svelte`, `notes()` in `views.rs`.

### Notes from templates
A template is a plain note in the templates folder (`[notes] templates`, default `templates/`). In it `{{date}}`, `{{time}}` and `{{title}}` are filled in — the syntax of Obsidian's core Templates plugin, a deliberately small subset.

- **New note from a template…** (Ctrl+Alt+N): choose the template, type the name; the note is created in the folder of the file in front of you and opened.
- **Quick open creates**: Ctrl+P, a name that no file has → "Create note “…”" (offered only once the search has answered, so Enter typed early never creates what was about to be found).
- A new note **never replaces a file**: a taken name gets " 2", " 3"… (`create_new` in the core).
- `POST /api/note/new {template?, title, dir?, text?}` → `{path, line}`. Code: `crates/atlas-core/src/notes.rs`, `ui/src/lib/notes-system.ts`.
- **For agents** (`atlas mcp`): `atlas_templates` lists the templates the chooser offers (the `.md` files directly in the templates folder) with each one's folder (`create_in:` or Templater's `tp.file.move`, for a note made now) and the properties its frontmatter defines; `atlas_new_note {path, template?, title?, fields?, text?}` makes the note with the same engine (`draft()` in `notes.rs`: `{{…}}` and Templater tags, the template's properties), sets `fields` with the same in-place frontmatter edit as a Bases cell (`frontmatter::set_property`; text, numbers, booleans, lists, null — an object is refused), appends `text`, and returns `{path, line, added}` — `added` names the fields the template does not define, so a misspelt property shows. Unlike the chooser it is given an exact path and **refuses a path that exists** instead of numbering it: an agent that names a note means that note. The MCP server's instructions tell agents to prefer it to writing a note by hand. Code: `templates`, `new_note_file` in `notes.rs`; tests `an_agents_note_is_made_at_its_path_from_the_template_with_its_fields_and_never_replaces_one`, `an_agent_lists_the_templates_with_their_folder_and_properties`, and `notes_from_the_vaults_templates_and_never_over_an_existing_one` (`crates/atlas/tests/mcp.rs`, over stdio).

The Templater-compatible engine of the `templates` branch is not merged; when it is, it replaces `fill()` in `notes.rs` behind the same route.

### Templater's simple tags

A template written for Obsidian's Templater works for its simple tags: `<% tp.file.title %>`, `<% tp.file.creation_date("YYYY-MM-DD HH:mm") %>`, `<% tp.date.now("dddd[,] DD [de] MMMM", 1, tp.file.title, "YYYY-MM-DD ddd") %>` (an offset in days, and a reference date read from the title), `<% tp.file.cursor() %>` (the caret goes there) and a quoted string. Dates use the same moment-style formats and month / day names as Bases (`bases::dates`, the `editor.date_names` setting). A template whose script block moves its note — `await tp.file.move(path)`, the path a template literal of text, `${tp.file.title}` and `${tp.file.creation_date("fmt")}`, directly or through one `let x = \`…\`` — has its note made in that folder from the start, as with `create_in:` (`templater_move_dir`; test `a_templater_template_that_moves_its_note_files_it_there`). A path it cannot read is not guessed. **Apart from that, a `<%* … %>` script block is not run**, and neither is any other tag: they stay in the note exactly as written, so nothing is silently lost — the daily template's weather script and `tp.file.move` are of that kind (roadmap 3.7 lists what running them would need). Code: `templater` in `crates/atlas-core/src/notes.rs`; test `templater_tags_the_users_templates_use_are_filled_and_scripts_are_left_alone`.

### Where a new note goes

New Markdown files must be created in the right folders. The rule was once "beside the open file, else the root", which put a note made from the home page at the vault's root.

The rule now, decided in one place (`notes::new_note_at` in the core), first that applies:

1. **the folder asked for** — `dir` in the request (capture uses it for the inbox);
2. **the template's own folder** — a line `create_in: campaigns/sessions` in the template's frontmatter. The line is taken out of the note that is made. This is how a kind of note always lands in its place (a daily note in `log/`, a paper's note in its folder, a TTRPG session in its campaign);
3. **beside the note the user is in** — `near`: the UI sends the folder of the active tab only when that tab is a markdown note inside a folder;
4. **the vault's notes folder** — `[notes] dir` (default `notes`; Settings → Writing). Empty means the root, which is then a choice and not an accident.

The starter kit follows the same idea: its one loose note, `Start here.md`, is written into `[notes] dir` (`kitPlace` in `ui/src/lib/notes-system.ts`); a `Start here.md` already at the root (older kits) counts as present and is not doubled. "New file" in the file tree is not touched by this: there the folder is the one clicked.

Tests: `a_new_note_goes_to_its_templates_folder_then_beside_the_open_note_then_to_the_notes_folder` (core), `notes-system.spec.ts` (the kit's note and a new note are in `notes/`, nothing at the root).

### Capture as notes
`[notes] capture = "log"` (the default: a timestamped bullet in today's log, as before) or `"note"`: every capture (Ctrl+Alt+C, the capture box, `atlas capture "…"`) becomes a note of its own in `[notes] inbox` (default `inbox/`), made from `[notes] capture_template` (default `fleeting`; built in when the vault has no such template), named by its first line. Those notes are what a `review` block with `filters: 'type == "fleeting"'` shows. Settings → Notes has the three settings.

### What is not a note
The note index (backlinks, graph, Bases, tasks, and so every block above) leaves out:
- `editor.index_exclude` — now `["docs/memory"]` by default: an AI agent's memories and session logs are not the user's knowledge. A vault that sets the list itself keeps its own.
- the templates folder — a template says `type: project` without being a project.

Text search still finds both: searching is asking for files, not for knowledge.

## Properties: hidden, in the note, or in a panel to edit them

Properties are hidden by default, with a setting to show them in a right panel and edit them visually, and they follow a written spec (inspired by a real Obsidian vault) so they do not become a mess.

**The setting** `[editor] properties` (Settings → Writing → Properties; also the palette commands *Properties: show / hide the panel beside the note* (`ui.properties`) and *Properties: show them in the note* (`ui.properties.inline`)):

| value | what a note with frontmatter looks like |
|---|---|
| `hidden` (default) | one faint "PROPERTIES n" line above the text; a click on it shows the YAML to edit by hand. The file is never changed by the look. |
| `inline` | Obsidian's table in the note: a row per key, the kind's icon, links and tags as pills, read-only (a click shows the YAML). The audits (`npm run audit:md`, the look parity) run with this value, since they compare with Obsidian (`ui/audit/props-inline.ts`). |
| `panel` | the faint line in the note, and a panel at the right of the note with one control per property. |

**The spec** `[editor] properties_spec` (default `templates/properties.yaml`, a path in the vault): which properties exist, their kind, and what each note `type:` requires. It is the vault's file, not Atlas's — one modelled on an Obsidian vault can also be read by that vault's own linter (`props_check.py`). Read leniently by `crates/atlas-core/src/property_spec.rs` (`GET /api/properties/spec`): an unknown kind is read as text and reported in `problems`, broken YAML gives an empty spec, a path outside the vault is refused. Shape:

```yaml
properties:
  date: {kind: datetime, format: "YYYY-MM-DD HH:mm", description: when the note was created}
  type: {kind: enum, values: [Concept, Lecture, Course]}
  topics: {kind: links, suggest: ["[[Condensed Matter]]", "[[Optics]]"]}
  tags: list                 # the short form: just the kind
types:
  Lecture: {required: [date, type, course], optional: [topics, tags]}
```

Kinds: `text`, `number`, `bool` (also `checkbox`), `date`, `datetime`, `list` (also `multitext`), `tags`, `link`, `links`, `enum` (also `select`). **Without a spec, or for a key it does not list, the kind is guessed from the value's shape** (`inferKind` in `ui/src/lib/property-model.ts`): a list of wikilinks is `links`, other lists `list`, `true`/`false` `bool`, a number `number`, `YYYY-MM-DD` a `date`, `YYYY-MM-DD HH:mm` a `datetime`, one wikilink a `link`; `tags`, `aliases` and `cssclasses` are `tags` (Obsidian gives those three keys a meaning of their own). A `tags` key the spec calls a `list` is drawn as tags too (same list in the file).

**The panel** (`ui/src/components/PropertiesPanel.svelte`, one control per kind in `PropertyField.svelte`): text and number fields; a checkbox; the browser's date / date-and-time picker, written back in the spec's `format` (else in the shape the old value had); a choice for an `enum` (a value outside the spec's list stays choosable, marked "not in the spec"); pills for `link`, `links`, `list` and `tags` — Enter or a comma adds, × or Backspace in the empty field removes, a bare name typed into a link field becomes `[[name]]`, the spec's `suggest` values are offered, a link pill opens its note. Then come the keys the note's `type:` requires and lacks ("required by Lecture"; filling one adds it), and "Add a property…" (offering the type's keys first, then the rest of the spec). A remove says how to take it back (Ctrl+Z, or `u` in vim, in the note). The panel's header shows the note's type. In a narrow pane the panel takes at most 42 % of the width.

**How an edit is written — the one rule that keeps undo and saving right.** The panel never writes the file. It sends the editor's current text and the edit (`{op: set | remove | rename, …}`) to `POST /api/frontmatter/edit`, which applies it with the same code as a Bases cell edit (`crates/atlas-core/src/frontmatter.rs`: only the edited key's block — its line and its indented or `- ` continuation lines — is replaced; the other keys, their order, comments and the body stay byte for byte; a new key goes at the end; removing the last key removes the fences; a key name with `:` or a newline is refused) and answers the new text. `lib/frontmatter-edit.ts` dispatches the difference (common prefix and suffix kept) into the editor as one change (`userEvent: "input.properties"`). So the panel's edits are in the editor's undo history, mark the tab unsaved, and are saved by the editor's own autosave and conflict check. If the note was typed into while the request was out, the edit is dropped and a toast says so, rather than overwrite the typing. Lists are written in block style (`  - item`), strings quoted only where YAML needs it (`'[[Optics]]'`), a date stays unquoted (`date: 2026-10-14 10:30`).

**What draws what in the editor**: the live preview replaces the frontmatter by one block widget (`PropertiesWidget` in the vendored `live-preview.js`); what that widget contains comes from `noteProperties` in `ui/src/lib/editor/create.ts` — `propertiesElement` (the inline table) or `propertiesChip` (the faint line), both in `ui/src/lib/properties.ts`. The widget's key carries the mode and the spec's version, and a settings change or a newly loaded spec dispatches the `redecorate` effect (exported by `live-preview.js`), so switching the setting redraws open notes at once. The chip's outer element is the editor's block and has no margins (CodeMirror measures a block by its border box; a margin shifts every click under it — the audit flags it).

**Not built yet**: renaming a key from the panel (the core has `rename`; there is no control for it), completing note names in a link field beyond the spec's `suggest`, Atlas's own writers (the reading note, a template's `{{date}}`) following the spec's formats, and a check that lists the notes that break the spec.

Tests: `ui/tests/properties.spec.ts` (hidden by default with the file untouched; inline with the spec's kinds; the panel: a date, a tag, a link list, a choice, a number, a checkbox, removing and adding — each time the whole file compared, the body untouched, and vim's `u` undoing a panel edit), `crates/atlas-core/src/property_spec.rs` and `frontmatter.rs` (unit), `properties_spec_and_frontmatter_edits` in `crates/atlas-core/tests/server.rs`.

## The starter kit — `kits/flap/`

Files, bundled in the app as text and copied into a vault only when asked:

| file | what |
|---|---|
| `Start here.md` | the system on one page, with links to the rest |
| `.atlas/pages/Inbox.page` | capture box; the review of fleeting notes; "still fleeting"; "asked to come back" |
| `.atlas/pages/Next.page` | next actions of projects beside the calendar; the Projects table |
| `.atlas/pages/Projects.base` | `type == "project"`: a table and a board by `state` |
| `templates/{fleeting,literature,atomic,project,daily}.md` | the five kinds of notes |

The kit keys on the property `type:` (which real vaults already use), points upward with `up:`, and uses `state`, `start`, `due`, `review` — nothing else. Every file is the user's to change after it is copied.

**Starter kit: add the note system's files…** lists every file of the kit with "new" or "already in the vault — kept as it is", and writes only the missing ones, only after the confirm row is chosen (and checks again at the moment of writing). It never replaces a file. Code: `installKit` in `ui/src/lib/notes-system.ts` (the files are read with `import.meta.glob`; `vite.config.ts` allows the dev server to read `../kits`).

To make another kit: a folder under `kits/` and a second command; nothing else in the app knows about `flap`.

## What to watch out for

- **A chooser's rows need distinct value + title.** The kit's first version gave several rows the value `""`; the palette keyed rows by value, Svelte threw on the duplicate key, and the chooser showed the previous command's text and no rows. The palette now keys by value and title, and its text and selection are set by whoever opens it (`palette.q`, `palette.sel` in `palette.svelte.ts`) instead of being reset by an effect.
- **Review answers are two writes** (`type`, then `review`): a reader in between sees the first only.
- **`next-actions` reads each matching note** to find its first open task: keep its `filters` meaningful on a large vault.
- **The kit's pages live in `.atlas/pages/`**, not in the vault's root (so the vault's root is less crowded, and they are generated for new vaults; of the choices offered, the pages and `Projects.base` — `Home.page`, `templates/` and `Start here.md` stay). That folder is the one dot-folder the core's walk enters (`walk::PAGES`), so `[[Inbox.page|Inbox]]`, quick open, embeds and the "already covered by a base" check still find the files; their text is not searched (ripgrep skips hidden folders). A page refers to a base by its path from the root (`base: .atlas/pages/Projects.base`). A vault that already has a kit page in its root keeps it: the kit looks in both places and never writes a second one (`placesOf` in `notes-system.ts`).
- **The fixture vault is shared by the tests**: the kit test leaves the kit's files in it (other specs must not assume there is no `Next.page`).
- The plan's list of editor comforts is done: nested tags with a `tags` block and `tag:` search (below), typewriter scrolling (`[editor] typewriter`), board cards dragged between columns, and moving a section from the Outline.
- **Moving a section from the Outline** (Ctrl+Shift+O): drag a heading onto another one — the upper half of the row puts the section in front of it, the lower half after it — or focus a heading and press Alt+Up / Alt+Down to step it past its neighbour of the same level. The section is the heading with everything up to the next heading of its level or above, so its subsections go with it; heading levels are not changed. It is one edit in the note (one undo), works for markdown and for `.tex` sectioning, and a blank line is kept between the sections when one was there. Code: `ui/src/lib/section-move.ts` (pure line arithmetic), `moveSection` on the editor handle, `panes/Outline.svelte`; test `outline-move.spec.ts`.

## Tests

- Core: `links.rs` (`a_link_that_is_a_property_value_is_typed`), `views.rs` (`next_actions_are_the_first_open_task_of_each_matching_note`: order, `start`, the note's `due`, templates and `docs/memory` left out, `by:` carries the resolved parent), `notes.rs` (template filled in, never replaces, missing template, path escape, untitled, built-in fleeting), `capture.rs` (`note_mode_makes_a_fleeting_note_per_capture`).
- Browser (`ui/tests/notes-system.spec.ts`): the review block (Later doubles the gap; Keep as… by keyboard; the note's text untouched); next actions, the tree and typed backlinks from three project notes; the kit lists and keeps an existing file, writes the rest only after the confirm, then a note from a template and a note created from quick open.

## Tags

A note's tags are its frontmatter `tags:` (a list, or words separated by commas or spaces) and every `#tag` in its text outside code; `#physics/dmft` nests, and counts as a note of `physics` too. Compared in lower case; `#42` is a number, not a tag. They are read with the link index (`tags.rs`, `Parsed.tags` in `links.rs`), so a note is re-read only when it changes and an agent's files and the templates have none.

- **`tags` block** (`{view: tags}` in a `.page`, a ```` ```view ```` in a note, or the sidebar's page): every tag with its number of notes, nested ones indented; a click lists the tag's notes, a note opens. `ui/src/components/views/Tags.svelte`.
- **`tag:<name>`** in quick open (Ctrl+P) and in the Search pane lists the notes with that tag or one nested under it (`search.rs`; the palette shows the core's answer as it is, `tagQuery` in `Palette.svelte`).
- API: `GET /api/tags` → `[{tag, notes}]`.

Tests: `tags.rs` (two), `ui/tests/tags.spec.ts`.


## Capturing a task

**The box says it itself**: empty, its foot lists the short forms (`[] ` or `todo ` makes a to-do · `@tomorrow` `@fri` `@+3d` a date); with text in it, it says what Enter will write — "a line in today's log", "a to-do, due tomorrow". The rules shown are a copy, for display only, of the core's (`ui/src/lib/capture-hints.ts` mirrors `as_task` and `with_dates` of `capture.rs`; the core decides what is written — change both together). Test: `capture-hints.spec.ts`.


A capture that starts as a task is written as one, whatever the capture mode: `[] call Ana`, `[ ] call Ana`, `- [ ] call Ana`, `todo call Ana`, `todo: call Ana`, `t: call Ana` all append `- [ ] call Ana` to the day's log (in "note per capture" mode too: a task is a line among the day's tasks, not a note). Before, every capture was written as `- 12:30 …`, so a typed `- [ ]` ended up behind the time and no view counted it — a task typed in a capture did not show up as a task. A date can be typed short: `@today`, `@tomorrow`, `@mon` … `@sun` (the next such day), `@+3d` become `@YYYY-MM-DD`, which the task views read as the date. Code: `as_task`, `with_dates` in `capture.rs`.

In a note, **Ctrl+L** turns the caret's line (or every selected line) into a to-do, again marks it done, again reopens it (`note.task`, `toggleTask` in `editor/md-format.ts`); `/todo` in the slash menu inserts one. **On a to-do line the Obsidian Tasks suggestions work**: three letters of `due`, `scheduled`, `start`, `high` / `medium` / `low` (priority) or `recurring` (or Ctrl+Space) offer the field, choosing it writes its emoji (📅 ⏳ 🛫 ⏫ 🔼 🔽 🔁), and after a date emoji or `@` the dates are offered by name — today, tomorrow, the weekdays, in a week… — and written as `YYYY-MM-DD` (`taskSource` in `editor/md-complete.ts`). Only the date is read by Atlas's task views so far; priority and recurrence are written the Tasks way but nothing sorts or repeats by them yet.
