import { test, expect, type Page } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// Okular/Zotero-parity checks on a real paper (the 113-page Georges et al. RMP), copied read-only
// from a papers library: `ATLAS_TEST_PAPERS`. Without it these tests are
// skipped (they need real, large PDFs that are not in the repository), and say so.
const PAPERS = process.env.ATLAS_TEST_PAPERS ?? "";
const PHD_PAPER = join(PAPERS, "georges1996dynamical");
const PDF = "pdfs/polish.pdf";
// the Georges scan has no link annotations; this thesis has ~1000 (references, equations, figures)
const LINKED = join(PAPERS, "najeraocampostudy");
const LINKED_PDF = "pdfs/linked.pdf";
const H = { "x-atlas": "1" };
test.skip(!existsSync(PHD_PAPER) || !existsSync(LINKED), `needs the papers georges1996dynamical and najeraocampostudy in ${PAPERS} (set ATLAS_TEST_PAPERS)`);

test.beforeAll(() => {
  mkdirSync(join(WS, "pdfs"), { recursive: true });
  copyFileSync(join(PHD_PAPER, readdirSync(PHD_PAPER).find((f) => f.endsWith(".pdf"))!), join(WS, PDF));
  copyFileSync(join(LINKED, readdirSync(LINKED).find((f) => f.endsWith(".pdf"))!), join(WS, LINKED_PDF));
});

async function openPdf(page: Page, path = PDF) {
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path } } });
  const pane = page.locator(".pdf-pane").last();
  await expect(pane.locator(".pdfViewer .page canvas").first()).toBeVisible({ timeout: 20000 });
  if (path === PDF) await expect(pane.locator(".pager .faint")).toHaveText("/ 113");
  return pane;
}
const pageNo = (pane: ReturnType<Page["locator"]>) => pane.locator(".page-in").inputValue();

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("atlas.pdf")) localStorage.removeItem(k); });
  // the tabs earlier specs left (the layout outlives a test's browser) closed: a PDF tab of theirs, coming back on a
  // reload, would save its own place over this one's
  await page.evaluate(() => { const a = (window as unknown as { __atlas: { panes(): { id: string }[]; close(id: string): void } }).__atlas; for (const p of a.panes()) a.close(p.id); });
});

test("page thumbnails: lazy, click jumps, the current page is marked", async ({ page }) => {
  const pane = await openPdf(page);
  await pane.getByRole("button", { name: "Pages", exact: true }).click();
  const thumbs = pane.locator(".thumbs .thumb");
  await expect(thumbs).toHaveCount(113);
  await thumbs.nth(6).click();
  await expect.poll(() => pageNo(pane)).toBe("7");
  await expect(pane.locator(".thumb.on")).toHaveAttribute("data-page", "7");
  // lazy: the first pages are drawn, the far ones not yet
  await expect(thumbs.nth(0).locator("canvas[data-rendered]")).toHaveCount(1);
  await expect(thumbs.nth(110).locator("canvas[data-rendered]")).toHaveCount(0);
});

test("reopening a PDF returns to the page that was being read", async ({ page }) => {
  let pane = await openPdf(page);
  await pane.locator(".page-in").fill("42");
  await pane.locator(".page-in").press("Enter");
  await expect.poll(() => pageNo(pane)).toBe("42");
  await page.waitForTimeout(700); // the position is saved 400 ms after the last move
  await page.reload();
  await page.getByText("Finish the GW notes.").waitFor();
  pane = await openPdf(page);
  await expect.poll(() => pageNo(pane), { timeout: 8000 }).toBe("42");
});

test("zoom keys act on the page, not the app; Ctrl+0 fits the width", async ({ page }) => {
  const pane = await openPdf(page);
  await pane.locator(".viewer-container").click({ position: { x: 30, y: 30 } });
  const uiScale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"));
  await page.keyboard.press("Control+=");
  await expect(pane.locator(".zoom-label")).not.toHaveText("Fit");
  await page.keyboard.press("Control+-");
  await page.keyboard.press("Control+0");
  await expect(pane.locator(".zoom-label")).toHaveText("Fit");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"))).toBe(uiScale);
});

test("dark pages toggle (D) and stay on for the next PDF", async ({ page }) => {
  const pane = await openPdf(page);
  await pane.locator(".viewer-container").click({ position: { x: 30, y: 30 } });
  await page.keyboard.press("d");
  await expect(pane.locator(".viewer-container.dark")).toHaveCount(1);
  const filter = await pane.locator(".pdfViewer .page .canvasWrapper").first().evaluate((e) => getComputedStyle(e).filter);
  expect(filter).toContain("invert");
  expect(await page.evaluate(() => localStorage.getItem("atlas.pdf.dark"))).toBe("1");
});

// PDFium misses a named destination that sits under a name tree whose root has both /Names and /Kids, as this thesis's
// does (1 of 74 papers): its links resolve nowhere. Internal links are checked on a generated PDF in pdf-reader.spec.ts;
// docs/refactor/REFACTOR-pdfium-reader.md "drawbacks".
test.fixme("internal links (references, equations) jump inside the paper", async ({ page }) => {
  const pane = await openPdf(page, LINKED_PDF);
  // page 20 of the thesis carries 20 link annotations (mutool show … pages/20/Annots)
  await pane.locator(".page-in").fill("20"); await pane.locator(".page-in").press("Enter");
  const link = pane.locator('.page[data-page-number="20"] .linkLayer > a[href="#"]').first();
  await expect(link).toBeAttached({ timeout: 10000 });
  const before = await pageNo(pane);
  await link.click();
  await expect.poll(() => pageNo(pane)).not.toBe(before);
});

test("a pen stroke is saved into the PDF's note as it is made, and Ctrl+Z takes it back", async ({ page }) => {
  const pane = await openPdf(page);
  const pg = pane.locator(".pdfViewer .page").first();
  const box = (await pg.boundingBox())!;
  const y0 = Math.max(box.y, 80) + 40; // the page is taller than the viewport: draw in its visible top
  const stroke = async (dy: number) => {
    await page.mouse.move(box.x + box.width * 0.3, y0 + dy); await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width * (0.3 + i * 0.02), y0 + dy + (i % 2) * 8);
    await page.mouse.up();
  };
  // the saved ink is drawn from the note's marks over the page (lib/pdf-marks.ts)
  const ink = pane.locator('.page[data-page-number="1"] svg.atlas-marks [data-kind="ink"]');
  await pane.getByTitle("Pen / stylus (P)").click();
  await stroke(0);
  await pane.getByTitle("Select (V)").click(); // leaving the pen saves what it holds
  await expect(ink).toHaveCount(1, { timeout: 20000 });
  await page.keyboard.press("Control+z");
  await expect(pane.locator(".status")).toContainText("Mark taken back");
  await expect(ink).toHaveCount(0, { timeout: 20000 });
});

test("the reader's styles stay inside the viewer: the collapsed left bar keeps its width", async ({ page }) => {
  const pane = await openPdf(page);
  // the reader's own text layer
  await expect(pane.locator(".textLayer").first()).toHaveCSS("position", "absolute");
  // a global `.sidebar { min-width: 180px }` (pdf.js's, once) widened the collapsed bar
  const bar = page.getByTestId("sidebar");
  if ((await bar.getAttribute("class"))?.includes("wide")) await page.getByTestId("sidebar-toggle").click();
  await page.mouse.move(900, 400);
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeLessThan(60);
  await page.getByTestId("sidebar-toggle").click();
});
