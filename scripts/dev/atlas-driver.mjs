// Drives the Atlas page in Chromium for the measuring scripts (profile-longday.mjs, leak-kinds.mjs): launch on a
// core serving a COPY of a vault, open/close tabs through window.__atlas (App.svelte), and read what the page
// holds (heap after a GC, DOM nodes, listeners, live intervals, long tasks) through CDP.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hot } from "./cpuprofile.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(join(here, "../../ui/package.json"))("playwright");
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".wasm": "application/wasm", ".json": "application/json", ".mjs": "text/javascript", ".bcmap": "application/octet-stream", ".pfb": "application/octet-stream", ".ttf": "font/ttf" };

export const pct = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };

/** Opens Atlas at `url` (a core on a vault COPY); `dist` serves that build of the interface instead of the core's. */
export async function launchAtlas({ url, dist, tag = "probe", width = 1500, height = 900 }) {
  if (!url) throw new Error("ATLAS_URL must point at a core serving a COPY of a vault");
  const log = (...a) => console.log(`[${tag} ${new Date().toISOString().slice(11, 19)}]`, ...a);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height } });
  if (dist) await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith("/api/") || u.pathname.startsWith("/v/")) return r.continue();
    const f = join(dist, u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname));
    return existsSync(f) && !f.endsWith("/") ? r.fulfill({ body: readFileSync(f), contentType: TYPES[extname(f)] ?? "application/octet-stream" }) : r.continue();
  });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  // counters the page keeps for us: live intervals, long tasks
  await page.addInitScript(() => {
    const w = window, live = new Set();
    const si = w.setInterval.bind(w), ci = w.clearInterval.bind(w);
    w.setInterval = (...a) => { const id = si(...a); live.add(id); return id; };
    w.clearInterval = (id) => { live.delete(id); ci(id); };
    w.__probe = { intervals: () => live.size, long: [] };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__probe.long.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true }); } catch {}
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Profiler.enable");
  const t0 = Date.now();
  await page.goto(url);
  await page.locator(".dv-groupview").first().waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => !!window.__atlas?.open, null, { timeout: 30_000 });
  await page.waitForTimeout(4000); // plugins, the home page's blocks
  log(`started in ${Date.now() - t0} ms`);

  const atlas = {
    browser, page, cdp, errs, log,
    throttle: (rate) => cdp.send("Emulation.setCPUThrottlingRate", { rate }),
    files: () => page.evaluate(async () => (await (await fetch("/api/files", { headers: { "x-atlas": "1" } })).json())),
    /** Opens (or brings forward) a path; ms from the call to two frames later, as the user would see it. */
    switchTo: (path) => page.evaluate(async (p) => { const t = performance.now(); window.__atlas.open(p); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))); return performance.now() - t; }, path),
    run: (id) => page.evaluate((c) => window.__atlas.run(c), id),
    panes: () => page.evaluate(() => window.__atlas.panes()),
    close: (id) => page.evaluate((x) => window.__atlas.close(x), id),
    /** Closes every pane but the first. */
    async closeAllButOne() { for (const p of (await atlas.panes()).slice(1)) await atlas.close(p.id); },
    /** What the page holds right now, after a full GC; printed and returned. */
    async snapshot(label) {
      await cdp.send("HeapProfiler.collectGarbage");
      const heap = await cdp.send("Runtime.getHeapUsage");
      const dom = await cdp.send("Memory.getDOMCounters");
      const p = await page.evaluate(() => { const l = window.__probe.long.splice(0); return { intervals: window.__probe.intervals(), long: l, panes: window.__atlas?.panes().length ?? 0 }; });
      const row = { label, heapMB: +(heap.usedSize / 1048576).toFixed(1), nodes: dom.nodes, listeners: dom.jsEventListeners, intervals: p.intervals, panes: p.panes, longTasks: p.long.length, longMax: Math.max(0, ...p.long), longSum: p.long.reduce((a, b) => a + b, 0) };
      log(`${label.padEnd(26)} heap ${String(row.heapMB).padStart(6)} MB · nodes ${String(row.nodes).padStart(6)} · listeners ${String(row.listeners).padStart(5)} · intervals ${String(row.intervals).padStart(3)} · panes ${String(row.panes).padStart(3)} · long tasks ${row.longTasks} (max ${row.longMax} ms, Σ ${row.longSum} ms)`);
      return row;
    },
    /** Runs `fn` under the CPU profiler when `dir` is given: writes <dir>/<name>.cpuprofile, prints its hottest functions. */
    async profiled(dir, name, fn) {
      if (!dir) return fn();
      await cdp.send("Profiler.start");
      try { return await fn(); } finally {
        const { profile } = await cdp.send("Profiler.stop");
        writeFileSync(join(dir, `${name}.cpuprofile`), JSON.stringify(profile));
        log(`profile ${name}:\n${hot(profile, 18)}`);
      }
    },
  };
  return atlas;
}
