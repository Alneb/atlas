// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/catalog-open/helper/anime.ts
	const ANILIST = "https://graphql.anilist.co";
	const MANGADEX = "https://api.mangadex.org";
	const QUERY = `query ($id: Int, $mal: Int, $type: MediaType) {
  Media(id: $id, idMal: $mal, type: $type) {
    id idMal siteUrl status chapters volumes episodes genres description(asHtml: false)
    title { romaji english native } startDate { year } coverImage { extraLarge large }
    staff(perPage: 6, sort: RELEVANCE) { edges { role node { name { full } } } }
    studios(isMain: true) { nodes { name } }
  }
}`;
	const STATUS = {
		FINISHED: "finished",
		RELEASING: "ongoing",
		NOT_YET_RELEASED: "not yet out",
		CANCELLED: "cancelled",
		HIATUS: "on hiatus"
	};
	const HEADERS = {
		"Content-Type": "application/json",
		"User-Agent": "Atlas/0.1 (personal notes app; catalog-open)"
	};
	/** AniList's description without its markup (`<br>`, `<i>`, "(Source: …)"). */
	function plain(text) {
		return (text ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim().replace(/\n*\(Source:[^)]*\)\s*$/, "").replace(/\n{3,}/g, "\n\n").trim() || void 0;
	}
	/** One name as text, several as a list, none as nothing. */
	function oneOrList$1(names) {
		const all = [...new Set(names.filter((n) => !!n))];
		return all.length === 1 ? all[0] : all.length ? all : void 0;
	}
	function fieldsOf$1(kind, m) {
		const title = m.title ?? {};
		const authors = (m.staff?.edges ?? []).filter((e) => /story|art|original/i.test(e.role ?? "")).map((e) => e.node.name.full);
		const f = {
			title: title.english || title.romaji,
			original_title: title.native,
			language: title.native ? "ja" : void 0,
			year: m.startDate?.year,
			publication: STATUS[m.status ?? ""],
			genres: (m.genres ?? []).slice(0, 5),
			description: plain(m.description),
			cover: m.coverImage?.extraLarge || m.coverImage?.large
		};
		if (kind === "manga") Object.assign(f, {
			author: oneOrList$1(authors),
			chapters: m.chapters,
			volumes: m.volumes
		});
		else Object.assign(f, {
			studio: oneOrList$1((m.studios?.nodes ?? []).map((n) => n.name)),
			episodes: m.episodes
		});
		if (f.original_title === f.title) f.original_title = void 0;
		return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== void 0 && v !== null && v !== "" && !(Array.isArray(v) && !v.length)));
	}
	async function lookup$4(params) {
		const kind = String(params.kind || "manga");
		const ids = { ...params.ids ?? {} };
		if (ids.mangadex && !ids.anilist && !ids.myanimelist) {
			const links = (await atlas.fetchJson(`${MANGADEX}/manga/${ids.mangadex}`, { headers: HEADERS }))?.data?.attributes?.links ?? {};
			if (links.al) ids.anilist = links.al;
			if (links.mal) ids.myanimelist = links.mal;
		}
		const variables = { type: kind === "manga" ? "MANGA" : "ANIME" };
		if (ids.anilist) variables.id = parseInt(ids.anilist, 10);
		else if (ids.myanimelist) variables.mal = parseInt(ids.myanimelist, 10);
		else return {
			fields: {},
			skipped: "no AniList or MyAnimeList id (MangaDex names none for this title)"
		};
		const m = (await atlas.fetchJson(ANILIST, {
			method: "POST",
			headers: HEADERS,
			body: {
				query: QUERY,
				variables
			}
		}))?.data?.Media;
		if (!m) return {
			fields: {},
			skipped: "AniList does not know it"
		};
		const outIds = { anilist: String(m.id) };
		if (m.idMal) outIds.myanimelist = String(m.idMal);
		return {
			ids: outIds,
			fields: fieldsOf$1(kind, m)
		};
	}
	//#endregion
	//#region plugins/beta/catalog-open/helper/books.ts
	const OL = "https://openlibrary.org";
	/** '1965', 'August 1990', 'Jun 01, 1990' → the year. */
	function yearOf$1(text) {
		const m = /\b(1[5-9]\d\d|20\d\d)\b/.exec(String(text ?? ""));
		return m ? Number(m[1]) : void 0;
	}
	/** Open Library's descriptions are a string or `{type, value}`. */
	function textOf(v) {
		const s = v && typeof v === "object" ? v.value : v;
		return typeof s === "string" && s.trim() ? s.trim() : void 0;
	}
	function oneOrList(names) {
		const all = names.filter((n) => !!n);
		return all.length === 1 ? all[0] : all.length ? all : void 0;
	}
	const BOOKKEEPING = /* @__PURE__ */ new Set([
		"accessible book",
		"protected daisy",
		"in library",
		"large type books",
		"fiction"
	]);
	/** A few readable subjects as genres: not Open Library's bookkeeping ("Accessible book", "nyt:…", "Fiction, general"). */
	function genres$1(subjects) {
		const out = [];
		for (const s of subjects ?? []) {
			if (typeof s !== "string" || s.includes(":") || s.includes(",") || BOOKKEEPING.has(s.toLowerCase())) continue;
			const t = atlas.text.title(s.trim());
			if (!out.includes(t)) out.push(t);
		}
		return out.length ? out.slice(0, 5) : void 0;
	}
	const SCIENCE = new RegExp(String.raw`\b(physics|mathematic|algebra|calculus|geometry|topology|analysis \(mathematics\)|chemistry|biology|biochemistry|neuroscience|` + String.raw`astronomy|astrophysics|cosmology|quantum|relativity|statistic|probability|computer science|programming|` + String.raw`engineering|thermodynamics|mechanics|electromagnet|optics|textbooks?|sciences?)\b`, "i");
	/** Subjects that say physics, mathematics, a science or a textbook — and none that say fiction ("Science fiction",
	*  "Fiction, science fiction") — make a science book. */
	function isScience(subjects) {
		const all = (subjects ?? []).filter((s) => typeof s === "string");
		if (all.some((s) => /\bfiction\b/i.test(s) && !/non-?fiction/i.test(s))) return false;
		return all.some((s) => SCIENCE.test(s));
	}
	const get$1 = (url) => atlas.fetchJson(url);
	const nameOf = async (key) => key ? (await get$1(`${OL}${key}.json`))?.name : void 0;
	async function lookup$3(params) {
		const ids = params.ids ?? {};
		const isbn = ids.isbn;
		let workId = ids.openlibrary;
		let edition = null;
		if (isbn) edition = await get$1(`${OL}/isbn/${isbn}.json`);
		else if (ids.ol_edition) edition = await get$1(`${OL}/books/${ids.ol_edition}.json`);
		if (edition && !workId) workId = (edition.works?.[0]?.key ?? "").split("/").pop() || void 0;
		if (!workId && !edition) return ids.goodreads && !isbn ? { later: true } : {
			fields: {},
			skipped: "Open Library does not know this book"
		};
		const work = (workId ? await get$1(`${OL}/works/${workId}.json`) : null) ?? {};
		let authors = await Promise.all((work.authors ?? []).slice(0, 4).map((a) => nameOf(a.author?.key)));
		if (!authors.some(Boolean) && edition) authors = await Promise.all((edition.authors ?? []).slice(0, 4).filter((a) => a.key).map((a) => nameOf(a.key)));
		const ed = edition ?? {};
		const cover = (ed.covers ?? work.covers ?? []).find((c) => Number.isInteger(c) && c > 0);
		const fields = {
			title: work.title || ed.title,
			author: oneOrList(authors),
			year: yearOf$1(work.first_publish_date) ?? yearOf$1(ed.publish_date),
			pages: ed.number_of_pages,
			publisher: ed.publishers?.[0],
			genres: genres$1(work.subjects),
			description: textOf(work.description) ?? textOf(ed.description),
			cover: cover !== void 0 ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : void 0
		};
		const outIds = {};
		if (workId) outIds.openlibrary = workId;
		const isbns = [...ed.isbn_13 ?? [], ...ed.isbn_10 ?? []];
		if (isbns.length && !isbn) outIds.isbn = isbns[0];
		const out = {
			ids: outIds,
			fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== void 0 && v !== null && v !== ""))
		};
		if (isScience(work.subjects)) out.kind = "science_book";
		else if (params.kind === "science_book") out.kind = "book";
		return out;
	}
	//#endregion
	//#region plugins/beta/catalog-open/helper/music.ts
	const API = "https://musicbrainz.org/ws/2";
	const COVERS = "https://coverartarchive.org";
	const SURE = 90;
	const ENTITY = {
		album: "release-group",
		song: "recording",
		artist: "artist"
	};
	const INC = {
		album: "artist-credits+genres+releases+media",
		song: "artist-credits+genres+releases+release-groups",
		artist: "genres"
	};
	const FIELD = {
		album: "releasegroup",
		song: "recording",
		artist: "artist"
	};
	const get = (url) => atlas.fetchJson(url, {
		headers: { "User-Agent": "Atlas/0.1 (personal notes app; catalog-open)" },
		every: 1,
		missing: [400, 404]
	});
	/** MusicBrainz's artist credit → one name, or several as a list. */
	function artists(credit) {
		const names = (credit ?? []).map((c) => c.name || c.artist?.name).filter((n) => !!n);
		return names.length === 1 ? names[0] : names.length ? names : void 0;
	}
	const yearOf = (date) => typeof date === "string" && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : void 0;
	function genres(e) {
		const gs = [...e.genres ?? []].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
		return gs.length ? gs.slice(0, 5).map((g) => atlas.text.title(g.name)) : void 0;
	}
	function duration(length) {
		if (!length) return void 0;
		const s = Math.floor(length / 1e3);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
	}
	/** What a video or a shop calls a song → the song's name: "(Official Video Remastered)", "[Lyrics]" and the like
	*  dropped, and an "Artist - " before it. */
	function cleanTitle(title) {
		return (title ?? "").replace(/\s*[([][^)\]]*\b(official|video|audio|lyrics?|visuali[sz]er|remaster(ed)?|hd|4k|mv)\b[^)\]]*[)\]]/gi, "").replace(/^.{1,60}?\s[-–—]\s/, "").trim() || (title ?? "").trim();
	}
	/** A channel's name → the artist's: "Queen - Topic", "QueenVEVO", "Queen Official" → "Queen"; a VEVO channel glues the
	*  words together ("RickAstleyVEVO"), so they are parted again at their capitals ("Rick Astley"). */
	function cleanArtist(name) {
		const raw = String(name ?? "").trim();
		const vevo = /VEVO$/i.test(raw);
		let n = raw.replace(/\s*-\s*Topic$|VEVO$|\s+Official$|\s+Official Channel$/i, "").trim();
		if (vevo && !n.includes(" ")) n = n.replace(/(?<=[a-z])(?=[A-Z])/g, " ");
		return n || void 0;
	}
	/** A song's album: the earliest official release whose group is a studio album (not a live one or a compilation). */
	function firstAlbum(releases) {
		const studio = (r) => r["release-group"]?.["primary-type"] === "Album" && !r["release-group"]?.["secondary-types"]?.length && r.status === "Official";
		return (releases ?? []).filter(studio).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))[0]?.title;
	}
	function fieldsOf(kind, e) {
		if (kind === "album") {
			const tracks = (e.releases ?? []).find((r) => r.media?.length)?.media?.reduce((n, m) => n + (m["track-count"] ?? 0), 0);
			return {
				title: e.title,
				artist: artists(e["artist-credit"]),
				year: yearOf(e["first-release-date"]),
				genres: genres(e),
				tracks: tracks || void 0,
				cover: `${COVERS}/release-group/${e.id}/front-500`
			};
		}
		if (kind === "song") return {
			title: e.title,
			artist: artists(e["artist-credit"]),
			album: firstAlbum(e.releases),
			year: yearOf(e["first-release-date"]),
			duration: duration(e.length),
			genres: genres(e)
		};
		return {
			title: e.name,
			genres: genres(e),
			country: e.country,
			description: e.disambiguation || void 0
		};
	}
	/** The entity MusicBrainz has linked to this address (a Spotify album, a Bandcamp page), if any. */
	async function byLink(kind, url) {
		if (!url || url.includes("musicbrainz.org")) return void 0;
		const r = await get(`${API}/url?resource=${atlas.url.quote(url, "")}&inc=release-group-rels+release-rels+recording-rels+artist-rels&fmt=json`) ?? {};
		const want = ENTITY[kind];
		for (const rel of r.relations ?? []) {
			if (rel[want]) return rel[want].id;
			if (kind === "album" && rel.release) {
				const rg = (await get(`${API}/release/${rel.release.id}?inc=release-groups&fmt=json`))?.["release-group"];
				if (rg) return rg.id;
			}
		}
	}
	/** The best hit for the artist and title a page gave; only a sure one (score ≥ SURE). */
	async function bySearch(kind, hints) {
		const title = cleanTitle(String(hints.title ?? ""));
		const artist = cleanArtist(typeof hints.artist === "string" ? hints.artist : hints.artist?.[0]) ?? cleanArtist(hints.channel);
		if (!title || kind === "song" && !artist) return void 0;
		const q = `${FIELD[kind]}:"${title}"` + (artist && kind !== "artist" ? ` AND artist:"${artist}"` : "");
		let sure = ((await get(`${API}/${ENTITY[kind]}?query=${atlas.url.quote(q)}&limit=50&fmt=json`) ?? {})[`${ENTITY[kind]}s`] ?? []).filter((h) => Number(h.score ?? 0) >= SURE);
		if (kind === "song") {
			const exact = sure.filter((h) => (h.title ?? "").toLowerCase() === title.toLowerCase() && !h.disambiguation);
			sure = (exact.length ? exact : sure).sort((a, b) => (a["first-release-date"] || "9999").localeCompare(b["first-release-date"] || "9999"));
		}
		return sure[0]?.id;
	}
	async function lookup$2(params) {
		const kind = String(params.kind || "album");
		if (!(kind in ENTITY)) return {
			fields: {},
			skipped: `MusicBrainz has no ${kind}s`
		};
		const k = kind;
		const ids = params.ids ?? {}, hints = params.hints ?? {};
		let mbid = ids.musicbrainz;
		if (!mbid && ids.mb_release && k === "album") mbid = (await get(`${API}/release/${ids.mb_release}?inc=release-groups&fmt=json`))?.["release-group"]?.id;
		mbid = mbid || await byLink(k, params.url) || await bySearch(k, hints);
		if (!mbid) return hints.title ? {
			fields: {},
			skipped: "MusicBrainz has no sure match"
		} : { later: true };
		const e = await get(`${API}/${ENTITY[k]}/${mbid}?inc=${INC[k]}&fmt=json`);
		if (!e) return {
			fields: {},
			skipped: `MusicBrainz has no ${ENTITY[k]} ${mbid}`
		};
		const fields = Object.fromEntries(Object.entries(fieldsOf(k, e)).filter(([, v]) => v !== void 0 && v !== null && v !== ""));
		return {
			ids: { musicbrainz: mbid },
			fields
		};
	}
	//#endregion
	//#region plugins/beta/catalog-open/helper/wikipedia.ts
	const PAGE = /https?:\/\/([a-z]{2,3}(?:-[a-z]+)?)\.(?:m\.)?wikipedia\.org\/wiki\/([^\s?#]+)/i;
	const EDGE = String.raw`(?:(?<![\p{L}\p{N}_])(?=[\p{L}\p{N}_])|(?<=[\p{L}\p{N}_])(?![\p{L}\p{N}_]))`;
	const words = (src) => new RegExp(src.replaceAll(String.raw`\b`, EDGE), "iu");
	const KINDS = [
		[words(String.raw`\b(anime|animated (tv |television )?series|original (video|net) animation|serie de anime|OVA)\b`), "anime"],
		[words(String.raw`\b(manga|manhwa|manhua|gekiga)\b`), "manga"],
		[words(String.raw`\b(television|tv|web) (series|miniseries|sitcom|drama|soap opera|program(me)?|show|anthology)|\bsoap opera\b|\bserie de (televisión|tv)|` + String.raw`\bminiserie|\bsérie télévisée|\bsitcom\b|\btelenovela\b`), "show"],
		[words(String.raw`\b(\d{4} )?(\w+ )?(films?|movies?|documentar(y|ies)|short film)\b|\bpel[ií]culas?\b|\bcortometraje\b|\bdocumental\b|\bfilm (de|réalisé)`), "movie"],
		[words(String.raw`\b(hip[- ]hop|rap|pop|rock|punk|metal|folk|dance|electronic|indie|vocal|a cappella|jazz|reggae|soul|r&b|country|techno|` + String.raw`house|eurodance|music|musical|song and dance) (group|ensemble|collective|duo|trio|troupe|act|project)\b`), "artist"],
		[words(String.raw`\b(studio |live |compilation |debut |tribute )?albums?\b|\b[áa]lbum\b|\bep by\b|\bmixtape\b`), "album"],
		[words(String.raw`\b(songs?|single)\b|\bcanci[oó]n\b|\bsencillo\b|\bchanson\b`), "song"],
		[words(String.raw`\b(novels?|novellas?|books?|memoirs?|non-fiction book|textbooks?|treatise|monograph|short stor(y|ies)|` + String.raw`anthology of)\b|\bnovelas?\b|\blibros?\b|\broman\b`), "book"],
		[words(String.raw`\b(band|musical group|musician|singer|rapper|composer|dj|boy band|girl group)\b|\bgrupo musical\b|\bbanda\b|\bcantante\b|\bgroupe\b`), "artist"]
	];
	const IDS = {
		movie: [
			[/imdb\.com\/title\/(tt\d{6,10})/i, "imdb"],
			[/letterboxd\.com\/film\/([\w-]+)/i, "letterboxd"],
			[/themoviedb\.org\/movie\/(\d+)/i, "tmdb"]
		],
		show: [[/imdb\.com\/title\/(tt\d{6,10})/i, "imdb"], [/themoviedb\.org\/tv\/(\d+)/i, "tmdb"]],
		album: [[/musicbrainz\.org\/release-group\/([0-9a-f-]{36})/i, "musicbrainz"]],
		song: [],
		artist: [[/musicbrainz\.org\/artist\/([0-9a-f-]{36})/i, "musicbrainz"]],
		book: [[/openlibrary\.org\/works\/(OL\d+W)/i, "openlibrary"]],
		manga: [[/anilist\.co\/manga\/(\d+)/i, "anilist"], [/myanimelist\.net\/manga\/(\d+)/i, "myanimelist"]],
		anime: [[/anilist\.co\/anime\/(\d+)/i, "anilist"], [/myanimelist\.net\/anime\/(\d+)/i, "myanimelist"]]
	};
	function kindOf(description) {
		return KINDS.find(([rx]) => rx.test(description ?? ""))?.[1] ?? null;
	}
	/** `%C2%A1x` → `¡x`, leaving a malformed escape as it is (as Python's unquote does). */
	function unquote(s) {
		try {
			return decodeURIComponent(s);
		} catch {
			return s;
		}
	}
	/** A page title's own disambiguation, "Apollo 11 (2019 film)" → "2019 film": Wikipedia's naming says the kind. */
	function qualifier(title) {
		return /\(([^()]+)\)$/.exec(unquote(title).replaceAll("_", " ").trim())?.[1] ?? null;
	}
	/** The page's short description and its external links (IMDb, Letterboxd, MusicBrainz…), redirects followed. */
	function queryUrl(lang, title) {
		return `https://${lang}.wikipedia.org/w/api.php?action=query&prop=description%7Cextlinks&titles=${atlas.url.quote(unquote(title), "")}&ellimit=500&redirects=1&format=json&formatversion=2`;
	}
	async function recognize(params) {
		const m = PAGE.exec(String(params.url ?? params.text ?? ""));
		if (!m) return { candidates: [] };
		const [whole, lang, title] = [
			m[0],
			m[1].toLowerCase(),
			m[2]
		];
		const contact = String(params.settings?.contact ?? "").trim();
		const agent = `Atlas/0.1 (personal notes app${contact ? `; ${contact}` : ""}) catalog-open`;
		let page = {};
		try {
			const pages = (await atlas.fetchJson(queryUrl(lang, title), {
				headers: { "User-Agent": agent },
				every: .5
			}))?.query?.pages ?? [{}];
			page = pages[0]?.missing ? {} : pages[0] ?? {};
		} catch (e) {
			if (!kindOf(qualifier(title))) throw e;
		}
		const kind = kindOf(qualifier(title)) ?? kindOf(page.description);
		if (!kind) return { candidates: [] };
		const links = (page.extlinks ?? []).map((e) => String(e.url ?? "")).join("\n");
		const ids = { url: whole };
		for (const [rx, name] of IDS[kind]) {
			const found = rx.exec(links);
			if (found && !(name in ids)) ids[name] = found[1];
		}
		return { candidates: [{
			kind,
			ids,
			label: `${page.title ?? unquote(title).replaceAll("_", " ")} — ${page.description ?? qualifier(title)}`
		}] };
	}
	//#endregion
	//#region plugins/beta/catalog-open/helper/youtube.ts
	/** The watch address with nothing else: what TubeArchivist or a music downloader is handed. */
	const cleanUrl = (vid, kind) => `https://${kind === "song" ? "music.youtube.com" : "www.youtube.com"}/watch?v=${vid}`;
	const TOPIC = " - Topic";
	function fromOembed(o, vid, kind) {
		const channel = String(o.author_name ?? "").trim();
		const fields = {
			title: o.title,
			cover: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`
		};
		if (kind === "song") fields.artist = (channel.endsWith(TOPIC) ? channel.slice(0, -8) : channel) || void 0;
		else fields.channel = channel || void 0;
		return {
			ids: {
				youtube: vid,
				url: cleanUrl(vid, kind)
			},
			fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v))
		};
	}
	async function lookup$1(params) {
		const vid = params.ids?.youtube;
		if (!vid) return {
			fields: {},
			skipped: "no YouTube id"
		};
		const kind = params.kind === "song" ? "song" : "video";
		const watch = encodeURIComponent(`https://www.youtube.com/watch?v=${vid}`);
		const o = await atlas.fetchJson(`https://www.youtube.com/oembed?format=json&url=${watch}`, {
			timeout: 15,
			missing: [
				401,
				403,
				404
			]
		});
		if (!o) return {
			ids: {
				youtube: vid,
				url: cleanUrl(vid, kind)
			},
			fields: {},
			skipped: "YouTube does not show this video (private, removed or age-restricted)"
		};
		return fromOembed(o, vid, kind);
	}
	//#endregion
	//#region plugins/beta/catalog-open/helper/helper.ts
	const SOURCES = [
		"anime",
		"books",
		"music",
		"wikipedia",
		"youtube"
	];
	/** Whether the vault uses `source`: every one while the setting is unset (or not a list). */
	function uses(params, source) {
		const list = params.settings?.sources;
		return !Array.isArray(list) || list.some((s) => String(s).trim().toLowerCase() === source);
	}
	/** A lookup that answers only while its source is used. */
	const lookup = (source, fn) => (params) => uses(params, source) ? fn(params) : Promise.resolve({
		fields: {},
		skipped: `${source} is not in Catalog · Open sources' settings`
	});
	atlas.methods({
		anime: lookup("anime", lookup$4),
		books: lookup("books", lookup$3),
		music: lookup("music", lookup$2),
		youtube: lookup("youtube", lookup$1),
		wikipedia: (params) => uses(params, "wikipedia") ? recognize(params) : Promise.resolve({ candidates: [] })
	});
	//#endregion
	exports.SOURCES = SOURCES;
	exports.uses = uses;
	return exports;
})({});
