import { test, expect } from "@playwright/test";

// A `.tipped` button's tip (lib/tips.ts) is drawn above every panel: the left bar's tool tips used to be the button's
// own ::after, cut off at the bar's edge.
test("a side panel tool's tip shows whole, outside the left bar, and goes on a press", async ({ page }) => {
  await page.goto("/");
  const tool = page.locator(".tipped[data-tip]").first();
  await expect(tool).toBeVisible({ timeout: 20_000 });
  const text = (await tool.getAttribute("data-tip"))!;
  await tool.hover();
  const tip = page.locator(".float-tip");
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText(text);
  // inside the window, never cut: its whole text fits its box
  const box = (await tip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await tip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.mouse.down();
  await expect(tip).toBeHidden();
  await page.mouse.up();
});
