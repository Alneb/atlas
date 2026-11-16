import { test, expect, type Page } from "@playwright/test";

// Selecting in a shell as any terminal does: a drag selects, a double-click selects the word under it — also after a
// divider drag whose end was lost (`body.atlas-resizing` left on took the pointer from terminals: resize-guard.ts).
const selection = (page: Page) => page.evaluate(() => getSelection()?.toString() ?? "");
/** How far the selection's painted colour is from the terminal's background (the largest of R, G, B; 0: none drawn). */
const painted = (page: Page) => page.evaluate(() => {
  const mark = document.querySelector(".xterm-selection div"), pane = document.querySelector(".term-pane");
  if (!mark || !pane) return 0;
  const rgb = (el: Element) => (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const [a, b] = [rgb(mark), rgb(pane)];
  return Math.max(...a.map((v, i) => Math.abs(v - b[i])));
});

test("a drag and a double-click select text in a shell, even after a divider drag lost its end", async ({ page }) => {
  // a chosen accent (this browser's own look, so no other test sees it) makes the selection's token a color-mix(),
  // which xterm could not read: its fallback was a white haze, invisible on the light background
  await page.addInitScript(() => localStorage.setItem("atlas.device-look.v1", JSON.stringify({ own: true, seeded: true, ui: { accent: "#c0392b" } })));
  await page.goto("/");
  await page.keyboard.press("Control+`");
  const screen = page.locator(".xterm-screen").first();
  await expect(screen).toBeVisible();
  // the shell's first prompt, then the keys to the terminal itself: a fixed wait let the line be typed before either,
  // and the screen held only the prompt (CI)
  await screen.locator(".xterm-rows").getByText(/\S/).first().waitFor({ timeout: 15_000 });
  await screen.click();
  await page.keyboard.type("printf '\\033[2J\\033[Hzzalpha zzbeta\\n'\n"); // cleared, the words on the first row
  // the words' own row, wherever it is drawn now (a late prompt or a resize may scroll the screen)
  const words = screen.locator(".xterm-rows > div").filter({ hasText: /^\s*zzalpha\szzbeta\s*$/ });
  await expect(words).toHaveCount(1, { timeout: 10_000 });
  // a divider drag that never saw its pointerup, then any press elsewhere
  await page.evaluate(() => document.body.classList.add("atlas-resizing"));
  await page.mouse.click(5, 5);
  await expect(page.locator("body.atlas-resizing")).toHaveCount(0);

  const box = (await screen.boundingBox())!;
  const cw = await page.evaluate(() => { const m = document.querySelector(".xterm-char-measure-element") as HTMLElement; return m.getBoundingClientRect().width / Math.max(1, m.textContent!.length); });
  const rowY = async () => { const r = (await words.boundingBox())!; return r.y + r.height / 2; };
  let y = 0;
  await expect(async () => {
    y = await rowY();
    await page.mouse.dblclick(box.x + cw * 10.5, y);
    expect(await selection(page)).toBe("zzbeta");
  }).toPass({ timeout: 10_000 });
  // …and drawn, in either theme
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    await expect.poll(() => painted(page), `the selection shows in the ${theme} theme`).toBeGreaterThan(20);
    await screen.screenshot({ path: `../target/terminal-select-${theme}.png` });
  }
  await page.mouse.move(box.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + cw * 6.5, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => selection(page)).toMatch(/^zzalph/);
});
