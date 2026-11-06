import { test, expect } from "@playwright/test";

// Settings → Desktop app's "Capture key" (CaptureKeyPanel.svelte, platform/capture_key.rs): it reads the desktop's
// key and says where it lives. Nothing is set here: setting writes the desktop's own shortcut settings.
test("the Desktop app page shows the capture key and where it lives", async ({ page }) => {
  await page.goto("/");
  await expect(async () => {
    if (await page.getByTestId("palette").isVisible()) await page.keyboard.press("Escape");
    await page.keyboard.press("F1");
    await page.keyboard.type("Settings");
    await page.getByTestId("palette").getByText("Settings", { exact: true }).first().click({ timeout: 1000 });
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await page.getByText("Desktop app", { exact: true }).first().click();
  const panel = page.locator(".settings-panel.capture-key");
  await expect(panel.getByRole("heading", { name: "Capture key" })).toBeVisible();
  await expect(panel.locator(".row .label")).toHaveText("Now");
  await expect(panel.locator("p.desc").nth(1)).not.toBeEmpty(); // the desktop's own note
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await panel.screenshot({ path: `../target/snip/capture-key-${theme}.png` });
  }
});
