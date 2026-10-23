import { test, expect } from "@playwright/test";

// Claude Code's symbols (⎿ ⏺ ✻) are not in the bundled JetBrains Mono: "Atlas Term Symbols" (a subset of
// Adwaita Mono) supplies them at the same width, so they never come from a random wide fallback font.
// And a click on the terminal's padding gives it the keys, like a click on its text.
test("the terminal has a symbols font for Claude's glyphs, and its padding takes focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+`");
  const pane = page.locator(".term-pane").first();
  await expect(pane.locator(".xterm")).toBeVisible();
  const loaded = await page.evaluate(async () => {
    await document.fonts.load('13px "Atlas Term Symbols"', "⎿⏺✻");
    return document.fonts.check('13px "Atlas Term Symbols"', "⎿⏺✻");
  });
  expect(loaded).toBe(true);
  // same advance as the main font, or the glyph would push the cells after it
  const widths = await page.evaluate(() => {
    const c = document.createElement("canvas").getContext("2d")!;
    c.font = '20px "Atlas Term Symbols"'; const sym = c.measureText("⎿").width;
    c.font = '20px "JetBrains Mono"'; const mono = c.measureText("M").width;
    return { sym, mono };
  });
  expect(Math.abs(widths.sym - widths.mono)).toBeLessThan(0.5);

  await page.locator(".status").first().click(); // keys elsewhere
  await expect(pane.locator(".xterm-helper-textarea")).not.toBeFocused();
  await pane.click({ position: { x: 3, y: 3 } }); // the padding, not the text
  await expect(pane.locator(".xterm-helper-textarea")).toBeFocused();
});
