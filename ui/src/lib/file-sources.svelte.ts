// File sources: what the explorer (panes/Explorer.svelte) browses — one explorer for the vault, SSH hosts
// and copyparty servers. The vault is built in; a plugin adds one with `atlas.files.source(…)`.
// A remote file opens from its local copy, `.atlas/remote/<plugin>/…`, in the same editor or viewer as any
// file, and every save of that copy goes back through its source (`save`). docs/REFACTOR-explorer.md.
import { errText } from "./text";
import { api } from "./api";
import { app, toast } from "./state.svelte";
import { open, openPath } from "./dock";
import { movedTabs } from "./gone-files";
import { onPluginEvent } from "./plugin-events";
import { pick } from "./palette.svelte";
import { isIconName } from "./icons";
import { vaultFiles, vaultReady } from "./vault";
import { exists } from "./vault-files";
import { basename } from "./paths";
import { rel } from "./time";
import type { IconName } from "./panes";

export type EntryKind = "dir" | "file" | "link";
export interface Entry {
  name: string;
  kind: EntryKind;
  size?: number;
  /** Seconds since 1970. */
  modified?: number;
  /** A vault note with `shown: false` (hidden like the tree hides it). */
  unshown?: boolean;
}
/** A folder's answer: its entries (and its real path: "" may mean the home folder), a login to wait for,
 *  or "that path is a file" (a link to one). */
/** `stale`: a listing kept from before (a source's own cache, shown at once); the explorer asks again for the server's. */
export type Listed = { path: string; entries: Entry[]; stale?: boolean } | { waiting: string } | { file: string };
/** Where a source starts: an SSH host, a copyparty server. `up`: connected now. */
export interface Place { id: string; title: string; detail?: string; up?: boolean }
/** A save of a local copy: done (where it went), refused (changed there since it was fetched), or waiting for a login. */
export type Saved = { saved: string } | { changed: string } | { waiting: string };

/** Everything but `places`, `list` and `local` is optional: a missing one hides its button. */
export interface FileSource {
  /** The plugin's id (the vault's: "vault"); its copies live in `.atlas/remote/<id>/`. */
  id: string;
  title: string;
  icon: IconName;
  places(): Promise<Place[]>;
  list(place: string, path: string): Promise<Listed>;
  /** A vault path to open for this file: the vault's own, or a fresh local copy of a remote one. */
  local(place: string, path: string): Promise<string>;
  /** The local copy `local` back to where it came from; `force`: over a newer version there. */
  save?(local: string, force: boolean): Promise<Saved>;
  mkdir?(place: string, path: string): Promise<void>;
  rename?(place: string, from: string, to: string): Promise<void>;
  /** → what became of it ("Moved to the Trash"), shown to the user. */
  remove?(place: string, path: string, dir: boolean): Promise<string | void>;
  /** The vault file `local` into the folder `dir`; "exists" when a file of that name is there and not `replace`. */
  upload?(place: string, local: string, dir: string, replace: boolean): Promise<"done" | "exists">;
  /** Into a vault folder → the vault path written. */
  download?(place: string, path: string, folder: string, dir: boolean): Promise<string>;
  /** No group in the explorer while it has no places (nothing to set up: the other vaults). */
  hideEmpty?: boolean;
  /** Called when the places change (a host connected): the explorer redraws them. */
  onPlaces?(fn: () => void): () => void;
  /** A picture of the file for the explorer's Thumbnails view, about `width` px wide: image bytes, or the vault path of
   *  an image (thumbnailed by the core); null when there is none (the file's icon shows). */
  thumb?(place: string, path: string, width: number): Promise<Blob | string | null>;
}

export const REMOTE = ".atlas/remote/";
/** Pictures the core can thumbnail (`/api/thumb`): IMAGE_RE (paths.ts) without the drawn kinds (svg, ico). */
export const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
/** Every folder's last listing ("source\nplace\npath"), for this run of Atlas: a folder seen before shows at once and
 *  is refreshed behind. */
export const listings = new Map<string, { path: string; entries: Entry[] }>();
export const listingKey = (source: string, place: string, path: string) => `${source}\n${place}\n${path}`;
export const sources = $state<{ list: FileSource[] }>({ list: [] });
export const sourceOf = (id: string) => sources.list.find((s) => s.id === id);
/** A source by its id, for a plugin reading another's server: its absence said (the plugin off, or not in this vault). */
export function sourceNamed(id: string): FileSource {
  const s = sourceOf(id);
  if (!s) throw new Error(`no file source “${id}” (its plugin is off, or not in this vault)`);
  return s;
}

/** Paths: the vault's are relative ("" is its top), a remote one's absolute ("" is the home folder). */
export const joinPath = (dir: string, name: string) => (!dir ? name : dir === "/" ? `/${name}` : `${dir.replace(/\/+$/, "")}/${name}`);
export const parentPath = (path: string) => (path.startsWith("/") ? path.replace(/\/+$/, "").replace(/\/[^/]*$/, "") || "/" : path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/** A save of a local copy goes back through its source; what happened is told (a refusal offers to save over). */
async function saveBack(src: FileSource, path: string): Promise<void> {
  const go = (force: boolean) => src.save!(path, force);
  try {
    const r = await go(false);
    if ("waiting" in r) toast(`Not saved to ${src.title}`, `${r.waiting} Then save again.`, "error", 9000);
    else if ("changed" in r) toast(`Not saved to ${src.title}`, `${r.changed}. Click to save over it.`, "error", 12000, () => void go(true).then((again) => toast("Saved", "saved" in again ? again.saved : path, "success"), (e) => toast(`Not saved to ${src.title}`, why(e), "error")));
    else toast("Saved", r.saved, "success");
  } catch (e) { toast(`Not saved to ${src.title}`, why(e), "error", 9000); }
}

/** A source joins (and leaves with the returned function); `owner`: the plugin it belongs to. */
// each source's undo, by id: a plugin started again (a save, two starts racing on load) replaces its source, never doubles it
const removers = new Map<string, () => void>();
export function addSource(src: FileSource): () => void {
  removers.get(src.id)?.();
  sources.list.push(src);
  const offSave = src.save ? onPluginEvent(src.id, "file:save", ({ path }) => { if (path.startsWith(`${REMOTE}${src.id}/`)) return saveBack(src, path); }) : () => {};
  const remove = () => {
    offSave();
    const i = sources.list.indexOf(src);
    if (i >= 0) sources.list.splice(i, 1);
    if (removers.get(src.id) === remove) removers.delete(src.id);
  };
  removers.set(src.id, remove);
  return remove;
}

/** A plugin's source, checked at the door: a plugin is JavaScript, its mistakes are told here, not deep in the explorer. */
export function pluginSource(plugin: { id: string; title: string }, s: Partial<Omit<FileSource, "id" | "icon">> & { icon?: string }): FileSource {
  for (const k of ["places", "list", "local"] as const) if (typeof s[k] !== "function") throw new Error(`files.source: “${k}” is missing (places, list and local are needed)`);
  const title = s.title ?? plugin.title;
  return { ...(s as Omit<FileSource, "id" | "icon">), id: plugin.id, title, icon: s.icon && isIconName(s.icon) ? s.icon : "server", local: keptCopies(plugin.id, title, s.local!) };
}

// Each remote file's last local copy ("source\nplace\npath" → its vault path, when fetched), kept between runs: with the
// server out of reach (offline, the VPN down) the copy fetched before opens, said so, for every source and every caller
const KEPT = "atlas.remote.kept", MAX_KEPT = 2000;
type Kept = Record<string, { local: string; at: number }>;
const kept: Kept = (() => { try { return JSON.parse(localStorage.getItem(KEPT) ?? "{}") as Kept; } catch { return {}; } })();
function keepKept(): void {
  const keys = Object.keys(kept);
  if (keys.length > MAX_KEPT) for (const k of keys.sort((a, b) => kept[a].at - kept[b].at).slice(0, keys.length - MAX_KEPT)) delete kept[k];
  try { localStorage.setItem(KEPT, JSON.stringify(kept)); } catch { /* full: kept for this run */ }
}
function keptCopies(id: string, title: string, local: FileSource["local"]): FileSource["local"] {
  return async (place, path) => {
    const key = listingKey(id, place, path);
    try {
      const at = await local(place, path);
      kept[key] = { local: at, at: Date.now() };
      keepKept();
      return at;
    } catch (e) {
      const k = kept[key];
      if (!k || !(await exists(k.local))) throw e;
      toast(`Not fetched from ${title}`, `${why(e)} — ${basename(path)} opened from the copy fetched ${rel(k.at)}.`, "error", 9000);
      return k.local;
    }
  };
}

/** The explorer at a place of a source (default: the vault's top folder); a tab already there comes forward. */
export function openExplorer(source = "vault", place = "", path?: string): void {
  open({ kind: "explorer", source, place, ...(path ? { path } : {}) });
}

export const why = (e: unknown) => errText(e).replace(/^POST \S+: \d+ [^:]*: plugin [\w-]+: (\w+: )?/, "").replace(/^(Runtime|Value)Error: /, "");

/** The vault's folders, for "Download into…" (the folder of the open file first). */
export async function chooseVaultFolder(placeholder: string, tag: string): Promise<string | null> {
  await vaultReady(); // the one list of the vault's files, kept current (lib/vault.ts)
  const files = vaultFiles();
  const folders = new Set<string>();
  for (const f of files) for (let p = parentPath(f); p && !folders.has(p); p = parentPath(p)) folders.add(p);
  return new Promise((resolve) => {
    pick({
      placeholder, tag, icon: "folder",
      items: [{ value: "", title: `${app.workspace?.name ?? "the vault"} (top folder)` }, ...[...folders].sort().map((f) => ({ value: f, title: f }))],
      typed: (t) => `Into ${t.replace(/^\/+|\/+$/g, "")} (a new folder)`,
      onpick: (v) => resolve(v.trim().replace(/^\/+|\/+$/g, "")),
    });
  });
}

// ---- the vault ----------------------------------------------------------------------------------------
export const vaultSource: FileSource = {
  id: "vault", title: "Vault", icon: "files",
  places: async () => [{ id: "", title: app.workspace?.name ?? "Vault", up: true }],
  list: async (_place, path) => ({
    path,
    // every entry, dotfiles too: the explorer hides by the tree's rule (lib/tree-view.svelte.ts), behind its own toggle
    entries: (await api.tree(path, true)).map((e) => ({ name: e.name, kind: e.kind === "dir" ? "dir" : "file", size: e.size, modified: e.modified, unshown: e.unshown })),
  }),
  local: async (_place, path) => path,
  mkdir: (_place, path) => api.mkdir(path),
  rename: async (_place, from, to) => {
    const follow = movedTabs(from, to); // the tabs that showed it follow to the new place
    await api.move(from, to);
    for (const p of follow) openPath(p);
  },
  remove: async (_place, path) => `Moved to ${(await api.trash(path)).to}`,
  upload: async (_place, local, dir, replace) => {
    const to = joinPath(dir, local.split("/").pop()!);
    if (to === local) return "done";
    try { await api.upload(to, await api.raw(local), replace); } catch (e) { if (/409/.test(String(e))) return "exists"; throw e; }
    return "done";
  },
  thumb: async (_place, path, width) => {
    if (IMAGE.test(path)) return path;
    if (!/\.(pdf|epub)$/i.test(path)) return null;
    // the core's picture — a PDF's first page, an EPUB's cover — made once and kept in .atlas/cache/thumbs (thumbs.rs);
    // a PDF is drawn here only where the core cannot (no poppler: a phone)
    try { return await api.thumb(path, width); } catch (e) { if (/\.epub$/i.test(path)) return null; void e; }
    return (await import("./pdf-pages")).pageBlob(path, 1, width, "image/webp"); // the first page
  },
};
addSource(vaultSource);

/** A remote file into a vault folder, never over a file there (a second copy gets a number) → the vault path written.
 *  A source without a download of its own: its local copy, copied over. */
export async function downloadInto(src: FileSource, place: string, path: string, folder: string, dir: boolean): Promise<string> {
  if (src.download) return src.download(place, path, folder, dir);
  if (dir) throw new Error(`${src.title}: a folder is downloaded file by file`);
  const data = await api.raw(await src.local(place, path));
  const name = path.replace(/\/+$/, "").split("/").pop() || "download";
  for (let n = 1; ; n++) {
    const to = joinPath(folder, n === 1 ? name : name.replace(/(\.[^.]*)?$/, ` ${n}$1`));
    try { await api.upload(to, data, false); return to; } catch (e) { if (!/409/.test(String(e))) throw e; }
  }
}

/** Files from this computer (a file chooser, a drop) into a folder of a source. A remote source gets them
 *  through a local copy first: its upload takes a vault file. → the names that were already there. */
export async function receive(src: FileSource, place: string, dir: string, files: File[], replace: boolean): Promise<File[]> {
  const exists: File[] = [];
  for (const f of files) {
    if (src.id === vaultSource.id) {
      try { await api.upload(joinPath(dir, f.name), f, replace); } catch (e) { if (/409/.test(String(e))) { exists.push(f); continue; } throw e; }
      continue;
    }
    if (!src.upload) throw new Error(`${src.title} takes no uploads`);
    const staged = `${REMOTE}${src.id}/.upload/${f.name}`;
    await api.upload(staged, f, true);
    if ((await src.upload(place, staged, dir, replace)) === "exists") exists.push(f);
  }
  return exists;
}
