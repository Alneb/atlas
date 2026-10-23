import { test, expect } from "@playwright/test";

// Fullscreen keeps the left bar as icons; its sidebar button opens the bar over the page and closes it again.
test("in fullscreen the sidebar button opens the bar and closes it", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate(() => (window as unknown as { __atlas: { commands(): { id: string }[] } }).__atlas.commands());
  await page.keyboard.press("F1");
  await page.keyboard.type("fullscreen");
  await page.getByTestId("palette").getByText(/fullscreen/i).first().click();
  const side = page.getByTestId("sidebar");
  await expect.poll(() => side.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(60);
  await page.screenshot({ path: test.info().outputPath("fullscreen.png") });
  await page.getByTestId("sidebar-toggle").click();
  await expect(side).toHaveClass(/peek/);
  await page.screenshot({ path: test.info().outputPath("fullscreen-open.png") });
  await page.getByTestId("sidebar-toggle").click();
  await expect(side).not.toHaveClass(/peek/);
});
