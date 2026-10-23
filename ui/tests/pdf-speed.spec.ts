import { test, expect } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { WS } from "../playwright.config";

// How fast a big PDF opens and scrolls ("PDFs slow to open / scroll jank"), measured on the user's
// own books. A measurement, not a check by default: ATLAS_PDF_SPEED=1 runs it and prints the numbers.
const PAPERS = process.env.ATLAS_TEST_PAPERS ?? "";
const BOOKS = ["mahan2000manyparticle", "altland2023condensed"].filter((k) => existsSync(join(PAPERS, k)));
test.skip(!process.env.ATLAS_PDF_SPEED || !BOOKS.length, "set ATLAS_PDF_SPEED=1 (needs those books in ATLAS_TEST_PAPERS)");

// copied once, and the core given time to index them: a book indexed during the open measured the index, not the PDF
test.beforeAll(async () => {
  mkdirSync(join(WS, "speed"), { recursive: true });
  for (const key of BOOKS) {
    const src = join(PAPERS, key, readdirSync(join(PAPERS, key)).find((f) => f.endsWith(".pdf"))!);
    copyFileSync(src, join(WS, `speed/${key}.pdf`));
  }
  await new Promise((r) => setTimeout(r, 15_000));
});

for (const [i, key] of [...BOOKS, ...BOOKS].entries()) {
  test(`speed: ${key} #${i}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await page.getByText("Finish the GW notes.").waitFor();
    // long tasks and frame gaps, from now on
    await page.evaluate(() => {
      const w = window as unknown as { perf: { long: number[]; frames: number[] } };
      w.perf = { long: [], frames: [] };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.perf.long.push(e.duration); }).observe({ type: "longtask", buffered: false }); } catch { /* WebKit has no longtask */ }
      let last = performance.now();
      const tick = (t: number) => { w.perf.frames.push(t - last); last = t; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.keyboard.press("Control+p");
    await page.keyboard.type(`${key}.pdf`);
    await expect(page.getByTestId("palette").getByText(`${key}.pdf`).first()).toBeVisible();
    const net = { n: 0, bytes: 0, last: 0, first: 0 };
    page.on("request", (r) => { if (r.url().includes("/api/raw") && !net.first) net.first = Date.now(); });
    page.on("response", async (r) => { if (r.url().includes("/api/raw")) { net.n++; net.last = Date.now(); net.bytes += Number(r.headers()["content-length"] ?? 0); } });
    const t0 = Date.now();
    await page.keyboard.press("Enter");
    const first = page.locator('.pdf-pane .page[data-page-number="1"] canvas');
    await first.waitFor({ timeout: 60_000 });
    await page.waitForFunction(() => document.querySelector('.pdf-pane .page[data-page-number="1"]')?.getAttribute("data-loaded") === "true", null, { timeout: 60_000 });
    const open = Date.now() - t0;
    const netMs = net.last - t0, netFirst = net.first - t0, netN = net.n, netMB = (net.bytes / 1e6).toFixed(1);
    const pages = await page.getByRole("textbox", { name: "Page", exact: true }).evaluate((el) => el.parentElement?.textContent ?? "");
    await page.evaluate(() => { const w = window as unknown as { perf: { long: number[]; frames: number[] } }; w.perf.long = []; w.perf.frames = []; });
    // a reader's scroll: 60 wheel notches, then a jump far ahead
    const box = (await page.locator(".pdf-pane .viewer-container").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const t1 = Date.now();
    for (let i = 0; i < 60; i++) { await page.mouse.wheel(0, 240); await page.waitForTimeout(16); }
    const scroll = Date.now() - t1;
    const r = await page.evaluate(() => {
      const w = window as unknown as { perf: { long: number[]; frames: number[] } };
      const f = w.perf.frames.slice().sort((a, b) => a - b);
      return { long: w.perf.long.length, longMs: Math.round(w.perf.long.reduce((a, b) => a + b, 0)), frames: f.length, p50: Math.round(f[f.length >> 1] ?? 0), p95: Math.round(f[Math.floor(f.length * 0.95)] ?? 0), worst: Math.round(f[f.length - 1] ?? 0), over50: f.filter((x) => x > 50).length };
    });
    console.log(`[pdf-speed] ${key} ${test.info().project.name || "chromium"}: open→page 1 drawn ${open} ms (${pages.trim()}; raw: first asked at ${netFirst} ms, ${netN} responses, ${netMB} MB, last at ${netMs} ms); scroll 60 notches in ${scroll} ms: frames ${r.frames}, p50 ${r.p50} ms, p95 ${r.p95} ms, worst ${r.worst} ms, >50 ms ${r.over50}; long tasks ${r.long} (${r.longMs} ms)`);
  });
}
