import { test, expect } from "@playwright/test";

// Ctrl+Shift+V in a terminal pastes once. The terminal's own handler reads the clipboard and pastes; if the key were
// left uncancelled the engine's paste command would also run into xterm's textarea, and the text arrived twice
// (WebKitGTK, the desktop app). The check: the chord's keydown reaches the window already cancelled.
test("Ctrl+Shift+V in a terminal is cancelled after the terminal's own paste (no second, native paste)", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+`");
  const xterm = page.locator(".xterm").first();
  await expect(xterm).toBeVisible();
  await xterm.click();
  await page.evaluate(() => {
    (window as unknown as { seen: string[] }).seen = [];
    window.addEventListener("keydown", (e) => { if (e.code === "KeyV" && e.ctrlKey && e.shiftKey) (window as unknown as { seen: string[] }).seen.push(String(e.defaultPrevented)); });
  });
  await page.keyboard.press("Control+Shift+V");
  await expect.poll(() => page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(["true"]);
});
