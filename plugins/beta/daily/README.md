# Daily

The top of a day's log: the `daily.header` block (the vault's log template puts it under the day's heading) shows
the weekday, the day's weather, how much was captured, its events and tasks, and buttons to the days before and after.

- **Weather**: the note's `weather` property, as the Weather plugin noted it.
- **Entries**: how many timed lines (`- 14:05 …`) the log holds.
- **Calendar, Due, Done**: the day's events from the Calendar plugin (`dav`, none when it is off) and the tasks due
  and done that day, each opening where it came from. These are shown live, never written into the note.
- **← →**: the previous and next days that have a log, across the log folder's year and month folders.
- In a template it draws today's header as a preview, and says so.
- The day comes from the note's `date:` property or a `YYYY-MM-DD` file name.

## Settings

- **Language of the date** (`auto`, `en`, `es`, `fr`; auto is the device's language).

## Needs

Nothing; the Weather and Calendar plugins add their parts when they are on.

## Platforms

Linux works; Android works (`phone = true`); macOS, Windows and a server are untested.

## Tests

`ui/tests/daily-log.spec.ts`.
