import { test, expect, type Page } from "@playwright/test";
import { writePdf } from "./fixtures/pdf";

// The PDF pane's page thumbnails (components/PdfThumbs.svelte): each slot sized from its page's size before it is
// drawn (no reflow as they come in), turned with the reader's rotation, and a long strip scrolled smoothly.
const H = { "x-atlas": "1" };
const DIR = "pdf-thumbs-test";
const PATH = `${DIR}/long.pdf`;
const PAGES = 200;
/** Every tenth page is landscape (792 × 612), the others portrait (612 × 792). */
const landscape = (n: number) => n % 10 === 0;

function longPdf(): string {
  const page = (i: number) => 4 + i * 2;
  const objs = ["<</Type/Catalog/Pages 2 0 R>>", `<</Type/Pages/Kids[${Array.from({ length: PAGES }, (_, i) => `${page(i)} 0 R`).join(" ")}]/Count ${PAGES}>>`, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>"];
  for (let i = 0; i < PAGES; i++) {
    const body = `BT /F1 48 Tf 72 400 Td (Page ${i + 1}) Tj ET`, box = landscape(i + 1) ? "0 0 792 612" : "0 0 612 792";
    objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[${box}]/Resources<</Font<</F1 3 0 R>>>>/Contents ${page(i) + 1} 0 R>>`, `<</Length ${body.length}>>\nstream\n${body}\nendstream`);
  }
  return writePdf(objs);
}

test.beforeAll(async ({ request }) => {
  await request.put("/api/file", { headers: H, data: { path: PATH, text: longPdf() } });
});
test.afterAll(async ({ request }) => {
  await request.post(`/api/fs/trash?path=${encodeURIComponent(DIR)}`, { headers: H }).catch(() => {});
});

async function openThumbs(page: Page, theme?: "light" | "dark") {
  if (theme) await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.ui.theme = theme;
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("atlas.pdf")) localStorage.removeItem(k); });
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: PATH } } });
  const pane = page.locator(".pdf-pane").last();
  await expect(pane.locator(".pager .faint")).toHaveText(`/ ${PAGES}`, { timeout: 20000 });
  await pane.getByRole("button", { name: "Pages", exact: true }).click();
  return pane;
}
/** Height over width of page n's slot, and of what is drawn in it. */
async function ratios(pane: ReturnType<Page["locator"]>, n: number) {
  const slot = (await pane.locator(`.thumb[data-page="${n}"] .slot`).boundingBox())!;
  const drawn = (await pane.locator(`.thumb[data-page="${n}"] canvas`).boundingBox())!;
  return { slot: slot.height / slot.width, drawn: drawn.height / drawn.width, fits: Math.abs(drawn.width - slot.width) < 2 && Math.abs(drawn.height - slot.height) < 2 };
}

test("each slot has its page's shape before it is drawn, and turns with the pages", async ({ page }) => {
  const pane = await openThumbs(page);
  // far down the strip, not drawn yet: already shaped
  const far = pane.locator('.thumb[data-page="190"]');
  await expect(far.locator("canvas[data-rendered]")).toHaveCount(0);
  expect((await ratios(pane, 190)).slot).toBeCloseTo(612 / 792, 2);
  expect((await ratios(pane, 191)).slot).toBeCloseTo(792 / 612, 2);
  await expect(pane.locator('.thumb[data-page="1"] canvas[data-rendered]')).toHaveCount(1);
  let r = await ratios(pane, 1);
  expect(r.slot).toBeCloseTo(792 / 612, 2);
  expect(r.fits).toBe(true);
  await pane.getByRole("button", { name: "Rotate" }).click();
  r = await ratios(pane, 1);
  expect(r.slot).toBeCloseTo(612 / 792, 2);
  expect(r.drawn).toBeCloseTo(612 / 792, 2);
  expect(r.fits).toBe(true);
  // a landscape page turned stands up
  r = await ratios(pane, 10);
  expect(r.slot).toBeCloseTo(792 / 612, 2);
});

test("a long strip scrolls smoothly", async ({ page }) => {
  const pane = await openThumbs(page);
  const strip = pane.locator(".thumbs");
  // a scroll a frame through the whole strip; the frames' spacing measured
  const frames = await strip.evaluate(async (el) => {
    const gaps: number[] = [];
    let last = performance.now();
    while (el.scrollTop + el.clientHeight < el.scrollHeight - 1) {
      el.scrollTop += 120;
      await new Promise(requestAnimationFrame);
      const now = performance.now(); gaps.push(now - last); last = now;
    }
    gaps.sort((a, b) => a - b);
    return { n: gaps.length, p95: gaps[Math.floor(gaps.length * 0.95)], max: gaps[gaps.length - 1] };
  });
  console.log(`thumb strip: ${frames.n} frames, p95 ${frames.p95.toFixed(1)} ms, max ${frames.max.toFixed(1)} ms`);
  expect(frames.n).toBeGreaterThan(100);
  expect(frames.p95).toBeLessThan(50);
});

for (const theme of ["light", "dark"] as const) test(`turned thumbnails in the ${theme} theme; the ones just past the strip's end drawn ahead`, async ({ page }) => {
  const pane = await openThumbs(page, theme);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
  await pane.getByRole("button", { name: "Rotate" }).click();
  await pane.locator(".page-in").fill("9");
  await pane.locator(".page-in").press("Enter");
  // page 10 sits just below the strip's end: drawn ahead, within the lazy margin, with no scroll of the strip
  await expect(pane.locator('.thumb[data-page="10"] canvas[data-rendered]')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath(`pdf-thumbs-${theme}.png`) });
});
