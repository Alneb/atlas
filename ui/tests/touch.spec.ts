import { test, expect } from "@playwright/test";

// "improve the touchscreen behavion everywhere" (2026-10-18): a long press is a right click (lib/touch.ts) — a tab's menu
// opens under the finger — and the targets grow to a finger's size on a touch screen (styles/touch.css).
test.use({ hasTouch: true });

test("a long press on a tab opens its menu, as a right click does", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("journal.md");
  await expect(page.getByTestId("palette").getByText("journal", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const row = page.getByTestId("sidebar").locator(".tab", { hasText: "journal" });
  await expect(row).toBeVisible();
  const b = (await row.boundingBox())!;
  const at = { x: b.x + 30, y: b.y + b.height / 2 };
  await row.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, clientX: at.x, clientY: at.y, button: 0 });
  await page.waitForTimeout(700);
  await expect(page.getByRole("menuitem", { name: /^Pin/ })).toBeVisible();
  await row.dispatchEvent("pointerup", { pointerType: "touch", isPrimary: true, clientX: at.x, clientY: at.y });
});
