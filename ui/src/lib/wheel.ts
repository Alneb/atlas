// A wheel event's vertical move in pixels, whatever unit it came in: a touchpad and most mice send pixels, but a
// wheel that reports lines (deltaMode 1: deltaY ≈ 3 a notch) or pages (2) zoomed a picture by under a percent a notch
// when read as pixels — Ctrl+wheel seemed to do nothing, then jumped on a touchpad.
const LINE = 40, PAGE = 800;

export function wheelPixels(e: WheelEvent): number {
  return e.deltaMode === 1 ? e.deltaY * LINE : e.deltaMode === 2 ? e.deltaY * PAGE : e.deltaY;
}
