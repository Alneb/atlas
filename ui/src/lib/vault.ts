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

const nameOf = (f: string) => f.slice(f.lastIndexOf("/") + 1).toLowerCase();

function index(files: string[]): void {
  all = new Set();
  byName = new Map();
  for (const f of files) add(f);
}
function add(f: string): void {
  if (all.has(f)) return;
  all.add(f);
  const list = byName.get(nameOf(f));
  if (list) list.push(f); else byName.set(nameOf(f), [f]);
}
function remove(f: string): void {
  if (!all.delete(f)) return;
  const list = byName.get(nameOf(f))?.filter((x) => x !== f);
  if (list?.length) byName.set(nameOf(f), list); else byName.delete(nameOf(f));
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

/** Above this many new paths in one go (an unzip, a sync) the whole list is fetched again instead. */
const MOST_ASKED = 20;
let pending = { gone: new Set<string>(), fresh: new Set<string>(), all: false };
let timer: ReturnType<typeof setTimeout> | undefined;
// The list kept current from the events themselves: a path gone takes what was under it, a new one is asked for alone
// (`/api/files?under=`, a file or a whole new folder); only an event that names nothing refetches the whole list.
on("gone", (e) => { for (const p of e.paths) pending.gone.add(p); later(); });
on("fs", (e) => {
  if (!e.paths.length) pending.all = true;
  // a known file only rewritten (every autosave) needs nothing; anything else (new, a folder, moved away) is asked
  for (const p of e.paths) if (!all.has(p) && !isBookkeeping(p)) pending.fresh.add(p);
  if (pending.all || pending.fresh.size) later();
});
function later(): void { clearTimeout(timer); timer = setTimeout(() => void apply(), 300); }
async function apply(): Promise<void> {
  const { gone, fresh, all: everything } = pending;
  pending = { gone: new Set(), fresh: new Set(), all: false };
  if (!loading) return; // never listed: the first listing will be current
  await loading;
  if (everything || fresh.size > MOST_ASKED) return void refreshVault();
  const dropUnder = (p: string) => { for (const f of [...all]) if (f === p || f.startsWith(`${p}/`)) remove(f); };
  for (const g of gone) dropUnder(g);
  try {
    const asked = [...fresh];
    const lists = await Promise.all(asked.map((under) => api.files({ under })));
    // what is at or under an asked path is its answer: a folder moved away answers nothing, even without a `gone`
    asked.forEach((p, i) => { dropUnder(p); for (const f of lists[i]) add(f); });
  } catch { return void refreshVault(); }
  listeners.forEach((fn) => fn());
}


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
