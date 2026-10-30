// The engine's answers (engine/src/api.rs) as types, the helper call, and the date arithmetic every view shares.
// Times: the engine says an instance's times in the user's zone (the page's own: `tz` goes with every call), so a
// `Date` built from them reads right with the local getters; all-day events are dates, their end exclusive.
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
export type { PluginApi };

export interface Person { email: string; name?: string; partstat?: string }
export interface Source {
  /** `<account>/<calendar>` (home/personal) or `sub:<name>` */
  id: string; kind: "caldav" | "ics"; account?: string; url: string; name: string; color?: string; writable: boolean; synced: number;
  error?: string; visible: boolean; shown_color?: string;
}
/** An account card (Settings → Calendar → Accounts), in Settings' order, with its last sync's error. */
export interface Account { name: string; color?: string | null; error?: string | null }
export interface Ev {
  uid: string; rid?: string; summary: string; start: string; end: string; all_day: boolean; location?: string;
  description?: string; recurring: boolean; rrule?: string; source?: string; status?: string; free: boolean;
  organizer?: Person; attendees?: Person[]; url?: string; tzid?: string;
  calendar: string; calendar_name: string; color?: string; href?: string; writable: boolean;
}
export interface Quick { title: string; all_day: boolean; start: string; end: string; rrule?: string; location?: string; understood: string[] }

export const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A helper call with the plugin's settings and the page's zone; the error stripped of the transport's prefix. */
export async function call<T>(atlas: PluginApi, method: string, params: Record<string, unknown> = {}, timeout = 120): Promise<T> {
  try {
    return (await atlas.helper.call(method, { tz: TZ, ...params, settings: atlas.plugin.settings }, { timeout })) as T;
  } catch (e) {
    throw new Error(String((e as Error)?.message ?? e).replace(/^.*?plugin [\w-]+: \w+: /s, "").replace(/^.*?(method|error): /i, ""));
  }
}

// ----- days

export const DAY = 86_400_000;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), 28));
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const pad = (n: number) => String(n).padStart(2, "0");
/** `2026-11-04` of a local date. */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** `2026-11-04T10:15` — the user's wall clock, as the engine takes it. */
export const wall = (d: Date) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** An engine time as a local Date: a day at midnight, an instant as it is. */
export function at(s: string): Date {
  if (s.length === 10) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  return new Date(s);
}
export const evStart = (e: Ev) => at(e.start);
export const evEnd = (e: Ev) => at(e.end);
/** Shown in the all-day lane: all-day events and timed ones of a day or more. */
export const laneEvent = (e: Ev) => e.all_day || evEnd(e).getTime() - evStart(e).getTime() >= DAY;

/** The first day of the week: the setting, else the locale's (Intl weekInfo where the engine has it), else Monday. */
export function weekStart(setting: unknown): number {
  const named: Record<string, number> = { sunday: 0, monday: 1, saturday: 6 };
  if (typeof setting === "string" && setting in named) return named[setting];
  try {
    const info = (new Intl.Locale(navigator.language) as unknown as { weekInfo?: { firstDay: number }; getWeekInfo?: () => { firstDay: number } });
    const first = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    if (first) return first % 7;
  } catch { /* an old engine */ }
  return 1;
}
export function startOfWeek(d: Date, first: number): Date {
  const s = startOfDay(d);
  return addDays(s, -((s.getDay() - first + 7) % 7));
}

// ----- words

/** 12-hour only when the setting asks for it; else the 24-hour clock whatever the locale. */
export function hourCycle(setting: unknown): boolean {
  return setting === "12h";
}
/** The Intl options that show hours on the chosen clock. */
export const clock = (h12: boolean): Intl.DateTimeFormatOptions => (h12 ? { hour12: true } : { hourCycle: "h23" });
export function timeText(d: Date, h12: boolean): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", ...clock(h12) });
}
/** "10:00 – 11:30", "All day", "Mon 3 Nov – Wed 5 Nov". */
export function span(e: Ev, h12: boolean): string {
  const s = evStart(e), en = evEnd(e);
  const date = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  if (e.all_day) {
    const last = addDays(en, -1);
    return sameDay(s, last) ? `${date(s)} · all day` : `${date(s)} – ${date(last)}`;
  }
  if (sameDay(s, en) || (en.getHours() === 0 && en.getMinutes() === 0 && en.getTime() - s.getTime() < DAY)) return `${date(s)} · ${timeText(s, h12)} – ${timeText(en, h12)}`;
  return `${date(s)} ${timeText(s, h12)} – ${date(en)} ${timeText(en, h12)}`;
}

/** A colour from a name, for a calendar the server gave none. */
export function hueColor(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 62% 52%)`;
}

/** A vault note an event came from (X-ATLAS-SOURCE): a path, not a Message-ID. */
export const notePath = (e: Ev) => (e.source && !e.source.includes("@") && /\.md$/i.test(e.source) ? e.source : null);

/** The repeat choices of the editor, from the occurrence's day. */
export function repeats(d: Date): { value: string; label: string }[] {
  const by = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][d.getDay()];
  const wd = d.toLocaleDateString(undefined, { weekday: "long" });
  return [
    { value: "", label: "Does not repeat" },
    { value: "FREQ=DAILY", label: "Every day" },
    { value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: "Every weekday (Mon–Fri)" },
    { value: `FREQ=WEEKLY;BYDAY=${by}`, label: `Every week on ${wd}` },
    { value: "FREQ=MONTHLY", label: `Every month on the ${d.getDate()}` },
    { value: "FREQ=YEARLY", label: `Every year on ${d.toLocaleDateString(undefined, { day: "numeric", month: "long" })}` },
  ];
}
/** An RRULE in words, roughly ("Every week", "Every 2 weeks, 10 times"). */
export function ruleText(r: string | undefined): string {
  if (!r) return "";
  const p = Object.fromEntries(r.split(";").map((x) => x.split("=")));
  const unit = ({ DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" } as Record<string, string>)[p.FREQ] ?? p.FREQ?.toLowerCase();
  const n = Number(p.INTERVAL ?? 1);
  let s = n > 1 ? `Every ${n} ${unit}s` : `Every ${unit}`;
  if (p.BYDAY) s += ` on ${p.BYDAY.split(",").map((d: string) => d.slice(-2)).join(", ")}`;
  if (p.COUNT) s += `, ${p.COUNT} times`;
  if (p.UNTIL) s += `, until ${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}`;
  return s;
}

/** The pane's arg that opens the new-event editor alone, in a dialog (view.ts). */
export const NEW_EVENT_DIALOG = JSON.stringify({ dialog: "new-event" });
