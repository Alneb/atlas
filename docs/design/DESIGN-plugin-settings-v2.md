# Plugin settings, v2: sections, accounts, feedback, and settings a plugin draws itself

Settings needed improving, perhaps through a better plugin API (2026-10-23). All four problems below mattered:
1. **Too long and flat.**
2. **Accounts are awkward.**
3. **No feedback.**
4. **Plugins can't do custom UI.**

Earlier (2026-10-21): *"plugin settings are all a bit disappointing"*.

## Built (2026-10-23)

After the user's *"completely underwhelming nothing really changed"*, the parts they picked were built first (docs/refactor/REFACTOR-settings-v2.md):
- **§2, accounts:** a page of their own, above everything else, rather than a better records editor inside each form. Built: status, Test on the unsaved card, presets, one card saved at a time, and the card's own buttons.
- **§4, plugin sections:** `registerSettingsSection` with `place: "before" | "after"`, not `after = "<group>"`. `ctx` is `settings()`, `save(patch)` and `call()`; `set`, `secrets` and `on` were left out until a plugin needs them.
- **§1, in part:** groups as open cards, and `advanced`. Not built yet: the table of contents, and search into plugin fields.
- **§3, in part:** "Saved ✓". Not built yet: validation and live preview.

## What already exists (do not redo)

- **The manifest's form** (PLUGIN-API.md "Settings"):
  - kinds: `text` · `longtext` · `number` · `toggle` · `list` · `choice` · `secret` · `records`;
  - `when` (shown only while another field has a value);
  - `group` (a heading that starts closed);
  - `suggest` (a helper method offers values);
  - `records`, with `actions` per card and `list_actions` under the list.
- **The page per plugin** (`ui/src/components/settings/PluginPage.svelte`, in progress on 2026-10-23):
  - what the plugin is and may do;
  - its switch, Open, Update, plugin.toml, Code, Remove;
  - its problems since start;
  - its form, inline, with a save bar (Revert / Save, Ctrl+S).

  This closes most of "too long" and part of "no feedback". Everything below **builds on that page** and lands after it is committed.

## 1. Too long and flat → sections you can find

- **Sections, not one column.** `group` becomes a real section:
  - a heading;
  - an optional `[[group]]` table with `title`, `hint`, `open` (default: the first group open, the rest closed) and `icon`;
  - the order of first use.

  A page with ≥ 3 groups gets a small table of contents on the left at ≥ 900 px, which scrolls with the page and highlights the section in view.
- **Search across Settings.** A box at the top of Settings matches:
  - field labels, hints and keys;
  - group titles;
  - plugin titles.

  Every plugin's fields are included, not only the open page's. Picking a result opens the page, unfolds the group, scrolls to the field and flashes it once. The data is already in `/api/plugins`, so the search is pure page code.
- **Advanced fields folded:** `advanced = true` on a `[[setting]]` puts it under "Advanced" at the end of its group.

## 2. Accounts are awkward → a records editor that is an account editor

`kind = "records"` keeps its TOML shape (`[[settings.<key>]]` tables, the first one is the main). The editor changes:
- **A card is a row when folded**:
  - name, a status badge and the main star;
  - the summary line: `summary = "{user} · {imap_host}"`, a template over the record's fields;
  - unfolded, it shows its fields.
- **Status from the plugin.** `status = "<helper method>"` on the setting is called with `{ setting, records }` and answers `{ "<card name>": { state: "ok" | "warn" | "error" | "busy", text } }`. For Email: "connected · 2,345 indexed", "the server refused the password", "signing in…". It refreshes when the page opens and after a save; the plugin can push changes with the event `settings:status`.
- **Test, in place.** `test = "<helper method>"` adds a *Test* button to each card. It is called with the unsaved card, so the user can test before saving. The answer `{ ok, text, details? }` is shown under the card, not as a toast.
- **Card verbs:** rename (the plugin hears `settings:renamed`, as Email already does), duplicate, make main, reorder by drag, and remove, which asks first. A secret goes with its card, renamed with it or deleted with it.
- **Adding:** `add_presets = [{ label = "Gmail", values = { imap_host = "imap.gmail.com", … } }, …]` turns *Add* into a menu. Email offers Gmail, Outlook (sign in), "Other IMAP", and "From Thunderbird…" (its `list_actions`).

## 3. No feedback → every change answers

- **Saved, said.** After Save, the bar turns into "Saved ✓" for 2 s. Each field changed by that save gets a dot that fades. A save the plugin refused (its `validate`, see below) keeps the bar and shows why next to the field.
- **Validation in place.** Declarative, on a `[[setting]]`:
  - `required = true`;
  - `pattern = "regex"` with `pattern_hint`;
  - `min` / `max` for a number.

  Or by the plugin: `validate = "<helper method>"` on the plugin, called with the would-be settings before they are written, answering `{ "<key>": "why", "<records key>.<card>.<field>": "why" }`. Save is blocked while any error stands, and the field says it.
- **Actions answer where they were pressed.** `actions`, `list_actions`, Test and suggest put their result (text, a list, an error) under their button. They stop using toasts. A long one shows a spinner and can be cancelled.
- **Live preview** for settings that change what is on screen (Email's layout and density, a theme). `live = true` on a `[[setting]]` sends the unsaved value to the plugin's page as `atlas.plugin.onDraft((values) => …)`. Revert sends the saved values back.

## 4. Plugins can't do custom UI → a section the plugin draws

- **`atlas.registerSettingsSection({ id, title, after?, mount })`** from the plugin's `main.js`, where `mount(host, ctx)` returns a cleanup function. It is drawn on the plugin's page as its own section, among the groups (`after = "<group or field key>"`, default the end). `ctx` offers:
  - `values` (the form's current, unsaved values, live);
  - `set(key, value)` (changes the form: the save bar appears, as if typed);
  - `save()`;
  - `call(method, params)` (the helper);
  - `secrets.has(name)` / `secrets.set(name, value)` (a value is never read back);
  - `on("draft" | "saved", fn)`.

  A plugin keeps its settings in the same TOML through the form, so Settings as text, `plugin.toml` defaults and Claude's view of the settings all stay true. A section can also be a whole page: `page = true` replaces the generated form, for a plugin whose settings are one picture, such as Finance's accounts and banks.
- **Uses waiting for it:**
  - Email: a rules editor and a "what Claude may read" matrix per account;
  - Calendar: the calendars with colour swatches and visibility;
  - Finance: the bank links;
  - Claude usage: a live meter.

## API summary (PLUGIN-API.md gets these, with the version bump)

```toml
[[group]]                      # optional: a section's heading
key = "accounts"
title = "Accounts"
hint = "where mail comes from"
open = true

[[setting]]
key = "accounts"
kind = "records"
group = "accounts"
summary = "{user} · {imap_host}"
status = "account_status"       # helper → { card: { state, text } }
test = "test_account"           # helper → { ok, text, details? }
add_presets = [{ label = "Gmail", values = { imap_host = "imap.gmail.com", smtp_host = "smtp.gmail.com" } }]

[[setting]]
key = "check_every"
kind = "number"
min = 1
max = 120
advanced = true
live = false

[settings_hooks]
validate = "validate_settings"  # helper → { key: why }
```

```js
atlas.registerSettingsSection({ id: "rules", title: "Rules", after: "accounts", mount(host, ctx) { … ; return () => {}; } });
atlas.plugin.onDraft((values) => { … });
```

## Order of work

1. *Wait for the new PluginPage to be committed.*
2. Then build, in this order:
   1. sections and the table of contents;
   2. search;
   3. feedback: saved, validation, actions in place;
   4. the records editor (status, test, presets, card verbs);
   5. plugin sections.
3. Email adopts each piece as it lands: the account editor with Test and status, the rules section, and live layout.

Every step gets e2e cases in `ui/tests/plugin-settings*.spec.ts`, screenshots in both themes, and PLUGIN-API.md and DEVELOPING.md entries in the same commit.
