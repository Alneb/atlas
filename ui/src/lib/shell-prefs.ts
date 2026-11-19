// The shell's small per-machine choices (the sidebar's width and collapsed state, the left-bar side
// panel's tool and whether it shows) in one file of the vault, `.atlas/cache/shell.json`, so the
// desktop app and a browser tab on the same vault agree (docs/guides/SHELL.md). Each part still keeps its
// copy in the browser's storage, but only to draw the first frame where it was; the file wins once
// read. Like the layout, the file is read only when "reopen the last tabs at start" is on.
import { api } from "./api";
import { readText } from "./vault-files";

const FILE = ".atlas/cache/shell.json";
/** `merge`: how this window's choices go over the file's (another window's) — the whole part by default; a part
 *  keyed by tab (the zoom) gives back the file's keys with only the ones this window touched replaced. */
type Part = { get: () => unknown; set: (v: Record<string, unknown>) => void; merge?: (saved: Record<string, unknown>) => unknown };
const parts = new Map<string, Part>();
let loaded = false;

/** A part of the shell that wants its choices in the file: `get` gives them, `set` takes saved ones. */
export function shellPart(name: string, part: Part): void { parts.set(name, part); }

async function readAll(): Promise<Record<string, unknown> | null> {
  const text = await readText(FILE);
  const all: unknown = text ? JSON.parse(text) : null;
  return all && typeof all === "object" ? (all as Record<string, unknown>) : null;
}

export async function loadShellPrefs(read = true): Promise<void> {
  if (!read) { loaded = true; return; } // nothing restored at start: the file is still kept current
  try {
    const all = await readAll();
    if (all) {
      for (const [name, p] of parts) {
        const v = all[name];
        if (v && typeof v === "object") p.set(v as Record<string, unknown>);
      }
    }
  } catch { /* an unreadable file is as good as none */ }
  loaded = true;
}

let t: ReturnType<typeof setTimeout> | undefined;
/** The parts changed here since the last write. */
const dirty = new Set<string>();
/** Write the parts this window changed a moment after the change (never before the file was read: that would erase
 *  it). Read-modify-write: a second window or a browser tab on the vault writing its sidebar used to write its own
 *  idea of every other part too — the zoom of tabs it never had went back to 100 % at the next start. */
export function saveShellPrefs(part: string): void {
  if (!loaded) return;
  dirty.add(part);
  clearTimeout(t);
  t = setTimeout(() => void write(), 400);
}

async function write(): Promise<void> {
  const names = [...dirty];
  dirty.clear();
  let all: Record<string, unknown> = {};
  try { all = (await readAll()) ?? {}; } catch { /* unreadable: written anew */ }
  for (const name of names) {
    const p = parts.get(name);
    if (!p) continue;
    const saved = all[name];
    all[name] = p.merge && saved && typeof saved === "object" ? p.merge(saved as Record<string, unknown>) : p.get();
  }
  for (const [name, p] of parts) if (!(name in all)) all[name] = p.get(); // a part the file has not yet: as here
  await api.putFile(FILE, JSON.stringify(all, null, 1)).catch((e) => console.warn("[atlas] shell prefs not saved", e));
}
