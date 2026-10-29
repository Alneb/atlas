import { $ as e, A as t, C as n, F as r, G as i, H as a, K as o, L as s, R as c, S as l, U as u, V as d, W as f, X as p, Z as m, _ as h, at as g, c as _, ct as v, et as y, f as b, ft as x, h as S, ht as C, i as w, it as T, j as E, k as D, l as O, lt as k, o as A, ot as j, pt as M, q as N, r as P, rt as F, st as I, u as L, ut as R, y as z } from "./ui-lib/layout.js";
//#region plugins/stable/dav/ui/src/Upcoming.svelte
var B = N("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Settings…</button></div></div>"), V = N("<div class=\"atlas-empty\">Reading the calendar…</div>"), H = N("<div class=\"atlas-empty\">Nothing.</div>"), U = N("<button class=\"ev svelte-10ncuqf\"><span class=\"bar svelte-10ncuqf\" aria-hidden=\"true\"></span> <span class=\"t svelte-10ncuqf\"> </span> <span class=\"s svelte-10ncuqf\"> </span></button>"), ee = N("<button class=\"more svelte-10ncuqf\"> </button>"), te = N("<section class=\"svelte-10ncuqf\"><button class=\"day svelte-10ncuqf\"> </button> <!> <!> <!></section>"), ne = N("<div class=\"up svelte-10ncuqf\"><!></div>"), re = {
	hash: "svelte-10ncuqf",
	code: ".up.svelte-10ncuqf {display:grid;gap:8px;container-type:inline-size;}section.svelte-10ncuqf {display:grid;gap:1px;}.day.svelte-10ncuqf {all:unset;cursor:pointer;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;padding:2px 0;}.day.svelte-10ncuqf:hover {color:var(--text);}.ev.svelte-10ncuqf, .more.svelte-10ncuqf {all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:var(--radius-sm);min-width:0;}.ev.svelte-10ncuqf:hover, .more.svelte-10ncuqf:hover {background:var(--bg-hover);}.ev.svelte-10ncuqf:focus-visible, .day.svelte-10ncuqf:focus-visible, .more.svelte-10ncuqf:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.bar.svelte-10ncuqf {width:3px;align-self:stretch;border-radius:2px;background:var(--c);flex:none;}.t.svelte-10ncuqf {width:4.6em;flex:none;color:var(--text-muted);font-variant-numeric:tabular-nums;font-size:0.9em;}.s.svelte-10ncuqf {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.more.svelte-10ncuqf {color:var(--text-muted);font-size:0.85em;}"
};
function W(a, f) {
	M(f, !0), s(a, re);
	let p = k(I([])), E = k(""), D = k(!1), N = Math.max(1, Math.min(31, Number(f.options.days ?? 7) || 7)), L = h(/* @__PURE__ */ new Date()), W = R(() => O(f.atlas.plugin.settings.time_format));
	async function G() {
		try {
			let e = await A(f.atlas, "range", {
				from: l(L),
				to: l(w(L, N - 1)),
				notes: f.atlas.plugin.settings.show_notes !== !1
			}, 30);
			v(p, e.events, !0), v(E, "");
		} catch (e) {
			v(E, e.message, !0);
		}
		v(D, !0);
	}
	n(() => (G(), A(f.atlas, "watch", {}, 30).then(G, () => {}), f.atlas.helper.on("changed", () => void G())));
	let K = R(() => Array.from({ length: N }, (e, t) => w(L, t)).map((t) => ({
		d: t,
		evs: P(e(p), t).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || _(e).getTime() - _(t).getTime())
	})).filter((e, t) => t < 2 || e.evs.length)), q = (e) => S(e, L) ? "Today" : S(e, w(L, 1)) ? "Tomorrow" : e.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "short"
	});
	function J(e, t) {
		let n = e ? b(e) : null;
		n ? f.atlas.open(n) : f.onopen(l(t));
	}
	var Y = ne(), X = F(Y), Z = (t) => {
		var n = B(), r = F(n, !0), a = j(r), o = g(a);
		C(n), y(() => u(r, e(E))), m("click", o, () => f.atlas.plugin.openSettings()), i(t, n);
	}, Q = (e) => {
		var t = V();
		i(e, t);
	}, $ = (n) => {
		var a = o(), s = T(a);
		c(s, 17, () => e(K), (e) => e.d.getTime(), (n, a) => {
			var o = te(), s = F(o), l = g(s, !0), f = j(s, 2), p = (e) => {
				var t = H();
				i(e, t);
			};
			d(f, (t) => {
				e(a).evs.length || t(p);
			});
			var h = j(f, 2);
			c(h, 17, () => e(a).evs.slice(0, 6), (e) => e.calendar + e.uid + (e.rid ?? ""), (n, o) => {
				var s = U();
				let c;
				var l = j(F(s), 2), d = g(l, !0), f = j(l, 2), p = g(f, !0);
				C(s), y((n) => {
					t(s, "title", e(o).calendar_name), c = r(s, "", c, { "--c": e(o).color ?? "var(--accent)" }), u(d, n), u(p, e(o).summary || "(no title)");
				}, [() => e(o).all_day ? "all day" : z(_(e(o)), e(W))]), m("click", s, () => J(e(o), e(a).d)), i(n, s);
			});
			var v = j(h, 2), b = (t) => {
				var n = ee(), r = g(n);
				y(() => u(r, `+${e(a).evs.length - 6} more`)), m("click", n, () => J(null, e(a).d)), i(t, n);
			};
			d(v, (t) => {
				e(a).evs.length > 6 && t(b);
			}), C(o), y((e) => u(l, e), [() => q(e(a).d)]), m("click", s, () => J(null, e(a).d)), i(n, o);
		}), i(n, a);
	};
	d(X, (t) => {
		e(E) ? t(Z) : e(D) ? t($, -1) : t(Q, 1);
	}), C(Y), i(a, Y), x();
}
p(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/CalendarsSection.svelte
var G = N("<p class=\"none svelte-1ajrurb\"> </p>"), K = N("<p class=\"none svelte-1ajrurb\">No calendar yet: add an account above, then they show here.</p>"), q = N("<span class=\"ro svelte-1ajrurb\">· read-only</span>"), J = N("<button class=\"pc svelte-1ajrurb\" role=\"radio\"></button>"), Y = N("<li class=\"svelte-1ajrurb\"><label class=\"svelte-1ajrurb\"><input type=\"checkbox\"/> <span class=\"sq svelte-1ajrurb\"></span> <!></label> <code class=\"svelte-1ajrurb\"> </code> <span class=\"pal svelte-1ajrurb\" role=\"radiogroup\"></span></li>"), X = N("<h4 class=\"svelte-1ajrurb\"> </h4> <ul class=\"svelte-1ajrurb\"></ul>", 1), Z = N("<!> <!>", 1), Q = {
	hash: "svelte-1ajrurb",
	code: "h4.svelte-1ajrurb {margin:10px 0 4px;font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}ul.svelte-1ajrurb {list-style:none;margin:0;padding:0;display:grid;gap:4px;}li.svelte-1ajrurb {display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;}label.svelte-1ajrurb {display:flex;align-items:center;gap:8px;flex:1 1 12em;min-width:0;color:var(--text);}.sq.svelte-1ajrurb {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}.ro.svelte-1ajrurb {color:var(--text-faint);}code.svelte-1ajrurb {color:var(--text-faint);font-size:0.8em;}.pal.svelte-1ajrurb {display:flex;gap:4px;}.pc.svelte-1ajrurb {all:unset;cursor:pointer;width:16px;height:16px;border-radius:50%;background:var(--c);}.pc[aria-checked=\"true\"].svelte-1ajrurb {box-shadow:0 0 0 2px var(--bg-elev, var(--bg)), 0 0 0 4px var(--c);}.pc.svelte-1ajrurb:focus-visible {outline:2px solid var(--accent);outline-offset:2px;}.none.svelte-1ajrurb {color:var(--text-faint);margin:4px 0;}"
};
function $(a, o) {
	M(o, !0), s(a, Q);
	let l = [
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
	], f = k(I([])), p = k(I([])), h = k(""), _ = k(I([])), b = k(I({}));
	function S() {
		let e = o.ctx.settings();
		v(_, (e.hidden ?? []).slice(), !0), v(b, Object.fromEntries((e.colors ?? []).flatMap((e) => {
			let t = e.lastIndexOf(":");
			return t > 0 ? [[e.slice(0, t).trim(), e.slice(t + 1).trim()]] : [];
		})), !0);
	}
	n(() => {
		S(), o.ctx.call("sources", {}, 30).then((e) => {
			let t = e;
			v(f, t.sources, !0), v(p, t.accounts ?? [], !0);
		}, (e) => v(h, String(e?.message ?? e), !0));
	});
	let w = R(() => [...e(p).map((t) => ({
		title: t.name,
		items: e(f).filter((e) => e.account === t.name)
	})), {
		title: "Subscriptions",
		items: e(f).filter((e) => e.kind === "ics")
	}].filter((e) => e.items.length)), O = (t) => !e(_).includes(t.id) && !e(_).includes(t.name), A = (t) => e(b)[t.id] ?? e(b)[t.name] ?? t.shown_color ?? t.color ?? L(t.id);
	function N(t) {
		v(_, O(t) ? [...e(_), t.id] : e(_).filter((e) => e !== t.id && e !== t.name), !0), o.ctx.save({ hidden: e(_) });
	}
	function P(t, n) {
		let r = Object.fromEntries(Object.entries(e(b)).filter(([e]) => e !== t.name));
		v(b, {
			...r,
			[t.id]: n
		}, !0), o.ctx.save({ colors: Object.entries(e(b)).map(([e, t]) => `${e}: ${t}`) });
	}
	var z = Z(), B = T(z), V = (t) => {
		var n = G(), r = g(n, !0);
		y(() => u(r, e(h))), i(t, n);
	}, H = (e) => {
		var t = K();
		i(e, t);
	};
	d(B, (t) => {
		e(h) ? t(V) : e(w).length || t(H, 1);
	});
	var U = j(B, 2);
	c(U, 17, () => e(w), (e) => e.title, (n, a) => {
		var o = X(), s = T(o), f = g(s, !0), p = j(s, 2);
		c(p, 21, () => e(a).items, (e) => e.id, (n, a) => {
			var o = Y(), s = F(o), f = F(s);
			D(f);
			var p = j(f, 2);
			let h;
			var _ = j(p, 1, !0), v = j(_), b = (e) => {
				var t = q();
				i(e, t);
			};
			d(v, (t) => {
				e(a).writable || t(b);
			}), C(s);
			var x = j(s, 2), S = g(x, !0), w = j(x, 2);
			c(w, 20, () => l, (e) => e, (n, o) => {
				var s = J();
				let c;
				y((e) => {
					t(s, "aria-checked", e), t(s, "aria-label", o), c = r(s, "", c, { "--c": o });
				}, [() => A(e(a)) === o]), m("click", s, () => P(e(a), o)), i(n, s);
			}), C(w), C(o), y((n, i) => {
				E(f, n), h = r(p, "", h, { "--c": i }), u(_, e(a).name), u(S, e(a).id), t(w, "aria-label", `Colour of ${e(a).name ?? ""}`);
			}, [() => O(e(a)), () => A(e(a))]), m("change", f, () => N(e(a))), i(n, o);
		}), C(p), y(() => u(f, e(a).title)), i(n, o);
	}), i(a, z), x();
}
p(["change", "click"]);
//#endregion
//#region plugins/stable/dav/ui/src/main.ts
function ie(e) {
	let t = () => e.plugin.settings.accounts ?? [], n = () => t().some((e) => e.name && e.url && e.user) || !!(e.plugin.settings.url && e.plugin.settings.user), r = (t = {}) => {
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
			date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
			view: "day"
		})
	}), e.registerCommand({
		id: "new",
		title: "Calendar: new event",
		run: () => r({ create: !0 })
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
				let t = await A(e, "sync", {}, 300), n = (t.events ?? []).filter((e) => e.outcome === "failed").map((e) => `${e.title}: ${e.why}`);
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
				await A(e, "refresh", { force: !0 }, 300);
				let t = await A(e, "calendars");
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
				let t = await A(e, "test_account", { record: n }, 60);
				e.toast(String(n.name ?? "Account"), t.text, t.ok ? "success" : "error"), t.ok && A(e, "refresh", { force: !0 }, 300).catch(() => {});
			} catch (t) {
				e.toast("Calendar", t.message, "error");
			}
		}
	}), e.registerCommand({
		id: "sync-now",
		title: "Calendar: sync now",
		run: async () => {
			try {
				let t = await A(e, "refresh", { force: !0 }, 300);
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
				let t = await A(e, "test_subscription", { record: n }, 60);
				e.toast("Subscription", t.summary, "success"), A(e, "refresh", { force: !0 }, 120).catch(() => {});
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
	}), e.registerBlock("dav.upcoming", (t, n) => {
		let i = a(W, {
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
		return () => f(i);
	}, {
		title: "Calendar: upcoming",
		options: [{
			key: "days",
			label: "Days",
			kind: "number"
		}]
	}), e.plugin.settings.url && e.plugin.settings.user && !t().length && (async () => {
		let t = await A(e, "migrate", {}, 60);
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
	let i = e.plugin.registerSettingsSection?.({
		id: "calendars",
		title: "Calendars",
		hint: "Which calendars the pane shows, and their colours.",
		place: "before",
		mount(e, t) {
			let n = a($, {
				target: e,
				props: { ctx: t }
			});
			return () => f(n);
		}
	}), o = setTimeout(() => {
		A(e, "watch", {}, 60).catch(() => {});
	}, 5e3);
	return () => {
		clearTimeout(o), i?.();
	};
}
//#endregion
export { ie as register };
