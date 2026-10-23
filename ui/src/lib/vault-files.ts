// Reading the vault's optional files (`.atlas/workspaces/`, `.atlas/bookmarks.yaml`, `.atlas/sidebar.page`)
// without a 404 in the log when one is not there yet.
import { api, ApiError } from "./api";

/** Whether a file or folder exists (an unreachable core counts as no). A server older than `/api/exists` (the phone
 *  app's own interface may meet one) is asked through the parents' listings, never taken for "missing" — a missing
 *  sidebar or bookmarks file is written anew. */
export async function exists(path: string): Promise<boolean> {
  try { return await api.exists(path); } catch (e) { return e instanceof ApiError && e.status === 404 ? listed(path) : false; }
}

async function listed(path: string): Promise<boolean> {
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const here = parts.slice(0, i).join("/");
    if (!(await api.tree(parts.slice(0, i - 1).join("/")).then((es) => es.some((e) => e.path === here), () => false))) return false;
  }
  return true;
}

/** A file's text, or null when it is missing or unreadable. */
export async function readText(path: string): Promise<string | null> {
  if (!(await exists(path))) return null;
  try { return (await api.file(path)).text; } catch { return null; }
}
