// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/catalog-wikipedia/helper/helper.ts
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
		const agent = `Atlas/0.1 (personal notes app${contact ? `; ${contact}` : ""}) catalog-wikipedia`;
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
	atlas.methods({ recognize });
	//#endregion
	exports.kindOf = kindOf;
	exports.qualifier = qualifier;
	exports.queryUrl = queryUrl;
	return exports;
})({});
