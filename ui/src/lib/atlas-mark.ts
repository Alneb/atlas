// A PDF mark as a thing of its own (docs/design/DESIGN-pdf-notes.md, "The model"): every element a device writes into
// a PDF's companion drawing carries `customData.atlasMark`. The passage is anchored by its boxes in PDF points and its
// words (a W3C text-quote: the quote with a few words around it), never by one engine's text pieces, so any engine can
// find it again. Several elements share one id: a highlight's line boxes, an ink mark's strokes.

export type MarkKind = "highlight" | "comment" | "ink";
export type Device = "desktop" | "android";
/** A box in PDF points, page space (y up): x0, y0, x1, y1. */
export type Quad = [number, number, number, number];

export interface AtlasMark {
  id: string;
  kind: MarkKind;
  /** 1-based. */
  page: number;
  color: string;
  device: Device;
  /** ms since the epoch. */
  created: number;
  /** A highlight's boxes. */
  quads?: Quad[];
  /** A highlight's words, and those just before and after it. */
  quote?: TextQuote;
  /** A comment's highlight. */
  on?: string;
}
export interface TextQuote { exact: string; prefix: string; suffix: string }

/** `m-` + 8 base-36 characters; also the mark's block id in the PDF's note (`^m-…`). */
export function markId(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += Math.floor(Math.random() * 36).toString(36);
  return `m-${s}`;
}

/** A piece of a page's text as pdf.js's `getTextContent()` gives it (PDF user space, unscaled). */
export interface TextPiece { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }

const AROUND = 32;
const squash = (s: string) => s.replace(/\s+/g, " ");

/** The words under `quads` on a page whose text is `pieces`: the characters whose middle lies in a box, from the first
 *  to the last in reading order, and up to a few words around them. Sideways text is skipped (its boxes are not
 *  along x); a character's place is its piece's width shared evenly, which is close enough to pick whole words.
 *  Null when no character is under the boxes. */
export function quoteOf(pieces: readonly TextPiece[], quads: readonly Quad[]): TextQuote | null {
  let text = "", first = -1, last = -1;
  for (const p of pieces) {
    if (typeof p.str !== "string") continue; // a marked-content marker
    const [a, b, , , e, f] = p.transform;
    const start = text.length;
    text += p.str;
    if (Math.abs(b) <= Math.abs(a) && p.str.length) {
      const h = p.height || Math.abs(a), step = p.width / p.str.length;
      const lines = quads.filter((q) => overlap(f, f + h, q[1], q[3]) >= h / 2);
      for (let i = 0; i < p.str.length && lines.length; i++) {
        const x = e + step * (i + 0.5);
        if (lines.some((q) => x >= q[0] && x <= q[2]) && p.str[i].trim()) {
          if (first < 0) first = start + i;
          last = start + i;
        }
      }
    }
    if (p.hasEOL) text += " ";
  }
  if (first < 0) return null;
  const before = text.slice(Math.max(0, first - AROUND), first), after = text.slice(last + 1, last + 1 + AROUND);
  return {
    exact: squash(text.slice(first, last + 1)).trim(),
    // whole words only: a word cut at the window's edge is dropped
    prefix: squash(first > AROUND ? before.replace(/^\S*\s/, "") : before).trim(),
    suffix: squash(text.length - last - 1 > AROUND ? after.replace(/\s\S*$/, "") : after).trim(),
  };
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}
