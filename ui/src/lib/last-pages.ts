// The page each drawing was last shown at. The same file as the Boox's Notepad keeps (org.atlas.notepad LastPages.java), so a drawing
// opens at its page on whichever device or screen: `.atlas/notepad/last-pages.json` = { "<drawing path>": "<frame id>" }.
import { api } from "./api";
import { exists } from "./vault-files";

export const LAST_PAGES = ".atlas/notepad/last-pages.json";
const written = new Map<string, string>();

async function read(): Promise<Record<string, string>> {
  try { return (await exists(LAST_PAGES)) ? (JSON.parse((await api.file(LAST_PAGES)).text) as Record<string, string>) : {}; } catch { return {}; }
}

/** The frame id `path` was last shown at, or null. */
export async function lastPage(path: string): Promise<string | null> {
  const id = (await read())[path];
  return typeof id === "string" && id ? id : null;
}

/** `path` is at frame `id` now: written when it changed (the file read again first: another device's entries kept). */
export async function rememberPage(path: string, id: string | null): Promise<void> {
  if (!id || written.get(path) === id) return;
  written.set(path, id);
  try {
    const all = await read();
    if (all[path] === id) return;
    all[path] = id;
    await api.putFile(LAST_PAGES, JSON.stringify(all, null, 1));
  } catch { written.delete(path); /* only a convenience */ }
}
