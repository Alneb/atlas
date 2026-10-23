# The Calendar plugin — a design study

The user (2026-10-23): *"this plugin [email] should integrate with the dav plugin we just made and a calendar view inside the app that is powerfull please, or a plugin i dunno"* · *"also we should just be able to subscribe to open ical calendars"* · *"in the UI please say the time in local hour pls"*. Asked where the calendar should live, the user chose to **grow the DAV plugin into a Calendar plugin** (plugin id stays `dav`): a full pane in Svelte like Email's, ICS subscriptions, invitations answered from Email, contacts (CardDAV) for Email's address book. The core's `type: calendar` view block keeps working beside it.

This file is what the best calendar apps do well, and what Atlas takes from each. The model is [DESIGN-mail-ui.md](DESIGN-mail-ui.md).

## 1. What the reference apps do best

| App | What it does best | Taken |
|---|---|---|
| **Google Calendar** ([keyboard shortcuts](https://support.google.com/calendar/answer/37034)) | Single-letter keys for everything: `d w m a` (day, week, month, schedule), `t` today, `j/k` or `n/p` next/previous, `c` create, `e` details, `/` search, `?` the key sheet, Delete / Backspace delete; drag on the grid to create, drag an event to move, drag its bottom edge to resize, 15-minute snap; a small popover on click, the full editor on `e` or "More options"; the now-line in red; the mini month in the side panel. | The whole key set, the popover → editor step, drag create / move / resize with a 15-min snap, the now-line, the mini month. |
| **Apple Calendar** ([user guide](https://support.apple.com/guide/calendar/welcome/mac)) | A **year view** that is a heat map of busy days; calendars grouped by account in the side list with a colour dot each, toggled with one click; **subscriptions** (webcal://) as first-class read-only calendars with a refresh interval; the all-day lane at the top of the week. | The year overview, the colour-dot list with toggles, `webcal://` subscriptions with a refresh interval, the all-day lane. |
| **Fantastical** ([natural language](https://flexibits.com/fantastical/help/natural-language)) | **Quick add in plain words** with a live preview of what it understood ("lunch with Ana tomorrow at 1pm" → a dated, timed event), several languages, repeats ("every Monday"), places ("at the café"). | Quick add parsed by the engine, previewed as you type, in English, Spanish and French; repeats ("every monday", "cada lunes", "chaque lundi"); `@ place`. |
| **Outlook** ([calendar shortcuts](https://support.microsoft.com/en-us/office/keyboard-shortcuts-for-outlook-3cdeb221-7ae5-4c1a-8c96-1b2f8ba2a4c5)) | **Work week** (Mon–Fri) as a view of its own; invitations answered from the mail (Accept / Tentative / Decline) with **the conflicts shown under the invite**; the attendee list in the event. | The work-week view; `invite_status` answers "conflicts with …" for Email's reader; `import_invite` files the answer; attendees shown (read-only). |
| **Notion Calendar (Cron)** ([shortcuts](https://www.notion.com/help/notion-calendar-keyboard-shortcuts)) | Speed: the command palette (Ctrl+K) for every action, everything optimistic, Undo after every change, the time zone always explicit. | Ctrl+K palette over every command (one list, as Email's `keys.ts`), optimistic edits with an Undo toast, times always in the user's local zone. |
| **Thunderbird** ([calendar](https://support.mozilla.org/en-US/kb/using-lightning-calendar)) | Honest offline behaviour: a local cache of CalDAV calendars, synced behind, shown at once; per-calendar read-only state; ICS files as calendars. | The local cache (SQLite) synced behind with ctag / sync-token / ETags; read-only calendars refuse drags with a reason; subscriptions are read-only. |

## 2. What Atlas's calendar is

- **One pane** (`view.js`, a rail button): a toolbar (today, ←/→, the range's title, the view switch, search, quick add), a sidebar (mini month, the calendar list with colour dots and toggles, subscriptions), and the view: **month, week, work week, day, agenda, year**.
- **The time grid** (week / work week / day): an all-day lane on top, hours down the side in the user's locale (24 h or 12 h by locale or the setting), the now-line, overlapping events laid out side by side (the classic column-packing: clusters of overlapping events share the width, each in the first free column), drag on empty space to create, drag an event to move (also across days), drag its bottom edge to resize, 15-minute snap; Escape cancels a drag.
- **Month**: six weeks, up to N events per day then "+k more" (opens the day), all-day and multi-day events as bars, a click on a day number opens that day.
- **Agenda**: the next 60 days as a list grouped by day — the only view at phone width beside the day view.
- **Year**: twelve mini months, each day shaded by how busy it is; a click opens that day.
- **The popover → the editor**: a click on an event shows a small card (title, when in local time, where, calendar, the note it came from, attendees) with Edit, Delete, Open note; `e` or Edit opens the full editor (title, all-day, start / end, repeat, location, description, calendar; attendees read-only).
- **Recurring events** ask "this event / this and following / all events" on every change, as Google does.
- **Optimistic**: a move, resize, create or delete shows at once; the engine writes behind (PUT with If-Match) and the toast says *Moved · Undo*; on failure the view rolls back and says why.
- **Times are the user's local time on the 24-hour clock**, always: the engine expands every event in the zone the pane gives it (`Intl…timeZone`), floating times stay at their wall-clock hour, all-day events are dates.
- **The vault overlay**: notes marked `important: true` with `due:` / `event:` (the property convention of the DAV plugin) are a calendar of their own, "Notes", deduplicated against the copies already pushed to the server (same UID); an event that came from a note opens that note.

## 3. The engine (Rust)

- **Cache**: SQLite in `$ATLAS_PLUGIN_CACHE/calendar.sqlite` — sources (CalDAV calendars, subscriptions), calendar objects (the raw iCalendar text, its ETag, a time bound for range queries), contacts. Only a cache: deleting it loses nothing.
- **Sync**: CalDAV by `getctag` (nothing changed → one PROPFIND), then `sync-collection` (RFC 6578) when the server gives a `sync-token`, else an ETag listing; changed objects fetched with `calendar-multiget`. Subscriptions: GET with `If-None-Match` / `If-Modified-Since`, `webcal://` read as `https://`, refreshed every N minutes each.
- **Expansion**: RRULE (the `rrule` crate), RDATE, EXDATE, RECURRENCE-ID overrides; time zones by TZID through chrono-tz (IANA names, Outlook's Windows names, Mozilla's prefixed names, and a VTIMEZONE's own offsets as the last resort), floating times, all-day dates.
- **Writing**: new timed events carry the user's TZID and a VTIMEZONE made from chrono-tz's rules; edits keep every property they do not touch (attendees, alarms, X- properties); recurring scopes as in §2.
- **Quick add**: a small grammar of dates, times, ranges, durations, repeats and places in three languages, tested.
- **Contacts**: CardDAV on the same server and account (addressbook-home-set), vCards read for name, e-mails and organisation, cached.

## 4. The contract with Email

| Tool / method | Input | Answer |
|---|---|---|
| `import_invite` | `ics`, `source` (the mail's Message-ID), `partstat?` (`ACCEPTED`/`TENTATIVE`/`DECLINED`), `attendee?` | `{ uid, calendar, status: added/updated/unchanged, start, end }` |
| `invite_status` | `ics`, `attendee?` | `{ uid, in_calendar, partstat?, start, end, conflicts: [{ summary, start, end, calendar }] }` |
| `contacts` | `q?`, `limit?` | `[{ name, emails, org? }]` |
| `agenda` | `days?` | today's and the next days' instances |

## 5. What is left out on purpose

- Sending iTIP replies (METHOD:REPLY) to the organiser: Email sends mail; the calendar files the answer.
- Editing attendees and free/busy look-ups: read-only attendees are enough for one user's calendar.
- Alarms / notifications from the engine: the server's other clients ring; a later step.
