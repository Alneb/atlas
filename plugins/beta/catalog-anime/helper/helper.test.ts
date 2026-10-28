// AniList's and MangaDex's answers (cut down, in their real shapes).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { harness } from "atlas-helper/testing";
import { plain } from "./helper";

const BERSERK = { data: { Media: { id: 30002, idMal: 2, status: "RELEASING", chapters: null, volumes: null, genres: ["Action", "Adventure", "Drama", "Fantasy", "Horror", "Psychological"],
  description: "His name is Guts, the Black Swordsman.<br><br>\n(Source: Dark Horse)", title: { romaji: "Berserk", english: "Berserk", native: "ベルセルク" },
  startDate: { year: 1989 }, coverImage: { extraLarge: "https://s4.anilist.co/b30002.jpg" },
  staff: { edges: [{ role: "Story & Art", node: { name: { full: "Kentarou Miura" } } }, { role: "Translator (English)", node: { name: { full: "Someone" } } }] } } } };

/** The GraphQL variables each AniList request asked. */
const asked = () => harness.asked.filter((r) => r.url.includes("anilist")).map((r) => JSON.parse(String(r.body)).variables);

beforeEach(() => harness.reset());

test("a manga with its author, original title and status", async () => {
  harness.web = () => BERSERK;
  const r = await harness.call("lookup", { kind: "manga", ids: { anilist: "30002" } });
  assert.deepEqual(asked(), [{ type: "MANGA", id: 30002 }]);
  const f = r.fields;
  assert.deepEqual([f.title, f.original_title, f.language, f.author, f.year, f.publication], ["Berserk", "ベルセルク", "ja", "Kentarou Miura", 1989, "ongoing"]);
  assert.equal(f.description, "His name is Guts, the Black Swordsman.", "markup and the source line dropped");
  assert.deepEqual(f.genres, ["Action", "Adventure", "Drama", "Fantasy", "Horror"]);
  assert.equal("chapters" in f, false, "an unknown count is left out");
  assert.deepEqual(r.ids, { anilist: "30002", myanimelist: "2" });
});

test("a MangaDex title is found by the links MangaDex keeps", async () => {
  harness.web = (url) => (url.includes("mangadex") ? { data: { attributes: { links: { al: "30002", mal: "2" } } } } : BERSERK);
  await harness.call("lookup", { kind: "manga", ids: { mangadex: "801513ba-a712-498c-8f57-cae55b38cc92" } });
  assert.equal(asked()[0].id, 30002);
  harness.reset();
  harness.web = () => ({ data: { attributes: { links: {} } } });
  assert.ok((await harness.call("lookup", { kind: "manga", ids: { mangadex: "x" } })).skipped);
});

test("an anime by its MyAnimeList id gets its studio", async () => {
  harness.web = () => ({ data: { Media: { ...BERSERK.data.Media, episodes: 25, studios: { nodes: [{ name: "OLM" }] } } } });
  const r = await harness.call("lookup", { kind: "anime", ids: { myanimelist: "33" } });
  assert.deepEqual(asked(), [{ type: "ANIME", mal: 33 }]);
  assert.deepEqual([r.fields.studio, r.fields.episodes, r.fields.author], ["OLM", 25, undefined]);
  assert.equal(plain("a<i>b</i><br/>c"), "ab\nc");
});
