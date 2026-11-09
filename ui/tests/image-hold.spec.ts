import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// A picture in a note held under a finger opens alone, full screen, to zoom (lib/image-viewer.ts via touch.ts); Back
// or a tap closes it. Before, a long press inside a note did nothing on a phone.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="teal"/></svg>`;

test("holding a picture in a note shows it alone; two fingers zoom it; a tap closes it", async ({ page, request }) => {
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "notes/held-image.md", text: "# Held\n\n![poster](https://pictures.test/poster.svg)\n" } });
  await page.route("https://pictures.test/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: SVG }));
  await page.goto("/");
  await openFile(page, "held-image.md");
  const img = page.locator("img.cm-embed-image");
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(48);
  const b = (await img.boundingBox())!;
  const touch = (type: string, id: number, x: number, y: number, on: string) =>
    page.evaluate(([type, id, x, y, on]) => document.querySelector(on as string)!.dispatchEvent(new PointerEvent(type as string, { pointerId: id as number, pointerType: "touch", isPrimary: id === 1, clientX: x as number, clientY: y as number, bubbles: true, cancelable: true })), [type, id, x, y, on] as const);
  await touch("pointerdown", 1, b.x + 20, b.y + 20, "img.cm-embed-image");
  const viewer = page.locator(".image-viewer");
  await expect(viewer).toBeVisible();
  await touch("pointerup", 1, b.x + 20, b.y + 20, "img.cm-embed-image");
  await expect(viewer.locator("img")).toHaveAttribute("src", /poster\.svg/);

  // two fingers apart: it grows
  const v = (await viewer.boundingBox())!, cx = v.x + v.width / 2, cy = v.y + v.height / 2;
  await touch("pointerdown", 1, cx - 20, cy, ".image-viewer");
  await touch("pointerdown", 2, cx + 20, cy, ".image-viewer");
  await touch("pointermove", 2, cx + 120, cy, ".image-viewer");
  await touch("pointerup", 1, cx - 20, cy, ".image-viewer");
  await touch("pointerup", 2, cx + 120, cy, ".image-viewer");
  expect(await viewer.locator("img").evaluate((el) => el.style.transform)).toMatch(/scale\((?!1\))/);

  // a tap that moved nothing closes it
  await touch("pointerdown", 1, cx, cy, ".image-viewer");
  await touch("pointerup", 1, cx, cy, ".image-viewer");
  await expect(viewer).toHaveCount(0);
});
