// Cut-down copies of real Letterboxd pages (El reino's, a diary feed, a films grid; fixtures/: a member's own pages as
// Letterboxd answered them, trimmed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { harness, Status } from "atlas-helper/testing"; // the global `atlas` the helper uses
import { diary, filmFromPage, filmsPage, findExports, importExportWith, lookupWith, pageAddress, reviewsPage, syncWith, viewingPage, readExport, type Get, type Sync } from "./helper";

const REALM = `<meta property="og:title" content="The Realm (2018)"><meta name="description" content="Manuel, a Spanish politician whose high-class lifestyle&#8230;">
<script type="application/ld+json">
/* <![CDATA[ */
{"image":"https://a.ltrbxd.com/resized/film-poster/447079-the-realm.jpg","@type":"Movie","director":[{"@type":"Person","name":"Rodrigo Sorogoyen"}],"inLanguage":["es"],"url":"https://letterboxd.com/film/the-realm-2018/","dateCreated":"2018-09-07","name":"The Realm","genre":["Thriller","Drama"],"actors":[{"@type":"Person","name":"Antonio de la Torre"},{"@type":"Person","name":"Mónica López"}]}
/* ]]> */
</script>
<h1 class="headline-1 primaryname"><span class="name js-widont prettify">The Realm</span></h1>
<div class="productioninfo"><span class="releasedate"><a href="/films/year/2018/">2018</a></span>
<h2 class="originalname" lang="es"><em class="quoted-creative-work-title">El reino</em></h2></div>
<p class="text-link text-footer">132&nbsp;mins &nbsp; More at <a href="http://www.imdb.com/title/tt7095482/maindetails">IMDb</a></p>
<div data-tmdb-id="517331" data-tmdb-type="movie"></div>`;

const RSS = `<rss><channel>
<item><title>The Realm, 2018 - ★★★★</title><link>https://letterboxd.com/someone/film/the-realm-2018/</link>
<letterboxd:watchedDate>2026-05-02</letterboxd:watchedDate><letterboxd:memberRating>4.0</letterboxd:memberRating>
<description><![CDATA[ <p><img src="https://a.ltrbxd.com/p.jpg"/></p> <p>Sorogoyen&#039;s best.<br/>Tense.</p> ]]></description></item>
<item><title>Dune: Part Two, 2024</title><link>https://letterboxd.com/someone/film/dune-part-two/</link>
<letterboxd:watchedDate>2026-04-01</letterboxd:watchedDate>
<description><![CDATA[ <p><img src="https://a.ltrbxd.com/q.jpg"/></p> <p>Watched on Wednesday April 1, 2026.</p> ]]></description></item>
<item><title>The Realm, 2018</title><link>https://letterboxd.com/someone/film/the-realm-2018/1/</link><letterboxd:watchedDate>2020-01-01</letterboxd:watchedDate></item>
</channel></rss>`;

const GRID = `<ul class="grid -p70">
<li class="griditem"><div class="react-component" data-item-slug="the-realm-2018" data-item-link="/film/the-realm-2018/"></div><p class="poster-viewingdata"><span class="rating -micro -darker rated-8"> ★★★★ </span></p></li>
<li class="griditem"><div class="react-component" data-item-slug="beau-is-afraid" data-item-link="/film/beau-is-afraid/"></div></li>
</ul><a class="next" href="/someone/films/page/2/">Older</a>`;

const REVIEWS = `<ul><li class="listitem js-listitem"><div data-item-slug="i-play-rocky"></div><h2><a href="/u/film/i-play-rocky/">I Play Rocky</a></h2>
<svg class="glyph -rating" width="38" aria-label="★★½"><title>x</title></svg>
<time class="timestamp" datetime="2026-10-14">14 Oct 2026</time>
<div class="body-text -prose" data-full-text-url="/s/full-text/viewing:1537861745/"><div class="collapsed-text"><p>a film for a quiet evening.</p><p>it helps that</p></div></div></li>
<li class="listitem js-listitem"><div data-item-slug="the-realm-2018"></div><time class="timestamp" datetime="2019-01-05">5 Jan 2019</time>
<div class="body-text"><div class="collapsed-text"><p>Sorogoyen at his best.</p></div></div></li></ul>`;
const FULL = "<p>a film for a quiet evening.</p><p>it helps that the cast is charming.</p>";

const fixture = (name: string) => readFileSync(`fixtures/${name}`, "utf8");
/** A site of pages; an address not in it: null (404), or a refusal with `refuse`. */
const site = (pages: Record<string, string>, refuse = false): Get => async (url) => {
  if (url in pages) return pages[url];
  if (refuse) throw new Error(`Letterboxd answered 403 for ${url}`);
  return null;
};
/** A sync's io over a state kept in memory; what was added. */
function io(get: Get, state: { s?: any } = {}, more: Partial<Sync> = {}) {
  const added: any[] = [];
  return { added, state, io: { get, add: async (b: object) => { added.push(b); }, load: async () => state.s, save: async (s: any) => { state.s = s; }, ...more } as Sync };
}
const byFilm = (added: any[]) => Object.fromEntries(added.map((a) => [a.text.split("/film/")[1].replace(/\/$/, ""), a.own]));

test("a film page in the catalog's words, with its original title", () => {
  const f = filmFromPage(REALM)!;
  assert.deepEqual(f.ids, { letterboxd: "the-realm-2018", tmdb: "517331", imdb: "tt7095482" });
  const x = f.fields;
  assert.deepEqual([x.title, x.original_title, x.language, x.year], ["The Realm", "El reino", "es", 2018]);
  assert.deepEqual([x.director, x.cast, x.genres, x.duration], ["Rodrigo Sorogoyen", ["Antonio de la Torre", "Mónica López"], ["Thriller", "Drama"], "2h 12m"]);
  assert.ok(String(x.description).startsWith("Manuel, a Spanish politician"));
});

test("a miniseries listed as a film keeps its TMDB series", () => {
  const f = filmFromPage(REALM.replace('data-tmdb-id="517331" data-tmdb-type="movie"', 'data-tmdb-id="96005" data-tmdb-type="tv"'))!;
  assert.equal(f.ids.tmdb, "tv/96005");
  assert.equal(pageAddress({ tmdb: "tv/96005" }), null, "Letterboxd redirects TMDB's film ids only");
});

test("any id finds the page: Letterboxd redirects IMDb and TMDB ids", async () => {
  assert.equal(pageAddress({ imdb: "tt0816692" }), "https://letterboxd.com/imdb/tt0816692/");
  assert.equal(pageAddress({ tmdb: "157336" }), "https://letterboxd.com/tmdb/157336/");
  assert.equal(pageAddress({}, "https://letterboxd.com/someone/film/dune-part-two/"), "https://letterboxd.com/film/dune-part-two/");
  assert.deepEqual((await lookupWith(async () => null, { kind: "movie", ids: { imdb: "tt0" } })).fields, {});
});

test("the diary gives dates, ratings and reviews, newest first", () => {
  const d = diary(RSS);
  assert.deepEqual(d["the-realm-2018"], { watched: "2026-05-02", rating: 4, review: "Sorogoyen's best.\nTense." });
  assert.deepEqual(d["dune-part-two"], { watched: "2026-04-01" }, "the 'Watched on' line is not a review");
});

test("a sync files new films once with the user's own fields", async () => {
  const pages = { "https://letterboxd.com/someone/rss/": RSS, "https://letterboxd.com/someone/films/": GRID,
    "https://letterboxd.com/someone/films/page/2/": '<li class="griditem"><div data-item-slug="the-realm-2018"></div></li>' };
  const params = { settings: { username: "someone", watched: "[[seen]]" } };
  const s = io(site(pages));
  assert.equal((await syncWith(s.io, params)).filed, 3);
  const own = byFilm(s.added);
  assert.deepEqual(own["the-realm-2018"], { watched: "2026-05-02", rating: 4, review: "Sorogoyen's best.\nTense.", status: "[[seen]]" });
  assert.deepEqual(own["beau-is-afraid"], { status: "[[seen]]" });
  const again = io(site(pages), s.state);
  assert.equal((await syncWith(again.io, params)).filed, 0, "nothing new: nothing sent");
  assert.deepEqual(again.added, []);
});

test("older reviews come from the reviews pages, with their whole text", async () => {
  const [items, more] = reviewsPage(REVIEWS);
  assert.equal(more, null);
  assert.deepEqual(items[0], ["i-play-rocky", { watched: "2026-10-14", rating: 2.5, review: "a film for a quiet evening.\n\nit helps that", more: "/s/full-text/viewing:1537861745/" }]);
  const pages = { "https://letterboxd.com/u/reviews/": REVIEWS, "https://letterboxd.com/s/full-text/viewing:1537861745/": FULL };
  const params = { settings: { username: "u" } };
  const s = io(site(pages));
  assert.equal((await syncWith(s.io, params)).filed, 2);
  const rocky = byFilm(s.added)["i-play-rocky"];
  assert.equal(rocky.review, "a film for a quiet evening.\n\nit helps that the cast is charming.");
  assert.deepEqual([rocky.rating, rocky.watched], [2.5, "2026-10-14"]);
  assert.equal((await syncWith(io(site(pages), s.state).io, params)).filed, 0, "reviews already sent: nothing again");
  // the full text refused (Letterboxd answers 403 to programs there): the cut text, marked, and the sync goes on
  const refusing: Get = async (url) => { if (url.includes("full-text")) throw new Error("Letterboxd answered 403"); return site(pages)(url); };
  const r = io(refusing);
  assert.equal((await syncWith(r.io, params)).filed, 2);
  assert.ok(String(byFilm(r.added)["i-play-rocky"].review).endsWith("it helps that …"));
});

test("no username says where to set it", async () => {
  assert.match((await syncWith(io(async () => "").io, {})).summary, /Settings/);
});

// ---- a member's pages as Letterboxd answered them: the reviews page's text lost its `collapsed-text` wrapper, likes
// were never read, and a refused page (403, a bot check) stopped the whole sync

test("the diary feed gives likes", () => {
  const d = diary(fixture("rss.xml"));
  assert.deepEqual(d["all-about-my-mother"], { watched: "2026-10-10", rating: 5, liked: true, review: "Una peli para ver con calma" });
  assert.ok(!("liked" in d["obsession-2025"]), "memberLike No");
  assert.deepEqual([d["tie-me-up-tie-me-down"].liked, d["tie-me-up-tie-me-down"].rating], [true, undefined]);
});

test("the reviews page gives the text, the heart and the next page", () => {
  const [items, next] = reviewsPage(fixture("reviews.html"));
  assert.equal(next, "/alice/reviews/films/page/2/");
  assert.deepEqual(items[0], ["all-about-my-mother", { watched: "2026-10-10", rating: 5, liked: true, review: "Una peli para ver con calma" }], "a whole short review: no full-text fetch");
  const [slug, beloved] = items[1];
  assert.deepEqual([slug, beloved.liked, beloved.rating], ["the-beloved-2026", true, undefined]);
  assert.ok(String(beloved.review).startsWith("Un reparto excelente"));
});

test("a cut review is known by its ellipsis", () => {
  const page = fixture("reviews.html").replace("Una peli para ver con calma</p>", "Una peli para ver con calma&#8230;</p>");
  assert.equal(reviewsPage(page)[0][0][1].more, "/s/full-text/viewing:1531999797/");
});

test("the films grid marks ratings, likes and reviews", () => {
  const [films, next] = filmsPage(fixture("films.html"));
  assert.equal(next, "/alice/films/page/2/");
  assert.deepEqual(films, [["la-bola-negra", { rating: 5, liked: true, reviewed: true }], ["obsession-2025", {}], ["the-drama", { liked: true }]]);
});

test("a film's own page gives its date, heart and review", () => {
  const v = viewingPage(fixture("viewing-review.html"));
  assert.deepEqual([v.watched, v.rating, v.liked], ["2026-09-25", 5, true]);
  assert.ok(String(v.review).startsWith("Hay mucho que decir"));
  assert.deepEqual(viewingPage(fixture("viewing-watched.html")), { watched: "2025-12-08" }, "no review: not the 'Add a review?' line");
});

test("a sync over the real pages files reviews and likes and survives the refused pages", async () => {
  const at = "https://letterboxd.com";
  const pages = { [`${at}/alice/rss/`]: fixture("rss.xml"), [`${at}/alice/reviews/`]: fixture("reviews.html"), [`${at}/alice/films/`]: fixture("films.html"),
    [`${at}/alice/film/la-bola-negra/`]: fixture("viewing-review.html"), [`${at}/alice/film/obsession-2025/`]: fixture("viewing-watched.html") };
  const asked: string[] = [];
  const get: Get = async (url) => { asked.push(url); return site(pages, true)(url); };
  const params = { settings: { username: "alice" } };
  const s = io(get);
  const r = await syncWith(s.io, params);
  const own = byFilm(s.added);
  assert.deepEqual(new Set(Object.keys(own)), new Set(["all-about-my-mother", "obsession-2025", "tie-me-up-tie-me-down", "the-beloved-2026", "la-bola-negra", "the-drama"]));
  assert.equal(own["la-bola-negra"].liked, true);
  assert.ok(String(own["la-bola-negra"].review).startsWith("Hay mucho"), "a review the grid marks, read from the film's own page");
  assert.equal(own["la-bola-negra"].watched, "2026-09-25");
  assert.ok(String(own["the-beloved-2026"].review).startsWith("Un reparto excelente") && own["the-beloved-2026"].liked);
  assert.ok(!("looked" in own["the-drama"]));
  assert.match(r.summary, /refused/);
  assert.ok(Object.keys(s.state.s.done).length, "the state is saved although pages were refused");
  assert.ok(!asked.some((u) => u.includes("full-text")), "no full-text fetch for whole reviews");
  // again: nothing new, and no film's own page asked twice
  asked.length = 0;
  const again = io(get, s.state);
  assert.equal((await syncWith(again.io, params)).filed, 0);
  assert.deepEqual(asked.filter((u) => u.includes("/alice/film/") && !u.includes("the-drama")), []);
});

test("a film filed before beyond the lists gets its own page once", async () => {
  // filed by an earlier run from the films grid's page 3, which Letterboxd now refuses: its own page still answers
  const pages: Record<string, string> = { "https://letterboxd.com/alice/film/top-gun-maverick/": fixture("viewing-review.html") };
  const get: Get = async (u) => pages[u] ?? "";
  const state = { s: { done: { "top-gun-maverick": { rating: 3, status: "[[watched]]" } } } as any };
  const params = { settings: { username: "alice" } };
  const s = io(get, state);
  assert.equal((await syncWith(s.io, params)).filed, 1);
  assert.deepEqual([s.added[0].own.watched, s.added[0].own.liked], ["2026-09-25", true]);
  assert.ok(s.added[0].own.review);
  assert.equal((await syncWith(io(get, state).io, params)).filed, 0, "once");
  // a note the vault has whose film no run remembers (a run stopped by a refused page before it saved)
  pages["https://letterboxd.com/alice/film/thesis/"] = fixture("viewing-watched.html");
  const v = io(get, state, { known: async () => ["top-gun-maverick", "thesis", "a-clockwork-orange"] });
  await syncWith(v.io, params);
  assert.deepEqual(v.added.map((a) => a.text), ["https://letterboxd.com/film/thesis/"], "a film never watched there (404) is left alone");
  assert.deepEqual(v.added[0].own, { watched: "2025-12-08" }, "the note's shelf stays the user's");
  assert.deepEqual(state.s.done["a-clockwork-orange"], { looked: true }, "and not asked again");
});

// ---- the export

const EXPORT: Record<string, string> = {
  "watched.csv": "Date,Name,Year,Letterboxd URI\n2019-01-05,The Realm,2018,https://boxd.it/aaaa\n2026-04-01,Dune: Part Two,2024,https://boxd.it/bbbb\n2026-01-01,Old Boy,2003,https://boxd.it/cccc\n",
  "ratings.csv": "Date,Name,Year,Letterboxd URI,Rating\n2026-05-02,The Realm,2018,https://boxd.it/aaaa,4.5\n",
  "diary.csv": "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n"
    + "2019-01-05,The Realm,2018,https://boxd.it/d1,4,,,2019-01-05\n2026-05-02,The Realm,2018,https://boxd.it/d2,4,Yes,,2026-05-02\n"
    + "2026-04-01,Dune: Part Two,2024,https://boxd.it/d3,3.5,,,2026-04-01\n",
  "reviews.csv": "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date\n"
    + "2019-01-05,The Realm,2018,https://boxd.it/d1,4,,\"Sorogoyen at his <i>best</i>.\nTense &amp; fast.\",,2019-01-05\n",
  "likes/films.csv": "Date,Name,Year,Letterboxd URI\n2026-05-02,The Realm,2018,https://boxd.it/aaaa\n",
};
const SLUGS: Record<string, string | null> = { "https://boxd.it/aaaa": "the-realm-2018", "https://boxd.it/bbbb": "dune-part-two", "https://boxd.it/cccc": null };
const ZIP = "letterboxd-someone-2026-10-27.zip";
// the zip (its entries under a folder, as some unzippers write them) and the folder it unpacks to
harness.zips = { [ZIP]: Object.fromEntries(Object.entries(EXPORT).map(([n, t]) => [`export/${n}`, `﻿${t}`])) };
harness.api = (verb, path) => {
  const name = decodeURIComponent(/^\/api\/file\?path=unpacked%2F(.+)$/.exec(path)?.[1] ?? "");
  if (verb === "GET" && name in EXPORT) return { text: EXPORT[name] };
  throw new Status(404, `no ${path}`);
};

test("an export gives each film its newest date, rating, like and review", async () => {
  const films = await readExport(ZIP);
  assert.deepEqual(films["https://boxd.it/aaaa"], { liked: true, watched: "2026-05-02", rating: 4.5, review: "Sorogoyen at his best.\nTense & fast." });
  assert.deepEqual(films["https://boxd.it/bbbb"], { watched: "2026-04-01", rating: 3.5 });
  assert.deepEqual(films["https://boxd.it/cccc"], {});
  assert.deepEqual(await readExport("unpacked"), films, "the unpacked folder reads the same");
  await assert.rejects(readExport("nothing"), /no Letterboxd export/);
});

test("a sync files the exported films and forgets them once filed", async () => {
  const state: { s?: any } = {};
  const keep = { load: async () => state.s, save: async (s: any) => { state.s = s; } };
  assert.equal((await importExportWith(ZIP, keep.load, keep.save)).films, 3);
  const resolved: string[] = [];
  const resolve = async (uri: string) => { resolved.push(uri); return SLUGS[uri]; };
  const pages = { "https://letterboxd.com/someone/rss/": "<rss></rss>", "https://letterboxd.com/someone/films/": "" };
  const params = { settings: { username: "someone" } };
  const s = io(site(pages), state, { resolve });
  const r = await syncWith(s.io, params);
  const by = Object.fromEntries(s.added.map((b) => [b.text, b.own]));
  assert.deepEqual(by["https://letterboxd.com/film/the-realm-2018/"], { liked: true, watched: "2026-05-02", rating: 4.5, review: "Sorogoyen at his best.\nTense & fast.", status: "[[watched]]" });
  assert.equal(by["https://letterboxd.com/film/dune-part-two/"].rating, 3.5);
  assert.ok(r.failed!.some((f) => f.includes("boxd.it/cccc") && f.includes("not a Letterboxd film")), JSON.stringify(r));
  assert.deepEqual(state.s.export, {}, "filed films leave the export's list");
  // the next run: nothing resolved again, nothing sent again
  resolved.length = 0;
  const again = io(site(pages), state, { resolve });
  await syncWith(again.io, params);
  assert.deepEqual([again.added, resolved], [[], []]);
});

test("exports are found by shape, hidden folders left out", () => {
  const files = [`${ZIP}`, "unpacked/watched.csv", "unpacked/diary.csv", "unpacked/ratings.csv", ".hidden/letterboxd-x.zip", "notes/watched.csv", "letterboxd-someone-2025-01-01.zip"];
  assert.deepEqual(findExports(files), [ZIP, "letterboxd-someone-2025-01-01.zip", "unpacked"]);
});

test("a refused short link waits for the next run", async () => {
  const state: { s?: any } = {};
  await importExportWith(ZIP, async () => state.s, async (s) => { state.s = s; });
  const r = await syncWith(io(async () => null, state, { resolve: async () => { throw new Error("offline"); } }).io, { settings: { username: "someone" } });
  assert.equal(Object.keys(state.s.export).length, 3);
  assert.ok(r.refused!.length && r.summary.includes("more next run"), JSON.stringify(r));
});
