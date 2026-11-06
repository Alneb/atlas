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
		for (a.sort(F), f = [], M = [], p = -1; ++p < a.length;) N = r(a[p], t.conversion.out), u = N.toLowerCase(), M.indexOf(u) < 0 && (f.push(N), M.push(u));
		return f;
		function F(e, t) {
			return I(e, t) || L(e, t) || ee(e, t);
		}
		function I(e, t) {
			return s[e] === s[t] ? 0 : s[e] > s[t] ? -1 : 1;
		}
		function L(e, t) {
			var r = n(e), i = n(t);
			return r === i ? 0 : r === P ? -1 : i === P ? 1 : void 0;
		}
		function ee(e, t) {
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
function F(e, t, n, r) {
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
var I = {
	en: [["en_US", "en_CA"], ["en_GB", "en_AU"]],
	es: [[
		"es_ES",
		"es_MX",
		"es_AR"
	]],
	fr: [["fr_FR", "fr_CA"]],
	de: [["de_DE"]]
};
function L(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let [t, r] of Object.entries(I)) {
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
//#region ui/src/lib/editor/vault-count.ts
function ee(e, t, n, r = 20) {
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
function R(e, t) {
	let n = e.replace(/['’]s$/u, "");
	if (n.length < 3 || /\p{Lu}/u.test(n.slice(1))) return !1;
	let r = (e) => t(e) || /s$/.test(e) && t(e.slice(0, -1)), i = (e) => e.length < 3 || /\p{Lu}/u.test(e.slice(1)) || r(e) || /^\p{Lu}/u.test(e) && r(e.toLowerCase());
	if (i(n)) return !1;
	let a = n.split(/[-‐]/u);
	return a.length < 2 || !a.every(i);
}
//#endregion
//#region ui/src/lib/editor/spell-rank.ts
var z = {
	substitute: .38,
	nearKey: .2,
	accent: .03,
	omit: .47,
	extra: .73,
	double: .3,
	swap: .35
}, B = [
	"qwertyuiop",
	"asdfghjklñ",
	"zxcvbnm"
], V = /* @__PURE__ */ new Map();
B.forEach((e, t) => [...e].forEach((e, n) => {
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
		let o = B[t + i]?.[n + a];
		o && o !== e && r.add(o);
	}
	V.set(e, r);
}));
var H = (e) => e === "ñ" ? e : e.normalize("NFD").replace(/\p{M}/gu, "");
function U(e, t) {
	return e === t ? 0 : H(e) === H(t) ? z.accent : V.get(H(e))?.has(H(t)) ? z.nearKey : z.substitute;
}
function W(e, t) {
	let n = [...e.toLowerCase()], r = [...t.toLowerCase()], i = Array.from({ length: n.length + 1 }, () => Array(r.length + 1).fill(0));
	for (let e = 1; e <= n.length; e++) i[e][0] = i[e - 1][0] + z.extra;
	for (let e = 1; e <= r.length; e++) i[0][e] = i[0][e - 1] + z.omit;
	for (let e = 1; e <= n.length; e++) for (let t = 1; t <= r.length; t++) {
		let a = n[e - 1] === n[e - 2] || n[e - 1] === r[t - 1] ? z.double : z.extra, o = Math.min(i[e - 1][t] + a, i[e][t - 1] + z.omit, i[e - 1][t - 1] + U(n[e - 1], r[t - 1]));
		e > 1 && t > 1 && n[e - 1] === r[t - 2] && n[e - 2] === r[t - 1] && n[e - 1] !== n[e - 2] && (o = Math.min(o, i[e - 2][t - 2] + z.swap)), i[e][t] = o;
	}
	return i[n.length][r.length];
}
function te(e, t) {
	let n = e.toLowerCase(), r = /* @__PURE__ */ new Set();
	for (let e = 0; e <= n.length; e++) {
		let [i, a] = [n.slice(0, e), n.slice(e)];
		a && r.add(i + a.slice(1)), a.length > 1 && r.add(i + a[1] + a[0] + a.slice(2));
		for (let e of t) r.add(i + e + a), a && r.add(i + e + a.slice(1));
	}
	return r.delete(n), [...r];
}
var ne = {
	en: "abcdefghijklmnopqrstuvwxyz",
	es: "abcdefghijklmnopqrstuvwxyzáéíóúüñ"
}, re = .9;
function G(e, t, n, r, i = 6) {
	let a = e.toLowerCase(), o = /* @__PURE__ */ new Map();
	for (let e of t) {
		let t = e.toLowerCase();
		if (t === a || o.has(t)) continue;
		let i = Math.max(n(t), r(e) || r(t) ? 4 + Math.log2(1 + (r(e) || r(t))) : 0);
		o.set(t, W(a, t) + re * (1 - Math.min(i, 8) / 8));
	}
	let s = /^\p{Lu}/u.test(e) && !/\p{Lu}/u.test(e.slice(1));
	return [...o].sort((e, t) => e[1] - t[1]).slice(0, i).map(([e]) => s ? e[0].toUpperCase() + e.slice(1) : e);
}
function K(e) {
	let t = [];
	for (let n = 0; n + 1 < e.length; n++) e[n] !== e[n + 1] && t.push(e.slice(0, n) + e[n + 1] + e[n] + e.slice(n + 2));
	return t;
}
function ie(e, t, n = 6) {
	let r = t.zipf ?? (() => 0), i = /* @__PURE__ */ new Set([...K(e).filter(t.correct), ...t.dictionary(e)]);
	if (t.zipf && t.letters) for (let n of te(e, t.letters)) {
		let e = r(n);
		(t.uses(n) > 0 || e >= 3.5 || e > 0 && t.correct(n)) && i.add(n);
	}
	return G(e, i, r, t.uses, n);
}
//#endregion
//#region plugins/beta/spelling/ui/src/words.ts
var q = ".atlas/spelling/words.md", J = /^```words[ \t]*\n([\s\S]*?)^```/m;
function Y(e) {
	let t = J.exec(e)?.[1] ?? "";
	return new Set(t.split("\n").map((e) => e.trim()).filter(Boolean));
}
function ae(e, t) {
	let n = [...Y(e)].filter((e) => e !== t);
	return e.replace(J, "```words\n" + n.map((e) => e + "\n").join("") + "```");
}
function X(e, t) {
	let n = "```words\n" + [...Y(e), t].filter((e, t, n) => n.indexOf(e) === t).sort((e, t) => e.localeCompare(t)).join("\n") + "\n```";
	return J.test(e) ? e.replace(J, n + "\n").replace(/```\n\n$/, "```\n") : (e.trim() ? e.replace(/\s*$/, "\n\n") : "# This vault's words\n\nWords the spell checker takes as right here, one per line.\n\n") + n + "\n";
}
//#endregion
//#region plugins/beta/spelling/ui/src/panel.ts
var Z = "\n.sp { display: flex; flex-direction: column; gap: 12px; padding: 4px 2px; }\n.sp h3 { margin: 0 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--text-faint); }\n.sp .langs { display: flex; flex-wrap: wrap; gap: 4px; }\n.sp button { font: inherit; color: var(--text); background: none; border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; cursor: pointer; }\n.sp button:hover { background: var(--bg-hover); }\n.sp .langs button.on, .sp table button.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }\n.sp .about { margin-top: 4px; color: var(--text-faint); font-size: 11.5px; }\n.sp ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 240px; overflow: auto; }\n.sp li.word { display: flex; align-items: center; gap: 6px; padding: 2px 0; }\n.sp li.word .w { border: none; padding: 1px 4px; text-decoration: underline wavy var(--red); text-decoration-thickness: 1px; text-underline-offset: 3px; }\n.sp li.word .line { color: var(--text-faint); font-size: 11px; min-width: 44px; }\n.sp li.word .fix { border-color: transparent; background: var(--bg-hover); padding: 1px 6px; }\n.sp li.word .fix:hover { border-color: var(--accent); }\n.sp li.word .keep { margin-left: auto; color: var(--text-faint); border-color: transparent; padding: 1px 5px; }\n.sp .none { color: var(--text-faint); }\n.sp .chips { display: flex; flex-wrap: wrap; gap: 4px; max-height: 120px; overflow: auto; }\n.sp .chip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 2px 1px 7px; border-radius: 10px; background: var(--bg-hover); }\n.sp .chip button { border: none; padding: 0 5px; color: var(--text-faint); border-radius: 10px; }\n.sp .chip.plain { padding: 1px 7px; color: var(--text-muted); }\n.sp .foot { display: flex; justify-content: flex-end; }\n.sp table { border-collapse: collapse; }\n.sp td { padding: 3px 12px 3px 0; vertical-align: baseline; }\n.sp td.dict { color: var(--text-muted); font-family: var(--font-mono); font-size: 12px; }\n.sp form { display: flex; gap: 6px; margin-top: 6px; }\n.sp input { font: inherit; padding: 2px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); width: 14em; }\n";
function Q(e, t = {}, ...n) {
	let r = document.createElement(e);
	for (let [e, n] of Object.entries(t)) if (e === "onclick") r.addEventListener("click", n);
	else if (typeof n == "function") continue;
	else n !== void 0 && r.setAttribute(e, n);
	for (let e of n) e && r.append(e);
	return r;
}
function oe(e, t, n) {
	e.replaceChildren(Q("style", {}, Z));
	let r = e.appendChild(Q("div", { class: "sp" })), i = () => a(t()), a = (e) => {
		let t = Q("section", {}, Q("h3", {}, "Language of this note"), Q("div", { class: "langs" }, ...e.choices.map((t) => Q("button", {
			class: t.lang === e.lang ? "on" : "",
			"aria-pressed": String(t.lang === e.lang),
			title: t.lang === e.lang ? e.source : `Set lang: ${t.lang} in this note's properties`,
			onclick: () => {
				n.setLang(t.lang);
			}
		}, t.name))), Q("div", { class: "about" }, `${e.source} · ${e.dictionaries}${e.loading ? " · loading the dictionary…" : ""}`)), a = Q("section", {}, Q("h3", {}, `Marked in this note (${e.marked.length})`), e.marked.length ? Q("ul", {}, ...e.marked.map((e) => Q("li", { class: "word" }, Q("button", {
			class: "w",
			title: "Select it in the note",
			onclick: () => n.select(e)
		}, e.word), Q("span", { class: "line" }, `line ${e.line}`), ...e.fixes.length ? e.fixes.slice(0, 3).map((t) => Q("button", {
			class: "fix",
			title: `Replace with “${t}”`,
			onclick: () => {
				n.fix(e, t), i();
			}
		}, t)) : [Q("span", { class: "none" }, "no suggestions")], Q("button", {
			class: "keep",
			title: `Add “${e.word}” to this vault's words`,
			onclick: () => void n.add(e.word).then(i)
		}, "+ add")))) : Q("div", { class: "none" }, e.loading ? "Waiting for the dictionary." : "Nothing marked: every word is known.")), o = Q("section", {}, Q("h3", {}, `Added by you (${e.added.length})`), e.added.length ? Q("div", { class: "chips" }, ...e.added.map((e) => Q("span", { class: "chip" }, e, Q("button", {
			title: `Take “${e}” out of this vault's words`,
			"aria-label": `Remove ${e}`,
			onclick: () => void n.remove(e).then(i)
		}, "×")))) : Q("div", { class: "none" }, "None yet: “+ add” here or a right-click on a marked word adds one.")), s = Q("section", {}, Q("h3", {}, `Learned from the vault (${e.learned.count})`), e.learned.terms.length ? Q("div", {}, Q("div", { class: "about" }, "Not in the dictionary, the most used first:"), Q("div", { class: "chips" }, ...e.learned.terms.map((e) => Q("span", { class: "chip plain" }, e)))) : Q("div", { class: "none" }, e.learned.count ? "All of them are in the dictionary too." : "Still counting the vault's notes."));
		r.replaceChildren(t, a, o, s, Q("div", { class: "foot" }, Q("button", { onclick: () => n.settings() }, "Spelling settings…")));
	};
	a(t());
}
function se(e, t, n) {
	e.replaceChildren(Q("style", {}, Z));
	let r = e.appendChild(Q("div", { class: "sp" })), i = () => {
		let e = t(), a = Q("section", {}, Q("h3", {}, "Languages"), e.langs.length ? Q("table", {}, ...e.langs.map((t) => Q("tr", {}, Q("td", {}, Q("button", {
			class: t.lang === e.main ? "on" : "",
			"aria-pressed": String(t.lang === e.main),
			title: t.lang === e.main ? "The main language: a note says too little to tell" : `Make ${t.name} the main language`,
			onclick: () => void n.setMain(t.lang).then(i)
		}, t.name)), Q("td", {
			class: "dict",
			title: t.others.length ? `Also installed: ${t.others.join(", ")}` : ""
		}, t.dictionaries, t.others.length ? Q("span", { class: "none" }, ` · ${t.others.length} more installed`) : null), Q("td", { class: "none" }, `${t.learned} words learned from the vault`)))) : Q("div", { class: "none" }, "No Hunspell dictionary here, nor in the vault's .atlas/dictionaries: install one (hunspell-en, hunspell-es…) on a computer that opens this vault, or name a folder below."), Q("div", { class: "about" }, "A note's language is its lang: property, else guessed from its words; the highlighted one is used when a note says too little. Another variant (en_GB, es_MX…) is chosen under Dictionaries below.")), o = Q("input", {
			"aria-label": "A word to add",
			placeholder: "a word…",
			spellcheck: "false"
		}), s = Q("form", {}, o, Q("button", {}, "Add"));
		s.addEventListener("submit", (e) => {
			e.preventDefault();
			let t = o.value.trim();
			t && n.add(t).then(i);
		});
		let c = Q("section", {}, Q("h3", {}, `Your words (${e.added.length})`), e.added.length ? Q("div", { class: "chips" }, ...e.added.map((e) => Q("span", { class: "chip" }, e, Q("button", {
			title: `Take “${e}” out of this vault's words`,
			"aria-label": `Remove ${e}`,
			onclick: () => void n.remove(e).then(i)
		}, "×")))) : Q("div", { class: "none" }, "None yet. A word added here, from the lower bar's panel or by a right-click on a marked word is never marked again in this vault."), s);
		r.replaceChildren(a, c);
	};
	i();
}
//#endregion
//#region plugins/beta/spelling/ui/src/main.ts
async function $(e) {
	let { state: t, view: n, language: r } = e.editor.codemirror, i = (t) => e.plugin.settings[t], a = () => Number(i("min_uses") ?? 3), o = () => Number(i("min_notes") ?? 2), s = (t, n) => {
		let r = `atlas.spelling.told.${t}`;
		try {
			if (localStorage.getItem(r)) return;
			localStorage.setItem(r, "1");
		} catch {}
		e.toast("Spelling", n, "info");
	}, c = await e.helper.call("dictionaries", { folder: i("folder") }).catch(() => []) ?? [], l = L(c, i("dictionaries")), u = [...l.keys()], d = String(i("language") || u[0] || "en"), f = {
		en: "English",
		es: "Spanish",
		fr: "French",
		de: "German",
		it: "Italian",
		pt: "Portuguese",
		ca: "Catalan",
		nl: "Dutch"
	};
	c.length || s("no-dictionary", "No Hunspell dictionary here, nor in the vault's .atlas/dictionaries: only the vault's own words are known, so nothing is marked. Open the vault once on a computer that has one (Settings → Spelling keeps it in the vault), or name a folder there."), i("keep_in_vault") !== !1 && l.size && e.helper.call("keep", {
		names: [...new Set([...l.values()].flat())],
		folder: i("folder")
	}, { timeout: 120 }).then((e) => {
		e.length && console.info(`spelling: kept ${e.join(", ")} in the vault (.atlas/dictionaries) for the devices that have none`);
	}).catch((e) => console.warn("spelling: the dictionaries were not kept in the vault:", e));
	let p = /* @__PURE__ */ new Map(), m = (t) => {
		let n = p.get(t);
		if (n) return n === "loading" ? null : {
			correct: (e) => n.some((t) => t.correct(e)),
			suggest: (e) => [...new Set(n.flatMap((t) => t.suggest(e)))]
		};
		let r = l.get(t);
		return r ? (p.set(t, "loading"), g(t), Promise.all(r.map((t) => e.helper.call("dictionary", {
			name: t,
			folder: i("folder")
		}, { timeout: 60 }))).then((e) => {
			p.set(t, e.map(({ aff: e, dic: t }) => (0, O.default)(e, t))), M();
		}).catch((e) => {
			console.warn(`spelling: ${r.join(", ")} did not load:`, e), p.delete(t);
		}), null) : null;
	}, h = /* @__PURE__ */ new Map(), g = (t) => {
		if (e.editor.words) return h.has(t) || (h.set(t, null), e.editor.words(t).then((e) => h.set(t, e)).catch(() => {})), h.get(t) ?? void 0;
	}, _ = (e, t) => {
		let n = g(e);
		return (r) => ie(r, {
			correct: (e) => t.correct(e),
			dictionary: (e) => t.suggest(e),
			uses: (t) => v.get(e)?.get(t)?.[0] ?? 0,
			zipf: n?.zipf,
			letters: ne[e]
		});
	}, v = /* @__PURE__ */ new Map(), y = /* @__PURE__ */ new Set(), b = async () => {
		y = await e.exists(".atlas/spelling/words.md") ? Y(await e.readText(q)) : /* @__PURE__ */ new Set(), M();
	}, x = ee(async (t) => await e.helper.call("count", {
		paths: t,
		langs: u.length ? u : [d],
		fallback: d
	}), (e, t) => {
		let n = v.get(e.lang) ?? v.set(e.lang, /* @__PURE__ */ new Map()).get(e.lang);
		for (let [r, i] of Object.entries(e.words)) {
			let e = n.get(r) ?? [0, 0];
			e[0] += t * i, e[1] += t, e[1] <= 0 ? n.delete(r) : n.set(r, e);
		}
	}, "spelling"), S = async () => {
		await x.countAll(await e.helper.call("notes"), (e) => {
			e % 200 == 0 && M();
		}), M();
	}, C = (e, t) => {
		let n = v.get(e), r = n?.get(t) ?? n?.get(t.toLowerCase());
		return !!r && (r[0] >= a() && r[1] >= o() || r[0] >= 8);
	}, w = /* @__PURE__ */ new Map(), T = (e, t) => {
		let n = (t) => y.has(t) || y.has(t.toLowerCase()) || C(e, t) || (w.get(t) ?? 0) >= 8;
		if (!R(t, n)) return !1;
		let r = m(e);
		return r ? R(t, (e) => n(e) || r.correct(e)) ? !u.filter((t) => t !== e).map(m).some((e) => e && !R(t, e.correct)) : !1 : null;
	}, E = n.Decoration.mark({ class: "cm-spell-miss" }), D = /* @__PURE__ */ new Set(), k = t.StateEffect.define();
	function M() {
		for (let e of D) e.dispatch({ effects: k.of(null) });
	}
	let P = (e) => {
		let t = e.state.doc.sliceString(0, 4e3);
		return /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(t.slice(0, A(t)))?.[1];
	}, I = (e) => F(e.state.doc.sliceString(0, 2e4), u.length ? u : [d], d, P(e)), z = null, B = e.shell.statusItem({
		id: "spelling",
		text: "",
		title: "Spelling",
		panelWidth: 420,
		run: () => e.plugin.openSettings(),
		panel: (e, t) => {
			z && oe(e, () => H(z), te(z, t));
		}
	});
	function V(e, t) {
		let n = r.syntaxTree(e.state), i = A(e.state.doc.sliceString(0, 4e3)), a = m(t), o = a ? _(t, a) : null, s = [];
		for (let [r, a] of j((e) => n.iterate(e), 0, e.state.doc.length, i)) for (let n of N(e.state.sliceDoc(r, a), r)) !J(e, n) && T(t, n.word) && s.push({
			word: n.word,
			from: n.from,
			to: n.to,
			line: e.state.doc.lineAt(n.from).number,
			fixes: []
		});
		for (let e of s.slice(0, 60)) e.fixes = o ? o(e.word).slice(0, 3) : [];
		return s;
	}
	function H(e) {
		let t = I(e), n = m(t), r = [...v.get(t)?.entries() ?? []].filter(([, [e, t]]) => e >= a() && t >= o() || e >= 8), i = n ? r.filter(([e]) => !n.correct(e) && !n.correct(e.toLowerCase())).sort((e, t) => t[1][0] - e[1][0]).slice(0, 40).map(([e]) => e) : [];
		return {
			lang: t,
			choices: [.../* @__PURE__ */ new Set([...u, t])].map((e) => ({
				lang: e,
				name: f[e] ?? e
			})),
			source: P(e) ? "set for this note (lang: property)" : "guessed from its words",
			dictionaries: l.get(t)?.join(" + ") ?? "no dictionary installed",
			loading: p.get(t) === "loading",
			marked: V(e, t),
			added: [...y].sort((e, t) => e.localeCompare(t)),
			learned: {
				count: r.length,
				terms: i
			}
		};
	}
	let U = async (t) => {
		let n = await e.exists(".atlas/spelling/words.md") ? await e.readText(q) : "";
		await e.writeText(q, t(n)), await b();
	}, W = (e) => [...v.get(e)?.values() ?? []].filter(([e, t]) => e >= a() && t >= o() || e >= 8).length;
	e.plugin.registerSettingsSection?.({
		id: "words",
		title: "Languages and words",
		place: "before",
		hint: "What this machine's dictionaries give and the words you added; the form below has the finer settings.",
		mount: (e, t) => se(e, () => {
			let e = new Set([...l.values()].flat());
			return {
				main: String(t.settings().language || d),
				langs: u.map((t) => ({
					lang: t,
					name: f[t] ?? t,
					dictionaries: l.get(t).join(" + "),
					learned: W(t),
					others: c.filter((n) => !e.has(n) && n.split(/[_-]/)[0] === t)
				})),
				added: [...y].sort((e, t) => e.localeCompare(t))
			};
		}, {
			setMain: async (e) => {
				await t.save({ language: e });
			},
			add: (e) => U((t) => X(t, e)),
			remove: (e) => U((t) => ae(t, e))
		})
	});
	let te = (t, n) => ({
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
		add: (e) => U((t) => X(t, e)),
		remove: (e) => U((t) => ae(t, e)),
		settings: () => {
			n(), e.plugin.openSettings();
		}
	});
	function re(e, t, n) {
		if (!e.hasFocus && z && z !== e && D.has(z)) return;
		z = e;
		let r = p.get(t) === "loading", i = l.get(t)?.join(" + ") ?? "no dictionary", a = W(t);
		B.set(`${t.toUpperCase()} ${r ? "…" : n ? `· ${n} misspelled` : "✓"}`, `Spelling: ${f[t] ?? t} (${i}), ${P(e) ? "from the note's lang: property" : "guessed from its words"}. ${n} word${n === 1 ? "" : "s"} marked on screen; ${a} words learned from the vault, ${y.size} added by you. Click for the panel: the language, the marked words and their fixes, your words.`);
	}
	let G = (t) => /\.(md|markdown)$/i.test(e.editor.path(t));
	function K(e) {
		if (!G(e)) return (z === e || !z) && B.set(""), n.Decoration.none;
		let t = I(e);
		w = /* @__PURE__ */ new Map();
		for (let { word: t } of N(e.state.doc.sliceString(0, 2e5))) w.set(t, (w.get(t) ?? 0) + 1);
		let i = r.syntaxTree(e.state), a = e.state.selection.main.head, o = A(e.state.doc.sliceString(0, 4e3)), s = [];
		for (let { from: n, to: r } of e.visibleRanges) for (let [c, l] of j((e) => i.iterate(e), n, r, o)) for (let n of N(e.state.sliceDoc(c, l), c)) n.to === a || J(e, n) || T(t, n.word) && s.push(E.range(n.from, n.to));
		return re(e, t, s.length), n.Decoration.set(s, !0);
	}
	function J(e, t) {
		return /^\p{Lu}/u.test(t.word);
	}
	let Z = null, Q = n.ViewPlugin.fromClass(class {
		view;
		decorations;
		timer = 0;
		constructor(e) {
			this.view = e, D.add(e), this.decorations = K(e);
		}
		update(e) {
			if (e.transactions.some((e) => e.effects.some((e) => e.is(k)))) {
				this.decorations = K(e.view);
				return;
			}
			e.docChanged && (this.decorations = this.decorations.map(e.changes)), (e.docChanged || e.viewportChanged || e.selectionSet) && (clearTimeout(this.timer), this.timer = window.setTimeout(() => this.view.dispatch({ effects: k.of(null) }), e.docChanged ? 400 : 120));
		}
		destroy() {
			clearTimeout(this.timer), D.delete(this.view);
		}
	}, {
		decorations: (e) => e.decorations,
		eventHandlers: {
			mousedown(e, t) {
				e.button === 2 && $(e, t);
			},
			contextmenu(e, t) {
				$(e, t);
			}
		}
	});
	function $(e, t) {
		Z = null;
		let n = t.posAtCoords({
			x: e.clientX,
			y: e.clientY
		});
		if (n === null) return;
		let r = t.state.doc.lineAt(n), i = N(r.text, r.from).find((e) => e.from <= n && n <= e.to), a = I(t);
		i && G(t) && !J(t, i) && T(a, i.word) && (Z = {
			view: t,
			word: i,
			lang: a
		});
	}
	e.editor.extension([Q, n.EditorView.baseTheme({ ".cm-spell-miss": {
		textDecoration: "underline wavy var(--red)",
		textDecorationThickness: "1px",
		textUnderlineOffset: "3px",
		textDecorationSkipInk: "none"
	} })]), e.shell.menu("editor", () => {
		let e = Z;
		if (!e) return [];
		let t = m(e.lang), n = (t) => () => e.view.dispatch({
			changes: {
				from: e.word.from,
				to: e.word.to,
				insert: t
			},
			userEvent: "input.spelling"
		}), r = t ? _(e.lang, t)(e.word.word) : [];
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
				run: () => U((t) => X(t, e.word.word))
			}
		];
	}), e.onFilesChanged((e) => {
		(!e.length || e.includes(".atlas/spelling/words.md")) && b();
		let t = e.filter((e) => /\.md$/i.test(e) && !e.startsWith(".atlas/"));
		x.counted && t.length && x.count(t).then(M);
	}), await b(), S().catch((e) => console.warn("spelling: the vault's words were not counted:", e));
}
//#endregion
export { $ as register };
