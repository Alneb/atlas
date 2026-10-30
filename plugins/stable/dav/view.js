import { $ as e, A as t, B as n, C as r, D as i, E as a, F as o, G as s, H as c, I as l, J as u, K as d, L as f, M as p, N as m, O as h, P as g, Q as _, R as v, S as y, T as b, U as x, V as S, W as C, X as w, Y as T, Z as E, _ as D, a as O, at as k, b as A, c as j, ct as M, d as N, dt as ee, et as P, f as F, ft as I, g as te, gt as ne, h as L, ht as R, i as z, it as B, k as V, l as H, lt as U, m as W, mt as re, n as ie, nt as ae, o as G, ot as K, p as oe, pt as se, q, r as ce, rt as J, s as le, st as Y, t as ue, tt as de, u as fe, ut as X, v as pe, w as Z, x as me, y as Q, z as he } from "./ui-lib/layout.js";
//#region plugins/stable/dav/ui/src/store.svelte.ts
var ge = "notes", _e = (e) => {
	try {
		return localStorage.getItem(`atlas-calendar-${e}`);
	} catch {
		return null;
	}
}, ve = (e, t) => {
	try {
		localStorage.setItem(`atlas-calendar-${e}`, t);
	} catch {}
}, ye = class {
	atlas;
	#e = U(Y([]));
	get sources() {
		return e(this.#e);
	}
	set sources(e) {
		M(this.#e, e, !0);
	}
	#t = U(Y([]));
	get accounts() {
		return e(this.#t);
	}
	set accounts(e) {
		M(this.#t, e, !0);
	}
	#n = U(Y([]));
	get events() {
		return e(this.#n);
	}
	set events(e) {
		M(this.#n, e, !0);
	}
	#r = U("week");
	get view() {
		return e(this.#r);
	}
	set view(e) {
		M(this.#r, e, !0);
	}
	#i = U(Y(D(/* @__PURE__ */ new Date())));
	get cursor() {
		return e(this.#i);
	}
	set cursor(e) {
		M(this.#i, e, !0);
	}
	#a = U(!0);
	get loading() {
		return e(this.#a);
	}
	set loading(e) {
		M(this.#a, e, !0);
	}
	#o = U(!1);
	get syncing() {
		return e(this.#o);
	}
	set syncing(e) {
		M(this.#o, e, !0);
	}
	#s = U("");
	get error() {
		return e(this.#s);
	}
	set error(e) {
		M(this.#s, e, !0);
	}
	#c = U(!0);
	get configured() {
		return e(this.#c);
	}
	set configured(e) {
		M(this.#c, e, !0);
	}
	#l = U(null);
	get write() {
		return e(this.#l);
	}
	set write(e) {
		M(this.#l, e, !0);
	}
	#u = U(Y(_e("last")));
	get last() {
		return e(this.#u);
	}
	set last(e) {
		M(this.#u, e, !0);
	}
	#d = U(Y([]));
	get hidden() {
		return e(this.#d);
	}
	set hidden(e) {
		M(this.#d, e, !0);
	}
	#f = U(Y({}));
	get colors() {
		return e(this.#f);
	}
	set colors(e) {
		M(this.#f, e, !0);
	}
	#p = U(Y([]));
	get toasts() {
		return e(this.#p);
	}
	set toasts(e) {
		M(this.#p, e, !0);
	}
	#m = U(null);
	get results() {
		return e(this.#m);
	}
	set results(e) {
		M(this.#m, e, !0);
	}
	#h = U("");
	get query() {
		return e(this.#h);
	}
	set query(e) {
		M(this.#h, e, !0);
	}
	#g = U(Y(/* @__PURE__ */ new Date()));
	get now() {
		return e(this.#g);
	}
	set now(e) {
		M(this.#g, e, !0);
	}
	#_ = U(!1);
	get narrow() {
		return e(this.#_);
	}
	set narrow(e) {
		M(this.#_, e, !0);
	}
	seq = 0;
	timer;
	constructor(e) {
		this.atlas = e;
		let t = e.plugin.settings;
		this.view = _e("view") ?? String(t.default_view ?? "week"), this.hidden = (t.hidden ?? []).slice();
		for (let e of t.colors ?? []) {
			let t = e.lastIndexOf(":");
			t > 0 && (this.colors[e.slice(0, t).trim()] = e.slice(t + 1).trim());
		}
	}
	get settings() {
		return this.atlas.plugin.settings;
	}
	get first() {
		return me(this.settings.week_start);
	}
	get h12() {
		return H(this.settings.time_format);
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
				let e = pe(t, this.first);
				return {
					from: e,
					to: z(e, 6)
				};
			}
			case "workweek": {
				let e = pe(t, 1);
				return {
					from: e,
					to: z(e, 4)
				};
			}
			case "month": {
				let e = pe(new Date(t.getFullYear(), t.getMonth(), 1), this.first);
				return {
					from: e,
					to: z(e, 41)
				};
			}
			case "agenda": return {
				from: t,
				to: z(t, 59)
			};
			case "year": return {
				from: new Date(t.getFullYear(), 0, 1),
				to: new Date(t.getFullYear(), 11, 31)
			};
		}
	}
	days() {
		let { from: e, to: t } = this.range(), n = [];
		for (let r = e; r <= t; r = z(r, 1)) n.push(r);
		return n;
	}
	colorOf(e) {
		if (e === "notes") return this.colors.notes ?? this.colors.Notes ?? "var(--accent)";
		let t = this.sources.find((t) => t.id === e);
		return this.colors[e] ?? this.colors[t?.name ?? ""] ?? t?.shown_color ?? t?.color ?? fe(e);
	}
	isHidden(e, t = e) {
		return this.hidden.includes(e) || this.hidden.includes(t);
	}
	async loadSources() {
		try {
			let e = await G(this.atlas, "watch", {}, 30);
			this.sources = e.sources, this.accounts = e.accounts ?? [], this.write = e.write, this.configured = e.configured;
		} catch (e) {
			this.error = e.message;
		}
	}
	async load(e = !1) {
		let { from: t, to: n } = this.range(), r = ++this.seq;
		e || (this.loading = !0);
		try {
			let e = this.sources.filter((e) => !this.isHidden(e.id, e.name)).map((e) => e.id), i = await G(this.atlas, "range", {
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
			let t = await G(this.atlas, "refresh", { force: e }, 300);
			await this.loadSources(), t.changed && await this.load(!0), t.errors.length && this.toast(t.errors[0], "error");
		} catch (e) {
			this.error ||= e.message;
		} finally {
			this.syncing = !1;
		}
	}
	setView(e) {
		this.view = e, ve("view", e), this.results = null, this.load();
	}
	go(e, t) {
		this.cursor = D(e), t ? this.setView(t) : this.load();
	}
	today() {
		this.go(/* @__PURE__ */ new Date());
	}
	step(e) {
		let t = this.cursor, n = {
			day: () => z(t, e),
			week: () => z(t, 7 * e),
			workweek: () => z(t, 7 * e),
			month: () => O(new Date(t.getFullYear(), t.getMonth(), 1), e),
			agenda: () => z(t, 30 * e),
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
		e && (this.last = e, ve("last", e));
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
				await G(this.atlas, "undo", { id: e }), this.toast(`${t} undone`);
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
			let r = await G(this.atlas, "create", {
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
			let i = await G(this.atlas, "update", {
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
				let n = await G(this.atlas, "delete", {
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
			this.results = (await G(this.atlas, "search", { q: e })).events;
		} catch (e) {
			this.toast(e.message, "error");
		}
	}
	static fields(e) {
		let t = j(e), n = le(e);
		return e.all_day ? {
			start: y(t),
			end: y(z(n, -1))
		} : {
			start: A(t),
			end: A(n)
		};
	}
}, be = {
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
}, xe = u("<svg class=\"icon svelte-16m1c18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path></path></svg>"), Se = {
	hash: "svelte-16m1c18",
	code: ".icon.svelte-16m1c18 {flex:none;display:block;}"
};
function $(e, n) {
	f(e, Se);
	let r = Z(n, "size", 3, 16), i = Z(n, "title", 3, "");
	var a = xe(), o = k(a);
	P(() => {
		t(a, "width", r()), t(a, "height", r()), t(a, "aria-hidden", i() ? void 0 : "true"), t(a, "role", i() ? "img" : void 0), t(a, "aria-label", i() || void 0), t(o, "d", be[n.name] ?? be.calendar);
	}), s(e, a);
}
//#endregion
//#region plugins/stable/dav/ui/src/Sidebar.svelte
var Ce = q("<span class=\"h svelte-1jq00cd\"> </span>"), we = q("<button> </button>"), Te = q("<button class=\"link svelte-1jq00cd\">Set it up…</button>"), Ee = q("<h3 class=\"svelte-1jq00cd\">Calendars</h3> <ul class=\"svelte-1jq00cd\"><li class=\"none svelte-1jq00cd\"> <!></li></ul>", 1), De = q("<span class=\"err svelte-1jq00cd\">!</span>"), Oe = u("<svg viewBox=\"0 0 12 12\" width=\"10\" height=\"10\" aria-hidden=\"true\"><path d=\"M2.5 6.5l2.2 2.2L9.5 3.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path></svg>"), ke = q("<span class=\"ro svelte-1jq00cd\" title=\"A subscription: read-only\"><!></span>"), Ae = q("<span class=\"ro svelte-1jq00cd\" title=\"Read-only\">ro</span>"), je = q("<button class=\"pc svelte-1jq00cd\" role=\"option\"></button>"), Me = q("<div class=\"palette svelte-1jq00cd\" role=\"listbox\" aria-label=\"Colours\"></div>"), Ne = q("<li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\"><span><!></span> <span class=\"name svelte-1jq00cd\"> </span> <!> <!></button> <button class=\"tool small svelte-1jq00cd\" title=\"Colour\"><span class=\"swatch svelte-1jq00cd\"></span></button> <!></li>"), Pe = q("<li class=\"none svelte-1jq00cd\"> </li>"), Fe = q("<h3 class=\"svelte-1jq00cd\"> <!></h3> <ul class=\"svelte-1jq00cd\"></ul>", 1), Ie = q("<h3 class=\"svelte-1jq00cd\">In the vault</h3> <ul class=\"svelte-1jq00cd\"><li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\" title=\"Notes marked important: true with due: / event:\"><span><!></span> <span class=\"name svelte-1jq00cd\">Important notes</span></button></li></ul>", 1), Le = q("<div class=\"side svelte-1jq00cd\"><button class=\"create atlas-btn primary svelte-1jq00cd\"><!>Create</button> <div class=\"mini svelte-1jq00cd\" aria-label=\"Pick a day\"><div class=\"mhead svelte-1jq00cd\"><span class=\"mtitle svelte-1jq00cd\"> </span> <button class=\"tool svelte-1jq00cd\" aria-label=\"Previous month\"><!></button> <button class=\"tool svelte-1jq00cd\" aria-label=\"Next month\"><!></button></div> <div class=\"mgrid svelte-1jq00cd\"><!> <!></div></div> <!> <!> <!> <button class=\"link add svelte-1jq00cd\"><!>Add an account or a subscription…</button></div>"), Re = {
	hash: "svelte-1jq00cd",
	code: ".side.svelte-1jq00cd {height:100%;overflow-y:auto;padding:12px 10px 24px;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;}.create.svelte-1jq00cd {display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin:0 0 10px 4px;padding:7px 16px;}.mini.svelte-1jq00cd {padding:0 2px 10px;}.mhead.svelte-1jq00cd {display:flex;align-items:center;gap:2px;padding:0 0 4px 6px;}.mtitle.svelte-1jq00cd {flex:1;font-weight:600;font-size:0.9em;color:var(--heading);}.mgrid.svelte-1jq00cd {display:grid;grid-template-columns:repeat(7, 1fr);gap:1px;}.h.svelte-1jq00cd {font-size:0.68em;color:var(--text-faint);text-align:center;padding:2px 0;}.d.svelte-1jq00cd {all:unset;cursor:pointer;text-align:center;font-size:0.76em;line-height:24px;border-radius:999px;font-variant-numeric:tabular-nums;color:var(--text-muted);position:relative;}.d.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.d.other.svelte-1jq00cd {color:var(--text-faint);}.d.on.svelte-1jq00cd {background:var(--accent-soft);color:var(--accent-strong);border-radius:0;}.d.busy.svelte-1jq00cd::after {content:\"\";position:absolute;left:50%;bottom:2px;width:3px;height:3px;border-radius:50%;background:currentColor;transform:translateX(-50%);opacity:0.6;}.d.today.svelte-1jq00cd {background:var(--accent);color:var(--accent-fg);font-weight:700;border-radius:999px;}.d.svelte-1jq00cd:focus-visible, .cal.svelte-1jq00cd:focus-visible, .tool.svelte-1jq00cd:focus-visible, .pc.svelte-1jq00cd:focus-visible, .link.svelte-1jq00cd:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}h3.svelte-1jq00cd {margin:10px 6px 2px;font-size:0.72em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;}ul.svelte-1jq00cd {list-style:none;margin:0;padding:0;display:grid;gap:1px;}li.svelte-1jq00cd {position:relative;display:flex;align-items:center;}.cal.svelte-1jq00cd {all:unset;flex:1;min-width:0;cursor:pointer;display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:var(--radius-sm);color:var(--text);font-size:0.9em;}.cal.svelte-1jq00cd:hover {background:var(--bg-hover);}.box.svelte-1jq00cd {width:14px;height:14px;border-radius:4px;background:var(--c);border:2px solid var(--c);box-sizing:border-box;display:grid;place-items:center;color:#fff;flex:none;}.box.off.svelte-1jq00cd {background:transparent;}.name.svelte-1jq00cd {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.err.svelte-1jq00cd {color:var(--red);font-weight:700;}.ro.svelte-1jq00cd {color:var(--text-faint);font-size:0.75em;}.tool.svelte-1jq00cd {all:unset;cursor:pointer;padding:5px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.small.svelte-1jq00cd {opacity:0;}li.svelte-1jq00cd:hover .small:where(.svelte-1jq00cd), .small.svelte-1jq00cd:focus-visible {opacity:1;}.swatch.svelte-1jq00cd {width:10px;height:10px;border-radius:50%;background:var(--c);}.palette.svelte-1jq00cd {position:absolute;right:0;top:100%;z-index:20;display:grid;grid-template-columns:repeat(6, 22px);gap:6px;padding:8px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 24px rgba(0,0,0,.25));}.pc.svelte-1jq00cd {all:unset;cursor:pointer;width:22px;height:22px;border-radius:50%;background:var(--c);}.pc[aria-selected=\"true\"].svelte-1jq00cd {box-shadow:0 0 0 2px var(--bg-elev), 0 0 0 4px var(--c);}.none.svelte-1jq00cd {color:var(--text-faint);font-size:0.85em;padding:4px 6px;gap:6px;flex-wrap:wrap;}.link.svelte-1jq00cd {all:unset;cursor:pointer;color:var(--accent);font-size:0.85em;display:inline-flex;align-items:center;gap:4px;}.add.svelte-1jq00cd {margin:10px 6px 0;}"
};
function ze(n, r) {
	se(r, !0), f(n, Re);
	let i = U(Y(/* @__PURE__ */ new Date()));
	de(() => {
		M(i, new Date(r.cal.cursor.getFullYear(), r.cal.cursor.getMonth(), 1), !0);
	});
	let a = X(() => {
		let t = pe(e(i), r.cal.first);
		return Array.from({ length: 42 }, (e, n) => z(t, n));
	}), c = X(() => e(a).slice(0, 7).map((e) => e.toLocaleDateString(void 0, { weekday: "narrow" }))), u = (e) => {
		let t = r.cal.range();
		return e >= t.from && e <= t.to;
	}, p = X(() => new Set(r.cal.events.map((e) => e.start.slice(0, 10)))), m = (e) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`, h = [
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
	], g = U(null), _ = X(() => [...r.cal.byAccount().map((e) => ({
		title: e.account.name,
		error: e.account.error ?? void 0,
		items: e.items
	})), {
		title: "Subscriptions",
		error: void 0,
		items: r.cal.sources.filter((e) => e.kind === "ics")
	}]), y = X(() => !r.cal.accounts.length), b = X(() => r.cal.showNotes);
	function C(e) {
		return e.error ? `${e.name} — ${e.error}` : e.writable ? e.name : `${e.name} (read-only)`;
	}
	var w = Le(), T = J(w);
	$(J(T), {
		name: "plus",
		size: 15
	}), re(), R(T);
	var D = K(T, 2), A = J(D), j = J(A), N = k(j, !0), ee = K(j, 2);
	$(J(ee), {
		name: "back",
		size: 14
	}), R(ee);
	var F = K(ee, 2);
	$(J(F), {
		name: "right",
		size: 14
	}), R(F), R(A);
	var te = K(A, 2), ne = J(te);
	v(ne, 17, () => e(c), he, (t, n) => {
		var r = Ce(), i = k(r, !0);
		P(() => x(i, e(n))), s(t, r);
	});
	var V = K(ne, 2);
	v(V, 17, () => e(a), (e) => e.getTime(), (t, n) => {
		var a = we();
		let o;
		var c = k(a, !0);
		P((e, t, n, r, i) => {
			o = l(a, 1, "d svelte-1jq00cd", null, o, {
				other: e,
				today: t,
				on: n,
				busy: r
			}), x(c, i);
		}, [
			() => e(n).getMonth() !== e(i).getMonth(),
			() => L(e(n), r.cal.now),
			() => u(e(n)),
			() => e(p).has(m(e(n))),
			() => e(n).getDate()
		]), E("click", a, () => r.cal.go(e(n))), s(t, a);
	}), R(te), R(D);
	var H = K(D, 2), W = (e) => {
		var t = Ee(), n = K(B(t), 2), i = J(n), a = J(i, !0), o = K(a), c = (e) => {
			var t = Te();
			E("click", t, () => r.cal.atlas.plugin.openSettings()), s(e, t);
		};
		S(o, (e) => {
			r.cal.configured || e(c);
		}), R(i), R(n), P(() => x(a, r.cal.configured ? r.cal.error ? "Not read: see the message beside." : "Reading the server…" : "No account yet.")), s(e, t);
	};
	S(H, (t) => {
		e(y) && t(W);
	});
	var ie = K(H, 2);
	v(ie, 17, () => e(_), (e) => e.title, (n, i) => {
		var a = d(), c = B(a), u = (n) => {
			var a = Fe(), c = B(a), u = J(c, !0), d = K(u), f = (n) => {
				var r = De();
				P(() => t(r, "title", e(i).error)), s(n, r);
			};
			S(d, (t) => {
				e(i).error && t(f);
			}), R(c);
			var p = K(c, 2);
			v(p, 21, () => e(i).items, (e) => e.id, (n, i) => {
				var a = Ne(), c = J(a), u = J(c);
				let d, f;
				var p = J(u), m = (e) => {
					var t = Oe();
					s(e, t);
				}, _ = X(() => !r.cal.isHidden(e(i).id, e(i).name));
				S(p, (t) => {
					e(_) && t(m);
				}), R(u);
				var y = K(u, 2), b = k(y, !0), w = K(y, 2), T = (n) => {
					var r = De();
					P(() => t(r, "title", e(i).error)), s(n, r);
				};
				S(w, (t) => {
					e(i).error && t(T);
				});
				var D = K(w, 2), O = (e) => {
					var t = ke();
					$(J(t), {
						name: "rss",
						size: 12
					}), R(t), s(e, t);
				}, A = (e) => {
					var t = Ae();
					s(e, t);
				};
				S(D, (t) => {
					e(i).kind === "ics" ? t(O) : e(i).writable || t(A, 1);
				}), R(c);
				var j = K(c, 2), N = J(j);
				let ee;
				R(j);
				var F = K(j, 2), I = (n) => {
					var a = Me();
					v(a, 20, () => h, (e) => e, (n, a) => {
						var c = je();
						let l;
						P((e) => {
							t(c, "aria-selected", e), t(c, "aria-label", a), l = o(c, "", l, { "--c": a });
						}, [() => r.cal.colorOf(e(i).id) === a]), E("click", c, () => {
							r.cal.setColor(e(i).id, a), M(g, null);
						}), s(n, c);
					}), R(a), s(n, a);
				};
				S(F, (t) => {
					e(g) === e(i).id && t(I);
				}), R(a), P((n, r, a, s, p) => {
					t(c, "aria-checked", n), t(c, "title", r), d = l(u, 1, "box svelte-1jq00cd", null, d, { off: a }), f = o(u, "", f, { "--c": s }), x(b, e(i).name), t(j, "aria-label", `Colour of ${e(i).name ?? ""}`), ee = o(N, "", ee, { "--c": p });
				}, [
					() => !r.cal.isHidden(e(i).id, e(i).name),
					() => C(e(i)),
					() => r.cal.isHidden(e(i).id, e(i).name),
					() => r.cal.colorOf(e(i).id),
					() => r.cal.colorOf(e(i).id)
				]), E("click", c, () => r.cal.toggle(e(i).id, e(i).name)), E("click", j, () => M(g, e(g) === e(i).id ? null : e(i).id, !0)), s(n, a);
			}, (t) => {
				var n = Pe(), r = k(n, !0);
				P(() => x(r, e(i).error ?? "Reading the server…")), s(t, n);
			}), R(p), P(() => {
				t(c, "title", e(i).error ?? e(i).title), x(u, e(i).title);
			}), s(n, a);
		};
		S(c, (t) => {
			(e(i).items.length || e(i).title !== "Subscriptions") && t(u);
		}), s(n, a);
	});
	var ae = K(ie, 2), G = (n) => {
		var i = Ie(), a = K(B(i), 2), c = J(a), u = J(c), d = J(u);
		let f, p;
		var m = J(d), h = (e) => {
			var t = Oe();
			s(e, t);
		}, g = X(() => !r.cal.isHidden(ge, "Notes"));
		S(m, (t) => {
			e(g) && t(h);
		}), R(d), re(2), R(u), R(c), R(a), P((e, n, r) => {
			t(u, "aria-checked", e), f = l(d, 1, "box svelte-1jq00cd", null, f, { off: n }), p = o(d, "", p, { "--c": r });
		}, [
			() => !r.cal.isHidden(ge, "Notes"),
			() => r.cal.isHidden(ge, "Notes"),
			() => r.cal.colorOf(ge)
		]), E("click", u, () => r.cal.toggle(ge, "Notes")), s(n, i);
	};
	S(ae, (t) => {
		e(b) && t(G);
	});
	var oe = K(ae, 2);
	$(J(oe), {
		name: "plus",
		size: 13
	}), re(), R(oe), R(w), P((e) => x(N, e), [() => e(i).toLocaleDateString(void 0, {
		month: "long",
		year: "numeric"
	})]), E("click", T, function(...e) {
		r.oncreate?.apply(this, e);
	}), E("click", ee, () => M(i, O(e(i), -1), !0)), E("click", F, () => M(i, O(e(i), 1), !0)), E("click", oe, () => r.cal.atlas.plugin.openSettings()), s(n, w), I();
}
w(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/TimeGrid.svelte
var Be = q("<button title=\"Open this day\"><span class=\"wd svelte-16enfn0\"> </span> <span class=\"num svelte-16enfn0\"> </span></button>"), Ve = q("<div class=\"lanecell svelte-16enfn0\" role=\"button\" tabindex=\"-1\" aria-label=\"New all-day event\"></div>"), He = q("<span class=\"dot svelte-16enfn0\" aria-hidden=\"true\"></span>"), Ue = q("<button><!> </button>"), We = q("<div class=\"hl svelte-16enfn0\"> </div>"), Ge = q("<span class=\"loc svelte-16enfn0\"> </span>"), Ke = q("<div class=\"grip svelte-16enfn0\" role=\"separator\" aria-label=\"Change the end\"></div>"), qe = q("<div role=\"button\" tabindex=\"0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span> <!> <!></div>"), Je = q("<div class=\"ev slot-ghost svelte-16enfn0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span></div>"), Ye = q("<div class=\"now svelte-16enfn0\" aria-hidden=\"true\"></div>"), Xe = q("<div role=\"gridcell\" tabindex=\"-1\"><!> <!> <!></div>"), Ze = q("<div class=\"tg svelte-16enfn0\"><div class=\"head svelte-16enfn0\"><div class=\"gutter tz svelte-16enfn0\" title=\"Times in your zone\"></div> <!></div> <div class=\"lane svelte-16enfn0\"><div class=\"gutter label svelte-16enfn0\">all-day</div> <div class=\"lanecols svelte-16enfn0\"><!> <!></div></div> <div class=\"scroll svelte-16enfn0\"><div class=\"body svelte-16enfn0\"><div class=\"gutter hours svelte-16enfn0\"></div> <div class=\"cols svelte-16enfn0\" role=\"grid\" tabindex=\"-1\" aria-label=\"Hours\"></div></div></div></div>"), Qe = {
	hash: "svelte-16enfn0",
	code: ".tg.svelte-16enfn0 {display:grid;grid-template-rows:auto auto 1fr;height:100%;min-height:0;--gutter: 56px;}.head.svelte-16enfn0, .lane.svelte-16enfn0 {display:grid;grid-template-columns:var(--gutter) 1fr;border-bottom:1px solid var(--border);}.head.svelte-16enfn0 {grid-template-columns:var(--gutter) repeat(var(--n), 1fr);}.gutter.svelte-16enfn0 {color:var(--text-faint);font-size:0.75em;}.tz.svelte-16enfn0 {align-self:end;padding:0 6px 6px;font-size:0.68em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.dayhead.svelte-16enfn0 {all:unset;cursor:pointer;display:flex;align-items:baseline;justify-content:center;gap:6px;padding:6px 2px;color:var(--text-muted);border-left:1px solid var(--border);min-width:0;}.dayhead.svelte-16enfn0:hover {background:var(--bg-hover);}.dayhead.svelte-16enfn0:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.wd.svelte-16enfn0 {font-size:0.78em;text-transform:uppercase;letter-spacing:0.04em;}.num.svelte-16enfn0 {font-size:1.25em;font-weight:600;color:var(--heading);font-variant-numeric:tabular-nums;min-width:1.8em;text-align:center;border-radius:999px;}.dayhead.today.svelte-16enfn0 .wd:where(.svelte-16enfn0) {color:var(--accent-strong);}.dayhead.today.svelte-16enfn0 .num:where(.svelte-16enfn0) {background:var(--accent);color:var(--accent-fg);}.label.svelte-16enfn0 {align-self:center;padding:0 6px;text-align:right;}.lanecols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);grid-auto-rows:22px;row-gap:2px;padding:3px 0;min-height:26px;max-height:120px;overflow-y:auto;}.lanecell.svelte-16enfn0 {grid-row:1 / span var(--rows);border-left:1px solid var(--border);cursor:cell;}.bar.svelte-16enfn0 {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;margin:0 3px;padding:0 8px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));color:var(--text);font-size:0.82em;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px;border-left:3px solid var(--c);}.bar.clipl.svelte-16enfn0 {border-top-left-radius:0;border-bottom-left-radius:0;margin-left:0;}.bar.clipr.svelte-16enfn0 {border-top-right-radius:0;border-bottom-right-radius:0;margin-right:0;}.dot.svelte-16enfn0 {width:6px;height:6px;border-radius:50%;background:var(--c);flex:none;}.scroll.svelte-16enfn0 {overflow-y:auto;min-height:0;position:relative;}.body.svelte-16enfn0 {position:relative;display:grid;grid-template-columns:var(--gutter) 1fr;height:calc(24 * var(--hour));}.hours.svelte-16enfn0 {position:relative;}.hl.svelte-16enfn0 {position:absolute;right:8px;transform:translateY(-50%);font-variant-numeric:tabular-nums;white-space:nowrap;}.cols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);position:relative;touch-action:pan-y;}.col.svelte-16enfn0 {position:relative;border-left:1px solid var(--border);cursor:cell;min-width:0;background-image:repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px var(--hour)), repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour) / 2), color-mix(in srgb, var(--border) 45%, transparent) calc(var(--hour) / 2) calc(var(--hour) / 2 + 1px), transparent calc(var(--hour) / 2 + 1px) var(--hour));}.col.weekend.svelte-16enfn0 {background-color:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.ev.svelte-16enfn0 {position:absolute;box-sizing:border-box;cursor:pointer;border-radius:var(--radius-sm);padding:2px 6px;overflow:hidden;display:flex;flex-direction:column;gap:0;font-size:0.8em;line-height:1.25;background:color-mix(in srgb, var(--c) 24%, var(--bg));border-left:3px solid var(--c);color:var(--text);box-shadow:0 0 0 1px var(--bg);touch-action:none;z-index:1;}.ev.svelte-16enfn0:hover {background:color-mix(in srgb, var(--c) 34%, var(--bg));}.ev.svelte-16enfn0:focus-visible, .ev.sel.svelte-16enfn0, .bar.sel.svelte-16enfn0, .bar.svelte-16enfn0:focus-visible {outline:2px solid var(--c);outline-offset:1px;z-index:3;}.ev.short.svelte-16enfn0 {flex-direction:row;gap:6px;align-items:baseline;}.ev.short.svelte-16enfn0 .t:where(.svelte-16enfn0) {flex:0 1 auto;min-width:2.5em;}.ev.short.svelte-16enfn0 .when:where(.svelte-16enfn0) {flex:0 100 auto;min-width:0;}.ev.ro.svelte-16enfn0 {cursor:default;}.ev.free.svelte-16enfn0 {background:color-mix(in srgb, var(--c) 10%, var(--bg));}.ev.cancel.svelte-16enfn0 .t:where(.svelte-16enfn0), .bar.cancel.svelte-16enfn0 {text-decoration:line-through;opacity:0.7;}.ev.ghosted.svelte-16enfn0 {opacity:0.35;}.t.svelte-16enfn0 {font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}.when.svelte-16enfn0, .loc.svelte-16enfn0 {color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}.grip.svelte-16enfn0 {position:absolute;left:0;right:0;bottom:0;height:7px;cursor:ns-resize;}.slot-ghost.svelte-16enfn0 {z-index:4;pointer-events:none;box-shadow:var(--shadow-md, 0 4px 16px rgba(0,0,0,.25));background:color-mix(in srgb, var(--c) 40%, var(--bg));}.now.svelte-16enfn0 {position:absolute;left:-1px;right:0;height:2px;background:var(--red);z-index:5;pointer-events:none;}.now.svelte-16enfn0::before {content:\"\";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--red);}\n  @media (prefers-reduced-motion: no-preference) {.ev.svelte-16enfn0 {transition:opacity 120ms var(--ease);} }"
};
function $e(n, i) {
	se(i, !0), f(n, Qe);
	let a = U(void 0), c = U(void 0), u = X(() => i.days.map((e) => ue(i.cal.events, e))), d = X(() => ie(i.cal.events, i.days)), p = X(() => Math.max(1, ...e(d).map((e) => e.row + 1))), m = Array.from({ length: 24 }, (e, t) => t), h = (e) => e === 0 ? "" : i.cal.h12 ? new Date(2e3, 0, 1, e).toLocaleTimeString(void 0, {
		hour: "numeric",
		hour12: !0
	}) : String(e).padStart(2, "0"), g = X(() => i.cal.now.getHours() * 60 + i.cal.now.getMinutes()), y = (e) => i.selected !== null && i.selected.uid === e.uid && i.selected.rid === e.rid && i.selected.calendar === e.calendar, C = (e) => e.color ?? i.cal.colorOf(e.calendar);
	r(() => {
		let t = Number(i.cal.settings.day_start ?? 8), n = i.days.some((e) => L(e, i.cal.now)) ? Math.max(0, e(g) / 60 - 2) : t;
		e(a) && (e(a).scrollTop = Math.max(0, n * 48 - 8));
	});
	let w = U(null), T = (e) => Math.round(e / 15) * 15;
	function O(t) {
		let n = e(c).getBoundingClientRect();
		return {
			day: Math.min(i.days.length - 1, Math.max(0, Math.floor((t.clientX - n.left) / n.width * i.days.length))),
			min: Math.min(1440, Math.max(0, (t.clientY - n.top) / 48 * 60))
		};
	}
	function A(e, t, n, r = 0, i = 0) {
		if (e.button !== 0) return;
		e.stopPropagation();
		let a = O(e);
		if (t === "create") {
			let n = Math.floor(a.min / 15) * 15;
			M(w, {
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
		} else M(w, {
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
	function N(t) {
		if (!e(w) || !e(w).moved && Math.hypot(t.clientX - e(w).x0, t.clientY - e(w).y0) < 4) return;
		let n = O(t), r = e(w);
		if (r.moved = !0, r.kind === "create") {
			let e = T(n.min);
			[r.from, r.to] = e >= r.grab ? [r.grab, Math.max(r.grab + 15, e)] : [e, r.grab + 15];
		} else if (r.kind === "move") {
			let e = T(n.min - r.grab);
			r.day = n.day, r.from = Math.max(0, Math.min(1425, e)), r.to = r.from + r.len;
		} else r.to = Math.max(r.from + 15, T(n.min));
		M(w, { ...r }, !0);
	}
	async function ee(t) {
		let n = e(w);
		if (M(w, null), document.body.style.userSelect = "", !n) return;
		let r = (e, t) => new Date(i.days[e].getFullYear(), i.days[e].getMonth(), i.days[e].getDate(), 0, t);
		if (n.kind === "create") {
			let t = e(c).getBoundingClientRect(), a = t.width / i.days.length;
			i.oncreate(r(n.day, n.from), r(n.day, n.to), !1, new DOMRect(t.left + n.day * a, t.top + n.from / 60 * 48, a, (n.to - n.from) / 60 * 48));
			return;
		}
		let a = (t.target.closest(".ev") ?? t.target).getBoundingClientRect(), o = n.e;
		if (!n.moved) {
			i.onselect(o, a);
			return;
		}
		if (!o.writable) {
			i.cal.toast(`${o.calendar_name || "This calendar"} is read-only`, "error");
			return;
		}
		let s = r(n.day, n.from), l = r(n.day, n.to), u = await i.cal.askScope(o, n.kind === "move" ? "Move" : "Change");
		if (!u) return;
		let d = (e) => String(e).padStart(2, "0"), f = (e) => `${e.getFullYear()}-${d(e.getMonth() + 1)}-${d(e.getDate())}T${d(e.getHours())}:${d(e.getMinutes())}`;
		await i.cal.change(o, {
			start: f(s),
			end: f(l),
			from_start: o.start
		}, u, n.kind === "move" ? "Moved" : "Resized");
	}
	function te(t) {
		e(w) && t.key === "Escape" && (M(w, null), document.body.style.userSelect = "", t.stopPropagation());
	}
	function ne(e, t) {
		if (e.target.closest(".bar")) return;
		let n = i.days[t];
		i.oncreate(D(n), z(D(n), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var B = Ze();
	_("keydown", ae, te);
	let V;
	var H = J(B), W = J(H);
	W.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ");
	var re = K(W, 2);
	v(re, 17, () => i.days, he, (t, n) => {
		var r = Be();
		let a;
		var o = J(r), c = k(o, !0), u = K(o, 2), d = k(u, !0);
		R(r), P((e, t, n) => {
			a = l(r, 1, "dayhead svelte-16enfn0", null, a, { today: e }), x(c, t), x(d, n);
		}, [
			() => L(e(n), i.cal.now),
			() => e(n).toLocaleDateString(void 0, { weekday: "short" }),
			() => e(n).getDate()
		]), E("click", r, () => i.cal.go(e(n), "day")), s(t, r);
	}), R(H);
	var G = K(H, 2);
	let oe;
	var q = K(J(G), 2), ce = J(q);
	v(ce, 17, () => i.days, he, (e, t, n) => {
		var r = Ve();
		o(r, "", {}, { "grid-column": n + 1 }), E("click", r, (e) => ne(e, n)), E("keydown", r, () => {}), s(e, r);
	});
	var Y = K(ce, 2);
	v(Y, 17, () => e(d), (e) => e.e.calendar + e.e.uid + (e.e.rid ?? "") + e.from, (n, r) => {
		var a = Ue();
		let c, u;
		var d = J(a), f = (e) => {
			var t = He();
			s(e, t);
		}, p = X(() => F(e(r).e));
		S(d, (t) => {
			e(p) && t(f);
		});
		var m = K(d, 1, !0);
		R(a), P((n, i) => {
			c = l(a, 1, "bar ev svelte-16enfn0", null, c, {
				sel: n,
				clipl: e(r).clippedStart,
				clipr: e(r).clippedEnd,
				cancel: e(r).e.status === "CANCELLED"
			}), t(a, "title", e(r).e.summary), u = o(a, "", u, {
				"--c": i,
				"grid-column": `${e(r).from + 1} / ${e(r).to + 2}`,
				"grid-row": e(r).row + 1
			}), x(m, e(r).e.summary || "(no title)");
		}, [() => y(e(r).e), () => C(e(r).e)]), E("click", a, (t) => i.onselect(e(r).e, t.currentTarget.getBoundingClientRect())), s(n, a);
	}), R(q), R(G);
	var de = K(G, 2), fe = J(de), pe = J(fe);
	v(pe, 20, () => m, (e) => e, (e, t) => {
		var n = We();
		let r;
		var i = k(n, !0);
		P((e) => {
			r = o(n, "", r, { top: `${t * 48}px` }), x(i, e);
		}, [() => h(t)]), s(e, n);
	}), R(pe);
	var Z = K(pe, 2);
	v(Z, 21, () => i.days, he, (n, r, a) => {
		var c = Xe();
		let d;
		var f = J(c);
		v(f, 17, () => e(u)[a], (e) => e.e.calendar + e.e.uid + (e.e.rid ?? ""), (n, r) => {
			let a = X(() => e(r).bottom - e(r).top < 40);
			var c = qe();
			let u, d;
			var f = J(c), p = k(f, !0), m = K(f, 2), h = k(m), g = K(m, 2), _ = (t) => {
				var n = Ge(), i = k(n, !0);
				P(() => x(i, e(r).e.location)), s(t, n);
			};
			S(g, (t) => {
				!e(a) && e(r).e.location && t(_);
			});
			var v = K(g, 2), b = (t) => {
				var n = Ke();
				E("pointerdown", n, (t) => A(t, "resize", e(r).e, e(r).top, e(r).bottom)), s(t, n);
			};
			S(v, (t) => {
				e(r).e.writable && !e(r).endsAfter && t(b);
			}), R(c), P((n, i, s, f, m, g) => {
				u = l(c, 1, "ev svelte-16enfn0", null, u, {
					sel: n,
					short: e(a),
					ro: !e(r).e.writable,
					cancel: e(r).e.status === "CANCELLED",
					free: e(r).e.free,
					ghosted: e(w)?.e === e(r).e && e(w).moved
				}), t(c, "aria-label", `${e(r).e.summary ?? ""}, ${i ?? ""}`), d = o(c, "", d, {
					"--c": s,
					top: `${e(r).top / 60 * 48}px`,
					height: f,
					left: `calc(${e(r).col / e(r).cols * 100}% + 1px)`,
					width: `calc(${1 / e(r).cols * 100}% - 3px)`
				}), x(p, e(r).e.summary || "(no title)"), x(h, `${m ?? ""}${g ?? ""}`);
			}, [
				() => y(e(r).e),
				() => Q(j(e(r).e), i.cal.h12),
				() => C(e(r).e),
				() => `${Math.max(14, (e(r).bottom - e(r).top) / 60 * 48 - 2)}px`,
				() => Q(j(e(r).e), i.cal.h12),
				() => e(a) ? "" : ` – ${Q(le(e(r).e), i.cal.h12)}`
			]), E("pointerdown", c, (t) => e(r).startsBefore || e(r).endsAfter ? t.stopPropagation() : A(t, "move", e(r).e, e(r).top, e(r).bottom)), E("click", c, (t) => {
				(e(r).startsBefore || e(r).endsAfter) && i.onselect(e(r).e, t.currentTarget.getBoundingClientRect());
			}), E("keydown", c, (t) => {
				t.key === "Enter" && i.onselect(e(r).e, t.currentTarget.getBoundingClientRect());
			}), s(n, c);
		});
		var p = K(f, 2), m = (t) => {
			var n = Je();
			let r;
			var a = J(n), c = k(a, !0), l = K(a, 2), u = k(l);
			R(n), P((t, i, a) => {
				r = o(n, "", r, {
					"--c": t,
					top: `${e(w).from / 60 * 48}px`,
					height: `${(e(w).to - e(w).from) / 60 * 48 - 2}px`,
					left: "1px",
					width: "calc(100% - 3px)"
				}), x(c, e(w).e?.summary ?? "New event"), x(u, `${i ?? ""} – ${a ?? ""}`);
			}, [
				() => e(w).e ? C(e(w).e) : "var(--accent)",
				() => Q(new Date(2e3, 0, 1, 0, e(w).from), i.cal.h12),
				() => Q(new Date(2e3, 0, 1, 0, e(w).to), i.cal.h12)
			]), s(t, n);
		};
		S(p, (t) => {
			e(w) && e(w).moved && e(w).day === a && t(m);
		});
		var h = K(p, 2), _ = (t) => {
			var n = Ye();
			let r;
			P(() => r = o(n, "", r, { top: `${e(g) / 60 * 48}px` })), s(t, n);
		}, b = X(() => L(e(r), i.cal.now));
		S(h, (t) => {
			e(b) && t(_);
		}), R(c), P((e, t) => d = l(c, 1, "col svelte-16enfn0", null, d, {
			today: e,
			weekend: t
		}), [() => L(e(r), i.cal.now), () => e(r).getDay() === 0 || e(r).getDay() === 6]), E("pointerdown", c, (e) => A(e, "create")), s(n, c);
	}), R(Z), b(Z, (e) => M(c, e), () => e(c)), R(fe), R(de), b(de, (e) => M(a, e), () => e(a)), R(B), P(() => {
		V = o(B, "", V, {
			"--n": i.days.length,
			"--hour": "48px"
		}), oe = o(G, "", oe, { "--rows": e(p) });
	}), E("pointermove", Z, N), E("pointerup", Z, ee), _("pointercancel", Z, () => M(w, null)), s(n, B), I();
}
w([
	"click",
	"keydown",
	"pointermove",
	"pointerup",
	"pointerdown"
]);
//#endregion
//#region plugins/stable/dav/ui/src/MonthView.svelte
var et = q("<div class=\"wd svelte-13jyj5s\"> </div>"), tt = q("<div role=\"button\" tabindex=\"-1\"><button class=\"num svelte-13jyj5s\" title=\"Open this day\"> </button></div>"), nt = q("<button> </button>"), rt = q("<button><span class=\"dot svelte-13jyj5s\" aria-hidden=\"true\"></span><span class=\"tm svelte-13jyj5s\"> </span><span class=\"tt svelte-13jyj5s\"> </span></button>"), it = q("<button class=\"more svelte-13jyj5s\"> </button>"), at = q("<!> <!>", 1), ot = q("<div class=\"week svelte-13jyj5s\"><!> <!> <!></div>"), st = q("<div class=\"month svelte-13jyj5s\"><div class=\"wds svelte-13jyj5s\"></div> <div class=\"weeks svelte-13jyj5s\"></div></div>"), ct = {
	hash: "svelte-13jyj5s",
	code: ".month.svelte-13jyj5s {display:grid;grid-template-rows:auto 1fr;height:100%;min-height:0;}.wds.svelte-13jyj5s {display:grid;grid-template-columns:repeat(7, 1fr);border-bottom:1px solid var(--border);}.wd.svelte-13jyj5s {padding:6px 8px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-faint);}.weeks.svelte-13jyj5s {display:grid;grid-template-rows:repeat(var(--rows), minmax(96px, 1fr));min-height:0;overflow-y:auto;}.week.svelte-13jyj5s {display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));grid-template-rows:26px repeat(4, 21px) 1fr;row-gap:1px;border-bottom:1px solid var(--border);position:relative;min-height:0;}.cell.svelte-13jyj5s {grid-row:1 / -1;border-left:1px solid var(--border);padding:2px 4px;cursor:cell;min-width:0;}.cell.svelte-13jyj5s:first-child {border-left:0;}.cell.weekend.svelte-13jyj5s {background:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.cell.other.svelte-13jyj5s {background:color-mix(in srgb, var(--bg-alt) 90%, transparent);}.cell.other.svelte-13jyj5s .num:where(.svelte-13jyj5s) {color:var(--text-faint);}.num.svelte-13jyj5s {all:unset;cursor:pointer;font-size:0.82em;font-weight:600;color:var(--text-muted);padding:1px 6px;border-radius:999px;font-variant-numeric:tabular-nums;}.num.svelte-13jyj5s:hover {background:var(--bg-hover);color:var(--text);}.today.svelte-13jyj5s .num:where(.svelte-13jyj5s) {background:var(--accent);color:var(--accent-fg);}.num.svelte-13jyj5s:focus-visible, .bar.svelte-13jyj5s:focus-visible, .line.svelte-13jyj5s:focus-visible, .more.svelte-13jyj5s:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.bar.svelte-13jyj5s, .line.svelte-13jyj5s, .more.svelte-13jyj5s {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;min-width:0;font-size:0.8em;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.bar.svelte-13jyj5s {margin:0 3px;padding:0 7px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));border-left:3px solid var(--c);color:var(--text);}.bar.clipl.svelte-13jyj5s {margin-left:0;border-top-left-radius:0;border-bottom-left-radius:0;}.bar.clipr.svelte-13jyj5s {margin-right:0;border-top-right-radius:0;border-bottom-right-radius:0;}.line.svelte-13jyj5s {display:flex;align-items:center;gap:5px;margin:0 3px;padding:0 4px;border-radius:var(--radius-sm);color:var(--text);}.line.svelte-13jyj5s:hover, .bar.svelte-13jyj5s:hover {background:color-mix(in srgb, var(--c) 18%, var(--bg-hover));}.sel.svelte-13jyj5s {outline:2px solid var(--c);outline-offset:-1px;}.cancel.svelte-13jyj5s .tt:where(.svelte-13jyj5s) {text-decoration:line-through;opacity:0.7;}.dot.svelte-13jyj5s {width:7px;height:7px;border-radius:50%;background:var(--c);flex:none;}.tm.svelte-13jyj5s {color:var(--text-muted);font-variant-numeric:tabular-nums;flex:none;}.tt.svelte-13jyj5s {overflow:hidden;text-overflow:ellipsis;min-width:0;}.more.svelte-13jyj5s {margin:0 3px;padding:0 6px;color:var(--text-muted);font-weight:600;border-radius:var(--radius-sm);}.more.svelte-13jyj5s:hover {background:var(--bg-hover);color:var(--text);}\n  @container (max-width: 760px) {.tm.svelte-13jyj5s {display:none;} }"
};
function lt(n, r) {
	se(r, !0), f(n, ct);
	let i = X(() => Array.from({ length: Math.ceil(r.days.length / 7) }, (e, t) => r.days.slice(t * 7, t * 7 + 7))), a = X(() => r.cal.cursor.getMonth()), c = (e) => e.color ?? r.cal.colorOf(e.calendar), u = (e) => r.selected !== null && r.selected.uid === e.uid && r.selected.rid === e.rid && r.selected.calendar === e.calendar, d = (e) => e.calendar + e.uid + (e.rid ?? "");
	function p(e) {
		let t = ie(r.cal.events, e), n = Math.min(4, Math.max(0, ...t.map((e) => e.row + 1))), i = t.filter((e) => e.row < 4 - !!t.some((e) => e.row >= 4));
		return {
			bars: i,
			used: n,
			cells: e.map((e, a) => {
				let o = ce(r.cal.events, e).filter((e) => !N(e)).sort((e, t) => j(e).getTime() - j(t).getTime()), s = t.filter((e) => e.from <= a && e.to >= a), c = s.filter((e) => !i.includes(e)).length, l = Math.max(0, 4 - n - 1), u = o.length + c <= l + 1 ? o.slice(0, l + 1) : o.slice(0, l);
				return {
					timed: u,
					more: o.length - u.length + c,
					total: o.length + s.length
				};
			})
		};
	}
	function m(e, t) {
		e.target.closest("button") || r.oncreate(D(t), z(D(t), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var h = st();
	let g;
	var _ = J(h);
	v(_, 21, () => e(i)[0] ?? [], (e) => e.getDay(), (t, n) => {
		var r = et(), i = k(r, !0);
		P((e) => x(i, e), [() => e(n).toLocaleDateString(void 0, { weekday: "short" })]), s(t, r);
	}), R(_);
	var y = K(_, 2);
	v(y, 21, () => e(i), he, (n, i) => {
		let f = X(() => p(e(i)));
		var h = ot(), g = J(h);
		v(g, 17, () => e(i), he, (n, i, c) => {
			var u = tt();
			let d;
			o(u, "", {}, { "grid-column": c + 1 });
			var f = J(u), p = k(f, !0);
			R(u), P((e, n, r, i, a) => {
				d = l(u, 1, "cell svelte-13jyj5s", null, d, {
					other: e,
					today: n,
					weekend: r
				}), t(u, "aria-label", `New event on ${i ?? ""}`), x(p, a);
			}, [
				() => e(i).getMonth() !== e(a),
				() => L(e(i), r.cal.now),
				() => e(i).getDay() === 0 || e(i).getDay() === 6,
				() => e(i).toLocaleDateString(),
				() => e(i).getDate() === 1 ? e(i).toLocaleDateString(void 0, {
					day: "numeric",
					month: "short"
				}) : e(i).getDate()
			]), E("click", u, (t) => m(t, e(i))), E("keydown", u, () => {}), E("click", f, () => r.cal.go(e(i), "day")), s(n, u);
		});
		var _ = K(g, 2);
		v(_, 17, () => e(f).bars, (e) => d(e.e) + e.from, (n, i) => {
			var a = nt();
			let d, f;
			var p = k(a, !0);
			P((n, r) => {
				d = l(a, 1, "bar svelte-13jyj5s", null, d, {
					sel: n,
					clipl: e(i).clippedStart,
					clipr: e(i).clippedEnd
				}), t(a, "title", e(i).e.summary), f = o(a, "", f, {
					"--c": r,
					"grid-column": `${e(i).from + 1} / ${e(i).to + 2}`,
					"grid-row": e(i).row + 2
				}), x(p, e(i).e.summary || "(no title)");
			}, [() => u(e(i).e), () => c(e(i).e)]), E("click", a, (t) => r.onselect(e(i).e, t.currentTarget.getBoundingClientRect())), s(n, a);
		});
		var y = K(_, 2);
		v(y, 17, () => e(f).cells, he, (n, a, p) => {
			var m = at(), h = B(m);
			v(h, 19, () => e(a).timed, (e) => d(e), (n, i, a) => {
				var d = rt();
				let m, h;
				var g = K(J(d)), _ = k(g, !0), v = K(g), y = k(v, !0);
				R(d), P((n, r, s, c) => {
					m = l(d, 1, "line svelte-13jyj5s", null, m, {
						sel: n,
						cancel: e(i).status === "CANCELLED"
					}), t(d, "title", `${r ?? ""} ${e(i).summary ?? ""}`), h = o(d, "", h, {
						"--c": s,
						"grid-column": p + 1,
						"grid-row": e(f).used + 2 + e(a)
					}), x(_, c), x(y, e(i).summary || "(no title)");
				}, [
					() => u(e(i)),
					() => Q(j(e(i)), r.cal.h12),
					() => c(e(i)),
					() => Q(j(e(i)), r.cal.h12)
				]), E("click", d, (t) => r.onselect(e(i), t.currentTarget.getBoundingClientRect())), s(n, d);
			});
			var g = K(h, 2), _ = (t) => {
				var n = it();
				let c;
				var l = k(n);
				P(() => {
					c = o(n, "", c, {
						"grid-column": p + 1,
						"grid-row": e(f).used + 2 + e(a).timed.length
					}), x(l, `+${e(a).more ?? ""} more`);
				}), E("click", n, () => r.cal.go(e(i)[p], "day")), s(t, n);
			};
			S(g, (t) => {
				e(a).more > 0 && t(_);
			}), s(n, m);
		}), R(h), s(n, h);
	}), R(y), R(h), P(() => g = o(h, "", g, { "--rows": e(i).length })), s(n, h), I();
}
w(["click", "keydown"]);
//#endregion
//#region plugins/stable/dav/ui/src/AgendaView.svelte
var ut = q("<div class=\"empty svelte-zo3qq8\"> </div>"), dt = q("<span class=\"loc svelte-zo3qq8\"> </span>"), ft = q("<span class=\"ic svelte-zo3qq8\" title=\"Repeats\"><!></span>"), pt = q("<span class=\"ic svelte-zo3qq8\" title=\"From a note\"><!></span>"), mt = q("<li><button><span class=\"dot svelte-zo3qq8\" aria-hidden=\"true\"></span> <span class=\"time svelte-zo3qq8\"> </span> <span class=\"what svelte-zo3qq8\"> <!></span> <!> <!> <span class=\"cal svelte-zo3qq8\"> </span></button></li>"), ht = q("<section><button class=\"date svelte-zo3qq8\" title=\"Open this day\"><span class=\"n svelte-zo3qq8\"> </span> <span class=\"w svelte-zo3qq8\"> <br/> </span></button> <ul class=\"svelte-zo3qq8\"></ul></section>"), gt = q("<div class=\"agenda svelte-zo3qq8\"><!> <!></div>"), _t = {
	hash: "svelte-zo3qq8",
	code: ".agenda.svelte-zo3qq8 {height:100%;overflow-y:auto;padding:6px 0 40px;}.empty.svelte-zo3qq8 {padding:40px;text-align:center;color:var(--text-faint);}.day.svelte-zo3qq8 {display:grid;grid-template-columns:92px 1fr;gap:8px;padding:6px 14px;border-bottom:1px solid var(--border);}.date.svelte-zo3qq8 {all:unset;cursor:pointer;display:flex;gap:8px;align-items:flex-start;padding:4px 0;color:var(--text-muted);}.n.svelte-zo3qq8 {font-size:1.5em;font-weight:650;color:var(--heading);min-width:1.6em;text-align:right;font-variant-numeric:tabular-nums;line-height:1.1;}.w.svelte-zo3qq8 {font-size:0.75em;text-transform:uppercase;letter-spacing:0.04em;line-height:1.35;}.today.svelte-zo3qq8 .n:where(.svelte-zo3qq8) {color:var(--accent-strong);}.date.svelte-zo3qq8:focus-visible, .row.svelte-zo3qq8:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}ul.svelte-zo3qq8 {list-style:none;margin:0;padding:0;display:grid;gap:1px;min-width:0;}.row.svelte-zo3qq8 {all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border-radius:var(--radius-sm);min-width:0;}.row.svelte-zo3qq8:hover {background:var(--bg-hover);}.row.sel.svelte-zo3qq8 {background:color-mix(in srgb, var(--c) 16%, var(--bg));}.dot.svelte-zo3qq8 {width:9px;height:9px;border-radius:50%;background:var(--c);flex:none;}.time.svelte-zo3qq8 {flex:none;width:11.5em;white-space:nowrap;color:var(--text-muted);font-variant-numeric:tabular-nums;font-size:0.9em;}.what.svelte-zo3qq8 {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.loc.svelte-zo3qq8 {color:var(--text-muted);}.cancel.svelte-zo3qq8 .what:where(.svelte-zo3qq8) {text-decoration:line-through;opacity:0.7;}.ic.svelte-zo3qq8 {color:var(--text-faint);flex:none;}.cal.svelte-zo3qq8 {flex:none;color:var(--text-faint);font-size:0.8em;max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n  @container (max-width: 560px) {.day.svelte-zo3qq8 {grid-template-columns:1fr;gap:0;padding:6px 10px;}.date.svelte-zo3qq8 {padding-bottom:0;}.time.svelte-zo3qq8 {width:auto;min-width:5.5em;}.cal.svelte-zo3qq8 {display:none;}\n  }"
};
function vt(t, n) {
	se(n, !0), f(t, _t);
	let r = Z(n, "search", 3, !1), i = X(() => {
		if (r()) {
			let e = /* @__PURE__ */ new Map();
			for (let t of n.events) {
				let n = D(j(t)).getTime();
				e.set(n, [...e.get(n) ?? [], t]);
			}
			return [...e.entries()].map(([e, t]) => ({
				day: new Date(e),
				evs: t
			}));
		}
		let e = [];
		for (let t = n.from; t <= n.to; t = z(t, 1)) {
			let r = ce(n.events, t).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || j(e).getTime() - j(t).getTime());
			r.length && e.push({
				day: t,
				evs: r
			});
		}
		return e;
	}), a = (e) => e.color ?? n.cal.colorOf(e.calendar), c = (e) => n.selected !== null && n.selected.uid === e.uid && n.selected.rid === e.rid && n.selected.calendar === e.calendar;
	function u(e, t) {
		if (e.all_day) return "All day";
		let r = j(e), i = le(e);
		return `${L(r, t) ? Q(r, n.cal.h12) : "…"} – ${L(i, t) || i.getTime() - D(t).getTime() <= 864e5 && i.getHours() === 0 && i.getMinutes() === 0 ? Q(i, n.cal.h12) : "…"}`;
	}
	var d = gt(), p = J(d), m = (e) => {
		var t = ut(), n = k(t, !0);
		P(() => x(n, r() ? "No event matches." : "Nothing in the coming days.")), s(e, t);
	};
	S(p, (t) => {
		e(i).length || t(m);
	});
	var h = K(p, 2);
	v(h, 17, () => e(i), (e) => e.day.getTime(), (t, r) => {
		var i = ht();
		let d;
		var f = J(i), p = J(f), m = k(p, !0), h = K(p, 2), g = J(h, !0), _ = K(g, 2, !0);
		R(h), R(f);
		var y = K(f, 2);
		v(y, 21, () => e(r).evs, (e) => e.calendar + e.uid + (e.rid ?? ""), (t, i) => {
			var d = mt(), f = J(d);
			let p, m;
			var h = K(J(f), 2), g = k(h, !0), _ = K(h, 2), v = J(_, !0), y = K(v), b = (t) => {
				var n = dt(), r = k(n);
				P(() => x(r, ` · ${e(i).location ?? ""}`)), s(t, n);
			};
			S(y, (t) => {
				e(i).location && t(b);
			}), R(_);
			var C = K(_, 2), w = (e) => {
				var t = ft();
				$(J(t), {
					name: "repeat",
					size: 13
				}), R(t), s(e, t);
			};
			S(C, (t) => {
				e(i).recurring && t(w);
			});
			var T = K(C, 2), D = (e) => {
				var t = pt();
				$(J(t), {
					name: "note",
					size: 13
				}), R(t), s(e, t);
			}, O = X(() => F(e(i)));
			S(T, (t) => {
				e(O) && t(D);
			});
			var A = K(T, 2), j = k(A, !0);
			R(f), R(d), P((t, n, r) => {
				p = l(f, 1, "row svelte-zo3qq8", null, p, {
					sel: t,
					cancel: e(i).status === "CANCELLED"
				}), m = o(f, "", m, { "--c": n }), x(g, r), x(v, e(i).summary || "(no title)"), x(j, e(i).calendar_name);
			}, [
				() => c(e(i)),
				() => a(e(i)),
				() => u(e(i), e(r).day)
			]), E("click", f, (t) => n.onselect(e(i), t.currentTarget.getBoundingClientRect())), s(t, d);
		}), R(y), R(i), P((e, t, n, r) => {
			d = l(i, 1, "day svelte-zo3qq8", null, d, { today: e }), x(m, t), x(g, n), x(_, r);
		}, [
			() => L(e(r).day, n.cal.now),
			() => e(r).day.getDate(),
			() => e(r).day.toLocaleDateString(void 0, { weekday: "short" }),
			() => e(r).day.toLocaleDateString(void 0, {
				month: "short",
				year: e(r).day.getFullYear() === n.cal.now.getFullYear() ? void 0 : "numeric"
			})
		]), E("click", f, () => n.cal.go(e(r).day, "day")), s(t, i);
	}), R(d), s(t, d), I();
}
w(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/YearView.svelte
var yt = q("<span class=\"h svelte-18a11kl\"> </span>"), bt = q("<button> </button>"), xt = q("<span></span>"), St = q("<section><button class=\"mname svelte-18a11kl\"> </button> <div class=\"days svelte-18a11kl\"><!> <!></div></section>"), Ct = q("<div class=\"year svelte-18a11kl\"></div>"), wt = {
	hash: "svelte-18a11kl",
	code: ".year.svelte-18a11kl {height:100%;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(210px, 1fr));gap:18px 24px;padding:16px 20px 40px;align-content:start;}.mname.svelte-18a11kl {all:unset;cursor:pointer;font-weight:650;color:var(--heading);margin-bottom:6px;display:block;}.mname.svelte-18a11kl:hover {color:var(--accent-strong);}.days.svelte-18a11kl {display:grid;grid-template-columns:repeat(7, 1fr);gap:2px;}.h.svelte-18a11kl {font-size:0.7em;color:var(--text-faint);text-align:center;}.d.svelte-18a11kl {all:unset;cursor:pointer;text-align:center;font-size:0.78em;padding:3px 0;border-radius:var(--radius-sm);font-variant-numeric:tabular-nums;color:var(--text-muted);background:color-mix(in srgb, var(--accent) calc(var(--k) * 55%), transparent);}.d.svelte-18a11kl:hover {outline:1px solid var(--accent);}.d.svelte-18a11kl:focus-visible {outline:2px solid var(--accent);}.d.today.svelte-18a11kl {background:var(--accent);color:var(--accent-fg);font-weight:700;}"
};
function Tt(n, r) {
	se(r, !0), f(n, wt);
	let i = X(() => r.cal.cursor.getFullYear()), a = X(() => {
		let t = /* @__PURE__ */ new Map();
		for (let n = new Date(e(i), 0, 1); n.getFullYear() === e(i); n = z(n, 1)) t.set(n.toDateString(), ce(r.cal.events, n).length);
		return t;
	}), c = X(() => Math.max(1, ...e(a).values()));
	function u(t) {
		let n = pe(new Date(e(i), t, 1), r.cal.first);
		return Array.from({ length: 42 }, (e, t) => z(n, t));
	}
	let p = X(() => Array.from({ length: 7 }, (e, t) => z(pe(/* @__PURE__ */ new Date(), r.cal.first), t).toLocaleDateString(void 0, { weekday: "narrow" })));
	var m = Ct();
	v(m, 20, () => Array.from({ length: 12 }, (e, t) => t), (e) => e, (n, f) => {
		var m = St(), h = J(m), g = k(h, !0), _ = K(h, 2), y = J(_);
		v(y, 17, () => e(p), he, (t, n) => {
			var r = yt(), i = k(r, !0);
			P(() => x(i, e(n))), s(t, r);
		});
		var b = K(y, 2);
		v(b, 17, () => u(f), (e) => e.getTime(), (n, i) => {
			let u = X(() => e(i).getMonth() === f ? e(a).get(e(i).toDateString()) ?? 0 : 0);
			var p = d(), m = B(p), h = (n) => {
				var a = bt();
				let d, f;
				var p = k(a, !0);
				P((n, r, i) => {
					d = l(a, 1, "d svelte-18a11kl", null, d, { today: n }), t(a, "title", `${r ?? ""}: ${e(u) ?? ""} event${e(u) === 1 ? "" : "s"}`), f = o(a, "", f, { "--k": e(u) / e(c) }), x(p, i);
				}, [
					() => L(e(i), r.cal.now),
					() => e(i).toLocaleDateString(),
					() => e(i).getDate()
				]), E("click", a, () => r.cal.go(e(i), "day")), s(n, a);
			}, g = X(() => e(i).getMonth() === f), _ = (e) => {
				var t = xt();
				s(e, t);
			};
			S(m, (t) => {
				e(g) ? t(h) : t(_, -1);
			}), s(n, p);
		}), R(_), R(m), P((e) => x(g, e), [() => new Date(e(i), f, 1).toLocaleDateString(void 0, { month: "long" })]), E("click", h, () => r.cal.go(new Date(e(i), f, 1), "month")), s(n, m);
	}), R(m), s(n, m), I();
}
w(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/CalendarPicker.svelte
var Et = q("<option> </option>"), Dt = q("<optgroup></optgroup>"), Ot = q("<span><span class=\"dot svelte-zssqw9\" aria-hidden=\"true\"></span> <select aria-label=\"Calendar\" class=\"svelte-zssqw9\"><!><!></select></span>"), kt = {
	hash: "svelte-zssqw9",
	code: ".pick.svelte-zssqw9 {display:inline-flex;align-items:center;gap:8px;min-width:0;flex:1;}.pick.compact.svelte-zssqw9 {flex:0 1 auto;}.dot.svelte-zssqw9 {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}select.svelte-zssqw9 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 28px 5px 8px;min-width:0;flex:1;color-scheme:light dark;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.compact.svelte-zssqw9 select:where(.svelte-zssqw9) {flex:0 1 auto;max-width:16em;}select.svelte-zssqw9:disabled {opacity:0.6;}select.svelte-zssqw9:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}"
};
function At(n, r) {
	se(r, !0), f(n, kt);
	let i = Z(r, "value", 15), a = Z(r, "disabled", 3, !1), c = Z(r, "compact", 3, !1), u = X(() => r.cal.byAccount(!0)), h = X(() => e(u).length > 1), g = (e) => r.cal.sources.find((t) => t.id === e)?.name ?? e;
	var _ = Ot();
	let y;
	var b = J(_);
	let C;
	var w = K(b, 2), T = J(w), E = (e) => {
		var t = Et(), n = k(t, !0), r = {};
		P((e) => {
			x(n, e), r !== (r = i()) && (t.value = (t.__value = r) ?? "");
		}, [() => g(i())]), s(e, t);
	}, D = X(() => i() && !e(u).some((e) => e.items.some((e) => e.id === i())));
	S(T, (t) => {
		e(D) && t(E);
	});
	var O = K(T);
	v(O, 17, () => e(u), (e) => e.account.name, (n, r) => {
		var i = d(), a = B(i), o = (n) => {
			var i = Dt();
			v(i, 21, () => e(r).items, (e) => e.id, (t, n) => {
				var r = Et(), i = k(r, !0), a = {};
				P(() => {
					x(i, e(n).name), a !== (a = e(n).id) && (r.value = (r.__value = a) ?? "");
				}), s(t, r);
			}), R(i), P(() => t(i, "label", e(r).account.name)), s(n, i);
		}, c = (t) => {
			var n = d(), i = B(n);
			v(i, 17, () => e(r).items, (e) => e.id, (t, n) => {
				var r = Et(), i = k(r, !0), a = {};
				P(() => {
					x(i, e(n).name), a !== (a = e(n).id) && (r.value = (r.__value = a) ?? "");
				}), s(t, r);
			}), s(t, n);
		};
		S(a, (t) => {
			e(h) ? t(o) : t(c, -1);
		}), s(n, i);
	}), R(w), m(w), R(_), P((e) => {
		y = l(_, 1, "pick svelte-zssqw9", null, y, { compact: c() }), C = o(b, "", C, { "--c": e }), w.disabled = a(), t(w, "title", i());
	}, [() => i() ? r.cal.colorOf(i()) : "transparent"]), p(w, i), s(n, _), I();
}
//#endregion
//#region plugins/stable/dav/ui/src/Popover.svelte
var jt = q("<button class=\"tool svelte-id2g6u\" title=\"Edit (e)\"><!></button> <button class=\"tool svelte-id2g6u\" title=\"Delete (Del)\"><!></button>", 1), Mt = q("<p class=\"sub svelte-id2g6u\"><!> </p>"), Nt = q("<p class=\"sub warn svelte-id2g6u\">Cancelled</p>"), Pt = q("<a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a>"), Ft = q("<p class=\"line svelte-id2g6u\"><!><!></p>"), It = q("<li> <span class=\"faint svelte-id2g6u\">organiser</span></li>"), Lt = q("<li> <span> </span></li>"), Rt = q("<li class=\"faint svelte-id2g6u\"> </li>"), zt = q("<div class=\"line people svelte-id2g6u\"><!> <ul class=\"svelte-id2g6u\"><!> <!> <!></ul></div>"), Bt = q("<p class=\"line desc svelte-id2g6u\"><!><span class=\"svelte-id2g6u\"> </span></p>"), Vt = q("<button class=\"atlas-btn svelte-id2g6u\"><!>Open the note</button>"), Ht = q("<p class=\"line svelte-id2g6u\"><!><a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a></p>"), Ut = q("<div class=\"bar svelte-id2g6u\"><!> <button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <div class=\"head svelte-id2g6u\"><span class=\"sq svelte-id2g6u\"></span> <div><h2> </h2> <p class=\"when svelte-id2g6u\"> </p> <!> <!></div></div> <!> <!> <!> <p class=\"line faint svelte-id2g6u\"><!> </p> <!> <!>", 1), Wt = q("<div class=\"bar svelte-id2g6u\"><button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <input class=\"title svelte-id2g6u\" placeholder=\"Add a title\" aria-label=\"Title\"/> <p class=\"when svelte-id2g6u\"> </p> <div class=\"line faint svelte-id2g6u\"><!><!></div> <div class=\"acts svelte-id2g6u\"><button class=\"atlas-btn svelte-id2g6u\">More options</button> <button class=\"atlas-btn primary svelte-id2g6u\">Save</button></div>", 1), Gt = q("<div class=\"pop svelte-id2g6u\" role=\"dialog\"><!></div>"), Kt = {
	hash: "svelte-id2g6u",
	code: ".pop.svelte-id2g6u {position:absolute;z-index:50;width:min(360px, calc(100% - 16px));box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:8px 14px 14px;display:grid;gap:8px; animation: svelte-id2g6u-in 120ms var(--ease);}\n  @keyframes svelte-id2g6u-in { from { opacity: 0; transform: translateY(4px); } }\n  @media (prefers-reduced-motion: reduce) {.pop.svelte-id2g6u { animation: none;} }.bar.svelte-id2g6u {display:flex;justify-content:flex-end;gap:2px;margin:0 -8px -4px 0;}.tool.svelte-id2g6u {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-id2g6u:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-id2g6u:focus-visible {outline:2px solid var(--accent);}.head.svelte-id2g6u {display:flex;gap:12px;align-items:flex-start;}.sq.svelte-id2g6u {width:14px;height:14px;border-radius:4px;background:var(--c);flex:none;margin-top:5px;}h2.svelte-id2g6u {margin:0;font-size:1.15em;font-weight:600;color:var(--heading);overflow-wrap:anywhere;}.cancel.svelte-id2g6u {text-decoration:line-through;}.when.svelte-id2g6u {margin:2px 0 0;color:var(--text-muted);font-size:0.92em;}.sub.svelte-id2g6u {margin:2px 0 0;color:var(--text-faint);font-size:0.85em;display:flex;align-items:center;gap:4px;}.warn.svelte-id2g6u {color:var(--red);}.line.svelte-id2g6u {margin:0;display:flex;gap:10px;align-items:flex-start;color:var(--text);font-size:0.9em;min-width:0;overflow-wrap:anywhere;}.line.svelte-id2g6u .icon {margin-top:2px;color:var(--text-faint);}.desc.svelte-id2g6u span:where(.svelte-id2g6u) {white-space:pre-wrap;max-height:9em;overflow:auto;}.people.svelte-id2g6u ul:where(.svelte-id2g6u) {list-style:none;margin:0;padding:0;display:grid;gap:2px;}.faint.svelte-id2g6u {color:var(--text-faint);}.ps.svelte-id2g6u {font-size:0.8em;color:var(--text-faint);}.ps-accepted.svelte-id2g6u {color:var(--green);}.ps-declined.svelte-id2g6u {color:var(--red);}.ps-tentative.svelte-id2g6u {color:var(--yellow);}a.svelte-id2g6u {color:var(--accent);}.atlas-btn.svelte-id2g6u {display:inline-flex;align-items:center;gap:6px;justify-self:start;}.title.svelte-id2g6u {all:unset;font-size:1.15em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--accent);padding:4px 0;}.title.svelte-id2g6u::placeholder {color:var(--text-faint);font-weight:400;}.acts.svelte-id2g6u {display:flex;justify-content:flex-end;gap:8px;}"
};
function qt(n, i) {
	se(i, !0), f(n, Kt);
	let a = Z(i, "e", 3, null), c = Z(i, "draft", 3, null), u = U(void 0), d = U(""), p = U(Y(i.cal.newCalendar() ?? "")), m = U(void 0), g = U(Y({
		left: 0,
		top: 0
	}));
	function _() {
		let t = e(u)?.offsetWidth ?? 340, n = e(u)?.offsetHeight ?? 200, r = i.at.right - i.box.left + 8;
		r + t > i.box.width - 8 && (r = i.at.left - i.box.left - t - 8), r < 8 && (r = Math.max(8, Math.min(i.box.width - t - 8, i.at.left - i.box.left)));
		let a = i.at.top - i.box.top;
		a + n > i.box.height - 8 && (a = Math.max(8, i.box.height - n - 8)), M(g, {
			left: r,
			top: Math.max(8, a)
		}, !0);
	}
	r(() => {
		_(), e(m)?.focus();
	});
	async function y() {
		if (!c()) return;
		let t = (e) => String(e).padStart(2, "0"), n = (e) => `${e.getFullYear()}-${t(e.getMonth() + 1)}-${t(e.getDate())}T${t(e.getHours())}:${t(e.getMinutes())}`, r = (e) => n(e).slice(0, 10);
		i.onclose(), await i.cal.create({
			summary: e(d).trim() || "(no title)",
			start: c().all_day ? r(c().start) : n(c().start),
			end: c().all_day ? r(c().end) : n(c().end),
			all_day: c().all_day,
			calendar: e(p) || void 0
		});
	}
	let C = X(() => a() ? F(a()) : null), w = X(() => c() ? c().all_day ? `${c().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · all day` : `${c().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · ${Q(c().start, i.cal.h12)} – ${Q(c().end, i.cal.h12)}` : "");
	var D = Gt();
	let O;
	var A = J(D), j = (n) => {
		var r = Ut(), c = B(r), u = J(c), d = (e) => {
			var t = jt(), n = B(t);
			$(J(n), {
				name: "pen",
				size: 15
			}), R(n);
			var r = K(n, 2);
			$(J(r), {
				name: "trash",
				size: 15
			}), R(r), E("click", n, function(...e) {
				i.onedit?.apply(this, e);
			}), E("click", r, () => {
				i.onclose(), i.cal.remove(a());
			}), s(e, t);
		};
		S(u, (e) => {
			a().writable && e(d);
		});
		var f = K(u, 2);
		$(J(f), {
			name: "x",
			size: 15
		}), R(f), R(c);
		var p = K(c, 2), m = J(p);
		let h;
		var g = K(m, 2), _ = J(g);
		let y;
		var b = k(_, !0), w = K(_, 2), D = k(w, !0), O = K(w, 2), A = (e) => {
			var t = Mt(), n = J(t);
			$(n, {
				name: "repeat",
				size: 12
			});
			var r = K(n);
			R(t), P((e) => x(r, ` ${e ?? ""}`), [() => W(a().rrule) || "Repeats"]), s(e, t);
		};
		S(O, (e) => {
			a().recurring && e(A);
		});
		var j = K(O, 2), M = (e) => {
			var t = Nt();
			s(e, t);
		};
		S(j, (e) => {
			a().status === "CANCELLED" && e(M);
		}), R(g), R(p);
		var N = K(p, 2), ee = (n) => {
			var r = Ft(), i = J(r);
			$(i, {
				name: "pin",
				size: 14
			});
			var o = K(i), c = (e) => {
				var n = Pt(), r = k(n, !0);
				P(() => {
					t(n, "href", a().location), x(r, a().location);
				}), s(e, n);
			}, l = X(() => /^https?:\/\//.test(a().location)), u = (e) => {
				var t = T();
				P(() => x(t, a().location)), s(e, t);
			};
			S(o, (t) => {
				e(l) ? t(c) : t(u, -1);
			}), R(r), s(n, r);
		};
		S(N, (e) => {
			a().location && e(ee);
		});
		var F = K(N, 2), I = (t) => {
			var n = zt(), r = J(n);
			$(r, {
				name: "people",
				size: 14
			});
			var i = K(r, 2), o = J(i), c = (e) => {
				var t = It(), n = J(t);
				re(), R(t), P(() => x(n, `${a().organizer.name ?? a().organizer.email ?? ""} `)), s(e, t);
			};
			S(o, (e) => {
				a().organizer && e(c);
			});
			var u = K(o, 2);
			v(u, 17, () => (a().attendees ?? []).slice(0, 8), (e) => e.email, (t, n) => {
				var r = Lt(), i = J(r), a = K(i), o = k(a, !0);
				R(r), P((t, r) => {
					x(i, `${e(n).name ?? e(n).email ?? ""} `), l(a, 1, `ps ps-${t ?? ""}`, "svelte-id2g6u"), x(o, r);
				}, [() => (e(n).partstat ?? "needs-action").toLowerCase(), () => (e(n).partstat ?? "NEEDS-ACTION").toLowerCase().replace("needs-action", "no answer")]), s(t, r);
			});
			var d = K(u, 2), f = (e) => {
				var t = Rt(), n = k(t);
				P(() => x(n, `and ${(a().attendees?.length ?? 0) - 8} more`)), s(e, t);
			};
			S(d, (e) => {
				(a().attendees?.length ?? 0) > 8 && e(f);
			}), R(i), R(n), s(t, n);
		};
		S(F, (e) => {
			(a().organizer || a().attendees?.length) && e(I);
		});
		var ne = K(F, 2), L = (e) => {
			var t = Bt(), n = J(t);
			$(n, {
				name: "text",
				size: 14
			});
			var r = K(n), i = k(r, !0);
			R(t), P(() => x(i, a().description)), s(e, t);
		};
		S(ne, (e) => {
			a().description && e(L);
		});
		var z = K(ne, 2), V = J(z);
		$(V, {
			name: "calendar",
			size: 14
		});
		var H = K(V);
		R(z);
		var U = K(z, 2), ie = (t) => {
			var n = Vt();
			$(J(n), {
				name: "note",
				size: 14
			}), re(), R(n), E("click", n, () => {
				i.cal.atlas.open(e(C)), i.onclose();
			}), s(t, n);
		};
		S(U, (t) => {
			e(C) && t(ie);
		});
		var ae = K(U, 2), G = (e) => {
			var n = Ht(), r = J(n);
			$(r, {
				name: "link",
				size: 14
			});
			var i = K(r), o = k(i, !0);
			R(n), P(() => {
				t(i, "href", a().url), x(o, a().url);
			}), s(e, n);
		};
		S(ae, (e) => {
			a().url && e(G);
		}), P((e, t) => {
			h = o(m, "", h, { "--c": e }), y = l(_, 1, "svelte-id2g6u", null, y, { cancel: a().status === "CANCELLED" }), x(b, a().summary || "(no title)"), x(D, t), x(H, `${a().calendar_name ?? ""}${a().writable ? "" : " · read-only"}`);
		}, [() => a().color ?? i.cal.colorOf(a().calendar), () => te(a(), i.cal.h12)]), E("click", f, function(...e) {
			i.onclose?.apply(this, e);
		}), s(n, r);
	}, N = (t) => {
		var n = Wt(), r = B(n), a = J(r);
		$(J(a), {
			name: "x",
			size: 15
		}), R(a), R(r);
		var o = K(r, 2);
		V(o), b(o, (e) => M(m, e), () => e(m));
		var c = K(o, 2), l = k(c, !0), u = K(c, 2), f = J(u);
		$(f, {
			name: "calendar",
			size: 14
		});
		var g = K(f), _ = (t) => {
			At(t, {
				get cal() {
					return i.cal;
				},
				get value() {
					return e(p);
				},
				set value(e) {
					M(p, e, !0);
				}
			});
		}, v = (e) => {
			var t = T("No calendar to write to");
			s(e, t);
		};
		S(g, (t) => {
			e(p) ? t(_) : t(v, -1);
		}), R(u);
		var C = K(u, 2), D = J(C), O = K(D, 2);
		R(C), P(() => {
			x(l, e(w)), O.disabled = !e(p);
		}), E("click", a, function(...e) {
			i.onclose?.apply(this, e);
		}), E("keydown", o, (e) => {
			e.key === "Enter" ? (e.preventDefault(), y()) : e.key === "Escape" && (e.stopPropagation(), i.onclose());
		}), h(o, () => e(d), (e) => M(d, e)), E("click", D, () => i.onmore(e(d), e(p))), E("click", O, y), s(t, n);
	};
	S(A, (e) => {
		a() ? e(j) : c() && e(N, 1);
	}), R(D), b(D, (e) => M(u, e), () => e(u)), P(() => {
		t(D, "aria-label", a() ? a().summary : "New event"), O = o(D, "", O, {
			left: `${e(g).left ?? ""}px`,
			top: `${e(g).top ?? ""}px`
		});
	}), s(n, D), I();
}
w(["click", "keydown"]);
//#endregion
//#region plugins/stable/dav/ui/src/Editor.svelte
var Jt = q("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Starts at\"/>"), Yt = q("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Ends at\"/>"), Xt = q("<option> </option>"), Zt = q("<div class=\"row svelte-aeatm8\"><!><span class=\"guests svelte-aeatm8\"> </span></div>"), Qt = q("<div class=\"atlas-notice error\"> </div>"), $t = q("<div class=\"scrim svelte-aeatm8\" role=\"presentation\"></div> <div class=\"ed svelte-aeatm8\" role=\"dialog\" aria-modal=\"true\" tabindex=\"-1\"><header class=\"svelte-aeatm8\"><h2 class=\"svelte-aeatm8\"> </h2> <button class=\"tool svelte-aeatm8\" aria-label=\"Close\"><!></button></header> <input class=\"title svelte-aeatm8\" placeholder=\"Add a title\" aria-label=\"Title\"/> <div class=\"row when svelte-aeatm8\"><!> <div class=\"times svelte-aeatm8\"><input type=\"date\" aria-label=\"Starts on\" class=\"svelte-aeatm8\"/> <!> <span class=\"to svelte-aeatm8\">to</span> <!> <input type=\"date\" aria-label=\"Ends on\" class=\"svelte-aeatm8\"/> <label class=\"check svelte-aeatm8\"><input type=\"checkbox\" class=\"svelte-aeatm8\"/> All day</label></div></div> <div class=\"row svelte-aeatm8\"><!> <select aria-label=\"Repeat\" class=\"svelte-aeatm8\"></select></div> <div class=\"row svelte-aeatm8\"><!><input placeholder=\"Add a place\" aria-label=\"Place\" class=\"svelte-aeatm8\"/></div> <div class=\"row svelte-aeatm8\"><!> <!></div> <!> <div class=\"row top svelte-aeatm8\"><!><textarea rows=\"5\" placeholder=\"Add a description\" aria-label=\"Description\" class=\"svelte-aeatm8\"></textarea></div> <p class=\"zone svelte-aeatm8\"> </p> <!> <footer class=\"svelte-aeatm8\"><span class=\"hint svelte-aeatm8\">Ctrl+Enter saves</span> <button class=\"atlas-btn\">Cancel</button> <button class=\"atlas-btn primary\">Save</button></footer></div>", 1), en = {
	hash: "svelte-aeatm8",
	code: ".scrim.svelte-aeatm8 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 55%, transparent);z-index:70;}.ed.svelte-aeatm8 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(620px, calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:12px 18px 16px;display:grid;gap:12px;}header.svelte-aeatm8 {display:flex;align-items:center;}h2.svelte-aeatm8 {flex:1;margin:0;font-size:0.85em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.tool.svelte-aeatm8 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;}.tool.svelte-aeatm8:hover {background:var(--bg-hover);}.title.svelte-aeatm8 {all:unset;font-size:1.35em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--border-strong);padding:4px 0;}.title.svelte-aeatm8:focus {border-bottom-color:var(--accent);}.title.svelte-aeatm8:focus-visible {outline:none;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8) {appearance:none;-webkit-appearance:none;padding-right:28px;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8):disabled {opacity:0.6;}.row.svelte-aeatm8 {display:flex;gap:12px;align-items:center;color:var(--text-faint);min-width:0;}.row.top.svelte-aeatm8 {align-items:flex-start;}.times.svelte-aeatm8 {display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.to.svelte-aeatm8 {color:var(--text-muted);}input.svelte-aeatm8:not(.title):not([type=checkbox]), select.svelte-aeatm8, textarea.svelte-aeatm8 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 8px;min-width:0;color-scheme:light dark;}.row.svelte-aeatm8 > input:where(.svelte-aeatm8), .row.svelte-aeatm8 > select:where(.svelte-aeatm8), textarea.svelte-aeatm8 {flex:1;}textarea.svelte-aeatm8 {resize:vertical;}input.svelte-aeatm8:focus-visible, select.svelte-aeatm8:focus-visible, textarea.svelte-aeatm8:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.hm.svelte-aeatm8 {width:5.5em;font-variant-numeric:tabular-nums;text-align:center;}.check.svelte-aeatm8 {display:flex;gap:6px;align-items:center;color:var(--text);margin-left:6px;}.guests.svelte-aeatm8 {color:var(--text);}.zone.svelte-aeatm8 {margin:0;color:var(--text-faint);font-size:0.82em;}footer.svelte-aeatm8 {display:flex;gap:8px;align-items:center;justify-content:flex-end;}.hint.svelte-aeatm8 {flex:1;color:var(--text-faint);font-size:0.82em;}"
};
function tn(n, a) {
	se(a, !0), f(n, en);
	let o = Z(a, "e", 3, null), c = Z(a, "title", 3, ""), l = Z(a, "calendar", 3, ""), u = Y({
		summary: o()?.summary ?? c(),
		all_day: a.allDay,
		sday: a.start.slice(0, 10),
		stime: a.start.slice(11, 16) || "09:00",
		eday: a.end.slice(0, 10),
		etime: a.end.slice(11, 16) || "10:00",
		location: o()?.location ?? "",
		description: o()?.description ?? "",
		rrule: o()?.rrule ?? "",
		calendar: o()?.calendar ?? (l() || a.cal.newCalendar()) ?? ""
	}), d = U(void 0), g = U("");
	r(() => e(d)?.focus());
	let _ = X(() => {
		let e = oe(/* @__PURE__ */ new Date(`${u.sday}T12:00`));
		return u.rrule && !e.some((e) => e.value === u.rrule) && e.push({
			value: u.rrule,
			label: W(u.rrule) || u.rrule
		}), e;
	}), y = X(() => a.cal.writable());
	function C() {
		return {
			start: u.all_day ? u.sday : `${u.sday}T${u.stime}`,
			end: u.all_day ? (() => {
				let e = z(/* @__PURE__ */ new Date(`${u.eday}T12:00`), 1);
				return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
			})() : `${u.eday}T${u.etime}`
		};
	}
	async function w() {
		let { start: e, end: t } = C();
		if (t <= e && !(u.all_day && t > e)) {
			M(g, "The end is before the start.");
			return;
		}
		let n = {
			summary: u.summary,
			start: e,
			end: t,
			all_day: u.all_day,
			location: u.location,
			description: u.description,
			rrule: u.rrule
		};
		if (!o()) {
			a.onclose(), await a.cal.create({
				...n,
				calendar: u.calendar || void 0
			});
			return;
		}
		let r = await a.cal.askScope(o(), "Change");
		r && (a.onclose(), await a.cal.change(o(), {
			...n,
			move_to: u.calendar && u.calendar !== o().calendar ? u.calendar : void 0,
			from_start: o().start
		}, r, "Saved"));
	}
	function T(e) {
		e.key === "Escape" ? (e.stopPropagation(), a.onclose()) : e.key === "Enter" && (e.ctrlKey || e.metaKey) && (e.preventDefault(), w());
	}
	function D(e, t) {
		let n = e.trim().toLowerCase().match(/^(\d{1,2})(?:[:h.]?(\d{2}))?\s*(am|pm|h)?$/);
		if (!n) return t;
		let r = Number(n[1]), i = Number(n[2] ?? 0);
		return n[3] === "pm" && r < 12 && (r += 12), n[3] === "am" && r === 12 && (r = 0), r > 23 || i > 59 ? t : `${String(r).padStart(2, "0")}:${String(i).padStart(2, "0")}`;
	}
	function O() {
		if (`${u.eday}T${u.etime}` <= `${u.sday}T${u.stime}` && (u.eday = u.sday, !u.all_day)) {
			let [e, t] = u.stime.split(":").map(Number);
			u.etime = `${String(Math.min(23, e + 1)).padStart(2, "0")}:${String(t).padStart(2, "0")}`;
		}
	}
	var A = $t(), j = B(A), N = K(j, 2), F = J(N), te = J(F), ne = k(te, !0), L = K(te, 2);
	$(J(L), { name: "x" }), R(L), R(F);
	var H = K(F, 2);
	V(H), b(H, (e) => M(d, e), () => e(d));
	var ie = K(H, 2), ae = J(ie);
	$(ae, { name: "clock" });
	var G = K(ae, 2), q = J(G);
	V(q);
	var ce = K(q, 2), le = (e) => {
		var t = Jt();
		V(t), E("change", t, () => {
			u.stime = D(u.stime, "09:00"), O();
		}), h(t, () => u.stime, (e) => u.stime = e), s(e, t);
	};
	S(ce, (e) => {
		u.all_day || e(le);
	});
	var ue = K(ce, 4), de = (e) => {
		var t = Yt();
		V(t), E("change", t, () => u.etime = D(u.etime, "10:00")), h(t, () => u.etime, (e) => u.etime = e), s(e, t);
	};
	S(ue, (e) => {
		u.all_day || e(de);
	});
	var fe = K(ue, 2);
	V(fe);
	var pe = K(fe, 2), me = J(pe);
	V(me), re(), R(pe), R(G), R(ie);
	var Q = K(ie, 2), he = J(Q);
	$(he, { name: "repeat" });
	var ge = K(he, 2);
	v(ge, 21, () => e(_), (e) => e.value, (t, n) => {
		var r = Xt(), i = k(r, !0), a = {};
		P(() => {
			x(i, e(n).label), a !== (a = e(n).value) && (r.value = (r.__value = a) ?? "");
		}), s(t, r);
	}), R(ge), m(ge), R(Q);
	var _e = K(Q, 2), ve = J(_e);
	$(ve, { name: "pin" });
	var ye = K(ve);
	V(ye), R(_e);
	var be = K(_e, 2), xe = J(be);
	$(xe, { name: "calendar" });
	var Se = K(xe, 2);
	{
		let t = X(() => !!o() && o().recurring);
		At(Se, {
			get cal() {
				return a.cal;
			},
			get disabled() {
				return e(t);
			},
			get value() {
				return u.calendar;
			},
			set value(e) {
				u.calendar = e;
			}
		});
	}
	R(be);
	var Ce = K(be, 2), we = (e) => {
		var t = Zt(), n = J(t);
		$(n, { name: "people" });
		var r = K(n), i = k(r, !0);
		R(t), P((e) => x(i, e), [() => o().attendees.map((e) => e.name ?? e.email).join(", ")]), s(e, t);
	};
	S(Ce, (e) => {
		o()?.attendees?.length && e(we);
	});
	var Te = K(Ce, 2), Ee = J(Te);
	$(Ee, { name: "text" });
	var De = K(Ee);
	ee(De), R(Te);
	var Oe = K(Te, 2), ke = k(Oe), Ae = K(Oe, 2), je = (t) => {
		var n = Qt(), r = k(n, !0);
		P(() => x(r, e(g))), s(t, n);
	};
	S(Ae, (t) => {
		e(g) && t(je);
	});
	var Me = K(Ae, 2), Ne = K(J(Me), 2), Pe = K(Ne, 2);
	R(Me), R(N), P((n) => {
		t(N, "aria-label", o() ? "Edit event" : "New event"), x(ne, o() ? "Edit event" : "New event"), x(ke, `Times in your zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""}${n ?? ""}`), Pe.disabled = !e(y).length;
	}, [() => o()?.tzid && o().tzid !== Intl.DateTimeFormat().resolvedOptions().timeZone ? ` · written in ${o().tzid}` : ""]), E("click", j, function(...e) {
		a.onclose?.apply(this, e);
	}), E("keydown", N, T), E("click", L, function(...e) {
		a.onclose?.apply(this, e);
	}), h(H, () => u.summary, (e) => u.summary = e), E("change", q, O), h(q, () => u.sday, (e) => u.sday = e), h(fe, () => u.eday, (e) => u.eday = e), i(me, () => u.all_day, (e) => u.all_day = e), p(ge, () => u.rrule, (e) => u.rrule = e), h(ye, () => u.location, (e) => u.location = e), h(De, () => u.description, (e) => u.description = e), E("click", Ne, function(...e) {
		a.onclose?.apply(this, e);
	}), E("click", Pe, w), s(n, A), I();
}
w([
	"click",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/Toasts.svelte
var nn = q("<button class=\"svelte-osdry5\">Undo</button>"), rn = q("<div><span class=\"text svelte-osdry5\"> </span> <!> <button class=\"x svelte-osdry5\" aria-label=\"Close\">×</button></div>"), an = q("<div class=\"toasts svelte-osdry5\" aria-live=\"polite\"></div>"), on = {
	hash: "svelte-osdry5",
	code: ".toasts.svelte-osdry5 {position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:60;display:grid;gap:8px;justify-items:center;pointer-events:none;width:min(560px, calc(100% - 32px));}.toast.svelte-osdry5 {pointer-events:auto;display:flex;align-items:center;gap:12px;padding:9px 10px 9px 14px;border-radius:var(--radius);background:var(--heading);color:var(--bg);box-shadow:var(--shadow-md, var(--shadow-sm));max-width:100%; animation: svelte-osdry5-in 120ms var(--ease);}.toast.error.svelte-osdry5 {background:var(--red);color:#fff;}.text.svelte-osdry5 {min-width:0;overflow-wrap:anywhere;}button.svelte-osdry5 {all:unset;cursor:pointer;font-weight:700;color:var(--accent);padding:2px 6px;border-radius:var(--radius-sm);}.error.svelte-osdry5 button:where(.svelte-osdry5) {color:#fff;text-decoration:underline;}button.svelte-osdry5:hover {background:color-mix(in srgb, currentColor 14%, transparent);}button.svelte-osdry5:focus-visible {outline:2px solid currentColor;}.x.svelte-osdry5 {color:inherit;opacity:0.7;font-weight:400;}\n  @keyframes svelte-osdry5-in { from { opacity: 0; transform: translateY(6px); } }\n  @media (prefers-reduced-motion: reduce) {.toast.svelte-osdry5 { animation: none;} }"
};
function sn(n, r) {
	se(r, !0), f(n, on);
	var i = an();
	v(i, 21, () => r.cal.toasts, (e) => e.id, (n, i) => {
		var a = rn();
		let o;
		var c = J(a), u = k(c, !0), d = K(c, 2), f = (t) => {
			var n = nn();
			E("click", n, async () => {
				r.cal.dismiss(e(i).id), await e(i).undo?.();
			}), s(t, n);
		};
		S(d, (t) => {
			e(i).undo && t(f);
		});
		var p = K(d, 2);
		R(a), P(() => {
			o = l(a, 1, "toast svelte-osdry5", null, o, { error: e(i).kind === "error" }), t(a, "role", e(i).kind === "error" ? "alert" : "status"), x(u, e(i).text);
		}), E("click", p, () => r.cal.dismiss(e(i).id)), s(n, a);
	}), R(i), s(n, i), I();
}
w(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/keys.ts
var cn = (e) => (t) => t.setView(e), ln = [
	{
		id: "day",
		title: "Day",
		group: "Views",
		keys: "d, 1",
		run: cn("day")
	},
	{
		id: "week",
		title: "Week",
		group: "Views",
		keys: "w, 2",
		run: cn("week")
	},
	{
		id: "workweek",
		title: "Work week",
		group: "Views",
		keys: "x, 3",
		run: cn("workweek")
	},
	{
		id: "month",
		title: "Month",
		group: "Views",
		keys: "m, 4",
		run: cn("month")
	},
	{
		id: "agenda",
		title: "Agenda (schedule)",
		group: "Views",
		keys: "a, 5",
		run: cn("agenda")
	},
	{
		id: "year",
		title: "Year",
		group: "Views",
		keys: "y, 6",
		run: cn("year")
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
function un(e) {
	let t = e.key.toLowerCase(), n = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
	return [...[
		e.ctrlKey || e.metaKey ? "ctrl" : "",
		e.altKey ? "alt" : "",
		e.shiftKey && !n ? "shift" : ""
	].filter(Boolean), t].join("+");
}
var dn = new Map(ln.flatMap((e) => (e.keys ?? "").split(",").map((e) => e.trim()).filter(Boolean).map((t) => [t, e])));
function fn(e) {
	return e ? e.split(",").map((e) => e.trim()).filter(Boolean).slice(0, 2).map((e) => e.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowright", "→").replace("arrowleft", "←").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("backspace", "⌫").replace(/^(⇧)?([a-z])$/, (e, t, n) => t ? `⇧${n.toUpperCase()}` : n)) : [];
}
//#endregion
//#region plugins/stable/dav/ui/src/Shortcuts.svelte
var pn = q("<kbd class=\"svelte-17nm084\"> </kbd>"), mn = q("<div class=\"row svelte-17nm084\"><span> </span><span class=\"keys svelte-17nm084\"></span></div>"), hn = q("<section><h3 class=\"svelte-17nm084\"> </h3> <!></section>"), gn = q("<div class=\"scrim svelte-17nm084\" role=\"presentation\"></div> <div class=\"sheet svelte-17nm084\" role=\"dialog\" aria-label=\"Keyboard shortcuts\" aria-modal=\"true\"><header class=\"svelte-17nm084\"><h2 class=\"svelte-17nm084\">Keyboard shortcuts</h2><button class=\"x svelte-17nm084\" aria-label=\"Close\">×</button></header> <div class=\"cols svelte-17nm084\"></div> <p class=\"hint svelte-17nm084\">Drag on the grid to make an event, drag one to move it, its lower edge to resize (15-minute steps). Esc cancels a drag.</p></div>", 1), _n = {
	hash: "svelte-17nm084",
	code: ".scrim.svelte-17nm084 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 50%, transparent);z-index:70;}.sheet.svelte-17nm084 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(760px, calc(100% - 32px));max-height:calc(100% - 40px);overflow:auto;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 30px rgba(0,0,0,.3));padding:14px 18px;}header.svelte-17nm084 {display:flex;align-items:center;}h2.svelte-17nm084 {margin:0;flex:1;font-size:1.1em;color:var(--heading);}h3.svelte-17nm084 {margin:10px 0 4px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.cols.svelte-17nm084 {display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:4px 24px;}.row.svelte-17nm084 {display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:var(--text-muted);}.keys.svelte-17nm084 {display:flex;gap:4px;}kbd.svelte-17nm084 {font:600 0.85em var(--font-mono);padding:1px 6px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);}.hint.svelte-17nm084 {color:var(--text-faint);font-size:0.86em;margin:12px 0 0;}.x.svelte-17nm084 {all:unset;cursor:pointer;font-size:1.3em;padding:0 6px;color:var(--text-muted);}"
};
function vn(t, n) {
	se(n, !0), f(t, _n);
	let r = [...new Set(ln.map((e) => e.group))];
	var i = gn(), a = B(i), o = K(a, 2), c = J(o), l = K(J(c));
	R(c);
	var u = K(c, 2);
	v(u, 20, () => r, (e) => e, (t, n) => {
		var r = hn(), i = J(r), a = k(i, !0), o = K(i, 2);
		v(o, 17, () => ln.filter((e) => e.group === n && e.keys), (e) => e.id, (t, n) => {
			var r = mn(), i = J(r), a = k(i, !0), o = K(i);
			v(o, 20, () => fn(e(n).keys), (e) => e, (e, t) => {
				var n = pn(), r = k(n, !0);
				P(() => x(r, t)), s(e, n);
			}), R(o), R(r), P(() => x(a, e(n).title)), s(t, r);
		}), R(r), P(() => x(a, n)), s(t, r);
	}), R(u), re(2), R(o), E("click", a, function(...e) {
		n.onclose?.apply(this, e);
	}), E("click", l, function(...e) {
		n.onclose?.apply(this, e);
	}), s(t, i), I();
}
w(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/App.svelte
var yn = q("<button class=\"tool svelte-1i74804\" title=\"Side panel (s)\" aria-label=\"Side panel\"><!></button>"), bn = q("<span class=\"spin svelte-1i74804\" aria-label=\"Working\"></span>"), xn = q("<option> </option>"), Sn = q("<select class=\"vsel svelte-1i74804\" aria-label=\"View\"></select>"), Cn = q("<button> </button>"), wn = q("<div class=\"seg svelte-1i74804\" role=\"group\" aria-label=\"View\"></div>"), Tn = q("<button class=\"tool svelte-1i74804\" title=\"Sync now (r)\" aria-label=\"Sync\"><!></button> <button class=\"tool svelte-1i74804\" title=\"All commands (Ctrl+K)\" aria-label=\"All commands\"><!></button>", 1), En = q("<span class=\"qprev svelte-1i74804\"><b class=\"svelte-1i74804\"> </b> </span>"), Dn = q("<div class=\"quick svelte-1i74804\"><!> <input placeholder=\"lunch with Ana tomorrow 13:00 · examen 15 nov · réunion lundi à 10h @ D3\" aria-label=\"Quick add\" class=\"svelte-1i74804\"/> <!> <!> <button class=\"atlas-btn primary\">Add</button></div>"), On = q("<aside class=\"side svelte-1i74804\" aria-label=\"Calendars\"><!></aside>"), kn = q("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button><button class=\"atlas-btn\">Settings…</button></div></div>"), An = q("<div class=\"atlas-notice\">No calendar account yet: add one in Settings (its server address, user name and app password; as many as you have) — or subscribe to a public calendar there.<div class=\"actions\"><button class=\"atlas-btn primary\">Settings…</button></div></div>"), jn = q("<button class=\"fab svelte-1i74804\" aria-label=\"New event\" title=\"New event (c)\"><!></button>"), Mn = q("<div class=\"popscrim svelte-1i74804\" role=\"presentation\"></div> <!>", 1), Nn = q("<div tabindex=\"-1\" role=\"application\" aria-label=\"Calendar\"><header class=\"top svelte-1i74804\"><!> <button class=\"atlas-btn today svelte-1i74804\" title=\"Today (t)\">Today</button> <div class=\"nav svelte-1i74804\"><button class=\"tool svelte-1i74804\" title=\"Previous (k)\" aria-label=\"Previous\"><!></button> <button class=\"tool svelte-1i74804\" title=\"Next (j)\" aria-label=\"Next\"><!></button></div> <h1 class=\"svelte-1i74804\"> </h1> <!> <span class=\"grow svelte-1i74804\"></span> <div><!> <input aria-label=\"Search events\" class=\"svelte-1i74804\"/></div> <!> <button class=\"tool svelte-1i74804\" title=\"Quick add in words (q)\" aria-label=\"Quick add\"><!></button> <!></header> <!> <div class=\"body svelte-1i74804\"><!> <main class=\"view svelte-1i74804\"><!> <!></main></div> <!> <!> <!> <!> <!></div>"), Pn = {
	hash: "svelte-1i74804",
	code: ".calendar.svelte-1i74804:focus {outline:none;}.calendar.svelte-1i74804 {position:relative;height:100%;display:grid;grid-template-rows:auto auto 1fr;color:var(--text);background:var(--bg);font-size:calc(14px * var(--ui-scale, 1));container-type:inline-size;overflow:hidden;}.top.svelte-1i74804 {grid-row:1;display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);min-width:0;}h1.svelte-1i74804 {margin:0 0 0 4px;font-size:1.2em;font-weight:600;color:var(--heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:6em;flex:0 1 auto;}.nav.svelte-1i74804 {display:flex;}.grow.svelte-1i74804 {flex:1;}.today.svelte-1i74804 {flex:none;}.tool.svelte-1i74804 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;flex:none;}.tool.svelte-1i74804:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-1i74804:focus-visible, .seg.svelte-1i74804 button:where(.svelte-1i74804):focus-visible, .fab.svelte-1i74804:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.search.svelte-1i74804 {display:flex;align-items:center;gap:6px;background:var(--bg-hover);border:1px solid transparent;border-radius:var(--radius);padding:0 8px;color:var(--text-faint);width:200px;flex:0 1 auto;min-width:70px;}.search.svelte-1i74804:focus-within, .search.on.svelte-1i74804 {border-color:var(--accent);background:var(--bg);color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1;min-width:0;padding:6px 0;color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.seg.svelte-1i74804 {display:flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;flex:none;}.seg.svelte-1i74804 button:where(.svelte-1i74804) {all:unset;cursor:pointer;padding:4px 10px;font-size:0.86em;color:var(--text-muted);}.seg.svelte-1i74804 button:where(.svelte-1i74804) + button:where(.svelte-1i74804) {border-left:1px solid var(--border);}.seg.svelte-1i74804 button:where(.svelte-1i74804):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-1i74804 button.on:where(.svelte-1i74804) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.vsel.svelte-1i74804 {appearance:none;-webkit-appearance:none;font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:4px 26px 4px 8px;flex:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 14px) 50%, calc(100% - 9px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.spin.svelte-1i74804 {width:12px;height:12px;border-radius:50%;border:2px solid var(--border-strong);border-top-color:var(--accent); animation: svelte-1i74804-spin 0.8s linear infinite;flex:none;}\n  @keyframes svelte-1i74804-spin { to { transform: rotate(360deg); } }\n  @media (prefers-reduced-motion: reduce) {.spin.svelte-1i74804 { animation: none;} }.quick.svelte-1i74804 {grid-row:2;display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--bg-alt);color:var(--accent-strong);min-width:0;flex-wrap:wrap;}.quick.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1 1 260px;min-width:0;color:var(--text);font-size:1.02em;padding:4px 0;}.quick.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.qprev.svelte-1i74804 {color:var(--text-muted);font-size:0.9em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.qprev.svelte-1i74804 b:where(.svelte-1i74804) {color:var(--text);}.body.svelte-1i74804 {grid-row:3;display:flex;min-height:0;}.side.svelte-1i74804 {flex:none;width:248px;border-right:1px solid var(--border);background:var(--bg-alt);min-height:0;}.view.svelte-1i74804 {flex:1;min-width:0;min-height:0;position:relative;display:flex;flex-direction:column;}.view.svelte-1i74804 > * {flex:1;min-height:0;}.view.svelte-1i74804 > .atlas-notice {flex:none;margin:10px 14px;}.popscrim.svelte-1i74804 {position:absolute;inset:0;z-index:49;}.fab.svelte-1i74804 {all:unset;cursor:pointer;position:absolute;right:18px;bottom:22px;z-index:40;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--accent);color:var(--accent-fg);box-shadow:var(--shadow-md, 0 6px 18px rgba(0,0,0,.3));}.narrow.svelte-1i74804 .top:where(.svelte-1i74804) {flex-wrap:wrap;row-gap:6px;padding:8px;}.narrow.svelte-1i74804 h1:where(.svelte-1i74804) {order:10;flex-basis:100%;margin:0;font-size:1.05em;}.narrow.svelte-1i74804 .search:where(.svelte-1i74804) {width:auto;flex:1 1 60px;min-width:60px;}\n  @container (max-width: 1100px) {.seg.svelte-1i74804 button:where(.svelte-1i74804) {padding:4px 7px;} }"
};
function Fn(i, o) {
	se(o, !0), f(i, Pn);
	let c = new ye(o.atlas), u = U(1200), p = U(void 0), C = U(!0), w = U(!1), T = U(void 0), O = U(""), j = U(!1), N = U(""), ee = U(void 0), F = U(null), te = U(""), L = U(null), H = U(null), W = X(() => e(u) < 700), re = X(() => !e(W) && e(u) >= 900 && e(C)), ie = X(() => c.shown());
	de(() => {
		c.narrow !== e(W) && (c.narrow = e(W), c.load());
	});
	let oe = [
		["day", "Day"],
		["week", "Week"],
		["workweek", "Work week"],
		["month", "Month"],
		["agenda", "Agenda"],
		["year", "Year"]
	], q = X(() => e(L)?.e ?? null), ce = () => e(p)?.getBoundingClientRect() ?? new DOMRect(0, 0, e(u), 800);
	function le(e, t) {
		M(L, {
			e,
			at: t
		}, !0), M(H, null);
	}
	function Y(e, t, n, r) {
		if (!c.newCalendar()) {
			c.toast(c.configured ? "No calendar of your accounts takes new events (all read-only?)" : "Add a calendar account in Settings first", "error");
			return;
		}
		M(L, {
			draft: {
				start: e,
				end: t,
				all_day: n
			},
			at: r
		}, !0);
	}
	function ue() {
		let e = new Date(c.cursor), t = /* @__PURE__ */ new Date(), n = new Date(e.getFullYear(), e.getMonth(), e.getDate(), t.getHours() + 1, 0);
		M(H, {
			start: A(n),
			end: A(new Date(n.getTime() + 36e5)),
			allDay: !1
		}, !0), M(L, null);
	}
	function fe(t = e(L)?.e) {
		if (!t) return;
		if (!t.writable) {
			c.toast(`${t.calendar_name || "This calendar"} is read-only`, "error");
			return;
		}
		let n = ye.fields(t);
		M(H, {
			e: t,
			start: n.start,
			end: n.end,
			allDay: t.all_day
		}, !0), M(L, null);
	}
	function pe(t, n) {
		let r = e(L)?.draft;
		r && (M(H, r.all_day ? {
			start: y(r.start),
			end: y(z(r.end, -1)),
			allDay: !0,
			title: t,
			calendar: n
		} : {
			start: A(r.start),
			end: A(r.end),
			allDay: !1,
			title: t,
			calendar: n
		}, !0), M(L, null));
	}
	function Z() {
		if (e(w)) {
			M(w, !1);
			return;
		}
		if (e(H)) {
			M(H, null);
			return;
		}
		if (e(L)) {
			M(L, null);
			return;
		}
		if (e(j)) {
			M(j, !1);
			return;
		}
		c.results && (M(O, ""), c.search(""));
	}
	function me() {
		o.atlas.pick({
			placeholder: "Go to a date… (2026-12-01, 15 nov, next monday)",
			tag: "Calendar",
			items: [{
				value: y(/* @__PURE__ */ new Date()),
				title: "Today"
			}, {
				value: y(z(/* @__PURE__ */ new Date(), 7)),
				title: "In a week"
			}],
			typed: (e) => `Go to “${e}”`,
			onpick: async (e, t) => {
				if (!t) {
					c.go(/* @__PURE__ */ new Date(`${e}T12:00`));
					return;
				}
				try {
					let t = await G(o.atlas, "quick", { text: e });
					c.go(/* @__PURE__ */ new Date(`${t.start.slice(0, 10)}T12:00`));
				} catch (e) {
					c.toast(e.message, "error");
				}
			}
		});
	}
	function he() {
		o.atlas.pick({
			placeholder: "Do what? (every command of the Calendar pane)",
			tag: "Calendar",
			items: ln.filter((e) => e.id !== "palette").map((e) => ({
				value: e.id,
				title: e.title,
				detail: fn(e.keys).join("  ·  ") || void 0,
				section: e.group
			})),
			onpick: (e) => ln.find((t) => t.id === e)?.run(c, _e)
		});
	}
	function ge() {
		M(j, !0), M(te, c.newCalendar() ?? "", !0), M(L, null), setTimeout(() => e(ee)?.focus(), 0);
	}
	let _e = {
		create: ue,
		quick: ge,
		edit: () => fe(),
		remove: () => {
			let t = e(L)?.e;
			t?.writable && (M(L, null), c.remove(t));
		},
		focusSearch: () => {
			e(T)?.focus(), e(T)?.select();
		},
		help: () => M(w, !e(w)),
		palette: he,
		goto: me,
		back: Z,
		sidebar: () => M(C, !e(C))
	};
	function ve(t) {
		let n = t.target;
		if (n.closest("input, textarea, select, [contenteditable=true]") || !e(p) || !(e(p).contains(n) || n === document.body || n.classList.contains("dv-content-container") && n.contains(e(p))) || [
			"shift",
			"control",
			"alt",
			"meta"
		].includes(t.key.toLowerCase())) return;
		let r = dn.get(un(t));
		r && (r.id !== "delete" && r.id !== "edit" || e(L)?.e) && (t.preventDefault(), t.stopPropagation(), r.run(c, _e));
	}
	let be;
	function xe() {
		clearTimeout(be), be = setTimeout(async () => {
			if (!e(N).trim()) {
				M(F, null);
				return;
			}
			try {
				M(F, await G(o.atlas, "quick", { text: e(N) }), !0);
			} catch {
				M(F, null);
			}
		}, 120);
	}
	async function Se() {
		if (!e(N).trim()) return;
		let t = e(F) ?? await G(o.atlas, "quick", { text: e(N) });
		M(j, !1), M(N, ""), M(F, null), await c.create({
			summary: t.title || "(no title)",
			start: t.start,
			end: t.end,
			all_day: t.all_day,
			rrule: t.rrule,
			location: t.location,
			calendar: e(te) || void 0
		}) && c.go(/* @__PURE__ */ new Date(`${t.start.slice(0, 10)}T12:00`));
	}
	let Ce = X(() => {
		let t = e(F);
		if (!t) return "";
		let n = new Date(t.all_day ? `${t.start}T00:00` : t.start), r = new Date(t.all_day ? `${t.end}T00:00` : t.end), i = n.toLocaleDateString(void 0, {
			weekday: "short",
			day: "numeric",
			month: "short"
		}), a = (e) => Q(e, c.h12);
		return t.all_day ? `${i} · all day` : `${i} · ${a(n)} – ${a(r)}`;
	}), we;
	function Te() {
		clearTimeout(we), we = setTimeout(() => void c.search(e(O)), 160);
	}
	r(() => {
		e(p)?.focus({ preventScroll: !0 }), (async () => {
			await c.loadSources(), await c.load(), c.sync(!1);
		})();
		let t = [o.atlas.helper.on("changed", () => {
			c.loadSources(), c.later();
		})], n = setInterval(() => c.now = /* @__PURE__ */ new Date(), 3e4), r = (e) => {
			let t = e.detail ?? {};
			t.date ? c.go(/* @__PURE__ */ new Date(`${t.date}T12:00`), t.view) : t.view && c.setView(t.view), t.quick && ge(), t.create && ue();
		};
		window.addEventListener("atlas-calendar:show", r);
		let i = window.__atlasCalendarShow;
		return i && (r(new CustomEvent("x", { detail: i })), window.__atlasCalendarShow = void 0), () => {
			t.forEach((e) => e()), clearInterval(n), window.removeEventListener("atlas-calendar:show", r);
		};
	});
	var Ee = Nn();
	_("keydown", ae, ve);
	let De;
	var Oe = J(Ee), ke = J(Oe), Ae = (t) => {
		var n = yn();
		$(J(n), { name: "menu" }), R(n), E("click", n, () => M(C, !e(C))), s(t, n);
	};
	S(ke, (t) => {
		e(W) || t(Ae);
	});
	var je = K(ke, 2), Me = K(je, 2), Ne = J(Me);
	$(J(Ne), { name: "back" }), R(Ne);
	var Pe = K(Ne, 2);
	$(J(Pe), { name: "right" }), R(Pe), R(Me);
	var Fe = K(Me, 2), Ie = k(Fe, !0), Le = K(Fe, 2), Re = (e) => {
		var n = bn();
		P(() => t(n, "title", c.syncing ? "Syncing with the server" : "Reading")), s(e, n);
	};
	S(Le, (e) => {
		(c.loading || c.syncing) && e(Re);
	});
	var Be = K(Le, 4);
	let Ve;
	var He = J(Be);
	$(He, {
		name: "search",
		size: 15
	});
	var Ue = K(He, 2);
	V(Ue), b(Ue, (e) => M(T, e), () => e(T)), R(Be);
	var We = K(Be, 2), Ge = (t) => {
		var n = Sn();
		v(n, 21, () => oe, ([e, t]) => e, (t, n) => {
			var r = X(() => ne(e(n), 2));
			let i = () => e(r)[0], a = () => e(r)[1];
			var o = xn(), c = k(o, !0), l = {};
			P(() => {
				x(c, a()), l !== (l = i()) && (o.value = (o.__value = l) ?? "");
			}), s(t, o);
		}), R(n);
		var r;
		m(n), P(() => {
			r !== (r = c.view) && (n.value = (n.__value = r) ?? "", g(n, r));
		}), E("change", n, (e) => c.setView(e.currentTarget.value)), s(t, n);
	}, Ke = (n) => {
		var r = wn();
		v(r, 21, () => oe, ([e, t]) => e, (n, r) => {
			var i = X(() => ne(e(r), 2));
			let a = () => e(i)[0], o = () => e(i)[1];
			var u = Cn();
			let d;
			var f = k(u, !0);
			P((e) => {
				t(u, "title", `${o() ?? ""} (${e ?? ""})`), d = l(u, 1, "svelte-1i74804", null, d, { on: c.view === a() }), x(f, o());
			}, [() => ln.find((e) => e.id === a())?.keys?.split(",")[0]]), E("click", u, () => c.setView(a())), s(n, u);
		}), R(r), s(n, r);
	};
	S(We, (t) => {
		e(u) < 980 ? t(Ge) : t(Ke, -1);
	});
	var qe = K(We, 2);
	$(J(qe), { name: "sparkle" }), R(qe);
	var Je = K(qe, 2), Ye = (e) => {
		var t = Tn(), n = B(t);
		$(J(n), { name: "refresh" }), R(n);
		var r = K(n, 2);
		$(J(r), { name: "keyboard" }), R(r), E("click", n, () => c.sync(!0)), E("click", r, he), s(e, t);
	};
	S(Je, (t) => {
		e(W) || t(Ye);
	}), R(Oe);
	var Xe = K(Oe, 2), Ze = (t) => {
		var n = Dn(), r = J(n);
		$(r, {
			name: "sparkle",
			size: 15
		});
		var i = K(r, 2);
		V(i), b(i, (e) => M(ee, e), () => e(ee));
		var a = K(i, 2), o = (t) => {
			var n = En(), r = J(n), i = k(r, !0), a = K(r);
			R(n), P(() => {
				x(i, e(F).title || "(no title)"), x(a, ` · ${e(Ce) ?? ""}${e(F).rrule ? " · repeats" : ""}${e(F).location ? ` · ${e(F).location}` : ""}`);
			}), s(t, n);
		};
		S(a, (t) => {
			e(F) && t(o);
		});
		var l = K(a, 2), u = (t) => {
			At(t, {
				get cal() {
					return c;
				},
				compact: !0,
				get value() {
					return e(te);
				},
				set value(e) {
					M(te, e, !0);
				}
			});
		};
		S(l, (t) => {
			e(te) && t(u);
		});
		var d = K(l, 2);
		R(n), P((e) => d.disabled = e, [() => !e(N).trim()]), E("input", i, xe), E("keydown", i, (e) => {
			e.key === "Enter" ? (e.preventDefault(), Se()) : e.key === "Escape" && (e.stopPropagation(), M(j, !1));
		}), h(i, () => e(N), (e) => M(N, e)), E("click", d, Se), s(t, n);
	};
	S(Xe, (t) => {
		e(j) && t(Ze);
	});
	var Qe = K(Xe, 2), et = J(Qe), tt = (e) => {
		var t = On();
		ze(J(t), {
			get cal() {
				return c;
			},
			oncreate: ue
		}), R(t), s(e, t);
	};
	S(et, (t) => {
		e(re) && t(tt);
	});
	var nt = K(et, 2), rt = J(nt), it = (e) => {
		var t = kn(), n = J(t, !0), r = K(n), i = J(r), a = K(i);
		R(r), R(t), P(() => x(n, c.error)), E("click", i, () => c.load()), E("click", a, () => o.atlas.plugin.openSettings()), s(e, t);
	}, at = (e) => {
		var t = An(), n = K(J(t)), r = k(n);
		R(t), E("click", r, () => o.atlas.plugin.openSettings()), s(e, t);
	};
	S(rt, (e) => {
		c.error ? e(it) : !c.configured && !c.sources.length && e(at, 1);
	});
	var ot = K(rt, 2), st = (t) => {
		{
			let n = X(() => D(/* @__PURE__ */ new Date())), r = X(() => D(/* @__PURE__ */ new Date()));
			vt(t, {
				get cal() {
					return c;
				},
				get events() {
					return c.results;
				},
				get from() {
					return e(n);
				},
				get to() {
					return e(r);
				},
				get selected() {
					return e(q);
				},
				onselect: le,
				search: !0
			});
		}
	}, ct = (t) => {
		{
			let n = X(() => c.days());
			lt(t, {
				get cal() {
					return c;
				},
				get days() {
					return e(n);
				},
				get selected() {
					return e(q);
				},
				onselect: le,
				oncreate: Y
			});
		}
	}, ut = (t) => {
		{
			let n = X(() => c.range().from), r = X(() => c.range().to);
			vt(t, {
				get cal() {
					return c;
				},
				get events() {
					return c.events;
				},
				get from() {
					return e(n);
				},
				get to() {
					return e(r);
				},
				get selected() {
					return e(q);
				},
				onselect: le
			});
		}
	}, dt = (e) => {
		Tt(e, { get cal() {
			return c;
		} });
	}, ft = (t) => {
		var r = d(), i = B(r);
		n(i, () => e(ie) + c.range().from.getTime(), (t) => {
			{
				let n = X(() => c.days());
				$e(t, {
					get cal() {
						return c;
					},
					get days() {
						return e(n);
					},
					get selected() {
						return e(q);
					},
					onselect: le,
					oncreate: Y
				});
			}
		}), s(t, r);
	};
	S(ot, (t) => {
		c.results ? t(st) : e(ie) === "month" ? t(ct, 1) : e(ie) === "agenda" ? t(ut, 2) : e(ie) === "year" ? t(dt, 3) : t(ft, -1);
	}), R(nt), R(Qe);
	var pt = K(Qe, 2), mt = (e) => {
		var t = jn();
		$(J(t), {
			name: "plus",
			size: 22
		}), R(t), E("click", t, ue), s(e, t);
	};
	S(pt, (t) => {
		e(W) && t(mt);
	});
	var ht = K(pt, 2), gt = (t) => {
		var r = Mn(), i = B(r), a = K(i, 2);
		n(a, () => e(L), (t) => {
			{
				let n = X(() => e(L).e ?? null), r = X(() => e(L).draft ?? null), i = X(ce);
				qt(t, {
					get cal() {
						return c;
					},
					get e() {
						return e(n);
					},
					get draft() {
						return e(r);
					},
					get at() {
						return e(L).at;
					},
					get box() {
						return e(i);
					},
					onedit: () => fe(),
					onmore: pe,
					onclose: () => M(L, null)
				});
			}
		}), E("click", i, () => M(L, null)), s(t, r);
	};
	S(ht, (t) => {
		e(L) && t(gt);
	});
	var _t = K(ht, 2), yt = (t) => {
		{
			let n = X(() => e(H).e ?? null), r = X(() => e(H).title ?? ""), i = X(() => e(H).calendar ?? "");
			tn(t, {
				get cal() {
					return c;
				},
				get e() {
					return e(n);
				},
				get start() {
					return e(H).start;
				},
				get end() {
					return e(H).end;
				},
				get allDay() {
					return e(H).allDay;
				},
				get title() {
					return e(r);
				},
				get calendar() {
					return e(i);
				},
				onclose: () => M(H, null)
			});
		}
	};
	S(_t, (t) => {
		e(H) && t(yt);
	});
	var bt = K(_t, 2), xt = (e) => {
		vn(e, { onclose: () => M(w, !1) });
	};
	S(bt, (t) => {
		e(w) && t(xt);
	}), sn(K(bt, 2), { get cal() {
		return c;
	} }), R(Ee), b(Ee, (e) => M(p, e), () => e(p)), P((n, r) => {
		De = l(Ee, 1, "calendar svelte-1i74804", null, De, { narrow: e(W) }), t(Fe, "title", n), x(Ie, r), Ve = l(Be, 1, "search svelte-1i74804", null, Ve, { on: !!e(O) }), t(Ue, "placeholder", e(W) ? "" : "Search events");
	}, [() => c.title(), () => c.title()]), E("pointerdown", Ee, (t) => {
		t.target.closest("input, textarea, select, button, [tabindex='0']") || e(p)?.focus({ preventScroll: !0 });
	}), E("click", je, () => c.today()), E("click", Ne, () => c.step(-1)), E("click", Pe, () => c.step(1)), E("input", Ue, Te), E("keydown", Ue, (t) => {
		t.key === "Escape" && (M(O, ""), c.search(""), e(T)?.blur());
	}), h(Ue, () => e(O), (e) => M(O, e)), E("click", qe, ge), a(Ee, "clientWidth", (e) => M(u, e)), s(i, Ee), I();
}
w([
	"pointerdown",
	"click",
	"input",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/view.ts
function In(e, t) {
	e.style.height = "100%";
	let n = c(Fn, {
		target: e,
		props: { atlas: t }
	});
	return () => C(n);
}
//#endregion
export { In as default };
