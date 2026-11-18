import { $ as e, A as t, B as n, C as r, Ct as i, D as a, Dt as o, E as s, Et as c, F as l, G as u, H as d, I as f, J as p, K as m, L as h, M as g, N as _, O as v, P as y, Q as b, R as x, S, St as C, T as w, Tt as T, U as ee, W as te, X as E, Y as D, Z as O, _ as ne, _t as k, at as A, bt as j, c as M, ct as re, d as ie, dt as N, et as P, f as F, ft as ae, g as I, gt as L, h as R, ht as z, i as B, it as oe, j as se, k as V, l as ce, lt as H, m as U, mt as W, n as le, nt as ue, o as G, ot as K, p as de, pt as fe, q as pe, r as q, rt as J, s as me, st as Y, t as he, tt as X, u as ge, ut as _e, v as ve, vt as Z, w as ye, wt as be, x as xe, xt as Q, y as Se, yt as $, z as Ce } from "./ui-lib/layout.js";
//#region ui/src/lib/pane-nav.ts
var we = globalThis.atlasPaneNav ??= [];
function Te(e, t, n) {
	let r = {
		el: e,
		step: t,
		can: n
	};
	return we.push(r), () => {
		let e = we.indexOf(r);
		e >= 0 && we.splice(e, 1);
	};
}
var Ee = class {
	here;
	apply;
	same;
	max;
	back = [];
	fwd = [];
	#e = !1;
	constructor(e, t, n = (e, t) => JSON.stringify(e) === JSON.stringify(t), r = 100) {
		this.here = e, this.apply = t, this.same = n, this.max = r;
	}
	left(e) {
		if (!this.#e && !this.same(e, this.here())) {
			if (this.back.length && this.same(this.back[this.back.length - 1], e)) {
				this.fwd = [];
				return;
			}
			this.back = [...this.back, e].slice(-this.max), this.fwd = [];
		}
	}
	can(e) {
		return (e < 0 ? this.back : this.fwd).length > 0;
	}
	step(e) {
		let t = e < 0 ? this.back : this.fwd, n = t[t.length - 1];
		if (n === void 0) return !1;
		let r = this.here();
		return e < 0 ? (this.back = t.slice(0, -1), this.fwd = [...this.fwd, r]) : (this.fwd = t.slice(0, -1), this.back = [...this.back, r]), this.unrecorded(() => this.apply(n)), !0;
	}
	unrecorded(e) {
		let t = this.#e;
		this.#e = !0;
		try {
			e();
		} finally {
			this.#e = t;
		}
	}
	attach(e) {
		return Te(e, (e) => this.step(e), (e) => this.can(e));
	}
}, De = "notes", Oe = (e) => {
	try {
		return localStorage.getItem(`atlas-calendar-${e}`);
	} catch {
		return null;
	}
}, ke = (e, t) => {
	try {
		localStorage.setItem(`atlas-calendar-${e}`, t);
	} catch {}
}, Ae = class {
	atlas;
	#e = j(Z([]));
	get sources() {
		return H(this.#e);
	}
	set sources(e) {
		$(this.#e, e, !0);
	}
	#t = j(Z([]));
	get accounts() {
		return H(this.#t);
	}
	set accounts(e) {
		$(this.#t, e, !0);
	}
	#n = j(Z([]));
	get events() {
		return H(this.#n);
	}
	set events(e) {
		$(this.#n, e, !0);
	}
	#r = j("week");
	get view() {
		return H(this.#r);
	}
	set view(e) {
		$(this.#r, e, !0);
	}
	#i = j(Z(ne(Oe("span")) ? Oe("span") : "60days"));
	get span() {
		return H(this.#i);
	}
	set span(e) {
		$(this.#i, e, !0);
	}
	#a = j(Z(a(/* @__PURE__ */ new Date())));
	get cursor() {
		return H(this.#a);
	}
	set cursor(e) {
		$(this.#a, e, !0);
	}
	#o = j(!0);
	get loading() {
		return H(this.#o);
	}
	set loading(e) {
		$(this.#o, e, !0);
	}
	#s = j(!1);
	get syncing() {
		return H(this.#s);
	}
	set syncing(e) {
		$(this.#s, e, !0);
	}
	#c = j("");
	get error() {
		return H(this.#c);
	}
	set error(e) {
		$(this.#c, e, !0);
	}
	#l = j(!0);
	get configured() {
		return H(this.#l);
	}
	set configured(e) {
		$(this.#l, e, !0);
	}
	#u = j(null);
	get write() {
		return H(this.#u);
	}
	set write(e) {
		$(this.#u, e, !0);
	}
	#d = j(Z(Oe("last")));
	get last() {
		return H(this.#d);
	}
	set last(e) {
		$(this.#d, e, !0);
	}
	#f = j(Z([]));
	get hidden() {
		return H(this.#f);
	}
	set hidden(e) {
		$(this.#f, e, !0);
	}
	#p = j(Z({}));
	get colors() {
		return H(this.#p);
	}
	set colors(e) {
		$(this.#p, e, !0);
	}
	#m = j(Z([]));
	get toasts() {
		return H(this.#m);
	}
	set toasts(e) {
		$(this.#m, e, !0);
	}
	#h = j(null);
	get results() {
		return H(this.#h);
	}
	set results(e) {
		$(this.#h, e, !0);
	}
	#g = j("");
	get query() {
		return H(this.#g);
	}
	set query(e) {
		$(this.#g, e, !0);
	}
	#_ = j(Z(/* @__PURE__ */ new Date()));
	get now() {
		return H(this.#_);
	}
	set now(e) {
		$(this.#_, e, !0);
	}
	#v = j(Z([]));
	get tasks() {
		return H(this.#v);
	}
	set tasks(e) {
		$(this.#v, e, !0);
	}
	#y = j(null);
	get placing() {
		return H(this.#y);
	}
	set placing(e) {
		$(this.#y, e, !0);
	}
	#b = j(!1);
	get narrow() {
		return H(this.#b);
	}
	set narrow(e) {
		$(this.#b, e, !0);
	}
	seq = 0;
	timer;
	constructor(e) {
		this.atlas = e;
		let t = e.plugin.settings;
		this.view = Oe("view") ?? String(t.default_view ?? "week"), this.hidden = (t.hidden ?? []).slice();
		for (let e of t.colors ?? []) {
			let t = e.lastIndexOf(":");
			t > 0 && (this.colors[e.slice(0, t).trim()] = e.slice(t + 1).trim());
		}
	}
	get settings() {
		return this.atlas.plugin.settings;
	}
	get first() {
		return se(this.settings.week_start);
	}
	get h12() {
		return R(this.settings.time_format);
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
					to: M(e, 6)
				};
			}
			case "workweek": {
				let e = v(t, 1);
				return {
					from: e,
					to: M(e, 4)
				};
			}
			case "month": {
				let e = v(new Date(t.getFullYear(), t.getMonth(), 1), this.first);
				return {
					from: e,
					to: M(e, 41)
				};
			}
			case "agenda": return ge(this.span, t, this.first);
			case "year": return {
				from: new Date(t.getFullYear(), 0, 1),
				to: new Date(t.getFullYear(), 11, 31)
			};
		}
	}
	days() {
		let { from: e, to: t } = this.range(), n = [];
		for (let r = e; r <= t; r = M(r, 1)) n.push(r);
		return n;
	}
	colorOf(e) {
		if (e === "notes") return this.colors.notes ?? this.colors.Notes ?? "var(--accent)";
		if (e === "tasks") return this.colors.tasks ?? "var(--text-muted)";
		let t = this.sources.find((t) => t.id === e);
		return this.colors[e] ?? this.colors[t?.name ?? ""] ?? t?.shown_color ?? t?.color ?? I(e);
	}
	isHidden(e, t = e) {
		return this.hidden.includes(e) || this.hidden.includes(t);
	}
	async loadSources() {
		try {
			let e = await F(this.atlas, "watch", {}, 30);
			this.sources = e.sources, this.accounts = e.accounts ?? [], this.write = e.write, this.configured = e.configured;
		} catch (e) {
			this.error = e.message;
		}
	}
	async load(e = !1) {
		let { from: t, to: n } = this.range(), r = ++this.seq;
		e || (this.loading = !0);
		try {
			let e = this.sources.filter((e) => !this.isHidden(e.id, e.name)).map((e) => e.id), [i, a] = await Promise.all([F(this.atlas, "range", {
				from: g(t),
				to: g(n),
				sources: e,
				notes: this.showNotes && !this.isHidden("notes", "Notes")
			}, 60), this.isHidden("tasks", "Tasks") ? Promise.resolve([]) : this.deadlines(g(t), g(n))]);
			if (r !== this.seq) return;
			this.events = i.events, this.tasks = a, this.error = "";
		} catch (e) {
			r === this.seq && (this.error = e.message);
		} finally {
			r === this.seq && (this.loading = !1);
		}
	}
	async deadlines(e, t) {
		try {
			return (await this.atlas.view("type: list\nfrom: deadlines\nscheduled: true\n")).rows.filter((n) => n.date && n.date >= e && n.date <= t && n.props.from !== "event" && !n.done && n.path).map((e) => {
				let t = /* @__PURE__ */ new Date(`${e.date}T12:00`);
				return {
					uid: `task:${e.path}:${e.line ?? 0}`,
					summary: e.title,
					start: e.date,
					end: g(M(t, 1)),
					all_day: !0,
					recurring: !1,
					free: !0,
					calendar: me,
					calendar_name: e.props.from === "note" ? "Deadline (note)" : "Task",
					writable: !1,
					task: e
				};
			});
		} catch {
			return [];
		}
	}
	get canTick() {
		return typeof this.atlas.tickTask == "function";
	}
	async tick(e) {
		if (!this.canTick || e.line == null) return;
		let t = this.tasks;
		this.tasks = t.filter((t) => !(t.task && t.task.path === e.path && t.task.line === e.line));
		try {
			await this.atlas.tickTask(e.path, e.line), this.toast(`Done: “${e.title}”`, "success", void 0, {
				label: "Open the note",
				run: () => this.atlas.open(e.path, e.line ?? void 0)
			}), this.load(!0);
		} catch (e) {
			this.tasks = t, this.toast(`Not ticked: ${e.message}`, "error");
		}
	}
	shownEvents() {
		return this.tasks.length ? [...this.events, ...this.tasks] : this.events;
	}
	startPlacing(e) {
		this.placing = e, (this.shown() === "month" || this.shown() === "agenda" || this.shown() === "year") && this.setView("week");
	}
	async timeBlock(e, n) {
		let r = this.placing;
		if (this.placing = null, !r) return !1;
		let i = this.newCalendar() ?? void 0;
		try {
			let a = await F(this.atlas, "time_block", {
				summary: r.title,
				start: t(e),
				end: t(n),
				calendar: i,
				task: {
					path: r.path,
					line: r.line ?? 0,
					text: r.title
				}
			});
			return this.toast(`Time-blocked “${r.title}” · ${a.label}`, "success", void 0, {
				label: "Open the note",
				run: () => this.atlas.open(a.note)
			}), !0;
		} catch (e) {
			return this.toast(`Not time-blocked: ${e.message}`, "error"), !1;
		} finally {
			await this.load(!0);
		}
	}
	offerMove(e) {
		if (!e.links.some((e) => e.includes("#^"))) return;
		let t = new Date(e.to.length > 10 ? e.to : `${e.to}T12:00`).toLocaleDateString(void 0, {
			weekday: "short",
			day: "numeric",
			month: "short"
		});
		this.toast(`“${e.title}” moved to ${t}`, void 0, void 0, {
			label: "Move ⏳ too",
			run: async () => {
				try {
					let n = await F(this.atlas, "move_tasks", { note: e.note });
					this.toast(n.failed.length ? `Not moved: ${n.failed.join("; ")}` : `${n.moved === 1 ? "Its task is" : `${n.moved} tasks are`} now ⏳ ${t}`, n.failed.length ? "error" : "success");
				} catch (e) {
					this.toast(`Not moved: ${e.message}`, "error");
				}
			}
		});
	}
	later(e = 250) {
		clearTimeout(this.timer), this.timer = setTimeout(() => void this.load(!0), e);
	}
	async sync(e = !0) {
		this.syncing = !0;
		try {
			let t = await F(this.atlas, "refresh", { force: e }, 300);
			await this.loadSources(), t.changed && await this.load(!0), t.errors.length && this.toast(t.errors[0], "error");
		} catch (e) {
			this.error ||= e.message;
		} finally {
			this.syncing = !1;
		}
	}
	steps = new Ee(() => this.spot(), (e) => {
		this.cursor = new Date(e.day), this.view = e.view, ke("view", e.view), this.results = null, this.load();
	});
	spot() {
		return {
			view: this.view,
			day: this.cursor.getTime()
		};
	}
	setView(e) {
		let t = this.spot();
		this.view = e, ke("view", e), this.results = null, this.load(), this.steps.left(t);
	}
	setSpan(e) {
		this.span = e, ke("span", e), this.load();
	}
	go(e, t) {
		let n = this.spot();
		this.cursor = a(e), t ? this.steps.unrecorded(() => this.setView(t)) : this.load(), this.steps.left(n);
	}
	today() {
		this.go(/* @__PURE__ */ new Date());
	}
	step(e) {
		let t = this.cursor, n = {
			day: () => M(t, e),
			week: () => M(t, 7 * e),
			workweek: () => M(t, 7 * e),
			month: () => ce(new Date(t.getFullYear(), t.getMonth(), 1), e),
			agenda: () => M(t, ie(this.span) * e),
			year: () => new Date(t.getFullYear() + e, t.getMonth(), 1)
		}[this.shown()]();
		this.go(n);
	}
	title(e = this.shown()) {
		let { from: t, to: n } = this.range(e), r = this.cursor;
		if (e === "day" || e === "agenda" && w(t, n)) return r.toLocaleDateString(void 0, {
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
		e && (this.last = e, ke("last", e));
	}
	toast(e, t, n, r) {
		let i = Date.now() + Math.random();
		this.toasts = [...this.toasts.slice(-2), {
			id: i,
			text: e,
			kind: t,
			undo: n,
			action: r
		}], setTimeout(() => this.dismiss(i), n || r ? 9e3 : t === "error" ? 12e3 : 4e3);
	}
	dismiss(e) {
		this.toasts = this.toasts.filter((t) => t.id !== e);
	}
	undoer(e, t) {
		if (e !== void 0) return async () => {
			try {
				await F(this.atlas, "undo", { id: e }), this.toast(`${t} undone`);
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
			let r = await F(this.atlas, "create", {
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
			let i = await F(this.atlas, "update", {
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
			return await F(this.atlas, "respond", {
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
				let n = await F(this.atlas, "delete", {
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
	duplicate(e) {
		let n = U(e), r = de(e), i = e.all_day ? {
			start: g(n),
			end: g(r)
		} : {
			start: t(n),
			end: t(r)
		};
		return this.create({
			summary: e.summary,
			...i,
			all_day: e.all_day,
			location: e.location,
			description: e.description,
			rrule: e.rrule,
			calendar: e.writable ? e.calendar : void 0
		});
	}
	async search(e) {
		if (this.query = e, !e.trim()) {
			this.results = null;
			return;
		}
		try {
			this.results = (await F(this.atlas, "search", { q: e })).events;
		} catch (e) {
			this.toast(e.message, "error");
		}
	}
	static fields(e) {
		let n = U(e), r = de(e);
		return e.all_day ? {
			start: g(n),
			end: g(M(r, -1))
		} : {
			start: t(n),
			end: t(r)
		};
	}
}, je = J("<span class=\"h svelte-1jq00cd\"> </span>"), Me = J("<button> </button>"), Ne = J("<button class=\"link svelte-1jq00cd\">Set it up…</button>"), Pe = J("<h3 class=\"svelte-1jq00cd\">Calendars</h3> <ul class=\"svelte-1jq00cd\"><li class=\"none svelte-1jq00cd\"> <!></li></ul>", 1), Fe = J("<span class=\"err svelte-1jq00cd\">!</span>"), Ie = oe("<svg viewBox=\"0 0 12 12\" width=\"10\" height=\"10\" aria-hidden=\"true\"><path d=\"M2.5 6.5l2.2 2.2L9.5 3.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path></svg>"), Le = J("<span class=\"ro svelte-1jq00cd\" title=\"A subscription: read-only\"><!></span>"), Re = J("<span class=\"ro svelte-1jq00cd\" title=\"Read-only\">ro</span>"), ze = J("<button class=\"pc svelte-1jq00cd\" role=\"option\"></button>"), Be = J("<div class=\"palette svelte-1jq00cd\" role=\"listbox\" aria-label=\"Colours\"></div>"), Ve = J("<li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\"><span><!></span> <span class=\"name svelte-1jq00cd\"> </span> <!> <!></button> <button class=\"tool small svelte-1jq00cd\" title=\"Colour\"><span class=\"swatch svelte-1jq00cd\"></span></button> <!></li>"), He = J("<li class=\"none svelte-1jq00cd\"> </li>"), Ue = J("<h3 class=\"svelte-1jq00cd\"> <!></h3> <ul class=\"svelte-1jq00cd\"></ul>", 1), We = J("<li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\" title=\"Notes marked important: true with due: / event:\"><span><!></span> <span class=\"name svelte-1jq00cd\">Important notes</span></button></li>"), Ge = J("<div class=\"side svelte-1jq00cd\"><button class=\"create atlas-btn primary svelte-1jq00cd\"><!>Create</button> <div class=\"mini svelte-1jq00cd\" aria-label=\"Pick a day\"><div class=\"mhead svelte-1jq00cd\"><span class=\"mtitle svelte-1jq00cd\"> </span> <button class=\"tool svelte-1jq00cd\" aria-label=\"Previous month\"><!></button> <button class=\"tool svelte-1jq00cd\" aria-label=\"Next month\"><!></button></div> <div class=\"mgrid svelte-1jq00cd\"><!> <!></div></div> <!> <!> <h3 class=\"svelte-1jq00cd\">In the vault</h3> <ul class=\"svelte-1jq00cd\"><li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\" title=\"Open tasks with a 📅 or ⏳ date and notes with due:, on their day (click one to time-block it)\"><span><!></span> <span class=\"name svelte-1jq00cd\">Tasks &amp; deadlines</span></button></li> <!></ul> <button class=\"link add svelte-1jq00cd\"><!>Add an account or a subscription…</button></div>"), Ke = {
	hash: "svelte-1jq00cd",
	code: ".side.svelte-1jq00cd {height:100%;overflow-y:auto;padding:12px 10px 24px;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;}.create.svelte-1jq00cd {display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin:0 0 10px 4px;padding:7px 16px;}.mini.svelte-1jq00cd {padding:0 2px 10px;}.mhead.svelte-1jq00cd {display:flex;align-items:center;gap:2px;padding:0 0 4px 6px;}.mtitle.svelte-1jq00cd {flex:1;font-weight:600;font-size:0.9em;color:var(--heading);}.mgrid.svelte-1jq00cd {display:grid;grid-template-columns:repeat(7, 1fr);gap:1px;}.h.svelte-1jq00cd {font-size:0.68em;color:var(--text-faint);text-align:center;padding:2px 0;}.d.svelte-1jq00cd {all:unset;cursor:pointer;text-align:center;font-size:0.76em;line-height:24px;border-radius:999px;font-variant-numeric:tabular-nums;color:var(--text-muted);position:relative;}.d.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.d.other.svelte-1jq00cd {color:var(--text-faint);}.d.on.svelte-1jq00cd {background:var(--accent-soft);color:var(--accent-strong);border-radius:0;}.d.busy.svelte-1jq00cd::after {content:\"\";position:absolute;left:50%;bottom:2px;width:3px;height:3px;border-radius:50%;background:currentColor;transform:translateX(-50%);opacity:0.6;}.d.today.svelte-1jq00cd {background:var(--accent);color:var(--accent-fg);font-weight:700;border-radius:999px;}.d.svelte-1jq00cd:focus-visible, .cal.svelte-1jq00cd:focus-visible, .tool.svelte-1jq00cd:focus-visible, .pc.svelte-1jq00cd:focus-visible, .link.svelte-1jq00cd:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}h3.svelte-1jq00cd {margin:10px 6px 2px;font-size:0.72em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;}ul.svelte-1jq00cd {list-style:none;margin:0;padding:0;display:grid;gap:1px;}li.svelte-1jq00cd {position:relative;display:flex;align-items:center;}.cal.svelte-1jq00cd {all:unset;flex:1;min-width:0;cursor:pointer;display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:var(--radius-sm);color:var(--text);font-size:0.9em;}.cal.svelte-1jq00cd:hover {background:var(--bg-hover);}.box.svelte-1jq00cd {width:14px;height:14px;border-radius:4px;background:var(--c);border:2px solid var(--c);box-sizing:border-box;display:grid;place-items:center;color:#fff;flex:none;}.box.off.svelte-1jq00cd {background:transparent;}.name.svelte-1jq00cd {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.err.svelte-1jq00cd {color:var(--red);font-weight:700;}.ro.svelte-1jq00cd {color:var(--text-faint);font-size:0.75em;}.tool.svelte-1jq00cd {all:unset;cursor:pointer;padding:5px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.small.svelte-1jq00cd {opacity:0;}li.svelte-1jq00cd:hover .small:where(.svelte-1jq00cd), .small.svelte-1jq00cd:focus-visible {opacity:1;}.swatch.svelte-1jq00cd {width:10px;height:10px;border-radius:50%;background:var(--c);}.palette.svelte-1jq00cd {position:absolute;right:0;top:100%;z-index:20;display:grid;grid-template-columns:repeat(6, 22px);gap:6px;padding:8px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 24px rgba(0,0,0,.25));}.pc.svelte-1jq00cd {all:unset;cursor:pointer;width:22px;height:22px;border-radius:50%;background:var(--c);}.pc[aria-selected=\"true\"].svelte-1jq00cd {box-shadow:0 0 0 2px var(--bg-elev), 0 0 0 4px var(--c);}.none.svelte-1jq00cd {color:var(--text-faint);font-size:0.85em;padding:4px 6px;gap:6px;flex-wrap:wrap;}.link.svelte-1jq00cd {all:unset;cursor:pointer;color:var(--accent);font-size:0.85em;display:inline-flex;align-items:center;gap:4px;}.add.svelte-1jq00cd {margin:10px 6px 0;}"
};
function qe(t, r) {
	be(r, !0), pe(t, Ke);
	let a = j(Z(/* @__PURE__ */ new Date()));
	ae(() => {
		$(a, new Date(r.cal.cursor.getFullYear(), r.cal.cursor.getMonth(), 1), !0);
	});
	let o = Q(() => {
		let e = v(H(a), r.cal.first);
		return Array.from({ length: 42 }, (t, n) => M(e, n));
	}), s = Q(() => H(o).slice(0, 7).map((e) => e.toLocaleDateString(void 0, { weekday: "narrow" }))), l = (e) => {
		let t = r.cal.range();
		return e >= t.from && e <= t.to;
	}, d = Q(() => new Set(r.cal.events.map((e) => e.start.slice(0, 10)))), f = (e) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`, h = [
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
	], g = j(null), _ = Q(() => [...r.cal.byAccount().map((e) => ({
		title: e.account.name,
		error: e.account.error ?? void 0,
		items: e.items
	})), {
		title: "Subscriptions",
		error: void 0,
		items: r.cal.sources.filter((e) => e.kind === "ics")
	}]), y = Q(() => !r.cal.accounts.length), b = Q(() => r.cal.showNotes);
	function x(e) {
		return e.error ? `${e.name} — ${e.error}` : e.writable ? e.name : `${e.name} (read-only)`;
	}
	var S = Ge(), C = W(S), ee = W(C);
	B(ee, {
		name: "plus",
		size: 15
	}), T(), c(C);
	var te = k(C, 2), E = W(te), ne = W(E), A = L(ne, !0), re = k(ne, 2), ie = W(re);
	B(ie, {
		name: "back",
		size: 14
	}), c(re);
	var P = k(re, 2), F = W(P);
	B(F, {
		name: "right",
		size: 14
	}), c(P), c(E);
	var I = k(E, 2), R = W(I);
	p(R, 17, () => H(s), D, (t, n) => {
		var r = je(), i = L(r, !0);
		N(() => e(i, H(n))), X(t, r);
	});
	var oe = k(R, 2);
	p(oe, 17, () => H(o), (e) => e.getTime(), (t, n) => {
		var i = Me();
		let o;
		var s = L(i, !0);
		N((t, n, r, a, c) => {
			o = m(i, 1, "d svelte-1jq00cd", null, o, {
				other: t,
				today: n,
				on: r,
				busy: a
			}), e(s, c);
		}, [
			() => H(n).getMonth() !== H(a).getMonth(),
			() => w(H(n), r.cal.now),
			() => l(H(n)),
			() => H(d).has(f(H(n))),
			() => H(n).getDate()
		]), Y("click", i, () => r.cal.go(H(n))), X(t, i);
	}), c(I), c(te);
	var se = k(te, 2), V = (t) => {
		var n = Pe(), i = k(z(n), 2), a = W(i), o = W(a, !0), s = k(o), l = (e) => {
			var t = Ne();
			Y("click", t, () => r.cal.atlas.plugin.openSettings()), X(e, t);
		};
		O(s, (e) => {
			r.cal.configured || e(l);
		}), c(a), c(i), N(() => e(o, r.cal.configured ? r.cal.error ? "Not read: see the message beside." : "Reading the server…" : "No account yet.")), X(t, n);
	};
	O(se, (e) => {
		H(y) && e(V);
	});
	var U = k(se, 2);
	p(U, 17, () => H(_), (e) => e.title, (t, i) => {
		var a = ue(), o = z(a), s = (t) => {
			var a = Ue(), o = z(a), s = W(o, !0), l = k(s), d = (e) => {
				var t = Fe();
				N(() => n(t, "title", H(i).error)), X(e, t);
			};
			O(l, (e) => {
				H(i).error && e(d);
			}), c(o);
			var f = k(o, 2);
			p(f, 21, () => H(i).items, (e) => e.id, (t, i) => {
				var a = Ve(), o = W(a), s = W(o);
				let l, d;
				var f = W(s), _ = (e) => {
					var t = Ie();
					X(e, t);
				}, v = Q(() => !r.cal.isHidden(H(i).id, H(i).name));
				O(f, (e) => {
					H(v) && e(_);
				}), c(s);
				var y = k(s, 2), b = L(y, !0), S = k(y, 2), C = (e) => {
					var t = Fe();
					N(() => n(t, "title", H(i).error)), X(e, t);
				};
				O(S, (e) => {
					H(i).error && e(C);
				});
				var w = k(S, 2), T = (e) => {
					var t = Le(), n = W(t);
					B(n, {
						name: "rss",
						size: 12
					}), c(t), X(e, t);
				}, ee = (e) => {
					var t = Re();
					X(e, t);
				};
				O(w, (e) => {
					H(i).kind === "ics" ? e(T) : H(i).writable || e(ee, 1);
				}), c(o);
				var te = k(o, 2), E = W(te);
				let D;
				c(te);
				var ne = k(te, 2), A = (e) => {
					var t = Be();
					p(t, 20, () => h, (e) => e, (e, t) => {
						var a = ze();
						let o;
						N((e) => {
							n(a, "aria-selected", e), n(a, "aria-label", t), o = u(a, "", o, { "--c": t });
						}, [() => r.cal.colorOf(H(i).id) === t]), Y("click", a, () => {
							r.cal.setColor(H(i).id, t), $(g, null);
						}), X(e, a);
					}), c(t), X(e, t);
				};
				O(ne, (e) => {
					H(g) === H(i).id && e(A);
				}), c(a), N((t, r, a, c, f) => {
					n(o, "aria-checked", t), n(o, "title", r), l = m(s, 1, "box svelte-1jq00cd", null, l, { off: a }), d = u(s, "", d, { "--c": c }), e(b, H(i).name), n(te, "aria-label", `Colour of ${H(i).name ?? ""}`), D = u(E, "", D, { "--c": f });
				}, [
					() => !r.cal.isHidden(H(i).id, H(i).name),
					() => x(H(i)),
					() => r.cal.isHidden(H(i).id, H(i).name),
					() => r.cal.colorOf(H(i).id),
					() => r.cal.colorOf(H(i).id)
				]), Y("click", o, () => r.cal.toggle(H(i).id, H(i).name)), Y("click", te, () => $(g, H(g) === H(i).id ? null : H(i).id, !0)), X(t, a);
			}, (t) => {
				var n = He(), r = L(n, !0);
				N(() => e(r, H(i).error ?? "Reading the server…")), X(t, n);
			}), c(f), N(() => {
				n(o, "title", H(i).error ?? H(i).title), e(s, H(i).title);
			}), X(t, a);
		};
		O(o, (e) => {
			(H(i).items.length || H(i).title !== "Subscriptions") && e(s);
		}), X(t, a);
	});
	var le = k(U, 4), G = W(le), K = W(G), de = W(K);
	let fe, q;
	var J = W(de), he = (e) => {
		var t = Ie();
		X(e, t);
	}, ge = Q(() => !r.cal.isHidden(me, "Tasks"));
	O(J, (e) => {
		H(ge) && e(he);
	}), c(de), T(2), c(K), c(G);
	var _e = k(G, 2), ve = (e) => {
		var t = We(), i = W(t), a = W(i);
		let o, s;
		var l = W(a), d = (e) => {
			var t = Ie();
			X(e, t);
		}, f = Q(() => !r.cal.isHidden(De, "Notes"));
		O(l, (e) => {
			H(f) && e(d);
		}), c(a), T(2), c(i), c(t), N((e, t, r) => {
			n(i, "aria-checked", e), o = m(a, 1, "box svelte-1jq00cd", null, o, { off: t }), s = u(a, "", s, { "--c": r });
		}, [
			() => !r.cal.isHidden(De, "Notes"),
			() => r.cal.isHidden(De, "Notes"),
			() => r.cal.colorOf(De)
		]), Y("click", i, () => r.cal.toggle(De, "Notes")), X(e, t);
	};
	O(_e, (e) => {
		H(b) && e(ve);
	}), c(le);
	var ye = k(le, 2), xe = W(ye);
	B(xe, {
		name: "plus",
		size: 13
	}), T(), c(ye), c(S), N((t, r, i, a) => {
		e(A, t), n(K, "aria-checked", r), fe = m(de, 1, "box svelte-1jq00cd", null, fe, { off: i }), q = u(de, "", q, { "--c": a });
	}, [
		() => H(a).toLocaleDateString(void 0, {
			month: "long",
			year: "numeric"
		}),
		() => !r.cal.isHidden(me, "Tasks"),
		() => r.cal.isHidden(me, "Tasks"),
		() => r.cal.colorOf(me)
	]), Y("click", C, function(...e) {
		r.oncreate?.apply(this, e);
	}), Y("click", re, () => $(a, ce(H(a), -1), !0)), Y("click", P, () => $(a, ce(H(a), 1), !0)), Y("click", K, () => r.cal.toggle(me, "Tasks")), Y("click", ye, () => r.cal.atlas.plugin.openSettings()), X(t, S), i();
}
K(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/TimeGrid.svelte
var Je = J("<button title=\"Open this day\"><span class=\"wd svelte-16enfn0\"> </span> <span class=\"num svelte-16enfn0\"> </span></button>"), Ye = J("<div class=\"lanecell svelte-16enfn0\" role=\"button\" tabindex=\"-1\" aria-label=\"New all-day event\"></div>"), Xe = J("<span class=\"tbox svelte-16enfn0\" aria-hidden=\"true\"></span>"), Ze = J("<span class=\"dot svelte-16enfn0\" aria-hidden=\"true\"></span>"), Qe = J("<button><!> </button>"), $e = J("<div class=\"hl svelte-16enfn0\"> </div>"), et = J("<span class=\"loc svelte-16enfn0\"> </span>"), tt = J("<div class=\"grip svelte-16enfn0\" role=\"separator\" aria-label=\"Change the end\"></div>"), nt = J("<div role=\"button\" tabindex=\"0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span> <!> <!></div>"), rt = J("<div class=\"ev slot-ghost svelte-16enfn0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span></div>"), it = J("<div class=\"now svelte-16enfn0\" aria-hidden=\"true\"></div>"), at = J("<div role=\"gridcell\" tabindex=\"-1\"><!> <!> <!></div>"), ot = J("<div class=\"tg svelte-16enfn0\"><div class=\"head svelte-16enfn0\"><div class=\"gutter tz svelte-16enfn0\" title=\"Times in your zone\"></div> <!></div> <div class=\"lane svelte-16enfn0\"><div class=\"gutter label svelte-16enfn0\">all-day</div> <div class=\"lanecols svelte-16enfn0\"><!> <!></div></div> <div class=\"scroll svelte-16enfn0\"><div class=\"body svelte-16enfn0\"><div class=\"gutter hours svelte-16enfn0\"></div> <div class=\"cols svelte-16enfn0\" role=\"grid\" tabindex=\"-1\" aria-label=\"Hours\"></div></div></div></div>"), st = {
	hash: "svelte-16enfn0",
	code: ".tg.svelte-16enfn0 {display:grid;grid-template-rows:auto auto 1fr;height:100%;min-height:0;--gutter: 56px;}.head.svelte-16enfn0, .lane.svelte-16enfn0 {display:grid;grid-template-columns:var(--gutter) 1fr;border-bottom:1px solid var(--border);}.head.svelte-16enfn0 {grid-template-columns:var(--gutter) repeat(var(--n), 1fr);}.gutter.svelte-16enfn0 {color:var(--text-faint);font-size:0.75em;}.tz.svelte-16enfn0 {align-self:end;padding:0 6px 6px;font-size:0.68em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.dayhead.svelte-16enfn0 {all:unset;cursor:pointer;display:flex;align-items:baseline;justify-content:center;gap:6px;padding:6px 2px;color:var(--text-muted);border-left:1px solid var(--border);min-width:0;}.dayhead.svelte-16enfn0:hover {background:var(--bg-hover);}.dayhead.svelte-16enfn0:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.wd.svelte-16enfn0 {font-size:0.78em;text-transform:uppercase;letter-spacing:0.04em;}.num.svelte-16enfn0 {font-size:1.25em;font-weight:600;color:var(--heading);font-variant-numeric:tabular-nums;min-width:1.8em;text-align:center;border-radius:999px;}.dayhead.today.svelte-16enfn0 .wd:where(.svelte-16enfn0) {color:var(--accent-strong);}.dayhead.today.svelte-16enfn0 .num:where(.svelte-16enfn0) {background:var(--accent);color:var(--accent-fg);}.label.svelte-16enfn0 {align-self:center;padding:0 6px;text-align:right;}.lanecols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);grid-auto-rows:22px;row-gap:2px;padding:3px 0;min-height:26px;max-height:120px;overflow-y:auto;}.lanecell.svelte-16enfn0 {grid-row:1 / span var(--rows);border-left:1px solid var(--border);cursor:cell;}.bar.svelte-16enfn0 {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;margin:0 3px;padding:0 8px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));color:var(--text);font-size:0.82em;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px;border-left:3px solid var(--c);}.bar.clipl.svelte-16enfn0 {border-top-left-radius:0;border-bottom-left-radius:0;margin-left:0;}.bar.clipr.svelte-16enfn0 {border-top-right-radius:0;border-bottom-right-radius:0;margin-right:0;}.dot.svelte-16enfn0 {width:6px;height:6px;border-radius:50%;background:var(--c);flex:none;}\n  /* a task of the Tasks & deadlines layer: its box, not an event's colour block */.bar.task.svelte-16enfn0 {background:transparent;border:1px dashed var(--border-strong);border-left-width:1px;color:var(--text-muted);}.bar.task.svelte-16enfn0:hover {background:var(--bg-hover);color:var(--text);}.tbox.svelte-16enfn0 {width:9px;height:9px;border:1.5px solid currentColor;border-radius:3px;flex:none;box-sizing:border-box;}.scroll.svelte-16enfn0 {overflow-y:auto;min-height:0;position:relative;}.body.svelte-16enfn0 {position:relative;display:grid;grid-template-columns:var(--gutter) 1fr;height:calc(24 * var(--hour));}.hours.svelte-16enfn0 {position:relative;}.hl.svelte-16enfn0 {position:absolute;right:8px;transform:translateY(-50%);font-variant-numeric:tabular-nums;white-space:nowrap;}.cols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);position:relative;touch-action:pan-y;}.col.svelte-16enfn0 {position:relative;border-left:1px solid var(--border);cursor:cell;min-width:0;background-image:repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px var(--hour)), repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour) / 2), color-mix(in srgb, var(--border) 45%, transparent) calc(var(--hour) / 2) calc(var(--hour) / 2 + 1px), transparent calc(var(--hour) / 2 + 1px) var(--hour));}.col.weekend.svelte-16enfn0 {background-color:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.ev.svelte-16enfn0 {position:absolute;box-sizing:border-box;container-type:inline-size;cursor:pointer;border-radius:var(--radius-sm);padding:2px 6px;overflow:hidden;display:flex;flex-direction:column;gap:0;font-size:0.8em;line-height:1.25;background:color-mix(in srgb, var(--c) 24%, var(--bg));border-left:3px solid var(--c);color:var(--text);box-shadow:0 0 0 1px var(--bg);touch-action:none;z-index:calc(1 + var(--depth, 0));}\n  /* drawn over a running event: opaque, with a ring of the page and a shadow so the one under it reads as a separate block */.ev.over.svelte-16enfn0 {box-shadow:0 0 0 1px var(--bg), var(--shadow-sm);}\n  /* a bar is an .ev too (selection, colours) but a grid item in a row: absolute dropped its grid-column (every bar on Monday), a column centred its words */.bar.ev.svelte-16enfn0 {position:relative;flex-direction:row;}.ev.svelte-16enfn0:hover {background:color-mix(in srgb, var(--c) 34%, var(--bg));}.ev.svelte-16enfn0:focus-visible, .ev.sel.svelte-16enfn0, .bar.sel.svelte-16enfn0, .bar.svelte-16enfn0:focus-visible {outline:2px solid var(--c);outline-offset:1px;z-index:40;}.ev.short.svelte-16enfn0 {flex-direction:row;gap:6px;align-items:baseline;}.ev.short.svelte-16enfn0 .t:where(.svelte-16enfn0) {flex:0 1 auto;min-width:2.5em;}.ev.short.svelte-16enfn0 .when:where(.svelte-16enfn0) {flex:0 100 auto;min-width:0;}.ev.ro.svelte-16enfn0 {cursor:default;}.ev.free.svelte-16enfn0 {background:color-mix(in srgb, var(--c) 10%, var(--bg));}.ev.cancel.svelte-16enfn0 .t:where(.svelte-16enfn0), .bar.cancel.svelte-16enfn0 {text-decoration:line-through;opacity:0.7;}.ev.ghosted.svelte-16enfn0 {opacity:0.35;}.t.svelte-16enfn0 {font-weight:600;overflow:hidden;text-overflow:ellipsis;min-width:0;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;flex:none;}.ev.short.svelte-16enfn0 .t:where(.svelte-16enfn0) {display:block;white-space:nowrap;}.when.svelte-16enfn0, .loc.svelte-16enfn0 {color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}.grip.svelte-16enfn0 {position:absolute;left:0;right:0;bottom:0;height:7px;cursor:ns-resize;}.slot-ghost.svelte-16enfn0 {z-index:41;pointer-events:none;box-shadow:var(--shadow-md, 0 4px 16px rgba(0,0,0,.25));background:color-mix(in srgb, var(--c) 40%, var(--bg));}.now.svelte-16enfn0 {position:absolute;left:-1px;right:0;height:2px;background:var(--red);z-index:42;pointer-events:none;}.now.svelte-16enfn0::before {content:\"\";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--red);}\n  /* narrow: the title alone (two lines when tall enough) rather than both cut — the rest is in the tooltip */\n  @container (max-width: 72px) {.when.svelte-16enfn0, .loc.svelte-16enfn0 {display:none;}\n  }\n  @media (prefers-reduced-motion: no-preference) {.ev.svelte-16enfn0 {transition:opacity 120ms var(--ease);} }"
};
function ct(t, r) {
	be(r, !0), pe(t, st);
	let o = y(r, "cal", 7), s = j(void 0), d = j(void 0), f = Q(() => r.days.map((e) => he(o().events, e))), h = Q(() => le(o().shownEvents(), r.days)), g = Q(() => Math.max(1, ...H(h).map((e) => e.row + 1))), v = Array.from({ length: 24 }, (e, t) => t), b = (e) => e === 0 ? "" : o().h12 ? new Date(2e3, 0, 1, e).toLocaleTimeString(void 0, {
		hour: "numeric",
		hour12: !0
	}) : String(e).padStart(2, "0"), x = Q(() => o().now.getHours() * 60 + o().now.getMinutes()), C = (e) => r.selected !== null && r.selected.uid === e.uid && r.selected.rid === e.rid && r.selected.calendar === e.calendar, T = (e) => e.color ?? o().colorOf(e.calendar), ee = (e, t) => `calc(${e * 100}% + ${t}px)`, te = (e) => [
		e.summary || "(no title)",
		`${V(U(e), o().h12)} – ${V(de(e), o().h12)}`,
		e.location,
		e.calendar_name
	].filter(Boolean).join("\n");
	_(() => {
		let e = Number(o().settings.day_start ?? 8), t = r.days.some((e) => w(e, o().now)) ? Math.max(0, H(x) / 60 - 2) : e;
		H(s) && (H(s).scrollTop = Math.max(0, t * 48 - 8));
	});
	let E = j(null), ne = (e) => Math.round(e / 15) * 15;
	function A(e) {
		let t = H(d).getBoundingClientRect();
		return {
			day: Math.min(r.days.length - 1, Math.max(0, Math.floor((e.clientX - t.left) / t.width * r.days.length))),
			min: Math.min(1440, Math.max(0, (e.clientY - t.top) / 48 * 60))
		};
	}
	function ie(e, t, n, r = 0, i = 0) {
		if (e.button !== 0) return;
		e.stopPropagation();
		let a = A(e);
		if (t === "create") {
			let n = Math.floor(a.min / 15) * 15;
			$(E, {
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
		} else $(E, {
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
	function P(e) {
		if (!H(E) || !H(E).moved && Math.hypot(e.clientX - H(E).x0, e.clientY - H(E).y0) < 4) return;
		let t = A(e), n = H(E);
		if (n.moved = !0, n.kind === "create") {
			let e = ne(t.min);
			[n.from, n.to] = e >= n.grab ? [n.grab, Math.max(n.grab + 15, e)] : [e, n.grab + 15];
		} else if (n.kind === "move") {
			let e = ne(t.min - n.grab);
			n.day = t.day, n.from = Math.max(0, Math.min(1425, e)), n.to = n.from + n.len;
		} else n.to = Math.max(n.from + 15, ne(t.min));
		$(E, { ...n }, !0);
	}
	async function F(e) {
		if (H(ae)) return;
		let t = H(E);
		if ($(E, null), document.body.style.userSelect = "", !t) return;
		let n = (e, t) => new Date(r.days[e].getFullYear(), r.days[e].getMonth(), r.days[e].getDate(), 0, t);
		if (t.kind === "create") {
			if (o().placing) {
				o().timeBlock(n(t.day, t.from), n(t.day, t.to));
				return;
			}
			let e = H(d).getBoundingClientRect(), i = e.width / r.days.length;
			r.oncreate(n(t.day, t.from), n(t.day, t.to), !1, new DOMRect(e.left + t.day * i, e.top + t.from / 60 * 48, i, (t.to - t.from) / 60 * 48));
			return;
		}
		let i = (e.target.closest(".ev") ?? e.target).getBoundingClientRect(), a = t.e;
		if (!t.moved) {
			r.onselect(a, i);
			return;
		}
		if (!a.writable) {
			o().toast(`${a.calendar_name || "This calendar"} is read-only`, "error");
			return;
		}
		let s = n(t.day, t.from), c = n(t.day, t.to), l = await o().askScope(a, t.kind === "move" ? "Move" : "Change");
		if (!l) return;
		let u = (e) => String(e).padStart(2, "0"), f = (e) => `${e.getFullYear()}-${u(e.getMonth() + 1)}-${u(e.getDate())}T${u(e.getHours())}:${u(e.getMinutes())}`;
		await o().change(a, {
			start: f(s),
			end: f(c),
			from_start: a.start
		}, l, t.kind === "move" ? "Moved" : "Resized");
	}
	let ae = j(null), I = !1, R = (e) => !!e.task && e.task.done !== !0 && e.task.props.from !== "note" && e.task.line !== null;
	function z(e, t) {
		e.button === 0 && R(t) && ($(ae, {
			t: t.task,
			x0: e.clientX,
			y0: e.clientY,
			moved: !1
		}, !0), window.addEventListener("pointermove", oe), window.addEventListener("pointerup", se, { once: !0 }));
	}
	let B = (e) => {
		let t = H(d)?.getBoundingClientRect(), n = H(s)?.getBoundingClientRect();
		return !!t && !!n && e.clientX >= t.left && e.clientX <= t.right && e.clientY >= n.top && e.clientY <= n.bottom;
	};
	function oe(e) {
		let t = H(ae);
		if (!t || !t.moved && Math.hypot(e.clientX - t.x0, e.clientY - t.y0) < 4) return;
		if (t.moved = !0, document.body.style.userSelect = "none", !B(e)) {
			$(E, null);
			return;
		}
		let n = A(e), r = Math.min(1380, ne(n.min));
		$(E, {
			kind: "create",
			day: n.day,
			from: r,
			to: r + 60,
			grab: r,
			x0: t.x0,
			y0: t.y0,
			moved: !0,
			len: 60
		}, !0);
	}
	function se(e) {
		window.removeEventListener("pointermove", oe);
		let t = H(ae), n = H(E);
		if ($(ae, null), !t?.moved || (I = !0, setTimeout(() => I = !1, 0), $(E, null), document.body.style.userSelect = "", !n || !B(e))) return;
		let i = (e) => new Date(r.days[n.day].getFullYear(), r.days[n.day].getMonth(), r.days[n.day].getDate(), 0, e);
		o().placing = t.t, o().timeBlock(i(n.from), i(n.to));
	}
	function ce(e) {
		H(E) && e.key === "Escape" && ($(E, null), document.body.style.userSelect = "", e.stopPropagation());
	}
	function ue(e, t) {
		if (e.target.closest(".bar") || o().placing) return;
		let n = r.days[t];
		r.oncreate(a(n), M(a(n), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var G = ot();
	re("keydown", fe, ce);
	let K;
	var q = W(G), J = W(q);
	J.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ");
	var me = k(J, 2);
	p(me, 17, () => r.days, D, (t, n) => {
		var r = Je();
		let i;
		var a = W(r), s = L(a, !0), l = k(a, 2), u = L(l, !0);
		c(r), N((t, n, a) => {
			i = m(r, 1, "dayhead svelte-16enfn0", null, i, { today: t }), e(s, n), e(u, a);
		}, [
			() => w(H(n), o().now),
			() => H(n).toLocaleDateString(void 0, { weekday: "short" }),
			() => H(n).getDate()
		]), Y("click", r, () => o().go(H(n), "day")), X(t, r);
	}), c(q);
	var ge = k(q, 2);
	let _e;
	var ve = k(W(ge), 2), Z = W(ve);
	p(Z, 17, () => r.days, D, (e, t, n) => {
		var r = Ye();
		u(r, "", {}, { "grid-column": n + 1 }), Y("click", r, (e) => ue(e, n)), Y("keydown", r, () => {}), X(e, r);
	});
	var ye = k(Z, 2);
	p(ye, 17, () => H(h), (e) => e.e.calendar + e.e.uid + (e.e.rid ?? "") + e.from, (t, i) => {
		var a = Qe();
		let o, s;
		var l = W(a), d = (e) => {
			var t = Xe();
			X(e, t);
		}, f = (e) => {
			var t = Ze();
			X(e, t);
		}, p = Q(() => S(H(i).e));
		O(l, (e) => {
			H(i).e.task ? e(d) : H(p) && e(f, 1);
		});
		var h = k(l, 1, !0);
		c(a), N((t, r, c) => {
			o = m(a, 1, "bar ev svelte-16enfn0", null, o, {
				task: !!H(i).e.task,
				sel: t,
				clipl: H(i).clippedStart,
				clipr: H(i).clippedEnd,
				cancel: H(i).e.status === "CANCELLED"
			}), n(a, "title", r), s = u(a, "", s, {
				"--c": c,
				"grid-column": `${H(i).from + 1} / ${H(i).to + 2}`,
				"grid-row": H(i).row + 1
			}), e(h, H(i).e.summary || "(no title)");
		}, [
			() => C(H(i).e),
			() => R(H(i).e) ? `${H(i).e.summary} — drag it onto the hours to time-block it` : H(i).e.summary,
			() => T(H(i).e)
		]), Y("pointerdown", a, (e) => z(e, H(i).e)), Y("contextmenu", a, (e) => r.onmenu(H(i).e, e)), Y("click", a, (e) => {
			if (I) {
				I = !1;
				return;
			}
			r.onselect(H(i).e, e.currentTarget.getBoundingClientRect());
		}), X(t, a);
	}), c(ve), c(ge);
	var xe = k(ge, 2), Se = W(xe), Ce = W(Se);
	p(Ce, 20, () => v, (e) => e, (t, n) => {
		var r = $e();
		let i;
		var a = L(r, !0);
		N((t) => {
			i = u(r, "", i, { top: `${n * 48}px` }), e(a, t);
		}, [() => b(n)]), X(t, r);
	}), c(Ce);
	var we = k(Ce, 2);
	p(we, 21, () => r.days, D, (t, i, a) => {
		var s = at();
		let l;
		var d = W(s);
		p(d, 17, () => H(f)[a], (e) => e.e.calendar + e.e.uid + (e.e.rid ?? ""), (t, i) => {
			let a = Q(() => H(i).bottom - H(i).top < 40);
			var s = nt();
			let l, d;
			var f = W(s), p = L(f, !0), h = k(f, 2), g = L(h), _ = k(h, 2), v = (t) => {
				var n = et(), r = L(n, !0);
				N(() => e(r, H(i).e.location)), X(t, n);
			};
			O(_, (e) => {
				!H(a) && H(i).e.location && e(v);
			});
			var y = k(_, 2), b = (e) => {
				var t = tt();
				Y("pointerdown", t, (e) => ie(e, "resize", H(i).e, H(i).top, H(i).bottom)), X(e, t);
			};
			O(y, (e) => {
				H(i).e.writable && !H(i).endsAfter && e(b);
			}), c(s), N((t, r, o, c, f, h, _, v, y) => {
				l = m(s, 1, "ev svelte-16enfn0", null, l, {
					sel: t,
					short: H(a),
					over: H(i).depth > 0,
					ro: !H(i).e.writable,
					cancel: H(i).e.status === "CANCELLED",
					free: H(i).e.free,
					ghosted: H(E)?.e === H(i).e && H(E).moved
				}), n(s, "title", r), n(s, "aria-label", `${H(i).e.summary ?? ""}, ${o ?? ""}`), d = u(s, "", d, {
					"--c": c,
					top: `${H(i).top / 60 * 48}px`,
					height: f,
					left: h,
					width: _,
					"--depth": H(i).depth
				}), e(p, H(i).e.summary || "(no title)"), e(g, `${v ?? ""}${y ?? ""}`);
			}, [
				() => C(H(i).e),
				() => te(H(i).e),
				() => V(U(H(i).e), o().h12),
				() => T(H(i).e),
				() => `${Math.max(14, (H(i).bottom - H(i).top) / 60 * 48 - 2)}px`,
				() => ee(H(i).box.x, H(i).box.xpx + 1),
				() => ee(H(i).box.w, H(i).box.wpx - 3),
				() => V(U(H(i).e), o().h12),
				() => H(a) ? "" : ` – ${V(de(H(i).e), o().h12)}`
			]), Y("contextmenu", s, (e) => r.onmenu(H(i).e, e)), Y("pointerdown", s, (e) => H(i).startsBefore || H(i).endsAfter ? e.stopPropagation() : ie(e, "move", H(i).e, H(i).top, H(i).bottom)), Y("click", s, (e) => {
				(H(i).startsBefore || H(i).endsAfter) && r.onselect(H(i).e, e.currentTarget.getBoundingClientRect());
			}), Y("keydown", s, (e) => {
				e.key === "Enter" && r.onselect(H(i).e, e.currentTarget.getBoundingClientRect());
			}), X(t, s);
		});
		var h = k(d, 2), g = (t) => {
			var n = rt();
			let r;
			var i = W(n), a = L(i, !0), s = k(i, 2), l = L(s);
			c(n), N((t, i, s) => {
				r = u(n, "", r, {
					"--c": t,
					top: `${H(E).from / 60 * 48}px`,
					height: `${(H(E).to - H(E).from) / 60 * 48 - 2}px`,
					left: "1px",
					width: "calc(100% - 3px)"
				}), e(a, H(E).e?.summary ?? H(ae)?.t.title ?? o().placing?.title ?? "New event"), e(l, `${i ?? ""} – ${s ?? ""}`);
			}, [
				() => H(E).e ? T(H(E).e) : "var(--accent)",
				() => V(new Date(2e3, 0, 1, 0, H(E).from), o().h12),
				() => V(new Date(2e3, 0, 1, 0, H(E).to), o().h12)
			]), X(t, n);
		};
		O(h, (e) => {
			H(E) && H(E).moved && H(E).day === a && e(g);
		});
		var _ = k(h, 2), v = (e) => {
			var t = it();
			let n;
			N(() => n = u(t, "", n, { top: `${H(x) / 60 * 48}px` })), X(e, t);
		}, y = Q(() => w(H(i), o().now));
		O(_, (e) => {
			H(y) && e(v);
		}), c(s), N((e, t) => l = m(s, 1, "col svelte-16enfn0", null, l, {
			today: e,
			weekend: t
		}), [() => w(H(i), o().now), () => H(i).getDay() === 0 || H(i).getDay() === 6]), Y("pointerdown", s, (e) => ie(e, "create")), X(t, s);
	}), c(we), l(we, (e) => $(d, e), () => H(d)), c(Se), c(xe), l(xe, (e) => $(s, e), () => H(s)), c(G), N(() => {
		K = u(G, "", K, {
			"--n": r.days.length,
			"--hour": "48px"
		}), _e = u(ge, "", _e, { "--rows": H(g) });
	}), Y("pointermove", we, P), Y("pointerup", we, F), re("pointercancel", we, () => $(E, null)), X(t, G), i();
}
K([
	"click",
	"keydown",
	"pointerdown",
	"contextmenu",
	"pointermove",
	"pointerup"
]);
//#endregion
//#region plugins/stable/dav/ui/src/MonthView.svelte
var lt = J("<div class=\"wd svelte-13jyj5s\"> </div>"), ut = J("<div role=\"button\" tabindex=\"-1\"><button class=\"num svelte-13jyj5s\" title=\"Open this day\"> </button></div>"), dt = J("<button> </button>"), ft = J("<button><span class=\"dot svelte-13jyj5s\" aria-hidden=\"true\"></span><span class=\"tm svelte-13jyj5s\"> </span><span class=\"tt svelte-13jyj5s\"> </span></button>"), pt = J("<button class=\"more svelte-13jyj5s\"> </button>"), mt = J("<!> <!>", 1), ht = J("<div class=\"week svelte-13jyj5s\"><!> <!> <!></div>"), gt = J("<div class=\"month svelte-13jyj5s\"><div class=\"wds svelte-13jyj5s\"></div> <div class=\"weeks svelte-13jyj5s\"></div></div>"), _t = {
	hash: "svelte-13jyj5s",
	code: ".month.svelte-13jyj5s {display:grid;grid-template-rows:auto 1fr;height:100%;min-height:0;}.wds.svelte-13jyj5s {display:grid;grid-template-columns:repeat(7, 1fr);border-bottom:1px solid var(--border);}.wd.svelte-13jyj5s {padding:6px 8px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-faint);}.weeks.svelte-13jyj5s {display:grid;grid-template-rows:repeat(var(--rows), minmax(96px, 1fr));min-height:0;overflow-y:auto;}.week.svelte-13jyj5s {display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));grid-template-rows:26px repeat(4, 21px) 1fr;row-gap:1px;border-bottom:1px solid var(--border);position:relative;min-height:0;}.cell.svelte-13jyj5s {grid-row:1 / -1;border-left:1px solid var(--border);padding:2px 4px;cursor:cell;min-width:0;}.cell.svelte-13jyj5s:first-child {border-left:0;}.cell.weekend.svelte-13jyj5s {background:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.cell.other.svelte-13jyj5s {background:color-mix(in srgb, var(--bg-alt) 90%, transparent);}.cell.other.svelte-13jyj5s .num:where(.svelte-13jyj5s) {color:var(--text-faint);}.num.svelte-13jyj5s {all:unset;cursor:pointer;font-size:0.82em;font-weight:600;color:var(--text-muted);padding:1px 6px;border-radius:999px;font-variant-numeric:tabular-nums;}.num.svelte-13jyj5s:hover {background:var(--bg-hover);color:var(--text);}.today.svelte-13jyj5s .num:where(.svelte-13jyj5s) {background:var(--accent);color:var(--accent-fg);}.num.svelte-13jyj5s:focus-visible, .bar.svelte-13jyj5s:focus-visible, .line.svelte-13jyj5s:focus-visible, .more.svelte-13jyj5s:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.bar.svelte-13jyj5s, .line.svelte-13jyj5s, .more.svelte-13jyj5s {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;min-width:0;font-size:0.8em;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.bar.svelte-13jyj5s {margin:0 3px;padding:0 7px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));border-left:3px solid var(--c);color:var(--text);}.bar.clipl.svelte-13jyj5s {margin-left:0;border-top-left-radius:0;border-bottom-left-radius:0;}.bar.clipr.svelte-13jyj5s {margin-right:0;border-top-right-radius:0;border-bottom-right-radius:0;}.line.svelte-13jyj5s {display:flex;align-items:center;gap:5px;margin:0 3px;padding:0 4px;border-radius:var(--radius-sm);color:var(--text);}.line.svelte-13jyj5s:hover, .bar.svelte-13jyj5s:hover {background:color-mix(in srgb, var(--c) 18%, var(--bg-hover));}.sel.svelte-13jyj5s {outline:2px solid var(--c);outline-offset:-1px;}.cancel.svelte-13jyj5s .tt:where(.svelte-13jyj5s) {text-decoration:line-through;opacity:0.7;}.dot.svelte-13jyj5s {width:7px;height:7px;border-radius:50%;background:var(--c);flex:none;}.tm.svelte-13jyj5s {color:var(--text-muted);font-variant-numeric:tabular-nums;flex:none;}.tt.svelte-13jyj5s {overflow:hidden;text-overflow:ellipsis;min-width:0;}.more.svelte-13jyj5s {margin:0 3px;padding:0 6px;color:var(--text-muted);font-weight:600;border-radius:var(--radius-sm);}.more.svelte-13jyj5s:hover {background:var(--bg-hover);color:var(--text);}\n  @container (max-width: 760px) {.tm.svelte-13jyj5s {display:none;} }"
};
function vt(t, r) {
	be(r, !0), pe(t, _t);
	let o = Q(() => Array.from({ length: Math.ceil(r.days.length / 7) }, (e, t) => r.days.slice(t * 7, t * 7 + 7))), s = Q(() => r.cal.cursor.getMonth()), l = (e) => e.color ?? r.cal.colorOf(e.calendar), d = (e) => r.selected !== null && r.selected.uid === e.uid && r.selected.rid === e.rid && r.selected.calendar === e.calendar, f = (e) => e.calendar + e.uid + (e.rid ?? "");
	function h(e) {
		let t = le(r.cal.shownEvents(), e), n = Math.min(4, Math.max(0, ...t.map((e) => e.row + 1))), i = t.filter((e) => e.row < 4 - !!t.some((e) => e.row >= 4));
		return {
			bars: i,
			used: n,
			cells: e.map((e, a) => {
				let o = q(r.cal.events, e).filter((e) => !ve(e)).sort((e, t) => U(e).getTime() - U(t).getTime()), s = t.filter((e) => e.from <= a && e.to >= a), c = s.filter((e) => !i.includes(e)).length, l = Math.max(0, 4 - n - 1), u = o.length + c <= l + 1 ? o.slice(0, l + 1) : o.slice(0, l);
				return {
					timed: u,
					more: o.length - u.length + c,
					total: o.length + s.length
				};
			})
		};
	}
	function g(e, t) {
		e.target.closest("button") || r.oncreate(a(t), M(a(t), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var _ = gt();
	let v;
	var y = W(_);
	p(y, 21, () => H(o)[0] ?? [], (e) => e.getDay(), (t, n) => {
		var r = lt(), i = L(r, !0);
		N((t) => e(i, t), [() => H(n).toLocaleDateString(void 0, { weekday: "short" })]), X(t, r);
	}), c(y);
	var b = k(y, 2);
	p(b, 21, () => H(o), D, (t, i) => {
		let a = Q(() => h(H(i)));
		var o = ht(), _ = W(o);
		p(_, 17, () => H(i), D, (t, i, a) => {
			var o = ut();
			let l;
			u(o, "", {}, { "grid-column": a + 1 });
			var d = W(o), f = L(d, !0);
			c(o), N((t, r, i, a, s) => {
				l = m(o, 1, "cell svelte-13jyj5s", null, l, {
					other: t,
					today: r,
					weekend: i
				}), n(o, "aria-label", `New event on ${a ?? ""}`), e(f, s);
			}, [
				() => H(i).getMonth() !== H(s),
				() => w(H(i), r.cal.now),
				() => H(i).getDay() === 0 || H(i).getDay() === 6,
				() => H(i).toLocaleDateString(),
				() => H(i).getDate() === 1 ? H(i).toLocaleDateString(void 0, {
					day: "numeric",
					month: "short"
				}) : H(i).getDate()
			]), Y("click", o, (e) => g(e, H(i))), Y("keydown", o, () => {}), Y("click", d, () => r.cal.go(H(i), "day")), X(t, o);
		});
		var v = k(_, 2);
		p(v, 17, () => H(a).bars, (e) => f(e.e) + e.from, (t, i) => {
			var a = dt();
			let o, s;
			var c = L(a, !0);
			N((t, r) => {
				o = m(a, 1, "bar svelte-13jyj5s", null, o, {
					sel: t,
					clipl: H(i).clippedStart,
					clipr: H(i).clippedEnd
				}), n(a, "title", H(i).e.summary), s = u(a, "", s, {
					"--c": r,
					"grid-column": `${H(i).from + 1} / ${H(i).to + 2}`,
					"grid-row": H(i).row + 2
				}), e(c, H(i).e.summary || "(no title)");
			}, [() => d(H(i).e), () => l(H(i).e)]), Y("click", a, (e) => r.onselect(H(i).e, e.currentTarget.getBoundingClientRect())), Y("contextmenu", a, (e) => r.onmenu(H(i).e, e)), X(t, a);
		});
		var y = k(v, 2);
		p(y, 17, () => H(a).cells, D, (t, o, s) => {
			var h = mt(), g = z(h);
			p(g, 19, () => H(o).timed, (e) => f(e), (t, i, o) => {
				var f = ft();
				let p, h;
				var g = k(W(f)), _ = L(g, !0), v = k(g), y = L(v, !0);
				c(f), N((t, r, c, l) => {
					p = m(f, 1, "line svelte-13jyj5s", null, p, {
						sel: t,
						cancel: H(i).status === "CANCELLED"
					}), n(f, "title", `${r ?? ""} ${H(i).summary ?? ""}`), h = u(f, "", h, {
						"--c": c,
						"grid-column": s + 1,
						"grid-row": H(a).used + 2 + H(o)
					}), e(_, l), e(y, H(i).summary || "(no title)");
				}, [
					() => d(H(i)),
					() => V(U(H(i)), r.cal.h12),
					() => l(H(i)),
					() => V(U(H(i)), r.cal.h12)
				]), Y("click", f, (e) => r.onselect(H(i), e.currentTarget.getBoundingClientRect())), Y("contextmenu", f, (e) => r.onmenu(H(i), e)), X(t, f);
			});
			var _ = k(g, 2), v = (t) => {
				var n = pt();
				let c;
				var l = L(n);
				N(() => {
					c = u(n, "", c, {
						"grid-column": s + 1,
						"grid-row": H(a).used + 2 + H(o).timed.length
					}), e(l, `+${H(o).more ?? ""} more`);
				}), Y("click", n, () => r.cal.go(H(i)[s], "day")), X(t, n);
			};
			O(_, (e) => {
				H(o).more > 0 && e(v);
			}), X(t, h);
		}), c(o), X(t, o);
	}), c(b), c(_), N(() => v = u(_, "", v, { "--rows": H(o).length })), X(t, _), i();
}
K([
	"click",
	"keydown",
	"contextmenu"
]);
//#endregion
//#region plugins/stable/dav/ui/src/AgendaView.svelte
var yt = J("<button> </button>"), bt = J("<div class=\"spans svelte-zo3qq8\" role=\"group\" aria-label=\"How many days\"></div>"), xt = J("<div class=\"empty svelte-zo3qq8\"> </div>"), St = J("<li class=\"free svelte-zo3qq8\">Nothing planned</li>"), Ct = J("<button class=\"tick svelte-zo3qq8\" title=\"Mark as done\"></button>"), wt = J("<span class=\"loc svelte-zo3qq8\"> </span>"), Tt = J("<span class=\"ic svelte-zo3qq8\" title=\"Repeats\"><!></span>"), Et = J("<span class=\"ic svelte-zo3qq8\" title=\"From a note\"><!></span>"), Dt = J("<li><!> <button><span class=\"dot svelte-zo3qq8\" aria-hidden=\"true\"></span> <span class=\"time svelte-zo3qq8\"> </span> <span class=\"what svelte-zo3qq8\"> <!></span> <!> <!> <span class=\"cal svelte-zo3qq8\"> </span></button></li>"), Ot = J("<section><button class=\"date svelte-zo3qq8\" title=\"Open this day\"><span class=\"n svelte-zo3qq8\"> </span> <span class=\"w svelte-zo3qq8\"> <br/> </span></button> <ul class=\"svelte-zo3qq8\"><!> <!></ul></section>"), kt = J("<div class=\"agenda svelte-zo3qq8\"><!> <!> <!></div>"), At = {
	hash: "svelte-zo3qq8",
	code: ".agenda.svelte-zo3qq8 {height:100%;overflow-y:auto;padding:6px 0 40px;}.spans.svelte-zo3qq8 {display:flex;gap:6px;padding:4px 14px 8px;flex-wrap:wrap;}.spans.svelte-zo3qq8 button:where(.svelte-zo3qq8) {all:unset;cursor:pointer;padding:3px 12px;border-radius:999px;border:1px solid var(--border);color:var(--text-muted);font-size:0.85em;}.spans.svelte-zo3qq8 button:where(.svelte-zo3qq8):hover {background:var(--bg-hover);}.spans.svelte-zo3qq8 button.on:where(.svelte-zo3qq8) {background:var(--accent-soft, color-mix(in srgb, var(--accent) 16%, var(--bg)));border-color:transparent;color:var(--text);font-weight:600;}.spans.svelte-zo3qq8 button:where(.svelte-zo3qq8):focus-visible, .tick.svelte-zo3qq8:focus-visible {outline:2px solid var(--accent);outline-offset:1px;}.free.svelte-zo3qq8 {padding:6px 8px;color:var(--text-faint);font-size:0.9em;}li.task.svelte-zo3qq8 {display:flex;align-items:center;gap:2px;}.tick.svelte-zo3qq8 {all:unset;box-sizing:border-box;cursor:pointer;flex:none;width:16px;height:16px;margin-left:6px;border:1.5px solid var(--text-muted);border-radius:4px;}.tick.svelte-zo3qq8:hover {border-color:var(--accent);background:color-mix(in srgb, var(--accent) 14%, transparent);}.empty.svelte-zo3qq8 {padding:40px;text-align:center;color:var(--text-faint);}.day.svelte-zo3qq8 {display:grid;grid-template-columns:92px 1fr;gap:8px;padding:6px 14px;border-bottom:1px solid var(--border);}.date.svelte-zo3qq8 {all:unset;cursor:pointer;display:flex;gap:8px;align-items:flex-start;padding:4px 0;color:var(--text-muted);}.n.svelte-zo3qq8 {font-size:1.5em;font-weight:650;color:var(--heading);min-width:1.6em;text-align:right;font-variant-numeric:tabular-nums;line-height:1.1;}.w.svelte-zo3qq8 {font-size:0.75em;text-transform:uppercase;letter-spacing:0.04em;line-height:1.35;}.today.svelte-zo3qq8 .n:where(.svelte-zo3qq8) {color:var(--accent-strong);}.date.svelte-zo3qq8:focus-visible, .row.svelte-zo3qq8:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}ul.svelte-zo3qq8 {list-style:none;margin:0;padding:0;display:grid;gap:1px;min-width:0;}.row.svelte-zo3qq8 {all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border-radius:var(--radius-sm);min-width:0;}.row.svelte-zo3qq8:hover {background:var(--bg-hover);}.row.sel.svelte-zo3qq8 {background:color-mix(in srgb, var(--c) 16%, var(--bg));}.dot.svelte-zo3qq8 {width:9px;height:9px;border-radius:50%;background:var(--c);flex:none;}.time.svelte-zo3qq8 {flex:none;width:11.5em;white-space:nowrap;color:var(--text-muted);font-variant-numeric:tabular-nums;font-size:0.9em;}.what.svelte-zo3qq8 {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.loc.svelte-zo3qq8 {color:var(--text-muted);}.cancel.svelte-zo3qq8 .what:where(.svelte-zo3qq8) {text-decoration:line-through;opacity:0.7;}.ic.svelte-zo3qq8 {color:var(--text-faint);flex:none;}.cal.svelte-zo3qq8 {flex:none;color:var(--text-faint);font-size:0.8em;max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n  @container (max-width: 560px) {.day.svelte-zo3qq8 {grid-template-columns:1fr;gap:0;padding:6px 10px;}.date.svelte-zo3qq8 {padding-bottom:0;}.time.svelte-zo3qq8 {width:auto;min-width:5.5em;}.cal.svelte-zo3qq8 {display:none;}\n  }"
};
function jt(t, r) {
	be(r, !0), pe(t, At);
	let s = y(r, "search", 3, !1), l = Q(() => {
		if (s()) {
			let e = /* @__PURE__ */ new Map();
			for (let t of r.events) {
				let n = a(U(t)).getTime();
				e.set(n, [...e.get(n) ?? [], t]);
			}
			return [...e.entries()].map(([e, t]) => ({
				day: new Date(e),
				evs: t
			}));
		}
		let e = [], t = r.cal.span !== "60days";
		for (let n = r.from; n <= r.to; n = M(n, 1)) {
			let i = q(r.events, n).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || U(e).getTime() - U(t).getTime());
			(i.length || t) && e.push({
				day: n,
				evs: i
			});
		}
		return e;
	}), d = (e) => e.color ?? r.cal.colorOf(e.calendar), f = (e) => r.selected !== null && r.selected.uid === e.uid && r.selected.rid === e.rid && r.selected.calendar === e.calendar;
	function h(e, t) {
		if (e.all_day) return "All day";
		let n = U(e), i = de(e);
		return `${w(n, t) ? V(n, r.cal.h12) : "…"} – ${w(i, t) || i.getTime() - a(t).getTime() <= 864e5 && i.getHours() === 0 && i.getMinutes() === 0 ? V(i, r.cal.h12) : "…"}`;
	}
	var g = kt(), _ = W(g), v = (t) => {
		var i = bt();
		p(i, 21, () => G, ([e, t]) => e, (t, i) => {
			var a = Q(() => o(H(i), 2));
			let s = () => H(a)[0], c = () => H(a)[1];
			var l = yt();
			let u;
			var d = L(l, !0);
			N(() => {
				n(l, "aria-pressed", r.cal.span === s()), u = m(l, 1, "svelte-zo3qq8", null, u, { on: r.cal.span === s() }), e(d, c());
			}), Y("click", l, () => r.cal.setSpan(s())), X(t, l);
		}), c(i), X(t, i);
	};
	O(_, (e) => {
		s() || e(v);
	});
	var b = k(_, 2), x = (t) => {
		var n = xt(), r = L(n, !0);
		N(() => e(r, s() ? "No event matches." : "Nothing in the coming days.")), X(t, n);
	};
	O(b, (e) => {
		H(l).length || e(x);
	});
	var C = k(b, 2);
	p(C, 17, () => H(l), (e) => e.day.getTime(), (t, i) => {
		var a = Ot();
		let o;
		var s = W(a), l = W(s), g = L(l, !0), _ = k(l, 2), v = W(_, !0), y = k(v, 2, !0);
		c(_), c(s);
		var b = k(s, 2), x = W(b), C = (e) => {
			var t = St();
			X(e, t);
		};
		O(x, (e) => {
			H(i).evs.length || e(C);
		});
		var T = k(x, 2);
		p(T, 17, () => H(i).evs, (e) => e.calendar + e.uid + (e.rid ?? ""), (t, a) => {
			var o = Dt();
			let s;
			var l = W(o), p = (e) => {
				let t = Q(() => H(a).task);
				var i = Ct();
				N(() => n(i, "aria-label", `Mark “${H(a).summary ?? ""}” as done`)), Y("click", i, () => r.cal.tick(H(t))), X(e, i);
			};
			O(l, (e) => {
				H(a).task && r.cal.canTick && H(a).task.line != null && e(p);
			});
			var g = k(l, 2);
			let _, v;
			var y = k(W(g), 2), b = L(y, !0), x = k(y, 2), C = W(x, !0), w = k(C), T = (t) => {
				var n = wt(), r = L(n);
				N(() => e(r, ` · ${H(a).location ?? ""}`)), X(t, n);
			};
			O(w, (e) => {
				H(a).location && e(T);
			}), c(x);
			var ee = k(x, 2), te = (e) => {
				var t = Tt(), n = W(t);
				B(n, {
					name: "repeat",
					size: 13
				}), c(t), X(e, t);
			};
			O(ee, (e) => {
				H(a).recurring && e(te);
			});
			var E = k(ee, 2), D = (e) => {
				var t = Et(), n = W(t);
				B(n, {
					name: "note",
					size: 13
				}), c(t), X(e, t);
			}, ne = Q(() => S(H(a)));
			O(E, (e) => {
				H(ne) && e(D);
			});
			var A = k(E, 2), j = L(A, !0);
			c(g), c(o), N((t, n, r) => {
				s = m(o, 1, "svelte-zo3qq8", null, s, { task: !!H(a).task }), _ = m(g, 1, "row svelte-zo3qq8", null, _, {
					sel: t,
					cancel: H(a).status === "CANCELLED"
				}), v = u(g, "", v, { "--c": n }), e(b, r), e(C, H(a).summary || "(no title)"), e(j, H(a).calendar_name);
			}, [
				() => f(H(a)),
				() => d(H(a)),
				() => h(H(a), H(i).day)
			]), Y("click", g, (e) => r.onselect(H(a), e.currentTarget.getBoundingClientRect())), Y("contextmenu", g, (e) => r.onmenu(H(a), e)), X(t, o);
		}), c(b), c(a), N((t, n, r, i) => {
			o = m(a, 1, "day svelte-zo3qq8", null, o, { today: t }), e(g, n), e(v, r), e(y, i);
		}, [
			() => w(H(i).day, r.cal.now),
			() => H(i).day.getDate(),
			() => H(i).day.toLocaleDateString(void 0, { weekday: "short" }),
			() => H(i).day.toLocaleDateString(void 0, {
				month: "short",
				year: H(i).day.getFullYear() === r.cal.now.getFullYear() ? void 0 : "numeric"
			})
		]), Y("click", s, () => r.cal.go(H(i).day, "day")), X(t, a);
	}), c(g), X(t, g), i();
}
K(["click", "contextmenu"]);
//#endregion
//#region plugins/stable/dav/ui/src/YearView.svelte
var Mt = J("<span class=\"h svelte-18a11kl\"> </span>"), Nt = J("<button> </button>"), Pt = J("<span></span>"), Ft = J("<section><button class=\"mname svelte-18a11kl\"> </button> <div class=\"days svelte-18a11kl\"><!> <!></div></section>"), It = J("<div class=\"year svelte-18a11kl\"></div>"), Lt = {
	hash: "svelte-18a11kl",
	code: ".year.svelte-18a11kl {height:100%;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(210px, 1fr));gap:18px 24px;padding:16px 20px 40px;align-content:start;}.mname.svelte-18a11kl {all:unset;cursor:pointer;font-weight:650;color:var(--heading);margin-bottom:6px;display:block;}.mname.svelte-18a11kl:hover {color:var(--accent-strong);}.days.svelte-18a11kl {display:grid;grid-template-columns:repeat(7, 1fr);gap:2px;}.h.svelte-18a11kl {font-size:0.7em;color:var(--text-faint);text-align:center;}.d.svelte-18a11kl {all:unset;cursor:pointer;text-align:center;font-size:0.78em;padding:3px 0;border-radius:var(--radius-sm);font-variant-numeric:tabular-nums;color:var(--text-muted);background:color-mix(in srgb, var(--accent) calc(var(--k) * 55%), transparent);}.d.svelte-18a11kl:hover {outline:1px solid var(--accent);}.d.svelte-18a11kl:focus-visible {outline:2px solid var(--accent);}.d.today.svelte-18a11kl {background:var(--accent);color:var(--accent-fg);font-weight:700;}"
};
function Rt(t, r) {
	be(r, !0), pe(t, Lt);
	let a = Q(() => r.cal.cursor.getFullYear()), o = Q(() => {
		let e = /* @__PURE__ */ new Map();
		for (let t = new Date(H(a), 0, 1); t.getFullYear() === H(a); t = M(t, 1)) e.set(t.toDateString(), q(r.cal.events, t).length);
		return e;
	}), s = Q(() => Math.max(1, ...H(o).values()));
	function l(e) {
		let t = v(new Date(H(a), e, 1), r.cal.first);
		return Array.from({ length: 42 }, (e, n) => M(t, n));
	}
	let d = Q(() => Array.from({ length: 7 }, (e, t) => M(v(/* @__PURE__ */ new Date(), r.cal.first), t).toLocaleDateString(void 0, { weekday: "narrow" })));
	var f = It();
	p(f, 20, () => Array.from({ length: 12 }, (e, t) => t), (e) => e, (t, i) => {
		var f = Ft(), h = W(f), g = L(h, !0), _ = k(h, 2), v = W(_);
		p(v, 17, () => H(d), D, (t, n) => {
			var r = Mt(), i = L(r, !0);
			N(() => e(i, H(n))), X(t, r);
		});
		var y = k(v, 2);
		p(y, 17, () => l(i), (e) => e.getTime(), (t, a) => {
			let c = Q(() => H(a).getMonth() === i ? H(o).get(H(a).toDateString()) ?? 0 : 0);
			var l = ue(), d = z(l), f = (t) => {
				var i = Nt();
				let o, l;
				var d = L(i, !0);
				N((t, r, a) => {
					o = m(i, 1, "d svelte-18a11kl", null, o, { today: t }), n(i, "title", `${r ?? ""}: ${H(c) ?? ""} event${H(c) === 1 ? "" : "s"}`), l = u(i, "", l, { "--k": H(c) / H(s) }), e(d, a);
				}, [
					() => w(H(a), r.cal.now),
					() => H(a).toLocaleDateString(),
					() => H(a).getDate()
				]), Y("click", i, () => r.cal.go(H(a), "day")), X(t, i);
			}, p = Q(() => H(a).getMonth() === i), h = (e) => {
				var t = Pt();
				X(e, t);
			};
			O(d, (e) => {
				H(p) ? e(f) : e(h, -1);
			}), X(t, l);
		}), c(_), c(f), N((t) => e(g, t), [() => new Date(H(a), i, 1).toLocaleDateString(void 0, { month: "long" })]), Y("click", h, () => r.cal.go(new Date(H(a), i, 1), "month")), X(t, f);
	}), c(f), X(t, f), i();
}
K(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/CalendarPicker.svelte
var zt = J("<option> </option>"), Bt = J("<optgroup></optgroup>"), Vt = J("<span><span class=\"dot svelte-zssqw9\" aria-hidden=\"true\"></span> <select aria-label=\"Calendar\" class=\"svelte-zssqw9\"><!><!></select></span>"), Ht = {
	hash: "svelte-zssqw9",
	code: ".pick.svelte-zssqw9 {display:inline-flex;align-items:center;gap:8px;min-width:0;flex:1;}.pick.compact.svelte-zssqw9 {flex:0 1 auto;}.dot.svelte-zssqw9 {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}select.svelte-zssqw9 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 28px 5px 8px;min-width:0;flex:1;color-scheme:light dark;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.compact.svelte-zssqw9 select:where(.svelte-zssqw9) {flex:0 1 auto;max-width:16em;}select.svelte-zssqw9:disabled {opacity:0.6;}select.svelte-zssqw9:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}"
};
function Ut(t, r) {
	be(r, !0), pe(t, Ht);
	let a = y(r, "value", 15), o = y(r, "disabled", 3, !1), s = y(r, "compact", 3, !1), l = Q(() => r.cal.byAccount(!0)), f = Q(() => H(l).length > 1), h = (e) => r.cal.sources.find((t) => t.id === e)?.name ?? e;
	var g = Vt();
	let _;
	var v = W(g);
	let b;
	var x = k(v, 2), S = W(x), C = (t) => {
		var n = zt(), r = L(n, !0), i = {};
		N((t) => {
			e(r, t), i !== (i = a()) && (n.value = (n.__value = i) ?? "");
		}, [() => h(a())]), X(t, n);
	}, w = Q(() => a() && !H(l).some((e) => e.items.some((e) => e.id === a())));
	O(S, (e) => {
		H(w) && e(C);
	});
	var T = k(S);
	p(T, 17, () => H(l), (e) => e.account.name, (t, r) => {
		var i = ue(), a = z(i), o = (t) => {
			var i = Bt();
			p(i, 21, () => H(r).items, (e) => e.id, (t, n) => {
				var r = zt(), i = L(r, !0), a = {};
				N(() => {
					e(i, H(n).name), a !== (a = H(n).id) && (r.value = (r.__value = a) ?? "");
				}), X(t, r);
			}), c(i), N(() => n(i, "label", H(r).account.name)), X(t, i);
		}, s = (t) => {
			var n = ue(), i = z(n);
			p(i, 17, () => H(r).items, (e) => e.id, (t, n) => {
				var r = zt(), i = L(r, !0), a = {};
				N(() => {
					e(i, H(n).name), a !== (a = H(n).id) && (r.value = (r.__value = a) ?? "");
				}), X(t, r);
			}), X(t, n);
		};
		O(a, (e) => {
			H(f) ? e(o) : e(s, -1);
		}), X(t, i);
	}), c(x), ee(x), c(g), N((e) => {
		_ = m(g, 1, "pick svelte-zssqw9", null, _, { compact: s() }), b = u(v, "", b, { "--c": e }), x.disabled = o(), n(x, "title", a());
	}, [() => a() ? r.cal.colorOf(a()) : "transparent"]), d(x, a), X(t, g), i();
}
//#endregion
//#region plugins/stable/dav/ui/src/Popover.svelte
var Wt = J("<button class=\"atlas-btn primary svelte-id2g6u\"><!>Time-block…</button>"), Gt = J("<div class=\"bar svelte-id2g6u\"><button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <div class=\"head svelte-id2g6u\"><span class=\"tsq svelte-id2g6u\" aria-hidden=\"true\"></span> <div><h2 class=\"svelte-id2g6u\"> </h2> <p class=\"when svelte-id2g6u\"> </p></div></div> <p class=\"line faint svelte-id2g6u\"><!> </p> <div class=\"acts start svelte-id2g6u\"><!> <button class=\"atlas-btn svelte-id2g6u\"><!>Open the note</button></div>", 1), Kt = J("<button class=\"tool svelte-id2g6u\" title=\"Edit (e)\"><!></button> <button class=\"tool svelte-id2g6u\" title=\"Delete (Del)\"><!></button>", 1), qt = J("<p class=\"sub svelte-id2g6u\"><!> </p>"), Jt = J("<p class=\"sub warn svelte-id2g6u\">Cancelled</p>"), Yt = J("<button> </button>"), Xt = J("<div class=\"answer svelte-id2g6u\" role=\"group\" aria-label=\"Going?\"><span class=\"svelte-id2g6u\">Going?</span> <!></div>"), Zt = J("<a class=\"atlas-btn join svelte-id2g6u\" target=\"_blank\" rel=\"noreferrer\" data-outside=\"\" title=\"Opens in your browser (Teams, Zoom… take it from there)\"><!>Join the meeting</a>"), Qt = J("<a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a>"), $t = J("<p class=\"line svelte-id2g6u\"><!><!></p>"), en = J("<li> <span class=\"faint svelte-id2g6u\">organiser</span></li>"), tn = J("<li> <span> </span></li>"), nn = J("<li class=\"faint svelte-id2g6u\"> </li>"), rn = J("<div class=\"line people svelte-id2g6u\"><!> <ul class=\"svelte-id2g6u\"><!> <!> <!></ul></div>"), an = J("<p class=\"line desc svelte-id2g6u\"><!><span class=\"svelte-id2g6u\"> </span></p>"), on = J("<span aria-hidden=\"true\"></span>"), sn = J("<li><button><!> </button></li>"), cn = J("<div class=\"line linked svelte-id2g6u\"><!> <ul aria-label=\"Linked\" class=\"svelte-id2g6u\"></ul></div>"), ln = J("<li><button class=\"lk svelte-id2g6u\"> </button></li>"), un = J("<div class=\"line linked svelte-id2g6u\"><!> <ul aria-label=\"Linked from\" class=\"svelte-id2g6u\"></ul></div>"), dn = J("<button class=\"atlas-btn svelte-id2g6u\"><!>Open the note</button>"), fn = J("<button class=\"atlas-btn svelte-id2g6u\" title=\"A note of its own for this event: its time and place as properties, your writing below\"><!>Make a note</button>"), pn = J("<p class=\"line svelte-id2g6u\"><!><a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a></p>"), mn = J("<div class=\"bar svelte-id2g6u\"><!> <button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <div class=\"head svelte-id2g6u\"><span class=\"sq svelte-id2g6u\"></span> <div><h2> </h2> <p class=\"when svelte-id2g6u\"> </p> <!> <!></div></div> <!> <!> <!> <!> <!> <p class=\"line faint svelte-id2g6u\"><!> </p> <!> <!> <!> <!>", 1), hn = J("<div class=\"bar svelte-id2g6u\"><button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <input class=\"title svelte-id2g6u\" placeholder=\"Add a title\" aria-label=\"Title\"/> <p class=\"when svelte-id2g6u\"> </p> <div class=\"line faint svelte-id2g6u\"><!><!></div> <div class=\"acts svelte-id2g6u\"><button class=\"atlas-btn svelte-id2g6u\">More options</button> <button class=\"atlas-btn primary svelte-id2g6u\">Save</button></div>", 1), gn = J("<div class=\"pop svelte-id2g6u\" role=\"dialog\"><!></div>"), _n = {
	hash: "svelte-id2g6u",
	code: ".pop.svelte-id2g6u {position:absolute;z-index:50;width:min(360px, calc(100% - 16px));box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:8px 14px 14px;display:grid;gap:8px; animation: svelte-id2g6u-in 120ms var(--ease);}\n  @keyframes svelte-id2g6u-in { from { opacity: 0; transform: translateY(4px); } }\n  @media (prefers-reduced-motion: reduce) {.pop.svelte-id2g6u { animation: none;} }.bar.svelte-id2g6u {display:flex;justify-content:flex-end;gap:2px;margin:0 -8px -4px 0;}.tool.svelte-id2g6u {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-id2g6u:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-id2g6u:focus-visible {outline:2px solid var(--accent);}.head.svelte-id2g6u {display:flex;gap:12px;align-items:flex-start;}.sq.svelte-id2g6u {width:14px;height:14px;border-radius:4px;background:var(--c);flex:none;margin-top:5px;}h2.svelte-id2g6u {margin:0;font-size:1.15em;font-weight:600;color:var(--heading);overflow-wrap:anywhere;}.cancel.svelte-id2g6u {text-decoration:line-through;}.when.svelte-id2g6u {margin:2px 0 0;color:var(--text-muted);font-size:0.92em;}.sub.svelte-id2g6u {margin:2px 0 0;color:var(--text-faint);font-size:0.85em;display:flex;align-items:center;gap:4px;}.warn.svelte-id2g6u {color:var(--red);}.line.svelte-id2g6u {margin:0;display:flex;gap:10px;align-items:flex-start;color:var(--text);font-size:0.9em;min-width:0;overflow-wrap:anywhere;}.line.svelte-id2g6u .icon {margin-top:2px;color:var(--text-faint);}.desc.svelte-id2g6u span:where(.svelte-id2g6u) {white-space:pre-wrap;max-height:9em;overflow:auto;}.people.svelte-id2g6u ul:where(.svelte-id2g6u) {list-style:none;margin:0;padding:0;display:grid;gap:2px;}.faint.svelte-id2g6u {color:var(--text-faint);}.ps.svelte-id2g6u {font-size:0.8em;color:var(--text-faint);}.ps-accepted.svelte-id2g6u {color:var(--green);}.ps-declined.svelte-id2g6u {color:var(--red);}.ps-tentative.svelte-id2g6u {color:var(--yellow);}a.svelte-id2g6u {color:var(--accent);}.atlas-btn.svelte-id2g6u {display:inline-flex;align-items:center;gap:6px;justify-self:start;}.title.svelte-id2g6u {all:unset;font-size:1.15em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--accent);padding:4px 0;}.title.svelte-id2g6u::placeholder {color:var(--text-faint);font-weight:400;}.join.svelte-id2g6u {text-decoration:none;}.answer.svelte-id2g6u {display:flex;align-items:center;gap:6px;padding:6px 0;font-size:0.9em;}.answer.svelte-id2g6u span:where(.svelte-id2g6u) {color:var(--text-muted);margin-right:auto;}.answer.svelte-id2g6u .chosen:where(.svelte-id2g6u) {background:var(--accent-soft);border-color:var(--accent);color:var(--accent-strong, var(--accent));}.acts.svelte-id2g6u {display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;}.acts.start.svelte-id2g6u {justify-content:flex-start;}.tsq.svelte-id2g6u {width:13px;height:13px;border:1.5px solid var(--text-muted);border-radius:4px;flex:none;margin-top:5px;box-sizing:border-box;}.tsq.small.svelte-id2g6u {width:10px;height:10px;margin:0;border-radius:3px;}.tsq.checked.svelte-id2g6u {background:var(--text-faint);border-color:var(--text-faint);}.linked.svelte-id2g6u ul:where(.svelte-id2g6u) {list-style:none;margin:0;padding:0;display:grid;gap:2px;min-width:0;}.lk.svelte-id2g6u {all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;color:var(--accent);overflow-wrap:anywhere;border-radius:var(--radius-sm);}.lk.svelte-id2g6u:hover {text-decoration:underline;}.lk.svelte-id2g6u:focus-visible {outline:2px solid var(--accent);}.lk.done.svelte-id2g6u {color:var(--text-muted);text-decoration:line-through;}"
};
function vn(t, r) {
	be(r, !0), pe(t, _n);
	let a = y(r, "e", 3, null), d = y(r, "draft", 3, null), f = j(void 0), h = j(""), g = j(Z(r.cal.newCalendar() ?? "")), v = j(void 0), b = j(Z({
		left: 0,
		top: 0
	}));
	function C() {
		let e = H(f)?.offsetWidth ?? 340, t = H(f)?.offsetHeight ?? 200, n = r.at.right - r.box.left + 8;
		n + e > r.box.width - 8 && (n = r.at.left - r.box.left - e - 8), n < 8 && (n = Math.max(8, Math.min(r.box.width - e - 8, r.at.left - r.box.left)));
		let i = r.at.top - r.box.top;
		i + t > r.box.height - 8 && (i = Math.max(8, r.box.height - t - 8)), $(b, {
			left: n,
			top: Math.max(8, i)
		}, !0);
	}
	_(() => {
		C(), H(v)?.focus();
	});
	async function w() {
		if (!d() || !H(g)) return;
		let e = (e) => String(e).padStart(2, "0"), t = (t) => `${t.getFullYear()}-${e(t.getMonth() + 1)}-${e(t.getDate())}T${e(t.getHours())}:${e(t.getMinutes())}`, n = (e) => t(e).slice(0, 10), i = {
			summary: H(h).trim() || "(no title)",
			start: d().all_day ? n(d().start) : t(d().start),
			end: d().all_day ? n(d().end) : t(d().end),
			all_day: d().all_day,
			calendar: H(g) || void 0
		};
		r.onclose(), await r.cal.create(i);
	}
	let ee = j(null), te = j(!1);
	_(() => {
		!a() || a().task || a().uid.startsWith("pending-") || a().calendar === "notes" || F(r.cal.atlas, "event", {
			uid: a().uid,
			rid: a().rid,
			start: a().start
		}).then((e) => {
			$(ee, e, !0), setTimeout(C, 0);
		}, () => {});
	});
	let E = Q(() => H(ee)?.note?.path ?? (a() ? S(a()) : null)), D = Q(() => (H(ee)?.backlinks?.links ?? []).filter((e) => e.source !== H(E) && !(H(ee)?.note?.links ?? []).some((t) => t.path === e.source))), ne = (e) => {
		r.cal.atlas.open(e.path, e.line), r.onclose();
	};
	async function M() {
		if (a() && !H(te)) {
			$(te, !0);
			try {
				let e = await F(r.cal.atlas, "event_note", {
					uid: a().uid,
					rid: a().rid,
					start: a().start
				});
				r.cal.atlas.open(e.note), r.onclose();
			} catch (e) {
				r.cal.toast(`No note made: ${e.message}`, "error");
			} finally {
				$(te, !1);
			}
		}
	}
	let re = Q(() => a() ? Se(a()) : null), ie = [
		["ACCEPTED", "Yes"],
		["TENTATIVE", "Maybe"],
		["DECLINED", "No"]
	], P = j(Z(a()?.answer));
	async function ae(e) {
		if (!a() || H(P) === e) return;
		let t = H(P);
		$(P, e, !0), await r.cal.respond(a(), e) || $(P, t, !0);
	}
	let I = Q(() => d() ? d().all_day ? `${d().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · all day` : `${d().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · ${V(d().start, r.cal.h12)} – ${V(d().end, r.cal.h12)}` : "");
	var R = gn();
	let oe;
	var se = W(R), ce = (t) => {
		let n = Q(() => a().task);
		var i = Gt(), o = z(i), l = W(o), u = W(l);
		B(u, {
			name: "x",
			size: 15
		}), c(l), c(o);
		var d = k(o, 2), f = k(W(d), 2), p = W(f), m = L(p, !0), h = k(p, 2), g = L(h);
		c(f), c(d);
		var _ = k(d, 2), v = W(_);
		B(v, {
			name: "note",
			size: 14
		});
		var y = k(v, 1, !0);
		c(_);
		var b = k(_, 2), x = W(b), S = (e) => {
			var t = Wt(), i = W(t);
			B(i, {
				name: "clock",
				size: 14
			}), T(), c(t), Y("click", t, () => {
				r.cal.startPlacing(H(n)), r.onclose();
			}), X(e, t);
		};
		O(x, (e) => {
			H(n).props.from !== "note" && e(S);
		});
		var C = k(x, 2), w = W(C);
		B(w, {
			name: "note",
			size: 14
		}), T(), c(C), c(b), N((t, r) => {
			e(m, a().summary || "(no title)"), e(g, `${H(n).props.from === "note" ? "Due" : "Task"} · ${t ?? ""}`), e(y, r);
		}, [() => s(a(), r.cal.h12).replace(" · all day", ""), () => H(n).path.replace(/\.md$/, "")]), Y("click", l, function(...e) {
			r.onclose?.apply(this, e);
		}), Y("click", C, () => {
			r.cal.atlas.open(H(n).path, H(n).line ?? void 0), r.onclose();
		}), X(t, i);
	}, U = (t) => {
		var i = mn(), l = z(i), d = W(l), f = (e) => {
			var t = Kt(), n = z(t), i = W(n);
			B(i, {
				name: "pen",
				size: 15
			}), c(n);
			var o = k(n, 2), s = W(o);
			B(s, {
				name: "trash",
				size: 15
			}), c(o), Y("click", n, function(...e) {
				r.onedit?.apply(this, e);
			}), Y("click", o, () => {
				let e = a();
				r.onclose(), e && r.cal.remove(e);
			}), X(e, t);
		};
		O(d, (e) => {
			a().writable && e(f);
		});
		var h = k(d, 2), g = W(h);
		B(g, {
			name: "x",
			size: 15
		}), c(h), c(l);
		var _ = k(l, 2), v = W(_);
		let y;
		var b = k(v, 2), x = W(b);
		let S;
		var C = L(x, !0), w = k(x, 2), j = L(w, !0), F = k(w, 2), I = (t) => {
			var n = qt(), r = W(n);
			B(r, {
				name: "repeat",
				size: 12
			});
			var i = k(r);
			c(n), N((t) => e(i, ` ${t ?? ""}`), [() => ye(a().rrule) || "Repeats"]), X(t, n);
		};
		O(F, (e) => {
			a().recurring && e(I);
		});
		var R = k(F, 2), oe = (e) => {
			var t = Jt();
			X(e, t);
		};
		O(R, (e) => {
			a().status === "CANCELLED" && e(oe);
		}), c(b), c(_);
		var se = k(_, 2), V = (t) => {
			var r = Xt(), i = k(W(r), 2);
			p(i, 17, () => ie, ([e, t]) => e, (t, r) => {
				var i = Q(() => o(H(r), 2));
				let a = () => H(i)[0], s = () => H(i)[1];
				var c = Yt();
				let l;
				var u = L(c, !0);
				N(() => {
					l = m(c, 1, "atlas-btn svelte-id2g6u", null, l, { chosen: H(P) === a() }), n(c, "aria-pressed", H(P) === a()), e(u, s());
				}), Y("click", c, () => void ae(a())), X(t, c);
			}), c(r), X(t, r);
		};
		O(se, (e) => {
			H(P) && e(V);
		});
		var ce = k(se, 2), U = (e) => {
			var t = Zt(), r = W(t);
			B(r, {
				name: "video",
				size: 14
			}), T(), c(t), N(() => n(t, "href", H(re))), X(e, t);
		};
		O(ce, (e) => {
			H(re) && e(U);
		});
		var le = k(ce, 2), ue = (t) => {
			var r = $t(), i = W(r);
			B(i, {
				name: "pin",
				size: 14
			});
			var o = k(i), s = (t) => {
				var r = Qt(), i = L(r, !0);
				N(() => {
					n(r, "href", a().location), e(i, a().location);
				}), X(t, r);
			}, l = Q(() => /^https?:\/\//.test(a().location)), u = (t) => {
				var n = A();
				N(() => e(n, a().location)), X(t, n);
			};
			O(o, (e) => {
				H(l) ? e(s) : e(u, -1);
			}), c(r), X(t, r);
		};
		O(le, (e) => {
			a().location && e(ue);
		});
		var G = k(le, 2), K = (t) => {
			var n = rn(), r = W(n);
			B(r, {
				name: "people",
				size: 14
			});
			var i = k(r, 2), o = W(i), s = (t) => {
				var n = en(), r = W(n);
				T(), c(n), N(() => e(r, `${a().organizer.name ?? a().organizer.email ?? ""} `)), X(t, n);
			};
			O(o, (e) => {
				a().organizer && e(s);
			});
			var l = k(o, 2);
			p(l, 17, () => (a().attendees ?? []).slice(0, 8), (e) => e.email, (t, n) => {
				var r = tn(), i = W(r), a = k(i), o = L(a, !0);
				c(r), N((t, r) => {
					e(i, `${H(n).name ?? H(n).email ?? ""} `), m(a, 1, `ps ps-${t ?? ""}`, "svelte-id2g6u"), e(o, r);
				}, [() => (H(n).partstat ?? "needs-action").toLowerCase(), () => (H(n).partstat ?? "NEEDS-ACTION").toLowerCase().replace("needs-action", "no answer")]), X(t, r);
			});
			var u = k(l, 2), d = (t) => {
				var n = nn(), r = L(n);
				N(() => e(r, `and ${(a().attendees?.length ?? 0) - 8} more`)), X(t, n);
			};
			O(u, (e) => {
				(a().attendees?.length ?? 0) > 8 && e(d);
			}), c(i), c(n), X(t, n);
		};
		O(G, (e) => {
			(a().organizer || a().attendees?.length) && e(K);
		});
		var de = k(G, 2), fe = (t) => {
			var n = an(), r = W(n);
			B(r, {
				name: "text",
				size: 14
			});
			var i = k(r), o = L(i, !0);
			c(n), N(() => e(o, a().description)), X(t, n);
		};
		O(de, (e) => {
			a().description && e(fe);
		});
		var pe = k(de, 2), q = W(pe);
		B(q, {
			name: "calendar",
			size: 14
		});
		var J = k(q);
		c(pe);
		var me = k(pe, 2), he = (t) => {
			var r = cn(), i = W(r);
			B(i, {
				name: "link",
				size: 14
			});
			var a = k(i, 2);
			p(a, 23, () => H(ee).note.links, (e, t) => e.link + ":" + t, (t, r) => {
				var i = sn(), a = W(i);
				let o;
				var s = W(a), l = (e) => {
					var t = on();
					let n;
					N(() => n = m(t, 1, "tsq small svelte-id2g6u", null, n, { checked: H(r).task === "x" })), X(e, t);
				};
				O(s, (e) => {
					H(r).task !== void 0 && e(l);
				});
				var u = k(s, 1, !0);
				c(a), c(i), N(() => {
					o = m(a, 1, "lk svelte-id2g6u", null, o, { done: H(r).task === "x" }), n(a, "title", H(r).path), e(u, H(r).title);
				}), Y("click", a, () => ne(H(r))), X(t, i);
			}), c(a), c(r), X(t, r);
		};
		O(me, (e) => {
			H(ee)?.note?.links.length && e(he);
		});
		var ge = k(me, 2), _e = (t) => {
			var i = un(), a = W(i);
			B(a, {
				name: "backlink",
				size: 14
			});
			var o = k(a, 2);
			p(o, 23, () => H(D).slice(0, 6), (e, t) => e.source + ":" + e.line + ":" + t, (t, i) => {
				var a = ln(), o = W(a), s = L(o, !0);
				c(a), N((t) => {
					n(o, "title", H(i).context), e(s, t);
				}, [() => H(i).source.split("/").pop()?.replace(/\.md$/, "")]), Y("click", o, () => {
					r.cal.atlas.open(H(i).source, H(i).line), r.onclose();
				}), X(t, a);
			}), c(o), c(i), X(t, i);
		};
		O(ge, (e) => {
			H(D).length && e(_e);
		});
		var ve = k(ge, 2), Z = (e) => {
			var t = dn(), n = W(t);
			B(n, {
				name: "note",
				size: 14
			}), T(), c(t), Y("click", t, () => {
				r.cal.atlas.open(H(E)), r.onclose();
			}), X(e, t);
		}, be = (e) => {
			var t = fn(), n = W(t);
			B(n, {
				name: "note",
				size: 14
			}), T(), c(t), N(() => t.disabled = H(te)), Y("click", t, M), X(e, t);
		}, xe = Q(() => a().calendar !== "notes" && !a().uid.startsWith("pending-"));
		O(ve, (e) => {
			H(E) ? e(Z) : H(xe) && e(be, 1);
		});
		var Se = k(ve, 2), $ = (t) => {
			var r = pn(), i = W(r);
			B(i, {
				name: "link",
				size: 14
			});
			var o = k(i), s = L(o, !0);
			c(r), N(() => {
				n(o, "href", a().url), e(s, a().url);
			}), X(t, r);
		};
		O(Se, (e) => {
			a().url && e($);
		}), N((t, n) => {
			y = u(v, "", y, { "--c": t }), S = m(x, 1, "svelte-id2g6u", null, S, { cancel: a().status === "CANCELLED" }), e(C, a().summary || "(no title)"), e(j, n), e(J, `${a().calendar_name ?? ""}${a().writable ? "" : " · read-only"}`);
		}, [() => a().color ?? r.cal.colorOf(a().calendar), () => s(a(), r.cal.h12)]), Y("click", h, function(...e) {
			r.onclose?.apply(this, e);
		}), X(t, i);
	}, le = (t) => {
		var n = hn(), i = z(n), a = W(i), o = W(a);
		B(o, {
			name: "x",
			size: 15
		}), c(a), c(i);
		var s = k(i, 2);
		Ce(s), l(s, (e) => $(v, e), () => H(v));
		var u = k(s, 2), d = L(u, !0), f = k(u, 2), p = W(f);
		B(p, {
			name: "calendar",
			size: 14
		});
		var m = k(p), _ = (e) => {
			Ut(e, {
				get cal() {
					return r.cal;
				},
				get value() {
					return H(g);
				},
				set value(e) {
					$(g, e, !0);
				}
			});
		}, y = (e) => {
			var t = A("No calendar to write to");
			X(e, t);
		};
		O(m, (e) => {
			H(g) ? e(_) : e(y, -1);
		}), c(f);
		var b = k(f, 2), S = W(b), C = k(S, 2);
		c(b), N(() => {
			e(d, H(I)), C.disabled = !H(g);
		}), Y("click", a, function(...e) {
			r.onclose?.apply(this, e);
		}), Y("keydown", s, (e) => {
			e.key === "Enter" ? (e.preventDefault(), w()) : e.key === "Escape" && (e.stopPropagation(), r.onclose());
		}), x(s, () => H(h), (e) => $(h, e)), Y("click", S, () => r.onmore(H(h), H(g))), Y("click", C, w), X(t, n);
	};
	O(se, (e) => {
		a()?.task ? e(ce) : a() ? e(U, 1) : d() && e(le, 2);
	}), c(R), l(R, (e) => $(f, e), () => H(f)), N(() => {
		n(R, "aria-label", a() ? a().summary : "New event"), oe = u(R, "", oe, {
			left: `${H(b).left ?? ""}px`,
			top: `${H(b).top ?? ""}px`
		});
	}), X(t, R), i();
}
K(["click", "keydown"]);
//#endregion
//#region plugins/stable/dav/ui/src/Editor.svelte
var yn = J("<div class=\"scrim svelte-aeatm8\" role=\"presentation\"></div>"), bn = J("<header class=\"svelte-aeatm8\"><h2 class=\"svelte-aeatm8\"> </h2> <button class=\"tool svelte-aeatm8\" aria-label=\"Close\"><!></button></header>"), xn = J("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Starts at\"/>"), Sn = J("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Ends at\"/>"), Cn = J("<option> </option>"), wn = J("<div class=\"row svelte-aeatm8\"><!><span class=\"guests svelte-aeatm8\"> <span class=\"faint svelte-aeatm8\"> </span></span></div>"), Tn = J("<div class=\"row svelte-aeatm8\"><!><input placeholder=\"Add guests (addresses, comma-separated): it becomes a meeting\" aria-label=\"Guests\" class=\"svelte-aeatm8\"/></div>"), En = J("<div class=\"atlas-notice error\"> </div>"), Dn = J("<!> <div tabindex=\"-1\"><!> <input class=\"title svelte-aeatm8\" placeholder=\"Add a title\" aria-label=\"Title\"/> <div class=\"row when svelte-aeatm8\"><!> <div class=\"times svelte-aeatm8\"><input type=\"date\" aria-label=\"Starts on\" class=\"svelte-aeatm8\"/> <!> <span class=\"to svelte-aeatm8\">to</span> <!> <input type=\"date\" aria-label=\"Ends on\" class=\"svelte-aeatm8\"/> <label class=\"check svelte-aeatm8\"><input type=\"checkbox\" class=\"svelte-aeatm8\"/> All day</label></div></div> <div class=\"row svelte-aeatm8\"><!> <select aria-label=\"Repeat\" class=\"svelte-aeatm8\"></select></div> <div class=\"row svelte-aeatm8\"><!><input placeholder=\"Add a place\" aria-label=\"Place\" class=\"svelte-aeatm8\"/></div> <div class=\"row svelte-aeatm8\"><!> <!></div> <!> <div class=\"row top svelte-aeatm8\"><!><textarea rows=\"5\" placeholder=\"Add a description\" aria-label=\"Description\" class=\"svelte-aeatm8\"></textarea></div> <p class=\"zone svelte-aeatm8\"> </p> <!> <footer class=\"svelte-aeatm8\"><span class=\"hint svelte-aeatm8\">Ctrl+Enter saves</span> <button class=\"atlas-btn\">Cancel</button> <button class=\"atlas-btn primary\">Save</button></footer></div>", 1), On = {
	hash: "svelte-aeatm8",
	code: ".scrim.svelte-aeatm8 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 55%, transparent);z-index:70;}.ed.svelte-aeatm8 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(620px, calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:12px 18px 16px;display:grid;gap:12px;}.ed.bare.svelte-aeatm8 {position:static;transform:none;width:auto;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;background:var(--bg);padding:16px;align-content:start;}header.svelte-aeatm8 {display:flex;align-items:center;}h2.svelte-aeatm8 {flex:1;margin:0;font-size:0.85em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.tool.svelte-aeatm8 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;}.tool.svelte-aeatm8:hover {background:var(--bg-hover);}.title.svelte-aeatm8 {all:unset;font-size:1.35em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--border-strong);padding:4px 0;}.title.svelte-aeatm8:focus {border-bottom-color:var(--accent);}.title.svelte-aeatm8:focus-visible {outline:none;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8) {appearance:none;-webkit-appearance:none;padding-right:28px;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8):disabled {opacity:0.6;}.row.svelte-aeatm8 {display:flex;gap:12px;align-items:center;color:var(--text-faint);min-width:0;}.row.top.svelte-aeatm8 {align-items:flex-start;}.times.svelte-aeatm8 {display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.to.svelte-aeatm8 {color:var(--text-muted);}input.svelte-aeatm8:not(.title):not([type=checkbox]), select.svelte-aeatm8, textarea.svelte-aeatm8 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 8px;min-width:0;color-scheme:light dark;}.row.svelte-aeatm8 > input:where(.svelte-aeatm8), .row.svelte-aeatm8 > select:where(.svelte-aeatm8), textarea.svelte-aeatm8 {flex:1;}textarea.svelte-aeatm8 {resize:vertical;}input.svelte-aeatm8:focus-visible, select.svelte-aeatm8:focus-visible, textarea.svelte-aeatm8:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.hm.svelte-aeatm8 {width:5.5em;font-variant-numeric:tabular-nums;text-align:center;}.check.svelte-aeatm8 {display:flex;gap:6px;align-items:center;color:var(--text);margin-left:6px;}.guests.svelte-aeatm8 {color:var(--text);}.faint.svelte-aeatm8 {color:var(--text-faint);}.zone.svelte-aeatm8 {margin:0;color:var(--text-faint);font-size:0.82em;}footer.svelte-aeatm8 {display:flex;gap:8px;align-items:center;justify-content:flex-end;}.hint.svelte-aeatm8 {flex:1;color:var(--text-faint);font-size:0.82em;}"
};
function kn(t, a) {
	be(a, !0), pe(t, On);
	let o = y(a, "e", 3, null), s = y(a, "title", 3, ""), u = y(a, "guests", 19, () => []), f = y(a, "description", 3, ""), g = y(a, "calendar", 3, ""), v = y(a, "frame", 3, "sheet"), b = Z({
		summary: o()?.summary ?? s(),
		all_day: a.allDay,
		sday: a.start.slice(0, 10),
		stime: a.start.slice(11, 16) || "09:00",
		eday: a.end.slice(0, 10),
		etime: a.end.slice(11, 16) || "10:00",
		location: o()?.location ?? "",
		description: o()?.description ?? f(),
		rrule: o()?.rrule ?? "",
		calendar: o()?.calendar ?? (g() || a.cal.newCalendar()) ?? ""
	}), S = (o()?.attendees ?? []).map((e) => e.email).join(", "), w = j(Z(o() ? S : u().join(", "))), te = Q(() => new Set(a.cal.accounts.map((e) => (e.user ?? "").toLowerCase()).filter((e) => e.includes("@")))), E = Q(() => !!o()?.organizer?.email && !H(te).has(o().organizer.email.toLowerCase())), D = () => H(w).split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes("@")), ne = j(void 0), A = j("");
	_(() => H(ne)?.focus());
	let re = Q(() => {
		let e = r(/* @__PURE__ */ new Date(`${b.sday}T12:00`));
		return b.rrule && !e.some((e) => e.value === b.rrule) && e.push({
			value: b.rrule,
			label: ye(b.rrule) || b.rrule
		}), e;
	}), ie = Q(() => a.cal.writable());
	function P() {
		return {
			start: b.all_day ? b.sday : `${b.sday}T${b.stime}`,
			end: b.all_day ? (() => {
				let e = M(/* @__PURE__ */ new Date(`${b.eday}T12:00`), 1);
				return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
			})() : `${b.eday}T${b.etime}`
		};
	}
	async function F() {
		let { start: e, end: t } = P();
		if (t <= e && !(b.all_day && t > e)) {
			$(A, "The end is before the start.");
			return;
		}
		let n = H(w).split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
		if (n.length) {
			$(A, `Not an address: ${n.join(", ")}`);
			return;
		}
		let r = !H(E) && H(w) !== S ? D() : void 0, i = {
			summary: b.summary,
			start: e,
			end: t,
			all_day: b.all_day,
			location: b.location,
			description: b.description,
			rrule: b.rrule,
			attendees: r
		};
		if (!o()) {
			a.onclose(), await a.cal.create({
				...i,
				calendar: b.calendar || void 0
			});
			return;
		}
		let s = await a.cal.askScope(o(), "Change");
		s && (a.onclose(), await a.cal.change(o(), {
			...i,
			move_to: b.calendar && b.calendar !== o().calendar ? b.calendar : void 0,
			from_start: o().start
		}, s, "Saved"));
	}
	function ae(e) {
		e.key === "Escape" ? (e.stopPropagation(), a.onclose()) : e.key === "Enter" && (e.ctrlKey || e.metaKey) && (e.preventDefault(), F());
	}
	function I(e, t) {
		let n = e.trim().toLowerCase().match(/^(\d{1,2})(?:[:h.]?(\d{2}))?\s*(am|pm|h)?$/);
		if (!n) return t;
		let r = Number(n[1]), i = Number(n[2] ?? 0);
		return n[3] === "pm" && r < 12 && (r += 12), n[3] === "am" && r === 12 && (r = 0), r > 23 || i > 59 ? t : `${String(r).padStart(2, "0")}:${String(i).padStart(2, "0")}`;
	}
	function R() {
		if (`${b.eday}T${b.etime}` <= `${b.sday}T${b.stime}` && (b.eday = b.sday, !b.all_day)) {
			let [e, t] = b.stime.split(":").map(Number);
			b.etime = `${String(Math.min(23, e + 1)).padStart(2, "0")}:${String(t).padStart(2, "0")}`;
		}
	}
	var oe = Dn(), se = z(oe), V = (e) => {
		var t = yn();
		Y("click", t, function(...e) {
			a.onclose?.apply(this, e);
		}), X(e, t);
	};
	O(se, (e) => {
		v() === "sheet" && e(V);
	});
	var ce = k(se, 2);
	let U;
	var le = W(ce), ue = (t) => {
		var n = bn(), r = W(n), i = L(r, !0), s = k(r, 2), l = W(s);
		B(l, { name: "x" }), c(s), c(n), N(() => e(i, o() ? "Edit event" : "New event")), Y("click", s, function(...e) {
			a.onclose?.apply(this, e);
		}), X(t, n);
	};
	O(le, (e) => {
		v() === "sheet" && e(ue);
	});
	var G = k(le, 2);
	Ce(G), l(G, (e) => $(ne, e), () => H(ne));
	var K = k(G, 2), de = W(K);
	B(de, { name: "clock" });
	var fe = k(de, 2), q = W(fe);
	Ce(q);
	var J = k(q, 2), me = (e) => {
		var t = xn();
		Ce(t), Y("change", t, () => {
			b.stime = I(b.stime, "09:00"), R();
		}), x(t, () => b.stime, (e) => b.stime = e), X(e, t);
	};
	O(J, (e) => {
		b.all_day || e(me);
	});
	var he = k(J, 4), ge = (e) => {
		var t = Sn();
		Ce(t), Y("change", t, () => b.etime = I(b.etime, "10:00")), x(t, () => b.etime, (e) => b.etime = e), X(e, t);
	};
	O(he, (e) => {
		b.all_day || e(ge);
	});
	var _e = k(he, 2);
	Ce(_e);
	var ve = k(_e, 2), xe = W(ve);
	Ce(xe), T(), c(ve), c(fe), c(K);
	var Se = k(K, 2), we = W(Se);
	B(we, { name: "repeat" });
	var Te = k(we, 2);
	p(Te, 21, () => H(re), (e) => e.value, (t, n) => {
		var r = Cn(), i = L(r, !0), a = {};
		N(() => {
			e(i, H(n).label), a !== (a = H(n).value) && (r.value = (r.__value = a) ?? "");
		}), X(t, r);
	}), c(Te), ee(Te), c(Se);
	var Ee = k(Se, 2), De = W(Ee);
	B(De, { name: "pin" });
	var Oe = k(De);
	Ce(Oe), c(Ee);
	var ke = k(Ee, 2), Ae = W(ke);
	B(Ae, { name: "calendar" });
	var je = k(Ae, 2);
	{
		let e = Q(() => !!o() && o().recurring);
		Ut(je, {
			get cal() {
				return a.cal;
			},
			get disabled() {
				return H(e);
			},
			get value() {
				return b.calendar;
			},
			set value(e) {
				b.calendar = e;
			}
		});
	}
	c(ke);
	var Me = k(ke, 2), Ne = (t) => {
		var n = wn(), r = W(n);
		B(r, { name: "people" });
		var i = k(r), a = W(i), s = k(a), l = L(s);
		c(i), c(n), N((t) => {
			e(a, `${t ?? ""} `), e(l, `· organised by ${o()?.organizer?.name ?? o()?.organizer?.email ?? ""}`);
		}, [() => (o()?.attendees ?? []).map((e) => e.name ?? e.email).join(", ")]), X(t, n);
	}, Pe = (e) => {
		var t = Tn(), n = W(t);
		B(n, { name: "people" });
		var r = k(n);
		Ce(r), c(t), x(r, () => H(w), (e) => $(w, e)), X(e, t);
	};
	O(Me, (e) => {
		H(E) ? e(Ne) : e(Pe, -1);
	});
	var Fe = k(Me, 2), Ie = W(Fe);
	B(Ie, { name: "text" });
	var Le = k(Ie);
	C(Le), c(Fe);
	var Re = k(Fe, 2), ze = L(Re), Be = k(Re, 2), Ve = (t) => {
		var n = En(), r = L(n, !0);
		N(() => e(r, H(A))), X(t, n);
	};
	O(Be, (e) => {
		H(A) && e(Ve);
	});
	var He = k(Be, 2), Ue = k(W(He), 2), We = k(Ue, 2);
	c(He), c(ce), N((t) => {
		U = m(ce, 1, "ed svelte-aeatm8", null, U, { bare: v() === "dialog" }), n(ce, "role", v() === "sheet" ? "dialog" : "form"), n(ce, "aria-label", o() ? "Edit event" : "New event"), n(ce, "aria-modal", v() === "sheet" ? "true" : void 0), e(ze, `Times in your zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""}${t ?? ""}`), We.disabled = !H(ie).length;
	}, [() => o()?.tzid && o().tzid !== Intl.DateTimeFormat().resolvedOptions().timeZone ? ` · written in ${o().tzid}` : ""]), Y("keydown", ce, ae), x(G, () => b.summary, (e) => b.summary = e), Y("change", q, R), x(q, () => b.sday, (e) => b.sday = e), x(_e, () => b.eday, (e) => b.eday = e), h(xe, () => b.all_day, (e) => b.all_day = e), d(Te, () => b.rrule, (e) => b.rrule = e), x(Oe, () => b.location, (e) => b.location = e), x(Le, () => b.description, (e) => b.description = e), Y("click", Ue, function(...e) {
		a.onclose?.apply(this, e);
	}), Y("click", We, F), X(t, oe), i();
}
K([
	"click",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/Toasts.svelte
var An = J("<button class=\"svelte-osdry5\"> </button>"), jn = J("<button class=\"svelte-osdry5\">Undo</button>"), Mn = J("<div><span class=\"text svelte-osdry5\"> </span> <!> <!> <button class=\"x svelte-osdry5\" aria-label=\"Close\">×</button></div>"), Nn = J("<div class=\"toasts svelte-osdry5\" aria-live=\"polite\"></div>"), Pn = {
	hash: "svelte-osdry5",
	code: ".toasts.svelte-osdry5 {position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:60;display:grid;gap:8px;justify-items:center;pointer-events:none;width:min(560px, calc(100% - 32px));}.toast.svelte-osdry5 {pointer-events:auto;display:flex;align-items:center;gap:12px;padding:9px 10px 9px 14px;border-radius:var(--radius);background:var(--heading);color:var(--bg);box-shadow:var(--shadow-md, var(--shadow-sm));max-width:100%; animation: svelte-osdry5-in 120ms var(--ease);}.toast.error.svelte-osdry5 {background:var(--red);color:#fff;}.text.svelte-osdry5 {min-width:0;overflow-wrap:anywhere;}button.svelte-osdry5 {all:unset;cursor:pointer;font-weight:700;color:var(--accent);padding:2px 6px;border-radius:var(--radius-sm);}.error.svelte-osdry5 button:where(.svelte-osdry5) {color:#fff;text-decoration:underline;}button.svelte-osdry5:hover {background:color-mix(in srgb, currentColor 14%, transparent);}button.svelte-osdry5:focus-visible {outline:2px solid currentColor;}.x.svelte-osdry5 {color:inherit;opacity:0.7;font-weight:400;}\n  @keyframes svelte-osdry5-in { from { opacity: 0; transform: translateY(6px); } }\n  @media (prefers-reduced-motion: reduce) {.toast.svelte-osdry5 { animation: none;} }"
};
function Fn(t, r) {
	be(r, !0), pe(t, Pn);
	var a = Nn();
	p(a, 21, () => r.cal.toasts, (e) => e.id, (t, i) => {
		var a = Mn();
		let o;
		var s = W(a), l = L(s, !0), u = k(s, 2), d = (t) => {
			var n = An(), a = L(n, !0);
			N(() => e(a, H(i).action.label)), Y("click", n, async () => {
				r.cal.dismiss(H(i).id), await H(i).action?.run();
			}), X(t, n);
		};
		O(u, (e) => {
			H(i).action && e(d);
		});
		var f = k(u, 2), p = (e) => {
			var t = jn();
			Y("click", t, async () => {
				r.cal.dismiss(H(i).id), await H(i).undo?.();
			}), X(e, t);
		};
		O(f, (e) => {
			H(i).undo && e(p);
		});
		var h = k(f, 2);
		c(a), N(() => {
			o = m(a, 1, "toast svelte-osdry5", null, o, { error: H(i).kind === "error" }), n(a, "role", H(i).kind === "error" ? "alert" : "status"), e(l, H(i).text);
		}), Y("click", h, () => r.cal.dismiss(H(i).id)), X(t, a);
	}), c(a), X(t, a), i();
}
K(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/keys.ts
var In = (e) => (t) => t.setView(e), Ln = [
	{
		id: "day",
		title: "Day",
		group: "Views",
		keys: "d, 1",
		run: In("day")
	},
	{
		id: "week",
		title: "Week",
		group: "Views",
		keys: "w, 2",
		run: In("week")
	},
	{
		id: "workweek",
		title: "Work week",
		group: "Views",
		keys: "x, 3",
		run: In("workweek")
	},
	{
		id: "month",
		title: "Month",
		group: "Views",
		keys: "m, 4",
		run: In("month")
	},
	{
		id: "agenda",
		title: "Agenda (schedule)",
		group: "Views",
		keys: "a, 5",
		run: In("agenda")
	},
	{
		id: "year",
		title: "Year",
		group: "Views",
		keys: "y, 6",
		run: In("year")
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
function Rn(e) {
	let t = e.key.toLowerCase(), n = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
	return [...[
		e.ctrlKey || e.metaKey ? "ctrl" : "",
		e.altKey ? "alt" : "",
		e.shiftKey && !n ? "shift" : ""
	].filter(Boolean), t].join("+");
}
var zn = new Map(Ln.flatMap((e) => (e.keys ?? "").split(",").map((e) => e.trim()).filter(Boolean).map((t) => [t, e])));
function Bn(e) {
	return e ? e.split(",").map((e) => e.trim()).filter(Boolean).slice(0, 2).map((e) => e.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowright", "→").replace("arrowleft", "←").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("backspace", "⌫").replace(/^(⇧)?([a-z])$/, (e, t, n) => t ? `⇧${n.toUpperCase()}` : n)) : [];
}
//#endregion
//#region plugins/stable/dav/ui/src/Shortcuts.svelte
var Vn = J("<kbd class=\"svelte-17nm084\"> </kbd>"), Hn = J("<div class=\"row svelte-17nm084\"><span> </span><span class=\"keys svelte-17nm084\"></span></div>"), Un = J("<section><h3 class=\"svelte-17nm084\"> </h3> <!></section>"), Wn = J("<div class=\"scrim svelte-17nm084\" role=\"presentation\"></div> <div class=\"sheet svelte-17nm084\" role=\"dialog\" aria-label=\"Keyboard shortcuts\" aria-modal=\"true\"><header class=\"svelte-17nm084\"><h2 class=\"svelte-17nm084\">Keyboard shortcuts</h2><button class=\"x svelte-17nm084\" aria-label=\"Close\">×</button></header> <div class=\"cols svelte-17nm084\"></div> <p class=\"hint svelte-17nm084\">Drag on the grid to make an event, drag one to move it, its lower edge to resize (15-minute steps). Esc cancels a drag.</p></div>", 1), Gn = {
	hash: "svelte-17nm084",
	code: ".scrim.svelte-17nm084 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 50%, transparent);z-index:70;}.sheet.svelte-17nm084 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(760px, calc(100% - 32px));max-height:calc(100% - 40px);overflow:auto;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 30px rgba(0,0,0,.3));padding:14px 18px;}header.svelte-17nm084 {display:flex;align-items:center;}h2.svelte-17nm084 {margin:0;flex:1;font-size:1.1em;color:var(--heading);}h3.svelte-17nm084 {margin:10px 0 4px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.cols.svelte-17nm084 {display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:4px 24px;}.row.svelte-17nm084 {display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:var(--text-muted);}.keys.svelte-17nm084 {display:flex;gap:4px;}kbd.svelte-17nm084 {font:600 0.85em var(--font-mono);padding:1px 6px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);}.hint.svelte-17nm084 {color:var(--text-faint);font-size:0.86em;margin:12px 0 0;}.x.svelte-17nm084 {all:unset;cursor:pointer;font-size:1.3em;padding:0 6px;color:var(--text-muted);}"
};
function Kn(t, n) {
	be(n, !0), pe(t, Gn);
	let r = [...new Set(Ln.map((e) => e.group))];
	var a = Wn(), o = z(a), s = k(o, 2), l = W(s), u = k(W(l));
	c(l);
	var d = k(l, 2);
	p(d, 20, () => r, (e) => e, (t, n) => {
		var r = Un(), i = W(r), a = L(i, !0), o = k(i, 2);
		p(o, 17, () => Ln.filter((e) => e.group === n && e.keys), (e) => e.id, (t, n) => {
			var r = Hn(), i = W(r), a = L(i, !0), o = k(i);
			p(o, 20, () => Bn(H(n).keys), (e) => e, (t, n) => {
				var r = Vn(), i = L(r, !0);
				N(() => e(i, n)), X(t, r);
			}), c(o), c(r), N(() => e(a, H(n).title)), X(t, r);
		}), c(r), N(() => e(a, n)), X(t, r);
	}), c(d), T(2), c(s), Y("click", o, function(...e) {
		n.onclose?.apply(this, e);
	}), Y("click", u, function(...e) {
		n.onclose?.apply(this, e);
	}), X(t, a), i();
}
K(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/App.svelte
var qn = J("<button class=\"tool svelte-1i74804\" title=\"Side panel (s)\" aria-label=\"Side panel\"><!></button>"), Jn = J("<span class=\"spin svelte-1i74804\" aria-label=\"Working\"></span>"), Yn = J("<option> </option>"), Xn = J("<select class=\"vsel svelte-1i74804\" aria-label=\"View\"></select>"), Zn = J("<button> </button>"), Qn = J("<div class=\"seg svelte-1i74804\" role=\"group\" aria-label=\"View\"></div>"), $n = J("<button class=\"tool svelte-1i74804\" title=\"Sync now (r)\" aria-label=\"Sync\"><!></button> <button class=\"tool svelte-1i74804\" title=\"All commands (Ctrl+K)\" aria-label=\"All commands\"><!></button>", 1), er = J("<span class=\"qprev svelte-1i74804\"><b class=\"svelte-1i74804\"> </b> </span>"), tr = J("<div class=\"quick svelte-1i74804\"><!> <input placeholder=\"lunch with Ana tomorrow 13:00 · examen 15 nov · réunion lundi à 10h @ D3\" aria-label=\"Quick add\" class=\"svelte-1i74804\"/> <!> <!> <button class=\"atlas-btn primary\">Add</button></div>"), nr = J("<div class=\"placing svelte-1i74804\" role=\"status\"><span class=\"tbox svelte-1i74804\" aria-hidden=\"true\"></span> <span class=\"ptext svelte-1i74804\">Time-block <b> </b>: drag over the hours it takes, or click where it starts</span> <button class=\"atlas-btn\">Cancel</button></div>"), rr = J("<aside class=\"side svelte-1i74804\" aria-label=\"Calendars\"><!></aside>"), ir = J("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button><button class=\"atlas-btn\">Settings…</button></div></div>"), ar = J("<div class=\"atlas-notice\">No calendar account yet: add one in Settings (its server address, user name and app password; as many as you have) — or subscribe to a public calendar there.<div class=\"actions\"><button class=\"atlas-btn primary\">Settings…</button></div></div>"), or = J("<button class=\"fab svelte-1i74804\" aria-label=\"New event\" title=\"New event (c)\"><!></button>"), sr = J("<div class=\"popscrim svelte-1i74804\" role=\"presentation\"></div> <!>", 1), cr = J("<div tabindex=\"-1\" role=\"application\" aria-label=\"Calendar\"><header class=\"top svelte-1i74804\"><!> <button class=\"atlas-btn today svelte-1i74804\" title=\"Today (t)\">Today</button> <div class=\"nav svelte-1i74804\"><button class=\"tool svelte-1i74804\" title=\"Previous (k)\" aria-label=\"Previous\"><!></button> <button class=\"tool svelte-1i74804\" title=\"Next (j)\" aria-label=\"Next\"><!></button></div> <h1 class=\"svelte-1i74804\"> </h1> <!> <span class=\"grow svelte-1i74804\"></span> <div><!> <input aria-label=\"Search events\" class=\"svelte-1i74804\"/></div> <!> <button class=\"tool svelte-1i74804\" title=\"Quick add in words (q)\" aria-label=\"Quick add\"><!></button> <!></header> <!> <!> <div class=\"body svelte-1i74804\"><!> <main class=\"view svelte-1i74804\"><!> <!></main></div> <!> <!> <!> <!> <!></div>"), lr = {
	hash: "svelte-1i74804",
	code: ".calendar.svelte-1i74804:focus {outline:none;}.calendar.svelte-1i74804 {position:relative;height:100%;display:grid;grid-template-rows:auto auto 1fr;color:var(--text);background:var(--bg);font-size:calc(14px * var(--ui-scale, 1));container-type:inline-size;overflow:hidden;}.top.svelte-1i74804 {grid-row:1;display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);min-width:0;}h1.svelte-1i74804 {margin:0 0 0 4px;font-size:1.2em;font-weight:600;color:var(--heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:6em;flex:0 1 auto;}.nav.svelte-1i74804 {display:flex;}.grow.svelte-1i74804 {flex:1;}.today.svelte-1i74804 {flex:none;}.tool.svelte-1i74804 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;flex:none;}.tool.svelte-1i74804:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-1i74804:focus-visible, .seg.svelte-1i74804 button:where(.svelte-1i74804):focus-visible, .fab.svelte-1i74804:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.search.svelte-1i74804 {display:flex;align-items:center;gap:6px;background:var(--bg-hover);border:1px solid transparent;border-radius:var(--radius);padding:0 8px;color:var(--text-faint);width:200px;flex:0 1 auto;min-width:70px;}.search.svelte-1i74804:focus-within, .search.on.svelte-1i74804 {border-color:var(--accent);background:var(--bg);color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1;min-width:0;padding:6px 0;color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.seg.svelte-1i74804 {display:flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;flex:none;}.seg.svelte-1i74804 button:where(.svelte-1i74804) {all:unset;cursor:pointer;padding:4px 10px;font-size:0.86em;color:var(--text-muted);}.seg.svelte-1i74804 button:where(.svelte-1i74804) + button:where(.svelte-1i74804) {border-left:1px solid var(--border);}.seg.svelte-1i74804 button:where(.svelte-1i74804):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-1i74804 button.on:where(.svelte-1i74804) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.vsel.svelte-1i74804 {appearance:none;-webkit-appearance:none;font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:4px 26px 4px 8px;flex:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 14px) 50%, calc(100% - 9px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.spin.svelte-1i74804 {width:12px;height:12px;border-radius:50%;border:2px solid var(--border-strong);border-top-color:var(--accent); animation: svelte-1i74804-spin 0.8s linear infinite;flex:none;}\n  @keyframes svelte-1i74804-spin { to { transform: rotate(360deg); } }\n  @media (prefers-reduced-motion: reduce) {.spin.svelte-1i74804 { animation: none;} }.quick.svelte-1i74804 {grid-row:2;display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--bg-alt);color:var(--accent-strong);min-width:0;flex-wrap:wrap;}.quick.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1 1 260px;min-width:0;color:var(--text);font-size:1.02em;padding:4px 0;}.quick.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.qprev.svelte-1i74804 {color:var(--text-muted);font-size:0.9em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.qprev.svelte-1i74804 b:where(.svelte-1i74804) {color:var(--text);}.body.svelte-1i74804 {grid-row:3;display:flex;min-height:0;}.placing.svelte-1i74804 {grid-row:2;display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--accent-soft);color:var(--text);min-width:0;flex-wrap:wrap;}.ptext.svelte-1i74804 {flex:1 1 240px;min-width:0;overflow-wrap:anywhere;}.placing.svelte-1i74804 .tbox:where(.svelte-1i74804) {width:11px;height:11px;border:1.5px solid var(--accent-strong);border-radius:3px;flex:none;box-sizing:border-box;}.side.svelte-1i74804 {flex:none;width:248px;border-right:1px solid var(--border);background:var(--bg-alt);min-height:0;}.view.svelte-1i74804 {flex:1;min-width:0;min-height:0;position:relative;display:flex;flex-direction:column;}.view.svelte-1i74804 > * {flex:1;min-height:0;}.view.svelte-1i74804 > .atlas-notice {flex:none;margin:10px 14px;}.popscrim.svelte-1i74804 {position:absolute;inset:0;z-index:49;}.fab.svelte-1i74804 {all:unset;cursor:pointer;position:absolute;right:18px;bottom:22px;z-index:40;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--accent);color:var(--accent-fg);box-shadow:var(--shadow-md, 0 6px 18px rgba(0,0,0,.3));}.narrow.svelte-1i74804 .top:where(.svelte-1i74804) {flex-wrap:wrap;row-gap:6px;padding:8px;}.narrow.svelte-1i74804 h1:where(.svelte-1i74804) {order:10;flex-basis:100%;margin:0;font-size:1.05em;}.narrow.svelte-1i74804 .search:where(.svelte-1i74804) {width:auto;flex:1 1 60px;min-width:60px;}\n  @container (max-width: 1100px) {.seg.svelte-1i74804 button:where(.svelte-1i74804) {padding:4px 7px;} }"
};
function ur(r, s) {
	be(s, !0), pe(r, lr);
	let u = new Ae(s.atlas), d = j(1200), h = j(void 0);
	ae(() => H(h) ? u.steps.attach(H(h)) : void 0);
	let v = j(!0), y = j(!1), b = j(void 0), C = j(""), w = j(!1), D = j(""), ne = j(void 0), A = j(null), ie = j(""), P = j(null), I = j(null), R = Q(() => H(d) < 700), oe = Q(() => !H(R) && H(d) >= 900 && H(v)), se = Q(() => u.shown());
	ae(() => {
		u.narrow !== H(R) && (u.narrow = H(R), u.load());
	});
	let ce = [
		["day", "Day"],
		["week", "Week"],
		["workweek", "Work week"],
		["month", "Month"],
		["agenda", "Agenda"],
		["year", "Year"]
	], U = Q(() => H(P)?.e ?? null), le = () => H(h)?.getBoundingClientRect() ?? new DOMRect(0, 0, H(d), 800);
	function G(e, t) {
		$(P, {
			e,
			at: t
		}, !0), $(I, null);
	}
	function K(e, t) {
		if (typeof s.atlas.shell.popMenu != "function") return;
		let n = t.currentTarget.getBoundingClientRect(), r = e.task?.path ?? S(e) ?? void 0, i = e.task ? [] : [
			{
				label: "Show",
				icon: "calendar",
				run: () => G(e, n)
			},
			{
				label: "Edit…",
				icon: "pen",
				disabled: !e.writable,
				run: () => J(e)
			},
			{
				label: "Duplicate",
				icon: "copy",
				run: () => void u.duplicate(e)
			},
			null,
			{
				label: "Delete",
				icon: "trash",
				danger: !0,
				disabled: !e.writable,
				run: () => void u.remove(e)
			}
		];
		s.atlas.shell.popMenu(t, i, {
			path: r,
			openLabel: "Open its note"
		});
	}
	function de(e, t, n, r) {
		if (!u.newCalendar()) {
			u.toast(u.configured ? "No calendar of your accounts takes new events (all read-only?)" : "Add a calendar account in Settings first", "error");
			return;
		}
		$(P, {
			draft: {
				start: e,
				end: t,
				all_day: n
			},
			at: r
		}, !0);
	}
	function q() {
		let e = new Date(u.cursor), n = /* @__PURE__ */ new Date(), r = new Date(e.getFullYear(), e.getMonth(), e.getDate(), n.getHours() + 1, 0);
		$(I, {
			start: t(r),
			end: t(new Date(r.getTime() + 36e5)),
			allDay: !1
		}, !0), $(P, null);
	}
	function J(e = H(P)?.e) {
		if (!e) return;
		if (!e.writable) {
			u.toast(`${e.calendar_name || "This calendar"} is read-only`, "error");
			return;
		}
		let t = Ae.fields(e);
		$(I, {
			e,
			start: t.start,
			end: t.end,
			allDay: e.all_day
		}, !0), $(P, null);
	}
	function me(e, n) {
		let r = H(P)?.draft;
		r && ($(I, r.all_day ? {
			start: g(r.start),
			end: g(M(r.end, -1)),
			allDay: !0,
			title: e,
			calendar: n
		} : {
			start: t(r.start),
			end: t(r.end),
			allDay: !1,
			title: e,
			calendar: n
		}, !0), $(P, null));
	}
	function he() {
		if (H(y)) {
			$(y, !1);
			return;
		}
		if (u.placing) {
			u.placing = null;
			return;
		}
		if (H(I)) {
			$(I, null);
			return;
		}
		if (H(P)) {
			$(P, null);
			return;
		}
		if (H(w)) {
			$(w, !1);
			return;
		}
		u.results && ($(C, ""), u.search(""));
	}
	function ge() {
		s.atlas.pick({
			placeholder: "Go to a date… (2026-12-01, 15 nov, next monday)",
			tag: "Calendar",
			items: [{
				value: g(/* @__PURE__ */ new Date()),
				title: "Today"
			}, {
				value: g(M(/* @__PURE__ */ new Date(), 7)),
				title: "In a week"
			}],
			typed: (e) => `Go to “${e}”`,
			onpick: async (e, t) => {
				if (!t) {
					u.go(/* @__PURE__ */ new Date(`${e}T12:00`));
					return;
				}
				try {
					let t = await F(s.atlas, "quick", { text: e });
					u.go(/* @__PURE__ */ new Date(`${t.start.slice(0, 10)}T12:00`));
				} catch (e) {
					u.toast(e.message, "error");
				}
			}
		});
	}
	function _e() {
		s.atlas.pick({
			placeholder: "Do what? (every command of the Calendar pane)",
			tag: "Calendar",
			items: Ln.filter((e) => e.id !== "palette").map((e) => ({
				value: e.id,
				title: e.title,
				detail: Bn(e.keys).join("  ·  ") || void 0,
				section: e.group
			})),
			onpick: (e) => Ln.find((t) => t.id === e)?.run(u, Z)
		});
	}
	function ve() {
		$(w, !0), $(ie, u.newCalendar() ?? "", !0), $(P, null), setTimeout(() => H(ne)?.focus(), 0);
	}
	let Z = {
		create: q,
		quick: ve,
		edit: () => J(),
		remove: () => {
			let e = H(P)?.e;
			e?.writable && ($(P, null), u.remove(e));
		},
		focusSearch: () => {
			H(b)?.focus(), H(b)?.select();
		},
		help: () => $(y, !H(y)),
		palette: _e,
		goto: ge,
		back: he,
		sidebar: () => $(v, !H(v))
	};
	function ye(e) {
		let t = e.target;
		if (t.closest("input, textarea, select, [contenteditable=true]") || !H(h) || !(H(h).contains(t) || t === document.body || t.classList.contains("dv-content-container") && t.contains(H(h))) || [
			"shift",
			"control",
			"alt",
			"meta"
		].includes(e.key.toLowerCase())) return;
		let n = zn.get(Rn(e));
		n && (n.id !== "delete" && n.id !== "edit" || H(P)?.e) && (e.preventDefault(), e.stopPropagation(), n.run(u, Z));
	}
	let xe;
	function Se() {
		clearTimeout(xe), xe = setTimeout(async () => {
			if (!H(D).trim()) {
				$(A, null);
				return;
			}
			try {
				$(A, await F(s.atlas, "quick", { text: H(D) }), !0);
			} catch {
				$(A, null);
			}
		}, 120);
	}
	async function we() {
		if (!H(D).trim()) return;
		let e = H(A) ?? await F(s.atlas, "quick", { text: H(D) });
		$(w, !1), $(D, ""), $(A, null), await u.create({
			summary: e.title || "(no title)",
			start: e.start,
			end: e.end,
			all_day: e.all_day,
			rrule: e.rrule,
			location: e.location,
			calendar: H(ie) || void 0
		}) && u.go(/* @__PURE__ */ new Date(`${e.start.slice(0, 10)}T12:00`));
	}
	let Te = Q(() => {
		let e = H(A);
		if (!e) return "";
		let t = new Date(e.all_day ? `${e.start}T00:00` : e.start), n = new Date(e.all_day ? `${e.end}T00:00` : e.end), r = t.toLocaleDateString(void 0, {
			weekday: "short",
			day: "numeric",
			month: "short"
		}), i = (e) => V(e, u.h12);
		return e.all_day ? `${r} · all day` : `${r} · ${i(t)} – ${i(n)}`;
	}), Ee;
	function De() {
		clearTimeout(Ee), Ee = setTimeout(() => void u.search(H(C)), 160);
	}
	_(() => {
		H(h)?.focus({ preventScroll: !0 }), (async () => {
			await u.loadSources(), await u.load(), u.sync(!1);
		})();
		let e = [s.atlas.helper.on("changed", () => {
			u.loadSources(), u.later();
		}), s.atlas.helper.on("moved", (e) => {
			for (let t of e.moved ?? []) u.offerMove(t);
		})], t = setInterval(() => u.now = /* @__PURE__ */ new Date(), 3e4), n = (e) => {
			let t = e.detail ?? {};
			t.date ? u.go(/* @__PURE__ */ new Date(`${t.date}T12:00`), t.view) : t.view && u.setView(t.view), t.quick && ve(), t.create && q(), t.place && u.startPlacing(t.place);
		};
		window.addEventListener("atlas-calendar:show", n);
		let r = window.__atlasCalendarShow;
		return r && (n(new CustomEvent("x", { detail: r })), window.__atlasCalendarShow = void 0), () => {
			e.forEach((e) => e()), clearInterval(t), window.removeEventListener("atlas-calendar:show", n);
		};
	});
	var Oe = cr();
	re("keydown", fe, ye);
	let ke;
	var je = W(Oe), Me = W(je), Ne = (e) => {
		var t = qn(), n = W(t);
		B(n, { name: "menu" }), c(t), Y("click", t, () => $(v, !H(v))), X(e, t);
	};
	O(Me, (e) => {
		H(R) || e(Ne);
	});
	var Pe = k(Me, 2), Fe = k(Pe, 2), Ie = W(Fe), Le = W(Ie);
	B(Le, { name: "back" }), c(Ie);
	var Re = k(Ie, 2), ze = W(Re);
	B(ze, { name: "right" }), c(Re), c(Fe);
	var Be = k(Fe, 2), Ve = L(Be, !0), He = k(Be, 2), Ue = (e) => {
		var t = Jn();
		N(() => n(t, "title", u.syncing ? "Syncing with the server" : "Reading")), X(e, t);
	};
	O(He, (e) => {
		(u.loading || u.syncing) && e(Ue);
	});
	var We = k(He, 4);
	let Ge;
	var Ke = W(We);
	B(Ke, {
		name: "search",
		size: 15
	});
	var Je = k(Ke, 2);
	Ce(Je), l(Je, (e) => $(b, e), () => H(b)), c(We);
	var Ye = k(We, 2), Xe = (t) => {
		var n = Xn();
		p(n, 21, () => ce, ([e, t]) => e, (t, n) => {
			var r = Q(() => o(H(n), 2));
			let i = () => H(r)[0], a = () => H(r)[1];
			var s = Yn(), c = L(s, !0), l = {};
			N(() => {
				e(c, a()), l !== (l = i()) && (s.value = (s.__value = l) ?? "");
			}), X(t, s);
		}), c(n);
		var r;
		ee(n), N(() => {
			r !== (r = u.view) && (n.value = (n.__value = r) ?? "", te(n, r));
		}), Y("change", n, (e) => u.setView(e.currentTarget.value)), X(t, n);
	}, Ze = (t) => {
		var r = Qn();
		p(r, 21, () => ce, ([e, t]) => e, (t, r) => {
			var i = Q(() => o(H(r), 2));
			let a = () => H(i)[0], s = () => H(i)[1];
			var c = Zn();
			let l;
			var d = L(c, !0);
			N((t) => {
				n(c, "title", `${s() ?? ""} (${t ?? ""})`), l = m(c, 1, "svelte-1i74804", null, l, { on: u.view === a() }), e(d, s());
			}, [() => Ln.find((e) => e.id === a())?.keys?.split(",")[0]]), Y("click", c, () => u.setView(a())), X(t, c);
		}), c(r), X(t, r);
	};
	O(Ye, (e) => {
		H(d) < 980 ? e(Xe) : e(Ze, -1);
	});
	var Qe = k(Ye, 2), $e = W(Qe);
	B($e, { name: "sparkle" }), c(Qe);
	var et = k(Qe, 2), tt = (e) => {
		var t = $n(), n = z(t), r = W(n);
		B(r, { name: "refresh" }), c(n);
		var i = k(n, 2), a = W(i);
		B(a, { name: "keyboard" }), c(i), Y("click", n, () => u.sync(!0)), Y("click", i, _e), X(e, t);
	};
	O(et, (e) => {
		H(R) || e(tt);
	}), c(je);
	var nt = k(je, 2), rt = (t) => {
		var n = tr(), r = W(n);
		B(r, {
			name: "sparkle",
			size: 15
		});
		var i = k(r, 2);
		Ce(i), l(i, (e) => $(ne, e), () => H(ne));
		var a = k(i, 2), o = (t) => {
			var n = er(), r = W(n), i = L(r, !0), a = k(r);
			c(n), N(() => {
				e(i, H(A).title || "(no title)"), e(a, ` · ${H(Te) ?? ""}${H(A).rrule ? " · repeats" : ""}${H(A).location ? ` · ${H(A).location}` : ""}`);
			}), X(t, n);
		};
		O(a, (e) => {
			H(A) && e(o);
		});
		var s = k(a, 2), d = (e) => {
			Ut(e, {
				get cal() {
					return u;
				},
				compact: !0,
				get value() {
					return H(ie);
				},
				set value(e) {
					$(ie, e, !0);
				}
			});
		};
		O(s, (e) => {
			H(ie) && e(d);
		});
		var f = k(s, 2);
		c(n), N((e) => f.disabled = e, [() => !H(D).trim()]), Y("input", i, Se), Y("keydown", i, (e) => {
			e.key === "Enter" ? (e.preventDefault(), we()) : e.key === "Escape" && (e.stopPropagation(), $(w, !1));
		}), x(i, () => H(D), (e) => $(D, e)), Y("click", f, we), X(t, n);
	};
	O(nt, (e) => {
		H(w) && e(rt);
	});
	var it = k(nt, 2), at = (t) => {
		var n = nr(), r = k(W(n), 2), i = k(W(r)), a = L(i, !0);
		T(), c(r);
		var o = k(r, 2);
		c(n), N(() => e(a, u.placing.title)), Y("click", o, () => u.placing = null), X(t, n);
	};
	O(it, (e) => {
		u.placing && e(at);
	});
	var ot = k(it, 2), st = W(ot), lt = (e) => {
		var t = rr();
		qe(W(t), {
			get cal() {
				return u;
			},
			oncreate: q
		}), c(t), X(e, t);
	};
	O(st, (e) => {
		H(oe) && e(lt);
	});
	var ut = k(st, 2), dt = W(ut), ft = (t) => {
		var n = ir(), r = W(n, !0), i = k(r), a = W(i), o = k(a);
		c(i), c(n), N(() => e(r, u.error)), Y("click", a, () => u.load()), Y("click", o, () => s.atlas.plugin.openSettings()), X(t, n);
	}, pt = (e) => {
		var t = ar(), n = k(W(t)), r = L(n);
		c(t), Y("click", r, () => s.atlas.plugin.openSettings()), X(e, t);
	};
	O(dt, (e) => {
		u.error ? e(ft) : !u.configured && !u.sources.length && e(pt, 1);
	});
	var mt = k(dt, 2), ht = (e) => {
		{
			let t = Q(() => a(/* @__PURE__ */ new Date())), n = Q(() => a(/* @__PURE__ */ new Date()));
			jt(e, {
				get cal() {
					return u;
				},
				get events() {
					return u.results;
				},
				get from() {
					return H(t);
				},
				get to() {
					return H(n);
				},
				get selected() {
					return H(U);
				},
				onselect: G,
				onmenu: K,
				search: !0
			});
		}
	}, gt = (e) => {
		{
			let t = Q(() => u.days());
			vt(e, {
				get cal() {
					return u;
				},
				get days() {
					return H(t);
				},
				get selected() {
					return H(U);
				},
				onselect: G,
				onmenu: K,
				oncreate: de
			});
		}
	}, _t = (e) => {
		{
			let t = Q(() => u.shownEvents()), n = Q(() => u.range().from), r = Q(() => u.range().to);
			jt(e, {
				get cal() {
					return u;
				},
				get events() {
					return H(t);
				},
				get from() {
					return H(n);
				},
				get to() {
					return H(r);
				},
				get selected() {
					return H(U);
				},
				onselect: G,
				onmenu: K
			});
		}
	}, yt = (e) => {
		Rt(e, { get cal() {
			return u;
		} });
	}, bt = (e) => {
		var t = ue(), n = z(t);
		E(n, () => H(se) + u.range().from.getTime(), (e) => {
			{
				let t = Q(() => u.days());
				ct(e, {
					get cal() {
						return u;
					},
					get days() {
						return H(t);
					},
					get selected() {
						return H(U);
					},
					onselect: G,
					onmenu: K,
					oncreate: de
				});
			}
		}), X(e, t);
	};
	O(mt, (e) => {
		u.results ? e(ht) : H(se) === "month" ? e(gt, 1) : H(se) === "agenda" ? e(_t, 2) : H(se) === "year" ? e(yt, 3) : e(bt, -1);
	}), c(ut), c(ot);
	var xt = k(ot, 2), St = (e) => {
		var t = or(), n = W(t);
		B(n, {
			name: "plus",
			size: 22
		}), c(t), Y("click", t, q), X(e, t);
	};
	O(xt, (e) => {
		H(R) && e(St);
	});
	var Ct = k(xt, 2), wt = (e) => {
		var t = sr(), n = z(t), r = k(n, 2);
		E(r, () => H(P), (e) => {
			{
				let t = Q(() => H(P).e ?? null), n = Q(() => H(P).draft ?? null), r = Q(le);
				vn(e, {
					get cal() {
						return u;
					},
					get e() {
						return H(t);
					},
					get draft() {
						return H(n);
					},
					get at() {
						return H(P).at;
					},
					get box() {
						return H(r);
					},
					onedit: () => J(),
					onmore: me,
					onclose: () => $(P, null)
				});
			}
		}), Y("click", n, () => $(P, null)), X(e, t);
	};
	O(Ct, (e) => {
		H(P) && e(wt);
	});
	var Tt = k(Ct, 2), Et = (e) => {
		{
			let t = Q(() => H(I).e ?? null), n = Q(() => H(I).title ?? ""), r = Q(() => H(I).calendar ?? "");
			kn(e, {
				get cal() {
					return u;
				},
				get e() {
					return H(t);
				},
				get start() {
					return H(I).start;
				},
				get end() {
					return H(I).end;
				},
				get allDay() {
					return H(I).allDay;
				},
				get title() {
					return H(n);
				},
				get calendar() {
					return H(r);
				},
				onclose: () => $(I, null)
			});
		}
	};
	O(Tt, (e) => {
		H(I) && e(Et);
	});
	var Dt = k(Tt, 2), Ot = (e) => {
		Kn(e, { onclose: () => $(y, !1) });
	};
	O(Dt, (e) => {
		H(y) && e(Ot);
	}), Fn(k(Dt, 2), { get cal() {
		return u;
	} }), c(Oe), l(Oe, (e) => $(h, e), () => H(h)), N((t, r) => {
		ke = m(Oe, 1, "calendar svelte-1i74804", null, ke, { narrow: H(R) }), n(Be, "title", t), e(Ve, r), Ge = m(We, 1, "search svelte-1i74804", null, Ge, { on: !!H(C) }), n(Je, "placeholder", H(R) ? "" : "Search events");
	}, [() => u.title(), () => u.title()]), Y("pointerdown", Oe, (e) => {
		e.target.closest("input, textarea, select, button, [tabindex='0']") || H(h)?.focus({ preventScroll: !0 });
	}), Y("click", Pe, () => u.today()), Y("click", Ie, () => u.step(-1)), Y("click", Re, () => u.step(1)), Y("input", Je, De), Y("keydown", Je, (e) => {
		e.key === "Escape" && ($(C, ""), u.search(""), H(b)?.blur());
	}), x(Je, () => H(C), (e) => $(C, e)), Y("click", Qe, ve), f(Oe, "clientWidth", (e) => $(d, e)), X(r, Oe), i();
}
K([
	"pointerdown",
	"click",
	"input",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/NewEvent.svelte
var dr = J("<div class=\"none svelte-19uhe47\"><p class=\"svelte-19uhe47\">No calendar to write to: add an account (CalDAV, or Outlook / Microsoft 365) in the Calendar's settings.</p> <button class=\"atlas-btn\">Open its settings</button></div>"), fr = J("<p class=\"none svelte-19uhe47\">Loading the calendars…</p>"), pr = {
	hash: "svelte-19uhe47",
	code: ".none.svelte-19uhe47 {padding:16px;display:grid;gap:10px;justify-items:start;color:var(--text-muted);margin:0;}.none.svelte-19uhe47 p:where(.svelte-19uhe47) {margin:0;}"
};
function mr(e, n) {
	be(n, !0), pe(e, pr);
	let r = y(n, "seed", 19, () => ({})), a = _e(() => new Ae(n.atlas));
	a.toast = (e, t) => n.atlas.toast("Calendar", e, t === "error" ? "error" : "success");
	let o = j(!1);
	a.loadSources().then(() => $(o, !0));
	let s = /* @__PURE__ */ new Date(), l = new Date(s.getFullYear(), s.getMonth(), s.getDate(), s.getHours() + 1, 0);
	var u = ue(), d = z(u), f = (e) => {
		var i = ue(), o = z(i), s = (e) => {
			{
				let i = Q(() => t(l)), o = Q(() => t(new Date(l.getTime() + 36e5))), s = Q(() => r().title ?? ""), c = Q(() => r().guests ?? []), u = Q(() => r().description ?? "");
				kn(e, {
					get cal() {
						return a;
					},
					get start() {
						return H(i);
					},
					get end() {
						return H(o);
					},
					allDay: !1,
					get title() {
						return H(s);
					},
					get guests() {
						return H(c);
					},
					get description() {
						return H(u);
					},
					frame: "dialog",
					get onclose() {
						return n.onclose;
					}
				});
			}
		}, u = Q(() => a.writable().length), d = (e) => {
			var t = dr(), r = k(W(t), 2);
			c(t), Y("click", r, () => n.atlas.plugin.openSettings()), X(e, t);
		};
		O(o, (e) => {
			H(u) ? e(s) : e(d, -1);
		}), X(e, i);
	}, p = (e) => {
		var t = fr();
		X(e, t);
	};
	O(d, (e) => {
		H(o) ? e(f) : e(p, -1);
	}), X(e, u), i();
}
K(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/view.ts
function hr(e, t) {
	let n = xe(t.arg);
	if (n) {
		let r = b(mr, {
			target: e,
			props: {
				atlas: t,
				seed: n,
				onclose: () => t.pane?.close?.()
			}
		});
		return () => P(r);
	}
	e.style.height = "100%";
	let r = b(ur, {
		target: e,
		props: { atlas: t }
	});
	return () => P(r);
}
//#endregion
export { hr as default };
