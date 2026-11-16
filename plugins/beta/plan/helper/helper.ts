// The Plan plugin's helper (DESIGN-calendar-tasks-nudges.md §3, slice 4): nudges for open tasks at the moment they
// fit, as the core's planned notices with Done / Snooze / Open, and the ledger of what happened.
// nudges  — `on = "plan"`: the core asks every few minutes and just before a notice rings (planned.rs). It reads the
//           vault's tasks (`GET /api/tasks`, the core's reading of the fields), the calendar's busy time (the
//           `@calendar` plugin's `range`, from its cache) and every device's ledger, answers the plan for 36 hours,
//           and writes into this device's ledger what has just come due (nudged, the digest) and what it saw ticked.
//           Only on the computer that runs the vault's schedules (`GET /api/device`): one device nudges.
// pressed — `on = "notice"`: Done ticks the task through the core's one tick path (`POST /api/task/tick`), Snooze
//           gives the task a block id (`POST /api/task/block`: an action the user took) and records the promise.
// explain — the measured budget and the last decisions, for Settings.
// The planning itself is plan.ts and the ledger's text ledger.ts, pure; helper.test.ts runs them against a stand-in core.
import type { Params } from "atlas-helper";
import { add, fileOf, keyOf, parse, renderLine, type Entry, type TaskName } from "./ledger";
import { plan, settingsOf, type Busy, type Output, type Task, type Write } from "./plan";
import { addDays, DAY, fixedClock, floorMinute, fromStamp, systemClock, wall, type Clock } from "./time";

/** The clock: this device's, or a test's fixed moment and zone (`now` ms, `offset` minutes east of UTC). */
function clockOf(p: Params): Clock {
  return typeof p.now === "number" ? fixedClock(p.now, Number(p.offset ?? 0)) : systemClock();
}

const folderOf = (p: Params) => String(p.settings?.ledger || "plan/ledger").replace(/\/+$/, "");

/** This device: its name in the ledger (Settings' `device`, else the computer's), and whether it plans. */
async function device(p: Params): Promise<{ name: string; plans: boolean }> {
  const d = await atlas.get<{ name: string; schedules: boolean }>("/api/device");
  return { name: String(p.settings?.device || d.name || "device"), plans: !!d.schedules };
}

async function tasks(status: "open" | "all"): Promise<Task[]> {
  return (await atlas.get<{ tasks: Task[] }>("/api/tasks", { status })).tasks;
}

/** The calendar's busy time from `from` for two days: timed events not marked free and not cancelled. No calendar
 *  plugin: nothing busy; one that fails: nothing busy, and the reasons say the calendar was not read. */
async function busy(today: string): Promise<{ busy: Busy[]; read: boolean }> {
  try {
    const r = await atlas.post<{ events?: any[] }>("/api/plugins/@calendar/helper", { method: "range", params: { from: today, to: addDays(today, 2) } });
    const out: Busy[] = [];
    for (const e of r.events ?? []) {
      if (e.all_day || e.free || String(e.status ?? "").toUpperCase() === "CANCELLED") continue;
      const start = Date.parse(e.start), end = Date.parse(e.end);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) out.push({ start, end });
    }
    return { busy: out, read: true };
  } catch (e) {
    if ((e as { status?: number }).status === 404) return { busy: [], read: true };
    console.error(`plan: the calendar could not be read: ${e instanceof Error ? e.message : e}`);
    return { busy: [], read: false };
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

/** The plan as of now, and what it decided; the ledger lines it makes are written only when `write`. */
async function planNow(p: Params, c: Clock, write: boolean): Promise<Output & { device: string; plans: boolean }> {
  const s = settingsOf(p.settings ?? {});
  const dev = await device(p);
  const folder = folderOf(p);
  const today = wall(c.now, c).day;
  const [all, cal, entries] = [await tasks("all"), await busy(today), await ledgers(folder, c)];
  let digestOpens: string | null = null;
  try {
    digestOpens = (await atlas.get<boolean>("/api/exists", { path: "Deadlines.page" })) ? "Deadlines.page" : null;
  } catch {
    digestOpens = null;
  }
  const out = plan({ tasks: all, busy: cal.busy, calendarRead: cal.read, entries, settings: s, clock: c, digestOpens });
  if (write && dev.plans && out.writes.length) await record(out.writes, folder, dev.name, c);
  return { ...out, device: dev.name, plans: dev.plans };
}

/** `on = "plan"`: the planned nudges, on the device that plans; none elsewhere. */
export async function nudges(p: Params) {
  const c = clockOf(p);
  const out = await planNow(p, c, true);
  if (!out.plans) return { planned: [], summary: `${out.device} does not run this vault's schedules: it does not nudge` };
  return { planned: out.planned, summary: `${out.planned.length} planned, ${out.writes.length} recorded` };
}

/** `on = "notice"`: Done or Snooze pressed on a nudge. */
export async function pressed(p: Params) {
  const c = clockOf(p);
  const id = String(p.notice_id ?? ""), action = String(p.action ?? "");
  const key = id.replace(/^plan:/, "");
  if (!id.startsWith("plan:") || key.startsWith("digest:")) return {};
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
  } else {
    return {};
  }
  if (writes.length) await record(writes, folderOf(p), dev.name, c);
  return { withdraw: [id] };
}

/** For Settings: the budget as measured, the plan's decisions and the ledger's last lines. Writes nothing. */
export async function explain(p: Params) {
  const c = clockOf(p);
  const out = await planNow(p, c, false);
  const recent = (await ledgers(folderOf(p), c)).slice(0, 20).map((e) => e.line ?? renderLine(e, c));
  return { device: out.device, plans: out.plans, budget: out.budget, decisions: out.decisions, recent };
}

atlas.methods({ nudges, pressed, explain });
