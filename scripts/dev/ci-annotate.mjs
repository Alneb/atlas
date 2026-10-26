// Runs a command and, when it fails, turns what failed into GitHub annotations: compile errors, a build script's
// panic, failing tests and end-to-end specs, else the output's tail. Annotations can be read through the API without
// a sign-in, unlike a job's log. Usage (in a workflow step): node scripts/dev/ci-annotate.mjs <command> [args…]
import { spawn } from "node:child_process";

const MAX = 10; // GitHub keeps at most 10 error annotations per step

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.error("usage: ci-annotate.mjs <command> [args…]"); process.exit(2); }

const plain = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
const data = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const prop = (s) => data(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

/** @typedef {{ title: string, body: string, file?: string, line?: number }} Finding */

/** rustc's `error[E…]: msg` / `error: msg`, with the ` --> file:line:col` that follows. */
function compileErrors(lines) {
  /** @type {Finding[]} */
  const out = [];
  lines.forEach((l, i) => {
    const m = /^error(\[E\d+\])?: (.*)$/.exec(l);
    if (!m || /^(aborting|could not compile|test failed)/.test(m[2])) return;
    const block = [l];
    for (let j = i + 1; j < lines.length && j < i + 25 && !/^(error|warning)(\[|:)/.test(lines[j]); j++) block.push(lines[j]);
    const at = block.map((b) => /^\s*--> (.+?):(\d+):\d+/.exec(b)).find(Boolean);
    out.push({ title: `rustc${m[1] ?? ""}: ${m[2]}`.slice(0, 200), body: block.join("\n"), file: at?.[1], line: at ? +at[2] : undefined });
  });
  return out;
}

/** cargo's `failed to run custom build command for `x``, with the stderr it shows. */
function buildScripts(lines) {
  const out = [];
  lines.forEach((l, i) => {
    const m = /failed to run custom build command for `([^`]+)`/.exec(l);
    if (m) out.push({ title: `build script: ${m[1]}`, body: lines.slice(i, i + 40).join("\n") });
  });
  return out;
}

/** libtest's `---- name stdout ----` blocks, up to the next block or the `failures:` list. */
function failingTests(lines) {
  const out = [];
  lines.forEach((l, i) => {
    const m = /^---- (.+?) stdout ----$/.exec(l);
    if (!m) return;
    const block = [];
    for (let j = i + 1; j < lines.length && !/^(---- .+ ----|failures:)$/.test(lines[j]); j++) block.push(lines[j]);
    const at = block.map((b) => /panicked at (.+?):(\d+):\d+/.exec(b)).find(Boolean);
    out.push({ title: `test ${m[1]}`, body: block.slice(0, 40).join("\n"), file: at?.[1], line: at ? +at[2] : undefined });
  });
  return out;
}

/** Playwright's summary lines: `  1) [chromium] › tests/x.spec.ts:12:3 › a test` (the project only when there are several). */
function failingSpecs(lines) {
  const out = [];
  lines.forEach((l, i) => {
    const m = /^\s+\d+\) (?:\[[^\]]+\] › )?(.+?):(\d+):\d+ › (.+?)\s*$/.exec(l);
    if (m) out.push({ title: `e2e ${m[3]}`.slice(0, 200), body: lines.slice(i, i + 30).join("\n"), file: `ui/${m[1]}`, line: +m[2] });
  });
  // the same test is listed again under "flaky"/"failed" at the end: keep its first, detailed entry
  return out.filter((f, i) => out.findIndex((g) => g.title === f.title) === i);
}

/** gate.sh's PASS/FAIL table, first: which stages failed, even those whose failure has no shape above. */
function gateVerdict(lines) {
  const at = lines.lastIndexOf("[gate] ===== verdict =====");
  if (at < 0) return [];
  const table = lines.slice(at + 1).filter((l) => /^(PASS|FAIL)\s|^\[gate\] failed stages/.test(l));
  return [{ title: "gate verdict", body: table.join("\n") }];
}

function annotate(findings, tail) {
  const shown = findings.length ? findings : [{ title: `${cmd} failed`, body: tail }];
  for (const f of shown.slice(0, MAX - 1)) {
    const where = f.file ? `file=${prop(f.file.replace(/\\/g, "/"))},line=${f.line},` : "";
    console.log(`::error ${where}title=${prop(f.title)}::${data(f.body)}`);
  }
  if (shown.length >= MAX) console.log(`::error title=${prop(`and ${shown.length - MAX + 1} more`)}::${data(tail)}`);
}

const child = spawn(cmd, args, { stdio: ["inherit", "pipe", "pipe"] });
let text = "";
for (const s of [child.stdout, child.stderr]) {
  const sink = s === child.stdout ? process.stdout : process.stderr;
  s.on("data", (b) => { sink.write(b); text += b; });
}
child.on("error", (e) => { console.log(`::error title=${prop(`${cmd} did not start`)}::${data(e.message)}`); process.exit(127); });
child.on("close", (code, signal) => {
  if (code !== 0) {
    const lines = plain(text).split(/\r?\n/);
    annotate([...gateVerdict(lines), ...compileErrors(lines), ...buildScripts(lines), ...failingTests(lines), ...failingSpecs(lines)], lines.slice(-40).join("\n"));
  }
  process.exit(code ?? (signal ? 1 : 0));
});
