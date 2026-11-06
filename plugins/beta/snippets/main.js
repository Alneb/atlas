//#region \0rolldown/runtime.js
var e = Object.defineProperty, t = (t, n) => {
	let r = {};
	for (var i in t) e(r, i, {
		get: t[i],
		enumerable: !0
	});
	return n || e(r, Symbol.toStringTag, { value: "Module" }), r;
}, n = (e) => Array.isArray(e) ? e : [e], r = (e, t, r, i = {}, a = !1) => ({
	type: "snippet",
	triggers: n(e),
	body: t,
	where: r,
	visual: a,
	options: i
}), i = {
	math: (e, t, n = {}) => r(e, t, [{
		kind: "math",
		form: n.form,
		inTextArg: n.inTextArg
	}], n),
	text: (e, t, n = {}) => r(e, t, [{ kind: "text" }], n),
	code: (e, t, n, i = {}) => {
		let a = (Array.isArray(e) ? e : [e]).map((e) => e.toLowerCase());
		return r(t, n, [{
			kind: "code",
			lang: a.includes("*") ? void 0 : a
		}], i);
	},
	visual: (e, t, n = {}) => r(e, t, [{
		kind: "math",
		form: n.form,
		inTextArg: n.inTextArg
	}], n, !0),
	anywhere: (e, t, n, i = {}) => r(t, n, e, i),
	commands: (e, t = {}) => ({
		type: "commands",
		names: e,
		digit: t.digit ?? "none"
	}),
	words: (e) => ({
		type: "words",
		words: e
	}),
	option: (e, t, n, r = {}) => ({
		type: "option",
		id: e.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
		title: e,
		description: t,
		on: r.on ?? !0,
		entries: n.flat(Infinity)
	}),
	vars: (e) => ({
		type: "vars",
		vars: e
	})
}, a = (e, t) => Object.entries(t).reduce((e, [t, n]) => e.split(t.startsWith("${") ? t : `\${${t}}`).join(n), e);
function o(e) {
	let t = e.replace(/[.+^$()|[\]{}\\]/g, "\\$&").replace(/\*\*\/?/g, "\0").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*");
	return RegExp(`^${t}$`);
}
function s(e, t, n, r) {
	let i = t.options, s = i.regex || e instanceof RegExp, c = null, l = null;
	if (s) {
		let t = e instanceof RegExp ? e.source : a(e, n);
		c = RegExp(`(?:${t})$`, e instanceof RegExp ? e.flags.replace(/[gy]/g, "") : "");
	} else if (l = a(String(e), n), !l) throw Error("an empty trigger");
	let u = t.where.find((e) => e.kind === "math"), d = t.where.find((e) => e.kind === "code");
	return {
		plain: l,
		regex: c,
		body: t.body,
		priority: i.priority ?? 0,
		word: !!i.word,
		visual: t.visual || typeof t.body == "string" && t.body.includes("${VISUAL}"),
		auto: i.auto ?? !!u,
		text: t.where.some((e) => e.kind === "text"),
		code: !!d,
		langs: d?.lang ?? null,
		math: !!u,
		display: !!u && u.form !== "inline",
		inline: !!u && u.form !== "display",
		inTextArg: !!u?.inTextArg,
		legacyStops: !!i.legacyStops,
		when: i.when,
		files: i.file ? (Array.isArray(i.file) ? i.file : [i.file]).map(o) : null,
		name: i.name,
		note: i.note,
		test: i.test,
		source: r,
		shown: String(e),
		key: ""
	};
}
var c = (e) => e.replace(/\$\{VISUAL\}/g, "x").replace(/\$\{\d+:((?:[^{}]|\{[^{}]*\})*)\}/g, "$1").replace(/\$\{\d+\}|\$\d+/g, "\\square "), l = (e) => [...new Set(e)].sort((e, t) => t.length - e.length).map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
function u(e, t) {
	let n = l(e.names);
	if (!n) return [];
	let r = (e, n, r, i) => ({
		plain: null,
		regex: e,
		body: n,
		auto: !0,
		word: !1,
		priority: 0,
		visual: !1,
		text: !1,
		code: !1,
		langs: null,
		math: !0,
		display: !0,
		inline: !0,
		inTextArg: !1,
		legacyStops: !1,
		files: null,
		name: i,
		source: t,
		shown: r,
		key: ""
	}), i = [r(RegExp(`(^|[^\\\\])(${n})$`), "[[0]]\\[[1]]", `${e.names.length} commands, bare`, "A command's backslash"), r(RegExp(`\\\\(${n})([A-Za-z])$`), "\\[[0]] [[1]]", `${e.names.length} commands + letter`, "A space after a command")];
	return e.digit === "space" && i.push(r(RegExp(`\\\\(${n})(\\d)$`), "\\[[0]] [[1]]", `${e.names.length} commands + digit`, "A space before a number")), e.digit === "subscript" && i.push(r(RegExp(`\\\\(${n})(\\d)$`), "\\[[0]]_{[[1]]}", `${e.names.length} commands + digit`, "A digit as a subscript")), i;
}
var d = (e) => `${e.source}|${e.shown}|${[
	e.math && (e.display ? "D" : "") + (e.inline ? "I" : ""),
	e.text && "t",
	e.code && "c",
	e.visual && "v"
].filter(Boolean).join("")}`;
function f(e, t = /* @__PURE__ */ new Set()) {
	let n = {}, r = (e) => {
		for (let t of e) t?.type === "vars" ? Object.assign(n, t.vars) : t?.type === "option" && r(t.entries);
	};
	for (let t of e) r(t.entries);
	let i = [], a = [], o = [], c = [], l = [], f = [], h = (e, r, a) => {
		for (let p of e) {
			if (!p || typeof p != "object" || !("type" in p)) {
				c.push({
					source: r,
					what: `not an entry: ${JSON.stringify(p)?.slice(0, 60)}`
				});
				continue;
			}
			if (p.type === "vars") continue;
			if (p.type === "words") {
				o.push(...p.words.map((e) => e.toLowerCase()));
				continue;
			}
			if (p.type === "option") {
				let e = p.on !== t.has(`option:${p.id}`), n = i.length;
				h(p.entries, r, e ? p.id : `!${p.id}`), l.push({
					id: p.id,
					title: p.title,
					description: p.description,
					on: e,
					source: r,
					count: i.length - n
				});
				continue;
			}
			let e = (e) => {
				e.option = a?.replace(/^!/, ""), e.key = d(e), i.push(e);
			};
			if (p.type === "commands") {
				let n = u(p, r);
				n.forEach(e);
				let i = !a?.startsWith("!") && n.some((e) => !t.has(e.key));
				f.push(...p.names.map((e) => ({
					name: e,
					source: r,
					on: i
				})));
				continue;
			}
			for (let t of p.triggers) try {
				e(s(t, p, n, r));
			} catch (e) {
				c.push({
					source: r,
					what: `${String(t)}: ${String(e.message ?? e)}`
				});
			}
		}
	};
	for (let t of e) h(t.entries, t.source);
	let g = new Set(l.filter((e) => !e.on).map((e) => e.id)), _ = i.filter((e) => !(e.option && g.has(e.option)) && !t.has(e.key));
	for (let e of f) e.on && a.push(e.name);
	for (let e of Object.values(n)) a.push(...String(e).split("|").filter((e) => /^[A-Za-z]{2,}$/.test(e)));
	let v = _.map((e, t) => [e, t]).sort((e, t) => t[0].priority - e[0].priority || e[1] - t[1]).map(([e]) => e);
	v.push(...m(v, new Set(a)), ...p(f.filter((e) => e.on), v, new Set(a)));
	for (let e of v) e.plain && !e.alias && /^[A-Za-z]{2,}$/.test(e.plain) && a.push(e.plain);
	return {
		snippets: v,
		all: i,
		options: l,
		known: [...new Set(a)],
		words: o,
		problems: c
	};
}
function p(e, t, n) {
	let r = e.map((e) => e.name).filter((e) => /^[A-Za-z]+$/.test(e)), i = /* @__PURE__ */ new Set([...n, ...t.flatMap((e) => e.plain ? [e.plain] : [])]), a = (e, n) => r.some((t) => t !== n && t.startsWith(e)) || t.some((t) => t.math && !!t.plain && t.plain !== e && t.plain.startsWith(e)), o = (e, t, n, r) => ({
		plain: e,
		regex: null,
		body: `\\${t}`,
		auto: !0,
		word: !1,
		priority: -1,
		visual: !1,
		text: !1,
		code: !1,
		langs: null,
		math: !0,
		display: !0,
		inline: !0,
		inTextArg: !1,
		legacyStops: !1,
		files: null,
		name: `\\${t}`,
		source: n,
		shown: e,
		alias: !0,
		typo: r,
		key: ""
	}), s = [], c = /* @__PURE__ */ new Set(), l = (e, t, n, r = !1) => {
		!i.has(e) && !c.has(e) && (c.add(e), s.push(o(e, t, n, r)));
	};
	for (let { name: t, source: n } of e) {
		if (!/^[A-Za-z]{4,}$/.test(t)) continue;
		for (let e = t.length - 1; e >= 3; e--) {
			let r = t.slice(0, e);
			if (i.has(r) || a(r, t)) break;
			l(r, t, n);
		}
		let e = (e) => !a(e, t) && !r.includes(e) && !t.startsWith(e) && ![...Array(e.length - 2).keys()].some((t) => i.has(e.slice(0, t + 2)) || r.includes(e.slice(0, t + 2)));
		for (let r = 1; r + 1 < t.length; r++) {
			if (t[r] === t[r + 1]) continue;
			let i = t.slice(0, r) + t[r + 1] + t[r] + t.slice(r + 2);
			e(i) && l(i, t, n, !0);
		}
		if (t.length >= 5) for (let r = 1; r + 1 < t.length; r++) {
			let i = t.slice(0, r) + t.slice(r + 1);
			e(i) && l(i, t, n, !0);
		}
	}
	return s;
}
function m(e, t) {
	let n = e.filter((e) => e.math && !e.text && e.auto && !e.regex && !!e.plain && /^[A-Za-z]{4,}$/.test(e.plain)), r = /* @__PURE__ */ new Set([...t, ...e.flatMap((e) => e.plain ? [e.plain] : [])]), i = [];
	for (let e of n) for (let t = e.plain.length - 1; t >= 3; t--) {
		let a = e.plain.slice(0, t);
		if (r.has(a) || n.some((t) => t !== e && t.plain.startsWith(a))) break;
		i.push({
			...e,
			plain: a,
			shown: a,
			priority: e.priority - 1,
			alias: !0
		});
	}
	return i;
}
function h(e) {
	let t = e;
	return /^\s*(#|---)/.test(t) && (t = /```(?:js|javascript|json)?\s*([\s\S]*?)```/.exec(t)?.[1] ?? t), t = t.replace(/^\s*import\b[^\n;]*;?\s*$/gm, "").trim(), t = t.replace(/^(?:export\s+default\s+|(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)/, ""), t = t.replace(/;?\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/, "").trim().replace(/;\s*$/, ""), Function(`return (${t});`)();
}
function g(e) {
	if (!e || e.trigger == null || e.replacement == null) return null;
	let t = String(e.options ?? ""), n = [];
	return t.includes("t") && n.push({ kind: "text" }), t.includes("c") && n.push({ kind: "code" }), (t.includes("m") || t.includes("M") || t.includes("n") || !n.length) && n.push({
		kind: "math",
		form: t.includes("M") ? "display" : t.includes("n") ? "inline" : void 0
	}), r(e.trigger, e.replacement, n, {
		auto: t.includes("A"),
		word: t.includes("w"),
		regex: t.includes("r"),
		priority: e.priority,
		name: e.description,
		legacyStops: !0
	});
}
function _(e) {
	let t = [], n = [], r = "the old snippet file";
	if (e.variables.trim()) try {
		t.push(i.vars(h(e.variables)));
	} catch (e) {
		n.push({
			source: "the old variables file",
			what: String(e)
		});
	}
	for (let i of e.sources) try {
		let e = h(i);
		if (Array.isArray(e)) for (let n of e) {
			let e = g(n);
			e && t.push(e);
		}
	} catch (e) {
		n.push({
			source: r,
			what: `could not be read: ${String(e)}`
		});
	}
	return {
		source: r,
		entries: t,
		problems: n
	};
}
//#endregion
//#region plugins/beta/snippets/ui/src/convert.ts
function v(e) {
	let t = [...e.matchAll(/\$\{?(\d+)/g)].map((e) => Number(e[1]));
	if (!t.length) return e;
	let n = Math.max(...t), r = RegExp(`\\$${n}$`).test(e) && !RegExp(`\\$\\{${n}\\b`).test(e) && t.filter((e) => e === n).length === 1;
	return e.replace(/\$(\{?)(\d+)/g, (e, t, i) => {
		let a = Number(i);
		return `$${t}${r && a === n ? 0 : a + 1}`;
	});
}
var y = (e) => e instanceof RegExp ? String(e) : e, b = /* @__PURE__ */ new Map([
	["([A-Z])T", "turned UT, NT and k_BT into transposes; ^{\\top} is not used in the notes"],
	["=d", "turned x=d into x\\Downarrow; never used"],
	["=u", "turned v=u into v\\Uparrow; never used"],
	["u=d", "never used"],
	["d=u", "never used"],
	["and", "turned band into b\\cap; never used"],
	["_([a-zA-Z0-9]{2,})", "could not fire: _ has already become _{"],
	["/([A-Za-z])_(\\d\\d)/", "could not fire: _ has already become _{"],
	["\\leq>", "a chain through <=; <=> is its own trigger"]
]), x = /* @__PURE__ */ new Set([
	"([^\\\\])(${GREEK}|${SYMBOL}|${MORE_SYMBOLS})",
	"\\\\(${GREEK}|${SYMBOL}|${MORE_SYMBOLS})([A-Za-z])",
	"/([^\\\\])(exp|log|ln)/",
	"/([^\\\\])(det)/",
	"/([^\\\\])(arcsin|sin|arccos|cos|arctan|tan|csc|sec|cot)/",
	"/\\\\(arcsin|sin|arccos|cos|arctan|tan|csc|sec|cot)([A-Za-gi-z])/",
	"/\\\\(sinh|cosh|tanh|coth)([A-Za-z])/"
]), S = "arcsin arccos arctan arccot arccsc arcsec sin cos tan cot csc sec sinh cosh tanh coth sech csch exp log ln det".split(" "), C = new Set("mV Vol kV VA kVA MVA VAR kVAR mW WATT kW uA mA Amp mOhm Ohm kOhm MOhm PU PF dB".split(" ")), w = [
	{
		when: (e) => e.trigger === "\\xii",
		to: (e) => ({
			...e,
			trigger: "xii"
		}),
		why: "xii is its own trigger, not a chain through \\xi"
	},
	{
		when: (e) => e.trigger === "e\\xi sts",
		to: (e) => ({
			...e,
			trigger: "exists"
		}),
		why: "a trigger written from what a chain produced"
	},
	{
		when: (e) => e.trigger === "k_{\\mbox{\\tiny B}} t",
		to: (e) => ({
			...e,
			trigger: "kbt"
		}),
		why: "a trigger written from what a chain produced"
	},
	{
		when: (e) => e.trigger === "=>" && e.replacement === "\\geq",
		to: () => null,
		why: "hid the arrow; >= gives \\geq"
	},
	{
		when: (e) => e.trigger === "=<" && e.replacement === "\\leq",
		to: () => null,
		why: "hid the arrow; <= gives \\leq"
	}
], T = (e) => JSON.stringify(e);
function ee(e) {
	let t = /* @__PURE__ */ new Map(), n = 0, r = [];
	for (let i of e.split("\n")) {
		let e = i.trim();
		if (e.startsWith("//")) {
			r.push(e);
			continue;
		}
		/\btrigger\s*:/.test(e.replace(/\/\/.*$/, "")) && (r.length && t.set(n, r), r = [], n++);
	}
	return {
		before: t,
		end: r
	};
}
function E(e) {
	let t = String(e.options ?? ""), n = e.trigger instanceof RegExp || t.includes("r"), r = e.trigger instanceof RegExp ? String(e.trigger) : T(String(e.trigger)), i = typeof e.replacement == "function", a = i ? String(e.replacement) : T(v(String(e.replacement))), o = [];
	n && !(e.trigger instanceof RegExp) && o.push("regex: true"), i && o.push("legacyStops: true"), t.includes("w") && o.push("word: true"), e.priority && o.push(`priority: ${e.priority}`), e.description && o.push(`name: ${T(e.description)}`);
	let s = t.includes("t"), c = t.includes("c"), l = t.includes("m") || t.includes("M") || t.includes("n") || !s && !c;
	t.includes("M") && o.push("form: \"display\""), t.includes("n") && o.push("form: \"inline\"");
	let u = t.includes("A");
	if (l && !s && !c) return u || o.push("auto: false"), `${typeof e.replacement == "string" && e.replacement.includes("${VISUAL}") ? "visual" : "math"}(${r}, ${a}${o.length ? `, { ${o.join(", ")} }` : ""}),`;
	if (s && !l && !c) return u && o.push("auto: true"), `text(${r}, ${a}${o.length ? `, { ${o.join(", ")} }` : ""}),`;
	let d = [
		s && "{ kind: \"text\" }",
		c && "{ kind: \"code\" }",
		l && "{ kind: \"math\" }"
	].filter(Boolean).join(", ");
	return o.push(`auto: ${u}`), `anywhere([${d}], ${r}, ${a}, { ${o.join(", ")} }),`;
}
function D(e) {
	let t = [], n = [], r = 0, i = !1, a = !1, o = e.variables.trim() ? h(e.variables) : {}, s = (e) => (o[`\${${e}}`] ?? "").split("|").filter(Boolean);
	for (let o of e.sources) {
		let e = h(o);
		if (!Array.isArray(e)) continue;
		let { before: c, end: l } = ee(o);
		e.forEach((e, o) => {
			for (let e of c.get(o) ?? []) t.push(`  ${e}`);
			let l = e;
			for (let e of w) if (l && e.when(l)) {
				let t = y(l.trigger);
				l = e.to(l), n.push(`${t}: ${e.why}`);
			}
			if (!l || l.trigger == null || l.replacement == null) return;
			let u = y(l.trigger);
			if (b.has(u)) {
				n.push(`${u}: ${b.get(u)}`);
				return;
			}
			if (x.has(u)) {
				i || (i = !0, n.push("the spacing regexes: one rule, in two commands(...) lines"), t.push("  // the automatic spacing: a bare name gets its backslash, a letter after a command a space"), t.push(`  commands(${JSON.stringify(s("GREEK"))}, { digit: "subscript" }),`), t.push(`  commands(${JSON.stringify([.../* @__PURE__ */ new Set([
					...s("SYMBOL"),
					...s("MORE_SYMBOLS"),
					...S
				])])}, { digit: "space" }),`));
				return;
			}
			if (typeof l.trigger == "string" && C.has(l.trigger)) {
				t.push(`  // off, in options.units() below: ${E(l)}`), a = !0, r++;
				return;
			}
			if (l.trigger === "-d" || l.trigger === "-u") {
				t.push(`  ${E(l).replace(/\),$/, ", { when: (at) => !/[A-Za-z0-9})]$/.test(at.before) }),")}`), n.push(`${l.trigger}: not after an operand, so a-d stays a subtraction`), r++;
				return;
			}
			String(l.trigger) === "/([A-Za-z])(\\d)/" && (l = {
				...l,
				trigger: /(?<![\\A-Za-z])([A-Za-z])(\d)/
			}, n.push("letter + digit: not when the letter ends a command, so \\times10 is safe")), t.push(`  ${E(l)}`), r++;
		});
		for (let e of l) t.push(`  ${e}`);
	}
	return a && t.push("  options.units({ on: false }), // switched on in Settings → Snippets"), {
		text: `${[
			"// Written by Snippets: convert from the old snippet file, which was left as it was. Edit freely: this file is yours.",
			...n.length ? ["// Changed from the old file, as one batch:", ...n.map((e) => `//   ${e}`)] : [],
			"export default ({ math, text, code, visual, anywhere, commands, words, vars, std, options }) => [",
			...Object.keys(o).length ? [`  vars(${JSON.stringify(o)}),`] : [],
			...t
		].join("\n")}\n];\n`,
		kept: r,
		dropped: n
	};
}
//#endregion
//#region plugins/beta/snippets/ui/src/stops.ts
function O(e, t = "", n = !1) {
	let r = "", i = /* @__PURE__ */ new Map(), a = (e, t) => (i.get(e) ?? i.set(e, []).get(e)).push(t);
	for (let n = 0; n < e.length;) {
		if (e.startsWith("${VISUAL}", n)) {
			r += t, n += 9;
			continue;
		}
		let i = /^\$(\d+)/.exec(e.slice(n, n + 6));
		if (i) {
			a(Number(i[1]), {
				from: r.length,
				to: r.length
			}), n += i[0].length;
			continue;
		}
		let o = /^\$\{(\d+)(:|\})/.exec(e.slice(n, n + 8));
		if (o) {
			n += o[0].length;
			let t = r.length;
			if (o[2] === ":") {
				let t = 0;
				for (; n < e.length; n++) {
					let i = e[n];
					if (i === "\\" && n + 1 < e.length) {
						r += i + e[++n];
						continue;
					}
					if (i === "{") t++;
					else if (i === "}" && t-- === 0) break;
					r += i;
				}
				n++;
			}
			a(Number(o[1]), {
				from: t,
				to: r.length
			});
			continue;
		}
		r += e[n++];
	}
	let o = (e) => !n && e === 0 ? Infinity : e, s = [...i.keys()].sort((e, t) => o(e) - o(t)).map((e) => i.get(e)), c = s[s.length - 1];
	return s.length && (n || !i.has(0)) && !c.some((e) => e.from === r.length) && s.push([{
		from: r.length,
		to: r.length
	}]), {
		text: r,
		stops: s
	};
}
function k(e) {
	let { EditorSelection: t, StateEffect: n, StateField: r } = e.state, { Decoration: i, EditorView: a, WidgetType: o } = e.view, s = n.define(), c = n.define(), l = n.define(), u = n.define(), d = (e) => {
		let t = e.stops.flat();
		return {
			from: Math.min(...t.map((e) => e.from)),
			to: Math.max(...t.map((e) => e.to))
		};
	};
	class f extends o {
		toDOM() {
			let e = document.createElement("span");
			return e.className = "cm-snippetFieldPosition", e;
		}
		eq() {
			return !0;
		}
		ignoreEvent() {
			return !1;
		}
	}
	let p = r.define({
		create: () => [],
		update(e, t) {
			let n = e;
			t.docChanged && n.length && (n = n.map((e) => ({
				at: e.at,
				stops: e.stops.map((e) => e.map((e) => ({
					from: t.changes.mapPos(e.from, -1),
					to: t.changes.mapPos(e.to, 1)
				})))
			})));
			let r = !1;
			for (let e of t.effects) e.is(s) ? (n = [...n, e.value], r = !0) : e.is(c) && n.length ? (n = [...n.slice(0, -1), {
				...n[n.length - 1],
				at: e.value
			}], r = !0) : e.is(l) ? (n = n.slice(0, -1), r = !0) : e.is(u) && (n = []);
			if (t.selection && !r) {
				let e = t.newSelection.main.head;
				for (; n.length;) {
					let t = n[n.length - 1], r = d(t), i = t.stops[t.stops.length - 1], a = t.at < t.stops.length - 1 && i.length === 1 && i[0].from === i[0].to && e === i[0].from && !t.stops[t.at].some((t) => t.to >= e);
					if (e >= r.from && e <= r.to && !a) break;
					n = n.slice(0, -1);
				}
			}
			return n;
		},
		provide: (e) => a.decorations.from(e, (e) => {
			let t = e[e.length - 1];
			if (!t) return i.none;
			let n = t.stops.slice(t.at + 1).flat().map((e) => e.from === e.to ? i.widget({
				widget: new f(),
				side: 1
			}).range(e.from) : i.mark({ class: "cm-snippetField" }).range(e.from, e.to));
			return i.set(n, !0);
		})
	}), m = (e) => t.create(e.map((e) => t.range(e.from, e.to)));
	function h(e, t, n, r, i = "", a = !1) {
		let { text: o, stops: c } = O(t, i, a), l = c.map((e) => e.map((e) => ({
			from: n + e.from,
			to: n + e.to
		}))), u = {
			from: n,
			to: r,
			insert: o
		};
		if (l.length < 2) {
			e.dispatch({
				changes: u,
				selection: l.length ? m(l[0]) : { anchor: n + o.length },
				scrollIntoView: !0,
				userEvent: "input.complete"
			});
			return;
		}
		e.dispatch({
			changes: u,
			selection: m(l[0]),
			effects: s.of({
				stops: l,
				at: 0
			}),
			scrollIntoView: !0,
			userEvent: "input.complete"
		});
	}
	function g(e) {
		let t = e.state.field(p, !1), n = t?.[t.length - 1];
		if (!n) return !1;
		let r = n.at + 1;
		if (r >= n.stops.length) return e.dispatch({ effects: l.of(null) }), g(e);
		let i = r === n.stops.length - 1;
		return e.dispatch({
			selection: m(n.stops[r]),
			effects: i ? l.of(null) : c.of(r),
			scrollIntoView: !0
		}), !0;
	}
	function _(e) {
		let t = e.state.field(p, !1), n = t?.[t.length - 1];
		return !n || n.at === 0 ? !1 : (e.dispatch({
			selection: m(n.stops[n.at - 1]),
			effects: c.of(n.at - 1),
			scrollIntoView: !0
		}), !0);
	}
	function v(e) {
		let t = e.field(p, !1), n = t?.[t.length - 1], r = e.selection.main.head;
		return n?.stops[n.at].find((e) => e.from <= r && r <= e.to)?.to ?? null;
	}
	let y = (e) => (e.field(p, !1)?.length ?? 0) > 0;
	return {
		extension: [p, a.baseTheme({
			".cm-snippetField": { backgroundColor: "#8881" },
			".cm-snippetFieldPosition": {
				verticalAlign: "text-top",
				width: 0,
				height: "1.15em",
				display: "inline-block",
				margin: "0 -0.7px -.7em",
				borderLeft: "1.4px dotted #888"
			}
		})],
		insert: h,
		next: g,
		prev: _,
		currentEnd: v,
		active: y,
		dropAll: (e) => {
			y(e.state) && e.dispatch({ effects: u.of(null) });
		}
	};
}
//#endregion
//#region plugins/beta/snippets/ui/src/words.ts
var A = "achieve achieved actors actually agree aligned all allow allowed allsec analogous anderson angle another app appear appears applications apply applying approach approaches appropriate approximation archive around assets assume atom atomic atoms auto automatically axis band bands bandwidth bare basically bastante become becomes been begins between bigger bipartite bottom bound boundary box branch branches brothers call called callout capture captures catalog cell challenges change changes changing closing coexistence coincide color colorblind comes command commands comment comments commit common commutation commute commutes compilation constant constants continuation continued contributors controlled copies copy copyright correct correction correlated correlation correlations corresponding corresponds cosas cost coveralls crossing cuando cumul cumulant cuprates custom cutoff damping decreasing dee deep degeneracy degenerate degrees design designed details determined detuned developing differ difference differences different difficult diffraction director directory distance eigenvectors either eliminate ellos enable entanglement equivalent escape essentially esto estoy exchange exist existing expand expanded expansion expect expected experimental experimentally experiments explain explicitly exponential exponentially exponents export expressed expression expressions factor factorized fall falls fill filled filling finally follow following follows formally formula formulas found fraction free freedom freely full fund fundamental funds further generators geometry grand ground hamiltonian hand handle happen happens historia history hopping hoppings important inbox include included includes including incomplete incompressible increase increases increasing infinite infinity info information install installation installed insulator insulators integer integral integrate integrated intensity inter interact interacting interaction interactions interesting interface interference intermediate internship into intro introduce introduction invariant inverse inversion irreps island jupytext karakeep keep keeps lands language languages letterboxd library limit machine macroscopic mapped matching maximum maxiter meeting menu meta metal metallic microscopic minimum missing mixing mode model models modern modes modificados modification modified modify modulation module moment momenta momentum mother much muchas mucho multiple multitext mundo music must muy need needed needs negative normal normalization normalized nublado nuestro null number numbers numerical numerically numpy occupancy occupation occupied onto operator operators opposite other otherwise parameter parameters parte particle particles particular partie partner partners parts phenomena photon pick pinned pip point points power preset principal principle produced produces product products propagating propagation properties property proportional proposed quadratic quasiparticle range rather readthedocs really repository reproduce restart retain second secret secrets section sector sectors see seed seems sees separate separated sets settings setup sign similar simple simulation simulations since single singlet singular small smaller smallest some something speed spin spins stand standard stands start started starting steps still stop stopped stops strange subbath subbaths subject submit subspace subtopic summer superconductor superconductors support suppressed sweep sweeps tanto that their them theme themes themselves then theory there therefore thermal these thesis they three toda today todo todos together tokens tol tolerance too tool tools top topic topics topology tot total touches toward tpi typical unchanged under understand understanding upper using usually valley vector vectors wavevector weather week well what whether will www".split(" "), j = /^(?:\\[A-Za-z]+|\\.|[^A-Za-z\s])/, M = /^\\(?:langle|lvert|lVert|lfloor|lceil|lbrace)(?![A-Za-z])/, te = /^\\(?:rangle|rvert|rVert|rfloor|rceil|rbrace)(?![A-Za-z])/, ne = /^\\(begin|end)\{([A-Za-z]+\*?)\}/, N = /^(?:equation|align|alignat|flalign|gather|multline|eqnarray|displaymath|math)\*?$/;
function P(e) {
	let t = [], n = (e, n, r) => (t.push({
		from: e,
		to: e + n,
		kind: r
	}), e + n);
	for (let t = 0; t < e.length;) {
		let r = e.slice(t, t + 32), i = r[0], a = i === "\\" ? ne.exec(r) : null;
		a ? t = N.test(a[2]) ? n(t, a[0].length, "bound") : t + a[0].length : r.startsWith("\\left") && !/^\\left[A-Za-z]/.test(r) ? t = n(t, 5 + (j.exec(r.slice(5))?.[0].length ?? 0), "open") : r.startsWith("\\right") && !/^\\right[A-Za-z]/.test(r) ? t = n(t, 6 + (j.exec(r.slice(6))?.[0].length ?? 0), "close") : M.test(r) ? t = n(t, M.exec(r)[0].length, "open") : te.test(r) ? t = n(t, te.exec(r)[0].length, "close") : r.startsWith("\\{") ? t = n(t, 2, "open") : r.startsWith("\\}") ? t = n(t, 2, "close") : r.startsWith("\\[") || r.startsWith("\\(") || r.startsWith("\\]") || r.startsWith("\\)") ? t = n(t, 2, "bound") : i === "\\" ? t += /^\\(?:[A-Za-z]+|.|$)/s.exec(r)?.[0].length ?? 1 : "{([".includes(i) ? t = n(t, 1, "open") : "})]".includes(i) ? t = n(t, 1, "close") : i === "$" ? t = n(t, r[1] === "$" ? 2 : 1, "bound") : i === "\n" && /^\n[ \t]*\n/.test(r) ? t = n(t, 1, "wall") : t++;
	}
	return t;
}
function F(e) {
	let t = P(e), n = t[0];
	if (!n || n.kind === "wall") return null;
	if (n.kind !== "close") return n.to;
	let r = t[1], i = e.slice(n.to, r?.from ?? n.to);
	return r?.kind === "open" && (i === "" || i === "^" || i === "_") ? r.to : n.to;
}
function re(e) {
	let t = P(e), n = t[t.length - 1];
	if (!n || n.kind === "wall") return null;
	if (n.kind !== "open") return n.from;
	let r = +!!/[\^_]$/.test(e.slice(0, n.from)), i = n.from - r, a = t[t.length - 2];
	return a?.kind === "close" && a.to === i ? a.from : i;
}
//#endregion
//#region plugins/beta/snippets/ui/src/sorted-words.ts
var I = class {
	text;
	constructor(e) {
		this.text = e;
	}
	get size() {
		if (!this.text) return 0;
		let e = 1;
		for (let t = this.text.indexOf("\n"); t >= 0; t = this.text.indexOf("\n", t + 1)) e++;
		return e;
	}
	atOrAfter(e) {
		let t = 0, n = this.text.length;
		for (; t < n;) {
			let r = this.text.lastIndexOf("\n", t + n >> 1) + 1, i = r < t ? t : r, a = this.text.indexOf("\n", i), o = a < 0 ? this.text.length : a + 1;
			this.text.slice(i, a < 0 ? void 0 : a) < e ? t = o : n = i;
		}
		let r = this.text.indexOf("\n", t);
		return this.text.slice(t, r < 0 ? void 0 : r);
	}
	has(e) {
		return this.atOrAfter(e) === e;
	}
	grows(e) {
		return this.atOrAfter(e + "a").startsWith(e);
	}
}, ie = 120, L = "langle rangle lvert rvert lVert rVert lfloor rfloor lceil rceil hbar hslash ell nabla partial infty mathbb mathbf mathcal mathrm mathfrak mathscr mathit boldsymbol text textbf textit operatorname overline underline overbrace underbrace widehat widetilde hat bar tilde vec dot ddot sqrt frac dfrac tfrac binom left right bigl bigr sum prod int iint oint lim limsup liminf sup inf max min exp log ln sin cos tan cot sec csc sinh cosh tanh arcsin arccos arctan det dim ker deg gcd cdot cdots ldots vdots ddots times div pm mp leq geq neq approx equiv sim simeq propto cong to mapsto rightarrow leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow uparrow downarrow forall exists in notin subset subseteq supset supseteq cup cap setminus emptyset varnothing wedge vee oplus otimes dagger quad qquad angle triangle top bot bra ket braket ketbra".split(" "), ae = class {
	big;
	list;
	set;
	constructor(e, t) {
		this.big = t, this.set = new Set(e), this.list = [...this.set].sort();
	}
	has(e) {
		return this.set.has(e) || !!this.big?.has(e);
	}
	grows(e) {
		let t = 0, n = this.list.length;
		for (; t < n;) {
			let r = t + n >> 1;
			this.list[r] < e ? t = r + 1 : n = r;
		}
		return this.list[t] === e && t++, !!this.list[t]?.startsWith(e) || !!this.big?.grows(e);
	}
};
function R(e) {
	let t = e.length > 1 ? e[e.length - 1] : void 0;
	return t && e[0].endsWith(t) ? t : e[0];
}
function oe(e) {
	let t = e.editor.codemirror, n = k(t), { EditorView: r, keymap: i } = t.view, { Prec: a } = t.state, o = [], s = L, c = [], l = new ae(A, null), u = [], d = null;
	async function f() {
		let t = await fetch(e.assetUrl("words.txt"));
		if (!t.ok) throw Error(`words.txt: ${t.status}`);
		return d = new I(await t.text()), l = new ae([...A, ...u], d), d.size;
	}
	let p = !1;
	function m(e) {
		o = e.snippets, s = [.../* @__PURE__ */ new Set([...L, ...e.known])], c = e.known, u = e.words, l = new ae([...A, ...u], d), p = e.snippets.some((e) => e.code && e.langs !== null);
	}
	let h = /* @__PURE__ */ new WeakMap(), g = (t, n) => h.get(t) ?? e.editor.place(t, n), _ = (t) => h.has(t) || p || /\.(md|markdown|tex)$/i.test(e.editor.path(t)), v = (t, n, r = "") => ({
		before: n,
		selection: r,
		after: t.state.sliceDoc(t.state.selection.main.head, t.state.doc.lineAt(t.state.selection.main.head).to),
		path: e.editor.path(t)
	});
	function y(t, n, r) {
		if (t.files && !t.files.some((t) => t.test(e.editor.path(r)))) return !1;
		switch (n.kind) {
			case "code": return t.code && (t.langs ? t.langs.includes(n.lang) : /\.(md|markdown)$/i.test(e.editor.path(r)));
			case "text": return t.text;
			case "math": return !t.math || n.textArg && !t.inTextArg ? !1 : n.form === "display" ? t.display : t.inline;
		}
	}
	function b(e, t, n) {
		let r = e.body;
		if (typeof r == "function") {
			try {
				let e = r(t, n);
				if (e instanceof Promise) return e;
				r = e;
			} catch (t) {
				return console.warn("[snippets]", e.shown, t), null;
			}
			if (typeof r != "string") return null;
		}
		let i = String(r);
		return t && (i = i.replace(/\[\[(\d+)\]\]/g, (e, n) => t[Number(n) + 1] ?? "")), i;
	}
	let x = /* @__PURE__ */ new WeakMap();
	function S(e, t, r, i, a, o, s = "") {
		let c = e.state.sliceDoc(i, a) + o;
		o &&= (e.dispatch({
			changes: {
				from: a,
				insert: o
			},
			selection: { anchor: a + o.length },
			userEvent: "input.type"
		}), a += o.length, ""), n.insert(e, r, i, a, s, t.legacyStops), x.set(e, {
			doc: e.state.doc,
			from: i,
			to: i + O(r, s, t.legacyStops).text.length,
			typed: c
		});
	}
	function C(e) {
		let t = x.get(e);
		return x.delete(e), !t || t.doc !== e.state.doc ? !1 : (e.dispatch({
			changes: {
				from: t.from,
				to: t.to,
				insert: t.typed
			},
			selection: { anchor: t.from + t.typed.length },
			userEvent: "delete.backward"
		}), n.dropAll(e), !0);
	}
	function w(e, t, n, r, i, a = "") {
		let o = b(t, n, v(e, e.state.sliceDoc(e.state.doc.lineAt(r).from, r)));
		if (o == null) return !1;
		if (o instanceof Promise) {
			let n = e.state.doc;
			return o.then((o) => {
				e.state.doc === n ? S(e, t, o, r, i, a) : console.warn("[snippets]", t.shown, "answered after the text had changed");
			}, (e) => console.warn("[snippets]", t.shown, e)), !0;
		}
		return S(e, t, o, r, i, a), !0;
	}
	let T = (e, t, n) => {
		if (!n.auto || !n.plain || n.plain.length <= t.length || n.visual) return !1;
		for (let r = t.length; r < n.plain.length; r++) {
			let i = n.plain.slice(0, r);
			if (i.endsWith(t) && e.endsWith(i)) return !0;
		}
		return !1;
	}, ee = (e) => !!e.regex && /^\(\?:[^\w\s\\()[\]{}.^$|?*+]/.test(e.regex.source), E = /* @__PURE__ */ new WeakMap();
	function D(e, t) {
		let n = E.get(e);
		return E.delete(e), n && n.at === t && e.state.sliceDoc(n.from, n.to) === (n.m ? n.m[0] : n.s.plain) ? n : null;
	}
	function j(e, t) {
		let n = e.state.sliceDoc(t.to, t.at);
		return w(e, t.s, t.m, t.from, t.at) ? (n && e.dispatch(e.state.replaceSelection(n)), !0) : !1;
	}
	let M = (e) => /[A-Za-z]+$/.exec(e)?.[0] ?? "";
	function te(e, t) {
		if (!/^[A-Za-z]+$/.test(t)) return !1;
		let n = M(e);
		return n.length > t.length && s.some((e) => e.startsWith(n));
	}
	function ne(e, t) {
		if (!/^[A-Za-z]+$/.test(t)) return !1;
		let n = M(e);
		return e[e.length - n.length - 1] === "\\" || n.length > t.length && s.some((e) => e.startsWith(n));
	}
	function N(e, t) {
		if (!/^[A-Za-z]+$/.test(t)) return !1;
		let n = M(e);
		if (n.length <= t.length || e[e.length - n.length - 1] === "\\") return !1;
		let r = n.toLowerCase();
		return l.has(r) || l.grows(r);
	}
	function P(e, t, n) {
		if (/^[A-Za-z]$/.test(n)) return !1;
		let r = e.state.doc.lineAt(t), i = M(e.state.doc.sliceString(Math.max(r.from, t - ie), t)).toLowerCase();
		return !i || l.has(i) || !l.grows(i) ? !1 : z(e, t, "", !0, !0);
	}
	function oe(e, t) {
		let n = e.state.selection.main.head;
		t === " " && /[ \t{([]/.test(e.state.sliceDoc(n - 1, n)) || e.dispatch(e.state.replaceSelection(t));
	}
	function z(e, t, n, r, i = !1) {
		if (!o.length) return !1;
		let a = D(e, t);
		if (!a && !i && n && P(e, t, n)) {
			let t = e.state.selection.main.head;
			return z(e, t, n, r) || oe(e, n), !0;
		}
		let u = e.state.doc.lineAt(t), d = e.state.doc.sliceString(Math.max(u.from, t - ie), t) + n, f, p = () => f ??= g(e, t), m = (e) => t + n.length - e, h = (e) => r === e.auto && !e.visual, _ = (t, n) => !t.when || t.when(v(e, d.slice(0, d.length - n))), x = (t) => h(t) && y(t, p(), e), S = (e) => {
			if (!e.plain || !d.endsWith(e.plain) || e.typo && l.has(e.plain.toLowerCase())) return !1;
			let t = d.length - e.plain.length;
			return e.word && t > 0 && /[A-Za-z0-9]/.test(d[t - 1]) ? !1 : !ne(d, e.plain) && (i || !N(d, e.plain));
		}, C = null;
		for (let t of o) {
			if (!h(t)) continue;
			let n = t.regex ? t.regex.exec(d) : null;
			if (t.regex ? !n || te(d, R(n)) || !i && N(d, R(n)) : !S(t)) continue;
			let r = n ? n[0].length : t.plain.length;
			if (y(t, p(), e) && _(t, r)) {
				C = {
					s: t,
					m: n,
					len: r
				};
				break;
			}
		}
		if (C && !C.s.regex && r) {
			let e = C.s;
			for (let t of o) t.priority === e.priority && S(t) && t.plain.length > C.len && x(t) && _(t, t.plain.length) && (C = {
				s: t,
				m: null,
				len: t.plain.length
			});
		}
		let O = M(d), k = m(O.length), A = d[d.length - O.length - 1] === "\\", F = (e) => !!e && !i && (s.some((t) => t.length > e.length && t.startsWith(e)) || !A && l.grows(e.toLowerCase())), re = (e, t, n) => e.length > t.length || p().kind !== "math" || !n && t.length < 3 ? F(e) : !i && c.some((t) => t.length > e.length && t.startsWith(e));
		if (a && (!C || m(C.len) >= a.to)) {
			let i = e.state.sliceDoc(a.core, t) + n, c = /^[A-Za-z]$/.test(n) && k <= a.core;
			if (!C && (o.some((e) => T(d, i, e) && x(e)) || c && F(O))) return E.set(e, {
				...a,
				at: t + n.length
			}), !1;
			if (!C && c && !A && l.has(O.toLowerCase())) return !1;
			let f = M(e.state.sliceDoc(u.from, t));
			if (!C && !c && !A && f.length > (a.m ? R(a.m) : a.s.plain).length && l.has(f.toLowerCase())) return !1;
			if (!C && c && s.includes(O)) {
				if (d[d.length - O.length - 1] === "\\") return !1;
				let n = b(a.s, a.m, v(e, ""));
				return typeof n == "string" && n.includes("\\" + O) ? w(e, a.s, a.m, a.from, t) : (e.dispatch({
					changes: {
						from: k,
						to: t,
						insert: "\\" + O
					},
					selection: { anchor: k + O.length + 1 },
					userEvent: "input.complete"
				}), !0);
			}
			if (!j(e, a)) return !1;
			let p = e.state.selection.main.head;
			return n && !z(e, p, n, r) && oe(e, n), !0;
		}
		if (!C) return !1;
		let I = C.s, L = C.m ? R(C.m) : I.plain;
		if (r && n && (o.some((e) => e !== I && T(d, L, e) && x(e)) || /^[A-Za-z]+$/.test(L) && !ee(I) && re(O, L, !I.regex))) {
			let r = m(C.len), i = t + n.length;
			return E.set(e, {
				s: I,
				m: C.m,
				from: r,
				to: i,
				core: i - L.length,
				at: i
			}), !1;
		}
		return w(e, I, C.m, m(C.len), t, n);
	}
	function B(e, t, n, r) {
		let i = g(e, t), a = o.find((t) => t.visual && t.plain === r && y(t, i, e));
		if (!a) return !1;
		let s = e.state.sliceDoc(t, n), c = b(a, null, v(e, e.state.sliceDoc(e.state.doc.lineAt(t).from, t), s));
		if (c == null) return !1;
		if (c instanceof Promise) {
			let r = e.state.doc;
			return c.then((i) => {
				e.state.doc === r && S(e, a, i, t, n, "", s);
			}, (e) => console.warn("[snippets]", a.shown, e)), !0;
		}
		return S(e, a, c, t, n, "", s), !0;
	}
	function V(e, t, n) {
		return !")]}".includes(n) || e.state.sliceDoc(t, t + 1) !== n || g(e, t).kind !== "math" ? !1 : (e.dispatch({
			selection: { anchor: t + 1 },
			userEvent: "select"
		}), !0);
	}
	function H(e, t, r) {
		return r === "{" && n.active(e.state) && /[_^]\{$/.test(e.state.sliceDoc(Math.max(0, t - 2), t)) && e.state.sliceDoc(t, t + 1) === "}";
	}
	function se(e, t, n) {
		return n === " " && x.get(e)?.doc === e.state.doc && /[{([ \t]/.test(e.state.sliceDoc(t - 1, t));
	}
	function U(e, t, n) {
		if (n !== "^" && n !== "_") return t;
		let r = e.state.doc.lineAt(t), i = e.state.sliceDoc(Math.max(r.from, t - ie), t), a = /([A-Za-z0-9}\])|])( +)$/.exec(i);
		if (!a || g(e, t).kind !== "math") return t;
		let o = t - a[2].length;
		return e.dispatch({
			changes: {
				from: o,
				to: t
			},
			selection: { anchor: o },
			userEvent: "delete"
		}), o;
	}
	function W(e) {
		let { head: t } = e.state.selection.main, n = F(e.state.doc.sliceString(t, Math.min(e.state.doc.length, e.state.doc.lineAt(t).to + 4e3)));
		return n === null ? null : t + n;
	}
	function G(e, t) {
		return t !== null && (e.dispatch({
			selection: { anchor: t },
			scrollIntoView: !0
		}), !0);
	}
	let K = (e) => G(e, W(e));
	function q(e) {
		let { head: t } = e.state.selection.main, n = Math.max(0, t - 4e3), r = re(e.state.doc.sliceString(n, t));
		return G(e, r === null ? null : n + r);
	}
	function ce(e) {
		let t = D(e, e.state.selection.main.head);
		return !!t && j(e, t);
	}
	function J(e, t, n, r) {
		if (r.length !== 1 || e.state.selection.ranges.length > 1 || !_(e)) return !1;
		if (t !== n) return B(e, t, n, r);
		if (H(e, t, r) || se(e, t, r)) return !0;
		let i = U(e, t, r);
		return i === t ? z(e, t, r, !0) || V(e, t, r) : (z(e, i, r, !0) || e.dispatch(e.state.replaceSelection(r)), !0);
	}
	let Y = (e) => g(e, e.state.selection.main.head).kind === "math", le = {
		overList: (e) => E.has(e) || n.active(e.state),
		whileAsking: (e) => E.has(e) || n.active(e.state) || Y(e)
	}, ue = [
		a.high(r.inputHandler.of((e, t, n, r) => J(e, t, n, r))),
		n.extension,
		a.highest(i.of([{
			key: "Backspace",
			run: C
		}, {
			key: "Escape",
			run: (e) => (n.dropAll(e), !1)
		}])),
		a.high(i.of([{
			key: "Tab",
			run: (e) => {
				if (!_(e)) return n.next(e);
				let t = e.state.selection.main.empty, r = e.state.selection.main.head;
				if (t && (ce(e) || z(e, r, "", !1) || !n.active(e.state) && P(e, r, ""))) return !0;
				let i = t && Y(e), a = n.currentEnd(e.state), o = i && a !== null ? W(e) : null;
				return o !== null && o <= a ? K(e) : n.next(e) || i && K(e);
			},
			shift: (e) => n.prev(e) || _(e) && e.state.selection.main.empty && Y(e) && q(e)
		}]))
	];
	function de(e, i, a = "") {
		let o = new r({ state: t.state.EditorState.create({
			doc: a,
			selection: { anchor: a.length },
			extensions: [n.extension]
		}) });
		h.set(o, i);
		try {
			for (let t of e) {
				let { from: e, to: r } = o.state.selection.main;
				if (t === "	") {
					z(o, e, "", !1) || n.next(o);
					continue;
				}
				J(o, e, r, t) || o.dispatch(o.state.replaceSelection(t));
			}
			return o.state.doc.toString();
		} finally {
			o.destroy();
		}
	}
	return {
		extension: ue,
		claim: le,
		use: m,
		loadWords: f,
		simulate: de,
		insert: n.insert,
		snippets: () => o,
		made: () => c,
		fits: y,
		placeOf: g
	};
}
//#endregion
//#region plugins/beta/snippets/ui/src/std.ts
var z = /* @__PURE__ */ t({
	align: () => W,
	greek: () => B,
	matrix: () => U,
	operators: () => V,
	sequence: () => G,
	symbols: () => H
}), B = "alpha beta gamma Gamma delta Delta epsilon varepsilon zeta eta theta vartheta Theta iota kappa lambda Lambda mu nu xi Xi omicron pi Pi varpi rho varrho sigma Sigma varsigma tau upsilon Upsilon phi Phi varphi chi psi Psi omega Omega".split(" "), V = "arcsin arccos arctan arccot arccsc arcsec sinh cosh tanh coth sech csch sin cos tan cot csc sec exp log ln det sum prod int iint iiint oint".split(" "), H = "parallel perp partial nabla hbar ell infty oplus ominus otimes square star dagger vee wedge subseteq subset supseteq supset emptyset exists nexists forall implies impliedby iff setminus neg lor land bigcup bigcap cdot times simeq approx quad qquad leq geq neq gg ll equiv sim propto rightarrow leftarrow Rightarrow Leftarrow leftrightarrow to mapsto cap cup dots vdots ddots langle rangle".split(" "), se = {
	p: "pmatrix",
	b: "bmatrix",
	B: "Bmatrix",
	v: "vmatrix",
	V: "Vmatrix",
	m: "matrix"
};
function U(e, t, n = "p") {
	let r = se[n] ?? "pmatrix", i = 1;
	return `\\begin{${r}}\n${Array.from({ length: e }, () => Array.from({ length: t }, () => `\${${i++}}`).join(" & ")).join(" \\\\\n")}\n\\end{${r}}$0`;
}
function W(e) {
	return `\\begin{align}\n${e.split("\n").map((e) => e.trim().replace(/^\$+|\$+$/g, "").trim()).filter(Boolean).map((e) => /(?<![\\<>!])=|\\(?:leq|geq|neq|approx|equiv|sim|simeq|implies|iff)(?![A-Za-z])/.test(e) ? e.replace(/(?<![\\<>!])=|\\(?:leq|geq|neq|approx|equiv|sim|simeq|implies|iff)(?![A-Za-z])/, (e) => `&${e}`) : `&${e}`).join(" \\\\\n")}\n\\end{align}$0`;
}
var G = (e, t) => `${e}_1 ${t} ${e}_2 ${t} \\cdots ${t} ${e}_{\${1:n}}$0`, K = {
	spacing: (e = {}) => i.option("Automatic spacing", "Bare names get their backslash, a letter after a command a space (\\sin x), a number after an operator a space (\\times 10), a digit after a Greek letter a subscript.", [i.commands(B, { digit: "subscript" }), i.commands([...V, ...H], { digit: "space" })], e),
	matrices: (e = {}) => i.option("Matrices by size", "33pmat, 24bmat: the size in the trigger, a stop in each cell. p b B v V for the brackets.", [i.math(/(\d)(\d)([pbBvV]?)mat/, (e) => U(+e[1], +e[2], e[3] || "p"), { name: "A matrix by size" })], e),
	sequences: (e = {}) => i.option("Sequences", "xsum → x_1 + x_2 + … + x_n, xprod, xleq, and x1dots → x_1, x_2, …, x_n.", [
		i.math(/([A-Za-z])sum/, (e) => G(e[1], "+"), {
			name: "A written-out sum",
			priority: 1
		}),
		i.math(/([A-Za-z])prod/, (e) => G(e[1], "\\times"), {
			name: "A written-out product",
			priority: 1
		}),
		i.math(/([A-Za-z])leq/, (e) => G(e[1], "\\leq"), {
			name: "An ordered sequence",
			priority: 1
		}),
		i.math(/([A-Za-z])1dots/, (e) => G(e[1], ","), {
			name: "A list",
			priority: 1
		})
	], e),
	minmax: (e = {}) => i.option("Smart min and max", "min + i → \\min_{i}, min + ( → \\min(), min + space → \\min. The same for max.", ["min", "max"].flatMap((e) => [
		i.math(RegExp(`(?<!\\\\)${e}([A-Za-z])`), (t) => `\\${e}_{${t[1]}$1}$0`, { name: `\\${e} with a subscript` }),
		i.math(`${e}(`, `\\${e}($1)$0`, { priority: 1 }),
		i.math(`${e} `, `\\${e} `)
	]), e),
	derivatives: (e = {}) => i.option("Derivatives by their letters", "dydt → a fraction, ddx → d/dx, with any letters.", [i.math(/d([a-ce-z])d([a-ce-z])/, "\\frac{d [[0]]}{d [[1]]} ", { name: "A derivative by its letters" }), i.math(/dd([a-ce-z])/, "\\frac{d}{d [[0]]} ", { name: "d/dx" })], e),
	align: (e = {}) => i.option("Align a selection", "Select lines of math and type A: each is aligned at its first relation, inside align.", [i.visual("A", (e, t) => W(t.selection), { name: "Align what is selected" })], e),
	colors: (e = {}) => i.option("Colour a selection", "Select math and type R: \\textcolor{red}{…}.", [i.visual("R", "\\textcolor{${1:red}}{${VISUAL}}$0", { name: "Colour what is selected" })], e),
	autoAlign: (e = {}) => i.option("Auto-align", "malign writes a $$align block: plain lines, drawn as an align with each line at its first relation (=, \\leq, \\approx…). menv stays plain math.", [i.text("malign", "$$align\n$1\n$$", {
		word: !0,
		auto: !0,
		name: "An auto-aligned block"
	})], e),
	units: (e = {}) => i.option("Electrical units", "mV, kV, kW, mA, Ohm… written upright with a space before them. They fire on those letters anywhere in math.", [
		...[
			["mV", "mV"],
			["Vol", "V"],
			["kV", "kV"],
			["VA", "VA"],
			["kVA", "kVA"],
			["MVA", "MVA"],
			["VAR", "VAR"],
			["kVAR", "kVAR"],
			["mW", "mW"],
			["WATT", "W"],
			["kW", "kW"],
			["mA", "mA"],
			["Amp", "A"],
			["dB", "dB"],
			["PF", "PF"],
			["PU", "p.u."]
		].map(([e, t]) => i.math(e, `\\space\\text{${t}}`, { name: `${t}, the unit` })),
		i.math("uA", "\\space\\mu\\text{A}"),
		i.math("Ohm", "\\Omega"),
		i.math("mOhm", "\\space\\text{m}\\Omega"),
		i.math("kOhm", "\\space\\text{k}\\Omega"),
		i.math("MOhm", "\\space\\text{M}\\Omega")
	], e),
	textHelpers: (e = {}) => i.option("Small helpers in text", "ie → i.e., eg → e.g., and ## after a word flips the case of its first letter.", [
		i.text(/\bie /, "i.e. ", { auto: !0 }),
		i.text(/\beg /, "e.g. ", { auto: !0 }),
		i.text(/(\w+)##/, (e) => {
			let t = e[1][0];
			return (t === t.toUpperCase() ? t.toLowerCase() : t.toUpperCase()) + e[1].slice(1);
		}, {
			auto: !0,
			name: "Flip the first letter's case"
		})
	], e)
}, q = ".atlas/snippets", ce = `${q}/converted.js`, J = `${q}/latex.js`, Y = {
	...i,
	std: z,
	options: K
};
function le(e) {
	try {
		let t = JSON.parse(String(e ?? "[]"));
		return new Set(Array.isArray(t) ? t.map(String) : []);
	} catch {
		return /* @__PURE__ */ new Set();
	}
}
async function ue(e, t, n) {
	let r = n.get(t);
	if (r) return r;
	let i = (async () => {
		let r = await e.readText(t), i = t.slice(0, t.lastIndexOf("/")), a = [], o = 0;
		for (let t of r.matchAll(/(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.\.?\/[^"']+)\2/g)) {
			let s = new URL(t[3], `file:///${i}/`).pathname.slice(1);
			a.push(r.slice(o, t.index), t[1], JSON.stringify(await ue(e, decodeURI(s), n))), o = t.index + t[0].length;
		}
		return a.push(r.slice(o)), URL.createObjectURL(new Blob(a, { type: "text/javascript" }));
	})();
	return n.set(t, i), i;
}
async function de(e, t, n) {
	let r = await import(
		/* @vite-ignore */
		await ue(e, t, n)
), i = typeof r.default == "function" ? r.default(Y) : r.default;
	if (!Array.isArray(i)) throw Error("its default export gives no list of snippets");
	return i.flat(Infinity);
}
async function fe(e) {
	let t = await fetch(e.assetUrl("starter.js"));
	if (!t.ok) throw Error(`starter.js: ${t.status}`);
	let n = await t.text(), r = await e.exists(J) ? await e.readText(J) : null;
	return r !== n && (r !== null && await e.trash(J), await e.writeText(J, n), !0);
}
async function pe(e, t = !0) {
	let n = [], r = [], i = [];
	await e.exists(".atlas/snippets").catch(() => !1) && (i = (await e.list(q).catch(() => [])).filter((e) => !e.dir && e.name.endsWith(".js")).map((e) => e.path).sort());
	let a = /* @__PURE__ */ new Map(), o = [];
	for (let t of i) if (/\bexport\s+default\b/.test(await e.readText(t).catch(() => ""))) {
		o.push(t);
		try {
			n.push({
				source: t,
				entries: await de(e, t, a)
			});
		} catch (e) {
			r.push({
				source: t,
				what: `could not be read: ${String(e.message ?? e)}`
			});
		}
	}
	let s = await e.editor.legacySnippets().catch(() => null), c = !!s?.sources.some((e) => e.trim()), l = c && !o.includes(ce) && !o.includes(J);
	if (l) {
		let e = _(s);
		n.push({
			source: e.source,
			entries: e.entries
		}), r.push(...e.problems);
	}
	if (t && !l && s !== null) try {
		if (await fe(e)) return {
			...await pe(e, !1),
			wroteStarter: !0
		};
	} catch (e) {
		r.push({
			source: J,
			what: `could not be written: ${String(e.message ?? e)}`
		});
	}
	let u = f(n, le(e.plugin.settings.switched));
	return {
		...u,
		problems: [...r, ...u.problems],
		fromOldFile: l,
		modules: o,
		oldFile: c ? s : null,
		wroteStarter: !1
	};
}
//#endregion
//#region plugins/beta/snippets/ui/src/rank.ts
var me = (e, t) => {
	let n = 0;
	for (let r = 0; r < t.length && n < e.length; r++) t[r] === e[n] && (n === 0 && r > 0 && /[a-z]/.test(t[r - 1]) || n++);
	return n === e.length;
};
function he(e, t) {
	let n = e.plain.trim();
	if (n === t) return -1;
	if (n.startsWith(t)) return 0;
	let r = t.toLowerCase(), i = e.name?.toLowerCase();
	return t.length < 3 || !i ? null : i.includes(r) ? 1 : me(r, i) ? 2 : null;
}
//#endregion
//#region plugins/beta/snippets/ui/src/settings.ts
var ge = {
	kind: "math",
	form: "inline",
	textArg: !1
}, X = 150, Z = (e, t = "", n) => {
	let r = document.createElement(e);
	return t && (r.style.cssText = t), n !== void 0 && (r.textContent = n), r;
}, Q = "font-weight:600;margin:14px 0 6px;color:var(--text);", $ = "color:var(--text-muted);font-size:.92em;", _e = (e) => [
	e.math && (e.display && e.inline ? "math" : e.display ? "display math" : "inline math"),
	e.text && "text",
	e.code && (e.langs ? e.langs.join(", ") : "code")
].filter(Boolean).join(" · ");
function ve(e, t) {
	let n = [...e.problems], r = /* @__PURE__ */ new Map();
	for (let t of e.snippets) {
		if (!t.plain || t.visual) continue;
		let e = `${t.plain}\u0000${_e(t)}\u0000${t.auto}`, i = r.get(e);
		i ? n.push({
			source: t.source,
			what: `“${t.shown}” never fires: an earlier one takes it (${i.source}).`
		}) : r.set(e, t);
	}
	for (let r of e.snippets) for (let [e, i] of Object.entries(r.test ?? {})) {
		let a = t.simulate(e, r.text ? { kind: "text" } : ge);
		a !== i && n.push({
			source: r.source,
			what: `“${r.shown}”: typing ${e} gives ${a}, not ${i}.`
		});
	}
	return n;
}
function ye(e) {
	let t = [], n = [...e.snippets().filter((e) => e.math && e.auto && e.plain && /^[A-Za-z]{2,}$/.test(e.plain)).map((e) => e.plain), ...e.made().filter((e) => e.length >= 3)];
	for (let r of A) n.some((e) => r.startsWith(e)) || e.simulate(`${r} `, ge) !== `${r} ` && t.push(r);
	return t;
}
var be = [
	{
		label: "inline math",
		place: ge
	},
	{
		label: "display math",
		place: {
			kind: "math",
			form: "display",
			textArg: !1
		}
	},
	{
		label: "text",
		place: { kind: "text" }
	},
	{
		label: "code",
		place: {
			kind: "code",
			lang: ""
		}
	}
];
function xe(e, t) {
	let n = Z("div", "display:flex;gap:8px;align-items:center;"), r = Z("input", "flex:1;min-width:0;");
	r.placeholder = "Type keys, e.g. a/b or sr ; Tab: a tab stop", r.setAttribute("aria-label", "Try snippets");
	let i = Z("select");
	i.setAttribute("aria-label", "Typed in"), be.forEach((e, t) => i.append(Object.assign(Z("option", "", e.label), { value: String(t) })));
	let a = Z("code", "display:block;min-height:1.4em;margin-top:6px;padding:6px 8px;border-radius:6px;background:var(--bg-alt);color:var(--text);white-space:pre-wrap;");
	a.dataset.testid = "snippet-try-out";
	let o = () => {
		try {
			a.textContent = r.value ? t.simulate(r.value, be[+i.value].place) : "", a.style.color = "var(--text)";
		} catch (e) {
			a.textContent = String(e.message ?? e), a.style.color = "var(--red)";
		}
	};
	r.onkeydown = (e) => {
		e.key !== "Tab" || e.shiftKey || (e.preventDefault(), r.setRangeText("	", r.selectionStart ?? r.value.length, r.selectionEnd ?? r.value.length, "end"), o());
	}, r.oninput = o, i.onchange = o, n.append(r, i), e.append(Z("div", Q, "Try"), n, a);
}
function Se(e, t) {
	let { engine: n, ctx: r } = t, i = Z("div"), a = Z("div"), o = Z("div"), s = Z("div"), l = Z("div");
	e.append(i, a, s, o, l), xe(a, n);
	let u = () => {
		let e = t.read();
		if (i.replaceChildren(), e.fromOldFile) {
			let e = Z("div", "display:flex;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);");
			e.append(Z("div", "flex:1;", "These come from the old snippet file ([latex] snippets_file in the settings file). Converting writes a JavaScript module beside it, with the known misfires mended and listed at its top. The old file is left as it was."));
			let n = Z("button", "", "Convert");
			n.className = "btn primary", n.onclick = () => void t.convert().then(u), e.append(n), i.append(e);
		} else e.modules.length ? i.append(Z("div", $, `From ${e.modules.join(", ")}: the vault's own files, the one place snippets come from. A switch here turns one off (or on) without touching the file.`)) : i.append(Z("div", $, "No snippets yet: put a JavaScript module in .atlas/snippets/."));
		let a = le(r.settings().switched), d = (e) => {
			a.has(e) ? a.delete(e) : a.add(e), r.save({ switched: JSON.stringify([...a].sort()) }).then(() => t.reload()).then(u);
		}, f = (e, t, n) => {
			let r = Z("input");
			return r.type = "checkbox", r.checked = t, r.setAttribute("aria-label", e), r.onchange = () => d(n), r;
		};
		if (o.replaceChildren(), e.options.length) {
			o.append(Z("div", Q, "Options"));
			for (let t of e.options) {
				let e = Z("label", "display:flex;gap:10px;align-items:baseline;padding:3px 0;cursor:pointer;"), n = Z("span");
				n.append(Z("span", "", t.title), Z("span", `${$}margin-left:8px;`, `${t.description} ${t.count} snippet${t.count === 1 ? "" : "s"} · ${t.source}`)), e.append(f(`Option ${t.title}`, t.on, `option:${t.id}`), n), o.append(e);
			}
		}
		s.replaceChildren();
		let p = ve(e, n), m = (e) => {
			if (s.replaceChildren(), e.length) {
				s.append(Z("div", Q, `Problems (${e.length})`));
				for (let t of e) {
					let e = Z("div", "padding:2px 0;");
					e.dataset.testid = "snippet-problem", e.append(Z("span", "color:var(--red);", t.what), Z("span", `${$}margin-left:8px;`, t.source)), s.append(e);
				}
			}
		};
		m(p), setTimeout(() => {
			let e = ye(n);
			e.length && m([...p, {
				source: "typed in math",
				what: `${e.length} ordinary words change: ${e.slice(0, 40).join(", ")}${e.length > 40 ? "…" : ""}`
			}]);
		}, 0);
		let h = new Set(e.options.filter((e) => !e.on).map((e) => e.id)), g = new Map(e.options.map((e) => [e.id, e.title]));
		l.replaceChildren(Z("div", Q, `Snippets (${e.all.length}, ${e.snippets.filter((e) => !e.alias).length} on)`));
		let _ = Z("input", "width:100%;box-sizing:border-box;margin-bottom:8px;");
		_.placeholder = "Search triggers, names, what they give, files…", _.setAttribute("aria-label", "Search snippets");
		let v = Z("div", "display:grid;grid-template-columns:auto minmax(70px,1fr) minmax(0,2.4fr) auto;gap:4px 12px;align-items:center;"), y = () => {
			let n = _.value.trim().toLowerCase(), r = e.all.filter((e) => !n || e.shown.toLowerCase().includes(n) || e.name?.toLowerCase().includes(n) || e.source.toLowerCase().includes(n) || e.option && g.get(e.option)?.toLowerCase().includes(n) || typeof e.body == "string" && e.body.toLowerCase().includes(n));
			v.replaceChildren();
			for (let e of r.slice(0, X)) {
				let n = !!e.option && h.has(e.option), r = f(`Snippet ${e.shown}`, !a.has(e.key), e.key);
				n && (r.disabled = !0, r.title = `Off with its option, ${g.get(e.option)}`);
				let i = Z("div", "min-width:0;overflow:hidden;"), o = typeof e.body == "string" ? e.body : null;
				if (o && e.math && !e.regex) {
					let e = Z("span", "display:inline-block;max-width:100%;overflow:hidden;vertical-align:middle;");
					try {
						t.atlas.editor.drawMath(e, c(o), !1);
					} catch {
						e.textContent = o;
					}
					i.append(e);
				}
				let s = e.name ?? (o ? o.replace(/\s+/g, " ") : "(computed)");
				i.append(Z("code", `${$}margin-left:8px;white-space:nowrap;`, s)), e.note && i.append(Z("span", `${$}margin-left:8px;`, e.note));
				let l = Z("div", `${$}white-space:nowrap;text-align:right;`, `${e.auto ? "" : "Tab · "}${_e(e)} · ${e.option ? g.get(e.option) : e.source}`), u = Z("code", `color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${n || a.has(e.key) ? "opacity:.5;text-decoration:line-through;" : ""}`, e.shown);
				v.append(r, u, i, l);
			}
			r.length > X && v.append(Z("div", `${$}grid-column:1/-1;`, `and ${r.length - X} more: search to find them.`));
		};
		_.oninput = y, y(), l.append(_, v);
	};
	u();
}
//#endregion
//#region plugins/beta/snippets/ui/src/main.ts
async function Ce(e) {
	let t = oe(e), n = null, r = async () => (n = await pe(e), t.use(n), n.wroteStarter && e.toast("Snippets", `The plugin's LaTeX set is now ${J}, kept current by the plugin (a replaced copy goes to .atlas/trash). Settings → Snippets switches each snippet and option; your own snippets go in another file there.`, "info"), n);
	e.editor.extension(t.extension), e.editor.claimTab(t.claim), await r(), t.loadWords().catch((e) => console.warn("snippets: the word list did not load, only the short one holds:", e)), e.onFilesChanged((e) => {
		(!e.length || e.some((e) => e.startsWith(".atlas/snippets/") || e === ".atlas/config.toml")) && r();
	});
	let i = (e, n) => t.placeOf(e, n), a = (e) => e.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\d+/g, "").replace(/\s+/g, " ").trim();
	e.editor.registerCompletion({
		where: "all",
		trigger: /[A-Za-z@:][\w@:]*$/,
		applies: ({ view: e, pos: t, explicit: n, before: r }) => {
			if (n) return !0;
			if ((/[A-Za-z@:][\w@:]*$/.exec(r)?.[0].length ?? 0) < 2) return !1;
			let a = i(e, t);
			return a.kind === "math" && !a.textArg;
		},
		complete: (n) => {
			let r = i(n.view, n.pos), o = n.word, s = t.snippets().filter((e) => e.plain?.trim() && !e.alias && typeof e.body == "string" && !e.visual && t.fits(e, r, n.view));
			for (let r = 0; r <= Math.max(0, o.length - (n.explicit ? 1 : 2)); r++) {
				if (r > 0 && /[A-Za-z]/.test(o[r - 1])) continue;
				let i = o.slice(r), l = s.map((e) => [e, he(e, i)]).filter(([, e]) => e !== null);
				if (!l.length) continue;
				let u = l.sort(([e, t], [n, r]) => t - r || e.plain.length - n.plain.length || e.plain.localeCompare(n.plain)).map(([e]) => e).slice(0, 50).map((n) => {
					let r = n.body;
					return {
						label: n.plain.trim(),
						detail: n.name ?? a(r).slice(0, 48),
						kind: "keyword",
						apply: (e, i, a) => t.insert(e, r, i, a, "", n.legacyStops),
						info: n.math ? () => {
							let t = document.createElement("div");
							return e.editor.drawMath(t, c(r), !1), t;
						} : void 0
					};
				});
				return {
					from: n.pos - o.length + r,
					items: u
				};
			}
			return null;
		}
	});
	let o = async () => {
		let t = n?.oldFile ?? await e.editor.legacySnippets().catch(() => null);
		if (!t?.sources.some((e) => e.trim())) {
			e.toast("Snippets", "There is no old snippet file to convert here.", "info");
			return;
		}
		let i = ce;
		if (n?.modules.includes(i)) {
			e.toast("Snippets", `${i} is there already. Move it aside to convert again.`, "info");
			return;
		}
		let { text: a, kept: o, dropped: s } = D(t);
		await e.writeText(i, a), await r(), e.toast("Snippets", `${o} snippets in ${i}, ${s.length} changes listed at its top. The old file was left as it was.`, "success"), e.open(i);
	};
	e.registerCommand({
		id: "convert",
		title: "Snippets: convert the old snippet file",
		run: o
	}), e.plugin.registerSettingsSection({
		id: "snippets",
		title: "Your snippets",
		place: "before",
		hint: "What fires, where it fires, and what is wrong. Snippet files are JavaScript and run with what a plugin may do.",
		mount: (i, a) => Se(i, {
			atlas: e,
			engine: t,
			ctx: a,
			read: () => n,
			reload: r,
			convert: o
		})
	});
}
//#endregion
export { Ce as register };
