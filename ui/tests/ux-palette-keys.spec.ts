import { test, expect } from "@playwright/test";

// The command bar by keyboard: it is modal, so Tab never leaves it for the page behind.
test("Tab and Shift+Tab stay inside the command bar; Esc closes it", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+e");
  const bar = page.getByTestId("palette");
  await expect(bar).toBeVisible();
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[data-testid="palette"]'));
  for (let i = 0; i < 70; i++) await page.keyboard.press("Tab"); // past the last row
  expect(await inside()).toBe(true);
  await page.getByRole("textbox", { name: /Type a command/ }).focus();
  await page.keyboard.press("Shift+Tab"); // from the first control: round to the last
  expect(await inside()).toBe(true);
  await page.keyboard.press("Escape");
  await expect(bar).toBeHidden();
});
