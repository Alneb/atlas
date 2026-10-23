import { test, expect, type Page } from "@playwright/test";

// Obsidian's keys in a note: Ctrl+B bold, Ctrl+I italic, Ctrl+K link — toggles on the selection.
// The app's own commands are on Super keys (Super+E / F1 the palette, Super+B the side panel), the
// same in a note and outside one; outside a note Ctrl+K and Ctrl+B are nobody's.
// the file's text, not what is drawn: live preview hides the marks of the span the caret has left
const lastLine = (page: Page) => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } | null } }).__atlas.editor()?.text.trimEnd().split("\n").pop() ?? "");
async function note(page: Page): Promise<void> {
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

test("in a note Ctrl+B / Ctrl+I / Ctrl+K make bold, italic and a link, and undo them", async ({ page }) => {
  await note(page);
  await page.keyboard.press("Control+b"); // nothing selected: the pair, caret inside
  await page.keyboard.type("strong");
  await expect.poll(() => lastLine(page)).toBe("**strong**");
  await page.keyboard.press("Control+b"); // caret at the end of the bold text: the key ends it
  await page.keyboard.type(" word");
  await expect.poll(() => lastLine(page)).toBe("**strong** word");
  await page.keyboard.press("Control+Shift+ArrowLeft"); // selects "word"
  await page.keyboard.press("Control+i");
  await expect.poll(() => lastLine(page)).toBe("**strong** *word*");
  await page.keyboard.press("Control+b"); // italic and bold together
  await expect.poll(() => lastLine(page)).toBe("**strong** ***word***");
  await page.keyboard.press("Control+i"); // and each comes off by itself
  await expect.poll(() => lastLine(page)).toBe("**strong** **word**");
  await page.keyboard.press("Control+b");
  await expect.poll(() => lastLine(page)).toBe("**strong** word");
  await page.keyboard.press("Control+k"); // the selection becomes the link's text; the caret waits for the address
  await page.keyboard.type("https://example.org");
  await expect.poll(() => lastLine(page)).toBe("**strong** [word](https://example.org)");
  await expect(page.getByTestId("palette")).toHaveCount(0);
  // the app's own commands are still one key away from a note
  await page.keyboard.press("Meta+e");
  await expect(page.getByTestId("palette")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("outside a note Ctrl+K / Ctrl+B do nothing; the app's Super+E / Super+B open the palette and the side panel", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const home = () => page.request.get("/api/file?path=Home.md", { headers: { "x-atlas": "1" } }).then((r) => r.json()).then((j) => j.text as string);
  const before = await home();
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Control+b");
  await page.waitForTimeout(300); // a wrong binding would have acted by now
  await expect(page.getByTestId("palette")).toHaveCount(0);
  await expect(page.locator(".side-pane")).toHaveCount(0);
  expect(await home(), "no key reached the home note").toBe(before);
  await page.keyboard.press("Meta+e");
  await expect(page.getByTestId("palette")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+b");
  await expect(page.locator(".side-pane").first()).toBeVisible();
});

// "tasks behave weirdly like they disappear or duplicate the - [ ]": Enter on an empty second item
// made a blank line and a new `- [ ]` (CodeMirror's loose list), and every Enter after it a blank line
test("Enter on an empty to-do ends the list; no blank line, no second marker", async ({ page }) => {
  await note(page);
  const text = () => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } | null } }).__atlas.editor()?.text ?? "");
  await page.keyboard.type("- [ ] buy milk");
  await page.keyboard.press("Enter");
  await expect.poll(() => lastLine(page)).toBe("- [ ]");
  await page.keyboard.press("Enter");
  await expect.poll(text).toMatch(/- \[ \] buy milk\n$/);
  await page.keyboard.type("after");
  await expect.poll(text).toMatch(/- \[ \] buy milk\nafter$/);
});
