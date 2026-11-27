// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function() {
	// plugins/beta/freshrss/fr.js
	/** Google Reader's states, as stream ids and tags. */
	const READ = "user/-/state/com.google/read";
	const STARRED = "user/-/state/com.google/starred";
	const ALL = "user/-/state/com.google/reading-list";
	/** The `Auth` token of a ClientLogin answer (`SID=…\nLSID=…\nAuth=…`), or null when the login was refused. */
	function loginToken(text) {
		const m = String(text ?? "").match(/^Auth=(.+)$/m);
		return m ? m[1].trim() : null;
	}
	/** The address of one page of a stream: `feed/12`, ALL, STARRED; only the unread with `unread`; `c` a continuation. */
	function streamPath({ stream = ALL, unread = false, n = 50, c = "" } = {}) {
		const q = [
			`n=${n}`,
			...unread ? [`xt=${encodeURIComponent(READ)}`] : [],
			...c ? [`c=${encodeURIComponent(c)}`] : []
		];
		return `/reader/api/0/stream/contents/${encodeURIComponent(stream)}?output=json&${q.join("&")}`;
	}
	/** An item of a Google Reader stream → an article. */
	function articleOf(it) {
		const tags = (it.categories ?? []).map(String);
		const has = (state) => tags.some((t) => t.endsWith(state.replace("user/-", "")));
		const link = (it.canonical ?? it.alternate ?? [])[0]?.href ?? null;
		return {
			id: String(it.id),
			title: String(it.title ?? "").trim() || "(untitled)",
			url: link,
			feed: String(it.origin?.title ?? ""),
			feedId: String(it.origin?.streamId ?? ""),
			author: String(it.author ?? ""),
			published: Number(it.published) ? Number(it.published) * 1e3 : Number(it.crawlTimeMsec) || 0,
			crawled: Number(it.crawlTimeMsec) || 0,
			html: String(it.content?.content ?? it.summary?.content ?? ""),
			read: has(READ),
			starred: has(STARRED)
		};
	}
	/** A stream's answer → its articles and the continuation of the next page ("" when it was the last). */
	const streamOf = (answer) => ({
		articles: (answer?.items ?? []).map(articleOf),
		more: String(answer?.continuation ?? "")
	});
	/** The subscriptions and the unread counts → the feeds, each with its folder and how many are unread, by name. */
	function feedsOf(subs, counts) {
		const unread = new Map((counts?.unreadcounts ?? []).map((u) => [String(u.id), Number(u.count) || 0]));
		return (subs?.subscriptions ?? []).map((s) => ({
			id: String(s.id),
			title: String(s.title ?? s.id),
			folder: String(s.categories?.[0]?.label ?? ""),
			site: s.htmlUrl ?? null,
			unread: unread.get(String(s.id)) ?? 0
		})).sort((a, b) => a.folder.localeCompare(b.folder) || a.title.localeCompare(b.title));
	}
	/** The body of an `edit-tag` (marking articles read, unread, starred…): one `i` per article — a repeated field, which
	*  is why the helper writes this body itself instead of the core's form map — the tag to add or remove, and `T`, the
	*  write token Google Reader asks of every change. */
	function editTagBody(ids, { add = "", remove = "" }, token) {
		const f = (k, v) => `${k}=${encodeURIComponent(v)}`;
		return [
			...ids.map((i) => f("i", i)),
			...add ? [f("a", add)] : [],
			...remove ? [f("r", remove)] : [],
			f("T", token)
		].join("&");
	}
	/** A mark asked of the reader (`read`, `unread`, `star`, `unstar`) → the tag change. */
	function changeOf(mark) {
		const change = {
			read: { add: READ },
			unread: { remove: READ },
			star: { add: STARRED },
			unstar: { remove: STARRED }
		}[mark];
		if (!change) throw new Error(`no mark ${JSON.stringify(mark)} (read, unread, star, unstar)`);
		return change;
	}
	/** A Fever item → an article (`feeds`: Fever's feed list, for the feed's name). Fever's ids are numbers. */
	function feverArticle(it, feeds = /* @__PURE__ */ new Map()) {
		return {
			id: String(it.id),
			title: String(it.title ?? "").trim() || "(untitled)",
			url: it.url ?? null,
			feed: feeds.get(Number(it.feed_id)) ?? "",
			feedId: it.feed_id != null ? `feed/${it.feed_id}` : "",
			author: String(it.author ?? ""),
			published: (Number(it.created_on_time) || 0) * 1e3,
			crawled: 0,
			html: String(it.html ?? ""),
			read: !!Number(it.is_read),
			starred: !!Number(it.is_saved)
		};
	}
	/** Fever's `feeds` answer → feed names by id, and the feeds with their unread counts (from `unread_item_ids` and the
	*  items' feeds, when known). */
	function feverFeeds(answer, unreadByFeed = /* @__PURE__ */ new Map()) {
		const feeds = answer?.feeds ?? [];
		return {
			names: new Map(feeds.map((f) => [Number(f.id), String(f.title ?? f.id)])),
			list: feeds.map((f) => ({
				id: `feed/${f.id}`,
				title: String(f.title ?? f.id),
				folder: "",
				site: f.site_url ?? null,
				unread: unreadByFeed.get(Number(f.id)) ?? 0
			})).sort((a, b) => a.title.localeCompare(b.title))
		};
	}
	/** A mark → Fever's `mark=item&as=…` query, or null when Fever cannot (it has no "unread" for an item before 1.0). */
	function feverMark(mark, id) {
		const as = {
			read: "read",
			unread: "unread",
			star: "saved",
			unstar: "unsaved"
		}[mark];
		if (!as) throw new Error(`no mark ${JSON.stringify(mark)} (read, unread, star, unstar)`);
		return `mark=item&as=${as}&id=${encodeURIComponent(id)}`;
	}
	/** An article as an agent reads it: no HTML, its text (cut to `chars`), when, which feed, the marks. */
	function forAgent(a, text = "", chars = 0) {
		return {
			id: a.id,
			title: a.title,
			url: a.url,
			feed: a.feed,
			published: a.published ? new Date(a.published).toISOString() : null,
			read: a.read,
			starred: a.starred,
			...text ? { text: chars ? text.slice(0, chars) : text } : {}
		};
	}
	/** The unread articles a round has not told yet: newer than the last round (`since`, ms; by FreshRSS's crawl time
	*  where it gives one, else the publication time) and not among the ids it told (`told`), newest first. */
	function newSince(articles, since, told = []) {
		const seen = new Set(told);
		return articles.filter((a) => !a.read && (a.crawled || a.published) > since && !seen.has(a.id)).sort((a, b) => (b.crawled || b.published) - (a.crawled || a.published));
	}
	/** The one notice of a round: how many, from which feeds, the newest titles; opening it opens the reader. Replaces
	*  the last round's (one id), so a day of rounds is one notice, not a pile. */
	function noticeOf(fresh, shown = 3) {
		if (!fresh.length) return null;
		const feeds = [...new Set(fresh.map((a) => a.feed).filter(Boolean))];
		const titles = fresh.slice(0, shown).map((a) => `• ${a.title}${a.feed ? ` (${a.feed})` : ""}`);
		const rest = fresh.length > shown ? [`and ${fresh.length - shown} more`] : [];
		return {
			id: "freshrss-new",
			title: `${fresh.length} new article${fresh.length === 1 ? "" : "s"} in FreshRSS${feeds.length === 1 ? `: ${feeds[0]}` : ""}`,
			body: [...titles, ...rest].join("\n")
		};
	}
	/** A note's file name from an article's title (what Obsidian and every OS accept). */
	const fileName = (t) => String(t).replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Article";
	// plugins/beta/freshrss/helper/helper.ts
	const baseOf = (s) => {
		const base = String(s?.server ?? "").trim().replace(/\/+$/, "");
		if (!base) throw new atlas.AtlasError("set the FreshRSS address in Settings → Plugins → FreshRSS", 400);
		return base;
	};
	const fever = (s) => String(s?.protocol ?? "greader") === "fever";
	/** An article's text (an agent's, a kept note's): read from its cleaned HTML without its `<style>` (which the cleaner
	*  keeps for the frame), so no script or CSS lands in it. */
	const textOf = (html) => (atlas.html.select(`<body>${atlas.html.clean(html ?? "").html.replace(/<style[\s\S]*?<\/style>/gi, "")}</body>`, "body")[0]?.text ?? "").replace(/\s+\n/g, "\n").trim();
	/** The session token, per server and user: FreshRSS keeps it for days; a 401 signs in again. */
	let session = null;
	async function login(s, again = false) {
		const key = `${baseOf(s)}\n${s?.user ?? ""}`;
		if (session && session.key === key && !again) return session.token;
		const user = String(s?.user ?? "").trim();
		if (!user) throw new atlas.AtlasError("set your FreshRSS user name in Settings → Plugins → FreshRSS", 400);
		const res = await atlas.fetchResponse({
			url: `${baseOf(s)}/api/greader.php/accounts/ClientLogin`,
			method: "POST",
			form: {
				Email: user,
				Passwd: { secret: "api_password" }
			},
			timeout_secs: 30
		});
		const token = res.ok ? loginToken(res.text) : null;
		if (!token) throw new atlas.AtlasError(res.status === 401 || res.status === 403 || res.ok ? "FreshRSS refused the user or the API password (FreshRSS → Settings → Profile → API password; the API must be on in Authentication)" : `FreshRSS answered ${res.status}`, 403);
		session = {
			key,
			token
		};
		return token;
	}
	/** One Google Reader call, signed in; signed in again once when FreshRSS has forgotten the session. */
	async function greader(s, path, init = {}) {
		for (let attempt = 0; attempt < 2; attempt++) {
			const token = await login(s, attempt > 0);
			const res = await atlas.fetchResponse({
				url: `${baseOf(s)}/api/greader.php${path}`,
				method: init.method ?? "GET",
				timeout_secs: 30,
				body: init.body,
				headers: {
					Authorization: `GoogleLogin auth=${token}`,
					...init.body ? { "content-type": "application/x-www-form-urlencoded" } : {}
				}
			});
			if (res.status === 401 && attempt === 0) continue;
			if (!res.ok) throw new atlas.AtlasError(`FreshRSS answered ${res.status}`, 502);
			return res.text;
		}
		throw new atlas.AtlasError("FreshRSS refused the session twice", 403);
	}
	const greaderJson = async (s, path) => JSON.parse(await greader(s, path) || "{}");
	async function feverCall(s, query) {
		const res = await atlas.fetchResponse({
			url: `${baseOf(s)}/api/fever.php?api&${query}`,
			method: "POST",
			form: { api_key: { secret: "api_key" } },
			timeout_secs: 30
		});
		if (!res.ok) throw new atlas.AtlasError(`FreshRSS answered ${res.status}`, 502);
		const j = JSON.parse(res.text || "{}");
		if (j.auth === 0) throw new atlas.AtlasError("FreshRSS did not accept the Fever API key", 403);
		return j;
	}
	async function feverNames(s) {
		return feverFeeds(await feverCall(s, "feeds")).names;
	}
	async function feverItems(s, ids) {
		if (!ids.length) return [];
		const [items, names] = await Promise.all([feverCall(s, `items&with_ids=${ids.join(",")}`), feverNames(s)]);
		return (items.items ?? []).map((it) => feverArticle(it, names));
	}
	/** The feeds with their unread counts. */
	async function feeds(p) {
		const s = p.settings;
		if (fever(s)) {
			const unreadIds = String((await feverCall(s, "unread_item_ids")).unread_item_ids ?? "").split(",").filter(Boolean);
			const items = await feverItems(s, unreadIds.slice(0, 500));
			const byFeed = /* @__PURE__ */ new Map();
			for (const a of items) byFeed.set(Number(a.feedId.slice(5)), (byFeed.get(Number(a.feedId.slice(5))) ?? 0) + 1);
			return {
				feeds: feverFeeds(await feverCall(s, "feeds"), byFeed).list,
				unread: unreadIds.length,
				protocol: "fever"
			};
		}
		const [subs, counts] = await Promise.all([greaderJson(s, "/reader/api/0/subscription/list?output=json"), greaderJson(s, "/reader/api/0/unread-count?output=json")]);
		const list = feedsOf(subs, counts);
		return {
			feeds: list,
			unread: list.reduce((n, f) => n + f.unread, 0),
			protocol: "greader"
		};
	}
	/** One page of a stream (`stream`: a feed id, ALL, STARRED; `unread`: only those; `more`: the last page's
	*  continuation), each article's HTML cleaned for the page's frame. */
	async function articles(p) {
		const s = p.settings;
		const stream = String(p.stream || "user/-/state/com.google/reading-list"), unread = !!p.unread;
		let page;
		if (fever(s)) {
			const idsOf = async (q, key) => String((await feverCall(s, q))[key] ?? "").split(",").filter(Boolean);
			let ids = stream === "user/-/state/com.google/starred" ? await idsOf("saved_item_ids", "saved_item_ids") : await idsOf("unread_item_ids", "unread_item_ids");
			ids = ids.map(Number).sort((a, b) => b - a).filter((id) => !p.more || id < Number(p.more)).map(String);
			let list = await feverItems(s, ids.slice(0, 50));
			if (stream !== "user/-/state/com.google/reading-list" && stream !== "user/-/state/com.google/starred") list = list.filter((a) => a.feedId === stream);
			page = {
				articles: list,
				more: ids.length > 50 ? ids[49] : ""
			};
		} else page = streamOf(await greaderJson(s, streamPath({
			stream,
			unread: unread && stream !== "user/-/state/com.google/starred",
			c: String(p.more ?? "")
		})));
		for (const a of page.articles) a.html = atlas.html.clean(a.html).html;
		return page;
	}
	/** Marks articles read, unread, starred or not (`mark`, `ids`). */
	async function mark(p) {
		const s = p.settings;
		const ids = (Array.isArray(p.ids) ? p.ids : [p.ids]).map(String).filter(Boolean);
		if (!ids.length) throw new atlas.AtlasError("which articles: ids", 400);
		const what = String(p.mark ?? "");
		if (fever(s)) for (const id of ids) await feverCall(s, feverMark(what, id));
		else {
			const token = (await greader(s, "/reader/api/0/token")).trim();
			await greader(s, "/reader/api/0/edit-tag", {
				method: "POST",
				body: editTagBody(ids, changeOf(what), token)
			});
		}
		return {
			marked: ids.length,
			mark: what
		};
	}
	/** Articles by id (Google Reader's `stream/items/contents`, Fever's `with_ids`). */
	async function byIds(s, ids) {
		if (fever(s)) return feverItems(s, ids.map((i) => i.replace(/\D/g, "")).filter(Boolean));
		const body = ids.map((i) => `i=${encodeURIComponent(i)}`).join("&");
		return streamOf(JSON.parse(await greader(s, "/reader/api/0/stream/items/contents?output=json", {
			method: "POST",
			body
		}) || "{}")).articles;
	}
	/** The unread articles, newest first (the block and `freshrss_unread`): what, where from, the link. */
	async function unread(p) {
		return (await articles({
			...p,
			stream: ALL,
			unread: true
		})).articles.slice(0, Math.max(1, Number(p.limit) || 15)).map((a) => forAgent(a));
	}
	/** One article's whole text, for an agent (`freshrss_read`). */
	async function read(p) {
		const id = String(p.id ?? "");
		if (!id) throw new atlas.AtlasError("which article: an id from freshrss_unread", 400);
		const a = (await byIds(p.settings, [id]))[0];
		if (!a) throw new atlas.AtlasError(`FreshRSS has no article ${id}`, 404);
		return forAgent(a, textOf(a.html), Number(p.chars) || 2e4);
	}
	/** One article as a note in the settings' folder → { path, made } (made: false when it was there: never written over).
	*  The note is the feature's own: its source, feed and day as properties, the article's text as its body. */
	async function save(p) {
		const id = String(p.id ?? "");
		if (!id) throw new atlas.AtlasError("which article: an id from freshrss_unread", 400);
		const a = (await byIds(p.settings, [id]))[0];
		if (!a) throw new atlas.AtlasError(`FreshRSS has no article ${id}`, 404);
		const path = `${String(p.settings?.folder || "notes/reading").replace(/\/+$/, "")}/${fileName(a.title)}.md`;
		try {
			await atlas.read(path);
			return {
				path,
				made: false
			};
		} catch (e) {
			if (e.status !== 404) throw e;
		}
		const day = (/* @__PURE__ */ new Date()).toLocaleDateString("sv-SE");
		const props = [
			`type: article`,
			`source: ${JSON.stringify(a.url ?? "")}`,
			...a.feed ? [`feed: ${JSON.stringify(a.feed)}`] : [],
			`saved: ${day}`
		];
		await atlas.write(path, `---\n${props.join("\n")}\n---\n# ${a.title}\n\n${textOf(a.html)}\n`);
		return {
			path,
			made: true
		};
	}
	/** What the last round saw, kept between rounds (the helper stops when idle): its time and the ids it told. */
	const STATE = `.atlas/cache/${atlas.id}.json`;
	const loadState = async () => {
		try {
			return JSON.parse(await atlas.read(STATE));
		} catch {
			return {};
		}
	};
	/** The scheduled round (`check`, every 30 minutes): one notice of the unread articles that came since the last round,
	*  when Settings asks for notices. The first round only notes the time: what was unread before is not news. */
	async function check(p) {
		const s = p.settings;
		if (!s?.notify) return { skipped: "notices of new articles are off (Settings → Plugins → FreshRSS)" };
		if (!String(s?.server ?? "").trim()) return { skipped: "no FreshRSS address in Settings" };
		const now = Date.now();
		const state = await loadState();
		let page;
		try {
			page = await articles({
				...p,
				stream: ALL,
				unread: true
			});
		} catch (e) {
			return { skipped: `FreshRSS not reached: ${e?.message ?? e}` };
		}
		const fresh = state.since ? newSince(page.articles, state.since, state.told) : [];
		await atlas.write(STATE, JSON.stringify({
			since: now,
			told: fresh.map((a) => a.id).slice(0, 200)
		}));
		const notice = noticeOf(fresh);
		if (!state.since) return { summary: "first round: new articles are told from now on" };
		return notice ? {
			summary: notice.title,
			notices: [{
				...notice,
				open: baseOf(s)
			}]
		} : { summary: "nothing new" };
	}
	atlas.methods({
		feeds,
		articles,
		mark,
		unread,
		read,
		save,
		check
	});
})();
