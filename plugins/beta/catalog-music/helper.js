// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/catalog-music/helper/helper.ts
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
		headers: { "User-Agent": "Atlas/0.1 (personal notes app; catalog-music)" },
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
	async function lookup(params) {
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
	atlas.methods({ lookup });
	//#endregion
	exports.cleanArtist = cleanArtist;
	exports.cleanTitle = cleanTitle;
	exports.firstAlbum = firstAlbum;
	return exports;
})({});
