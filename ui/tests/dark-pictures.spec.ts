import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// In the dark theme a picture drawn on white (a plot, a diagram) is darkened to match; a photo-like one is not; and a
// PDF's pages are dark with the app's dark theme (`[pdf] dark_pages = "app"`).
const H = { "x-atlas": "1" };
const PLOT = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="white"/><path d="M10 100 L60 40 L110 80 L190 20" stroke="black" stroke-width="3" fill="none"/></svg>`;
const PHOTO = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><defs><linearGradient id="g"><stop offset="0" stop-color="#c0392b"/><stop offset=".5" stop-color="#27ae60"/><stop offset="1" stop-color="#2980b9"/></linearGradient></defs><rect width="200" height="120" fill="url(#g)"/></svg>`;

test("a picture drawn on white is darkened in the dark theme, a colourful one is not", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/plot-white.svg", text: PLOT } });
  await request.put("/api/file", { headers: H, data: { path: "notes/photo-like.svg", text: PHOTO } });
  await request.put("/api/file", { headers: H, data: { path: "notes/dark-pics.md", text: "# Pictures\n\n![[plot-white.svg]]\n\n![[photo-like.svg]]\n\nend\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "dark-pics.md");
  const plot = page.locator('.cm-content img.cm-embed-image[src*="plot-white"], .cm-content img.cm-embed-image[alt*="plot-white"]').first();
  const photo = page.locator('.cm-content img.cm-embed-image[src*="photo-like"], .cm-content img.cm-embed-image[alt*="photo-like"]').first();
  await expect(plot).toBeVisible();
  await expect(photo).toBeVisible();
  await expect(plot).toHaveClass(/dark-picture/);
  await expect(photo).not.toHaveClass(/dark-picture/);
  await expect.poll(() => plot.evaluate((el) => getComputedStyle(el).filter)).toContain("invert");
});
