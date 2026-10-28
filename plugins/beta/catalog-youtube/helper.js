// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function() {
	//#region plugins/beta/catalog-youtube/helper/helper.ts
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
	async function lookup(params) {
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
	atlas.methods({ lookup });
	//#endregion
})();
