# The DAV plugin grown into the Calendar

2026-10-23. The goals: the Email plugin integrated with the DAV plugin, a powerful calendar view inside the app, subscriptions to open iCal calendars, and times shown in local time. Where the calendar lives: the DAV plugin grows into a Calendar plugin rather than add a calendar to the core. The study behind the pane: [DESIGN-calendar.md](../design/DESIGN-calendar.md). The plugin's own reference: [plugins/beta/dav/README.md](../../plugins/beta/dav/README.md).

## Before

- `plugins/beta/dav`: a Rust helper with no state. Every call went to the server: `events` was one `calendar-query` REPORT over the write calendar, its events listed **as written** — a weekly meeting appeared once, at its first date; a TZID time was shown as its wall clock in that zone, not the user's.
- A page side in plain JS (`main.js`): two palette commands, a notice per date the automatic sync added, and the `dav.upcoming` block (a list of `start  summary` lines from the server, on every draw).
- No pane, no subscriptions, no contacts. The core's `type: calendar` view could show the events through `from: plugin:dav/events`.

## After

```
plugins/beta/dav/
  plugin.toml          title "Calendar", rail = true; settings: account, subscriptions (records + Test), the pane's
                       view / week start / clock / hidden / colours, sync; tools: calendars, events, agenda, add_event,
                       remove_event, import_invite, invite_status, contacts, sync (on = "fs")
  engine/src/
    store.rs           the SQLite cache: sources, calendar objects (text, ETag, UID, time bound, words), contacts
    pull.rs            getctag → sync-token → ETag listing → calendar-multiget; subscriptions by conditional GET; books
    caldav.rs          + state / listing / changes (RFC 6578) / multiget / write / erase
    carddav.rs         address books from the account, vCards read
    subs.rs            webcal → https, conditional fetch, a feed split per UID
    recur.rs           expansion: RRULE (rrule crate) in the master's frame, RDATE, EXDATE, overrides, the user's zone
    zone.rs            TZID resolution (IANA, Windows, Mozilla, VTIMEZONE), the user's zone, VTIMEZONE writing
    edit.rs            create / update / delete with scopes this · following · all, properties kept
    quick.rs           quick add in English, Spanish, French
    invite.rs          the user's answer on their ATTENDEE line, X-ATLAS-ME, canonical comparison
    conf.rs            settings and the app password from the call or over the pipe
    api.rs             every method (the pane's, the tools, Email's)
    main.rs            the helper loop, or one method from the command line
  ui/src/              Svelte 5 + TS: App (toolbar, keys, popover, editor, quick add), TimeGrid, MonthView, AgendaView,
                       YearView, Sidebar, Popover, Editor, Upcoming (the Home card), store.svelte.ts, layout.ts, keys.ts
  view.js main.js ui-lib/   the build (node scripts/dev/plugin-ui.mjs plugins/beta/dav), committed
```

- The pane reads **the cache at once** (`range`) and syncs behind (`refresh`), so opening it or moving a week never waits for the server; the background round (`watch`) keeps it fresh and says `changed`.
- **Every time is the user's local time**, on the 24-hour clock: the page sends its zone (`Intl…timeZone`) with every call; instances come back as `2026-11-04T10:00:00+01:00` (or a date), so `new Date()` reads them right with the local getters; every hour shown goes through one helper (`api.ts clock()`: `hourCycle: "h23"`, 12-hour only when the setting says so — the user's system has `LC_TIME=es_ES` but the webview's locale is en-US and would say "09:01 AM").
- `events` (the core view's source and the agents' tool) now answers expanded instances from the cache, every visible calendar and subscription by default, or `calendar`'s.
- The Email plugin calls `import_invite` (after sending the iTIP REPLY), `invite_status` (when it shows an invitation), `contacts` (address completion) and `agenda` (its Home triage card) through `POST /api/plugins/dav/tools/<name>`.

## Why this shape

- **A plugin, not the core** (PHILOSOPHY §3): the calendar is an integration with a server; the core keeps its generic `type: calendar` view, fed by any plugin.
- **A cache, not the vault**: calendar events are the server's data (as mail is Email's, REFACTOR-email-rust); writing them as notes would make a second copy to keep in step. What is in the vault — important notes — is shown from the vault (the Notes calendar) and pushed to the server by the existing convention.
- **Recurrence by a crate, the frame by hand**: the `rrule` crate counts rules correctly but wants DTSTART in a real zone and UNTIL in UTC; calendars write all-day dates, floating times and UNTIL as a date. Counting in the master's frame (UTC standing in for dates and floating times) and applying UNTIL ourselves keeps both right; a test pins a weekly 10:00 across the November DST change.
- **Writes are conditional and undoable**: If-Match / If-None-Match everywhere; a 412 retries once on the server's newer version; Undo writes back the text before the change.
- **The contract's `invite_status { ics }`** has no attendee: `import_invite` records the user's address as `X-ATLAS-ME` on the copy it files, so a later status finds the user's answer with the ics alone.

## What was checked

- 43 engine unit tests; `tests/calendar.rs` and `tests/server.rs` against RustiCal in podman (a common self-hosted CalDAV server), all green; clippy clean; the static build (musl + musl-gcc, 8.7 MB).
- `ui/tests/example-calendar-pane.spec.ts`: 2 passing (a subscription served by the spec, the debug engine).
- `node scripts/dev/plugin-ui.mjs --check plugins/beta/dav`: 0 errors, 0 warnings in the plugin's sources.
- WebKit screenshots of month / week / day / agenda at 1440 / 960 / 480 px, light and dark, plus the card, the editor, quick add and the year, on a small probe vault (`target/probe-vault-cal`, never a real vault) served on its own port against RustiCal. What they showed and what was fixed: the view keys never reached the pane (focus sits on Dockview's group container: the pane now takes focus and counts that container as its own); the month grid did not fill the pane (the grid's rows shifted when the quick-add bar was closed); a short event lost its title to its time; the toolbar pushed the title out at mid widths (the views become a menu under 980 px); native selects drew light in dark mode; WebKit's time field showed seconds and AM/PM whatever `lang` said (now typed HH:MM fields).

## What to watch

- **The cache's bound for repeats with COUNT**: an object whose rule has COUNT but no UNTIL is treated as endless in the range query (it is expanded and filtered exactly afterwards); a calendar with thousands of old COUNT series pays for that on each range.
- **Floating times read from another zone**: the cache's bounds carry a day of slack; an event floating at 23:30 seen from a zone 14 hours away is the edge case.
- **VTIMEZONE writing** covers zones with at most two changes a year (every current one); historical rule changes are not written (the server and other clients use their own zone data for an IANA TZID anyway).
- **RustiCal keeps deleted collections** in a trash: a calendar removed and made again under the same address answers 405 (the probe used new names).
- **Keys and focus**: the pane listens on the window and takes keys only when the focus is in it, on the page, or on the Dockview group holding it. The Email pane has the same check without the last case — the same symptom there if its pane is clicked on bare space.
- **`hidden` / `colors` are saved to the plugin's settings file** from the pane (`atlas.plugin.saveSettings`, not awaited): the settings file is outside the plugin folder, so the pane is not remounted by it.
- The helper's `bin/` stays ignored by git (as the catalog's); an install builds it with `engine/build.sh`.
