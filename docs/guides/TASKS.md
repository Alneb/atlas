# Tasks, Atlas's way

Atlas does not recreate all of Obsidian's Tasks plugin. Wanted: **priority and recurrence read by the views, and a flexible task block (filters, grouping, sorting, done / not done, by file or tag)**; not wanted: a port of the Obsidian Tasks plugin's query language. This is that.

A task is a checkbox line in any note. Nothing is stored anywhere else: what a task is, when it is due, how often it repeats — all of it is the text of its line.

## What a task's line can say

The fields of the Obsidian Tasks plugin are read, by shape, so tasks written in Obsidian work as they are:

```markdown
- [ ] Submit the abstract ⏫ 🔁 every week 🛫 2026-10-10 📅 2026-10-17 #phd
```

| in the line | means | in a row's `props` |
|---|---|---|
| `📅 2026-10-17` (also `🗓`, `due:: 2026-10-17`, `@2026-10-17`, or a bare date) | due | `due` |
| `⏳ 2026-10-15` | scheduled | `scheduled` |
| `🛫 2026-10-10` | may start (hidden before that day) | `start` |
| `➕ 2026-10-01` | created | `created` |
| `✅ 2026-10-17` | done on | `completed` |
| `🔺` `⏫` `🔼` `🔽` `⏬` | priority: highest, high, medium, low, lowest | `priority` |
| `🔁 every week` | repeats | `recurrence` |
| `#work`, `#work/thesis` | tags (they stay in the title) | `tags` |

The date a calendar places a task on is its due date, else its scheduled date, else its start. Typing these is helped by the task suggestions in the editor (three letters of a field's name on a to-do line).

Code: `crates/atlas-core/src/tasks.rs` (`parse`, with its tests).

## Typing a task

What is offered while a task is typed is decided in one place, `crates/atlas-core/src/task_suggest.rs`, for the note editor (`taskSource` in `ui/src/lib/editor/md-complete.ts`), the capture box on the Home page (`ui/src/lib/textarea-complete.ts`, through `GET /api/tasks/suggest`) and the quick-capture window (`crates/atlas-capture`, which links the crate). The three behave the same; only Enter differs in meaning (a new line in a note, *save* in a box), and in all three the ⏎ row comes first so Enter keeps that meaning.

The rules are Obsidian Tasks' own, read from an installed copy of the plugin (`<vault>/.obsidian/plugins/obsidian-tasks-plugin/main.js`, its `CU` / `NU` / `FU` suggesters) with a real vault's settings (`autoSuggestInEditor` on, `autoSuggestMinMatch` 0, `autoSuggestMaxItems` 20, emoji format, created date on):

- **On a task line the list is always there** (`[editor] task_suggest = "always"`, the default; Obsidian's "minimum match 0"). The fields, in Obsidian's order and words: due date, start date, scheduled date, high / medium / low / highest / lowest priority, recurring (repeat), created today (and Atlas's "done today"). A field the line has is not offered again; one priority takes the others away.
- **The last word typed filters by "contains"** (as Obsidian: "du" brings due date *and* scheduled date), plus Atlas's synonyms (deadline, urgent, someday…). Nothing matched: every field, appended at the caret (a space first after a word).
- **⏎ first, always.** Obsidian lets Enter take a matching field; typing *"fix the low"* + Enter became 🔽 and made no new line, so in Atlas Enter is a new line (in a note) or *save* (in a box) until Tab or ↓ moves onto a field.
- **Tab**: on a list of matching fields, Tab walks it; on the full list (nothing matched, `browsing` in the answer) Tab indents the task, as in Obsidian. **Escape** on a list still at ⏎ closes it and reaches vim at once (with the list on every task line, two Escapes would otherwise be the rule).
- **After 📅 / ⏳ / 🛫 (or `@word`)**: the days — today, tomorrow, the next six weekdays, next week, in two weeks, next month, next year — and what is typed read as a date ("next fri", "in 3 days", "+2w"), written `YYYY-MM-DD`. After 🔁: the rules Atlas can step.
- **`@`** on a task line is the task's: a bare `@` opens the fields (and is replaced by the one taken), `@tom` the days. Citations still come from `[@key` there; a bare `@` cites only off task lines (`citeSource`). A bare `@` used to list the days mixed with the vault's citation keys, which read as a random set of words.
- **Short forms in a note** (`[editor] task_short_forms`, on): `[] `, `todo `, `TODO ` at the start of a line (or after a list's `- `) become `- [ ] `, as the capture boxes read them (`capture::starts_as_task` is the one rule for the boxes). **Backspace** after a task's box takes one step: `- [ ] ` → `- ` → nothing (CodeMirror's `deleteMarkupBackward` removed it all at once).
- `[editor] task_suggest = "match"`: only a matching word (or `@`) opens the list; `"off"`: only Ctrl+Space.

Checked: `task_suggest.rs` tests (Obsidian's order, contains, the bare `@`, capture vs editor), `atlas-capture` `complete.rs` tests, `task-complete.spec.ts` (always on, Tab indents, one Escape, `[]` / `TODO`, Backspace steps, `@` without citations), `capture-hints.spec.ts` (the Home box offers the same fields). Reproduced first read-only in WebKit on a real vault: no list ever appeared while typing `- [ ] buy milk`.

## Ticking

A plain task (`- [ ] buy dice`) is ticked and nothing else: `- [x] buy dice`.

A task **written with fields** is ticked the way the Tasks plugin does it — `✅ <today>` is added:

```markdown
- [x] pay the rent 📅 2026-10-15 ✅ 2026-10-14
```

A **recurring** task also leaves its next occurrence, still open, on the line above:

```markdown
- [ ] water the plants 🔁 every week 📅 2026-10-19
- [x] water the plants 🔁 every week 📅 2026-10-12 ✅ 2026-10-14
```

The rules read: `every day`, `every week`, `every month`, `every year`, `every N days / weeks / months / years`, `every weekday`, each optionally followed by `when done`. The next date is counted from the task's own date (a weekly task done two days late is due next week all the same), or from the day it was ticked with `when done` or when the task has no date. Every date of the line keeps its distance to the one that moves (a start five days before the due date stays five days before). The 31st of a month without one is that month's last day. **A rule that is not one of these (`every full moon`, `every month on the last Friday`) is not guessed at**: the task is ticked and no next occurrence is made.

Code: `today::tick_task_on`, `tasks::next_occurrence`. It is the same for every place a task can be ticked (Today, a list, a calendar, the task list below): they all call `POST /api/task/tick`.

**In a note** the box of a task line, and Ctrl+L on a single to-do, tick the same way, though the note's text is in the editor rather than on disk: `POST /api/task/line {text, done}` hands the core one line and gets back the lines that replace it (`today::tick_line`; `untick_line` for a box opened again, which takes the `✅ date` off, as the Tasks plugin does). The box flips at once; the core's line replaces it when it answers, unless the line was edited meanwhile (then the plain flip stays). Code: `ui/src/lib/editor/task-tick.ts`.

**The task dialog**: Obsidian Tasks' "Create or edit task" on any note's line — right-click → **Task…**, the phone's format bar (📅), or the palette ("Note: create or edit task…"). The form holds the description (with its #tags and [[links]]), the priority (highest … lowest), due / scheduled / start dates (with Today · Tomorrow · In a week), the repeat rule and done. Save writes the line back in Obsidian Tasks' field order (description, priority, 🔁, ➕, 🛫, ⏳, 📅, ✅), so a line edited here and in Obsidian stays the same; ticking it done here writes today's ✅. A plain line (`text`, `- item`, `1. item`) becomes a task with its list mark kept. If the line changed while the dialog was open (a sync), nothing is overwritten: the task goes on a new line below. Code: `ui/src/lib/task-line.ts` (parse / write, pure), `ui/src/components/TaskDialog.svelte`, `ui/src/lib/editor/task-dialog.ts`; spec `ui/tests/task-dialog.spec.ts`.



## The task list — `type: task-list`

A view block (in a note, a page, the sidebar):

````markdown
```view
type: task-list
from: tasks          # section (default: this section) · note (this note) · tasks (every note of the vault)
show: open           # open (default) · done · all
tag: [work, admin]   # any of these tags; a tag takes its sub-tags (work also finds #work/thesis)
path: notes/projects # only tasks in this folder or file
priority: medium     # this priority or higher
due: week            # overdue · today · week (the next 7 days, and what is overdue) · dated · undated · a day (2026-10-25)
completed: 2026-10-25  # done that day (✅ 2026-10-25), with show: all or done — a day's log shows its own
started: true        # default: hide tasks whose 🛫 start is still in the future
sort: [priority, due]  # priority · due · start · file · title — the first is the most important
group: due           # due (Overdue, Today, This week, Later, No date) · priority · file · tag
limit: 20
```
````

Every line is optional; a block with only `type: task-list` lists the open tasks of its section. On a page, the block's **Options…** form has all of these as fields (`TASK_FIELDS` in `ui/src/lib/block-options.ts`).

What it draws (`ui/src/components/views/TasksView.svelte`): a checkbox, a mark for the priority (`‼` `!` `·` `↓` `⇊`; high ones in bold, low ones muted), the title (a click opens the note at that line), `↻ week` for a repeating task, and the date as one reads it — *Yesterday* and anything overdue in red, *Today* and *Tomorrow* in the accent colour, a weekday within the week, the date beyond. Groups have a heading with their count, in the order of urgency for `due` and `priority`.

The same options work on the other task views: `type: list` or `type: calendar` with `tag: phd` filters the tasks they show. They apply only where the rows are tasks (`from: section`, `note` or `tasks`); a table of notes is not touched by them.

The name: `type: tasks` was already taken — it is the "Open tasks" part of Today, a block of its own, which stays as it is.

An option that is misspelt or has a value that is not one of the list is an error shown in the block (`view: due: "someday" (overdue, today, week, dated, undated, or a day YYYY-MM-DD)`), not silently ignored.

Code: `tasks::Query` (`apply`: filter, sort, group, limit) and `views.rs` (`ask`). The filtering, sorting and grouping are done in the core, so every view — and a plugin's — gets the same rows.

## What is not there (on purpose, or not yet)

- No query language: the options above are the whole of it. A question they cannot ask is a plugin's row view over `atlas.query`, or a reason to add one option.
- No dependencies between tasks (`⛔`, `🆔`), no `on completion: delete`, no custom statuses (`[/]`, `[-]`): read as plain text.
- Recurrence rules with a weekday or an ordinal are not read (see above).
- A done recurring task and its successor are two lines; nothing links them but their text.
- ```` ```tasks ```` blocks of the Tasks plugin are not rendered (they are that plugin's language); a `task-list` block is written instead.

## Tests

`tasks.rs`: `a_task_line_is_read_by_the_shape_of_its_fields`, `a_recurring_task_ticked_makes_its_next_occurrence`, `a_block_filters_sorts_groups_and_limits`. `today.rs`: `ticking_a_task_written_with_fields_dates_it_and_a_recurring_one_leaves_its_next`, `all_tasks_lists_done_ones_too`. UI: `tasks-block.spec.ts` (grouping, priority, recurrence, a tag filter, and ticking a weekly task). Looked at in both themes.
