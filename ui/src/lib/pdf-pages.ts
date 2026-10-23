// A PDF page as a picture, for covers, thumbnails, previews and embedded pages, by the engine Settings chose
// (lib/pdf-engine.ts). The reader asks its own engine (lib/pdf-reader.ts).
import { dropEverywhere, engine, type EngineName, type Fit } from "./pdf-engine";

/** Device pixels per CSS px, capped: a page drawn sharp on HiDPI without 4K canvases. */
export const dpr = (): number => Math.min(window.devicePixelRatio || 1, 3);

/** Page `page` (1-based) of `path`, `px` device pixels wide (or on its longer side), on white. */
export async function pageBitmap(path: string, page: number, px: number, fit: Fit = "width", by?: EngineName): Promise<ImageBitmap> {
  return (await engine(by)).page(path, page, px, fit);
}

/** The bitmap encoded (`image/jpeg`, `image/webp`…); the bitmap is closed. */
export async function bitmapBlob(b: ImageBitmap, type: string, quality = 0.85): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = b.width;
  canvas.height = b.height;
  canvas.getContext("2d")!.drawImage(b, 0, 0);
  b.close();
  try { return await new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, quality)); } finally { canvas.width = canvas.height = 0; }
}

/** A page as an encoded image `width` CSS px wide (a cover, a file's thumbnail). */
export async function pageBlob(path: string, page: number, width: number, type: string, quality = 0.85): Promise<Blob | null> {
  return bitmapBlob(await pageBitmap(path, page, width * dpr()), type, quality);
}

/** A bitmap drawn into `canvas` at its own size, then closed unless `keep` (a cache holds it). */
export function paint(canvas: HTMLCanvasElement, b: ImageBitmap, keep = false): void {
  canvas.width = b.width;
  canvas.height = b.height;
  canvas.getContext("2d")!.drawImage(b, 0, 0);
  if (!keep) b.close();
}

// The reader's page thumbnails (components/PdfThumbs.svelte), by PDF and engine: the panel shown again draws them at
// once. Two documents' worth are kept; a changed file loses its own.
const thumbs = new Map<string, Map<number, ImageBitmap>>();
const THUMB_DOCS = 2;
const thumbKey = (path: string, by: EngineName) => `${by}\n${path}`;
export function thumbCache(path: string, by: EngineName): Map<number, ImageBitmap> {
  const key = thumbKey(path, by);
  let m = thumbs.get(key);
  if (m) { thumbs.delete(key); thumbs.set(key, m); return m; } // the most recent last
  thumbs.set(key, (m = new Map()));
  for (const [p, old] of thumbs) { if (thumbs.size <= THUMB_DOCS) break; old.forEach((b) => b.close()); thumbs.delete(p); }
  return m;
}

/** Forget what the engines hold of `path` (it changed on disk). */
export function forgetPdf(path: string): void {
  if (!/\.pdf$/i.test(path)) return;
  for (const by of ["pdfium", "pdfjs"] as const) {
    thumbs.get(thumbKey(path, by))?.forEach((b) => b.close());
    thumbs.delete(thumbKey(path, by));
  }
  dropEverywhere(path);
}
