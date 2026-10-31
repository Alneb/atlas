// A column's filter, typed in its header: `>0.5`, `<=3`, `1..5`, `=Mott`, `!=0`, `empty`, `!empty`, `/^U\d/i`, or text
// that a cell contains (`!text`: does not). And the numbers a column or a selection gives: count, min, max, mean…
import { isNum, toNum } from "./parse";

export type Test = (cell: string) => boolean;

/** The test a filter's text stands for; null for an empty filter. A regex that does not compile matches as text. */
export function compile(src: string): Test | null {
  const q = src.trim();
  if (!q) return null;
  if (/^(!|not\s+)empty$/i.test(q)) return (c) => c.trim() !== "";
  if (/^empty$/i.test(q)) return (c) => c.trim() === "";
  const range = /^(-?[\d.eE+-]+)\s*\.\.\s*(-?[\d.eE+-]+)$/.exec(q);
  if (range && isNum(range[1]) && isNum(range[2])) {
    const [a, b] = [toNum(range[1]), toNum(range[2])];
    return (c) => { const x = toNum(c); return x >= Math.min(a, b) && x <= Math.max(a, b); };
  }
  const cmp = /^(>=|<=|!=|>|<|=)\s*(.+)$/.exec(q);
  if (cmp) {
    const [, op, v] = cmp;
    if (isNum(v)) {
      const n = toNum(v);
      const f = { ">": (x: number) => x > n, "<": (x: number) => x < n, ">=": (x: number) => x >= n, "<=": (x: number) => x <= n, "=": (x: number) => x === n, "!=": (x: number) => x !== n }[op]!;
      return (c) => (isNum(c) ? f(toNum(c)) : op === "!=");
    }
    const t = v.trim().toLowerCase();
    if (op === "=") return (c) => c.trim().toLowerCase() === t;
    if (op === "!=") return (c) => c.trim().toLowerCase() !== t;
  }
  const re = /^\/(.+)\/([imsu]*)$/.exec(q);
  if (re) {
    try { const r = new RegExp(re[1], re[2]); return (c) => r.test(c); } catch { /* typed half-way: match as text */ }
  }
  if (q.startsWith("!") && q.length > 1) { const t = q.slice(1).toLowerCase(); return (c) => !c.toLowerCase().includes(t); }
  const t = q.toLowerCase();
  return (c) => c.toLowerCase().includes(t);
}

export interface Stats {
  count: number;
  filled: number;
  /** numbers only, when the cells hold some */
  num?: { n: number; min: number; max: number; sum: number; mean: number; sd: number };
  /** text: how many different values, and the most frequent one */
  distinct: number;
  top?: { value: string; n: number };
}

export function stats(cells: Iterable<string>): Stats {
  // the spread by Welford's running mean: a sum of squares less n·mean² cancels to noise for large close values
  let count = 0, filled = 0, n = 0, sum = 0, mean = 0, m2 = 0, min = Infinity, max = -Infinity;
  const seen = new Map<string, number>();
  for (const c of cells) {
    count++;
    const v = c.trim();
    if (!v) continue;
    filled++;
    if (seen.size < 100_000) seen.set(v, (seen.get(v) ?? 0) + 1);
    if (isNum(v)) {
      const x = toNum(v);
      if (!Number.isFinite(x)) continue;
      n++; sum += x;
      const d = x - mean;
      mean += d / n; m2 += d * (x - mean);
      if (x < min) min = x;
      if (x > max) max = x;
    }
  }
  const out: Stats = { count, filled, distinct: seen.size };
  if (n) out.num = { n, min, max, sum, mean, sd: n > 1 ? Math.sqrt(m2 / (n - 1)) : 0 };
  let top: [string, number] | undefined;
  for (const e of seen) if (!top || e[1] > top[1]) top = e;
  if (top && top[1] > 1) out.top = { value: top[0], n: top[1] };
  return out;
}

/** Sorting: numbers by value (blanks and text after them), text naturally ("item2" before "item10"). */
export function compare(a: string, b: string, numeric: boolean): number {
  if (numeric) {
    const [x, y] = [toNum(a), toNum(b)];
    if (Number.isNaN(x) || Number.isNaN(y)) return Number.isNaN(x) === Number.isNaN(y) ? collator.compare(a, b) : Number.isNaN(x) ? 1 : -1;
    return x < y ? -1 : x > y ? 1 : 0; // not x - y: inf - inf is NaN
  }
  if (!a.trim() !== !b.trim()) return a.trim() ? -1 : 1;
  return collator.compare(a, b);
}
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
