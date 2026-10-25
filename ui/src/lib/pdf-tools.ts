// Atlas's own marking tools over the PDFium reader (docs/refactor/REFACTOR-pdfium-reader.md): highlight, underline or
// strike the selected text, write with the pen (pressure, tilt and time kept), put a text box or a post-it (on a
// highlight when put over one), clip an area, stamp, bookmark the page. Each mark is saved as it is made
// into the PDF's note (lib/pdf-marks.ts, core pdf_marks.rs), which every device writes; the PDF itself is never
// touched. With the select tool a click picks a saved mark (the pane's bar recolours, rewords or deletes it) and a drag
// moves one that sits on its own (a text box, post-it, stamp, clip). Undo takes this pane's last change back.
import { quoteOf } from "./atlas-mark";
import { encodeSamples, markAt, MOVABLE, movedBy, newMark, tagsIn, type Mark, type MarksView, type Op, type Sample, type Stamp } from "./pdf-marks";
import type { Reader } from "./pdf-reader";

export type TextMark = "highlight" | "underline" | "strike";
export type ToolName = "select" | TextMark | "ink" | "text" | "postit" | "clip" | "stamp";
const TEXT_MARKS: readonly ToolName[] = ["highlight", "underline", "strike"];
/** Calm, readable mark colours. */
export const COLORS = { yellow: "#FFE066", green: "#8CE99A", blue: "#74C0FC", pink: "#FAA2C1", red: "#FF8787" } as const;
/** The pen waits this long after a stroke for the next one before saving them as one mark. */
const PEN_REST_MS = 1200;
const NOTE_PT = 10;

export interface Tools {
  setTool(t: ToolName): void;
  setColor(hex: string): void;
  setThickness(pt: number): void;
  setStamp(s: Stamp): void;
  /** Marks the selected text, whatever the tool; whether there was any. */
  markSelection(kind: TextMark): Promise<boolean>;
  /** Bookmarks page n, or takes its bookmark away; whether it has one now. */
  toggleBookmark(n: number): Promise<boolean>;
  /** Saves a changed saved mark (recoloured, reworded, moved); undo puts the old one back. */
  edit(next: Mark): Promise<void>;
  /** Takes a saved mark out; undo puts it back. */
  remove(id: string): Promise<void>;
  /** Picks a saved mark (null: none), as a click with the select tool does. */
  select(id: string | null): void;
  undo(): Promise<boolean>;
  /** Saves what the pen holds and stops. */
  destroy(): Promise<void>;
}
export interface ToolEvents { saved(ids: string[]): void; failed(e: unknown): void; /** the picked mark, or null */ selected?(m: Mark | null): void }

const SVG = "http://www.w3.org/2000/svg";

/** A stroke as drawn: shown points, and per point its pressure, tilt (-1…1 from the pen's degrees) and ms since start. */
interface Stroke { points: number[]; pressures: number[]; tilts: number[]; times: number[]; t0: number; el: SVGPolylineElement }

export function attachTools(container: HTMLElement, reader: Reader, store: MarksView, on: ToolEvents): Tools {
  let tool: ToolName = "select", color: string = COLORS.yellow, thickness = 2, stamp: Stamp = "check";
  // each change's way back (new marks removed, changed ones put back as they were), for undo
  const done: Op[][] = [];
  // one save at a time, in the order made
  let chain: Promise<unknown> = Promise.resolve();
  const apply = (ops: Op[], back: Op[], ids: string[]) => {
    const run = chain.then(() => store.change(ops)).then(() => { done.push(back); on.saved(ids); }).catch(on.failed);
    chain = run;
    return run;
  };
  const save = (marks: Mark[]) => !marks.length ? Promise.resolve()
    : apply(marks.map((mark) => ({ op: "put" as const, mark })), marks.map((m) => ({ op: "remove" as const, id: m.id })), marks.map((m) => m.id));
  const was = (id: string) => store.marks().find((m) => m.id === id && m.kind !== "deleted");
  const edit = (next: Mark) => { const old = was(next.id); return old ? apply([{ op: "put", mark: next }], [{ op: "put", mark: old }], [next.id]) : Promise.resolve(); };
  const remove = (id: string) => { const old = was(id); return old ? apply([{ op: "remove", id }], [{ op: "put", mark: old }], [id]) : Promise.resolve(); };

  // ── the select tool: picking and moving saved marks ──────────────────────────────────────────────────────────
  let picked: string | null = null;
  const pickedStyle = document.createElement("style"); // follows the marks' redraws, which replace their elements
  container.append(pickedStyle);
  function select(id: string | null): void {
    picked = id;
    pickedStyle.textContent = id ? `.atlas-marks [data-mark="${id}"] { filter: drop-shadow(0 0 1px var(--accent)) drop-shadow(0 0 3px var(--accent)); }` : "";
    on.selected?.(id ? was(id) ?? null : null);
  }
  /** The movable mark drawn under a client point, topmost first (found from what is drawn: no wait, so the press can
   *  still be kept from starting a text selection). A clip is taken by its edge, so the text inside stays selectable. */
  function movableAt(x: number, y: number): SVGGElement | null {
    const gs = [...container.querySelectorAll<SVGGElement>("svg.atlas-marks > g[data-mark]")].reverse();
    return gs.find((g) => {
      if (!MOVABLE.has(g.dataset.kind as Mark["kind"])) return false;
      const b = g.getBoundingClientRect(), pad = 4, inside = x >= b.left - pad && x <= b.right + pad && y >= b.top - pad && y <= b.bottom + pad;
      return inside && (g.dataset.kind !== "clip" || Math.min(x - b.left, b.right - x, y - b.top, b.bottom - y) < 6);
    }) ?? null;
  }
  let pressed: { id: string; n: number; pointer: number; X: number; Y: number; dX: number; dY: number; g: SVGGElement | null; cx: number; cy: number } | null = null;
  function selectDown(e: PointerEvent): void {
    if (e.button !== 0 || e.pointerType === "touch" || (e.target as Element).closest("textarea, button, input")) return;
    const at = reader.pageAt(e.clientX, e.clientY);
    if (!at) return;
    const g = movableAt(e.clientX, e.clientY);
    pressed = { id: g?.dataset.mark ?? "", n: at.n, pointer: e.pointerId, X: at.X, Y: at.Y, dX: 0, dY: 0, g, cx: e.clientX, cy: e.clientY };
    if (!g) return; // a click on the text (or a highlight) picks on release, once it is clear no words were selected
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur(); // the pane's keys (Delete, Esc) come to it with nothing focused
    container.setPointerCapture(e.pointerId);
  }
  function selectMove(e: PointerEvent): void {
    const p = pressed, at = p?.g && reader.pageAt(e.clientX, e.clientY);
    if (!p || !at || at.n !== p.n || e.pointerId !== p.pointer) return;
    p.dX = at.X - p.X; p.dY = at.Y - p.Y;
    p.g!.setAttribute("transform", `translate(${p.dX} ${p.dY})`);
  }
  async function selectUp(e: PointerEvent): Promise<void> {
    const p = pressed;
    if (!p || e.pointerId !== p.pointer) return;
    pressed = null;
    if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    if (p.g && Math.hypot(p.dX, p.dY) > 1.5) {
      const m = was(p.id);
      const [x0, y0] = await reader.toPagePoint(p.n, p.X, p.Y), [x1, y1] = await reader.toPagePoint(p.n, p.X + p.dX, p.Y + p.dY);
      if (m) { await edit(movedBy(m, x1 - x0, y1 - y0)); select(m.id); }
      return;
    }
    p.g?.removeAttribute("transform");
    if (p.g) { select(p.id); return; }
    // a plain click (not a drag that selected words): the saved mark under it, or none
    if (Math.hypot(e.clientX - p.cx, e.clientY - p.cy) > 3 || (window.getSelection()?.toString() ?? "").trim()) return;
    const [x, y] = await reader.toPagePoint(p.n, p.X, p.Y);
    select(markAt(store.marks(), p.n, x, y)?.id ?? null);
  }

  async function markSelection(kind: TextMark): Promise<boolean> {
    const parts = await reader.selection();
    if (!parts.length) return false;
    const marks: Mark[] = [];
    for (const p of parts) {
      const quads = await reader.quads(p.page, p.from, p.to);
      if (!quads.length) continue;
      const quote = quoteOf(await reader.pieces(p.page).catch(() => []), quads);
      marks.push(newMark(p.page, color, { kind, quads, ...(quote ? { quote } : {}) }));
    }
    window.getSelection()?.removeAllRanges();
    await save(marks);
    return marks.length > 0;
  }
  const onUp = () => { if (TEXT_MARKS.includes(tool)) void markSelection(tool as TextMark); };

  async function toggleBookmark(n: number): Promise<boolean> {
    const had = store.marks().find((m) => m.page === n && m.kind === "bookmark");
    if (had) { await store.change([{ op: "remove", id: had.id }]).catch(on.failed); return false; }
    await save([newMark(n, "#e03131", { kind: "bookmark", title: `Page ${n}` })]);
    return true;
  }

  // ── a stamp, an area clip ────────────────────────────────────────────────────────────────────────────────────
  let clipping: { n: number; id: number; X: number; Y: number; el: SVGRectElement } | null = null;
  async function stampAt(e: PointerEvent): Promise<void> {
    const at = reader.pageAt(e.clientX, e.clientY);
    if (!at || e.button !== 0) return;
    e.preventDefault();
    const [x, y] = await reader.toPagePoint(at.n, at.X, at.Y);
    await save([newMark(at.n, color === COLORS.yellow ? "#e03131" : color, { kind: "stamp", at: [x, y], stamp })]);
  }
  function clipDown(e: PointerEvent): void {
    const at = reader.pageAt(e.clientX, e.clientY), svg = at && liveSvg(at.n);
    if (!at || !svg || e.button !== 0) return;
    e.preventDefault();
    const el = document.createElementNS(SVG, "rect");
    for (const [k, v] of Object.entries({ x: at.X, y: at.Y, width: 0, height: 0, fill: "none", stroke: "#1c7ed6", "stroke-dasharray": "4 3" })) el.setAttribute(k, String(v));
    svg.append(el);
    clipping = { n: at.n, id: e.pointerId, X: at.X, Y: at.Y, el };
    container.setPointerCapture(e.pointerId);
  }
  function clipMove(e: PointerEvent): void {
    const c = clipping, at = c && reader.pageAt(e.clientX, e.clientY);
    if (!c || !at || at.n !== c.n || e.pointerId !== c.id) return;
    c.el.setAttribute("x", String(Math.min(c.X, at.X))); c.el.setAttribute("y", String(Math.min(c.Y, at.Y)));
    c.el.setAttribute("width", String(Math.abs(at.X - c.X))); c.el.setAttribute("height", String(Math.abs(at.Y - c.Y)));
  }
  async function clipUp(e: PointerEvent): Promise<void> {
    const c = clipping;
    if (!c || e.pointerId !== c.id) return;
    clipping = null;
    if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    const X = Number(c.el.getAttribute("x")), Y = Number(c.el.getAttribute("y")), W = Number(c.el.getAttribute("width")), H = Number(c.el.getAttribute("height"));
    c.el.remove();
    if (W < 4 || H < 4) return; // a click, not an area
    const [ax, ay] = await reader.toPagePoint(c.n, X, Y), [bx, by] = await reader.toPagePoint(c.n, X + W, Y + H);
    await save([newMark(c.n, "#1c7ed6", { kind: "clip", rect: [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)], title: "" })]);
  }

  // ── the pen ──────────────────────────────────────────────────────────────────────────────────────────────────
  const strokes = new Map<number, Stroke[]>();
  let drawing: { n: number; id: number; s: Stroke } | null = null, rest = 0;
  const liveSvg = (n: number): SVGSVGElement | null => {
    const layer = reader.pageLayer(n);
    if (!layer) return null;
    let svg = layer.querySelector<SVGSVGElement>(":scope > svg.atlas-live-ink");
    if (!svg) {
      svg = document.createElementNS(SVG, "svg");
      svg.classList.add("atlas-live-ink");
      svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;overflow:visible";
      layer.append(svg);
    }
    // the layer's own (unturned) size in points, so strokes are placed in shown points
    const w = layer.offsetWidth / (reader.scale * (96 / 72)), h = layer.offsetHeight / (reader.scale * (96 / 72));
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    return svg;
  };
  const down = (e: PointerEvent) => {
    if (tool === "select") { selectDown(e); return; }
    if (picked) select(null);
    if (tool === "text" || tool === "postit") { void note(e); return; }
    if (tool === "stamp") { void stampAt(e); return; }
    if (tool === "clip") { clipDown(e); return; }
    if (tool !== "ink" || e.button !== 0 || e.pointerType === "touch") return; // a finger still scrolls
    const at = reader.pageAt(e.clientX, e.clientY), svg = at && liveSvg(at.n);
    if (!at || !svg) return;
    e.preventDefault();
    clearTimeout(rest);
    const el = document.createElementNS(SVG, "polyline");
    el.setAttribute("fill", "none");
    el.setAttribute("stroke", color);
    el.setAttribute("stroke-width", String(thickness));
    el.setAttribute("stroke-linecap", "round");
    el.setAttribute("stroke-linejoin", "round");
    svg.append(el);
    drawing = { n: at.n, id: e.pointerId, s: { points: [at.X, at.Y], pressures: [e.pressure || 0.5], tilts: [(e.tiltX ?? 0) / 90, (e.tiltY ?? 0) / 90], times: [0], t0: e.timeStamp, el } };
    el.setAttribute("points", `${at.X},${at.Y}`);
    container.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (pressed) { selectMove(e); return; }
    if (clipping) { clipMove(e); return; }
    if (!drawing || e.pointerId !== drawing.id) return;
    const d = drawing;
    for (const c of e.getCoalescedEvents?.() ?? [e]) {
      const at = reader.pageAt(c.clientX, c.clientY);
      if (!at || at.n !== d.n) continue;
      d.s.points.push(at.X, at.Y);
      d.s.pressures.push(c.pressure || 0.5);
      d.s.tilts.push((c.tiltX ?? 0) / 90, (c.tiltY ?? 0) / 90);
      d.s.times.push(Math.max(0, Math.round(c.timeStamp - d.s.t0)));
    }
    d.s.el.setAttribute("points", d.s.points.reduce((a, v, i) => a + (i % 2 ? `,${v.toFixed(1)}` : ` ${v.toFixed(1)}`), ""));
  };
  const up = (e: PointerEvent) => {
    if (pressed) { void selectUp(e); return; }
    if (clipping) { void clipUp(e); return; }
    if (!drawing || e.pointerId !== drawing.id) return;
    const { n, s } = drawing;
    drawing = null;
    if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    if (s.points.length >= 4) { const list = strokes.get(n) ?? []; list.push(s); strokes.set(n, list); } else s.el.remove();
    clearTimeout(rest);
    rest = window.setTimeout(() => void flushPen(), PEN_REST_MS);
  };
  async function flushPen(): Promise<void> {
    clearTimeout(rest);
    const pages = [...strokes.entries()];
    strokes.clear();
    const marks: Mark[] = [];
    for (const [n, list] of pages) {
      const out = [];
      for (const s of list) {
        const samples: Sample[] = [];
        for (let i = 0, k = 0; i + 1 < s.points.length; i += 2, k++) {
          const [x, y] = await reader.toPagePoint(n, s.points[i], s.points[i + 1]);
          samples.push({ x, y, pressure: s.pressures[k], tilt_x: s.tilts[2 * k], tilt_y: s.tilts[2 * k + 1], t: s.times[k] });
        }
        out.push({ pen: "pen", width: thickness, samples: encodeSamples(samples) });
      }
      marks.push(newMark(n, color, { kind: "ink", strokes: out }));
    }
    await save(marks);
    // the saved ink is drawn from the note now (lib/pdf-marks.ts); the live strokes go once it is
    setTimeout(() => { for (const [, list] of pages) for (const s of list) s.el.remove(); }, 600);
  }

  // ── a text note ──────────────────────────────────────────────────────────────────────────────────────────────
  let editing: HTMLTextAreaElement | null = null;
  async function note(e: PointerEvent): Promise<void> {
    if (e.button !== 0 || editing || (e.target as Element).closest("textarea")) return;
    const at = reader.pageAt(e.clientX, e.clientY), layer = at && reader.pageLayer(at.n);
    if (!at || !layer) return;
    e.preventDefault();
    const postit = tool === "postit";
    const box = Object.assign(document.createElement("textarea"), { className: "atlas-note-input", rows: 1, placeholder: postit ? "A post-it…" : "A note…" });
    box.style.cssText = `position:absolute;left:calc(var(--s) * ${at.X}px);top:calc(var(--s) * ${at.Y}px);font-size:calc(var(--s) * ${NOTE_PT}px);`
      + `z-index:6;min-width:12em;resize:both;color:${color === COLORS.yellow ? "#000" : color};background:#fffbe6;border:1px solid #c9a227;border-radius:3px;padding:2px 4px;line-height:1.25`;
    layer.append(box);
    editing = box;
    requestAnimationFrame(() => box.focus());
    let closed = false;
    const finish = async (keep: boolean) => {
      if (closed) return;
      closed = true;
      const text = box.value.trim(), lines = Math.max(1, text.split("\n").length);
      const width = Math.max(4, ...text.split("\n").map((l) => l.length)) * NOTE_PT * 0.55;
      box.remove();
      editing = null;
      if (!keep || !text) return;
      const [x0, y0] = await reader.toPagePoint(at.n, at.X, at.Y);
      if (postit) {
        // put over a highlight (or underline, strike), it is that passage's post-it
        const under = markAt(store.marks(), at.n, x0, y0, 1);
        const on = under && TEXT_MARKS.includes(under.kind as ToolName) ? under.id : null;
        await save([newMark(at.n, color, { kind: "postit", at: [x0, y0], text, ...(on ? { on } : {}) }, tagsIn(text))]);
        return;
      }
      const [x1, y1] = await reader.toPagePoint(at.n, at.X + width, at.Y + lines * NOTE_PT * 1.25);
      const rect: [number, number, number, number] = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
      await save([newMark(at.n, color === COLORS.yellow ? "#000000" : color, { kind: "text-box", rect, text, size: NOTE_PT }, tagsIn(text))]);
    };
    box.addEventListener("keydown", (k) => {
      k.stopPropagation(); // the pane's single-letter keys are for the pane, not while typing here
      if (k.key === "Escape") void finish(false);
      else if (k.key === "Enter" && !k.shiftKey) { k.preventDefault(); void finish(true); }
    });
    box.addEventListener("blur", () => void finish(true));
  }

  container.addEventListener("pointerdown", down);
  container.addEventListener("pointermove", move);
  container.addEventListener("pointerup", up);
  container.addEventListener("pointercancel", up);
  container.addEventListener("pointerup", onUp);

  return {
    setTool(t) { if (tool === "ink" && t !== "ink") void flushPen(); if (t !== "select" && picked) select(null); tool = t; },
    setColor(hex) { color = hex; },
    setStamp(s) { stamp = s; },
    toggleBookmark,
    edit,
    remove,
    select,
    setThickness(pt) { thickness = pt; },
    markSelection,
    async undo() {
      await flushPen();
      await chain;
      const back = done.pop();
      if (!back) return false;
      try { await store.change(back); if (picked && !was(picked)) select(null); return true; } catch (e) { on.failed(e); return false; }
    },
    async destroy() {
      container.removeEventListener("pointerdown", down);
      container.removeEventListener("pointermove", move);
      container.removeEventListener("pointerup", up);
      container.removeEventListener("pointercancel", up);
      container.removeEventListener("pointerup", onUp);
      pickedStyle.remove();
      editing?.blur();
      await flushPen();
      await chain;
    },
  };
}
