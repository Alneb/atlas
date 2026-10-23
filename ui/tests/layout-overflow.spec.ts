import { test, expect } from "@playwright/test";

// The shell never scrolls; panes scroll inside (lib/diagnostics.ts writes "layout overflow" to
// .atlas/cache/ui.log when it does). Found there: a terminal tab restored but not yet shown had no
// position, sat under the dock and made the dock twice as tall as its box.
const SHELL = ".main, .dock-wrap, .dock, .dv-dockview, .dv-grid-view, .dv-view";
const overflowing = (page: import("@playwright/test").Page) => page.evaluate((sel) =>
  [document.documentElement, document.body, ...Array.from(document.querySelectorAll<HTMLElement>(sel))]
    .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}`), SHELL);

test("a restored terminal tab that is not shown does not make the dock taller than its box", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+`");
  await expect(page.locator(".xterm").first()).toBeVisible();
  const plus = page.getByTestId("sidebar").getByRole("button", { name: "New terminal" });
  await plus.click();
  await page.getByRole("menuitem", { name: "Shell" }).click();
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: /Shell/ })).toHaveCount(2);
  expect(await overflowing(page), "with both terminals open").toEqual([]);
  await page.waitForTimeout(800); // the layout save is debounced
  await page.reload();
  await expect(page.locator(".xterm:visible").first()).toBeVisible();
  await expect(page.locator(".dv-render-overlay")).toHaveCount(2); // one shown, one kept alive unseen
  expect(await overflowing(page), "after the reload").toEqual([]);
});
