import { test, expect } from "@playwright/test";

// the fixture leaves notes/hubbard.md modified (an uncommitted line) — see playwright.config.ts
test("the file tree marks changed files and the folders holding them", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+Shift+F");
  const notes = page.locator('.row[data-path="notes"]');
  await expect(notes.locator(".gdot")).toBeVisible();
  await notes.click();
  const hub = page.locator('.row[data-path="notes/hubbard.md"]');
  await expect(hub.locator(".glet")).toHaveText("M");
  await expect(hub).toHaveClass(/git-modified/);
  await expect(page.locator('.row[data-path="FOCUS.md"] .glet')).toHaveCount(0);
});
