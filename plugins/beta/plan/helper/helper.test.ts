// The helper against a stand-in core: the plan tool reads tasks, the calendar and the ledgers and writes this device's
// ledger and its plan to plan/next.md; a device that does not run the schedules plans only while that plan is missing
// or stale; Done ticks through the core's tick path and Snooze
// gives the task a block id and records the promise, which the next plan keeps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, Status } from "atlas-helper/testing";
import { instant, fixedClock } from "./time";
import { forgetUsed } from "./helper";

const OFFSET = 60;
const at = (hhmm: string) => instant("2026-11-16", Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), fixedClock(0, OFFSET));

/** A core: notes as text (tasks read from them the way the core lists them), a device, a calendar. */
function core(files: Record<string, string>, o: { schedules?: boolean; events?: unknown[]; activeAt?: number; devices?: unknown[]; person?: boolean; origin?: string | null; noSend?: boolean; noCalendar?: boolean; habits?: { path: string; values: unknown[] }[] } = {}) {
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
    if (route === "/api/device") return { name: o.person === false ? "server" : "laptop", schedules: o.schedules ?? true, person: o.person ?? true, active_at: o.activeAt ?? null, devices: o.devices ?? [] };
    if (route === "/api/tasks") return { tasks: listed().filter((t) => q.status === "all" || !t.done) };
    if (route.startsWith("/api/plugins/@calendar/") && o.noCalendar) throw new Status(404, "no plugin with the calendar role");
    if (route === "/api/plugins/@calendar/helper") return { events: o.events ?? [] };
    if (route === "/api/exists") return q.path in files;
    if (route === "/api/base/query") {
      if (!o.habits) throw new Status(404, "no base");
      return { views: [{ columns: ["habit", "days", "window", "at", "nag", "paused"].map((key) => ({ key })), rows: o.habits }] };
    }
    if (route === "/api/tree") return Object.keys(files).filter((p) => p.startsWith(`${q.path}/`)).map((p) => ({ name: p.slice(q.path.length + 1), path: p, kind: "file" }));
    if (route === "/api/file" && verb === "GET") {
      if (!(q.path in files)) throw new Status(404, "no such file");
      return { path: q.path, text: files[q.path] };
    }
    if (route === "/api/file" && verb === "PUT") return void (files[body.path] = body.text);
    posted.push({ path: route, body });
    if (route === "/api/plugins/plan/hooks/sign") {
      const token = `${Buffer.from(JSON.stringify(body.data)).toString("base64url")}.sig`;
      return { token, path: `/v/work/api/plugins/plan/hook/${body.hook}?t=${token}`, origin: o.origin === undefined ? "https://atlas.example.org" : o.origin };
    }
    if (route === "/api/plugins/notifications/tools/send") {
      if (o.noSend) throw new Status(404, "no plugin notifications");
      return { sent: true, through: "ntfy", buttons: body.actions?.length ?? 0 };
    }
    if (route === "/api/task/tick") {
      const lines = files[body.path].split("\n");
      const n = body.block ? lines.findIndex((l) => l.endsWith(`^${body.block}`)) : body.line - 1;
      if (!lines[n]?.startsWith("- [ ]")) throw new Status(409, "changed");
      lines[n] = lines[n].replace("- [ ]", "- [x]") + " ✅ 2026-11-16";
      files[body.path] = lines.join("\n");
      return null;
    }
    if (route === "/api/plugins/@calendar/tools/time_block") {
      const lines = files[body.task.path].split("\n");
      lines[body.task.line - 1] += " ⏳ 2026-11-16 ^tnew1";
      files[body.task.path] = lines.join("\n");
      return { block: "tnew1", label: "Mon 16:30", note: "calendar/2026/2026-11-16 Call the bank.md" };
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

const NEXT = "plan/next.md";
const nextNote = (device: string, at: string) => `---\ntype: plan-next\ndevice: ${device}\nplanned_at: 2026-11-16 ${at}\n---\n- nothing planned\n`;

test("the planner writes its plan to plan/next.md: again when it changes or is an hour old, not otherwise", async () => {
  const c = core({ "notes/Thesis.md": "- [ ] Write the introduction ⏫ 📅 2026-11-17 ^t3f9a\n" }, { events: [{ start: "2026-11-16T10:00:00+01:00", end: "2026-11-16T11:00:00+01:00" }] });
  await call("nudges", "10:00");
  assert.equal(c.files[NEXT], [
    "---", "type: plan-next", "device: laptop", "planned_at: 2026-11-16 10:00", "---",
    "The next nudges, as planned by laptop. Written by the Plan plugin each time the plan changes; edits are replaced.", "",
    "- 2026-11-16 11:00 · [[notes/Thesis#^t3f9a|Write the introduction]] · due tomorrow, ⏫, free until 22:30", "",
  ].join("\n"));
  await call("nudges", "10:30");
  assert.match(c.files[NEXT], /planned_at: 2026-11-16 10:00/, "unchanged within the hour: not written");
  c.files["notes/Thesis.md"] = "- [x] Write the introduction ⏫ 📅 2026-11-17 ^t3f9a ✅ 2026-11-16\n";
  await call("nudges", "10:35");
  assert.match(c.files[NEXT], /planned_at: 2026-11-16 10:35\n[\s\S]*- nothing planned/, "changed: written");
  await call("nudges", "11:20");
  assert.match(c.files[NEXT], /planned_at: 2026-11-16 10:35/);
  await call("nudges", "11:35");
  assert.match(c.files[NEXT], /planned_at: 2026-11-16 11:35/, "an hour old: written, so its age means the planner is alive");
  c.files[NEXT] = nextNote("desktop", "11:30");
  await call("nudges", "11:40");
  assert.match(c.files[NEXT], /device: desktop/, "another planner's fresh note is left to it: one writer");
});

test("a device that does not run the schedules nudges only while the planner's plan is missing or 2 hours old", async () => {
  const c = core({ "notes/Thesis.md": "- [ ] Write the introduction ⏫ 📅 2026-11-17\n", [NEXT]: nextNote("desktop", "09:30") }, { schedules: false });
  const r = await call("nudges", "10:00");
  assert.deepEqual(r.planned, []);
  assert.match(r.summary, /does not nudge/);
  assert.equal((await call("explain", "10:00")).local, null);
  const late = await call("nudges", "11:30");
  assert.equal(late.planned.length, 1, "the planner is silent for 2 hours: this device plans for itself");
  assert.match(late.summary, /local plan: desktop last planned 2026-11-16 09:30/);
  assert.match(c.files[LEDGER], /· nudged · .* · score 3\.2 · due tomorrow, ⏫, free until 22:30 · \(local plan\)\n/);
  assert.match(c.files[NEXT], /device: desktop/, "only the planner writes the plan");
  const again = await call("nudges", "11:35");
  assert.equal(again.planned[0].body, "due tomorrow, ⏫, free until 22:30", "while it rings, its reasons without the mark");
  delete c.files[NEXT];
  assert.match((await call("explain", "11:40")).local, /no device has written the plan/);
});

test("the device rule: nudges ring on the computer used in the last 5 minutes, else on a phone running Atlas", async () => {
  const dev = (id: string, kind: string, used: string | null, here = false, reported = "10:00") =>
    ({ id, name: id, kind, active_at: used && at(used), reported_at: at(reported), here });
  const notes = { "notes/Thesis.md": "- [ ] Write the introduction ⏫ 📅 2026-11-17\n" };
  // the planner (this laptop), while the person is at the desktop: it plans and writes plan/next.md, rings nothing
  let c = core({ ...notes }, { devices: [dev("laptop", "desktop", "09:30", true), dev("desktop", "desktop", "09:58")] });
  let r = await call("nudges", "10:00");
  assert.deepEqual(r.planned, []);
  assert.match(r.summary, /nudges ring on desktop: desktop was used at 09:58/);
  assert.match(c.files[NEXT], /device: laptop/, "the planner writes its plan whoever rings");
  assert.equal(c.files[LEDGER], undefined, "and records no nudge it did not ring");
  // the desktop, which does not run the schedules: it is the one, so it plans and rings, and says why
  c = core({ ...notes, [NEXT]: nextNote("laptop", "09:55") }, { schedules: false, devices: [dev("laptop", "desktop", "09:30"), dev("desktop", "desktop", "09:58", true)] });
  r = await call("nudges", "10:00");
  assert.equal(r.planned.length, 1, "a fresh plan of the planner does not stop the device the person is at");
  assert.match(r.summary, /local plan: you are at it \(desktop was used at 09:58\)/);
  // no computer used for 5 min: the phone running Atlas rings, not the planner
  c = core({ ...notes }, { devices: [dev("laptop", "desktop", "09:50", true), dev("phone", "phone", "09:59", false, "09:59")] });
  r = await call("nudges", "10:00");
  assert.deepEqual(r.planned, []);
  assert.match(r.summary, /nudges ring on phone: no computer used for 5 min; phone runs Atlas/);
  // a phone silent for 10 min is not running Atlas: no pick, the planner rings as without the rule
  c = core({ ...notes }, { devices: [dev("laptop", "desktop", "09:50", true), dev("phone", "phone", "09:30", false, "09:49")] });
  r = await call("nudges", "10:00");
  assert.equal(r.planned.length, 1);
  assert.equal((await call("explain", "10:00")).at, null);
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

test("Block time-blocks the task through the calendar, and the nudges wait for the block's end", async () => {
  const c = core({ "notes/Home.md": "- [ ] Call the bank 📅 2026-11-20\n" });
  const offered = (await call("nudges", "10:00")).planned;
  assert.ok(offered.length && offered.every((x: any) => x.actions.some((a: any) => a.id.startsWith("block:"))), "a calendar is there: Block offered");
  const r = await call("pressed", "10:05", { notice_id: "plan:notes/Home.md|Call the bank", action: "block:2026-11-16T16:30+30" });
  assert.deepEqual(r, { withdraw: ["plan:notes/Home.md|Call the bank"] });
  assert.deepEqual(c.posted.find((x) => x.path.endsWith("/time_block"))?.body, { title: "Call the bank", start: "2026-11-16T16:30", end: "2026-11-16T17:00", task: { path: "notes/Home.md", line: 1, text: "Call the bank 📅 2026-11-20" } });
  assert.match(c.files[LEDGER], /- 2026-11-16 10:05 · snoozed → 17:00 · \[\[notes\/Home#\^tnew1\|Call the bank\]\] · time-blocked · Mon 16:30/);
  // no calendar plugin: no Block button
  core({ "notes/Home.md": "- [ ] Call the bank 📅 2026-11-20\n" }, { noCalendar: true });
  const none = (await call("nudges", "10:00")).planned;
  assert.ok(none.length && none.every((x: any) => !x.actions.some((a: any) => a.id.startsWith("block:"))));
});

test("a habit note is nagged in its window; Done records it and takes every nag away; a capture line makes one", async () => {
  const c = core({}, { habits: [{ path: "habits/Gym.md", values: ["gym", ["mon", "wed", "fri"], "17:00-20:00", null, null, null] }] });
  const r = await call("nudges", "17:10");
  const nag = r.planned.find((x: any) => x.id.startsWith("plan:habit:"));
  assert.equal(nag?.title, "Gym");
  assert.match(c.files[LEDGER], /- 2026-11-16 17:00 · nudged · \[\[habits\/Gym\|Gym\]\] · important · habit gym · nag 1\n/);
  const pressed = await call("pressed", "17:20", { notice_id: nag.id, action: "done" });
  assert.deepEqual(pressed, { withdraw: [nag.id, "habits/Gym.md#habit"] });
  assert.match(c.files[LEDGER], /- 2026-11-16 17:20 · done · \[\[habits\/Gym\|Gym\]\] · habit · from the notification/);
  assert.ok(!(await call("nudges", "17:31")).planned.some((x: any) => x.id.startsWith("plan:habit:") && x.at.startsWith("2026-11-16")), "done: no more nags today");

  const made = await call("capture", "18:00", { text: "habit read daily 21:00-22:00" });
  assert.equal(made.path, "habits/Read.md");
  assert.match(c.files["habits/Read.md"], /^---\nhabit: read\ndays: \[sun, mon, tue, wed, thu, fri, sat\]\nwindow: "21:00-22:00"\n---\n/);
  assert.match((await call("capture", "18:01", { text: "habit read daily 21:00-22:00" })).notice, /already has its note/, "made once");
  assert.deepEqual(await call("capture", "18:02", { text: "buy milk" }), { skipped: "no habit line" });
});

test("a dismissal is recorded with the line's mark; nothing is ticked or given an id", async () => {
  const c = core({ "notes/Home.md": "- [ ] Call the bank 📅 2026-11-20\n" });
  const r = await call("pressed", "10:05", { notice_id: "plan:notes/Home.md|Call the bank", action: "atlas:dismissed" });
  assert.deepEqual(r, { withdraw: ["plan:notes/Home.md|Call the bank"] });
  assert.deepEqual(c.posted, []);
  assert.match(c.files[LEDGER], /- 2026-11-16 10:05 · dismissed · \[\[notes\/Home\|Call the bank\]\] · line [0-9a-f]{8}\n/);
});

test("explain gives the budget, the decisions and the ledger's last lines, and writes nothing", async () => {
  const c = core({ "notes/Thesis.md": "- [ ] Write the introduction ⏫ 📅 2026-11-17 ^t3f9a\n", [LEDGER]: "---\ntype: plan-ledger\n---\n- 2026-11-16 08:00 · digest · nothing due\n" });
  const r = await call("explain", "10:00");
  assert.deepEqual(r.budget, { perDay: 6, gap: 45, measured: false, days: 1, nudges: 0, acted: 0 });
  assert.equal(r.decisions[0].title, "Write the introduction");
  assert.deepEqual(r.recent, ["- 2026-11-16 08:00 · digest · nothing due"]);
  assert.ok(!c.files[LEDGER].includes("nudged"), "explaining records nothing");
  assert.equal(r.used, null, "the core did not say when the device was used");
});

test("the device's last use reaches the plan: a task due in 3 days waits while no one is there", async () => {
  const notes = { "notes/Essay.md": "- [ ] Draft the essay 📅 2026-11-19\n" };
  core({ ...notes }, { activeAt: at("09:10") });
  const away = await call("explain", "10:00");
  assert.equal(away.used, "2026-11-16T09:10:00+01:00");
  assert.equal(away.decisions[0].at, "2026-11-16T10:15:00+01:00");
  core({ ...notes }, { activeAt: at("09:55") });
  assert.equal((await call("explain", "10:00")).decisions[0].at, "2026-11-16T10:00:00+01:00");
});

const SERVER_LEDGER = "plan/ledger/2026-11 server.md";
const sends = (posted: { path: string; body: any }[]) => posted.filter((x) => x.path === "/api/plugins/notifications/tools/send").map((x) => x.body);

test("the ntfy fallback: the server sends a nudge due while no device runs Atlas, with signed Done / Snooze / Block buttons", async () => {
  const dev = (id: string, kind: string, reported: string) => ({ id, name: id, kind, active_at: at(reported), reported_at: at(reported), here: false });
  const notes = { "notes/Thesis.md": "# Thesis\n- [ ] Write the introduction ⏫ 📅 2026-11-17 ^t3f9a\n" };
  // every device silent for more than 10 min: the server sends, once, with no task text by default
  const c = core({ ...notes }, { person: false, devices: [dev("laptop", "desktop", "09:00"), dev("phone", "phone", "09:30")] });
  const r = await call("fallback", "10:00");
  assert.equal(r.sent, 1, r.summary);
  const [m] = sends(c.posted);
  assert.equal(m.title, "A task is waiting");
  assert.doesNotMatch(JSON.stringify(m), /introduction|Thesis/, "the task's text stays on the devices");
  assert.deepEqual(m.actions.map((a: any) => a.label), ["Done", "Snooze to 11:00", "Block 11:00"], "ntfy's three buttons; Open is the click");
  const data = (url: string) => JSON.parse(Buffer.from(/t=([^.]+)\./.exec(url)![1], "base64url").toString());
  assert.deepEqual(data(m.actions[0].url), { notice_id: "plan:notes/Thesis.md#^t3f9a", action: "done" });
  assert.equal(data(m.actions[1].url).action, "snooze:2026-11-16T11:00");
  assert.equal(data(m.actions[2].url).action, "block:2026-11-16T11:00+30");
  assert.ok(m.actions[0].url.startsWith("https://atlas.example.org/v/work/api/plugins/plan/hook/press?t="), m.actions[0].url);
  assert.equal(m.click, "https://atlas.example.org/v/work/");
  assert.match(c.files[SERVER_LEDGER], /- 2026-11-16 10:00 · nudged · \[\[notes\/Thesis#\^t3f9a\|Write the introduction\]\] · important · score 3\.2 · .* · \(ntfy\)\n/);
  // the next round, while it would still ring: not sent again
  c.posted.length = 0;
  assert.equal((await call("fallback", "10:05")).sent, 0);
  assert.deepEqual(sends(c.posted), []);
  // Done pressed on the phone: the hook ticks the task as the notification's own Done would, in the server's ledger
  const pressed = await call("press", "10:07", { data: data(m.actions[0].url), body: null });
  assert.deepEqual(pressed, { withdraw: ["plan:notes/Thesis.md#^t3f9a"] });
  assert.ok(c.files["notes/Thesis.md"].includes("- [x] Write the introduction"));
  assert.match(c.files[SERVER_LEDGER], /- 2026-11-16 10:07 · done · \[\[notes\/Thesis#\^t3f9a\|Write the introduction\]\] · from the notification/);
  // a token's data asking for anything else (a dismissal, the core's own ids) does nothing
  assert.deepEqual(await call("press", "10:08", { data: { notice_id: "plan:x", action: "atlas:dismissed" } }), {});
});

test("the ntfy fallback stays silent while a device runs Atlas, when none ever reported, on a device, and when off", async () => {
  const notes = { "notes/Thesis.md": "- [ ] Write the introduction ⏫ 📅 2026-11-17 ^t3f9a\n" };
  const dev = (reported: string) => ({ id: "laptop", name: "laptop", kind: "desktop", active_at: at("09:00"), reported_at: at(reported), here: false });
  const cases: [{ person: boolean; devices: unknown[] }, RegExp][] = [
    [{ person: false, devices: [dev("09:55")] }, /laptop runs Atlas: the nudges ring there/],
    [{ person: false, devices: [] }, /no device has reported/],
    [{ person: true, devices: [dev("09:00")] }, /rings nudges itself/],
  ];
  for (const [o, why] of cases) {
    const c = core({ ...notes }, o);
    const r = await call("fallback", "10:00");
    assert.equal(r.sent, 0);
    assert.match(r.summary, why);
    assert.deepEqual(sends(c.posted), []);
    assert.equal(c.files[SERVER_LEDGER], undefined);
  }
  const c = core({ ...notes }, { person: false, devices: [dev("09:00")] });
  assert.match((await call("fallback", "10:00", { settings: { digest: false, ntfy_fallback: false } })).summary, /off/);
  assert.deepEqual(sends(c.posted), []);
});

test("the ntfy fallback: the task's text when allowed, no buttons without an address, nothing recorded when not sent", async () => {
  const notes = { "notes/Thesis.md": "- [ ] Write the introduction ⏫ 📅 2026-11-17 ^t3f9a\n" };
  const dev = { id: "laptop", name: "laptop", kind: "desktop", active_at: at("09:00"), reported_at: at("09:00"), here: false };
  let c = core({ ...notes }, { person: false, devices: [dev], origin: null });
  let r = await call("fallback", "10:00", { settings: { digest: false, ntfy_text: true } });
  let [m] = sends(c.posted);
  assert.equal(m.title, "Write the introduction");
  assert.match(m.text, /due tomorrow, ⏫/);
  assert.equal(m.actions, undefined, "the server's address unknown: no buttons");
  assert.match(r.summary, /no address for the buttons/);
  // Settings name the address
  c = core({ ...notes }, { person: false, devices: [dev], origin: null });
  await call("fallback", "10:00", { settings: { digest: false, server_url: "https://atlas.example.org/" } });
  [m] = sends(c.posted);
  assert.ok(m.actions[0].url.startsWith("https://atlas.example.org/v/work/api/plugins/plan/hook/press?t="));
  // no Notifications plugin: said, and not recorded, so the next round tries again
  c = core({ ...notes }, { person: false, devices: [dev], noSend: true });
  r = await call("fallback", "10:00");
  assert.equal(r.sent, 0);
  assert.match(r.summary, /Notifications plugin is not installed/);
  assert.equal(c.files[SERVER_LEDGER], undefined);
});

test("each device keeps the hours it is seen in use and writes them once a day as a `used` line", async () => {
  forgetUsed();
  const day = (d: string, hhmm: string) => instant(d, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), fixedClock(0, OFFSET));
  const files: Record<string, string> = {};
  const ledger = () => files[LEDGER] as string; // read anew: an assertion that it is missing narrows the type
  const round = (d: string, hhmm: string, used: string | null, usedDay = d) => {
    core(files, { activeAt: used ? day(usedDay, used) : undefined });
    return call("nudges", hhmm, { now: day(d, hhmm) });
  };
  await round("2026-11-16", "09:10", "09:05");
  await round("2026-11-16", "09:40", "09:38");
  await round("2026-11-16", "14:00", "13:58");
  await round("2026-11-16", "16:00", null);
  assert.equal(ledger(), undefined, "nothing written while the day goes on");
  const cache = Object.keys(files).find((p) => /^\.atlas\/cache\/[\w-]+-used-laptop\.json$/.test(p))!;
  assert.deepEqual(JSON.parse(files[cache]), { day: "2026-11-16", hours: [9, 13] }, "the day's hours kept outside the helper's memory");
  await round("2026-11-17", "00:05", "23:50", "2026-11-16");
  assert.match(ledger(), /^- 2026-11-16 23:59 · used · 09:00–10:00, 13:00–14:00, 23:00–24:00$/m, "the day over: one line, its last use included");
  await round("2026-11-17", "10:00", "09:55");
  // a restart: the hours come back from the cache, and the next day writes them
  forgetUsed();
  await round("2026-11-18", "08:00", null);
  assert.match(ledger(), /^- 2026-11-17 23:59 · used · 09:00–10:00$/m);
  assert.equal(ledger().split("· used ·").length, 3, "each day once");
  // a day already in the ledger is not written again (another helper's cache, a copy restored)
  files[cache] = JSON.stringify({ day: "2026-11-17", hours: [7] });
  forgetUsed();
  await round("2026-11-18", "08:05", null);
  assert.equal(ledger().split("· used ·").length, 3);
  forgetUsed();
});

test("the device rule trusts a phone's exact alarm, per nudge, while no device is picked by presence", async () => {
  const notes = { "notes/Thesis.md": "# Thesis\n- [ ] Write the introduction ⏫ 📅 2026-11-17 ^t3f9a\n" };
  const events = [{ start: "2026-11-16T10:00:00+01:00", end: "2026-11-16T11:00:00+01:00", all_day: false, free: false }];
  const phone = (exact: boolean, armed: string[]) => ({ id: "phone", name: "phone", kind: "phone", active_at: at("08:00"), reported_at: at("08:00"), here: false, alarms: { exact, armed_at: at("08:00"), nudges: armed.map(at) } });
  const laptop = { id: "laptop", name: "laptop", kind: "desktop", active_at: at("09:30"), reported_at: at("10:59"), here: true };
  // the phone set an exact alarm for 11:00 (plan/next.md as it last saw it): the planner leaves that nudge to it
  let c = core({ ...notes }, { events, devices: [laptop, phone(true, ["11:00"])] });
  let r = await call("nudges", "11:00");
  assert.deepEqual(r.planned, [], r.summary);
  assert.match(r.summary, /1 left to phone \(an exact alarm set for it\)/);
  assert.equal(c.files[LEDGER], undefined, "nothing recorded: the phone rings and records it");
  assert.match(c.files[NEXT], /- 2026-11-16 11:00 · \[\[notes\/Thesis#\^t3f9a\|Write the introduction\]\]/, "still in the plan the phone reads");
  assert.deepEqual((await call("explain", "11:00")).handed, [{ name: "phone", why: "no computer used for 5 min; phone set an exact alarm for 11:00" }]);
  // the planner's next round moves the nudge to its minute: still the phone's
  assert.deepEqual((await call("nudges", "11:04")).planned, []);
  // inexact alarms (the permission withheld) are not trusted; nor a phone that armed another moment
  for (const p of [phone(false, ["11:00"]), phone(true, ["15:00"])]) {
    c = core({ ...notes }, { events, devices: [laptop, p] });
    r = await call("nudges", "11:00");
    assert.equal(r.planned.length, 1, r.summary);
    assert.match(c.files[LEDGER], /· nudged ·/);
  }
  // the computer in use still wins over the alarm
  c = core({ ...notes }, { events, devices: [{ ...laptop, active_at: at("10:58") }, phone(true, ["11:00"])] });
  assert.equal((await call("nudges", "11:00")).planned.length, 1);
  // the server's ntfy fallback leaves it to the phone too
  c = core({ ...notes }, { events, person: false, devices: [{ ...laptop, reported_at: at("09:30"), here: false }, phone(true, ["11:00"])] });
  r = await call("fallback", "11:00");
  assert.equal(r.sent, 0, r.summary);
  assert.equal(sends(c.posted).length, 0);
});
