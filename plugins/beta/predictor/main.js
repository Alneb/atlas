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
}), c = (e) => e ? e.split("\n").map((e) => e.split(" ")) : [];
function l(e, t, n = 1) {
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
	].find((e) => e && e.n >= r.min) ?? null, l = "", f = 0, m;
	if (o) {
		if (o.length < 2) return null;
		let t = o.toLowerCase(), n = c(s, t, !1), i = n && (n.share >= .25 || n.n >= r.min * 3) ? n.word : p(e, r.lexicon, t, r.min);
		if (!i) return null;
		l = u(e, i).slice(o.length), o === o.toUpperCase() && (l = l.toUpperCase()), f = l.length, m = i;
	} else {
		if (!r.nextWord || !/\s$/.test(i) || !s.length) return null;
		m = "";
	}
	if (r.nextWord) {
		let t = c(m ? [...s, m] : s, "", !1);
		t && t.n >= r.min * 2 && t.share >= .6 && (l += (m ? " " : "") + u(e, t.word));
	}
	return l ? {
		ghost: l,
		firstWord: f || l.length
	} : null;
}
function p(e, t, n, r) {
	if (n.length < 2) return null;
	let i = (t) => e.words.get(t) ?? 0, a = /* @__PURE__ */ new Set();
	for (let [t, i] of e.words) i >= r && t.length > n.length && t.startsWith(n) && a.add(t);
	let o = i(n) >= r;
	if (t?.length && n.length >= 3) {
		let e = 0, r = t.length;
		for (; e < r;) {
			let i = e + r >> 1;
			t[i] < n ? e = i + 1 : r = i;
		}
		t[e] === n && (o = !0, e++);
		for (let r = e; r < t.length && r < e + 5e3 && t[r].startsWith(n); r++) a.add(t[r]);
	}
	let s = [...a].sort((e, t) => i(t) - i(e) || e.length - t.length || (e < t ? -1 : 1))[0];
	return !s || o && i(s) <= i(n) ? null : s;
}
//#endregion
//#region ui/src/lib/editor/vault-count.ts
function m(e, t, n, r = 20) {
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
var h = [
	"en",
	"es",
	"fr",
	"de"
];
async function g(e) {
	let { state: r, view: a, language: u } = e.editor.codemirror, d = (t) => e.plugin.settings[t], p = () => ({
		min: Number(d("min_count") ?? 3),
		nextWord: d("next_word") !== !1
	}), g = () => String(d("language") || "en"), _ = /* @__PURE__ */ new Map(), v = m(async (t) => await e.helper.call("count", {
		paths: t,
		langs: h,
		fallback: g()
	}), (e, t) => l(_.get(e.lang) ?? _.set(e.lang, s()).get(e.lang), c(e.text), t), "predictor"), y = async () => v.countAll(await e.helper.call("notes"));
	e.onFilesChanged((e) => {
		let t = e.filter((e) => /\.md$/i.test(e) && !e.startsWith(".atlas/"));
		v.counted && t.length && v.count(t);
	});
	let b = /* @__PURE__ */ new Map(), x = (t) => {
		if (d("dictionary") === !1) return;
		let n = b.get(t);
		if (n) return n === "loading" ? void 0 : n;
		b.set(t, "loading"), e.helper.call("lexicon", { lang: t }, { timeout: 60 }).then((e) => b.set(t, e ? e.split("\n").sort() : [])).catch((e) => {
			console.warn(`predictor: the ${t} dictionary did not load:`, e), b.set(t, []);
		});
	}, S = r.StateEffect.define();
	class C extends a.WidgetType {
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
	let w = r.StateField.define({
		create: () => null,
		update(e, t) {
			for (let e of t.effects) if (e.is(S)) return e.value;
			return e && t.docChanged ? T(e, t) : t.selection ? null : e;
		},
		provide: (e) => a.EditorView.decorations.from(e, (e) => e ? a.Decoration.set([a.Decoration.widget({
			widget: new C(e.guess.ghost),
			side: 1
		}).range(e.at)]) : a.Decoration.none)
	});
	function T(e, t) {
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
	let E = (t) => /\.(md|markdown)$/i.test(e.editor.path(t));
	function D(r, i) {
		if (!E(r) || e.editor.place(r, i).kind !== "text") return !1;
		let a = r.state.doc.lineAt(i), o = t(r.state.doc.sliceString(0, 4e3)), s = u.syntaxTree(r.state);
		return n((e) => s.iterate(e), a.from, a.to, o).some(([e, t]) => e <= i && i <= t && (i > e || e === a.from));
	}
	function O(e) {
		let n = e.state.selection.main;
		if (!n.empty) return null;
		let r = n.head, a = e.state.doc.lineAt(r);
		if (/^[\p{L}\p{N}]/u.test(e.state.sliceDoc(r, r + 1)) || !D(e, r)) return null;
		let c = e.state.doc.sliceString(0, 2e4), l = o(c, h, g(), /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(c.slice(0, t(c)))?.[1]), u = f(_.get(l) ?? s(), e.state.sliceDoc(Math.max(a.from, r - 300), r), i, {
			...p(),
			lexicon: x(l)
		});
		return u ? {
			at: r,
			guess: u
		} : null;
	}
	let k = a.ViewPlugin.fromClass(class {
		view;
		timer = 0;
		constructor(e) {
			this.view = e;
		}
		update(e) {
			(e.docChanged || e.selectionSet) && (clearTimeout(this.timer), e.transactions.some((e) => e.isUserEvent("input.type")) && (this.timer = window.setTimeout(() => {
				let e = O(this.view);
				e && this.view.dispatch({ effects: S.of(e) });
			}, Number(d("delay") ?? 60))));
		}
		destroy() {
			clearTimeout(this.timer);
		}
	}), A = (e) => (t) => {
		let n = t.state.field(w, !1);
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
	}, j = (e) => e.state.selection.main.head === e.state.doc.lineAt(e.state.selection.main.head).to;
	e.editor.extension([
		w,
		k,
		r.Prec.high(a.keymap.of([
			{
				key: "Tab",
				run: A(!0)
			},
			{
				key: "ArrowRight",
				run: (e) => j(e) && A(!0)(e)
			},
			{
				key: "Ctrl-ArrowRight",
				run: A(!1)
			}
		])),
		a.EditorView.baseTheme({ ".cm-predict-ghost": {
			color: "var(--text-faint, var(--text-muted))",
			opacity: "0.75",
			pointerEvents: "none"
		} })
	]), y().catch((e) => console.warn("predictor: the vault was not learned:", e));
}
//#endregion
export { g as register };
