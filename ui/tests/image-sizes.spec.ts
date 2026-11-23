import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// A picture's box keeps its size while scrolling: each embed's natural size is learned in the background when the
// note opens, so a picture far down already has its height when it is first drawn (nothing under it jumps), and a
// picture drawn before its file arrived is never stuck at the 1×1 placeholder's size.
const H = { "x-atlas": "1" };
const svg = (w: number, h: number, fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`;

test("pictures far down a note are drawn at their size at once, none at the placeholder's", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/sizes-a.svg", text: svg(300, 420, "teal") } });
  await request.put("/api/file", { headers: H, data: { path: "notes/sizes-b.svg", text: svg(400, 260, "orange") } });
  const filler = Array.from({ length: 120 }, (_, i) => `Line ${i} of filler text.`).join("\n\n");
  await request.put("/api/file", { headers: H, data: { path: "notes/sizes.md", text: `# Sizes\n\n![[sizes-a.svg]]\n\n${filler}\n\n![[sizes-b.svg]]\n\nThe end.\n` } });
  await page.goto("/");
  await openFile(page, "sizes.md");
  const first = page.locator('img.cm-embed-image[alt="sizes-a.svg"]');
  await expect.poll(() => first.evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBe(420);
  await page.waitForTimeout(1500); // the background learning
  await page.locator(".cm-content").getByText("The end.").scrollIntoViewIfNeeded();
  const far = page.locator('img.cm-embed-image[alt="sizes-b.svg"]');
  await expect(far).toHaveCount(1);
  expect(await far.getAttribute("height"), "the far picture's box reserved when it is built").toBe("260");
  await expect.poll(() => far.evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(400);
});
