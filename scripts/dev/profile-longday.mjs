// "After a long day / many tabs". Opens ~40 tabs of every kind on a COPY of a vault, cycles through them, closes them,
// and at each checkpoint prints what the page holds: JS heap after a GC, DOM nodes, event listeners, live
// intervals, long tasks, and the latency of a tab switch and of a key typed.
//
//   ATLAS_URL=http://127.0.0.1:7743/ node scripts/dev/profile-longday.mjs [--cpu 4] [--dist ui/dist] [--tabs 40] [--json out.json] [--profile dir]
//
// --profile: CPU profiles of the tab cycles and the typing, written as .cpuprofile, their hottest functions printed.
//
// Chromium (CDP: heap, DOM counters, CPU throttling). The vault must be a copy: tabs are opened for real and
// the typing step writes into a note. The page drives the app through window.__atlas (App.svelte).
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchAtlas, pct } from "./atlas-driver.mjs";

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const cpu = Number(opt("--cpu", "1")), nTabs = Number(opt("--tabs", "40")), jsonOut = opt("--json"), profDir = opt("--profile");
const distArg = opt("--dist");
const atlas = await launchAtlas({ url: process.env.ATLAS_URL, dist: distArg && resolve(distArg), tag: "longday" });
const { page, errs, log, switchTo, snapshot } = atlas;
const profiled = (name, fn) => atlas.profiled(profDir, name, fn);

const rows = [];
if (cpu > 1) { await atlas.throttle(cpu); log(`CPU throttled ${cpu}×`); }
rows.push(await snapshot("start"));

// The mix of a working day: notes (big and small), PDFs, drawings, Bases, pages.
const files = await atlas.files();
const pick = (re, n, skip = /^(mail|\.atlas)\//) => files.filter((f) => re.test(f) && !skip.test(f)).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / n)) === 0).slice(0, n);
const share = (k) => Math.max(1, Math.round((nTabs * k) / 40));
const plan = [...pick(/\.md$/, share(18)), ...pick(/\.pdf$/, share(8)), ...pick(/\.excalidraw$/, share(5)), ...pick(/\.base$/, share(3)), ...pick(/\.page$/, share(2)), ...pick(/^mail\/.*\.md$/, share(4), /^\.atlas\//)];
log(`vault: ${files.length} files; opening ${plan.length} tabs + Settings, Libraries, Graph, Git, a terminal`);

const openMs = [];
for (const [i, f] of plan.entries()) {
  openMs.push(await switchTo(f));
  await page.waitForTimeout(700); // let the pane load what it loads (a PDF's pages, a drawing)
  if ((i + 1) % 10 === 0) rows.push(await snapshot(`after ${i + 1} tabs`));
}
for (const id of ["ui.settings", "ui.libraries", "ui.graph", "ui.git", "ui.terminal.new"]) { await atlas.run(id); await page.waitForTimeout(1500); }
rows.push(await snapshot(`all ${plan.length + 5} open`));

// Cycling: what a tab switch costs with everything open (the long-day feel).
const switchMs = [];
await profiled("switch", async () => { for (let round = 0; round < 2; round++) for (const f of plan) switchMs.push(await switchTo(f)); });
rows.push(await snapshot("after 2 cycles"));

// Typing with everything open.
const note = plan.find((f) => f.endsWith(".md") && !f.startsWith("mail/"));
await switchTo(note);
await page.waitForTimeout(800);
await page.locator(".cm-content:visible").first().click();
await page.keyboard.press("Control+End");
await page.evaluate(() => { const w = window; w.__lat = []; addEventListener("keydown", () => { const t = performance.now(); requestAnimationFrame(() => setTimeout(() => w.__lat.push(performance.now() - t), 0)); }, true); });
await profiled("typing", () => page.keyboard.type(" The quick brown fox jumps over the lazy dog with $E = mc^2$ and [[a link]].", { delay: 20 }));
await page.waitForTimeout(500);
const keyMs = await page.evaluate(() => window.__lat);
await page.keyboard.press("Control+z"); // the copy keeps its text, as far as undo goes
rows.push(await snapshot("after typing"));

// Closing all but one: what is left is what leaked.
// Hibernation (lib/hibernate.ts): everything past the working set put to sleep now, then what waking costs.
const slept = await page.evaluate(() => window.__atlas.hibernate(0));
await page.waitForTimeout(1000);
rows.push(await snapshot(`${slept} put to sleep`));
const wakeMs = [];
for (const f of plan) wakeMs.push(await switchTo(f));
rows.push(await snapshot("after waking them all"));

await atlas.closeAllButOne();
await page.waitForTimeout(3000);
rows.push(await snapshot("closed all but one"));

const summary = {
  cpu, tabs: plan.length + 5,
  openMs: { p50: +pct(openMs, 0.5).toFixed(1), p95: +pct(openMs, 0.95).toFixed(1), max: +Math.max(...openMs).toFixed(1) },
  switchMs: { p50: +pct(switchMs, 0.5).toFixed(1), p95: +pct(switchMs, 0.95).toFixed(1), max: +Math.max(...switchMs).toFixed(1) },
  wakeMs: { p50: +pct(wakeMs, 0.5).toFixed(1), p95: +pct(wakeMs, 0.95).toFixed(1), max: +Math.max(...wakeMs).toFixed(1) },
  keyMs: { p50: +pct(keyMs, 0.5).toFixed(1), p95: +pct(keyMs, 0.95).toFixed(1), max: +Math.max(0, ...keyMs).toFixed(1), n: keyMs.length },
  pageErrors: errs.length,
};
log(`open a tab: p50 ${summary.openMs.p50} · p95 ${summary.openMs.p95} · max ${summary.openMs.max} ms`);
log(`switch tab: p50 ${summary.switchMs.p50} · p95 ${summary.switchMs.p95} · max ${summary.switchMs.max} ms`);
log(`wake a tab: p50 ${summary.wakeMs.p50} · p95 ${summary.wakeMs.p95} · max ${summary.wakeMs.max} ms`);
log(`key typed:  p50 ${summary.keyMs.p50} · p95 ${summary.keyMs.p95} · max ${summary.keyMs.max} ms (n ${summary.keyMs.n})`);
log(`page errors: ${errs.length ? errs.slice(0, 5).join(" | ") : "none"}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ summary, rows, errs }, null, 2));
await atlas.browser.close();
