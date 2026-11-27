// FreshRSS's helper, run in the core (QuickJS): the one place that speaks to FreshRSS, for the reader pane, the block,
// the phone and the agent's tools alike. Google Reader API by default (`protocol = "greader"`: the user and an API
// password, signed in by ClientLogin — the password filled in by the core as a form field, the session token kept here
// in memory and signed in again when FreshRSS forgets it); the Fever API as the fallback (`protocol = "fever"`: one
// key, filled in by the core). Both answer the shapes of fr.js. An article's HTML is cleaned here by the core's one
// cleaner (`atlas.html.clean`, the mail reader's) before any page sees it. Built into ../helper.js by
// `node scripts/dev/plugin-ui.mjs plugins/beta/freshrss`.
import type { Params } from "atlas-helper";
// @ts-ignore — plain JavaScript shared with the page
import { ALL, STARRED, changeOf, editTagBody, feedsOf, feverArticle, feverFeeds, feverMark, fileName, forAgent, loginToken, newSince, noticeOf, streamOf, streamPath } from "../fr.js";

type Article = { id: string; title: string; url: string | null; feed: string; feedId: string; author: string; published: number; crawled: number; html: string; read: boolean; starred: boolean };
type Settings = Record<string, unknown>;

const baseOf = (s: Settings | undefined) => {
  const base = String(s?.server ?? "").trim().replace(/\/+$/, "");
  if (!base) throw new atlas.AtlasError("set the FreshRSS address in Settings → Plugins → FreshRSS", 400);
  return base;
};
const fever = (s: Settings | undefined) => String(s?.protocol ?? "greader") === "fever";
/** An article's text (an agent's, a kept note's): read from its cleaned HTML without its `<style>` (which the cleaner
 *  keeps for the frame), so no script or CSS lands in it. */
const textOf = (html: string) => (atlas.html.select(`<body>${atlas.html.clean(html ?? "").html.replace(/<style[\s\S]*?<\/style>/gi, "")}</body>`, "body")[0]?.text ?? "").replace(/\s+\n/g, "\n").trim();

// ---------------------------------------------------------------------------------------------- Google Reader

/** The session token, per server and user: FreshRSS keeps it for days; a 401 signs in again. */
let session: { key: string; token: string } | null = null;

async function login(s: Settings | undefined, again = false): Promise<string> {
  const key = `${baseOf(s)}\n${s?.user ?? ""}`;
  if (session && session.key === key && !again) return session.token;
  const user = String(s?.user ?? "").trim();
  if (!user) throw new atlas.AtlasError("set your FreshRSS user name in Settings → Plugins → FreshRSS", 400);
  const res = await atlas.fetchResponse({ url: `${baseOf(s)}/api/greader.php/accounts/ClientLogin`, method: "POST", form: { Email: user, Passwd: { secret: "api_password" } }, timeout_secs: 30 });
  const token = res.ok ? loginToken(res.text) : null;
  if (!token) throw new atlas.AtlasError(res.status === 401 || res.status === 403 || res.ok ? "FreshRSS refused the user or the API password (FreshRSS → Settings → Profile → API password; the API must be on in Authentication)" : `FreshRSS answered ${res.status}`, 403);
  session = { key, token };
  return token;
}

/** One Google Reader call, signed in; signed in again once when FreshRSS has forgotten the session. */
async function greader(s: Settings | undefined, path: string, init: { method?: string; body?: string } = {}): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await login(s, attempt > 0);
    const res = await atlas.fetchResponse({
      url: `${baseOf(s)}/api/greader.php${path}`, method: init.method ?? "GET", timeout_secs: 30, body: init.body,
      headers: { Authorization: `GoogleLogin auth=${token}`, ...(init.body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    });
    if (res.status === 401 && attempt === 0) continue;
    if (!res.ok) throw new atlas.AtlasError(`FreshRSS answered ${res.status}`, 502);
    return res.text;
  }
  throw new atlas.AtlasError("FreshRSS refused the session twice", 403);
}
const greaderJson = async (s: Settings | undefined, path: string) => JSON.parse((await greader(s, path)) || "{}");

// ---------------------------------------------------------------------------------------------- Fever

async function feverCall(s: Settings | undefined, query: string) {
  const res = await atlas.fetchResponse({ url: `${baseOf(s)}/api/fever.php?api&${query}`, method: "POST", form: { api_key: { secret: "api_key" } }, timeout_secs: 30 });
  if (!res.ok) throw new atlas.AtlasError(`FreshRSS answered ${res.status}`, 502);
  const j = JSON.parse(res.text || "{}");
  if (j.auth === 0) throw new atlas.AtlasError("FreshRSS did not accept the Fever API key", 403);
  return j;
}
async function feverNames(s: Settings | undefined) {
  return feverFeeds(await feverCall(s, "feeds")).names;
}
async function feverItems(s: Settings | undefined, ids: string[]): Promise<Article[]> {
  if (!ids.length) return [];
  const [items, names] = await Promise.all([feverCall(s, `items&with_ids=${ids.join(",")}`), feverNames(s)]);
  return (items.items ?? []).map((it: unknown) => feverArticle(it, names));
}

// ---------------------------------------------------------------------------------------------- one shape for both

/** The feeds with their unread counts. */
async function feeds(p: Params) {
  const s = p.settings;
  if (fever(s)) {
    const unreadIds = String((await feverCall(s, "unread_item_ids")).unread_item_ids ?? "").split(",").filter(Boolean);
    const items = await feverItems(s, unreadIds.slice(0, 500));
    const byFeed = new Map<number, number>();
    for (const a of items) byFeed.set(Number(a.feedId.slice(5)), (byFeed.get(Number(a.feedId.slice(5))) ?? 0) + 1);
    return { feeds: feverFeeds(await feverCall(s, "feeds"), byFeed).list, unread: unreadIds.length, protocol: "fever" };
  }
  const [subs, counts] = await Promise.all([greaderJson(s, "/reader/api/0/subscription/list?output=json"), greaderJson(s, "/reader/api/0/unread-count?output=json")]);
  const list = feedsOf(subs, counts);
  return { feeds: list, unread: list.reduce((n: number, f: { unread: number }) => n + f.unread, 0), protocol: "greader" };
}

/** One page of a stream (`stream`: a feed id, ALL, STARRED; `unread`: only those; `more`: the last page's
 *  continuation), each article's HTML cleaned for the page's frame. */
async function articles(p: Params) {
  const s = p.settings;
  const stream = String(p.stream || ALL), unread = !!p.unread;
  let page: { articles: Article[]; more: string };
  if (fever(s)) {
    // Fever lists ids; the page is the newest 50 of them, older ones after `more` (the smallest id shown)
    const idsOf = async (q: string, key: string) => String((await feverCall(s, q))[key] ?? "").split(",").filter(Boolean);
    let ids = stream === STARRED ? await idsOf("saved_item_ids", "saved_item_ids") : await idsOf("unread_item_ids", "unread_item_ids");
    ids = ids.map(Number).sort((a, b) => b - a).filter((id) => !p.more || id < Number(p.more)).map(String);
    let list = await feverItems(s, ids.slice(0, 50));
    if (stream !== ALL && stream !== STARRED) list = list.filter((a) => a.feedId === stream);
    page = { articles: list, more: ids.length > 50 ? ids[49] : "" };
  } else {
    page = streamOf(await greaderJson(s, streamPath({ stream, unread: unread && stream !== STARRED, c: String(p.more ?? "") })));
  }
  for (const a of page.articles) {
    const c = atlas.html.clean(a.html);
    a.html = c.html;
  }
  return page;
}

/** Marks articles read, unread, starred or not (`mark`, `ids`). */
async function mark(p: Params) {
  const s = p.settings;
  const ids = (Array.isArray(p.ids) ? p.ids : [p.ids]).map(String).filter(Boolean);
  if (!ids.length) throw new atlas.AtlasError("which articles: ids", 400);
  const what = String(p.mark ?? "");
  if (fever(s)) {
    for (const id of ids) await feverCall(s, feverMark(what, id));
  } else {
    const token = (await greader(s, "/reader/api/0/token")).trim();
    await greader(s, "/reader/api/0/edit-tag", { method: "POST", body: editTagBody(ids, changeOf(what), token) });
  }
  return { marked: ids.length, mark: what };
}

/** Articles by id (Google Reader's `stream/items/contents`, Fever's `with_ids`). */
async function byIds(s: Settings | undefined, ids: string[]): Promise<Article[]> {
  if (fever(s)) return feverItems(s, ids.map((i) => i.replace(/\D/g, "")).filter(Boolean));
  const body = ids.map((i) => `i=${encodeURIComponent(i)}`).join("&");
  return streamOf(JSON.parse((await greader(s, "/reader/api/0/stream/items/contents?output=json", { method: "POST", body })) || "{}")).articles;
}

// ---------------------------------------------------------------------------------------------- the tools

/** The unread articles, newest first (the block and `freshrss_unread`): what, where from, the link. */
async function unread(p: Params) {
  const page = await articles({ ...p, stream: ALL, unread: true });
  return page.articles.slice(0, Math.max(1, Number(p.limit) || 15)).map((a) => forAgent(a));
}

/** One article's whole text, for an agent (`freshrss_read`). */
async function read(p: Params) {
  const id = String(p.id ?? "");
  if (!id) throw new atlas.AtlasError("which article: an id from freshrss_unread", 400);
  const a = (await byIds(p.settings, [id]))[0];
  if (!a) throw new atlas.AtlasError(`FreshRSS has no article ${id}`, 404);
  return forAgent(a, textOf(a.html), Number(p.chars) || 20000);
}

/** One article as a note in the settings' folder → { path, made } (made: false when it was there: never written over).
 *  The note is the feature's own: its source, feed and day as properties, the article's text as its body. */
async function save(p: Params) {
  const id = String(p.id ?? "");
  if (!id) throw new atlas.AtlasError("which article: an id from freshrss_unread", 400);
  const a = (await byIds(p.settings, [id]))[0];
  if (!a) throw new atlas.AtlasError(`FreshRSS has no article ${id}`, 404);
  const folder = String(p.settings?.folder || "notes/reading").replace(/\/+$/, "");
  const path = `${folder}/${fileName(a.title)}.md`;
  try { await atlas.read(path); return { path, made: false }; } catch (e) { if ((e as { status?: number }).status !== 404) throw e; }
  const day = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD, the local day (not UTC's)
  const props = [`type: article`, `source: ${JSON.stringify(a.url ?? "")}`, ...(a.feed ? [`feed: ${JSON.stringify(a.feed)}`] : []), `saved: ${day}`];
  await atlas.write(path, `---\n${props.join("\n")}\n---\n# ${a.title}\n\n${textOf(a.html)}\n`);
  return { path, made: true };
}

// ---------------------------------------------------------------------------------------------- the round

/** What the last round saw, kept between rounds (the helper stops when idle): its time and the ids it told. */
const STATE = `.atlas/cache/${atlas.id}.json`;
type State = { since?: number; told?: string[] };
const loadState = async (): Promise<State> => { try { return JSON.parse(await atlas.read(STATE)); } catch { return {}; } };

/** The scheduled round (`check`, every 30 minutes): one notice of the unread articles that came since the last round,
 *  when Settings asks for notices. The first round only notes the time: what was unread before is not news. */
async function check(p: Params) {
  const s = p.settings;
  if (!s?.notify) return { skipped: "notices of new articles are off (Settings → Plugins → FreshRSS)" };
  if (!String(s?.server ?? "").trim()) return { skipped: "no FreshRSS address in Settings" };
  const now = Date.now();
  const state = await loadState();
  let page: { articles: Article[] };
  try {
    page = await articles({ ...p, stream: ALL, unread: true });
  } catch (e) {
    // a server away or a login refused is not this round's failure: said in the log, tried again next round
    return { skipped: `FreshRSS not reached: ${(e as Error)?.message ?? e}` };
  }
  const fresh = state.since ? newSince(page.articles, state.since, state.told) : [];
  await atlas.write(STATE, JSON.stringify({ since: now, told: fresh.map((a: Article) => a.id).slice(0, 200) }));
  const notice = noticeOf(fresh);
  if (!state.since) return { summary: "first round: new articles are told from now on" };
  return notice ? { summary: notice.title, notices: [{ ...notice, open: baseOf(s) }] } : { summary: "nothing new" };
}

atlas.methods({ feeds, articles, mark, unread, read, save, check });
