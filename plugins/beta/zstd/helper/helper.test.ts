// The helper through the SDK's harness, zstd faked (`harness.exec`) and the core's file API recorded. The pruning runs
// against a fake cache: `find` lists `cache`, `rm` deletes from it, `touch` stamps a copy with the current time.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness } from "atlas-helper/testing";
import { copyPath, parseListing, victims } from "./helper";
import "./helper";

const HOUR = 3600;
const MB = 1024 * 1024;
const DIR = "./.atlas/cache/plugins/test";

let written: string[] = [];
/** The fake cache: path inside it → last open (seconds) and size. */
let cache: Map<string, { mtime: number; size: number }>;
/** More entries `find` answers (what an odd or hostile listing could hold). */
let extra = "";
let removed: string[] = [];
let warned: string[] = [];

beforeEach(() => {
  harness.reset();
  written = [];
  cache = new Map();
  extra = "";
  removed = [];
  warned = [];
  console.warn = (m: string) => void warned.push(m);
  harness.api = (verb, path, body) => {
    if (verb === "PUT" && path === "/api/file") written.push(body.path);
    return {};
  };
  harness.exec = (program, args) => {
    const now = Date.now() / 1000;
    if (program === "zstd") {
      const out = args[args.indexOf("-o") + 1].slice(DIR.length + 1);
      cache.set(out, { mtime: now - 1000 * HOUR, size: 10 * MB }); // zstd keeps the .zst's old mtime
    } else if (program === "touch") {
      const f = cache.get(args.at(-1)!.slice(DIR.length + 1));
      if (f) f.mtime = now;
    } else if (program === "find" && args.includes("-printf")) {
      const list = [...cache].map(([rel, f]) => `${f.mtime}\t${f.size}\t${rel}\0`).join("");
      return { status: 0, stdout: list + extra, stderr: "" };
    } else if (program === "rm") {
      for (const a of args.slice(1)) {
        removed.push(a);
        cache.delete(a.slice(DIR.length + 1));
      }
    }
    return { status: 0, stdout: "", stderr: "" };
  };
});

const ago = (hours: number) => Date.now() / 1000 - hours * HOUR;

test("the copy keeps the folders and the inner name, so it opens in that file's view", () => {
  assert.equal(copyPath("zstd", "runs/a/b.tsv.zst"), ".atlas/cache/plugins/zstd/runs/a/b.tsv");
  assert.equal(copyPath("zstd", "x.ZST"), ".atlas/cache/plugins/zstd/x");
});

test("open decompresses into the cache and answers the copy's path", async () => {
  const r = await harness.call("open", { path: "runs/a/b.tsv.zst" });
  const out = r.path;
  assert.equal(out, ".atlas/cache/plugins/test/runs/a/b.tsv");
  assert.deepEqual(written, [out], "the folder is made through the core first");
  assert.equal(harness.ran[0].program, "zstd");
  assert.deepEqual(harness.ran[0].args, ["-d", "-q", "-f", "-o", `./${out}`, "./runs/a/b.tsv.zst"]);
  assert.deepEqual([harness.ran[1].program, ...harness.ran[1].args], ["touch", "-c", `./${out}`], "stamped as opened now");
});

test("zstd's error is the answer", async () => {
  harness.exec = () => ({ status: 1, stdout: "", stderr: "zstd: b.tsv.zst: unsupported format\n" });
  await assert.rejects(harness.call("open", { path: "b.tsv.zst" }), /unsupported format/);
});

test("only a .zst inside the vault", async () => {
  await assert.rejects(harness.call("open", { path: "a.tsv" }), /not a \.zst/);
  await assert.rejects(harness.call("open", { path: "../x.zst" }), /not a vault path/);
  assert.equal(harness.ran.length, 0);
});

test("copies not opened for a day are deleted, newer ones kept, empty folders taken away", async () => {
  cache.set("old/a.tsv", { mtime: ago(25), size: 1 });
  cache.set("recent.tsv", { mtime: ago(23), size: 1 });
  await harness.call("open", { path: "runs/b.tsv.zst" });
  assert.deepEqual(removed, [`${DIR}/old/a.tsv`]);
  assert.deepEqual([...cache.keys()].sort(), ["recent.tsv", "runs/b.tsv"]);
  const last = harness.ran.at(-1)!;
  assert.deepEqual([last.program, ...last.args], ["find", DIR, "-mindepth", "1", "-type", "d", "-empty", "-delete"]);
});

test("nothing deleted, no folder sweep, when all is young and small", async () => {
  cache.set("a.tsv", { mtime: ago(1), size: 1 });
  await harness.call("open", { path: "b.tsv.zst" });
  assert.deepEqual(removed, []);
  assert.equal(harness.ran.filter((r) => r.args.includes("-empty")).length, 0);
});

test("past the size cap the oldest copies go first, until the rest fits", async () => {
  cache.set("a.tsv", { mtime: ago(3), size: 300 * MB });
  cache.set("b.tsv", { mtime: ago(2), size: 200 * MB });
  cache.set("c.tsv", { mtime: ago(1), size: 100 * MB });
  await harness.call("open", { path: "new.tsv.zst" }); // + 10 MB: 610 MB in all
  assert.deepEqual(removed, [`${DIR}/a.tsv`], "310 MB left, under 500");
});

test("the limits come from the settings", async () => {
  cache.set("a.tsv", { mtime: ago(3), size: 1 });
  cache.set("b.tsv", { mtime: ago(1), size: 30 * MB });
  await harness.call("open", { path: "new.tsv.zst", settings: { cache_hours: 2, cache_mb: 20 } });
  assert.deepEqual(removed, [`${DIR}/a.tsv`, `${DIR}/b.tsv`]);
});

test("the copy just made is never deleted, even alone over the cap or with zstd's old mtime", async () => {
  const files = [{ rel: "big.tsv", mtime: ago(1000), size: 900 * MB }, { rel: "x.tsv", mtime: ago(1), size: 1 }];
  assert.deepEqual(victims(files, "big.tsv", ago(0), 24 * HOUR, 500 * MB), ["x.tsv"]);
  // through open: the new 10 MB copy alone is over a 1 MB cap; the other goes, it stays
  cache.set("y.tsv", { mtime: ago(1), size: 1 });
  await harness.call("open", { path: "huge.tsv.zst", settings: { cache_mb: 1 } });
  assert.ok(cache.has("huge.tsv"));
  assert.deepEqual(removed, [`${DIR}/y.tsv`]);
});

test("nothing outside the cache is touched, whatever find answers", async () => {
  extra = `${ago(99)}\t1\t../../../notes/a.md\0${ago(99)}\t1\t/etc/passwd\0${ago(99)}\t1\ta/./b\0garbage\0${ago(99)}\t1\t\0`;
  cache.set("old.tsv", { mtime: ago(99), size: 1 });
  await harness.call("open", { path: "x.tsv.zst" });
  assert.deepEqual(removed, [`${DIR}/old.tsv`]);
  for (const r of harness.ran.filter((r) => r.program !== "zstd")) {
    for (const a of r.args.filter((a) => a.startsWith("./"))) assert.ok(a === DIR || a.startsWith(`${DIR}/`), a);
  }
  assert.deepEqual(parseListing(`1\t2\ta\tb\0`), [{ rel: "a\tb", mtime: 1, size: 2 }], "a tab in a name survives");
});

test("a pruning failure is logged, never the open's", async () => {
  harness.exec = (program) =>
    program === "find" ? { status: 1, stdout: "", stderr: "find: -printf: unknown primary\n" } : { status: 0, stdout: "", stderr: "" };
  const r = await harness.call("open", { path: "x.tsv.zst" });
  assert.equal(r.path, ".atlas/cache/plugins/test/x.tsv");
  assert.equal(warned.length, 1);
  assert.match(warned[0], /not pruned: find: -printf: unknown primary/);
});
