import { test, expect, type Page } from "@playwright/test";
import { openFile } from "./open";

// "Context menus everywhere (… editor)": a right-click in the text opens the app's menu — the
// clipboard, then the note keys — and Shift+right-click leaves the browser's own.
const lastLine = (page: Page) => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } | null } }).__atlas.editor()?.text.trimEnd().split("\n").pop() ?? "");

test("the editor's menu: copy and paste, bold on the selection, keys in it, focus back in the text", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "hubbard.md");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("Gomenu word"); // vim: a new last line, insert mode
  await page.keyboard.press("Control+Shift+ArrowLeft"); // selects "word"
  const line = page.locator(".cm-activeLine");
  const menu = page.getByRole("menu");

  // nothing selected elsewhere: Cut and Copy are off; here they are on
  await line.click({ button: "right", position: { x: 70, y: 8 } });
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-label="Copy"]')).toBeEnabled();
  await expect(menu.locator('[data-label="Bold"]')).toContainText("Ctrl+B");
  await menu.locator('[data-label="Copy"]').click();
  await expect(menu).toBeHidden();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("word");
  await expect(page.locator(".cm-editor.cm-focused"), "the text has the keys again").toHaveCount(1);

  await line.click({ button: "right", position: { x: 70, y: 8 } });
  await page.keyboard.press("b"); // type-ahead to Bold
  await page.keyboard.press("Enter");
  await expect.poll(() => lastLine(page)).toBe("menu **word**");

  // paste replaces the selection (still "word", inside the marks)
  await line.click({ button: "right", position: { x: 70, y: 8 } });
  await menu.locator('[data-label="Paste"]').click();
  await expect.poll(() => lastLine(page)).toBe("menu **word**");
  await page.keyboard.press("Escape");

  // Shift+right-click: not ours
  await line.click({ button: "right", modifiers: ["Shift"], position: { x: 10, y: 8 } });
  await expect(menu).toBeHidden();
});
