// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/catalog-linkwarden/helper/helper.ts
	const FROM_IDS = [
		["doi", (id) => `https://doi.org/${id}`],
		["arxiv", (id) => `https://arxiv.org/abs/${id}`],
		["youtube", (id) => `https://www.youtube.com/watch?v=${id}`],
		["imdb", (id) => `https://www.imdb.com/title/${id}/`]
	];
	/** The address to save: the thing's own link, else the best one its IDs give, else where it came from. */
	function linkOf(ids, props) {
		if (ids.url) return ids.url;
		for (const [key, make] of FROM_IDS) if (ids[key]) return make(ids[key]);
		return props.source || null;
	}
	async function save(params) {
		const settings = params.settings ?? {};
		const base = String(settings.address ?? "").trim().replace(/\/+$/, "");
		if (!base) return {
			fields: {},
			skipped: "no Linkwarden address in Settings → Catalog · Linkwarden"
		};
		const ids = params.ids ?? {}, props = params.props ?? {};
		const url = linkOf(ids, props);
		if (!url) return {
			fields: {},
			skipped: "nothing to link to"
		};
		const options = params.options ?? {};
		const tags = [.../* @__PURE__ */ new Set([...settings.tags ?? [], ...options.tags ?? []])];
		const body = {
			url,
			name: props.title || url,
			description: props.description || "",
			tags: tags.map((name) => ({ name })),
			collection: { name: options.collection || params.library || "Atlas" }
		};
		const token = Boolean(await atlas.secret("token"));
		const res = await atlas.fetchResponse({
			url: `${base}/api/v1/links`,
			method: "POST",
			headers: {
				...token ? { Authorization: {
					secret: "token",
					prefix: "Bearer "
				} } : {},
				"Content-Type": "application/json",
				Accept: "application/json"
			},
			body: JSON.stringify(body)
		});
		if (res.signin) return { signin: res.signin };
		if (res.status === 409) return {
			fields: {},
			already: true
		};
		if (!res.ok) throw new atlas.AtlasError(`Linkwarden answered ${res.status}: ${String(res.text ?? "").slice(0, 200)}`, res.status);
		const id = JSON.parse(res.text || "{}").response?.id;
		return { fields: id !== void 0 && id !== null ? { linkwarden: `${base}/links/${id}` } : {} };
	}
	atlas.methods({ save });
	//#endregion
	exports.linkOf = linkOf;
	return exports;
})({});
