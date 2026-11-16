// Local wall-clock time without the machine's zone baked in: every function takes a Clock, so the tests run on a fixed
// moment and a fixed zone, and the helper on `Date.now()` and this device's zone (Date's own offset, DST included).

export interface Clock {
  /** Now, ms since 1970. */
  now: number;
  /** The zone's offset east of UTC at that instant, in minutes (Paris in winter: 60; Montréal: -300). */
  offset(ms: number): number;
}

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** This device's clock. */
export function systemClock(): Clock {
  return { now: Date.now(), offset: (ms) => -new Date(ms).getTimezoneOffset() };
}

/** A fixed zone (tests). */
export function fixedClock(now: number, offsetMin: number): Clock {
  return { now, offset: () => offsetMin };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The local day (`YYYY-MM-DD`) and minute of the day of an instant. */
export function wall(ms: number, c: Clock): { day: string; min: number } {
  const d = new Date(ms + c.offset(ms) * MIN);
  return { day: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** The instant of a local day and minute (the offset read at that moment, once refined across a DST change). */
export function instant(day: string, min: number, c: Clock): number {
  const [y, m, d] = day.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, min);
  const guess = naive - c.offset(naive) * MIN;
  return naive - c.offset(guess) * MIN;
}

/** `YYYY-MM-DD` + n days. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from `a` to `b` (both `YYYY-MM-DD`). */
export function daysBetween(a: string, b: string): number {
  const at = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((at(b) - at(a)) / DAY);
}

/** `HH:MM` of a minute of the day. */
export const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** `HH:MM` (or `H:MM`) → minute of the day; null when it is not one. */
export function minuteOf(s: string): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(s);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** `YYYY-MM-DD HH:MM` of an instant, the ledger's way. */
export function stamp(ms: number, c: Clock): string {
  const w = wall(ms, c);
  return `${w.day} ${hhmm(w.min)}`;
}

/** The instant a ledger stamp names (local time). */
export function fromStamp(s: string, c: Clock): number | null {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{1,2}:\d{2})$/.exec(s.trim());
  const min = m && minuteOf(m[2]);
  return m && min !== null ? instant(m[1], min, c) : null;
}

/** RFC 3339 with the local offset, what a planned notice's `at` is. */
export function rfc3339(ms: number, c: Clock): string {
  const off = c.offset(ms), sign = off < 0 ? "-" : "+", a = Math.abs(off);
  const w = wall(ms, c), sec = Math.floor((ms / 1000) % 60);
  return `${w.day}T${hhmm(w.min)}:${pad(sec < 0 ? sec + 60 : sec)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** The instant floored to its minute. */
export const floorMinute = (ms: number) => Math.floor(ms / MIN) * MIN;
