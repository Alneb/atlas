// PDFium as a PdfEngine (lib/pdf-engine.ts): its worker's requests (lib/pdfium.ts), unchanged.
import { pdfiumArea, pdfiumDrop, pdfiumFind, pdfiumInfo, pdfiumLayers, pdfiumPage } from "./pdfium";
import { registerLoaded, type PdfEngine } from "./pdf-engine";

export const pdfiumEngine: PdfEngine = {
  name: "pdfium",
  info: pdfiumInfo,
  area: pdfiumArea,
  page: async (path, page, px, fit) => (await pdfiumPage(path, page, px, fit)).bitmap,
  layers: pdfiumLayers,
  find: pdfiumFind,
  drop: pdfiumDrop,
};
registerLoaded(pdfiumEngine);
