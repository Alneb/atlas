import { test, expect, type Page } from "@playwright/test";
import { openFile } from "./open";

// "A classic formatting bar for markdown (bold, lists, headings, link, table, to-do), optional":
// `[editor] format_bar`. Off by default; on, its buttons do what the keys do and the text keeps the keys.
const lastLine = (page: Page) => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } | null } }).__atlas.editor()?.text.trimEnd().split("\n").pop() ?? "");
const text = (page: Page) => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } | null } }).__atlas.editor()?.text ?? "");

async function note(page: Page, bar: boolean) {
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.editor.format_bar = bar;
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "hubbard.md");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
}

test("the formatting bar is off unless asked for", async ({ page }) => {
  await note(page, false);
  await expect(page.getByTestId("format-bar")).toHaveCount(0);
});

test("the formatting bar: heading, list, numbered, quote, to-do, bold, code and a table, the keys staying in the text", async ({ page }) => {
  await note(page, true);
  const bar = page.getByTestId("format-bar");
  await page.keyboard.type("Gosome words"); // vim: a new last line, insert mode
  const press = (name: string) => bar.getByRole("button", { name, exact: true }).click();
  await press("Heading (again: a smaller one, then none)");
  await expect.poll(() => lastLine(page)).toBe("# some words");
  await press("Heading (again: a smaller one, then none)");
  await expect.poll(() => lastLine(page)).toBe("## some words");
  await press("List");
  await expect.poll(() => lastLine(page)).toBe("- some words");
  await press("Numbered list");
  await expect.poll(() => lastLine(page)).toBe("1. some words");
  await press("Quote");
  await expect.poll(() => lastLine(page)).toBe("> some words");
  await press("Quote");
  await expect.poll(() => lastLine(page)).toBe("some words");
  await press("To-do (again: done)");
  await expect.poll(() => lastLine(page)).toBe("- [ ] some words");
  // the keyboard is still in the text: type on, select the word, make it bold with the button
  await page.keyboard.type(" more");
  await page.keyboard.press("Control+Shift+ArrowLeft");
  await press("Bold");
  await expect.poll(() => lastLine(page)).toBe("- [ ] some words **more**");
  await press("Code");
  await expect.poll(() => lastLine(page)).toContain("`");
  await press("Insert a table");
  await expect.poll(() => text(page)).toContain("| Column | Column |\n| --- | --- |\n|  |  |");
  // the note is shared by the specs: do not leave an open to-do in it (Today's list is counted elsewhere)
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect.poll(() => lastLine(page)).not.toContain("[ ]");
});
