import { test, expect } from "@playwright/test";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// A scanned book in the PDF pane (scanned books were seen slow to draw and scroll in WebKit): pages that are big JPEG
// pictures. A measurement, not a gate: ATLAS_PERF=1 and ATLAS_PERF_SCAN=<a scanned PDF> run it (any engine:
// `--browser=webkit` too); it prints `[perf]` lines — the first page drawn, then scrolling through the book.
test.skip(!process.env.ATLAS_PERF || !process.env.ATLAS_PERF_SCAN, "a measurement: ATLAS_PERF=1 ATLAS_PERF_SCAN=<scanned.pdf>");

test("a scanned book: the first page, and scrolling through it", async ({ page, browserName }, info) => {
  test.setTimeout(180_000);
  mkdirSync(join(WS, "books"), { recursive: true });
  copyFileSync(process.env.ATLAS_PERF_SCAN!, join(WS, "books/perf-scan.pdf"));
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  const t0 = Date.now();
  await page.evaluate(() => (window as unknown as { __atlas: { open(p: string): void } }).__atlas.open("books/perf-scan.pdf"));
  const pane = page.locator(".pdf-pane").last();
  await expect(pane.locator(".page canvas").first()).toBeVisible({ timeout: 60_000 });
  const first = Date.now() - t0;
  await pane.locator(".page").first().screenshot({ path: info.outputPath(`scan-page1-${browserName}.png`) });
  // the gaps between frames while the book is scrolled a screen at a time, and the pages drawn by the end
  await page.evaluate(() => {
    const w = window as unknown as { gaps: number[]; stop?: boolean };
    w.gaps = [];
    let last = performance.now();
    const tick = (now: number) => { if (now - last > 50) w.gaps.push(Math.round(now - last)); last = now; if (!w.stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const box = await pane.locator(".viewer-container").boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const s0 = Date.now();
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
  const scroll = Date.now() - s0;
  await page.waitForTimeout(1500);
  const gaps = await page.evaluate(() => { const w = window as unknown as { gaps: number[]; stop?: boolean }; w.stop = true; return w.gaps; });
  const drawn = await pane.locator(".page canvas").count();
  const worst = Math.max(0, ...gaps);
  // pages far apart, each from the jump to its drawing (none drawn before): the median is what a page costs
  const jumps: number[] = [];
  for (const n of [28, 3, 24, 7, 16]) {
    const j0 = Date.now();
    await pane.locator(".page-in").fill(String(n));
    await pane.locator(".page-in").press("Enter");
    await expect(pane.locator(`.page[data-page-number="${n}"] canvas`).first()).toBeVisible({ timeout: 60_000 });
    jumps.push(Date.now() - j0);
  }
  console.log(`[perf] ${browserName}: a page drawn after a jump: ${jumps.join(", ")} ms (median ${[...jumps].sort((x, y) => x - y)[2]} ms)`);
  console.log(`[perf] ${browserName}: first page ${first} ms; 30 wheel steps in ${scroll} ms; frames over 50 ms apart: ${gaps.length} (worst ${worst} ms, total ${gaps.reduce((a, b) => a + b, 0)} ms); canvases at the end: ${drawn}`);
});
