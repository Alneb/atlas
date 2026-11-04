import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";
import { textPdf } from "./fixtures/pdf";

// headless Chromium hides scrollbars unless asked: this file needs real ones
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

// The scrollbar belongs to the scroll box, so a press on it reached the pan (its target is the box, no page part):
// the pan then dragged the pages against the thumb, and the view sprang back to where the press began.
test("a PDF's scrollbar drags where it is dropped, and a deep page stays put", async ({ page }) => {
  const pdf = "pdfs/scrollbar.pdf";
  mkdirSync(join(WS, "pdfs"), { recursive: true });
  writeFileSync(join(WS, pdf), textPdf(Array.from({ length: 20 }, (_, i) => ({ lines: [`Page ${i + 1}`] }))));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  await page.evaluate((p) => (window as unknown as { __atlas: { open(p: string): void } }).__atlas.open(p), pdf);
  const viewer = page.locator(".atlas-pane-pdf .viewer-container").first();
  await expect(viewer.locator(".page").first()).toBeVisible({ timeout: 15_000 });
  const bar = await viewer.evaluate((el: HTMLElement) => el.offsetWidth - el.clientWidth - el.clientLeft * 2);
  test.skip(bar <= 0, "overlay scrollbars: nothing to press on");
  const top = () => viewer.evaluate((el) => el.scrollTop);

  // a deep page, scrolled to, stays there once its pages are drawn and its position is kept
  await viewer.evaluate((el) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.6; });
  const deep = await top();
  await page.waitForTimeout(1200);
  expect(Math.abs((await top()) - deep)).toBeLessThan(2);

  // the thumb dragged a long way, back and forth, then dropped: the view stays where it is dropped, also once the
  // pointer moves on over the pages (a pan left holding the press pulled it back to where the drag began)
  const box = (await viewer.boundingBox())!;
  const thumb = await viewer.evaluate((el) => (el.scrollTop / el.scrollHeight) * el.clientHeight + ((el.clientHeight / el.scrollHeight) * el.clientHeight) / 2);
  const x = box.x + box.width - bar / 2, y = box.y + thumb;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 150, { steps: 10 });
  await page.mouse.move(x, y - 250, { steps: 15 });
  await page.mouse.move(x, y + 60, { steps: 10 });
  // the press was the scrollbar's alone: no pan pulling the pages the other way
  expect(await viewer.evaluate((el) => el.classList.contains("panning"))).toBe(false);
  await page.mouse.up();
  const dropped = await top();
  expect(dropped).toBeGreaterThan(deep + 100);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await page.mouse.move(box.x + 40, box.y + 40, { steps: 10 });
  await page.waitForTimeout(1200);
  expect(Math.abs((await top()) - dropped)).toBeLessThan(2);
  expect(await page.evaluate(() => String(getSelection() ?? ""))).toBe("");
});
