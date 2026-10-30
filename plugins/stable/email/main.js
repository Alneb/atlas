import { $ as e, A as t, B as n, C as r, D as i, F as a, G as o, H as s, I as c, L as l, M as u, P as d, Q as f, R as p, S as m, T as h, W as g, X as _, Y as v, _ as y, a as b, at as x, b as S, c as C, ct as w, d as ee, dt as T, et as E, f as te, ft as ne, h as D, i as O, it as k, j as re, lt as ie, m as ae, nt as A, ot as j, q as M, r as N, rt as P, s as F, st as oe, t as I, tt as L, ut as R, v as se, z } from "./ui-lib/Rules.js";
//#region plugins/stable/email/ui/src/Inbox.svelte
var ce = s("<span class=\"cnt svelte-uoex8y\"> </span>"), le = s("<span class=\"snip svelte-uoex8y\"> </span>"), ue = s("<button role=\"menuitem\" class=\"svelte-uoex8y\"> </button>"), de = s("<div class=\"snooze svelte-uoex8y\" role=\"menu\"></div>"), fe = s("<div class=\"reply svelte-uoex8y\"><textarea rows=\"3\" class=\"svelte-uoex8y\"></textarea> <div class=\"rbar svelte-uoex8y\"><button class=\"ghost svelte-uoex8y\">Open in Email</button> <span class=\"grow svelte-uoex8y\"></span> <button class=\"ghost svelte-uoex8y\">Cancel</button> <button class=\"primary svelte-uoex8y\"><!> Send</button></div></div>"), pe = s("<div role=\"option\" tabindex=\"-1\"><button class=\"open svelte-uoex8y\"><span class=\"av svelte-uoex8y\"> </span> <span class=\"main svelte-uoex8y\"><span class=\"l1 svelte-uoex8y\"><span class=\"who svelte-uoex8y\"> <!></span><!><time class=\"svelte-uoex8y\"> </time></span> <span class=\"l2 svelte-uoex8y\"><span class=\"subj svelte-uoex8y\"> </span><!></span></span></button> <span class=\"acts svelte-uoex8y\"><button title=\"Archive (e)\" class=\"svelte-uoex8y\"><!></button> <button class=\"svelte-uoex8y\"><!></button> <button title=\"Snooze (h)\" class=\"svelte-uoex8y\"><!></button> <button title=\"Reply (r)\" class=\"svelte-uoex8y\"><!></button></span></div> <!> <!>", 1), me = s("<b class=\"svelte-uoex8y\">!</b>"), he = s("<b class=\"svelte-uoex8y\"> </b>"), ge = s("<button><i></i><span class=\"svelte-uoex8y\"> </span><!></button>"), _e = s("<span class=\"svelte-uoex8y\"><b class=\"svelte-uoex8y\"> </b> </span>"), ve = s("<span class=\"faint svelte-uoex8y\"> </span>"), B = s("<div class=\"today svelte-uoex8y\" title=\"Today, from your calendar\"><!> <!> <!></div>"), ye = s("<p class=\"quiet svelte-uoex8y\"> </p>"), V = s("<p class=\"quiet zero svelte-uoex8y\">Inbox zero — nothing waiting for you.</p>"), be = s("<div class=\"section svelte-uoex8y\"><!> Important</div> <!>", 1), H = s("<span class=\"n svelte-uoex8y\"> </span>"), xe = s("<div class=\"section svelte-uoex8y\">People<!></div> <!>", 1), Se = s("<button class=\"svelte-uoex8y\"><!> <b class=\"svelte-uoex8y\"> </b></button>"), Ce = s("<div class=\"folded svelte-uoex8y\"></div>"), we = s("<button class=\"svelte-uoex8y\">Undo</button>"), Te = s("<div class=\"note svelte-uoex8y\" role=\"status\"> <!></div>"), Ee = s("<div class=\"card svelte-uoex8y\" tabindex=\"0\" role=\"listbox\" aria-label=\"Mail to answer\"><header class=\"svelte-uoex8y\"><!> <span class=\"grow svelte-uoex8y\"></span> <button class=\"icon svelte-uoex8y\" title=\"New message (c)\"><!></button> <button class=\"icon svelte-uoex8y\" title=\"Open the Email pane\"><!></button></header> <!> <!> <!> <!> <!> <!></div>"), De = {
	hash: "svelte-uoex8y",
	code: ".card.svelte-uoex8y {display:grid;grid-template-columns:minmax(0, 1fr);gap:1px;font-size:calc(13px * var(--ui-scale, 1));container-type:inline-size;outline:none;position:relative;}.card.svelte-uoex8y:focus-visible {box-shadow:0 0 0 2px var(--accent);border-radius:var(--radius-sm);}header.svelte-uoex8y {display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:4px;}.grow.svelte-uoex8y {flex:1;}.acct.svelte-uoex8y {all:unset;cursor:pointer;display:inline-flex;gap:6px;align-items:center;padding:2px 9px;border-radius:999px;border:1px solid var(--border-strong);font-size:0.9em;}.acct.svelte-uoex8y:hover {background:var(--bg-hover);}.acct.svelte-uoex8y i:where(.svelte-uoex8y) {width:7px;height:7px;border-radius:50%;background:hsl(var(--h) 55% 50%);}.acct.svelte-uoex8y i.spin:where(.svelte-uoex8y) { animation: svelte-uoex8y-pulse 1.2s ease-in-out infinite;}\n  @keyframes svelte-uoex8y-pulse { 50% { opacity: 0.3; } }\n  @media (prefers-reduced-motion: reduce) {.acct.svelte-uoex8y i.spin:where(.svelte-uoex8y) { animation: none;} }.acct.bad.svelte-uoex8y {border-color:var(--red);}.acct.svelte-uoex8y b:where(.svelte-uoex8y) {font-weight:650;}.icon.svelte-uoex8y {all:unset;cursor:pointer;display:grid;place-items:center;width:26px;height:26px;border-radius:var(--radius-sm);color:var(--text-muted);}.icon.svelte-uoex8y:hover {background:var(--bg-hover);color:var(--text);}.section.svelte-uoex8y {display:flex;align-items:center;gap:5px;font-size:0.72em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);margin:8px 0 2px;font-weight:600;}.section.svelte-uoex8y .n:where(.svelte-uoex8y) {text-transform:none;letter-spacing:0;font-weight:500;margin-left:4px;color:var(--accent);}.row.svelte-uoex8y {position:relative;display:flex;align-items:center;border-radius:var(--radius-sm);min-width:0;}.row.svelte-uoex8y:hover, .row.cursor.svelte-uoex8y {background:var(--bg-hover);}.card.svelte-uoex8y:focus-within .row.cursor:where(.svelte-uoex8y) {box-shadow:inset 2px 0 0 var(--accent);}.open.svelte-uoex8y {all:unset;box-sizing:border-box;cursor:pointer;flex:1;min-width:0;display:flex;gap:9px;align-items:center;padding:5px 6px;}.open.svelte-uoex8y:focus-visible {outline:2px solid var(--accent);border-radius:var(--radius-sm);}.av.svelte-uoex8y {flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:10px;font-weight:600;background:hsl(var(--h) 45% 46%);}.main.svelte-uoex8y {flex:1;min-width:0;display:grid;grid-template-columns:minmax(0, 1fr);}.l1.svelte-uoex8y {display:flex;gap:6px;align-items:center;color:var(--text);}.who.svelte-uoex8y {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.cnt.svelte-uoex8y {color:var(--text-faint);font-size:0.88em;margin-left:5px;}time.svelte-uoex8y {flex:none;color:var(--text-faint);font-size:0.88em;font-variant-numeric:tabular-nums;}.l2.svelte-uoex8y {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);}.snip.svelte-uoex8y {color:var(--text-faint);}.unread.svelte-uoex8y .who:where(.svelte-uoex8y), .unread.svelte-uoex8y .subj:where(.svelte-uoex8y) {font-weight:650;color:var(--heading, var(--text));}.acts.svelte-uoex8y {display:none;gap:1px;padding-right:4px;background:var(--bg-hover);}.row.svelte-uoex8y:hover .acts:where(.svelte-uoex8y), .row.cursor.svelte-uoex8y .acts:where(.svelte-uoex8y) {display:flex;}.row.svelte-uoex8y:hover time:where(.svelte-uoex8y), .row.cursor.svelte-uoex8y time:where(.svelte-uoex8y) {visibility:hidden;}.acts.svelte-uoex8y {position:absolute;right:0;top:4px;}.acts.svelte-uoex8y button:where(.svelte-uoex8y) {all:unset;cursor:pointer;display:grid;place-items:center;width:26px;height:26px;border-radius:var(--radius-sm);color:var(--text-muted);}.acts.svelte-uoex8y button:where(.svelte-uoex8y):hover {background:var(--bg-active, var(--bg));color:var(--text);}\n  @media (hover: none) {.acts.svelte-uoex8y {display:flex;position:static;background:none;}.row.svelte-uoex8y time:where(.svelte-uoex8y) {visibility:visible !important;} }.snooze.svelte-uoex8y {display:flex;flex-wrap:wrap;gap:4px;padding:4px 6px 6px 41px;}.snooze.svelte-uoex8y button:where(.svelte-uoex8y), .folded.svelte-uoex8y button:where(.svelte-uoex8y), .note.svelte-uoex8y button:where(.svelte-uoex8y), .rbar.svelte-uoex8y button:where(.svelte-uoex8y) {all:unset;cursor:pointer;padding:3px 9px;border-radius:999px;border:1px solid var(--border-strong);font-size:0.9em;display:inline-flex;gap:6px;align-items:center;}.snooze.svelte-uoex8y button:where(.svelte-uoex8y):hover, .folded.svelte-uoex8y button:where(.svelte-uoex8y):hover {background:var(--bg-hover);}.reply.svelte-uoex8y {display:grid;gap:6px;padding:4px 6px 8px 41px;}.reply.svelte-uoex8y textarea:where(.svelte-uoex8y) {box-sizing:border-box;width:100%;resize:vertical;font:inherit;padding:6px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);}.reply.svelte-uoex8y textarea:where(.svelte-uoex8y):focus {outline:2px solid var(--accent);outline-offset:-1px;}.rbar.svelte-uoex8y {display:flex;gap:6px;align-items:center;}.rbar.svelte-uoex8y .ghost:where(.svelte-uoex8y) {border-color:transparent;color:var(--text-muted);}.rbar.svelte-uoex8y .primary:where(.svelte-uoex8y) {background:var(--accent);color:var(--accent-fg);border-color:transparent;}.rbar.svelte-uoex8y .primary:where(.svelte-uoex8y):disabled {opacity:0.5;cursor:default;}.folded.svelte-uoex8y {display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}.folded.svelte-uoex8y b:where(.svelte-uoex8y) {font-weight:650;color:var(--accent);}.note.svelte-uoex8y {display:flex;gap:10px;align-items:center;margin-top:6px;color:var(--text-muted);font-size:0.92em;}.note.svelte-uoex8y button:where(.svelte-uoex8y) {color:var(--accent);border-color:transparent;padding:1px 6px;}.quiet.svelte-uoex8y {color:var(--text-faint);margin:4px 0;}.today.svelte-uoex8y {display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding:4px 6px;margin-bottom:2px;color:var(--text-muted);font-size:0.92em;border-radius:var(--radius-sm);background:var(--accent-soft);}.today.svelte-uoex8y b:where(.svelte-uoex8y) {font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;}.today.svelte-uoex8y .faint:where(.svelte-uoex8y) {color:var(--text-faint);}.zero.svelte-uoex8y {padding:6px 0;}\n  @container (max-width: 360px) {.snip.svelte-uoex8y {display:none;}.acct.svelte-uoex8y span:where(.svelte-uoex8y) {display:none;} }"
};
function Oe(s, l) {
	ie(l, !0), u(s, De);
	let g = (r, a = ne) => {
		var s = pe(), u = e(s);
		let m;
		var g = f(u), _ = f(g);
		let b;
		var x = E(_, !0), C = L(_, 2), w = f(C), D = f(w), O = f(D, !0), k = L(O), ie = (e) => {
			var t = ce(), r = E(t, !0);
			v(() => p(r, a().count)), n(e, t);
		};
		c(k, (e) => {
			a().count > 1 && e(ie);
		}), T(D);
		var A = L(D), N = (e) => {
			S(e, {
				name: "star",
				size: 12,
				filled: !0
			});
		};
		c(A, (e) => {
			a().flagged && e(N);
		});
		var F = L(A), I = E(F, !0);
		T(w);
		var z = L(w, 2), me = f(z), he = E(me, !0), ge = L(me), _e = (e) => {
			var t = le(), r = E(t);
			v(() => p(r, ` — ${a().snippet ?? ""}`)), n(e, t);
		};
		c(ge, (e) => {
			a().snippet && e(_e);
		}), T(z), T(C), T(g);
		var ve = L(g, 2), B = f(ve), ye = f(B);
		S(ye, {
			name: "archive",
			size: 15
		}), T(B);
		var V = L(B, 2), be = f(V);
		S(be, {
			name: "star",
			size: 15,
			get filled() {
				return a().flagged;
			}
		}), T(V);
		var H = L(V, 2), xe = f(H);
		S(xe, {
			name: "clock",
			size: 15
		}), T(H);
		var Se = L(H, 2), Ce = f(Se);
		S(Ce, {
			name: "reply",
			size: 15
		}), T(Se), T(ve), T(u);
		var we = L(u, 2), Te = (e) => {
			var t = de();
			d(t, 21, y, (e) => e.label, (e, t) => {
				var r = ue(), i = E(r, !0);
				v(() => p(i, M(t).label)), o("click", r, () => Pe(a(), M(t).at, M(t).label.split(" · ")[0])), n(e, r);
			}), T(t), n(e, t);
		};
		c(we, (e) => {
			M(q) === a().id && e(Te);
		});
		var Ee = L(we, 2), De = (e) => {
			var t = fe(), r = f(t);
			oe(r), j(r, !0);
			var s = L(r, 2), c = f(s), u = L(c, 4), d = L(u, 2), p = f(d);
			S(p, {
				name: "send",
				size: 13
			}), R(), T(d), T(s), T(t), v((e, t) => {
				i(r, "placeholder", e), r.disabled = !M(J).draft, d.disabled = t;
			}, [() => M(J).draft ? `Reply to ${(M(J).draft.to ?? "").replace(/<.*?>/g, "").trim()}…  (Ctrl+Enter sends)` : "…", () => !M(J).draft || !M(J).text.trim()]), h(r, () => M(J).text, (e) => M(J).text = e), o("click", c, () => {
				l.onopen({ reply: {
					id: a().id,
					mode: "reply"
				} }), P(J, null);
			}), o("click", u, () => P(J, null)), o("click", d, Le), n(e, t);
		};
		c(Ee, (e) => {
			M(J)?.id === a().id && e(De);
		}), v((e, n, r, o) => {
			m = re(u, 1, "row svelte-uoex8y", null, m, {
				unread: a().unread > 0,
				cursor: M(W) === a().id
			}), i(u, "aria-selected", M(W) === a().id), i(g, "title", a().subject), b = t(_, "", b, { "--h": e }), p(x, n), p(O, r), p(I, o), p(he, a().subject || "(no subject)"), i(V, "title", a().flagged ? "Unstar (s)" : "Star (s)");
		}, [
			() => ee(a().from.at(-1)?.addr ?? ""),
			() => te(a().from.at(-1)),
			() => ae(a().from, M(ke)),
			() => se(a().date)
		]), o("click", g, () => {
			P(W, a().id, !0), l.onopen({ id: a().id });
		}), o("click", B, () => Ne(a())), o("click", V, () => Fe(a(), "starred", !a().flagged)), o("click", H, () => P(q, M(q) === a().id ? null : a().id, !0)), o("click", Se, () => Ie(a())), n(r, s);
	}, b = m(l, "options", 19, () => ({})), O = x(() => Number(b().limit ?? 8) || 8), N = x(() => String(b().account ?? "")), F = k(A([])), I = k(A([])), z = k(A({})), Oe = k(A([])), ke = k(A([])), U = k(""), Ae = k(!1), W = k(null), G = k(A([])), K = k(null), q = k(null), J = k(null), je = k(void 0), Y = x(() => [...M(F), ...M(I)]), X = /* @__PURE__ */ new Set();
	async function Z() {
		try {
			let e = {
				view: "inbox",
				account: M(N)
			}, [t, n, r, i, a] = await Promise.all([
				C(l.atlas, "accounts", {}, 30),
				C(l.atlas, "list", {
					...e,
					quick: "starred",
					limit: 6
				}, 30),
				C(l.atlas, "list", {
					...e,
					kind: "person",
					quick: "unread",
					limit: M(O)
				}, 30),
				C(l.atlas, "list", {
					...e,
					kind: "person",
					limit: M(O)
				}, 30),
				C(l.atlas, "count", { account: M(N) }, 30)
			]);
			P(Oe, M(N) ? t.accounts.filter((e) => e.name === M(N)) : t.accounts, !0), P(ke, t.own, !0), P(F, n.rows.filter((e) => !X.has(e.id)), !0);
			let o = new Set(M(F).map((e) => e.thread)), s = (e) => e.filter((e) => !o.has(e.thread) && !X.has(e.id) && (o.add(e.thread), !0));
			P(I, [...s(r.rows), ...s(i.rows)].slice(0, M(O)), !0), P(z, a, !0), P(U, ""), C(l.atlas, "agenda", { days: 1 }, 20).then((e) => {
				P(G, e?.events ?? [], !0);
			}).catch(() => {}), M(W) !== null && !M(Y).some((e) => e.id === M(W)) && P(W, null);
		} catch (e) {
			P(U, e.message, !0);
		}
		P(Ae, !0);
	}
	_(() => {
		Z();
		let e = [l.atlas.helper.on("changed", () => Z()), l.atlas.helper.on("new", () => Z())];
		return () => e.forEach((e) => e());
	});
	function Q(e, t) {
		P(K, {
			text: e,
			undo: t
		}, !0);
		let n = M(K);
		setTimeout(() => {
			M(K) === n && P(K, null);
		}, 6e3);
	}
	async function Me(e, t, n) {
		X.add(e.id);
		let r = {
			important: M(F).slice(),
			people: M(I).slice()
		};
		P(F, M(F).filter((t) => t.id !== e.id), !0), P(I, M(I).filter((t) => t.id !== e.id), !0);
		try {
			let { moved: e } = await n();
			Q(t, e?.length ? async () => {
				await C(l.atlas, "undo", { moved: e }), Z();
			} : void 0);
		} catch (e) {
			P(F, r.important, !0), P(I, r.people, !0), Q(`${t} failed: ${e.message}`);
		} finally {
			X.delete(e.id);
		}
	}
	let Ne = (e) => Me(e, "Archived", () => C(l.atlas, "archive", { ids: [e.id] })), Pe = (e, t, n) => (P(q, null), Me(e, `Snoozed until ${n}`, () => C(l.atlas, "snooze", {
		ids: [e.id],
		until: t
	})));
	async function Fe(e, t, n) {
		let r = {
			unread: e.unread,
			flagged: e.flagged
		};
		t === "read" ? e.unread = +!n : e.flagged = n;
		try {
			await C(l.atlas, "mark", {
				ids: [e.id],
				[t]: n
			}), Q(t === "read" ? n ? "Marked read" : "Marked unread" : n ? "Starred" : "Unstarred", async () => {
				await C(l.atlas, "mark", {
					ids: [e.id],
					[t]: !n
				}), Z();
			}), t === "starred" && Z();
		} catch (t) {
			e.unread = r.unread, e.flagged = r.flagged, Q(`Failed: ${t.message}`);
		}
	}
	async function Ie(e) {
		P(J, {
			id: e.id,
			text: "",
			draft: null,
			sending: !1
		}, !0);
		try {
			let t = await C(l.atlas, "compose_for", {
				id: e.id,
				mode: "reply"
			});
			M(J)?.id === e.id && (M(J).draft = t);
		} catch (e) {
			Q(`Cannot answer: ${e.message}`), P(J, null);
		}
	}
	async function Le() {
		if (!M(J)?.draft || !M(J).text.trim()) return;
		let e = {
			...M(J).draft,
			body: M(J).text
		}, t = M(J).draft.to ?? "";
		M(J).sending = !0;
		let n = Number(D(l.atlas, "undo_send", 10)) * 1e3, r = !1, i = M(J);
		P(J, null), Q(`Sending to ${t.replace(/<.*?>/g, "").trim() || t}…`, async () => {
			r = !0, P(J, {
				...i,
				sending: !1
			}, !0);
		}), setTimeout(async () => {
			if (!r) try {
				await C(l.atlas, "send", e, 300), Q("Sent"), Z();
			} catch (e) {
				P(J, {
					...i,
					sending: !1
				}, !0), Q(`Not sent: ${e.message}`);
			}
		}, n);
	}
	function Re(e) {
		if (e.target.closest("textarea, input")) {
			e.key === "Enter" && (e.ctrlKey || e.metaKey) ? (e.preventDefault(), Le()) : e.key === "Escape" && (P(J, null), M(je)?.focus()), e.stopPropagation();
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		let t = M(Y).findIndex((e) => e.id === M(W)), n = M(Y)[t], r = (e) => {
			let n = M(Y)[Math.max(0, Math.min(M(Y).length - 1, (t < 0 ? -1 : t) + e))];
			n && P(W, n.id, !0);
		}, i = {
			j: () => r(1),
			ArrowDown: () => r(1),
			k: () => r(-1),
			ArrowUp: () => r(-1),
			Enter: () => n && l.onopen({ id: n.id }),
			o: () => n && l.onopen({ id: n.id }),
			e: () => n && Ne(n),
			s: () => n && Fe(n, "starred", !n.flagged),
			u: () => n && Fe(n, "read", n.unread > 0),
			h: () => n && P(q, n.id, !0),
			r: () => n && Ie(n),
			c: () => l.onopen({ compose: {} })
		}[e.key];
		i && (e.preventDefault(), e.stopPropagation(), i());
	}
	let ze = x(() => [[
		"newsletter",
		"Newsletters",
		"news"
	], [
		"notification",
		"Notifications",
		"bell"
	]].map(([e, t, n]) => ({
		k: e,
		label: t,
		icon: n,
		n: M(z)[e]?.unread ?? 0
	})).filter((e) => e.n > 0)), Be = x(() => M(z).person?.unread ?? 0);
	var $ = Ee(), Ve = f($), He = f(Ve);
	d(He, 17, () => M(Oe), (e) => e.name, (e, r) => {
		var a = ge();
		let s;
		var u = f(a);
		let d, m;
		var h = L(u), g = E(h, !0), _ = L(h), y = (e) => {
			var t = me();
			n(e, t);
		}, b = (e) => {
			var t = he(), i = E(t, !0);
			v(() => p(i, M(r).unread)), n(e, t);
		};
		c(_, (e) => {
			M(r).error ? e(y) : M(r).unread && e(b, 1);
		}), T(a), v((e) => {
			s = re(a, 1, "acct svelte-uoex8y", null, s, { bad: !!M(r).error || M(r).status?.state === "error" }), i(a, "title", M(r).error ?? M(r).status?.error ?? M(r).user), d = re(u, 1, "svelte-uoex8y", null, d, { spin: M(r).status?.state === "syncing" }), m = t(u, "", m, { "--h": e }), p(g, M(r).name);
		}, [() => ee(M(r).user ?? M(r).name)]), o("click", a, () => l.onopen({
			view: "inbox",
			account: M(r).name
		})), n(e, a);
	});
	var Ue = L(He, 4), We = f(Ue);
	S(We, {
		name: "pen",
		size: 15
	}), T(Ue);
	var Ge = L(Ue, 2), Ke = f(Ge);
	S(Ke, {
		name: "open",
		size: 15
	}), T(Ge), T(Ve);
	var qe = L(Ve, 2), Je = (e) => {
		var t = B(), r = f(t);
		S(r, {
			name: "calendar",
			size: 13
		});
		var i = L(r, 2);
		d(i, 17, () => M(G).slice(0, 4), a, (e, t) => {
			var r = _e(), i = f(r), a = E(i, !0), o = L(i);
			T(r), v(() => {
				p(a, M(t).time), p(o, ` ${M(t).summary ?? M(t).line ?? ""}`);
			}), n(e, r);
		});
		var o = L(i, 2), s = (e) => {
			var t = ve(), r = E(t);
			v(() => p(r, `+${M(G).length - 4}`)), n(e, t);
		};
		c(o, (e) => {
			M(G).length > 4 && e(s);
		}), T(t), n(e, t);
	};
	c(qe, (e) => {
		M(G).length && e(Je);
	});
	var Ye = L(qe, 2), Xe = (e) => {
		var t = ye(), r = E(t, !0);
		v(() => p(r, M(U))), n(e, t);
	}, Ze = (e) => {
		var t = V();
		n(e, t);
	};
	c(Ye, (e) => {
		M(U) ? e(Xe) : M(Ae) && !M(Y).length && !M(ze).length && e(Ze, 1);
	});
	var Qe = L(Ye, 2), $e = (t) => {
		var r = be(), i = e(r), a = f(i);
		S(a, {
			name: "star",
			size: 11,
			filled: !0
		}), R(), T(i);
		var o = L(i, 2);
		d(o, 17, () => M(F), (e) => e.thread, (e, t) => {
			g(e, () => M(t));
		}), n(t, r);
	};
	c(Qe, (e) => {
		M(F).length && e($e);
	});
	var et = L(Qe, 2), tt = (t) => {
		var r = xe(), i = e(r), a = L(f(i)), o = (e) => {
			var t = H(), r = E(t);
			v(() => p(r, `${M(Be) ?? ""} unread`)), n(e, t);
		};
		c(a, (e) => {
			M(Be) && e(o);
		}), T(i);
		var s = L(i, 2);
		d(s, 17, () => M(I), (e) => e.thread, (e, t) => {
			g(e, () => M(t));
		}), n(t, r);
	};
	c(et, (e) => {
		M(I).length && e(tt);
	});
	var nt = L(et, 2), rt = (e) => {
		var t = Ce();
		d(t, 21, () => M(ze), (e) => e.k, (e, t) => {
			var r = Se(), i = f(r);
			S(i, {
				get name() {
					return M(t).icon;
				},
				size: 14
			});
			var a = L(i, 1, !0), s = L(a), c = E(s, !0);
			T(r), v(() => {
				p(a, M(t).label), p(c, M(t).n);
			}), o("click", r, () => l.onopen({
				view: "inbox",
				kind: M(t).k
			})), n(e, r);
		}), T(t), n(e, t);
	};
	c(nt, (e) => {
		M(ze).length && e(rt);
	});
	var it = L(nt, 2), at = (e) => {
		var t = Te(), r = f(t, !0), i = L(r), a = (e) => {
			var t = we();
			o("click", t, () => {
				let e = M(K)?.undo;
				P(K, null), e?.();
			}), n(e, t);
		};
		c(i, (e) => {
			M(K).undo && e(a);
		}), T(t), v(() => p(r, M(K).text)), n(e, t);
	};
	c(it, (e) => {
		M(K) && e(at);
	}), T($), r($, (e) => P(je, e), () => M(je)), o("keydown", $, Re), o("click", Ue, () => l.onopen({ compose: {} })), o("click", Ge, () => l.onopen({})), n(s, $), w();
}
g(["click", "keydown"]);
//#endregion
//#region plugins/stable/email/ui/src/NoteView.svelte
var ke = s("<div class=\"meta svelte-cekzj3\"> </div>"), U = s("<div class=\"text svelte-cekzj3\"> </div>"), Ae = s("<button class=\"file svelte-cekzj3\"><!> </button>"), W = s("<div class=\"files svelte-cekzj3\"></div>"), G = s("<div class=\"acts svelte-cekzj3\"><button class=\"atlas-btn svelte-cekzj3\"><!> Reply</button> <button class=\"atlas-btn svelte-cekzj3\"><!> Reply all</button> <button class=\"atlas-btn svelte-cekzj3\"><!> Forward</button></div>"), K = s("<div class=\"body svelte-cekzj3\"><!> <!> <!> <!></div>"), q = s("<article><button class=\"head svelte-cekzj3\"><span class=\"av svelte-cekzj3\"> </span> <b class=\"svelte-cekzj3\"> </b> <span class=\"date svelte-cekzj3\"> </span></button> <!></article>"), J = s("<div class=\"nv svelte-cekzj3\"><h1 class=\"svelte-cekzj3\"> </h1> <div class=\"where svelte-cekzj3\"> <button class=\"link svelte-cekzj3\">Show as a note</button></div> <!></div>"), je = {
	hash: "svelte-cekzj3",
	code: ".nv.svelte-cekzj3 {max-width:980px;margin:0 auto;padding:18px 22px 48px;font-size:calc(14px * var(--ui-scale, 1));color:var(--text);}h1.svelte-cekzj3 {font-size:1.35em;margin:0 0 4px;color:var(--heading);font-weight:650;}.where.svelte-cekzj3 {color:var(--text-faint);font-size:0.88em;margin-bottom:12px;display:flex;gap:12px;flex-wrap:wrap;}.link.svelte-cekzj3 {all:unset;cursor:pointer;color:var(--accent);}.msg.svelte-cekzj3 {border:1px solid var(--border);border-radius:var(--radius);margin:0 0 10px;background:var(--bg);}.head.svelte-cekzj3 {all:unset;box-sizing:border-box;width:100%;display:flex;gap:10px;align-items:center;padding:10px 14px;cursor:pointer;}.head.svelte-cekzj3:hover {background:var(--bg-hover);}.unread.svelte-cekzj3 b:where(.svelte-cekzj3)::after {content:\" ●\";color:var(--accent);}.av.svelte-cekzj3 {flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;color:#fff;background:hsl(var(--h) 45% 46%);}.date.svelte-cekzj3 {margin-left:auto;color:var(--text-faint);font-size:0.86em;}.body.svelte-cekzj3 {padding:0 14px 14px 52px;display:grid;gap:10px;}.meta.svelte-cekzj3 {color:var(--text-muted);font-size:0.88em;}.text.svelte-cekzj3 {white-space:pre-wrap;line-height:1.55;}.files.svelte-cekzj3, .acts.svelte-cekzj3 {display:flex;flex-wrap:wrap;gap:8px;}.file.svelte-cekzj3 {all:unset;cursor:pointer;display:inline-flex;gap:6px;align-items:center;padding:5px 10px;border:1px solid var(--border-strong);border-radius:var(--radius);}.file.svelte-cekzj3:hover {color:var(--accent);}.acts.svelte-cekzj3 .atlas-btn:where(.svelte-cekzj3) {display:inline-flex;gap:6px;align-items:center;}"
};
function Y(e, r) {
	ie(r, !0), u(e, je);
	let s = /^<!-- mail (\{.*\}) -->$/gm, l = /^- !\[\[([^\]]+)\]\]$/gm, m = x(() => r.note.path.replace(/[^/]*$/, ""));
	function h(e, t) {
		let n = [...t.matchAll(l)].map((e) => e[1].includes("/") ? e[1] : M(m) + e[1]), r = t.replace(l, "").replace(/^## Attachments\s*$/m, "").trim(), i = r.startsWith("<div class=\"email-html\">") ? r.replace(/\sdata-remote-src=/gi, " data-src=") : "";
		return {
			from: String(e.from ?? ""),
			to: e.to,
			cc: e.cc,
			date: String(e.date ?? ""),
			message_id: e.message_id,
			seen: e.seen !== !1,
			html: i,
			text: i ? "" : r,
			files: n
		};
	}
	let g = x(() => {
		if (r.note.props.type === "email-thread") {
			let e = [...r.note.text.matchAll(s)];
			return e.flatMap((t, n) => {
				try {
					let i = JSON.parse(t[1]), a = r.note.text.slice(t.index + t[0].length, n + 1 < e.length ? e[n + 1].index : r.note.text.length), o = /^## /m.exec(a);
					return o && (a = a.slice(0, o.index)), [h(i, a)];
				} catch {
					return [];
				}
			});
		}
		let e = r.note.text.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^# .*\n+/, "");
		return [h({
			...r.note.props,
			seen: !0
		}, e)];
	}), _ = k(null), y = x(() => M(_) ?? M(g).map((e, t) => t === M(g).length - 1 || !e.seen ? t : -1).filter((e) => e >= 0)), ne = x(() => String(r.note.props.subject ?? r.note.text.match(/^# (.+)$/m)?.[1] ?? "")), D = document.documentElement.dataset.theme !== "light", O = (e) => e.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || e, ae = (e) => e ? new Date(e).toLocaleString(void 0, {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit"
	}) : "";
	async function A(e, t) {
		try {
			let n = await C(r.atlas, "find", {
				message_id: t.message_id,
				account: r.note.props.account
			});
			n.id ? r.onmail({ reply: {
				id: n.id,
				mode: e
			} }) : r.atlas.toast("Email", "That message is not in the mail index (it may be gone from the server).", "error");
		} catch (e) {
			r.atlas.toast("Email", e.message, "error");
		}
	}
	var j = J(), N = f(j), F = E(N, !0), oe = L(N, 2), I = f(oe), se = L(I);
	T(oe);
	var z = L(oe, 2);
	d(z, 17, () => M(g), a, (e, a, s) => {
		var l = q();
		let u;
		var m = f(l), h = f(m);
		let g;
		var C = E(h, !0), w = L(h, 2), ne = E(w, !0), k = L(w, 2), ie = E(k, !0);
		T(m);
		var j = L(m, 2), N = (e) => {
			var t = K(), i = f(t), s = (e) => {
				var t = ke(), r = E(t);
				v(() => p(r, `to ${M(a).to ?? ""}${M(a).cc ? ` · cc ${M(a).cc}` : ""}`)), n(e, t);
			};
			c(i, (e) => {
				M(a).to && e(s);
			});
			var l = L(i, 2), u = (e) => {
				b(e, {
					get html() {
						return M(a).html;
					},
					get dark() {
						return D;
					}
				});
			}, m = (e) => {
				var t = U(), r = E(t, !0);
				v(() => p(r, M(a).text)), n(e, t);
			};
			c(l, (e) => {
				M(a).html ? e(u) : e(m, -1);
			});
			var h = L(l, 2), g = (e) => {
				var t = W();
				d(t, 20, () => M(a).files, (e) => e, (e, t) => {
					var i = Ae(), a = f(i);
					S(a, {
						name: "attach",
						size: 13
					});
					var s = L(a, 1, !0);
					T(i), v((e) => p(s, e), [() => t.split("/").at(-1)]), o("click", i, () => r.atlas.open(t, void 0, { beside: !0 })), n(e, i);
				}), T(t), n(e, t);
			};
			c(h, (e) => {
				M(a).files.length && e(g);
			});
			var _ = L(h, 2), y = (e) => {
				var t = G(), r = f(t), i = f(r);
				S(i, {
					name: "reply",
					size: 14
				}), R(), T(r);
				var s = L(r, 2), c = f(s);
				S(c, {
					name: "replyall",
					size: 14
				}), R(), T(s);
				var l = L(s, 2), u = f(l);
				S(u, {
					name: "forward",
					size: 14
				}), R(), T(l), T(t), o("click", r, () => A("reply", M(a))), o("click", s, () => A("all", M(a))), o("click", l, () => A("forward", M(a))), n(e, t);
			};
			c(_, (e) => {
				M(a).message_id && e(y);
			}), T(t), n(e, t);
		}, F = x(() => M(y).includes(s));
		c(j, (e) => {
			M(F) && e(N);
		}), T(l), v((e, n, r, o, s) => {
			u = re(l, 1, "msg svelte-cekzj3", null, u, { unread: !M(a).seen }), i(m, "aria-expanded", e), g = t(h, "", g, { "--h": n }), p(C, r), p(ne, o), p(ie, s);
		}, [
			() => M(y).includes(s),
			() => ee(M(a).from),
			() => te({
				name: O(M(a).from),
				addr: M(a).from
			}),
			() => O(M(a).from),
			() => ae(M(a).date)
		]), o("click", m, () => P(_, M(y).includes(s) ? M(y).filter((e) => e !== s) : [...M(y), s], !0)), n(e, l);
	}), T(j), v(() => {
		p(F, M(ne) || "(no subject)"), p(I, `${r.note.props.account ?? "" ?? ""}${r.note.props.folder ? ` · ${r.note.props.folder}` : ""} · ${M(g).length ?? ""} message${M(g).length === 1 ? "" : "s"} `);
	}), o("click", se, () => r.note.showNote()), n(e, j), w();
}
g(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/signin.ts
var X = (e) => (e.plugin.settings.accounts ?? []).filter((e) => e?.name), Z = !1;
async function Q(e, t) {
	if (!Z) {
		Z = !0;
		try {
			await Me(e, t);
		} finally {
			Z = !1;
		}
	}
}
async function Me(e, t) {
	let n = typeof t == "object" ? t : void 0, r = typeof t == "string" ? t : n?.name;
	if (!r) {
		let t = X(e).filter((e) => e.auth === "outlook");
		if (t.length > 1) {
			e.pick({
				placeholder: "Sign in which account?",
				tag: "Outlook",
				items: t.map((e) => ({
					value: e.name,
					title: e.name,
					detail: e.user
				})),
				onpick: (t) => {
					setTimeout(() => void Q(e, t));
				}
			});
			return;
		}
		if (!t.length) {
			e.toast("Outlook sign-in", "No account signs in with Outlook: set one's Sign-in to outlook in Email's settings.");
			return;
		}
		r = t[0].name;
	}
	let i = () => {
		e.toast("Signed in to Outlook", `${r}: its mail can be read now.`, "success"), window.dispatchEvent(new CustomEvent("atlas-email:signed-in", { detail: { account: r } })), C(e, "watch", {}, 30).catch(() => {});
	}, a = (t) => e.toast("Outlook sign-in", String(t?.message ?? t), "error");
	try {
		let t = await C(e, "signin_start", n ? { record: n } : { account: r }, 60), o = () => void C(e, "signin_reopen", { url: t.url }).catch(() => window.open(t.url, "_blank"));
		if (t.flow === "automatic") {
			t.opened || o();
			let n = e.pick({
				placeholder: `Sign in as ${r} in your browser — Atlas finishes by itself when Microsoft sends you back`,
				tag: "Outlook",
				items: [{
					value: "open",
					title: "Open the Microsoft page again",
					detail: t.url
				}],
				onpick: () => {
					o();
				}
			});
			try {
				await C(e, "signin_finish", { account: r }, 660);
			} finally {
				n();
			}
			return i();
		}
		if (t.flow === "code") {
			await navigator.clipboard?.writeText(t.code ?? "").catch(() => {}), t.opened || o();
			let n = e.pick({
				placeholder: `Type ${t.code} (copied) on the Microsoft page and sign in as ${r}. Atlas finishes by itself…`,
				tag: "Outlook",
				items: [{
					value: "open",
					title: "Open the Microsoft page again",
					detail: t.url
				}],
				onpick: () => {
					o();
				}
			});
			try {
				await C(e, "signin_finish", { account: r }, 900);
			} finally {
				n();
			}
			return i();
		}
		let s = !1, c = (t) => {
			s || (s = !0, C(e, "signin_finish", {
				redirect: t,
				account: r
			}, 60).then(i, a));
		}, l = e.signIn ? e.signIn(t.url, t.redirect ?? "https://localhost") : (window.open(t.url, "_blank"), null), u = e.pick({
			placeholder: `Sign in as ${r} in the window that opened. If it ends on a page that does not load, paste its https://localhost/… address here`,
			tag: "Outlook",
			items: [],
			typed: () => "Finish signing in",
			onpick: c
		});
		l?.then((e) => {
			u(), c(e);
		}, () => {});
	} catch (e) {
		a(e);
	}
}
//#endregion
//#region plugins/stable/email/ui/src/main.ts
function Ne(e) {
	let t = () => (e.plugin.settings.accounts ?? []).filter((e) => e?.name), n = (t = {}) => O(e, t);
	e.registerCommand({
		id: "open",
		title: "Email: open mail",
		run: () => n()
	}), e.registerCommand({
		id: "compose",
		title: "Email: new message",
		run: () => n({ compose: {} })
	}), e.registerCommand({
		id: "check",
		title: "Email: check for new mail",
		run: async () => {
			e.toast("Email", "Checking for new mail…");
			try {
				await C(e, "sync", {}, 600);
			} catch (t) {
				e.toast("Email", t.message, "error");
			}
		}
	}), e.registerCommand({
		id: "send",
		title: "Email: send this note…",
		run: () => {
			let t = e.context().active?.path;
			if (!t?.endsWith(".md")) {
				e.toast("Email", "Open the note to send first.");
				return;
			}
			e.readText(t).then((e) => {
				let r = e.replace(/^---\n[\s\S]*?\n---\n/, ""), i = r.match(/^# (.+)$/m)?.[1] ?? t.split("/").pop().replace(/\.md$/, "");
				n({ compose: {
					subject: i,
					body: r.replace(/^# .+\n+/, "")
				} });
			});
		}
	}), e.registerCommand({
		id: "accounts",
		title: "Email: accounts…",
		run: () => e.plugin.openSettings()
	}), e.registerCommand({
		id: "signin",
		title: "Email: sign in to Outlook…",
		run: (t) => void Q(e, t?.record)
	});
	let r = () => e.pick({
		placeholder: "An account from Thunderbird — it becomes a card in Email's settings",
		tag: "Thunderbird",
		items: async () => (await C(e, "thunderbird")).accounts.map((e, t) => ({
			value: String(t),
			title: e.user || e.name,
			detail: `${e.imap_host} · ${e.auth} · ${e.profile}`
		})),
		onpick: async (n) => {
			let r = (await C(e, "thunderbird")).accounts[Number(n)].record;
			try {
				await e.plugin.saveSettings({ accounts: [...t(), r] });
			} catch (t) {
				e.toast("Account not added", String(t.message ?? t), "error");
				return;
			}
			e.toast("Account added", `${r.name}: ${r.auth === "outlook" ? "now “Sign in to Outlook” on its card" : "now type its password on its card (an app password for Gmail)"}.`, "success"), e.plugin.openSettings();
		}
	});
	e.registerCommand({
		id: "thunderbird",
		title: "Email: import an account from Thunderbird…",
		run: () => {
			r();
		}
	}), e.registerCommand({
		id: "thunderbird-mail",
		title: "Email: keep Thunderbird's local mail as notes…",
		run: () => {
			e.pick({
				placeholder: "Which account's local Thunderbird mail (a POP account's, gone from the server)?",
				tag: "Thunderbird",
				items: t().map((e) => ({
					value: e.name,
					title: e.name,
					detail: e.user
				})),
				onpick: async (t) => {
					try {
						let n = await C(e, "thunderbird_mail", {
							account: t,
							dry: !0
						}, 600), r = Object.values(n.missing ?? {}).reduce((e, t) => e + t, 0);
						if (!r) {
							e.toast("Email", n.note ?? "Every local message is already a note.");
							return;
						}
						if (!await F(e, `${r} messages Thunderbird keeps for ${t} are in no note (${Object.entries(n.missing).map(([e, t]) => `${e}: ${t}`).join(", ")}). Write them as notes?`, { ok: "Write them" })) return;
						let i = await C(e, "thunderbird_mail", {
							account: t,
							dry: !1
						}, 1800);
						e.toast("Email", `${i.saved.length} kept as notes${i.failed.length ? `, ${i.failed.length} failed` : ""}.`, i.failed.length ? "error" : "success");
					} catch (t) {
						e.toast("Email", t.message, "error");
					}
				}
			});
		}
	});
	let i = window;
	i.__atlasEmailSignin && window.removeEventListener("atlas-email:signin", i.__atlasEmailSignin), i.__atlasEmailSignin = (t) => void Q(e, t.detail), window.addEventListener("atlas-email:signin", i.__atlasEmailSignin), e.plugin.registerSettingsSection?.({
		id: "rules",
		title: "Rules",
		hint: "What happens to new mail by itself: important, archive, a label, kept as a note.",
		mount: (t) => {
			let n = l(I, {
				target: t,
				props: {
					frame: "page",
					mail: N(e)
				}
			});
			return () => z(n);
		}
	}), e.registerNoteView?.("mail", {
		title: "Mail",
		types: ["email-thread", "email"],
		render: (t, r) => {
			let i = l(Y, {
				target: t,
				props: {
					atlas: e,
					note: r,
					onmail: n
				}
			});
			return () => z(i);
		}
	}), e.registerBlock("email.inbox", (t, r) => {
		let i = l(Oe, {
			target: t,
			props: {
				atlas: e,
				options: r.options ?? {},
				onopen: n
			}
		});
		return () => z(i);
	}, {
		title: "Mail",
		options: [
			{
				key: "limit",
				label: "At most",
				kind: "number"
			},
			{
				key: "unseen",
				label: "Only unread",
				kind: "toggle"
			},
			{
				key: "folder",
				label: "Folder",
				kind: "text"
			},
			{
				key: "account",
				label: "Account",
				kind: "text",
				hint: "an account's name in Email's settings; empty: every account"
			}
		]
	}), e.shell.sideTool({
		id: "mail",
		title: "Email",
		icon: "inbox",
		mount: (t) => {
			let r = l(Oe, {
				target: t,
				props: {
					atlas: e,
					options: { limit: 12 },
					onopen: n
				}
			});
			return () => z(r);
		}
	});
	let a = e.shell.statusItem({
		id: "unread",
		text: "",
		title: "Unread mail — open Email",
		run: () => n()
	}), o, s = () => {
		clearTimeout(o), o = setTimeout(async () => {
			try {
				let { unread: t } = await C(e, "unread_count", {}, 20);
				a.set(t ? `✉ ${t}` : "", `${t} unread — open Email`);
			} catch {
				a.set("", "Email");
			}
		}, 400);
	};
	e.helper.on("changed", s), e.helper.on("new", (t) => {
		if (s(), e.plugin.settings.notify === !1) return;
		let r = t;
		for (let t of r.messages.slice(0, 3)) e.toast(t.from[0]?.name || t.from[0]?.addr || "New mail", t.subject || "(no subject)", "info", { run: () => n({ id: t.id }) });
		r.count > 3 && e.toast("Email", `${r.count - 3} more new messages`, "info", { run: () => n() });
	}), e.helper.on("sent", (t) => {
		let n = t;
		n.later && e.toast("Sent (scheduled)", n.subject, "success");
	}), e.helper.on("notify", (t) => {
		let r = t;
		e.toast("Email", `New mail for the rule “${r.rule}”`, "info", { run: () => n({ id: r.ids[0] }) });
	}), e.helper.on("settings:renamed", (t) => {
		let n = t;
		n?.key === "accounts" && C(e, "rename_account", {
			from: n.from,
			to: n.to
		}).catch((t) => e.toast("Email", `The account's mail kept its old name: ${t.message}`, "error"));
	}), e.helper.on("consent", (n) => {
		let r = n, i = (t) => e.helper.call("consent_answer", {
			id: r.id,
			allow: t,
			settings: e.plugin.settings
		});
		e.pick({
			placeholder: `Claude asks to read ${r.account}${r.user ? ` (${r.user})` : ""}: ${r.what}`,
			tag: "Email",
			items: [
				{
					value: "once",
					title: "Allow this once"
				},
				{
					value: "always",
					title: `Always allow for ${r.account}`,
					detail: "its card's “Claude may read it” becomes always"
				},
				{
					value: "no",
					title: "Don't allow"
				}
			],
			onpick: async (n) => {
				await i(n), n === "always" && await e.plugin.saveSettings({ accounts: t().map((e) => e.name === r.account ? {
					...e,
					claude: "always"
				} : e) });
			}
		});
	});
	let c = setTimeout(() => {
		C(e, "watch", {}, 60).then(s, () => {});
	}, 4e3);
	return () => clearTimeout(c);
}
//#endregion
export { Ne as register };
