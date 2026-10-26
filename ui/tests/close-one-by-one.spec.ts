import { test, expect } from "@playwright/test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// Closing tabs one after another by hand (the shown one's ×, again and again): the UI used
// to stutter. Measures the gaps between frames while it closes (any engine: `--browser=webkit` too).
const H = { "x-atlas": "1" };
test("closing the shown tab again and again stays smooth", async ({ page, request }) => {
  const body = Array.from({ length: 400 }, (_, i) => `Line ${i} with $x^${i}$ and **bold** [[hubbard]]`).join("\n\n");
  const names = Array.from({ length: 8 }, (_, i) => `notes/closing-${i}.md`);
  for (const n of names) await request.put("/api/file", { headers: H, data: { path: n, text: `# ${n}\n\n${body}\n` } });
  await page.goto("/");
  await page.getByText("Finish the GW notes.").waitFor();
  for (const n of names) {
    await page.request.post("/api/cmd/open", { headers: H, data: { args: { path: n } } });
    await expect(page.locator(".cm-editor:visible").first()).toBeVisible();
  }
  const tabs = page.getByTestId("sidebar").locator(".tab", { hasText: "closing-" });
  await expect(tabs).toHaveCount(names.length);
  // the gaps between frames over 50 ms: what a stutter is, in every engine (WebKit reports no long tasks)
  await page.evaluate(() => {
    const w = window as unknown as { longs: number[]; stopFrames?: boolean };
    w.longs = [];
    let last = performance.now();
    const tick = (now: number) => { if (now - last > 50) w.longs.push(Math.round(now - last)); last = now; if (!w.stopFrames) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  for (let i = names.length; i > 0; i--) {
    await page.getByTestId("sidebar").locator(".tab.active .tab-close").first().dispatchEvent("mousedown", { button: 0 });
    await expect(tabs).toHaveCount(i - 1);
  }
  const longs = await page.evaluate(() => { const w = window as unknown as { longs: number[]; stopFrames?: boolean }; w.stopFrames = true; return w.longs; });
  console.log(`[close] ${names.length} closes in ${Date.now() - t0} ms; frames over 50 ms apart: ${JSON.stringify(longs)}`);
  expect(Math.max(0, ...longs)).toBeLessThan(400);
  for (const n of names) rmSync(join(WS, n), { force: true }); // the shared workspace: other specs count its notes (graph)
});
