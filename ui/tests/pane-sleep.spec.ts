import { test, expect, type Page } from "@playwright/test";

// A background tab leaves the page and
// keeps its place; past the working set it sleeps (unmounted) and wakes where it was. And a note reopened later
// opens where it was left.
const H = { "x-atlas": "1" };
const long = (n: number) => Array.from({ length: 300 }, (_, i) => `Line ${i + 1} of note ${n}.`).join("\n\n") + "\n";
const editorTop = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>(".atlas-pane-editor:not(.asleep) .cm-scroller")?.scrollTop ?? -1);
const atlas = <T>(page: Page, f: string, ...a: unknown[]) => page.evaluate(([f, a]) => (window as unknown as Record<string, Record<string, (...x: unknown[]) => T>>).__atlas[f as string](...(a as unknown[])), [f, a] as const);

test("a note reopened, or woken from sleep, is where it was left", async ({ page, request }) => {
  for (let i = 0; i < 11; i++) await request.put("/api/file", { headers: H, data: { path: `sleep/n${i}.md`, text: long(i) } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();

  // scrolled far down in n0
  await atlas(page, "open", "sleep/n0.md");
  const scroller = page.locator(".atlas-pane-editor .cm-scroller").first();
  await expect(page.locator(".cm-line", { hasText: "Line 1 of note 0." })).toBeVisible();
  await scroller.evaluate((el) => { el.scrollTop = 4000; });
  await page.waitForTimeout(700); // the place is kept 500 ms after the last scroll
  const at = await editorTop(page);
  expect(at).toBeGreaterThan(3000);

  // ten other notes: n0 goes past the working set, and is put to sleep
  for (let i = 1; i < 11; i++) { await atlas(page, "open", `sleep/n${i}.md`); await page.waitForTimeout(150); }
  const slept = await atlas<number>(page, "hibernate", 0);
  expect(slept).toBeGreaterThan(0);
  expect((await atlas<{ asleep: number }>(page, "sleeping")).asleep).toBe(slept);

  // shown again: mounted, at its place
  await atlas(page, "open", "sleep/n0.md");
  await expect.poll(() => editorTop(page), { timeout: 5000 }).toBeGreaterThan(at - 200);

  // closed and opened again: the same
  await page.keyboard.press("Control+w");
  await atlas(page, "open", "sleep/n0.md");
  await expect.poll(() => editorTop(page), { timeout: 5000 }).toBeGreaterThan(at - 200);
});

test("a PDF tab switched away and back keeps its scroll (it leaves the page while hidden)", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const files = await page.evaluate(async () => (await (await fetch("/api/files", { headers: { "x-atlas": "1" } })).json()) as string[]);
  const pdf = files.find((f) => f.endsWith(".pdf"));
  test.skip(!pdf, "no PDF in the test vault");
  await atlas(page, "open", pdf!);
  const viewer = page.locator(".atlas-pane-pdf .viewer-container").first();
  await expect(viewer.locator(".page").first()).toBeVisible({ timeout: 15_000 });
  const max = await viewer.evaluate((el) => el.scrollHeight - el.clientHeight);
  test.skip(max < 200, "the PDF is too short to scroll");
  await viewer.evaluate((el) => { el.scrollTop = Math.min(600, el.scrollHeight - el.clientHeight); });
  const at = await viewer.evaluate((el) => el.scrollTop);
  await page.waitForTimeout(300);
  await atlas(page, "open", "FOCUS.md");
  await expect(page.locator(".atlas-pane-pdf")).toHaveCount(0); // out of the page, not hidden in it
  await atlas(page, "open", pdf!);
  await expect.poll(() => page.locator(".atlas-pane-pdf .viewer-container").first().evaluate((el) => el.scrollTop)).toBeGreaterThan(at - 50);
});
