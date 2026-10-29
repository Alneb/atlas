# Today

The day, drawn: chips in Today's greeting, the top of a day's log, and two blocks that give the vault a visible shape.
Everything is read from the notes; nothing is written.

## What it adds

- **Greeting chips** under the date on Today: the week and day of the year, the moon's phase (lit share on hover), and
  what is due or overdue today.
- **`daily.header`** (the vault's log template puts it under the day's heading):
  - the day, from the note's `date:` property or a `YYYY-MM-DD` file name, its weekday in words;
  - **weather**: the note's `weather` property, as the Weather plugin wrote it;
  - **entries**: how many timed lines (`- 14:05 …`) the log holds;
  - **calendar, due, done**: the day's events from the Calendar plugin (none when it is off) and the tasks due and
    done that day, each opening where it came from — shown live, never written into the note;
  - **← →**: the previous and next days that have a log, across the log folder's year and month folders.
  - In a template it draws today's header as a preview, and says so.
- **`home.map`** (block "Map of the vault"): the vault's skeleton as a tree — the notes others hang from by a link
  property (`topics:` by default), each with how many notes name it. Options: the property, and the fewest notes a
  name needs to be shown.
- **`home.areas`** (block "Areas of the vault"): each top folder as a tile — how many notes, when it was last touched,
  how busy it was this month, its latest notes — busiest first. Options: how many areas, how many notes each, folders
  left out. Mail, templates and Atlas's own folders are always left out.

The blocks keep the ids they had (`daily.header`, `home.map`, `home.areas`), so notes that use them go on working.

## Settings

- **Language** (auto, en, es, fr; auto is the device's language): the weekday is written in it; the chips' and the
  blocks' own words are English or Spanish.
- **Map: the property notes hang from** (`topics`): `topics`, `up`, `parent`…

## How it fits

No requirements. Weather (its greeting chips and the log's `weather`) and Calendar (`dav`, the day's events) add to
the same day when they are on. It replaces the **Daily** and **Home** plugins (`replaces`): installing it carries
their settings over (Home's language first) and moves their folders to `.atlas/trash/`.

## Platforms

Linux works; Android works (`phone = true`); the others are untested.

## Status

Beta. Tests: `ui/tests/daily-log.spec.ts` (the log's header) and `ui/tests/home-greeting.spec.ts` (the chips and the
map). No unit tests.
