// The PDFium worker (lib/pdfium-worker.ts) seen from the page: one worker for every PDF, ended a minute after its
// last request (WebKit gives a worker's heap back only when it ends). Pictures go through lib/pdf-pages.ts; the
// reader (lib/pdf-reader.ts) asks for pages, text, links and find here.
import { api } from "./api";
import type { Area, DocInfo, Fit, Match, PageLayers } from "./pdf-engine";
import type { Reply, Request } from "./pdfium-worker";

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never; // Omit, kept per union member
type Ask = Without<Request, "id">;

const IDLE_MS = 60_000;
let worker: Worker | null = null;
let next = 1, idle: ReturnType<typeof setTimeout> | undefined;
const waiting = new Map<number, { ok: (r: Reply) => void; fail: (e: Error) => void }>();

function start(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./pdfium-worker.ts", import.meta.url), { type: "module" });
  w.onmessage = ({ data }: MessageEvent<Reply>) => {
    const p = waiting.get(data.id);
    waiting.delete(data.id);
    if (!p) return;
    if ("error" in data) p.fail(new Error(data.error)); else p.ok(data);
    if (!waiting.size) { clearTimeout(idle); idle = setTimeout(stop, IDLE_MS); }
  };
  // the wasm failed to load, or the worker died: every request still waiting fails (and falls back)
  w.onerror = (e) => { e.preventDefault(); const err = new Error(`the PDFium worker failed: ${e.message}`); stop(); fail(err); };
  return (worker = w);
}
function stop(): void { worker?.terminate(); worker = null; }
function fail(e: Error): void { for (const p of waiting.values()) p.fail(e); waiting.clear(); }

/** Sends `m`; `signal` withdraws it while it still waits in the worker's queue (the reply is then an error). */
function ask(m: Ask, signal?: AbortSignal): Promise<Reply> {
  clearTimeout(idle);
  const w = start(), id = next++;
  signal?.addEventListener("abort", () => worker?.postMessage({ op: "cancel", target: id, id: 0 } satisfies Request), { once: true });
  return new Promise((ok, fail) => { waiting.set(id, { ok, fail }); w.postMessage({ ...m, id }); });
}

const toBitmap = (r: Reply): Promise<ImageBitmap> => {
  if (!("rgba" in r)) throw new Error("PDFium sent no page");
  return createImageBitmap(new ImageData(new Uint8ClampedArray(r.rgba), r.w, r.h));
};

// the worker resolves URLs against its own script: an absolute one, the same file whatever the worker's address
const fileUrl = (path: string) => new URL(api.rawUrl(path), document.baseURI).href;

/** Page `page` (1-based) of `path` as an ImageBitmap `px` device pixels wide, or on its longer side. */
export async function pdfiumPage(path: string, page: number, px: number, fit: Fit = "width"): Promise<{ bitmap: ImageBitmap; pages: number }> {
  const r = await ask({ op: "page", url: fileUrl(path), page: page - 1, px, fit });
  return { bitmap: await toBitmap(r), pages: "pages" in r ? r.pages : 0 };
}

/** Page `page` (1-based) of `path` placed by `area` (the reader's canvas, or a zoomed tile of it). */
export async function pdfiumArea(path: string, page: number, area: Area, signal?: AbortSignal): Promise<ImageBitmap> {
  return toBitmap(await ask({ op: "area", url: fileUrl(path), page: page - 1, area }, signal));
}


/** The document's page sizes and outline. */
export async function pdfiumInfo(path: string): Promise<DocInfo> {
  const r = await ask({ op: "info", url: fileUrl(path) });
  if (!("info" in r)) throw new Error("PDFium sent no document");
  return r.info;
}

/** Page `page` (1-based)'s text, links and annotations. */
export async function pdfiumLayers(path: string, page: number, signal?: AbortSignal): Promise<PageLayers> {
  const r = await ask({ op: "layers", url: fileUrl(path), page: page - 1 }, signal);
  if (!("layers" in r)) throw new Error("PDFium sent no text");
  return r.layers;
}

/** Matches of `query` from page `from` (1-based) on, a few pages' worth; `next`: where to go on (null: the end). Pages
 *  in the answer are 1-based. */
export async function pdfiumFind(path: string, query: string, from: number, caseSensitive: boolean, signal?: AbortSignal): Promise<{ matches: Match[]; next: number | null }> {
  const r = await ask({ op: "find", url: fileUrl(path), query, from: from - 1, caseSensitive }, signal);
  if (!("matches" in r)) throw new Error("PDFium sent no matches");
  return { matches: r.matches.map((m) => ({ ...m, page: m.page + 1 })), next: r.next === null ? null : r.next + 1 };
}

/** Forget `path`'s open document (the file changed): the next request reads it again. */
export function pdfiumDrop(path: string): void {
  if (worker) worker.postMessage({ op: "drop", url: fileUrl(path), id: 0 } satisfies Request);
}
