import { A as e, C as t, G as n, H as r, I as i, J as a, K as o, M as s, Q as c, R as l, U as u, W as d, Z as f, _t as p, a as m, at as h, b as g, ct as _, d as v, dt as y, et as b, ft as x, g as S, ht as C, i as w, j as T, l as E, lt as D, mt as O, nt as k, ot as A, p as j, q as M, r as N, s as P, st as F, u as I, ut as L, v as R, w as z, z as B } from "./ui-lib/layout.js";
//#region plugins/stable/dav/ui/src/Upcoming.svelte
var V = a("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Settings…</button></div></div>"), H = a("<div class=\"atlas-empty\">Reading the calendar…</div>"), U = a("<div class=\"atlas-empty\">Nothing.</div>"), W = a("<button class=\"ev svelte-10ncuqf\"><span class=\"bar svelte-10ncuqf\" aria-hidden=\"true\"></span> <span class=\"t svelte-10ncuqf\"> </span> <span class=\"s svelte-10ncuqf\"> </span></button>"), ee = a("<button class=\"more svelte-10ncuqf\"> </button>"), te = a("<section class=\"svelte-10ncuqf\"><button class=\"day svelte-10ncuqf\"> </button> <!> <!> <!></section>"), ne = a("<div class=\"up svelte-10ncuqf\"><!></div>"), re = {
	hash: "svelte-10ncuqf",
	code: ".up.svelte-10ncuqf {display:grid;gap:8px;container-type:inline-size;}section.svelte-10ncuqf {display:grid;gap:1px;}.day.svelte-10ncuqf {all:unset;cursor:pointer;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;padding:2px 0;}.day.svelte-10ncuqf:hover {color:var(--text);}.ev.svelte-10ncuqf, .more.svelte-10ncuqf {all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:var(--radius-sm);min-width:0;}.ev.svelte-10ncuqf:hover, .more.svelte-10ncuqf:hover {background:var(--bg-hover);}.ev.svelte-10ncuqf:focus-visible, .day.svelte-10ncuqf:focus-visible, .more.svelte-10ncuqf:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.bar.svelte-10ncuqf {width:3px;align-self:stretch;border-radius:2px;background:var(--c);flex:none;}.t.svelte-10ncuqf {width:4.6em;flex:none;color:var(--text-muted);font-variant-numeric:tabular-nums;font-size:0.9em;}.s.svelte-10ncuqf {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.more.svelte-10ncuqf {color:var(--text-muted);font-size:0.85em;}"
};
function G(e, n) {
	C(n, !0), l(e, re);
	let a = y(D([])), s = y(""), u = y(!1), f = Math.max(1, Math.min(31, Number(n.options.days ?? 7) || 7)), v = R(/* @__PURE__ */ new Date()), w = x(() => I(n.atlas.plugin.settings.time_format));
	async function G() {
		try {
			let e = await P(n.atlas, "range", {
				from: t(v),
				to: t(m(v, f - 1)),
				notes: n.atlas.plugin.settings.show_notes !== !1
			}, 30);
			L(a, e.events, !0), L(s, "");
		} catch (e) {
			L(s, e.message, !0);
		}
		L(u, !0);
	}
	z(() => (G(), P(n.atlas, "watch", {}, 30).then(G, () => {}), n.atlas.helper.on("changed", () => void G())));
	let K = x(() => Array.from({ length: f }, (e, t) => m(v, t)).map((e) => ({
		d: e,
		evs: N(b(a), e).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || E(e).getTime() - E(t).getTime())
	})).filter((e, t) => t < 2 || e.evs.length)), q = (e) => S(e, v) ? "Today" : S(e, m(v, 1)) ? "Tomorrow" : e.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "short"
	});
	function J(e, r) {
		let i = e ? j(e) : null;
		i ? n.atlas.open(i) : n.onopen(t(r));
	}
	var Y = ne(), X = h(Y), Z = (e) => {
		var t = V(), r = h(t, !0), i = _(r), a = F(i);
		p(t), k(() => d(r, b(s))), c("click", a, () => n.atlas.plugin.openSettings()), o(e, t);
	}, Q = (e) => {
		var t = H();
		o(e, t);
	}, $ = (e) => {
		var t = M(), n = A(t);
		B(n, 17, () => b(K), (e) => e.d.getTime(), (e, t) => {
			var n = te(), a = h(n), s = F(a, !0), l = _(a, 2), u = (e) => {
				var t = U();
				o(e, t);
			};
			r(l, (e) => {
				b(t).evs.length || e(u);
			});
			var f = _(l, 2);
			B(f, 17, () => b(t).evs.slice(0, 6), (e) => e.calendar + e.uid + (e.rid ?? ""), (e, n) => {
				var r = W();
				let a;
				var s = _(h(r), 2), l = F(s, !0), u = _(s, 2), f = F(u, !0);
				p(r), k((e) => {
					T(r, "title", b(n).calendar_name), a = i(r, "", a, { "--c": b(n).color ?? "var(--accent)" }), d(l, e), d(f, b(n).summary || "(no title)");
				}, [() => b(n).all_day ? "all day" : g(E(b(n)), b(w))]), c("click", r, () => J(b(n), b(t).d)), o(e, r);
			});
			var m = _(f, 2), v = (e) => {
				var n = ee(), r = F(n);
				k(() => d(r, `+${b(t).evs.length - 6} more`)), c("click", n, () => J(null, b(t).d)), o(e, n);
			};
			r(m, (e) => {
				b(t).evs.length > 6 && e(v);
			}), p(n), k((e) => d(s, e), [() => q(b(t).d)]), c("click", a, () => J(null, b(t).d)), o(e, n);
		}), o(e, t);
	};
	r(X, (e) => {
		b(s) ? e(Z) : b(u) ? e($, -1) : e(Q, 1);
	}), p(Y), o(e, Y), O();
}
f(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/CalendarsSection.svelte
var K = a("<p class=\"none svelte-1ajrurb\"> </p>"), q = a("<p class=\"none svelte-1ajrurb\">No calendar yet: add an account above, then they show here.</p>"), J = a("<span class=\"ro svelte-1ajrurb\">· read-only</span>"), Y = a("<button class=\"pc svelte-1ajrurb\" role=\"radio\"></button>"), X = a("<li class=\"svelte-1ajrurb\"><label class=\"svelte-1ajrurb\"><input type=\"checkbox\"/> <span class=\"sq svelte-1ajrurb\"></span> <!></label> <code class=\"svelte-1ajrurb\"> </code> <span class=\"pal svelte-1ajrurb\" role=\"radiogroup\"></span></li>"), Z = a("<h4 class=\"svelte-1ajrurb\"> </h4> <ul class=\"svelte-1ajrurb\"></ul>", 1), Q = a("<!> <!>", 1), $ = {
	hash: "svelte-1ajrurb",
	code: "h4.svelte-1ajrurb {margin:10px 0 4px;font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}ul.svelte-1ajrurb {list-style:none;margin:0;padding:0;display:grid;gap:4px;}li.svelte-1ajrurb {display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;}label.svelte-1ajrurb {display:flex;align-items:center;gap:8px;flex:1 1 12em;min-width:0;color:var(--text);}.sq.svelte-1ajrurb {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}.ro.svelte-1ajrurb {color:var(--text-faint);}code.svelte-1ajrurb {color:var(--text-faint);font-size:0.8em;}.pal.svelte-1ajrurb {display:flex;gap:4px;}.pc.svelte-1ajrurb {all:unset;cursor:pointer;width:16px;height:16px;border-radius:50%;background:var(--c);}.pc[aria-checked=\"true\"].svelte-1ajrurb {box-shadow:0 0 0 2px var(--bg-elev, var(--bg)), 0 0 0 4px var(--c);}.pc.svelte-1ajrurb:focus-visible {outline:2px solid var(--accent);outline-offset:2px;}.none.svelte-1ajrurb {color:var(--text-faint);margin:4px 0;}"
};
function ie(t, n) {
	C(n, !0), l(t, $);
	let a = [
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
	], u = y(D([])), f = y(D([])), m = y(""), g = y(D([])), S = y(D({}));
	function w() {
		let e = n.ctx.settings();
		L(g, (e.hidden ?? []).slice(), !0), L(S, Object.fromEntries((e.colors ?? []).flatMap((e) => {
			let t = e.lastIndexOf(":");
			return t > 0 ? [[e.slice(0, t).trim(), e.slice(t + 1).trim()]] : [];
		})), !0);
	}
	z(() => {
		w(), n.ctx.call("sources", {}, 30).then((e) => {
			let t = e;
			L(u, t.sources, !0), L(f, t.accounts ?? [], !0);
		}, (e) => L(m, String(e?.message ?? e), !0));
	});
	let E = x(() => [...b(f).map((e) => ({
		title: e.name,
		items: b(u).filter((t) => t.account === e.name)
	})), {
		title: "Subscriptions",
		items: b(u).filter((e) => e.kind === "ics")
	}].filter((e) => e.items.length)), j = (e) => !b(g).includes(e.id) && !b(g).includes(e.name), M = (e) => b(S)[e.id] ?? b(S)[e.name] ?? e.shown_color ?? e.color ?? v(e.id);
	function N(e) {
		L(g, j(e) ? [...b(g), e.id] : b(g).filter((t) => t !== e.id && t !== e.name), !0), n.ctx.save({ hidden: b(g) });
	}
	function P(e, t) {
		let r = Object.fromEntries(Object.entries(b(S)).filter(([t]) => t !== e.name));
		L(S, {
			...r,
			[e.id]: t
		}, !0), n.ctx.save({ colors: Object.entries(b(S)).map(([e, t]) => `${e}: ${t}`) });
	}
	var I = Q(), R = A(I), V = (e) => {
		var t = K(), n = F(t, !0);
		k(() => d(n, b(m))), o(e, t);
	}, H = (e) => {
		var t = q();
		o(e, t);
	};
	r(R, (e) => {
		b(m) ? e(V) : b(E).length || e(H, 1);
	});
	var U = _(R, 2);
	B(U, 17, () => b(E), (e) => e.title, (t, n) => {
		var l = Z(), u = A(l), f = F(u, !0), m = _(u, 2);
		B(m, 21, () => b(n).items, (e) => e.id, (t, n) => {
			var l = X(), u = h(l), f = h(u);
			e(f);
			var m = _(f, 2);
			let g;
			var v = _(m, 1, !0), y = _(v), x = (e) => {
				var t = J();
				o(e, t);
			};
			r(y, (e) => {
				b(n).writable || e(x);
			}), p(u);
			var S = _(u, 2), C = F(S, !0), w = _(S, 2);
			B(w, 20, () => a, (e) => e, (e, t) => {
				var r = Y();
				let a;
				k((e) => {
					T(r, "aria-checked", e), T(r, "aria-label", t), a = i(r, "", a, { "--c": t });
				}, [() => M(b(n)) === t]), c("click", r, () => P(b(n), t)), o(e, r);
			}), p(w), p(l), k((e, t) => {
				s(f, e), g = i(m, "", g, { "--c": t }), d(v, b(n).name), d(C, b(n).id), T(w, "aria-label", `Colour of ${b(n).name ?? ""}`);
			}, [() => j(b(n)), () => M(b(n))]), c("change", f, () => N(b(n))), o(t, l);
		}), p(m), k(() => d(f, b(n).title)), o(t, l);
	}), o(t, I), O();
}
f(["change", "click"]);
//#endregion
//#region plugins/stable/dav/ui/src/main.ts
function ae(e) {
	let t = () => e.plugin.settings.accounts ?? [], r = () => t().some((e) => e.name && e.url && e.user) || !!(e.plugin.settings.url && e.plugin.settings.user), i = (t = {}) => {
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
		run: () => i()
	}), e.registerCommand({
		id: "today",
		title: "Calendar: today",
		run: () => i({
			date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
			view: "day"
		})
	}), e.registerCommand({
		id: "new",
		title: "Calendar: new event",
		run: () => typeof e.openDialog == "function" ? void e.openDialog(w, {
			title: "New event",
			width: 640,
			height: 560
		}) : i({ create: !0 })
	}), e.registerCommand({
		id: "quick",
		title: "Calendar: quick add (in words)…",
		run: () => i({ quick: !0 })
	}), e.registerCommand({
		id: "sync",
		title: "Calendar: put important notes on the server",
		run: async () => {
			if (!r()) {
				e.toast("Calendar", "Add a calendar account first.", "error"), e.plugin.openSettings();
				return;
			}
			e.toast("Calendar", "Looking for important notes…");
			try {
				let t = await P(e, "sync", {}, 300), n = (t.events ?? []).filter((e) => e.outcome === "failed").map((e) => `${e.title}: ${e.why}`);
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
				await P(e, "refresh", { force: !0 }, 300);
				let t = await P(e, "calendars");
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
				let t = await P(e, "test_account", { record: n }, 60);
				e.toast(String(n.name ?? "Account"), t.text, t.ok ? "success" : "error"), t.ok && P(e, "refresh", { force: !0 }, 300).catch(() => {});
			} catch (t) {
				e.toast("Calendar", t.message, "error");
			}
		}
	}), e.registerCommand({
		id: "sync-now",
		title: "Calendar: sync now",
		run: async () => {
			try {
				let t = await P(e, "refresh", { force: !0 }, 300);
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
				let t = await P(e, "test_subscription", { record: n }, 60);
				e.toast("Subscription", t.summary, "success"), P(e, "refresh", { force: !0 }, 120).catch(() => {});
			} catch (t) {
				e.toast("Subscription", t.message, "error");
			}
		}
	}), e.helper.on("added", (t) => {
		let n = t;
		e.toast(n.outcome === "updated" ? "Updated in your calendar" : "Added to your calendar", `${n.title} — ${n.start}`, "info", { run: () => i({
			date: n.start.slice(0, 10),
			view: "day"
		}) });
	}), e.registerBlock("dav.upcoming", (t, r) => {
		let a = u(G, {
			target: t,
			props: {
				atlas: e,
				options: r.options ?? {},
				onopen: (e) => i({
					date: e,
					view: "day"
				})
			}
		});
		return () => n(a);
	}, {
		title: "Calendar: upcoming",
		options: [{
			key: "days",
			label: "Days",
			kind: "number"
		}]
	}), e.plugin.settings.url && e.plugin.settings.user && !t().length && (async () => {
		let t = await P(e, "migrate", {}, 60);
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
	let a = e.plugin.registerSettingsSection?.({
		id: "calendars",
		title: "Calendars",
		hint: "Which calendars the pane shows, and their colours.",
		place: "before",
		mount(e, t) {
			let r = u(ie, {
				target: e,
				props: { ctx: t }
			});
			return () => n(r);
		}
	}), o = setTimeout(() => {
		P(e, "watch", {}, 60).catch(() => {});
	}, 5e3);
	return () => {
		clearTimeout(o), a?.();
	};
}
//#endregion
export { ae as register };
