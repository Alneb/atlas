import { test, expect, type Page } from "@playwright/test";

// Speed on a phone (docs/guides/MOBILE.md, "Speed on a phone"): a phone-sized page with the CPU slowed as a phone runs
// it (Chromium's CPU throttling: 4× a mid-range phone, 6× a slow one), measuring what a person waits for — a big
// note opening, a key typed into it, Files and Search opening. A measurement, not a gate: run with ATLAS_PERF=1; the
// numbers are printed (`[perf]`) and kept in MOBILE.md. The bounds only catch a regression by an order of magnitude.
test.skip(!process.env.ATLAS_PERF, "a measurement: ATLAS_PERF=1 runs it");
test.use({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });

const H = { "x-atlas": "1" };
const BIG = "notes/perf-big.md";
const body = Array.from({ length: 1000 }, (_, i) => (i % 10 === 0 ? `## Part ${i / 10}` : `Line ${i} with $x^${i % 9}$, **bold**, a [[hubbard]] link and #tag${i % 7}.`)).join("\n\n");

/** ms from `act` to two frames after `ready` holds, as the person sees it. */
async function timed(page: Page, act: () => Promise<unknown>, ready: () => Promise<unknown>): Promise<number> {
  const t = await page.evaluate(() => performance.now());
  await act();
  await ready();
  return page.evaluate((t0) => new Promise<number>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now() - t0)))), t);
}

/** Each key from its input event to the frame after next, in the page's own clock. */
async function keyLatency(page: Page, text: string): Promise<number[]> {
  await page.evaluate(() => {
    const w = window as unknown as { keyMs: number[] };
    w.keyMs = [];
    document.addEventListener("beforeinput", () => {
      const t = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => w.keyMs.push(performance.now() - t)));
    }, true);
  });
  await page.keyboard.type(text, { delay: 120 });
  await page.waitForTimeout(500);
  return page.evaluate(() => (window as unknown as { keyMs: number[] }).keyMs);
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
const worst = (xs: number[]) => Math.max(...xs);

for (const rate of [1, 4, 6]) {
  test(`a phone at ${rate}× CPU: a big note, typing, Files, Search`, async ({ page, request }) => {
    test.setTimeout(120_000);
    await request.put("/api/file", { headers: H, data: { path: BIG, text: `# Perf big\n\n${body}\n` } });
    const cdp = await page.context().newCDPSession(page);
    await page.goto("/");
    await expect(page.locator(".phone-bar")).toBeVisible();
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const open = await timed(page, () => page.evaluate((p) => (window as unknown as { __atlas: { open(p: string): void } }).__atlas.open(p), BIG), () => expect(page.locator(".cm-content", { hasText: "Perf big" })).toBeVisible({ timeout: 60_000 }));
    await page.locator(".cm-line", { hasText: "Line 1 with" }).first().click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("A"); // vim (the test vault): append at the end of the line
    const keys = await keyLatency(page, " typed on a phone");
    await page.keyboard.press("Escape");
    const files = await timed(page, () => page.locator(".phone-bar").getByRole("button", { name: "Files" }).click(), () => expect(page.locator(".pf .row").first()).toBeVisible({ timeout: 60_000 }));
    const search = await timed(page, () => page.locator(".phone-bar").getByRole("button", { name: "Search" }).click(), () => expect(page.getByRole("textbox", { name: "Search", exact: true }).first()).toBeVisible({ timeout: 60_000 }));
    console.log(`[perf] ${rate}× CPU: open the 1000-line note ${Math.round(open)} ms; a key median ${Math.round(median(keys))} ms, worst ${Math.round(worst(keys))} ms (${keys.length} keys); Files ${Math.round(files)} ms; Search ${Math.round(search)} ms`);
    expect(median(keys)).toBeLessThan(100 * rate);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await request.post(`/api/fs/trash?path=${encodeURIComponent(BIG)}`, { headers: H });
  });
}
