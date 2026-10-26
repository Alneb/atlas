// Markdown tables edited in place, as in Obsidian: a click in a cell of a
// rendered table edits that cell's own markdown (`**bold**`, `[[link]]` stay as written); leaving it writes just that
// cell back into the table's lines. Tab / Shift+Tab move along, Enter goes down a row (a new one past the last),
// Escape gives up; "+" adds a row or a column, "−" removes one. The note's text stays the one source: every edit is a
// change of its table lines, which the live preview then draws again (ui/src/vendor/obsidian-web/live-preview.js).
import type { EditorView } from "@codemirror/view";

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

/** What in a drawn cell is clicked for itself, not to edit the cell. */
const LIVE_IN_CELL = "a, button, input, label, summary";

const rowOf = (cells: string[]) => `| ${cells.join(" | ")} |`;
/** What a cell may hold: one line, its pipes escaped. */
const clean = (t: string) => t.replace(/\r?\n/g, " ").replace(/(?<!\\)\|/g, "\\|").trim();

interface Table { first: number; last: number; rows: string[][]; aligns: string[] }

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

/** Where the cursor goes after the table is drawn again: its first line, and the cell (row 0: the header). */
let pending: { first: number; row: number; col: number } | null = null;

function write(view: EditorView, t: Table, change: (t: Table) => void, then?: { row: number; col: number }) {
  change(t);
  const doc = view.state.doc, from = doc.line(t.first).from, to = doc.line(t.last).to;
  pending = then ? { first: t.first, ...then } : null;
  view.dispatch({ changes: { from, to, insert: linesOf(t).join("\n") }, userEvent: "input.table" });
}

/** Makes the tables just drawn in `host` editable — on the next frame: the block is drawn before it is in the editor
 *  (whose view may not exist yet, on the first draw), and its place in the text is read from where it is. Tables of
 *  an embed or a Base are theirs, not this note's. */
export function hydrateTables(host: HTMLElement, viewRef: { view: EditorView | null }): void {
  if (!host.querySelector("table")) return;
  requestAnimationFrame(() => { if (viewRef.view && host.isConnected) hydrateNow(host, viewRef.view); });
}

function hydrateNow(host: HTMLElement, view: EditorView): void {
  for (const table of host.querySelectorAll<HTMLTableElement>("table")) {
    if (table.closest(".note-embed, .atlas-block, .base") || table.dataset.editable) continue;
    const t = tableAt(view.state.doc, view.posAtDOM(table));
    const trs = [...table.querySelectorAll<HTMLTableRowElement>("tr")];
    if (!t || trs.length !== t.rows.length) continue; // drawn differently than it is written: left alone
    table.dataset.editable = "1";
    table.classList.add("table-edit");
    trs.forEach((tr, r) => [...tr.children].forEach((cell, c) => cellEditable(view, table, cell as HTMLElement, r, c)));
    controls(view, table);
    if (pending && pending.first === t.first) {
      const { row, col } = pending;
      pending = null;
      (trs[row]?.children[col] as HTMLElement | undefined)?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    }
  }
}

/** The table's current source (the document may have changed since it was drawn). */
const now = (view: EditorView, table: HTMLElement) => tableAt(view.state.doc, view.posAtDOM(table));

function cellEditable(view: EditorView, table: HTMLElement, cell: HTMLElement, r: number, c: number) {
  cell.addEventListener("mousedown", (e) => {
    // a link, a checkbox or a button in the cell does its own thing (the editor's link clicks: lib/editor/link-clicks.ts)
    if (!cell.isContentEditable && (e.button !== 0 || (e.target as Element | null)?.closest?.(LIVE_IN_CELL))) return;
    e.stopPropagation(); // the editor would move its caret into the table and show its markdown
    if (cell.isContentEditable) return;
    const t = now(view, table);
    if (!t) return;
    e.preventDefault();
    const before = t.rows[r]?.[c] ?? "";
    cell.textContent = before.replace(/\\\|/g, "|");
    cell.contentEditable = "plaintext-only";
    cell.classList.add("editing");
    cell.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
    let done = false;
    const finish = (to?: { row: number; col: number }, keep = true) => {
      if (done) return;
      done = true;
      cell.contentEditable = "false";
      cell.classList.remove("editing");
      const text = clean(cell.textContent ?? "");
      const t2 = now(view, table);
      if (!t2) return;
      if (!keep || text === before) {
        if (to) { pending = { first: t2.first, ...to }; hydrateAgain(table); }
        else cell.textContent = before; // drawn again by the preview soon; meanwhile what was there
        return;
      }
      write(view, t2, (x) => { x.rows[r][c] = text; }, to);
    };
    const key = (ev: KeyboardEvent) => {
      ev.stopPropagation(); // the note's keys (vim among them) stay out of the cell
      const t2 = now(view, table);
      if (!t2) return;
      const cols = t2.rows[0].length;
      if (ev.key === "Tab") {
        ev.preventDefault();
        const i = r * cols + c + (ev.shiftKey ? -1 : 1);
        if (i >= 0 && i < t2.rows.length * cols) finish({ row: Math.floor(i / cols), col: i % cols });
        else finish();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        if (r + 1 < t2.rows.length) return finish({ row: r + 1, col: c });
        const text = clean(cell.textContent ?? "");
        done = true;
        write(view, t2, (x) => { x.rows[r][c] = text; x.rows.push(Array(cols).fill("")); }, { row: r + 1, col: c });
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        finish(undefined, false);
        view.focus();
      }
    };
    cell.addEventListener("keydown", key);
    for (const k of ["keypress", "keyup", "input", "beforeinput", "paste", "copy", "cut"]) cell.addEventListener(k, (ev) => ev.stopPropagation());
    cell.addEventListener("blur", () => finish(), { once: true });
  });
}

/** Moving to a cell without changing the text: the table is not drawn again, so the next cell is opened here. */
function hydrateAgain(table: HTMLElement) {
  if (!pending) return;
  const { row, col } = pending;
  pending = null;
  ([...table.querySelectorAll("tr")][row]?.children[col] as HTMLElement | undefined)?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
}

/** + row, + column, and a − for the row or column under the pointer. */
function controls(view: EditorView, table: HTMLElement) {
  const wrap = document.createElement("div");
  wrap.className = "table-edit-tools";
  const btn = (label: string, title: string, run: () => void) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.title = title; b.setAttribute("aria-label", title);
    b.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); run(); });
    return b;
  };
  const t0 = () => now(view, table);
  wrap.append(
    btn("+ row", "Add a row", () => { const t = t0(); if (t) write(view, t, (x) => x.rows.push(Array(x.rows[0].length).fill("")), { row: t.rows.length, col: 0 }); }),
    btn("+ column", "Add a column", () => { const t = t0(); if (t) write(view, t, (x) => { x.rows.forEach((row) => row.push("")); x.aligns.push("---"); }, { row: 0, col: t.rows[0].length }); }),
  );
  let at: { r: number; c: number } | null = null;
  const minusRow = btn("−", "Remove this row", () => { const t = t0(); if (t && at && at.r > 0 && t.rows.length > 2) write(view, t, (x) => x.rows.splice(at!.r, 1)); });
  const minusCol = btn("−", "Remove this column", () => { const t = t0(); if (t && at && t.rows[0].length > 1) write(view, t, (x) => { x.rows.forEach((row) => row.splice(at!.c, 1)); x.aligns.splice(at!.c, 1); }); });
  minusRow.className = "table-minus row"; minusCol.className = "table-minus col";
  table.addEventListener("mouseover", (e) => {
    const cell = (e.target as HTMLElement).closest("td, th") as HTMLTableCellElement | null;
    if (!cell) return;
    const tr = cell.parentElement as HTMLTableRowElement, rows = [...table.querySelectorAll("tr")];
    at = { r: rows.indexOf(tr), c: [...tr.children].indexOf(cell) };
    // over the hovered cell's own edges (its row's left, its column's top right), so no band is kept for them
    const b = box.getBoundingClientRect(), cb = cell.getBoundingClientRect(), tb = table.getBoundingClientRect();
    minusRow.hidden = at.r === 0;
    Object.assign(minusRow.style, { top: `${cb.top - b.top + cb.height / 2 - 7}px`, left: `${tb.left - b.left - 7}px` }); // on the frame's left border
    Object.assign(minusCol.style, { top: `${tb.top - b.top + 1}px`, left: `${cb.right - b.left - 16}px` });
  });
  // the framed table in a box of its own, which holds the controls (a button cannot sit in a <table>, and the frame
  // scrolls a wide table, which would clip them)
  const framed = table.closest<HTMLElement>(".table-wrap") ?? table;
  const box = document.createElement("div");
  box.className = "table-edit-box";
  framed.before(box);
  box.append(framed, minusRow, minusCol, wrap);
}
