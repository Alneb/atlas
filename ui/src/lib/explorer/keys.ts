// The explorer list's keys (Dolphin's): ↑ ↓ Home End PageUp PageDown move · Enter open · Backspace / Alt+↑ the folder
// above · Alt+← / Alt+→ back / forward · F2 rename · Delete (asks) · Ctrl+L type a path · F5 refresh · Ctrl+H hidden
// files · a letter jumps to the next name starting with it (typed quickly: a prefix). In Thumbnails ← → move one tile.
import type { Way } from "./browse.svelte";

export interface KeyActions {
  travel(way: Way): void;
  up(): void;
  typePath(): void;
  toggleHidden(): void;
  /** Select the row at this index (clamped by the caller). */
  move(to: number): void;
  enter(): unknown;
  reload(): unknown;
  rename(): void;
  remove(): void;
  typeAhead(ch: string): void;
}
/** Where the selection is: `line` = rows per line (Thumbnails: tiles per line, else 1). */
export interface KeyAt { sel: number; n: number; line: number; thumbs: boolean }

/** The action for this key, or undefined when the list does not take it. */
export function explorerKey(e: KeyboardEvent, a: KeyActions, at: KeyAt): (() => unknown) | undefined {
  const k = e.key, ctrl = e.ctrlKey || e.metaKey;
  if (e.altKey) return ({ ArrowLeft: () => a.travel("back"), ArrowRight: () => a.travel("fwd"), ArrowUp: a.up } as Record<string, () => unknown>)[k];
  if (ctrl) return ({ l: a.typePath, h: a.toggleHidden } as Record<string, () => unknown>)[k.toLowerCase()];
  const { sel, n, line } = at;
  const keys: Record<string, () => unknown> = {
    ArrowDown: () => a.move(sel + line), ArrowUp: () => a.move(sel - line), Home: () => a.move(0), End: () => a.move(n - 1),
    PageDown: () => a.move(sel + 10), PageUp: () => a.move(sel - 10),
    Enter: a.enter, Backspace: a.up, F5: a.reload, F2: a.rename, Delete: a.remove,
    ...(at.thumbs ? { ArrowRight: () => a.move(sel + 1), ArrowLeft: () => a.move(sel - 1) } : {}),
  };
  return keys[k] ?? (k.length === 1 && k !== " " ? () => a.typeAhead(k) : undefined);
}

const AHEAD_MS = 900;
/** Type-ahead: letters typed within 900 ms of each other make a prefix. */
export class TypeAhead {
  #typed = "";
  #at = 0;
  /** The name to select for this letter, searching from the one after `sel` (a new prefix) or from `sel` (a longer one). */
  next(ch: string, names: string[], sel: number): string | undefined {
    const now = Date.now();
    this.#typed = now - this.#at < AHEAD_MS ? this.#typed + ch.toLowerCase() : ch.toLowerCase();
    this.#at = now;
    const from = this.#typed.length === 1 ? sel + 1 : sel;
    return [...names.slice(from), ...names.slice(0, from)].find((x) => x.toLowerCase().startsWith(this.#typed));
  }
}
