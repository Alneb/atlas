import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// Back closes the tab it leaves, forward opens it again.
const H = { "x-atlas": "1" };
const put = (r: APIRequestContext, path: string, text: string) => r.put("/api/file", { headers: H, data: { path, text } });
async function openFile(page: Page, name: string) {
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(shownName(name), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".dv-tab.dv-active-tab")).toContainText(shownName(name));
  await expect(page.locator(".dv-active-group .cm-editor.cm-focused")).toBeVisible();
}
const back = (page: Page) => page.evaluate(() => window.dispatchEvent(new MouseEvent("mouseup", { button: 3, bubbles: true })));
const forward = (page: Page) => page.evaluate(() => window.dispatchEvent(new MouseEvent("mouseup", { button: 4, bubbles: true })));

test("back closes the tab it leaves; forward opens it again", async ({ page, request }) => {
  await put(request, "notes/back-a.md", "# a\n");
  await put(request, "notes/back-b.md", "# b\n");
  await page.goto("/");
  await openFile(page, "back-a");
  await openFile(page, "back-b");
  await back(page);
  await expect(page.locator(".dv-tab.dv-active-tab")).toContainText("back-a");
  await expect(page.locator(".dv-tab", { hasText: "back-b" })).toHaveCount(0);
  await forward(page);
  await expect(page.locator(".dv-tab.dv-active-tab")).toContainText("back-b");
  await expect(page.locator(".dv-tab", { hasText: "back-a" })).toHaveCount(1); // only back closes
});
