import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// A table or a display formula inside a callout is a block widget replacing whole lines: it must stand inside the
// callout's box (its colours and edge), not as a band across it.
const H = { "x-atlas": "1" };

test("a table and a display formula inside a callout stay inside its box", async ({ page, request }) => {
  const body = [
    "# Callout blocks", "",
    "> [!note] The statement",
    "> Text before.",
    "> $$",
    "> \\partial_\\mu J^\\mu = 0",
    "> $$",
    "> Text after.", "",
    "> [!tip] Using it",
    "> Two ways.",
    ">",
    "> | Transformation | Current |",
    "> | --- | --- |",
    "> | translation | $T$ |", "",
    "after", "",
  ].join("\n");
  await request.put("/api/file", { headers: H, data: { path: "notes/callout-blocks.md", text: body } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "callout-blocks.md");
  const content = page.locator(".cm-content:visible").first();
  await content.getByText("after", { exact: true }).waitFor();
  await page.locator(".cm-content:visible .cm-line", { hasText: "after" }).last().click(); // the caret away from the callouts
  const table = content.locator("table").first();
  await expect(table).toBeVisible();
  // the table's block widget carries the tip callout's box, and closes it
  const tableBox = content.locator(".cm-callout-widget", { has: page.locator("table") });
  await expect(tableBox).toHaveClass(/callout-tip/);
  await expect(tableBox).toHaveClass(/cm-callout-last/);
  // the formula: inside the note callout's box, wherever the editor draws it
  const math = content.locator(".cm-math-block, .katex-display, mjx-container").first();
  await expect(math).toBeVisible();
  const inBox = await math.evaluate((el) => !!el.closest(".cm-callout"));
  expect(inBox, "the display formula sits inside a callout box").toBe(true);
  await page.screenshot({ path: "../target/callout-blocks.png" });
});
