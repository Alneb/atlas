#!/usr/bin/env node
// The app's version set everywhere it is written, in one step, before a release is tagged (docs/guides/DEVELOPING.md, "Releasing to the desktop"):
//   node scripts/dev/release-version.mjs <x.y.z> [--date YYYY-MM-DD] [--check]
// --check: only say where the version stands, changing nothing (fails when the places disagree).
// The places: the workspace's Cargo.toml and its crates in Cargo.lock, ui/package.json and its lock, tauri.conf.json,
// the two Android manifests (versionName; versionCode one more, so a phone installs it over the last), the flatpak
// metainfo (a release line). Each place must hold the old version in the shape expected, or nothing is written.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const dateAt = args.indexOf("--date");
const date = dateAt >= 0 ? args[dateAt + 1] : new Date().toISOString().slice(0, 10);
const next = args.find((a, i) => !a.startsWith("--") && (dateAt < 0 || i !== dateAt + 1));
const SEMVER = /^\d+\.\d+\.\d+$/;

const read = (rel) => readFileSync(join(repo, rel), "utf8");
const say = (line) => console.log(`[version] ${line}`);
const fail = (why) => { console.error(`[version] ${why}`); process.exit(1); };

if (!check && !SEMVER.test(next ?? "")) fail("usage: release-version.mjs <x.y.z> [--date YYYY-MM-DD] | --check");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`--date ${date}: not YYYY-MM-DD`);

/** One place the version is written: how to read it from the file's text, and how to write a new one. */
const one = (re) => ({
  get: (t) => t.match(re)?.[1],
  set: (t, v) => t.replace(re, (m, old) => m.replace(old, v)),
});

const workspaceCrates = () => {
  const members = read("Cargo.toml").match(/^members = \[([^\]]*)\]/m)[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1));
  return members.map((m) => read(join(m, "Cargo.toml")))
    .filter((t) => /^version\.workspace = true/m.test(t))
    .map((t) => t.match(/^name = "([^"]+)"/m)[1]);
};

/** Cargo.lock: the blocks of the crates that take the workspace's version (path crates, no `source`). */
const lock = (() => {
  const names = new Set(workspaceCrates());
  const blocks = (t) => t.split("[[package]]").map((b) => ({ b, name: b.match(/^name = "([^"]+)"/m)?.[1] }));
  const ours = (t) => blocks(t).filter(({ b, name }) => names.has(name) && !/^source =/m.test(b));
  return {
    get: (t) => {
      const vs = new Set(ours(t).map(({ b }) => b.match(/^version = "([^"]+)"/m)[1]));
      return vs.size === 1 ? [...vs][0] : vs.size ? `mixed (${[...vs].join(", ")})` : undefined;
    },
    set: (t, v) => blocks(t).map(({ b, name }) => (names.has(name) && !/^source =/m.test(b)
      ? b.replace(/^version = "[^"]+"/m, `version = "${v}"`) : b)).join("[[package]]"),
  };
})();

const manifest = {
  get: (t) => t.match(/android:versionName="([^"]+)"/)?.[1],
  set: (t, v) => t
    .replace(/android:versionName="[^"]+"/, `android:versionName="${v}"`)
    .replace(/android:versionCode="(\d+)"/, (_, n) => `android:versionCode="${Number(n) + 1}"`),
};

const metainfo = {
  get: (t) => t.match(/<release version="([^"]+)"/)?.[1],
  set: (t, v) => t.replace(/(\n(\s*)<release version=)/, `\n$2<release version="${v}" date="${date}"/>$1`),
};

const PLACES = [
  ["Cargo.toml", one(/\[workspace\.package\]\nversion = "([^"]+)"/)],
  ["Cargo.lock", lock],
  ["ui/package.json", one(/^  "version": "([^"]+)"/m)],
  ["ui/package-lock.json", { // the top entry and the root package's, both
    get: (t) => { const a = t.match(/^  "version": "([^"]+)"/m)?.[1], b = t.match(/"": \{\n\s*"name": "[^"]+",\n\s*"version": "([^"]+)"/)?.[1]; return a === b ? a : `mixed (${a}, ${b})`; },
    set: (t, v) => t.replace(/^(  "version": ")[^"]+"/m, `$1${v}"`).replace(/("": \{\n\s*"name": "[^"]+",\n\s*"version": ")[^"]+"/, `$1${v}"`),
  }],
  ["crates/atlas-app/tauri.conf.json", one(/^  "version": "([^"]+)"/m)],
  ["crates/atlas-android/android/AndroidManifest.atlas.xml", manifest],
  ["crates/atlas-android/android/AndroidManifest.capture.xml", manifest],
  ["packaging/flatpak/io.github.alneb.Atlas.metainfo.xml", metainfo],
];

const found = PLACES.map(([rel, p]) => ({ rel, p, text: read(rel), now: p.get(read(rel)) }));
for (const f of found) say(`${f.rel}: ${f.now ?? "NOT FOUND (its shape changed: update this script)"}`);
const versions = new Set(found.map((f) => f.now));
if (found.some((f) => !f.now || !SEMVER.test(f.now)) || versions.size !== 1) fail("the places disagree or one was not read: nothing written");
const old = found[0].now;
if (check) { say(`all at ${old}`); process.exit(0); }
if (next === old) fail(`already ${old}`);

for (const f of found) {
  const out = f.p.set(f.text, next);
  if (f.p.get(out) !== next) fail(`${f.rel}: the new version did not land (nothing written)`);
  f.out = out;
}
for (const f of found) writeFileSync(join(repo, f.rel), f.out);
say(`${old} → ${next} in ${found.length} files (flatpak release dated ${date}); next: a CHANGELOG heading, commit, port, tag`);
