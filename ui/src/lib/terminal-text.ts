// A terminal's buffer read as text for links: rows joined into runs (soft wraps, and a program's own line breaks
// inside an open `[[`), each character keeping the cell it was drawn in, and the wikilinks of a run (wikilink-syntax.ts).
// Pure: tested without a browser (ui/tests/terminal-wikilinks.spec.ts).
import type { IBufferCell, IBufferLine } from "@xterm/xterm";
import { wikilinksIn } from "./wikilink-syntax";

export type Cell = { row: number; x: number; w: number };
/** Rows read as one line: each character with the cell it was drawn in; `joins` are the spaces put
 *  between rows a program wrapped itself (they may stand for a space it dropped, or for nothing). */
export type Run = { text: string; cells: Cell[]; joins: Set<number> };

const SOFT_ROWS = 40; // a soft-wrapped line is read at most this far up and down
const HARD_ROWS = 3; // rows joined across a program's own line break, only while a `[[` is left open

/** The characters of one buffer row with their cells; `trim` drops the blanks at the row's start / end. */
function rowRun(line: IBufferLine, row: number, cell: IBufferCell, trim: { start?: boolean; end?: boolean }): Run {
  const run: Run = { text: "", cells: [], joins: new Set() };
  for (let x = 0; x < line.length; x++) {
    line.getCell(x, cell);
    const w = cell.getWidth();
    if (!w) continue; // the right half of a wide character
    const ch = cell.getChars() || " ";
    for (const u of ch) { run.text += u; for (let i = 0; i < u.length; i++) run.cells.push({ row, x, w }); }
  }
  if (trim.end) { const n = run.text.trimEnd().length; run.text = run.text.slice(0, n); run.cells.length = n; }
  if (trim.start) { const k = run.text.length - run.text.trimStart().length; run.text = run.text.slice(k); run.cells.splice(0, k); }
  return run;
}

function trimStart(r: Run): Run {
  const k = r.text.length - r.text.trimStart().length;
  return { text: r.text.slice(k), cells: r.cells.slice(k), joins: new Set([...r.joins].map((j) => j - k)) };
}

function concat(a: Run, b: Run, join: boolean): Run {
  const out: Run = { text: a.text, cells: [...a.cells], joins: new Set(a.joins) };
  if (join && a.cells.length) { out.joins.add(out.text.length); out.text += " "; out.cells.push(a.cells[a.cells.length - 1]); }
  for (const j of b.joins) out.joins.add(j + out.text.length);
  out.text += b.text;
  out.cells.push(...b.cells);
  return out;
}

const openAtEnd = (t: string) => t.lastIndexOf("[[") > t.lastIndexOf("]]");
const closedAtStart = (t: string) => { const c = t.indexOf("]]"); return c >= 0 && !t.slice(0, c).includes("[["); };

/** Row `row` with the rows it continues into: soft wraps always, a program's own breaks while a link is open. */
export function runAround(rows: { line(y: number): IBufferLine | undefined; cell: IBufferCell }, row: number): Run {
  const { line, cell } = rows;
  let top = row, bottom = row;
  while (top > 0 && line(top)?.isWrapped && row - top < SOFT_ROWS) top--;
  while (line(bottom + 1)?.isWrapped && bottom - row < SOFT_ROWS) bottom++;
  let run: Run = { text: "", cells: [], joins: new Set() };
  for (let y = top; y <= bottom; y++) run = concat(run, rowRun(line(y)!, y, cell, { end: y === bottom }), false);
  for (let n = 0; n < HARD_ROWS && openAtEnd(run.text) && line(bottom + 1); n++) {
    bottom++;
    run = concat(run, rowRun(line(bottom)!, bottom, cell, { start: true, end: true }), true);
  }
  for (let n = 0; n < HARD_ROWS && closedAtStart(run.text) && top > 0 && line(top - 1); n++) {
    top--;
    run = concat(rowRun(line(top)!, top, cell, { end: true }), trimStart(run), true); // the row's indentation is no part of the link
  }
  return run;
}

/** A found link: the text that names it (the target with its #section), and its cells. */
export type TermLink = { target: string; start: Cell; end: Cell };

/** The wikilinks of `run` that touch `row`; a target split by a program's break is read with the space, then without. */
export function linksOn(run: Run, row: number, resolves: (target: string) => boolean): TermLink[] {
  return wikilinksIn(run.text).flatMap((m) => {
    const from = m.embed ? m.start + 1 : m.start;
    const start = run.cells[from], end = run.cells[m.end - 1];
    if (start.row > row || end.row < row) return [];
    let target = m.target;
    const inner = [...run.joins].filter((j) => j > from && j < m.end);
    if (inner.length && !resolves(target)) {
      const squeezed = [...run.text.slice(from, m.end)].filter((_, i) => !inner.includes(from + i)).join("");
      const alt = wikilinksIn(squeezed)[0]?.target;
      if (alt && resolves(alt)) target = alt;
    }
    return [{ target, start, end }];
  });
}
