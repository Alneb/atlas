// Local files as blob: URLs. /api/raw requires the x-atlas header, which <img src> cannot send,
// so images are fetched once with the header and cached as object URLs.
import { api } from "./api";
import { keepCapped } from "./capped";

const cache = new Map<string, Promise<string>>();
/** Files and thumbnails kept as blob: URLs: a session of browsing full-size pictures would otherwise hold them all. */
const KEPT = 400;

/** The cached URL of `key` (made the newest), else `make`'s, remembered; a failure is not remembered. */
function cached(key: string, make: () => Promise<string>): Promise<string> {
  let p = cache.get(key);
  if (!p) {
    p = make();
    p.catch(() => { if (cache.get(key) === p) cache.delete(key); });
  }
  keepCapped(cache, key, p, KEPT, forget);
  return p;
}
/** A URL no longer cached is freed later, not now: an <img> handed it a moment ago may still be loading it. */
function forget(p: Promise<string>): void {
  p.then((u) => {
    for (const [path, v] of ready) if (v === u) ready.delete(path);
    setTimeout(() => URL.revokeObjectURL(u), 30_000);
  }, () => {});
}

export function blobUrl(path: string): Promise<string> {
  return cached(path, () => api.raw(path).then((b) => URL.createObjectURL(b)));
}

/** A small version of an image (`/api/thumb`, downscaled + cached by the core) as a blob: URL.
 *  Galleries use this: full-size figures (10+ megapixels each) stall the WebView when decoded. */
export function thumbUrl(path: string, width = 320): Promise<string> {
  return cached(`${path}\u0000${width}`, () => api.thumb(path, width).then((b) => URL.createObjectURL(b)));
}

let pdfQueue: Promise<unknown> = Promise.resolve();

/** A PDF's first page as a picture (a blob: URL, `width` CSS px wide): a library's cover for a paper or a book that has
 *  only its PDF. The core's, kept in its cache; else drawn here (PDFium or pdf.js, loaded on first use), one PDF at a
 *  time so a shelf of them never opens dozens of documents at once; only the first page's bytes are read (by ranges). */
export function pdfThumbUrl(path: string, width = 260): Promise<string> {
  return cached(`${path}\u0000pdf${width}`, () => {
    const draw = async () => {
      const blob = await (await import("./pdf-pages")).pageBlob(path, 1, width, "image/jpeg");
      if (!blob) throw new Error("the page did not draw");
      return URL.createObjectURL(blob);
    };
    // the core's cover, drawn as the PDF arrived (thumbs.rs `pdf_cover`); drawn here (lib/pdf-pages.ts) only where
    // it has no PDF renderer (a phone's core), one at a time
    return api.thumb(path, width).then((b) => URL.createObjectURL(b), () => {
      const mine = pdfQueue.then(draw, draw);
      pdfQueue = mine.catch(() => {});
      return mine;
    });
  });
}

/** Synchronous peek for the live-preview resolver (null until the fetch has landed). */
const ready = new Map<string, string>();
export function blobUrlNow(path: string): string | null {
  return ready.get(path) ?? null;
}
export function warm(path: string): Promise<string> {
  return blobUrl(path).then((u) => (ready.set(path, u), u));
}

/** Drop every cached file (the page may have missed changes). */
export function invalidateAll(): void {
  for (const path of new Set([...ready.keys(), ...[...cache.keys()].map((k) => k.split("\u0000")[0])])) invalidate(path);
}

/** Drop a cached file (it changed on disk). */
export function invalidate(path: string): void {
  ready.delete(path);
  if (/\.pdf$/i.test(path)) void import("./pdf-pages").then((m) => m.forgetPdf(path));
  for (const [k, p] of cache) {
    if (k !== path && !k.startsWith(`${path}\u0000`)) continue; // the file and its thumbnails
    cache.delete(k);
    forget(p); // a pasted picture's own write: its <img> was handed the URL just before
  }
}

const TRANSPARENT = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
export const PLACEHOLDER = TRANSPARENT;

/** Fill every `img[data-src]` under `root` from the blob cache. */
export function hydrateImages(root: HTMLElement): Promise<unknown> {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>("img[data-src]"));
  return Promise.all(
    imgs.map((img) =>
      warm(img.dataset.src!).then(
        (u) => { img.src = u; },
        () => { img.classList.add("is-missing"); img.alt = `missing: ${img.dataset.src}`; },
      ),
    ),
  );
}
