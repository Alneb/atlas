// A Sheet being edited: every change is an Op, applying one gives back the Op that undoes it, so undo / redo is a
// stack of Ops. The rows stay plain arrays (a run's table has 10⁶ cells: no deep proxies); `version` is what the view
// watches. Unsaved = the history is somewhere else than where it was saved.
import { numericColumns, type Sheet } from "./parse";
import { rowText } from "./write";

/** A place in the table as shown: `r` a position in the rows shown, `c` in the columns shown. */
export type Cell = { r: number; c: number };

type Snapshot = { raw: (string | null)[]; headerRaw: string | null; comments: Sheet["comments"]; header: string[] };

export type Op =
  | { kind: "cells"; at: { r: number; c: number; value: string }[] }
  | { kind: "insertRows"; at: number; rows: string[][]; raw?: (string | null)[] }
  | { kind: "deleteRows"; at: number; count: number }
  | { kind: "moveRows"; from: number; count: number; to: number }
  | { kind: "insertCol"; at: number; name: string; cells?: string[]; restore?: Snapshot }
  | { kind: "deleteCol"; at: number; restore?: Snapshot }
  | { kind: "moveCol"; from: number; to: number; restore?: Snapshot }
  | { kind: "rename"; c: number; name: string; restore?: Snapshot }
  | { kind: "headerRow"; on: boolean; restore?: Snapshot }
  /** several changes undone as one (a paste that adds rows) */
  | { kind: "batch"; ops: Op[] };

const MAX_HISTORY = 500;

export class SheetEdit {
  version = $state(0);
  private past: { op: Op; id: number }[] = [];
  private future: { op: Op; id: number }[] = [];
  private nextId = 1;
  private savedId = 0;
  constructor(public sheet: Sheet) {}

  get dirty(): boolean { void this.version; return (this.past.at(-1)?.id ?? 0) !== this.savedId; }
  get canUndo(): boolean { void this.version; return this.past.length > 0; }
  get canRedo(): boolean { void this.version; return this.future.length > 0; }
  markSaved(): void { this.savedId = this.past.at(-1)?.id ?? 0; this.version++; }

  /** A change made by the person: kept for undo, redo forgotten. */
  do(op: Op): void {
    this.past.push({ op: this.apply(op), id: this.nextId++ });
    if (this.past.length > MAX_HISTORY) this.past.shift();
    this.future = [];
    this.version++;
  }
  undo(): void { this.swap(this.past, this.future); }
  redo(): void { this.swap(this.future, this.past); }
  private swap(from: { op: Op; id: number }[], to: { op: Op; id: number }[]) {
    const e = from.pop();
    if (!e) return;
    // an entry keeps its id both ways, so undoing back to the saved point shows saved again
    to.push({ op: this.apply(e.op), id: e.id });
    this.version++;
  }

  private snapshot(): Snapshot {
    const s = this.sheet;
    return { raw: s.raw.slice(), headerRaw: s.headerRaw, comments: s.comments.map((c) => ({ ...c })), header: s.header.slice() };
  }
  private restore(x: Snapshot) {
    Object.assign(this.sheet, { raw: x.raw.slice(), headerRaw: x.headerRaw, comments: x.comments.map((c) => ({ ...c })), header: x.header.slice() });
  }
  /** Every row's columns changed: none keeps its text as read. */
  private rewriteAll() {
    const s = this.sheet;
    s.raw = s.rows.map(() => null);
    s.headerRaw = null;
    this.headerComment();
  }
  /** A header kept in the file's last opening comment follows the header's names. */
  private headerComment() {
    const s = this.sheet, mark = s.layout.comment;
    if (s.headerSource !== "comment" || !mark) return;
    const lead = s.comments.filter((c) => c.at <= 0).at(-1);
    if (lead) lead.text = `${mark} ${rowText(s.header, { ...s.layout, quoteAll: false })}`;
  }
  private renumber() { this.sheet.numeric = numericColumns(this.sheet.header.length, this.sheet.rows); }

  /** Applies `op`; returns the Op that undoes it. */
  private apply(op: Op): Op {
    const s = this.sheet;
    switch (op.kind) {
      case "batch":
        return { kind: "batch", ops: op.ops.map((o) => this.apply(o)).reverse() };
      case "cells": {
        const back = op.at.map(({ r, c }) => ({ r, c, value: s.rows[r]?.[c] ?? "" }));
        for (const { r, c, value } of op.at) {
          const row = s.rows[r];
          if (!row) continue;
          while (row.length <= c) row.push("");
          row[c] = value;
          s.raw[r] = null;
        }
        const cols = new Set(op.at.map((x) => x.c));
        const num = numericColumns(s.header.length, s.rows);
        for (const c of cols) s.numeric[c] = num[c];
        return { kind: "cells", at: back };
      }
      case "insertRows": {
        const width = s.header.length;
        s.rows.splice(op.at, 0, ...op.rows.map((r) => { const x = r.slice(); while (x.length < width) x.push(""); return x; }));
        s.raw.splice(op.at, 0, ...(op.raw ?? op.rows.map(() => null)));
        for (const c of s.comments) if (c.at > op.at) c.at += op.rows.length;
        return { kind: "deleteRows", at: op.at, count: op.rows.length };
      }
      case "deleteRows": {
        const rows = s.rows.splice(op.at, op.count), raw = s.raw.splice(op.at, op.count);
        for (const c of s.comments) if (c.at > op.at) c.at = Math.max(op.at, c.at - op.count);
        return { kind: "insertRows", at: op.at, rows, raw };
      }
      case "moveRows": {
        const rows = s.rows.splice(op.from, op.count), raw = s.raw.splice(op.from, op.count);
        s.rows.splice(op.to, 0, ...rows);
        s.raw.splice(op.to, 0, ...raw);
        return { kind: "moveRows", from: op.to, count: op.count, to: op.from };
      }
      case "insertCol": {
        const restore = this.snapshot();
        s.header.splice(op.at, 0, op.name);
        s.rows.forEach((r, i) => { while (r.length < op.at) r.push(""); r.splice(op.at, 0, op.cells?.[i] ?? ""); });
        if (op.restore) this.restore({ ...op.restore, header: s.header.slice() }); else this.rewriteAll();
        this.renumber();
        return { kind: "deleteCol", at: op.at, restore };
      }
      case "deleteCol": {
        const restore = this.snapshot();
        const name = s.header.splice(op.at, 1)[0] ?? "";
        const cells = s.rows.map((r) => r.splice(op.at, 1)[0] ?? "");
        if (op.restore) this.restore({ ...op.restore, header: s.header.slice() }); else this.rewriteAll();
        this.renumber();
        return { kind: "insertCol", at: op.at, name, cells, restore };
      }
      case "moveCol": {
        const restore = this.snapshot();
        const move = <T>(a: T[]) => { if (op.from < a.length) a.splice(op.to, 0, a.splice(op.from, 1)[0]); };
        move(s.header);
        s.rows.forEach((r) => { while (r.length < s.header.length) r.push(""); move(r); });
        if (op.restore) this.restore({ ...op.restore, header: s.header.slice() }); else this.rewriteAll();
        this.renumber();
        return { kind: "moveCol", from: op.to, to: op.from, restore };
      }
      case "rename": {
        const restore = this.snapshot();
        if (s.headerSource === "none") { s.headerSource = "row"; s.headerRaw = null; }
        s.header[op.c] = op.name;
        if (op.restore) this.restore({ ...op.restore, header: s.header.slice() });
        else { s.headerRaw = null; this.headerComment(); }
        return { kind: "rename", c: op.c, name: restore.header[op.c], restore };
      }
      case "headerRow": {
        // the first row becomes the header (on) or the header goes back to being the first row (off)
        const restore = this.snapshot();
        if (op.on && s.headerSource !== "row" && s.rows.length) {
          s.header = s.rows.shift()!.slice();
          s.headerRaw = s.raw.shift() ?? null;
          for (const c of s.comments) c.at = c.at === 0 ? -1 : c.at - 1;
          s.headerSource = "row";
        } else if (!op.on && s.headerSource === "row") {
          s.rows.unshift(s.header.slice());
          s.raw.unshift(s.headerRaw);
          for (const c of s.comments) if (c.at >= 0) c.at += 1; else c.at = 0;
          s.header = s.header.map((_, k) => `col ${k + 1}`);
          s.headerRaw = null;
          s.headerSource = "none";
        }
        if (op.restore) this.restore(op.restore);
        this.renumber();
        return { kind: "headerRow", on: !op.on, restore };
      }
    }
  }
}
