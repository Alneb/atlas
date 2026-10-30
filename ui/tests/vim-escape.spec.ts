import { test, expect } from "@playwright/test";
import { openFile } from "./open";
const H = { "x-atlas": "1" };

// Regression (depth audit): in a note, the completion sources are still pending right after a
// keystroke; their closeCompletion used to swallow Escape, so vim stayed in INSERT and `u` was typed.
test("vim: Escape right after typing in a note leaves insert, and u undoes", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/vim-esc.md", text: "# Esc\n\nsome text\n" } });
  await page.goto("/");
  await openFile(page, "vim-esc.md");
  await expect(page.locator(".dv-tab.dv-active-tab")).toContainText("vim-esc");
  await page.locator(".dv-active-group .cm-content").click(); // the note's, not a pane left open by an earlier test
  await page.keyboard.press("G");
  await page.keyboard.press("A");
  await page.keyboard.type(" zzz-undo-me");
  await page.keyboard.press("Escape"); // immediately: the completion is still pending
  await expect(page.getByTestId("vim-mode")).toHaveText(/NORMAL/);
  await page.keyboard.press("u");
  await expect(page.locator(".dv-active-group .cm-content")).not.toContainText("zzz-undo-me");
  await expect(page.locator(".dv-active-group .cm-content")).toContainText("some text");
});
