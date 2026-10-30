import { expect, type Page } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// Ctrl+P until the palette shows: right after page.goto the app may not listen for the key yet.
export async function openPalette(page: Page) {
  const palette = page.getByTestId("palette");
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press("Control+p");
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass();
}

// Opens a file through the palette. Enter takes the highlighted row, so wait until that row is this file:
// while the list still filters, a sibling ("nav-one" for "nav-five") can be first though this one is visible.
export async function openFile(page: Page, name: string) {
  await openPalette(page);
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").locator(".item.sel")).toContainText(shownName(name));
  await page.keyboard.press("Enter");
}
