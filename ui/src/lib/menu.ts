// Where a context menu opens: the one shape every owner of a <ContextMenu> keeps (null while closed).
import type { MenuItem } from "../components/ContextMenu.svelte";

export type MenuAt = { x: number; y: number; items: MenuItem[] };

/** At the pointer — a right-click. */
export const atPointer = (e: MouseEvent, items: MenuItem[]): MenuAt => ({ x: e.clientX, y: e.clientY, items });

/** Under the element the event is on (a button's menu), `gap` px below it. Call it while the event is dispatched. */
export function below(e: MouseEvent, items: MenuItem[], gap = 2): MenuAt {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.left, y: r.bottom + gap, items };
}
