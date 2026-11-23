import { test, expect } from "@playwright/test";

// The terminal zooms like any tab: Ctrl+wheel (xterm marks the wheel handled — the app's zoom never saw it), and
// Ctrl++ by the character (a Spanish keyboard's + is another key than a US one's). A terminal tab closed forgets its
// zoom: the next tab in its slot is another session (a new Claude tab opened small).
const fontPx = (page: import("@playwright/test").Page) =>
  page.locator(".term-pane .xterm-rows").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

test("a terminal zooms by Ctrl+wheel and Ctrl++, and a new tab in its slot starts at 100 %", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+`");
  const pane = page.locator(".term-pane").first();
  await expect(pane.locator(".xterm-screen")).toBeVisible();
  const base = await fontPx(page);
  await pane.locator(".xterm-screen").hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -360); // three notches up
  await page.keyboard.up("Control");
  await expect.poll(() => fontPx(page)).toBeGreaterThan(base);
  const wheeled = await fontPx(page);
  // the + of a Spanish keyboard: key "+", code BracketRight
  await pane.locator(".xterm-screen").click();
  await pane.locator("textarea").first().dispatchEvent("keydown", { key: "+", code: "BracketRight", ctrlKey: true, bubbles: true });
  await expect.poll(() => fontPx(page)).toBeGreaterThan(wheeled);
  await expect(page.locator('[data-cell="zoom"]')).toBeVisible();

  // closed, and a new terminal (the same slot): the settings' size again
  await page.keyboard.press("Meta+q");
  await expect(page.locator(".term-pane .xterm-screen")).toHaveCount(0);
  await page.keyboard.press("Control+`");
  await expect(page.locator(".term-pane .xterm-screen").first()).toBeVisible();
  await expect.poll(() => fontPx(page)).toBe(base);
});
