// The agents' tools over a stand-in copyparty: `?ls` answers in copyparty's JSON shape (dirs/files with hrefs).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness } from "atlas-helper/testing";
import "./helper";
import { fileUrl, matches } from "./helper";

const SERVER = "https://files.example.org/hdd1";
const TREE: Record<string, { dirs: string[]; files: string[] }> = {
  "/": { dirs: ["Physics"], files: ["notes.txt"] },
  "/Physics/": { dirs: ["Books"], files: [] },
  "/Physics/Books/": { dirs: ["Condensed Matter"], files: ["Mermin - Statistical.pdf"] },
  "/Physics/Books/Condensed Matter/": { dirs: [], files: ["Solid_State_Physics_Ashcroft.pdf", "Kittel.djvu"] },
};
const settings = { servers: [{ name: "nas", url: `${SERVER}/` }] };
let filed: unknown[] = [];

beforeEach(() => {
  harness.reset();
  filed = [];
  harness.web = (url) => {
    const m = /^https:\/\/files\.example\.org\/hdd1(.*)\?ls&dots$/.exec(url);
    const dir = m && TREE[decodeURIComponent(m[1])];
    if (!dir) return null;
    const href = (n: string, d = false) => encodeURIComponent(n) + (d ? "/" : "");
    return { dirs: dir.dirs.map((d) => ({ href: href(d, true) })), files: dir.files.map((f) => ({ href: href(f), sz: 1000 })) };
  };
  harness.api = (verb, path, body) => {
    if (/\/secrets\//.test(path)) return { value: null };
    if (verb === "POST" && path === "/api/plugins/catalog/tools/add") { filed.push(body); return { path: "refs/papers/ashcroft1976solid/ashcroft1976solid.md", outcome: "delegated", kind: "paper" }; }
    throw new Error(`unexpected ${verb} ${path}`);
  };
});

test("a folder is listed with each file's address", async () => {
  const r = await harness.call("list", { settings, path: "/Physics/Books" });
  assert.deepEqual(r.entries.map((e: { name: string; kind: string }) => `${e.kind}:${e.name}`), ["dir:Condensed Matter", "file:Mermin - Statistical.pdf"]);
  assert.equal(r.entries[1].url, `${SERVER}/Physics/Books/Mermin%20-%20Statistical.pdf`);
});

test("words find files anywhere under the path, nearest first", async () => {
  const r = await harness.call("list", { settings, query: "solid state" });
  assert.deepEqual(r.found.map((e: { path: string }) => e.path), ["/Physics/Books/Condensed Matter/Solid_State_Physics_Ashcroft.pdf"]);
  assert.equal(matches("Solid_State_Physics_Ashcroft.pdf", "ashcroft physics"), true);
  assert.equal(matches("Kittel.djvu", "ashcroft"), false);
});

test("a file is handed to the catalog by its address", async () => {
  const r = await harness.call("file", { settings, server: "nas", path: "/Physics/Books/Condensed Matter/Solid_State_Physics_Ashcroft.pdf" });
  assert.deepEqual(filed, [{ text: `${SERVER}/Physics/Books/Condensed%20Matter/Solid_State_Physics_Ashcroft.pdf` }]);
  assert.equal(r.note, "refs/papers/ashcroft1976solid/ashcroft1976solid.md");
  assert.equal(fileUrl({ name: "nas", url: SERVER }, "a b/c.pdf"), `${SERVER}/a%20b/c.pdf`);
  await assert.rejects(harness.call("file", { settings, server: "home", path: "/x.pdf" }), /no copyparty server “home”: nas/);
});

test("behind a password a PDF is downloaded with it and filed by the references plugin, not fetched by the catalog", async () => {
  const calls: { verb: string; path: string; body: any }[] = [];
  let header: unknown;
  harness.web = (url, req) => { header = req.headers?.pw; return url.endsWith("Ashcroft.pdf") ? "%PDF-1.5 …" : null; };
  harness.native = (op) => (op === "cache.head" ? "%PDF-1.5" : null);
  harness.api = (verb, path, body) => {
    calls.push({ verb, path, body });
    if (/\/secrets\//.test(path)) return { value: "s3cret" };
    if (path === "/api/plugins") return [{ id: "catalog-papers", provides: ["references"], has_helper: true }];
    if (path === "/api/fs/move") return {};
    if (path === "/api/plugins/catalog-papers/helper") return { paper: { key: "ashcroft1976solid", dir: "refs/books/ashcroft1976solid", kind: "book" }, created: true, pdf: true };
    throw new Error(`unexpected ${verb} ${path}`);
  };
  const r = await harness.call("file", { settings, server: "nas", path: "/Physics/Books/Condensed Matter/Solid_State_Physics_Ashcroft.pdf" });
  assert.deepEqual(header, { secret: "servers.nas.password" }, "the core fills in the password");
  const move = calls.find((c) => c.path === "/api/fs/move")!, imp = calls.find((c) => c.path.endsWith("/helper"))!;
  assert.match(move.body.to, /^\.atlas\/cache\/plugins\/catalog-papers\/import-\d+-Solid_State_Physics_Ashcroft\.pdf$/);
  assert.deepEqual(imp.body.params, { path: move.body.to, name: "Solid_State_Physics_Ashcroft.pdf", url: `${SERVER}/Physics/Books/Condensed%20Matter/Solid_State_Physics_Ashcroft.pdf`, keep_name: true });
  assert.ok(!calls.some((c) => c.path.includes("/catalog/tools/add")), "the catalog's fetch has no password");
  assert.deepEqual([r.note, r.kind, r.outcome], ["refs/books/ashcroft1976solid/ashcroft1976solid.md", "book", "filed"]);
});

test("behind a password, a page that is not a PDF (a sign-in) is said so", async () => {
  harness.web = () => "<html>login</html>";
  harness.native = () => "<html>";
  harness.api = (_verb, path) => (/\/secrets\//.test(path) ? { value: "s3cret" } : path === "/api/plugins" ? [{ id: "catalog-papers", provides: ["references"], has_helper: true }] : {});
  await assert.rejects(harness.call("file", { settings, server: "nas", path: "/Physics/Books/Mermin - Statistical.pdf" }), /did not come back as a PDF/);
});
