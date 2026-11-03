import { C as e, D as t, E as n, F as r, G as i, H as a, J as o, K as s, N as c, P as l, V as u, X as d, Y as f, Z as p, _t as m, a as h, at as g, bt as _, ct as v, d as y, dt as b, et as x, ft as S, g as C, ht as w, i as T, l as E, lt as D, m as O, mt as k, pt as A, q as j, r as M, rt as N, s as P, tt as F, u as I, ut as L, vt as R, x as z, y as B, z as V } from "./ui-lib/layout.js";
//#region plugins/stable/dav/ui/src/Upcoming.svelte
var H = p("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Settings…</button></div></div>"), U = p("<div class=\"atlas-empty\">Reading the calendar…</div>"), W = p("<div class=\"atlas-empty\">Nothing.</div>"), G = p("<button class=\"ev svelte-10ncuqf\"><span class=\"bar svelte-10ncuqf\" aria-hidden=\"true\"></span> <span class=\"t svelte-10ncuqf\"> </span> <span class=\"s svelte-10ncuqf\"> </span></button>"), ee = p("<button class=\"more svelte-10ncuqf\"> </button>"), te = p("<section class=\"svelte-10ncuqf\"><button class=\"day svelte-10ncuqf\"> </button> <!> <!> <!></section>"), ne = p("<div class=\"up svelte-10ncuqf\"><!></div>"), re = {
	hash: "svelte-10ncuqf",
	code: ".up.svelte-10ncuqf {display:grid;gap:8px;container-type:inline-size;}section.svelte-10ncuqf {display:grid;gap:1px;}.day.svelte-10ncuqf {all:unset;cursor:pointer;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;padding:2px 0;}.day.svelte-10ncuqf:hover {color:var(--text);}.ev.svelte-10ncuqf, .more.svelte-10ncuqf {all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:var(--radius-sm);min-width:0;}.ev.svelte-10ncuqf:hover, .more.svelte-10ncuqf:hover {background:var(--bg-hover);}.ev.svelte-10ncuqf:focus-visible, .day.svelte-10ncuqf:focus-visible, .more.svelte-10ncuqf:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.bar.svelte-10ncuqf {width:3px;align-self:stretch;border-radius:2px;background:var(--c);flex:none;}.t.svelte-10ncuqf {width:4.6em;flex:none;color:var(--text-muted);font-variant-numeric:tabular-nums;font-size:0.9em;}.s.svelte-10ncuqf {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.more.svelte-10ncuqf {color:var(--text-muted);font-size:0.85em;}"
};
function K(r, o) {
	R(o, !0), u(r, re);
	let s = k(S([])), c = k(""), p = k(!1), y = Math.max(1, Math.min(31, Number(o.options.days ?? 7) || 7)), x = z(/* @__PURE__ */ new Date()), T = w(() => I(o.atlas.plugin.settings.time_format));
	async function O() {
		try {
			let e = await P(o.atlas, "range", {
				from: n(x),
				to: n(h(x, y - 1)),
				notes: o.atlas.plugin.settings.show_notes !== !1
			}, 30);
			A(s, e.events, !0), A(c, "");
		} catch (e) {
			A(c, e.message, !0);
		}
		A(p, !0);
	}
	t(() => {
		O(), P(o.atlas, "watch", {}, 30).then(O, () => {});
		let e, t = o.atlas.helper.on("changed", () => {
			clearTimeout(e), e = setTimeout(() => void O(), 250);
		});
		return () => {
			clearTimeout(e), t();
		};
	});
	let K = w(() => Array.from({ length: y }, (e, t) => h(x, t)).map((e) => ({
		d: e,
		evs: M(N(s), e).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || E(e).getTime() - E(t).getTime())
	})).filter((e, t) => t < 2 || e.evs.length)), q = (e) => B(e, x) ? "Today" : B(e, h(x, 1)) ? "Tomorrow" : e.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "short"
	});
	function J(e, t) {
		let r = e ? C(e) : null;
		r ? o.atlas.open(r) : o.onopen(n(t));
	}
	var Y = ne(), X = v(Y), Z = (e) => {
		var t = H(), n = v(t, !0), r = b(n), i = L(r);
		_(t), g(() => j(n, N(c))), F("click", i, () => o.atlas.plugin.openSettings()), f(e, t);
	}, Q = (e) => {
		var t = U();
		f(e, t);
	}, $ = (t) => {
		var n = d(), r = D(n);
		a(r, 17, () => N(K), (e) => e.d.getTime(), (t, n) => {
			var r = te(), o = v(r), s = L(o, !0), c = b(o, 2), u = (e) => {
				var t = W();
				f(e, t);
			};
			i(c, (e) => {
				N(n).evs.length || e(u);
			});
			var d = b(c, 2);
			a(d, 17, () => N(n).evs.slice(0, 6), (e) => e.calendar + e.uid + (e.rid ?? ""), (t, r) => {
				var i = G();
				let a;
				var o = b(v(i), 2), s = L(o, !0), c = b(o, 2), u = L(c, !0);
				_(i), g((e) => {
					l(i, "title", N(r).calendar_name), a = V(i, "", a, { "--c": N(r).color ?? "var(--accent)" }), j(s, e), j(u, N(r).summary || "(no title)");
				}, [() => N(r).all_day ? "all day" : e(E(N(r)), N(T))]), F("click", i, () => J(N(r), N(n).d)), f(t, i);
			});
			var p = b(d, 2), m = (e) => {
				var t = ee(), r = L(t);
				g(() => j(r, `+${N(n).evs.length - 6} more`)), F("click", t, () => J(null, N(n).d)), f(e, t);
			};
			i(p, (e) => {
				N(n).evs.length > 6 && e(m);
			}), _(r), g((e) => j(s, e), [() => q(N(n).d)]), F("click", o, () => J(null, N(n).d)), f(t, r);
		}), f(t, n);
	};
	i(X, (e) => {
		N(c) ? e(Z) : N(p) ? e($, -1) : e(Q, 1);
	}), _(Y), f(r, Y), m();
}
x(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/CalendarsSection.svelte
var q = p("<p class=\"none svelte-1ajrurb\"> </p>"), J = p("<p class=\"none svelte-1ajrurb\">No calendar yet: add an account above, then they show here.</p>"), Y = p("<span class=\"ro svelte-1ajrurb\">· read-only</span>"), X = p("<button class=\"pc svelte-1ajrurb\" role=\"radio\"></button>"), Z = p("<li class=\"svelte-1ajrurb\"><label class=\"svelte-1ajrurb\"><input type=\"checkbox\"/> <span class=\"sq svelte-1ajrurb\"></span> <!></label> <code class=\"svelte-1ajrurb\"> </code> <span class=\"pal svelte-1ajrurb\" role=\"radiogroup\"></span></li>"), Q = p("<h4 class=\"svelte-1ajrurb\"> </h4> <ul class=\"svelte-1ajrurb\"></ul>", 1), $ = p("<!> <!>", 1), ie = {
	hash: "svelte-1ajrurb",
	code: "h4.svelte-1ajrurb {margin:10px 0 4px;font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}ul.svelte-1ajrurb {list-style:none;margin:0;padding:0;display:grid;gap:4px;}li.svelte-1ajrurb {display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;}label.svelte-1ajrurb {display:flex;align-items:center;gap:8px;flex:1 1 12em;min-width:0;color:var(--text);}.sq.svelte-1ajrurb {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}.ro.svelte-1ajrurb {color:var(--text-faint);}code.svelte-1ajrurb {color:var(--text-faint);font-size:0.8em;}.pal.svelte-1ajrurb {display:flex;gap:4px;}.pc.svelte-1ajrurb {all:unset;cursor:pointer;width:16px;height:16px;border-radius:50%;background:var(--c);}.pc[aria-checked=\"true\"].svelte-1ajrurb {box-shadow:0 0 0 2px var(--bg-elev, var(--bg)), 0 0 0 4px var(--c);}.pc.svelte-1ajrurb:focus-visible {outline:2px solid var(--accent);outline-offset:2px;}.none.svelte-1ajrurb {color:var(--text-faint);margin:4px 0;}"
};
function ae(e, n) {
	R(n, !0), u(e, ie);
	let o = [
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
	], s = k(S([])), d = k(S([])), p = k(""), h = k(S([])), x = k(S({}));
	function C() {
		let e = n.ctx.settings();
		A(h, (e.hidden ?? []).slice(), !0), A(x, Object.fromEntries((e.colors ?? []).flatMap((e) => {
			let t = e.lastIndexOf(":");
			return t > 0 ? [[e.slice(0, t).trim(), e.slice(t + 1).trim()]] : [];
		})), !0);
	}
	t(() => {
		C(), n.ctx.call("sources", {}, 30).then((e) => {
			let t = e;
			A(s, t.sources, !0), A(d, t.accounts ?? [], !0);
		}, (e) => A(p, String(e?.message ?? e), !0));
	});
	let T = w(() => [...N(d).map((e) => ({
		title: e.name,
		items: N(s).filter((t) => t.account === e.name)
	})), {
		title: "Subscriptions",
		items: N(s).filter((e) => e.kind === "ics")
	}].filter((e) => e.items.length)), E = (e) => !N(h).includes(e.id) && !N(h).includes(e.name), O = (e) => N(x)[e.id] ?? N(x)[e.name] ?? e.shown_color ?? e.color ?? y(e.id);
	function M(e) {
		A(h, E(e) ? [...N(h), e.id] : N(h).filter((t) => t !== e.id && t !== e.name), !0), n.ctx.save({ hidden: N(h) });
	}
	function P(e, t) {
		let r = Object.fromEntries(Object.entries(N(x)).filter(([t]) => t !== e.name));
		A(x, {
			...r,
			[e.id]: t
		}, !0), n.ctx.save({ colors: Object.entries(N(x)).map(([e, t]) => `${e}: ${t}`) });
	}
	var I = $(), z = D(I), B = (e) => {
		var t = q(), n = L(t, !0);
		g(() => j(n, N(p))), f(e, t);
	}, H = (e) => {
		var t = J();
		f(e, t);
	};
	i(z, (e) => {
		N(p) ? e(B) : N(T).length || e(H, 1);
	});
	var U = b(z, 2);
	a(U, 17, () => N(T), (e) => e.title, (e, t) => {
		var n = Q(), s = D(n), u = L(s, !0), d = b(s, 2);
		a(d, 21, () => N(t).items, (e) => e.id, (e, t) => {
			var n = Z(), s = v(n), u = v(s);
			c(u);
			var d = b(u, 2);
			let p;
			var m = b(d, 1, !0), h = b(m), y = (e) => {
				var t = Y();
				f(e, t);
			};
			i(h, (e) => {
				N(t).writable || e(y);
			}), _(s);
			var x = b(s, 2), S = L(x, !0), C = b(x, 2);
			a(C, 20, () => o, (e) => e, (e, n) => {
				var r = X();
				let i;
				g((e) => {
					l(r, "aria-checked", e), l(r, "aria-label", n), i = V(r, "", i, { "--c": n });
				}, [() => O(N(t)) === n]), F("click", r, () => P(N(t), n)), f(e, r);
			}), _(C), _(n), g((e, n) => {
				r(u, e), p = V(d, "", p, { "--c": n }), j(m, N(t).name), j(S, N(t).id), l(C, "aria-label", `Colour of ${N(t).name ?? ""}`);
			}, [() => E(N(t)), () => O(N(t))]), F("change", u, () => M(N(t))), f(e, n);
		}), _(d), g(() => j(u, N(t).title)), f(e, n);
	}), f(e, I), m();
}
x(["change", "click"]);
//#endregion
//#region ui/src/lib/local-day.ts
var oe = (e = /* @__PURE__ */ new Date()) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
//#endregion
//#region plugins/stable/dav/ui/src/main.ts
function se(e) {
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
			date: oe(),
			view: "day"
		})
	}), e.registerCommand({
		id: "new",
		title: "Calendar: new event",
		run: () => typeof e.openDialog == "function" ? void e.openDialog(T, {
			title: "New event",
			width: 640,
			height: 560
		}) : r({ create: !0 })
	}), window.addEventListener("atlas-calendar:new", (t) => {
		let { ack: n, ...i } = t.detail ?? {};
		n && window.dispatchEvent(new CustomEvent("atlas-calendar:heard")), typeof e.openDialog == "function" ? e.openDialog(O(i), {
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
		e.toast(n.outcome === "updated" ? "Updated in your calendar" : "Added to your calendar", `${n.title} — ${n.start}`, "info", { run: () => r({
			date: n.start.slice(0, 10),
			view: "day"
		}) });
	}), e.registerBlock("dav.upcoming", (t, n) => {
		let i = s(K, {
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
		return () => o(i);
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
	let i = e.plugin.registerSettingsSection?.({
		id: "calendars",
		title: "Calendars",
		hint: "Which calendars the pane shows, and their colours.",
		place: "before",
		mount(e, t) {
			let n = s(ae, {
				target: e,
				props: { ctx: t }
			});
			return () => o(n);
		}
	}), a = setTimeout(() => {
		P(e, "watch", {}, 60).catch(() => {});
	}, 5e3);
	return () => {
		clearTimeout(a), i?.();
	};
}
//#endregion
export { se as register };
