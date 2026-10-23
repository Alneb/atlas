// A PDF's ink on the desktop's PDF pane (docs/design/DESIGN-libraries-everywhere.md, "PDF notes: one store"). Every device writes a PDF's ink to its companion drawing
// `x.pdf.excalidraw` (the PDF is never modified): a frame per page holding a picture tagged `customData.atlasPage =
// { file, page }` (drawn from the PDF, never stored) and the ink over it (InkStore.java, the Boox's Notepad). Here each
// page frame's ink is exported without the picture — a see-through SVG — and laid over pdf.js's page, redrawn when the
// drawing changes on disk (another device's save). Excalidraw is loaded only for a PDF that has a companion drawing.
import { api } from "./api";
import { exists } from "./vault-files";
import { on } from "./bus";

type El = { id: string; type: string; frameId?: string | null; isDeleted?: boolean; customData?: { atlasPage?: { page?: number } } };

/** The companion drawing of `pdf`: `x.pdf` → `x.pdf.excalidraw`. */
export const inkPathOf = (pdf: string): string => `${pdf}.excalidraw`;

/** Page number → the ids of its frame and of the PDF's picture in it, from the drawing's `atlasPage` pictures. */
export function pageFrames(elements: readonly El[]): Map<number, { frame: string; picture: string }> {
  const out = new Map<number, { frame: string; picture: string }>();
  for (const e of elements) {
    const n = e.customData?.atlasPage?.page;
    if (e.isDeleted || e.type !== "image" || !n || !e.frameId) continue;
    out.set(n, { frame: e.frameId, picture: e.id });
  }
  return out;
}

/** Page n's ink as a see-through SVG (an object URL), or null when that page has none. */
async function pageInk(scene: { elements: readonly El[]; appState?: object; files?: object }, n: number): Promise<string | null> {
  const at = pageFrames(scene.elements).get(n);
  if (!at) return null;
  const ink = scene.elements.filter((e) => !e.isDeleted && e.frameId === at.frame && e.id !== at.picture);
  if (!ink.length) return null;
  const lib = await import("@excalidraw/excalidraw");
  const frame = scene.elements.find((e) => e.id === at.frame);
  if (!frame) return null;
  // the frame crops the export to the page; drawn see-through (its outline and name are the drawing's, not the PDF's)
  const quiet = { ...frame, strokeColor: "transparent", name: "" };
  const svg = await lib.exportToSvg({
    elements: [quiet, ...ink] as never,
    appState: { exportBackground: false, exportWithDarkMode: false, frameRendering: { enabled: false, name: false, outline: false, clip: false } } as never,
    files: (scene.files ?? {}) as never,
    exportingFrame: quiet as never,
    exportPadding: 0,
  });
  return URL.createObjectURL(new Blob([svg.outerHTML], { type: "image/svg+xml" }));
}

/** The companion drawing's ink over the pages of the PDF in `container` (pdf.js's `.page[data-page-number]`), each page
 *  drawn when pdf.js draws it; follows the drawing's saves. Returns the teardown. */
export function attachPdfInk(container: HTMLElement, pdf: string, onPage: (handler: (n: number) => void) => () => void): () => void {
  const path = inkPathOf(pdf);
  let scene: { elements: readonly El[]; appState?: object; files?: object } | null = null;
  const urls = new Map<number, string>();
  let gone = false;
  const place = async (n: number) => {
    const div = container.querySelector<HTMLElement>(`.page[data-page-number="${n}"]`);
    if (!div || !scene) return;
    const url = await pageInk(scene, n).catch(() => null);
    if (gone) { if (url) URL.revokeObjectURL(url); return; }
    const old = urls.get(n);
    if (old) URL.revokeObjectURL(old);
    let img = div.querySelector<HTMLImageElement>(":scope > img.atlas-ink");
    if (!url) { img?.remove(); urls.delete(n); return; }
    urls.set(n, url);
    if (!img) {
      img = Object.assign(document.createElement("img"), { className: "atlas-ink", alt: "" });
      img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3";
      div.append(img);
    }
    img.src = url;
  };
  const load = async () => {
    // asked first: a PDF with no drawing is the common case, and a 404 would be logged as an error
    const f = (await exists(path)) ? await api.file(path).catch(() => null) : null;
    if (gone) return;
    scene = f ? (JSON.parse(f.text) as typeof scene) : null;
    const drawn = [...container.querySelectorAll<HTMLElement>(".page[data-page-number]")].map((d) => Number(d.dataset.pageNumber));
    for (const n of drawn) void place(n);
  };
  void load();
  const offPage = onPage((n) => void place(n));
  const offFs = on("fs", (e) => { if (e.paths.includes(path)) void load(); });
  return () => {
    gone = true;
    offPage();
    offFs();
    for (const u of urls.values()) URL.revokeObjectURL(u);
    for (const img of container.querySelectorAll("img.atlas-ink")) img.remove();
  };
}
