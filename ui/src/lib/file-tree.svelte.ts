// The file tree's shared state: which folders are open and which row is the active file. Per-key reactive sets, so following the active file touches only the rows that change — handing a
// `reveal` prop down to every row re-ran an effect in each of them (23 000 rows after a day of tabs, session
// 043, decisions/PERFORMANCE.md).
import { SvelteSet } from "svelte/reactivity";
import { load, save } from "./prefs";
import { gitTree } from "./gitstatus.svelte";
import type { Change } from "./gen/Change";

const OPEN_KEY = "atlas.tree.expanded";
export const openDirs = new SvelteSet<string>(load<string[]>(OPEN_KEY, []));
/** The active file's path (one element at most): a row asks `activeRow.has(its path)`. */
export const activeRow = new SvelteSet<string>();
/** The last path revealed: the tree scrolls to it once its row exists (components/FileTree.svelte). */
export const revealed = $state({ path: "" });

let persistTimer: ReturnType<typeof setTimeout> | undefined;
function persist(): void {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => save(OPEN_KEY, [...openDirs]), 1000);
}

export function setOpen(dir: string, on: boolean): void {
  if (on === openDirs.has(dir)) return;
  if (on) openDirs.add(dir); else openDirs.delete(dir);
  persist();
}

/** Marks `path` active and unfolds the folders on the way to it (never folds anything). */
export function revealPath(path: string): void {
  if (activeRow.has(path)) return;
  activeRow.clear();
  revealed.path = path;
  if (!path) return;
  activeRow.add(path);
  for (let i = path.indexOf("/"); i > 0; i = path.indexOf("/", i + 1)) setOpen(path.slice(0, i), true);
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
