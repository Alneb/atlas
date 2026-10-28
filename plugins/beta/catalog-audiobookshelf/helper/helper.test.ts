// Audiobookshelf's answers (cut down) as the catalog sees them.
import { test } from "node:test";
import assert from "node:assert/strict";
import "atlas-helper/testing"; // the global `atlas` the helper uses
import { bookOf, lookupWith, syncWith } from "./helper";

const SERVER = "https://abs.example.org";
const ITEM = { // /api/libraries/<id>/items: the minified shape
  id: "li_dune", media: { duration: 76680.5, metadata: {
    title: "Dune", authorName: "Frank Herbert", narratorName: "Scott Brick, Orlagh Cassidy",
    publishedYear: "2007", publisher: "Macmillan Audio", isbn: "978-1-4272-0103-5", genres: ["Science Fiction"] } } };
const EXPANDED = { id: "li_dune", media: { duration: 76680.5, metadata: { title: "Dune", authors: [{ id: "a1", name: "Frank Herbert" }], narrators: ["Scott Brick"], isbn: "9781427201035" } } };
const SETTINGS = { settings: { server: `${SERVER}/` }, secrets: { token: "t" } };

/** The server: an answer per path (its query left out), what was asked. */
function server(answers: Record<string, object>) {
  const asked: string[] = [];
  return { asked, get: async (path: string) => { asked.push(path); return answers[path.split("?")[0]] ?? null; } };
}

test("an item gives narrator, listening time and the link", () => {
  const b = bookOf(ITEM, SERVER);
  assert.deepEqual(b.ids, { audiobookshelf: "li_dune", isbn: "9781427201035" });
  assert.deepEqual(b.fields.narrator, ["Scott Brick", "Orlagh Cassidy"]);
  assert.deepEqual([b.fields.duration, b.fields.year, b.fields.audiobook], ["21h 18m", 2007, `${SERVER}/item/li_dune`]);
  assert.equal(bookOf(EXPANDED, SERVER).fields.author, "Frank Herbert");
});

test("a book is found by ISBN, never by a near title; podcast libraries are not asked", async () => {
  const s = server({ "/api/libraries": { libraries: [{ id: "L1", mediaType: "book" }, { id: "P", mediaType: "podcast" }] },
    "/api/libraries/L1/search": { book: [{ libraryItem: { id: "x", media: { metadata: { title: "Dune Messiah" } } } }, { libraryItem: EXPANDED }] } });
  const got = await lookupWith(s.get, { ...SETTINGS, kind: "book", ids: { isbn: "9781427201035" } });
  assert.ok("ids" in got);
  assert.equal(got.ids.audiobookshelf, "li_dune");
  assert.ok(!s.asked.some((a) => a.includes("/P/")));
  const near = server({ "/api/libraries": { libraries: [{ id: "L1" }] }, "/api/libraries/L1/search": { book: [{ libraryItem: { id: "x", media: { metadata: { title: "Dune Messiah" } } } }] } });
  assert.ok("skipped" in (await lookupWith(near.get, { ...SETTINGS, kind: "book", ids: { isbn: "1" }, hints: { title: "Dune" } })));
});

test("without a server nothing is asked", async () => {
  const s = server({});
  assert.ok("skipped" in (await lookupWith(s.get, { kind: "book", ids: { isbn: "9781427201035" } })));
  assert.equal(s.asked.length, 0);
});

test("sync files new and newly finished books once", async () => {
  const s = server({ "/api/libraries": { libraries: [{ id: "L1", mediaType: "book" }] }, "/api/libraries/L1/items": { results: [ITEM], total: 1 },
    "/api/me": { mediaProgress: [{ libraryItemId: "li_dune", isFinished: true }] } });
  const added: any[] = [];
  let state = {};
  const run = () => syncWith({ get: s.get, add: async (b) => added.push(b), load: async () => state, save: async (x) => { state = x; } }, SETTINGS);
  assert.equal((await run()).filed, 1);
  assert.deepEqual([added[0].kind, added[0].own, added[0].ids.audiobookshelf], ["book", { status: "[[read]]" }, "li_dune"]);
  assert.equal((await run()).filed, 0, "nothing new: nothing sent");
});
