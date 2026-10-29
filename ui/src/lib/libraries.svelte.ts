// The vault's libraries (docs/design/DESIGN-libraries-everywhere.md). The core and plugins register a source each; the Libraries page (panes/Libraries.svelte) shows those
// the vault's `[ui] libraries` names, in its order — none named: every one registered.
import type { IconName } from "./panes";
import type { LibrarySource } from "./library";
import { settings, change } from "./settings.svelte";
import { builtinOn } from "./builtin-plugins";

export interface LibraryEntry {
  id: string;
  title: string;
  icon: IconName;
  /** Made when the page first shows it. */
  source: () => LibrarySource | Promise<LibrarySource>;
  /** Who gives it: "core" or a plugin's id (Settings says so). */
  by: string;
  /** Off for now (a built-in plugin switched off). */
  when?: () => boolean;
}

let all = $state.raw<LibraryEntry[]>([]);

/** Adds (or replaces, by id) a library; returns its removal. */
export function registerLibrary(e: LibraryEntry): () => void {
  all = [...all.filter((x) => x.id !== e.id), e];
  return () => { all = all.filter((x) => x !== e); };
}

/** Every library registered and on, whether the vault shows it or not (Settings' list). */
export const knownLibraries = (): LibraryEntry[] => all.filter((e) => e.when?.() ?? true);

/** The libraries the vault shows, in its order. On the phone too: only a reader is native; a plugin hands it over with `atlas.openNative`. */
export function shownLibraries(): LibraryEntry[] {
  const known = knownLibraries();
  const want = settings.config?.ui.libraries ?? [];
  // none named: Atlas's own first, then by name — plugins register as they load, in no fixed order
  return want.length ? want.flatMap((id) => known.filter((e) => e.id === id)) : [...known].sort((a, b) => Number(a.by !== "core" && a.by !== "library") - Number(b.by !== "core" && b.by !== "library") || a.title.localeCompare(b.title));
}

/** Every library for Settings' list: the shown ones in their order, then the others (`[ui] libraries`). */
export const libraryChoices = (): LibraryEntry[] => { const shown = shownLibraries(); return [...shown, ...knownLibraries().filter((e) => !shown.includes(e))]; };
export const libraryHidden = (id: string): boolean => !shownLibraries().some((e) => e.id === id);

/** Shows or hides one library; the first change turns "every one" (an empty list) into the list itself. */
export function setLibraryHidden(id: string, hidden: boolean): void {
  const ids = shownLibraries().map((e) => e.id).filter((x) => x !== id);
  if (!hidden) ids.push(id);
  if (!ids.length) return; // an empty list means every library: the last one stays
  change("Libraries", (c) => { c.ui.libraries = ids; });
}

/** Moves a shown library one place up (-1) or down (+1). */
export function moveLibrary(id: string, by: -1 | 1): void {
  const ids = shownLibraries().map((e) => e.id);
  const i = ids.indexOf(id), j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  change("Libraries", (c) => { c.ui.libraries = ids; });
}

// the core's own: every drawing; the References built-in (catalog-papers' notes) while it is on
registerLibrary({ id: "drawings", title: "Drawings", icon: "edit", by: "core", source: () => import("./library-drawings").then((m) => m.drawingsSource()) });
registerLibrary({ id: "references", title: "References", icon: "library", by: "library", when: () => builtinOn("library"), source: () => import("./library-references").then((m) => m.referencesSource()) });
