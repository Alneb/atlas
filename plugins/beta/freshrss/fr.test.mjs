// node --test plugins/beta/freshrss/fr.test.mjs — the plugin's logic on cut-down copies of FreshRSS's answers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL, READ, STARRED, articleOf, changeOf, editTagBody, feedsOf, feverArticle, feverFeeds, feverMark, fileName, forAgent, loginToken, newSince, noticeOf, streamOf, streamPath } from "./fr.js";

const ITEM = {
  id: "tag:google.com,2005:reader/item/0005f8a1b2c3d4e5", title: " Kondo physics today ", published: 1764230400, crawlTimeMsec: "1764230401000",
  canonical: [{ href: "https://example.org/kondo" }], summary: { content: "<p>The <b>Kondo</b> effect.</p>" }, author: "Ana",
  origin: { streamId: "feed/3", title: "Condensed matter" }, categories: ["user/-/state/com.google/reading-list", "user/-/state/com.google/starred", "user/-/label/Physics"],
};

test("a ClientLogin answer gives its Auth token; a refusal gives none", () => {
  assert.equal(loginToken("SID=alice/abc\nLSID=null\nAuth=alice/0123abcd\n"), "alice/0123abcd");
  assert.equal(loginToken("Error=BadAuthentication"), null);
});

test("a stream's address: the stream escaped, only the unread when asked, its continuation", () => {
  assert.equal(streamPath(), `/reader/api/0/stream/contents/${encodeURIComponent(ALL)}?output=json&n=50`);
  assert.equal(streamPath({ stream: "feed/3", unread: true, c: "16z/x" }), `/reader/api/0/stream/contents/feed%2F3?output=json&n=50&xt=${encodeURIComponent(READ)}&c=16z%2Fx`);
});

test("an item becomes an article: its link, feed, time and marks", () => {
  const a = articleOf(ITEM);
  assert.deepEqual(a, { id: ITEM.id, title: "Kondo physics today", url: "https://example.org/kondo", feed: "Condensed matter", feedId: "feed/3", author: "Ana", published: 1764230400000, crawled: 1764230401000, html: "<p>The <b>Kondo</b> effect.</p>", read: false, starred: true });
  assert.equal(articleOf({ ...ITEM, categories: ["user/1000/state/com.google/read"] }).read, true, "a user's own id in the tag counts too");
  assert.deepEqual(streamOf({ items: [ITEM], continuation: "abc" }).more, "abc");
  assert.equal(streamOf({}).more, "");
});

test("the feeds come with their folder and unread count, by folder then name", () => {
  const feeds = feedsOf({ subscriptions: [{ id: "feed/3", title: "Condensed matter", categories: [{ label: "Physics" }] }, { id: "feed/1", title: "Arts", categories: [] }] }, { unreadcounts: [{ id: "feed/3", count: 4 }] });
  assert.deepEqual(feeds.map((f) => [f.id, f.folder, f.unread]), [["feed/1", "", 0], ["feed/3", "Physics", 4]]);
});

test("a mark is one edit-tag with an i per article and the write token", () => {
  assert.equal(editTagBody(["a/1", "b"], changeOf("read"), "T0k"), `i=a%2F1&i=b&a=${encodeURIComponent(READ)}&T=T0k`);
  assert.equal(editTagBody(["b"], changeOf("unstar"), "T"), `i=b&r=${encodeURIComponent(STARRED)}&T=T`);
  assert.throws(() => changeOf("delete"));
});

test("Fever's items and feeds give the same articles", () => {
  const { names, list } = feverFeeds({ feeds: [{ id: 3, title: "Condensed matter" }] }, new Map([[3, 2]]));
  const a = feverArticle({ id: 7, title: "Kondo", url: "https://example.org/k", feed_id: 3, created_on_time: 1764230400, html: "<p>x</p>", is_read: 0, is_saved: 1 }, names);
  assert.deepEqual([a.id, a.feed, a.feedId, a.published, a.read, a.starred], ["7", "Condensed matter", "feed/3", 1764230400000, false, true]);
  assert.deepEqual(list, [{ id: "feed/3", title: "Condensed matter", folder: "", site: null, unread: 2 }]);
  assert.equal(feverMark("star", "7"), "mark=item&as=saved&id=7");
});

test("an agent reads an article without its HTML, its text cut when asked", () => {
  const a = forAgent(articleOf(ITEM), "The Kondo effect.", 3);
  assert.deepEqual(a, { id: ITEM.id, title: "Kondo physics today", url: "https://example.org/kondo", feed: "Condensed matter", published: "2025-11-27T08:00:00.000Z", read: false, starred: true, text: "The" });
  assert.equal(fileName("a/b: c?"), "a b c");
});

test("a round tells the unread that came since the last one, once, in one notice", () => {
  const a = (id, crawled, extra = {}) => ({ ...articleOf({ ...ITEM, id, crawlTimeMsec: String(crawled) }), ...extra });
  const list = [a("old", 1000), a("new1", 3000), a("new2", 4000, { feed: "Arts" }), a("read", 5000, { read: true }), a("told", 6000)];
  assert.deepEqual(newSince(list, 2000, ["told"]).map((x) => x.id), ["new2", "new1"], "newest first, the read and the told left out");
  const fever = feverArticle({ id: 9, title: "F", created_on_time: 5, is_read: 0 }, new Map());
  assert.deepEqual(newSince([fever], 4000).map((x) => x.id), ["9"], "Fever has no crawl time: its publication time counts");
  assert.equal(noticeOf([]), null);
  const n = noticeOf(newSince(list, 2000), 1);
  assert.deepEqual(n, { id: "freshrss-new", title: "3 new articles in FreshRSS", body: "• Kondo physics today (Condensed matter)\nand 2 more" });
  assert.equal(noticeOf([list[1]]).title, "1 new article in FreshRSS: Condensed matter");
});
