# Malleable Atlas — the design guideline (Ink & Switch)

Two Ink & Switch essays are the guideline Atlas follows. They are:
- [Malleable Software: Restoring user agency in a world of locked-down apps](https://www.inkandswitch.com/essay/malleable-software/)
  (Litt, Horowitz, van Hardenberg, Matthews, 2025);
- [Embark: Dynamic documents for making plans](https://www.inkandswitch.com/embark/) (Sonnentag, Obenauer, Litt, 2023).

Both were read in full, not from summaries. This file distils them into rules that every Atlas feature is checked
against, then maps Atlas onto them. The plan built from it is summarised under "Roadmap" below.

## What the essays say (the parts that bind us)
- **Software as clay, not appliances.** Users adapt their tools at the point of use, with minimal friction ("in the
  moment, so we can get back to the task"). Settings and plugin APIs only allow what developers foresaw; open source
  alone is not low friction; **AI coding alone is not enough** ("a sous chef in a food court"). What is needed is an
  environment where tools are editable in place, composable over shared data, and where AI-made tools gain the
  platform's capabilities.
- **Gentle slope** (MacLean et al., *Buttons*): every step up in tailoring power costs a small step in skill, with
  no cliffs. Examples: spreadsheets (an in-place toolchain, a scrappy look that invites change), HyperCard's
  explicit levels, Stylish/Arc Boosts → macros → user scripts → extensions. Slopes are flattened from **both ends**:
  make programming easier, *and* start from a media editor with optional programmability (Notion, Airtable).
- **Tools, not apps** (avocado slicer vs knife). Two sub-problems:
  - **shared data** (the filesystem is the model: many tools, one file);
  - **composed UI** (compound documents, entanglers, Dynamicland). Embeds need *rich shared context*, not iframes:
    Embark's map reads the outline around it, and hover syncs between the map and the outline.
- **Communal creation**: local developers, situated software, "home-cooked meals". Version control for casual
  exploration; label quality ("as-is" vs maintained).
- **Patchwork's lessons**: needs emerge during real work, and a tool made in minutes mid-task (a section word
  counter) is the payoff. A tool that turns out unused is cheap to ignore and uninstall.
- **Embark**: unbundle an app into **data, computations, views**, hosted in a **dynamic document** (an outline) that
  is the durable record of the thought process:
  - **mentions** (`@` → structured entities);
  - **formulas** over the surrounding context, returning reified, chainable results;
  - **views** over a subtree (map, calendar, table), with properties inherited down the outline.
  Its findings:
  - freedom to annotate anywhere is the graceful fallback;
  - documents capture context, which also powers suggestions (fuzzy search over what is already mentioned feels magical);
  - reifying computations enables composition;
  - outlines balance structure and ambiguity;
  - **suggestions are ephemeral and formulas concrete**, so the document never changes behind the user's back;
  - user agency over automation.

## Rules (R1–R7) — every Atlas change is checked against these
| rule | meaning in Atlas |
|---|---|
| **R1 Gentle slope** | Each customization uses the lightest rung that does it (ladder below). A new feature adds a rung or extends one; it never opens a cliff. |
| **R2 Tools, not apps** | Data (files, frontmatter), computations (formulas, commands, data scripts, Lua) and views (panes, embeds) stay separate and recombinable. **Domain-specific code lives in workspace plugins**, never in core (runs already moved out; lectures follow). |
| **R3 Shared substrate + shared context** | Plain files are the only source of truth. Views and plugins read the current note, section, selection and hover through **one** context API, and hover/selection syncs across them. |
| **R4 Dynamic documents** | Notes host computations and views, not the reverse. Results are reified (visible, copyable, chainable). Formulas are concrete. Suggestions are ephemeral and never rewrite a note by themselves. |
| **R5 Agency, automated** | Automate as much as possible, but a person takes the final decision — ideally without having to ask for the tool at all. Atlas notices needs and **makes** tools on its own, as inert, reversible drafts in files; keeping one is one click; nothing irreversible without a confirm. |
| **R6 In-place toolchain** | Atlas edits its own tools beside the running tool, live, with no rebuild (plugins already reload on save). |
| **R7 Scrappy is fine** | Tools carry `status = "scrappy" \| "kept"`; quality is labelled, not gated. |

## The rung ladder (R1) — what exists, what is planned
| rung | skill needed | Atlas today | planned |
|---|---|---|---|
| 1. Settings | toggle | Settings as pages with features to try and the next rung per page, also embeddable as a `settings` block (docs/guides/SETTINGS.md); `keys.toml` rebinding in Settings → Keyboard and Commands | — |
| 2. CSS snippet | a little CSS | Obsidian-compatible class names in live preview | `.atlas/snippets/*.css`, live, toggled in Settings |
| 3. Properties in a note | YAML | frontmatter, Properties panel, Bases cells editable in place; **`key:: value` section properties inherited downward** (Embark; docs/guides/EXPRESSIONS.md) | — |
| 4. Expression in a note | spreadsheet-level | Bases formulas in `.base` files; **inline `` `= expr` `` in JavaScript**, value shown in place, freezable as text (docs/guides/EXPRESSIONS.md) | expressions in a block's options |
| 4b. A screen arranged by hand | none | `.page` files with an Arrange mode; the sidebar is one (docs/guides/PAGES.md, docs/guides/SHELL.md); workspaces and bookmarks as files | a generated options form per block |
| 5. View in a note | YAML | `![[x.base]]` embeds | ```` ```view ````/```` ```base ```` blocks over the surrounding section; calendar, list, plot, board |
| 6. A `.base` database | YAML | table + board views, + New, hide/add columns | — |
| 7. Command | shell + TOML | `.atlas/commands/*.toml` with origin, args, schedule, Commands pane | drafts made automatically from usage (toolsmith) |
| 8. Script in the space | JS | `.atlas/init.js` user script (JavaScript is the only scripting language) | — |
| 9. Plugin view | JS module | `.atlas/plugins/<id>/view.js` + data script, live reload | PluginApi v2: context, writeProperty, query, registerView, registerEntities |
| 10. Atlas core | Rust/Svelte | this repo | only generic primitives (R2) |
