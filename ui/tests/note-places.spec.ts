import { test, expect, type Page } from "@playwright/test";
import { openFile } from "./open";

// A file opens at the caret and scroll it was left at, not at its top (lib/editor/places.ts).
const H = { "x-atlas": "1" };

async function open(page: Page, name: string) {
  await openFile(page, `${name}.md`);
  await expect(page.locator(".dv-active-group .cm-editor.cm-focused")).toBeVisible();
}

test("a note opens where it was left", async ({ page, request }) => {
  const text = "# Long\n\n" + Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join("\n\n") + "\n";
  await request.put("/api/file", { headers: H, data: { path: "notes/long-place.md", text } });
  await page.goto("/");
  await open(page, "long-place");
  await page.keyboard.press("Control+End"); // the empty line after the last
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".cm-activeLine")).toContainText("line 300");
  await page.keyboard.press("Control+w");
  await expect(page.locator(".dv-tab", { hasText: "long-place" })).toHaveCount(0);
  await open(page, "long-place");
  await expect(page.locator(".cm-activeLine")).toContainText("line 300");
  await expect(page.locator(".cm-line", { hasText: /^line 300$/ })).toBeInViewport();
});
