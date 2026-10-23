// Dragging a PDF with the mouse: in the select
// tool a press on the page's blank parts pans it (a press on text still selects text, a link still opens); the middle
// button pans anywhere, in any tool. Touch and pens keep the browser's own scrolling and the pen tools.

/** Where a press selects or acts instead of panning: text, links, annotation editors, form fields. */
const OWN = ".textLayer span, .textLayer br, a, .annotationLayer section, .annotationEditorLayer *, input, textarea, select, button";

export function attachPan(container: HTMLElement, selecting: () => boolean): () => void {
  let drag: { id: number; x: number; y: number; left: number; top: number } | null = null;
  const down = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const middle = e.button === 1;
    if (!middle && (e.button !== 0 || !selecting() || (e.target as Element).closest(OWN))) return;
    e.preventDefault(); // no text selection starting, no autoscroll / X11 paste
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: container.scrollLeft, top: container.scrollTop };
    container.setPointerCapture(e.pointerId);
    container.classList.add("panning");
  };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    container.scrollLeft = drag.left - (e.clientX - drag.x);
    container.scrollTop = drag.top - (e.clientY - drag.y);
  };
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    container.classList.remove("panning");
    if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
  };
  const aux = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); }; // the middle click's paste
  container.addEventListener("pointerdown", down);
  container.addEventListener("pointermove", move);
  container.addEventListener("pointerup", up);
  container.addEventListener("pointercancel", up);
  container.addEventListener("auxclick", aux);
  return () => {
    container.removeEventListener("pointerdown", down);
    container.removeEventListener("pointermove", move);
    container.removeEventListener("pointerup", up);
    container.removeEventListener("pointercancel", up);
    container.removeEventListener("auxclick", aux);
  };
}
