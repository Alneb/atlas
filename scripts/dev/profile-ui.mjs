// Where the interface spends its time, on the user's real vault, read-only. Chromium with its CPU profiler (CDP), against the RUNNING core:
// API reads go through, every write is answered with `{}` (webkit-probe.mjs's rule), so typing in a note changes nothing.
//
//   node scripts/dev/profile-ui.mjs [--dist ui/dist] [--note path/in/vault.md] [--out dir] [--cpu 4]
//
// --cpu N: Chromium's CPU throttling, N times slower (a busy or slow machine: what stays snappy under load).
//
// Scenarios, each timed and profiled on its own: start (load → Home drawn), quick open (Ctrl+P, a query), open a big
// note, typing (per-key latency: keydown → the next frame), the command palette, switching tabs. For each it prints the
// wall time and the functions with the most self time (by function and file), and writes the .cpuprofile files
// (open them in Chrome's DevTools → Performance) into --out.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { coreUrl } from "./webkit-probe.mjs";
import { hot } from "./cpuprofile.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(join(here, "../../ui/package.json"))("playwright");
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const distArg = opt("--dist"), cpu = Number(opt("--cpu", "1")), dist = distArg && resolve(distArg), out = resolve(opt("--out", "/tmp/atlas-profile")), notePath = opt("--note");
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".wasm": "application/wasm", ".json": "application/json" };
const READS = /\/api\/(base\/query|view|link-mention|search)/;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
await page.routeWebSocket(/.*/, (ws) => ws.close());
await page.route("**/*", async (r) => {
  const req = r.request(), u = new URL(req.url());
  if (u.pathname.startsWith("/api/")) return req.method() === "GET" || READS.test(u.pathname) ? r.continue() : r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  if (dist) {
    const f = join(dist, u.pathname === "/" ? "index.html" : decodeURIComponent(u.pathname));
    if (existsSync(f) && !f.endsWith("/")) return r.fulfill({ body: readFileSync(f), contentType: TYPES[extname(f)] ?? "application/octet-stream" });
  }
  return r.continue();
});
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
// the main thread's long tasks (> 50 ms: what a person feels as a stall), counted per scenario
await page.addInitScript(() => {
  window.__long = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: "longtask", buffered: true }); } catch { /* no longtask entries */ }
});
const longTasks = async () => page.evaluate(() => { const l = window.__long ?? []; window.__long = []; return l; }).catch(() => []);

async function scenario(name, run) {
  await cdp.send("Profiler.start");
  const t = Date.now();
  let extra = "";
  try { extra = (await run()) ?? ""; } catch (e) { extra = `FAILED: ${e.message.split("\n")[0]}`; }
  const ms = Date.now() - t;
  const { profile } = await cdp.send("Profiler.stop");
  writeFileSync(join(out, `${name}.cpuprofile`), JSON.stringify(profile));
  const long = await longTasks();
  const stalls = long.length ? `long tasks: ${long.length}, worst ${Math.max(...long).toFixed(0)} ms, total ${long.reduce((a, b) => a + b, 0).toFixed(0)} ms` : "long tasks: none";
  console.log(`\n== ${name}: ${ms} ms ${extra}\n${stalls}\n${hot(profile)}`);
}
const nextFrame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));

await scenario("start", async () => {
  await page.goto(coreUrl());
  await page.locator(".dv-groupview").first().waitFor({ timeout: 30_000 }); // vertical tabs: no .dv-tab strip
  await page.waitForLoadState("networkidle").catch(() => {});
  return `(${(await page.evaluate(() => performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd ?? 0)).toFixed(0)} ms to DOMContentLoaded)`;
});
await page.waitForTimeout(3000); // plugins, the home page's blocks

const files = await page.evaluate(async () => (await (await fetch("/api/files", { headers: { "x-atlas": "1" } })).json()));
const note = notePath ?? (await page.evaluate(async (fs) => {
  // the biggest note among a sample: the editor's worst case on this vault
  let best = ["", 0];
  for (const f of fs.filter((x) => x.endsWith(".md") && !x.startsWith("mail/")).slice(0, 400)) {
    const r = await fetch(`/api/file?path=${encodeURIComponent(f)}`, { headers: { "x-atlas": "1" } });
    if (r.ok) { const t = (await r.json()).text; if (t.length > best[1]) best = [f, t.length]; }
  }
  return best[0];
}, files));
console.log(`vault: ${files.length} files; the big note: ${note}`);

await scenario("quick-open", async () => {
  await page.keyboard.press("Control+p");
  await page.keyboard.type("hubbard", { delay: 30 });
  await page.getByTestId("palette").locator(".item").first().waitFor({ timeout: 10_000 });
  await nextFrame();
  await page.keyboard.press("Escape");
});
await scenario("open-big-note", async () => {
  // straight to the note (window.__atlas): the palette's ranking is not what is measured here
  await page.evaluate((p) => window.__atlas.open(p), note);
  await page.locator(".cm-editor:visible .cm-line").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
});
await scenario("typing", async () => {
  await page.locator(".cm-content:visible").first().click();
  await page.keyboard.press("Control+End");
  if (await page.locator(".cm-fat-cursor").count()) await page.keyboard.press("o");
  else await page.keyboard.press("Enter");
  // per key: keydown → the frame after (what the user feels)
  await page.evaluate(() => {
    const w = window; w.__lat = [];
    addEventListener("keydown", () => { const t = performance.now(); requestAnimationFrame(() => setTimeout(() => w.__lat.push(performance.now() - t), 0)); }, true);
  });
  await page.keyboard.type("The quick brown fox jumps over the lazy dog, with $E = mc^2$ and a [[link]] too. ".repeat(2), { delay: 15 });
  await page.waitForTimeout(500);
  const lat = (await page.evaluate(() => window.__lat)).sort((a, b) => a - b);
  return `(per key: p50 ${lat[lat.length >> 1].toFixed(1)} ms, p95 ${lat[Math.floor(lat.length * 0.95)].toFixed(1)} ms, worst ${lat.at(-1).toFixed(1)} ms, n ${lat.length})`;
});
await page.keyboard.press("Escape");
await scenario("command-palette", async () => {
  await page.keyboard.press("F1");
  await page.getByTestId("palette").waitFor();
  await page.keyboard.type("settings", { delay: 30 });
  await nextFrame();
  await page.keyboard.press("Escape");
});
await scenario("switch-tabs", async () => {
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Control+Tab"); await nextFrame(); }
});
await browser.close();
console.log(`\nprofiles: ${out}/*.cpuprofile`);
