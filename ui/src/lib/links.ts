// Wikilink → workspace path, by Obsidian's rules (vault.ts); unresolved links point beside the
// note, where clicking creates them.
import { resolveRel } from "./paths";
import { resolveLink, vaultReady } from "./vault";
import { open, openDrawingAt, openPath } from "./dock";
import { placeOf } from "./pdf-place";

export async function resolveWikilink(target: string, fromPath: string): Promise<string> {
  await vaultReady();
  const clean = target.split("#")[0].split("|")[0].trim();
  const dir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const hit = resolveLink(clean, dir);
  if (hit) return hit;
  const withExt = /\.[a-z0-9]+$/i.test(clean) ? clean : `${clean}.md`;
  return clean.includes("/") ? resolveRel(withExt) : resolveRel(withExt, dir);
}

/** Opens what a link names; a PDF at the page and passage its `#page=…&selection=…` names (lib/pdf-place.ts). */
export async function openWikilink(target: string, fromPath: string, opts: { beside?: boolean } = {}): Promise<void> {
  const path = await resolveWikilink(target, fromPath);
  const place = placeOf(target);
  const section = target.split("|")[0].split("#").slice(1).join("#").trim(); // a drawing's page: `#Page 2`, `#^frame=…`
  if (/\.excalidraw(\.md)?$/i.test(path) && section) openDrawingAt(path, section, opts);
  else if (/\.pdf$/i.test(path) && place.page) open({ kind: "pdf", path, page: place.page, ...(place.selection ? { selection: place.selection } : {}), ...(place.annotation ? { annotation: place.annotation } : {}) }, opts);
  else openPath(path, undefined, { ...opts, ...(section ? { anchor: section } : {}) }); // a plugin's pane gets the anchor
}
