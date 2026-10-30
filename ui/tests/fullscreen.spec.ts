import { test, expect } from "@playwright/test";
import { shownName } from "../src/lib/paths";

// "we need also a fullscreen mode for both the terminal and the main editor window": F11 gives the
// tab that has the keys the whole window (lib/fullscreen.svelte.ts); F11 again puts the layout back.
const box = async (l: import("@playwright/test").Locator) => (await l.boundingBox())!;
/** a click on the bar where nothing is: the bottom of the tab list */
const emptyOfBar = async (page: import("@playwright/test").Page) => {
  const list = page.getByTestId("sidebar").locator(".tabs-list");
  const b = await box(list);
  await list.click({ position: { x: b.width / 2, y: b.height - 6 } });
};

test("F11 gives the editor, then the terminal, the whole window, and puts the layout back", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("journal.md");
  await expect(page.getByTestId("palette").getByText("journal", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const editor = page.locator(".cm-editor:visible").first(), sidebar = page.getByTestId("sidebar");
  await expect(editor).toBeVisible();
  await page.keyboard.press("Control+`");
  const term = page.locator(".xterm:visible").first();
  await expect(term).toBeVisible();
  const view = page.viewportSize()!, before = await box(term);

  // the terminal has the keys: it takes the window, the editor is out of the way and the left bar
  // shrinks to its icons ("i want the compact side bar to show up, and make it full when i move the mouse over there")
  await page.keyboard.press("F11");
  await expect.poll(async () => (await box(sidebar)).width).toBeLessThan(64);
  await expect.poll(async () => (await box(term)).height).toBeGreaterThan(view.height - 80);
  await expect.poll(async () => (await box(term)).width).toBeGreaterThan(view.width - 100);
  await expect(editor).toBeHidden();
  // hovering does NOT open it (2026-10-17: "not automatic"); a click on its empty space does, over the pane, and the
  // terminal keeps its size (no reflow of what runs in it); a click elsewhere puts it away
  const full = await box(term);
  await page.mouse.move(view.width - 20, view.height / 2);
  await sidebar.hover();
  await page.waitForTimeout(600);
  expect((await box(sidebar)).width).toBeLessThan(64);
  await emptyOfBar(page);
  await expect.poll(async () => (await box(sidebar)).width).toBeGreaterThan(150);
  expect(Math.round((await box(term)).width)).toBe(Math.round(full.width));
  await page.mouse.move(view.width - 20, view.height / 2);
  await page.waitForTimeout(400);
  expect((await box(sidebar)).width, "leaving does not close it: it was asked for").toBeGreaterThan(150);
  await page.mouse.click(view.width - 200, view.height / 2);
  await expect.poll(async () => (await box(sidebar)).width).toBeLessThan(64);
  // no frame round the one pane (it took the accent's tint from the split's active-group border)
  const border = await page.locator(".dv-groupview:visible").first().evaluate((g) => getComputedStyle(g).borderTopColor);
  expect(border).toBe("rgba(0, 0, 0, 0)");
  await page.keyboard.press("F11");
  await expect.poll(async () => (await box(sidebar)).width).toBeGreaterThan(150);
  await expect(editor).toBeVisible();
  await expect.poll(async () => Math.round((await box(term)).height)).toBe(Math.round(before.height));

  // the same key in the editor
  await editor.locator(".cm-content").click();
  await page.keyboard.press("F11");
  await expect.poll(async () => (await box(sidebar)).width).toBeLessThan(64);
  await expect(term).toBeHidden();
  await expect.poll(async () => (await box(editor)).height).toBeGreaterThan(view.height - 80);
  // a reload does not come back locked in fullscreen
  await page.waitForTimeout(800);
  await page.reload();
  await expect(sidebar).toBeVisible();
});

// "if i am in fullscreen and change to a terminal, keep fullscreen but in the terminal" · "and viceversa"
test("fullscreen follows the keys: editor → terminal → editor stays fullscreen", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type("journal.md");
  await expect(page.getByTestId("palette").getByText("journal", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  const editor = page.locator(".cm-editor:visible").first(), sidebar = page.getByTestId("sidebar");
  await expect(editor).toBeVisible();
  await page.keyboard.press("Control+`"); // a terminal exists (and has the keys)…
  const term = page.locator(".xterm:visible").first();
  await expect(term).toBeVisible();
  await editor.locator(".cm-content").click(); // …then back to the editor
  const view = page.viewportSize()!;
  await page.keyboard.press("F11");
  await expect.poll(async () => (await box(editor)).height).toBeGreaterThan(view.height - 80);

  await page.keyboard.press("Control+`"); // to the terminal: it takes the window, still fullscreen
  await expect(term).toBeVisible();
  await expect.poll(async () => (await box(term)).height).toBeGreaterThan(view.height - 80);
  await expect(editor).toBeHidden();
  await expect.poll(async () => (await box(sidebar)).width).toBeLessThan(64);

  // and back through the left bar's tab (opened by a click on its empty space; choosing a tab puts it away)
  await emptyOfBar(page);
  await sidebar.locator(".tab", { hasText: "journal" }).click();
  await expect(page.locator(".cm-editor:visible").first()).toBeVisible();
  await expect.poll(async () => (await box(page.locator(".cm-editor:visible").first())).height).toBeGreaterThan(view.height - 80);
  await expect(term).toBeHidden();
  await page.mouse.move(view.width - 20, view.height / 2);
  await expect.poll(async () => (await box(sidebar)).width).toBeLessThan(64);

  await page.keyboard.press("F11"); // and F11 still puts the layout back
  await expect.poll(async () => (await box(sidebar)).width).toBeGreaterThan(150);
  await expect(term).toBeVisible();
});

// "fullscreen should keep that split, also a small button to unsplit them" (2026-10-17): two editors side by
// side are one split row in the tab list; F11 keeps both on screen; the row's button makes them one editor again
test("a split is one row of the tab list, fullscreen keeps it, and its button unsplits", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  for (const f of ["journal.md", "paste.md"]) {
    await page.keyboard.press("Control+p");
    await page.keyboard.type(f);
    await expect(page.getByTestId("palette").getByText(shownName(f), { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".cm-editor:visible").first()).toBeVisible();
  }
  const sidebar = page.getByTestId("sidebar");
  await sidebar.locator(".tab", { hasText: "paste" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Split right" }).click();
  const row = sidebar.getByTestId("split-row");
  await expect(row.locator(".tab")).toHaveCount(2);
  await expect(page.locator(".cm-editor:visible")).toHaveCount(2);
  await expect(sidebar.locator(".group-head", { hasText: /Tabs \d/ }), "one Tabs section, not one per split").toHaveCount(0);

  await page.locator(".cm-editor:visible").first().locator(".cm-content").click();
  await page.keyboard.press("F11");
  await expect.poll(async () => (await box(sidebar)).width).toBeLessThan(64);
  await expect(page.locator(".cm-editor:visible"), "both halves stay").toHaveCount(2);
  await page.keyboard.press("F11");
  await expect.poll(async () => (await box(sidebar)).width).toBeGreaterThan(150);

  await row.hover();
  await row.getByRole("button", { name: "Unsplit" }).click();
  await expect(row).toHaveCount(0);
  await expect(page.locator(".cm-editor:visible")).toHaveCount(1);
  await expect(sidebar.locator(".tab", { hasText: "journal" })).toHaveCount(1);
  await expect(sidebar.locator(".tab", { hasText: "paste" })).toHaveCount(1);
});
