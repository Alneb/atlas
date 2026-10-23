// A drawing's linked document pages (memory project_paper_core.md): image elements with
// `customData.atlasPage = {file, page}` and no file stored — the phone's Notepad makes them (Figure.linkedPage, its
// fileId `atlas-page-…`). Here each page is drawn from the PDF with pdf.js and given to Excalidraw as a file in memory;
// serialize() leaves those files out, so the drawing on disk holds only what is on top.

import type { PdfDoc } from "./pdf"; // pdf.js loaded when a page is drawn (and this module testable without it)

/** A linked page's file id (the phone's PageSource.fileId): never saved. */
export const isLinkedFile = (id: string): boolean => id.startsWith("atlas-page-");

type El = { type: string; fileId?: string | null; isDeleted?: boolean; customData?: { atlasPage?: { file?: string; page?: number } } };
export type PageFile = { id: string; dataURL: string; mimeType: string; created: number };

/** The linked pages among `elements` not yet in `have`: `{ id, file, page }` each, once. */
export function missingPages(elements: readonly El[], have: Record<string, unknown>): { id: string; file: string; page: number }[] {
  const out = new Map<string, { id: string; file: string; page: number }>();
  for (const e of elements) {
    const at = e.customData?.atlasPage;
    if (e.isDeleted || e.type !== "image" || !e.fileId || !at?.file || have[e.fileId] || out.has(e.fileId)) continue;
    out.set(e.fileId, { id: e.fileId, file: at.file, page: Math.max(1, Number(at.page) || 1) });
  }
  return [...out.values()];
}

/** Page `page` of `doc` as a picture about `long` px on its long side. */
async function renderLinked(doc: PdfDoc, page: number, long = 1400): Promise<string> {
  const p = await doc.getPage(Math.min(page, doc.numPages));
  const base = p.getViewport({ scale: 1 });
  const viewport = p.getViewport({ scale: long / Math.max(base.width, base.height) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // a page is paper
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvas, viewport }).promise;
  try { return canvas.toDataURL("image/webp", 0.85); } finally { canvas.width = canvas.height = 0; }
}

/** Draws the missing linked pages one after another, handing each to `add` as it is ready (a long PDF shows its
 *  first pages at once). Errors are said once per file and the page stays an outline. */
export async function fillLinked(elements: readonly El[], have: Record<string, unknown>, add: (f: PageFile) => void): Promise<void> {
  const said = new Set<string>();
  const docs = new Map<string, Promise<PdfDoc>>(); // open for this fill only, closed after
  try {
    for (const m of missingPages(elements, have)) {
      try {
        if (!docs.has(m.file)) docs.set(m.file, import("./pdf").then((pdf) => pdf.openPdf(m.file)));
        add({ id: m.id, dataURL: await renderLinked(await docs.get(m.file)!, m.page), mimeType: "image/webp", created: Date.now() });
      } catch (e) {
        if (!said.has(m.file)) { said.add(m.file); console.warn(`linked pages: ${m.file} cannot be drawn`, e); }
      }
    }
  } finally {
    for (const d of docs.values()) void d.then(async (doc) => (await import("./pdf")).closePdf(doc), () => {});
  }
}
