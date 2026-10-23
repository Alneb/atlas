// The drawing as a notepad on a pen tablet (the Boox): the pen draws, fingers move the page — one
// pans, two pinch-zoom and pan together, a two-finger tap undoes, a three-finger tap redoes (the Boox notes app's
// gestures). Excalidraw's own touch handling is kept away from fingers here: its pinch only works on the canvas with
// no tool in the way, and in pen mode a finger falls through to the tool. Pure scene arithmetic is exported for tests.

/** What a notepad toolbar picks; Excalidraw's own tool names behind them. */
export type NoteTool = "pen" | "eraser" | "select" | "hand" | "text" | "rectangle" | "ellipse" | "arrow" | "line" | "image";
export const TOOL: Record<NoteTool, string> = {
  pen: "freedraw", eraser: "eraser", select: "selection", hand: "hand",
  // the notepad's "More" (NotepadBar): Excalidraw's own tools, picked without its whole interface
  text: "text", rectangle: "rectangle", ellipse: "ellipse", arrow: "arrow", line: "line", image: "image",
};
/** Pen widths (Excalidraw's strokeWidth: a fountain is ~7 × that across at zoom 1 and a Boox pen's usual 0.9, the others 6 × (draw-ink.ts outline); Excalidraw's own thinnest choice is 1). */
export const WIDTHS = [{ name: "Fine", width: 0.5 }, { name: "Medium", width: 1 }, { name: "Bold", width: 2 }] as const;

export interface View { scrollX: number; scrollY: number; zoom: number }
export interface Pt { x: number; y: number }

const MIN_ZOOM = 0.1, MAX_ZOOM = 30;

/** The view after fingers moved from `a` to `b` (one or two points each, relative to the canvas): the scene point
 *  under the fingers' middle at the start stays under their middle now, at the zoom their spread gives. */
export function moved(v: View, a: Pt[], b: Pt[]): View {
  const mid = (p: Pt[]): Pt => (p.length > 1 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : p[0]);
  const spread = (p: Pt[]) => (p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0);
  const s0 = spread(a), s1 = spread(b);
  const zoom = s0 > 0 && s1 > 0 ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (v.zoom * s1) / s0)) : v.zoom;
  const m0 = mid(a), m1 = mid(b);
  // Excalidraw: viewport = (scene + scroll) × zoom → scene under m0 = m0 / zoom − scroll, kept under m1
  return { zoom, scrollX: m1.x / zoom - (m0.x / v.zoom - v.scrollX), scrollY: m1.y / zoom - (m0.y / v.zoom - v.scrollY) };
}

/** A tap: fingers down and up again quickly without moving the page. */
const TAP_MS = 300, TAP_SLOP = 12;
/** Palm rejection: a hand resting while the pen writes moved the page under the
 *  stroke, and a palm's brief two contacts were a two-finger tap — undo, the last stroke gone. Touches are ignored while
 *  the pen is down and for PEN_GRACE ms after it lifts, and any contact wider than PALM CSS px is a palm. */
const PEN_GRACE = 700, PALM = 28;

export interface Fingers { view(): View | null; setView(v: View): void; undo(): void; redo(): void }

/** Fingers on `host` move the page (see top); the pen is never touched. Returns the remover. */
export function fingerGestures(host: HTMLElement, f: Fingers): () => void {
  const down = new Map<number, Pt>(), now = new Map<number, Pt>();
  let start: View | null = null, most = 0, began = 0, travelled = 0, frame = 0, penDown = false, penAt = -Infinity, cancelled = false;
  const rel = (e: PointerEvent): Pt => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const pts = (m: Map<number, Pt>) => [...m.values()].slice(0, 2);
  const restart = () => { // a finger came or went: the gesture continues from here
    for (const [id, p] of now) down.set(id, p);
    start = f.view();
  };
  const apply = () => { frame = 0; if (start && now.size) f.setView(moved(start, pts(down), pts(now))); };
  // on the drawing itself: a finger on one of Excalidraw's buttons still presses it
  const own = (e: PointerEvent) => e.pointerType === "touch" && e.target instanceof HTMLCanvasElement && host.contains(e.target);
  const stop = (e: PointerEvent) => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); };

  const writing = () => penDown || performance.now() - penAt < PEN_GRACE;
  const palm = (e: PointerEvent) => e.width > PALM || e.height > PALM;
  const onPen = (e: PointerEvent) => {
    if (e.pointerType !== "pen") return;
    penDown = e.type === "pointerdown";
    penAt = performance.now();
    if (penDown && now.size) { cancelled = true; if (frame) cancelAnimationFrame(frame); frame = 0; } // the pen wins: no pan, no tap
  };
  const onDown = (e: PointerEvent) => {
    onPen(e);
    if (!own(e)) return;
    stop(e);
    if (writing() || palm(e)) return; // resting hand: kept from Excalidraw, moves nothing
    if (!now.size) cancelled = false;
    if (!now.size) { most = 0; began = performance.now(); travelled = 0; }
    now.set(e.pointerId, rel(e)); most = Math.max(most, now.size);
    restart();
  };
  const onMove = (e: PointerEvent) => {
    if (!now.has(e.pointerId)) return;
    stop(e);
    if (cancelled || writing()) return;
    const p = rel(e), was = now.get(e.pointerId)!;
    travelled += Math.hypot(p.x - was.x, p.y - was.y);
    now.set(e.pointerId, p);
    if (!frame) frame = requestAnimationFrame(apply); // one view change a frame: an e-ink panel redraws each
  };
  const onUp = (e: PointerEvent) => {
    onPen(e);
    if (!now.has(e.pointerId)) return;
    stop(e);
    now.delete(e.pointerId); down.delete(e.pointerId);
    if (now.size) { restart(); return; }
    if (cancelled || writing()) return;
    if (performance.now() - began < TAP_MS && travelled < TAP_SLOP * most) { if (most === 2) f.undo(); else if (most === 3) f.redo(); }
  };
  const opts = { capture: true, passive: false };
  const pairs = [["pointerdown", onDown], ["pointermove", onMove], ["pointerup", onUp], ["pointercancel", onUp]] as const;
  for (const [t, h] of pairs) window.addEventListener(t, h as EventListener, opts);
  // the browser's own touch scrolling and zoom stay out of the drawing
  const touch = (e: TouchEvent) => { if (e.target instanceof HTMLCanvasElement && host.contains(e.target) && e.cancelable) e.preventDefault(); };
  host.addEventListener("touchmove", touch, { passive: false });
  return () => {
    for (const [t, h] of pairs) window.removeEventListener(t, h as EventListener, opts);
    host.removeEventListener("touchmove", touch);
    cancelAnimationFrame(frame);
  };
}

/** Pens as the Boox notes app has them: a ballpoint keeps one width, a fountain pen follows the pressure, a
 *  highlighter is wide and see-through (grey on e-ink). Excalidraw has one freedraw: these are its settings. */
export type PenKind = "ballpoint" | "fountain" | "highlighter";
/** `onyxStyle`: the Boox's quick line under the pen drawn alike (OnyxInk: 0 pencil, one width; 1 brush, pressure; 2 marker). */
export const PENS: Record<PenKind, { label: string; pressure: boolean; opacity: number; widthTimes: number; onyxStyle: number }> = {
  ballpoint: { label: "Ballpoint", pressure: false, opacity: 100, widthTimes: 1, onyxStyle: 0 },
  fountain: { label: "Fountain pen", pressure: true, opacity: 100, widthTimes: 1, onyxStyle: 1 },
  highlighter: { label: "Highlighter", pressure: false, opacity: 35, widthTimes: 8, onyxStyle: 2 },
};

/** The paper under the ink (Boox templates, Rnote backgrounds), drawn by the page behind a see-through scene. */
export type Paper = "blank" | "lines" | "grid" | "dots" | "fine" | "graph" | "staff";
export const PAPERS: Paper[] = ["blank", "lines", "grid", "dots", "fine", "graph", "staff"];
const RULE = 32; // scene units between lines (a college-ruled line at zoom 1)
// the Notepad's (Page.java): fine / graph squares, graph's heavy line every 5, music staves (5 lines, a staff every 3 rules)
const FINE = RULE / 2, MAJOR = FINE * 5, STAFF_GAP = RULE / 4, STAFF_PERIOD = RULE * 3;

/** CSS background for `paper` at view `v`: it moves and scales with the scene. The Boox Notepad's ruling (Page.java
 *  drawPaper), so a page looks the same on both: lines on the multiples of the step from the scene's origin, centred
 *  there, max(1 scene unit, 2 device px) wide, graph's every fifth line 2.2 × that; dots on the crossings (were half a
 *  square off: a radial gradient centres in its tile). `dpr`: device px per CSS px. */
export function paperCss(paper: Paper, v: View, dpr = 1): { backgroundImage: string; backgroundSize: string; backgroundPosition: string } {
  const z = v.zoom, line = "var(--paper-line, #b4b4b4)", w = Math.max(z, 2 / dpr);
  // a tile's line lies on its first w px (its dot in its middle): shifted so it is centred on the scene's multiple
  const at = (step: number, shift: number) => `${(v.scrollX * z - shift) % step}px ${(v.scrollY * z - shift) % step}px`;
  const lines = (step: number, lw: number) => `linear-gradient(to bottom, ${line} ${lw}px, transparent ${lw}px), linear-gradient(to right, ${line} ${lw}px, transparent ${lw}px)`;
  if (paper === "fine" || paper === "graph") {
    const fine = FINE * z, major = MAJOR * z;
    const layers: [string, number, number][] = paper === "fine" ? [[lines(fine, w), fine, w]] : [[lines(major, w * 2.2), major, w * 2.2], [lines(fine, w), fine, w]];
    return {
      backgroundImage: layers.map(([img]) => img).join(", "),
      backgroundSize: layers.map(([, s]) => `${s}px ${s}px, ${s}px ${s}px`).join(", "),
      backgroundPosition: layers.map(([, s, lw]) => `${at(s, lw / 2)}, ${at(s, lw / 2)}`).join(", "),
    };
  }
  if (paper === "staff") {
    const period = STAFF_PERIOD * z, stops: string[] = [];
    for (let l = 0; l < 5; l++) { const y = (RULE + l * STAFF_GAP) * z; stops.push(`transparent ${y}px`, `${line} ${y}px`, `${line} ${y + w}px`, `transparent ${y + w}px`); }
    return { backgroundImage: `linear-gradient(to bottom, ${stops.join(", ")})`, backgroundSize: `100% ${period}px`, backgroundPosition: at(period, w / 2) };
  }
  const step = RULE * z, r = Math.max(1.2 * z, 2.4 / dpr);
  const image = {
    blank: "none",
    lines: `linear-gradient(to bottom, ${line} ${w}px, transparent ${w}px)`,
    grid: lines(step, w),
    dots: `radial-gradient(circle, ${line} ${r}px, transparent ${r + 0.5}px)`,
  }[paper];
  const pos = paper === "dots" ? at(step, step / 2) : at(step, w / 2);
  return { backgroundImage: image, backgroundSize: `${step}px ${step}px`, backgroundPosition: paper === "grid" ? `${pos}, ${pos}` : pos };
}

/** This device's last choices (pen, paper): a convenience, so anything going wrong here only forgets them. */
export function remembered<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try { const v = localStorage.getItem(`atlas.draw.${key}`) as T | null; return v && allowed.includes(v) ? v : fallback; } catch { return fallback; }
}
export function remember(key: string, v: string): void { try { localStorage.setItem(`atlas.draw.${key}`, v); } catch { /* private window */ } }
