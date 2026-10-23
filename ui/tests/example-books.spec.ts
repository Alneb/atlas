import { test, expect } from "@playwright/test";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { WS } from "../playwright.config";
import { installZipPlugin } from "./fixtures/plugins";

// The books plugin (plugins/beta/books/view.js): an EPUB built here (EPUB 3: container, package, nav,
// two chapters, a stylesheet), read in the page — the library, the reader, the contents, a link inside the book,
// paging, and where you are written to the book's note (reading_chapter, reading_at, progress, last_read).
const PLUGIN = join(WS, ".atlas/plugins/books");

function zip(files: [string, string, boolean][]): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let at = 0;
  for (const [name, text, deflate] of files) {
    const data = Buffer.from(text), body = deflate ? deflateRawSync(data) : data, n = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt32LE(crc32(data), 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc32(data), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(at, 42);
    locals.push(h, n, body); central.push(c, n);
    at += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...locals, cd, end]);
}
const xhtml = (title: string, body: string) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title><link rel="stylesheet" href="../style/book.css"/></head><body>${body}</body></html>`;
const para = (n: number) => Array.from({ length: n }, (_, i) => `<p>Paragraph ${i + 1} of a long chapter about superconducting qubits, written long enough that it needs several pages on a small screen.</p>`).join("");

const EPUB = zip([
  ["mimetype", "application/epub+zip", false],
  ["META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`, true],
  ["OEBPS/content.opf", `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Quantum Notes</dc:title><dc:creator>A. Author</dc:creator></metadata>
    <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/two.xhtml" media-type="application/xhtml+xml"/><item id="css" href="style/book.css" media-type="text/css"/></manifest>
    <spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`, true],
  ["OEBPS/nav.xhtml", xhtml("Contents", `<nav epub:type="toc"><ol><li><a href="text/one.xhtml">One: qubits</a></li><li><a href="text/two.xhtml#end">Two: readout</a></li></ol></nav>`), true],
  ["OEBPS/text/one.xhtml", xhtml("One", `<h1>One</h1><p><a href="two.xhtml">to chapter two</a></p>${para(40)}<script>document.title = "ran";</script>`), true],
  ["OEBPS/text/two.xhtml", xhtml("Two", `<h1>Two</h1>${para(3)}<p id="end">The end of the book.</p>`), true],
  ["OEBPS/style/book.css", "h1 { letter-spacing: 2px; }", false],
]);

test.beforeAll(() => {
  installZipPlugin(); // view.js imports ../zip/zip.js
  mkdirSync(PLUGIN, { recursive: true });
  mkdirSync(join(PLUGIN, "shared"), { recursive: true }); // view.js imports shared/marks.js
  for (const f of ["plugin.toml", "main.js", "view.js", "shared/marks.js"]) copyFileSync(new URL(`../../plugins/beta/books/${f}`, import.meta.url), join(PLUGIN, f));
  rmSync(join(WS, "books"), { recursive: true, force: true });
  mkdirSync(join(WS, "books/physics"), { recursive: true });
  writeFileSync(join(WS, "books/physics/quantum.epub"), EPUB);
});
test.afterAll(() => { rmSync(PLUGIN, { recursive: true, force: true }); rmSync(join(WS, "books"), { recursive: true, force: true }); });

test("a book's note: its highlights read back, the attribution line left out", async () => {
  // the plugin is plain JS without types: imported by a variable path, its shape stated here
  const view = "../../plugins/beta/books/view.js";
  const { highlightsIn, newNote, notePathOf, highlightBlock } = (await import(view)) as {
    highlightsIn(md: string): string[]; newNote(book: string, meta: { title: string; author: string }): string;
    notePathOf(book: string): string; highlightBlock(text: string, where: string): string;
  };
  expect(notePathOf("books/a/quantum.epub")).toBe("books/a/quantum.md");
  const md = newNote("books/a/quantum.epub", { title: "Quantum Notes", author: "A. Author" }) + highlightBlock("two  spaces\nand a line", "One, chapter 1") + "\nMy own words.\n" + highlightBlock("second", "Two, chapter 2");
  expect(highlightsIn(md)).toEqual(["two spaces and a line", "second"]);
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
  const pane = page.locator(".books");
  const card = pane.locator(".b-card", { hasText: "Quantum Notes" }); // the title from the package, not the file name
  await expect(card).toContainText("A. Author");
  await page.screenshot({ path: test.info().outputPath("library.png") });
  await card.click();
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
  expect(md).toContain('book: "[[quantum.epub]]"');
  expect(md).toContain("> — Two: readout, chapter 2");
  await expect(book.locator("mark.atlas-hl")).toHaveText("Paragraph 1"); // "Paragraph 1 " squashed: the trailing space dropped
  // back to the library and in again: where you left
  await pane.getByRole("button", { name: "‹ Library" }).click();
  await pane.locator(".b-card", { hasText: "Quantum Notes" }).click();
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
  await pane.locator(".b-card", { hasText: "Quantum Notes" }).click();
  await expect(book.locator("mark.atlas-hl")).toHaveText(["Paragraph 1", "superconducting qubits"]);

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
  await page.keyboard.press("Control+p");
  await page.keyboard.type("books-link.md");
  await expect(page.getByTestId("palette").getByText("books-link", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.locator(".cm-content .cm-hmd-internal-link", { hasText: "at qubits" }).first().click({ modifiers: ["Control"] });
  await expect(page.locator(".books").frameLocator("iframe.b-frame").locator("h1")).toHaveText("One");
});
