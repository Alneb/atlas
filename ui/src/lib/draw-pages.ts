// A drawing as a notebook: a page is an Excalidraw frame of A4 portrait proportions; a new one goes under the last; the page on
// screen is the one under the view's middle; an element's link may name a note. All plain Excalidraw: the file opens as
// it is in Excalidraw and in Obsidian's plugin.

/** A4 portrait at 96 px per inch, and the gap between pages, in scene units. */
export const PAGE = { width: 794, height: 1123, gap: 48 } as const;

export interface Page { id: string; x: number; y: number; width: number; height: number }

type El = { id: string; type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean; name?: string | null };

/** The drawing's pages in reading order: top to bottom, then left to right. */
export function pagesOf(elements: readonly El[]): Page[] {
  return elements
    .filter((e) => e.type === "frame" && !e.isDeleted)
    .map(({ id, x, y, width, height }) => ({ id, x, y, width, height }))
    .sort((a, b) => (Math.abs(a.y - b.y) < ROW_TOLERANCE ? 0 : a.y - b.y) || a.x - b.x);
}

/** Pages whose tops are this close are one row (left to right): a hair's difference in y read a row out of order. */
const ROW_TOLERANCE = PAGE.height / 4;

/** The index of the page at scene point (x, y): the one containing it, else the nearest; -1 with no pages. */
export function pageAt(pages: readonly Page[], x: number, y: number): number {
  let best = -1, dist = Infinity;
  pages.forEach((p, i) => {
    const dx = Math.max(p.x - x, 0, x - (p.x + p.width)), dy = Math.max(p.y - y, 0, y - (p.y + p.height));
    const d = Math.hypot(dx, dy);
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}

/** Excalidraw's view: its size, zoom and scroll (screen = (scene + scroll) × zoom). */
export interface View { width: number; height: number; zoom: number; scrollX: number; scrollY: number }

/** Page mode (the notepad's `page_mode`, NotepadView.clampToPage): the view kept on `page` — never zoomed out below the
 *  page filling it (× `fit`), never past its edges, centred along a side where it is smaller than the view. Null when
 *  the view is on the page already. */
export function heldView(page: Page, v: View, fit: number): View | null {
  const zoom = Math.max(v.zoom, fit * Math.min(v.width / page.width, v.height / page.height));
  const axis = (start: number, size: number, view: number, scroll: number) => {
    const seen = view / zoom; // scene units across the view
    return seen >= size ? seen / 2 - start - size / 2 : Math.min(-start, Math.max(seen - start - size, scroll));
  };
  const held = { ...v, zoom, scrollX: axis(page.x, page.width, v.width, v.scrollX), scrollY: axis(page.y, page.height, v.height, v.scrollY) };
  const moved = zoom !== v.zoom || Math.abs(held.scrollX - v.scrollX) > 0.01 || Math.abs(held.scrollY - v.scrollY) > 0.01;
  return moved ? held : null;
}

/** Pages side by side (the notepad's setting `per_row`); a drawing that has a second row keeps the columns it was laid out with, its first row's. */
export function columns(pages: readonly Page[], setting: number): number {
  if (!pages.length) return Math.max(1, setting);
  const first = pages.filter((p) => Math.abs(p.y - pages[0].y) < ROW_TOLERANCE).length;
  return pages.length > first ? first : Math.max(1, setting);
}

/** Slot `k` of the grid that starts at the drawing's top-left page (Scene.java `slot`): `cols` a row, the first page's size. */
function slot(pages: readonly Page[], k: number, cols: number): { x: number; y: number } {
  const x0 = Math.min(...pages.map((p) => p.x)), y0 = Math.min(...pages.map((p) => p.y));
  const { width, height } = pages[0];
  return { x: x0 + (k % cols) * (width + PAGE.gap), y: y0 + Math.floor(k / cols) * (height + PAGE.gap) };
}

/** Where the next page goes: the grid's first free slot (Scene.java `nextPage`); the first one where the drawing
 *  already is (or at the origin). */
export function nextPage(pages: readonly Page[], drawn: readonly El[], cols = 1): { x: number; y: number } {
  if (pages.length) {
    const { width, height } = pages[0], near = PAGE.gap / 2;
    for (let k = 0; ; k++) {
      const at = slot(pages, k, cols);
      const taken = pages.some((p) => p.x < at.x + width + near && at.x - near < p.x + p.width && p.y < at.y + height + near && at.y - near < p.y + p.height);
      if (!taken) return at;
    }
  }
  // a loop, not Math.min(...all): spreading tens of thousands of strokes (an imported notebook) overflows the stack
  let x = Infinity, y = Infinity;
  for (const e of drawn) if (!e.isDeleted && e.type !== "frame") { x = Math.min(x, e.x); y = Math.min(y, e.y); }
  return x === Infinity ? { x: 0, y: 0 } : { x: x - PAGE.gap, y: y - PAGE.gap };
}

/** How each page moves to lay the pages out as a grid of `cols` in reading order (Step.java `arranged`); the pages
 *  already in place left out, so an empty list means "in the grid already". */
export function arranged(pages: readonly Page[], cols: number): { id: string; dx: number; dy: number }[] {
  return pages.flatMap((p, k) => {
    const to = slot(pages, k, cols), dx = to.x - p.x, dy = to.y - p.y;
    return dx || dy ? [{ id: p.id, dx, dy }] : [];
  });
}

/** The note a `[[note]]` / `[[note#heading|alias]]` element link names (Obsidian's Excalidraw plugin stores links so),
 *  or null for a web address and anything else. */
export const wikiTarget = (link: string | null | undefined): string | null => /^\s*\[\[([^\]|#]+)[^\]]*\]\]\s*$/.exec(link ?? "")?.[1].trim() ?? null;

/** The page an embed or a link names after `#`: Obsidian's `^frame=<id>`, a page's name ("Page 2", any frame's own
 *  name, any case), or "Page N" as the N-th page when no frame carries that name. Null when none fits. */
export function frameRef(elements: readonly El[], ref: string): El | null {
  const frames = elements.filter((e) => e.type === "frame" && !e.isDeleted);
  const r = ref.trim();
  const id = /^\^frame=(.+)$/.exec(r)?.[1];
  if (id) return frames.find((f) => f.id === id) ?? null;
  const named = frames.find((f) => (f.name ?? "").trim().toLowerCase() === r.toLowerCase());
  if (named) return named;
  const n = /^page\s+(\d+)$/i.exec(r)?.[1];
  const page = n ? pagesOf(frames)[Number(n) - 1] : undefined;
  return page ? frames.find((f) => f.id === page.id) ?? null : null;
}
