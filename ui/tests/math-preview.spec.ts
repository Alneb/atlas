import { test, expect, type Page } from "@playwright/test";
import { openFile } from "./open";

// "preview latex formulas while i write them": with the caret in a formula, a box under it shows
// the formula drawn, at every key — also before the closing $ is typed; a formula that does not
// parse keeps the last drawing, dimmed, with the reason.
async function note(page: Page) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("hubbard.md");
  await expect(page.getByTestId("palette").getByText("hubbard", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go"); // vim: a new last line, insert mode
}

test("the formula under the caret is drawn while it is typed, and goes when the caret leaves", async ({ page }) => {
  await note(page);
  const box = page.locator(".cm-math-preview");
  await expect(box).toHaveCount(0);
  await page.keyboard.type("energy $E = ");
  await expect(box, "not closed yet: it is already drawn").toBeVisible();
  await expect(box.locator(".katex")).toContainText("E");
  await page.keyboard.type("x^");
  // a power with nothing in it yet: the last good drawing stays, dimmed, with KaTeX's reason
  await expect(box.locator(".stale")).toBeVisible();
  await expect(box.locator(".why")).not.toBeEmpty();
  await page.keyboard.type("2");
  await expect(box.locator(".stale")).toHaveCount(0);
  await expect(box.locator(".katex .msupsub"), "the power is drawn").toHaveCount(1);
  await page.keyboard.type("$ and text");
  await expect(box, "the caret left the formula: it is drawn in the text again").toHaveCount(0);
});

// "it only works if you are inside the $$$$ it should work at the moment to move to that line and it changes to edit
// mode" · "same for $ $ inline" (2026-10-19): drawn exactly when the source shows — the caret touching the formula,
// on its dollars too
test("a formula is drawn as soon as its source shows: the caret on its dollars, display or inline", async ({ page }) => {
  await note(page);
  await page.keyboard.type("see $p^2$");
  const tip = page.locator(".cm-tooltip.cm-math-preview");
  await expect(tip.locator(".katex"), "right after the closing $").toContainText("p");
  await page.keyboard.type(" here");
  await expect(tip, "away from it: rendered in the text, no second drawing").toHaveCount(0);
  await page.keyboard.press("Enter");
  await page.keyboard.type("$$\nF = ma\n$$");
  const block = page.locator(".cm-content .cm-math-preview-block");
  await expect(block.locator(".katex"), "on the closing $$").toContainText("ma");
});

// "the rendered preview should not float, it should be like when we edit images, and only for $$$$ and \[\],
// it can float for $$, but make sure the snippet autocompleter is on top" (2026-10-15)
test("display math is drawn in the text under it, inline math floats above its line, the list stays on top", async ({ page, request }) => {
  await note(page);
  await page.keyboard.type("$$\nE = mc^2\n$$");
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("End"); // into the formula
  const block = page.locator(".cm-content .cm-math-preview-block");
  await expect(block, "in the text, not a tooltip").toBeVisible();
  await expect(block.locator(".katex")).toContainText("mc");
  await expect(page.locator(".cm-tooltip.cm-math-preview")).toHaveCount(0);
  // the drawing sits under the closing $$, as an image under its link
  const closing = page.locator(".cm-line", { hasText: /^\$\$$/ }).last();
  expect((await block.boundingBox())!.y).toBeGreaterThan((await closing.boundingBox())!.y);

  await page.keyboard.press("ArrowDown"); await page.keyboard.press("End");
  await page.keyboard.press("Enter"); await page.keyboard.type("and $\\alp");
  const tip = page.locator(".cm-tooltip.cm-math-preview");
  await expect(tip, "inline math floats").toBeVisible();
  const list = page.locator(".cm-tooltip-autocomplete");
  await expect(list).toBeVisible();
  const line = page.locator(".cm-activeLine");
  expect((await tip.boundingBox())!.y, "above its line").toBeLessThan((await line.boundingBox())!.y);
  const z = (sel: string) => page.locator(sel).first().evaluate((el) => Number(getComputedStyle(el.closest(".cm-tooltip")!).zIndex) || 0);
  expect(await z(".cm-tooltip-autocomplete"), "the list over the drawing").toBeGreaterThan(await z(".cm-tooltip.cm-math-preview"));

  // a .tex file: \[ … \] is drawn in the text too
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "notes/eq.tex", text: "Text.\n\\[\n  a^2 + b^2\n\\]\nMore.\n" } });
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await openFile(page, "eq.tex");
  await page.locator(".cm-content:visible").first().getByText("a^2").click();
  await expect(page.locator(".cm-content:visible .cm-math-preview-block .katex")).toBeVisible();
});

// "in markdown files $$ $$ and \[\] dont render those in real time while you edit them, like what we do with images"
test("\\[ … \\] is display math in a note: drawn under it while edited, rendered once the caret leaves", async ({ page }) => {
  await note(page);
  await page.keyboard.insertText("\\[\nx^2 + y_1\n\\]");
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("End"); // into the formula
  const block = page.locator(".cm-content .cm-math-preview-block");
  await expect(block).toBeVisible();
  await expect(block.locator(".katex")).toContainText("y");
  // the caret elsewhere: the formula itself is drawn, the \\[ lines are gone
  await page.keyboard.press("Escape");
  await page.keyboard.press("g"); await page.keyboard.press("g");
  await expect(page.locator(".cm-content .katex-display").last()).toContainText("x");
  await expect(page.locator(".cm-line", { hasText: /^\\\[$/ })).toHaveCount(0);
});
