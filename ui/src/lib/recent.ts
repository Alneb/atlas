// Recently opened files and run commands (the palette's first lists): the core's usage journal (usage.rs, `GET /api/recent`), the one
// record of what was opened, whichever window or device opened it. Kept here for this run too, so a file opened now
// is first at once (the dock journals each open: dock.ts `journalOpen`).
import { api } from "./api";
import { drop, KEYS } from "./prefs";

const MAX = 30;
const MAX_COMMANDS = 5;
let list: string[] = [];
let commands: string[] = [];

export const recentFiles = (): string[] => list;

export function rememberFile(path: string): void {
  list = [path, ...list.filter((p) => p !== path)].slice(0, MAX);
}

export const recentCommands = (): string[] => commands;

/** A command just run (the palette journals it too: `api.usage`). */
export function rememberCommand(id: string): void {
  commands = [id, ...commands.filter((c) => c !== id)].slice(0, MAX_COMMANDS);
}

/** Reads the lists (once, on start). */
export async function initRecent(): Promise<void> {
  try {
    const ran = await api.recentCommands(MAX_COMMANDS);
    commands = [...commands, ...ran.filter((c) => !commands.includes(c))].slice(0, MAX_COMMANDS);
  } catch { /* none yet */ }
  try {
    const kept = await api.recent(MAX);
    list = [...list, ...kept.filter((p) => !list.includes(p))].slice(0, MAX);
  } catch { /* none yet: it fills as files are opened */ }
  drop(KEYS.recent); // the list older versions kept in the browser
}
