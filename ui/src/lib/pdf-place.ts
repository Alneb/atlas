// Places in a PDF, linked the Obsidian way: `[[paper.pdf#page=3]]`, and a passage as `[[paper.pdf#page=3|the words]]`:
// the link opens the page and selects its words there. A passage link from Obsidian or PDF++,
// `[[paper.pdf#page=3&selection=12,4,15,20|the words]]`, counts pdf.js's text pieces, which Atlas no longer has
// (docs/refactor/REFACTOR-pdfium-reader.md): it is read by its words too, and opens only the page without them. An
// annotation, as PDF++ links it: `[[paper.pdf#page=3&annotation=47R]]` — a PDF annotation's object number + "R";
// the link opens the page and flashes it. "Highlights → note" writes one per highlight (scripts/vault/pdf_annotations.py).

/** A place: the page, and optionally the passage's words or an annotation's id. */
export interface PdfPlace { page?: number; quote?: string; annotation?: string }

/** A PDF annotation (`<object number>R`, `<num>R<gen>` for a later generation), or one of the note's marks (`m-…`). */
const ANNOT_ID = /^(\d+R\d*|m-[0-9a-z]{8})$/;

/** A label that names the page rather than words on it ("p. 3", "page 12", "3"). */
const PAGE_LABEL = /^(p(p|age)?\.?\s*)?\d+([-–]\d+)?$/i;

/** The place a link names: its page (`#page=3`), its passage's words (the label, unless it only names the page) and an
 *  annotation (`&annotation=47R`); empty when there is none. */
export function placeOf(target: string): PdfPlace {
  const [where, ...label] = target.split("|");
  const q = new URLSearchParams(where.split("#").slice(1).join("#"));
  const page = Number(q.get("page"));
  const annotation = q.get("annotation") ?? "";
  const quote = label.join("|").trim();
  return {
    ...(Number.isInteger(page) && page > 0 ? { page } : {}),
    ...(quote.length >= 3 && !PAGE_LABEL.test(quote) ? { quote } : {}),
    ...(ANNOT_ID.test(annotation) ? { annotation } : {}),
  };
}

/** The longest label a passage link gets: its first words, enough to find it on its page. */
const LABEL_MOST = 120;
/** `[[path#page=N(&annotation=…)|the words]]`, as Obsidian reads it. */
export function placeLink(path: string, place: PdfPlace): string {
  const hash = place.page ? `#page=${place.page}${place.annotation ? `&annotation=${place.annotation}` : ""}` : "";
  let text = place.quote?.replace(/[\][|\n]+/g, " ").replace(/\s+/g, " ").trim() ?? "";
  if (text.length > LABEL_MOST) text = text.slice(0, LABEL_MOST).replace(/\s+\S*$/, "");
  return `[[${path}${hash}${text ? `|${text}` : ""}]]`;
}
