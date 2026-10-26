import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";
import { writePdf } from "./fixtures/pdf";

// The reader (lib/pdf-reader.ts, lib/pdf-tools.ts) on each engine (lib/pdf-engine.ts: PDFium, pdf.js): a generated
// three-page PDF with text, a link to its last page, a web link and an outline — its text layer, find, a highlight
// saved with its words as it is made, a link copied and followed by its words, the outline, a text note, the reader's
// rotation. Marks are saved into the PDF's note (doc.md beside it), in its pdf-marks block. Both engines must give
// the same answers.
const H = { "x-atlas": "1" };
const DIR = "pdf-reader-test";
const PATH = `${DIR}/doc.pdf`;
const NOTE = `${DIR}/doc.md`;

const LINES = [
  ["The quantum dot model", "Go to the last page", "Visit the example site"],
  ["Here lies the second passage of text", "quantum again"],
  ["The last page and quantum once more"],
];
const text = (lines: string[]) => `BT /F1 18 Tf 72 700 Td ${lines.map((l, i) => `${i ? "0 -30 Td " : ""}(${l}) Tj`).join(" ")} ET`;

/** A 612 × 792 pt PDF of LINES in Helvetica; page 1 links its second line to page 3 and its third to a web page; an
 *  outline names page 2. ASCII only, so offsets are lengths. */
function makePdf(): string {
  // 1 catalog, 2 pages, 3 font, 4 outlines, 5 outline item, then per page: page, contents
  const page = (i: number) => 6 + i * 2;
  const objs: string[] = [
    "<</Type/Catalog/Pages 2 0 R/Outlines 4 0 R>>",
    `<</Type/Pages/Kids[${LINES.map((_, i) => `${page(i)} 0 R`).join(" ")}]/Count ${LINES.length}>>`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    "<</Type/Outlines/First 5 0 R/Last 5 0 R/Count 1>>",
    `<</Title(Chapter two)/Parent 4 0 R/Dest[${page(1)} 0 R/XYZ 0 792 0]>>`,
  ];
  const annots = [
    `<</Type/Annot/Subtype/Link/Rect[72 664 260 688]/Border[0 0 0]/Dest[${page(2)} 0 R/XYZ 0 792 0]>>`,
    "<</Type/Annot/Subtype/Link/Rect[72 634 280 658]/Border[0 0 0]/A<</S/URI/URI(https://example.org/)>>>>",
  ];
  LINES.forEach((lines, i) => {
    const body = text(lines), extra = i === 0 ? `/Annots[${annots.join(" ")}]` : "";
    objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 3 0 R>>>>/Contents ${page(i) + 1} 0 R${extra}>>`, `<</Length ${body.length}>>\nstream\n${body}\nendstream`);
  });
  return writePdf(objs);
}

test.beforeAll(async ({ request }) => {
  await request.put("/api/file", { headers: H, data: { path: PATH, text: makePdf() } });
  await request.put("/api/file", { headers: H, data: { path: `${DIR}/links.md`, text: `# Places\n\nsee [[${PATH}#page=2|the second passage]]\n` } });
});
test.afterAll(async ({ request }) => {
  await request.post(`/api/fs/trash?path=${encodeURIComponent(DIR)}`, { headers: H }).catch(() => {});
});
test.beforeEach(async ({ request }) => {
  await request.post(`/api/fs/trash?path=${encodeURIComponent(NOTE)}`, { headers: H }).catch(() => {});
});

async function openReader(page: Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("atlas.pdf")) localStorage.removeItem(k); });
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: PATH } } });
  const pane = page.locator(".pdf-pane").last();
  await expect(pane.locator(".pager .faint")).toHaveText("/ 3", { timeout: 20000 });
  await expect(pane.locator('.page[data-page-number="1"] .textLayer span').first()).toBeAttached({ timeout: 20000 });
  return pane;
}

type Mark = { id: string; kind: string; page: number; quote?: { exact: string }; text?: string };
async function marks(page: Page): Promise<Mark[]> {
  const r = await page.request.get(`/api/pdf-marks?pdf=${encodeURIComponent(PATH)}`, { headers: H });
  return r.ok() ? ((await r.json()).marks as Mark[]) : [];
}
async function noteText(page: Page): Promise<string> {
  const r = await page.request.get(`/api/file?path=${encodeURIComponent(NOTE)}`, { headers: H });
  return r.ok() ? (await r.json()).text : "";
}

for (const eng of ["pdfium", "pdfjs"] as const) test.describe(`with ${eng}`, () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/config", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const res = await route.fetch(), body = await res.json();
      body.config.pdf.engine = eng;
      await route.fulfill({ response: res, json: body });
    });
  });

  test("the text layer lies over the page; find counts every match and steps through them", async ({ page }) => {
    const pane = await openReader(page);
    await expect(pane.locator(".title .engine")).toHaveCount(eng === "pdfjs" ? 1 : 0); // a backup engine says so
    await expect(pane.locator('.page[data-page-number="1"] .textLayer')).toContainText("The quantum dot model");
    await pane.locator(".viewer-container").click({ position: { x: 8, y: 8 } }); // the pane takes the keys
    await page.keyboard.press("Control+f");
    await page.keyboard.type("quantum");
    await expect(pane.locator(".findbar .faint")).toHaveText("1/3", { timeout: 10000 });
    await expect(pane.locator(".findLayer > div.selected")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(pane.locator(".findbar .faint")).toHaveText("2/3");
  });

  test("selected words highlighted with H are saved at once with their words, and copied as a link by them", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const pane = await openReader(page);
    const span = pane.locator('.page[data-page-number="1"] .textLayer span', { hasText: "The quantum dot model" });
    const b = (await span.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.18, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.62, b.y + b.height / 2, { steps: 6 });
    await page.mouse.up();
    await pane.getByRole("button", { name: "Copy link" }).click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(new RegExp(`^\\[\\[${PATH.replace(/[./]/g, "\\$&")}#page=1\\|.*quantum.*\\]\\]$`));
    await page.keyboard.press("h");
    await expect.poll(async () => (await marks(page)).filter((m) => m.kind === "highlight").map((m) => m.quote?.exact), { timeout: 20000 })
      .toEqual([expect.stringContaining("quantum")]);
    // the note holds it, in its block, last; the page draws it
    expect((await noteText(page)).trimEnd()).toMatch(/```pdf-marks\nm-[0-9a-z]{8} highlight p1 \{.*quantum.*\}\n```$/s);
    await expect(pane.locator('.page[data-page-number="1"] svg.atlas-marks [data-kind="highlight"] rect')).toHaveCount(1, { timeout: 20000 });
    // the note shows the block as its marks, each linked to its place
    await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: NOTE } } });
    const view = page.locator('.fence-block[data-fence-name="pdf-marks"]').first();
    await expect(view.locator(".quote")).toContainText("quantum", { timeout: 20000 });
    await expect(view).toContainText("doc.pdf");
    // to be looked at, in both themes (docs/guides/UI-STYLE.md)
    await page.screenshot({ path: `test-results/pdf-reader-${eng}-light.png` });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/pdf-reader-${eng}-dark.png` });
  });

  test("a link with words opens its page with those words selected", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    // opened by its path: another spec's notes/links.md has the same title in quick open
    await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: `${DIR}/links.md` } } });
    await page.locator(".cm-content").getByText("the second passage").click();
    await expect(page.getByRole("textbox", { name: "Page", exact: true })).toHaveValue("2", { timeout: 20000 });
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ""), { timeout: 20000 }).toBe("the second passage");
  });

  test("a link to a mark in the PDF's note (`[[doc#^m-…]]`) opens the PDF at the mark, which blinks", async ({ page }) => {
    const id = "m-link0001";
    await page.request.post(`/api/pdf-marks?pdf=${encodeURIComponent(PATH)}`, { headers: H, data: [{ op: "put", mark: { id, page: 2, version: 1, kind: "highlight", quads: [[72, 660, 300, 684]] } }] });
    await page.request.put("/api/file", { headers: H, data: { path: `${DIR}/to-mark.md`, text: `# To a mark\n\nsee [[doc#^${id}|that mark]]\n` } });
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: `${DIR}/to-mark.md` } } });
    await page.locator(".cm-content").getByText("that mark").click();
    const pane = page.locator(".pdf-pane").last();
    await expect(pane.locator(".page-in")).toHaveValue("2", { timeout: 20000 });
    await expect(pane.locator(`.page[data-page-number="2"] svg.atlas-marks [data-mark="${id}"]`)).toHaveClass(/atlas-flash-mark/, { timeout: 20000 });
  });

  test("a saved mark picked with the select tool is recoloured, reworded, moved and deleted; undo brings it back", async ({ page }) => {
    const tb = "m-edit0001", hl = "m-edit0002";
    await page.request.post(`/api/pdf-marks?pdf=${encodeURIComponent(PATH)}`, { headers: H, data: [
      { op: "put", mark: { id: tb, page: 1, version: 1, color: "#000000", kind: "text-box", rect: [320, 480, 440, 500], text: "first words", size: 12 } },
      { op: "put", mark: { id: hl, page: 1, version: 1, color: "#FFE066", kind: "highlight", quads: [[72, 696, 200, 716]] } },
    ] });
    const pane = await openReader(page);
    const box = pane.locator(`.page[data-page-number="1"] svg.atlas-marks [data-mark="${tb}"]`);
    await expect(box).toContainText("first words", { timeout: 20000 });
    const bar = pane.getByTestId("pdf-mark-bar");
    const c = (await box.boundingBox())!; // the marks' layer lets the pointer through: clicked where it is drawn
    await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
    await expect(bar).toContainText("Text box");
    await bar.getByRole("button", { name: "Colour blue" }).click();
    const one = async (id: string) => (await marks(page)).find((m) => m.id === id) as (Mark & { color?: string; rect?: number[]; tags?: string[] }) | undefined;
    await expect.poll(async () => (await one(tb))?.color, { timeout: 20000 }).toBe("#74C0FC");
    // the bar is drawn again when the colour's save comes back: open the words box once it has settled
    // (a redraw can still replace the box while it is filled: open, fill and check it again until it holds)
    await expect(async () => {
      const words = bar.getByRole("textbox", { name: "Words" });
      if (!(await words.isVisible())) await bar.getByRole("button", { name: /first words/ }).click({ timeout: 2000 });
      await words.fill("new words #idea", { timeout: 2000 });
      await expect(words).toHaveValue("new words #idea", { timeout: 500 });
      await words.press("Enter", { timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await expect.poll(async () => { const m = await one(tb); return [m?.text, m?.tags]; }, { timeout: 20000 }).toEqual(["new words #idea", ["idea"]]);
    // to be looked at, in both themes
    await page.screenshot({ path: `test-results/pdf-mark-bar-${eng}-light.png` });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/pdf-mark-bar-${eng}-dark.png` });
    await page.emulateMedia({ colorScheme: "light" });
    // dragged 60 px to the right: the box moves right on the page, its size kept
    const b = (await box.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await one(tb))?.rect?.[0] ?? 0, { timeout: 20000 }).toBeGreaterThan(340);
    const moved = (await one(tb))!.rect!;
    expect(moved[2] - moved[0]).toBeCloseTo(120, 3);
    expect(moved[1]).toBeCloseTo(480, 0);
    // Delete takes it out; Ctrl+Z puts it back as it was
    await page.keyboard.press("Delete");
    await expect.poll(async () => (await one(tb))?.kind ?? "gone", { timeout: 20000 }).toBe("gone");
    await expect(bar).toHaveCount(0);
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await one(tb))?.text, { timeout: 20000 }).toBe("new words #idea");
    // a highlight is picked by a click on its words; Esc lets it go
    const hlRect = pane.locator(`.page[data-page-number="1"] svg.atlas-marks [data-mark="${hl}"] rect`);
    // drawn again after the undo (perhaps more than once): found and clicked until its bar shows
    await expect(async () => {
      const h = await hlRect.boundingBox();
      expect(h).not.toBeNull();
      await page.mouse.click(h!.x + h!.width / 2, h!.y + h!.height / 2);
      await expect(bar).toContainText("Highlight", { timeout: 2000 });
    }).toPass({ timeout: 20000 });
    await page.keyboard.press("Escape");
    await expect(bar).toHaveCount(0);
  });

  test("a link in the PDF and the outline go to their pages", async ({ page }) => {
    const pane = await openReader(page);
    await pane.locator('.page[data-page-number="1"] .linkLayer > a[href="#"]').click();
    await expect(pane.locator(".page-in")).toHaveValue("3", { timeout: 10000 });
    await expect(pane.locator('.page[data-page-number="1"] .linkLayer > a[href="https://example.org/"]')).toHaveAttribute("target", "_blank");
    await pane.getByRole("button", { name: "Outline", exact: true }).click();
    await pane.locator(".ol-item", { hasText: "Chapter two" }).click();
    await expect(pane.locator(".page-in")).toHaveValue("2", { timeout: 10000 });
  });

  test("a text note is saved as a text box with its tags, drawn on its page; Ctrl+Z takes it back", async ({ page }) => {
    const pane = await openReader(page);
    await pane.getByTitle("Text note (T)").click();
    const pg = (await pane.locator('.page[data-page-number="1"]').boundingBox())!;
    await page.mouse.click(pg.x + pg.width * 0.5, pg.y + 260);
    const box = pane.locator("textarea.atlas-note-input");
    await expect(box).toBeFocused();
    await box.fill("check this #todo");
    await box.press("Enter");
    await expect.poll(async () => (await marks(page)).map((m) => [m.kind, m.text, (m as { tags?: string[] }).tags]), { timeout: 20000 })
      .toEqual([["text-box", "check this #todo", ["todo"]]]);
    await expect(pane.locator('.page[data-page-number="1"] svg.atlas-marks [data-kind="text-box"]')).toContainText("check this");
    await pane.getByTitle("Select (V)").click();
    await page.keyboard.press("Control+z");
    await expect.poll(async () => (await marks(page)).length, { timeout: 20000 }).toBe(0);
  });

  test("underline, a post-it on a highlight, a stamp, an area clip and a bookmark: each a mark of the note", async ({ page }) => {
    const pane = await openReader(page);
    const select = async (hasText: string, from = 0.05, to = 0.6) => {
      const b = (await pane.locator('.page[data-page-number="1"] .textLayer span', { hasText }).boundingBox())!;
      await page.mouse.move(b.x + b.width * from, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width * to, b.y + b.height / 2, { steps: 6 });
      await page.mouse.up();
      return b;
    };
    const kinds = async () => (await marks(page)).map((m) => m.kind).sort();
    // the first line has no link over it: its start underlined, its end highlighted
    await pane.getByRole("button", { name: "Underline" }).click();
    await select("The quantum dot model", 0.02, 0.3); // letting go marks it
    await expect.poll(kinds, { timeout: 20000 }).toEqual(["underline"]);
    await pane.getByTitle(/^Highlight \(H\)/).click();
    const hl = await select("The quantum dot model", 0.55, 0.97);
    await expect.poll(kinds, { timeout: 20000 }).toEqual(["highlight", "underline"]);
    // a post-it put over the highlight belongs to it
    await pane.getByRole("button", { name: "Post-it" }).click();
    await page.mouse.click(hl.x + hl.width * 0.75, hl.y + hl.height / 2);
    await pane.locator("textarea.atlas-note-input").fill("why? #question");
    await pane.locator("textarea.atlas-note-input").press("Enter");
    await expect.poll(kinds, { timeout: 20000 }).toEqual(["highlight", "postit", "underline"]);
    const ms = await marks(page);
    const postit = ms.find((m) => m.kind === "postit") as Mark & { on?: string; tags?: string[] };
    expect(postit.on).toBe(ms.find((m) => m.kind === "highlight")!.id);
    expect(postit.tags).toEqual(["question"]);
    // a stamp where clicked, an area dragged, the page bookmarked
    const pg = (await pane.locator('.page[data-page-number="1"]').boundingBox())!;
    await pane.getByRole("button", { name: "Stamp", exact: true }).click();
    await pane.getByRole("button", { name: "Stamp star" }).click();
    await page.mouse.click(pg.x + pg.width * 0.8, pg.y + 300);
    await pane.getByRole("button", { name: "Clip an area" }).click();
    await page.mouse.move(pg.x + pg.width * 0.1, pg.y + 320);
    await page.mouse.down();
    await page.mouse.move(pg.x + pg.width * 0.5, pg.y + 420, { steps: 5 });
    await page.mouse.up();
    await pane.getByTitle("Select (V)").click();
    await pane.getByRole("button", { name: "Bookmark this page" }).click();
    await expect.poll(kinds, { timeout: 20000 }).toEqual(["bookmark", "clip", "highlight", "postit", "stamp", "underline"]);
    await expect(pane.getByRole("button", { name: "Bookmark this page" })).toHaveAttribute("aria-pressed", "true");
    for (const k of ["underline", "highlight", "postit", "stamp", "clip", "bookmark"]) await expect(pane.locator(`.page[data-page-number="1"] svg.atlas-marks [data-kind="${k}"]`)).toHaveCount(1);
    // the Marks tab lists them by page, the post-it under its highlight; a tag filters
    await pane.getByRole("button", { name: "Marks", exact: true }).click();
    const list = pane.getByRole("navigation", { name: "Marks" });
    await expect(list.locator(".mark")).toHaveCount(6);
    await expect(list.locator(".mark.note")).toContainText("why? #question");
    await list.getByRole("button", { name: "#question", exact: true }).click();
    await expect(list.locator(".mark")).toHaveCount(1);
    await list.getByRole("button", { name: /^All/ }).click();
    await page.screenshot({ path: `test-results/pdf-marks-${eng}-light.png` });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/pdf-marks-${eng}-dark.png` });
    // the eraser takes the stamp out; the bookmark goes on B
    await pane.getByRole("button", { name: "Eraser" }).click();
    const st = (await pane.locator('.page[data-page-number="1"] svg.atlas-marks [data-kind="stamp"]').boundingBox())!; // the Marks tab moved the page
    await page.mouse.click(st.x + st.width / 2, st.y + st.height / 2);
    await expect.poll(kinds, { timeout: 20000 }).not.toContain("stamp");
    await pane.getByRole("button", { name: "Bookmark this page" }).click();
    await expect.poll(kinds, { timeout: 20000 }).toEqual(["clip", "highlight", "postit", "underline"]);
    // "Export with marks": a copy beside the PDF with the marks as annotations; the original untouched
    const before = readFileSync(join(WS, PATH));
    await pane.getByRole("button", { name: "Export with marks" }).click();
    await expect(page.getByText("doc (marked).pdf: 4 marks written in.")).toBeVisible({ timeout: 20000 });
    const copy = readFileSync(join(WS, DIR, "doc (marked).pdf"));
    expect(copy.subarray(0, before.length).equals(before)).toBe(true); // an update after the original's bytes
    for (const s of ["/Highlight", "/Underline", "/Text", "/Square", "/IRT", "/QuadPoints"]) expect(copy.toString("latin1")).toContain(s);
    expect(readFileSync(join(WS, PATH)).equals(before)).toBe(true);
    // Shift+click: the marks drawn into the pages instead (for printing), no annotations
    await pane.getByRole("button", { name: "Export with marks" }).click({ modifiers: ["Shift"] });
    await expect(page.getByText("doc (marked, flat).pdf: 4 marks written in.")).toBeVisible({ timeout: 20000 });
    const flat = readFileSync(join(WS, DIR, "doc (marked, flat).pdf")).toString("latin1");
    expect(flat).toContain("/AtlasMark0_0 Do");
    for (const s of ["/Highlight", "/QuadPoints", "/IRT"]) expect(flat).not.toContain(s);
    expect(readFileSync(join(WS, PATH)).equals(before)).toBe(true);
  });

  test("the reader's rotation turns the pages, their text with them", async ({ page }) => {
    const pane = await openReader(page);
    const pg = pane.locator('.page[data-page-number="1"]');
    const before = (await pg.boundingBox())!;
    expect(before.height).toBeGreaterThan(before.width);
    await pane.getByRole("button", { name: "Rotate" }).click();
    await expect.poll(async () => { const b = (await pg.boundingBox())!; return b.width > b.height; }).toBe(true);
    // the text layer turns with the page: its span for the first line now runs down the page
    const s = (await pg.locator(".textLayer span", { hasText: "The quantum dot model" }).boundingBox())!;
    expect(s.height).toBeGreaterThan(s.width);
  });
});
