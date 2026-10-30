import { test, type Page } from "@playwright/test";

// The start: from navigation to a usable Home (the Today pane's focus text drawn), with the CPU slowed 4× so the
// script cost shows. A measurement, not a gate: ATLAS_PERF=1 runs it; it prints `[perf]` lines — the median of a few
// loads, the script bytes the page fetched before Home and the main thread's script time.
test.skip(!process.env.ATLAS_PERF, "a measurement: ATLAS_PERF=1 runs it");

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;

async function load(page: Page): Promise<{ home: number; js: number; scripts: number; task: number; style: number; layout: number }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Performance.enable");
  await page.goto("/");
  await page.getByText("Finish the GW notes.").first().waitFor();
  const home = await page.evaluate(() => new Promise<number>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now())))));
  const { js, scripts, list } = await page.evaluate((t) => {
    const rs = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((e) => e.initiatorType !== "fetch" && /\.js(\?|$)/.test(e.name) && e.startTime < t);
    return { js: rs.reduce((a, e) => a + (e.decodedBodySize || 0), 0), scripts: rs.length, list: rs.map((e) => [e.name.replace(/^.*\//, ""), Math.round(e.decodedBodySize / 1024)]) };
  }, home);
  if (process.env.ATLAS_PERF_LIST) console.log(await page.evaluate((t) => (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
    .filter((e) => e.startTime < t && !/\.(js|css|woff2?)$/.test(e.name)).map((e) => `${e.startTime.toFixed(0)}→${e.responseEnd.toFixed(0)} ${e.name.replace(/^https?:\/\/[^/]+/, "")}`).join("\n"), home));
  if (process.env.ATLAS_PERF_LIST) console.log(list.sort((a, b) => +b[1] - +a[1]).map((x) => x.join(" ")).join("\n"));
  const m = await cdp.send("Performance.getMetrics");
  const metric = (n: string) => (m.metrics.find((x) => x.name === n)?.value ?? 0) * 1000;
  const task = metric("ScriptDuration"), style = metric("RecalcStyleDuration"), layout = metric("LayoutDuration");
  await cdp.detach();
  return { home, js, scripts, task, style, layout };
}

test("start: navigation to a usable Home", async ({ browser }) => {
  test.setTimeout(180_000);
  const runs = [];
  for (let i = 0; i < 7; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    runs.push(await load(page));
    await ctx.close();
  }
  const r = runs.slice(1); // the first load warms the server's caches
  console.log(`[perf] start (CPU 4×): Home after ${median(r.map((x) => x.home)).toFixed(0)} ms median [${r.map((x) => x.home.toFixed(0)).join(", ")}]; ` +
    `script ${median(r.map((x) => x.task)).toFixed(0)} ms, style ${median(r.map((x) => x.style)).toFixed(0)} ms, layout ${median(r.map((x) => x.layout)).toFixed(0)} ms; ${r[0].scripts} scripts, ${(r[0].js / 1024).toFixed(0)} KiB of JS before Home`);
});
