import { test, expect, type Page } from "@playwright/test";

// Selecting in a shell as any terminal does: a drag selects, a double-click selects the word under it — also after a
// divider drag whose end was lost (`body.atlas-resizing` left on took the pointer from terminals: resize-guard.ts).
const selection = (page: Page) => page.evaluate(() => getSelection()?.toString() ?? "");

test("a drag and a double-click select text in a shell, even after a divider drag lost its end", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+`");
  const screen = page.locator(".xterm-screen").first();
  await expect(screen).toBeVisible();
  await page.waitForTimeout(1000); // the shell's first prompt
  await page.keyboard.type("printf '\\033[2J\\033[Hzzalpha zzbeta\\n'\n"); // cleared, the words on the first row
  await page.waitForTimeout(800);
  // a divider drag that never saw its pointerup, then any press elsewhere
  await page.evaluate(() => document.body.classList.add("atlas-resizing"));
  await page.mouse.click(5, 5);
  await expect(page.locator("body.atlas-resizing")).toHaveCount(0);

  const box = (await screen.boundingBox())!;
  const cw = await page.evaluate(() => { const m = document.querySelector(".xterm-char-measure-element") as HTMLElement; return m.getBoundingClientRect().width / Math.max(1, m.textContent!.length); });
  const y = box.y + 8; // the first row
  await page.mouse.dblclick(box.x + cw * 10.5, y);
  await expect.poll(() => selection(page)).toBe("zzbeta");
  await page.mouse.move(box.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + cw * 6.5, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => selection(page)).toMatch(/^zzalph/);
});
