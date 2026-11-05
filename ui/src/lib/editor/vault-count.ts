// Learning a vault's notes through a plugin's helper, as Spelling and the Predictor do: a chunk of notes per call (no
// call nears the helper's time limit), a chunk that fails anyway split in two and tried again (one long note never
// costs the rest of the vault), and each note's counts kept so a saved note's old counts come out and its new ones go in.

export interface VaultCounter {
  /** Counts these notes (again): their old counts out, the new ones in. */
  count(paths: string[]): Promise<void>;
  /** Every note, a chunk at a time; `progress` after each chunk. Sets `counted` at the end. */
  countAll(notes: string[], progress?: (done: number) => void): Promise<void>;
  /** Whether the whole vault has been counted once (saved notes are recounted only after that). */
  readonly counted: boolean;
}

/** `ask(paths)` → path → that note's counts (a note left out: not counted); `apply(entry, ±1)` adds or takes them. */
export function vaultCounter<T>(
  ask: (paths: string[]) => Promise<Record<string, T>>,
  apply: (entry: T, sign: 1 | -1) => void,
  name: string,
  chunk = 20,
): VaultCounter {
  const perNote = new Map<string, T>();
  let counted = false;
  const take = (part: Record<string, T>, asked: string[]) => {
    for (const path of asked) {
      const old = perNote.get(path);
      if (old) apply(old, -1);
      const now = part[path];
      if (now) { perNote.set(path, now); apply(now, 1); } else perNote.delete(path);
    }
  };
  const count = async (paths: string[]): Promise<void> => {
    if (!paths.length) return;
    try { take(await ask(paths), paths); }
    catch (e) {
      if (paths.length === 1) { console.warn(`${name}: ${paths[0]} was not counted:`, e); return; }
      const half = Math.ceil(paths.length / 2);
      await count(paths.slice(0, half));
      await count(paths.slice(half));
    }
  };
  return {
    count,
    async countAll(notes, progress) {
      for (let i = 0; i < notes.length; i += chunk) {
        await count(notes.slice(i, i + chunk));
        progress?.(Math.min(i + chunk, notes.length));
      }
      counted = true;
    },
    get counted() { return counted; },
  };
}
