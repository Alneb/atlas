// The helper against a stand-in core: the plan tool reads tasks, the calendar and the ledgers and writes this device's
// ledger; a device that does not run the schedules plans nothing; Done ticks through the core's tick path and Snooze
// gives the task a block id and records the promise, which the next plan keeps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, Status } from "atlas-helper/testing";
import { instant, fixedClock } from "./time";
import "./helper";

const OFFSET = 60;
const at = (hhmm: string) => instant("2026-11-16", Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), fixedClock(0, OFFSET));

/** A core: notes as text (tasks read from them the way the core lists them), a device, a calendar. */
function core(files: Record<string, string>, o: { schedules?: boolean; events?: unknown[] } = {}) {
  const posted: { path: string; body: any }[] = [];
  const listed = () => Object.entries(files).filter(([p]) => p.startsWith("notes/")).flatMap(([path, text]) => text.split("\n").flatMap((l, i) => {
    const m = /^- \[( |x)\] (.*)$/.exec(l);
    if (!m) return [];
    const block = /\^(\w+)$/.exec(m[2])?.[1] ?? null;
    const title = m[2].replace(/⏫|📅 \S+|✅ \S+|\^\w+$/gu, "").replace(/\s+/g, " ").trim();
    return [{ path, line: i + 1, text: m[2], done: m[1] === "x", title, due: /📅 (\S+)/.exec(m[2])?.[1] ?? null, priority: m[2].includes("⏫") ? "high" : "normal", tags: [], block }];
  }));
  harness.api = (verb, path, body) => {
    const [route, query = ""] = path.split("?");
    const q = Object.fromEntries(query.split("&").filter(Boolean).map((kv) => kv.split("=").map(decodeURIComponent)));
    if (route === "/api/device") return { name: "laptop", schedules: o.schedules ?? true };
    if (route === "/api/tasks") return { tasks: listed().filter((t) => q.status === "all" || !t.done) };
    if (route === "/api/plugins/@calendar/helper") return { events: o.events ?? [] };
    if (route === "/api/exists") return q.path in files;
    if (route === "/api/tree") return Object.keys(files).filter((p) => p.startsWith(`${q.path}/`)).map((p) => ({ name: p.slice(q.path.length + 1), path: p, kind: "file" }));
    if (route === "/api/file" && verb === "GET") {
      if (!(q.path in files)) throw new Status(404, "no such file");
      return { path: q.path, text: files[q.path] };
    }
    if (route === "/api/file" && verb === "PUT") return void (files[body.path] = body.text);
    posted.push({ path: route, body });
    if (route === "/api/task/tick") {
      const lines = files[body.path].split("\n");
      const n = body.block ? lines.findIndex((l) => l.endsWith(`^${body.block}`)) : body.line - 1;
      if (!lines[n]?.startsWith("- [ ]")) throw new Status(409, "changed");
      lines[n] = lines[n].replace("- [ ]", "- [x]") + " ✅ 2026-11-16";
      files[body.path] = lines.join("\n");
      return null;
    }
    if (route === "/api/task/block") {
      const lines = files[body.path].split("\n");
      lines[body.line - 1] += " ^tnew1";
      files[body.path] = lines.join("\n");
      return { block: "tnew1" };
    }
    throw new Status(404, `no ${verb} ${route}`);
  };
  return { files, posted };
}

const LEDGER = "plan/ledger/2026-11 laptop.md";
const call = (method: string, hhmm: string, more: Record<string, unknown> = {}) =>
  harness.call(method, { now: at(hhmm), offset: OFFSET, settings: { digest: false }, ...more });

test("the plan tool plans around the calendar and records what has come due in this device's ledger", async () => {
  const c = core({ "notes/Thesis.md": "# Thesis\n- [ ] Write the introduction ⏫ 📅 2026-11-17 ^t3f9a\n" }, {
    events: [
      { start: "2026-11-16T10:00:00+01:00", end: "2026-11-16T11:00:00+01:00", all_day: false, free: false },
      { start: "2026-11-16", end: "2026-11-17", all_day: true, free: false },
      { start: "2026-11-16T11:00:00+01:00", end: "2026-11-16T12:00:00+01:00", all_day: false, free: true },
    ],
  });
  const later = await call("nudges", "10:00");
  assert.deepEqual(later.planned.map((p: any) => p.at), ["2026-11-16T11:00:00+01:00"], "after the busy hour; all-day and free events do not count");
  assert.ok(!(LEDGER in c.files), "nothing due yet: nothing written");
  const now = await call("nudges", "11:00");
  assert.equal(now.planned[0].at, "2026-11-16T11:00:00+01:00");
  assert.match(c.files[LEDGER], /^---\ntype: plan-ledger\ndevice: laptop\nmonth: 2026-11\n---\n- 2026-11-16 11:00 · nudged · \[\[notes\/Thesis#\^t3f9a\|Write the introduction\]\] · important · score 3\.2/);
  await call("nudges", "11:04");
  assert.equal(c.files[LEDGER].split("nudged").length, 2, "asked again while it rings: written once");
});

test("a device that does not run the vault's schedules does not nudge", async () => {
  core({ "notes/Thesis.md": "- [ ] Write the introduction ⏫ 📅 2026-11-17\n" }, { schedules: false });
  const r = await call("nudges", "10:00");
  assert.deepEqual(r.planned, []);
  assert.match(r.summary, /does not nudge/);
});

test("Done ticks the task through the core and records it; the nudge is withdrawn", async () => {
  const c = core({ "notes/Thesis.md": "# Thesis\n- [ ] Write the introduction ⏫ 📅 2026-11-17 ^t3f9a\n" });
  const r = await call("pressed", "11:10", { notice_id: "plan:notes/Thesis.md#^t3f9a", action: "done" });
  assert.deepEqual(r, { withdraw: ["plan:notes/Thesis.md#^t3f9a"] });
  assert.deepEqual(c.posted, [{ path: "/api/task/tick", body: { path: "notes/Thesis.md", line: 2, text: "Write the introduction ⏫ 📅 2026-11-17 ^t3f9a", block: "t3f9a" } }]);
  assert.ok(c.files["notes/Thesis.md"].includes("- [x] Write the introduction"));
  assert.match(c.files[LEDGER], /- 2026-11-16 11:10 · done · \[\[notes\/Thesis#\^t3f9a\|Write the introduction\]\] · from the notification/);
  // the same press again (a second device's button, a double tap): already done, nothing ticked twice
  c.posted.length = 0;
  await call("pressed", "11:11", { notice_id: "plan:notes/Thesis.md#^t3f9a", action: "done" });
  assert.deepEqual(c.posted, []);
  // and the plan no longer has it
  assert.deepEqual((await call("nudges", "11:12")).planned, []);
});

test("Snooze gives the task a block id, records the promise, and the plan keeps it", async () => {
  const c = core({ "notes/Home.md": "- [ ] Call the bank 📅 2026-11-20\n" });
  const r = await call("pressed", "10:05", { notice_id: "plan:notes/Home.md|Call the bank", action: "snooze:2026-11-16T16:30" });
  assert.deepEqual(r, { withdraw: ["plan:notes/Home.md|Call the bank"] });
  assert.equal(c.files["notes/Home.md"], "- [ ] Call the bank 📅 2026-11-20 ^tnew1\n", "an id, for the action the user took");
  assert.match(c.files[LEDGER], /- 2026-11-16 10:05 · snoozed → 16:30 · \[\[notes\/Home#\^tnew1\|Call the bank\]\]/);
  const p = await call("nudges", "10:10");
  assert.deepEqual(p.planned.map((x: any) => [x.id, x.at]), [["plan:notes/Home.md#^tnew1", "2026-11-16T16:30:00+01:00"]]);
});

test("explain gives the budget, the decisions and the ledger's last lines, and writes nothing", async () => {
  const c = core({ "notes/Thesis.md": "- [ ] Write the introduction ⏫ 📅 2026-11-17 ^t3f9a\n", [LEDGER]: "---\ntype: plan-ledger\n---\n- 2026-11-16 08:00 · digest · nothing due\n" });
  const r = await call("explain", "10:00");
  assert.deepEqual(r.budget, { perDay: 6, gap: 45, measured: false, days: 1, nudges: 0, acted: 0 });
  assert.equal(r.decisions[0].title, "Write the introduction");
  assert.deepEqual(r.recent, ["- 2026-11-16 08:00 · digest · nothing due"]);
  assert.ok(!c.files[LEDGER].includes("nudged"), "explaining records nothing");
});
