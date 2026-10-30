import { test, expect } from "@playwright/test";
import { openFile } from "./open";
import { shownName } from "../src/lib/paths";

// The side panel's two places (ui.side_panel): a dock column beside the editors, or the left bar,
// right under the tab list. Its heading is one row of its tools, the same in both places (SideHead.svelte);
// one button there moves it. The tools are never rows of the tab list.
const toBar = "Side panel in the left bar", toDock = "Side panel beside the editors";

test.afterEach(async ({ page }) => { // the setting is the workspace's: leave it as it was
  const back = page.getByRole("button", { name: toDock });
  if (await back.count()) { await back.click(); await expect(page.getByRole("button", { name: toBar })).toBeVisible(); }
});

test("the side panel moves into the left bar and back, keeping the tool that was open", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const sidebar = page.getByTestId("sidebar"), panel = page.getByTestId("side-panel");
  await page.keyboard.press("Meta+Shift+f");
  await expect(page.locator(".dv-groupview .side-pane").first()).toBeVisible();
  await page.getByTestId("side-head").getByRole("button", { name: toBar }).click();
  // the files tree is now inside the bar, and no longer a dock tab
  await expect(panel.locator(".side-pane").first()).toBeVisible();
  await expect(page.locator(".dv-groupview .side-pane")).toHaveCount(0);
  await expect(sidebar.locator(".tab", { hasText: "Files" })).toHaveCount(0);
  const bar = (await sidebar.boundingBox())!, box = (await panel.boundingBox())!;
  expect(box.x + box.width, "inside the bar").toBeLessThanOrEqual(bar.x + bar.width + 1);
  const list = (await sidebar.locator(".tabs-list").boundingBox())!;
  expect(Math.abs(box.y - (list.y + list.height)), "right under the tab list, no gap").toBeLessThan(12);
  await expect(sidebar.locator(".group-head", { hasText: "Side panel" }), "one heading: the panel's own row").toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: /the side panel$/ })).toHaveCount(1);
  // the footer is general actions only: the tools are the panel's row, Home an app at the top
  for (const tool of ["Files", "Search", "Outline", "Git", "Home"]) await expect(sidebar.locator(".side-toolbar").getByRole("button", { name: tool, exact: true }), tool).toHaveCount(0);
  await expect(sidebar.getByTestId("apps").getByRole("button", { name: "Home", exact: true })).toHaveCount(1);
  // the shortcuts still reach it: search takes the keys there, Super+B hides and shows it
  await page.keyboard.press("Control+Shift+F");
  await expect(panel.getByRole("tab", { name: "Search" })).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator("input").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByText("Finish the GW notes.").click();
  await page.keyboard.press("Meta+b");
  await expect(panel.locator(".sp-body")).toBeHidden();
  await sidebar.getByRole("button", { name: "Show the side panel" }).click();
  await expect(panel.locator(".sp-body")).toBeVisible();
  // and back: the tool that was showing becomes a dock tab again
  await sidebar.getByRole("button", { name: toDock }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("side-head").getByRole("tab", { name: "Search" })).toHaveAttribute("aria-selected", "true");
  await expect(sidebar.locator(".tab", { hasText: "Search" }), "a tool is not a tab").toHaveCount(0);
});

// "the side split of the left bar gets too small when you open many things, it should just be a
// fixed size that we can move": its height is its own, dragged by the top edge
test("in the left bar the side panel keeps its height as tabs open; its top edge resizes it", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const sidebar = page.getByTestId("sidebar"), panel = page.getByTestId("side-panel");
  await page.keyboard.press("Meta+Shift+f"); // the side column (and its row of tools, with the move button)
  await page.getByTestId("side-head").getByRole("button", { name: toBar }).click();
  await expect(panel.locator(".sp-body")).toBeVisible();
  const height = async () => Math.round((await panel.boundingBox())!.height);
  const start = await height();
  const grip = panel.getByRole("separator", { name: "Side panel height" });
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + 40, g.y + 3);
  await page.mouse.down();
  await page.mouse.move(g.x + 40, g.y + 3 - 90, { steps: 4 });
  await page.mouse.up();
  expect(Math.abs((await height()) - (start + 90)), "dragged up by 90").toBeLessThan(4);
  await grip.focus();
  await page.keyboard.press("ArrowDown");
  const set = await height();
  expect(Math.abs(set - (start + 66)), "the arrow keys move it too").toBeLessThan(4);
  for (const name of ["journal.md", "ch1.tex", "ch2.tex", "run.py", "paste.md"]) {
    await openFile(page, name);
    await expect(sidebar.locator(".tab", { hasText: shownName(name) })).toHaveCount(1);
    await page.waitForTimeout(300); // the new editor takes the keys a moment after its tab shows
  }
  expect(await height(), "more tabs do not squeeze it").toBe(set);
  await page.waitForTimeout(700); // the shell file is written a moment later
  await page.reload();
  await expect(panel.locator(".sp-body")).toBeVisible();
  expect(await height(), "kept across a reload").toBe(set);
});

// "whether the terminal or the side panel are on top still depends on the order": the headings of the
// tab list come in one order, open or empty. The side panel has none (2026-10-17: its tools are its own row)
test("the tab list's headings keep one order: terminal, then the editors", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const heads = () => page.getByTestId("sidebar").locator(".group-head > span:first-child").allTextContents();
  const want = await heads(); // "Tabs" only when a document is open (Home is an app, not a tab)
  expect(want[0]).toBe("Terminal");
  expect(want).not.toContain("Side panel");
  for (const key of ["Meta+j", "Meta+Shift+F", "Meta+j", "Meta+Shift+F"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(400);
    expect(await heads(), `after ${key}`).toEqual(want);
  }
});
