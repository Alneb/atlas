// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/catalog-anime/helper/helper.ts
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
		"User-Agent": "Atlas/0.1 (personal notes app; catalog-anime)"
	};
	/** AniList's description without its markup (`<br>`, `<i>`, "(Source: …)"). */
	function plain(text) {
		return (text ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim().replace(/\n*\(Source:[^)]*\)\s*$/, "").replace(/\n{3,}/g, "\n\n").trim() || void 0;
	}
	/** One name as text, several as a list, none as nothing. */
	function oneOrList(names) {
		const all = [...new Set(names.filter((n) => !!n))];
		return all.length === 1 ? all[0] : all.length ? all : void 0;
	}
	function fieldsOf(kind, m) {
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
			author: oneOrList(authors),
			chapters: m.chapters,
			volumes: m.volumes
		});
		else Object.assign(f, {
			studio: oneOrList((m.studios?.nodes ?? []).map((n) => n.name)),
			episodes: m.episodes
		});
		if (f.original_title === f.title) f.original_title = void 0;
		return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== void 0 && v !== null && v !== "" && !(Array.isArray(v) && !v.length)));
	}
	async function lookup(params) {
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
			fields: fieldsOf(kind, m)
		};
	}
	atlas.methods({ lookup });
	//#endregion
	exports.plain = plain;
	return exports;
})({});
