//#region ui/src/lib/editor/prose.ts
var e = /* @__PURE__ */ new Set([
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
function t(e) {
	let t = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(e);
	return t ? t[0].length : 0;
}
function n(t, n, r, i = 0) {
	let a = i > n ? [[n, Math.min(i, r)]] : [];
	t({
		from: n,
		to: r,
		enter: (t) => {
			if (e.has(t.name)) return a.push([t.from, t.to]), !1;
		}
	}), a.sort((e, t) => e[0] - t[0]);
	let o = [], s = n;
	for (let [e, t] of a) e > s && o.push([s, Math.min(e, r)]), s = Math.max(s, t);
	return s < r && o.push([s, r]), o.filter(([e, t]) => t > e);
}
var r = /\p{L}[\p{L}\p{M}]*(?:['’-]\p{L}[\p{L}\p{M}]*)*/gu;
function i(e, t = 0) {
	let n = [];
	for (let i of e.matchAll(r)) {
		let r = e[i.index - 1] ?? "", a = e[i.index + i[0].length] ?? "";
		/[\p{N}@#_/\\]/u.test(r) || /[\p{N}@_/\\]/u.test(a) || r === "." && /\p{L}/u.test(e[i.index - 2] ?? "") || n.push({
			word: i[0],
			from: t + i.index,
			to: t + i.index + i[0].length
		});
	}
	return n;
}
var a = {
	en: new Set("the of and to in is that it for as with was on be by this are from or an at not which have but has can we".split(" ")),
	es: new Set("de la que el en los se del las un por con una para es al lo como más pero sus le ha o este si porque".split(" ")),
	fr: new Set("le la les de des et est un une du en que qui dans pour pas sur au par ce sont avec il elle nous".split(" "))
};
function o(e, t, n, r) {
	let o = typeof r == "string" ? r.toLowerCase().split(/[-_]/)[0] : "";
	if (o && t.includes(o)) return o;
	let s = /* @__PURE__ */ new Map(), c = 0;
	for (let { word: n } of i(e.slice(0, 2e4))) {
		let e = n.toLowerCase();
		for (let n of t) a[n]?.has(e) && s.set(n, (s.get(n) ?? 0) + 1);
		c++;
	}
	let [l, u] = [...s].sort((e, t) => t[1] - e[1])[0] ?? [n, 0];
	return c >= 12 && u >= 3 ? l : n;
}
//#endregion
//#region plugins/beta/predictor/ui/src/model.ts
var s = () => ({
	words: /* @__PURE__ */ new Map(),
	forms: /* @__PURE__ */ new Map(),
	next: /* @__PURE__ */ new Map()
});
function c(e, t) {
	return e.split(/[.!?;:]+(?:\s|$)|\n+/).map((e) => t(e).map((e) => e.word)).filter((e) => e.length);
}
var l = (e) => e ? e.split("\n").map((e) => e.split(" ")) : [];
function u(e, t, n = 1) {
	let r = (e, t) => {
		let r = (e.get(t) ?? 0) + n;
		r > 0 ? e.set(t, r) : e.delete(t);
	}, i = (e, t, n) => {
		let i = e.get(t) ?? e.set(t, /* @__PURE__ */ new Map()).get(t);
		r(i, n), i.size || e.delete(t);
	};
	for (let n of t) {
		let t = n.map((e) => e.toLowerCase());
		t.forEach((a, o) => {
			r(e.words, a), i(e.forms, a, n[o]), o >= 1 && i(e.next, t[o - 1], a), o >= 2 && i(e.next, `${t[o - 2]} ${t[o - 1]}`, a);
		});
	}
}
var d = (e, t) => {
	for (let n of e) {
		let e = [...n.forms.get(t) ?? []].sort((e, t) => t[1] - e[1])[0]?.[0];
		if (e) return e;
	}
	return t;
}, f = {
	share: .42,
	shareShort: .6,
	lead: 1.8
};
function p(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let { m: r, weight: i, min: a } of e) for (let [e, o] of r.next.get(t) ?? []) (r.words.get(e) ?? 0) >= a && n.set(e, (n.get(e) ?? 0) + o * i);
	return n;
}
var m = (e, t) => [{
	m: e,
	weight: 1,
	min: t.min
}, ...t.note ? [{
	m: t.note,
	weight: 2,
	min: 1
}] : []];
function h(e, t) {
	let n = (t) => {
		let n = e.map(t), r = n.reduce((e, t) => e + t, 0);
		return {
			of: (e) => r ? n[e] / r : 0,
			total: r
		};
	}, r = n((e) => t.tri.get(e) ?? 0), i = n((e) => t.bi.get(e) ?? 0), a = n(t.uni), o = n(t.general), s = r.total / (r.total + 2), c = i.total / (i.total + 3), l = a.total / (a.total + 8), u = e.map((e, t) => {
		let n = o.total ? l * a.of(t) + (1 - l) * o.of(t) : a.of(t);
		return s * r.of(t) + (1 - s) * (c * i.of(t) + (1 - c) * n);
	});
	return e.map((e, t) => [e, u[t]]).sort((e, t) => t[1] - e[1]);
}
var g = 1e-9;
function _(e, t, n, r) {
	if (r.length < 2) return null;
	let i = m(e, t), a = /* @__PURE__ */ new Set([r]);
	for (let { m: e } of i) for (let t of e.words.keys()) t.length > r.length && t.startsWith(r) && a.add(t);
	for (let e of t.general?.withPrefix(r, 40) ?? []) a.add(e);
	let o = t.lexicon;
	if (o?.length && r.length >= 3) {
		let e = 0, t = o.length;
		for (; e < t;) {
			let n = e + t >> 1;
			o[n] < r ? e = n + 1 : t = n;
		}
		for (let t = e; t < o.length && t < e + 400 && o[t].startsWith(r); t++) a.add(o[t]);
	}
	let s = [...a], c = new Set(o && r.length >= 3 ? s.filter((e) => v(o, e)) : []), l = (n) => {
		let r = e.words.get(n) ?? 0;
		return (r >= t.min ? r : 0) + 2 * (t.note?.words.get(n) ?? 0);
	}, u = (e) => t.general?.freq(e) || (c.has(e) ? g : 0), d = n.length >= 2 ? `${n[n.length - 2]} ${n[n.length - 1]}` : "", [_, y] = h(s, {
		tri: d ? p(i, d) : /* @__PURE__ */ new Map(),
		bi: n.length ? p(i, n[n.length - 1]) : /* @__PURE__ */ new Map(),
		uni: l,
		general: u
	});
	if (!_ || _[0] === r || _[1] <= 0 || _[0].length - r.length < 2) return null;
	let b = r.length >= 3 ? f.share : f.shareShort;
	return _[1] < b || y && y[1] * f.lead > _[1] ? null : _[0];
}
function v(e, t) {
	let n = 0, r = e.length;
	for (; n < r;) {
		let i = n + r >> 1;
		e[i] < t ? n = i + 1 : r = i;
	}
	return e[n] === t;
}
function y(e, t, n, r) {
	let i = t.split(/[.!?;:]\s|\n/).pop() ?? "", a = n(i).map((e) => e.word), o = /\p{L}$/u.test(i) ? a.pop() ?? "" : "";
	if (o && !i.endsWith(o)) return null;
	let s = a.map((e) => e.toLowerCase()), c = r.note ? [r.note, e] : [e], l = "", u = 0, f;
	if (o) {
		let t = _(e, r, s, o.toLowerCase());
		if (!t) return null;
		l = d(c, t).slice(o.length), o.length > 1 && o === o.toUpperCase() && (l = l.toUpperCase()), u = l.length, f = t;
	} else {
		if (!r.nextWord || !/\s$/.test(i) || !s.length) return null;
		f = "";
	}
	if (r.nextWord) {
		let t = f ? [...s, f] : s, n = m(e, r), i = (e) => {
			let t = p(n, e), r = null, i = 0;
			for (let [e, n] of t) i += n, (!r || n > r[1]) && (r = [e, n]);
			return r ? {
				word: r[0],
				n: r[1],
				share: r[1] / i
			} : null;
		}, a = [t.length >= 2 ? i(`${t[t.length - 2]} ${t[t.length - 1]}`) : null, i(t[t.length - 1])].find((e) => e && e.n >= r.min * 2) ?? null;
		a && a.share >= .6 && (l += (f ? " " : "") + d(c, a.word));
	}
	return l ? {
		ghost: l,
		firstWord: u || l.length
	} : null;
}
//#endregion
//#region ui/src/lib/editor/vault-count.ts
function b(e, t, n, r = 20) {
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
//#region plugins/beta/predictor/ui/src/main.ts
var x = [
	"en",
	"es",
	"fr",
	"de"
];
async function S(e) {
	let { state: r, view: a, language: d } = e.editor.codemirror, f = (t) => e.plugin.settings[t], p = () => ({
		min: Number(f("min_count") ?? 3),
		nextWord: f("next_word") !== !1
	}), m = () => String(f("language") || "en"), h = /* @__PURE__ */ new Map(), g = b(async (t) => await e.helper.call("count", {
		paths: t,
		langs: x,
		fallback: m()
	}), (e, t) => u(h.get(e.lang) ?? h.set(e.lang, s()).get(e.lang), l(e.text), t), "predictor"), _ = async () => g.countAll(await e.helper.call("notes"));
	e.onFilesChanged((e) => {
		let t = e.filter((e) => /\.md$/i.test(e) && !e.startsWith(".atlas/"));
		g.counted && t.length && g.count(t);
	});
	let v = /* @__PURE__ */ new Map(), S = (t) => {
		if (f("dictionary") === !1) return;
		let n = v.get(t);
		if (n) return n === "loading" ? void 0 : n;
		v.set(t, "loading"), e.helper.call("lexicon", { lang: t }, { timeout: 60 }).then((e) => v.set(t, e ? e.split("\n").sort() : [])).catch((e) => {
			console.warn(`predictor: the ${t} dictionary did not load:`, e), v.set(t, []);
		});
	}, C = /* @__PURE__ */ new Map(), w = (t) => {
		if (f("general") === !1 || !e.editor.words) return;
		let n = C.get(t);
		if (n !== void 0) return n === "loading" || n === null ? void 0 : n;
		C.set(t, "loading"), e.editor.words(t).then((e) => C.set(t, e)).catch(() => C.set(t, null));
	}, T = null, E = (e) => {
		if (T?.text === e) return T.model;
		let n = s();
		return u(n, c(e.slice(t(e)), i)), T = {
			text: e,
			model: n
		}, n;
	}, D = r.StateEffect.define();
	class O extends a.WidgetType {
		text;
		constructor(e) {
			super(), this.text = e;
		}
		eq(e) {
			return e.text === this.text;
		}
		toDOM() {
			let e = document.createElement("span");
			return e.className = "cm-predict-ghost", e.textContent = this.text, e.setAttribute("aria-hidden", "true"), e;
		}
		ignoreEvent() {
			return !0;
		}
	}
	let k = r.StateField.define({
		create: () => null,
		update(e, t) {
			for (let e of t.effects) if (e.is(D)) return e.value;
			return e && t.docChanged ? A(e, t) : t.selection ? null : e;
		},
		provide: (e) => a.EditorView.decorations.from(e, (e) => e ? a.Decoration.set([a.Decoration.widget({
			widget: new O(e.guess.ghost),
			side: 1
		}).range(e.at)]) : a.Decoration.none)
	});
	function A(e, t) {
		let n = null;
		t.changes.iterChanges((t, r, i, a, o) => {
			n = n === null && t === e.at && r === t ? o.toString() : "\0";
		});
		let r = n;
		if (!r || r === "\0" || !e.guess.ghost.startsWith(r) || r.length >= e.guess.ghost.length) return null;
		let i = e.guess.ghost.slice(r.length);
		return {
			at: e.at + r.length,
			guess: {
				ghost: i,
				firstWord: e.guess.firstWord > r.length ? e.guess.firstWord - r.length : /^\s*\S+/.exec(i)?.[0].length ?? i.length
			}
		};
	}
	let j = (t) => /\.(md|markdown)$/i.test(e.editor.path(t));
	function M(r, i) {
		if (!j(r) || e.editor.place(r, i).kind !== "text") return !1;
		let a = r.state.doc.lineAt(i), o = t(r.state.doc.sliceString(0, 4e3)), s = d.syntaxTree(r.state);
		return n((e) => s.iterate(e), a.from, a.to, o).some(([e, t]) => e <= i && i <= t && (i > e || e === a.from));
	}
	function N(e) {
		let n = e.state.selection.main;
		if (!n.empty) return null;
		let r = n.head, a = e.state.doc.lineAt(r);
		if (/^[\p{L}\p{N}]/u.test(e.state.sliceDoc(r, r + 1)) || !M(e, r)) return null;
		let c = e.state.doc.sliceString(0, 2e4), l = o(c, x, m(), /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(c.slice(0, t(c)))?.[1]), u = h.get(l) ?? s(), d = E(r <= c.length ? c.slice(0, r).replace(/[\p{L}\p{N}'’-]+$/u, "") + c.slice(r) : c), f = y(u, e.state.sliceDoc(Math.max(a.from, r - 300), r), i, {
			...p(),
			lexicon: S(l),
			general: w(l),
			note: d
		});
		return f ? {
			at: r,
			guess: f
		} : null;
	}
	let P = a.ViewPlugin.fromClass(class {
		view;
		timer = 0;
		constructor(e) {
			this.view = e;
		}
		update(e) {
			(e.docChanged || e.selectionSet) && (clearTimeout(this.timer), e.transactions.some((e) => e.isUserEvent("input.type")) && (this.timer = window.setTimeout(() => {
				let e = N(this.view);
				e && this.view.dispatch({ effects: D.of(e) });
			}, Number(f("delay") ?? 60))));
		}
		destroy() {
			clearTimeout(this.timer);
		}
	}), F = (e) => (t) => {
		let n = t.state.field(k, !1);
		if (!n || t.state.selection.main.head !== n.at) return !1;
		let r = e ? n.guess.ghost : n.guess.ghost.slice(0, n.guess.firstWord);
		return t.dispatch({
			changes: {
				from: n.at,
				insert: r
			},
			selection: { anchor: n.at + r.length },
			userEvent: "input.complete"
		}), !0;
	}, I = (e) => e.state.selection.main.head === e.state.doc.lineAt(e.state.selection.main.head).to;
	e.editor.extension([
		k,
		P,
		r.Prec.high(a.keymap.of([
			{
				key: "Tab",
				run: F(!0)
			},
			{
				key: "ArrowRight",
				run: (e) => I(e) && F(!0)(e)
			},
			{
				key: "Ctrl-ArrowRight",
				run: F(!1)
			}
		])),
		a.EditorView.baseTheme({ ".cm-predict-ghost": {
			color: "var(--text-faint, var(--text-muted))",
			opacity: "0.75",
			pointerEvents: "none"
		} })
	]), _().catch((e) => console.warn("predictor: the vault was not learned:", e));
}
//#endregion
export { S as register };
