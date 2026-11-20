// The planner (DESIGN-calendar-tasks-nudges.md §3): which open tasks may nudge, when, and why — pure, so the tests run
// it on a fixed clock with a fake calendar. helper.ts feeds it the vault's tasks, the calendar's busy time and the
// ledgers, and writes back what it decided.
//
// Slices 4 and 6: urgency × room × the habit of the hour × fatigue, quiet hours, the calendar's busy time, one nudge
// per task per window, a budget of N a day with a gap of G minutes measured from the ledger (§3.3a; important tasks
// exempt), snoozes honoured, the morning digest. A nudge is planned at the first gap that holds the task; once the
// ledger holds 10 done times for its kind (its first tag, else its folder), at the hour of that same day it is most
// often done (the habit ranks the moments the threshold and the limits leave; it never holds a nudge back).
import { hoursOf, keyOf, lineMark, markOf, titleKey, type Entry, type TaskName } from "./ledger";
import { addDays, DAY, daysBetween, floorMinute, hhmm, HOUR, instant, MIN, minuteOf, rfc3339, stamp, wall, type Clock } from "./time";
import { habitPlan, type HabitRule } from "./habits";


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
  /** Use the quiet hours measured from the devices' use (quietOf) instead of the range above, once they exist. */
  quietMeasured: boolean;
  horizon: number;
  /** An open task with no date may nudge once it has waited this many days (its ➕ date, else its note's date): 0 = never. */
  stale: number;
  /** …and no longer once it has waited more than this many days: left that long, it is a someday, not a to-do. */
  staleMax: number;
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
    quietMeasured: raw.quiet_measured === true,
    horizon: num("horizon", 7),
    stale: num("stale", 2),
    staleMax: num("stale_max", 30),
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
const PART = (min: number) => (min < 12 * 60 ? "morning" : min < 18 * 60 ? "afternoon" : "evening");
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
  /** When the person last used this device (ms; the core's presence), null or absent while unknown. */
  activeAt?: number | null;
  /** This device plans for itself, the planner's plan being stale (next.ts): its nudges say so in the ledger. */
  local?: boolean;
  /** How the nudges recorded now go out, when not as this device's notices: `NTFY` (fallback.ts), said in the ledger. */
  mark?: string;
  /** The habit notes (habits.ts): nagged in their windows. */
  habits?: HabitRule[];
  /** A calendar plugin can time-block a task (Calendar's `time_block`): each nudge offers Block, in Snooze's slot. */
  canBlock?: boolean;
  /** The tasks open at this device's previous round (their keys; the helper keeps them between rounds, none at its
   *  first): one of them ticked since, never nudged, is a done time for its kind's habit, to the round's 5 minutes. */
  wasOpen?: ReadonlySet<string>;
}

export interface Output { planned: Planned[]; writes: Write[]; decisions: Decision[]; budget: Budget; habits: Habit[]; quiet: Quiet }

/** The quiet hours measured from the devices' use (§3.3a): the range proposed (minutes of the day, whole hours; null
 *  while fewer than QUIET_DAYS days of use are known, or when no hour is quiet), the days it was measured on, and
 *  whether the plan uses it (Settings' `quiet_measured`). */
export interface Quiet { from: number | null; to: number | null; days: number; measured: boolean; used: boolean }

/** Days of use the quiet hours are measured on before they are proposed (§3.3a: 14), and the share of those days an
 *  hour must have been unused on to be quiet (80 %). */
export const QUIET_DAYS = 14;
const QUIET_SHARE = 0.8;

/** The quiet hours measured from the last 28 days (§3.3a): the days some device wrote a `used` line for; an hour is in
 *  use on such a day when a device was seen in use in it or a task was ticked in it (the ledger's done lines), and
 *  quiet when it was in use on no more than a fifth of the days. The range proposed is the longest run of quiet hours
 *  (across midnight; on a tie the one holding 03:00, else the first). */
export function quietOf(entries: Entry[], c: Clock): Quiet {
  const today = wall(c.now, c).day, since = addDays(today, -28);
  const byDay = new Map<string, Set<number>>();
  for (const e of entries) {
    const day = wall(e.at, c).day;
    if (e.kind !== "used" || day < since || day >= today) continue;
    const hours = byDay.get(day) ?? new Set<number>();
    for (const h of hoursOf(e.detail)) hours.add(h);
    byDay.set(day, hours);
  }
  for (const e of entries) {
    const w = wall(e.at, c);
    if (e.kind === "done") byDay.get(w.day)?.add(Math.floor(w.min / 60));
  }
  const days = byDay.size;
  const none: Quiet = { from: null, to: null, days, measured: days >= QUIET_DAYS, used: false };
  if (days < QUIET_DAYS) return none;
  const quiet = Array.from({ length: 24 }, (_, h) => [...byDay.values()].filter((hs) => !hs.has(h)).length >= QUIET_SHARE * days);
  if (quiet.every(Boolean) || !quiet.some(Boolean)) return none;
  // runs of quiet hours, walked from an hour in use so a run across midnight is one
  const start = quiet.indexOf(false);
  type Run = { from: number; len: number };
  const holds3 = (r: Run) => (3 - r.from + 24) % 24 < r.len;
  const runs: Run[] = [];
  for (let i = 1; i <= 24; i++) {
    const h = (start + i) % 24, last = runs[runs.length - 1];
    if (!quiet[h]) continue;
    if (last && (last.from + last.len) % 24 === h) last.len += 1;
    else runs.push({ from: h, len: 1 });
  }
  const best = runs.reduce((a, r) => (r.len > a.len || (r.len === a.len && holds3(r) && !holds3(a)) ? r : a));
  return { ...none, from: best.from * 60, to: ((best.from + best.len) % 24) * 60 };
}

/** When a kind of task tends to get done (§3.2): its done times from the ledger, by hour of the day — over every day
 *  (`hours`), and per weekday (`days[0]` Sunday … `days[6]`, 24 hours each). */
export interface Habit { group: string; done: number; hours: number[]; days: number[][] }

/** Done times a kind needs before they move its nudges (decision 10). */
export const HABIT_MIN = 10;

/** A task's kind for its habit: its first tag (`#writing`), else its note's folder (`notes/thesis/`, `/` at the top). */
export function groupOf(t: Pick<Task, "path" | "tags">): string {
  if (t.tags[0]) return `#${t.tags[0].replace(/^#/, "").toLowerCase()}`;
  const i = t.path.lastIndexOf("/");
  return i < 0 ? "/" : `${t.path.slice(0, i)}/`;
}

/** The habits from the ledger's done lines of the last 90 days, each matched to its task (still listed, done or not)
 *  for its kind; a done line whose task is gone is left out. */
export function habitsOf(entries: Entry[], tasks: Task[], c: Clock): Map<string, Habit> {
  const byKey = new Map<string, Task>();
  for (const t of tasks) {
    const n = { path: t.path, title: t.title, block: t.block };
    byKey.set(keyOf(n), t);
    if (!byKey.has(titleKey(n))) byKey.set(titleKey(n), t);
  }
  const out = new Map<string, Habit>();
  for (const e of entries) {
    if (e.kind !== "done" || e.at < c.now - 90 * DAY || e.at > c.now) continue;
    const t = (e.key && byKey.get(e.key)) || (e.titleKey && byKey.get(e.titleKey));
    if (!t) continue;
    const g = groupOf(t), h = out.get(g) ?? { group: g, done: 0, hours: Array(24).fill(0), days: Array.from({ length: 7 }, () => Array(24).fill(0)) };
    const hour = Math.floor(wall(e.at, c).min / 60);
    h.hours[hour] += 1;
    h.days[weekdayOf(e.at, c)][hour] += 1;
    h.done += 1;
    out.set(g, h);
  }
  return out;
}

/** The local weekday of `ms` (0 Sunday … 6 Saturday). */
const weekdayOf = (ms: number, c: Clock) => new Date(`${wall(ms, c).day}T12:00:00Z`).getUTCDay();

/** Pseudo-records of the every-day profile a weekday's profile starts from (decision 10's HABIT_MIN): with none of its
 *  own a weekday is the every-day profile, and its own done times take over as they come (24 × 7 cells want far more
 *  than 10 records, so a weekday is never judged from its few alone). */
export const WEEKDAY_PRIOR = HABIT_MIN;

/** The habit of the hour (§3.3): 0.5 + the hour's share of the busiest, smoothed over the hours beside it — from 0.5
 *  to 1.5; 1 for a kind with fewer than HABIT_MIN done times. The profile is the moment's weekday's, shrunk toward
 *  the every-day one by WEEKDAY_PRIOR pseudo-records. */
export function habitFactor(h: Habit | undefined, ms: number, c: Clock): number {
  if (!h || h.done < HABIT_MIN) return 1;
  const smooth = (hours: number[], i: number) => hours[i] + 0.5 * (hours[(i + 23) % 24] + hours[(i + 1) % 24]);
  const all = h.hours.map((_, i) => smooth(h.hours, i)), allSum = all.reduce((a, b) => a + b, 0);
  const own = h.days?.[weekdayOf(ms, c)] ?? Array(24).fill(0);
  const mine = own.map((_, i) => smooth(own, i)), mineSum = mine.reduce((a, b) => a + b, 0);
  const profile = all.map((x, i) => (mine[i] + WEEKDAY_PRIOR * (allSum ? x / allSum : 0)) / (mineSum + WEEKDAY_PRIOR));
  const top = Math.max(...profile);
  return top > 0 ? 0.5 + profile[Math.floor(wall(ms, c).min / 60)] / top : 1;
}

/** Fatigue (§3.3): × 0.8 for each nudge of any task in the hour before `ms`. */
const fatigue = (taken: { at: number }[], ms: number) => 0.8 ** taken.filter((x) => x.at < ms && x.at > ms - HOUR).length;

/** The mark of a nudge a device planned for itself (§3.7, "Offline"). */
const LOCAL = " · (local plan)";
/** The marks a nudge's ledger line may end in (this one, fallback.ts's ntfy), left out of its reasons. */
const MARKS = / · \((?:local plan|ntfy)\)/g;

/** Presence (§3.3): no use of this device for AWAY_AFTER weighs a nudge now by AWAY; later moments are not weighed
 *  (whoever comes back is there then). Unknown presence weighs nothing. */
export const AWAY_AFTER = 30 * MIN;
const AWAY = 0.6;
const awaySince = (activeAt: number | null | undefined, now: number) => (activeAt && now - activeAt >= AWAY_AFTER ? activeAt : null);

/** Dismissals that pause a task (§3.5): this many of the same line within DISMISS_DAYS. */
export const DISMISS_PAUSE = 3;
const DISMISS_DAYS = 3;

/** The dismissals of this version of the task (its line unchanged since), newest first. */
const dismissalsOf = (entries: Entry[], j: { key: string; titleKey: string; task: { text: string } }) => {
  const mark = lineMark(j.task.text);
  return entries.filter((e) => e.kind === "dismissed" && (e.key === j.key || e.titleKey === j.titleKey) && markOf(e) === mark);
};

/** × 0.6 for each dismissal of the task on the day of `ms`. */
const dismissedFactor = (dismissed: Entry[], ms: number, c: Clock) => 0.6 ** dismissed.filter((e) => e.at < ms && wall(e.at, c).day === wall(ms, c).day).length;

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

/** When a task was written: its ➕ created date, else a date in its note's name (a daily log's `2026-11-05.md`, a
 *  report's "… 2026-11-04 to 11-18": the first full date) — null when neither says. */
export function writtenOf(t: Task): string | null {
  const created = /➕\s*(\d{4}-\d{2}-\d{2})/u.exec(t.text);
  if (created) return created[1];
  const name = t.path.split("/").pop() ?? "";
  return /(\d{4}-\d{2}-\d{2})/.exec(name)?.[1] ?? null;
}

/** Which tasks may nudge (§3.1, decision 7): dated within the horizon or overdue, or priority ≥ high — and, with no
 *  date at all, one left open `stale` days or more (most real to-dos are written undated: a daily log's `- [ ] …`
 *  lines; without this nothing ever qualified) but not over `staleMax` (a task open for months is a someday: those
 *  rang, 164 to 418 days old). Not in an excluded folder, not untitled; its 🛫 start come. Important
 *  (not budgeted): ⏫/🔺, overdue, due today — an old undated task never is, so the budget holds it. */
export function judge(t: Task, s: Settings, today: string): Judged {
  const name = { path: t.path, title: t.title, block: t.block };
  const high = t.priority === "high" || t.priority === "highest";
  const date = t.due ?? t.scheduled;
  const excluded = s.exclude.some((f) => t.path === f || t.path.startsWith(`${f}/`));
  const started = !t.start || t.start <= today;
  const within = !!date && daysBetween(today, date) <= s.horizon;
  const written = date ? null : writtenOf(t);
  const waited = written ? daysBetween(written, today) : -1;
  const stale = !date && s.stale > 0 && waited >= s.stale && waited <= s.staleMax;
  const pr = pressure(t, today);
  // an old undated task presses as a task due within the week does, a little more each day it waits (1 → 1.5 over a
  // fortnight): enough to pass the threshold in a free gap, never as much as one due tomorrow (1.6)
  const p = stale ? 1 + Math.min(waited - s.stale, 14) / 28 : pr.p;
  const words = stale ? `open ${waited} days` : pr.words;
  return {
    task: t,
    key: keyOf(name),
    titleKey: titleKey(name),
    eligible: !t.done && !excluded && started && !!t.title.trim() && (within || high || stale),
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
  return `${w.day} ${PART(w.min)}`;
}

/** The budget measured from the last 28 days of ledger (§3.3a): N, the largest rank of the day still acted on (done or
 *  snoozed within 2 h) 25 % of the time and at half rank 1's rate at least, one more when the last rank seen was;
 *  G, the shortest gap whose acted-on rate is within 80 % of the best. 6 and 45 min until 14 days of ledger exist.
 *  A number pinned in Settings wins. */
export function measure(entries: Entry[], s: Settings, c: Clock): Budget {
  const since = c.now - 28 * DAY;
  const recent = entries.filter((e) => e.at >= since && e.at <= c.now && e.kind !== "used");
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

/** A Block button's action id: the slot's start and its length in minutes (`block:2026-11-16T16:00+30`). */
export function blockAction(start: string, minutes: number): string {
  return `block:${start.replace(" ", "T")}+${minutes}`;
}

/** The slot a Block action names, or null when it is not one. */
export function blockOf(action: string): { start: string; minutes: number } | null {
  const m = /^block:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\+(\d+)$/.exec(action);
  return m ? { start: m[1], minutes: Number(m[2]) } : null;
}

/** A task's words as a notification shows them: an embedded picture or note left out, a link as its text
 *  (`[[note|text]]` → text, `[[folder/note]]` → note, `[text](url)` → text) — a log line often starts with a pasted
 *  picture. The title itself (what names the task in the ledger) is never changed. */
export function shown(title: string): string {
  const out = title
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, (_, t: string) => t.split("#")[0].split("/").pop() ?? t)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return out || "A task with a picture";
}

/** The planned notice of a nudge at `at`. Block (when the calendar can) comes before Open: a phone shows three
 *  buttons, and a tap on the notification opens the task anyway. */
function nudge(j: Judged, at: number, why: string, free: Free, s: Settings, c: Clock, canBlock = false): Planned {
  const t = j.task, later = snoozeTo(at, j, free, s);
  return {
    at: rfc3339(at, c),
    until: rfc3339(at + RING, c),
    id: `plan:${j.key}`,
    title: shown(t.title),
    body: why,
    open: t.path,
    ...(t.block ? { subject: `${t.path}#^${t.block}` } : {}),
    actions: [
      { id: "done", label: "Done" },
      { id: `snooze:${stamp(later, c).replace(" ", "T")}`, label: `Snooze to ${when(later, c)}` },
      ...(canBlock ? [{ id: blockAction(stamp(later, c), j.minutes), label: `Block ${when(later, c)}` }] : []),
      { id: "atlas:open", label: "Open" },
    ],
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The plan for the next 36 hours, and the ledger lines its due moments make (a nudge whose moment has come when the
 *  plan is asked is recorded as nudged: the core asks just before it rings, planned.rs). */
export function plan(input: Input): Output {
  // the quiet hours measured replace Settings' range only when asked (`quiet_measured`) and once they exist
  const measuredQuiet = quietOf(input.entries, input.clock);
  const quiet: Quiet = { ...measuredQuiet, used: input.settings.quietMeasured && measuredQuiet.from !== null };
  if (quiet.used) input = { ...input, settings: { ...input.settings, quietFrom: quiet.from!, quietTo: quiet.to! } };
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
    if (openKeys.has(k)) continue;
    if (last && (last.kind === "nudged" || last.kind === "snoozed" || last.kind === "dismissed")) {
      writes.push({ entry: { at: floorMinute(now), kind: "done", key: k, detail: "seen ticked" }, task: name(t) });
    } else if (input.wasOpen?.has(k) && !entries.some((e) => e.key === k && e.kind === "done")) {
      // ticked since the last round without a nudge: when it was done is known to the round, and teaches the habit
      writes.push({ entry: { at: floorMinute(now), kind: "done", key: k, detail: "seen ticked, never nudged" }, task: name(t) });
    }
  }
  const free = new Free(s, input.busy, c);
  const nudged = entries.filter((e) => e.kind === "nudged");
  const taken: { at: number; important: boolean }[] = nudged.map((e) => ({ at: e.at, important: !!e.important }));
  const commit = (j: Judged, at: number, important: boolean, why: string, score: number) => {
    const entry: Entry = { at, kind: "nudged", key: j.key, titleKey: j.titleKey, important, detail: `score ${round1(score)} · ${why}${input.local ? LOCAL : ""}${input.mark ?? ""}` };
    writes.push({ entry, task: name(j.task) });
  };
  const calendarNote = input.calendarRead ? "" : ", calendar not read";
  const away = awaySince(input.activeAt, now);
  const presence = (t: number) => (away !== null && t <= now ? AWAY : 1);
  const awayNote = away === null ? "" : `, no one at this device since ${wall(away, c).day === today ? hhmm(wall(away, c).min) : wall(away, c).day}`;

  const judged = open.map((t) => judge(t, s, today));
  const waiting: Judged[] = [];
  for (const j of s.nudges ? judged : []) {
    const last = entries.find((e) => e.key === j.key);
    // still ringing: the nudge already made stays in the plan until it is over (dropping it would withdraw it)
    // (by its own key: a recurring task's next occurrence never inherits the ticked one's nudge)
    const ringing = nudged.find((e) => e.key === j.key && e.at <= now && now < e.at + RING);
    if (ringing) {
      const why = ringing.detail.replace(/^score [\d.]+ · /, "").replace(MARKS, "");
      planned.push(nudge(j, ringing.at, why, free, s, c, input.canBlock));
      decisions.push({ title: shown(j.task.title), path: j.task.path, at: rfc3339(ringing.at, c), score: 0, why: `ringing · ${why}` });
      continue;
    }
    // a snooze is a promise: kept at its moment, whatever the score (§3.3)
    if (last?.kind === "snoozed" && last.until !== undefined && now < last.until + RING) {
      const at = last.until, why = `snoozed to ${hhmm(wall(at, c).min)}${j.dateWords ? `, ${j.dateWords}` : ""}`;
      if (at <= now) commit(j, at, true, why, j.urgency);
      planned.push(nudge(j, at, why, free, s, c, input.canBlock));
      taken.push({ at, important: true });
      decisions.push({ title: shown(j.task.title), path: j.task.path, at: rfc3339(at, c), score: round1(j.urgency), why });
      continue;
    }
    // dismissed DISMISS_PAUSE times in DISMISS_DAYS: paused until its line changes or it comes due (§3.5)
    const dismissed = dismissalsOf(entries, j).filter((e) => e.at > now - DISMISS_DAYS * DAY);
    if (j.eligible && dismissed.length >= DISMISS_PAUSE && !(j.task.due && j.task.due <= today)) {
      decisions.push({ title: shown(j.task.title), path: j.task.path, score: round1(j.urgency), why: `paused: dismissed ${dismissed.length} times since ${wall(dismissed[dismissed.length - 1].at, c).day}; editing the task, or its due day, brings it back` });
      continue;
    }
    if (j.eligible) waiting.push(j);
  }

  // the most urgent first; each takes its best moment the limits leave
  waiting.sort((a, b) => b.urgency - a.urgency || String(a.task.due ?? "9").localeCompare(String(b.task.due ?? "9")));
  const firstMoment = floorMinute(now);
  const moments = free.moments(firstMoment);
  const scheduledToday = new Set<string>();
  const habits = habitsOf(entries, input.tasks, c);
  for (const j of waiting) {
    const habit = habits.get(groupOf(j.task));
    const learnt = !!habit && habit.done >= HABIT_MIN;
    // the threshold is judged without the habit (it moves a nudge within its day, never holds it to another)
    const dismissed = dismissalsOf(entries, j);
    const scoreAt = (t: number) => j.urgency * free.room(t, j.minutes).fit * fatigue(taken, t) * dismissedFactor(dismissed, t, c) * presence(t);
    const best = (fit: number) => moments.filter((t) => free.room(t, j.minutes).fit === fit);
    // the moments the limits leave, in order; the first, or — once the kind has a habit — the best of that day's
    let chosen: number | undefined, top = 0, held = "";
    for (const t of [...best(1), ...best(0.4)]) {
      if (chosen !== undefined && (!learnt || wall(t, c).day !== wall(chosen, c).day || free.room(t, j.minutes).fit !== free.room(chosen, j.minutes).fit)) break;
      const score = scoreAt(t);
      if (score < s.threshold) { held ||= `score ${round1(score)} below ${s.threshold}${presence(t) < 1 ? awayNote : ""}`; continue; }
      const win = windowOf(t, c);
      if (nudged.some((e) => (e.key === j.key || e.titleKey === j.titleKey) && windowOf(e.at, c) === win)) { held = "nudged in this window"; continue; }
      if (!j.important) {
        const day = wall(t, c).day;
        if (taken.filter((x) => !x.important && wall(x.at, c).day === day).length >= budget.perDay) { held = `${budget.perDay} a day already`; continue; }
        if (taken.some((x) => Math.abs(x.at - t) < budget.gap * MIN)) { held = `within ${budget.gap} min of another`; continue; }
      }
      const ranked = score * habitFactor(habit, t, c);
      if (chosen === undefined || ranked > top + 1e-9) { chosen = t; top = ranked; }
    }
    if (chosen === undefined) {
      decisions.push({ title: shown(j.task.title), path: j.task.path, score: round1(j.urgency), why: held || "no free moment in 36 h" });
      continue;
    }
    const room = free.room(chosen, j.minutes), score = scoreAt(chosen);
    const end = hhmm(wall(room.until, c).min);
    const roomWords = room.until - chosen >= AHEAD ? "free" : room.free >= 120 ? `free until ${end}` : `${room.free} min free until ${end}`;
    const usual = learnt && habitFactor(habit, chosen, c) >= 1.25 ? `you usually finish ${habit!.group.startsWith("#") ? habit!.group : `tasks in ${habit!.group}`} in the ${PART(wall(chosen, c).min)}` : "";
    const why = [j.dateWords, MARK[j.task.priority], roomWords, usual].filter(Boolean).join(", ") + calendarNote;
    if (chosen <= now) commit(j, chosen, j.important, why, score);
    planned.push(nudge(j, chosen, why, free, s, c, input.canBlock));
    taken.push({ at: chosen, important: j.important });
    if (wall(chosen, c).day === today) scheduledToday.add(j.key);
    decisions.push({ title: shown(j.task.title), path: j.task.path, at: rfc3339(chosen, c), score: round1(score), why });
  }

  if (s.digest) digest(input, judged, scheduledToday, entries, writes, planned);
  // the habits' nags: asked for by the person, so outside the budget and the quiet hours (habits.ts)
  const nags = habitPlan(input.habits ?? [], entries, c, `${input.local ? LOCAL : ""}${input.mark ?? ""}`);
  planned.push(...nags.planned);
  writes.push(...nags.writes);
  return { planned, writes, decisions, budget, habits: [...habits.values()].sort((a, b) => b.done - a.done), quiet };
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
  const names = [...overdue, ...dueToday, ...unslotted].slice(0, 3).map((j) => shown(j.task.title));
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
