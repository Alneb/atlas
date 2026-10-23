// A held stroke snapped to a shape in the web drawing, as Notepad does it: the pen held still at a stroke's
// end asks the core's recogniser (POST /api/pen/shape → atlas-pen, the phone's own) and its answer becomes
// Excalidraw elements the way Notepad's Figure.snapped makes them. Pure functions here; draw-excalidraw.ts calls them.

/** A sample in scene units with its time (ms since the stroke began). */
export type TimedPoint = { x: number; y: number; t: number };

/** Boox Notes' gesture: the pen held still this long at the end of a stroke asks for a shape. */
export const HOLD_MS = 650;
/** …moving less than this (scene units at zoom 1 ≈ CSS px). */
const HOLD_PX = 4;
/** A stroke smaller than this (its box's larger side) is writing, not a shape (Notepad's SNAP_MIN_DP). */
export const SNAP_MIN = 40;

/** Whether the stroke ended with the pen held still for `HOLD_MS`. `zoom`: the drawing's, so the stillness is on screen. */
export function heldAtEnd(pts: readonly TimedPoint[], zoom = 1): boolean {
  if (pts.length < 6) return false;
  const end = pts[pts.length - 1];
  let since = end.t;
  for (let i = pts.length - 1; i >= 0; i--) {
    if (Math.hypot(pts[i].x - end.x, pts[i].y - end.y) * zoom > HOLD_PX) break;
    since = pts[i].t;
  }
  return end.t - since >= HOLD_MS;
}

/** The stroke's box's larger side. */
export function extent(pts: readonly TimedPoint[]): number {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** A shape's element without the drawing's own fields (id, colour, width, frame…: draw-excalidraw.ts adds them). */
export type Skeleton = {
  type: "line" | "arrow" | "rectangle" | "ellipse"; x: number; y: number; width: number; height: number; angle: number;
  points?: [number, number][]; startArrowhead?: "arrow" | null; endArrowhead?: "arrow" | null;
};

/** The recogniser's wire (atlas-pen shape.rs: 1 line, 2 rectangle, 3 ellipse, 4 triangle, 5 path) as an element, or
 *  null for `[0]` / an answer it cannot read. Notepad's Figure.snapped, the same shapes. */
export function wireToSkeleton(s: readonly number[]): Skeleton | null {
  const box = (pts: [number, number][]) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  };
  switch (s[0]) {
    case 1: {
      const points: [number, number][] = [[0, 0], [s[3] - s[1], s[4] - s[2]]];
      return { type: "line", x: s[1], y: s[2], angle: 0, points, ...box(points) };
    }
    case 2:
    case 3:
      return { type: s[0] === 2 ? "rectangle" : "ellipse", x: s[1] - s[3] / 2, y: s[2] - s[4] / 2, width: s[3], height: s[4], angle: s[5] ?? 0 };
    case 4: {
      const points: [number, number][] = [[0, 0], [s[3] - s[1], s[4] - s[2]], [s[5] - s[1], s[6] - s[2]], [0, 0]];
      return { type: "line", x: s[1], y: s[2], angle: 0, points, ...box(points) };
    }
    case 5: {
      const closed = s[1] !== 0, n = s[4];
      if (!(n >= 2) || s.length < 5 + 2 * n) return null;
      const points: [number, number][] = [];
      for (let i = 0; i < n; i++) points.push([s[5 + 2 * i] - s[5], s[6 + 2 * i] - s[6]]);
      if (closed) points.push([0, 0]);
      const heads = s[2] !== 0 || s[3] !== 0;
      return { type: heads ? "arrow" : "line", x: s[5], y: s[6], angle: 0, points, ...box(points), startArrowhead: s[2] !== 0 ? "arrow" : null, endArrowhead: s[3] !== 0 ? "arrow" : null };
    }
    default:
      return null;
  }
}
