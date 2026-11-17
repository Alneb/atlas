import { test, expect } from "@playwright/test";
import { openFile } from "./open";
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";
import { EPUB, installBooks } from "./epub-fixture";

// The books plugin (plugins/beta/books/view.js): an EPUB built here (EPUB 3: container, package, nav,
// two chapters, a stylesheet), read in the page — the library, the reader, the contents, a link inside the book,
// paging, and where you are written to the book's note (reading_chapter, reading_at, progress, last_read).
const PLUGIN = join(WS, ".atlas/plugins/books");

test.beforeAll(() => {
  installBooks(PLUGIN);
  rmSync(join(WS, "books"), { recursive: true, force: true });
  mkdirSync(join(WS, "books/physics"), { recursive: true });
  writeFileSync(join(WS, "books/physics/quantum.epub"), EPUB);
});
test.afterAll(() => { rmSync(PLUGIN, { recursive: true, force: true }); rmSync(join(WS, "books"), { recursive: true, force: true }); });

test("a book's note: its highlights read back, the attribution line left out", async () => {
  // the plugin is plain JS without types: imported by a variable path, its shape stated here
  const view = "../../plugins/beta/books/view.js";
  const { highlightsIn, notePathOf, highlightBlock } = (await import(view)) as {
    highlightsIn(md: string): { text: string; chapter?: number; k?: number }[]; notePathOf(book: string): string; highlightBlock(text: string, where: string, k?: number): string;
  };
  expect(notePathOf("books/a/quantum.epub")).toBe("books/a/quantum.md");
  const md = "---\nbook: '[[quantum.epub]]'\ntitle: Quantum Notes\n---\n# Quantum Notes\n\n## Highlights\n" + highlightBlock("two  spaces\nand a line", "One, chapter 1") + "\nMy own words.\n" + highlightBlock("second", "Two, chapter 2");
  expect(highlightsIn(md).map((h) => h.text)).toEqual(["two spaces and a line", "second"]);
});

test("highlights are anchored: the occurrence chosen, its own chapter, only under the heading, a new one under it", async () => {
  const view = "../../plugins/beta/books/view.js";
  type H = { text: string; chapter?: number; k?: number; where?: string };
  const { highlightsIn, highlightBlock, addHighlight } = (await import(view)) as {
    highlightsIn(md: string): H[]; highlightBlock(text: string, where: string, k?: number): string; addHighlight(md: string, block: string): string;
  };
  const { pick } = (globalThis as unknown as { atlasMarks: { pick(text: string, ps: (string | H)[], chapter?: number): { k: number; len: number }[] } }).atlasMarks;
  // a phrase twice in a chapter: the one chosen is marked, not the first; nowhere in another chapter
  const text = "the cat sat. later the cat sat again.";
  expect(pick(text, [{ text: "the cat sat", chapter: 2, k: 19 }], 2)).toEqual([{ k: 19, len: 11 }]);
  expect(pick(text, [{ text: "the cat sat", chapter: 3, k: 19 }], 2)).toEqual([]);
  expect(pick(text, ["the cat sat"], 2)).toEqual([{ k: 0, len: 11 }]); // written before anchors: the first, as before
  // only quotes under `## Highlights` count, callouts never; a new one goes at the end of that section
  const md = "> [!note] mine\n> my own quote\n\n## Highlights\n" + highlightBlock("the cat sat", "Two, chapter 2", 19) + "\n> [!tip]\n> not one\n\n## Thoughts\n\n> also mine\n";
  expect(highlightsIn(md)).toEqual([{ text: "the cat sat", where: "Two, chapter 2", chapter: 2, k: 19 }]);
  const added = addHighlight(md, highlightBlock("more", "Three, chapter 3", 4));
  expect(added.indexOf("> more")).toBeLessThan(added.indexOf("## Thoughts"));
  expect(highlightsIn(added).map((h) => h.text)).toEqual(["the cat sat", "more"]);
});

test("the pen over a book: a dot is a tap, a line along the text marks it, a bar down the margin marks its lines", async () => {
  const view = "../../plugins/beta/books/view.js";
  type P = { x: number; y: number };
  const { penGesture } = (await import(view)) as { penGesture(pts: P[]): null | { kind: string; x?: number; from?: P; to?: P; top?: number; bottom?: number } };
  expect(penGesture([{ x: 50, y: 50 }, { x: 54, y: 52 }])).toMatchObject({ kind: "tap" });
  // drawn right to left and a little wavy: still from its left end to its right end, at its middle height
  expect(penGesture([{ x: 300, y: 98 }, { x: 200, y: 104 }, { x: 100, y: 100 }])).toEqual({ kind: "line", from: { x: 100, y: 100 }, to: { x: 300, y: 100 } });
  expect(penGesture([{ x: 20, y: 100 }, { x: 22, y: 250 }, { x: 19, y: 400 }])).toMatchObject({ kind: "bar", top: 100, bottom: 400 });
  expect(penGesture([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }])).toBeNull(); // a scribble
  expect(penGesture([])).toBeNull();
});

test("books: the library, an EPUB read in the page, paged, its contents and links, and where you are saved", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("F1");
  await page.keyboard.type("Books: library");
  await page.getByTestId("palette").getByText("Books: library", { exact: true }).first().click();
  // the library is the Libraries page's E-books; the pane is only the reader
  const libs = page.locator(".libraries");
  const openBook = async () => {
    await libs.locator(".card", { hasText: "quantum" }).first().click();
    await libs.locator(".detail").getByRole("button", { name: "Read" }).click();
  };
  await page.screenshot({ path: test.info().outputPath("library.png") });
  await openBook();
  const pane = page.locator(".books");
  const book = pane.frameLocator("iframe.b-frame");
  await expect(book.locator("h1")).toHaveText("One");
  await expect(pane.locator(".b-where")).toHaveText(/^1 \/ \d+ · chapter 1 of 2$/); // paged: several pages
  const pages = Number((await pane.locator(".b-where").textContent())!.match(/\/ (\d+)/)![1]);
  expect(pages).toBeGreaterThan(1);
  await page.screenshot({ path: test.info().outputPath("reader.png") });
  await expect(book.locator("h1")).toHaveCSS("letter-spacing", "2px"); // the book's own stylesheet came along
  expect(await page.title()).not.toBe("ran"); // the book's script never ran
  await pane.locator(".b-frame").focus();
  await page.keyboard.press("ArrowRight");
  await expect(pane.locator(".b-where")).toHaveText(new RegExp(`^2 / ${pages} · chapter 1 of 2$`));
  // where you are: in the book's note, as the native reader writes it (fa400b8; no reading.json any more)
  const note = join(WS, "books/physics/quantum.md");
  const chapter = () => (existsSync(note) ? /^reading_chapter: "?(\d+)"?$/m.exec(readFileSync(note, "utf8"))?.[1] : undefined);
  await expect.poll(chapter).toBe("1");
  // the contents: chapter two at its #end
  await pane.getByRole("button", { name: "Contents" }).click();
  await pane.getByRole("button", { name: "Two: readout" }).click();
  await expect(book.locator("h1")).toHaveText("Two");
  await expect.poll(chapter).toBe("2");
  // a highlight: the selected passage kept in the book's note beside it, marked in the book
  await book.locator("p").first().evaluate((p) => {
    const d = p.ownerDocument, r = d.createRange();
    r.setStart(p.firstChild!, 0); r.setEnd(p.firstChild!, 12);
    d.getSelection()!.removeAllRanges(); d.getSelection()!.addRange(r);
    d.dispatchEvent(new Event("selectionchange"));
  });
  await pane.getByRole("button", { name: "Highlight" }).click();
  await expect.poll(() => existsSync(note) && readFileSync(note, "utf8")).toContain("> Paragraph 1");
  const md = readFileSync(note, "utf8");
  expect(md).toMatch(/^book: ['"]\[\[quantum\.epub\]\]['"]$/m); // made by the core, as on every device
  expect(md).toContain("> — Two: readout, chapter 2");
  await expect(book.locator("mark.atlas-hl")).toHaveText("Paragraph 1"); // "Paragraph 1 " squashed: the trailing space dropped
  // back to the library and in again: where you left
  await pane.getByRole("button", { name: "‹ Library" }).click();
  await openBook();
  await expect(pane.frameLocator("iframe.b-frame").locator("h1")).toHaveText("Two");
  await expect(pane.frameLocator("iframe.b-frame").locator("mark.atlas-hl")).toHaveText("Paragraph 1"); // marked again from the note

  // a second highlight in the same paragraph: both marked, now and when the book opens again (wrapping the first one
  // split the paragraph's text, and the second was looked for where the text had been)
  await book.locator("p").first().evaluate((p) => {
    const d = p.ownerDocument, w = d.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let n = w.nextNode() as Text | null;
    while (n && !n.data.includes("superconducting")) n = w.nextNode() as Text | null;
    const at = n!.data.indexOf("superconducting"), r = d.createRange();
    r.setStart(n!, at); r.setEnd(n!, at + "superconducting qubits".length);
    d.getSelection()!.removeAllRanges(); d.getSelection()!.addRange(r);
    d.dispatchEvent(new Event("selectionchange"));
  });
  await pane.getByRole("button", { name: "Highlight" }).click();
  await expect(book.locator("mark.atlas-hl")).toHaveText(["Paragraph 1", "superconducting qubits"]);
  await pane.getByRole("button", { name: "‹ Library" }).click();
  await openBook();
  await expect(book.locator("mark.atlas-hl")).toHaveText(["Paragraph 1", "superconducting qubits"]);
  // anchored: "superconducting qubits" is in every paragraph of the chapter, but only the one chosen is marked; a tap on
  // it asks, then takes it out of the note and off the page, the other highlight kept
  expect(readFileSync(note, "utf8")).toMatch(/> — Two: readout, chapter 2 <!-- atlas-hl k=\d+ -->/);
  await book.locator("mark.atlas-hl", { hasText: "superconducting qubits" }).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(book.locator("mark.atlas-hl")).toHaveText(["Paragraph 1"]);
  await expect.poll(() => readFileSync(note, "utf8")).not.toContain("> superconducting qubits");
  expect(readFileSync(note, "utf8")).toContain("> Paragraph 1");

  // search the whole book: every chapter's hits, a click opens the chapter at the page of the find, marked
  await pane.getByRole("button", { name: "Search" }).click();
  const query = pane.getByRole("searchbox", { name: "Search the book" });
  await query.fill("QUBITS");
  await expect(pane.locator(".b-count")).toHaveText("43 found"); // 40 paragraphs in one, 3 in two
  await expect(pane.locator(".b-found-head")).toHaveText(["One: qubits", "Two: readout"]);
  await query.fill("paragraph 30 of");
  await expect(pane.locator(".b-count")).toHaveText("1 found");
  await pane.locator(".b-hit").click();
  await expect(book.locator("h1")).toHaveText("One");
  await expect(book.locator("mark.atlas-found")).toHaveText("Paragraph 30 of");
  await expect(pane.locator(".b-where")).not.toHaveText(/^1 \//); // paged on to where it is
  await expect(pane.locator(".b-find")).toBeHidden();
  await pane.getByRole("button", { name: "Search" }).click();
  await query.fill("nowhere in it");
  await expect(pane.locator(".b-count")).toHaveText("Not in this book.");
  await query.press("Escape");
  await expect(pane.locator(".b-find")).toBeHidden();
  expect(errs).toEqual([]);
});

// the editor contract (plugin API 7): Books claims `.epub`, so a click in the file tree opens the reader, and a link's
// `#…` naming an entry of the contents opens the book there (`atlas.anchor`) rather than where it was left
test("books: an .epub opens in the reader on a click in the file tree, at the chapter a link names", async ({ page, request }) => {
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "notes/books-link.md", text: "# Reading\n\nStart [[quantum.epub#One: qubits|at qubits]].\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+f");
  for (const dir of ["books", "books/physics"]) await page.locator(`.row[data-path="${dir}"]`).click();
  await page.locator('.row[data-path="books/physics/quantum.epub"]').click();
  const pane = page.locator(".books");
  await expect(pane.frameLocator("iframe.b-frame").locator("h1")).toBeVisible();
  await expect(pane.locator(".b-title")).toHaveText("Quantum Notes");
  await page.screenshot({ path: test.info().outputPath("opened-from-tree.png") });
  // the link, while the book is open: the pane goes to that chapter (pane.onAnchor)
  await openFile(page, "books-link.md");
  await page.locator(".cm-content .cm-hmd-internal-link", { hasText: "at qubits" }).first().click({ modifiers: ["Control"] });
  await expect(page.locator(".books").frameLocator("iframe.b-frame").locator("h1")).toHaveText("One");
});
