// A PDF's marks on the desktop (core pdf_marks.rs; docs/design/DESIGN-pdf-notes.md): every mark lives in one
// ```pdf-marks``` block at the end of the PDF's note, the store every device reads and writes; the PDF is never touched.
// Here: the marks read and changed through /api/pdf-marks, pen samples coded as the core codes them, each page's marks
// drawn as SVG over the reader's page from their page-space places, and the mark under a point (the eraser).
import { api } from "./api";
import { on } from "./bus";
import { boxShown, toShown } from "./pdf-geom";
import { markId } from "./atlas-mark";
import type { Box } from "./pdf-engine";
import type { Mark } from "./gen/Mark";
import type { Op } from "./gen/Op";
import type { PdfMarks } from "./gen/PdfMarks";
import type { Sample } from "./gen/Sample";
import type { Stamp } from "./gen/Stamp";
import type { Reader } from "./pdf-reader";
import { decodeSamples } from "./pdf-samples";
export { encodeSamples, decodeSamples } from "./pdf-samples";
export { MOVABLE, WORDED, movedBy, recoloured, reworded, tagsIn, wordsOf } from "./pdf-mark-edit";

export type { Mark, Op, Sample, Stamp };
export type MarkKind = Mark["kind"];
/** A page's box and /Rotate (Reader.space). */
export interface Space { view: Box; rotate: number }

// ── making marks ─────────────────────────────────────────────────────────────────────────────────────────────────
/** `YYYY-MM-DDTHH:MM`, local time, as the core writes `created`. */
const stamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

type Body = Mark extends infer M ? (M extends { kind: string } ? Omit<M, "id" | "page" | "version" | "color" | "device" | "created" | "tags"> : never) : never;
/** A new mark of this desktop: an id, now, the `#tags` of its text. */
export function newMark(page: number, color: string, body: Body, tags: string[] = []): Mark {
  return { id: markId(), page, version: 0, color, device: "desktop", created: stamp(), tags, ...body } as Mark;
}

// ── drawing ──────────────────────────────────────────────────────────────────────────────────────────────────────
const SVG = "http://www.w3.org/2000/svg";
/** Each stamp's glyph. */
export const STAMPS: Record<Stamp, string> = { check: "✓", question: "?", exclaim: "!", star: "★" };
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};
/** The page's shown size in points (its /Rotate applied). */
export function shownSize({ view, rotate }: Space): [number, number] {
  const w = view[2] - view[0], h = view[3] - view[1];
  return rotate & 1 ? [h, w] : [w, h];
}
/** A pen stroke's width at a pressure: the Boox's pens thin to a third at no pressure. */
export const widthAt = (width: number, pressure: number) => width * (0.35 + 0.65 * Math.max(0, Math.min(1, pressure)));

/** Page `page`'s marks as one SVG in shown points; each mark a `<g data-mark=id data-kind=kind>`. */
export function pageSvg(marks: readonly Mark[], page: number, space: Space): SVGSVGElement {
  const [W, H] = shownSize(space), { view, rotate } = space;
  const svg = el("svg", { class: "atlas-marks", viewBox: `0 0 ${W} ${H}` });
  svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;overflow:visible";
  const pt = (x: number, y: number) => toShown(view, rotate, x, y);
  for (const m of marks) {
    if (m.page !== page || m.kind === "deleted") continue;
    const g = el("g", { "data-mark": m.id, "data-kind": m.kind });
    const color = m.color ?? "#FFE066";
    switch (m.kind) {
      case "highlight":
        for (const q of m.quads) { const [x0, y0, x1, y1] = boxShown(view, rotate, q); g.append(el("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: color, "fill-opacity": 0.4 })); }
        g.style.mixBlendMode = "multiply";
        break;
      case "underline":
      case "strike":
        for (const q of m.quads) {
          const [x0, y0, x1, y1] = boxShown(view, rotate, q), y = m.kind === "underline" ? y1 - 0.5 : (y0 + y1) / 2;
          g.append(el("line", { x1: x0, y1: y, x2: x1, y2: y, stroke: color, "stroke-width": Math.max(0.8, (y1 - y0) * 0.08) }));
        }
        break;
      case "text-box": {
        const [x0, y0, x1, y1] = boxShown(view, rotate, m.rect);
        const fo = el("foreignObject", { x: x0, y: y0, width: Math.max(x1 - x0, 20), height: Math.max(y1 - y0, m.size * 1.3) });
        const div = Object.assign(document.createElement("div"), { textContent: m.text });
        div.style.cssText = `font: ${m.size}px/1.25 system-ui, sans-serif; color: ${m.color ?? "#000"}; white-space: pre-wrap; overflow: visible`;
        fo.append(div);
        g.append(fo);
        break;
      }
      case "postit": {
        const [x, y] = pt(m.at[0], m.at[1]);
        g.append(el("path", { d: `M${x} ${y}h14v10l-4 4h-10z`, fill: m.color ?? "#FFE066", stroke: "#b08900", "stroke-width": 0.6 }));
        g.append(el("path", { d: `M${x + 14} ${y + 10}h-4v4`, fill: "none", stroke: "#b08900", "stroke-width": 0.6 }));
        g.append(Object.assign(el("title", {}), { textContent: m.text }));
        break;
      }
      case "ink":
        for (const s of m.strokes) {
          const ss = decodeSamples(s.samples), c = s.color ?? m.color ?? "#000000";
          const line = el("g", { stroke: c, "stroke-linecap": "round", "stroke-opacity": s.opacity ?? 1, fill: "none" });
          for (let i = 1; i < ss.length; i++) {
            const [ax, ay] = pt(ss[i - 1].x, ss[i - 1].y), [bx, by] = pt(ss[i].x, ss[i].y);
            line.append(el("line", { x1: ax, y1: ay, x2: bx, y2: by, "stroke-width": widthAt(s.width, (ss[i - 1].pressure + ss[i].pressure) / 2) }));
          }
          g.append(line);
        }
        break;
      case "clip": {
        const [x0, y0, x1, y1] = boxShown(view, rotate, m.rect);
        g.append(el("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: "none", stroke: m.color ?? "#1c7ed6", "stroke-width": 1, "stroke-dasharray": "4 3" }));
        if (m.title) g.append(Object.assign(el("text", { x: x0 + 2, y: y0 - 3, "font-size": 8, fill: m.color ?? "#1c7ed6" }), { textContent: m.title }));
        break;
      }
      case "stamp": {
        const [x, y] = pt(m.at[0], m.at[1]);
        g.append(Object.assign(el("text", { x, y, "font-size": 18, "text-anchor": "middle", "dominant-baseline": "central", fill: m.color ?? "#e03131", "font-weight": 700 }), { textContent: STAMPS[m.stamp] }));
        break;
      }
      case "bookmark":
        g.append(el("path", { d: `M${W - 30} 0h14v22l-7 -6l-7 6z`, fill: m.color ?? "#e03131" }));
        if (m.title) g.append(Object.assign(el("title", {}), { textContent: m.title }));
        break;
    }
    svg.append(g);
  }
  return svg;
}

// ── the mark under a point ───────────────────────────────────────────────────────────────────────────────────────
const inBox = (b: readonly number[], x: number, y: number, pad: number) => x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad;
function distToSegment(px: number, py: number, a: Sample, b: Sample): number {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len)) : 0;
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}
/** The topmost mark of `page` under the page-space point (x, y) (`pad` points of slack), or null. */
export function markAt(marks: readonly Mark[], page: number, x: number, y: number, pad = 3): Mark | null {
  for (const m of [...marks].reverse()) {
    if (m.page !== page) continue;
    const hit = (() => {
      switch (m.kind) {
        case "highlight": case "underline": case "strike": return m.quads.some((q) => inBox(q, x, y, pad));
        case "text-box": case "clip": return inBox(m.rect, x, y, pad);
        case "postit": return inBox([m.at[0], m.at[1] - 14, m.at[0] + 14, m.at[1]], x, y, pad);
        case "stamp": return Math.hypot(x - m.at[0], y - m.at[1]) <= 9 + pad;
        case "ink": return m.strokes.some((s) => { const ss = decodeSamples(s.samples); return ss.some((a, i) => i > 0 && distToSegment(x, y, ss[i - 1], a) <= s.width + pad); });
        default: return false;
      }
    })();
    if (hit) return m;
  }
  return null;
}

// ── over the reader ──────────────────────────────────────────────────────────────────────────────────────────────
export interface MarksView {
  marks(): readonly Mark[];
  /** The note that holds them, once there is one. */
  note(): string | null;
  /** Applies `ops` (the note made with the first mark) and redraws; the marks after. */
  change(ops: Op[]): Promise<readonly Mark[]>;
  reload(): void;
  /** Scrolls to mark `id` once its page is drawn and makes it blink (a `[[note#^m-…]]` link); false if not found. */
  flash(id: string): Promise<boolean>;
  stop(): void;
}

/** `pdf`'s marks drawn over the pages of `reader`, each page as it is drawn; follows its note's saves. `changed`: after
 *  every change, whoever made it. */
export function attachPdfMarks(reader: Reader, pdf: string, changed: (marks: readonly Mark[]) => void = () => {}): MarksView {
  let state: PdfMarks = { note: null, marks: [] }, gone = false;
  const dir = pdf.includes("/") ? pdf.slice(0, pdf.lastIndexOf("/") + 1) : "";
  const place = async (n: number) => {
    const layer = reader.pageLayer(n);
    if (!layer || gone) return;
    const space = await reader.space(n).catch(() => null);
    if (!space || gone) return;
    layer.querySelector(":scope > svg.atlas-marks")?.remove();
    if (state.marks.some((m) => m.page === n)) layer.append(pageSvg(state.marks, n, space));
  };
  // only pages the reader has drawn (the rest get theirs on "drawn"): a far page's place would load its text
  const drawn = (n: number) => !!reader.pageLayer(n)?.parentElement?.querySelector("canvas");
  const set = (m: PdfMarks) => {
    const pages = new Set([...state.marks, ...m.marks].map((x) => x.page));
    state = m;
    for (const n of pages) if (drawn(n)) void place(n);
    changed(m.marks);
  };
  const load = async () => {
    const m = await api.pdfMarks(pdf).catch(() => null);
    if (m && !gone) set(m);
  };
  void load();
  const offDrawn = reader.on("drawn", (n) => void place(n));
  // the note's own saves (another device, the note edited); before it exists, any note made beside the PDF
  const offFs = on("fs", (e) => {
    if (state.note ? e.paths.includes(state.note) : e.paths.some((p) => p.endsWith(".md") && p.startsWith(dir))) void load();
  });
  return {
    marks: () => state.marks,
    note: () => state.note,
    async change(ops) { const m = await api.changePdfMarks(pdf, ops); if (!gone) set(m); return m.marks; },
    reload: () => void load(),
    async flash(id) {
      for (let t = 0; t < 50 && !gone; t++) { // the marks load and the page draws first: up to 5 s
        const m = state.marks.find((x) => x.id === id);
        const g = m && reader.pageLayer(m.page)?.querySelector<SVGGElement>(`svg.atlas-marks [data-mark="${id}"]`);
        if (g) {
          g.scrollIntoView({ block: "center" });
          g.classList.remove("atlas-flash-mark");
          void g.getBoundingClientRect(); // the animation again when the same link is followed twice
          g.classList.add("atlas-flash-mark");
          return true;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    },
    stop() {
      gone = true;
      offDrawn();
      offFs();
      for (let n = 1; n <= reader.pages; n++) reader.pageLayer(n)?.querySelector(":scope > svg.atlas-marks")?.remove();
    },
  };
}
