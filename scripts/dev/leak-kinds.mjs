// Which pane kind leaks: for each kind, open a few tabs of it, close them, and compare what the page holds
// (after a GC) with before — twice, reporting the second round: the first one also loads what stays on purpose
// (the kind's code, fonts, caches), a leak grows again every round.
//
//   ATLAS_URL=http://127.0.0.1:7743/ node scripts/dev/leak-kinds.mjs [--dist ui/dist] [--n 5] [--kinds md,pdf,…]
//
// Kinds: md, mail, pdf, excalidraw, base, page, and the commands settings, libraries, graph, git, search, terminal.
import { resolve } from "node:path";
import { launchAtlas } from "./atlas-driver.mjs";

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const n = Number(opt("--n", "5")), distArg = opt("--dist");
const FILES = { md: /^(?!mail\/|\.atlas\/).*\.md$/, mail: /^mail\/.*\.md$/, pdf: /\.pdf$/, excalidraw: /\.excalidraw$/, base: /\.base$/, page: /\.page$/ };
const COMMANDS = { settings: "ui.settings", libraries: "ui.libraries", graph: "ui.graph", git: "ui.git", search: "ui.search", terminal: "ui.terminal.new" };
const kinds = opt("--kinds", [...Object.keys(FILES), ...Object.keys(COMMANDS)].join(",")).split(",");

const atlas = await launchAtlas({ url: process.env.ATLAS_URL, dist: distArg && resolve(distArg), tag: "leak" });
const { page, log } = atlas;
const files = await atlas.files();
const report = [];
async function round(kind, files) {
  const before = await atlas.snapshot(`${kind}: before`);
  if (FILES[kind]) {
    for (const f of files.filter((x) => FILES[kind].test(x)).slice(0, n)) { await atlas.switchTo(f); await page.waitForTimeout(900); }
  } else {
    await atlas.run(COMMANDS[kind]);
    await page.waitForTimeout(2500);
  }
  await atlas.closeAllButOne();
  await page.waitForTimeout(2000);
  const after = await atlas.snapshot(`${kind}: closed`);
  return { kind, nodes: after.nodes - before.nodes, listeners: after.listeners - before.listeners, intervals: after.intervals - before.intervals, heapMB: +(after.heapMB - before.heapMB).toFixed(1) };
}
await atlas.closeAllButOne();
for (const kind of kinds) { await round(kind, files); report.push(await round(kind, files)); }
log("left behind per kind, second round (after − before, all its tabs closed):");
for (const r of report) log(`  ${r.kind.padEnd(11)} nodes ${String(r.nodes).padStart(6)} · listeners ${String(r.listeners).padStart(5)} · intervals ${String(r.intervals).padStart(3)} · heap ${String(r.heapMB).padStart(6)} MB`);
log(`page errors: ${atlas.errs.length ? atlas.errs.slice(0, 5).join(" | ") : "none"}`);
await atlas.browser.close();
