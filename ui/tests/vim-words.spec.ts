import { test, expect } from "@playwright/test";
import { tokens, moveToWord } from "../src/lib/editor/vim-words";
import { openFile } from "./open";

// Vim's word motions with TeX words (lib/editor/vim-words.ts): `\alpha` one word where TeX is spoken, the library's
// results everywhere else.

const TEX = () => true;
const NONE = () => false;
const cut = (line: string, tex = TEX) => tokens(line, tex).filter((t) => t.kind !== "space").map((t) => line.slice(t.from, t.to));
/** Where a motion lands from column `ch` of a one- or two-line text. */
function move(text: string, ch: number, key: "w" | "b" | "e" | "ge", tex = TEX, line = 0) {
  const lines = text.split("\n");
  const at = moveToWord((n) => lines[n], () => tex, lines.length - 1, { line, ch }, 1, key === "w" || key === "e", key === "e" || key === "ge", false);
  return at && [at.line, at.ch];
}

test("a command is one word of its own; \\\\ and \\, stay punctuation", () => {
  expect(cut("a\\beta + \\frac{x}{y}")).toEqual(["a", "\\beta", "+", "\\frac", "{", "x", "}{", "y", "}"]);
  expect(cut("x \\\\ y \\, z")).toEqual(["x", "\\\\", "y", "\\,", "z"]);
  expect(cut("a\\beta", NONE)).toEqual(["a", "\\", "beta"]); // outside TeX, as the library
});

test("w, b, e and ge over TeX, and as the library outside it", () => {
  const s = "\\alpha + \\beta";
  expect(move(s, 0, "w")).toEqual([0, 7]); // dw deletes "\alpha "
  expect(move(s, 9, "b")).toEqual([0, 7]);
  expect(move(s, 0, "e")).toEqual([0, 5]);
  expect(move(s, 9, "ge")).toEqual([0, 7]);
  expect(move(s, 0, "w", NONE)).toEqual([0, 1]);
  expect(move("foo.bar baz", 0, "w", NONE)).toEqual([0, 3]);
  expect(move("foo bar", 4, "w", NONE)).toEqual([0, 7]); // the last word: to the end
  expect(move("foo\nbar", 1, "w", NONE)).toEqual([1, 0]);
  expect(move("foo\n\nbar", 0, "w", NONE)).toEqual([1, 0]); // an empty line is a word
  expect(move("foo\nbar", 0, "b", NONE, 1)).toEqual([0, 0]);
});

test.describe("in the editor", () => {
test("in the editor: dw on a formula's command takes the backslash with it; the block cursor is filled, hollow away from the editor", async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch(), body = await res.json();
    body.config.editor.vim_keys = "classic";
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await openFile(page, "hubbard.md");
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  const last = () => page.evaluate(() => (window as unknown as { __atlas: { editor(): { text: string } | null } }).__atlas.editor()?.text.trimEnd().split("\n").pop());
  await page.keyboard.type("Go");
  await page.keyboard.insertText("x $\\alpha + \\beta$ a\\b");
  await page.keyboard.press("Escape");
  await page.keyboard.type("0f\\dw");
  await expect.poll(last).toBe("x $+ \\beta$ a\\b");
  await page.keyboard.type("$F\\dw"); // outside the formula a backslash is punctuation, as in Vim
  await expect.poll(last).toBe("x $+ \\beta$ ab");

  const cursor = page.locator(".cm-fat-cursor").first();
  const look = () => cursor.evaluate((e) => { const s = getComputedStyle(e); return { filled: s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundImage === "none", edge: s.boxShadow !== "none" }; });
  expect(await look()).toEqual({ filled: true, edge: false });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await cursor.screenshot({ path: `../target/snip/vim-cursor-${theme}.png` });
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect.poll(look, "away from the editor: hollow, its edge drawn").toEqual({ filled: false, edge: true });
});
});
