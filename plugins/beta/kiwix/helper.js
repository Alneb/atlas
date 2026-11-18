// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/kiwix/helper/helper.ts
	/** The server's books, kept a while: listed once, not on every keystroke of a search. */
	let kept = null;
	const KEEP_MS = 6e5;
	const serverOf = (p) => String(p.settings?.server ?? "").trim().replace(/\/+$/, "");
	const tag = (xml, name) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? "";
	const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
	const decoded = (s) => {
		try {
			return decodeURIComponent(s);
		} catch {
			return s;
		}
	};
	/** The server's own path root (kiwix-serve --urlRootLocation /kiwix: its links are /kiwix/content/…). */
	const contentRoot = (server) => `${server.replace(/^https?:\/\/[^/]+/, "")}/content/`;
	/** The books an OPDS catalog lists: each entry's content link names it. */
	function booksOf(xml, server) {
		const root = contentRoot(server);
		return xml.split("<entry").slice(1).map((e) => {
			const href = [...e.matchAll(/<link[^>]*href="([^"]*)"/g)].map((m) => unescape(m[1])).find((h) => h.startsWith(root)) ?? "";
			return {
				id: decoded(href.slice(root.length)).replace(/\/+$/, ""),
				title: unescape(tag(e, "title")),
				name: unescape(tag(e, "name"))
			};
		}).filter((b) => b.id);
	}
	/** The books to search: those whose name or title holds a word of `setting` (comma-separated), else every one. */
	function chosen(books, setting) {
		const words = setting.toLowerCase().split(",").map((w) => w.trim()).filter(Boolean);
		const named = words.length ? books.filter((b) => words.some((w) => `${b.name} ${b.title}`.toLowerCase().includes(w))) : books;
		return named.length ? named : books;
	}
	async function books(server) {
		if (kept && kept.server === server && Date.now() - kept.at < KEEP_MS) return kept.books;
		const xml = await atlas.fetch(`${server}/catalog/v2/entries?count=-1`, { timeout: 5 });
		kept = {
			server,
			at: Date.now(),
			books: booksOf(xml ?? "", server)
		};
		return kept.books;
	}
	const articleUrl = (server, book, path) => `${server}/content/${encodeURIComponent(book)}/${path.split("/").map(encodeURIComponent).join("/")}`;
	atlas.methods({ 
	/** {q, limit} → `{hits}`: the articles whose titles match, each {title, detail, url} (PLUGIN-API.md, on = "search"). */
search: async (params) => {
		const server = serverOf(params), q = String(params.q ?? "").trim(), limit = Math.max(1, Math.min(20, Number(params.limit ?? 8)));
		if (!server || q.length < 2) return { hits: [] };
		const hits = [];
		for (const b of chosen(await books(server), String(params.settings?.books ?? "")).slice(0, 2)) {
			const got = await atlas.fetch(`${server}/suggest?content=${encodeURIComponent(b.id)}&term=${encodeURIComponent(q)}&count=${limit}`, { timeout: 3 });
			let list = [];
			try {
				list = JSON.parse(got ?? "[]");
			} catch {
				continue;
			}
			for (const s of list) if (s.kind === "path" && s.path && s.value) hits.push({
				title: s.value,
				detail: b.title || b.name,
				url: articleUrl(server, b.id, s.path)
			});
			if (hits.length >= limit) break;
		}
		return { hits: hits.slice(0, limit) };
	} });
	//#endregion
	exports.booksOf = booksOf;
	exports.chosen = chosen;
	return exports;
})({});
