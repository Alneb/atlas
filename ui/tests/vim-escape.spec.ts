import { test, expect } from "@playwright/test";
const H = { "x-atlas": "1" };

// Regression (depth audit): in a note, the completion sources are still pending right after a
// keystroke; their closeCompletion used to swallow Escape, so vim stayed in INSERT and `u` was typed.
test("vim: Escape right after typing in a note leaves insert, and u undoes", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/vim-esc.md", text: "# Esc\n\nsome text\n" } });
  await page.goto("/");
  await page.keyboard.press("Control+p");
  await page.keyboard.type("vim-esc.md");
  await expect(page.getByTestId("palette").getByText("vim-esc", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.locator(".cm-content").click();
  await page.keyboard.press("G");
  await page.keyboard.press("A");
  await page.keyboard.type(" zzz-undo-me");
  await page.keyboard.press("Escape"); // immediately: the completion is still pending
  await expect(page.getByTestId("vim-mode")).toHaveText(/NORMAL/);
  await page.keyboard.press("u");
  await expect(page.locator(".cm-content")).not.toContainText("zzz-undo-me");
  await expect(page.locator(".cm-content")).toContainText("some text");
});
