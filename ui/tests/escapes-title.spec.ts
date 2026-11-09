import { test, expect } from "@playwright/test";
import { openFile } from "./open";

// A backslash escape reads as the character alone (Obsidian's live preview), the backslash back under the caret; and a
// long name wraps in the inline title instead of being cut off (a phone showed "A Brief History of Tru").
test("escapes show their character; a long inline title wraps", async ({ page, request }) => {
  const name = "A Brief History of True Names and Magic in Folklore and Fantasy";
  await request.put("/api/file", { headers: { "x-atlas": "1" }, data: { path: `notes/${name}.md`, text: "first line\n\nhe \\*invented\\* it \\# not a heading\n" } });
  await page.setViewportSize({ width: 420, height: 800 });
  await page.goto("/");
  await openFile(page, `${name}.md`);
  const line = page.locator(".cm-line", { hasText: "invented" });
  await expect(line).toHaveText("he *invented* it # not a heading");
  const title = page.locator(".cm-editor .inline-title");
  await expect(title).toHaveValue(name);
  const box = await title.evaluate((el: HTMLTextAreaElement) => ({ h: el.clientHeight, sh: el.scrollHeight, lh: parseFloat(getComputedStyle(el).lineHeight) }));
  expect(box.h, "wrapped onto more than one line, all of it shown").toBeGreaterThan(box.lh * 1.5);
  expect(box.sh).toBeLessThanOrEqual(box.h + 1);
  // the caret on an escape: its backslash shows, to edit it; the others stay hidden
  await line.click();
  await page.keyboard.press("Home");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect(page.locator(".cm-line", { hasText: "invented" })).toHaveText("he \\*invented* it # not a heading");
});
