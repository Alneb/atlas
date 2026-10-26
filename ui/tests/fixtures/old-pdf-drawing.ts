// An older PDF companion drawing (`x.pdf.excalidraw`) built for the migration's tests: Atlas no longer writes these,
// it only reads them back as the PDF's marks (lib/pdf-ink-to-marks.ts, lib/pdf-migrate.ts). The layout is the Boox's
// (InkStore.java `addPage`: four pages a row, A4's width); marks are pdf.js's serialized editors.
import { markId, quoteOf, type AtlasMark, type Quad, type TextPiece } from "../../src/lib/atlas-mark";
import type { El } from "../../src/lib/pdf-ink-scene";

/** InkStore.java's layout, so a page added here sits where the Boox would have put it. */
const PAGE_W = 794, PAGE_H = 1123, GAP = 48, PER_ROW = 4;

/** A pdf.js editor's mark as it serializes it (`annotationStorage.serializable`): 3 free text, 9 highlight, 15 ink. */
export type Mark = {
  annotationType: number; pageIndex: number; color?: number[]; opacity?: number; thickness?: number; id?: string | null;
  paths?: { points?: ArrayLike<number>[]; pressures?: ArrayLike<number>[] }; quadPoints?: ArrayLike<number>; value?: string; fontSize?: number; rect?: number[];
};
/** A page's box in PDF points (`page.view`: x0, y0, x1, y1). */
export type PageBox = [number, number, number, number];

/** Java's `String.hashCode`, for the page picture's file id the Boox gives it (PageSource.java `fileId`). */
export function javaHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

const hex = (c: number[] | undefined, fallback: string) => (c && c.length >= 3 ? `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}` : fallback);
const uid = (kind: string) => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const base = (type: string, id: string, x: number, y: number, w: number, h: number, frameId: string | null): El => ({
  id, type, x, y, width: w, height: h, angle: 0, strokeColor: "#000000", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1,
  strokeStyle: "solid", roughness: 0, opacity: 100, groupIds: [], frameId, roundness: null, seed: Math.floor(Math.random() * 2 ** 31),
  version: 1, versionNonce: Math.floor(Math.random() * 2 ** 31), isDeleted: false, boundElements: null, updated: Date.now(), link: null, locked: false,
});

/** Page n (1-based) of `pdf` put into `els` in the grid's first free place, as InkStore.java `addPage`: its frame and the
 *  page's picture, linked to the PDF, never stored. Its frame. */
export function addPageFrame(els: El[], pdf: string, n: number, box: PageBox): El {
  const [x0, y0, x1, y1] = box;
  const h = x1 > x0 && y1 > y0 ? (PAGE_W * (y1 - y0)) / (x1 - x0) : PAGE_H;
  const taken = els.filter((e) => e.type === "frame" && !e.isDeleted).map((e) => [e.x!, e.y!, e.x! + e.width!, e.y! + e.height!]);
  let x = 0, y = 0;
  for (let k = 0; ; k++) {
    x = (k % PER_ROW) * (PAGE_W + GAP); y = Math.floor(k / PER_ROW) * (PAGE_H + GAP);
    if (!taken.some((r) => x - GAP / 2 < r[2] && x + PAGE_W + GAP / 2 > r[0] && y - GAP / 2 < r[3] && y + h + GAP / 2 > r[1])) break;
  }
  const stamp = `${Date.now().toString(36)}-${n}`, name = pdf.split("/").pop()!;
  const frame = { ...base("frame", `page-${stamp}`, x, y, PAGE_W, h, null), name: `Page ${n}`, strokeColor: "#bbb", locked: true };
  const picture = {
    ...base("image", `picture-${stamp}`, x, y, PAGE_W, h, frame.id), fileId: `atlas-page-${(javaHash(pdf) >>> 0).toString(16)}-${n}`, status: "saved",
    scale: [1, 1], crop: null, customData: { atlasPage: { file: pdf, page: n } }, link: `[[${name}#page=${n}]]`, locked: true,
  };
  els.push(frame, picture);
  return frame;
}

/** The marks as elements over their pages' frames (`frames`: page n → its frame), PDF points to the frame's units; each
 *  mark's elements carry its `atlasMark` (lib/atlas-mark.ts), a highlight's with the words of `texts` (page n → its
 *  text) under it. */
export function marksToElements(marks: readonly Mark[], frames: Map<number, El>, boxes: Map<number, PageBox>, texts = new Map<number, TextPiece[]>()): El[] {
  const out: El[] = [];
  for (const m of marks) {
    const n = m.pageIndex + 1, f = frames.get(n), box = boxes.get(n);
    if (!f || !box) continue;
    const s = f.width! / (box[2] - box[0]);
    const mark = (kind: AtlasMark["kind"], color: string, more: Partial<AtlasMark> = {}): AtlasMark =>
      ({ id: markId(), kind, page: n, color, device: "desktop", created: Date.now(), ...more });
    const X = (px: number) => f.x! + (px - box[0]) * s, Y = (py: number) => f.y! + (box[3] - py) * s;
    if (m.annotationType === 15) {
      // ink: one freedraw per line, its points relative to its first; the lines one mark
      const atlasMark = mark("ink", hex(m.color, "#000000"));
      const pressures = m.paths?.pressures;
      for (const [li, line] of (m.paths?.points ?? []).entries()) {
        const pts: [number, number][] = [];
        for (let i = 0; i + 1 < line.length; i += 2) pts.push([X(line[i]), Y(line[i + 1])]);
        if (pts.length < 2) continue;
        const [ox, oy] = pts[0], rel = pts.map(([a, b]) => [a - ox, b - oy]);
        const xs = rel.map((p) => p[0]), ys = rel.map((p) => p[1]);
        out.push({
          ...base("freedraw", uid("pen"), ox, oy, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), f.id),
          strokeColor: hex(m.color, "#000000"), strokeWidth: Math.max(0.5, ((m.thickness ?? 1) * s) / 3), opacity: Math.round((m.opacity ?? 1) * 100),
          points: rel, pressures: pressures?.[li] ? Array.from(pressures[li]) : [], simulatePressure: !pressures?.[li], lastCommittedPoint: null, customData: { atlasMark },
        });
      }
    } else if (m.annotationType === 9) {
      // highlight: a see-through box over each quad of the passage, the boxes one mark with the passage's words.
      // `atlasHighlight` stays for scripts/vault/pdf_annotations.py until the core's marks writer replaces it.
      const q = m.quadPoints ?? [], quads: Quad[] = [];
      for (let i = 0; i + 7 < q.length; i += 8) {
        const px = [q[i], q[i + 2], q[i + 4], q[i + 6]], py = [q[i + 1], q[i + 3], q[i + 5], q[i + 7]];
        quads.push([Math.min(...px), Math.min(...py), Math.max(...px), Math.max(...py)]);
      }
      const color = hex(m.color, "#FFE066"), quote = quoteOf(texts.get(n) ?? [], quads);
      const atlasMark = mark("highlight", color, { quads, ...(quote ? { quote } : {}) });
      for (const r of quads) {
        const x = X(r[0]), y = Y(r[3]);
        out.push({ ...base("rectangle", uid("highlight"), x, y, X(r[2]) - x, Y(r[1]) - y, f.id), strokeColor: "transparent",
          backgroundColor: color, opacity: 40, customData: { atlasMark, atlasHighlight: { page: n, mark: atlasMark.id, rect: r } } });
      }
    } else if (m.annotationType === 3 && m.value?.trim() && m.rect) {
      const size = (m.fontSize ?? 10) * s, x = X(m.rect[0]), y = Y(m.rect[3]);
      const text = m.value.trim();
      out.push({ ...base("text", uid("note"), x, y, (m.rect[2] - m.rect[0]) * s, (m.rect[3] - m.rect[1]) * s, f.id), strokeColor: hex(m.color, "#000000"),
        text, originalText: text, fontSize: size, fontFamily: 1, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25,
        customData: { atlasMark: mark("comment", hex(m.color, "#000000")) } });
    }
  }
  return out;
}
