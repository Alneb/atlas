// The phone app's carried plugins (bundle-plugins.mjs): which plugins, and which of their files.
//   node --test scripts/dev/bundle-plugins.test.mjs   (build-apk.sh runs it before packing them)
import { test } from "node:test";
import assert from "node:assert/strict";
import { bundled, forPhone } from "./bundle-plugins.mjs";

test("the phone rule is plugins.rs platforms_of's", () => {
  assert.equal(forPhone('title = "A"\nphone = true\n'), true);
  assert.equal(forPhone('title = "A"\n'), false, "unsaid: not for the phone");
  assert.equal(forPhone('title = "A"\n\n[android]\nmain = "org.x.A"\n'), true, "a native plugin");
  assert.equal(forPhone('title = "A"\nphone = true\n\n[platforms]\nandroid = "no"\n'), false, "[platforms] wins");
  assert.equal(forPhone('title = "A"\n\n[platforms]\nandroid = { support = "no", why = "no shell" }\n'), false);
  assert.equal(forPhone('title = "A"\n\n[platforms]\nandroid = "partial"\n'), true);
  assert.equal(forPhone('title = "A"\n\n[platforms.android]\nsupport = "works"\n'), true);
  assert.equal(forPhone('title = "A"\n# phone = true\n'), false, "a comment says nothing");
});

test("the repository's phone plugins are carried, desktop-only ones are not", () => {
  const all = bundled();
  const ids = all.map((p) => p.id);
  console.log(`carried: ${ids.join(", ")}`);
  for (const id of ["audiobookshelf", "books", "manga"]) assert.ok(ids.includes(id), `${id} carried`);
  for (const id of ["email", "ssh", "run-tools", "finance"]) assert.ok(!ids.includes(id), `${id} (desktop only) not carried`);
  assert.ok(all.length >= 5 && all.length < 40, `a plausible count: ${all.length}`);
});

test("a carried plugin brings its run-time files, never its build inputs", () => {
  const books = bundled().find((p) => p.id === "books");
  for (const f of ["plugin.toml", "main.js", "view.js", "helper.js", "shared/marks.js", "README.md"]) assert.ok(books.files.includes(f), `books/${f}`);
  for (const p of bundled()) {
    const bad = p.files.filter((f) => /^(android|ui|helper|engine|bin|node_modules)\/|\.test\.|tsconfig\.json$|\.java$/.test(f));
    assert.deepEqual(bad, [], `${p.id} carries build inputs`);
    assert.ok(p.files.includes("plugin.toml"), `${p.id} has its manifest`);
  }
});
