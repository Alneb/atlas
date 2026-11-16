// One way to show a date anywhere in the interface (Bases cells, task chips, the note's date, activity lists), so a
// date reads the same in every place. `[editor] date_format` (moment.js tokens, as Obsidian's) decides when set;
// otherwise the automatic form: near dates by name ("14:05" today, "Yesterday 09:10", "Mon"), the rest short ("16 Nov",
// "16 Nov 2025"). The full date and how far it is ("3 days ago", moment's fromNow, as the core's `relative()`) are the
// tooltip. Names follow `[editor] date_names`, as the core's formats do.

export type DateLike = string | number | Date;
/** A readable date and whether it carried a time of day (a `YYYY-MM-DD` has none). */
export interface When { d: Date; timed: boolean }

const MON_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MON_ES_SHORT = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."];
const DOW_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DOW_ES_SHORT = ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."];

// set by settings.svelte.ts whenever the vault's settings load or change (a plain module so unit specs can import it)
const prefs = { format: "", es: false };
export function setDatePrefs(format: string, es: boolean): void { prefs.format = format.trim(); prefs.es = es; }
const spanish = () => prefs.es;

/** A date from a property's text (`2026-11-16`, `2026-11-16 14:05`, `2026-11-16T14:05:00Z`), ms since the epoch or a
 *  Date; null for anything else. A day without a time is that local day (not UTC's midnight). */
export function readDate(v: DateLike | null | undefined): When | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : { d: v, timed: true };
  if (typeof v === "number") return Number.isFinite(v) ? { d: new Date(v), timed: true } : null;
  const s = v.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/.exec(s);
  if (!m) return null;
  // a month, day, hour or minute out of range is no date (JavaScript would roll 2026-13-05 into January)
  const [mo, day, h, mi, se] = [+m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)];
  if (mo < 1 || mo > 12 || day < 1 || day > new Date(+m[1], mo, 0).getDate() || h > 23 || mi > 59 || se > 59) return null;
  if (m[8]) {
    // an offset as every engine reads it: ±HH:MM (`+01` and `+0100` are ISO too)
    const off = m[8] === "Z" ? "Z" : `${m[8].slice(0, 3)}:${m[8].slice(3).replace(":", "") || "00"}`;
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}${m[7] ?? ""}${off}`);
    return isNaN(d.getTime()) ? null : { d, timed: true };
  }
  const d = new Date(+m[1], mo - 1, day, h, mi, se);
  return isNaN(d.getTime()) ? null : { d, timed: m[4] !== undefined };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** A date in moment.js tokens (the subset the core's `dates::format` reads, the same names): YYYY YY MMMM MMM MM M
 *  DD D dddd ddd HH H hh h mm m ss s A a, `[literal]`. */
export function formatDate(d: Date, fmt: string, es = spanish()): string {
  const mon = es ? MON_ES : MON_EN, dow = es ? DOW_ES : DOW_EN;
  const h12 = d.getHours() % 12 || 12;
  const tok: Record<string, () => string> = {
    YYYY: () => pad(d.getFullYear(), 4), YY: () => pad(d.getFullYear() % 100),
    MMMM: () => mon[d.getMonth()], MMM: () => (es ? MON_ES_SHORT[d.getMonth()] : MON_EN[d.getMonth()].slice(0, 3)),
    MM: () => pad(d.getMonth() + 1), M: () => String(d.getMonth() + 1),
    DD: () => pad(d.getDate()), D: () => String(d.getDate()),
    dddd: () => dow[d.getDay()], ddd: () => (es ? DOW_ES_SHORT[d.getDay()] : DOW_EN[d.getDay()].slice(0, 3)),
    HH: () => pad(d.getHours()), H: () => String(d.getHours()), hh: () => pad(h12), h: () => String(h12),
    mm: () => pad(d.getMinutes()), m: () => String(d.getMinutes()), ss: () => pad(d.getSeconds()), s: () => String(d.getSeconds()),
    A: () => (d.getHours() < 12 ? "AM" : "PM"), a: () => (d.getHours() < 12 ? "am" : "pm"),
    // the ISO week, as the core's format gives it for w and W alike
    WW: () => pad(isoWeek(d)), W: () => String(isoWeek(d)), ww: () => pad(isoWeek(d)), w: () => String(isoWeek(d)),
  };
  return fmt.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|WW|W|ww|w|HH|H|hh|h|mm|m|ss|s|A|a/g, (t, lit) => (lit !== undefined ? lit : tok[t]()));
}

/** The ISO 8601 week of a date (weeks start on Monday; week 1 holds the year's first Thursday). */
function isoWeek(d: Date): number {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const first = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getDay() + 6) % 7)) / 7);
}

/** Whole local days from `now`'s day to `d`'s (0 today, -1 yesterday). */
export function dayDiff(d: Date, now = new Date()): number {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}

/** How far a date is, moment's fromNow (the core's `dates::relative`, the same thresholds): "a few seconds ago",
 *  "3 hours ago", "in 2 days", "a month ago". */
export function fromNow(d: Date, now = new Date(), es = spanish()): string {
  const secs = (d.getTime() - now.getTime()) / 1000, s = Math.abs(secs);
  const MIN = 60, H = 3600, DAY = 86400;
  const n = (x: number) => Math.max(1, Math.round(x));
  // 45 days rounds to one: "a month", never "1 months" (moment's wording)
  const months = (x: number, one: string, many: string) => (n(x) === 1 ? one : `${n(x)} ${many}`);
  const w = es
    ? s < 45 ? "unos segundos" : s < 90 ? "un minuto" : s < 45 * MIN ? `${n(s / MIN)} minutos` : s < 90 * MIN ? "una hora"
      : s < 22 * H ? `${n(s / H)} horas` : s < 36 * H ? "un día" : s < 26 * DAY ? `${n(s / DAY)} días` : s < 45 * DAY ? "un mes"
      : s < 320 * DAY ? months(s / (30.4375 * DAY), "un mes", "meses") : s < 548 * DAY ? "un año" : `${n(s / (365.25 * DAY))} años`
    : s < 45 ? "a few seconds" : s < 90 ? "a minute" : s < 45 * MIN ? `${n(s / MIN)} minutes` : s < 90 * MIN ? "an hour"
      : s < 22 * H ? `${n(s / H)} hours` : s < 36 * H ? "a day" : s < 26 * DAY ? `${n(s / DAY)} days` : s < 45 * DAY ? "a month"
      : s < 320 * DAY ? months(s / (30.4375 * DAY), "a month", "months") : s < 548 * DAY ? "a year" : `${n(s / (365.25 * DAY))} years`;
  return secs < 0 ? (es ? `hace ${w}` : `${w} ago`) : es ? `dentro de ${w}` : `in ${w}`;
}

/** The automatic form: a near day by its name, else the day and month (and the year when it is not this one); a time
 *  of day after it when the value had one and the day is within the week. */
function auto(w: When, now: Date, es: boolean): string {
  const { d, timed } = w;
  const days = dayDiff(d, now);
  const time = timed ? formatDate(d, "HH:mm", es) : "";
  const named = es ? ["Ayer", "Hoy", "Mañana"] : ["Yesterday", "Today", "Tomorrow"];
  let day: string;
  if (days >= -1 && days <= 1) day = named[days + 1];
  else if (days > 1 && days < 7) day = formatDate(d, "dddd", es).replace(/^./, (c) => c.toUpperCase());
  else if (days < -1 && days > -7) day = formatDate(d, "ddd", es).replace(/^./, (c) => c.toUpperCase());
  else day = formatDate(d, d.getFullYear() === now.getFullYear() ? "D MMM" : "D MMM YYYY", es);
  // the time of day only while the day is near (a weekday's); "5 Oct 11:06" says more than a list wants
  if (!timed || Math.abs(days) >= 7) return day;
  return days === 0 ? time : `${day} ${time}`;
}

/** A date as the interface shows it: `[editor] date_format` when set, else the automatic form. The raw text when it
 *  is not a date. */
export function showDate(v: DateLike, now = new Date()): string {
  const w = readDate(v);
  if (!w) return typeof v === "string" ? v : "";
  const es = spanish();
  const fmt = prefs.format;
  if (fmt) {
    if (w.timed) return formatDate(w.d, fmt, es);
    const day = dayPart(fmt);
    return day ? formatDate(w.d, day, es) : auto(w, now, es);
  }
  return auto(w, now, es);
}

/** A format's part before its time of day, for a value that has none: `D MMM [at] HH:mm` → `D MMM`; "" when the
 *  format is only a time. */
function dayPart(fmt: string): string {
  const time = /\[[^\]]*\]|(HH|H|hh|h|mm|ss|A|a)/g;
  let cut = fmt.length;
  for (const m of fmt.matchAll(time)) if (m[1]) { cut = m.index ?? cut; break; }
  // what led to the time (a literal "[at]", a comma, a T) goes with it
  return fmt.slice(0, cut).replace(/(\s*(\[[^\]]*\]|[,T]))*\s*$/, "").trim();
}

/** The tooltip of a shown date: the whole date, then how far it is ("Sunday, 16 November 2026 14:05 · 3 hours ago"). */
export function dateTip(v: DateLike, now = new Date()): string {
  const w = readDate(v);
  if (!w) return typeof v === "string" ? v : "";
  const es = spanish();
  const full = formatDate(w.d, es ? "dddd, D [de] MMMM [de] YYYY" : "dddd, D MMMM YYYY", es) + (w.timed ? formatDate(w.d, " HH:mm", es) : "");
  const far = w.timed ? fromNow(w.d, now, es) : dayWords(dayDiff(w.d, now), now, es);
  return `${full} · ${far}`;
}

/** A day's distance in words, for a value without a time ("today", "in 3 days", "2 months ago"). */
function dayWords(days: number, now: Date, es: boolean): string {
  if (days === 0) return es ? "hoy" : "today";
  const mid = new Date(now); mid.setHours(12, 0, 0, 0);
  return fromNow(new Date(mid.getTime() + days * 86_400_000), mid, es);
}
