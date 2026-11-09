// A picture held under the finger (touch.ts): shown alone over everything, fit to the screen. Two fingers zoom around
// their middle, one finger pans a zoomed picture, a double tap goes fit ⇄ 2.5×, a tap that moved nothing closes it, as
// do Back (back.ts) and Escape. The desktop's own viewer is the Image pane; this is for a picture inside a note.
import { closable } from "./back";

const MAX = 8;

export function showImage(src: string, alt = ""): void {
  if (!src || document.querySelector(".image-viewer")) return;
  const box = document.createElement("div");
  box.className = "image-viewer";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", alt ? `Picture: ${alt}` : "Picture");
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.draggable = false;
  box.append(img);

  let v = { s: 1, x: 0, y: 0 }; // scale and offset over the fitted picture, from the screen's middle
  const paint = () => { img.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`; };
  const clamp = () => {
    if (v.s <= 1) { v = { s: 1, x: 0, y: 0 }; return; }
    const r = img.getBoundingClientRect(), w = r.width / v.s, h = r.height / v.s; // the fitted size
    const mx = Math.max(0, (w * v.s - innerWidth) / 2), my = Math.max(0, (h * v.s - innerHeight) / 2);
    v.x = Math.min(mx, Math.max(-mx, v.x));
    v.y = Math.min(my, Math.max(-my, v.y));
  };
  /** Zoom to `s` keeping the point at (px, py) on screen where it is. */
  const zoomAt = (s: number, px: number, py: number) => {
    const to = Math.min(MAX, Math.max(1, s)), k = to / v.s, cx = px - innerWidth / 2, cy = py - innerHeight / 2;
    v = { s: to, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    clamp();
    paint();
  };

  const pts = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; s: number } | null = null;
  let tap: { x: number; y: number; t: number } | null = null;
  let lastTap = 0;
  const gap = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

  box.addEventListener("pointerdown", (e) => {
    try { box.setPointerCapture(e.pointerId); } catch { /* a pointer already gone */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { pinch = { d: gap(), s: v.s }; tap = null; }
    else tap = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  box.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && pts.size === 2) { const m = mid(); zoomAt((pinch.s * gap()) / pinch.d, m.x, m.y); return; }
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap = null;
    if (v.s > 1) { v.x += dx; v.y += dy; clamp(); paint(); }
  });
  const up = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!tap || pts.size) return;
    const t = tap; tap = null;
    if (Date.now() - t.t > 400) return; // a hold, not a tap
    if (Date.now() - lastTap < 300) { lastTap = 0; clearTimeout(closing); zoomAt(v.s > 1 ? 1 : 2.5, t.x, t.y); return; }
    lastTap = Date.now();
    closing = setTimeout(close, 300); // unless a second tap makes it a double tap
  };
  let closing: ReturnType<typeof setTimeout> | undefined;
  box.addEventListener("pointerup", up);
  box.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); pinch = null; tap = null; });
  box.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(v.s * Math.exp(-e.deltaY / 300), e.clientX, e.clientY); }, { passive: false });
  box.addEventListener("contextmenu", (e) => e.preventDefault());
  const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  addEventListener("keydown", key, true);

  let unregister = () => {};
  function close(): void {
    clearTimeout(closing);
    unregister();
    removeEventListener("keydown", key, true);
    box.remove();
  }
  unregister = closable(close);
  document.body.append(box);
}
