# Notes that compute — inline expressions and section properties

Phase 4 of the overhaul (`~/.claude/plans/prancy-swinging-kay.md`). Before it, a note could hold live *blocks* (a table, a calendar) but a sentence could not contain a computed value, and data written under a heading was known to nothing. Now:

```markdown
---
budget: 100
due: 2030-01-10
---
# Trip
cost:: 40
Left: `= note.budget - section.cost`, in `= days(today, note.due)` days.

## Hotel
cost:: 15
nights:: 3
Per night `= round(props.cost / props.nights, 2)`; open tasks: `= tasks.filter(t => !t.done).length`
- [ ] book it 📅 2030-01-02
```

The language is **JavaScript** (one scripting language for plugins, `init.js` and expressions). There is no formula dialect to learn or to maintain.

## Inline expressions

Inline code that starts with `=` is an expression: `` `= 6 * 7` `` shows `42`. This is Dataview's inline syntax, so the note stays readable as plain markdown anywhere else.

- **In the editor** the value is shown in place, with a dotted underline that says "computed". Put the caret in it (click it) and the source is back. It recomputes as you type.
- **In the reading view** (a `note` block on a page, hover previews) the value is shown the same way.
- **Right-click a value**: *Copy value*, *Freeze as text* (the formula is replaced by what it shows — a result is a thing you can keep), *Edit the formula*.
- **An error** shows `⚠`; hover it for the reason. An expression that runs longer than 3 s is stopped and says so; the ones waiting behind it are asked again.

What an expression sees:

| name | what |
|---|---|
| `note` | the note's frontmatter (`note.due`, `note.tags`) |
| `section` | the `key:: value` properties of the section the expression is in, and of the sections around it |
| `props` | both merged; the nearest wins (section over an outer section over the frontmatter) |
| `tasks` | the tasks of its section (subsections included): `{ text, done, line, due }` |
| `heading`, `path` | the heading it is under; the note's path |
| `today`, `now` | `"2026-10-13"`; a `Date` |
| `days(a, b = today)` | whole days from `a` to `b` |
| `sum(list)`, `avg(list)`, `round(x, digits)` | numbers out of lists |
| `await rows(yaml)` | the rows of a Bases query (its first view), one object per note: `path` plus a value per column (under its id, its frontmatter key and its label). `` `= (await rows("filters: 'type == \"paper\"'")).length` `` |
| `await note_of(path)` | another note's frontmatter |

An expression is one JavaScript expression; `await` works. Values are shown as text: numbers to 6 significant digits, lists comma-separated, `true`/`false` as yes/no, nothing as `—`.

## Section properties

A line `key:: value` (alone, or as a list item) is a property of the section it is in; `[key:: value]` or `(key:: value)` does the same inside a sentence. Sections inside inherit it — so a property written under `## Results` is known to every expression and block below that heading, and the note's frontmatter to all of them. This is Embark's idea that data in a document flows down its outline, with Dataview's syntax.

- Values: a number is a number, `true`/`false` a boolean, anything else text (a date, a `[[link]]`).
- A key with spaces or capitals is also available in plain form: `Sample size:: 4` → `props["Sample size"]` and `props.sample_size`.
- A space must follow `::` (`std::vector` in a sentence is not a property), and nothing inside a code fence counts.
- The key is dimmed in the editor so the value reads first.

**Blocks read them too.** A block's `ctx.props()` (built-in blocks) and `block.props()` (plugins) return the frontmatter merged with the properties of the section around the block. A plugin block that takes its run from the note (`runs.plot` reads `run`) now also takes it from `run:: X` under a heading, so one note can hold several runs, one per section, with no option repeated in each block.

## Trust

An expression is code of your own vault, like a plugin or `.atlas/init.js` — it runs because it is in a note you opened. The containment is for accidents and pasted notes, not a security boundary against a determined author:

- it runs in a **web worker**: it cannot touch the page, the editor, or the app's state, and cannot freeze the app (3 s limit, then the worker is replaced);
- the worker's `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, storage and `navigator` are removed before any expression runs, and `import(…)` is refused;
- what it knows arrives as plain data; the only things it can ask the app for are the two **read-only** calls above (`rows`, `note_of`), answered for this vault;
- it cannot write: no file, no property. Changing a note stays something only the user (or a command they run) does.

## Code

| file | what |
|---|---|
| `ui/src/lib/section-props.ts` | pure: `scopeAt(text, line)` → `{ note, section, props, heading, tasks }`; `lineOf` |
| `ui/src/lib/expr.ts` | `evaluate`, `formatValue`, `renderExpr` (fills an element; remembers the last value per expression and scope), `hydrateExprs` (reading view), the `HOST` table of calls the worker may make |
| `ui/src/lib/expr-worker.ts` | the worker: closes its doors, the helpers, runs one expression per message |
| `ui/src/lib/editor/expr.ts` | the editor extension: value widgets, the dimmed keys, the right-click menu — wired by one line in `editor/create.ts` |
| `ui/src/lib/markdown.ts` | one renderer rule: `` `= …` `` → `<code class="expr" data-expr>`; `Markdown.svelte` calls `hydrateExprs` |
| `ui/src/lib/blocks.ts` | `BlockCtx.props()` |

To add a helper every expression has: add it to `helpers` in `expr-worker.ts` (pure), or — when it must read the vault — to `HOST` in `expr.ts` and to the `env` line in the worker. Keep `HOST` read-only.

## What to watch out for

- **A widget is redrawn on every edit and caret move** (its scope may have changed). That is cheap because the note is parsed once per text (`section-props.ts` remembers the last one) and `renderExpr` asks the worker again only when the expression's scope actually changed — except expressions that read beyond the note (`rows`, `note_of`, `now`), which are asked on every draw.
- **The right-click menu finds the formula at click time** (`posAtDOM`), not from positions saved when the widget was drawn: text typed before it would make those stale (a real bug while building this).
- **Reading view scope**: the nth copy of an expression takes the scope of its nth place in the text. Inside a fragment the editor renders through markdown (a table, a callout), every copy takes the first place's scope.
- **Tests run against the built UI**; the worker is a separate chunk (`vite.config.ts` `worker.format = "es"`).
- Not done: expressions in a block's YAML (`run: = section.run`), a "show all formulas" toggle, completion of scope names while typing.

## Tests

`ui/tests/expr.spec.ts`: `scopeAt` (inheritance, the nearest wins, tasks with due dates, fences and `std::vector` ignored, keys with spaces, bracketed fields); in the browser — values per section, an error with its reason, `fetch` undefined, ordinary inline code untouched, the source at the caret, live recompute on editing a property, *Freeze as text*, the reading view; an endless loop is stopped and the expression behind it still computes.
