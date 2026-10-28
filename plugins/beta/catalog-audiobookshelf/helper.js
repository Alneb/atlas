// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/catalog-audiobookshelf/helper/helper.ts
	const STATE = `.atlas/cache/${atlas.id}.json`;
	const PER_RUN = 30;
	const RUN_MS = 24e4;
	/** 3725.4 → "1h 02m": the catalog's legible listening time. */
	function duration(seconds) {
		if (!seconds) return void 0;
		const m = Math.round(Number(seconds) / 60);
		return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
	}
	/** Authors or narrators, expanded (`[{name}]`, `["…"]`) or minified (`"A, B"`) → one name, or a list. */
	function names(v) {
		const items = (typeof v === "string" ? v.split(",").map((n) => n.trim()) : (v ?? []).map((n) => n && typeof n === "object" ? n.name : n)).filter((n) => typeof n === "string" && !!n.trim());
		return items.length === 1 ? items[0] : items.length ? items : void 0;
	}
	const isbnOf = (v) => [...String(v ?? "")].filter((c) => /[\dXx]/.test(c)).join("");
	/** A library item → the catalog's {ids, fields}: the audiobook's own details and the link to it. */
	function bookOf(item, server) {
		const media = item.media ?? {}, m = media.metadata ?? {};
		const year = String(m.publishedYear ?? "").slice(0, 4);
		const fields = {
			title: m.title,
			author: names(m.authors ?? m.authorName),
			narrator: names(m.narrators ?? m.narratorName),
			year: /^\d{4}$/.test(year) ? Number(year) : void 0,
			publisher: m.publisher,
			genres: (m.genres ?? []).filter((g) => typeof g === "string"),
			description: m.description,
			duration: duration(media.duration),
			audiobook: `${server}/item/${item.id}`
		};
		const ids = { audiobookshelf: item.id };
		const isbn = isbnOf(m.isbn);
		if (isbn.length === 10 || isbn.length === 13) ids.isbn = isbn;
		return {
			ids,
			fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== void 0 && v !== null && v !== "" && !(Array.isArray(v) && !v.length)))
		};
	}
	async function bookLibraries(get) {
		return ((await get("/api/libraries"))?.libraries ?? []).filter((l) => (l.mediaType ?? "book") === "book").map((l) => l.id);
	}
	/** The item for this book: by its id; else a search per library, kept only on the same ISBN or the same title. */
	async function find(get, ids, hints) {
		if (ids.audiobookshelf) return get(`/api/items/${ids.audiobookshelf}?expanded=1`);
		const isbn = ids.isbn, title = String(hints.title ?? "").trim();
		for (const lib of await bookLibraries(get)) for (const q of [isbn, title].filter(Boolean)) for (const hit of (await get(`/api/libraries/${lib}/search?q=${atlas.url.quote(q)}&limit=10`))?.book ?? []) {
			const item = hit.libraryItem ?? {}, m = item.media?.metadata ?? {};
			if (isbn && isbnOf(m.isbn) === isbn || title && String(m.title ?? "").toLowerCase() === title.toLowerCase()) return item;
		}
		return null;
	}
	const serverOf = (params) => String(params.settings?.server ?? "").replace(/\/+$/, "");
	const configured = (params) => Boolean(serverOf(params) && params.secrets?.token);
	const NOT_SET = "no Audiobookshelf server or token set (Settings → Catalog · Audiobookshelf)";
	async function lookupWith(get, params) {
		if (!configured(params)) return {
			fields: {},
			skipped: NOT_SET
		};
		const item = await find(get, params.ids ?? {}, params.hints ?? {});
		return item ? bookOf(item, serverOf(params)) : {
			fields: {},
			skipped: "not on your Audiobookshelf"
		};
	}
	/** Files every book of the server's book libraries, PER_RUN at most a run: what is new, or newly finished. `done`:
	*  item id → what was sent, so a run sends only what changed. */
	async function syncWith(io, params) {
		if (!configured(params)) return {
			summary: NOT_SET,
			filed: 0
		};
		const clock = io.clock ?? (() => Date.now());
		const server = serverOf(params);
		const shelf = String(params.settings?.finished ?? "[[read]]").trim();
		const finished = new Set(((await io.get("/api/me"))?.mediaProgress ?? []).filter((p) => p.isFinished).map((p) => p.libraryItemId));
		const state = await io.load() ?? {};
		const done = state.done ??= {};
		const started = clock(), failed = [];
		let filed = 0, more = false;
		const outOfRun = () => filed >= PER_RUN || clock() - started >= RUN_MS;
		for (const lib of await bookLibraries(io.get)) {
			let page = 0, hasMore = true;
			while (hasMore && !outOfRun()) {
				const r = await io.get(`/api/libraries/${lib}/items?limit=50&page=${page}`) ?? {};
				hasMore = (page + 1) * 50 < Number(r.total ?? 0);
				page++;
				for (const item of r.results ?? []) {
					if (outOfRun()) {
						more = true;
						break;
					}
					const own = shelf && finished.has(item.id) ? { status: shelf } : {};
					const sent = JSON.stringify({ own });
					if (JSON.stringify(done[item.id]) === sent && !params.all) continue;
					const book = bookOf(item, server);
					try {
						await io.add({
							text: book.fields.title ?? book.fields.audiobook,
							kind: "book",
							ids: book.ids,
							own
						});
						done[item.id] = { own };
						filed++;
					} catch (e) {
						failed.push(`${book.fields.title ?? item.id}: ${e instanceof Error ? e.message : e}`);
					}
				}
			}
			more = more || hasMore;
		}
		await io.save(state);
		return {
			summary: `${filed} audiobook${filed === 1 ? "" : "s"} filed from Audiobookshelf${more ? ", more next run" : ""}${failed.length ? `; ${failed.length} failed (${failed[0]})` : ""}`,
			filed,
			failed
		};
	}
	/** The server's API, the token put in by the core (the helper never holds it). */
	const transport = (params) => (path) => atlas.fetchJson(`${serverOf(params)}${path}`, { headers: { Authorization: {
		secret: "token",
		prefix: "Bearer "
	} } });
	atlas.methods({
		lookup: (params) => lookupWith(transport(params), params),
		sync: (params) => syncWith({
			get: transport(params),
			add: (body) => atlas.post("/api/plugins/catalog/tools/add", body),
			load: async () => {
				try {
					return JSON.parse(await atlas.read(STATE));
				} catch {
					return {};
				}
			},
			save: (s) => atlas.write(STATE, JSON.stringify(s, null, 1))
		}, params)
	});
	//#endregion
	exports.bookOf = bookOf;
	exports.duration = duration;
	exports.lookupWith = lookupWith;
	exports.syncWith = syncWith;
	return exports;
})({});
