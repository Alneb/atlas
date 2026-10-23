// The long day in WebKit, the desktop window's engine (profile-longday.mjs measures it in Chromium, whose numbers
// WebKit's need not follow): ~40 tabs of every kind opened on a COPY of a vault, then put to sleep, then closed. At
// each step the memory of WebKit's page process (PSS, from /proc: what the system really gives it), with its anonymous
// and file-backed parts, and the page's DOM nodes and mounted panes.
//
//   ATLAS_URL=http://127.0.0.1:7791/ ATLAS_PROBE_COPY=1 node scripts/dev/webkit-probe.mjs --dist ui/dist scripts/dev/webkit-longday.mjs
//
// JSC_forceRAMSize=<bytes> in the environment reaches the page process: JavaScriptCore then sizes its heap and its
// collections for that much RAM.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TABS = Number(process.env.LONGDAY_TABS ?? 40);

/** The WebKit page processes Playwright started (its own build: the path says ms-playwright; headless is the WPE port, WPEWebProcess), largest first. */
function pageProcesses() {
  const out = execFileSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
  return out.split("\n").filter((l) => /ms-playwright.*(WPEWebProcess|WebKitWebProcess)/.test(l)).map((l) => Number(l.trim().split(/\s+/)[0]));
}
function mem(pid) {
  try {
    const r = readFileSync(`/proc/${pid}/smaps_rollup`, "utf8");
    const kb = (k) => Number(new RegExp(`^${k}:\\s+(\\d+)`, "m").exec(r)?.[1] ?? 0);
    return { pss: kb("Pss") >> 10, anon: kb("Pss_Anon") >> 10, file: kb("Pss_File") >> 10, shmem: kb("Pss_Shmem") >> 10 };
  } catch { return null; }
}

export default async ({ page, errs }) => {
  const atlas = (f, ...a) => page.evaluate(([f, a]) => window.__atlas[f](...a), [f, a]);
  const rows = [];
  const snap = async (label) => {
    await page.waitForTimeout(1500);
    const pids = pageProcesses();
    const m = pids.map(mem).filter(Boolean).sort((a, b) => b.pss - a.pss)[0];
    const dom = await page.evaluate(() => document.getElementsByTagName("*").length);
    const s = await atlas("sleeping");
    rows.push({ label, ...m, dom, panes: s.panes, asleep: s.asleep });
    console.log(`${label.padEnd(22)} page ${String(m?.pss).padStart(4)} MB (anon ${m?.anon}, file ${m?.file}, shmem ${m?.shmem}) · ${dom} elements · ${s.panes} panes, ${s.asleep} asleep`);
  };

  await page.waitForTimeout(3000);
  await snap("start");
  const files = await page.evaluate(async () => (await (await fetch("/api/files", { headers: { "x-atlas": "1" } })).json()));
  const pick = (re, n) => files.filter((f) => re.test(f) && !/^(mail|\.atlas)\//.test(f)).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / n)) === 0).slice(0, n);
  const share = (k) => Math.max(1, Math.round((TABS * k) / 40));
  const plan = [...pick(/\.md$/, share(18)), ...pick(/\.pdf$/, share(8)), ...pick(/\.excalidraw$/, share(5)), ...pick(/\.base$/, share(3)), ...pick(/\.page$/, share(2))];
  for (const [i, f] of plan.entries()) {
    await atlas("open", f);
    await page.waitForTimeout(800);
    if ((i + 1) % 10 === 0) await snap(`after ${i + 1} tabs`);
  }
  for (const id of ["ui.settings", "ui.libraries", "ui.graph"]) { await atlas("run", id); await page.waitForTimeout(1500); }
  await snap(`all ${plan.length + 3} open`);
  // back through them all, as a day's switching does
  for (const f of plan) { await atlas("open", f); await page.waitForTimeout(150); }
  await snap("cycled once");
  const slept = await atlas("hibernate", 0);
  await page.waitForTimeout(5000); // a collection has the time to run
  await snap(`${slept} put to sleep`);
  for (const p of await atlas("panes")) await atlas("close", p.id);
  await page.waitForTimeout(8000);
  await snap("every tab closed");
  if (errs.length) console.log(`page errors: ${errs.length}\n  ${errs.slice(0, 5).join("\n  ")}`);
  console.log(JSON.stringify(rows));
};
