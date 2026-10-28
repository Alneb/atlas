#!/usr/bin/env node
// A plugin's Svelte + TS sources → its view.js / main.js (docs/guides/PLUGIN-API.md, "A pane in Svelte"), and its
// TypeScript helper → helper.js (docs/design/DESIGN-js-helpers.md, "Building a helper in TypeScript").
//   node scripts/dev/plugin-ui.mjs plugins/beta/finance            build (writes view.js, main.js, ui-lib/, helper.js)
//   node scripts/dev/plugin-ui.mjs --check plugins/beta/finance    types + the committed build is current (+ helper tests)
//   node scripts/dev/plugin-ui.mjs --check                         every plugin that has a ui/ or a helper/
// The app's own toolchain (ui/node_modules) builds it: no second package.json, one Svelte version for the repo.
// Entries are whichever of ui/src/view.ts and ui/src/main.ts exist; CSS is injected by the components themselves.
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, lstatSync, symlinkSync, readFileSync, readdirSync, mkdtempSync, rmSync, cpSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appUi = join(repo, "ui");
const need = createRequire(join(appUi, "package.json"));
const { build } = await import(pathToFileURL(need.resolve("vite")).href);
const { svelte } = await import(pathToFileURL(need.resolve("@sveltejs/vite-plugin-svelte")).href);
const { rolldown } = await import(pathToFileURL(need.resolve("rolldown")).href);
const sdk = join(repo, "crates/atlas-core/sdk/js");

const log = (msg) => console.log(`[plugin-ui] ${msg}`);
const args = process.argv.slice(2);
const check = args.includes("--check");
let plugins = args.filter((a) => !a.startsWith("--")).map((p) => resolve(p));
if (plugins.length === 0) {
  plugins = ["plugins/beta", "plugins/stable", "plugins/alpha"].map((t) => join(repo, t)).filter(existsSync)
    .flatMap((t) => readdirSync(t).map((d) => join(t, d))).filter((d) => existsSync(join(d, "ui/src")) || hasHelper(d));
}

// The sources import "svelte" like the app's do: a link to the app's node_modules makes node resolution find it.
function linkModules(ui) {
  const nm = join(ui, "node_modules");
  if (!existsSync(nm) && !lstatSync(nm, { throwIfNoEntry: false })) symlinkSync(relative(ui, join(appUi, "node_modules")), nm, "dir");
}

async function bundle(plugin, outDir) {
  const ui = join(plugin, "ui");
  const entry = Object.fromEntries(["view", "main"].map((n) => [n, join(ui, "src", `${n}.ts`)]).filter(([, f]) => existsSync(f)));
  if (Object.keys(entry).length === 0) throw new Error(`${relative(repo, plugin)}: no ui/src/view.ts or main.ts`);
  await build({
    configFile: false, root: ui, publicDir: false, logLevel: "warn",
    plugins: [svelte({ configFile: false, compilerOptions: { css: "injected" } })],
    build: {
      outDir, emptyOutDir: false, target: "es2022", minify: true, sourcemap: false, copyPublicDir: false,
      lib: { entry, formats: ["es"], fileName: (_f, name) => `${name}.js` },
      // Shared code (Svelte's runtime) once, beside the entries, under a stable name: no hash churn in git.
      rollupOptions: { output: { chunkFileNames: "ui-lib/[name].js" } },
    },
  });
  return Object.keys(entry);
}

// Built into a scratch folder, then copied over (build) or compared (check): Vite never writes beside the sources.
async function built(plugin, use) {
  const tmp = mkdtempSync(join(tmpdir(), "plugin-ui-"));
  try {
    const names = await bundle(plugin, tmp);
    const lib = existsSync(join(tmp, "ui-lib")) ? readdirSync(join(tmp, "ui-lib")).map((f) => `ui-lib/${f}`) : [];
    return use(tmp, [...names.map((n) => `${n}.js`), ...lib]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function hasHelper(plugin) {
  return existsSync(join(plugin, "helper/helper.ts"));
}

// helper/helper.ts → one IIFE (the core loads a single script, no imports at run time); not minified, so a stack in
// the plugin's log points at readable code.
async function bundleHelper(plugin, file) {
  // a helper may export its pure functions for its tests; the IIFE drops them (nothing imports a helper at run time)
  const onLog = (level, log, next) => { if (log.code !== "MISSING_NAME_OPTION_FOR_IIFE_EXPORT") next(level, log); };
  const b = await rolldown({ input: join(plugin, "helper/helper.ts"), platform: "neutral", logLevel: "warn", onLog });
  try {
    await b.write({ file, format: "iife", banner: "// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file." });
  } finally {
    await b.close();
  }
}

// helper/*.test.ts, each bundled with the SDK's node harness (`atlas-helper/testing`) and run by node's test runner.
async function testHelper(plugin, tmp) {
  const dir = join(plugin, "helper");
  const tests = readdirSync(dir).filter((f) => f.endsWith(".test.ts"));
  for (const t of tests) {
    const out = join(tmp, t.replace(/\.ts$/, ".mjs"));
    const b = await rolldown({ input: join(dir, t), platform: "node", logLevel: "warn", external: [/^node:/], resolve: { alias: { "atlas-helper/testing": join(sdk, "testing.ts") } } });
    try {
      await b.write({ file: out, format: "esm" });
    } finally {
      await b.close();
    }
    // in the plugin's folder, as its tests read its manifest (plugin.toml) the way the core does
    execFileSync(process.execPath, ["--test", "--test-reporter=dot", out], { stdio: "inherit", cwd: plugin });
  }
  return tests.length;
}

// The helper's part of a build or a check; true when it passed.
async function helperStep(plugin, name) {
  const tmp = mkdtempSync(join(tmpdir(), "plugin-helper-"));
  try {
    const built = join(tmp, "helper.js");
    await bundleHelper(plugin, built);
    if (!check) {
      cpSync(built, join(plugin, "helper.js"));
      log(`${name}: built helper.js`);
      return true;
    }
    log(`${name}: helper types (tsc)`);
    try {
      execFileSync(join(appUi, "node_modules/.bin/tsc"), ["-p", join(plugin, "helper/tsconfig.json")], { stdio: "inherit" });
    } catch {
      log(`${name}: FAIL helper types`);
      return false;
    }
    const mine = join(plugin, "helper.js");
    if (!existsSync(mine) || readFileSync(mine, "utf8") !== readFileSync(built, "utf8")) {
      log(`${name}: FAIL stale helper.js: run node scripts/dev/plugin-ui.mjs ${name}`);
      return false;
    }
    try {
      const n = await testHelper(plugin, tmp);
      log(`${name}: helper ok (helper.js current, ${n} test file${n === 1 ? "" : "s"})`);
      return true;
    } catch {
      log(`${name}: FAIL helper tests`);
      return false;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

let failed = 0;
for (const plugin of plugins) {
  const name = relative(repo, plugin);
  if (hasHelper(plugin) && !(await helperStep(plugin, name))) failed++;
  if (!existsSync(join(plugin, "ui/src"))) continue;
  linkModules(join(plugin, "ui"));
  if (!check) {
    await built(plugin, (tmp, files) => {
      rmSync(join(plugin, "ui-lib"), { recursive: true, force: true }); // a chunk no longer built must not linger
      for (const f of files) cpSync(join(tmp, f), join(plugin, f));
      log(`${name}: built ${files.join(", ")}`);
    });
    continue;
  }
  log(`${name}: types (svelte-check)`);
  try {
    const ui = join(plugin, "ui");
    execFileSync(join(appUi, "node_modules/.bin/svelte-check"), ["--workspace", ui, "--tsconfig", join(ui, "tsconfig.json"), "--fail-on-warnings"], { stdio: "inherit" });
  } catch {
    failed++;
    log(`${name}: FAIL types`);
    continue;
  }
  // The committed bundle must be what the sources build to: a stale view.js is a change nobody can see.
  await built(plugin, (tmp, files) => {
    const stale = files.filter((f) => !existsSync(join(plugin, f)) || readFileSync(join(plugin, f), "utf8") !== readFileSync(join(tmp, f), "utf8"));
    if (stale.length) {
      failed++;
      log(`${name}: FAIL stale build (${stale.join(", ")}): run node scripts/dev/plugin-ui.mjs ${name}`);
    } else log(`${name}: ok (${files.length} files current)`);
  });
}
log(failed ? `failed: ${failed}` : `all ${plugins.length} current`);
process.exit(failed ? 1 : 0);
