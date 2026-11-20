// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	// plugins/beta/audiobookshelf/abs.js
	/** What a play session is opened with (here and by the helper, which opens one again when the server ended it): the
	*  device (its listening stats are per device) and the audio played as the files are — the app's player takes them all. */
	function playBody(device) {
		return {
			deviceInfo: {
				clientName: "Atlas",
				deviceId: device
			},
			mediaPlayer: "html5",
			forceDirectPlay: true,
			forceTranscode: false,
			supportedMimeTypes: [
				"audio/mpeg",
				"audio/mp4",
				"audio/x-m4b",
				"audio/aac",
				"audio/ogg",
				"audio/flac",
				"audio/wav",
				"audio/webm"
			]
		};
	}
	// plugins/beta/audiobookshelf/helper/helper.ts
	const STATE = `.atlas/cache/${atlas.id}.json`;
	/** Player reports the server could not take (offline), kept until it answers again: a file of their own, so the
	*  catalog's `sync` and the player's reports never write over each other. */
	const PENDING = `.atlas/cache/${atlas.id}-pending.json`;
	/** The books a report has already sent to the catalog's `note` (noteWhenYours). */
	const NOTED = `.atlas/cache/${atlas.id}-noted.json`;
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
	const NOT_SET = "no Audiobookshelf server or token set (Settings → Plugins → Audiobookshelf)";
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
	/** Past its start, as the catalog counts it (thing.rs `PAST_START`): asked only of what can already be yours. */
	const PAST_START = .01;
	/** Files the books you have made yours on the server — listened past the start, or finished — PER_RUN at most a run,
	*  through the catalog's one-note rule (DESIGN-server-libraries.md §3): a book you never started gets no note. `done`:
	*  item id → what was sent, so a run sends only what changed (a book newly finished is sent again). */
	async function syncWith(io, params) {
		if (!configured(params)) return {
			summary: NOT_SET,
			filed: 0
		};
		const clock = io.clock ?? (() => Date.now());
		const server = serverOf(params);
		const shelf = String(params.settings?.finished ?? "[[read]]").trim();
		const yours = ((await io.get("/api/me"))?.mediaProgress ?? []).filter((p) => p.libraryItemId && !p.episodeId && (p.isFinished || Number(p.progress ?? 0) >= PAST_START));
		const state = await io.load() ?? {};
		const done = state.done ??= {};
		const started = clock(), failed = [];
		let filed = 0, more = false;
		for (const p of yours) {
			if (filed >= PER_RUN || clock() - started >= RUN_MS) {
				more = true;
				break;
			}
			const own = shelf && p.isFinished ? { status: shelf } : {};
			const why = p.isFinished ? "finished" : "progress";
			const sent = {
				own,
				why
			};
			if (JSON.stringify(done[p.libraryItemId]) === JSON.stringify(sent) && !params.all) continue;
			let title = p.libraryItemId;
			try {
				const item = await io.get(`/api/items/${atlas.url.quote(p.libraryItemId)}?expanded=1`);
				if (!item?.id) {
					done[p.libraryItemId] = sent;
					continue;
				}
				const book = bookOf(item, server);
				title = String(book.fields.title ?? title);
				const got = await io.note({
					kind: "book",
					ids: book.ids,
					fields: book.fields,
					own,
					why,
					...why === "progress" ? { progress: Number(p.progress) } : {}
				});
				if (got?.path && !got.made && Object.keys(own).length) await io.add({
					text: title,
					kind: "book",
					ids: book.ids,
					own
				});
				done[p.libraryItemId] = sent;
				filed++;
			} catch (e) {
				failed.push(`${title}: ${e instanceof Error ? e.message : e}`);
			}
		}
		await io.save(state);
		return {
			summary: `${filed} audiobook${filed === 1 ? "" : "s"} you started or finished filed from Audiobookshelf${more ? ", more next run" : ""}${failed.length ? `; ${failed.length} failed (${failed[0]})` : ""}`,
			filed,
			failed
		};
	}
	/** An error of the way to the server (no network, no answer), not one of the server's answers: the report is kept. */
	const unreachable = (e) => /error sending request|connect|dns|timed? ?out|unreachable|network/i.test(String(e?.message ?? e));
	/** The report added to its item's pending session (made when none): the time listened summed, the place the last. */
	async function queued(queue, of, device, body) {
		const now = (queue.clock ?? Date.now)(), all = await queue.load(), k = `${of.item}/${of.episode ?? ""}`, was = all[k];
		all[k] = {
			id: was?.id ?? `${device}-${of.item}-${now}`,
			libraryItemId: of.item,
			...of.episode ? { episodeId: of.episode } : {},
			mediaType: of.episode ? "podcast" : "book",
			playMethod: 3,
			mediaPlayer: "html5",
			deviceInfo: {
				clientName: "Atlas",
				deviceId: device
			},
			duration: body.duration || was?.duration || 0,
			currentTime: body.currentTime,
			timeListening: (was?.timeListening ?? 0) + body.timeListened,
			startedAt: was?.startedAt ?? now - body.timeListened * 1e3,
			updatedAt: now
		};
		await queue.save(all);
	}
	/** The kept sessions sent, once the server answers again; one it refuses (404: an item gone) is dropped, one it
	*  cannot be reached for stays. */
	async function flush(post, queue) {
		const all = await queue.load();
		const keys = Object.keys(all);
		if (!keys.length) return;
		for (const k of keys) try {
			await post("/api/session/local", all[k]);
			delete all[k];
		} catch (e) {
			if (unreachable(e)) break;
			delete all[k];
		}
		await queue.save(all);
	}
	/** Where you are, to the server's play session: synced (closed at the end of the player's run). A session the server no
	*  longer knows (it ended it, or restarted) — or none yet — is opened again and the report sent there; the answer's
	*  `key` then carries the new session, and the player sends that from then on. With the server out of reach (a kept
	*  download played offline) the report is kept in `queue` and sent as a local session once a later report gets
	*  through. */
	async function progressWith(post, params, queue) {
		if (!configured(params)) return { skipped: NOT_SET };
		const { item, episode, device = "atlas" } = params.key ?? {};
		if (!item) throw new Error("a report with no book (key.item)");
		const of = episode ? {
			item,
			episode
		} : { item };
		const body = {
			currentTime: Math.max(0, Number(params.at) || 0),
			timeListened: Math.max(0, Math.round(Number(params.listened) || 0)),
			duration: Math.max(0, Number(params.duration) || 0)
		};
		const closing = params.state === "closed";
		try {
			const answer = await reported(post, closing, body, of, device, params.key?.session);
			if (queue) await flush(post, queue);
			return answer;
		} catch (e) {
			if (!queue || !unreachable(e)) throw e;
			await queued(queue, of, device, body);
			return {
				key: {
					...of,
					device
				},
				queued: true
			};
		}
	}
	/** The book's note, made the moment a report says it became yours — listened past the start, or played to the end —
	*  through the catalog's one-note rule, on the desktop and the phone alike (both players report here). Once per book:
	*  later reports ask nothing. A podcast's episode is not a book; a failure waits for the next report (or `sync`). */
	async function noteWhenYours(io, params) {
		const { item, episode } = params.key ?? {};
		const length = Number(params.duration) || 0, at = Number(params.at) || 0;
		const ended = params.state === "ended";
		if (!item || episode || !configured(params) || !(ended || length > 0 && at / length >= PAST_START)) return null;
		const sent = await io.load().catch(() => []);
		if (sent.includes(item) || !await io.ready()) return null;
		const got = await io.get(`/api/items/${atlas.url.quote(item)}?expanded=1`).catch(() => null);
		if (!got?.id) return null;
		const book = bookOf(got, serverOf(params));
		const why = ended ? { why: "finished" } : {
			why: "progress",
			progress: at / length
		};
		const r = await io.note({
			kind: "book",
			ids: book.ids,
			fields: book.fields,
			...why
		});
		await io.save([...sent, item].slice(-500));
		return r?.path ?? null;
	}
	/** One report sent to its session, opened again when the server lost it: the key the player sends from then on. */
	async function reported(post, closing, body, of, device, known) {
		const { item, episode } = of;
		const send = (session) => post(`/api/session/${atlas.url.quote(session)}/${closing ? "close" : "sync"}`, body);
		let session = known;
		if (session && await send(session) !== null) return { key: {
			...of,
			session,
			device
		} };
		if (closing) return { key: {
			...of,
			device
		} };
		const play = `/api/items/${atlas.url.quote(item)}/play${episode ? `/${atlas.url.quote(episode)}` : ""}`;
		const opened = JSON.parse(await post(play, playBody(device)) ?? "null");
		if (!opened?.id) throw new Error("Audiobookshelf opened no play session");
		session = String(opened.id);
		if (await send(session) === null) throw new Error("Audiobookshelf lost the session it just opened");
		return { key: {
			...of,
			session,
			device
		} };
	}
	/** The server's API, the token put in by the core (the helper never holds it). */
	const transport = (params) => (path) => atlas.fetchJson(`${serverOf(params)}${path}`, { headers: { Authorization: {
		secret: "token",
		prefix: "Bearer "
	} } });
	/** Whether the catalog can run in this vault: the library and the player work without it, `sync` files nothing then. */
	async function catalogRuns() {
		return (await atlas.get("/api/plugins").catch(() => []) ?? []).some((p) => (p.provides ?? []).includes("catalog") && !p.blocked && !p.error);
	}
	const poster = (params) => (path, body) => atlas.fetch(`${serverOf(params)}${path}`, {
		method: "POST",
		body,
		headers: { Authorization: {
			secret: "token",
			prefix: "Bearer "
		} }
	});
	const noting = (params) => ({
		note: (body) => atlas.post("/api/plugins/@catalog/tools/note", body),
		get: transport(params),
		ready: catalogRuns,
		load: async () => {
			try {
				return JSON.parse(await atlas.read(NOTED));
			} catch {
				return [];
			}
		},
		save: (ids) => atlas.write(NOTED, JSON.stringify(ids))
	});
	/** The player's reports kept while the server is out of reach. */
	const pending = {
		load: async () => {
			try {
				return JSON.parse(await atlas.read(PENDING));
			} catch {
				return {};
			}
		},
		save: async (p) => {
			await atlas.write(PENDING, JSON.stringify(p, null, 1));
		}
	};
	atlas.methods({
		progress: async (params) => {
			const answer = await progressWith(poster(params), params, pending);
			await noteWhenYours(noting(params), params).catch(() => null);
			return answer;
		},
		lookup: (params) => lookupWith(transport(params), params),
		sync: async (params) => !await catalogRuns() ? {
			summary: "the catalog is not on: nothing filed",
			filed: 0
		} : syncWith({
			get: transport(params),
			note: (body) => atlas.post("/api/plugins/@catalog/tools/note", body),
			add: (body) => atlas.post("/api/plugins/@catalog/tools/add", body),
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
	exports.bookOf = bookOf;
	exports.duration = duration;
	exports.lookupWith = lookupWith;
	exports.noteWhenYours = noteWhenYours;
	exports.progressWith = progressWith;
	exports.syncWith = syncWith;
	exports.unreachable = unreachable;
	return exports;
})({});
