// A table's rows grouped by one column's value, with each group's sub-totals: its count, and per numeric column the
// sum, mean, min and max of the numbers it holds. Groups are ordered by their value (numbers by size, text
// naturally, blanks last), or by what the table's sort puts first when the sort is on the grouped column. Pure.
import { compare } from "./filter";
import { isNum } from "./parse";

export interface Totals { n: number; sum: number; min: number; max: number }
export interface Group {
  /** the value the rows share, as the first of them spells it (trimmed); "" for the blank ones. Case is ignored, and
   *  numbers go by value ("10" = "10.0"), as the column filters compare, so a group's filter (`groupFilter`) keeps exactly its rows. */
  key: string;
  /** indices into the rows, in the order they were given */
  rows: number[];
  /** per numeric column asked for */
  totals: Map<number, Totals>;
}

export type Measure = "sum" | "mean" | "min" | "max";
export const MEASURES: Measure[] = ["sum", "mean", "min", "max"];

/** A sub-total as shown; null when the group has no number in that column. */
export function measure(t: Totals | undefined, m: Measure): number | null {
  if (!t || !t.n) return null;
  return m === "sum" ? t.sum : m === "mean" ? t.sum / t.n : m === "min" ? t.min : t.max;
}

function add(totals: Map<number, Totals>, c: number, cell: string) {
  const v = cell.trim();
  if (!isNum(v)) return;
  const x = parseFloat(v);
  if (!Number.isFinite(x)) return;
  const t = totals.get(c);
  if (!t) totals.set(c, { n: 1, sum: x, min: x, max: x });
  else { t.n++; t.sum += x; if (x < t.min) t.min = x; if (x > t.max) t.max = x; }
}

/**
 * `idx` (the rows shown, in their order) grouped by column `col` of `rows`; `nums` the columns to total.
 * `numeric` says whether `col` holds numbers (how the groups sort); `dir` -1 puts them the other way round.
 */
export function groupRows(rows: string[][], idx: number[], col: number, nums: number[], numeric: boolean, dir: 1 | -1 = 1): { groups: Group[]; all: Map<number, Totals> } {
  const by = new Map<string, Group>(), all = new Map<number, Totals>();
  for (const i of idx) {
    const r = rows[i], key = (r[col] ?? "").trim(), fold = numeric && isNum(key) ? String(parseFloat(key)) : key.toLowerCase();
    let g = by.get(fold);
    if (!g) by.set(fold, (g = { key, rows: [], totals: new Map() }));
    g.rows.push(i);
    for (const c of nums) { add(g.totals, c, r[c] ?? ""); add(all, c, r[c] ?? ""); }
  }
  // blanks last whichever way round
  const groups = [...by.values()].sort((a, b) => (!a.key !== !b.key ? (a.key ? -1 : 1) : dir * compare(a.key, b.key, numeric)));
  return { groups, all };
}

/** The filter (lib/csv/filter.ts syntax) that keeps one group's rows. */
export const groupFilter = (key: string) => (key ? `=${key}` : "empty");
