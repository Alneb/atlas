// "New drawing": tiny on purpose, so the startup bundle never loads Excalidraw. It asks the page format first; pages added later take the last page's size.
import { api } from "./api";
import { openPath } from "./dock";
import { pick } from "./palette.svelte";
import { settings } from "./settings.svelte";
import type { Paper } from "./draw-notepad";

const stamp = () => new Date().toLocaleString("sv-SE").replace(" ", "-").replace(/:/g, "").slice(0, 17); // 2026-10-05-174210

/** Sizes in Excalidraw's units (CSS px at 96 dpi). The Boox Note Air's screen first. */
const FORMATS: { id: string; title: string; detail: string; size?: [number, number]; corner?: boolean }[] = [
  { id: "boox", title: "Boox Note Air pages", detail: "the e-ink screen's shape (1860 × 2480), portrait", size: [794, 1059] },
  { id: "boox-landscape", title: "Boox Note Air pages, landscape", detail: "the screen turned (2480 × 1860)", size: [1059, 794] },
  { id: "canvas", title: "Infinite canvas", detail: "no pages, endless in every direction" },
  { id: "corner", title: "Canvas with a corner", detail: "no pages; it starts at the top left and grows right and down only", corner: true },
  { id: "a4", title: "A4 pages", detail: "portrait, 210 × 297 mm (older drawings)", size: [794, 1123] },
  { id: "a4-landscape", title: "A4 pages, landscape", detail: "297 × 210 mm", size: [1123, 794] },
];

/** The paper a new page carries (draw-notepad.ts PAPERS; the frame's `customData.atlasTemplate`, as the Boox's Notepad
 *  writes it): asked after the size ("once you select the size it should prompt you for the background"). */
const PAPER_CHOICES: { id: Paper; title: string; detail: string }[] = [
  { id: "blank", title: "Blank", detail: "nothing under the ink" },
  { id: "lines", title: "Lines", detail: "ruled, for writing" },
  { id: "grid", title: "Grid", detail: "squares" },
  { id: "dots", title: "Dots", detail: "a dot grid" },
  { id: "fine", title: "Fine grid", detail: "small squares" },
  { id: "graph", title: "Graph", detail: "small squares, every fifth line darker" },
  { id: "staff", title: "Music staves", detail: "five-line staves" },
];

/** The first element of a drawing in this format: its first page, or the corner's two edges. */
function firstElements(f: (typeof FORMATS)[number], paper: Paper = "blank"): unknown[] {
  const base = { angle: 0, strokeColor: "#bbb", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 0, opacity: 100,
    groupIds: [], roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false, boundElements: null, link: null, locked: true, updated: Date.now() };
  if (f.size) return [{ ...base, id: `page-${Date.now().toString(36)}-0`, type: "frame", x: 0, y: 0, width: f.size[0], height: f.size[1], name: "Page 1", frameId: null,
    ...(paper !== "blank" ? { customData: { atlasTemplate: paper } } : {}) }];
  // the corner's two edges, long enough to be seen as the canvas's edges; the drawing keeps the view right of and
  // below them (draw-excalidraw.ts `CORNER`)
  if (f.corner) return [
    { ...base, id: `corner-${Date.now().toString(36)}-x`, type: "line", x: 0, y: 0, width: 4000, height: 0, points: [[0, 0], [4000, 0]], frameId: null },
    { ...base, id: `corner-${Date.now().toString(36)}-y`, type: "line", x: 0, y: 0, width: 0, height: 4000, points: [[0, 0], [0, 4000]], frameId: null },
  ];
  return [];
}

/** Makes the drawing and opens it. */
async function make(f: (typeof FORMATS)[number], paper: Paper = "blank", dir?: string): Promise<string> {
  const into = (dir ?? settings.config?.draw?.dir ?? "notes/drawings").replace(/\/+$/, "");
  const path = `${into}/${stamp()}.excalidraw`;
  await api.putFile(path, JSON.stringify({ type: "excalidraw", version: 2, source: "atlas", elements: firstElements(f, paper), appState: {}, files: {} }));
  // as any drawing opens: the phone app's own Notepad when it opens drawings, else the drawing's pane
  openPath(path);
  return path;
}

/** Pages: their paper asked next; a canvas has none (its paper is the device's, picked on the toolbar). */
function withPaper(f: (typeof FORMATS)[number], dir: string | undefined, done: (path: string) => void): void {
  if (!f.size) { void make(f, "blank", dir).then(done); return; }
  pick({
    placeholder: `${f.title}: the paper…`, tag: "New drawing", icon: "edit",
    items: PAPER_CHOICES.map((p) => ({ value: p.id, title: p.title, detail: p.detail, icon: "edit" as const })),
    onpick: async (id) => done(await make(f, (PAPER_CHOICES.find((p) => p.id === id)?.id ?? "blank"), dir)),
  });
}

/** A new drawing: its pages, then their paper (a set `[draw] page_format` skips the first question). `dir`: where (the
 *  Drawings library's folder), else `[draw] dir`. `done` gets its path. */
export async function newExcalidraw(dir?: string, done: (path: string) => void = () => {}): Promise<void> {
  const set = FORMATS.find((x) => x.id === settings.config?.draw?.page_format);
  if (set) return withPaper(set, dir, done);
  pick({
    placeholder: "New drawing: its pages…", tag: "New drawing", icon: "edit",
    items: FORMATS.map((f) => ({ value: f.id, title: f.title, detail: f.detail, icon: "edit" as const })),
    onpick: async (id) => {
      const f = FORMATS.find((x) => x.id === id);
      if (f) withPaper(f, dir, done);
    },
  });
}
