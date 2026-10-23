# REFACTOR — the Calendar's accounts (Calendar 1.1)

The Calendar plugin (id `dav`, `plugins/beta/dav`) as first written (1.0, [REFACTOR-calendar.md](REFACTOR-calendar.md)) was reworked soon after, before it was in use anywhere, after a review:

> *"the calendar is not well integrated into the other plugins, like in general remote servers you handle them very poorly bc you only allow one, the settings are really ugly, and then you can only write to a single calendar in the remote dav, and this plugin actively looks for tasks in mail instead of mail talking with the dav through an api and claude the mcp"*

Five complaints, five changes:

| Complaint | 1.0 | 1.1 |
|---|---|---|
| one remote server only | flat settings `url`, `user`, secret `password`, `calendar` | a records setting `accounts` (cards: name, server address, user, app password, colour); every account synced |
| writes to a single calendar | the setting `calendar` was where every new event went; the editor offered that account's calendars only | the editor, the new-event card and quick add offer every writable calendar of every account, grouped by account, remembering the last one; *New events go to* chooses among all; moving an event between accounts works |
| the plugin looks for things in mail | `[[tool]] sync` (`on = "fs"`) scanned the vault's `mail` folder by default for `.ics` files and important mail notes | no mail and no `.ics` is ever read; invitations arrive only through Email's call (`import_invite`); important *notes* are opt-in and skip mail notes |
| Claude / the MCP | tools spoke of "the" calendar; `calendars` discovered one server live | `dav_calendars` lists every account's calendars with ids; `add_event`, `events`, `remove_event`, `import_invite` take a calendar id |
| ugly settings | one long ungrouped form, raw lists the pane writes shown first among the pane's fields | Accounts first, then *The pane*, *Sync*, and *Advanced* (closed) for what the pane writes; short labels, plain hints; `account_status` / `test_account` for the Settings page being redesigned |

## Before → after, by part

### Settings (`plugin.toml`, `.atlas/plugin-settings/dav.toml`)

Before:

```toml
url = "https://cal.example.org/caldav/"
user = "alice"
calendar = "Personal"            # name or address
auto_sync = true                 # default true
folders = ["mail"]               # default
# secret: password
```

After:

```toml
calendar = "example/personal"     # "New events go to": a calendar id of any account
push_notes = false               # "Put important notes on the server" (opt-in)
show_notes = false               # "Show important notes" in the pane (opt-in)
folders = []                     # empty: the whole vault (mail notes are skipped anyway)

[[accounts]]
name = "example"
url = "https://cal.example.org/caldav/"
user = "alice"
color = "#7c5cff"                # optional: for this account's calendars without a colour
# secret: accounts.example.password

[[accounts]]
name = "uni"
url = "https://cloud.example.org/remote.php/dav/"
user = "a.r"
```

Order in the form: **Accounts** (cards with *Test*; *Sync now* under them), **New events go to** (`suggest = "suggest_calendars"`: `account · Name` for every writable calendar), **Subscriptions**; group **The pane** (opens on, weeks start, clock, day view start, show important notes); group **Sync** (put important notes on the server). With the Settings v2 core (plugin API 12, `docs/guides/PLUGIN-API.md` "Accounts, folded fields and sections you draw") the manifest also says: `account = { kind = "Calendar", summary = "{user} · {url}", status = "account_status", test = "test_account", presets = [RustiCal, Nextcloud] }` on `accounts` (Settings → Accounts lists the cards, each with its state and Test); `advanced = true` on the tuning fields (check every, only notes in these folders, skip older than); `hidden = true` on what the pane writes (`hidden`, `colors`) — never in the form. A section drawn by the plugin (`registerSettingsSection`, `CalendarsSection.svelte`, before the form) lists every account's calendars and the subscriptions with a visibility box and colour swatches, writing `hidden` / `colors` through `ctx.save`.

`auto_sync` (1.0) is not read any more: a file that still has it keeps it, unused. The new key has a new name (`push_notes`) on purpose — an old file's explicit `auto_sync = true` must not switch the new opt-in on behind the user's back.

### Migration from 1.0 (`conf::legacy_card`, `api::migrate`, `main.ts`)

- While the settings have flat `url` + `user` and no `accounts`, the engine reads them as **one card named after the server** (`cal.example.org` → `example`; the TLD and words such as `cal`, `dav`, `caldav`, `www`, `cloud` are skipped; an IP address gives `calendar`), its password the card's secret if set, else 1.0's `password`. So nothing stops working before the move.
- The page (`main.ts`, at load, not awaited) calls the helper's `migrate`: the helper copies the secret `password` to `accounts.<name>.password` over its pipe (`Atlas::set_secret`; the old secret is left where it was), and answers the values to save: `accounts: [card]`, `url: null`, `user: null`. The page saves them (`atlas.plugin.saveSettings`, which takes undeclared keys out with `null`) and says so in a toast.
- `calendar` keeps its key: a 1.0 value (a name or an address) still resolves (`find_source`).
- No vault had the plugin set up yet when this landed, so nothing was moved anywhere; the path is covered by `tests/server.rs`, which runs the helper with 1.0's flat settings.

### Calendar ids (`store::calendar_id`, store schema 2)

1.0's source id was the calendar's address. Two accounts could in principle share an address (two users of one server see the same shared calendar), and an address is useless to type or to read in a tool's answer. 1.1: **`<account>/<last path segment>`** (`example/personal`), the whole path when two calendars of an account end the same; subscriptions stay `sub:<name>`. `Source` gained `account: Option<String>`; the SQLite cache's schema went to 2, so a 1.0 cache is dropped and synced again (it is only a cache).

`find_source` resolves what a call or a setting names: an id; an address (with or without its `/`); `account/Name`; a name (or last path part) only one calendar has. Two calendars of the same name across accounts is an error that lists both ids — never a silent pick.

### Pulling (`api::pull_all`, `pull::caldav`)

Per account, in Settings' order: each has its own "last tried" clock and is pulled when `refresh` minutes passed (or forced); `pull::caldav(store, client, account)` touches only that account's sources (the "gone from the server" sweep is per account, by id). A refused password or an unreachable host fails **that account only**: its cache stays, its error is kept for `account_status`, the side panel's heading shows a red `!` with the reason, `refresh` answers `"<account>: <why>"`. An account taken out of Settings has its calendars forgotten at the next pull. Contacts are read from every account's address books.

### Writing (`api::target`, `api::client_for`)

Every write goes through the client of the calendar's own account: `client_for(source id)` finds the source, its `account`, the card and its password. `target` picks the calendar for a new event: the call's `calendar`, else *New events go to*, else the first writable calendar of the first account (a read-only default is passed over). When the cache has no CalDAV calendar yet it pulls first.

Moving (`update` with `move_to`) may cross accounts: the event is written in the destination with that account's client, then removed from the source with the source's; when the removal fails, the new copy is erased again, so there are never two. Undo steps keep the source id and get their client at undo time, so undoing a cross-account move works (checked against RustiCal).

`remove_event` without a calendar finds the calendar the UID is in (from the cache); `import_invite` updates the copy already in any account's calendar with that account's client, else files it in `calendar` or the default.

### Mail is not read (`sync.rs`)

Removed: `Found::Invite`, `ics_files` (links and `<note> files/` folders), `.ics` in the walk and in changed paths. `dated_events` returns nothing for a note with a `message_id` or `type: email`. So the only ways a mail's date reaches the calendar are Email's call when the user answers an invitation (`POST /api/plugins/dav/tools/import_invite`, already there in 1.0) and Claude reading the mail and calling `dav_add_event` with the Message-ID as `source`. `push_notes` off → the `on = "fs"` hook answers `skipped` at once (no file read).

Left as it was, outside this plugin: Email's `save_important` hint still says "the Calendar plugin finds its invitations there" (`plugins/beta/email/plugin.toml`) — it is not true any more and belongs to Email's next change.

### The pane (`ui/src`)

- `CalendarPicker.svelte` (new): a select with an `<optgroup>` per account (plain options when there is one account) and the chosen calendar's colour square; used by the editor, the new-event card (a click or drag on the grid) and the quick-add bar.
- `store.svelte.ts`: `accounts`, `byAccount(writable?)`, `newCalendar()` (last used on this device while writable → the default → the first writable), `remember(id)` (localStorage `atlas-calendar-last`), `hidden` / `colors` written by id (1.0's names still match).
- `Sidebar.svelte`: one heading per account (its error as a `!`), then Subscriptions; *Important notes* only when switched on.
- `main.ts`: the cards' *Test* (`test-account` → `test_account`), *Sync now* under the cards (`sync-now`), "Calendar: test the accounts", the migration, a renamed card's ids rewritten.

### For the new Settings page (`account_status`, `test_account`)

Settings is being redesigned (`docs/design/DESIGN-plugin-settings-v2.md`: account cards with a status line and Test). The engine already answers:

- `account_status` → `{ "<card name>": { "state": "ok" | "warn" | "error" | "busy", "text": "3 calendars · synced 2 min ago" } }` — warn when the address or login is missing, "no app password yet", "not synced yet"; error with the server's reason ("app password rejected: …", "cannot reach host: …"); busy while its pull runs. The state is a Rust enum (`State`), so a fifth word cannot slip in.
- `test_account { record }` → `{ ok, text }` — for a card not saved yet: the typed `password` if the record has one, else the kept secret; it discovers and lists the calendars that take events.

## What to watch

- **Renaming an account card** changes its calendars' ids (`old/personal` → `new/personal`). The core moves the card's secret and tells the plugin (`settings:renamed`); `main.ts` then rewrites the ids with the old prefix in *New events go to*, `hidden` and `colors`, and the next pull forgets the old name's cache and reads the new one. The device's "last used" calendar (localStorage) is not rewritten: the picker falls back to the default once.
- **Two calendars named alike across accounts**: tools must pass ids (the error says so). The quick-add text has no calendar syntax; the picker beside it chooses.
- **A shared calendar seen by two accounts** (same address) is two sources with two ids; an event in it shows twice. Rare; not deduplicated.
- **Tool secrets**: every tool now takes `secrets = ["*"]` (all the plugin's secrets: each account's password). That is what Email's own tools do.
- **Email's call** posts to `/api/plugins/dav/tools/<name>`, which hands the tool its secrets from the core; a page's helper call is given the plugin's secrets the same way (`plugin_helper_post` → `with_secrets`), so the engine rarely needs the pipe for them.

## Checked

- `cd plugins/beta/dav/engine && nice cargo test` — 48 unit tests; `tests/calendar.rs` with **two RustiCal principals** (`alice`, `bob` in the `atlas-cal-test` container on 127.0.0.1:48099); `tests/server.rs` with 1.0's flat settings.
- `node scripts/dev/plugin-ui.mjs --check plugins/beta/dav` — svelte-check 0 errors / 0 warnings, the committed build current.
- `ui/tests/example-calendar-pane.spec.ts` — the earlier pane checks plus two account cards without passwords: each its own heading with why it does not sync, `account_status` saying "no app password yet".
- The core's `every_shipped_plugin_manifest_parses` with the new manifest.

