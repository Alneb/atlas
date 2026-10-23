import { test, expect } from "@playwright/test";
import { PAGE, arranged, columns, heldView, nextPage, pageAt, pagesOf, wikiTarget } from "../src/lib/draw-pages";

// A drawing as a notebook: pages are frames; the page on screen; where a new one goes.

const frame = (id: string, x: number, y: number) => ({ id, type: "frame", x, y, width: PAGE.width, height: PAGE.height });

test("a drawing's pages are its frames in reading order, deleted ones left out", () => {
  const els = [frame("b", 0, 2000), frame("a", 0, 0), { ...frame("gone", 0, 900), isDeleted: true }, { id: "s", type: "freedraw", x: 5, y: 5, width: 1, height: 1 }];
  expect(pagesOf(els).map((p) => p.id)).toEqual(["a", "b"]);
});

test("the page on screen is the one under the view's middle, else the nearest", () => {
  const pages = pagesOf([frame("a", 0, 0), frame("b", 0, 1200)]);
  expect(pageAt(pages, 100, 1500)).toBe(1);
  expect(pageAt(pages, 100, 1150)).toBe(0); // in the gap, nearer the first
  expect(pageAt([], 0, 0)).toBe(-1);
});

test("a new page goes under the last, the first one where the drawing is", () => {
  expect(nextPage(pagesOf([frame("a", 10, 20)]), [])).toEqual({ x: 10, y: 20 + PAGE.height + PAGE.gap });
  expect(nextPage([], [{ id: "s", type: "freedraw", x: 300, y: 400, width: 9, height: 9 }])).toEqual({ x: 300 - PAGE.gap, y: 400 - PAGE.gap });
  expect(nextPage([], [])).toEqual({ x: 0, y: 0 });
});

test("pages as a grid (the Boox Notepad's per_row): the next in the first free slot, the columns kept, arranged in reading order", () => {
  const W = PAGE.width + PAGE.gap, H = PAGE.height + PAGE.gap;
  const row = pagesOf([frame("a", 0, 0), frame("b", W, 0)]);
  expect(columns(row, 4), "one row: the setting").toBe(4);
  expect(nextPage(row, [], 4)).toEqual({ x: 2 * W, y: 0 });
  expect(nextPage(pagesOf([frame("a", 0, 0), frame("c", 2 * W, 0)]), [], 4), "a hole is filled first").toEqual({ x: W, y: 0 });
  // laid out two a row: kept so, whatever the setting
  const two = pagesOf([frame("a", 0, 0), frame("b", W, 0), frame("c", 0, H)]);
  expect(columns(two, 4)).toBe(2);
  expect(nextPage(two, [], columns(two, 4))).toEqual({ x: W, y: H });
  // the old layout, one under another, arranged four a row: each page to its slot, the first left where it is
  const column = pagesOf([0, 1, 2, 3, 4].map((i) => frame(`p${i}`, 0, i * H)));
  expect(columns(column, 4)).toBe(1);
  expect(arranged(column, 4)).toEqual([
    { id: "p1", dx: W, dy: -H }, { id: "p2", dx: 2 * W, dy: -2 * H }, { id: "p3", dx: 3 * W, dy: -3 * H }, { id: "p4", dx: 0, dy: -3 * H },
  ]);
  expect(arranged(column, 1), "in the grid already").toEqual([]);
});

test("page mode holds the view on its page (the Boox Notepad's page_mode): filling at least, never past an edge, centred where smaller", () => {
  const page = { id: "p", x: 0, y: 0, width: 800, height: 1100 };
  // zoomed out on a wide view: zoomed in to fill the height, centred both ways
  const fill = heldView(page, { width: 1600, height: 900, zoom: 0.3, scrollX: 0, scrollY: 0 }, 1)!;
  expect(fill.zoom).toBeCloseTo(900 / 1100);
  expect((0 + fill.scrollX) * fill.zoom).toBeCloseTo((1600 - 800 * fill.zoom) / 2); // the page's left edge on screen
  expect(fill.scrollY).toBeCloseTo(0);
  // zoomed in: dragged past the top-left corner, then past the bottom-right one — stopped at the edges
  const v = { width: 1600, height: 900, zoom: 3 };
  const corner = heldView(page, { ...v, scrollX: 100, scrollY: 100 }, 1)!;
  expect(corner.zoom).toBe(3);
  expect(corner.scrollX).toBeCloseTo(0); // -0 from -page.x: the same to Excalidraw
  expect(corner.scrollY).toBeCloseTo(0);
  const far = heldView(page, { ...v, scrollX: -5000, scrollY: -5000 }, 1)!;
  expect(far.scrollX).toBeCloseTo(1600 / 3 - 800);
  expect(far.scrollY).toBeCloseTo(900 / 3 - 1100);
  // inside: left alone
  expect(heldView(page, { ...v, scrollX: -100, scrollY: -100 }, 1)).toBeNull();
});

test("an element's [[link]] names a note; a web address is left to Excalidraw", () => {
  expect(wikiTarget("[[Lecture 3]]")).toBe("Lecture 3");
  expect(wikiTarget(" [[notes/Kitaev#Majoranas|the chain]] ")).toBe("notes/Kitaev");
  expect(wikiTarget("https://example.org")).toBeNull();
  expect(wikiTarget(null)).toBeNull();
});
