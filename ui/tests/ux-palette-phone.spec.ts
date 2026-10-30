import { test, expect } from "@playwright/test";

// On a phone the bar's rows are narrow: a title with nothing beside it uses the whole row before it is cut.
test.use({ viewport: { width: 400, height: 760 }, hasTouch: true });

test("a long title with no detail fills its row before it is cut", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Meta+e");
  await page.keyboard.type(">zoom everything in");
  const row = page.getByTestId("palette-item").filter({ hasText: "Zoom everything in" }).first();
  await expect(row).toBeVisible();
  const [titleRight, rowRight, cut] = await row.evaluate((e) => {
    const t = e.querySelector<HTMLElement>(".title")!;
    return [t.getBoundingClientRect().right, e.getBoundingClientRect().right, t.scrollWidth > t.clientWidth];
  });
  expect(cut).toBe(true); // the title is longer than the row: it must reach the row's end
  expect(rowRight - titleRight).toBeLessThan(16);
});
