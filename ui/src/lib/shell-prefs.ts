// The shell's small per-machine choices (the sidebar's width and collapsed state, the left-bar side
// panel's tool and whether it shows) in one file of the vault, `.atlas/cache/shell.json`, so the
// desktop app and a browser tab on the same vault agree (docs/design/SHELL.md). Each part still keeps its
// copy in the browser's storage, but only to draw the first frame where it was; the file wins once
// read. Like the layout, the file is read only when "reopen the last tabs at start" is on.
import { api } from "./api";
import { readText } from "./vault-files";

const FILE = ".atlas/cache/shell.json";
type Part = { get: () => unknown; set: (v: Record<string, unknown>) => void };
const parts = new Map<string, Part>();
let loaded = false;

/** A part of the shell that wants its choices in the file: `get` gives them, `set` takes saved ones. */
export function shellPart(name: string, part: Part): void { parts.set(name, part); }

export async function loadShellPrefs(read = true): Promise<void> {
  if (!read) { loaded = true; return; } // nothing restored at start: the file is still kept current
  try {
    const text = await readText(FILE);
    const all: unknown = text ? JSON.parse(text) : null;
    if (all && typeof all === "object") {
      for (const [name, p] of parts) {
        const v = (all as Record<string, unknown>)[name];
        if (v && typeof v === "object") p.set(v as Record<string, unknown>);
      }
    }
  } catch { /* an unreadable file is as good as none */ }
  loaded = true;
}

let t: ReturnType<typeof setTimeout> | undefined;
/** Write the file a moment after a part changed (never before it was read: that would erase it). */
export function saveShellPrefs(): void {
  if (!loaded) return;
  clearTimeout(t);
  t = setTimeout(() => {
    const all = Object.fromEntries([...parts].map(([name, p]) => [name, p.get()]));
    void api.putFile(FILE, JSON.stringify(all, null, 1)).catch((e) => console.warn("[atlas] shell prefs not saved", e));
  }, 400);
}
