// A Markdown pipe table as rows of cell sources, and what the table editor does to it (lib/editor/table-edit.ts):
// pure, so it is tested without a page.
const ROW = /^\s*\|.*\|\s*$/;
const SEP = /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*\|?\s*$/;

/** A row's cells, split on the pipes not escaped (`\|` stays in its cell). */
export function cellsOf(line: string): string[] {
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "\\|"; i++; }
    else if (s[i] === "|") { out.push(cur.trim()); cur = ""; }
    else cur += s[i];
  }
  out.push(cur.trim());
  return out;
}


const rowOf = (cells: string[]) => `| ${cells.join(" | ")} |`;
/** What a cell may hold: one line, its pipes escaped. */
export const clean = (t: string) => t.replace(/\r?\n/g, " ").replace(/(?<!\\)\|/g, "\\|").trim();

export interface Table { first: number; last: number; rows: string[][]; aligns: string[] }

/** The table's lines in the document, around `pos`; null when they are not a pipe table with its separator row. */
export function tableAt(doc: { lines: number; line(n: number): { text: string }; lineAt(p: number): { number: number } }, pos: number): Table | null {
  let n = doc.lineAt(pos).number;
  const is = (k: number) => k >= 1 && k <= doc.lines && ROW.test(doc.line(k).text);
  if (!is(n) && is(n + 1)) n++; // the widget can sit at the line's start
  if (!is(n)) return null;
  let first = n, last = n;
  while (is(first - 1)) first--;
  while (is(last + 1)) last++;
  const lines = Array.from({ length: last - first + 1 }, (_, i) => doc.line(first + i).text);
  if (lines.length < 2 || !SEP.test(lines[1])) return null;
  const aligns = cellsOf(lines[1]);
  const rows = [lines[0], ...lines.slice(2)].map(cellsOf);
  const width = Math.max(aligns.length, ...rows.map((r) => r.length));
  for (const r of rows) while (r.length < width) r.push("");
  while (aligns.length < width) aligns.push("---");
  return { first, last, rows, aligns };
}

/** The table's lines again, after `edit` changed its rows (header first) and column alignments. */
export function linesOf(t: Pick<Table, "rows" | "aligns">): string[] {
  return [rowOf(t.rows[0]), rowOf(t.aligns), ...t.rows.slice(1).map(rowOf)];
}

export type Align = "none" | "left" | "center" | "right";
const ALIGN_SEP: Record<Align, string> = { none: "---", left: ":---", center: ":---:", right: "---:" };

/** A column's alignment, read from its separator cell. */
export function alignOf(sep: string): Align {
  const l = sep.startsWith(":"), r = sep.endsWith(":");
  return l && r ? "center" : r ? "right" : l ? "left" : "none";
}

type Rows = Pick<Table, "rows" | "aligns">;
const swap = <T>(a: T[], i: number, j: number) => { [a[i], a[j]] = [a[j], a[i]]; };
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** What the buttons and the menu do to a table — pure, on its rows (row 0 the header, which stays first). */
export const tableOps = {
  insertRow: (t: Rows, at: number) => { t.rows.splice(Math.max(1, at), 0, Array(t.rows[0].length).fill("")); },
  insertCol: (t: Rows, at: number) => { t.rows.forEach((row) => row.splice(at, 0, "")); t.aligns.splice(at, 0, "---"); },
  removeRow: (t: Rows, r: number) => { if (r > 0 && t.rows.length > 2) t.rows.splice(r, 1); },
  removeCol: (t: Rows, c: number) => { if (t.rows[0].length > 1) { t.rows.forEach((row) => row.splice(c, 1)); t.aligns.splice(c, 1); } },
  /** One place up (-1) or down (+1); the header never moves. */
  moveRow: (t: Rows, r: number, d: -1 | 1) => { if (r > 0 && r + d > 0 && r + d < t.rows.length) swap(t.rows, r, r + d); },
  moveCol: (t: Rows, c: number, d: -1 | 1) => {
    if (c + d < 0 || c + d >= t.rows[0].length) return;
    t.rows.forEach((row) => swap(row, c, c + d));
    swap(t.aligns, c, c + d);
  },
  align: (t: Rows, c: number, a: Align) => { t.aligns[c] = ALIGN_SEP[a]; },
  /** The body rows by one column, numbers by value; empty cells last either way. */
  sort: (t: Rows, c: number, desc: boolean) => {
    const body = t.rows.slice(1).sort((a, b) => (a[c] === "") !== (b[c] === "") ? (a[c] === "" ? 1 : -1) : (desc ? -1 : 1) * collator.compare(a[c], b[c]));
    t.rows.splice(1, body.length, ...body);
  },
};

/** Where in a cell's source the caret goes for a click `k` characters into its drawn text: the drawn text after the
 *  click is found again, backwards, in the source (markup like `**` or a link's target is skipped); null when it
 *  cannot be (the end is used). */
export function caretIn(source: string, drawn: string, k: number): number | null {
  let i = source.length;
  for (let j = drawn.length - 1; j >= k; j--) {
    if (/\s/.test(drawn[j])) { if (/\s/.test(source[i - 1] ?? "")) i--; continue; } // the drawing may fold or drop spaces
    i = source.lastIndexOf(drawn[j], i - 1);
    if (i < 0) return null;
  }
  return k === 0 ? 0 : i; // a click at the very start: before any markup (`|[[x|alias]]`, not `[[x||alias]]`)
}
