import { test, expect } from "@playwright/test";
import { runCommand } from "./open";

// With nothing typed, the command bar lists the commands run lately first (the usage journal, so they survive a
// reload), and never offers itself.
test("the commands run lately lead the empty command bar, after a reload too; the bar never lists itself", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await runCommand(page, "Outline of the current", "Outline of the current note");
  const bar = page.getByTestId("palette");
  const firstCommand = async () => {
    await page.keyboard.press("F1");
    await expect(bar.locator(".section", { hasText: "Recent commands" })).toBeVisible();
    // the first row after the "Recent commands" heading
    return bar.locator(".section:text-is('Recent commands') + .item .title");
  };
  await expect(await firstCommand()).toHaveText("Outline of the current note");
  await expect(bar.getByTestId("palette-item").filter({ has: page.locator(".title:text-is('Command palette')") })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByText("Finish the GW notes.").waitFor();
  await expect(await firstCommand()).toHaveText("Outline of the current note");
});
