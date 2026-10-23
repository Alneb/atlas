// What the pane derives from the transactions list (engine `transactions`): who the money went from and to, the
// search, the months by category, the flows. Pure functions over one list, so every view answers at once and agrees.
import { label, num, type Txn } from "./api";

/** A booked posting: its amount as written and its value in the display currency (null when unpriced). */
export interface Leg { account: string; amount: string; v: string | null }
export interface Row extends Txn { legs: Leg[] }

export const root = (a: string) => a.split(":")[0];
/** The category a leg is filed under, at the level the views group by: "Expenses:Food", "Income:Salary". */
export const group = (a: string) => a.split(":").slice(0, 2).join(":");
const value = (l: Leg) => num(l.v);

/** The legs money left (negative) and went to (positive); equity and price-only legs aside. */
export function sides(t: Row): { from: Leg[]; to: Leg[] } {
  const legs = t.legs.filter((l) => root(l.account) !== "Equity" || t.legs.every((x) => root(x.account) === "Equity"));
  return { from: legs.filter((l) => value(l) < 0 || (l.v === null && l.amount.startsWith("-"))), to: legs.filter((l) => value(l) > 0 || (l.v === null && !l.amount.startsWith("-"))) };
}

/** How much the transaction moved, in the display currency: what went in on the receiving side. */
export const size = (t: Row) => sides(t).to.reduce((s, l) => s + value(l), 0);

/** What it meant to the reader, in the display currency: spending negative (a refund positive), income positive,
 *  a transfer its size. */
export function net(t: Row): number {
  const k = kind(t);
  if (k === "transfer" || k === "other") return size(t);
  const r = k === "spend" ? "Expenses" : "Income";
  return -t.legs.filter((l) => root(l.account) === r).reduce((s, l) => s + value(l), 0);
}

/** A short name for a side: one account's label, or "Food · Groceries + 2". */
export function sideName(legs: Leg[]): string {
  const names = [...new Set(legs.map((l) => label(l.account)))];
  return names.length <= 1 ? (names[0] ?? "—") : `${names[0]} + ${names.length - 1}`;
}

/** What a transaction does for the reader: spending, income, a transfer between own accounts, other. */
export type Kind = "spend" | "income" | "transfer" | "other";
export function kind(t: Row): Kind {
  const roots = new Set(t.legs.map((l) => root(l.account)));
  if (roots.has("Expenses")) return "spend";
  if (roots.has("Income")) return "income";
  if ([...roots].every((r) => r === "Assets" || r === "Liabilities")) return "transfer";
  return "other";
}

/** The search box: words match payee, narration, accounts, bank text; `#tag`, `>100`, `<20`, `2025-03` (a month or
 *  a day's prefix), `!` (to review) narrow it. */
export function matcher(q: string): (t: Row) => boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const tests = words.map((w): ((t: Row) => boolean) => {
    if (w === "!") return (t) => t.status === "!";
    if (w.startsWith("#") && w.length > 1) return (t) => t.tags.some((x) => x.toLowerCase() === w.slice(1));
    const cmp = /^([<>])(\d+(?:[.,]\d+)?)$/.exec(w);
    if (cmp) { const n = Number(cmp[2].replace(",", ".")); return (t) => (cmp[1] === ">" ? size(t) > n : size(t) < n); }
    if (/^\d{4}(-\d{2}){0,2}$/.test(w)) return (t) => t.date.startsWith(w);
    return (t) => hay(t).includes(w);
  });
  return (t) => tests.every((f) => f(t));
}
const hays = new WeakMap<Row, string>();
function hay(t: Row): string {
  let h = hays.get(t);
  if (!h) { h = [t.payee, t.narration ?? "", ...t.legs.map((l) => l.account), ...t.meta.map(([, v]) => v)].join(" ").toLowerCase(); hays.set(t, h); }
  return h;
}

/** A period the views share: inclusive months "YYYY-MM". */
export interface Period { from: string; to: string; name: string }
export const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export function addMonths(m: string, n: number): string {
  const [y, mo] = m.split("-").map(Number);
  return ym(new Date(y, mo - 1 + n, 1));
}
export function periods(last: string): Period[] {
  return [
    { from: last, to: last, name: "This month" },
    { from: addMonths(last, -1), to: addMonths(last, -1), name: "Last month" },
    { from: addMonths(last, -2), to: last, name: "3 months" },
    { from: addMonths(last, -11), to: last, name: "12 months" },
    { from: `${last.slice(0, 4)}-01`, to: last, name: `${last.slice(0, 4)}` },
    { from: "0000-01", to: "9999-12", name: "All" },
  ];
}
export const inPeriod = (t: Row, p: Period) => { const m = t.date.slice(0, 7); return m >= p.from && m <= p.to; };

/** Totals per category group (Expenses:Food…) and per root, over some transactions: spending positive, income
 *  positive (its sign flipped). */
export function totals(rows: Row[], r: "Expenses" | "Income"): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of rows) for (const l of t.legs) if (root(l.account) === r) out.set(group(l.account), (out.get(group(l.account)) ?? 0) + (r === "Income" ? -value(l) : value(l)));
  return out;
}

/** Each month's spending per category group, oldest first, every month between the first and last present. */
export function byMonth(rows: Row[], r: "Expenses" | "Income" = "Expenses"): { month: string; by: Map<string, number>; total: number }[] {
  const months = new Map<string, Row[]>();
  for (const t of rows) { const m = t.date.slice(0, 7); (months.get(m) ?? months.set(m, []).get(m)!).push(t); }
  const keys = [...months.keys()].sort();
  if (!keys.length) return [];
  const out = [];
  for (let m = keys[0]; m <= keys[keys.length - 1]; m = addMonths(m, 1)) {
    const by = totals(months.get(m) ?? [], r);
    out.push({ month: m, by, total: [...by.values()].reduce((a, b) => a + b, 0) });
  }
  return out;
}

/** The payees of some transactions within one category group, largest first. */
export function payees(rows: Row[], g: string): { payee: string; total: number; count: number }[] {
  const out = new Map<string, { total: number; count: number }>();
  for (const t of rows) {
    const v = t.legs.filter((l) => group(l.account) === g).reduce((s, l) => s + value(l), 0);
    if (!v) continue;
    const e = out.get(t.payee) ?? out.set(t.payee, { total: 0, count: 0 }).get(t.payee)!;
    e.total += root(g) === "Income" ? -v : v; e.count++;
  }
  return [...out].map(([payee, x]) => ({ payee, ...x })).sort((a, b) => b.total - a.total);
}

/** Where the money came from and went in a period: income groups (and savings drawn) in, spending groups (and
 *  savings put aside) out — the two sides are equal. */
export interface Flow { ins: [string, number][]; outs: [string, number][]; total: number }
export function flow(rows: Row[], top = 8): Flow {
  const sorted = (m: Map<string, number>) => [...m].filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
  const fold = (xs: [string, number][], other: string): [string, number][] => xs.length <= top ? xs : [...xs.slice(0, top - 1), [other, xs.slice(top - 1).reduce((s, x) => s + x[1], 0)]];
  const ins = sorted(totals(rows, "Income"));
  const outs = sorted(totals(rows, "Expenses"));
  const inn = ins.reduce((s, x) => s + x[1], 0), out = outs.reduce((s, x) => s + x[1], 0);
  const i2 = fold(ins, "Income:Other sources"), o2 = fold(outs, "Expenses:Everything else");
  if (inn > out) o2.push(["Saved", inn - out]); else if (out > inn) i2.push(["From savings", out - inn]);
  return { ins: i2, outs: o2, total: Math.max(inn, out) };
}

/** A transaction's legs as the editor edits them: implied amounts left empty. */
export const draftOf = (t: Txn) => ({
  date: t.date, status: t.status, payee: t.payee, narration: t.narration ?? "", tags: [...t.tags],
  postings: t.postings.map((p) => ({ account: p.account, amount: p.amount ?? "" })),
});
export type Draft = ReturnType<typeof draftOf>;

/** What the drafted postings leave unbalanced, per commodity (the empty one takes it, if there is one). */
export function imbalance(d: Draft): { left: Map<string, number>; open: boolean; bad: string[] } {
  const left = new Map<string, number>(), bad: string[] = [];
  for (const p of d.postings) {
    if (!p.account.trim() || !p.amount.trim()) continue;
    const m = /^\s*(-?[\d.,]+)\s+([A-Za-z][\w.]*)\s*$/.exec(p.amount);
    if (!m) { bad.push(p.amount); continue; }
    left.set(m[2], (left.get(m[2]) ?? 0) + Number(m[1].replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "")));
  }
  for (const [c, v] of left) if (Math.abs(v) < 0.005) left.delete(c);
  return { left, open: d.postings.filter((p) => p.account.trim() && !p.amount.trim()).length === 1, bad };
}
