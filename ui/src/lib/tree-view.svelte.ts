// The file tree without repetition (docs/design/DESIGN-shared-notes.md). What is
// another entry's by its shape folds away — a mail's `<name> files/` beside `<name>.md`, a file's ink
// (`x.pdf.excalidraw`, a manga chapter's `x.cbz.ink.json`), an old `x.pdf.md` beside `x.pdf` — and so do a note with
// `shown: false`, a dotfile (`.atlas`, `.git`) and, in the tree, a folder's own note (the folder's row opens it). Both
// explorers (the tree and the explorer tab) hide by this one rule, and one "Show hidden files" brings everything back.
import { load, save } from "./prefs";
import type { TreeEntry } from "./types";

const KEY = "atlas.tree.showAll";
export const treeView = $state({ showAll: load<boolean>(KEY, false) });
export function toggleShowAll(): void {
  treeView.showAll = !treeView.showAll;
  save(KEY, treeView.showAll);
}

/** What the rule needs of an entry: the tree's TreeEntry and a file source's Entry both are one. */
type Listed = Pick<TreeEntry, "name"> & { kind: string; path?: string; unshown?: boolean };

/** Whether `e` belongs to another entry of the same folder (`names`: every name there), by its shape alone. */
export function isSatellite(e: Listed, names: Set<string>): boolean {
  if (e.kind === "dir") return / files$/.test(e.name) && names.has(`${e.name.slice(0, -" files".length)}.md`);
  const owner = e.name.replace(/\.(excalidraw|ink\.json|md)$/i, "");
  // the owner is a file with an extension of its own (`x.pdf`), never a note (`x.excalidraw.md` is a drawing, not ink)
  return owner !== e.name && /\.[a-z0-9]{1,8}$/i.test(owner) && !/\.(md|excalidraw)$/i.test(owner) && names.has(owner);
}

/** The entries of one folder shown; `dirNote` (the tree): that folder's own note, shown as the folder's row. */
export function shownEntries<T extends Listed>(entries: T[], dirNote?: string): T[] {
  if (treeView.showAll) return entries;
  const names = new Set(entries.map((e) => e.name));
  return entries.filter((e) => !(dirNote && e.path === dirNote) && !e.name.startsWith(".") && !e.unshown && !isSatellite(e, names));
}
