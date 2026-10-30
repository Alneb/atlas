import { test, expect } from "@playwright/test";
import { openFile } from "./open";

test("Outline lists LaTeX sections of the open file and jumps to them", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "ch1.tex");
  await expect(page.locator(".cm-content")).toContainText("chapter");
  await page.keyboard.press("Meta+o");
  const outline = page.locator(".outline");
  await expect(outline.locator(".head")).toHaveText(["Intro", "Model", "Limits"]);
  await outline.locator(".head", { hasText: "Model" }).click();
  await expect(page.locator(".cm-activeLine")).toContainText("\\section{Model}");
});
