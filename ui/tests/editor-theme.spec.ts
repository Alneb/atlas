import { test, expect } from "@playwright/test";

// CodeMirror's base theme silently beat our stylesheet (fallback font, white gutter in dark mode).
test("code editor uses the configured font and the theme's gutter colour", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("run.py");
  await expect(page.getByTestId("palette").getByText("run.py").first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-lineNumbers")).toBeVisible();
  await expect(page.locator(".cm-minimap-gutter")).toHaveCount(0); // editor.minimap default off (slow)
  const s = await page.evaluate(() => {
    const g = getComputedStyle(document.querySelector(".cm-lineNumbers")!.closest(".cm-gutters")!).backgroundColor;
    const ed = getComputedStyle(document.querySelector(".cm-editor")!).backgroundColor;
    const font = getComputedStyle(document.querySelector(".cm-scroller")!).fontFamily;
    return { g, ed, font };
  });
  expect(s.font).toContain("JetBrains Mono");
  expect(s.g).toBe(s.ed);
});
