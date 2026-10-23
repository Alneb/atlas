import { test, expect } from "@playwright/test";

// A web picture arrives after the editor has measured its lines. The gutter below it (fold arrows)
// must follow: found by the render audit in long web clips ("fold arrow off its line").
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420"><rect width="300" height="420" fill="teal"/></svg>`;

test("fold arrows stay on their lines when a picture loads late", async ({ page, request }) => {
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "notes/late-image.md", text: `# Clip\n\n![poster](https://pictures.test/poster.svg)\n\n## One\n\ntext\n\n## Two\n\ntext\n\n## Three\n\ntext\n` } });
  let served = false;
  await page.route("https://pictures.test/**", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    served = true;
    await route.fulfill({ contentType: "image/svg+xml", body: SVG });
  });
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("late-image.md");
  await expect(page.getByTestId("palette").getByText("late-image", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const img = page.locator("img.cm-embed-image");
  await expect.poll(() => served).toBe(true);
  await expect.poll(() => img.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(400);
  // every fold arrow on screen sits at the top of some line
  const astray = () => page.evaluate(() => {
    const tops = [...document.querySelectorAll(".cm-content > *")].map((l) => l.getBoundingClientRect().top);
    return [...document.querySelectorAll<HTMLElement>(".cm-foldGutter .cm-gutterElement")]
      .filter((g) => g.textContent?.trim() && g.getBoundingClientRect().height > 0 && getComputedStyle(g).visibility !== "hidden")
      .map((g) => g.getBoundingClientRect().top)
      .filter((top) => !tops.some((t) => Math.abs(t - top) < 3));
  });
  await expect.poll(astray).toEqual([]);
  expect(await page.locator(".cm-foldGutter .cm-gutterElement").count(), "there are arrows to check").toBeGreaterThan(3);
});
