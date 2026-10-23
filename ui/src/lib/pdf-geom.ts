// Geometry of a PDF page, for the reader (lib/pdf-reader.ts): PDFium gives places in page space (PDF points, y up,
// before the page's /Rotate); the reader shows the page turned by its /Rotate, in points with y down ("shown"
// space), scaled by CSS. The reader's own rotation turns the whole page box on top (`unturn`). Pure: no DOM.
import type { Box } from "./pdfium-worker";
import type { TextPiece } from "./atlas-mark";

/** A point of page space in shown space; `view` is the page's box, `rot` its /Rotate in quarter turns. */
export function toShown(view: Box, rot: number, x: number, y: number): [number, number] {
  const [x0, y0, x1, y1] = view;
  switch (rot & 3) {
    case 1: return [y - y0, x - x0];
    case 2: return [x1 - x, y - y0];
    case 3: return [y1 - y, x1 - x];
    default: return [x - x0, y1 - y];
  }
}

/** A point of shown space back in page space (the inverse of toShown). */
export function toPage(view: Box, rot: number, X: number, Y: number): [number, number] {
  const [x0, y0, x1, y1] = view;
  switch (rot & 3) {
    case 1: return [x0 + Y, y0 + X];
    case 2: return [x1 - X, y0 + Y];
    case 3: return [x1 - Y, y1 - X];
    default: return [x0 + X, y1 - Y];
  }
}

/** A page-space box in shown space, as x0, y0, x1, y1 with y down. */
export function boxShown(view: Box, rot: number, b: Box): Box {
  const [ax, ay] = toShown(view, rot, b[0], b[1]), [bx, by] = toShown(view, rot, b[2], b[3]);
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}

/** A point of the page as turned by the reader (`turns` quarter turns clockwise, the turned box `w`×`h`) in the
 *  unturned box's coordinates. */
export function unturn(turns: number, w: number, h: number, px: number, py: number): [number, number] {
  switch (turns & 3) {
    case 1: return [py, w - px];
    case 2: return [w - px, h - py];
    case 3: return [h - py, px];
    default: return [px, py];
  }
}

/** A page's characters as PDFium gives them (lib/pdfium-worker.ts PageLayers). */
export interface Chars { codes: Uint32Array; boxes: Float32Array; generated: Uint8Array }
const box = (c: Chars, i: number): Box => [c.boxes[i * 4], c.boxes[i * 4 + 1], c.boxes[i * 4 + 2], c.boxes[i * 4 + 3]];
const isBreak = (code: number) => code === 10 || code === 13;
const isSpace = (code: number) => code === 32 || code === 9 || code === 0xa0;

/** A run of characters on one line, drawn as one span of the text layer: characters `start`…`end` (exclusive), its
 *  text, `units[k]`: the character of the text's k-th string unit (a character past U+FFFF takes two), its box in page
 *  space, and whether a line ends after it. */
export interface Run { start: number; end: number; text: string; units: number[]; box: Box; eol: boolean }

const charOf = (code: number) => (code < 32 ? "\ufffd" : String.fromCodePoint(code));

/** The page's characters cut into runs: a new run at a line break, where the next character leaves the line (its
 *  middle outside the run's height, as on a new line or another column), or goes back to the left. */
export function runsOf(c: Chars): Run[] {
  const out: Run[] = [];
  let cur: Run | null = null;
  const close = (eol: boolean) => { if (cur) { cur.eol = eol; out.push(cur); cur = null; } };
  const add = (r: Run, ch: string, i: number) => { r.text += ch; for (let k = 0; k < ch.length; k++) r.units.push(i); r.end = i + 1; };
  for (let i = 0; i < c.codes.length; i++) {
    const code = c.codes[i];
    if (isBreak(code)) { close(true); continue; }
    const b = box(c, i);
    if (!(b[2] > b[0] && b[3] > b[1])) {
      // a space PDFium made up between words has no box of its own: it belongs to the run it sits in
      if (cur && isSpace(code)) add(cur, " ", i);
      continue;
    }
    if (cur) {
      const mid = (b[1] + b[3]) / 2, h = cur.box[3] - cur.box[1];
      if (mid < cur.box[1] || mid > cur.box[3] || b[0] < cur.box[0] - h / 2 || b[0] > cur.box[2] + 3 * h) close(false);
    }
    if (!cur) { cur = { start: i, end: i, text: "", units: [], box: b, eol: false }; add(cur, charOf(code), i); continue; }
    add(cur, charOf(code), i);
    cur.box = [Math.min(cur.box[0], b[0]), Math.min(cur.box[1], b[1]), Math.max(cur.box[2], b[2]), Math.max(cur.box[3], b[3])];
  }
  close(true);
  return out;
}

/** The character at string offset `off` of a run's text (its end past the last). */
export const charAt = (r: Run, off: number): number => (off >= r.units.length ? r.end : r.units[Math.max(0, off)]);

/** The text of characters `from`…`to` (exclusive): line breaks as spaces, spaces squashed. */
export function textOf(c: Chars, from: number, to: number): string {
  let s = "";
  for (let i = Math.max(0, from); i < Math.min(to, c.codes.length); i++) {
    const code = c.codes[i];
    s += isBreak(code) ? " " : charOf(code);
  }
  return s.replace(/\s+/g, " ").trim();
}

/** The boxes of characters `from`…`to` (exclusive), one per run of the line they sit on (a highlight's quads). */
export function lineBoxes(c: Chars, runs: readonly Run[], from: number, to: number): Box[] {
  const out: Box[] = [];
  for (const r of runs) {
    const a = Math.max(from, r.start), b = Math.min(to, r.end);
    let u: Box | null = null;
    for (let i = a; i < b; i++) {
      const x = box(c, i);
      if (!(x[2] > x[0] && x[3] > x[1])) continue;
      u = u ? [Math.min(u[0], x[0]), Math.min(u[1], x[1]), Math.max(u[2], x[2]), Math.max(u[3], x[3])] : x;
    }
    if (u) out.push(u);
  }
  return out;
}

/** The characters as text pieces (lib/atlas-mark.ts quoteOf), one a character. */
export function piecesOf(c: Chars): TextPiece[] {
  const out: TextPiece[] = [];
  for (let i = 0; i < c.codes.length; i++) {
    const [x0, y0, x1, y1] = box(c, i), code = c.codes[i];
    out.push({ str: isBreak(code) ? "" : charOf(code),
      transform: [y1 - y0, 0, 0, y1 - y0, x0, y0], width: x1 - x0, height: y1 - y0, hasEOL: isBreak(code) });
  }
  return out;
}

/** Where `words` (case- and whitespace-insensitive) first lie in the characters: [from, to), or null. A word broken
 *  across lines by a hyphen is found too. */
export function findWords(c: Chars, words: string): [number, number] | null {
  const want = words.replace(/\s+/g, "").toLowerCase();
  if (!want) return null;
  const search = (skip: (code: number) => boolean): [number, number] | null => {
    let flat = "";
    const at: number[] = [];
    for (let i = 0; i < c.codes.length; i++) {
      const code = c.codes[i];
      if (skip(code)) continue;
      const ch = charOf(code).toLowerCase();
      flat += ch;
      for (let k = 0; k < ch.length; k++) at.push(i);
    }
    const k = flat.indexOf(want);
    return k < 0 ? null : [at[k], at[k + want.length - 1] + 1];
  };
  const blank = (code: number) => isBreak(code) || isSpace(code);
  return search(blank) ?? (want.includes("-") ? null : search((code) => blank(code) || code === 45 || code === 2));
}
