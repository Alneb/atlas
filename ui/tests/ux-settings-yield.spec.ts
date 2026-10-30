import { test, expect } from "@playwright/test";
import { textPdf } from "./fixtures/pdf";

// A pane that keeps a key of its own (`yieldTo`: the PDF's Ctrl+=) keeps it while the focus sits on the dock's
// wrapper around it, not only on something inside it.
const H = { "x-atlas": "1" };
const DIR = "ux-yield-test", PATH = `${DIR}/y.pdf`;

test.beforeAll(async ({ request }) => {
  await request.put("/api/file", { headers: H, data: { path: PATH, text: textPdf([{ lines: ["A page to zoom"] }]) } });
});
test.afterAll(async ({ request }) => {
  await request.post(`/api/fs/trash?path=${encodeURIComponent(DIR)}`, { headers: H }).catch(() => {});
});

test("Ctrl+= on the dock wrapper around a PDF zooms the page, not the tab's text", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: PATH } } });
  const pane = page.locator(".pdf-pane").last();
  await expect(pane.locator(".pager .faint")).toHaveText("/ 1", { timeout: 20000 });
  const label = await pane.locator(".zoom-label").textContent();
  const uiScale = () => pane.evaluate((e) => getComputedStyle(e).getPropertyValue("--ui-scale"));
  const scaled = await uiScale();
  // the focus on the wrapper itself, as after a click on the tab
  await pane.evaluate((e) => { const w = e.closest<HTMLElement>(".dv-content-container")!; w.tabIndex = -1; w.focus(); });
  expect(await page.evaluate(() => document.activeElement?.classList.contains("dv-content-container"))).toBe(true);
  await page.keyboard.press("Control+=");
  await expect(pane.locator(".zoom-label")).not.toHaveText(label ?? "");
  expect(await uiScale()).toBe(scaled);
});
