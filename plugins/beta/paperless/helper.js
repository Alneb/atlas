// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function() {
	/** The address of one page of documents: the newest first, the content cut to a few hundred characters (the library
	*  searches it), or those Paperless's own full-text search finds for `query`. */
	function listPath(page = 1, query = "") {
		const q = String(query ?? "").trim();
		return `/api/documents/?page=${page}&page_size=100&ordering=-created&truncate_content=true${q ? `&query=${encodeURIComponent(q)}` : ""}`;
	}
	/** Paperless names things by number (a tag 3, a correspondent 7): one of its lists (`results` of /api/tags/…) → a map
	*  from the number to the name. */
	function namesOf(answer) {
		return new Map((answer?.results ?? []).map((x) => [Number(x.id), String(x.name ?? x.id)]));
	}
	/** A document's date, `2026-03-02`: `created` (a date since 2.16, a time before), else the older `created_date`. */
	const dateOf = (d) => String(d?.created ?? d?.created_date ?? "").slice(0, 10);
	/** A document of /api/documents/ → the library's row, its numbers named by `names` ({ tags, correspondents, types }). */
	function rowOf(d, names = {}) {
		const name = (map, id) => id == null ? "" : map?.get(Number(id)) ?? "";
		const tags = (d.tags ?? []).map((t) => name(names.tags, t)).filter(Boolean);
		return {
			id: Number(d.id),
			title: String(d.title || d.original_file_name || `document ${d.id}`),
			date: dateOf(d),
			correspondent: name(names.correspondents, d.correspondent),
			type: name(names.types, d.document_type),
			tags,
			asn: d.archive_serial_number ?? null,
			pages: Number(d.page_count) || 0,
			file: String(d.original_file_name ?? ""),
			archived: d.archived_file_name !== null,
			content: String(d.content ?? ""),
			added: d.added ? Date.parse(d.added) : 0
		};
	}
	/** Where the document opens in Paperless's own pages. */
	const detailsUrl = (base, id) => `${base}/documents/${id}/details`;
	/** A document as an agent reads it (the `get` and `search` tools): its fields and, for `get`, its whole text. */
	function forAgent(r, base, withText = false) {
		return {
			id: r.id,
			title: r.title,
			date: r.date || null,
			correspondent: r.correspondent || null,
			type: r.type || null,
			tags: r.tags,
			...r.asn != null ? { asn: r.asn } : {},
			pages: r.pages || null,
			url: base ? detailsUrl(base, r.id) : null,
			...withText ? { text: r.content } : {}
		};
	}
	// plugins/beta/paperless/helper/helper.ts
	const serverOf = (p) => String(p.settings?.server ?? "").trim().replace(/\/+$/, "");
	const auth = {
		Authorization: {
			secret: "token",
			prefix: "Token "
		},
		Accept: "application/json"
	};
	/** The server, or the reason there is none to ask. */
	function ready(p) {
		const server = serverOf(p);
		if (!server) throw new Error("no Paperless address (Settings → Plugins → Paperless)");
		if (!p.secrets?.token) throw new Error("no Paperless API token (Settings → Plugins → Paperless)");
		return server;
	}
	async function names(server) {
		const ask = (l) => atlas.fetchJson(`${server}/api/${l}/?page_size=1000`, { headers: auth }).catch(() => ({}));
		const [tags, correspondents, types] = await Promise.all([
			ask("tags"),
			ask("correspondents"),
			ask("document_types")
		]);
		return {
			tags: namesOf(tags),
			correspondents: namesOf(correspondents),
			types: namesOf(types)
		};
	}
	atlas.methods({
		/** The documents Paperless's full-text search finds, best first (at most `limit`, default 20). */
		search: async (p) => {
			const server = ready(p);
			const query = String(p.query ?? "").trim();
			if (!query) throw new Error("say what to search for (query)");
			const limit = Math.min(100, Math.max(1, Number(p.limit) || 20));
			const [answer, n] = await Promise.all([atlas.fetchJson(`${server}${listPath(1, query)}`, {
				headers: auth,
				timeout: 30
			}), names(server)]);
			const docs = (answer?.results ?? []).slice(0, limit).map((d) => forAgent(rowOf(d, n), server));
			return {
				count: Number(answer?.count ?? docs.length),
				documents: docs
			};
		},
		/** One document with its whole text (what Paperless's OCR read). */
		get: async (p) => {
			const server = ready(p);
			const id = Number(p.id);
			if (!Number.isInteger(id) || id <= 0) throw new Error("say which document (id, a number)");
			const [d, n] = await Promise.all([atlas.fetchJson(`${server}/api/documents/${id}/`, {
				headers: auth,
				timeout: 30
			}), names(server)]);
			if (!d) throw new Error(`Paperless has no document ${id}`);
			return forAgent(rowOf(d, n), server, true);
		}
	});
})();
