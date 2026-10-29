// Picking by dragging, as in a file manager: a press that moves draws a rectangle over the scrolling `node`; every `[data-pick]`
// element it touches is picked. Ctrl/Shift/Super add to what was picked. The click ending a drag is swallowed.
// `node` must be the scroll container and positioned (the rectangle is placed in its content).

export interface MarqueeOpts {
  /** The ids (`data-pick`) under the rectangle; `add`: keep what was picked before. */
  pick(ids: string[], add: boolean): void;
}

const MOVE = 5; // px before a press becomes a drag (a click stays a click)

export function marquee(node: HTMLElement, opts: MarqueeOpts) {
  let o = opts;
  let start: { x: number; y: number; add: boolean; id: number } | null = null;
  let box: HTMLDivElement | null = null;
  let last = { x: 0, y: 0 };
  // content coordinates: the rectangle stays on the items while the list scrolls under it
  const at = (cx: number, cy: number) => { const r = node.getBoundingClientRect(); return { x: cx - r.left + node.scrollLeft, y: cy - r.top + node.scrollTop }; };

  function draw(cx: number, cy: number) {
    if (!start || !box) return;
    const p = at(cx, cy);
    const x0 = Math.min(start.x, p.x), y0 = Math.min(start.y, p.y), x1 = Math.max(start.x, p.x), y1 = Math.max(start.y, p.y);
    Object.assign(box.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
    const r = node.getBoundingClientRect(), ids: string[] = [];
    for (const el of node.querySelectorAll<HTMLElement>("[data-pick]")) {
      const e = el.getBoundingClientRect();
      const ex0 = e.left - r.left + node.scrollLeft, ey0 = e.top - r.top + node.scrollTop;
      if (ex0 < x1 && ex0 + e.width > x0 && ey0 < y1 && ey0 + e.height > y0) ids.push(el.dataset.pick!);
    }
    o.pick(ids, start.add);
  }

  // a draggable item is moved by its own drag (a card onto a shelf): the rectangle starts only off it
  const ignored = (e: MouseEvent) => e.button !== 0 || !!(e.target as HTMLElement).closest("input, textarea, select, a, [contenteditable], [draggable=true]");
  // the press itself must not start the browser's text selection: it ran on past the list over the whole app
  function mousedown(e: MouseEvent) {
    if (ignored(e) || (e.offsetX > node.clientWidth && e.target === node)) return;
    e.preventDefault();
    node.closest<HTMLElement>("[tabindex]")?.focus({ preventScroll: true }); // the keys stay with the list (Ctrl+A, arrows)
  }
  function down(e: PointerEvent) {
    if (ignored(e) || e.pointerType === "touch") return;
    // a press on the scrollbar is not a drag
    if (e.offsetX > node.clientWidth && e.target === node) return;
    const p = at(e.clientX, e.clientY);
    start = { ...p, add: e.ctrlKey || e.metaKey || e.shiftKey, id: e.pointerId };
    last = { x: e.clientX, y: e.clientY };
  }
  function move(e: PointerEvent) {
    if (!start || e.pointerId !== start.id) return;
    last = { x: e.clientX, y: e.clientY };
    if (!box) {
      const p = at(e.clientX, e.clientY);
      if (Math.hypot(p.x - start.x, p.y - start.y) < MOVE) return;
      box = document.createElement("div");
      box.className = "marquee";
      node.append(box);
      node.setPointerCapture(e.pointerId);
      window.getSelection()?.removeAllRanges();
    }
    // near the top or bottom edge the list scrolls on
    const r = node.getBoundingClientRect();
    if (e.clientY < r.top + 24) node.scrollTop -= 16;
    else if (e.clientY > r.bottom - 24) node.scrollTop += 16;
    draw(e.clientX, e.clientY);
  }
  function up(e: PointerEvent) {
    if (!start || e.pointerId !== start.id) return;
    const dragged = !!box;
    box?.remove();
    box = null;
    start = null;
    if (!dragged) return;
    // the click that ends a drag is swallowed — only that one: a drag released outside the list makes none, and a
    // guard left armed ate the next real click
    const swallow = (c: MouseEvent) => { c.stopPropagation(); c.preventDefault(); };
    node.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => node.removeEventListener("click", swallow, { capture: true }), 0);
  }
  const scrolled = () => { if (box) draw(last.x, last.y); };

  node.addEventListener("mousedown", mousedown);
  node.addEventListener("pointerdown", down);
  node.addEventListener("pointermove", move);
  node.addEventListener("pointerup", up);
  node.addEventListener("pointercancel", up);
  node.addEventListener("scroll", scrolled);
  return {
    update(next: MarqueeOpts) { o = next; },
    destroy() {
      box?.remove();
      node.removeEventListener("mousedown", mousedown);
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
      node.removeEventListener("scroll", scrolled);
    },
  };
}
