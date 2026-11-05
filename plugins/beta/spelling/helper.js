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
	//#region plugins/beta/spelling/helper/helper.ts
	/** Where systems keep Hunspell dictionaries, the setting's folder first. */
	const folders = (own) => [
		typeof own === "string" ? own.trim() : "",
		"/usr/share/hunspell",
		"/usr/share/myspell",
		"/usr/share/myspell/dicts"
	].filter(Boolean);
	/** Each installed dictionary (`en_US`) with its folder, the first folder holding a name winning. */
	async function installed(own) {
		const found = /* @__PURE__ */ new Map();
		for (const dir of folders(own)) {
			let r;
			try {
				r = await atlas.exec("ls", [dir]);
			} catch {
				return found;
			}
			if (r.status !== 0) continue;
			const names = new Set(r.stdout.split("\n"));
			for (const n of names) {
				const m = /^([A-Za-z]{2,3}(?:[_-][A-Za-z0-9]+)*)\.dic$/.exec(n);
				if (m && names.has(`${m[1]}.aff`) && !found.has(m[1])) found.set(m[1], dir);
			}
		}
		return found;
	}
	async function dictionaries(p) {
		return [...(await installed(p.folder)).keys()].sort();
	}
	/** One dictionary's two files, as text. */
	async function dictionary(p) {
		const name = String(p.name ?? "");
		const dir = (await installed(p.folder)).get(name);
		if (!dir) throw new Error(`no Hunspell dictionary named ${name}`);
		const cat = async (ext) => {
			const r = await atlas.exec("cat", [`${dir}/${name}.${ext}`], { timeout: 30 });
			if (r.status !== 0) throw new Error(r.stderr || `could not read ${name}.${ext}`);
			return r.stdout;
		};
		return {
			aff: await cat("aff"),
			dic: await cat("dic")
		};
	}
	/** The notes to count, in order (the page asks for them in chunks). */
	async function notes() {
		return (await atlas.files(true)).filter((p) => /\.md$/i.test(p) && !p.startsWith(".atlas/"));
	}
	/** The words of these notes per language: word → [uses, notes using it]. `langs` are the languages with a
	*  dictionary, `fallback` the vault's main one. */
	async function count(p) {
		const paths = p.paths ?? [];
		const langs = p.langs ?? ["en"];
		const fallback = String(p.fallback ?? langs[0] ?? "en");
		const out = {};
		for (const path of paths) {
			let text;
			try {
				text = await atlas.read(path);
			} catch {
				continue;
			}
			if (!ownWriting(text)) continue;
			const lang = guessLanguage(text, langs, fallback, /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(text)?.[1]);
			const table = out[lang] ??= {};
			const seen = /* @__PURE__ */ new Set();
			for (const { word } of wordsOf(plainProse(text))) {
				const row = table[word] ??= [0, 0];
				row[0]++;
				if (!seen.has(word)) {
					seen.add(word);
					row[1]++;
				}
			}
		}
		return out;
	}
	atlas.methods({
		dictionaries,
		dictionary,
		notes,
		count
	});
	//#endregion
})();
