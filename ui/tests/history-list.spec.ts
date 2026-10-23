import { test, expect } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// "a way to see the history (a list)" (roadmap 7.3): the tabs visited, newest first; picking one goes back to it.
test("the history list shows the tabs visited and goes back to one", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = page.getByTestId("palette");
  for (const name of ["hubbard.md", "journal.md"]) {
    await page.keyboard.press("Control+p");
    await page.keyboard.type(name);
    await expect(palette.getByText(shownName(name), { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
  }
  await page.keyboard.press("F1");
  await page.keyboard.type("History: the tabs visited");
  await page.keyboard.press("Enter");
  const rows = palette.locator(".item, [role=option]");
  await expect(rows.first()).toContainText("journal");
  await expect(rows.first()).toContainText("here");
  await palette.getByText("hubbard", { exact: true }).first().click();
  await expect(page.getByTestId("sidebar").locator(".tab.active", { hasText: "hubbard" })).toBeVisible();
});
