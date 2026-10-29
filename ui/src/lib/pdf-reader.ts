// The PDF reader (docs/refactor/REFACTOR-pdfium-reader.md): pages laid out at their sizes, drawn by one engine
// (lib/pdf-engine.ts: PDFium, or pdf.js as the backup — never both for one document) when near the view and let go when far, a sharp tile of the visible part when a page is too big
// to draw whole; over each page its text (transparent spans, for selecting and copying), its links, its
// annotations' places (`#annotation=` links) and find's matches. The DOM keeps pdf.js's shape where other code reads
// it: `.page[data-page-number]` > `.canvasWrapper`, `.pageLayers` > `.textLayer span`, `[data-annotation-id]`.
import type { Box, DocInfo, EngineName, Match, OutlineItem, PageLayers, PdfEngine } from "./pdf-engine";
import { boxShown, charAt, findWords, lineBoxes, piecesOf, runsOf, textOf, toPage, unturn, type Chars, type Run } from "./pdf-geom";
import { dpr } from "./pdf-pages";
import type { TextPiece } from "./atlas-mark";

export type Zoom = "page-width" | "page-fit" | number;
export type { OutlineItem };
/** CSS px per PDF point at 100 %. */
const PX = 96 / 72;
/** Room left beside a page fitted to the width, and above and below one fitted whole (CSS px). */
const SIDE = 20, ABOVE = 28;
/** The most device pixels a page's canvas gets; past it the page is drawn smaller and the visible part as a tile. */
const MAX_PIXELS = 16_777_216;
/** Pages drawn beyond the visible ones, and kept drawn beyond those. */
const AHEAD = 1, KEEP = 3;
const LAYERS_KEPT = 40;
export const MIN_SCALE = 0.25, MAX_SCALE = 6;

interface Events { page: number; scale: { scale: number; zoom: Zoom }; drawn: number; layers: number; find: { current: number; total: number } }
type Handler<K extends keyof Events> = (e: Events[K]) => void;

/** A page's text in shown space (y down, its /Rotate applied), cut into runs; its links and annotations. */
interface Text { layers: PageLayers; shown: Chars; runs: Run[] }
interface PageView {
  n: number; div: HTMLDivElement; wrap: HTMLDivElement; layer: HTMLDivElement;
  textEl: HTMLDivElement; linkEl: HTMLDivElement; findEl: HTMLDivElement;
  canvas: HTMLCanvasElement | null; drawnKey: string; drawing: AbortController | null;
  detail: HTMLCanvasElement | null; detailKey: string; detailing: AbortController | null;
  /** Its text, links and matches are laid out (they turn with `.pageLayers`, so a rotation keeps them). */
  built: boolean;
}

/** One place of a selection: characters `from`…`to` (exclusive) of page `page`, and their words. */
export interface Selected { page: number; from: number; to: number; text: string }

export interface Reader {
  /** The engine this document is read by. */
  readonly engine: EngineName;
  readonly pages: number;
  readonly outline: OutlineItem[];
  readonly page: number;
  readonly scale: number;
  readonly zoom: Zoom;
  readonly rotation: number;
  readonly spread: boolean;
  goto(n: number, y?: number | null): void;
  setZoom(z: Zoom): void;
  /** Scales by `f`, keeping the point under `origin` (client px) still; the pages are redrawn once it rests. */
  zoomBy(f: number, origin?: { x: number; y: number }): void;
  /** Fits again after the view's size changed (a preset zoom only). */
  refit(): void;
  /** The view is shown again after being hidden (a background tab): its pages drawn anew — a hidden page's canvas can
   *  come back blank, and nothing else (no scroll, no new width) would draw it. */
  shown(): void;
  /** Where the reading is: the page, and `y` the height on it at the view's top (PDF points from its bottom, as
   *  `goto` takes it), so coming back lands on the same line, not the page's top. */
  where(): { page: number; y: number | null };
  rotate(): void;
  setSpread(on: boolean): void;
  on<K extends keyof Events>(k: K, fn: Handler<K>): () => void;
  find(query: string, o?: { again?: boolean; back?: boolean }): void;
  /** The selected text, page by page. */
  selection(): Promise<Selected[]>;
  /** Selects `words` on page n (once its text is there); whether they were found. */
  selectWords(n: number, words: string): Promise<boolean>;
  /** Flashes the PDF's annotation `id` on page n; whether it is there. */
  flashAnnotation(n: number, id: string): Promise<boolean>;
  /** The page under a client point, and the point in the page's shown space (points, y down, before the reader's
   *  rotation). */
  pageAt(x: number, y: number): { n: number; X: number; Y: number } | null;
  /** A point of page n's shown space in page space (PDF points, y up). */
  toPagePoint(n: number, X: number, Y: number): Promise<[number, number]>;
  /** Shown-space boxes (points) of page n's characters `from`…`to`, one a line, in page space. */
  quads(n: number, from: number, to: number): Promise<Box[]>;
  /** Page n's box (PDF points) and its text as pieces, for a mark's words (lib/atlas-mark.ts). */
  view(n: number): Promise<Box>;
  /** Page n's box and /Rotate: what `toShown` needs to place a page-space mark (lib/pdf-geom.ts). */
  space(n: number): Promise<{ view: Box; rotate: number }>;
  pieces(n: number): Promise<TextPiece[]>;
  /** Page n's element (`.page`), and the box over it that turns with the page (marks and ink are laid there). */
  pageLayer(n: number): HTMLElement | null;
  destroy(): void;
}

const STYLE_ID = "atlas-pdf-reader";
function addStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  document.head.append(Object.assign(document.createElement("style"), { id: STYLE_ID, textContent: `
.pdfViewer { --s: 1; }
.pdfViewer .page { position: relative; box-sizing: content-box; background: #fff; }
.pdfViewer .spreadRow { display: flex; justify-content: center; gap: 14px; }
.pdfViewer .spreadRow > .page { margin-left: 0 !important; margin-right: 0 !important; }
.pdfViewer .canvasWrapper { position: absolute; inset: 0; overflow: hidden; }
.pdfViewer .canvasWrapper > canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.pdfViewer .canvasWrapper > canvas.detail { width: auto; height: auto; }
.pdfViewer .pageLayers { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.pdfViewer .textLayer, .pdfViewer .linkLayer, .pdfViewer .findLayer { position: absolute; inset: 0; }
.pdfViewer .textLayer { line-height: 1; overflow: hidden; z-index: 2; }
.pdfViewer .textLayer span, .pdfViewer .textLayer br { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0 0; font-family: sans-serif; }
.pdfViewer .textLayer ::selection { background: rgba(0, 100, 255, .28); }
.pdfViewer .findLayer { pointer-events: none; z-index: 1; }
.pdfViewer .findLayer > div { position: absolute; background: rgba(255, 200, 0, .4); border-radius: 2px; }
.pdfViewer .findLayer > div.selected { background: rgba(255, 120, 0, .6); }
.pdfViewer .linkLayer { pointer-events: none; z-index: 4; }
.pdfViewer .linkLayer > a { position: absolute; pointer-events: auto; }
.pdfViewer .linkLayer > a:hover { background: rgba(0, 100, 255, .08); }
.pdfViewer .linkLayer > [data-annotation-id] { position: absolute; pointer-events: none; }
` }));
}

const pt = (v: number) => `calc(var(--s) * ${v.toFixed(2)}px)`;
let measureCtx: CanvasRenderingContext2D | null = null;
/** The width of `text` in the spans' font at 100 px. */
function width100(text: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 50;
  measureCtx.font = "100px sans-serif";
  return measureCtx.measureText(text).width || 1;
}
const release = (c: HTMLCanvasElement | null) => { if (c) { c.width = c.height = 0; c.remove(); } }; // WebKit keeps a dropped canvas drawn

/** `path` read by `eng` alone, every page, text, link and match of this opening. */
export async function openReader(container: HTMLElement, path: string, eng: PdfEngine, start: { zoom: Zoom; page?: number; y?: number | null }): Promise<Reader> {
  addStyle();
  const info: DocInfo = await eng.info(path);
  const root = container.querySelector<HTMLElement>(".pdfViewer") ?? container.appendChild(Object.assign(document.createElement("div"), { className: "pdfViewer" }));
  const handlers = new Map<keyof Events, Set<(e: never) => void>>();
  const emit = <K extends keyof Events>(k: K, e: Events[K]) => handlers.get(k)?.forEach((f) => (f as Handler<K>)(e));
  let scale = 1, zoom: Zoom = start.zoom, turns = 0, spread = false, current = 1, gone = false;
  let fittedWidth = 0; // the view's width at the last fit: 0 while it was laid out hidden
  let tops: number[] = [], heights: number[] = [];

  // every page's box, empty until near the view
  const views: PageView[] = [];
  for (let n = 1; n <= info.pages; n++) {
    const div = Object.assign(document.createElement("div"), { className: "page" });
    div.dataset.pageNumber = String(n);
    const wrap = Object.assign(document.createElement("div"), { className: "canvasWrapper" });
    const layer = Object.assign(document.createElement("div"), { className: "pageLayers" });
    const textEl = Object.assign(document.createElement("div"), { className: "textLayer" });
    const findEl = Object.assign(document.createElement("div"), { className: "findLayer" });
    const linkEl = Object.assign(document.createElement("div"), { className: "linkLayer annotationLayer" });
    layer.append(findEl, textEl, linkEl);
    div.append(wrap, layer);
    views.push({ n, div, wrap, layer, textEl, linkEl, findEl, canvas: null, drawnKey: "", drawing: null, detail: null, detailKey: "", detailing: null, built: false });
  }
  /** Page n's shown size in points, before (`raw`) or after the reader's rotation. */
  const size = (n: number, raw = false): [number, number] => {
    const w = info.sizes[(n - 1) * 2] || 612, h = info.sizes[(n - 1) * 2 + 1] || 792;
    return !raw && turns & 1 ? [h, w] : [w, h];
  };

  function arrange(): void {
    root.replaceChildren();
    if (!spread) { for (const v of views) root.append(v.div); return; }
    for (let i = 0; i < views.length; i += 2) {
      const row = Object.assign(document.createElement("div"), { className: "spreadRow" });
      row.append(views[i].div, ...(views[i + 1] ? [views[i + 1].div] : []));
      root.append(row);
    }
  }

  /** Sizes every page for the scale and rotation, then reads back where each sits. */
  function layout(): void {
    root.style.setProperty("--s", String(scale * PX));
    for (const v of views) {
      const [w, h] = size(v.n), [rw, rh] = size(v.n, true);
      v.div.style.width = `${w * scale * PX}px`;
      v.div.style.height = `${h * scale * PX}px`;
      v.layer.style.width = `${rw * scale * PX}px`;
      v.layer.style.height = `${rh * scale * PX}px`;
      v.layer.style.transform = ["", "rotate(90deg) translateY(-100%)", "rotate(180deg) translate(-100%, -100%)", "rotate(270deg) translateX(-100%)"][turns];
    }
    tops = views.map((v) => v.div.offsetTop);
    heights = views.map((v) => v.div.offsetHeight);
  }

  /** The scale a preset zoom means for page n (and its neighbour in two-page view). */
  function scaleFor(z: Zoom, n = current): number {
    if (typeof z === "number") return z;
    const pair = spread ? [n - ((n - 1) % 2), n - ((n - 1) % 2) + 1].filter((k) => k <= info.pages) : [n];
    const w = pair.reduce((a, k) => a + size(k)[0], 0) * PX + (pair.length - 1) * 14, h = Math.max(...pair.map((k) => size(k)[1])) * PX;
    const byWidth = Math.max(1, container.clientWidth - SIDE * 2) / w;
    const fit = z === "page-width" ? byWidth : Math.min(byWidth, Math.max(1, container.clientHeight - ABOVE * 2) / h);
    // a view not laid out yet (a background tab) fits again once it is (refit)
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
  }

  /** Changes the scale keeping the point at (`ox`, `oy`) of the view (px from its top left) over the same spot. */
  function rescale(next: number, ox = container.clientWidth / 2, oy = 0): void {
    next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    const i = pageIndexAt(container.scrollTop + oy);
    const v = views[i];
    const fy = (container.scrollTop + oy - tops[i]) / Math.max(1, heights[i]);
    const fx = (container.scrollLeft + ox - v.div.offsetLeft) / Math.max(1, v.div.offsetWidth);
    scale = next;
    layout();
    container.scrollTop = tops[i] + fy * heights[i] - oy;
    container.scrollLeft = v.div.offsetLeft + fx * v.div.offsetWidth - ox;
    emit("scale", { scale, zoom });
    scheduleRedraw();
  }

  /** The index of the page at content height `y`. */
  function pageIndexAt(y: number): number {
    let lo = 0, hi = views.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (tops[mid] <= y) lo = mid; else hi = mid - 1; }
    return lo;
  }

  // ── drawing ──────────────────────────────────────────────────────────────────────────────────────────────────
  let redrawTimer = 0, detailTimer = 0;
  const scheduleRedraw = () => { clearTimeout(redrawTimer); redrawTimer = window.setTimeout(update, 140); };

  /** The page's device scale: the screen's, unless that makes too big a canvas. */
  const deviceScale = (v: PageView) => {
    const w = v.div.offsetWidth, h = v.div.offsetHeight, k = dpr();
    return w * h * k * k > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / (w * h)) : k;
  };

  async function draw(v: PageView): Promise<void> {
    const key = `${scale}|${turns}`;
    if (v.drawnKey === key || v.drawing) return;
    const ctl = (v.drawing = new AbortController());
    const k = deviceScale(v), bw = Math.max(1, Math.round(v.div.offsetWidth * k)), bh = Math.max(1, Math.round(v.div.offsetHeight * k));
    try {
      const b = await eng.area(path, v.n, { bw, bh, x: 0, y: 0, fw: bw, fh: bh, rotate: turns }, ctl.signal);
      if (ctl.signal.aborted || gone) { b.close(); return; }
      const c = Object.assign(document.createElement("canvas"), { width: bw, height: bh });
      c.getContext("2d")!.drawImage(b, 0, 0);
      b.close();
      release(v.canvas);
      v.wrap.prepend(c);
      v.canvas = c;
      v.drawnKey = key;
      emit("drawn", v.n);
    } catch (e) {
      if (!ctl.signal.aborted) console.warn(`PDFium could not draw page ${v.n}`, e);
    } finally {
      if (v.drawing === ctl) v.drawing = null;
    }
    if (key !== `${scale}|${turns}`) scheduleRedraw(); // the scale moved on while it was drawn
  }

  /** A page drawn smaller than the screen asks for: its visible part as a sharp tile over it. */
  async function drawDetail(v: PageView): Promise<void> {
    const k = dpr();
    if (deviceScale(v) >= k - 1e-6) { release(v.detail); v.detail = null; v.detailKey = ""; return; }
    const left = Math.max(0, container.scrollLeft - v.div.offsetLeft), top = Math.max(0, container.scrollTop - v.div.offsetTop);
    const right = Math.min(v.div.offsetWidth, container.scrollLeft + container.clientWidth - v.div.offsetLeft);
    const bottom = Math.min(v.div.offsetHeight, container.scrollTop + container.clientHeight - v.div.offsetTop);
    if (right <= left || bottom <= top) return;
    const key = `${scale}|${turns}|${Math.round(left)}|${Math.round(top)}|${Math.round(right)}|${Math.round(bottom)}`;
    if (v.detailKey === key) return;
    v.detailing?.abort();
    const ctl = (v.detailing = new AbortController());
    const bw = Math.round((right - left) * k), bh = Math.round((bottom - top) * k);
    try {
      const b = await eng.area(path, v.n, { bw, bh, x: -left * k, y: -top * k, fw: v.div.offsetWidth * k, fh: v.div.offsetHeight * k, rotate: turns }, ctl.signal);
      if (ctl.signal.aborted || gone) { b.close(); return; }
      const c = Object.assign(document.createElement("canvas"), { width: bw, height: bh, className: "detail" });
      c.getContext("2d")!.drawImage(b, 0, 0);
      b.close();
      Object.assign(c.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px` });
      release(v.detail);
      v.wrap.append(c);
      v.detail = c;
      v.detailKey = key;
    } catch (e) {
      if (!ctl.signal.aborted) console.warn(`PDFium could not draw a part of page ${v.n}`, e);
    }
  }

  function letGo(v: PageView): void {
    v.drawing?.abort(); v.drawing = null;
    v.detailing?.abort(); v.detailing = null;
    release(v.canvas); v.canvas = null; v.drawnKey = "";
    release(v.detail); v.detail = null; v.detailKey = "";
    if (v.built) { v.textEl.replaceChildren(); v.linkEl.replaceChildren(); v.findEl.replaceChildren(); v.built = false; }
  }

  /** Draws what is near the view, lets go of what is far, keeps the current page. */
  function update(): void {
    // a pane with no size (a hidden tab, a page being left) has no page in view: its pages laid out at width 0 would put
    // the old scroll position on the last page, which was then taken (and remembered) as the one being read
    if (gone || !views.length || !container.clientHeight || !container.clientWidth) return;
    const top = container.scrollTop, bottom = top + container.clientHeight;
    const first = pageIndexAt(top), last = pageIndexAt(Math.max(top, bottom - 1));
    const now = views[pageIndexAt(top + container.clientHeight / 3)].n;
    if (now !== current) { current = now; emit("page", current); }
    const near = new Set<number>();
    for (let i = Math.max(0, first - AHEAD); i <= Math.min(views.length - 1, last + AHEAD); i++) near.add(i);
    // the visible pages first, then the ones just past them
    const order = [...near].sort((a, b) => Number(a < first || a > last) - Number(b < first || b > last));
    for (const i of order) { void draw(views[i]); void buildText(views[i]); }
    for (let i = 0; i < views.length; i++) if ((i < first - KEEP || i > last + KEEP) && (views[i].canvas || views[i].built || views[i].drawing)) letGo(views[i]);
    clearTimeout(detailTimer);
    detailTimer = window.setTimeout(() => { for (let i = first; i <= last; i++) void drawDetail(views[i]); }, 160);
  }
  let frame = 0;
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); };
  container.addEventListener("scroll", onScroll, { passive: true });

  // ── text, links, annotations ─────────────────────────────────────────────────────────────────────────────────
  const texts = new Map<number, Promise<Text>>();
  function textOfPage(n: number): Promise<Text> {
    let t = texts.get(n);
    if (!t) {
      t = eng.layers(path, n).then((layers) => {
        const boxes = new Float32Array(layers.boxes.length);
        for (let i = 0; i < layers.codes.length; i++) boxes.set(boxShown(layers.view, layers.rotate, [layers.boxes[i * 4], layers.boxes[i * 4 + 1], layers.boxes[i * 4 + 2], layers.boxes[i * 4 + 3]]), i * 4);
        const shown = { codes: layers.codes, boxes, generated: layers.generated };
        return { layers, shown, runs: runsOf(shown) };
      });
      t.catch(() => texts.delete(n));
      texts.set(n, t);
      if (texts.size > LAYERS_KEPT) texts.delete(texts.keys().next().value!);
    }
    return t;
  }
  const spanRun = new WeakMap<Node, { n: number; run: Run }>();

  async function buildText(v: PageView): Promise<void> {
    if (v.built) return;
    v.built = true;
    let t: Text;
    try { t = await textOfPage(v.n); } catch (e) { v.built = false; console.warn(`PDFium could not read page ${v.n}'s text`, e); return; }
    if (gone || !v.built) return;
    const frag = document.createDocumentFragment();
    for (const run of t.runs) {
      const [x0, y0, x1, y1] = run.box, h = y1 - y0;
      if (!(h > 0) || !run.text.trim()) continue;
      const span = document.createElement("span");
      span.textContent = run.text;
      span.style.cssText = `left:${pt(x0)};top:${pt(y0)};font-size:${pt(h)};transform:scaleX(${((x1 - x0) / ((width100(run.text) * h) / 100)).toFixed(4)})`;
      spanRun.set(span, { n: v.n, run });
      frag.append(span);
      if (run.eol) frag.append(document.createElement("br"));
    }
    v.textEl.replaceChildren(frag);
    const { layers } = t, links = document.createDocumentFragment();
    const place = (el: HTMLElement, b: Box) => {
      const [x0, y0, x1, y1] = boxShown(layers.view, layers.rotate, b);
      el.style.cssText = `left:${pt(x0)};top:${pt(y0)};width:${pt(x1 - x0)};height:${pt(y1 - y0)}`;
      return el;
    };
    for (const l of layers.links) {
      const a = place(document.createElement("a"), l.box) as HTMLAnchorElement;
      if (l.url) Object.assign(a, { href: l.url, target: "_blank", rel: "noopener noreferrer nofollow", title: l.url });
      else if (l.page !== undefined) {
        a.href = "#";
        a.title = `Page ${l.page + 1}`;
        a.addEventListener("click", (e) => { e.preventDefault(); reader.goto(l.page! + 1, l.y ?? null); });
      }
      links.append(a);
    }
    for (const an of layers.annots) { const d = place(document.createElement("div"), an.box); d.dataset.annotationId = an.id; links.append(d); }
    v.linkEl.replaceChildren(links);
    paintFind(v);
    applyPending(v.n);
    emit("layers", v.n);
  }

  // ── find ─────────────────────────────────────────────────────────────────────────────────────────────────────
  let query = "", matches: Match[] = [], at = -1, searching: AbortController | null = null;
  function paintFind(v: PageView): void {
    if (!v.built) return;
    const mine = matches.map((m, i) => ({ m, i })).filter(({ m }) => m.page === v.n);
    if (!mine.length) { v.findEl.replaceChildren(); return; }
    void textOfPage(v.n).then(({ layers }) => {
      const frag = document.createDocumentFragment();
      for (const { m, i } of mine) for (const b of m.boxes) {
        const [x0, y0, x1, y1] = boxShown(layers.view, layers.rotate, b), d = document.createElement("div");
        d.style.cssText = `left:${pt(x0)};top:${pt(y0)};width:${pt(x1 - x0)};height:${pt(y1 - y0)}`;
        if (i === at) d.className = "selected";
        frag.append(d);
      }
      v.findEl.replaceChildren(frag);
    });
  }
  const repaintFind = () => { for (const v of views) if (v.built) paintFind(v); };
  const findCount = () => emit("find", { current: at + 1, total: matches.length });
  function showMatch(): void {
    const m = matches[at];
    if (!m) return;
    repaintFind();
    void textOfPage(m.page).then(({ layers }) => {
      const [, y0, , y1] = boxShown(layers.view, layers.rotate, m.boxes[0] ?? [0, 0, 0, 0]);
      const [, rh] = size(m.page, true), mid = (y0 + y1) / 2;
      // the match's height on the page, the reader's rotation aside (a turned page is rare enough to centre on its middle)
      const frac = turns ? 0.5 : mid / rh;
      container.scrollTop = tops[m.page - 1] + frac * heights[m.page - 1] - container.clientHeight / 2;
    });
    findCount();
  }

  // ── selections and passages ──────────────────────────────────────────────────────────────────────────────────
  /** Where a DOM point (`node`, `offset`) falls in the text: page and character. */
  function charPoint(node: Node, offset: number, end: boolean): { n: number; char: number } | null {
    const span = (node.nodeType === Node.TEXT_NODE ? node.parentElement : null) as HTMLElement | null;
    const hit = span && spanRun.get(span);
    if (hit) return { n: hit.n, char: charAt(hit.run, offset) };
    // a point between spans: the span after it (a start) or before it (an end)
    const el = node as Element, kids = el.childNodes ?? [];
    const pick = end ? [...kids].slice(0, offset).reverse() : [...kids].slice(offset);
    for (const k of pick) { const r = spanRun.get(k); if (r) return { n: r.n, char: end ? r.run.end : r.run.start }; }
    const page = (el.nodeType === Node.ELEMENT_NODE ? el : el.parentElement)?.closest<HTMLElement>(".page[data-page-number]");
    return page ? { n: Number(page.dataset.pageNumber), char: end ? Number.MAX_SAFE_INTEGER : 0 } : null;
  }
  let pending: { n: number; words: string; done: (ok: boolean) => void } | null = null;
  function applyPending(n: number): void {
    if (!pending || pending.n !== n) return;
    const p = pending;
    pending = null;
    void textOfPage(n).then((t) => {
      const r = findWords(t.shown, p.words);
      p.done(r ? selectChars(n, r[0], r[1]) : false);
    });
  }
  /** Selects characters `from`…`to` of page n in the DOM; whether its spans are there. */
  function selectChars(n: number, from: number, to: number): boolean {
    const v = views[n - 1];
    const spans = [...v.textEl.querySelectorAll("span")];
    const where = (char: number, end: boolean) => {
      for (const s of spans) {
        const { run } = spanRun.get(s)!;
        if (end ? char > run.start && char <= run.end : char >= run.start && char < run.end) {
          const off = run.units.findIndex((u) => u >= char);
          return { node: s.firstChild!, off: off < 0 ? run.text.length : off };
        }
      }
      return null;
    };
    const a = where(from, false), b = where(to, true);
    if (!a || !b) return false;
    const r = document.createRange();
    r.setStart(a.node, a.off);
    r.setEnd(b.node, b.off);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    (a.node.parentElement as HTMLElement).scrollIntoView({ block: "center" });
    return true;
  }

  const reader: Reader = {
    engine: eng.name,
    pages: info.pages,
    outline: info.outline,
    get page() { return current; },
    shown() {
      for (const v of views) if (v.canvas) v.drawnKey = "";
      update();
    },
    where() {
      if (turns || !views.length) return { page: current, y: null };
      const [, h] = size(current);
      return { page: current, y: Math.round((h - (container.scrollTop - tops[current - 1] + 10) / (scale * PX)) * 10) / 10 };
    },
    get scale() { return scale; },
    get zoom() { return zoom; },
    get rotation() { return turns * 90; },
    get spread() { return spread; },
    goto(n, y) {
      n = Math.max(1, Math.min(info.pages, Math.round(n)));
      const [, h] = size(n);
      const off = y !== null && y !== undefined && !turns ? Math.max(0, (h - y) * scale * PX - 10) : -12;
      container.scrollTop = tops[n - 1] + off;
      if (current !== n) { current = n; emit("page", n); }
      update();
    },
    setZoom(z) { zoom = z; rescale(scaleFor(z)); },
    zoomBy(f, origin) {
      zoom = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * f)) * 100) / 100;
      const r = container.getBoundingClientRect();
      rescale(zoom, origin ? origin.x - r.left : undefined, origin ? origin.y - r.top : undefined);
    },
    refit() {
      if (typeof zoom === "number") return;
      // first laid out with no size (a pane opened hidden): its scroll position is clamped to the end of a tiny layout
      // and means nothing — back to the page being read, which update() kept
      if (!fittedWidth) {
        const n = current;
        scale = scaleFor(zoom, n);
        layout();
        reader.goto(n);
        emit("scale", { scale, zoom });
        scheduleRedraw();
      } else rescale(scaleFor(zoom));
      fittedWidth = container.clientWidth;
    },
    rotate() {
      const n = current;
      turns = (turns + 1) % 4;
      layout();
      if (typeof zoom !== "number") scale = scaleFor(zoom);
      layout();
      reader.goto(n);
      emit("scale", { scale, zoom });
    },
    setSpread(on) {
      const n = current;
      spread = on;
      arrange();
      if (typeof zoom !== "number") scale = scaleFor(zoom);
      layout();
      reader.goto(n);
      emit("scale", { scale, zoom });
    },
    on(k, fn) {
      let set = handlers.get(k);
      if (!set) handlers.set(k, (set = new Set()));
      set.add(fn as never);
      return () => set!.delete(fn as never);
    },
    find(q, o = {}) {
      if (o.again && q === query && matches.length) {
        at = (at + (o.back ? -1 : 1) + matches.length) % matches.length;
        showMatch();
        return;
      }
      searching?.abort();
      query = q; matches = []; at = -1;
      repaintFind(); findCount();
      if (!q) return;
      const ctl = (searching = new AbortController()), from = current;
      void (async () => {
        for (let page: number | null = 1; page !== null && !ctl.signal.aborted;) {
          const r: Awaited<ReturnType<PdfEngine["find"]>> | null = await eng.find(path, q, page, false, ctl.signal).catch(() => null);
          if (!r || ctl.signal.aborted) return;
          matches.push(...r.matches);
          // the first match at or after the page being read is the one shown
          if (at < 0) { const i = matches.findIndex((m) => m.page >= from); if (i >= 0) { at = i; showMatch(); } }
          findCount();
          page = r.next;
        }
        if (!ctl.signal.aborted && at < 0 && matches.length) { at = 0; showMatch(); }
        repaintFind();
      })();
    },
    async selection() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return [];
      const r = sel.getRangeAt(0);
      if (!container.contains(r.commonAncestorContainer)) return [];
      const a = charPoint(r.startContainer, r.startOffset, false), b = charPoint(r.endContainer, r.endOffset, true);
      if (!a || !b || b.n < a.n) return [];
      const out: Selected[] = [];
      for (let n = a.n; n <= b.n; n++) {
        const { layers } = await textOfPage(n);
        const from = n === a.n ? a.char : 0, to = Math.min(layers.codes.length, n === b.n ? b.char : layers.codes.length);
        if (to > from) out.push({ page: n, from, to, text: textOf(layers, from, to) });
      }
      return out;
    },
    async selectWords(n, words) {
      if (!words.trim()) return false;
      const v = views[n - 1];
      if (!v) return false;
      if (v.built && v.textEl.childElementCount) {
        const t = await textOfPage(n), r = findWords(t.shown, words);
        return r ? selectChars(n, r[0], r[1]) : false;
      }
      return new Promise((done) => { pending = { n, words, done }; });
    },
    async flashAnnotation(n, id) {
      await textOfPage(n).catch(() => null);
      const el = views[n - 1]?.linkEl.querySelector<HTMLElement>(`[data-annotation-id="${id}"]`);
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      el.classList.remove("atlas-flash");
      void el.offsetWidth; // the animation again when the same link is followed twice
      el.classList.add("atlas-flash");
      return true;
    },
    pageAt(x, y) {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>(".page[data-page-number]");
      if (!el || !root.contains(el)) return null;
      const n = Number(el.dataset.pageNumber), r = el.getBoundingClientRect();
      const [ux, uy] = unturn(turns, r.width, r.height, x - r.left, y - r.top);
      return { n, X: ux / (scale * PX), Y: uy / (scale * PX) };
    },
    async toPagePoint(n, X, Y) { const { layers } = await textOfPage(n); return toPage(layers.view, layers.rotate, X, Y); },
    async quads(n, from, to) {
      const t = await textOfPage(n), { view, rotate } = t.layers;
      return lineBoxes(t.shown, t.runs, from, to).map(([x0, y0, x1, y1]) => {
        const [ax, ay] = toPage(view, rotate, x0, y0), [bx, by] = toPage(view, rotate, x1, y1);
        return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)] as Box;
      });
    },
    async view(n) { return (await textOfPage(n)).layers.view; },
    async space(n) { const { view, rotate } = (await textOfPage(n)).layers; return { view, rotate }; },
    async pieces(n) { return piecesOf((await textOfPage(n)).layers); },
    pageLayer(n) { return views[n - 1]?.layer ?? null; },
    destroy() {
      gone = true;
      searching?.abort();
      clearTimeout(redrawTimer); clearTimeout(detailTimer); cancelAnimationFrame(frame);
      container.removeEventListener("scroll", onScroll);
      for (const v of views) letGo(v);
      root.replaceChildren();
      handlers.clear();
    },
  };

  arrange();
  layout();
  scale = scaleFor(zoom, start.page ?? 1);
  layout();
  reader.goto(start.page ?? 1, start.y);
  fittedWidth = container.clientWidth;
  return reader;
}

