import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// "the autocompletion does not seem to work for greek letters" and "tab … with autocompletion it
// should move down and enter works": in math, two letters list the commands that start with them;
// Tab walks the list, Enter takes the entry.
const H = { "x-atlas": "1" };

test("Greek letters complete in math; Tab moves down the list, Enter accepts", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/greek.md", text: "# Greek\n\nprose\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "greek.md");
  await expect(page.locator(".cm-content")).toContainText("prose");
  await page.locator(".cm-content").getByText("prose").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go$\\ga");
  const list = page.locator(".cm-tooltip-autocomplete");
  await expect(list.getByText("\\gamma", { exact: true })).toBeVisible();
  await expect(list.locator("li[aria-selected=true]")).toHaveText(/\\gamma/);
  await page.waitForTimeout(500); // the list ignores Enter for its first moments
  await page.keyboard.press("Tab");
  await expect(list.locator("li[aria-selected=true]")).toHaveText(/\\Gamma/);
  await page.keyboard.press("Shift+Tab");
  await expect(list.locator("li[aria-selected=true]")).toHaveText(/\\gamma/);
  await page.keyboard.press("Enter");
  const text = () => page.evaluate(() => (window as any).__atlas.editor().text as string);
  await expect.poll(text).toContain("$\\gamma");
  // outside math the same letters list nothing
  await page.keyboard.type("$");
  await page.keyboard.press("Escape");
  await page.keyboard.type("Goga");
  await page.waitForTimeout(300);
  await expect(list.getByText("\\gamma", { exact: true })).toHaveCount(0);
});

// Tab types a tab character rather than indenting the whole line:
// Obsidian's Tab in a note, VS Code's in code.
test("Tab types a tab at the caret in prose and indents a list item; in code it types an indent", async ({ page, request }) => {
  await request.put("/api/file", { headers: H, data: { path: "notes/tabs.md", text: "# Tabs\n\nabcdef\n- item\nline one\nline two\n" } });
  await request.put("/api/file", { headers: H, data: { path: "notes/tabs.py", text: "x = 1\n" } });
  const text = () => page.evaluate(() => (window as any).__atlas.editor().text as string);
  const insert = async () => { if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("i"); }; // vim: into insert mode
  const open = async (name: string, word: string) => {
    await page.keyboard.press("Control+p");
    await page.keyboard.type(name);
    // tabs.md and tabs.py both read "tabs": wait for this file's row to be the chosen one (its path is on the row)
    await expect(page.locator(`[data-testid=palette-item].sel[data-path$="/${name}"]`)).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".cm-content:visible")).toContainText(word);
  };
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await open("tabs.md", "abcdef");
  const ed = page.locator(".cm-content:visible").first();
  await ed.getByText("abcdef").click();
  await insert();
  await page.keyboard.press("Home"); for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Tab");
  await expect.poll(text).toContain("\nabc\tdef\n");
  await ed.getByText("item").click(); await insert();
  await page.keyboard.press("End"); await page.keyboard.press("Tab");
  await expect.poll(text).toMatch(/\n(\t| {2,})- item\n/);
  await page.keyboard.press("Shift+Tab");
  await expect.poll(text).toContain("\n- item\n");

  await open("tabs.py", "x = 1");
  await page.locator(".cm-content:visible").first().getByText("x = 1").click(); await insert();
  await page.keyboard.press("End"); await page.keyboard.press("Enter"); await page.keyboard.type("y");
  await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Tab");
  await expect.poll(text, "one indent unit at the caret, not the line moved").toMatch(/\ny( {2,}|\t)\n?$/);
});
