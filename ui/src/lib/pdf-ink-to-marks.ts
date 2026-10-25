// An older companion drawing (`x.pdf.excalidraw`, lib/pdf-ink-scene.ts) read as the PDF's marks (lib/pdf-marks.ts,
// core pdf_marks.rs): each element over a page frame turned from the frame's units into PDF points by its page's
// box. A mark keeps its id, colour, device, time and words when the drawing had them (`customData.atlasMark`); a
// highlight's boxes stay one mark; the notepad's shapes become pen strokes along their outline. What has no mark shape
// (a picture, an embed) is counted, and the drawing is then kept. Pure: no I/O.
import { toPage } from "./pdf-geom";
import { pageFrames, type El } from "./pdf-ink-scene";
import { encodeSamples } from "./pdf-samples";
import type { Mark } from "./gen/Mark";
import type { Sample } from "./gen/Sample";
import type { Stroke } from "./gen/Stroke";
import type { AtlasMark } from "./atlas-mark";
import type { Box } from "./pdf-engine";

/** A page's box and /Rotate (Reader.space, PdfEngine.layers). */
export interface Space { view: Box; rotate: number }
export interface Converted { marks: Mark[]; /** elements over a page with no mark shape */ kept: number; pages: number[] }

const ID = /^m-[0-9a-z]{8}$/;
/** A mark id from the drawing's own element id (FNV-1a): the same element always gives the same mark, so a second run
 *  of the migration finds it already in the note instead of adding it again. */
const idOf = (key: string) => {
  let h = 0xcbf29ce484222325n;
  for (const c of new TextEncoder().encode(key)) h = BigInt.asUintN(64, (h ^ BigInt(c)) * 0x100000001b3n);
  return `m-${(h % 36n ** 8n).toString(36).padStart(8, "0")}`;
};
const stamp = (ms: number) => {
  const d = new Date(ms), p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** The pages that have marks over their frames: their spaces are what `convert` needs. */
export function pagesOf(els: readonly El[]): number[] {
  const frames = pageFrames(els as never), pageOf = new Map([...frames].map(([n, f]) => [f.frame, n]));
  return [...new Set(els.filter((e) => !e.isDeleted && e.type !== "frame" && pageOf.has(e.frameId as string)).map((e) => pageOf.get(e.frameId as string)!))].sort((a, b) => a - b);
}

/** The outline of a shape element as points in its own units (from its x, y), for a pen stroke. */
function outline(e: El): [number, number][] | null {
  const w = e.width ?? 0, h = e.height ?? 0;
  const pts = (e as { points?: [number, number][] }).points;
  switch (e.type) {
    case "freedraw": case "line": case "arrow": return pts && pts.length > 1 ? pts : null;
    case "rectangle": return [[0, 0], [w, 0], [w, h], [0, h], [0, 0]];
    case "diamond": return [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2], [w / 2, 0]];
    case "ellipse": return Array.from({ length: 41 }, (_, i) => { const a = (i / 40) * 2 * Math.PI; return [w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)] as [number, number]; });
    default: return null;
  }
}

export function convert(els: readonly El[], spaces: Map<number, Space>): Converted {
  const frames = pageFrames(els as never), byFrame = new Map<string, number>(), pictures = new Set<string>();
  for (const [n, f] of frames) { byFrame.set(f.frame, n); pictures.add(f.picture); }
  const frameEl = new Map(els.filter((e) => e.type === "frame").map((e) => [e.id, e]));
  const marks = new Map<string, Mark>();
  let kept = 0;
  for (const e of els) {
    const n = byFrame.get(e.frameId as string);
    if (e.isDeleted || e.type === "frame" || pictures.has(e.id) || !n) continue;
    const f = frameEl.get(e.frameId as string), sp = spaces.get(n);
    if (!f || !sp) { kept++; continue; }
    const W = sp.rotate & 1 ? sp.view[3] - sp.view[1] : sp.view[2] - sp.view[0];
    const s = (f.width ?? 1) / W;
    // a point in the frame's units → PDF points
    const pt = (fx: number, fy: number): [number, number] => toPage(sp.view, sp.rotate, (fx - (f.x ?? 0)) / s, (fy - (f.y ?? 0)) / s);
    const box = (): [number, number, number, number] => {
      const [ax, ay] = pt(e.x ?? 0, e.y ?? 0), [bx, by] = pt((e.x ?? 0) + (e.width ?? 0), (e.y ?? 0) + (e.height ?? 0));
      return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
    };
    const cd = (e.customData ?? {}) as { atlasMark?: AtlasMark; atlasHighlight?: { mark?: string; rect?: [number, number, number, number] } };
    const am = cd.atlasMark;
    const device = am?.device ?? (/^(pen|highlight|note)-/.test(e.id) ? "desktop" : "android");
    const key = am?.id ?? cd.atlasHighlight?.mark ?? e.id;
    const head = (color: string) => ({
      id: am && ID.test(am.id) ? am.id : (marks.get(key)?.id ?? idOf(key)), page: n, version: 0, color, device,
      created: stamp(am?.created ?? (Number(e.updated) || Date.now())), tags: [] as string[],
    });
    if (e.type === "rectangle" && (cd.atlasHighlight || am?.kind === "highlight")) {
      const quad = cd.atlasHighlight?.rect ?? box();
      const had = marks.get(key) as (Mark & { kind: "highlight" }) | undefined;
      if (had) had.quads.push(quad);
      else marks.set(key, { ...head(String(e.backgroundColor ?? "#FFE066")), kind: "highlight", quads: [quad], ...(am?.quote ? { quote: am.quote } : {}) } as Mark);
      continue;
    }
    if (e.type === "text") {
      const text = String((e as { text?: string }).text ?? "").trim();
      if (!text) continue;
      const size = Number((e as { fontSize?: number }).fontSize ?? 10 * s) / s;
      marks.set(key, { ...head(String(e.strokeColor ?? "#000000")), kind: "text-box", rect: box(), text, size: Math.round(size * 100) / 100 } as Mark);
      continue;
    }
    const line = outline(e);
    if (!line) { kept++; continue; }
    const pressures = (e as { pressures?: number[] }).pressures ?? [];
    const samples: Sample[] = line.map(([dx, dy], i) => {
      const [x, y] = pt((e.x ?? 0) + dx, (e.y ?? 0) + dy);
      return { x, y, pressure: pressures[i] ?? 0.5, tilt_x: 0, tilt_y: 0, t: i * 8 };
    });
    // the desktop wrote its pen's width as thickness × scale / 3 (pdf-ink-scene.ts); the same rule read back
    const stroke: Stroke = { pen: e.type === "freedraw" ? "pen" : e.type, width: Math.max(0.3, (Number(e.strokeWidth ?? 1) * 3) / s), samples: encodeSamples(samples),
      ...(e.opacity !== undefined && Number(e.opacity) !== 100 ? { opacity: Number(e.opacity) / 100 } : {}) };
    const color = String(e.strokeColor ?? "#000000");
    const had = marks.get(key) as (Mark & { kind: "ink" }) | undefined;
    if (had && am) had.strokes.push(stroke);
    else marks.set(key, { ...head(color), kind: "ink", strokes: [stroke] } as Mark);
  }
  const out = [...marks.values()];
  return { marks: out, kept, pages: [...new Set(out.map((m) => m.page))] };
}

/** What a mark is, apart from who made it when: its kind, page and place (keys sorted, numbers to 0.01 pt, since a number
 *  read back from the note may differ in its last bit), to find one already moved. */
export function placeKey(m: Mark): string {
  const { id: _i, version: _v, color: _c, device: _d, created: _t, tags: _g, ...rest } = m as Mark & Record<string, unknown>;
  const sorted = (v: unknown): unknown => typeof v === "number" ? Math.round(v * 100) / 100 : Array.isArray(v) ? v.map(sorted) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).filter(([, x]) => x != null).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v;
  return JSON.stringify(sorted(rest));
}
