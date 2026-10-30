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
	let n = [], r = [], i = [], a = [];
	for (let o of e) for (let e of o.entries) {
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
				n.push(...l(e, o.source)), r.push(...e.names);
				continue;
			}
			for (let r of e.triggers) try {
				n.push(s(r, e, t, o.source));
			} catch (e) {
				a.push({
					source: o.source,
					what: `${String(r)}: ${String(e.message ?? e)}`
				});
			}
		}
	}
	for (let e of Object.values(t)) r.push(...String(e).split("|").filter((e) => /^[A-Za-z]{2,}$/.test(e)));
	let o = n.map((e, t) => [e, t]).sort((e, t) => t[0].priority - e[0].priority || e[1] - t[1]).map(([e]) => e);
	for (let e of o) e.plain && /^[A-Za-z]{2,}$/.test(e.plain) && r.push(e.plain);
	return {
		snippets: o,
		known: [...new Set(r)],
		words: i,
		problems: a
	};
}
function d(e) {
	let t = e;
	return /^\s*(#|---)/.test(t) && (t = /```(?:js|javascript|json)?\s*([\s\S]*?)```/.exec(t)?.[1] ?? t), t = t.replace(/^\s*import\b[^\n;]*;?\s*$/gm, "").trim(), t = t.replace(/^(?:export\s+default\s+|(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)/, ""), t = t.replace(/;?\s*export\s+default\s+[A-Za-z_$][\w$]*\s*;?\s*$/, "").trim().replace(/;\s*$/, ""), Function(`return (${t});`)();
}
function f(e) {
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
function p(e) {
	let t = [], n = [], r = "the old snippet file";
	if (e.variables.trim()) try {
		t.push(i.vars(d(e.variables)));
	} catch (e) {
		n.push({
			source: "the old variables file",
			what: String(e)
		});
	}
	for (let i of e.sources) try {
		let e = d(i);
		if (Array.isArray(e)) for (let n of e) {
			let e = f(n);
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
function m(e) {
	let t = [...e.matchAll(/\$\{?(\d+)/g)].map((e) => Number(e[1]));
	if (!t.length) return e;
	let n = Math.max(...t), r = RegExp(`\\$${n}$`).test(e) && !RegExp(`\\$\\{${n}\\b`).test(e) && t.filter((e) => e === n).length === 1;
	return e.replace(/\$(\{?)(\d+)/g, (e, t, i) => {
		let a = Number(i);
		return `$${t}${r && a === n ? 0 : a + 1}`;
	});
}
var h = (e) => e instanceof RegExp ? String(e) : e, g = /* @__PURE__ */ new Map([
	["([A-Z])T", "turned UT, NT and k_BT into transposes; ^{\\top} is not used in the notes"],
	["=d", "turned x=d into x\\Downarrow; never used"],
	["=u", "turned v=u into v\\Uparrow; never used"],
	["u=d", "never used"],
	["d=u", "never used"],
	["and", "turned band into b\\cap; never used"],
	["_([a-zA-Z0-9]{2,})", "could not fire: _ has already become _{"],
	["/([A-Za-z])_(\\d\\d)/", "could not fire: _ has already become _{"],
	["\\leq>", "a chain through <=; <=> is its own trigger"]
]), _ = /* @__PURE__ */ new Set([
	"([^\\\\])(${GREEK}|${SYMBOL}|${MORE_SYMBOLS})",
	"\\\\(${GREEK}|${SYMBOL}|${MORE_SYMBOLS})([A-Za-z])",
	"/([^\\\\])(exp|log|ln)/",
	"/([^\\\\])(det)/",
	"/([^\\\\])(arcsin|sin|arccos|cos|arctan|tan|csc|sec|cot)/",
	"/\\\\(arcsin|sin|arccos|cos|arctan|tan|csc|sec|cot)([A-Za-gi-z])/",
	"/\\\\(sinh|cosh|tanh|coth)([A-Za-z])/"
]), v = "arcsin arccos arctan arccot arccsc arcsec sin cos tan cot csc sec sinh cosh tanh coth sech csch exp log ln det".split(" "), y = new Set("mV Vol kV VA kVA MVA VAR kVAR mW WATT kW uA mA Amp mOhm Ohm kOhm MOhm PU PF dB".split(" ")), b = [
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
], x = (e) => JSON.stringify(e);
function S(e) {
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
function C(e) {
	let t = String(e.options ?? ""), n = e.trigger instanceof RegExp || t.includes("r"), r = e.trigger instanceof RegExp ? String(e.trigger) : x(String(e.trigger)), i = typeof e.replacement == "function", a = i ? String(e.replacement) : x(m(String(e.replacement))), o = [];
	n && !(e.trigger instanceof RegExp) && o.push("regex: true"), i && o.push("legacyStops: true"), t.includes("w") && o.push("word: true"), e.priority && o.push(`priority: ${e.priority}`), e.description && o.push(`name: ${x(e.description)}`);
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
function w(e) {
	let t = [], n = [], r = 0, i = !1, a = e.variables.trim() ? d(e.variables) : {}, o = (e) => (a[`\${${e}}`] ?? "").split("|").filter(Boolean);
	for (let a of e.sources) {
		let e = d(a);
		if (!Array.isArray(e)) continue;
		let { before: s, end: c } = S(a);
		e.forEach((e, a) => {
			for (let e of s.get(a) ?? []) t.push(`  ${e}`);
			let c = e;
			for (let e of b) if (c && e.when(c)) {
				let t = h(c.trigger);
				c = e.to(c), n.push(`${t}: ${e.why}`);
			}
			if (!c || c.trigger == null || c.replacement == null) return;
			let l = h(c.trigger);
			if (g.has(l)) {
				n.push(`${l}: ${g.get(l)}`);
				return;
			}
			if (_.has(l)) {
				i || (i = !0, n.push("the spacing regexes: one rule, in two commands(...) lines"), t.push("  // the automatic spacing: a bare name gets its backslash, a letter after a command a space"), t.push(`  commands(${JSON.stringify(o("GREEK"))}, { digit: "subscript" }),`), t.push(`  commands(${JSON.stringify([.../* @__PURE__ */ new Set([
					...o("SYMBOL"),
					...o("MORE_SYMBOLS"),
					...v
				])])}, { digit: "space" }),`));
				return;
			}
			if (typeof c.trigger == "string" && y.has(c.trigger)) {
				t.push(`  // off, in the Electrical units pack: ${C(c)}`), r++;
				return;
			}
			if (c.trigger === "-d" || c.trigger === "-u") {
				t.push(`  ${C(c).replace(/\),$/, ", { when: (at) => !/[A-Za-z0-9})]$/.test(at.before) }),")}`), n.push(`${c.trigger}: not after an operand, so a-d stays a subtraction`), r++;
				return;
			}
			String(c.trigger) === "/([A-Za-z])(\\d)/" && (c = {
				...c,
				trigger: /(?<![\\A-Za-z])([A-Za-z])(\d)/
			}, n.push("letter + digit: not when the letter ends a command, so \\times10 is safe")), t.push(`  ${C(c)}`), r++;
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
var D = "achieve achieved actors actually agree aligned all allow allowed allsec analogous anderson angle another app appear appears applications apply applying approach approaches appropriate approximation archive around assets assume atom atomic atoms auto automatically axis band bands bandwidth bare basically bastante become becomes been begins between bigger bipartite bottom bound boundary box branch branches brothers call called callout capture captures catalog cell challenges change changes changing closing coexistence coincide color colorblind comes command commands comment comments commit common commutation commute commutes compilation constant constants continuation continued contributors controlled copies copy copyright correct correction correlated correlation correlations corresponding corresponds cosas cost coveralls crossing cuando cumul cumulant cuprates custom cutoff damping decreasing dee deep degeneracy degenerate degrees design designed details determined detuned developing differ difference differences different difficult diffraction director directory distance eigenvectors either eliminate ellos enable entanglement equivalent escape essentially esto estoy exchange exist existing expand expanded expansion expect expected experimental experimentally experiments explain explicitly exponential exponentially exponents export expressed expression expressions factor factorized fall falls fill filled filling finally follow following follows formally formula formulas found fraction free freedom freely full fund fundamental funds further generators geometry grand ground hamiltonian hand handle happen happens historia history hopping hoppings important inbox include included includes including incomplete incompressible increase increases increasing infinite infinity info information install installation installed insulator insulators integer integral integrate integrated intensity inter interact interacting interaction interactions interesting interface interference intermediate internship into intro introduce introduction invariant inverse inversion irreps island jupytext karakeep keep keeps lands language languages letterboxd library limit machine macroscopic mapped matching maximum maxiter meeting menu meta metal metallic microscopic minimum missing mixing mode model models modern modes modificados modification modified modify modulation module moment momenta momentum mother much muchas mucho multiple multitext mundo music must muy need needed needs negative normal normalization normalized nublado nuestro null number numbers numerical numerically numpy occupancy occupation occupied onto operator operators opposite other otherwise parameter parameters parte particle particles particular partie partner partners parts phenomena photon pick pinned pip point points power preset principal principle produced produces product products propagating propagation properties property proportional proposed quadratic quasiparticle range rather readthedocs really repository reproduce restart retain second secret secrets section sector sectors see seed seems sees separate separated sets settings setup sign similar simple simulation simulations since single singlet singular small smaller smallest some something speed spin spins stand standard stands start started starting steps still stop stopped stops strange subbath subbaths subject submit subspace subtopic summer superconductor superconductors support suppressed sweep sweeps tanto that their them theme themes themselves then theory there therefore thermal these thesis they three toda today todo todos together tokens tol tolerance too tool tools top topic topics topology tot total touches toward tpi typical unchanged under understand understanding upper using usually valley vector vectors wavevector weather week well what whether will www".split(" "), O = /^(?:\\[A-Za-z]+|\\.|[^A-Za-z\s])/, k = /^\\(?:langle|lvert|lVert|lfloor|lceil|lbrace)(?![A-Za-z])/, A = /^\\(?:rangle|rvert|rVert|rfloor|rceil|rbrace)(?![A-Za-z])/, j = /^\\(begin|end)\{([A-Za-z]+\*?)\}/, ee = /^(?:equation|align|alignat|flalign|gather|multline|eqnarray|displaymath|math)\*?$/;
function M(e) {
	let t = [], n = (e, n, r) => (t.push({
		from: e,
		to: e + n,
		kind: r
	}), e + n);
	for (let t = 0; t < e.length;) {
		let r = e.slice(t, t + 32), i = r[0], a = i === "\\" ? j.exec(r) : null;
		a ? t = ee.test(a[2]) ? n(t, a[0].length, "bound") : t + a[0].length : r.startsWith("\\left") && !/^\\left[A-Za-z]/.test(r) ? t = n(t, 5 + (O.exec(r.slice(5))?.[0].length ?? 0), "open") : r.startsWith("\\right") && !/^\\right[A-Za-z]/.test(r) ? t = n(t, 6 + (O.exec(r.slice(6))?.[0].length ?? 0), "close") : k.test(r) ? t = n(t, k.exec(r)[0].length, "open") : A.test(r) ? t = n(t, A.exec(r)[0].length, "close") : r.startsWith("\\{") ? t = n(t, 2, "open") : r.startsWith("\\}") ? t = n(t, 2, "close") : r.startsWith("\\[") || r.startsWith("\\(") || r.startsWith("\\]") || r.startsWith("\\)") ? t = n(t, 2, "bound") : i === "\\" ? t += /^\\(?:[A-Za-z]+|.|$)/s.exec(r)?.[0].length ?? 1 : "{([".includes(i) ? t = n(t, 1, "open") : "})]".includes(i) ? t = n(t, 1, "close") : i === "$" ? t = n(t, r[1] === "$" ? 2 : 1, "bound") : i === "\n" && /^\n[ \t]*\n/.test(r) ? t = n(t, 1, "wall") : t++;
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
var te = class {
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
}, ne = 120, re = "langle rangle lvert rvert lVert rVert lfloor rfloor lceil rceil hbar hslash ell nabla partial infty mathbb mathbf mathcal mathrm mathfrak mathscr mathit boldsymbol text textbf textit operatorname overline underline overbrace underbrace widehat widetilde hat bar tilde vec dot ddot sqrt frac dfrac tfrac binom left right bigl bigr sum prod int iint oint lim limsup liminf sup inf max min exp log ln sin cos tan cot sec csc sinh cosh tanh arcsin arccos arctan det dim ker deg gcd cdot cdots ldots vdots ddots times div pm mp leq geq neq approx equiv sim simeq propto cong to mapsto rightarrow leftarrow Rightarrow Leftarrow leftrightarrow Leftrightarrow uparrow downarrow forall exists in notin subset subseteq supset supseteq cup cap setminus emptyset varnothing wedge vee oplus otimes dagger quad qquad angle triangle top bot bra ket braket ketbra".split(" "), F = class {
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
function L(e) {
	let t = e.editor.codemirror, n = E(t), { EditorView: r, keymap: i } = t.view, { Prec: a } = t.state, o = [], s = re, c = new F(D, null), l = [], u = null;
	async function d() {
		let t = await fetch(e.assetUrl("words.txt"));
		if (!t.ok) throw Error(`words.txt: ${t.status}`);
		return u = new te(await t.text()), c = new F([...D, ...l], u), u.size;
	}
	let f = !1;
	function p(e) {
		o = e.snippets, s = [.../* @__PURE__ */ new Set([...re, ...e.known])], l = e.words, c = new F([...D, ...l], u), f = e.snippets.some((e) => e.code && e.langs !== null);
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
	}, O = /* @__PURE__ */ new WeakMap();
	function k(e, t) {
		let n = O.get(e);
		return O.delete(e), n && n.at === t && e.state.sliceDoc(n.from, n.to) === (n.m ? n.m[0] : n.s.plain) ? n : null;
	}
	function A(e, t) {
		let n = e.state.sliceDoc(t.to, t.at);
		return C(e, t.s, t.m, t.from, t.at) ? (n && e.dispatch(e.state.replaceSelection(n)), !0) : !1;
	}
	let j = (e) => /[A-Za-z]+$/.exec(e)?.[0] ?? "";
	function ee(e, t) {
		if (!/^[A-Za-z]+$/.test(t)) return !1;
		let n = j(e);
		return n.length > t.length && s.some((e) => e.startsWith(n));
	}
	function M(e, t) {
		if (!/^[A-Za-z]+$/.test(t)) return !1;
		let n = j(e);
		return e[e.length - n.length - 1] === "\\" || n.length > t.length && s.some((e) => e.startsWith(n));
	}
	function L(e, t) {
		if (!/^[A-Za-z]+$/.test(t)) return !1;
		let n = j(e);
		if (n.length <= t.length || e[e.length - n.length - 1] === "\\") return !1;
		let r = n.toLowerCase();
		return c.has(r) || c.grows(r);
	}
	function R(e, t, n) {
		if (/^[A-Za-z]$/.test(n)) return !1;
		let r = e.state.doc.lineAt(t), i = j(e.state.doc.sliceString(Math.max(r.from, t - ne), t)).toLowerCase();
		return !i || c.has(i) || !c.grows(i) ? !1 : z(e, t, "", !0, !0);
	}
	function z(e, t, n, r, i = !1) {
		if (!o.length) return !1;
		let a = k(e, t);
		if (!a && !i && n && R(e, t, n)) {
			let t = e.state.selection.main.head;
			return z(e, t, n, r) || e.dispatch(e.state.replaceSelection(n)), !0;
		}
		let l = e.state.doc.lineAt(t), u = e.state.doc.sliceString(Math.max(l.from, t - ne), t) + n, d, f = () => d ??= h(e, t), p = (e) => t + n.length - e, m = (e) => r === e.auto && !e.visual, g = (t, n) => !t.when || t.when(_(e, u.slice(0, u.length - n))), b = (t) => m(t) && v(t, f(), e), x = (e) => {
			if (!e.plain || !u.endsWith(e.plain)) return !1;
			let t = u.length - e.plain.length;
			return e.word && t > 0 && /[A-Za-z0-9]/.test(u[t - 1]) ? !1 : !M(u, e.plain) && (i || !L(u, e.plain));
		}, S = null;
		for (let t of o) {
			if (!m(t)) continue;
			let n = t.regex ? t.regex.exec(u) : null;
			if (t.regex ? !n || ee(u, I(n)) || !i && L(u, I(n)) : !x(t)) continue;
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
			return n && !z(e, p, n, r) && e.dispatch(e.state.replaceSelection(n)), !0;
		}
		if (!S) return !1;
		let N = S.s, P = S.m ? I(S.m) : N.plain;
		if (r && n && (o.some((e) => e !== N && w(u, P, e) && b(e)) || /^[A-Za-z]+$/.test(P) && D(T))) {
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
	function V(e, t, n) {
		return !")]}".includes(n) || e.state.sliceDoc(t, t + 1) !== n || h(e, t).kind !== "math" ? !1 : (e.dispatch({
			selection: { anchor: t + 1 },
			userEvent: "select"
		}), !0);
	}
	function ie(e, t, r) {
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
		return r.length !== 1 || e.state.selection.ranges.length > 1 || !g(e) ? !1 : t === n ? ie(e, t, r) ? !0 : z(e, t, r, !0) || V(e, t, r) : B(e, t, n, r);
	}
	let J = (e) => h(e, e.state.selection.main.head).kind === "math", Y = {
		overList(e) {
			if (O.has(e) || n.active(e.state)) return !0;
			let t = e.state.selection.main.head, r = /\\([A-Za-z]*)$/.exec(e.state.sliceDoc(Math.max(0, t - 40), t));
			return r && !s.includes(r[1]) ? !1 : J(e);
		},
		whileAsking: (e) => O.has(e) || n.active(e.state) || J(e)
	}, ae = [
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
				if (t && (K(e) || z(e, r, "", !1) || !n.active(e.state) && R(e, r, ""))) return !0;
				let i = t && J(e), a = n.currentEnd(e.state), o = i && a !== null ? H(e) : null;
				return o !== null && o <= a ? W(e) : n.next(e) || i && W(e);
			},
			shift: (e) => n.prev(e) || g(e) && e.state.selection.main.empty && J(e) && G(e)
		}]))
	];
	function oe(e, i, a = "") {
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
		extension: ae,
		claim: Y,
		use: p,
		loadWords: d,
		simulate: oe,
		insert: n.insert,
		snippets: () => o,
		fits: v,
		placeOf: h
	};
}
//#endregion
//#region plugins/beta/snippets/ui/src/std.ts
var R = /* @__PURE__ */ t({
	align: () => U,
	greek: () => z,
	matrix: () => H,
	operators: () => B,
	sequence: () => W,
	symbols: () => V
}), z = "alpha beta gamma Gamma delta Delta epsilon varepsilon zeta eta theta vartheta Theta iota kappa lambda Lambda mu nu xi Xi omicron pi Pi varpi rho varrho sigma Sigma varsigma tau upsilon Upsilon phi Phi varphi chi psi Psi omega Omega".split(" "), B = "arcsin arccos arctan arccot arccsc arcsec sinh cosh tanh coth sech csch sin cos tan cot csc sec exp log ln det sum prod int iint iiint oint".split(" "), V = "parallel perp partial nabla hbar ell infty oplus ominus otimes square star dagger vee wedge subseteq subset supseteq supset emptyset exists nexists forall implies impliedby iff setminus neg lor land bigcup bigcap cdot times simeq approx quad qquad leq geq neq gg ll equiv sim propto rightarrow leftarrow Rightarrow Leftarrow leftrightarrow to mapsto cap cup dots vdots ddots langle rangle".split(" "), ie = {
	p: "pmatrix",
	b: "bmatrix",
	B: "Bmatrix",
	v: "vmatrix",
	V: "Vmatrix",
	m: "matrix"
};
function H(e, t, n = "p") {
	let r = ie[n] ?? "pmatrix", i = 1;
	return `\\begin{${r}}\n${Array.from({ length: e }, () => Array.from({ length: t }, () => `\${${i++}}`).join(" & ")).join(" \\\\\n")}\n\\end{${r}}$0`;
}
function U(e) {
	return `\\begin{align}\n${e.split("\n").map((e) => e.trim().replace(/^\$+|\$+$/g, "").trim()).filter(Boolean).map((e) => /(?<![\\<>!])=|\\(?:leq|geq|neq|approx|equiv|sim|simeq|implies|iff)(?![A-Za-z])/.test(e) ? e.replace(/(?<![\\<>!])=|\\(?:leq|geq|neq|approx|equiv|sim|simeq|implies|iff)(?![A-Za-z])/, (e) => `&${e}`) : `&${e}`).join(" \\\\\n")}\n\\end{align}$0`;
}
var W = (e, t) => `${e}_1 ${t} ${e}_2 ${t} \\cdots ${t} ${e}_{\${1:n}}$0`, G = [
	{
		id: "spacing",
		title: "Automatic spacing",
		description: "Bare names get their backslash, a letter after a command a space (\\sin x), a number after an operator a space (\\times 10), a digit after a Greek letter a subscript.",
		entries: (e) => [e.commands(z, { digit: "subscript" }), e.commands([...B, ...V], { digit: "space" })]
	},
	{
		id: "matrices",
		title: "Matrices by size",
		description: "33pmat, 24bmat: the size in the trigger, a stop in each cell. p b B v V for the brackets.",
		entries: (e) => [e.math(/(\d)(\d)([pbBvV]?)mat/, (e) => H(+e[1], +e[2], e[3] || "p"), { name: "A matrix by size" })]
	},
	{
		id: "sequences",
		title: "Sequences",
		description: "xsum → x_1 + x_2 + … + x_n, xprod, xleq, and x1dots → x_1, x_2, …, x_n.",
		entries: (e) => [
			e.math(/([A-Za-z])sum/, (e) => W(e[1], "+"), {
				name: "A written-out sum",
				priority: 1
			}),
			e.math(/([A-Za-z])prod/, (e) => W(e[1], "\\times"), {
				name: "A written-out product",
				priority: 1
			}),
			e.math(/([A-Za-z])leq/, (e) => W(e[1], "\\leq"), {
				name: "An ordered sequence",
				priority: 1
			}),
			e.math(/([A-Za-z])1dots/, (e) => W(e[1], ","), {
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
		entries: (e) => [e.visual("A", (e, t) => U(t.selection), { name: "Align what is selected" })]
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
], K = ".atlas/snippets", q = `${K}/converted.js`, J = {
	...i,
	std: R
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
async function ae(e, t, n) {
	let r = await import(
		/* @vite-ignore */
		await Y(e, t, n)
), i = typeof r.default == "function" ? r.default(J) : r.default;
	if (!Array.isArray(i)) throw Error("its default export gives no list of snippets");
	return i.flat(Infinity);
}
async function oe(e) {
	let t = [], n = [], r = [];
	try {
		r = (await e.list(K)).filter((e) => !e.dir && e.name.endsWith(".js")).map((e) => e.path).sort();
	} catch {}
	let a = /* @__PURE__ */ new Map(), o = [];
	for (let i of r) if (/\bexport\s+default\b/.test(await e.readText(i).catch(() => ""))) {
		o.push(i);
		try {
			t.push({
				source: i,
				entries: await ae(e, i, a)
			});
		} catch (e) {
			n.push({
				source: i,
				what: `could not be read: ${String(e.message ?? e)}`
			});
		}
	}
	let s = await e.editor.legacySnippets().catch(() => null), c = !!s?.sources.some((e) => e.trim()), l = c && !o.includes(q);
	if (l) {
		let e = p(s);
		t.push({
			source: e.source,
			entries: e.entries
		}), n.push(...e.problems);
	}
	let d = String(e.plugin.settings.packs ?? "").split(",").map((e) => e.trim()).filter(Boolean);
	for (let e of G) d.includes(e.id) && t.push({
		source: `the ${e.title} pack`,
		entries: e.entries(i)
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
//#region plugins/beta/snippets/ui/src/settings.ts
var se = {
	kind: "math",
	form: "inline",
	textArg: !1
}, X = 150, Z = (e, t = "", n) => {
	let r = document.createElement(e);
	return t && (r.style.cssText = t), n !== void 0 && (r.textContent = n), r;
}, Q = "font-weight:600;margin:14px 0 6px;color:var(--text);", $ = "color:var(--text-muted);font-size:.92em;", ce = (e) => [
	e.math && (e.display && e.inline ? "math" : e.display ? "display math" : "inline math"),
	e.text && "text",
	e.code && (e.langs ? e.langs.join(", ") : "code")
].filter(Boolean).join(" · ");
function le(e, t) {
	let n = [...e.problems], r = /* @__PURE__ */ new Map();
	for (let t of e.snippets) {
		if (!t.plain || t.visual) continue;
		let e = `${t.plain}\u0000${ce(t)}\u0000${t.auto}`, i = r.get(e);
		i ? n.push({
			source: t.source,
			what: `“${t.shown}” never fires: an earlier one takes it (${i.source}).`
		}) : r.set(e, t);
	}
	for (let r of e.snippets) for (let [e, i] of Object.entries(r.test ?? {})) {
		let a = t.simulate(e, r.text ? { kind: "text" } : se);
		a !== i && n.push({
			source: r.source,
			what: `“${r.shown}”: typing ${e} gives ${a}, not ${i}.`
		});
	}
	return n;
}
function ue(e) {
	let t = [];
	for (let n of D) e.simulate(`${n} `, se) !== `${n} ` && t.push(n);
	return t;
}
function de(e, t) {
	let { engine: n, ctx: r } = t, i = Z("div"), a = Z("div"), o = Z("div"), s = Z("div");
	e.append(i, o, a, s);
	let c = () => {
		let e = t.read();
		if (i.replaceChildren(), e.fromOldFile) {
			let e = Z("div", "display:flex;gap:12px;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-alt);");
			e.append(Z("div", "flex:1;", "These come from the old snippet file. Converting writes a JavaScript module beside it, with the known misfires mended and listed at its top. The old file is left as it was."));
			let n = Z("button", "", "Convert");
			n.className = "btn primary", n.onclick = () => void t.convert().then(c), e.append(n), i.append(e);
		} else e.modules.length || i.append(Z("div", $, "No snippets yet: put a JavaScript module in .atlas/snippets/, or switch on a pack."));
		a.replaceChildren(Z("div", Q, "Packs"));
		let l = new Set(String(r.settings().packs ?? "").split(",").map((e) => e.trim()).filter(Boolean));
		for (let e of G) {
			let n = Z("label", "display:flex;gap:10px;align-items:baseline;padding:3px 0;cursor:pointer;"), i = Z("input");
			i.type = "checkbox", i.checked = l.has(e.id), i.setAttribute("aria-label", `Pack ${e.title}`), i.onchange = () => {
				i.checked ? l.add(e.id) : l.delete(e.id), r.save({ packs: [...l].join(",") }).then(() => t.reload()).then(c);
			};
			let o = Z("span");
			o.append(Z("span", "", e.title), Z("span", `${$}margin-left:8px;`, e.description)), n.append(i, o), a.append(n);
		}
		o.replaceChildren();
		let u = le(e, n), d = (e) => {
			if (o.replaceChildren(), e.length) {
				o.append(Z("div", Q, `Problems (${e.length})`));
				for (let t of e) {
					let e = Z("div", "padding:2px 0;");
					e.dataset.testid = "snippet-problem", e.append(Z("span", "color:var(--red);", t.what), Z("span", `${$}margin-left:8px;`, t.source)), o.append(e);
				}
			}
		};
		d(u), setTimeout(() => {
			let e = ue(n);
			e.length && d([...u, {
				source: "typed in math",
				what: `${e.length} ordinary words change: ${e.slice(0, 40).join(", ")}${e.length > 40 ? "…" : ""}`
			}]);
		}, 0), s.replaceChildren(Z("div", Q, `Snippets (${e.snippets.length})`));
		let f = Z("input", "width:100%;box-sizing:border-box;margin-bottom:8px;");
		f.placeholder = "Search triggers, names, what they give…", f.setAttribute("aria-label", "Search snippets");
		let p = Z("div", "display:grid;grid-template-columns:minmax(80px,1fr) minmax(0,2.4fr) auto;gap:3px 14px;align-items:baseline;"), m = () => {
			let t = f.value.trim().toLowerCase(), n = e.snippets.filter((e) => !t || e.shown.toLowerCase().includes(t) || e.name?.toLowerCase().includes(t) || typeof e.body == "string" && e.body.toLowerCase().includes(t));
			p.replaceChildren();
			for (let e of n.slice(0, X)) {
				let t = typeof e.body == "string" ? e.body : "(computed)", n = Z("div", "min-width:0;");
				e.name && n.append(Z("span", "", e.name), Z("span", `${$}margin-left:8px;`));
				let r = Z("code", `${$}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:${e.name ? "none" : "block"};`, t.replace(/\s+/g, " "));
				n.append(r), p.append(Z("code", "color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", e.shown), n, Z("div", $, `${e.auto ? "" : "Tab · "}${ce(e)}`));
			}
			n.length > X && p.append(Z("div", `${$}grid-column:1/-1;`, `and ${n.length - X} more: search to find them.`));
		};
		f.oninput = m, m(), s.append(f, p);
	};
	c();
}
//#endregion
//#region plugins/beta/snippets/ui/src/main.ts
var fe = (e) => e.replace(/\$\{VISUAL\}/g, "x").replace(/\$\{\d+:((?:[^{}]|\{[^{}]*\})*)\}/g, "$1").replace(/\$\{\d+\}|\$\d+/g, "\\square ");
async function pe(e) {
	let t = L(e), n = null, r = async () => (n = await oe(e), t.use(n), n);
	e.editor.extension(t.extension), e.editor.claimTab(t.claim), await r(), t.loadWords().catch((e) => console.warn("snippets: the word list did not load, only the short one holds:", e)), e.onFilesChanged((e) => {
		e.some((e) => e.startsWith(".atlas/snippets/") || e === ".atlas/config.toml") && r();
	});
	let i = (e, n) => t.placeOf(e, n);
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
			let r = i(n.view, n.pos), a = n.word, o = t.snippets().filter((e) => e.plain?.trim() && typeof e.body == "string" && !e.visual && t.fits(e, r, n.view));
			for (let r = 0; r <= Math.max(0, a.length - (n.explicit ? 1 : 2)); r++) {
				let i = a.slice(r), s = i.toLowerCase(), c = o.filter((e) => e.plain.trim().startsWith(i) && e.plain.trim() !== i || i.length >= 3 && e.name?.toLowerCase().includes(s));
				if (!c.length) continue;
				let l = c.sort((e, t) => e.plain.length - t.plain.length || e.plain.localeCompare(t.plain)).slice(0, 50).map((n) => {
					let r = n.body;
					return {
						label: n.plain.trim(),
						detail: n.name ?? r.replace(/\s+/g, " ").slice(0, 48),
						kind: "keyword",
						apply: (e, i, a) => t.insert(e, r, i, a, "", n.legacyStops),
						info: n.math ? () => {
							let t = document.createElement("div");
							return e.editor.drawMath(t, fe(r), !1), t;
						} : void 0
					};
				});
				return {
					from: n.pos - a.length + r,
					items: l
				};
			}
			return null;
		}
	});
	let a = async () => {
		let t = n?.oldFile ?? await e.editor.legacySnippets().catch(() => null);
		if (!t?.sources.some((e) => e.trim())) {
			e.toast("Snippets", "There is no old snippet file to convert here.", "info");
			return;
		}
		let i = q;
		if (n?.modules.includes(i)) {
			e.toast("Snippets", `${i} is there already. Move it aside to convert again.`, "info");
			return;
		}
		let { text: a, kept: o, dropped: s } = w(t);
		await e.writeText(i, a), await r(), e.toast("Snippets", `${o} snippets in ${i}, ${s.length} changes listed at its top. The old file was left as it was.`, "success"), e.open(i);
	};
	e.registerCommand({
		id: "convert",
		title: "Snippets: convert the old snippet file",
		run: a
	}), e.plugin.registerSettingsSection({
		id: "snippets",
		title: "Your snippets",
		place: "before",
		hint: "What fires, where it fires, and what is wrong. Snippet files are JavaScript and run with what a plugin may do.",
		mount: (i, o) => de(i, {
			atlas: e,
			engine: t,
			ctx: o,
			read: () => n,
			reload: r,
			convert: a
		})
	});
}
//#endregion
export { pe as register };
