// The vault's libraries (docs/design/DESIGN-libraries-everywhere.md): only the list. Plugins and the core's features
// (Drawings, References) register a source each through `registerLibrary`, the call behind `atlas.registerLibrary`;
// the page that draws them is a plugin's pane — the one whose manifest `provides = ["libraries"]` (the Catalog,
// plugins/beta/catalog/ui) — which reads the list through `atlas.libraries`. The vault's `[ui] libraries` names those
// shown, in its order — none named: every one registered. With no such plugin on there is no page, and nothing opens.
import { untrack } from "svelte";
import type { LibraryEntry as Shown } from "./plugin-api";
import { settings, change } from "./settings.svelte";
import { plugins, pluginOn } from "./plugin-registry.svelte";
import { open } from "./dock";
import { toast } from "./state.svelte";
import type { PaneSpec } from "./panes";

export interface LibraryEntry extends Shown {
  /** Off for now (a built-in plugin switched off). */
  when?: () => boolean;
}

/** The role of the plugin whose pane is the Libraries page. */
export const LIBRARIES_ROLE = "libraries";
/** The plugin Atlas ships the page in: named only to read a layout or a note saved before the plugin list loaded. */
const SHIPPED = "catalog";

let all = $state.raw<LibraryEntry[]>([]);

/** Adds (or replaces, by id) a library; returns its removal. */
export function registerLibrary(e: LibraryEntry): () => void {
  all = [...all.filter((x) => x.id !== e.id), e];
  return () => { all = all.filter((x) => x !== e); };
}

/** Every library registered and on, whether the vault shows it or not (Settings' list). */
const knownLibraries = (): LibraryEntry[] => all.filter((e) => e.when?.() ?? true);

/** The libraries the vault shows, one by one, in its order: what the page draws (merging those of one subject),
 *  what Settings lists, hides and orders. */
export function shownLibraries(): LibraryEntry[] {
  const known = knownLibraries();
  const want = settings.config?.ui.libraries ?? [];
  // none named: Atlas's own first, then by name — plugins register as they load, in no fixed order
  return want.length ? want.flatMap((id) => known.filter((e) => e.id === id)) : [...known].sort((a, b) => Number(a.by !== "core" && a.by !== "library") - Number(b.by !== "core" && b.by !== "library") || a.title.localeCompare(b.title));
}

/** Calls `fn` with the shown libraries now and whenever they change (not on every settings save that leaves them);
 *  returns the unsubscribe (`atlas.libraries.onChange`). */
export function watchLibraries(fn: (list: LibraryEntry[]) => void): () => void {
  let last: LibraryEntry[] | null = null;
  return $effect.root(() => {
    $effect(() => {
      const list = shownLibraries();
      if (last && last.length === list.length && last.every((e, i) => e === list[i])) return;
      last = list;
      untrack(() => fn(list));
    });
  });
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

/** The plugin whose pane is the Libraries page, while one is on. */
export const librariesPage = () => plugins.list.find((p) => p.provides.includes(LIBRARIES_ROLE) && p.view && pluginOn(p)) ?? null;

/** The Libraries page as a pane, at library `at`: one tab whatever the library (`anchor` is not part of its id; an open
 *  page goes to it, `atlas.pane.onAnchor`). Before the plugin list is loaded, the plugin Atlas ships it in. */
export function librariesSpec(at?: string): PaneSpec {
  return { kind: "plugin", id: librariesPage()?.id ?? SHIPPED, title: "Library", icon: "library", ...(at ? { anchor: at } : {}) };
}

/** Opens the Libraries page (at library `at`); with no plugin giving it, says which to switch on. */
export function openLibraries(at?: string): void {
  if (plugins.loaded && !librariesPage()) {
    toast("No Libraries page", "The Libraries page is the Catalog plugin's: switch it on in Settings → Plugins.", "info");
    return;
  }
  open(librariesSpec(at));
}
