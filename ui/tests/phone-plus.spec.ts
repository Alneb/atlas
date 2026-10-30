import { test, expect } from "@playwright/test";

// The phone's "+": a tap makes something new (New…), a long press captures — the same as the phone app's button.
test.use({ viewport: { width: 400, height: 760 }, hasTouch: true });

test("a tap on + opens New…, holding it opens capture", async ({ page }) => {
  await page.goto("/");
  const fab = page.locator(".fab");
  await expect(fab).toBeVisible();

  await fab.click();
  await expect(page.getByPlaceholder("New…")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder("New…")).toHaveCount(0);

  const box = (await fab.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Command palette" }).getByPlaceholder("Capture a thought, a to-do, a link…")).toBeVisible();
  await expect(page.getByPlaceholder("New…")).toHaveCount(0); // the release after a hold is not also a tap
});
