// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function() {
	//#region plugins/stable/print/helper/helper.ts
	const SIDES = {
		"one-sided": "one-sided",
		"two-sided (long edge)": "two-sided-long-edge",
		"two-sided (short edge)": "two-sided-short-edge"
	};
	/** A CUPS program's output, in English whatever the machine's language (the words are read here). */
	async function cups(program, args) {
		const r = await atlas.exec(program, args, {
			locale: "C",
			timeout: 60
		}).catch((e) => {
			throw new Error(/not installed/.test(e.message) ? `${program} is not installed on the machine running Atlas (CUPS)` : e.message);
		});
		if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim() || `${program} failed (${r.status ?? "killed"})`);
		return r.stdout;
	}
	/** The printers CUPS knows, the default first: [{value, label}] for the settings' suggestions. */
	async function printers() {
		const names = [...(await cups("lpstat", ["-p"])).matchAll(/^printer (\S+)/gm)].map((m) => m[1]);
		const def = /:\s*(\S+)\s*$/.exec((await cups("lpstat", ["-d"])).trim())?.[1];
		const first = def && names.includes(def) ? def : void 0;
		return [...first ? [first] : [], ...names.filter((n) => n !== first)].map((n) => ({
			value: n,
			label: n === first ? `${n} (default)` : n
		}));
	}
	/** A note's PDF, made by the Export plugin as its "Export to PDF" makes it; its vault path. */
	async function asPdf(path) {
		const exp = (await atlas.get("/api/plugins")).find((p) => p.id === "export");
		if (!exp) throw new Error("a note is printed as its PDF, made by the Export plugin: install it (Settings → Plugins)");
		const r = await atlas.post("/api/plugins/export/helper", {
			method: "export",
			params: {
				path,
				to: "pdf",
				settings: exp.settings ?? {}
			},
			timeout_secs: 600
		});
		return r.written[r.written.length - 1];
	}
	async function print(params) {
		const path = String(params.path ?? "").trim().replace(/^\/+/, "");
		const s = params.settings ?? {};
		if (!path) throw new Error("nothing to print");
		const target = path.toLowerCase().endsWith(".md") ? await asPdf(path) : path;
		const args = [];
		const printer = String(s.printer ?? "").trim();
		if (printer) args.push("-d", printer);
		const copies = Number(s.copies) || 1;
		if (copies > 1) args.push("-n", String(copies));
		const sides = SIDES[String(s.sides ?? "")];
		if (sides) args.push("-o", `sides=${sides}`);
		if (String(s.media ?? "").trim()) args.push("-o", `media=${s.media}`);
		args.push(...String(s.options ?? "").split(/\s+/).filter(Boolean));
		args.push(`./${target}`);
		const out = await cups("lp", args);
		return {
			job: /request id is (\S+)/.exec(out)?.[1] ?? out.trim(),
			printed: target,
			printer: printer || "the default printer"
		};
	}
	atlas.methods({
		printers,
		print
	});
	//#endregion
})();
