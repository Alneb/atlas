// pdf.js as a PdfEngine (lib/pdf-engine.ts): the backup engine, chosen in Settings → PDF → engine or for one file
// PDFium could not open. It answers in PDFium's shapes, so the reader, the marks and the links work the same:
// - characters: each text item's string split into its characters, the item's width shared out by the characters'
//   own widths (measured in a sans font: pdf.js gives no per-character boxes), a box from the font's height;
//   a line break after an item that ends a line, a space between items that leave a gap (both "generated");
// - find: over those characters, as the reader's own word search (lib/pdf-geom.ts);
// - the PDF's links and annotations from `getAnnotations`, the outline from `getOutline`.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "./api";
import { lineBoxes, runsOf, type Chars } from "./pdf-geom";
import { registerLoaded, type Area, type Box, type DocInfo, type Fit, type Match, type OutlineItem, type PageLayers, type PageLink, type PdfEngine } from "./pdf-engine";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Doc = pdfjs.PDFDocumentProxy;
type Page = pdfjs.PDFPageProxy;
const asset = (d: string) => new URL(`pdfjs/${d}/`, document.baseURI).toString();

/** A document unused this long is closed, and with the last one the worker ends (WebKit frees a worker's heap only
 *  then). */
const IDLE_MS = 30_000, WORKER_IDLE_MS = 60_000, FIND_BUDGET_MS = 120;

interface Open { doc: Promise<Doc>; layers: Map<number, Promise<PageLayers>>; idle?: ReturnType<typeof setTimeout> }
const docs = new Map<string, Open>();
let worker: pdfjs.PDFWorker | null = null, workerIdle: ReturnType<typeof setTimeout> | undefined;

function open(path: string): Open {
  let o = docs.get(path);
  if (!o) {
    clearTimeout(workerIdle);
    if (!worker || worker.destroyed) worker = new pdfjs.PDFWorker();
    const task = pdfjs.getDocument({
      worker,
      url: api.rawUrl(path),
      httpHeaders: { "x-atlas": "1" },
      // by 1 MB pieces (the core answers HTTP ranges): a book's first page reads a few, not the whole file
      disableStream: true,
      disableAutoFetch: true,
      rangeChunkSize: 1 << 20,
      cMapUrl: asset("cmaps"),
      cMapPacked: true,
      standardFontDataUrl: asset("standard_fonts"),
      wasmUrl: asset("wasm"),
      iccUrl: asset("iccs"),
    });
    const doc = task.promise;
    o = { doc, layers: new Map() };
    docs.set(path, o);
    doc.catch(() => close(path));
  }
  clearTimeout(o.idle);
  o.idle = setTimeout(() => close(path), IDLE_MS);
  return o;
}

function close(path: string): void {
  const o = docs.get(path);
  if (!o) return;
  docs.delete(path);
  clearTimeout(o.idle);
  void o.doc.then((d) => d.loadingTask.destroy(), () => {});
  if (!docs.size) workerIdle = setTimeout(() => { if (!docs.size) { worker?.destroy(); worker = null; } }, WORKER_IDLE_MS);
}

const pageOf = async (path: string, n: number): Promise<Page> => {
  const doc = await open(path).doc;
  return doc.getPage(Math.min(Math.max(1, n), doc.numPages));
};

/** A destination (a name or an explicit array) → its page (0-based) and the top it names (XYZ / FitH / FitBH). */
async function destOf(doc: Doc, dest: unknown): Promise<{ page: number; y: number | null } | null> {
  try {
    const d = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(d) || !d.length) return null;
    const ref = d[0];
    const page = typeof ref === "number" ? ref : await doc.getPageIndex(ref);
    const kind = (d[1] as { name?: string } | undefined)?.name;
    const y = kind === "XYZ" ? d[3] : kind === "FitH" || kind === "FitBH" ? d[2] : null;
    return { page, y: typeof y === "number" ? y : null };
  } catch { return null; }
}

async function info(path: string): Promise<DocInfo> {
  const doc = await open(path).doc;
  const sizes: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const v = (await doc.getPage(i)).getViewport({ scale: 1 }); // its /Rotate applied
    sizes.push(v.width, v.height);
  }
  const outline: OutlineItem[] = [];
  type Node = { title: string; dest: unknown; url?: string | null; items: Node[] };
  const walk = async (items: Node[] | null, depth: number) => {
    for (const it of items ?? []) {
      const to = await destOf(doc, it.dest);
      outline.push({ title: (it.title ?? "").trim(), depth, page: to?.page ?? null, y: to?.y ?? null });
      await walk(it.items, depth + 1);
    }
  };
  await walk((await doc.getOutline()) as Node[] | null, 0);
  return { pages: doc.numPages, sizes, outline };
}

/** Page `n` drawn into a new canvas `bw`×`bh`: the whole page `fw` px wide at (`x`, `y`), turned `rotate` quarter
 *  turns past its own /Rotate. */
async function draw(path: string, n: number, area: (base: { width: number; height: number }, rotation: number) => Area, signal?: AbortSignal): Promise<ImageBitmap> {
  const p = await pageOf(path, n);
  const a = area(p.getViewport({ scale: 1 }), p.rotate);
  const rotation = (p.rotate + a.rotate * 90) % 360;
  const turned = p.getViewport({ scale: 1, rotation });
  const viewport = p.getViewport({ scale: a.fw / turned.width, rotation });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(a.bw));
  canvas.height = Math.max(1, Math.round(a.bh));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // a page is paper
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  try {
    const task = p.render({ canvas, viewport, transform: [1, 0, 0, 1, a.x, a.y] });
    signal?.addEventListener("abort", () => task.cancel(), { once: true });
    await task.promise;
    return await createImageBitmap(canvas);
  } finally { canvas.width = canvas.height = 0; } // WebKit keeps a dropped canvas drawn
}

// ── characters ─────────────────────────────────────────────────────────────────────────────────────────────────
let measureCtx: CanvasRenderingContext2D | null = null;
const widthOf = (ch: string): number => {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return 1;
  measureCtx.font = "100px sans-serif";
  return measureCtx.measureText(ch).width || 50;
};

interface Item { str: string; transform: number[]; width: number; height: number; hasEOL: boolean }

/** The text items as PDFium-like characters: codes, boxes in page space, generated spaces and line breaks. */
export function charsOf(items: readonly Item[]): Chars {
  const codes: number[] = [], boxes: number[] = [], generated: number[] = [];
  const push = (code: number, b: Box | null, gen: boolean) => { codes.push(code); boxes.push(...(b ?? [0, 0, 0, 0])); generated.push(gen ? 1 : 0); };
  let lastEnd: [number, number] | null = null, lastSize = 0;
  for (const it of items) {
    const chars = [...it.str];
    if (chars.length) {
      const [a, b, c, d, e, f] = it.transform;
      const size = Math.hypot(c, d) || it.height || 1;
      const ux = Math.hypot(a, b) ? a / Math.hypot(a, b) : 1, uy = Math.hypot(a, b) ? b / Math.hypot(a, b) : 0; // along the line
      const vx = -uy, vy = ux; // up from it
      // a gap from the last item on this line, with no space between: a made-up one, as PDFium makes
      if (lastEnd && codes.length && codes[codes.length - 1] !== 10 && codes[codes.length - 1] !== 32 && chars[0] !== " ") {
        const gap = (e - lastEnd[0]) * ux + (f - lastEnd[1]) * uy;
        if (gap > 0.15 * Math.max(size, lastSize)) push(32, null, true);
      }
      const ws = chars.map(widthOf), total = ws.reduce((s, w) => s + w, 0) || 1;
      let at = 0;
      chars.forEach((ch, k) => {
        const s0 = (at / total) * it.width, s1 = ((at + ws[k]) / total) * it.width;
        at += ws[k];
        const lo = -0.22 * size, hi = 0.9 * size; // descent and ascent, about a sans font's
        const xs = [s0, s1].flatMap((s) => [e + ux * s + vx * lo, e + ux * s + vx * hi]);
        const ys = [s0, s1].flatMap((s) => [f + uy * s + vy * lo, f + uy * s + vy * hi]);
        const cp = ch.codePointAt(0)!;
        // a space has no box in PDFium's text either: it joins the run it sits in
        push(cp, cp === 32 ? null : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], false);
      });
      lastEnd = [e + ux * it.width, f + uy * it.width];
      lastSize = size;
    }
    if (it.hasEOL && codes.length && codes[codes.length - 1] !== 10) { push(13, null, true); push(10, null, true); lastEnd = null; }
  }
  return { codes: Uint32Array.from(codes), boxes: Float32Array.from(boxes), generated: Uint8Array.from(generated) };
}

const LINK = 2, POPUP = 16;
function layers(path: string, n: number): Promise<PageLayers> {
  const o = open(path);
  let l = o.layers.get(n);
  if (!l) {
    l = (async () => {
      const doc = await o.doc, p = await pageOf(path, n);
      const content = await p.getTextContent();
      const chars = charsOf(content.items.filter((i) => "str" in i) as Item[]);
      const links: PageLink[] = [], annots: { id: string; box: Box }[] = [];
      for (const a of (await p.getAnnotations()) as { annotationType: number; id: string; rect: number[]; url?: string; unsafeUrl?: string; dest?: unknown }[]) {
        const box: Box = [Math.min(a.rect[0], a.rect[2]), Math.min(a.rect[1], a.rect[3]), Math.max(a.rect[0], a.rect[2]), Math.max(a.rect[1], a.rect[3])];
        if (a.annotationType === LINK) {
          const url = a.url ?? a.unsafeUrl;
          if (url) links.push({ box, url });
          else if (a.dest) { const to = await destOf(doc, a.dest); if (to) links.push({ box, ...to }); }
        } else if (a.annotationType !== POPUP && a.id) annots.push({ id: a.id, box });
      }
      const [x0, y0, x1, y1] = p.view;
      return { view: [x0, y0, x1, y1] as Box, rotate: ((p.rotate / 90) | 0) & 3, ...chars, links, annots };
    })();
    l.catch(() => o.layers.delete(n));
    o.layers.set(n, l);
  }
  return l;
}

/** Matches of `query` (spaces and case ignored where they differ) in the characters, as PDFium's find gives them. */
export function findIn(c: Chars, query: string, caseSensitive: boolean): { start: number; count: number; boxes: Box[] }[] {
  const norm = (s: string) => (caseSensitive ? s : s.toLowerCase());
  const want = norm(query.replace(/\s+/g, " ").trim());
  if (!want) return [];
  let flat = "";
  const at: number[] = [];
  for (let i = 0; i < c.codes.length; i++) {
    const code = c.codes[i];
    const ch = code === 10 || code === 13 || code === 9 || code === 0xa0 ? " " : code < 32 ? "�" : String.fromCodePoint(code);
    if (ch === " " && flat.endsWith(" ")) continue;
    const s = norm(ch);
    flat += s;
    for (let k = 0; k < s.length; k++) at.push(i);
  }
  const runs = runsOf(c), out: { start: number; count: number; boxes: Box[] }[] = [];
  for (let k = flat.indexOf(want); k >= 0; k = flat.indexOf(want, k + want.length)) {
    const start = at[k], end = at[k + want.length - 1] + 1;
    out.push({ start, count: end - start, boxes: lineBoxes(c, runs, start, end) });
  }
  return out;
}

async function find(path: string, query: string, from: number, caseSensitive: boolean, signal?: AbortSignal): Promise<{ matches: Match[]; next: number | null }> {
  const doc = await open(path).doc;
  const matches: Match[] = [], t0 = performance.now();
  for (let n = from; n <= doc.numPages; n++) {
    if (signal?.aborted) throw new Error("withdrawn");
    if (n > from && performance.now() - t0 > FIND_BUDGET_MS) return { matches, next: n };
    for (const m of findIn(await layers(path, n), query, caseSensitive)) matches.push({ page: n, ...m });
  }
  return { matches, next: null };
}

export const pdfjsEngine: PdfEngine = {
  name: "pdfjs",
  info,
  area: (path, n, area, signal) => draw(path, n, () => area, signal),
  page: (path, n, px, fit: Fit) => draw(path, n, (base) => {
    const scale = px / (fit === "long" ? Math.max(base.width, base.height) : base.width);
    const w = Math.max(1, Math.round(base.width * scale)), h = Math.max(1, Math.round(base.height * scale));
    return { bw: w, bh: h, x: 0, y: 0, fw: w, fh: h, rotate: 0 };
  }),
  layers: (path, n) => layers(path, n),
  find,
  drop: close,
};
registerLoaded(pdfjsEngine);
