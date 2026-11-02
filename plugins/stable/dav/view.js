import { $ as e, A as t, B as n, C as r, D as i, E as a, F as o, G as s, H as c, I as l, J as u, K as d, L as f, M as p, N as m, O as h, Q as g, R as _, S as v, T as y, U as b, V as x, W as S, X as C, Y as w, Z as T, _ as E, _t as D, a as O, at as ee, b as k, bt as te, c as A, ct as j, d as M, dt as N, et as P, f as F, ft as I, g as L, gt as ne, h as R, ht as re, it as z, j as B, k as ie, l as V, lt as H, m as ae, mt as U, n as oe, nt as W, o as se, ot as ce, pt as G, q as K, r as le, rt as ue, s as q, st as J, t as de, tt as fe, u as pe, ut as Y, v as me, vt as X, w as he, x as ge, y as _e, yt as Z, z as Q } from "./ui-lib/layout.js";
//#region plugins/stable/dav/ui/src/store.svelte.ts
var ve = "notes", ye = (e) => {
	try {
		return localStorage.getItem(`atlas-calendar-${e}`);
	} catch {
		return null;
	}
}, be = (e, t) => {
	try {
		localStorage.setItem(`atlas-calendar-${e}`, t);
	} catch {}
}, xe = class {
	atlas;
	#e = G(N([]));
	get sources() {
		return W(this.#e);
	}
	set sources(e) {
		I(this.#e, e, !0);
	}
	#t = G(N([]));
	get accounts() {
		return W(this.#t);
	}
	set accounts(e) {
		I(this.#t, e, !0);
	}
	#n = G(N([]));
	get events() {
		return W(this.#n);
	}
	set events(e) {
		I(this.#n, e, !0);
	}
	#r = G("week");
	get view() {
		return W(this.#r);
	}
	set view(e) {
		I(this.#r, e, !0);
	}
	#i = G(N(k(/* @__PURE__ */ new Date())));
	get cursor() {
		return W(this.#i);
	}
	set cursor(e) {
		I(this.#i, e, !0);
	}
	#a = G(!0);
	get loading() {
		return W(this.#a);
	}
	set loading(e) {
		I(this.#a, e, !0);
	}
	#o = G(!1);
	get syncing() {
		return W(this.#o);
	}
	set syncing(e) {
		I(this.#o, e, !0);
	}
	#s = G("");
	get error() {
		return W(this.#s);
	}
	set error(e) {
		I(this.#s, e, !0);
	}
	#c = G(!0);
	get configured() {
		return W(this.#c);
	}
	set configured(e) {
		I(this.#c, e, !0);
	}
	#l = G(null);
	get write() {
		return W(this.#l);
	}
	set write(e) {
		I(this.#l, e, !0);
	}
	#u = G(N(ye("last")));
	get last() {
		return W(this.#u);
	}
	set last(e) {
		I(this.#u, e, !0);
	}
	#d = G(N([]));
	get hidden() {
		return W(this.#d);
	}
	set hidden(e) {
		I(this.#d, e, !0);
	}
	#f = G(N({}));
	get colors() {
		return W(this.#f);
	}
	set colors(e) {
		I(this.#f, e, !0);
	}
	#p = G(N([]));
	get toasts() {
		return W(this.#p);
	}
	set toasts(e) {
		I(this.#p, e, !0);
	}
	#m = G(null);
	get results() {
		return W(this.#m);
	}
	set results(e) {
		I(this.#m, e, !0);
	}
	#h = G("");
	get query() {
		return W(this.#h);
	}
	set query(e) {
		I(this.#h, e, !0);
	}
	#g = G(N(/* @__PURE__ */ new Date()));
	get now() {
		return W(this.#g);
	}
	set now(e) {
		I(this.#g, e, !0);
	}
	#_ = G(!1);
	get narrow() {
		return W(this.#_);
	}
	set narrow(e) {
		I(this.#_, e, !0);
	}
	seq = 0;
	timer;
	constructor(e) {
		this.atlas = e;
		let t = e.plugin.settings;
		this.view = ye("view") ?? String(t.default_view ?? "week"), this.hidden = (t.hidden ?? []).slice();
		for (let e of t.colors ?? []) {
			let t = e.lastIndexOf(":");
			t > 0 && (this.colors[e.slice(0, t).trim()] = e.slice(t + 1).trim());
		}
	}
	get settings() {
		return this.atlas.plugin.settings;
	}
	get first() {
		return he(this.settings.week_start);
	}
	get h12() {
		return pe(this.settings.time_format);
	}
	get showNotes() {
		return this.settings.show_notes === !0;
	}
	shown() {
		return this.narrow ? this.view === "week" || this.view === "workweek" ? "day" : this.view === "month" || this.view === "year" ? "agenda" : this.view : this.view;
	}
	range(e = this.shown(), t = this.cursor) {
		switch (e) {
			case "day": return {
				from: t,
				to: t
			};
			case "week": {
				let e = ge(t, this.first);
				return {
					from: e,
					to: O(e, 6)
				};
			}
			case "workweek": {
				let e = ge(t, 1);
				return {
					from: e,
					to: O(e, 4)
				};
			}
			case "month": {
				let e = ge(new Date(t.getFullYear(), t.getMonth(), 1), this.first);
				return {
					from: e,
					to: O(e, 41)
				};
			}
			case "agenda": return {
				from: t,
				to: O(t, 59)
			};
			case "year": return {
				from: new Date(t.getFullYear(), 0, 1),
				to: new Date(t.getFullYear(), 11, 31)
			};
		}
	}
	days() {
		let { from: e, to: t } = this.range(), n = [];
		for (let r = e; r <= t; r = O(r, 1)) n.push(r);
		return n;
	}
	colorOf(e) {
		if (e === "notes") return this.colors.notes ?? this.colors.Notes ?? "var(--accent)";
		let t = this.sources.find((t) => t.id === e);
		return this.colors[e] ?? this.colors[t?.name ?? ""] ?? t?.shown_color ?? t?.color ?? M(e);
	}
	isHidden(e, t = e) {
		return this.hidden.includes(e) || this.hidden.includes(t);
	}
	async loadSources() {
		try {
			let e = await q(this.atlas, "watch", {}, 30);
			this.sources = e.sources, this.accounts = e.accounts ?? [], this.write = e.write, this.configured = e.configured;
		} catch (e) {
			this.error = e.message;
		}
	}
	async load(e = !1) {
		let { from: t, to: n } = this.range(), r = ++this.seq;
		e || (this.loading = !0);
		try {
			let e = this.sources.filter((e) => !this.isHidden(e.id, e.name)).map((e) => e.id), i = await q(this.atlas, "range", {
				from: y(t),
				to: y(n),
				sources: e,
				notes: this.showNotes && !this.isHidden("notes", "Notes")
			}, 60);
			if (r !== this.seq) return;
			this.events = i.events, this.error = "";
		} catch (e) {
			r === this.seq && (this.error = e.message);
		} finally {
			r === this.seq && (this.loading = !1);
		}
	}
	later(e = 250) {
		clearTimeout(this.timer), this.timer = setTimeout(() => void this.load(!0), e);
	}
	async sync(e = !0) {
		this.syncing = !0;
		try {
			let t = await q(this.atlas, "refresh", { force: e }, 300);
			await this.loadSources(), t.changed && await this.load(!0), t.errors.length && this.toast(t.errors[0], "error");
		} catch (e) {
			this.error ||= e.message;
		} finally {
			this.syncing = !1;
		}
	}
	setView(e) {
		this.view = e, be("view", e), this.results = null, this.load();
	}
	go(e, t) {
		this.cursor = k(e), t ? this.setView(t) : this.load();
	}
	today() {
		this.go(/* @__PURE__ */ new Date());
	}
	step(e) {
		let t = this.cursor, n = {
			day: () => O(t, e),
			week: () => O(t, 7 * e),
			workweek: () => O(t, 7 * e),
			month: () => se(new Date(t.getFullYear(), t.getMonth(), 1), e),
			agenda: () => O(t, 30 * e),
			year: () => new Date(t.getFullYear() + e, t.getMonth(), 1)
		}[this.shown()]();
		this.go(n);
	}
	title(e = this.shown()) {
		let { from: t, to: n } = this.range(e), r = this.cursor;
		if (e === "day") return r.toLocaleDateString(void 0, {
			weekday: "long",
			day: "numeric",
			month: "long",
			year: "numeric"
		});
		if (e === "month") return r.toLocaleDateString(void 0, {
			month: "long",
			year: "numeric"
		});
		if (e === "year") return String(r.getFullYear());
		let i = t.getMonth() === n.getMonth();
		return `${t.toLocaleDateString(void 0, i ? { day: "numeric" } : {
			day: "numeric",
			month: "short"
		})} – ${n.toLocaleDateString(void 0, {
			day: "numeric",
			month: "short",
			year: "numeric"
		})}`;
	}
	toggle(e, t) {
		this.hidden = this.isHidden(e, t) ? this.hidden.filter((n) => n !== e && n !== t) : [...this.hidden, e], this.load(!0), this.atlas.plugin.saveSettings({ hidden: this.hidden }).catch(() => {});
	}
	setColor(e, t) {
		let n = this.sources.find((t) => t.id === e)?.name, r = Object.fromEntries(Object.entries(this.colors).filter(([e]) => e !== n));
		this.colors = {
			...r,
			[e]: t
		}, this.atlas.plugin.saveSettings({ colors: Object.entries(this.colors).map(([e, t]) => `${e}: ${t}`) }).catch(() => {});
	}
	writable() {
		return this.sources.filter((e) => e.kind === "caldav" && e.writable);
	}
	byAccount(e = !1) {
		let t = e ? this.writable() : this.sources.filter((e) => e.kind === "caldav"), n = this.accounts.map((e) => ({
			account: e,
			items: t.filter((t) => t.account === e.name)
		})), r = t.filter((e) => !this.accounts.some((t) => t.name === e.account));
		return [...n, ...r.length ? [{
			account: { name: "Other" },
			items: r
		}] : []].filter((t) => t.items.length || !e);
	}
	newCalendar() {
		let e = (e) => !!e && this.writable().some((t) => t.id === e);
		return e(this.last) ? this.last : e(this.write) ? this.write : this.writable()[0]?.id ?? null;
	}
	remember(e) {
		e && (this.last = e, be("last", e));
	}
	toast(e, t, n) {
		let r = Date.now() + Math.random();
		this.toasts = [...this.toasts.slice(-2), {
			id: r,
			text: e,
			kind: t,
			undo: n
		}], setTimeout(() => this.dismiss(r), n ? 9e3 : t === "error" ? 12e3 : 4e3);
	}
	dismiss(e) {
		this.toasts = this.toasts.filter((t) => t.id !== e);
	}
	undoer(e, t) {
		if (e !== void 0) return async () => {
			try {
				await q(this.atlas, "undo", { id: e }), this.toast(`${t} undone`);
			} catch (e) {
				this.toast(`Not undone: ${e.message}`, "error");
			}
			this.later(0);
		};
	}
	askScope(e, t) {
		return !e.recurring || !e.rid ? Promise.resolve("this") : new Promise((e) => {
			let n = !1;
			this.atlas.pick({
				placeholder: `${t} a repeating event: which ones?`,
				tag: "Repeating",
				items: [
					{
						value: "this",
						title: "This event"
					},
					{
						value: "following",
						title: "This and following events"
					},
					{
						value: "all",
						title: "All events"
					}
				],
				onpick: (t) => {
					n = !0, e(t);
				}
			});
			let r = () => {
				!n && !document.querySelector("[data-testid=palette]") ? e(null) : n || setTimeout(r, 300);
			};
			setTimeout(r, 600);
		});
	}
	async create(e) {
		let t = e.calendar ?? this.newCalendar() ?? void 0, n = {
			uid: `pending-${Date.now()}`,
			summary: e.summary || "(no title)",
			start: e.all_day ? e.start.slice(0, 10) : new Date(e.start).toISOString(),
			end: e.all_day ? e.end.slice(0, 10) : new Date(e.end).toISOString(),
			all_day: !!e.all_day,
			recurring: !!e.rrule,
			free: !1,
			calendar: t ?? "",
			calendar_name: "",
			writable: !0,
			location: e.location
		};
		this.events = [...this.events, n], this.remember(t);
		try {
			let r = await q(this.atlas, "create", {
				...e,
				calendar: t
			});
			return this.toast(`Added “${n.summary}”`, void 0, this.undoer(r.undo, "Adding")), !0;
		} catch (e) {
			return this.toast(`Not added: ${e.message}`, "error"), !1;
		} finally {
			await this.load(!0);
		}
	}
	async change(e, t, n, r = "Changed") {
		if (t.start && t.end) {
			let r = this.events.indexOf(e), i = {
				...e,
				start: t.all_day ?? e.all_day ? t.start.slice(0, 10) : new Date(t.start).toISOString(),
				end: t.all_day ?? e.all_day ? t.end.slice(0, 10) : new Date(t.end).toISOString()
			};
			r >= 0 && n === "this" && (this.events = [
				...this.events.slice(0, r),
				i,
				...this.events.slice(r + 1)
			]);
		}
		try {
			t.move_to && this.remember(t.move_to);
			let i = await q(this.atlas, "update", {
				...t,
				calendar: e.calendar,
				href: e.href,
				uid: e.uid,
				rid: e.rid,
				scope: n,
				from_start: t.from_start ?? e.start
			});
			this.toast(`${r} “${t.summary ?? e.summary}”`, void 0, this.undoer(i.undo, r));
		} catch (e) {
			this.toast(`Not saved: ${e.message}`, "error");
		} finally {
			await this.load(!0);
		}
	}
	async remove(e) {
		let t = await this.askScope(e, "Delete");
		if (t) {
			this.events = this.events.filter((n) => n.uid !== e.uid || t === "this" && n.rid !== e.rid);
			try {
				let n = await q(this.atlas, "delete", {
					calendar: e.calendar,
					href: e.href,
					uid: e.uid,
					rid: e.rid,
					scope: t
				});
				this.toast(`Deleted “${e.summary}”`, void 0, this.undoer(n.undo, "Deleting"));
			} catch (e) {
				this.toast(`Not deleted: ${e.message}`, "error");
			} finally {
				await this.load(!0);
			}
		}
	}
	async search(e) {
		if (this.query = e, !e.trim()) {
			this.results = null;
			return;
		}
		try {
			this.results = (await q(this.atlas, "search", { q: e })).events;
		} catch (e) {
			this.toast(e.message, "error");
		}
	}
	static fields(e) {
		let t = V(e), n = A(e);
		return e.all_day ? {
			start: y(t),
			end: y(O(n, -1))
		} : {
			start: r(t),
			end: r(n)
		};
	}
}, Se = {
	calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
	back: "M15 18l-6-6 6-6",
	right: "M9 6l6 6-6 6",
	search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5",
	plus: "M12 5v14M5 12h14",
	x: "M6 6l12 12M18 6L6 18",
	refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
	menu: "M4 6h16M4 12h16M4 18h16",
	keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
	clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
	pin: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
	note: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
	repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
	trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
	pen: "M4 20h4L19 9l-4-4L4 16z",
	people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-5-6",
	text: "M4 6h16M4 12h16M4 18h10",
	gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z",
	rss: "M5 19h.01M5 12a7 7 0 0 1 7 7M5 5a14 14 0 0 1 14 14",
	link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
	sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"
}, Ce = T("<svg class=\"icon svelte-16m1c18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path></path></svg>"), we = {
	hash: "svelte-16m1c18",
	code: ".icon.svelte-16m1c18 {flex:none;display:block;}"
};
function $(e, t) {
	n(e, we);
	let r = i(t, "size", 3, 16), a = i(t, "title", 3, "");
	var o = Ce(), s = H(o);
	z(() => {
		m(o, "width", r()), m(o, "height", r()), m(o, "aria-hidden", a() ? void 0 : "true"), m(o, "role", a() ? "img" : void 0), m(o, "aria-label", a() || void 0), m(s, "d", Se[t.name] ?? Se.calendar);
	}), u(e, o);
}
//#endregion
//#region plugins/stable/dav/ui/src/Sidebar.svelte
var Te = C("<span class=\"h svelte-1jq00cd\"> </span>"), Ee = C("<button> </button>"), De = C("<button class=\"link svelte-1jq00cd\">Set it up…</button>"), Oe = C("<h3 class=\"svelte-1jq00cd\">Calendars</h3> <ul class=\"svelte-1jq00cd\"><li class=\"none svelte-1jq00cd\"> <!></li></ul>", 1), ke = C("<span class=\"err svelte-1jq00cd\">!</span>"), Ae = T("<svg viewBox=\"0 0 12 12\" width=\"10\" height=\"10\" aria-hidden=\"true\"><path d=\"M2.5 6.5l2.2 2.2L9.5 3.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path></svg>"), je = C("<span class=\"ro svelte-1jq00cd\" title=\"A subscription: read-only\"><!></span>"), Me = C("<span class=\"ro svelte-1jq00cd\" title=\"Read-only\">ro</span>"), Ne = C("<button class=\"pc svelte-1jq00cd\" role=\"option\"></button>"), Pe = C("<div class=\"palette svelte-1jq00cd\" role=\"listbox\" aria-label=\"Colours\"></div>"), Fe = C("<li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\"><span><!></span> <span class=\"name svelte-1jq00cd\"> </span> <!> <!></button> <button class=\"tool small svelte-1jq00cd\" title=\"Colour\"><span class=\"swatch svelte-1jq00cd\"></span></button> <!></li>"), Ie = C("<li class=\"none svelte-1jq00cd\"> </li>"), Le = C("<h3 class=\"svelte-1jq00cd\"> <!></h3> <ul class=\"svelte-1jq00cd\"></ul>", 1), Re = C("<h3 class=\"svelte-1jq00cd\">In the vault</h3> <ul class=\"svelte-1jq00cd\"><li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\" title=\"Notes marked important: true with due: / event:\"><span><!></span> <span class=\"name svelte-1jq00cd\">Important notes</span></button></li></ul>", 1), ze = C("<div class=\"side svelte-1jq00cd\"><button class=\"create atlas-btn primary svelte-1jq00cd\"><!>Create</button> <div class=\"mini svelte-1jq00cd\" aria-label=\"Pick a day\"><div class=\"mhead svelte-1jq00cd\"><span class=\"mtitle svelte-1jq00cd\"> </span> <button class=\"tool svelte-1jq00cd\" aria-label=\"Previous month\"><!></button> <button class=\"tool svelte-1jq00cd\" aria-label=\"Next month\"><!></button></div> <div class=\"mgrid svelte-1jq00cd\"><!> <!></div></div> <!> <!> <!> <button class=\"link add svelte-1jq00cd\"><!>Add an account or a subscription…</button></div>"), Be = {
	hash: "svelte-1jq00cd",
	code: ".side.svelte-1jq00cd {height:100%;overflow-y:auto;padding:12px 10px 24px;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;}.create.svelte-1jq00cd {display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin:0 0 10px 4px;padding:7px 16px;}.mini.svelte-1jq00cd {padding:0 2px 10px;}.mhead.svelte-1jq00cd {display:flex;align-items:center;gap:2px;padding:0 0 4px 6px;}.mtitle.svelte-1jq00cd {flex:1;font-weight:600;font-size:0.9em;color:var(--heading);}.mgrid.svelte-1jq00cd {display:grid;grid-template-columns:repeat(7, 1fr);gap:1px;}.h.svelte-1jq00cd {font-size:0.68em;color:var(--text-faint);text-align:center;padding:2px 0;}.d.svelte-1jq00cd {all:unset;cursor:pointer;text-align:center;font-size:0.76em;line-height:24px;border-radius:999px;font-variant-numeric:tabular-nums;color:var(--text-muted);position:relative;}.d.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.d.other.svelte-1jq00cd {color:var(--text-faint);}.d.on.svelte-1jq00cd {background:var(--accent-soft);color:var(--accent-strong);border-radius:0;}.d.busy.svelte-1jq00cd::after {content:\"\";position:absolute;left:50%;bottom:2px;width:3px;height:3px;border-radius:50%;background:currentColor;transform:translateX(-50%);opacity:0.6;}.d.today.svelte-1jq00cd {background:var(--accent);color:var(--accent-fg);font-weight:700;border-radius:999px;}.d.svelte-1jq00cd:focus-visible, .cal.svelte-1jq00cd:focus-visible, .tool.svelte-1jq00cd:focus-visible, .pc.svelte-1jq00cd:focus-visible, .link.svelte-1jq00cd:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}h3.svelte-1jq00cd {margin:10px 6px 2px;font-size:0.72em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;}ul.svelte-1jq00cd {list-style:none;margin:0;padding:0;display:grid;gap:1px;}li.svelte-1jq00cd {position:relative;display:flex;align-items:center;}.cal.svelte-1jq00cd {all:unset;flex:1;min-width:0;cursor:pointer;display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:var(--radius-sm);color:var(--text);font-size:0.9em;}.cal.svelte-1jq00cd:hover {background:var(--bg-hover);}.box.svelte-1jq00cd {width:14px;height:14px;border-radius:4px;background:var(--c);border:2px solid var(--c);box-sizing:border-box;display:grid;place-items:center;color:#fff;flex:none;}.box.off.svelte-1jq00cd {background:transparent;}.name.svelte-1jq00cd {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.err.svelte-1jq00cd {color:var(--red);font-weight:700;}.ro.svelte-1jq00cd {color:var(--text-faint);font-size:0.75em;}.tool.svelte-1jq00cd {all:unset;cursor:pointer;padding:5px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.small.svelte-1jq00cd {opacity:0;}li.svelte-1jq00cd:hover .small:where(.svelte-1jq00cd), .small.svelte-1jq00cd:focus-visible {opacity:1;}.swatch.svelte-1jq00cd {width:10px;height:10px;border-radius:50%;background:var(--c);}.palette.svelte-1jq00cd {position:absolute;right:0;top:100%;z-index:20;display:grid;grid-template-columns:repeat(6, 22px);gap:6px;padding:8px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 24px rgba(0,0,0,.25));}.pc.svelte-1jq00cd {all:unset;cursor:pointer;width:22px;height:22px;border-radius:50%;background:var(--c);}.pc[aria-selected=\"true\"].svelte-1jq00cd {box-shadow:0 0 0 2px var(--bg-elev), 0 0 0 4px var(--c);}.none.svelte-1jq00cd {color:var(--text-faint);font-size:0.85em;padding:4px 6px;gap:6px;flex-wrap:wrap;}.link.svelte-1jq00cd {all:unset;cursor:pointer;color:var(--accent);font-size:0.85em;display:inline-flex;align-items:center;gap:4px;}.add.svelte-1jq00cd {margin:10px 6px 0;}"
};
function Ve(e, t) {
	D(t, !0), n(e, Be);
	let r = G(N(/* @__PURE__ */ new Date()));
	ee(() => {
		I(r, new Date(t.cal.cursor.getFullYear(), t.cal.cursor.getMonth(), 1), !0);
	});
	let i = U(() => {
		let e = ge(W(r), t.cal.first);
		return Array.from({ length: 42 }, (t, n) => O(e, n));
	}), a = U(() => W(i).slice(0, 7).map((e) => e.toLocaleDateString(void 0, { weekday: "narrow" }))), o = (e) => {
		let n = t.cal.range();
		return e >= n.from && e <= n.to;
	}, s = U(() => new Set(t.cal.events.map((e) => e.start.slice(0, 10)))), l = (e) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`, f = [
		"#3b82f6",
		"#0ea5e9",
		"#14b8a6",
		"#22c55e",
		"#84cc16",
		"#eab308",
		"#f97316",
		"#ef4444",
		"#ec4899",
		"#a855f7",
		"#6366f1",
		"#64748b"
	], p = G(null), h = U(() => [...t.cal.byAccount().map((e) => ({
		title: e.account.name,
		error: e.account.error ?? void 0,
		items: e.items
	})), {
		title: "Subscriptions",
		error: void 0,
		items: t.cal.sources.filter((e) => e.kind === "ics")
	}]), g = U(() => !t.cal.accounts.length), v = U(() => t.cal.showNotes);
	function y(e) {
		return e.error ? `${e.name} — ${e.error}` : e.writable ? e.name : `${e.name} (read-only)`;
	}
	var b = ze(), C = J(b);
	$(J(C), {
		name: "plus",
		size: 15
	}), X(), Z(C);
	var T = Y(C, 2), E = J(T), k = J(E), te = H(k, !0), A = Y(k, 2);
	$(J(A), {
		name: "back",
		size: 14
	}), Z(A);
	var M = Y(A, 2);
	$(J(M), {
		name: "right",
		size: 14
	}), Z(M), Z(E);
	var F = Y(E, 2), L = J(F);
	x(L, 17, () => W(a), c, (e, t) => {
		var n = Te(), r = H(n, !0);
		z(() => d(r, W(t))), u(e, n);
	});
	var R = Y(L, 2);
	x(R, 17, () => W(i), (e) => e.getTime(), (e, n) => {
		var i = Ee();
		let a;
		var c = H(i, !0);
		z((e, t, n, r, o) => {
			a = Q(i, 1, "d svelte-1jq00cd", null, a, {
				other: e,
				today: t,
				on: n,
				busy: r
			}), d(c, o);
		}, [
			() => W(n).getMonth() !== W(r).getMonth(),
			() => me(W(n), t.cal.now),
			() => o(W(n)),
			() => W(s).has(l(W(n))),
			() => W(n).getDate()
		]), P("click", i, () => t.cal.go(W(n))), u(e, i);
	}), Z(F), Z(T);
	var re = Y(T, 2), B = (e) => {
		var n = Oe(), r = Y(j(n), 2), i = J(r), a = J(i, !0), o = Y(a), s = (e) => {
			var n = De();
			P("click", n, () => t.cal.atlas.plugin.openSettings()), u(e, n);
		};
		S(o, (e) => {
			t.cal.configured || e(s);
		}), Z(i), Z(r), z(() => d(a, t.cal.configured ? t.cal.error ? "Not read: see the message beside." : "Reading the server…" : "No account yet.")), u(e, n);
	};
	S(re, (e) => {
		W(g) && e(B);
	});
	var ie = Y(re, 2);
	x(ie, 17, () => W(h), (e) => e.title, (e, n) => {
		var r = w(), i = j(r), a = (e) => {
			var r = Le(), i = j(r), a = J(i, !0), o = Y(a), s = (e) => {
				var t = ke();
				z(() => m(t, "title", W(n).error)), u(e, t);
			};
			S(o, (e) => {
				W(n).error && e(s);
			}), Z(i);
			var c = Y(i, 2);
			x(c, 21, () => W(n).items, (e) => e.id, (e, n) => {
				var r = Fe(), i = J(r), a = J(i);
				let o, s;
				var c = J(a), l = (e) => {
					var t = Ae();
					u(e, t);
				}, h = U(() => !t.cal.isHidden(W(n).id, W(n).name));
				S(c, (e) => {
					W(h) && e(l);
				}), Z(a);
				var g = Y(a, 2), v = H(g, !0), b = Y(g, 2), C = (e) => {
					var t = ke();
					z(() => m(t, "title", W(n).error)), u(e, t);
				};
				S(b, (e) => {
					W(n).error && e(C);
				});
				var w = Y(b, 2), T = (e) => {
					var t = je();
					$(J(t), {
						name: "rss",
						size: 12
					}), Z(t), u(e, t);
				}, E = (e) => {
					var t = Me();
					u(e, t);
				};
				S(w, (e) => {
					W(n).kind === "ics" ? e(T) : W(n).writable || e(E, 1);
				}), Z(i);
				var D = Y(i, 2), O = J(D);
				let ee;
				Z(D);
				var k = Y(D, 2), te = (e) => {
					var r = Pe();
					x(r, 20, () => f, (e) => e, (e, r) => {
						var i = Ne();
						let a;
						z((e) => {
							m(i, "aria-selected", e), m(i, "aria-label", r), a = _(i, "", a, { "--c": r });
						}, [() => t.cal.colorOf(W(n).id) === r]), P("click", i, () => {
							t.cal.setColor(W(n).id, r), I(p, null);
						}), u(e, i);
					}), Z(r), u(e, r);
				};
				S(k, (e) => {
					W(p) === W(n).id && e(te);
				}), Z(r), z((e, t, r, c, l) => {
					m(i, "aria-checked", e), m(i, "title", t), o = Q(a, 1, "box svelte-1jq00cd", null, o, { off: r }), s = _(a, "", s, { "--c": c }), d(v, W(n).name), m(D, "aria-label", `Colour of ${W(n).name ?? ""}`), ee = _(O, "", ee, { "--c": l });
				}, [
					() => !t.cal.isHidden(W(n).id, W(n).name),
					() => y(W(n)),
					() => t.cal.isHidden(W(n).id, W(n).name),
					() => t.cal.colorOf(W(n).id),
					() => t.cal.colorOf(W(n).id)
				]), P("click", i, () => t.cal.toggle(W(n).id, W(n).name)), P("click", D, () => I(p, W(p) === W(n).id ? null : W(n).id, !0)), u(e, r);
			}, (e) => {
				var t = Ie(), r = H(t, !0);
				z(() => d(r, W(n).error ?? "Reading the server…")), u(e, t);
			}), Z(c), z(() => {
				m(i, "title", W(n).error ?? W(n).title), d(a, W(n).title);
			}), u(e, r);
		};
		S(i, (e) => {
			(W(n).items.length || W(n).title !== "Subscriptions") && e(a);
		}), u(e, r);
	});
	var V = Y(ie, 2), ae = (e) => {
		var n = Re(), r = Y(j(n), 2), i = J(r), a = J(i), o = J(a);
		let s, c;
		var l = J(o), d = (e) => {
			var t = Ae();
			u(e, t);
		}, f = U(() => !t.cal.isHidden(ve, "Notes"));
		S(l, (e) => {
			W(f) && e(d);
		}), Z(o), X(2), Z(a), Z(i), Z(r), z((e, t, n) => {
			m(a, "aria-checked", e), s = Q(o, 1, "box svelte-1jq00cd", null, s, { off: t }), c = _(o, "", c, { "--c": n });
		}, [
			() => !t.cal.isHidden(ve, "Notes"),
			() => t.cal.isHidden(ve, "Notes"),
			() => t.cal.colorOf(ve)
		]), P("click", a, () => t.cal.toggle(ve, "Notes")), u(e, n);
	};
	S(V, (e) => {
		W(v) && e(ae);
	});
	var oe = Y(V, 2);
	$(J(oe), {
		name: "plus",
		size: 13
	}), X(), Z(oe), Z(b), z((e) => d(te, e), [() => W(r).toLocaleDateString(void 0, {
		month: "long",
		year: "numeric"
	})]), P("click", C, function(...e) {
		t.oncreate?.apply(this, e);
	}), P("click", A, () => I(r, se(W(r), -1), !0)), P("click", M, () => I(r, se(W(r), 1), !0)), P("click", oe, () => t.cal.atlas.plugin.openSettings()), u(e, b), ne();
}
e(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/TimeGrid.svelte
var He = C("<button title=\"Open this day\"><span class=\"wd svelte-16enfn0\"> </span> <span class=\"num svelte-16enfn0\"> </span></button>"), Ue = C("<div class=\"lanecell svelte-16enfn0\" role=\"button\" tabindex=\"-1\" aria-label=\"New all-day event\"></div>"), We = C("<span class=\"dot svelte-16enfn0\" aria-hidden=\"true\"></span>"), Ge = C("<button><!> </button>"), Ke = C("<div class=\"hl svelte-16enfn0\"> </div>"), qe = C("<span class=\"loc svelte-16enfn0\"> </span>"), Je = C("<div class=\"grip svelte-16enfn0\" role=\"separator\" aria-label=\"Change the end\"></div>"), Ye = C("<div role=\"button\" tabindex=\"0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span> <!> <!></div>"), Xe = C("<div class=\"ev slot-ghost svelte-16enfn0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span></div>"), Ze = C("<div class=\"now svelte-16enfn0\" aria-hidden=\"true\"></div>"), Qe = C("<div role=\"gridcell\" tabindex=\"-1\"><!> <!> <!></div>"), $e = C("<div class=\"tg svelte-16enfn0\"><div class=\"head svelte-16enfn0\"><div class=\"gutter tz svelte-16enfn0\" title=\"Times in your zone\"></div> <!></div> <div class=\"lane svelte-16enfn0\"><div class=\"gutter label svelte-16enfn0\">all-day</div> <div class=\"lanecols svelte-16enfn0\"><!> <!></div></div> <div class=\"scroll svelte-16enfn0\"><div class=\"body svelte-16enfn0\"><div class=\"gutter hours svelte-16enfn0\"></div> <div class=\"cols svelte-16enfn0\" role=\"grid\" tabindex=\"-1\" aria-label=\"Hours\"></div></div></div></div>"), et = {
	hash: "svelte-16enfn0",
	code: ".tg.svelte-16enfn0 {display:grid;grid-template-rows:auto auto 1fr;height:100%;min-height:0;--gutter: 56px;}.head.svelte-16enfn0, .lane.svelte-16enfn0 {display:grid;grid-template-columns:var(--gutter) 1fr;border-bottom:1px solid var(--border);}.head.svelte-16enfn0 {grid-template-columns:var(--gutter) repeat(var(--n), 1fr);}.gutter.svelte-16enfn0 {color:var(--text-faint);font-size:0.75em;}.tz.svelte-16enfn0 {align-self:end;padding:0 6px 6px;font-size:0.68em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.dayhead.svelte-16enfn0 {all:unset;cursor:pointer;display:flex;align-items:baseline;justify-content:center;gap:6px;padding:6px 2px;color:var(--text-muted);border-left:1px solid var(--border);min-width:0;}.dayhead.svelte-16enfn0:hover {background:var(--bg-hover);}.dayhead.svelte-16enfn0:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.wd.svelte-16enfn0 {font-size:0.78em;text-transform:uppercase;letter-spacing:0.04em;}.num.svelte-16enfn0 {font-size:1.25em;font-weight:600;color:var(--heading);font-variant-numeric:tabular-nums;min-width:1.8em;text-align:center;border-radius:999px;}.dayhead.today.svelte-16enfn0 .wd:where(.svelte-16enfn0) {color:var(--accent-strong);}.dayhead.today.svelte-16enfn0 .num:where(.svelte-16enfn0) {background:var(--accent);color:var(--accent-fg);}.label.svelte-16enfn0 {align-self:center;padding:0 6px;text-align:right;}.lanecols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);grid-auto-rows:22px;row-gap:2px;padding:3px 0;min-height:26px;max-height:120px;overflow-y:auto;}.lanecell.svelte-16enfn0 {grid-row:1 / span var(--rows);border-left:1px solid var(--border);cursor:cell;}.bar.svelte-16enfn0 {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;margin:0 3px;padding:0 8px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));color:var(--text);font-size:0.82em;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px;border-left:3px solid var(--c);}.bar.clipl.svelte-16enfn0 {border-top-left-radius:0;border-bottom-left-radius:0;margin-left:0;}.bar.clipr.svelte-16enfn0 {border-top-right-radius:0;border-bottom-right-radius:0;margin-right:0;}.dot.svelte-16enfn0 {width:6px;height:6px;border-radius:50%;background:var(--c);flex:none;}.scroll.svelte-16enfn0 {overflow-y:auto;min-height:0;position:relative;}.body.svelte-16enfn0 {position:relative;display:grid;grid-template-columns:var(--gutter) 1fr;height:calc(24 * var(--hour));}.hours.svelte-16enfn0 {position:relative;}.hl.svelte-16enfn0 {position:absolute;right:8px;transform:translateY(-50%);font-variant-numeric:tabular-nums;white-space:nowrap;}.cols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);position:relative;touch-action:pan-y;}.col.svelte-16enfn0 {position:relative;border-left:1px solid var(--border);cursor:cell;min-width:0;background-image:repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px var(--hour)), repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour) / 2), color-mix(in srgb, var(--border) 45%, transparent) calc(var(--hour) / 2) calc(var(--hour) / 2 + 1px), transparent calc(var(--hour) / 2 + 1px) var(--hour));}.col.weekend.svelte-16enfn0 {background-color:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.ev.svelte-16enfn0 {position:absolute;box-sizing:border-box;cursor:pointer;border-radius:var(--radius-sm);padding:2px 6px;overflow:hidden;display:flex;flex-direction:column;gap:0;font-size:0.8em;line-height:1.25;background:color-mix(in srgb, var(--c) 24%, var(--bg));border-left:3px solid var(--c);color:var(--text);box-shadow:0 0 0 1px var(--bg);touch-action:none;z-index:1;}.ev.svelte-16enfn0:hover {background:color-mix(in srgb, var(--c) 34%, var(--bg));}.ev.svelte-16enfn0:focus-visible, .ev.sel.svelte-16enfn0, .bar.sel.svelte-16enfn0, .bar.svelte-16enfn0:focus-visible {outline:2px solid var(--c);outline-offset:1px;z-index:3;}.ev.short.svelte-16enfn0 {flex-direction:row;gap:6px;align-items:baseline;}.ev.short.svelte-16enfn0 .t:where(.svelte-16enfn0) {flex:0 1 auto;min-width:2.5em;}.ev.short.svelte-16enfn0 .when:where(.svelte-16enfn0) {flex:0 100 auto;min-width:0;}.ev.ro.svelte-16enfn0 {cursor:default;}.ev.free.svelte-16enfn0 {background:color-mix(in srgb, var(--c) 10%, var(--bg));}.ev.cancel.svelte-16enfn0 .t:where(.svelte-16enfn0), .bar.cancel.svelte-16enfn0 {text-decoration:line-through;opacity:0.7;}.ev.ghosted.svelte-16enfn0 {opacity:0.35;}.t.svelte-16enfn0 {font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}.when.svelte-16enfn0, .loc.svelte-16enfn0 {color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}.grip.svelte-16enfn0 {position:absolute;left:0;right:0;bottom:0;height:7px;cursor:ns-resize;}.slot-ghost.svelte-16enfn0 {z-index:4;pointer-events:none;box-shadow:var(--shadow-md, 0 4px 16px rgba(0,0,0,.25));background:color-mix(in srgb, var(--c) 40%, var(--bg));}.now.svelte-16enfn0 {position:absolute;left:-1px;right:0;height:2px;background:var(--red);z-index:5;pointer-events:none;}.now.svelte-16enfn0::before {content:\"\";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--red);}\n  @media (prefers-reduced-motion: no-preference) {.ev.svelte-16enfn0 {transition:opacity 120ms var(--ease);} }"
};
function tt(e, t) {
	D(t, !0), n(e, et);
	let r = G(void 0), i = G(void 0), o = U(() => t.days.map((e) => de(t.cal.events, e))), s = U(() => oe(t.cal.events, t.days)), l = U(() => Math.max(1, ...W(s).map((e) => e.row + 1))), f = Array.from({ length: 24 }, (e, t) => t), p = (e) => e === 0 ? "" : t.cal.h12 ? new Date(2e3, 0, 1, e).toLocaleTimeString(void 0, {
		hour: "numeric",
		hour12: !0
	}) : String(e).padStart(2, "0"), g = U(() => t.cal.now.getHours() * 60 + t.cal.now.getMinutes()), y = (e) => t.selected !== null && t.selected.uid === e.uid && t.selected.rid === e.rid && t.selected.calendar === e.calendar, b = (e) => e.color ?? t.cal.colorOf(e.calendar);
	a(() => {
		let e = Number(t.cal.settings.day_start ?? 8), n = t.days.some((e) => me(e, t.cal.now)) ? Math.max(0, W(g) / 60 - 2) : e;
		W(r) && (W(r).scrollTop = Math.max(0, n * 48 - 8));
	});
	let C = G(null), w = (e) => Math.round(e / 15) * 15;
	function T(e) {
		let n = W(i).getBoundingClientRect();
		return {
			day: Math.min(t.days.length - 1, Math.max(0, Math.floor((e.clientX - n.left) / n.width * t.days.length))),
			min: Math.min(1440, Math.max(0, (e.clientY - n.top) / 48 * 60))
		};
	}
	function E(e, t, n, r = 0, i = 0) {
		if (e.button !== 0) return;
		e.stopPropagation();
		let a = T(e);
		if (t === "create") {
			let n = Math.floor(a.min / 15) * 15;
			I(C, {
				kind: t,
				day: a.day,
				from: n,
				to: n + 60,
				grab: n,
				x0: e.clientX,
				y0: e.clientY,
				moved: !1,
				len: 60
			}, !0);
		} else I(C, {
			kind: t,
			e: n,
			day: a.day,
			from: r,
			to: i,
			grab: a.min - r,
			x0: e.clientX,
			y0: e.clientY,
			moved: !1,
			len: i - r
		}, !0);
		e.currentTarget.setPointerCapture?.(e.pointerId), document.body.style.userSelect = "none";
	}
	function ee(e) {
		if (!W(C) || !W(C).moved && Math.hypot(e.clientX - W(C).x0, e.clientY - W(C).y0) < 4) return;
		let t = T(e), n = W(C);
		if (n.moved = !0, n.kind === "create") {
			let e = w(t.min);
			[n.from, n.to] = e >= n.grab ? [n.grab, Math.max(n.grab + 15, e)] : [e, n.grab + 15];
		} else if (n.kind === "move") {
			let e = w(t.min - n.grab);
			n.day = t.day, n.from = Math.max(0, Math.min(1425, e)), n.to = n.from + n.len;
		} else n.to = Math.max(n.from + 15, w(t.min));
		I(C, { ...n }, !0);
	}
	async function te(e) {
		let n = W(C);
		if (I(C, null), document.body.style.userSelect = "", !n) return;
		let r = (e, n) => new Date(t.days[e].getFullYear(), t.days[e].getMonth(), t.days[e].getDate(), 0, n);
		if (n.kind === "create") {
			let e = W(i).getBoundingClientRect(), a = e.width / t.days.length;
			t.oncreate(r(n.day, n.from), r(n.day, n.to), !1, new DOMRect(e.left + n.day * a, e.top + n.from / 60 * 48, a, (n.to - n.from) / 60 * 48));
			return;
		}
		let a = (e.target.closest(".ev") ?? e.target).getBoundingClientRect(), o = n.e;
		if (!n.moved) {
			t.onselect(o, a);
			return;
		}
		if (!o.writable) {
			t.cal.toast(`${o.calendar_name || "This calendar"} is read-only`, "error");
			return;
		}
		let s = r(n.day, n.from), c = r(n.day, n.to), l = await t.cal.askScope(o, n.kind === "move" ? "Move" : "Change");
		if (!l) return;
		let u = (e) => String(e).padStart(2, "0"), d = (e) => `${e.getFullYear()}-${u(e.getMonth() + 1)}-${u(e.getDate())}T${u(e.getHours())}:${u(e.getMinutes())}`;
		await t.cal.change(o, {
			start: d(s),
			end: d(c),
			from_start: o.start
		}, l, n.kind === "move" ? "Moved" : "Resized");
	}
	function j(e) {
		W(C) && e.key === "Escape" && (I(C, null), document.body.style.userSelect = "", e.stopPropagation());
	}
	function M(e, n) {
		if (e.target.closest(".bar")) return;
		let r = t.days[n];
		t.oncreate(k(r), O(k(r), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var N = $e();
	fe("keydown", ce, j);
	let F;
	var L = J(N), re = J(L);
	re.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ");
	var B = Y(re, 2);
	x(B, 17, () => t.days, c, (e, n) => {
		var r = He();
		let i;
		var a = J(r), o = H(a, !0), s = Y(a, 2), c = H(s, !0);
		Z(r), z((e, t, n) => {
			i = Q(r, 1, "dayhead svelte-16enfn0", null, i, { today: e }), d(o, t), d(c, n);
		}, [
			() => me(W(n), t.cal.now),
			() => W(n).toLocaleDateString(void 0, { weekday: "short" }),
			() => W(n).getDate()
		]), P("click", r, () => t.cal.go(W(n), "day")), u(e, r);
	}), Z(L);
	var ie = Y(L, 2);
	let ae;
	var se = Y(J(ie), 2), K = J(se);
	x(K, 17, () => t.days, c, (e, t, n) => {
		var r = Ue();
		_(r, "", {}, { "grid-column": n + 1 }), P("click", r, (e) => M(e, n)), P("keydown", r, () => {}), u(e, r);
	});
	var le = Y(K, 2);
	x(le, 17, () => W(s), (e) => e.e.calendar + e.e.uid + (e.e.rid ?? "") + e.from, (e, n) => {
		var r = Ge();
		let i, a;
		var o = J(r), s = (e) => {
			var t = We();
			u(e, t);
		}, c = U(() => R(W(n).e));
		S(o, (e) => {
			W(c) && e(s);
		});
		var l = Y(o, 1, !0);
		Z(r), z((e, t) => {
			i = Q(r, 1, "bar ev svelte-16enfn0", null, i, {
				sel: e,
				clipl: W(n).clippedStart,
				clipr: W(n).clippedEnd,
				cancel: W(n).e.status === "CANCELLED"
			}), m(r, "title", W(n).e.summary), a = _(r, "", a, {
				"--c": t,
				"grid-column": `${W(n).from + 1} / ${W(n).to + 2}`,
				"grid-row": W(n).row + 1
			}), d(l, W(n).e.summary || "(no title)");
		}, [() => y(W(n).e), () => b(W(n).e)]), P("click", r, (e) => t.onselect(W(n).e, e.currentTarget.getBoundingClientRect())), u(e, r);
	}), Z(se), Z(ie);
	var ue = Y(ie, 2), q = J(ue), pe = J(q);
	x(pe, 20, () => f, (e) => e, (e, t) => {
		var n = Ke();
		let r;
		var i = H(n, !0);
		z((e) => {
			r = _(n, "", r, { top: `${t * 48}px` }), d(i, e);
		}, [() => p(t)]), u(e, n);
	}), Z(pe);
	var X = Y(pe, 2);
	x(X, 21, () => t.days, c, (e, n, r) => {
		var i = Qe();
		let a;
		var s = J(i);
		x(s, 17, () => W(o)[r], (e) => e.e.calendar + e.e.uid + (e.e.rid ?? ""), (e, n) => {
			let r = U(() => W(n).bottom - W(n).top < 40);
			var i = Ye();
			let a, o;
			var s = J(i), c = H(s, !0), l = Y(s, 2), f = H(l), p = Y(l, 2), h = (e) => {
				var t = qe(), r = H(t, !0);
				z(() => d(r, W(n).e.location)), u(e, t);
			};
			S(p, (e) => {
				!W(r) && W(n).e.location && e(h);
			});
			var g = Y(p, 2), x = (e) => {
				var t = Je();
				P("pointerdown", t, (e) => E(e, "resize", W(n).e, W(n).top, W(n).bottom)), u(e, t);
			};
			S(g, (e) => {
				W(n).e.writable && !W(n).endsAfter && e(x);
			}), Z(i), z((e, t, s, l, u, p) => {
				a = Q(i, 1, "ev svelte-16enfn0", null, a, {
					sel: e,
					short: W(r),
					ro: !W(n).e.writable,
					cancel: W(n).e.status === "CANCELLED",
					free: W(n).e.free,
					ghosted: W(C)?.e === W(n).e && W(C).moved
				}), m(i, "aria-label", `${W(n).e.summary ?? ""}, ${t ?? ""}`), o = _(i, "", o, {
					"--c": s,
					top: `${W(n).top / 60 * 48}px`,
					height: l,
					left: `calc(${W(n).col / W(n).cols * 100}% + 1px)`,
					width: `calc(${1 / W(n).cols * 100}% - 3px)`
				}), d(c, W(n).e.summary || "(no title)"), d(f, `${u ?? ""}${p ?? ""}`);
			}, [
				() => y(W(n).e),
				() => v(V(W(n).e), t.cal.h12),
				() => b(W(n).e),
				() => `${Math.max(14, (W(n).bottom - W(n).top) / 60 * 48 - 2)}px`,
				() => v(V(W(n).e), t.cal.h12),
				() => W(r) ? "" : ` – ${v(A(W(n).e), t.cal.h12)}`
			]), P("pointerdown", i, (e) => W(n).startsBefore || W(n).endsAfter ? e.stopPropagation() : E(e, "move", W(n).e, W(n).top, W(n).bottom)), P("click", i, (e) => {
				(W(n).startsBefore || W(n).endsAfter) && t.onselect(W(n).e, e.currentTarget.getBoundingClientRect());
			}), P("keydown", i, (e) => {
				e.key === "Enter" && t.onselect(W(n).e, e.currentTarget.getBoundingClientRect());
			}), u(e, i);
		});
		var c = Y(s, 2), l = (e) => {
			var n = Xe();
			let r;
			var i = J(n), a = H(i, !0), o = Y(i, 2), s = H(o);
			Z(n), z((e, t, i) => {
				r = _(n, "", r, {
					"--c": e,
					top: `${W(C).from / 60 * 48}px`,
					height: `${(W(C).to - W(C).from) / 60 * 48 - 2}px`,
					left: "1px",
					width: "calc(100% - 3px)"
				}), d(a, W(C).e?.summary ?? "New event"), d(s, `${t ?? ""} – ${i ?? ""}`);
			}, [
				() => W(C).e ? b(W(C).e) : "var(--accent)",
				() => v(new Date(2e3, 0, 1, 0, W(C).from), t.cal.h12),
				() => v(new Date(2e3, 0, 1, 0, W(C).to), t.cal.h12)
			]), u(e, n);
		};
		S(c, (e) => {
			W(C) && W(C).moved && W(C).day === r && e(l);
		});
		var f = Y(c, 2), p = (e) => {
			var t = Ze();
			let n;
			z(() => n = _(t, "", n, { top: `${W(g) / 60 * 48}px` })), u(e, t);
		}, h = U(() => me(W(n), t.cal.now));
		S(f, (e) => {
			W(h) && e(p);
		}), Z(i), z((e, t) => a = Q(i, 1, "col svelte-16enfn0", null, a, {
			today: e,
			weekend: t
		}), [() => me(W(n), t.cal.now), () => W(n).getDay() === 0 || W(n).getDay() === 6]), P("pointerdown", i, (e) => E(e, "create")), u(e, i);
	}), Z(X), h(X, (e) => I(i, e), () => W(i)), Z(q), Z(ue), h(ue, (e) => I(r, e), () => W(r)), Z(N), z(() => {
		F = _(N, "", F, {
			"--n": t.days.length,
			"--hour": "48px"
		}), ae = _(ie, "", ae, { "--rows": W(l) });
	}), P("pointermove", X, ee), P("pointerup", X, te), fe("pointercancel", X, () => I(C, null)), u(e, N), ne();
}
e([
	"click",
	"keydown",
	"pointermove",
	"pointerup",
	"pointerdown"
]);
//#endregion
//#region plugins/stable/dav/ui/src/MonthView.svelte
var nt = C("<div class=\"wd svelte-13jyj5s\"> </div>"), rt = C("<div role=\"button\" tabindex=\"-1\"><button class=\"num svelte-13jyj5s\" title=\"Open this day\"> </button></div>"), it = C("<button> </button>"), at = C("<button><span class=\"dot svelte-13jyj5s\" aria-hidden=\"true\"></span><span class=\"tm svelte-13jyj5s\"> </span><span class=\"tt svelte-13jyj5s\"> </span></button>"), ot = C("<button class=\"more svelte-13jyj5s\"> </button>"), st = C("<!> <!>", 1), ct = C("<div class=\"week svelte-13jyj5s\"><!> <!> <!></div>"), lt = C("<div class=\"month svelte-13jyj5s\"><div class=\"wds svelte-13jyj5s\"></div> <div class=\"weeks svelte-13jyj5s\"></div></div>"), ut = {
	hash: "svelte-13jyj5s",
	code: ".month.svelte-13jyj5s {display:grid;grid-template-rows:auto 1fr;height:100%;min-height:0;}.wds.svelte-13jyj5s {display:grid;grid-template-columns:repeat(7, 1fr);border-bottom:1px solid var(--border);}.wd.svelte-13jyj5s {padding:6px 8px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-faint);}.weeks.svelte-13jyj5s {display:grid;grid-template-rows:repeat(var(--rows), minmax(96px, 1fr));min-height:0;overflow-y:auto;}.week.svelte-13jyj5s {display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));grid-template-rows:26px repeat(4, 21px) 1fr;row-gap:1px;border-bottom:1px solid var(--border);position:relative;min-height:0;}.cell.svelte-13jyj5s {grid-row:1 / -1;border-left:1px solid var(--border);padding:2px 4px;cursor:cell;min-width:0;}.cell.svelte-13jyj5s:first-child {border-left:0;}.cell.weekend.svelte-13jyj5s {background:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.cell.other.svelte-13jyj5s {background:color-mix(in srgb, var(--bg-alt) 90%, transparent);}.cell.other.svelte-13jyj5s .num:where(.svelte-13jyj5s) {color:var(--text-faint);}.num.svelte-13jyj5s {all:unset;cursor:pointer;font-size:0.82em;font-weight:600;color:var(--text-muted);padding:1px 6px;border-radius:999px;font-variant-numeric:tabular-nums;}.num.svelte-13jyj5s:hover {background:var(--bg-hover);color:var(--text);}.today.svelte-13jyj5s .num:where(.svelte-13jyj5s) {background:var(--accent);color:var(--accent-fg);}.num.svelte-13jyj5s:focus-visible, .bar.svelte-13jyj5s:focus-visible, .line.svelte-13jyj5s:focus-visible, .more.svelte-13jyj5s:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.bar.svelte-13jyj5s, .line.svelte-13jyj5s, .more.svelte-13jyj5s {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;min-width:0;font-size:0.8em;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.bar.svelte-13jyj5s {margin:0 3px;padding:0 7px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));border-left:3px solid var(--c);color:var(--text);}.bar.clipl.svelte-13jyj5s {margin-left:0;border-top-left-radius:0;border-bottom-left-radius:0;}.bar.clipr.svelte-13jyj5s {margin-right:0;border-top-right-radius:0;border-bottom-right-radius:0;}.line.svelte-13jyj5s {display:flex;align-items:center;gap:5px;margin:0 3px;padding:0 4px;border-radius:var(--radius-sm);color:var(--text);}.line.svelte-13jyj5s:hover, .bar.svelte-13jyj5s:hover {background:color-mix(in srgb, var(--c) 18%, var(--bg-hover));}.sel.svelte-13jyj5s {outline:2px solid var(--c);outline-offset:-1px;}.cancel.svelte-13jyj5s .tt:where(.svelte-13jyj5s) {text-decoration:line-through;opacity:0.7;}.dot.svelte-13jyj5s {width:7px;height:7px;border-radius:50%;background:var(--c);flex:none;}.tm.svelte-13jyj5s {color:var(--text-muted);font-variant-numeric:tabular-nums;flex:none;}.tt.svelte-13jyj5s {overflow:hidden;text-overflow:ellipsis;min-width:0;}.more.svelte-13jyj5s {margin:0 3px;padding:0 6px;color:var(--text-muted);font-weight:600;border-radius:var(--radius-sm);}.more.svelte-13jyj5s:hover {background:var(--bg-hover);color:var(--text);}\n  @container (max-width: 760px) {.tm.svelte-13jyj5s {display:none;} }"
};
function dt(e, t) {
	D(t, !0), n(e, ut);
	let r = U(() => Array.from({ length: Math.ceil(t.days.length / 7) }, (e, n) => t.days.slice(n * 7, n * 7 + 7))), i = U(() => t.cal.cursor.getMonth()), a = (e) => e.color ?? t.cal.colorOf(e.calendar), o = (e) => t.selected !== null && t.selected.uid === e.uid && t.selected.rid === e.rid && t.selected.calendar === e.calendar, s = (e) => e.calendar + e.uid + (e.rid ?? "");
	function l(e) {
		let n = oe(t.cal.events, e), r = Math.min(4, Math.max(0, ...n.map((e) => e.row + 1))), i = n.filter((e) => e.row < 4 - !!n.some((e) => e.row >= 4));
		return {
			bars: i,
			used: r,
			cells: e.map((e, a) => {
				let o = le(t.cal.events, e).filter((e) => !F(e)).sort((e, t) => V(e).getTime() - V(t).getTime()), s = n.filter((e) => e.from <= a && e.to >= a), c = s.filter((e) => !i.includes(e)).length, l = Math.max(0, 4 - r - 1), u = o.length + c <= l + 1 ? o.slice(0, l + 1) : o.slice(0, l);
				return {
					timed: u,
					more: o.length - u.length + c,
					total: o.length + s.length
				};
			})
		};
	}
	function f(e, n) {
		e.target.closest("button") || t.oncreate(k(n), O(k(n), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var p = lt();
	let h;
	var g = J(p);
	x(g, 21, () => W(r)[0] ?? [], (e) => e.getDay(), (e, t) => {
		var n = nt(), r = H(n, !0);
		z((e) => d(r, e), [() => W(t).toLocaleDateString(void 0, { weekday: "short" })]), u(e, n);
	}), Z(g);
	var y = Y(g, 2);
	x(y, 21, () => W(r), c, (e, n) => {
		let r = U(() => l(W(n)));
		var p = ct(), h = J(p);
		x(h, 17, () => W(n), c, (e, n, r) => {
			var a = rt();
			let o;
			_(a, "", {}, { "grid-column": r + 1 });
			var s = J(a), c = H(s, !0);
			Z(a), z((e, t, n, r, i) => {
				o = Q(a, 1, "cell svelte-13jyj5s", null, o, {
					other: e,
					today: t,
					weekend: n
				}), m(a, "aria-label", `New event on ${r ?? ""}`), d(c, i);
			}, [
				() => W(n).getMonth() !== W(i),
				() => me(W(n), t.cal.now),
				() => W(n).getDay() === 0 || W(n).getDay() === 6,
				() => W(n).toLocaleDateString(),
				() => W(n).getDate() === 1 ? W(n).toLocaleDateString(void 0, {
					day: "numeric",
					month: "short"
				}) : W(n).getDate()
			]), P("click", a, (e) => f(e, W(n))), P("keydown", a, () => {}), P("click", s, () => t.cal.go(W(n), "day")), u(e, a);
		});
		var g = Y(h, 2);
		x(g, 17, () => W(r).bars, (e) => s(e.e) + e.from, (e, n) => {
			var r = it();
			let i, s;
			var c = H(r, !0);
			z((e, t) => {
				i = Q(r, 1, "bar svelte-13jyj5s", null, i, {
					sel: e,
					clipl: W(n).clippedStart,
					clipr: W(n).clippedEnd
				}), m(r, "title", W(n).e.summary), s = _(r, "", s, {
					"--c": t,
					"grid-column": `${W(n).from + 1} / ${W(n).to + 2}`,
					"grid-row": W(n).row + 2
				}), d(c, W(n).e.summary || "(no title)");
			}, [() => o(W(n).e), () => a(W(n).e)]), P("click", r, (e) => t.onselect(W(n).e, e.currentTarget.getBoundingClientRect())), u(e, r);
		});
		var y = Y(g, 2);
		x(y, 17, () => W(r).cells, c, (e, i, c) => {
			var l = st(), f = j(l);
			x(f, 19, () => W(i).timed, (e) => s(e), (e, n, i) => {
				var s = at();
				let l, f;
				var p = Y(J(s)), h = H(p, !0), g = Y(p), y = H(g, !0);
				Z(s), z((e, t, a, o) => {
					l = Q(s, 1, "line svelte-13jyj5s", null, l, {
						sel: e,
						cancel: W(n).status === "CANCELLED"
					}), m(s, "title", `${t ?? ""} ${W(n).summary ?? ""}`), f = _(s, "", f, {
						"--c": a,
						"grid-column": c + 1,
						"grid-row": W(r).used + 2 + W(i)
					}), d(h, o), d(y, W(n).summary || "(no title)");
				}, [
					() => o(W(n)),
					() => v(V(W(n)), t.cal.h12),
					() => a(W(n)),
					() => v(V(W(n)), t.cal.h12)
				]), P("click", s, (e) => t.onselect(W(n), e.currentTarget.getBoundingClientRect())), u(e, s);
			});
			var p = Y(f, 2), h = (e) => {
				var a = ot();
				let o;
				var s = H(a);
				z(() => {
					o = _(a, "", o, {
						"grid-column": c + 1,
						"grid-row": W(r).used + 2 + W(i).timed.length
					}), d(s, `+${W(i).more ?? ""} more`);
				}), P("click", a, () => t.cal.go(W(n)[c], "day")), u(e, a);
			};
			S(p, (e) => {
				W(i).more > 0 && e(h);
			}), u(e, l);
		}), Z(p), u(e, p);
	}), Z(y), Z(p), z(() => h = _(p, "", h, { "--rows": W(r).length })), u(e, p), ne();
}
e(["click", "keydown"]);
//#endregion
//#region plugins/stable/dav/ui/src/AgendaView.svelte
var ft = C("<div class=\"empty svelte-zo3qq8\"> </div>"), pt = C("<span class=\"loc svelte-zo3qq8\"> </span>"), mt = C("<span class=\"ic svelte-zo3qq8\" title=\"Repeats\"><!></span>"), ht = C("<span class=\"ic svelte-zo3qq8\" title=\"From a note\"><!></span>"), gt = C("<li><button><span class=\"dot svelte-zo3qq8\" aria-hidden=\"true\"></span> <span class=\"time svelte-zo3qq8\"> </span> <span class=\"what svelte-zo3qq8\"> <!></span> <!> <!> <span class=\"cal svelte-zo3qq8\"> </span></button></li>"), _t = C("<section><button class=\"date svelte-zo3qq8\" title=\"Open this day\"><span class=\"n svelte-zo3qq8\"> </span> <span class=\"w svelte-zo3qq8\"> <br/> </span></button> <ul class=\"svelte-zo3qq8\"></ul></section>"), vt = C("<div class=\"agenda svelte-zo3qq8\"><!> <!></div>"), yt = {
	hash: "svelte-zo3qq8",
	code: ".agenda.svelte-zo3qq8 {height:100%;overflow-y:auto;padding:6px 0 40px;}.empty.svelte-zo3qq8 {padding:40px;text-align:center;color:var(--text-faint);}.day.svelte-zo3qq8 {display:grid;grid-template-columns:92px 1fr;gap:8px;padding:6px 14px;border-bottom:1px solid var(--border);}.date.svelte-zo3qq8 {all:unset;cursor:pointer;display:flex;gap:8px;align-items:flex-start;padding:4px 0;color:var(--text-muted);}.n.svelte-zo3qq8 {font-size:1.5em;font-weight:650;color:var(--heading);min-width:1.6em;text-align:right;font-variant-numeric:tabular-nums;line-height:1.1;}.w.svelte-zo3qq8 {font-size:0.75em;text-transform:uppercase;letter-spacing:0.04em;line-height:1.35;}.today.svelte-zo3qq8 .n:where(.svelte-zo3qq8) {color:var(--accent-strong);}.date.svelte-zo3qq8:focus-visible, .row.svelte-zo3qq8:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}ul.svelte-zo3qq8 {list-style:none;margin:0;padding:0;display:grid;gap:1px;min-width:0;}.row.svelte-zo3qq8 {all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border-radius:var(--radius-sm);min-width:0;}.row.svelte-zo3qq8:hover {background:var(--bg-hover);}.row.sel.svelte-zo3qq8 {background:color-mix(in srgb, var(--c) 16%, var(--bg));}.dot.svelte-zo3qq8 {width:9px;height:9px;border-radius:50%;background:var(--c);flex:none;}.time.svelte-zo3qq8 {flex:none;width:11.5em;white-space:nowrap;color:var(--text-muted);font-variant-numeric:tabular-nums;font-size:0.9em;}.what.svelte-zo3qq8 {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.loc.svelte-zo3qq8 {color:var(--text-muted);}.cancel.svelte-zo3qq8 .what:where(.svelte-zo3qq8) {text-decoration:line-through;opacity:0.7;}.ic.svelte-zo3qq8 {color:var(--text-faint);flex:none;}.cal.svelte-zo3qq8 {flex:none;color:var(--text-faint);font-size:0.8em;max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n  @container (max-width: 560px) {.day.svelte-zo3qq8 {grid-template-columns:1fr;gap:0;padding:6px 10px;}.date.svelte-zo3qq8 {padding-bottom:0;}.time.svelte-zo3qq8 {width:auto;min-width:5.5em;}.cal.svelte-zo3qq8 {display:none;}\n  }"
};
function bt(e, t) {
	D(t, !0), n(e, yt);
	let r = i(t, "search", 3, !1), a = U(() => {
		if (r()) {
			let e = /* @__PURE__ */ new Map();
			for (let n of t.events) {
				let t = k(V(n)).getTime();
				e.set(t, [...e.get(t) ?? [], n]);
			}
			return [...e.entries()].map(([e, t]) => ({
				day: new Date(e),
				evs: t
			}));
		}
		let e = [];
		for (let n = t.from; n <= t.to; n = O(n, 1)) {
			let r = le(t.events, n).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || V(e).getTime() - V(t).getTime());
			r.length && e.push({
				day: n,
				evs: r
			});
		}
		return e;
	}), o = (e) => e.color ?? t.cal.colorOf(e.calendar), s = (e) => t.selected !== null && t.selected.uid === e.uid && t.selected.rid === e.rid && t.selected.calendar === e.calendar;
	function c(e, n) {
		if (e.all_day) return "All day";
		let r = V(e), i = A(e);
		return `${me(r, n) ? v(r, t.cal.h12) : "…"} – ${me(i, n) || i.getTime() - k(n).getTime() <= 864e5 && i.getHours() === 0 && i.getMinutes() === 0 ? v(i, t.cal.h12) : "…"}`;
	}
	var l = vt(), f = J(l), p = (e) => {
		var t = ft(), n = H(t, !0);
		z(() => d(n, r() ? "No event matches." : "Nothing in the coming days.")), u(e, t);
	};
	S(f, (e) => {
		W(a).length || e(p);
	});
	var m = Y(f, 2);
	x(m, 17, () => W(a), (e) => e.day.getTime(), (e, n) => {
		var r = _t();
		let i;
		var a = J(r), l = J(a), f = H(l, !0), p = Y(l, 2), m = J(p, !0), h = Y(m, 2, !0);
		Z(p), Z(a);
		var g = Y(a, 2);
		x(g, 21, () => W(n).evs, (e) => e.calendar + e.uid + (e.rid ?? ""), (e, r) => {
			var i = gt(), a = J(i);
			let l, f;
			var p = Y(J(a), 2), m = H(p, !0), h = Y(p, 2), g = J(h, !0), v = Y(g), y = (e) => {
				var t = pt(), n = H(t);
				z(() => d(n, ` · ${W(r).location ?? ""}`)), u(e, t);
			};
			S(v, (e) => {
				W(r).location && e(y);
			}), Z(h);
			var b = Y(h, 2), x = (e) => {
				var t = mt();
				$(J(t), {
					name: "repeat",
					size: 13
				}), Z(t), u(e, t);
			};
			S(b, (e) => {
				W(r).recurring && e(x);
			});
			var C = Y(b, 2), w = (e) => {
				var t = ht();
				$(J(t), {
					name: "note",
					size: 13
				}), Z(t), u(e, t);
			}, T = U(() => R(W(r)));
			S(C, (e) => {
				W(T) && e(w);
			});
			var E = Y(C, 2), D = H(E, !0);
			Z(a), Z(i), z((e, t, n) => {
				l = Q(a, 1, "row svelte-zo3qq8", null, l, {
					sel: e,
					cancel: W(r).status === "CANCELLED"
				}), f = _(a, "", f, { "--c": t }), d(m, n), d(g, W(r).summary || "(no title)"), d(D, W(r).calendar_name);
			}, [
				() => s(W(r)),
				() => o(W(r)),
				() => c(W(r), W(n).day)
			]), P("click", a, (e) => t.onselect(W(r), e.currentTarget.getBoundingClientRect())), u(e, i);
		}), Z(g), Z(r), z((e, t, n, a) => {
			i = Q(r, 1, "day svelte-zo3qq8", null, i, { today: e }), d(f, t), d(m, n), d(h, a);
		}, [
			() => me(W(n).day, t.cal.now),
			() => W(n).day.getDate(),
			() => W(n).day.toLocaleDateString(void 0, { weekday: "short" }),
			() => W(n).day.toLocaleDateString(void 0, {
				month: "short",
				year: W(n).day.getFullYear() === t.cal.now.getFullYear() ? void 0 : "numeric"
			})
		]), P("click", a, () => t.cal.go(W(n).day, "day")), u(e, r);
	}), Z(l), u(e, l), ne();
}
e(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/YearView.svelte
var xt = C("<span class=\"h svelte-18a11kl\"> </span>"), St = C("<button> </button>"), Ct = C("<span></span>"), wt = C("<section><button class=\"mname svelte-18a11kl\"> </button> <div class=\"days svelte-18a11kl\"><!> <!></div></section>"), Tt = C("<div class=\"year svelte-18a11kl\"></div>"), Et = {
	hash: "svelte-18a11kl",
	code: ".year.svelte-18a11kl {height:100%;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(210px, 1fr));gap:18px 24px;padding:16px 20px 40px;align-content:start;}.mname.svelte-18a11kl {all:unset;cursor:pointer;font-weight:650;color:var(--heading);margin-bottom:6px;display:block;}.mname.svelte-18a11kl:hover {color:var(--accent-strong);}.days.svelte-18a11kl {display:grid;grid-template-columns:repeat(7, 1fr);gap:2px;}.h.svelte-18a11kl {font-size:0.7em;color:var(--text-faint);text-align:center;}.d.svelte-18a11kl {all:unset;cursor:pointer;text-align:center;font-size:0.78em;padding:3px 0;border-radius:var(--radius-sm);font-variant-numeric:tabular-nums;color:var(--text-muted);background:color-mix(in srgb, var(--accent) calc(var(--k) * 55%), transparent);}.d.svelte-18a11kl:hover {outline:1px solid var(--accent);}.d.svelte-18a11kl:focus-visible {outline:2px solid var(--accent);}.d.today.svelte-18a11kl {background:var(--accent);color:var(--accent-fg);font-weight:700;}"
};
function Dt(e, t) {
	D(t, !0), n(e, Et);
	let r = U(() => t.cal.cursor.getFullYear()), i = U(() => {
		let e = /* @__PURE__ */ new Map();
		for (let n = new Date(W(r), 0, 1); n.getFullYear() === W(r); n = O(n, 1)) e.set(n.toDateString(), le(t.cal.events, n).length);
		return e;
	}), a = U(() => Math.max(1, ...W(i).values()));
	function o(e) {
		let n = ge(new Date(W(r), e, 1), t.cal.first);
		return Array.from({ length: 42 }, (e, t) => O(n, t));
	}
	let s = U(() => Array.from({ length: 7 }, (e, n) => O(ge(/* @__PURE__ */ new Date(), t.cal.first), n).toLocaleDateString(void 0, { weekday: "narrow" })));
	var l = Tt();
	x(l, 20, () => Array.from({ length: 12 }, (e, t) => t), (e) => e, (e, n) => {
		var l = wt(), f = J(l), p = H(f, !0), h = Y(f, 2), g = J(h);
		x(g, 17, () => W(s), c, (e, t) => {
			var n = xt(), r = H(n, !0);
			z(() => d(r, W(t))), u(e, n);
		});
		var v = Y(g, 2);
		x(v, 17, () => o(n), (e) => e.getTime(), (e, r) => {
			let o = U(() => W(r).getMonth() === n ? W(i).get(W(r).toDateString()) ?? 0 : 0);
			var s = w(), c = j(s), l = (e) => {
				var n = St();
				let i, s;
				var c = H(n, !0);
				z((e, t, r) => {
					i = Q(n, 1, "d svelte-18a11kl", null, i, { today: e }), m(n, "title", `${t ?? ""}: ${W(o) ?? ""} event${W(o) === 1 ? "" : "s"}`), s = _(n, "", s, { "--k": W(o) / W(a) }), d(c, r);
				}, [
					() => me(W(r), t.cal.now),
					() => W(r).toLocaleDateString(),
					() => W(r).getDate()
				]), P("click", n, () => t.cal.go(W(r), "day")), u(e, n);
			}, f = U(() => W(r).getMonth() === n), p = (e) => {
				var t = Ct();
				u(e, t);
			};
			S(c, (e) => {
				W(f) ? e(l) : e(p, -1);
			}), u(e, s);
		}), Z(h), Z(l), z((e) => d(p, e), [() => new Date(W(r), n, 1).toLocaleDateString(void 0, { month: "long" })]), P("click", f, () => t.cal.go(new Date(W(r), n, 1), "month")), u(e, l);
	}), Z(l), u(e, l), ne();
}
e(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/CalendarPicker.svelte
var Ot = C("<option> </option>"), kt = C("<optgroup></optgroup>"), At = C("<span><span class=\"dot svelte-zssqw9\" aria-hidden=\"true\"></span> <select aria-label=\"Calendar\" class=\"svelte-zssqw9\"><!><!></select></span>"), jt = {
	hash: "svelte-zssqw9",
	code: ".pick.svelte-zssqw9 {display:inline-flex;align-items:center;gap:8px;min-width:0;flex:1;}.pick.compact.svelte-zssqw9 {flex:0 1 auto;}.dot.svelte-zssqw9 {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}select.svelte-zssqw9 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 28px 5px 8px;min-width:0;flex:1;color-scheme:light dark;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.compact.svelte-zssqw9 select:where(.svelte-zssqw9) {flex:0 1 auto;max-width:16em;}select.svelte-zssqw9:disabled {opacity:0.6;}select.svelte-zssqw9:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}"
};
function Mt(e, t) {
	D(t, !0), n(e, jt);
	let r = i(t, "value", 15), a = i(t, "disabled", 3, !1), s = i(t, "compact", 3, !1), c = U(() => t.cal.byAccount(!0)), f = U(() => W(c).length > 1), p = (e) => t.cal.sources.find((t) => t.id === e)?.name ?? e;
	var h = At();
	let g;
	var v = J(h);
	let y;
	var b = Y(v, 2), C = J(b), T = (e) => {
		var t = Ot(), n = H(t, !0), i = {};
		z((e) => {
			d(n, e), i !== (i = r()) && (t.value = (t.__value = i) ?? "");
		}, [() => p(r())]), u(e, t);
	}, E = U(() => r() && !W(c).some((e) => e.items.some((e) => e.id === r())));
	S(C, (e) => {
		W(E) && e(T);
	});
	var O = Y(C);
	x(O, 17, () => W(c), (e) => e.account.name, (e, t) => {
		var n = w(), r = j(n), i = (e) => {
			var n = kt();
			x(n, 21, () => W(t).items, (e) => e.id, (e, t) => {
				var n = Ot(), r = H(n, !0), i = {};
				z(() => {
					d(r, W(t).name), i !== (i = W(t).id) && (n.value = (n.__value = i) ?? "");
				}), u(e, n);
			}), Z(n), z(() => m(n, "label", W(t).account.name)), u(e, n);
		}, a = (e) => {
			var n = w(), r = j(n);
			x(r, 17, () => W(t).items, (e) => e.id, (e, t) => {
				var n = Ot(), r = H(n, !0), i = {};
				z(() => {
					d(r, W(t).name), i !== (i = W(t).id) && (n.value = (n.__value = i) ?? "");
				}), u(e, n);
			}), u(e, n);
		};
		S(r, (e) => {
			W(f) ? e(i) : e(a, -1);
		}), u(e, n);
	}), Z(b), l(b), Z(h), z((e) => {
		g = Q(h, 1, "pick svelte-zssqw9", null, g, { compact: s() }), y = _(v, "", y, { "--c": e }), b.disabled = a(), m(b, "title", r());
	}, [() => r() ? t.cal.colorOf(r()) : "transparent"]), o(b, r), u(e, h), ne();
}
//#endregion
//#region plugins/stable/dav/ui/src/Popover.svelte
var Nt = C("<button class=\"tool svelte-id2g6u\" title=\"Edit (e)\"><!></button> <button class=\"tool svelte-id2g6u\" title=\"Delete (Del)\"><!></button>", 1), Pt = C("<p class=\"sub svelte-id2g6u\"><!> </p>"), Ft = C("<p class=\"sub warn svelte-id2g6u\">Cancelled</p>"), It = C("<a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a>"), Lt = C("<p class=\"line svelte-id2g6u\"><!><!></p>"), Rt = C("<li> <span class=\"faint svelte-id2g6u\">organiser</span></li>"), zt = C("<li> <span> </span></li>"), Bt = C("<li class=\"faint svelte-id2g6u\"> </li>"), Vt = C("<div class=\"line people svelte-id2g6u\"><!> <ul class=\"svelte-id2g6u\"><!> <!> <!></ul></div>"), Ht = C("<p class=\"line desc svelte-id2g6u\"><!><span class=\"svelte-id2g6u\"> </span></p>"), Ut = C("<button class=\"atlas-btn svelte-id2g6u\"><!>Open the note</button>"), Wt = C("<p class=\"line svelte-id2g6u\"><!><a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a></p>"), Gt = C("<div class=\"bar svelte-id2g6u\"><!> <button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <div class=\"head svelte-id2g6u\"><span class=\"sq svelte-id2g6u\"></span> <div><h2> </h2> <p class=\"when svelte-id2g6u\"> </p> <!> <!></div></div> <!> <!> <!> <p class=\"line faint svelte-id2g6u\"><!> </p> <!> <!>", 1), Kt = C("<div class=\"bar svelte-id2g6u\"><button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <input class=\"title svelte-id2g6u\" placeholder=\"Add a title\" aria-label=\"Title\"/> <p class=\"when svelte-id2g6u\"> </p> <div class=\"line faint svelte-id2g6u\"><!><!></div> <div class=\"acts svelte-id2g6u\"><button class=\"atlas-btn svelte-id2g6u\">More options</button> <button class=\"atlas-btn primary svelte-id2g6u\">Save</button></div>", 1), qt = C("<div class=\"pop svelte-id2g6u\" role=\"dialog\"><!></div>"), Jt = {
	hash: "svelte-id2g6u",
	code: ".pop.svelte-id2g6u {position:absolute;z-index:50;width:min(360px, calc(100% - 16px));box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:8px 14px 14px;display:grid;gap:8px; animation: svelte-id2g6u-in 120ms var(--ease);}\n  @keyframes svelte-id2g6u-in { from { opacity: 0; transform: translateY(4px); } }\n  @media (prefers-reduced-motion: reduce) {.pop.svelte-id2g6u { animation: none;} }.bar.svelte-id2g6u {display:flex;justify-content:flex-end;gap:2px;margin:0 -8px -4px 0;}.tool.svelte-id2g6u {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-id2g6u:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-id2g6u:focus-visible {outline:2px solid var(--accent);}.head.svelte-id2g6u {display:flex;gap:12px;align-items:flex-start;}.sq.svelte-id2g6u {width:14px;height:14px;border-radius:4px;background:var(--c);flex:none;margin-top:5px;}h2.svelte-id2g6u {margin:0;font-size:1.15em;font-weight:600;color:var(--heading);overflow-wrap:anywhere;}.cancel.svelte-id2g6u {text-decoration:line-through;}.when.svelte-id2g6u {margin:2px 0 0;color:var(--text-muted);font-size:0.92em;}.sub.svelte-id2g6u {margin:2px 0 0;color:var(--text-faint);font-size:0.85em;display:flex;align-items:center;gap:4px;}.warn.svelte-id2g6u {color:var(--red);}.line.svelte-id2g6u {margin:0;display:flex;gap:10px;align-items:flex-start;color:var(--text);font-size:0.9em;min-width:0;overflow-wrap:anywhere;}.line.svelte-id2g6u .icon {margin-top:2px;color:var(--text-faint);}.desc.svelte-id2g6u span:where(.svelte-id2g6u) {white-space:pre-wrap;max-height:9em;overflow:auto;}.people.svelte-id2g6u ul:where(.svelte-id2g6u) {list-style:none;margin:0;padding:0;display:grid;gap:2px;}.faint.svelte-id2g6u {color:var(--text-faint);}.ps.svelte-id2g6u {font-size:0.8em;color:var(--text-faint);}.ps-accepted.svelte-id2g6u {color:var(--green);}.ps-declined.svelte-id2g6u {color:var(--red);}.ps-tentative.svelte-id2g6u {color:var(--yellow);}a.svelte-id2g6u {color:var(--accent);}.atlas-btn.svelte-id2g6u {display:inline-flex;align-items:center;gap:6px;justify-self:start;}.title.svelte-id2g6u {all:unset;font-size:1.15em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--accent);padding:4px 0;}.title.svelte-id2g6u::placeholder {color:var(--text-faint);font-weight:400;}.acts.svelte-id2g6u {display:flex;justify-content:flex-end;gap:8px;}"
};
function Yt(e, t) {
	D(t, !0), n(e, Jt);
	let r = i(t, "e", 3, null), o = i(t, "draft", 3, null), s = G(void 0), c = G(""), l = G(N(t.cal.newCalendar() ?? "")), f = G(void 0), y = G(N({
		left: 0,
		top: 0
	}));
	function b() {
		let e = W(s)?.offsetWidth ?? 340, n = W(s)?.offsetHeight ?? 200, r = t.at.right - t.box.left + 8;
		r + e > t.box.width - 8 && (r = t.at.left - t.box.left - e - 8), r < 8 && (r = Math.max(8, Math.min(t.box.width - e - 8, t.at.left - t.box.left)));
		let i = t.at.top - t.box.top;
		i + n > t.box.height - 8 && (i = Math.max(8, t.box.height - n - 8)), I(y, {
			left: r,
			top: Math.max(8, i)
		}, !0);
	}
	a(() => {
		b(), W(f)?.focus();
	});
	async function C() {
		if (!o()) return;
		let e = (e) => String(e).padStart(2, "0"), n = (t) => `${t.getFullYear()}-${e(t.getMonth() + 1)}-${e(t.getDate())}T${e(t.getHours())}:${e(t.getMinutes())}`, r = (e) => n(e).slice(0, 10);
		t.onclose(), await t.cal.create({
			summary: W(c).trim() || "(no title)",
			start: o().all_day ? r(o().start) : n(o().start),
			end: o().all_day ? r(o().end) : n(o().end),
			all_day: o().all_day,
			calendar: W(l) || void 0
		});
	}
	let w = U(() => r() ? R(r()) : null), T = U(() => o() ? o().all_day ? `${o().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · all day` : `${o().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · ${v(o().start, t.cal.h12)} – ${v(o().end, t.cal.h12)}` : "");
	var O = qt();
	let ee;
	var k = J(O), te = (e) => {
		var n = Gt(), i = j(n), a = J(i), o = (e) => {
			var n = Nt(), i = j(n);
			$(J(i), {
				name: "pen",
				size: 15
			}), Z(i);
			var a = Y(i, 2);
			$(J(a), {
				name: "trash",
				size: 15
			}), Z(a), P("click", i, function(...e) {
				t.onedit?.apply(this, e);
			}), P("click", a, () => {
				t.onclose(), t.cal.remove(r());
			}), u(e, n);
		};
		S(a, (e) => {
			r().writable && e(o);
		});
		var s = Y(a, 2);
		$(J(s), {
			name: "x",
			size: 15
		}), Z(s), Z(i);
		var c = Y(i, 2), l = J(c);
		let f;
		var p = Y(l, 2), h = J(p);
		let v;
		var y = H(h, !0), b = Y(h, 2), C = H(b, !0), T = Y(b, 2), D = (e) => {
			var t = Pt(), n = J(t);
			$(n, {
				name: "repeat",
				size: 12
			});
			var i = Y(n);
			Z(t), z((e) => d(i, ` ${e ?? ""}`), [() => E(r().rrule) || "Repeats"]), u(e, t);
		};
		S(T, (e) => {
			r().recurring && e(D);
		});
		var O = Y(T, 2), ee = (e) => {
			var t = Ft();
			u(e, t);
		};
		S(O, (e) => {
			r().status === "CANCELLED" && e(ee);
		}), Z(p), Z(c);
		var k = Y(c, 2), te = (e) => {
			var t = Lt(), n = J(t);
			$(n, {
				name: "pin",
				size: 14
			});
			var i = Y(n), a = (e) => {
				var t = It(), n = H(t, !0);
				z(() => {
					m(t, "href", r().location), d(n, r().location);
				}), u(e, t);
			}, o = U(() => /^https?:\/\//.test(r().location)), s = (e) => {
				var t = g();
				z(() => d(t, r().location)), u(e, t);
			};
			S(i, (e) => {
				W(o) ? e(a) : e(s, -1);
			}), Z(t), u(e, t);
		};
		S(k, (e) => {
			r().location && e(te);
		});
		var A = Y(k, 2), M = (e) => {
			var t = Vt(), n = J(t);
			$(n, {
				name: "people",
				size: 14
			});
			var i = Y(n, 2), a = J(i), o = (e) => {
				var t = Rt(), n = J(t);
				X(), Z(t), z(() => d(n, `${r().organizer.name ?? r().organizer.email ?? ""} `)), u(e, t);
			};
			S(a, (e) => {
				r().organizer && e(o);
			});
			var s = Y(a, 2);
			x(s, 17, () => (r().attendees ?? []).slice(0, 8), (e) => e.email, (e, t) => {
				var n = zt(), r = J(n), i = Y(r), a = H(i, !0);
				Z(n), z((e, n) => {
					d(r, `${W(t).name ?? W(t).email ?? ""} `), Q(i, 1, `ps ps-${e ?? ""}`, "svelte-id2g6u"), d(a, n);
				}, [() => (W(t).partstat ?? "needs-action").toLowerCase(), () => (W(t).partstat ?? "NEEDS-ACTION").toLowerCase().replace("needs-action", "no answer")]), u(e, n);
			});
			var c = Y(s, 2), l = (e) => {
				var t = Bt(), n = H(t);
				z(() => d(n, `and ${(r().attendees?.length ?? 0) - 8} more`)), u(e, t);
			};
			S(c, (e) => {
				(r().attendees?.length ?? 0) > 8 && e(l);
			}), Z(i), Z(t), u(e, t);
		};
		S(A, (e) => {
			(r().organizer || r().attendees?.length) && e(M);
		});
		var N = Y(A, 2), F = (e) => {
			var t = Ht(), n = J(t);
			$(n, {
				name: "text",
				size: 14
			});
			var i = Y(n), a = H(i, !0);
			Z(t), z(() => d(a, r().description)), u(e, t);
		};
		S(N, (e) => {
			r().description && e(F);
		});
		var I = Y(N, 2), L = J(I);
		$(L, {
			name: "calendar",
			size: 14
		});
		var ne = Y(L);
		Z(I);
		var R = Y(I, 2), re = (e) => {
			var n = Ut();
			$(J(n), {
				name: "note",
				size: 14
			}), X(), Z(n), P("click", n, () => {
				t.cal.atlas.open(W(w)), t.onclose();
			}), u(e, n);
		};
		S(R, (e) => {
			W(w) && e(re);
		});
		var B = Y(R, 2), ie = (e) => {
			var t = Wt(), n = J(t);
			$(n, {
				name: "link",
				size: 14
			});
			var i = Y(n), a = H(i, !0);
			Z(t), z(() => {
				m(i, "href", r().url), d(a, r().url);
			}), u(e, t);
		};
		S(B, (e) => {
			r().url && e(ie);
		}), z((e, t) => {
			f = _(l, "", f, { "--c": e }), v = Q(h, 1, "svelte-id2g6u", null, v, { cancel: r().status === "CANCELLED" }), d(y, r().summary || "(no title)"), d(C, t), d(ne, `${r().calendar_name ?? ""}${r().writable ? "" : " · read-only"}`);
		}, [() => r().color ?? t.cal.colorOf(r().calendar), () => _e(r(), t.cal.h12)]), P("click", s, function(...e) {
			t.onclose?.apply(this, e);
		}), u(e, n);
	}, A = (e) => {
		var n = Kt(), r = j(n), i = J(r);
		$(J(i), {
			name: "x",
			size: 15
		}), Z(i), Z(r);
		var a = Y(r, 2);
		p(a), h(a, (e) => I(f, e), () => W(f));
		var o = Y(a, 2), s = H(o, !0), m = Y(o, 2), _ = J(m);
		$(_, {
			name: "calendar",
			size: 14
		});
		var v = Y(_), y = (e) => {
			Mt(e, {
				get cal() {
					return t.cal;
				},
				get value() {
					return W(l);
				},
				set value(e) {
					I(l, e, !0);
				}
			});
		}, b = (e) => {
			var t = g("No calendar to write to");
			u(e, t);
		};
		S(v, (e) => {
			W(l) ? e(y) : e(b, -1);
		}), Z(m);
		var x = Y(m, 2), w = J(x), E = Y(w, 2);
		Z(x), z(() => {
			d(s, W(T)), E.disabled = !W(l);
		}), P("click", i, function(...e) {
			t.onclose?.apply(this, e);
		}), P("keydown", a, (e) => {
			e.key === "Enter" ? (e.preventDefault(), C()) : e.key === "Escape" && (e.stopPropagation(), t.onclose());
		}), B(a, () => W(c), (e) => I(c, e)), P("click", w, () => t.onmore(W(c), W(l))), P("click", E, C), u(e, n);
	};
	S(k, (e) => {
		r() ? e(te) : o() && e(A, 1);
	}), Z(O), h(O, (e) => I(s, e), () => W(s)), z(() => {
		m(O, "aria-label", r() ? r().summary : "New event"), ee = _(O, "", ee, {
			left: `${W(y).left ?? ""}px`,
			top: `${W(y).top ?? ""}px`
		});
	}), u(e, O), ne();
}
e(["click", "keydown"]);
//#endregion
//#region plugins/stable/dav/ui/src/Editor.svelte
var Xt = C("<div class=\"scrim svelte-aeatm8\" role=\"presentation\"></div>"), Zt = C("<header class=\"svelte-aeatm8\"><h2 class=\"svelte-aeatm8\"> </h2> <button class=\"tool svelte-aeatm8\" aria-label=\"Close\"><!></button></header>"), Qt = C("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Starts at\"/>"), $t = C("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Ends at\"/>"), en = C("<option> </option>"), tn = C("<div class=\"row svelte-aeatm8\"><!><span class=\"guests svelte-aeatm8\"> <span class=\"faint svelte-aeatm8\"> </span></span></div>"), nn = C("<div class=\"row svelte-aeatm8\"><!><input placeholder=\"Add guests (addresses, comma-separated): it becomes a meeting\" aria-label=\"Guests\" class=\"svelte-aeatm8\"/></div>"), rn = C("<div class=\"atlas-notice error\"> </div>"), an = C("<!> <div tabindex=\"-1\"><!> <input class=\"title svelte-aeatm8\" placeholder=\"Add a title\" aria-label=\"Title\"/> <div class=\"row when svelte-aeatm8\"><!> <div class=\"times svelte-aeatm8\"><input type=\"date\" aria-label=\"Starts on\" class=\"svelte-aeatm8\"/> <!> <span class=\"to svelte-aeatm8\">to</span> <!> <input type=\"date\" aria-label=\"Ends on\" class=\"svelte-aeatm8\"/> <label class=\"check svelte-aeatm8\"><input type=\"checkbox\" class=\"svelte-aeatm8\"/> All day</label></div></div> <div class=\"row svelte-aeatm8\"><!> <select aria-label=\"Repeat\" class=\"svelte-aeatm8\"></select></div> <div class=\"row svelte-aeatm8\"><!><input placeholder=\"Add a place\" aria-label=\"Place\" class=\"svelte-aeatm8\"/></div> <div class=\"row svelte-aeatm8\"><!> <!></div> <!> <div class=\"row top svelte-aeatm8\"><!><textarea rows=\"5\" placeholder=\"Add a description\" aria-label=\"Description\" class=\"svelte-aeatm8\"></textarea></div> <p class=\"zone svelte-aeatm8\"> </p> <!> <footer class=\"svelte-aeatm8\"><span class=\"hint svelte-aeatm8\">Ctrl+Enter saves</span> <button class=\"atlas-btn\">Cancel</button> <button class=\"atlas-btn primary\">Save</button></footer></div>", 1), on = {
	hash: "svelte-aeatm8",
	code: ".scrim.svelte-aeatm8 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 55%, transparent);z-index:70;}.ed.svelte-aeatm8 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(620px, calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:12px 18px 16px;display:grid;gap:12px;}.ed.bare.svelte-aeatm8 {position:static;transform:none;width:auto;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;background:var(--bg);padding:16px;align-content:start;}header.svelte-aeatm8 {display:flex;align-items:center;}h2.svelte-aeatm8 {flex:1;margin:0;font-size:0.85em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.tool.svelte-aeatm8 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;}.tool.svelte-aeatm8:hover {background:var(--bg-hover);}.title.svelte-aeatm8 {all:unset;font-size:1.35em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--border-strong);padding:4px 0;}.title.svelte-aeatm8:focus {border-bottom-color:var(--accent);}.title.svelte-aeatm8:focus-visible {outline:none;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8) {appearance:none;-webkit-appearance:none;padding-right:28px;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8):disabled {opacity:0.6;}.row.svelte-aeatm8 {display:flex;gap:12px;align-items:center;color:var(--text-faint);min-width:0;}.row.top.svelte-aeatm8 {align-items:flex-start;}.times.svelte-aeatm8 {display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.to.svelte-aeatm8 {color:var(--text-muted);}input.svelte-aeatm8:not(.title):not([type=checkbox]), select.svelte-aeatm8, textarea.svelte-aeatm8 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 8px;min-width:0;color-scheme:light dark;}.row.svelte-aeatm8 > input:where(.svelte-aeatm8), .row.svelte-aeatm8 > select:where(.svelte-aeatm8), textarea.svelte-aeatm8 {flex:1;}textarea.svelte-aeatm8 {resize:vertical;}input.svelte-aeatm8:focus-visible, select.svelte-aeatm8:focus-visible, textarea.svelte-aeatm8:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.hm.svelte-aeatm8 {width:5.5em;font-variant-numeric:tabular-nums;text-align:center;}.check.svelte-aeatm8 {display:flex;gap:6px;align-items:center;color:var(--text);margin-left:6px;}.guests.svelte-aeatm8 {color:var(--text);}.faint.svelte-aeatm8 {color:var(--text-faint);}.zone.svelte-aeatm8 {margin:0;color:var(--text-faint);font-size:0.82em;}footer.svelte-aeatm8 {display:flex;gap:8px;align-items:center;justify-content:flex-end;}.hint.svelte-aeatm8 {flex:1;color:var(--text-faint);font-size:0.82em;}"
};
function sn(e, r) {
	D(r, !0), n(e, on);
	let s = i(r, "e", 3, null), c = i(r, "title", 3, ""), f = i(r, "guests", 19, () => []), g = i(r, "description", 3, ""), _ = i(r, "calendar", 3, ""), v = i(r, "frame", 3, "sheet"), y = N({
		summary: s()?.summary ?? c(),
		all_day: r.allDay,
		sday: r.start.slice(0, 10),
		stime: r.start.slice(11, 16) || "09:00",
		eday: r.end.slice(0, 10),
		etime: r.end.slice(11, 16) || "10:00",
		location: s()?.location ?? "",
		description: s()?.description ?? g(),
		rrule: s()?.rrule ?? "",
		calendar: s()?.calendar ?? (_() || r.cal.newCalendar()) ?? ""
	}), b = (s()?.attendees ?? []).map((e) => e.email).join(", "), C = G(N(s() ? b : f().join(", "))), w = U(() => new Set(r.cal.accounts.map((e) => (e.user ?? "").toLowerCase()).filter((e) => e.includes("@")))), T = U(() => !!s()?.organizer?.email && !W(w).has(s().organizer.email.toLowerCase())), ee = () => W(C).split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes("@")), k = G(void 0), te = G("");
	a(() => W(k)?.focus());
	let A = U(() => {
		let e = L(/* @__PURE__ */ new Date(`${y.sday}T12:00`));
		return y.rrule && !e.some((e) => e.value === y.rrule) && e.push({
			value: y.rrule,
			label: E(y.rrule) || y.rrule
		}), e;
	}), M = U(() => r.cal.writable());
	function F() {
		return {
			start: y.all_day ? y.sday : `${y.sday}T${y.stime}`,
			end: y.all_day ? (() => {
				let e = O(/* @__PURE__ */ new Date(`${y.eday}T12:00`), 1);
				return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
			})() : `${y.eday}T${y.etime}`
		};
	}
	async function R() {
		let { start: e, end: t } = F();
		if (t <= e && !(y.all_day && t > e)) {
			I(te, "The end is before the start.");
			return;
		}
		let n = W(C).split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
		if (n.length) {
			I(te, `Not an address: ${n.join(", ")}`);
			return;
		}
		let i = !W(T) && W(C) !== b ? ee() : void 0, a = {
			summary: y.summary,
			start: e,
			end: t,
			all_day: y.all_day,
			location: y.location,
			description: y.description,
			rrule: y.rrule,
			attendees: i
		};
		if (!s()) {
			r.onclose(), await r.cal.create({
				...a,
				calendar: y.calendar || void 0
			});
			return;
		}
		let o = await r.cal.askScope(s(), "Change");
		o && (r.onclose(), await r.cal.change(s(), {
			...a,
			move_to: y.calendar && y.calendar !== s().calendar ? y.calendar : void 0,
			from_start: s().start
		}, o, "Saved"));
	}
	function ie(e) {
		e.key === "Escape" ? (e.stopPropagation(), r.onclose()) : e.key === "Enter" && (e.ctrlKey || e.metaKey) && (e.preventDefault(), R());
	}
	function V(e, t) {
		let n = e.trim().toLowerCase().match(/^(\d{1,2})(?:[:h.]?(\d{2}))?\s*(am|pm|h)?$/);
		if (!n) return t;
		let r = Number(n[1]), i = Number(n[2] ?? 0);
		return n[3] === "pm" && r < 12 && (r += 12), n[3] === "am" && r === 12 && (r = 0), r > 23 || i > 59 ? t : `${String(r).padStart(2, "0")}:${String(i).padStart(2, "0")}`;
	}
	function ae() {
		if (`${y.eday}T${y.etime}` <= `${y.sday}T${y.stime}` && (y.eday = y.sday, !y.all_day)) {
			let [e, t] = y.stime.split(":").map(Number);
			y.etime = `${String(Math.min(23, e + 1)).padStart(2, "0")}:${String(t).padStart(2, "0")}`;
		}
	}
	var oe = an(), se = j(oe), ce = (e) => {
		var t = Xt();
		P("click", t, function(...e) {
			r.onclose?.apply(this, e);
		}), u(e, t);
	};
	S(se, (e) => {
		v() === "sheet" && e(ce);
	});
	var K = Y(se, 2);
	let le;
	var ue = J(K), q = (e) => {
		var t = Zt(), n = J(t), i = H(n, !0), a = Y(n, 2);
		$(J(a), { name: "x" }), Z(a), Z(t), z(() => d(i, s() ? "Edit event" : "New event")), P("click", a, function(...e) {
			r.onclose?.apply(this, e);
		}), u(e, t);
	};
	S(ue, (e) => {
		v() === "sheet" && e(q);
	});
	var de = Y(ue, 2);
	p(de), h(de, (e) => I(k, e), () => W(k));
	var fe = Y(de, 2), pe = J(fe);
	$(pe, { name: "clock" });
	var me = Y(pe, 2), he = J(me);
	p(he);
	var ge = Y(he, 2), _e = (e) => {
		var t = Qt();
		p(t), P("change", t, () => {
			y.stime = V(y.stime, "09:00"), ae();
		}), B(t, () => y.stime, (e) => y.stime = e), u(e, t);
	};
	S(ge, (e) => {
		y.all_day || e(_e);
	});
	var ve = Y(ge, 4), ye = (e) => {
		var t = $t();
		p(t), P("change", t, () => y.etime = V(y.etime, "10:00")), B(t, () => y.etime, (e) => y.etime = e), u(e, t);
	};
	S(ve, (e) => {
		y.all_day || e(ye);
	});
	var be = Y(ve, 2);
	p(be);
	var xe = Y(be, 2), Se = J(xe);
	p(Se), X(), Z(xe), Z(me), Z(fe);
	var Ce = Y(fe, 2), we = J(Ce);
	$(we, { name: "repeat" });
	var Te = Y(we, 2);
	x(Te, 21, () => W(A), (e) => e.value, (e, t) => {
		var n = en(), r = H(n, !0), i = {};
		z(() => {
			d(r, W(t).label), i !== (i = W(t).value) && (n.value = (n.__value = i) ?? "");
		}), u(e, n);
	}), Z(Te), l(Te), Z(Ce);
	var Ee = Y(Ce, 2), De = J(Ee);
	$(De, { name: "pin" });
	var Oe = Y(De);
	p(Oe), Z(Ee);
	var ke = Y(Ee, 2), Ae = J(ke);
	$(Ae, { name: "calendar" });
	var je = Y(Ae, 2);
	{
		let e = U(() => !!s() && s().recurring);
		Mt(je, {
			get cal() {
				return r.cal;
			},
			get disabled() {
				return W(e);
			},
			get value() {
				return y.calendar;
			},
			set value(e) {
				y.calendar = e;
			}
		});
	}
	Z(ke);
	var Me = Y(ke, 2), Ne = (e) => {
		var t = tn(), n = J(t);
		$(n, { name: "people" });
		var r = Y(n), i = J(r), a = Y(i), o = H(a);
		Z(r), Z(t), z((e) => {
			d(i, `${e ?? ""} `), d(o, `· organised by ${s()?.organizer?.name ?? s()?.organizer?.email ?? ""}`);
		}, [() => (s()?.attendees ?? []).map((e) => e.name ?? e.email).join(", ")]), u(e, t);
	}, Pe = (e) => {
		var t = nn(), n = J(t);
		$(n, { name: "people" });
		var r = Y(n);
		p(r), Z(t), B(r, () => W(C), (e) => I(C, e)), u(e, t);
	};
	S(Me, (e) => {
		W(T) ? e(Ne) : e(Pe, -1);
	});
	var Fe = Y(Me, 2), Ie = J(Fe);
	$(Ie, { name: "text" });
	var Le = Y(Ie);
	re(Le), Z(Fe);
	var Re = Y(Fe, 2), ze = H(Re), Be = Y(Re, 2), Ve = (e) => {
		var t = rn(), n = H(t, !0);
		z(() => d(n, W(te))), u(e, t);
	};
	S(Be, (e) => {
		W(te) && e(Ve);
	});
	var He = Y(Be, 2), Ue = Y(J(He), 2), We = Y(Ue, 2);
	Z(He), Z(K), z((e) => {
		le = Q(K, 1, "ed svelte-aeatm8", null, le, { bare: v() === "dialog" }), m(K, "role", v() === "sheet" ? "dialog" : "form"), m(K, "aria-label", s() ? "Edit event" : "New event"), m(K, "aria-modal", v() === "sheet" ? "true" : void 0), d(ze, `Times in your zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""}${e ?? ""}`), We.disabled = !W(M).length;
	}, [() => s()?.tzid && s().tzid !== Intl.DateTimeFormat().resolvedOptions().timeZone ? ` · written in ${s().tzid}` : ""]), P("keydown", K, ie), B(de, () => y.summary, (e) => y.summary = e), P("change", he, ae), B(he, () => y.sday, (e) => y.sday = e), B(be, () => y.eday, (e) => y.eday = e), t(Se, () => y.all_day, (e) => y.all_day = e), o(Te, () => y.rrule, (e) => y.rrule = e), B(Oe, () => y.location, (e) => y.location = e), B(Le, () => y.description, (e) => y.description = e), P("click", Ue, function(...e) {
		r.onclose?.apply(this, e);
	}), P("click", We, R), u(e, oe), ne();
}
e([
	"click",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/Toasts.svelte
var cn = C("<button class=\"svelte-osdry5\">Undo</button>"), ln = C("<div><span class=\"text svelte-osdry5\"> </span> <!> <button class=\"x svelte-osdry5\" aria-label=\"Close\">×</button></div>"), un = C("<div class=\"toasts svelte-osdry5\" aria-live=\"polite\"></div>"), dn = {
	hash: "svelte-osdry5",
	code: ".toasts.svelte-osdry5 {position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:60;display:grid;gap:8px;justify-items:center;pointer-events:none;width:min(560px, calc(100% - 32px));}.toast.svelte-osdry5 {pointer-events:auto;display:flex;align-items:center;gap:12px;padding:9px 10px 9px 14px;border-radius:var(--radius);background:var(--heading);color:var(--bg);box-shadow:var(--shadow-md, var(--shadow-sm));max-width:100%; animation: svelte-osdry5-in 120ms var(--ease);}.toast.error.svelte-osdry5 {background:var(--red);color:#fff;}.text.svelte-osdry5 {min-width:0;overflow-wrap:anywhere;}button.svelte-osdry5 {all:unset;cursor:pointer;font-weight:700;color:var(--accent);padding:2px 6px;border-radius:var(--radius-sm);}.error.svelte-osdry5 button:where(.svelte-osdry5) {color:#fff;text-decoration:underline;}button.svelte-osdry5:hover {background:color-mix(in srgb, currentColor 14%, transparent);}button.svelte-osdry5:focus-visible {outline:2px solid currentColor;}.x.svelte-osdry5 {color:inherit;opacity:0.7;font-weight:400;}\n  @keyframes svelte-osdry5-in { from { opacity: 0; transform: translateY(6px); } }\n  @media (prefers-reduced-motion: reduce) {.toast.svelte-osdry5 { animation: none;} }"
};
function fn(e, t) {
	D(t, !0), n(e, dn);
	var r = un();
	x(r, 21, () => t.cal.toasts, (e) => e.id, (e, n) => {
		var r = ln();
		let i;
		var a = J(r), o = H(a, !0), s = Y(a, 2), c = (e) => {
			var r = cn();
			P("click", r, async () => {
				t.cal.dismiss(W(n).id), await W(n).undo?.();
			}), u(e, r);
		};
		S(s, (e) => {
			W(n).undo && e(c);
		});
		var l = Y(s, 2);
		Z(r), z(() => {
			i = Q(r, 1, "toast svelte-osdry5", null, i, { error: W(n).kind === "error" }), m(r, "role", W(n).kind === "error" ? "alert" : "status"), d(o, W(n).text);
		}), P("click", l, () => t.cal.dismiss(W(n).id)), u(e, r);
	}), Z(r), u(e, r), ne();
}
e(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/keys.ts
var pn = (e) => (t) => t.setView(e), mn = [
	{
		id: "day",
		title: "Day",
		group: "Views",
		keys: "d, 1",
		run: pn("day")
	},
	{
		id: "week",
		title: "Week",
		group: "Views",
		keys: "w, 2",
		run: pn("week")
	},
	{
		id: "workweek",
		title: "Work week",
		group: "Views",
		keys: "x, 3",
		run: pn("workweek")
	},
	{
		id: "month",
		title: "Month",
		group: "Views",
		keys: "m, 4",
		run: pn("month")
	},
	{
		id: "agenda",
		title: "Agenda (schedule)",
		group: "Views",
		keys: "a, 5",
		run: pn("agenda")
	},
	{
		id: "year",
		title: "Year",
		group: "Views",
		keys: "y, 6",
		run: pn("year")
	},
	{
		id: "today",
		title: "Today",
		group: "Move around",
		keys: "t",
		run: (e) => e.today()
	},
	{
		id: "next",
		title: "Next period",
		group: "Move around",
		keys: "j, n, arrowright",
		run: (e) => e.step(1)
	},
	{
		id: "prev",
		title: "Previous period",
		group: "Move around",
		keys: "k, p, arrowleft",
		run: (e) => e.step(-1)
	},
	{
		id: "goto",
		title: "Go to a date…",
		group: "Move around",
		keys: "g",
		run: (e, t) => t.goto()
	},
	{
		id: "search",
		title: "Search events",
		group: "Move around",
		keys: "/",
		run: (e, t) => t.focusSearch()
	},
	{
		id: "back",
		title: "Close / back",
		group: "Move around",
		keys: "escape",
		run: (e, t) => t.back()
	},
	{
		id: "create",
		title: "New event",
		group: "Events",
		keys: "c",
		run: (e, t) => t.create()
	},
	{
		id: "quick",
		title: "Quick add (in words)",
		group: "Events",
		keys: "q, shift+c",
		run: (e, t) => t.quick()
	},
	{
		id: "edit",
		title: "Edit the selected event",
		group: "Events",
		keys: "e, enter",
		run: (e, t) => t.edit()
	},
	{
		id: "delete",
		title: "Delete the selected event",
		group: "Events",
		keys: "delete, backspace, #",
		run: (e, t) => t.remove()
	},
	{
		id: "refresh",
		title: "Sync with the server now",
		group: "Pane",
		keys: "r",
		run: (e) => e.sync(!0)
	},
	{
		id: "sidebar",
		title: "Show / hide the side panel",
		group: "Pane",
		keys: "s",
		run: (e, t) => t.sidebar()
	},
	{
		id: "palette",
		title: "All commands…",
		group: "Pane",
		keys: "ctrl+k",
		run: (e, t) => t.palette()
	},
	{
		id: "help",
		title: "Keyboard shortcuts",
		group: "Pane",
		keys: "?",
		run: (e, t) => t.help()
	},
	{
		id: "settings",
		title: "Calendar settings…",
		group: "Pane",
		run: (e) => e.atlas.plugin.openSettings()
	}
];
function hn(e) {
	let t = e.key.toLowerCase(), n = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
	return [...[
		e.ctrlKey || e.metaKey ? "ctrl" : "",
		e.altKey ? "alt" : "",
		e.shiftKey && !n ? "shift" : ""
	].filter(Boolean), t].join("+");
}
var gn = new Map(mn.flatMap((e) => (e.keys ?? "").split(",").map((e) => e.trim()).filter(Boolean).map((t) => [t, e])));
function _n(e) {
	return e ? e.split(",").map((e) => e.trim()).filter(Boolean).slice(0, 2).map((e) => e.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowright", "→").replace("arrowleft", "←").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("backspace", "⌫").replace(/^(⇧)?([a-z])$/, (e, t, n) => t ? `⇧${n.toUpperCase()}` : n)) : [];
}
//#endregion
//#region plugins/stable/dav/ui/src/Shortcuts.svelte
var vn = C("<kbd class=\"svelte-17nm084\"> </kbd>"), yn = C("<div class=\"row svelte-17nm084\"><span> </span><span class=\"keys svelte-17nm084\"></span></div>"), bn = C("<section><h3 class=\"svelte-17nm084\"> </h3> <!></section>"), xn = C("<div class=\"scrim svelte-17nm084\" role=\"presentation\"></div> <div class=\"sheet svelte-17nm084\" role=\"dialog\" aria-label=\"Keyboard shortcuts\" aria-modal=\"true\"><header class=\"svelte-17nm084\"><h2 class=\"svelte-17nm084\">Keyboard shortcuts</h2><button class=\"x svelte-17nm084\" aria-label=\"Close\">×</button></header> <div class=\"cols svelte-17nm084\"></div> <p class=\"hint svelte-17nm084\">Drag on the grid to make an event, drag one to move it, its lower edge to resize (15-minute steps). Esc cancels a drag.</p></div>", 1), Sn = {
	hash: "svelte-17nm084",
	code: ".scrim.svelte-17nm084 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 50%, transparent);z-index:70;}.sheet.svelte-17nm084 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(760px, calc(100% - 32px));max-height:calc(100% - 40px);overflow:auto;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 30px rgba(0,0,0,.3));padding:14px 18px;}header.svelte-17nm084 {display:flex;align-items:center;}h2.svelte-17nm084 {margin:0;flex:1;font-size:1.1em;color:var(--heading);}h3.svelte-17nm084 {margin:10px 0 4px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.cols.svelte-17nm084 {display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:4px 24px;}.row.svelte-17nm084 {display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:var(--text-muted);}.keys.svelte-17nm084 {display:flex;gap:4px;}kbd.svelte-17nm084 {font:600 0.85em var(--font-mono);padding:1px 6px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);}.hint.svelte-17nm084 {color:var(--text-faint);font-size:0.86em;margin:12px 0 0;}.x.svelte-17nm084 {all:unset;cursor:pointer;font-size:1.3em;padding:0 6px;color:var(--text-muted);}"
};
function Cn(e, t) {
	D(t, !0), n(e, Sn);
	let r = [...new Set(mn.map((e) => e.group))];
	var i = xn(), a = j(i), o = Y(a, 2), s = J(o), c = Y(J(s));
	Z(s);
	var l = Y(s, 2);
	x(l, 20, () => r, (e) => e, (e, t) => {
		var n = bn(), r = J(n), i = H(r, !0), a = Y(r, 2);
		x(a, 17, () => mn.filter((e) => e.group === t && e.keys), (e) => e.id, (e, t) => {
			var n = yn(), r = J(n), i = H(r, !0), a = Y(r);
			x(a, 20, () => _n(W(t).keys), (e) => e, (e, t) => {
				var n = vn(), r = H(n, !0);
				z(() => d(r, t)), u(e, n);
			}), Z(a), Z(n), z(() => d(i, W(t).title)), u(e, n);
		}), Z(n), z(() => d(i, t)), u(e, n);
	}), Z(l), X(2), Z(o), P("click", a, function(...e) {
		t.onclose?.apply(this, e);
	}), P("click", c, function(...e) {
		t.onclose?.apply(this, e);
	}), u(e, i), ne();
}
e(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/App.svelte
var wn = C("<button class=\"tool svelte-1i74804\" title=\"Side panel (s)\" aria-label=\"Side panel\"><!></button>"), Tn = C("<span class=\"spin svelte-1i74804\" aria-label=\"Working\"></span>"), En = C("<option> </option>"), Dn = C("<select class=\"vsel svelte-1i74804\" aria-label=\"View\"></select>"), On = C("<button> </button>"), kn = C("<div class=\"seg svelte-1i74804\" role=\"group\" aria-label=\"View\"></div>"), An = C("<button class=\"tool svelte-1i74804\" title=\"Sync now (r)\" aria-label=\"Sync\"><!></button> <button class=\"tool svelte-1i74804\" title=\"All commands (Ctrl+K)\" aria-label=\"All commands\"><!></button>", 1), jn = C("<span class=\"qprev svelte-1i74804\"><b class=\"svelte-1i74804\"> </b> </span>"), Mn = C("<div class=\"quick svelte-1i74804\"><!> <input placeholder=\"lunch with Ana tomorrow 13:00 · examen 15 nov · réunion lundi à 10h @ D3\" aria-label=\"Quick add\" class=\"svelte-1i74804\"/> <!> <!> <button class=\"atlas-btn primary\">Add</button></div>"), Nn = C("<aside class=\"side svelte-1i74804\" aria-label=\"Calendars\"><!></aside>"), Pn = C("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button><button class=\"atlas-btn\">Settings…</button></div></div>"), Fn = C("<div class=\"atlas-notice\">No calendar account yet: add one in Settings (its server address, user name and app password; as many as you have) — or subscribe to a public calendar there.<div class=\"actions\"><button class=\"atlas-btn primary\">Settings…</button></div></div>"), In = C("<button class=\"fab svelte-1i74804\" aria-label=\"New event\" title=\"New event (c)\"><!></button>"), Ln = C("<div class=\"popscrim svelte-1i74804\" role=\"presentation\"></div> <!>", 1), Rn = C("<div tabindex=\"-1\" role=\"application\" aria-label=\"Calendar\"><header class=\"top svelte-1i74804\"><!> <button class=\"atlas-btn today svelte-1i74804\" title=\"Today (t)\">Today</button> <div class=\"nav svelte-1i74804\"><button class=\"tool svelte-1i74804\" title=\"Previous (k)\" aria-label=\"Previous\"><!></button> <button class=\"tool svelte-1i74804\" title=\"Next (j)\" aria-label=\"Next\"><!></button></div> <h1 class=\"svelte-1i74804\"> </h1> <!> <span class=\"grow svelte-1i74804\"></span> <div><!> <input aria-label=\"Search events\" class=\"svelte-1i74804\"/></div> <!> <button class=\"tool svelte-1i74804\" title=\"Quick add in words (q)\" aria-label=\"Quick add\"><!></button> <!></header> <!> <div class=\"body svelte-1i74804\"><!> <main class=\"view svelte-1i74804\"><!> <!></main></div> <!> <!> <!> <!> <!></div>"), zn = {
	hash: "svelte-1i74804",
	code: ".calendar.svelte-1i74804:focus {outline:none;}.calendar.svelte-1i74804 {position:relative;height:100%;display:grid;grid-template-rows:auto auto 1fr;color:var(--text);background:var(--bg);font-size:calc(14px * var(--ui-scale, 1));container-type:inline-size;overflow:hidden;}.top.svelte-1i74804 {grid-row:1;display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);min-width:0;}h1.svelte-1i74804 {margin:0 0 0 4px;font-size:1.2em;font-weight:600;color:var(--heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:6em;flex:0 1 auto;}.nav.svelte-1i74804 {display:flex;}.grow.svelte-1i74804 {flex:1;}.today.svelte-1i74804 {flex:none;}.tool.svelte-1i74804 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;flex:none;}.tool.svelte-1i74804:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-1i74804:focus-visible, .seg.svelte-1i74804 button:where(.svelte-1i74804):focus-visible, .fab.svelte-1i74804:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.search.svelte-1i74804 {display:flex;align-items:center;gap:6px;background:var(--bg-hover);border:1px solid transparent;border-radius:var(--radius);padding:0 8px;color:var(--text-faint);width:200px;flex:0 1 auto;min-width:70px;}.search.svelte-1i74804:focus-within, .search.on.svelte-1i74804 {border-color:var(--accent);background:var(--bg);color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1;min-width:0;padding:6px 0;color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.seg.svelte-1i74804 {display:flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;flex:none;}.seg.svelte-1i74804 button:where(.svelte-1i74804) {all:unset;cursor:pointer;padding:4px 10px;font-size:0.86em;color:var(--text-muted);}.seg.svelte-1i74804 button:where(.svelte-1i74804) + button:where(.svelte-1i74804) {border-left:1px solid var(--border);}.seg.svelte-1i74804 button:where(.svelte-1i74804):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-1i74804 button.on:where(.svelte-1i74804) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.vsel.svelte-1i74804 {appearance:none;-webkit-appearance:none;font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:4px 26px 4px 8px;flex:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 14px) 50%, calc(100% - 9px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.spin.svelte-1i74804 {width:12px;height:12px;border-radius:50%;border:2px solid var(--border-strong);border-top-color:var(--accent); animation: svelte-1i74804-spin 0.8s linear infinite;flex:none;}\n  @keyframes svelte-1i74804-spin { to { transform: rotate(360deg); } }\n  @media (prefers-reduced-motion: reduce) {.spin.svelte-1i74804 { animation: none;} }.quick.svelte-1i74804 {grid-row:2;display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--bg-alt);color:var(--accent-strong);min-width:0;flex-wrap:wrap;}.quick.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1 1 260px;min-width:0;color:var(--text);font-size:1.02em;padding:4px 0;}.quick.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.qprev.svelte-1i74804 {color:var(--text-muted);font-size:0.9em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.qprev.svelte-1i74804 b:where(.svelte-1i74804) {color:var(--text);}.body.svelte-1i74804 {grid-row:3;display:flex;min-height:0;}.side.svelte-1i74804 {flex:none;width:248px;border-right:1px solid var(--border);background:var(--bg-alt);min-height:0;}.view.svelte-1i74804 {flex:1;min-width:0;min-height:0;position:relative;display:flex;flex-direction:column;}.view.svelte-1i74804 > * {flex:1;min-height:0;}.view.svelte-1i74804 > .atlas-notice {flex:none;margin:10px 14px;}.popscrim.svelte-1i74804 {position:absolute;inset:0;z-index:49;}.fab.svelte-1i74804 {all:unset;cursor:pointer;position:absolute;right:18px;bottom:22px;z-index:40;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--accent);color:var(--accent-fg);box-shadow:var(--shadow-md, 0 6px 18px rgba(0,0,0,.3));}.narrow.svelte-1i74804 .top:where(.svelte-1i74804) {flex-wrap:wrap;row-gap:6px;padding:8px;}.narrow.svelte-1i74804 h1:where(.svelte-1i74804) {order:10;flex-basis:100%;margin:0;font-size:1.05em;}.narrow.svelte-1i74804 .search:where(.svelte-1i74804) {width:auto;flex:1 1 60px;min-width:60px;}\n  @container (max-width: 1100px) {.seg.svelte-1i74804 button:where(.svelte-1i74804) {padding:4px 7px;} }"
};
function Bn(e, t) {
	D(t, !0), n(e, zn);
	let i = new xe(t.atlas), o = G(1200), s = G(void 0), c = G(!0), g = G(!1), _ = G(void 0), C = G(""), T = G(!1), E = G(""), A = G(void 0), M = G(null), N = G(""), F = G(null), L = G(null), R = U(() => W(o) < 700), re = U(() => !W(R) && W(o) >= 900 && W(c)), V = U(() => i.shown());
	ee(() => {
		i.narrow !== W(R) && (i.narrow = W(R), i.load());
	});
	let ae = [
		["day", "Day"],
		["week", "Week"],
		["workweek", "Work week"],
		["month", "Month"],
		["agenda", "Agenda"],
		["year", "Year"]
	], oe = U(() => W(F)?.e ?? null), se = () => W(s)?.getBoundingClientRect() ?? new DOMRect(0, 0, W(o), 800);
	function K(e, t) {
		I(F, {
			e,
			at: t
		}, !0), I(L, null);
	}
	function le(e, t, n, r) {
		if (!i.newCalendar()) {
			i.toast(i.configured ? "No calendar of your accounts takes new events (all read-only?)" : "Add a calendar account in Settings first", "error");
			return;
		}
		I(F, {
			draft: {
				start: e,
				end: t,
				all_day: n
			},
			at: r
		}, !0);
	}
	function ue() {
		let e = new Date(i.cursor), t = /* @__PURE__ */ new Date(), n = new Date(e.getFullYear(), e.getMonth(), e.getDate(), t.getHours() + 1, 0);
		I(L, {
			start: r(n),
			end: r(new Date(n.getTime() + 36e5)),
			allDay: !1
		}, !0), I(F, null);
	}
	function de(e = W(F)?.e) {
		if (!e) return;
		if (!e.writable) {
			i.toast(`${e.calendar_name || "This calendar"} is read-only`, "error");
			return;
		}
		let t = xe.fields(e);
		I(L, {
			e,
			start: t.start,
			end: t.end,
			allDay: e.all_day
		}, !0), I(F, null);
	}
	function pe(e, t) {
		let n = W(F)?.draft;
		n && (I(L, n.all_day ? {
			start: y(n.start),
			end: y(O(n.end, -1)),
			allDay: !0,
			title: e,
			calendar: t
		} : {
			start: r(n.start),
			end: r(n.end),
			allDay: !1,
			title: e,
			calendar: t
		}, !0), I(F, null));
	}
	function me() {
		if (W(g)) {
			I(g, !1);
			return;
		}
		if (W(L)) {
			I(L, null);
			return;
		}
		if (W(F)) {
			I(F, null);
			return;
		}
		if (W(T)) {
			I(T, !1);
			return;
		}
		i.results && (I(C, ""), i.search(""));
	}
	function X() {
		t.atlas.pick({
			placeholder: "Go to a date… (2026-12-01, 15 nov, next monday)",
			tag: "Calendar",
			items: [{
				value: y(/* @__PURE__ */ new Date()),
				title: "Today"
			}, {
				value: y(O(/* @__PURE__ */ new Date(), 7)),
				title: "In a week"
			}],
			typed: (e) => `Go to “${e}”`,
			onpick: async (e, n) => {
				if (!n) {
					i.go(/* @__PURE__ */ new Date(`${e}T12:00`));
					return;
				}
				try {
					let n = await q(t.atlas, "quick", { text: e });
					i.go(/* @__PURE__ */ new Date(`${n.start.slice(0, 10)}T12:00`));
				} catch (e) {
					i.toast(e.message, "error");
				}
			}
		});
	}
	function he() {
		t.atlas.pick({
			placeholder: "Do what? (every command of the Calendar pane)",
			tag: "Calendar",
			items: mn.filter((e) => e.id !== "palette").map((e) => ({
				value: e.id,
				title: e.title,
				detail: _n(e.keys).join("  ·  ") || void 0,
				section: e.group
			})),
			onpick: (e) => mn.find((t) => t.id === e)?.run(i, _e)
		});
	}
	function ge() {
		I(T, !0), I(N, i.newCalendar() ?? "", !0), I(F, null), setTimeout(() => W(A)?.focus(), 0);
	}
	let _e = {
		create: ue,
		quick: ge,
		edit: () => de(),
		remove: () => {
			let e = W(F)?.e;
			e?.writable && (I(F, null), i.remove(e));
		},
		focusSearch: () => {
			W(_)?.focus(), W(_)?.select();
		},
		help: () => I(g, !W(g)),
		palette: he,
		goto: X,
		back: me,
		sidebar: () => I(c, !W(c))
	};
	function ve(e) {
		let t = e.target;
		if (t.closest("input, textarea, select, [contenteditable=true]") || !W(s) || !(W(s).contains(t) || t === document.body || t.classList.contains("dv-content-container") && t.contains(W(s))) || [
			"shift",
			"control",
			"alt",
			"meta"
		].includes(e.key.toLowerCase())) return;
		let n = gn.get(hn(e));
		n && (n.id !== "delete" && n.id !== "edit" || W(F)?.e) && (e.preventDefault(), e.stopPropagation(), n.run(i, _e));
	}
	let ye;
	function be() {
		clearTimeout(ye), ye = setTimeout(async () => {
			if (!W(E).trim()) {
				I(M, null);
				return;
			}
			try {
				I(M, await q(t.atlas, "quick", { text: W(E) }), !0);
			} catch {
				I(M, null);
			}
		}, 120);
	}
	async function Se() {
		if (!W(E).trim()) return;
		let e = W(M) ?? await q(t.atlas, "quick", { text: W(E) });
		I(T, !1), I(E, ""), I(M, null), await i.create({
			summary: e.title || "(no title)",
			start: e.start,
			end: e.end,
			all_day: e.all_day,
			rrule: e.rrule,
			location: e.location,
			calendar: W(N) || void 0
		}) && i.go(/* @__PURE__ */ new Date(`${e.start.slice(0, 10)}T12:00`));
	}
	let Ce = U(() => {
		let e = W(M);
		if (!e) return "";
		let t = new Date(e.all_day ? `${e.start}T00:00` : e.start), n = new Date(e.all_day ? `${e.end}T00:00` : e.end), r = t.toLocaleDateString(void 0, {
			weekday: "short",
			day: "numeric",
			month: "short"
		}), a = (e) => v(e, i.h12);
		return e.all_day ? `${r} · all day` : `${r} · ${a(t)} – ${a(n)}`;
	}), we;
	function Te() {
		clearTimeout(we), we = setTimeout(() => void i.search(W(C)), 160);
	}
	a(() => {
		W(s)?.focus({ preventScroll: !0 }), (async () => {
			await i.loadSources(), await i.load(), i.sync(!1);
		})();
		let e = [t.atlas.helper.on("changed", () => {
			i.loadSources(), i.later();
		})], n = setInterval(() => i.now = /* @__PURE__ */ new Date(), 3e4), r = (e) => {
			let t = e.detail ?? {};
			t.date ? i.go(/* @__PURE__ */ new Date(`${t.date}T12:00`), t.view) : t.view && i.setView(t.view), t.quick && ge(), t.create && ue();
		};
		window.addEventListener("atlas-calendar:show", r);
		let a = window.__atlasCalendarShow;
		return a && (r(new CustomEvent("x", { detail: a })), window.__atlasCalendarShow = void 0), () => {
			e.forEach((e) => e()), clearInterval(n), window.removeEventListener("atlas-calendar:show", r);
		};
	});
	var Ee = Rn();
	fe("keydown", ce, ve);
	let De;
	var Oe = J(Ee), ke = J(Oe), Ae = (e) => {
		var t = wn();
		$(J(t), { name: "menu" }), Z(t), P("click", t, () => I(c, !W(c))), u(e, t);
	};
	S(ke, (e) => {
		W(R) || e(Ae);
	});
	var je = Y(ke, 2), Me = Y(je, 2), Ne = J(Me);
	$(J(Ne), { name: "back" }), Z(Ne);
	var Pe = Y(Ne, 2);
	$(J(Pe), { name: "right" }), Z(Pe), Z(Me);
	var Fe = Y(Me, 2), Ie = H(Fe, !0), Le = Y(Fe, 2), Re = (e) => {
		var t = Tn();
		z(() => m(t, "title", i.syncing ? "Syncing with the server" : "Reading")), u(e, t);
	};
	S(Le, (e) => {
		(i.loading || i.syncing) && e(Re);
	});
	var ze = Y(Le, 4);
	let Be;
	var He = J(ze);
	$(He, {
		name: "search",
		size: 15
	});
	var Ue = Y(He, 2);
	p(Ue), h(Ue, (e) => I(_, e), () => W(_)), Z(ze);
	var We = Y(ze, 2), Ge = (e) => {
		var t = Dn();
		x(t, 21, () => ae, ([e, t]) => e, (e, t) => {
			var n = U(() => te(W(t), 2));
			let r = () => W(n)[0], i = () => W(n)[1];
			var a = En(), o = H(a, !0), s = {};
			z(() => {
				d(o, i()), s !== (s = r()) && (a.value = (a.__value = s) ?? "");
			}), u(e, a);
		}), Z(t);
		var n;
		l(t), z(() => {
			n !== (n = i.view) && (t.value = (t.__value = n) ?? "", f(t, n));
		}), P("change", t, (e) => i.setView(e.currentTarget.value)), u(e, t);
	}, Ke = (e) => {
		var t = kn();
		x(t, 21, () => ae, ([e, t]) => e, (e, t) => {
			var n = U(() => te(W(t), 2));
			let r = () => W(n)[0], a = () => W(n)[1];
			var o = On();
			let s;
			var c = H(o, !0);
			z((e) => {
				m(o, "title", `${a() ?? ""} (${e ?? ""})`), s = Q(o, 1, "svelte-1i74804", null, s, { on: i.view === r() }), d(c, a());
			}, [() => mn.find((e) => e.id === r())?.keys?.split(",")[0]]), P("click", o, () => i.setView(r())), u(e, o);
		}), Z(t), u(e, t);
	};
	S(We, (e) => {
		W(o) < 980 ? e(Ge) : e(Ke, -1);
	});
	var qe = Y(We, 2);
	$(J(qe), { name: "sparkle" }), Z(qe);
	var Je = Y(qe, 2), Ye = (e) => {
		var t = An(), n = j(t);
		$(J(n), { name: "refresh" }), Z(n);
		var r = Y(n, 2);
		$(J(r), { name: "keyboard" }), Z(r), P("click", n, () => i.sync(!0)), P("click", r, he), u(e, t);
	};
	S(Je, (e) => {
		W(R) || e(Ye);
	}), Z(Oe);
	var Xe = Y(Oe, 2), Ze = (e) => {
		var t = Mn(), n = J(t);
		$(n, {
			name: "sparkle",
			size: 15
		});
		var r = Y(n, 2);
		p(r), h(r, (e) => I(A, e), () => W(A));
		var a = Y(r, 2), o = (e) => {
			var t = jn(), n = J(t), r = H(n, !0), i = Y(n);
			Z(t), z(() => {
				d(r, W(M).title || "(no title)"), d(i, ` · ${W(Ce) ?? ""}${W(M).rrule ? " · repeats" : ""}${W(M).location ? ` · ${W(M).location}` : ""}`);
			}), u(e, t);
		};
		S(a, (e) => {
			W(M) && e(o);
		});
		var s = Y(a, 2), c = (e) => {
			Mt(e, {
				get cal() {
					return i;
				},
				compact: !0,
				get value() {
					return W(N);
				},
				set value(e) {
					I(N, e, !0);
				}
			});
		};
		S(s, (e) => {
			W(N) && e(c);
		});
		var l = Y(s, 2);
		Z(t), z((e) => l.disabled = e, [() => !W(E).trim()]), P("input", r, be), P("keydown", r, (e) => {
			e.key === "Enter" ? (e.preventDefault(), Se()) : e.key === "Escape" && (e.stopPropagation(), I(T, !1));
		}), B(r, () => W(E), (e) => I(E, e)), P("click", l, Se), u(e, t);
	};
	S(Xe, (e) => {
		W(T) && e(Ze);
	});
	var Qe = Y(Xe, 2), $e = J(Qe), et = (e) => {
		var t = Nn();
		Ve(J(t), {
			get cal() {
				return i;
			},
			oncreate: ue
		}), Z(t), u(e, t);
	};
	S($e, (e) => {
		W(re) && e(et);
	});
	var nt = Y($e, 2), rt = J(nt), it = (e) => {
		var n = Pn(), r = J(n, !0), a = Y(r), o = J(a), s = Y(o);
		Z(a), Z(n), z(() => d(r, i.error)), P("click", o, () => i.load()), P("click", s, () => t.atlas.plugin.openSettings()), u(e, n);
	}, at = (e) => {
		var n = Fn(), r = Y(J(n)), i = H(r);
		Z(n), P("click", i, () => t.atlas.plugin.openSettings()), u(e, n);
	};
	S(rt, (e) => {
		i.error ? e(it) : !i.configured && !i.sources.length && e(at, 1);
	});
	var ot = Y(rt, 2), st = (e) => {
		{
			let t = U(() => k(/* @__PURE__ */ new Date())), n = U(() => k(/* @__PURE__ */ new Date()));
			bt(e, {
				get cal() {
					return i;
				},
				get events() {
					return i.results;
				},
				get from() {
					return W(t);
				},
				get to() {
					return W(n);
				},
				get selected() {
					return W(oe);
				},
				onselect: K,
				search: !0
			});
		}
	}, ct = (e) => {
		{
			let t = U(() => i.days());
			dt(e, {
				get cal() {
					return i;
				},
				get days() {
					return W(t);
				},
				get selected() {
					return W(oe);
				},
				onselect: K,
				oncreate: le
			});
		}
	}, lt = (e) => {
		{
			let t = U(() => i.range().from), n = U(() => i.range().to);
			bt(e, {
				get cal() {
					return i;
				},
				get events() {
					return i.events;
				},
				get from() {
					return W(t);
				},
				get to() {
					return W(n);
				},
				get selected() {
					return W(oe);
				},
				onselect: K
			});
		}
	}, ut = (e) => {
		Dt(e, { get cal() {
			return i;
		} });
	}, ft = (e) => {
		var t = w(), n = j(t);
		b(n, () => W(V) + i.range().from.getTime(), (e) => {
			{
				let t = U(() => i.days());
				tt(e, {
					get cal() {
						return i;
					},
					get days() {
						return W(t);
					},
					get selected() {
						return W(oe);
					},
					onselect: K,
					oncreate: le
				});
			}
		}), u(e, t);
	};
	S(ot, (e) => {
		i.results ? e(st) : W(V) === "month" ? e(ct, 1) : W(V) === "agenda" ? e(lt, 2) : W(V) === "year" ? e(ut, 3) : e(ft, -1);
	}), Z(nt), Z(Qe);
	var pt = Y(Qe, 2), mt = (e) => {
		var t = In();
		$(J(t), {
			name: "plus",
			size: 22
		}), Z(t), P("click", t, ue), u(e, t);
	};
	S(pt, (e) => {
		W(R) && e(mt);
	});
	var ht = Y(pt, 2), gt = (e) => {
		var t = Ln(), n = j(t), r = Y(n, 2);
		b(r, () => W(F), (e) => {
			{
				let t = U(() => W(F).e ?? null), n = U(() => W(F).draft ?? null), r = U(se);
				Yt(e, {
					get cal() {
						return i;
					},
					get e() {
						return W(t);
					},
					get draft() {
						return W(n);
					},
					get at() {
						return W(F).at;
					},
					get box() {
						return W(r);
					},
					onedit: () => de(),
					onmore: pe,
					onclose: () => I(F, null)
				});
			}
		}), P("click", n, () => I(F, null)), u(e, t);
	};
	S(ht, (e) => {
		W(F) && e(gt);
	});
	var _t = Y(ht, 2), vt = (e) => {
		{
			let t = U(() => W(L).e ?? null), n = U(() => W(L).title ?? ""), r = U(() => W(L).calendar ?? "");
			sn(e, {
				get cal() {
					return i;
				},
				get e() {
					return W(t);
				},
				get start() {
					return W(L).start;
				},
				get end() {
					return W(L).end;
				},
				get allDay() {
					return W(L).allDay;
				},
				get title() {
					return W(n);
				},
				get calendar() {
					return W(r);
				},
				onclose: () => I(L, null)
			});
		}
	};
	S(_t, (e) => {
		W(L) && e(vt);
	});
	var yt = Y(_t, 2), xt = (e) => {
		Cn(e, { onclose: () => I(g, !1) });
	};
	S(yt, (e) => {
		W(g) && e(xt);
	}), fn(Y(yt, 2), { get cal() {
		return i;
	} }), Z(Ee), h(Ee, (e) => I(s, e), () => W(s)), z((e, t) => {
		De = Q(Ee, 1, "calendar svelte-1i74804", null, De, { narrow: W(R) }), m(Fe, "title", e), d(Ie, t), Be = Q(ze, 1, "search svelte-1i74804", null, Be, { on: !!W(C) }), m(Ue, "placeholder", W(R) ? "" : "Search events");
	}, [() => i.title(), () => i.title()]), P("pointerdown", Ee, (e) => {
		e.target.closest("input, textarea, select, button, [tabindex='0']") || W(s)?.focus({ preventScroll: !0 });
	}), P("click", je, () => i.today()), P("click", Ne, () => i.step(-1)), P("click", Pe, () => i.step(1)), P("input", Ue, Te), P("keydown", Ue, (e) => {
		e.key === "Escape" && (I(C, ""), i.search(""), W(_)?.blur());
	}), B(Ue, () => W(C), (e) => I(C, e)), P("click", qe, ge), ie(Ee, "clientWidth", (e) => I(o, e)), u(e, Ee), ne();
}
e([
	"pointerdown",
	"click",
	"input",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/NewEvent.svelte
var Vn = C("<div class=\"none svelte-19uhe47\"><p class=\"svelte-19uhe47\">No calendar to write to: add an account (CalDAV, or Outlook / Microsoft 365) in the Calendar's settings.</p> <button class=\"atlas-btn\">Open its settings</button></div>"), Hn = C("<p class=\"none svelte-19uhe47\">Loading the calendars…</p>"), Un = {
	hash: "svelte-19uhe47",
	code: ".none.svelte-19uhe47 {padding:16px;display:grid;gap:10px;justify-items:start;color:var(--text-muted);margin:0;}.none.svelte-19uhe47 p:where(.svelte-19uhe47) {margin:0;}"
};
function Wn(e, t) {
	D(t, !0), n(e, Un);
	let a = i(t, "seed", 19, () => ({})), o = ue(() => new xe(t.atlas));
	o.toast = (e, n) => t.atlas.toast("Calendar", e, n === "error" ? "error" : "success");
	let s = G(!1);
	o.loadSources().then(() => I(s, !0));
	let c = /* @__PURE__ */ new Date(), l = new Date(c.getFullYear(), c.getMonth(), c.getDate(), c.getHours() + 1, 0);
	var d = w(), f = j(d), p = (e) => {
		var n = w(), i = j(n), s = (e) => {
			{
				let n = U(() => r(l)), i = U(() => r(new Date(l.getTime() + 36e5))), s = U(() => a().title ?? ""), c = U(() => a().guests ?? []), u = U(() => a().description ?? "");
				sn(e, {
					get cal() {
						return o;
					},
					get start() {
						return W(n);
					},
					get end() {
						return W(i);
					},
					allDay: !1,
					get title() {
						return W(s);
					},
					get guests() {
						return W(c);
					},
					get description() {
						return W(u);
					},
					frame: "dialog",
					get onclose() {
						return t.onclose;
					}
				});
			}
		}, c = U(() => o.writable().length), d = (e) => {
			var n = Vn(), r = Y(J(n), 2);
			Z(n), P("click", r, () => t.atlas.plugin.openSettings()), u(e, n);
		};
		S(i, (e) => {
			W(c) ? e(s) : e(d, -1);
		}), u(e, n);
	}, m = (e) => {
		var t = Hn();
		u(e, t);
	};
	S(f, (e) => {
		W(s) ? e(p) : e(m, -1);
	}), u(e, d), ne();
}
e(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/view.ts
function Gn(e, t) {
	let n = ae(t.arg);
	if (n) {
		let r = s(Wn, {
			target: e,
			props: {
				atlas: t,
				seed: n,
				onclose: () => t.pane?.close?.()
			}
		});
		return () => K(r);
	}
	e.style.height = "100%";
	let r = s(Bn, {
		target: e,
		props: { atlas: t }
	});
	return () => K(r);
}
//#endregion
export { Gn as default };
