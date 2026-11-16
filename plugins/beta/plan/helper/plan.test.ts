// The planner on a fixed clock (Monday 2026-11-16, UTC+1) with a fake calendar: a due-tomorrow ⏫ task nudged at the
// first gap that holds it, never in quiet hours, never twice in a window; done never nudged (a ticked line, a vanished
// line, a recurring task's ticked occurrence); a snooze honoured; the budget measured and kept; the ledger's text
// round-tripping.
import { test } from "node:test";
import assert from "node:assert/strict";
import { add, keyOf, parse, renderLine, type Entry } from "./ledger";
import { judge, measure, minutesOf, plan, settingsOf, type Busy, type Input, type Task } from "./plan";
import { fixedClock, instant, MIN, type Clock } from "./time";

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
