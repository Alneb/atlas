// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/catalog-letterboxd/helper/helper.ts
	const SITE = "https://letterboxd.com";
	const STATE = `.atlas/cache/${atlas.id}.json`;
	const PER_RUN = 40;
	const RUN_MS = 24e4;
	const unescape = (s) => atlas.html.unescape(s);
	/** Fields without the empty ones: null, "", false, 0 (as the Python helper's `_own`). */
	const own = (fields) => Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== void 0 && v !== null && v !== "" && v !== false && v !== 0));
	/** Two flat records alike, whatever their keys' order. */
	function same(a, b) {
		if (!a) return false;
		const ka = Object.keys(a), kb = Object.keys(b);
		return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
	}
	/** The page's JSON-LD film (Letterboxd wraps it in a CDATA comment). */
	function ld(page) {
		for (const m of page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) try {
			const o = JSON.parse(m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim());
			if (o && typeof o === "object" && o["@type"] === "Movie") return o;
		} catch {}
		return {};
	}
	function names(v, most) {
		const out = [];
		for (const x of Array.isArray(v) ? v : v ? [v] : []) {
			const n = x && typeof x === "object" ? x.name : x;
			if (typeof n === "string" && n.trim() && !out.includes(n.trim())) out.push(n.trim());
		}
		return out.slice(0, most);
	}
	const oneOrList = (ns) => ns.length === 1 ? ns[0] : ns.length ? ns : void 0;
	function runtime(page) {
		const m = /(\d+)&nbsp;mins/.exec(page);
		if (!m) return void 0;
		const n = Number(m[1]);
		return n >= 60 ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}m` : `${n}m`;
	}
	/** A film page → {kind, ids, fields} in the catalog's words; null when it is not a film page. */
	function filmFromPage(page, url) {
		const film = ld(page);
		const slug = /letterboxd\.com\/film\/([\w-]+)\//.exec(film.url || url || "") ?? /data-film-slug="([\w-]+)"/.exec(page) ?? /<meta property="og:url" content="https:\/\/letterboxd\.com\/film\/([\w-]+)\//.exec(page);
		if (!Object.keys(film).length && !slug) return null;
		const title = film.name || /<span class="name js-widont prettify">([^<]+)</.exec(page)?.[1];
		const original = /class="originalname"[^>]*>(?:<[^>]+>)*([^<]+)</.exec(page) ?? /originalname"[^>]*lang="[a-z-]+">([^<]+)</.exec(page);
		const langs = film.inLanguage;
		const lang = (Array.isArray(langs) ? langs[0] : langs) || void 0;
		let year;
		for (const d of [((film.releasedEvent || [{}])[0] || {}).startDate, film.dateCreated]) if (typeof d === "string" && /^\d{4}/.test(d)) {
			year = Number(d.slice(0, 4));
			break;
		}
		const shown = /class="releasedate"><a href="\/films\/year\/(\d{4})\//.exec(page) ?? /<meta property="og:title" content="[^"]*\((\d{4})\)"/.exec(page);
		if (shown) year = Number(shown[1]);
		const desc = /<meta name="description" content="([^"]*)"/.exec(page);
		const tmdb = /data-tmdb-id="(\d+)"/.exec(page), tmdbType = /data-tmdb-type="(\w+)"/.exec(page);
		const imdb = /imdb\.com\/title\/(tt\d+)/.exec(page);
		const ids = slug ? { letterboxd: slug[1] } : {};
		if (tmdb) {
			const kind = tmdbType ? tmdbType[1] : "movie";
			ids.tmdb = kind === "movie" ? tmdb[1] : `${kind}/${tmdb[1]}`;
		}
		if (imdb) ids.imdb = imdb[1];
		const fields = {
			title: title ? unescape(title.trim()) : void 0,
			original_title: original ? unescape(original[1].trim()) : void 0,
			language: lang,
			year,
			director: oneOrList(names(film.director, 4)),
			cast: names(film.actors || film.actor, 6),
			genres: (film.genre || []).filter((g) => typeof g === "string"),
			duration: runtime(page),
			cover: film.image,
			description: desc ? unescape(desc[1]).trim() : void 0
		};
		if (fields.original_title === fields.title) fields.original_title = void 0;
		const kept = Object.entries(fields).filter(([, v]) => v !== void 0 && v !== null && v !== "" && !(Array.isArray(v) && !v.length));
		return {
			kind: "movie",
			ids,
			fields: Object.fromEntries(kept)
		};
	}
	/** Where Letterboxd shows the film: its slug, else its IMDb or TMDB id (Letterboxd redirects those to the film). */
	function pageAddress(ids, url) {
		if (ids.letterboxd) return `${SITE}/film/${ids.letterboxd}/`;
		if (ids.imdb) return `${SITE}/imdb/${ids.imdb}/`;
		if (ids.tmdb && /^\d+$/.test(String(ids.tmdb))) return `${SITE}/tmdb/${ids.tmdb}/`;
		const m = /letterboxd\.com\/(?:[\w-]+\/)?film\/([\w-]+)/.exec(url || "");
		return m ? `${SITE}/film/${m[1]}/` : null;
	}
	async function lookupWith(get, params) {
		const address = pageAddress(params.ids ?? {}, params.url);
		if (!address) return {
			fields: {},
			skipped: "no Letterboxd slug, IMDb or TMDB id"
		};
		const page = await get(address);
		if (page === null) return {
			fields: {},
			skipped: `Letterboxd does not know ${address}`
		};
		return filmFromPage(page, address) ?? {
			fields: {},
			skipped: `${address} is not a film page`
		};
	}
	function tag(item, name) {
		const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item);
		return m ? unescape(m[1].trim()) : void 0;
	}
	/** An HTML fragment's paragraphs as text, a blank line between them; undefined when empty. */
	function paragraphs(fragment) {
		return [...(fragment || "").matchAll(/<p>([\s\S]*?)<\/p>/g)].map((p) => unescape(p[1].replace(/<(?!br)[^>]+>/g, "").replace(/<br\s*\/?>/g, "\n")).trim()).filter((p) => p && p !== "This review may contain spoilers.").join("\n\n").trim() || void 0;
	}
	/** A diary entry's text without its poster and the "Watched on …" line Letterboxd adds; undefined when that is all. */
	function review(description) {
		return paragraphs([...(description || "").replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "").trim().matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]).filter((p) => !p.includes("<img") && !/^\s*Watched on /.test(p)).map((p) => `<p>${p}</p>`).join(""));
	}
	/** The diary feed (the newest 50 entries) → film slug → {watched, rating, liked, review}; a film's newest entry wins. */
	function diary(rss) {
		const out = {};
		for (const [, item] of rss.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
			const m = /\/film\/([\w-]+)\//.exec(tag(item, "link") || "");
			if (!m || m[1] in out) continue;
			const rating = tag(item, "letterboxd:memberRating");
			out[m[1]] = own({
				watched: tag(item, "letterboxd:watchedDate"),
				rating: rating ? Number(rating) : void 0,
				liked: tag(item, "letterboxd:memberLike") === "Yes",
				review: review(tag(item, "description"))
			});
		}
		return out;
	}
	/** "★★½" → 2.5. */
	const stars = (label) => label ? [...label].filter((c) => c === "★").length + (label.includes("½") ? .5 : 0) : void 0;
	/** The address of a list's next page (`<a class="next" href=…>`), null on its last page. */
	const nextPage = (page) => /<a class="next" href="([^"]+)"/.exec(page)?.[1] ?? null;
	const REVIEW_BODY = /<div class="(?:collapsed-text|[^"]*\bjs-review-body\b[^"]*)"[^>]*>([\s\S]*?)<\/div>/;
	/** Whether a review is shown cut short: the old `collapsed-text`, a "more" link, or text ending in an ellipsis. */
	const cut = (body) => body.includes("collapsed-text") || /class="[^"]*\breveal\b/.test(body) || /(?:…|&hellip;|&#8230;)\s*<\/p>\s*(?:<\/div>)?\s*$/.test(body);
	/** One page of /<user>/reviews/ → [[slug, {watched, rating, liked, review, more}]] and the next page's address. `more`:
	*  the whole text's address when the page shows it cut (every review carries `data-full-text-url`; only a cut one needs it). */
	function reviewsPage(page) {
		const out = [];
		for (const li of page.split(/<(?:li|div) class="listitem/).slice(1)) {
			const slug = /data-item-slug="([\w-]+)"/.exec(li);
			if (!slug) continue;
			const actions = li.indexOf("class=\"viewing-actions\"");
			const head = actions > 0 ? li.slice(0, actions) : li;
			const rating = /class="glyph -rating"[^>]*aria-label="([★½]+)"/.exec(head);
			const when = /<time class="timestamp" datetime="(\d{4}-\d{2}-\d{2})"/.exec(head);
			const body = REVIEW_BODY.exec(head);
			const more = /data-full-text-url="([^"]+)"/.exec(head);
			out.push([slug[1], own({
				watched: when?.[1],
				rating: stars(rating?.[1]),
				liked: head.includes("aria-label=\"Liked\""),
				review: body ? paragraphs(body[1]) : void 0,
				more: more && cut(body?.[0] ?? "") ? more[1] : void 0
			})]);
		}
		return [out, nextPage(page)];
	}
	/** The user's own page of one film (/<user>/film/<slug>/: "Watched by" or "Review by") → {watched, rating, liked,
	*  review}: the diary's date, the stars and heart of that viewing, the whole review. Reachable when the paged lists
	*  (diary, likes, films/page/2…) are refused to programs. */
	function viewingPage(page) {
		const strip = /class="content-reactions-strip -viewing -single">([\s\S]*?)<\/div>/.exec(page)?.[1] ?? "";
		const rating = /aria-label="([★½]+)"/.exec(strip);
		const when = /\/diary\/for\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(page);
		const body = REVIEW_BODY.exec(page);
		return own({
			watched: when ? when.slice(1).join("-") : void 0,
			rating: stars(rating?.[1]),
			liked: strip.includes("aria-label=\"Liked\""),
			review: body ? paragraphs(body[1]) : void 0
		});
	}
	/** One page of /<user>/films/ → [[slug, {rating, liked, reviewed}]] and the next page's address. `reviewed`: the grid
	*  marks a film with a review; its text is on the film's own page (viewingPage). */
	function filmsPage(page) {
		const films = [];
		for (const li of page.split(/<li class="griditem/).slice(1)) {
			const slug = /data-item-slug="([\w-]+)"/.exec(li);
			if (!slug) continue;
			const rated = /\brated-(\d+)\b/.exec(li);
			films.push([slug[1], own({
				rating: rated ? Number(rated[1]) / 2 : void 0,
				liked: li.includes("icon-liked"),
				reviewed: li.includes("review-micro")
			})]);
		}
		return [films, nextPage(page)];
	}
	const EXPORT_FILES = [
		"watched.csv",
		"ratings.csv",
		"diary.csv",
		"reviews.csv",
		"likes/films.csv"
	];
	const rowsOf = (text) => atlas.csv.parse(text.replace(/^﻿/, ""), { header: true });
	/** {file name: rows} of an export's zip, or of the folder it unpacks to (vault-relative). */
	async function exportRows(path) {
		const out = {};
		if (/\.zip$/i.test(path)) {
			let entries;
			try {
				entries = atlas.zip.list(path);
			} catch {
				return out;
			}
			for (const { name: member } of entries) {
				const name = EXPORT_FILES.find((n) => member === n || member.endsWith(`/${n}`));
				if (name && !(name in out)) out[name] = rowsOf(atlas.zip.read(path, member));
			}
			return out;
		}
		for (const name of EXPORT_FILES) try {
			out[name] = rowsOf(await atlas.read(`${path.replace(/\/+$/, "")}/${name}`));
		} catch {}
		return out;
	}
	/** A Letterboxd export → {short link: own fields} one per film: its newest diary date, its rating, its like, its newest
	*  review. Films are matched across the files by name and year: each file's "Letterboxd URI" is a short link (boxd.it)
	*  to the film or to one diary entry, and either leads to the film's page. */
	async function readExport(path) {
		const rows = await exportRows(path);
		if (!Object.keys(rows).length) throw new Error(`no Letterboxd export in ${path} (watched.csv, diary.csv… or the zip that holds them)`);
		const films = /* @__PURE__ */ new Map();
		const film = (r) => {
			const key = JSON.stringify([r.Name ?? "", r.Year ?? ""]);
			if (!films.has(key)) films.set(key, {
				uri: r["Letterboxd URI"],
				own: {},
				seen: ""
			});
			return films.get(key);
		};
		for (const r of rows["watched.csv"] ?? []) film(r);
		for (const r of rows["likes/films.csv"] ?? []) film(r).own.liked = true;
		for (const name of ["diary.csv", "reviews.csv"]) for (const r of rows[name] ?? []) {
			const f = film(r), day = r["Watched Date"] || r.Date || "";
			if (r["Watched Date"] && day > (f.own.watched ?? "")) f.own.watched = day;
			if (r.Rating && day >= f.seen) {
				f.own.rating = Number(r.Rating);
				f.seen = day;
			}
			const text = unescape((r.Review || "").replace(/<[^>]+>/g, "")).trim();
			if (text && day >= (f.own._reviewed ?? "")) {
				f.own.review = text;
				f.own._reviewed = day;
			}
		}
		for (const r of rows["ratings.csv"] ?? []) if (r.Rating) film(r).own.rating = Number(r.Rating);
		const out = {};
		for (const f of films.values()) if (f.uri) out[f.uri] = Object.fromEntries(Object.entries(f.own).filter(([k]) => !k.startsWith("_")));
		return out;
	}
	/** The vault's Letterboxd exports, by shape: a zip named like Letterboxd's (`letterboxd-<user>-<date>….zip`) or a folder
	*  holding watched.csv and diary.csv; newest first by the date in Letterboxd's name, folders after. */
	function findExports(files) {
		const shown = files.filter((f) => !f.split("/").some((part) => part.startsWith(".")));
		const exports = [...new Set(shown.filter((f) => f.endsWith("/watched.csv") || f === "watched.csv").map((f) => f.slice(0, -11).replace(/\/$/, "") || "."))].filter((d) => shown.includes(d === "." ? "diary.csv" : `${d}/diary.csv`));
		const zips = shown.filter((f) => {
			const b = f.split("/").pop().toLowerCase();
			return b.startsWith("letterboxd") && b.endsWith(".zip");
		});
		const base = (f) => f.split("/").pop();
		return [...zips.sort((a, b) => base(b).localeCompare(base(a))), ...exports.sort()];
	}
	/** Keeps the export's films in the sync's state; each sync then files PER_RUN of them, like the rest. */
	async function importExportWith(path, load, save) {
		const films = await readExport(path);
		const state = await load() ?? {};
		state.export = {
			...state.export ?? {},
			...films
		};
		await save(state);
		const n = Object.keys(state.export).length, read = Object.keys(films).length;
		return {
			summary: `${read} films read from the export; ${n} to file, ${PER_RUN} each sync (every hour)`,
			films: read
		};
	}
	const why = (e) => e instanceof Error ? e.message : String(e);
	/** Files the user's watched films: the diary feed first (dates, likes, reviews), then the reviews pages, then the films
	*  list page by page; a film the lists give without its date or review gets them from its own page, and so does a film
	*  filed before that the lists no longer reach. Remembers what it filed (`done`: slug → what was sent) so a run only
	*  sends what is new or changed, PER_RUN at most. A page Letterboxd refuses (its bot check answers 403 to programs on
	*  most paged lists) ends that list for this run, said in the summary — never the sync. */
	async function syncWith(io, params) {
		const settings = params.settings ?? {};
		const user = String(settings.username ?? "").trim().replace(/^\/+|\/+$/g, "");
		if (!user) return {
			summary: "no Letterboxd username set (Settings → Catalog · Letterboxd)",
			filed: 0
		};
		const shelf = settings.watched || "[[watched]]";
		const clock = io.clock ?? (() => Date.now());
		const known = io.known ?? (async () => []);
		const resolve = io.resolve ?? (async () => null);
		const state = await io.load() ?? {};
		const done = state.done ??= {};
		const started = clock(), refused = [], failed = [];
		const fetch = async (address) => {
			try {
				return await io.get(address.startsWith("http") ? address : `${SITE}${address}`) ?? "";
			} catch (e) {
				refused.push(`${address} (${why(e)})`);
				return null;
			}
		};
		const entries = diary(await fetch(`/${user}/rss/`) || "");
		const queue = Object.entries(entries);
		const seen = new Set(Object.keys(entries));
		let filmsAt = `/${user}/films/`, reviewsAt = `/${user}/reviews/`;
		let filed = 0, backlogRead = false;
		const exported = state.export ??= {};
		const pending = Object.keys(exported);
		while (filed < PER_RUN && clock() - started < RUN_MS) {
			if (!queue.length && pending.length) {
				const uri = pending.shift();
				let slug;
				try {
					slug = await resolve(uri);
				} catch (e) {
					refused.push(`${uri} (${why(e)})`);
					continue;
				}
				if (slug === null) {
					failed.push(`${uri}: not a Letterboxd film`);
					delete exported[uri];
					continue;
				}
				seen.add(slug);
				queue.push([slug, {
					...exported[uri],
					export: uri
				}]);
				continue;
			}
			if (!queue.length && reviewsAt) {
				let items;
				[items, reviewsAt] = reviewsPage(await fetch(reviewsAt) || "");
				const fresh = items.filter(([s]) => !seen.has(s));
				items.forEach(([s]) => seen.add(s));
				if (!params.all && items.length && items.every(([s]) => done[s]?.reviewed)) reviewsAt = null;
				queue.push(...fresh);
				continue;
			}
			if (!queue.length && !filmsAt && !backlogRead) {
				backlogRead = true;
				let vault = [];
				try {
					vault = (await known()).filter((s) => !(s in done));
				} catch (e) {
					failed.push(`the vault's film notes: ${why(e)}`);
				}
				queue.push(...Object.entries(done).filter(([s, was]) => !seen.has(s) && !was.looked).map(([s]) => [s, {}]));
				queue.push(...[...new Set(vault)].filter((s) => !seen.has(s)).map((s) => [s, { vault: true }]));
				continue;
			}
			if (!queue.length) {
				if (!filmsAt) break;
				let films;
				[films, filmsAt] = filmsPage(await fetch(filmsAt) || "");
				const fresh = films.filter(([s]) => !seen.has(s));
				films.forEach(([s]) => seen.add(s));
				if (!params.all && fresh.length && fresh.every(([s, o]) => same(done[s], {
					...done[s] ?? {},
					...o
				}))) filmsAt = null;
				queue.push(...fresh);
				continue;
			}
			const [slug, listed] = queue.shift();
			let mine = { ...listed };
			const take = (k) => {
				const v = mine[k];
				delete mine[k];
				return v;
			};
			const fromExport = take("export");
			const was = done[slug] ?? {};
			const vaultOnly = Boolean(take("vault"));
			const more = take("more");
			const wantsReview = Boolean(take("reviewed")) && !mine.review && !was.reviewed;
			if (more && mine.review) {
				const whole = paragraphs(await fetch(more) || "") || viewingPage(await fetch(`/${user}/film/${slug}/`) || "").review;
				mine.review = whole || `${mine.review} …`;
			} else if (wantsReview || !(mine.watched || was.looked)) {
				const page = await fetch(`/${user}/film/${slug}/`);
				if (page !== null) mine = {
					...viewingPage(page),
					...mine,
					looked: true
				};
			}
			if (vaultOnly && !Object.keys(mine).some((k) => k !== "looked")) {
				if (mine.looked) done[slug] = { looked: true };
				continue;
			}
			if (!vaultOnly) mine = {
				...mine,
				status: shelf
			};
			if (fromExport) mine.looked = true;
			const sent = Object.fromEntries(Object.entries(mine).filter(([k]) => k !== "review"));
			if (mine.review || was.reviewed) sent.reviewed = true;
			if (same(was, {
				...was,
				...sent
			})) {
				if (fromExport) delete exported[fromExport];
				continue;
			}
			try {
				await io.add({
					text: `${SITE}/film/${slug}/`,
					kind: "movie",
					own: Object.fromEntries(Object.entries(mine).filter(([k]) => k !== "looked"))
				});
				done[slug] = {
					...was,
					...sent
				};
				if (fromExport) delete exported[fromExport];
				filed++;
			} catch (e) {
				failed.push(`${slug}: ${why(e)}`);
			}
		}
		await io.save(state);
		const left = queue.length + Object.keys(exported).length + (filmsAt || reviewsAt || !backlogRead ? 1 : 0);
		return {
			summary: `${filed} film${filed === 1 ? "" : "s"} filed from ${user}'s Letterboxd${left ? ", more next run" : ""}` + (failed.length ? `; ${failed.length} failed (${failed[0]})` : "") + (refused.length ? `; Letterboxd refused ${refused.length} page${refused.length === 1 ? "" : "s"} to programs (${refused[0]})` : ""),
			filed,
			failed,
			refused
		};
	}
	const coreGet = (url) => atlas.fetch(url, {
		timeout: 20,
		missing: [404]
	});
	atlas.methods({
		lookup: (params) => lookupWith(coreGet, params),
		sync: (params) => syncWith({
			get: coreGet,
			add: (body) => atlas.post("/api/plugins/@catalog/tools/add", body),
			load: async () => {
				try {
					return JSON.parse(await atlas.read(STATE));
				} catch {
					return {};
				}
			},
			save: (s) => atlas.write(STATE, JSON.stringify(s, null, 1)),
			known: async () => ((await atlas.search("^letterboxd: [\\w-]+\\s*$", { regex: true })).lines ?? []).map((l) => /letterboxd: ([\w-]+)/.exec((l.text ?? "").trim())?.[1]).filter((s) => !!s),
			resolve: async (uri) => /letterboxd\.com\/(?:[\w-]+\/)?film\/([\w-]+)/.exec((await atlas.fetchResponse({
				url: uri,
				timeout_secs: 20
			})).url ?? "")?.[1] ?? null
		}, params),
		exports: async () => ({ exports: findExports(await atlas.files()) }),
		import_export: async (params) => {
			const path = String(params.path ?? "").trim();
			if (!path) throw new Error("the export's path: the zip from letterboxd.com → Settings → Data → Export, put in the vault");
			return importExportWith(path, async () => {
				try {
					return JSON.parse(await atlas.read(STATE));
				} catch {
					return {};
				}
			}, (s) => atlas.write(STATE, JSON.stringify(s, null, 1)));
		}
	});
	//#endregion
	exports.diary = diary;
	exports.filmFromPage = filmFromPage;
	exports.filmsPage = filmsPage;
	exports.findExports = findExports;
	exports.importExportWith = importExportWith;
	exports.lookupWith = lookupWith;
	exports.pageAddress = pageAddress;
	exports.readExport = readExport;
	exports.reviewsPage = reviewsPage;
	exports.syncWith = syncWith;
	exports.viewingPage = viewingPage;
	return exports;
})({});
