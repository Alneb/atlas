import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// "VS Code keys in code": in a code file the editing keys are the editor's — Ctrl+G goes to a line,
// Ctrl+Shift+K deletes the line, Ctrl+Shift+L selects every occurrence. The app's commands live on
// Super keys (Super+Shift+K Commands, Super+Shift+L the Library), so they work from a code file too.
test("a code file keeps VS Code's editing keys; the app's Super keys still reach it from there", async ({ page, request }) => {
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "projects/keys.py", text: "a = 1\nb = 2\nc = a + a\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "keys.py");
  await page.locator(".code-cm .cm-line").first().click();
  const text = () => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } } }).__atlas.editor().text);
  await page.keyboard.press("Control+g");
  const goto = page.locator(".cm-goto-line input[name=line]");
  await expect(goto).toBeFocused();
  await goto.fill("2");
  await goto.press("Enter");
  await expect(page.locator(".code-cm .cm-activeLine")).toHaveText("b = 2");
  await page.keyboard.press("Control+Shift+k");
  await expect.poll(text).toBe("a = 1\nc = a + a\n");
  await expect(page.locator(".atlas-pane-commands"), "Commands did not open").toHaveCount(0);
  await page.keyboard.press("Control+Shift+l"); // select every occurrence, not the Library
  await expect(page.locator('[data-testid=apps] .app.open[aria-label^="Library"]')).toHaveCount(0);
  // the app's commands are on Super keys, which a code file does not take
  await page.keyboard.press("Meta+Shift+l");
  await expect(page.locator('[data-testid=apps] .app.open[aria-label^="Library"]')).toHaveCount(1); // an app, not a tab
  expect(await text(), "the Library key left the code alone").toBe("a = 1\nc = a + a\n");
});

// Several cursors: Ctrl+D adds the next occurrence, Ctrl+Shift+L takes them all (they collapsed to one before the
// editor allowed several selections). The find panel counts the matches and selects the nearest as you type.
test("Ctrl+D and Ctrl+Shift+L edit every occurrence; find counts its matches", async ({ page, request }) => {
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: "projects/multi.py", text: "foo = 1\nfoo = 2\nbar = foo\n" } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "multi.py");
  await page.locator(".code-cm .cm-line").first().click();
  const text = () => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } } }).__atlas.editor().text);
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Control+d"); // the word under the caret
  await page.keyboard.press("Control+d");
  await page.keyboard.insertText("x"); // typed text, as an input event (the workspace's vim would read a key as a command)
  await expect.poll(text).toBe("x = 1\nx = 2\nbar = foo\n");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Shift+ArrowRight"); // "x", then every "x"
  await page.keyboard.press("Control+Shift+l");
  await page.keyboard.insertText("y");
  await expect.poll(text).toBe("y = 1\ny = 2\nbar = foo\n");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+f");
  await page.keyboard.type("=");
  await expect(page.locator(".cm-search-count")).toHaveText("1 of 3");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cm-search-count")).toHaveText("2 of 3");
  await page.keyboard.type("zz");
  await expect(page.locator(".cm-search-count")).toHaveText("No matches");
});
