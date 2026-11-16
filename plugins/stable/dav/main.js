import { $ as e, C as t, F as n, H as r, I as i, J as a, L as o, O as s, Q as c, S as l, St as u, T as d, U as f, V as p, W as m, X as h, Y as g, Z as _, _t as v, a as y, at as b, bt as x, d as S, dt as C, f as w, ft as T, g as E, gt as D, h as O, ht as k, i as A, k as j, l as M, mt as N, nt as P, p as F, pt as I, q as L, r as R, rt as z, s as B, st as V, ut as H, v as U, x as W, xt as G, yt as K } from "./ui-lib/layout.js";
//#region plugins/stable/dav/ui/src/Upcoming.svelte
var q = e("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Settings…</button></div></div>"), J = e("<div class=\"atlas-empty\">Reading the calendar…</div>"), Y = e("<div class=\"atlas-empty\">Nothing.</div>"), ee = e("<button class=\"ev svelte-10ncuqf\"><span class=\"bar svelte-10ncuqf\" aria-hidden=\"true\"></span> <span class=\"t svelte-10ncuqf\"> </span> <span class=\"s svelte-10ncuqf\"> </span></button>"), te = e("<button class=\"more svelte-10ncuqf\"> </button>"), ne = e("<section class=\"svelte-10ncuqf\"><button class=\"day svelte-10ncuqf\"> </button> <!> <!> <!></section>"), re = e("<div class=\"up svelte-10ncuqf\"><!></div>"), ie = {
	hash: "svelte-10ncuqf",
	code: ".up.svelte-10ncuqf {display:grid;gap:8px;container-type:inline-size;}section.svelte-10ncuqf {display:grid;gap:1px;}.day.svelte-10ncuqf {all:unset;cursor:pointer;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;padding:2px 0;}.day.svelte-10ncuqf:hover {color:var(--text);}.ev.svelte-10ncuqf, .more.svelte-10ncuqf {all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:var(--radius-sm);min-width:0;}.ev.svelte-10ncuqf:hover, .more.svelte-10ncuqf:hover {background:var(--bg-hover);}.ev.svelte-10ncuqf:focus-visible, .day.svelte-10ncuqf:focus-visible, .more.svelte-10ncuqf:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.bar.svelte-10ncuqf {width:3px;align-self:stretch;border-radius:2px;background:var(--c);flex:none;}.t.svelte-10ncuqf {width:4.6em;flex:none;color:var(--text-muted);font-variant-numeric:tabular-nums;font-size:0.9em;}.s.svelte-10ncuqf {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.more.svelte-10ncuqf {color:var(--text-muted);font-size:0.85em;}"
};
function X(e, n) {
	x(n, !0), f(e, ie);
	let r = D(N([])), a = D(""), o = D(!1), l = Math.max(1, Math.min(31, Number(n.options.days ?? 7) || 7)), h = t(/* @__PURE__ */ new Date()), y = v(() => w(n.atlas.plugin.settings.time_format));
	async function E() {
		try {
			let e = await M(n.atlas, "range", {
				from: s(h),
				to: s(B(h, l - 1)),
				notes: n.atlas.plugin.settings.show_notes !== !1
			}, 30);
			k(r, e.events, !0), k(a, "");
		} catch (e) {
			k(a, e.message, !0);
		}
		k(o, !0);
	}
	j(() => {
		E(), M(n.atlas, "watch", {}, 30).then(E, () => {});
		let e, t = n.atlas.helper.on("changed", () => {
			clearTimeout(e), e = setTimeout(() => void E(), 250);
		});
		return () => {
			clearTimeout(e), t();
		};
	});
	let O = v(() => Array.from({ length: l }, (e, t) => B(h, t)).map((e) => ({
		d: e,
		evs: R(b(r), e).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || S(e).getTime() - S(t).getTime())
	})).filter((e, t) => t < 2 || e.evs.length)), A = (e) => W(e, h) ? "Today" : W(e, B(h, 1)) ? "Tomorrow" : e.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "short"
	});
	function P(e, t) {
		let r = e ? U(e) : null;
		r ? n.atlas.open(r) : n.onopen(s(t));
	}
	var F = re(), G = H(F), X = (e) => {
		var t = q(), r = H(t, !0), i = I(r), o = T(i);
		u(t), V(() => g(r, b(a))), z("click", o, () => n.atlas.plugin.openSettings()), _(e, t);
	}, Z = (e) => {
		var t = J();
		_(e, t);
	}, Q = (e) => {
		var t = c(), n = C(t);
		m(n, 17, () => b(O), (e) => e.d.getTime(), (e, t) => {
			var n = ne(), r = H(n), a = T(r, !0), o = I(r, 2), s = (e) => {
				var t = Y();
				_(e, t);
			};
			L(o, (e) => {
				b(t).evs.length || e(s);
			});
			var c = I(o, 2);
			m(c, 17, () => b(t).evs.slice(0, 6), (e) => e.calendar + e.uid + (e.rid ?? ""), (e, n) => {
				var r = ee();
				let a;
				var o = I(H(r), 2), s = T(o, !0), c = I(o, 2), l = T(c, !0);
				u(r), V((e) => {
					i(r, "title", b(n).calendar_name), a = p(r, "", a, { "--c": b(n).color ?? "var(--accent)" }), g(s, e), g(l, b(n).summary || "(no title)");
				}, [() => b(n).all_day ? "all day" : d(S(b(n)), b(y))]), z("click", r, () => P(b(n), b(t).d)), _(e, r);
			});
			var l = I(c, 2), f = (e) => {
				var n = te(), r = T(n);
				V(() => g(r, `+${b(t).evs.length - 6} more`)), z("click", n, () => P(null, b(t).d)), _(e, n);
			};
			L(l, (e) => {
				b(t).evs.length > 6 && e(f);
			}), u(n), V((e) => g(a, e), [() => A(b(t).d)]), z("click", r, () => P(null, b(t).d)), _(e, n);
		}), _(e, t);
	};
	L(G, (e) => {
		b(a) ? e(X) : b(o) ? e(Q, -1) : e(Z, 1);
	}), u(F), _(e, F), K();
}
P(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/EventBlock.svelte
var Z = e("<div class=\"atlas-notice error\"> </div>"), Q = e("<div class=\"atlas-empty\">Reading the calendar…</div>"), ae = e("<div class=\"atlas-empty\"> </div>"), oe = e("<span class=\"warn svelte-1bk2mts\">Cancelled</span>"), $ = e("<span class=\"line svelte-1bk2mts\"><!> </span>"), se = e("<a class=\"atlas-btn join svelte-1bk2mts\" target=\"_blank\" rel=\"noreferrer\" data-outside=\"\"><!>Join</a>"), ce = e("<span class=\"sq svelte-1bk2mts\" aria-hidden=\"true\"></span> <div class=\"main svelte-1bk2mts\"><button title=\"Open this day in the calendar\"> </button> <!> <!> <!> <span class=\"line faint svelte-1bk2mts\"><!> </span></div> <!>", 1), le = e("<div class=\"evb svelte-1bk2mts\"><!></div>"), ue = {
	hash: "svelte-1bk2mts",
	code: ".evb.svelte-1bk2mts {display:flex;gap:10px;align-items:flex-start;container-type:inline-size;min-width:0;}.sq.svelte-1bk2mts {width:12px;height:12px;border-radius:3px;background:var(--c);flex:none;margin-top:4px;}.main.svelte-1bk2mts {display:grid;gap:2px;flex:1;min-width:0;}.when.svelte-1bk2mts {all:unset;cursor:pointer;font-weight:600;color:var(--heading);overflow-wrap:anywhere;border-radius:var(--radius-sm);}.when.svelte-1bk2mts:hover {text-decoration:underline;}.when.svelte-1bk2mts:focus-visible {outline:2px solid var(--accent);}.cancel.svelte-1bk2mts {text-decoration:line-through;}.warn.svelte-1bk2mts {color:var(--red);font-size:0.88em;}.line.svelte-1bk2mts {display:flex;gap:6px;align-items:center;color:var(--text);font-size:0.9em;min-width:0;overflow-wrap:anywhere;}.line.svelte-1bk2mts .icon {color:var(--text-faint);flex:none;}.faint.svelte-1bk2mts {color:var(--text-muted);}.join.svelte-1bk2mts {display:inline-flex;align-items:center;gap:6px;text-decoration:none;flex:none;}"
};
function de(e, t) {
	x(t, !0), f(e, ue);
	let n = D(null), a = D(""), o = D(""), s = v(() => w(t.atlas.plugin.settings.time_format)), c = v(() => b(n)?.event ?? null), d = v(() => b(c) ? O(b(c)) : null);
	async function m() {
		try {
			let e = await t.props(), r = (t) => e[t] === void 0 || e[t] === null ? "" : String(e[t]);
			if (!r("uid")) {
				k(a, "This note names no event (its uid property is empty).");
				return;
			}
			k(o, r("start"), !0), k(n, await M(t.atlas, "event", {
				uid: r("uid"),
				rid: r("recurrence_id") || void 0,
				start: b(o)
			}, 30), !0), k(a, "");
		} catch (e) {
			k(a, e.message, !0);
		}
	}
	j(() => {
		m();
		let e, n = t.atlas.helper.on("changed", () => {
			clearTimeout(e), e = setTimeout(() => void m(), 300);
		});
		return () => {
			clearTimeout(e), n();
		};
	});
	let h = v(() => b(c)?.status === "CANCELLED" || !b(c) && !!b(n)?.note?.cancelled);
	var y = le();
	let S;
	var E = H(y), N = (e) => {
		var t = Z(), n = T(t, !0);
		V(() => g(n, b(a))), _(e, t);
	}, P = (e) => {
		var t = Q();
		_(e, t);
	}, F = (e) => {
		var t = ae(), n = T(t, !0);
		V(() => g(n, b(h) ? "This event was deleted from its calendar; the note is kept." : "This event is not in the calendar's cache (not synced yet, or its calendar is hidden).")), _(e, t);
	}, R = (e) => {
		var n = ce(), a = I(C(n), 2), f = H(a);
		let p;
		var m = T(f, !0), v = I(f, 2), y = (e) => {
			var t = oe();
			_(e, t);
		};
		L(v, (e) => {
			b(h) && e(y);
		});
		var x = I(v, 2), S = (e) => {
			var t = $(), n = H(t);
			A(n, {
				name: "pin",
				size: 13
			});
			var r = I(n, 1, !0);
			u(t), V(() => g(r, b(c).location)), _(e, t);
		};
		L(x, (e) => {
			b(c).location && e(S);
		});
		var w = I(x, 2), E = (e) => {
			var t = $(), n = H(t);
			A(n, {
				name: "people",
				size: 13
			});
			var r = I(n);
			u(t), V((e) => g(r, `${e ?? ""}${b(c).attendees.length > 4 ? ` and ${b(c).attendees.length - 4} more` : ""}`), [() => b(c).attendees.slice(0, 4).map((e) => e.name ?? e.email).join(", ")]), _(e, t);
		};
		L(w, (e) => {
			b(c).attendees?.length && e(E);
		});
		var D = I(w, 2), O = H(D);
		A(O, {
			name: "calendar",
			size: 13
		});
		var k = I(O, 1, !0);
		u(D), u(a);
		var j = I(a, 2), M = (e) => {
			var t = se(), n = H(t);
			A(n, {
				name: "video",
				size: 14
			}), G(), u(t), V(() => i(t, "href", b(d))), _(e, t);
		};
		L(j, (e) => {
			b(d) && e(M);
		}), V((e) => {
			p = r(f, 1, "when svelte-1bk2mts", null, p, { cancel: b(h) }), g(m, e), g(k, b(c).calendar_name);
		}, [() => l(b(c), b(s))]), z("click", f, () => t.onopen((b(c).start ?? b(o)).slice(0, 10))), _(e, n);
	};
	L(E, (e) => {
		b(a) ? e(N) : b(n) ? b(c) ? e(R, -1) : e(F, 2) : e(P, 1);
	}), u(y), V(() => S = p(y, "", S, { "--c": b(c)?.color ?? "var(--accent)" })), _(e, y), K();
}
P(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/CalendarsSection.svelte
var fe = e("<p class=\"none svelte-1ajrurb\"> </p>"), pe = e("<p class=\"none svelte-1ajrurb\">No calendar yet: add an account above, then they show here.</p>"), me = e("<span class=\"ro svelte-1ajrurb\">· read-only</span>"), he = e("<button class=\"pc svelte-1ajrurb\" role=\"radio\"></button>"), ge = e("<li class=\"svelte-1ajrurb\"><label class=\"svelte-1ajrurb\"><input type=\"checkbox\"/> <span class=\"sq svelte-1ajrurb\"></span> <!></label> <code class=\"svelte-1ajrurb\"> </code> <span class=\"pal svelte-1ajrurb\" role=\"radiogroup\"></span></li>"), _e = e("<h4 class=\"svelte-1ajrurb\"> </h4> <ul class=\"svelte-1ajrurb\"></ul>", 1), ve = e("<!> <!>", 1), ye = {
	hash: "svelte-1ajrurb",
	code: "h4.svelte-1ajrurb {margin:10px 0 4px;font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}ul.svelte-1ajrurb {list-style:none;margin:0;padding:0;display:grid;gap:4px;}li.svelte-1ajrurb {display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;}label.svelte-1ajrurb {display:flex;align-items:center;gap:8px;flex:1 1 12em;min-width:0;color:var(--text);}.sq.svelte-1ajrurb {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}.ro.svelte-1ajrurb {color:var(--text-faint);}code.svelte-1ajrurb {color:var(--text-faint);font-size:0.8em;}.pal.svelte-1ajrurb {display:flex;gap:4px;}.pc.svelte-1ajrurb {all:unset;cursor:pointer;width:16px;height:16px;border-radius:50%;background:var(--c);}.pc[aria-checked=\"true\"].svelte-1ajrurb {box-shadow:0 0 0 2px var(--bg-elev, var(--bg)), 0 0 0 4px var(--c);}.pc.svelte-1ajrurb:focus-visible {outline:2px solid var(--accent);outline-offset:2px;}.none.svelte-1ajrurb {color:var(--text-faint);margin:4px 0;}"
};
function be(e, t) {
	x(t, !0), f(e, ye);
	let r = [
		"#3b82f6",
		"#0ea5e9",
		"#14b8a6",
		"#22c55e",
		"#eab308",
		"#f97316",
		"#ef4444",
		"#ec4899",
		"#a855f7",
		"#64748b"
	], a = D(N([])), s = D(N([])), c = D(""), l = D(N([])), d = D(N({}));
	function h() {
		let e = t.ctx.settings();
		k(l, (e.hidden ?? []).slice(), !0), k(d, Object.fromEntries((e.colors ?? []).flatMap((e) => {
			let t = e.lastIndexOf(":");
			return t > 0 ? [[e.slice(0, t).trim(), e.slice(t + 1).trim()]] : [];
		})), !0);
	}
	j(() => {
		h(), t.ctx.call("sources", {}, 30).then((e) => {
			let t = e;
			k(a, t.sources, !0), k(s, t.accounts ?? [], !0);
		}, (e) => k(c, String(e?.message ?? e), !0));
	});
	let y = v(() => [...b(s).map((e) => ({
		title: e.name,
		items: b(a).filter((t) => t.account === e.name)
	})), {
		title: "Subscriptions",
		items: b(a).filter((e) => e.kind === "ics")
	}].filter((e) => e.items.length)), S = (e) => !b(l).includes(e.id) && !b(l).includes(e.name), w = (e) => b(d)[e.id] ?? b(d)[e.name] ?? e.shown_color ?? e.color ?? F(e.id);
	function E(e) {
		k(l, S(e) ? [...b(l), e.id] : b(l).filter((t) => t !== e.id && t !== e.name), !0), t.ctx.save({ hidden: b(l) });
	}
	function O(e, n) {
		let r = Object.fromEntries(Object.entries(b(d)).filter(([t]) => t !== e.name));
		k(d, {
			...r,
			[e.id]: n
		}, !0), t.ctx.save({ colors: Object.entries(b(d)).map(([e, t]) => `${e}: ${t}`) });
	}
	var A = ve(), M = C(A), P = (e) => {
		var t = fe(), n = T(t, !0);
		V(() => g(n, b(c))), _(e, t);
	}, R = (e) => {
		var t = pe();
		_(e, t);
	};
	L(M, (e) => {
		b(c) ? e(P) : b(y).length || e(R, 1);
	});
	var B = I(M, 2);
	m(B, 17, () => b(y), (e) => e.title, (e, t) => {
		var a = _e(), s = C(a), c = T(s, !0), l = I(s, 2);
		m(l, 21, () => b(t).items, (e) => e.id, (e, t) => {
			var a = ge(), s = H(a), c = H(s);
			n(c);
			var l = I(c, 2);
			let d;
			var f = I(l, 1, !0), h = I(f), v = (e) => {
				var t = me();
				_(e, t);
			};
			L(h, (e) => {
				b(t).writable || e(v);
			}), u(s);
			var y = I(s, 2), x = T(y, !0), C = I(y, 2);
			m(C, 20, () => r, (e) => e, (e, n) => {
				var r = he();
				let a;
				V((e) => {
					i(r, "aria-checked", e), i(r, "aria-label", n), a = p(r, "", a, { "--c": n });
				}, [() => w(b(t)) === n]), z("click", r, () => O(b(t), n)), _(e, r);
			}), u(C), u(a), V((e, n) => {
				o(c, e), d = p(l, "", d, { "--c": n }), g(f, b(t).name), g(x, b(t).id), i(C, "aria-label", `Colour of ${b(t).name ?? ""}`);
			}, [() => S(b(t)), () => w(b(t))]), z("change", c, () => E(b(t))), _(e, a);
		}), u(l), V(() => g(c, b(t).title)), _(e, a);
	}), _(e, A), K();
}
P(["change", "click"]);
//#endregion
//#region ui/src/lib/local-day.ts
var xe = (e = /* @__PURE__ */ new Date()) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
//#endregion
//#region plugins/stable/dav/ui/src/main.ts
function Se(e) {
	let t = () => e.plugin.settings.accounts ?? [], n = () => t().some((e) => e.name && e.user && (e.url || e.server === "exchange")) || !!(e.plugin.settings.url && e.plugin.settings.user), r = (t = {}) => {
		window.__atlasCalendarShow = t, e.openView(void 0, {
			title: "Calendar",
			icon: "calendar"
		}), setTimeout(() => {
			window.dispatchEvent(new CustomEvent("atlas-calendar:show", { detail: t })), window.__atlasCalendarShow = void 0;
		}, 300);
	};
	e.registerCommand({
		id: "open",
		title: "Calendar: open",
		run: () => r()
	}), e.registerCommand({
		id: "today",
		title: "Calendar: today",
		run: () => r({
			date: xe(),
			view: "day"
		})
	}), e.registerCommand({
		id: "new",
		title: "Calendar: new event",
		run: () => typeof e.openDialog == "function" ? void e.openDialog(y, {
			title: "New event",
			width: 640,
			height: 560
		}) : r({ create: !0 })
	}), window.addEventListener("atlas-calendar:new", (t) => {
		let { ack: n, ...i } = t.detail ?? {};
		n && window.dispatchEvent(new CustomEvent("atlas-calendar:heard")), typeof e.openDialog == "function" ? e.openDialog(E(i), {
			title: i.guests?.length ? "New meeting" : "New event",
			width: 640,
			height: 600
		}) : r({ create: !0 });
	}), e.registerCommand({
		id: "quick",
		title: "Calendar: quick add (in words)…",
		run: () => r({ quick: !0 })
	}), e.registerCommand({
		id: "sync",
		title: "Calendar: put important notes on the server",
		run: async () => {
			if (!n()) {
				e.toast("Calendar", "Add a calendar account first.", "error"), e.plugin.openSettings();
				return;
			}
			e.toast("Calendar", "Looking for important notes…");
			try {
				let t = await M(e, "sync", {}, 300), n = (t.events ?? []).filter((e) => e.outcome === "failed").map((e) => `${e.title}: ${e.why}`);
				e.toast("Calendar", [t.summary, ...n.slice(0, 3)].join("\n"), n.length ? "error" : void 0);
			} catch (t) {
				e.toast("Calendar", t.message, "error");
			}
		}
	}), e.registerCommand({
		id: "calendars",
		title: "Calendar: test the accounts",
		run: async () => {
			try {
				await M(e, "refresh", { force: !0 }, 300);
				let t = await M(e, "calendars");
				if (!t.accounts.length) {
					e.toast("Calendar", "No account yet.", "error"), e.plugin.openSettings();
					return;
				}
				let n = t.accounts.map((e) => `${e.account}: ${e.status?.state === "ok" ? e.calendars.map((e) => `${e.name}${e.id === t.default ? " (new events)" : ""}${e.writable ? "" : " (read-only)"}`).join(", ") || "no calendar" : e.status?.text ?? "?"}`);
				e.toast("Calendar", n.join("\n"), t.accounts.some((e) => e.status?.state === "error") ? "error" : void 0);
			} catch (t) {
				e.toast("Calendar", t.message, "error");
			}
		}
	}), e.registerCommand({
		id: "test-account",
		title: "Calendar: test an account",
		run: async (t) => {
			let n = t?.record;
			if (!n) {
				e.plugin.openSettings();
				return;
			}
			try {
				let t = await M(e, "test_account", { record: n }, 60);
				e.toast(String(n.name ?? "Account"), t.text, t.ok ? "success" : "error"), t.ok && M(e, "refresh", { force: !0 }, 300).catch(() => {});
			} catch (t) {
				e.toast("Calendar", t.message, "error");
			}
		}
	}), e.registerCommand({
		id: "sync-now",
		title: "Calendar: sync now",
		run: async () => {
			try {
				let t = await M(e, "refresh", { force: !0 }, 300);
				e.toast("Calendar", t.errors.length ? t.errors.join("\n") : "Every account and subscription is up to date.", t.errors.length ? "error" : "success");
			} catch (t) {
				e.toast("Calendar", t.message, "error");
			}
		}
	}), e.registerCommand({
		id: "test-subscription",
		title: "Calendar: test a subscription",
		run: async (t) => {
			let n = t?.record;
			if (!n) {
				e.plugin.openSettings();
				return;
			}
			try {
				let t = await M(e, "test_subscription", { record: n }, 60);
				e.toast("Subscription", t.summary, "success"), M(e, "refresh", { force: !0 }, 120).catch(() => {});
			} catch (t) {
				e.toast("Subscription", t.message, "error");
			}
		}
	}), e.helper.on("added", (t) => {
		let n = t;
		e.toast(n.outcome === "updated" ? "Updated in your calendar" : "Added to your calendar", `${n.title} — ${n.start}`, "info", { run: () => r({
			date: n.start.slice(0, 10),
			view: "day"
		}) });
	});
	let i = (t) => {
		let n = /* @__PURE__ */ new Date();
		e.pick({
			placeholder: "Link to which event? (type to filter)",
			tag: "Link to event",
			icon: "calendar",
			items: async () => {
				let t = await M(e, "range", {
					from: s(B(n, -14)),
					to: s(B(n, 60))
				}, 60), r = (e) => Math.abs(new Date(e.start.length === 10 ? `${e.start}T12:00` : e.start).getTime() - n.getTime());
				return t.events.filter((e) => e.calendar !== "notes").sort((e, t) => r(e) - r(t)).slice(0, 200).map((t) => ({
					value: JSON.stringify({
						uid: t.uid,
						rid: t.rid,
						start: t.start
					}),
					title: t.summary || "(no title)",
					detail: `${l(t, w(e.plugin.settings.time_format))} · ${t.calendar_name}`
				}));
			},
			onpick: async (n) => {
				try {
					let r = await M(e, "link_event", {
						...JSON.parse(n),
						link: t
					}, 60);
					e.toast("Linked to the event", `${t.replace(/\.md$/, "")} → ${r.note.replace(/\.md$/, "").split("/").pop()}`, "success", {
						label: "Open",
						run: () => e.open(r.note)
					});
				} catch (t) {
					e.toast("Not linked", t.message, "error");
				}
			}
		});
	}, o = () => {
		let t = e.context().active;
		return t?.path && /\.md$/i.test(t.path) ? t.path : null;
	};
	e.registerCommand({
		id: "link",
		title: "Calendar: link this note to an event…",
		run: () => {
			let t = o();
			t ? i(t) : e.toast("Calendar", "Open the note to link first.", "error");
		}
	}), window.addEventListener("atlas-calendar:link", (e) => {
		let { link: t, ack: n } = e.detail ?? {};
		n && window.dispatchEvent(new CustomEvent("atlas-calendar:heard")), t && i(t);
	}), e.registerCommand({
		id: "time-block",
		title: "Calendar: time-block the task at the caret…",
		run: async () => {
			let t = e.context().selection, n = t ? (await e.readText(t.path)).split("\n")[t.from_line - 1] ?? "" : "", i = /^\s*(?:[-*+]|\d+[.)])\s+\[ \]\s+(.*)$/.exec(n);
			if (!t || !i) {
				e.toast("Calendar", "Put the caret on an open task (- [ ] …) first.", "error");
				return;
			}
			let a = i[1].replace(/\s+\^[\w-]+\s*$/, "").replace(/\s+(?:[⏫🔺🔼🔽⏬]|[📅⏳🛫➕✅]\s*\d{4}-\d{2}-\d{2}|🔁.*).*$/u, "").trim();
			r({
				view: "week",
				place: {
					path: t.path,
					line: t.from_line,
					title: a,
					date: "",
					done: !1,
					props: { from: "task" }
				}
			});
		}
	}), e.registerBlock("calendar.event", (t, n) => {
		let i = a(de, {
			target: t,
			props: {
				atlas: e,
				props: n.props,
				onopen: (e) => r({
					date: e,
					view: "day"
				})
			}
		});
		return () => h(i);
	}, { title: "Calendar: the event of this note" }), e.registerBlock("dav.upcoming", (t, n) => {
		let i = a(X, {
			target: t,
			props: {
				atlas: e,
				options: n.options ?? {},
				onopen: (e) => r({
					date: e,
					view: "day"
				})
			}
		});
		return () => h(i);
	}, {
		title: "Calendar: upcoming",
		options: [{
			key: "days",
			label: "Days",
			kind: "number"
		}]
	}), e.plugin.settings.url && e.plugin.settings.user && !t().length && (async () => {
		let t = await M(e, "migrate", {}, 60);
		t.values && (await e.plugin.saveSettings(t.values), e.toast("Calendar", `Your calendar account is now the card “${t.name}” (Settings → Calendar → Accounts); add more there.`, "success"));
	})().catch((t) => e.toast("Calendar: account not moved", String(t.message ?? t), "error")), e.helper.on("settings:renamed", (t) => {
		let { key: n, from: r, to: i } = t;
		if (n !== "accounts") return;
		let a = (e) => typeof e == "string" && e.startsWith(`${r}/`) ? `${i}/${e.slice(r.length + 1)}` : e, o = e.plugin.settings;
		e.plugin.saveSettings({
			calendar: a(o.calendar) || null,
			hidden: (o.hidden ?? []).map(a),
			colors: (o.colors ?? []).map(a)
		}).catch((t) => e.toast("Calendar", `The renamed account's calendars kept their old ids: ${t.message}`, "error"));
	});
	let c = e.plugin.registerSettingsSection?.({
		id: "calendars",
		title: "Calendars",
		hint: "Which calendars the pane shows, and their colours.",
		place: "before",
		mount(e, t) {
			let n = a(be, {
				target: e,
				props: { ctx: t }
			});
			return () => h(n);
		}
	}), u = setTimeout(() => {
		M(e, "watch", {}, 60).catch(() => {});
	}, 5e3);
	return () => {
		clearTimeout(u), c?.();
	};
}
//#endregion
export { Se as register };
