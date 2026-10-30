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

// Runs a command through F1: typed, then Enter once the highlighted row is that command (as openFile, a row still
// filtering in can be first while this one is visible). Retried while the app does not take F1 yet after a load.
export async function runCommand(page: Page, text: string, title: string) {
  const palette = page.getByTestId("palette");
  await expect(async () => {
    if (await palette.isVisible()) await page.keyboard.press("Escape");
    await page.keyboard.press("F1");
    await expect(palette.getByRole("textbox")).toBeFocused({ timeout: 1000 });
    await page.keyboard.type(text);
    await expect(palette.locator(".item.sel")).toContainText(title, { timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await page.keyboard.press("Enter");
}
