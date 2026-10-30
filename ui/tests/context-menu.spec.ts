import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// "improve the right click modals in general, more responsive": the one menu component
// (components/ContextMenu.svelte) — keys move in it, it stays inside the window, rows have icons.
test("a tab's menu: arrows and a letter move, it stays in a small window, Esc closes", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 420 });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "journal.md");
  const tab = page.getByTestId("sidebar").locator(".tab", { hasText: "journal" });
  await tab.click({ button: "right" });
  const menu = page.getByRole("menu"), focused = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.label ?? "");
  await expect(menu).toBeVisible();
  const first = await focused();
  expect(first, "the first row has the keys at once").toMatch(/Pin/);
  await expect(menu.locator('[data-label="Close"] svg')).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  expect(await focused()).not.toBe(first);
  await page.keyboard.press("End");
  expect(await focused()).toBe("Move to Trash…"); // the last row since 0ad8045 (a note's tab deletes it)
  await page.keyboard.press("ArrowDown"); // wraps
  expect(await focused()).toBe(first);
  await page.keyboard.press("r");
  expect(await focused()).toBe("Reveal in file tree");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(tab, "Esc closed the menu and nothing else").toBeVisible();

  // opened at the bottom edge, the menu flips up instead of leaving the window
  const edge = page.viewportSize()!;
  // a real MouseEvent: dispatchEvent("contextmenu", …) made a plain Event without clientX, so the menu sat at 0,0 under the
  // pointer, whose hover took the focus
  await tab.evaluate((el, at) => el.dispatchEvent(new MouseEvent("contextmenu", { clientX: at.x, clientY: at.y, bubbles: true, cancelable: true })), { x: edge.width - 5, y: edge.height - 5 });
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(edge.height);
  expect(box.x + box.width).toBeLessThanOrEqual(edge.width);
  // Enter runs the row that has the keys ("Copy path": nothing of the shared fixture changes)
  await page.keyboard.press("c");
  expect(await focused()).toBe("Copy path");
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(tab, "not pinned, not closed").toBeVisible();
});
