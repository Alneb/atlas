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

test("internal links (references, equations) jump inside the paper", async ({ page }) => {
  const pane = await openPdf(page, LINKED_PDF);
  // page 20 of the thesis carries 20 link annotations (mutool show … pages/20/Annots)
  await pane.locator(".page-in").fill("20"); await pane.locator(".page-in").press("Enter");
  const link = pane.locator('.page[data-page-number="20"] .annotationLayer .linkAnnotation > a[href^="#"]').first();
  await expect(link).toBeAttached({ timeout: 10000 });
  const before = await pageNo(pane);
  await link.click();
  await expect.poll(() => pageNo(pane)).not.toBe(before);
});

test("an ink stroke can be undone (Ctrl+Z) and a selected annotation deleted (Delete)", async ({ page }) => {
  const pane = await openPdf(page);
  const pg = pane.locator(".pdfViewer .page").first();
  const box = (await pg.boundingBox())!;
  const y0 = Math.max(box.y, 80) + 40; // the page is taller than the viewport: draw in its visible top
  const stroke = async (dy: number) => {
    await page.mouse.move(box.x + box.width * 0.3, y0 + dy); await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width * (0.3 + i * 0.02), y0 + dy + (i % 2) * 8);
    await page.mouse.up();
  };
  const ink = pane.locator(".inkEditor");
  await pane.getByTitle("Pen / stylus (P)").click();
  await stroke(0);
  await pane.getByTitle("Select (V)").click(); // commits the stroke into an editor
  await expect(ink).toHaveCount(1);
  await expect(pane.locator(".title .dot")).toHaveCount(1); // dirty
  await page.keyboard.press("Control+z");
  await expect(ink).toHaveCount(0);
  await pane.getByTitle("Pen / stylus (P)").click();
  await stroke(60);
  await pane.getByTitle("Select (V)").click();
  await expect(ink).toHaveCount(1);
  await pane.getByTitle("Pen / stylus (P)").click(); // editors are selectable in their own mode
  await ink.first().click();
  await page.keyboard.press("Delete");
  await expect(ink).toHaveCount(0);
});

test("pdf.js's stylesheet stays inside the viewer: the collapsed left bar keeps its width", async ({ page }) => {
  const pane = await openPdf(page);
  // still styled by pdf.js inside the viewer
  await expect(pane.locator(".textLayer").first()).toHaveCSS("position", "absolute");
  // its global `.sidebar { min-width: 180px }` widened the collapsed bar (2026-10-14)
  const bar = page.getByTestId("sidebar");
  if ((await bar.getAttribute("class"))?.includes("wide")) await page.getByTestId("sidebar-toggle").click();
  await page.mouse.move(900, 400);
  await expect.poll(async () => (await bar.boundingBox())!.width).toBeLessThan(60);
  await page.getByTestId("sidebar-toggle").click();
});
