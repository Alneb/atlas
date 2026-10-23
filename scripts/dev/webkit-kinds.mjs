// Which kind of tab holds WebKit's page memory: for each kind (notes, PDFs, drawings, Bases, pages), N files of it
// opened, then every tab closed, the page process's memory (PSS) read before, with them open, and 20 s after closing.
// Same harness as webkit-longday.mjs (a COPY of a vault):
//
//   ATLAS_URL=http://127.0.0.1:7791/ ATLAS_PROBE_COPY=1 node scripts/dev/webkit-probe.mjs --dist ui/dist scripts/dev/webkit-kinds.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const N = Number(process.env.KINDS_N ?? 8);
const KINDS = [["note", /\.md$/], ["pdf", /\.pdf$/], ["drawing", /\.excalidraw$/], ["base", /\.base$/], ["page", /\.page$/]];

const pss = () => {
  const pids = execFileSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" }).split("\n")
    .filter((l) => /ms-playwright.*(WPEWebProcess|WebKitWebProcess)/.test(l)).map((l) => Number(l.trim().split(/\s+/)[0]));
  const mb = pids.map((p) => { try { return Number(/^Pss:\s+(\d+)/m.exec(readFileSync(`/proc/${p}/smaps_rollup`, "utf8"))[1]) >> 10; } catch { return 0; } });
  return Math.max(0, ...mb);
};

export default async ({ page }) => {
  const atlas = (f, ...a) => page.evaluate(([f, a]) => window.__atlas[f](...a), [f, a]);
  const closeAll = async () => { for (const p of await atlas("panes")) await atlas("close", p.id); };
  const files = await page.evaluate(async () => (await (await fetch("/api/files", { headers: { "x-atlas": "1" } })).json()));
  await closeAll();
  await page.waitForTimeout(5000);
  for (const [kind, re] of KINDS) {
    const list = files.filter((f) => re.test(f) && !/^(mail|\.atlas)\//.test(f));
    const pick = list.filter((_, i) => i % Math.max(1, Math.floor(list.length / N)) === 0).slice(0, N);
    if (!pick.length) continue;
    const before = pss();
    for (const f of pick) { await atlas("open", f); await page.waitForTimeout(1200); }
    for (const f of pick) { await atlas("open", f); await page.waitForTimeout(300); } // shown again, as switching does
    const open = pss();
    await closeAll();
    await page.waitForTimeout(20_000);
    const after = pss();
    console.log(`${kind.padEnd(8)} ${pick.length} tabs: before ${before} MB → open ${open} MB (+${open - before}) → closed, 20 s later ${after} MB (kept +${after - before})`);
  }
};
