import { test, expect } from "@playwright/test";

// Found on the real vault (2026-10-14): with the home page pinned, the bookmarks file was rewritten
// many times a second with the same text — a pinned tab's title differed from the pin's, the tab
// list "corrected" it, the save republished the pins, and round again. A pin that says nothing new
// is not written.
test("a pinned tab does not make the bookmarks file be rewritten over and over", async ({ page }) => {
  let writes = 0;
  page.on("request", (r) => { if (r.method() === "PUT" && r.url().includes("/api/file") && (r.postData() ?? "").includes("bookmarks.yaml")) writes++; });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  // (Home is an app now, not a tab: a note is pinned instead)
  await page.keyboard.press("Control+p");
  await page.keyboard.type("journal.md");
  await expect(page.getByTestId("palette").getByText("journal", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("sidebar").locator(".tab.active", { hasText: "journal" })).toBeVisible();
  await page.keyboard.press("Control+Alt+p"); // pin it
  const pin = page.getByTestId("pins").locator(".pin");
  await expect(pin).toHaveCount(1);
  await page.waitForTimeout(600);
  const after = writes;
  expect(after, "the pin itself is one write").toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1500);
  expect(writes - after, "and then the file is left alone").toBe(0);
  // leave the shared fixture as it was
  await pin.click();
  await page.keyboard.press("Control+Alt+p");
  await expect(pin).toHaveCount(0);
});
