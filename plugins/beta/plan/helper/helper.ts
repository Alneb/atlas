// The Plan plugin's helper (DESIGN-calendar-tasks-nudges.md §3, slice 4): nudges for open tasks at the moment they
// fit, as the core's planned notices with Done / Snooze / Open, and the ledger of what happened.
// nudges  — `on = "plan"`: the core asks every few minutes and just before a notice rings (planned.rs). It reads the
//           vault's tasks (`GET /api/tasks`, the core's reading of the fields), the calendar's busy time (the
//           `@calendar` plugin's `range`, from its cache) and every device's ledger, answers the plan for 36 hours,
//           and writes into this device's ledger what has just come due (nudged, the digest) and what it saw ticked.
//           The computer that runs the vault's schedules (`GET /api/device`) plans, and writes its plan to
//           `plan/next.md` (next.ts); the nudges ring on the device the person is at (devices.ts, from the presence
//           the mirror server shares), else on the planner; another device plans for itself while the note is stale.
// pressed — `on = "notice"`: Done ticks the task through the core's one tick path (`POST /api/task/tick`), Snooze
//           gives the task a block id (`POST /api/task/block`: an action the user took) and records the promise.
// explain — the measured budget, the last decisions and when each kind of task gets done, for Settings.
// fallback — scheduled on the server: when no device runs Atlas, the nudges due go out through ntfy (fallback.ts) with
//           Done / Snooze buttons calling `press` (`on = "hook"`, a signed token per button) back on the server.
// Each round also keeps the hours this device is seen in use (its `active_at`), written once a day as a `used` ledger
// line, from which plan.ts measures the quiet hours (§3.3a). A phone that set exact alarms for `plan/next.md`'s
// nudges (its presence report's `alarms`) is trusted with those nudges while its app is closed (devices.ts armedFor).
// The planning itself is plan.ts and the ledger's text ledger.ts, pure; helper.test.ts runs them against a stand-in core.
import type { Params } from "atlas-helper";
import { add, fileOf, hoursText, keyOf, lineMark, parse, renderLine, type Entry, type TaskName } from "./ledger";
import { pick, running, seenOf, type Pick, type Seen } from "./devices";
import { localReason, nextFileOf, readNext, renderNext, shouldWrite } from "./next";
import { blockOf, HABIT_MIN, plan, settingsOf, type Busy, type Input, type Output, type Planned, type Task, type Write } from "./plan";
import { habitKeyOf, habitNameOf, ruleOf, setupOf, subjectOf, type HabitRule } from "./habits";
import { baseOf, BUTTON_TTL, messagesOf, NTFY, quietWrites } from "./fallback";
import { addDays, DAY, fixedClock, floorMinute, fromStamp, instant, rfc3339, stamp, systemClock, wall, type Clock } from "./time";

/** The clock: this device's, or a test's fixed moment and zone (`now` ms, `offset` minutes east of UTC). */
function clockOf(p: Params): Clock {
  return typeof p.now === "number" ? fixedClock(p.now, Number(p.offset ?? 0)) : systemClock();
}

const folderOf = (p: Params) => String(p.settings?.ledger || "plan/ledger").replace(/\/+$/, "");

/** This device: its name in the ledger (Settings' `device`, else the computer's), whether it plans, its last use, and
 *  the person's devices as the mirror server shares them. */
async function device(p: Params): Promise<{ name: string; plans: boolean; activeAt: number | null; devices: Seen[] }> {
  const d = await atlas.get<{ name: string; schedules: boolean; active_at?: number | null; devices?: unknown }>("/api/device");
  return { name: String(p.settings?.device || d.name || "device"), plans: !!d.schedules, activeAt: typeof d.active_at === "number" ? d.active_at : null, devices: seenOf(d.devices) };
}

/** Whether this device rings, and why it plans for itself when it is not the planner (`local`): the device rule's
 *  pick when the presence known makes one; else the planner rings, and another device only while the planner's note
 *  is missing or stale. */
function role(plans: boolean, at: Pick | null, stale: () => string | null): { rings: boolean; local: string | null } {
  if (at) return { rings: at.device.here, local: at.device.here && !plans ? `you are at it (${at.why})` : null };
  const local = plans ? null : stale();
  return { rings: plans || local !== null, local };
}

async function tasks(status: "open" | "all"): Promise<Task[]> {
  return (await atlas.get<{ tasks: Task[] }>("/api/tasks", { status })).tasks;
}

/** The calendar's busy time from `from` for two days: timed events not marked free and not cancelled. No calendar
 *  plugin: nothing busy; one that fails: nothing busy, and the reasons say the calendar was not read. */
async function busy(today: string): Promise<{ busy: Busy[]; read: boolean; calendar: boolean }> {
  try {
    const r = await atlas.post<{ events?: any[] }>("/api/plugins/@calendar/helper", { method: "range", params: { from: today, to: addDays(today, 2) } });
    const out: Busy[] = [];
    for (const e of r.events ?? []) {
      if (e.all_day || e.free || String(e.status ?? "").toUpperCase() === "CANCELLED") continue;
      const start = Date.parse(e.start), end = Date.parse(e.end);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) out.push({ start, end });
    }
    return { busy: out, read: true, calendar: true };
  } catch (e) {
    if ((e as { status?: number }).status === 404) return { busy: [], read: true, calendar: false };
    console.error(`plan: the calendar could not be read: ${e instanceof Error ? e.message : e}`);
    return { busy: [], read: false, calendar: true };
  }
}

/** Every device's ledger notes of this month and the last (the 28 days the budget is measured on). */
async function ledgers(folder: string, c: Clock): Promise<Entry[]> {
  let listed: { name: string; path: string; kind: string }[] = [];
  try {
    listed = await atlas.tree(folder);
  } catch {
    return [];
  }
  const months = new Set([wall(c.now, c).day.slice(0, 7), wall(c.now - 28 * DAY, c).day.slice(0, 7)]);
  const out: Entry[] = [];
  for (const f of listed.filter((f) => f.kind === "file" && f.name.endsWith(".md") && months.has(f.name.slice(0, 7)))) {
    out.push(...parse(await atlas.read(f.path), c));
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Writes ledger lines into this device's notes, one per month, newest first. */
async function record(writes: Write[], folder: string, deviceName: string, c: Clock): Promise<void> {
  const byMonth = new Map<string, Write[]>();
  for (const w of writes) {
    const m = wall(w.entry.at, c).day.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), w]);
  }
  for (const [month, list] of byMonth) {
    const path = fileOf(folder, month, deviceName);
    let text: string | null = null;
    try {
      text = await atlas.read(path);
    } catch {
      text = null;
    }
    const lines = list.sort((a, b) => b.entry.at - a.entry.at).map((w) => renderLine(w.entry, c, w.task));
    await atlas.write(path, add(text, lines, deviceName, month));
  }
}

async function readOr(path: string): Promise<string | null> {
  try {
    return await atlas.read(path);
  } catch {
    return null;
  }
}

/** The tasks open at this helper's last round (plan.ts `Input.wasOpen`): a task ticked between two rounds is a done
 *  time. In memory only: after a restart the first round only learns, so a tick made while no helper ran is never
 *  given the wrong hour. */
let wasOpen: Set<string> | null = null;

/** The day's hours this device was seen in use (§3.3a), kept between rounds in memory and in `.atlas/cache` (a
 *  restart keeps them; nothing of the vault): `{ device, day, hours }`. */
let used: { device: string; day: string; hours: number[] } | null = null;
const usedFileOf = (deviceName: string) => `.atlas/cache/${atlas.id}-used-${deviceName.replace(/[^\w.-]+/g, "_")}.json`;

/** For the tests: forget the hours kept in memory (the cache file stays). */
export function forgetUsed() {
  used = null;
}

/** One round's look at this device's presence: the hour of its last use joins its day's hours; once a day is over, its
 *  hours become one `used` line in this device's ledger (stamped 23:59 of that day; none for a day it was never seen
 *  in use, and none twice: a line already there for that day is kept). */
async function keepUsed(deviceName: string, activeAt: number | null, folder: string, c: Clock): Promise<void> {
  const file = usedFileOf(deviceName), today = wall(c.now, c).day;
  if (!used || used.device !== deviceName) {
    let kept: any = null;
    try {
      kept = JSON.parse((await readOr(file)) ?? "null");
    } catch {
      kept = null; // a cache that is not ours: start the day afresh
    }
    used = kept && typeof kept.day === "string" && Array.isArray(kept.hours) ? { device: deviceName, day: kept.day, hours: kept.hours.filter((h: unknown) => typeof h === "number") } : { device: deviceName, day: today, hours: [] };
  }
  const before = JSON.stringify(used);
  const seen = activeAt === null ? null : wall(activeAt, c);
  if (seen && seen.day === used.day && !used.hours.includes(Math.floor(seen.min / 60))) used.hours = [...used.hours, Math.floor(seen.min / 60)].sort((a, b) => a - b);
  if (used.day < today) {
    if (used.hours.length) {
      const at = instant(used.day, 23 * 60 + 59, c);
      const mine = await readOr(fileOf(folder, used.day.slice(0, 7), deviceName));
      const already = mine !== null && parse(mine, c).some((e) => e.kind === "used" && wall(e.at, c).day === used!.day);
      if (!already) await record([{ entry: { at, kind: "used", detail: hoursText(used.hours) } }], folder, deviceName, c);
    }
    used = { device: deviceName, day: today, hours: seen && seen.day === today ? [Math.floor(seen.min / 60)] : [] };
  }
  if (JSON.stringify(used) !== before) await atlas.write(file, JSON.stringify({ day: used.day, hours: used.hours }));
}

/** The nudges handed to a phone that set an exact alarm for them (devices.ts armedFor), while the presence picks no
 *  device: they stay in `plan/next.md`, but this device neither rings nor records them. */
function handOff(out: Output, devices: Seen[], c: Clock): { planned: Planned[]; writes: Write[]; handed: Pick[] } {
  const armed = (moment: number) => pick(devices, c.now, c, moment);
  const handed: Pick[] = [];
  const planned = out.planned.filter((p) => {
    const a = armed(Date.parse(p.at));
    if (a) handed.push(a);
    return !a;
  });
  const writes = out.writes.filter((w) => !((w.entry.kind === "nudged" || w.entry.kind === "digest") && armed(w.entry.at)));
  return { planned, writes, handed };
}

/** The habit notes: every note with a `habit` property, wherever it is (one Bases query over the core's index). */
async function habitRules(): Promise<HabitRule[]> {
  const keys = ["habit", "days", "window", "at", "nag", "paused"];
  const src = `filters:\n  and:\n    - file.hasProperty("habit")\nviews:\n  - type: table\n    name: habits\n    order:\n${keys.map((k) => `      - ${JSON.stringify(k)}\n`).join("")}`;
  try {
    const r = await atlas.post<{ views?: { columns?: { key?: string }[]; rows?: { path?: string; values?: unknown[] }[] }[] }>("/api/base/query", { src });
    const v = r.views?.[0];
    const cols = (v?.columns ?? []).map((c) => c.key ?? "");
    return (v?.rows ?? []).flatMap((row) => {
      const props = Object.fromEntries(cols.map((k, i) => [k, row.values?.[i]]).filter(([k, x]) => k && x !== null && x !== undefined));
      const rule = row.path ? ruleOf(row.path, props) : null;
      return rule ? [rule] : [];
    });
  } catch (e) {
    if ((e as { status?: number }).status !== 404) console.error(`plan: the habit notes could not be read: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

/** The plan from the vault's tasks, the calendar's busy time and every ledger (`more`: what this device knows besides). */
async function gather(s: ReturnType<typeof settingsOf>, folder: string, c: Clock, more: Partial<Input>): Promise<{ out: Output; all: Task[] }> {
  const today = wall(c.now, c).day;
  const [all, cal, entries, habits] = [await tasks("all"), await busy(today), await ledgers(folder, c), await habitRules()];
  let digestOpens: string | null = null;
  try {
    digestOpens = (await atlas.get<boolean>("/api/exists", { path: "Deadlines.page" })) ? "Deadlines.page" : null;
  } catch {
    digestOpens = null;
  }
  return { out: plan({ tasks: all, busy: cal.busy, calendarRead: cal.read, canBlock: cal.calendar && cal.read, habits, entries, settings: s, clock: c, digestOpens, ...more }), all };
}

/** The plan as of now, and what it decided; the ledger lines it makes are written only when `write`, and only by the
 *  device that rings (`role`). The planner writes `plan/next.md` whoever rings. */
async function planNow(p: Params, c: Clock, write: boolean): Promise<Output & { device: string; plans: boolean; local: string | null; activeAt: number | null; rings: boolean; at: Pick | null; handed: Pick[] }> {
  const s = settingsOf(p.settings ?? {});
  const dev = await device(p);
  const folder = folderOf(p);
  const at = pick(dev.devices, c.now, c);
  const note = dev.plans || at ? null : await readOr(nextFileOf(folder));
  const { rings, local } = role(dev.plans, at, () => localReason(readNext(note, c), c.now, c));
  if (write) await keepUsed(dev.name, dev.activeAt, folder, c);
  const { out, all } = await gather(s, folder, c, { activeAt: dev.activeAt, local: local !== null, wasOpen: write ? (wasOpen ?? undefined) : undefined });
  // no device picked by presence: a phone that armed a nudge exactly rings it, not this one (next.md still lists it)
  const own = at ? { planned: out.planned, writes: out.writes, handed: [] } : handOff(out, dev.devices, c);
  if (write) wasOpen = new Set(all.filter((t) => !t.done).map((t) => keyOf({ path: t.path, title: t.title, block: t.block })));
  if (write && rings && own.writes.length) await record(own.writes, folder, dev.name, c);
  if (write && dev.plans) {
    const path = nextFileOf(folder), old = await readOr(path), fresh = renderNext(out.planned, dev.name, floorMinute(c.now), c);
    if (shouldWrite(old, fresh, dev.name, c.now, c)) await atlas.write(path, fresh);
  }
  return { ...out, planned: own.planned, writes: own.writes, handed: own.handed, device: dev.name, plans: dev.plans, local, activeAt: dev.activeAt, rings, at };
}

/** `on = "plan"`: the planned nudges, on the device that rings; none elsewhere. */
export async function nudges(p: Params) {
  const c = clockOf(p);
  const out = await planNow(p, c, true);
  if (out.at && !out.rings) return { planned: [], summary: `nudges ring on ${out.at.device.name}: ${out.at.why}` };
  if (!out.rings) return { planned: [], summary: `${out.device} does not run this vault's schedules: it does not nudge` };
  const local = out.local ? ` (local plan: ${out.local})` : "";
  const handed = out.handed.length ? `; ${out.handed.length} left to ${[...new Set(out.handed.map((h) => h.device.name))].join(", ")} (an exact alarm set for it)` : "";
  return { planned: out.planned, summary: `${out.planned.length} planned, ${out.writes.length} recorded${local}${handed}` };
}

/** `on = "notice"`: Done or Snooze pressed on a nudge, or the nudge dismissed (`atlas:dismissed`, said by the core:
 *  recorded with its line's mark, for the back-off). */
export async function pressed(p: Params) {
  const c = clockOf(p);
  const id = String(p.notice_id ?? ""), action = String(p.action ?? "");
  const key = id.replace(/^plan:/, "");
  if (!id.startsWith("plan:") || key.startsWith("digest:")) return {};
  const habit = habitKeyOf(id);
  if (habit) return habitPressed(habit, action, id, p, c);
  const all = await tasks("all");
  const name = (t: Task): TaskName => ({ path: t.path, title: t.title, block: t.block });
  const open = all.find((t) => !t.done && keyOf(name(t)) === key);
  const dev = await device(p);
  const now = floorMinute(c.now);
  const writes: Write[] = [];
  if (action === "done") {
    if (open) {
      try {
        await atlas.post("/api/task/tick", { path: open.path, line: open.line, text: open.text, ...(open.block ? { block: open.block } : {}) });
        writes.push({ entry: { at: now, kind: "done", key, detail: "from the notification" }, task: name(open) });
      } catch (e) {
        // changed since (409): ticked elsewhere or edited; nothing written, the nudge goes
        console.error(`plan: Done on ${key}: ${e instanceof Error ? e.message : e}`);
      }
    }
  } else if (action.startsWith("snooze:")) {
    const until = fromStamp(action.slice("snooze:".length).replace("T", " "), c);
    if (open && until !== null) {
      let block = open.block;
      if (!block) block = (await atlas.post<{ block: string }>("/api/task/block", { path: open.path, line: open.line, text: open.text })).block;
      const task = { ...name(open), block };
      writes.push({ entry: { at: now, kind: "snoozed", key: keyOf(task), until, detail: "" }, task });
    }
  } else if (blockOf(action)) {
    // Block: the calendar time-blocks the task into the slot (its `time_block`: event, its note, ⏳ on the line); the
    // event reminds from then on, so the nudges wait until the block is over (and come back if it is still open)
    const slot = blockOf(action)!;
    const start = fromStamp(slot.start.replace("T", " "), c);
    if (open && start !== null) {
      const end = start + slot.minutes * 60_000;
      try {
        const r = await atlas.post<{ block?: string; label?: string }>("/api/plugins/@calendar/tools/time_block", {
          title: open.title, start: slot.start, end: stamp(end, c).replace(" ", "T"),
          task: { path: open.path, line: open.line, text: open.text },
        });
        const task = { ...name(open), block: r.block ?? open.block };
        writes.push({ entry: { at: now, kind: "snoozed", key: keyOf(task), until: end, detail: `time-blocked${r.label ? ` · ${r.label}` : ""}` }, task });
      } catch (e) {
        // not blocked (no calendar to write to, the task changed): said in the log, and the nudge stays to answer
        console.error(`plan: Block on ${key}: ${e instanceof Error ? e.message : e}`);
        return {};
      }
    }
  } else if (action === "atlas:dismissed") {
    if (open) writes.push({ entry: { at: now, kind: "dismissed", key, detail: `line ${lineMark(open.text)}` }, task: name(open) });
  } else {
    return {};
  }
  if (writes.length) await record(writes, folderOf(p), dev.name, c);
  return { withdraw: [id] };
}

/** Done or Skip today on a habit's nag: the ledger says it, and every nag of it today goes. A nag swiped away is
 *  nothing: the next one comes (that is what a habit asked for). */
async function habitPressed(key: string, action: string, id: string, p: Params, c: Clock) {
  const name = habitNameOf(key);
  if (!name || (action !== "done" && action !== "skip")) return {};
  const dev = await device(p);
  const entry: Entry = action === "done"
    ? { at: floorMinute(c.now), kind: "done", key, detail: "habit · from the notification" }
    : { at: floorMinute(c.now), kind: "dismissed", key, detail: "habit · skipped today" };
  await record([{ entry, task: name }], folderOf(p), dev.name, c);
  return { withdraw: [id, subjectOf(name.path)] };
}

/** `on = "capture"`: `habit gym mon wed fri 18:00` in a capture makes the habit's note (once; an existing one is
 *  left as it is, and named). Any other capture is not this plugin's. */
export async function capture(p: Params) {
  const lines = String(p.text ?? "").split("\n");
  const made = lines.map(setupOf).find((x) => x !== null);
  if (!made) return { skipped: "no habit line" };
  const folder = String(p.settings?.habits || "habits").replace(/\/+$/, "");
  const path = `${folder}/${made.name}.md`;
  if (await readOr(path) !== null) return { path, notice: `The habit ${made.name} already has its note: edit it there.` };
  await atlas.write(path, made.text);
  return { path, notice: `Habit ${made.name}: nagged in its window until done.` };
}

/** The Notifications plugin's `send`; a failure (not installed, no phone topic) is said, not thrown. */
async function send(msg: { title: string; text: string; actions: { label: string; url: string; body?: string }[]; click?: string }): Promise<string | null> {
  try {
    await atlas.post("/api/plugins/notifications/tools/send", { title: msg.title, text: msg.text, ...(msg.actions.length ? { actions: msg.actions } : {}), ...(msg.click ? { click: msg.click } : {}) });
    return null;
  } catch (e) {
    const status = (e as { status?: number }).status;
    return status === 404 ? "the Notifications plugin is not installed or switched on" : `not sent: ${e instanceof Error ? e.message : e}`;
  }
}

/** Scheduled on the server (`background = "server"`): when no device of the person runs Atlas, the nudges that come due
 *  go out through ntfy with Done / Snooze buttons (hook `press`); recorded in the server's ledger once each went, with
 *  `(ntfy)`. Silent on a core with a person at it, when no device ever reported (who runs Atlas is unknown), while
 *  one runs, and when Settings turn it off. */
export async function fallback(p: Params) {
  const c = clockOf(p);
  const d = await atlas.get<{ name: string; person?: boolean; devices?: unknown }>("/api/device");
  if (d.person !== false) return { sent: 0, summary: "this core shows its own notices: it rings nudges itself" };
  if (p.settings?.ntfy_fallback === false) return { sent: 0, summary: "the ntfy fallback is off (Settings → Plan)" };
  const devices = seenOf(d.devices);
  if (!devices.length) return { sent: 0, summary: "no device has reported to this server: whether one runs Atlas is unknown, nothing sent" };
  const up = running(devices, c.now);
  if (up.length) return { sent: 0, summary: `${up.map((x) => x.name).join(", ")} ${up.length === 1 ? "runs" : "run"} Atlas: the nudges ring there` };
  const at = pick(devices, c.now, c);
  if (at) return { sent: 0, summary: `nudges ring on ${at.device.name}: ${at.why}` };
  const s = settingsOf(p.settings ?? {}), folder = folderOf(p), name = String(p.settings?.device || d.name || "server");
  const { out: all } = await gather(s, folder, c, { mark: NTFY });
  const out = handOff(all, devices, c); // a phone's exact alarm rings its nudge with the app closed: ntfy need not
  const messages = messagesOf(out.planned, out.writes, p.settings?.ntfy_text === true);
  const written: Write[] = quietWrites(out.writes), problems: string[] = [];
  let sent = 0, unbuttoned = false;
  for (const m of messages) {
    const actions: { label: string; url: string; body?: string }[] = [];
    let click: string | undefined;
    for (const b of m.buttons) {
      try {
        const signed = await atlas.post<{ path: string; origin: string | null }>("/api/plugins/plan/hooks/sign", { hook: "press", data: { notice_id: m.noticeId, action: b.action }, ttl_secs: BUTTON_TTL });
        const base = baseOf(p.settings?.server_url, signed.origin);
        if (!base) { unbuttoned = true; break; }
        actions.push({ label: b.label, url: `${base}${signed.path}` });
        click ??= `${base}${signed.path.slice(0, Math.max(0, signed.path.indexOf("/api/")))}/`;
      } catch (e) {
        problems.push(`no buttons: ${e instanceof Error ? e.message : e}`);
        break;
      }
    }
    const why = await send({ title: m.title, text: m.text, actions: actions.length === m.buttons.length ? actions : [], click });
    if (why) { problems.push(why); continue; }
    sent += 1;
    written.push(...m.writes);
  }
  if (written.length) await record(written, folder, name, c);
  const notes = [unbuttoned ? "no address for the buttons: set the server's address in Settings → Plan" : "", ...new Set(problems)].filter(Boolean);
  return { sent, summary: `${sent} sent through ntfy (no device runs Atlas)${notes.length ? `; ${notes.join("; ")}` : ""}` };
}

/** `on = "hook"`: a button of a nudge sent through ntfy, pressed on the phone (its token's data: the nudge and the
 *  action) — answered as the notification's own Done or Snooze. */
export async function press(p: Params) {
  const data = (p.data ?? {}) as { notice_id?: unknown; action?: unknown };
  const action = String(data.action ?? "");
  if (action !== "done" && !action.startsWith("snooze:")) return {};
  return pressed({ ...p, notice_id: data.notice_id, action });
}

/** For Settings: the budget as measured, the plan's decisions and the ledger's last lines. Writes nothing. */
export async function explain(p: Params) {
  const c = clockOf(p);
  const out = await planNow(p, c, false);
  const recent = (await ledgers(folderOf(p), c)).slice(0, 20).map((e) => e.line ?? renderLine(e, c));
  const used = out.activeAt === null ? null : rfc3339(out.activeAt, c);
  const at = out.at && { name: out.at.device.name, here: out.at.device.here, why: out.at.why };
  const handed = out.handed.map((h) => ({ name: h.device.name, why: h.why }));
  return { device: out.device, plans: out.plans, local: out.local, rings: out.rings, at, used, handed, budget: out.budget, quiet: out.quiet, decisions: out.decisions, habits: out.habits, habitMin: HABIT_MIN, recent };
}

atlas.methods({ nudges, pressed, explain, fallback, press, capture });
