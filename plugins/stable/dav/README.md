# Calendar (the `dav` plugin)

Your calendars and contacts over CalDAV and CardDAV, from as many servers and accounts as you have, in a calendar pane
inside Atlas: month, week, work week, day, agenda and year views; drag to create, move and resize; repeating events;
any calendar written to; read-only ICS subscriptions; invitations answered from the Email plugin; and tools for
agents. The engine is Rust; the pane is Svelte. The plugin's id is `dav` (tools `dav_*`), its title "Calendar".

## What it adds

- **The Calendar pane** (a left-bar tile, "Calendar: open"): the six views, an all-day lane, the now line, overlapping
  events side by side; drag on the grid to create, drag an event to move it, drag its edge to resize (15-minute steps,
  Esc cancels); a click shows the event's card, `e` the full editor (title, all-day, start / end, repeat, place,
  description, calendar). A repeating event asks "this event / this and following / all events". Every change shows at
  once, is written behind, and has Undo; a refusal rolls back with the server's reason.
- **Keys** after Google Calendar's: `d` `w` `x` `m` `a` `y` (or 1–6) the views, `t` today, `j`/`k` next / previous,
  `g` go to a date, `c` new event, `q` quick add, `e` edit, Delete, `/` search, `r` sync, `s` the side panel, `?` the
  key sheet.
- **Quick add** (`q`): a line in English, Spanish or French ("lunch with Ana tomorrow 13:00"), previewed as you type.
- **The side panel**: a mini month, one heading per account with its calendars (show / hide, colour), the
  subscriptions, and — when switched on — your important notes as a calendar.
- **Moving an event between calendars**, of the same account or another: written there first, then removed here.
- **Times** are your local time, 24-hour by default; time zones (IANA, Windows, VTIMEZONE) and DST are handled.
- **The block `dav.upcoming`** (`days: 7`): today, tomorrow and the rest of the week as a compact agenda.
- **Any calendar view** can show the events: ```` ```view ```` / `type: calendar` / `from: plugin:dav/events`.
- **For the Email plugin**: `import_invite` (file or update an invitation, with your answer), `invite_status` (is it
  in your calendar, does it overlap anything), `contacts` (CardDAV address books), `agenda`.
- **Tools for agents** (`atlas mcp`): `dav_calendars`, `dav_events`, `dav_agenda`, `dav_add_event`,
  `dav_remove_event`, `dav_import_invite`, `dav_invite_status`, `dav_contacts`, `dav_sync`. The plugin never reads
  mail or guesses dates from text: an agent reads them and calls `dav_add_event` with the source.
- **Important notes** (opt-in): a note with `important: true` and `due:` or `event:` (+ `event_end:`) shows as an
  event in the pane and, when "Put important notes on the server" is on, is written to the calendar new events go to.
  Mail notes are never read. Nothing is ever deleted by itself.
- **Instant updates** (WebDAV Push): a calendar server that offers it (RustiCal does) tells an ntfy server of each
  change and the calendar syncs at once.
- **A cache**, `calendar.sqlite` in the plugin's cache folder: only a cache, deleting it loses nothing. Sync uses
  `getctag`, `sync-token` and ETags; subscriptions are fetched again only when changed.

## Settings

- **Accounts** (cards, also under Settings → Accounts, with RustiCal and Nextcloud presets, a state line and Test):
  - **Name**: starts each calendar's id (`home/personal`).
  - **Server address**: `https://cal.example.org/caldav/` (RustiCal), `https://cloud.example.org/remote.php/dav/`
    (Nextcloud); the server's top often works too.
  - **User name**, **App password** (a secret: an app password made on the server, not your sign-in password).
  - **Colour**: for this account's calendars that have none of their own.
  - Under the cards: **Sync now**.
- **New events go to**: a calendar id of any account (offered once an account is saved); empty: the first account's
  first calendar. Invitations and agents' events go here unless they name another.
- **Subscriptions** (cards): **Name**, **Address** (`https://` or `webcal://`), **Colour**, **Fetch every (minutes)**
  (60), and Test.
- *The pane*: **Opens on** (week), **Weeks start on** (locale), **Clock** (24h / 12h), **Day view starts at (hour)**
  (8), **Show important notes** (off).
- *Sync*: **Check the servers every (minutes)** (5, advanced); **Instant updates through ntfy** (an ntfy server; empty:
  the Notifications plugin's server when that plugin runs and its server was set, not left on its default; else only
  the regular check), **ntfy user**,
  **ntfy password**, **ntfy access token**; **Put important notes on the server** (off); **Only notes in these
  folders** (advanced; empty: the whole vault); **Skip dates older than (days)** (30, advanced).
- Kept by the pane, never shown in the form: hidden calendars and calendar colours.

## How it fits

No requirements. Email calls its tools for invitations and contacts; Daily shows the day's events; the core's
calendar view reads `events`.

## Needs

The helper is built by `bash engine/build.sh` into `bin/<arch>-<os>/` (not committed); the pane by
`node scripts/dev/plugin-ui.mjs plugins/stable/dav`.

## Platforms

Linux works; the others are untested.

## Status

Beta, and the closest to stable: `cargo test` covers the engine (recurrence, zones, ICS, editing, the cache) and an
end-to-end spec covers the pane; it still needs a review by someone who did not write it.
