// Recently opened files (the palette's first list), kept in `.atlas/cache/recent.json`: per machine,
// deletable, and shared by the browser and the desktop app (docs/guides/SHELL.md).
import { api } from "./api";
import { drop, KEYS, load } from "./prefs";
import { readText } from "./vault-files";

const FILE = ".atlas/cache/recent.json";
const MAX = 30;
let list: string[] = [];
let t: ReturnType<typeof setTimeout> | undefined;

export const recentFiles = (): string[] => list;

export function rememberFile(path: string): void {
  list = [path, ...list.filter((p) => p !== path)].slice(0, MAX);
  clearTimeout(t);
  t = setTimeout(() => void api.putFile(FILE, JSON.stringify(list)).catch(() => {}), 1500); // a convenience: losing it loses nothing
}

/** Reads the list (once, on start); the one older versions kept in the browser is used when there is no file. */
export async function initRecent(): Promise<void> {
  const text = await readText(FILE);
  try { const v: unknown = text === null ? load<string[]>(KEYS.recent, []) : JSON.parse(text); if (Array.isArray(v)) list = [...list, ...v.filter((p): p is string => typeof p === "string" && !list.includes(p))].slice(0, MAX); }
  catch { /* unreadable: start empty */ }
  drop(KEYS.recent);
}
