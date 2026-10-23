import { test, expect, type Page } from "@playwright/test";

// "the app does not remember where you left the notes and always starts at the beginning" (2026-10-21): a file opens
// at the caret and scroll it was left at (lib/editor/places.ts).
const H = { "x-atlas": "1" };

async function open(page: Page, name: string) {
  await page.keyboard.press("Control+p");
  await page.keyboard.type(`${name}.md`);
  await expect(page.getByTestId("palette").getByText(name, { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
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
