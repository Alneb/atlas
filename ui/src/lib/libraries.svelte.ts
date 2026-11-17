// The vault's libraries (docs/design/DESIGN-android-native-app.md §4): the list only. Two kinds share it:
// - the vault's own, in `[ui] libraries` (a folder or a Base with a kind, libraries.rs; their source is library-folders.ts),
// - those Atlas's features (Drawings, References) and the plugins register through `registerLibrary`, the call behind
//   `atlas.registerLibrary`; a plugin's library of a server's things says so (`from`), and the page puts it apart.
// The page that draws them is a plugin's pane — the one whose manifest `provides = ["libraries"]` (the Catalog,
// plugins/beta/catalog/ui) — which reads the list through `atlas.libraries`. The list's one rule for given libraries:
// when it names none of them, every one shows; when it names some, only those not hidden. With no such plugin on there
// is no page, and nothing opens.
import { untrack } from "svelte";
import type { LibraryEntry as Shown } from "./plugin-api";
import type { LibrarySpec } from "./gen/LibrarySpec";
import type { LibraryInfo } from "./gen/LibraryInfo";
import type { LibraryAdd } from "./gen/LibraryAdd";
import { settings, change } from "./settings.svelte";
import { plugins, pluginOn } from "./plugin-registry.svelte";
import { open } from "./dock";
import { toast } from "./state.svelte";
import { api } from "./api";
import { errText } from "./text";
import { folderSource, SUBJECT } from "./library-folders";
import type { PaneSpec } from "./panes";

export interface LibraryEntry extends Shown {
  /** Off for now (a built-in plugin switched off). */
  when?: () => boolean;
}

/** The role of the plugin whose pane is the Libraries page. */
export const LIBRARIES_ROLE = "libraries";
/** The plugin Atlas ships the page in: named only to read a layout or a note saved before the plugin list loaded. */
const SHIPPED = "catalog";

let given = $state.raw<LibraryEntry[]>([]);

/** Adds (or replaces, by id) a library Atlas or a plugin gives; returns its removal. */
export function registerLibrary(e: LibraryEntry): () => void {
  given = [...given.filter((x) => x.id !== e.id), e];
  return () => { given = given.filter((x) => x !== e); };
}

const specs = (): LibrarySpec[] => settings.config?.ui.libraries ?? [];
const isOwn = (s: Pick<LibrarySpec, "folder" | "base">) => !!(s.folder.trim() || s.base.trim());

// the vault's own libraries as the core resolves them (titles, icons), read again whenever the list changes
let owned = $state.raw<LibraryInfo[]>([]);
let ownedFor = "";
const ownEntries = new Map<string, { key: string; entry: LibraryEntry }>();
$effect.root(() => {
  $effect(() => {
    const list = specs().filter(isOwn);
    const key = JSON.stringify(list);
    if (key === ownedFor) return;
    ownedFor = key;
    if (!list.length) { owned = []; return; }
    api.libraries().then((all) => { if (ownedFor === key) owned = all.filter((l) => l.source !== "given"); }, () => {});
  });
});
/** One entry per own library, the same object while its settings stay (the page keeps its state). */
function ownEntry(l: LibraryInfo): LibraryEntry {
  const key = JSON.stringify(l);
  const had = ownEntries.get(l.id);
  if (had?.key === key) return had.entry;
  const entry: LibraryEntry = { id: l.id, title: l.title, icon: l.icon, by: "vault", subject: SUBJECT[l.kind] ?? l.id, source: () => folderSource(l) };
  ownEntries.set(l.id, { key, entry });
  return entry;
}

/** Every given library registered and on, whether the vault shows it or not. */
const knownGiven = (): LibraryEntry[] => given.filter((e) => e.when?.() ?? true);
/** Atlas's own first, then by name — plugins register as they load, in no fixed order. */
const byDefault = (list: LibraryEntry[]) =>
  [...list].sort((a, b) => Number(a.by !== "core" && a.by !== "library") - Number(b.by !== "core" && b.by !== "library") || a.title.localeCompare(b.title));
const givenListed = () => specs().some((s) => !isOwn(s));

/** Every library in the list's order, shown or not, with whether it is hidden: Settings' list. */
function everyLibrary(): { entry: LibraryEntry; hidden: boolean }[] {
  const known = knownGiven(), own = new Map(owned.map((l) => [l.id, l]));
  const out: { entry: LibraryEntry; hidden: boolean }[] = [];
  for (const s of specs()) {
    const e = isOwn(s) ? (own.get(s.id) && ownEntry(own.get(s.id)!)) : known.find((k) => k.id === s.id);
    if (e) out.push({ entry: e, hidden: s.hidden });
  }
  const rest = byDefault(known.filter((k) => !out.some((o) => o.entry === k)));
  const listed = givenListed();
  return [...out, ...rest.map((entry) => ({ entry, hidden: listed }))];
}

/** The libraries the vault shows, one by one, in its order: what the page draws (merging those of one subject). */
export function shownLibraries(): LibraryEntry[] {
  return everyLibrary().filter((x) => !x.hidden).map((x) => x.entry);
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

/** Every library for Settings' list: the list's order, the hidden ones in their place, the unlisted at the end. */
export const libraryChoices = (): LibraryEntry[] => everyLibrary().map((x) => x.entry);
export const libraryHidden = (id: string): boolean => everyLibrary().find((x) => x.entry.id === id)?.hidden ?? true;
/** The vault's own library `id` as its list has it (null: a given one). */
export const ownLibrary = (id: string): LibrarySpec | null => specs().find((s) => s.id === id && isOwn(s)) ?? null;

const blank = (id: string): LibrarySpec => ({ id, title: "", kind: "any", folder: "", base: "", sort: "", layout: "covers", hidden: false });

/** The list written out whole: every library in Settings' order, the given ones by id (so naming one does not hide
 *  the others), each as `edit` leaves it. */
function rewrite(label: string, edit: (list: LibrarySpec[]) => LibrarySpec[] | void): void {
  const listed = new Map(specs().map((s) => [s.id, s]));
  const all = everyLibrary().map(({ entry, hidden }) => listed.get(entry.id) ?? { ...blank(entry.id), hidden });
  // a library the list names whose giver is gone for now (a plugin switched off) keeps its place
  for (const s of specs()) if (!all.some((a) => a.id === s.id)) all.push(s);
  const next = edit(all) ?? all;
  change(label, (c) => { c.ui.libraries = next; });
}

/** Shows or hides one library; the last one shown stays. */
export function setLibraryHidden(id: string, hidden: boolean): void {
  if (hidden && shownLibraries().length <= 1 && !libraryHidden(id)) return;
  rewrite("Libraries", (all) => all.map((s) => (s.id === id ? { ...s, hidden } : s)));
}

/** Moves a library one place up (-1) or down (+1) in the list. */
export function moveLibrary(id: string, by: -1 | 1): void {
  rewrite("Libraries", (all) => {
    const i = all.findIndex((s) => s.id === id), j = i + by;
    if (i < 0 || j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
  });
}

/** Changes one of the vault's own libraries (its title, kind, sort, layout). */
export function editLibrary(id: string, patch: Partial<Omit<LibrarySpec, "id">>): void {
  rewrite("Library", (all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

/** Takes one of the vault's own libraries off the list (its files stay where they are). */
export function removeLibrary(id: string): void {
  rewrite("Library", (all) => all.filter((s) => s.id !== id));
}

/** A folder or a Base shown as a library (the core guesses its kind and makes its id); said in a toast. */
export async function addLibrary(req: Partial<LibraryAdd>): Promise<LibrarySpec | null> {
  try {
    const spec = await api.addLibrary(req);
    toast("Library added", `${spec.title || spec.folder || spec.base} — ${spec.kind}. Settings → Libraries changes it.`, "info");
    return spec;
  } catch (e) {
    toast("Not added as a library", errText(e), "error");
    return null;
  }
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
