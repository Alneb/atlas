import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openFile } from "./open";

// A JPEG XL picture is decoded by the core (thumbs.rs, jxl-oxide), not by the page's engine: Chromium reads none, so a
// picture shown here proves it — embedded in a note and opened on its own.
const JXL = readFileSync(fileURLToPath(new URL("../../crates/atlas-android/tests/fixtures/tiny.jxl", import.meta.url)));

test("a JPEG XL picture shows in a note and on its own, decoded by the core", async ({ page, request }) => {
  const H = { "x-atlas": "1" };
  expect((await request.put("/api/raw?path=pictures/tiny.jxl", { headers: H, data: JXL })).ok()).toBe(true);
  await request.put("/api/file", { headers: H, data: { path: "notes/jxl-note.md", text: "# Pictures\n\n![[tiny.jxl]]\n" } });
  await page.goto("/");
  await openFile(page, "jxl-note.md");
  const img = page.locator("img.cm-embed-image, .cm-content img").first();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath("jxl-in-note.png") });
  // on its own: the image pane
  await openFile(page, "tiny.jxl");
  const own = page.locator(".image-pane img, .image img").first();
  await expect.poll(() => own.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  await request.post(`/api/fs/trash?path=${encodeURIComponent("notes/jxl-note.md")}`, { headers: H });
  await request.post(`/api/fs/trash?path=${encodeURIComponent("pictures/tiny.jxl")}`, { headers: H });
});
