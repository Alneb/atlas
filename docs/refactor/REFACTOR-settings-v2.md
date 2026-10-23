# Settings v2: an Accounts page, a new look, sections plugins draw

_Design: [DESIGN-plugin-settings-v2.md](../design/DESIGN-plugin-settings-v2.md)._

## Why

A first rework (a page per plugin) changed too little: the settings still looked plain, and remote servers were handled poorly, with only one allowed. A real change meant three things:
- **a new layout and look**;
- **accounts as real objects**;
- **plugins draw their own pages**.

They did not pick "fewer settings".

## Before

- **Sidebar:** a list of grey text rows, with core areas and plugins mixed under one look, and a plugin always shown with the same plug icon.
- **A plugin's page** (the first rework): a header, then one long form.
  - Every field was stacked with its label above it.
  - Groups were `<details>` that started closed, showing only a peek of their field names.
- **Accounts** were a records field inside that form:
  - every card was open at once, with all its fields;
  - the form's single Save saved every card and every other setting together;
  - nothing said whether an account worked;
  - "Test" was a plugin command that ran only after a save, and answered in a toast.
- **Plugins** could not put anything of their own in Settings. Email's rules were a modal inside the Email pane.

## After

**The sidebar**
- **Accounts** comes first, with a badge for how many accounts there are, or a red dot when one fails.
- Then **Atlas**, the core areas.
- Then **Plugins**, each with its own icon on a tinted tile, and a red dot when the plugin has a problem.
- Every entry has an icon tile, in the style of macOS System Settings.

**Settings → Accounts** (`AccountsPage.svelte`, `lib/accounts.svelte.ts`)
- **Where they come from:** every records field marked `account = {…}`, from every plugin, grouped by kind (Mail, Calendar…) with a link to the plugin's page.
- **A row:** an avatar coloured from the name, the name, the summary line (`{user} · {imap_host}`), the plugin's status pill, and a chevron.
- **A click opens it in place** with:
  - its fields, label beside control;
  - **Test**, the plugin's `test` method run on the card as typed, with the answer shown under it;
  - the plugin's own buttons (Sign in to Outlook), which save the card first;
  - Make main, Remove (asks first), Cancel and **Save**.
- **One card is saved at a time.** `saveCards` writes that records field with the card changed or added, and every other setting stays as it is.
- **Add account** opens a menu of each plugin's presets (Gmail, Outlook / Microsoft 365, iCloud, Fastmail), then "Other…".
- **The core's sign-ins** (Authelia doors, SigninsPanel) are listed under the accounts.

**A plugin's page** (`PluginPage.svelte`)
- **The header:** an icon tile, the title and its switch.
- **Accounts:** the same list as on the Accounts page, filtered to this plugin, above the form. The form leaves the account field out, so the two saves never overlap.
- **The form** (`FormFields sections`): fields as rows, the label and hint at the left and the control at the right.
  - Each `group` is a titled card that is open.
  - `advanced = true` fields fold into a closed "Advanced" group at the end.
  - `hidden = true` fields are never shown.
- **After a save,** "Saved ✓" shows for two seconds.
- **Sections the plugin draws** (`registerSettingsSection`) go before or after the form.

**The manifest** (`plugin_settings.rs`)
- **`AccountSpec`** `{ kind, summary?, status?, test?, presets }` on records fields.
- **`advanced` and `hidden`** on every field.
- The keys are checked as before (`deny_unknown_fields`, and `account` only on records).
- **Plugin API 12.** The TS types are generated (`AccountSpec.ts`, `AccountPreset.ts`).

**Email adopts it**
- **Account methods:** `account_status`, which reports connected · N unread, checking, the server's refusal, or folders failed. `test_account` signs in to IMAP with the card as typed: a typed password, else the kept one.
- **Presets:** four.
- **Its settings in groups:** Reading, Triage, Sync and Saved notes. "Messages read ahead" and "Message cache" fold into Advanced.
- **The rules** are a section of its page: `Rules.svelte` with `inline`, and a small stand-in for the pane's store (`rules-host.ts`).

## Also in this change

- **Outlook's sign-in opened twice.**
  - **First cause:** Email's `main.ts` added a `window` listener on every load of the plugin, and never removed the previous one. A reloaded plugin (a settings save reloads it) answered the Sidebar's "Sign in…" once per load.
  - **Second cause:** "Open the Microsoft page again" used `window.open`. The desktop app sends that to a sign-in window of Atlas, while the engine had already opened the user's browser.
  - **The fixes:**
    - one listener, replaced on reload;
    - one sign-in at a time;
    - "open again" goes through the engine's `signin_reopen`, which opens the user's browser and only for a Microsoft address.
- **Every web page is a tab.** The user: *"the websites in the app i want them all to open inside"*. Clicked links were already Web tabs, but a `window.open` (a plugin, a mail frame, a PDF) and a navigation that would have replaced the app went to a separate browsing window. `web_link` (`crates/atlas-app/src/main.rs`) now asks the page to open a Web tab (`window.__atlasOpenWeb`) when `[web] open_links = "tab"`, the default. "window" and "browser" behave as before. Sign-in pages keep their own route.

## Checked

- `cargo test -p atlas-core --lib plugin_settings`: 16 passed (the TS types regenerated).
- `cargo test --release` in the Email engine: 73 passed.
- `svelte-check` on the app and on Email's UI: 0 errors, 0 warnings.
- **WebKit, on the probe copy of a vault (`target/probe-mail`, the real Gmail account):**
  - screenshots of the Accounts page, an account opened, the Add menu, Email's page top and bottom (rules), both themes, and 480 px;
  - **Test** answered "signed in to imap.gmail.com";
  - **Save** wrote only `from` into `email.toml`, every other setting kept (the file was restored afterwards);
  - **the Gmail preset** filled in `imap.gmail.com`.

## What to watch

- **The status helper is asked with the plugin's settings,** and the core adds its secrets (`with_secrets`). An engine that keeps state per call (Email's `remember`) sees the same settings as its pane.
- **A plugin whose records field has `account`** should not also edit that field in its own pane without reloading: the Accounts list reads `plugin.settings` after each save (`loadPlugins`).
- **`api = 12`** in a manifest that uses `account`, `advanced` or `hidden`. An older Atlas refuses the unknown keys, so the version says why.
- **Not built yet from the design:** search into plugin fields; declarative validation (`required`, `pattern`, `min` / `max`); live preview (`live`, `onDraft`). Calendar's account methods come with its accounts change, built alongside.

