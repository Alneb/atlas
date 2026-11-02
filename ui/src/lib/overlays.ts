// What Atlas draws over the panes — the palette, dialogs, menus, popovers, suggestion lists, the Ctrl+Tab glance —
// registered while it is open. A native view laid over the page (the web tab: a real browser view, which no CSS
// z-index can put under anything) cannot be ordered with the page's elements, so it yields: it hides the moment an
// open overlay meets it and comes back when the last one closes. One register, told at once, instead of each native
// view guessing from the page (docs/guides/DEVELOPING.md, "Overlays and native views").

/** An open overlay: its element, or "window" for one that covers everything before it is drawn (the glance). */
type Overlay = HTMLElement | "window";

const open = new Set<Overlay>();
const listeners = new Set<() => void>();

function changed(): void {
  for (const fn of listeners) fn();
}

/** Registers an open overlay; the returned function closes it (call it once). */
export function overlayOpened(o: Overlay): () => void {
  open.add(o);
  changed();
  return () => {
    if (open.delete(o)) changed();
  };
}

/** Whether an open overlay meets the rectangle `r` (viewport coordinates). */
export function overlayOver(r: DOMRect): boolean {
  for (const o of open) {
    if (o === "window") return true;
    if (!o.isConnected) continue;
    const b = o.getBoundingClientRect();
    if (b.width > 0 && b.height > 0 && b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top) return true;
  }
  return false;
}

/** Calls `fn` whenever an overlay opens or closes; → stop listening. */
export function onOverlays(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Svelte action: `<div use:overlay>` registers the element for as long as it is in the page. */
export function overlay(node: HTMLElement): { destroy: () => void } {
  return { destroy: overlayOpened(node) };
}
