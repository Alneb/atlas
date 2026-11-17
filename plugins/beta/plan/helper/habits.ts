// Habits (docs/design/DESIGN-habits.md, slice 1; DESIGN-calendar-tasks-nudges.md, slice 8): a habit is a note in the
// habits folder — `habit:` its kind, `days:`, `window:` ("17:00-20:00"), `nag:` (minutes between nags), `paused:` —
// and a preset fills what it leaves out. In its window it is nagged every `nag` minutes until Done or Skip today:
// outside the day's budget and the quiet hours, since the person asked for it. What happened is the ledger's, as for
// tasks: `nudged` (each nag, important), `done`, `dismissed · skipped today`.
//
// Set up in one line from any capture: `habit gym mon wed fri 18:00`, `habit sleep 23:30`, `habit read daily
// 21:00-22:00` — the note is made once (`setupOf`), and from then on it is the person's to edit.
import { keyOf, type Entry, type TaskName } from "./ledger";
import { addDays, hhmm, instant, MIN, minuteOf, rfc3339, wall, type Clock } from "./time";
import type { Planned, Write } from "./plan";

const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const EVERY = [...WEEK];

/** What a habit's kind means when its note does not say. */
interface Preset { days: string[]; from: number; to: number; nag: number }
export const PRESETS: Record<string, Preset> = {
  gym: { days: ["mon", "wed", "fri"], from: 17 * 60, to: 20 * 60, nag: 30 },
  running: { days: ["tue", "thu", "sat"], from: 7 * 60, to: 9 * 60, nag: 30 },
  sleep: { days: EVERY, from: 23 * 60, to: 24 * 60, nag: 15 },
};
/** Any other kind: every day, an hour from 09:00 (or from the time given). */
const PLAIN: Preset = { days: EVERY, from: 9 * 60, to: 10 * 60, nag: 30 };

/** A habit as its note says it, the preset filling the rest. Minutes of the day; `to` past 24 h crosses midnight. */
export interface HabitRule { path: string; kind: string; title: string; days: string[]; from: number; to: number; nag: number }

const presetOf = (kind: string) => PRESETS[kind.toLowerCase()] ?? PLAIN;

/** "mon wed fri", ["mon", "wed"], "monday", "daily", "weekdays", "weekends" → the days; null when it names none (a
 *  word that is not a day — "evening" — names none). */
export function daysOf(v: unknown): string[] | null {
  const words = (Array.isArray(v) ? v.map(String) : String(v ?? "").split(/[\s,]+/)).map((w) => w.trim().toLowerCase()).filter(Boolean);
  const out = new Set<string>();
  for (const w of words) {
    const day = WEEK.find((d) => w === d || w === FULL[d]);
    if (day) out.add(day);
    else if (w === "daily" || w === "everyday") EVERY.forEach((d) => out.add(d));
    else if (w === "weekdays") ["mon", "tue", "wed", "thu", "fri"].forEach((d) => out.add(d));
    else if (w === "weekends") ["sat", "sun"].forEach((d) => out.add(d));
    else return null;
  }
  return out.size ? WEEK.filter((d) => out.has(d)) : null;
}
const FULL: Record<string, string> = { sun: "sunday", mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday", fri: "friday", sat: "saturday" };

/** "17:00-20:00" (or "17:00–20:00") → minutes; an end before the start is the next day's. */
export function windowOf(v: unknown): { from: number; to: number } | null {
  const m = /^\s*(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\s*$/.exec(String(v ?? ""));
  const from = m && minuteOf(m[1]), to = m && minuteOf(m[2]);
  if (from === null || to === null || from === undefined || to === undefined) return null;
  return { from, to: to <= from ? to + 24 * 60 : to };
}

/** The habit a note's properties make, or null: not a habit, or paused. */
export function ruleOf(path: string, props: Record<string, unknown>): HabitRule | null {
  const kind = String(props.habit ?? "").trim();
  if (!kind || props.paused === true || String(props.paused) === "true") return null;
  const p = presetOf(kind);
  const at = minuteOf(String(props.at ?? ""));
  const w = windowOf(props.window) ?? (at !== null ? { from: at, to: at + (p.to - p.from) } : { from: p.from, to: p.to });
  const nag = Number(props.nag);
  return {
    path, kind, title: path.split("/").pop()!.replace(/\.md$/i, ""),
    days: daysOf(props.days) ?? p.days, ...w, nag: Number.isFinite(nag) && nag >= 5 ? Math.round(nag) : p.nag,
  };
}

/** `habit <kind> [days…] [HH:MM | HH:MM-HH:MM]` in a capture → the habit's note (its name and text); null: not one. */
export function setupOf(line: string): { name: string; text: string } | null {
  const m = /^\s*(?:[-*+] )?(?:\[ \] )?habit\s+(.+?)\s*$/i.exec(line);
  if (!m) return null;
  const words = m[1].split(/\s+/);
  const kind: string[] = [], days: string[] = [];
  let time = "";
  for (const w of words) {
    if (/^\d{1,2}:\d{2}([-–]\d{1,2}:\d{2})?$/.test(w)) time = w.replace("–", "-");
    else if (daysOf(w) && !kind.length) return null; // a day before any name: not a habit line
    else if (daysOf(w)) days.push(w.toLowerCase());
    else if (!days.length && !time) kind.push(w);
    else return null;
  }
  if (!kind.length) return null;
  const name = kind.join(" ").replace(/[\\/:*?"<>|#^[\]]/g, "").trim();
  if (!name) return null;
  const p = presetOf(name);
  const props = [`habit: ${name.toLowerCase()}`];
  const d = days.length ? daysOf(days.join(" ")) : null;
  if (d) props.push(`days: [${d.join(", ")}]`);
  if (time.includes("-")) props.push(`window: "${time}"`);
  else if (time) {
    const from = minuteOf(time)!;
    props.push(`window: "${hhmm(from)}-${hhmm((from + (p.to - p.from)) % (24 * 60))}"`);
  }
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  return { name: title, text: `---\n${props.join("\n")}\n---\nNagged in its window until done; Done or Skip today on the notification (Plan).\n` };
}

const nameOf = (r: HabitRule): TaskName => ({ path: r.path, title: r.title });
/** What every nag of a habit is about: Done withdraws them all by it. */
export const subjectOf = (path: string) => `${path}#habit`;
/** A habit's ledger name from its key (`habits/Gym.md|Gym`). */
export function habitNameOf(key: string): TaskName | null {
  const bar = key.indexOf("|");
  return bar > 0 ? { path: key.slice(0, bar), title: key.slice(bar + 1) } : null;
}

/** A habit's notice id: its key and the nag's moment (each nag rings once; Done answers them all). */
const noticeId = (key: string, at: number, c: Clock) => `plan:habit:${key}@${rfc3339(at, c)}`;
/** The habit's key in a notice id, or null when the id is not a habit's. */
export function habitKeyOf(id: string): string | null {
  if (!id.startsWith("plan:habit:")) return null;
  const rest = id.slice("plan:habit:".length), at = rest.lastIndexOf("@");
  return at > 0 ? rest.slice(0, at) : null;
}

/** The nags of the habits now and in the next day and a half, and the ledger lines of those whose moment has come. */
export function habitPlan(rules: HabitRule[], entries: Entry[], c: Clock, mark = ""): { planned: Planned[]; writes: Write[] } {
  const planned: Planned[] = [], writes: Write[] = [];
  const now = c.now, today = wall(now, c).day;
  for (const r of rules) {
    const key = keyOf(nameOf(r));
    // yesterday's window may run past midnight into now
    for (const day of [addDays(today, -1), today, addDays(today, 1)]) {
      const wd = WEEK[new Date(`${day}T12:00:00Z`).getUTCDay()];
      if (!r.days.includes(wd)) continue;
      const start = instant(day, r.from, c), end = instant(day, r.to, c);
      if (end <= now) continue;
      const mine = entries.filter((e) => e.key === key && e.at >= start - 12 * 60 * MIN && e.at < end);
      if (mine.some((e) => e.kind === "done" || e.kind === "dismissed")) continue;
      const rang = new Set(mine.filter((e) => e.kind === "nudged").map((e) => e.at));
      for (let at = start, n = 1; at < end; at += r.nag * MIN, n++) {
        const until = Math.min(at + r.nag * MIN, end);
        if (until <= now) continue; // a nag gone by
        if (at <= now && !rang.has(at)) {
          writes.push({ entry: { at, kind: "nudged", key, important: true, detail: `habit ${r.kind} · nag ${n}${mark}` }, task: nameOf(r) });
        }
        planned.push({
          at: rfc3339(at, c), until: rfc3339(until, c), id: noticeId(key, at, c), title: r.title,
          body: n === 1 ? `${hhmm(r.from % 1440)}–${hhmm(r.to % 1440)}: now` : `${hhmm(r.from % 1440)}–${hhmm(r.to % 1440)}: still not done (${n})`,
          open: r.path, subject: subjectOf(r.path),
          actions: [{ id: "done", label: "Done" }, { id: "skip", label: "Skip today" }, { id: "atlas:open", label: "Open" }],
        });
        if (at > now) break; // the next nag only: the plan is asked again before it rings
      }
    }
  }
  return { planned, writes };
}
