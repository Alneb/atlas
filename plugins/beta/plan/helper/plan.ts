// The planner (DESIGN-calendar-tasks-nudges.md §3): which open tasks may nudge, when, and why — pure, so the tests run
// it on a fixed clock with a fake calendar. helper.ts feeds it the vault's tasks, the calendar's busy time and the
// ledgers, and writes back what it decided.
//
// v0 (the design's slice 4): urgency × room only (no histogram yet), quiet hours, the calendar's busy time, one nudge
// per task per window, a budget of N a day with a gap of G minutes measured from the ledger (§3.3a; important tasks
// exempt), snoozes honoured, the morning digest. A nudge is planned at the first gap that holds the task.
import { keyOf, titleKey, type Entry, type TaskName } from "./ledger";
import { addDays, DAY, daysBetween, floorMinute, hhmm, HOUR, instant, MIN, minuteOf, rfc3339, stamp, wall, type Clock } from "./time";

/** A task as `GET /api/tasks` lists it (the core reads the fields: today.rs `listed`). */
export interface Task {
  path: string;
  line: number;
  text: string;
  done: boolean;
  title: string;
  due?: string | null;
  scheduled?: string | null;
  start?: string | null;
  priority: string;
  tags: string[];
  recurrence?: string | null;
  block?: string | null;
}

/** A stretch of time the calendar says is taken. */
export interface Busy { start: number; end: number }

export interface Settings {
  nudges: boolean;
  /** Quiet hours, minutes of the day: from `quietFrom` to `quietTo` (across midnight when from > to). */
  quietFrom: number;
  quietTo: number;
  horizon: number;
  threshold: number;
  /** 0: measured from the ledger. */
  maxPerDay: number;
  minGap: number;
  minutes: number;
  durations: Record<string, number>;
  exclude: string[];
  digest: boolean;
  digestAt: number;
  snoozeMinutes: number;
}

/** The plugin's settings (as Settings saved them, defaults filled in by the core) → numbers the planner uses. */
export function settingsOf(raw: Record<string, unknown> = {}): Settings {
  const num = (k: string, d: number) => { const n = Number(raw[k]); return Number.isFinite(n) && raw[k] !== "" && raw[k] !== undefined && raw[k] !== null ? n : d; };
  const [from, to] = String(raw.quiet ?? "22:30-08:00").split(/[-–]/).map((s) => minuteOf(s));
  const durations: Record<string, number> = {};
  for (const part of String(raw.durations ?? "").split(",")) {
    const m = /^\s*#?([^=\s]+)\s*=\s*(\d+)\s*$/.exec(part);
    if (m) durations[m[1].toLowerCase()] = Number(m[2]);
  }
  return {
    nudges: raw.nudges !== false,
    quietFrom: from ?? 22 * 60 + 30,
    quietTo: to ?? 8 * 60,
    horizon: num("horizon", 7),
    threshold: num("threshold", 1),
    maxPerDay: num("max_per_day", 0),
    minGap: num("min_gap", 0),
    minutes: num("minutes", 30),
    durations,
    exclude: String(raw.exclude ?? "").split(",").map((s) => s.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean),
    digest: raw.digest !== false,
    digestAt: minuteOf(String(raw.digest_at ?? "08:00")) ?? 8 * 60,
    snoozeMinutes: num("snooze_minutes", 60),
  };
}

/** How long a nudge stays worth showing after its moment, and how far ahead the plan looks. */
export const RING = 30 * MIN;
const DIGEST_RINGS = 2 * HOUR;
export const AHEAD = 36 * HOUR;
const STEP = 15 * MIN;
/** How long after a nudge a tick still counts as its answer (§3.3a). */
export const ANSWERED_WITHIN = 2 * HOUR;

const WEIGHT: Record<string, number> = { highest: 3, high: 2, medium: 1.4, normal: 1, low: 0.6, lowest: 0.3 };
const MARK: Record<string, string> = { highest: "🔺", high: "⏫", medium: "🔼" };

/** A notice for later, as the core's planned notices take it (planned.rs). */
export interface Planned {
  at: string;
  until: string;
  id: string;
  title: string;
  body: string;
  open?: string;
  subject?: string;
  actions: { id: string; label: string }[];
}

/** A ledger line to write, about `task` (none: the digest). */
export interface Write { entry: Entry; task?: TaskName }

/** One task's verdict, for "Why?" in Settings. */
export interface Decision { title: string; path: string; at?: string; score: number; why: string }

/** The day's budget: measured from the ledger, or the defaults until there is enough of it. */
export interface Budget { perDay: number; gap: number; measured: boolean; days: number; nudges: number; acted: number }

export interface Input {
  tasks: Task[];
  busy: Busy[];
  /** False when the calendar could not be read (its gaps are then taken as free, and the reasons say so). */
  calendarRead: boolean;
  /** Every device's ledger entries. */
  entries: Entry[];
  settings: Settings;
  clock: Clock;
  /** What the digest opens (the Deadlines page, when the vault has one). */
  digestOpens?: string | null;
}

export interface Output { planned: Planned[]; writes: Write[]; decisions: Decision[]; budget: Budget }

/** What the planner knows of a task. */
interface Judged {
  task: Task;
  key: string;
  titleKey: string;
  eligible: boolean;
  important: boolean;
  urgency: number;
  minutes: number;
  dateWords: string;
}

/** A task's own duration: `⏱ 45m` / `⏱ 1h30m` / `⏱ 90` on the line, else its first tag's default, else Settings'. */
export function minutesOf(t: Task, s: Settings): number {
  const m = /⏱️?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*(?:m|min)?)?/.exec(t.text);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  for (const tag of t.tags) {
    const d = s.durations[tag.toLowerCase()];
    if (d) return d;
  }
  return s.minutes;
}

/** Date pressure and its words: overdue 3 · due today 2.5 · scheduled today 2 · due tomorrow 1.6 · within the week
 *  1 + (7 − d)/14 · otherwise 0.5 (§3.3). */
function pressure(t: Task, today: string): { p: number; words: string } {
  let p = 0.5, words = "";
  const week = (d: number) => (d <= 7 ? 1 + (7 - d) / 14 : 0.5);
  if (t.due) {
    const d = daysBetween(today, t.due);
    p = d < 0 ? 3 : d === 0 ? 2.5 : d === 1 ? 1.6 : week(d);
    words = d < 0 ? `overdue ${-d} day${d === -1 ? "" : "s"}` : d === 0 ? "due today" : d === 1 ? "due tomorrow" : `due in ${d} days`;
  }
  if (t.scheduled) {
    const d = daysBetween(today, t.scheduled);
    const q = d <= 0 ? 2 : d === 1 ? 1.6 : week(d);
    if (q > p) {
      p = q;
      words = d < 0 ? "scheduled before today" : d === 0 ? "scheduled today" : d === 1 ? "scheduled tomorrow" : `scheduled in ${d} days`;
    }
  }
  return { p, words };
}

/** Which tasks may nudge (§3.1, decision 7): dated within the horizon or overdue, or priority ≥ high; not in an
 *  excluded folder; its 🛫 start come. Important (not budgeted): ⏫/🔺, overdue, due today. */
export function judge(t: Task, s: Settings, today: string): Judged {
  const name = { path: t.path, title: t.title, block: t.block };
  const high = t.priority === "high" || t.priority === "highest";
  const date = t.due ?? t.scheduled;
  const excluded = s.exclude.some((f) => t.path === f || t.path.startsWith(`${f}/`));
  const started = !t.start || t.start <= today;
  const within = !!date && daysBetween(today, date) <= s.horizon;
  const { p, words } = pressure(t, today);
  return {
    task: t,
    key: keyOf(name),
    titleKey: titleKey(name),
    eligible: !t.done && !excluded && started && (within || high),
    important: high || (!!t.due && t.due <= today),
    urgency: (WEIGHT[t.priority] ?? 1) * p,
    minutes: minutesOf(t, s),
    dateWords: words,
  };
}

/** The time the planner may use: outside quiet hours, outside busy events. */
class Free {
  constructor(private s: Settings, private busy: Busy[], private c: Clock) {}

  quiet(ms: number): boolean {
    const m = wall(ms, this.c).min, { quietFrom: a, quietTo: b } = this.s;
    return a === b ? false : a < b ? m >= a && m < b : m >= a || m < b;
  }

  taken(ms: number): boolean {
    return this.busy.some((b) => b.start <= ms && ms < b.end);
  }

  /** Where the gap that starts at `ms` ends: the next busy event or quiet hours. */
  gapEnd(ms: number): number {
    const w = wall(ms, this.c);
    const quiet = w.min < this.s.quietFrom ? instant(w.day, this.s.quietFrom, this.c) : instant(addDays(w.day, 1), this.s.quietFrom, this.c);
    const next = this.busy.filter((b) => b.start > ms).reduce((m, b) => Math.min(m, b.start), Infinity);
    return Math.min(quiet, next);
  }

  /** The moments to consider from `from`: itself, then every quarter hour for 36 hours, outside quiet and busy time. */
  moments(from: number): number[] {
    const out = [from];
    for (let t = Math.ceil((from + 1) / STEP) * STEP; t < from + AHEAD; t += STEP) out.push(t);
    return out.filter((t) => !this.quiet(t) && !this.taken(t));
  }

  /** How well the gap at `ms` holds `minutes`: 1 all of it, 0.4 half, else 0. */
  room(ms: number, minutes: number): { fit: number; free: number; until: number } {
    const until = this.gapEnd(ms), free = Math.round((until - ms) / MIN);
    return { fit: free >= minutes ? 1 : free >= minutes / 2 ? 0.4 : 0, free, until };
  }
}

/** Morning, afternoon or evening of a day: one nudge per task in each (§3.3). */
export function windowOf(ms: number, c: Clock): string {
  const w = wall(ms, c);
  return `${w.day} ${w.min < 12 * 60 ? "morning" : w.min < 18 * 60 ? "afternoon" : "evening"}`;
}

/** The budget measured from the last 28 days of ledger (§3.3a): N, the largest rank of the day still acted on (done or
 *  snoozed within 2 h) 25 % of the time and at half rank 1's rate at least, one more when the last rank seen was;
 *  G, the shortest gap whose acted-on rate is within 80 % of the best. 6 and 45 min until 14 days of ledger exist.
 *  A number pinned in Settings wins. */
export function measure(entries: Entry[], s: Settings, c: Clock): Budget {
  const since = c.now - 28 * DAY;
  const recent = entries.filter((e) => e.at >= since && e.at <= c.now);
  const days = new Set(recent.map((e) => wall(e.at, c).day)).size;
  const nudges = recent.filter((e) => e.kind === "nudged" && e.at < c.now - ANSWERED_WITHIN).sort((a, b) => a.at - b.at);
  const acted = (n: Entry) => recent.some((e) => (e.kind === "done" || e.kind === "snoozed") && (e.key === n.key || e.titleKey === n.titleKey) && e.at > n.at && e.at <= n.at + ANSWERED_WITHIN);
  const budgeted = nudges.filter((n) => !n.important);
  const actedOn = budgeted.filter(acted).length;
  let perDay = 6, gap = 45;
  const measured = days >= 14;
  if (measured) {
    const byRank = new Map<number, [number, number]>(), byGap = new Map<number, [number, number]>();
    const count = (m: Map<number, [number, number]>, k: number, hit: boolean) => { const v = m.get(k) ?? [0, 0]; v[0] += hit ? 1 : 0; v[1] += 1; m.set(k, v); };
    const perDayList = new Map<string, Entry[]>();
    for (const n of nudges) {
      const d = wall(n.at, c).day;
      perDayList.set(d, [...(perDayList.get(d) ?? []), n]);
    }
    const BUCKETS = [15, 30, 45, 60, 90, 120];
    for (const list of perDayList.values()) {
      let rank = 0;
      list.forEach((n, i) => {
        if (n.important) return;
        rank += 1;
        const hit = acted(n);
        count(byRank, rank, hit);
        if (i > 0) {
          const g = (n.at - list[i - 1].at) / MIN;
          count(byGap, [...BUCKETS].reverse().find((b) => b <= g) ?? 15, hit);
        }
      });
    }
    const rate = (v?: [number, number]) => (v && v[1] ? v[0] / v[1] : 0);
    const ranks = [...byRank.keys()].sort((a, b) => a - b);
    const first = rate(byRank.get(1));
    const ok = ranks.filter((k) => rate(byRank.get(k)) >= 0.25 && rate(byRank.get(k)) >= 0.5 * first);
    const k = ok.length ? Math.max(...ok) : 2;
    perDay = Math.min(12, Math.max(2, ranks.length && k === Math.max(...ranks) ? k + 1 : k));
    const known = BUCKETS.filter((b) => (byGap.get(b)?.[1] ?? 0) >= 3);
    const best = Math.max(0, ...known.map((b) => rate(byGap.get(b))));
    gap = known.find((b) => best > 0 && rate(byGap.get(b)) >= 0.8 * best) ?? 45;
  }
  if (s.maxPerDay > 0) perDay = s.maxPerDay;
  if (s.minGap > 0) gap = s.minGap;
  return { perDay, gap, measured, days, nudges: budgeted.length, acted: actedOn };
}

/** "16:30", "tomorrow 09:00", "Tue 09:00": a moment as a button says it. */
function when(ms: number, c: Clock): string {
  const w = wall(ms, c), today = wall(c.now, c).day;
  const d = daysBetween(today, w.day);
  const day = d === 0 ? "" : d === 1 ? "tomorrow " : `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${w.day}T12:00:00Z`).getUTCDay()]} `;
  return `${day}${hhmm(w.min)}`;
}

/** Where Snooze puts a nudge at `at` off to: the first gap that holds the task, at least `snoozeMinutes` later. */
function snoozeTo(at: number, j: Judged, free: Free, s: Settings): number {
  const from = floorMinute(at + s.snoozeMinutes * MIN);
  return free.moments(from).find((t) => free.room(t, j.minutes).fit === 1) ?? from;
}

/** The planned notice of a nudge at `at`. */
function nudge(j: Judged, at: number, why: string, free: Free, s: Settings, c: Clock): Planned {
  const t = j.task, later = snoozeTo(at, j, free, s);
  return {
    at: rfc3339(at, c),
    until: rfc3339(at + RING, c),
    id: `plan:${j.key}`,
    title: t.title,
    body: why,
    open: t.path,
    ...(t.block ? { subject: `${t.path}#^${t.block}` } : {}),
    actions: [
      { id: "done", label: "Done" },
      { id: `snooze:${stamp(later, c).replace(" ", "T")}`, label: `Snooze to ${when(later, c)}` },
      { id: "atlas:open", label: "Open" },
    ],
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The plan for the next 36 hours, and the ledger lines its due moments make (a nudge whose moment has come when the
 *  plan is asked is recorded as nudged: the core asks just before it rings, planned.rs). */
export function plan(input: Input): Output {
  const { settings: s, clock: c } = input;
  const now = c.now, today = wall(now, c).day;
  const entries = [...input.entries].sort((a, b) => b.at - a.at);
  const writes: Write[] = [], planned: Planned[] = [], decisions: Decision[] = [];
  const budget = measure(entries, s, c);
  const name = (t: Task): TaskName => ({ path: t.path, title: t.title, block: t.block });

  // a task nudged or snoozed that is now ticked: its answer, for the budget's measure (done within 2 h)
  const open = input.tasks.filter((t) => !t.done);
  const openKeys = new Set(open.map((t) => keyOf(name(t))));
  for (const t of input.tasks.filter((t) => t.done)) {
    const k = keyOf(name(t)), last = entries.find((e) => e.key === k);
    if (last && (last.kind === "nudged" || last.kind === "snoozed") && !openKeys.has(k)) {
      writes.push({ entry: { at: floorMinute(now), kind: "done", key: k, detail: "seen ticked" }, task: name(t) });
    }
  }
  const free = new Free(s, input.busy, c);
  const nudged = entries.filter((e) => e.kind === "nudged");
  const taken: { at: number; important: boolean }[] = nudged.map((e) => ({ at: e.at, important: !!e.important }));
  const commit = (j: Judged, at: number, important: boolean, why: string, score: number) => {
    const entry: Entry = { at, kind: "nudged", key: j.key, titleKey: j.titleKey, important, detail: `score ${round1(score)} · ${why}` };
    writes.push({ entry, task: name(j.task) });
  };
  const calendarNote = input.calendarRead ? "" : ", calendar not read";

  const judged = open.map((t) => judge(t, s, today));
  const waiting: Judged[] = [];
  for (const j of s.nudges ? judged : []) {
    const last = entries.find((e) => e.key === j.key);
    // still ringing: the nudge already made stays in the plan until it is over (dropping it would withdraw it)
    // (by its own key: a recurring task's next occurrence never inherits the ticked one's nudge)
    const ringing = nudged.find((e) => e.key === j.key && e.at <= now && now < e.at + RING);
    if (ringing) {
      const why = ringing.detail.replace(/^score [\d.]+ · /, "");
      planned.push(nudge(j, ringing.at, why, free, s, c));
      decisions.push({ title: j.task.title, path: j.task.path, at: rfc3339(ringing.at, c), score: 0, why: `ringing · ${why}` });
      continue;
    }
    // a snooze is a promise: kept at its moment, whatever the score (§3.3)
    if (last?.kind === "snoozed" && last.until !== undefined && now < last.until + RING) {
      const at = last.until, why = `snoozed to ${hhmm(wall(at, c).min)}${j.dateWords ? `, ${j.dateWords}` : ""}`;
      if (at <= now) commit(j, at, true, why, j.urgency);
      planned.push(nudge(j, at, why, free, s, c));
      taken.push({ at, important: true });
      decisions.push({ title: j.task.title, path: j.task.path, at: rfc3339(at, c), score: round1(j.urgency), why });
      continue;
    }
    if (j.eligible) waiting.push(j);
  }

  // the most urgent first; each takes its best moment the limits leave
  waiting.sort((a, b) => b.urgency - a.urgency || String(a.task.due ?? "9").localeCompare(String(b.task.due ?? "9")));
  const firstMoment = floorMinute(now);
  const moments = free.moments(firstMoment);
  const scheduledToday = new Set<string>();
  for (const j of waiting) {
    const best = (fit: number) => moments.filter((t) => free.room(t, j.minutes).fit === fit);
    let chosen: number | undefined, held = "";
    for (const t of [...best(1), ...best(0.4)]) {
      const score = j.urgency * free.room(t, j.minutes).fit;
      if (score < s.threshold) { held = `score ${round1(score)} below ${s.threshold}`; break; }
      const win = windowOf(t, c);
      if (nudged.some((e) => (e.key === j.key || e.titleKey === j.titleKey) && windowOf(e.at, c) === win)) { held = "nudged in this window"; continue; }
      if (!j.important) {
        const day = wall(t, c).day;
        if (taken.filter((x) => !x.important && wall(x.at, c).day === day).length >= budget.perDay) { held = `${budget.perDay} a day already`; continue; }
        if (taken.some((x) => Math.abs(x.at - t) < budget.gap * MIN)) { held = `within ${budget.gap} min of another`; continue; }
      }
      chosen = t;
      break;
    }
    if (chosen === undefined) {
      decisions.push({ title: j.task.title, path: j.task.path, score: round1(j.urgency), why: held || "no free moment in 36 h" });
      continue;
    }
    const room = free.room(chosen, j.minutes), score = j.urgency * room.fit;
    const end = hhmm(wall(room.until, c).min);
    const roomWords = room.until - chosen >= AHEAD ? "free" : room.free >= 120 ? `free until ${end}` : `${room.free} min free until ${end}`;
    const why = [j.dateWords, MARK[j.task.priority], roomWords].filter(Boolean).join(", ") + calendarNote;
    if (chosen <= now) commit(j, chosen, j.important, why, score);
    planned.push(nudge(j, chosen, why, free, s, c));
    taken.push({ at: chosen, important: j.important });
    if (wall(chosen, c).day === today) scheduledToday.add(j.key);
    decisions.push({ title: j.task.title, path: j.task.path, at: rfc3339(chosen, c), score: round1(score), why });
  }

  if (s.digest) digest(input, judged, scheduledToday, entries, writes, planned);
  return { planned, writes, decisions, budget };
}

/** The morning digest (§3.3): once a day at the first moment after quiet hours (not before Settings' time): what is
 *  overdue and due today, and how many tasks that may nudge have no moment today. */
function digest(input: Input, judged: Judged[], scheduledToday: Set<string>, entries: Entry[], writes: Write[], planned: Planned[]) {
  const { settings: s, clock: c } = input;
  const now = c.now, today = wall(now, c).day;
  const from = instant(today, Math.max(s.quietTo, s.digestAt), c);
  const given = entries.find((e) => e.kind === "digest" && wall(e.at, c).day === today);
  // given today: kept in the plan while it rings; not given and the day's quiet hours have begun: none today
  if (given ? now >= given.at + DIGEST_RINGS : now >= from && new Free(s, [], c).quiet(now)) return;
  const overdue = judged.filter((j) => j.task.due && j.task.due < today);
  const dueToday = judged.filter((j) => j.task.due === today);
  const unslotted = judged.filter((j) => j.eligible && !scheduledToday.has(j.key) && !overdue.includes(j) && !dueToday.includes(j));
  const counts = [overdue.length && `${overdue.length} overdue`, dueToday.length && `${dueToday.length} due today`, unslotted.length && `${unslotted.length} with no slot today`].filter(Boolean).join(", ");
  const names = [...overdue, ...dueToday].slice(0, 3).map((j) => j.task.title);
  const moment = given ? given.at : now >= from ? floorMinute(now) : from;
  if (!given && moment <= now) writes.push({ entry: { at: moment, kind: "digest", detail: counts || "nothing due" } });
  // nothing due: the ledger records the day was looked at, but a notice saying so is noise
  if (!counts) return;
  planned.push({
    at: rfc3339(moment, c),
    until: rfc3339(moment + DIGEST_RINGS, c),
    id: `plan:digest:${today}`,
    title: `Today: ${counts}`,
    body: names.join(" · "),
    ...(input.digestOpens ? { open: input.digestOpens } : {}),
    actions: input.digestOpens ? [{ id: "atlas:open", label: "Open" }] : [],
  });
}
