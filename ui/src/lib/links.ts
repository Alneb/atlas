// Wikilink → workspace path, by Obsidian's rules (vault.ts); unresolved links point beside the
// note, where clicking creates them.
import { resolveRel } from "./paths";
import { resolveLink, vaultReady } from "./vault";
import { openDrawingAt, openPath, openPdfAt } from "./dock";
import { placeOf } from "./pdf-place";
import { anchorLine, MARK_ID } from "./note-anchor";
import { api } from "./api";

export async function resolveWikilink(target: string, fromPath: string): Promise<string> {
  await vaultReady();
  const clean = target.split("#")[0].split("|")[0].trim();
  const dir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const hit = resolveLink(clean, dir);
  if (hit) return hit;
  const withExt = /\.[a-z0-9]+$/i.test(clean) ? clean : `${clean}.md`;
  return clean.includes("/") ? resolveRel(withExt) : resolveRel(withExt, dir);
}

/** Opens what a link names; a PDF at the page its `#page=…` names, its label's words selected there (lib/pdf-place.ts). */
export async function openWikilink(target: string, fromPath: string, opts: { beside?: boolean } = {}): Promise<void> {
  const path = await resolveWikilink(target, fromPath);
  const place = placeOf(target);
  const section = target.split("|")[0].split("#").slice(1).join("#").trim(); // a drawing's page: `#Page 2`, `#^frame=…`
  if (/\.excalidraw(\.md)?$/i.test(path) && section) openDrawingAt(path, section, opts);
  else if (/\.pdf$/i.test(path) && place.page) openPdfAt(path, place.page, { ...(place.quote ? { quote: place.quote } : {}), ...(place.annotation ? { annotation: place.annotation } : {}) }, opts);
  else if (/\.md$/i.test(path) && section) await openNoteAt(path, section, opts);
  else openPath(path, undefined, { ...opts, ...(section ? { anchor: section } : {}) }); // a plugin's pane gets the anchor
}

/** A note at a heading or `^block` (lib/note-anchor.ts). A PDF note's `^m-…` is one of its PDF's marks: the PDF opens
 *  at the mark, which flashes, as the marks block is the PDF's marks, not text to read in the note. */
async function openNoteAt(path: string, section: string, opts: { beside?: boolean }): Promise<void> {
  const id = section.replace(/^\^/, "");
  if (section.startsWith("^") && MARK_ID.test(id)) {
    const pdf = (await api.pdfOfNote(path).catch(() => null))?.pdf;
    const mark = pdf ? (await api.pdfMarks(pdf).catch(() => null))?.marks.find((m) => m.id === id) : undefined;
    if (pdf && mark) { openPdfAt(pdf, mark.page, { annotation: id }, opts); return; }
  }
  const text = await api.file(path).then((f) => f.text, () => null);
  openPath(path, text == null ? undefined : anchorLine(text, section), { ...opts, anchor: section });
}
