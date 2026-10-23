import { $ as e, A as t, B as n, H as r, J as i, K as a, M as o, O as s, P as c, Q as l, V as u, W as d, X as f, Y as p, Z as m, a as h, i as g, j as _, k as v, n as y, o as b, r as x, t as S, tt as C, w } from "./ui-lib/Spending.js";
//#region plugins/beta/finance/ui/src/Block.svelte
var T = c("<div class=\"atlas-notice error\"> </div>"), E = c("<div class=\"atlas-empty\">Reading the journal…</div>"), D = c("<div class=\"finance-block svelte-duo2s6\"><!></div>"), O = {
	hash: "svelte-duo2s6",
	code: ".finance-block.svelte-duo2s6 {font-size:0.95em;}"
};
function k(c, _) {
	e(_, !0), w(c, O);
	let v = m(() => String(_.options.currency ?? h(_.atlas))), k = m(() => String(_.options.account ?? "Assets")), A = m(() => Number(_.options.limit ?? (_.kind === "register" ? 10 : 8))), j = f(null), M = f(i([])), N = f("");
	async function P() {
		try {
			_.kind === "register" ? p(M, (await g(_.atlas, "register", { account: n(k) })).rows, !0) : p(j, await g(_.atlas, "summary"), !0), p(N, "");
		} catch (e) {
			p(N, e.message, !0);
		}
	}
	r(() => (P(), _.atlas.on("file:save", (e) => {
		e.path?.startsWith(`${b(_.atlas)}/`) && P();
	})));
	var F = D(), I = d(F), L = (e) => {
		var r = T(), i = a(r, !0);
		u(() => t(i, n(N))), o(e, r);
	}, R = (e) => {
		y(e, {
			get rows() {
				return n(M);
			},
			get account() {
				return n(k);
			},
			get limit() {
				return n(A);
			},
			onopen: (e) => _.atlas.open(e.path, e.line)
		});
	}, z = (e) => {
		var t = E();
		o(e, t);
	}, B = (e) => {
		x(e, {
			get accounts() {
				return n(j).accounts;
			},
			get cur() {
				return n(v);
			},
			onpick: () => _.atlas.openView("accounts", { title: "Finance" })
		});
	}, V = (e) => {
		S(e, {
			get budget() {
				return n(j).budget;
			},
			get cur() {
				return n(v);
			},
			get limit() {
				return n(A);
			}
		});
	};
	s(I, (e) => {
		n(N) ? e(L) : _.kind === "register" ? e(R, 1) : n(j) ? _.kind === "balance" ? e(B, 3) : e(V, -1) : e(z, 2);
	}), C(F), o(c, F), l();
}
//#endregion
//#region plugins/beta/finance/ui/src/main.ts
var A = [
	["balance", "Finance: balances"],
	["spending", "Finance: this month"],
	["register", "Finance: register"]
];
function j(e) {
	e.registerCommand({
		id: "open",
		title: "Finance",
		run: () => e.openView(void 0, {
			title: "Finance",
			icon: "chart"
		})
	}), e.registerCommand({
		id: "review",
		title: "Finance: review",
		run: () => e.openView("review", {
			title: "Finance",
			icon: "chart"
		})
	});
	for (let [t, n] of A) e.registerBlock(`finance.${t}`, (n, r) => {
		let i = v(k, {
			target: n,
			props: {
				atlas: e,
				kind: t,
				options: r.options
			}
		});
		return () => _(i);
	}, {
		title: n,
		options: [...t === "register" ? [{
			key: "account",
			label: "Account",
			kind: "text",
			hint: "Assets:Revolut, Expenses:Food…"
		}] : [], {
			key: "limit",
			label: "Rows",
			kind: "number"
		}]
	});
}
//#endregion
export { j as register };
