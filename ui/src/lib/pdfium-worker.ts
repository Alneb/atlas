// PDFium (WebAssembly, EmbedPDF's build) in a worker: Atlas's default PDF engine (lib/pdf-engine.ts) — pages drawn for the reader, covers,
// thumbnails, previews and embeds, and a page's text, links and annotations, find, the outline.
// A document is read through a callback in 1 MB pieces fetched by synchronous range requests (allowed in a worker),
// so a 70 MB book's cover reads ~3 MB. Requests: lib/pdfium.ts. Places cross in PDF points, page space (y up).
import { init } from "@embedpdf/pdfium";
import wasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";

import type { Area, Box, DocInfo, Fit, Match, OutlineItem, PageLayers, PageLink } from "./pdf-engine";
export type { Area, Box, DocInfo, Fit, Match, OutlineItem, PageLayers, PageLink };

type Pdfium = Awaited<ReturnType<typeof init>>;
export type Request =
  | { id: number; op: "page"; url: string; page: number; px: number; fit: Fit }
  | { id: number; op: "area"; url: string; page: number; area: Area }
  | { id: number; op: "count"; url: string }
  | { id: number; op: "info"; url: string }
  | { id: number; op: "layers"; url: string; page: number }
  | { id: number; op: "find"; url: string; query: string; from: number; caseSensitive: boolean }
  | { id: number; op: "drop"; url: string }
  | { id: number; op: "cancel"; target: number };
export type Reply =
  | { id: number; w: number; h: number; pages: number; rgba: ArrayBuffer }
  | { id: number; info: DocInfo }
  | { id: number; layers: PageLayers }
  | { id: number; matches: Match[]; next: number | null }
  | { id: number; pages: number }
  | { id: number; error: string };

const CHUNK = 1 << 20;
const IDLE_MS = 30_000; // a document unused this long is closed (its pieces freed)
const FPDF_ANNOT = 0x01, FPDF_REVERSE_BYTE_ORDER = 0x10; // draw annotations; RGBA instead of BGRA

let P: Pdfium;
// Emscripten's heap view; the package's typings leave it out (they lean on @types/emscripten)
const heap = (): Uint8Array => (P.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;
const ready: Promise<void> = (async () => {
  const wasmBinary = await (await fetch(wasmUrl)).arrayBuffer();
  P = await init({ wasmBinary });
  P.PDFiumExt_Init();
})();

/** One open document: its PDFium handle, its reader callback and the pieces read so far. */
interface Doc { handle: number; access: number; reader: number; pages: number; idle?: ReturnType<typeof setTimeout> }
const docs = new Map<string, Doc>();

/** Synchronous GET of a byte range; also learns the file's length. A 200 (no range support) is the whole file. */
function fetchRange(url: string, from: number, to: number): { bytes: Uint8Array; size: number } {
  const x = new XMLHttpRequest();
  x.open("GET", url, false);
  x.setRequestHeader("x-atlas", "1");
  x.setRequestHeader("Range", `bytes=${from}-${to}`);
  x.responseType = "arraybuffer";
  x.send();
  if (x.status !== 200 && x.status !== 206) throw new Error(`HTTP ${x.status} reading the PDF`);
  const bytes = new Uint8Array(x.response as ArrayBuffer);
  const total = Number(/\/(\d+)$/.exec(x.getResponseHeader("Content-Range") ?? "")?.[1]);
  return { bytes: x.status === 200 ? bytes.subarray(from, to + 1) : bytes, size: x.status === 200 ? bytes.length : total };
}

function open(url: string): Doc {
  const known = docs.get(url);
  if (known) return known;
  const M = P.pdfium;
  const pieces = new Map<number, Uint8Array>();
  const first = fetchRange(url, 0, CHUNK - 1);
  if (!(first.size > 0)) throw new Error("the PDF's length is unknown");
  pieces.set(0, first.bytes);
  const size = first.size;
  const piece = (i: number) => {
    let c = pieces.get(i);
    if (!c) pieces.set(i, (c = fetchRange(url, i * CHUNK, Math.min(size, (i + 1) * CHUNK) - 1).bytes));
    return c;
  };
  // int GetBlock(void* param, unsigned long position, unsigned char* buf, unsigned long size)
  const reader = M.addFunction((_param: number, pos: number, buf: number, len: number) => {
    try {
      pos >>>= 0; buf >>>= 0; len >>>= 0;
      for (let done = 0; done < len;) {
        const at = pos + done, c = piece(Math.floor(at / CHUNK)), off = at % CHUNK, n = Math.min(len - done, c.length - off);
        if (n <= 0) return 0;
        heap().set(c.subarray(off, off + n), buf + done);
        done += n;
      }
      return 1;
    } catch { return 0; }
  }, "iiiii");
  // FPDF_FILEACCESS { unsigned long m_FileLen; GetBlock*; void* m_Param } — 32-bit fields in wasm32
  const access = M.wasmExports.malloc(12);
  M.setValue(access, size, "i32");
  M.setValue(access + 4, reader, "i32");
  M.setValue(access + 8, 0, "i32");
  const handle = P.FPDF_LoadCustomDocument(access, "");
  if (!handle) {
    M.removeFunction(reader); M.wasmExports.free(access);
    throw new Error(`PDFium could not open the PDF (error ${P.FPDF_GetLastError()})`);
  }
  const doc: Doc = { handle, access, reader, pages: P.FPDF_GetPageCount(handle) };
  docs.set(url, doc);
  return doc;
}

function close(url: string): void {
  const d = docs.get(url);
  if (!d) return;
  docs.delete(url);
  clearTimeout(d.idle);
  P.FPDF_CloseDocument(d.handle);
  P.pdfium.removeFunction(d.reader);
  P.pdfium.wasmExports.free(d.access);
}

function touch(url: string, d: Doc): void {
  clearTimeout(d.idle);
  d.idle = setTimeout(() => close(url), IDLE_MS);
}

/** Page `index` (0-based) placed by `area` on white, as RGBA. */
function draw(d: Doc, index: number, area: (pw: number, ph: number) => Area): { w: number; h: number; rgba: ArrayBuffer } {
  const page = P.FPDF_LoadPage(d.handle, index);
  if (!page) throw new Error(`page ${index + 1} did not load`);
  try {
    const { bw: w, bh: h, x, y, fw, fh, rotate } = area(P.FPDF_GetPageWidthF(page), P.FPDF_GetPageHeightF(page));
    const bmp = P.FPDFBitmap_Create(w, h, 1);
    try {
      P.FPDFBitmap_FillRect(bmp, 0, 0, w, h, 0xffffffff);
      P.FPDF_RenderPageBitmap(bmp, page, Math.round(x), Math.round(y), Math.round(fw), Math.round(fh), rotate & 3, FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER);
      const at = P.FPDFBitmap_GetBuffer(bmp), stride = P.FPDFBitmap_GetStride(bmp);
      const rgba = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) rgba.set(heap().subarray(at + y * stride, at + y * stride + w * 4), y * w * 4);
      return { w, h, rgba: rgba.buffer };
    } finally { P.FPDFBitmap_Destroy(bmp); }
  } finally { P.FPDF_ClosePage(page); }
}

// ── text, links, annotations, find, outline ──────────────────────────────────────────────────────────────────────

/** `bytes` of scratch memory for `use`, freed after. */
function scratch<T>(bytes: number, use: (at: number) => T): T {
  const at = P.pdfium.wasmExports.malloc(bytes);
  try { return use(at); } finally { P.pdfium.wasmExports.free(at); }
}
const f32 = (at: number, n: number) => Array.from(new Float32Array(heap().buffer, at, n));
const f64 = (at: number, n: number) => Array.from(new Float64Array(heap().buffer, at, n));
/** An FS_RECTF (left, top, right, bottom) read as a Box. */
const rectBox = (at: number): Box => { const [l, t, r, b] = f32(at, 4); return [Math.min(l, r), Math.min(t, b), Math.max(l, r), Math.max(t, b)]; };
/** A UTF-16LE string PDFium writes into a buffer it sizes by a first call (`get(buffer, bytes)` → bytes needed). */
function utf16(get: (buf: number, len: number) => number): string {
  const need = get(0, 0);
  if (need <= 2) return "";
  return scratch(need, (at) => { get(at, need); return P.pdfium.UTF16ToString(at); });
}
/** A NUL-ended byte string (a URI is 7-bit ASCII), sized the same way. */
function ascii(get: (buf: number, len: number) => number): string {
  const need = get(0, 0);
  if (need <= 1) return "";
  return scratch(need, (at) => { get(at, need); return new TextDecoder().decode(heap().slice(at, at + need - 1)); });
}

function withPage<T>(d: Doc, index: number, use: (page: number) => T): T {
  const page = P.FPDF_LoadPage(d.handle, index);
  if (!page) throw new Error(`page ${index + 1} did not load`);
  try { return use(page); } finally { P.FPDF_ClosePage(page); }
}
function withText<T>(page: number, use: (text: number) => T): T {
  const text = P.FPDFText_LoadPage(page);
  if (!text) throw new Error("the page's text did not load");
  try { return use(text); } finally { P.FPDFText_ClosePage(text); }
}

/** A destination's page (0-based) and height on it, in points (null: not given). */
function destOf(d: Doc, dest: number): { page: number; y: number | null } | null {
  if (!dest) return null;
  const page = P.FPDFDest_GetDestPageIndex(d.handle, dest);
  if (page < 0) return null;
  // FPDFDest_GetLocationInPage(dest, &hasX, &hasY, &hasZoom, &x, &y, &zoom): three ints then three floats
  const y = scratch(24, (at) => {
    if (!P.FPDFDest_GetLocationInPage(dest, at, at + 4, at + 8, at + 12, at + 16, at + 20)) return null;
    return new Int32Array(heap().buffer, at, 3)[1] ? f32(at + 16, 1)[0] : null;
  });
  return { page, y };
}
const ACTION_GOTO = 1, ACTION_URI = 3;
/** Where an action goes: a page of this document or a web address. */
function actionOf(d: Doc, action: number): { page?: number; y?: number | null; url?: string } | null {
  if (!action) return null;
  const type = P.FPDFAction_GetType(action);
  if (type === ACTION_GOTO) return destOf(d, P.FPDFAction_GetDest(d.handle, action));
  if (type === ACTION_URI) { const url = ascii((b, n) => P.FPDFAction_GetURIPath(d.handle, action, b, n)); return url ? { url } : null; }
  return null;
}

const OUTLINE_MOST = 5000; // a malformed outline may loop
function info(d: Doc): DocInfo {
  const sizes: number[] = [];
  scratch(8, (at) => {
    for (let i = 0; i < d.pages; i++) {
      // FS_SIZEF (width, height), the page's /Rotate applied
      if (P.FPDF_GetPageSizeByIndexF(d.handle, i, at)) sizes.push(...f32(at, 2)); else sizes.push(612, 792);
    }
  });
  const outline: OutlineItem[] = [];
  const walk = (parent: number, depth: number) => {
    for (let b = P.FPDFBookmark_GetFirstChild(d.handle, parent); b && outline.length < OUTLINE_MOST; b = P.FPDFBookmark_GetNextSibling(d.handle, b)) {
      const to = destOf(d, P.FPDFBookmark_GetDest(d.handle, b)) ?? actionOf(d, P.FPDFBookmark_GetAction(b));
      outline.push({ title: utf16((buf, n) => P.FPDFBookmark_GetTitle(b, buf, n)).trim(), depth, page: to?.page ?? null, y: to?.y ?? null });
      walk(b, depth + 1);
    }
  };
  walk(0, 0);
  return { pages: d.pages, sizes, outline };
}

const ANNOT_LINK = 2, ANNOT_POPUP = 16;
function layers(d: Doc, index: number): PageLayers {
  return withPage(d, index, (page) => {
    const view = scratch(16, (at) => (P.FPDF_GetPageBoundingBox(page, at) ? rectBox(at) : ([0, 0, P.FPDF_GetPageWidthF(page), P.FPDF_GetPageHeightF(page)] as Box)));
    const rotate = P.FPDFPage_GetRotation(page) & 3;
    const links: PageLink[] = [];
    const { codes, boxes, generated } = withText(page, (text) => {
      const n = Math.max(0, P.FPDFText_CountChars(text));
      const codes = new Uint32Array(n), boxes = new Float32Array(n * 4), generated = new Uint8Array(n);
      scratch(16, (at) => {
        for (let i = 0; i < n; i++) {
          codes[i] = P.FPDFText_GetUnicode(text, i);
          generated[i] = P.FPDFText_IsGenerated(text, i) === 1 ? 1 : 0;
          if (P.FPDFText_GetLooseCharBox(text, i, at)) boxes.set(rectBox(at), i * 4);
        }
      });
      // addresses written as text (not link annotations), as a browser's PDF viewer links them
      const web = P.FPDFLink_LoadWebLinks(text);
      if (web) {
        try {
          scratch(32, (at) => {
            for (let i = 0, k = P.FPDFLink_CountWebLinks(web); i < k; i++) {
              const url = utf16((b, len) => P.FPDFLink_GetURL(web, i, b, len / 2) * 2);
              for (let r = 0, rs = P.FPDFLink_CountRects(web, i); r < rs && url; r++) {
                if (!P.FPDFLink_GetRect(web, i, r, at, at + 8, at + 16, at + 24)) continue;
                const [l, t, rr, b] = f64(at, 4);
                links.push({ box: [Math.min(l, rr), Math.min(t, b), Math.max(l, rr), Math.max(t, b)], url });
              }
            }
          });
        } finally { P.FPDFLink_CloseWebLinks(web); }
      }
      return { codes, boxes, generated };
    });
    // link annotations: FPDFLink_Enumerate(page, &start, &link)
    scratch(24, (at) => {
      new Int32Array(heap().buffer, at, 1)[0] = 0;
      while (P.FPDFLink_Enumerate(page, at, at + 4)) {
        const link = new Int32Array(heap().buffer, at + 4, 1)[0];
        if (!link || !P.FPDFLink_GetAnnotRect(link, at + 8)) continue;
        const to = destOf(d, P.FPDFLink_GetDest(d.handle, link)) ?? actionOf(d, P.FPDFLink_GetAction(link));
        if (to) links.push({ box: rectBox(at + 8), ...to });
      }
    });
    // the PDF's own annotations, by pdf.js's id (object number + "R"), which `#annotation=` links name
    const annots: { id: string; box: Box }[] = [];
    scratch(16, (at) => {
      for (let i = 0, k = P.FPDFPage_GetAnnotCount(page); i < k; i++) {
        const a = P.FPDFPage_GetAnnot(page, i);
        if (!a) continue;
        try {
          const kind = P.FPDFAnnot_GetSubtype(a), obj = P.EPDFAnnot_GetObjectNumber(a);
          if (kind !== ANNOT_LINK && kind !== ANNOT_POPUP && obj > 0 && P.FPDFAnnot_GetRect(a, at)) annots.push({ id: `${obj}R`, box: rectBox(at) });
        } finally { P.FPDFPage_CloseAnnot(a); }
      }
    });
    return { view, rotate, codes, boxes, generated, links, annots };
  });
}

const FIND_MATCH_CASE = 1, FIND_BUDGET_MS = 120;
/** Matches of `query` from page `from` on, for about FIND_BUDGET_MS; `next`: the page to go on from (null: done). */
function find(d: Doc, query: string, from: number, caseSensitive: boolean): { matches: Match[]; next: number | null } {
  const matches: Match[] = [];
  if (!query) return { matches, next: null };
  const t0 = performance.now();
  const bytes = (query.length + 1) * 2;
  return scratch(bytes, (q) => {
    P.pdfium.stringToUTF16(query, q, bytes);
    let i = from;
    for (; i < d.pages; i++) {
      if (i > from && performance.now() - t0 > FIND_BUDGET_MS) return { matches, next: i };
      withPage(d, i, (page) => withText(page, (text) => {
        const h = P.FPDFText_FindStart(text, q, caseSensitive ? FIND_MATCH_CASE : 0, 0);
        if (!h) return;
        try {
          scratch(32, (at) => {
            while (P.FPDFText_FindNext(h)) {
              const start = P.FPDFText_GetSchResultIndex(h), count = P.FPDFText_GetSchCount(h), boxes: Box[] = [];
              for (let r = 0, rs = P.FPDFText_CountRects(text, start, count); r < rs; r++) {
                if (!P.FPDFText_GetRect(text, r, at, at + 8, at + 16, at + 24)) continue;
                const [l, t, rr, b] = f64(at, 4);
                boxes.push([Math.min(l, rr), Math.min(t, b), Math.max(l, rr), Math.max(t, b)]);
              }
              matches.push({ page: i, start, count, boxes });
            }
          });
        } finally { P.FPDFText_FindClose(h); }
      }));
    }
    return { matches, next: null };
  });
}

/** The whole page `px` px wide (or on its longer side), unturned. */
const fitArea = (px: number, fit: Fit) => (pw: number, ph: number): Area => {
  const scale = px / (fit === "long" ? Math.max(pw, ph) : pw);
  const w = Math.max(1, Math.round(pw * scale)), h = Math.max(1, Math.round(ph * scale));
  return { bw: w, bh: h, x: 0, y: 0, fw: w, fh: h, rotate: 0 };
};

function serve(m: Exclude<Request, { op: "drop" | "cancel" }>): void {
  try {
    const d = open(m.url);
    touch(m.url, d);
    if (m.op === "count") { postMessage({ id: m.id, pages: d.pages } satisfies Reply); return; }
    if (m.op === "info") { postMessage({ id: m.id, info: info(d) } satisfies Reply); return; }
    if (m.op === "find") { postMessage({ id: m.id, ...find(d, m.query, m.from, m.caseSensitive) } satisfies Reply); return; }
    if (m.op === "layers") {
      const l = layers(d, Math.min(Math.max(0, m.page), d.pages - 1));
      postMessage({ id: m.id, layers: l } satisfies Reply, { transfer: [l.codes.buffer, l.boxes.buffer, l.generated.buffer] });
      return;
    }
    const index = Math.min(Math.max(0, m.page), d.pages - 1); // past the end: the last page
    const out = draw(d, index, m.op === "area" ? () => m.area : fitArea(m.px, m.fit));
    postMessage({ id: m.id, pages: d.pages, ...out } satisfies Reply, { transfer: [out.rgba] });
  } catch (e) {
    postMessage({ id: m.id, error: String((e as Error)?.message ?? e) } satisfies Reply);
  }
}

// Requests wait in a queue served one per task, so a "cancel" (a page scrolled away) arrives before its page is drawn.
const queue: Exclude<Request, { op: "drop" | "cancel" }>[] = [];
let pumping = false;
function pump(): void {
  const m = queue.shift();
  if (!m) { pumping = false; return; }
  serve(m);
  setTimeout(pump, 0);
}

onmessage = async ({ data: m }: MessageEvent<Request>) => {
  if (m.op === "cancel") {
    const i = queue.findIndex((q) => q.id === m.target);
    if (i >= 0) postMessage({ id: m.target, error: "cancelled" } satisfies Reply), queue.splice(i, 1);
    return;
  }
  await ready.catch(() => {});
  if (m.op === "drop") { close(m.url); return; }
  queue.push(m);
  if (!pumping) { pumping = true; setTimeout(pump, 0); }
};
