// The ways out of a Syncthing conflict copy the core could not merge (core sync_merge.rs; DESIGN-mirror-v2.md §4),
// shared by the banner on a note (components/SyncCopies.svelte, the note held by its editor) and the Sync conflicts
// view (components/views/SyncConflicts.svelte, the note on disk). Which files are copies is the core's one rule
// (`GET /api/sync/conflicts`), never matched here.
import { api } from "./api";
import { open } from "./dock";
import { readText } from "./vault-files";
import { shownPath } from "./paths";
import { toast } from "./state.svelte";
import { errText } from "./text";
import type { ConflictCopy } from "./gen/ConflictCopy";

/** Where the note's own text lives: the editor holding it, or the file itself. */
export interface NoteSide {
  /** the note's text now; null: unreadable (said already) */
  mine: () => string | null | Promise<string | null>;
  /** the note's text becomes `text`; false: it could not (said already) */
  take: (text: string) => boolean | void | Promise<boolean | void>;
}

/** Every copy left, in a tab (the `sync-conflicts` block alone): the one way the command and Settings open it. */
export const openSyncConflicts = (): void => void open({ kind: "block", src: "type: sync-conflicts\n", doc: "", title: "Sync conflicts", icon: "refresh" });

/** The copies left: every one, or `of` one file's; none while the core cannot say. */
export const leftCopies = (of?: string): Promise<ConflictCopy[]> => api.syncConflicts(of).catch(() => []);

/** Keep this one: the copy goes to `.atlas/trash/`. */
export async function keepThis(copy: string): Promise<boolean> {
  try { await api.trash(copy); return true; } catch (e) { toast(`Could not remove ${shownPath(copy)}`, errText(e), "error"); return false; }
}

/** The note's text set to `text` (the other version, or the two composed), then the copy trashed. */
export async function settleWith(copy: string, text: string, note: NoteSide): Promise<boolean> {
  if ((await note.take(text)) === false) return false;
  return keepThis(copy);
}

/** Take the other: the note's text becomes the copy's. */
export async function takeOther(copy: string, note: NoteSide): Promise<boolean> {
  const text = await readText(copy);
  if (text === null) { toast(`Could not read ${shownPath(copy)}`, "", "error"); return false; }
  return settleWith(copy, text, note);
}

/** The two texts to compare, or null (said why). */
export async function bothTexts(copy: string, note: NoteSide): Promise<{ mine: string; theirs: string } | null> {
  const theirs = await readText(copy);
  if (theirs === null) { toast(`Could not read ${shownPath(copy)}`, "", "error"); return null; }
  const mine = await note.mine();
  return mine === null ? null : { mine, theirs };
}

/** A note no editor holds: read from disk, written back only if unchanged since (a 409 otherwise, said). */
export function onDisk(path: string): NoteSide {
  let mtime: number | undefined;
  return {
    mine: async () => {
      try { const f = await api.file(path); mtime = f.mtime; return f.text; } catch (e) { toast(`Could not read ${shownPath(path)}`, errText(e), "error"); return null; }
    },
    take: async (text) => {
      try { await api.putFile(path, text, mtime); return true; } catch (e) { toast(`${shownPath(path)} was not written`, errText(e), "error"); return false; }
    },
  };
}

/** `2026-10-20T23:15:29` → "20 Oct 2026, 23:15", in the reader's own words. */
export function madeLabel(made: string): string {
  const d = new Date(made);
  return Number.isNaN(d.getTime()) ? made : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
