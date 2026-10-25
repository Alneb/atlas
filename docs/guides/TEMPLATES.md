# Templates — Atlas's own template language

Atlas has its own dynamic templates built in instead of Templater (2026-10-17): a powerful template engine, and templates are never linked and never offered in `[[` suggestions.

A template is a plain Markdown note in the templates folder (`[notes] templates`, default `templates/`). Atlas fills it in when a note is made from it: **New… → *name* note**, "New note from a template…", captures as notes (`[notes] capture_template`), the agent tool `atlas_new_note`, reading notes for papers. The engine is `crates/atlas-template` (shared by the core and the catalog's helper); it reads values and never runs code, so a template from anywhere is safe to use.

The syntax is a superset of Obsidian's core Templates plugin (`{{date}}`, `{{time}}`, `{{title}}`, `{{date:YYYY-MM-DD}}`), so existing templates keep working. Templater's `<% tp.… %>` tags that the user's templates use (`tp.file.title`, `tp.date.now`, `tp.file.creation_date`, `tp.file.cursor()`, `tp.file.move(...)` for the folder) are still understood after the `{{…}}` pass, for old templates; `<%* … %>` scripts are never run and stay visible.

## Tags

| Tag | Gives |
|---|---|
| `{{title}}` | the note's name |
| `{{date}}` `{{time}}` `{{now}}` | now: `YYYY-MM-DD`, `HH:mm`, `YYYY-MM-DD HH:mm` |
| `{{day}}` | the day the note is *about*: a title starting `YYYY-MM-DD` (a daily note made for another day), else today |
| `{{date:dddd D MMMM}}` | any moment.js format (`YYYY YY MMMM MMM MM M DD D dddd ddd WW W ww w HH H hh h mm m ss s A a`, `[literal]`) |
| `{{day-1d}}` `{{date+2w:YYYY-[W]WW}}` `{{now+3h:HH:mm}}` | offsets, chained: `h` hours, `d` days, `w` weeks, `m` months, `y` years |
| `{{author}}` `{{book.year}}` `{{cast.0}}` | a value: a prompt's answer, a field given by the caller (an agent's `fields`, a plugin's), dotted paths into objects and lists |
| `{{prompt:Project}}` | asks "Project…" when the note is made (the app asks each prompt after the name; an agent passes `values`) |
| `{{include:header}}` | another template's body (its frontmatter left out), filled in here; up to 8 deep |
| `{{cursor}}` | where the caret goes when the note opens |
| `"text"`, `42` | literals (useful with `default` and in `#if`) |

## Filters

`{{value | filter | filter:arg}}`, left to right; on a list each filter applies to every item.

| Filter | Does |
|---|---|
| `upper` `lower` `capitalize` `trim` | case and spaces |
| `slug` | `Bath fit v2` → `bath-fit-v2` |
| `link` | `Ada` → `[[Ada]]` (a value already a link stays one) |
| `join` / `join:" · "` | a list → text (default `, `) |
| `first` `last` `count` | from a list |
| `default:text` | when the value is missing or empty |
| `date:D MMM YYYY` | a date value reformatted |
| `replace:from,to` | text replaced |

## Blocks

```
{{#if rating}}★ {{rating}}{{else}}not rated{{/if}}
{{#unless review}}(no review yet){{/unless}}
{{#each cast}}{{@index}}. {{this | link}}
{{else}}no cast{{/each}}
```
Blocks nest. Inside `#each`, `this` is the item, `@index` counts from 1, and an item's own fields are names (`{{#each cast}}{{name}}{{/each}}`). Empty, `0`, `false`, missing → false.

## Rules

- **A tag Atlas cannot fill stays as written** (an unknown name, a typo'd filter, an unclosed block): nothing vanishes silently, the mistake is visible in the note.
- `create_in: <folder>` in a template's frontmatter says where its notes go (taken out of the note).
- **Templates are not notes**: the templates folder is left out of `[[` completion, backlinks, the graph, Bases and tasks (`Config::index_excluded`); a test in `link_targets.rs` holds it.
- `GET /api/note/templates` lists them with their folder, properties and prompts; `POST /api/note/new` takes `values`.

## When a template applies by itself: `apply_when:`

A template can say when it applies, in its own frontmatter (taken out of the notes it makes, like `create_in:`):

```yaml
---
template_title: Lecture
apply_when:
  - folder: lectures              # a new note in lectures/ or under it (a capture made a note too)
  - title: '^Lecture \d+'         # a regex searched in the new note's path, as Templater's file rules
  - file: "lectures/**/*.pdf"     # a file arriving there: its companion note is made from this template
  - property: { type: lecture }   # an existing note whose type is set to lecture: merged in (below)
  - moment: day                   # the day's log (`moment: capture`: a capture made a note)
type: lecture
course:
---
## Summary
```

One condition, or a list of them; the parts of one condition must all fit. Every way Atlas makes a note asks the same
rules (`crates/atlas-core/src/template_rules.rs`): **New…** and a link to a missing note, the phone's **+**, a capture
made a note, the day's log, a file's companion note, an agent's or a plugin's new note. The order they are tried:
templates' own rules (the most specific first: a file pattern or a title over a folder, a deeper folder over a
shallower one), then `[notes] template_rules` (else Templater's), then the older settings as rules
(`capture_template`, `log_template`, the `literature` template for companion notes); the first whose template is there
wins.

**A property set merges the template in.** When a save makes a property a value some template names
(`property: { type: movie }`; a tag added to `tags` counts), and it was not so before, the template is merged into
the note: only what the note lacks is added — a missing property (an empty one filled), the template's list items
after the note's own, a missing section after the one the template puts before it, a missing block (` ```view `…)
at its section's end — and nothing of the note's is changed, moved or removed (`atlas-text` `merge`). In the editor it
is one change of its own (Ctrl+Z undoes it; the notice too); written by anything else (a plugin, an agent, the
phone), the core writes it. A new file, a template itself, and a save that changes no such property bring nothing.

## Which template a new note gets

A note made without naming a template (New → Note, a link followed to a note that does not exist yet) gets one by
rule, first fit wins:

```toml
[notes]
template_rules = [
  { title = '^\d{4}-\d{2}-\d{2} \w{3}\.', template = "99_dailyTemplate" },   # a regex searched in the note's path
  { folder = "labs", template = "lab" },                                         # the folder it goes into, or under
]
```

A vault with no `template_rules` uses its **Templater** rules (`.obsidian/plugins/templater-obsidian/data.json`:
`file_templates` when "enable_file_templates" is on, `folder_templates` when "enable_folder_templates" is on), so a
vault coming from Obsidian keeps choosing its daily, weekly and dream templates the same way in both apps. A rule
with a regex that does not compile, or naming a template that is not there, is skipped — and so is a Templater rule
whose template is built on a script (`<%* … %>`: the Vault's daily template fetches the weather and moves the file),
since Atlas runs no scripts and the note would hold the script's text; the next rule that fits is used. Write an
Atlas version of such a template (`{{weather.…}}`, `create_in:`) and name it in `template_rules`. In Settings → Notes the rules
are one JSON object per line.

### When nothing chose one: the default template

Every note starts with properties. When no
template was asked for and no rule fits, the note is made from the vault's **default template**:

```toml
[notes]
default_template = "00_default"   # the Vault: its Obsidian default (date, type, status, topics, tags, priority…)
```

Unset, a `default.md` in the templates folder is the default (for example: `date`, `type`, `topics`, `project`, `tags`, from
its `templates/properties.yaml`); with neither, the built-in one gives `date: {{now}}`, `type:` and `tags:`. The default
is left out of **New…** and **New note from a template…**: a plain **Note** is already made from it.

### A template's name in the lists: `template_title:`

```yaml
---
template_title: Film
type: movie
---
```

`template_title:` names the template in the lists (**Film** rather than "12 movie note"). Like `create_in:`, it is the
template's own: never copied into the notes made from it. Without one the list shows the file name made readable — a leading `12_` dropped,
`-`/`_` as spaces, capitalised.

## Catalog notes

A catalog kind's `template` (a vault note: the body of every note of that kind) is the same language: `{{director | link}}`,
`{{#if cast}}Cast: {{cast | join}}{{/if}}`, `{{block}}` for the item's block, dates. One difference: a field no source
gave is left out (`Unknown::Empty`) instead of shown as written, since nobody typed that tag by mistake.

## Values from plugins

A plugin tool can provide a value: `template = "weather"` in its `[[tool]]` makes `{{weather.…}}` in any template
its answer, asked just before the note is made, and only when the template (or one it includes) uses that name
(`crates/atlas-core/src/template_values.rs`). This is what Templater did with user scripts (`tp.user.getWeather()`),
without a template ever running code: the plugin is a reviewed, permissioned program; the template stays data.
A provider that fails is logged and its tags stay as written.

The **Weather** plugin (`plugins/beta/weather`, Open-Meteo, no key) is the first: `{{weather.summary}}`
("10 °C, lluvia ligera, 4 °C / 12 °C"), `city`, `region`, `country`, `temperature`, `feels_like`, `condition`, `min`,
`max`, `rain`, `humidity`, `wind`, `sunrise`, `sunset` — the place from its setting, else this machine's address;
descriptions in English or Spanish. A daily template written for Atlas, as the user's Templater one did:

```markdown
---
date: {{now}}
type: "[[Journal]]"
weather: {{weather.summary | default:unavailable}}
---
> [!info] **<—** [[{{day-1d:YYYY-MM-DD ddd}}]] **|** {{day:dddd[,] DD [de] MMMM [de] YYYY}} **|** [[{{day+1d:YYYY-MM-DD ddd}}]] **—>**

El tiempo en {{weather.city}}: {{weather.condition}}, {{weather.temperature}}{{#if weather.rain}}, {{weather.rain}} de lluvia{{/if}}.
```

Day and month names follow the vault's `[editor] date_names` (`spanish`: "sáb.", "octubre"). A note's file keeps a
title's trailing dot ("2026-10-17 sáb." → `2026-10-17 sáb..md`, as Obsidian names the user's days).

### The vault's own values

`{{tasks…}}` is the core's: the vault's open tasks for the note's day (a title starting `YYYY-MM-DD`, else today) —
`tasks.due` (📅 that day), `tasks.overdue` (📅 before it), `tasks.scheduled` (⏳ that day), each `{ title, note, due }`:

```markdown
{{#if tasks.overdue}}## Overdue
{{#each tasks.overdue}}- {{title}} ({{note | link}}, due {{due}})
{{/each}}{{/if}}## Due today
{{#each tasks.due}}- {{title}} ({{note | link}})
{{else}}Nothing due.
{{/each}}
```

## Next

- daily/weekly notes from templates with `{{day±…}}` links to the neighbours;
