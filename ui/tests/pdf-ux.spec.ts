import { test, expect, type Page } from "@playwright/test";
import { textPdf } from "./fixtures/pdf";

// The PDF pane's toolbar and keys (panes/Pdf.svelte): the page box, the find bar, keys after the find bar closes.
const H = { "x-atlas": "1" };
const DIR = "pdf-ux-test";
const PATH = `${DIR}/ux.pdf`;
const PAGES = [["The quantum dot model", "quantum again"], ["A second page of quantum text"], ["The last page"]];

test.beforeAll(async ({ request }) => {
  await request.put("/api/file", { headers: H, data: { path: PATH, text: textPdf(PAGES.map((lines) => ({ lines }))) } });
});
// each test starts with no marks: the PDF's note, where they are kept, taken away
test.beforeEach(async ({ request }) => {
  await request.post(`/api/fs/trash?path=${encodeURIComponent(`${DIR}/ux.md`)}`, { headers: H }).catch(() => {});
});
test.afterAll(async ({ request }) => {
  await request.post(`/api/fs/trash?path=${encodeURIComponent(DIR)}`, { headers: H }).catch(() => {});
});

async function openPdf(page: Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("atlas.pdf")) localStorage.removeItem(k); });
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: PATH } } });
  const pane = page.locator(".pdf-pane").last();
  await expect(pane.locator(".pager .faint")).toHaveText("/ 3", { timeout: 20000 });
  await expect(pane.locator('.page[data-page-number="1"] .textLayer span').first()).toBeAttached({ timeout: 20000 });
  return pane;
}

test("the page box shows the page reached, not what was typed", async ({ page }) => {
  const pane = await openPdf(page);
  const box = pane.locator(".page-in");
  await box.fill("3");
  await box.press("Enter");
  await expect(box).toHaveValue("3");
  // past the end, on the last page already: no page change, the box still says 3
  await box.fill("99");
  await box.press("Enter");
  await expect(box).toHaveValue("3");
  // not a number: stays where it is
  await box.fill("abc");
  await box.press("Enter");
  await expect(box).toHaveValue("3");
  // left half-typed: the page being read comes back
  await box.fill("2x");
  await box.blur();
  await expect(box).toHaveValue("3");
});

test("Escape closes the find bar, clears its matches, and the pane's keys work again", async ({ page }) => {
  const pane = await openPdf(page);
  await pane.locator('.page[data-page-number="1"]').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+f");
  await expect(pane.locator(".findbar input")).toBeFocused();
  await page.keyboard.type("quantum");
  await expect(pane.locator(".findLayer > div").first()).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(pane.locator(".findbar")).toHaveCount(0);
  await expect(pane.locator(".findLayer > div")).toHaveCount(0);
  await page.keyboard.press("d");
  await expect(pane.locator(".viewer-container")).toHaveClass(/dark/);
});

test("the find button closes the bar and its matches with it", async ({ page }) => {
  const pane = await openPdf(page);
  const btn = pane.getByRole("button", { name: "Find" });
  await btn.click();
  await pane.locator(".findbar input").fill("quantum");
  await expect(pane.locator(".findLayer > div").first()).toBeAttached();
  await btn.click();
  await expect(pane.locator(".findbar")).toHaveCount(0);
  await expect(pane.locator(".findLayer > div")).toHaveCount(0);
});

test("Escape on the page closes an open find bar", async ({ page }) => {
  const pane = await openPdf(page);
  await pane.locator('.page[data-page-number="1"]').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+f");
  await page.keyboard.type("quantum");
  await pane.locator('.page[data-page-number="1"]').click({ position: { x: 5, y: 5 } });
  await expect(pane.locator(".findbar input")).not.toBeFocused();
  await expect(pane.locator(".findLayer > div").first()).toBeAttached();
  // the click on the page took the keys from the find box: D is the pane's, not the query's
  await page.keyboard.press("d");
  await expect(pane.locator(".viewer-container")).toHaveClass(/dark/);
  await expect(pane.locator(".findbar input")).toHaveValue("quantum");
  await page.keyboard.press("Escape");
  await expect(pane.locator(".findbar")).toHaveCount(0);
  await expect(pane.locator(".findLayer > div")).toHaveCount(0);
});

test("the picked mark's bar follows its mark when the page is zoomed", async ({ page }) => {
  const id = "m-uxzoom01";
  await page.request.post(`/api/pdf-marks?pdf=${encodeURIComponent(PATH)}`, { headers: H, data: [{ op: "put", mark: { id, page: 1, version: 1, color: "#FFE066", kind: "highlight", quads: [[72, 696, 250, 716]] } }] });
  const pane = await openPdf(page);
  const hl = pane.locator(`.page[data-page-number="1"] svg.atlas-marks [data-mark="${id}"]`);
  await expect(hl).toBeAttached({ timeout: 20000 });
  const c = (await hl.boundingBox())!;
  await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
  const bar = pane.getByTestId("pdf-mark-bar");
  await expect(bar).toBeVisible();
  // the gap between the mark's bottom and the bar's top stays the same however the page is scaled
  const gap = async () => (await bar.boundingBox())!.y - ((await hl.boundingBox())!.y + (await hl.boundingBox())!.height);
  const before = await gap();
  await pane.getByRole("button", { name: "Zoom in" }).click();
  await pane.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(gap).toBeCloseTo(before, 0);
});

test("a click on a page gives it the keys: PageDown scrolls it, Ctrl+= zooms it", async ({ page }) => {
  const pane = await openPdf(page);
  const view = pane.locator(".viewer-container");
  await pane.locator('.page[data-page-number="1"]').click({ position: { x: 5, y: 5 } });
  const top = await view.evaluate((e) => e.scrollTop);
  await page.keyboard.press("PageDown");
  await expect.poll(() => view.evaluate((e) => e.scrollTop)).toBeGreaterThan(top + 100);
  // the page zoomed, not the tab's text
  const uiScale = () => page.evaluate(() => getComputedStyle(document.querySelector(".pdf-pane")!).getPropertyValue("--ui-scale"));
  const scaled = await uiScale();
  await page.keyboard.press("Control+=");
  await expect(pane.locator(".zoom-label")).toHaveText(/%$/);
  expect(await uiScale()).toBe(scaled);
  // a press with a tool that takes the press (the pen) gives the keys too
  await pane.getByRole("button", { name: "Pen / stylus (P)" }).click();
  await pane.locator('.page[data-page-number="1"]').click({ position: { x: 300, y: 300 } });
  await page.keyboard.press("v");
  await expect(pane.locator(".tool.on")).toHaveAttribute("title", "Select (V)");
});

test("two pages side by side: the page box names the left one", async ({ page }) => {
  const pane = await openPdf(page);
  await pane.getByRole("button", { name: "Two pages" }).click();
  await expect(pane.locator(".spreadRow")).toHaveCount(2);
  await expect(pane.locator(".page-in")).toHaveValue("1");
  await pane.locator(".page-in").fill("3");
  await pane.locator(".page-in").press("Enter");
  await expect(pane.locator(".page-in")).toHaveValue("3");
});

test("a slow pinch (small Ctrl+wheel steps) zooms the page, a step at a time", async ({ page }) => {
  const pane = await openPdf(page);
  const label = pane.locator(".zoom-label");
  const view = pane.locator(".viewer-container");
  const box = (await view.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  const scale = () => pane.locator(".pdfViewer").evaluate((e) => Number(getComputedStyle(e).getPropertyValue("--s")));
  const before = await scale();
  await page.keyboard.down("Control");
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, -1); await page.waitForTimeout(10); }
  await page.keyboard.up("Control");
  await expect(label).toHaveText(/%$/);
  await expect.poll(scale).toBeGreaterThan(before * 1.05);
});

test("a PDF just opened takes the keys: PageDown scrolls it with no click first", async ({ page }) => {
  const pane = await openPdf(page);
  const view = pane.locator(".viewer-container");
  await expect(view).toBeFocused();
  const top = await view.evaluate((e) => e.scrollTop);
  await page.keyboard.press("PageDown");
  await expect.poll(() => view.evaluate((e) => e.scrollTop)).toBeGreaterThan(top + 100);
  // a click in its own page box keeps the focus there
  await pane.locator(".page-in").click();
  await page.waitForTimeout(100);
  await expect(pane.locator(".page-in")).toBeFocused();
});

test("find says when nothing matches, once every page is searched", async ({ page }) => {
  const pane = await openPdf(page);
  await page.keyboard.press("Control+f");
  const info = pane.locator(".findbar .faint");
  await page.keyboard.type("nowhere");
  await expect(info).toHaveText("No match");
  await pane.getByRole("textbox", { name: "Find in document" }).fill("quantum");
  await expect(info).toHaveText("1/3");
});

test("the Marks list: a click picks its mark and points it out; a filter whose last mark is gone falls back to All", async ({ page }) => {
  const hl = "m-uxlist01", st = "m-uxlist02";
  await page.request.post(`/api/pdf-marks?pdf=${encodeURIComponent(PATH)}`, { headers: H, data: [
    { op: "put", mark: { id: hl, page: 2, version: 1, color: "#FFE066", kind: "highlight", quads: [[72, 696, 250, 716]] } },
    { op: "put", mark: { id: st, page: 1, version: 1, color: "#FF6B6B", kind: "stamp", stamp: "check", at: [300, 500] } },
  ] });
  const pane = await openPdf(page);
  await pane.locator(".toolbar").getByRole("button", { name: "Marks", exact: true }).click();
  const list = pane.getByRole("navigation", { name: "Marks" });
  await list.locator('.mark[data-kind="highlight"]').click();
  const drawn = pane.locator(`svg.atlas-marks [data-mark="${hl}"]`);
  await expect(drawn).toHaveClass(/atlas-flash-mark/);
  await expect(drawn).toBeInViewport();
  await expect(pane.getByTestId("pdf-mark-bar")).toContainText("Highlight");
  // filtered to the stamps, then the only stamp deleted: the list shows every mark again
  await list.getByRole("button", { name: "Stamps" }).click();
  await expect(list.locator(".mark")).toHaveCount(1);
  await page.request.post(`/api/pdf-marks?pdf=${encodeURIComponent(PATH)}`, { headers: H, data: [{ op: "remove", id: st }] });
  await expect(list.getByRole("button", { name: "Stamps" })).toHaveCount(0, { timeout: 20000 });
  await expect(list.locator(".mark").first()).toBeVisible();
  await expect(list.getByRole("button", { name: /^All/ })).toHaveClass(/on/);
});

for (const theme of ["light", "dark"] as const) test(`the find bar and its matches in the ${theme} theme`, async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.ui.theme = theme;
    await route.fulfill({ response: res, json: body });
  });
  const pane = await openPdf(page);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
  await page.keyboard.press("Control+f");
  await page.keyboard.type("quantum");
  await expect(pane.locator(".findbar .faint")).toHaveText("1/3");
  // the matches' colours come from the theme's tokens, not fixed values
  const bg = await pane.locator(".findLayer > div").first().evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: `test-results/pdf-find-${theme}.png` });
});
