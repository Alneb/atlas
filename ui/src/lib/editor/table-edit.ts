// Markdown tables edited in place, as in Obsidian: a click in a cell of a
// rendered table edits that cell's own markdown (`**bold**`, `[[link]]` stay as written), the caret where it was
// clicked; leaving it writes just that cell back into the table's lines. Tab / Shift+Tab move along (a new row past
// the last cell), Enter and ↑ / ↓ go down and up a row (out of the table past its edges), ← / → cross into the
// next cell at a cell's edge, Escape gives up. "+" adds a row or a column, "−" removes one, a right-click inserts,
// moves, aligns, sorts or deletes. The note's text stays the one source: every edit is a change of its table lines,
// which the live preview then draws again (ui/src/lib/editor/live/live-preview.js).
import type { EditorView } from "@codemirror/view";
import type { MenuItem } from "../../components/ContextMenu.svelte";
import { atPointer, popMenu } from "../menu";
import { alignOf, caretIn, linesOf, tableAt, tableOps, clean, type Align, type Table } from "./table-md";

/** What in a drawn cell is clicked for itself, not to edit the cell. */
const LIVE_IN_CELL = "a, button, input, label, summary";
/** Drawn text that does not follow its source character by character: the caret goes to the end instead. */
const OPAQUE_IN_CELL = ".math, .katex, mjx-container, img, svg";

/** Where the caret goes in a cell opened: its start, its end, or an offset into its source. */
type Caret = "start" | "end" | number;
interface Target { row: number; col: number; caret: Caret }

/** The cell to open once the table is drawn again: the table's first line, and the cell (row 0: the header). */
let pending: ({ first: number } & Target) | null = null;
/** How each drawn cell is opened for editing (set when the table is made editable). */
const openers = new WeakMap<Element, (caret: Caret) => void>();

function write(view: EditorView, t: Table, change: (t: Table) => void, then?: Target) {
  change(t);
  const doc = view.state.doc, from = doc.line(t.first).from, to = doc.line(t.last).to;
  pending = then ? { first: t.first, ...then } : null;
  view.dispatch({ changes: { from, to, insert: linesOf(t).join("\n") }, userEvent: "input.table" });
}

/** Makes the tables just drawn in `host` editable — on the next frame: the block is drawn before it is in the editor
 *  (whose view may not exist yet, on the first draw), and its place in the text is read from where it is. A block
 *  still off the page then (a note restored at start) is made editable once the pointer reaches it. Tables of an
 *  embed or a Base are theirs, not this note's. */
export function hydrateTables(host: HTMLElement, viewRef: { view: EditorView | null }): void {
  if (!host.querySelector("table")) return;
  const ready = () => { if (viewRef.view && host.isConnected) hydrateNow(host, viewRef.view); };
  requestAnimationFrame(() => {
    ready();
    if (!host.querySelector(".table-edit")) host.addEventListener("pointerenter", ready, { once: true });
  });
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
    if (pending && pending.first === t.first) openPending(table);
  }
}

/** Opens the cell `pending` names in this drawing of the table. */
function openPending(table: HTMLElement) {
  if (!pending) return;
  const { row, col, caret } = pending;
  pending = null;
  const cell = [...table.querySelectorAll("tr")][row]?.children[col];
  if (cell) openers.get(cell)?.(caret);
}

/** The table's current source (the document may have changed since it was drawn). */
const now = (view: EditorView, table: HTMLElement) => tableAt(view.state.doc, view.posAtDOM(table));

/** How many characters of the cell's drawn text lie before the point clicked; null when unknown. */
function drawnOffset(cell: HTMLElement, x: number, y: number): number | null {
  if (cell.querySelector(OPAQUE_IN_CELL)) return null;
  const d = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const p = d.caretPositionFromPoint?.(x, y);
  const at = p ? { node: p.offsetNode, offset: p.offset } : (() => { const r = document.caretRangeFromPoint?.(x, y); return r && { node: r.startContainer, offset: r.startOffset }; })();
  if (!at || !cell.contains(at.node)) return null;
  const range = document.createRange();
  range.setStart(cell, 0);
  range.setEnd(at.node, at.offset);
  return range.toString().length;
}

/** Characters before the caret in an open cell, and the cell's length. */
function caretOf(cell: HTMLElement): { at: number; len: number } {
  const len = cell.textContent?.length ?? 0, sel = getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed || !cell.contains(sel.focusNode)) return { at: -1, len };
  const range = document.createRange();
  range.setStart(cell, 0);
  range.setEnd(sel.focusNode!, sel.focusOffset);
  return { at: range.toString().length, len };
}

function placeCaret(cell: HTMLElement, caret: Caret) {
  const text = cell.firstChild, len = text?.textContent?.length ?? 0;
  const at = caret === "start" ? 0 : caret === "end" ? len : Math.min(Math.max(caret, 0), len);
  const range = document.createRange();
  if (text) range.setStart(text, at); else range.selectNodeContents(cell);
  range.collapse(true);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
}

function cellEditable(view: EditorView, table: HTMLElement, cell: HTMLElement, r: number, c: number) {
  openers.set(cell, (caret) => openCell(view, table, cell, r, c, caret));
  cell.addEventListener("mousedown", (e) => {
    // a link, a checkbox or a button in the cell does its own thing (the editor's link clicks: lib/editor/link-clicks.ts)
    if (!cell.isContentEditable && (e.button !== 0 || (e.target as Element | null)?.closest?.(LIVE_IN_CELL))) return;
    e.stopPropagation(); // the editor would move its caret into the table and show its markdown
    if (cell.isContentEditable) return;
    e.preventDefault();
    const t = now(view, table), k = drawnOffset(cell, e.clientX, e.clientY);
    const source = (t?.rows[r]?.[c] ?? "").replace(/\\\|/g, "|");
    openCell(view, table, cell, r, c, k === null ? "end" : caretIn(source, cell.textContent ?? "", k) ?? "end");
  });
}

/** The cell as its markdown, editable, the caret at `caret`; leaving it writes it back. */
function openCell(view: EditorView, table: HTMLElement, cell: HTMLElement, r: number, c: number, caret: Caret) {
  if (cell.isContentEditable) return;
  const t = now(view, table);
  if (!t) return;
  const before = t.rows[r]?.[c] ?? "";
  // the cell as drawn (math, links, bold), put back when it is left unchanged: the note did not change, so the
  // preview draws nothing again, and its markdown (a formula's LaTeX) would stay on show
  const drawn = [...cell.childNodes];
  cell.textContent = before.replace(/\\\|/g, "|");
  cell.contentEditable = "plaintext-only";
  cell.classList.add("editing");
  cell.focus();
  placeCaret(cell, caret);
  let done = false;
  /** Leaves the cell: its text written (with `change` to the rest of the table), or the drawing put back. */
  const finish = (to?: Target, keep = true, change?: (x: Table) => void) => {
    if (done) return;
    done = true;
    cell.contentEditable = "false";
    cell.classList.remove("editing");
    const text = clean(cell.textContent ?? "");
    const t2 = now(view, table);
    if (!t2) return;
    if (!change && (!keep || text === before)) {
      cell.replaceChildren(...drawn);
      if (to) { pending = { first: t2.first, ...to }; openPending(table); }
      return;
    }
    write(view, t2, (x) => { if (keep) x.rows[r][c] = text; change?.(x); }, to);
  };
  /** Out of the table, the editor's caret on the line just above or below it. */
  const leave = (down: boolean) => {
    const t2 = now(view, table);
    finish();
    if (!t2) return;
    const doc = view.state.doc, n = down ? t2.last + 1 : t2.first - 1;
    const line = doc.line(Math.min(Math.max(n, 1), doc.lines));
    view.dispatch({ selection: { anchor: down ? line.from : line.to }, scrollIntoView: true });
    view.focus();
  };
  const key = (ev: KeyboardEvent) => {
    ev.stopPropagation(); // the note's keys (vim among them) stay out of the cell
    const t2 = now(view, table);
    if (!t2 || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const cols = t2.rows[0].length, rows = t2.rows.length;
    const { at, len } = caretOf(cell);
    const go = (row: number, col: number, caret: Caret) => { ev.preventDefault(); finish({ row, col, caret }); };
    const newRow = () => { ev.preventDefault(); finish({ row: rows, col: ev.key === "Tab" ? 0 : c, caret: "start" }, true, (x) => tableOps.insertRow(x, rows)); };
    if (ev.key === "Tab") {
      const i = r * cols + c + (ev.shiftKey ? -1 : 1);
      if (i >= rows * cols) newRow();
      else if (i >= 0) go(Math.floor(i / cols), i % cols, "end");
      else { ev.preventDefault(); finish(); }
    } else if (ev.key === "Enter" && !ev.shiftKey) {
      if (r + 1 < rows) go(r + 1, c, "end"); else newRow();
    } else if (ev.key === "ArrowDown" && !ev.shiftKey) {
      if (r + 1 < rows) go(r + 1, c, "end"); else { ev.preventDefault(); leave(true); }
    } else if (ev.key === "ArrowUp" && !ev.shiftKey) {
      if (r > 0) go(r - 1, c, "end"); else { ev.preventDefault(); leave(false); }
    } else if (ev.key === "ArrowLeft" && !ev.shiftKey && at === 0) {
      if (c > 0) go(r, c - 1, "end"); else if (r > 0) go(r - 1, cols - 1, "end");
    } else if (ev.key === "ArrowRight" && !ev.shiftKey && at === len) {
      if (c + 1 < cols) go(r, c + 1, "start"); else if (r + 1 < rows) go(r + 1, 0, "start");
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      finish(undefined, false);
      view.focus();
    }
  };
  cell.addEventListener("keydown", key);
  for (const k of ["keypress", "keyup", "input", "beforeinput", "paste", "copy", "cut"]) cell.addEventListener(k, (ev) => ev.stopPropagation());
  cell.addEventListener("blur", () => finish(), { once: true });
}

/** The right-click menu of the cell at row `r`, column `c`. */
function cellMenu(view: EditorView, table: HTMLElement, r: number, c: number): MenuItem[] {
  const t = now(view, table);
  if (!t) return [];
  const rows = t.rows.length, cols = t.rows[0].length, align = alignOf(t.aligns[c]);
  const run = (change: (x: Table) => void, then?: Target) => () => { const t2 = now(view, table); if (t2) write(view, t2, change, then); };
  const aligned = (a: Align, label: string): MenuItem => ({ label, icon: align === a ? "check" : undefined, run: run((x) => tableOps.align(x, c, a)) });
  return [
    { label: "Insert row above", icon: "arrow-up", disabled: r === 0, run: run((x) => tableOps.insertRow(x, r), { row: r, col: c, caret: "start" }) },
    { label: "Insert row below", icon: "arrow-down", run: run((x) => tableOps.insertRow(x, r + 1), { row: r + 1, col: c, caret: "start" }) },
    { label: "Insert column left", icon: "arrow-left", run: run((x) => tableOps.insertCol(x, c), { row: 0, col: c, caret: "start" }) },
    { label: "Insert column right", icon: "arrow-right", run: run((x) => tableOps.insertCol(x, c + 1), { row: 0, col: c + 1, caret: "start" }) },
    "sep",
    { label: "Move row up", disabled: r <= 1, run: run((x) => tableOps.moveRow(x, r, -1)) },
    { label: "Move row down", disabled: r === 0 || r === rows - 1, run: run((x) => tableOps.moveRow(x, r, 1)) },
    { label: "Move column left", disabled: c === 0, run: run((x) => tableOps.moveCol(x, c, -1)) },
    { label: "Move column right", disabled: c === cols - 1, run: run((x) => tableOps.moveCol(x, c, 1)) },
    "sep",
    aligned("left", "Align column left"), aligned("center", "Align column center"), aligned("right", "Align column right"), aligned("none", "No alignment"),
    "sep",
    { label: "Sort by this column, A → Z", disabled: rows < 3, run: run((x) => tableOps.sort(x, c, false)) },
    { label: "Sort by this column, Z → A", disabled: rows < 3, run: run((x) => tableOps.sort(x, c, true)) },
    "sep",
    { label: "Delete row", icon: "trash", danger: true, disabled: r === 0 || rows <= 2, run: run((x) => tableOps.removeRow(x, r)) },
    { label: "Delete column", icon: "trash", danger: true, disabled: cols <= 1, run: run((x) => tableOps.removeCol(x, c)) },
  ];
}

/** + row, + column, a − for the row or column under the pointer, and the cells' right-click menu. */
function controls(view: EditorView, table: HTMLElement) {
  const wrap = document.createElement("div");
  wrap.className = "table-edit-tools";
  const btn = (label: string, title: string, run: () => void) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.title = title; b.setAttribute("aria-label", title);
    b.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); run(); });
    return b;
  };
  const edit = (change: (x: Table) => void, then?: (t: Table) => Target) => { const t = now(view, table); if (t) write(view, t, change, then?.(t)); };
  wrap.append(
    btn("+ row", "Add a row", () => edit((x) => tableOps.insertRow(x, x.rows.length), (t) => ({ row: t.rows.length, col: 0, caret: "start" }))),
    btn("+ column", "Add a column", () => edit((x) => tableOps.insertCol(x, x.rows[0].length), (t) => ({ row: 0, col: t.rows[0].length, caret: "start" }))),
  );
  let at: { r: number; c: number } | null = null;
  const minusRow = btn("−", "Remove this row", () => { if (at && at.r > 0) edit((x) => tableOps.removeRow(x, at!.r)); });
  const minusCol = btn("−", "Remove this column", () => { if (at) edit((x) => tableOps.removeCol(x, at!.c)); });
  minusRow.className = "table-minus row"; minusCol.className = "table-minus col";
  const cellAt = (e: Event) => {
    const cell = (e.target as HTMLElement).closest("td, th") as HTMLTableCellElement | null;
    if (!cell) return null;
    const tr = cell.parentElement as HTMLTableRowElement;
    return { cell, r: [...table.querySelectorAll("tr")].indexOf(tr), c: [...tr.children].indexOf(cell) };
  };
  table.addEventListener("mouseover", (e) => {
    const hit = cellAt(e);
    if (!hit) return;
    at = { r: hit.r, c: hit.c };
    // over the hovered cell's own edges (its row's left, its column's top right), so no band is kept for them
    const b = box.getBoundingClientRect(), cb = hit.cell.getBoundingClientRect(), tb = table.getBoundingClientRect();
    minusRow.hidden = at.r === 0;
    Object.assign(minusRow.style, { top: `${cb.top - b.top + cb.height / 2 - 7}px`, left: `${tb.left - b.left - 7}px` }); // on the frame's left border
    Object.assign(minusCol.style, { top: `${tb.top - b.top + 1}px`, left: `${cb.right - b.left - 16}px` });
  });
  table.addEventListener("contextmenu", (e) => {
    const hit = cellAt(e);
    // an open cell keeps the browser's menu (spelling), as does Shift+right-click
    if (!hit || hit.cell.isContentEditable || e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    popMenu(atPointer(e, cellMenu(view, table, hit.r, hit.c)));
  });
  // the framed table in a box of its own, which holds the controls (a button cannot sit in a <table>, and the frame
  // scrolls a wide table, which would clip them)
  const framed = table.closest<HTMLElement>(".table-wrap") ?? table;
  const box = document.createElement("div");
  box.className = "table-edit-box";
  framed.before(box);
  box.append(framed, minusRow, minusCol, wrap);
}
