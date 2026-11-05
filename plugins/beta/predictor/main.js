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
	for (let [n, r] of Object.entries(t)) {
		let t = e.get(n) ?? e.set(n, s()).get(n);
		for (let [e, n] of Object.entries(r.words)) t.words.set(e, (t.words.get(e) ?? 0) + n);
		for (let [e, n] of Object.entries(r.forms)) {
			let r = t.forms.get(e) ?? t.forms.set(e, /* @__PURE__ */ new Map()).get(e);
			for (let [e, t] of Object.entries(n)) r.set(e, (r.get(e) ?? 0) + t);
		}
		for (let [e, n] of Object.entries(r.next)) {
			let r = t.next.get(e) ?? t.next.set(e, /* @__PURE__ */ new Map()).get(e);
			for (let [e, t] of Object.entries(n)) r.set(e, (r.get(e) ?? 0) + t);
		}
	}
}
function l(e, t = 2) {
	for (let [n, r] of e.words) r < t && (e.words.delete(n), e.forms.delete(n));
	for (let [n, r] of e.next) {
		for (let [e, n] of r) n < t && r.delete(e);
		r.size || e.next.delete(n);
	}
	for (let [t, n] of e.forms) if (n.size > 1) {
		let r = [...n].sort((e, t) => t[1] - e[1])[0];
		e.forms.set(t, new Map([r]));
	}
}
var u = (e, t) => [...e.forms.get(t) ?? []].sort((e, t) => t[1] - e[1])[0]?.[0] ?? t;
function d(e, t) {
	if (!e) return null;
	let n = null, r = 0;
	for (let [i, a] of e) i.startsWith(t) && i !== t && (r += a, (!n || a > n[1]) && (n = [i, a]));
	return n ? {
		word: n[0],
		n: n[1],
		share: n[1] / r
	} : null;
}
function f(e, t, n, r) {
	let i = t.split(/[.!?;:]\s|\n/).pop() ?? "", a = n(i).map((e) => e.word), o = /\p{L}$/u.test(i) ? a.pop() ?? "" : "";
	if (o && !i.endsWith(o)) return null;
	let s = a.map((e) => e.toLowerCase()), c = (t, n, i) => [
		t.length >= 2 ? d(e.next.get(`${t[t.length - 2]} ${t[t.length - 1]}`), n) : null,
		t.length >= 1 ? d(e.next.get(t[t.length - 1]), n) : null,
		i ? d(e.words, n) : null
	].find((e) => e && e.n >= r.min) ?? null, l = "", f = 0, p;
	if (o) {
		if (o.length < 2) return null;
		let t = c(s, o.toLowerCase(), !0);
		if (!t || t.share < .25 && t.n < r.min * 3) return null;
		l = u(e, t.word).slice(o.length), o === o.toUpperCase() && (l = l.toUpperCase()), f = l.length, p = t.word;
	} else {
		if (!r.nextWord || !/\s$/.test(i) || !s.length) return null;
		p = "";
	}
	if (r.nextWord) {
		let t = c(p ? [...s, p] : s, "", !1);
		t && t.n >= r.min * 2 && t.share >= .6 && (l += (p ? " " : "") + u(e, t.word));
	}
	return l ? {
		ghost: l,
		firstWord: f || l.length
	} : null;
}
//#endregion
//#region plugins/beta/predictor/ui/src/main.ts
var p = [
	"en",
	"es",
	"fr",
	"de"
];
async function m(e) {
	let { state: r, view: a, language: s } = e.editor.codemirror, u = (t) => e.plugin.settings[t], d = () => ({
		min: Number(u("min_count") ?? 3),
		nextWord: u("next_word") !== !1
	}), m = () => String(u("language") || "en"), h = /* @__PURE__ */ new Map(), g = async () => {
		let t = await e.helper.call("notes");
		for (let n = 0; n < t.length; n += 60) c(h, await e.helper.call("count", {
			paths: t.slice(n, n + 60),
			langs: p,
			fallback: m()
		}));
		for (let e of h.values()) l(e);
	}, _ = r.StateEffect.define();
	class v extends a.WidgetType {
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
	let y = r.StateField.define({
		create: () => null,
		update(e, t) {
			for (let e of t.effects) if (e.is(_)) return e.value;
			return e && t.docChanged ? b(e, t) : t.selection ? null : e;
		},
		provide: (e) => a.EditorView.decorations.from(e, (e) => e ? a.Decoration.set([a.Decoration.widget({
			widget: new v(e.guess.ghost),
			side: 1
		}).range(e.at)]) : a.Decoration.none)
	});
	function b(e, t) {
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
	let x = (t) => /\.(md|markdown)$/i.test(e.editor.path(t));
	function S(r, i) {
		if (!x(r) || e.editor.place(r, i).kind !== "text") return !1;
		let a = r.state.doc.lineAt(i), o = t(r.state.doc.sliceString(0, 4e3)), c = s.syntaxTree(r.state);
		return n((e) => c.iterate(e), a.from, a.to, o).some(([e, t]) => e <= i && i <= t && (i > e || e === a.from));
	}
	function C(e) {
		let n = e.state.selection.main;
		if (!n.empty) return null;
		let r = n.head, a = e.state.doc.lineAt(r);
		if (/^[\p{L}\p{N}]/u.test(e.state.sliceDoc(r, r + 1)) || !S(e, r)) return null;
		let s = e.state.doc.sliceString(0, 2e4), c = o(s, [...h.keys()], m(), /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(s.slice(0, t(s)))?.[1]), l = h.get(c), u = l && f(l, e.state.sliceDoc(Math.max(a.from, r - 300), r), i, d());
		return u ? {
			at: r,
			guess: u
		} : null;
	}
	let w = a.ViewPlugin.fromClass(class {
		view;
		timer = 0;
		constructor(e) {
			this.view = e;
		}
		update(e) {
			(e.docChanged || e.selectionSet) && (clearTimeout(this.timer), e.transactions.some((e) => e.isUserEvent("input.type")) && (this.timer = window.setTimeout(() => {
				let e = C(this.view);
				e && this.view.dispatch({ effects: _.of(e) });
			}, Number(u("delay") ?? 60))));
		}
		destroy() {
			clearTimeout(this.timer);
		}
	}), T = (e) => (t) => {
		let n = t.state.field(y, !1);
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
	}, E = (e) => e.state.selection.main.head === e.state.doc.lineAt(e.state.selection.main.head).to;
	e.editor.extension([
		y,
		w,
		r.Prec.high(a.keymap.of([
			{
				key: "Tab",
				run: T(!0)
			},
			{
				key: "ArrowRight",
				run: (e) => E(e) && T(!0)(e)
			},
			{
				key: "Ctrl-ArrowRight",
				run: T(!1)
			}
		])),
		a.EditorView.baseTheme({ ".cm-predict-ghost": {
			color: "var(--text-faint, var(--text-muted))",
			opacity: "0.75",
			pointerEvents: "none"
		} })
	]), g().catch((e) => console.warn("predictor: the vault was not learned:", e));
}
//#endregion
export { m as register };
