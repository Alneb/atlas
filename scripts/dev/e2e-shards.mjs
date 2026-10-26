// The end-to-end specs in parallel shards: each shard is its own Playwright run with its own server, workspace, port and
// key (playwright.config.ts reads ATLAS_PW_WS / ATLAS_PW_PORT / ATLAS_PW_KEY), so they never share state the way workers
// in one run would. The specs are split by file (`--shard=i/n`); each shard's log is printed whole when it ends, then
// the totals. Exit status: 0 only when every shard passed.
//   node scripts/dev/e2e-shards.mjs [n] [playwright args…]     n: ATLAS_E2E_SHARDS, else by free memory (1–3)
import { spawn, spawnSync } from "node:child_process";
import { freemem, tmpdir } from "node:os";
import { createWriteStream, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ui = join(root, "ui");
const argv = process.argv.slice(2);
const asked = /^\d+$/.test(argv[0] ?? "") ? Number(argv.shift()) : Number(process.env.ATLAS_E2E_SHARDS) || 0;
// a shard is a browser and a core: about 1.5 GB at its peak
const n = Math.max(1, asked || Math.min(3, Math.floor(freemem() / 1.5e9)));
const tmp = process.env.TMPDIR ?? tmpdir();
const log = (s) => console.log(`[e2e] ${s}`);

// the server once, before the shards: their webServer's `cargo build` is then a no-op instead of n builds racing for
// cargo's lock
if (!process.env.ATLAS_SERVER_CMD) {
  log("building the core and its helpers once for every shard");
  const b = spawnSync("cargo", ["build", "-q", "-p", "atlas", "-p", "atlas-papers", "-p", "atlas-ssh"], { cwd: root, stdio: "inherit" });
  if (b.status !== 0) { log(`the build failed (exit ${b.status})`); process.exit(b.status ?? 1); }
}

log(`${n} shard${n > 1 ? "s" : ""}, each with its own server and workspace`);
const started = Date.now();
const runs = Array.from({ length: n }, (_, k) => {
  const i = k + 1;
  const file = join(tmp, `atlas-e2e-shard-${i}.log`);
  const out = createWriteStream(file);
  const env = { ...process.env, ATLAS_PW_WS: join(tmp, `atlas-ui-test-ws-${i}`), ATLAS_PW_PORT: String(7720 + k) };
  delete env.ATLAS_PW_KEY; // each run makes its own
  const args = ["playwright", "test", `--shard=${i}/${n}`, `--output=test-results/shard-${i}`, "--reporter=line", ...argv];
  const child = spawn("npx", n > 1 ? args : args.filter((a) => !a.startsWith("--shard")), { cwd: ui, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  return new Promise((done) => child.on("close", (code) => {
    out.end(() => {
      const text = readFileSync(file, "utf8");
      console.log(`\n[e2e] ===== shard ${i}/${n} (exit ${code}, log ${file}) =====`);
      console.log(text);
      done({ i, code, text });
    });
  }));
});

const results = await Promise.all(runs);
const total = { passed: 0, failed: 0, flaky: 0, skipped: 0 };
for (const r of results)
  for (const m of r.text.matchAll(/^\s+(\d+) (passed|failed|flaky|skipped)\b/gm)) total[m[2]] += Number(m[1]);
const bad = results.filter((r) => r.code !== 0);
log(`${Math.round((Date.now() - started) / 1000)} s for ${n} shard${n > 1 ? "s" : ""}${bad.length ? `; failed: ${bad.map((r) => r.i).join(", ")}` : ""}`);
// the totals in Playwright's own shape, which gate.sh's verdict line reads
for (const [k, v] of Object.entries(total)) if (v) console.log(`  ${v} ${k}`);
process.exit(bad.length ? 1 : 0);
