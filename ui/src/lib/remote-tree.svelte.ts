// Server folders in the vault's tree: every plugin file source (copyparty servers, SSH hosts) under the vault's own
// rows, folded until asked, each folder listed through its source when opened and a file fetched when opened — with the
// copy fetched before when the server is out of reach (file-sources `keptCopies`). The desktop tree (FileTree.svelte)
// and the phone's Files (PhoneFiles.svelte) draw from here; the explorer stays the place to change files on a server.
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { untrack } from "svelte";
import { sources, joinPath, why, type Entry, type FileSource, type Place } from "./file-sources.svelte";
import { openPath } from "./dock";
import { load, save } from "./prefs";
import { toast } from "./state.svelte";

/** Sources that are servers: not the vault, not the other vaults this core serves (they have their own tab). */
const SKIP = new Set(["vault", "vaults"]);
export const servers = () => sources.list.filter((s) => !SKIP.has(s.id));

/** A row's key: the source, then its place, then the path in it ("" the place's top). */
export const remoteKey = (src: string, place = "", path?: string) => (path === undefined ? (place ? `${src}\n${place}` : src) : `${src}\n${place}\n${path}`);

const OPEN_KEY = "atlas.tree.remote-open";
/** Groups, places and folders unfolded (by key), kept per device. */
export const remoteOpen = new SvelteSet<string>(load<string[]>(OPEN_KEY, []));
export function setRemoteOpen(key: string, open: boolean): void {
  if (open) remoteOpen.add(key); else remoteOpen.delete(key);
  save(OPEN_KEY, [...remoteOpen]);
}

/** Each source's places, once asked; a folder's listing (its real path, its entries, or why there is none). */
export const placesOf = new SvelteMap<string, Place[]>();
export type Listing = { path: string; entries: Entry[] } | { error: string };
export const listed = new SvelteMap<string, Listing>();
export const busy = new SvelteSet<string>();

// by the source itself: a plugin started again (its settings saved) brings a new one, asked anew
const watched = new WeakSet<FileSource>();
/** The places of every server source, asked once each (again when the source says they changed). */
export function wantPlaces(): void {
  for (const s of servers()) {
    if (watched.has(s)) continue;
    watched.add(s);
    const get = () => void s.places().then((ps) => placesOf.set(s.id, ps), () => placesOf.set(s.id, []));
    get();
    s.onPlaces?.(get);
  }
}

/** A folder listed (a kept listing first when the source has one, the server's behind it). */
export async function listFolder(src: FileSource, place: string, path: string): Promise<void> {
  const key = remoteKey(src.id, place, path);
  if (untrack(() => busy.has(key))) return;
  busy.add(key);
  try {
    for (let again = true; again;) {
      again = false;
      const r = await src.list(place, path);
      if ("waiting" in r) listed.set(key, { error: r.waiting });
      else if ("file" in r) listed.set(key, { error: `a file: ${r.file}` });
      else { listed.set(key, { path: r.path, entries: r.entries }); again = !!r.stale; }
    }
  } catch (e) {
    // a listing shown before stays (offline: the folders seen keep their names); a first one says why
    if (!untrack(() => listed.get(key)) || !("entries" in listed.get(key)!)) listed.set(key, { error: why(e) });
  } finally { busy.delete(key); }
}

/** A server's file opened: its local copy fetched (or the one kept, offline), in the usual editor or viewer. */
export async function openRemote(src: FileSource, place: string, dir: string, name: string): Promise<void> {
  const key = remoteKey(src.id, place, joinPath(dir, name));
  busy.add(key);
  try { openPath(await src.local(place, joinPath(dir, name))); }
  catch (e) { toast(`Not opened from ${src.title}`, why(e), "error"); }
  finally { busy.delete(key); }
}

/** Folders first, then by name, as the tree sorts the vault's. */
export const sortEntries = (es: Entry[]) => [...es].sort((a, b) => (a.kind === "dir") !== (b.kind === "dir") ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
