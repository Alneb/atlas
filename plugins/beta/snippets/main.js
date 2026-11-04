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
		shown: String(e)
	};
}
var c = (e) => [...new Set(e)].sort((e, t) => t.length - e.length).map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
function l(e, t) {
	let n = c(e.names);
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
		shown: r
	}), i = [r(RegExp(`(^|[^\\\\])(${n})$`), "[[0]]\\[[1]]", `${e.names.length} commands, bare`, "A command's backslash"), r(RegExp(`\\\\(${n})([A-Za-z])$`), "\\[[0]] [[1]]", `${e.names.length} commands + letter`, "A space after a command")];
	return e.digit === "space" && i.push(r(RegExp(`\\\\(${n})(\\d)$`), "\\[[0]] [[1]]", `${e.names.length} commands + digit`, "A space before a number")), e.digit === "subscript" && i.push(r(RegExp(`\\\\(${n})(\\d)$`), "\\[[0]]_{[[1]]}", `${e.names.length} commands + digit`, "A digit as a subscript")), i;
}
function u(e) {
	let t = {};
	for (let n of e) for (let e of n.entries) e?.type === "vars" && Object.assign(t, e.vars);
	let n = [], r = [], i = [], a = [], o = /* @__PURE__ */ new Set(), c = (e) => `${e.shown}\u0000${e.math}${e.text}${e.code}${e.visual}`, u = !1, f = (e) => u ? !o.has(c(e)) : (o.add(c(e)), !0);
	for (let o of e) {
		u = !!o.pack;
		for (let e of o.entries) {
			if (!e || typeof e != "object" || !("type" in e)) {
				a.push({
					source: o.source,
					what: `not an entry: ${JSON.stringify(e)?.slice(0, 60)}`
				});
				continue;
			}
			if (e.type !== "vars") {
				if (e.type === "words") {
					i.push(...e.words.map((e) => e.toLowerCase()));
					continue;
				}
				if (e.type === "commands") {
					n.push(...l(e, o.source).filter(f)), r.push(...e.names);
					continue;
				}
				for (let r of e.triggers) try {
					let i = s(r, e, t, o.source);
					f(i) && n.push(i);
				} catch (e) {
					a.push({
						source: o.source,
						what: `${String(r)}: ${String(e.message ?? e)}`
					});
				}
			}
		}
	}
	for (let e of Object.values(t)) r.push(...String(e).split("|").filter((e) => /^[A-Za-z]{2,}$/.test(e)));
	let p = n.map((e, t) => [e, t]).sort((e, t) => t[0].priority - e[0].priority || e[1] - t[1]).map(([e]) => e);
	p.push(...d(p, new Set(r)));
	for (let e of p) e.plain && /^[A-Za-z]{2,}$/.test(e.plain) && r.push(e.plain);
	return {
		snippets: p,
		known: [...new Set(r)],
		words: i,
		problems: a
	};
}
function d(e, t) {
	let n = e.filter((e) => e.math && !e.text && e.auto && !e.regex && !!e.plain && /^[A-Za-z]{4,}$/.test(e.plain)), r = /* @__PURE__ */ new Set([...t, ...e.flatMap((e) => e.plain ? [e.plain] : [])]), i = [];
	for (let e of n) for (let t = e.plain.length - 1; t >= 3; t--) {
		let a = e.plain.slice(0, t);
		if (r.has(a) || n.some((t) => t !== e && t.plain.startsWith(a))) break;
		i.push({
			...e,
			plain: a,
			shown: a,
			priority: e.priority - 1
		});
	}
	return i;
}
function f(e) {
	let t = e;
	return /^\s*(#|---)/.test(t) && (t = /```(?:js|javascript|json)?\s*([\s\S]*?)```/.exec(t)?.[1] ?? t), t = t.replace(/^\s*import\b[^\n;]*;?\s*$/gm, "").trim(), t = t.replace(/^(?:export\s+default\s+|(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)/, ""), t = t.replace(/;?\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/, "").trim().replace(/;\s*$/, ""), Function(`return (${t});`)();
}
function p(e) {
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
function m(e) {
	let t = [], n = [], r = "the old snippet file";
	if (e.variables.trim()) try {
		t.push(i.vars(f(e.variables)));
	} catch (e) {
		n.push({
			source: "the old variables file",
			what: String(e)
		});
	}
	for (let i of e.sources) try {
		let e = f(i);
		if (Array.isArray(e)) for (let n of e) {
			let e = p(n);
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
function h(e) {
	let t = [...e.matchAll(/\$\{?(\d+)/g)].map((e) => Number(e[1]));
	if (!t.length) return e;
	let n = Math.max(...t), r = RegExp(`\\$${n}$`).test(e) && !RegExp(`\\$\\{${n}\\b`).test(e) && t.filter((e) => e === n).length === 1;
	return e.replace(/\$(\{?)(\d+)/g, (e, t, i) => {
		let a = Number(i);
		return `$${t}${r && a === n ? 0 : a + 1}`;
	});
}
var g = (e) => e instanceof RegExp ? String(e) : e, _ = /* @__PURE__ */ new Map([
	["([A-Z])T", "turned UT, NT and k_BT into transposes; ^{\\top} is not used in the notes"],
	["=d", "turned x=d into x\\Downarrow; never used"],
	["=u", "turned v=u into v\\Uparrow; never used"],
	["u=d", "never used"],
	["d=u", "never used"],
	["and", "turned band into b\\cap; never used"],
	["_([a-zA-Z0-9]{2,})", "could not fire: _ has already become _{"],
	["/([A-Za-z])_(\\d\\d)/", "could not fire: _ has already become _{"],
	["\\leq>", "a chain through <=; <=> is its own trigger"]
]), v = /* @__PURE__ */ new Set([
	"([^\\\\])(${GREEK}|${SYMBOL}|${MORE_SYMBOLS})",
	"\\\\(${GREEK}|${SYMBOL}|${MORE_SYMBOLS})([A-Za-z])",
	"/([^\\\\])(exp|log|ln)/",
	"/([^\\\\])(det)/",
	"/([^\\\\])(arcsin|sin|arccos|cos|arctan|tan|csc|sec|cot)/",
	"/\\\\(arcsin|sin|arccos|cos|arctan|tan|csc|sec|cot)([A-Za-gi-z])/",
	"/\\\\(sinh|cosh|tanh|coth)([A-Za-z])/"
]), y = "arcsin arccos arctan arccot arccsc arcsec sin cos tan cot csc sec sinh cosh tanh coth sech csch exp log ln det".split(" "), b = new Set("mV Vol kV VA kVA MVA VAR kVAR mW WATT kW uA mA Amp mOhm Ohm kOhm MOhm PU PF dB".split(" ")), x = [
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
], S = (e) => JSON.stringify(e);
function C(e) {
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
function w(e) {
	let t = String(e.options ?? ""), n = e.trigger instanceof RegExp || t.includes("r"), r = e.trigger instanceof RegExp ? String(e.trigger) : S(String(e.trigger)), i = typeof e.replacement == "function", a = i ? String(e.replacement) : S(h(String(e.replacement))), o = [];
	n && !(e.trigger instanceof RegExp) && o.push("regex: true"), i && o.push("legacyStops: true"), t.includes("w") && o.push("word: true"), e.priority && o.push(`priority: ${e.priority}`), e.description && o.push(`name: ${S(e.description)}`);
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
function ee(e) {
	let t = [], n = [], r = 0, i = !1, a = e.variables.trim() ? f(e.variables) : {}, o = (e) => (a[`\${${e}}`] ?? "").split("|").filter(Boolean);
	for (let a of e.sources) {
		let e = f(a);
		if (!Array.isArray(e)) continue;
		let { before: s, end: c } = C(a);
		e.forEach((e, a) => {
			for (let e of s.get(a) ?? []) t.push(`  ${e}`);
			let c = e;
			for (let e of x) if (c && e.when(c)) {
				let t = g(c.trigger);
				c = e.to(c), n.push(`${t}: ${e.why}`);
			}
			if (!c || c.trigger == null || c.replacement == null) return;
			let l = g(c.trigger);
			if (_.has(l)) {
				n.push(`${l}: ${_.get(l)}`);
				return;
			}
			if (v.has(l)) {
				i || (i = !0, n.push("the spacing regexes: one rule, in two commands(...) lines"), t.push("  // the automatic spacing: a bare name gets its backslash, a letter after a command a space"), t.push(`  commands(${JSON.stringify(o("GREEK"))}, { digit: "subscript" }),`), t.push(`  commands(${JSON.stringify([.../* @__PURE__ */ new Set([
					...o("SYMBOL"),
					...o("MORE_SYMBOLS"),
					...y
				])])}, { digit: "space" }),`));
				return;
			}
			if (typeof c.trigger == "string" && b.has(c.trigger)) {
				t.push(`  // off, in the Electrical units pack: ${w(c)}`), r++;
				return;
			}
			if (c.trigger === "-d" || c.trigger === "-u") {
				t.push(`  ${w(c).replace(/\),$/, ", { when: (at) => !/[A-Za-z0-9})]$/.test(at.before) }),")}`), n.push(`${c.trigger}: not after an operand, so a-d stays a subtraction`), r++;
				return;
			}
			String(c.trigger) === "/([A-Za-z])(\\d)/" && (c = {
				...c,
				trigger: /(?<![\\A-Za-z])([A-Za-z])(\d)/
			}, n.push("letter + digit: not when the letter ends a command, so \\times10 is safe")), t.push(`  ${w(c)}`), r++;
		});
		for (let e of c) t.push(`  ${e}`);
	}
	return {
		text: `${[
			"// Written by Snippets: convert from the old snippet file, which was left as it was. Edit freely: this file is yours.",
			...n.length ? ["// Changed from the old file, as one batch:", ...n.map((e) => `//   ${e}`)] : [],
			"export default ({ math, text, code, visual, anywhere, commands, words, vars, std }) => [",
			...Object.keys(a).length ? [`  vars(${JSON.stringify(a)}),`] : [],
			...t
		].join("\n")}\n];\n`,
		kept: r,
		dropped: n
	};
}
//#endregion
//#region plugins/beta/snippets/ui/src/stops.ts
function T(e, t = "", n = !1) {
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
function E(e) {
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
		let { text: o, stops: c } = T(t, i, a), l = c.map((e) => e.map((e) => ({
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
var D = "achieve achieved actors actually agree aligned all allow allowed allsec analogous anderson angle another app appear appears applications apply applying approach approaches appropriate approximation archive around assets assume atom atomic atoms auto automatically axis band bands bandwidth bare basically bastante become becomes been begins between bigger bipartite bottom bound boundary box branch branches brothers call called callout capture captures catalog cell challenges change changes changing closing coexistence coincide color colorblind comes command commands comment comments commit common commutation commute commutes compilation constant constants continuation continued contributors controlled copies copy copyright correct correction correlated correlation correlations corresponding corresponds cosas cost coveralls crossing cuando cumul cumulant cuprates custom cutoff damping decreasing dee deep degeneracy degenerate degrees design designed details determined detuned developing differ difference differences different difficult diffraction director directory distance eigenvectors either eliminate ellos enable entanglement equivalent escape essentially esto estoy exchange exist existing expand expanded expansion expect expected experimental experimentally experiments explain explicitly exponential exponentially exponents export expressed expression expressions factor factorized fall falls fill filled filling finally follow following follows formally formula formulas found fraction free freedom freely full fund fundamental funds further generators geometry grand ground hamiltonian hand handle happen happens historia history hopping hoppings important inbox include included includes including incomplete incompressible increase increases increasing infinite infinity info information install installation installed insulator insulators integer integral integrate integrated intensity inter interact interacting interaction interactions interesting interface interference intermediate internship into intro introduce introduction invariant inverse inversion irreps island jupytext karakeep keep keeps lands language languages letterboxd library limit machine macroscopic mapped matching maximum maxiter meeting menu meta metal metallic microscopic minimum missing mixing mode model models modern modes modificados modification modified modify modulation module moment momenta momentum mother much muchas mucho multiple multitext mundo music must muy need needed needs negative normal normalization normalized nublado nuestro null number numbers numerical numerically numpy occupancy occupation occupied onto operator operators opposite other otherwise parameter parameters parte particle particles particular partie partner partners parts phenomena photon pick pinned pip point points power preset principal principle produced produces product products propagating propagation properties property proportional proposed quadratic quasiparticle range rather readthedocs really repository reproduce restart retain second secret secrets section sector sectors see seed seems sees separate separated sets settings setup sign similar simple simulation simulations since single singlet singular small smaller smallest some something speed spin spins stand standard stands start started starting steps still stop stopped stops strange subbath subbaths subject submit subspace subtopic summer superconductor superconductors support suppressed sweep sweeps tanto that their them theme themes themselves then theory there therefore thermal these thesis they three toda today todo todos together tokens tol tolerance too tool tools top topic topics topology tot total touches toward tpi typical unchanged under understand understanding upper using usually valley vector vectors wavevector weather week well what whether will www".split(" "), O = /^(?:\\[A-Za-z]+|\\.|[^A-Za-z\s])/, k = /^\\(?:langle|lvert|lVert|lfloor|lceil|lbrace)(?![A-Za-z])/, A = /^\\(?:rangle|rvert|rVert|rfloor|rceil|rbrace)(?![A-Za-z])/, j = /^\\(begin|end)\{([A-Za-z]+\*?)\}/, te = /^(?:equation|align|alignat|flalign|gather|multline|eqnarray|displaymath|math)\*?$/;
function M(e) {
	let t = [], n = (e, n, r) => (t.push({
		from: e,
		to: e + n,
		kind: r
	}), e + n);
	for (let t = 0; t < e.length;) {
		let r = e.slice(t, t + 32), i = r[0], a = i === "\\" ? j.exec(r) : null;
		a ? t = te.test(a[2]) ? n(t, a[0].length, "bound") : t + a[0].length : r.startsWith("\\left") && !/^\\left[A-Za-z]/.test(r) ? t = n(t, 5 + (O.exec(r.slice(5))?.[0].length ?? 0), "open") : r.startsWith("\\right") && !/^\\right[A-Za-z]/.test(r) ? t = n(t, 6 + (O.exec(r.slice(6))?.[0].length ?? 0), "close") : k.test(r) ? t = n(t, k.exec(r)[0].length, "open") : A.test(r) ? t = n(t, A.exec(r)[0].length, "close") : r.startsWith("\\{") ? t = n(t, 2, "open") : r.startsWith("\\}") ? t = n(t, 2, "close") : r.startsWith("\\[") || r.startsWith("\\(") || r.startsWith("\\]") || r.startsWith("\\)") ? t = n(t, 2, "bound") : i === "\\" ? t += /^\\(?:[A-Za-z]+|.|$)/s.exec(r)?.[0].length ?? 1 : "{([".includes(i) ? t = n(t, 1, "open") : "})]".includes(i) ? t = n(t, 1, "close") : i === "$" ? t = n(t, r[1] === "$" ? 2 : 1, "bound") : i === "\n" && /^\n[ \t]*\n/.test(r) ? t = n(t, 1, "wall") : t++;
	}
	return t;
}
function N(e) {
	let t = M(e), n = t[0];
	if (!n || n.kind === "wall") return null;
	if (n.kind !== "close") return n.to;
	let r = t[1], i = e.slice(n.to, r?.from ?? n.to);
	return r?.kind === "open" && (i === "" || i === "^" || i === "_") ? r.to : n.to;
}
function P(e) {
	let t = M(e), n = t[t.length - 1];
	if (!n || n.kind === "wall") return null;
	if (n.kind !== "open") return n.from;
	let r = +!!/[\^_]$/.test(e.slice(0, n.from)), i = n.from - r, a = t[t.length - 2];
	return a?.kind === "close" && a.to === i ? a.from : i;
}
//#endregion
//#region plugins/beta/snippets/ui/src/sorted-words.ts
var ne = class {
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
}, re = 120, ie = "langle rangle lvert rvert lVert rVert lfloor rfloor lceil rceil hbar hslash ell nabla partial infty mathbb mathbf mathcal mathrm mathfrak mathscr mathit boldsymbol text textbf textit operatorname overline underline overbrace underbrace widehat widetilde hat bar tilde vec dot ddot sqrt frac dfrac tfrac binom left right bigl bigr sum prod int iint oint lim limsup liminf sup inf max min exp log ln sin cos tan cot sec csc sinh cosh tanh arcsin arccos arctan det dim ker deg gcd cdot cdots ldots vdots ddots times div pm mp leq geq neq approx equiv sim simeq propto cong to mapsto rightarrow leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow uparrow downarrow forall exists in notin subset subseteq supset supseteq cup cap setminus emptyset varnothing wedge vee oplus otimes dagger quad qquad angle triangle top bot bra ket braket ketbra".split(" "), F = class {
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
function I(e) {
	let t = e.length > 1 ? e[e.length - 1] : void 0;
	return t && e[0].endsWith(t) ? t : e[0];
}
function ae(e) {
	let t = e.editor.codemirror, n = E(t), { EditorView: r, keymap: i } = t.view, { Prec: a } = t.state, o = [], s = ie, c = new F(D, null), l = [], u = null;
	async function d() {
		let t = await fetch(e.assetUrl("words.txt"));
		if (!t.ok) throw Error(`words.txt: ${t.status}`);
		return u = new ne(await t.text()), c = new F([...D, ...l], u), u.size;
	}
	let f = !1;
	function p(e) {
		o = e.snippets, s = [.../* @__PURE__ */ new Set([...ie, ...e.known])], l = e.words, c = new F([...D, ...l], u), f = e.snippets.some((e) => e.code && e.langs !== null);
	}
	let m = /* @__PURE__ */ new WeakMap(), h = (t, n) => m.get(t) ?? e.editor.place(t, n), g = (t) => m.has(t) || f || /\.(md|markdown|tex)$/i.test(e.editor.path(t)), _ = (t, n, r = "") => ({
		before: n,
		selection: r,
		after: t.state.sliceDoc(t.state.selection.main.head, t.state.doc.lineAt(t.state.selection.main.head).to),
		path: e.editor.path(t)
	});
	function v(t, n, r) {
		if (t.files && !t.files.some((t) => t.test(e.editor.path(r)))) return !1;
		switch (n.kind) {
			case "code": return t.code && (t.langs ? t.langs.includes(n.lang) : /\.(md|markdown)$/i.test(e.editor.path(r)));
			case "text": return t.text;
			case "math": return !t.math || n.textArg && !t.inTextArg ? !1 : n.form === "display" ? t.display : t.inline;
		}
	}
	function y(e, t, n) {
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
	let b = /* @__PURE__ */ new WeakMap();
	function x(e, t, r, i, a, o, s = "") {
		let c = e.state.sliceDoc(i, a) + o;
		n.insert(e, r, i, a, s, t.legacyStops), b.set(e, {
			doc: e.state.doc,
			from: i,
			to: i + T(r, s, t.legacyStops).text.length,
			typed: c
		});
	}
	function S(e) {
		let t = b.get(e);
		return b.delete(e), !t || t.doc !== e.state.doc ? !1 : (e.dispatch({
			changes: {
				from: t.from,
				to: t.to,
				insert: t.typed
			},
			selection: { anchor: t.from + t.typed.length },
			userEvent: "delete.backward"
		}), n.dropAll(e), !0);
	}
	function C(e, t, n, r, i, a = "") {
		let o = y(t, n, _(e, e.state.sliceDoc(e.state.doc.lineAt(r).from, r)));
		if (o == null) return !1;
		if (o instanceof Promise) {
			let n = e.state.doc;
			return o.then((o) => {
				e.state.doc === n ? x(e, t, o, r, i, a) : console.warn("[snippets]", t.shown, "answered after the text had changed");
			}, (e) => console.warn("[snippets]", t.shown, e)), !0;
		}
		return x(e, t, o, r, i, a), !0;
	}
	let w = (e, t, n) => {
		if (!n.auto || !n.plain || n.plain.length <= t.length || n.visual) return !1;
		for (let r = t.length; r < n.plain.length; r++) {
			let i = n.plain.slice(0, r);
			if (i.endsWith(t) && e.endsWith(i)) return !0;
		}
		return !1;
	}, ee = (e) => !!e.regex && /^\(\?:[^\w\s\\()[\]{}.^$|?*+]/.test(e.regex.source), O = /* @__PURE__ */ new WeakMap();
	function k(e, t) {
		let n = O.get(e);
		return O.delete(e), n && n.at === t && e.state.sliceDoc(n.from, n.to) === (n.m ? n.m[0] : n.s.plain) ? n : null;
	}
	function A(e, t) {
		let n = e.state.sliceDoc(t.to, t.at);
		return C(e, t.s, t.m, t.from, t.at) ? (n && e.dispatch(e.state.replaceSelection(n)), !0) : !1;
	}
	let j = (e) => /[A-Za-z]+$/.exec(e)?.[0] ?? "";
	function te(e, t) {
		if (!/^[A-Za-z]+$/.test(t)) return !1;
		let n = j(e);
		return n.length > t.length && s.some((e) => e.startsWith(n));
	}
	function M(e, t) {
		if (!/^[A-Za-z]+$/.test(t)) return !1;
		let n = j(e);
		return e[e.length - n.length - 1] === "\\" || n.length > t.length && s.some((e) => e.startsWith(n));
	}
	function ae(e, t) {
		if (!/^[A-Za-z]+$/.test(t)) return !1;
		let n = j(e);
		if (n.length <= t.length || e[e.length - n.length - 1] === "\\") return !1;
		let r = n.toLowerCase();
		return c.has(r) || c.grows(r);
	}
	function L(e, t, n) {
		if (/^[A-Za-z]$/.test(n)) return !1;
		let r = e.state.doc.lineAt(t), i = j(e.state.doc.sliceString(Math.max(r.from, t - re), t)).toLowerCase();
		return !i || c.has(i) || !c.grows(i) ? !1 : z(e, t, "", !0, !0);
	}
	function R(e, t) {
		let n = e.state.selection.main.head;
		t === " " && /[ \t]/.test(e.state.sliceDoc(n - 1, n)) || e.dispatch(e.state.replaceSelection(t));
	}
	function z(e, t, n, r, i = !1) {
		if (!o.length) return !1;
		let a = k(e, t);
		if (!a && !i && n && L(e, t, n)) {
			let t = e.state.selection.main.head;
			return z(e, t, n, r) || R(e, n), !0;
		}
		let l = e.state.doc.lineAt(t), u = e.state.doc.sliceString(Math.max(l.from, t - re), t) + n, d, f = () => d ??= h(e, t), p = (e) => t + n.length - e, m = (e) => r === e.auto && !e.visual, g = (t, n) => !t.when || t.when(_(e, u.slice(0, u.length - n))), b = (t) => m(t) && v(t, f(), e), x = (e) => {
			if (!e.plain || !u.endsWith(e.plain)) return !1;
			let t = u.length - e.plain.length;
			return e.word && t > 0 && /[A-Za-z0-9]/.test(u[t - 1]) ? !1 : !M(u, e.plain) && (i || !ae(u, e.plain));
		}, S = null;
		for (let t of o) {
			if (!m(t)) continue;
			let n = t.regex ? t.regex.exec(u) : null;
			if (t.regex ? !n || te(u, I(n)) || !i && ae(u, I(n)) : !x(t)) continue;
			let r = n ? n[0].length : t.plain.length;
			if (v(t, f(), e) && g(t, r)) {
				S = {
					s: t,
					m: n,
					len: r
				};
				break;
			}
		}
		if (S && !S.s.regex && r) {
			let e = S.s;
			for (let t of o) t.priority === e.priority && x(t) && t.plain.length > S.len && b(t) && g(t, t.plain.length) && (S = {
				s: t,
				m: null,
				len: t.plain.length
			});
		}
		let T = j(u), E = p(T.length), D = (e) => !!e && !i && (s.some((t) => t.length > e.length && t.startsWith(e)) || c.grows(e.toLowerCase()));
		if (a && (!S || p(S.len) >= a.to)) {
			let i = e.state.sliceDoc(a.core, t) + n, d = /^[A-Za-z]$/.test(n) && E <= a.core;
			if (!S && (o.some((e) => w(u, i, e) && b(e)) || d && D(T))) return O.set(e, {
				...a,
				at: t + n.length
			}), !1;
			if (!S && d && c.has(T.toLowerCase())) return !1;
			let f = j(e.state.sliceDoc(l.from, t));
			if (!S && !d && f.length > (a.m ? I(a.m) : a.s.plain).length && c.has(f.toLowerCase())) return !1;
			if (!S && d && s.includes(T)) {
				if (u[u.length - T.length - 1] === "\\") return !1;
				let n = y(a.s, a.m, _(e, ""));
				return typeof n == "string" && n.includes("\\" + T) ? C(e, a.s, a.m, a.from, t) : (e.dispatch({
					changes: {
						from: E,
						to: t,
						insert: "\\" + T
					},
					selection: { anchor: E + T.length + 1 },
					userEvent: "input.complete"
				}), !0);
			}
			if (!A(e, a)) return !1;
			let p = e.state.selection.main.head;
			return n && !z(e, p, n, r) && R(e, n), !0;
		}
		if (!S) return !1;
		let N = S.s, P = S.m ? I(S.m) : N.plain;
		if (r && n && (o.some((e) => e !== N && w(u, P, e) && b(e)) || /^[A-Za-z]+$/.test(P) && !ee(N) && D(T))) {
			let r = p(S.len), i = t + n.length;
			return O.set(e, {
				s: N,
				m: S.m,
				from: r,
				to: i,
				core: i - P.length,
				at: i
			}), !1;
		}
		return C(e, N, S.m, p(S.len), t, n);
	}
	function B(e, t, n, r) {
		let i = h(e, t), a = o.find((t) => t.visual && t.plain === r && v(t, i, e));
		if (!a) return !1;
		let s = e.state.sliceDoc(t, n), c = y(a, null, _(e, e.state.sliceDoc(e.state.doc.lineAt(t).from, t), s));
		if (c == null) return !1;
		if (c instanceof Promise) {
			let r = e.state.doc;
			return c.then((i) => {
				e.state.doc === r && x(e, a, i, t, n, "", s);
			}, (e) => console.warn("[snippets]", a.shown, e)), !0;
		}
		return x(e, a, c, t, n, "", s), !0;
	}
	function oe(e, t, n) {
		return !")]}".includes(n) || e.state.sliceDoc(t, t + 1) !== n || h(e, t).kind !== "math" ? !1 : (e.dispatch({
			selection: { anchor: t + 1 },
			userEvent: "select"
		}), !0);
	}
	function V(e, t, r) {
		return r === "{" && n.active(e.state) && /[_^]\{$/.test(e.state.sliceDoc(Math.max(0, t - 2), t)) && e.state.sliceDoc(t, t + 1) === "}";
	}
	function H(e) {
		let { head: t } = e.state.selection.main, n = N(e.state.doc.sliceString(t, Math.min(e.state.doc.length, e.state.doc.lineAt(t).to + 4e3)));
		return n === null ? null : t + n;
	}
	function U(e, t) {
		return t !== null && (e.dispatch({
			selection: { anchor: t },
			scrollIntoView: !0
		}), !0);
	}
	let W = (e) => U(e, H(e));
	function G(e) {
		let { head: t } = e.state.selection.main, n = Math.max(0, t - 4e3), r = P(e.state.doc.sliceString(n, t));
		return U(e, r === null ? null : n + r);
	}
	function K(e) {
		let t = k(e, e.state.selection.main.head);
		return !!t && A(e, t);
	}
	function q(e, t, n, r) {
		return r.length !== 1 || e.state.selection.ranges.length > 1 || !g(e) ? !1 : t === n ? V(e, t, r) ? !0 : z(e, t, r, !0) || oe(e, t, r) : B(e, t, n, r);
	}
	let J = (e) => h(e, e.state.selection.main.head).kind === "math", se = {
		overList: (e) => O.has(e) || n.active(e.state),
		whileAsking: (e) => O.has(e) || n.active(e.state) || J(e)
	}, Y = [
		a.high(r.inputHandler.of((e, t, n, r) => q(e, t, n, r))),
		n.extension,
		a.highest(i.of([{
			key: "Backspace",
			run: S
		}, {
			key: "Escape",
			run: (e) => (n.dropAll(e), !1)
		}])),
		a.high(i.of([{
			key: "Tab",
			run: (e) => {
				if (!g(e)) return n.next(e);
				let t = e.state.selection.main.empty, r = e.state.selection.main.head;
				if (t && (K(e) || z(e, r, "", !1) || !n.active(e.state) && L(e, r, ""))) return !0;
				let i = t && J(e), a = n.currentEnd(e.state), o = i && a !== null ? H(e) : null;
				return o !== null && o <= a ? W(e) : n.next(e) || i && W(e);
			},
			shift: (e) => n.prev(e) || g(e) && e.state.selection.main.empty && J(e) && G(e)
		}]))
	];
	function ce(e, i, a = "") {
		let o = new r({ state: t.state.EditorState.create({
			doc: a,
			selection: { anchor: a.length },
			extensions: [n.extension]
		}) });
		m.set(o, i);
		try {
			for (let t of e) {
				let { from: e, to: r } = o.state.selection.main;
				if (t === "	") {
					z(o, e, "", !1) || n.next(o);
					continue;
				}
				q(o, e, r, t) || o.dispatch(o.state.replaceSelection(t));
			}
			return o.state.doc.toString();
		} finally {
			o.destroy();
		}
	}
	return {
		extension: Y,
		claim: se,
		use: p,
		loadWords: d,
		simulate: ce,
		insert: n.insert,
		snippets: () => o,
		fits: v,
		placeOf: h
	};
}
//#endregion
//#region plugins/beta/snippets/ui/src/std.ts
var L = /* @__PURE__ */ t({
	align: () => H,
	greek: () => R,
	matrix: () => V,
	operators: () => z,
	sequence: () => U,
	symbols: () => B
}), R = "alpha beta gamma Gamma delta Delta epsilon varepsilon zeta eta theta vartheta Theta iota kappa lambda Lambda mu nu xi Xi omicron pi Pi varpi rho varrho sigma Sigma varsigma tau upsilon Upsilon phi Phi varphi chi psi Psi omega Omega".split(" "), z = "arcsin arccos arctan arccot arccsc arcsec sinh cosh tanh coth sech csch sin cos tan cot csc sec exp log ln det sum prod int iint iiint oint".split(" "), B = "parallel perp partial nabla hbar ell infty oplus ominus otimes square star dagger vee wedge subseteq subset supseteq supset emptyset exists nexists forall implies impliedby iff setminus neg lor land bigcup bigcap cdot times simeq approx quad qquad leq geq neq gg ll equiv sim propto rightarrow leftarrow Rightarrow Leftarrow leftrightarrow to mapsto cap cup dots vdots ddots langle rangle".split(" "), oe = {
	p: "pmatrix",
	b: "bmatrix",
	B: "Bmatrix",
	v: "vmatrix",
	V: "Vmatrix",
	m: "matrix"
};
function V(e, t, n = "p") {
	let r = oe[n] ?? "pmatrix", i = 1;
	return `\\begin{${r}}\n${Array.from({ length: e }, () => Array.from({ length: t }, () => `\${${i++}}`).join(" & ")).join(" \\\\\n")}\n\\end{${r}}$0`;
}
function H(e) {
	return `\\begin{align}\n${e.split("\n").map((e) => e.trim().replace(/^\$+|\$+$/g, "").trim()).filter(Boolean).map((e) => /(?<![\\<>!])=|\\(?:leq|geq|neq|approx|equiv|sim|simeq|implies|iff)(?![A-Za-z])/.test(e) ? e.replace(/(?<![\\<>!])=|\\(?:leq|geq|neq|approx|equiv|sim|simeq|implies|iff)(?![A-Za-z])/, (e) => `&${e}`) : `&${e}`).join(" \\\\\n")}\n\\end{align}$0`;
}
var U = (e, t) => `${e}_1 ${t} ${e}_2 ${t} \\cdots ${t} ${e}_{\${1:n}}$0`, W = ({ math: e, text: t, visual: n, commands: r, vars: i }) => [
	i({
		"${GREEK}": "alpha|beta|gamma|Gamma|delta|Delta|epsilon|varepsilon|zeta|eta|theta|vartheta|Theta|iota|kappa|lambda|Lambda|mu|nu|xi|omicron|pi|Pi|rho|varrho|sigma|varsigma|Sigma|tau|upsilon|Upsilon|phi|varphi|Phi|chi|psi|Psi|omega|Omega",
		"${SYMBOL}": "parallel|perp|partial|nabla|hbar|ell|infty|oplus|ominus|otimes|oslash|square|star|dagger|vee|wedge|subseteq|subset|supseteq|supset|emptyset|exists|nexists|forall|implies|impliedby|iff|setminus|neg|lor|land|bigcup|bigcap|cdot|times|simeq|approx",
		"${MORE_SYMBOLS}": "qquad|quad|leq|geq|neq|gg|ll|equiv|neq|sim|propto|rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|to|mapsto|cap|cup|sum|prod|exp|ln|log|det|dots|vdots|ddots|int|iint|iiint|oint|tiny|langle|rangle"
	}),
	t("minl", "$$1$", { auto: !0 }),
	t("menv", "$$\n$1\n$$", {
		word: !0,
		auto: !0
	}),
	t("mmln", "$$\\begin{gather}\n$1\n\\end{gather}$$", {
		word: !0,
		auto: !0
	}),
	e("begin", "\\begin{$1}\n$2\n\\end{$1}"),
	e("mbb", "\\mathbb{$1}$0"),
	e("mcal", "\\mathcal{$1}$0"),
	e("mbf", "\\mathbf{$1}$0"),
	e("mrm", "\\mathrm{$1}$0"),
	e("mfrak", "\\mathfrak{$1}$0"),
	e("Hz", "\\space\\text{Hz}"),
	e("ang", "Å"),
	e("deg", "º"),
	e("ST", "\\space\\text{ $1 } $0"),
	e("@a", "\\alpha"),
	e("@b", "\\beta"),
	e("@g", "\\gamma"),
	e("@G", "\\Gamma"),
	e("@d", "\\delta"),
	e("@D", "\\Delta"),
	e("@e", "\\epsilon"),
	e(":e", "\\varepsilon"),
	e("@z", "\\zeta"),
	e("@t", "\\theta"),
	e("@T", "\\Theta"),
	e(":t", "\\vartheta"),
	e("@i", "\\iota"),
	e("@k", "\\kappa"),
	e("@l", "\\lambda"),
	e("@L", "\\Lambda"),
	e("@s", "\\sigma"),
	e("@S", "\\Sigma"),
	e("@u", "\\upsilon"),
	e("@U", "\\Upsilon"),
	e("@o", "\\omega"),
	e("@O", "\\Omega"),
	e("ome", "\\omega"),
	e("Ome", "\\Omega"),
	e("text", "\\text{$1}$0"),
	e("\"", "\\text{$1}$0"),
	e("mbox", "\\mbox{$1}$0"),
	e("tmbox", "\\mbox{\\tiny $1}$0"),
	e("e2", "^{2}$0"),
	e("e3", "^{3}$0"),
	e("e4", "^{4}$0"),
	e("e5", "^{5}$0"),
	e("e6", "^{6}$0"),
	e("e7", "^{7}$0"),
	e("e8", "^{8}$0"),
	e("eplus", "^{\\text{\\small (+)}}$0"),
	e("eminus", "^{\\text{\\small (-)}}$0"),
	e("ee", "e^{ $1 }$0"),
	e("inv", "^{-1}"),
	e("e-1", "^{-1}"),
	e("pow", "^{$1}$0"),
	e("pp", "^{$1}$0"),
	e("tpow", "^{\\text{\\small $1}}$0"),
	e("tpp", "^{\\text{\\small $1}}$0"),
	e("tsub", "_\\text{\\small $1}$0"),
	e("sub", "_{$1}$0"),
	e("--", "_{$1}$0", { priority: -1 }),
	e("_", "_{$1}$0"),
	e(/\^([a-zA-Z0-9]{2,})/, (e) => `\^{${e[1]}\$0}$1`, { legacyStops: !0 }),
	e("sqr", "\\sqrt{ $1 }$0"),
	e("([0-9|n|m|k]{1,})rt", (e) => `\\sqrt[${e[1]}]{ $0 } $1`, {
		regex: !0,
		legacyStops: !0,
		priority: -1
	}),
	e("nrt", (e) => "\\sqrt[${0:n}]{ $1 } $2", {
		regex: !0,
		legacyStops: !0
	}),
	e("//", "\\frac{$1}{$2}$0"),
	e("frac", "\\frac{$1}{$2}$0"),
	e("onehalf", "\\frac{1}{2}"),
	e(/(?<![\\A-Za-z])([A-Za-z])(\d)/, "[[0]]_{[[1]]}", {
		priority: -1,
		name: "Auto letter subscript"
	}),
	r(/* @__PURE__ */ "alpha.beta.gamma.Gamma.delta.Delta.epsilon.varepsilon.zeta.eta.theta.vartheta.Theta.iota.kappa.lambda.Lambda.mu.nu.xi.omicron.pi.Pi.rho.varrho.sigma.varsigma.Sigma.tau.upsilon.Upsilon.phi.varphi.Phi.chi.psi.Psi.omega.Omega".split("."), { digit: "subscript" }),
	r(/* @__PURE__ */ "parallel.perp.partial.nabla.hbar.ell.infty.oplus.ominus.otimes.oslash.square.star.dagger.vee.wedge.subseteq.subset.supseteq.supset.emptyset.exists.nexists.forall.implies.impliedby.iff.setminus.neg.lor.land.bigcup.bigcap.cdot.times.simeq.approx.qquad.quad.leq.geq.neq.gg.ll.equiv.sim.propto.rightarrow.leftarrow.Rightarrow.Leftarrow.leftrightarrow.to.mapsto.cap.cup.sum.prod.exp.ln.log.det.dots.vdots.ddots.int.iint.iiint.oint.tiny.langle.rangle.arcsin.arccos.arctan.arccot.arccsc.arcsec.sin.cos.tan.cot.csc.sec.sinh.cosh.tanh.coth.sech.csch".split("."), { digit: "space" }),
	e(/\\exp ([a-zA-Z0-9]{1,})/, (e) => `\\exp\\left(${e[1]}$0\\right)$1`, { legacyStops: !0 }),
	e("conj", "^{*}"),
	e("Re", "\\mathfrak{Re}"),
	e("Im", "\\mathfrak{Im}"),
	e(/\\mathfrak{Re}([a-zA-Z0-9]{2,})/, (e) => `\\mathfrak{Re}\\left\\{${e[1]}$0\\right\\}$1`, { legacyStops: !0 }),
	e(/\\mathfrak{Im}([a-zA-Z0-9]{2,})/, (e) => `\\mathfrak{Im}\\left\\{${e[1]}$0\\right\\}$1`, { legacyStops: !0 }),
	e("Tr", "\\mathrm{Tr}"),
	e(/\\det ([a-zA-Z0-9]{2,})/, (e) => `\\det\\left(${e[1]}$0\\right)$1`, { legacyStops: !0 }),
	e(/\\mathrm{Tr}([a-zA-Z0-9]{2,})/, (e) => `\\mathrm{Tr}\\left(${e[1]}$0\\right)$1`, { legacyStops: !0 }),
	e("\\\\(${GREEK}),\\.", "\\boldsymbol{\\[[0]]}", { regex: !0 }),
	e("\\\\(${GREEK})\\.,", "\\boldsymbol{\\[[0]]}", { regex: !0 }),
	e("hat", "\\hat{$1}$0"),
	e("bar", "\\bar{$1}$0"),
	e("dot", "\\dot{$1}$0", { priority: -1 }),
	e("ddot", "\\ddot{$1}$0"),
	e("cdot", "\\cdot"),
	e("tilde", "\\tilde{$1}$0"),
	e("und", "\\underline{$1}$0"),
	e("vec", "\\vec{$1}$0"),
	e(/\\hat{([A-Za-z])}(\d)/, "\\hat{[[0]]}_{[[1]]}"),
	e(/\\vec{([A-Za-z])}(\d)/, "\\vec{[[0]]}_{[[1]]}"),
	e(/\\mathbf{([A-Za-z])}(\d)/, "\\mathbf{[[0]]}_{[[1]]}"),
	e("xnn", "x_{n}"),
	e("xii", "x_{i}", { priority: 1 }),
	e("xjj", "x_{j}"),
	e("xp1", "x_{n+1}"),
	e("ynn", "y_{n}"),
	e("yii", "y_{i}"),
	e("yjj", "y_{j}"),
	e("inf", "\\infty"),
	e("sum", "\\sum"),
	e("prod", "\\prod"),
	e("\\sum", "\\sum_{${1:i}=${2:1}}^{${3:N}} $0", { auto: !1 }),
	e("\\prod", "\\prod_{${1:i}=${2:1}}^{${3:N}} $0", { auto: !1 }),
	e("lim", "\\lim_{ ${1:n} \\to ${2:\\infty} } $0"),
	e("+-", "\\pm"),
	e("-+", "\\mp"),
	e("...", "\\dots"),
	e("nab", "\\nabla"),
	e("part", "\\partial"),
	e("xx", "\\times"),
	e("**", "\\cdot"),
	e("para", "\\parallel"),
	e("===", "\\equiv"),
	e("!=", "\\neq"),
	e("=!", "\\neq"),
	e(">=", "\\geq"),
	e("<=", "\\leq"),
	e(">>", "\\gg"),
	e("<<", "\\ll"),
	e("sim=", "\\simeq"),
	e("prop", "\\propto"),
	e("->", "\\rightarrow"),
	e("<-", "\\leftarrow"),
	e("<->", "\\leftrightarrow "),
	e("-u", "\\uparrow", { when: (e) => !/[A-Za-z0-9})]$/.test(e.before) }),
	e("-d", "\\downarrow", { when: (e) => !/[A-Za-z0-9})]$/.test(e.before) }),
	e("u-d", "\\updownarrow"),
	e("d-u", "\\updownarrow"),
	e("=>", "\\Rightarrow"),
	e("=<", "\\Leftarrow"),
	e("<=>", "\\Leftrightarrow"),
	e("|->", "\\mapsto"),
	e("|-->", "\\longmapsto"),
	e("orr", "\\cup"),
	e("inc", "\\in"),
	e("notin", "\\not\\in"),
	e("\\\\\\", "\\setminus"),
	e("sub=", "\\subseteq"),
	e("sup=", "\\supseteq"),
	e("0set", "\\emptyset"),
	e("set", "\\{ $1 \\}$0"),
	e("exists", "\\exists", { priority: 1 }),
	e("LL", "\\mathcal{L}"),
	e("HH", "\\mathcal{H}"),
	e("CC", "\\mathbb{C}"),
	e("RR", "\\mathbb{R}"),
	e("ZZ", "\\mathbb{Z}"),
	e("NN", "\\mathbb{N}"),
	e("eps", "\\epsilon"),
	e("veps", "\\varepsilon"),
	e("vphi", "\\varphi", { priority: 1 }),
	e("vpi", "\\varpi", { priority: 1 }),
	e("the", "\\theta"),
	e("vthe", "\\vartheta", { priority: 1 }),
	e("vrho", "\\varrho", { priority: 1 }),
	e("sig", "\\sigma"),
	e("vsig", "\\varsigma", { priority: 1 }),
	e("ww", "\\omega"),
	e("\\\\(${GREEK}|${SYMBOL}) e2", "\\[[0]]^{2}", { regex: !0 }),
	e("\\\\(${GREEK}|${SYMBOL}) e4", "\\[[0]]^{4}", { regex: !0 }),
	e("\\\\(${GREEK}|${SYMBOL}) pow", "\\[[0]]^{$1}$0", { regex: !0 }),
	e("\\\\(${GREEK}|${SYMBOL}) pp", "\\[[0]]^{$1}$0", { regex: !0 }),
	e("par", "\\frac{ \\partial $1 }{ \\partial $2 } $0", { auto: !1 }),
	e(/pa([A-Za-z])([A-Za-z])/, "\\frac{ \\partial [[0]] }{ \\partial [[1]] } ", { auto: !1 }),
	e(/de([A-Za-z])([A-Za-z])/, "\\frac{ d [[0]] }{ d [[1]] } ", {
		priority: -1,
		auto: !1
	}),
	e("ddt", "\\frac{d}{d${1:t}} $0"),
	e("derv", "\\frac{d${1:x}}{d${2:y}} $0", {
		regex: !0,
		auto: !1
	}),
	e(/([^\\])int/, "[[0]]\\int $0", { priority: -1 }),
	e("\\int", "\\int_{${2:a}}^{${3:b}} d${4:x} $0", { auto: !1 }),
	e("oint", "\\oint"),
	e("iint", "\\iint"),
	e("iiint", "\\iiint"),
	e("oinf", "_{0}^{\\infty} d${1:x} $0"),
	e("iinf", "_{-\\infty}^{\\infty} d${1:x} $0", { priority: 1 }),
	n("U", "\\underbrace{ ${VISUAL} }_{ $1 }"),
	n("O", "\\overbrace{ ${VISUAL} }^{ $1 }"),
	n("B", "\\underset{ $1 }{ ${VISUAL} }"),
	n("C", "\\cancel{ ${VISUAL} }"),
	n("K", "\\cancelto{ $1 }{ ${VISUAL} }"),
	n("S", "\\sqrt{ ${VISUAL} }"),
	e("qham", "\\hat{H}"),
	e("cham", "\\mathcal{H}"),
	e("kb", "k_{\\mbox{\\tiny B}} "),
	e("kbt", "k_{\\mbox{\\tiny B}}T "),
	e("dag", "^{\\dagger}"),
	e("cop", "\\hat{$1}^\\dagger_{$2} $0"),
	e("aop", "\\hat{$1}_{$2} $0"),
	e("o+", "\\oplus "),
	e("ox", "\\otimes "),
	e("bra", "\\bra{$1} $0"),
	e("ket", "\\ket{$1} $0"),
	e("braket", "\\braket{ ${1:\\psi} | ${2:\\psi} } $0"),
	e("brk", "\\braket{ ${1:\\psi} | ${2:\\psi} } $0"),
	e("<|>", "\\braket{ ${1:\\psi} | ${2:\\psi} } $0"),
	e("><", "\\ket{${1:\\psi}} \\bra{${2:\\psi}} $0"),
	e("kbr", "\\ket{${1:\\psi}} \\bra{${2:\\psi}} $0"),
	e("<||>", "\\braket{ ${1:\\psi} | ${2:\\hat{O}} | ${3:\\psi} } $0"),
	e("exv", "\\braket{ ${1:\\psi} | ${2:\\hat{O}} | ${3:\\psi} } $0"),
	e("comm", "\\left[ ${1:A} , ${2:B} \\right] $0"),
	e("acomm", "\\left\\{ ${1:A} , ${2:B} \\right\\} $0"),
	e("fourier", "\\int_{${1:-\\infty}}^{${2:\\infty}} $3 e^{${4}i ${5:\\omega} ${6:t}} d${6:t} $0"),
	e("ewav", "e^{i\\left(${1:\\mathbf{k}}\\cdot\\mathbf{r}-${2:\\omega_\\mathbf{k}}t\\right)}"),
	e("dcomm", "\\left[ ${1:A} , \\left[ ${2:B} , ${3:C} \\right] \\right] $0"),
	e("scalar", "\\phi(${1:\\mathbf{x}},${2:t}) = \\int \\frac{d${3:\\mathbf{p}}}{(2\\pi)^3 2E_{${3:\\mathbf{p}}}} \\left( \\hat{a}_{${3:\\mathbf{p}}} e^{-i\\left(${3:\\mathbf{p}}\\cdot ${1:\\mathbf{x}}-E_{${3:\\mathbf{p}}}${2:t}\\right)} + \\hat{a}_{${3:\\mathbf{p}}}^\\dagger e^{+i\\left(${3:\\mathbf{p}}\\cdot ${1:\\mathbf{x}}-E_{${3:\\mathbf{p}}}${2:t}\\right)} \\right) $0"),
	e("heis", "\\frac{d}{dt} \\hat{${1:O}}_{\\mbox{\\tiny H}}(t) = \\frac{i}{\\hbar} \\left[ \\hat{${2:H}} , \\hat{${1:O}}_{\\mbox{\\tiny H}}(t) \\right] + \\left( \\frac{\\partial \\hat{${1:O}}_{\\mbox{\\tiny S}}}{\\partial t} \\right)_{\\mbox{\\tiny H}} $0"),
	e("scheq", "i \\hbar \\frac{\\partial}{\\partial t} \\ket{${1:\\psi}(${2:t})} = \\hat{H} \\ket{${1:\\psi}(${2:t})} $0"),
	e("diraceq", "\\left( i \\gamma^\\mu \\partial_\\mu - m \\right) ${1:\\psi}(${2:x}) = 0 $0"),
	e("pauli", "\\sigma_{${1:i}} $0"),
	e("vpauli", "\\boldsymbol{\\sigma} $0"),
	e("diracm", "\\gamma^{${1:\\mu}} $0"),
	e("pauli1", "\\begin{pmatrix} 0 & 1 \\\\ 1 & 0 \\end{pmatrix}"),
	e("pauli2", "\\begin{pmatrix} 0 & -i \\\\ i & 0 \\end{pmatrix}"),
	e("pauli3", "\\begin{pmatrix} 1 & 0 \\\\ 0 & -1 \\end{pmatrix}"),
	e("dirac0", "\\begin{pmatrix} I & 0 \\\\ 0 & -I \\end{pmatrix}"),
	e("diraci", "\\begin{pmatrix} 0 & \\sigma^i \\\\ -\\sigma^i & 0 \\end{pmatrix}"),
	e("weyl0", "\\begin{pmatrix} 0 & I \\\\ I & 0 \\end{pmatrix}"),
	e("weyli", "\\begin{pmatrix} 0 & \\sigma^i \\\\ -\\sigma^i & 0 \\end{pmatrix}"),
	e("weyl5", "\\begin{pmatrix} -I & 0 \\\\ 0 & I \\end{pmatrix}"),
	e("Aquan", "\\mathbf{A}(${1:\\mathbf{r}},${2:t}) = \\sum_{\\lambda=1}^2 \\int \\frac{d\\mathbf{k}}{(2\\pi)^3 \\sqrt{2\\omega_{\\mathbf{k}}}} \\left( \\hat{a}_{\\mathbf{k},\\lambda} \\boldsymbol{\\epsilon}_{\\mathbf{k},\\lambda} e^{-i(\\omega_{\\mathbf{k}} ${2:t} - \\mathbf{k}\\cdot ${1:\\mathbf{r}})} + a_{\\mathbf{k},\\lambda}^\\dagger \\boldsymbol{\\epsilon}_{\\mathbf{k},\\lambda}^* e^{i(\\omega_{\\mathbf{k}} ${2:t} - \\mathbf{k}\\cdot ${1:\\mathbf{r}})} \\right) $0"),
	e("compauli", "\\left[ \\sigma_i , \\sigma_j \\right] = 2 i \\, \\epsilon_{ijk} \\, \\sigma_k"),
	e("comdirac", "\\left\\{ \\gamma^\\mu , \\gamma^\\nu \\right\\} = 2 g^{\\mu\\nu}"),
	e("normord", ": ${1:\\mathcal{O}} : $0"),
	e("comcreah", "\\left[ a, a^\\dagger \\right]_{\\pm} = 1"),
	e("pmat", "\\begin{pmatrix}\n$1\n\\end{pmatrix}", { form: "display" }),
	e("bmat", "\\begin{bmatrix}\n$1\n\\end{bmatrix}", { form: "display" }),
	e("Bmat", "\\begin{Bmatrix}\n$1\n\\end{Bmatrix}", { form: "display" }),
	e("vmat", "\\begin{vmatrix}\n$1\n\\end{vmatrix}", { form: "display" }),
	e("Vmat", "\\begin{Vmatrix}\n$1\n\\end{Vmatrix}", { form: "display" }),
	e("matrix", "\\begin{matrix}\n$1\n\\end{matrix}", { form: "display" }),
	e("pmat", "\\begin{pmatrix}$1\\end{pmatrix}", { form: "inline" }),
	e("bmat", "\\begin{bmatrix}$1\\end{bmatrix}", { form: "inline" }),
	e("Bmat", "\\begin{Bmatrix}$1\\end{Bmatrix}", { form: "inline" }),
	e("vmat", "\\begin{vmatrix}$1\\end{vmatrix}", { form: "inline" }),
	e("Vmat", "\\begin{Vmatrix}$1\\end{Vmatrix}", { form: "inline" }),
	e("matrix", "\\begin{matrix}$1\\end{matrix}", { form: "inline" }),
	e("cases", "\\begin{cases}\n$1\n\\end{cases}"),
	e("align", "\\begin{align}\n$1\n\\end{align}"),
	e("gather", "\\begin{gather}\n$1\n\\end{gather}"),
	e("array", "\\begin{array}\n$1\n\\end{array}"),
	e("avg", "\\langle $1 \\rangle $0"),
	e("<>", "\\langle $1 \\rangle $0"),
	e("norm", "\\lvert $1 \\rvert $0", { priority: 1 }),
	e("Norm", "\\lVert $1 \\rVert $0", { priority: 1 }),
	e("ceil", "\\lceil $1 \\rceil $0"),
	e("floor", "\\lfloor $1 \\rfloor $0"),
	e("mod", "|$1|$0"),
	n("(", "\\left(${VISUAL}\\right)"),
	n("[", "\\left[${VISUAL}\\right]"),
	n("{", "{${VISUAL}}"),
	n("|", "\\lvert ${VISUAL} \\rvert "),
	n("<", "\\langle ${VISUAL} \\rangle "),
	n("}", "\\left\\{${VISUAL}\\right\\}"),
	e("(", "($1)$0"),
	e("\\{", "\\{$1\\}$0", { priority: 1 }),
	e("{", "{$1}$0"),
	e("[", "[$1]$0"),
	e("lr(", "\\left( $1 \\right) $0"),
	e("lr{", "\\left\\{ $1 \\right\\} $0"),
	e("lr[", "\\left[ $1 \\right] $0"),
	e("lr|", "\\left| $1 \\right| $0"),
	e("r|_", "\\right|_{$1}"),
	e("lra", "\\left< $1 \\right> $0"),
	t("(${GREEK})([\\n\\s.,?!:'])", "$\\[[0]]$[[1]]", {
		regex: !0,
		word: !0,
		auto: !0
	}),
	t(/([A-Za-z]=\d+)([\n\s.,?!:'])/, "$[[0]]$[[1]]", {
		word: !0,
		auto: !0
	}),
	t(/([A-Za-z]=[A-Za-z][+-]\d+)([\n\s.,?!:'])/, "$[[0]]$[[1]]", {
		word: !0,
		auto: !0
	}),
	e(/iden(\d)/, (e) => {
		let t = Number(e[1]), n = [];
		for (let e = 0; e < t; e++) {
			n[e] = [];
			for (let r = 0; r < t; r++) n[e][r] = +(r === e);
		}
		let r = n.map((e) => e.join(" & ")).join(" \\\\\n");
		return r = `\\begin{pmatrix}\n${r}\n\\end{pmatrix}`, r;
	}, {
		legacyStops: !0,
		name: "N x N identity matrix"
	})
];
//#endregion
//#region plugins/beta/snippets/ui/src/packs.ts
function G(e, t) {
	let n = String(e ?? "auto").trim();
	return n === "auto" ? t ? [] : ["latex"] : n.split(",").map((e) => e.trim()).filter(Boolean);
}
var K = [
	{
		id: "latex",
		title: "LaTeX",
		description: "The math set, on by itself in a vault with no snippets of its own: minl and menv for inline and display math, mbf mbb mcal mrm mfr for fonts, // for a fraction, Greek by @ or ;, sums, integrals, matrices, visual wraps of a selection. A trigger your own snippets define is yours.",
		entries: (e) => W(e)
	},
	{
		id: "spacing",
		title: "Automatic spacing",
		description: "Bare names get their backslash, a letter after a command a space (\\sin x), a number after an operator a space (\\times 10), a digit after a Greek letter a subscript.",
		entries: (e) => [e.commands(R, { digit: "subscript" }), e.commands([...z, ...B], { digit: "space" })]
	},
	{
		id: "matrices",
		title: "Matrices by size",
		description: "33pmat, 24bmat: the size in the trigger, a stop in each cell. p b B v V for the brackets.",
		entries: (e) => [e.math(/(\d)(\d)([pbBvV]?)mat/, (e) => V(+e[1], +e[2], e[3] || "p"), { name: "A matrix by size" })]
	},
	{
		id: "sequences",
		title: "Sequences",
		description: "xsum → x_1 + x_2 + … + x_n, xprod, xleq, and x1dots → x_1, x_2, …, x_n.",
		entries: (e) => [
			e.math(/([A-Za-z])sum/, (e) => U(e[1], "+"), {
				name: "A written-out sum",
				priority: 1
			}),
			e.math(/([A-Za-z])prod/, (e) => U(e[1], "\\times"), {
				name: "A written-out product",
				priority: 1
			}),
			e.math(/([A-Za-z])leq/, (e) => U(e[1], "\\leq"), {
				name: "An ordered sequence",
				priority: 1
			}),
			e.math(/([A-Za-z])1dots/, (e) => U(e[1], ","), {
				name: "A list",
				priority: 1
			})
		]
	},
	{
		id: "minmax",
		title: "Smart min and max",
		description: "min + i → \\min_{i}, min + ( → \\min(), min + space → \\min. The same for max.",
		entries: (e) => ["min", "max"].flatMap((t) => [
			e.math(RegExp(`(?<!\\\\)${t}([A-Za-z])`), (e) => `\\${t}_{${e[1]}$1}$0`, { name: `\\${t} with a subscript` }),
			e.math(`${t}(`, `\\${t}($1)$0`, { priority: 1 }),
			e.math(`${t} `, `\\${t} `)
		])
	},
	{
		id: "derivatives",
		title: "Derivatives by their letters",
		description: "dydt → a fraction, ddt → d/dt, with any letters.",
		entries: (e) => [e.math(/d([a-ce-z])d([a-ce-z])/, "\\frac{d [[0]]}{d [[1]]} ", { name: "A derivative by its letters" }), e.math(/dd([a-ce-z])/, "\\frac{d}{d [[0]]} ", { name: "d/dx" })]
	},
	{
		id: "align",
		title: "Align a selection",
		description: "Select lines of math and type A: each is aligned at its first relation, inside align.",
		entries: (e) => [e.visual("A", (e, t) => H(t.selection), { name: "Align what is selected" })]
	},
	{
		id: "colors",
		title: "Colour a selection",
		description: "Select math and type R: \\textcolor{red}{…}.",
		entries: (e) => [e.visual("R", "\\textcolor{ ${1:red} }{ ${VISUAL} }$0", { name: "Colour what is selected" })]
	},
	{
		id: "units",
		title: "Electrical units",
		description: "mV, kV, kW, mA, Ohm… written upright with a space before them. They fire on those letters anywhere in math, which is why they are a pack.",
		entries: (e) => [
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
			].map(([t, n]) => e.math(t, `\\space\\text{${n}}`, { name: `${n}, the unit` })),
			e.math("uA", "\\space\\mu\\text{A}"),
			e.math("Ohm", "\\Omega"),
			e.math("mOhm", "\\space\\text{m}\\Omega"),
			e.math("kOhm", "\\space\\text{k}\\Omega"),
			e.math("MOhm", "\\space\\text{M}\\Omega")
		]
	},
	{
		id: "text",
		title: "Small helpers in text",
		description: "ie → i.e., eg → e.g., and ## after a word flips the case of its first letter.",
		entries: (e) => [
			e.text(/\bie /, "i.e. ", { auto: !0 }),
			e.text(/\beg /, "e.g. ", { auto: !0 }),
			e.text(/(\w+)##/, (e) => {
				let t = e[1][0];
				return (t === t.toUpperCase() ? t.toLowerCase() : t.toUpperCase()) + e[1].slice(1);
			}, {
				auto: !0,
				name: "Flip the first letter's case"
			})
		]
	}
], q = ".atlas/snippets", J = `${q}/converted.js`, se = {
	...i,
	std: L
};
async function Y(e, t, n) {
	let r = n.get(t);
	if (r) return r;
	let i = (async () => {
		let r = await e.readText(t), i = t.slice(0, t.lastIndexOf("/")), a = [], o = 0;
		for (let t of r.matchAll(/(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.\.?\/[^"']+)\2/g)) {
			let s = new URL(t[3], `file:///${i}/`).pathname.slice(1);
			a.push(r.slice(o, t.index), t[1], JSON.stringify(await Y(e, decodeURI(s), n))), o = t.index + t[0].length;
		}
		return a.push(r.slice(o)), URL.createObjectURL(new Blob(a, { type: "text/javascript" }));
	})();
	return n.set(t, i), i;
}
async function ce(e, t, n) {
	let r = await import(
		/* @vite-ignore */
		await Y(e, t, n)
), i = typeof r.default == "function" ? r.default(se) : r.default;
	if (!Array.isArray(i)) throw Error("its default export gives no list of snippets");
	return i.flat(Infinity);
}
async function le(e) {
	let t = [], n = [], r = [];
	await e.exists(".atlas/snippets").catch(() => !1) && (r = (await e.list(q).catch(() => [])).filter((e) => !e.dir && e.name.endsWith(".js")).map((e) => e.path).sort());
	let a = /* @__PURE__ */ new Map(), o = [];
	for (let i of r) if (/\bexport\s+default\b/.test(await e.readText(i).catch(() => ""))) {
		o.push(i);
		try {
			t.push({
				source: i,
				entries: await ce(e, i, a)
			});
		} catch (e) {
			n.push({
				source: i,
				what: `could not be read: ${String(e.message ?? e)}`
			});
		}
	}
	let s = await e.editor.legacySnippets().catch(() => null), c = !!s?.sources.some((e) => e.trim()), l = c && !o.includes(J);
	if (l) {
		let e = m(s);
		t.push({
			source: e.source,
			entries: e.entries
		}), n.push(...e.problems);
	}
	let d = G(e.plugin.settings.packs, t.length > 0);
	for (let e of K) d.includes(e.id) && t.push({
		source: `the ${e.title} pack`,
		entries: e.entries(i),
		pack: !0
	});
	let f = u(t);
	return {
		...f,
		problems: [...n, ...f.problems],
		fromOldFile: l,
		modules: o,
		oldFile: c ? s : null
	};
}
//#endregion
//#region plugins/beta/snippets/ui/src/rank.ts
var ue = (e, t) => {
	let n = 0;
	for (let r = 0; r < t.length && n < e.length; r++) t[r] === e[n] && (n === 0 && r > 0 && /[a-z]/.test(t[r - 1]) || n++);
	return n === e.length;
};
function de(e, t) {
	let n = e.plain.trim();
	if (n === t) return -1;
	if (n.startsWith(t)) return 0;
	let r = t.toLowerCase(), i = e.name?.toLowerCase();
	return t.length < 3 || !i ? null : i.includes(r) ? 1 : ue(r, i) ? 2 : null;
}
//#endregion
//#region plugins/beta/snippets/ui/src/settings.ts
var X = {
	kind: "math",
	form: "inline",
	textArg: !1
}, fe = 150, Z = (e, t = "", n) => {
	let r = document.createElement(e);
	return t && (r.style.cssText = t), n !== void 0 && (r.textContent = n), r;
}, Q = "font-weight:600;margin:14px 0 6px;color:var(--text);", $ = "color:var(--text-muted);font-size:.92em;", pe = (e) => [
	e.math && (e.display && e.inline ? "math" : e.display ? "display math" : "inline math"),
	e.text && "text",
	e.code && (e.langs ? e.langs.join(", ") : "code")
].filter(Boolean).join(" · ");
function me(e, t) {
	let n = [...e.problems], r = /* @__PURE__ */ new Map();
	for (let t of e.snippets) {
		if (!t.plain || t.visual) continue;
		let e = `${t.plain}\u0000${pe(t)}\u0000${t.auto}`, i = r.get(e);
		i ? n.push({
			source: t.source,
			what: `“${t.shown}” never fires: an earlier one takes it (${i.source}).`
		}) : r.set(e, t);
	}
	for (let r of e.snippets) for (let [e, i] of Object.entries(r.test ?? {})) {
		let a = t.simulate(e, r.text ? { kind: "text" } : X);
		a !== i && n.push({
			source: r.source,
			what: `“${r.shown}”: typing ${e} gives ${a}, not ${i}.`
		});
	}
	return n;
}
function he(e) {
	let t = [];
	for (let n of D) e.simulate(`${n} `, X) !== `${n} ` && t.push(n);
	return t;
}
var ge = [
	{
		label: "inline math",
		place: X
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
function _e(e, t) {
	let n = Z("div", "display:flex;gap:8px;align-items:center;"), r = Z("input", "flex:1;min-width:0;");
	r.placeholder = "Type keys, e.g. a/b or sr ; Tab: a tab stop", r.setAttribute("aria-label", "Try snippets");
	let i = Z("select");
	i.setAttribute("aria-label", "Typed in"), ge.forEach((e, t) => i.append(Object.assign(Z("option", "", e.label), { value: String(t) })));
	let a = Z("code", "display:block;min-height:1.4em;margin-top:6px;padding:6px 8px;border-radius:6px;background:var(--bg-alt);color:var(--text);white-space:pre-wrap;");
	a.dataset.testid = "snippet-try-out";
	let o = () => {
		try {
			a.textContent = r.value ? t.simulate(r.value, ge[+i.value].place) : "", a.style.color = "var(--text)";
		} catch (e) {
			a.textContent = String(e.message ?? e), a.style.color = "var(--red)";
		}
	};
	r.onkeydown = (e) => {
		e.key !== "Tab" || e.shiftKey || (e.preventDefault(), r.setRangeText("	", r.selectionStart ?? r.value.length, r.selectionEnd ?? r.value.length, "end"), o());
	}, r.oninput = o, i.onchange = o, n.append(r, i), e.append(Z("div", Q, "Try"), n, a);
}
function ve(e, t) {
	let { engine: n, ctx: r } = t, i = Z("div"), a = Z("div"), o = Z("div"), s = Z("div"), c = Z("div");
	e.append(i, a, s, o, c), _e(a, n);
	let l = () => {
		let e = t.read();
		if (i.replaceChildren(), e.fromOldFile) {
			let e = Z("div", "display:flex;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);");
			e.append(Z("div", "flex:1;", "These come from the old snippet file ([latex] snippets_file in the settings file). Converting writes a JavaScript module beside it, with the known misfires mended and listed at its top. The old file is left as it was."));
			let n = Z("button", "", "Convert");
			n.className = "btn primary", n.onclick = () => void t.convert().then(l), e.append(n), i.append(e);
		} else e.modules.length || i.append(Z("div", $, "No snippets yet: put a JavaScript module in .atlas/snippets/, or switch on a pack."));
		o.replaceChildren(Z("div", Q, "Packs"));
		let a = new Set(G(r.settings().packs, e.modules.length > 0 || e.fromOldFile));
		for (let e of K) {
			let n = Z("label", "display:flex;gap:10px;align-items:baseline;padding:3px 0;cursor:pointer;"), i = Z("input");
			i.type = "checkbox", i.checked = a.has(e.id), i.setAttribute("aria-label", `Pack ${e.title}`), i.onchange = () => {
				i.checked ? a.add(e.id) : a.delete(e.id), r.save({ packs: [...a].join(",") }).then(() => t.reload()).then(l);
			};
			let s = Z("span");
			s.append(Z("span", "", e.title), Z("span", `${$}margin-left:8px;`, e.description)), n.append(i, s), o.append(n);
		}
		s.replaceChildren();
		let u = me(e, n), d = (e) => {
			if (s.replaceChildren(), e.length) {
				s.append(Z("div", Q, `Problems (${e.length})`));
				for (let t of e) {
					let e = Z("div", "padding:2px 0;");
					e.dataset.testid = "snippet-problem", e.append(Z("span", "color:var(--red);", t.what), Z("span", `${$}margin-left:8px;`, t.source)), s.append(e);
				}
			}
		};
		d(u), setTimeout(() => {
			let e = he(n);
			e.length && d([...u, {
				source: "typed in math",
				what: `${e.length} ordinary words change: ${e.slice(0, 40).join(", ")}${e.length > 40 ? "…" : ""}`
			}]);
		}, 0), c.replaceChildren(Z("div", Q, `Snippets (${e.snippets.length})`));
		let f = Z("input", "width:100%;box-sizing:border-box;margin-bottom:8px;");
		f.placeholder = "Search triggers, names, what they give…", f.setAttribute("aria-label", "Search snippets");
		let p = Z("div", "display:grid;grid-template-columns:minmax(80px,1fr) minmax(0,2.4fr) auto;gap:3px 14px;align-items:baseline;"), m = () => {
			let t = f.value.trim().toLowerCase(), n = e.snippets.filter((e) => !t || e.shown.toLowerCase().includes(t) || e.name?.toLowerCase().includes(t) || typeof e.body == "string" && e.body.toLowerCase().includes(t));
			p.replaceChildren();
			for (let e of n.slice(0, fe)) {
				let t = typeof e.body == "string" ? e.body : "(computed)", n = Z("div", "min-width:0;");
				e.name && n.append(Z("span", "", e.name), Z("span", `${$}margin-left:8px;`));
				let r = Z("code", `${$}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:${e.name ? "none" : "block"};`, t.replace(/\s+/g, " "));
				n.append(r), p.append(Z("code", "color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", e.shown), n, Z("div", $, `${e.auto ? "" : "Tab · "}${pe(e)}`));
			}
			n.length > fe && p.append(Z("div", `${$}grid-column:1/-1;`, `and ${n.length - fe} more: search to find them.`));
		};
		f.oninput = m, m(), c.append(f, p);
	};
	l();
}
//#endregion
//#region plugins/beta/snippets/ui/src/main.ts
var ye = (e) => e.replace(/\$\{VISUAL\}/g, "x").replace(/\$\{\d+:((?:[^{}]|\{[^{}]*\})*)\}/g, "$1").replace(/\$\{\d+\}|\$\d+/g, "\\square ");
async function be(e) {
	let t = ae(e), n = null, r = async () => (n = await le(e), t.use(n), n);
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
			let r = i(n.view, n.pos), o = n.word, s = t.snippets().filter((e) => e.plain?.trim() && typeof e.body == "string" && !e.visual && t.fits(e, r, n.view));
			for (let r = 0; r <= Math.max(0, o.length - (n.explicit ? 1 : 2)); r++) {
				if (r > 0 && /[A-Za-z]/.test(o[r - 1])) continue;
				let i = o.slice(r), c = s.map((e) => [e, de(e, i)]).filter(([, e]) => e !== null);
				if (!c.length) continue;
				let l = c.sort(([e, t], [n, r]) => t - r || e.plain.length - n.plain.length || e.plain.localeCompare(n.plain)).map(([e]) => e).slice(0, 50).map((n) => {
					let r = n.body;
					return {
						label: n.plain.trim(),
						detail: n.name ?? a(r).slice(0, 48),
						kind: "keyword",
						apply: (e, i, a) => t.insert(e, r, i, a, "", n.legacyStops),
						info: n.math ? () => {
							let t = document.createElement("div");
							return e.editor.drawMath(t, ye(r), !1), t;
						} : void 0
					};
				});
				return {
					from: n.pos - o.length + r,
					items: l
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
		let i = J;
		if (n?.modules.includes(i)) {
			e.toast("Snippets", `${i} is there already. Move it aside to convert again.`, "info");
			return;
		}
		let { text: a, kept: o, dropped: s } = ee(t);
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
		mount: (i, a) => ve(i, {
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
export { be as register };
