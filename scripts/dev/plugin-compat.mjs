#!/usr/bin/env node
// Every bundled plugin against what runs it (docs/guides/PLUGIN-MATURITY.md, criterion 8): the plugin API it asks for
// against this core's, what its helper needs on each platform, and its `[platforms]` claims checked against that.
//   node scripts/dev/plugin-compat.mjs [--md out.md]     (exits 1 when a claim contradicts what the plugin needs)
// Static: it reads the manifests and the code. Whether each helper starts with no desktop around it is
// helpers-headless.mjs; trying a plugin on the machine itself is the only way a claim becomes "works".
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "../..");
const PLATFORMS = ["linux", "macos", "windows", "android", "server"];
const core = Number(/pub const API_VERSION: u32 = (\d+);/.exec(readFileSync(join(repo, "crates/atlas-core/src/plugins.rs"), "utf8"))?.[1]);

/** The manifest's top-level keys, its `[helper]` and `[platforms]` tables: enough TOML for what is checked here. */
function manifest(text) {
  const top = {}, tables = {};
  let at = top;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    const t = /^\[([\w.-]+)\]$/.exec(line);
    if (t) { at = tables[t[1]] ??= {}; continue; }
    if (/^\[\[/.test(line)) { at = {}; continue; } // [[setting]] and the like: not read
    const kv = /^([\w-]+)\s*=\s*(.+)$/.exec(line);
    if (kv) at[kv[1]] = kv[2].trim();
  }
  return { top, helper: tables.helper ?? {}, platforms: tables.platforms ?? {}, android: tables.android };
}

/** "works" / "untested" / "no" from `linux = "works"` or `windows = { support = "no", why = "…" }`. */
const claimOf = (v) => (v ? (/support\s*=\s*"?(\w+)/.exec(v)?.[1] ?? v.replace(/"/g, "")) : "untested");

/** What the helper is, and what each platform must have for it. */
function helperOf(m, dir) {
  const h = m.helper;
  if (h.js) return { kind: "js (in the core)", needs: {} };
  const run = h.run ?? "";
  if (!run) return { kind: "none", needs: {} };
  if (/python3?\b/.test(run)) return { kind: "python", needs: { android: m.top.phone === "true" ? null : "not marked phone = true", server: null, windows: null, macos: null } };
  const built = existsSync(join(dir, "bin"));
  return { kind: "binary", needs: Object.fromEntries(["macos", "windows", "android"].map((p) => [p, `its binary built for ${p}${built ? "" : " (no bin/ here)"}`])) };
}

/** Code that only a Unix shell or desktop answers, found by shape. */
function unixOnly(dir) {
  const found = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (["node_modules", "target", "engine", "__pycache__", "bin", "helper"].includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|py|ts)$/.test(e.name)) {
        const t = readFileSync(p, "utf8");
        if (/\.venv\/bin\/|\/usr\/bin\/|\/tmp\//.test(t)) found.push(`${e.name}: a Unix path`);
        if (/\\'\\\\''|'\\\\''/.test(t) || /replace\(\/'\/g/.test(t)) found.push(`${e.name}: POSIX shell quoting`);
        if (/\b(lpstat|xdg-open|notify-send)\b/.test(t)) found.push(`${e.name}: a Unix program`);
      }
    }
  };
  walk(dir);
  return [...new Set(found)];
}

const rows = [], problems = [];
for (const group of ["stable", "beta", "examples"]) {
  const base = join(repo, "plugins", group);
  for (const id of readdirSync(base).filter((n) => existsSync(join(base, n, "plugin.toml"))).sort()) {
    const dir = join(base, id), m = manifest(readFileSync(join(dir, "plugin.toml"), "utf8"));
    const api = Number(m.top.api ?? 1), helper = helperOf(m, dir), unix = unixOnly(dir);
    const claims = Object.fromEntries(PLATFORMS.map((p) => [p, claimOf(m.platforms[p])]));
    const notes = [];
    if (api > core) problems.push(`${id}: asks for plugin API ${api}, this core has ${core}`);
    for (const p of PLATFORMS) {
      const need = helper.needs[p];
      if (claims[p] === "works" && need) problems.push(`${id}: ${p} = works, but its helper needs ${need}`);
      if (claims[p] === "works" && p === "windows" && unix.length) problems.push(`${id}: windows = works, but ${unix.join("; ")}`);
    }
    if (unix.length && claims.windows === "untested") notes.push(`Windows: ${unix.join("; ")}`);
    for (const [p, need] of Object.entries(helper.needs)) if (need && claims[p] === "untested") notes.push(`${p}: ${need}`);
    rows.push({ id: `${group}/${id}`, api, helper: helper.kind, claims, notes });
  }
}

const line = (r) => `| ${r.id} | ${r.api} | ${r.helper} | ${PLATFORMS.map((p) => r.claims[p]).join(" | ")} | ${r.notes.join("; ")} |`;
const md = [
  `# Plugin compatibility (this core: plugin API ${core})`, "",
  `| plugin | api | helper | ${PLATFORMS.join(" | ")} | to look at |`, `|---|---|---|${PLATFORMS.map(() => "---").join("|")}|---|`,
  ...rows.map(line), "",
  problems.length ? `## Claims the code contradicts\n\n${problems.map((p) => `- ${p}`).join("\n")}` : "No claim contradicts what its plugin needs.", "",
].join("\n");
const out = process.argv.indexOf("--md");
if (out > 0) writeFileSync(process.argv[out + 1], md);
console.log(md);
process.exit(problems.length ? 1 : 0);
