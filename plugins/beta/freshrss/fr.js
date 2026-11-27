// FreshRSS's two APIs as this plugin uses them, without a page or a helper around them (fr.test.mjs runs these on
// cut-down copies of their answers): the Google Reader API (`/api/greader.php`, what FreshRSS recommends and its apps
// use: feeds, unread counts, streams with continuations, read and starred marks) and, as the fallback, the Fever API
// (`/api/fever.php`, one key, fewer features). Both are turned into one article shape:
//   { id, title, url, feed, feedId, author, published (ms), html, read, starred }
// so the helper, the reader pane and the tools never see which one answered.

/** Google Reader's states, as stream ids and tags. */
export const READ = "user/-/state/com.google/read";
export const STARRED = "user/-/state/com.google/starred";
export const ALL = "user/-/state/com.google/reading-list";

/** How many articles one page of a stream asks for. */
export const PAGE = 50;

// ---------------------------------------------------------------------------------------------- Google Reader API

/** The `Auth` token of a ClientLogin answer (`SID=…\nLSID=…\nAuth=…`), or null when the login was refused. */
export function loginToken(text) {
  const m = String(text ?? "").match(/^Auth=(.+)$/m);
  return m ? m[1].trim() : null;
}

/** The header every Google Reader call carries once signed in. */
export const authHeader = (token) => ({ Authorization: `GoogleLogin auth=${token}` });

/** The address of one page of a stream: `feed/12`, ALL, STARRED; only the unread with `unread`; `c` a continuation. */
export function streamPath({ stream = ALL, unread = false, n = PAGE, c = "" } = {}) {
  const q = [`n=${n}`, ...(unread ? [`xt=${encodeURIComponent(READ)}`] : []), ...(c ? [`c=${encodeURIComponent(c)}`] : [])];
  return `/reader/api/0/stream/contents/${encodeURIComponent(stream)}?output=json&${q.join("&")}`;
}

/** An item of a Google Reader stream → an article. */
export function articleOf(it) {
  const tags = (it.categories ?? []).map(String);
  const has = (state) => tags.some((t) => t.endsWith(state.replace("user/-", "")));
  const link = (it.canonical ?? it.alternate ?? [])[0]?.href ?? null;
  return {
    id: String(it.id), title: String(it.title ?? "").trim() || "(untitled)", url: link, feed: String(it.origin?.title ?? ""),
    feedId: String(it.origin?.streamId ?? ""), author: String(it.author ?? ""),
    published: Number(it.published) ? Number(it.published) * 1000 : Number(it.crawlTimeMsec) || 0,
    html: String(it.content?.content ?? it.summary?.content ?? ""), read: has(READ), starred: has(STARRED),
  };
}

/** A stream's answer → its articles and the continuation of the next page ("" when it was the last). */
export const streamOf = (answer) => ({ articles: (answer?.items ?? []).map(articleOf), more: String(answer?.continuation ?? "") });

/** The subscriptions and the unread counts → the feeds, each with its folder and how many are unread, by name. */
export function feedsOf(subs, counts) {
  const unread = new Map((counts?.unreadcounts ?? []).map((u) => [String(u.id), Number(u.count) || 0]));
  return (subs?.subscriptions ?? [])
    .map((s) => ({ id: String(s.id), title: String(s.title ?? s.id), folder: String(s.categories?.[0]?.label ?? ""), site: s.htmlUrl ?? null, unread: unread.get(String(s.id)) ?? 0 }))
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title));
}

/** The body of an `edit-tag` (marking articles read, unread, starred…): one `i` per article — a repeated field, which
 *  is why the helper writes this body itself instead of the core's form map — the tag to add or remove, and `T`, the
 *  write token Google Reader asks of every change. */
export function editTagBody(ids, { add = "", remove = "" }, token) {
  const f = (k, v) => `${k}=${encodeURIComponent(v)}`;
  return [...ids.map((i) => f("i", i)), ...(add ? [f("a", add)] : []), ...(remove ? [f("r", remove)] : []), f("T", token)].join("&");
}

/** A mark asked of the reader (`read`, `unread`, `star`, `unstar`) → the tag change. */
export function changeOf(mark) {
  const change = { read: { add: READ }, unread: { remove: READ }, star: { add: STARRED }, unstar: { remove: STARRED } }[mark];
  if (!change) throw new Error(`no mark ${JSON.stringify(mark)} (read, unread, star, unstar)`);
  return change;
}

// ---------------------------------------------------------------------------------------------- Fever API

/** A Fever item → an article (`feeds`: Fever's feed list, for the feed's name). Fever's ids are numbers. */
export function feverArticle(it, feeds = new Map()) {
  return {
    id: String(it.id), title: String(it.title ?? "").trim() || "(untitled)", url: it.url ?? null, feed: feeds.get(Number(it.feed_id)) ?? "",
    feedId: it.feed_id != null ? `feed/${it.feed_id}` : "", author: String(it.author ?? ""), published: (Number(it.created_on_time) || 0) * 1000,
    html: String(it.html ?? ""), read: !!Number(it.is_read), starred: !!Number(it.is_saved),
  };
}

/** Fever's `feeds` answer → feed names by id, and the feeds with their unread counts (from `unread_item_ids` and the
 *  items' feeds, when known). */
export function feverFeeds(answer, unreadByFeed = new Map()) {
  const feeds = answer?.feeds ?? [];
  return {
    names: new Map(feeds.map((f) => [Number(f.id), String(f.title ?? f.id)])),
    list: feeds.map((f) => ({ id: `feed/${f.id}`, title: String(f.title ?? f.id), folder: "", site: f.site_url ?? null, unread: unreadByFeed.get(Number(f.id)) ?? 0 })).sort((a, b) => a.title.localeCompare(b.title)),
  };
}

/** A mark → Fever's `mark=item&as=…` query, or null when Fever cannot (it has no "unread" for an item before 1.0). */
export function feverMark(mark, id) {
  const as = { read: "read", unread: "unread", star: "saved", unstar: "unsaved" }[mark];
  if (!as) throw new Error(`no mark ${JSON.stringify(mark)} (read, unread, star, unstar)`);
  return `mark=item&as=${as}&id=${encodeURIComponent(id)}`;
}

// ---------------------------------------------------------------------------------------------- both

/** An article as an agent reads it: no HTML, its text (cut to `chars`), when, which feed, the marks. */
export function forAgent(a, text = "", chars = 0) {
  return {
    id: a.id, title: a.title, url: a.url, feed: a.feed, published: a.published ? new Date(a.published).toISOString() : null, read: a.read, starred: a.starred,
    ...(text ? { text: chars ? text.slice(0, chars) : text } : {}),
  };
}

/** A note's file name from an article's title (what Obsidian and every OS accept). */
export const fileName = (t) => String(t).replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Article";
