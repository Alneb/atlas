// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function() {
	// plugins/beta/immich/im.js
	/** The body of a smart search (Immich's CLIP search: "a dog on the beach", "whiteboard with equations"). */
	const smartBody = (query, size = 50) => ({
		query: String(query ?? "").trim(),
		size: Math.min(250, Math.max(1, Number(size) || 50)),
		withExif: true
	});
	const MONTHS = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December"
	];
	/** When it was taken, as Immich keeps it: the camera's local time (`localDateTime`), else the file's. */
	const takenOf = (a) => String(a?.localDateTime ?? a?.fileCreatedAt ?? "");
	/** An asset of a search → the library's row. */
	function rowOf(a) {
		const taken = takenOf(a);
		const ex = a.exifInfo ?? {};
		const month = /^\d{4}-\d{2}/.test(taken) ? `${taken.slice(0, 4)} ${MONTHS[Number(taken.slice(5, 7)) - 1] ?? ""}`.trim() : "";
		return {
			id: String(a.id),
			video: a.type === "VIDEO",
			file: String(a.originalFileName ?? a.id),
			date: taken.slice(0, 10),
			taken,
			month,
			monthKey: taken.slice(0, 7),
			place: [ex.city, ex.country].filter(Boolean).join(", "),
			people: (a.people ?? []).map((p) => String(p.name ?? "")).filter(Boolean),
			favorite: !!a.isFavorite,
			description: String(ex.description ?? ""),
			camera: [ex.make, ex.model].filter(Boolean).join(" ")
		};
	}
	/** The items of a search's answer, and whether there is a next page. */
	const itemsOf = (answer) => ({
		items: answer?.assets?.items ?? [],
		more: answer?.assets?.nextPage != null
	});
	/** Where it opens in Immich's own pages. */
	const webUrl = (base, id) => `${base}/photos/${id}`;
	/** An asset as an agent reads it (the `search` tool). */
	function forAgent(r, base) {
		return {
			id: r.id,
			type: r.video ? "video" : "photo",
			file: r.file,
			taken: r.taken || null,
			place: r.place || null,
			people: r.people,
			...r.description ? { description: r.description } : {},
			...r.favorite ? { favorite: true } : {},
			url: base ? webUrl(base, r.id) : null
		};
	}
	// plugins/beta/immich/helper/helper.ts
	const serverOf = (p) => String(p.settings?.server ?? "").trim().replace(/\/+$/, "");
	atlas.methods({ search: async (p) => {
		const server = serverOf(p);
		if (!server) throw new Error("no Immich address (Settings → Plugins → Immich)");
		if (!p.secrets?.key) throw new Error("no Immich API key (Settings → Plugins → Immich)");
		const query = String(p.query ?? "").trim();
		if (!query) throw new Error("say what is in the photos to find (query)");
		const answer = await atlas.fetchJson(`${server}/api/search/smart`, {
			method: "POST",
			body: smartBody(query, Number(p.limit) || 20),
			headers: { "x-api-key": { secret: "key" } },
			timeout: 60
		});
		return { photos: itemsOf(answer).items.map((a) => forAgent(rowOf(a), server)) };
	} });
})();
