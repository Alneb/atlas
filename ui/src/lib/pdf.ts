// pdf.js wiring: local worker + offline cMaps/fonts/wasm served by the app under /pdfjs/.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "./api";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDoc = pdfjs.PDFDocumentProxy;
export type PdfPage = pdfjs.PDFPageProxy;

const asset = (d: string) => new URL(`pdfjs/${d}/`, document.baseURI).toString();

// One worker for every document, never ended: by default each document starts a worker of its own, and WebKit did not
// give back an ended worker's JavaScript heap (decisions/PERFORMANCE.md, "The long day in WebKit"); a live one reuses it.
let worker: pdfjs.PDFWorker | null = null;
const sharedWorker = () => (worker && !worker.destroyed ? worker : (worker = new pdfjs.PDFWorker()));

export function openPdf(path: string): Promise<PdfDoc> {
  return pdfjs.getDocument({
    worker: sharedWorker(),
    url: api.rawUrl(path),
    httpHeaders: { "x-atlas": "1" },
    // by pieces (the core answers HTTP ranges): page 1 of a 70 MB book needs a few hundred kB, not the whole file
    // first — 6 s → see docs/guides/ZOTERO.md "Speed". The rest is read as pages are reached (saving reads it all).
    disableStream: true,
    disableAutoFetch: true,
    rangeChunkSize: 1 << 20, // 1 MB pieces: a scanned book's first page took 81 round trips at pdf.js's 64 kB
    cMapUrl: asset("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: asset("standard_fonts"),
    wasmUrl: asset("wasm"),
    iccUrl: asset("iccs"),
  }).promise;
}

/** `path` opened for `use` and closed after: a document left open keeps its pages and its worker's copy all day. */
export async function withPdf<T>(path: string, use: (doc: PdfDoc) => Promise<T>): Promise<T> {
  const doc = await openPdf(path);
  try { return await use(doc); } finally { void doc.loadingTask.destroy(); }
}

/** A PDF's first page as an image `width` CSS px wide; the canvas is freed at once (WebKit keeps a dropped one drawn). */
export function firstPageBlob(path: string, width: number, type: string, quality = 0.85): Promise<Blob | null> {
  return withPdf(path, async (doc) => {
    const page = await doc.getPage(1), canvas = document.createElement("canvas");
    try {
      await renderPage(page, canvas, width / page.getViewport({ scale: 1 }).width);
      return await new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, quality));
    } finally { canvas.width = canvas.height = 0; }
  });
}

// Rendered page thumbnails, by document (PdfThumbs.svelte): the panel shown again draws them at once. Closed with the
// document (pdf-viewer.ts destroy), since an ImageBitmap's pixels outlive their last reference until a collection.
const thumbs = new WeakMap<object, Map<number, ImageBitmap>>();
export function thumbCache(doc: PdfDoc): Map<number, ImageBitmap> {
  let m = thumbs.get(doc);
  if (!m) thumbs.set(doc, (m = new Map()));
  return m;
}
export function dropThumbCache(doc: PdfDoc): void {
  thumbs.get(doc)?.forEach((b) => b.close());
  thumbs.delete(doc);
}

/** Render `page` into `canvas` at `scale` CSS px per PDF pt, sharp on HiDPI. */
export async function renderPage(page: PdfPage, canvas: HTMLCanvasElement, scale: number): Promise<void> {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const viewport = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
}
