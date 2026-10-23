import { $ as e, A as t, B as n, C as r, D as i, E as a, F as o, G as s, H as c, I as l, J as u, K as d, L as f, M as p, N as m, O as h, P as g, Q as _, R as v, S as y, T as b, U as x, V as S, W as C, X as w, Y as T, Z as E, _ as D, a as O, b as k, c as A, d as j, et as M, f as N, g as P, h as F, i as I, j as L, k as R, l as z, m as B, n as V, nt as H, o as U, p as ee, q as W, r as G, s as K, t as q, tt as J, u as Y, v as X, w as te, x as Z, y as ne, z as re } from "./ui-lib/Spending.js";
//#region plugins/beta/finance/ui/src/model.ts
var ie = (e) => e.split(":")[0], ae = (e) => e.split(":").slice(0, 2).join(":"), Q = (e) => j(e.v);
function oe(e) {
	let t = e.legs.filter((t) => ie(t.account) !== "Equity" || e.legs.every((e) => ie(e.account) === "Equity"));
	return {
		from: t.filter((e) => Q(e) < 0 || e.v === null && e.amount.startsWith("-")),
		to: t.filter((e) => Q(e) > 0 || e.v === null && !e.amount.startsWith("-"))
	};
}
var se = (e) => oe(e).to.reduce((e, t) => e + Q(t), 0);
function ce(e) {
	let t = $(e);
	if (t === "transfer" || t === "other") return se(e);
	let n = t === "spend" ? "Expenses" : "Income";
	return -e.legs.filter((e) => ie(e.account) === n).reduce((e, t) => e + Q(t), 0);
}
function le(e) {
	let t = [...new Set(e.map((e) => K(e.account)))];
	return t.length <= 1 ? t[0] ?? "—" : `${t[0]} + ${t.length - 1}`;
}
function $(e) {
	let t = new Set(e.legs.map((e) => ie(e.account)));
	return t.has("Expenses") ? "spend" : t.has("Income") ? "income" : [...t].every((e) => e === "Assets" || e === "Liabilities") ? "transfer" : "other";
}
function ue(e) {
	let t = e.toLowerCase().split(/\s+/).filter(Boolean).map((e) => {
		if (e === "!") return (e) => e.status === "!";
		if (e.startsWith("#") && e.length > 1) return (t) => t.tags.some((t) => t.toLowerCase() === e.slice(1));
		let t = /^([<>])(\d+(?:[.,]\d+)?)$/.exec(e);
		if (t) {
			let e = Number(t[2].replace(",", "."));
			return (n) => t[1] === ">" ? se(n) > e : se(n) < e;
		}
		return /^\d{4}(-\d{2}){0,2}$/.test(e) ? (t) => t.date.startsWith(e) : (t) => fe(t).includes(e);
	});
	return (e) => t.every((t) => t(e));
}
var de = /* @__PURE__ */ new WeakMap();
function fe(e) {
	let t = de.get(e);
	return t || (t = [
		e.payee,
		e.narration ?? "",
		...e.legs.map((e) => e.account),
		...e.meta.map(([, e]) => e)
	].join(" ").toLowerCase(), de.set(e, t)), t;
}
var pe = (e) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}`;
function me(e, t) {
	let [n, r] = e.split("-").map(Number);
	return pe(new Date(n, r - 1 + t, 1));
}
function he(e) {
	return [
		{
			from: e,
			to: e,
			name: "This month"
		},
		{
			from: me(e, -1),
			to: me(e, -1),
			name: "Last month"
		},
		{
			from: me(e, -2),
			to: e,
			name: "3 months"
		},
		{
			from: me(e, -11),
			to: e,
			name: "12 months"
		},
		{
			from: `${e.slice(0, 4)}-01`,
			to: e,
			name: `${e.slice(0, 4)}`
		},
		{
			from: "0000-01",
			to: "9999-12",
			name: "All"
		}
	];
}
var ge = (e, t) => {
	let n = e.date.slice(0, 7);
	return n >= t.from && n <= t.to;
};
function _e(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) for (let e of r.legs) ie(e.account) === t && n.set(ae(e.account), (n.get(ae(e.account)) ?? 0) + (t === "Income" ? -Q(e) : Q(e)));
	return n;
}
function ve(e, t = "Expenses") {
	let n = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = t.date.slice(0, 7);
		(n.get(e) ?? n.set(e, []).get(e)).push(t);
	}
	let r = [...n.keys()].sort();
	if (!r.length) return [];
	let i = [];
	for (let e = r[0]; e <= r[r.length - 1]; e = me(e, 1)) {
		let r = _e(n.get(e) ?? [], t);
		i.push({
			month: e,
			by: r,
			total: [...r.values()].reduce((e, t) => e + t, 0)
		});
	}
	return i;
}
function ye(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = r.legs.filter((e) => ae(e.account) === t).reduce((e, t) => e + Q(t), 0);
		if (!e) continue;
		let i = n.get(r.payee) ?? n.set(r.payee, {
			total: 0,
			count: 0
		}).get(r.payee);
		i.total += ie(t) === "Income" ? -e : e, i.count++;
	}
	return [...n].map(([e, t]) => ({
		payee: e,
		...t
	})).sort((e, t) => t.total - e.total);
}
function be(e, t = 8) {
	let n = (e) => [...e].filter(([, e]) => e > .005).sort((e, t) => t[1] - e[1]), r = (e, n) => e.length <= t ? e : [...e.slice(0, t - 1), [n, e.slice(t - 1).reduce((e, t) => e + t[1], 0)]], i = n(_e(e, "Income")), a = n(_e(e, "Expenses")), o = i.reduce((e, t) => e + t[1], 0), s = a.reduce((e, t) => e + t[1], 0), c = r(i, "Income:Other sources"), l = r(a, "Expenses:Everything else");
	return o > s ? l.push(["Saved", o - s]) : s > o && c.push(["From savings", s - o]), {
		ins: c,
		outs: l,
		total: Math.max(o, s)
	};
}
var xe = (e) => ({
	date: e.date,
	status: e.status,
	payee: e.payee,
	narration: e.narration ?? "",
	tags: [...e.tags],
	postings: e.postings.map((e) => ({
		account: e.account,
		amount: e.amount ?? ""
	}))
});
function Se(e) {
	let t = /* @__PURE__ */ new Map(), n = [];
	for (let r of e.postings) {
		if (!r.account.trim() || !r.amount.trim()) continue;
		let e = /^\s*(-?[\d.,]+)\s+([A-Za-z][\w.]*)\s*$/.exec(r.amount);
		if (!e) {
			n.push(r.amount);
			continue;
		}
		t.set(e[2], (t.get(e[2]) ?? 0) + Number(e[1].replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "")));
	}
	for (let [e, n] of t) Math.abs(n) < .005 && t.delete(e);
	return {
		left: t,
		open: e.postings.filter((e) => e.account.trim() && !e.amount.trim()).length === 1,
		bad: n
	};
}
//#endregion
//#region plugins/beta/finance/ui/src/FlowChart.svelte
var Ce = o("<path role=\"presentation\"><title> </title></path><rect class=\"node\" rx=\"2\"></rect><text class=\"lab svelte-11eix8t\" text-anchor=\"end\" dominant-baseline=\"middle\"><tspan class=\"n svelte-11eix8t\"> </tspan><tspan class=\"v svelte-11eix8t\" dx=\"6\"> </tspan></text>", 1), we = o("<path role=\"presentation\"><title> </title></path><rect rx=\"2\" role=\"presentation\"></rect><text class=\"lab svelte-11eix8t\" dominant-baseline=\"middle\"><tspan class=\"n svelte-11eix8t\"> </tspan><tspan class=\"v svelte-11eix8t\" dx=\"6\"> </tspan></text>", 1), Te = o("<svg role=\"img\" aria-label=\"Money in and out by category\" class=\"svelte-11eix8t\"><!><!><rect class=\"mid svelte-11eix8t\" rx=\"2\"></rect></svg>"), Ee = g("<div class=\"atlas-empty\">No income or spending in this period.</div>"), De = g("<div class=\"flow svelte-11eix8t\"><!></div>"), Oe = {
	hash: "svelte-11eix8t",
	code: ".flow.svelte-11eix8t {min-width:0;}svg.svelte-11eix8t {display:block;overflow:visible;}.band.svelte-11eix8t {opacity:0.32;transition:opacity 120ms;}.band.svelte-11eix8t:hover {opacity:0.6;}.band.dim.svelte-11eix8t {opacity:0.12;}.node.pick.svelte-11eix8t {cursor:pointer;}.mid.svelte-11eix8t {fill:var(--text-faint);}.lab.svelte-11eix8t {font-size:12px;}.lab.svelte-11eix8t .n:where(.svelte-11eix8t) {fill:var(--text);font-weight:500;}.lab.svelte-11eix8t .v:where(.svelte-11eix8t) {fill:var(--text-muted);font-variant-numeric:tabular-nums;}\n  @media (prefers-reduced-motion: reduce) {.band.svelte-11eix8t {transition:none;} }"
};
function ke(r, i) {
	e(i, !0), te(r, Oe);
	let a = w(640), o = E(() => Math.max(i.flow.ins.length, i.flow.outs.length)), c = E(() => Math.max(200, n(o) * 30)), l = E(() => Math.min(170, n(a) * .28)), u = E(() => n(l)), f = E(() => n(a) / 2 - 5), m = E(() => n(a) - n(l) - 10), g = w(null);
	function x(e) {
		let t = n(c) - 6 * Math.max(0, e.length - 1), r = 0;
		return e.map(([e, n]) => {
			let a = Math.max(2, n / (i.flow.total || 1) * t), o = {
				k: e,
				v: n,
				y: r,
				h: a
			};
			return r += a + 6, o;
		});
	}
	let O = E(() => x(i.flow.ins)), k = E(() => x(i.flow.outs));
	function A(e) {
		let t = -Infinity;
		return e.map((e) => t = Math.max(e.y + e.h / 2, t + 15));
	}
	let j = E(() => A(n(O))), M = E(() => A(n(k))), N = E(() => {
		let e = (n(c) - 6 * Math.max(0, n(o) - 1)) / (i.flow.total || 1), t = i.flow.total * e, r = (n(c) - t) / 2, a = (t) => {
			let n = r;
			return t.map(([t, r]) => {
				let i = {
					k: t,
					y: n,
					h: Math.max(2, r * e)
				};
				return n += i.h, i;
			});
		};
		return {
			top: r,
			h: t,
			ins: a(i.flow.ins),
			outs: a(i.flow.outs)
		};
	}), P = (e, t, n, r, i, a) => {
		let o = (e + r) / 2;
		return `M${e},${t}C${o},${t} ${o},${i} ${r},${i}L${r},${i + a}C${o},${i + a} ${o},${t + n} ${e},${t + n}Z`;
	}, F = (e) => e.includes(":") ? K(e) : e, I = (e) => `${Math.round(e / (i.flow.total || 1) * 100)}%`, L = (e) => e === "Saved" || e === "From savings" ? "var(--fin-saved)" : e.startsWith("Income") ? "var(--fin-income)" : i.color(e);
	var R = De(), z = C(R), V = (e) => {
		var r = Te(), o = C(r);
		b(o, 19, () => n(O), (e) => e.k, (e, r, a) => {
			let o = E(() => n(N).ins[n(a)]);
			var c = Ce(), l = s(c);
			let m, h;
			var _ = C(l), v = d(_);
			J(l);
			var b = W(l);
			D(b, "width", 10);
			let x;
			var w = W(b), O = C(w), k = d(O, !0), A = W(O), M = d(A, !0);
			J(w), S((e, i, o, s, c, d, f, p) => {
				m = y(l, 0, "band svelte-11eix8t", null, m, { dim: n(g) && n(g) !== n(r).k }), D(l, "d", e), h = Z(l, "", h, { fill: i }), t(v, `${o ?? ""}: ${s ?? ""} (${c ?? ""})`), D(b, "x", n(u)), D(b, "y", n(r).y), D(b, "height", n(r).h), x = Z(b, "", x, { fill: d }), D(w, "x", n(u) - 8), D(w, "y", n(j)[n(a)]), t(k, f), t(M, p);
			}, [
				() => P(n(u) + 10, n(r).y, n(r).h, n(f), n(o).y, n(o).h),
				() => L(n(r).k),
				() => F(n(r).k),
				() => i.format(n(r).v),
				() => I(n(r).v),
				() => L(n(r).k),
				() => F(n(r).k),
				() => i.format(n(r).v)
			]), re("pointerenter", l, () => T(g, n(r).k, !0)), re("pointerleave", l, () => T(g, null)), p(e, c);
		});
		var l = W(o);
		b(l, 19, () => n(k), (e) => e.k, (e, r, a) => {
			let o = E(() => n(N).outs[n(a)]);
			var c = we(), l = s(c);
			let u, h;
			var _ = C(l), b = d(_);
			J(l);
			var x = W(l);
			let w;
			D(x, "width", 10);
			let O;
			var k = W(x), A = C(k), j = d(A, !0), R = W(A), z = d(R);
			J(k), S((e, i, o, s, c, d, f, p, _, v) => {
				u = y(l, 0, "band svelte-11eix8t", null, u, { dim: n(g) && n(g) !== n(r).k }), D(l, "d", e), h = Z(l, "", h, { fill: i }), t(b, `${o ?? ""}: ${s ?? ""} (${c ?? ""})`), w = y(x, 0, "node svelte-11eix8t", null, w, { pick: d }), D(x, "x", n(m)), D(x, "y", n(r).y), D(x, "height", n(r).h), O = Z(x, "", O, { fill: f }), D(k, "x", n(m) + 10 + 8), D(k, "y", n(M)[n(a)]), t(j, p), t(z, `${_ ?? ""} · ${v ?? ""}`);
			}, [
				() => P(n(f) + 10, n(o).y, n(o).h, n(m), n(r).y, n(r).h),
				() => L(n(r).k),
				() => F(n(r).k),
				() => i.format(n(r).v),
				() => I(n(r).v),
				() => !!i.onpick && n(r).k.startsWith("Expenses"),
				() => L(n(r).k),
				() => F(n(r).k),
				() => i.format(n(r).v),
				() => I(n(r).v)
			]), re("pointerenter", l, () => T(g, n(r).k, !0)), re("pointerleave", l, () => T(g, null)), v("click", x, () => n(r).k.startsWith("Expenses") && i.onpick?.(n(r).k)), p(e, c);
		});
		var h = W(l);
		D(h, "width", 10), J(r), S((e) => {
			D(r, "width", n(a)), D(r, "height", e), D(h, "x", n(f)), D(h, "y", n(N).top), D(h, "height", n(N).h);
		}, [() => Math.max(n(c), ...n(j), ...n(M)) + 10]), p(e, r);
	}, H = (e) => {
		var t = Ee();
		p(e, t);
	};
	h(z, (e) => {
		i.flow.total > 0 ? e(V) : e(H, -1);
	}), J(R), B(R, "clientWidth", (e) => T(a, e)), p(r, R), _();
}
f(["click"]);
//#endregion
//#region plugins/beta/finance/ui/src/WealthChart.svelte
var Ae = o("<line class=\"grid svelte-1indv8k\"></line><text class=\"tick svelte-1indv8k\" text-anchor=\"end\" dominant-baseline=\"middle\"> </text>", 1), je = o("<text class=\"tick svelte-1indv8k\"> </text>"), Me = o("<line class=\"cross svelte-1indv8k\"></line><circle class=\"dot svelte-1indv8k\" r=\"4.5\"></circle>", 1), Ne = g("<div class=\"tip svelte-1indv8k\"><span> </span> <b class=\"svelte-1indv8k\"> </b></div>"), Pe = g("<tr><td class=\"svelte-1indv8k\"> </td><td class=\"svelte-1indv8k\"> </td></tr>"), Fe = g("<svg role=\"img\" aria-label=\"Net worth by month\" class=\"svelte-1indv8k\"><!><!><path class=\"area svelte-1indv8k\"></path><path class=\"line svelte-1indv8k\"></path><!></svg> <!> <details class=\"table svelte-1indv8k\"><summary class=\"svelte-1indv8k\">As a table</summary> <table class=\"svelte-1indv8k\"><tbody></tbody></table></details>", 1), Ie = g("<div class=\"atlas-empty\">One month of history so far: the line starts with the second.</div>"), Le = g("<div class=\"chart svelte-1indv8k\"><!></div>"), Re = {
	hash: "svelte-1indv8k",
	code: ".chart.svelte-1indv8k {position:relative;min-width:0;}svg.svelte-1indv8k {display:block;touch-action:none;}.grid.svelte-1indv8k {stroke:var(--border);stroke-width:1;}.tick.svelte-1indv8k {fill:var(--text-faint);font-size:11px;font-variant-numeric:tabular-nums;}.line.svelte-1indv8k {fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;}.area.svelte-1indv8k {fill:var(--accent-soft);}.cross.svelte-1indv8k {stroke:var(--text-faint);stroke-width:1;stroke-dasharray:3 3;}.dot.svelte-1indv8k {fill:var(--accent);stroke:var(--bg-elev);stroke-width:2;}.tip.svelte-1indv8k {position:absolute;pointer-events:none;display:flex;flex-direction:column;padding:6px 10px;border-radius:var(--radius-sm);background:var(--bg-elev);border:1px solid var(--border-strong);box-shadow:var(--shadow-sm);font-size:0.85em;color:var(--text-muted);white-space:nowrap;}.tip.svelte-1indv8k b:where(.svelte-1indv8k) {color:var(--text);font-variant-numeric:tabular-nums;font-size:1.1em;}.table.svelte-1indv8k {margin-top:4px;font-size:0.82em;color:var(--text-muted);}.table.svelte-1indv8k summary:where(.svelte-1indv8k) {cursor:pointer;}.table.svelte-1indv8k table:where(.svelte-1indv8k) {border-collapse:collapse;margin-top:4px;}.table.svelte-1indv8k td:where(.svelte-1indv8k) {padding:1px 12px 1px 0;font-variant-numeric:tabular-nums;}"
};
function ze(r, i) {
	e(i, !0), te(r, Re);
	let a = w(600), o = {
		l: 64,
		r: 12,
		t: 12,
		b: 26
	}, c = w(null), l = E(() => Math.min(0, ...i.points.map((e) => e.value))), u = E(() => Math.max(1, ...i.points.map((e) => e.value))), f = E(() => j(n(l), n(u), 4)), m = (e) => o.l + (i.points.length < 2 ? 0 : e / (i.points.length - 1) * (n(a) - o.l - o.r)), g = (e) => o.t + (1 - (e - n(f)[0]) / (n(f)[n(f).length - 1] - n(f)[0] || 1)) * (220 - o.t - o.b), y = E(() => i.points.map((e, t) => `${t ? "L" : "M"}${m(t).toFixed(1)},${g(e.value).toFixed(1)}`).join("")), x = E(() => i.points.length ? `${n(y)}L${m(i.points.length - 1)},${g(n(f)[0])}L${m(0)},${g(n(f)[0])}Z` : ""), O = E(() => i.points.length > 30 ? 12 : i.points.length > 14 ? 6 : 3), k = E(() => i.points.map((e, t) => ({
		i: t,
		p: e
	})).filter(({ p: e }) => (Number(e.month.slice(5)) - 1) % n(O) == 0)), A = (e) => (/* @__PURE__ */ new Date(`${e}-01T12:00:00`)).toLocaleDateString(void 0, {
		month: "short",
		year: "numeric"
	});
	function j(e, t, n) {
		let r = t - e || 1, i = r / n, a = 10 ** Math.floor(Math.log10(i)), o = [
			1,
			2,
			2.5,
			5,
			10
		].map((e) => e * a).find((e) => r / e <= n) ?? 10 * a, s = [];
		for (let n = Math.floor(e / o) * o; n <= t + o * .999; n += o) s.push(Math.round(n / o) * o);
		return s;
	}
	function M(e) {
		let t = e.currentTarget.getBoundingClientRect(), r = Math.round((e.clientX - t.left - o.l) / (n(a) - o.l - o.r) * (i.points.length - 1));
		T(c, i.points.length ? Math.max(0, Math.min(i.points.length - 1, r)) : null, !0);
	}
	var N = Le(), P = C(N), F = (e) => {
		var r = Fe(), l = s(r);
		D(l, "height", 220);
		var u = C(l);
		b(u, 16, () => n(f), (e) => e, (e, r) => {
			var c = Ae(), l = s(c), u = W(l), f = d(u, !0);
			S((e, r, i, s) => {
				D(l, "x1", o.l), D(l, "x2", n(a) - o.r), D(l, "y1", e), D(l, "y2", r), D(u, "x", o.l - 8), D(u, "y", i), t(f, s);
			}, [
				() => g(r),
				() => g(r),
				() => g(r),
				() => i.format(r, !0)
			]), p(e, c);
		});
		var _ = W(u);
		b(_, 17, () => n(k), ({ i: e, p: t }) => t.month, (e, r) => {
			let i = () => n(r).i, a = () => n(r).p;
			var o = je();
			D(o, "y", 214);
			var s = d(o, !0);
			S((e, n) => {
				D(o, "x", e), D(o, "text-anchor", i() === 0 ? "start" : "middle"), t(s, n);
			}, [() => m(i()), () => A(a().month)]), p(e, o);
		});
		var w = W(_), E = W(w), O = W(E), j = (e) => {
			var t = Me(), r = s(t), a = W(r);
			S((e, t, n, i) => {
				D(r, "x1", e), D(r, "x2", t), D(r, "y1", o.t), D(r, "y2", 220 - o.b), D(a, "cx", n), D(a, "cy", i);
			}, [
				() => m(n(c)),
				() => m(n(c)),
				() => m(n(c)),
				() => g(i.points[n(c)].value)
			]), p(e, t);
		};
		h(O, (e) => {
			n(c) !== null && e(j);
		}), J(l);
		var N = W(l, 2), P = (e) => {
			var r = Ne();
			let o;
			var s = C(r), l = d(s, !0), u = W(s, 2), f = d(u, !0);
			J(r), S((e, n, i, a) => {
				o = Z(r, "", o, {
					left: e,
					top: n
				}), t(l, i), t(f, a);
			}, [
				() => `${Math.min(m(n(c)) + 12, n(a) - 170)}px`,
				() => `${Math.max(0, g(i.points[n(c)].value) - 46)}px`,
				() => (/* @__PURE__ */ new Date(`${i.points[n(c)].month}-01T12:00:00`)).toLocaleDateString(void 0, {
					month: "long",
					year: "numeric"
				}),
				() => i.format(i.points[n(c)].value)
			]), p(e, r);
		};
		h(N, (e) => {
			n(c) !== null && e(P);
		});
		var F = W(N, 2), I = W(C(F), 2), L = C(I);
		b(L, 21, () => i.points, (e) => e.month, (e, r) => {
			var a = Pe(), o = C(a), s = d(o, !0), c = W(o), l = d(c, !0);
			J(a), S((e, n) => {
				t(s, e), t(l, n);
			}, [() => A(n(r).month), () => i.format(n(r).value)]), p(e, a);
		}), J(L), J(I), J(F), S(() => {
			D(l, "width", n(a)), D(w, "d", n(x)), D(E, "d", n(y));
		}), v("pointermove", l, M), re("pointerleave", l, () => T(c, null)), p(e, r);
	}, I = (e) => {
		var t = Ie();
		p(e, t);
	};
	h(P, (e) => {
		i.points.length > 1 ? e(F) : e(I, -1);
	}), J(N), B(N, "clientWidth", (e) => T(a, e)), p(r, N), _();
}
f(["pointermove"]);
//#endregion
//#region plugins/beta/finance/ui/src/Capture.svelte
var Be = g("<span class=\"faint svelte-1jy18fz\"> </span>"), Ve = g("<span> </span><!><span class=\"faint svelte-1jy18fz\">&nbsp;· Enter adds it to review</span>", 1), He = g("<span class=\"faint svelte-1jy18fz\">A payment in your words: an amount, where it went, the account and the day (es, en, fr).</span>"), Ue = g("<div class=\"capture svelte-1jy18fz\"><input placeholder=\"12,40 café con Ana revolut ayer · +1500 salary unicaja · 30 cad groceries\" aria-label=\"Add a payment in your words\" class=\"svelte-1jy18fz\"/> <div><!></div></div>"), We = {
	hash: "svelte-1jy18fz",
	code: ".capture.svelte-1jy18fz {display:grid;gap:4px;}input.svelte-1jy18fz {width:100%;box-sizing:border-box;font:inherit;font-size:1.05em;padding:8px 10px;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);outline:none;}input.svelte-1jy18fz:focus {border-color:var(--accent);}.hint.svelte-1jy18fz {min-height:1.4em;font-variant-numeric:tabular-nums;color:var(--text);}.unsure.svelte-1jy18fz {font-style:italic;}.faint.svelte-1jy18fz {color:var(--text-faint);}"
};
function Ge(r, i) {
	e(i, !0), te(r, We);
	let a = w(""), o = w(null), c = w(!1), l, u = 0;
	function f() {
		clearTimeout(l);
		let e = n(a).trim();
		if (!e) {
			T(o, null);
			return;
		}
		l = setTimeout(async () => {
			let t = ++u;
			try {
				let n = await I(i.atlas, "parse", { text: e });
				t === u && T(o, n, !0);
			} catch (e) {
				t === u && T(o, { skipped: e.message }, !0);
			}
		}, 150);
	}
	async function m() {
		if (n(a).trim() && !n(c)) {
			T(c, !0);
			try {
				let e = await I(i.atlas, "add", { text: n(a).trim() });
				i.atlas.toast("Added to review", e.hint.replace(/^→ /, "")), T(a, ""), T(o, null), i.onchange();
			} catch (e) {
				i.atlas.toast("Not added", e.message, "error");
			} finally {
				T(c, !1);
			}
		}
	}
	var g = Ue(), b = C(g);
	P(b);
	var x = W(b, 2);
	let E;
	var D = C(x), O = (e) => {
		var r = Ve(), i = s(r);
		let a;
		var c = d(i, !0), l = W(i), u = (e) => {
			var r = Be(), i = d(r);
			S(() => t(i, ` · ${n(o).why ?? ""}`)), p(e, r);
		};
		h(l, (e) => {
			n(o).why && e(u);
		}), M(), S(() => {
			a = y(i, 1, "svelte-1jy18fz", null, a, { unsure: !n(o).sure }), t(c, n(o).hint);
		}), p(e, r);
	}, k = (e) => {
		var r = Be(), i = d(r, !0);
		S(() => t(i, n(o).skipped)), p(e, r);
	}, A = (e) => {
		var t = He();
		p(e, t);
	};
	h(D, (e) => {
		n(o)?.hint ? e(O) : n(o)?.skipped ? e(k, 1) : e(A, -1);
	}), J(x), J(g), S(() => E = y(x, 1, "hint svelte-1jy18fz", null, E, { off: !n(o)?.hint })), v("input", b, f), v("keydown", b, (e) => {
		e.key === "Enter" ? (e.preventDefault(), m()) : e.key === "Escape" && (T(a, ""), T(o, null));
	}), F(b, () => n(a), (e) => T(a, e)), p(r, g), _();
}
f(["input", "keydown"]);
//#endregion
//#region plugins/beta/finance/ui/src/Import.svelte
var Ke = g("<div class=\"atlas-notice error\"> </div>"), qe = g("<div class=\"atlas-empty\">Reading the inbox…</div>"), Je = g("<div class=\"atlas-empty\">The inbox is empty. Drop a bank's export there (Norma 43, CSV, Excel, PDF): the preset that reads it is found from the file.</div>"), Ye = g("<span class=\"bad svelte-16ysgc\"> </span>"), Xe = g("<span class=\"good svelte-16ysgc\"> </span>"), Ze = g("<span class=\"faint svelte-16ysgc\">—</span>"), Qe = g("<span class=\"good svelte-16ysgc\">✓</span>"), $e = g("<tr><td class=\"svelte-16ysgc\"><span class=\"name svelte-16ysgc\"> </span><span class=\"faint svelte-16ysgc\"> </span></td><td class=\"n svelte-16ysgc\"> </td><td> </td><td class=\"n svelte-16ysgc\"> </td><td class=\"n svelte-16ysgc\"> </td><td class=\"n svelte-16ysgc\"> </td><td class=\"svelte-16ysgc\"><!></td></tr>"), et = g("<span class=\"faint svelte-16ysgc\">Fix the errors above first.</span>"), tt = g("<pre class=\"svelte-16ysgc\"> </pre>"), nt = g("<p class=\"head svelte-16ysgc\"><b class=\"svelte-16ysgc\"> </b> files, <b class=\"svelte-16ysgc\"> </b> statements, <b class=\"svelte-16ysgc\"> </b> new transactions · <!> <!></p> <!> <table class=\"svelte-16ysgc\"><thead><tr><th class=\"svelte-16ysgc\">Statement</th><th class=\"n svelte-16ysgc\">rows</th><th class=\"n svelte-16ysgc\">new</th><th class=\"n svelte-16ysgc\">known</th><th class=\"n svelte-16ysgc\">transfers</th><th class=\"n svelte-16ysgc\">skipped</th><th class=\"svelte-16ysgc\">balances</th></tr></thead><tbody></tbody></table> <div class=\"actions svelte-16ysgc\"><button class=\"atlas-btn primary\"> </button> <button class=\"atlas-btn\">Check again</button> <button class=\"atlas-btn\"> </button> <!></div> <!>", 1), rt = g("<h3 class=\"svelte-16ysgc\">Statements <span class=\"faint svelte-16ysgc\"> </span></h3> <!>", 1), it = {
	hash: "svelte-16ysgc",
	code: "h3.svelte-16ysgc {margin:0 0 10px;font-size:0.82em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);font-weight:600;}.faint.svelte-16ysgc {color:var(--text-faint);font-weight:400;text-transform:none;letter-spacing:0;}.head.svelte-16ysgc {margin:0 0 10px;color:var(--text-muted);}.head.svelte-16ysgc b:where(.svelte-16ysgc) {color:var(--text);font-variant-numeric:tabular-nums;}.good.svelte-16ysgc {color:var(--green);}.bad.svelte-16ysgc {color:var(--red);font-weight:600;}.warm.svelte-16ysgc {color:var(--yellow);font-weight:600;}table.svelte-16ysgc {width:100%;border-collapse:collapse;margin-bottom:12px;font-variant-numeric:tabular-nums;}th.svelte-16ysgc {text-align:left;font-weight:500;color:var(--text-faint);font-size:0.85em;padding:2px 8px;border-bottom:1px solid var(--border);}td.svelte-16ysgc {padding:4px 8px;border-bottom:1px solid var(--border);vertical-align:top;}.n.svelte-16ysgc {text-align:right;width:4.5em;}td.svelte-16ysgc .name:where(.svelte-16ysgc) {display:block;}td.svelte-16ysgc .faint:where(.svelte-16ysgc) {font-size:0.85em;overflow-wrap:anywhere;}.actions.svelte-16ysgc {display:flex;gap:8px;align-items:center;flex-wrap:wrap;}pre.svelte-16ysgc {white-space:pre-wrap;overflow-wrap:anywhere;font-size:0.85em;color:var(--text-muted);max-height:420px;overflow:auto;background:var(--bg);padding:10px;border-radius:var(--radius-sm);}\n  @media (max-width: 700px) {th.svelte-16ysgc:nth-child(4), td.svelte-16ysgc:nth-child(4), th.svelte-16ysgc:nth-child(5), td.svelte-16ysgc:nth-child(5), th.svelte-16ysgc:nth-child(6), td.svelte-16ysgc:nth-child(6) {display:none;} }"
};
function at(r, i) {
	e(i, !0), te(r, it);
	let o = w(null), c = w(!1), u = w(""), f = w(!1);
	async function g(e = !1) {
		T(c, !0);
		try {
			T(o, await I(i.atlas, "import", { write: e }), !0), T(u, ""), n(o).written && (i.atlas.toast("Imported", `${n(o).new} transactions to review; the originals are in each account's archive.`), i.onchange(), T(o, await I(i.atlas, "import"), !0));
		} catch (e) {
			T(u, e.message, !0);
		} finally {
			T(c, !1);
		}
	}
	g();
	let x = E(() => n(o)?.statements.reduce((e, t) => e + t.off, 0) ?? 0), O = E(() => n(o)?.statements.reduce((e, t) => e + t.checks, 0) ?? 0), k = E(() => n(o) ? n(o).files.length - new Set(n(o).statements.map((e) => e.source)).size : 0);
	var A = rt(), j = s(A), M = W(C(j)), N = d(M);
	J(j);
	var P = W(j, 2), F = (e) => {
		var r = Ke(), i = d(r, !0);
		S(() => t(i, n(u))), p(e, r);
	}, L = (e) => {
		var t = qe();
		p(e, t);
	}, R = (e) => {
		var t = Je();
		p(e, t);
	}, z = (e) => {
		var r = nt(), i = s(r), u = C(i), _ = d(u, !0), w = W(u, 2), E = d(w, !0), A = W(w, 2), j = d(A, !0), M = W(A, 2), N = (e) => {
			var r = m(), i = s(r), a = (e) => {
				var r = Ye(), i = d(r);
				S(() => t(i, `${n(x) ?? ""} of ${n(O) ?? ""} balances disagree`)), p(e, r);
			}, o = (e) => {
				var r = Xe(), i = d(r);
				S(() => t(i, `all ${n(O) ?? ""} balances agree ✓`)), p(e, r);
			};
			h(i, (e) => {
				n(x) ? e(a) : e(o, -1);
			}), p(e, r);
		};
		h(M, (e) => {
			n(O) && e(N);
		});
		var P = W(M, 2), F = (e) => {
			var r = l();
			S(() => t(r, `· ${n(k) ?? ""} already imported`)), p(e, r);
		};
		h(P, (e) => {
			n(k) > 0 && e(F);
		}), J(i);
		var I = W(i, 2);
		b(I, 17, () => n(o).errors, a, (e, r) => {
			var i = Ke(), a = d(i, !0);
			S(() => t(a, n(r))), p(e, i);
		});
		var L = W(I, 2), R = W(C(L));
		b(R, 21, () => n(o).statements, (e) => e.note, (e, r) => {
			var i = $e(), a = C(i), o = C(a), s = d(o, !0), c = W(o), l = d(c, !0);
			J(a);
			var u = W(a), f = d(u, !0), m = W(u);
			let g;
			var _ = d(m, !0), v = W(m), b = d(v, !0), x = W(v), w = d(x, !0), T = W(x), E = d(T, !0), O = W(T), k = C(O), A = (e) => {
				var t = Ze();
				p(e, t);
			}, j = (e) => {
				var i = Ye(), a = d(i);
				S(() => t(a, `${n(r).off ?? ""} off`)), p(e, i);
			}, M = (e) => {
				var t = Qe();
				p(e, t);
			};
			h(k, (e) => {
				n(r).checks ? n(r).off ? e(j, 1) : e(M, -1) : e(A);
			}), J(O), J(i), S(() => {
				D(i, "title", `${n(r).account} · ${n(r).source}`), t(s, n(r).note), t(l, n(r).source), t(f, n(r).rows), g = y(m, 1, "n svelte-16ysgc", null, g, { warm: n(r).new > 0 }), t(_, n(r).new), t(b, n(r).known), t(w, n(r).paired || ""), t(E, n(r).skipped || "");
			}), p(e, i);
		}), J(R), J(L);
		var z = W(L, 2), B = C(z), V = d(B, !0), H = W(B, 2), U = W(H, 2), ee = d(U), G = W(U, 2), K = (e) => {
			var t = et();
			p(e, t);
		};
		h(G, (e) => {
			n(o).errors.length && e(K);
		}), J(z);
		var q = W(z, 2), Y = (e) => {
			var r = tt(), i = d(r, !0);
			S(() => t(i, n(o).report)), p(e, r);
		};
		h(q, (e) => {
			n(f) && e(Y);
		}), S(() => {
			t(_, n(o).files.length), t(E, n(o).statements.length), t(j, n(o).new), B.disabled = n(c) || n(o).errors.length > 0, t(V, n(c) ? "Working…" : n(o).new ? `Import ${n(o).new} transactions` : "File the statements"), H.disabled = n(c), t(ee, `${n(f) ? "Hide" : "Show"} the report`);
		}), v("click", B, () => g(!0)), v("click", H, () => g()), v("click", U, () => T(f, !n(f))), p(e, r);
	};
	h(P, (e) => {
		n(u) ? e(F) : n(o) ? n(o).files.length ? e(z, -1) : e(R, 2) : e(L, 1);
	}), S((e) => t(N, `${e ?? ""}/statements/inbox/`), [() => U(i.atlas)]), p(r, A), _();
}
f(["click"]);
//#endregion
//#region plugins/beta/finance/ui/src/Overview.svelte
var ot = g("<span> </span>"), st = g("<small class=\"svelte-jdlm6a\"> </small>"), ct = g("<button class=\"svelte-jdlm6a\"><b> </b> to review</button>"), lt = g("<button class=\"svelte-jdlm6a\"><b> </b> booked by judgement (#guess): confirm or fix</button>"), ut = g("<button class=\"err svelte-jdlm6a\"> </button>"), dt = g("<span class=\"svelte-jdlm6a\"> </span>"), ft = g("<section class=\"attention svelte-jdlm6a\" aria-label=\"Needs you\"><!> <!> <!> <!> <!></section>"), pt = g("<button role=\"radio\"> </button>"), mt = g("<option> </option>"), ht = g("<select aria-label=\"Measured in\" class=\"svelte-jdlm6a\"></select>"), gt = g("<li><button class=\"svelte-jdlm6a\"><span> </span><span class=\"v svelte-jdlm6a\"> </span></button></li>"), _t = g("<div class=\"overview svelte-jdlm6a\"><section class=\"hero svelte-jdlm6a\"><div class=\"big svelte-jdlm6a\"><span class=\"k svelte-jdlm6a\">Net worth</span> <span class=\"n svelte-jdlm6a\"> </span> <span class=\"deltas svelte-jdlm6a\"></span></div> <div class=\"stat svelte-jdlm6a\"><span class=\"k svelte-jdlm6a\"> </span><button class=\"n link svelte-jdlm6a\"> </button></div> <div class=\"stat svelte-jdlm6a\"><span class=\"k svelte-jdlm6a\">came in</span><span class=\"n svelte-jdlm6a\"> </span></div> <div class=\"stat svelte-jdlm6a\"><span class=\"k svelte-jdlm6a\"> </span><span> <!></span></div></section> <!> <section class=\"panel svelte-jdlm6a\"><header class=\"svelte-jdlm6a\"><h3 class=\"svelte-jdlm6a\">Where the money came from and went</h3> <div class=\"seg svelte-jdlm6a\" role=\"radiogroup\" aria-label=\"Period\"></div></header> <!></section> <div class=\"two svelte-jdlm6a\"><section class=\"panel svelte-jdlm6a\"><header class=\"svelte-jdlm6a\"><h3 class=\"svelte-jdlm6a\">Net worth</h3> <!></header> <!></section> <section class=\"panel svelte-jdlm6a\"><header class=\"svelte-jdlm6a\"><h3 class=\"svelte-jdlm6a\">Accounts</h3></header> <ul class=\"accts svelte-jdlm6a\"></ul></section></div> <div class=\"two svelte-jdlm6a\"><section class=\"panel svelte-jdlm6a\"><!></section> <section class=\"panel svelte-jdlm6a\"><!></section></div></div>"), vt = {
	hash: "svelte-jdlm6a",
	code: ".overview.svelte-jdlm6a {display:flex;flex-direction:column;gap:16px;max-width:1180px;}.hero.svelte-jdlm6a {display:flex;flex-wrap:wrap;gap:12px 40px;align-items:flex-end;padding:4px 2px 8px;}.big.svelte-jdlm6a {display:flex;flex-direction:column;gap:2px;margin-right:auto;}.k.svelte-jdlm6a {font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);font-weight:600;}.big.svelte-jdlm6a .n:where(.svelte-jdlm6a) {font-size:2.3em;font-weight:650;color:var(--heading);font-variant-numeric:tabular-nums;line-height:1.1;}.deltas.svelte-jdlm6a {display:flex;gap:14px;font-size:0.9em;color:var(--text-muted);flex-wrap:wrap;}.stat.svelte-jdlm6a {display:flex;flex-direction:column;gap:2px;}.stat.svelte-jdlm6a .n:where(.svelte-jdlm6a) {font-size:1.35em;font-weight:600;font-variant-numeric:tabular-nums;color:var(--text);}.stat.svelte-jdlm6a small:where(.svelte-jdlm6a) {font-size:0.7em;color:var(--text-muted);font-weight:500;}.up.svelte-jdlm6a {color:var(--green) !important;}.down.svelte-jdlm6a {color:var(--red) !important;}.link.svelte-jdlm6a {all:unset;cursor:pointer;border-bottom:1px dashed var(--border-strong);}.link.svelte-jdlm6a:hover {color:var(--accent) !important;}.link.svelte-jdlm6a:focus-visible {outline:2px solid var(--accent);}.attention.svelte-jdlm6a {display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px;border-radius:var(--radius);background:var(--highlight-bg);}.attention.svelte-jdlm6a button:where(.svelte-jdlm6a) {all:unset;cursor:pointer;padding:3px 10px;border-radius:999px;background:var(--bg-elev);border:1px solid var(--border-strong);font-size:0.9em;}.attention.svelte-jdlm6a button:where(.svelte-jdlm6a):hover {border-color:var(--accent);}.attention.svelte-jdlm6a button:where(.svelte-jdlm6a):focus-visible {outline:2px solid var(--accent);}.attention.svelte-jdlm6a .err:where(.svelte-jdlm6a) {color:var(--red);}.attention.svelte-jdlm6a span:where(.svelte-jdlm6a) {font-size:0.9em;align-self:center;}.panel.svelte-jdlm6a {background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;min-width:0;}.panel.svelte-jdlm6a header:where(.svelte-jdlm6a) {display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;}h3.svelte-jdlm6a {margin:0;font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);font-weight:600;}.seg.svelte-jdlm6a {display:flex;flex-wrap:wrap;border:1px solid var(--border-strong);border-radius:var(--radius);overflow:hidden;}.seg.svelte-jdlm6a button:where(.svelte-jdlm6a) {all:unset;cursor:pointer;padding:4px 9px;font-size:0.85em;color:var(--text-muted);}.seg.svelte-jdlm6a button:where(.svelte-jdlm6a) + button:where(.svelte-jdlm6a) {border-left:1px solid var(--border);}.seg.svelte-jdlm6a button:where(.svelte-jdlm6a):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-jdlm6a button.on:where(.svelte-jdlm6a) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.seg.svelte-jdlm6a button:where(.svelte-jdlm6a):focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}select.svelte-jdlm6a {font:inherit;font-size:0.88em;color:var(--text);background:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:3px 6px;}.two.svelte-jdlm6a {display:grid;grid-template-columns:minmax(0, 3fr) minmax(0, 2fr);gap:16px;}\n  @container (max-width: 820px) {.two.svelte-jdlm6a {grid-template-columns:minmax(0, 1fr);} }.accts.svelte-jdlm6a {list-style:none;margin:0;padding:0;}.accts.svelte-jdlm6a button:where(.svelte-jdlm6a) {all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:flex;justify-content:space-between;gap:12px;padding:7px 4px;border-bottom:1px solid var(--border);}.accts.svelte-jdlm6a button:where(.svelte-jdlm6a):hover {background:var(--bg-hover);}.accts.svelte-jdlm6a button:where(.svelte-jdlm6a):focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.accts.svelte-jdlm6a .v:where(.svelte-jdlm6a) {font-family:var(--font-mono);font-size:0.9em;font-variant-numeric:tabular-nums;text-align:right;}"
};
function yt(r, i) {
	e(i, !0), te(r, vt);
	let o = N(i, "period", 15), l = w(u(i.summary.units.find((e) => e.unit === i.summary.unit) ?? {
		unit: i.summary.unit,
		name: i.summary.unit,
		money: !0
	})), f = w(null);
	c(() => {
		let e = n(l);
		if (e.unit === i.summary.unit) {
			T(f, null);
			return;
		}
		I(i.atlas, "wealth", { unit: e.unit }).then((t) => {
			n(l) === e && T(f, t.months, !0);
		}).catch(() => T(f, null));
	});
	let g = E(() => (n(f) ?? i.summary.net_worth).map((e) => ({
		month: e.month,
		value: j(e.total)
	}))), x = E(() => n(g).at(-1)?.value ?? 0), O = (e) => n(g).at(-1 - e)?.value, P = (e, t = !1) => A(e, n(l), { whole: t }), F = (e) => e === void 0 ? null : n(x) - e, L = E(() => i.rows.filter((e) => ge(e, o()))), R = (e) => [...e.values()].reduce((e, t) => e + t, 0), B = E(() => R(_e(n(L), "Expenses"))), V = E(() => R(_e(n(L), "Income"))), U = E(() => be(n(L))), ee = E(() => i.rows.filter((e) => e.tags.includes("guess")).length), G = E(() => i.diags.filter((e) => e.severity === "error")), q = E(() => i.summary.accounts.filter((e) => e.account.startsWith("Assets") && !e.closed && Object.values(e.balances).some((e) => Math.abs(j(e)) > .005))), Y = (e) => z(e, i.cur, { whole: !0 });
	var X = _t(), Z = C(X), ne = C(Z), re = W(C(ne), 2), ie = d(re, !0), ae = W(re, 2);
	b(ae, 20, () => [[1, "since last month"], [12, "in a year"]], ([e, t]) => e, (e, r) => {
		var i = E(() => H(r, 2));
		let a = () => n(i)[0], o = () => n(i)[1], c = E(() => F(O(Number(a()))));
		var u = m(), f = s(u), g = (e) => {
			var r = ot();
			let i;
			var a = d(r);
			S((e) => {
				i = y(r, 1, "svelte-jdlm6a", null, i, {
					up: n(c) > 0,
					down: n(c) < 0
				}), t(a, `${n(c) > 0 ? "▲" : n(c) < 0 ? "▼" : "•"} ${e ?? ""} ${o() ?? ""}`);
			}, [() => A(Math.abs(n(c)), n(l), { whole: !0 })]), p(e, r);
		};
		h(f, (e) => {
			n(c) !== null && e(g);
		}), p(e, u);
	}), J(ae), J(ne);
	var Q = W(ne, 2), oe = C(Q), se = d(oe), ce = W(oe), le = d(ce, !0);
	J(Q);
	var $ = W(Q, 2), ue = W(C($)), de = d(ue, !0);
	J($);
	var fe = W($, 2), pe = C(fe), me = d(pe, !0), he = W(pe);
	let ve;
	var ye = C(he, !0), xe = W(ye), Se = (e) => {
		var r = st(), i = d(r);
		S((e) => t(i, ` · ${e ?? ""}%`), [() => Math.round((n(V) - n(B)) / n(V) * 100)]), p(e, r);
	};
	h(xe, (e) => {
		n(V) > 0 && e(Se);
	}), J(he), J(fe), J(Z);
	var Ce = W(Z, 2), we = (e) => {
		var r = ft(), o = C(r), s = (e) => {
			var n = ct(), r = C(n), a = d(r, !0);
			M(), J(n), S(() => t(a, i.summary.review)), v("click", n, () => i.ontab("review")), p(e, n);
		};
		h(o, (e) => {
			i.summary.review && e(s);
		});
		var c = W(o, 2), l = (e) => {
			var r = lt(), a = C(r), o = d(a, !0);
			M(), J(r), S(() => t(o, n(ee))), v("click", r, () => i.onshow("#guess")), p(e, r);
		};
		h(c, (e) => {
			n(ee) && e(l);
		});
		var u = W(c, 2);
		b(u, 17, () => n(G).slice(0, 3), a, (e, r) => {
			var a = ut(), o = d(a, !0);
			S(() => t(o, n(r).message)), v("click", a, () => i.atlas.open(n(r).path, n(r).line)), p(e, a);
		});
		var f = W(u, 2), m = (e) => {
			var r = dt(), i = d(r);
			S(() => t(i, `and ${n(G).length - 3} more errors`)), p(e, r);
		};
		h(f, (e) => {
			n(G).length > 3 && e(m);
		});
		var g = W(f, 2);
		b(g, 17, () => i.summary.sources.filter((e) => e.error), (e) => e.path, (e, r) => {
			var a = ut(), o = d(a);
			S(() => t(o, `${n(r).bank ?? ""}: ${n(r).error ?? ""}`)), v("click", a, () => i.ontab("sources")), p(e, a);
		}), J(r), p(e, r);
	}, Te = E(() => i.summary.review || n(G).length || n(ee) || i.summary.sources.some((e) => e.error));
	h(Ce, (e) => {
		n(Te) && e(we);
	});
	var Ee = W(Ce, 2), De = C(Ee), Oe = W(C(De), 2);
	b(Oe, 21, () => i.periods, (e) => e.name, (e, r) => {
		var i = pt();
		let a;
		var s = d(i, !0);
		S(() => {
			D(i, "aria-checked", o().name === n(r).name), a = y(i, 1, "svelte-jdlm6a", null, a, { on: o().name === n(r).name }), t(s, n(r).name);
		}), v("click", i, () => o(n(r))), p(e, i);
	}), J(Oe), J(De), ke(W(De, 2), {
		get flow() {
			return n(U);
		},
		get color() {
			return i.color;
		},
		format: Y,
		onpick: (e) => i.onshow(e.toLowerCase())
	}), J(Ee);
	var Ae = W(Ee, 2), je = C(Ae), Me = C(je), Ne = W(C(Me), 2), Pe = (e) => {
		var r = ht();
		b(r, 21, () => i.summary.units, (e) => e.unit, (e, r) => {
			var i = mt(), a = d(i, !0), o = {};
			S(() => {
				k(i, n(r).unit === n(l).unit), t(a, n(r).name), o !== (o = n(r).name) && (i.__value = o);
			}), p(e, i);
		}), J(r), v("change", r, (e) => T(l, i.summary.units[e.currentTarget.selectedIndex], !0)), p(e, r);
	};
	h(Ne, (e) => {
		i.summary.units.length > 1 && e(Pe);
	}), J(Me), ze(W(Me, 2), {
		get points() {
			return n(g);
		},
		format: P
	}), J(je);
	var Fe = W(je, 2), Ie = W(C(Fe), 2);
	b(Ie, 21, () => n(q), (e) => e.account, (e, r) => {
		var a = gt(), o = C(a), s = C(o), c = d(s, !0), l = W(s), u = d(l, !0);
		J(o), J(a), S((e, n) => {
			t(c, e), t(u, n);
		}, [() => K(n(r).account), () => Object.entries(n(r).balances).filter(([, e]) => Math.abs(j(e)) > .005).map(([e, t]) => /^[A-Z]{3}$/.test(e) ? z(j(t), e) : `${j(t)} ${e}`).join(" · ")]), v("click", o, () => i.onaccount(n(r).account)), p(e, a);
	}), J(Ie), J(Fe), J(Ae);
	var Le = W(Ae, 2), Re = C(Le);
	Ge(C(Re), {
		get atlas() {
			return i.atlas;
		},
		get onchange() {
			return i.onchange;
		}
	}), J(Re);
	var Be = W(Re, 2);
	at(C(Be), {
		get atlas() {
			return i.atlas;
		},
		get onchange() {
			return i.onchange;
		}
	}), J(Be), J(Le), J(X), S((e, r, i, a) => {
		t(ie, e), t(se, `${o().name ?? ""}: spent`), t(le, r), t(de, i), t(me, n(V) >= n(B) ? "saved" : "drawn from savings"), ve = y(he, 1, "n svelte-jdlm6a", null, ve, {
			up: n(V) > n(B),
			down: n(V) < n(B)
		}), t(ye, a);
	}, [
		() => P(n(x), !0),
		() => Y(n(B)),
		() => Y(n(V)),
		() => Y(Math.abs(n(V) - n(B)))
	]), v("click", ce, () => i.ontab("spending")), p(r, X), _();
}
f(["click", "change"]);
//#endregion
//#region plugins/beta/finance/ui/src/Editor.svelte
var bt = g("<b class=\"svelte-ht6n60\"> </b>"), xt = g("<div class=\"route svelte-ht6n60\" aria-label=\"Where the money went\"><span class=\"side svelte-ht6n60\"></span> <span class=\"arrow svelte-ht6n60\" aria-hidden=\"true\">→</span> <span class=\"side svelte-ht6n60\"></span></div>"), St = g("<div class=\"posting svelte-ht6n60\"><input class=\"acct svelte-ht6n60\" list=\"fin-accounts\" placeholder=\"Expenses:Food\" aria-label=\"Account\"/> <input class=\"amt svelte-ht6n60\" aria-label=\"Amount\"/> <button class=\"x svelte-ht6n60\" aria-label=\"Remove this posting\" title=\"Remove\">−</button></div>"), Ct = g("<dt class=\"svelte-ht6n60\"> </dt><dd class=\"svelte-ht6n60\"> </dd>", 1), wt = g("<h3 class=\"svelte-ht6n60\">From the bank</h3> <dl class=\"meta svelte-ht6n60\"></dl>", 1), Tt = g("<div class=\"atlas-notice error\"> </div>"), Et = g("<button class=\"atlas-btn\">Open in the journal</button> <button class=\"atlas-btn danger svelte-ht6n60\">Delete</button>", 1), Dt = g("<option></option>"), Ot = g("<div class=\"editor svelte-ht6n60\" role=\"dialog\" tabindex=\"-1\"><header class=\"svelte-ht6n60\"><h2 class=\"svelte-ht6n60\"> </h2> <button class=\"x svelte-ht6n60\" aria-label=\"Close\" title=\"Close (Esc)\">×</button></header> <!> <div class=\"fields svelte-ht6n60\"><label class=\"date svelte-ht6n60\">Date<input type=\"date\" class=\"svelte-ht6n60\"/></label> <label class=\"mark svelte-ht6n60\">Status <select class=\"svelte-ht6n60\"><option>Cleared</option><option>To review</option></select></label> <label class=\"wide svelte-ht6n60\">Payee — who it was with<input list=\"fin-payees\" placeholder=\"Mercadona\" class=\"svelte-ht6n60\"/></label> <label class=\"wide svelte-ht6n60\">Note<input placeholder=\"what it was for\" class=\"svelte-ht6n60\"/></label> <label class=\"wide svelte-ht6n60\">Tags<input placeholder=\"e.g. #trip\" class=\"svelte-ht6n60\"/></label></div> <h3 class=\"svelte-ht6n60\">Postings <span class=\"faint svelte-ht6n60\">money leaves the negative ones and arrives in the positive ones; leave one amount empty to take the rest</span></h3> <div class=\"postings svelte-ht6n60\"><!> <button class=\"atlas-btn add svelte-ht6n60\">Add a posting</button></div> <p role=\"status\"><!></p> <!> <!> <footer class=\"svelte-ht6n60\"><button class=\"atlas-btn primary\" title=\"Ctrl+Enter\"> </button> <!> <span class=\"faint where svelte-ht6n60\"> </span></footer> <datalist id=\"fin-accounts\"></datalist> <datalist id=\"fin-payees\"></datalist></div>"), kt = {
	hash: "svelte-ht6n60",
	code: ".editor.svelte-ht6n60 {display:flex;flex-direction:column;gap:12px;padding:16px 18px;background:var(--bg-elev);border-left:1px solid var(--border);height:100%;overflow:auto;min-width:0;box-sizing:border-box;outline:none;}header.svelte-ht6n60 {display:flex;align-items:center;justify-content:space-between;}h2.svelte-ht6n60 {margin:0;font-size:1.05em;color:var(--heading);}h3.svelte-ht6n60 {margin:4px 0 0;font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);font-weight:600;}h3.svelte-ht6n60 .faint:where(.svelte-ht6n60) {text-transform:none;letter-spacing:0;font-weight:400;}.faint.svelte-ht6n60 {color:var(--text-faint);}.x.svelte-ht6n60 {all:unset;cursor:pointer;width:28px;height:28px;display:grid;place-items:center;border-radius:var(--radius-sm);color:var(--text-muted);font-size:1.2em;}.x.svelte-ht6n60:hover:not(:disabled) {background:var(--bg-hover);color:var(--text);}.x.svelte-ht6n60:focus-visible {outline:2px solid var(--accent);}.x.svelte-ht6n60:disabled {opacity:0.35;cursor:default;}.route.svelte-ht6n60 {display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius);background:var(--accent-soft);flex-wrap:wrap;}.route.svelte-ht6n60 .side:where(.svelte-ht6n60) {display:flex;flex-direction:column;gap:2px;min-width:0;}.route.svelte-ht6n60 b:where(.svelte-ht6n60) {font-weight:600;overflow-wrap:anywhere;}.arrow.svelte-ht6n60 {color:var(--accent);font-size:1.2em;}.fields.svelte-ht6n60 {display:grid;grid-template-columns:1fr 1fr;gap:10px;}.fields.svelte-ht6n60 .wide:where(.svelte-ht6n60) {grid-column:1 / -1;}label.svelte-ht6n60 {display:flex;flex-direction:column;gap:4px;font-size:0.82em;color:var(--text-muted);min-width:0;}input.svelte-ht6n60, select.svelte-ht6n60 {font:inherit;font-size:1.1em;color:var(--text);background:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:6px 8px;min-width:0;}input.svelte-ht6n60:focus-visible, select.svelte-ht6n60:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.postings.svelte-ht6n60 {display:flex;flex-direction:column;gap:6px;}.posting.svelte-ht6n60 {display:grid;grid-template-columns:minmax(0, 1fr) 9.5em 28px;gap:6px;align-items:center;}.amt.svelte-ht6n60 {font-family:var(--font-mono);text-align:right;font-variant-numeric:tabular-nums;}.add.svelte-ht6n60 {align-self:flex-start;}.balance.svelte-ht6n60 {margin:0;font-size:0.88em;color:var(--green);}.balance.bad.svelte-ht6n60 {color:var(--red);}.meta.svelte-ht6n60 {display:grid;grid-template-columns:max-content minmax(0, 1fr);gap:4px 12px;margin:0;font-size:0.88em;}.meta.svelte-ht6n60 dt:where(.svelte-ht6n60) {color:var(--text-muted);}.meta.svelte-ht6n60 dd:where(.svelte-ht6n60) {margin:0;overflow-wrap:anywhere;font-family:var(--font-mono);font-size:0.95em;}footer.svelte-ht6n60 {display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:auto;padding-top:8px;border-top:1px solid var(--border);}.where.svelte-ht6n60 {margin-left:auto;font-size:0.82em;}.danger.svelte-ht6n60 {color:var(--red);}"
};
function At(r, i) {
	e(i, !0), te(r, kt);
	let o = () => ({
		date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
		status: "*",
		payee: "",
		narration: "",
		tags: [],
		postings: [{
			account: "",
			amount: ""
		}, {
			account: "",
			amount: ""
		}]
	}), f = () => i.txn ? xe(i.txn) : o(), m = u(f()), g = w(u(f().tags.map((e) => `#${e}`).join(" "))), x = w(!1), O = w(""), k = E(() => Se(m)), A = E(() => n(k).bad.length === 0 && (n(k).open || n(k).left.size === 0)), j = E(() => JSON.stringify({
		...m,
		tags: R()
	}) !== JSON.stringify(f())), M = E(() => i.txn?.meta ?? []), N = E(() => i.txn ? oe(i.txn) : null), L = w(void 0);
	c(() => {
		i.txn || n(L)?.focus();
	});
	function R() {
		return n(g).split(/\s+/).map((e) => e.replace(/^#/, "")).filter(Boolean);
	}
	let B = (e, t) => /^[A-Z]{3}$/.test(t) ? z(e, t, { sign: !0 }) : `${e > 0 ? "+" : ""}${e.toFixed(2)} ${t}`;
	async function V() {
		if (!n(x) && n(A)) {
			T(x, !0), T(O, "");
			try {
				let e = i.txn ? {
					path: i.txn.path,
					line: i.txn.line,
					text: i.txn.text
				} : {}, t = await I(i.atlas, "txn_save", {
					draft: {
						...m,
						tags: R()
					},
					...e
				});
				i.atlas.toast(i.txn ? "Saved" : "Added", `${m.payee} · ${m.date}`, "success"), i.onsaved(t.path);
			} catch (e) {
				T(O, e.message, !0);
			} finally {
				T(x, !1);
			}
		}
	}
	async function U() {
		if (i.txn && !n(x)) {
			T(x, !0), T(O, "");
			try {
				let e = await I(i.atlas, "txn_delete", {
					path: i.txn.path,
					line: i.txn.line,
					text: i.txn.text
				}), t = `${i.txn.payee} · ${i.txn.date}`;
				i.atlas.toast("Deleted", `${t} — click to undo`, "info", { run: () => void I(i.atlas, "txn_restore", {
					path: e.path,
					text: e.removed
				}).then(() => i.atlas.toast("Restored", t, "success")).catch((e) => i.atlas.toast("Not restored", e.message, "error")) }), i.onsaved();
			} catch (e) {
				T(O, e.message, !0);
			} finally {
				T(x, !1);
			}
		}
	}
	function G(e) {
		e.key === "Escape" && (e.stopPropagation(), i.onclose()), e.key === "Enter" && (e.ctrlKey || e.metaKey) && (e.preventDefault(), V());
	}
	var q = Ot(), Y = C(q), Z = C(Y), re = d(Z, !0), ie = W(Z, 2);
	J(Y);
	var ae = W(Y, 2), Q = (e) => {
		var r = xt(), i = C(r);
		b(i, 21, () => n(N).from, (e) => e.account, (e, r) => {
			var i = bt(), a = d(i, !0);
			S((e) => t(a, e), [() => K(n(r).account)]), p(e, i);
		}), J(i);
		var a = W(i, 4);
		b(a, 21, () => n(N).to, (e) => e.account, (e, r) => {
			var i = bt(), a = d(i, !0);
			S((e) => t(a, e), [() => K(n(r).account)]), p(e, i);
		}), J(a), J(r), p(e, r);
	};
	h(ae, (e) => {
		n(N) && e(Q);
	});
	var se = W(ae, 2), ce = C(se), le = W(C(ce));
	P(le), ee(le, (e) => T(L, e), () => n(L)), J(ce);
	var $ = W(ce, 2), ue = W(C($)), de = C(ue);
	de.value = de.__value = "*";
	var fe = W(de);
	fe.value = fe.__value = "!", J(ue), ne(ue), J($);
	var pe = W($, 2), me = W(C(pe));
	P(me), J(pe);
	var he = W(pe, 2), ge = W(C(he));
	P(ge), J(he);
	var _e = W(he, 2), ve = W(C(_e));
	P(ve), J(_e), J(se);
	var ye = W(se, 4), be = C(ye);
	b(be, 17, () => m.postings, a, (e, t, r) => {
		var i = St(), a = C(i);
		P(a);
		var o = W(a, 2);
		P(o);
		var s = W(o, 2);
		J(i), S(() => {
			D(o, "placeholder", n(k).open && !n(t).amount ? "the rest" : "-12.40 EUR"), s.disabled = m.postings.length <= 2;
		}), F(a, () => n(t).account, (e) => n(t).account = e), F(o, () => n(t).amount, (e) => n(t).amount = e), v("click", s, () => m.postings.splice(r, 1)), p(e, i);
	});
	var Ce = W(be, 2);
	J(ye);
	var we = W(ye, 2);
	let Te;
	var Ee = C(we), De = (e) => {
		var r = l();
		S((e) => t(r, `Not an amount: ${e ?? ""} (write it as “-12.40 EUR”)`), [() => n(k).bad.join(", ")]), p(e, r);
	}, Oe = (e) => {
		var r = l();
		S(() => t(r, n(k).open ? "Balanced: the empty posting takes the rest" : "Balanced")), p(e, r);
	}, ke = (e) => {
		var r = l();
		S((e) => t(r, `Off by ${e ?? ""} — fix an amount or leave one empty`), [() => [...n(k).left].map(([e, t]) => B(t, e)).join(", ")]), p(e, r);
	};
	h(Ee, (e) => {
		n(k).bad.length ? e(De) : n(A) ? e(Oe, 1) : e(ke, -1);
	}), J(we);
	var Ae = W(we, 2), je = (e) => {
		var r = wt(), i = W(s(r), 2);
		b(i, 21, () => n(M), ([e, t]) => e + t, (e, r) => {
			var i = E(() => H(n(r), 2));
			let a = () => n(i)[0], o = () => n(i)[1];
			var c = Ct(), l = s(c), u = d(l, !0), f = W(l), m = d(f, !0);
			S(() => {
				t(u, a()), t(m, o());
			}), p(e, c);
		}), J(i), p(e, r);
	};
	h(Ae, (e) => {
		n(M).length && e(je);
	});
	var Me = W(Ae, 2), Ne = (e) => {
		var r = Tt(), i = d(r, !0);
		S(() => t(i, n(O))), p(e, r);
	};
	h(Me, (e) => {
		n(O) && e(Ne);
	});
	var Pe = W(Me, 2), Fe = C(Pe), Ie = d(Fe, !0), Le = W(Fe, 2), Re = (e) => {
		var t = Et(), r = s(t), a = W(r, 2);
		S(() => a.disabled = n(x)), v("click", r, () => i.atlas.open(i.txn.path, i.txn.line)), v("click", a, U), p(e, t);
	};
	h(Le, (e) => {
		i.txn && e(Re);
	});
	var ze = W(Le, 2), Be = d(ze, !0);
	J(Pe);
	var Ve = W(Pe, 2);
	b(Ve, 20, () => i.accounts, (e) => e, (e, t) => {
		var n = Dt(), r = {};
		S(() => {
			r !== (r = t) && (n.value = (n.__value = r) ?? "");
		}), p(e, n);
	}), J(Ve);
	var He = W(Ve, 2);
	b(He, 20, () => i.payees, (e) => e, (e, t) => {
		var n = Dt(), r = {};
		S(() => {
			r !== (r = t) && (n.value = (n.__value = r) ?? "");
		}), p(e, n);
	}), J(He), J(q), S((e, r) => {
		D(q, "aria-label", i.txn ? "Edit transaction" : "New transaction"), t(re, i.txn ? "Transaction" : "New transaction"), Te = y(we, 1, "balance svelte-ht6n60", null, Te, { bad: !n(A) }), Fe.disabled = e, t(Ie, n(x) ? "Saving…" : i.txn ? "Save" : "Add"), t(Be, r);
	}, [() => n(x) || !n(A) || !m.payee.trim() || !!i.txn && !n(j), () => i.txn ? `${i.txn.path.split("/").pop()}:${i.txn.line}` : `goes to journal/${m.date.slice(0, 4)}.fin`]), v("keydown", q, G), v("click", ie, function(...e) {
		i.onclose?.apply(this, e);
	}), F(le, () => m.date, (e) => m.date = e), X(ue, () => m.status, (e) => m.status = e), F(me, () => m.payee, (e) => m.payee = e), F(ge, () => m.narration, (e) => m.narration = e), F(ve, () => n(g), (e) => T(g, e)), v("click", Ce, () => m.postings.push({
		account: "",
		amount: ""
	})), v("click", Fe, V), p(r, q), _();
}
f(["keydown", "click"]);
//#endregion
//#region plugins/beta/finance/ui/src/Transactions.svelte
var jt = g("<button role=\"radio\"> </button>"), Mt = g("<button class=\"link svelte-aipwz8\">clear the search</button>"), Nt = g("<div class=\"month svelte-aipwz8\"> </div>"), Pt = g("<span class=\"chip warn svelte-aipwz8\">review</span>"), Ft = g("<span> </span>"), It = g("<span class=\"note svelte-aipwz8\"> </span>"), Lt = g("<!>  <button role=\"option\"><span class=\"date svelte-aipwz8\"> </span> <span class=\"who svelte-aipwz8\"><span class=\"payee svelte-aipwz8\"> <!><!></span> <!></span> <span class=\"route svelte-aipwz8\"><span class=\"from svelte-aipwz8\"> </span><span class=\"arr svelte-aipwz8\" aria-label=\"to\">→</span><span class=\"to svelte-aipwz8\"> </span></span> <span> </span></button>", 1), Rt = g("<div class=\"atlas-empty\"> </div>"), zt = g("<button class=\"atlas-btn more svelte-aipwz8\"> </button>"), Bt = g("<div><section class=\"main svelte-aipwz8\"><div class=\"bar svelte-aipwz8\"><input class=\"search svelte-aipwz8\" placeholder=\"Search payee, account, bank text · #guess · >100 · 2025-03 · !\" aria-label=\"Search transactions\"/> <div class=\"seg svelte-aipwz8\" role=\"radiogroup\" aria-label=\"Kind\"></div> <button class=\"atlas-btn primary\" title=\"n\">New…</button></div> <p class=\"count svelte-aipwz8\"><b class=\"svelte-aipwz8\"> </b> <!> <!></p> <div class=\"list svelte-aipwz8\" role=\"listbox\" aria-label=\"Transactions\" tabindex=\"-1\"><!> <!></div></section> <!></div>"), Vt = {
	hash: "svelte-aipwz8",
	code: ".tx.svelte-aipwz8 {display:grid;grid-template-columns:minmax(0, 1fr);gap:0;height:100%;min-height:0;}.tx.with.svelte-aipwz8 {grid-template-columns:minmax(0, 1fr) min(460px, 45%);}.main.svelte-aipwz8 {display:flex;flex-direction:column;min-width:0;min-height:0;padding-right:12px;}.bar.svelte-aipwz8 {display:flex;gap:8px;align-items:center;flex-wrap:wrap;}.search.svelte-aipwz8 {flex:1;min-width:220px;font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius);padding:8px 10px;}.search.svelte-aipwz8:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.seg.svelte-aipwz8 {display:flex;border:1px solid var(--border-strong);border-radius:var(--radius);overflow:hidden;}.seg.svelte-aipwz8 button:where(.svelte-aipwz8) {all:unset;cursor:pointer;padding:6px 10px;font-size:0.9em;color:var(--text-muted);}.seg.svelte-aipwz8 button:where(.svelte-aipwz8) + button:where(.svelte-aipwz8) {border-left:1px solid var(--border);}.seg.svelte-aipwz8 button:where(.svelte-aipwz8):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-aipwz8 button.on:where(.svelte-aipwz8) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.seg.svelte-aipwz8 button:where(.svelte-aipwz8):focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.count.svelte-aipwz8 {margin:10px 0 6px;color:var(--text-muted);font-size:0.88em;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;}.count.svelte-aipwz8 b:where(.svelte-aipwz8) {color:var(--text);font-variant-numeric:tabular-nums;}.link.svelte-aipwz8 {all:unset;cursor:pointer;color:var(--accent);}.list.svelte-aipwz8 {overflow:auto;min-height:0;flex:1;outline:none;}.month.svelte-aipwz8 {position:sticky;top:0;z-index:1;background:var(--bg);padding:10px 8px 4px;font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border);}.row.svelte-aipwz8 {all:unset;box-sizing:border-box;cursor:pointer;display:grid;grid-template-columns:4.2em minmax(0, 1.3fr) minmax(0, 1.2fr) 8.5em;gap:12px;align-items:center;width:100%;padding:7px 8px;border-bottom:1px solid var(--border);min-height:40px;}.row.svelte-aipwz8:hover {background:var(--bg-hover);}.row.sel.svelte-aipwz8 {box-shadow:inset 2px 0 0 var(--accent);background:var(--bg-hover);}.row.open.svelte-aipwz8 {background:var(--accent-soft);}.row.svelte-aipwz8:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.date.svelte-aipwz8 {color:var(--text-muted);font-size:0.88em;font-variant-numeric:tabular-nums;}.who.svelte-aipwz8 {display:flex;flex-direction:column;min-width:0;}.payee.svelte-aipwz8 {font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.note.svelte-aipwz8 {color:var(--text-faint);font-size:0.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.chip.svelte-aipwz8 {display:inline-block;margin-left:6px;padding:0 6px;border-radius:999px;background:var(--tag-bg);color:var(--tag-color);font-size:0.75em;font-weight:500;vertical-align:1px;}.chip.warn.svelte-aipwz8 {background:var(--highlight-bg);color:var(--text);}.route.svelte-aipwz8 {display:flex;gap:6px;align-items:baseline;min-width:0;font-size:0.88em;color:var(--text-muted);}.route.svelte-aipwz8 .from:where(.svelte-aipwz8), .route.svelte-aipwz8 .to:where(.svelte-aipwz8) {white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}.route.svelte-aipwz8 .to:where(.svelte-aipwz8) {color:var(--text);flex:1;}.arr.svelte-aipwz8 {color:var(--text-faint);}.amt.svelte-aipwz8 {text-align:right;font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:0.92em;}.amt.in.svelte-aipwz8 {color:var(--green);}.amt.moved.svelte-aipwz8 {color:var(--text-muted);}.more.svelte-aipwz8 {margin:10px auto;display:block;}\n  @container (max-width: 640px) {.row.svelte-aipwz8 {grid-template-columns:3.6em minmax(0, 1fr) 7em;}.route.svelte-aipwz8 {display:none;} }"
};
function Ht(r, a) {
	e(a, !0), te(r, Vt);
	let o = N(a, "query", 15, ""), u = N(a, "open", 15, null), f = [
		["all", "All"],
		["spend", "Spending"],
		["income", "Income"],
		["transfer", "Transfers"]
	], g = w("all"), O = w(200), k = w(0), A = w(void 0), j = w(void 0), M = E(() => {
		let e = ue(o());
		return a.rows.filter((t) => (n(g) === "all" || $(t) === n(g)) && e(t));
	}), I = E(() => n(M).reduce((e, t) => e + ($(t) === "transfer" || $(t) === "other" ? 0 : ce(t)), 0)), L = E(() => n(M).slice(0, n(O))), R = E(() => [...new Set(a.rows.map((e) => e.payee))].sort());
	c(() => {
		o(), n(g), T(O, 200), T(k, 0);
	});
	let B = (e) => (/* @__PURE__ */ new Date(`${e}T12:00:00`)).toLocaleDateString(void 0, {
		day: "numeric",
		month: "short"
	}), V = (e) => (/* @__PURE__ */ new Date(`${e}T12:00:00`)).toLocaleDateString(void 0, {
		month: "long",
		year: "numeric"
	});
	function U(e) {
		T(k, Math.max(0, Math.min(n(M).length - 1, e)), !0), n(k) >= n(O) && T(O, n(k) + 50), queueMicrotask(() => n(j)?.querySelector(`[data-i="${n(k)}"]`)?.scrollIntoView({ block: "nearest" }));
	}
	function G(e) {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		let t = e.target.closest("input, textarea, select, [role=dialog]");
		if (e.key === "/" && !t) {
			e.preventDefault(), n(A)?.focus();
			return;
		}
		if (t) {
			e.key === "Escape" && e.target === n(A) && (o(""), n(A)?.blur());
			return;
		}
		e.key === "j" || e.key === "ArrowDown" ? (e.preventDefault(), U(n(k) + 1), u() && u() !== "new" && u(n(M)[n(k)])) : e.key === "k" || e.key === "ArrowUp" ? (e.preventDefault(), U(n(k) - 1), u() && u() !== "new" && u(n(M)[n(k)])) : e.key === "Enter" && n(M)[n(k)] ? (e.preventDefault(), u(n(M)[n(k)])) : e.key === "n" ? (e.preventDefault(), u("new")) : e.key === "Escape" && u() && u(null);
	}
	var K = Bt();
	re("keydown", x, G);
	let q;
	var Y = C(K), X = C(Y), Z = C(X);
	P(Z), ee(Z, (e) => T(A, e), () => n(A));
	var ne = W(Z, 2);
	b(ne, 21, () => f, ([e, t]) => e, (e, r) => {
		var i = E(() => H(n(r), 2));
		let a = () => n(i)[0], o = () => n(i)[1];
		var s = jt();
		let c;
		var l = d(s, !0);
		S(() => {
			D(s, "aria-checked", n(g) === a()), c = y(s, 1, "svelte-aipwz8", null, c, { on: n(g) === a() }), t(l, o());
		}), v("click", s, () => T(g, a(), !0)), p(e, s);
	}), J(ne);
	var ie = W(ne, 2);
	J(X);
	var ae = W(X, 2), Q = C(ae), se = d(Q, !0), de = W(Q), fe = W(de), pe = (e) => {
		var r = l();
		S((e) => t(r, `· net ${e ?? ""}`), [() => z(n(I), a.cur, { sign: !0 })]), p(e, r);
	};
	h(fe, (e) => {
		(o() || n(g) !== "all") && e(pe);
	});
	var me = W(fe, 2), he = (e) => {
		var t = Mt();
		v("click", t, () => o("")), p(e, t);
	};
	h(me, (e) => {
		o() && e(he);
	}), J(ae);
	var ge = W(ae, 2), _e = C(ge);
	b(_e, 19, () => n(L), (e) => e.path + ":" + e.line, (e, r, i) => {
		let o = E(() => oe(n(r))), c = E(() => $(n(r)));
		var l = Lt(), f = s(l), m = (e) => {
			var i = Nt(), a = d(i, !0);
			S((e) => t(a, e), [() => V(n(r).date)]), p(e, i);
		}, g = E(() => n(i) === 0 || n(L)[n(i) - 1].date.slice(0, 7) !== n(r).date.slice(0, 7));
		h(f, (e) => {
			n(g) && e(m);
		});
		var _ = W(f, 2);
		let x;
		var w = C(_), O = d(w, !0), A = W(w, 2), j = C(A), M = C(j, !0), N = W(M), P = (e) => {
			var t = Pt();
			p(e, t);
		};
		h(N, (e) => {
			n(r).status === "!" && e(P);
		});
		var F = W(N);
		b(F, 16, () => n(r).tags, (e) => e, (e, n) => {
			var r = Ft();
			let i;
			var a = d(r);
			S(() => {
				i = y(r, 1, "chip svelte-aipwz8", null, i, { warn: n === "guess" }), t(a, `#${n ?? ""}`);
			}), p(e, r);
		}), J(j);
		var I = W(j, 2), R = (e) => {
			var i = It(), a = d(i, !0);
			S(() => t(a, n(r).narration)), p(e, i);
		};
		h(I, (e) => {
			n(r).narration && e(R);
		}), J(A);
		var H = W(A, 2), U = C(H), ee = d(U, !0), G = W(U, 2), K = d(G, !0);
		J(H);
		var q = W(H, 2);
		let Y;
		var X = d(q);
		J(_), S((e, a, o, s, l) => {
			x = y(_, 1, "row svelte-aipwz8", null, x, {
				sel: n(i) === n(k),
				open: u() !== "new" && u()?.path === n(r).path && u()?.line === n(r).line
			}), D(_, "data-i", n(i)), D(_, "aria-selected", n(i) === n(k)), t(O, e), t(M, n(r).payee), t(ee, a), t(K, o), Y = y(q, 1, "amt svelte-aipwz8", null, Y, {
				in: s,
				moved: n(c) === "transfer"
			}), t(X, `${n(c) === "transfer" ? "⇄ " : ""}${l ?? ""}`);
		}, [
			() => B(n(r).date),
			() => le(n(o).from),
			() => le(n(o).to),
			() => n(c) !== "transfer" && ce(n(r)) > 0,
			() => z(ce(n(r)), a.cur, { sign: n(c) !== "transfer" })
		]), v("click", _, () => {
			T(k, n(i), !0), u(n(r));
		}), p(e, l);
	}, (e) => {
		var n = Rt(), r = d(n, !0);
		S(() => t(r, a.rows.length ? "Nothing matches. Try fewer words, or clear the search." : "No transactions yet: import a statement (Overview) or add one with New…")), p(e, n);
	});
	var ve = W(_e, 2), ye = (e) => {
		var r = zt(), i = d(r);
		S((e) => t(i, `Show ${e ?? ""} more of ${n(M).length - n(O)}`), [() => Math.min(400, n(M).length - n(O))]), v("click", r, () => T(O, n(O) + 400)), p(e, r);
	};
	h(ve, (e) => {
		n(M).length > n(O) && e(ye);
	}), J(ge), ee(ge, (e) => T(j, e), () => n(j)), J(Y);
	var be = W(Y, 2), xe = (e) => {
		var t = m(), r = s(t);
		i(r, () => u() === "new" ? "new" : u().path + ":" + u().line + u().text, (e) => {
			{
				let t = E(() => u() === "new" ? null : u());
				At(e, {
					get atlas() {
						return a.atlas;
					},
					get txn() {
						return n(t);
					},
					get accounts() {
						return a.accounts;
					},
					get payees() {
						return n(R);
					},
					onclose: () => u(null),
					onsaved: () => {
						u(null), a.onchange();
					}
				});
			}
		}), p(e, t);
	};
	h(be, (e) => {
		u() && e(xe);
	}), J(K), S((e) => {
		q = y(K, 1, "tx svelte-aipwz8", null, q, { with: !!u() }), t(se, e), t(de, ` ${n(M).length === 1 ? "transaction" : "transactions"}`);
	}, [() => n(M).length.toLocaleString()]), F(Z, o), v("click", ie, () => u("new")), p(r, K), _();
}
f(["click"]);
//#endregion
//#region plugins/beta/finance/ui/src/MonthBars.svelte
var Ut = o("<line class=\"grid svelte-19iowyp\"></line><text class=\"tick svelte-19iowyp\" text-anchor=\"end\" dominant-baseline=\"middle\"> </text>", 1), Wt = o("<path class=\"svelte-19iowyp\"></path>"), Gt = o("<text class=\"tick svelte-19iowyp\" text-anchor=\"middle\"> </text>"), Kt = o("<g role=\"presentation\"><rect class=\"hit svelte-19iowyp\"></rect><!></g><!>", 1), qt = g("<div class=\"tip svelte-19iowyp\"><span> </span> <b class=\"svelte-19iowyp\"> </b></div>"), Jt = g("<div class=\"bars svelte-19iowyp\"><svg role=\"img\" aria-label=\"By month\" class=\"svelte-19iowyp\"><!><!></svg> <!></div>"), Yt = {
	hash: "svelte-19iowyp",
	code: ".bars.svelte-19iowyp {position:relative;min-width:0;}svg.svelte-19iowyp {display:block;}.grid.svelte-19iowyp {stroke:var(--border);}.tick.svelte-19iowyp {fill:var(--text-faint);font-size:11px;font-variant-numeric:tabular-nums;}.hit.svelte-19iowyp {fill:transparent;}.m.svelte-19iowyp {cursor:pointer;}.m.svelte-19iowyp:hover .hit:where(.svelte-19iowyp) {fill:var(--bg-hover);}.m.dim.svelte-19iowyp path:where(.svelte-19iowyp) {opacity:0.4;}.tip.svelte-19iowyp {position:absolute;top:0;pointer-events:none;display:flex;flex-direction:column;padding:6px 10px;border-radius:var(--radius-sm);background:var(--bg-elev);border:1px solid var(--border-strong);box-shadow:var(--shadow-sm);font-size:0.85em;color:var(--text-muted);white-space:nowrap;}.tip.svelte-19iowyp b:where(.svelte-19iowyp) {color:var(--text);font-variant-numeric:tabular-nums;}"
};
function Xt(r, i) {
	e(i, !0), te(r, Yt);
	let a = N(i, "fill", 3, "var(--accent)"), o = N(i, "selected", 3, null), c = w(600), l = {
		l: 56,
		r: 4,
		t: 8,
		b: 22
	}, u = w(null), f = E(() => Math.max(1, ...i.months.map((e) => e.value))), m = E(() => M(n(f))), g = E(() => Math.ceil(n(f) / n(m)) * n(m)), x = E(() => (n(c) - l.l - l.r) / Math.max(1, i.months.length)), O = E(() => Math.max(2, Math.min(28, n(x) - 2))), k = (e) => l.t + (1 - Math.max(0, e) / n(g)) * (150 - l.t - l.b), A = E(() => i.months.length > 30 ? 12 : i.months.length > 14 ? 6 : i.months.length > 7 ? 3 : 1), j = (e, t) => (/* @__PURE__ */ new Date(`${e}-01T12:00:00`)).toLocaleDateString(void 0, t ? {
		month: "short",
		year: "2-digit"
	} : { month: "short" });
	function M(e) {
		let t = e / 3, n = 10 ** Math.floor(Math.log10(t || 1));
		return [
			1,
			2,
			2.5,
			5,
			10
		].map((e) => e * n).find((e) => e >= t) ?? n * 10;
	}
	let P = (e) => !!o() && e >= o().from && e <= o().to;
	var F = Jt(), I = C(F);
	D(I, "height", 150);
	var L = C(I);
	b(L, 16, () => [
		0,
		1,
		2,
		3
	].map((e) => e * n(m)).filter((e) => e <= n(g)), (e) => e, (e, r) => {
		var a = Ut(), o = s(a), u = W(o), f = d(u, !0);
		S((e, r, i, a) => {
			D(o, "x1", l.l), D(o, "x2", n(c) - l.r), D(o, "y1", e), D(o, "y2", r), D(u, "x", l.l - 6), D(u, "y", i), t(f, a);
		}, [
			() => k(r),
			() => k(r),
			() => k(r),
			() => i.format(r, !0)
		]), p(e, a);
	});
	var R = W(L);
	b(R, 19, () => i.months, (e) => e.month, (e, r, c) => {
		let f = E(() => l.l + n(c) * n(x) + (n(x) - n(O)) / 2);
		var m = Kt(), g = s(m);
		let _;
		var b = C(g), w = W(b), M = (e) => {
			var t = Wt();
			let i;
			S((e) => {
				D(t, "d", e), i = Z(t, "", i, { fill: a() });
			}, [() => `M${n(f)},${k(0)}V${k(n(r).value) + 3}q0,-3 3,-3h${n(O) - 6}q3,0 3,3V${k(0)}Z`]), p(e, t);
		};
		h(w, (e) => {
			n(r).value > 0 && e(M);
		}), J(g);
		var N = W(g), F = (e) => {
			var i = Gt();
			D(i, "y", 144);
			var a = d(i, !0);
			S((e) => {
				D(i, "x", l.l + n(c) * n(x) + n(x) / 2), t(a, e);
			}, [() => j(n(r).month, n(c) === 0 || n(r).month.endsWith("-01"))]), p(e, i);
		};
		h(N, (e) => {
			n(c) % n(A) === 0 && e(F);
		}), S((e, t) => {
			_ = y(g, 0, "m svelte-19iowyp", null, _, {
				sel: e,
				dim: t
			}), D(b, "x", l.l + n(c) * n(x)), D(b, "y", l.t), D(b, "width", n(x)), D(b, "height", 150 - l.t - l.b);
		}, [() => P(n(r).month), () => !!o() && !P(n(r).month)]), re("pointerenter", g, () => T(u, n(c), !0)), re("pointerleave", g, () => T(u, null)), v("click", g, () => i.onpick?.(n(r).month)), p(e, m);
	}), J(I);
	var z = W(I, 2), V = (e) => {
		var r = qt();
		let a;
		var o = C(r), s = d(o, !0), f = W(o, 2), m = d(f, !0);
		J(r), S((e, n, i) => {
			a = Z(r, "", a, { left: e }), t(s, n), t(m, i);
		}, [
			() => `${Math.min(l.l + n(u) * n(x) + n(x), n(c) - 150)}px`,
			() => (/* @__PURE__ */ new Date(`${i.months[n(u)].month}-01T12:00:00`)).toLocaleDateString(void 0, {
				month: "long",
				year: "numeric"
			}),
			() => i.format(i.months[n(u)].value)
		]), p(e, r);
	};
	h(z, (e) => {
		n(u) !== null && e(V);
	}), J(F), S(() => D(I, "width", n(c))), B(F, "clientWidth", (e) => T(c, e)), p(r, F), _();
}
f(["click"]);
//#endregion
//#region plugins/beta/finance/ui/src/Spend.svelte
var Zt = g("<button role=\"radio\"> </button>"), Qt = g("<span class=\"chip svelte-qqjett\"> </span>"), $t = g("<button class=\"link svelte-qqjett\">all categories</button>"), en = g("<span class=\"usual svelte-qqjett\"></span>"), tn = g("<tr><td class=\"svelte-qqjett\"><button class=\"link svelte-qqjett\"> </button></td><td class=\"n svelte-qqjett\"> </td><td class=\"n svelte-qqjett\"> </td></tr>"), nn = g("<div class=\"who svelte-qqjett\"><table class=\"svelte-qqjett\"><thead><tr><th class=\"svelte-qqjett\">Paid to</th><th class=\"n svelte-qqjett\">Times</th><th class=\"n svelte-qqjett\">Total</th></tr></thead><tbody></tbody></table> <button class=\"atlas-btn\"> </button></div>"), rn = g("<li><button class=\"cat svelte-qqjett\"><span class=\"swatch svelte-qqjett\"></span> <span class=\"name svelte-qqjett\"> </span> <span class=\"track svelte-qqjett\"><span class=\"fill svelte-qqjett\"></span><!></span> <span class=\"v svelte-qqjett\"> </span> <span class=\"pct svelte-qqjett\"> </span> <span> </span></button> <!></li>"), an = g("<li class=\"atlas-empty svelte-qqjett\">Nothing spent in this period.</li>"), on = g("<div class=\"spend svelte-qqjett\"><div class=\"bar svelte-qqjett\"><div class=\"seg svelte-qqjett\" role=\"radiogroup\" aria-label=\"Period\"></div> <!></div> <section><h3 class=\"svelte-qqjett\"> <span class=\"faint svelte-qqjett\"> </span><!></h3> <!></section> <section><h3 class=\"svelte-qqjett\"> <span class=\"faint svelte-qqjett\"> </span></h3> <ol class=\"cats svelte-qqjett\"></ol></section></div>"), sn = {
	hash: "svelte-qqjett",
	code: ".spend.svelte-qqjett {display:flex;flex-direction:column;gap:18px;max-width:980px;}.bar.svelte-qqjett {display:flex;gap:8px;align-items:center;flex-wrap:wrap;}.seg.svelte-qqjett {display:flex;flex-wrap:wrap;border:1px solid var(--border-strong);border-radius:var(--radius);overflow:hidden;}.seg.svelte-qqjett button:where(.svelte-qqjett) {all:unset;cursor:pointer;padding:6px 10px;font-size:0.9em;color:var(--text-muted);}.seg.svelte-qqjett button:where(.svelte-qqjett) + button:where(.svelte-qqjett) {border-left:1px solid var(--border);}.seg.svelte-qqjett button:where(.svelte-qqjett):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-qqjett button.on:where(.svelte-qqjett) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.seg.svelte-qqjett button:where(.svelte-qqjett):focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.chip.svelte-qqjett {padding:3px 10px;border-radius:999px;background:var(--accent-soft);color:var(--accent-strong);font-size:0.88em;font-weight:600;}h3.svelte-qqjett {margin:0 0 8px;font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);font-weight:600;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;}.faint.svelte-qqjett {color:var(--text-faint);text-transform:none;letter-spacing:0;font-weight:400;}.link.svelte-qqjett {all:unset;cursor:pointer;color:var(--accent);text-transform:none;letter-spacing:0;font-weight:400;}.link.svelte-qqjett:focus-visible {outline:2px solid var(--accent);}.cats.svelte-qqjett {list-style:none;margin:0;padding:0;}.cats.svelte-qqjett li:where(.svelte-qqjett) {border-bottom:1px solid var(--border);}.cat.svelte-qqjett {all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:grid;grid-template-columns:10px minmax(7em, 1fr) minmax(80px, 2fr) 7.5em 3em 9.5em;gap:10px;align-items:center;padding:8px 6px;}.cat.svelte-qqjett:hover {background:var(--bg-hover);}.cat.svelte-qqjett:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.open.svelte-qqjett .cat:where(.svelte-qqjett) {background:var(--bg-hover);}.swatch.svelte-qqjett {width:10px;height:10px;border-radius:3px;}.name.svelte-qqjett {font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.track.svelte-qqjett {position:relative;height:10px;background:var(--bg-hover);border-radius:3px;}.fill.svelte-qqjett {position:absolute;inset:0 auto 0 0;border-radius:3px;}.usual.svelte-qqjett {position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--text);border-radius:1px;}.v.svelte-qqjett, .pct.svelte-qqjett, .vs.svelte-qqjett {text-align:right;font-variant-numeric:tabular-nums;}.v.svelte-qqjett {font-family:var(--font-mono);font-size:0.92em;}.pct.svelte-qqjett {color:var(--text-muted);font-size:0.88em;}.vs.svelte-qqjett {color:var(--text-faint);font-size:0.82em;}.vs.up.svelte-qqjett {color:var(--red);}.vs.down.svelte-qqjett {color:var(--green);}.who.svelte-qqjett {padding:4px 6px 12px 26px;display:flex;flex-direction:column;gap:8px;align-items:flex-start;}table.svelte-qqjett {border-collapse:collapse;width:100%;max-width:560px;font-size:0.9em;}th.svelte-qqjett {text-align:left;color:var(--text-muted);font-weight:500;font-size:0.85em;padding:2px 8px 4px 0;}td.svelte-qqjett {padding:3px 8px 3px 0;border-top:1px solid var(--border);}.n.svelte-qqjett {text-align:right;font-variant-numeric:tabular-nums;}\n  @container (max-width: 700px) {.cat.svelte-qqjett {grid-template-columns:10px minmax(6em, 1fr) minmax(60px, 1fr) 7em;}.pct.svelte-qqjett, .vs.svelte-qqjett {display:none;} }"
};
function cn(r, i) {
	e(i, !0), te(r, sn);
	let a = N(i, "period", 15), o = w(null), s = (e, t = !1) => z(e, i.cur, { whole: t }), c = E(() => ve(i.rows)), l = E(() => n(c).map((e) => ({
		month: e.month,
		value: n(o) ? e.by.get(n(o)) ?? 0 : e.total
	}))), u = E(() => i.rows.filter((e) => ge(e, a()))), f = E(() => Math.max(1, n(c).filter((e) => e.month >= a().from && e.month <= a().to).length)), m = E(() => [..._e(n(u), "Expenses")].filter(([, e]) => Math.abs(e) > .005).sort((e, t) => t[1] - e[1])), g = E(() => n(m).reduce((e, [, t]) => e + t, 0)), x = E(() => Math.max(1, ...n(m).map(([, e]) => e)));
	function O(e) {
		let t = n(c).filter((e) => e.month < a().from && e.month >= me(a().from, -6));
		return t.length ? t.reduce((t, n) => t + (n.by.get(e) ?? 0), 0) / t.length : 0;
	}
	let k = (e) => a({
		from: e,
		to: e,
		name: (/* @__PURE__ */ new Date(`${e}-01T12:00:00`)).toLocaleDateString(void 0, {
			month: "long",
			year: "numeric"
		})
	});
	var A = on(), j = C(A), M = C(j);
	b(M, 21, () => i.periods, (e) => e.name, (e, r) => {
		var i = Zt();
		let o;
		var s = d(i, !0);
		S(() => {
			D(i, "aria-checked", a().name === n(r).name), o = y(i, 1, "svelte-qqjett", null, o, { on: a().name === n(r).name }), t(s, n(r).name);
		}), v("click", i, () => a(n(r))), p(e, i);
	}), J(M);
	var P = W(M, 2), F = (e) => {
		var n = Qt(), r = d(n, !0);
		S(() => t(r, a().name)), p(e, n);
	}, I = E(() => !i.periods.some((e) => e.name === a().name));
	h(P, (e) => {
		n(I) && e(F);
	}), J(j);
	var L = W(j, 2), R = C(L), B = C(R), V = W(B), U = d(V, !0), ee = W(V), G = (e) => {
		var t = $t();
		v("click", t, () => T(o, null)), p(e, t);
	};
	h(ee, (e) => {
		n(o) && e(G);
	}), J(R);
	var q = W(R, 2);
	{
		let e = E(() => n(o) ? i.color(n(o)) : "var(--accent)");
		Xt(q, {
			get months() {
				return n(l);
			},
			format: s,
			get fill() {
				return n(e);
			},
			get selected() {
				return a();
			},
			onpick: k
		});
	}
	J(L);
	var Y = W(L, 2), X = C(Y), ne = C(X), re = W(ne), ie = d(re, !0);
	J(X);
	var ae = W(X, 2);
	b(ae, 21, () => n(m), ([e, t]) => e, (e, r) => {
		var a = E(() => H(n(r), 2));
		let c = () => n(a)[0], l = () => n(a)[1], m = E(() => O(c()) * n(f)), _ = E(() => n(o) === c());
		var w = rn();
		let k;
		var A = C(w), j = C(A);
		let M;
		var N = W(j, 2), P = d(N, !0), F = W(N, 2), I = C(F);
		let L;
		var R = W(I), z = (e) => {
			var t = en();
			let r;
			S((e, n) => {
				D(t, "title", `usual: ${e ?? ""}`), r = Z(t, "", r, { left: n });
			}, [() => s(n(m)), () => `${Math.min(100, n(m) / n(x) * 100)}%`]), p(e, t);
		};
		h(R, (e) => {
			n(m) > 0 && e(z);
		}), J(F);
		var B = W(F, 2), V = d(B, !0), U = W(B, 2), ee = d(U), G = W(U, 2);
		let q;
		var Y = d(G, !0);
		J(A);
		var X = W(A, 2), te = (e) => {
			var r = nn(), a = C(r), o = W(C(a));
			b(o, 21, () => ye(n(u), c()).slice(0, 12), (e) => e.payee, (e, r) => {
				var a = tn(), o = C(a), l = C(o), u = d(l, !0);
				J(o);
				var f = W(o), m = d(f, !0), h = W(f), g = d(h, !0);
				J(a), S((e) => {
					t(u, n(r).payee), t(m, n(r).count), t(g, e);
				}, [() => s(n(r).total)]), v("click", l, () => i.onshow(`${c().toLowerCase()} ${n(r).payee.toLowerCase().split(/\s+/)[0]}`)), p(e, a);
			}), J(o), J(a);
			var l = W(a, 2), f = d(l);
			J(r), S((e) => t(f, `All ${e ?? ""} transactions`), [() => K(c())]), v("click", l, () => i.onshow(c().toLowerCase())), p(e, r);
		};
		h(X, (e) => {
			n(_) && e(te);
		}), J(w), S((e, r, i, a, o, s) => {
			k = y(w, 1, "svelte-qqjett", null, k, { open: n(_) }), D(A, "aria-expanded", n(_)), M = Z(j, "", M, { background: e }), t(P, r), L = Z(I, "", L, {
				width: `${l() / n(x) * 100}%`,
				background: i
			}), t(V, a), t(ee, `${o ?? ""}%`), q = y(G, 1, "vs svelte-qqjett", null, q, {
				up: n(m) > 0 && l() > n(m) * 1.15,
				down: n(m) > 0 && l() < n(m) * .85
			}), t(Y, s);
		}, [
			() => i.color(c()),
			() => K(c()),
			() => i.color(c()),
			() => s(l()),
			() => Math.round(l() / (n(g) || 1) * 100),
			() => n(m) > 0 ? `${l() >= n(m) ? "+" : "−"}${s(Math.abs(l() - n(m)), !0)} vs usual` : "new"
		]), v("click", A, () => T(o, n(_) ? null : c(), !0)), p(e, w);
	}, (e) => {
		var t = an();
		p(e, t);
	}), J(ae), J(Y), J(A), S((e, r, i) => {
		t(B, `${e ?? ""} by month `), t(U, n(o) ? "" : "click a month to look at it"), t(ne, `${a().name ?? ""}: ${r ?? ""} spent `), t(ie, i);
	}, [
		() => n(o) ? K(n(o)) : "Spending",
		() => s(n(g)),
		() => n(f) > 1 ? `· ${s(n(g) / n(f))} a month` : ""
	]), p(r, A), _();
}
f(["click"]);
//#endregion
//#region plugins/beta/finance/ui/src/Review.svelte
var ln = g("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button></div></div>"), un = g("<div class=\"atlas-empty\">Reading the journal…</div>"), dn = g("<div class=\"atlas-empty\">Nothing to review.</div>"), fn = g("<span class=\"faint svelte-12excp\"> </span>"), pn = g("<button> </button>"), mn = g("<button title=\"c: choose the category\"> </button>"), hn = g("<button class=\"atlas-btn\" title=\"a\"> </button>"), gn = g("<!> <button class=\"atlas-btn primary\" title=\"Enter\">Accept</button>", 1), _n = g("<div class=\"why faint svelte-12excp\"> </div>"), vn = g("<span><span class=\"faint svelte-12excp\"> </span> </span>"), yn = g("<span class=\"faint bank svelte-12excp\"> </span>"), bn = g("<div role=\"option\" tabindex=\"-1\"><div class=\"line1 svelte-12excp\"><span class=\"date svelte-12excp\"> </span> <span class=\"payee svelte-12excp\"> </span> <!> <span class=\"grow svelte-12excp\"></span> <!> <!></div> <!> <div class=\"posts svelte-12excp\"><!> <!></div></div>"), xn = g("<div class=\"keys svelte-12excp\"><kbd class=\"svelte-12excp\">j</kbd><kbd class=\"svelte-12excp\">k</kbd> move · <kbd class=\"svelte-12excp\">Enter</kbd> accept · <kbd class=\"svelte-12excp\">a</kbd> accept all like it · <kbd class=\"svelte-12excp\">c</kbd> category · <kbd class=\"svelte-12excp\">s</kbd> split · <kbd class=\"svelte-12excp\">o</kbd> </div> <!>", 1), Sn = g("<div class=\"review svelte-12excp\" role=\"listbox\" aria-label=\"Transactions to review\" tabindex=\"0\"><!></div>"), Cn = {
	hash: "svelte-12excp",
	code: ".review.svelte-12excp {outline:none;display:grid;grid-template-columns:minmax(0, 1fr);gap:4px;}.keys.svelte-12excp {color:var(--text-faint);font-size:0.9em;margin-bottom:6px;}kbd.svelte-12excp {font-family:var(--font-mono);font-size:0.85em;padding:0 4px;border:1px solid var(--border);border-radius:3px;margin-right:2px;}.txn.svelte-12excp {padding:8px 10px;border-radius:var(--radius);border:1px solid transparent;}.txn.svelte-12excp:hover {background:var(--bg-hover);}.txn.sel.svelte-12excp {border-color:var(--accent);background:var(--accent-soft);}.line1.svelte-12excp {display:flex;align-items:center;gap:10px;min-height:26px;}.date.svelte-12excp {color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap;}.payee.svelte-12excp {font-weight:600;white-space:nowrap;}.line1.svelte-12excp > .faint:where(.svelte-12excp) {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}.bank.svelte-12excp {font-style:italic;}.grow.svelte-12excp {flex:1;}.faint.svelte-12excp {color:var(--text-faint);}.cat.svelte-12excp {all:unset;cursor:pointer;padding:2px 10px;border-radius:999px;background:var(--bg-hover);color:var(--text-muted);}.cat.unknown.svelte-12excp {box-shadow:inset 0 0 0 1px var(--yellow);}.cat.guess.svelte-12excp {box-shadow:inset 0 0 0 1px var(--accent);font-style:italic;}.cat.guess.sure.svelte-12excp {font-style:normal;}.why.svelte-12excp {font-size:0.85em;margin:2px 0 0;}.cat.svelte-12excp:hover {color:var(--text);}.posts.svelte-12excp {display:flex;flex-wrap:wrap;gap:4px 16px;font-size:0.92em;font-variant-numeric:tabular-nums;margin-top:2px;}"
};
function wn(r, i) {
	e(i, !0), te(r, Cn);
	let o = w(u([])), c = w(0), l = w(""), f = w(!0), m = w(void 0);
	async function g() {
		try {
			let e = await I(i.atlas, "review");
			T(o, e.transactions.slice().reverse(), !0), T(c, Math.min(n(c), Math.max(n(o).length - 1, 0)), !0), T(l, "");
		} catch (e) {
			T(l, e.message, !0);
		}
		T(f, !1);
	}
	g();
	let x = (e) => e.match(/\bC: (.*)$/)?.[1] ?? e, O = (e) => e.postings.find((e) => /^(Expenses|Income):Unknown$/.test(e.account)) ?? e.postings.find((e) => !/^(Assets|Liabilities)(:|$)/.test(e.account)), k = (e) => {
		let t = O(e);
		return t && /:Unknown$/.test(t.account) && e.guess ? {
			from: t.account,
			to: e.guess.to
		} : {};
	};
	async function A(e, t, r = !1) {
		try {
			return await I(i.atlas, "review_edit", {
				path: e.path,
				line: e.line,
				text: e.text,
				accept: !0,
				...t
			}), T(o, n(o).filter((t) => t !== e), !0), T(c, Math.min(n(c), Math.max(n(o).length - 1, 0)), !0), r || i.onchange(), !0;
		} catch (e) {
			return i.atlas.toast("Not changed", e.message, "error"), g(), !1;
		}
	}
	function j(e) {
		let t = O(e)?.account;
		if (!t) return;
		let n = e.postings.map((e) => e.amount?.split(" ")[1]).find(Boolean) ?? "EUR";
		i.atlas.pick({
			placeholder: `Split ${e.payee}: Account amount, Account (the last takes the rest)`,
			tag: "Finance",
			items: [],
			typed: (e) => `Split into ${e}`,
			onpick: (r) => {
				let a;
				try {
					a = r.split(",").map((e) => e.trim()).filter(Boolean).map((e) => {
						let t = e.match(/^(\S+)(?:\s+(-?[\d.,]+)(?:\s+([A-Z]{3}))?)?$/);
						if (!t) throw Error(`“${e}”: write Account amount`);
						return [t[1].includes(":") ? t[1] : `Expenses:${t[1]}`, t[2] ? `${t[2].replace(",", ".")} ${t[3] ?? n}` : null];
					});
				} catch (e) {
					i.atlas.toast("Not split", e.message, "error");
					return;
				}
				I(i.atlas, "review_edit", {
					path: e.path,
					line: e.line,
					text: e.text,
					from: t,
					split: a
				}).then(() => {
					g(), i.onchange();
				}, (e) => i.atlas.toast("Not split", e.message, "error"));
			}
		});
	}
	let M = (e) => {
		let t = (e) => [
			e.payee.toLowerCase(),
			O(e)?.account,
			k(e).to
		].join("|");
		return n(o).filter((n) => t(n) === t(e));
	};
	async function N(e) {
		let t = M(e);
		for (let e of t) if (!await A(e, k(e), !0)) break;
		i.onchange(), i.atlas.toast("Accepted", `${t.length} × ${e.payee}`);
	}
	function P(e) {
		let t = O(e)?.account;
		if (!t) return i.atlas.toast("Nothing to categorize", "every posting of this transaction is an account");
		let n = t.split(":")[0], r = i.known.filter((e) => e.startsWith(`${n}:`) && !e.endsWith(":Unknown")).map((e) => ({
			value: e,
			title: K(e),
			detail: e
		}));
		i.atlas.pick({
			placeholder: `Category for ${e.payee}`,
			tag: "Finance",
			items: r,
			typed: (e) => `New category “${e.includes(":") ? e : `${n}:${e}`}”`,
			onpick: (r) => void A(e, {
				from: t,
				to: r.includes(":") ? r : `${n}:${r}`
			})
		});
	}
	function F(e) {
		if (e.ctrlKey || e.metaKey || e.altKey || !n(o).length) return;
		let t = n(o)[n(c)], r = (e) => {
			T(c, Math.max(0, Math.min(n(o).length - 1, e)), !0), n(m)?.querySelectorAll(".txn")[n(c)]?.scrollIntoView({ block: "nearest" });
		};
		if (e.key === "j" || e.key === "ArrowDown") r(n(c) + 1);
		else if (e.key === "k" || e.key === "ArrowUp") r(n(c) - 1);
		else if (e.key === "Enter") A(t, k(t));
		else if (e.key === "a") N(t);
		else if (e.key === "s") j(t);
		else if (e.key === "c") P(t);
		else if (e.key === "o") i.atlas.open(t.path, t.line);
		else return;
		e.preventDefault();
	}
	var L = { load: g }, R = Sn(), z = C(R), B = (e) => {
		var r = ln(), i = C(r, !0), a = W(i), o = d(a);
		J(r), S(() => t(i, n(l))), v("click", o, g), p(e, r);
	}, V = (e) => {
		var t = un();
		p(e, t);
	}, U = (e) => {
		var t = dn();
		p(e, t);
	}, G = (e) => {
		var r = xn(), i = s(r), l = W(C(i), 12);
		J(i);
		var u = W(i, 2);
		b(u, 19, () => n(o), (e) => e.path + e.line, (e, r, i) => {
			let o = E(() => O(n(r)));
			var l = bn();
			let u;
			var f = C(l), m = C(f), g = d(m, !0), _ = W(m, 2), w = d(_, !0), j = W(_, 2), F = (e) => {
				var i = fn(), a = d(i, !0);
				S(() => t(a, n(r).narration)), p(e, i);
			};
			h(j, (e) => {
				n(r).narration && e(F);
			});
			var I = W(j, 4), L = (e) => {
				var i = pn();
				let a;
				var o = d(i);
				S((e) => {
					a = y(i, 1, "cat guess svelte-12excp", null, a, { sure: n(r).guess.sure }), D(i, "title", `${n(r).guess.why ?? ""} — Enter takes it, c chooses another`), t(o, `${e ?? ""}?`);
				}, [() => K(n(r).guess.to)]), v("click", i, () => P(n(r))), p(e, i);
			}, R = E(() => n(o) && n(o).account.endsWith(":Unknown") && n(r).guess), z = (e) => {
				var i = mn();
				let a;
				var s = d(i, !0);
				S((e, n) => {
					a = y(i, 1, "cat svelte-12excp", null, a, { unknown: e }), t(s, n);
				}, [() => n(o).account.endsWith(":Unknown"), () => K(n(o).account)]), v("click", i, () => P(n(r))), p(e, i);
			};
			h(I, (e) => {
				n(R) ? e(L) : n(o) && e(z, 1);
			});
			var B = W(I, 2), V = (e) => {
				let i = E(() => M(n(r)).length);
				var a = gn(), o = s(a), c = (e) => {
					var a = hn(), o = d(a);
					S(() => t(o, `All ${n(i) ?? ""}`)), v("click", a, () => N(n(r))), p(e, a);
				};
				h(o, (e) => {
					n(i) > 1 && e(c);
				});
				var l = W(o, 2);
				v("click", l, () => A(n(r), k(n(r)))), p(e, a);
			};
			h(B, (e) => {
				n(i) === n(c) && e(V);
			}), J(f);
			var U = W(f, 2), ee = (e) => {
				var i = _n(), a = d(i, !0);
				S(() => t(a, n(r).guess.why)), p(e, i);
			}, G = E(() => n(i) === n(c) && n(r).guess && n(o)?.account.endsWith(":Unknown"));
			h(U, (e) => {
				n(G) && e(ee);
			});
			var q = W(U, 2), Y = C(q);
			b(Y, 17, () => n(r).postings.filter((e) => e !== n(o) || e.amount), a, (e, r) => {
				var i = vn(), a = C(i), o = d(a, !0), s = W(a);
				J(i), S((e) => {
					t(o, e), t(s, ` ${n(r).amount ?? "" ?? ""}`);
				}, [() => K(n(r).account)]), p(e, i);
			});
			var X = W(Y, 2);
			b(X, 17, () => n(r).meta.filter(([e]) => e === "bank"), a, (e, r) => {
				var i = E(() => H(n(r), 2));
				let a = () => n(i)[1];
				var o = yn(), s = d(o);
				S((e) => {
					D(o, "title", a()), t(s, `“${e ?? ""}”`);
				}, [() => x(a())]), p(e, o);
			}), J(q), J(l), S(() => {
				u = y(l, 1, "txn svelte-12excp", null, u, { sel: n(i) === n(c) }), D(l, "aria-selected", n(i) === n(c)), t(g, n(r).date), t(w, n(r).payee);
			}), v("click", l, () => T(c, n(i), !0)), p(e, l);
		}), S(() => t(l, ` open in the journal · ${n(o).length ?? ""} left`)), p(e, r);
	};
	return h(z, (e) => {
		n(l) ? e(B) : n(f) ? e(V, 1) : n(o).length ? e(G, -1) : e(U, 2);
	}), J(R), ee(R, (e) => T(m, e), () => n(m)), v("keydown", R, F), p(r, R), _(L);
}
f(["keydown", "click"]);
//#endregion
//#region plugins/beta/finance/ui/src/Budget.svelte
var Tn = g("<span class=\"faint svelte-48f9vs\">*</span>"), En = g("<div class=\"mrow svelte-48f9vs\"><span class=\"mname svelte-48f9vs\"> </span> <span class=\"pair svelte-48f9vs\"><span class=\"in svelte-48f9vs\"></span><span class=\"in hatch svelte-48f9vs\"></span> <br/> <span class=\"out svelte-48f9vs\"></span><span class=\"out hatch svelte-48f9vs\"></span></span> <span> <!></span></div>"), Dn = g("<button class=\"rec svelte-48f9vs\"><span class=\"payee svelte-48f9vs\"> <span class=\"faint svelte-48f9vs\"> </span></span> <span> <span class=\"faint svelte-48f9vs\"> </span></span> <span class=\"next faint svelte-48f9vs\"> </span></button>"), On = g("<div class=\"atlas-empty\">Nothing comes back regularly yet: three payments at a steady period and amount make a recurring one.</div>"), kn = g("<div class=\"grid svelte-48f9vs\"><section class=\"card wide svelte-48f9vs\"><!></section> <section class=\"card svelte-48f9vs\"><h3 class=\"svelte-48f9vs\">Saved per month <span class=\"faint svelte-48f9vs\">income − spending, the uncategorised drawn hatched</span></h3> <!> <div class=\"faint legend svelte-48f9vs\"><span class=\"sw in svelte-48f9vs\"></span> income <span class=\"sw out svelte-48f9vs\"></span> spending · * counting the uncategorised as income and spending</div></section> <section class=\"card svelte-48f9vs\"><h3 class=\"svelte-48f9vs\">Recurring <span class=\"faint svelte-48f9vs\"> <!></span></h3> <!></section></div>"), An = {
	hash: "svelte-48f9vs",
	code: ".grid.svelte-48f9vs {display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:14px;}.card.svelte-48f9vs {background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;min-width:0;}.wide.svelte-48f9vs {grid-column:1 / -1;}h3.svelte-48f9vs {margin:0 0 10px;font-size:0.82em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);font-weight:600;}.faint.svelte-48f9vs {color:var(--text-faint);font-weight:400;text-transform:none;letter-spacing:0;}.mrow.svelte-48f9vs {display:grid;grid-template-columns:5.5em 1fr 5em;gap:8px;align-items:center;padding:2px 0;}.mname.svelte-48f9vs {color:var(--text-muted);font-variant-numeric:tabular-nums;}.pair.svelte-48f9vs {line-height:0;}.pair.svelte-48f9vs span:where(.svelte-48f9vs) {display:inline-block;height:6px;vertical-align:top;}.in.svelte-48f9vs {background:var(--green);opacity:0.8;border-radius:3px 0 0 3px;}.out.svelte-48f9vs {background:var(--accent);opacity:0.8;border-radius:3px 0 0 3px;}.hatch.svelte-48f9vs {opacity:0.35;border-radius:0 3px 3px 0;background-image:repeating-linear-gradient(45deg, transparent 0 2px, var(--bg-elev) 2px 4px);}.rate.svelte-48f9vs {text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}.rate.neg.svelte-48f9vs {color:var(--red);}.legend.svelte-48f9vs {margin-top:8px;font-size:0.85em;}.sw.svelte-48f9vs {display:inline-block;width:10px;height:6px;border-radius:2px;margin:0 2px 0 6px;}.rec.svelte-48f9vs {all:unset;cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:0 10px;padding:5px 8px;border-radius:var(--radius-sm);}.rec.svelte-48f9vs:hover {background:var(--bg-hover);}.payee.svelte-48f9vs {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.num.svelte-48f9vs {text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}.num.income.svelte-48f9vs {color:var(--green);}.next.svelte-48f9vs {grid-column:1 / -1;font-size:0.85em;}"
};
function jn(r, i) {
	e(i, !0), te(r, An);
	function a(e) {
		let t = Math.round(j(e.usual)), n = [{
			value: `${t} ${i.cur}`,
			title: `${z(t, i.cur, { whole: !0 })}, the usual month`,
			detail: "pin it as it is"
		}, ...e.target ? [{
			value: "",
			title: "Unpin",
			detail: `back to the usual month (${z(t, i.cur, { whole: !0 })})`
		}] : []];
		i.atlas.pick({
			placeholder: `Monthly target for ${K(e.account)} (e.g. 250)`,
			tag: "Finance",
			items: n,
			typed: (e) => `Pin ${/[A-Za-z]/.test(e) ? e : `${e} ${i.cur}`} a month`,
			onpick: async (t) => {
				let n = t && !/[A-Za-z]/.test(t) ? `${t} ${i.cur}` : t;
				try {
					let t = await I(i.atlas, "set_target", {
						account: e.account,
						target: n
					});
					i.atlas.toast(n ? "Target pinned" : "Target unpinned", `${K(e.account)}: ${n || "the usual month"} (${t.path})`), i.onchange();
				} catch (e) {
					i.atlas.toast("Not pinned", e.message, "error");
				}
			}
		});
	}
	let o = E(() => i.budget.months.slice(0, 12)), s = E(() => Math.max(1, ...n(o).map((e) => Math.max(j(e.income) + j(e.unknown_in), j(e.spent) + j(e.unknown_out))))), c = E(() => i.budget.recurring.filter((e) => j(e.per_month) > 0).reduce((e, t) => e + j(t.per_month), 0)), u = E(() => -i.budget.recurring.filter((e) => j(e.per_month) < 0).reduce((e, t) => e + j(t.per_month), 0)), f = (e) => e.rate ?? e.rate_all;
	var m = kn(), g = C(m), x = C(g);
	q(x, {
		get budget() {
			return i.budget;
		},
		get cur() {
			return i.cur;
		},
		onpin: a
	}), J(g);
	var w = W(g, 2), T = W(C(w), 2);
	b(T, 17, () => n(o), (e) => e.month, (e, r) => {
		let a = E(() => j(n(r).income)), o = E(() => j(n(r).spent)), c = E(() => f(n(r)));
		var l = En(), u = C(l), m = d(u, !0), g = W(u, 2), _ = C(g);
		let v;
		var b = W(_);
		let x;
		var w = W(b, 4);
		let T;
		var O = W(w);
		let k;
		J(g);
		var A = W(g, 2);
		let M;
		var N = C(A, !0), P = W(N), F = (e) => {
			var t = Tn();
			p(e, t);
		};
		h(P, (e) => {
			n(r).rate === null && n(r).rate_all !== null && e(F);
		}), J(A), J(l), S((e, i, c, u, d, f, p, h, g) => {
			D(l, "title", `${e ?? ""}: income ${i ?? ""} (+${c ?? ""} uncategorised), spent ${u ?? ""} (+${d ?? ""} uncategorised)`), t(m, n(r).month), v = Z(_, "", v, { width: `${100 * n(a) / n(s)}%` }), x = Z(b, "", x, { width: f }), T = Z(w, "", T, { width: `${100 * n(o) / n(s)}%` }), k = Z(O, "", k, { width: p }), M = y(A, 1, "rate svelte-48f9vs", null, M, { neg: h }), t(N, g);
		}, [
			() => Y(n(r).month),
			() => z(n(a), i.cur),
			() => z(j(n(r).unknown_in), i.cur),
			() => z(n(o), i.cur),
			() => z(j(n(r).unknown_out), i.cur),
			() => `${100 * j(n(r).unknown_in) / n(s)}%`,
			() => `${100 * j(n(r).unknown_out) / n(s)}%`,
			() => n(c) !== null && j(n(c)) < 0,
			() => n(c) === null ? "—" : `${Math.round(j(n(c)) * 100)} %`
		]), p(e, l);
	}), M(2), J(w);
	var O = W(w, 2), k = C(O), A = W(C(k)), N = C(A), P = W(N), F = (e) => {
		var r = l();
		S((e) => t(r, `, ${e ?? ""} in`), [() => z(n(u), i.cur, { whole: !0 })]), p(e, r);
	};
	h(P, (e) => {
		n(u) > 0 && e(F);
	}), J(A), J(k);
	var L = W(k, 2);
	b(L, 17, () => i.budget.recurring, (e) => e.path + e.line, (e, r) => {
		var a = Dn(), o = C(a), s = C(o, !0), c = W(s), l = d(c);
		J(o);
		var u = W(o, 2);
		let f;
		var m = C(u, !0), h = W(m), g = d(h);
		J(u);
		var _ = W(u, 2), b = d(_);
		J(a), S((e, i, o) => {
			D(a, "title", `${n(r).count ?? ""} times, last ${n(r).last ?? ""}`), t(s, n(r).payee), t(l, `· ${e ?? ""}`), f = y(u, 1, "num svelte-48f9vs", null, f, { income: i }), t(m, o), t(g, ` ${n(r).period ?? ""}`), t(b, `next ${n(r).next ?? ""}`);
		}, [
			() => K(n(r).account),
			() => j(n(r).amount) < 0,
			() => z(Math.abs(j(n(r).amount)), i.cur)
		]), v("click", a, () => i.atlas.open(n(r).path, n(r).line)), p(e, a);
	}, (e) => {
		var t = On();
		p(e, t);
	}), J(O), J(m), S((e) => t(N, `${e ?? ""} a month out`), [() => z(n(c), i.cur, { whole: !0 })]), p(r, m), _();
}
f(["click"]);
//#endregion
//#region plugins/beta/finance/ui/src/Invest.svelte
var Mn = g("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button></div></div>"), Nn = g("<div class=\"atlas-empty\">Reading the lots…</div>"), Pn = g("<tr><td class=\"svelte-aqy484\"> </td><td class=\"num svelte-aqy484\"> </td><td class=\"num svelte-aqy484\"> </td></tr>"), Fn = g("<table class=\"lots svelte-aqy484\"><thead><tr><th class=\"svelte-aqy484\">bought</th><th class=\"num svelte-aqy484\">units</th><th class=\"num svelte-aqy484\">cost</th></tr></thead><tbody></tbody></table>"), In = g("<button class=\"hold svelte-aqy484\"><span class=\"name\"> <span class=\"faint svelte-aqy484\"> </span></span> <span class=\"num svelte-aqy484\"> </span> <span class=\"num svelte-aqy484\"> </span> <span> </span> <span class=\"faint small svelte-aqy484\"> </span></button> <!>", 1), Ln = g("<div class=\"atlas-empty\">Nothing held in lots now (funds, stocks). Gains realised before are below.</div>"), Rn = g("<span><b> </b> </span>"), zn = g("<div class=\"realised svelte-aqy484\"><!><span class=\"faint svelte-aqy484\">realised gains (the booked Income:Gains)</span></div>"), Bn = g("<div class=\"plot svelte-aqy484\"></div>"), Vn = g("<div class=\"fx svelte-aqy484\"><div class=\"fxhead svelte-aqy484\"><span class=\"name\"><b> </b></span> <span class=\"num svelte-aqy484\"> </span> <span class=\"faint svelte-aqy484\"> </span> <span> </span></div> <!></div>"), Hn = g("<div class=\"atlas-empty\"> </div>"), Un = g("<span><b> </b> <span class=\"faint svelte-aqy484\"> </span></span>"), Wn = g("<div class=\"grid svelte-aqy484\"><section class=\"card tiles wide svelte-aqy484\"><div class=\"tile svelte-aqy484\"><span class=\"n svelte-aqy484\"> </span><span>held in lots</span></div> <div class=\"tile svelte-aqy484\"><span> </span><span>unrealised</span></div> <div class=\"tile svelte-aqy484\"><span> </span><span>realised, all years</span></div> <div class=\"tile svelte-aqy484\"><span class=\"n svelte-aqy484\"> </span><span>a year (XIRR, money-weighted)</span></div></section> <section class=\"card wide svelte-aqy484\"><h3 class=\"svelte-aqy484\">Holdings</h3> <!> <!></section> <section class=\"card wide svelte-aqy484\"><h3 class=\"svelte-aqy484\">Currencies <span class=\"faint svelte-aqy484\"> </span></h3> <!></section> <section class=\"card wide svelte-aqy484\"><h3 class=\"svelte-aqy484\">Prices <span class=\"faint svelte-aqy484\">finance/prices/, kept sparse; fetched daily</span></h3> <div class=\"quotes svelte-aqy484\"></div> <button class=\"atlas-btn\"> </button></section></div>"), Gn = {
	hash: "svelte-aqy484",
	code: ".grid.svelte-aqy484 {display:grid;grid-template-columns:repeat(auto-fit, minmax(340px, 1fr));gap:14px;}.card.svelte-aqy484 {background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;min-width:0;}.wide.svelte-aqy484 {grid-column:1 / -1;}h3.svelte-aqy484 {margin:0 0 10px;font-size:0.82em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);font-weight:600;}.faint.svelte-aqy484 {color:var(--text-faint);font-weight:400;text-transform:none;letter-spacing:0;}.small.svelte-aqy484 {font-size:0.85em;}.tiles.svelte-aqy484 {display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:10px;}.tile.svelte-aqy484 {display:flex;flex-direction:column;gap:2px;padding:4px 6px;color:var(--text-muted);}.tile.svelte-aqy484 .n:where(.svelte-aqy484) {font-size:1.5em;font-weight:650;color:var(--text);font-variant-numeric:tabular-nums;}.pos.svelte-aqy484 {color:var(--green) !important;}.neg.svelte-aqy484 {color:var(--red) !important;}.hold.svelte-aqy484 {all:unset;cursor:pointer;display:grid;grid-template-columns:1fr auto auto 7em;gap:2px 14px;padding:6px 8px;border-radius:var(--radius-sm);width:100%;box-sizing:border-box;}.hold.svelte-aqy484:hover {background:var(--bg-hover);}.hold.svelte-aqy484 .small:where(.svelte-aqy484) {grid-column:1 / -1;}.num.svelte-aqy484 {text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}.lots.svelte-aqy484 {margin:0 0 8px 16px;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:0.92em;}.lots.svelte-aqy484 th:where(.svelte-aqy484) {text-align:left;font-weight:500;color:var(--text-faint);padding:2px 10px;}.lots.svelte-aqy484 td:where(.svelte-aqy484) {padding:2px 10px;border-top:1px solid var(--border);}.realised.svelte-aqy484 {display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:8px;font-variant-numeric:tabular-nums;}.fx.svelte-aqy484 {padding:4px 0 10px;border-bottom:1px solid var(--border);}.fx.svelte-aqy484:last-child {border-bottom:0;}.fxhead.svelte-aqy484 {display:flex;flex-wrap:wrap;gap:6px 18px;align-items:baseline;}.plot.svelte-aqy484 {margin-top:8px;max-width:980px;}.quotes.svelte-aqy484 {display:flex;flex-wrap:wrap;gap:4px 18px;margin-bottom:10px;font-variant-numeric:tabular-nums;}\n  @media (max-width: 700px) {.hold.svelte-aqy484 {grid-template-columns:1fr auto;} }"
};
function Kn(o, c) {
	e(c, !0), te(o, Gn);
	let l = w(null), u = w(""), f = w(!1), g = w(null);
	async function x() {
		try {
			T(l, await I(c.atlas, "invest"), !0), T(u, "");
		} catch (e) {
			T(u, e.message, !0);
		}
	}
	x();
	async function O() {
		T(f, !0);
		try {
			let e = await I(c.atlas, "prices", {});
			c.atlas.toast("Prices", e.errors.length ? `${e.summary}: ${e.errors.join("; ")}` : e.summary, e.errors.length ? "error" : void 0), await x();
		} catch (e) {
			c.atlas.toast("Prices not fetched", e.message, "error");
		} finally {
			T(f, !1);
		}
	}
	let k = E(() => n(l)?.holdings.reduce((e, t) => e + j(t.value), 0) ?? 0), A = E(() => n(l)?.holdings.reduce((e, t) => e + j(t.cost), 0) ?? 0), N = E(() => n(l)?.realised.reduce((e, t) => e + j(t.gain), 0) ?? 0), P = (e) => Number(e).toLocaleString(void 0, { maximumFractionDigits: 6 }), F = (e) => Math.round((Date.now() - (/* @__PURE__ */ new Date(`${e}T12:00:00`)).getTime()) / 864e5);
	function L(e, t) {
		let n = t.map((e, n) => n - (t.length - 1));
		return { destroy: c.atlas.plot(e, {
			x: n,
			ys: [t.map(([, e]) => j(e))],
			xLabel: `months before ${t.at(-1)?.[0] ?? ""}`,
			yLabels: [c.cur]
		}) };
	}
	var R = { load: x }, B = m(), V = s(B), H = (e) => {
		var r = Mn(), i = C(r, !0), a = W(i), o = d(a);
		J(r), S(() => t(i, n(u))), v("click", o, x), p(e, r);
	}, U = (e) => {
		var t = Nn();
		p(e, t);
	}, ee = (e) => {
		var o = Wn(), u = C(o), _ = C(u), x = C(_), w = d(x, !0);
		M(), J(_);
		var E = W(_, 2), I = C(E);
		let R;
		var B = d(I, !0);
		M(), J(E);
		var V = W(E, 2), H = C(V);
		let U;
		var ee = d(H, !0);
		M(), J(V);
		var G = W(V, 2), q = C(G), Y = d(q, !0);
		M(), J(G), J(u);
		var X = W(u, 2), te = W(C(X), 2);
		b(te, 17, () => n(l).holdings, (e) => e.account + e.commodity, (e, r) => {
			var i = In(), o = s(i), l = C(o), u = C(l, !0), f = W(u), m = d(f);
			J(l);
			var _ = W(l, 2), x = d(_), w = W(_, 2), E = d(w, !0), D = W(w, 2);
			let O;
			var k = d(D, !0), A = W(D, 2), M = d(A, !0);
			J(o);
			var N = W(o, 2), I = (e) => {
				var i = Fn(), o = W(C(i));
				b(o, 21, () => n(r).lots, a, (e, r) => {
					var i = Pn(), a = C(i), o = d(a, !0), s = W(a), c = d(s, !0), l = W(s), u = d(l, !0);
					J(i), S((e) => {
						t(o, n(r).date), t(c, e), t(u, n(r).cost ?? "unknown");
					}, [() => P(n(r).units)]), p(e, i);
				}), J(o), J(i), p(e, i);
			};
			h(N, (e) => {
				n(g) === n(r).commodity && e(I);
			}), S((e, i, a, o, s, c, l) => {
				t(u, n(r).name ?? n(r).commodity), t(m, `· ${e ?? ""}`), t(x, `${i ?? ""} ${n(r).commodity ?? ""}`), t(E, a), O = y(D, 1, "num svelte-aqy484", null, O, {
					neg: o,
					pos: s
				}), t(k, c), t(M, l);
			}, [
				() => K(n(r).account),
				() => P(n(r).units),
				() => n(r).value ? z(j(n(r).value), c.cur) : "no price",
				() => j(n(r).gain) < 0,
				() => j(n(r).gain) > 0,
				() => n(r).gain ? z(j(n(r).gain), c.cur, { sign: !0 }) : "",
				() => n(r).price ? `${j(n(r).price.price)} ${c.cur} on ${n(r).price.date}${F(n(r).price.date) > 7 ? ` (${F(n(r).price.date)} days old)` : ""}` : "no price: Update prices"
			]), v("click", o, () => T(g, n(g) === n(r).commodity ? null : n(r).commodity, !0)), p(e, i);
		}, (e) => {
			var t = Ln();
			p(e, t);
		});
		var Z = W(te, 2), ne = (e) => {
			var r = zn(), i = C(r);
			b(i, 17, () => n(l).realised, (e) => e.year, (e, r) => {
				var i = Rn(), a = C(i), o = d(a, !0), s = W(a);
				J(i), S((e) => {
					t(o, n(r).year), t(s, ` ${e ?? ""}`);
				}, [() => z(j(n(r).gain), c.cur, { sign: !0 })]), p(e, i);
			}), M(), J(r), p(e, r);
		};
		h(Z, (e) => {
			n(l).realised.length && e(ne);
		}), J(X);
		var re = W(X, 2), ie = C(re), ae = W(C(ie)), Q = d(ae);
		J(ie);
		var oe = W(ie, 2);
		b(oe, 17, () => n(l).currencies, (e) => e.currency, (e, a) => {
			var o = Vn(), l = C(o), u = C(l), f = C(u), g = d(f, !0);
			J(u);
			var _ = W(u, 2), v = d(_, !0), b = W(_, 2), x = d(b, !0), w = W(b, 2);
			let T;
			var E = d(w, !0);
			J(l);
			var O = W(l, 2), k = (e) => {
				var t = m(), o = s(t);
				i(o, () => n(a).history, (e) => {
					var t = Bn();
					r(t, (e, t) => L?.(e, t), () => n(a).history), p(e, t);
				}), p(e, t);
			};
			h(O, (e) => {
				n(a).history.length > 1 && e(k);
			}), J(o), S((e, n, r, i, a, o) => {
				t(g, e), t(v, n), t(x, r), T = y(w, 1, "num svelte-aqy484", null, T, {
					neg: i,
					pos: a
				}), D(w, "title", `its value now against what each amount was worth in ${c.cur ?? ""} the day it came in`), t(E, o);
			}, [
				() => z(j(n(a).amount), n(a).currency),
				() => n(a).value ? z(j(n(a).value), c.cur) : "no rate yet",
				() => n(a).rate ? `1 ${n(a).currency} = ${j(n(a).rate).toFixed(4)} ${c.cur}` : "",
				() => j(n(a).fx_gain) < 0,
				() => j(n(a).fx_gain) > 0,
				() => n(a).fx_gain ? `${z(j(n(a).fx_gain), c.cur, { sign: !0 })} from the rate` : ""
			]), p(e, o);
		}, (e) => {
			var n = Hn(), r = d(n);
			S(() => t(r, `Everything is in ${c.cur ?? ""}.`)), p(e, n);
		}), J(re);
		var se = W(re, 2), ce = W(C(se), 2);
		b(ce, 21, () => n(l).prices, (e) => e.base + e.quote, (e, r) => {
			var i = Un(), a = C(i), o = d(a, !0), s = W(a), c = W(s), l = d(c, !0);
			J(i), S((e) => {
				D(i, "title", `${n(r).base ?? ""} in ${n(r).quote ?? ""}`), t(o, n(r).base), t(s, ` ${e ?? ""} ${n(r).quote ?? ""} `), t(l, n(r).date);
			}, [() => j(n(r).price).toLocaleString(void 0, { maximumFractionDigits: 4 })]), p(e, i);
		}), J(ce);
		var le = W(ce, 2), $ = d(le, !0);
		J(se), J(o), S((e, r, i, a) => {
			t(w, e), R = y(I, 1, "n svelte-aqy484", null, R, {
				neg: n(k) - n(A) < 0,
				pos: n(k) - n(A) > 0
			}), t(B, r), U = y(H, 1, "n svelte-aqy484", null, U, { pos: n(N) > 0 }), t(ee, i), t(Y, a), t(Q, `money held in other currencies, in ${c.cur ?? ""}`), le.disabled = n(f), t($, n(f) ? "Fetching…" : "Update prices");
		}, [
			() => z(n(k), c.cur, { whole: !0 }),
			() => z(n(k) - n(A), c.cur, {
				sign: !0,
				whole: !0
			}),
			() => z(n(N), c.cur, {
				sign: !0,
				whole: !0
			}),
			() => n(l).xirr === null ? "—" : `${(n(l).xirr * 100).toFixed(1)} %`
		]), v("click", le, O), p(e, o);
	};
	return h(V, (e) => {
		n(u) ? e(H) : n(l) ? e(ee, -1) : e(U, 1);
	}), p(o, B), _(R);
}
f(["click"]);
//#endregion
//#region plugins/beta/finance/ui/src/Sources.svelte
var qn = g("<button class=\"atlas-btn\">Renew</button>"), Jn = g("<div class=\"atlas-notice error\"> </div>"), Yn = g("<div class=\"src svelte-er8fe7\"><button class=\"name svelte-er8fe7\"> <span class=\"faint svelte-er8fe7\"> </span></button> <span> </span> <span class=\"faint svelte-er8fe7\"> </span> <!> <div class=\"accts faint svelte-er8fe7\"> </div> <!></div>"), Xn = g("<div class=\"atlas-empty\"> </div>"), Zn = g("<option> </option>"), Qn = g("(<a target=\"_blank\" rel=\"noopener\">open it</a> if no tab appeared)", 1), $n = g("<div class=\"paste svelte-er8fe7\"><span> <!>. It comes back here by itself; if it does not, paste the address it ended on:</span> <input class=\"svelte-er8fe7\"/> <button class=\"atlas-btn primary\">Finish</button></div>"), er = g("<span class=\"faint svelte-er8fe7\"> </span>"), tr = g("<button class=\"site svelte-er8fe7\"><b> </b><!></button>"), nr = g("<p> <button class=\"atlas-btn\">Stop</button></p>"), rr = g("<p class=\"faint svelte-er8fe7\"> </p>"), ir = g("<section class=\"card wide svelte-er8fe7\"><h3 class=\"svelte-er8fe7\">From the bank's site <span class=\"faint svelte-er8fe7\"> </span></h3> <div class=\"sites svelte-er8fe7\"></div> <!> <!></section>"), ar = g(": <code class=\"svelte-er8fe7\"> </code>", 1), or = g("<div class=\"grid svelte-er8fe7\"><section class=\"card wide svelte-er8fe7\"><h3 class=\"svelte-er8fe7\">Banks <span class=\"faint svelte-er8fe7\">read through Enable Banking with your consent; on the server, four times a day at most</span></h3> <!> <div class=\"actions svelte-er8fe7\"><button class=\"atlas-btn primary\"> </button> <select aria-label=\"Country\" class=\"svelte-er8fe7\"></select> <button class=\"atlas-btn\"> </button></div> <!> <!></section> <!> <section class=\"card wide svelte-er8fe7\"><h3 class=\"svelte-er8fe7\">Enable Banking <span class=\"faint svelte-er8fe7\">what connecting needs</span></h3> <ol class=\"setup svelte-er8fe7\"><li>An application at <b>enablebanking.com</b> (free for your own accounts) and its id in <button class=\"link svelte-er8fe7\">Settings</button><!>.</li> <li>Its redirect address, the server's https address, in Settings too<!>.</li> <li>Its private key (the .pem the control panel gave): <button class=\"atlas-btn\"> </button> <span class=\"faint svelte-er8fe7\">kept as a secret of the plugin, outside the vault</span></li></ol> <p class=\"faint svelte-er8fe7\">Desjardins (Canada) has no such access yet: fetch its PDF statements from its site above.</p></section></div>"), sr = {
	hash: "svelte-er8fe7",
	code: ".grid.svelte-er8fe7 {display:grid;gap:14px;}.card.svelte-er8fe7 {background:var(--bg-elev);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;min-width:0;}h3.svelte-er8fe7 {margin:0 0 10px;font-size:0.82em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);font-weight:600;}.faint.svelte-er8fe7 {color:var(--text-faint);font-weight:400;text-transform:none;letter-spacing:0;}.bad.svelte-er8fe7 {color:var(--red);}.src.svelte-er8fe7 {display:flex;flex-wrap:wrap;gap:4px 16px;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--border);}.src.svelte-er8fe7 .name:where(.svelte-er8fe7) {all:unset;cursor:pointer;font-weight:600;}.accts.svelte-er8fe7 {flex-basis:100%;font-size:0.88em;}.actions.svelte-er8fe7, .paste.svelte-er8fe7 {display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px;}.paste.svelte-er8fe7 input:where(.svelte-er8fe7), select.svelte-er8fe7 {font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 8px;}.paste.svelte-er8fe7 input:where(.svelte-er8fe7) {flex:1;min-width:240px;}.setup.svelte-er8fe7 {margin:0;padding-left:1.4em;display:grid;gap:6px;}.setup.svelte-er8fe7 li.done:where(.svelte-er8fe7)::marker {color:var(--green);}.setup.svelte-er8fe7 li.done:where(.svelte-er8fe7) {color:var(--text-muted);}.link.svelte-er8fe7 {all:unset;cursor:pointer;color:var(--accent);}code.svelte-er8fe7 {font-size:0.9em;}.sites.svelte-er8fe7 {display:flex;flex-wrap:wrap;gap:8px;}.site.svelte-er8fe7 {all:unset;cursor:pointer;display:flex;flex-direction:column;gap:2px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);}.site.svelte-er8fe7:hover {background:var(--bg-hover);border-color:var(--accent);}.site.svelte-er8fe7 .faint:where(.svelte-er8fe7) {font-size:0.85em;}"
};
function cr(r, i) {
	e(i, !0), te(r, sr);
	let a = N(i, "assets", 19, () => []), o = w(null), l = w("ES"), f = w(u([])), m = w(null), g = w(""), x = w(""), O = w(""), k = E(() => String(i.atlas.plugin.settings.bank_app_id ?? "")), A = E(() => String(i.atlas.plugin.settings.bank_redirect ?? ""));
	c(() => {
		i.atlas.secrets.has("enable_banking_key").then((e) => T(o, e, !0)).catch(() => T(o, !1));
	});
	async function j(e, t) {
		T(x, e, !0), T(O, "");
		try {
			return await t();
		} catch (e) {
			T(O, e.message, !0);
		} finally {
			T(x, "");
		}
	}
	async function L() {
		let e = document.createElement("input");
		e.type = "file", e.accept = ".pem,.key,.txt", e.onchange = async () => {
			let t = e.files?.[0];
			if (!t) return;
			let n = await t.text();
			if (!/BEGIN (RSA )?PRIVATE KEY/.test(n)) {
				T(O, `${t.name} is not a PEM private key`);
				return;
			}
			await i.atlas.secrets.set("enable_banking_key", n.trim()), T(o, !0), i.atlas.toast("Key kept", "the application's private key is a secret of the finance plugin, outside the vault");
		}, e.click();
	}
	async function R() {
		let e = await j("list", () => I(i.atlas, "bank_list", { country: n(l) }));
		e && (T(f, e.banks, !0), i.atlas.pick({
			placeholder: `Bank in ${n(l)}`,
			tag: "Finance",
			items: n(f).map((e) => ({
				value: e.name,
				title: e.name,
				detail: e.days ? `consent up to ${e.days} days` : ""
			})),
			onpick: (e) => void B(e)
		}));
	}
	let z = w("");
	c(() => {
		let e = n(A) && i.atlas.signInReturned?.(n(A));
		e && (T(g, e, !0), V());
	});
	async function B(e) {
		let t = await j("connect", () => I(i.atlas, "bank_connect", {
			bank: e,
			country: n(l)
		}));
		if (!t?.url) return;
		T(m, {
			bank: e,
			country: n(l)
		}, !0), T(z, t.url, !0);
		let r = await i.atlas.signIn(t.url, n(A)).catch(() => "");
		r && (T(g, r, !0), await V());
	}
	async function V() {
		let e = n(g).trim();
		if (!e || n(x) === "finish") return;
		T(g, "");
		let t = await j("finish", () => I(i.atlas, "bank_finish", {
			address: e,
			...n(m) ?? {}
		}));
		T(m, null), T(z, ""), t && (i.atlas.toast("Connected", `${t.bank}: ${t.accounts} accounts, consent until ${t.until ?? "?"}`), i.onchange(), H(t.unlinked));
	}
	function H(e) {
		let [t, ...n] = e;
		t && i.atlas.pick({
			placeholder: `Which account is ${t.name ?? "this"}${t.currency ? ` (${t.currency})` : ""}${t.iban ? ` …${t.iban.slice(-4)}` : ""}?`,
			tag: "Finance",
			items: a().map((e) => ({
				value: e,
				title: e
			})),
			onpick: async (e) => {
				await j("link", () => I(i.atlas, "bank_link", {
					account: e,
					uid: t.uid
				})) !== void 0 && i.atlas.toast("Linked", `${t.name ?? t.uid} → ${e}`), H(n);
			}
		});
	}
	async function ee() {
		let e = await j("sync", () => I(i.atlas, "bank_sync", {}));
		e && (i.atlas.toast("Synced", e.summary ?? e.skipped ?? ""), i.onchange());
	}
	let G = w(u([])), K = w(null), q = w(null), Y = w(u([]));
	c(() => {
		I(i.atlas, "banks").then((e) => {
			T(G, e.banks, !0), T(K, e.downloads, !0);
		}).catch(() => {});
	});
	let Z;
	c(() => () => clearInterval(Z));
	function re(e) {
		window.open(e.url, "_blank", "noopener");
		let t = Math.floor(Date.now() / 1e3) - 5;
		T(q, {
			name: e.name,
			until: Date.now() + 6e5
		}, !0), T(Y, [], !0), clearInterval(Z), Z = setInterval(async () => {
			if (!n(q) || Date.now() > n(q).until) {
				clearInterval(Z), T(q, null);
				return;
			}
			try {
				let e = await I(i.atlas, "downloads", { since: t });
				e.taken.length && (T(Y, [...n(Y), ...e.taken.map((e) => `${e.name} (${e.preset})`)], !0), i.atlas.toast("Statement taken", e.taken.map((e) => e.name).join(", ") + " → the inbox"), i.onchange());
			} catch (e) {
				T(O, e.message, !0), clearInterval(Z), T(q, null);
			}
		}, 3e3);
	}
	let ie = (e) => e ? Math.round(((/* @__PURE__ */ new Date(`${e}T12:00:00`)).getTime() - Date.now()) / 864e5) : null;
	var ae = or(), Q = C(ae), oe = W(C(Q), 2);
	b(oe, 17, () => i.sources, (e) => e.path, (e, r) => {
		let a = E(() => ie(n(r).until));
		var o = Yn(), s = C(o), c = C(s, !0), l = W(c), u = d(l);
		J(s);
		var f = W(s, 2);
		let m;
		var g = d(f, !0), _ = W(f, 2), b = d(_, !0), x = W(_, 2), w = (e) => {
			var t = qn();
			v("click", t, () => B(n(r).bank)), p(e, t);
		};
		h(x, (e) => {
			n(a) !== null && n(a) < 14 && e(w);
		});
		var T = W(x, 2), D = d(T, !0), O = W(T, 2), k = (e) => {
			var i = Jn(), a = d(i, !0);
			S(() => t(a, n(r).error)), p(e, i);
		};
		h(O, (e) => {
			n(r).error && e(k);
		}), J(o), S((e) => {
			t(c, n(r).bank), t(u, `· ${n(r).country ?? ""}`), m = y(f, 1, "faint svelte-er8fe7", null, m, { bad: n(a) !== null && n(a) < 14 }), t(g, n(a) === null ? "consent: unknown" : n(a) < 0 ? `consent ended ${n(r).until}` : `consent ${n(a)} days left`), t(b, n(r).synced ? `synced ${n(r).synced}` : "never synced"), t(D, e);
		}, [() => n(r).accounts.map((e) => `${e.name || "account"} ${e.iban ? `…${e.iban.slice(-4)}` : ""}`).join(" · ")]), v("click", s, () => i.atlas.open(n(r).path)), p(e, o);
	}, (e) => {
		var n = Xn(), r = d(n);
		S((e) => t(r, `No bank connected. Statements dropped into ${e ?? ""}/statements/inbox/ always work (Overview → Statements).`), [() => U(i.atlas)]), p(e, n);
	});
	var se = W(oe, 2), ce = C(se), le = d(ce, !0), $ = W(ce, 2);
	b($, 20, () => [
		"ES",
		"FR",
		"PT",
		"IT",
		"DE",
		"NL",
		"BE",
		"IE",
		"LT",
		"FI"
	], (e) => e, (e, n) => {
		var r = Zn(), i = d(r, !0), a = {};
		S(() => {
			t(i, n), a !== (a = n) && (r.__value = a);
		}), p(e, r);
	}), J($), ne($);
	var ue = W($, 2), de = d(ue, !0);
	J(se);
	var fe = W(se, 2), pe = (e) => {
		var r = $n(), i = C(r), a = C(i), o = W(a), c = (e) => {
			var t = Qn(), r = W(s(t));
			M(), S(() => D(r, "href", n(z))), p(e, t);
		};
		h(o, (e) => {
			n(z) && e(c);
		}), M(), J(i);
		var l = W(i, 2);
		P(l);
		var u = W(l, 2);
		J(r), S((e) => {
			t(a, `Opened ${n(m).bank ?? ""}'s consent page`), D(l, "placeholder", `${n(A)}?code=…`), u.disabled = e;
		}, [() => !n(g).trim() || !!n(x)]), v("keydown", l, (e) => e.key === "Enter" && V()), F(l, () => n(g), (e) => T(g, e)), v("click", u, V), p(e, r);
	};
	h(fe, (e) => {
		n(m) && e(pe);
	});
	var me = W(fe, 2), he = (e) => {
		var r = Jn(), i = d(r, !0);
		S(() => t(i, n(O))), p(e, r);
	};
	h(me, (e) => {
		n(O) && e(he);
	}), J(Q);
	var ge = W(Q, 2), _e = (e) => {
		var r = ir(), i = C(r), a = W(C(i)), o = d(a);
		J(i);
		var s = W(i, 2);
		b(s, 21, () => n(G), (e) => e.url, (e, r) => {
			var i = tr(), a = C(i), o = d(a, !0), s = W(a), c = (e) => {
				var i = er(), a = d(i, !0);
				S(() => t(a, n(r).hint)), p(e, i);
			};
			h(s, (e) => {
				n(r).hint && e(c);
			}), J(i), S(() => {
				D(i, "title", n(r).url), t(o, n(r).name);
			}), v("click", i, () => re(n(r))), p(e, i);
		}), J(s);
		var c = W(s, 2), l = (e) => {
			var r = nr(), i = C(r), a = W(i);
			J(r), S(() => t(i, `Watching the downloads for ${n(q).name ?? ""}… `)), v("click", a, () => {
				clearInterval(Z), T(q, null);
			}), p(e, r);
		};
		h(c, (e) => {
			n(q) && e(l);
		});
		var u = W(c, 2), f = (e) => {
			var r = rr(), i = d(r);
			S((e) => t(i, `Taken: ${e ?? ""}. Import them in Overview → Statements.`), [() => n(Y).join(", ")]), p(e, r);
		};
		h(u, (e) => {
			n(Y).length && e(f);
		}), J(r), S(() => t(o, `download as usual: what lands in ${n(K) ?? ""} and reads as a statement goes to the inbox`)), p(e, r);
	};
	h(ge, (e) => {
		n(K) && e(_e);
	});
	var ve = W(ge, 2), ye = W(C(ve), 2), be = C(ye);
	let xe;
	var Se = W(C(be), 3), Ce = W(Se), we = (e) => {
		var r = ar(), i = W(s(r)), a = d(i, !0);
		S(() => t(a, n(k))), p(e, r);
	};
	h(Ce, (e) => {
		n(k) && e(we);
	}), M(), J(be);
	var Te = W(be, 2);
	let Ee;
	var De = W(C(Te)), Oe = (e) => {
		var r = ar(), i = W(s(r)), a = d(i, !0);
		S(() => t(a, n(A))), p(e, r);
	};
	h(De, (e) => {
		n(A) && e(Oe);
	}), M(), J(Te);
	var ke = W(Te, 2);
	let Ae;
	var je = W(C(ke)), Me = d(je, !0);
	M(2), J(ke), J(ye), M(2), J(ve), J(ae), S(() => {
		ce.disabled = !!n(x) || !n(o) || !n(k) || !n(A), t(le, n(x) === "list" || n(x) === "connect" ? "Asking…" : "Connect a bank"), ue.disabled = !!n(x) || !i.sources.length, t(de, n(x) === "sync" ? "Syncing…" : "Sync now"), xe = y(be, 1, "svelte-er8fe7", null, xe, { done: !!n(k) }), Ee = y(Te, 1, "svelte-er8fe7", null, Ee, { done: !!n(A) }), Ae = y(ke, 1, "svelte-er8fe7", null, Ae, { done: !!n(o) }), t(Me, n(o) ? "Replace the key" : "Choose the key file");
	}), v("click", ce, R), X($, () => n(l), (e) => T(l, e)), v("click", ue, ee), v("click", Se, () => i.atlas.plugin.openSettings()), v("click", je, L), p(r, ae), _();
}
f(["click", "keydown"]);
//#endregion
//#region plugins/beta/finance/ui/src/App.svelte
var lr = g("<span class=\"badge svelte-1oymcr8\"> </span>"), ur = g("<button> <!></button>"), dr = g("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button><button class=\"atlas-btn\">Settings…</button></div></div>"), fr = g("<div class=\"atlas-empty\">Reading the journal…</div>"), pr = g("<button> <span class=\"faint svelte-1oymcr8\"> </span></button>"), mr = g("<h3 class=\"svelte-1oymcr8\"> <button class=\"link svelte-1oymcr8\">as transactions</button></h3> <!>", 1), hr = g("<div class=\"atlas-empty\">Choose an account or a category: its postings with the running balance, newest first; a row opens the transaction.</div>"), gr = g("<div class=\"split svelte-1oymcr8\"><aside class=\"svelte-1oymcr8\"><h3 class=\"svelte-1oymcr8\">Accounts</h3> <!> <h3 class=\"svelte-1oymcr8\">Categories</h3> <!></aside> <main><!></main></div>"), _r = g("<div><header class=\"top svelte-1oymcr8\"><nav aria-label=\"Finance\" class=\"svelte-1oymcr8\"></nav> <button class=\"atlas-btn\">Settings…</button></header> <!></div>"), vr = {
	hash: "svelte-1oymcr8",
	code: "\n  /* The categorical slots (dataviz reference palette, validated on --bg-elev in both themes) and the two flow ends. */.finance.svelte-1oymcr8 {--fin-c1: #3987e5;--fin-c2: #d95926;--fin-c3: #199e70;--fin-c4: #c98500;--fin-c5: #d55181;--fin-c6: #008300;--fin-c7: #9085e9;--fin-c8: #e66767;--fin-other: #6b7280;--fin-income: #3f8f6a;--fin-saved: #7d8590;}[data-theme=\"light\"] .finance.svelte-1oymcr8 {--fin-c1: #2a78d6;--fin-c2: #eb6834;--fin-c3: #1baf7a;--fin-c4: #eda100;--fin-c5: #e87ba4;--fin-c6: #008300;--fin-c7: #6250d6;--fin-c8: #e34948;--fin-other: #9ca3af;--fin-income: #2f9e5c;--fin-saved: #8c939f;}.finance.svelte-1oymcr8 {padding:14px 18px 28px;color:var(--text);font-size:calc(14px * var(--ui-scale, 1));container-type:inline-size;box-sizing:border-box;}.finance.full.svelte-1oymcr8 {height:100%;display:flex;flex-direction:column;padding-bottom:0;}.finance.full.svelte-1oymcr8 > :last-child {flex:1;min-height:0;}.top.svelte-1oymcr8 {display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;}nav.svelte-1oymcr8 {display:flex;gap:2px;background:var(--bg-hover);padding:3px;border-radius:var(--radius);flex-wrap:wrap;}nav.svelte-1oymcr8 button:where(.svelte-1oymcr8) {all:unset;cursor:pointer;padding:5px 12px;border-radius:var(--radius-sm);color:var(--text-muted);display:flex;gap:6px;align-items:center;min-height:24px;}nav.svelte-1oymcr8 button:where(.svelte-1oymcr8):hover {color:var(--text);}nav.svelte-1oymcr8 button.on:where(.svelte-1oymcr8) {background:var(--bg);color:var(--text);box-shadow:var(--shadow-sm);font-weight:500;}nav.svelte-1oymcr8 button:where(.svelte-1oymcr8):focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.badge.svelte-1oymcr8 {font-size:0.8em;padding:0 6px;border-radius:999px;background:var(--yellow);color:var(--bg);font-weight:600;}h3.svelte-1oymcr8 {margin:0 0 10px;font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);font-weight:600;display:flex;gap:10px;align-items:baseline;}.faint.svelte-1oymcr8 {color:var(--text-faint);font-weight:400;text-transform:none;letter-spacing:0;}.link.svelte-1oymcr8 {all:unset;cursor:pointer;color:var(--accent);text-transform:none;letter-spacing:0;font-weight:400;}.split.svelte-1oymcr8 {display:grid;grid-template-columns:minmax(220px, 300px) minmax(0, 1fr);gap:18px;align-items:start;max-width:1180px;}aside.svelte-1oymcr8 {position:sticky;top:0;display:grid;gap:4px;}aside.svelte-1oymcr8 h3:where(.svelte-1oymcr8):not(:first-child) {margin-top:14px;}.cat.svelte-1oymcr8 {all:unset;cursor:pointer;display:flex;justify-content:space-between;padding:4px 8px;border-radius:var(--radius-sm);color:var(--text-muted);}.cat.svelte-1oymcr8:hover, .cat.on.svelte-1oymcr8 {background:var(--bg-hover);color:var(--text);}\n  @container (max-width: 700px) {.split.svelte-1oymcr8 {grid-template-columns:minmax(0, 1fr);}aside.svelte-1oymcr8 {position:static;} }"
};
function yr(r, i) {
	e(i, !0), te(r, vr);
	let a = [
		["overview", "Overview"],
		["transactions", "Transactions"],
		["spending", "Spending"],
		["accounts", "Accounts"],
		["budget", "Budget"],
		["review", "Review"],
		["invest", "Investments"],
		["sources", "Sources"]
	], o = () => i.atlas.arg, l = w(u(a.find(([e]) => e === o())?.[0] ?? "overview")), f = w(null), m = w(u([])), g = w(""), k = w(u([])), A = w(""), j = w(u([])), M = w(""), N = w(null), P = w(void 0), F = w(void 0), L = E(() => O(i.atlas)), R = E(() => n(m)[0]?.date.slice(0, 7) ?? pe(/* @__PURE__ */ new Date())), z = E(() => he(n(R))), B = w(null), q = E(() => n(B) ?? n(z)[3]), Y = E(() => [..._e(n(m), "Expenses")].sort((e, t) => t[1] - e[1]).slice(0, 8).map(([e]) => e)), X = (e) => {
		let t = n(Y).indexOf(ae(e));
		return t < 0 ? "var(--fin-other)" : `var(--fin-c${t + 1})`;
	};
	async function Z() {
		try {
			let [e, t] = await Promise.all([I(i.atlas, "summary"), I(i.atlas, "transactions")]);
			if (T(f, e, !0), T(m, t.transactions, !0), T(g, ""), T(k, e.errors + e.warnings ? (await I(i.atlas, "check")).diagnostics : [], !0), n(A) && await ne(n(A), !1), n(N) && n(N) !== "new") {
				let e = n(N);
				T(N, n(m).find((t) => t.path === e.path && t.line === e.line && t.text === e.text) ?? null, !0);
			}
		} catch (e) {
			T(g, e.message, !0);
		}
	}
	async function ne(e, t = !0) {
		T(A, e, !0), t && T(l, "accounts"), T(j, (await I(i.atlas, "register", { account: e })).rows, !0);
	}
	function ie(e) {
		T(M, e, !0), T(N, null), T(l, "transactions");
	}
	function Q(e, t) {
		let r = n(m).find((n) => n.path === e && n.line === t);
		r ? (T(N, r, !0), T(l, "transactions")) : i.atlas.open(e, t);
	}
	Z();
	let oe, se = (e) => !!e && e.startsWith(`${U(i.atlas)}/`), ce = () => {
		clearTimeout(oe), oe = setTimeout(() => {
			Z(), n(P)?.load(), n(F)?.load();
		}, 300);
	};
	c(() => {
		let e = [
			"file:save",
			"file:create",
			"file:delete"
		].map((e) => i.atlas.on(e, (e) => {
			se(e.path) && ce();
		}));
		return e.push(i.atlas.on("file:rename", (e) => {
			let t = e;
			(se(t.from) || se(t.to)) && ce();
		})), () => {
			clearTimeout(oe), e.forEach((e) => e());
		};
	}), c(() => {
		if (n(l) !== "accounts" || n(A) || !n(f)) return;
		let e = n(f).accounts.find((e) => !e.closed && Object.keys(e.balances).length);
		e && ne(e.account, !1);
	});
	let le = E(() => (n(f)?.known ?? []).filter((e) => /^(Expenses|Income):[^:]+$/.test(e)));
	function $(e) {
		if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest("input, textarea, select, [role=dialog]")) return;
		let t = [
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
			"7",
			"8"
		].indexOf(e.key);
		t >= 0 && (T(l, a[t][0], !0), e.preventDefault());
	}
	var ue = _r();
	re("keydown", x, $);
	let de;
	var fe = C(ue), me = C(fe);
	b(me, 23, () => a, ([e, t]) => e, (e, r, i) => {
		var a = E(() => H(n(r), 2));
		let o = () => n(a)[0], s = () => n(a)[1];
		var c = ur();
		let u;
		var m = C(c, !0), g = W(m), _ = (e) => {
			var r = lr(), i = d(r, !0);
			S(() => t(i, n(f).review)), p(e, r);
		};
		h(g, (e) => {
			o() === "review" && n(f)?.review && e(_);
		}), J(c), S(() => {
			D(c, "aria-current", n(l) === o() ? "page" : void 0), D(c, "title", `key ${n(i) + 1}`), u = y(c, 1, "svelte-1oymcr8", null, u, { on: n(l) === o() }), t(m, s());
		}), v("click", c, () => T(l, o(), !0)), p(e, c);
	}), J(me);
	var ge = W(me, 2);
	J(fe);
	var ve = W(fe, 2), ye = (e) => {
		var r = dr(), a = C(r, !0), o = W(a), s = C(o), c = W(s);
		J(o), J(r), S(() => t(a, n(g))), v("click", s, Z), v("click", c, () => i.atlas.plugin.openSettings()), p(e, r);
	}, be = (e) => {
		var t = fr();
		p(e, t);
	}, xe = (e) => {
		var t = () => n(q), r = (e) => T(B, e, !0);
		yt(e, {
			get atlas() {
				return i.atlas;
			},
			get summary() {
				return n(f);
			},
			get rows() {
				return n(m);
			},
			get diags() {
				return n(k);
			},
			get cur() {
				return n(L);
			},
			get period() {
				return t();
			},
			set period(e) {
				r(e);
			},
			get periods() {
				return n(z);
			},
			color: X,
			onshow: ie,
			ontab: (e) => T(l, e, !0),
			onaccount: (e) => ne(e),
			onchange: Z
		});
	}, Se = (e) => {
		Ht(e, {
			get atlas() {
				return i.atlas;
			},
			get rows() {
				return n(m);
			},
			get accounts() {
				return n(f).known;
			},
			get cur() {
				return n(L);
			},
			onchange: Z,
			get query() {
				return n(M);
			},
			set query(e) {
				T(M, e, !0);
			},
			get open() {
				return n(N);
			},
			set open(e) {
				T(N, e, !0);
			}
		});
	}, Ce = (e) => {
		var t = () => n(q), r = (e) => T(B, e, !0);
		cn(e, {
			get rows() {
				return n(m);
			},
			get cur() {
				return n(L);
			},
			get period() {
				return t();
			},
			set period(e) {
				r(e);
			},
			get periods() {
				return n(z);
			},
			color: X,
			onshow: ie
		});
	}, we = (e) => {
		var r = gr(), i = C(r), a = W(C(i), 2);
		G(a, {
			get accounts() {
				return n(f).accounts;
			},
			get cur() {
				return n(L);
			},
			onpick: (e) => ne(e.account)
		});
		var o = W(a, 4);
		b(o, 16, () => n(le), (e) => e, (e, r) => {
			var i = pr();
			let a;
			var o = C(i, !0), s = W(o), c = d(s, !0);
			J(i), S((e, s) => {
				a = y(i, 1, "cat svelte-1oymcr8", null, a, { on: n(A) === r }), t(o, e), t(c, s);
			}, [() => K(r), () => r.split(":")[0]]), v("click", i, () => ne(r)), p(e, i);
		}), J(i);
		var c = W(i, 2), l = C(c), u = (e) => {
			var r = mr(), i = s(r), a = C(i), o = W(a);
			J(i);
			var c = W(i, 2);
			V(c, {
				get rows() {
					return n(j);
				},
				get account() {
					return n(A);
				},
				onopen: (e) => Q(e.path, e.line)
			}), S(() => t(a, `${n(A) ?? ""} `)), v("click", o, () => ie(n(A).toLowerCase())), p(e, r);
		}, m = (e) => {
			var t = hr();
			p(e, t);
		};
		h(l, (e) => {
			n(A) ? e(u) : e(m, -1);
		}), J(c), J(r), p(e, r);
	}, Te = (e) => {
		jn(e, {
			get atlas() {
				return i.atlas;
			},
			get budget() {
				return n(f).budget;
			},
			get cur() {
				return n(L);
			},
			onchange: Z
		});
	}, Ee = (e) => {
		ee(wn(e, {
			get atlas() {
				return i.atlas;
			},
			get known() {
				return n(f).known;
			},
			onchange: Z
		}), (e) => T(P, e, !0), () => n(P));
	}, De = (e) => {
		ee(Kn(e, {
			get atlas() {
				return i.atlas;
			},
			get cur() {
				return n(L);
			}
		}), (e) => T(F, e, !0), () => n(F));
	}, Oe = (e) => {
		{
			let t = E(() => n(f).known.filter((e) => e.startsWith("Assets:")));
			cr(e, {
				get atlas() {
					return i.atlas;
				},
				get sources() {
					return n(f).sources;
				},
				get assets() {
					return n(t);
				},
				onchange: Z
			});
		}
	};
	h(ve, (e) => {
		n(g) ? e(ye) : n(f) ? n(l) === "overview" ? e(xe, 2) : n(l) === "transactions" ? e(Se, 3) : n(l) === "spending" ? e(Ce, 4) : n(l) === "accounts" ? e(we, 5) : n(l) === "budget" ? e(Te, 6) : n(l) === "review" ? e(Ee, 7) : n(l) === "invest" ? e(De, 8) : e(Oe, -1) : e(be, 1);
	}), J(ue), S(() => de = y(ue, 1, "finance svelte-1oymcr8", null, de, { full: n(l) === "transactions" })), v("click", ge, () => i.atlas.plugin.openSettings()), p(r, ue), _();
}
f(["click"]);
//#endregion
//#region plugins/beta/finance/ui/src/view.ts
function br(e, t) {
	let n = R(yr, {
		target: e,
		props: { atlas: t }
	});
	return () => L(n);
}
//#endregion
export { br as default };
