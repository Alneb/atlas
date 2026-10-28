// Wikipedia's answers (cut down) as the catalog sees them, through the SDK's harness.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness, Reply } from "atlas-helper/testing";
import { kindOf, qualifier, queryUrl } from "./helper";

/** The query API's answer: the page's description and external links. */
const wiki = (description: string, links: string[] = []) => () => ({ query: { pages: [{ title: "X", description, extlinks: links.map((url) => ({ url })) }] } });

beforeEach(() => harness.reset());

test("one request asks the description and links of the decoded title", () => {
  assert.equal(queryUrl("es", "%C2%A1Caigan_las_rosas_blancas%21"),
    "https://es.wikipedia.org/w/api.php?action=query&prop=description%7Cextlinks&titles=%C2%A1Caigan_las_rosas_blancas%21&ellimit=500&redirects=1&format=json&formatversion=2");
});

test("descriptions say what a page is about, in several languages", () => {
  const cases: [string, string | null][] = [
    ["2023 film by Ari Aster", "movie"], ["Japanese jidaigeki film", "movie"], ["película de 2026 dirigida por Los Javis", "movie"],
    ["American crime drama TV series", "show"], ["2000 studio album by Radiohead", "album"], ["1965 science fiction novel by Frank Herbert", "book"],
    ["Japanese manga series", "manga"], ["English rock band", "artist"], ["canción de Rosalía", "song"], ["Physical phenomenon", null],
    // wordings that were filed as web pages in a 1000-capture run
    ["Series of Dragonlance novels", "book"], ["2016 American television drama", "show"], ["American daytime television soap opera (since 1973)", "show"],
    ["1973 treatise by Hawking and Ellis", "book"], ["Collection of gekiga short stories by Yoshihiro Tatsumi", "manga"],
    ["1995 cyberpunk original video animation series", "anime"], ["2019 Hong Kong documentary by Cheuk Cheung", "movie"],
    ["cortometraje español de 2002", "movie"], ["Swedish hip hop group", "artist"], ["Dutch dance music group", "artist"],
    ["American a cappella group", "artist"], ["Taiwanese indigenous song and dance troupe", "artist"], ["Ethnic group in Peru", null],
    ["1975 Australian television film", "movie"], ["British-born American physicist", null],
    // where JavaScript's ASCII \b would have missed
    ["álbum de estudio de Rosalía", "album"], ["álbum", "album"], ["unalbum", null],
  ];
  for (const [d, kind] of cases) assert.equal(kindOf(d), kind, d);
});

test("a film page gives its own ids, not the books it cites", async () => {
  harness.web = wiki("2023 film by Ari Aster", ["https://www.imdb.com/title/tt13521006/", "https://books.google.com/books?isbn=9781841505510"]);
  const [c] = (await harness.call("recognize", { text: "https://en.wikipedia.org/wiki/Beau_Is_Afraid" })).candidates;
  assert.deepEqual([c.kind, c.ids], ["movie", { url: "https://en.wikipedia.org/wiki/Beau_Is_Afraid", imdb: "tt13521006" }]);
  assert.equal(harness.asked[0].headers?.["User-Agent"], "Atlas/0.1 (personal notes app) catalog-wikipedia");
});

test("a page about something else stays a web page, and other links are not asked", async () => {
  harness.web = wiki("Physical phenomenon");
  assert.deepEqual(await harness.call("recognize", { text: "https://en.wikipedia.org/wiki/Quantum_entanglement" }), { candidates: [] });
  harness.reset();
  assert.deepEqual(await harness.call("recognize", { text: "https://example.org/wiki/x" }), { candidates: [] });
  assert.equal(harness.asked.length, 0);
});

test("a title's qualifier files it when Wikipedia is busy", async () => {
  harness.web = () => new Reply(500);
  const [got] = (await harness.call("recognize", { url: "https://en.wikipedia.org/wiki/Apollo_11_(2019_film)" })).candidates;
  assert.deepEqual([got.kind, got.ids], ["movie", { url: "https://en.wikipedia.org/wiki/Apollo_11_(2019_film)" }]);
  assert.equal(qualifier("OK_Computer_(album)"), "album");
  assert.equal(kindOf(qualifier("Blur_(band)")), "artist");
  harness.web = wiki("2010 single by Narsha from the album Bbi Ri Bba Bba");
  assert.equal((await harness.call("recognize", { url: "https://en.wikipedia.org/wiki/Bbi_Ri_Bba_Bba_(Narsha_song)" })).candidates[0].kind, "song");
  harness.web = () => new Reply(500);
  // no qualifier: the error is reported, never filed as a web page
  await assert.rejects(harness.call("recognize", { url: "https://en.wikipedia.org/wiki/Arctic_Dogs" }));
});
