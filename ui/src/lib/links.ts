// Wikilink → workspace path, by Obsidian's rules (vault.ts); unresolved links point beside the
// note, where clicking creates them.
import { resolveRel } from "./paths";
import { resolveLink, vaultReady } from "./vault";
import { openDrawingAt, openPath, openPdfAt } from "./dock";
import { placeOf } from "./pdf-place";
import { anchorLine, MARK_ID } from "./note-anchor";
import { api } from "./api";
import { nowPlaying, shellPlayer } from "./player.svelte";
import { timeOfFragment } from "./player-time";

export async function resolveWikilink(target: string, fromPath: string): Promise<string> {
  return (await whereLinkPoints(target, fromPath)).path;
}

/** Where a link points, and whether a file is there (`found`: false — a note not made yet, beside the linking one). */
async function whereLinkPoints(target: string, fromPath: string): Promise<{ path: string; found: boolean }> {
  await vaultReady();
  const clean = target.split("#")[0].split("|")[0].trim();
  // `[[#heading]]`, `[[#^block]]`: a place in the note itself (never a note named ".md")
  if (!clean) return { path: fromPath, found: true };
  const dir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const hit = resolveLink(clean, dir);
  if (hit) return { path: hit, found: true };
  const withExt = /\.[a-z0-9]+$/i.test(clean) ? clean : `${clean}.md`;
  return { path: clean.includes("/") ? resolveRel(withExt) : resolveRel(withExt, dir), found: false };
}

/** A link to a note not made yet is followed by making it, as Obsidian does: through the core, so the vault's
 *  template rules choose its template (a `linked_by: topics` rule makes a topic note a topic). Null: not made. */
async function makeLinkedNote(path: string): Promise<{ path: string; line: number } | null> {
  const slash = path.lastIndexOf("/");
  const title = path.slice(slash + 1).replace(/\.md$/i, "");
  try { return await api.newNote({ title, dir: slash > 0 ? path.slice(0, slash) : undefined }); }
  catch { return null; } // the empty editor below still lets the user write it
}

/** Opens what a link names; a PDF at the page its `#page=…` names, its label's words selected there (lib/pdf-place.ts). */
export async function openWikilink(target: string, fromPath: string, opts: { beside?: boolean } = {}): Promise<void> {
  const where = await whereLinkPoints(target, fromPath);
  if (await seekByLink(target, where.path)) return;
  if (!where.found && /\.md$/i.test(where.path)) {
    const made = await makeLinkedNote(where.path);
    if (made) { openPath(made.path, made.line, opts); return; }
  }
  const path = where.path;
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

const VIDEO = /\.(mkv|mp4|webm|mov|avi|m4v)$/i;
/** A time link (`[[film#t=1:02:03]]`, lib/watch-notes.ts): the thing playing seeks there; a video of the vault starts
 *  there. False when the link names no time, or nothing to play (it opens as any link). */
async function seekByLink(target: string, path: string): Promise<boolean> {
  const t = timeOfFragment(target.split("|")[0].split("#").slice(1).join("#"));
  if (t === null) return false;
  const s = nowPlaying.s;
  if (s?.note && s.note === path) { shellPlayer.seek(t); return true; }
  if (VIDEO.test(path)) {
    await shellPlayer.play({ key: null, title: path.split("/").pop()!, tracks: [], video: true, file: path, note: path, at: t });
    return true;
  }
  return false;
}
