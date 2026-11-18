# Calendar (the `dav` plugin)

Your calendars and contacts over CalDAV and CardDAV, and Outlook / Microsoft 365 calendars over Exchange, from as many
servers and accounts as you have, in a calendar pane inside Atlas: month, week, work week, day, agenda and year views;
drag to create, move and resize; repeating events; meetings with guests; any calendar written to; read-only ICS
subscriptions; invitations answered from the Email plugin; and tools for agents. The engine is Rust; the pane is Svelte. The plugin's id is `dav` (tools `dav_*`), its title "Calendar".

## What it adds

- **The Calendar pane** (a left-bar tile, "Calendar: open"): the six views, an all-day lane, the now line, overlapping
  events laid out as Google Calendar does (side by side when they start together, widened over free columns; a later
  one drawn over a running one, indented, so a long event keeps its width; a narrow block shows its title, the rest on
  hover); drag on the grid to create, drag an event to move it, drag its edge to resize (15-minute steps,
  Esc cancels); a click shows the event's card, `e` the full editor (title, all-day, start / end, repeat, place,
  description, calendar, guests). A repeating event asks "this event / this and following / all events". Every change shows at
  once, is written behind, and has Undo; a refusal rolls back with the server's reason.
- **The agenda as a day, 3 days or a week** (Agenda's chips; 60 days stays the default): every day of the span is
  listed, an empty one said, with the events and the dated tasks of the Tasks & deadlines layer (the core's
  `from: deadlines`); a task's box ticks it through the core as Home does (plugin API 31, `atlas.tickTask`). The
  phone's native Agenda shows the same days from the same two answers.
- **Keys** after Google Calendar's: `d` `w` `x` `m` `a` `y` (or 1–6) the views, `t` today, `j`/`k` next / previous,
  `g` go to a date, `c` new event, `q` quick add, `e` edit, Delete, `/` search, `r` sync, `s` the side panel, `?` the
  key sheet.
- **Quick add** (`q`): a line in English, Spanish or French ("lunch with Ana tomorrow 13:00"), previewed as you type.
- **The side panel**: a mini month, one heading per account with its calendars (show / hide, colour), the
  subscriptions, and — when switched on — your important notes as a calendar.
- **Outlook / Microsoft 365 (Exchange)**: an account card with Server `exchange` and the mailbox's address reads and
  writes that mailbox's calendars over Exchange Web Services. It has no sign-in of its own: the Email plugin's Outlook
  account of the same address lends its sign-in (`@mail` → `calendar_token`), so nothing is typed twice and nothing
  needs your organisation's approval beyond what Email already has. Events travel as iCalendar both ways. Exchange
  ignores iCalendar on update, so a change writes the new version first, then removes the old one (same UID).
- **Meetings**: guests in the editor make the event a meeting the calendar's account organises. On Exchange, Exchange
  sends the invitations, the updates when you change it and the cancellation when you delete it; on a CalDAV server
  that schedules (RFC 6638: Nextcloud, for one) the server sends them; elsewhere the guests are written but nobody is
  told. A meeting someone else organises shows its guests, not editable. Email's **Meeting** button opens the new-event
  dialog with the conversation's subject and people (the window event `atlas-calendar:new`).
- **Answering and joining from the card**: a meeting you are invited to in an Exchange calendar shows *Going? Yes /
  Maybe / No* first on its card, under its time; the answer goes through Exchange, which tells the organiser (a series
  is answered as a whole; the `respond` method). A CalDAV meeting is answered from its invitation mail. An online
  meeting's link (Teams, Zoom, Meet, Webex, Jitsi) in the location, the URL or the description becomes a **Join the
  meeting** button, which opens in the system's browser (the meeting's own app takes it from there), never a tab.
- **Reminders**: an event's alerts (VALARM: `-PT15M` before the start, `RELATED=END` from its end, a set moment;
  DISPLAY and AUDIO ones, never EMAIL) ring as notifications on this device, for every occurrence of a repeating
  event: the title, then "in 15 min · 14:00–15:00 · the place"; a click opens the note the event came from (an event
  without one brings Atlas forward). An event with none takes its calendar's default alert when the CalDAV server
  keeps one (`default-alarm-vevent-datetime` / `-date`), else the one Settings names (timed events only). The tool
  `reminders` (`on = "plan"`) lists the next 36 hours; the core fires each once at its time, asks again just before
  (an event moved or deleted meanwhile moves or drops it), and keeps what fired in its cache, so a restart never
  rings one twice. A reminder more than 30 minutes late is dropped. Subscriptions' alerts never ring (they are the
  publisher's). The phone rings only once the calendar runs in its app (docs/design/DESIGN-calendar-tasks-nudges.md).
- **Event notes and links** (DESIGN-calendar-tasks-nudges.md §2): an event gets a note only when asked — **Make a
  note** on its card, "Calendar: link this note to an event…", a task time-blocked into it — in the folder Settings
  names (`calendar/2026/2026-11-17 Title.md`): the event's time, place and calendar as properties, `links:`, a
  `calendar.event` block drawing the live event, and your writing below, never touched. The note follows its event
  after each sync, written by the computer that runs the vault's schedules (`[automation] schedules_on`; every
  computer when none is named), so two never write the same notes for sync to copy; a deleted event's note is kept and marked `cancelled: true`. Other calendar apps see the links as
  `Atlas: [[…]]` lines in the description. The card lists what the note links and what links to it. From the card,
  **Link a note…** links any note (a mail saved as a note too) and **Link a mail…** searches the mail (the Email
  plugin saves the chosen conversation as its note); a linked mail opens as the mail in Email.
  In a note, `[[` and two letters offer the calendar's events of the weeks around today beside the notes: a pick makes
  the event's note (once) and writes the link to it.
- **Tasks & deadlines** (a switch under "In the vault"): open tasks with 📅 / ⏳ and notes with `due:` on their day;
  a task's card offers **Time-block…** (then drag the slot on the hours): the event, its note linking the task, and
  the task's line given `⏳ day` and `[[event note|Tue 14:00]]` before its fields — or drag the task from the all-day lane onto the hours (an hour from where it lands). Also
  "Calendar: time-block the task at the caret…". When such an event moves, a toast offers **Move ⏳ too**.
- **Moving an event between calendars**, of the same account or another: written there first, then removed here.
- **Times** are your local time, 24-hour by default; time zones (IANA, Windows, VTIMEZONE) and DST are handled.
- **The block `dav.upcoming`** (`days: 7`): today, tomorrow and the rest of the week as a compact agenda.
- **Any calendar view** can show the events: ```` ```view ```` / `type: calendar` / `from: plugin:dav/events`.
- **For the Email plugin** (the role `calendar`): `import_invite` (file or update an invitation, with your answer; a
  meeting already in an Exchange calendar is answered by Exchange itself — accept, tentative, decline — so it stays
  linked to the organiser's meeting, and Email sends no answer of its own), `invite_status` (is it
  in your calendar, does it overlap anything), `contacts` (CardDAV address books), `agenda`.
- **Tools for agents** (`atlas mcp`): `dav_calendars`, `dav_events`, `dav_agenda`, `dav_add_event`,
  `dav_remove_event`, `dav_import_invite`, `dav_invite_status`, `dav_contacts`, `dav_sync`, `dav_reminders`. The plugin never reads
  mail or guesses dates from text: an agent reads them and calls `dav_add_event` with the source.
- **Important notes** (opt-in): a note with `important: true` and `due:` or `event:` (+ `event_end:`) shows as an
  event in the pane and, when "Put important notes on the server" is on, is written to the calendar new events go to.
  Mail notes are never read. Nothing is ever deleted by itself.
- **Instant updates** (WebDAV Push, CalDAV only; an Exchange account is checked on the regular round): a calendar server that offers it (RustiCal does) tells an ntfy server of each
  change and the calendar syncs at once.
- **A cache**, `calendar.sqlite` in the plugin's cache folder: only a cache, deleting it loses nothing. Sync uses
  `getctag`, `sync-token` and ETags (Exchange: each item's ChangeKey); subscriptions are fetched again only when changed.

## Settings

- **Accounts** (cards, also under Settings → Accounts, with RustiCal, Nextcloud and Outlook / Microsoft 365 presets, a
  state line and Test):
  - **Name**: starts each calendar's id (`home/personal`).
  - **Server**: `caldav` (default) or `exchange` (Outlook / Microsoft 365: only the mailbox's address as the user name,
    no server address or password; it needs the Email plugin with an Outlook account of that address, signed in).
  - **Server address** (CalDAV): `https://cal.example.org/caldav/` (RustiCal), `https://cloud.example.org/remote.php/dav/`
    (Nextcloud); the server's top often works too.
  - **User name** (Exchange: the mailbox's address), **App password** (CalDAV; a secret: an app password made on the
    server, not your sign-in password).
  - **Colour**: for this account's calendars that have none of their own.
  - Under the cards: **Sync now**.
- **New events go to**: a calendar id of any account (offered once an account is saved); empty: the first account's
  first calendar. Invitations and agents' events go here unless they name another.
- **Subscriptions** (cards): **Name**, **Address** (`https://` or `webcal://`), **Colour**, **Fetch every (minutes)**
  (60), and Test.
- *The pane*: **Opens on** (week), **Weeks start on** (locale), **Clock** (24h / 12h), **Day view starts at (hour)**
  (8), **Show important notes** (off), **Deadline calendars** (none: calendar ids or names whose events are
  deadlines; they join dated tasks and notes in Home's deadlines box and on the Deadlines page, through the
  `deadlines` tool, which reads the local cache only).
- *Reminders*: **Event reminders** (on); **Alert for events that have none** (off; at start, 5, 10, 15, 30 minutes, 1
  hour or 1 day before; a server's default alert wins).
- *Sync*: **Check the servers every (minutes)** (5, advanced); **Instant updates through ntfy** (an ntfy server; empty:
  the Notifications plugin's server when that plugin runs and its server was set, not left on its default; else only
  the regular check), **ntfy user**,
  **ntfy password**, **ntfy access token**; **Put important notes on the server** (off); **Only notes in these
  folders** (advanced; empty: the whole vault); **Skip dates older than (days)** (30, advanced).
- Kept by the pane, never shown in the form: hidden calendars and calendar colours.

## How it fits

No requirements; an Exchange account needs Email (its sign-in). Email calls its tools for invitations and contacts (the
role `calendar`); Daily shows the day's events; the core's
calendar view reads `events`, and its `from: deadlines` view the `deadlines` tool (the deadline calendars' events).

## Needs

The helper is built by `bash engine/build.sh` into `bin/<arch>-<os>/` (not committed); the pane by
`node scripts/dev/plugin-ui.mjs plugins/stable/dav`.

## Platforms

Linux works; the others are untested.

## Status

Beta, and the closest to stable: `cargo test` covers the engine (recurrence, zones, ICS, editing, the cache, Exchange's
answers) and an end-to-end spec covers the pane; an Exchange mailbox's contacts are not read yet (address books are
CardDAV's); it still needs a review by someone who did not write it.
