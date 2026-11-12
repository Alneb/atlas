// Built from helper/helper.ts by scripts/dev/plugin-ui.mjs: edit the sources, not this file.
(function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region ui/src/lib/tex-portable.ts
	/** The macros every formula in Atlas may use, as KaTeX's `macros` option writes them (`#1` for an argument). */
	const MACROS = {
		"\\R": "\\mathbb{R}",
		"\\C": "\\mathbb{C}",
		"\\N": "\\mathbb{N}",
		"\\Z": "\\mathbb{Z}",
		"\\ket": "\\left| #1\\right\\rangle",
		"\\bra": "\\left\\langle #1\\right|",
		"\\braket": "\\left\\langle #1\\right\\rangle",
		"\\Tr": "\\operatorname{Tr}",
		"\\mbox": "\\text{#1}"
	};
	/** The macros as definitions: `providecommand` for LaTeX (a package or preamble defining one first wins),
	*  `newcommand` for pandoc's reader, which applies them to every formula for Typst and Word. */
	function macroDefinitions(command, macros = MACROS) {
		return Object.entries(macros).map(([name, body]) => `\\${command}{${name}}${body.includes("#1") ? "[1]" : ""}{${body}}`).join("\n");
	}
	//#endregion
	//#region ui/src/lib/math-align.ts
	const RELATIONS = [
		":=",
		"=:",
		"\\leq",
		"\\geq",
		"\\leqslant",
		"\\geqslant",
		"\\le",
		"\\ge",
		"\\neq",
		"\\ne",
		"\\approx",
		"\\equiv",
		"\\simeq",
		"\\sim",
		"\\cong",
		"\\propto",
		"\\Rightarrow",
		"\\Leftarrow",
		"\\Leftrightarrow",
		"\\implies",
		"\\impliedby",
		"\\iff",
		"\\ll",
		"\\gg",
		"=",
		"<",
		">"
	];
	/** Where the first relation outside every bracket starts (`a_{i=1} = b` → the second `=`), or -1. */
	function firstRelation(line) {
		let depth = 0;
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (c === "\\") {
				const name = /^\\([A-Za-z]+|.)/.exec(line.slice(i))[0];
				if (/^\\(left|right|big|Big|bigg|Bigg)[lr]?$/.exec(name)) {
					const delimiter = /^(\\([A-Za-z]+|.)|.)/.exec(line.slice(i + name.length))?.[0] ?? "";
					const opens = name === "\\left" || /l$/.test(name) || !/r$/.test(name) && name !== "\\right" && "{([".includes(delimiter.slice(-1));
					depth += opens ? 1 : -1;
					i += name.length + delimiter.length - 1;
					continue;
				}
				if (depth === 0 && RELATIONS.includes(name) && !/[A-Za-z]/.test(line[i + name.length] ?? "")) return i;
				i += name.length - 1;
				continue;
			}
			if ("{([".includes(c)) depth++;
			else if ("})]".includes(c)) depth--;
			else if (depth === 0 && "=<>:".includes(c)) {
				if (c === ":" && line[i + 1] !== "=") continue;
				if (c === "=" && line[i - 1] === ":") continue;
				return i;
			}
		}
		return -1;
	}
	/** One line, aligned: `&` before its first relation; a line that goes on a sum (`+ c`) sits after the relation. */
	function alignLine(line) {
		if (/(^|[^\\])&/.test(line)) return line;
		if (/^[+\-]/.test(line) || /^\\(cdot|times|pm|mp)\b/.test(line)) return `&\\quad ${line}`;
		const at = firstRelation(line);
		return at <= 0 ? `&${line}` : `${line.slice(0, at).trimEnd()} &${line.slice(at)}`;
	}
	/** The environment for a `$$align` block, or the source as it was. */
	function expandAlign(source) {
		const m = /^\s*(align\*?)[ \t]*(?:\n|$)([\s\S]*)$/.exec(source);
		if (!m) return source;
		const lines = m[2].split("\n").map((l) => l.trim().replace(/\\\\$/, "").trim()).filter(Boolean);
		return `\\begin{${m[1]}}${lines.length ? `\n${lines.map(alignLine).join(" \\\\\n")}\n` : ""}\\end{${m[1]}}`;
	}
	//#endregion
	//#region ui/src/lib/fence-walk.ts
	/** A walk over a note's lines: `code(line)` for each in order says whether it is code (a fence line or inside one). */
	function fences$1() {
		let open = null;
		return { code(line) {
			const t0 = line.replace(/^ +/, "");
			const indented = line.length - t0.length > 3;
			const t = t0.replace(/[\r\n]+$/, "");
			const run = (c) => {
				let r = 0;
				while (t[r] === c) r++;
				return r;
			};
			if (open) {
				const r = run(open.mark);
				if (!indented && r >= open.n && !t.slice(r).trim()) open = null;
				return true;
			}
			for (const mark of ["`", "~"]) {
				const r = run(mark);
				if (r >= 3 && (mark === "~" || !t.slice(r).includes("`"))) {
					if (indented) return false;
					open = {
						mark,
						n: r
					};
					return true;
				}
			}
			return false;
		} };
	}
	//#endregion
	//#region ui/src/lib/equations.ts
	const ID_AFTER_CLOSE = /\$\$[ \t]*\^([A-Za-z0-9-]+)[ \t]*$/;
	const LABEL = /\\label\{([^}]+)\}/;
	const LABELS = /\\label\{[^}]*\}/g;
	const OWN_TAG = /\\tag\*?\{([^}]*)\}/;
	const NO_TAG = /\\(?:notag|nonumber)\b/;
	const NUMBERED_ENV = /\\begin\{(equation|align|gather|multline|eqnarray)\}/;
	/** A figure's line: an embed (`![[…]]` or `![…](…)`), anything after it, and its block id last. */
	const FIGURE_LINE = /^[\s>]*(!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]*\))(.*?)[ \t]+\^([A-Za-z0-9-]+)[ \t]*$/;
	/** The label a numbered display takes: its own `\tag`, none for `\notag`, else the next number (`next` counts them). */
	function labelOf(source, next) {
		const own = OWN_TAG.exec(source);
		if (own) return own[1];
		return NO_TAG.test(source) ? null : String(next());
	}
	/** What a link to the label reads in its own note: "(3)" for an equation, "Figure 2" for a figure. */
	function refOf(e, id) {
		const eq = e?.byId.get(id);
		if (eq) return `(${eq})`;
		const fig = e?.figures.get(id);
		return fig ? `Figure ${fig}` : void 0;
	}
	/** Every numbered display of a note, in order. Code fences are skipped (an example is not an equation). */
	function noteEquations(md) {
		const lines = md.split("\n"), code = fences$1();
		const byId = /* @__PURE__ */ new Map(), byTex = /* @__PURE__ */ new Map(), spanOf = /* @__PURE__ */ new Map();
		const figures = /* @__PURE__ */ new Map();
		let n = 0;
		const next = () => ++n;
		for (let i = 0; i < lines.length; i++) {
			if (code.code(lines[i])) continue;
			const fig = FIGURE_LINE.exec(lines[i]);
			if (fig) {
				figures.set(fig[3], String(figures.size + 1));
				spanOf.set(fig[3], [i + 1, i + 1]);
				continue;
			}
			const open = /^[\s>]*\$\$/.exec(lines[i]);
			if (!open) continue;
			let close = lines[i].indexOf("$$", open[0].length) >= 0 ? i : -1;
			for (let k = i + 1; close < 0 && k < lines.length; k++) if (lines[k].includes("$$")) close = k;
			if (close < 0) break;
			const source = lines.slice(i, close + 1).join("\n");
			const id = LABEL.exec(source)?.[1] ?? ID_AFTER_CLOSE.exec(lines[close])?.[1];
			if (id || NUMBERED_ENV.test(source)) {
				const label = labelOf(source, next);
				if (label !== null) {
					if (id) {
						byId.set(id, label);
						spanOf.set(id, [i + 1, close + 1]);
					}
					if (!OWN_TAG.test(source)) byTex.set(texKey(source), label);
				}
			}
			i = close;
		}
		return {
			byId,
			byTex,
			spanOf,
			figures
		};
	}
	/** A display's TeX as a lookup key: without its `$$`, a block id after them, container prefixes (`> `) and outer
	*  blanks; the reader's token content and the editor's `$$…$$` source give the same key. */
	const texKey = (display) => display.replace(/[ \t]*\^[A-Za-z0-9-]+[ \t]*$/, "").split("\n").map((l) => l.replace(/^[ \t>]*/, "")).join("\n").replace(/^\s*\$\$|\$\$\s*$/g, "").trim();
	/** TeX as KaTeX should draw it: labels out (they are Atlas's), and with a number, a numbered environment made its
	*  unnumbered twin (KaTeX would count from 1 in each display) and `\tag{n}` added — before the closing `$$` when the
	*  text has them. */
	function numberedTex(tex, n) {
		let t = tex.replace(LABELS, "");
		if (!n) return t;
		t = t.replace(/\\(begin|end)\{(equation|align|gather|multline|eqnarray)\}/g, (_m, be, env) => env === "equation" || env === "multline" ? "" : `\\${be}{${env === "align" || env === "eqnarray" ? "aligned" : "gathered"}}`);
		const at = t.lastIndexOf("$$");
		return at > 0 ? `${t.slice(0, at)}\\tag{${n}}${t.slice(at)}` : `${t.trimEnd()}\\tag{${n}}`;
	}
	/** A link's equation label: `note#^id` → ["note", "id"]; null for any other link. */
	function equationTarget(target) {
		const m = /^([^#]*)#\^([A-Za-z0-9:_-]+)$/.exec(target.trim());
		return m ? [m[1].trim(), m[2]] : null;
	}
	/** What a link to an equation or figure reads, from what it reads in its own note (`refOf`): "(3)" there, "Note (3)"
	*  from another; "Figure 2" there, "Note, Figure 2" from another. */
	const linkText = (note, ref) => !note ? ref : `${note.split("/").pop()}${ref.startsWith("(") ? " " : ", "}${ref}`;
	//#endregion
	//#region plugins/beta/export/helper/translate.ts
	const IMAGE = /\.(png|jpe?g|gif|svg|webp|pdf|eps)$/i;
	const QUERY_FENCES = /* @__PURE__ */ new Set([
		"view",
		"base",
		"tasks",
		"dataview",
		"dataviewjs",
		"query"
	]);
	const dirname = (p) => p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
	const basename = (p) => p.slice(p.lastIndexOf("/") + 1);
	const stem = (p) => basename(p).replace(/\.[^.]*$/, "");
	/** `a/b/../c` → `a/c`; null when it climbs out of the vault. */
	function normalize(p) {
		const out = [];
		for (const part of p.split("/")) {
			if (!part || part === ".") continue;
			if (part === "..") {
				if (!out.length) return null;
				out.pop();
			} else out.push(part);
		}
		return out.join("/");
	}
	/** `to` as seen from the folder `from` (both vault-relative): `../../figs/plot.png`. */
	function relative(from, to) {
		const a = from.split("/").filter(Boolean), b = to.split("/").filter(Boolean);
		let i = 0;
		while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
		return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
	}
	/** The frontmatter's single-line `key: value` pairs (quotes off, keys lower-case) and the body. */
	function splitFrontmatter(text) {
		const m = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
		if (!m) return [{}, text];
		const props = {};
		for (const line of m[1].split(/\r?\n/)) {
			const kv = /^([A-Za-z_][\w-]*):\s*(.+?)\s*$/.exec(line);
			if (kv) props[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, "");
		}
		return [props, text.slice(m[0].length)];
	}
	/** The citation keys of a .bib. */
	const bibKeys = (bib) => new Set([...bib.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)].map((m) => m[1]));
	/** The text as [isCode, chunk, lang]: fenced blocks are code; a query fence is dropped. */
	function segments(md) {
		const out = [];
		let buf = [], fence = null, lang = "";
		for (const line of md.split(/(?<=\n)/)) {
			const m = /^\s*(`{3,}|~{3,})\s*([\w-]*)/.exec(line);
			const t = line.trim();
			if (fence === null && m) {
				out.push([
					false,
					buf.join(""),
					""
				]);
				buf = [line];
				fence = m[1];
				lang = m[2].toLowerCase();
			} else if (fence !== null && t.startsWith(fence) && t.replaceAll(fence[0], "") === "") {
				buf.push(line);
				if (!QUERY_FENCES.has(lang)) out.push([
					true,
					buf.join(""),
					lang
				]);
				buf = [];
				fence = null;
			} else buf.push(line);
		}
		out.push([
			fence !== null,
			buf.join(""),
			fence !== null ? lang : ""
		]);
		return out;
	}
	/** Display math as every writer takes it: on lines of its own, a `$$align` block (and a whole `\begin{align}` in `$$`)
	*  as pandoc's `aligned`, valid inside display math everywhere. Atlas's macros stay as written: each road carries their
	*  definitions (helper.ts). */
	const mathPortable = (text) => text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => `$$\n${expandAlign(tex.trim()).replace(/^\\begin\{align\*?\}([\s\S]*)\\end\{align\*?\}$/, "\\begin{aligned}$1\\end{aligned}")}\n$$`);
	const AUTO = "";
	/** A note's displays with their labels made its own: `$$ … $$ ^id` → `\label{note::id}`, `\label{id}` likewise. */
	function qualifyLabels(text, note) {
		return text.replace(/\$\$[ \t]*\^([A-Za-z0-9-]+)[ \t]*$/gm, (_, id) => `\\label{${id}}$$`).replace(/\$\$([\s\S]+?)\$\$/g, (whole, tex) => {
			if (/\\label\{/.test(tex)) return `$$${tex.replace(/\\label\{([^}]*)\}/g, (_m, id) => `\\label{${note}::${id}}`)}$$`;
			return /\\begin\{(equation|align|gather|multline|eqnarray)\}/.test(tex) ? `$$${tex}\\label{${AUTO}}$$` : whole;
		});
	}
	/** The whole document numbered: each labelled display gets the next number (its own `\tag` kept, none for `\notag`),
	*  its labels go, and a link to it reads "(n)"; a link to a note not in the document reads "Note (n)" by that note's
	*  own numbers. A link to a figure reads "Figure n" by its note's numbering ("Note, Figure n" from another note). */
	async function numberEquations(md, read) {
		const byLabel = /* @__PURE__ */ new Map();
		const anchored = /* @__PURE__ */ new Set();
		let n = 0;
		md = md.replace(/\$\$([\s\S]+?)\$\$/g, (whole, tex) => {
			const labels = [...tex.matchAll(/\\label\{([^}]*)\}/g)].map((m) => m[1]);
			if (!labels.length) return whole;
			const own = /\\tag\*?\{([^}]*)\}/.exec(tex)?.[1];
			const num = own ?? (/\\(?:notag|nonumber)\b/.test(tex) ? null : String(++n));
			for (const l of labels) if (num && l !== AUTO) byLabel.set(l, num);
			let bare = num && !own ? numberedTex(tex.trimEnd(), num) : numberedTex(tex).trimEnd();
			if (num && !anchored.has(num)) {
				anchored.add(num);
				bare = bare.replace(/\\tag\*?\{[^}]*\}/, (t) => t + "");
			}
			return `$$${bare}\n$$`;
		});
		const elsewhere = /* @__PURE__ */ new Map();
		const refs = [...new Set([...md.matchAll(/\u0001([^\u0001]*)\u0001/g)].map((m) => m[1]))];
		const text = /* @__PURE__ */ new Map();
		for (const r of refs) {
			const own = r.startsWith("="), key = own ? r.slice(1) : r;
			const [note, id] = [key.slice(0, key.lastIndexOf("::")), key.slice(key.lastIndexOf("::") + 2)];
			const here = byLabel.get(key);
			if (here) {
				text.set(r, `${here}`);
				continue;
			}
			if (!elsewhere.has(note)) elsewhere.set(note, read(note).then((t) => noteEquations(t), () => void 0));
			const there = refOf(await elsewhere.get(note), id);
			const name = basename(note).replace(/\.md$/i, "");
			text.set(r, there ? linkText(own ? "" : name, there) : name);
		}
		return md.replace(/\u0001([^\u0001]*)\u0001/g, (_, r) => text.get(r) ?? "");
	}
	/** `fn` applied to the text between inline code spans. */
	const outsideInlineCode = (text, fn) => text.split(/(`+[^`\n]*?`+)/).map((p, i) => i % 2 ? p : fn(p)).join("");
	var Translator = class {
		vault;
		outDir;
		keys;
		cited = [];
		warnings = [];
		fences = [];
		byName = /* @__PURE__ */ new Map();
		fileSet;
		constructor(vault, outDir, keys) {
			this.vault = vault;
			this.outDir = outDir;
			this.keys = keys;
			this.fileSet = new Set(vault.files);
			for (const f of vault.files) {
				if (f.split("/").some((part) => part.startsWith("."))) continue;
				const k = basename(f).toLowerCase();
				this.byName.set(k, [...this.byName.get(k) ?? [], f]);
			}
		}
		/** What a note names, the Obsidian way: beside the note, from the vault's top, else the shortest path of that name. */
		find(name, near, ext = "") {
			name = name.trim();
			const candidates = [name, ...ext && !name.toLowerCase().endsWith(ext) ? [name + ext] : []];
			for (const c of candidates) for (const base of [near, ""]) {
				const p = normalize(base ? `${base}/${c}` : c);
				if (p !== null && this.fileSet.has(p)) return p;
			}
			for (const c of candidates) {
				const hits = this.byName.get(basename(c).toLowerCase());
				if (hits?.length) return [...hits].sort((a, b) => a.split("/").length - b.split("/").length)[0];
			}
			return null;
		}
		figure(target, opts, caption, near) {
			const img = this.find(target, near);
			if (!img) {
				this.warnings.push(`picture not found: ${target}`);
				return `*(${target})*`;
			}
			const vector = img.replace(/\.[^.]*$/, ".pdf");
			const src = !/\.pdf$/i.test(img) && this.fileSet.has(vector) ? vector : img;
			const px = opts.split("|").map((o) => /^\s*(\d+)(?:x\d+)?\s*$/.exec(o)).find(Boolean);
			const width = px ? `{width=${Math.min(100, Math.round(Number(px[1]) / 7))}%}` : "";
			caption = caption.trim().replace(/^(\*\*)?(Figure|Fig\.)\s*\d+[.:]?(\*\*)?\s*/, "");
			return `![${caption}](<${relative(this.outDir, src)}>)${width}`;
		}
		async transclude(target, near, depth) {
			const [name, section = ""] = target.split(/#(.*)/s);
			const note = this.find(name, near, ".md");
			if (!note || !note.toLowerCase().endsWith(".md")) {
				this.warnings.push(`embed left out: ${target}`);
				return `*(${target})*`;
			}
			if (depth >= 3) return `*(${name})*`;
			let [, body] = splitFrontmatter(await this.vault.read(note));
			if (section && !section.startsWith("^")) {
				const take = [];
				let level = 0;
				for (const line of body.split("\n")) {
					const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
					if (h && level && h[1].length <= level) break;
					if (h && !level && h[2].trim().toLowerCase() === section.trim().toLowerCase()) {
						level = h[1].length;
						continue;
					}
					if (level) take.push(line);
				}
				body = take.join("\n");
			}
			return this.body(body, dirname(note), depth + 1, note);
		}
		link(target, alias, near, note) {
			const eq = equationTarget(target);
			if (eq && !alias) {
				const path = eq[0] ? this.find(eq[0], near, ".md") : note;
				if (path) return `\u0001${eq[0] ? "" : "="}${path}::${eq[1]}\u0001`;
			}
			const name = target.split("#")[0].trim();
			const key = basename(name).replace(/\.md$/i, "");
			if (this.keys.has(key)) {
				if (!this.cited.includes(key)) this.cited.push(key);
				return `[@${key}]`;
			}
			if (alias) return alias;
			return name ? basename(name).replace(/\.md$/i, "") : target.split("#").slice(1).join("#").replace(/^\^/, "");
		}
		async prose(text, near, depth, note) {
			text = text.replace(/%%[\s\S]*?%%/g, "");
			text = text.replace(/!\[\[([^\]|#]+)((?:\\?\|[^\]]*)?)\]\]\n\n\*([^*\n][^\n]*?)\*\n/g, (_, t, o, c) => `${this.figure(t, o.replace(/^\\?\|/, ""), c, near)}\n`);
			const embeds = [];
			const inline = (t) => {
				t = mathPortable(qualifyLabels(t, note));
				t = t.replace(/!\[\[([^\]|]+)((?:\\?\|[^\]]*)?)\]\]/g, (_, target, o) => {
					target = target.trim();
					const opts = (o ?? "").replace(/^\\?\|/, "");
					if (IMAGE.test(target.split("#")[0])) return this.figure(target.split("#")[0], opts, "", near);
					embeds.push(this.transclude(target, near, depth));
					return `\n\n\u0000${embeds.length - 1}\u0000\n\n`;
				});
				t = t.replace(/\[\[([^\]|]+?)(?:\\?\|([^\]]+))?\]\]/g, (_, target, alias) => this.link(target.replace(/\\$/, ""), alias, near, note));
				return t.replace(/[ \t]\^[A-Za-z0-9-]+[ \t]*$/gm, "");
			};
			text = outsideInlineCode(text, inline);
			const done = await Promise.all(embeds);
			text = text.replace(/\u0000(\d+)\u0000/g, (_, i) => done[Number(i)]);
			text = text.replace(/^((?:>\s*)+)\[!(\w+)\][+-]?[ \t]*(.*)$/gm, (_, q, kind, title) => `${q}**${title.trim() || kind[0].toUpperCase() + kind.slice(1)}**\n${q.trimEnd()}`);
			return text.replace(/^([^\n\s>|-][^\n]*)\n(\s*(?:[-*+]|\d+[.)]) )/gm, "$1\n\n$2").replace(/^([^\n]*\S[^\n]*)\n(#{1,6}[ \t])/gm, "$1\n\n$2");
		}
		async body(md, near, depth = 0, note = "") {
			const parts = [];
			for (const [code, chunk, lang] of segments(md)) if (code && (lang === "tikz" || lang === "typst")) {
				const source = chunk.replace(/^[^\n]*\n/, "").replace(/\n?\s*(`{3,}|~{3,})\s*$/, "");
				this.fences.push({
					lang,
					source
				});
				parts.push(`\n<!--fence:${this.fences.length - 1}-->\n`);
			} else parts.push(code ? chunk : await this.prose(chunk, near, depth, note));
			return parts.join("");
		}
	};
	/** The note at `note` as pandoc Markdown for a document written in the folder `outDir`, citing the `keys` it links. */
	async function translate(vault, note, outDir, keys) {
		const [props, whole] = splitFrontmatter(await vault.read(note));
		let body = whole;
		const meta = {};
		for (const k of [
			"title",
			"subtitle",
			"author",
			"date"
		]) if (props[k]) meta[k] = props[k];
		const h1 = /^# (.+?)\s*#*\s*$/m.exec(body);
		if (!meta.title) {
			meta.title = h1 ? h1[1] : stem(note);
			if (h1) body = body.slice(0, h1.index) + body.slice(h1.index + h1[0].length);
		}
		const t = new Translator(vault, outDir, keys);
		return {
			meta,
			markdown: await numberEquations(await t.body(body, dirname(note), 0, note), (n) => vault.read(n)),
			cited: t.cited,
			warnings: t.warnings,
			fences: t.fences
		};
	}
	//#endregion
	//#region plugins/beta/export/helper/helper.ts
	const FORMATS = [
		"pdf-typst",
		"pdf-latex",
		"tex",
		"typ",
		"docx"
	];
	const EXT = {
		"pdf-typst": "pdf",
		"pdf-latex": "pdf",
		tex: "tex",
		typ: "typ",
		docx: "docx"
	};
	const ENGINES = {
		lualatex: "-lualatex",
		xelatex: "-xelatex",
		pdflatex: "-pdf"
	};
	const MARGINS = {
		narrow: "1.5cm",
		normal: "2.4cm",
		wide: "3.2cm"
	};
	/** The citation styles offered, in each road's own names. */
	const STYLES = {
		numeric: {
			biblatex: "numeric-comp",
			typst: "ieee"
		},
		"author-year": {
			biblatex: "authoryear",
			typst: "chicago-author-date"
		},
		alphabetic: {
			biblatex: "alphabetic",
			typst: "alphanumeric"
		},
		physics: {
			biblatex: "phys",
			typst: "american-physics-society"
		}
	};
	const CACHE = ".atlas/cache/plugins/export";
	/** Where the dialog leaves a ```tikz picture drawn by the page's TeX (`atlas.tikz.png`), by its key. */
	const tikzPng = (key) => `${CACHE}/figures/${key}.png`;
	/** A fence's key: the hash of its source, the same for the dialog (from `describe`) and the road. */
	const keyOf = (source) => atlas.hash.sha256(source).slice(0, 16);
	const PLUGIN = ".atlas/plugins/export";
	/** The LaTeX road's layouts: `plain` is pandoc's article; `article` a KOMA article set for reading (microtype, a
	*  little more leading, dark-coloured links, paragraphs spaced, not indented); `chapter` a KOMA report whose top
	*  headings are chapters, numbered, with a table of contents. */
	const LAYOUTS = {
		plain: {
			meta: {},
			header: [],
			args: []
		},
		article: {
			meta: {
				documentclass: "scrartcl",
				classoption: ["parskip=half"],
				linestretch: 1.1,
				linkcolor: "blue!40!black",
				urlcolor: "blue!40!black",
				citecolor: "green!30!black"
			},
			header: ["\\usepackage{microtype}", "\\addtokomafont{disposition}{\\rmfamily}"],
			args: []
		},
		chapter: {
			meta: {
				documentclass: "scrreprt",
				classoption: ["parskip=half", "open=any"],
				linestretch: 1.1,
				numbersections: true,
				toc: true,
				"toc-depth": 2,
				linkcolor: "blue!40!black",
				urlcolor: "blue!40!black",
				citecolor: "green!30!black"
			},
			header: ["\\usepackage{microtype}", "\\addtokomafont{disposition}{\\rmfamily}"],
			args: ["--top-level-division=chapter"]
		}
	};
	const layoutOf = (o) => LAYOUTS[o.layout ?? "plain"] ?? LAYOUTS.plain;
	const progress = (stage, text) => atlas.event("progress", {
		stage,
		text
	});
	/** Runs a program the manifest names; its output, or why not (with its last error lines). */
	async function run(program, args, opts = {}) {
		return await atlas.exec(program, args, {
			...opts,
			timeout: opts.timeout ?? 120
		}).catch((e) => {
			throw new Error(/not installed/.test(e.message) ? `${program} is not installed on the machine running Atlas` : e.message);
		});
	}
	/** Which formats work here: pandoc for all, latexmk for the LaTeX PDF; Typst is in the core. */
	async function formats() {
		const has = async (p, flag) => await run(p, [flag], { timeout: 20 }).then((r) => r.status === 0, () => false);
		const [pandoc, latexmk] = await Promise.all([has("pandoc", "--version"), has("latexmk", "-v")]);
		const need = (ok, what) => ok ? {} : { needs: what };
		return [
			{
				id: "pdf-typst",
				label: "PDF (Typst)",
				ok: pandoc,
				...need(pandoc, "pandoc")
			},
			{
				id: "pdf-latex",
				label: "PDF (LaTeX)",
				ok: pandoc && latexmk,
				...need(pandoc && latexmk, pandoc ? "latexmk (a TeX distribution)" : "pandoc and a TeX distribution")
			},
			{
				id: "tex",
				label: "LaTeX source (.tex)",
				ok: pandoc,
				...need(pandoc, "pandoc")
			},
			{
				id: "typ",
				label: "Typst source (.typ)",
				ok: pandoc,
				...need(pandoc, "pandoc")
			},
			{
				id: "docx",
				label: "Word (.docx)",
				ok: pandoc,
				...need(pandoc, "pandoc")
			}
		];
	}
	/** The .bib the citations come from: the setting's, else refs/refs.bib, else the first at the top or in refs/. */
	function findBib(files, setting) {
		const s = setting.trim().replace(/^\/+/, "");
		if (s) return files.includes(s) ? s : null;
		const bibs = files.filter((f) => f.endsWith(".bib")).sort();
		return bibs.find((f) => f === "refs/refs.bib") ?? bibs.find((f) => !f.includes("/")) ?? bibs.find((f) => /^refs\/[^/]+$/.test(f)) ?? null;
	}
	async function prepare(params, preview) {
		const rel = String(params.path ?? "").trim().replace(/^\/+/, "");
		if (!/\.md$/i.test(rel)) throw new Error(`not a note: ${rel}`);
		const o = {
			...params.settings ?? {},
			...params.options ?? {}
		};
		const folder = String(o.folder ?? "exports").trim().replace(/^\/+|\/+$/g, "") || "exports";
		const outDir = [preview ? `${CACHE}/preview` : folder, dirname(rel)].filter(Boolean).join("/");
		const files = await atlas.files();
		const bib = findBib(files, String(o.bibliography ?? ""));
		const keys = bib ? bibKeys(await atlas.read(bib)) : /* @__PURE__ */ new Set();
		progress("translate", `reading ${rel}`);
		const t = await translate({
			files,
			read: (p) => atlas.read(p)
		}, rel, outDir, keys);
		if (t.cited.length && !bib) t.warnings.push("papers are cited but no .bib was found (the Bibliography option)");
		const stem = rel.slice(rel.lastIndexOf("/") + 1).replace(/\.md$/i, "");
		const figures = {};
		for (const [k, w] of Object.entries(params.figures ?? {})) if (/^[0-9a-f]{16}$/.test(k) && Number(w) > 0) figures[k] = Number(w);
		return {
			rel,
			outDir,
			stem,
			o,
			files,
			bib,
			t,
			figures
		};
	}
	/** The pandoc metadata block every road starts from: the title block, the page, the bibliography. */
	function metadata(j, road, header) {
		const { o, t } = j;
		const m = { ...t.meta };
		for (const k of [
			"title",
			"subtitle",
			"author",
			"date"
		]) if (o[k] !== void 0) m[k] = o[k] || void 0;
		m.lang = o.lang || "en";
		if (o.font) m.mainfont = o.font;
		const margin = MARGINS[o.margins ?? "normal"] ?? MARGINS.normal;
		const paper = o.paper === "letter" ? "letter" : "a4";
		if (road === "latex") {
			Object.assign(m, {
				papersize: paper,
				fontsize: o.fontsize || "11pt",
				geometry: `margin=${margin}`,
				colorlinks: true
			}, layoutOf(o).meta);
			if (Number(o.columns) === 2) m.classoption = [...m.classoption ?? [], "twocolumn"];
		} else if (road === "typst") {
			m.mainfont ??= "Libertinus Serif";
			Object.assign(m, {
				papersize: paper === "letter" ? "us-letter" : "a4",
				fontsize: o.fontsize || "11pt",
				margin: {
					x: margin,
					y: margin
				},
				columns: Number(o.columns) === 2 ? 2 : 1,
				"page-numbering": "1"
			});
		}
		if (o.toc) Object.assign(m, {
			toc: true,
			"toc-depth": 3
		});
		if (o.numbered) m[road === "typst" ? "section-numbering" : "numbersections"] = road === "typst" ? "1.1" : true;
		if (j.bib && t.cited.length) {
			m.bibliography = road === "docx" ? j.bib : relative(j.outDir, j.bib);
			const style = STYLES[o.style ?? "numeric"] ?? STYLES.numeric;
			if (road === "latex") m["biblio-style"] = style.biblatex;
			if (road === "typst") m.bibliographystyle = style.typst;
		}
		if (header.length) m["header-includes"] = header;
		return `---\n${Object.entries(m).filter(([, v]) => v !== void 0).map(([k, v]) => yamlEntry(k, v)).join("\n")}\n---\n\n${road === "latex" ? "" : `${macroDefinitions("newcommand")}\n\n`}`;
	}
	/** One metadata line. JSON is YAML (every value quoted as it is), except text of several lines: pandoc reads a quoted
	*  scalar as inline Markdown, which turns a ```{=latex} block (the preamble's header-includes) into inline code before
	*  \begin{document}. Those go as literal block scalars, which pandoc reads as blocks. */
	function yamlEntry(k, v) {
		const block = (t, pad) => `|\n${t.split("\n").map((l) => pad + l).join("\n")}`;
		if (typeof v === "string" && v.includes("\n")) return `${k}: ${block(v, "  ")}`;
		if (Array.isArray(v) && v.some((x) => typeof x === "string" && x.includes("\n"))) return `${k}:\n${v.map((x) => `- ${typeof x === "string" && x.includes("\n") ? block(x, "    ") : JSON.stringify(x)}`).join("\n")}`;
		return `${k}: ${JSON.stringify(v)}`;
	}
	/** The fences put back for a road: raw source, a compiled picture, or the code with a warning. */
	async function fences(j, road) {
		const out = [];
		for (const [i, f] of j.t.fences.entries()) if (f.lang === "typst" && road === "typst") out[i] = "```{=typst}\n" + f.source + "\n```";
		else if (f.lang === "tikz" && road === "latex") out[i] = "```tikz\n" + f.source + "\n```";
		else if (f.lang === "typst" && road === "latex") {
			const pdf = `${CACHE}/figures/${keyOf(f.source)}.pdf`;
			atlas.convert.typstPdf(`${dirname(j.rel) || "."}/.fence.typ`, pdf, {
				source: f.source,
				fence: true
			});
			out[i] = `![](<${relative(j.outDir, pdf)}>)`;
		} else if (f.lang === "tikz" && j.figures[keyOf(f.source)]) out[i] = `![](<${relative(j.outDir, tikzPng(keyOf(f.source)))}>){width=${j.figures[keyOf(f.source)].toFixed(1)}pt}`;
		else {
			j.t.warnings.push(`a ${f.lang} picture is left as code: ${f.lang === "tikz" ? "the TeX in the page did not draw it" : "Word has no Typst"}`);
			out[i] = "```" + f.lang + "\n" + f.source + "\n```";
		}
		const md = equationMarks(j.t.markdown, road).replace(/<!--fence:(\d+)-->/g, (_, n) => out[Number(n)]);
		return /^# /m.test(md) || !/^## /m.test(md) ? md : md.replace(/^#(#+ )/gm, "$1");
	}
	/** The equation numbers `numberEquations` wrote (translate.ts `ANCHOR`, `REF`), for a road. LaTeX keeps `\tag`, labels
	*  the display and links with `\eqref`. pandoc's Typst and Word writers drop `\tag`, so there the number is written
	*  beside the formula; Typst labels it `<eq-n>` and links to the label (`#link`, not `@eq-n`: a reference needs Typst's
	*  own equation numbering, which would number every display); Word has the plain numbers. */
	function equationMarks(md, road) {
		const label = (n) => `eq-${n.replace(/[^A-Za-z0-9_.:-]/g, "-")}`;
		const text = (n, star) => star ? n : `(${n})`;
		md = md.replace(/\$\$([\s\S]+?)\$\$/g, (whole, tex) => {
			let anchor = "";
			const t = tex.replace(/\\tag(\*?)\{([^}]*)\}(\u0005?)/g, (tag, star, n, a) => {
				if (road === "latex") return a ? `${tag.slice(0, -1)}\\label{${label(n)}}` : tag;
				if (a && road === "typst") anchor = "`<" + label(n) + ">`{=typst}";
				return `\\qquad\\text{${text(n, !!star)}}`;
			});
			return t === tex ? whole : `$$${t}$$${anchor}`;
		});
		return md.replace(/\u0006([^\u0006]*)\u0006/g, (_, n) => road === "latex" ? "`\\eqref{" + label(n) + "}`{=latex}" : road === "typst" ? "`#link(<" + label(n) + ">)[" + text(n, false).replace(/[\\#*_`$<>@\[\]]/g, "\\$&") + "]`{=typst}" : text(n, false));
	}
	const MD = "markdown+mark-implicit_figures+implicit_figures";
	async function pandoc(j, to, input, extra = [], output) {
		progress("pandoc", `writing ${output ?? to}`);
		const r = await run("pandoc", [
			"-f",
			MD,
			"-t",
			to,
			"-s",
			...extra,
			...output ? ["-o", output] : []
		], { stdin: input });
		if (r.status !== 0) throw new Error(`pandoc failed: ${(r.stderr || r.stdout).trim().slice(-2e3)}`);
		return r.stdout;
	}
	/** The lines LaTeX marks as errors, with the two after each. */
	function latexErrors(log) {
		const lines = log.split("\n");
		const picked = lines.flatMap((l, i) => l.startsWith("!") || /^\S+\.tex:\d+:/.test(l) ? [i] : []);
		return [...new Set(picked.flatMap((i) => [
			i,
			i + 1,
			i + 2
		].filter((k) => k < lines.length)))].sort((a, b) => a - b).map((k) => lines[k]).join("\n").slice(-3e3) || lines.slice(-30).join("\n");
	}
	async function typstRoad(j, format) {
		const typ = await pandoc(j, "typst", metadata(j, "typst", (j.o.typstPreamble ? [await atlas.read(j.o.typstPreamble).catch(() => {
			j.t.warnings.push(`Typst preamble not found: ${j.o.typstPreamble}`);
			return "";
		})] : []).filter(Boolean).map((h) => "```{=typst}\n" + h + "\n```")) + await fences(j, "typst"));
		const at = `${j.outDir}/${j.stem}.typ`;
		if (format === "typ") {
			await atlas.write(at, typ);
			return at;
		}
		progress("typst", "compiling the PDF with Typst");
		return atlas.convert.typstPdf(at, `${j.outDir}/${j.stem}.pdf`, { source: typ });
	}
	async function latexRoad(j, format) {
		const header = ["```{=latex}\n" + ["\\usepackage{soul}", ...layoutOf(j.o).header].join("\n") + "\n```"];
		if (j.o.preamble) {
			if (j.files.includes(j.o.preamble)) header.push("```{=latex}\n\\input{" + relative(j.outDir, j.o.preamble) + "}\n```");
			else j.t.warnings.push(`LaTeX preamble not found: ${j.o.preamble}`);
		}
		header.push("```{=latex}\n" + macroDefinitions("providecommand") + "\n```");
		const extra = [
			"--lua-filter",
			`${PLUGIN}/tikz.lua`,
			...layoutOf(j.o).args,
			...j.t.cited.length && j.bib ? ["--biblatex"] : []
		];
		const tex = await pandoc(j, "latex", metadata(j, "latex", header) + await fences(j, "latex"), extra);
		const at = `${j.outDir}/${j.stem}.tex`;
		await atlas.write(at, tex);
		if (format === "tex") return [at];
		const engine = String(j.o.engine || "lualatex");
		const buildDir = `${CACHE}/build/${j.rel.replace(/[^\w.-]+/g, "_")}`;
		const build = relative(j.outDir, buildDir);
		progress("latex", `compiling with ${engine} (latexmk; biber for the references)`);
		const r = await run("latexmk", [
			ENGINES[engine] ?? "-lualatex",
			"-interaction=nonstopmode",
			"-halt-on-error",
			"-file-line-error",
			"-emulate-aux-dir",
			`-auxdir=${build}`,
			"-outdir=.",
			`./${j.stem}.tex`
		], {
			cwd: j.outDir,
			timeout: 600
		});
		if (r.status !== 0) {
			const log = await atlas.read(`${buildDir}/${j.stem}.log`).catch(() => r.stdout);
			throw new Error(`LaTeX failed on ${at}:\n${latexErrors(log)}`);
		}
		return [at, `${j.outDir}/${j.stem}.pdf`];
	}
	async function docxRoad(j) {
		const out = `${j.outDir}/${j.stem}.docx`;
		await atlas.write(out, "");
		const cite = j.t.cited.length && j.bib ? ["--citeproc"] : [];
		await pandoc(j, "docx", metadata(j, "docx", []) + await fences(j, "docx"), [...cite, `--resource-path=${j.outDir}`], out);
		return out;
	}
	/** Old callers (Print) say `to: "pdf" | "tex"`: the PDF road the settings chose, or LaTeX source. */
	function formatOf(params) {
		const f = String(params.format ?? "");
		if (FORMATS.includes(f)) return f;
		if (params.to === "tex") return "tex";
		return String(params.settings?.format ?? "") === "pdf-latex" ? "pdf-latex" : "pdf-typst";
	}
	async function exportNote(params) {
		const format = formatOf(params);
		const j = await prepare(params, params.preview === true);
		let written;
		if (format === "pdf-typst" || format === "typ") written = [await typstRoad(j, format)];
		else if (format === "pdf-latex" || format === "tex") written = await latexRoad(j, format);
		else written = [await docxRoad(j)];
		progress("done", written.join(", "));
		return {
			written,
			format,
			pdf: written.find((w) => w.endsWith(".pdf")) ?? null,
			cited: j.t.cited,
			warnings: j.t.warnings
		};
	}
	/** What the dialog shows before anything is made: the title block, whether papers are cited, which pictures. */
	async function describe(params) {
		const j = await prepare({
			...params,
			options: {}
		}, true);
		const tikz = j.t.fences.filter((f) => f.lang === "tikz").map((f) => ({
			key: keyOf(f.source),
			source: f.source,
			png: tikzPng(keyOf(f.source))
		}));
		return {
			meta: j.t.meta,
			cited: j.t.cited,
			bib: j.bib,
			fences: j.t.fences.map((f) => f.lang),
			tikz,
			warnings: j.t.warnings,
			ext: EXT
		};
	}
	atlas.methods({
		formats,
		describe,
		export: exportNote
	});
	//#endregion
	exports.LAYOUTS = LAYOUTS;
	exports.equationMarks = equationMarks;
	exports.latexErrors = latexErrors;
	exports.layoutOf = layoutOf;
	exports.tikzPng = tikzPng;
	exports.yamlEntry = yamlEntry;
	return exports;
})({});
