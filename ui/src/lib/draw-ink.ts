// How the notepad's pen strokes are outlined (vite.config.ts `inkStroke` makes Excalidraw ask here): crisp, like Boox
// Notes — the shape of the letters kept, the width close to the Boox's quick line — instead of Excalidraw's rounded
// marker. A stroke carries its pen in `customData.atlasPen` (draw-excalidraw.ts); strokes without it keep Excalidraw's
// look, and so does every stroke in an Excalidraw without this rewrite (Obsidian's plugin: the same points, softer).
import type { PenKind } from "./draw-notepad";

/** perfect-freehand's settings per pen: `thinning` how much pressure narrows the line, `smoothing` / `streamline` how
 *  much the outline and the path are evened out (Excalidraw: .6 / .5 / .5). */
export const INK: Record<PenKind, { thinning: number; smoothing: number; streamline: number }> = {
  // .6 as Excalidraw's own: at .35 a soft stroke was 1/1.5 of a firm one — "excalidraw could not see the difference between
  // thin and think pressure on the boox"; now ≈ 1/2 (Stroke.java `outline` the same)
  fountain: { thinning: 0.6, smoothing: 0.25, streamline: 0.12 },
  ballpoint: { thinning: 0, smoothing: 0.25, streamline: 0.12 },
  highlighter: { thinning: 0, smoothing: 0.5, streamline: 0.4 },
};

/** How many strokeWidths across a pen's freedraw is at pressure p (perfect-freehand: size 4.25 × strokeWidth, a radius;
 *  sine easing; the pen's thinning) — Stroke.java `outline` saves the Boox's strokes with the same. */
export function outline(kind: PenKind, p: number): number {
  return 2 * 4.25 * Math.sin((Math.PI / 2) * (0.5 - INK[kind].thinning * (0.5 - p)));
}

const isPen = (k: unknown): k is PenKind => typeof k === "string" && k in INK;

(globalThis as unknown as { __atlasInk: (el: { customData?: { atlasPen?: unknown } }) => (typeof INK)[PenKind] | undefined }).__atlasInk = (el) => {
  const k = el.customData?.atlasPen;
  return isPen(k) ? INK[k] : undefined;
};
