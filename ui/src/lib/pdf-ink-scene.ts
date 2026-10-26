// A PDF's older companion drawing (`x.pdf.excalidraw`) as data, read when its marks move into the PDF's note
// (lib/pdf-ink-to-marks.ts, lib/pdf-migrate.ts). Atlas no longer writes these drawings. No I/O here.

/** Page number → the ids of its frame and of the PDF's picture in it, from the drawing's `atlasPage` pictures. */
export function pageFrames(elements: readonly { id: string; type: string; frameId?: string | null; isDeleted?: boolean; customData?: unknown }[]): Map<number, { frame: string; picture: string }> {
  const out = new Map<number, { frame: string; picture: string }>();
  for (const e of elements) {
    const n = (e.customData as { atlasPage?: { page?: number } } | undefined)?.atlasPage?.page;
    if (e.isDeleted || e.type !== "image" || !n || !e.frameId) continue;
    out.set(n, { frame: e.frameId, picture: e.id });
  }
  return out;
}

export type El = Record<string, unknown> & { id: string; type: string; x?: number; y?: number; width?: number; height?: number; isDeleted?: boolean };
