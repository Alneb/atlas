// Places in a PDF, linked the Obsidian way: `[[paper.pdf#page=3]]` (Obsidian's own), and a passage as PDF++ writes
// it, `[[paper.pdf#page=3&selection=12,4,15,20|the words]]`: the first and last text pieces of the page's text layer
// and the offsets in them. A link opens the page and selects the passage. An annotation, as PDF++ links it:
// `[[paper.pdf#page=3&annotation=47R]]` — pdf.js's id of a PDF annotation (its object number + "R"); the link
// opens the page and flashes the highlight. "Highlights → note" writes one per highlight (scripts/vault/pdf_annotations.py).

/** A place: the page, and optionally the passage [first piece, offset, last piece, offset] or an annotation's id. */
export interface PdfPlace { page?: number; selection?: [number, number, number, number]; annotation?: string }

/** pdf.js's annotation ids: `<object number>R`, `<num>R<gen>` for a later generation. */
const ANNOT_ID = /^\d+R\d*$/;

/** The place a link's `#…` names (`page=3`, `&selection=a,b,c,d`); empty when there is none. */
export function placeOf(target: string): PdfPlace {
  const hash = target.split("|")[0].split("#").slice(1).join("#");
  const q = new URLSearchParams(hash);
  const page = Number(q.get("page"));
  const sel = (q.get("selection") ?? "").split(",").map(Number);
  const annotation = q.get("annotation") ?? "";
  return {
    ...(Number.isInteger(page) && page > 0 ? { page } : {}),
    ...(sel.length === 4 && sel.every((n) => Number.isInteger(n) && n >= 0) ? { selection: sel as [number, number, number, number] } : {}),
    ...(ANNOT_ID.test(annotation) ? { annotation } : {}),
  };
}

/** `[[path#page=N(&selection=…|&annotation=…)|label]]`, as Obsidian (and PDF++) read it. */
export function placeLink(path: string, place: PdfPlace, label?: string): string {
  const extra = place.selection ? `&selection=${place.selection.join(",")}` : place.annotation ? `&annotation=${place.annotation}` : "";
  const hash = place.page ? `#page=${place.page}${extra}` : "";
  const text = label?.replace(/[\][|\n]+/g, " ").trim().slice(0, 80);
  return `[[${path}${hash}${text ? `|${text}` : ""}]]`;
}

/** The text pieces of a drawn page, in reading order (pdf.js puts one span per piece; markedContent spans only group). */
export function textPieces(container: HTMLElement, page: number): HTMLElement[] {
  const layer = container.querySelector(`.page[data-page-number="${page}"] .textLayer`);
  if (!layer) return [];
  return [...layer.querySelectorAll<HTMLElement>("span")].filter((s) => !s.classList.contains("markedContent") && s.firstChild?.nodeType === Node.TEXT_NODE);
}

/** The place of the text selected in this viewer, if any: its page and passage, and the words. */
export function selectedPlace(container: HTMLElement): (PdfPlace & { text: string }) | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  const pageEl = (n: Node) => (n instanceof Element ? n : n.parentElement)?.closest<HTMLElement>(".page[data-page-number]");
  const pageOf = pageEl(r.startContainer);
  if (!pageOf || !container.contains(pageOf)) return null;
  const page = Number(pageOf.dataset.pageNumber);
  const pieces = textPieces(container, page);
  const at = (node: Node, offset: number): [number, number] | null => {
    const span = (node instanceof Element ? node : node.parentElement)?.closest("span");
    const i = span ? pieces.indexOf(span as HTMLElement) : -1;
    return i < 0 ? null : [i, node.nodeType === Node.TEXT_NODE ? offset : 0];
  };
  const a = at(r.startContainer, r.startOffset), b = pageEl(r.endContainer) === pageOf ? at(r.endContainer, r.endOffset) : null;
  return { page, ...(a && b ? { selection: [a[0], a[1], b[0], b[1]] as [number, number, number, number] } : {}), text: sel.toString().trim() };
}

/** Selects (and scrolls to) a passage once its page's text is drawn; false when the pieces are not there (yet). */
export function showPlace(container: HTMLElement, page: number, s: [number, number, number, number]): boolean {
  const pieces = textPieces(container, page);
  const first = pieces[s[0]]?.firstChild, last = pieces[s[2]]?.firstChild;
  if (!first || !last) return false;
  const r = document.createRange();
  r.setStart(first, Math.min(s[1], first.textContent?.length ?? 0));
  r.setEnd(last, Math.min(s[3], last.textContent?.length ?? 0));
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
  pieces[s[0]].scrollIntoView({ block: "center" });
  return true;
}

/** Scrolls to an annotation drawn on `page` and flashes it; false when its element is not drawn (yet). */
export function showAnnotation(container: HTMLElement, page: number, id: string): boolean {
  const el = container.querySelector<HTMLElement>(`.page[data-page-number="${page}"] [data-annotation-id="${id}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: "center" });
  el.classList.remove("atlas-flash");
  void el.offsetWidth; // restart the animation when the same link is followed twice
  el.classList.add("atlas-flash");
  return true;
}
