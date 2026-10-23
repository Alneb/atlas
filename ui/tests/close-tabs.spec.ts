import { test, expect } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// The user, 2026-10-15: "make close all other tabs of this group only apply to normal tabs, not terminal ones, and add
// an option to close all tabs (not including terminal), if no tab is open home should open automatically" — and
// "make super + f also do fullscreen".
test("Close all tabs keeps the terminals, and Home comes back when nothing is open", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const sidebar = page.getByTestId("sidebar");
  for (const f of ["journal.md", "notes/hubbard.md"]) {
    await page.keyboard.press("Control+p");
    await page.keyboard.type(f);
    await expect(page.getByTestId("palette").getByText(shownName(f)).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".cm-editor:visible").first()).toBeVisible();
  }
  await page.keyboard.press("Control+`");
  await expect(page.locator(".xterm").first()).toBeVisible();
  await expect(sidebar.locator(".tab", { hasText: "journal" })).toBeVisible();

  // from the tab's menu
  await sidebar.locator(".tab", { hasText: "journal" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close all tabs" }).click();
  await expect(sidebar.locator(".tab", { hasText: "journal" })).toHaveCount(0);
  await expect(sidebar.locator(".tab", { hasText: "hubbard" })).toHaveCount(0);
  await expect(sidebar.locator(".tab", { hasText: /Shell/ })).toHaveCount(1); // the terminal stays
  // nothing left to read: Home is opened by itself
  await expect(page.getByText("Finish the GW notes.")).toBeVisible();

  // Super+F: fullscreen (F11 still too)
  await page.locator(".cm-editor, .today, [data-testid=page]").first().click({ trial: true }).catch(() => {});
  await page.keyboard.press("Meta+f");
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(64);
  await page.keyboard.press("F11");
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(64);
});
