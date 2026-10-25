// Changing a saved PDF mark (lib/pdf-marks.ts): moved, reworded, recoloured, and the `#tags` of its words. Pure, so the
// select tool's bar (components/PdfMarkBar.svelte) and the tests share it.
import type { Mark } from "./gen/Mark";

type MarkKind = Mark["kind"];

/** The `#tags` in a mark's text. */
export const tagsIn = (text: string): string[] => [...new Set([...text.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((m) => m[1]))];

/** The kinds a drag moves: what sits at a place of its own, not on the text or drawn by hand. */
export const MOVABLE: ReadonlySet<MarkKind> = new Set(["text-box", "postit", "stamp", "clip"]);
/** The kinds whose words can be changed: a text box's and a post-it's text, a clip's title. */
export const WORDED: ReadonlySet<MarkKind> = new Set(["text-box", "postit", "clip"]);

/** `m` moved by (dx, dy) page points; a kind that does not move comes back as it was. */
export function movedBy(m: Mark, dx: number, dy: number): Mark {
  const r = (b: [number, number, number, number]): [number, number, number, number] => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy];
  switch (m.kind) {
    case "text-box": case "clip": return { ...m, rect: r(m.rect) };
    case "postit": case "stamp": return { ...m, at: [m.at[0] + dx, m.at[1] + dy] };
    default: return m;
  }
}

/** `m` with new words: a text box's or post-it's text (its `#tags` read again), a clip's title. */
export function reworded(m: Mark, text: string): Mark {
  switch (m.kind) {
    case "text-box": case "postit": return { ...m, text, tags: tagsIn(text) };
    case "clip": return { ...m, title: text };
    default: return m;
  }
}

/** `m` in another colour; a pen mark's strokes lose their own, so they all take it. */
export function recoloured(m: Mark, color: string): Mark {
  return m.kind === "ink" ? { ...m, color, strokes: m.strokes.map(({ color: _, ...s }) => s) } : { ...m, color };
}

/** A mark's words, as `reworded` takes them. */
export const wordsOf = (m: Mark): string => m.kind === "text-box" || m.kind === "postit" ? m.text : m.kind === "clip" ? m.title ?? "" : "";
