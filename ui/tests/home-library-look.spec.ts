import { test, expect } from "@playwright/test";

// Home and the Library read cleanly and keep the keyboard's place.

test("Home's activity names a file and its folder with a spaced separator", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const activity = page.locator(".card", { has: page.getByRole("heading", { name: /^Activity/ }) });
  const row = activity.locator(".changed-row", { has: page.locator(".n") }).first();
  await expect(row).toBeVisible();
  await expect(row.locator(".path")).toHaveText(/\S · \S/);
});

test("the Library says a paper's type in words, and the focus follows the arrow keys", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+L");
  const lib = page.locator(".library");
  await expect(lib.locator(".row")).toHaveCount(2);
  await lib.locator(".row").first().click();
  await expect(lib.locator(".detail .kind")).toHaveText(/^journal article · \d{4}$/);
  await lib.locator(".row").first().focus(); // as a Tab reaches it
  await page.keyboard.press("ArrowDown");
  await expect(lib.locator(".row").nth(1)).toHaveClass(/sel/);
  await expect(lib.locator(".row").nth(1)).toBeFocused();
});
