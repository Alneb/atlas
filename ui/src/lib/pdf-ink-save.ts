// What the desktop's PDF pane marks — pen, highlight, text — goes into the PDF's companion drawing, the one store every
// device writes (lib/pdf-ink.ts; docs/design/DESIGN-libraries-everywhere.md "PDF notes: one store"): the PDF itself is
// never modified. pdf.js's editors give their marks in the page's PDF space (points, y up); each becomes an element over
// its page's frame, a page the drawing does not have yet gets its frame and picture where the Boox would put it
// (InkStore.java `addPage`: four a row, A4's width).
import { api } from "./api";
import { exists } from "./vault-files";
import { inkPathOf, pageFrames } from "./pdf-ink";

/** InkStore.java's layout, so a page added here sits where the Boox would have put it. */
const PAGE_W = 794, PAGE_H = 1123, GAP = 48, PER_ROW = 4;

/** A pdf.js editor's mark as it serializes it (`annotationStorage.serializable`): 3 free text, 9 highlight, 15 ink. */
export type Mark = {
  annotationType: number; pageIndex: number; color?: number[]; opacity?: number; thickness?: number; id?: string | null;
  paths?: { points?: ArrayLike<number>[] }; quadPoints?: ArrayLike<number>; value?: string; fontSize?: number; rect?: number[];
};
/** A page's box in PDF points (`page.view`: x0, y0, x1, y1). */
export type PageBox = [number, number, number, number];
type El = Record<string, unknown> & { id: string; type: string; x?: number; y?: number; width?: number; height?: number; isDeleted?: boolean };

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

/** The marks as elements over their pages' frames (`frames`: page n → its frame), PDF points to the frame's units. */
export function marksToElements(marks: readonly Mark[], frames: Map<number, El>, boxes: Map<number, PageBox>): El[] {
  const out: El[] = [];
  for (const m of marks) {
    const n = m.pageIndex + 1, f = frames.get(n), box = boxes.get(n);
    if (!f || !box) continue;
    const s = f.width! / (box[2] - box[0]);
    const X = (px: number) => f.x! + (px - box[0]) * s, Y = (py: number) => f.y! + (box[3] - py) * s;
    if (m.annotationType === 15) {
      // ink: one freedraw per line, its points relative to its first
      for (const line of m.paths?.points ?? []) {
        const pts: [number, number][] = [];
        for (let i = 0; i + 1 < line.length; i += 2) pts.push([X(line[i]), Y(line[i + 1])]);
        if (pts.length < 2) continue;
        const [ox, oy] = pts[0], rel = pts.map(([a, b]) => [a - ox, b - oy]);
        const xs = rel.map((p) => p[0]), ys = rel.map((p) => p[1]);
        out.push({
          ...base("freedraw", uid("pen"), ox, oy, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), f.id),
          strokeColor: hex(m.color, "#000000"), strokeWidth: Math.max(0.5, ((m.thickness ?? 1) * s) / 3), opacity: Math.round((m.opacity ?? 1) * 100),
          points: rel, pressures: [], simulatePressure: false, lastCommittedPoint: null,
        });
      }
    } else if (m.annotationType === 9) {
      // highlight: a see-through box over each quad of the passage; each keeps its page and its box in PDF points, and
      // the passage's boxes one mark id, so "Highlights into the note" reads the text under them
      // (scripts/vault/pdf_annotations.py)
      const q = m.quadPoints ?? [], mark = uid("passage");
      for (let i = 0; i + 7 < q.length; i += 8) {
        const px = [q[i], q[i + 2], q[i + 4], q[i + 6]], py = [q[i + 1], q[i + 3], q[i + 5], q[i + 7]];
        const xs = px.map(X), ys = py.map(Y), x = Math.min(...xs), y = Math.min(...ys);
        out.push({ ...base("rectangle", uid("highlight"), x, y, Math.max(...xs) - x, Math.max(...ys) - y, f.id), strokeColor: "transparent",
          backgroundColor: hex(m.color, "#FFE066"), opacity: 40,
          customData: { atlasHighlight: { page: n, mark, rect: [Math.min(...px), Math.min(...py), Math.max(...px), Math.max(...py)] } } });
      }
    } else if (m.annotationType === 3 && m.value?.trim() && m.rect) {
      const size = (m.fontSize ?? 10) * s, x = X(m.rect[0]), y = Y(m.rect[3]);
      const text = m.value.trim();
      out.push({ ...base("text", uid("note"), x, y, (m.rect[2] - m.rect[0]) * s, (m.rect[3] - m.rect[1]) * s, f.id), strokeColor: hex(m.color, "#000000"),
        text, originalText: text, fontSize: size, fontFamily: 1, textAlign: "left", verticalAlign: "top", containerId: null, autoResize: true, lineHeight: 1.25 });
    }
  }
  return out;
}

/** The pane's new marks written into `pdf`'s companion drawing (made when it has none); pdf.js's marks on the PDF's own
 *  annotations (`id` set) are left out: those belong to the PDF. How many elements were written. */
export async function writeMarks(pdf: string, marks: readonly Mark[], boxOf: (n: number) => Promise<PageBox>): Promise<number> {
  const mine = marks.filter((m) => !m.id && [3, 9, 15].includes(m.annotationType));
  if (!mine.length) return 0;
  const path = inkPathOf(pdf);
  const file = (await exists(path)) ? await api.file(path).catch(() => null) : null;
  const scene = file ? JSON.parse(file.text) : { type: "excalidraw", version: 2, source: "atlas (pdf)", elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} };
  const els = scene.elements as El[];
  const have = pageFrames(els as never), frames = new Map<number, El>(), boxes = new Map<number, PageBox>();
  for (const n of new Set(mine.map((m) => m.pageIndex + 1))) {
    boxes.set(n, await boxOf(n));
    const at = have.get(n), frame = at && els.find((e) => e.id === at.frame);
    frames.set(n, frame ?? addPageFrame(els, pdf, n, boxes.get(n)!));
  }
  const added = marksToElements(mine, frames, boxes);
  scene.elements = [...els, ...added];
  await api.putFile(path, JSON.stringify(scene), file?.mtime);
  return added.length;
}

/** An element's box in the scene (x0, y0, x1, y1): a line's from its points, which lie around its first one. */
function boxOf(e: El): [number, number, number, number] {
  const pts = e.points as [number, number][] | undefined;
  if (pts?.length) {
    const xs = pts.map((p) => e.x! + p[0]), ys = pts.map((p) => e.y! + p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  return [e.x!, e.y!, e.x! + Math.max(0, e.width ?? 0), e.y! + Math.max(0, e.height ?? 0)];
}

/** The companion's mark under a point of page n (`fx`, `fy`: 0–1 across and down the page) taken out, as Excalidraw
 *  deletes — `isDeleted`, its version moved on, so another device merging the drawing takes it out too. The smallest
 *  mark there when they overlap; a few units of slack around a thin line. Whether one was. */
export async function eraseAt(pdf: string, n: number, fx: number, fy: number): Promise<boolean> {
  const path = inkPathOf(pdf);
  if (!(await exists(path))) return false;
  const file = await api.file(path);
  const scene = JSON.parse(file.text);
  const els = scene.elements as El[];
  const at = pageFrames(els as never).get(n), frame = at && els.find((e) => e.id === at.frame);
  if (!at || !frame) return false;
  const x = frame.x! + fx * frame.width!, y = frame.y! + fy * frame.height!, slack = 6;
  const hit = els
    .filter((e) => !e.isDeleted && e.frameId === at.frame && e.id !== at.picture)
    .map((e) => ({ e, b: boxOf(e) }))
    .filter(({ b }) => x >= b[0] - slack && x <= b[2] + slack && y >= b[1] - slack && y <= b[3] + slack)
    .sort((a, b) => (a.b[2] - a.b[0]) * (a.b[3] - a.b[1]) - (b.b[2] - b.b[0]) * (b.b[3] - b.b[1]))[0]?.e;
  if (!hit) return false;
  Object.assign(hit, { isDeleted: true, version: Number(hit.version ?? 1) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() });
  await api.putFile(path, JSON.stringify(scene), file.mtime);
  return true;
}
