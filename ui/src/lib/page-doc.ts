// A `.page` file as a model the UI can edit (docs/design/PAGES.md). The file is YAML and stays the truth:
// `parsePage` reads it, the edit functions below change the model, `writePage` puts the rows back
// into the same YAML document — so the title, other keys and the comments above them survive.
//
//   title: Today
//   rows:
//     - [greeting]                              # a row: a list of blocks
//     - columns: [[focus, log], [tasks]]        # or columns, each a list of blocks
//       widths: [2, 1]                          # optional relative widths
//
// A block is a name (`tasks`), or `{ view: <type>, …options, title: … }`. Older shorthands still
// read: `{ note: x.md }`, `{ base: x.base }`, `{ text: "markdown" }`.
import { parseDocument, stringify, isMap, isSeq, type Document } from "yaml";

export interface PageBlock {
  /** Stable while the page is open (drag and drop, keyed rendering); not written to the file. */
  id: number;
  type: string;
  title?: string;
  /** Everything else the block says (`path`, `from`, `height`…). */
  options: Record<string, unknown>;
}
export interface PageRow { columns: PageBlock[][]; widths?: number[] }
export interface PageModel { title?: string; rows: PageRow[] }
/** Where a block is: row, column, index in the column. */
export interface BlockAt { row: number; col: number; index: number }

let ids = 0;
export const newBlock = (type: string, options: Record<string, unknown> = {}, title?: string): PageBlock => ({ id: ++ids, type, title, options });

function readBlock(v: unknown): PageBlock {
  if (typeof v === "string") return newBlock(v);
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`a block is a name or { view: … }, not ${JSON.stringify(v)}`);
  const { view, type, title, note, base, text, table, ...rest } = v as Record<string, unknown>;
  const t = typeof title === "string" ? title : undefined;
  if (typeof note === "string") return newBlock("note", { path: note, ...rest }, t);
  if (typeof base === "string") return newBlock("base", { path: base, ...(typeof table === "string" ? { table } : {}), ...rest }, t);
  if (typeof text === "string") return newBlock("text", { text, ...rest }, t);
  const kind = typeof view === "string" ? view : typeof type === "string" ? type : null;
  if (!kind) throw new Error("a block needs `view:` (or is a bare name)");
  return newBlock(kind, { ...(table === undefined ? {} : { table }), ...rest }, t);
}
const readBlocks = (v: unknown): PageBlock[] => (Array.isArray(v) ? v.map(readBlock) : [readBlock(v)]);

/** Parses a `.page` into the model and the YAML document it came from (kept for `writePage`);
 *  throws an Error whose message names the problem (the page shows it). */
export function parsePage(src: string): { model: PageModel; doc: Document } {
  const doc = parseDocument(src);
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  const raw = (doc.toJS() ?? {}) as { title?: unknown; rows?: unknown };
  const rows = (Array.isArray(raw.rows) ? raw.rows : []).map((r): PageRow => {
    const cols = r && typeof r === "object" && !Array.isArray(r) ? (r as { columns?: unknown; widths?: unknown }) : null;
    if (cols && Array.isArray(cols.columns)) {
      const widths = Array.isArray(cols.widths) && cols.widths.length === cols.columns.length && cols.widths.every((w) => typeof w === "number" && w > 0) ? (cols.widths as number[]) : undefined;
      return { columns: cols.columns.map(readBlocks), widths };
    }
    return { columns: [readBlocks(r)] };
  });
  return { model: { title: typeof raw.title === "string" ? raw.title : undefined, rows }, doc };
}

/** The YAML a block is drawn from (what lib/blocks.ts mounts): its type and options. */
export const blockSrc = (b: PageBlock): string => stringify({ type: b.type, ...b.options });

const writeBlock = (b: PageBlock): unknown =>
  !b.title && !Object.keys(b.options).length ? b.type : { view: b.type, ...b.options, ...(b.title ? { title: b.title } : {}) };

/** The file text for the model: only `rows` is rewritten (comments inside the old rows are not kept). */
export function writePage(m: PageModel, doc: Document): string {
  const rows = m.rows.filter((r) => r.columns.some((c) => c.length)).map((r) => {
    const cols = r.columns.filter((c) => c.length);
    if (cols.length === 1) return cols[0].map(writeBlock);
    const widths = r.widths && r.widths.length === r.columns.length ? r.widths.filter((_, i) => r.columns[i].length) : undefined;
    return { columns: cols.map((c) => c.map(writeBlock)), ...(widths ? { widths } : {}) };
  });
  const node = doc.createNode(rows);
  // one line per list of blocks: a page reads (and diffs) as its layout
  const flow = (n: unknown): void => {
    if (isSeq(n)) { const leaf = n.items.every((i) => !isSeq(i) && !(isMap(i) && i.has("columns"))); if (leaf) n.flow = true; n.items.forEach(flow); }
    else if (isMap(n)) { if (n.has("columns")) n.items.forEach((p) => flow(p.value)); else n.flow = true; }
  };
  if (isSeq(node)) node.items.forEach(flow);
  doc.set("rows", node);
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

// --- edits (they change the model in place; the caller saves) ----------------------------------------

const column = (m: PageModel, at: { row: number; col: number }) => m.rows[at.row]?.columns[at.col];
export const blockAt = (m: PageModel, at: BlockAt) => column(m, at)?.[at.index];
export function findBlock(m: PageModel, id: number): BlockAt | null {
  for (const [row, r] of m.rows.entries()) for (const [col, c] of r.columns.entries()) { const index = c.findIndex((b) => b.id === id); if (index >= 0) return { row, col, index }; }
  return null;
}

/** Rows and columns left empty by an edit disappear (their widths with them). */
function tidy(m: PageModel): void {
  for (const r of m.rows) {
    if (r.columns.length > 1 && r.columns.some((c) => !c.length)) {
      if (r.widths) r.widths = r.widths.filter((_, i) => r.columns[i].length);
      r.columns = r.columns.filter((c) => c.length);
    }
    if (r.widths && r.widths.length !== r.columns.length) r.widths = undefined;
  }
  m.rows = m.rows.filter((r) => r.columns.some((c) => c.length));
}

export function insertBlock(m: PageModel, at: BlockAt, b: PageBlock): void {
  column(m, at)?.splice(at.index, 0, b);
}
/** A new full-width row holding `b`, before row `row` (or at the end). */
export function insertRow(m: PageModel, row: number, b: PageBlock): void {
  m.rows.splice(Math.min(row, m.rows.length), 0, { columns: [[b]] });
}
/** A new column holding `b` at the right of row `row`. */
export function insertColumn(m: PageModel, row: number, b: PageBlock): void {
  const r = m.rows[row];
  if (!r) return;
  r.columns.push([b]);
  r.widths = undefined;
}
export function removeBlock(m: PageModel, id: number): void {
  const at = findBlock(m, id);
  if (at) { column(m, at)!.splice(at.index, 1); tidy(m); }
}
/** Where a moved block lands: inside a column, as a new row, or as a new column of a row. */
export type Drop = { kind: "at"; at: BlockAt } | { kind: "row"; row: number } | { kind: "column"; row: number };
export function moveBlock(m: PageModel, id: number, to: Drop): void {
  const from = findBlock(m, id);
  if (!from) return;
  const b = column(m, from)![from.index];
  // remove first, leaving the emptied slot in place so the target's coordinates stay valid
  column(m, from)!.splice(from.index, 1);
  if (to.kind === "at") {
    const shift = from.row === to.at.row && from.col === to.at.col && from.index < to.at.index ? 1 : 0;
    insertBlock(m, { ...to.at, index: to.at.index - shift }, b);
  } else if (to.kind === "row") insertRow(m, to.row, b);
  else insertColumn(m, to.row, b);
  tidy(m);
}
export function setWidths(m: PageModel, row: number, widths: number[]): void {
  const r = m.rows[row];
  if (r && widths.length === r.columns.length) r.widths = widths.map((w) => Math.round(w * 100) / 100);
}
