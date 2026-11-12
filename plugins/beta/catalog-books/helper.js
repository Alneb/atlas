// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/catalog-books/helper/helper.ts
	const OL = "https://openlibrary.org";
	/** '1965', 'August 1990', 'Jun 01, 1990' → the year. */
	function yearOf(text) {
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
	function genres(subjects) {
		const out = [];
		for (const s of subjects ?? []) {
			if (typeof s !== "string" || s.includes(":") || s.includes(",") || BOOKKEEPING.has(s.toLowerCase())) continue;
			const t = atlas.text.title(s.trim());
			if (!out.includes(t)) out.push(t);
		}
		return out.length ? out.slice(0, 5) : void 0;
	}
	/** The edition's co-authors that the work's author list leaves out (Open Library links one author to a work and keeps
	*  the others as `contributors` with an author role, or only in the title page's `by_statement`, "[by] A [and] B"). A
	*  name is new when its last word is no listed author's. */
	function withCoauthors(authors, edition) {
		const out = [...authors];
		const surname = (n) => n.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
		const add = (n) => {
			const name = (n ?? "").replace(/[[\]]/g, "").replace(/[.;,\s]+$/, "").trim();
			if (name.split(/\s+/).length >= 2 && !out.some((a) => surname(a) === surname(name))) out.push(name);
		};
		for (const c of edition.contributors ?? []) if (/author/i.test(c.role ?? "")) add(c.name);
		const by = /^\s*\[?by\]?\s+(.*)$/i.exec(edition.by_statement ?? "")?.[1];
		if (by && !/\b(edit|translat|foreword|introduc|illustrat)/i.test(by)) for (const n of by.split(/\s*(?:,|;|&|\[?\band\b\]?)\s*/i)) add(n);
		return out;
	}
	const get = (url) => atlas.fetchJson(url);
	const nameOf = async (key) => key ? (await get(`${OL}${key}.json`))?.name : void 0;
	async function lookup(params) {
		const ids = params.ids ?? {};
		const isbn = ids.isbn;
		let workId = ids.openlibrary;
		let edition = null;
		if (isbn) edition = await get(`${OL}/isbn/${isbn}.json`);
		else if (ids.ol_edition) edition = await get(`${OL}/books/${ids.ol_edition}.json`);
		if (edition && !workId) workId = (edition.works?.[0]?.key ?? "").split("/").pop() || void 0;
		if (!workId && !edition) return ids.goodreads && !isbn ? { later: true } : {
			fields: {},
			skipped: "Open Library does not know this book"
		};
		const work = (workId ? await get(`${OL}/works/${workId}.json`) : null) ?? {};
		let authors = await Promise.all((work.authors ?? []).slice(0, 4).map((a) => nameOf(a.author?.key)));
		if (!authors.some(Boolean) && edition) authors = await Promise.all((edition.authors ?? []).slice(0, 4).filter((a) => a.key).map((a) => nameOf(a.key)));
		const ed = edition ?? {};
		authors = withCoauthors(authors.filter((a) => !!a), ed).slice(0, 4);
		const cover = (ed.covers ?? work.covers ?? []).find((c) => Number.isInteger(c) && c > 0);
		const fields = {
			title: work.title || ed.title,
			author: oneOrList(authors),
			year: yearOf(work.first_publish_date) ?? yearOf(ed.publish_date),
			pages: ed.number_of_pages,
			publisher: ed.publishers?.[0],
			genres: genres(work.subjects),
			description: textOf(work.description) ?? textOf(ed.description),
			cover: cover !== void 0 ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : void 0
		};
		const outIds = {};
		if (workId) outIds.openlibrary = workId;
		const isbns = [...ed.isbn_13 ?? [], ...ed.isbn_10 ?? []];
		if (isbns.length && !isbn) outIds.isbn = isbns[0];
		return {
			ids: outIds,
			fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== void 0 && v !== null && v !== ""))
		};
	}
	atlas.methods({ lookup });
	//#endregion
	exports.lookup = lookup;
	exports.withCoauthors = withCoauthors;
	exports.yearOf = yearOf;
	return exports;
})({});
