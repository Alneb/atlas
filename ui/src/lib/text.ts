// Small text helpers every part of the interface shares (one copy each).

/** What went wrong, as text: an Error's message, anything else as written. */
export const errText = (e: unknown): string => String(e instanceof Error ? e.message : e);

/** The reason alone, without the API's "VERB /path: 500 " in front (lib/api.ts writes that prefix). */
export const errReason = (e: unknown): string => errText(e).replace(/^\w+ \S+: \d+ /, "");

/** `s` matched literally inside a RegExp. */
export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `s` in lower case with every character where it was: one whose lower case is longer (`İ` → `i̇`) is kept as it is,
 *  so an index found in the result marks the same text in `s` (a highlight, a fuzzy match). */
export function lowerInPlace(s: string): string {
  const low = s.toLowerCase();
  return low.length === s.length ? low : Array.from(s, (c) => { const l = c.toLowerCase(); return l.length === c.length ? l : c; }).join("");
}

/** Text made safe inside HTML: `&`, `<`, `>` and `"` escaped. */
export const escapeHtml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A file size for a listing: `512 B`, `3.4 KB`, `1.2 MB`, `2.05 GB`; "" when unknown. */
export const bytes = (n?: number): string =>
  n === undefined ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`;

// made on first use: the first Intl formatter loads the locale's data (~25 ms), which the start need not wait for
const dtf = (o: Intl.DateTimeFormatOptions) => { let f: Intl.DateTimeFormat | undefined; return () => (f ??= new Intl.DateTimeFormat(undefined, o)); };
const HM = dtf({ hour: "2-digit", minute: "2-digit" }), MD = dtf({ month: "short", day: "numeric" }), YMD = dtf({ year: "numeric", month: "short", day: "numeric" });
/** A file's time (unix seconds) short enough for a column: the time today, the day this year, else the date; "" when unknown. */
export function shortWhen(secs?: number): string {
  if (!secs) return "";
  const d = new Date(secs * 1000), now = new Date();
  return d.toDateString() === now.toDateString() ? HM().format(d) : d.getFullYear() === now.getFullYear() ? MD().format(d) : YMD().format(d);
}
