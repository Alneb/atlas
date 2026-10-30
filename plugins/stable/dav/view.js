import { $ as e, A as t, B as n, C as r, D as i, E as a, F as o, G as s, H as c, I as l, J as u, K as d, L as f, N as p, O as m, P as h, Q as g, R as _, S as v, T as y, U as b, V as x, W as S, X as C, Y as w, Z as T, _ as E, _t as D, a as O, at as k, b as A, c as j, ct as M, d as N, dt as P, et as F, f as I, ft as L, g as R, gt as ee, h as te, ht as z, i as ne, it as re, j as B, k as V, l as H, lt as U, m as ie, mt as W, n as ae, nt as G, o as K, ot as q, p as oe, pt as se, q as ce, r as le, rt as ue, s as J, st as Y, t as de, tt as fe, u as X, ut as Z, v as pe, vt as me, w as he, x as ge, y as _e, z as Q } from "./ui-lib/layout.js";
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
	#e = P(U([]));
	get sources() {
		return F(this.#e);
	}
	set sources(e) {
		Z(this.#e, e, !0);
	}
	#t = P(U([]));
	get accounts() {
		return F(this.#t);
	}
	set accounts(e) {
		Z(this.#t, e, !0);
	}
	#n = P(U([]));
	get events() {
		return F(this.#n);
	}
	set events(e) {
		Z(this.#n, e, !0);
	}
	#r = P("week");
	get view() {
		return F(this.#r);
	}
	set view(e) {
		Z(this.#r, e, !0);
	}
	#i = P(U(pe(/* @__PURE__ */ new Date())));
	get cursor() {
		return F(this.#i);
	}
	set cursor(e) {
		Z(this.#i, e, !0);
	}
	#a = P(!0);
	get loading() {
		return F(this.#a);
	}
	set loading(e) {
		Z(this.#a, e, !0);
	}
	#o = P(!1);
	get syncing() {
		return F(this.#o);
	}
	set syncing(e) {
		Z(this.#o, e, !0);
	}
	#s = P("");
	get error() {
		return F(this.#s);
	}
	set error(e) {
		Z(this.#s, e, !0);
	}
	#c = P(!0);
	get configured() {
		return F(this.#c);
	}
	set configured(e) {
		Z(this.#c, e, !0);
	}
	#l = P(null);
	get write() {
		return F(this.#l);
	}
	set write(e) {
		Z(this.#l, e, !0);
	}
	#u = P(U(ye("last")));
	get last() {
		return F(this.#u);
	}
	set last(e) {
		Z(this.#u, e, !0);
	}
	#d = P(U([]));
	get hidden() {
		return F(this.#d);
	}
	set hidden(e) {
		Z(this.#d, e, !0);
	}
	#f = P(U({}));
	get colors() {
		return F(this.#f);
	}
	set colors(e) {
		Z(this.#f, e, !0);
	}
	#p = P(U([]));
	get toasts() {
		return F(this.#p);
	}
	set toasts(e) {
		Z(this.#p, e, !0);
	}
	#m = P(null);
	get results() {
		return F(this.#m);
	}
	set results(e) {
		Z(this.#m, e, !0);
	}
	#h = P("");
	get query() {
		return F(this.#h);
	}
	set query(e) {
		Z(this.#h, e, !0);
	}
	#g = P(U(/* @__PURE__ */ new Date()));
	get now() {
		return F(this.#g);
	}
	set now(e) {
		Z(this.#g, e, !0);
	}
	#_ = P(!1);
	get narrow() {
		return F(this.#_);
	}
	set narrow(e) {
		Z(this.#_, e, !0);
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
		return v(this.settings.week_start);
	}
	get h12() {
		return X(this.settings.time_format);
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
				let e = _e(t, this.first);
				return {
					from: e,
					to: O(e, 6)
				};
			}
			case "workweek": {
				let e = _e(t, 1);
				return {
					from: e,
					to: O(e, 4)
				};
			}
			case "month": {
				let e = _e(new Date(t.getFullYear(), t.getMonth(), 1), this.first);
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
		return this.colors[e] ?? this.colors[t?.name ?? ""] ?? t?.shown_color ?? t?.color ?? N(e);
	}
	isHidden(e, t = e) {
		return this.hidden.includes(e) || this.hidden.includes(t);
	}
	async loadSources() {
		try {
			let e = await J(this.atlas, "watch", {}, 30);
			this.sources = e.sources, this.accounts = e.accounts ?? [], this.write = e.write, this.configured = e.configured;
		} catch (e) {
			this.error = e.message;
		}
	}
	async load(e = !1) {
		let { from: t, to: n } = this.range(), i = ++this.seq;
		e || (this.loading = !0);
		try {
			let e = this.sources.filter((e) => !this.isHidden(e.id, e.name)).map((e) => e.id), a = await J(this.atlas, "range", {
				from: r(t),
				to: r(n),
				sources: e,
				notes: this.showNotes && !this.isHidden("notes", "Notes")
			}, 60);
			if (i !== this.seq) return;
			this.events = a.events, this.error = "";
		} catch (e) {
			i === this.seq && (this.error = e.message);
		} finally {
			i === this.seq && (this.loading = !1);
		}
	}
	later(e = 250) {
		clearTimeout(this.timer), this.timer = setTimeout(() => void this.load(!0), e);
	}
	async sync(e = !0) {
		this.syncing = !0;
		try {
			let t = await J(this.atlas, "refresh", { force: e }, 300);
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
		this.cursor = pe(e), t ? this.setView(t) : this.load();
	}
	today() {
		this.go(/* @__PURE__ */ new Date());
	}
	step(e) {
		let t = this.cursor, n = {
			day: () => O(t, e),
			week: () => O(t, 7 * e),
			workweek: () => O(t, 7 * e),
			month: () => K(new Date(t.getFullYear(), t.getMonth(), 1), e),
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
				await J(this.atlas, "undo", { id: e }), this.toast(`${t} undone`);
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
			let r = await J(this.atlas, "create", {
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
			let i = await J(this.atlas, "update", {
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
				let n = await J(this.atlas, "delete", {
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
			this.results = (await J(this.atlas, "search", { q: e })).events;
		} catch (e) {
			this.toast(e.message, "error");
		}
	}
	static fields(e) {
		let t = H(e), n = j(e);
		return e.all_day ? {
			start: r(t),
			end: r(O(n, -1))
		} : {
			start: ge(t),
			end: ge(n)
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
}, Ce = w("<svg class=\"icon svelte-16m1c18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path></path></svg>"), we = {
	hash: "svelte-16m1c18",
	code: ".icon.svelte-16m1c18 {flex:none;display:block;}"
};
function $(e, t) {
	_(e, we);
	let n = y(t, "size", 3, 16), r = y(t, "title", 3, "");
	var i = Ce(), a = Y(i);
	G(() => {
		B(i, "width", n()), B(i, "height", n()), B(i, "aria-hidden", r() ? void 0 : "true"), B(i, "role", r() ? "img" : void 0), B(i, "aria-label", r() || void 0), B(a, "d", Se[t.name] ?? Se.calendar);
	}), d(e, i);
}
//#endregion
//#region plugins/stable/dav/ui/src/Sidebar.svelte
var Te = u("<span class=\"h svelte-1jq00cd\"> </span>"), Ee = u("<button> </button>"), De = u("<button class=\"link svelte-1jq00cd\">Set it up…</button>"), Oe = u("<h3 class=\"svelte-1jq00cd\">Calendars</h3> <ul class=\"svelte-1jq00cd\"><li class=\"none svelte-1jq00cd\"> <!></li></ul>", 1), ke = u("<span class=\"err svelte-1jq00cd\">!</span>"), Ae = w("<svg viewBox=\"0 0 12 12\" width=\"10\" height=\"10\" aria-hidden=\"true\"><path d=\"M2.5 6.5l2.2 2.2L9.5 3.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path></svg>"), je = u("<span class=\"ro svelte-1jq00cd\" title=\"A subscription: read-only\"><!></span>"), Me = u("<span class=\"ro svelte-1jq00cd\" title=\"Read-only\">ro</span>"), Ne = u("<button class=\"pc svelte-1jq00cd\" role=\"option\"></button>"), Pe = u("<div class=\"palette svelte-1jq00cd\" role=\"listbox\" aria-label=\"Colours\"></div>"), Fe = u("<li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\"><span><!></span> <span class=\"name svelte-1jq00cd\"> </span> <!> <!></button> <button class=\"tool small svelte-1jq00cd\" title=\"Colour\"><span class=\"swatch svelte-1jq00cd\"></span></button> <!></li>"), Ie = u("<li class=\"none svelte-1jq00cd\"> </li>"), Le = u("<h3 class=\"svelte-1jq00cd\"> <!></h3> <ul class=\"svelte-1jq00cd\"></ul>", 1), Re = u("<h3 class=\"svelte-1jq00cd\">In the vault</h3> <ul class=\"svelte-1jq00cd\"><li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\" title=\"Notes marked important: true with due: / event:\"><span><!></span> <span class=\"name svelte-1jq00cd\">Important notes</span></button></li></ul>", 1), ze = u("<div class=\"side svelte-1jq00cd\"><button class=\"create atlas-btn primary svelte-1jq00cd\"><!>Create</button> <div class=\"mini svelte-1jq00cd\" aria-label=\"Pick a day\"><div class=\"mhead svelte-1jq00cd\"><span class=\"mtitle svelte-1jq00cd\"> </span> <button class=\"tool svelte-1jq00cd\" aria-label=\"Previous month\"><!></button> <button class=\"tool svelte-1jq00cd\" aria-label=\"Next month\"><!></button></div> <div class=\"mgrid svelte-1jq00cd\"><!> <!></div></div> <!> <!> <!> <button class=\"link add svelte-1jq00cd\"><!>Add an account or a subscription…</button></div>"), Be = {
	hash: "svelte-1jq00cd",
	code: ".side.svelte-1jq00cd {height:100%;overflow-y:auto;padding:12px 10px 24px;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;}.create.svelte-1jq00cd {display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin:0 0 10px 4px;padding:7px 16px;}.mini.svelte-1jq00cd {padding:0 2px 10px;}.mhead.svelte-1jq00cd {display:flex;align-items:center;gap:2px;padding:0 0 4px 6px;}.mtitle.svelte-1jq00cd {flex:1;font-weight:600;font-size:0.9em;color:var(--heading);}.mgrid.svelte-1jq00cd {display:grid;grid-template-columns:repeat(7, 1fr);gap:1px;}.h.svelte-1jq00cd {font-size:0.68em;color:var(--text-faint);text-align:center;padding:2px 0;}.d.svelte-1jq00cd {all:unset;cursor:pointer;text-align:center;font-size:0.76em;line-height:24px;border-radius:999px;font-variant-numeric:tabular-nums;color:var(--text-muted);position:relative;}.d.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.d.other.svelte-1jq00cd {color:var(--text-faint);}.d.on.svelte-1jq00cd {background:var(--accent-soft);color:var(--accent-strong);border-radius:0;}.d.busy.svelte-1jq00cd::after {content:\"\";position:absolute;left:50%;bottom:2px;width:3px;height:3px;border-radius:50%;background:currentColor;transform:translateX(-50%);opacity:0.6;}.d.today.svelte-1jq00cd {background:var(--accent);color:var(--accent-fg);font-weight:700;border-radius:999px;}.d.svelte-1jq00cd:focus-visible, .cal.svelte-1jq00cd:focus-visible, .tool.svelte-1jq00cd:focus-visible, .pc.svelte-1jq00cd:focus-visible, .link.svelte-1jq00cd:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}h3.svelte-1jq00cd {margin:10px 6px 2px;font-size:0.72em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;}ul.svelte-1jq00cd {list-style:none;margin:0;padding:0;display:grid;gap:1px;}li.svelte-1jq00cd {position:relative;display:flex;align-items:center;}.cal.svelte-1jq00cd {all:unset;flex:1;min-width:0;cursor:pointer;display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:var(--radius-sm);color:var(--text);font-size:0.9em;}.cal.svelte-1jq00cd:hover {background:var(--bg-hover);}.box.svelte-1jq00cd {width:14px;height:14px;border-radius:4px;background:var(--c);border:2px solid var(--c);box-sizing:border-box;display:grid;place-items:center;color:#fff;flex:none;}.box.off.svelte-1jq00cd {background:transparent;}.name.svelte-1jq00cd {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.err.svelte-1jq00cd {color:var(--red);font-weight:700;}.ro.svelte-1jq00cd {color:var(--text-faint);font-size:0.75em;}.tool.svelte-1jq00cd {all:unset;cursor:pointer;padding:5px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.small.svelte-1jq00cd {opacity:0;}li.svelte-1jq00cd:hover .small:where(.svelte-1jq00cd), .small.svelte-1jq00cd:focus-visible {opacity:1;}.swatch.svelte-1jq00cd {width:10px;height:10px;border-radius:50%;background:var(--c);}.palette.svelte-1jq00cd {position:absolute;right:0;top:100%;z-index:20;display:grid;grid-template-columns:repeat(6, 22px);gap:6px;padding:8px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 24px rgba(0,0,0,.25));}.pc.svelte-1jq00cd {all:unset;cursor:pointer;width:22px;height:22px;border-radius:50%;background:var(--c);}.pc[aria-selected=\"true\"].svelte-1jq00cd {box-shadow:0 0 0 2px var(--bg-elev), 0 0 0 4px var(--c);}.none.svelte-1jq00cd {color:var(--text-faint);font-size:0.85em;padding:4px 6px;gap:6px;flex-wrap:wrap;}.link.svelte-1jq00cd {all:unset;cursor:pointer;color:var(--accent);font-size:0.85em;display:inline-flex;align-items:center;gap:4px;}.add.svelte-1jq00cd {margin:10px 6px 0;}"
};
function Ve(e, t) {
	z(t, !0), _(e, Be);
	let r = P(U(/* @__PURE__ */ new Date()));
	ue(() => {
		Z(r, new Date(t.cal.cursor.getFullYear(), t.cal.cursor.getMonth(), 1), !0);
	});
	let i = L(() => {
		let e = _e(F(r), t.cal.first);
		return Array.from({ length: 42 }, (t, n) => O(e, n));
	}), a = L(() => F(i).slice(0, 7).map((e) => e.toLocaleDateString(void 0, { weekday: "narrow" }))), o = (e) => {
		let n = t.cal.range();
		return e >= n.from && e <= n.to;
	}, s = L(() => new Set(t.cal.events.map((e) => e.start.slice(0, 10)))), u = (e) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`, p = [
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
	], m = P(null), h = L(() => [...t.cal.byAccount().map((e) => ({
		title: e.account.name,
		error: e.account.error ?? void 0,
		items: e.items
	})), {
		title: "Subscriptions",
		error: void 0,
		items: t.cal.sources.filter((e) => e.kind === "ics")
	}]), v = L(() => !t.cal.accounts.length), y = L(() => t.cal.showNotes);
	function b(e) {
		return e.error ? `${e.name} — ${e.error}` : e.writable ? e.name : `${e.name} (read-only)`;
	}
	var x = ze(), C = k(x);
	$(k(C), {
		name: "plus",
		size: 15
	}), ee(), D(C);
	var w = M(C, 2), T = k(w), E = k(T), A = Y(E, !0), j = M(E, 2);
	$(k(j), {
		name: "back",
		size: 14
	}), D(j);
	var N = M(j, 2);
	$(k(N), {
		name: "right",
		size: 14
	}), D(N), D(T);
	var I = M(T, 2), te = k(I);
	Q(te, 17, () => F(a), n, (e, t) => {
		var n = Te(), r = Y(n, !0);
		G(() => S(r, F(t))), d(e, n);
	});
	var ne = M(te, 2);
	Q(ne, 17, () => F(i), (e) => e.getTime(), (e, n) => {
		var i = Ee();
		let a;
		var c = Y(i, !0);
		G((e, t, n, r, o) => {
			a = f(i, 1, "d svelte-1jq00cd", null, a, {
				other: e,
				today: t,
				on: n,
				busy: r
			}), S(c, o);
		}, [
			() => F(n).getMonth() !== F(r).getMonth(),
			() => R(F(n), t.cal.now),
			() => o(F(n)),
			() => F(s).has(u(F(n))),
			() => F(n).getDate()
		]), g("click", i, () => t.cal.go(F(n))), d(e, i);
	}), D(I), D(w);
	var re = M(w, 2), V = (e) => {
		var n = Oe(), r = M(q(n), 2), i = k(r), a = k(i, !0), o = M(a), s = (e) => {
			var n = De();
			g("click", n, () => t.cal.atlas.plugin.openSettings()), d(e, n);
		};
		c(o, (e) => {
			t.cal.configured || e(s);
		}), D(i), D(r), G(() => S(a, t.cal.configured ? t.cal.error ? "Not read: see the message beside." : "Reading the server…" : "No account yet.")), d(e, n);
	};
	c(re, (e) => {
		F(v) && e(V);
	});
	var H = M(re, 2);
	Q(H, 17, () => F(h), (e) => e.title, (e, n) => {
		var r = ce(), i = q(r), a = (e) => {
			var r = Le(), i = q(r), a = k(i, !0), o = M(a), s = (e) => {
				var t = ke();
				G(() => B(t, "title", F(n).error)), d(e, t);
			};
			c(o, (e) => {
				F(n).error && e(s);
			}), D(i);
			var u = M(i, 2);
			Q(u, 21, () => F(n).items, (e) => e.id, (e, n) => {
				var r = Fe(), i = k(r), a = k(i);
				let o, s;
				var u = k(a), h = (e) => {
					var t = Ae();
					d(e, t);
				}, _ = L(() => !t.cal.isHidden(F(n).id, F(n).name));
				c(u, (e) => {
					F(_) && e(h);
				}), D(a);
				var v = M(a, 2), y = Y(v, !0), x = M(v, 2), C = (e) => {
					var t = ke();
					G(() => B(t, "title", F(n).error)), d(e, t);
				};
				c(x, (e) => {
					F(n).error && e(C);
				});
				var w = M(x, 2), T = (e) => {
					var t = je();
					$(k(t), {
						name: "rss",
						size: 12
					}), D(t), d(e, t);
				}, E = (e) => {
					var t = Me();
					d(e, t);
				};
				c(w, (e) => {
					F(n).kind === "ics" ? e(T) : F(n).writable || e(E, 1);
				}), D(i);
				var O = M(i, 2), A = k(O);
				let j;
				D(O);
				var N = M(O, 2), P = (e) => {
					var r = Pe();
					Q(r, 20, () => p, (e) => e, (e, r) => {
						var i = Ne();
						let a;
						G((e) => {
							B(i, "aria-selected", e), B(i, "aria-label", r), a = l(i, "", a, { "--c": r });
						}, [() => t.cal.colorOf(F(n).id) === r]), g("click", i, () => {
							t.cal.setColor(F(n).id, r), Z(m, null);
						}), d(e, i);
					}), D(r), d(e, r);
				};
				c(N, (e) => {
					F(m) === F(n).id && e(P);
				}), D(r), G((e, t, r, c, u) => {
					B(i, "aria-checked", e), B(i, "title", t), o = f(a, 1, "box svelte-1jq00cd", null, o, { off: r }), s = l(a, "", s, { "--c": c }), S(y, F(n).name), B(O, "aria-label", `Colour of ${F(n).name ?? ""}`), j = l(A, "", j, { "--c": u });
				}, [
					() => !t.cal.isHidden(F(n).id, F(n).name),
					() => b(F(n)),
					() => t.cal.isHidden(F(n).id, F(n).name),
					() => t.cal.colorOf(F(n).id),
					() => t.cal.colorOf(F(n).id)
				]), g("click", i, () => t.cal.toggle(F(n).id, F(n).name)), g("click", O, () => Z(m, F(m) === F(n).id ? null : F(n).id, !0)), d(e, r);
			}, (e) => {
				var t = Ie(), r = Y(t, !0);
				G(() => S(r, F(n).error ?? "Reading the server…")), d(e, t);
			}), D(u), G(() => {
				B(i, "title", F(n).error ?? F(n).title), S(a, F(n).title);
			}), d(e, r);
		};
		c(i, (e) => {
			(F(n).items.length || F(n).title !== "Subscriptions") && e(a);
		}), d(e, r);
	});
	var ie = M(H, 2), ae = (e) => {
		var n = Re(), r = M(q(n), 2), i = k(r), a = k(i), o = k(a);
		let s, u;
		var p = k(o), m = (e) => {
			var t = Ae();
			d(e, t);
		}, h = L(() => !t.cal.isHidden(ve, "Notes"));
		c(p, (e) => {
			F(h) && e(m);
		}), D(o), ee(2), D(a), D(i), D(r), G((e, t, n) => {
			B(a, "aria-checked", e), s = f(o, 1, "box svelte-1jq00cd", null, s, { off: t }), u = l(o, "", u, { "--c": n });
		}, [
			() => !t.cal.isHidden(ve, "Notes"),
			() => t.cal.isHidden(ve, "Notes"),
			() => t.cal.colorOf(ve)
		]), g("click", a, () => t.cal.toggle(ve, "Notes")), d(e, n);
	};
	c(ie, (e) => {
		F(y) && e(ae);
	});
	var oe = M(ie, 2);
	$(k(oe), {
		name: "plus",
		size: 13
	}), ee(), D(oe), D(x), G((e) => S(A, e), [() => F(r).toLocaleDateString(void 0, {
		month: "long",
		year: "numeric"
	})]), g("click", C, function(...e) {
		t.oncreate?.apply(this, e);
	}), g("click", j, () => Z(r, K(F(r), -1), !0)), g("click", N, () => Z(r, K(F(r), 1), !0)), g("click", oe, () => t.cal.atlas.plugin.openSettings()), d(e, x), W();
}
T(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/TimeGrid.svelte
var He = u("<button title=\"Open this day\"><span class=\"wd svelte-16enfn0\"> </span> <span class=\"num svelte-16enfn0\"> </span></button>"), Ue = u("<div class=\"lanecell svelte-16enfn0\" role=\"button\" tabindex=\"-1\" aria-label=\"New all-day event\"></div>"), We = u("<span class=\"dot svelte-16enfn0\" aria-hidden=\"true\"></span>"), Ge = u("<button><!> </button>"), Ke = u("<div class=\"hl svelte-16enfn0\"> </div>"), qe = u("<span class=\"loc svelte-16enfn0\"> </span>"), Je = u("<div class=\"grip svelte-16enfn0\" role=\"separator\" aria-label=\"Change the end\"></div>"), Ye = u("<div role=\"button\" tabindex=\"0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span> <!> <!></div>"), Xe = u("<div class=\"ev slot-ghost svelte-16enfn0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span></div>"), Ze = u("<div class=\"now svelte-16enfn0\" aria-hidden=\"true\"></div>"), Qe = u("<div role=\"gridcell\" tabindex=\"-1\"><!> <!> <!></div>"), $e = u("<div class=\"tg svelte-16enfn0\"><div class=\"head svelte-16enfn0\"><div class=\"gutter tz svelte-16enfn0\" title=\"Times in your zone\"></div> <!></div> <div class=\"lane svelte-16enfn0\"><div class=\"gutter label svelte-16enfn0\">all-day</div> <div class=\"lanecols svelte-16enfn0\"><!> <!></div></div> <div class=\"scroll svelte-16enfn0\"><div class=\"body svelte-16enfn0\"><div class=\"gutter hours svelte-16enfn0\"></div> <div class=\"cols svelte-16enfn0\" role=\"grid\" tabindex=\"-1\" aria-label=\"Hours\"></div></div></div></div>"), et = {
	hash: "svelte-16enfn0",
	code: ".tg.svelte-16enfn0 {display:grid;grid-template-rows:auto auto 1fr;height:100%;min-height:0;--gutter: 56px;}.head.svelte-16enfn0, .lane.svelte-16enfn0 {display:grid;grid-template-columns:var(--gutter) 1fr;border-bottom:1px solid var(--border);}.head.svelte-16enfn0 {grid-template-columns:var(--gutter) repeat(var(--n), 1fr);}.gutter.svelte-16enfn0 {color:var(--text-faint);font-size:0.75em;}.tz.svelte-16enfn0 {align-self:end;padding:0 6px 6px;font-size:0.68em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.dayhead.svelte-16enfn0 {all:unset;cursor:pointer;display:flex;align-items:baseline;justify-content:center;gap:6px;padding:6px 2px;color:var(--text-muted);border-left:1px solid var(--border);min-width:0;}.dayhead.svelte-16enfn0:hover {background:var(--bg-hover);}.dayhead.svelte-16enfn0:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.wd.svelte-16enfn0 {font-size:0.78em;text-transform:uppercase;letter-spacing:0.04em;}.num.svelte-16enfn0 {font-size:1.25em;font-weight:600;color:var(--heading);font-variant-numeric:tabular-nums;min-width:1.8em;text-align:center;border-radius:999px;}.dayhead.today.svelte-16enfn0 .wd:where(.svelte-16enfn0) {color:var(--accent-strong);}.dayhead.today.svelte-16enfn0 .num:where(.svelte-16enfn0) {background:var(--accent);color:var(--accent-fg);}.label.svelte-16enfn0 {align-self:center;padding:0 6px;text-align:right;}.lanecols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);grid-auto-rows:22px;row-gap:2px;padding:3px 0;min-height:26px;max-height:120px;overflow-y:auto;}.lanecell.svelte-16enfn0 {grid-row:1 / span var(--rows);border-left:1px solid var(--border);cursor:cell;}.bar.svelte-16enfn0 {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;margin:0 3px;padding:0 8px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));color:var(--text);font-size:0.82em;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px;border-left:3px solid var(--c);}.bar.clipl.svelte-16enfn0 {border-top-left-radius:0;border-bottom-left-radius:0;margin-left:0;}.bar.clipr.svelte-16enfn0 {border-top-right-radius:0;border-bottom-right-radius:0;margin-right:0;}.dot.svelte-16enfn0 {width:6px;height:6px;border-radius:50%;background:var(--c);flex:none;}.scroll.svelte-16enfn0 {overflow-y:auto;min-height:0;position:relative;}.body.svelte-16enfn0 {position:relative;display:grid;grid-template-columns:var(--gutter) 1fr;height:calc(24 * var(--hour));}.hours.svelte-16enfn0 {position:relative;}.hl.svelte-16enfn0 {position:absolute;right:8px;transform:translateY(-50%);font-variant-numeric:tabular-nums;white-space:nowrap;}.cols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);position:relative;touch-action:pan-y;}.col.svelte-16enfn0 {position:relative;border-left:1px solid var(--border);cursor:cell;min-width:0;background-image:repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px var(--hour)), repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour) / 2), color-mix(in srgb, var(--border) 45%, transparent) calc(var(--hour) / 2) calc(var(--hour) / 2 + 1px), transparent calc(var(--hour) / 2 + 1px) var(--hour));}.col.weekend.svelte-16enfn0 {background-color:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.ev.svelte-16enfn0 {position:absolute;box-sizing:border-box;cursor:pointer;border-radius:var(--radius-sm);padding:2px 6px;overflow:hidden;display:flex;flex-direction:column;gap:0;font-size:0.8em;line-height:1.25;background:color-mix(in srgb, var(--c) 24%, var(--bg));border-left:3px solid var(--c);color:var(--text);box-shadow:0 0 0 1px var(--bg);touch-action:none;z-index:1;}.ev.svelte-16enfn0:hover {background:color-mix(in srgb, var(--c) 34%, var(--bg));}.ev.svelte-16enfn0:focus-visible, .ev.sel.svelte-16enfn0, .bar.sel.svelte-16enfn0, .bar.svelte-16enfn0:focus-visible {outline:2px solid var(--c);outline-offset:1px;z-index:3;}.ev.short.svelte-16enfn0 {flex-direction:row;gap:6px;align-items:baseline;}.ev.short.svelte-16enfn0 .t:where(.svelte-16enfn0) {flex:0 1 auto;min-width:2.5em;}.ev.short.svelte-16enfn0 .when:where(.svelte-16enfn0) {flex:0 100 auto;min-width:0;}.ev.ro.svelte-16enfn0 {cursor:default;}.ev.free.svelte-16enfn0 {background:color-mix(in srgb, var(--c) 10%, var(--bg));}.ev.cancel.svelte-16enfn0 .t:where(.svelte-16enfn0), .bar.cancel.svelte-16enfn0 {text-decoration:line-through;opacity:0.7;}.ev.ghosted.svelte-16enfn0 {opacity:0.35;}.t.svelte-16enfn0 {font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}.when.svelte-16enfn0, .loc.svelte-16enfn0 {color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}.grip.svelte-16enfn0 {position:absolute;left:0;right:0;bottom:0;height:7px;cursor:ns-resize;}.slot-ghost.svelte-16enfn0 {z-index:4;pointer-events:none;box-shadow:var(--shadow-md, 0 4px 16px rgba(0,0,0,.25));background:color-mix(in srgb, var(--c) 40%, var(--bg));}.now.svelte-16enfn0 {position:absolute;left:-1px;right:0;height:2px;background:var(--red);z-index:5;pointer-events:none;}.now.svelte-16enfn0::before {content:\"\";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--red);}\n  @media (prefers-reduced-motion: no-preference) {.ev.svelte-16enfn0 {transition:opacity 120ms var(--ease);} }"
};
function tt(t, r) {
	z(r, !0), _(t, et);
	let i = P(void 0), o = P(void 0), s = L(() => r.days.map((e) => de(r.cal.events, e))), u = L(() => ae(r.cal.events, r.days)), p = L(() => Math.max(1, ...F(u).map((e) => e.row + 1))), m = Array.from({ length: 24 }, (e, t) => t), h = (e) => e === 0 ? "" : r.cal.h12 ? new Date(2e3, 0, 1, e).toLocaleTimeString(void 0, {
		hour: "numeric",
		hour12: !0
	}) : String(e).padStart(2, "0"), v = L(() => r.cal.now.getHours() * 60 + r.cal.now.getMinutes()), y = (e) => r.selected !== null && r.selected.uid === e.uid && r.selected.rid === e.rid && r.selected.calendar === e.calendar, b = (e) => e.color ?? r.cal.colorOf(e.calendar);
	he(() => {
		let e = Number(r.cal.settings.day_start ?? 8), t = r.days.some((e) => R(e, r.cal.now)) ? Math.max(0, F(v) / 60 - 2) : e;
		F(i) && (F(i).scrollTop = Math.max(0, t * 48 - 8));
	});
	let x = P(null), C = (e) => Math.round(e / 15) * 15;
	function w(e) {
		let t = F(o).getBoundingClientRect();
		return {
			day: Math.min(r.days.length - 1, Math.max(0, Math.floor((e.clientX - t.left) / t.width * r.days.length))),
			min: Math.min(1440, Math.max(0, (e.clientY - t.top) / 48 * 60))
		};
	}
	function T(e, t, n, r = 0, i = 0) {
		if (e.button !== 0) return;
		e.stopPropagation();
		let a = w(e);
		if (t === "create") {
			let n = Math.floor(a.min / 15) * 15;
			Z(x, {
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
		} else Z(x, {
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
	function E(e) {
		if (!F(x) || !F(x).moved && Math.hypot(e.clientX - F(x).x0, e.clientY - F(x).y0) < 4) return;
		let t = w(e), n = F(x);
		if (n.moved = !0, n.kind === "create") {
			let e = C(t.min);
			[n.from, n.to] = e >= n.grab ? [n.grab, Math.max(n.grab + 15, e)] : [e, n.grab + 15];
		} else if (n.kind === "move") {
			let e = C(t.min - n.grab);
			n.day = t.day, n.from = Math.max(0, Math.min(1425, e)), n.to = n.from + n.len;
		} else n.to = Math.max(n.from + 15, C(t.min));
		Z(x, { ...n }, !0);
	}
	async function N(e) {
		let t = F(x);
		if (Z(x, null), document.body.style.userSelect = "", !t) return;
		let n = (e, t) => new Date(r.days[e].getFullYear(), r.days[e].getMonth(), r.days[e].getDate(), 0, t);
		if (t.kind === "create") {
			let e = F(o).getBoundingClientRect(), i = e.width / r.days.length;
			r.oncreate(n(t.day, t.from), n(t.day, t.to), !1, new DOMRect(e.left + t.day * i, e.top + t.from / 60 * 48, i, (t.to - t.from) / 60 * 48));
			return;
		}
		let i = (e.target.closest(".ev") ?? e.target).getBoundingClientRect(), a = t.e;
		if (!t.moved) {
			r.onselect(a, i);
			return;
		}
		if (!a.writable) {
			r.cal.toast(`${a.calendar_name || "This calendar"} is read-only`, "error");
			return;
		}
		let s = n(t.day, t.from), c = n(t.day, t.to), l = await r.cal.askScope(a, t.kind === "move" ? "Move" : "Change");
		if (!l) return;
		let u = (e) => String(e).padStart(2, "0"), d = (e) => `${e.getFullYear()}-${u(e.getMonth() + 1)}-${u(e.getDate())}T${u(e.getHours())}:${u(e.getMinutes())}`;
		await r.cal.change(a, {
			start: d(s),
			end: d(c),
			from_start: a.start
		}, l, t.kind === "move" ? "Moved" : "Resized");
	}
	function I(e) {
		F(x) && e.key === "Escape" && (Z(x, null), document.body.style.userSelect = "", e.stopPropagation());
	}
	function ee(e, t) {
		if (e.target.closest(".bar")) return;
		let n = r.days[t];
		r.oncreate(pe(n), O(pe(n), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var te = $e();
	e("keydown", re, I);
	let ne;
	var V = k(te), U = k(V);
	U.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ");
	var ie = M(U, 2);
	Q(ie, 17, () => r.days, n, (e, t) => {
		var n = He();
		let i;
		var a = k(n), o = Y(a, !0), s = M(a, 2), c = Y(s, !0);
		D(n), G((e, t, r) => {
			i = f(n, 1, "dayhead svelte-16enfn0", null, i, { today: e }), S(o, t), S(c, r);
		}, [
			() => R(F(t), r.cal.now),
			() => F(t).toLocaleDateString(void 0, { weekday: "short" }),
			() => F(t).getDate()
		]), g("click", n, () => r.cal.go(F(t), "day")), d(e, n);
	}), D(V);
	var K = M(V, 2);
	let q;
	var se = M(k(K), 2), ce = k(se);
	Q(ce, 17, () => r.days, n, (e, t, n) => {
		var r = Ue();
		l(r, "", {}, { "grid-column": n + 1 }), g("click", r, (e) => ee(e, n)), g("keydown", r, () => {}), d(e, r);
	});
	var le = M(ce, 2);
	Q(le, 17, () => F(u), (e) => e.e.calendar + e.e.uid + (e.e.rid ?? "") + e.from, (e, t) => {
		var n = Ge();
		let i, a;
		var o = k(n), s = (e) => {
			var t = We();
			d(e, t);
		}, u = L(() => oe(F(t).e));
		c(o, (e) => {
			F(u) && e(s);
		});
		var p = M(o, 1, !0);
		D(n), G((e, r) => {
			i = f(n, 1, "bar ev svelte-16enfn0", null, i, {
				sel: e,
				clipl: F(t).clippedStart,
				clipr: F(t).clippedEnd,
				cancel: F(t).e.status === "CANCELLED"
			}), B(n, "title", F(t).e.summary), a = l(n, "", a, {
				"--c": r,
				"grid-column": `${F(t).from + 1} / ${F(t).to + 2}`,
				"grid-row": F(t).row + 1
			}), S(p, F(t).e.summary || "(no title)");
		}, [() => y(F(t).e), () => b(F(t).e)]), g("click", n, (e) => r.onselect(F(t).e, e.currentTarget.getBoundingClientRect())), d(e, n);
	}), D(se), D(K);
	var ue = M(K, 2), J = k(ue), fe = k(J);
	Q(fe, 20, () => m, (e) => e, (e, t) => {
		var n = Ke();
		let r;
		var i = Y(n, !0);
		G((e) => {
			r = l(n, "", r, { top: `${t * 48}px` }), S(i, e);
		}, [() => h(t)]), d(e, n);
	}), D(fe);
	var X = M(fe, 2);
	Q(X, 21, () => r.days, n, (e, t, n) => {
		var i = Qe();
		let a;
		var o = k(i);
		Q(o, 17, () => F(s)[n], (e) => e.e.calendar + e.e.uid + (e.e.rid ?? ""), (e, t) => {
			let n = L(() => F(t).bottom - F(t).top < 40);
			var i = Ye();
			let a, o;
			var s = k(i), u = Y(s, !0), p = M(s, 2), m = Y(p), h = M(p, 2), _ = (e) => {
				var n = qe(), r = Y(n, !0);
				G(() => S(r, F(t).e.location)), d(e, n);
			};
			c(h, (e) => {
				!F(n) && F(t).e.location && e(_);
			});
			var v = M(h, 2), C = (e) => {
				var n = Je();
				g("pointerdown", n, (e) => T(e, "resize", F(t).e, F(t).top, F(t).bottom)), d(e, n);
			};
			c(v, (e) => {
				F(t).e.writable && !F(t).endsAfter && e(C);
			}), D(i), G((e, r, s, c, d, p) => {
				a = f(i, 1, "ev svelte-16enfn0", null, a, {
					sel: e,
					short: F(n),
					ro: !F(t).e.writable,
					cancel: F(t).e.status === "CANCELLED",
					free: F(t).e.free,
					ghosted: F(x)?.e === F(t).e && F(x).moved
				}), B(i, "aria-label", `${F(t).e.summary ?? ""}, ${r ?? ""}`), o = l(i, "", o, {
					"--c": s,
					top: `${F(t).top / 60 * 48}px`,
					height: c,
					left: `calc(${F(t).col / F(t).cols * 100}% + 1px)`,
					width: `calc(${1 / F(t).cols * 100}% - 3px)`
				}), S(u, F(t).e.summary || "(no title)"), S(m, `${d ?? ""}${p ?? ""}`);
			}, [
				() => y(F(t).e),
				() => A(H(F(t).e), r.cal.h12),
				() => b(F(t).e),
				() => `${Math.max(14, (F(t).bottom - F(t).top) / 60 * 48 - 2)}px`,
				() => A(H(F(t).e), r.cal.h12),
				() => F(n) ? "" : ` – ${A(j(F(t).e), r.cal.h12)}`
			]), g("pointerdown", i, (e) => F(t).startsBefore || F(t).endsAfter ? e.stopPropagation() : T(e, "move", F(t).e, F(t).top, F(t).bottom)), g("click", i, (e) => {
				(F(t).startsBefore || F(t).endsAfter) && r.onselect(F(t).e, e.currentTarget.getBoundingClientRect());
			}), g("keydown", i, (e) => {
				e.key === "Enter" && r.onselect(F(t).e, e.currentTarget.getBoundingClientRect());
			}), d(e, i);
		});
		var u = M(o, 2), p = (e) => {
			var t = Xe();
			let n;
			var i = k(t), a = Y(i, !0), o = M(i, 2), s = Y(o);
			D(t), G((e, r, i) => {
				n = l(t, "", n, {
					"--c": e,
					top: `${F(x).from / 60 * 48}px`,
					height: `${(F(x).to - F(x).from) / 60 * 48 - 2}px`,
					left: "1px",
					width: "calc(100% - 3px)"
				}), S(a, F(x).e?.summary ?? "New event"), S(s, `${r ?? ""} – ${i ?? ""}`);
			}, [
				() => F(x).e ? b(F(x).e) : "var(--accent)",
				() => A(new Date(2e3, 0, 1, 0, F(x).from), r.cal.h12),
				() => A(new Date(2e3, 0, 1, 0, F(x).to), r.cal.h12)
			]), d(e, t);
		};
		c(u, (e) => {
			F(x) && F(x).moved && F(x).day === n && e(p);
		});
		var m = M(u, 2), h = (e) => {
			var t = Ze();
			let n;
			G(() => n = l(t, "", n, { top: `${F(v) / 60 * 48}px` })), d(e, t);
		}, _ = L(() => R(F(t), r.cal.now));
		c(m, (e) => {
			F(_) && e(h);
		}), D(i), G((e, t) => a = f(i, 1, "col svelte-16enfn0", null, a, {
			today: e,
			weekend: t
		}), [() => R(F(t), r.cal.now), () => F(t).getDay() === 0 || F(t).getDay() === 6]), g("pointerdown", i, (e) => T(e, "create")), d(e, i);
	}), D(X), a(X, (e) => Z(o, e), () => F(o)), D(J), D(ue), a(ue, (e) => Z(i, e), () => F(i)), D(te), G(() => {
		ne = l(te, "", ne, {
			"--n": r.days.length,
			"--hour": "48px"
		}), q = l(K, "", q, { "--rows": F(p) });
	}), g("pointermove", X, E), g("pointerup", X, N), e("pointercancel", X, () => Z(x, null)), d(t, te), W();
}
T([
	"click",
	"keydown",
	"pointermove",
	"pointerup",
	"pointerdown"
]);
//#endregion
//#region plugins/stable/dav/ui/src/MonthView.svelte
var nt = u("<div class=\"wd svelte-13jyj5s\"> </div>"), rt = u("<div role=\"button\" tabindex=\"-1\"><button class=\"num svelte-13jyj5s\" title=\"Open this day\"> </button></div>"), it = u("<button> </button>"), at = u("<button><span class=\"dot svelte-13jyj5s\" aria-hidden=\"true\"></span><span class=\"tm svelte-13jyj5s\"> </span><span class=\"tt svelte-13jyj5s\"> </span></button>"), ot = u("<button class=\"more svelte-13jyj5s\"> </button>"), st = u("<!> <!>", 1), ct = u("<div class=\"week svelte-13jyj5s\"><!> <!> <!></div>"), lt = u("<div class=\"month svelte-13jyj5s\"><div class=\"wds svelte-13jyj5s\"></div> <div class=\"weeks svelte-13jyj5s\"></div></div>"), ut = {
	hash: "svelte-13jyj5s",
	code: ".month.svelte-13jyj5s {display:grid;grid-template-rows:auto 1fr;height:100%;min-height:0;}.wds.svelte-13jyj5s {display:grid;grid-template-columns:repeat(7, 1fr);border-bottom:1px solid var(--border);}.wd.svelte-13jyj5s {padding:6px 8px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-faint);}.weeks.svelte-13jyj5s {display:grid;grid-template-rows:repeat(var(--rows), minmax(96px, 1fr));min-height:0;overflow-y:auto;}.week.svelte-13jyj5s {display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));grid-template-rows:26px repeat(4, 21px) 1fr;row-gap:1px;border-bottom:1px solid var(--border);position:relative;min-height:0;}.cell.svelte-13jyj5s {grid-row:1 / -1;border-left:1px solid var(--border);padding:2px 4px;cursor:cell;min-width:0;}.cell.svelte-13jyj5s:first-child {border-left:0;}.cell.weekend.svelte-13jyj5s {background:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.cell.other.svelte-13jyj5s {background:color-mix(in srgb, var(--bg-alt) 90%, transparent);}.cell.other.svelte-13jyj5s .num:where(.svelte-13jyj5s) {color:var(--text-faint);}.num.svelte-13jyj5s {all:unset;cursor:pointer;font-size:0.82em;font-weight:600;color:var(--text-muted);padding:1px 6px;border-radius:999px;font-variant-numeric:tabular-nums;}.num.svelte-13jyj5s:hover {background:var(--bg-hover);color:var(--text);}.today.svelte-13jyj5s .num:where(.svelte-13jyj5s) {background:var(--accent);color:var(--accent-fg);}.num.svelte-13jyj5s:focus-visible, .bar.svelte-13jyj5s:focus-visible, .line.svelte-13jyj5s:focus-visible, .more.svelte-13jyj5s:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.bar.svelte-13jyj5s, .line.svelte-13jyj5s, .more.svelte-13jyj5s {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;min-width:0;font-size:0.8em;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.bar.svelte-13jyj5s {margin:0 3px;padding:0 7px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));border-left:3px solid var(--c);color:var(--text);}.bar.clipl.svelte-13jyj5s {margin-left:0;border-top-left-radius:0;border-bottom-left-radius:0;}.bar.clipr.svelte-13jyj5s {margin-right:0;border-top-right-radius:0;border-bottom-right-radius:0;}.line.svelte-13jyj5s {display:flex;align-items:center;gap:5px;margin:0 3px;padding:0 4px;border-radius:var(--radius-sm);color:var(--text);}.line.svelte-13jyj5s:hover, .bar.svelte-13jyj5s:hover {background:color-mix(in srgb, var(--c) 18%, var(--bg-hover));}.sel.svelte-13jyj5s {outline:2px solid var(--c);outline-offset:-1px;}.cancel.svelte-13jyj5s .tt:where(.svelte-13jyj5s) {text-decoration:line-through;opacity:0.7;}.dot.svelte-13jyj5s {width:7px;height:7px;border-radius:50%;background:var(--c);flex:none;}.tm.svelte-13jyj5s {color:var(--text-muted);font-variant-numeric:tabular-nums;flex:none;}.tt.svelte-13jyj5s {overflow:hidden;text-overflow:ellipsis;min-width:0;}.more.svelte-13jyj5s {margin:0 3px;padding:0 6px;color:var(--text-muted);font-weight:600;border-radius:var(--radius-sm);}.more.svelte-13jyj5s:hover {background:var(--bg-hover);color:var(--text);}\n  @container (max-width: 760px) {.tm.svelte-13jyj5s {display:none;} }"
};
function dt(e, t) {
	z(t, !0), _(e, ut);
	let r = L(() => Array.from({ length: Math.ceil(t.days.length / 7) }, (e, n) => t.days.slice(n * 7, n * 7 + 7))), i = L(() => t.cal.cursor.getMonth()), a = (e) => e.color ?? t.cal.colorOf(e.calendar), o = (e) => t.selected !== null && t.selected.uid === e.uid && t.selected.rid === e.rid && t.selected.calendar === e.calendar, s = (e) => e.calendar + e.uid + (e.rid ?? "");
	function u(e) {
		let n = ae(t.cal.events, e), r = Math.min(4, Math.max(0, ...n.map((e) => e.row + 1))), i = n.filter((e) => e.row < 4 - !!n.some((e) => e.row >= 4));
		return {
			bars: i,
			used: r,
			cells: e.map((e, a) => {
				let o = le(t.cal.events, e).filter((e) => !I(e)).sort((e, t) => H(e).getTime() - H(t).getTime()), s = n.filter((e) => e.from <= a && e.to >= a), c = s.filter((e) => !i.includes(e)).length, l = Math.max(0, 4 - r - 1), u = o.length + c <= l + 1 ? o.slice(0, l + 1) : o.slice(0, l);
				return {
					timed: u,
					more: o.length - u.length + c,
					total: o.length + s.length
				};
			})
		};
	}
	function p(e, n) {
		e.target.closest("button") || t.oncreate(pe(n), O(pe(n), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var m = lt();
	let h;
	var v = k(m);
	Q(v, 21, () => F(r)[0] ?? [], (e) => e.getDay(), (e, t) => {
		var n = nt(), r = Y(n, !0);
		G((e) => S(r, e), [() => F(t).toLocaleDateString(void 0, { weekday: "short" })]), d(e, n);
	}), D(v);
	var y = M(v, 2);
	Q(y, 21, () => F(r), n, (e, r) => {
		let m = L(() => u(F(r)));
		var h = ct(), _ = k(h);
		Q(_, 17, () => F(r), n, (e, n, r) => {
			var a = rt();
			let o;
			l(a, "", {}, { "grid-column": r + 1 });
			var s = k(a), c = Y(s, !0);
			D(a), G((e, t, n, r, i) => {
				o = f(a, 1, "cell svelte-13jyj5s", null, o, {
					other: e,
					today: t,
					weekend: n
				}), B(a, "aria-label", `New event on ${r ?? ""}`), S(c, i);
			}, [
				() => F(n).getMonth() !== F(i),
				() => R(F(n), t.cal.now),
				() => F(n).getDay() === 0 || F(n).getDay() === 6,
				() => F(n).toLocaleDateString(),
				() => F(n).getDate() === 1 ? F(n).toLocaleDateString(void 0, {
					day: "numeric",
					month: "short"
				}) : F(n).getDate()
			]), g("click", a, (e) => p(e, F(n))), g("keydown", a, () => {}), g("click", s, () => t.cal.go(F(n), "day")), d(e, a);
		});
		var v = M(_, 2);
		Q(v, 17, () => F(m).bars, (e) => s(e.e) + e.from, (e, n) => {
			var r = it();
			let i, s;
			var c = Y(r, !0);
			G((e, t) => {
				i = f(r, 1, "bar svelte-13jyj5s", null, i, {
					sel: e,
					clipl: F(n).clippedStart,
					clipr: F(n).clippedEnd
				}), B(r, "title", F(n).e.summary), s = l(r, "", s, {
					"--c": t,
					"grid-column": `${F(n).from + 1} / ${F(n).to + 2}`,
					"grid-row": F(n).row + 2
				}), S(c, F(n).e.summary || "(no title)");
			}, [() => o(F(n).e), () => a(F(n).e)]), g("click", r, (e) => t.onselect(F(n).e, e.currentTarget.getBoundingClientRect())), d(e, r);
		});
		var y = M(v, 2);
		Q(y, 17, () => F(m).cells, n, (e, n, i) => {
			var u = st(), p = q(u);
			Q(p, 19, () => F(n).timed, (e) => s(e), (e, n, r) => {
				var s = at();
				let c, u;
				var p = M(k(s)), h = Y(p, !0), _ = M(p), v = Y(_, !0);
				D(s), G((e, t, a, o) => {
					c = f(s, 1, "line svelte-13jyj5s", null, c, {
						sel: e,
						cancel: F(n).status === "CANCELLED"
					}), B(s, "title", `${t ?? ""} ${F(n).summary ?? ""}`), u = l(s, "", u, {
						"--c": a,
						"grid-column": i + 1,
						"grid-row": F(m).used + 2 + F(r)
					}), S(h, o), S(v, F(n).summary || "(no title)");
				}, [
					() => o(F(n)),
					() => A(H(F(n)), t.cal.h12),
					() => a(F(n)),
					() => A(H(F(n)), t.cal.h12)
				]), g("click", s, (e) => t.onselect(F(n), e.currentTarget.getBoundingClientRect())), d(e, s);
			});
			var h = M(p, 2), _ = (e) => {
				var a = ot();
				let o;
				var s = Y(a);
				G(() => {
					o = l(a, "", o, {
						"grid-column": i + 1,
						"grid-row": F(m).used + 2 + F(n).timed.length
					}), S(s, `+${F(n).more ?? ""} more`);
				}), g("click", a, () => t.cal.go(F(r)[i], "day")), d(e, a);
			};
			c(h, (e) => {
				F(n).more > 0 && e(_);
			}), d(e, u);
		}), D(h), d(e, h);
	}), D(y), D(m), G(() => h = l(m, "", h, { "--rows": F(r).length })), d(e, m), W();
}
T(["click", "keydown"]);
//#endregion
//#region plugins/stable/dav/ui/src/AgendaView.svelte
var ft = u("<div class=\"empty svelte-zo3qq8\"> </div>"), pt = u("<span class=\"loc svelte-zo3qq8\"> </span>"), mt = u("<span class=\"ic svelte-zo3qq8\" title=\"Repeats\"><!></span>"), ht = u("<span class=\"ic svelte-zo3qq8\" title=\"From a note\"><!></span>"), gt = u("<li><button><span class=\"dot svelte-zo3qq8\" aria-hidden=\"true\"></span> <span class=\"time svelte-zo3qq8\"> </span> <span class=\"what svelte-zo3qq8\"> <!></span> <!> <!> <span class=\"cal svelte-zo3qq8\"> </span></button></li>"), _t = u("<section><button class=\"date svelte-zo3qq8\" title=\"Open this day\"><span class=\"n svelte-zo3qq8\"> </span> <span class=\"w svelte-zo3qq8\"> <br/> </span></button> <ul class=\"svelte-zo3qq8\"></ul></section>"), vt = u("<div class=\"agenda svelte-zo3qq8\"><!> <!></div>"), yt = {
	hash: "svelte-zo3qq8",
	code: ".agenda.svelte-zo3qq8 {height:100%;overflow-y:auto;padding:6px 0 40px;}.empty.svelte-zo3qq8 {padding:40px;text-align:center;color:var(--text-faint);}.day.svelte-zo3qq8 {display:grid;grid-template-columns:92px 1fr;gap:8px;padding:6px 14px;border-bottom:1px solid var(--border);}.date.svelte-zo3qq8 {all:unset;cursor:pointer;display:flex;gap:8px;align-items:flex-start;padding:4px 0;color:var(--text-muted);}.n.svelte-zo3qq8 {font-size:1.5em;font-weight:650;color:var(--heading);min-width:1.6em;text-align:right;font-variant-numeric:tabular-nums;line-height:1.1;}.w.svelte-zo3qq8 {font-size:0.75em;text-transform:uppercase;letter-spacing:0.04em;line-height:1.35;}.today.svelte-zo3qq8 .n:where(.svelte-zo3qq8) {color:var(--accent-strong);}.date.svelte-zo3qq8:focus-visible, .row.svelte-zo3qq8:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}ul.svelte-zo3qq8 {list-style:none;margin:0;padding:0;display:grid;gap:1px;min-width:0;}.row.svelte-zo3qq8 {all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border-radius:var(--radius-sm);min-width:0;}.row.svelte-zo3qq8:hover {background:var(--bg-hover);}.row.sel.svelte-zo3qq8 {background:color-mix(in srgb, var(--c) 16%, var(--bg));}.dot.svelte-zo3qq8 {width:9px;height:9px;border-radius:50%;background:var(--c);flex:none;}.time.svelte-zo3qq8 {flex:none;width:11.5em;white-space:nowrap;color:var(--text-muted);font-variant-numeric:tabular-nums;font-size:0.9em;}.what.svelte-zo3qq8 {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.loc.svelte-zo3qq8 {color:var(--text-muted);}.cancel.svelte-zo3qq8 .what:where(.svelte-zo3qq8) {text-decoration:line-through;opacity:0.7;}.ic.svelte-zo3qq8 {color:var(--text-faint);flex:none;}.cal.svelte-zo3qq8 {flex:none;color:var(--text-faint);font-size:0.8em;max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n  @container (max-width: 560px) {.day.svelte-zo3qq8 {grid-template-columns:1fr;gap:0;padding:6px 10px;}.date.svelte-zo3qq8 {padding-bottom:0;}.time.svelte-zo3qq8 {width:auto;min-width:5.5em;}.cal.svelte-zo3qq8 {display:none;}\n  }"
};
function bt(e, t) {
	z(t, !0), _(e, yt);
	let n = y(t, "search", 3, !1), r = L(() => {
		if (n()) {
			let e = /* @__PURE__ */ new Map();
			for (let n of t.events) {
				let t = pe(H(n)).getTime();
				e.set(t, [...e.get(t) ?? [], n]);
			}
			return [...e.entries()].map(([e, t]) => ({
				day: new Date(e),
				evs: t
			}));
		}
		let e = [];
		for (let n = t.from; n <= t.to; n = O(n, 1)) {
			let r = le(t.events, n).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || H(e).getTime() - H(t).getTime());
			r.length && e.push({
				day: n,
				evs: r
			});
		}
		return e;
	}), i = (e) => e.color ?? t.cal.colorOf(e.calendar), a = (e) => t.selected !== null && t.selected.uid === e.uid && t.selected.rid === e.rid && t.selected.calendar === e.calendar;
	function o(e, n) {
		if (e.all_day) return "All day";
		let r = H(e), i = j(e);
		return `${R(r, n) ? A(r, t.cal.h12) : "…"} – ${R(i, n) || i.getTime() - pe(n).getTime() <= 864e5 && i.getHours() === 0 && i.getMinutes() === 0 ? A(i, t.cal.h12) : "…"}`;
	}
	var s = vt(), u = k(s), p = (e) => {
		var t = ft(), r = Y(t, !0);
		G(() => S(r, n() ? "No event matches." : "Nothing in the coming days.")), d(e, t);
	};
	c(u, (e) => {
		F(r).length || e(p);
	});
	var m = M(u, 2);
	Q(m, 17, () => F(r), (e) => e.day.getTime(), (e, n) => {
		var r = _t();
		let s;
		var u = k(r), p = k(u), m = Y(p, !0), h = M(p, 2), _ = k(h, !0), v = M(_, 2, !0);
		D(h), D(u);
		var y = M(u, 2);
		Q(y, 21, () => F(n).evs, (e) => e.calendar + e.uid + (e.rid ?? ""), (e, r) => {
			var s = gt(), u = k(s);
			let p, m;
			var h = M(k(u), 2), _ = Y(h, !0), v = M(h, 2), y = k(v, !0), b = M(y), x = (e) => {
				var t = pt(), n = Y(t);
				G(() => S(n, ` · ${F(r).location ?? ""}`)), d(e, t);
			};
			c(b, (e) => {
				F(r).location && e(x);
			}), D(v);
			var C = M(v, 2), w = (e) => {
				var t = mt();
				$(k(t), {
					name: "repeat",
					size: 13
				}), D(t), d(e, t);
			};
			c(C, (e) => {
				F(r).recurring && e(w);
			});
			var T = M(C, 2), E = (e) => {
				var t = ht();
				$(k(t), {
					name: "note",
					size: 13
				}), D(t), d(e, t);
			}, O = L(() => oe(F(r)));
			c(T, (e) => {
				F(O) && e(E);
			});
			var A = M(T, 2), j = Y(A, !0);
			D(u), D(s), G((e, t, n) => {
				p = f(u, 1, "row svelte-zo3qq8", null, p, {
					sel: e,
					cancel: F(r).status === "CANCELLED"
				}), m = l(u, "", m, { "--c": t }), S(_, n), S(y, F(r).summary || "(no title)"), S(j, F(r).calendar_name);
			}, [
				() => a(F(r)),
				() => i(F(r)),
				() => o(F(r), F(n).day)
			]), g("click", u, (e) => t.onselect(F(r), e.currentTarget.getBoundingClientRect())), d(e, s);
		}), D(y), D(r), G((e, t, n, i) => {
			s = f(r, 1, "day svelte-zo3qq8", null, s, { today: e }), S(m, t), S(_, n), S(v, i);
		}, [
			() => R(F(n).day, t.cal.now),
			() => F(n).day.getDate(),
			() => F(n).day.toLocaleDateString(void 0, { weekday: "short" }),
			() => F(n).day.toLocaleDateString(void 0, {
				month: "short",
				year: F(n).day.getFullYear() === t.cal.now.getFullYear() ? void 0 : "numeric"
			})
		]), g("click", u, () => t.cal.go(F(n).day, "day")), d(e, r);
	}), D(s), d(e, s), W();
}
T(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/YearView.svelte
var xt = u("<span class=\"h svelte-18a11kl\"> </span>"), St = u("<button> </button>"), Ct = u("<span></span>"), wt = u("<section><button class=\"mname svelte-18a11kl\"> </button> <div class=\"days svelte-18a11kl\"><!> <!></div></section>"), Tt = u("<div class=\"year svelte-18a11kl\"></div>"), Et = {
	hash: "svelte-18a11kl",
	code: ".year.svelte-18a11kl {height:100%;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(210px, 1fr));gap:18px 24px;padding:16px 20px 40px;align-content:start;}.mname.svelte-18a11kl {all:unset;cursor:pointer;font-weight:650;color:var(--heading);margin-bottom:6px;display:block;}.mname.svelte-18a11kl:hover {color:var(--accent-strong);}.days.svelte-18a11kl {display:grid;grid-template-columns:repeat(7, 1fr);gap:2px;}.h.svelte-18a11kl {font-size:0.7em;color:var(--text-faint);text-align:center;}.d.svelte-18a11kl {all:unset;cursor:pointer;text-align:center;font-size:0.78em;padding:3px 0;border-radius:var(--radius-sm);font-variant-numeric:tabular-nums;color:var(--text-muted);background:color-mix(in srgb, var(--accent) calc(var(--k) * 55%), transparent);}.d.svelte-18a11kl:hover {outline:1px solid var(--accent);}.d.svelte-18a11kl:focus-visible {outline:2px solid var(--accent);}.d.today.svelte-18a11kl {background:var(--accent);color:var(--accent-fg);font-weight:700;}"
};
function Dt(e, t) {
	z(t, !0), _(e, Et);
	let r = L(() => t.cal.cursor.getFullYear()), i = L(() => {
		let e = /* @__PURE__ */ new Map();
		for (let n = new Date(F(r), 0, 1); n.getFullYear() === F(r); n = O(n, 1)) e.set(n.toDateString(), le(t.cal.events, n).length);
		return e;
	}), a = L(() => Math.max(1, ...F(i).values()));
	function o(e) {
		let n = _e(new Date(F(r), e, 1), t.cal.first);
		return Array.from({ length: 42 }, (e, t) => O(n, t));
	}
	let s = L(() => Array.from({ length: 7 }, (e, n) => O(_e(/* @__PURE__ */ new Date(), t.cal.first), n).toLocaleDateString(void 0, { weekday: "narrow" })));
	var u = Tt();
	Q(u, 20, () => Array.from({ length: 12 }, (e, t) => t), (e) => e, (e, u) => {
		var p = wt(), m = k(p), h = Y(m, !0), _ = M(m, 2), v = k(_);
		Q(v, 17, () => F(s), n, (e, t) => {
			var n = xt(), r = Y(n, !0);
			G(() => S(r, F(t))), d(e, n);
		});
		var y = M(v, 2);
		Q(y, 17, () => o(u), (e) => e.getTime(), (e, n) => {
			let r = L(() => F(n).getMonth() === u ? F(i).get(F(n).toDateString()) ?? 0 : 0);
			var o = ce(), s = q(o), p = (e) => {
				var i = St();
				let o, s;
				var c = Y(i, !0);
				G((e, t, n) => {
					o = f(i, 1, "d svelte-18a11kl", null, o, { today: e }), B(i, "title", `${t ?? ""}: ${F(r) ?? ""} event${F(r) === 1 ? "" : "s"}`), s = l(i, "", s, { "--k": F(r) / F(a) }), S(c, n);
				}, [
					() => R(F(n), t.cal.now),
					() => F(n).toLocaleDateString(),
					() => F(n).getDate()
				]), g("click", i, () => t.cal.go(F(n), "day")), d(e, i);
			}, m = L(() => F(n).getMonth() === u), h = (e) => {
				var t = Ct();
				d(e, t);
			};
			c(s, (e) => {
				F(m) ? e(p) : e(h, -1);
			}), d(e, o);
		}), D(_), D(p), G((e) => S(h, e), [() => new Date(F(r), u, 1).toLocaleDateString(void 0, { month: "long" })]), g("click", m, () => t.cal.go(new Date(F(r), u, 1), "month")), d(e, p);
	}), D(u), d(e, u), W();
}
T(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/CalendarPicker.svelte
var Ot = u("<option> </option>"), kt = u("<optgroup></optgroup>"), At = u("<span><span class=\"dot svelte-zssqw9\" aria-hidden=\"true\"></span> <select aria-label=\"Calendar\" class=\"svelte-zssqw9\"><!><!></select></span>"), jt = {
	hash: "svelte-zssqw9",
	code: ".pick.svelte-zssqw9 {display:inline-flex;align-items:center;gap:8px;min-width:0;flex:1;}.pick.compact.svelte-zssqw9 {flex:0 1 auto;}.dot.svelte-zssqw9 {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}select.svelte-zssqw9 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 28px 5px 8px;min-width:0;flex:1;color-scheme:light dark;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.compact.svelte-zssqw9 select:where(.svelte-zssqw9) {flex:0 1 auto;max-width:16em;}select.svelte-zssqw9:disabled {opacity:0.6;}select.svelte-zssqw9:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}"
};
function Mt(e, t) {
	z(t, !0), _(e, jt);
	let n = y(t, "value", 15), r = y(t, "disabled", 3, !1), i = y(t, "compact", 3, !1), a = L(() => t.cal.byAccount(!0)), o = L(() => F(a).length > 1), s = (e) => t.cal.sources.find((t) => t.id === e)?.name ?? e;
	var u = At();
	let m;
	var g = k(u);
	let v;
	var b = M(g, 2), x = k(b), C = (e) => {
		var t = Ot(), r = Y(t, !0), i = {};
		G((e) => {
			S(r, e), i !== (i = n()) && (t.value = (t.__value = i) ?? "");
		}, [() => s(n())]), d(e, t);
	}, w = L(() => n() && !F(a).some((e) => e.items.some((e) => e.id === n())));
	c(x, (e) => {
		F(w) && e(C);
	});
	var T = M(x);
	Q(T, 17, () => F(a), (e) => e.account.name, (e, t) => {
		var n = ce(), r = q(n), i = (e) => {
			var n = kt();
			Q(n, 21, () => F(t).items, (e) => e.id, (e, t) => {
				var n = Ot(), r = Y(n, !0), i = {};
				G(() => {
					S(r, F(t).name), i !== (i = F(t).id) && (n.value = (n.__value = i) ?? "");
				}), d(e, n);
			}), D(n), G(() => B(n, "label", F(t).account.name)), d(e, n);
		}, a = (e) => {
			var n = ce(), r = q(n);
			Q(r, 17, () => F(t).items, (e) => e.id, (e, t) => {
				var n = Ot(), r = Y(n, !0), i = {};
				G(() => {
					S(r, F(t).name), i !== (i = F(t).id) && (n.value = (n.__value = i) ?? "");
				}), d(e, n);
			}), d(e, n);
		};
		c(r, (e) => {
			F(o) ? e(i) : e(a, -1);
		}), d(e, n);
	}), D(b), h(b), D(u), G((e) => {
		m = f(u, 1, "pick svelte-zssqw9", null, m, { compact: i() }), v = l(g, "", v, { "--c": e }), b.disabled = r(), B(b, "title", n());
	}, [() => n() ? t.cal.colorOf(n()) : "transparent"]), p(b, n), d(e, u), W();
}
//#endregion
//#region plugins/stable/dav/ui/src/Popover.svelte
var Nt = u("<button class=\"tool svelte-id2g6u\" title=\"Edit (e)\"><!></button> <button class=\"tool svelte-id2g6u\" title=\"Delete (Del)\"><!></button>", 1), Pt = u("<p class=\"sub svelte-id2g6u\"><!> </p>"), Ft = u("<p class=\"sub warn svelte-id2g6u\">Cancelled</p>"), It = u("<a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a>"), Lt = u("<p class=\"line svelte-id2g6u\"><!><!></p>"), Rt = u("<li> <span class=\"faint svelte-id2g6u\">organiser</span></li>"), zt = u("<li> <span> </span></li>"), Bt = u("<li class=\"faint svelte-id2g6u\"> </li>"), Vt = u("<div class=\"line people svelte-id2g6u\"><!> <ul class=\"svelte-id2g6u\"><!> <!> <!></ul></div>"), Ht = u("<p class=\"line desc svelte-id2g6u\"><!><span class=\"svelte-id2g6u\"> </span></p>"), Ut = u("<button class=\"atlas-btn svelte-id2g6u\"><!>Open the note</button>"), Wt = u("<p class=\"line svelte-id2g6u\"><!><a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a></p>"), Gt = u("<div class=\"bar svelte-id2g6u\"><!> <button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <div class=\"head svelte-id2g6u\"><span class=\"sq svelte-id2g6u\"></span> <div><h2> </h2> <p class=\"when svelte-id2g6u\"> </p> <!> <!></div></div> <!> <!> <!> <p class=\"line faint svelte-id2g6u\"><!> </p> <!> <!>", 1), Kt = u("<div class=\"bar svelte-id2g6u\"><button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <input class=\"title svelte-id2g6u\" placeholder=\"Add a title\" aria-label=\"Title\"/> <p class=\"when svelte-id2g6u\"> </p> <div class=\"line faint svelte-id2g6u\"><!><!></div> <div class=\"acts svelte-id2g6u\"><button class=\"atlas-btn svelte-id2g6u\">More options</button> <button class=\"atlas-btn primary svelte-id2g6u\">Save</button></div>", 1), qt = u("<div class=\"pop svelte-id2g6u\" role=\"dialog\"><!></div>"), Jt = {
	hash: "svelte-id2g6u",
	code: ".pop.svelte-id2g6u {position:absolute;z-index:50;width:min(360px, calc(100% - 16px));box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:8px 14px 14px;display:grid;gap:8px; animation: svelte-id2g6u-in 120ms var(--ease);}\n  @keyframes svelte-id2g6u-in { from { opacity: 0; transform: translateY(4px); } }\n  @media (prefers-reduced-motion: reduce) {.pop.svelte-id2g6u { animation: none;} }.bar.svelte-id2g6u {display:flex;justify-content:flex-end;gap:2px;margin:0 -8px -4px 0;}.tool.svelte-id2g6u {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-id2g6u:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-id2g6u:focus-visible {outline:2px solid var(--accent);}.head.svelte-id2g6u {display:flex;gap:12px;align-items:flex-start;}.sq.svelte-id2g6u {width:14px;height:14px;border-radius:4px;background:var(--c);flex:none;margin-top:5px;}h2.svelte-id2g6u {margin:0;font-size:1.15em;font-weight:600;color:var(--heading);overflow-wrap:anywhere;}.cancel.svelte-id2g6u {text-decoration:line-through;}.when.svelte-id2g6u {margin:2px 0 0;color:var(--text-muted);font-size:0.92em;}.sub.svelte-id2g6u {margin:2px 0 0;color:var(--text-faint);font-size:0.85em;display:flex;align-items:center;gap:4px;}.warn.svelte-id2g6u {color:var(--red);}.line.svelte-id2g6u {margin:0;display:flex;gap:10px;align-items:flex-start;color:var(--text);font-size:0.9em;min-width:0;overflow-wrap:anywhere;}.line.svelte-id2g6u .icon {margin-top:2px;color:var(--text-faint);}.desc.svelte-id2g6u span:where(.svelte-id2g6u) {white-space:pre-wrap;max-height:9em;overflow:auto;}.people.svelte-id2g6u ul:where(.svelte-id2g6u) {list-style:none;margin:0;padding:0;display:grid;gap:2px;}.faint.svelte-id2g6u {color:var(--text-faint);}.ps.svelte-id2g6u {font-size:0.8em;color:var(--text-faint);}.ps-accepted.svelte-id2g6u {color:var(--green);}.ps-declined.svelte-id2g6u {color:var(--red);}.ps-tentative.svelte-id2g6u {color:var(--yellow);}a.svelte-id2g6u {color:var(--accent);}.atlas-btn.svelte-id2g6u {display:inline-flex;align-items:center;gap:6px;justify-self:start;}.title.svelte-id2g6u {all:unset;font-size:1.15em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--accent);padding:4px 0;}.title.svelte-id2g6u::placeholder {color:var(--text-faint);font-weight:400;}.acts.svelte-id2g6u {display:flex;justify-content:flex-end;gap:8px;}"
};
function Yt(e, n) {
	z(n, !0), _(e, Jt);
	let r = y(n, "e", 3, null), i = y(n, "draft", 3, null), o = P(void 0), s = P(""), u = P(U(n.cal.newCalendar() ?? "")), p = P(void 0), m = P(U({
		left: 0,
		top: 0
	}));
	function h() {
		let e = F(o)?.offsetWidth ?? 340, t = F(o)?.offsetHeight ?? 200, r = n.at.right - n.box.left + 8;
		r + e > n.box.width - 8 && (r = n.at.left - n.box.left - e - 8), r < 8 && (r = Math.max(8, Math.min(n.box.width - e - 8, n.at.left - n.box.left)));
		let i = n.at.top - n.box.top;
		i + t > n.box.height - 8 && (i = Math.max(8, n.box.height - t - 8)), Z(m, {
			left: r,
			top: Math.max(8, i)
		}, !0);
	}
	he(() => {
		h(), F(p)?.focus();
	});
	async function v() {
		if (!i()) return;
		let e = (e) => String(e).padStart(2, "0"), t = (t) => `${t.getFullYear()}-${e(t.getMonth() + 1)}-${e(t.getDate())}T${e(t.getHours())}:${e(t.getMinutes())}`, r = (e) => t(e).slice(0, 10);
		n.onclose(), await n.cal.create({
			summary: F(s).trim() || "(no title)",
			start: i().all_day ? r(i().start) : t(i().start),
			end: i().all_day ? r(i().end) : t(i().end),
			all_day: i().all_day,
			calendar: F(u) || void 0
		});
	}
	let b = L(() => r() ? oe(r()) : null), x = L(() => i() ? i().all_day ? `${i().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · all day` : `${i().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · ${A(i().start, n.cal.h12)} – ${A(i().end, n.cal.h12)}` : "");
	var w = qt();
	let T;
	var O = k(w), j = (e) => {
		var t = Gt(), i = q(t), a = k(i), o = (e) => {
			var t = Nt(), i = q(t);
			$(k(i), {
				name: "pen",
				size: 15
			}), D(i);
			var a = M(i, 2);
			$(k(a), {
				name: "trash",
				size: 15
			}), D(a), g("click", i, function(...e) {
				n.onedit?.apply(this, e);
			}), g("click", a, () => {
				n.onclose(), n.cal.remove(r());
			}), d(e, t);
		};
		c(a, (e) => {
			r().writable && e(o);
		});
		var s = M(a, 2);
		$(k(s), {
			name: "x",
			size: 15
		}), D(s), D(i);
		var u = M(i, 2), p = k(u);
		let m;
		var h = M(p, 2), _ = k(h);
		let v;
		var y = Y(_, !0), x = M(_, 2), w = Y(x, !0), T = M(x, 2), O = (e) => {
			var t = Pt(), n = k(t);
			$(n, {
				name: "repeat",
				size: 12
			});
			var i = M(n);
			D(t), G((e) => S(i, ` ${e ?? ""}`), [() => te(r().rrule) || "Repeats"]), d(e, t);
		};
		c(T, (e) => {
			r().recurring && e(O);
		});
		var A = M(T, 2), j = (e) => {
			var t = Ft();
			d(e, t);
		};
		c(A, (e) => {
			r().status === "CANCELLED" && e(j);
		}), D(h), D(u);
		var N = M(u, 2), P = (e) => {
			var t = Lt(), n = k(t);
			$(n, {
				name: "pin",
				size: 14
			});
			var i = M(n), a = (e) => {
				var t = It(), n = Y(t, !0);
				G(() => {
					B(t, "href", r().location), S(n, r().location);
				}), d(e, t);
			}, o = L(() => /^https?:\/\//.test(r().location)), s = (e) => {
				var t = C();
				G(() => S(t, r().location)), d(e, t);
			};
			c(i, (e) => {
				F(o) ? e(a) : e(s, -1);
			}), D(t), d(e, t);
		};
		c(N, (e) => {
			r().location && e(P);
		});
		var I = M(N, 2), R = (e) => {
			var t = Vt(), n = k(t);
			$(n, {
				name: "people",
				size: 14
			});
			var i = M(n, 2), a = k(i), o = (e) => {
				var t = Rt(), n = k(t);
				ee(), D(t), G(() => S(n, `${r().organizer.name ?? r().organizer.email ?? ""} `)), d(e, t);
			};
			c(a, (e) => {
				r().organizer && e(o);
			});
			var s = M(a, 2);
			Q(s, 17, () => (r().attendees ?? []).slice(0, 8), (e) => e.email, (e, t) => {
				var n = zt(), r = k(n), i = M(r), a = Y(i, !0);
				D(n), G((e, n) => {
					S(r, `${F(t).name ?? F(t).email ?? ""} `), f(i, 1, `ps ps-${e ?? ""}`, "svelte-id2g6u"), S(a, n);
				}, [() => (F(t).partstat ?? "needs-action").toLowerCase(), () => (F(t).partstat ?? "NEEDS-ACTION").toLowerCase().replace("needs-action", "no answer")]), d(e, n);
			});
			var l = M(s, 2), u = (e) => {
				var t = Bt(), n = Y(t);
				G(() => S(n, `and ${(r().attendees?.length ?? 0) - 8} more`)), d(e, t);
			};
			c(l, (e) => {
				(r().attendees?.length ?? 0) > 8 && e(u);
			}), D(i), D(t), d(e, t);
		};
		c(I, (e) => {
			(r().organizer || r().attendees?.length) && e(R);
		});
		var z = M(I, 2), ne = (e) => {
			var t = Ht(), n = k(t);
			$(n, {
				name: "text",
				size: 14
			});
			var i = M(n), a = Y(i, !0);
			D(t), G(() => S(a, r().description)), d(e, t);
		};
		c(z, (e) => {
			r().description && e(ne);
		});
		var re = M(z, 2), V = k(re);
		$(V, {
			name: "calendar",
			size: 14
		});
		var H = M(V);
		D(re);
		var U = M(re, 2), ie = (e) => {
			var t = Ut();
			$(k(t), {
				name: "note",
				size: 14
			}), ee(), D(t), g("click", t, () => {
				n.cal.atlas.open(F(b)), n.onclose();
			}), d(e, t);
		};
		c(U, (e) => {
			F(b) && e(ie);
		});
		var W = M(U, 2), ae = (e) => {
			var t = Wt(), n = k(t);
			$(n, {
				name: "link",
				size: 14
			});
			var i = M(n), a = Y(i, !0);
			D(t), G(() => {
				B(i, "href", r().url), S(a, r().url);
			}), d(e, t);
		};
		c(W, (e) => {
			r().url && e(ae);
		}), G((e, t) => {
			m = l(p, "", m, { "--c": e }), v = f(_, 1, "svelte-id2g6u", null, v, { cancel: r().status === "CANCELLED" }), S(y, r().summary || "(no title)"), S(w, t), S(H, `${r().calendar_name ?? ""}${r().writable ? "" : " · read-only"}`);
		}, [() => r().color ?? n.cal.colorOf(r().calendar), () => E(r(), n.cal.h12)]), g("click", s, function(...e) {
			n.onclose?.apply(this, e);
		}), d(e, t);
	}, N = (e) => {
		var r = Kt(), i = q(r), o = k(i);
		$(k(o), {
			name: "x",
			size: 15
		}), D(o), D(i);
		var l = M(i, 2);
		t(l), a(l, (e) => Z(p, e), () => F(p));
		var f = M(l, 2), m = Y(f, !0), h = M(f, 2), _ = k(h);
		$(_, {
			name: "calendar",
			size: 14
		});
		var y = M(_), b = (e) => {
			Mt(e, {
				get cal() {
					return n.cal;
				},
				get value() {
					return F(u);
				},
				set value(e) {
					Z(u, e, !0);
				}
			});
		}, w = (e) => {
			var t = C("No calendar to write to");
			d(e, t);
		};
		c(y, (e) => {
			F(u) ? e(b) : e(w, -1);
		}), D(h);
		var T = M(h, 2), E = k(T), O = M(E, 2);
		D(T), G(() => {
			S(m, F(x)), O.disabled = !F(u);
		}), g("click", o, function(...e) {
			n.onclose?.apply(this, e);
		}), g("keydown", l, (e) => {
			e.key === "Enter" ? (e.preventDefault(), v()) : e.key === "Escape" && (e.stopPropagation(), n.onclose());
		}), V(l, () => F(s), (e) => Z(s, e)), g("click", E, () => n.onmore(F(s), F(u))), g("click", O, v), d(e, r);
	};
	c(O, (e) => {
		r() ? e(j) : i() && e(N, 1);
	}), D(w), a(w, (e) => Z(o, e), () => F(o)), G(() => {
		B(w, "aria-label", r() ? r().summary : "New event"), T = l(w, "", T, {
			left: `${F(m).left ?? ""}px`,
			top: `${F(m).top ?? ""}px`
		});
	}), d(e, w), W();
}
T(["click", "keydown"]);
//#endregion
//#region plugins/stable/dav/ui/src/Editor.svelte
var Xt = u("<div class=\"scrim svelte-aeatm8\" role=\"presentation\"></div>"), Zt = u("<header class=\"svelte-aeatm8\"><h2 class=\"svelte-aeatm8\"> </h2> <button class=\"tool svelte-aeatm8\" aria-label=\"Close\"><!></button></header>"), Qt = u("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Starts at\"/>"), $t = u("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Ends at\"/>"), en = u("<option> </option>"), tn = u("<div class=\"row svelte-aeatm8\"><!><span class=\"guests svelte-aeatm8\"> </span></div>"), nn = u("<div class=\"atlas-notice error\"> </div>"), rn = u("<!> <div tabindex=\"-1\"><!> <input class=\"title svelte-aeatm8\" placeholder=\"Add a title\" aria-label=\"Title\"/> <div class=\"row when svelte-aeatm8\"><!> <div class=\"times svelte-aeatm8\"><input type=\"date\" aria-label=\"Starts on\" class=\"svelte-aeatm8\"/> <!> <span class=\"to svelte-aeatm8\">to</span> <!> <input type=\"date\" aria-label=\"Ends on\" class=\"svelte-aeatm8\"/> <label class=\"check svelte-aeatm8\"><input type=\"checkbox\" class=\"svelte-aeatm8\"/> All day</label></div></div> <div class=\"row svelte-aeatm8\"><!> <select aria-label=\"Repeat\" class=\"svelte-aeatm8\"></select></div> <div class=\"row svelte-aeatm8\"><!><input placeholder=\"Add a place\" aria-label=\"Place\" class=\"svelte-aeatm8\"/></div> <div class=\"row svelte-aeatm8\"><!> <!></div> <!> <div class=\"row top svelte-aeatm8\"><!><textarea rows=\"5\" placeholder=\"Add a description\" aria-label=\"Description\" class=\"svelte-aeatm8\"></textarea></div> <p class=\"zone svelte-aeatm8\"> </p> <!> <footer class=\"svelte-aeatm8\"><span class=\"hint svelte-aeatm8\">Ctrl+Enter saves</span> <button class=\"atlas-btn\">Cancel</button> <button class=\"atlas-btn primary\">Save</button></footer></div>", 1), an = {
	hash: "svelte-aeatm8",
	code: ".scrim.svelte-aeatm8 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 55%, transparent);z-index:70;}.ed.svelte-aeatm8 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(620px, calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:12px 18px 16px;display:grid;gap:12px;}.ed.bare.svelte-aeatm8 {position:static;transform:none;width:auto;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;background:var(--bg);padding:16px;align-content:start;}header.svelte-aeatm8 {display:flex;align-items:center;}h2.svelte-aeatm8 {flex:1;margin:0;font-size:0.85em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.tool.svelte-aeatm8 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;}.tool.svelte-aeatm8:hover {background:var(--bg-hover);}.title.svelte-aeatm8 {all:unset;font-size:1.35em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--border-strong);padding:4px 0;}.title.svelte-aeatm8:focus {border-bottom-color:var(--accent);}.title.svelte-aeatm8:focus-visible {outline:none;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8) {appearance:none;-webkit-appearance:none;padding-right:28px;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8):disabled {opacity:0.6;}.row.svelte-aeatm8 {display:flex;gap:12px;align-items:center;color:var(--text-faint);min-width:0;}.row.top.svelte-aeatm8 {align-items:flex-start;}.times.svelte-aeatm8 {display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.to.svelte-aeatm8 {color:var(--text-muted);}input.svelte-aeatm8:not(.title):not([type=checkbox]), select.svelte-aeatm8, textarea.svelte-aeatm8 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 8px;min-width:0;color-scheme:light dark;}.row.svelte-aeatm8 > input:where(.svelte-aeatm8), .row.svelte-aeatm8 > select:where(.svelte-aeatm8), textarea.svelte-aeatm8 {flex:1;}textarea.svelte-aeatm8 {resize:vertical;}input.svelte-aeatm8:focus-visible, select.svelte-aeatm8:focus-visible, textarea.svelte-aeatm8:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.hm.svelte-aeatm8 {width:5.5em;font-variant-numeric:tabular-nums;text-align:center;}.check.svelte-aeatm8 {display:flex;gap:6px;align-items:center;color:var(--text);margin-left:6px;}.guests.svelte-aeatm8 {color:var(--text);}.zone.svelte-aeatm8 {margin:0;color:var(--text-faint);font-size:0.82em;}footer.svelte-aeatm8 {display:flex;gap:8px;align-items:center;justify-content:flex-end;}.hint.svelte-aeatm8 {flex:1;color:var(--text-faint);font-size:0.82em;}"
};
function on(e, n) {
	z(n, !0), _(e, an);
	let r = y(n, "e", 3, null), i = y(n, "title", 3, ""), o = y(n, "calendar", 3, ""), s = y(n, "frame", 3, "sheet"), l = U({
		summary: r()?.summary ?? i(),
		all_day: n.allDay,
		sday: n.start.slice(0, 10),
		stime: n.start.slice(11, 16) || "09:00",
		eday: n.end.slice(0, 10),
		etime: n.end.slice(11, 16) || "10:00",
		location: r()?.location ?? "",
		description: r()?.description ?? "",
		rrule: r()?.rrule ?? "",
		calendar: r()?.calendar ?? (o() || n.cal.newCalendar()) ?? ""
	}), u = P(void 0), v = P("");
	he(() => F(u)?.focus());
	let b = L(() => {
		let e = ie(/* @__PURE__ */ new Date(`${l.sday}T12:00`));
		return l.rrule && !e.some((e) => e.value === l.rrule) && e.push({
			value: l.rrule,
			label: te(l.rrule) || l.rrule
		}), e;
	}), x = L(() => n.cal.writable());
	function C() {
		return {
			start: l.all_day ? l.sday : `${l.sday}T${l.stime}`,
			end: l.all_day ? (() => {
				let e = O(/* @__PURE__ */ new Date(`${l.eday}T12:00`), 1);
				return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
			})() : `${l.eday}T${l.etime}`
		};
	}
	async function w() {
		let { start: e, end: t } = C();
		if (t <= e && !(l.all_day && t > e)) {
			Z(v, "The end is before the start.");
			return;
		}
		let i = {
			summary: l.summary,
			start: e,
			end: t,
			all_day: l.all_day,
			location: l.location,
			description: l.description,
			rrule: l.rrule
		};
		if (!r()) {
			n.onclose(), await n.cal.create({
				...i,
				calendar: l.calendar || void 0
			});
			return;
		}
		let a = await n.cal.askScope(r(), "Change");
		a && (n.onclose(), await n.cal.change(r(), {
			...i,
			move_to: l.calendar && l.calendar !== r().calendar ? l.calendar : void 0,
			from_start: r().start
		}, a, "Saved"));
	}
	function T(e) {
		e.key === "Escape" ? (e.stopPropagation(), n.onclose()) : e.key === "Enter" && (e.ctrlKey || e.metaKey) && (e.preventDefault(), w());
	}
	function E(e, t) {
		let n = e.trim().toLowerCase().match(/^(\d{1,2})(?:[:h.]?(\d{2}))?\s*(am|pm|h)?$/);
		if (!n) return t;
		let r = Number(n[1]), i = Number(n[2] ?? 0);
		return n[3] === "pm" && r < 12 && (r += 12), n[3] === "am" && r === 12 && (r = 0), r > 23 || i > 59 ? t : `${String(r).padStart(2, "0")}:${String(i).padStart(2, "0")}`;
	}
	function A() {
		if (`${l.eday}T${l.etime}` <= `${l.sday}T${l.stime}` && (l.eday = l.sday, !l.all_day)) {
			let [e, t] = l.stime.split(":").map(Number);
			l.etime = `${String(Math.min(23, e + 1)).padStart(2, "0")}:${String(t).padStart(2, "0")}`;
		}
	}
	var j = rn(), N = q(j), I = (e) => {
		var t = Xt();
		g("click", t, function(...e) {
			n.onclose?.apply(this, e);
		}), d(e, t);
	};
	c(N, (e) => {
		s() === "sheet" && e(I);
	});
	var R = M(N, 2);
	let ne;
	var re = k(R), H = (e) => {
		var t = Zt(), i = k(t), a = Y(i, !0), o = M(i, 2);
		$(k(o), { name: "x" }), D(o), D(t), G(() => S(a, r() ? "Edit event" : "New event")), g("click", o, function(...e) {
			n.onclose?.apply(this, e);
		}), d(e, t);
	};
	c(re, (e) => {
		s() === "sheet" && e(H);
	});
	var ae = M(re, 2);
	t(ae), a(ae, (e) => Z(u, e), () => F(u));
	var K = M(ae, 2), oe = k(K);
	$(oe, { name: "clock" });
	var ce = M(oe, 2), le = k(ce);
	t(le);
	var ue = M(le, 2), J = (e) => {
		var n = Qt();
		t(n), g("change", n, () => {
			l.stime = E(l.stime, "09:00"), A();
		}), V(n, () => l.stime, (e) => l.stime = e), d(e, n);
	};
	c(ue, (e) => {
		l.all_day || e(J);
	});
	var de = M(ue, 4), fe = (e) => {
		var n = $t();
		t(n), g("change", n, () => l.etime = E(l.etime, "10:00")), V(n, () => l.etime, (e) => l.etime = e), d(e, n);
	};
	c(de, (e) => {
		l.all_day || e(fe);
	});
	var X = M(de, 2);
	t(X);
	var pe = M(X, 2), me = k(pe);
	t(me), ee(), D(pe), D(ce), D(K);
	var ge = M(K, 2), _e = k(ge);
	$(_e, { name: "repeat" });
	var ve = M(_e, 2);
	Q(ve, 21, () => F(b), (e) => e.value, (e, t) => {
		var n = en(), r = Y(n, !0), i = {};
		G(() => {
			S(r, F(t).label), i !== (i = F(t).value) && (n.value = (n.__value = i) ?? "");
		}), d(e, n);
	}), D(ve), h(ve), D(ge);
	var ye = M(ge, 2), be = k(ye);
	$(be, { name: "pin" });
	var xe = M(be);
	t(xe), D(ye);
	var Se = M(ye, 2), Ce = k(Se);
	$(Ce, { name: "calendar" });
	var we = M(Ce, 2);
	{
		let e = L(() => !!r() && r().recurring);
		Mt(we, {
			get cal() {
				return n.cal;
			},
			get disabled() {
				return F(e);
			},
			get value() {
				return l.calendar;
			},
			set value(e) {
				l.calendar = e;
			}
		});
	}
	D(Se);
	var Te = M(Se, 2), Ee = (e) => {
		var t = tn(), n = k(t);
		$(n, { name: "people" });
		var i = M(n), a = Y(i, !0);
		D(t), G((e) => S(a, e), [() => r().attendees.map((e) => e.name ?? e.email).join(", ")]), d(e, t);
	};
	c(Te, (e) => {
		r()?.attendees?.length && e(Ee);
	});
	var De = M(Te, 2), Oe = k(De);
	$(Oe, { name: "text" });
	var ke = M(Oe);
	se(ke), D(De);
	var Ae = M(De, 2), je = Y(Ae), Me = M(Ae, 2), Ne = (e) => {
		var t = nn(), n = Y(t, !0);
		G(() => S(n, F(v))), d(e, t);
	};
	c(Me, (e) => {
		F(v) && e(Ne);
	});
	var Pe = M(Me, 2), Fe = M(k(Pe), 2), Ie = M(Fe, 2);
	D(Pe), D(R), G((e) => {
		ne = f(R, 1, "ed svelte-aeatm8", null, ne, { bare: s() === "dialog" }), B(R, "role", s() === "sheet" ? "dialog" : "form"), B(R, "aria-label", r() ? "Edit event" : "New event"), B(R, "aria-modal", s() === "sheet" ? "true" : void 0), S(je, `Times in your zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""}${e ?? ""}`), Ie.disabled = !F(x).length;
	}, [() => r()?.tzid && r().tzid !== Intl.DateTimeFormat().resolvedOptions().timeZone ? ` · written in ${r().tzid}` : ""]), g("keydown", R, T), V(ae, () => l.summary, (e) => l.summary = e), g("change", le, A), V(le, () => l.sday, (e) => l.sday = e), V(X, () => l.eday, (e) => l.eday = e), m(me, () => l.all_day, (e) => l.all_day = e), p(ve, () => l.rrule, (e) => l.rrule = e), V(xe, () => l.location, (e) => l.location = e), V(ke, () => l.description, (e) => l.description = e), g("click", Fe, function(...e) {
		n.onclose?.apply(this, e);
	}), g("click", Ie, w), d(e, j), W();
}
T([
	"click",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/Toasts.svelte
var sn = u("<button class=\"svelte-osdry5\">Undo</button>"), cn = u("<div><span class=\"text svelte-osdry5\"> </span> <!> <button class=\"x svelte-osdry5\" aria-label=\"Close\">×</button></div>"), ln = u("<div class=\"toasts svelte-osdry5\" aria-live=\"polite\"></div>"), un = {
	hash: "svelte-osdry5",
	code: ".toasts.svelte-osdry5 {position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:60;display:grid;gap:8px;justify-items:center;pointer-events:none;width:min(560px, calc(100% - 32px));}.toast.svelte-osdry5 {pointer-events:auto;display:flex;align-items:center;gap:12px;padding:9px 10px 9px 14px;border-radius:var(--radius);background:var(--heading);color:var(--bg);box-shadow:var(--shadow-md, var(--shadow-sm));max-width:100%; animation: svelte-osdry5-in 120ms var(--ease);}.toast.error.svelte-osdry5 {background:var(--red);color:#fff;}.text.svelte-osdry5 {min-width:0;overflow-wrap:anywhere;}button.svelte-osdry5 {all:unset;cursor:pointer;font-weight:700;color:var(--accent);padding:2px 6px;border-radius:var(--radius-sm);}.error.svelte-osdry5 button:where(.svelte-osdry5) {color:#fff;text-decoration:underline;}button.svelte-osdry5:hover {background:color-mix(in srgb, currentColor 14%, transparent);}button.svelte-osdry5:focus-visible {outline:2px solid currentColor;}.x.svelte-osdry5 {color:inherit;opacity:0.7;font-weight:400;}\n  @keyframes svelte-osdry5-in { from { opacity: 0; transform: translateY(6px); } }\n  @media (prefers-reduced-motion: reduce) {.toast.svelte-osdry5 { animation: none;} }"
};
function dn(e, t) {
	z(t, !0), _(e, un);
	var n = ln();
	Q(n, 21, () => t.cal.toasts, (e) => e.id, (e, n) => {
		var r = cn();
		let i;
		var a = k(r), o = Y(a, !0), s = M(a, 2), l = (e) => {
			var r = sn();
			g("click", r, async () => {
				t.cal.dismiss(F(n).id), await F(n).undo?.();
			}), d(e, r);
		};
		c(s, (e) => {
			F(n).undo && e(l);
		});
		var u = M(s, 2);
		D(r), G(() => {
			i = f(r, 1, "toast svelte-osdry5", null, i, { error: F(n).kind === "error" }), B(r, "role", F(n).kind === "error" ? "alert" : "status"), S(o, F(n).text);
		}), g("click", u, () => t.cal.dismiss(F(n).id)), d(e, r);
	}), D(n), d(e, n), W();
}
T(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/keys.ts
var fn = (e) => (t) => t.setView(e), pn = [
	{
		id: "day",
		title: "Day",
		group: "Views",
		keys: "d, 1",
		run: fn("day")
	},
	{
		id: "week",
		title: "Week",
		group: "Views",
		keys: "w, 2",
		run: fn("week")
	},
	{
		id: "workweek",
		title: "Work week",
		group: "Views",
		keys: "x, 3",
		run: fn("workweek")
	},
	{
		id: "month",
		title: "Month",
		group: "Views",
		keys: "m, 4",
		run: fn("month")
	},
	{
		id: "agenda",
		title: "Agenda (schedule)",
		group: "Views",
		keys: "a, 5",
		run: fn("agenda")
	},
	{
		id: "year",
		title: "Year",
		group: "Views",
		keys: "y, 6",
		run: fn("year")
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
function mn(e) {
	let t = e.key.toLowerCase(), n = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
	return [...[
		e.ctrlKey || e.metaKey ? "ctrl" : "",
		e.altKey ? "alt" : "",
		e.shiftKey && !n ? "shift" : ""
	].filter(Boolean), t].join("+");
}
var hn = new Map(pn.flatMap((e) => (e.keys ?? "").split(",").map((e) => e.trim()).filter(Boolean).map((t) => [t, e])));
function gn(e) {
	return e ? e.split(",").map((e) => e.trim()).filter(Boolean).slice(0, 2).map((e) => e.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowright", "→").replace("arrowleft", "←").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("backspace", "⌫").replace(/^(⇧)?([a-z])$/, (e, t, n) => t ? `⇧${n.toUpperCase()}` : n)) : [];
}
//#endregion
//#region plugins/stable/dav/ui/src/Shortcuts.svelte
var _n = u("<kbd class=\"svelte-17nm084\"> </kbd>"), vn = u("<div class=\"row svelte-17nm084\"><span> </span><span class=\"keys svelte-17nm084\"></span></div>"), yn = u("<section><h3 class=\"svelte-17nm084\"> </h3> <!></section>"), bn = u("<div class=\"scrim svelte-17nm084\" role=\"presentation\"></div> <div class=\"sheet svelte-17nm084\" role=\"dialog\" aria-label=\"Keyboard shortcuts\" aria-modal=\"true\"><header class=\"svelte-17nm084\"><h2 class=\"svelte-17nm084\">Keyboard shortcuts</h2><button class=\"x svelte-17nm084\" aria-label=\"Close\">×</button></header> <div class=\"cols svelte-17nm084\"></div> <p class=\"hint svelte-17nm084\">Drag on the grid to make an event, drag one to move it, its lower edge to resize (15-minute steps). Esc cancels a drag.</p></div>", 1), xn = {
	hash: "svelte-17nm084",
	code: ".scrim.svelte-17nm084 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 50%, transparent);z-index:70;}.sheet.svelte-17nm084 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(760px, calc(100% - 32px));max-height:calc(100% - 40px);overflow:auto;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 30px rgba(0,0,0,.3));padding:14px 18px;}header.svelte-17nm084 {display:flex;align-items:center;}h2.svelte-17nm084 {margin:0;flex:1;font-size:1.1em;color:var(--heading);}h3.svelte-17nm084 {margin:10px 0 4px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.cols.svelte-17nm084 {display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:4px 24px;}.row.svelte-17nm084 {display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:var(--text-muted);}.keys.svelte-17nm084 {display:flex;gap:4px;}kbd.svelte-17nm084 {font:600 0.85em var(--font-mono);padding:1px 6px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);}.hint.svelte-17nm084 {color:var(--text-faint);font-size:0.86em;margin:12px 0 0;}.x.svelte-17nm084 {all:unset;cursor:pointer;font-size:1.3em;padding:0 6px;color:var(--text-muted);}"
};
function Sn(e, t) {
	z(t, !0), _(e, xn);
	let n = [...new Set(pn.map((e) => e.group))];
	var r = bn(), i = q(r), a = M(i, 2), o = k(a), s = M(k(o));
	D(o);
	var c = M(o, 2);
	Q(c, 20, () => n, (e) => e, (e, t) => {
		var n = yn(), r = k(n), i = Y(r, !0), a = M(r, 2);
		Q(a, 17, () => pn.filter((e) => e.group === t && e.keys), (e) => e.id, (e, t) => {
			var n = vn(), r = k(n), i = Y(r, !0), a = M(r);
			Q(a, 20, () => gn(F(t).keys), (e) => e, (e, t) => {
				var n = _n(), r = Y(n, !0);
				G(() => S(r, t)), d(e, n);
			}), D(a), D(n), G(() => S(i, F(t).title)), d(e, n);
		}), D(n), G(() => S(i, t)), d(e, n);
	}), D(c), ee(2), D(a), g("click", i, function(...e) {
		t.onclose?.apply(this, e);
	}), g("click", s, function(...e) {
		t.onclose?.apply(this, e);
	}), d(e, r), W();
}
T(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/App.svelte
var Cn = u("<button class=\"tool svelte-1i74804\" title=\"Side panel (s)\" aria-label=\"Side panel\"><!></button>"), wn = u("<span class=\"spin svelte-1i74804\" aria-label=\"Working\"></span>"), Tn = u("<option> </option>"), En = u("<select class=\"vsel svelte-1i74804\" aria-label=\"View\"></select>"), Dn = u("<button> </button>"), On = u("<div class=\"seg svelte-1i74804\" role=\"group\" aria-label=\"View\"></div>"), kn = u("<button class=\"tool svelte-1i74804\" title=\"Sync now (r)\" aria-label=\"Sync\"><!></button> <button class=\"tool svelte-1i74804\" title=\"All commands (Ctrl+K)\" aria-label=\"All commands\"><!></button>", 1), An = u("<span class=\"qprev svelte-1i74804\"><b class=\"svelte-1i74804\"> </b> </span>"), jn = u("<div class=\"quick svelte-1i74804\"><!> <input placeholder=\"lunch with Ana tomorrow 13:00 · examen 15 nov · réunion lundi à 10h @ D3\" aria-label=\"Quick add\" class=\"svelte-1i74804\"/> <!> <!> <button class=\"atlas-btn primary\">Add</button></div>"), Mn = u("<aside class=\"side svelte-1i74804\" aria-label=\"Calendars\"><!></aside>"), Nn = u("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button><button class=\"atlas-btn\">Settings…</button></div></div>"), Pn = u("<div class=\"atlas-notice\">No calendar account yet: add one in Settings (its server address, user name and app password; as many as you have) — or subscribe to a public calendar there.<div class=\"actions\"><button class=\"atlas-btn primary\">Settings…</button></div></div>"), Fn = u("<button class=\"fab svelte-1i74804\" aria-label=\"New event\" title=\"New event (c)\"><!></button>"), In = u("<div class=\"popscrim svelte-1i74804\" role=\"presentation\"></div> <!>", 1), Ln = u("<div tabindex=\"-1\" role=\"application\" aria-label=\"Calendar\"><header class=\"top svelte-1i74804\"><!> <button class=\"atlas-btn today svelte-1i74804\" title=\"Today (t)\">Today</button> <div class=\"nav svelte-1i74804\"><button class=\"tool svelte-1i74804\" title=\"Previous (k)\" aria-label=\"Previous\"><!></button> <button class=\"tool svelte-1i74804\" title=\"Next (j)\" aria-label=\"Next\"><!></button></div> <h1 class=\"svelte-1i74804\"> </h1> <!> <span class=\"grow svelte-1i74804\"></span> <div><!> <input aria-label=\"Search events\" class=\"svelte-1i74804\"/></div> <!> <button class=\"tool svelte-1i74804\" title=\"Quick add in words (q)\" aria-label=\"Quick add\"><!></button> <!></header> <!> <div class=\"body svelte-1i74804\"><!> <main class=\"view svelte-1i74804\"><!> <!></main></div> <!> <!> <!> <!> <!></div>"), Rn = {
	hash: "svelte-1i74804",
	code: ".calendar.svelte-1i74804:focus {outline:none;}.calendar.svelte-1i74804 {position:relative;height:100%;display:grid;grid-template-rows:auto auto 1fr;color:var(--text);background:var(--bg);font-size:calc(14px * var(--ui-scale, 1));container-type:inline-size;overflow:hidden;}.top.svelte-1i74804 {grid-row:1;display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);min-width:0;}h1.svelte-1i74804 {margin:0 0 0 4px;font-size:1.2em;font-weight:600;color:var(--heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:6em;flex:0 1 auto;}.nav.svelte-1i74804 {display:flex;}.grow.svelte-1i74804 {flex:1;}.today.svelte-1i74804 {flex:none;}.tool.svelte-1i74804 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;flex:none;}.tool.svelte-1i74804:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-1i74804:focus-visible, .seg.svelte-1i74804 button:where(.svelte-1i74804):focus-visible, .fab.svelte-1i74804:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.search.svelte-1i74804 {display:flex;align-items:center;gap:6px;background:var(--bg-hover);border:1px solid transparent;border-radius:var(--radius);padding:0 8px;color:var(--text-faint);width:200px;flex:0 1 auto;min-width:70px;}.search.svelte-1i74804:focus-within, .search.on.svelte-1i74804 {border-color:var(--accent);background:var(--bg);color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1;min-width:0;padding:6px 0;color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.seg.svelte-1i74804 {display:flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;flex:none;}.seg.svelte-1i74804 button:where(.svelte-1i74804) {all:unset;cursor:pointer;padding:4px 10px;font-size:0.86em;color:var(--text-muted);}.seg.svelte-1i74804 button:where(.svelte-1i74804) + button:where(.svelte-1i74804) {border-left:1px solid var(--border);}.seg.svelte-1i74804 button:where(.svelte-1i74804):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-1i74804 button.on:where(.svelte-1i74804) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.vsel.svelte-1i74804 {appearance:none;-webkit-appearance:none;font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:4px 26px 4px 8px;flex:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 14px) 50%, calc(100% - 9px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.spin.svelte-1i74804 {width:12px;height:12px;border-radius:50%;border:2px solid var(--border-strong);border-top-color:var(--accent); animation: svelte-1i74804-spin 0.8s linear infinite;flex:none;}\n  @keyframes svelte-1i74804-spin { to { transform: rotate(360deg); } }\n  @media (prefers-reduced-motion: reduce) {.spin.svelte-1i74804 { animation: none;} }.quick.svelte-1i74804 {grid-row:2;display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--bg-alt);color:var(--accent-strong);min-width:0;flex-wrap:wrap;}.quick.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1 1 260px;min-width:0;color:var(--text);font-size:1.02em;padding:4px 0;}.quick.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.qprev.svelte-1i74804 {color:var(--text-muted);font-size:0.9em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.qprev.svelte-1i74804 b:where(.svelte-1i74804) {color:var(--text);}.body.svelte-1i74804 {grid-row:3;display:flex;min-height:0;}.side.svelte-1i74804 {flex:none;width:248px;border-right:1px solid var(--border);background:var(--bg-alt);min-height:0;}.view.svelte-1i74804 {flex:1;min-width:0;min-height:0;position:relative;display:flex;flex-direction:column;}.view.svelte-1i74804 > * {flex:1;min-height:0;}.view.svelte-1i74804 > .atlas-notice {flex:none;margin:10px 14px;}.popscrim.svelte-1i74804 {position:absolute;inset:0;z-index:49;}.fab.svelte-1i74804 {all:unset;cursor:pointer;position:absolute;right:18px;bottom:22px;z-index:40;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--accent);color:var(--accent-fg);box-shadow:var(--shadow-md, 0 6px 18px rgba(0,0,0,.3));}.narrow.svelte-1i74804 .top:where(.svelte-1i74804) {flex-wrap:wrap;row-gap:6px;padding:8px;}.narrow.svelte-1i74804 h1:where(.svelte-1i74804) {order:10;flex-basis:100%;margin:0;font-size:1.05em;}.narrow.svelte-1i74804 .search:where(.svelte-1i74804) {width:auto;flex:1 1 60px;min-width:60px;}\n  @container (max-width: 1100px) {.seg.svelte-1i74804 button:where(.svelte-1i74804) {padding:4px 7px;} }"
};
function zn(n, s) {
	z(s, !0), _(n, Rn);
	let l = new xe(s.atlas), u = P(1200), p = P(void 0), m = P(!0), v = P(!1), y = P(void 0), b = P(""), C = P(!1), w = P(""), T = P(void 0), E = P(null), j = P(""), N = P(null), I = P(null), R = L(() => F(u) < 700), ee = L(() => !F(R) && F(u) >= 900 && F(m)), te = L(() => l.shown());
	ue(() => {
		l.narrow !== F(R) && (l.narrow = F(R), l.load());
	});
	let ne = [
		["day", "Day"],
		["week", "Week"],
		["workweek", "Work week"],
		["month", "Month"],
		["agenda", "Agenda"],
		["year", "Year"]
	], H = L(() => F(N)?.e ?? null), U = () => F(p)?.getBoundingClientRect() ?? new DOMRect(0, 0, F(u), 800);
	function ie(e, t) {
		Z(N, {
			e,
			at: t
		}, !0), Z(I, null);
	}
	function ae(e, t, n, r) {
		if (!l.newCalendar()) {
			l.toast(l.configured ? "No calendar of your accounts takes new events (all read-only?)" : "Add a calendar account in Settings first", "error");
			return;
		}
		Z(N, {
			draft: {
				start: e,
				end: t,
				all_day: n
			},
			at: r
		}, !0);
	}
	function K() {
		let e = new Date(l.cursor), t = /* @__PURE__ */ new Date(), n = new Date(e.getFullYear(), e.getMonth(), e.getDate(), t.getHours() + 1, 0);
		Z(I, {
			start: ge(n),
			end: ge(new Date(n.getTime() + 36e5)),
			allDay: !1
		}, !0), Z(N, null);
	}
	function oe(e = F(N)?.e) {
		if (!e) return;
		if (!e.writable) {
			l.toast(`${e.calendar_name || "This calendar"} is read-only`, "error");
			return;
		}
		let t = xe.fields(e);
		Z(I, {
			e,
			start: t.start,
			end: t.end,
			allDay: e.all_day
		}, !0), Z(N, null);
	}
	function se(e, t) {
		let n = F(N)?.draft;
		n && (Z(I, n.all_day ? {
			start: r(n.start),
			end: r(O(n.end, -1)),
			allDay: !0,
			title: e,
			calendar: t
		} : {
			start: ge(n.start),
			end: ge(n.end),
			allDay: !1,
			title: e,
			calendar: t
		}, !0), Z(N, null));
	}
	function le() {
		if (F(v)) {
			Z(v, !1);
			return;
		}
		if (F(I)) {
			Z(I, null);
			return;
		}
		if (F(N)) {
			Z(N, null);
			return;
		}
		if (F(C)) {
			Z(C, !1);
			return;
		}
		l.results && (Z(b, ""), l.search(""));
	}
	function de() {
		s.atlas.pick({
			placeholder: "Go to a date… (2026-12-01, 15 nov, next monday)",
			tag: "Calendar",
			items: [{
				value: r(/* @__PURE__ */ new Date()),
				title: "Today"
			}, {
				value: r(O(/* @__PURE__ */ new Date(), 7)),
				title: "In a week"
			}],
			typed: (e) => `Go to “${e}”`,
			onpick: async (e, t) => {
				if (!t) {
					l.go(/* @__PURE__ */ new Date(`${e}T12:00`));
					return;
				}
				try {
					let t = await J(s.atlas, "quick", { text: e });
					l.go(/* @__PURE__ */ new Date(`${t.start.slice(0, 10)}T12:00`));
				} catch (e) {
					l.toast(e.message, "error");
				}
			}
		});
	}
	function fe() {
		s.atlas.pick({
			placeholder: "Do what? (every command of the Calendar pane)",
			tag: "Calendar",
			items: pn.filter((e) => e.id !== "palette").map((e) => ({
				value: e.id,
				title: e.title,
				detail: gn(e.keys).join("  ·  ") || void 0,
				section: e.group
			})),
			onpick: (e) => pn.find((t) => t.id === e)?.run(l, _e)
		});
	}
	function X() {
		Z(C, !0), Z(j, l.newCalendar() ?? "", !0), Z(N, null), setTimeout(() => F(T)?.focus(), 0);
	}
	let _e = {
		create: K,
		quick: X,
		edit: () => oe(),
		remove: () => {
			let e = F(N)?.e;
			e?.writable && (Z(N, null), l.remove(e));
		},
		focusSearch: () => {
			F(y)?.focus(), F(y)?.select();
		},
		help: () => Z(v, !F(v)),
		palette: fe,
		goto: de,
		back: le,
		sidebar: () => Z(m, !F(m))
	};
	function ve(e) {
		let t = e.target;
		if (t.closest("input, textarea, select, [contenteditable=true]") || !F(p) || !(F(p).contains(t) || t === document.body || t.classList.contains("dv-content-container") && t.contains(F(p))) || [
			"shift",
			"control",
			"alt",
			"meta"
		].includes(e.key.toLowerCase())) return;
		let n = hn.get(mn(e));
		n && (n.id !== "delete" && n.id !== "edit" || F(N)?.e) && (e.preventDefault(), e.stopPropagation(), n.run(l, _e));
	}
	let ye;
	function be() {
		clearTimeout(ye), ye = setTimeout(async () => {
			if (!F(w).trim()) {
				Z(E, null);
				return;
			}
			try {
				Z(E, await J(s.atlas, "quick", { text: F(w) }), !0);
			} catch {
				Z(E, null);
			}
		}, 120);
	}
	async function Se() {
		if (!F(w).trim()) return;
		let e = F(E) ?? await J(s.atlas, "quick", { text: F(w) });
		Z(C, !1), Z(w, ""), Z(E, null), await l.create({
			summary: e.title || "(no title)",
			start: e.start,
			end: e.end,
			all_day: e.all_day,
			rrule: e.rrule,
			location: e.location,
			calendar: F(j) || void 0
		}) && l.go(/* @__PURE__ */ new Date(`${e.start.slice(0, 10)}T12:00`));
	}
	let Ce = L(() => {
		let e = F(E);
		if (!e) return "";
		let t = new Date(e.all_day ? `${e.start}T00:00` : e.start), n = new Date(e.all_day ? `${e.end}T00:00` : e.end), r = t.toLocaleDateString(void 0, {
			weekday: "short",
			day: "numeric",
			month: "short"
		}), i = (e) => A(e, l.h12);
		return e.all_day ? `${r} · all day` : `${r} · ${i(t)} – ${i(n)}`;
	}), we;
	function Te() {
		clearTimeout(we), we = setTimeout(() => void l.search(F(b)), 160);
	}
	he(() => {
		F(p)?.focus({ preventScroll: !0 }), (async () => {
			await l.loadSources(), await l.load(), l.sync(!1);
		})();
		let e = [s.atlas.helper.on("changed", () => {
			l.loadSources(), l.later();
		})], t = setInterval(() => l.now = /* @__PURE__ */ new Date(), 3e4), n = (e) => {
			let t = e.detail ?? {};
			t.date ? l.go(/* @__PURE__ */ new Date(`${t.date}T12:00`), t.view) : t.view && l.setView(t.view), t.quick && X(), t.create && K();
		};
		window.addEventListener("atlas-calendar:show", n);
		let r = window.__atlasCalendarShow;
		return r && (n(new CustomEvent("x", { detail: r })), window.__atlasCalendarShow = void 0), () => {
			e.forEach((e) => e()), clearInterval(t), window.removeEventListener("atlas-calendar:show", n);
		};
	});
	var Ee = Ln();
	e("keydown", re, ve);
	let De;
	var Oe = k(Ee), ke = k(Oe), Ae = (e) => {
		var t = Cn();
		$(k(t), { name: "menu" }), D(t), g("click", t, () => Z(m, !F(m))), d(e, t);
	};
	c(ke, (e) => {
		F(R) || e(Ae);
	});
	var je = M(ke, 2), Me = M(je, 2), Ne = k(Me);
	$(k(Ne), { name: "back" }), D(Ne);
	var Pe = M(Ne, 2);
	$(k(Pe), { name: "right" }), D(Pe), D(Me);
	var Fe = M(Me, 2), Ie = Y(Fe, !0), Le = M(Fe, 2), Re = (e) => {
		var t = wn();
		G(() => B(t, "title", l.syncing ? "Syncing with the server" : "Reading")), d(e, t);
	};
	c(Le, (e) => {
		(l.loading || l.syncing) && e(Re);
	});
	var ze = M(Le, 4);
	let Be;
	var He = k(ze);
	$(He, {
		name: "search",
		size: 15
	});
	var Ue = M(He, 2);
	t(Ue), a(Ue, (e) => Z(y, e), () => F(y)), D(ze);
	var We = M(ze, 2), Ge = (e) => {
		var t = En();
		Q(t, 21, () => ne, ([e, t]) => e, (e, t) => {
			var n = L(() => me(F(t), 2));
			let r = () => F(n)[0], i = () => F(n)[1];
			var a = Tn(), o = Y(a, !0), s = {};
			G(() => {
				S(o, i()), s !== (s = r()) && (a.value = (a.__value = s) ?? "");
			}), d(e, a);
		}), D(t);
		var n;
		h(t), G(() => {
			n !== (n = l.view) && (t.value = (t.__value = n) ?? "", o(t, n));
		}), g("change", t, (e) => l.setView(e.currentTarget.value)), d(e, t);
	}, Ke = (e) => {
		var t = On();
		Q(t, 21, () => ne, ([e, t]) => e, (e, t) => {
			var n = L(() => me(F(t), 2));
			let r = () => F(n)[0], i = () => F(n)[1];
			var a = Dn();
			let o;
			var s = Y(a, !0);
			G((e) => {
				B(a, "title", `${i() ?? ""} (${e ?? ""})`), o = f(a, 1, "svelte-1i74804", null, o, { on: l.view === r() }), S(s, i());
			}, [() => pn.find((e) => e.id === r())?.keys?.split(",")[0]]), g("click", a, () => l.setView(r())), d(e, a);
		}), D(t), d(e, t);
	};
	c(We, (e) => {
		F(u) < 980 ? e(Ge) : e(Ke, -1);
	});
	var qe = M(We, 2);
	$(k(qe), { name: "sparkle" }), D(qe);
	var Je = M(qe, 2), Ye = (e) => {
		var t = kn(), n = q(t);
		$(k(n), { name: "refresh" }), D(n);
		var r = M(n, 2);
		$(k(r), { name: "keyboard" }), D(r), g("click", n, () => l.sync(!0)), g("click", r, fe), d(e, t);
	};
	c(Je, (e) => {
		F(R) || e(Ye);
	}), D(Oe);
	var Xe = M(Oe, 2), Ze = (e) => {
		var n = jn(), r = k(n);
		$(r, {
			name: "sparkle",
			size: 15
		});
		var i = M(r, 2);
		t(i), a(i, (e) => Z(T, e), () => F(T));
		var o = M(i, 2), s = (e) => {
			var t = An(), n = k(t), r = Y(n, !0), i = M(n);
			D(t), G(() => {
				S(r, F(E).title || "(no title)"), S(i, ` · ${F(Ce) ?? ""}${F(E).rrule ? " · repeats" : ""}${F(E).location ? ` · ${F(E).location}` : ""}`);
			}), d(e, t);
		};
		c(o, (e) => {
			F(E) && e(s);
		});
		var u = M(o, 2), f = (e) => {
			Mt(e, {
				get cal() {
					return l;
				},
				compact: !0,
				get value() {
					return F(j);
				},
				set value(e) {
					Z(j, e, !0);
				}
			});
		};
		c(u, (e) => {
			F(j) && e(f);
		});
		var p = M(u, 2);
		D(n), G((e) => p.disabled = e, [() => !F(w).trim()]), g("input", i, be), g("keydown", i, (e) => {
			e.key === "Enter" ? (e.preventDefault(), Se()) : e.key === "Escape" && (e.stopPropagation(), Z(C, !1));
		}), V(i, () => F(w), (e) => Z(w, e)), g("click", p, Se), d(e, n);
	};
	c(Xe, (e) => {
		F(C) && e(Ze);
	});
	var Qe = M(Xe, 2), $e = k(Qe), et = (e) => {
		var t = Mn();
		Ve(k(t), {
			get cal() {
				return l;
			},
			oncreate: K
		}), D(t), d(e, t);
	};
	c($e, (e) => {
		F(ee) && e(et);
	});
	var nt = M($e, 2), rt = k(nt), it = (e) => {
		var t = Nn(), n = k(t, !0), r = M(n), i = k(r), a = M(i);
		D(r), D(t), G(() => S(n, l.error)), g("click", i, () => l.load()), g("click", a, () => s.atlas.plugin.openSettings()), d(e, t);
	}, at = (e) => {
		var t = Pn(), n = M(k(t)), r = Y(n);
		D(t), g("click", r, () => s.atlas.plugin.openSettings()), d(e, t);
	};
	c(rt, (e) => {
		l.error ? e(it) : !l.configured && !l.sources.length && e(at, 1);
	});
	var ot = M(rt, 2), st = (e) => {
		{
			let t = L(() => pe(/* @__PURE__ */ new Date())), n = L(() => pe(/* @__PURE__ */ new Date()));
			bt(e, {
				get cal() {
					return l;
				},
				get events() {
					return l.results;
				},
				get from() {
					return F(t);
				},
				get to() {
					return F(n);
				},
				get selected() {
					return F(H);
				},
				onselect: ie,
				search: !0
			});
		}
	}, ct = (e) => {
		{
			let t = L(() => l.days());
			dt(e, {
				get cal() {
					return l;
				},
				get days() {
					return F(t);
				},
				get selected() {
					return F(H);
				},
				onselect: ie,
				oncreate: ae
			});
		}
	}, lt = (e) => {
		{
			let t = L(() => l.range().from), n = L(() => l.range().to);
			bt(e, {
				get cal() {
					return l;
				},
				get events() {
					return l.events;
				},
				get from() {
					return F(t);
				},
				get to() {
					return F(n);
				},
				get selected() {
					return F(H);
				},
				onselect: ie
			});
		}
	}, ut = (e) => {
		Dt(e, { get cal() {
			return l;
		} });
	}, ft = (e) => {
		var t = ce(), n = q(t);
		x(n, () => F(te) + l.range().from.getTime(), (e) => {
			{
				let t = L(() => l.days());
				tt(e, {
					get cal() {
						return l;
					},
					get days() {
						return F(t);
					},
					get selected() {
						return F(H);
					},
					onselect: ie,
					oncreate: ae
				});
			}
		}), d(e, t);
	};
	c(ot, (e) => {
		l.results ? e(st) : F(te) === "month" ? e(ct, 1) : F(te) === "agenda" ? e(lt, 2) : F(te) === "year" ? e(ut, 3) : e(ft, -1);
	}), D(nt), D(Qe);
	var pt = M(Qe, 2), mt = (e) => {
		var t = Fn();
		$(k(t), {
			name: "plus",
			size: 22
		}), D(t), g("click", t, K), d(e, t);
	};
	c(pt, (e) => {
		F(R) && e(mt);
	});
	var ht = M(pt, 2), gt = (e) => {
		var t = In(), n = q(t), r = M(n, 2);
		x(r, () => F(N), (e) => {
			{
				let t = L(() => F(N).e ?? null), n = L(() => F(N).draft ?? null), r = L(U);
				Yt(e, {
					get cal() {
						return l;
					},
					get e() {
						return F(t);
					},
					get draft() {
						return F(n);
					},
					get at() {
						return F(N).at;
					},
					get box() {
						return F(r);
					},
					onedit: () => oe(),
					onmore: se,
					onclose: () => Z(N, null)
				});
			}
		}), g("click", n, () => Z(N, null)), d(e, t);
	};
	c(ht, (e) => {
		F(N) && e(gt);
	});
	var _t = M(ht, 2), vt = (e) => {
		{
			let t = L(() => F(I).e ?? null), n = L(() => F(I).title ?? ""), r = L(() => F(I).calendar ?? "");
			on(e, {
				get cal() {
					return l;
				},
				get e() {
					return F(t);
				},
				get start() {
					return F(I).start;
				},
				get end() {
					return F(I).end;
				},
				get allDay() {
					return F(I).allDay;
				},
				get title() {
					return F(n);
				},
				get calendar() {
					return F(r);
				},
				onclose: () => Z(I, null)
			});
		}
	};
	c(_t, (e) => {
		F(I) && e(vt);
	});
	var yt = M(_t, 2), xt = (e) => {
		Sn(e, { onclose: () => Z(v, !1) });
	};
	c(yt, (e) => {
		F(v) && e(xt);
	}), dn(M(yt, 2), { get cal() {
		return l;
	} }), D(Ee), a(Ee, (e) => Z(p, e), () => F(p)), G((e, t) => {
		De = f(Ee, 1, "calendar svelte-1i74804", null, De, { narrow: F(R) }), B(Fe, "title", e), S(Ie, t), Be = f(ze, 1, "search svelte-1i74804", null, Be, { on: !!F(b) }), B(Ue, "placeholder", F(R) ? "" : "Search events");
	}, [() => l.title(), () => l.title()]), g("pointerdown", Ee, (e) => {
		e.target.closest("input, textarea, select, button, [tabindex='0']") || F(p)?.focus({ preventScroll: !0 });
	}), g("click", je, () => l.today()), g("click", Ne, () => l.step(-1)), g("click", Pe, () => l.step(1)), g("input", Ue, Te), g("keydown", Ue, (e) => {
		e.key === "Escape" && (Z(b, ""), l.search(""), F(y)?.blur());
	}), V(Ue, () => F(b), (e) => Z(b, e)), g("click", qe, X), i(Ee, "clientWidth", (e) => Z(u, e)), d(n, Ee), W();
}
T([
	"pointerdown",
	"click",
	"input",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/NewEvent.svelte
var Bn = u("<div class=\"none svelte-19uhe47\"><p class=\"svelte-19uhe47\">No calendar to write to: add a CalDAV account in the Calendar's settings.</p> <button class=\"atlas-btn\">Open its settings</button></div>"), Vn = u("<p class=\"none svelte-19uhe47\">Loading the calendars…</p>"), Hn = {
	hash: "svelte-19uhe47",
	code: ".none.svelte-19uhe47 {padding:16px;display:grid;gap:10px;justify-items:start;color:var(--text-muted);margin:0;}.none.svelte-19uhe47 p:where(.svelte-19uhe47) {margin:0;}"
};
function Un(e, t) {
	z(t, !0), _(e, Hn);
	let n = fe(() => new xe(t.atlas));
	n.toast = (e, n) => t.atlas.toast("Calendar", e, n === "error" ? "error" : "success");
	let r = P(!1);
	n.loadSources().then(() => Z(r, !0));
	let i = /* @__PURE__ */ new Date(), a = new Date(i.getFullYear(), i.getMonth(), i.getDate(), i.getHours() + 1, 0);
	var o = ce(), s = q(o), l = (e) => {
		var r = ce(), i = q(r), o = (e) => {
			{
				let r = L(() => ge(a)), i = L(() => ge(new Date(a.getTime() + 36e5)));
				on(e, {
					get cal() {
						return n;
					},
					get start() {
						return F(r);
					},
					get end() {
						return F(i);
					},
					allDay: !1,
					frame: "dialog",
					get onclose() {
						return t.onclose;
					}
				});
			}
		}, s = L(() => n.writable().length), l = (e) => {
			var n = Bn(), r = M(k(n), 2);
			D(n), g("click", r, () => t.atlas.plugin.openSettings()), d(e, n);
		};
		c(i, (e) => {
			F(s) ? e(o) : e(l, -1);
		}), d(e, r);
	}, u = (e) => {
		var t = Vn();
		d(e, t);
	};
	c(s, (e) => {
		F(r) ? e(l) : e(u, -1);
	}), d(e, o), W();
}
T(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/view.ts
function Wn(e, t) {
	if (t.arg === ne) {
		let n = b(Un, {
			target: e,
			props: {
				atlas: t,
				onclose: () => t.pane?.close?.()
			}
		});
		return () => s(n);
	}
	e.style.height = "100%";
	let n = b(zn, {
		target: e,
		props: { atlas: t }
	});
	return () => s(n);
}
//#endregion
export { Wn as default };
