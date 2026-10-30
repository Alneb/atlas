import { $ as e, D as t, F as n, H as r, I as i, K as a, L as o, M as s, N as c, O as l, P as u, Q as d, S as f, V as p, W as m, X as h, Y as g, Z as _, _ as v, a as y, at as b, b as x, c as ee, ct as S, d as te, et as C, f as w, h as ne, i as T, it as re, j as E, k as D, l as ie, lt as ae, m as oe, n as O, nt as k, ot as A, q as j, rt as se, st as M, t as N, tt as P, w as F, y as I, z as L } from "./ui-lib/Rules.js";
//#region plugins/stable/email/ui/src/Inbox.svelte
var ce = L("<span class=\"cnt svelte-uoex8y\"> </span>"), le = L("<span class=\"snip svelte-uoex8y\"> </span>"), ue = L("<button role=\"menuitem\" class=\"svelte-uoex8y\"> </button>"), de = L("<div class=\"snooze svelte-uoex8y\" role=\"menu\"></div>"), fe = L("<div class=\"reply svelte-uoex8y\"><textarea rows=\"3\" class=\"svelte-uoex8y\"></textarea> <div class=\"rbar svelte-uoex8y\"><button class=\"ghost svelte-uoex8y\">Open in Email</button> <span class=\"grow svelte-uoex8y\"></span> <button class=\"ghost svelte-uoex8y\">Cancel</button> <button class=\"primary svelte-uoex8y\"><!> Send</button></div></div>"), pe = L("<div role=\"option\" tabindex=\"-1\"><button class=\"open svelte-uoex8y\"><span class=\"av svelte-uoex8y\"> </span> <span class=\"main svelte-uoex8y\"><span class=\"l1 svelte-uoex8y\"><span class=\"who svelte-uoex8y\"> <!></span><!><time class=\"svelte-uoex8y\"> </time></span> <span class=\"l2 svelte-uoex8y\"><span class=\"subj svelte-uoex8y\"> </span><!></span></span></button> <span class=\"acts svelte-uoex8y\"><button title=\"Archive (e)\" class=\"svelte-uoex8y\"><!></button> <button class=\"svelte-uoex8y\"><!></button> <button title=\"Snooze (h)\" class=\"svelte-uoex8y\"><!></button> <button title=\"Reply (r)\" class=\"svelte-uoex8y\"><!></button></span></div> <!> <!>", 1), me = L("<b class=\"svelte-uoex8y\">!</b>"), he = L("<b class=\"svelte-uoex8y\"> </b>"), ge = L("<button><i></i><span class=\"svelte-uoex8y\"> </span><!></button>"), _e = L("<span class=\"svelte-uoex8y\"><b class=\"svelte-uoex8y\"> </b> </span>"), ve = L("<span class=\"faint svelte-uoex8y\"> </span>"), ye = L("<div class=\"today svelte-uoex8y\" title=\"Today, from your calendar\"><!> <!> <!></div>"), be = L("<p class=\"quiet svelte-uoex8y\"> </p>"), R = L("<p class=\"quiet zero svelte-uoex8y\">Inbox zero — nothing waiting for you.</p>"), xe = L("<div class=\"section svelte-uoex8y\"><!> Important</div> <!>", 1), z = L("<span class=\"n svelte-uoex8y\"> </span>"), Se = L("<div class=\"section svelte-uoex8y\">People<!></div> <!>", 1), B = L("<button class=\"svelte-uoex8y\"><!> <b class=\"svelte-uoex8y\"> </b></button>"), Ce = L("<div class=\"folded svelte-uoex8y\"></div>"), we = L("<button class=\"svelte-uoex8y\">Undo</button>"), Te = L("<div class=\"note svelte-uoex8y\" role=\"status\"> <!></div>"), Ee = L("<div class=\"card svelte-uoex8y\" tabindex=\"0\" role=\"listbox\" aria-label=\"Mail to answer\"><header class=\"svelte-uoex8y\"><!> <span class=\"grow svelte-uoex8y\"></span> <button class=\"icon svelte-uoex8y\" title=\"New message (c)\"><!></button> <button class=\"icon svelte-uoex8y\" title=\"Open the Email pane\"><!></button></header> <!> <!> <!> <!> <!> <!></div>"), De = {
	hash: "svelte-uoex8y",
	code: ".card.svelte-uoex8y {display:grid;grid-template-columns:minmax(0, 1fr);gap:1px;font-size:calc(13px * var(--ui-scale, 1));container-type:inline-size;outline:none;position:relative;}.card.svelte-uoex8y:focus-visible {box-shadow:0 0 0 2px var(--accent);border-radius:var(--radius-sm);}header.svelte-uoex8y {display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:4px;}.grow.svelte-uoex8y {flex:1;}.acct.svelte-uoex8y {all:unset;cursor:pointer;display:inline-flex;gap:6px;align-items:center;padding:2px 9px;border-radius:999px;border:1px solid var(--border-strong);font-size:0.9em;}.acct.svelte-uoex8y:hover {background:var(--bg-hover);}.acct.svelte-uoex8y i:where(.svelte-uoex8y) {width:7px;height:7px;border-radius:50%;background:hsl(var(--h) 55% 50%);}.acct.svelte-uoex8y i.spin:where(.svelte-uoex8y) { animation: svelte-uoex8y-pulse 1.2s ease-in-out infinite;}\n  @keyframes svelte-uoex8y-pulse { 50% { opacity: 0.3; } }\n  @media (prefers-reduced-motion: reduce) {.acct.svelte-uoex8y i.spin:where(.svelte-uoex8y) { animation: none;} }.acct.bad.svelte-uoex8y {border-color:var(--red);}.acct.svelte-uoex8y b:where(.svelte-uoex8y) {font-weight:650;}.icon.svelte-uoex8y {all:unset;cursor:pointer;display:grid;place-items:center;width:26px;height:26px;border-radius:var(--radius-sm);color:var(--text-muted);}.icon.svelte-uoex8y:hover {background:var(--bg-hover);color:var(--text);}.section.svelte-uoex8y {display:flex;align-items:center;gap:5px;font-size:0.72em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);margin:8px 0 2px;font-weight:600;}.section.svelte-uoex8y .n:where(.svelte-uoex8y) {text-transform:none;letter-spacing:0;font-weight:500;margin-left:4px;color:var(--accent);}.row.svelte-uoex8y {position:relative;display:flex;align-items:center;border-radius:var(--radius-sm);min-width:0;}.row.svelte-uoex8y:hover, .row.cursor.svelte-uoex8y {background:var(--bg-hover);}.card.svelte-uoex8y:focus-within .row.cursor:where(.svelte-uoex8y) {box-shadow:inset 2px 0 0 var(--accent);}.open.svelte-uoex8y {all:unset;box-sizing:border-box;cursor:pointer;flex:1;min-width:0;display:flex;gap:9px;align-items:center;padding:5px 6px;}.open.svelte-uoex8y:focus-visible {outline:2px solid var(--accent);border-radius:var(--radius-sm);}.av.svelte-uoex8y {flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:10px;font-weight:600;background:hsl(var(--h) 45% 46%);}.main.svelte-uoex8y {flex:1;min-width:0;display:grid;grid-template-columns:minmax(0, 1fr);}.l1.svelte-uoex8y {display:flex;gap:6px;align-items:center;color:var(--text);}.who.svelte-uoex8y {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.cnt.svelte-uoex8y {color:var(--text-faint);font-size:0.88em;margin-left:5px;}time.svelte-uoex8y {flex:none;color:var(--text-faint);font-size:0.88em;font-variant-numeric:tabular-nums;}.l2.svelte-uoex8y {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);}.snip.svelte-uoex8y {color:var(--text-faint);}.unread.svelte-uoex8y .who:where(.svelte-uoex8y), .unread.svelte-uoex8y .subj:where(.svelte-uoex8y) {font-weight:650;color:var(--heading, var(--text));}.acts.svelte-uoex8y {display:none;gap:1px;padding-right:4px;background:var(--bg-hover);}.row.svelte-uoex8y:hover .acts:where(.svelte-uoex8y), .row.cursor.svelte-uoex8y .acts:where(.svelte-uoex8y) {display:flex;}.row.svelte-uoex8y:hover time:where(.svelte-uoex8y), .row.cursor.svelte-uoex8y time:where(.svelte-uoex8y) {visibility:hidden;}.acts.svelte-uoex8y {position:absolute;right:0;top:4px;}.acts.svelte-uoex8y button:where(.svelte-uoex8y) {all:unset;cursor:pointer;display:grid;place-items:center;width:26px;height:26px;border-radius:var(--radius-sm);color:var(--text-muted);}.acts.svelte-uoex8y button:where(.svelte-uoex8y):hover {background:var(--bg-active, var(--bg));color:var(--text);}\n  @media (hover: none) {.acts.svelte-uoex8y {display:flex;position:static;background:none;}.row.svelte-uoex8y time:where(.svelte-uoex8y) {visibility:visible !important;} }.snooze.svelte-uoex8y {display:flex;flex-wrap:wrap;gap:4px;padding:4px 6px 6px 41px;}.snooze.svelte-uoex8y button:where(.svelte-uoex8y), .folded.svelte-uoex8y button:where(.svelte-uoex8y), .note.svelte-uoex8y button:where(.svelte-uoex8y), .rbar.svelte-uoex8y button:where(.svelte-uoex8y) {all:unset;cursor:pointer;padding:3px 9px;border-radius:999px;border:1px solid var(--border-strong);font-size:0.9em;display:inline-flex;gap:6px;align-items:center;}.snooze.svelte-uoex8y button:where(.svelte-uoex8y):hover, .folded.svelte-uoex8y button:where(.svelte-uoex8y):hover {background:var(--bg-hover);}.reply.svelte-uoex8y {display:grid;gap:6px;padding:4px 6px 8px 41px;}.reply.svelte-uoex8y textarea:where(.svelte-uoex8y) {box-sizing:border-box;width:100%;resize:vertical;font:inherit;padding:6px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);}.reply.svelte-uoex8y textarea:where(.svelte-uoex8y):focus {outline:2px solid var(--accent);outline-offset:-1px;}.rbar.svelte-uoex8y {display:flex;gap:6px;align-items:center;}.rbar.svelte-uoex8y .ghost:where(.svelte-uoex8y) {border-color:transparent;color:var(--text-muted);}.rbar.svelte-uoex8y .primary:where(.svelte-uoex8y) {background:var(--accent);color:var(--accent-fg);border-color:transparent;}.rbar.svelte-uoex8y .primary:where(.svelte-uoex8y):disabled {opacity:0.5;cursor:default;}.folded.svelte-uoex8y {display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}.folded.svelte-uoex8y b:where(.svelte-uoex8y) {font-weight:650;color:var(--accent);}.note.svelte-uoex8y {display:flex;gap:10px;align-items:center;margin-top:6px;color:var(--text-muted);font-size:0.92em;}.note.svelte-uoex8y button:where(.svelte-uoex8y) {color:var(--accent);border-color:transparent;padding:1px 6px;}.quiet.svelte-uoex8y {color:var(--text-faint);margin:4px 0;}.today.svelte-uoex8y {display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding:4px 6px;margin-bottom:2px;color:var(--text-muted);font-size:0.92em;border-radius:var(--radius-sm);background:var(--accent-soft);}.today.svelte-uoex8y b:where(.svelte-uoex8y) {font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;}.today.svelte-uoex8y .faint:where(.svelte-uoex8y) {color:var(--text-faint);}.zero.svelte-uoex8y {padding:6px 0;}\n  @container (max-width: 360px) {.snip.svelte-uoex8y {display:none;}.acct.svelte-uoex8y span:where(.svelte-uoex8y) {display:none;} }"
};
function V(i, u) {
	A(u, !0), D(i, De);
	let p = (e, i = ae) => {
		var s = pe(), p = h(s);
		let y;
		var b = g(p), x = g(b);
		let w;
		var T = _(x, !0), D = d(x, 2), O = g(D), k = g(O), A = g(k, !0), j = d(A), N = (e) => {
			var t = ce(), r = _(t, !0);
			a(() => n(r, i().count)), o(e, t);
		};
		c(j, (e) => {
			i().count > 1 && e(N);
		}), S(k);
		var P = d(k), I = (e) => {
			v(e, {
				name: "star",
				size: 12,
				filled: !0
			});
		};
		c(P, (e) => {
			i().flagged && e(I);
		});
		var L = d(P), me = _(L, !0);
		S(O);
		var he = d(O, 2), ge = g(he), _e = _(ge, !0), ve = d(ge), ye = (e) => {
			var t = le(), r = _(t);
			a(() => n(r, ` — ${i().snippet ?? ""}`)), o(e, t);
		};
		c(ve, (e) => {
			i().snippet && e(ye);
		}), S(he), S(D), S(b);
		var be = d(b, 2), R = g(be), xe = g(R);
		v(xe, {
			name: "archive",
			size: 15
		}), S(R);
		var z = d(R, 2), Se = g(z);
		v(Se, {
			name: "star",
			size: 15,
			get filled() {
				return i().flagged;
			}
		}), S(z);
		var B = d(z, 2), Ce = g(B);
		v(Ce, {
			name: "clock",
			size: 15
		}), S(B);
		var we = d(B, 2), Te = g(we);
		v(Te, {
			name: "reply",
			size: 15
		}), S(we), S(be), S(p);
		var Ee = d(p, 2), De = (e) => {
			var t = de();
			E(t, 21, oe, (e) => e.label, (e, t) => {
				var s = ue(), c = _(s, !0);
				a(() => n(c, m(t).label)), r("click", s, () => Pe(i(), m(t).at, m(t).label.split(" · ")[0])), o(e, s);
			}), S(t), o(e, t);
		};
		c(Ee, (e) => {
			m(q) === i().id && e(De);
		});
		var V = d(Ee, 2), H = (e) => {
			var t = fe(), n = g(t);
			re(n), se(n, !0);
			var s = d(n, 2), c = g(s), l = d(c, 4), p = d(l, 2), h = g(p);
			v(h, {
				name: "send",
				size: 13
			}), M(), S(p), S(s), S(t), a((e, t) => {
				F(n, "placeholder", e), n.disabled = !m(J).draft, p.disabled = t;
			}, [() => m(J).draft ? `Reply to ${(m(J).draft.to ?? "").replace(/<.*?>/g, "").trim()}…  (Ctrl+Enter sends)` : "…", () => !m(J).draft || !m(J).text.trim()]), f(n, () => m(J).text, (e) => m(J).text = e), r("click", c, () => {
				u.onopen({ reply: {
					id: i().id,
					mode: "reply"
				} }), C(J, null);
			}), r("click", l, () => C(J, null)), r("click", p, Le), o(e, t);
		};
		c(V, (e) => {
			m(J)?.id === i().id && e(H);
		}), a((e, r, a, o) => {
			y = l(p, 1, "row svelte-uoex8y", null, y, {
				unread: i().unread > 0,
				cursor: m(W) === i().id
			}), F(p, "aria-selected", m(W) === i().id), F(b, "title", i().subject), w = t(x, "", w, { "--h": e }), n(T, r), n(A, a), n(me, o), n(_e, i().subject || "(no subject)"), F(z, "title", i().flagged ? "Unstar (s)" : "Star (s)");
		}, [
			() => ee(i().from.at(-1)?.addr ?? ""),
			() => ie(i().from.at(-1)),
			() => te(i().from, m(ke)),
			() => ne(i().date)
		]), r("click", b, () => {
			C(W, i().id, !0), u.onopen({ id: i().id });
		}), r("click", R, () => Ne(i())), r("click", z, () => Fe(i(), "starred", !i().flagged)), r("click", B, () => C(q, m(q) === i().id ? null : i().id, !0)), r("click", we, () => Ie(i())), o(e, s);
	}, T = I(u, "options", 19, () => ({})), O = k(() => Number(T().limit ?? 8) || 8), N = k(() => String(T().account ?? "")), L = P(e([])), V = P(e([])), H = P(e({})), Oe = P(e([])), ke = P(e([])), U = P(""), Ae = P(!1), W = P(null), G = P(e([])), K = P(null), q = P(null), J = P(null), je = P(void 0), Y = k(() => [...m(L), ...m(V)]), X = /* @__PURE__ */ new Set();
	async function Z() {
		try {
			let e = {
				view: "inbox",
				account: m(N)
			}, [t, n, r, i, a] = await Promise.all([
				y(u.atlas, "accounts", {}, 30),
				y(u.atlas, "list", {
					...e,
					quick: "starred",
					limit: 6
				}, 30),
				y(u.atlas, "list", {
					...e,
					kind: "person",
					quick: "unread",
					limit: m(O)
				}, 30),
				y(u.atlas, "list", {
					...e,
					kind: "person",
					limit: m(O)
				}, 30),
				y(u.atlas, "count", { account: m(N) }, 30)
			]);
			C(Oe, m(N) ? t.accounts.filter((e) => e.name === m(N)) : t.accounts, !0), C(ke, t.own, !0), C(L, n.rows.filter((e) => !X.has(e.id)), !0);
			let o = new Set(m(L).map((e) => e.thread)), s = (e) => e.filter((e) => !o.has(e.thread) && !X.has(e.id) && (o.add(e.thread), !0));
			C(V, [...s(r.rows), ...s(i.rows)].slice(0, m(O)), !0), C(H, a, !0), C(U, ""), y(u.atlas, "agenda", { days: 1 }, 20).then((e) => {
				C(G, e?.events ?? [], !0);
			}).catch(() => {}), m(W) !== null && !m(Y).some((e) => e.id === m(W)) && C(W, null);
		} catch (e) {
			C(U, e.message, !0);
		}
		C(Ae, !0);
	}
	j(() => {
		Z();
		let e = [u.atlas.helper.on("changed", () => Z()), u.atlas.helper.on("new", () => Z())];
		return () => e.forEach((e) => e());
	});
	function Q(e, t) {
		C(K, {
			text: e,
			undo: t
		}, !0);
		let n = m(K);
		setTimeout(() => {
			m(K) === n && C(K, null);
		}, 6e3);
	}
	async function Me(e, t, n) {
		X.add(e.id);
		let r = {
			important: m(L).slice(),
			people: m(V).slice()
		};
		C(L, m(L).filter((t) => t.id !== e.id), !0), C(V, m(V).filter((t) => t.id !== e.id), !0);
		try {
			let { moved: e } = await n();
			Q(t, e?.length ? async () => {
				await y(u.atlas, "undo", { moved: e }), Z();
			} : void 0);
		} catch (e) {
			C(L, r.important, !0), C(V, r.people, !0), Q(`${t} failed: ${e.message}`);
		} finally {
			X.delete(e.id);
		}
	}
	let Ne = (e) => Me(e, "Archived", () => y(u.atlas, "archive", { ids: [e.id] })), Pe = (e, t, n) => (C(q, null), Me(e, `Snoozed until ${n}`, () => y(u.atlas, "snooze", {
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
			await y(u.atlas, "mark", {
				ids: [e.id],
				[t]: n
			}), Q(t === "read" ? n ? "Marked read" : "Marked unread" : n ? "Starred" : "Unstarred", async () => {
				await y(u.atlas, "mark", {
					ids: [e.id],
					[t]: !n
				}), Z();
			}), t === "starred" && Z();
		} catch (t) {
			e.unread = r.unread, e.flagged = r.flagged, Q(`Failed: ${t.message}`);
		}
	}
	async function Ie(e) {
		C(J, {
			id: e.id,
			text: "",
			draft: null,
			sending: !1
		}, !0);
		try {
			let t = await y(u.atlas, "compose_for", {
				id: e.id,
				mode: "reply"
			});
			m(J)?.id === e.id && (m(J).draft = t);
		} catch (e) {
			Q(`Cannot answer: ${e.message}`), C(J, null);
		}
	}
	async function Le() {
		if (!m(J)?.draft || !m(J).text.trim()) return;
		let e = {
			...m(J).draft,
			body: m(J).text
		}, t = m(J).draft.to ?? "";
		m(J).sending = !0;
		let n = Number(w(u.atlas, "undo_send", 10)) * 1e3, r = !1, i = m(J);
		C(J, null), Q(`Sending to ${t.replace(/<.*?>/g, "").trim() || t}…`, async () => {
			r = !0, C(J, {
				...i,
				sending: !1
			}, !0);
		}), setTimeout(async () => {
			if (!r) try {
				await y(u.atlas, "send", e, 300), Q("Sent"), Z();
			} catch (e) {
				C(J, {
					...i,
					sending: !1
				}, !0), Q(`Not sent: ${e.message}`);
			}
		}, n);
	}
	function Re(e) {
		if (e.target.closest("textarea, input")) {
			e.key === "Enter" && (e.ctrlKey || e.metaKey) ? (e.preventDefault(), Le()) : e.key === "Escape" && (C(J, null), m(je)?.focus()), e.stopPropagation();
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		let t = m(Y).findIndex((e) => e.id === m(W)), n = m(Y)[t], r = (e) => {
			let n = m(Y)[Math.max(0, Math.min(m(Y).length - 1, (t < 0 ? -1 : t) + e))];
			n && C(W, n.id, !0);
		}, i = {
			j: () => r(1),
			ArrowDown: () => r(1),
			k: () => r(-1),
			ArrowUp: () => r(-1),
			Enter: () => n && u.onopen({ id: n.id }),
			o: () => n && u.onopen({ id: n.id }),
			e: () => n && Ne(n),
			s: () => n && Fe(n, "starred", !n.flagged),
			u: () => n && Fe(n, "read", n.unread > 0),
			h: () => n && C(q, n.id, !0),
			r: () => n && Ie(n),
			c: () => u.onopen({ compose: {} })
		}[e.key];
		i && (e.preventDefault(), e.stopPropagation(), i());
	}
	let ze = k(() => [[
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
		n: m(H)[e]?.unread ?? 0
	})).filter((e) => e.n > 0)), Be = k(() => m(H).person?.unread ?? 0);
	var $ = Ee(), Ve = g($), He = g(Ve);
	E(He, 17, () => m(Oe), (e) => e.name, (e, i) => {
		var s = ge();
		let f;
		var p = g(s);
		let h, v;
		var y = d(p), b = _(y, !0), x = d(y), te = (e) => {
			var t = me();
			o(e, t);
		}, C = (e) => {
			var t = he(), r = _(t, !0);
			a(() => n(r, m(i).unread)), o(e, t);
		};
		c(x, (e) => {
			m(i).error ? e(te) : m(i).unread && e(C, 1);
		}), S(s), a((e) => {
			f = l(s, 1, "acct svelte-uoex8y", null, f, { bad: !!m(i).error || m(i).status?.state === "error" }), F(s, "title", m(i).error ?? m(i).status?.error ?? m(i).user), h = l(p, 1, "svelte-uoex8y", null, h, { spin: m(i).status?.state === "syncing" }), v = t(p, "", v, { "--h": e }), n(b, m(i).name);
		}, [() => ee(m(i).user ?? m(i).name)]), r("click", s, () => u.onopen({
			view: "inbox",
			account: m(i).name
		})), o(e, s);
	});
	var Ue = d(He, 4), We = g(Ue);
	v(We, {
		name: "pen",
		size: 15
	}), S(Ue);
	var Ge = d(Ue, 2), Ke = g(Ge);
	v(Ke, {
		name: "open",
		size: 15
	}), S(Ge), S(Ve);
	var qe = d(Ve, 2), Je = (e) => {
		var t = ye(), r = g(t);
		v(r, {
			name: "calendar",
			size: 13
		});
		var i = d(r, 2);
		E(i, 17, () => m(G).slice(0, 4), s, (e, t) => {
			var r = _e(), i = g(r), s = _(i, !0), c = d(i);
			S(r), a(() => {
				n(s, m(t).time), n(c, ` ${m(t).summary ?? m(t).line ?? ""}`);
			}), o(e, r);
		});
		var l = d(i, 2), u = (e) => {
			var t = ve(), r = _(t);
			a(() => n(r, `+${m(G).length - 4}`)), o(e, t);
		};
		c(l, (e) => {
			m(G).length > 4 && e(u);
		}), S(t), o(e, t);
	};
	c(qe, (e) => {
		m(G).length && e(Je);
	});
	var Ye = d(qe, 2), Xe = (e) => {
		var t = be(), r = _(t, !0);
		a(() => n(r, m(U))), o(e, t);
	}, Ze = (e) => {
		var t = R();
		o(e, t);
	};
	c(Ye, (e) => {
		m(U) ? e(Xe) : m(Ae) && !m(Y).length && !m(ze).length && e(Ze, 1);
	});
	var Qe = d(Ye, 2), $e = (e) => {
		var t = xe(), n = h(t), r = g(n);
		v(r, {
			name: "star",
			size: 11,
			filled: !0
		}), M(), S(n);
		var i = d(n, 2);
		E(i, 17, () => m(L), (e) => e.thread, (e, t) => {
			p(e, () => m(t));
		}), o(e, t);
	};
	c(Qe, (e) => {
		m(L).length && e($e);
	});
	var et = d(Qe, 2), tt = (e) => {
		var t = Se(), r = h(t), i = d(g(r)), s = (e) => {
			var t = z(), r = _(t);
			a(() => n(r, `${m(Be) ?? ""} unread`)), o(e, t);
		};
		c(i, (e) => {
			m(Be) && e(s);
		}), S(r);
		var l = d(r, 2);
		E(l, 17, () => m(V), (e) => e.thread, (e, t) => {
			p(e, () => m(t));
		}), o(e, t);
	};
	c(et, (e) => {
		m(V).length && e(tt);
	});
	var nt = d(et, 2), rt = (e) => {
		var t = Ce();
		E(t, 21, () => m(ze), (e) => e.k, (e, t) => {
			var i = B(), s = g(i);
			v(s, {
				get name() {
					return m(t).icon;
				},
				size: 14
			});
			var c = d(s, 1, !0), l = d(c), f = _(l, !0);
			S(i), a(() => {
				n(c, m(t).label), n(f, m(t).n);
			}), r("click", i, () => u.onopen({
				view: "inbox",
				kind: m(t).k
			})), o(e, i);
		}), S(t), o(e, t);
	};
	c(nt, (e) => {
		m(ze).length && e(rt);
	});
	var it = d(nt, 2), at = (e) => {
		var t = Te(), i = g(t, !0), s = d(i), l = (e) => {
			var t = we();
			r("click", t, () => {
				let e = m(K)?.undo;
				C(K, null), e?.();
			}), o(e, t);
		};
		c(s, (e) => {
			m(K).undo && e(l);
		}), S(t), a(() => n(i, m(K).text)), o(e, t);
	};
	c(it, (e) => {
		m(K) && e(at);
	}), S($), x($, (e) => C(je, e), () => m(je)), r("keydown", $, Re), r("click", Ue, () => u.onopen({ compose: {} })), r("click", Ge, () => u.onopen({})), o(i, $), b();
}
p(["click", "keydown"]);
//#endregion
//#region plugins/stable/email/ui/src/NoteView.svelte
var H = L("<div class=\"meta svelte-cekzj3\"> </div>"), Oe = L("<div class=\"text svelte-cekzj3\"> </div>"), ke = L("<button class=\"file svelte-cekzj3\"><!> </button>"), U = L("<div class=\"files svelte-cekzj3\"></div>"), Ae = L("<div class=\"acts svelte-cekzj3\"><button class=\"atlas-btn svelte-cekzj3\"><!> Reply</button> <button class=\"atlas-btn svelte-cekzj3\"><!> Reply all</button> <button class=\"atlas-btn svelte-cekzj3\"><!> Forward</button></div>"), W = L("<div class=\"body svelte-cekzj3\"><!> <!> <!> <!></div>"), G = L("<article><button class=\"head svelte-cekzj3\"><span class=\"av svelte-cekzj3\"> </span> <b class=\"svelte-cekzj3\"> </b> <span class=\"date svelte-cekzj3\"> </span></button> <!></article>"), K = L("<div class=\"nv svelte-cekzj3\"><h1 class=\"svelte-cekzj3\"> </h1> <div class=\"where svelte-cekzj3\"> <button class=\"link svelte-cekzj3\">Show as a note</button></div> <!></div>"), q = {
	hash: "svelte-cekzj3",
	code: ".nv.svelte-cekzj3 {max-width:980px;margin:0 auto;padding:18px 22px 48px;font-size:calc(14px * var(--ui-scale, 1));color:var(--text);}h1.svelte-cekzj3 {font-size:1.35em;margin:0 0 4px;color:var(--heading);font-weight:650;}.where.svelte-cekzj3 {color:var(--text-faint);font-size:0.88em;margin-bottom:12px;display:flex;gap:12px;flex-wrap:wrap;}.link.svelte-cekzj3 {all:unset;cursor:pointer;color:var(--accent);}.msg.svelte-cekzj3 {border:1px solid var(--border);border-radius:var(--radius);margin:0 0 10px;background:var(--bg);}.head.svelte-cekzj3 {all:unset;box-sizing:border-box;width:100%;display:flex;gap:10px;align-items:center;padding:10px 14px;cursor:pointer;}.head.svelte-cekzj3:hover {background:var(--bg-hover);}.unread.svelte-cekzj3 b:where(.svelte-cekzj3)::after {content:\" ●\";color:var(--accent);}.av.svelte-cekzj3 {flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;color:#fff;background:hsl(var(--h) 45% 46%);}.date.svelte-cekzj3 {margin-left:auto;color:var(--text-faint);font-size:0.86em;}.body.svelte-cekzj3 {padding:0 14px 14px 52px;display:grid;gap:10px;}.meta.svelte-cekzj3 {color:var(--text-muted);font-size:0.88em;}.text.svelte-cekzj3 {white-space:pre-wrap;line-height:1.55;}.files.svelte-cekzj3, .acts.svelte-cekzj3 {display:flex;flex-wrap:wrap;gap:8px;}.file.svelte-cekzj3 {all:unset;cursor:pointer;display:inline-flex;gap:6px;align-items:center;padding:5px 10px;border:1px solid var(--border-strong);border-radius:var(--radius);}.file.svelte-cekzj3:hover {color:var(--accent);}.acts.svelte-cekzj3 .atlas-btn:where(.svelte-cekzj3) {display:inline-flex;gap:6px;align-items:center;}"
};
function J(e, i) {
	A(i, !0), D(e, q);
	let u = /^<!-- mail (\{.*\}) -->$/gm, f = /^- !\[\[([^\]]+)\]\]$/gm, p = k(() => i.note.path.replace(/[^/]*$/, ""));
	function h(e, t) {
		let n = [...t.matchAll(f)].map((e) => e[1].includes("/") ? e[1] : m(p) + e[1]), r = t.replace(f, "").replace(/^## Attachments\s*$/m, "").trim(), i = r.startsWith("<div class=\"email-html\">") ? r.replace(/\sdata-remote-src=/gi, " data-src=") : "";
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
	let x = k(() => {
		if (i.note.props.type === "email-thread") {
			let e = [...i.note.text.matchAll(u)];
			return e.flatMap((t, n) => {
				try {
					let r = JSON.parse(t[1]), a = i.note.text.slice(t.index + t[0].length, n + 1 < e.length ? e[n + 1].index : i.note.text.length), o = /^## /m.exec(a);
					return o && (a = a.slice(0, o.index)), [h(r, a)];
				} catch {
					return [];
				}
			});
		}
		let e = i.note.text.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^# .*\n+/, "");
		return [h({
			...i.note.props,
			seen: !0
		}, e)];
	}), te = P(null), w = k(() => m(te) ?? m(x).map((e, t) => t === m(x).length - 1 || !e.seen ? t : -1).filter((e) => e >= 0)), ne = k(() => String(i.note.props.subject ?? i.note.text.match(/^# (.+)$/m)?.[1] ?? "")), T = document.documentElement.dataset.theme !== "light", re = (e) => e.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || e, ae = (e) => e ? new Date(e).toLocaleString(void 0, {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit"
	}) : "";
	async function oe(e, t) {
		try {
			let n = await y(i.atlas, "find", {
				message_id: t.message_id,
				account: i.note.props.account
			});
			n.id ? i.onmail({ reply: {
				id: n.id,
				mode: e
			} }) : i.atlas.toast("Email", "That message is not in the mail index (it may be gone from the server).", "error");
		} catch (e) {
			i.atlas.toast("Email", e.message, "error");
		}
	}
	var j = K(), se = g(j), N = _(se, !0), I = d(se, 2), L = g(I), ce = d(L);
	S(I);
	var le = d(I, 2);
	E(le, 17, () => m(x), s, (e, s, u) => {
		var f = G();
		let p;
		var h = g(f), y = g(h);
		let b;
		var x = _(y, !0), ne = d(y, 2), D = _(ne, !0), A = d(ne, 2), j = _(A, !0);
		S(h);
		var se = d(h, 2), N = (e) => {
			var t = W(), l = g(t), u = (e) => {
				var t = H(), r = _(t);
				a(() => n(r, `to ${m(s).to ?? ""}${m(s).cc ? ` · cc ${m(s).cc}` : ""}`)), o(e, t);
			};
			c(l, (e) => {
				m(s).to && e(u);
			});
			var f = d(l, 2), p = (e) => {
				O(e, {
					get html() {
						return m(s).html;
					},
					get dark() {
						return T;
					}
				});
			}, h = (e) => {
				var t = Oe(), r = _(t, !0);
				a(() => n(r, m(s).text)), o(e, t);
			};
			c(f, (e) => {
				m(s).html ? e(p) : e(h, -1);
			});
			var y = d(f, 2), b = (e) => {
				var t = U();
				E(t, 20, () => m(s).files, (e) => e, (e, t) => {
					var s = ke(), c = g(s);
					v(c, {
						name: "attach",
						size: 13
					});
					var l = d(c, 1, !0);
					S(s), a((e) => n(l, e), [() => t.split("/").at(-1)]), r("click", s, () => i.atlas.open(t, void 0, { beside: !0 })), o(e, s);
				}), S(t), o(e, t);
			};
			c(y, (e) => {
				m(s).files.length && e(b);
			});
			var x = d(y, 2), ee = (e) => {
				var t = Ae(), n = g(t), i = g(n);
				v(i, {
					name: "reply",
					size: 14
				}), M(), S(n);
				var a = d(n, 2), c = g(a);
				v(c, {
					name: "replyall",
					size: 14
				}), M(), S(a);
				var l = d(a, 2), u = g(l);
				v(u, {
					name: "forward",
					size: 14
				}), M(), S(l), S(t), r("click", n, () => oe("reply", m(s))), r("click", a, () => oe("all", m(s))), r("click", l, () => oe("forward", m(s))), o(e, t);
			};
			c(x, (e) => {
				m(s).message_id && e(ee);
			}), S(t), o(e, t);
		}, P = k(() => m(w).includes(u));
		c(se, (e) => {
			m(P) && e(N);
		}), S(f), a((e, r, i, a, o) => {
			p = l(f, 1, "msg svelte-cekzj3", null, p, { unread: !m(s).seen }), F(h, "aria-expanded", e), b = t(y, "", b, { "--h": r }), n(x, i), n(D, a), n(j, o);
		}, [
			() => m(w).includes(u),
			() => ee(m(s).from),
			() => ie({
				name: re(m(s).from),
				addr: m(s).from
			}),
			() => re(m(s).from),
			() => ae(m(s).date)
		]), r("click", h, () => C(te, m(w).includes(u) ? m(w).filter((e) => e !== u) : [...m(w), u], !0)), o(e, f);
	}), S(j), a(() => {
		n(N, m(ne) || "(no subject)"), n(L, `${i.note.props.account ?? "" ?? ""}${i.note.props.folder ? ` · ${i.note.props.folder}` : ""} · ${m(x).length ?? ""} message${m(x).length === 1 ? "" : "s"} `);
	}), r("click", ce, () => i.note.showNote()), o(e, j), b();
}
p(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/signin.ts
var je = (e) => (e.plugin.settings.accounts ?? []).filter((e) => e?.name), Y = !1;
async function X(e, t) {
	if (!Y) {
		Y = !0;
		try {
			await Z(e, t);
		} finally {
			Y = !1;
		}
	}
}
async function Z(e, t) {
	let n = typeof t == "object" ? t : void 0, r = typeof t == "string" ? t : n?.name;
	if (!r) {
		let t = je(e).filter((e) => e.auth === "outlook");
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
					setTimeout(() => void X(e, t));
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
		e.toast("Signed in to Outlook", `${r}: its mail can be read now.`, "success"), window.dispatchEvent(new CustomEvent("atlas-email:signed-in", { detail: { account: r } })), y(e, "watch", {}, 30).catch(() => {});
	}, a = (t) => e.toast("Outlook sign-in", String(t?.message ?? t), "error");
	try {
		let t = await y(e, "signin_start", n ? { record: n } : { account: r }, 60), o = () => void y(e, "signin_reopen", { url: t.url }).catch(() => window.open(t.url, "_blank"));
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
				await y(e, "signin_finish", { account: r }, 660);
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
				await y(e, "signin_finish", { account: r }, 900);
			} finally {
				n();
			}
			return i();
		}
		let s = !1, c = (t) => {
			s || (s = !0, y(e, "signin_finish", {
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
function Q(e) {
	let t = () => (e.plugin.settings.accounts ?? []).filter((e) => e?.name), n = (t = {}) => {
		window.__atlasEmailOpen = t, e.openView(void 0, {
			title: "Email",
			icon: "mail"
		}), setTimeout(() => window.dispatchEvent(new CustomEvent("atlas-email:open", { detail: t })), 0);
	};
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
				await y(e, "sync", {}, 600);
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
		run: (t) => void X(e, t?.record)
	});
	let r = () => e.pick({
		placeholder: "An account from Thunderbird — it becomes a card in Email's settings",
		tag: "Thunderbird",
		items: async () => (await y(e, "thunderbird")).accounts.map((e, t) => ({
			value: String(t),
			title: e.user || e.name,
			detail: `${e.imap_host} · ${e.auth} · ${e.profile}`
		})),
		onpick: async (n) => {
			let r = (await y(e, "thunderbird")).accounts[Number(n)].record;
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
						let n = await y(e, "thunderbird_mail", {
							account: t,
							dry: !0
						}, 600), r = Object.values(n.missing ?? {}).reduce((e, t) => e + t, 0);
						if (!r) {
							e.toast("Email", n.note ?? "Every local message is already a note.");
							return;
						}
						if (!await T(e, `${r} messages Thunderbird keeps for ${t} are in no note (${Object.entries(n.missing).map(([e, t]) => `${e}: ${t}`).join(", ")}). Write them as notes?`, { ok: "Write them" })) return;
						let i = await y(e, "thunderbird_mail", {
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
	let a = window;
	a.__atlasEmailSignin && window.removeEventListener("atlas-email:signin", a.__atlasEmailSignin), a.__atlasEmailSignin = (t) => void X(e, t.detail), window.addEventListener("atlas-email:signin", a.__atlasEmailSignin), e.plugin.registerSettingsSection?.({
		id: "rules",
		title: "Rules",
		hint: "What happens to new mail by itself: important, archive, a label, kept as a note.",
		mount: (t) => {
			let r = u(N, {
				target: t,
				props: {
					inline: !0,
					mail: {
						call: (t, n = {}, r = 120) => y(e, t, n, r),
						search: (e) => n({ search: e }),
						toast: (t, n = "info") => e.toast("Email", t, n),
						atlas: { open: (t, n, r) => e.open(t, n, r) }
					}
				}
			});
			return () => i(r);
		}
	}), e.registerNoteView?.("mail", {
		title: "Mail",
		types: ["email-thread", "email"],
		render: (t, r) => {
			let a = u(J, {
				target: t,
				props: {
					atlas: e,
					note: r,
					onmail: n
				}
			});
			return () => i(a);
		}
	}), e.registerBlock("email.inbox", (t, r) => {
		let a = u(V, {
			target: t,
			props: {
				atlas: e,
				options: r.options ?? {},
				onopen: n
			}
		});
		return () => i(a);
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
			let r = u(V, {
				target: t,
				props: {
					atlas: e,
					options: { limit: 12 },
					onopen: n
				}
			});
			return () => i(r);
		}
	});
	let o = e.shell.statusItem({
		id: "unread",
		text: "",
		title: "Unread mail — open Email",
		run: () => n()
	}), s, c = () => {
		clearTimeout(s), s = setTimeout(async () => {
			try {
				let { unread: t } = await y(e, "unread_count", {}, 20);
				o.set(t ? `✉ ${t}` : "", `${t} unread — open Email`);
			} catch {
				o.set("", "Email");
			}
		}, 400);
	};
	e.helper.on("changed", c), e.helper.on("new", (t) => {
		if (c(), e.plugin.settings.notify === !1) return;
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
		n?.key === "accounts" && y(e, "rename_account", {
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
	let l = setTimeout(() => {
		y(e, "watch", {}, 60).then(c, () => {});
	}, 4e3);
	return () => clearTimeout(l);
}
//#endregion
export { Q as register };
