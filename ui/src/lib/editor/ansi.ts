// ANSI colours in a text file: a log, a run's output, a remote file read over SSH.
// The SGR codes (ESC [ … m) are hidden and the text between them drawn in the terminal's palette (--ansi-* in
// tokens.css); on the line being edited the codes show, as the live preview shows markup there. Only a document
// that holds an ESC [ near its start is looked at, so every other file pays one `includes`.
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder, type Text } from "@codemirror/state";

const NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;
const SGR = /\x1b\[([0-9;]*)m/g;
const LOOK = 200_000; // characters looked at for an ESC [ before deciding the file has none

/** The drawing state an SGR sequence leaves. */
export interface Sgr { fg?: string; bg?: string; bold?: boolean; dim?: boolean; italic?: boolean; underline?: boolean }

const palette = (n: number) => `var(--ansi-${n >= 8 ? "bright-" : ""}${NAMES[n % 8]})`;
/** xterm's 256 colours: 16 of the palette, a 6×6×6 cube, 24 greys. */
function xterm256(n: number): string {
  if (n < 16) return palette(n);
  if (n >= 232) { const g = 8 + (n - 232) * 10; return `rgb(${g},${g},${g})`; }
  const c = n - 16, v = (x: number) => (x ? 55 + x * 40 : 0);
  return `rgb(${v(Math.floor(c / 36))},${v(Math.floor(c / 6) % 6)},${v(c % 6)})`;
}

/** `codes` (the numbers of one ESC [ … m) applied to `s`. */
export function applySgr(s: Sgr, codes: string): Sgr {
  const n = codes === "" ? [0] : codes.split(";").map((x) => Number(x) || 0);
  let out: Sgr = { ...s };
  for (let i = 0; i < n.length; i++) {
    const c = n[i];
    if (c === 0) out = {};
    else if (c === 1) out.bold = true;
    else if (c === 2) out.dim = true;
    else if (c === 3) out.italic = true;
    else if (c === 4) out.underline = true;
    else if (c === 22) { out.bold = false; out.dim = false; }
    else if (c === 23) out.italic = false;
    else if (c === 24) out.underline = false;
    else if (c >= 30 && c <= 37) out.fg = palette(c - 30);
    else if (c >= 90 && c <= 97) out.fg = palette(c - 90 + 8);
    else if (c >= 40 && c <= 47) out.bg = palette(c - 40);
    else if (c >= 100 && c <= 107) out.bg = palette(c - 100 + 8);
    else if (c === 39) out.fg = undefined;
    else if (c === 49) out.bg = undefined;
    else if ((c === 38 || c === 48) && n[i + 1] === 5) { (c === 38 ? (out.fg = xterm256(n[i + 2] ?? 0)) : (out.bg = xterm256(n[i + 2] ?? 0))); i += 2; }
    else if ((c === 38 || c === 48) && n[i + 1] === 2) { const rgb = `rgb(${n[i + 2] ?? 0},${n[i + 3] ?? 0},${n[i + 4] ?? 0})`; c === 38 ? (out.fg = rgb) : (out.bg = rgb); i += 4; }
  }
  return out;
}

export function sgrStyle(s: Sgr): string {
  return [s.fg && `color:${s.fg}`, s.bg && `background:${s.bg}`, s.bold && "font-weight:700", s.dim && "opacity:.65",
    s.italic && "font-style:italic", s.underline && "text-decoration:underline"].filter(Boolean).join(";");
}

/** One line's codes and styled runs (offsets in the line), from the state it starts in → and the state it ends in. */
export function ansiLine(text: string, start: Sgr): { codes: [number, number][]; runs: [number, number, string][]; end: Sgr } {
  const codes: [number, number][] = [], runs: [number, number, string][] = [];
  let state = start, at = 0;
  const run = (to: number) => { const style = sgrStyle(state); if (style && to > at) runs.push([at, to, style]); };
  for (const m of text.matchAll(SGR)) {
    run(m.index);
    codes.push([m.index, m.index + m[0].length]);
    state = applySgr(state, m[1]);
    at = m.index + m[0].length;
  }
  run(text.length);
  return { codes, runs, end: state };
}

const hasAnsi = (doc: Text) => doc.sliceString(0, LOOK).includes("\x1b[");
const hidden = Decoration.replace({});
const marks = new Map<string, Decoration>();
const mark = (style: string) => marks.get(style) ?? (marks.set(style, Decoration.mark({ attributes: { style } })), marks.get(style)!);

function build(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const { state } = view, doc = state.doc;
  const editing = new Set(state.selection.ranges.map((r) => doc.lineAt(r.head).number));
  const last = view.visibleRanges.length ? doc.lineAt(view.visibleRanges[view.visibleRanges.length - 1].to).number : 0;
  const first = view.visibleRanges.length ? doc.lineAt(view.visibleRanges[0].from).number : 1;
  // the state a visible line starts in comes from the lines above it: carried from the top (logs reset often)
  let sgr: Sgr = {};
  for (let n = 1; n <= last; n++) {
    const line = doc.line(n);
    if (n < first) { if (line.text.includes("\x1b[")) sgr = ansiLine(line.text, sgr).end; continue; }
    const { codes, runs, end } = ansiLine(line.text, sgr);
    // ranges in order: runs and codes interleave, never overlap
    const all: [number, number, Decoration][] = [...runs.map(([f, t, s]): [number, number, Decoration] => [f, t, mark(s)]),
      ...(editing.has(n) ? [] : codes.map(([f, t]): [number, number, Decoration] => [f, t, hidden]))];
    all.sort((x, y) => x[0] - y[0]);
    for (const [f, t, d] of all) b.add(line.from + f, line.from + t, d);
    sgr = end;
  }
  return b.finish();
}

export function ansiColors() {
  return ViewPlugin.fromClass(class {
    on: boolean;
    decorations: DecorationSet;
    constructor(view: EditorView) { this.on = hasAnsi(view.state.doc); this.decorations = this.on ? build(view) : Decoration.none; }
    update(u: ViewUpdate) {
      if (u.docChanged) this.on = hasAnsi(u.state.doc);
      if (this.on && (u.docChanged || u.viewportChanged || u.selectionSet)) this.decorations = build(u.view);
      else if (!this.on) this.decorations = Decoration.none;
    }
  }, { decorations: (v) => v.decorations });
}
