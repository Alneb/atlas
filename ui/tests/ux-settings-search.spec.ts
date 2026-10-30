import { test, expect, type Page } from "@playwright/test";

// The settings search, by keyboard and on a phone.
async function openSettings(page: Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+,");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 400, height: 760 }, hasTouch: true });
  test("the search box stays on screen above its results while typing", async ({ page }) => {
    await openSettings(page);
    const box = page.getByPlaceholder("Search settings…");
    await box.fill("accent");
    await expect(page.locator('.row[data-path="ui.accent"]')).toBeVisible();
    await expect(box).toBeVisible();
    await expect(box).toBeFocused();
    // the list of areas makes room for the results, and comes back once the box is emptied
    await expect(page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "Appearance" })).toBeHidden();
    await box.fill("");
    await expect(page.getByRole("navigation", { name: "Settings pages" }).getByRole("button", { name: "Appearance" })).toBeVisible();
  });
});

test("Esc empties the search box, ↓ goes to the first option found; the count reads as one option", async ({ page }) => {
  await openSettings(page);
  const box = page.getByPlaceholder("Search settings…");
  await box.fill("accent");
  await expect(page.getByText("1 option matches “accent”")).toBeVisible();
  await box.press("ArrowDown");
  await expect(page.locator('.row[data-path="ui.accent"]').locator(":focus")).toHaveCount(1);
  await box.focus();
  await box.press("Escape");
  await expect(box).toHaveValue("");
  await expect(box).toBeFocused();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible(); // Esc on the empty search, not the pane
});
