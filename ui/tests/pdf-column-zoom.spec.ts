import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";
import { twoColumnPdf } from "./fixtures/pdf";

// A double-click on the white of a two-column page zooms to the column there (core pdf_columns.rs, which the phone's
// double tap asks too); a second one goes back to the zoom before.
const PDF = "pdfs/columns.pdf";

async function open(page: Page, theme: "light" | "dark") {
  mkdirSync(join(WS, "pdfs"), { recursive: true });
  writeFileSync(join(WS, PDF), twoColumnPdf());
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.ui.theme = theme;
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("atlas.pdf")) localStorage.removeItem(k); });
  await page.evaluate((p) => (window as unknown as { __atlas: { open(p: string): void } }).__atlas.open(p), PDF);
  const pane = page.locator(".pdf-pane").last();
  await expect(pane.locator(".textLayer span").first()).toBeAttached({ timeout: 20_000 });
  return pane;
}

/** The screen point of (x, y) PDF points from the page's top left. */
async function at(pane: ReturnType<Page["locator"]>, x: number, y: number) {
  const b = (await pane.locator(".page").first().boundingBox())!;
  return { x: b.x + (x / 612) * b.width, y: b.y + (y / 792) * b.height };
}

for (const theme of ["light", "dark"] as const) test(`a double-click zooms to the column under the pointer, again goes back (${theme})`, async ({ page }) => {
  const pane = await open(page, theme);
  const label = pane.locator(".zoom-label");
  const before = (await label.textContent())!.trim();
  const viewer = pane.locator(".viewer-container");
  // beside the short word "end." of the right column's second line: white, inside the column
  let p = await at(pane, 480, 100);
  await page.mouse.dblclick(p.x, p.y);
  await expect(label).toHaveText(/%$/);
  const scale = parseInt((await label.textContent())!, 10);
  expect(scale).toBeGreaterThan(150);
  // the right column is in the middle of the view: its left edge (320 pt) near the view's left, the left column gone
  const view = (await viewer.boundingBox())!;
  const colLeft = await at(pane, 320, 100);
  expect(colLeft.x).toBeGreaterThan(view.x - 2);
  expect(colLeft.x).toBeLessThan(view.x + 60);
  await page.screenshot({ path: test.info().outputPath(`pdf-column-zoom-${theme}.png`) });
  p = await at(pane, 480, 100);
  await page.mouse.dblclick(p.x, p.y);
  await expect(label).toHaveText(before);
});

test("at a zoomed column's end, Space goes on to the next column from its top", async ({ page }) => {
  const pane = await open(page, "light");
  const viewer = pane.locator(".viewer-container");
  // the left column, zoomed
  let p = await at(pane, 200, 100);
  await page.mouse.dblclick(p.x, p.y);
  await expect(pane.locator(".zoom-label")).toHaveText(/%$/);
  const view = (await viewer.boundingBox())!;
  expect((await at(pane, 320, 100)).x, "the right column is off to the right").toBeGreaterThan(view.x + view.width - 40);
  // read down to the column's end (the page's bottom), then on
  await viewer.evaluate((el) => { el.scrollTop = (el.querySelector(".page") as HTMLElement).offsetTop + (el.querySelector(".page") as HTMLElement).offsetHeight - el.clientHeight; });
  await viewer.focus();
  await page.keyboard.press(" ");
  await expect.poll(async () => (await at(pane, 320, 100)).x, { timeout: 5000 }).toBeLessThan(view.x + 60);
  p = await at(pane, 320, 100);
  expect(p.y, "from the column's top").toBeGreaterThan(view.y - 2);
  expect(p.y).toBeLessThan(view.y + view.height);
});
