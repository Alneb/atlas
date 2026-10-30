import { test, expect, type Page } from "@playwright/test";
import { openFile } from "./open";

// "make two vim modes, classic one, but also one where visual deos not interfere wuth crtl x y c etc
// and it works in a normal way": `[editor] vim_keys = "desktop"`. The setting is served to the page
// (the shared test vault's config is not changed).
const text = (page: Page) => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string; vim: string } | null } }).__atlas.editor()?.text ?? "");
const mode = (page: Page) => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string; vim: string } | null } }).__atlas.editor()?.vim ?? "");

async function open(page: Page, vimKeys: "classic" | "desktop") {
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.editor.vim_keys = vimKeys;
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "hubbard.md");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
}

test("desktop keys: cut, paste, undo, redo and select all work from visual and normal mode", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "desktop");
  await page.keyboard.type("Goalpha beta");   // a new last line
  await page.keyboard.press("Escape");
  const last = async () => (await text(page)).trimEnd().split("\n").pop();
  await expect.poll(last).toBe("alpha beta");

  // visual mode: select the last word, Ctrl+X cuts it (vim would have changed a number)
  await page.keyboard.type("viw");
  await expect.poll(() => mode(page)).toBe("VISUAL");
  await page.keyboard.press("Control+x");
  await expect.poll(last).toBe("alpha");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("beta");
  await expect.poll(() => mode(page), "nothing is selected any more: back to normal").toBe("NORMAL");

  // normal mode: Ctrl+V pastes (vim would have started a block selection)
  await page.keyboard.press("Control+v");
  await expect.poll(last).toContain("beta");
  await expect.poll(() => mode(page)).not.toBe("V-BLOCK");

  // Ctrl+Z / Ctrl+Y: undo and redo the paste
  await page.keyboard.press("Control+z");
  await expect.poll(last).toBe("alpha");
  await page.keyboard.press("Control+y");
  await expect.poll(last).toContain("beta");

  // Ctrl+A selects everything (vim would have added one to a number)
  await page.keyboard.press("Control+a");
  const all = await page.evaluate(() => getSelection()?.toString().length ?? 0);
  expect(all).toBeGreaterThan(20);
});

test("classic keys: Ctrl+V is still vim's block selection", async ({ page }) => {
  await open(page, "classic");
  await page.keyboard.press("Control+v");
  await expect.poll(() => mode(page)).toBe("V-BLOCK");
});
