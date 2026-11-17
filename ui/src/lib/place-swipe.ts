// The phone app's places (Home, Library, Files, Search, Settings: its bottom bar) swiped between from their pages:
// a quick sideways fling that began on nothing that scrolls or edits sideways asks the app for the place beside
// (AtlasNative.swipe; AtlasActivity.stepPlace, which ignores it on an open file). A table, a carousel, a text field or
// a selection keep their own sideways gestures. Pure but for `attachPlaceSwipe`: tested with stand-ins for elements.

/** What `sideways` reads of an element: enough to stand in for one in a test. */
export interface Box {
  parentElement: Box | null;
  scrollWidth: number;
  clientWidth: number;
  isContentEditable?: boolean;
  tagName: string;
}

/** Whether a touch beginning on `el` belongs to it or an ancestor: a field, editable text, a slider, or a box that
 *  scrolls sideways (wider inside than shown, and allowed to scroll: `overflowX(el)` auto or scroll). */
export function sideways(el: Box | null, overflowX: (b: Box) => string): boolean {
  for (let b = el; b; b = b.parentElement) {
    if (b.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(b.tagName)) return true;
    if (b.scrollWidth > b.clientWidth + 1 && /auto|scroll/.test(overflowX(b))) return true;
  }
  return false;
}

/** The longest a fling lasts and the shortest way it goes (CSS px), and how much more sideways than up or down. */
export const FLING_MS = 600, FLING_PX = 64, FLING_RATIO = 2;

/** A touch from (x0, y0) to (x1, y1) in `ms`: 1 a fling to the left (the next place), -1 to the right, 0 none. */
export function flingOf(x0: number, y0: number, x1: number, y1: number, ms: number): -1 | 0 | 1 {
  const dx = x1 - x0, dy = y1 - y0;
  if (ms > FLING_MS || Math.abs(dx) < FLING_PX || Math.abs(dx) < FLING_RATIO * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** Listens on `doc` for one-finger flings and hands them to `step` (the bridge's swipe); returns the detach. A touch
 *  that began on something sideways, ended with text selected, or had a second finger is not one. */
export function attachPlaceSwipe(doc: Document, step: (by: 1 | -1) => void): () => void {
  let start: { x: number; y: number; t: number } | null = null;
  const down = (e: TouchEvent) => {
    const t = e.touches[0];
    const el = e.target instanceof Element ? (e.target as unknown as Box) : null;
    start = e.touches.length === 1 && !sideways(el, (b) => getComputedStyle(b as unknown as Element).overflowX) ? { x: t.clientX, y: t.clientY, t: e.timeStamp } : null;
  };
  const more = (e: TouchEvent) => { if (e.touches.length > 1) start = null; };
  const up = (e: TouchEvent) => {
    const s = start, t = e.changedTouches[0];
    start = null;
    if (!s || !t || (doc.getSelection()?.toString() ?? "") !== "") return;
    const by = flingOf(s.x, s.y, t.clientX, t.clientY, e.timeStamp - s.t);
    if (by) step(by);
  };
  doc.addEventListener("touchstart", down, { passive: true });
  doc.addEventListener("touchmove", more, { passive: true });
  doc.addEventListener("touchend", up, { passive: true });
  return () => {
    doc.removeEventListener("touchstart", down);
    doc.removeEventListener("touchmove", more);
    doc.removeEventListener("touchend", up);
  };
}
