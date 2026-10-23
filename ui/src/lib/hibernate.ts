// Background tabs go to sleep after a while: their component is unmounted (its editor, pdf.js, Excalidraw, lists and
// listeners freed) and mounted again when the tab is shown — with its place back (pane-scroll.ts within a session,
// editor/places.ts for a note's caret and scroll, the PDF's remembered page). After a long day with many tabs the app
// held every tab it ever opened; the least recently used now sleep.
//
// The sweet spot, measured over a long day of use, and a setting: the 8 most recently seen tabs never sleep
// (switching among a working set stays instant), others after 10 min unseen — notes 30 (their undo history goes too).
// Never: a terminal (its shell's screen), a tab with unsaved changes, a tab on screen. A web tab is a whole WebKit
// process of its own (~50–100 MB, the native view of app/webtab.rs): it is not one of the awake tabs, and sleeps
// after the plain time unseen however recently the others were seen.
import type { PaneKind } from "./panes";
import { settings } from "./settings.svelte";

/** Settings → Appearance (`[ui] sleep_after_min`, `awake_tabs`): minutes unseen before a tab sleeps (0: never), notes
 *  three times as long; how many tabs seen last never sleep. */
const policy = () => {
  const ui = settings.config?.ui;
  const min = ui?.sleep_after_min ?? 10;
  return { keep: ui?.awake_tabs ?? 8, afterMs: min * 60_000, never: min === 0 };
};
const SWEEP_MS = 60_000;

export interface Sleeper {
  readonly id: string;
  readonly kind: PaneKind;
  /** On screen now (the active tab of a shown group). */
  visible(): boolean;
  /** Nothing would be lost by unmounting (no unsaved changes…). */
  canSleep(): boolean;
  sleep(): void;
}
interface Entry { s: Sleeper; seen: number; asleep: boolean }

const entries = new Map<string, Entry>();
let timer: ReturnType<typeof setInterval> | undefined;

export interface SleeperHandle {
  /** Shown (or just used): the clock starts again. */
  seen(): void;
  /** Mounted again after sleeping. */
  woke(): void;
  dispose(): void;
}

export function register(s: Sleeper): SleeperHandle {
  const e: Entry = { s, seen: Date.now(), asleep: false };
  entries.set(s.id, e);
  timer ??= setInterval(() => sweep(), SWEEP_MS);
  return {
    seen: () => { e.seen = Date.now(); },
    woke: () => { e.asleep = false; e.seen = Date.now(); },
    dispose: () => {
      entries.delete(s.id);
      if (!entries.size) { clearInterval(timer); timer = undefined; }
    },
  };
}

const neverSleeps = (k: PaneKind) => k === "terminal";
/** Costs a process of its own: never kept awake for being among the last seen. */
const ownProcess = (k: PaneKind) => k === "web";
const ageLimit = (k: PaneKind, afterMs: number) => (k === "editor" ? 3 * afterMs : afterMs);

/** Puts to sleep what the policy says; `olderThanMs` overrides the age limits (0: every candidate past the awake tabs — the
 *  measuring scripts). Returns how many went to sleep. Not while the window itself is hidden: nothing is gained. */
export function sweep(olderThanMs?: number): number {
  const p = policy();
  if (olderThanMs === undefined && (document.hidden || p.never)) return 0;
  const now = Date.now();
  const awake = [...entries.values()].filter((e) => !e.asleep && !neverSleeps(e.s.kind) && !e.s.visible());
  awake.sort((a, b) => b.seen - a.seen);
  const tabs = awake.filter((e) => !ownProcess(e.s.kind));
  let n = 0;
  for (const e of [...tabs.slice(p.keep), ...awake.filter((e) => ownProcess(e.s.kind))]) {
    if (now - e.seen < (olderThanMs ?? ageLimit(e.s.kind, p.afterMs)) || !e.s.canSleep()) continue;
    e.asleep = true;
    e.s.sleep();
    n++;
  }
  return n;
}

/** How many panes are mounted / asleep (diagnostics, the profiler). */
export const counts = () => { let asleep = 0; for (const e of entries.values()) if (e.asleep) asleep++; return { panes: entries.size, asleep }; };
