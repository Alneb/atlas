//#region \0rolldown/runtime.js
var e = Object.create, t = Object.defineProperty, n = Object.getOwnPropertyDescriptor, r = Object.getOwnPropertyNames, i = Object.getPrototypeOf, a = Object.prototype.hasOwnProperty, o = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports), s = (e, i, o, s) => {
	if (i && typeof i == "object" || typeof i == "function") for (var c = r(i), l = 0, u = c.length, d; l < u; l++) d = c[l], !a.call(e, d) && d !== o && t(e, d, {
		get: ((e) => i[e]).bind(null, d),
		enumerable: !(s = n(i, d)) || s.enumerable
	});
	return e;
}, c = (n, r, o) => (o = n == null ? {} : e(i(n)), s(r || !n || !n.__esModule || !a.call(n, "default") ? t(o, "default", {
	value: n,
	enumerable: !0
}) : o, n)), l = /* @__PURE__ */ o(((e, t) => {
	t.exports = function(e) {
		return e != null && e.constructor != null && typeof e.constructor.isBuffer == "function" && e.constructor.isBuffer(e);
	};
})), u = /* @__PURE__ */ o(((e, t) => {
	t.exports = r;
	var n = [];
	function r(e, t) {
		var r = 0, i;
		if (!t) return n;
		if (e.FLAG === "long") {
			for (i = Array(Math.ceil(t.length / 2)); r < t.length;) i[r / 2] = t.slice(r, r + 2), r += 2;
			return i;
		}
		return t.split(e.FLAG === "num" ? "," : "");
	}
})), d = /* @__PURE__ */ o(((e, t) => {
	var n = u();
	t.exports = s;
	var r = [].push, i = "etaoinshrdlcumwfgypbvkjxqz".split(""), a = /\s+/, o = [
		"qwertzuop",
		"yxcvbnm",
		"qaw",
		"say",
		"wse",
		"dsx",
		"sy",
		"edr",
		"fdc",
		"dx",
		"rft",
		"gfv",
		"fc",
		"tgz",
		"hgb",
		"gv",
		"zhu",
		"jhn",
		"hb",
		"uji",
		"kjm",
		"jn",
		"iko",
		"lkm"
	];
	function s(e) {
		var t = Object.create(null), s = Object.create(null), u = Object.create(null), d = [], f = {
			in: [],
			out: []
		}, p = [], m = e.toString("utf8"), h = [], g = 0, _ = m.indexOf("\n"), v, y, b, x, S, C, w, T, E, D, O, k, A;
		for (u.KEY = []; _ > -1;) j(m.slice(g, _)), g = _ + 1, _ = m.indexOf("\n", g);
		for (j(m.slice(g)), _ = -1; ++_ < h.length;) if (y = h[_], v = y.split(a), b = v[0], b === "REP") {
			for (x = _ + parseInt(v[1], 10); ++_ <= x;) v = h[_].split(a), d.push([v[1], v[2]]);
			_--;
		} else if (b === "ICONV" || b === "OCONV") {
			for (x = _ + parseInt(v[1], 10), T = f[b === "ICONV" ? "in" : "out"]; ++_ <= x;) v = h[_].split(a), T.push([new RegExp(v[1], "g"), v[2]]);
			_--;
		} else if (b === "COMPOUNDRULE") {
			for (x = _ + parseInt(v[1], 10); ++_ <= x;) for (D = h[_].split(a)[1], E = -1, p.push(D); ++E < D.length;) s[D.charAt(E)] = [];
			_--;
		} else if (b === "PFX" || b === "SFX") {
			for (x = _ + parseInt(v[3], 10), D = {
				type: b,
				combineable: v[2] === "Y",
				entries: []
			}, t[v[1]] = D; ++_ <= x;) {
				v = h[_].split(a), S = v[2], C = v[3].split("/"), w = v[4], T = {
					add: "",
					remove: "",
					match: "",
					continuation: n(u, C[1])
				}, C && C[0] !== "0" && (T.add = C[0]);
				try {
					S !== "0" && (T.remove = b === "SFX" ? c(S) : S), w && w !== "." && (T.match = b === "SFX" ? c(w) : l(w));
				} catch {
					T = null;
				}
				T && D.entries.push(T);
			}
			_--;
		} else if (b === "TRY") {
			for (w = v[1], k = -1, O = []; ++k < w.length;) A = w.charAt(k), A.toLowerCase() === A && O.push(A);
			for (k = -1; ++k < i.length;) w.indexOf(i[k]) < 0 && O.push(i[k]);
			u[b] = O;
		} else b === "KEY" ? r.apply(u[b], v[1].split("|")) : b === "COMPOUNDMIN" ? u[b] = Number(v[1]) : b === "ONLYINCOMPOUND" ? (u[b] = v[1], s[v[1]] = []) : u[b] = v[1];
		return isNaN(u.COMPOUNDMIN) && (u.COMPOUNDMIN = 3), u.KEY.length || (u.KEY = o), u.TRY ||= i.concat(), u.KEEPCASE ||= !1, {
			compoundRuleCodes: s,
			replacementTable: d,
			conversion: f,
			compoundRules: p,
			rules: t,
			flags: u
		};
		function j(e) {
			e = e.trim(), e && e.charCodeAt(0) !== 35 && h.push(e);
		}
	}
	function c(e) {
		return RegExp(e + "$");
	}
	function l(e) {
		return RegExp("^" + e);
	}
})), f = /* @__PURE__ */ o(((e, t) => {
	t.exports = n;
	function n(e, t) {
		for (var n = -1; ++n < t.length;) e = e.replace(t[n][0], t[n][1]);
		return e;
	}
})), p = /* @__PURE__ */ o(((e, t) => {
	t.exports = n;
	function n(e, t, n) {
		return n && t in e && n.indexOf(e[t]) > -1;
	}
})), m = /* @__PURE__ */ o(((e, t) => {
	var n = p();
	t.exports = r;
	function r(e, t) {
		var r = -1;
		if (e.data[t]) return !n(e.flags, "ONLYINCOMPOUND", e.data[t]);
		if (t.length >= e.flags.COMPOUNDMIN) {
			for (; ++r < e.compoundRules.length;) if (e.compoundRules[r].test(t)) return !0;
		}
		return !1;
	}
})), h = /* @__PURE__ */ o(((e, t) => {
	var n = f(), r = m(), i = p();
	t.exports = a;
	function a(e, t, a) {
		var s = t.trim(), c;
		if (!s) return null;
		if (s = n(s, e.conversion.in), r(e, s)) return !a && i(e.flags, "FORBIDDENWORD", e.data[s]) ? null : s;
		if (s.toUpperCase() === s) {
			if (c = s.charAt(0) + s.slice(1).toLowerCase(), o(e.flags, e.data[c], a)) return null;
			if (r(e, c)) return c;
		}
		if (c = s.toLowerCase(), c !== s) {
			if (o(e.flags, e.data[c], a)) return null;
			if (r(e, c)) return c;
		}
		return null;
	}
	function o(e, t, n) {
		return i(e, "KEEPCASE", t) || n || i(e, "FORBIDDENWORD", t);
	}
})), g = /* @__PURE__ */ o(((e, t) => {
	var n = h();
	t.exports = r;
	function r(e) {
		return !!n(this, e);
	}
})), _ = /* @__PURE__ */ o(((e, t) => {
	t.exports = n;
	function n(e) {
		var t = r(e.charAt(0)), n = e.slice(1);
		return !n || (n = r(n), t === n) ? t : t === "u" && n === "l" ? "s" : null;
	}
	function r(e) {
		return e === e.toLowerCase() ? "l" : e === e.toUpperCase() ? "u" : null;
	}
})), v = /* @__PURE__ */ o(((e, t) => {
	var n = _(), r = f(), i = p(), a = h();
	t.exports = s;
	var o = [].push;
	function s(e) {
		var t = this, i = {}, a = [], s = {}, l, u, d = [], f, p, m, h, g, _, v, y, b, x, S, C, w, T, E, D, O, k, A, j, M, N, P;
		if (e = r(e.trim(), t.conversion.in), !e || t.correct(e)) return [];
		for (P = n(e), p = -1; ++p < t.replacementTable.length;) for (u = t.replacementTable[p], m = e.indexOf(u[0]); m > -1;) d.push(e.replace(u[0], u[1])), m = e.indexOf(u[0], m + 1);
		for (p = -1; ++p < e.length;) for (y = e.charAt(p), x = e.slice(0, p), S = e.slice(p + 1), w = y.toLowerCase(), C = w !== y, i = {}, m = -1; ++m < t.flags.KEY.length;) if (b = t.flags.KEY[m], h = b.indexOf(w), !(h < 0)) {
			for (_ = -1; ++_ < b.length;) if (_ !== h) {
				if (v = b.charAt(_), i[v]) continue;
				i[v] = !0, C && (v = v.toUpperCase()), d.push(x + v + S);
			}
		}
		for (p = -1, O = e.charAt(0), f = [""], k = 1, A = 0; ++p < e.length;) {
			for (y = O, O = e.charAt(p + 1), x = e.slice(0, p), u = y === O ? "" : y + y, m = -1, g = f.length; ++m < g;) m <= k && f.push(f[m] + u), f[m] += y;
			++A < 3 && (k = f.length);
		}
		for (o.apply(d, f), f = [e], u = e.toLowerCase(), (e === u || P === null) && f.push(e.charAt(0).toUpperCase() + u.slice(1)), u = e.toUpperCase(), e !== u && f.push(u), l = {
			state: {},
			weighted: s,
			suggestions: a
		}, T = c(t, l, f, d), E = 0, k = Math.min(T.length, Math.max(15 - e.length, 3) ** 3), j = Math.max((10 - e.length) ** 3, 1); !a.length && E < k;) D = E + j, c(t, l, T.slice(E, D)), E = D;
		for (a.sort(ee), f = [], M = [], p = -1; ++p < a.length;) N = r(a[p], t.conversion.out), u = N.toLowerCase(), M.indexOf(u) < 0 && (f.push(N), M.push(u));
		return f;
		function ee(e, t) {
			return F(e, t) || te(e, t) || I(e, t);
		}
		function F(e, t) {
			return s[e] === s[t] ? 0 : s[e] > s[t] ? -1 : 1;
		}
		function te(e, t) {
			var r = n(e), i = n(t);
			return r === i ? 0 : r === P ? -1 : i === P ? 1 : void 0;
		}
		function I(e, t) {
			return e.localeCompare(t);
		}
	}
	function c(e, t, r, o) {
		var s = e.flags.TRY, c = e.data, l = e.flags, u = [], d = -1, f, p, m, h, g, _, v, y, b, x, S, C, w;
		if (o) for (; ++d < o.length;) T(o[d], !0);
		for (d = -1; ++d < r.length;) for (f = r[d], p = "", m = "", h = f.charAt(0), g = f, _ = f.slice(1), v = h.toLowerCase() !== h, y = n(f), b = -1; ++b <= f.length;) for (p += m, x = g, g = _, _ = g.slice(1), m = h, h = f.charAt(b + 1), S = v, h && (v = h.toLowerCase() !== h), g && S !== v && (T(p + E(g)), T(p + E(h) + E(m) + _)), T(p + g), g && T(p + h + m + _), w = -1; ++w < s.length;) C = s[w], S && C !== C.toUpperCase() ? (y !== "s" && (T(p + C + x), T(p + C + g)), C = C.toUpperCase(), T(p + C + x), T(p + C + g)) : (T(p + C + x), T(p + C + g));
		return u;
		function T(n, r) {
			var o = t.state[n], s;
			o !== !!o && (u.push(n), s = a(e, n), o = s && !i(l, "NOSUGGEST", c[s]), t.state[n] = o, o && (t.weighted[n] = r ? 10 : 0, t.suggestions.push(n))), o && t.weighted[n]++;
		}
		function E(e) {
			var t = e.charAt(0);
			return (t.toLowerCase() === t ? t.toUpperCase() : t.toLowerCase()) + e.slice(1);
		}
	}
})), y = /* @__PURE__ */ o(((e, t) => {
	var n = h(), r = p();
	t.exports = i;
	function i(e) {
		var t = this, i = n(t, e, !0);
		return {
			correct: t.correct(e),
			forbidden: !!(i && r(t.flags, "FORBIDDENWORD", t.data[i])),
			warn: !!(i && r(t.flags, "WARN", t.data[i]))
		};
	}
})), b = /* @__PURE__ */ o(((e, t) => {
	t.exports = n;
	function n(e, t, r, i) {
		for (var a = -1, o, s, c, l, u; ++a < t.entries.length;) if (o = t.entries[a], l = o.continuation, u = -1, (!o.match || o.match.test(e)) && (s = o.remove ? e.replace(o.remove, "") : e, s = t.type === "SFX" ? s + o.add : o.add + s, i.push(s), l && l.length)) for (; ++u < l.length;) c = r[l[u]], c && n(s, c, r, i);
		return i;
	}
})), x = /* @__PURE__ */ o(((e, t) => {
	var n = b();
	t.exports = o;
	var r = [].push, i = [];
	function a(e, t, n) {
		var a = e[t];
		t in e ? a === i ? e[t] = n.concat() : r.apply(a, n) : e[t] = n.concat();
	}
	function o(e, t, r, o) {
		var s = -1, c, l, u, d, f, p, m;
		for ((!("NEEDAFFIX" in o.flags) || r.indexOf(o.flags.NEEDAFFIX) < 0) && a(e, t, r); ++s < r.length;) if (c = o.rules[r[s]], r[s] in o.compoundRuleCodes && o.compoundRuleCodes[r[s]].push(t), c) {
			for (p = n(t, c, o.rules, []), l = -1; ++l < p.length;) if (p[l] in e || (e[p[l]] = i), c.combineable) {
				for (u = s; ++u < r.length;) if (f = o.rules[r[u]], f && f.combineable && c.type !== f.type) for (m = n(p[l], f, o.rules, []), d = -1; ++d < m.length;) m[d] in e || (e[m[d]] = i);
			}
		}
	}
})), S = /* @__PURE__ */ o(((e, t) => {
	var n = x();
	t.exports = i;
	var r = [];
	function i(e, t) {
		var i = this;
		return n(i.data, e, i.data[t] || r, i), i;
	}
})), C = /* @__PURE__ */ o(((e, t) => {
	t.exports = n;
	function n(e) {
		var t = this;
		return delete t.data[e], t;
	}
})), w = /* @__PURE__ */ o(((e, t) => {
	t.exports = n;
	function n() {
		return this.flags.WORDCHARS || null;
	}
})), T = /* @__PURE__ */ o(((e, t) => {
	var n = u(), r = x();
	t.exports = a;
	var i = /\s/g;
	function a(e, t, n) {
		for (var r = e.toString("utf8"), i = r.indexOf("\n") + 1, a = r.indexOf("\n", i); a > -1;) r.charCodeAt(i) !== 9 && o(r.slice(i, a), t, n), i = a + 1, a = r.indexOf("\n", i);
		o(r.slice(i), t, n);
	}
	function o(e, t, a) {
		for (var o = e.indexOf("/"), s = e.indexOf("#"), c = "", l, u; o > -1 && e.charCodeAt(o - 1) === 92;) e = e.slice(0, o - 1) + e.slice(o), o = e.indexOf("/", o);
		s > -1 ? o > -1 && o < s ? (l = e.slice(0, o), i.lastIndex = o + 1, u = i.exec(e), c = e.slice(o + 1, u ? u.index : void 0)) : l = e.slice(0, s) : o > -1 ? (l = e.slice(0, o), c = e.slice(o + 1)) : l = e, l = l.trim(), l && r(a, l, n(t.flags, c.trim()), t);
	}
})), E = /* @__PURE__ */ o(((e, t) => {
	var n = T();
	t.exports = r;
	function r(e) {
		var t = this, r = -1, i, a, o, s;
		for (n(e, t, t.data); ++r < t.compoundRules.length;) {
			for (i = t.compoundRules[r], a = "", s = -1; ++s < i.length;) o = i.charAt(s), a += t.compoundRuleCodes[o].length ? "(?:" + t.compoundRuleCodes[o].join("|") + ")" : o;
			t.compoundRules[r] = new RegExp(a, "i");
		}
		return t;
	}
})), D = /* @__PURE__ */ o(((e, t) => {
	t.exports = n;
	function n(e) {
		var t = this, n = e.toString("utf8").split("\n"), r = -1, i, a, o, s;
		for (t.flags.FORBIDDENWORD === void 0 && (t.flags.FORBIDDENWORD = !1), s = t.flags.FORBIDDENWORD; ++r < n.length;) i = n[r].trim(), i && (i = i.split("/"), o = i[0], a = o.charAt(0) === "*", a && (o = o.slice(1)), t.add(o, i[1]), a && t.data[o].push(s));
		return t;
	}
})), O = /* @__PURE__ */ c((/* @__PURE__ */ o(((e, t) => {
	var n = l(), r = d();
	t.exports = a;
	var i = a.prototype;
	i.correct = g(), i.suggest = v(), i.spell = y(), i.add = S(), i.remove = C(), i.wordCharacters = w(), i.dictionary = E(), i.personal = D();
	function a(e, t) {
		var i = -1, o;
		if (!(this instanceof a)) return new a(e, t);
		if (typeof e == "string" || n(e) ? (typeof t == "string" || n(t)) && (o = [{ dic: t }]) : e && ("length" in e ? (o = e, e = e[0] && e[0].aff) : (e.dic && (o = [e]), e = e.aff)), !e) throw Error("Missing `aff` in dictionary");
		if (e = r(e), this.data = Object.create(null), this.compoundRuleCodes = e.compoundRuleCodes, this.replacementTable = e.replacementTable, this.conversion = e.conversion, this.compoundRules = e.compoundRules, this.rules = e.rules, this.flags = e.flags, o) for (; ++i < o.length;) o[i].dic && this.dictionary(o[i].dic);
	}
})))()), k = /* @__PURE__ */ new Set([
	"FencedCode",
	"CodeBlock",
	"InlineCode",
	"InlineMath",
	"BlockMath",
	"HTMLBlock",
	"HTMLTag",
	"Comment",
	"CommentBlock",
	"Link",
	"Image",
	"URL",
	"Autolink",
	"Wikilink",
	"Embed",
	"Tag",
	"Icon",
	"Emoji",
	"Footnote",
	"FootnoteReference"
]);
function A(e) {
	let t = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(e);
	return t ? t[0].length : 0;
}
function j(e, t, n, r = 0) {
	let i = r > t ? [[t, Math.min(r, n)]] : [];
	e({
		from: t,
		to: n,
		enter: (e) => {
			if (k.has(e.name)) return i.push([e.from, e.to]), !1;
		}
	}), i.sort((e, t) => e[0] - t[0]);
	let a = [], o = t;
	for (let [e, t] of i) e > o && a.push([o, Math.min(e, n)]), o = Math.max(o, t);
	return o < n && a.push([o, n]), a.filter(([e, t]) => t > e);
}
var M = /\p{L}[\p{L}\p{M}]*(?:['’-]\p{L}[\p{L}\p{M}]*)*/gu;
function N(e, t = 0) {
	let n = [];
	for (let r of e.matchAll(M)) {
		let i = e[r.index - 1] ?? "", a = e[r.index + r[0].length] ?? "";
		/[\p{N}@#_/\\]/u.test(i) || /[\p{N}@_/\\]/u.test(a) || i === "." && /\p{L}/u.test(e[r.index - 2] ?? "") || n.push({
			word: r[0],
			from: t + r.index,
			to: t + r.index + r[0].length
		});
	}
	return n;
}
var P = {
	en: new Set("the of and to in is that it for as with was on be by this are from or an at not which have but has can we".split(" ")),
	es: new Set("de la que el en los se del las un por con una para es al lo como más pero sus le ha o este si porque".split(" ")),
	fr: new Set("le la les de des et est un une du en que qui dans pour pas sur au par ce sont avec il elle nous".split(" "))
};
function ee(e, t, n, r) {
	let i = typeof r == "string" ? r.toLowerCase().split(/[-_]/)[0] : "";
	if (i && t.includes(i)) return i;
	let a = /* @__PURE__ */ new Map(), o = 0;
	for (let { word: n } of N(e.slice(0, 2e4))) {
		let e = n.toLowerCase();
		for (let n of t) P[n]?.has(e) && a.set(n, (a.get(n) ?? 0) + 1);
		o++;
	}
	let [s, c] = [...a].sort((e, t) => t[1] - e[1])[0] ?? [n, 0];
	return o >= 12 && c >= 3 ? s : n;
}
//#endregion
//#region ui/src/lib/editor/dictionaries.ts
var F = {
	en: [["en_US", "en_CA"], ["en_GB", "en_AU"]],
	es: [[
		"es_ES",
		"es_MX",
		"es_AR"
	]],
	fr: [["fr_FR", "fr_CA"]],
	de: [["de_DE"]]
};
function te(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let [t, r] of Object.entries(F)) {
		let i = r.map((t) => t.find((t) => e.includes(t))).filter((e) => !!e);
		i.length && n.set(t, i);
	}
	for (let r of String(t ?? "").split(/[,\s]+/)) {
		let t = /^([a-z]{2,3})=([\w+-]+)$/.exec(r.trim()), i = t?.[2].split("+").filter((t) => e.includes(t)) ?? [];
		t && i.length && n.set(t[1], i);
	}
	return n;
}
//#endregion
//#region ui/src/lib/paths.ts
var I = (e) => e.replace(/\/+$/, "").split("/").pop() || e, L = /\.(md|markdown|txt|page)$/i, R = (e) => L.test(e) && !/\.excalidraw\.md$/i.test(e);
function ne(e) {
	let t = I(e);
	return R(t) ? t.replace(L, "") : t;
}
//#endregion
//#region plugins/beta/spelling/ui/src/langs.ts
var z = (e) => e.split(/[_-]/)[0].toLowerCase();
function re(e, t) {
	let n = te(e, t.dictionaries), r = [...n.keys()];
	for (let t of [...e].sort()) n.has(z(t)) || n.set(z(t), [t]);
	let i = [...n.keys()], a = Array.isArray(t.languages) ? t.languages.map(String).filter((e) => n.has(e)) : [], o = a.length ? i.filter((e) => a.includes(e)) : r, s = String(t.language ?? "");
	return {
		chosen: n,
		available: i,
		langs: o,
		usual: r,
		main: o.includes(s) ? s : o[0] ?? (s || "en")
	};
}
function ie(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of String(e ?? "").split(/[,\s]+/)) {
		let e = /^([a-z]{2,3})=([\w+-]+)$/.exec(n.trim());
		e && t.set(e[1], e[2]);
	}
	return t;
}
function ae(e) {
	return e.size ? [...e].map(([e, t]) => `${e}=${t}`).join(", ") : null;
}
function oe(e, t) {
	let n = t.available.filter((t) => e.includes(t));
	return n.length === t.usual.length && n.every((e) => t.usual.includes(e)) ? null : n;
}
//#endregion
//#region ui/src/lib/editor/vault-count.ts
function se(e, t, n, r = 20) {
	let i = /* @__PURE__ */ new Map(), a = !1, o = (e, n) => {
		for (let r of n) {
			let n = i.get(r);
			n && t(n, -1);
			let a = e[r];
			a ? (i.set(r, a), t(a, 1)) : i.delete(r);
		}
	}, s = async (t) => {
		if (t.length) try {
			o(await e(t), t);
		} catch (e) {
			if (t.length === 1) {
				console.warn(`${n}: ${t[0]} was not counted:`, e);
				return;
			}
			let r = Math.ceil(t.length / 2);
			await s(t.slice(0, r)), await s(t.slice(r));
		}
	};
	return {
		count: s,
		async countAll(e, t) {
			for (let n = 0; n < e.length; n += r) await s(e.slice(n, n + r)), t?.(Math.min(n + r, e.length));
			a = !0;
		},
		get counted() {
			return a;
		}
	};
}
//#endregion
//#region plugins/beta/spelling/ui/src/judge.ts
function ce(e, t) {
	let n = e.replace(/['’]s$/u, "");
	if (n.length < 3 || /\p{Lu}/u.test(n.slice(1))) return !1;
	let r = (e) => t(e) || /s$/.test(e) && t(e.slice(0, -1)), i = (e) => e.length < 3 || /\p{Lu}/u.test(e.slice(1)) || r(e) || /^\p{Lu}/u.test(e) && r(e.toLowerCase());
	if (i(n)) return !1;
	let a = n.split(/[-‐]/u);
	return a.length < 2 || !a.every(i);
}
//#endregion
//#region ui/src/lib/editor/spell-rank.ts
var B = {
	substitute: .38,
	nearKey: .2,
	accent: .03,
	omit: .47,
	extra: .73,
	double: .3,
	swap: .35
}, V = [
	"qwertyuiop",
	"asdfghjklñ",
	"zxcvbnm"
], H = /* @__PURE__ */ new Map();
V.forEach((e, t) => [...e].forEach((e, n) => {
	let r = /* @__PURE__ */ new Set();
	for (let i of [
		-1,
		0,
		1
	]) for (let a of [
		-1,
		0,
		1
	]) {
		let o = V[t + i]?.[n + a];
		o && o !== e && r.add(o);
	}
	H.set(e, r);
}));
var U = (e) => e === "ñ" ? e : e.normalize("NFD").replace(/\p{M}/gu, "");
function W(e, t) {
	return e === t ? 0 : U(e) === U(t) ? B.accent : H.get(U(e))?.has(U(t)) ? B.nearKey : B.substitute;
}
function G(e, t) {
	let n = [...e.toLowerCase()], r = [...t.toLowerCase()], i = Array.from({ length: n.length + 1 }, () => Array(r.length + 1).fill(0));
	for (let e = 1; e <= n.length; e++) i[e][0] = i[e - 1][0] + B.extra;
	for (let e = 1; e <= r.length; e++) i[0][e] = i[0][e - 1] + B.omit;
	for (let e = 1; e <= n.length; e++) for (let t = 1; t <= r.length; t++) {
		let a = n[e - 1] === n[e - 2] || n[e - 1] === r[t - 1] ? B.double : B.extra, o = Math.min(i[e - 1][t] + a, i[e][t - 1] + B.omit, i[e - 1][t - 1] + W(n[e - 1], r[t - 1]));
		e > 1 && t > 1 && n[e - 1] === r[t - 2] && n[e - 2] === r[t - 1] && n[e - 1] !== n[e - 2] && (o = Math.min(o, i[e - 2][t - 2] + B.swap)), i[e][t] = o;
	}
	return i[n.length][r.length];
}
function K(e, t) {
	let n = e.toLowerCase(), r = /* @__PURE__ */ new Set();
	for (let e = 0; e <= n.length; e++) {
		let [i, a] = [n.slice(0, e), n.slice(e)];
		a && r.add(i + a.slice(1)), a.length > 1 && r.add(i + a[1] + a[0] + a.slice(2));
		for (let e of t) r.add(i + e + a), a && r.add(i + e + a.slice(1));
	}
	return r.delete(n), [...r];
}
var le = {
	en: "abcdefghijklmnopqrstuvwxyz",
	es: "abcdefghijklmnopqrstuvwxyzáéíóúüñ"
}, q = .9;
function ue(e, t, n, r, i = 6) {
	let a = e.toLowerCase(), o = /* @__PURE__ */ new Map();
	for (let e of t) {
		let t = e.toLowerCase();
		if (t === a || o.has(t)) continue;
		let i = Math.max(n(t), r(e) || r(t) ? 4 + Math.log2(1 + (r(e) || r(t))) : 0);
		o.set(t, G(a, t) + q * (1 - Math.min(i, 8) / 8));
	}
	let s = /^\p{Lu}/u.test(e) && !/\p{Lu}/u.test(e.slice(1));
	return [...o].sort((e, t) => e[1] - t[1]).slice(0, i).map(([e]) => s ? e[0].toUpperCase() + e.slice(1) : e);
}
function de(e) {
	let t = [];
	for (let n = 0; n + 1 < e.length; n++) e[n] !== e[n + 1] && t.push(e.slice(0, n) + e[n + 1] + e[n] + e.slice(n + 2));
	return t;
}
function fe(e, t, n = 6) {
	let r = t.zipf ?? (() => 0), i = /* @__PURE__ */ new Set([...de(e).filter(t.correct), ...t.dictionary(e)]);
	if (t.zipf && t.letters) for (let n of K(e, t.letters)) {
		let e = r(n);
		(t.uses(n) > 0 || e >= 3.5 || e > 0 && t.correct(n)) && i.add(n);
	}
	return ue(e, i, r, t.uses, n);
}
//#endregion
//#region plugins/beta/spelling/ui/src/words.ts
var pe = ".atlas/spelling/words.md", J = /^```words[ \t]*\n([\s\S]*?)^```/m;
function me(e) {
	let t = J.exec(e)?.[1] ?? "";
	return new Set(t.split("\n").map((e) => e.trim()).filter(Boolean));
}
function he(e, t) {
	let n = [...me(e)].filter((e) => e !== t);
	return e.replace(J, "```words\n" + n.map((e) => e + "\n").join("") + "```");
}
function ge(e, t) {
	let n = "```words\n" + [...me(e), t].filter((e, t, n) => n.indexOf(e) === t).sort((e, t) => e.localeCompare(t)).join("\n") + "\n```";
	return J.test(e) ? e.replace(J, n + "\n").replace(/```\n\n$/, "```\n") : (e.trim() ? e.replace(/\s*$/, "\n\n") : "# This vault's words\n\nWords the spell checker takes as right here, one per line.\n\n") + n + "\n";
}
//#endregion
//#region plugins/beta/spelling/ui/src/panel.ts
var Y = "\n.sp { display: flex; flex-direction: column; gap: 12px; padding: 4px 2px; }\n.sp h3 { margin: 0 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--text-faint); }\n.sp .langs { display: flex; flex-wrap: wrap; gap: 4px; }\n.sp button { font: inherit; color: var(--text); background: none; border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; cursor: pointer; }\n.sp button:hover { background: var(--bg-hover); }\n.sp .langs button.on, .sp table button.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }\n.sp .about { margin-top: 4px; color: var(--text-faint); font-size: 11.5px; }\n.sp ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 240px; overflow: auto; }\n.sp li.word { display: flex; align-items: center; gap: 6px; padding: 2px 0; }\n.sp li.word .w { border: none; padding: 1px 4px; text-decoration: underline wavy var(--red); text-decoration-thickness: 1px; text-underline-offset: 3px; }\n.sp li.word .line { color: var(--text-faint); font-size: 11px; min-width: 44px; }\n.sp li.word .fix { border-color: transparent; background: var(--bg-hover); padding: 1px 6px; }\n.sp li.word .fix:hover { border-color: var(--accent); }\n.sp li.word .keep { margin-left: auto; color: var(--text-faint); border-color: transparent; padding: 1px 5px; }\n.sp .none { color: var(--text-faint); }\n.sp .chips { display: flex; flex-wrap: wrap; gap: 4px; max-height: 120px; overflow: auto; }\n.sp .chip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 2px 1px 7px; border-radius: 10px; background: var(--bg-hover); }\n.sp .chip button { border: none; padding: 0 5px; color: var(--text-faint); border-radius: 10px; }\n.sp .chip.plain { padding: 1px 7px; color: var(--text-muted); }\n.sp .foot { display: flex; justify-content: flex-end; }\n.sp table { border-collapse: collapse; }\n.sp td { padding: 3px 12px 3px 0; vertical-align: baseline; }\n.sp td.dict { color: var(--text-muted); font-family: var(--font-mono); font-size: 12px; }\n.sp form { display: flex; gap: 6px; margin-top: 6px; }\n.sp tr.off td { color: var(--text-faint); }\n.sp label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }\n.sp label.main { color: var(--text-muted); font-size: 12px; }\n.sp input[type=checkbox], .sp input[type=radio] { width: auto; margin: 0; accent-color: var(--accent); }\n.sp select { font: inherit; font-family: var(--font-mono); font-size: 12px; padding: 2px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); }\n.sp select:disabled { opacity: .7; }\n.sp input[type=text], .sp form input { font: inherit; padding: 2px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); width: 14em; }\n";
function X(e, t = {}, ...n) {
	let r = document.createElement(e);
	for (let [e, n] of Object.entries(t)) if (e === "onclick") r.addEventListener("click", n);
	else if (typeof n == "function") continue;
	else n !== void 0 && r.setAttribute(e, n);
	for (let e of n) e && r.append(e);
	return r;
}
function _e(e, t, n) {
	e.replaceChildren(X("style", {}, Y));
	let r = e.appendChild(X("div", { class: "sp" })), i = () => a(t()), a = (e) => {
		let t = X("section", {}, X("h3", {}, "Language of this note"), X("div", { class: "langs" }, ...e.choices.map((t) => X("button", {
			class: t.lang === e.lang ? "on" : "",
			"aria-pressed": String(t.lang === e.lang),
			title: t.lang === e.lang ? e.source : `Set lang: ${t.lang} in this note's properties`,
			onclick: () => {
				n.setLang(t.lang);
			}
		}, t.name))), X("div", { class: "about" }, `${e.source} · ${e.dictionaries}${e.loading ? " · loading the dictionary…" : ""}`)), a = X("section", {}, X("h3", {}, `Marked in this note (${e.marked.length})`), e.marked.length ? X("ul", {}, ...e.marked.map((e) => X("li", { class: "word" }, X("button", {
			class: "w",
			title: "Select it in the note",
			onclick: () => n.select(e)
		}, e.word), X("span", { class: "line" }, `line ${e.line}`), ...e.fixes.length ? e.fixes.slice(0, 3).map((t) => X("button", {
			class: "fix",
			title: `Replace with “${t}”`,
			onclick: () => {
				n.fix(e, t), i();
			}
		}, t)) : [X("span", { class: "none" }, "no suggestions")], X("button", {
			class: "keep",
			title: `Add “${e.word}” to this vault's words`,
			onclick: () => void n.add(e.word).then(i)
		}, "+ add")))) : X("div", { class: "none" }, e.loading ? "Waiting for the dictionary." : "Nothing marked: every word is known.")), o = X("section", {}, X("h3", {}, `Added by you (${e.added.length})`), e.added.length ? X("div", { class: "chips" }, ...e.added.map((e) => X("span", { class: "chip" }, e, X("button", {
			title: `Take “${e}” out of this vault's words`,
			"aria-label": `Remove ${e}`,
			onclick: () => void n.remove(e).then(i)
		}, "×")))) : X("div", { class: "none" }, "None yet: “+ add” here or a right-click on a marked word adds one.")), s = X("section", {}, X("h3", {}, `Learned from the vault (${e.learned.count})`), e.learned.terms.length ? X("div", {}, X("div", { class: "about" }, "Not in the dictionary, the most used first:"), X("div", { class: "chips" }, ...e.learned.terms.map((e) => X("span", { class: "chip plain" }, e)))) : X("div", { class: "none" }, e.learned.count ? "All of them are in the dictionary too." : "Still counting the vault's notes."));
		r.replaceChildren(t, a, o, s, X("div", { class: "foot" }, X("button", { onclick: () => n.settings() }, "Spelling settings…")));
	};
	a(t());
}
function ve(e, t, n) {
	e.replaceChildren(X("style", {}, Y));
	let r = e.appendChild(X("div", { class: "sp" })), i = () => {
		let e = t(), a = e.langs.filter((e) => e.on).length, o = X("section", {}, X("h3", {}, "Languages"), e.langs.length ? X("table", {}, ...e.langs.map((t) => {
			let r = X("input", {
				type: "checkbox",
				"aria-label": `Check ${t.name}`,
				title: t.on && a === 1 ? "At least one language stays on" : t.on ? `Stop checking ${t.name}` : `Check ${t.name} too`
			});
			r.checked = t.on, r.disabled = t.on && a === 1, r.addEventListener("change", () => void n.setOn(t.lang, r.checked).then(i));
			let o = X("input", {
				type: "radio",
				name: "sp-main",
				"aria-label": `${t.name} as the main language`,
				title: t.lang === e.main ? "The main language: used when a note says too little to tell" : `Make ${t.name} the main language`
			});
			o.checked = t.on && t.lang === e.main, o.disabled = !t.on, o.addEventListener("change", () => void n.setMain(t.lang).then(i));
			let s = X("select", {
				"aria-label": `${t.name}'s dictionary`,
				title: "Which installed dictionary checks it"
			}, ...t.variants.map((e) => X("option", { value: e.value }, e.label)));
			return s.value = t.variant, s.disabled = t.variants.length < 2, s.addEventListener("change", () => void n.setVariant(t.lang, s.value).then(i)), X("tr", { class: t.on ? "" : "off" }, X("td", {}, X("label", { class: "lang" }, r, t.name)), X("td", {}, X("label", { class: "main" }, o, "main")), X("td", { class: "dict" }, s), X("td", { class: "none" }, t.on ? `${t.learned} words learned from the vault` : "not checked"));
		})) : X("div", { class: "none" }, "No Hunspell dictionary here, nor in the vault's .atlas/dictionaries: install one (hunspell-en, hunspell-es…) on a computer that opens this vault, or name a folder below."), X("div", { class: "about" }, "Checked: the languages a note may be in. A note's language is its lang: property, else guessed among the checked ones; the main one is used when a note says too little. A word right in any checked language is not marked.")), s = X("input", {
			"aria-label": "A word to add",
			placeholder: "a word…",
			spellcheck: "false"
		}), c = X("form", {}, s, X("button", {}, "Add"));
		c.addEventListener("submit", (e) => {
			e.preventDefault();
			let t = s.value.trim();
			t && n.add(t).then(i);
		});
		let l = X("section", {}, X("h3", {}, `Your words (${e.added.length})`), e.added.length ? X("div", { class: "chips" }, ...e.added.map((e) => X("span", { class: "chip" }, e, X("button", {
			title: `Take “${e}” out of this vault's words`,
			"aria-label": `Remove ${e}`,
			onclick: () => void n.remove(e).then(i)
		}, "×")))) : X("div", { class: "none" }, "None yet. A word added here, from the lower bar's panel or by a right-click on a marked word is never marked again in this vault."), c);
		r.replaceChildren(o, l);
	};
	return i(), i;
}
//#endregion
//#region plugins/beta/spelling/ui/src/main.ts
async function ye(e) {
	let { state: t, view: n, language: r } = e.editor.codemirror, i = (t) => e.plugin.settings[t], a = () => Number(i("min_uses") ?? 3), o = () => Number(i("min_notes") ?? 2), s = (t, n) => {
		let r = `atlas.spelling.told.${t}`;
		try {
			if (localStorage.getItem(r)) return;
			localStorage.setItem(r, "1");
		} catch {}
		e.toast("Spelling", n, "info");
	}, c = await e.helper.call("dictionaries", { folder: i("folder") }).catch(() => []), l = Array.isArray(c) ? c.filter((e) => typeof e == "string") : [], { chosen: u, langs: d, main: f } = re(l, e.plugin.settings), p = {
		en: "English",
		es: "Spanish",
		fr: "French",
		de: "German",
		it: "Italian",
		pt: "Portuguese",
		ca: "Catalan",
		nl: "Dutch",
		pl: "Polish",
		ru: "Russian",
		sv: "Swedish",
		da: "Danish",
		nb: "Norwegian",
		fi: "Finnish",
		cs: "Czech",
		el: "Greek",
		tr: "Turkish",
		ro: "Romanian",
		hu: "Hungarian",
		uk: "Ukrainian",
		gl: "Galician",
		eu: "Basque"
	}, m = (e) => p[e] ?? e;
	l.length || s("no-dictionary", "No Hunspell dictionary here, nor in the vault's .atlas/dictionaries: only the vault's own words are known, so nothing is marked. Open the vault once on a computer that has one (Settings → Spelling keeps it in the vault), or name a folder there.");
	let h = [...new Set(d.flatMap((e) => u.get(e) ?? []))];
	i("keep_in_vault") !== !1 && h.length && e.helper.call("keep", {
		names: h,
		folder: i("folder")
	}, { timeout: 120 }).then((e) => {
		e.length && console.info(`spelling: kept ${e.join(", ")} in the vault (.atlas/dictionaries) for the devices that have none`);
	}).catch((e) => console.warn("spelling: the dictionaries were not kept in the vault:", e));
	let g = /* @__PURE__ */ new Map(), _ = (t) => {
		let n = g.get(t);
		if (n) return n === "loading" ? null : {
			correct: (e) => n.some((t) => t.correct(e)),
			suggest: (e) => [...new Set(n.flatMap((t) => t.suggest(e)))]
		};
		let r = u.get(t);
		return r ? (g.set(t, "loading"), y(t), Promise.all(r.map((t) => e.helper.call("dictionary", {
			name: t,
			folder: i("folder")
		}, { timeout: 60 }))).then((e) => {
			g.set(t, e.map(({ aff: e, dic: t }) => (0, O.default)(e, t))), L();
		}).catch((e) => {
			console.warn(`spelling: ${r.join(", ")} did not load:`, e), g.delete(t);
		}), null) : null;
	}, v = /* @__PURE__ */ new Map(), y = (t) => {
		if (e.editor.words) return v.has(t) || (v.set(t, null), e.editor.words(t).then((e) => v.set(t, e)).catch(() => {})), v.get(t) ?? void 0;
	}, b = (e, t) => {
		let n = y(e);
		return (r) => fe(r, {
			correct: (e) => t.correct(e),
			dictionary: (e) => t.suggest(e),
			uses: (t) => x.get(e)?.get(t)?.[0] ?? 0,
			zipf: n?.zipf,
			letters: le[e]
		});
	}, x = /* @__PURE__ */ new Map(), S = /* @__PURE__ */ new Set(), C = async () => {
		S = await e.exists(".atlas/spelling/words.md") ? me(await e.readText(pe)) : /* @__PURE__ */ new Set(), L();
	}, w = se(async (t) => await e.helper.call("count", {
		paths: t,
		langs: d.length ? d : [f],
		fallback: f
	}), (e, t) => {
		let n = x.get(e.lang) ?? x.set(e.lang, /* @__PURE__ */ new Map()).get(e.lang);
		for (let [r, i] of Object.entries(e.words)) {
			let e = n.get(r) ?? [0, 0];
			e[0] += t * i, e[1] += t, e[1] <= 0 ? n.delete(r) : n.set(r, e);
		}
	}, "spelling"), T = async () => {
		await w.countAll(await e.helper.call("notes"), (e) => {
			e % 200 == 0 && L();
		}), L();
	}, E = (e, t) => {
		let n = x.get(e), r = n?.get(t) ?? n?.get(t.toLowerCase());
		return !!r && (r[0] >= a() && r[1] >= o() || r[0] >= 8);
	}, D = /* @__PURE__ */ new Map(), k = (e, t) => {
		let n = (t) => S.has(t) || S.has(t.toLowerCase()) || E(e, t) || (D.get(t) ?? 0) >= 8;
		if (!ce(t, n)) return !1;
		let r = _(e);
		return r ? ce(t, (e) => n(e) || r.correct(e)) ? !d.filter((t) => t !== e).map(_).some((e) => e && !ce(t, e.correct)) : !1 : null;
	}, M = n.Decoration.mark({ class: "cm-spell-miss" }), P = /* @__PURE__ */ new Set(), F = t.StateEffect.define(), I = /* @__PURE__ */ new Set();
	function L() {
		for (let e of P) e.dispatch({ effects: F.of(null) });
		for (let e of I) e();
	}
	let R = (e) => {
		let t = e.state.doc.sliceString(0, 4e3);
		return /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(t.slice(0, A(t)))?.[1];
	}, B = (e) => {
		let t = R(e), n = t ? z(t) : "";
		return u.has(n) ? n : ee(e.state.doc.sliceString(0, 2e4), d.length ? d : [f], f);
	}, V = null, H = null, U = /* @__PURE__ */ new WeakMap(), W = e.context(), G = null, K = "", q = (t, n = "") => {
		if (t + "\n" + n !== K) {
			if (K = t + "\n" + n, !t) {
				G?.remove(), G = null;
				return;
			}
			if (G) {
				G.set(t, n);
				return;
			}
			G = e.shell.statusItem({
				id: "spelling",
				text: t,
				title: n,
				panelWidth: 420,
				run: () => e.plugin.openSettings(),
				panel: (e, t) => {
					V && _e(e, () => ye(V), xe(V, t));
				}
			});
		}
	}, ue = (e) => !!e && P.has(e) && e.dom.isConnected, de = (e) => W.open.some((t) => t.path === e) || W.active?.path === e;
	function J() {
		let t = [...P].filter(ue), n = t.find((e) => e.hasFocus);
		if (n) return Q(n) ? n : null;
		let r = W.active;
		if (r?.kind === "editor") {
			let n = t.filter((t) => e.editor.path(t) === r.path && Q(t));
			return n.find((e) => e === H) ?? n.find((e) => e.dom.offsetParent !== null) ?? n[0] ?? null;
		}
		return r?.kind === "plugin" && ue(H) && H.dom.offsetParent !== null && Q(H) && !de(e.editor.path(H)) ? H : null;
	}
	function Y() {
		let t = J(), n = t && U.get(t);
		if (V = t, !t || !n) {
			q("");
			return;
		}
		let { lang: r, marked: i } = n, a = e.editor.path(t), o = de(a) ? `“${ne(a)}”` : "the text being written", s = g.get(r) === "loading", c = u.get(r)?.join(" + ") ?? "no dictionary";
		q(`${r.toUpperCase()} ${s ? "…" : i ? `· ${i} misspelled` : "✓"}`, `Spelling of ${o}: ${m(r)} (${c}), ${R(t) ? "from its lang: property" : "guessed from its words"}. ${i} word${i === 1 ? "" : "s"} marked on screen; ${be(r)} words learned from the vault, ${S.size} added by you. Click for the panel: the language, the marked words and their fixes, your words.`);
	}
	e.onContext((e) => {
		W = e, Y();
	});
	function X(e, t) {
		let n = r.syntaxTree(e.state), i = A(e.state.doc.sliceString(0, 4e3)), a = _(t), o = a ? b(t, a) : null, s = [];
		for (let [r, a] of j((e) => n.iterate(e), 0, e.state.doc.length, i)) for (let n of N(e.state.sliceDoc(r, a), r)) !Ce(e, n) && k(t, n.word) && s.push({
			word: n.word,
			from: n.from,
			to: n.to,
			line: e.state.doc.lineAt(n.from).number,
			fixes: []
		});
		for (let e of s.slice(0, 60)) e.fixes = o ? o(e.word).slice(0, 3) : [];
		return s;
	}
	function ye(e) {
		let t = B(e), n = _(t), r = [...x.get(t)?.entries() ?? []].filter(([, [e, t]]) => e >= a() && t >= o() || e >= 8), i = n ? r.filter(([e]) => !n.correct(e) && !n.correct(e.toLowerCase())).sort((e, t) => t[1][0] - e[1][0]).slice(0, 40).map(([e]) => e) : [];
		return {
			lang: t,
			choices: [.../* @__PURE__ */ new Set([...d, t])].map((e) => ({
				lang: e,
				name: m(e)
			})),
			source: R(e) ? "set for this note (lang: property)" : "guessed from its words",
			dictionaries: u.get(t)?.join(" + ") ?? "no dictionary installed",
			loading: g.get(t) === "loading",
			marked: X(e, t),
			added: [...S].sort((e, t) => e.localeCompare(t)),
			learned: {
				count: r.length,
				terms: i
			}
		};
	}
	let Z = async (t) => {
		let n = await e.exists(".atlas/spelling/words.md") ? await e.readText(pe) : "";
		await e.writeText(pe, t(n)), await C();
	}, be = (e) => [...x.get(e)?.values() ?? []].filter(([e, t]) => e >= a() && t >= o() || e >= 8).length;
	e.plugin.registerSettingsSection?.({
		id: "words",
		title: "Languages and words",
		place: "before",
		hint: "The languages this machine's dictionaries give, which are checked, and the words you added; the form below has the finer settings.",
		mount: (e, t) => {
			let n = () => re(l, t.settings()), r = (e) => te(l, "").get(e) ?? u.get(e) ?? [], i = ve(e, () => {
				let e = n(), i = ie(t.settings().dictionaries);
				return {
					main: e.main,
					langs: e.available.map((t) => {
						let n = l.filter((e) => z(e) === t).sort(), a = r(t).join(" + "), o = i.get(t) ?? "", s = [{
							value: "",
							label: `${a} (usual)`
						}, ...n.filter((e) => e !== a).map((e) => ({
							value: e,
							label: e
						}))];
						return o && !s.some((e) => e.value === o) && s.push({
							value: o,
							label: o.replace(/\+/g, " + ")
						}), {
							lang: t,
							name: m(t),
							on: e.langs.includes(t),
							variant: o,
							variants: s,
							learned: be(t)
						};
					}),
					added: [...S].sort((e, t) => e.localeCompare(t))
				};
			}, {
				setMain: async (e) => {
					await t.save({ language: e });
				},
				setOn: async (e, r) => {
					let i = n(), a = r ? [...i.langs, e] : i.langs.filter((t) => t !== e);
					a.length && await t.save({
						languages: oe(a, i),
						...r || e !== i.main ? {} : { language: null }
					});
				},
				setVariant: async (e, n) => {
					let r = ie(t.settings().dictionaries);
					n ? r.set(e, n) : r.delete(e), await t.save({ dictionaries: ae(r) });
				},
				add: (e) => Z((t) => ge(t, e)),
				remove: (e) => Z((t) => he(t, e))
			});
			return I.add(i), () => {
				I.delete(i);
			};
		}
	});
	let xe = (t, n) => ({
		setLang: (r) => {
			n();
			let i = e.editor.path(t);
			e.exists(i).then((t) => t ? e.writeProperty(i, "lang", r) : e.toast("Spelling", "This text is not a note, so it has no lang: property: its language is guessed from its words.", "info"));
		},
		select: (e) => {
			n(), t.dispatch({
				selection: {
					anchor: e.from,
					head: e.to
				},
				scrollIntoView: !0
			}), t.focus();
		},
		fix: (e, n) => {
			t.state.sliceDoc(e.from, e.to) === e.word && t.dispatch({
				changes: {
					from: e.from,
					to: e.to,
					insert: n
				},
				userEvent: "input.spelling"
			});
		},
		add: (e) => Z((t) => ge(t, e)),
		remove: (e) => Z((t) => he(t, e)),
		settings: () => {
			n(), e.plugin.openSettings();
		}
	}), Q = (t) => /\.(md|markdown)$/i.test(e.editor.path(t));
	function Se(e) {
		if (!Q(e)) return U.delete(e), Y(), n.Decoration.none;
		let t = B(e);
		D = /* @__PURE__ */ new Map();
		for (let { word: t } of N(e.state.doc.sliceString(0, 2e5))) D.set(t, (D.get(t) ?? 0) + 1);
		let i = r.syntaxTree(e.state), a = e.state.selection.main.head, o = A(e.state.doc.sliceString(0, 4e3)), s = [];
		for (let { from: n, to: r } of e.visibleRanges) for (let [c, l] of j((e) => i.iterate(e), n, r, o)) for (let n of N(e.state.sliceDoc(c, l), c)) n.to === a || Ce(e, n) || k(t, n.word) && s.push(M.range(n.from, n.to));
		return U.set(e, {
			lang: t,
			marked: s.length
		}), Y(), n.Decoration.set(s, !0);
	}
	function Ce(e, t) {
		return /^\p{Lu}/u.test(t.word);
	}
	let $ = null, we = n.ViewPlugin.fromClass(class {
		view;
		decorations;
		timer = 0;
		constructor(e) {
			this.view = e, P.add(e), this.decorations = Se(e);
		}
		update(e) {
			if (e.transactions.some((e) => e.effects.some((e) => e.is(F)))) {
				this.decorations = Se(e.view);
				return;
			}
			e.focusChanged && (e.view.hasFocus && (H = e.view), Y()), e.docChanged && (this.decorations = this.decorations.map(e.changes)), (e.docChanged || e.viewportChanged || e.selectionSet) && (clearTimeout(this.timer), this.timer = window.setTimeout(() => this.view.dispatch({ effects: F.of(null) }), e.docChanged ? 400 : 120));
		}
		destroy() {
			clearTimeout(this.timer), P.delete(this.view), H === this.view && (H = null), queueMicrotask(Y);
		}
	}, {
		decorations: (e) => e.decorations,
		eventHandlers: {
			mousedown(e, t) {
				e.button === 2 && Te(e, t);
			},
			contextmenu(e, t) {
				Te(e, t);
			}
		}
	});
	function Te(e, t) {
		$ = null;
		let n = t.posAtCoords({
			x: e.clientX,
			y: e.clientY
		});
		if (n === null) return;
		let r = t.state.doc.lineAt(n), i = N(r.text, r.from).find((e) => e.from <= n && n <= e.to), a = B(t);
		i && Q(t) && !Ce(t, i) && k(a, i.word) && ($ = {
			view: t,
			word: i,
			lang: a
		});
	}
	e.editor.extension([we, n.EditorView.baseTheme({ ".cm-spell-miss": {
		textDecoration: "underline wavy var(--red)",
		textDecorationThickness: "1px",
		textUnderlineOffset: "3px",
		textDecorationSkipInk: "none"
	} })]), e.shell.menu("editor", () => {
		let e = $;
		if (!e) return [];
		let t = _(e.lang), n = (t) => () => e.view.dispatch({
			changes: {
				from: e.word.from,
				to: e.word.to,
				insert: t
			},
			userEvent: "input.spelling"
		}), r = t ? b(e.lang, t)(e.word.word) : [];
		return [
			...r.map((e) => ({
				label: e,
				run: n(e),
				icon: "check",
				top: !0
			})),
			...r.length ? [] : [{
				label: "No suggestions",
				run: () => {},
				disabled: !0,
				top: !0
			}],
			{
				label: `Add “${e.word.word}” to this vault's words`,
				icon: "plus",
				top: !0,
				run: () => Z((t) => ge(t, e.word.word))
			}
		];
	}), e.onFilesChanged((e) => {
		(!e.length || e.includes(".atlas/spelling/words.md")) && C();
		let t = e.filter((e) => /\.md$/i.test(e) && !e.startsWith(".atlas/"));
		w.counted && t.length && w.count(t).then(L);
	}), await C(), T().catch((e) => console.warn("spelling: the vault's words were not counted:", e));
}
//#endregion
export { ye as register };
