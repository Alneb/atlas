// A tab does not outlive its file: when the file is deleted, moved or renamed (in Atlas, a terminal
// or git), its tab closes; a move made in Atlas reopens it at the new place, and so does a rename
// made elsewhere when the new name is plain to see (`findMoved`). Tabs restored from the layout are
// checked too: a folder renamed while Atlas was closed showed "GET /api/file: 404" in its tab. A tab
// with unsaved text stays — closing would lose the text, saving would bring the file back unasked.
import type { DockviewApi, IDockviewPanel } from "dockview-core";
import { on } from "./bus";
import { app, toast } from "./state.svelte";
import { api } from "./api";
import { exists } from "./vault-files";
import { shownPath } from "./paths";
import type { PaneSpec } from "./panes";

const FILE_KINDS: ReadonlySet<PaneSpec["kind"]> = new Set(["editor", "pdf", "image", "table", "base", "excalidraw", "page"]);
let dock: DockviewApi | undefined;

const fileOf = (p: IDockviewPanel): string | null => {
  const s = p.params as Partial<PaneSpec> & { path?: string };
  return s.kind && FILE_KINDS.has(s.kind) && s.path ? s.path : null;
};
const within = (path: string, changed: string) => path === changed || path.startsWith(`${changed}/`);

const words = (name: string) => new Set(name.toLowerCase().split(/[\s_.\-]+/).filter(Boolean));
/** How alike two names are (the share of their words in common, 0…1) — 0 unless one name only
 *  adds or drops words: "…_4pi_avg_2nb…" → "…_4pi_2nb…" is a rename, "…_316840" → "…_316841" is
 *  another run, never the same file. */
function alike(a: string, b: string): number {
  const x = words(a), y = words(b);
  const both = [...x].filter((w) => y.has(w)).length;
  if (both < Math.min(x.size, y.size)) return 0;
  return both / (x.size + y.size - both || 1);
}
const extOf = (name: string) => (name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "");

/** Where a missing file most likely went: from the deepest folder that still exists, each missing
 *  part replaced by the most alike entry beside it (same kind; a file keeps its extension) when
 *  that one is clearly the best. */
export async function findMoved(path: string): Promise<string | null> {
  const parts = path.split("/");
  let at = "";
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    const entries = await api.tree(at).catch(() => []);
    const want = parts[i], here = at ? `${at}/${want}` : want;
    if (entries.some((e) => e.path === here)) { at = here; continue; }
    const kin = entries.filter((e) => (last ? e.kind !== "dir" && extOf(e.name) === extOf(want) : e.kind === "dir"));
    const ranked = kin.map((e) => ({ e, s: alike(want, e.name) })).sort((a, b) => b.s - a.s);
    const [best, next] = ranked;
    if (!best || best.s < 0.6 || (next && best.s - next.s < 0.1)) return null;
    at = best.e.path;
  }
  return at === path ? null : at;
}

/** A tab whose file is gone: reopened where the file went, else closed — and said so. */
async function settle(p: IDockviewPanel, path: string): Promise<void> {
  if (app.dirty[p.id]) { toast("This file is gone", `${shownPath(path)} was deleted or moved; the tab stays because it has unsaved text.`, "info", 9000); return; }
  const moved = await findMoved(path);
  if (fileOf(p) !== path || !dock?.panels.includes(p)) return;
  p.api.close(); // not closePanel: that would save, and so recreate, the file
  if (moved) {
    (await import("./dock")).openPath(moved);
    toast("Opened where the file went", `${shownPath(path)} is now ${shownPath(moved)}.`, "info", 7000);
  } else toast("A tab closed: its file is gone", `${shownPath(path)} was deleted, moved or renamed.`, "info", 7000);
}

async function closeIfGone(p: IDockviewPanel, path: string): Promise<void> {
  // the tab may show another file by now: a rename in Files reopens the new path, which can reuse
  // this very tab — closing it for the old path closed the renamed file (gone-files.spec, flaky)
  if (fileOf(p) !== path) return;
  if (await exists(path)) return;
  // the core's listing can lag a move by a moment, so the file just moved here would read as gone:
  // only a file still missing a little later closes its tab
  await new Promise((r) => setTimeout(r, 600));
  if (fileOf(p) !== path || (await exists(path))) return;
  await settle(p, path);
}

/** The tabs a layout brought back whose files are gone (renamed while Atlas was closed). */
async function checkRestored(): Promise<void> {
  for (const p of dock?.panels ?? []) {
    const f = fileOf(p);
    if (f && !(await exists(f))) await settle(p, f);
  }
}

/** Called once, right after the dock is created. */
export function attachGoneFiles(d: DockviewApi): void {
  dock = d;
  d.onDidLayoutFromJSON(() => void checkRestored());
  void checkRestored();
  on("fs", (e) => {
    const hit = d.panels.map((p) => [p, fileOf(p)] as const).filter(([, f]) => f && e.paths.some((c) => within(f, c)));
    // a moment later: a save that replaces the file is not a deletion
    if (hit.length) setTimeout(() => { for (const [p, f] of hit) void closeIfGone(p, f!); }, 350);
  });
}

/** The open files at or under `from`, as they are called after a move to `to` (reopen them there). */
export function movedTabs(from: string, to: string): string[] {
  return (dock?.panels ?? []).map(fileOf).filter((f): f is string => !!f && within(f, from)).map((f) => to + f.slice(from.length));
}
