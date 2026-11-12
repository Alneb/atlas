// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/copyparty/helper/helper.ts
	/** The most folders a search walks: a library of books is a few hundred. */
	const WALK = 300;
	function servers(params) {
		const list = params.settings?.servers;
		return (Array.isArray(list) ? list : []).filter((s) => !!s && typeof s.name === "string" && typeof s.url === "string" && !!s.url.trim()).map((s) => ({
			name: s.name,
			url: s.url.trim().replace(/\/+$/, "")
		}));
	}
	function serverOf(params) {
		const all = servers(params), want = typeof params.server === "string" ? params.server : "";
		const s = want ? all.find((x) => x.name === want) : all[0];
		if (!s) throw new Error(all.length ? `no copyparty server “${want}”: ${all.map((x) => x.name).join(", ")}` : "no copyparty server in Settings → copyparty");
		return s;
	}
	const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
	const abs = (p) => `/${p.replace(/^\/+/, "")}`;
	/** A file's address on its server (what the catalog fetches, and what a note links to). */
	const fileUrl = (s, path) => `${s.url}${enc(abs(path))}`;
	async function ls(s, dir) {
		const at = abs(dir).replace(/\/*$/, "/");
		const pw = await atlas.secret(`servers.${s.name}.password`) ? { pw: { secret: `servers.${s.name}.password` } } : void 0;
		const text = await atlas.fetch(`${s.url}${enc(at)}?ls&dots`, {
			headers: {
				accept: "application/json",
				...pw
			},
			timeout: 60
		});
		let j;
		try {
			j = JSON.parse(text ?? "");
		} catch {
			throw new Error(`${s.name}: ${at} did not answer with a folder listing (a sign-in in front of it?)`);
		}
		const name = (href = "") => {
			const h = href.split("?")[0].replace(/\/+$/, "");
			const last = h.slice(h.lastIndexOf("/") + 1);
			try {
				return decodeURIComponent(last);
			} catch {
				return last;
			}
		};
		const entry = (e, kind) => ({
			name: name(e.href),
			kind,
			size: kind === "file" ? e.sz : void 0,
			path: `${at}${name(e.href)}`
		});
		return [...(j.dirs ?? []).map((e) => entry(e, "dir")), ...(j.files ?? []).map((e) => entry(e, "file"))].filter((e) => e.name && e.name !== "." && e.name !== "..");
	}
	/** Whether a name has every word of the query (case and accents aside; `_`, `-`, `.` count as spaces). */
	function matches(name, query) {
		const plain = (t) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[_\-.]+/g, " ");
		const n = plain(name);
		return plain(query).split(/\s+/).filter(Boolean).every((w) => n.includes(w));
	}
	async function list(params) {
		const s = serverOf(params), path = typeof params.path === "string" && params.path ? params.path : "/";
		const query = typeof params.query === "string" ? params.query.trim() : "";
		const shown = (e) => ({
			...e,
			url: e.kind === "file" ? fileUrl(s, e.path) : void 0
		});
		if (!query) return {
			server: s.name,
			path: abs(path),
			entries: (await ls(s, path)).map(shown)
		};
		const found = [], queue = [abs(path)];
		let walked = 0;
		while (queue.length && walked < 300 && found.length < 50) {
			const dir = queue.shift();
			walked++;
			let entries;
			try {
				entries = await ls(s, dir);
			} catch {
				continue;
			}
			for (const e of entries) {
				if (matches(e.name, query)) found.push(e);
				if (e.kind === "dir") queue.push(e.path);
			}
		}
		return {
			server: s.name,
			path: abs(path),
			query,
			found: found.map(shown),
			walked,
			...queue.length && walked >= 300 ? { more: `stopped after 300 folders: search under a narrower path` } : {}
		};
	}
	async function file(params) {
		const s = serverOf(params);
		if (typeof params.path !== "string" || !params.path.trim()) throw new Error("`path`: the file on the server, as `list` shows it");
		const url = fileUrl(s, params.path);
		const r = await atlas.post("/api/plugins/catalog/tools/add", { text: url });
		return {
			url,
			note: r.path,
			kind: r.kind,
			outcome: r.outcome,
			steps: r.steps
		};
	}
	atlas.methods({
		list,
		file
	});
	//#endregion
	exports.WALK = WALK;
	exports.fileUrl = fileUrl;
	exports.matches = matches;
	exports.servers = servers;
	return exports;
})({});
