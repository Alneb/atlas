// Recently opened files (the palette's first list): the core's usage journal (usage.rs, `GET /api/recent`), the one
// record of what was opened, whichever window or device opened it. Kept here for this run too, so a file opened now
// is first at once (the dock journals each open: dock.ts `journalOpen`).
import { api } from "./api";
import { drop, KEYS } from "./prefs";

const MAX = 30;
let list: string[] = [];

export const recentFiles = (): string[] => list;

export function rememberFile(path: string): void {
  list = [path, ...list.filter((p) => p !== path)].slice(0, MAX);
}

/** Reads the list (once, on start). */
export async function initRecent(): Promise<void> {
  try {
    const kept = await api.recent(MAX);
    list = [...list, ...kept.filter((p) => !list.includes(p))].slice(0, MAX);
  } catch { /* none yet: it fills as files are opened */ }
  drop(KEYS.recent); // the list older versions kept in the browser
}
