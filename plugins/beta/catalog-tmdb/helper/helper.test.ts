// TMDB's answers (cut down) as the catalog sees them: the API with a token, the website without.
import { test } from "node:test";
import assert from "node:assert/strict";
import "atlas-helper/testing"; // the global `atlas` (url.quote, html.unescape) the helper uses
import { detailsWith, pageFields, searchPage, searchWith, siteDetailsWith, siteSearchWith } from "./helper";

const SEARCH = { results: [
  { media_type: "movie", id: 438631, title: "Dune", release_date: "2021-09-15", poster_path: "/d5.jpg" },
  { media_type: "movie", id: 841, title: "Dune", release_date: "1984-12-14" },
  { media_type: "tv", id: 90228, name: "Dune: Prophecy", first_air_date: "2024-11-17" },
  { media_type: "person", id: 1, name: "Someone" },
] };
const MOVIE = { title: "Dune", original_title: "Dune", release_date: "2021-09-15", overview: "Paul…", genres: [{ name: "Science Fiction" }], runtime: 155, poster_path: "/d5.jpg",
  credits: { crew: [{ job: "Director", name: "Denis Villeneuve" }, { job: "Writer", name: "Eric Roth" }], cast: [{ name: "Timothée Chalamet" }, { name: "Zendaya" }] },
  external_ids: { imdb_id: "tt1160419", wikidata_id: "Q60834962" } };

const SITE_PAGE = `<script type="application/ld+json">
/* <![CDATA[ */
{"@context":"https://schema.org","@type":"Movie","name":"The Realm","description":"Manuel, a Spanish politician.","duration":"PT2H12M","genre":["Thriller","Drama"],"image":"https://image.tmdb.org/t/p/w500/x.jpg","releasedEvent":[{"@type":"PublicationEvent","startDate":"2018-09-28"}]}
/* ]]> */
</script>
<ol class="people no_image"><li class="profile">
  <p><a href="/person/1-rodrigo-sorogoyen?language=en-US">Rodrigo Sorogoyen</a></p>
  <p class="character">Director, Writer</p>
</li><li class="profile">
  <p><a href="/person/2-isabel-pena">Isabel Pe&ntilde;a</a></p>
  <p class="character">Writer</p></li></ol>
<ol class="people scroller"><li class="card"><p><a href="/person/3-antonio">Antonio de la Torre</a></p>
  <p class="character">Manuel</p></li></ol>
<p class="wrap"><strong>Original Title</strong> El reino</p>
<p><strong><bdi>Original Language</bdi></strong> Spanish</p>`;
const SITE_SEARCH = `<div class="comp:media-card w-full"><a data-media-type="movie" href="/movie/841-dune?language=en-US"><img alt="Dune"></a>
<a class="font-normal" href="/movie/841-dune?language=en-US"><h2 class="font-semibold"><span>Dune</span></h2></a><span class="release_date w-full">February  6, 1985</span></div>
<div class="comp:media-card w-full"><a class="font-normal" href="/movie/438631-dune?language=en-US"><h2 class="font-semibold"><span>Dune</span></h2></a><span class="release_date w-full">September 15, 2021</span></div>`;

/** A transport answering `answer(url)`, recording what was asked. */
function web<T>(answer: (url: string) => T) {
  const asked: string[] = [];
  return { asked, get: async (url: string) => { asked.push(url); return answer(url); } };
}

test("words with a year give the matching films and series to pick from", async () => {
  const w = web(() => SEARCH);
  const r = await searchWith(w.get, { text: "Dune 2021" });
  assert.ok(w.asked[0].includes("query=Dune"));
  assert.deepEqual(r.candidates.map((c) => c.ids.tmdb), ["438631"], "1984 and 2024 are more than a year away");
  assert.deepEqual((await searchWith(web(() => SEARCH).get, { text: "Dune" })).candidates.map((c) => c.label), ["Dune (2021)", "Dune (1984)", "Dune: Prophecy (2024) · series"]);
  assert.deepEqual(await searchWith(web(() => assert.fail("asked")).get, { text: "https://x.org" }), { candidates: [] });
});

test("details in the catalog's words, and the other ids", async () => {
  const r = await detailsWith(web(() => MOVIE).get, { kind: "movie", ids: { tmdb: "438631" } });
  assert.deepEqual(r.ids, { tmdb: "438631", imdb: "tt1160419" });
  const f = r.fields as Record<string, any>;
  assert.deepEqual([f.director, f.cast[0], f.year, f.cover, f.duration], ["Denis Villeneuve", "Timothée Chalamet", 2021, "https://image.tmdb.org/t/p/w500/d5.jpg", "2h 35m"]);
  assert.equal("original_title" in f, false, "the same as the title");
});

test("a film in a language the vault keeps is described in it", async () => {
  const realm = { ...MOVIE, title: "The Realm", original_title: "El reino", original_language: "es", overview: "A politician…" };
  const w = web((u) => (u.includes("language=es") ? { overview: "Manuel López-Vidal es un político…", genres: [{ name: "Suspense" }] } : realm));
  const f = (await detailsWith(w.get, { kind: "movie", ids: { tmdb: "517331" }, languages: ["es"] })).fields as Record<string, unknown>;
  assert.deepEqual([f.title, f.original_title, f.language], ["The Realm", "El reino", "es"]);
  assert.deepEqual([f.description, f.genres], ["Manuel López-Vidal es un político…", ["Suspense"]]);
  assert.equal(w.asked.length, 2);
});

test("an IMDb id is found first", async () => {
  const w = web((u) => (u.includes("/find/") ? { movie_results: [{ id: 438631 }] } : MOVIE));
  const r = await detailsWith(w.get, { kind: "movie", ids: { imdb: "tt1160419" } });
  assert.equal(r.ids?.tmdb, "438631");
  assert.ok(w.asked[0].includes("/find/tt1160419?external_source=imdb_id"));
});

test("without a token the website says the same", async () => {
  const f = pageFields(SITE_PAGE, "movie")!;
  assert.deepEqual([f.title, f.original_title, f.year, f.duration, f.language], ["The Realm", "El reino", 2018, "2h 12m", "es"]);
  assert.deepEqual([f.director, f.cast, f.genres], ["Rodrigo Sorogoyen", ["Antonio de la Torre"], ["Thriller", "Drama"]]);
  assert.deepEqual(searchPage(SITE_SEARCH, "movie"), [["841", "Dune", 1985], ["438631", "Dune", 2021]]);
  const got = await siteSearchWith(web((u) => (u.includes("/search/movie") ? SITE_SEARCH : "")).get, { text: "Dune 2021" });
  assert.deepEqual(got.candidates.map((c) => c.ids.tmdb), ["438631"], "the year narrows it");
  const es = SITE_PAGE.replace("Manuel, a Spanish politician.", "Manuel, un influyente vicesecretario.");
  const r = await siteDetailsWith(web((u) => (u.includes("language=es") ? es : SITE_PAGE)).get, { kind: "movie", ids: { tmdb: "517331" }, languages: ["es"] });
  assert.equal((r.fields as Record<string, unknown>).description, "Manuel, un influyente vicesecretario.", "a kept language: its synopsis");
});

test("a series listed as a film is read from its series page", async () => {
  const es = SITE_PAGE.replace("Manuel, a Spanish politician.", "Antidisturbios, en español.");
  const w = web((u) => (u.includes("language=es") ? es : SITE_PAGE));
  const r = await siteDetailsWith(w.get, { kind: "movie", ids: { tmdb: "tv/96005" }, languages: ["es"] });
  assert.ok(w.asked.every((u) => u.includes("/tv/96005?")), String(w.asked));
  assert.deepEqual([r.kind, r.ids?.tmdb, (r.fields as Record<string, unknown>).description], ["movie", "tv/96005", "Antidisturbios, en español."]);
  const a = web(() => ({ ...MOVIE, original_language: "es" }));
  const api = await detailsWith(a.get, { kind: "movie", ids: { tmdb: "tv/96005" } });
  assert.ok(a.asked.at(-1)!.includes("/tv/96005?"));
  assert.equal(api.ids?.tmdb, "tv/96005");
});
