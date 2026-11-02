// Where a context menu opens: the one shape every owner of a <ContextMenu> keeps (null while closed).
import { mount, unmount } from "svelte";
import ContextMenu, { type MenuItem } from "../components/ContextMenu.svelte";

export type MenuAt = { x: number; y: number; items: MenuItem[] };

/** At the pointer — a right-click. */
export const atPointer = (e: MouseEvent, items: MenuItem[]): MenuAt => ({ x: e.clientX, y: e.clientY, items });

/** Under the element the event is on (a button's menu), `gap` px below it. Call it while the event is dispatched. */
export function below(e: MouseEvent, items: MenuItem[], gap = 2): MenuAt {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.left, y: r.bottom + gap, items };
}

/** Opens the menu at `at` from code outside a component (the editor's widgets); `onclose` after it is gone. */
export function popMenu(at: MenuAt, onclose?: () => void): void {
  const m = mount(ContextMenu, { target: document.body, props: { ...at, onclose: () => { void unmount(m); onclose?.(); } } });
}

/** What last pressed the page: a long press by a finger or a pen is the phone's own (it selects a word, with the
 *  system's toolbar), not an app menu — Android's WebView sends a contextmenu event on every long press, and on the Boox
 *  it opened a menu instead of selecting. */
let lastPointer = "mouse";
if (typeof addEventListener === "function") addEventListener("pointerdown", (e: PointerEvent) => { lastPointer = e.pointerType; }, { capture: true, passive: true });
export const pressedByHand = (): boolean => lastPointer === "touch" || lastPointer === "pen";
