// App-wide reactive state (Svelte 5 runes). Mutate fields; never reassign the objects.
import type { ConnState } from "./api";
import type { Workspace } from "./types";
import { load, loadRaw, saveRaw, KEYS } from "./prefs";

export type Theme = "dark" | "light";
export interface Problems { errors: number; warnings: number }

export const app = $state({
  workspace: null as Workspace | null,
  conn: "connecting" as ConnState,
  // raw, not JSON: index.html and capture.html paint it before the app loads
  theme: (loadRaw(KEYS.theme) === "light" ? "light" : "dark") as Theme,
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
  saveRaw(KEYS.theme, t);
}

// --- toasts ------------------------------------------------------------------------------------
export type ToastKind = "info" | "success" | "error";
/** `count`: how many times the same notice came (shown once, with ×n); `life`: how long it shows, which restarts with
 *  each repeat (`shown` counts them, so the time-left line starts again). */
/** A button on a notice ("Open", "Undo"); running it closes the notice. */
export interface ToastAction { label: string; run: () => void }
/** `notice` / `subject`: the core's notice id and subject (a notice from the core), which a later notice of that id
 *  replaces and `withdraw` takes away. */
export interface Toast { id: number; title: string; body?: string; kind: ToastKind; actions: ToastAction[]; count: number; life: number; shown: number; notice?: string; subject?: string }
export const toasts = $state<Toast[]>([]);
let toastSeq = 0;
const MAX_TOASTS = 5;
/** Each notice's timer: paused while the pointer is over it (time to read), resumed with what was left. */
const timers = new Map<number, { t?: ReturnType<typeof setTimeout>; left: number; since: number }>();

function arm(id: number, ms: number) {
  clearTimeout(timers.get(id)?.t);
  timers.set(id, { t: setTimeout(() => dismissToast(id), ms), left: ms, since: Date.now() });
}

/** `act`: the notice's buttons (a new mail's Open, a capture's Undo); a notice with one stays longer, and so does an
 *  error (it has more to read). The same notice again is counted on the one shown, not stacked. */
export function toast(title: string, body?: string, kind: ToastKind = "info", ms = 4500, act?: ToastAction | ToastAction[]): void {
  showToast(title, body, kind, ms, act ? [act].flat() : [], {});
}

/** A notice from the core (`Event::Notify`): as `toast`, keyed by its id (a later one of that id replaces it in
 *  place) and its subject, so `withdrawToasts` can take it away. */
export function noticeToast(title: string, body: string | undefined, kind: ToastKind, actions: ToastAction[], keys: { notice?: string; subject?: string }): void {
  showToast(title, body, kind, 4500, actions, keys);
}

/** `Event::Withdraw`: the toasts of this notice id, or about this subject, go. */
export function withdrawToasts(id: string): void {
  for (const t of toasts.filter((t) => t.notice === id || t.subject === id)) dismissToast(t.id);
}

function showToast(title: string, body: string | undefined, kind: ToastKind, ms: number, actions: ToastAction[], keys: { notice?: string; subject?: string }): void {
  const life = actions.length ? Math.max(ms, 9000) : kind === "error" ? Math.max(ms, 8000) : ms;
  const again = keys.notice ? toasts.find((t) => t.notice === keys.notice) : undefined;
  if (again) {
    Object.assign(again, { title, body, kind, actions, subject: keys.subject, life });
    again.shown++;
    arm(again.id, life);
    return;
  }
  const same = !actions.length && toasts.find((t) => !t.actions.length && t.title === title && t.body === body && t.kind === kind);
  if (same) {
    same.count++;
    same.shown++;
    same.life = life;
    arm(same.id, life);
    return;
  }
  const id = ++toastSeq;
  toasts.push({ id, title, body, kind, actions, count: 1, life, shown: 1, ...keys });
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
