import { test, expect } from "@playwright/test";
import { shownName } from "../src/lib/paths";

async function open(page: import("@playwright/test").Page, name: string, text: string) {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.keyboard.press("Control+p");
  await page.keyboard.type(name);
  await expect(page.getByTestId("palette").getByText(shownName(name), { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-content")).toContainText(text);
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go"); // vim: new last line, insert mode
}

// Citing is linking (docs/PHILOSOPHY.md): a paper is cited as [[citekey]], a wikilink to its note; there is no @ cite command.
test("[[ in a note finds Library papers by author or title and links their note; @ does not cite", async ({ page }) => {
  await open(page, "aids.md", "Some text.");
  await page.keyboard.type("As shown by [[hubbard");
  const menu = page.locator(".cm-tooltip-autocomplete");
  await expect(menu).toContainText("hubbard1963electron");
  await page.waitForTimeout(250); // CodeMirror ignores Enter for 75 ms after the list opens (it would be a newline)
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-line").last()).toHaveText("As shown by [[hubbard1963electron]]");
  await page.keyboard.press("End");
  await page.keyboard.type(" and [[different"); // a word of the title, not of the file name
  await expect(menu).toContainText("anderson1972more");
  await page.keyboard.press("Escape");
  await page.keyboard.type("Go@hubbard"); // vim: a new line; `@` is plain text now
  await page.waitForTimeout(400);
  await expect(menu.getByText("hubbard1963electron")).toHaveCount(0);
});

test("\\cite{ in a .tex file completes citekeys, several separated by commas", async ({ page }) => {
  await open(page, "ch2.tex", "Text here.");
  await page.keyboard.type("see \\cite{ander");
  await expect(page.locator(".cm-tooltip-autocomplete")).toContainText("anderson1972more");
  await page.waitForTimeout(250); // as above
  await page.keyboard.press("Enter");
  await page.keyboard.type(", hub");
  await expect(page.locator(".cm-tooltip-autocomplete li").first()).toContainText("hubbard1963electron");
  await page.waitForTimeout(250); // let the list settle (a re-query in flight turns Enter into a newline)
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-line", { hasText: "\\cite{" }).last()).toContainText("\\cite{anderson1972more, hubbard1963electron");
});
