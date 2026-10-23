// Back / forward over the main panes visited, like a browser (mouse buttons and swipes: nav-input.ts).
// Only the list: dock.ts shows the pane a step lands on.
import { panelZone } from "./dock-instance";
import type { PaneSpec } from "./panes";

export interface Visit { id: string; spec: PaneSpec }

const MAX = 100;
const hist: Visit[] = [];
let pos = -1;
let moving = false;

export function noteVisit(p: { id: string; params?: unknown }): void {
  if (moving || panelZone(p) !== "main" || hist[pos]?.id === p.id) return;
  hist.splice(pos + 1); // a new visit drops the forward part
  hist.push({ id: p.id, spec: p.params as PaneSpec });
  if (hist.length > MAX) hist.shift();
  pos = hist.length - 1;
}

/** The visits, the newest first, with which one is "here" — for the history list (a chooser). */
export const visits = (): { visit: Visit; here: boolean; index: number }[] =>
  hist.map((visit, index) => ({ visit, here: index === pos, index })).reverse();

/** Jump to a visit of the list (it becomes "here"; back / forward go on from there). */
export function jumpTo(index: number, show: (v: Visit) => void): void {
  if (index < 0 || index >= hist.length) return;
  pos = index;
  moving = true;
  try { show(hist[index]); } finally { moving = false; }
}

/** Step back (-1) or forward (+1) past the pane now shown and hand the visit to `show`; activating
 *  it there is not recorded as a new visit. */
export function stepHistory(step: -1 | 1, activeId: string | undefined, show: (v: Visit) => void): { visit: Visit; at: number; of: number } | null {
  const i = target(step, activeId);
  if (i === null) return null;
  pos = i;
  moving = true;
  try { show(hist[i]); } finally { moving = false; }
  return { visit: hist[i], at: i + 1, of: hist.length };
}

/** Where a step would land, or null when the history ends that way (the swipe sign greys out). */
function target(step: -1 | 1, activeId: string | undefined): number | null {
  let i = pos + step;
  while (i >= 0 && i < hist.length && hist[i].id === activeId) i += step;
  return i < 0 || i >= hist.length ? null : i;
}
export const canStep = (step: -1 | 1, activeId: string | undefined): boolean => target(step, activeId) !== null;
