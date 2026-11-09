// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region plugins/beta/zstd/helper/helper.ts
	const HOUR = 3600;
	const MB = 1048576;
	/** The plugin's cache folder, vault-relative. Nothing outside it is ever deleted. */
	function cacheDir(id) {
		return `.atlas/cache/plugins/${id}`;
	}
	/** Where `x/y.tsv.zst` is read from: `.atlas/cache/plugins/<id>/x/y.tsv` (the name without `.zst` keeps its view). */
	function copyPath(id, path) {
		return `${cacheDir(id)}/${path.replace(/\.zst$/i, "")}`;
	}
	/** A path that stays inside the cache folder: relative, no empty, `.` or `..` step. */
	const inside = (rel) => rel !== "" && !rel.split("/").some((p) => p === "" || p === "." || p === "..");
	/** `find -printf '%T@\t%s\t%P\0'` read into copies (a malformed or escaping entry is skipped, so never deleted). */
	function parseListing(out) {
		const files = [];
		for (const entry of out.split("\0")) {
			const [t, s, ...name] = entry.split("	");
			const rel = name.join("	");
			const mtime = Number(t), size = Number(s);
			if (inside(rel) && t !== "" && s !== "" && Number.isFinite(mtime) && Number.isFinite(size)) files.push({
				rel,
				mtime,
				size
			});
		}
		return files;
	}
	/** Which copies to delete: those last opened more than `maxAge` seconds before `now`, then the oldest until the rest
	*  weighs at most `maxBytes`. `keep` (the copy just made) is never among them. */
	function victims(files, keep, now, maxAge, maxBytes) {
		const out = [];
		const left = [];
		for (const f of files) f.rel !== keep && now - f.mtime > maxAge ? out.push(f.rel) : left.push(f);
		let total = left.reduce((n, f) => n + f.size, 0);
		for (const f of left.filter((f) => f.rel !== keep).sort((a, b) => a.mtime - b.mtime)) {
			if (total <= maxBytes) break;
			out.push(f.rel);
			total -= f.size;
		}
		return out;
	}
	/** A limit from the settings: a non-negative number, else its default. */
	const limit = (v, dflt) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : dflt;
	/** Runs a program for the pruning; its output, or an error with its message. */
	async function run(program, args) {
		const r = await atlas.exec(program, args, {
			locale: "C",
			timeout: 120
		});
		if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim() || `${program} failed (${r.status ?? "killed"})`);
		return r.stdout;
	}
	/** Deletes old and surplus copies from the cache, then the folders left empty; never `keep` (cache-relative). */
	async function prune(keep, settings) {
		const dir = `./${cacheDir(atlas.id)}`;
		const gone = victims(parseListing(await run("find", [
			dir,
			"-type",
			"f",
			"-printf",
			"%T@\\t%s\\t%P\\0"
		])), keep, Date.now() / 1e3, limit(settings.cache_hours, 24) * HOUR, limit(settings.cache_mb, 500) * MB);
		for (let i = 0; i < gone.length; i += 200) await run("rm", ["-f", ...gone.slice(i, i + 200).map((rel) => `${dir}/${rel}`)]);
		if (gone.length) await run("find", [
			dir,
			"-mindepth",
			"1",
			"-type",
			"d",
			"-empty",
			"-delete"
		]);
	}
	async function open(params) {
		const path = String(params.path ?? "").trim().replace(/^\/+/, "");
		if (!/[^/]\.zst$/i.test(path)) throw new Error(`not a .zst file: ${path || "(none)"}`);
		if (path.split("/").some((p) => p === ".." || p === ".")) throw new Error(`not a vault path: ${path}`);
		const out = copyPath(atlas.id, path);
		await atlas.write(out, "");
		const r = await atlas.exec("zstd", [
			"-d",
			"-q",
			"-f",
			"-o",
			`./${out}`,
			`./${path}`
		], {
			locale: "C",
			timeout: 600
		}).catch((e) => {
			throw new Error(/not installed/.test(e.message) ? "zstd is not installed on the machine running Atlas" : e.message);
		});
		if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim() || `zstd failed (${r.status ?? "killed"})`);
		try {
			await run("touch", ["-c", `./${out}`]);
			await prune(out.slice(cacheDir(atlas.id).length + 1), params.settings ?? {});
		} catch (e) {
			console.warn(`zstd: the cache was not pruned: ${e.message}`);
		}
		return { path: out };
	}
	atlas.methods({ open });
	//#endregion
	exports.cacheDir = cacheDir;
	exports.copyPath = copyPath;
	exports.parseListing = parseListing;
	exports.victims = victims;
	return exports;
})({});
