import { $ as e, B as t, E as n, G as r, J as i, K as a, M as o, N as s, P as c, R as l, S as u, T as d, V as f, W as p, X as m, Y as h, _t as g, a as _, b as v, ct as y, d as b, dt as x, et as S, ft as C, gt as w, h as T, i as E, it as D, l as O, lt as k, mt as A, nt as j, p as M, pt as N, q as P, r as F, s as I, st as L, u as R, ut as z, v as B, yt as V } from "./ui-lib/layout.js";
//#region plugins/stable/dav/ui/src/Upcoming.svelte
var H = m("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Settings…</button></div></div>"), U = m("<div class=\"atlas-empty\">Reading the calendar…</div>"), W = m("<div class=\"atlas-empty\">Nothing.</div>"), G = m("<button class=\"ev svelte-10ncuqf\"><span class=\"bar svelte-10ncuqf\" aria-hidden=\"true\"></span> <span class=\"t svelte-10ncuqf\"> </span> <span class=\"s svelte-10ncuqf\"> </span></button>"), ee = m("<button class=\"more svelte-10ncuqf\"> </button>"), te = m("<section class=\"svelte-10ncuqf\"><button class=\"day svelte-10ncuqf\"> </button> <!> <!> <!></section>"), ne = m("<div class=\"up svelte-10ncuqf\"><!></div>"), re = {
	hash: "svelte-10ncuqf",
	code: ".up.svelte-10ncuqf {display:grid;gap:8px;container-type:inline-size;}section.svelte-10ncuqf {display:grid;gap:1px;}.day.svelte-10ncuqf {all:unset;cursor:pointer;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;padding:2px 0;}.day.svelte-10ncuqf:hover {color:var(--text);}.ev.svelte-10ncuqf, .more.svelte-10ncuqf {all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:var(--radius-sm);min-width:0;}.ev.svelte-10ncuqf:hover, .more.svelte-10ncuqf:hover {background:var(--bg-hover);}.ev.svelte-10ncuqf:focus-visible, .day.svelte-10ncuqf:focus-visible, .more.svelte-10ncuqf:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.bar.svelte-10ncuqf {width:3px;align-self:stretch;border-radius:2px;background:var(--c);flex:none;}.t.svelte-10ncuqf {width:4.6em;flex:none;color:var(--text-muted);font-variant-numeric:tabular-nums;font-size:0.9em;}.s.svelte-10ncuqf {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.more.svelte-10ncuqf {color:var(--text-muted);font-size:0.85em;}"
};
function K(e, r) {
	g(r, !0), t(e, re);
	let o = N(x([])), c = N(""), m = N(!1), b = Math.max(1, Math.min(31, Number(r.options.days ?? 7) || 7)), E = v(/* @__PURE__ */ new Date()), M = A(() => R(r.atlas.plugin.settings.time_format));
	async function P() {
		try {
			let e = await I(r.atlas, "range", {
				from: d(E),
				to: d(_(E, b - 1)),
				notes: r.atlas.plugin.settings.show_notes !== !1
			}, 30);
			C(o, e.events, !0), C(c, "");
		} catch (e) {
			C(c, e.message, !0);
		}
		C(m, !0);
	}
	n(() => {
		P(), I(r.atlas, "watch", {}, 30).then(P, () => {});
		let e, t = r.atlas.helper.on("changed", () => {
			clearTimeout(e), e = setTimeout(() => void P(), 250);
		});
		return () => {
			clearTimeout(e), t();
		};
	});
	let K = A(() => Array.from({ length: b }, (e, t) => _(E, t)).map((e) => ({
		d: e,
		evs: F(j(o), e).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || O(e).getTime() - O(t).getTime())
	})).filter((e, t) => t < 2 || e.evs.length)), q = (e) => B(e, E) ? "Today" : B(e, _(E, 1)) ? "Tomorrow" : e.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "short"
	});
	function J(e, t) {
		let n = e ? T(e) : null;
		n ? r.atlas.open(n) : r.onopen(d(t));
	}
	var Y = ne(), X = L(Y), Z = (e) => {
		var t = H(), n = L(t, !0), o = z(n), s = k(o);
		V(t), D(() => a(n, j(c))), S("click", s, () => r.atlas.plugin.openSettings()), i(e, t);
	}, Q = (e) => {
		var t = U();
		i(e, t);
	}, $ = (e) => {
		var t = h(), n = y(t);
		f(n, 17, () => j(K), (e) => e.d.getTime(), (e, t) => {
			var n = te(), r = L(n), o = k(r, !0), c = z(r, 2), d = (e) => {
				var t = W();
				i(e, t);
			};
			p(c, (e) => {
				j(t).evs.length || e(d);
			});
			var m = z(c, 2);
			f(m, 17, () => j(t).evs.slice(0, 6), (e) => e.calendar + e.uid + (e.rid ?? ""), (e, n) => {
				var r = G();
				let o;
				var c = z(L(r), 2), d = k(c, !0), f = z(c, 2), p = k(f, !0);
				V(r), D((e) => {
					s(r, "title", j(n).calendar_name), o = l(r, "", o, { "--c": j(n).color ?? "var(--accent)" }), a(d, e), a(p, j(n).summary || "(no title)");
				}, [() => j(n).all_day ? "all day" : u(O(j(n)), j(M))]), S("click", r, () => J(j(n), j(t).d)), i(e, r);
			});
			var h = z(m, 2), g = (e) => {
				var n = ee(), r = k(n);
				D(() => a(r, `+${j(t).evs.length - 6} more`)), S("click", n, () => J(null, j(t).d)), i(e, n);
			};
			p(h, (e) => {
				j(t).evs.length > 6 && e(g);
			}), V(n), D((e) => a(o, e), [() => q(j(t).d)]), S("click", r, () => J(null, j(t).d)), i(e, n);
		}), i(e, t);
	};
	p(X, (e) => {
		j(c) ? e(Z) : j(m) ? e($, -1) : e(Q, 1);
	}), V(Y), i(e, Y), w();
}
e(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/CalendarsSection.svelte
var q = m("<p class=\"none svelte-1ajrurb\"> </p>"), J = m("<p class=\"none svelte-1ajrurb\">No calendar yet: add an account above, then they show here.</p>"), Y = m("<span class=\"ro svelte-1ajrurb\">· read-only</span>"), X = m("<button class=\"pc svelte-1ajrurb\" role=\"radio\"></button>"), Z = m("<li class=\"svelte-1ajrurb\"><label class=\"svelte-1ajrurb\"><input type=\"checkbox\"/> <span class=\"sq svelte-1ajrurb\"></span> <!></label> <code class=\"svelte-1ajrurb\"> </code> <span class=\"pal svelte-1ajrurb\" role=\"radiogroup\"></span></li>"), Q = m("<h4 class=\"svelte-1ajrurb\"> </h4> <ul class=\"svelte-1ajrurb\"></ul>", 1), $ = m("<!> <!>", 1), ie = {
	hash: "svelte-1ajrurb",
	code: "h4.svelte-1ajrurb {margin:10px 0 4px;font-size:0.78em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}ul.svelte-1ajrurb {list-style:none;margin:0;padding:0;display:grid;gap:4px;}li.svelte-1ajrurb {display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;}label.svelte-1ajrurb {display:flex;align-items:center;gap:8px;flex:1 1 12em;min-width:0;color:var(--text);}.sq.svelte-1ajrurb {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}.ro.svelte-1ajrurb {color:var(--text-faint);}code.svelte-1ajrurb {color:var(--text-faint);font-size:0.8em;}.pal.svelte-1ajrurb {display:flex;gap:4px;}.pc.svelte-1ajrurb {all:unset;cursor:pointer;width:16px;height:16px;border-radius:50%;background:var(--c);}.pc[aria-checked=\"true\"].svelte-1ajrurb {box-shadow:0 0 0 2px var(--bg-elev, var(--bg)), 0 0 0 4px var(--c);}.pc.svelte-1ajrurb:focus-visible {outline:2px solid var(--accent);outline-offset:2px;}.none.svelte-1ajrurb {color:var(--text-faint);margin:4px 0;}"
};
function ae(e, r) {
	g(r, !0), t(e, ie);
	let u = [
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
	], d = N(x([])), m = N(x([])), h = N(""), _ = N(x([])), v = N(x({}));
	function T() {
		let e = r.ctx.settings();
		C(_, (e.hidden ?? []).slice(), !0), C(v, Object.fromEntries((e.colors ?? []).flatMap((e) => {
			let t = e.lastIndexOf(":");
			return t > 0 ? [[e.slice(0, t).trim(), e.slice(t + 1).trim()]] : [];
		})), !0);
	}
	n(() => {
		T(), r.ctx.call("sources", {}, 30).then((e) => {
			let t = e;
			C(d, t.sources, !0), C(m, t.accounts ?? [], !0);
		}, (e) => C(h, String(e?.message ?? e), !0));
	});
	let E = A(() => [...j(m).map((e) => ({
		title: e.name,
		items: j(d).filter((t) => t.account === e.name)
	})), {
		title: "Subscriptions",
		items: j(d).filter((e) => e.kind === "ics")
	}].filter((e) => e.items.length)), O = (e) => !j(_).includes(e.id) && !j(_).includes(e.name), M = (e) => j(v)[e.id] ?? j(v)[e.name] ?? e.shown_color ?? e.color ?? b(e.id);
	function P(e) {
		C(_, O(e) ? [...j(_), e.id] : j(_).filter((t) => t !== e.id && t !== e.name), !0), r.ctx.save({ hidden: j(_) });
	}
	function F(e, t) {
		let n = Object.fromEntries(Object.entries(j(v)).filter(([t]) => t !== e.name));
		C(v, {
			...n,
			[e.id]: t
		}, !0), r.ctx.save({ colors: Object.entries(j(v)).map(([e, t]) => `${e}: ${t}`) });
	}
	var I = $(), R = y(I), B = (e) => {
		var t = q(), n = k(t, !0);
		D(() => a(n, j(h))), i(e, t);
	}, H = (e) => {
		var t = J();
		i(e, t);
	};
	p(R, (e) => {
		j(h) ? e(B) : j(E).length || e(H, 1);
	});
	var U = z(R, 2);
	f(U, 17, () => j(E), (e) => e.title, (e, t) => {
		var n = Q(), r = y(n), d = k(r, !0), m = z(r, 2);
		f(m, 21, () => j(t).items, (e) => e.id, (e, t) => {
			var n = Z(), r = L(n), d = L(r);
			o(d);
			var m = z(d, 2);
			let h;
			var g = z(m, 1, !0), _ = z(g), v = (e) => {
				var t = Y();
				i(e, t);
			};
			p(_, (e) => {
				j(t).writable || e(v);
			}), V(r);
			var y = z(r, 2), b = k(y, !0), x = z(y, 2);
			f(x, 20, () => u, (e) => e, (e, n) => {
				var r = X();
				let a;
				D((e) => {
					s(r, "aria-checked", e), s(r, "aria-label", n), a = l(r, "", a, { "--c": n });
				}, [() => M(j(t)) === n]), S("click", r, () => F(j(t), n)), i(e, r);
			}), V(x), V(n), D((e, n) => {
				c(d, e), h = l(m, "", h, { "--c": n }), a(g, j(t).name), a(b, j(t).id), s(x, "aria-label", `Colour of ${j(t).name ?? ""}`);
			}, [() => O(j(t)), () => M(j(t))]), S("change", d, () => P(j(t))), i(e, n);
		}), V(m), D(() => a(d, j(t).title)), i(e, n);
	}), i(e, I), w();
}
e(["change", "click"]);
//#endregion
//#region ui/src/lib/local-day.ts
var oe = (e = /* @__PURE__ */ new Date()) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
//#endregion
//#region plugins/stable/dav/ui/src/main.ts
function se(e) {
	let t = () => e.plugin.settings.accounts ?? [], n = () => t().some((e) => e.name && e.user && (e.url || e.server === "exchange")) || !!(e.plugin.settings.url && e.plugin.settings.user), i = (t = {}) => {
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
			date: oe(),
			view: "day"
		})
	}), e.registerCommand({
		id: "new",
		title: "Calendar: new event",
		run: () => typeof e.openDialog == "function" ? void e.openDialog(E, {
			title: "New event",
			width: 640,
			height: 560
		}) : i({ create: !0 })
	}), window.addEventListener("atlas-calendar:new", (t) => {
		let { ack: n, ...r } = t.detail ?? {};
		n && window.dispatchEvent(new CustomEvent("atlas-calendar:heard")), typeof e.openDialog == "function" ? e.openDialog(M(r), {
			title: r.guests?.length ? "New meeting" : "New event",
			width: 640,
			height: 600
		}) : i({ create: !0 });
	}), e.registerCommand({
		id: "quick",
		title: "Calendar: quick add (in words)…",
		run: () => i({ quick: !0 })
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
				let t = await I(e, "sync", {}, 300), n = (t.events ?? []).filter((e) => e.outcome === "failed").map((e) => `${e.title}: ${e.why}`);
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
				await I(e, "refresh", { force: !0 }, 300);
				let t = await I(e, "calendars");
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
				let t = await I(e, "test_account", { record: n }, 60);
				e.toast(String(n.name ?? "Account"), t.text, t.ok ? "success" : "error"), t.ok && I(e, "refresh", { force: !0 }, 300).catch(() => {});
			} catch (t) {
				e.toast("Calendar", t.message, "error");
			}
		}
	}), e.registerCommand({
		id: "sync-now",
		title: "Calendar: sync now",
		run: async () => {
			try {
				let t = await I(e, "refresh", { force: !0 }, 300);
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
				let t = await I(e, "test_subscription", { record: n }, 60);
				e.toast("Subscription", t.summary, "success"), I(e, "refresh", { force: !0 }, 120).catch(() => {});
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
	}), e.registerBlock("dav.upcoming", (t, n) => {
		let a = r(K, {
			target: t,
			props: {
				atlas: e,
				options: n.options ?? {},
				onopen: (e) => i({
					date: e,
					view: "day"
				})
			}
		});
		return () => P(a);
	}, {
		title: "Calendar: upcoming",
		options: [{
			key: "days",
			label: "Days",
			kind: "number"
		}]
	}), e.plugin.settings.url && e.plugin.settings.user && !t().length && (async () => {
		let t = await I(e, "migrate", {}, 60);
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
			let n = r(ae, {
				target: e,
				props: { ctx: t }
			});
			return () => P(n);
		}
	}), o = setTimeout(() => {
		I(e, "watch", {}, 60).catch(() => {});
	}, 5e3);
	return () => {
		clearTimeout(o), a?.();
	};
}
//#endregion
export { se as register };
