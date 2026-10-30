// Git status for the file tree: path → change (the working-tree side wins over the staged side, as
// that is what the user sees on disk); folders get the "loudest" change of anything inside them.
import { api } from "./api";
import { isBookkeeping, on } from "./bus";
import type { Change } from "./gen/Change";
import type { GitRepo } from "./gen/GitRepo";

export const gitTree = $state({ files: {} as Record<string, Change>, dirs: {} as Record<string, Change>, repo: null as GitRepo | null });

/** Whether the vault is a git repository, asked once (what says "not committed yet" needs to know). */
export function knowRepo(): void {
  if (gitTree.repo === null) void refreshGitTree();
}

// a folder shows the most important change below it
const RANK: Record<Change, number> = { conflicted: 5, deleted: 4, modified: 3, renamed: 2, added: 1, untracked: 0 };

let lastTree = "";
export async function refreshGitTree(): Promise<void> {
  const st = await api.gitStatus().catch(() => null);
  if (st) gitTree.repo = st.repo;
  const key = JSON.stringify(st?.entries ?? []);
  if (key === lastTree) return; // the same answer: nothing redrawn
  lastTree = key;
  const files: Record<string, Change> = {}, dirs: Record<string, Change> = {};
  for (const e of st?.entries ?? []) {
    const c = e.unstaged ?? e.staged;
    if (!c) continue;
    const path = e.path.replace(/\/$/, ""); // git lists an untracked folder as `dir/`
    files[path] = c;
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const d = parts.slice(0, i).join("/");
      if (!dirs[d] || RANK[c] > RANK[dirs[d]]) dirs[d] = c;
    }
  }
  gitTree.files = files;
  gitTree.dirs = dirs;
}

export const LETTER: Record<Change, string> = { modified: "M", added: "A", untracked: "U", deleted: "D", renamed: "R", conflicted: "C" };

// Atlas's own writes (caches, trash, the layout) and git's own are not changes anyone reviews in git
const quiet = (p: string) => isBookkeeping(p) || p.startsWith(".git/");

/** Calls `fn` after file changes have been quiet for `wait` ms, never for Atlas's own cache / trash writes, and not
 *  while `shown()` is false — then once when shown again. Returns the unsubscribe. */
export function onGitWorthyChange(fn: () => void, shown: () => boolean, wait = 2000): () => void {
  let t: ReturnType<typeof setTimeout> | undefined, missed = false;
  const fire = () => { if (shown() && !document.hidden) { missed = false; fn(); } else missed = true; };
  const off = on("fs", (e) => {
    if (e.paths.length && e.paths.every(quiet)) return;
    clearTimeout(t);
    t = setTimeout(fire, wait);
  });
  const back = () => { if (missed) fire(); };
  const iv = setInterval(back, 1000); // a hidden panel catches up when it is shown again
  return () => { off(); clearTimeout(t); clearInterval(iv); };
}
