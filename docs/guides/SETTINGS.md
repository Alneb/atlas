# Settings — pages, features, and the next rung

Rebuilt 2026-10-08. Before it, Settings was one long scrolling form generated from the config
schema with a filter on top. Settings badly needed improving.
What hurt most:
- **Not enough control**, in all four of: look, keybindings, pane and feature behaviour, plugins and automation.
- Settings were opened mostly to **understand what is possible**.

They chose:
- a **sidebar + pages** layout;
- Settings **doubling as the "what can Atlas do" map**: each page shows its area's features, their shortcuts and
  a Try button.

Asked how it should fit the dynamic-documents rework, they said *"you should know how to do it yourself"*, so it
follows docs/design/MALLEABLE.md:
- a page is also a **block** (R4, everything is a document);
- every page ends with the **next rung** up the ladder (R1, gentle slope);
- the toolsmith's drafts appear there and on Home (R5).

## Shape
```
Settings pane (panes/Settings.svelte)
├── sidebar: search box, one button per page (with "N changed" badges), "Edit the file"
└── main: the current page, or search results across all pages
     SettingsPage (components/settings/SettingsPage.svelte)
     ├── header: title + one-line blurb
     ├── features: action chips (title, shortcut, Try)         ← PAGES[].features (action ids)
     ├── panels: overview cards, preview, CSS snippets, keys,  ← PAGES[].panels
     │           plugins, workspace commands, toolsmith drafts
     ├── options: one SettingField per config leaf             ← placed by placeFields()
     └── go further: the next rung (snippet, Home.page, plugin, command, view block)
```

### Where the options come from (no hand-written forms)
- The config schema is still the source. `lib/settings-schema.ts` walks it into leaves (`editor.code_font`, `vim`…).
- `lib/settings-pages.ts` (`PAGES`) **only places** them: explicit dotted paths, or `section.*` for the rest of a section.
- **Shape over lists:** a leaf no page claims lands on its section's own page, generated from the section key, or on
  "General" for top-level keys. So a new `[foo]` config section shows up as a "Foo" page with no UI work, and a new
  field in an existing section joins that section's page.
- `HIDDEN` lists leaves edited by a custom panel (`ui.css_snippets_off` → the snippets panel, `plugins.off` → the
  plugins panel).
- Page icons are typed `IconName`, so a wrong icon is a type error.

### Controls by shape (SettingField)
| field shape | control |
|---|---|
| boolean | switch |
| enum of ≤ 4 | segmented buttons (radios) |
| enum of more | the themed Select |
| number with min/max | slider + number box (slider saves at most every 150 ms) |
| array of strings | textarea, one per line |
| string named `*accent` / `*colour` | colour picker + hex box + clear |
| string named `*dir` / `*folder` / `log_dir` / `lectures` | text + datalist of workspace folders |
| string named `*file` / `home` / `focus` / `*bib` / `*path` | text + datalist of workspace files |
| string with detected choices (`/api/config/suggestions`) | Select: Default (when "" is allowed), the current value even if undetected, detected values, "Type a value…" |

Every row whose value differs from the default gets an accent bar and a **"modified · reset to X"** button.
Defaults come from `GET /api/config` → `defaults` (`Config::default()`), so they cannot drift from the Rust code.
Labels come from keys with acronyms fixed (`vscode_theme` → "VS Code theme") plus a few overrides (`ui_font` →
"Interface font").

### Search
Words must all appear in the label, dotted path, description, section description or page title. Results are
grouped by page, include matching **features** (with Try), and the box is focused when the pane opens, so
`Ctrl+,` then typing works as in VS Code.

## Pages
| page | options | features | panels | go further |
|---|---|---|---|---|
| Overview | — | palette, open file, capture, commands | cards per area: features with shortcuts, "N changed" | — |
| Appearance | theme, accent, VS Code theme, text size, interface font, motion, e-ink screen and its full refresh, tabs, side panel, restore layout, tab preview, Ctrl+Tab, prose font/size/line height/width, code font/size, inline title | toggle theme, zoom, side panel, fullscreen, reset layout | live preview, CSS snippets | write a CSS snippet |
| Writing | vim, format bar, math and link preview, task chips/suggestions/short forms, properties and their spec, completions, slash menu, folding, typewriter, **live editing between devices**, backlinks, LaTeX snippets, attachments, date names, strict line breaks, notes.* (capture, inbox, fleeting note template, templates folder, templates by name or folder, **default template**) | vim, New…, new note, cycle a line, properties panel / inline, kit, outline, graph | — | put a live view in a note (copies a ```` ```view ```` example) |
| Home & Today | home, focus, **daily log folder**, **daily log template**, activity.* | home, capture, edit FOCUS.md | — | reshape the home screen (opens Home.page) |
| Code | autosave, tool bar, git gutter, line numbers, wrap, guides, minimap, breadcrumbs, lsp.* | problems, git, replace | — | — |
| Files & search | ignore, index exclude, files.* | files, explorer, open file, search, history, open with, switch vault | open with | — |
| Web | web.* (open links in **a tab**, a window or the browser; block ads; filter lists) | open web page | — | — |
| Server | — (kept outside the vault: `~/.config/atlas/server.toml`) | — | this Atlas serving or not; sign-in (password / proxy / both), trusted proxies, plain HTTP, AI agents; the password; device tokens (made, shown once, revoked); signed-in browsers, sign out everywhere (docs/guides/SERVER.md) | — |
| References & PDF | pdf.* (the references' own settings are the Catalog · Science plugin's) | References | — | — |
| Drawing | draw.* (folder, Rnote commands, notepad, **a new drawing's pages**) | new drawing, export as SVG | — | — |
| Terminal & agents | terminal.* | terminal, panel, Claude, send to Claude, move panel, new shell | — | — |
| Keyboard | — | — | every command grouped (Atlas / plugins / workspace / server), filter, "only with a shortcut", rebind in place | turn a shell line into a command |
| Plugins & automation | automation.*, sign-in provider / client id / return address | commands | toolsmith drafts (Keep / Dismiss), plugins (on/off, open, edit settings and view), sign-ins, workspace commands (schedule, origin, shortcut) | write a plugin; make a block |
| AI agents | — | — | agents allowed through `atlas mcp`, each with its own token | — |
| Advanced | gpu rendering | — | — | — |

## New config (all optional, defaults unchanged)
- `[ui] accent = "#rrggbb"`: derives `--accent`, `--accent-strong`, `--accent-soft`, `--accent-sel`, `--link`,
  `--tag-*` with `color-mix`. Clearing it removes **only** Atlas's own override and re-applies a VS Code theme's
  accent if one is set, since both write the same variables.
- `[ui] ui_font`: sets `--font-ui`; fonts are detected like the prose font.
- `[editor] prose_line_height` (1.2–2.2, default 1.68): sets `--prose-line-height` in the live preview.
- `[plugins] off = ["id"]`: a switched-off plugin is still listed in Settings, but gets no command, rail button or
  pane (`pluginOn()` in `plugins.svelte.ts`; the pane says it is switched off).

## Blocks: Settings and drafts where you work
`lib/views.ts` registers two more own-data view types, lazily imported (they pull in actions, so a static import
would cycle):
- `settings` (`page: appearance`): `{ view: settings, page: terminal }` in a `.page`, or a ```` ```view ```` block
  with `type: settings`, draws that page inline. "Go further" is hidden there.
- `suggestions`: the toolsmith's drafts (`components/ToolDrafts.svelte`, also on the automation page). The Home.page
  **template** now ends its second column with `{ view: suggestions, title: Drafted for you }`. Existing home files
  are the user's and are not edited.

## Shared pieces extracted
- `components/ShortcutButton.svelte`: click, press keys, clash handling, reset to the default. Used by the Commands
  pane and the Keyboard page (it used to be inline in Commands.svelte).
- `components/ToolDrafts.svelte` + `api.toolDrafts / keepTool / dismissTool`: the toolsmith's first UI (Phase 5).
- `lib/settings-actions.ts`: next-rung makers: `newSnippet`, `newPlugin` (plugin.toml + a view.js that follows the
  shared context), `editHome`, `copyViewExample`.

## Tests
- `ui/tests/settings.spec.ts` (6):
  - the overview opens a page, and every page draws;
  - search spans pages and descriptions;
  - accent applies live and resets;
  - the keyboard page rebinds;
  - a settings block works in a `.page`;
  - a plugin switched off loses its rail button and comes back.
- `smoke.spec.ts`: rewritten for pages, segmented radios and reset. It now waits for the app before `Ctrl+,`; that
  was the "intermittent Settings smoke test": the key was pressed before the keymap was attached.
- `ux/coverage.spec.ts` "Every setting": walks every page for undocumented rows, then flips each switch through search.
- `commands.spec.ts`: "New command" is matched exactly, because the shortcut button's label names the commands pane.
- `draw.spec.ts`: the vault-drawing test is skipped unless its converted fixtures exist (a past session's scratchpad).
- Gates at commit: cargo 235 passed, clippy clean, svelte-check 0/0, Playwright 92 passed and 1 skipped.

## Watch out for
- Fields are placed by dotted path. Renaming a config field silently moves it to its section's page (it never
  disappears), so check `PAGES` when renaming.
- A Settings page as a block shares the config with the pane: editing in either saves to the same file at once.
- Suggestions (fonts, Claude installs) load lazily and slowly (font scan). Until they arrive, those fields are text
  boxes with a "default" placeholder.


## The Settings pass of 2026-10-19
After a day of features, Settings had fallen behind: many new things were not in it. An audit listed what was missing; this pass:
- **Labels by path.** `fieldLabel(path)` in `settings-pages.ts` looks up `FIELD_LABELS` by the dotted path first,
  then falls back to `human(key)`. Keys alone collided (`notes.dir` and `draw.dir` were both "Folder") or read badly
  ("Log dir", "Eink refresh", "Oidc issuer", "C", "Show claude"). Search uses the same label.
- **Placed:** `editor.live` (live editing between devices) sat alone on an automatic "Editor" page; it is on Writing.
- **New options, each doing something:**
  - `log_template`: the template a new day's log starts from (`notes::daily_log_start`). Empty: the date and
    `type: log` as properties and the day as a heading, now in the vault's date names (Spanish when
    `editor.date_names` says so; it was always English). A named template that is missing falls back, so a capture
    never fails over it.
  - `web.open_links = "tab"` (the new default): what links already did since 2026-10-19 — a tab of Atlas when the
    site allows framing, else a browsing window — but now a choice. `window` and `browser` skip the tab
    (`web-links.ts`); the app treats `tab` as `window` for what it opens (`main.rs`).
  - `draw.page_format`: `ask` (default) or one of the formats of "New drawing" (A4, A4 landscape, A5, Letter, Boox,
    an endless canvas, a canvas with a corner); set, the question is skipped.
- **Blurbs and commands** brought up to date: zen split and fullscreen (Appearance); default template,
  `template_title`, live editing, Ctrl+Q (Writing); the daily log in `notes/log`, its template, the Weather plugin
  (Home & Today); the explorer's other vaults, SSH hosts and servers, history, switch vault (Files); links as tabs
  (Web); notepad, page formats, live drawing, export as SVG (Drawing).
- **Stale text fixed:** the built-in "Scientific tools" is "References" and no longer claims `@` completion or the
  Zotero connector (both the Catalog · Papers plugin's); `refs.*` gone from the table above (the section was removed
  in 68524e6); `pdf.export_on_save` no longer names `<citekey>.md`; `clip.rs` no longer mentions the Clip plugin.
- **Not done, on purpose:** a device name for live editing (config is per vault and shared between devices, so a
  name there would be every device's); a Vaults page (it comes with "core serves all"); a kinds editor for
  the catalog (it comes with the library page, docs/refactor/REFACTOR-libraries.md).
