#!/usr/bin/env node
// What a second vault costs the desktop's core: makes two throwaway vaults in target/two-vaults/ and runs the
// two_vaults example (crates/atlas-core/examples/two_vaults.rs) on them, with its own vault list, config, state and
// cache folders, so this machine's vaults, list and notifications are never touched.
//   node scripts/dev/two-vaults.mjs [--notes 2000] [--idle 60] [--only open|ahead] [--b-days 0] [--copy <folder>]
// Two runs: `open` (B opened by a window's requests) and `ahead` (B listed, never asked for: start_ahead's cost, B's
// last use `--b-days` ago). --copy: vault B is a copy of that folder (made once, only read) instead of generated notes;
// never the folder itself. A copy may hold scheduled commands, so it gets ATLAS_NO_SCHEDULE and only the `open` run.
// Release build: one heavy job, so this waits while another cargo or rustc runs, and runs niced.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repo = resolve(import.meta.dirname, "../..");
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const notes = Number(arg("notes", "2000")), idle = arg("idle", "60"), copy = arg("copy", ""), only = arg("only", "");
const bDays = arg("b-days", "0");
const top = join(repo, "target/two-vaults");
const log = (m) => console.log(`[two-vaults] ${m}`);

/** A vault of `n` notes in folders of 100, each linking two others, tagged and with a task, as notes are. */
function generated(dir, n) {
  rmSync(dir, { recursive: true, force: true });
  for (let i = 0; i < n; i++) {
    const folder = join(dir, `notes/f${Math.floor(i / 100)}`);
    if (i % 100 === 0) mkdirSync(folder, { recursive: true });
    const body = `---\ntags: [t${i % 17}]\ncreated: 2026-01-0${1 + (i % 9)}\n---\n# Note ${i}\n\nSee [[Note ${(i * 7 + 1) % n}]] and [[Note ${(i * 13 + 5) % n}]].\n${"Some words of a note, written as one does. ".repeat(20)}\n- [ ] a task ${i}\n`;
    writeFileSync(join(folder, `Note ${i}.md`), body);
  }
}

/** Waits while another cargo or rustc runs on the machine (one heavy job at a time). */
function waitForCargo() {
  for (let said = false; ; said = true) {
    const ps = spawnSync("ps", ["-C", "cargo,rustc", "-o", "pid="], { encoding: "utf8" });
    if (!ps.stdout.trim()) return;
    if (!said) log("another cargo/rustc runs: waiting for it");
    spawnSync("sleep", ["10"]);
  }
}

log(`making vault A (${notes} notes) in ${top}`);
generated(join(top, "A"), notes);
const b = join(top, "B");
if (copy) {
  if (!existsSync(b)) { log(`copying ${copy} → ${b} (once)`); cpSync(copy, b, { recursive: true }); }
  else log(`vault B: the copy already in ${b}`);
} else {
  log(`making vault B (${notes} notes)`);
  generated(b, notes);
}
const home = join(top, "home");
rmSync(home, { recursive: true, force: true });
for (const d of ["config", "state", "cache", "data"]) mkdirSync(join(home, d), { recursive: true });
writeFileSync(join(home, "vaults.toml"), "");
const base = {
  ...process.env,
  ATLAS_VAULTS: join(home, "vaults.toml"),
  XDG_CONFIG_HOME: join(home, "config"), XDG_STATE_HOME: join(home, "state"), XDG_CACHE_HOME: join(home, "cache"), XDG_DATA_HOME: join(home, "data"),
  ATLAS_NO_BROWSER: "1", ATLAS_NO_NOTIFY: "1", ATLAS_VAULT_TRASH: "1", ATLAS_NO_SCHEDULE: "1",
};
delete base.ATLAS_UI_DIR;

waitForCargo();
log("building the example (release, niced)");
const built = spawnSync("nice", ["-n", "15", "cargo", "build", "--release", "-q", "-p", "atlas-core", "--example", "two_vaults"], { cwd: repo, env: base, stdio: "inherit" });
if (built.status !== 0) { console.error(`[two-vaults] the build failed (exit ${built.status})`); process.exit(1); }
const exe = join(repo, "target/release/examples/two_vaults");

const runs = (only ? [only] : ["open", "ahead"]).filter((m) => m === "open" || !copy);
for (const mode of runs) {
  const env = { ...base };
  // start_ahead is off under ATLAS_NO_SCHEDULE; the generated vaults have no scheduled commands to run
  if (mode === "ahead") delete env.ATLAS_NO_SCHEDULE;
  writeFileSync(join(home, "vaults.toml"), "");
  log(`run "${mode}", idle windows of ${idle} s`);
  const r = spawnSync("nice", ["-n", "15", exe, mode, join(top, "A"), b, idle, bDays], { cwd: repo, env, stdio: "inherit" });
  if (r.status !== 0) { console.error(`[two-vaults] the "${mode}" run failed (exit ${r.status})`); process.exit(1); }
}
log("done; the vaults stay in target/two-vaults/ for a second run (delete it when finished)");
