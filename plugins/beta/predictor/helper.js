// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function() {
	//#region ui/src/lib/editor/prose.ts
	/** The end of a YAML front matter at the start of `text`, or 0. */
	function frontMatterEnd(text) {
		const m = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
		return m ? m[0].length : 0;
	}
	/** A word: letters (any script, with their accents), an inner apostrophe or hyphen joining two runs. */
	const WORD = /\p{L}[\p{L}\p{M}]*(?:['’-]\p{L}[\p{L}\p{M}]*)*/gu;
	/** The words of `text`, positioned from `offset`. A word glued to a digit, an `@`, a `#`, `_` or a `/` (an id, a
	*  mention, a tag, a path) is left out: it is not a word of the language. */
	function wordsOf(text, offset = 0) {
		const out = [];
		for (const m of text.matchAll(WORD)) {
			const before = text[m.index - 1] ?? "", after = text[m.index + m[0].length] ?? "";
			if (/[\p{N}@#_/\\]/u.test(before) || /[\p{N}@_/\\]/u.test(after)) continue;
			if (before === "." && /\p{L}/u.test(text[m.index - 2] ?? "")) continue;
			out.push({
				word: m[0],
				from: offset + m.index,
				to: offset + m.index + m[0].length
			});
		}
		return out;
	}
	/** The languages known by their common short words, for guessing a note's. */
	const COMMON = {
		en: new Set("the of and to in is that it for as with was on be by this are from or an at not which have but has can we".split(" ")),
		es: new Set("de la que el en los se del las un por con una para es al lo como más pero sus le ha o este si porque".split(" ")),
		fr: new Set("le la les de des et est un une du en que qui dans pour pas sur au par ce sont avec il elle nous".split(" "))
	};
	/** A note's language: its `lang` property when given (`en`, `es-ES` → `es`), else the language whose common
	*  words its text uses most, among `known`; `fallback` when the text says too little. */
	function guessLanguage(text, known, fallback, lang) {
		const given = typeof lang === "string" ? lang.toLowerCase().split(/[-_]/)[0] : "";
		if (given && known.includes(given)) return given;
		const counts = /* @__PURE__ */ new Map();
		let n = 0;
		for (const { word } of wordsOf(text.slice(0, 2e4))) {
			const w = word.toLowerCase();
			for (const l of known) if (COMMON[l]?.has(w)) counts.set(l, (counts.get(l) ?? 0) + 1);
			n++;
		}
		const [best, score] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [fallback, 0];
		return n >= 12 && score >= 3 ? best : fallback;
	}
	/** A note's text with what is not prose blanked out, for counting without a syntax tree (a plugin's helper): the
	*  front matter, fences, `$$…$$` and `$…$`, inline code, links' targets, wikilinks, embeds, tags, HTML and URLs.
	*  Blanked with spaces (a line's breaks kept) so sentences do not join across what was removed. */
	function plainProse(text) {
		const blank = (s) => s.replace(/[^\n]/g, " ");
		const end = frontMatterEnd(text);
		return blank(text.slice(0, end)) + text.slice(end).replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, blank).replace(/\$\$[\s\S]*?\$\$/g, blank).replace(/\$[^$\n]+\$/g, blank).replace(/`[^`\n]+`/g, blank).replace(/!?\[\[[^\]\n]*\]\]/g, blank).replace(/\]\([^)\n]*\)/g, blank).replace(/<[^>\n]+>/g, blank).replace(/https?:\/\/\S+/g, blank).replace(/(^|\s)#[\p{L}\p{N}_/-]+/gu, (m) => blank(m)).replace(/%%[\s\S]*?%%/g, blank);
	}
	/** Is a note the vault owner's own writing, to learn from: not a kept mail (its `message_id` property), whose text is
	*  mostly others' and quoted HTML. Agent files are left out before, by the core's index filter. */
	function ownWriting(text) {
		return !/^message_id:/m.test(text.slice(0, frontMatterEnd(text)));
	}
	//#endregion
	//#region ui/src/lib/editor/dictionaries.ts
	/** The vault's folder of dictionaries (synced with the vault, unlike the machine's). */
	const VAULT_DICTIONARIES = ".atlas/dictionaries";
	/** The vault, through a helper's `atlas`. */
	const vaultFiles = (atlas) => ({
		list: (dir) => atlas.tree(dir).then((t) => t.filter((e) => e.kind === "file").map((e) => e.name), () => null),
		read: (path) => atlas.read(path)
	});
	/** The machine, through `ls` and `cat` (none on the phone: nothing found there). */
	const machineFiles = (exec) => ({
		list: async (dir) => {
			try {
				const r = await exec("ls", [dir]);
				return r.status === 0 ? r.stdout.split("\n") : null;
			} catch {
				return null;
			}
		},
		read: async (path) => {
			const r = await exec("cat", [path], { timeout: 30 });
			if (r.status !== 0) throw new Error(r.stderr || `could not read ${path}`);
			if (!r.stdout.includes("�")) return r.stdout;
			for (const args of [["-w0", path], [path]]) {
				const b = await exec("base64", args, { timeout: 30 }).catch(() => null);
				if (b?.status === 0) return latin1(b.stdout.replace(/\s+/g, ""));
			}
			return r.stdout;
		}
	});
	/** Base64 → a string whose characters are the bytes (Latin-1); no atob in every helper runtime. */
	function latin1(b64) {
		const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		let out = "", bits = 0, n = 0;
		for (const c of b64) {
			const v = A.indexOf(c);
			if (v < 0) continue;
			bits = bits << 6 | v;
			n += 6;
			if (n >= 8) {
				n -= 8;
				out += String.fromCharCode(bits >> n & 255);
			}
		}
		return out;
	}
	/** The places to look, in order: the vault's folder, the setting's folder, the systems' usual ones. */
	function places(vault, machine, own) {
		const mine = typeof own === "string" ? own.trim() : "";
		return [{
			files: vault,
			dir: VAULT_DICTIONARIES,
			inVault: true
		}, ...[
			mine,
			"/usr/share/hunspell",
			"/usr/share/myspell",
			"/usr/share/myspell/dicts"
		].filter(Boolean).map((dir) => ({
			files: machine,
			dir,
			inVault: false
		}))];
	}
	/** Each dictionary there is (`en_US`) and where, the first place holding a name winning. */
	async function installedDictionaries(vault, machine, own) {
		const found = /* @__PURE__ */ new Map();
		for (const place of places(vault, machine, own)) {
			const listed = await place.files.list(place.dir);
			if (!listed) continue;
			const names = new Set(listed);
			for (const n of names) {
				const m = /^([A-Za-z]{2,3}(?:[_-][A-Za-z0-9]+)*)\.dic$/.exec(n);
				if (m && names.has(`${m[1]}.aff`) && !found.has(m[1])) found.set(m[1], place);
			}
		}
		return found;
	}
	/** One dictionary's file (`aff` or `dic`), as text. */
	async function dictionaryFile(vault, machine, own, name, ext) {
		const at = (await installedDictionaries(vault, machine, own)).get(name);
		if (!at) throw new Error(`no Hunspell dictionary named ${name}`);
		return at.files.read(`${at.dir}/${name}.${ext}`);
	}
	/** The dictionaries a language uses when the setting names none: of each group, the first installed. English takes
	*  both the American and the British one, so either spelling (centered, centred) is right. */
	const PREFERRED = {
		en: [["en_US", "en_CA"], ["en_GB", "en_AU"]],
		es: [[
			"es_ES",
			"es_MX",
			"es_AR"
		]],
		fr: [["fr_FR", "fr_CA"]],
		de: [["de_DE"]]
	};
	/** language → dictionary names: the preferred installed ones, under the setting's choices (`en=en_GB, es=es_MX+es_AR`). */
	function chooseDictionaries(installed, setting) {
		const chosen = /* @__PURE__ */ new Map();
		for (const [lang, groups] of Object.entries(PREFERRED)) {
			const names = groups.map((g) => g.find((x) => installed.includes(x))).filter((x) => !!x);
			if (names.length) chosen.set(lang, names);
		}
		for (const part of String(setting ?? "").split(/[,\s]+/)) {
			const m = /^([a-z]{2,3})=([\w+-]+)$/.exec(part.trim());
			const names = m?.[2].split("+").filter((n) => installed.includes(n)) ?? [];
			if (m && names.length) chosen.set(m[1], names);
		}
		return chosen;
	}
	/** A `.dic` file's words without their affix flags, lower-case words only (names are the vault's to teach), sorted. */
	function dicStems(dic) {
		const out = /* @__PURE__ */ new Set();
		for (const line of dic.split("\n").slice(1)) {
			const w = line.split("/")[0].split(/\s/)[0];
			if (/^\p{Ll}[\p{Ll}\p{M}'’-]*$/u.test(w)) out.add(w);
		}
		return [...out].sort();
	}
	//#endregion
	//#region plugins/beta/predictor/ui/src/model.ts
	/** A text's sentences as lists of words (a sentence ends at . ! ? ; : a line break or a blank). */
	function sentences(text, wordsOf) {
		return text.split(/[.!?;:]+(?:\s|$)|\n+/).map((s) => wordsOf(s).map((w) => w.word)).filter((s) => s.length);
	}
	/** Sentences as one compact text (words by spaces, sentences by lines): what the helper answers and the page keeps. */
	const packSentences = (sents) => sents.map((s) => s.join(" ")).join("\n");
	//#endregion
	//#region plugins/beta/predictor/helper/helper.ts
	const exec = (cmd, args, opts) => atlas.exec(cmd, args, opts);
	const vault = vaultFiles(atlas);
	const machine = machineFiles(exec);
	/** The notes to count, in order (the page asks for them in chunks). */
	async function notes() {
		return (await atlas.files(true)).filter((p) => /\.md$/i.test(p) && !p.startsWith(".atlas/"));
	}
	/** path → { lang, text: its sentences packed }; a note that is not the owner's writing (a kept mail) left out. */
	async function count(p) {
		const langs = p.langs ?? ["en"];
		const fallback = String(p.fallback ?? langs[0] ?? "en");
		const out = {};
		for (const path of p.paths ?? []) {
			let text;
			try {
				text = await atlas.read(path);
			} catch {
				continue;
			}
			if (!ownWriting(text)) continue;
			out[path] = {
				lang: guessLanguage(text, langs, fallback, /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(text)?.[1]),
				text: packSentences(sentences(plainProse(text), wordsOf))
			};
		}
		return out;
	}
	/** A language's dictionary words (lower case, without affixes), one per line; "" when none is installed. */
	async function lexicon(p) {
		const names = chooseDictionaries([...(await installedDictionaries(vault, machine, p.folder)).keys()], p.dictionaries).get(String(p.lang ?? "en")) ?? [];
		const words = /* @__PURE__ */ new Set();
		for (const name of names) for (const w of dicStems(await dictionaryFile(vault, machine, p.folder, name, "dic"))) words.add(w);
		return [...words].join("\n");
	}
	atlas.methods({
		notes,
		count,
		lexicon
	});
	//#endregion
})();
