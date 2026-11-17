// Where each PDF was left in the reader (page, height on it, zoom): a per-viewer convenience in browser storage,
// written by the reader (panes/Pdf.svelte) and read by whatever shows a PDF "as last seen" (a tab's hover card).
import { load } from "./prefs";

/** `t`: when it was left there (ms), against the note's `last_read` (lib/pdf-reading.ts). */
export type PdfPosition = { page?: number; y?: number | null; scale?: string; t?: number };

export const pdfPosKey = (path: string): string => `atlas.pdf.pos:${path}`;

export function pdfPosition(path: string): PdfPosition {
  try { return load<PdfPosition>(pdfPosKey(path), {}); } catch { return {}; }
}
