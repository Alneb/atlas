// The vault's libraries (docs/design/DESIGN-libraries-everywhere.md). The core and plugins register a source each; the Libraries page (panes/Libraries.svelte) shows those
// the vault's `[ui] libraries` names, in its order — none named: every one registered.
import type { IconName } from "./panes";
import type { LibrarySource } from "./library";
import { settings } from "./settings.svelte";
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

// the core's own: every drawing; the References built-in (catalog-papers' notes) while it is on
registerLibrary({ id: "drawings", title: "Drawings", icon: "edit", by: "core", source: () => import("./library-drawings").then((m) => m.drawingsSource()) });
registerLibrary({ id: "references", title: "References", icon: "library", by: "library", when: () => builtinOn("library"), source: () => import("./library-references").then((m) => m.referencesSource()) });
