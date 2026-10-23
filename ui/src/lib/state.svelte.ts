// App-wide reactive state (Svelte 5 runes). Mutate fields; never reassign the objects.
import type { ConnState } from "./api";
import type { Workspace } from "./types";
import { load, KEYS } from "./prefs";

export type Theme = "dark" | "light";
export interface Problems { errors: number; warnings: number }

export const app = $state({
  workspace: null as Workspace | null,
  conn: "connecting" as ConnState,
  theme: load<Theme>(KEYS.theme, "dark"),
  vimEnabled: load<boolean>(KEYS.vim, true),
  /** Mode of the most recently focused editor: "NORMAL", "INSERT", … or "" when vim is off. */
  vimMode: "",
  /** Diagnostics of the most recently focused code editor (null: not a code file). */
  problems: null as Problems | null,
  /** Panel id → unsaved changes; drives the tab dots. */
  dirty: {} as Record<string, boolean>,
});

/** Applies a theme immediately (settings own the choice; this is the paint + a no-flash cache). */
export function paintTheme(t: Theme): void {
  app.theme = t;
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEYS.theme, t); } catch { /* ignore */ }
}

// --- toasts ------------------------------------------------------------------------------------
export type ToastKind = "info" | "success" | "error";
/** `count`: how many times the same notice came (shown once, with ×n); `life`: how long it shows, which restarts with
 *  each repeat (`shown` counts them, so the time-left line starts again). */
export interface Toast { id: number; title: string; body?: string; kind: ToastKind; run?: () => void; count: number; life: number; shown: number }
export const toasts = $state<Toast[]>([]);
let toastSeq = 0;
const MAX_TOASTS = 5;
/** Each notice's timer: paused while the pointer is over it (time to read), resumed with what was left. */
const timers = new Map<number, { t?: ReturnType<typeof setTimeout>; left: number; since: number }>();

function arm(id: number, ms: number) {
  clearTimeout(timers.get(id)?.t);
  timers.set(id, { t: setTimeout(() => dismissToast(id), ms), left: ms, since: Date.now() });
}

/** `run`: what a click on the notice does (a new mail opens that mail), besides closing it; it then stays longer. An
 *  error stays longer too (it has more to read). The same notice again is counted on the one shown, not stacked. */
export function toast(title: string, body?: string, kind: ToastKind = "info", ms = 4500, run?: () => void): void {
  const life = run ? Math.max(ms, 9000) : kind === "error" ? Math.max(ms, 8000) : ms;
  const same = !run && toasts.find((t) => !t.run && t.title === title && t.body === body && t.kind === kind);
  if (same) {
    same.count++;
    same.shown++;
    same.life = life;
    arm(same.id, life);
    return;
  }
  const id = ++toastSeq;
  toasts.push({ id, title, body, kind, run, count: 1, life, shown: 1 });
  arm(id, life);
  while (toasts.length > MAX_TOASTS) dismissToast(toasts[0].id);
}

/** The pointer over a notice (true) or gone from it (false): its time stops, then runs on from where it was. */
export function holdToast(id: number, held: boolean): void {
  const tm = timers.get(id);
  if (!tm) return;
  if (held) {
    clearTimeout(tm.t);
    tm.t = undefined;
    tm.left = Math.max(800, tm.left - (Date.now() - tm.since));
  } else if (!tm.t) {
    arm(id, tm.left);
  }
}

export function dismissToast(id: number): void {
  clearTimeout(timers.get(id)?.t);
  timers.delete(id);
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}
