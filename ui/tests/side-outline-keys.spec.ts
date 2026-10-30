import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// The Outline is walked with the keys: ↑/↓/Home/End between headings, Enter jumps, Esc back to the editor.
test("Outline: arrows walk the headings, Enter jumps, Esc returns to the editor", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "ch1.tex");
  await expect(page.locator(".cm-content")).toContainText("chapter");
  await page.keyboard.press("Meta+o");
  const heads = page.locator(".outline .head");
  await expect(heads).toHaveText(["Intro", "Model", "Limits"]);

  await heads.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(heads.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(heads.nth(2)).toBeFocused();
  await page.keyboard.press("ArrowDown"); // stays on the last
  await expect(heads.nth(2)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(heads.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-activeLine")).toContainText("\\section{Model}");
  await expect(page.locator(".cm-editor.cm-focused")).toHaveCount(1);

  await page.keyboard.press("Meta+o");
  await heads.nth(2).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cm-editor.cm-focused")).toHaveCount(1);
  // a long heading can be read whole from its tooltip
  await expect(heads.nth(2)).toHaveAttribute("title", /^Limits\nLine/);
});

// A note with no heading says how to make one, in the file's own syntax.
test("Outline: a note without headings says how to make one", async ({ page, request }) => {
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "notes/side-flat.md", text: "Just a line.\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("side-flat.md");
  await expect(page.getByTestId("palette").getByText("side-flat", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toContainText("Just a line.");
  await page.keyboard.press("Meta+o");
  await expect(page.locator(".outline")).toContainText("No headings yet: a line starting with # makes one.");
});
