// Habits (habits.ts) on a fixed clock (Monday 2026-11-16, UTC+1): a note's rule with its preset, the one-line setup,
// and the nags — the next one planned, one recorded when its moment came, none once done or skipped, a window across
// midnight.
import { test } from "node:test";
import assert from "node:assert/strict";
import { daysOf, habitKeyOf, habitNameOf, habitPlan, ruleOf, setupOf, windowOf } from "./habits";
import { keyOf, type Entry } from "./ledger";
import { fixedClock, instant, type Clock } from "./time";

const OFFSET = 60;
const at = (hhmm: string, day = "2026-11-16") => instant(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), fixedClock(0, OFFSET));
const clock = (hhmm: string, day = "2026-11-16"): Clock => fixedClock(at(hhmm, day), OFFSET);

const gym = ruleOf("habits/Gym.md", { habit: "gym" })!;
const key = keyOf({ path: "habits/Gym.md", title: "Gym" });

test("a habit note's rule: its preset, what the note says over it, paused is none", () => {
  assert.deepEqual(gym, { path: "habits/Gym.md", kind: "gym", title: "Gym", days: ["mon", "wed", "fri"], from: 17 * 60, to: 20 * 60, nag: 30 });
  assert.deepEqual(ruleOf("h/Read.md", { habit: "read", days: ["sat", "sun"], window: "21:00-22:30", nag: 20 }), { path: "h/Read.md", kind: "read", title: "Read", days: ["sun", "sat"], from: 21 * 60, to: 22 * 60 + 30, nag: 20 });
  assert.equal(ruleOf("h/Read.md", { habit: "read", at: "07:15" })!.from, 7 * 60 + 15, "`at` starts the preset's length");
  assert.equal(ruleOf("h/Gym.md", { habit: "gym", paused: true }), null);
  assert.equal(ruleOf("notes/x.md", { title: "x" }), null);
  assert.deepEqual(windowOf("23:30-00:30"), { from: 23 * 60 + 30, to: 24 * 60 + 30 }, "across midnight");
  assert.deepEqual(daysOf("weekdays"), ["mon", "tue", "wed", "thu", "fri"]);
  assert.equal(daysOf("evening"), null, "a word that is not a day");
});

test("one line sets a habit up: its kind, days and time; anything else is not one", () => {
  const g = setupOf("habit gym mon wed fri 18:00")!;
  assert.equal(g.name, "Gym");
  assert.equal(g.text, "---\nhabit: gym\ndays: [mon, wed, fri]\nwindow: \"18:00-21:00\"\n---\nNagged in its window until done; Done or Skip today on the notification (Plan).\n");
  assert.match(setupOf("habit sleep 23:30")!.text, /window: "23:30-00:30"/);
  const walk = setupOf("- [ ] habit evening walk daily 19:00-19:45")!;
  assert.equal(walk.name, "Evening walk");
  assert.match(walk.text, /days: \[sun, mon, tue, wed, thu, fri, sat\]\nwindow: "19:00-19:45"/);
  assert.equal(setupOf("habitual thinking"), null);
  assert.equal(setupOf("habit mon 18:00"), null, "a day before any name");
  assert.equal(setupOf("call the gym about the habit"), null);
});

test("nags: the next one planned; one recorded when its moment came; the one ringing kept until the next", () => {
  const before = habitPlan([gym], [], clock("16:00"));
  assert.deepEqual(before.planned.map((p) => p.at), ["2026-11-16T17:00:00+01:00"], "the next nag only");
  assert.deepEqual(before.writes, []);
  assert.equal(habitKeyOf(before.planned[0].id), key);
  assert.deepEqual(habitNameOf(key), { path: "habits/Gym.md", title: "Gym" });
  assert.deepEqual(before.planned[0].actions.map((a) => a.id), ["done", "skip", "atlas:open"]);

  const ringing = habitPlan([gym], [], clock("17:10"));
  assert.deepEqual(ringing.planned.map((p) => [p.at, p.until]), [["2026-11-16T17:00:00+01:00", "2026-11-16T17:30:00+01:00"], ["2026-11-16T17:30:00+01:00", "2026-11-16T18:00:00+01:00"]]);
  assert.equal(ringing.writes.length, 1);
  assert.deepEqual([ringing.writes[0].entry.kind, ringing.writes[0].entry.at, ringing.writes[0].entry.important], ["nudged", at("17:00"), true], "outside the budget");

  const nudged: Entry = { ...ringing.writes[0].entry, line: "" };
  assert.deepEqual(habitPlan([gym], [nudged], clock("17:12")).writes, [], "recorded once");
  const done: Entry = { at: at("17:20"), kind: "done", key, detail: "habit", line: "" };
  assert.deepEqual(habitPlan([gym], [nudged, done], clock("17:25")).planned.filter((p) => p.at.startsWith("2026-11-16")), [], "done: no more nags today");
  const skipped: Entry = { at: at("17:20"), kind: "dismissed", key, detail: "habit · skipped today", line: "" };
  assert.deepEqual(habitPlan([gym], [nudged, skipped], clock("17:25")).planned.filter((p) => p.at.startsWith("2026-11-16")), []);
});

test("a day the habit does not keep plans only the next day that does; a window across midnight rings past it", () => {
  // Tuesday: no gym; Wednesday's first nag is within the day and a half
  assert.deepEqual(habitPlan([gym], [], clock("17:10", "2026-11-17")).planned.map((p) => p.at), ["2026-11-18T17:00:00+01:00"]);
  const sleep = ruleOf("habits/Sleep.md", { habit: "sleep", window: "23:30-00:30" })!;
  const r = habitPlan([sleep], [], clock("00:20", "2026-11-17"));
  assert.ok(r.planned.some((p) => p.at === "2026-11-17T00:15:00+01:00"), JSON.stringify(r.planned.map((p) => p.at)));
  assert.equal(r.writes.length, 1, "Monday night's nag, rung after midnight");
});
