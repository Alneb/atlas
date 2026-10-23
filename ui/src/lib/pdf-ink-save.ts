// What the desktop's PDF pane marks — pen, highlight, text — goes into the PDF's companion drawing, the one store every
// device writes (lib/pdf-ink.ts; docs/design/DESIGN-libraries-everywhere.md "PDF notes: one store"): the PDF itself is
// never modified. The scene logic is lib/pdf-ink-scene.ts; this reads and writes the file.
import { api } from "./api";
import { exists } from "./vault-files";
import { inkPathOf } from "./pdf-ink";
import type { TextPiece } from "./atlas-mark";
import { addPageFrame, eraseIn, marksToElements, oldHighlightPages, pageFrames, removeIn, stampOldMarks, type El, type Mark, type PageBox } from "./pdf-ink-scene";
import type { AtlasMark } from "./atlas-mark";

export type { Mark, PageBox } from "./pdf-ink-scene";

/** The pane's new marks written into `pdf`'s companion drawing (made when it has none), the drawing's older marks given
 *  their `atlasMark` on the way; pdf.js's marks on the PDF's own annotations (`id` set) are left out: those belong to
 *  the PDF. `textOf` gives a page's text, for a highlight's words. The ids of the marks written. */
export async function writeMarks(pdf: string, marks: readonly Mark[], boxOf: (n: number) => Promise<PageBox>,
  textOf: (n: number) => Promise<TextPiece[]> = async () => []): Promise<string[]> {
  const mine = marks.filter((m) => !m.id && [3, 9, 15].includes(m.annotationType));
  if (!mine.length) return [];
  const path = inkPathOf(pdf);
  const file = (await exists(path)) ? await api.file(path).catch(() => null) : null;
  const scene = file ? JSON.parse(file.text) : { type: "excalidraw", version: 2, source: "atlas (pdf)", elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} };
  const els = scene.elements as El[];
  const texts = new Map<number, TextPiece[]>();
  const wanted = [...mine.filter((m) => m.annotationType === 9).map((m) => m.pageIndex + 1), ...oldHighlightPages(els)];
  for (const n of new Set(wanted)) texts.set(n, await textOf(n).catch(() => []));
  stampOldMarks(els, texts);
  const have = pageFrames(els), frames = new Map<number, El>(), boxes = new Map<number, PageBox>();
  for (const n of new Set(mine.map((m) => m.pageIndex + 1))) {
    boxes.set(n, await boxOf(n));
    const at = have.get(n), frame = at && els.find((e) => e.id === at.frame);
    frames.set(n, frame ?? addPageFrame(els, pdf, n, boxes.get(n)!));
  }
  const added = marksToElements(mine, frames, boxes, texts);
  scene.elements = [...els, ...added];
  await api.putFile(path, JSON.stringify(scene), file?.mtime);
  return [...new Set(added.map((e) => (e.customData as { atlasMark: AtlasMark }).atlasMark.id))];
}

/** The marks with these ids taken out of `pdf`'s drawing (an undo). Whether any was. */
export async function removeMarks(pdf: string, ids: readonly string[]): Promise<boolean> {
  const path = inkPathOf(pdf);
  if (!ids.length || !(await exists(path))) return false;
  const file = await api.file(path);
  const scene = JSON.parse(file.text);
  if (!removeIn(scene.elements as El[], ids)) return false;
  await api.putFile(path, JSON.stringify(scene), file.mtime);
  return true;
}

/** The companion's mark under a point of page n taken out of `pdf`'s drawing (`eraseIn`). Whether one was. */
export async function eraseAt(pdf: string, n: number, fx: number, fy: number): Promise<boolean> {
  const path = inkPathOf(pdf);
  if (!(await exists(path))) return false;
  const file = await api.file(path);
  const scene = JSON.parse(file.text);
  const els = scene.elements as El[];
  if (!eraseIn(els, n, fx, fy)) return false;
  await api.putFile(path, JSON.stringify(scene), file.mtime);
  return true;
}
