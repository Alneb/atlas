# Plan

Nudges for your open tasks, at the moment they fit your day, and a morning digest. Each nudge is a notification with
**Done** (ticks the task), **Snooze to 16:30** (the next free slot that holds it) and **Open** (the note). A task
ticked anywhere — the nudge, Home, the note, Obsidian on another computer once synced — is never nudged again, and a
nudge still showing for it is taken away.

The design is [DESIGN-calendar-tasks-nudges.md](../../../docs/design/DESIGN-calendar-tasks-nudges.md) §3; this is its
first slice (v0): urgency × room, no learning from the hour of day yet.

## Which tasks may nudge

An open task (`- [ ]`) may nudge when:

- it is dated (📅 due, else ⏳ scheduled) within **Days ahead** (7) or overdue, **or** its priority is ⏫ high or 🔺
  highest;
- its 🛫 start date has come;
- it is not in a folder of **Folders left out**.

Every other open task can still appear in the morning digest. A task's duration is `⏱ 45m` (or `⏱ 1h30m`) on its line,
else its tag's duration from **Durations per tag** (`writing=60, admin=15`), else **A task takes** (30 minutes).

## When

Every few minutes Atlas asks the plugin for its plan of the next 36 hours (the core's planned notices). For each task it
looks at the moments from now on, every quarter of an hour, that are outside **Quiet hours** (22:30–08:00) and outside
the calendar's busy events (the Calendar plugin's events from its cache; all-day events, events marked free and
cancelled ones do not count), and scores them:

```
score = urgency × room

urgency = priority weight   (🔺 3 · ⏫ 2 · 🔼 1.4 · none 1 · 🔽 0.6 · ⏬ 0.3)
        × date pressure     (overdue 3 · due today 2.5 · scheduled today 2 · due tomorrow 1.6 ·
                             due in d ≤ 7 days 1 + (7 − d)/14 · otherwise 0.5)
room    = the free time from that moment holds the task: 1 · half of it: 0.4 · less: 0
```

The nudge goes at the **first gap that holds the task** whose score reaches the **Threshold** (1), within these limits:

- **one nudge per task per window** — morning (until 12:00), afternoon (until 18:00), evening;
- at most **N a day**, **G minutes apart**, for ordinary tasks. Both are **measured** from the ledger once it has 14
  days: N is the largest rank of the day (1st, 2nd… nudge) you still acted on — done or snoozed within two hours — at
  least a quarter of the time and at half the rate of the first, one more when even the last one was; G is the
  shortest gap (15, 30, 45, 60, 90, 120 minutes) whose acted-on rate is within 80 % of the best. Until then 6 and 45.
  A number in Settings pins either;
- **important tasks are not held back by N or G**: ⏫ / 🔺, overdue, or due today (quiet hours and the window rule
  still hold);
- **a snooze is a promise**: the task rings at the time chosen, whatever its score.

Each nudge says why: *"due tomorrow, ⏫, 45 min free until 14:45"*.

The **morning digest** comes once a day at the first moment after quiet hours (not before **Digest not before**,
08:00): how many tasks are overdue, due today, and may nudge but have no slot today, opening the Deadlines page.

Only the computer that runs the vault's schedules (`[automation] schedules_on`, Settings → Automation; any computer
when none is named) plans and nudges; a nudge rings on that device. The phone, presence and the other devices are the
design's later slices.

## The ledger

What the plugin did and what you answered, as notes you can read, one per device and month, newest first:
`plan/ledger/2026-11 laptop.md` (the folder and the device's name are settings).

```markdown
---
type: plan-ledger
device: laptop
month: 2026-11
---
- 2026-11-16 16:48 · done · [[notes/Thesis#^t3f9a|Write the introduction]] · from the notification
- 2026-11-16 14:21 · snoozed → 16:30 · [[notes/Thesis#^t3f9a|Write the introduction]]
- 2026-11-16 14:05 · nudged · [[notes/Thesis#^t3f9a|Write the introduction]] · important · score 3.2 · due tomorrow, ⏫, 50 min free until 15:00
- 2026-11-16 08:00 · digest · 1 overdue, 2 due today
```

- Every device reads every device's ledger; the latest line about a task is its state (snoozed until, nudged in this
  window). Each device writes only its own note, so sync never makes a conflict copy.
- A task is named by its block id (`^t3f9a`) when it has one, else by its note and title. **Snooze gives the task a
  block id** (`^t…` at the end of its line, the Obsidian way), because you acted on it; nothing else writes into your
  notes except **Done**, which ticks the task the way the checkbox does (`✅ date`, and the next occurrence of a
  recurring task).
- A tick made elsewhere is noticed at the next plan (`done · seen ticked`), so the budget's measure counts it.
- Lines you add by hand are kept and not read.

Settings → Plan → **Why now?** shows the budget as measured, each task's next nudge or what holds it back, and the
ledger's last lines (the helper's `explain`, also an agent tool).

## Not yet

From the design's later slices: the hour-of-day histogram and back-off after dismissals (slice 6); presence, the phone's
exact alarms and one device among several (slice 7); habits (slice 8); time-blocking from a nudge (slice 5). The ledger
is not yet left out of search by default (add `plan/ledger` to `[editor] index_exclude` if you want that).

## Files

`helper/plan.ts` (the planner, pure), `helper/ledger.ts` (the ledger's text), `helper/time.ts` (local time without
the machine's zone baked in), `helper/helper.ts` (the core's API), built into `helper.js` by
`node scripts/dev/plugin-ui.mjs plugins/beta/plan`; `main.js` (the Settings section). Tests: `helper/*.test.ts`
(`--check`), and `crates/atlas-core/tests/plan_plugin.rs` (the plugin in a real core).
