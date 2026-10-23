// The file tree's shared state: which folders are open and which row is the active file. Per-key reactive sets, so following the active file touches only the rows that change — handing a
// `reveal` prop down to every row re-ran an effect in each of them (23 000 rows after a day of tabs).
import { SvelteSet } from "svelte/reactivity";
import { load, save } from "./prefs";
import { gitTree } from "./gitstatus.svelte";
import type { Change } from "./gen/Change";
import { onPluginEvent } from "./plugin-events";

const OPEN_KEY = "atlas.tree.expanded";
export const openDirs = new SvelteSet<string>(load<string[]>(OPEN_KEY, []));
/** The active file's path (one element at most): a row asks `activeRow.has(its path)`. */
export const activeRow = new SvelteSet<string>();
/** The last path revealed: the tree scrolls to it once its row exists (components/FileTree.svelte); `n` counts the
 *  asks, so opening the active file again scrolls back to it too. */
export const revealed = $state({ path: "", n: 0 });
/** Folders unfolded only to show the active file: folded again once it is elsewhere, never remembered. A folder the
 *  user opens or closes leaves this set (it is theirs from then on). */
const autoOpen = new Set<string>();

// a folder renamed or moved (from either explorer, any vault move: api.move) stays open under its new name, and
// so do the open folders inside it
onPluginEvent("core:file-tree", "file:rename", ({ from, to }) => {
  const moved = [...openDirs].filter((d) => d === from || d.startsWith(`${from}/`));
  for (const d of moved) {
    const n = to + d.slice(from.length);
    openDirs.delete(d); openDirs.add(n);
    if (autoOpen.delete(d)) autoOpen.add(n);
  }
  if (moved.length) persist();
});

let persistTimer: ReturnType<typeof setTimeout> | undefined;
function persist(): void {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => save(OPEN_KEY, [...openDirs].filter((d) => !autoOpen.has(d))), 1000);
}

export function setOpen(dir: string, on: boolean): void {
  autoOpen.delete(dir);
  if (on === openDirs.has(dir)) return;
  if (on) openDirs.add(dir); else openDirs.delete(dir);
  persist();
}

/** Marks `path` active ("": nothing) and unfolds the folders on the way to it, folding back those unfolded for the
 *  previous one: the tree shows where you are, not everywhere you have been. */
export function revealPath(path: string): void {
  revealed.n++;
  if (activeRow.has(path) || (!path && !activeRow.size)) return;
  activeRow.clear();
  revealed.path = path;
  const way = new Set<string>();
  for (let i = path.indexOf("/"); i > 0; i = path.indexOf("/", i + 1)) way.add(path.slice(0, i));
  for (const d of [...autoOpen]) if (!way.has(d)) { autoOpen.delete(d); openDirs.delete(d); }
  for (const d of way) if (!openDirs.has(d)) { openDirs.add(d); autoOpen.add(d); }
  if (path) activeRow.add(path);
}

/** A file's or folder's git change, as the tree shows it: its own, a folder's loudest, or an untracked
 *  ancestor's (git lists an untracked folder as a whole) — found by walking up, not by scanning every change. */
export function changeOf(path: string, isDir: boolean): Change | undefined {
  const own = gitTree.files[path] ?? (isDir ? gitTree.dirs[path] : undefined);
  if (own) return own;
  for (let i = path.lastIndexOf("/"); i > 0; i = path.lastIndexOf("/", i - 1)) {
    if (gitTree.files[path.slice(0, i)] === "untracked") return "untracked";
  }
  return undefined;
}
