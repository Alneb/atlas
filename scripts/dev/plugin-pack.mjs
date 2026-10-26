#!/usr/bin/env node
// The plugins as release archives (docs/guides/PLUGIN-API.md, "Compiled helpers and release archives").
//   node scripts/dev/plugin-pack.mjs engines [--target <arch>-<os>] [--only id,id] [--keep-going]
//       builds every plugin's Rust engine (plugins/*/<id>/engine/Cargo.toml) for one platform into
//       plugins/*/<id>/bin/<arch>-<os>/ — the folder a plugin's `run` line finds through $ATLAS_PLUGIN_TARGET.
//       Default target: this machine. --keep-going builds the others when one fails, and still exits non-zero.
//   node scripts/dev/plugin-pack.mjs pack [--out target/dist/plugins] [--bins <dir>]
//       one atlas-plugin-<id>.tar.gz per plugin of plugins/stable and plugins/beta: its tracked files without the
//       sources (engine/, ui/), plus every platform's bin/ found (in the repo, or under --bins, laid out as
//       <tier>/<id>/bin/<target>/, as CI's engine artifacts are), and plugins.json, the index of them all.
// Atlas installs such an archive from a file or its web address (plugin_install.rs).
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const log = (m) => console.log(`[plugin-pack] ${m}`);

// Atlas's platform name (plugins.rs `target()`: Rust's ARCH-OS) → the Rust target an engine is built for. Linux
// engines are static (musl) so one file runs on any distribution and in the server's container, unless the crate
// says `[package.metadata.atlas] libc = "gnu"` (C++ dependencies musl cannot build): those are built on an old glibc.
const TARGETS = {
  "x86_64-linux": { musl: "x86_64-unknown-linux-musl", gnu: "x86_64-unknown-linux-gnu" },
  "aarch64-linux": { musl: "aarch64-unknown-linux-musl", gnu: "aarch64-unknown-linux-gnu" },
  "x86_64-macos": { any: "x86_64-apple-darwin" },
  "aarch64-macos": { any: "aarch64-apple-darwin" },
  "x86_64-windows": { any: "x86_64-pc-windows-msvc" },
};

function hostTarget() {
  const arch = { x64: "x86_64", arm64: "aarch64" }[process.arch];
  const os = { linux: "linux", darwin: "macos", win32: "windows" }[process.platform];
  if (!arch || !os) throw new Error(`no plugin target for ${process.arch}-${process.platform}`);
  return `${arch}-${os}`;
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--keep-going") out.keepGoing = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

/** Every published plugin: plugins/stable/<id> and plugins/beta/<id> (examples are not released). */
function plugins() {
  return ["stable", "beta"].flatMap((tier) =>
    readdirSync(join(root, "plugins", tier))
      .filter((id) => existsSync(join(root, "plugins", tier, id, "plugin.toml")))
      .map((id) => ({ id, tier, dir: join(root, "plugins", tier, id) })),
  );
}

/** The top-level `key = "value"` of a plugin.toml (before its first table): enough for title and version. */
function manifestField(text, key) {
  const head = text.split(/^\[/m)[0];
  return head.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"))?.[1];
}

/** A plugin's engine: its crate, the binary its `run` line starts, where cargo builds it, and its libc. */
function engineOf(p) {
  const manifest = join(p.dir, "engine", "Cargo.toml");
  if (!existsSync(manifest)) return null;
  const meta = JSON.parse(execFileSync("cargo", ["metadata", "--no-deps", "--format-version", "1", "--manifest-path", manifest], { encoding: "utf8" }));
  const pkg = meta.packages.find((k) => k.manifest_path === manifest || relative(k.manifest_path, manifest) === "");
  if (!pkg) throw new Error(`${p.id}: no package at ${manifest}`);
  const bins = pkg.targets.filter((t) => t.kind.includes("bin")).map((t) => t.name);
  // more than one binary: the one the plugin's run line names (…/<name>")
  const run = readFileSync(join(p.dir, "plugin.toml"), "utf8");
  const bin = bins.length === 1 ? bins[0] : bins.find((b) => new RegExp(`/${b}\\\\?"`).test(run));
  if (!bin) throw new Error(`${p.id}: which of ${bins.join(", ")} does plugin.toml run?`);
  return { crate: pkg.name, bin, manifest, targetDir: meta.target_directory, libc: pkg.metadata?.atlas?.libc ?? "musl" };
}

function installedRustTargets() {
  const r = spawnSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" });
  return r.status === 0 ? new Set(r.stdout.split("\n").map((l) => l.trim()).filter(Boolean)) : null;
}

function onPath(name) {
  return (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":").some((d) => d && existsSync(join(d, name)));
}

/** Builds one engine for `target`; returns the installed binary's path. */
function buildEngine(p, e, target, installed) {
  const t = TARGETS[target];
  if (!t) throw new Error(`unknown target ${target} (one of ${Object.keys(TARGETS).join(", ")})`);
  let triple = t.any ?? t[e.libc];
  const env = { ...process.env };
  if (installed && !installed.has(triple)) {
    // a desktop without the static target builds for itself, as before; elsewhere a missing target is an error
    if (target !== hostTarget()) throw new Error(`${p.id}: rustup target ${triple} is not installed (rustup target add ${triple})`);
    log(`${p.id}: ${triple} not installed, building for this machine's default target (rustup target add ${triple} for a static build)`);
    triple = null;
  }
  // musl: C dependencies (ring, SQLite) need a musl C compiler
  if (triple?.endsWith("-musl")) {
    const cc = [`${triple.split("-")[0]}-linux-musl-gcc`, "musl-gcc"].find(onPath);
    if (cc) env[`CC_${triple.replaceAll("-", "_")}`] = cc;
    else log(`${p.id}: no musl C compiler (musl-gcc) on PATH: a crate with C code will fail`);
  }
  const cargo = ["build", "--release", "--manifest-path", e.manifest, "-p", e.crate, "--bin", e.bin, ...(triple ? ["--target", triple] : [])];
  log(`${p.id}: cargo ${cargo.join(" ")}`);
  const r = spawnSync("cargo", cargo, { stdio: "inherit", env });
  if (r.status !== 0) throw new Error(`${p.id}: cargo build failed for ${target} (exit ${r.status})`);
  const exe = e.bin + (target.endsWith("-windows") ? ".exe" : "");
  const built = join(e.targetDir, ...(triple ? [triple] : []), "release", exe);
  const out = join(p.dir, "bin", target);
  mkdirSync(out, { recursive: true });
  copyFileSync(built, join(out, exe));
  if (!target.endsWith("-windows")) chmodSync(join(out, exe), 0o755);
  log(`${p.id}: ${relative(root, join(out, exe))} (${(statSync(join(out, exe)).size / 1e6).toFixed(1)} MB)`);
  return join(out, exe);
}

function engines(o) {
  const target = o.target ?? hostTarget();
  const only = o.only ? new Set(o.only.split(",")) : null;
  const installed = installedRustTargets();
  const failed = [];
  for (const p of plugins().filter((p) => !only || only.has(p.id))) {
    const e = engineOf(p);
    if (!e) continue;
    try {
      buildEngine(p, e, target, installed);
    } catch (err) {
      failed.push(`${p.id}: ${err.message}`);
      log(`FAILED ${err.message}`);
      if (!o.keepGoing) break;
    }
  }
  if (failed.length) {
    log(`${failed.length} engine(s) not built for ${target}:\n  ${failed.join("\n  ")}`);
    process.exit(1);
  }
  log(`every engine built for ${target}`);
}

/** The files a plugin ships: tracked by git, without its sources. */
function shippedFiles(p) {
  const rel = relative(root, p.dir);
  return execFileSync("git", ["-C", root, "ls-files", "-z", "--", rel], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((f) => relative(rel, f))
    .filter((f) => !/^(engine|ui)\//.test(f));
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function pack(o) {
  const out = join(root, o.out ?? "target/dist/plugins");
  const stage = join(out, ".stage");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const index = [];
  for (const p of plugins()) {
    const dest = join(stage, p.id);
    for (const f of shippedFiles(p)) {
      mkdirSync(dirname(join(dest, f)), { recursive: true });
      copyFileSync(join(p.dir, f), join(dest, f));
    }
    // the built engines: the repo's own bin/, and those other machines built (--bins <dir>/<tier>/<id>/bin/<target>)
    const binDirs = [join(p.dir, "bin"), ...(o.bins ? [join(o.bins, p.tier, p.id, "bin")] : [])];
    const targets = new Set();
    for (const b of binDirs.filter(existsSync)) {
      for (const t of readdirSync(b).filter((t) => TARGETS[t])) {
        for (const f of readdirSync(join(b, t))) {
          mkdirSync(join(dest, "bin", t), { recursive: true });
          copyFileSync(join(b, t, f), join(dest, "bin", t, f));
          if (!t.endsWith("-windows")) chmodSync(join(dest, "bin", t, f), 0o755);
        }
        targets.add(t);
      }
    }
    const engine = existsSync(join(p.dir, "engine", "Cargo.toml"));
    const file = `atlas-plugin-${p.id}.tar.gz`;
    execFileSync("tar", ["-czf", join(out, file), "-C", stage, p.id]);
    const text = readFileSync(join(p.dir, "plugin.toml"), "utf8");
    index.push({
      id: p.id,
      title: manifestField(text, "title") ?? p.id,
      version: manifestField(text, "version") ?? null,
      tier: p.tier,
      // a plugin without an engine is plain files: every platform; one with an engine runs where it was built
      platforms: engine ? [...targets].sort() : "any",
      file,
      size: statSync(join(out, file)).size,
      sha256: sha256(join(out, file)),
    });
    log(`${file}: ${engine ? `engine for ${[...targets].sort().join(", ") || "NO platform"}` : "no engine"}`);
  }
  rmSync(stage, { recursive: true, force: true });
  writeFileSync(join(out, "plugins.json"), JSON.stringify(index, null, 2) + "\n");
  const missing = index.filter((i) => Array.isArray(i.platforms) && i.platforms.length === 0);
  log(`${index.length} plugins packed into ${relative(root, out)}${missing.length ? `; with an engine but no build: ${missing.map((m) => m.id).join(", ")}` : ""}`);
}

const o = args(process.argv.slice(2));
const cmd = o._[0];
if (cmd === "engines") engines(o);
else if (cmd === "pack") pack(o);
else {
  console.error("usage: plugin-pack.mjs engines [--target <arch>-<os>] [--only id,id] [--keep-going] | pack [--out dir] [--bins dir]");
  process.exit(2);
}
