// Audiobookshelf's answers (cut down) as the catalog sees them.
import { test } from "node:test";
import assert from "node:assert/strict";
import "atlas-helper/testing"; // the global `atlas` the helper uses
import { bookOf, lookupWith, noteWhenYours, progressWith, syncWith, type Pending, type Queue } from "./helper";

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

test("sync files only the books you made yours — past the start or finished — once, through the one-note rule", async () => {
  const s = server({ "/api/items/li_dune": EXPANDED, "/api/items/li_begun": { ...EXPANDED, id: "li_begun" },
    "/api/me": { mediaProgress: [
      { libraryItemId: "li_dune", isFinished: true, progress: 1 },
      { libraryItemId: "li_begun", progress: 0.4 },
      { libraryItemId: "li_tapped", progress: 0.002 }, // a tap on play: not yours yet
      { libraryItemId: "li_pod", episodeId: "ep_1", progress: 0.5 }, // a podcast episode: not a book
    ] } });
  const noted: any[] = [], added: any[] = [];
  let state = {};
  const io = { get: s.get, note: async (b: any) => { noted.push(b); return { path: `notes/books/${b.ids.audiobookshelf}.md`, made: b.ids.audiobookshelf === "li_begun" }; },
    add: async (b: object) => added.push(b), load: async () => state, save: async (x: object) => { state = x; } };
  const run = () => syncWith(io, SETTINGS);
  assert.equal((await run()).filed, 2);
  assert.deepEqual(noted.map((n) => [n.ids.audiobookshelf, n.why, n.progress, n.own]),
    [["li_dune", "finished", undefined, { status: "[[read]]" }], ["li_begun", "progress", 0.4, {}]]);
  assert.ok(!s.asked.some((a) => /li_tapped|li_pod|\/api\/libraries/.test(a)), "the library itself is never walked");
  // the finished book's note was already there: the shelf goes on it through `add`; the made one had it from `note`
  assert.deepEqual(added.map((a: any) => [a.ids.audiobookshelf, a.own]), [["li_dune", { status: "[[read]]" }]]);
  assert.equal((await run()).filed, 0, "nothing new: nothing sent");
});

test("a played book gets its note once it is past the start or ended — once, and never a podcast's episode", async () => {
  const s = server({ "/api/items/li_dune": EXPANDED });
  const noted: any[] = [];
  let sent: string[] = [];
  const io = { note: async (b: object) => { noted.push(b); return { path: "notes/books/Dune.md" }; }, get: s.get, ready: async () => true,
    load: async () => sent, save: async (x: string[]) => { sent = x; } };
  const at = (t: number, extra = {}) => noteWhenYours(io, { ...SETTINGS, key: { item: "li_dune" }, at: t, duration: 1000, ...extra });
  assert.equal(await at(5), null, "a tap on play is not listening");
  assert.equal(noted.length, 0);
  assert.equal(await at(20), "notes/books/Dune.md");
  assert.deepEqual([noted[0].why, noted[0].progress, noted[0].ids.audiobookshelf, noted[0].fields.title], ["progress", 0.02, "li_dune", "Dune"]);
  assert.equal(await at(500), null, "once per book");
  assert.equal(await noteWhenYours(io, { ...SETTINGS, key: { item: "li_pod", episode: "ep_1" }, at: 900, duration: 1000 }), null);
  sent = [];
  await at(0, { state: "ended", duration: 0 });
  assert.equal(noted.at(-1).why, "finished");
  assert.equal(noted.length, 2);
});

/** The server's sessions: the ones it knows, what was posted. */
function sessions(known: string[]) {
  const posted: { path: string; body: any }[] = [];
  let n = 0;
  return { posted, post: async (path: string, body: object) => {
    posted.push({ path, body });
    const m = /^\/api\/session\/([^/]+)\/(sync|close)$/.exec(path);
    if (m) return known.includes(m[1]) ? "OK" : null;
    if (/^\/api\/items\/[^/]+\/play(\/[^/]+)?$/.test(path)) { const id = `s${++n}`; known.push(id); return JSON.stringify({ id }); }
    return null;
  } };
}

test("the player's report is synced to its session; a session the server ended is opened again and kept", async () => {
  const s = sessions(["s0"]);
  const r = await progressWith(s.post, { ...SETTINGS, key: { item: "li_dune", session: "s0", device: "atlas-d" }, at: 120.5, listened: 14.6, duration: 900 });
  assert.deepEqual(r, { key: { item: "li_dune", session: "s0", device: "atlas-d" } });
  assert.deepEqual(s.posted, [{ path: "/api/session/s0/sync", body: { currentTime: 120.5, timeListened: 15, duration: 900 } }]);

  const gone = sessions([]);
  const again = await progressWith(gone.post, { ...SETTINGS, key: { item: "li_dune", session: "old", device: "atlas-d" }, at: 130, listened: 9, duration: 900 });
  assert.deepEqual(again, { key: { item: "li_dune", session: "s1", device: "atlas-d" } });
  assert.deepEqual(gone.posted.map((p) => p.path), ["/api/session/old/sync", "/api/items/li_dune/play", "/api/session/s1/sync"]);
  assert.equal(gone.posted[1].body.deviceInfo.deviceId, "atlas-d", "the new session is this device's");
  assert.equal(gone.posted[2].body.timeListened, 9, "the time listened goes to the new session, not lost");
});

test("a podcast's episode is synced as itself, and opened again as itself", async () => {
  const gone = sessions([]);
  const r = await progressWith(gone.post, { ...SETTINGS, key: { item: "li_pod", episode: "ep_2", session: "old", device: "atlas-d" }, at: 60, listened: 5, duration: 1800 });
  assert.deepEqual(r, { key: { item: "li_pod", episode: "ep_2", session: "s1", device: "atlas-d" } });
  assert.deepEqual(gone.posted.map((p) => p.path), ["/api/session/old/sync", "/api/items/li_pod/play/ep_2", "/api/session/s1/sync"]);
});

test("offline, a report is kept as a local session and sent once the server answers again", async () => {
  let up = false, now = 1_000_000;
  const posted: { path: string; body: any }[] = [];
  const post = async (path: string, body: object) => {
    if (!up) throw new Error("error sending request for url (https://abs.example.org/api/session/s0/sync)");
    posted.push({ path, body });
    if (/\/play$/.test(path)) return JSON.stringify({ id: "s9" });
    return "OK";
  };
  let kept: Pending = {};
  const queue: Queue = { load: async () => structuredClone(kept), save: async (p) => { kept = p; }, clock: () => now };
  const report = (at: number, listened: number, session?: string) => progressWith(post, { ...SETTINGS, key: { item: "li_dune", session, device: "atlas-d" }, at, listened, duration: 900 }, queue);
  assert.deepEqual(await report(100, 20, "s0"), { key: { item: "li_dune", device: "atlas-d" }, queued: true });
  now += 30_000;
  await report(130, 30);
  assert.deepEqual(Object.keys(kept), ["li_dune/"]);
  const s = kept["li_dune/"];
  assert.deepEqual([s.currentTime, s.timeListening, s.startedAt, s.updatedAt, s.playMethod, s.libraryItemId], [130, 50, 1_000_000 - 20_000, 1_030_000, 3, "li_dune"]);
  up = true;
  assert.deepEqual(await report(140, 10), { key: { item: "li_dune", session: "s9", device: "atlas-d" } });
  assert.deepEqual(posted.map((p) => p.path), ["/api/items/li_dune/play", "/api/session/s9/sync", "/api/session/local"]);
  assert.equal(posted[2].body.timeListening, 50, "the time listened offline reaches the server");
  assert.deepEqual(kept, {}, "sent: forgotten");
  // a server's own refusal is not kept: it is the caller's error
  await assert.rejects(progressWith(async () => { throw new Error("Audiobookshelf answered 500"); }, { ...SETTINGS, key: { item: "li_dune", session: "x" }, at: 1 }, queue));
  assert.deepEqual(kept, {});
});

test("closing sends the close; a session already gone is not opened again to be closed", async () => {
  const s = sessions(["s0"]);
  await progressWith(s.post, { ...SETTINGS, key: { item: "li_dune", session: "s0" }, at: 300, listened: 2, state: "closed" });
  assert.deepEqual(s.posted.map((p) => p.path), ["/api/session/s0/close"]);
  const gone = sessions([]);
  assert.deepEqual(await progressWith(gone.post, { ...SETTINGS, key: { item: "li_dune", session: "x" }, state: "closed" }), { key: { item: "li_dune", device: "atlas" } });
  assert.equal(gone.posted.length, 1);
});

test("a report without a server, or without its book, sends nothing", async () => {
  const s = sessions([]);
  assert.ok("skipped" in (await progressWith(s.post, { key: { item: "li_dune" } })));
  await assert.rejects(progressWith(s.post, { ...SETTINGS, at: 3 }));
  assert.equal(s.posted.length, 0);
});

// the page's OpenID sign-in (abs.js openidSignIn): the server's mobile flow, its pure parts
import { callbackUrl, openidUrl, tokenOf } from "../abs.js";

test("signing in through the server's OpenID: the start, the code taken back, the token in the answer", () => {
  const p = { challenge: "ch", state: "st", verifier: "ve", redirect: "audiobookshelf://oauth" };
  const start = openidUrl("https://abs.example.org", p);
  assert.ok(start.startsWith("https://abs.example.org/auth/openid?"));
  assert.ok(start.includes("redirect_uri=audiobookshelf%3A%2F%2Foauth"));
  assert.ok(start.includes("code_challenge_method=S256") && start.includes("code_challenge=ch") && start.includes("state=st"));
  const cb = callbackUrl("https://abs.example.org", "audiobookshelf://oauth?code=c1&state=st", p);
  assert.equal(cb, "https://abs.example.org/auth/openid/callback?state=st&code=c1&code_verifier=ve");
  assert.equal(callbackUrl("https://abs.example.org", "audiobookshelf://oauth?code=c1&state=other", p), null, "another sign-in's answer");
  assert.equal(callbackUrl("https://abs.example.org", "audiobookshelf://oauth?error=denied&state=st", p), null, "refused: no code");
  assert.equal(tokenOf({ user: { token: "old" } }), "old");
  assert.equal(tokenOf({ user: { accessToken: "new" } }), "new");
  assert.equal(tokenOf({}), null);
});

// the pane's shelves (shelf.js): the server's answers as cards
import { argOf, cardOf, collectionsOf, hitsOf, playlistsOf, progressMap, shelvesOf } from "../shelf.js";

const ME = { mediaProgress: [
  { libraryItemId: "li_dune", progress: 0.4, currentTime: 30672, isFinished: false, lastUpdate: 1700000000000 },
  { libraryItemId: "li_pod", episodeId: "ep_2", progress: 1, isFinished: true, lastUpdate: 1700000001000 },
] };
const POD = { id: "li_pod", mediaType: "podcast", media: { numEpisodes: 3, metadata: { title: "Night Shift", author: "Radio Example" } } };

test("a shelf item, minified or expanded, is one card with how far you are", () => {
  const p = progressMap(ME);
  const dune = cardOf(ITEM, p);
  assert.deepEqual([dune.kind, dune.title, dune.author, dune.narrator, dune.progress, dune.open], ["book", "Dune", "Frank Herbert", "Scott Brick, Orlagh Cassidy", 0.4, "li_dune"]);
  assert.equal(cardOf(EXPANDED).author, "Frank Herbert");
  assert.equal(cardOf({ id: "x", media: { metadata: { title: "X", series: [{ name: "Saga", sequence: "2" }] } } }).series, "Saga #2");
  const pod = cardOf(POD, p);
  assert.deepEqual([pod.kind, pod.episodes, pod.open, pod.author], ["show", 3, "show:li_pod", "Radio Example"]);
  const ep = cardOf({ ...POD, recentEpisode: { id: "ep_2", title: "Two", duration: 1800 } }, p);
  assert.deepEqual([ep.kind, ep.episode, ep.progress, ep.open, ep.sub], ["episode", "ep_2", 1, "li_pod/ep_2", "Night Shift"]);
  assert.equal(cardOf({ id: "e", media: { ebookFile: { ino: "1" }, metadata: { title: "E" } } }).ebook, true);
});

test("the personalized shelves: books, series with their books, episodes; authors and empty shelves left out", () => {
  const shelves = shelvesOf([
    { id: "continue-listening", label: "Continue Listening", type: "book", entities: [ITEM] },
    { id: "recent-series", label: "Recent Series", type: "series", entities: [{ id: "se1", name: "Dune", books: [ITEM, EXPANDED] }] },
    { id: "newest-authors", label: "Newest Authors", type: "authors", entities: [{ id: "a1", name: "Frank Herbert" }] },
    { id: "discover", label: "Discover", type: "book", entities: [] },
    { id: "newest-episodes", label: "Newest Episodes", type: "episode", entities: [{ ...POD, recentEpisode: { id: "ep_3", title: "Three" } }] },
  ], progressMap(ME));
  assert.deepEqual(shelves.map((s) => s.id), ["continue-listening", "recent-series", "newest-episodes"]);
  assert.equal(shelves[0].cards[0].progress, 0.4);
  assert.deepEqual([shelves[1].cards[0].kind, shelves[1].cards[0].title, shelves[1].cards[0].cards.length], ["series", "Dune", 2]);
  assert.equal(shelves[2].cards[0].open, "li_pod/ep_3");
  assert.deepEqual(shelvesOf(null), []);
});

test("collections, playlists (books and episodes in order) and the server's search", () => {
  const cols = collectionsOf({ results: [{ id: "c1", name: "Desert", books: [ITEM] }, { id: "c2", name: "Empty", books: [] }] });
  assert.deepEqual(cols.map((c: any) => [c.kind, c.title, c.cards.length]), [["collection", "Desert", 1]]);
  const lists = playlistsOf({ results: [{ id: "p1", name: "Commute", items: [
    { libraryItemId: "li_pod", episodeId: "ep_1", libraryItem: POD, episode: { id: "ep_1", title: "One" } },
    { libraryItemId: "li_dune", libraryItem: ITEM }, { libraryItemId: "gone" }] }] });
  assert.deepEqual(lists[0].cards.map((c: any) => c.open), ["li_pod/ep_1", "li_dune"]);
  const hits = hitsOf({ book: [{ libraryItem: ITEM }], podcast: [{ libraryItem: POD }], series: [{ series: { id: "se1", name: "Dune" }, books: [ITEM] }], authors: [{ id: "a1", name: "Frank Herbert", numBooks: 6 }] });
  assert.deepEqual(hits.cards.map((c: any) => c.kind), ["book", "show"]);
  assert.deepEqual([hits.groups[0].title, hits.authors[0]], ["Dune", { id: "a1", name: "Frank Herbert", books: 6 }]);
});

test("the pane's argument: the home, a book, a podcast, an episode", () => {
  assert.deepEqual(argOf(undefined), { kind: "home" });
  assert.deepEqual(argOf("li_dune"), { kind: "book", item: "li_dune" });
  assert.deepEqual(argOf("show:li_pod"), { kind: "show", item: "li_pod" });
  assert.deepEqual(argOf("li_pod/ep_1"), { kind: "episode", item: "li_pod", episode: "ep_1" });
});

import { bookmarksOf, withBookmark } from "../shelf.js";

test("bookmarks: an item's from /api/me, in the book's order", () => {
  const me = { bookmarks: [{ libraryItemId: "li_dune", time: 900, title: "b" }, { libraryItemId: "x", time: 1, title: "other" }, { libraryItemId: "li_dune", time: 30.5, title: "a" }] };
  assert.deepEqual(bookmarksOf(me, "li_dune").map((b: any) => [b.time, b.title]), [[30.5, "a"], [900, "b"]]);
  assert.deepEqual(bookmarksOf({}, "li_dune"), []);
});

test("a bookmark into the note: at the end of its Bookmarks section, made when missing, never twice", () => {
  const line = "- [[Dune#t=1:02:03]] the sandworm";
  assert.equal(withBookmark("---\ntitle: Dune\n---\n\nMy notes.\n", line), "---\ntitle: Dune\n---\n\nMy notes.\n\n## Bookmarks\n\n- [[Dune#t=1:02:03]] the sandworm\n");
  assert.equal(withBookmark("", line), "## Bookmarks\n\n- [[Dune#t=1:02:03]] the sandworm\n");
  const had = "# Dune\n\n## Bookmarks\n\n- [[Dune#t=0:10]] start\n\n## Quotes\n\n> fear\n";
  assert.equal(withBookmark(had, line), "# Dune\n\n## Bookmarks\n\n- [[Dune#t=0:10]] start\n- [[Dune#t=1:02:03]] the sandworm\n\n## Quotes\n\n> fear\n");
  assert.equal(withBookmark(withBookmark(had, line)!, line), null);
  assert.equal(withBookmark("## Bookmarks\n", line), "## Bookmarks\n\n- [[Dune#t=1:02:03]] the sandworm\n");
});

// read-along (shelf.js): the ebook's place in Audiobookshelf's terms and the readers' note properties
import { cfiChapter, newerPlace, notePlace, serverPlace } from "../shelf.js";

test("read-along: a CFI's chapter, and the places translated both ways at the chapter or the page", () => {
  assert.equal(cfiChapter("epubcfi(/6/14!/4/2/1:0)"), 7);
  assert.equal(cfiChapter("epubcfi(/6/4[ch2]!/4)"), 2);
  for (const bad of ["", "12", "epubcfi(/6/3!/4)", "epubcfi(/4/2!/4)", null]) assert.equal(cfiChapter(bad), null);
  assert.deepEqual(serverPlace({ reading_chapter: "4", progress: "42%", last_read: "2026-01-02T00:00:00Z" }, "epub"),
    { ebookLocation: "epubcfi(/6/8!/4/2)", ebookProgress: 0.42, at: Date.parse("2026-01-02T00:00:00Z") });
  assert.deepEqual(serverPlace({ reading_page: 12 }, "pdf"), { ebookLocation: "12", at: 0 });
  assert.equal(serverPlace({}, "pdf"), null);
  assert.deepEqual(notePlace({ ebookLocation: "3", ebookProgress: 0.5 }, "pdf"), { reading_page: "3", progress: "50%" });
  assert.deepEqual(notePlace({ ebookLocation: "epubcfi(/6/8!/4/2)", ebookProgress: 0.125 }, "epub"), { reading_chapter: "4", reading_at: "0%", progress: "12.5%" });
  assert.equal(notePlace({ ebookLocation: "", ebookProgress: 0 }, "pdf"), null);
});

test("read-along: the newer side wins; a side with no place never overwrites one that has it", () => {
  assert.equal(newerPlace({ ebookLocation: "3", lastUpdate: 10 }, { ebookLocation: "5", at: 20 }), "note");
  assert.equal(newerPlace({ ebookLocation: "3", lastUpdate: 30 }, { ebookLocation: "5", at: 20 }), "server");
  assert.equal(newerPlace({ ebookLocation: "3", lastUpdate: 20 }, { ebookLocation: "3", at: 20 }), null);
  assert.equal(newerPlace({ ebookLocation: "3", lastUpdate: 1 }, null), "server");
  assert.equal(newerPlace({ lastUpdate: 99 }, { ebookLocation: "5", at: 1 }), "note");
  assert.equal(newerPlace(null, null), null);
});

// podcasts (shelf.js): a podcast's episodes, newest first, with how far you are in each
import { episodesOf } from "../shelf.js";

test("a podcast's episodes: newest first, each opened as itself, played ones marked", () => {
  const show = { ...POD, media: { ...POD.media, episodes: [
    { id: "ep_1", index: 1, title: "One", publishedAt: 1600000000000, duration: 1200 },
    { id: "ep_2", index: 2, title: "Two", publishedAt: 1700000000000, duration: 1800 },
    { id: "ep_3", index: 3, title: "Three" },
  ] } };
  const eps = episodesOf(show, progressMap(ME));
  assert.deepEqual(eps.map((e) => e.episode), ["ep_2", "ep_1", "ep_3"], "dated ones newest first, an undated one last");
  assert.deepEqual([eps[0].open, eps[0].finished, eps[0].progress, eps[0].published, eps[0].duration], ["li_pod/ep_2", true, 1, 1700000000000, 1800]);
  assert.deepEqual([eps[1].finished, eps[1].progress], [false, undefined]);
  assert.deepEqual(episodesOf({ id: "x", media: {} }), []);
});

// listening stats (shelf.js): the server's answer as the home's tiles, days and most-listened list
import { dayKey, statsOf } from "../shelf.js";

test("listening stats: today, the last seven days oldest first, the five most listened", () => {
  const now = new Date(2026, 10, 17, 9, 30).getTime(); // a local Tuesday morning
  const items = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`i${i}`, { id: `i${i}`, timeListening: i * 100, mediaMetadata: { title: `T${i}` } }]));
  const st = statsOf({ totalTime: 9000, days: { "2026-11-17": 600, "2026-11-11": 1200, "2026-11-10": 999 }, items }, now);
  assert.equal(dayKey(now), "2026-11-17");
  assert.deepEqual(st.week.map((d) => d.day), ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"]);
  assert.deepEqual(st.week.map((d) => d.seconds), [1200, 0, 0, 0, 0, 0, 600], "a day before the week left out");
  assert.deepEqual([st.total, st.today, st.weekTotal], [9000, 600, 1800]);
  assert.deepEqual(st.top.map((x) => x.title), ["T6", "T5", "T4", "T3", "T2"], "five at most, none at 0");
  assert.deepEqual(statsOf(null, now).total, 0);
});

// keeping for offline (shelf.js): which files, where, at which place in the item's time
import { keepPlan } from "../shelf.js";

test("keeping a book or an episode: its tracks as files of one folder, laid over the item's time", () => {
  const book = { id: "li_dune", media: { metadata: { title: "Dune", authorName: "Frank Herbert" }, chapters: [{ start: 0, end: 60, title: "One" }], tracks: [
    { index: 1, startOffset: 0, duration: 60, contentUrl: "/api/items/li_dune/file/1", metadata: { filename: "01.MP3", ext: ".MP3" } },
    { index: 2, duration: 30, contentUrl: "/api/items/li_dune/file/2", metadata: { filename: "02.m4b" } },
  ] } };
  const plan = keepPlan(book)!;
  assert.deepEqual([plan.folder, plan.title, plan.author, plan.chapters.length], ["kept/li_dune", "Dune", "Frank Herbert", 1]);
  assert.deepEqual(plan.tracks, [
    { url: "/api/items/li_dune/file/1", file: "kept/li_dune/1.mp3", start: 0, duration: 60 },
    { url: "/api/items/li_dune/file/2", file: "kept/li_dune/2.m4b", start: 60, duration: 30 },
  ]);
  const show = { id: "li_pod", media: { metadata: { title: "Night Shift" }, episodes: [{ id: "ep_2", title: "Two", audioTrack: { contentUrl: "/api/items/li_pod/file/9", startOffset: 0, duration: 5 } }] } };
  const ep = keepPlan(show, "ep_2")!;
  assert.deepEqual([ep.folder, ep.title, ep.author, ep.tracks[0].file], ["kept/li_pod_ep_2", "Two", "Night Shift", "kept/li_pod_ep_2/1"]);
  assert.equal(keepPlan(show, "nope"), null);
  assert.equal(keepPlan({ id: "x", media: {} }), null);
});
