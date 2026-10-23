import { test, expect } from "@playwright/test";

// VS Code: several terminals as tabs (the terminal group's + in the tab sidebar), renamed by
// double-clicking the tab; the name survives a reload (it lives in the pane's spec, saved with the layout).
test("terminals: + opens another, double-click renames, the name survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+`");
  await expect(page.locator(".xterm").first()).toBeVisible();
  // the + is a menu: a shell, or a Claude session (as many as wanted)
  const plus = page.getByTestId("sidebar").getByRole("button", { name: "New terminal" });
  await plus.click();
  // each entry says what it starts (the Claude one names the command of the settings)
  await expect(page.getByRole("menuitem", { name: "Claude session" })).toContainText("the claude plugin"); // the agent is a plugin's
  await expect(page.getByRole("menuitem", { name: "Shell" })).toContainText("folder");
  await page.getByRole("menuitem", { name: "Shell" }).click();
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: /Shell/ })).toHaveCount(2);
  for (const n of [1, 2]) {
    await plus.click();
    await page.getByRole("menuitem", { name: "Claude session" }).click();
    await expect(page.getByTestId("sidebar").locator(".tab", { hasText: /Claude/ })).toHaveCount(n);
  }
  await page.getByTestId("sidebar").locator(".tab", { hasText: "Shell 2" }).dblclick();
  const name = page.getByRole("textbox", { name: "Terminal name" });
  await expect(name).toBeFocused();
  await name.fill("build");
  await name.press("Enter");
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "build" })).toBeVisible();
  await page.waitForTimeout(800); // the layout save is debounced
  await page.reload();
  await expect(page.getByTestId("sidebar").locator(".tab", { hasText: "build" })).toBeVisible();
});
