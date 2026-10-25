// Formulas between cells, as a spreadsheet has them: a cell whose text starts with `=` shows what it computes, and the
// file keeps the formula. References are the grid's own labels — columns A, B, … and the row numbers it shows (A1 is
// the first data row) — so sorting or filtering the view never changes what a formula means. Ranges (`A1:B3`),
// arithmetic, comparisons, `&` to join text, and the common functions. Errors read as a spreadsheet's (`#DIV/0!`,
// `#REF!`, `#NAME?`, `#VALUE!`, `#CYCLE!`). Pure: no I/O, no Svelte.

export type Value = number | string | boolean | FormulaError | null;
export class FormulaError {
  constructor(readonly code: "#DIV/0!" | "#REF!" | "#NAME?" | "#VALUE!" | "#CYCLE!" | "#ERROR!") {}
  toString() { return this.code; }
}
const err = (code: FormulaError["code"]) => new FormulaError(code);
const NUM = /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i;

export const isFormula = (text: string) => text.startsWith("=") && text.length > 1;

/** A column's letters: 0 → A, 25 → Z, 26 → AA. */
export function colName(c: number): string {
  let s = "";
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ── parsing ─────────────────────────────────────────────────────────────────────────────────────────────────────────
type Node =
  | { t: "num"; v: number } | { t: "str"; v: string } | { t: "bool"; v: boolean }
  | { t: "ref"; r: number; c: number } | { t: "range"; r0: number; c0: number; r1: number; c1: number }
  | { t: "un"; op: "-" | "+"; a: Node } | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "call"; name: string; args: Node[] } | { t: "bad"; e: FormulaError };

const TOKEN = /\s*(?:(\d+\.?\d*(?:e[-+]?\d+)?|\.\d+(?:e[-+]?\d+)?)|("(?:[^"]|"")*")|(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)|([A-Za-z_][A-Za-z0-9_.]*)|(<>|<=|>=|[-+*/^&=<>(),:;%]))/y;

/** The formula with every reference moved `dr` rows (a sheet written with its header as row 1: `dr` = 1), the rest
 *  as typed. A token the formula does not read is left alone. */
export function shiftRows(src: string, dr: number): string {
  let out = "", last = 0;
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.length) {
    const m = TOKEN.exec(src);
    if (!m) break;
    if (m[3]) {
      const start = TOKEN.lastIndex - m[3].length;
      out += src.slice(last, start) + m[3].replace(/(\$?[A-Za-z]+\$?)(\d+)/g, (_, col: string, row: string) => col + (Number(row) + dr));
      last = TOKEN.lastIndex;
    }
  }
  return out + src.slice(last);
}

function parse(src: string): Node {
  const toks: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.length) {
    const at = TOKEN.lastIndex, m = TOKEN.exec(src);
    if (!m) { if (src.slice(at).trim() === "") break; return { t: "bad", e: err("#ERROR!") }; }
    toks.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]);
  }
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const ref = (s: string) => { const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(s)!; return { r: Number(m[2]) - 1, c: colIndex(m[1]) }; };
  const BIN: [string[], number][] = [[["=", "<>", "<", ">", "<=", ">="], 1], [["&"], 2], [["+", "-"], 3], [["*", "/"], 4], [["^"], 5]];
  const level = (p: number): Node => {
    if (p > 5) return unary();
    let a = level(p + 1);
    const ops = BIN[p - 1][0];
    while (ops.includes(peek())) {
      const op = next();
      a = { t: "bin", op, a, b: p === 5 ? level(p) : level(p + 1) }; // ^ binds to the right
    }
    return a;
  };
  const unary = (): Node => (peek() === "-" || peek() === "+" ? { t: "un", op: next() as "-" | "+", a: unary() } : postfix());
  const postfix = (): Node => { let a = primary(); while (peek() === "%") { next(); a = { t: "bin", op: "/", a, b: { t: "num", v: 100 } }; } return a; };
  const primary = (): Node => {
    const k = next();
    if (k === undefined) throw new Error("end");
    if (k === "(") { const e = level(1); if (next() !== ")") throw new Error(")"); return e; }
    if (/^[\d.]/.test(k)) return { t: "num", v: Number(k) };
    if (k.startsWith('"')) return { t: "str", v: k.slice(1, -1).replace(/""/g, '"') };
    if (/^\$?[A-Za-z]{1,3}\$?\d+(:|$)/.test(k)) {
      if (k.includes(":")) { const [a, b] = k.split(":").map(ref); return { t: "range", r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) }; }
      return { t: "ref", ...ref(k) };
    }
    const up = k.toUpperCase();
    if (peek() === "(") {
      next();
      const args: Node[] = [];
      if (peek() !== ")") for (;;) { args.push(level(1)); if (peek() === "," || peek() === ";") { next(); continue; } break; }
      if (next() !== ")") throw new Error(")");
      return { t: "call", name: up, args };
    }
    if (up === "TRUE" || up === "FALSE") return { t: "bool", v: up === "TRUE" };
    return { t: "bad", e: err("#NAME?") };
  };
  try {
    const n = level(1);
    return i < toks.length ? { t: "bad", e: err("#ERROR!") } : n;
  } catch { return { t: "bad", e: err("#ERROR!") }; }
}

// ── evaluating ──────────────────────────────────────────────────────────────────────────────────────────────────────
const num = (v: Value): number | FormulaError => {
  if (v instanceof FormulaError) return v;
  if (v === null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return NUM.test(v) ? Number(v) : err("#VALUE!");
};
const text = (v: Value): string => (v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : typeof v === "number" ? format(v) : String(v));
const truthy = (v: Value): boolean | FormulaError => (v instanceof FormulaError ? v : typeof v === "string" ? v !== "" && v.toUpperCase() !== "FALSE" : !!v);

/** What a number shows: at most 10 significant digits, no trailing zeros. */
export function format(n: number): string {
  if (!Number.isFinite(n)) return "#DIV/0!";
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return String(Number(n.toPrecision(10)));
}

/** The cells' values, computed on demand and remembered until the sheet changes (make a new one per version). */
export function formulas(rows: readonly (readonly string[])[]) {
  const done = new Map<string, Value>(), busy = new Set<string>(), trees = new Map<string, Node>();
  const raw = (r: number, c: number): string | undefined => (r < 0 || c < 0 ? undefined : rows[r]?.[c]);
  /** a cell's own value: its formula's result, a number, its text, or null when empty */
  function value(r: number, c: number): Value {
    const key = `${r},${c}`;
    if (done.has(key)) return done.get(key)!;
    const t = raw(r, c) ?? "";
    if (!isFormula(t)) return t === "" ? null : NUM.test(t) ? Number(t) : t;
    if (busy.has(key)) return err("#CYCLE!");
    busy.add(key);
    let tree = trees.get(t);
    if (!tree) { tree = parse(t.slice(1)); trees.set(t, tree); }
    const v = ev(tree);
    busy.delete(key);
    done.set(key, v);
    return v;
  }
  const cellsOf = (n: Node): Value[] => {
    if (n.t !== "range") return [ev(n)];
    const out: Value[] = [];
    for (let r = n.r0; r <= n.r1 && r < rows.length; r++) for (let c = n.c0; c <= n.c1; c++) out.push(value(r, c));
    return out;
  };
  /** the numbers among the arguments' cells (text and empty cells left out, as a spreadsheet's SUM does) */
  const numbers = (args: Node[]): number[] | FormulaError => {
    const out: number[] = [];
    for (const a of args) for (const v of cellsOf(a)) {
      if (v instanceof FormulaError) return v;
      if (typeof v === "number") out.push(v);
      else if (a.t !== "range" && v !== null) { const x = num(v); if (x instanceof FormulaError) return x; out.push(x); }
    }
    return out;
  };
  const FN: Record<string, (args: Node[]) => Value> = {
    SUM: (a) => { const n = numbers(a); return n instanceof FormulaError ? n : n.reduce((s, x) => s + x, 0); },
    PRODUCT: (a) => { const n = numbers(a); return n instanceof FormulaError ? n : n.reduce((s, x) => s * x, 1); },
    AVERAGE: (a) => { const n = numbers(a); return n instanceof FormulaError ? n : n.length ? n.reduce((s, x) => s + x, 0) / n.length : err("#DIV/0!"); },
    MIN: (a) => { const n = numbers(a); return n instanceof FormulaError ? n : n.length ? Math.min(...n) : 0; },
    MAX: (a) => { const n = numbers(a); return n instanceof FormulaError ? n : n.length ? Math.max(...n) : 0; },
    MEDIAN: (a) => {
      const n = numbers(a);
      if (n instanceof FormulaError) return n;
      if (!n.length) return err("#VALUE!");
      const s = [...n].sort((x, y) => x - y), m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    },
    COUNT: (a) => a.flatMap(cellsOf).filter((v) => typeof v === "number").length,
    COUNTA: (a) => a.flatMap(cellsOf).filter((v) => v !== null && v !== "").length,
    ABS: (a) => one(a, Math.abs), SQRT: (a) => one(a, (x) => (x < 0 ? err("#VALUE!") : Math.sqrt(x))),
    ROUND: (a) => two(a, (x, d) => { const f = 10 ** d; return Math.round(x * f) / f; }, 0),
    POWER: (a) => two(a, (x, y) => x ** y), MOD: (a) => two(a, (x, y) => (y === 0 ? err("#DIV/0!") : x - y * Math.floor(x / y))),
    IF: (a) => { const c = truthy(ev(a[0])); return c instanceof FormulaError ? c : c ? (a[1] ? ev(a[1]) : true) : (a[2] ? ev(a[2]) : false); },
    AND: (a) => { for (const v of a.flatMap(cellsOf)) { const t = truthy(v); if (t instanceof FormulaError || !t) return t; } return true; },
    OR: (a) => { for (const v of a.flatMap(cellsOf)) { const t = truthy(v); if (t instanceof FormulaError || t) return t; } return false; },
    NOT: (a) => { const t = truthy(ev(a[0])); return t instanceof FormulaError ? t : !t; },
    CONCAT: (a) => { const vs = a.flatMap(cellsOf); return vs.find((v) => v instanceof FormulaError) ?? vs.map(text).join(""); },
    LEN: (a) => { const v = ev(a[0]); return v instanceof FormulaError ? v : text(v).length; },
    UPPER: (a) => { const v = ev(a[0]); return v instanceof FormulaError ? v : text(v).toUpperCase(); },
    LOWER: (a) => { const v = ev(a[0]); return v instanceof FormulaError ? v : text(v).toLowerCase(); },
  };
  FN.AVG = FN.AVERAGE; FN.CONCATENATE = FN.CONCAT;
  function one(a: Node[], f: (x: number) => Value): Value { const x = num(ev(a[0])); return x instanceof FormulaError ? x : f(x); }
  function two(a: Node[], f: (x: number, y: number) => Value, dflt?: number): Value {
    const x = num(ev(a[0])), y = a[1] ? num(ev(a[1])) : dflt ?? err("#VALUE!");
    return x instanceof FormulaError ? x : y instanceof FormulaError ? y : f(x, y);
  }
  function ev(n: Node): Value {
    switch (n.t) {
      case "num": return n.v;
      case "str": return n.v;
      case "bool": return n.v;
      case "bad": return n.e;
      case "ref": return raw(n.r, n.c) === undefined && (n.r >= rows.length || n.r < 0) ? err("#REF!") : value(n.r, n.c);
      case "range": return err("#VALUE!"); // a range only inside a function
      case "un": { const x = num(ev(n.a)); return x instanceof FormulaError ? x : n.op === "-" ? -x : x; }
      case "call": { const f = FN[n.name]; return f ? f(n.args) : err("#NAME?"); }
      case "bin": {
        const a = ev(n.a), b = ev(n.b);
        if (a instanceof FormulaError) return a;
        if (b instanceof FormulaError) return b;
        if (n.op === "&") return text(a) + text(b);
        if (["=", "<>", "<", ">", "<=", ">="].includes(n.op)) {
          const both = typeof a === "number" && typeof b === "number";
          const x = both ? (a as number) : text(a).toLowerCase(), y = both ? (b as number) : text(b).toLowerCase();
          return n.op === "=" ? x === y : n.op === "<>" ? x !== y : n.op === "<" ? x < y : n.op === ">" ? x > y : n.op === "<=" ? x <= y : x >= y;
        }
        const x = num(a), y = num(b);
        if (x instanceof FormulaError) return x;
        if (y instanceof FormulaError) return y;
        switch (n.op) {
          case "+": return x + y;
          case "-": return x - y;
          case "*": return x * y;
          case "/": return y === 0 ? err("#DIV/0!") : x / y;
          default: return x ** y;
        }
      }
    }
  }
  return {
    value,
    /** what a cell shows: its formula's result as text, else its own text */
    shown(r: number, c: number): string {
      const t = raw(r, c) ?? "";
      return isFormula(t) ? text(value(r, c)) : t;
    },
  };
}

/** The rows as they read: each formula cell replaced by its result (the same rows, untouched, when there is none) —
 *  what filters, sort, the footer's numbers and plots work on. */
export function valuesOf(rows: readonly string[][]): string[][] {
  if (!rows.some((r) => r.some(isFormula))) return rows as string[][];
  const f = formulas(rows);
  return rows.map((r, i) => (r.some(isFormula) ? r.map((t, c) => (isFormula(t) ? f.shown(i, c) : t)) : r));
}
