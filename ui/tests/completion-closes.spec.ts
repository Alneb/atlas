import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// A completion list goes as soon as nothing can complete at the caret: not when typing pauses, not when the core answers.
const H = { "x-atlas": "1" };

test("a note's list closes at the key that ends the word, however slow the core and however fast the typing", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/closes.md", text: "# Closes\n\nprose\n" } });
  await page.goto("/");
  await openFile(page, "closes.md");
  await page.locator(".cm-content").getByText("prose").click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("i");

  const list = page.locator(".cm-tooltip-autocomplete");
  await page.keyboard.type("Go [[clo");
  await expect(list).toBeVisible();
  // the core now takes far longer than the assertion below allows
  await page.route("**/api/link-targets*", async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.continue(); });
  await page.keyboard.type("s");
  await page.keyboard.type("]] and more prose", { delay: 20 }); // faster than the debounce: it never runs out
  await expect(list).toHaveCount(0, { timeout: 500 });
  await page.unroute("**/api/link-targets*");

  await page.keyboard.type(" $\\ga");
  await expect(list).toBeVisible();
  await page.keyboard.type(" + x", { delay: 20 });
  await expect(list).toHaveCount(0, { timeout: 500 });
});

test("a capture box's list closes at the key that ends the word, before the core is asked", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const palette = page.getByTestId("palette");
  await page.keyboard.press("Meta+e");
  await page.keyboard.type("+");
  await expect(palette.locator(".mode-tag")).toHaveText("Capture");
  await page.keyboard.type("buy @tom");
  const list = palette.locator(".ta-complete");
  await expect(list).toBeVisible();
  await page.route("**/api/**", async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.continue(); });
  await page.keyboard.type(" milk", { delay: 20 });
  await expect(list).toBeHidden({ timeout: 500 });
});
