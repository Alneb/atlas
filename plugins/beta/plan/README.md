# Plan

Nudges for your open tasks, at the moment they fit your day, and a morning digest. Each nudge is a notification with
**Done** (ticks the task), **Snooze to 16:30** (the next free slot that holds it), **Block 16:30** (with the Calendar
plugin: that slot becomes an event for the task, its note linking it, ⏳ on the task's line — the event reminds you
then, and the nudges wait until the block is over) and **Open** (the note; on a phone, which shows three buttons, the
tap on the notification). A task
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
score = urgency × room × fatigue

urgency = priority weight   (🔺 3 · ⏫ 2 · 🔼 1.4 · none 1 · 🔽 0.6 · ⏬ 0.3)
        × date pressure     (overdue 3 · due today 2.5 · scheduled today 2 · due tomorrow 1.6 ·
                             due in d ≤ 7 days 1 + (7 − d)/14 · otherwise 0.5)
room    = the free time from that moment holds the task: 1 · half of it: 0.4 · less: 0
fatigue = × 0.8 for each nudge (of any task) in the hour before
        × 0.6 for each time you dismissed this task's nudge that day
presence = × 0.6 for a nudge now when no one has used this computer for 30 minutes (later moments: 1)
```

**Presence** is when you last used this computer, as Atlas knows it: an Atlas window coming into focus, and the
system's own word, read once a minute — the screen locked or the session idle (logind on Linux, the last input on
Windows). Away, an ordinary task waits for you (its next moment is not weighed); an urgent one (score ≥ 1.7) still
rings. When the system says nothing, presence weighs nothing. Settings → Plan → **Why now?** says when the computer
was last used.

**Dismissing a nudge** (swiping it away, closing it) is recorded in the ledger (`dismissed`, with a mark of the
task's line as it was). Dismissed **3 times in 3 days**, the task is **paused**: no more nudges until you edit its
line (another date, another wording) or it is due today or overdue. Settings → Plan → **Why now?** says so ("paused:
dismissed 3 times since …").

The nudge goes at the **first gap that holds the task** whose score reaches the **Threshold** (1), within these limits.
Once the ledger holds **10 done times for the task's kind** (Done on a nudge, a nudged task seen ticked, and any
task ticked between two of the planner's 5-minute rounds) — its first tag (`#writing`), else its note's folder —
the habit of the hour moves it: among the moments of that same day that pass the threshold and the limits, the one
whose hour (± one) saw most of those done times, weighted 0.5 to 1.5. The hours are the **weekday's**: each weekday
starts as the every-day profile (10 pseudo-records of it) and its own done times take over as they come, so a kind
done at 10 on Mondays and at 16 otherwise is nudged at 10 on a Monday and at 16 on a Tuesday. The habit only reorders a day: it never holds
a nudge back nor sends it to another day. Settings → Plan → **When you get things done** lists each kind's busiest
hours. Limits:

- **one nudge per task per window** — morning (until 12:00), afternoon (until 18:00), evening;
- at most **N a day**, **G minutes apart**, for ordinary tasks. Both are **measured** from the ledger once it has 14
  days: N is the largest rank of the day (1st, 2nd… nudge) you still acted on — done or snoozed within two hours — at
  least a quarter of the time and at half the rate of the first, one more when even the last one was; G is the
  shortest gap (15, 30, 45, 60, 90, 120 minutes) whose acted-on rate is within 80 % of the best. Until then 6 and 45.
  A number in Settings pins either;
- **important tasks are not held back by N or G**: ⏫ / 🔺, overdue, or due today (quiet hours and the window rule
  still hold);
- **a snooze is a promise**: the task rings at the time chosen, whatever its score.

Each nudge says why: *"due tomorrow, ⏫, 45 min free until 14:45"*, and *"you usually finish #writing in the
afternoon"* when its kind's habit chose the hour.

The **morning digest** comes once a day at the first moment after quiet hours (not before **Digest not before**,
08:00): how many tasks are overdue, due today, and may nudge but have no slot today, opening the Deadlines page.

The computer that runs the vault's schedules (`[automation] schedules_on`, Settings → Automation; any computer
when none is named) plans. **A nudge rings on the device you are at**: when the vault is mirrored, each device tells
the server once a minute when it was last used, and every device applies the same rule to that — the **computer used
in the last 5 minutes** (the latest, when two were), else **the phone, while Atlas runs there** (it reported in the
last 10 minutes), else the planning computer. The device picked plans for itself (its ledger lines end in
`(local plan)`); the planner still writes `plan/next.md` and records nothing it did not ring. Without a mirror, or
with every device silent, the planner rings, as below. It writes its plan to **`plan/next.md`** (beside
the ledger folder): which device planned, when, and the next nudges with their reasons — again whenever the plan
changes, and at least every hour. Every other device reads it once synced; when it is **missing or 2 hours old** (the
planner's computer is off or asleep), that device **plans for itself**, and its ledger lines end in `(local plan)`.
At worst a nudge then rings on two devices. Settings → Plan says which it is.

**The phone's alarms.** The Android app sets exact alarms for `plan/next.md`'s nudges, so a nudge rings with the app
closed, and tells its vault's core what it armed (`.atlas/cache/alarms.json`), which the core passes on with its
presence. When no computer was used in the last 5 minutes and no phone runs Atlas, a phone whose **exact** alarm is
set for a nudge's moment (from 5 minutes after the moment to 30 minutes before it) rings that nudge: the planner, and
the server's ntfy fallback, leave it alone. Only per nudge: one the phone never saw in `plan/next.md` (a new one, one
moved earlier) stays with the planner, and inexact alarms (Android withholding the exact-alarm permission) are never
trusted. Settings → Plan → **Why now?** says which nudge was left to the phone.

## Quiet hours, measured

Each device keeps the hours it is seen in use (its last use, looked at every round) and writes them, once the day is
over, as one line of its ledger: `- 2026-11-16 23:59 · used · 08:00–12:00, 14:00–15:00, 21:00–23:00`. Over the last
28 days, an hour is **quiet** when, on at least 80 % of the days some device wrote such a line, no device was used
in it and no task was ticked in it; the quiet hours measured are the longest run of quiet hours (across midnight).
Settings → Plan → **Why now?** shows them once 14 days of use are known. **Quiet hours measured** (off) makes the
planner use them instead of **Quiet hours**; until there are 14 days, or when no hour is quiet, **Quiet hours** holds.

## When no device runs Atlas: ntfy

A vault kept on a server (mirrored) still nudges while none of your devices runs Atlas — the laptop shut, the phone's
app closed: every 5 minutes the server (`fallback`, `background = "server"`) looks at the devices' last reports, and
when **none has reported for 10 minutes** and the device rule picks none, it plans as a device would and sends each
nudge that comes due through the **Notifications** plugin's ntfy (your phone's topic), once. The message has its
buttons, **Done**, **Snooze to …** and, with a calendar, **Block …**; pressing one calls the server back from the phone with no Atlas app and no
sign-in: each button's address carries a token the server signed for that one nudge and that one button, valid a day
(the core's hooks, `press` with `on = "hook"`). Done ticks the task through the core's one tick path, Snooze records
the promise — exactly as the notification's own buttons do, in the server's ledger (`plan/ledger/<month> <server>.md`,
its nudges ending in `(ntfy)`). Tapping the message opens Atlas in the browser.

- **Through ntfy when no device runs Atlas** (on): the fallback itself. It never sends while a device runs Atlas, and
  never when no device has ever reported to the server (without a mirror the server cannot know whether you are
  using Atlas, so it stays silent).
- **Say the task on ntfy** (off): ntfy is a service outside your devices, and it cannot take a message back once a
  task is done. Off, the message says only *"A task is waiting"*; on, the task's name and reasons. The digest gives its
  counts either way, the names only when this is on.
- **Server's address for the buttons** (advanced): the buttons need the address the phone reaches the server at; the
  server learns it from your devices' own requests, and this names it when that is wrong. Unknown, the message goes
  without buttons.
- The gate in front of the server (Authelia…) must let `/api/plugins/*/hook/*` through (docs/guides/SERVER.md), else
  the buttons get the sign-in page and do nothing.

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

## Habits

A habit is a note with a `habit:` property, anywhere in the vault (docs/design/DESIGN-habits.md, slice 1):

```yaml
---
habit: gym                # its kind: gym, running and sleep have presets; anything else is every day, an hour
days: [mon, wed, fri]     # or daily, weekdays, weekends
window: "17:00-20:00"     # when it must happen (an end before the start: past midnight)
nag: 30                   # minutes between nags (at least 5)
paused: false
---
```

What the note leaves out, its kind's preset gives (gym: Mon/Wed/Fri 17:00–20:00; running: Tue/Thu/Sat 07:00–09:00;
sleep: every day 23:00–24:00, every 15 min). **In one line**, from any capture: `habit gym mon wed fri 18:00`,
`habit sleep 23:30`, `habit read daily 21:00-22:00` makes `habits/<Kind>.md` (the folder is a setting), once; from
then on the note is yours to edit.

In its window the habit is **nagged every `nag` minutes until it is done**: a notification with **Done**, **Skip
today** and **Open**. A nag swiped away is nothing — the next one comes. Habits are outside the day's budget and the
quiet hours: you asked for them. The ledger says each nag (`nudged · … · habit gym · nag 2`), `done` and
`dismissed · habit · skipped today`.

## Not yet

From the design's later slices: the habits' ladder past the nag (friction on the phone, proofs, the laptop), DESIGN-habits.md slices 2–5. The ledger
is not yet left out of search by default (add `plan/ledger` to `[editor] index_exclude` if you want that).

## Files

`helper/plan.ts` (the planner, pure), `helper/habits.ts` (habit notes, the one-line setup, the nags), `helper/ledger.ts` (the ledger's text), `helper/next.ts` (`plan/next.md`), `helper/devices.ts` (the device rule), `helper/fallback.ts` (the ntfy messages), `helper/time.ts` (local time without
the machine's zone baked in), `helper/helper.ts` (the core's API), built into `helper.js` by
`node scripts/dev/plugin-ui.mjs plugins/beta/plan`; `main.js` (the Settings section). Tests: `helper/*.test.ts`
(`--check`), and `crates/atlas-core/tests/plan_plugin.rs` (the plugin in a real core).
