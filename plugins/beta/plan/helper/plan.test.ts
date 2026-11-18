// The planner on a fixed clock (Monday 2026-11-16, UTC+1) with a fake calendar: a due-tomorrow ⏫ task nudged at the
// first gap that holds it, never in quiet hours, never twice in a window; done never nudged (a ticked line, a vanished
// line, a recurring task's ticked occurrence); a snooze honoured; the budget measured and kept; the ledger's text
// round-tripping.
import { test } from "node:test";
import assert from "node:assert/strict";
import { add, hoursOf, hoursText, keyOf, lineMark, markOf, parse, renderLine, type Entry } from "./ledger";
import { blockOf, DISMISS_PAUSE, groupOf, judge, measure, minutesOf, plan, quietOf, settingsOf, type Busy, type Input, type Task } from "./plan";
import { addDays, fixedClock, instant, MIN, type Clock } from "./time";

const OFFSET = 60;
/** 2026-11-16 at a local time. */
const at = (hhmm: string, day = "2026-11-16") => instant(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), fixedClock(0, OFFSET));
const clock = (hhmm: string, day = "2026-11-16"): Clock => fixedClock(at(hhmm, day), OFFSET);
const busy = (from: string, to: string, day = "2026-11-16"): Busy => ({ start: at(from, day), end: at(to, day) });

function task(text: string, over: Partial<Task> = {}): Task {
  const due = /📅 (\S+)/.exec(text)?.[1] ?? null, scheduled = /⏳ (\S+)/.exec(text)?.[1] ?? null;
  const priority = text.includes("🔺") ? "highest" : text.includes("⏫") ? "high" : "normal";
  const block = /\^(\w+)$/.exec(text)?.[1] ?? null;
  const title = text.replace(/[⏫🔺]|📅 \S+|⏳ \S+|🔁 every \w+|✅ \S+|\^\w+$/gu, "").replace(/\s+/g, " ").trim();
  return { path: "notes/Thesis.md", line: 3, text, done: false, title, due, scheduled, priority, tags: [], block, ...over };
}

function input(c: Clock, tasks: Task[], over: Partial<Input> = {}): Input {
  return { tasks, busy: [], calendarRead: true, entries: [], settings: settingsOf({ digest: false }), clock: c, ...over };
}

const intro = task("Write the introduction ⏫ 📅 2026-11-17 ^t3f9a");

test("with a calendar that can time-block, a nudge offers Block in Snooze's slot, before Open", () => {
  const cal = [busy("10:00", "11:30"), busy("11:40", "14:00"), busy("14:45", "16:00")];
  const n = plan(input(clock("10:00"), [intro], { busy: cal, canBlock: true })).planned[0];
  assert.deepEqual(n.actions.map((a) => a.id), ["done", "snooze:2026-11-16T16:00", "block:2026-11-16T16:00+30", "atlas:open"], "a phone shows the first three: Open is the tap anyway");
  assert.equal(n.actions[2].label, "Block 16:00");
  assert.deepEqual(blockOf("block:2026-11-16T16:00+30"), { start: "2026-11-16T16:00", minutes: 30 });
  assert.equal(blockOf("snooze:2026-11-16T16:00"), null);
});

test("a due-tomorrow ⏫ task is nudged at the first gap that holds it, with its reasons", () => {
  // busy 10:00–11:30 and 11:40–14:00; 14:00–14:45 is free (45 min ≥ 30), then busy again
  const cal = [busy("10:00", "11:30"), busy("11:40", "14:00"), busy("14:45", "16:00")];
  const out = plan(input(clock("10:00"), [intro], { busy: cal }));
  assert.equal(out.planned.length, 1);
  const n = out.planned[0];
  assert.equal(n.at, "2026-11-16T14:00:00+01:00", "not the 10-minute gap at 11:30: the first that holds it");
  assert.equal(n.until, "2026-11-16T14:30:00+01:00");
  assert.equal(n.id, "plan:notes/Thesis.md#^t3f9a");
  assert.equal(n.subject, "notes/Thesis.md#^t3f9a", "ticking it anywhere withdraws it");
  assert.equal(n.body, "due tomorrow, ⏫, 45 min free until 14:45");
  assert.deepEqual(n.actions.map((a) => a.id), ["done", "snooze:2026-11-16T16:00", "atlas:open"], "Snooze: the first free slot an hour on");
  assert.equal(n.actions[1].label, "Snooze to 16:00");
  assert.deepEqual(out.writes, [], "a nudge for later is not recorded yet");
  assert.equal(out.decisions[0].score, 3.2, "high 2 × due tomorrow 1.6 × room 1");
});

test("never in quiet hours: a day busy until 22:30 waits for the morning", () => {
  const out = plan(input(clock("10:00"), [intro], { busy: [busy("10:00", "22:30")] }));
  assert.equal(out.planned[0].at, "2026-11-17T08:00:00+01:00");
});

test("a nudge whose moment has come is recorded, and stays in the plan, once, while it rings", () => {
  const first = plan(input(clock("10:00"), [intro]));
  assert.equal(first.planned[0].at, "2026-11-16T10:00:00+01:00", "free now: now");
  assert.equal(first.writes.length, 1);
  const w = first.writes[0];
  assert.equal(renderLine(w.entry, clock("10:00"), w.task), "- 2026-11-16 10:00 · nudged · [[notes/Thesis#^t3f9a|Write the introduction]] · important · score 3.2 · due tomorrow, ⏫, free until 22:30");
  // asked again five minutes later (the core's next round, or just before it rings): the same moment, nothing new written
  const again = plan(input(clock("10:05"), [intro], { entries: [w.entry] }));
  assert.deepEqual(again.planned.map((p) => p.at), ["2026-11-16T10:00:00+01:00"]);
  assert.deepEqual(again.writes, []);
});

test("never twice in a window: nudged this morning, next in the afternoon", () => {
  const morning: Entry = { at: at("08:30"), kind: "nudged", key: keyOf(intro), titleKey: "notes/Thesis.md|Write the introduction", important: true, detail: "" };
  const out = plan(input(clock("10:00"), [intro], { entries: [morning] }));
  assert.equal(out.planned[0].at, "2026-11-16T12:00:00+01:00");
});

test("done is never nudged: a ticked line, a vanished line, a recurring task's ticked occurrence", () => {
  const rung: Entry = { at: at("10:00"), kind: "nudged", key: keyOf(intro), titleKey: "notes/Thesis.md|Write the introduction", important: true, detail: "score 3.2 · due tomorrow" };
  // ticked: out of the plan (the core withdraws a notice that drops out while it rings), and its answer recorded
  const ticked = plan(input(clock("10:05"), [{ ...intro, done: true, text: `${intro.text} ✅ 2026-11-16` }], { entries: [rung] }));
  assert.deepEqual(ticked.planned, []);
  assert.deepEqual(ticked.writes.map((w) => [w.entry.kind, w.entry.key, w.entry.detail]), [["done", keyOf(intro), "seen ticked"]]);
  // vanished (deleted, or the note gone): out of the plan, nothing claimed
  const gone = plan(input(clock("10:05"), [], { entries: [rung] }));
  assert.deepEqual([gone.planned, gone.writes], [[], []]);
  // a weekly task ticked: the ticked occurrence keeps the id, the next one (no id) is a new task — not this morning
  const water = task("Water the plants 🔁 every week 📅 2026-11-16 ^tw4t", { path: "notes/Home.md" });
  const wateredRung: Entry = { at: at("10:00"), kind: "nudged", key: keyOf(water), titleKey: "notes/Home.md|Water the plants", important: true, detail: "" };
  const done = { ...water, done: true, text: `${water.text} ✅ 2026-11-16` };
  const next = task("Water the plants 🔁 every week 📅 2026-11-23", { path: "notes/Home.md", line: 2 });
  const out = plan(input(clock("10:05"), [next, done], { entries: [wateredRung] }));
  assert.ok(!out.planned.some((p) => p.id === "plan:notes/Home.md#^tw4t"), "the ticked occurrence is out");
  assert.ok(out.planned.every((p) => p.at >= "2026-11-16T12:00"), `the next occurrence not in the window just nudged: ${out.planned.map((p) => p.at)}`);
  assert.ok(!out.writes.some((w) => w.entry.kind === "nudged"), "nothing nudged now");
});

test("a task ticked between two rounds, never nudged, is a done time; not at a first round, not twice", () => {
  const ticked = { ...intro, done: true, text: `${intro.text} ✅ 2026-11-16` };
  const was = new Set([keyOf(intro)]);
  const r = plan(input(clock("16:10"), [ticked], { wasOpen: was }));
  assert.deepEqual(r.writes.map((w) => [w.entry.kind, w.entry.key, w.entry.detail, w.entry.at]), [["done", keyOf(intro), "seen ticked, never nudged", at("16:10")]]);
  // the helper's first round (nothing known open): a tick made before it is never given this hour
  assert.deepEqual(plan(input(clock("16:10"), [ticked], {})).writes, []);
  // recorded already (this device's last round, or another device's): not again
  const once = plan(input(clock("16:15"), [ticked], { wasOpen: was, entries: r.writes.map((w) => w.entry) }));
  assert.deepEqual(once.writes.filter((w) => w.entry.kind === "done"), []);
});

test("a snooze is honoured at its moment, whatever the score, and then rings", () => {
  const later = task("Call the bank 📅 2026-11-22 ^tb4k");
  const snoozed: Entry = { at: at("10:05"), kind: "snoozed", key: keyOf(later), titleKey: "notes/Thesis.md|Call the bank", until: at("16:30"), detail: "" };
  const before = plan(input(clock("11:00"), [later], { entries: [snoozed] }));
  assert.deepEqual(before.planned.map((p) => p.at), ["2026-11-16T16:30:00+01:00"], "not at 11:00, though free");
  assert.equal(before.planned[0].body, "snoozed to 16:30, due in 6 days");
  // the moment come: recorded as nudged (not counted against the budget), kept while it rings
  const due = plan(input(clock("16:31"), [later], { entries: [snoozed], busy: [busy("16:00", "18:00")] }));
  assert.equal(due.planned[0].at, "2026-11-16T16:30:00+01:00", "a promise: even inside a busy hour");
  assert.deepEqual(due.writes.map((w) => [w.entry.kind, w.entry.important]), [["nudged", true]]);
});

test("the budget: N a day and G minutes apart for ordinary tasks; important ones are not held back", () => {
  const s = settingsOf({ digest: false, max_per_day: 2, min_gap: 60 });
  const plain = ["Draft A", "Draft B", "Draft C"].map((t, i) => task(`${t} 📅 2026-11-18`, { line: i + 1 }));
  const out = plan(input(clock("10:00"), [...plain, intro], { settings: s }));
  const today = out.planned.filter((p) => p.at.startsWith("2026-11-16") && p.id !== `plan:${keyOf(intro)}`).map((p) => p.at).sort();
  assert.equal(today.length, 2, `two ordinary nudges today: ${today}`);
  const [a, b] = today.map((x) => Date.parse(x));
  assert.ok(b - a >= 60 * MIN, "an hour apart");
  assert.equal(out.planned.find((p) => p.id === `plan:${keyOf(intro)}`)?.at, "2026-11-16T10:00:00+01:00", "the ⏫ one now");
});

test("the budget is measured from the ledger once there are 14 days of it", () => {
  const c = clock("10:00");
  assert.deepEqual(measure([], settingsOf({}), c), { perDay: 6, gap: 45, measured: false, days: 0, nudges: 0, acted: 0 });
  // 20 days: three nudges a day 30 minutes apart; the first two acted on (done within 2 h), the third never
  const entries: Entry[] = [];
  for (let d = 1; d <= 20; d++) {
    const day = new Date(Date.UTC(2026, 9, 26 + d)).toISOString().slice(0, 10);
    [0, 1, 2].forEach((k) => {
      const t = at(`09:${String(k * 30).padStart(2, "0")}`.replace("09:60", "10:00"), day);
      const key = `notes/a.md|task ${k}`;
      entries.push({ at: t, kind: "nudged", key, titleKey: key, detail: "" });
      if (k < 2) entries.push({ at: t + 20 * MIN, kind: "done", key, titleKey: key, detail: "" });
    });
  }
  const b = measure(entries, settingsOf({}), c);
  assert.equal(b.measured, true);
  assert.equal(b.perDay, 2, "the third of the day is never acted on");
  assert.equal(b.gap, 30);
  assert.equal(measure(entries, settingsOf({ max_per_day: 9 }), c).perDay, 9, "a number in Settings wins");
});

test("which tasks may nudge: dated within the week or overdue, or ⏫; not before 🛫; not in a folder left out", () => {
  const s = settingsOf({ exclude: "archive" }), today = "2026-11-16";
  assert.equal(judge(task("someday"), s, today).eligible, false);
  assert.equal(judge(task("far 📅 2026-12-20"), s, today).eligible, false, "in the digest only");
  assert.equal(judge(task("far but ⏫ 📅 2026-12-20"), s, today).eligible, true);
  assert.equal(judge(task("late 📅 2026-11-01"), s, today).important, true, "overdue: not budgeted");
  assert.equal(judge(task("week 📅 2026-11-20", { start: "2026-11-18" }), s, today).eligible, false, "not started");
  assert.equal(judge(task("old 📅 2026-11-17", { path: "archive/x.md" }), s, today).eligible, false);
  assert.equal(minutesOf(task("long ⏱ 1h30m 📅 2026-11-17"), s), 90);
  assert.equal(minutesOf(task("tagged", { tags: ["writing"] }), settingsOf({ durations: "writing=60, admin=15" })), 60);
});

test("an undated task left open for days may nudge (a daily log's - [ ] line), budgeted, never important", () => {
  const s = settingsOf({}), today = "2026-11-16";
  const log = (day: string, title: string) => task(title, { path: `notes/log/2026/11-November/${day}.md` });
  const old = judge(log("2026-11-12", "probar las soluciones"), s, today);
  assert.equal(old.eligible, true, "written 4 days ago in the log, still open");
  assert.equal(old.important, false, "an old undated task waits for the budget");
  assert.equal(old.dateWords, "open 4 days");
  assert.equal(judge(log("2026-11-15", "written yesterday"), s, today).eligible, false, "not yet stale");
  assert.equal(judge(task("created ➕ 2026-11-10"), s, today).eligible, true, "its ➕ date when it has one");
  assert.equal(judge(task("someday"), s, today).eligible, false, "no date anywhere: never");
  assert.equal(judge(log("2026-11-01", "  "), s, today).eligible, false, "an empty template line is no task");
  assert.equal(judge(log("2026-11-01", "old"), settingsOf({ stale: 0 }), today).eligible, false, "0: off");
  // the planner nudges it in a free gap
  const n = plan(input(clock("10:00"), [log("2026-11-10", "check host bath hyb")])).planned;
  assert.equal(n.length, 1);
  assert.match(n[0].body ?? n[0].title, /open 6 days|check host bath hyb/);
});

test("the morning digest: once, at the first moment after quiet hours", () => {
  const s = settingsOf({});
  const late = task("Pay the rent 📅 2026-11-14"), today = task("Send the form 📅 2026-11-16", { line: 4 });
  const early = plan(input(clock("07:00"), [late, today], { settings: s, digestOpens: "Deadlines.page" }));
  const d = early.planned.find((p) => p.id === "plan:digest:2026-11-16");
  assert.equal(d?.at, "2026-11-16T08:00:00+01:00");
  assert.equal(d?.title, "Today: 1 overdue, 1 due today");
  assert.equal(d?.open, "Deadlines.page");
  assert.ok(!early.writes.some((w) => w.entry.kind === "digest"));
  const now = plan(input(clock("09:12"), [late, today], { settings: s }));
  assert.equal(now.planned.find((p) => p.id.startsWith("plan:digest"))?.at, "2026-11-16T09:12:00+01:00", "Atlas started late: at once");
  const given = now.writes.find((w) => w.entry.kind === "digest")!.entry;
  const after = plan(input(clock("12:00"), [late, today], { settings: s, entries: [given] }));
  assert.ok(!after.planned.some((p) => p.id.startsWith("plan:digest")), "once a day");
});

test("the morning digest stays silent when nothing is due, but the ledger records the day", () => {
  const r = plan(input(clock("09:12"), [], { settings: settingsOf({}) }));
  assert.ok(!r.planned.some((p) => p.id.startsWith("plan:digest")), "no notice saying there is nothing");
  assert.equal(r.writes.find((w) => w.entry.kind === "digest")?.entry.detail, "nothing due");
});

test("the ledger round-trips through its note, newest first, hand lines kept", () => {
  const c = clock("16:48");
  const name = { path: "notes/Thesis.md", title: "Write the introduction", block: "t3f9a" };
  const entries: Entry[] = [
    { at: at("14:05"), kind: "nudged", key: keyOf(name), important: false, detail: "score 2.4 · due tomorrow, ⏫, 50 min free" },
    { at: at("14:21"), kind: "snoozed", key: keyOf(name), until: at("16:30"), detail: "" },
    { at: at("16:48"), kind: "done", key: keyOf(name), detail: "from the notification" },
    { at: at("17:00"), kind: "snoozed", key: "notes/Thesis.md|A | B", until: at("09:00", "2026-11-17"), detail: "" },
  ];
  const lines = entries.map((e) => renderLine(e, c, e.key!.includes("|") ? { path: "notes/Thesis.md", title: "A | B" } : name));
  assert.equal(lines[1], "- 2026-11-16 14:21 · snoozed → 16:30 · [[notes/Thesis#^t3f9a|Write the introduction]]");
  assert.equal(lines[3], "- 2026-11-16 17:00 · snoozed → 2026-11-17 09:00 · [[notes/Thesis|A / B]]");
  let note = add(null, [lines[1], lines[0]], "laptop", "2026-11");
  note = note.replace("---\n- ", "---\nA line of my own.\n- ");
  note = add(note, [lines[3], lines[2]], "laptop", "2026-11");
  assert.ok(note.startsWith("---\ntype: plan-ledger\ndevice: laptop\nmonth: 2026-11\n---\n- 2026-11-16 17:00"), note);
  assert.ok(note.includes("A line of my own."), "a hand line kept");
  const back = parse(note, c);
  assert.deepEqual(back.map((e) => [e.at, e.kind, e.key, e.until, !!e.important, e.detail]), [
    [at("17:00"), "snoozed", "notes/Thesis.md|A / B", at("09:00", "2026-11-17"), false, ""],
    [at("16:48"), "done", keyOf(name), undefined, false, "from the notification"],
    [at("14:21"), "snoozed", keyOf(name), at("16:30"), false, ""],
    [at("14:05"), "nudged", keyOf(name), undefined, false, "score 2.4 · due tomorrow, ⏫, 50 min free"],
  ]);
});

/** `n` #writing tasks done on the days before 2026-11-16 at `hhmm`, with their ledger lines. */
function doneBefore(n: number, hhmm: string): { tasks: Task[]; entries: Entry[] } {
  const tasks: Task[] = [], entries: Entry[] = [];
  for (let i = 0; i < n; i++) {
    const day = `2026-11-${String(15 - i).padStart(2, "0")}`;
    const t = task(`Draft part ${i} ^d${i}`, { done: true, tags: ["writing"], path: "notes/Drafts.md" });
    tasks.push(t);
    entries.push({ at: at(hhmm, day), kind: "done", key: keyOf({ path: t.path, title: t.title, block: t.block }), detail: "from the notification" });
  }
  return { tasks, entries };
}

test("once a kind has 10 done times, its nudge moves to the hour it is usually done, the same day", () => {
  const essay = task("Write the essay 📅 2026-11-19 ^e1", { tags: ["writing"] });
  const known = doneBefore(10, "16:10");
  const r = plan(input(clock("09:00"), [essay, ...known.tasks], { entries: known.entries }));
  const n = r.planned.find((p) => p.id === "plan:notes/Thesis.md#^e1");
  assert.equal(n?.at, "2026-11-16T16:00:00+01:00", JSON.stringify(r.decisions));
  assert.match(n!.body, /you usually finish #writing in the afternoon/);
  assert.deepEqual(r.habits.map((h) => [h.group, h.done, h.hours[16]]), [["#writing", 10, 10]]);
  // nine are not enough: the first gap that holds it
  const few = doneBefore(9, "16:10");
  const r9 = plan(input(clock("09:00"), [essay, ...few.tasks], { entries: few.entries }));
  assert.equal(r9.planned.find((p) => p.id === "plan:notes/Thesis.md#^e1")?.at, "2026-11-16T09:00:00+01:00");
  // another kind is not moved by #writing's habit
  const other = task("Pay the rent 📅 2026-11-19 ^r1", { tags: ["admin"] });
  const ro = plan(input(clock("09:00"), [other, ...known.tasks], { entries: known.entries }));
  assert.equal(ro.planned.find((p) => p.id === "plan:notes/Thesis.md#^r1")?.at, "2026-11-16T09:00:00+01:00");
});

/** #writing tasks done at `hhmm` on each of `days` (`YYYY-MM-DD`), named `prefix…`, with their ledger lines. */
function doneOn(days: string[], hhmm: string, prefix: string): { tasks: Task[]; entries: Entry[] } {
  const tasks: Task[] = [], entries: Entry[] = [];
  days.forEach((day, i) => {
    const t = task(`${prefix} ${i} ^${prefix}${i}`, { done: true, tags: ["writing"], path: "notes/Drafts.md" });
    tasks.push(t);
    entries.push({ at: at(hhmm, day), kind: "done", key: keyOf({ path: t.path, title: t.title, block: t.block }), detail: "ticked" });
  });
  return { tasks, entries };
}

test("the weekday: a kind done at 10 on Mondays and at 16 on other days is nudged at 10 on a Monday, at 16 on a Tuesday", () => {
  const essay = task("Write the essay 📅 2026-11-20 ^e1", { tags: ["writing"] });
  // twelve Mondays before 2026-11-16 (a Monday) at 10:10; the ten days before it at 16:10 (one of them a Tuesday)
  const mondays = doneOn(Array.from({ length: 12 }, (_, w) => new Date(Date.UTC(2026, 10, 9 - 7 * w)).toISOString().slice(0, 10)), "10:10", "mon");
  const others = doneOn(Array.from({ length: 10 }, (_, i) => `2026-11-${String(15 - i).padStart(2, "0")}`).filter((d) => d !== "2026-11-09"), "16:10", "day");
  const tasks = [essay, ...mondays.tasks, ...others.tasks], entries = [...mondays.entries, ...others.entries];
  const at = (day: string) => plan(input(clock("09:00", day), tasks, { entries })).planned.find((p) => p.id === "plan:notes/Thesis.md#^e1")?.at;
  assert.equal(at("2026-11-16"), "2026-11-16T10:00:00+01:00", "a Monday: the Mondays' hour");
  assert.equal(at("2026-11-17"), "2026-11-17T16:00:00+01:00", "a Tuesday: the every-day hour, the Mondays' habit left to Mondays");
});

test("a habit never moves a nudge to another day, nor into busy time", () => {
  const essay = task("Write the essay 📅 2026-11-19 ^e1", { tags: ["writing"] });
  const known = doneBefore(12, "16:10");
  const r = plan(input(clock("09:00"), [essay, ...known.tasks], { entries: known.entries, busy: [busy("15:00", "18:00")] }));
  const n = r.planned.find((p) => p.id === "plan:notes/Thesis.md#^e1");
  assert.equal(n?.at.slice(0, 10), "2026-11-16");
  assert.ok(!/^2026-11-16T1[5-7]/.test(n!.at), n!.at);
  // its kind's tag first, else its folder
  assert.equal(groupOf({ path: "notes/thesis/Intro.md", tags: [] }), "notes/thesis/");
  assert.equal(groupOf({ path: "Top.md", tags: ["Writing", "x"] }), "#writing");
});

test("fatigue: a nudge in the hour before lowers the score of the next one", () => {
  const s = settingsOf({ digest: false, threshold: 1.8 });
  const big = task("Finish the referee report ⏫ 📅 2026-11-23 ^b1"); // ⏫ × due in 7 days: 2
  const other = { path: "notes/Other.md", title: "Other", block: "o1" };
  const before: Entry = { at: at("08:50"), kind: "nudged", key: keyOf(other), important: true, detail: "" };
  const r = plan(input(clock("09:00"), [big], { settings: s, entries: [before] }));
  // 2 × 0.8 = 1.6 below 1.8 until 08:50's nudge is an hour old
  assert.equal(r.planned.find((p) => p.id === "plan:notes/Thesis.md#^b1")?.at, "2026-11-16T10:00:00+01:00");
});

test("a dismissal: × 0.6 that day; three of the same line in three days pause the task until it changes or comes due", () => {
  const dismissed = (hhmm: string, day: string, text = intro.text): Entry => ({ at: at(hhmm, day), kind: "dismissed", key: keyOf(intro), detail: `line ${lineMark(text)}` });
  // one this morning: 3.2 × 0.6
  const once = plan(input(clock("15:00"), [intro], { entries: [dismissed("09:00", "2026-11-16")] }));
  assert.equal(once.decisions[0].score, 1.9);
  assert.equal(plan(input(clock("15:00"), [intro], { entries: [dismissed("09:00", "2026-11-15")] })).decisions[0].score, 3.2, "yesterday's does not weigh today");

  const three = ["2026-11-14", "2026-11-15", "2026-11-16"].map((d) => dismissed("09:00", d));
  assert.equal(three.length, DISMISS_PAUSE);
  const paused = plan(input(clock("15:00"), [intro], { entries: three }));
  assert.deepEqual(paused.planned, []);
  assert.match(paused.decisions[0].why, /^paused: dismissed 3 times since 2026-11-14/);

  // the line edited since (another date): the old dismissals are about another version of it
  const edited = three.map((e) => ({ ...e, detail: `line ${lineMark("Write the introduction ⏫ 📅 2026-11-19")}` }));
  assert.equal(plan(input(clock("15:00"), [intro], { entries: edited })).planned.length, 1);
  // a block id given since is no edit
  assert.equal(lineMark("Write the introduction ⏫ 📅 2026-11-17"), lineMark(intro.text));
  // due today: back
  const today = task("Write the introduction ⏫ 📅 2026-11-16 ^t3f9a");
  const marked = three.map((e) => ({ ...e, detail: `line ${lineMark(today.text)}` }));
  assert.equal(plan(input(clock("15:00"), [today], { entries: marked })).planned.length, 1);
  // older than three days: two left, not paused
  const old = [dismissed("09:00", "2026-11-12"), ...three.slice(1)];
  assert.equal(plan(input(clock("15:00"), [intro], { entries: old })).planned.length, 1);
});

test("a dismissal's ledger line round-trips with its line mark", () => {
  const c = clock("15:00");
  const e: Entry = { at: at("14:58"), kind: "dismissed", key: keyOf(intro), detail: `line ${lineMark(intro.text)}` };
  const line = renderLine(e, c, { path: intro.path, title: intro.title, block: intro.block });
  assert.equal(line, `- 2026-11-16 14:58 · dismissed · [[notes/Thesis#^t3f9a|Write the introduction]] · line ${lineMark(intro.text)}`);
  const back = parse(line, c)[0];
  assert.equal(back.kind, "dismissed");
  assert.equal(markOf(back), lineMark(intro.text));
});

test("presence: no one at this device for 30 min weighs a nudge now by 0.6, not the moments after; unknown weighs nothing", () => {
  const essay = task("Draft the essay 📅 2026-11-19 ^e55a"); // 1 × (1 + 4/14) = 1.3
  const at10 = "2026-11-16T10:00:00+01:00", at1015 = "2026-11-16T10:15:00+01:00";
  const decided = (activeAt: number | null | undefined) => plan(input(clock("10:00"), [essay], { activeAt })).decisions[0];
  assert.equal(decided(undefined).at, at10, "presence unknown: now");
  assert.equal(decided(at("09:45")).at, at10, "used 15 min ago: now");
  const away = decided(at("09:10"));
  assert.equal(away.at, at1015, "away 50 min: 0.8 is under the threshold now; the next moment is not weighed");
  assert.equal(away.score, 1.3);
  const held = plan(input(clock("10:00"), [essay], { activeAt: at("09:10"), settings: settingsOf({ digest: false, threshold: 1.2 }) }));
  assert.equal(held.decisions[0].at, at1015);
  const urgent = plan(input(clock("10:00"), [intro], { activeAt: at("08:00") })).decisions[0];
  assert.equal(urgent.at, at10, "3.2 × 0.6 still passes: an urgent task rings whoever is there");
  assert.equal(urgent.score, 1.9);
  const nudged = plan(input(clock("10:00"), [essay], { activeAt: at("09:10") })).writes;
  assert.equal(nudged.length, 0, "nothing recorded while held");
});

/** A `used` line for each of the `n` days before 2026-11-16, its hours `from` to `to` (end excluded). */
function usedDays(n: number, from: number, to: number): Entry[] {
  const c = clock("12:00");
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  return Array.from({ length: n }, (_, i) => parse(`- ${addDays("2026-11-16", -1 - i)} 23:59 · used · ${hoursText(hours)}`, c)[0]);
}

test("a day's use is one ledger line of hour ranges, read back as its hours", () => {
  const c = clock("12:00");
  assert.equal(hoursText([21, 8, 9, 10, 23, 14, 9]), "08:00–11:00, 14:00–15:00, 21:00–22:00, 23:00–24:00");
  assert.deepEqual(hoursOf("08:00–11:00, 14:00–15:00, 23:00–24:00"), [8, 9, 10, 14, 23]);
  const line = renderLine({ at: at("23:59", "2026-11-15"), kind: "used", detail: hoursText([8, 9]) }, c);
  assert.equal(line, "- 2026-11-15 23:59 · used · 08:00–10:00");
  const [e] = parse(line, c);
  assert.equal(e.kind, "used", "a line about no task, as the digest");
  assert.equal(e.key, undefined);
  assert.deepEqual(hoursOf(e.detail), [8, 9]);
  assert.equal(measure(usedDays(20, 8, 23), settingsOf({}), c).measured, false, "days of use are not days of nudging: the budget is not measured from them");
});

test("quiet hours measured: the longest run of hours unused on 80 % of 14 days or more, ticks counting as use", () => {
  const c = clock("12:00");
  assert.deepEqual(quietOf(usedDays(13, 8, 23), c), { from: null, to: null, days: 13, measured: false, used: false }, "13 days: not yet");
  const q = quietOf(usedDays(20, 8, 23), c);
  assert.deepEqual([q.from, q.to, q.days, q.measured], [23 * 60, 8 * 60, 20, true], "23:00–08:00, across midnight");
  // a laptop used 8–18 and a phone used 18–23 on the same days: the union is what counts
  const two = quietOf([...usedDays(15, 8, 18), ...usedDays(15, 18, 23)], c);
  assert.deepEqual([two.from, two.to, two.days], [23 * 60, 8 * 60, 15]);
  // a tick at 23:30 on 4 days of 20 (20 %): still quiet; on 5 (25 %): 23:00 is in use
  const ticks = (n: number) => Array.from({ length: n }, (_, i) => ({ at: at("23:30", addDays("2026-11-16", -1 - i)), kind: "done" as const, key: "notes/a.md|x", detail: "" }));
  assert.equal(quietOf([...usedDays(20, 8, 23), ...ticks(4)], c).from, 23 * 60);
  assert.equal(quietOf([...usedDays(20, 8, 23), ...ticks(5)], c).from, 0);
  // lines older than 28 days, and today's, are not counted
  const old = Array.from({ length: 20 }, (_, i) => parse(`- ${addDays("2026-11-16", -30 - i)} 23:59 · used · 08:00–23:00`, c)[0]);
  assert.equal(quietOf(old, c).days, 0);
  // in use every hour: nothing proposed
  assert.equal(quietOf(usedDays(20, 0, 24), c).from, null);
});

test("the measured quiet hours replace Settings' range only with `quiet_measured` on", () => {
  const long = task("Write the introduction ⏫ 📅 2026-11-17 ⏱ 45m ^t3f9a");
  const entries = usedDays(20, 8, 23);
  const off = plan(input(clock("22:00"), [long], { entries }));
  assert.equal(off.planned[0].at, "2026-11-17T08:00:00+01:00", "22:30 is quiet: 30 min do not hold 45");
  assert.deepEqual([off.quiet.from, off.quiet.used], [23 * 60, false], "proposed, not used");
  const on = plan(input(clock("22:00"), [long], { entries, settings: settingsOf({ digest: false, quiet_measured: true }) }));
  assert.equal(on.planned[0].at, "2026-11-16T22:00:00+01:00", "quiet from 23:00: an hour free now");
  assert.equal(on.quiet.used, true);
  const early = plan(input(clock("22:00"), [long], { entries: usedDays(5, 8, 23), settings: settingsOf({ digest: false, quiet_measured: true }) }));
  assert.equal(early.planned[0].at, "2026-11-17T08:00:00+01:00", "too few days: Settings' range holds");
});
