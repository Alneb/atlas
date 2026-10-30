import { B as e, C as t, E as n, H as r, I as i, K as a, L as o, M as s, N as c, O as l, P as u, Q as d, R as f, V as p, W as m, Y as h, Z as g, a as _, at as v, ct as ee, dt as y, et as b, f as te, ft as x, g as S, h as C, i as w, it as T, l as E, lt as ne, mt as re, nt as D, o as O, ot as k, p as ie, pt as A, q as j, r as M, rt as N, st as P, t as F, tt as I, ut as ae, v as oe, w as se, x as L, y as ce, z as R } from "./ui-lib/Rules.js";
//#region plugins/stable/email/ui/src/Inbox.svelte
var le = m("<span class=\"cnt svelte-uoex8y\"> </span>"), ue = m("<span class=\"snip svelte-uoex8y\"> </span>"), de = m("<button role=\"menuitem\" class=\"svelte-uoex8y\"> </button>"), fe = m("<div class=\"snooze svelte-uoex8y\" role=\"menu\"></div>"), pe = m("<div class=\"reply svelte-uoex8y\"><textarea rows=\"3\" class=\"svelte-uoex8y\"></textarea> <div class=\"rbar svelte-uoex8y\"><button class=\"ghost svelte-uoex8y\">Open in Email</button> <span class=\"grow svelte-uoex8y\"></span> <button class=\"ghost svelte-uoex8y\">Cancel</button> <button class=\"primary svelte-uoex8y\"><!> Send</button></div></div>"), me = m("<div role=\"option\" tabindex=\"-1\"><button class=\"open svelte-uoex8y\"><span class=\"av svelte-uoex8y\"> </span> <span class=\"main svelte-uoex8y\"><span class=\"l1 svelte-uoex8y\"><span class=\"who svelte-uoex8y\"> <!></span><!><time class=\"svelte-uoex8y\"> </time></span> <span class=\"l2 svelte-uoex8y\"><span class=\"subj svelte-uoex8y\"> </span><!></span></span></button> <span class=\"acts svelte-uoex8y\"><button title=\"Archive (e)\" class=\"svelte-uoex8y\"><!></button> <button class=\"svelte-uoex8y\"><!></button> <button title=\"Snooze (h)\" class=\"svelte-uoex8y\"><!></button> <button title=\"Reply (r)\" class=\"svelte-uoex8y\"><!></button></span></div> <!> <!>", 1), he = m("<b class=\"svelte-uoex8y\">!</b>"), ge = m("<b class=\"svelte-uoex8y\"> </b>"), _e = m("<button><i></i><span class=\"svelte-uoex8y\"> </span><!></button>"), ve = m("<span class=\"svelte-uoex8y\"><b class=\"svelte-uoex8y\"> </b> </span>"), ye = m("<span class=\"faint svelte-uoex8y\"> </span>"), z = m("<div class=\"today svelte-uoex8y\" title=\"Today, from your calendar\"><!> <!> <!></div>"), be = m("<p class=\"quiet svelte-uoex8y\"> </p>"), B = m("<p class=\"quiet zero svelte-uoex8y\">Inbox zero — nothing waiting for you.</p>"), xe = m("<div class=\"section svelte-uoex8y\"><!> Important</div> <!>", 1), V = m("<span class=\"n svelte-uoex8y\"> </span>"), Se = m("<div class=\"section svelte-uoex8y\">People<!></div> <!>", 1), Ce = m("<button class=\"svelte-uoex8y\"><!> <b class=\"svelte-uoex8y\"> </b></button>"), we = m("<div class=\"folded svelte-uoex8y\"></div>"), Te = m("<button class=\"svelte-uoex8y\">Undo</button>"), Ee = m("<div class=\"note svelte-uoex8y\" role=\"status\"> <!></div>"), De = m("<div class=\"card svelte-uoex8y\" tabindex=\"0\" role=\"listbox\" aria-label=\"Mail to answer\"><header class=\"svelte-uoex8y\"><!> <span class=\"grow svelte-uoex8y\"></span> <button class=\"icon svelte-uoex8y\" title=\"New message (c)\"><!></button> <button class=\"icon svelte-uoex8y\" title=\"Open the Email pane\"><!></button></header> <!> <!> <!> <!> <!> <!></div>"), Oe = {
	hash: "svelte-uoex8y",
	code: ".card.svelte-uoex8y {display:grid;grid-template-columns:minmax(0, 1fr);gap:1px;font-size:calc(13px * var(--ui-scale, 1));container-type:inline-size;outline:none;position:relative;}.card.svelte-uoex8y:focus-visible {box-shadow:0 0 0 2px var(--accent);border-radius:var(--radius-sm);}header.svelte-uoex8y {display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:4px;}.grow.svelte-uoex8y {flex:1;}.acct.svelte-uoex8y {all:unset;cursor:pointer;display:inline-flex;gap:6px;align-items:center;padding:2px 9px;border-radius:999px;border:1px solid var(--border-strong);font-size:0.9em;}.acct.svelte-uoex8y:hover {background:var(--bg-hover);}.acct.svelte-uoex8y i:where(.svelte-uoex8y) {width:7px;height:7px;border-radius:50%;background:hsl(var(--h) 55% 50%);}.acct.svelte-uoex8y i.spin:where(.svelte-uoex8y) { animation: svelte-uoex8y-pulse 1.2s ease-in-out infinite;}\n  @keyframes svelte-uoex8y-pulse { 50% { opacity: 0.3; } }\n  @media (prefers-reduced-motion: reduce) {.acct.svelte-uoex8y i.spin:where(.svelte-uoex8y) { animation: none;} }.acct.bad.svelte-uoex8y {border-color:var(--red);}.acct.svelte-uoex8y b:where(.svelte-uoex8y) {font-weight:650;}.icon.svelte-uoex8y {all:unset;cursor:pointer;display:grid;place-items:center;width:26px;height:26px;border-radius:var(--radius-sm);color:var(--text-muted);}.icon.svelte-uoex8y:hover {background:var(--bg-hover);color:var(--text);}.section.svelte-uoex8y {display:flex;align-items:center;gap:5px;font-size:0.72em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);margin:8px 0 2px;font-weight:600;}.section.svelte-uoex8y .n:where(.svelte-uoex8y) {text-transform:none;letter-spacing:0;font-weight:500;margin-left:4px;color:var(--accent);}.row.svelte-uoex8y {position:relative;display:flex;align-items:center;border-radius:var(--radius-sm);min-width:0;}.row.svelte-uoex8y:hover, .row.cursor.svelte-uoex8y {background:var(--bg-hover);}.card.svelte-uoex8y:focus-within .row.cursor:where(.svelte-uoex8y) {box-shadow:inset 2px 0 0 var(--accent);}.open.svelte-uoex8y {all:unset;box-sizing:border-box;cursor:pointer;flex:1;min-width:0;display:flex;gap:9px;align-items:center;padding:5px 6px;}.open.svelte-uoex8y:focus-visible {outline:2px solid var(--accent);border-radius:var(--radius-sm);}.av.svelte-uoex8y {flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:10px;font-weight:600;background:hsl(var(--h) 45% 46%);}.main.svelte-uoex8y {flex:1;min-width:0;display:grid;grid-template-columns:minmax(0, 1fr);}.l1.svelte-uoex8y {display:flex;gap:6px;align-items:center;color:var(--text);}.who.svelte-uoex8y {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.cnt.svelte-uoex8y {color:var(--text-faint);font-size:0.88em;margin-left:5px;}time.svelte-uoex8y {flex:none;color:var(--text-faint);font-size:0.88em;font-variant-numeric:tabular-nums;}.l2.svelte-uoex8y {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);}.snip.svelte-uoex8y {color:var(--text-faint);}.unread.svelte-uoex8y .who:where(.svelte-uoex8y), .unread.svelte-uoex8y .subj:where(.svelte-uoex8y) {font-weight:650;color:var(--heading, var(--text));}.acts.svelte-uoex8y {display:none;gap:1px;padding-right:4px;background:var(--bg-hover);}.row.svelte-uoex8y:hover .acts:where(.svelte-uoex8y), .row.cursor.svelte-uoex8y .acts:where(.svelte-uoex8y) {display:flex;}.row.svelte-uoex8y:hover time:where(.svelte-uoex8y), .row.cursor.svelte-uoex8y time:where(.svelte-uoex8y) {visibility:hidden;}.acts.svelte-uoex8y {position:absolute;right:0;top:4px;}.acts.svelte-uoex8y button:where(.svelte-uoex8y) {all:unset;cursor:pointer;display:grid;place-items:center;width:26px;height:26px;border-radius:var(--radius-sm);color:var(--text-muted);}.acts.svelte-uoex8y button:where(.svelte-uoex8y):hover {background:var(--bg-active, var(--bg));color:var(--text);}\n  @media (hover: none) {.acts.svelte-uoex8y {display:flex;position:static;background:none;}.row.svelte-uoex8y time:where(.svelte-uoex8y) {visibility:visible !important;} }.snooze.svelte-uoex8y {display:flex;flex-wrap:wrap;gap:4px;padding:4px 6px 6px 41px;}.snooze.svelte-uoex8y button:where(.svelte-uoex8y), .folded.svelte-uoex8y button:where(.svelte-uoex8y), .note.svelte-uoex8y button:where(.svelte-uoex8y), .rbar.svelte-uoex8y button:where(.svelte-uoex8y) {all:unset;cursor:pointer;padding:3px 9px;border-radius:999px;border:1px solid var(--border-strong);font-size:0.9em;display:inline-flex;gap:6px;align-items:center;}.snooze.svelte-uoex8y button:where(.svelte-uoex8y):hover, .folded.svelte-uoex8y button:where(.svelte-uoex8y):hover {background:var(--bg-hover);}.reply.svelte-uoex8y {display:grid;gap:6px;padding:4px 6px 8px 41px;}.reply.svelte-uoex8y textarea:where(.svelte-uoex8y) {box-sizing:border-box;width:100%;resize:vertical;font:inherit;padding:6px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);}.reply.svelte-uoex8y textarea:where(.svelte-uoex8y):focus {outline:2px solid var(--accent);outline-offset:-1px;}.rbar.svelte-uoex8y {display:flex;gap:6px;align-items:center;}.rbar.svelte-uoex8y .ghost:where(.svelte-uoex8y) {border-color:transparent;color:var(--text-muted);}.rbar.svelte-uoex8y .primary:where(.svelte-uoex8y) {background:var(--accent);color:var(--accent-fg);border-color:transparent;}.rbar.svelte-uoex8y .primary:where(.svelte-uoex8y):disabled {opacity:0.5;cursor:default;}.folded.svelte-uoex8y {display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}.folded.svelte-uoex8y b:where(.svelte-uoex8y) {font-weight:650;color:var(--accent);}.note.svelte-uoex8y {display:flex;gap:10px;align-items:center;margin-top:6px;color:var(--text-muted);font-size:0.92em;}.note.svelte-uoex8y button:where(.svelte-uoex8y) {color:var(--accent);border-color:transparent;padding:1px 6px;}.quiet.svelte-uoex8y {color:var(--text-faint);margin:4px 0;}.today.svelte-uoex8y {display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding:4px 6px;margin-bottom:2px;color:var(--text-muted);font-size:0.92em;border-radius:var(--radius-sm);background:var(--accent-soft);}.today.svelte-uoex8y b:where(.svelte-uoex8y) {font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;}.today.svelte-uoex8y .faint:where(.svelte-uoex8y) {color:var(--text-faint);}.zero.svelte-uoex8y {padding:6px 0;}\n  @container (max-width: 360px) {.snip.svelte-uoex8y {display:none;}.acct.svelte-uoex8y span:where(.svelte-uoex8y) {display:none;} }"
};
function H(a, p) {
	y(p, !0), u(a, Oe);
	let m = (t, a = re) => {
		var o = me(), u = I(o);
		let d;
		var m = b(u), _ = b(m);
		let y;
		var S = D(_, !0), w = N(_, 2), T = b(w), E = b(T), O = b(E, !0), k = N(O), M = (t) => {
			var n = le(), i = D(n, !0);
			g(() => e(i, a().count)), r(t, n);
		};
		f(k, (e) => {
			a().count > 1 && e(M);
		}), A(E);
		var P = N(E), F = (e) => {
			L(e, {
				name: "star",
				size: 12,
				filled: !0
			});
		};
		f(P, (e) => {
			a().flagged && e(F);
		});
		var ae = N(P), se = D(ae, !0);
		A(T);
		var R = N(T, 2), he = b(R), ge = D(he, !0), _e = N(he), ve = (t) => {
			var n = ue(), i = D(n);
			g(() => e(i, ` — ${a().snippet ?? ""}`)), r(t, n);
		};
		f(_e, (e) => {
			a().snippet && e(ve);
		}), A(R), A(w), A(m);
		var ye = N(m, 2), z = b(ye), be = b(z);
		L(be, {
			name: "archive",
			size: 15
		}), A(z);
		var B = N(z, 2), xe = b(B);
		L(xe, {
			name: "star",
			size: 15,
			get filled() {
				return a().flagged;
			}
		}), A(B);
		var V = N(B, 2), Se = b(V);
		L(Se, {
			name: "clock",
			size: 15
		}), A(V);
		var Ce = N(V, 2), we = b(Ce);
		L(we, {
			name: "reply",
			size: 15
		}), A(Ce), A(ye), A(u);
		var Te = N(u, 2), Ee = (t) => {
			var n = fe();
			i(n, 21, oe, (e) => e.label, (t, n) => {
				var i = de(), o = D(i, !0);
				g(() => e(o, h(n).label)), j("click", i, () => Pe(a(), h(n).at, h(n).label.split(" · ")[0])), r(t, i);
			}), A(n), r(t, n);
		};
		f(Te, (e) => {
			h(q) === a().id && e(Ee);
		});
		var De = N(Te, 2), Oe = (e) => {
			var t = pe(), i = b(t);
			ne(i), ee(i, !0);
			var o = N(i, 2), s = b(o), c = N(s, 4), u = N(c, 2), d = b(u);
			L(d, {
				name: "send",
				size: 13
			}), x(), A(u), A(o), A(t), g((e, t) => {
				l(i, "placeholder", e), i.disabled = !h(J).draft, u.disabled = t;
			}, [() => h(J).draft ? `Reply to ${(h(J).draft.to ?? "").replace(/<.*?>/g, "").trim()}…  (Ctrl+Enter sends)` : "…", () => !h(J).draft || !h(J).text.trim()]), n(i, () => h(J).text, (e) => h(J).text = e), j("click", s, () => {
				p.onopen({ reply: {
					id: a().id,
					mode: "reply"
				} }), v(J, null);
			}), j("click", c, () => v(J, null)), j("click", u, Le), r(e, t);
		};
		f(De, (e) => {
			h(J)?.id === a().id && e(Oe);
		}), g((t, n, r, i) => {
			d = c(u, 1, "row svelte-uoex8y", null, d, {
				unread: a().unread > 0,
				cursor: h(W) === a().id
			}), l(u, "aria-selected", h(W) === a().id), l(m, "title", a().subject), y = s(_, "", y, { "--h": t }), e(S, n), e(O, r), e(se, i), e(ge, a().subject || "(no subject)"), l(B, "title", a().flagged ? "Unstar (s)" : "Star (s)");
		}, [
			() => te(a().from.at(-1)?.addr ?? ""),
			() => ie(a().from.at(-1)),
			() => C(a().from, h(ke)),
			() => ce(a().date)
		]), j("click", m, () => {
			v(W, a().id, !0), p.onopen({ id: a().id });
		}), j("click", z, () => Ne(a())), j("click", B, () => Fe(a(), "starred", !a().flagged)), j("click", V, () => v(q, h(q) === a().id ? null : a().id, !0)), j("click", Ce, () => Ie(a())), r(t, o);
	}, _ = t(p, "options", 19, () => ({})), w = P(() => Number(_().limit ?? 8) || 8), O = P(() => String(_().account ?? "")), M = k(T([])), F = k(T([])), R = k(T({})), H = k(T([])), ke = k(T([])), U = k(""), Ae = k(!1), W = k(null), G = k(T([])), K = k(null), q = k(null), J = k(null), je = k(void 0), Y = P(() => [...h(M), ...h(F)]), X = /* @__PURE__ */ new Set();
	async function Z() {
		try {
			let e = {
				view: "inbox",
				account: h(O)
			}, [t, n, r, i, a] = await Promise.all([
				E(p.atlas, "accounts", {}, 30),
				E(p.atlas, "list", {
					...e,
					quick: "starred",
					limit: 6
				}, 30),
				E(p.atlas, "list", {
					...e,
					kind: "person",
					quick: "unread",
					limit: h(w)
				}, 30),
				E(p.atlas, "list", {
					...e,
					kind: "person",
					limit: h(w)
				}, 30),
				E(p.atlas, "count", { account: h(O) }, 30)
			]);
			v(H, h(O) ? t.accounts.filter((e) => e.name === h(O)) : t.accounts, !0), v(ke, t.own, !0), v(M, n.rows.filter((e) => !X.has(e.id)), !0);
			let o = new Set(h(M).map((e) => e.thread)), s = (e) => e.filter((e) => !o.has(e.thread) && !X.has(e.id) && (o.add(e.thread), !0));
			v(F, [...s(r.rows), ...s(i.rows)].slice(0, h(w)), !0), v(R, a, !0), v(U, ""), E(p.atlas, "agenda", { days: 1 }, 20).then((e) => {
				v(G, e?.events ?? [], !0);
			}).catch(() => {}), h(W) !== null && !h(Y).some((e) => e.id === h(W)) && v(W, null);
		} catch (e) {
			v(U, e.message, !0);
		}
		v(Ae, !0);
	}
	d(() => {
		Z();
		let e = [p.atlas.helper.on("changed", () => Z()), p.atlas.helper.on("new", () => Z())];
		return () => e.forEach((e) => e());
	});
	function Q(e, t) {
		v(K, {
			text: e,
			undo: t
		}, !0);
		let n = h(K);
		setTimeout(() => {
			h(K) === n && v(K, null);
		}, 6e3);
	}
	async function Me(e, t, n) {
		X.add(e.id);
		let r = {
			important: h(M).slice(),
			people: h(F).slice()
		};
		v(M, h(M).filter((t) => t.id !== e.id), !0), v(F, h(F).filter((t) => t.id !== e.id), !0);
		try {
			let { moved: e } = await n();
			Q(t, e?.length ? async () => {
				await E(p.atlas, "undo", { moved: e }), Z();
			} : void 0);
		} catch (e) {
			v(M, r.important, !0), v(F, r.people, !0), Q(`${t} failed: ${e.message}`);
		} finally {
			X.delete(e.id);
		}
	}
	let Ne = (e) => Me(e, "Archived", () => E(p.atlas, "archive", { ids: [e.id] })), Pe = (e, t, n) => (v(q, null), Me(e, `Snoozed until ${n}`, () => E(p.atlas, "snooze", {
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
			await E(p.atlas, "mark", {
				ids: [e.id],
				[t]: n
			}), Q(t === "read" ? n ? "Marked read" : "Marked unread" : n ? "Starred" : "Unstarred", async () => {
				await E(p.atlas, "mark", {
					ids: [e.id],
					[t]: !n
				}), Z();
			}), t === "starred" && Z();
		} catch (t) {
			e.unread = r.unread, e.flagged = r.flagged, Q(`Failed: ${t.message}`);
		}
	}
	async function Ie(e) {
		v(J, {
			id: e.id,
			text: "",
			draft: null,
			sending: !1
		}, !0);
		try {
			let t = await E(p.atlas, "compose_for", {
				id: e.id,
				mode: "reply"
			});
			h(J)?.id === e.id && (h(J).draft = t);
		} catch (e) {
			Q(`Cannot answer: ${e.message}`), v(J, null);
		}
	}
	async function Le() {
		if (!h(J)?.draft || !h(J).text.trim()) return;
		let e = {
			...h(J).draft,
			body: h(J).text
		}, t = h(J).draft.to ?? "";
		h(J).sending = !0;
		let n = Number(S(p.atlas, "undo_send", 10)) * 1e3, r = !1, i = h(J);
		v(J, null), Q(`Sending to ${t.replace(/<.*?>/g, "").trim() || t}…`, async () => {
			r = !0, v(J, {
				...i,
				sending: !1
			}, !0);
		}), setTimeout(async () => {
			if (!r) try {
				await E(p.atlas, "send", e, 300), Q("Sent"), Z();
			} catch (e) {
				v(J, {
					...i,
					sending: !1
				}, !0), Q(`Not sent: ${e.message}`);
			}
		}, n);
	}
	function Re(e) {
		if (e.target.closest("textarea, input")) {
			e.key === "Enter" && (e.ctrlKey || e.metaKey) ? (e.preventDefault(), Le()) : e.key === "Escape" && (v(J, null), h(je)?.focus()), e.stopPropagation();
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		let t = h(Y).findIndex((e) => e.id === h(W)), n = h(Y)[t], r = (e) => {
			let n = h(Y)[Math.max(0, Math.min(h(Y).length - 1, (t < 0 ? -1 : t) + e))];
			n && v(W, n.id, !0);
		}, i = {
			j: () => r(1),
			ArrowDown: () => r(1),
			k: () => r(-1),
			ArrowUp: () => r(-1),
			Enter: () => n && p.onopen({ id: n.id }),
			o: () => n && p.onopen({ id: n.id }),
			e: () => n && Ne(n),
			s: () => n && Fe(n, "starred", !n.flagged),
			u: () => n && Fe(n, "read", n.unread > 0),
			h: () => n && v(q, n.id, !0),
			r: () => n && Ie(n),
			c: () => p.onopen({ compose: {} })
		}[e.key];
		i && (e.preventDefault(), e.stopPropagation(), i());
	}
	let ze = P(() => [[
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
		n: h(R)[e]?.unread ?? 0
	})).filter((e) => e.n > 0)), Be = P(() => h(R).person?.unread ?? 0);
	var $ = De(), Ve = b($), He = b(Ve);
	i(He, 17, () => h(H), (e) => e.name, (t, n) => {
		var i = _e();
		let a;
		var o = b(i);
		let u, d;
		var m = N(o), _ = D(m, !0), v = N(m), ee = (e) => {
			var t = he();
			r(e, t);
		}, y = (t) => {
			var i = ge(), a = D(i, !0);
			g(() => e(a, h(n).unread)), r(t, i);
		};
		f(v, (e) => {
			h(n).error ? e(ee) : h(n).unread && e(y, 1);
		}), A(i), g((t) => {
			a = c(i, 1, "acct svelte-uoex8y", null, a, { bad: !!h(n).error || h(n).status?.state === "error" }), l(i, "title", h(n).error ?? h(n).status?.error ?? h(n).user), u = c(o, 1, "svelte-uoex8y", null, u, { spin: h(n).status?.state === "syncing" }), d = s(o, "", d, { "--h": t }), e(_, h(n).name);
		}, [() => te(h(n).user ?? h(n).name)]), j("click", i, () => p.onopen({
			view: "inbox",
			account: h(n).name
		})), r(t, i);
	});
	var Ue = N(He, 4), We = b(Ue);
	L(We, {
		name: "pen",
		size: 15
	}), A(Ue);
	var Ge = N(Ue, 2), Ke = b(Ge);
	L(Ke, {
		name: "open",
		size: 15
	}), A(Ge), A(Ve);
	var qe = N(Ve, 2), Je = (t) => {
		var n = z(), a = b(n);
		L(a, {
			name: "calendar",
			size: 13
		});
		var s = N(a, 2);
		i(s, 17, () => h(G).slice(0, 4), o, (t, n) => {
			var i = ve(), a = b(i), o = D(a, !0), s = N(a);
			A(i), g(() => {
				e(o, h(n).time), e(s, ` ${h(n).summary ?? h(n).line ?? ""}`);
			}), r(t, i);
		});
		var c = N(s, 2), l = (t) => {
			var n = ye(), i = D(n);
			g(() => e(i, `+${h(G).length - 4}`)), r(t, n);
		};
		f(c, (e) => {
			h(G).length > 4 && e(l);
		}), A(n), r(t, n);
	};
	f(qe, (e) => {
		h(G).length && e(Je);
	});
	var Ye = N(qe, 2), Xe = (t) => {
		var n = be(), i = D(n, !0);
		g(() => e(i, h(U))), r(t, n);
	}, Ze = (e) => {
		var t = B();
		r(e, t);
	};
	f(Ye, (e) => {
		h(U) ? e(Xe) : h(Ae) && !h(Y).length && !h(ze).length && e(Ze, 1);
	});
	var Qe = N(Ye, 2), $e = (e) => {
		var t = xe(), n = I(t), a = b(n);
		L(a, {
			name: "star",
			size: 11,
			filled: !0
		}), x(), A(n);
		var o = N(n, 2);
		i(o, 17, () => h(M), (e) => e.thread, (e, t) => {
			m(e, () => h(t));
		}), r(e, t);
	};
	f(Qe, (e) => {
		h(M).length && e($e);
	});
	var et = N(Qe, 2), tt = (t) => {
		var n = Se(), a = I(n), o = N(b(a)), s = (t) => {
			var n = V(), i = D(n);
			g(() => e(i, `${h(Be) ?? ""} unread`)), r(t, n);
		};
		f(o, (e) => {
			h(Be) && e(s);
		}), A(a);
		var c = N(a, 2);
		i(c, 17, () => h(F), (e) => e.thread, (e, t) => {
			m(e, () => h(t));
		}), r(t, n);
	};
	f(et, (e) => {
		h(F).length && e(tt);
	});
	var nt = N(et, 2), rt = (t) => {
		var n = we();
		i(n, 21, () => h(ze), (e) => e.k, (t, n) => {
			var i = Ce(), a = b(i);
			L(a, {
				get name() {
					return h(n).icon;
				},
				size: 14
			});
			var o = N(a, 1, !0), s = N(o), c = D(s, !0);
			A(i), g(() => {
				e(o, h(n).label), e(c, h(n).n);
			}), j("click", i, () => p.onopen({
				view: "inbox",
				kind: h(n).k
			})), r(t, i);
		}), A(n), r(t, n);
	};
	f(nt, (e) => {
		h(ze).length && e(rt);
	});
	var it = N(nt, 2), at = (t) => {
		var n = Ee(), i = b(n, !0), a = N(i), o = (e) => {
			var t = Te();
			j("click", t, () => {
				let e = h(K)?.undo;
				v(K, null), e?.();
			}), r(e, t);
		};
		f(a, (e) => {
			h(K).undo && e(o);
		}), A(n), g(() => e(i, h(K).text)), r(t, n);
	};
	f(it, (e) => {
		h(K) && e(at);
	}), A($), se($, (e) => v(je, e), () => h(je)), j("keydown", $, Re), j("click", Ue, () => p.onopen({ compose: {} })), j("click", Ge, () => p.onopen({})), r(a, $), ae();
}
a(["click", "keydown"]);
//#endregion
//#region plugins/stable/email/ui/src/NoteView.svelte
var ke = m("<div class=\"meta svelte-cekzj3\"> </div>"), U = m("<div class=\"text svelte-cekzj3\"> </div>"), Ae = m("<button class=\"file svelte-cekzj3\"><!> </button>"), W = m("<div class=\"files svelte-cekzj3\"></div>"), G = m("<div class=\"acts svelte-cekzj3\"><button class=\"atlas-btn svelte-cekzj3\"><!> Reply</button> <button class=\"atlas-btn svelte-cekzj3\"><!> Reply all</button> <button class=\"atlas-btn svelte-cekzj3\"><!> Forward</button></div>"), K = m("<div class=\"body svelte-cekzj3\"><!> <!> <!> <!></div>"), q = m("<article><button class=\"head svelte-cekzj3\"><span class=\"av svelte-cekzj3\"> </span> <b class=\"svelte-cekzj3\"> </b> <span class=\"date svelte-cekzj3\"> </span></button> <!></article>"), J = m("<div class=\"nv svelte-cekzj3\"><h1 class=\"svelte-cekzj3\"> </h1> <div class=\"where svelte-cekzj3\"> <button class=\"link svelte-cekzj3\">Show as a note</button></div> <!></div>"), je = {
	hash: "svelte-cekzj3",
	code: ".nv.svelte-cekzj3 {max-width:980px;margin:0 auto;padding:18px 22px 48px;font-size:calc(14px * var(--ui-scale, 1));color:var(--text);}h1.svelte-cekzj3 {font-size:1.35em;margin:0 0 4px;color:var(--heading);font-weight:650;}.where.svelte-cekzj3 {color:var(--text-faint);font-size:0.88em;margin-bottom:12px;display:flex;gap:12px;flex-wrap:wrap;}.link.svelte-cekzj3 {all:unset;cursor:pointer;color:var(--accent);}.msg.svelte-cekzj3 {border:1px solid var(--border);border-radius:var(--radius);margin:0 0 10px;background:var(--bg);}.head.svelte-cekzj3 {all:unset;box-sizing:border-box;width:100%;display:flex;gap:10px;align-items:center;padding:10px 14px;cursor:pointer;}.head.svelte-cekzj3:hover {background:var(--bg-hover);}.unread.svelte-cekzj3 b:where(.svelte-cekzj3)::after {content:\" ●\";color:var(--accent);}.av.svelte-cekzj3 {flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;color:#fff;background:hsl(var(--h) 45% 46%);}.date.svelte-cekzj3 {margin-left:auto;color:var(--text-faint);font-size:0.86em;}.body.svelte-cekzj3 {padding:0 14px 14px 52px;display:grid;gap:10px;}.meta.svelte-cekzj3 {color:var(--text-muted);font-size:0.88em;}.text.svelte-cekzj3 {white-space:pre-wrap;line-height:1.55;}.files.svelte-cekzj3, .acts.svelte-cekzj3 {display:flex;flex-wrap:wrap;gap:8px;}.file.svelte-cekzj3 {all:unset;cursor:pointer;display:inline-flex;gap:6px;align-items:center;padding:5px 10px;border:1px solid var(--border-strong);border-radius:var(--radius);}.file.svelte-cekzj3:hover {color:var(--accent);}.acts.svelte-cekzj3 .atlas-btn:where(.svelte-cekzj3) {display:inline-flex;gap:6px;align-items:center;}"
};
function Y(t, n) {
	y(n, !0), u(t, je);
	let a = /^<!-- mail (\{.*\}) -->$/gm, d = /^- !\[\[([^\]]+)\]\]$/gm, p = P(() => n.note.path.replace(/[^/]*$/, ""));
	function m(e, t) {
		let n = [...t.matchAll(d)].map((e) => e[1].includes("/") ? e[1] : h(p) + e[1]), r = t.replace(d, "").replace(/^## Attachments\s*$/m, "").trim(), i = r.startsWith("<div class=\"email-html\">") ? r.replace(/\sdata-remote-src=/gi, " data-src=") : "";
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
	let _ = P(() => {
		if (n.note.props.type === "email-thread") {
			let e = [...n.note.text.matchAll(a)];
			return e.flatMap((t, r) => {
				try {
					let i = JSON.parse(t[1]), a = n.note.text.slice(t.index + t[0].length, r + 1 < e.length ? e[r + 1].index : n.note.text.length), o = /^## /m.exec(a);
					return o && (a = a.slice(0, o.index)), [m(i, a)];
				} catch {
					return [];
				}
			});
		}
		let e = n.note.text.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^# .*\n+/, "");
		return [m({
			...n.note.props,
			seen: !0
		}, e)];
	}), ee = k(null), S = P(() => h(ee) ?? h(_).map((e, t) => t === h(_).length - 1 || !e.seen ? t : -1).filter((e) => e >= 0)), C = P(() => String(n.note.props.subject ?? n.note.text.match(/^# (.+)$/m)?.[1] ?? "")), w = document.documentElement.dataset.theme !== "light", T = (e) => e.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || e, ne = (e) => e ? new Date(e).toLocaleString(void 0, {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit"
	}) : "";
	async function re(e, t) {
		try {
			let r = await E(n.atlas, "find", {
				message_id: t.message_id,
				account: n.note.props.account
			});
			r.id ? n.onmail({ reply: {
				id: r.id,
				mode: e
			} }) : n.atlas.toast("Email", "That message is not in the mail index (it may be gone from the server).", "error");
		} catch (e) {
			n.atlas.toast("Email", e.message, "error");
		}
	}
	var M = J(), F = b(M), I = D(F, !0), oe = N(F, 2), se = b(oe), ce = N(se);
	A(oe);
	var R = N(oe, 2);
	i(R, 17, () => h(_), o, (t, a, o) => {
		var u = q();
		let d;
		var p = b(u), m = b(p);
		let _;
		var y = D(m, !0), C = N(m, 2), E = D(C, !0), k = N(C, 2), M = D(k, !0);
		A(p);
		var F = N(p, 2), I = (t) => {
			var o = K(), s = b(o), c = (t) => {
				var n = ke(), i = D(n);
				g(() => e(i, `to ${h(a).to ?? ""}${h(a).cc ? ` · cc ${h(a).cc}` : ""}`)), r(t, n);
			};
			f(s, (e) => {
				h(a).to && e(c);
			});
			var l = N(s, 2), u = (e) => {
				O(e, {
					get html() {
						return h(a).html;
					},
					get dark() {
						return w;
					}
				});
			}, d = (t) => {
				var n = U(), i = D(n, !0);
				g(() => e(i, h(a).text)), r(t, n);
			};
			f(l, (e) => {
				h(a).html ? e(u) : e(d, -1);
			});
			var p = N(l, 2), m = (t) => {
				var o = W();
				i(o, 20, () => h(a).files, (e) => e, (t, i) => {
					var a = Ae(), o = b(a);
					L(o, {
						name: "attach",
						size: 13
					});
					var s = N(o, 1, !0);
					A(a), g((t) => e(s, t), [() => i.split("/").at(-1)]), j("click", a, () => n.atlas.open(i, void 0, { beside: !0 })), r(t, a);
				}), A(o), r(t, o);
			};
			f(p, (e) => {
				h(a).files.length && e(m);
			});
			var _ = N(p, 2), v = (e) => {
				var t = G(), n = b(t), i = b(n);
				L(i, {
					name: "reply",
					size: 14
				}), x(), A(n);
				var o = N(n, 2), s = b(o);
				L(s, {
					name: "replyall",
					size: 14
				}), x(), A(o);
				var c = N(o, 2), l = b(c);
				L(l, {
					name: "forward",
					size: 14
				}), x(), A(c), A(t), j("click", n, () => re("reply", h(a))), j("click", o, () => re("all", h(a))), j("click", c, () => re("forward", h(a))), r(e, t);
			};
			f(_, (e) => {
				h(a).message_id && e(v);
			}), A(o), r(t, o);
		}, ae = P(() => h(S).includes(o));
		f(F, (e) => {
			h(ae) && e(I);
		}), A(u), g((t, n, r, i, o) => {
			d = c(u, 1, "msg svelte-cekzj3", null, d, { unread: !h(a).seen }), l(p, "aria-expanded", t), _ = s(m, "", _, { "--h": n }), e(y, r), e(E, i), e(M, o);
		}, [
			() => h(S).includes(o),
			() => te(h(a).from),
			() => ie({
				name: T(h(a).from),
				addr: h(a).from
			}),
			() => T(h(a).from),
			() => ne(h(a).date)
		]), j("click", p, () => v(ee, h(S).includes(o) ? h(S).filter((e) => e !== o) : [...h(S), o], !0)), r(t, u);
	}), A(M), g(() => {
		e(I, h(C) || "(no subject)"), e(se, `${n.note.props.account ?? "" ?? ""}${n.note.props.folder ? ` · ${n.note.props.folder}` : ""} · ${h(_).length ?? ""} message${h(_).length === 1 ? "" : "s"} `);
	}), j("click", ce, () => n.note.showNote()), r(t, M), ae();
}
a(["click"]);
//#endregion
//#region plugins/stable/email/ui/src/signin.ts
var X = (e, t) => JSON.stringify({
	dialog: "signin",
	account: e,
	record: t
});
function Z(e, t) {
	let n = typeof t == "object" ? t : void 0, r = X(typeof t == "string" ? t : n?.name, n);
	typeof e.openDialog == "function" ? e.openDialog(r, {
		title: "Sign in to Outlook",
		width: 560,
		height: 360
	}) : e.openView(r, {
		title: "Outlook sign-in",
		icon: "mail"
	});
}
//#endregion
//#region plugins/stable/email/ui/src/main.ts
function Q(e) {
	let t = () => (e.plugin.settings.accounts ?? []).filter((e) => e?.name), n = (t = {}) => _(e, t);
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
				await E(e, "sync", {}, 600);
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
		run: (t) => void Z(e, t?.record)
	});
	let r = () => typeof e.openDialog == "function" ? void e.openDialog(M, {
		title: "Import from Thunderbird",
		width: 640,
		height: 560
	}) : e.openView(M, {
		title: "Thunderbird",
		icon: "mail"
	});
	e.registerCommand({
		id: "thunderbird",
		title: "Email: import an account from Thunderbird…",
		run: r
	}), e.registerCommand({
		id: "thunderbird-mail",
		title: "Email: keep Thunderbird's local mail as notes…",
		run: r
	});
	let i = window;
	i.__atlasEmailSignin && window.removeEventListener("atlas-email:signin", i.__atlasEmailSignin), i.__atlasEmailSignin = (t) => void Z(e, t.detail), window.addEventListener("atlas-email:signin", i.__atlasEmailSignin), e.plugin.registerSettingsSection?.({
		id: "rules",
		title: "Rules",
		hint: "What happens to new mail by itself: important, archive, a label, kept as a note.",
		mount: (t) => {
			let n = R(F, {
				target: t,
				props: {
					frame: "page",
					mail: w(e)
				}
			});
			return () => p(n);
		}
	}), e.registerNoteView?.("mail", {
		title: "Mail",
		types: ["email-thread", "email"],
		render: (t, r) => {
			let i = R(Y, {
				target: t,
				props: {
					atlas: e,
					note: r,
					onmail: n
				}
			});
			return () => p(i);
		}
	}), e.registerBlock("email.inbox", (t, r) => {
		let i = R(H, {
			target: t,
			props: {
				atlas: e,
				options: r.options ?? {},
				onopen: n
			}
		});
		return () => p(i);
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
			let r = R(H, {
				target: t,
				props: {
					atlas: e,
					options: { limit: 12 },
					onopen: n
				}
			});
			return () => p(r);
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
				let { unread: t } = await E(e, "unread_count", {}, 20);
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
		n?.key === "accounts" && E(e, "rename_account", {
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
		E(e, "watch", {}, 60).then(s, () => {});
	}, 4e3);
	return () => clearTimeout(c);
}
//#endregion
export { Q as register };
