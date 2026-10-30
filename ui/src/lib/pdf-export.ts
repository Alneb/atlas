// "Export with marks": the core writes `x (marked).pdf` beside the PDF with its marks as real annotations, or
// `x (marked, flat).pdf` with them drawn into the pages (pdf_export.rs); this says what was written, or why not.
import { api } from "./api";
import { toast } from "./state.svelte";
import { errText } from "./text";
import { openWikilink } from "./links";
import type { PdfExportMode } from "./gen/PdfExportMode";

export async function exportWithMarks(pdf: string, mode: PdfExportMode = "annotations"): Promise<void> {
  try {
    const r = await api.exportPdfMarks(pdf, mode);
    const n = r.annotations + r.bookmarks;
    const what = n ? `${n} mark${n === 1 ? "" : "s"} written in` : "no marks yet: a plain copy";
    const extra = [r.skipped ? `${r.skipped} on pages the PDF lacks, left out` : "", r.rewritten ? "the original is encrypted, so the copy is a decrypted rewrite" : ""].filter(Boolean).join("; ");
    // a click on the notice opens the copy
    toast("Exported with marks", `${r.path.split("/").pop()}: ${what}${extra ? ` (${extra})` : ""}.`, "success", 8000, { label: "Open", run: () => void openWikilink(r.path, pdf) });
  } catch (e) {
    toast("Export with marks", `Could not export: ${errText(e)}`, "error");
  }
}
