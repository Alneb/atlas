// What the desktop's PDF pane marks — pen, highlight, text — goes into the PDF's companion drawing, the one store every
// device writes (lib/pdf-ink.ts; docs/design/DESIGN-libraries-everywhere.md "PDF notes: one store"): the PDF itself is
// never modified. The scene logic is lib/pdf-ink-scene.ts; this reads and writes the file.
import { api } from "./api";
import { exists } from "./vault-files";
import { inkPathOf } from "./pdf-ink";
import { eraseIn, type El } from "./pdf-ink-scene";

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
