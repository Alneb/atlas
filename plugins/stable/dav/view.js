import { $ as e, A as t, B as n, C as r, D as i, E as a, G as o, H as s, I as c, J as l, K as u, L as d, M as f, N as p, O as m, P as h, Q as g, R as _, S as v, T as y, U as b, V as x, W as S, X as C, Y as w, Z as T, _ as E, _t as D, a as O, at as k, b as ee, bt as A, c as j, ct as M, d as N, dt as P, et as F, f as I, ft as L, g as te, gt as ne, h as re, ht as R, it as ie, j as ae, k as oe, l as z, lt as B, mt as V, n as se, nt as ce, o as le, ot as H, p as ue, pt as U, q as W, r as de, rt as G, s as K, st as fe, t as pe, tt as q, u as me, ut as J, v as he, vt as ge, w as Y, x as X, xt as _e, y as Z, yt as ve, z as Q } from "./ui-lib/layout.js";
//#region plugins/stable/dav/ui/src/store.svelte.ts
var ye = "notes", be = (e) => {
	try {
		return localStorage.getItem(`atlas-calendar-${e}`);
	} catch {
		return null;
	}
}, xe = (e, t) => {
	try {
		localStorage.setItem(`atlas-calendar-${e}`, t);
	} catch {}
}, Se = class {
	atlas;
	#e = V(L([]));
	get sources() {
		return G(this.#e);
	}
	set sources(e) {
		U(this.#e, e, !0);
	}
	#t = V(L([]));
	get accounts() {
		return G(this.#t);
	}
	set accounts(e) {
		U(this.#t, e, !0);
	}
	#n = V(L([]));
	get events() {
		return G(this.#n);
	}
	set events(e) {
		U(this.#n, e, !0);
	}
	#r = V("week");
	get view() {
		return G(this.#r);
	}
	set view(e) {
		U(this.#r, e, !0);
	}
	#i = V(L(X(/* @__PURE__ */ new Date())));
	get cursor() {
		return G(this.#i);
	}
	set cursor(e) {
		U(this.#i, e, !0);
	}
	#a = V(!0);
	get loading() {
		return G(this.#a);
	}
	set loading(e) {
		U(this.#a, e, !0);
	}
	#o = V(!1);
	get syncing() {
		return G(this.#o);
	}
	set syncing(e) {
		U(this.#o, e, !0);
	}
	#s = V("");
	get error() {
		return G(this.#s);
	}
	set error(e) {
		U(this.#s, e, !0);
	}
	#c = V(!0);
	get configured() {
		return G(this.#c);
	}
	set configured(e) {
		U(this.#c, e, !0);
	}
	#l = V(null);
	get write() {
		return G(this.#l);
	}
	set write(e) {
		U(this.#l, e, !0);
	}
	#u = V(L(be("last")));
	get last() {
		return G(this.#u);
	}
	set last(e) {
		U(this.#u, e, !0);
	}
	#d = V(L([]));
	get hidden() {
		return G(this.#d);
	}
	set hidden(e) {
		U(this.#d, e, !0);
	}
	#f = V(L({}));
	get colors() {
		return G(this.#f);
	}
	set colors(e) {
		U(this.#f, e, !0);
	}
	#p = V(L([]));
	get toasts() {
		return G(this.#p);
	}
	set toasts(e) {
		U(this.#p, e, !0);
	}
	#m = V(null);
	get results() {
		return G(this.#m);
	}
	set results(e) {
		U(this.#m, e, !0);
	}
	#h = V("");
	get query() {
		return G(this.#h);
	}
	set query(e) {
		U(this.#h, e, !0);
	}
	#g = V(L(/* @__PURE__ */ new Date()));
	get now() {
		return G(this.#g);
	}
	set now(e) {
		U(this.#g, e, !0);
	}
	#_ = V(!1);
	get narrow() {
		return G(this.#_);
	}
	set narrow(e) {
		U(this.#_, e, !0);
	}
	seq = 0;
	timer;
	constructor(e) {
		this.atlas = e;
		let t = e.plugin.settings;
		this.view = be("view") ?? String(t.default_view ?? "week"), this.hidden = (t.hidden ?? []).slice();
		for (let e of t.colors ?? []) {
			let t = e.lastIndexOf(":");
			t > 0 && (this.colors[e.slice(0, t).trim()] = e.slice(t + 1).trim());
		}
	}
	get settings() {
		return this.atlas.plugin.settings;
	}
	get first() {
		return y(this.settings.week_start);
	}
	get h12() {
		return me(this.settings.time_format);
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
				let e = v(t, this.first);
				return {
					from: e,
					to: O(e, 6)
				};
			}
			case "workweek": {
				let e = v(t, 1);
				return {
					from: e,
					to: O(e, 4)
				};
			}
			case "month": {
				let e = v(new Date(t.getFullYear(), t.getMonth(), 1), this.first);
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
			let e = await K(this.atlas, "watch", {}, 30);
			this.sources = e.sources, this.accounts = e.accounts ?? [], this.write = e.write, this.configured = e.configured;
		} catch (e) {
			this.error = e.message;
		}
	}
	async load(e = !1) {
		let { from: t, to: n } = this.range(), r = ++this.seq;
		e || (this.loading = !0);
		try {
			let e = this.sources.filter((e) => !this.isHidden(e.id, e.name)).map((e) => e.id), i = await K(this.atlas, "range", {
				from: a(t),
				to: a(n),
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
			let t = await K(this.atlas, "refresh", { force: e }, 300);
			await this.loadSources(), t.changed && await this.load(!0), t.errors.length && this.toast(t.errors[0], "error");
		} catch (e) {
			this.error ||= e.message;
		} finally {
			this.syncing = !1;
		}
	}
	setView(e) {
		this.view = e, xe("view", e), this.results = null, this.load();
	}
	go(e, t) {
		this.cursor = X(e), t ? this.setView(t) : this.load();
	}
	today() {
		this.go(/* @__PURE__ */ new Date());
	}
	step(e) {
		let t = this.cursor, n = {
			day: () => O(t, e),
			week: () => O(t, 7 * e),
			workweek: () => O(t, 7 * e),
			month: () => le(new Date(t.getFullYear(), t.getMonth(), 1), e),
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
		e && (this.last = e, xe("last", e));
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
				await K(this.atlas, "undo", { id: e }), this.toast(`${t} undone`);
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
			let r = await K(this.atlas, "create", {
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
			let i = await K(this.atlas, "update", {
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
	async respond(e, t) {
		let n = {
			ACCEPTED: "Going to",
			TENTATIVE: "Maybe going to",
			DECLINED: "Declined"
		}[t], r = this.events;
		this.events = this.events.map((n) => n.uid === e.uid && n.calendar === e.calendar ? {
			...n,
			answer: t
		} : n);
		try {
			return await K(this.atlas, "respond", {
				calendar: e.calendar,
				href: e.href,
				partstat: t
			}), this.toast(`${n} “${e.summary}” — the organiser is told`), !0;
		} catch (e) {
			return this.events = r, this.toast(`Not answered: ${e.message}`, "error"), !1;
		} finally {
			await this.load(!0);
		}
	}
	async remove(e) {
		let t = await this.askScope(e, "Delete");
		if (t) {
			this.events = this.events.filter((n) => n.uid !== e.uid || t === "this" && n.rid !== e.rid);
			try {
				let n = await K(this.atlas, "delete", {
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
			this.results = (await K(this.atlas, "search", { q: e })).events;
		} catch (e) {
			this.toast(e.message, "error");
		}
	}
	static fields(e) {
		let t = z(e), n = j(e);
		return e.all_day ? {
			start: a(t),
			end: a(O(n, -1))
		} : {
			start: Y(t),
			end: Y(n)
		};
	}
}, Ce = {
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
	video: "M3 7h12v10H3zM15 10.5l6-3.5v10l-6-3.5",
	people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-5-6",
	text: "M4 6h16M4 12h16M4 18h10",
	gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z",
	rss: "M5 19h.01M5 12a7 7 0 0 1 7 7M5 5a14 14 0 0 1 14 14",
	link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
	sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"
}, we = g("<svg class=\"icon svelte-16m1c18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path></path></svg>"), Te = {
	hash: "svelte-16m1c18",
	code: ".icon.svelte-16m1c18 {flex:none;display:block;}"
};
function $(e, t) {
	x(e, Te);
	let n = m(t, "size", 3, 16), r = m(t, "title", 3, "");
	var i = we(), a = J(i);
	k(() => {
		h(i, "width", n()), h(i, "height", n()), h(i, "aria-hidden", r() ? void 0 : "true"), h(i, "role", r() ? "img" : void 0), h(i, "aria-label", r() || void 0), h(a, "d", Ce[t.name] ?? Ce.calendar);
	}), w(e, i);
}
//#endregion
//#region plugins/stable/dav/ui/src/Sidebar.svelte
var Ee = T("<span class=\"h svelte-1jq00cd\"> </span>"), De = T("<button> </button>"), Oe = T("<button class=\"link svelte-1jq00cd\">Set it up…</button>"), ke = T("<h3 class=\"svelte-1jq00cd\">Calendars</h3> <ul class=\"svelte-1jq00cd\"><li class=\"none svelte-1jq00cd\"> <!></li></ul>", 1), Ae = T("<span class=\"err svelte-1jq00cd\">!</span>"), je = g("<svg viewBox=\"0 0 12 12\" width=\"10\" height=\"10\" aria-hidden=\"true\"><path d=\"M2.5 6.5l2.2 2.2L9.5 3.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path></svg>"), Me = T("<span class=\"ro svelte-1jq00cd\" title=\"A subscription: read-only\"><!></span>"), Ne = T("<span class=\"ro svelte-1jq00cd\" title=\"Read-only\">ro</span>"), Pe = T("<button class=\"pc svelte-1jq00cd\" role=\"option\"></button>"), Fe = T("<div class=\"palette svelte-1jq00cd\" role=\"listbox\" aria-label=\"Colours\"></div>"), Ie = T("<li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\"><span><!></span> <span class=\"name svelte-1jq00cd\"> </span> <!> <!></button> <button class=\"tool small svelte-1jq00cd\" title=\"Colour\"><span class=\"swatch svelte-1jq00cd\"></span></button> <!></li>"), Le = T("<li class=\"none svelte-1jq00cd\"> </li>"), Re = T("<h3 class=\"svelte-1jq00cd\"> <!></h3> <ul class=\"svelte-1jq00cd\"></ul>", 1), ze = T("<h3 class=\"svelte-1jq00cd\">In the vault</h3> <ul class=\"svelte-1jq00cd\"><li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\" title=\"Notes marked important: true with due: / event:\"><span><!></span> <span class=\"name svelte-1jq00cd\">Important notes</span></button></li></ul>", 1), Be = T("<div class=\"side svelte-1jq00cd\"><button class=\"create atlas-btn primary svelte-1jq00cd\"><!>Create</button> <div class=\"mini svelte-1jq00cd\" aria-label=\"Pick a day\"><div class=\"mhead svelte-1jq00cd\"><span class=\"mtitle svelte-1jq00cd\"> </span> <button class=\"tool svelte-1jq00cd\" aria-label=\"Previous month\"><!></button> <button class=\"tool svelte-1jq00cd\" aria-label=\"Next month\"><!></button></div> <div class=\"mgrid svelte-1jq00cd\"><!> <!></div></div> <!> <!> <!> <button class=\"link add svelte-1jq00cd\"><!>Add an account or a subscription…</button></div>"), Ve = {
	hash: "svelte-1jq00cd",
	code: ".side.svelte-1jq00cd {height:100%;overflow-y:auto;padding:12px 10px 24px;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;}.create.svelte-1jq00cd {display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin:0 0 10px 4px;padding:7px 16px;}.mini.svelte-1jq00cd {padding:0 2px 10px;}.mhead.svelte-1jq00cd {display:flex;align-items:center;gap:2px;padding:0 0 4px 6px;}.mtitle.svelte-1jq00cd {flex:1;font-weight:600;font-size:0.9em;color:var(--heading);}.mgrid.svelte-1jq00cd {display:grid;grid-template-columns:repeat(7, 1fr);gap:1px;}.h.svelte-1jq00cd {font-size:0.68em;color:var(--text-faint);text-align:center;padding:2px 0;}.d.svelte-1jq00cd {all:unset;cursor:pointer;text-align:center;font-size:0.76em;line-height:24px;border-radius:999px;font-variant-numeric:tabular-nums;color:var(--text-muted);position:relative;}.d.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.d.other.svelte-1jq00cd {color:var(--text-faint);}.d.on.svelte-1jq00cd {background:var(--accent-soft);color:var(--accent-strong);border-radius:0;}.d.busy.svelte-1jq00cd::after {content:\"\";position:absolute;left:50%;bottom:2px;width:3px;height:3px;border-radius:50%;background:currentColor;transform:translateX(-50%);opacity:0.6;}.d.today.svelte-1jq00cd {background:var(--accent);color:var(--accent-fg);font-weight:700;border-radius:999px;}.d.svelte-1jq00cd:focus-visible, .cal.svelte-1jq00cd:focus-visible, .tool.svelte-1jq00cd:focus-visible, .pc.svelte-1jq00cd:focus-visible, .link.svelte-1jq00cd:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}h3.svelte-1jq00cd {margin:10px 6px 2px;font-size:0.72em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;}ul.svelte-1jq00cd {list-style:none;margin:0;padding:0;display:grid;gap:1px;}li.svelte-1jq00cd {position:relative;display:flex;align-items:center;}.cal.svelte-1jq00cd {all:unset;flex:1;min-width:0;cursor:pointer;display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:var(--radius-sm);color:var(--text);font-size:0.9em;}.cal.svelte-1jq00cd:hover {background:var(--bg-hover);}.box.svelte-1jq00cd {width:14px;height:14px;border-radius:4px;background:var(--c);border:2px solid var(--c);box-sizing:border-box;display:grid;place-items:center;color:#fff;flex:none;}.box.off.svelte-1jq00cd {background:transparent;}.name.svelte-1jq00cd {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.err.svelte-1jq00cd {color:var(--red);font-weight:700;}.ro.svelte-1jq00cd {color:var(--text-faint);font-size:0.75em;}.tool.svelte-1jq00cd {all:unset;cursor:pointer;padding:5px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.small.svelte-1jq00cd {opacity:0;}li.svelte-1jq00cd:hover .small:where(.svelte-1jq00cd), .small.svelte-1jq00cd:focus-visible {opacity:1;}.swatch.svelte-1jq00cd {width:10px;height:10px;border-radius:50%;background:var(--c);}.palette.svelte-1jq00cd {position:absolute;right:0;top:100%;z-index:20;display:grid;grid-template-columns:repeat(6, 22px);gap:6px;padding:8px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 24px rgba(0,0,0,.25));}.pc.svelte-1jq00cd {all:unset;cursor:pointer;width:22px;height:22px;border-radius:50%;background:var(--c);}.pc[aria-selected=\"true\"].svelte-1jq00cd {box-shadow:0 0 0 2px var(--bg-elev), 0 0 0 4px var(--c);}.none.svelte-1jq00cd {color:var(--text-faint);font-size:0.85em;padding:4px 6px;gap:6px;flex-wrap:wrap;}.link.svelte-1jq00cd {all:unset;cursor:pointer;color:var(--accent);font-size:0.85em;display:inline-flex;align-items:center;gap:4px;}.add.svelte-1jq00cd {margin:10px 6px 0;}"
};
function He(e, t) {
	ge(t, !0), x(e, Ve);
	let r = V(L(/* @__PURE__ */ new Date()));
	H(() => {
		U(r, new Date(t.cal.cursor.getFullYear(), t.cal.cursor.getMonth(), 1), !0);
	});
	let i = R(() => {
		let e = v(G(r), t.cal.first);
		return Array.from({ length: 42 }, (t, n) => O(e, n));
	}), a = R(() => G(i).slice(0, 7).map((e) => e.toLocaleDateString(void 0, { weekday: "narrow" }))), c = (e) => {
		let n = t.cal.range();
		return e >= n.from && e <= n.to;
	}, l = R(() => new Set(t.cal.events.map((e) => e.start.slice(0, 10)))), u = (e) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`, d = [
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
	], f = V(null), p = R(() => [...t.cal.byAccount().map((e) => ({
		title: e.account.name,
		error: e.account.error ?? void 0,
		items: e.items
	})), {
		title: "Subscriptions",
		error: void 0,
		items: t.cal.sources.filter((e) => e.kind === "ics")
	}]), m = R(() => !t.cal.accounts.length), g = R(() => t.cal.showNotes);
	function _(e) {
		return e.error ? `${e.name} — ${e.error}` : e.writable ? e.name : `${e.name} (read-only)`;
	}
	var y = Be(), S = M(y);
	$(M(S), {
		name: "plus",
		size: 15
	}), ve(), A(S);
	var T = P(S, 2), E = M(T), ee = M(E), j = J(ee, !0), N = P(ee, 2);
	$(M(N), {
		name: "back",
		size: 14
	}), A(N);
	var F = P(N, 2);
	$(M(F), {
		name: "right",
		size: 14
	}), A(F), A(E);
	var I = P(E, 2), te = M(I);
	s(te, 17, () => G(a), b, (e, t) => {
		var n = Ee(), r = J(n, !0);
		k(() => W(r, G(t))), w(e, n);
	});
	var ne = P(te, 2);
	s(ne, 17, () => G(i), (e) => e.getTime(), (e, i) => {
		var a = De();
		let o;
		var s = J(a, !0);
		k((e, t, r, i, c) => {
			o = n(a, 1, "d svelte-1jq00cd", null, o, {
				other: e,
				today: t,
				on: r,
				busy: i
			}), W(s, c);
		}, [
			() => G(i).getMonth() !== G(r).getMonth(),
			() => Z(G(i), t.cal.now),
			() => c(G(i)),
			() => G(l).has(u(G(i))),
			() => G(i).getDate()
		]), q("click", a, () => t.cal.go(G(i))), w(e, a);
	}), A(I), A(T);
	var re = P(T, 2), ie = (e) => {
		var n = ke(), r = P(B(n), 2), i = M(r), a = M(i, !0), s = P(a), c = (e) => {
			var n = Oe();
			q("click", n, () => t.cal.atlas.plugin.openSettings()), w(e, n);
		};
		o(s, (e) => {
			t.cal.configured || e(c);
		}), A(i), A(r), k(() => W(a, t.cal.configured ? t.cal.error ? "Not read: see the message beside." : "Reading the server…" : "No account yet.")), w(e, n);
	};
	o(re, (e) => {
		G(m) && e(ie);
	});
	var ae = P(re, 2);
	s(ae, 17, () => G(p), (e) => e.title, (e, r) => {
		var i = C(), a = B(i), c = (e) => {
			var i = Re(), a = B(i), c = M(a, !0), l = P(c), u = (e) => {
				var t = Ae();
				k(() => h(t, "title", G(r).error)), w(e, t);
			};
			o(l, (e) => {
				G(r).error && e(u);
			}), A(a);
			var p = P(a, 2);
			s(p, 21, () => G(r).items, (e) => e.id, (e, r) => {
				var i = Ie(), a = M(i), c = M(a);
				let l, u;
				var p = M(c), m = (e) => {
					var t = je();
					w(e, t);
				}, g = R(() => !t.cal.isHidden(G(r).id, G(r).name));
				o(p, (e) => {
					G(g) && e(m);
				}), A(c);
				var v = P(c, 2), y = J(v, !0), b = P(v, 2), x = (e) => {
					var t = Ae();
					k(() => h(t, "title", G(r).error)), w(e, t);
				};
				o(b, (e) => {
					G(r).error && e(x);
				});
				var S = P(b, 2), C = (e) => {
					var t = Me();
					$(M(t), {
						name: "rss",
						size: 12
					}), A(t), w(e, t);
				}, T = (e) => {
					var t = Ne();
					w(e, t);
				};
				o(S, (e) => {
					G(r).kind === "ics" ? e(C) : G(r).writable || e(T, 1);
				}), A(a);
				var E = P(a, 2), D = M(E);
				let O;
				A(E);
				var ee = P(E, 2), j = (e) => {
					var n = Fe();
					s(n, 20, () => d, (e) => e, (e, n) => {
						var i = Pe();
						let a;
						k((e) => {
							h(i, "aria-selected", e), h(i, "aria-label", n), a = Q(i, "", a, { "--c": n });
						}, [() => t.cal.colorOf(G(r).id) === n]), q("click", i, () => {
							t.cal.setColor(G(r).id, n), U(f, null);
						}), w(e, i);
					}), A(n), w(e, n);
				};
				o(ee, (e) => {
					G(f) === G(r).id && e(j);
				}), A(i), k((e, t, i, o, s) => {
					h(a, "aria-checked", e), h(a, "title", t), l = n(c, 1, "box svelte-1jq00cd", null, l, { off: i }), u = Q(c, "", u, { "--c": o }), W(y, G(r).name), h(E, "aria-label", `Colour of ${G(r).name ?? ""}`), O = Q(D, "", O, { "--c": s });
				}, [
					() => !t.cal.isHidden(G(r).id, G(r).name),
					() => _(G(r)),
					() => t.cal.isHidden(G(r).id, G(r).name),
					() => t.cal.colorOf(G(r).id),
					() => t.cal.colorOf(G(r).id)
				]), q("click", a, () => t.cal.toggle(G(r).id, G(r).name)), q("click", E, () => U(f, G(f) === G(r).id ? null : G(r).id, !0)), w(e, i);
			}, (e) => {
				var t = Le(), n = J(t, !0);
				k(() => W(n, G(r).error ?? "Reading the server…")), w(e, t);
			}), A(p), k(() => {
				h(a, "title", G(r).error ?? G(r).title), W(c, G(r).title);
			}), w(e, i);
		};
		o(a, (e) => {
			(G(r).items.length || G(r).title !== "Subscriptions") && e(c);
		}), w(e, i);
	});
	var oe = P(ae, 2), z = (e) => {
		var r = ze(), i = P(B(r), 2), a = M(i), s = M(a), c = M(s);
		let l, u;
		var d = M(c), f = (e) => {
			var t = je();
			w(e, t);
		}, p = R(() => !t.cal.isHidden(ye, "Notes"));
		o(d, (e) => {
			G(p) && e(f);
		}), A(c), ve(2), A(s), A(a), A(i), k((e, t, r) => {
			h(s, "aria-checked", e), l = n(c, 1, "box svelte-1jq00cd", null, l, { off: t }), u = Q(c, "", u, { "--c": r });
		}, [
			() => !t.cal.isHidden(ye, "Notes"),
			() => t.cal.isHidden(ye, "Notes"),
			() => t.cal.colorOf(ye)
		]), q("click", s, () => t.cal.toggle(ye, "Notes")), w(e, r);
	};
	o(oe, (e) => {
		G(g) && e(z);
	});
	var se = P(oe, 2);
	$(M(se), {
		name: "plus",
		size: 13
	}), ve(), A(se), A(y), k((e) => W(j, e), [() => G(r).toLocaleDateString(void 0, {
		month: "long",
		year: "numeric"
	})]), q("click", S, function(...e) {
		t.oncreate?.apply(this, e);
	}), q("click", N, () => U(r, le(G(r), -1), !0)), q("click", F, () => U(r, le(G(r), 1), !0)), q("click", se, () => t.cal.atlas.plugin.openSettings()), w(e, y), D();
}
F(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/TimeGrid.svelte
var Ue = T("<button title=\"Open this day\"><span class=\"wd svelte-16enfn0\"> </span> <span class=\"num svelte-16enfn0\"> </span></button>"), We = T("<div class=\"lanecell svelte-16enfn0\" role=\"button\" tabindex=\"-1\" aria-label=\"New all-day event\"></div>"), Ge = T("<span class=\"dot svelte-16enfn0\" aria-hidden=\"true\"></span>"), Ke = T("<button><!> </button>"), qe = T("<div class=\"hl svelte-16enfn0\"> </div>"), Je = T("<span class=\"loc svelte-16enfn0\"> </span>"), Ye = T("<div class=\"grip svelte-16enfn0\" role=\"separator\" aria-label=\"Change the end\"></div>"), Xe = T("<div role=\"button\" tabindex=\"0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span> <!> <!></div>"), Ze = T("<div class=\"ev slot-ghost svelte-16enfn0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span></div>"), Qe = T("<div class=\"now svelte-16enfn0\" aria-hidden=\"true\"></div>"), $e = T("<div role=\"gridcell\" tabindex=\"-1\"><!> <!> <!></div>"), et = T("<div class=\"tg svelte-16enfn0\"><div class=\"head svelte-16enfn0\"><div class=\"gutter tz svelte-16enfn0\" title=\"Times in your zone\"></div> <!></div> <div class=\"lane svelte-16enfn0\"><div class=\"gutter label svelte-16enfn0\">all-day</div> <div class=\"lanecols svelte-16enfn0\"><!> <!></div></div> <div class=\"scroll svelte-16enfn0\"><div class=\"body svelte-16enfn0\"><div class=\"gutter hours svelte-16enfn0\"></div> <div class=\"cols svelte-16enfn0\" role=\"grid\" tabindex=\"-1\" aria-label=\"Hours\"></div></div></div></div>"), tt = {
	hash: "svelte-16enfn0",
	code: ".tg.svelte-16enfn0 {display:grid;grid-template-rows:auto auto 1fr;height:100%;min-height:0;--gutter: 56px;}.head.svelte-16enfn0, .lane.svelte-16enfn0 {display:grid;grid-template-columns:var(--gutter) 1fr;border-bottom:1px solid var(--border);}.head.svelte-16enfn0 {grid-template-columns:var(--gutter) repeat(var(--n), 1fr);}.gutter.svelte-16enfn0 {color:var(--text-faint);font-size:0.75em;}.tz.svelte-16enfn0 {align-self:end;padding:0 6px 6px;font-size:0.68em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.dayhead.svelte-16enfn0 {all:unset;cursor:pointer;display:flex;align-items:baseline;justify-content:center;gap:6px;padding:6px 2px;color:var(--text-muted);border-left:1px solid var(--border);min-width:0;}.dayhead.svelte-16enfn0:hover {background:var(--bg-hover);}.dayhead.svelte-16enfn0:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.wd.svelte-16enfn0 {font-size:0.78em;text-transform:uppercase;letter-spacing:0.04em;}.num.svelte-16enfn0 {font-size:1.25em;font-weight:600;color:var(--heading);font-variant-numeric:tabular-nums;min-width:1.8em;text-align:center;border-radius:999px;}.dayhead.today.svelte-16enfn0 .wd:where(.svelte-16enfn0) {color:var(--accent-strong);}.dayhead.today.svelte-16enfn0 .num:where(.svelte-16enfn0) {background:var(--accent);color:var(--accent-fg);}.label.svelte-16enfn0 {align-self:center;padding:0 6px;text-align:right;}.lanecols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);grid-auto-rows:22px;row-gap:2px;padding:3px 0;min-height:26px;max-height:120px;overflow-y:auto;}.lanecell.svelte-16enfn0 {grid-row:1 / span var(--rows);border-left:1px solid var(--border);cursor:cell;}.bar.svelte-16enfn0 {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;margin:0 3px;padding:0 8px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));color:var(--text);font-size:0.82em;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px;border-left:3px solid var(--c);}.bar.clipl.svelte-16enfn0 {border-top-left-radius:0;border-bottom-left-radius:0;margin-left:0;}.bar.clipr.svelte-16enfn0 {border-top-right-radius:0;border-bottom-right-radius:0;margin-right:0;}.dot.svelte-16enfn0 {width:6px;height:6px;border-radius:50%;background:var(--c);flex:none;}.scroll.svelte-16enfn0 {overflow-y:auto;min-height:0;position:relative;}.body.svelte-16enfn0 {position:relative;display:grid;grid-template-columns:var(--gutter) 1fr;height:calc(24 * var(--hour));}.hours.svelte-16enfn0 {position:relative;}.hl.svelte-16enfn0 {position:absolute;right:8px;transform:translateY(-50%);font-variant-numeric:tabular-nums;white-space:nowrap;}.cols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);position:relative;touch-action:pan-y;}.col.svelte-16enfn0 {position:relative;border-left:1px solid var(--border);cursor:cell;min-width:0;background-image:repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px var(--hour)), repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour) / 2), color-mix(in srgb, var(--border) 45%, transparent) calc(var(--hour) / 2) calc(var(--hour) / 2 + 1px), transparent calc(var(--hour) / 2 + 1px) var(--hour));}.col.weekend.svelte-16enfn0 {background-color:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.ev.svelte-16enfn0 {position:absolute;box-sizing:border-box;container-type:inline-size;cursor:pointer;border-radius:var(--radius-sm);padding:2px 6px;overflow:hidden;display:flex;flex-direction:column;gap:0;font-size:0.8em;line-height:1.25;background:color-mix(in srgb, var(--c) 24%, var(--bg));border-left:3px solid var(--c);color:var(--text);box-shadow:0 0 0 1px var(--bg);touch-action:none;z-index:calc(1 + var(--depth, 0));}\n  /* drawn over a running event: opaque, with a ring of the page and a shadow so the one under it reads as a separate block */.ev.over.svelte-16enfn0 {box-shadow:0 0 0 1px var(--bg), var(--shadow-sm);}\n  /* a bar is an .ev too (selection, colours) but a grid item in a row: absolute dropped its grid-column (every bar on Monday), a column centred its words */.bar.ev.svelte-16enfn0 {position:relative;flex-direction:row;}.ev.svelte-16enfn0:hover {background:color-mix(in srgb, var(--c) 34%, var(--bg));}.ev.svelte-16enfn0:focus-visible, .ev.sel.svelte-16enfn0, .bar.sel.svelte-16enfn0, .bar.svelte-16enfn0:focus-visible {outline:2px solid var(--c);outline-offset:1px;z-index:40;}.ev.short.svelte-16enfn0 {flex-direction:row;gap:6px;align-items:baseline;}.ev.short.svelte-16enfn0 .t:where(.svelte-16enfn0) {flex:0 1 auto;min-width:2.5em;}.ev.short.svelte-16enfn0 .when:where(.svelte-16enfn0) {flex:0 100 auto;min-width:0;}.ev.ro.svelte-16enfn0 {cursor:default;}.ev.free.svelte-16enfn0 {background:color-mix(in srgb, var(--c) 10%, var(--bg));}.ev.cancel.svelte-16enfn0 .t:where(.svelte-16enfn0), .bar.cancel.svelte-16enfn0 {text-decoration:line-through;opacity:0.7;}.ev.ghosted.svelte-16enfn0 {opacity:0.35;}.t.svelte-16enfn0 {font-weight:600;overflow:hidden;text-overflow:ellipsis;min-width:0;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;flex:none;}.ev.short.svelte-16enfn0 .t:where(.svelte-16enfn0) {display:block;white-space:nowrap;}.when.svelte-16enfn0, .loc.svelte-16enfn0 {color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}.grip.svelte-16enfn0 {position:absolute;left:0;right:0;bottom:0;height:7px;cursor:ns-resize;}.slot-ghost.svelte-16enfn0 {z-index:41;pointer-events:none;box-shadow:var(--shadow-md, 0 4px 16px rgba(0,0,0,.25));background:color-mix(in srgb, var(--c) 40%, var(--bg));}.now.svelte-16enfn0 {position:absolute;left:-1px;right:0;height:2px;background:var(--red);z-index:42;pointer-events:none;}.now.svelte-16enfn0::before {content:\"\";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--red);}\n  /* narrow: the title alone (two lines when tall enough) rather than both cut — the rest is in the tooltip */\n  @container (max-width: 72px) {.when.svelte-16enfn0, .loc.svelte-16enfn0 {display:none;}\n  }\n  @media (prefers-reduced-motion: no-preference) {.ev.svelte-16enfn0 {transition:opacity 120ms var(--ease);} }"
};
function nt(e, t) {
	ge(t, !0), x(e, tt);
	let a = V(void 0), c = V(void 0), l = R(() => t.days.map((e) => pe(t.cal.events, e))), u = R(() => se(t.cal.events, t.days)), d = R(() => Math.max(1, ...G(u).map((e) => e.row + 1))), f = Array.from({ length: 24 }, (e, t) => t), p = (e) => e === 0 ? "" : t.cal.h12 ? new Date(2e3, 0, 1, e).toLocaleTimeString(void 0, {
		hour: "numeric",
		hour12: !0
	}) : String(e).padStart(2, "0"), m = R(() => t.cal.now.getHours() * 60 + t.cal.now.getMinutes()), g = (e) => t.selected !== null && t.selected.uid === e.uid && t.selected.rid === e.rid && t.selected.calendar === e.calendar, _ = (e) => e.color ?? t.cal.colorOf(e.calendar), v = (e, t) => `calc(${e * 100}% + ${t}px)`, y = (e) => [
		e.summary || "(no title)",
		`${r(z(e), t.cal.h12)} – ${r(j(e), t.cal.h12)}`,
		e.location,
		e.calendar_name
	].filter(Boolean).join("\n");
	i(() => {
		let e = Number(t.cal.settings.day_start ?? 8), n = t.days.some((e) => Z(e, t.cal.now)) ? Math.max(0, G(m) / 60 - 2) : e;
		G(a) && (G(a).scrollTop = Math.max(0, n * 48 - 8));
	});
	let S = V(null), C = (e) => Math.round(e / 15) * 15;
	function T(e) {
		let n = G(c).getBoundingClientRect();
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
			U(S, {
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
		} else U(S, {
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
		if (!G(S) || !G(S).moved && Math.hypot(e.clientX - G(S).x0, e.clientY - G(S).y0) < 4) return;
		let t = T(e), n = G(S);
		if (n.moved = !0, n.kind === "create") {
			let e = C(t.min);
			[n.from, n.to] = e >= n.grab ? [n.grab, Math.max(n.grab + 15, e)] : [e, n.grab + 15];
		} else if (n.kind === "move") {
			let e = C(t.min - n.grab);
			n.day = t.day, n.from = Math.max(0, Math.min(1425, e)), n.to = n.from + n.len;
		} else n.to = Math.max(n.from + 15, C(t.min));
		U(S, { ...n }, !0);
	}
	async function N(e) {
		let n = G(S);
		if (U(S, null), document.body.style.userSelect = "", !n) return;
		let r = (e, n) => new Date(t.days[e].getFullYear(), t.days[e].getMonth(), t.days[e].getDate(), 0, n);
		if (n.kind === "create") {
			let e = G(c).getBoundingClientRect(), i = e.width / t.days.length;
			t.oncreate(r(n.day, n.from), r(n.day, n.to), !1, new DOMRect(e.left + n.day * i, e.top + n.from / 60 * 48, i, (n.to - n.from) / 60 * 48));
			return;
		}
		let i = (e.target.closest(".ev") ?? e.target).getBoundingClientRect(), a = n.e;
		if (!n.moved) {
			t.onselect(a, i);
			return;
		}
		if (!a.writable) {
			t.cal.toast(`${a.calendar_name || "This calendar"} is read-only`, "error");
			return;
		}
		let o = r(n.day, n.from), s = r(n.day, n.to), l = await t.cal.askScope(a, n.kind === "move" ? "Move" : "Change");
		if (!l) return;
		let u = (e) => String(e).padStart(2, "0"), d = (e) => `${e.getFullYear()}-${u(e.getMonth() + 1)}-${u(e.getDate())}T${u(e.getHours())}:${u(e.getMinutes())}`;
		await t.cal.change(a, {
			start: d(o),
			end: d(s),
			from_start: a.start
		}, l, n.kind === "move" ? "Moved" : "Resized");
	}
	function F(e) {
		G(S) && e.key === "Escape" && (U(S, null), document.body.style.userSelect = "", e.stopPropagation());
	}
	function I(e, n) {
		if (e.target.closest(".bar")) return;
		let r = t.days[n];
		t.oncreate(X(r), O(X(r), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var L = et();
	ce("keydown", fe, F);
	let ne;
	var re = M(L), ie = M(re);
	ie.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ");
	var ae = P(ie, 2);
	s(ae, 17, () => t.days, b, (e, r) => {
		var i = Ue();
		let a;
		var o = M(i), s = J(o, !0), c = P(o, 2), l = J(c, !0);
		A(i), k((e, t, r) => {
			a = n(i, 1, "dayhead svelte-16enfn0", null, a, { today: e }), W(s, t), W(l, r);
		}, [
			() => Z(G(r), t.cal.now),
			() => G(r).toLocaleDateString(void 0, { weekday: "short" }),
			() => G(r).getDate()
		]), q("click", i, () => t.cal.go(G(r), "day")), w(e, i);
	}), A(re);
	var B = P(re, 2);
	let le;
	var H = P(M(B), 2), ue = M(H);
	s(ue, 17, () => t.days, b, (e, t, n) => {
		var r = We();
		Q(r, "", {}, { "grid-column": n + 1 }), q("click", r, (e) => I(e, n)), q("keydown", r, () => {}), w(e, r);
	});
	var de = P(ue, 2);
	s(de, 17, () => G(u), (e) => e.e.calendar + e.e.uid + (e.e.rid ?? "") + e.from, (e, r) => {
		var i = Ke();
		let a, s;
		var c = M(i), l = (e) => {
			var t = Ge();
			w(e, t);
		}, u = R(() => te(G(r).e));
		o(c, (e) => {
			G(u) && e(l);
		});
		var d = P(c, 1, !0);
		A(i), k((e, t) => {
			a = n(i, 1, "bar ev svelte-16enfn0", null, a, {
				sel: e,
				clipl: G(r).clippedStart,
				clipr: G(r).clippedEnd,
				cancel: G(r).e.status === "CANCELLED"
			}), h(i, "title", G(r).e.summary), s = Q(i, "", s, {
				"--c": t,
				"grid-column": `${G(r).from + 1} / ${G(r).to + 2}`,
				"grid-row": G(r).row + 1
			}), W(d, G(r).e.summary || "(no title)");
		}, [() => g(G(r).e), () => _(G(r).e)]), q("click", i, (e) => t.onselect(G(r).e, e.currentTarget.getBoundingClientRect())), w(e, i);
	}), A(H), A(B);
	var K = P(B, 2), me = M(K), he = M(me);
	s(he, 20, () => f, (e) => e, (e, t) => {
		var n = qe();
		let r;
		var i = J(n, !0);
		k((e) => {
			r = Q(n, "", r, { top: `${t * 48}px` }), W(i, e);
		}, [() => p(t)]), w(e, n);
	}), A(he);
	var Y = P(he, 2);
	s(Y, 21, () => t.days, b, (e, i, a) => {
		var c = $e();
		let u;
		var d = M(c);
		s(d, 17, () => G(l)[a], (e) => e.e.calendar + e.e.uid + (e.e.rid ?? ""), (e, i) => {
			let a = R(() => G(i).bottom - G(i).top < 40);
			var s = Xe();
			let c, l;
			var u = M(s), d = J(u, !0), f = P(u, 2), p = J(f), m = P(f, 2), b = (e) => {
				var t = Je(), n = J(t, !0);
				k(() => W(n, G(i).e.location)), w(e, t);
			};
			o(m, (e) => {
				!G(a) && G(i).e.location && e(b);
			});
			var x = P(m, 2), C = (e) => {
				var t = Ye();
				q("pointerdown", t, (e) => E(e, "resize", G(i).e, G(i).top, G(i).bottom)), w(e, t);
			};
			o(x, (e) => {
				G(i).e.writable && !G(i).endsAfter && e(C);
			}), A(s), k((e, t, r, o, u, f, m, g, _) => {
				c = n(s, 1, "ev svelte-16enfn0", null, c, {
					sel: e,
					short: G(a),
					over: G(i).depth > 0,
					ro: !G(i).e.writable,
					cancel: G(i).e.status === "CANCELLED",
					free: G(i).e.free,
					ghosted: G(S)?.e === G(i).e && G(S).moved
				}), h(s, "title", t), h(s, "aria-label", `${G(i).e.summary ?? ""}, ${r ?? ""}`), l = Q(s, "", l, {
					"--c": o,
					top: `${G(i).top / 60 * 48}px`,
					height: u,
					left: f,
					width: m,
					"--depth": G(i).depth
				}), W(d, G(i).e.summary || "(no title)"), W(p, `${g ?? ""}${_ ?? ""}`);
			}, [
				() => g(G(i).e),
				() => y(G(i).e),
				() => r(z(G(i).e), t.cal.h12),
				() => _(G(i).e),
				() => `${Math.max(14, (G(i).bottom - G(i).top) / 60 * 48 - 2)}px`,
				() => v(G(i).box.x, G(i).box.xpx + 1),
				() => v(G(i).box.w, G(i).box.wpx - 3),
				() => r(z(G(i).e), t.cal.h12),
				() => G(a) ? "" : ` – ${r(j(G(i).e), t.cal.h12)}`
			]), q("pointerdown", s, (e) => G(i).startsBefore || G(i).endsAfter ? e.stopPropagation() : E(e, "move", G(i).e, G(i).top, G(i).bottom)), q("click", s, (e) => {
				(G(i).startsBefore || G(i).endsAfter) && t.onselect(G(i).e, e.currentTarget.getBoundingClientRect());
			}), q("keydown", s, (e) => {
				e.key === "Enter" && t.onselect(G(i).e, e.currentTarget.getBoundingClientRect());
			}), w(e, s);
		});
		var f = P(d, 2), p = (e) => {
			var n = Ze();
			let i;
			var a = M(n), o = J(a, !0), s = P(a, 2), c = J(s);
			A(n), k((e, t, r) => {
				i = Q(n, "", i, {
					"--c": e,
					top: `${G(S).from / 60 * 48}px`,
					height: `${(G(S).to - G(S).from) / 60 * 48 - 2}px`,
					left: "1px",
					width: "calc(100% - 3px)"
				}), W(o, G(S).e?.summary ?? "New event"), W(c, `${t ?? ""} – ${r ?? ""}`);
			}, [
				() => G(S).e ? _(G(S).e) : "var(--accent)",
				() => r(new Date(2e3, 0, 1, 0, G(S).from), t.cal.h12),
				() => r(new Date(2e3, 0, 1, 0, G(S).to), t.cal.h12)
			]), w(e, n);
		};
		o(f, (e) => {
			G(S) && G(S).moved && G(S).day === a && e(p);
		});
		var b = P(f, 2), x = (e) => {
			var t = Qe();
			let n;
			k(() => n = Q(t, "", n, { top: `${G(m) / 60 * 48}px` })), w(e, t);
		}, C = R(() => Z(G(i), t.cal.now));
		o(b, (e) => {
			G(C) && e(x);
		}), A(c), k((e, t) => u = n(c, 1, "col svelte-16enfn0", null, u, {
			today: e,
			weekend: t
		}), [() => Z(G(i), t.cal.now), () => G(i).getDay() === 0 || G(i).getDay() === 6]), q("pointerdown", c, (e) => E(e, "create")), w(e, c);
	}), A(Y), oe(Y, (e) => U(c, e), () => G(c)), A(me), A(K), oe(K, (e) => U(a, e), () => G(a)), A(L), k(() => {
		ne = Q(L, "", ne, {
			"--n": t.days.length,
			"--hour": "48px"
		}), le = Q(B, "", le, { "--rows": G(d) });
	}), q("pointermove", Y, ee), q("pointerup", Y, N), ce("pointercancel", Y, () => U(S, null)), w(e, L), D();
}
F([
	"click",
	"keydown",
	"pointermove",
	"pointerup",
	"pointerdown"
]);
//#endregion
//#region plugins/stable/dav/ui/src/MonthView.svelte
var rt = T("<div class=\"wd svelte-13jyj5s\"> </div>"), it = T("<div role=\"button\" tabindex=\"-1\"><button class=\"num svelte-13jyj5s\" title=\"Open this day\"> </button></div>"), at = T("<button> </button>"), ot = T("<button><span class=\"dot svelte-13jyj5s\" aria-hidden=\"true\"></span><span class=\"tm svelte-13jyj5s\"> </span><span class=\"tt svelte-13jyj5s\"> </span></button>"), st = T("<button class=\"more svelte-13jyj5s\"> </button>"), ct = T("<!> <!>", 1), lt = T("<div class=\"week svelte-13jyj5s\"><!> <!> <!></div>"), ut = T("<div class=\"month svelte-13jyj5s\"><div class=\"wds svelte-13jyj5s\"></div> <div class=\"weeks svelte-13jyj5s\"></div></div>"), dt = {
	hash: "svelte-13jyj5s",
	code: ".month.svelte-13jyj5s {display:grid;grid-template-rows:auto 1fr;height:100%;min-height:0;}.wds.svelte-13jyj5s {display:grid;grid-template-columns:repeat(7, 1fr);border-bottom:1px solid var(--border);}.wd.svelte-13jyj5s {padding:6px 8px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-faint);}.weeks.svelte-13jyj5s {display:grid;grid-template-rows:repeat(var(--rows), minmax(96px, 1fr));min-height:0;overflow-y:auto;}.week.svelte-13jyj5s {display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));grid-template-rows:26px repeat(4, 21px) 1fr;row-gap:1px;border-bottom:1px solid var(--border);position:relative;min-height:0;}.cell.svelte-13jyj5s {grid-row:1 / -1;border-left:1px solid var(--border);padding:2px 4px;cursor:cell;min-width:0;}.cell.svelte-13jyj5s:first-child {border-left:0;}.cell.weekend.svelte-13jyj5s {background:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.cell.other.svelte-13jyj5s {background:color-mix(in srgb, var(--bg-alt) 90%, transparent);}.cell.other.svelte-13jyj5s .num:where(.svelte-13jyj5s) {color:var(--text-faint);}.num.svelte-13jyj5s {all:unset;cursor:pointer;font-size:0.82em;font-weight:600;color:var(--text-muted);padding:1px 6px;border-radius:999px;font-variant-numeric:tabular-nums;}.num.svelte-13jyj5s:hover {background:var(--bg-hover);color:var(--text);}.today.svelte-13jyj5s .num:where(.svelte-13jyj5s) {background:var(--accent);color:var(--accent-fg);}.num.svelte-13jyj5s:focus-visible, .bar.svelte-13jyj5s:focus-visible, .line.svelte-13jyj5s:focus-visible, .more.svelte-13jyj5s:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.bar.svelte-13jyj5s, .line.svelte-13jyj5s, .more.svelte-13jyj5s {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;min-width:0;font-size:0.8em;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.bar.svelte-13jyj5s {margin:0 3px;padding:0 7px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));border-left:3px solid var(--c);color:var(--text);}.bar.clipl.svelte-13jyj5s {margin-left:0;border-top-left-radius:0;border-bottom-left-radius:0;}.bar.clipr.svelte-13jyj5s {margin-right:0;border-top-right-radius:0;border-bottom-right-radius:0;}.line.svelte-13jyj5s {display:flex;align-items:center;gap:5px;margin:0 3px;padding:0 4px;border-radius:var(--radius-sm);color:var(--text);}.line.svelte-13jyj5s:hover, .bar.svelte-13jyj5s:hover {background:color-mix(in srgb, var(--c) 18%, var(--bg-hover));}.sel.svelte-13jyj5s {outline:2px solid var(--c);outline-offset:-1px;}.cancel.svelte-13jyj5s .tt:where(.svelte-13jyj5s) {text-decoration:line-through;opacity:0.7;}.dot.svelte-13jyj5s {width:7px;height:7px;border-radius:50%;background:var(--c);flex:none;}.tm.svelte-13jyj5s {color:var(--text-muted);font-variant-numeric:tabular-nums;flex:none;}.tt.svelte-13jyj5s {overflow:hidden;text-overflow:ellipsis;min-width:0;}.more.svelte-13jyj5s {margin:0 3px;padding:0 6px;color:var(--text-muted);font-weight:600;border-radius:var(--radius-sm);}.more.svelte-13jyj5s:hover {background:var(--bg-hover);color:var(--text);}\n  @container (max-width: 760px) {.tm.svelte-13jyj5s {display:none;} }"
};
function ft(e, t) {
	ge(t, !0), x(e, dt);
	let i = R(() => Array.from({ length: Math.ceil(t.days.length / 7) }, (e, n) => t.days.slice(n * 7, n * 7 + 7))), a = R(() => t.cal.cursor.getMonth()), c = (e) => e.color ?? t.cal.colorOf(e.calendar), l = (e) => t.selected !== null && t.selected.uid === e.uid && t.selected.rid === e.rid && t.selected.calendar === e.calendar, u = (e) => e.calendar + e.uid + (e.rid ?? "");
	function d(e) {
		let n = se(t.cal.events, e), r = Math.min(4, Math.max(0, ...n.map((e) => e.row + 1))), i = n.filter((e) => e.row < 4 - !!n.some((e) => e.row >= 4));
		return {
			bars: i,
			used: r,
			cells: e.map((e, a) => {
				let o = de(t.cal.events, e).filter((e) => !I(e)).sort((e, t) => z(e).getTime() - z(t).getTime()), s = n.filter((e) => e.from <= a && e.to >= a), c = s.filter((e) => !i.includes(e)).length, l = Math.max(0, 4 - r - 1), u = o.length + c <= l + 1 ? o.slice(0, l + 1) : o.slice(0, l);
				return {
					timed: u,
					more: o.length - u.length + c,
					total: o.length + s.length
				};
			})
		};
	}
	function f(e, n) {
		e.target.closest("button") || t.oncreate(X(n), O(X(n), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var p = ut();
	let m;
	var g = M(p);
	s(g, 21, () => G(i)[0] ?? [], (e) => e.getDay(), (e, t) => {
		var n = rt(), r = J(n, !0);
		k((e) => W(r, e), [() => G(t).toLocaleDateString(void 0, { weekday: "short" })]), w(e, n);
	}), A(g);
	var _ = P(g, 2);
	s(_, 21, () => G(i), b, (e, i) => {
		let p = R(() => d(G(i)));
		var m = lt(), g = M(m);
		s(g, 17, () => G(i), b, (e, r, i) => {
			var o = it();
			let s;
			Q(o, "", {}, { "grid-column": i + 1 });
			var c = M(o), l = J(c, !0);
			A(o), k((e, t, r, i, a) => {
				s = n(o, 1, "cell svelte-13jyj5s", null, s, {
					other: e,
					today: t,
					weekend: r
				}), h(o, "aria-label", `New event on ${i ?? ""}`), W(l, a);
			}, [
				() => G(r).getMonth() !== G(a),
				() => Z(G(r), t.cal.now),
				() => G(r).getDay() === 0 || G(r).getDay() === 6,
				() => G(r).toLocaleDateString(),
				() => G(r).getDate() === 1 ? G(r).toLocaleDateString(void 0, {
					day: "numeric",
					month: "short"
				}) : G(r).getDate()
			]), q("click", o, (e) => f(e, G(r))), q("keydown", o, () => {}), q("click", c, () => t.cal.go(G(r), "day")), w(e, o);
		});
		var _ = P(g, 2);
		s(_, 17, () => G(p).bars, (e) => u(e.e) + e.from, (e, r) => {
			var i = at();
			let a, o;
			var s = J(i, !0);
			k((e, t) => {
				a = n(i, 1, "bar svelte-13jyj5s", null, a, {
					sel: e,
					clipl: G(r).clippedStart,
					clipr: G(r).clippedEnd
				}), h(i, "title", G(r).e.summary), o = Q(i, "", o, {
					"--c": t,
					"grid-column": `${G(r).from + 1} / ${G(r).to + 2}`,
					"grid-row": G(r).row + 2
				}), W(s, G(r).e.summary || "(no title)");
			}, [() => l(G(r).e), () => c(G(r).e)]), q("click", i, (e) => t.onselect(G(r).e, e.currentTarget.getBoundingClientRect())), w(e, i);
		});
		var v = P(_, 2);
		s(v, 17, () => G(p).cells, b, (e, a, d) => {
			var f = ct(), m = B(f);
			s(m, 19, () => G(a).timed, (e) => u(e), (e, i, a) => {
				var o = ot();
				let s, u;
				var f = P(M(o)), m = J(f, !0), g = P(f), _ = J(g, !0);
				A(o), k((e, t, r, c) => {
					s = n(o, 1, "line svelte-13jyj5s", null, s, {
						sel: e,
						cancel: G(i).status === "CANCELLED"
					}), h(o, "title", `${t ?? ""} ${G(i).summary ?? ""}`), u = Q(o, "", u, {
						"--c": r,
						"grid-column": d + 1,
						"grid-row": G(p).used + 2 + G(a)
					}), W(m, c), W(_, G(i).summary || "(no title)");
				}, [
					() => l(G(i)),
					() => r(z(G(i)), t.cal.h12),
					() => c(G(i)),
					() => r(z(G(i)), t.cal.h12)
				]), q("click", o, (e) => t.onselect(G(i), e.currentTarget.getBoundingClientRect())), w(e, o);
			});
			var g = P(m, 2), _ = (e) => {
				var n = st();
				let r;
				var o = J(n);
				k(() => {
					r = Q(n, "", r, {
						"grid-column": d + 1,
						"grid-row": G(p).used + 2 + G(a).timed.length
					}), W(o, `+${G(a).more ?? ""} more`);
				}), q("click", n, () => t.cal.go(G(i)[d], "day")), w(e, n);
			};
			o(g, (e) => {
				G(a).more > 0 && e(_);
			}), w(e, f);
		}), A(m), w(e, m);
	}), A(_), A(p), k(() => m = Q(p, "", m, { "--rows": G(i).length })), w(e, p), D();
}
F(["click", "keydown"]);
//#endregion
//#region plugins/stable/dav/ui/src/AgendaView.svelte
var pt = T("<div class=\"empty svelte-zo3qq8\"> </div>"), mt = T("<span class=\"loc svelte-zo3qq8\"> </span>"), ht = T("<span class=\"ic svelte-zo3qq8\" title=\"Repeats\"><!></span>"), gt = T("<span class=\"ic svelte-zo3qq8\" title=\"From a note\"><!></span>"), _t = T("<li><button><span class=\"dot svelte-zo3qq8\" aria-hidden=\"true\"></span> <span class=\"time svelte-zo3qq8\"> </span> <span class=\"what svelte-zo3qq8\"> <!></span> <!> <!> <span class=\"cal svelte-zo3qq8\"> </span></button></li>"), vt = T("<section><button class=\"date svelte-zo3qq8\" title=\"Open this day\"><span class=\"n svelte-zo3qq8\"> </span> <span class=\"w svelte-zo3qq8\"> <br/> </span></button> <ul class=\"svelte-zo3qq8\"></ul></section>"), yt = T("<div class=\"agenda svelte-zo3qq8\"><!> <!></div>"), bt = {
	hash: "svelte-zo3qq8",
	code: ".agenda.svelte-zo3qq8 {height:100%;overflow-y:auto;padding:6px 0 40px;}.empty.svelte-zo3qq8 {padding:40px;text-align:center;color:var(--text-faint);}.day.svelte-zo3qq8 {display:grid;grid-template-columns:92px 1fr;gap:8px;padding:6px 14px;border-bottom:1px solid var(--border);}.date.svelte-zo3qq8 {all:unset;cursor:pointer;display:flex;gap:8px;align-items:flex-start;padding:4px 0;color:var(--text-muted);}.n.svelte-zo3qq8 {font-size:1.5em;font-weight:650;color:var(--heading);min-width:1.6em;text-align:right;font-variant-numeric:tabular-nums;line-height:1.1;}.w.svelte-zo3qq8 {font-size:0.75em;text-transform:uppercase;letter-spacing:0.04em;line-height:1.35;}.today.svelte-zo3qq8 .n:where(.svelte-zo3qq8) {color:var(--accent-strong);}.date.svelte-zo3qq8:focus-visible, .row.svelte-zo3qq8:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}ul.svelte-zo3qq8 {list-style:none;margin:0;padding:0;display:grid;gap:1px;min-width:0;}.row.svelte-zo3qq8 {all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border-radius:var(--radius-sm);min-width:0;}.row.svelte-zo3qq8:hover {background:var(--bg-hover);}.row.sel.svelte-zo3qq8 {background:color-mix(in srgb, var(--c) 16%, var(--bg));}.dot.svelte-zo3qq8 {width:9px;height:9px;border-radius:50%;background:var(--c);flex:none;}.time.svelte-zo3qq8 {flex:none;width:11.5em;white-space:nowrap;color:var(--text-muted);font-variant-numeric:tabular-nums;font-size:0.9em;}.what.svelte-zo3qq8 {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.loc.svelte-zo3qq8 {color:var(--text-muted);}.cancel.svelte-zo3qq8 .what:where(.svelte-zo3qq8) {text-decoration:line-through;opacity:0.7;}.ic.svelte-zo3qq8 {color:var(--text-faint);flex:none;}.cal.svelte-zo3qq8 {flex:none;color:var(--text-faint);font-size:0.8em;max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n  @container (max-width: 560px) {.day.svelte-zo3qq8 {grid-template-columns:1fr;gap:0;padding:6px 10px;}.date.svelte-zo3qq8 {padding-bottom:0;}.time.svelte-zo3qq8 {width:auto;min-width:5.5em;}.cal.svelte-zo3qq8 {display:none;}\n  }"
};
function xt(e, t) {
	ge(t, !0), x(e, bt);
	let i = m(t, "search", 3, !1), a = R(() => {
		if (i()) {
			let e = /* @__PURE__ */ new Map();
			for (let n of t.events) {
				let t = X(z(n)).getTime();
				e.set(t, [...e.get(t) ?? [], n]);
			}
			return [...e.entries()].map(([e, t]) => ({
				day: new Date(e),
				evs: t
			}));
		}
		let e = [];
		for (let n = t.from; n <= t.to; n = O(n, 1)) {
			let r = de(t.events, n).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || z(e).getTime() - z(t).getTime());
			r.length && e.push({
				day: n,
				evs: r
			});
		}
		return e;
	}), c = (e) => e.color ?? t.cal.colorOf(e.calendar), l = (e) => t.selected !== null && t.selected.uid === e.uid && t.selected.rid === e.rid && t.selected.calendar === e.calendar;
	function u(e, n) {
		if (e.all_day) return "All day";
		let i = z(e), a = j(e);
		return `${Z(i, n) ? r(i, t.cal.h12) : "…"} – ${Z(a, n) || a.getTime() - X(n).getTime() <= 864e5 && a.getHours() === 0 && a.getMinutes() === 0 ? r(a, t.cal.h12) : "…"}`;
	}
	var d = yt(), f = M(d), p = (e) => {
		var t = pt(), n = J(t, !0);
		k(() => W(n, i() ? "No event matches." : "Nothing in the coming days.")), w(e, t);
	};
	o(f, (e) => {
		G(a).length || e(p);
	});
	var h = P(f, 2);
	s(h, 17, () => G(a), (e) => e.day.getTime(), (e, r) => {
		var i = vt();
		let a;
		var d = M(i), f = M(d), p = J(f, !0), m = P(f, 2), h = M(m, !0), g = P(h, 2, !0);
		A(m), A(d);
		var _ = P(d, 2);
		s(_, 21, () => G(r).evs, (e) => e.calendar + e.uid + (e.rid ?? ""), (e, i) => {
			var a = _t(), s = M(a);
			let d, f;
			var p = P(M(s), 2), m = J(p, !0), h = P(p, 2), g = M(h, !0), _ = P(g), v = (e) => {
				var t = mt(), n = J(t);
				k(() => W(n, ` · ${G(i).location ?? ""}`)), w(e, t);
			};
			o(_, (e) => {
				G(i).location && e(v);
			}), A(h);
			var y = P(h, 2), b = (e) => {
				var t = ht();
				$(M(t), {
					name: "repeat",
					size: 13
				}), A(t), w(e, t);
			};
			o(y, (e) => {
				G(i).recurring && e(b);
			});
			var x = P(y, 2), S = (e) => {
				var t = gt();
				$(M(t), {
					name: "note",
					size: 13
				}), A(t), w(e, t);
			}, C = R(() => te(G(i)));
			o(x, (e) => {
				G(C) && e(S);
			});
			var T = P(x, 2), E = J(T, !0);
			A(s), A(a), k((e, t, r) => {
				d = n(s, 1, "row svelte-zo3qq8", null, d, {
					sel: e,
					cancel: G(i).status === "CANCELLED"
				}), f = Q(s, "", f, { "--c": t }), W(m, r), W(g, G(i).summary || "(no title)"), W(E, G(i).calendar_name);
			}, [
				() => l(G(i)),
				() => c(G(i)),
				() => u(G(i), G(r).day)
			]), q("click", s, (e) => t.onselect(G(i), e.currentTarget.getBoundingClientRect())), w(e, a);
		}), A(_), A(i), k((e, t, r, o) => {
			a = n(i, 1, "day svelte-zo3qq8", null, a, { today: e }), W(p, t), W(h, r), W(g, o);
		}, [
			() => Z(G(r).day, t.cal.now),
			() => G(r).day.getDate(),
			() => G(r).day.toLocaleDateString(void 0, { weekday: "short" }),
			() => G(r).day.toLocaleDateString(void 0, {
				month: "short",
				year: G(r).day.getFullYear() === t.cal.now.getFullYear() ? void 0 : "numeric"
			})
		]), q("click", d, () => t.cal.go(G(r).day, "day")), w(e, i);
	}), A(d), w(e, d), D();
}
F(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/YearView.svelte
var St = T("<span class=\"h svelte-18a11kl\"> </span>"), Ct = T("<button> </button>"), wt = T("<span></span>"), Tt = T("<section><button class=\"mname svelte-18a11kl\"> </button> <div class=\"days svelte-18a11kl\"><!> <!></div></section>"), Et = T("<div class=\"year svelte-18a11kl\"></div>"), Dt = {
	hash: "svelte-18a11kl",
	code: ".year.svelte-18a11kl {height:100%;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(210px, 1fr));gap:18px 24px;padding:16px 20px 40px;align-content:start;}.mname.svelte-18a11kl {all:unset;cursor:pointer;font-weight:650;color:var(--heading);margin-bottom:6px;display:block;}.mname.svelte-18a11kl:hover {color:var(--accent-strong);}.days.svelte-18a11kl {display:grid;grid-template-columns:repeat(7, 1fr);gap:2px;}.h.svelte-18a11kl {font-size:0.7em;color:var(--text-faint);text-align:center;}.d.svelte-18a11kl {all:unset;cursor:pointer;text-align:center;font-size:0.78em;padding:3px 0;border-radius:var(--radius-sm);font-variant-numeric:tabular-nums;color:var(--text-muted);background:color-mix(in srgb, var(--accent) calc(var(--k) * 55%), transparent);}.d.svelte-18a11kl:hover {outline:1px solid var(--accent);}.d.svelte-18a11kl:focus-visible {outline:2px solid var(--accent);}.d.today.svelte-18a11kl {background:var(--accent);color:var(--accent-fg);font-weight:700;}"
};
function Ot(e, t) {
	ge(t, !0), x(e, Dt);
	let r = R(() => t.cal.cursor.getFullYear()), i = R(() => {
		let e = /* @__PURE__ */ new Map();
		for (let n = new Date(G(r), 0, 1); n.getFullYear() === G(r); n = O(n, 1)) e.set(n.toDateString(), de(t.cal.events, n).length);
		return e;
	}), a = R(() => Math.max(1, ...G(i).values()));
	function c(e) {
		let n = v(new Date(G(r), e, 1), t.cal.first);
		return Array.from({ length: 42 }, (e, t) => O(n, t));
	}
	let l = R(() => Array.from({ length: 7 }, (e, n) => O(v(/* @__PURE__ */ new Date(), t.cal.first), n).toLocaleDateString(void 0, { weekday: "narrow" })));
	var u = Et();
	s(u, 20, () => Array.from({ length: 12 }, (e, t) => t), (e) => e, (e, u) => {
		var d = Tt(), f = M(d), p = J(f, !0), m = P(f, 2), g = M(m);
		s(g, 17, () => G(l), b, (e, t) => {
			var n = St(), r = J(n, !0);
			k(() => W(r, G(t))), w(e, n);
		});
		var _ = P(g, 2);
		s(_, 17, () => c(u), (e) => e.getTime(), (e, r) => {
			let s = R(() => G(r).getMonth() === u ? G(i).get(G(r).toDateString()) ?? 0 : 0);
			var c = C(), l = B(c), d = (e) => {
				var i = Ct();
				let o, c;
				var l = J(i, !0);
				k((e, t, r) => {
					o = n(i, 1, "d svelte-18a11kl", null, o, { today: e }), h(i, "title", `${t ?? ""}: ${G(s) ?? ""} event${G(s) === 1 ? "" : "s"}`), c = Q(i, "", c, { "--k": G(s) / G(a) }), W(l, r);
				}, [
					() => Z(G(r), t.cal.now),
					() => G(r).toLocaleDateString(),
					() => G(r).getDate()
				]), q("click", i, () => t.cal.go(G(r), "day")), w(e, i);
			}, f = R(() => G(r).getMonth() === u), p = (e) => {
				var t = wt();
				w(e, t);
			};
			o(l, (e) => {
				G(f) ? e(d) : e(p, -1);
			}), w(e, c);
		}), A(m), A(d), k((e) => W(p, e), [() => new Date(G(r), u, 1).toLocaleDateString(void 0, { month: "long" })]), q("click", f, () => t.cal.go(new Date(G(r), u, 1), "month")), w(e, d);
	}), A(u), w(e, u), D();
}
F(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/CalendarPicker.svelte
var kt = T("<option> </option>"), At = T("<optgroup></optgroup>"), jt = T("<span><span class=\"dot svelte-zssqw9\" aria-hidden=\"true\"></span> <select aria-label=\"Calendar\" class=\"svelte-zssqw9\"><!><!></select></span>"), Mt = {
	hash: "svelte-zssqw9",
	code: ".pick.svelte-zssqw9 {display:inline-flex;align-items:center;gap:8px;min-width:0;flex:1;}.pick.compact.svelte-zssqw9 {flex:0 1 auto;}.dot.svelte-zssqw9 {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}select.svelte-zssqw9 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 28px 5px 8px;min-width:0;flex:1;color-scheme:light dark;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.compact.svelte-zssqw9 select:where(.svelte-zssqw9) {flex:0 1 auto;max-width:16em;}select.svelte-zssqw9:disabled {opacity:0.6;}select.svelte-zssqw9:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}"
};
function Nt(e, t) {
	ge(t, !0), x(e, Mt);
	let r = m(t, "value", 15), i = m(t, "disabled", 3, !1), a = m(t, "compact", 3, !1), l = R(() => t.cal.byAccount(!0)), u = R(() => G(l).length > 1), f = (e) => t.cal.sources.find((t) => t.id === e)?.name ?? e;
	var p = jt();
	let g;
	var _ = M(p);
	let v;
	var y = P(_, 2), b = M(y), S = (e) => {
		var t = kt(), n = J(t, !0), i = {};
		k((e) => {
			W(n, e), i !== (i = r()) && (t.value = (t.__value = i) ?? "");
		}, [() => f(r())]), w(e, t);
	}, T = R(() => r() && !G(l).some((e) => e.items.some((e) => e.id === r())));
	o(b, (e) => {
		G(T) && e(S);
	});
	var E = P(b);
	s(E, 17, () => G(l), (e) => e.account.name, (e, t) => {
		var n = C(), r = B(n), i = (e) => {
			var n = At();
			s(n, 21, () => G(t).items, (e) => e.id, (e, t) => {
				var n = kt(), r = J(n, !0), i = {};
				k(() => {
					W(r, G(t).name), i !== (i = G(t).id) && (n.value = (n.__value = i) ?? "");
				}), w(e, n);
			}), A(n), k(() => h(n, "label", G(t).account.name)), w(e, n);
		}, a = (e) => {
			var n = C(), r = B(n);
			s(r, 17, () => G(t).items, (e) => e.id, (e, t) => {
				var n = kt(), r = J(n, !0), i = {};
				k(() => {
					W(r, G(t).name), i !== (i = G(t).id) && (n.value = (n.__value = i) ?? "");
				}), w(e, n);
			}), w(e, n);
		};
		o(r, (e) => {
			G(u) ? e(i) : e(a, -1);
		}), w(e, n);
	}), A(y), d(y), A(p), k((e) => {
		g = n(p, 1, "pick svelte-zssqw9", null, g, { compact: a() }), v = Q(_, "", v, { "--c": e }), y.disabled = i(), h(y, "title", r());
	}, [() => r() ? t.cal.colorOf(r()) : "transparent"]), c(y, r), w(e, p), D();
}
//#endregion
//#region plugins/stable/dav/ui/src/Popover.svelte
var Pt = T("<button class=\"tool svelte-id2g6u\" title=\"Edit (e)\"><!></button> <button class=\"tool svelte-id2g6u\" title=\"Delete (Del)\"><!></button>", 1), Ft = T("<p class=\"sub svelte-id2g6u\"><!> </p>"), It = T("<p class=\"sub warn svelte-id2g6u\">Cancelled</p>"), Lt = T("<button> </button>"), Rt = T("<div class=\"answer svelte-id2g6u\" role=\"group\" aria-label=\"Going?\"><span class=\"svelte-id2g6u\">Going?</span> <!></div>"), zt = T("<a class=\"atlas-btn join svelte-id2g6u\" target=\"_blank\" rel=\"noreferrer\" data-outside=\"\" title=\"Opens in your browser (Teams, Zoom… take it from there)\"><!>Join the meeting</a>"), Bt = T("<a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a>"), Vt = T("<p class=\"line svelte-id2g6u\"><!><!></p>"), Ht = T("<li> <span class=\"faint svelte-id2g6u\">organiser</span></li>"), Ut = T("<li> <span> </span></li>"), Wt = T("<li class=\"faint svelte-id2g6u\"> </li>"), Gt = T("<div class=\"line people svelte-id2g6u\"><!> <ul class=\"svelte-id2g6u\"><!> <!> <!></ul></div>"), Kt = T("<p class=\"line desc svelte-id2g6u\"><!><span class=\"svelte-id2g6u\"> </span></p>"), qt = T("<button class=\"atlas-btn svelte-id2g6u\"><!>Open the note</button>"), Jt = T("<p class=\"line svelte-id2g6u\"><!><a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a></p>"), Yt = T("<div class=\"bar svelte-id2g6u\"><!> <button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <div class=\"head svelte-id2g6u\"><span class=\"sq svelte-id2g6u\"></span> <div><h2> </h2> <p class=\"when svelte-id2g6u\"> </p> <!> <!></div></div> <!> <!> <!> <!> <!> <p class=\"line faint svelte-id2g6u\"><!> </p> <!> <!>", 1), Xt = T("<div class=\"bar svelte-id2g6u\"><button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <input class=\"title svelte-id2g6u\" placeholder=\"Add a title\" aria-label=\"Title\"/> <p class=\"when svelte-id2g6u\"> </p> <div class=\"line faint svelte-id2g6u\"><!><!></div> <div class=\"acts svelte-id2g6u\"><button class=\"atlas-btn svelte-id2g6u\">More options</button> <button class=\"atlas-btn primary svelte-id2g6u\">Save</button></div>", 1), Zt = T("<div class=\"pop svelte-id2g6u\" role=\"dialog\"><!></div>"), Qt = {
	hash: "svelte-id2g6u",
	code: ".pop.svelte-id2g6u {position:absolute;z-index:50;width:min(360px, calc(100% - 16px));box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:8px 14px 14px;display:grid;gap:8px; animation: svelte-id2g6u-in 120ms var(--ease);}\n  @keyframes svelte-id2g6u-in { from { opacity: 0; transform: translateY(4px); } }\n  @media (prefers-reduced-motion: reduce) {.pop.svelte-id2g6u { animation: none;} }.bar.svelte-id2g6u {display:flex;justify-content:flex-end;gap:2px;margin:0 -8px -4px 0;}.tool.svelte-id2g6u {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-id2g6u:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-id2g6u:focus-visible {outline:2px solid var(--accent);}.head.svelte-id2g6u {display:flex;gap:12px;align-items:flex-start;}.sq.svelte-id2g6u {width:14px;height:14px;border-radius:4px;background:var(--c);flex:none;margin-top:5px;}h2.svelte-id2g6u {margin:0;font-size:1.15em;font-weight:600;color:var(--heading);overflow-wrap:anywhere;}.cancel.svelte-id2g6u {text-decoration:line-through;}.when.svelte-id2g6u {margin:2px 0 0;color:var(--text-muted);font-size:0.92em;}.sub.svelte-id2g6u {margin:2px 0 0;color:var(--text-faint);font-size:0.85em;display:flex;align-items:center;gap:4px;}.warn.svelte-id2g6u {color:var(--red);}.line.svelte-id2g6u {margin:0;display:flex;gap:10px;align-items:flex-start;color:var(--text);font-size:0.9em;min-width:0;overflow-wrap:anywhere;}.line.svelte-id2g6u .icon {margin-top:2px;color:var(--text-faint);}.desc.svelte-id2g6u span:where(.svelte-id2g6u) {white-space:pre-wrap;max-height:9em;overflow:auto;}.people.svelte-id2g6u ul:where(.svelte-id2g6u) {list-style:none;margin:0;padding:0;display:grid;gap:2px;}.faint.svelte-id2g6u {color:var(--text-faint);}.ps.svelte-id2g6u {font-size:0.8em;color:var(--text-faint);}.ps-accepted.svelte-id2g6u {color:var(--green);}.ps-declined.svelte-id2g6u {color:var(--red);}.ps-tentative.svelte-id2g6u {color:var(--yellow);}a.svelte-id2g6u {color:var(--accent);}.atlas-btn.svelte-id2g6u {display:inline-flex;align-items:center;gap:6px;justify-self:start;}.title.svelte-id2g6u {all:unset;font-size:1.15em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--accent);padding:4px 0;}.title.svelte-id2g6u::placeholder {color:var(--text-faint);font-weight:400;}.join.svelte-id2g6u {text-decoration:none;}.answer.svelte-id2g6u {display:flex;align-items:center;gap:6px;padding:6px 0;font-size:0.9em;}.answer.svelte-id2g6u span:where(.svelte-id2g6u) {color:var(--text-muted);margin-right:auto;}.answer.svelte-id2g6u .chosen:where(.svelte-id2g6u) {background:var(--accent-soft);border-color:var(--accent);color:var(--accent-strong, var(--accent));}.acts.svelte-id2g6u {display:flex;justify-content:flex-end;gap:8px;}"
};
function $t(t, a) {
	ge(a, !0), x(t, Qt);
	let c = m(a, "e", 3, null), l = m(a, "draft", 3, null), u = V(void 0), d = V(""), g = V(L(a.cal.newCalendar() ?? "")), _ = V(void 0), v = V(L({
		left: 0,
		top: 0
	}));
	function y() {
		let e = G(u)?.offsetWidth ?? 340, t = G(u)?.offsetHeight ?? 200, n = a.at.right - a.box.left + 8;
		n + e > a.box.width - 8 && (n = a.at.left - a.box.left - e - 8), n < 8 && (n = Math.max(8, Math.min(a.box.width - e - 8, a.at.left - a.box.left)));
		let r = a.at.top - a.box.top;
		r + t > a.box.height - 8 && (r = Math.max(8, a.box.height - t - 8)), U(v, {
			left: n,
			top: Math.max(8, r)
		}, !0);
	}
	i(() => {
		y(), G(_)?.focus();
	});
	async function b() {
		if (!l()) return;
		let e = (e) => String(e).padStart(2, "0"), t = (t) => `${t.getFullYear()}-${e(t.getMonth() + 1)}-${e(t.getDate())}T${e(t.getHours())}:${e(t.getMinutes())}`, n = (e) => t(e).slice(0, 10);
		a.onclose(), await a.cal.create({
			summary: G(d).trim() || "(no title)",
			start: l().all_day ? n(l().start) : t(l().start),
			end: l().all_day ? n(l().end) : t(l().end),
			all_day: l().all_day,
			calendar: G(g) || void 0
		});
	}
	let S = R(() => c() ? te(c()) : null), C = R(() => c() ? ue(c()) : null), T = [
		["ACCEPTED", "Yes"],
		["TENTATIVE", "Maybe"],
		["DECLINED", "No"]
	], E = V(L(c()?.answer));
	async function O(e) {
		if (!c() || G(E) === e) return;
		let t = G(E);
		U(E, e, !0), await a.cal.respond(c(), e) || U(E, t, !0);
	}
	let j = R(() => l() ? l().all_day ? `${l().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · all day` : `${l().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · ${r(l().start, a.cal.h12)} – ${r(l().end, a.cal.h12)}` : "");
	var N = Zt();
	let F;
	var I = M(N), ne = (t) => {
		var r = Yt(), i = B(r), l = M(i), u = (e) => {
			var t = Pt(), n = B(t);
			$(M(n), {
				name: "pen",
				size: 15
			}), A(n);
			var r = P(n, 2);
			$(M(r), {
				name: "trash",
				size: 15
			}), A(r), q("click", n, function(...e) {
				a.onedit?.apply(this, e);
			}), q("click", r, () => {
				a.onclose(), a.cal.remove(c());
			}), w(e, t);
		};
		o(l, (e) => {
			c().writable && e(u);
		});
		var d = P(l, 2);
		$(M(d), {
			name: "x",
			size: 15
		}), A(d), A(i);
		var f = P(i, 2), p = M(f);
		let m;
		var g = P(p, 2), _ = M(g);
		let v;
		var y = J(_, !0), b = P(_, 2), x = J(b, !0), D = P(b, 2), j = (e) => {
			var t = Ft(), n = M(t);
			$(n, {
				name: "repeat",
				size: 12
			});
			var r = P(n);
			A(t), k((e) => W(r, ` ${e ?? ""}`), [() => he(c().rrule) || "Repeats"]), w(e, t);
		};
		o(D, (e) => {
			c().recurring && e(j);
		});
		var N = P(D, 2), F = (e) => {
			var t = It();
			w(e, t);
		};
		o(N, (e) => {
			c().status === "CANCELLED" && e(F);
		}), A(g), A(f);
		var I = P(f, 2), L = (e) => {
			var t = Rt(), r = P(M(t), 2);
			s(r, 17, () => T, ([e, t]) => e, (e, t) => {
				var r = R(() => _e(G(t), 2));
				let i = () => G(r)[0], a = () => G(r)[1];
				var o = Lt();
				let s;
				var c = J(o, !0);
				k(() => {
					s = n(o, 1, "atlas-btn svelte-id2g6u", null, s, { chosen: G(E) === i() }), h(o, "aria-pressed", G(E) === i()), W(c, a());
				}), q("click", o, () => void O(i())), w(e, o);
			}), A(t), w(e, t);
		};
		o(I, (e) => {
			G(E) && e(L);
		});
		var te = P(I, 2), ne = (e) => {
			var t = zt();
			$(M(t), {
				name: "video",
				size: 14
			}), ve(), A(t), k(() => h(t, "href", G(C))), w(e, t);
		};
		o(te, (e) => {
			G(C) && e(ne);
		});
		var re = P(te, 2), ie = (t) => {
			var n = Vt(), r = M(n);
			$(r, {
				name: "pin",
				size: 14
			});
			var i = P(r), a = (e) => {
				var t = Bt(), n = J(t, !0);
				k(() => {
					h(t, "href", c().location), W(n, c().location);
				}), w(e, t);
			}, s = R(() => /^https?:\/\//.test(c().location)), l = (t) => {
				var n = e();
				k(() => W(n, c().location)), w(t, n);
			};
			o(i, (e) => {
				G(s) ? e(a) : e(l, -1);
			}), A(n), w(t, n);
		};
		o(re, (e) => {
			c().location && e(ie);
		});
		var ae = P(re, 2), oe = (e) => {
			var t = Gt(), r = M(t);
			$(r, {
				name: "people",
				size: 14
			});
			var i = P(r, 2), a = M(i), l = (e) => {
				var t = Ht(), n = M(t);
				ve(), A(t), k(() => W(n, `${c().organizer.name ?? c().organizer.email ?? ""} `)), w(e, t);
			};
			o(a, (e) => {
				c().organizer && e(l);
			});
			var u = P(a, 2);
			s(u, 17, () => (c().attendees ?? []).slice(0, 8), (e) => e.email, (e, t) => {
				var r = Ut(), i = M(r), a = P(i), o = J(a, !0);
				A(r), k((e, r) => {
					W(i, `${G(t).name ?? G(t).email ?? ""} `), n(a, 1, `ps ps-${e ?? ""}`, "svelte-id2g6u"), W(o, r);
				}, [() => (G(t).partstat ?? "needs-action").toLowerCase(), () => (G(t).partstat ?? "NEEDS-ACTION").toLowerCase().replace("needs-action", "no answer")]), w(e, r);
			});
			var d = P(u, 2), f = (e) => {
				var t = Wt(), n = J(t);
				k(() => W(n, `and ${(c().attendees?.length ?? 0) - 8} more`)), w(e, t);
			};
			o(d, (e) => {
				(c().attendees?.length ?? 0) > 8 && e(f);
			}), A(i), A(t), w(e, t);
		};
		o(ae, (e) => {
			(c().organizer || c().attendees?.length) && e(oe);
		});
		var z = P(ae, 2), V = (e) => {
			var t = Kt(), n = M(t);
			$(n, {
				name: "text",
				size: 14
			});
			var r = P(n), i = J(r, !0);
			A(t), k(() => W(i, c().description)), w(e, t);
		};
		o(z, (e) => {
			c().description && e(V);
		});
		var se = P(z, 2), ce = M(se);
		$(ce, {
			name: "calendar",
			size: 14
		});
		var le = P(ce);
		A(se);
		var H = P(se, 2), ue = (e) => {
			var t = qt();
			$(M(t), {
				name: "note",
				size: 14
			}), ve(), A(t), q("click", t, () => {
				a.cal.atlas.open(G(S)), a.onclose();
			}), w(e, t);
		};
		o(H, (e) => {
			G(S) && e(ue);
		});
		var U = P(H, 2), de = (e) => {
			var t = Jt(), n = M(t);
			$(n, {
				name: "link",
				size: 14
			});
			var r = P(n), i = J(r, !0);
			A(t), k(() => {
				h(r, "href", c().url), W(i, c().url);
			}), w(e, t);
		};
		o(U, (e) => {
			c().url && e(de);
		}), k((e, t) => {
			m = Q(p, "", m, { "--c": e }), v = n(_, 1, "svelte-id2g6u", null, v, { cancel: c().status === "CANCELLED" }), W(y, c().summary || "(no title)"), W(x, t), W(le, `${c().calendar_name ?? ""}${c().writable ? "" : " · read-only"}`);
		}, [() => c().color ?? a.cal.colorOf(c().calendar), () => ee(c(), a.cal.h12)]), q("click", d, function(...e) {
			a.onclose?.apply(this, e);
		}), w(t, r);
	}, re = (t) => {
		var n = Xt(), r = B(n), i = M(r);
		$(M(i), {
			name: "x",
			size: 15
		}), A(i), A(r);
		var s = P(r, 2);
		p(s), oe(s, (e) => U(_, e), () => G(_));
		var c = P(s, 2), l = J(c, !0), u = P(c, 2), m = M(u);
		$(m, {
			name: "calendar",
			size: 14
		});
		var h = P(m), v = (e) => {
			Nt(e, {
				get cal() {
					return a.cal;
				},
				get value() {
					return G(g);
				},
				set value(e) {
					U(g, e, !0);
				}
			});
		}, y = (t) => {
			var n = e("No calendar to write to");
			w(t, n);
		};
		o(h, (e) => {
			G(g) ? e(v) : e(y, -1);
		}), A(u);
		var x = P(u, 2), S = M(x), C = P(S, 2);
		A(x), k(() => {
			W(l, G(j)), C.disabled = !G(g);
		}), q("click", i, function(...e) {
			a.onclose?.apply(this, e);
		}), q("keydown", s, (e) => {
			e.key === "Enter" ? (e.preventDefault(), b()) : e.key === "Escape" && (e.stopPropagation(), a.onclose());
		}), f(s, () => G(d), (e) => U(d, e)), q("click", S, () => a.onmore(G(d), G(g))), q("click", C, b), w(t, n);
	};
	o(I, (e) => {
		c() ? e(ne) : l() && e(re, 1);
	}), A(N), oe(N, (e) => U(u, e), () => G(u)), k(() => {
		h(N, "aria-label", c() ? c().summary : "New event"), F = Q(N, "", F, {
			left: `${G(v).left ?? ""}px`,
			top: `${G(v).top ?? ""}px`
		});
	}), w(t, N), D();
}
F(["click", "keydown"]);
//#endregion
//#region plugins/stable/dav/ui/src/Editor.svelte
var en = T("<div class=\"scrim svelte-aeatm8\" role=\"presentation\"></div>"), tn = T("<header class=\"svelte-aeatm8\"><h2 class=\"svelte-aeatm8\"> </h2> <button class=\"tool svelte-aeatm8\" aria-label=\"Close\"><!></button></header>"), nn = T("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Starts at\"/>"), rn = T("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Ends at\"/>"), an = T("<option> </option>"), on = T("<div class=\"row svelte-aeatm8\"><!><span class=\"guests svelte-aeatm8\"> <span class=\"faint svelte-aeatm8\"> </span></span></div>"), sn = T("<div class=\"row svelte-aeatm8\"><!><input placeholder=\"Add guests (addresses, comma-separated): it becomes a meeting\" aria-label=\"Guests\" class=\"svelte-aeatm8\"/></div>"), cn = T("<div class=\"atlas-notice error\"> </div>"), ln = T("<!> <div tabindex=\"-1\"><!> <input class=\"title svelte-aeatm8\" placeholder=\"Add a title\" aria-label=\"Title\"/> <div class=\"row when svelte-aeatm8\"><!> <div class=\"times svelte-aeatm8\"><input type=\"date\" aria-label=\"Starts on\" class=\"svelte-aeatm8\"/> <!> <span class=\"to svelte-aeatm8\">to</span> <!> <input type=\"date\" aria-label=\"Ends on\" class=\"svelte-aeatm8\"/> <label class=\"check svelte-aeatm8\"><input type=\"checkbox\" class=\"svelte-aeatm8\"/> All day</label></div></div> <div class=\"row svelte-aeatm8\"><!> <select aria-label=\"Repeat\" class=\"svelte-aeatm8\"></select></div> <div class=\"row svelte-aeatm8\"><!><input placeholder=\"Add a place\" aria-label=\"Place\" class=\"svelte-aeatm8\"/></div> <div class=\"row svelte-aeatm8\"><!> <!></div> <!> <div class=\"row top svelte-aeatm8\"><!><textarea rows=\"5\" placeholder=\"Add a description\" aria-label=\"Description\" class=\"svelte-aeatm8\"></textarea></div> <p class=\"zone svelte-aeatm8\"> </p> <!> <footer class=\"svelte-aeatm8\"><span class=\"hint svelte-aeatm8\">Ctrl+Enter saves</span> <button class=\"atlas-btn\">Cancel</button> <button class=\"atlas-btn primary\">Save</button></footer></div>", 1), un = {
	hash: "svelte-aeatm8",
	code: ".scrim.svelte-aeatm8 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 55%, transparent);z-index:70;}.ed.svelte-aeatm8 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(620px, calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:12px 18px 16px;display:grid;gap:12px;}.ed.bare.svelte-aeatm8 {position:static;transform:none;width:auto;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;background:var(--bg);padding:16px;align-content:start;}header.svelte-aeatm8 {display:flex;align-items:center;}h2.svelte-aeatm8 {flex:1;margin:0;font-size:0.85em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.tool.svelte-aeatm8 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;}.tool.svelte-aeatm8:hover {background:var(--bg-hover);}.title.svelte-aeatm8 {all:unset;font-size:1.35em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--border-strong);padding:4px 0;}.title.svelte-aeatm8:focus {border-bottom-color:var(--accent);}.title.svelte-aeatm8:focus-visible {outline:none;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8) {appearance:none;-webkit-appearance:none;padding-right:28px;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8):disabled {opacity:0.6;}.row.svelte-aeatm8 {display:flex;gap:12px;align-items:center;color:var(--text-faint);min-width:0;}.row.top.svelte-aeatm8 {align-items:flex-start;}.times.svelte-aeatm8 {display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.to.svelte-aeatm8 {color:var(--text-muted);}input.svelte-aeatm8:not(.title):not([type=checkbox]), select.svelte-aeatm8, textarea.svelte-aeatm8 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 8px;min-width:0;color-scheme:light dark;}.row.svelte-aeatm8 > input:where(.svelte-aeatm8), .row.svelte-aeatm8 > select:where(.svelte-aeatm8), textarea.svelte-aeatm8 {flex:1;}textarea.svelte-aeatm8 {resize:vertical;}input.svelte-aeatm8:focus-visible, select.svelte-aeatm8:focus-visible, textarea.svelte-aeatm8:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.hm.svelte-aeatm8 {width:5.5em;font-variant-numeric:tabular-nums;text-align:center;}.check.svelte-aeatm8 {display:flex;gap:6px;align-items:center;color:var(--text);margin-left:6px;}.guests.svelte-aeatm8 {color:var(--text);}.faint.svelte-aeatm8 {color:var(--text-faint);}.zone.svelte-aeatm8 {margin:0;color:var(--text-faint);font-size:0.82em;}footer.svelte-aeatm8 {display:flex;gap:8px;align-items:center;justify-content:flex-end;}.hint.svelte-aeatm8 {flex:1;color:var(--text-faint);font-size:0.82em;}"
};
function dn(e, t) {
	ge(t, !0), x(e, un);
	let r = m(t, "e", 3, null), a = m(t, "title", 3, ""), l = m(t, "guests", 19, () => []), u = m(t, "description", 3, ""), g = m(t, "calendar", 3, ""), _ = m(t, "frame", 3, "sheet"), v = L({
		summary: r()?.summary ?? a(),
		all_day: t.allDay,
		sday: t.start.slice(0, 10),
		stime: t.start.slice(11, 16) || "09:00",
		eday: t.end.slice(0, 10),
		etime: t.end.slice(11, 16) || "10:00",
		location: r()?.location ?? "",
		description: r()?.description ?? u(),
		rrule: r()?.rrule ?? "",
		calendar: r()?.calendar ?? (g() || t.cal.newCalendar()) ?? ""
	}), y = (r()?.attendees ?? []).map((e) => e.email).join(", "), b = V(L(r() ? y : l().join(", "))), S = R(() => new Set(t.cal.accounts.map((e) => (e.user ?? "").toLowerCase()).filter((e) => e.includes("@")))), C = R(() => !!r()?.organizer?.email && !G(S).has(r().organizer.email.toLowerCase())), T = () => G(b).split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes("@")), ee = V(void 0), j = V("");
	i(() => G(ee)?.focus());
	let N = R(() => {
		let e = E(/* @__PURE__ */ new Date(`${v.sday}T12:00`));
		return v.rrule && !e.some((e) => e.value === v.rrule) && e.push({
			value: v.rrule,
			label: he(v.rrule) || v.rrule
		}), e;
	}), F = R(() => t.cal.writable());
	function I() {
		return {
			start: v.all_day ? v.sday : `${v.sday}T${v.stime}`,
			end: v.all_day ? (() => {
				let e = O(/* @__PURE__ */ new Date(`${v.eday}T12:00`), 1);
				return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
			})() : `${v.eday}T${v.etime}`
		};
	}
	async function te() {
		let { start: e, end: n } = I();
		if (n <= e && !(v.all_day && n > e)) {
			U(j, "The end is before the start.");
			return;
		}
		let i = G(b).split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
		if (i.length) {
			U(j, `Not an address: ${i.join(", ")}`);
			return;
		}
		let a = !G(C) && G(b) !== y ? T() : void 0, o = {
			summary: v.summary,
			start: e,
			end: n,
			all_day: v.all_day,
			location: v.location,
			description: v.description,
			rrule: v.rrule,
			attendees: a
		};
		if (!r()) {
			t.onclose(), await t.cal.create({
				...o,
				calendar: v.calendar || void 0
			});
			return;
		}
		let s = await t.cal.askScope(r(), "Change");
		s && (t.onclose(), await t.cal.change(r(), {
			...o,
			move_to: v.calendar && v.calendar !== r().calendar ? v.calendar : void 0,
			from_start: r().start
		}, s, "Saved"));
	}
	function re(e) {
		e.key === "Escape" ? (e.stopPropagation(), t.onclose()) : e.key === "Enter" && (e.ctrlKey || e.metaKey) && (e.preventDefault(), te());
	}
	function ie(e, t) {
		let n = e.trim().toLowerCase().match(/^(\d{1,2})(?:[:h.]?(\d{2}))?\s*(am|pm|h)?$/);
		if (!n) return t;
		let r = Number(n[1]), i = Number(n[2] ?? 0);
		return n[3] === "pm" && r < 12 && (r += 12), n[3] === "am" && r === 12 && (r = 0), r > 23 || i > 59 ? t : `${String(r).padStart(2, "0")}:${String(i).padStart(2, "0")}`;
	}
	function z() {
		if (`${v.eday}T${v.etime}` <= `${v.sday}T${v.stime}` && (v.eday = v.sday, !v.all_day)) {
			let [e, t] = v.stime.split(":").map(Number);
			v.etime = `${String(Math.min(23, e + 1)).padStart(2, "0")}:${String(t).padStart(2, "0")}`;
		}
	}
	var se = ln(), ce = B(se), le = (e) => {
		var n = en();
		q("click", n, function(...e) {
			t.onclose?.apply(this, e);
		}), w(e, n);
	};
	o(ce, (e) => {
		_() === "sheet" && e(le);
	});
	var H = P(ce, 2);
	let ue;
	var de = M(H), K = (e) => {
		var n = tn(), i = M(n), a = J(i, !0), o = P(i, 2);
		$(M(o), { name: "x" }), A(o), A(n), k(() => W(a, r() ? "Edit event" : "New event")), q("click", o, function(...e) {
			t.onclose?.apply(this, e);
		}), w(e, n);
	};
	o(de, (e) => {
		_() === "sheet" && e(K);
	});
	var fe = P(de, 2);
	p(fe), oe(fe, (e) => U(ee, e), () => G(ee));
	var pe = P(fe, 2), me = M(pe);
	$(me, { name: "clock" });
	var Y = P(me, 2), X = M(Y);
	p(X);
	var _e = P(X, 2), Z = (e) => {
		var t = nn();
		p(t), q("change", t, () => {
			v.stime = ie(v.stime, "09:00"), z();
		}), f(t, () => v.stime, (e) => v.stime = e), w(e, t);
	};
	o(_e, (e) => {
		v.all_day || e(Z);
	});
	var Q = P(_e, 4), ye = (e) => {
		var t = rn();
		p(t), q("change", t, () => v.etime = ie(v.etime, "10:00")), f(t, () => v.etime, (e) => v.etime = e), w(e, t);
	};
	o(Q, (e) => {
		v.all_day || e(ye);
	});
	var be = P(Q, 2);
	p(be);
	var xe = P(be, 2), Se = M(xe);
	p(Se), ve(), A(xe), A(Y), A(pe);
	var Ce = P(pe, 2), we = M(Ce);
	$(we, { name: "repeat" });
	var Te = P(we, 2);
	s(Te, 21, () => G(N), (e) => e.value, (e, t) => {
		var n = an(), r = J(n, !0), i = {};
		k(() => {
			W(r, G(t).label), i !== (i = G(t).value) && (n.value = (n.__value = i) ?? "");
		}), w(e, n);
	}), A(Te), d(Te), A(Ce);
	var Ee = P(Ce, 2), De = M(Ee);
	$(De, { name: "pin" });
	var Oe = P(De);
	p(Oe), A(Ee);
	var ke = P(Ee, 2), Ae = M(ke);
	$(Ae, { name: "calendar" });
	var je = P(Ae, 2);
	{
		let e = R(() => !!r() && r().recurring);
		Nt(je, {
			get cal() {
				return t.cal;
			},
			get disabled() {
				return G(e);
			},
			get value() {
				return v.calendar;
			},
			set value(e) {
				v.calendar = e;
			}
		});
	}
	A(ke);
	var Me = P(ke, 2), Ne = (e) => {
		var t = on(), n = M(t);
		$(n, { name: "people" });
		var i = P(n), a = M(i), o = P(a), s = J(o);
		A(i), A(t), k((e) => {
			W(a, `${e ?? ""} `), W(s, `· organised by ${r()?.organizer?.name ?? r()?.organizer?.email ?? ""}`);
		}, [() => (r()?.attendees ?? []).map((e) => e.name ?? e.email).join(", ")]), w(e, t);
	}, Pe = (e) => {
		var t = sn(), n = M(t);
		$(n, { name: "people" });
		var r = P(n);
		p(r), A(t), f(r, () => G(b), (e) => U(b, e)), w(e, t);
	};
	o(Me, (e) => {
		G(C) ? e(Ne) : e(Pe, -1);
	});
	var Fe = P(Me, 2), Ie = M(Fe);
	$(Ie, { name: "text" });
	var Le = P(Ie);
	ne(Le), A(Fe);
	var Re = P(Fe, 2), ze = J(Re), Be = P(Re, 2), Ve = (e) => {
		var t = cn(), n = J(t, !0);
		k(() => W(n, G(j))), w(e, t);
	};
	o(Be, (e) => {
		G(j) && e(Ve);
	});
	var He = P(Be, 2), Ue = P(M(He), 2), We = P(Ue, 2);
	A(He), A(H), k((e) => {
		ue = n(H, 1, "ed svelte-aeatm8", null, ue, { bare: _() === "dialog" }), h(H, "role", _() === "sheet" ? "dialog" : "form"), h(H, "aria-label", r() ? "Edit event" : "New event"), h(H, "aria-modal", _() === "sheet" ? "true" : void 0), W(ze, `Times in your zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""}${e ?? ""}`), We.disabled = !G(F).length;
	}, [() => r()?.tzid && r().tzid !== Intl.DateTimeFormat().resolvedOptions().timeZone ? ` · written in ${r().tzid}` : ""]), q("keydown", H, re), f(fe, () => v.summary, (e) => v.summary = e), q("change", X, z), f(X, () => v.sday, (e) => v.sday = e), f(be, () => v.eday, (e) => v.eday = e), ae(Se, () => v.all_day, (e) => v.all_day = e), c(Te, () => v.rrule, (e) => v.rrule = e), f(Oe, () => v.location, (e) => v.location = e), f(Le, () => v.description, (e) => v.description = e), q("click", Ue, function(...e) {
		t.onclose?.apply(this, e);
	}), q("click", We, te), w(e, se), D();
}
F([
	"click",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/Toasts.svelte
var fn = T("<button class=\"svelte-osdry5\">Undo</button>"), pn = T("<div><span class=\"text svelte-osdry5\"> </span> <!> <button class=\"x svelte-osdry5\" aria-label=\"Close\">×</button></div>"), mn = T("<div class=\"toasts svelte-osdry5\" aria-live=\"polite\"></div>"), hn = {
	hash: "svelte-osdry5",
	code: ".toasts.svelte-osdry5 {position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:60;display:grid;gap:8px;justify-items:center;pointer-events:none;width:min(560px, calc(100% - 32px));}.toast.svelte-osdry5 {pointer-events:auto;display:flex;align-items:center;gap:12px;padding:9px 10px 9px 14px;border-radius:var(--radius);background:var(--heading);color:var(--bg);box-shadow:var(--shadow-md, var(--shadow-sm));max-width:100%; animation: svelte-osdry5-in 120ms var(--ease);}.toast.error.svelte-osdry5 {background:var(--red);color:#fff;}.text.svelte-osdry5 {min-width:0;overflow-wrap:anywhere;}button.svelte-osdry5 {all:unset;cursor:pointer;font-weight:700;color:var(--accent);padding:2px 6px;border-radius:var(--radius-sm);}.error.svelte-osdry5 button:where(.svelte-osdry5) {color:#fff;text-decoration:underline;}button.svelte-osdry5:hover {background:color-mix(in srgb, currentColor 14%, transparent);}button.svelte-osdry5:focus-visible {outline:2px solid currentColor;}.x.svelte-osdry5 {color:inherit;opacity:0.7;font-weight:400;}\n  @keyframes svelte-osdry5-in { from { opacity: 0; transform: translateY(6px); } }\n  @media (prefers-reduced-motion: reduce) {.toast.svelte-osdry5 { animation: none;} }"
};
function gn(e, t) {
	ge(t, !0), x(e, hn);
	var r = mn();
	s(r, 21, () => t.cal.toasts, (e) => e.id, (e, r) => {
		var i = pn();
		let a;
		var s = M(i), c = J(s, !0), l = P(s, 2), u = (e) => {
			var n = fn();
			q("click", n, async () => {
				t.cal.dismiss(G(r).id), await G(r).undo?.();
			}), w(e, n);
		};
		o(l, (e) => {
			G(r).undo && e(u);
		});
		var d = P(l, 2);
		A(i), k(() => {
			a = n(i, 1, "toast svelte-osdry5", null, a, { error: G(r).kind === "error" }), h(i, "role", G(r).kind === "error" ? "alert" : "status"), W(c, G(r).text);
		}), q("click", d, () => t.cal.dismiss(G(r).id)), w(e, i);
	}), A(r), w(e, r), D();
}
F(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/keys.ts
var _n = (e) => (t) => t.setView(e), vn = [
	{
		id: "day",
		title: "Day",
		group: "Views",
		keys: "d, 1",
		run: _n("day")
	},
	{
		id: "week",
		title: "Week",
		group: "Views",
		keys: "w, 2",
		run: _n("week")
	},
	{
		id: "workweek",
		title: "Work week",
		group: "Views",
		keys: "x, 3",
		run: _n("workweek")
	},
	{
		id: "month",
		title: "Month",
		group: "Views",
		keys: "m, 4",
		run: _n("month")
	},
	{
		id: "agenda",
		title: "Agenda (schedule)",
		group: "Views",
		keys: "a, 5",
		run: _n("agenda")
	},
	{
		id: "year",
		title: "Year",
		group: "Views",
		keys: "y, 6",
		run: _n("year")
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
function yn(e) {
	let t = e.key.toLowerCase(), n = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
	return [...[
		e.ctrlKey || e.metaKey ? "ctrl" : "",
		e.altKey ? "alt" : "",
		e.shiftKey && !n ? "shift" : ""
	].filter(Boolean), t].join("+");
}
var bn = new Map(vn.flatMap((e) => (e.keys ?? "").split(",").map((e) => e.trim()).filter(Boolean).map((t) => [t, e])));
function xn(e) {
	return e ? e.split(",").map((e) => e.trim()).filter(Boolean).slice(0, 2).map((e) => e.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowright", "→").replace("arrowleft", "←").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("backspace", "⌫").replace(/^(⇧)?([a-z])$/, (e, t, n) => t ? `⇧${n.toUpperCase()}` : n)) : [];
}
//#endregion
//#region plugins/stable/dav/ui/src/Shortcuts.svelte
var Sn = T("<kbd class=\"svelte-17nm084\"> </kbd>"), Cn = T("<div class=\"row svelte-17nm084\"><span> </span><span class=\"keys svelte-17nm084\"></span></div>"), wn = T("<section><h3 class=\"svelte-17nm084\"> </h3> <!></section>"), Tn = T("<div class=\"scrim svelte-17nm084\" role=\"presentation\"></div> <div class=\"sheet svelte-17nm084\" role=\"dialog\" aria-label=\"Keyboard shortcuts\" aria-modal=\"true\"><header class=\"svelte-17nm084\"><h2 class=\"svelte-17nm084\">Keyboard shortcuts</h2><button class=\"x svelte-17nm084\" aria-label=\"Close\">×</button></header> <div class=\"cols svelte-17nm084\"></div> <p class=\"hint svelte-17nm084\">Drag on the grid to make an event, drag one to move it, its lower edge to resize (15-minute steps). Esc cancels a drag.</p></div>", 1), En = {
	hash: "svelte-17nm084",
	code: ".scrim.svelte-17nm084 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 50%, transparent);z-index:70;}.sheet.svelte-17nm084 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(760px, calc(100% - 32px));max-height:calc(100% - 40px);overflow:auto;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 30px rgba(0,0,0,.3));padding:14px 18px;}header.svelte-17nm084 {display:flex;align-items:center;}h2.svelte-17nm084 {margin:0;flex:1;font-size:1.1em;color:var(--heading);}h3.svelte-17nm084 {margin:10px 0 4px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.cols.svelte-17nm084 {display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:4px 24px;}.row.svelte-17nm084 {display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:var(--text-muted);}.keys.svelte-17nm084 {display:flex;gap:4px;}kbd.svelte-17nm084 {font:600 0.85em var(--font-mono);padding:1px 6px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);}.hint.svelte-17nm084 {color:var(--text-faint);font-size:0.86em;margin:12px 0 0;}.x.svelte-17nm084 {all:unset;cursor:pointer;font-size:1.3em;padding:0 6px;color:var(--text-muted);}"
};
function Dn(e, t) {
	ge(t, !0), x(e, En);
	let n = [...new Set(vn.map((e) => e.group))];
	var r = Tn(), i = B(r), a = P(i, 2), o = M(a), c = P(M(o));
	A(o);
	var l = P(o, 2);
	s(l, 20, () => n, (e) => e, (e, t) => {
		var n = wn(), r = M(n), i = J(r, !0), a = P(r, 2);
		s(a, 17, () => vn.filter((e) => e.group === t && e.keys), (e) => e.id, (e, t) => {
			var n = Cn(), r = M(n), i = J(r, !0), a = P(r);
			s(a, 20, () => xn(G(t).keys), (e) => e, (e, t) => {
				var n = Sn(), r = J(n, !0);
				k(() => W(r, t)), w(e, n);
			}), A(a), A(n), k(() => W(i, G(t).title)), w(e, n);
		}), A(n), k(() => W(i, t)), w(e, n);
	}), A(l), ve(2), A(a), q("click", i, function(...e) {
		t.onclose?.apply(this, e);
	}), q("click", c, function(...e) {
		t.onclose?.apply(this, e);
	}), w(e, r), D();
}
F(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/App.svelte
var On = T("<button class=\"tool svelte-1i74804\" title=\"Side panel (s)\" aria-label=\"Side panel\"><!></button>"), kn = T("<span class=\"spin svelte-1i74804\" aria-label=\"Working\"></span>"), An = T("<option> </option>"), jn = T("<select class=\"vsel svelte-1i74804\" aria-label=\"View\"></select>"), Mn = T("<button> </button>"), Nn = T("<div class=\"seg svelte-1i74804\" role=\"group\" aria-label=\"View\"></div>"), Pn = T("<button class=\"tool svelte-1i74804\" title=\"Sync now (r)\" aria-label=\"Sync\"><!></button> <button class=\"tool svelte-1i74804\" title=\"All commands (Ctrl+K)\" aria-label=\"All commands\"><!></button>", 1), Fn = T("<span class=\"qprev svelte-1i74804\"><b class=\"svelte-1i74804\"> </b> </span>"), In = T("<div class=\"quick svelte-1i74804\"><!> <input placeholder=\"lunch with Ana tomorrow 13:00 · examen 15 nov · réunion lundi à 10h @ D3\" aria-label=\"Quick add\" class=\"svelte-1i74804\"/> <!> <!> <button class=\"atlas-btn primary\">Add</button></div>"), Ln = T("<aside class=\"side svelte-1i74804\" aria-label=\"Calendars\"><!></aside>"), Rn = T("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button><button class=\"atlas-btn\">Settings…</button></div></div>"), zn = T("<div class=\"atlas-notice\">No calendar account yet: add one in Settings (its server address, user name and app password; as many as you have) — or subscribe to a public calendar there.<div class=\"actions\"><button class=\"atlas-btn primary\">Settings…</button></div></div>"), Bn = T("<button class=\"fab svelte-1i74804\" aria-label=\"New event\" title=\"New event (c)\"><!></button>"), Vn = T("<div class=\"popscrim svelte-1i74804\" role=\"presentation\"></div> <!>", 1), Hn = T("<div tabindex=\"-1\" role=\"application\" aria-label=\"Calendar\"><header class=\"top svelte-1i74804\"><!> <button class=\"atlas-btn today svelte-1i74804\" title=\"Today (t)\">Today</button> <div class=\"nav svelte-1i74804\"><button class=\"tool svelte-1i74804\" title=\"Previous (k)\" aria-label=\"Previous\"><!></button> <button class=\"tool svelte-1i74804\" title=\"Next (j)\" aria-label=\"Next\"><!></button></div> <h1 class=\"svelte-1i74804\"> </h1> <!> <span class=\"grow svelte-1i74804\"></span> <div><!> <input aria-label=\"Search events\" class=\"svelte-1i74804\"/></div> <!> <button class=\"tool svelte-1i74804\" title=\"Quick add in words (q)\" aria-label=\"Quick add\"><!></button> <!></header> <!> <div class=\"body svelte-1i74804\"><!> <main class=\"view svelte-1i74804\"><!> <!></main></div> <!> <!> <!> <!> <!></div>"), Un = {
	hash: "svelte-1i74804",
	code: ".calendar.svelte-1i74804:focus {outline:none;}.calendar.svelte-1i74804 {position:relative;height:100%;display:grid;grid-template-rows:auto auto 1fr;color:var(--text);background:var(--bg);font-size:calc(14px * var(--ui-scale, 1));container-type:inline-size;overflow:hidden;}.top.svelte-1i74804 {grid-row:1;display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);min-width:0;}h1.svelte-1i74804 {margin:0 0 0 4px;font-size:1.2em;font-weight:600;color:var(--heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:6em;flex:0 1 auto;}.nav.svelte-1i74804 {display:flex;}.grow.svelte-1i74804 {flex:1;}.today.svelte-1i74804 {flex:none;}.tool.svelte-1i74804 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;flex:none;}.tool.svelte-1i74804:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-1i74804:focus-visible, .seg.svelte-1i74804 button:where(.svelte-1i74804):focus-visible, .fab.svelte-1i74804:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.search.svelte-1i74804 {display:flex;align-items:center;gap:6px;background:var(--bg-hover);border:1px solid transparent;border-radius:var(--radius);padding:0 8px;color:var(--text-faint);width:200px;flex:0 1 auto;min-width:70px;}.search.svelte-1i74804:focus-within, .search.on.svelte-1i74804 {border-color:var(--accent);background:var(--bg);color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1;min-width:0;padding:6px 0;color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.seg.svelte-1i74804 {display:flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;flex:none;}.seg.svelte-1i74804 button:where(.svelte-1i74804) {all:unset;cursor:pointer;padding:4px 10px;font-size:0.86em;color:var(--text-muted);}.seg.svelte-1i74804 button:where(.svelte-1i74804) + button:where(.svelte-1i74804) {border-left:1px solid var(--border);}.seg.svelte-1i74804 button:where(.svelte-1i74804):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-1i74804 button.on:where(.svelte-1i74804) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.vsel.svelte-1i74804 {appearance:none;-webkit-appearance:none;font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:4px 26px 4px 8px;flex:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 14px) 50%, calc(100% - 9px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.spin.svelte-1i74804 {width:12px;height:12px;border-radius:50%;border:2px solid var(--border-strong);border-top-color:var(--accent); animation: svelte-1i74804-spin 0.8s linear infinite;flex:none;}\n  @keyframes svelte-1i74804-spin { to { transform: rotate(360deg); } }\n  @media (prefers-reduced-motion: reduce) {.spin.svelte-1i74804 { animation: none;} }.quick.svelte-1i74804 {grid-row:2;display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--bg-alt);color:var(--accent-strong);min-width:0;flex-wrap:wrap;}.quick.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1 1 260px;min-width:0;color:var(--text);font-size:1.02em;padding:4px 0;}.quick.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.qprev.svelte-1i74804 {color:var(--text-muted);font-size:0.9em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.qprev.svelte-1i74804 b:where(.svelte-1i74804) {color:var(--text);}.body.svelte-1i74804 {grid-row:3;display:flex;min-height:0;}.side.svelte-1i74804 {flex:none;width:248px;border-right:1px solid var(--border);background:var(--bg-alt);min-height:0;}.view.svelte-1i74804 {flex:1;min-width:0;min-height:0;position:relative;display:flex;flex-direction:column;}.view.svelte-1i74804 > * {flex:1;min-height:0;}.view.svelte-1i74804 > .atlas-notice {flex:none;margin:10px 14px;}.popscrim.svelte-1i74804 {position:absolute;inset:0;z-index:49;}.fab.svelte-1i74804 {all:unset;cursor:pointer;position:absolute;right:18px;bottom:22px;z-index:40;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--accent);color:var(--accent-fg);box-shadow:var(--shadow-md, 0 6px 18px rgba(0,0,0,.3));}.narrow.svelte-1i74804 .top:where(.svelte-1i74804) {flex-wrap:wrap;row-gap:6px;padding:8px;}.narrow.svelte-1i74804 h1:where(.svelte-1i74804) {order:10;flex-basis:100%;margin:0;font-size:1.05em;}.narrow.svelte-1i74804 .search:where(.svelte-1i74804) {width:auto;flex:1 1 60px;min-width:60px;}\n  @container (max-width: 1100px) {.seg.svelte-1i74804 button:where(.svelte-1i74804) {padding:4px 7px;} }"
};
function Wn(e, c) {
	ge(c, !0), x(e, Un);
	let l = new Se(c.atlas), u = V(1200), m = V(void 0), g = V(!0), v = V(!1), y = V(void 0), b = V(""), T = V(!1), E = V(""), ee = V(void 0), j = V(null), N = V(""), F = V(null), I = V(null), L = R(() => G(u) < 700), te = R(() => !G(L) && G(u) >= 900 && G(g)), ne = R(() => l.shown());
	H(() => {
		l.narrow !== G(L) && (l.narrow = G(L), l.load());
	});
	let re = [
		["day", "Day"],
		["week", "Week"],
		["workweek", "Work week"],
		["month", "Month"],
		["agenda", "Agenda"],
		["year", "Year"]
	], ie = R(() => G(F)?.e ?? null), ae = () => G(m)?.getBoundingClientRect() ?? new DOMRect(0, 0, G(u), 800);
	function z(e, t) {
		U(F, {
			e,
			at: t
		}, !0), U(I, null);
	}
	function se(e, t, n, r) {
		if (!l.newCalendar()) {
			l.toast(l.configured ? "No calendar of your accounts takes new events (all read-only?)" : "Add a calendar account in Settings first", "error");
			return;
		}
		U(F, {
			draft: {
				start: e,
				end: t,
				all_day: n
			},
			at: r
		}, !0);
	}
	function le() {
		let e = new Date(l.cursor), t = /* @__PURE__ */ new Date(), n = new Date(e.getFullYear(), e.getMonth(), e.getDate(), t.getHours() + 1, 0);
		U(I, {
			start: Y(n),
			end: Y(new Date(n.getTime() + 36e5)),
			allDay: !1
		}, !0), U(F, null);
	}
	function ue(e = G(F)?.e) {
		if (!e) return;
		if (!e.writable) {
			l.toast(`${e.calendar_name || "This calendar"} is read-only`, "error");
			return;
		}
		let t = Se.fields(e);
		U(I, {
			e,
			start: t.start,
			end: t.end,
			allDay: e.all_day
		}, !0), U(F, null);
	}
	function de(e, t) {
		let n = G(F)?.draft;
		n && (U(I, n.all_day ? {
			start: a(n.start),
			end: a(O(n.end, -1)),
			allDay: !0,
			title: e,
			calendar: t
		} : {
			start: Y(n.start),
			end: Y(n.end),
			allDay: !1,
			title: e,
			calendar: t
		}, !0), U(F, null));
	}
	function pe() {
		if (G(v)) {
			U(v, !1);
			return;
		}
		if (G(I)) {
			U(I, null);
			return;
		}
		if (G(F)) {
			U(F, null);
			return;
		}
		if (G(T)) {
			U(T, !1);
			return;
		}
		l.results && (U(b, ""), l.search(""));
	}
	function me() {
		c.atlas.pick({
			placeholder: "Go to a date… (2026-12-01, 15 nov, next monday)",
			tag: "Calendar",
			items: [{
				value: a(/* @__PURE__ */ new Date()),
				title: "Today"
			}, {
				value: a(O(/* @__PURE__ */ new Date(), 7)),
				title: "In a week"
			}],
			typed: (e) => `Go to “${e}”`,
			onpick: async (e, t) => {
				if (!t) {
					l.go(/* @__PURE__ */ new Date(`${e}T12:00`));
					return;
				}
				try {
					let t = await K(c.atlas, "quick", { text: e });
					l.go(/* @__PURE__ */ new Date(`${t.start.slice(0, 10)}T12:00`));
				} catch (e) {
					l.toast(e.message, "error");
				}
			}
		});
	}
	function he() {
		c.atlas.pick({
			placeholder: "Do what? (every command of the Calendar pane)",
			tag: "Calendar",
			items: vn.filter((e) => e.id !== "palette").map((e) => ({
				value: e.id,
				title: e.title,
				detail: xn(e.keys).join("  ·  ") || void 0,
				section: e.group
			})),
			onpick: (e) => vn.find((t) => t.id === e)?.run(l, ve)
		});
	}
	function Z() {
		U(T, !0), U(N, l.newCalendar() ?? "", !0), U(F, null), setTimeout(() => G(ee)?.focus(), 0);
	}
	let ve = {
		create: le,
		quick: Z,
		edit: () => ue(),
		remove: () => {
			let e = G(F)?.e;
			e?.writable && (U(F, null), l.remove(e));
		},
		focusSearch: () => {
			G(y)?.focus(), G(y)?.select();
		},
		help: () => U(v, !G(v)),
		palette: he,
		goto: me,
		back: pe,
		sidebar: () => U(g, !G(g))
	};
	function Q(e) {
		let t = e.target;
		if (t.closest("input, textarea, select, [contenteditable=true]") || !G(m) || !(G(m).contains(t) || t === document.body || t.classList.contains("dv-content-container") && t.contains(G(m))) || [
			"shift",
			"control",
			"alt",
			"meta"
		].includes(e.key.toLowerCase())) return;
		let n = bn.get(yn(e));
		n && (n.id !== "delete" && n.id !== "edit" || G(F)?.e) && (e.preventDefault(), e.stopPropagation(), n.run(l, ve));
	}
	let ye;
	function be() {
		clearTimeout(ye), ye = setTimeout(async () => {
			if (!G(E).trim()) {
				U(j, null);
				return;
			}
			try {
				U(j, await K(c.atlas, "quick", { text: G(E) }), !0);
			} catch {
				U(j, null);
			}
		}, 120);
	}
	async function xe() {
		if (!G(E).trim()) return;
		let e = G(j) ?? await K(c.atlas, "quick", { text: G(E) });
		U(T, !1), U(E, ""), U(j, null), await l.create({
			summary: e.title || "(no title)",
			start: e.start,
			end: e.end,
			all_day: e.all_day,
			rrule: e.rrule,
			location: e.location,
			calendar: G(N) || void 0
		}) && l.go(/* @__PURE__ */ new Date(`${e.start.slice(0, 10)}T12:00`));
	}
	let Ce = R(() => {
		let e = G(j);
		if (!e) return "";
		let t = new Date(e.all_day ? `${e.start}T00:00` : e.start), n = new Date(e.all_day ? `${e.end}T00:00` : e.end), i = t.toLocaleDateString(void 0, {
			weekday: "short",
			day: "numeric",
			month: "short"
		}), a = (e) => r(e, l.h12);
		return e.all_day ? `${i} · all day` : `${i} · ${a(t)} – ${a(n)}`;
	}), we;
	function Te() {
		clearTimeout(we), we = setTimeout(() => void l.search(G(b)), 160);
	}
	i(() => {
		G(m)?.focus({ preventScroll: !0 }), (async () => {
			await l.loadSources(), await l.load(), l.sync(!1);
		})();
		let e = [c.atlas.helper.on("changed", () => {
			l.loadSources(), l.later();
		})], t = setInterval(() => l.now = /* @__PURE__ */ new Date(), 3e4), n = (e) => {
			let t = e.detail ?? {};
			t.date ? l.go(/* @__PURE__ */ new Date(`${t.date}T12:00`), t.view) : t.view && l.setView(t.view), t.quick && Z(), t.create && le();
		};
		window.addEventListener("atlas-calendar:show", n);
		let r = window.__atlasCalendarShow;
		return r && (n(new CustomEvent("x", { detail: r })), window.__atlasCalendarShow = void 0), () => {
			e.forEach((e) => e()), clearInterval(t), window.removeEventListener("atlas-calendar:show", n);
		};
	});
	var Ee = Hn();
	ce("keydown", fe, Q);
	let De;
	var Oe = M(Ee), ke = M(Oe), Ae = (e) => {
		var t = On();
		$(M(t), { name: "menu" }), A(t), q("click", t, () => U(g, !G(g))), w(e, t);
	};
	o(ke, (e) => {
		G(L) || e(Ae);
	});
	var je = P(ke, 2), Me = P(je, 2), Ne = M(Me);
	$(M(Ne), { name: "back" }), A(Ne);
	var Pe = P(Ne, 2);
	$(M(Pe), { name: "right" }), A(Pe), A(Me);
	var Fe = P(Me, 2), Ie = J(Fe, !0), Le = P(Fe, 2), Re = (e) => {
		var t = kn();
		k(() => h(t, "title", l.syncing ? "Syncing with the server" : "Reading")), w(e, t);
	};
	o(Le, (e) => {
		(l.loading || l.syncing) && e(Re);
	});
	var ze = P(Le, 4);
	let Be;
	var Ve = M(ze);
	$(Ve, {
		name: "search",
		size: 15
	});
	var Ue = P(Ve, 2);
	p(Ue), oe(Ue, (e) => U(y, e), () => G(y)), A(ze);
	var We = P(ze, 2), Ge = (e) => {
		var t = jn();
		s(t, 21, () => re, ([e, t]) => e, (e, t) => {
			var n = R(() => _e(G(t), 2));
			let r = () => G(n)[0], i = () => G(n)[1];
			var a = An(), o = J(a, !0), s = {};
			k(() => {
				W(o, i()), s !== (s = r()) && (a.value = (a.__value = s) ?? "");
			}), w(e, a);
		}), A(t);
		var n;
		d(t), k(() => {
			n !== (n = l.view) && (t.value = (t.__value = n) ?? "", _(t, n));
		}), q("change", t, (e) => l.setView(e.currentTarget.value)), w(e, t);
	}, Ke = (e) => {
		var t = Nn();
		s(t, 21, () => re, ([e, t]) => e, (e, t) => {
			var r = R(() => _e(G(t), 2));
			let i = () => G(r)[0], a = () => G(r)[1];
			var o = Mn();
			let s;
			var c = J(o, !0);
			k((e) => {
				h(o, "title", `${a() ?? ""} (${e ?? ""})`), s = n(o, 1, "svelte-1i74804", null, s, { on: l.view === i() }), W(c, a());
			}, [() => vn.find((e) => e.id === i())?.keys?.split(",")[0]]), q("click", o, () => l.setView(i())), w(e, o);
		}), A(t), w(e, t);
	};
	o(We, (e) => {
		G(u) < 980 ? e(Ge) : e(Ke, -1);
	});
	var qe = P(We, 2);
	$(M(qe), { name: "sparkle" }), A(qe);
	var Je = P(qe, 2), Ye = (e) => {
		var t = Pn(), n = B(t);
		$(M(n), { name: "refresh" }), A(n);
		var r = P(n, 2);
		$(M(r), { name: "keyboard" }), A(r), q("click", n, () => l.sync(!0)), q("click", r, he), w(e, t);
	};
	o(Je, (e) => {
		G(L) || e(Ye);
	}), A(Oe);
	var Xe = P(Oe, 2), Ze = (e) => {
		var t = In(), n = M(t);
		$(n, {
			name: "sparkle",
			size: 15
		});
		var r = P(n, 2);
		p(r), oe(r, (e) => U(ee, e), () => G(ee));
		var i = P(r, 2), a = (e) => {
			var t = Fn(), n = M(t), r = J(n, !0), i = P(n);
			A(t), k(() => {
				W(r, G(j).title || "(no title)"), W(i, ` · ${G(Ce) ?? ""}${G(j).rrule ? " · repeats" : ""}${G(j).location ? ` · ${G(j).location}` : ""}`);
			}), w(e, t);
		};
		o(i, (e) => {
			G(j) && e(a);
		});
		var s = P(i, 2), c = (e) => {
			Nt(e, {
				get cal() {
					return l;
				},
				compact: !0,
				get value() {
					return G(N);
				},
				set value(e) {
					U(N, e, !0);
				}
			});
		};
		o(s, (e) => {
			G(N) && e(c);
		});
		var u = P(s, 2);
		A(t), k((e) => u.disabled = e, [() => !G(E).trim()]), q("input", r, be), q("keydown", r, (e) => {
			e.key === "Enter" ? (e.preventDefault(), xe()) : e.key === "Escape" && (e.stopPropagation(), U(T, !1));
		}), f(r, () => G(E), (e) => U(E, e)), q("click", u, xe), w(e, t);
	};
	o(Xe, (e) => {
		G(T) && e(Ze);
	});
	var Qe = P(Xe, 2), $e = M(Qe), et = (e) => {
		var t = Ln();
		He(M(t), {
			get cal() {
				return l;
			},
			oncreate: le
		}), A(t), w(e, t);
	};
	o($e, (e) => {
		G(te) && e(et);
	});
	var tt = P($e, 2), rt = M(tt), it = (e) => {
		var t = Rn(), n = M(t, !0), r = P(n), i = M(r), a = P(i);
		A(r), A(t), k(() => W(n, l.error)), q("click", i, () => l.load()), q("click", a, () => c.atlas.plugin.openSettings()), w(e, t);
	}, at = (e) => {
		var t = zn(), n = P(M(t)), r = J(n);
		A(t), q("click", r, () => c.atlas.plugin.openSettings()), w(e, t);
	};
	o(rt, (e) => {
		l.error ? e(it) : !l.configured && !l.sources.length && e(at, 1);
	});
	var ot = P(rt, 2), st = (e) => {
		{
			let t = R(() => X(/* @__PURE__ */ new Date())), n = R(() => X(/* @__PURE__ */ new Date()));
			xt(e, {
				get cal() {
					return l;
				},
				get events() {
					return l.results;
				},
				get from() {
					return G(t);
				},
				get to() {
					return G(n);
				},
				get selected() {
					return G(ie);
				},
				onselect: z,
				search: !0
			});
		}
	}, ct = (e) => {
		{
			let t = R(() => l.days());
			ft(e, {
				get cal() {
					return l;
				},
				get days() {
					return G(t);
				},
				get selected() {
					return G(ie);
				},
				onselect: z,
				oncreate: se
			});
		}
	}, lt = (e) => {
		{
			let t = R(() => l.range().from), n = R(() => l.range().to);
			xt(e, {
				get cal() {
					return l;
				},
				get events() {
					return l.events;
				},
				get from() {
					return G(t);
				},
				get to() {
					return G(n);
				},
				get selected() {
					return G(ie);
				},
				onselect: z
			});
		}
	}, ut = (e) => {
		Ot(e, { get cal() {
			return l;
		} });
	}, dt = (e) => {
		var t = C(), n = B(t);
		S(n, () => G(ne) + l.range().from.getTime(), (e) => {
			{
				let t = R(() => l.days());
				nt(e, {
					get cal() {
						return l;
					},
					get days() {
						return G(t);
					},
					get selected() {
						return G(ie);
					},
					onselect: z,
					oncreate: se
				});
			}
		}), w(e, t);
	};
	o(ot, (e) => {
		l.results ? e(st) : G(ne) === "month" ? e(ct, 1) : G(ne) === "agenda" ? e(lt, 2) : G(ne) === "year" ? e(ut, 3) : e(dt, -1);
	}), A(tt), A(Qe);
	var pt = P(Qe, 2), mt = (e) => {
		var t = Bn();
		$(M(t), {
			name: "plus",
			size: 22
		}), A(t), q("click", t, le), w(e, t);
	};
	o(pt, (e) => {
		G(L) && e(mt);
	});
	var ht = P(pt, 2), gt = (e) => {
		var t = Vn(), n = B(t), r = P(n, 2);
		S(r, () => G(F), (e) => {
			{
				let t = R(() => G(F).e ?? null), n = R(() => G(F).draft ?? null), r = R(ae);
				$t(e, {
					get cal() {
						return l;
					},
					get e() {
						return G(t);
					},
					get draft() {
						return G(n);
					},
					get at() {
						return G(F).at;
					},
					get box() {
						return G(r);
					},
					onedit: () => ue(),
					onmore: de,
					onclose: () => U(F, null)
				});
			}
		}), q("click", n, () => U(F, null)), w(e, t);
	};
	o(ht, (e) => {
		G(F) && e(gt);
	});
	var _t = P(ht, 2), vt = (e) => {
		{
			let t = R(() => G(I).e ?? null), n = R(() => G(I).title ?? ""), r = R(() => G(I).calendar ?? "");
			dn(e, {
				get cal() {
					return l;
				},
				get e() {
					return G(t);
				},
				get start() {
					return G(I).start;
				},
				get end() {
					return G(I).end;
				},
				get allDay() {
					return G(I).allDay;
				},
				get title() {
					return G(n);
				},
				get calendar() {
					return G(r);
				},
				onclose: () => U(I, null)
			});
		}
	};
	o(_t, (e) => {
		G(I) && e(vt);
	});
	var yt = P(_t, 2), bt = (e) => {
		Dn(e, { onclose: () => U(v, !1) });
	};
	o(yt, (e) => {
		G(v) && e(bt);
	}), gn(P(yt, 2), { get cal() {
		return l;
	} }), A(Ee), oe(Ee, (e) => U(m, e), () => G(m)), k((e, t) => {
		De = n(Ee, 1, "calendar svelte-1i74804", null, De, { narrow: G(L) }), h(Fe, "title", e), W(Ie, t), Be = n(ze, 1, "search svelte-1i74804", null, Be, { on: !!G(b) }), h(Ue, "placeholder", G(L) ? "" : "Search events");
	}, [() => l.title(), () => l.title()]), q("pointerdown", Ee, (e) => {
		e.target.closest("input, textarea, select, button, [tabindex='0']") || G(m)?.focus({ preventScroll: !0 });
	}), q("click", je, () => l.today()), q("click", Ne, () => l.step(-1)), q("click", Pe, () => l.step(1)), q("input", Ue, Te), q("keydown", Ue, (e) => {
		e.key === "Escape" && (U(b, ""), l.search(""), G(y)?.blur());
	}), f(Ue, () => G(b), (e) => U(b, e)), q("click", qe, Z), t(Ee, "clientWidth", (e) => U(u, e)), w(e, Ee), D();
}
F([
	"pointerdown",
	"click",
	"input",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/NewEvent.svelte
var Gn = T("<div class=\"none svelte-19uhe47\"><p class=\"svelte-19uhe47\">No calendar to write to: add an account (CalDAV, or Outlook / Microsoft 365) in the Calendar's settings.</p> <button class=\"atlas-btn\">Open its settings</button></div>"), Kn = T("<p class=\"none svelte-19uhe47\">Loading the calendars…</p>"), qn = {
	hash: "svelte-19uhe47",
	code: ".none.svelte-19uhe47 {padding:16px;display:grid;gap:10px;justify-items:start;color:var(--text-muted);margin:0;}.none.svelte-19uhe47 p:where(.svelte-19uhe47) {margin:0;}"
};
function Jn(e, t) {
	ge(t, !0), x(e, qn);
	let n = m(t, "seed", 19, () => ({})), r = ie(() => new Se(t.atlas));
	r.toast = (e, n) => t.atlas.toast("Calendar", e, n === "error" ? "error" : "success");
	let i = V(!1);
	r.loadSources().then(() => U(i, !0));
	let a = /* @__PURE__ */ new Date(), s = new Date(a.getFullYear(), a.getMonth(), a.getDate(), a.getHours() + 1, 0);
	var c = C(), l = B(c), u = (e) => {
		var i = C(), a = B(i), c = (e) => {
			{
				let i = R(() => Y(s)), a = R(() => Y(new Date(s.getTime() + 36e5))), o = R(() => n().title ?? ""), c = R(() => n().guests ?? []), l = R(() => n().description ?? "");
				dn(e, {
					get cal() {
						return r;
					},
					get start() {
						return G(i);
					},
					get end() {
						return G(a);
					},
					allDay: !1,
					get title() {
						return G(o);
					},
					get guests() {
						return G(c);
					},
					get description() {
						return G(l);
					},
					frame: "dialog",
					get onclose() {
						return t.onclose;
					}
				});
			}
		}, l = R(() => r.writable().length), u = (e) => {
			var n = Gn(), r = P(M(n), 2);
			A(n), q("click", r, () => t.atlas.plugin.openSettings()), w(e, n);
		};
		o(a, (e) => {
			G(l) ? e(c) : e(u, -1);
		}), w(e, i);
	}, d = (e) => {
		var t = Kn();
		w(e, t);
	};
	o(l, (e) => {
		G(i) ? e(u) : e(d, -1);
	}), w(e, c), D();
}
F(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/view.ts
function Yn(e, t) {
	let n = re(t.arg);
	if (n) {
		let r = u(Jn, {
			target: e,
			props: {
				atlas: t,
				seed: n,
				onclose: () => t.pane?.close?.()
			}
		});
		return () => l(r);
	}
	e.style.height = "100%";
	let r = u(Wn, {
		target: e,
		props: { atlas: t }
	});
	return () => l(r);
}
//#endregion
export { Yn as default };
