import { $ as e, B as t, Ct as n, D as r, E as i, Et as a, G as o, J as s, K as c, M as l, N as u, Q as d, S as f, T as p, Tt as m, V as h, Z as g, _t as _, a as v, b as y, bt as b, c as x, dt as S, et as C, f as w, g as T, gt as E, h as D, ht as O, i as k, k as A, lt as j, m as M, mt as N, nt as P, ot as F, q as I, r as L, rt as R, st as z, tt as B, vt as V, wt as H, xt as U, y as W, yt as G, z as K } from "./ui-lib/layout.js";
// plugins/stable/dav/ui/src/Upcoming.svelte
var ee = R("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Settings…</button></div></div>"), te = R("<div class=\"atlas-empty\">Reading the calendar…</div>"), ne = R("<div class=\"atlas-empty\">Nothing.</div>"), re = R("<button class=\"ev svelte-10ncuqf\"><span class=\"bar svelte-10ncuqf\" aria-hidden=\"true\"></span> <span class=\"t svelte-10ncuqf\"> </span> <span class=\"s svelte-10ncuqf\"> </span></button>"), ie = R("<button class=\"more svelte-10ncuqf\"> </button>"), q = R("<section class=\"svelte-10ncuqf\"><button class=\"day svelte-10ncuqf\"> </button> <!> <!> <!></section>"), J = R("<div class=\"up svelte-10ncuqf\"><!></div>"), ae = {
	hash: "svelte-10ncuqf",
	code: ".up.svelte-10ncuqf {display:grid;gap:8px;container-type:inline-size;}section.svelte-10ncuqf {display:grid;gap:1px;}.day.svelte-10ncuqf {all:unset;cursor:pointer;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;padding:2px 0;}.day.svelte-10ncuqf:hover {color:var(--text);}.ev.svelte-10ncuqf, .more.svelte-10ncuqf {all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:var(--radius-sm);min-width:0;}.ev.svelte-10ncuqf:hover, .more.svelte-10ncuqf:hover {background:var(--bg-hover);}.ev.svelte-10ncuqf:focus-visible, .day.svelte-10ncuqf:focus-visible, .more.svelte-10ncuqf:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.bar.svelte-10ncuqf {width:3px;align-self:stretch;border-radius:2px;background:var(--c);flex:none;}.t.svelte-10ncuqf {width:4.6em;flex:none;color:var(--text-muted);font-variant-numeric:tabular-nums;font-size:0.9em;}.s.svelte-10ncuqf {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.more.svelte-10ncuqf {color:var(--text-muted);font-size:0.85em;}"
};
function Y(i, c) {
	H(c, !0), I(i, ae);
	let d = b(V([])), m = b(""), h = b(!1), v = Math.max(1, Math.min(31, Number(c.options.days ?? 7) || 7)), y = r(/* @__PURE__ */ new Date()), C = U(() => D(c.atlas.plugin.settings.time_format));
	async function T() {
		try {
			let e = await w(c.atlas, "range", {
				from: l(y),
				to: l(x(y, v - 1)),
				notes: c.atlas.plugin.settings.show_notes !== !1
			}, 30);
			G(d, e.events, !0), G(m, "");
		} catch (e) {
			G(m, e.message, !0);
		}
		G(h, !0);
	}
	u(() => {
		T(), w(c.atlas, "watch", {}, 30).then(T, () => {});
		let e, t = c.atlas.helper.on("changed", () => {
			clearTimeout(e), e = setTimeout(() => void T(), 250);
		});
		return () => {
			clearTimeout(e), t();
		};
	});
	let k = U(() => Array.from({ length: v }, (e, t) => x(y, t)).map((e) => ({
		d: e,
		evs: L(j(d), e).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || M(e).getTime() - M(t).getTime())
	})).filter((e, t) => t < 2 || e.evs.length)), F = (e) => p(e, y) ? "Today" : p(e, x(y, 1)) ? "Tomorrow" : e.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "short"
	});
	function R(e, t) {
		let n = e ? f(e) : null;
		n ? c.atlas.open(n) : c.onopen(l(t));
	}
	var W = J(), K = N(W), Y = (t) => {
		var n = ee(), r = N(n, !0), i = _(r), o = E(i);
		a(n), S(() => e(r, j(m))), z("click", o, () => c.atlas.plugin.openSettings()), B(t, n);
	}, X = (e) => {
		var t = te();
		B(e, t);
	}, Z = (n) => {
		var r = P(), i = O(r);
		s(i, 17, () => j(k), (e) => e.d.getTime(), (n, r) => {
			var i = q(), c = N(i), l = E(c, !0), u = _(c, 2), d = (e) => {
				var t = ne();
				B(e, t);
			};
			g(u, (e) => {
				j(r).evs.length || e(d);
			});
			var f = _(u, 2);
			s(f, 17, () => j(r).evs.slice(0, 6), (e) => e.calendar + e.uid + (e.rid ?? ""), (n, i) => {
				var s = re();
				let c;
				var l = _(N(s), 2), u = E(l, !0), d = _(l, 2), f = E(d, !0);
				a(s), S((n) => {
					t(s, "title", j(i).calendar_name), c = o(s, "", c, { "--c": j(i).color ?? "var(--accent)" }), e(u, n), e(f, j(i).summary || "(no title)");
				}, [() => j(i).all_day ? "all day" : A(M(j(i)), j(C))]), z("click", s, () => R(j(i), j(r).d)), B(n, s);
			});
			var p = _(f, 2), m = (t) => {
				var n = ie(), i = E(n);
				S(() => e(i, `+${j(r).evs.length - 6} more`)), z("click", n, () => R(null, j(r).d)), B(t, n);
			};
			g(p, (e) => {
				j(r).evs.length > 6 && e(m);
			}), a(i), S((t) => e(l, t), [() => F(j(r).d)]), z("click", c, () => R(null, j(r).d)), B(n, i);
		}), B(n, r);
	};
	g(K, (e) => {
		j(m) ? e(Y) : j(h) ? e(Z, -1) : e(X, 1);
	}), a(W), B(i, W), n();
}
F(["click"]);
// plugins/stable/dav/ui/src/EventBlock.svelte
var X = R("<div class=\"atlas-notice error\"> </div>"), Z = R("<div class=\"atlas-empty\">Reading the calendar…</div>"), oe = R("<div class=\"atlas-empty\"> </div>"), se = R("<span class=\"warn svelte-1bk2mts\">Cancelled</span>"), Q = R("<span class=\"line svelte-1bk2mts\"><!> </span>"), ce = R("<a class=\"atlas-btn join svelte-1bk2mts\" target=\"_blank\" rel=\"noreferrer\" data-outside=\"\"><!>Join</a>"), le = R("<span class=\"sq svelte-1bk2mts\" aria-hidden=\"true\"></span> <div class=\"main svelte-1bk2mts\"><button title=\"Open this day in the calendar\"> </button> <!> <!> <!> <span class=\"line faint svelte-1bk2mts\"><!> </span></div> <!>", 1), ue = R("<div class=\"evb svelte-1bk2mts\"><!></div>"), de = {
	hash: "svelte-1bk2mts",
	code: ".evb.svelte-1bk2mts {display:flex;gap:10px;align-items:flex-start;container-type:inline-size;min-width:0;}.sq.svelte-1bk2mts {width:12px;height:12px;border-radius:3px;background:var(--c);flex:none;margin-top:4px;}.main.svelte-1bk2mts {display:grid;gap:2px;flex:1;min-width:0;}.when.svelte-1bk2mts {all:unset;cursor:pointer;font-weight:600;color:var(--heading);overflow-wrap:anywhere;border-radius:var(--radius-sm);}.when.svelte-1bk2mts:hover {text-decoration:underline;}.when.svelte-1bk2mts:focus-visible {outline:2px solid var(--accent);}.cancel.svelte-1bk2mts {text-decoration:line-through;}.warn.svelte-1bk2mts {color:var(--red);font-size:0.88em;}.line.svelte-1bk2mts {display:flex;gap:6px;align-items:center;color:var(--text);font-size:0.9em;min-width:0;overflow-wrap:anywhere;}.line.svelte-1bk2mts .icon {color:var(--text-faint);flex:none;}.faint.svelte-1bk2mts {color:var(--text-muted);}.join.svelte-1bk2mts {display:inline-flex;align-items:center;gap:6px;text-decoration:none;flex:none;}"
};
function fe(r, s) {
	H(s, !0), I(r, de);
	let l = b(null), d = b(""), f = b(""), p = U(() => D(s.atlas.plugin.settings.time_format)), h = U(() => j(l)?.event ?? null), v = U(() => j(h) ? W(j(h)) : null);
	async function y() {
		try {
			let e = await s.props(), t = (t) => e[t] === void 0 || e[t] === null ? "" : String(e[t]);
			if (!t("uid")) {
				G(d, "This note names no event (its uid property is empty).");
				return;
			}
			G(f, t("start"), !0), G(l, await w(s.atlas, "event", {
				uid: t("uid"),
				rid: t("recurrence_id") || void 0,
				start: j(f)
			}, 30), !0), G(d, "");
		} catch (e) {
			G(d, e.message, !0);
		}
	}
	u(() => {
		y();
		let e, t = s.atlas.helper.on("changed", () => {
			clearTimeout(e), e = setTimeout(() => void y(), 300);
		});
		return () => {
			clearTimeout(e), t();
		};
	});
	let x = U(() => j(h)?.status === "CANCELLED" || !j(h) && !!j(l)?.note?.cancelled);
	var C = ue();
	let T;
	var A = N(C), M = (t) => {
		var n = X(), r = E(n, !0);
		S(() => e(r, j(d))), B(t, n);
	}, P = (e) => {
		var t = Z();
		B(e, t);
	}, F = (t) => {
		var n = oe(), r = E(n, !0);
		S(() => e(r, j(x) ? "This event was deleted from its calendar; the note is kept." : "This event is not in the calendar's cache (not synced yet, or its calendar is hidden).")), B(t, n);
	}, L = (n) => {
		var r = le(), o = _(O(r), 2), l = N(o);
		let u;
		var d = E(l, !0), y = _(l, 2), b = (e) => {
			var t = se();
			B(e, t);
		};
		g(y, (e) => {
			j(x) && e(b);
		});
		var C = _(y, 2), w = (t) => {
			var n = Q(), r = N(n);
			k(r, {
				name: "pin",
				size: 13
			});
			var i = _(r, 1, !0);
			a(n), S(() => e(i, j(h).location)), B(t, n);
		};
		g(C, (e) => {
			j(h).location && e(w);
		});
		var T = _(C, 2), D = (t) => {
			var n = Q(), r = N(n);
			k(r, {
				name: "people",
				size: 13
			});
			var i = _(r);
			a(n), S((t) => e(i, `${t ?? ""}${j(h).attendees.length > 4 ? ` and ${j(h).attendees.length - 4} more` : ""}`), [() => j(h).attendees.slice(0, 4).map((e) => e.name ?? e.email).join(", ")]), B(t, n);
		};
		g(T, (e) => {
			j(h).attendees?.length && e(D);
		});
		var A = _(T, 2), M = N(A);
		k(M, {
			name: "calendar",
			size: 13
		});
		var P = _(M, 1, !0);
		a(A), a(o);
		var F = _(o, 2), I = (e) => {
			var n = ce(), r = N(n);
			k(r, {
				name: "video",
				size: 14
			}), m(), a(n), S(() => t(n, "href", j(v))), B(e, n);
		};
		g(F, (e) => {
			j(v) && e(I);
		}), S((t) => {
			u = c(l, 1, "when svelte-1bk2mts", null, u, { cancel: j(x) }), e(d, t), e(P, j(h).calendar_name);
		}, [() => i(j(h), j(p))]), z("click", l, () => s.onopen((j(h).start ?? j(f)).slice(0, 10))), B(n, r);
	};
	g(A, (e) => {
		j(d) ? e(M) : j(l) ? j(h) ? e(L, -1) : e(F, 2) : e(P, 1);
	}), a(C), S(() => T = o(C, "", T, { "--c": j(h)?.color ?? "var(--accent)" })), B(r, C), n();
}
F(["click"]);
// plugins/stable/dav/ui/src/CalendarsSection.svelte
var pe = R("<p class=\"none svelte-1ajrurb\"> </p>"), $ = R("<p class=\"none svelte-1ajrurb\">No calendar yet: add an account above, then they show here.</p>"), me = R("<span class=\"ro svelte-1ajrurb\">· read-only</span>"), he = R("<button class=\"pc svelte-1ajrurb\" role=\"radio\"></button>"), ge = R("<li class=\"svelte-1ajrurb\"><label class=\"svelte-1ajrurb\"><input type=\"checkbox\"/> <span class=\"sq svelte-1ajrurb\"></span> <!></label> <code class=\"svelte-1ajrurb\"> </code> <span class=\"pal svelte-1ajrurb\" role=\"radiogroup\"></span></li>"), _e = R("<h4 class=\"svelte-1ajrurb\"> </h4> <ul class=\"svelte-1ajrurb\"></ul>", 1), ve = R("<!> <!>", 1), ye = {
	hash: "svelte-1ajrurb",
	code: "h4.svelte-1ajrurb {margin:10px 0 4px;font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}ul.svelte-1ajrurb {list-style:none;margin:0;padding:0;display:grid;gap:4px;}li.svelte-1ajrurb {display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;}label.svelte-1ajrurb {display:flex;align-items:center;gap:8px;flex:1 1 12em;min-width:0;color:var(--text);}.sq.svelte-1ajrurb {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}.ro.svelte-1ajrurb {color:var(--text-faint);}code.svelte-1ajrurb {color:var(--text-faint);font-size:0.8em;}.pal.svelte-1ajrurb {display:flex;gap:4px;}.pc.svelte-1ajrurb {all:unset;cursor:pointer;width:16px;height:16px;border-radius:50%;background:var(--c);}.pc[aria-checked=\"true\"].svelte-1ajrurb {box-shadow:0 0 0 2px var(--bg-elev, var(--bg)), 0 0 0 4px var(--c);}.pc.svelte-1ajrurb:focus-visible {outline:2px solid var(--accent);outline-offset:2px;}.none.svelte-1ajrurb {color:var(--text-faint);margin:4px 0;}"
};
function be(r, i) {
	H(i, !0), I(r, ye);
	let c = [
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
	], l = b(V([])), d = b(V([])), f = b(""), p = b(V([])), m = b(V({}));
	function v() {
		let e = i.ctx.settings();
		G(p, (e.hidden ?? []).slice(), !0), G(m, Object.fromEntries((e.colors ?? []).flatMap((e) => {
			let t = e.lastIndexOf(":");
			return t > 0 ? [[e.slice(0, t).trim(), e.slice(t + 1).trim()]] : [];
		})), !0);
	}
	u(() => {
		v(), i.ctx.call("sources", {}, 30).then((e) => {
			let t = e;
			G(l, t.sources, !0), G(d, t.accounts ?? [], !0);
		}, (e) => G(f, String(e?.message ?? e), !0));
	});
	let y = U(() => [...j(d).map((e) => ({
		title: e.name,
		items: j(l).filter((t) => t.account === e.name)
	})), {
		title: "Subscriptions",
		items: j(l).filter((e) => e.kind === "ics")
	}].filter((e) => e.items.length)), x = (e) => !j(p).includes(e.id) && !j(p).includes(e.name), C = (e) => j(m)[e.id] ?? j(m)[e.name] ?? e.shown_color ?? e.color ?? T(e.id);
	function w(e) {
		G(p, x(e) ? [...j(p), e.id] : j(p).filter((t) => t !== e.id && t !== e.name), !0), i.ctx.save({ hidden: j(p) });
	}
	function D(e, t) {
		let n = Object.fromEntries(Object.entries(j(m)).filter(([t]) => t !== e.name));
		G(m, {
			...n,
			[e.id]: t
		}, !0), i.ctx.save({ colors: Object.entries(j(m)).map(([e, t]) => `${e}: ${t}`) });
	}
	var k = ve(), A = O(k), M = (t) => {
		var n = pe(), r = E(n, !0);
		S(() => e(r, j(f))), B(t, n);
	}, P = (e) => {
		var t = $();
		B(e, t);
	};
	g(A, (e) => {
		j(f) ? e(M) : j(y).length || e(P, 1);
	});
	var F = _(A, 2);
	s(F, 17, () => j(y), (e) => e.title, (n, r) => {
		var i = _e(), l = O(i), u = E(l, !0), d = _(l, 2);
		s(d, 21, () => j(r).items, (e) => e.id, (n, r) => {
			var i = ge(), l = N(i), u = N(l);
			K(u);
			var d = _(u, 2);
			let f;
			var p = _(d, 1, !0), m = _(p), v = (e) => {
				var t = me();
				B(e, t);
			};
			g(m, (e) => {
				j(r).writable || e(v);
			}), a(l);
			var y = _(l, 2), b = E(y, !0), T = _(y, 2);
			s(T, 20, () => c, (e) => e, (e, n) => {
				var i = he();
				let a;
				S((e) => {
					t(i, "aria-checked", e), t(i, "aria-label", n), a = o(i, "", a, { "--c": n });
				}, [() => C(j(r)) === n]), z("click", i, () => D(j(r), n)), B(e, i);
			}), a(T), a(i), S((n, i) => {
				h(u, n), f = o(d, "", f, { "--c": i }), e(p, j(r).name), e(b, j(r).id), t(T, "aria-label", `Colour of ${j(r).name ?? ""}`);
			}, [() => x(j(r)), () => C(j(r))]), z("change", u, () => w(j(r))), B(n, i);
		}), a(d), S(() => e(u, j(r).title)), B(n, i);
	}), B(r, k), n();
}
F(["change", "click"]);
// ui/src/lib/local-day.ts
var xe = (e = /* @__PURE__ */ new Date()) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
// plugins/stable/dav/ui/src/main.ts
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
		run: () => typeof e.openDialog == "function" ? void e.openDialog(v, {
			title: "New event",
			width: 640,
			height: 560
		}) : r({ create: !0 })
	}), window.addEventListener("atlas-calendar:new", (t) => {
		let { ack: n, ...i } = t.detail ?? {};
		n && window.dispatchEvent(new CustomEvent("atlas-calendar:heard")), typeof e.openDialog == "function" ? e.openDialog(y(i), {
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
			if (!n()) e.toast("Calendar", "Add a calendar account first.", "error"), e.plugin.openSettings();
			else {
				e.toast("Calendar", "Looking for important notes…");
				try {
					let t = await w(e, "sync", {}, 300), n = (t.events ?? []).filter((e) => e.outcome === "failed").map((e) => `${e.title}: ${e.why}`);
					e.toast("Calendar", [t.summary, ...n.slice(0, 3)].join("\n"), n.length ? "error" : void 0);
				} catch (t) {
					e.toast("Calendar", t.message, "error");
				}
			}
		}
	}), e.registerCommand({
		id: "calendars",
		title: "Calendar: test the accounts",
		run: async () => {
			try {
				await w(e, "refresh", { force: !0 }, 300);
				let t = await w(e, "calendars");
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
			if (!n) e.plugin.openSettings();
			else try {
				let t = await w(e, "test_account", { record: n }, 60);
				e.toast(String(n.name ?? "Account"), t.text, t.ok ? "success" : "error"), t.ok && w(e, "refresh", { force: !0 }, 300).catch(() => {});
			} catch (t) {
				e.toast("Calendar", t.message, "error");
			}
		}
	}), e.registerCommand({
		id: "sync-now",
		title: "Calendar: sync now",
		run: async () => {
			try {
				let t = await w(e, "refresh", { force: !0 }, 300);
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
			if (!n) e.plugin.openSettings();
			else try {
				let t = await w(e, "test_subscription", { record: n }, 60);
				e.toast("Subscription", t.summary, "success"), w(e, "refresh", { force: !0 }, 120).catch(() => {});
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
	let a = (t) => {
		let n = /* @__PURE__ */ new Date();
		e.pick({
			placeholder: "Link to which event? (type to filter)",
			tag: "Link to event",
			icon: "calendar",
			items: async () => {
				let t = await w(e, "range", {
					from: l(x(n, -14)),
					to: l(x(n, 60))
				}, 60), r = (e) => Math.abs(new Date(e.start.length === 10 ? `${e.start}T12:00` : e.start).getTime() - n.getTime());
				return t.events.filter((e) => e.calendar !== "notes").sort((e, t) => r(e) - r(t)).slice(0, 200).map((t) => ({
					value: JSON.stringify({
						uid: t.uid,
						rid: t.rid,
						start: t.start
					}),
					title: t.summary || "(no title)",
					detail: `${i(t, D(e.plugin.settings.time_format))} · ${t.calendar_name}`
				}));
			},
			onpick: async (n) => {
				try {
					let r = await w(e, "link_event", {
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
	}, s = null, c = async () => {
		if (s && Date.now() - s.at < 6e4) return s.events;
		let t = /* @__PURE__ */ new Date(), n = await w(e, "range", {
			from: l(x(t, -30)),
			to: l(x(t, 60))
		}, 30);
		return s = {
			at: Date.now(),
			events: n.events.filter((e) => e.uid && !e.task && e.calendar !== "notes")
		}, s.events;
	}, u = /\[\[([^\]\n|#]{2,})$/;
	e.editor.registerCompletion({
		where: "note",
		trigger: u,
		async complete({ before: t }) {
			if (!n()) return null;
			let r = u.exec(t)?.[1].trim().toLowerCase() ?? "";
			if (r.length < 2) return null;
			let a = Date.now(), o = (e) => Math.abs(new Date(e.start.length === 10 ? `${e.start}T12:00` : e.start).getTime() - a);
			return (await c().catch(() => [])).filter((e) => (e.summary ?? "").toLowerCase().includes(r)).sort((e, t) => o(e) - o(t)).slice(0, 5).map((t) => ({
				label: t.summary,
				kind: "event",
				detail: `event · ${i(t, D(e.plugin.settings.time_format))}`,
				apply(n, r, i) {
					let a = n.state.sliceDoc(r, i);
					w(e, "event_note", {
						uid: t.uid,
						rid: t.rid,
						start: t.start
					}, 60).then((e) => {
						if (n.state.sliceDoc(r, i) !== a) return;
						let t = n.state.sliceDoc(i, i + 2) === "]]" ? "" : "]]", o = `[[${e.note.replace(/\.md$/, "").split("/").pop()}${t}`;
						n.dispatch({
							changes: {
								from: r,
								to: i,
								insert: o
							},
							selection: { anchor: r + o.length + (t ? 0 : 2) }
						});
					}, (t) => e.toast("No event note", t.message, "error"));
				}
			}));
		}
	}), e.registerCommand({
		id: "link",
		title: "Calendar: link this note to an event…",
		run: () => {
			let t = o();
			t ? a(t) : e.toast("Calendar", "Open the note to link first.", "error");
		}
	}), window.addEventListener("atlas-calendar:link", (e) => {
		let { link: t, ack: n } = e.detail ?? {};
		n && window.dispatchEvent(new CustomEvent("atlas-calendar:heard")), t && a(t);
	}), (e.version ?? 0) >= 35 && e.shell.menu?.("task", (e) => {
		if (!e.path || !e.line || e.done || !e.selection) return [];
		let t = e.selection.replace(/\s+\^[\w-]+\s*$/, "");
		return [{
			label: "Time-block…",
			icon: "calendar",
			hint: "Pick the slot on the calendar's hours",
			run: () => r({
				view: "week",
				place: {
					path: e.path,
					line: e.line,
					title: t,
					date: "",
					done: !1,
					props: { from: "task" }
				}
			})
		}];
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
		let i = d(fe, {
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
		return () => C(i);
	}, { title: "Calendar: the event of this note" }), e.registerBlock("dav.upcoming", (t, n) => {
		let i = d(Y, {
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
		return () => C(i);
	}, {
		title: "Calendar: upcoming",
		options: [{
			key: "days",
			label: "Days",
			kind: "number"
		}]
	}), e.plugin.settings.url && e.plugin.settings.user && !t().length && (async () => {
		let t = await w(e, "migrate", {}, 60);
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
	let f = e.plugin.registerSettingsSection?.({
		id: "calendars",
		title: "Calendars",
		hint: "Which calendars the pane shows, and their colours.",
		place: "before",
		mount(e, t) {
			let n = d(be, {
				target: e,
				props: { ctx: t }
			});
			return () => C(n);
		}
	}), p = setTimeout(() => {
		w(e, "watch", {}, 60).catch(() => {});
	}, 5e3);
	return () => {
		clearTimeout(p), f?.();
	};
}
export { Se as register };
