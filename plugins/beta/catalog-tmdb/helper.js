// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/catalog-tmdb/helper/helper.ts
	const API = "https://api.themoviedb.org/3";
	const IMG = "https://image.tmdb.org/t/p/w500";
	const SITE = "https://www.themoviedb.org";
	const yearOf = (date) => typeof date === "string" && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : void 0;
	const present = (f) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== void 0 && v !== null && v !== "" && !(Array.isArray(v) && !v.length)));
	const own = (kind) => kind === "show" ? "tv" : "movie";
	const kindOf = (params) => params.kind === "show" ? "show" : "movie";
	const lang = (params) => String(params.settings?.language || "en-US");
	const wanted = (params) => (params.languages ?? []).map((x) => String(x).toLowerCase());
	/** 'Dune 2021' → ['Dune', 2021]; a year alone is a title ('1917'). */
	function splitYear(text) {
		const m = /^(.*\S)\s*\(?((?:19|20)\d{2})\)?$/.exec(text.trim());
		return m ? [m[1], Number(m[2])] : [text.trim(), void 0];
	}
	/** Which TMDB page an id names: ["movie" | "tv", number]. Bare for the kind's own; a series listed as a film
	*  (Letterboxd's miniseries) is `tv/<number>`. */
	function entry(ids, kind) {
		const id = String(ids.tmdb ?? "");
		const cut = id.lastIndexOf("/");
		const path = id.slice(0, Math.max(cut, 0)), number = id.slice(cut + 1);
		return [path === "movie" || path === "tv" ? path : own(kind), number];
	}
	/** `entry` the other way: the id as the note keeps it. */
	const ref = (path, number, kind) => path === own(kind) ? number : `${path}/${number}`;
	/** 166 → '2h 46m': how a person says it (the catalog's `duration`). */
	function runtime(minutes) {
		if (!minutes) return void 0;
		return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
	}
	function oneOrList(names) {
		return names.length === 1 ? names[0] : names.length ? names : void 0;
	}
	const label = (name, y, kind) => `${name} (${y ?? "?"})${kind === "show" ? " · series" : ""}`;
	async function searchWith(get, params) {
		const text = String(params.text ?? "").trim();
		if (!text || /^https?:\/\//.test(text)) return { candidates: [] };
		const [title, year] = splitYear(text);
		const r = await get(`${API}/search/multi?include_adult=false&language=${lang(params)}&query=${atlas.url.quote(title)}`) ?? {};
		const out = [];
		for (const x of r.results ?? []) {
			const kind = x.media_type === "movie" ? "movie" : x.media_type === "tv" ? "show" : void 0;
			if (!kind) continue;
			const y = yearOf(x.release_date || x.first_air_date);
			if (year && y && Math.abs(y - year) > 1) continue;
			out.push({
				kind,
				ids: { tmdb: String(x.id) },
				label: label(x.title || x.name, y, kind),
				cover: x.poster_path ? IMG + x.poster_path : null
			});
		}
		return { candidates: out.slice(0, 8) };
	}
	/** An id → the film's or series' fields in the catalog's words. A film whose original language the vault keeps
	*  (`languages`) is asked again in that language, so its synopsis and genres read as the film does. */
	async function detailsWith(get, params) {
		const ids = params.ids ?? {};
		let kind = kindOf(params);
		let [path, tmdb] = entry(ids, kind);
		if (!tmdb && ids.imdb) {
			const found = await get(`${API}/find/${ids.imdb}?external_source=imdb_id`) ?? {};
			const film = found.movie_results?.[0], series = found.tv_results?.[0];
			if (film || series) [tmdb, kind] = [String((film ?? series).id), film ? "movie" : "show"];
			path = own(kind);
		}
		if (!tmdb) return {
			fields: {},
			skipped: "no TMDB or IMDb id TMDB knows"
		};
		const d = await get(`${API}/${path}/${tmdb}?language=${lang(params)}&append_to_response=credits,external_ids`);
		if (!d) return {
			fields: {},
			skipped: `TMDB has no ${path} ${tmdb}`
		};
		const original = d.original_language;
		if (original && wanted(params).includes(original) && !lang(params).toLowerCase().startsWith(original)) {
			const local = await get(`${API}/${path}/${tmdb}?language=${original}`) ?? {};
			for (const k of ["overview", "genres"]) if (local[k]?.length) d[k] = local[k];
		}
		const crew = d.credits?.crew ?? [];
		const fields = {
			title: d.title || d.name,
			original_title: d.original_title || d.original_name,
			year: yearOf(d.release_date || d.first_air_date),
			description: d.overview || void 0,
			genres: (d.genres ?? []).map((g) => g.name),
			cast: (d.credits?.cast ?? []).slice(0, 6).map((c) => c.name),
			cover: d.poster_path ? IMG + d.poster_path : void 0,
			duration: runtime(d.runtime),
			language: original
		};
		if (kind === "show") Object.assign(fields, {
			creator: oneOrList((d.created_by ?? []).map((c) => c.name)),
			seasons: d.number_of_seasons
		});
		else fields.director = oneOrList(crew.filter((c) => c.job === "Director").map((c) => c.name));
		if (fields.original_title === fields.title) fields.original_title = void 0;
		const outIds = { tmdb: ref(path, tmdb, kind) };
		for (const [k, src] of [["imdb", "imdb_id"], ["tvdb", "tvdb_id"]]) if (d.external_ids?.[src]) outIds[k] = String(d.external_ids[src]);
		return {
			kind,
			ids: outIds,
			fields: present(fields)
		};
	}
	const LANGS = {
		English: "en",
		Spanish: "es",
		French: "fr",
		German: "de",
		Italian: "it",
		Portuguese: "pt",
		Japanese: "ja",
		Korean: "ko",
		Chinese: "zh",
		Mandarin: "zh",
		Cantonese: "cn",
		Russian: "ru",
		Swedish: "sv",
		Danish: "da",
		Norwegian: "no",
		Dutch: "nl",
		Polish: "pl",
		Turkish: "tr",
		Persian: "fa",
		Hindi: "hi",
		Catalan: "ca",
		Basque: "eu",
		Galician: "gl",
		Arabic: "ar",
		Greek: "el",
		Hebrew: "he",
		Czech: "cs",
		Hungarian: "hu",
		Romanian: "ro",
		Finnish: "fi",
		Thai: "th",
		Icelandic: "is",
		Irish: "ga",
		Ukrainian: "uk"
	};
	const un = (s) => s ? atlas.html.unescape(s) : "";
	/** The page's schema.org Movie or TVSeries (its JSON-LD, CDATA comments and all). */
	function ld(page) {
		for (const m of page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) try {
			const o = JSON.parse(m[1].replace(/\/\*[\s\S]*?\*\//g, ""));
			if (o && (o["@type"] === "Movie" || o["@type"] === "TVSeries")) return o;
		} catch {}
		return null;
	}
	function isoMinutes(d) {
		const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(String(d ?? ""));
		return m && (m[1] || m[2]) ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : void 0;
	}
	function fact(page, name) {
		const m = new RegExp(`<strong>(?:<bdi>)?${name}(?:</bdi>)?</strong>\\s*([^<]+)`).exec(page);
		return m ? un(m[1]).trim() : void 0;
	}
	/** A themoviedb.org film or series page (in some language) → the catalog's fields. */
	function pageFields(page, kind) {
		const o = ld(page);
		if (!o) return null;
		const crew = [...page.matchAll(/<li class="profile">\s*<p><a [^>]*>([^<]+)<\/a><\/p>\s*<p class="character">([^<]+)<\/p>/g)].map((m) => [un(m[1]).trim(), m[2]]);
		const at = page.indexOf("people scroller");
		const cast = [...(at >= 0 ? page.slice(at) : "").matchAll(/<p><a href="\/person\/[^"]*">([^<]+)<\/a><\/p>\s*<p class="character">/g)].slice(0, 6).map((m) => un(m[1]).trim());
		const date = o.releasedEvent?.[0]?.startDate || o.startDate || "";
		const role = kind === "show" ? "Creator" : "Director";
		const fields = {
			title: un(o.name) || void 0,
			original_title: fact(page, "Original Title") || fact(page, "Original Name"),
			year: yearOf(date),
			description: un(o.description) || void 0,
			genres: (o.genre ?? []).filter((g) => typeof g === "string"),
			cast,
			cover: o.image,
			duration: runtime(isoMinutes(o.duration)),
			language: LANGS[fact(page, "Original Language") ?? ""],
			[kind === "show" ? "creator" : "director"]: oneOrList(crew.filter(([, roles]) => roles.split(",").map((r) => r.trim()).includes(role)).map(([n]) => n))
		};
		if (kind === "show" && o.numberOfSeasons) fields.seasons = o.numberOfSeasons;
		if (fields.original_title === fields.title) fields.original_title = void 0;
		return present(fields);
	}
	/** `details` without a token: the film's or series' page. A film whose original language the vault keeps (`languages`)
	*  has its synopsis and genres read again from the page in that language. */
	async function siteDetailsWith(getText, params) {
		const kind = kindOf(params);
		const [path, tmdb] = entry(params.ids ?? {}, kind);
		if (!tmdb) return {
			fields: {},
			skipped: "no TMDB id (an IMDb id goes through Letterboxd without a TMDB token)"
		};
		const page = await getText(`${SITE}/${path}/${tmdb}?language=${lang(params)}`);
		const fields = page ? pageFields(page, kind) : null;
		if (!fields) return {
			fields: {},
			skipped: `themoviedb.org has no ${path} ${tmdb}`
		};
		const original = fields.language;
		if (original && wanted(params).includes(original) && !lang(params).toLowerCase().startsWith(original)) {
			const local = pageFields(await getText(`${SITE}/${path}/${tmdb}?language=${original}`) ?? "", kind) ?? {};
			for (const k of ["description", "genres"]) if (local[k]) fields[k] = local[k];
		}
		return {
			kind,
			ids: { tmdb: ref(path, tmdb, kind) },
			fields
		};
	}
	/** themoviedb.org's search results → [id, title, year]. */
	function searchPage(page, kind) {
		const path = own(kind);
		return page.split("comp:media-card").slice(1).flatMap((card) => {
			const m = new RegExp(`href="/${path}/(\\d+)[^"]*"[^>]*>\\s*<h2[^>]*>\\s*<span>([^<]+)</span>`).exec(card);
			if (!m) return [];
			const date = /class="release_date[^"]*">\s*([^<]+)/.exec(card);
			const y = date ? /\b(1[89]\d\d|20\d\d)\b/.exec(date[1]) : null;
			return [[
				m[1],
				un(m[2]).trim(),
				y ? Number(y[1]) : void 0
			]];
		});
	}
	/** `search` without a token: the site's film and series results for the words (a year narrows them). */
	async function siteSearchWith(getText, params) {
		const text = String(params.text ?? "").trim();
		if (!text || /^https?:\/\//.test(text)) return { candidates: [] };
		const [title, year] = splitYear(text);
		const out = [];
		for (const kind of ["movie", "show"]) {
			const page = await getText(`${SITE}/search/${own(kind)}?query=${atlas.url.quote(title)}&language=${lang(params)}`) ?? "";
			for (const [tmdb, name, y] of searchPage(page, kind).slice(0, 6)) {
				if (year && y && Math.abs(y - year) > 1) continue;
				out.push({
					kind,
					ids: { tmdb },
					label: label(name, y, kind)
				});
			}
		}
		return { candidates: out.slice(0, 8) };
	}
	/** TMDB's API with the token the core fills in; 404 is "no such id". */
	const apiGet = async (url) => {
		const res = await atlas.fetchResponse({
			url,
			headers: {
				Authorization: {
					secret: "token",
					prefix: "Bearer "
				},
				Accept: "application/json"
			},
			timeout_secs: 20
		});
		if (res.status === 404) return null;
		if (res.status === 401) throw new atlas.AtlasError("TMDB refused the token: set the API Read Access Token in Settings → Catalog · TMDB", 401);
		if (!res.ok) throw new atlas.AtlasError(`TMDB answered ${res.status}`, res.status);
		return JSON.parse(res.text || "{}");
	};
	const siteText = (url) => atlas.fetch(url);
	const hasToken = async () => {
		try {
			return Boolean(await atlas.secret("token"));
		} catch {
			return false;
		}
	};
	atlas.methods({
		search: async (params) => await hasToken() ? searchWith(apiGet, params) : siteSearchWith(siteText, params),
		details: async (params) => await hasToken() ? detailsWith(apiGet, params) : siteDetailsWith(siteText, params)
	});
	//#endregion
	exports.detailsWith = detailsWith;
	exports.pageFields = pageFields;
	exports.runtime = runtime;
	exports.searchPage = searchPage;
	exports.searchWith = searchWith;
	exports.siteDetailsWith = siteDetailsWith;
	exports.siteSearchWith = siteSearchWith;
	exports.splitYear = splitYear;
	return exports;
})({});
