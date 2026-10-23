// pdf.js's own viewer (text layer, links, find, annotation editor) instead of hand-drawn canvases:
// highlight / ink (pen + stylus) / free text are pdf.js editors; the pane saves them into the PDF's companion drawing
// (lib/pdf-ink-save.ts), the PDF itself untouched.
import * as pdfjs from "pdfjs-dist";
import { EventBus, LinkTarget, PDFFindController, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import viewerCss from "pdfjs-dist/web/pdf_viewer.css?inline";
import { closePdf, dropThumbCache, openPdf } from "./pdf";
import { releaseCanvases } from "./release-canvases";
import type { Mark } from "./pdf-ink-save";

// pdf.js's stylesheet is global: its `.sidebar`, `.dialog` and `.page` restyled the app's own left bar
// (180px wide when collapsed), palette and pages as soon as a PDF opened. Confined to the viewer.
const SCOPE = "pdfjs-scope";
document.head.append(Object.assign(document.createElement("style"), {
  textContent: `@scope (.${SCOPE}) {\n${viewerCss.replaceAll(":root", ":scope")}\n}`,
}));

export const Tool = {
  select: pdfjs.AnnotationEditorType.NONE,
  highlight: pdfjs.AnnotationEditorType.HIGHLIGHT,
  ink: pdfjs.AnnotationEditorType.INK,
  text: pdfjs.AnnotationEditorType.FREETEXT,
} as const;
export type ToolName = keyof typeof Tool;

const P = pdfjs.AnnotationEditorParamsType;
/** Calm, readable highlight colours (pdf.js wants "name=#hex" pairs). */
export const COLORS = { yellow: "#FFE066", green: "#8CE99A", blue: "#74C0FC", pink: "#FAA2C1", red: "#FF8787" } as const;

export interface Viewer {
  doc: pdfjs.PDFDocumentProxy;
  viewer: PDFViewer;
  bus: EventBus;
  find: PDFFindController;
  setTool(t: ToolName): void;
  setColor(hex: string): void;
  setThickness(px: number): void;
  /** The marks made here, as pdf.js serializes them (lib/pdf-ink-save.ts writes them to the companion drawing). */
  marks(): Mark[];
  destroy(): void;
}

export async function createViewer(container: HTMLDivElement, path: string, onDirty: (d: boolean) => void): Promise<Viewer> {
  container.classList.add(SCOPE);
  const bus = new EventBus();
  // a web link in the PDF opens a new window (the app makes it a browsing window); same-window would replace the app
  const link = new PDFLinkService({ eventBus: bus, externalLinkTarget: LinkTarget.BLANK, externalLinkRel: "noopener noreferrer nofollow" });
  const find = new PDFFindController({ eventBus: bus, linkService: link });
  const viewer = new PDFViewer({
    container,
    eventBus: bus,
    linkService: link,
    findController: find,
    annotationEditorMode: pdfjs.AnnotationEditorType.NONE, // enables the editor layer
    annotationEditorHighlightColors: Object.entries(COLORS).map(([k, v]) => `${k}=${v}`).join(","),
    supportsPinchToZoom: true,
  });
  link.setViewer(viewer);
  const doc = await openPdf(path);
  viewer.setDocument(doc);
  link.setDocument(doc);
  // Typed as null in pdf.js's d.ts, but these are the documented modification hooks.
  const storage = doc.annotationStorage as unknown as { onSetModified: () => void; onResetModified: () => void };
  storage.onSetModified = () => onDirty(true);
  storage.onResetModified = () => onDirty(false);
  let mode: number = Tool.select;
  const param = (type: number, value: unknown) => bus.dispatch("switchannotationeditorparams", { source: null, type, value });
  return {
    doc, viewer, bus, find,
    setTool(t) { mode = Tool[t]; viewer.annotationEditorMode = { mode }; },
    setColor(hex) {
      if (mode === Tool.highlight) param(P.HIGHLIGHT_COLOR, hex);
      else if (mode === Tool.ink) param(P.INK_COLOR, hex);
      else if (mode === Tool.text) param(P.FREETEXT_COLOR, hex);
    },
    setThickness(px) { if (mode === Tool.ink) param(P.INK_THICKNESS, px); },
    marks() {
      const s = doc.annotationStorage.serializable as unknown as { map?: Map<string, Mark> | null };
      return [...(s.map?.values() ?? [])];
    },
    // canvases first: setDocument(null) detaches the pages, which WebKit then keeps drawn until they are collected
    destroy() {
      releaseCanvases(container);
      viewer.setDocument(null as unknown as pdfjs.PDFDocumentProxy);
      dropThumbCache(doc);
      closePdf(doc);
    },
  };
}
