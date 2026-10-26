// The other vaults in the explorer: every vault this core serves at `/v/<name>/` (the desktop's one
// core, a server's vaults) is a place, read and written through that vault's own API. A file opens from its copy in
// `.atlas/remote/vaults/<name>/…`, and each save of the copy goes back (refused when the file changed there meanwhile),
// as a remote file does (file-sources.svelte.ts).
import { api, apiBase, ApiError } from "./api";
import { addSource, joinPath, parentPath, REMOTE, IMAGE, type FileSource, type Entry, type Place } from "./file-sources.svelte";
import type { TreeEntry } from "./gen/TreeEntry";

const ID = "vaults";

/** A place (`/v/notes/`) → its API's base: this page's own with the vault's prefix in place of its own. */
const baseOf = (place: string) => `${apiBase().replace(/\/v\/[^/]+\/?$/, "")}${place.replace(/\/+$/, "")}`;
/** `/v/notes/` ⇄ `notes`: the copy's folder names its vault, so a save after a restart still knows where it goes. */
const nameOf = (place: string) => place.replace(/\/+$/, "").split("/").pop()!;
const copyOf = (place: string, path: string) => `${REMOTE}${ID}/${nameOf(place)}/${path}`;

async function call(place: string, method: string, path: string, query: Record<string, string> = {}, body?: BodyInit, json = false): Promise<Response> {
  const qs = new URLSearchParams(query).toString();
  const r = await fetch(`${baseOf(place)}${path}${qs ? `?${qs}` : ""}`, { method, body, headers: { "x-atlas": "1", ...(json ? { "content-type": "application/json" } : {}) } });
  if (!r.ok) throw new ApiError(r.status, `${nameOf(place)}: ${(await r.text().catch(() => "")) || `${method} ${path}: ${r.status}`}`);
  return r;
}

const tree = async (place: string, path: string): Promise<TreeEntry[]> => (await call(place, "GET", "/api/tree", path ? { path } : {})).json();
/** The file's state there — its last change (seconds) and size, as a save done within the same second differs only in
 *  size — or null when it is gone. */
async function stateThere(place: string, path: string): Promise<string | null> {
  const e = (await tree(place, parentPath(path))).find((e) => e.name === path.split("/").pop());
  return e ? `${e.modified}:${e.size}` : null;
}

/** What each copy was taken from, this run (a copy from before a restart has no record: its save asks to save over). */
const seen = new Map<string, string | null>();

export const otherVaults: FileSource = {
  id: ID, title: "Other vaults", icon: "folder-tree", hideEmpty: true,
  places: async () => {
    const l = await api.vaults();
    return l.vaults
      .filter((v) => v.url?.startsWith("/v/") && v.path !== l.current && !v.missing)
      .map((v): Place => ({ id: v.url!, title: v.name, detail: v.path }));
  },
  list: async (place, path) => ({
    path,
    entries: (await tree(place, path)).map((e): Entry => ({ name: e.name, kind: e.kind === "dir" ? "dir" : "file", size: e.size, modified: e.modified })),
  }),
  local: async (place, path) => {
    const copy = copyOf(place, path);
    const state = await stateThere(place, path);
    await api.upload(copy, await (await call(place, "GET", "/api/raw", { path })).blob(), true);
    seen.set(copy, state);
    return copy;
  },
  save: async (local, force) => {
    const [name, ...rest] = local.slice(`${REMOTE}${ID}/`.length).split("/");
    const place = `/v/${name}/`, path = rest.join("/");
    const now = await stateThere(place, path);
    if (!force && (!seen.has(local) || seen.get(local) !== now)) {
      return { changed: seen.has(local) ? `${path} changed in ${name} since it was opened here` : `${path}: opened before Atlas started again, so a change in ${name} would not be seen` };
    }
    await call(place, "POST", "/api/fs/upload", { path, replace: "true" }, await api.raw(local));
    seen.set(local, await stateThere(place, path));
    return { saved: `${name}: ${path}` };
  },
  mkdir: async (place, path) => void (await call(place, "POST", "/api/fs/mkdir", { path })),
  rename: async (place, from, to) => void (await call(place, "POST", "/api/fs/move", {}, JSON.stringify({ from, to }), true)),
  remove: async (place, path) => `Moved to ${(await (await call(place, "POST", "/api/fs/trash", { path })).json()).to} in ${nameOf(place)}`,
  upload: async (place, local, dir, replace) => {
    try {
      await call(place, "POST", "/api/fs/upload", { path: joinPath(dir, local.split("/").pop()!), ...(replace ? { replace: "true" } : {}) }, await api.raw(local));
    } catch (e) { if (e instanceof ApiError && e.status === 409) return "exists"; throw e; }
    return "done";
  },
  thumb: async (place, path, width) => (IMAGE.test(path) ? (await call(place, "GET", "/api/thumb", { path, w: String(width) })).blob() : null),
};
addSource(otherVaults);
