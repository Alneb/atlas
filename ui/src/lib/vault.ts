// Obsidian link resolution for the UI: one list of every workspace file (GET /api/files), refreshed
// on file events, so `[[note]]` and `![[pic.png]]` resolve synchronously while rendering.
// Same rules as the core's links.rs: explicit path (from the root for wikilinks, from the note for
// markdown links), then by file name — same folder first, then the shortest path.
import { dirOf } from "./paths";
import { isAgentFile } from "./agent-files";
import { api } from "./api";
import { isBookkeeping, on } from "./bus";
import { resolveRel } from "./markdown";

let all = new Set<string>();
let byName = new Map<string, string[]>();
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function index(files: string[]): void {
  all = new Set(files);
  byName = new Map();
  for (const f of files) {
    const n = f.slice(f.lastIndexOf("/") + 1).toLowerCase();
    const list = byName.get(n);
    if (list) list.push(f); else byName.set(n, [f]);
  }
}

/** Load (or reload) the file list; listeners re-render whatever resolved against the old one. */
export function refreshVault(): Promise<void> {
  loading = api.files().then(index, () => {}).then(() => listeners.forEach((fn) => fn()));
  return loading;
}
export const vaultReady = (): Promise<void> => loading ?? refreshVault();
/** Every file of the vault, as last listed (after `vaultReady`). */
export const vaultFiles = (): ReadonlySet<string> => all;
export function onVaultChange(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }

/** Calls `fn` (debounced by `wait` ms) when files appear, go or move — not when a known file is only rewritten,
 *  which is every autosave. Removals come as `gone` (the paths are still known when their `fs` arrives); an `fs`
 *  with no paths means "anything may have changed". Returns the unsubscribe. */
export function onFilesAddedOrRemoved(fn: () => void, wait: number): () => void {
  void vaultReady(); // "known" means in the index: loaded even when no note asked for it yet
  return whenAddedOrRemoved(fn, wait);
}
function whenAddedOrRemoved(fn: () => void, wait: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  const later = () => { clearTimeout(t); t = setTimeout(fn, wait); };
  const offFs = on("fs", (e) => { if (!e.paths.length || !e.paths.every((p) => all.has(p) || isBookkeeping(p))) later(); });
  const offGone = on("gone", later);
  return () => { offFs(); offGone(); clearTimeout(t); };
}

whenAddedOrRemoved(() => void refreshVault(), 300);


/**
 * The workspace path a link points at, or null when nothing matches.
 * `fromDir` is the folder of the note holding the link; `wiki` selects wikilink rules.
 */
export function resolveLink(target: string, fromDir: string, wiki = true): string | null {
  let t = target.split("#")[0].split("|")[0].trim();
  try { t = decodeURI(t); } catch { /* keep as written */ }
  if (!t) return null;
  if (t.startsWith("/")) t = t.slice(1);
  const name = t.slice(t.lastIndexOf("/") + 1);
  // `x.excalidraw` names the vault's `x.excalidraw.md` (Obsidian appends .md when the file is a note)
  const cands = name.includes(".") ? [t, `${t}.md`] : [`${t}.md`, t];
  for (const c of cands) {
    const rel = resolveRel(c, fromDir);
    const root = resolveRel(c);
    for (const p of wiki ? [root, rel] : [rel, root]) if (all.has(p)) return p;
  }
  if (!wiki) return null;
  const fromAgent = isAgentFile(fromDir);
  for (const c of cands) {
    const n = c.slice(c.lastIndexOf("/") + 1).toLowerCase();
    const suffix = `/${c.toLowerCase()}`;
    // a note's `[[name]]` never lands on one of the agent's files (they link among themselves)
    const hits = (byName.get(n) ?? []).filter((p) => (!c.includes("/") || p.toLowerCase().endsWith(suffix)) && (fromAgent || !isAgentFile(p)));
    if (!hits.length) continue;
    hits.sort((a, b) => Number(dirOf(a) !== fromDir) - Number(dirOf(b) !== fromDir) || a.length - b.length);
    return hits[0];
  }
  return null;
}

/** Like resolveLink, but always a path: unresolved targets fall back to beside the note. */
export function resolveOrBeside(target: string, fromDir: string, wiki = true): string {
  return resolveLink(target, fromDir, wiki) ?? resolveRel(target.split("|")[0].split("#")[0].trim(), fromDir);
}
