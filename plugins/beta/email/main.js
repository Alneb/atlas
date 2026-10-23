import { $ as e, A as t, B as n, D as r, E as i, F as a, G as o, H as s, J as c, L as l, M as u, N as d, P as f, Q as p, S as m, T as ee, W as h, X as g, Y as _, Z as v, _ as y, at as b, b as te, et as x, f as S, h as C, it as w, j as T, k as E, l as ne, n as D, nt as re, o as ie, ot as O, p as ae, q as k, r as A, rt as j, s as oe, st as se, t as M, tt as N, u as P, v as F, z as I } from "./ui-lib/Rules.js";
//#region plugins/beta/email/ui/src/Inbox.svelte
var ce = l("<span class=\"cnt svelte-qvg0fj\"> </span>"), le = l("<span class=\"snip svelte-qvg0fj\"> </span>"), ue = l("<button role=\"menuitem\" class=\"svelte-qvg0fj\"> </button>"), de = l("<div class=\"snooze svelte-qvg0fj\" role=\"menu\"></div>"), fe = l("<div class=\"reply svelte-qvg0fj\"><textarea rows=\"3\" class=\"svelte-qvg0fj\"></textarea> <div class=\"rbar svelte-qvg0fj\"><button class=\"ghost svelte-qvg0fj\">Open in Email</button> <span class=\"grow svelte-qvg0fj\"></span> <button class=\"ghost svelte-qvg0fj\">Cancel</button> <button class=\"primary svelte-qvg0fj\"><!> Send</button></div></div>"), pe = l("<div role=\"option\" tabindex=\"-1\"><button class=\"open svelte-qvg0fj\"><span class=\"av svelte-qvg0fj\"> </span> <span class=\"main svelte-qvg0fj\"><span class=\"l1 svelte-qvg0fj\"><span class=\"who svelte-qvg0fj\"> <!></span><!><time class=\"svelte-qvg0fj\"> </time></span> <span class=\"l2 svelte-qvg0fj\"><span class=\"subj svelte-qvg0fj\"> </span><!></span></span></button> <span class=\"acts svelte-qvg0fj\"><button title=\"Archive (e)\" class=\"svelte-qvg0fj\"><!></button> <button class=\"svelte-qvg0fj\"><!></button> <button title=\"Snooze (h)\" class=\"svelte-qvg0fj\"><!></button> <button title=\"Reply (r)\" class=\"svelte-qvg0fj\"><!></button></span></div> <!> <!>", 1), me = l("<b class=\"svelte-qvg0fj\">!</b>"), he = l("<b class=\"svelte-qvg0fj\"> </b>"), ge = l("<button><i></i><span class=\"svelte-qvg0fj\"> </span><!></button>"), _e = l("<span class=\"svelte-qvg0fj\"><b class=\"svelte-qvg0fj\"> </b> </span>"), ve = l("<span class=\"faint svelte-qvg0fj\"> </span>"), ye = l("<div class=\"today svelte-qvg0fj\" title=\"Today, from your calendar\"><!> <!> <!></div>"), be = l("<p class=\"quiet svelte-qvg0fj\"> </p>"), xe = l("<p class=\"quiet zero svelte-qvg0fj\">Inbox zero — nothing waiting for you.</p>"), L = l("<div class=\"section svelte-qvg0fj\"><!> Important</div> <!>", 1), Se = l("<span class=\"n svelte-qvg0fj\"> </span>"), R = l("<div class=\"section svelte-qvg0fj\">People<!></div> <!>", 1), Ce = l("<button class=\"svelte-qvg0fj\"><!> <b class=\"svelte-qvg0fj\"> </b></button>"), z = l("<div class=\"folded svelte-qvg0fj\"></div>"), we = l("<button class=\"svelte-qvg0fj\">Undo</button>"), Te = l("<div class=\"note svelte-qvg0fj\" role=\"status\"> <!></div>"), Ee = l("<div class=\"card svelte-qvg0fj\" tabindex=\"0\" role=\"listbox\" aria-label=\"Mail to answer\"><header class=\"svelte-qvg0fj\"><!> <span class=\"grow svelte-qvg0fj\"></span> <button class=\"icon svelte-qvg0fj\" title=\"New message (c)\"><!></button> <button class=\"icon svelte-qvg0fj\" title=\"Open the Email pane\"><!></button></header> <!> <!> <!> <!> <!> <!></div>"), De = {
	hash: "svelte-qvg0fj",
	code: ".card.svelte-qvg0fj {display:grid;grid-template-columns:minmax(0, 1fr);gap:1px;font-size:calc(13px * var(--ui-scale, 1));container-type:inline-size;outline:none;position:relative;}.card.svelte-qvg0fj:focus-visible {box-shadow:0 0 0 2px var(--accent);border-radius:var(--radius-sm);}header.svelte-qvg0fj {display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:4px;}.grow.svelte-qvg0fj {flex:1;}.acct.svelte-qvg0fj {all:unset;cursor:pointer;display:inline-flex;gap:6px;align-items:center;padding:2px 9px;border-radius:999px;border:1px solid var(--border-strong);font-size:0.9em;}.acct.svelte-qvg0fj:hover {background:var(--bg-hover);}.acct.svelte-qvg0fj i:where(.svelte-qvg0fj) {width:7px;height:7px;border-radius:50%;background:hsl(var(--h) 55% 50%);}.acct.svelte-qvg0fj i.spin:where(.svelte-qvg0fj) { animation: svelte-qvg0fj-pulse 1.2s ease-in-out infinite;}\n  @keyframes svelte-qvg0fj-pulse { 50% { opacity: 0.3; } }\n  @media (prefers-reduced-motion: reduce) {.acct.svelte-qvg0fj i.spin:where(.svelte-qvg0fj) { animation: none;} }.acct.bad.svelte-qvg0fj {border-color:var(--red);}.acct.svelte-qvg0fj b:where(.svelte-qvg0fj) {font-weight:650;}.icon.svelte-qvg0fj {all:unset;cursor:pointer;display:grid;place-items:center;width:26px;height:26px;border-radius:var(--radius-sm);color:var(--text-muted);}.icon.svelte-qvg0fj:hover {background:var(--bg-hover);color:var(--text);}.section.svelte-qvg0fj {display:flex;align-items:center;gap:5px;font-size:0.72em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);margin:8px 0 2px;font-weight:600;}.section.svelte-qvg0fj .n:where(.svelte-qvg0fj) {text-transform:none;letter-spacing:0;font-weight:500;margin-left:4px;color:var(--accent);}.row.svelte-qvg0fj {position:relative;display:flex;align-items:center;border-radius:var(--radius-sm);min-width:0;}.row.svelte-qvg0fj:hover, .row.cursor.svelte-qvg0fj {background:var(--bg-hover);}.card.svelte-qvg0fj:focus-within .row.cursor:where(.svelte-qvg0fj) {box-shadow:inset 2px 0 0 var(--accent);}.open.svelte-qvg0fj {all:unset;box-sizing:border-box;cursor:pointer;flex:1;min-width:0;display:flex;gap:9px;align-items:center;padding:5px 6px;}.open.svelte-qvg0fj:focus-visible {outline:2px solid var(--accent);border-radius:var(--radius-sm);}.av.svelte-qvg0fj {flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:10px;font-weight:600;background:hsl(var(--h) 45% 46%);}.main.svelte-qvg0fj {flex:1;min-width:0;display:grid;grid-template-columns:minmax(0, 1fr);}.l1.svelte-qvg0fj {display:flex;gap:6px;align-items:center;color:var(--text);}.who.svelte-qvg0fj {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.cnt.svelte-qvg0fj {color:var(--text-faint);font-size:0.88em;margin-left:5px;}time.svelte-qvg0fj {flex:none;color:var(--text-faint);font-size:0.88em;font-variant-numeric:tabular-nums;}.l2.svelte-qvg0fj {overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);}.snip.svelte-qvg0fj {color:var(--text-faint);}.unread.svelte-qvg0fj .who:where(.svelte-qvg0fj), .unread.svelte-qvg0fj .subj:where(.svelte-qvg0fj) {font-weight:650;color:var(--heading, var(--text));}.acts.svelte-qvg0fj {display:none;gap:1px;padding-right:4px;background:var(--bg-hover);}.row.svelte-qvg0fj:hover .acts:where(.svelte-qvg0fj), .row.cursor.svelte-qvg0fj .acts:where(.svelte-qvg0fj) {display:flex;}.row.svelte-qvg0fj:hover time:where(.svelte-qvg0fj), .row.cursor.svelte-qvg0fj time:where(.svelte-qvg0fj) {visibility:hidden;}.acts.svelte-qvg0fj {position:absolute;right:0;top:4px;}.acts.svelte-qvg0fj button:where(.svelte-qvg0fj) {all:unset;cursor:pointer;display:grid;place-items:center;width:26px;height:26px;border-radius:var(--radius-sm);color:var(--text-muted);}.acts.svelte-qvg0fj button:where(.svelte-qvg0fj):hover {background:var(--bg-active, var(--bg));color:var(--text);}\n  @media (hover: none) {.acts.svelte-qvg0fj {display:flex;position:static;background:none;}.row.svelte-qvg0fj time:where(.svelte-qvg0fj) {visibility:visible !important;} }.snooze.svelte-qvg0fj {display:flex;flex-wrap:wrap;gap:4px;padding:4px 6px 6px 41px;}.snooze.svelte-qvg0fj button:where(.svelte-qvg0fj), .folded.svelte-qvg0fj button:where(.svelte-qvg0fj), .note.svelte-qvg0fj button:where(.svelte-qvg0fj), .rbar.svelte-qvg0fj button:where(.svelte-qvg0fj) {all:unset;cursor:pointer;padding:3px 9px;border-radius:999px;border:1px solid var(--border-strong);font-size:0.9em;display:inline-flex;gap:6px;align-items:center;}.snooze.svelte-qvg0fj button:where(.svelte-qvg0fj):hover, .folded.svelte-qvg0fj button:where(.svelte-qvg0fj):hover {background:var(--bg-hover);}.reply.svelte-qvg0fj {display:grid;gap:6px;padding:4px 6px 8px 41px;}.reply.svelte-qvg0fj textarea:where(.svelte-qvg0fj) {box-sizing:border-box;width:100%;resize:vertical;font:inherit;padding:6px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);}.reply.svelte-qvg0fj textarea:where(.svelte-qvg0fj):focus {outline:2px solid var(--accent);outline-offset:-1px;}.rbar.svelte-qvg0fj {display:flex;gap:6px;align-items:center;}.rbar.svelte-qvg0fj .ghost:where(.svelte-qvg0fj) {border-color:transparent;color:var(--text-muted);}.rbar.svelte-qvg0fj .primary:where(.svelte-qvg0fj) {background:var(--accent);color:var(--accent-fg);border-color:transparent;}.rbar.svelte-qvg0fj .primary:where(.svelte-qvg0fj):disabled {opacity:0.5;cursor:default;}.folded.svelte-qvg0fj {display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}.folded.svelte-qvg0fj b:where(.svelte-qvg0fj) {font-weight:650;color:var(--accent);}.note.svelte-qvg0fj {display:flex;gap:10px;align-items:center;margin-top:6px;color:var(--text-muted);font-size:0.92em;}.note.svelte-qvg0fj button:where(.svelte-qvg0fj) {color:var(--accent);border-color:transparent;padding:1px 6px;}.quiet.svelte-qvg0fj {color:var(--text-faint);margin:4px 0;}.today.svelte-qvg0fj {display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;padding:4px 6px;margin-bottom:2px;color:var(--text-muted);font-size:0.92em;border-radius:var(--radius-sm);background:var(--accent-soft);}.today.svelte-qvg0fj b:where(.svelte-qvg0fj) {font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;}.today.svelte-qvg0fj .faint:where(.svelte-qvg0fj) {color:var(--text-faint);}.zero.svelte-qvg0fj {padding:6px 0;}\n  @container (max-width: 360px) {.snip.svelte-qvg0fj {display:none;}.acct.svelte-qvg0fj span:where(.svelte-qvg0fj) {display:none;} }"
};
function B(l, u) {
	w(u, !0), r(l, De);
	let f = (e, t = se) => {
		var r = pe(), o = c(r);
		let l;
		var f = k(o), v = k(f);
		let y;
		var x = _(v, !0), w = g(v, 2), D = k(w), A = k(D), j = k(A, !0), M = g(j), P = (e) => {
			var n = ce(), r = _(n, !0);
			h(() => d(r, t().count)), a(e, n);
		};
		T(M, (e) => {
			t().count > 1 && e(P);
		}), O(A);
		var F = g(A), I = (e) => {
			C(e, {
				name: "star",
				size: 12,
				filled: !0
			});
		};
		T(F, (e) => {
			t().flagged && e(I);
		});
		var me = g(F), he = _(me, !0);
		O(D);
		var ge = g(D, 2), _e = k(ge), ve = _(_e, !0), ye = g(_e), be = (e) => {
			var n = le(), r = _(n);
			h(() => d(r, ` — ${t().snippet ?? ""}`)), a(e, n);
		};
		T(ye, (e) => {
			t().snippet && e(be);
		}), O(ge), O(w), O(f);
		var xe = g(f, 2), L = k(xe), Se = k(L);
		C(Se, {
			name: "archive",
			size: 15
		}), O(L);
		var R = g(L, 2), Ce = k(R);
		C(Ce, {
			name: "star",
			size: 15,
			get filled() {
				return t().flagged;
			}
		}), O(R);
		var z = g(R, 2), we = k(z);
		C(we, {
			name: "clock",
			size: 15
		}), O(z);
		var Te = g(z, 2), Ee = k(Te);
		C(Ee, {
			name: "reply",
			size: 15
		}), O(Te), O(xe), O(o);
		var De = g(o, 2), B = (e) => {
			var r = de();
			E(r, 21, S, (e) => e.label, (e, r) => {
				var i = ue(), o = _(i, !0);
				h(() => d(o, s(r).label)), n("click", i, () => Ne(t(), s(r).at, s(r).label.split(" · ")[0])), a(e, i);
			}), O(r), a(e, r);
		};
		T(De, (e) => {
			s(q) === t().id && e(B);
		});
		var V = g(De, 2), H = (e) => {
			var r = fe(), i = k(r);
			re(i), N(i, !0);
			var o = g(i, 2), c = k(o), l = g(c, 4), d = g(l, 2), f = k(d);
			C(f, {
				name: "send",
				size: 13
			}), b(), O(d), O(o), O(r), h((e, t) => {
				m(i, "placeholder", e), i.disabled = !s(J).draft, d.disabled = t;
			}, [() => s(J).draft ? `Reply to ${(s(J).draft.to ?? "").replace(/<.*?>/g, "").trim()}…  (Ctrl+Enter sends)` : "…", () => !s(J).draft || !s(J).text.trim()]), te(i, () => s(J).text, (e) => s(J).text = e), n("click", c, () => {
				u.onopen({ reply: {
					id: t().id,
					mode: "reply"
				} }), p(J, null);
			}), n("click", l, () => p(J, null)), n("click", d, Ie), a(e, r);
		};
		T(V, (e) => {
			s(J)?.id === t().id && e(H);
		}), h((e, n, r, a) => {
			l = i(o, 1, "row svelte-qvg0fj", null, l, {
				unread: t().unread > 0,
				cursor: s(W) === t().id
			}), m(o, "aria-selected", s(W) === t().id), m(f, "title", t().subject), y = ee(v, "", y, { "--h": e }), d(x, n), d(j, r), d(he, a), d(ve, t().subject || "(no subject)"), m(R, "title", t().flagged ? "Unstar (s)" : "Star (s)");
		}, [
			() => ie(t().from.at(-1)?.addr ?? ""),
			() => oe(t().from.at(-1)),
			() => ne(t().from, s(ke)),
			() => ae(t().date)
		]), n("click", f, () => {
			p(W, t().id, !0), u.onopen({ id: t().id });
		}), n("click", L, () => Me(t())), n("click", R, () => Pe(t(), "starred", !t().flagged)), n("click", z, () => p(q, s(q) === t().id ? null : t().id, !0)), n("click", Te, () => Fe(t())), a(e, r);
	}, D = y(u, "options", 19, () => ({})), M = x(() => Number(D().limit ?? 8) || 8), I = x(() => String(D().account ?? "")), B = e(v([])), V = e(v([])), H = e(v({})), Oe = e(v([])), ke = e(v([])), U = e(""), Ae = e(!1), W = e(null), G = e(v([])), K = e(null), q = e(null), J = e(null), Y = e(void 0), X = x(() => [...s(B), ...s(V)]), Z = /* @__PURE__ */ new Set();
	async function Q() {
		try {
			let e = {
				view: "inbox",
				account: s(I)
			}, [t, n, r, i, a] = await Promise.all([
				A(u.atlas, "accounts", {}, 30),
				A(u.atlas, "list", {
					...e,
					quick: "starred",
					limit: 6
				}, 30),
				A(u.atlas, "list", {
					...e,
					kind: "person",
					quick: "unread",
					limit: s(M)
				}, 30),
				A(u.atlas, "list", {
					...e,
					kind: "person",
					limit: s(M)
				}, 30),
				A(u.atlas, "count", { account: s(I) }, 30)
			]);
			p(Oe, s(I) ? t.accounts.filter((e) => e.name === s(I)) : t.accounts, !0), p(ke, t.own, !0), p(B, n.rows.filter((e) => !Z.has(e.id)), !0);
			let o = new Set(s(B).map((e) => e.thread)), c = (e) => e.filter((e) => !o.has(e.thread) && !Z.has(e.id) && (o.add(e.thread), !0));
			p(V, [...c(r.rows), ...c(i.rows)].slice(0, s(M)), !0), p(H, a, !0), p(U, ""), A(u.atlas, "agenda", { days: 1 }, 20).then((e) => {
				p(G, e?.events ?? [], !0);
			}).catch(() => {}), s(W) !== null && !s(X).some((e) => e.id === s(W)) && p(W, null);
		} catch (e) {
			p(U, e.message, !0);
		}
		p(Ae, !0);
	}
	o(() => {
		Q();
		let e = [u.atlas.helper.on("changed", () => Q()), u.atlas.helper.on("new", () => Q())];
		return () => e.forEach((e) => e());
	});
	function $(e, t) {
		p(K, {
			text: e,
			undo: t
		}, !0);
		let n = s(K);
		setTimeout(() => {
			s(K) === n && p(K, null);
		}, 6e3);
	}
	async function je(e, t, n) {
		Z.add(e.id);
		let r = {
			important: s(B).slice(),
			people: s(V).slice()
		};
		p(B, s(B).filter((t) => t.id !== e.id), !0), p(V, s(V).filter((t) => t.id !== e.id), !0);
		try {
			let { moved: e } = await n();
			$(t, e?.length ? async () => {
				await A(u.atlas, "undo", { moved: e }), Q();
			} : void 0);
		} catch (e) {
			p(B, r.important, !0), p(V, r.people, !0), $(`${t} failed: ${e.message}`);
		} finally {
			Z.delete(e.id);
		}
	}
	let Me = (e) => je(e, "Archived", () => A(u.atlas, "archive", { ids: [e.id] })), Ne = (e, t, n) => (p(q, null), je(e, `Snoozed until ${n}`, () => A(u.atlas, "snooze", {
		ids: [e.id],
		until: t
	})));
	async function Pe(e, t, n) {
		let r = {
			unread: e.unread,
			flagged: e.flagged
		};
		t === "read" ? e.unread = +!n : e.flagged = n;
		try {
			await A(u.atlas, "mark", {
				ids: [e.id],
				[t]: n
			}), $(t === "read" ? n ? "Marked read" : "Marked unread" : n ? "Starred" : "Unstarred", async () => {
				await A(u.atlas, "mark", {
					ids: [e.id],
					[t]: !n
				}), Q();
			}), t === "starred" && Q();
		} catch (t) {
			e.unread = r.unread, e.flagged = r.flagged, $(`Failed: ${t.message}`);
		}
	}
	async function Fe(e) {
		p(J, {
			id: e.id,
			text: "",
			draft: null,
			sending: !1
		}, !0);
		try {
			let t = await A(u.atlas, "compose_for", {
				id: e.id,
				mode: "reply"
			});
			s(J)?.id === e.id && (s(J).draft = t);
		} catch (e) {
			$(`Cannot answer: ${e.message}`), p(J, null);
		}
	}
	async function Ie() {
		if (!s(J)?.draft || !s(J).text.trim()) return;
		let e = {
			...s(J).draft,
			body: s(J).text
		}, t = s(J).draft.to ?? "";
		s(J).sending = !0;
		let n = Number(P(u.atlas, "undo_send", 10)) * 1e3, r = !1, i = s(J);
		p(J, null), $(`Sending to ${t.replace(/<.*?>/g, "").trim() || t}…`, async () => {
			r = !0, p(J, {
				...i,
				sending: !1
			}, !0);
		}), setTimeout(async () => {
			if (!r) try {
				await A(u.atlas, "send", e, 300), $("Sent"), Q();
			} catch (e) {
				p(J, {
					...i,
					sending: !1
				}, !0), $(`Not sent: ${e.message}`);
			}
		}, n);
	}
	function Le(e) {
		if (e.target.closest("textarea, input")) {
			e.key === "Enter" && (e.ctrlKey || e.metaKey) ? (e.preventDefault(), Ie()) : e.key === "Escape" && (p(J, null), s(Y)?.focus()), e.stopPropagation();
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		let t = s(X).findIndex((e) => e.id === s(W)), n = s(X)[t], r = (e) => {
			let n = s(X)[Math.max(0, Math.min(s(X).length - 1, (t < 0 ? -1 : t) + e))];
			n && p(W, n.id, !0);
		}, i = {
			j: () => r(1),
			ArrowDown: () => r(1),
			k: () => r(-1),
			ArrowUp: () => r(-1),
			Enter: () => n && u.onopen({ id: n.id }),
			o: () => n && u.onopen({ id: n.id }),
			e: () => n && Me(n),
			s: () => n && Pe(n, "starred", !n.flagged),
			u: () => n && Pe(n, "read", n.unread > 0),
			h: () => n && p(q, n.id, !0),
			r: () => n && Fe(n),
			c: () => u.onopen({ compose: {} })
		}[e.key];
		i && (e.preventDefault(), e.stopPropagation(), i());
	}
	let Re = x(() => [[
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
		n: s(H)[e]?.unread ?? 0
	})).filter((e) => e.n > 0)), ze = x(() => s(H).person?.unread ?? 0);
	var Be = Ee(), Ve = k(Be), He = k(Ve);
	E(He, 17, () => s(Oe), (e) => e.name, (e, t) => {
		var r = ge();
		let o;
		var c = k(r);
		let l, f;
		var p = g(c), v = _(p, !0), y = g(p), b = (e) => {
			var t = me();
			a(e, t);
		}, te = (e) => {
			var n = he(), r = _(n, !0);
			h(() => d(r, s(t).unread)), a(e, n);
		};
		T(y, (e) => {
			s(t).error ? e(b) : s(t).unread && e(te, 1);
		}), O(r), h((e) => {
			o = i(r, 1, "acct svelte-qvg0fj", null, o, { bad: !!s(t).error || s(t).status?.state === "error" }), m(r, "title", s(t).error ?? s(t).status?.error ?? s(t).user), l = i(c, 1, "svelte-qvg0fj", null, l, { spin: s(t).status?.state === "syncing" }), f = ee(c, "", f, { "--h": e }), d(v, s(t).name);
		}, [() => ie(s(t).user ?? s(t).name)]), n("click", r, () => u.onopen({
			view: "inbox",
			account: s(t).name
		})), a(e, r);
	});
	var Ue = g(He, 4), We = k(Ue);
	C(We, {
		name: "pen",
		size: 15
	}), O(Ue);
	var Ge = g(Ue, 2), Ke = k(Ge);
	C(Ke, {
		name: "open",
		size: 15
	}), O(Ge), O(Ve);
	var qe = g(Ve, 2), Je = (e) => {
		var n = ye(), r = k(n);
		C(r, {
			name: "calendar",
			size: 13
		});
		var i = g(r, 2);
		E(i, 17, () => s(G).slice(0, 4), t, (e, t) => {
			var n = _e(), r = k(n), i = _(r, !0), o = g(r);
			O(n), h(() => {
				d(i, s(t).time), d(o, ` ${s(t).summary ?? s(t).line ?? ""}`);
			}), a(e, n);
		});
		var o = g(i, 2), c = (e) => {
			var t = ve(), n = _(t);
			h(() => d(n, `+${s(G).length - 4}`)), a(e, t);
		};
		T(o, (e) => {
			s(G).length > 4 && e(c);
		}), O(n), a(e, n);
	};
	T(qe, (e) => {
		s(G).length && e(Je);
	});
	var Ye = g(qe, 2), Xe = (e) => {
		var t = be(), n = _(t, !0);
		h(() => d(n, s(U))), a(e, t);
	}, Ze = (e) => {
		var t = xe();
		a(e, t);
	};
	T(Ye, (e) => {
		s(U) ? e(Xe) : s(Ae) && !s(X).length && !s(Re).length && e(Ze, 1);
	});
	var Qe = g(Ye, 2), $e = (e) => {
		var t = L(), n = c(t), r = k(n);
		C(r, {
			name: "star",
			size: 11,
			filled: !0
		}), b(), O(n);
		var i = g(n, 2);
		E(i, 17, () => s(B), (e) => e.thread, (e, t) => {
			f(e, () => s(t));
		}), a(e, t);
	};
	T(Qe, (e) => {
		s(B).length && e($e);
	});
	var et = g(Qe, 2), tt = (e) => {
		var t = R(), n = c(t), r = g(k(n)), i = (e) => {
			var t = Se(), n = _(t);
			h(() => d(n, `${s(ze) ?? ""} unread`)), a(e, t);
		};
		T(r, (e) => {
			s(ze) && e(i);
		}), O(n);
		var o = g(n, 2);
		E(o, 17, () => s(V), (e) => e.thread, (e, t) => {
			f(e, () => s(t));
		}), a(e, t);
	};
	T(et, (e) => {
		s(V).length && e(tt);
	});
	var nt = g(et, 2), rt = (e) => {
		var t = z();
		E(t, 21, () => s(Re), (e) => e.k, (e, t) => {
			var r = Ce(), i = k(r);
			C(i, {
				get name() {
					return s(t).icon;
				},
				size: 14
			});
			var o = g(i, 1, !0), c = g(o), l = _(c, !0);
			O(r), h(() => {
				d(o, s(t).label), d(l, s(t).n);
			}), n("click", r, () => u.onopen({
				view: "inbox",
				kind: s(t).k
			})), a(e, r);
		}), O(t), a(e, t);
	};
	T(nt, (e) => {
		s(Re).length && e(rt);
	});
	var it = g(nt, 2), at = (e) => {
		var t = Te(), r = k(t, !0), i = g(r), o = (e) => {
			var t = we();
			n("click", t, () => {
				let e = s(K)?.undo;
				p(K, null), e?.();
			}), a(e, t);
		};
		T(i, (e) => {
			s(K).undo && e(o);
		}), O(t), h(() => d(r, s(K).text)), a(e, t);
	};
	T(it, (e) => {
		s(K) && e(at);
	}), O(Be), F(Be, (e) => p(Y, e), () => s(Y)), n("keydown", Be, Le), n("click", Ue, () => u.onopen({ compose: {} })), n("click", Ge, () => u.onopen({})), a(l, Be), j();
}
I(["click", "keydown"]);
//#endregion
//#region plugins/beta/email/ui/src/NoteView.svelte
var V = l("<div class=\"meta svelte-1cwgyvm\"> </div>"), H = l("<div class=\"text svelte-1cwgyvm\"> </div>"), Oe = l("<button class=\"file svelte-1cwgyvm\"><!> </button>"), ke = l("<div class=\"files svelte-1cwgyvm\"></div>"), U = l("<div class=\"acts svelte-1cwgyvm\"><button class=\"atlas-btn svelte-1cwgyvm\"><!> Reply</button> <button class=\"atlas-btn svelte-1cwgyvm\"><!> Reply all</button> <button class=\"atlas-btn svelte-1cwgyvm\"><!> Forward</button></div>"), Ae = l("<div class=\"body svelte-1cwgyvm\"><!> <!> <!> <!></div>"), W = l("<article><button class=\"head svelte-1cwgyvm\"><span class=\"av svelte-1cwgyvm\"> </span> <b class=\"svelte-1cwgyvm\"> </b> <span class=\"date svelte-1cwgyvm\"> </span></button> <!></article>"), G = l("<div class=\"nv svelte-1cwgyvm\"><h1 class=\"svelte-1cwgyvm\"> </h1> <div class=\"where svelte-1cwgyvm\"> <button class=\"link svelte-1cwgyvm\">Show as a note</button></div> <!></div>"), K = {
	hash: "svelte-1cwgyvm",
	code: ".nv.svelte-1cwgyvm {max-width:980px;margin:0 auto;padding:18px 22px 48px;font-size:calc(14px * var(--ui-scale, 1));color:var(--text);}h1.svelte-1cwgyvm {font-size:1.35em;margin:0 0 4px;color:var(--heading);font-weight:650;}.where.svelte-1cwgyvm {color:var(--text-faint);font-size:0.88em;margin-bottom:12px;display:flex;gap:12px;flex-wrap:wrap;}.link.svelte-1cwgyvm {all:unset;cursor:pointer;color:var(--accent);}.msg.svelte-1cwgyvm {border:1px solid var(--border);border-radius:var(--radius);margin:0 0 10px;background:var(--bg);}.head.svelte-1cwgyvm {all:unset;box-sizing:border-box;width:100%;display:flex;gap:10px;align-items:center;padding:10px 14px;cursor:pointer;}.head.svelte-1cwgyvm:hover {background:var(--bg-hover);}.unread.svelte-1cwgyvm b:where(.svelte-1cwgyvm)::after {content:\" ●\";color:var(--accent);}.av.svelte-1cwgyvm {flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:600;color:#fff;background:hsl(var(--h) 45% 46%);}.date.svelte-1cwgyvm {margin-left:auto;color:var(--text-faint);font-size:0.86em;}.body.svelte-1cwgyvm {padding:0 14px 14px 52px;display:grid;gap:10px;}.meta.svelte-1cwgyvm {color:var(--text-muted);font-size:0.88em;}.text.svelte-1cwgyvm {white-space:pre-wrap;line-height:1.55;}.files.svelte-1cwgyvm, .acts.svelte-1cwgyvm {display:flex;flex-wrap:wrap;gap:8px;}.file.svelte-1cwgyvm {all:unset;cursor:pointer;display:inline-flex;gap:6px;align-items:center;padding:5px 10px;border:1px solid var(--border-strong);border-radius:var(--radius);}.file.svelte-1cwgyvm:hover {color:var(--accent);}.acts.svelte-1cwgyvm .atlas-btn:where(.svelte-1cwgyvm) {display:inline-flex;gap:6px;align-items:center;}"
};
function q(o, c) {
	w(c, !0), r(o, K);
	let l = /^<!-- mail (\{.*\}) -->$/gm, u = /^- !\[\[([^\]]+)\]\]$/gm, f = x(() => c.note.path.replace(/[^/]*$/, ""));
	function v(e, t) {
		let n = [...t.matchAll(u)].map((e) => e[1].includes("/") ? e[1] : s(f) + e[1]), r = t.replace(u, "").replace(/^## Attachments\s*$/m, "").trim(), i = r.startsWith("<div class=\"email-html\">") ? r.replace(/\sdata-remote-src=/gi, " data-src=") : "";
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
	let y = x(() => {
		if (c.note.props.type === "email-thread") {
			let e = [...c.note.text.matchAll(l)];
			return e.flatMap((t, n) => {
				try {
					let r = JSON.parse(t[1]), i = c.note.text.slice(t.index + t[0].length, n + 1 < e.length ? e[n + 1].index : c.note.text.length), a = /^## /m.exec(i);
					return a && (i = i.slice(0, a.index)), [v(r, i)];
				} catch {
					return [];
				}
			});
		}
		let e = c.note.text.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^# .*\n+/, "");
		return [v({
			...c.note.props,
			seen: !0
		}, e)];
	}), te = e(null), S = x(() => s(te) ?? s(y).map((e, t) => t === s(y).length - 1 || !e.seen ? t : -1).filter((e) => e >= 0)), ne = x(() => String(c.note.props.subject ?? c.note.text.match(/^# (.+)$/m)?.[1] ?? "")), re = document.documentElement.dataset.theme !== "light", ae = (e) => e.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || e, se = (e) => e ? new Date(e).toLocaleString(void 0, {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit"
	}) : "";
	async function M(e, t) {
		try {
			let n = await A(c.atlas, "find", {
				message_id: t.message_id,
				account: c.note.props.account
			});
			n.id ? c.onmail({ reply: {
				id: n.id,
				mode: e
			} }) : c.atlas.toast("Email", "That message is not in the mail index (it may be gone from the server).", "error");
		} catch (e) {
			c.atlas.toast("Email", e.message, "error");
		}
	}
	var N = G(), P = k(N), F = _(P, !0), I = g(P, 2), ce = k(I), le = g(ce);
	O(I);
	var ue = g(I, 2);
	E(ue, 17, () => s(y), t, (e, t, r) => {
		var o = W();
		let l;
		var u = k(o), f = k(u);
		let v;
		var y = _(f, !0), w = g(f, 2), ne = _(w, !0), A = g(w, 2), j = _(A, !0);
		O(u);
		var N = g(u, 2), P = (e) => {
			var r = Ae(), i = k(r), o = (e) => {
				var n = V(), r = _(n);
				h(() => d(r, `to ${s(t).to ?? ""}${s(t).cc ? ` · cc ${s(t).cc}` : ""}`)), a(e, n);
			};
			T(i, (e) => {
				s(t).to && e(o);
			});
			var l = g(i, 2), u = (e) => {
				D(e, {
					get html() {
						return s(t).html;
					},
					get dark() {
						return re;
					}
				});
			}, f = (e) => {
				var n = H(), r = _(n, !0);
				h(() => d(r, s(t).text)), a(e, n);
			};
			T(l, (e) => {
				s(t).html ? e(u) : e(f, -1);
			});
			var p = g(l, 2), m = (e) => {
				var r = ke();
				E(r, 20, () => s(t).files, (e) => e, (e, t) => {
					var r = Oe(), i = k(r);
					C(i, {
						name: "attach",
						size: 13
					});
					var o = g(i, 1, !0);
					O(r), h((e) => d(o, e), [() => t.split("/").at(-1)]), n("click", r, () => c.atlas.open(t, void 0, { beside: !0 })), a(e, r);
				}), O(r), a(e, r);
			};
			T(p, (e) => {
				s(t).files.length && e(m);
			});
			var ee = g(p, 2), v = (e) => {
				var r = U(), i = k(r), o = k(i);
				C(o, {
					name: "reply",
					size: 14
				}), b(), O(i);
				var c = g(i, 2), l = k(c);
				C(l, {
					name: "replyall",
					size: 14
				}), b(), O(c);
				var u = g(c, 2), d = k(u);
				C(d, {
					name: "forward",
					size: 14
				}), b(), O(u), O(r), n("click", i, () => M("reply", s(t))), n("click", c, () => M("all", s(t))), n("click", u, () => M("forward", s(t))), a(e, r);
			};
			T(ee, (e) => {
				s(t).message_id && e(v);
			}), O(r), a(e, r);
		}, F = x(() => s(S).includes(r));
		T(N, (e) => {
			s(F) && e(P);
		}), O(o), h((e, n, r, a, c) => {
			l = i(o, 1, "msg svelte-1cwgyvm", null, l, { unread: !s(t).seen }), m(u, "aria-expanded", e), v = ee(f, "", v, { "--h": n }), d(y, r), d(ne, a), d(j, c);
		}, [
			() => s(S).includes(r),
			() => ie(s(t).from),
			() => oe({
				name: ae(s(t).from),
				addr: s(t).from
			}),
			() => ae(s(t).from),
			() => se(s(t).date)
		]), n("click", u, () => p(te, s(S).includes(r) ? s(S).filter((e) => e !== r) : [...s(S), r], !0)), a(e, o);
	}), O(N), h(() => {
		d(F, s(ne) || "(no subject)"), d(ce, `${c.note.props.account ?? "" ?? ""}${c.note.props.folder ? ` · ${c.note.props.folder}` : ""} · ${s(y).length ?? ""} message${s(y).length === 1 ? "" : "s"} `);
	}), n("click", le, () => c.note.showNote()), a(o, N), j();
}
I(["click"]);
//#endregion
//#region plugins/beta/email/ui/src/signin.ts
var J = (e) => (e.plugin.settings.accounts ?? []).filter((e) => e?.name), Y = !1;
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
		let t = J(e).filter((e) => e.auth === "outlook");
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
		e.toast("Signed in to Outlook", `${r}: its mail can be read now.`, "success"), window.dispatchEvent(new CustomEvent("atlas-email:signed-in", { detail: { account: r } })), A(e, "watch", {}, 30).catch(() => {});
	}, a = (t) => e.toast("Outlook sign-in", String(t?.message ?? t), "error");
	try {
		let t = await A(e, "signin_start", n ? { record: n } : { account: r }, 60), o = () => void A(e, "signin_reopen", { url: t.url }).catch(() => window.open(t.url, "_blank"));
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
				await A(e, "signin_finish", { account: r }, 660);
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
				await A(e, "signin_finish", { account: r }, 900);
			} finally {
				n();
			}
			return i();
		}
		let s = !1, c = (t) => {
			s || (s = !0, A(e, "signin_finish", {
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
//#region plugins/beta/email/ui/src/main.ts
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
				await A(e, "sync", {}, 600);
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
		items: async () => (await A(e, "thunderbird")).accounts.map((e, t) => ({
			value: String(t),
			title: e.user || e.name,
			detail: `${e.imap_host} · ${e.auth} · ${e.profile}`
		})),
		onpick: async (n) => {
			let r = (await A(e, "thunderbird")).accounts[Number(n)].record;
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
						let n = await A(e, "thunderbird_mail", {
							account: t,
							dry: !0
						}, 600), r = Object.values(n.missing ?? {}).reduce((e, t) => e + t, 0);
						if (!r) {
							e.toast("Email", n.note ?? "Every local message is already a note.");
							return;
						}
						if (!confirm(`${r} messages Thunderbird keeps for ${t} are in no note (${Object.entries(n.missing).map(([e, t]) => `${e}: ${t}`).join(", ")}). Write them as notes?`)) return;
						let i = await A(e, "thunderbird_mail", {
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
	i.__atlasEmailSignin && window.removeEventListener("atlas-email:signin", i.__atlasEmailSignin), i.__atlasEmailSignin = (t) => void X(e, t.detail), window.addEventListener("atlas-email:signin", i.__atlasEmailSignin), e.plugin.registerSettingsSection?.({
		id: "rules",
		title: "Rules",
		hint: "What happens to new mail by itself: important, archive, a label, kept as a note.",
		mount: (t) => {
			let r = u(M, {
				target: t,
				props: {
					inline: !0,
					mail: {
						call: (t, n = {}, r = 120) => A(e, t, n, r),
						search: (e) => n({ search: e }),
						toast: (t, n = "info") => e.toast("Email", t, n),
						atlas: { open: (t, n, r) => e.open(t, n, r) }
					}
				}
			});
			return () => f(r);
		}
	}), e.registerNoteView?.("mail", {
		title: "Mail",
		types: ["email-thread", "email"],
		render: (t, r) => {
			let i = u(q, {
				target: t,
				props: {
					atlas: e,
					note: r,
					onmail: n
				}
			});
			return () => f(i);
		}
	}), e.registerBlock("email.inbox", (t, r) => {
		let i = u(B, {
			target: t,
			props: {
				atlas: e,
				options: r.options ?? {},
				onopen: n
			}
		});
		return () => f(i);
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
			let r = u(B, {
				target: t,
				props: {
					atlas: e,
					options: { limit: 12 },
					onopen: n
				}
			});
			return () => f(r);
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
				let { unread: t } = await A(e, "unread_count", {}, 20);
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
		n?.key === "accounts" && A(e, "rename_account", {
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
		A(e, "watch", {}, 60).then(s, () => {});
	}, 4e3);
	return () => clearTimeout(c);
}
//#endregion
export { Q as register };
