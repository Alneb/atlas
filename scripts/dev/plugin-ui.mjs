#!/usr/bin/env node
// A plugin's Svelte + TS sources → its view.js / main.js (docs/guides/PLUGIN-API.md, "A pane in Svelte").
//   node scripts/dev/plugin-ui.mjs plugins/beta/finance            build (writes view.js, main.js, ui-lib/)
//   node scripts/dev/plugin-ui.mjs --check plugins/beta/finance    types (svelte-check) + the committed build is current
//   node scripts/dev/plugin-ui.mjs --check                         every plugin that has a ui/
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

const log = (msg) => console.log(`[plugin-ui] ${msg}`);
const args = process.argv.slice(2);
const check = args.includes("--check");
let plugins = args.filter((a) => !a.startsWith("--")).map((p) => resolve(p));
if (plugins.length === 0) {
  plugins = ["plugins/beta", "plugins/stable", "plugins/alpha"].map((t) => join(repo, t)).filter(existsSync)
    .flatMap((t) => readdirSync(t).map((d) => join(t, d))).filter((d) => existsSync(join(d, "ui/src")));
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

let failed = 0;
for (const plugin of plugins) {
  const name = relative(repo, plugin);
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
