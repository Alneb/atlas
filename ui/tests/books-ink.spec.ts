import { test, expect, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";
import { EPUB, installBooks } from "./epub-fixture";

// Free ink over a reflowed book (docs/design/DESIGN-ebook-ink.md): a stroke is pinned to the character under its top
// left and kept in em (plugins/beta/books/shared/ink.js), as a `text-ink` mark of the book's note (core pdf_marks.rs).
// The pure part in node; then the reader: drawn with the mouse, kept in the note, on the same words after a reflow,
// erased, undone, back after a reload; screenshots in both themes.
const PLUGIN = join(WS, ".atlas/plugins/books");
const NOTE = join(WS, "inked/quantum.md");

test.beforeAll(() => {
  installBooks(PLUGIN);
  rmSync(join(WS, "inked"), { recursive: true, force: true });
  mkdirSync(join(WS, "inked"), { recursive: true });
  writeFileSync(join(WS, "inked/quantum.epub"), EPUB);
});
test.afterAll(() => { rmSync(PLUGIN, { recursive: true, force: true }); rmSync(join(WS, "inked"), { recursive: true, force: true }); });

type P = { x: number; y: number; pressure?: number; t?: number };
type Box = { x: number; y: number; h: number };
type View = {
  pinInk(pts: P[], at: P, em: number): { x: number; y: number; pressure: number; t: number }[];
  placeInk(s: { x: number; y: number; pressure: number }[], at: P, em: number): P[];
  inkTopLeft(pts: P[]): P;
  anchorFor(pts: P[], at: (x: number, y: number) => number, box: (k: number) => Box | null, em: number): { k: number; box: Box } | null;
  inkColor(c?: string | null): string;
  inkMark(o: { chapter: number; k: number; samples: string; width: number; color?: string | null }): { kind: string; page: number; k: number; id: string; strokes: { width: number; color?: string }[] };
  inkOf(marks: unknown[], chapter: number): unknown[];
};

test("ink's geometry: pinned in em to its character, placed back from it, scaled with the text", async () => {
  // the plugin is plain JS without types: imported by a variable path, its shape stated here
  const view = "../../plugins/beta/books/view.js";
  const v = (await import(view)) as View;
  const pts = [{ x: 100, y: 52, t: 0 }, { x: 140, y: 50, t: 8 }, { x: 180, y: 51, t: 16 }];
  expect(v.inkTopLeft(pts)).toEqual({ x: 100, y: 50 });
  const at = { x: 96, y: 40 }, s = v.pinInk(pts, at, 20);
  expect(s[0]).toEqual({ x: 0.2, y: 0.6, pressure: 0.5, tilt_x: 0, tilt_y: 0, t: 0 });
  // the same place and size: where it was drawn
  v.placeInk(s, at, 20).forEach((q, i) => { expect(q.x).toBeCloseTo(pts[i].x, 9); expect(q.y).toBeCloseTo(pts[i].y, 9); });
  // the words moved and the text doubled: from the character's new place, twice as far and as wide
  const moved = v.placeInk(s, { x: 10, y: 300 }, 40);
  expect(moved[2].x).toBeCloseTo(10 + (180 - 96) * 2, 6);
  expect(moved[2].y).toBeCloseTo(300 + (51 - 40) * 2, 6);

  // the anchor: a character whose box is far from the point asked (a margin answering with the chapter's start) is
  // passed over for one under another of the stroke's points; nothing near → none (the stroke is not kept)
  const boxes: Record<number, Box> = { 0: { x: 40, y: 900, h: 20 }, 7: { x: 138, y: 44, h: 20 } };
  const atPoint = (x: number) => (x < 120 ? 0 : 7);
  expect(v.anchorFor(pts, atPoint, (k) => boxes[k] ?? null, 20)).toEqual({ k: 7, box: boxes[7] });
  expect(v.anchorFor(pts, () => 0, (k) => boxes[k] ?? null, 20)).toBeNull();
  expect(v.anchorFor(pts, () => -1, () => null, 20)).toBeNull();

  // black, or no colour, is the text's own colour (readable on a dark page); another colour stays
  expect(v.inkColor(null)).toBe("currentColor");
  expect(v.inkColor("#000000")).toBe("currentColor");
  expect(v.inkColor("#e03131")).toBe("#e03131");
  const m = v.inkMark({ chapter: 3, k: 12, samples: "AAAA", width: 0.0894 });
  expect(m).toMatchObject({ kind: "text-ink", page: 3, k: 12, strokes: [{ width: 0.089 }] });
  expect(m.id).toMatch(/^m-[0-9a-z]{8}$/);
  expect(m.strokes[0].color).toBeUndefined();
  expect(v.inkOf([m, { kind: "ink", page: 3, strokes: [] }, { ...m, page: 4 }], 3)).toEqual([m]);

  // a highlight never lands after the marks block the core keeps at the note's end
  const { addHighlight, highlightBlock } = (globalThis as unknown as { atlasMarks: { addHighlight(md: string, b: string): string; highlightBlock(t: string, w: string, k?: number): string } }).atlasMarks;
  const block = "```pdf-marks\nm-aaaaaaa1 text-ink p1 {}\n```\n";
  for (const md of [`# Q\n\n${block}`, `# Q\n\n## Highlights\n\n> a\n> — One, chapter 1\n\n${block}`]) {
    const out = addHighlight(md, highlightBlock("new words", "One, chapter 1", 5));
    expect(out.indexOf("> new words")).toBeLessThan(out.indexOf("```pdf-marks"));
    expect(out.endsWith(block)).toBe(true);
  }
});

/** The reader's ink paths: each one's start (frame px) and the anchor character's box now. */
async function inkState(page: Page, k: number) {
  return page.evaluate((k) => {
    const frame = document.querySelector<HTMLIFrameElement>(".books iframe.b-frame")!;
    const d = frame.contentDocument!;
    const marks = (window as unknown as { atlasMarks: { textMap(d: Document): unknown; charBox(d: Document, m: unknown, k: number): { x: number; y: number } | null } }).atlasMarks;
    const box = marks.charBox(d, marks.textMap(d), k);
    const starts = [...document.querySelectorAll(".books svg.b-ink path")].map((p) => {
      const m = /^M(-?[\d.]+) (-?[\d.]+)/.exec(p.getAttribute("d") ?? "");
      return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
    });
    return { box, starts };
  }, k);
}

const marksLines = () => (existsSync(NOTE) ? readFileSync(NOTE, "utf8").split("\n").filter((l) => /^m-[0-9a-z]{8} /.test(l)) : []);

async function openBook(page: Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+f");
  // the folder may still be open from the spec before (the tree keeps what was open): a click would close it
  const epub = page.locator('.row[data-path="inked/quantum.epub"]');
  await page.locator('.row[data-path="inked"]').waitFor();
  if (!(await epub.isVisible())) await page.locator('.row[data-path="inked"]').click();
  await epub.click();
  await expect(page.locator(".books").frameLocator("iframe.b-frame").locator("h1")).toHaveText("One");
}

test("books: ink drawn over a reflowed page stays with its words, in the book's note", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await openBook(page);
  const pane = page.locator(".books"), book = pane.frameLocator("iframe.b-frame");

  // the pen: a line under the middle of the first paragraph's first line (the one after the link) — mid-line, so a
  // narrower column moves its words (the column keeps its left margin: a line's first word would stay put)
  await pane.getByRole("button", { name: "Pen" }).click();
  await expect(pane.getByRole("button", { name: "Pen" })).toHaveAttribute("aria-pressed", "true");
  const p = (await book.locator("p").nth(1).boundingBox())!;
  const y = p.y + 22, x0 = p.x + p.width * 0.55;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(x0 + i * 15, y + (i % 2));
  await page.mouse.up();

  // kept in the book's note as a text-ink mark of chapter 1, pinned to a character
  await expect.poll(() => marksLines().filter((l) => / text-ink p1 /.test(l)).length).toBe(1);
  const line = marksLines()[0];
  const k = Number(/"k":(\d+)/.exec(line)![1]);
  expect(k).toBeGreaterThan(0);
  expect(readFileSync(NOTE, "utf8")).toMatch(/^book: ['"]\[\[quantum\.epub\]\]['"]$/m); // the book's own note, made as Books makes it
  await expect(pane.locator("svg.b-ink path")).toHaveCount(1);
  const before = await inkState(page, k);
  expect(before.box).not.toBeNull();
  const offset = { x: before.starts[0]!.x - before.box!.x, y: before.starts[0]!.y - before.box!.y };

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme }); // judged in both themes (docs/guides/UI-STYLE.md)
    await page.screenshot({ path: test.info().outputPath(`ink-${scheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: "light" });

  // a narrower window: the column moves, the ink moves with its character, the same distance from it
  await page.setViewportSize({ width: 900, height: 800 });
  await expect.poll(async () => (await inkState(page, k)).box!.x).not.toBeCloseTo(before.box!.x, 0);
  const after = await inkState(page, k);
  expect(after.starts).toHaveLength(1);
  expect(after.starts[0]!.x - after.box!.x).toBeCloseTo(offset.x, 0);
  expect(after.starts[0]!.y - after.box!.y).toBeCloseTo(offset.y, 0);
  await page.screenshot({ path: test.info().outputPath("ink-reflowed.png") });

  // the eraser takes it off the page and out of the note (a tombstone stays); Ctrl+Z brings it back
  await pane.getByRole("button", { name: "Eraser" }).click();
  const s = after.starts[0]!, f = (await pane.locator("iframe.b-frame").boundingBox())!;
  await page.mouse.move(f.x + s.x + 30, f.y + s.y - 15);
  await page.mouse.down();
  await page.mouse.move(f.x + s.x + 30, f.y + s.y + 15, { steps: 6 });
  await page.mouse.up();
  await expect(pane.locator("svg.b-ink path")).toHaveCount(0);
  await expect.poll(() => marksLines().filter((l) => / deleted p1 /.test(l)).length).toBe(1);
  await page.keyboard.press("Control+z");
  await expect(pane.locator("svg.b-ink path")).toHaveCount(1);
  await expect.poll(() => marksLines().filter((l) => / text-ink p1 /.test(l)).length).toBe(1);

  // Esc puts the pen away; the text selects again
  await page.keyboard.press("Escape");
  await expect(pane.getByRole("button", { name: "Eraser" })).toHaveAttribute("aria-pressed", "false");

  // opened again: the ink is read from the note
  await openBook(page);
  await expect(page.locator(".books svg.b-ink path")).toHaveCount(1);
  expect(errs).toEqual([]);
});
