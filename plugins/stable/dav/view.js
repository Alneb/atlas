import { $ as e, A as t, B as n, C as r, Ct as i, D as a, Dt as o, E as s, Et as c, F as l, G as u, H as d, I as f, J as p, K as m, L as h, M as g, N as _, O as v, P as y, Q as b, R as x, S, St as C, T as w, Tt as T, U as ee, W as te, X as E, Y as D, Z as O, _ as k, _t as A, at as j, bt as M, c as N, ct as ne, d as re, dt as P, et as F, f as I, ft as ie, g as L, gt as R, h as z, ht as B, i as V, it as ae, j as H, k as oe, l as se, lt as U, m as W, mt as G, n as ce, nt as le, o as K, ot as q, p as ue, pt as de, q as fe, r as pe, rt as J, s as me, st as Y, t as he, tt as X, u as ge, ut as _e, v as ve, vt as Z, w as ye, wt as be, x as xe, xt as Q, y as Se, yt as $, z as Ce } from "./ui-lib/layout.js";
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
	#e = M(Z([]));
	get sources() {
		return U(this.#e);
	}
	set sources(e) {
		$(this.#e, e, !0);
	}
	#t = M(Z([]));
	get accounts() {
		return U(this.#t);
	}
	set accounts(e) {
		$(this.#t, e, !0);
	}
	#n = M(Z([]));
	get events() {
		return U(this.#n);
	}
	set events(e) {
		$(this.#n, e, !0);
	}
	#r = M("week");
	get view() {
		return U(this.#r);
	}
	set view(e) {
		$(this.#r, e, !0);
	}
	#i = M(Z(k(Oe("span")) ? Oe("span") : "60days"));
	get span() {
		return U(this.#i);
	}
	set span(e) {
		$(this.#i, e, !0);
	}
	#a = M(Z(a(/* @__PURE__ */ new Date())));
	get cursor() {
		return U(this.#a);
	}
	set cursor(e) {
		$(this.#a, e, !0);
	}
	#o = M(!0);
	get loading() {
		return U(this.#o);
	}
	set loading(e) {
		$(this.#o, e, !0);
	}
	#s = M(!1);
	get syncing() {
		return U(this.#s);
	}
	set syncing(e) {
		$(this.#s, e, !0);
	}
	#c = M("");
	get error() {
		return U(this.#c);
	}
	set error(e) {
		$(this.#c, e, !0);
	}
	#l = M(!0);
	get configured() {
		return U(this.#l);
	}
	set configured(e) {
		$(this.#l, e, !0);
	}
	#u = M(null);
	get write() {
		return U(this.#u);
	}
	set write(e) {
		$(this.#u, e, !0);
	}
	#d = M(Z(Oe("last")));
	get last() {
		return U(this.#d);
	}
	set last(e) {
		$(this.#d, e, !0);
	}
	#f = M(Z([]));
	get hidden() {
		return U(this.#f);
	}
	set hidden(e) {
		$(this.#f, e, !0);
	}
	#p = M(Z({}));
	get colors() {
		return U(this.#p);
	}
	set colors(e) {
		$(this.#p, e, !0);
	}
	#m = M(Z([]));
	get toasts() {
		return U(this.#m);
	}
	set toasts(e) {
		$(this.#m, e, !0);
	}
	#h = M(null);
	get results() {
		return U(this.#h);
	}
	set results(e) {
		$(this.#h, e, !0);
	}
	#g = M("");
	get query() {
		return U(this.#g);
	}
	set query(e) {
		$(this.#g, e, !0);
	}
	#_ = M(Z(/* @__PURE__ */ new Date()));
	get now() {
		return U(this.#_);
	}
	set now(e) {
		$(this.#_, e, !0);
	}
	#v = M(Z([]));
	get tasks() {
		return U(this.#v);
	}
	set tasks(e) {
		$(this.#v, e, !0);
	}
	#y = M(null);
	get placing() {
		return U(this.#y);
	}
	set placing(e) {
		$(this.#y, e, !0);
	}
	#b = M(!1);
	get narrow() {
		return U(this.#b);
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
		return H(this.settings.week_start);
	}
	get h12() {
		return z(this.settings.time_format);
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
					to: N(e, 6)
				};
			}
			case "workweek": {
				let e = v(t, 1);
				return {
					from: e,
					to: N(e, 4)
				};
			}
			case "month": {
				let e = v(new Date(t.getFullYear(), t.getMonth(), 1), this.first);
				return {
					from: e,
					to: N(e, 41)
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
		for (let r = e; r <= t; r = N(r, 1)) n.push(r);
		return n;
	}
	colorOf(e) {
		if (e === "notes") return this.colors.notes ?? this.colors.Notes ?? "var(--accent)";
		if (e === "tasks") return this.colors.tasks ?? "var(--text-muted)";
		let t = this.sources.find((t) => t.id === e);
		return this.colors[e] ?? this.colors[t?.name ?? ""] ?? t?.shown_color ?? t?.color ?? L(e);
	}
	isHidden(e, t = e) {
		return this.hidden.includes(e) || this.hidden.includes(t);
	}
	async loadSources() {
		try {
			let e = await I(this.atlas, "watch", {}, 30);
			this.sources = e.sources, this.accounts = e.accounts ?? [], this.write = e.write, this.configured = e.configured;
		} catch (e) {
			this.error = e.message;
		}
	}
	async load(e = !1) {
		let { from: t, to: n } = this.range(), r = ++this.seq;
		e || (this.loading = !0);
		try {
			let e = this.sources.filter((e) => !this.isHidden(e.id, e.name)).map((e) => e.id), [i, a] = await Promise.all([I(this.atlas, "range", {
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
					end: g(N(t, 1)),
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
			let a = await I(this.atlas, "time_block", {
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
					let n = await I(this.atlas, "move_tasks", { note: e.note });
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
			let t = await I(this.atlas, "refresh", { force: e }, 300);
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
			day: () => N(t, e),
			week: () => N(t, 7 * e),
			workweek: () => N(t, 7 * e),
			month: () => se(new Date(t.getFullYear(), t.getMonth(), 1), e),
			agenda: () => N(t, re(this.span) * e),
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
				await I(this.atlas, "undo", { id: e }), this.toast(`${t} undone`);
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
			let r = await I(this.atlas, "create", {
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
			let i = await I(this.atlas, "update", {
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
			return await I(this.atlas, "respond", {
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
				let n = await I(this.atlas, "delete", {
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
		let n = W(e), r = ue(e), i = e.all_day ? {
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
			this.results = (await I(this.atlas, "search", { q: e })).events;
		} catch (e) {
			this.toast(e.message, "error");
		}
	}
	static fields(e) {
		let n = W(e), r = ue(e);
		return e.all_day ? {
			start: g(n),
			end: g(N(r, -1))
		} : {
			start: t(n),
			end: t(r)
		};
	}
}, je = J("<span class=\"h svelte-1jq00cd\"> </span>"), Me = J("<button> </button>"), Ne = J("<button class=\"link svelte-1jq00cd\">Set it up…</button>"), Pe = J("<h3 class=\"svelte-1jq00cd\">Calendars</h3> <ul class=\"svelte-1jq00cd\"><li class=\"none svelte-1jq00cd\"> <!></li></ul>", 1), Fe = J("<span class=\"err svelte-1jq00cd\">!</span>"), Ie = ae("<svg viewBox=\"0 0 12 12\" width=\"10\" height=\"10\" aria-hidden=\"true\"><path d=\"M2.5 6.5l2.2 2.2L9.5 3.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path></svg>"), Le = J("<span class=\"ro svelte-1jq00cd\" title=\"A subscription: read-only\"><!></span>"), Re = J("<span class=\"ro svelte-1jq00cd\" title=\"Read-only\">ro</span>"), ze = J("<button class=\"pc svelte-1jq00cd\" role=\"option\"></button>"), Be = J("<div class=\"palette svelte-1jq00cd\" role=\"listbox\" aria-label=\"Colours\"></div>"), Ve = J("<li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\"><span><!></span> <span class=\"name svelte-1jq00cd\"> </span> <!> <!></button> <button class=\"tool small svelte-1jq00cd\" title=\"Colour\"><span class=\"swatch svelte-1jq00cd\"></span></button> <!></li>"), He = J("<li class=\"none svelte-1jq00cd\"> </li>"), Ue = J("<h3 class=\"svelte-1jq00cd\"> <!></h3> <ul class=\"svelte-1jq00cd\"></ul>", 1), We = J("<li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\" title=\"Notes marked important: true with due: / event:\"><span><!></span> <span class=\"name svelte-1jq00cd\">Important notes</span></button></li>"), Ge = J("<div class=\"side svelte-1jq00cd\"><button class=\"create atlas-btn primary svelte-1jq00cd\"><!>Create</button> <div class=\"mini svelte-1jq00cd\" aria-label=\"Pick a day\"><div class=\"mhead svelte-1jq00cd\"><span class=\"mtitle svelte-1jq00cd\"> </span> <button class=\"tool svelte-1jq00cd\" aria-label=\"Previous month\"><!></button> <button class=\"tool svelte-1jq00cd\" aria-label=\"Next month\"><!></button></div> <div class=\"mgrid svelte-1jq00cd\"><!> <!></div></div> <!> <!> <h3 class=\"svelte-1jq00cd\">In the vault</h3> <ul class=\"svelte-1jq00cd\"><li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\" title=\"Open tasks with a 📅 or ⏳ date and notes with due:, on their day (click one to time-block it)\"><span><!></span> <span class=\"name svelte-1jq00cd\">Tasks &amp; deadlines</span></button></li> <!></ul> <button class=\"link add svelte-1jq00cd\"><!>Add an account or a subscription…</button></div>"), Ke = {
	hash: "svelte-1jq00cd",
	code: ".side.svelte-1jq00cd {height:100%;overflow-y:auto;padding:12px 10px 24px;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;}.create.svelte-1jq00cd {display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin:0 0 10px 4px;padding:7px 16px;}.mini.svelte-1jq00cd {padding:0 2px 10px;}.mhead.svelte-1jq00cd {display:flex;align-items:center;gap:2px;padding:0 0 4px 6px;}.mtitle.svelte-1jq00cd {flex:1;font-weight:600;font-size:0.9em;color:var(--heading);}.mgrid.svelte-1jq00cd {display:grid;grid-template-columns:repeat(7, 1fr);gap:1px;}.h.svelte-1jq00cd {font-size:0.68em;color:var(--text-faint);text-align:center;padding:2px 0;}.d.svelte-1jq00cd {all:unset;cursor:pointer;text-align:center;font-size:0.76em;line-height:24px;border-radius:999px;font-variant-numeric:tabular-nums;color:var(--text-muted);position:relative;}.d.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.d.other.svelte-1jq00cd {color:var(--text-faint);}.d.on.svelte-1jq00cd {background:var(--accent-soft);color:var(--accent-strong);border-radius:0;}.d.busy.svelte-1jq00cd::after {content:\"\";position:absolute;left:50%;bottom:2px;width:3px;height:3px;border-radius:50%;background:currentColor;transform:translateX(-50%);opacity:0.6;}.d.today.svelte-1jq00cd {background:var(--accent);color:var(--accent-fg);font-weight:700;border-radius:999px;}.d.svelte-1jq00cd:focus-visible, .cal.svelte-1jq00cd:focus-visible, .tool.svelte-1jq00cd:focus-visible, .pc.svelte-1jq00cd:focus-visible, .link.svelte-1jq00cd:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}h3.svelte-1jq00cd {margin:10px 6px 2px;font-size:0.72em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;}ul.svelte-1jq00cd {list-style:none;margin:0;padding:0;display:grid;gap:1px;}li.svelte-1jq00cd {position:relative;display:flex;align-items:center;}.cal.svelte-1jq00cd {all:unset;flex:1;min-width:0;cursor:pointer;display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:var(--radius-sm);color:var(--text);font-size:0.9em;}.cal.svelte-1jq00cd:hover {background:var(--bg-hover);}.box.svelte-1jq00cd {width:14px;height:14px;border-radius:4px;background:var(--c);border:2px solid var(--c);box-sizing:border-box;display:grid;place-items:center;color:#fff;flex:none;}.box.off.svelte-1jq00cd {background:transparent;}.name.svelte-1jq00cd {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.err.svelte-1jq00cd {color:var(--red);font-weight:700;}.ro.svelte-1jq00cd {color:var(--text-faint);font-size:0.75em;}.tool.svelte-1jq00cd {all:unset;cursor:pointer;padding:5px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.small.svelte-1jq00cd {opacity:0;}li.svelte-1jq00cd:hover .small:where(.svelte-1jq00cd), .small.svelte-1jq00cd:focus-visible {opacity:1;}.swatch.svelte-1jq00cd {width:10px;height:10px;border-radius:50%;background:var(--c);}.palette.svelte-1jq00cd {position:absolute;right:0;top:100%;z-index:20;display:grid;grid-template-columns:repeat(6, 22px);gap:6px;padding:8px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 24px rgba(0,0,0,.25));}.pc.svelte-1jq00cd {all:unset;cursor:pointer;width:22px;height:22px;border-radius:50%;background:var(--c);}.pc[aria-selected=\"true\"].svelte-1jq00cd {box-shadow:0 0 0 2px var(--bg-elev), 0 0 0 4px var(--c);}.none.svelte-1jq00cd {color:var(--text-faint);font-size:0.85em;padding:4px 6px;gap:6px;flex-wrap:wrap;}.link.svelte-1jq00cd {all:unset;cursor:pointer;color:var(--accent);font-size:0.85em;display:inline-flex;align-items:center;gap:4px;}.add.svelte-1jq00cd {margin:10px 6px 0;}"
};
function qe(t, r) {
	be(r, !0), fe(t, Ke);
	let a = M(Z(/* @__PURE__ */ new Date()));
	ie(() => {
		$(a, new Date(r.cal.cursor.getFullYear(), r.cal.cursor.getMonth(), 1), !0);
	});
	let o = Q(() => {
		let e = v(U(a), r.cal.first);
		return Array.from({ length: 42 }, (t, n) => N(e, n));
	}), s = Q(() => U(o).slice(0, 7).map((e) => e.toLocaleDateString(void 0, { weekday: "narrow" }))), l = (e) => {
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
	], g = M(null), _ = Q(() => [...r.cal.byAccount().map((e) => ({
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
	var S = Ge(), C = G(S), ee = G(C);
	V(ee, {
		name: "plus",
		size: 15
	}), T(), c(C);
	var te = A(C, 2), E = G(te), k = G(E), j = R(k, !0), ne = A(k, 2), re = G(ne);
	V(re, {
		name: "back",
		size: 14
	}), c(ne);
	var F = A(ne, 2), I = G(F);
	V(I, {
		name: "right",
		size: 14
	}), c(F), c(E);
	var L = A(E, 2), z = G(L);
	p(z, 17, () => U(s), D, (t, n) => {
		var r = je(), i = R(r, !0);
		P(() => e(i, U(n))), X(t, r);
	});
	var ae = A(z, 2);
	p(ae, 17, () => U(o), (e) => e.getTime(), (t, n) => {
		var i = Me();
		let o;
		var s = R(i, !0);
		P((t, n, r, a, c) => {
			o = m(i, 1, "d svelte-1jq00cd", null, o, {
				other: t,
				today: n,
				on: r,
				busy: a
			}), e(s, c);
		}, [
			() => U(n).getMonth() !== U(a).getMonth(),
			() => w(U(n), r.cal.now),
			() => l(U(n)),
			() => U(d).has(f(U(n))),
			() => U(n).getDate()
		]), Y("click", i, () => r.cal.go(U(n))), X(t, i);
	}), c(L), c(te);
	var H = A(te, 2), oe = (t) => {
		var n = Pe(), i = A(B(n), 2), a = G(i), o = G(a, !0), s = A(o), l = (e) => {
			var t = Ne();
			Y("click", t, () => r.cal.atlas.plugin.openSettings()), X(e, t);
		};
		O(s, (e) => {
			r.cal.configured || e(l);
		}), c(a), c(i), P(() => e(o, r.cal.configured ? r.cal.error ? "Not read: see the message beside." : "Reading the server…" : "No account yet.")), X(t, n);
	};
	O(H, (e) => {
		U(y) && e(oe);
	});
	var W = A(H, 2);
	p(W, 17, () => U(_), (e) => e.title, (t, i) => {
		var a = le(), o = B(a), s = (t) => {
			var a = Ue(), o = B(a), s = G(o, !0), l = A(s), d = (e) => {
				var t = Fe();
				P(() => n(t, "title", U(i).error)), X(e, t);
			};
			O(l, (e) => {
				U(i).error && e(d);
			}), c(o);
			var f = A(o, 2);
			p(f, 21, () => U(i).items, (e) => e.id, (t, i) => {
				var a = Ve(), o = G(a), s = G(o);
				let l, d;
				var f = G(s), _ = (e) => {
					var t = Ie();
					X(e, t);
				}, v = Q(() => !r.cal.isHidden(U(i).id, U(i).name));
				O(f, (e) => {
					U(v) && e(_);
				}), c(s);
				var y = A(s, 2), b = R(y, !0), S = A(y, 2), C = (e) => {
					var t = Fe();
					P(() => n(t, "title", U(i).error)), X(e, t);
				};
				O(S, (e) => {
					U(i).error && e(C);
				});
				var w = A(S, 2), T = (e) => {
					var t = Le(), n = G(t);
					V(n, {
						name: "rss",
						size: 12
					}), c(t), X(e, t);
				}, ee = (e) => {
					var t = Re();
					X(e, t);
				};
				O(w, (e) => {
					U(i).kind === "ics" ? e(T) : U(i).writable || e(ee, 1);
				}), c(o);
				var te = A(o, 2), E = G(te);
				let D;
				c(te);
				var k = A(te, 2), j = (e) => {
					var t = Be();
					p(t, 20, () => h, (e) => e, (e, t) => {
						var a = ze();
						let o;
						P((e) => {
							n(a, "aria-selected", e), n(a, "aria-label", t), o = u(a, "", o, { "--c": t });
						}, [() => r.cal.colorOf(U(i).id) === t]), Y("click", a, () => {
							r.cal.setColor(U(i).id, t), $(g, null);
						}), X(e, a);
					}), c(t), X(e, t);
				};
				O(k, (e) => {
					U(g) === U(i).id && e(j);
				}), c(a), P((t, r, a, c, f) => {
					n(o, "aria-checked", t), n(o, "title", r), l = m(s, 1, "box svelte-1jq00cd", null, l, { off: a }), d = u(s, "", d, { "--c": c }), e(b, U(i).name), n(te, "aria-label", `Colour of ${U(i).name ?? ""}`), D = u(E, "", D, { "--c": f });
				}, [
					() => !r.cal.isHidden(U(i).id, U(i).name),
					() => x(U(i)),
					() => r.cal.isHidden(U(i).id, U(i).name),
					() => r.cal.colorOf(U(i).id),
					() => r.cal.colorOf(U(i).id)
				]), Y("click", o, () => r.cal.toggle(U(i).id, U(i).name)), Y("click", te, () => $(g, U(g) === U(i).id ? null : U(i).id, !0)), X(t, a);
			}, (t) => {
				var n = He(), r = R(n, !0);
				P(() => e(r, U(i).error ?? "Reading the server…")), X(t, n);
			}), c(f), P(() => {
				n(o, "title", U(i).error ?? U(i).title), e(s, U(i).title);
			}), X(t, a);
		};
		O(o, (e) => {
			(U(i).items.length || U(i).title !== "Subscriptions") && e(s);
		}), X(t, a);
	});
	var ce = A(W, 4), K = G(ce), q = G(K), ue = G(q);
	let de, pe;
	var J = G(ue), he = (e) => {
		var t = Ie();
		X(e, t);
	}, ge = Q(() => !r.cal.isHidden(me, "Tasks"));
	O(J, (e) => {
		U(ge) && e(he);
	}), c(ue), T(2), c(q), c(K);
	var _e = A(K, 2), ve = (e) => {
		var t = We(), i = G(t), a = G(i);
		let o, s;
		var l = G(a), d = (e) => {
			var t = Ie();
			X(e, t);
		}, f = Q(() => !r.cal.isHidden(De, "Notes"));
		O(l, (e) => {
			U(f) && e(d);
		}), c(a), T(2), c(i), c(t), P((e, t, r) => {
			n(i, "aria-checked", e), o = m(a, 1, "box svelte-1jq00cd", null, o, { off: t }), s = u(a, "", s, { "--c": r });
		}, [
			() => !r.cal.isHidden(De, "Notes"),
			() => r.cal.isHidden(De, "Notes"),
			() => r.cal.colorOf(De)
		]), Y("click", i, () => r.cal.toggle(De, "Notes")), X(e, t);
	};
	O(_e, (e) => {
		U(b) && e(ve);
	}), c(ce);
	var ye = A(ce, 2), xe = G(ye);
	V(xe, {
		name: "plus",
		size: 13
	}), T(), c(ye), c(S), P((t, r, i, a) => {
		e(j, t), n(q, "aria-checked", r), de = m(ue, 1, "box svelte-1jq00cd", null, de, { off: i }), pe = u(ue, "", pe, { "--c": a });
	}, [
		() => U(a).toLocaleDateString(void 0, {
			month: "long",
			year: "numeric"
		}),
		() => !r.cal.isHidden(me, "Tasks"),
		() => r.cal.isHidden(me, "Tasks"),
		() => r.cal.colorOf(me)
	]), Y("click", C, function(...e) {
		r.oncreate?.apply(this, e);
	}), Y("click", ne, () => $(a, se(U(a), -1), !0)), Y("click", F, () => $(a, se(U(a), 1), !0)), Y("click", q, () => r.cal.toggle(me, "Tasks")), Y("click", ye, () => r.cal.atlas.plugin.openSettings()), X(t, S), i();
}
q(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/TimeGrid.svelte
var Je = J("<button title=\"Open this day\"><span class=\"wd svelte-16enfn0\"> </span> <span class=\"num svelte-16enfn0\"> </span></button>"), Ye = J("<div class=\"lanecell svelte-16enfn0\" role=\"button\" tabindex=\"-1\" aria-label=\"New all-day event\"></div>"), Xe = J("<span class=\"tbox svelte-16enfn0\" aria-hidden=\"true\"></span>"), Ze = J("<span class=\"dot svelte-16enfn0\" aria-hidden=\"true\"></span>"), Qe = J("<button><!> </button>"), $e = J("<div class=\"hl svelte-16enfn0\"> </div>"), et = J("<span class=\"loc svelte-16enfn0\"> </span>"), tt = J("<div class=\"grip svelte-16enfn0\" role=\"separator\" aria-label=\"Change the end\"></div>"), nt = J("<div role=\"button\" tabindex=\"0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span> <!> <!></div>"), rt = J("<div class=\"ev slot-ghost svelte-16enfn0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span></div>"), it = J("<div class=\"now svelte-16enfn0\" aria-hidden=\"true\"></div>"), at = J("<div role=\"gridcell\" tabindex=\"-1\"><!> <!> <!></div>"), ot = J("<div class=\"tg svelte-16enfn0\"><div class=\"head svelte-16enfn0\"><div class=\"gutter tz svelte-16enfn0\" title=\"Times in your zone\"></div> <!></div> <div class=\"lane svelte-16enfn0\"><div class=\"gutter label svelte-16enfn0\">all-day</div> <div class=\"lanecols svelte-16enfn0\"><!> <!></div></div> <div class=\"scroll svelte-16enfn0\"><div class=\"body svelte-16enfn0\"><div class=\"gutter hours svelte-16enfn0\"></div> <div class=\"cols svelte-16enfn0\" role=\"grid\" tabindex=\"-1\" aria-label=\"Hours\"></div></div></div></div>"), st = {
	hash: "svelte-16enfn0",
	code: ".tg.svelte-16enfn0 {display:grid;grid-template-rows:auto auto 1fr;height:100%;min-height:0;--gutter: 56px;}.head.svelte-16enfn0, .lane.svelte-16enfn0 {display:grid;grid-template-columns:var(--gutter) 1fr;border-bottom:1px solid var(--border);}.head.svelte-16enfn0 {grid-template-columns:var(--gutter) repeat(var(--n), 1fr);}.gutter.svelte-16enfn0 {color:var(--text-faint);font-size:0.75em;}.tz.svelte-16enfn0 {align-self:end;padding:0 6px 6px;font-size:0.68em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.dayhead.svelte-16enfn0 {all:unset;cursor:pointer;display:flex;align-items:baseline;justify-content:center;gap:6px;padding:6px 2px;color:var(--text-muted);border-left:1px solid var(--border);min-width:0;}.dayhead.svelte-16enfn0:hover {background:var(--bg-hover);}.dayhead.svelte-16enfn0:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.wd.svelte-16enfn0 {font-size:0.78em;text-transform:uppercase;letter-spacing:0.04em;}.num.svelte-16enfn0 {font-size:1.25em;font-weight:600;color:var(--heading);font-variant-numeric:tabular-nums;min-width:1.8em;text-align:center;border-radius:999px;}.dayhead.today.svelte-16enfn0 .wd:where(.svelte-16enfn0) {color:var(--accent-strong);}.dayhead.today.svelte-16enfn0 .num:where(.svelte-16enfn0) {background:var(--accent);color:var(--accent-fg);}.label.svelte-16enfn0 {align-self:center;padding:0 6px;text-align:right;}.lanecols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);grid-auto-rows:22px;row-gap:2px;padding:3px 0;min-height:26px;max-height:120px;overflow-y:auto;}.lanecell.svelte-16enfn0 {grid-row:1 / span var(--rows);border-left:1px solid var(--border);cursor:cell;}.bar.svelte-16enfn0 {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;margin:0 3px;padding:0 8px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));color:var(--text);font-size:0.82em;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px;border-left:3px solid var(--c);}.bar.clipl.svelte-16enfn0 {border-top-left-radius:0;border-bottom-left-radius:0;margin-left:0;}.bar.clipr.svelte-16enfn0 {border-top-right-radius:0;border-bottom-right-radius:0;margin-right:0;}.dot.svelte-16enfn0 {width:6px;height:6px;border-radius:50%;background:var(--c);flex:none;}\n  /* a task of the Tasks & deadlines layer: its box, not an event's colour block */.bar.task.svelte-16enfn0 {background:transparent;border:1px dashed var(--border-strong);border-left-width:1px;color:var(--text-muted);}.bar.task.svelte-16enfn0:hover {background:var(--bg-hover);color:var(--text);}.tbox.svelte-16enfn0 {width:9px;height:9px;border:1.5px solid currentColor;border-radius:3px;flex:none;box-sizing:border-box;}.scroll.svelte-16enfn0 {overflow-y:auto;min-height:0;position:relative;}.body.svelte-16enfn0 {position:relative;display:grid;grid-template-columns:var(--gutter) 1fr;height:calc(24 * var(--hour));}.hours.svelte-16enfn0 {position:relative;}.hl.svelte-16enfn0 {position:absolute;right:8px;transform:translateY(-50%);font-variant-numeric:tabular-nums;white-space:nowrap;}.cols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);position:relative;touch-action:pan-y;}.col.svelte-16enfn0 {position:relative;border-left:1px solid var(--border);cursor:cell;min-width:0;background-image:repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px var(--hour)), repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour) / 2), color-mix(in srgb, var(--border) 45%, transparent) calc(var(--hour) / 2) calc(var(--hour) / 2 + 1px), transparent calc(var(--hour) / 2 + 1px) var(--hour));}.col.weekend.svelte-16enfn0 {background-color:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.ev.svelte-16enfn0 {position:absolute;box-sizing:border-box;container-type:inline-size;cursor:pointer;border-radius:var(--radius-sm);padding:2px 6px;overflow:hidden;display:flex;flex-direction:column;gap:0;font-size:0.8em;line-height:1.25;background:color-mix(in srgb, var(--c) 24%, var(--bg));border-left:3px solid var(--c);color:var(--text);box-shadow:0 0 0 1px var(--bg);touch-action:none;z-index:calc(1 + var(--depth, 0));}\n  /* drawn over a running event: opaque, with a ring of the page and a shadow so the one under it reads as a separate block */.ev.over.svelte-16enfn0 {box-shadow:0 0 0 1px var(--bg), var(--shadow-sm);}\n  /* a bar is an .ev too (selection, colours) but a grid item in a row: absolute dropped its grid-column (every bar on Monday), a column centred its words */.bar.ev.svelte-16enfn0 {position:relative;flex-direction:row;}.ev.svelte-16enfn0:hover {background:color-mix(in srgb, var(--c) 34%, var(--bg));}.ev.svelte-16enfn0:focus-visible, .ev.sel.svelte-16enfn0, .bar.sel.svelte-16enfn0, .bar.svelte-16enfn0:focus-visible {outline:2px solid var(--c);outline-offset:1px;z-index:40;}.ev.short.svelte-16enfn0 {flex-direction:row;gap:6px;align-items:baseline;}.ev.short.svelte-16enfn0 .t:where(.svelte-16enfn0) {flex:0 1 auto;min-width:2.5em;}.ev.short.svelte-16enfn0 .when:where(.svelte-16enfn0) {flex:0 100 auto;min-width:0;}.ev.ro.svelte-16enfn0 {cursor:default;}.ev.free.svelte-16enfn0 {background:color-mix(in srgb, var(--c) 10%, var(--bg));}.ev.cancel.svelte-16enfn0 .t:where(.svelte-16enfn0), .bar.cancel.svelte-16enfn0 {text-decoration:line-through;opacity:0.7;}.ev.ghosted.svelte-16enfn0 {opacity:0.35;}.t.svelte-16enfn0 {font-weight:600;overflow:hidden;text-overflow:ellipsis;min-width:0;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;flex:none;}.ev.short.svelte-16enfn0 .t:where(.svelte-16enfn0) {display:block;white-space:nowrap;}.when.svelte-16enfn0, .loc.svelte-16enfn0 {color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}.grip.svelte-16enfn0 {position:absolute;left:0;right:0;bottom:0;height:7px;cursor:ns-resize;}.slot-ghost.svelte-16enfn0 {z-index:41;pointer-events:none;box-shadow:var(--shadow-md, 0 4px 16px rgba(0,0,0,.25));background:color-mix(in srgb, var(--c) 40%, var(--bg));}.now.svelte-16enfn0 {position:absolute;left:-1px;right:0;height:2px;background:var(--red);z-index:42;pointer-events:none;}.now.svelte-16enfn0::before {content:\"\";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--red);}\n  /* narrow: the title alone (two lines when tall enough) rather than both cut — the rest is in the tooltip */\n  @container (max-width: 72px) {.when.svelte-16enfn0, .loc.svelte-16enfn0 {display:none;}\n  }\n  @media (prefers-reduced-motion: no-preference) {.ev.svelte-16enfn0 {transition:opacity 120ms var(--ease);} }"
};
function ct(t, r) {
	be(r, !0), fe(t, st);
	let o = y(r, "cal", 7), s = M(void 0), d = M(void 0), f = Q(() => r.days.map((e) => he(o().events, e))), h = Q(() => ce(o().shownEvents(), r.days)), g = Q(() => Math.max(1, ...U(h).map((e) => e.row + 1))), v = Array.from({ length: 24 }, (e, t) => t), b = (e) => e === 0 ? "" : o().h12 ? new Date(2e3, 0, 1, e).toLocaleTimeString(void 0, {
		hour: "numeric",
		hour12: !0
	}) : String(e).padStart(2, "0"), x = Q(() => o().now.getHours() * 60 + o().now.getMinutes()), C = (e) => r.selected !== null && r.selected.uid === e.uid && r.selected.rid === e.rid && r.selected.calendar === e.calendar, T = (e) => e.color ?? o().colorOf(e.calendar), ee = (e, t) => `calc(${e * 100}% + ${t}px)`, te = (e) => [
		e.summary || "(no title)",
		`${oe(W(e), o().h12)} – ${oe(ue(e), o().h12)}`,
		e.location,
		e.calendar_name
	].filter(Boolean).join("\n");
	_(() => {
		let e = Number(o().settings.day_start ?? 8), t = r.days.some((e) => w(e, o().now)) ? Math.max(0, U(x) / 60 - 2) : e;
		U(s) && (U(s).scrollTop = Math.max(0, t * 48 - 8));
	});
	let E = M(null), k = (e) => Math.round(e / 15) * 15;
	function j(e) {
		let t = U(d).getBoundingClientRect();
		return {
			day: Math.min(r.days.length - 1, Math.max(0, Math.floor((e.clientX - t.left) / t.width * r.days.length))),
			min: Math.min(1440, Math.max(0, (e.clientY - t.top) / 48 * 60))
		};
	}
	function re(e, t, n, r = 0, i = 0) {
		if (e.button !== 0) return;
		e.stopPropagation();
		let a = j(e);
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
	function F(e) {
		if (!U(E) || !U(E).moved && Math.hypot(e.clientX - U(E).x0, e.clientY - U(E).y0) < 4) return;
		let t = j(e), n = U(E);
		if (n.moved = !0, n.kind === "create") {
			let e = k(t.min);
			[n.from, n.to] = e >= n.grab ? [n.grab, Math.max(n.grab + 15, e)] : [e, n.grab + 15];
		} else if (n.kind === "move") {
			let e = k(t.min - n.grab);
			n.day = t.day, n.from = Math.max(0, Math.min(1425, e)), n.to = n.from + n.len;
		} else n.to = Math.max(n.from + 15, k(t.min));
		$(E, { ...n }, !0);
	}
	async function I(e) {
		if (U(ie)) return;
		let t = U(E);
		if ($(E, null), document.body.style.userSelect = "", !t) return;
		let n = (e, t) => new Date(r.days[e].getFullYear(), r.days[e].getMonth(), r.days[e].getDate(), 0, t);
		if (t.kind === "create") {
			if (o().placing) {
				o().timeBlock(n(t.day, t.from), n(t.day, t.to));
				return;
			}
			let e = U(d).getBoundingClientRect(), i = e.width / r.days.length;
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
	let ie = M(null), L = !1, z = (e) => !!e.task && e.task.done !== !0 && e.task.props.from !== "note" && e.task.line !== null;
	function B(e, t) {
		e.button === 0 && z(t) && ($(ie, {
			t: t.task,
			x0: e.clientX,
			y0: e.clientY,
			moved: !1
		}, !0), window.addEventListener("pointermove", ae), window.addEventListener("pointerup", H, { once: !0 }));
	}
	let V = (e) => {
		let t = U(d)?.getBoundingClientRect(), n = U(s)?.getBoundingClientRect();
		return !!t && !!n && e.clientX >= t.left && e.clientX <= t.right && e.clientY >= n.top && e.clientY <= n.bottom;
	};
	function ae(e) {
		let t = U(ie);
		if (!t || !t.moved && Math.hypot(e.clientX - t.x0, e.clientY - t.y0) < 4) return;
		if (t.moved = !0, document.body.style.userSelect = "none", !V(e)) {
			$(E, null);
			return;
		}
		let n = j(e), r = Math.min(1380, k(n.min));
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
	function H(e) {
		window.removeEventListener("pointermove", ae);
		let t = U(ie), n = U(E);
		if ($(ie, null), !t?.moved || (L = !0, setTimeout(() => L = !1, 0), $(E, null), document.body.style.userSelect = "", !n || !V(e))) return;
		let i = (e) => new Date(r.days[n.day].getFullYear(), r.days[n.day].getMonth(), r.days[n.day].getDate(), 0, e);
		o().placing = t.t, o().timeBlock(i(n.from), i(n.to));
	}
	function se(e) {
		U(E) && e.key === "Escape" && ($(E, null), document.body.style.userSelect = "", e.stopPropagation());
	}
	function le(e, t) {
		if (e.target.closest(".bar") || o().placing) return;
		let n = r.days[t];
		r.oncreate(a(n), N(a(n), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var K = ot();
	ne("keydown", de, se);
	let q;
	var pe = G(K), J = G(pe);
	J.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ");
	var me = A(J, 2);
	p(me, 17, () => r.days, D, (t, n) => {
		var r = Je();
		let i;
		var a = G(r), s = R(a, !0), l = A(a, 2), u = R(l, !0);
		c(r), P((t, n, a) => {
			i = m(r, 1, "dayhead svelte-16enfn0", null, i, { today: t }), e(s, n), e(u, a);
		}, [
			() => w(U(n), o().now),
			() => U(n).toLocaleDateString(void 0, { weekday: "short" }),
			() => U(n).getDate()
		]), Y("click", r, () => o().go(U(n), "day")), X(t, r);
	}), c(pe);
	var ge = A(pe, 2);
	let _e;
	var ve = A(G(ge), 2), Z = G(ve);
	p(Z, 17, () => r.days, D, (e, t, n) => {
		var r = Ye();
		u(r, "", {}, { "grid-column": n + 1 }), Y("click", r, (e) => le(e, n)), Y("keydown", r, () => {}), X(e, r);
	});
	var ye = A(Z, 2);
	p(ye, 17, () => U(h), (e) => e.e.calendar + e.e.uid + (e.e.rid ?? "") + e.from, (t, i) => {
		var a = Qe();
		let o, s;
		var l = G(a), d = (e) => {
			var t = Xe();
			X(e, t);
		}, f = (e) => {
			var t = Ze();
			X(e, t);
		}, p = Q(() => S(U(i).e));
		O(l, (e) => {
			U(i).e.task ? e(d) : U(p) && e(f, 1);
		});
		var h = A(l, 1, !0);
		c(a), P((t, r, c) => {
			o = m(a, 1, "bar ev svelte-16enfn0", null, o, {
				task: !!U(i).e.task,
				sel: t,
				clipl: U(i).clippedStart,
				clipr: U(i).clippedEnd,
				cancel: U(i).e.status === "CANCELLED"
			}), n(a, "title", r), s = u(a, "", s, {
				"--c": c,
				"grid-column": `${U(i).from + 1} / ${U(i).to + 2}`,
				"grid-row": U(i).row + 1
			}), e(h, U(i).e.summary || "(no title)");
		}, [
			() => C(U(i).e),
			() => z(U(i).e) ? `${U(i).e.summary} — drag it onto the hours to time-block it` : U(i).e.summary,
			() => T(U(i).e)
		]), Y("pointerdown", a, (e) => B(e, U(i).e)), Y("contextmenu", a, (e) => r.onmenu(U(i).e, e)), Y("click", a, (e) => {
			if (L) {
				L = !1;
				return;
			}
			r.onselect(U(i).e, e.currentTarget.getBoundingClientRect());
		}), X(t, a);
	}), c(ve), c(ge);
	var xe = A(ge, 2), Se = G(xe), Ce = G(Se);
	p(Ce, 20, () => v, (e) => e, (t, n) => {
		var r = $e();
		let i;
		var a = R(r, !0);
		P((t) => {
			i = u(r, "", i, { top: `${n * 48}px` }), e(a, t);
		}, [() => b(n)]), X(t, r);
	}), c(Ce);
	var we = A(Ce, 2);
	p(we, 21, () => r.days, D, (t, i, a) => {
		var s = at();
		let l;
		var d = G(s);
		p(d, 17, () => U(f)[a], (e) => e.e.calendar + e.e.uid + (e.e.rid ?? ""), (t, i) => {
			let a = Q(() => U(i).bottom - U(i).top < 40);
			var s = nt();
			let l, d;
			var f = G(s), p = R(f, !0), h = A(f, 2), g = R(h), _ = A(h, 2), v = (t) => {
				var n = et(), r = R(n, !0);
				P(() => e(r, U(i).e.location)), X(t, n);
			};
			O(_, (e) => {
				!U(a) && U(i).e.location && e(v);
			});
			var y = A(_, 2), b = (e) => {
				var t = tt();
				Y("pointerdown", t, (e) => re(e, "resize", U(i).e, U(i).top, U(i).bottom)), X(e, t);
			};
			O(y, (e) => {
				U(i).e.writable && !U(i).endsAfter && e(b);
			}), c(s), P((t, r, o, c, f, h, _, v, y) => {
				l = m(s, 1, "ev svelte-16enfn0", null, l, {
					sel: t,
					short: U(a),
					over: U(i).depth > 0,
					ro: !U(i).e.writable,
					cancel: U(i).e.status === "CANCELLED",
					free: U(i).e.free,
					ghosted: U(E)?.e === U(i).e && U(E).moved
				}), n(s, "title", r), n(s, "aria-label", `${U(i).e.summary ?? ""}, ${o ?? ""}`), d = u(s, "", d, {
					"--c": c,
					top: `${U(i).top / 60 * 48}px`,
					height: f,
					left: h,
					width: _,
					"--depth": U(i).depth
				}), e(p, U(i).e.summary || "(no title)"), e(g, `${v ?? ""}${y ?? ""}`);
			}, [
				() => C(U(i).e),
				() => te(U(i).e),
				() => oe(W(U(i).e), o().h12),
				() => T(U(i).e),
				() => `${Math.max(14, (U(i).bottom - U(i).top) / 60 * 48 - 2)}px`,
				() => ee(U(i).box.x, U(i).box.xpx + 1),
				() => ee(U(i).box.w, U(i).box.wpx - 3),
				() => oe(W(U(i).e), o().h12),
				() => U(a) ? "" : ` – ${oe(ue(U(i).e), o().h12)}`
			]), Y("contextmenu", s, (e) => r.onmenu(U(i).e, e)), Y("pointerdown", s, (e) => U(i).startsBefore || U(i).endsAfter ? e.stopPropagation() : re(e, "move", U(i).e, U(i).top, U(i).bottom)), Y("click", s, (e) => {
				(U(i).startsBefore || U(i).endsAfter) && r.onselect(U(i).e, e.currentTarget.getBoundingClientRect());
			}), Y("keydown", s, (e) => {
				e.key === "Enter" && r.onselect(U(i).e, e.currentTarget.getBoundingClientRect());
			}), X(t, s);
		});
		var h = A(d, 2), g = (t) => {
			var n = rt();
			let r;
			var i = G(n), a = R(i, !0), s = A(i, 2), l = R(s);
			c(n), P((t, i, s) => {
				r = u(n, "", r, {
					"--c": t,
					top: `${U(E).from / 60 * 48}px`,
					height: `${(U(E).to - U(E).from) / 60 * 48 - 2}px`,
					left: "1px",
					width: "calc(100% - 3px)"
				}), e(a, U(E).e?.summary ?? U(ie)?.t.title ?? o().placing?.title ?? "New event"), e(l, `${i ?? ""} – ${s ?? ""}`);
			}, [
				() => U(E).e ? T(U(E).e) : "var(--accent)",
				() => oe(new Date(2e3, 0, 1, 0, U(E).from), o().h12),
				() => oe(new Date(2e3, 0, 1, 0, U(E).to), o().h12)
			]), X(t, n);
		};
		O(h, (e) => {
			U(E) && U(E).moved && U(E).day === a && e(g);
		});
		var _ = A(h, 2), v = (e) => {
			var t = it();
			let n;
			P(() => n = u(t, "", n, { top: `${U(x) / 60 * 48}px` })), X(e, t);
		}, y = Q(() => w(U(i), o().now));
		O(_, (e) => {
			U(y) && e(v);
		}), c(s), P((e, t) => l = m(s, 1, "col svelte-16enfn0", null, l, {
			today: e,
			weekend: t
		}), [() => w(U(i), o().now), () => U(i).getDay() === 0 || U(i).getDay() === 6]), Y("pointerdown", s, (e) => re(e, "create")), X(t, s);
	}), c(we), l(we, (e) => $(d, e), () => U(d)), c(Se), c(xe), l(xe, (e) => $(s, e), () => U(s)), c(K), P(() => {
		q = u(K, "", q, {
			"--n": r.days.length,
			"--hour": "48px"
		}), _e = u(ge, "", _e, { "--rows": U(g) });
	}), Y("pointermove", we, F), Y("pointerup", we, I), ne("pointercancel", we, () => $(E, null)), X(t, K), i();
}
q([
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
	be(r, !0), fe(t, _t);
	let o = Q(() => Array.from({ length: Math.ceil(r.days.length / 7) }, (e, t) => r.days.slice(t * 7, t * 7 + 7))), s = Q(() => r.cal.cursor.getMonth()), l = (e) => e.color ?? r.cal.colorOf(e.calendar), d = (e) => r.selected !== null && r.selected.uid === e.uid && r.selected.rid === e.rid && r.selected.calendar === e.calendar, f = (e) => e.calendar + e.uid + (e.rid ?? "");
	function h(e) {
		let t = ce(r.cal.shownEvents(), e), n = Math.min(4, Math.max(0, ...t.map((e) => e.row + 1))), i = t.filter((e) => e.row < 4 - !!t.some((e) => e.row >= 4));
		return {
			bars: i,
			used: n,
			cells: e.map((e, a) => {
				let o = pe(r.cal.events, e).filter((e) => !ve(e)).sort((e, t) => W(e).getTime() - W(t).getTime()), s = t.filter((e) => e.from <= a && e.to >= a), c = s.filter((e) => !i.includes(e)).length, l = Math.max(0, 4 - n - 1), u = o.length + c <= l + 1 ? o.slice(0, l + 1) : o.slice(0, l);
				return {
					timed: u,
					more: o.length - u.length + c,
					total: o.length + s.length
				};
			})
		};
	}
	function g(e, t) {
		e.target.closest("button") || r.oncreate(a(t), N(a(t), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var _ = gt();
	let v;
	var y = G(_);
	p(y, 21, () => U(o)[0] ?? [], (e) => e.getDay(), (t, n) => {
		var r = lt(), i = R(r, !0);
		P((t) => e(i, t), [() => U(n).toLocaleDateString(void 0, { weekday: "short" })]), X(t, r);
	}), c(y);
	var b = A(y, 2);
	p(b, 21, () => U(o), D, (t, i) => {
		let a = Q(() => h(U(i)));
		var o = ht(), _ = G(o);
		p(_, 17, () => U(i), D, (t, i, a) => {
			var o = ut();
			let l;
			u(o, "", {}, { "grid-column": a + 1 });
			var d = G(o), f = R(d, !0);
			c(o), P((t, r, i, a, s) => {
				l = m(o, 1, "cell svelte-13jyj5s", null, l, {
					other: t,
					today: r,
					weekend: i
				}), n(o, "aria-label", `New event on ${a ?? ""}`), e(f, s);
			}, [
				() => U(i).getMonth() !== U(s),
				() => w(U(i), r.cal.now),
				() => U(i).getDay() === 0 || U(i).getDay() === 6,
				() => U(i).toLocaleDateString(),
				() => U(i).getDate() === 1 ? U(i).toLocaleDateString(void 0, {
					day: "numeric",
					month: "short"
				}) : U(i).getDate()
			]), Y("click", o, (e) => g(e, U(i))), Y("keydown", o, () => {}), Y("click", d, () => r.cal.go(U(i), "day")), X(t, o);
		});
		var v = A(_, 2);
		p(v, 17, () => U(a).bars, (e) => f(e.e) + e.from, (t, i) => {
			var a = dt();
			let o, s;
			var c = R(a, !0);
			P((t, r) => {
				o = m(a, 1, "bar svelte-13jyj5s", null, o, {
					sel: t,
					clipl: U(i).clippedStart,
					clipr: U(i).clippedEnd
				}), n(a, "title", U(i).e.summary), s = u(a, "", s, {
					"--c": r,
					"grid-column": `${U(i).from + 1} / ${U(i).to + 2}`,
					"grid-row": U(i).row + 2
				}), e(c, U(i).e.summary || "(no title)");
			}, [() => d(U(i).e), () => l(U(i).e)]), Y("click", a, (e) => r.onselect(U(i).e, e.currentTarget.getBoundingClientRect())), Y("contextmenu", a, (e) => r.onmenu(U(i).e, e)), X(t, a);
		});
		var y = A(v, 2);
		p(y, 17, () => U(a).cells, D, (t, o, s) => {
			var h = mt(), g = B(h);
			p(g, 19, () => U(o).timed, (e) => f(e), (t, i, o) => {
				var f = ft();
				let p, h;
				var g = A(G(f)), _ = R(g, !0), v = A(g), y = R(v, !0);
				c(f), P((t, r, c, l) => {
					p = m(f, 1, "line svelte-13jyj5s", null, p, {
						sel: t,
						cancel: U(i).status === "CANCELLED"
					}), n(f, "title", `${r ?? ""} ${U(i).summary ?? ""}`), h = u(f, "", h, {
						"--c": c,
						"grid-column": s + 1,
						"grid-row": U(a).used + 2 + U(o)
					}), e(_, l), e(y, U(i).summary || "(no title)");
				}, [
					() => d(U(i)),
					() => oe(W(U(i)), r.cal.h12),
					() => l(U(i)),
					() => oe(W(U(i)), r.cal.h12)
				]), Y("click", f, (e) => r.onselect(U(i), e.currentTarget.getBoundingClientRect())), Y("contextmenu", f, (e) => r.onmenu(U(i), e)), X(t, f);
			});
			var _ = A(g, 2), v = (t) => {
				var n = pt();
				let c;
				var l = R(n);
				P(() => {
					c = u(n, "", c, {
						"grid-column": s + 1,
						"grid-row": U(a).used + 2 + U(o).timed.length
					}), e(l, `+${U(o).more ?? ""} more`);
				}), Y("click", n, () => r.cal.go(U(i)[s], "day")), X(t, n);
			};
			O(_, (e) => {
				U(o).more > 0 && e(v);
			}), X(t, h);
		}), c(o), X(t, o);
	}), c(b), c(_), P(() => v = u(_, "", v, { "--rows": U(o).length })), X(t, _), i();
}
q([
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
	be(r, !0), fe(t, At);
	let s = y(r, "search", 3, !1), l = Q(() => {
		if (s()) {
			let e = /* @__PURE__ */ new Map();
			for (let t of r.events) {
				let n = a(W(t)).getTime();
				e.set(n, [...e.get(n) ?? [], t]);
			}
			return [...e.entries()].map(([e, t]) => ({
				day: new Date(e),
				evs: t
			}));
		}
		let e = [], t = r.cal.span !== "60days";
		for (let n = r.from; n <= r.to; n = N(n, 1)) {
			let i = pe(r.events, n).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || W(e).getTime() - W(t).getTime());
			(i.length || t) && e.push({
				day: n,
				evs: i
			});
		}
		return e;
	}), d = (e) => e.color ?? r.cal.colorOf(e.calendar), f = (e) => r.selected !== null && r.selected.uid === e.uid && r.selected.rid === e.rid && r.selected.calendar === e.calendar;
	function h(e, t) {
		if (e.all_day) return "All day";
		let n = W(e), i = ue(e);
		return `${w(n, t) ? oe(n, r.cal.h12) : "…"} – ${w(i, t) || i.getTime() - a(t).getTime() <= 864e5 && i.getHours() === 0 && i.getMinutes() === 0 ? oe(i, r.cal.h12) : "…"}`;
	}
	var g = kt(), _ = G(g), v = (t) => {
		var i = bt();
		p(i, 21, () => K, ([e, t]) => e, (t, i) => {
			var a = Q(() => o(U(i), 2));
			let s = () => U(a)[0], c = () => U(a)[1];
			var l = yt();
			let u;
			var d = R(l, !0);
			P(() => {
				n(l, "aria-pressed", r.cal.span === s()), u = m(l, 1, "svelte-zo3qq8", null, u, { on: r.cal.span === s() }), e(d, c());
			}), Y("click", l, () => r.cal.setSpan(s())), X(t, l);
		}), c(i), X(t, i);
	};
	O(_, (e) => {
		s() || e(v);
	});
	var b = A(_, 2), x = (t) => {
		var n = xt(), r = R(n, !0);
		P(() => e(r, s() ? "No event matches." : "Nothing in the coming days.")), X(t, n);
	};
	O(b, (e) => {
		U(l).length || e(x);
	});
	var C = A(b, 2);
	p(C, 17, () => U(l), (e) => e.day.getTime(), (t, i) => {
		var a = Ot();
		let o;
		var s = G(a), l = G(s), g = R(l, !0), _ = A(l, 2), v = G(_, !0), y = A(v, 2, !0);
		c(_), c(s);
		var b = A(s, 2), x = G(b), C = (e) => {
			var t = St();
			X(e, t);
		};
		O(x, (e) => {
			U(i).evs.length || e(C);
		});
		var T = A(x, 2);
		p(T, 17, () => U(i).evs, (e) => e.calendar + e.uid + (e.rid ?? ""), (t, a) => {
			var o = Dt();
			let s;
			var l = G(o), p = (e) => {
				let t = Q(() => U(a).task);
				var i = Ct();
				P(() => n(i, "aria-label", `Mark “${U(a).summary ?? ""}” as done`)), Y("click", i, () => r.cal.tick(U(t))), X(e, i);
			};
			O(l, (e) => {
				U(a).task && r.cal.canTick && U(a).task.line != null && e(p);
			});
			var g = A(l, 2);
			let _, v;
			var y = A(G(g), 2), b = R(y, !0), x = A(y, 2), C = G(x, !0), w = A(C), T = (t) => {
				var n = wt(), r = R(n);
				P(() => e(r, ` · ${U(a).location ?? ""}`)), X(t, n);
			};
			O(w, (e) => {
				U(a).location && e(T);
			}), c(x);
			var ee = A(x, 2), te = (e) => {
				var t = Tt(), n = G(t);
				V(n, {
					name: "repeat",
					size: 13
				}), c(t), X(e, t);
			};
			O(ee, (e) => {
				U(a).recurring && e(te);
			});
			var E = A(ee, 2), D = (e) => {
				var t = Et(), n = G(t);
				V(n, {
					name: "note",
					size: 13
				}), c(t), X(e, t);
			}, k = Q(() => S(U(a)));
			O(E, (e) => {
				U(k) && e(D);
			});
			var j = A(E, 2), M = R(j, !0);
			c(g), c(o), P((t, n, r) => {
				s = m(o, 1, "svelte-zo3qq8", null, s, { task: !!U(a).task }), _ = m(g, 1, "row svelte-zo3qq8", null, _, {
					sel: t,
					cancel: U(a).status === "CANCELLED"
				}), v = u(g, "", v, { "--c": n }), e(b, r), e(C, U(a).summary || "(no title)"), e(M, U(a).calendar_name);
			}, [
				() => f(U(a)),
				() => d(U(a)),
				() => h(U(a), U(i).day)
			]), Y("click", g, (e) => r.onselect(U(a), e.currentTarget.getBoundingClientRect())), Y("contextmenu", g, (e) => r.onmenu(U(a), e)), X(t, o);
		}), c(b), c(a), P((t, n, r, i) => {
			o = m(a, 1, "day svelte-zo3qq8", null, o, { today: t }), e(g, n), e(v, r), e(y, i);
		}, [
			() => w(U(i).day, r.cal.now),
			() => U(i).day.getDate(),
			() => U(i).day.toLocaleDateString(void 0, { weekday: "short" }),
			() => U(i).day.toLocaleDateString(void 0, {
				month: "short",
				year: U(i).day.getFullYear() === r.cal.now.getFullYear() ? void 0 : "numeric"
			})
		]), Y("click", s, () => r.cal.go(U(i).day, "day")), X(t, a);
	}), c(g), X(t, g), i();
}
q(["click", "contextmenu"]);
//#endregion
//#region plugins/stable/dav/ui/src/YearView.svelte
var Mt = J("<span class=\"h svelte-18a11kl\"> </span>"), Nt = J("<button> </button>"), Pt = J("<span></span>"), Ft = J("<section><button class=\"mname svelte-18a11kl\"> </button> <div class=\"days svelte-18a11kl\"><!> <!></div></section>"), It = J("<div class=\"year svelte-18a11kl\"></div>"), Lt = {
	hash: "svelte-18a11kl",
	code: ".year.svelte-18a11kl {height:100%;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(210px, 1fr));gap:18px 24px;padding:16px 20px 40px;align-content:start;}.mname.svelte-18a11kl {all:unset;cursor:pointer;font-weight:650;color:var(--heading);margin-bottom:6px;display:block;}.mname.svelte-18a11kl:hover {color:var(--accent-strong);}.days.svelte-18a11kl {display:grid;grid-template-columns:repeat(7, 1fr);gap:2px;}.h.svelte-18a11kl {font-size:0.7em;color:var(--text-faint);text-align:center;}.d.svelte-18a11kl {all:unset;cursor:pointer;text-align:center;font-size:0.78em;padding:3px 0;border-radius:var(--radius-sm);font-variant-numeric:tabular-nums;color:var(--text-muted);background:color-mix(in srgb, var(--accent) calc(var(--k) * 55%), transparent);}.d.svelte-18a11kl:hover {outline:1px solid var(--accent);}.d.svelte-18a11kl:focus-visible {outline:2px solid var(--accent);}.d.today.svelte-18a11kl {background:var(--accent);color:var(--accent-fg);font-weight:700;}"
};
function Rt(t, r) {
	be(r, !0), fe(t, Lt);
	let a = Q(() => r.cal.cursor.getFullYear()), o = Q(() => {
		let e = /* @__PURE__ */ new Map();
		for (let t = new Date(U(a), 0, 1); t.getFullYear() === U(a); t = N(t, 1)) e.set(t.toDateString(), pe(r.cal.events, t).length);
		return e;
	}), s = Q(() => Math.max(1, ...U(o).values()));
	function l(e) {
		let t = v(new Date(U(a), e, 1), r.cal.first);
		return Array.from({ length: 42 }, (e, n) => N(t, n));
	}
	let d = Q(() => Array.from({ length: 7 }, (e, t) => N(v(/* @__PURE__ */ new Date(), r.cal.first), t).toLocaleDateString(void 0, { weekday: "narrow" })));
	var f = It();
	p(f, 20, () => Array.from({ length: 12 }, (e, t) => t), (e) => e, (t, i) => {
		var f = Ft(), h = G(f), g = R(h, !0), _ = A(h, 2), v = G(_);
		p(v, 17, () => U(d), D, (t, n) => {
			var r = Mt(), i = R(r, !0);
			P(() => e(i, U(n))), X(t, r);
		});
		var y = A(v, 2);
		p(y, 17, () => l(i), (e) => e.getTime(), (t, a) => {
			let c = Q(() => U(a).getMonth() === i ? U(o).get(U(a).toDateString()) ?? 0 : 0);
			var l = le(), d = B(l), f = (t) => {
				var i = Nt();
				let o, l;
				var d = R(i, !0);
				P((t, r, a) => {
					o = m(i, 1, "d svelte-18a11kl", null, o, { today: t }), n(i, "title", `${r ?? ""}: ${U(c) ?? ""} event${U(c) === 1 ? "" : "s"}`), l = u(i, "", l, { "--k": U(c) / U(s) }), e(d, a);
				}, [
					() => w(U(a), r.cal.now),
					() => U(a).toLocaleDateString(),
					() => U(a).getDate()
				]), Y("click", i, () => r.cal.go(U(a), "day")), X(t, i);
			}, p = Q(() => U(a).getMonth() === i), h = (e) => {
				var t = Pt();
				X(e, t);
			};
			O(d, (e) => {
				U(p) ? e(f) : e(h, -1);
			}), X(t, l);
		}), c(_), c(f), P((t) => e(g, t), [() => new Date(U(a), i, 1).toLocaleDateString(void 0, { month: "long" })]), Y("click", h, () => r.cal.go(new Date(U(a), i, 1), "month")), X(t, f);
	}), c(f), X(t, f), i();
}
q(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/CalendarPicker.svelte
var zt = J("<option> </option>"), Bt = J("<optgroup></optgroup>"), Vt = J("<span><span class=\"dot svelte-zssqw9\" aria-hidden=\"true\"></span> <select aria-label=\"Calendar\" class=\"svelte-zssqw9\"><!><!></select></span>"), Ht = {
	hash: "svelte-zssqw9",
	code: ".pick.svelte-zssqw9 {display:inline-flex;align-items:center;gap:8px;min-width:0;flex:1;}.pick.compact.svelte-zssqw9 {flex:0 1 auto;}.dot.svelte-zssqw9 {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}select.svelte-zssqw9 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 28px 5px 8px;min-width:0;flex:1;color-scheme:light dark;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.compact.svelte-zssqw9 select:where(.svelte-zssqw9) {flex:0 1 auto;max-width:16em;}select.svelte-zssqw9:disabled {opacity:0.6;}select.svelte-zssqw9:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}"
};
function Ut(t, r) {
	be(r, !0), fe(t, Ht);
	let a = y(r, "value", 15), o = y(r, "disabled", 3, !1), s = y(r, "compact", 3, !1), l = Q(() => r.cal.byAccount(!0)), f = Q(() => U(l).length > 1), h = (e) => r.cal.sources.find((t) => t.id === e)?.name ?? e;
	var g = Vt();
	let _;
	var v = G(g);
	let b;
	var x = A(v, 2), S = G(x), C = (t) => {
		var n = zt(), r = R(n, !0), i = {};
		P((t) => {
			e(r, t), i !== (i = a()) && (n.value = (n.__value = i) ?? "");
		}, [() => h(a())]), X(t, n);
	}, w = Q(() => a() && !U(l).some((e) => e.items.some((e) => e.id === a())));
	O(S, (e) => {
		U(w) && e(C);
	});
	var T = A(S);
	p(T, 17, () => U(l), (e) => e.account.name, (t, r) => {
		var i = le(), a = B(i), o = (t) => {
			var i = Bt();
			p(i, 21, () => U(r).items, (e) => e.id, (t, n) => {
				var r = zt(), i = R(r, !0), a = {};
				P(() => {
					e(i, U(n).name), a !== (a = U(n).id) && (r.value = (r.__value = a) ?? "");
				}), X(t, r);
			}), c(i), P(() => n(i, "label", U(r).account.name)), X(t, i);
		}, s = (t) => {
			var n = le(), i = B(n);
			p(i, 17, () => U(r).items, (e) => e.id, (t, n) => {
				var r = zt(), i = R(r, !0), a = {};
				P(() => {
					e(i, U(n).name), a !== (a = U(n).id) && (r.value = (r.__value = a) ?? "");
				}), X(t, r);
			}), X(t, n);
		};
		O(a, (e) => {
			U(f) ? e(o) : e(s, -1);
		}), X(t, i);
	}), c(x), ee(x), c(g), P((e) => {
		_ = m(g, 1, "pick svelte-zssqw9", null, _, { compact: s() }), b = u(v, "", b, { "--c": e }), x.disabled = o(), n(x, "title", a());
	}, [() => a() ? r.cal.colorOf(a()) : "transparent"]), d(x, a), X(t, g), i();
}
//#endregion
//#region plugins/stable/dav/ui/src/Popover.svelte
var Wt = J("<button class=\"atlas-btn primary svelte-id2g6u\"><!>Time-block…</button>"), Gt = J("<div class=\"bar svelte-id2g6u\"><button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <div class=\"head svelte-id2g6u\"><span class=\"tsq svelte-id2g6u\" aria-hidden=\"true\"></span> <div><h2 class=\"svelte-id2g6u\"> </h2> <p class=\"when svelte-id2g6u\"> </p></div></div> <p class=\"line faint svelte-id2g6u\"><!> </p> <div class=\"acts start svelte-id2g6u\"><!> <button class=\"atlas-btn svelte-id2g6u\"><!>Open the note</button></div>", 1), Kt = J("<button class=\"tool svelte-id2g6u\" title=\"Edit (e)\"><!></button> <button class=\"tool svelte-id2g6u\" title=\"Delete (Del)\"><!></button>", 1), qt = J("<p class=\"sub svelte-id2g6u\"><!> </p>"), Jt = J("<p class=\"sub warn svelte-id2g6u\">Cancelled</p>"), Yt = J("<button> </button>"), Xt = J("<div class=\"answer svelte-id2g6u\" role=\"group\" aria-label=\"Going?\"><span class=\"svelte-id2g6u\">Going?</span> <!></div>"), Zt = J("<a class=\"atlas-btn join svelte-id2g6u\" target=\"_blank\" rel=\"noreferrer\" data-outside=\"\" title=\"Opens in your browser (Teams, Zoom… take it from there)\"><!>Join the meeting</a>"), Qt = J("<a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a>"), $t = J("<p class=\"line svelte-id2g6u\"><!><!></p>"), en = J("<li> <span class=\"faint svelte-id2g6u\">organiser</span></li>"), tn = J("<li> <span> </span></li>"), nn = J("<li class=\"faint svelte-id2g6u\"> </li>"), rn = J("<div class=\"line people svelte-id2g6u\"><!> <ul class=\"svelte-id2g6u\"><!> <!> <!></ul></div>"), an = J("<p class=\"line desc svelte-id2g6u\"><!><span class=\"svelte-id2g6u\"> </span></p>"), on = J("<span aria-hidden=\"true\"></span>"), sn = J("<li><button><!> </button></li>"), cn = J("<div class=\"line linked svelte-id2g6u\"><!> <ul aria-label=\"Linked\" class=\"svelte-id2g6u\"></ul></div>"), ln = J("<li><button class=\"lk svelte-id2g6u\"> </button></li>"), un = J("<div class=\"line linked svelte-id2g6u\"><!> <ul aria-label=\"Linked from\" class=\"svelte-id2g6u\"></ul></div>"), dn = J("<div class=\"acts start svelte-id2g6u\"><button class=\"atlas-btn svelte-id2g6u\" title=\"Link a note (or a mail saved as a note) to this event\"><!>Link a note…</button> <button class=\"atlas-btn svelte-id2g6u\" title=\"Search your mail and link a conversation to this event (it is saved as a note)\"><!>Link a mail…</button></div>"), fn = J("<button class=\"atlas-btn svelte-id2g6u\"><!>Open the note</button>"), pn = J("<button class=\"atlas-btn svelte-id2g6u\" title=\"A note of its own for this event: its time and place as properties, your writing below\"><!>Make a note</button>"), mn = J("<p class=\"line svelte-id2g6u\"><!><a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a></p>"), hn = J("<div class=\"bar svelte-id2g6u\"><!> <button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <div class=\"head svelte-id2g6u\"><span class=\"sq svelte-id2g6u\"></span> <div><h2> </h2> <p class=\"when svelte-id2g6u\"> </p> <!> <!></div></div> <!> <!> <!> <!> <!> <p class=\"line faint svelte-id2g6u\"><!> </p> <!> <!> <!> <!> <!>", 1), gn = J("<div class=\"bar svelte-id2g6u\"><button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <input class=\"title svelte-id2g6u\" placeholder=\"Add a title\" aria-label=\"Title\"/> <p class=\"when svelte-id2g6u\"> </p> <div class=\"line faint svelte-id2g6u\"><!><!></div> <div class=\"acts svelte-id2g6u\"><button class=\"atlas-btn svelte-id2g6u\">More options</button> <button class=\"atlas-btn primary svelte-id2g6u\">Save</button></div>", 1), _n = J("<div class=\"pop svelte-id2g6u\" role=\"dialog\"><!></div>"), vn = {
	hash: "svelte-id2g6u",
	code: ".pop.svelte-id2g6u {position:absolute;z-index:50;width:min(360px, calc(100% - 16px));box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:8px 14px 14px;display:grid;gap:8px; animation: svelte-id2g6u-in 120ms var(--ease);}\n  @keyframes svelte-id2g6u-in { from { opacity: 0; transform: translateY(4px); } }\n  @media (prefers-reduced-motion: reduce) {.pop.svelte-id2g6u { animation: none;} }.bar.svelte-id2g6u {display:flex;justify-content:flex-end;gap:2px;margin:0 -8px -4px 0;}.tool.svelte-id2g6u {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-id2g6u:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-id2g6u:focus-visible {outline:2px solid var(--accent);}.head.svelte-id2g6u {display:flex;gap:12px;align-items:flex-start;}.sq.svelte-id2g6u {width:14px;height:14px;border-radius:4px;background:var(--c);flex:none;margin-top:5px;}h2.svelte-id2g6u {margin:0;font-size:1.15em;font-weight:600;color:var(--heading);overflow-wrap:anywhere;}.cancel.svelte-id2g6u {text-decoration:line-through;}.when.svelte-id2g6u {margin:2px 0 0;color:var(--text-muted);font-size:0.92em;}.sub.svelte-id2g6u {margin:2px 0 0;color:var(--text-faint);font-size:0.85em;display:flex;align-items:center;gap:4px;}.warn.svelte-id2g6u {color:var(--red);}.line.svelte-id2g6u {margin:0;display:flex;gap:10px;align-items:flex-start;color:var(--text);font-size:0.9em;min-width:0;overflow-wrap:anywhere;}.line.svelte-id2g6u .icon {margin-top:2px;color:var(--text-faint);}.desc.svelte-id2g6u span:where(.svelte-id2g6u) {white-space:pre-wrap;max-height:9em;overflow:auto;}.people.svelte-id2g6u ul:where(.svelte-id2g6u) {list-style:none;margin:0;padding:0;display:grid;gap:2px;}.faint.svelte-id2g6u {color:var(--text-faint);}.ps.svelte-id2g6u {font-size:0.8em;color:var(--text-faint);}.ps-accepted.svelte-id2g6u {color:var(--green);}.ps-declined.svelte-id2g6u {color:var(--red);}.ps-tentative.svelte-id2g6u {color:var(--yellow);}a.svelte-id2g6u {color:var(--accent);}.atlas-btn.svelte-id2g6u {display:inline-flex;align-items:center;gap:6px;justify-self:start;}.title.svelte-id2g6u {all:unset;font-size:1.15em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--accent);padding:4px 0;}.title.svelte-id2g6u::placeholder {color:var(--text-faint);font-weight:400;}.join.svelte-id2g6u {text-decoration:none;}.answer.svelte-id2g6u {display:flex;align-items:center;gap:6px;padding:6px 0;font-size:0.9em;}.answer.svelte-id2g6u span:where(.svelte-id2g6u) {color:var(--text-muted);margin-right:auto;}.answer.svelte-id2g6u .chosen:where(.svelte-id2g6u) {background:var(--accent-soft);border-color:var(--accent);color:var(--accent-strong, var(--accent));}.acts.svelte-id2g6u {display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;}.acts.start.svelte-id2g6u {justify-content:flex-start;}.tsq.svelte-id2g6u {width:13px;height:13px;border:1.5px solid var(--text-muted);border-radius:4px;flex:none;margin-top:5px;box-sizing:border-box;}.tsq.small.svelte-id2g6u {width:10px;height:10px;margin:0;border-radius:3px;}.tsq.checked.svelte-id2g6u {background:var(--text-faint);border-color:var(--text-faint);}.linked.svelte-id2g6u ul:where(.svelte-id2g6u) {list-style:none;margin:0;padding:0;display:grid;gap:2px;min-width:0;}.lk.svelte-id2g6u {all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;color:var(--accent);overflow-wrap:anywhere;border-radius:var(--radius-sm);}.lk.svelte-id2g6u:hover {text-decoration:underline;}.lk.svelte-id2g6u:focus-visible {outline:2px solid var(--accent);}.lk.done.svelte-id2g6u {color:var(--text-muted);text-decoration:line-through;}"
};
function yn(t, r) {
	be(r, !0), fe(t, vn);
	let a = y(r, "e", 3, null), d = y(r, "draft", 3, null), f = M(void 0), h = M(""), g = M(Z(r.cal.newCalendar() ?? "")), v = M(void 0), b = M(Z({
		left: 0,
		top: 0
	}));
	function C() {
		let e = U(f)?.offsetWidth ?? 340, t = U(f)?.offsetHeight ?? 200, n = r.at.right - r.box.left + 8;
		n + e > r.box.width - 8 && (n = r.at.left - r.box.left - e - 8), n < 8 && (n = Math.max(8, Math.min(r.box.width - e - 8, r.at.left - r.box.left)));
		let i = r.at.top - r.box.top;
		i + t > r.box.height - 8 && (i = Math.max(8, r.box.height - t - 8)), $(b, {
			left: n,
			top: Math.max(8, i)
		}, !0);
	}
	_(() => {
		C(), U(v)?.focus();
	});
	async function w() {
		if (!d() || !U(g)) return;
		let e = (e) => String(e).padStart(2, "0"), t = (t) => `${t.getFullYear()}-${e(t.getMonth() + 1)}-${e(t.getDate())}T${e(t.getHours())}:${e(t.getMinutes())}`, n = (e) => t(e).slice(0, 10), i = {
			summary: U(h).trim() || "(no title)",
			start: d().all_day ? n(d().start) : t(d().start),
			end: d().all_day ? n(d().end) : t(d().end),
			all_day: d().all_day,
			calendar: U(g) || void 0
		};
		r.onclose(), await r.cal.create(i);
	}
	let ee = M(null), te = M(!1);
	_(() => {
		!a() || a().task || a().uid.startsWith("pending-") || a().calendar === "notes" || I(r.cal.atlas, "event", {
			uid: a().uid,
			rid: a().rid,
			start: a().start
		}).then((e) => {
			$(ee, e, !0), setTimeout(C, 0);
		}, () => {});
	});
	let E = Q(() => U(ee)?.note?.path ?? (a() ? S(a()) : null)), D = Q(() => (U(ee)?.backlinks?.links ?? []).filter((e) => e.source !== U(E) && !(U(ee)?.note?.links ?? []).some((t) => t.path === e.source)));
	async function k(e, t) {
		let n = await r.cal.atlas.noteProps(e).catch(() => ({})), i = (n.type === "email-thread" || n.type === "email") && typeof n.message_id == "string", a = !1;
		if (i) {
			let t = () => a = !0;
			window.addEventListener("atlas-email:heard", t, { once: !0 }), window.dispatchEvent(new CustomEvent("atlas-email:open-note", { detail: { path: e } })), window.removeEventListener("atlas-email:heard", t);
		}
		a || r.cal.atlas.open(e, t), r.onclose();
	}
	let N = (e) => void k(e.path, e.line), ne = M(!1);
	async function re(e) {
		if (a() && e) {
			$(ne, !0);
			try {
				await I(r.cal.atlas, "link_event", {
					uid: a().uid,
					rid: a().rid,
					start: a().start,
					link: e
				}, 60), $(ee, await I(r.cal.atlas, "event", {
					uid: a().uid,
					rid: a().rid,
					start: a().start
				}), !0), setTimeout(C, 0);
			} catch (e) {
				r.cal.toast(`Not linked: ${e.message}`, "error");
			} finally {
				$(ne, !1);
			}
		}
	}
	async function F() {
		if (!r.cal.atlas.pickNote) {
			r.cal.toast("Linking from here needs a newer Atlas: use “Calendar: link this note to an event…” in the note.", "error");
			return;
		}
		re(await r.cal.atlas.pickNote({
			placeholder: `Link which note or mail to “${a()?.summary ?? "this event"}”?`,
			tag: "Link to the event"
		}));
	}
	function ie() {
		let e = !1, t = () => e = !0;
		window.addEventListener("atlas-email:heard", t, { once: !0 }), window.dispatchEvent(new CustomEvent("atlas-email:pick", { detail: {
			seed: a()?.summary ?? "",
			reply: (e) => void re(e)
		} })), window.removeEventListener("atlas-email:heard", t), e || r.cal.toast("No Email plugin to choose a mail from: turn it on in Settings → Plugins.", "error");
	}
	async function L() {
		if (a() && !U(te)) {
			$(te, !0);
			try {
				let e = await I(r.cal.atlas, "event_note", {
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
	let z = Q(() => a() ? Se(a()) : null), ae = [
		["ACCEPTED", "Yes"],
		["TENTATIVE", "Maybe"],
		["DECLINED", "No"]
	], H = M(Z(a()?.answer));
	async function se(e) {
		if (!a() || U(H) === e) return;
		let t = U(H);
		$(H, e, !0), await r.cal.respond(a(), e) || $(H, t, !0);
	}
	let W = Q(() => d() ? d().all_day ? `${d().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · all day` : `${d().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · ${oe(d().start, r.cal.h12)} – ${oe(d().end, r.cal.h12)}` : "");
	var ce = _n();
	let le;
	var K = G(ce), q = (t) => {
		let n = Q(() => a().task);
		var i = Gt(), o = B(i), l = G(o), u = G(l);
		V(u, {
			name: "x",
			size: 15
		}), c(l), c(o);
		var d = A(o, 2), f = A(G(d), 2), p = G(f), m = R(p, !0), h = A(p, 2), g = R(h);
		c(f), c(d);
		var _ = A(d, 2), v = G(_);
		V(v, {
			name: "note",
			size: 14
		});
		var y = A(v, 1, !0);
		c(_);
		var b = A(_, 2), x = G(b), S = (e) => {
			var t = Wt(), i = G(t);
			V(i, {
				name: "clock",
				size: 14
			}), T(), c(t), Y("click", t, () => {
				r.cal.startPlacing(U(n)), r.onclose();
			}), X(e, t);
		};
		O(x, (e) => {
			U(n).props.from !== "note" && e(S);
		});
		var C = A(x, 2), w = G(C);
		V(w, {
			name: "note",
			size: 14
		}), T(), c(C), c(b), P((t, r) => {
			e(m, a().summary || "(no title)"), e(g, `${U(n).props.from === "note" ? "Due" : "Task"} · ${t ?? ""}`), e(y, r);
		}, [() => s(a(), r.cal.h12).replace(" · all day", ""), () => U(n).path.replace(/\.md$/, "")]), Y("click", l, function(...e) {
			r.onclose?.apply(this, e);
		}), Y("click", C, () => {
			r.cal.atlas.open(U(n).path, U(n).line ?? void 0), r.onclose();
		}), X(t, i);
	}, ue = (t) => {
		var i = hn(), l = B(i), d = G(l), f = (e) => {
			var t = Kt(), n = B(t), i = G(n);
			V(i, {
				name: "pen",
				size: 15
			}), c(n);
			var o = A(n, 2), s = G(o);
			V(s, {
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
		var h = A(d, 2), g = G(h);
		V(g, {
			name: "x",
			size: 15
		}), c(h), c(l);
		var _ = A(l, 2), v = G(_);
		let y;
		var b = A(v, 2), x = G(b);
		let S;
		var C = R(x, !0), w = A(x, 2), M = R(w, !0), re = A(w, 2), I = (t) => {
			var n = qt(), r = G(n);
			V(r, {
				name: "repeat",
				size: 12
			});
			var i = A(r);
			c(n), P((t) => e(i, ` ${t ?? ""}`), [() => ye(a().rrule) || "Repeats"]), X(t, n);
		};
		O(re, (e) => {
			a().recurring && e(I);
		});
		var oe = A(re, 2), W = (e) => {
			var t = Jt();
			X(e, t);
		};
		O(oe, (e) => {
			a().status === "CANCELLED" && e(W);
		}), c(b), c(_);
		var ce = A(_, 2), le = (t) => {
			var r = Xt(), i = A(G(r), 2);
			p(i, 17, () => ae, ([e, t]) => e, (t, r) => {
				var i = Q(() => o(U(r), 2));
				let a = () => U(i)[0], s = () => U(i)[1];
				var c = Yt();
				let l;
				var u = R(c, !0);
				P(() => {
					l = m(c, 1, "atlas-btn svelte-id2g6u", null, l, { chosen: U(H) === a() }), n(c, "aria-pressed", U(H) === a()), e(u, s());
				}), Y("click", c, () => void se(a())), X(t, c);
			}), c(r), X(t, r);
		};
		O(ce, (e) => {
			U(H) && e(le);
		});
		var K = A(ce, 2), q = (e) => {
			var t = Zt(), r = G(t);
			V(r, {
				name: "video",
				size: 14
			}), T(), c(t), P(() => n(t, "href", U(z))), X(e, t);
		};
		O(K, (e) => {
			U(z) && e(q);
		});
		var ue = A(K, 2), de = (t) => {
			var r = $t(), i = G(r);
			V(i, {
				name: "pin",
				size: 14
			});
			var o = A(i), s = (t) => {
				var r = Qt(), i = R(r, !0);
				P(() => {
					n(r, "href", a().location), e(i, a().location);
				}), X(t, r);
			}, l = Q(() => /^https?:\/\//.test(a().location)), u = (t) => {
				var n = j();
				P(() => e(n, a().location)), X(t, n);
			};
			O(o, (e) => {
				U(l) ? e(s) : e(u, -1);
			}), c(r), X(t, r);
		};
		O(ue, (e) => {
			a().location && e(de);
		});
		var fe = A(ue, 2), pe = (t) => {
			var n = rn(), r = G(n);
			V(r, {
				name: "people",
				size: 14
			});
			var i = A(r, 2), o = G(i), s = (t) => {
				var n = en(), r = G(n);
				T(), c(n), P(() => e(r, `${a().organizer.name ?? a().organizer.email ?? ""} `)), X(t, n);
			};
			O(o, (e) => {
				a().organizer && e(s);
			});
			var l = A(o, 2);
			p(l, 17, () => (a().attendees ?? []).slice(0, 8), (e) => e.email, (t, n) => {
				var r = tn(), i = G(r), a = A(i), o = R(a, !0);
				c(r), P((t, r) => {
					e(i, `${U(n).name ?? U(n).email ?? ""} `), m(a, 1, `ps ps-${t ?? ""}`, "svelte-id2g6u"), e(o, r);
				}, [() => (U(n).partstat ?? "needs-action").toLowerCase(), () => (U(n).partstat ?? "NEEDS-ACTION").toLowerCase().replace("needs-action", "no answer")]), X(t, r);
			});
			var u = A(l, 2), d = (t) => {
				var n = nn(), r = R(n);
				P(() => e(r, `and ${(a().attendees?.length ?? 0) - 8} more`)), X(t, n);
			};
			O(u, (e) => {
				(a().attendees?.length ?? 0) > 8 && e(d);
			}), c(i), c(n), X(t, n);
		};
		O(fe, (e) => {
			(a().organizer || a().attendees?.length) && e(pe);
		});
		var J = A(fe, 2), me = (t) => {
			var n = an(), r = G(n);
			V(r, {
				name: "text",
				size: 14
			});
			var i = A(r), o = R(i, !0);
			c(n), P(() => e(o, a().description)), X(t, n);
		};
		O(J, (e) => {
			a().description && e(me);
		});
		var he = A(J, 2), ge = G(he);
		V(ge, {
			name: "calendar",
			size: 14
		});
		var _e = A(ge);
		c(he);
		var ve = A(he, 2), Z = (t) => {
			var r = cn(), i = G(r);
			V(i, {
				name: "link",
				size: 14
			});
			var a = A(i, 2);
			p(a, 23, () => U(ee).note.links, (e, t) => e.link + ":" + t, (t, r) => {
				var i = sn(), a = G(i);
				let o;
				var s = G(a), l = (e) => {
					var t = on();
					let n;
					P(() => n = m(t, 1, "tsq small svelte-id2g6u", null, n, { checked: U(r).task === "x" })), X(e, t);
				};
				O(s, (e) => {
					U(r).task !== void 0 && e(l);
				});
				var u = A(s, 1, !0);
				c(a), c(i), P(() => {
					o = m(a, 1, "lk svelte-id2g6u", null, o, { done: U(r).task === "x" }), n(a, "title", U(r).path), e(u, U(r).title);
				}), Y("click", a, () => N(U(r))), X(t, i);
			}), c(a), c(r), X(t, r);
		};
		O(ve, (e) => {
			U(ee)?.note?.links.length && e(Z);
		});
		var be = A(ve, 2), xe = (t) => {
			var r = un(), i = G(r);
			V(i, {
				name: "backlink",
				size: 14
			});
			var a = A(i, 2);
			p(a, 23, () => U(D).slice(0, 6), (e, t) => e.source + ":" + e.line + ":" + t, (t, r) => {
				var i = ln(), a = G(i), o = R(a, !0);
				c(i), P((t) => {
					n(a, "title", U(r).context), e(o, t);
				}, [() => U(r).source.split("/").pop()?.replace(/\.md$/, "")]), Y("click", a, () => void k(U(r).source, U(r).line)), X(t, i);
			}), c(a), c(r), X(t, r);
		};
		O(be, (e) => {
			U(D).length && e(xe);
		});
		var Se = A(be, 2), $ = (e) => {
			var t = dn(), n = G(t), r = G(n);
			V(r, {
				name: "link",
				size: 14
			}), T(), c(n);
			var i = A(n, 2), a = G(i);
			V(a, {
				name: "mail",
				size: 14
			}), T(), c(i), c(t), P(() => {
				n.disabled = U(ne), i.disabled = U(ne);
			}), Y("click", n, F), Y("click", i, ie), X(e, t);
		}, Ce = Q(() => a().calendar !== "notes" && !a().uid.startsWith("pending-") && !a().task);
		O(Se, (e) => {
			U(Ce) && e($);
		});
		var we = A(Se, 2), Te = (e) => {
			var t = fn(), n = G(t);
			V(n, {
				name: "note",
				size: 14
			}), T(), c(t), Y("click", t, () => {
				r.cal.atlas.open(U(E)), r.onclose();
			}), X(e, t);
		}, Ee = (e) => {
			var t = pn(), n = G(t);
			V(n, {
				name: "note",
				size: 14
			}), T(), c(t), P(() => t.disabled = U(te)), Y("click", t, L), X(e, t);
		}, De = Q(() => a().calendar !== "notes" && !a().uid.startsWith("pending-"));
		O(we, (e) => {
			U(E) ? e(Te) : U(De) && e(Ee, 1);
		});
		var Oe = A(we, 2), ke = (t) => {
			var r = mn(), i = G(r);
			V(i, {
				name: "link",
				size: 14
			});
			var o = A(i), s = R(o, !0);
			c(r), P(() => {
				n(o, "href", a().url), e(s, a().url);
			}), X(t, r);
		};
		O(Oe, (e) => {
			a().url && e(ke);
		}), P((t, n) => {
			y = u(v, "", y, { "--c": t }), S = m(x, 1, "svelte-id2g6u", null, S, { cancel: a().status === "CANCELLED" }), e(C, a().summary || "(no title)"), e(M, n), e(_e, `${a().calendar_name ?? ""}${a().writable ? "" : " · read-only"}`);
		}, [() => a().color ?? r.cal.colorOf(a().calendar), () => s(a(), r.cal.h12)]), Y("click", h, function(...e) {
			r.onclose?.apply(this, e);
		}), X(t, i);
	}, de = (t) => {
		var n = gn(), i = B(n), a = G(i), o = G(a);
		V(o, {
			name: "x",
			size: 15
		}), c(a), c(i);
		var s = A(i, 2);
		Ce(s), l(s, (e) => $(v, e), () => U(v));
		var u = A(s, 2), d = R(u, !0), f = A(u, 2), p = G(f);
		V(p, {
			name: "calendar",
			size: 14
		});
		var m = A(p), _ = (e) => {
			Ut(e, {
				get cal() {
					return r.cal;
				},
				get value() {
					return U(g);
				},
				set value(e) {
					$(g, e, !0);
				}
			});
		}, y = (e) => {
			var t = j("No calendar to write to");
			X(e, t);
		};
		O(m, (e) => {
			U(g) ? e(_) : e(y, -1);
		}), c(f);
		var b = A(f, 2), S = G(b), C = A(S, 2);
		c(b), P(() => {
			e(d, U(W)), C.disabled = !U(g);
		}), Y("click", a, function(...e) {
			r.onclose?.apply(this, e);
		}), Y("keydown", s, (e) => {
			e.key === "Enter" ? (e.preventDefault(), w()) : e.key === "Escape" && (e.stopPropagation(), r.onclose());
		}), x(s, () => U(h), (e) => $(h, e)), Y("click", S, () => r.onmore(U(h), U(g))), Y("click", C, w), X(t, n);
	};
	O(K, (e) => {
		a()?.task ? e(q) : a() ? e(ue, 1) : d() && e(de, 2);
	}), c(ce), l(ce, (e) => $(f, e), () => U(f)), P(() => {
		n(ce, "aria-label", a() ? a().summary : "New event"), le = u(ce, "", le, {
			left: `${U(b).left ?? ""}px`,
			top: `${U(b).top ?? ""}px`
		});
	}), X(t, ce), i();
}
q(["click", "keydown"]);
//#endregion
//#region plugins/stable/dav/ui/src/Editor.svelte
var bn = J("<div class=\"scrim svelte-aeatm8\" role=\"presentation\"></div>"), xn = J("<header class=\"svelte-aeatm8\"><h2 class=\"svelte-aeatm8\"> </h2> <button class=\"tool svelte-aeatm8\" aria-label=\"Close\"><!></button></header>"), Sn = J("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Starts at\"/>"), Cn = J("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Ends at\"/>"), wn = J("<option> </option>"), Tn = J("<div class=\"row svelte-aeatm8\"><!><span class=\"guests svelte-aeatm8\"> <span class=\"faint svelte-aeatm8\"> </span></span></div>"), En = J("<div class=\"row svelte-aeatm8\"><!><input placeholder=\"Add guests (addresses, comma-separated): it becomes a meeting\" aria-label=\"Guests\" class=\"svelte-aeatm8\"/></div>"), Dn = J("<div class=\"atlas-notice error\"> </div>"), On = J("<!> <div tabindex=\"-1\"><!> <input class=\"title svelte-aeatm8\" placeholder=\"Add a title\" aria-label=\"Title\"/> <div class=\"row when svelte-aeatm8\"><!> <div class=\"times svelte-aeatm8\"><input type=\"date\" aria-label=\"Starts on\" class=\"svelte-aeatm8\"/> <!> <span class=\"to svelte-aeatm8\">to</span> <!> <input type=\"date\" aria-label=\"Ends on\" class=\"svelte-aeatm8\"/> <label class=\"check svelte-aeatm8\"><input type=\"checkbox\" class=\"svelte-aeatm8\"/> All day</label></div></div> <div class=\"row svelte-aeatm8\"><!> <select aria-label=\"Repeat\" class=\"svelte-aeatm8\"></select></div> <div class=\"row svelte-aeatm8\"><!><input placeholder=\"Add a place\" aria-label=\"Place\" class=\"svelte-aeatm8\"/></div> <div class=\"row svelte-aeatm8\"><!> <!></div> <!> <div class=\"row top svelte-aeatm8\"><!><textarea rows=\"5\" placeholder=\"Add a description\" aria-label=\"Description\" class=\"svelte-aeatm8\"></textarea></div> <p class=\"zone svelte-aeatm8\"> </p> <!> <footer class=\"svelte-aeatm8\"><span class=\"hint svelte-aeatm8\">Ctrl+Enter saves</span> <button class=\"atlas-btn\">Cancel</button> <button class=\"atlas-btn primary\">Save</button></footer></div>", 1), kn = {
	hash: "svelte-aeatm8",
	code: ".scrim.svelte-aeatm8 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 55%, transparent);z-index:70;}.ed.svelte-aeatm8 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(620px, calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:12px 18px 16px;display:grid;gap:12px;}.ed.bare.svelte-aeatm8 {position:static;transform:none;width:auto;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;background:var(--bg);padding:16px;align-content:start;}header.svelte-aeatm8 {display:flex;align-items:center;}h2.svelte-aeatm8 {flex:1;margin:0;font-size:0.85em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.tool.svelte-aeatm8 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;}.tool.svelte-aeatm8:hover {background:var(--bg-hover);}.title.svelte-aeatm8 {all:unset;font-size:1.35em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--border-strong);padding:4px 0;}.title.svelte-aeatm8:focus {border-bottom-color:var(--accent);}.title.svelte-aeatm8:focus-visible {outline:none;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8) {appearance:none;-webkit-appearance:none;padding-right:28px;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8):disabled {opacity:0.6;}.row.svelte-aeatm8 {display:flex;gap:12px;align-items:center;color:var(--text-faint);min-width:0;}.row.top.svelte-aeatm8 {align-items:flex-start;}.times.svelte-aeatm8 {display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.to.svelte-aeatm8 {color:var(--text-muted);}input.svelte-aeatm8:not(.title):not([type=checkbox]), select.svelte-aeatm8, textarea.svelte-aeatm8 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 8px;min-width:0;color-scheme:light dark;}.row.svelte-aeatm8 > input:where(.svelte-aeatm8), .row.svelte-aeatm8 > select:where(.svelte-aeatm8), textarea.svelte-aeatm8 {flex:1;}textarea.svelte-aeatm8 {resize:vertical;}input.svelte-aeatm8:focus-visible, select.svelte-aeatm8:focus-visible, textarea.svelte-aeatm8:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.hm.svelte-aeatm8 {width:5.5em;font-variant-numeric:tabular-nums;text-align:center;}.check.svelte-aeatm8 {display:flex;gap:6px;align-items:center;color:var(--text);margin-left:6px;}.guests.svelte-aeatm8 {color:var(--text);}.faint.svelte-aeatm8 {color:var(--text-faint);}.zone.svelte-aeatm8 {margin:0;color:var(--text-faint);font-size:0.82em;}footer.svelte-aeatm8 {display:flex;gap:8px;align-items:center;justify-content:flex-end;}.hint.svelte-aeatm8 {flex:1;color:var(--text-faint);font-size:0.82em;}"
};
function An(t, a) {
	be(a, !0), fe(t, kn);
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
	}), S = (o()?.attendees ?? []).map((e) => e.email).join(", "), w = M(Z(o() ? S : u().join(", "))), te = Q(() => new Set(a.cal.accounts.map((e) => (e.user ?? "").toLowerCase()).filter((e) => e.includes("@")))), E = Q(() => !!o()?.organizer?.email && !U(te).has(o().organizer.email.toLowerCase())), D = () => U(w).split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes("@")), k = M(void 0), j = M("");
	_(() => U(k)?.focus());
	let ne = Q(() => {
		let e = r(/* @__PURE__ */ new Date(`${b.sday}T12:00`));
		return b.rrule && !e.some((e) => e.value === b.rrule) && e.push({
			value: b.rrule,
			label: ye(b.rrule) || b.rrule
		}), e;
	}), re = Q(() => a.cal.writable());
	function F() {
		return {
			start: b.all_day ? b.sday : `${b.sday}T${b.stime}`,
			end: b.all_day ? (() => {
				let e = N(/* @__PURE__ */ new Date(`${b.eday}T12:00`), 1);
				return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
			})() : `${b.eday}T${b.etime}`
		};
	}
	async function I() {
		let { start: e, end: t } = F();
		if (t <= e && !(b.all_day && t > e)) {
			$(j, "The end is before the start.");
			return;
		}
		let n = U(w).split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
		if (n.length) {
			$(j, `Not an address: ${n.join(", ")}`);
			return;
		}
		let r = !U(E) && U(w) !== S ? D() : void 0, i = {
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
	function ie(e) {
		e.key === "Escape" ? (e.stopPropagation(), a.onclose()) : e.key === "Enter" && (e.ctrlKey || e.metaKey) && (e.preventDefault(), I());
	}
	function L(e, t) {
		let n = e.trim().toLowerCase().match(/^(\d{1,2})(?:[:h.]?(\d{2}))?\s*(am|pm|h)?$/);
		if (!n) return t;
		let r = Number(n[1]), i = Number(n[2] ?? 0);
		return n[3] === "pm" && r < 12 && (r += 12), n[3] === "am" && r === 12 && (r = 0), r > 23 || i > 59 ? t : `${String(r).padStart(2, "0")}:${String(i).padStart(2, "0")}`;
	}
	function z() {
		if (`${b.eday}T${b.etime}` <= `${b.sday}T${b.stime}` && (b.eday = b.sday, !b.all_day)) {
			let [e, t] = b.stime.split(":").map(Number);
			b.etime = `${String(Math.min(23, e + 1)).padStart(2, "0")}:${String(t).padStart(2, "0")}`;
		}
	}
	var ae = On(), H = B(ae), oe = (e) => {
		var t = bn();
		Y("click", t, function(...e) {
			a.onclose?.apply(this, e);
		}), X(e, t);
	};
	O(H, (e) => {
		v() === "sheet" && e(oe);
	});
	var se = A(H, 2);
	let W;
	var ce = G(se), le = (t) => {
		var n = xn(), r = G(n), i = R(r, !0), s = A(r, 2), l = G(s);
		V(l, { name: "x" }), c(s), c(n), P(() => e(i, o() ? "Edit event" : "New event")), Y("click", s, function(...e) {
			a.onclose?.apply(this, e);
		}), X(t, n);
	};
	O(ce, (e) => {
		v() === "sheet" && e(le);
	});
	var K = A(ce, 2);
	Ce(K), l(K, (e) => $(k, e), () => U(k));
	var q = A(K, 2), ue = G(q);
	V(ue, { name: "clock" });
	var de = A(ue, 2), pe = G(de);
	Ce(pe);
	var J = A(pe, 2), me = (e) => {
		var t = Sn();
		Ce(t), Y("change", t, () => {
			b.stime = L(b.stime, "09:00"), z();
		}), x(t, () => b.stime, (e) => b.stime = e), X(e, t);
	};
	O(J, (e) => {
		b.all_day || e(me);
	});
	var he = A(J, 4), ge = (e) => {
		var t = Cn();
		Ce(t), Y("change", t, () => b.etime = L(b.etime, "10:00")), x(t, () => b.etime, (e) => b.etime = e), X(e, t);
	};
	O(he, (e) => {
		b.all_day || e(ge);
	});
	var _e = A(he, 2);
	Ce(_e);
	var ve = A(_e, 2), xe = G(ve);
	Ce(xe), T(), c(ve), c(de), c(q);
	var Se = A(q, 2), we = G(Se);
	V(we, { name: "repeat" });
	var Te = A(we, 2);
	p(Te, 21, () => U(ne), (e) => e.value, (t, n) => {
		var r = wn(), i = R(r, !0), a = {};
		P(() => {
			e(i, U(n).label), a !== (a = U(n).value) && (r.value = (r.__value = a) ?? "");
		}), X(t, r);
	}), c(Te), ee(Te), c(Se);
	var Ee = A(Se, 2), De = G(Ee);
	V(De, { name: "pin" });
	var Oe = A(De);
	Ce(Oe), c(Ee);
	var ke = A(Ee, 2), Ae = G(ke);
	V(Ae, { name: "calendar" });
	var je = A(Ae, 2);
	{
		let e = Q(() => !!o() && o().recurring);
		Ut(je, {
			get cal() {
				return a.cal;
			},
			get disabled() {
				return U(e);
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
	var Me = A(ke, 2), Ne = (t) => {
		var n = Tn(), r = G(n);
		V(r, { name: "people" });
		var i = A(r), a = G(i), s = A(a), l = R(s);
		c(i), c(n), P((t) => {
			e(a, `${t ?? ""} `), e(l, `· organised by ${o()?.organizer?.name ?? o()?.organizer?.email ?? ""}`);
		}, [() => (o()?.attendees ?? []).map((e) => e.name ?? e.email).join(", ")]), X(t, n);
	}, Pe = (e) => {
		var t = En(), n = G(t);
		V(n, { name: "people" });
		var r = A(n);
		Ce(r), c(t), x(r, () => U(w), (e) => $(w, e)), X(e, t);
	};
	O(Me, (e) => {
		U(E) ? e(Ne) : e(Pe, -1);
	});
	var Fe = A(Me, 2), Ie = G(Fe);
	V(Ie, { name: "text" });
	var Le = A(Ie);
	C(Le), c(Fe);
	var Re = A(Fe, 2), ze = R(Re), Be = A(Re, 2), Ve = (t) => {
		var n = Dn(), r = R(n, !0);
		P(() => e(r, U(j))), X(t, n);
	};
	O(Be, (e) => {
		U(j) && e(Ve);
	});
	var He = A(Be, 2), Ue = A(G(He), 2), We = A(Ue, 2);
	c(He), c(se), P((t) => {
		W = m(se, 1, "ed svelte-aeatm8", null, W, { bare: v() === "dialog" }), n(se, "role", v() === "sheet" ? "dialog" : "form"), n(se, "aria-label", o() ? "Edit event" : "New event"), n(se, "aria-modal", v() === "sheet" ? "true" : void 0), e(ze, `Times in your zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""}${t ?? ""}`), We.disabled = !U(re).length;
	}, [() => o()?.tzid && o().tzid !== Intl.DateTimeFormat().resolvedOptions().timeZone ? ` · written in ${o().tzid}` : ""]), Y("keydown", se, ie), x(K, () => b.summary, (e) => b.summary = e), Y("change", pe, z), x(pe, () => b.sday, (e) => b.sday = e), x(_e, () => b.eday, (e) => b.eday = e), h(xe, () => b.all_day, (e) => b.all_day = e), d(Te, () => b.rrule, (e) => b.rrule = e), x(Oe, () => b.location, (e) => b.location = e), x(Le, () => b.description, (e) => b.description = e), Y("click", Ue, function(...e) {
		a.onclose?.apply(this, e);
	}), Y("click", We, I), X(t, ae), i();
}
q([
	"click",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/Toasts.svelte
var jn = J("<button class=\"svelte-osdry5\"> </button>"), Mn = J("<button class=\"svelte-osdry5\">Undo</button>"), Nn = J("<div><span class=\"text svelte-osdry5\"> </span> <!> <!> <button class=\"x svelte-osdry5\" aria-label=\"Close\">×</button></div>"), Pn = J("<div class=\"toasts svelte-osdry5\" aria-live=\"polite\"></div>"), Fn = {
	hash: "svelte-osdry5",
	code: ".toasts.svelte-osdry5 {position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:60;display:grid;gap:8px;justify-items:center;pointer-events:none;width:min(560px, calc(100% - 32px));}.toast.svelte-osdry5 {pointer-events:auto;display:flex;align-items:center;gap:12px;padding:9px 10px 9px 14px;border-radius:var(--radius);background:var(--heading);color:var(--bg);box-shadow:var(--shadow-md, var(--shadow-sm));max-width:100%; animation: svelte-osdry5-in 120ms var(--ease);}.toast.error.svelte-osdry5 {background:var(--red);color:#fff;}.text.svelte-osdry5 {min-width:0;overflow-wrap:anywhere;}button.svelte-osdry5 {all:unset;cursor:pointer;font-weight:700;color:var(--accent);padding:2px 6px;border-radius:var(--radius-sm);}.error.svelte-osdry5 button:where(.svelte-osdry5) {color:#fff;text-decoration:underline;}button.svelte-osdry5:hover {background:color-mix(in srgb, currentColor 14%, transparent);}button.svelte-osdry5:focus-visible {outline:2px solid currentColor;}.x.svelte-osdry5 {color:inherit;opacity:0.7;font-weight:400;}\n  @keyframes svelte-osdry5-in { from { opacity: 0; transform: translateY(6px); } }\n  @media (prefers-reduced-motion: reduce) {.toast.svelte-osdry5 { animation: none;} }"
};
function In(t, r) {
	be(r, !0), fe(t, Fn);
	var a = Pn();
	p(a, 21, () => r.cal.toasts, (e) => e.id, (t, i) => {
		var a = Nn();
		let o;
		var s = G(a), l = R(s, !0), u = A(s, 2), d = (t) => {
			var n = jn(), a = R(n, !0);
			P(() => e(a, U(i).action.label)), Y("click", n, async () => {
				r.cal.dismiss(U(i).id), await U(i).action?.run();
			}), X(t, n);
		};
		O(u, (e) => {
			U(i).action && e(d);
		});
		var f = A(u, 2), p = (e) => {
			var t = Mn();
			Y("click", t, async () => {
				r.cal.dismiss(U(i).id), await U(i).undo?.();
			}), X(e, t);
		};
		O(f, (e) => {
			U(i).undo && e(p);
		});
		var h = A(f, 2);
		c(a), P(() => {
			o = m(a, 1, "toast svelte-osdry5", null, o, { error: U(i).kind === "error" }), n(a, "role", U(i).kind === "error" ? "alert" : "status"), e(l, U(i).text);
		}), Y("click", h, () => r.cal.dismiss(U(i).id)), X(t, a);
	}), c(a), X(t, a), i();
}
q(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/keys.ts
var Ln = (e) => (t) => t.setView(e), Rn = [
	{
		id: "day",
		title: "Day",
		group: "Views",
		keys: "d, 1",
		run: Ln("day")
	},
	{
		id: "week",
		title: "Week",
		group: "Views",
		keys: "w, 2",
		run: Ln("week")
	},
	{
		id: "workweek",
		title: "Work week",
		group: "Views",
		keys: "x, 3",
		run: Ln("workweek")
	},
	{
		id: "month",
		title: "Month",
		group: "Views",
		keys: "m, 4",
		run: Ln("month")
	},
	{
		id: "agenda",
		title: "Agenda (schedule)",
		group: "Views",
		keys: "a, 5",
		run: Ln("agenda")
	},
	{
		id: "year",
		title: "Year",
		group: "Views",
		keys: "y, 6",
		run: Ln("year")
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
function zn(e) {
	let t = e.key.toLowerCase(), n = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
	return [...[
		e.ctrlKey || e.metaKey ? "ctrl" : "",
		e.altKey ? "alt" : "",
		e.shiftKey && !n ? "shift" : ""
	].filter(Boolean), t].join("+");
}
var Bn = new Map(Rn.flatMap((e) => (e.keys ?? "").split(",").map((e) => e.trim()).filter(Boolean).map((t) => [t, e])));
function Vn(e) {
	return e ? e.split(",").map((e) => e.trim()).filter(Boolean).slice(0, 2).map((e) => e.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowright", "→").replace("arrowleft", "←").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("backspace", "⌫").replace(/^(⇧)?([a-z])$/, (e, t, n) => t ? `⇧${n.toUpperCase()}` : n)) : [];
}
//#endregion
//#region plugins/stable/dav/ui/src/Shortcuts.svelte
var Hn = J("<kbd class=\"svelte-17nm084\"> </kbd>"), Un = J("<div class=\"row svelte-17nm084\"><span> </span><span class=\"keys svelte-17nm084\"></span></div>"), Wn = J("<section><h3 class=\"svelte-17nm084\"> </h3> <!></section>"), Gn = J("<div class=\"scrim svelte-17nm084\" role=\"presentation\"></div> <div class=\"sheet svelte-17nm084\" role=\"dialog\" aria-label=\"Keyboard shortcuts\" aria-modal=\"true\"><header class=\"svelte-17nm084\"><h2 class=\"svelte-17nm084\">Keyboard shortcuts</h2><button class=\"x svelte-17nm084\" aria-label=\"Close\">×</button></header> <div class=\"cols svelte-17nm084\"></div> <p class=\"hint svelte-17nm084\">Drag on the grid to make an event, drag one to move it, its lower edge to resize (15-minute steps). Esc cancels a drag.</p></div>", 1), Kn = {
	hash: "svelte-17nm084",
	code: ".scrim.svelte-17nm084 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 50%, transparent);z-index:70;}.sheet.svelte-17nm084 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(760px, calc(100% - 32px));max-height:calc(100% - 40px);overflow:auto;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 30px rgba(0,0,0,.3));padding:14px 18px;}header.svelte-17nm084 {display:flex;align-items:center;}h2.svelte-17nm084 {margin:0;flex:1;font-size:1.1em;color:var(--heading);}h3.svelte-17nm084 {margin:10px 0 4px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.cols.svelte-17nm084 {display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:4px 24px;}.row.svelte-17nm084 {display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:var(--text-muted);}.keys.svelte-17nm084 {display:flex;gap:4px;}kbd.svelte-17nm084 {font:600 0.85em var(--font-mono);padding:1px 6px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);}.hint.svelte-17nm084 {color:var(--text-faint);font-size:0.86em;margin:12px 0 0;}.x.svelte-17nm084 {all:unset;cursor:pointer;font-size:1.3em;padding:0 6px;color:var(--text-muted);}"
};
function qn(t, n) {
	be(n, !0), fe(t, Kn);
	let r = [...new Set(Rn.map((e) => e.group))];
	var a = Gn(), o = B(a), s = A(o, 2), l = G(s), u = A(G(l));
	c(l);
	var d = A(l, 2);
	p(d, 20, () => r, (e) => e, (t, n) => {
		var r = Wn(), i = G(r), a = R(i, !0), o = A(i, 2);
		p(o, 17, () => Rn.filter((e) => e.group === n && e.keys), (e) => e.id, (t, n) => {
			var r = Un(), i = G(r), a = R(i, !0), o = A(i);
			p(o, 20, () => Vn(U(n).keys), (e) => e, (t, n) => {
				var r = Hn(), i = R(r, !0);
				P(() => e(i, n)), X(t, r);
			}), c(o), c(r), P(() => e(a, U(n).title)), X(t, r);
		}), c(r), P(() => e(a, n)), X(t, r);
	}), c(d), T(2), c(s), Y("click", o, function(...e) {
		n.onclose?.apply(this, e);
	}), Y("click", u, function(...e) {
		n.onclose?.apply(this, e);
	}), X(t, a), i();
}
q(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/App.svelte
var Jn = J("<button class=\"tool svelte-1i74804\" title=\"Side panel (s)\" aria-label=\"Side panel\"><!></button>"), Yn = J("<span class=\"spin svelte-1i74804\" aria-label=\"Working\"></span>"), Xn = J("<option> </option>"), Zn = J("<select class=\"vsel svelte-1i74804\" aria-label=\"View\"></select>"), Qn = J("<button> </button>"), $n = J("<div class=\"seg svelte-1i74804\" role=\"group\" aria-label=\"View\"></div>"), er = J("<button class=\"tool svelte-1i74804\" title=\"Sync now (r)\" aria-label=\"Sync\"><!></button> <button class=\"tool svelte-1i74804\" title=\"All commands (Ctrl+K)\" aria-label=\"All commands\"><!></button>", 1), tr = J("<span class=\"qprev svelte-1i74804\"><b class=\"svelte-1i74804\"> </b> </span>"), nr = J("<div class=\"quick svelte-1i74804\"><!> <input placeholder=\"lunch with Ana tomorrow 13:00 · examen 15 nov · réunion lundi à 10h @ D3\" aria-label=\"Quick add\" class=\"svelte-1i74804\"/> <!> <!> <button class=\"atlas-btn primary\">Add</button></div>"), rr = J("<div class=\"placing svelte-1i74804\" role=\"status\"><span class=\"tbox svelte-1i74804\" aria-hidden=\"true\"></span> <span class=\"ptext svelte-1i74804\">Time-block <b> </b>: drag over the hours it takes, or click where it starts</span> <button class=\"atlas-btn\">Cancel</button></div>"), ir = J("<aside class=\"side svelte-1i74804\" aria-label=\"Calendars\"><!></aside>"), ar = J("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button><button class=\"atlas-btn\">Settings…</button></div></div>"), or = J("<div class=\"atlas-notice\">No calendar account yet: add one in Settings (its server address, user name and app password; as many as you have) — or subscribe to a public calendar there.<div class=\"actions\"><button class=\"atlas-btn primary\">Settings…</button></div></div>"), sr = J("<button class=\"fab svelte-1i74804\" aria-label=\"New event\" title=\"New event (c)\"><!></button>"), cr = J("<div class=\"popscrim svelte-1i74804\" role=\"presentation\"></div> <!>", 1), lr = J("<div tabindex=\"-1\" role=\"application\" aria-label=\"Calendar\"><header class=\"top svelte-1i74804\"><!> <button class=\"atlas-btn today svelte-1i74804\" title=\"Today (t)\">Today</button> <div class=\"nav svelte-1i74804\"><button class=\"tool svelte-1i74804\" title=\"Previous (k)\" aria-label=\"Previous\"><!></button> <button class=\"tool svelte-1i74804\" title=\"Next (j)\" aria-label=\"Next\"><!></button></div> <h1 class=\"svelte-1i74804\"> </h1> <!> <span class=\"grow svelte-1i74804\"></span> <div><!> <input aria-label=\"Search events\" class=\"svelte-1i74804\"/></div> <!> <button class=\"tool svelte-1i74804\" title=\"Quick add in words (q)\" aria-label=\"Quick add\"><!></button> <!></header> <!> <!> <div class=\"body svelte-1i74804\"><!> <main class=\"view svelte-1i74804\"><!> <!></main></div> <!> <!> <!> <!> <!></div>"), ur = {
	hash: "svelte-1i74804",
	code: ".calendar.svelte-1i74804:focus {outline:none;}.calendar.svelte-1i74804 {position:relative;height:100%;display:grid;grid-template-rows:auto auto 1fr;color:var(--text);background:var(--bg);font-size:calc(14px * var(--ui-scale, 1));container-type:inline-size;overflow:hidden;}.top.svelte-1i74804 {grid-row:1;display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);min-width:0;}h1.svelte-1i74804 {margin:0 0 0 4px;font-size:1.2em;font-weight:600;color:var(--heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:6em;flex:0 1 auto;}.nav.svelte-1i74804 {display:flex;}.grow.svelte-1i74804 {flex:1;}.today.svelte-1i74804 {flex:none;}.tool.svelte-1i74804 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;flex:none;}.tool.svelte-1i74804:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-1i74804:focus-visible, .seg.svelte-1i74804 button:where(.svelte-1i74804):focus-visible, .fab.svelte-1i74804:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.search.svelte-1i74804 {display:flex;align-items:center;gap:6px;background:var(--bg-hover);border:1px solid transparent;border-radius:var(--radius);padding:0 8px;color:var(--text-faint);width:200px;flex:0 1 auto;min-width:70px;}.search.svelte-1i74804:focus-within, .search.on.svelte-1i74804 {border-color:var(--accent);background:var(--bg);color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1;min-width:0;padding:6px 0;color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.seg.svelte-1i74804 {display:flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;flex:none;}.seg.svelte-1i74804 button:where(.svelte-1i74804) {all:unset;cursor:pointer;padding:4px 10px;font-size:0.86em;color:var(--text-muted);}.seg.svelte-1i74804 button:where(.svelte-1i74804) + button:where(.svelte-1i74804) {border-left:1px solid var(--border);}.seg.svelte-1i74804 button:where(.svelte-1i74804):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-1i74804 button.on:where(.svelte-1i74804) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.vsel.svelte-1i74804 {appearance:none;-webkit-appearance:none;font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:4px 26px 4px 8px;flex:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 14px) 50%, calc(100% - 9px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.spin.svelte-1i74804 {width:12px;height:12px;border-radius:50%;border:2px solid var(--border-strong);border-top-color:var(--accent); animation: svelte-1i74804-spin 0.8s linear infinite;flex:none;}\n  @keyframes svelte-1i74804-spin { to { transform: rotate(360deg); } }\n  @media (prefers-reduced-motion: reduce) {.spin.svelte-1i74804 { animation: none;} }.quick.svelte-1i74804 {grid-row:2;display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--bg-alt);color:var(--accent-strong);min-width:0;flex-wrap:wrap;}.quick.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1 1 260px;min-width:0;color:var(--text);font-size:1.02em;padding:4px 0;}.quick.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.qprev.svelte-1i74804 {color:var(--text-muted);font-size:0.9em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.qprev.svelte-1i74804 b:where(.svelte-1i74804) {color:var(--text);}.body.svelte-1i74804 {grid-row:3;display:flex;min-height:0;}.placing.svelte-1i74804 {grid-row:2;display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--accent-soft);color:var(--text);min-width:0;flex-wrap:wrap;}.ptext.svelte-1i74804 {flex:1 1 240px;min-width:0;overflow-wrap:anywhere;}.placing.svelte-1i74804 .tbox:where(.svelte-1i74804) {width:11px;height:11px;border:1.5px solid var(--accent-strong);border-radius:3px;flex:none;box-sizing:border-box;}.side.svelte-1i74804 {flex:none;width:248px;border-right:1px solid var(--border);background:var(--bg-alt);min-height:0;}.view.svelte-1i74804 {flex:1;min-width:0;min-height:0;position:relative;display:flex;flex-direction:column;}.view.svelte-1i74804 > * {flex:1;min-height:0;}.view.svelte-1i74804 > .atlas-notice {flex:none;margin:10px 14px;}.popscrim.svelte-1i74804 {position:absolute;inset:0;z-index:49;}.fab.svelte-1i74804 {all:unset;cursor:pointer;position:absolute;right:18px;bottom:22px;z-index:40;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--accent);color:var(--accent-fg);box-shadow:var(--shadow-md, 0 6px 18px rgba(0,0,0,.3));}.narrow.svelte-1i74804 .top:where(.svelte-1i74804) {flex-wrap:wrap;row-gap:6px;padding:8px;}.narrow.svelte-1i74804 h1:where(.svelte-1i74804) {order:10;flex-basis:100%;margin:0;font-size:1.05em;}.narrow.svelte-1i74804 .search:where(.svelte-1i74804) {width:auto;flex:1 1 60px;min-width:60px;}\n  @container (max-width: 1100px) {.seg.svelte-1i74804 button:where(.svelte-1i74804) {padding:4px 7px;} }"
};
function dr(r, s) {
	be(s, !0), fe(r, ur);
	let u = new Ae(s.atlas), d = M(1200), h = M(void 0);
	ie(() => U(h) ? u.steps.attach(U(h)) : void 0);
	let v = M(!0), y = M(!1), b = M(void 0), C = M(""), w = M(!1), D = M(""), k = M(void 0), j = M(null), re = M(""), F = M(null), L = M(null), z = Q(() => U(d) < 700), ae = Q(() => !U(z) && U(d) >= 900 && U(v)), H = Q(() => u.shown());
	ie(() => {
		u.narrow !== U(z) && (u.narrow = U(z), u.load());
	});
	let se = [
		["day", "Day"],
		["week", "Week"],
		["workweek", "Work week"],
		["month", "Month"],
		["agenda", "Agenda"],
		["year", "Year"]
	], W = Q(() => U(F)?.e ?? null), ce = () => U(h)?.getBoundingClientRect() ?? new DOMRect(0, 0, U(d), 800);
	function K(e, t) {
		$(F, {
			e,
			at: t
		}, !0), $(L, null);
	}
	function q(e, t) {
		if (typeof s.atlas.shell.popMenu != "function") return;
		let n = t.currentTarget.getBoundingClientRect(), r = e.task?.path ?? S(e) ?? void 0, i = e.task ? [] : [
			{
				label: "Show",
				icon: "calendar",
				run: () => K(e, n)
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
	function ue(e, t, n, r) {
		if (!u.newCalendar()) {
			u.toast(u.configured ? "No calendar of your accounts takes new events (all read-only?)" : "Add a calendar account in Settings first", "error");
			return;
		}
		$(F, {
			draft: {
				start: e,
				end: t,
				all_day: n
			},
			at: r
		}, !0);
	}
	function pe() {
		let e = new Date(u.cursor), n = /* @__PURE__ */ new Date(), r = new Date(e.getFullYear(), e.getMonth(), e.getDate(), n.getHours() + 1, 0);
		$(L, {
			start: t(r),
			end: t(new Date(r.getTime() + 36e5)),
			allDay: !1
		}, !0), $(F, null);
	}
	function J(e = U(F)?.e) {
		if (!e) return;
		if (!e.writable) {
			u.toast(`${e.calendar_name || "This calendar"} is read-only`, "error");
			return;
		}
		let t = Ae.fields(e);
		$(L, {
			e,
			start: t.start,
			end: t.end,
			allDay: e.all_day
		}, !0), $(F, null);
	}
	function me(e, n) {
		let r = U(F)?.draft;
		r && ($(L, r.all_day ? {
			start: g(r.start),
			end: g(N(r.end, -1)),
			allDay: !0,
			title: e,
			calendar: n
		} : {
			start: t(r.start),
			end: t(r.end),
			allDay: !1,
			title: e,
			calendar: n
		}, !0), $(F, null));
	}
	function he() {
		if (U(y)) {
			$(y, !1);
			return;
		}
		if (u.placing) {
			u.placing = null;
			return;
		}
		if (U(L)) {
			$(L, null);
			return;
		}
		if (U(F)) {
			$(F, null);
			return;
		}
		if (U(w)) {
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
				value: g(N(/* @__PURE__ */ new Date(), 7)),
				title: "In a week"
			}],
			typed: (e) => `Go to “${e}”`,
			onpick: async (e, t) => {
				if (!t) {
					u.go(/* @__PURE__ */ new Date(`${e}T12:00`));
					return;
				}
				try {
					let t = await I(s.atlas, "quick", { text: e });
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
			items: Rn.filter((e) => e.id !== "palette").map((e) => ({
				value: e.id,
				title: e.title,
				detail: Vn(e.keys).join("  ·  ") || void 0,
				section: e.group
			})),
			onpick: (e) => Rn.find((t) => t.id === e)?.run(u, Z)
		});
	}
	function ve() {
		$(w, !0), $(re, u.newCalendar() ?? "", !0), $(F, null), setTimeout(() => U(k)?.focus(), 0);
	}
	let Z = {
		create: pe,
		quick: ve,
		edit: () => J(),
		remove: () => {
			let e = U(F)?.e;
			e?.writable && ($(F, null), u.remove(e));
		},
		focusSearch: () => {
			U(b)?.focus(), U(b)?.select();
		},
		help: () => $(y, !U(y)),
		palette: _e,
		goto: ge,
		back: he,
		sidebar: () => $(v, !U(v))
	};
	function ye(e) {
		let t = e.target;
		if (t.closest("input, textarea, select, [contenteditable=true]") || !U(h) || !(U(h).contains(t) || t === document.body || t.classList.contains("dv-content-container") && t.contains(U(h))) || [
			"shift",
			"control",
			"alt",
			"meta"
		].includes(e.key.toLowerCase())) return;
		let n = Bn.get(zn(e));
		n && (n.id !== "delete" && n.id !== "edit" || U(F)?.e) && (e.preventDefault(), e.stopPropagation(), n.run(u, Z));
	}
	let xe;
	function Se() {
		clearTimeout(xe), xe = setTimeout(async () => {
			if (!U(D).trim()) {
				$(j, null);
				return;
			}
			try {
				$(j, await I(s.atlas, "quick", { text: U(D) }), !0);
			} catch {
				$(j, null);
			}
		}, 120);
	}
	async function we() {
		if (!U(D).trim()) return;
		let e = U(j) ?? await I(s.atlas, "quick", { text: U(D) });
		$(w, !1), $(D, ""), $(j, null), await u.create({
			summary: e.title || "(no title)",
			start: e.start,
			end: e.end,
			all_day: e.all_day,
			rrule: e.rrule,
			location: e.location,
			calendar: U(re) || void 0
		}) && u.go(/* @__PURE__ */ new Date(`${e.start.slice(0, 10)}T12:00`));
	}
	let Te = Q(() => {
		let e = U(j);
		if (!e) return "";
		let t = new Date(e.all_day ? `${e.start}T00:00` : e.start), n = new Date(e.all_day ? `${e.end}T00:00` : e.end), r = t.toLocaleDateString(void 0, {
			weekday: "short",
			day: "numeric",
			month: "short"
		}), i = (e) => oe(e, u.h12);
		return e.all_day ? `${r} · all day` : `${r} · ${i(t)} – ${i(n)}`;
	}), Ee;
	function De() {
		clearTimeout(Ee), Ee = setTimeout(() => void u.search(U(C)), 160);
	}
	_(() => {
		U(h)?.focus({ preventScroll: !0 }), (async () => {
			await u.loadSources(), await u.load(), u.sync(!1);
		})();
		let e = [s.atlas.helper.on("changed", () => {
			u.loadSources(), u.later();
		}), s.atlas.helper.on("moved", (e) => {
			for (let t of e.moved ?? []) u.offerMove(t);
		})], t = setInterval(() => u.now = /* @__PURE__ */ new Date(), 3e4), n = (e) => {
			let t = e.detail ?? {};
			t.date ? u.go(/* @__PURE__ */ new Date(`${t.date}T12:00`), t.view) : t.view && u.setView(t.view), t.quick && ve(), t.create && pe(), t.place && u.startPlacing(t.place);
		};
		window.addEventListener("atlas-calendar:show", n);
		let r = window.__atlasCalendarShow;
		return r && (n(new CustomEvent("x", { detail: r })), window.__atlasCalendarShow = void 0), () => {
			e.forEach((e) => e()), clearInterval(t), window.removeEventListener("atlas-calendar:show", n);
		};
	});
	var Oe = lr();
	ne("keydown", de, ye);
	let ke;
	var je = G(Oe), Me = G(je), Ne = (e) => {
		var t = Jn(), n = G(t);
		V(n, { name: "menu" }), c(t), Y("click", t, () => $(v, !U(v))), X(e, t);
	};
	O(Me, (e) => {
		U(z) || e(Ne);
	});
	var Pe = A(Me, 2), Fe = A(Pe, 2), Ie = G(Fe), Le = G(Ie);
	V(Le, { name: "back" }), c(Ie);
	var Re = A(Ie, 2), ze = G(Re);
	V(ze, { name: "right" }), c(Re), c(Fe);
	var Be = A(Fe, 2), Ve = R(Be, !0), He = A(Be, 2), Ue = (e) => {
		var t = Yn();
		P(() => n(t, "title", u.syncing ? "Syncing with the server" : "Reading")), X(e, t);
	};
	O(He, (e) => {
		(u.loading || u.syncing) && e(Ue);
	});
	var We = A(He, 4);
	let Ge;
	var Ke = G(We);
	V(Ke, {
		name: "search",
		size: 15
	});
	var Je = A(Ke, 2);
	Ce(Je), l(Je, (e) => $(b, e), () => U(b)), c(We);
	var Ye = A(We, 2), Xe = (t) => {
		var n = Zn();
		p(n, 21, () => se, ([e, t]) => e, (t, n) => {
			var r = Q(() => o(U(n), 2));
			let i = () => U(r)[0], a = () => U(r)[1];
			var s = Xn(), c = R(s, !0), l = {};
			P(() => {
				e(c, a()), l !== (l = i()) && (s.value = (s.__value = l) ?? "");
			}), X(t, s);
		}), c(n);
		var r;
		ee(n), P(() => {
			r !== (r = u.view) && (n.value = (n.__value = r) ?? "", te(n, r));
		}), Y("change", n, (e) => u.setView(e.currentTarget.value)), X(t, n);
	}, Ze = (t) => {
		var r = $n();
		p(r, 21, () => se, ([e, t]) => e, (t, r) => {
			var i = Q(() => o(U(r), 2));
			let a = () => U(i)[0], s = () => U(i)[1];
			var c = Qn();
			let l;
			var d = R(c, !0);
			P((t) => {
				n(c, "title", `${s() ?? ""} (${t ?? ""})`), l = m(c, 1, "svelte-1i74804", null, l, { on: u.view === a() }), e(d, s());
			}, [() => Rn.find((e) => e.id === a())?.keys?.split(",")[0]]), Y("click", c, () => u.setView(a())), X(t, c);
		}), c(r), X(t, r);
	};
	O(Ye, (e) => {
		U(d) < 980 ? e(Xe) : e(Ze, -1);
	});
	var Qe = A(Ye, 2), $e = G(Qe);
	V($e, { name: "sparkle" }), c(Qe);
	var et = A(Qe, 2), tt = (e) => {
		var t = er(), n = B(t), r = G(n);
		V(r, { name: "refresh" }), c(n);
		var i = A(n, 2), a = G(i);
		V(a, { name: "keyboard" }), c(i), Y("click", n, () => u.sync(!0)), Y("click", i, _e), X(e, t);
	};
	O(et, (e) => {
		U(z) || e(tt);
	}), c(je);
	var nt = A(je, 2), rt = (t) => {
		var n = nr(), r = G(n);
		V(r, {
			name: "sparkle",
			size: 15
		});
		var i = A(r, 2);
		Ce(i), l(i, (e) => $(k, e), () => U(k));
		var a = A(i, 2), o = (t) => {
			var n = tr(), r = G(n), i = R(r, !0), a = A(r);
			c(n), P(() => {
				e(i, U(j).title || "(no title)"), e(a, ` · ${U(Te) ?? ""}${U(j).rrule ? " · repeats" : ""}${U(j).location ? ` · ${U(j).location}` : ""}`);
			}), X(t, n);
		};
		O(a, (e) => {
			U(j) && e(o);
		});
		var s = A(a, 2), d = (e) => {
			Ut(e, {
				get cal() {
					return u;
				},
				compact: !0,
				get value() {
					return U(re);
				},
				set value(e) {
					$(re, e, !0);
				}
			});
		};
		O(s, (e) => {
			U(re) && e(d);
		});
		var f = A(s, 2);
		c(n), P((e) => f.disabled = e, [() => !U(D).trim()]), Y("input", i, Se), Y("keydown", i, (e) => {
			e.key === "Enter" ? (e.preventDefault(), we()) : e.key === "Escape" && (e.stopPropagation(), $(w, !1));
		}), x(i, () => U(D), (e) => $(D, e)), Y("click", f, we), X(t, n);
	};
	O(nt, (e) => {
		U(w) && e(rt);
	});
	var it = A(nt, 2), at = (t) => {
		var n = rr(), r = A(G(n), 2), i = A(G(r)), a = R(i, !0);
		T(), c(r);
		var o = A(r, 2);
		c(n), P(() => e(a, u.placing.title)), Y("click", o, () => u.placing = null), X(t, n);
	};
	O(it, (e) => {
		u.placing && e(at);
	});
	var ot = A(it, 2), st = G(ot), lt = (e) => {
		var t = ir();
		qe(G(t), {
			get cal() {
				return u;
			},
			oncreate: pe
		}), c(t), X(e, t);
	};
	O(st, (e) => {
		U(ae) && e(lt);
	});
	var ut = A(st, 2), dt = G(ut), ft = (t) => {
		var n = ar(), r = G(n, !0), i = A(r), a = G(i), o = A(a);
		c(i), c(n), P(() => e(r, u.error)), Y("click", a, () => u.load()), Y("click", o, () => s.atlas.plugin.openSettings()), X(t, n);
	}, pt = (e) => {
		var t = or(), n = A(G(t)), r = R(n);
		c(t), Y("click", r, () => s.atlas.plugin.openSettings()), X(e, t);
	};
	O(dt, (e) => {
		u.error ? e(ft) : !u.configured && !u.sources.length && e(pt, 1);
	});
	var mt = A(dt, 2), ht = (e) => {
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
					return U(t);
				},
				get to() {
					return U(n);
				},
				get selected() {
					return U(W);
				},
				onselect: K,
				onmenu: q,
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
					return U(t);
				},
				get selected() {
					return U(W);
				},
				onselect: K,
				onmenu: q,
				oncreate: ue
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
					return U(t);
				},
				get from() {
					return U(n);
				},
				get to() {
					return U(r);
				},
				get selected() {
					return U(W);
				},
				onselect: K,
				onmenu: q
			});
		}
	}, yt = (e) => {
		Rt(e, { get cal() {
			return u;
		} });
	}, bt = (e) => {
		var t = le(), n = B(t);
		E(n, () => U(H) + u.range().from.getTime(), (e) => {
			{
				let t = Q(() => u.days());
				ct(e, {
					get cal() {
						return u;
					},
					get days() {
						return U(t);
					},
					get selected() {
						return U(W);
					},
					onselect: K,
					onmenu: q,
					oncreate: ue
				});
			}
		}), X(e, t);
	};
	O(mt, (e) => {
		u.results ? e(ht) : U(H) === "month" ? e(gt, 1) : U(H) === "agenda" ? e(_t, 2) : U(H) === "year" ? e(yt, 3) : e(bt, -1);
	}), c(ut), c(ot);
	var xt = A(ot, 2), St = (e) => {
		var t = sr(), n = G(t);
		V(n, {
			name: "plus",
			size: 22
		}), c(t), Y("click", t, pe), X(e, t);
	};
	O(xt, (e) => {
		U(z) && e(St);
	});
	var Ct = A(xt, 2), wt = (e) => {
		var t = cr(), n = B(t), r = A(n, 2);
		E(r, () => U(F), (e) => {
			{
				let t = Q(() => U(F).e ?? null), n = Q(() => U(F).draft ?? null), r = Q(ce);
				yn(e, {
					get cal() {
						return u;
					},
					get e() {
						return U(t);
					},
					get draft() {
						return U(n);
					},
					get at() {
						return U(F).at;
					},
					get box() {
						return U(r);
					},
					onedit: () => J(),
					onmore: me,
					onclose: () => $(F, null)
				});
			}
		}), Y("click", n, () => $(F, null)), X(e, t);
	};
	O(Ct, (e) => {
		U(F) && e(wt);
	});
	var Tt = A(Ct, 2), Et = (e) => {
		{
			let t = Q(() => U(L).e ?? null), n = Q(() => U(L).title ?? ""), r = Q(() => U(L).calendar ?? "");
			An(e, {
				get cal() {
					return u;
				},
				get e() {
					return U(t);
				},
				get start() {
					return U(L).start;
				},
				get end() {
					return U(L).end;
				},
				get allDay() {
					return U(L).allDay;
				},
				get title() {
					return U(n);
				},
				get calendar() {
					return U(r);
				},
				onclose: () => $(L, null)
			});
		}
	};
	O(Tt, (e) => {
		U(L) && e(Et);
	});
	var Dt = A(Tt, 2), Ot = (e) => {
		qn(e, { onclose: () => $(y, !1) });
	};
	O(Dt, (e) => {
		U(y) && e(Ot);
	}), In(A(Dt, 2), { get cal() {
		return u;
	} }), c(Oe), l(Oe, (e) => $(h, e), () => U(h)), P((t, r) => {
		ke = m(Oe, 1, "calendar svelte-1i74804", null, ke, { narrow: U(z) }), n(Be, "title", t), e(Ve, r), Ge = m(We, 1, "search svelte-1i74804", null, Ge, { on: !!U(C) }), n(Je, "placeholder", U(z) ? "" : "Search events");
	}, [() => u.title(), () => u.title()]), Y("pointerdown", Oe, (e) => {
		e.target.closest("input, textarea, select, button, [tabindex='0']") || U(h)?.focus({ preventScroll: !0 });
	}), Y("click", Pe, () => u.today()), Y("click", Ie, () => u.step(-1)), Y("click", Re, () => u.step(1)), Y("input", Je, De), Y("keydown", Je, (e) => {
		e.key === "Escape" && ($(C, ""), u.search(""), U(b)?.blur());
	}), x(Je, () => U(C), (e) => $(C, e)), Y("click", Qe, ve), f(Oe, "clientWidth", (e) => $(d, e)), X(r, Oe), i();
}
q([
	"pointerdown",
	"click",
	"input",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/NewEvent.svelte
var fr = J("<div class=\"none svelte-19uhe47\"><p class=\"svelte-19uhe47\">No calendar to write to: add an account (CalDAV, or Outlook / Microsoft 365) in the Calendar's settings.</p> <button class=\"atlas-btn\">Open its settings</button></div>"), pr = J("<p class=\"none svelte-19uhe47\">Loading the calendars…</p>"), mr = {
	hash: "svelte-19uhe47",
	code: ".none.svelte-19uhe47 {padding:16px;display:grid;gap:10px;justify-items:start;color:var(--text-muted);margin:0;}.none.svelte-19uhe47 p:where(.svelte-19uhe47) {margin:0;}"
};
function hr(e, n) {
	be(n, !0), fe(e, mr);
	let r = y(n, "seed", 19, () => ({})), a = _e(() => new Ae(n.atlas));
	a.toast = (e, t) => n.atlas.toast("Calendar", e, t === "error" ? "error" : "success");
	let o = M(!1);
	a.loadSources().then(() => $(o, !0));
	let s = /* @__PURE__ */ new Date(), l = new Date(s.getFullYear(), s.getMonth(), s.getDate(), s.getHours() + 1, 0);
	var u = le(), d = B(u), f = (e) => {
		var i = le(), o = B(i), s = (e) => {
			{
				let i = Q(() => t(l)), o = Q(() => t(new Date(l.getTime() + 36e5))), s = Q(() => r().title ?? ""), c = Q(() => r().guests ?? []), u = Q(() => r().description ?? "");
				An(e, {
					get cal() {
						return a;
					},
					get start() {
						return U(i);
					},
					get end() {
						return U(o);
					},
					allDay: !1,
					get title() {
						return U(s);
					},
					get guests() {
						return U(c);
					},
					get description() {
						return U(u);
					},
					frame: "dialog",
					get onclose() {
						return n.onclose;
					}
				});
			}
		}, u = Q(() => a.writable().length), d = (e) => {
			var t = fr(), r = A(G(t), 2);
			c(t), Y("click", r, () => n.atlas.plugin.openSettings()), X(e, t);
		};
		O(o, (e) => {
			U(u) ? e(s) : e(d, -1);
		}), X(e, i);
	}, p = (e) => {
		var t = pr();
		X(e, t);
	};
	O(d, (e) => {
		U(o) ? e(f) : e(p, -1);
	}), X(e, u), i();
}
q(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/view.ts
function gr(e, t) {
	let n = xe(t.arg);
	if (n) {
		let r = b(hr, {
			target: e,
			props: {
				atlas: t,
				seed: n,
				onclose: () => t.pane?.close?.()
			}
		});
		return () => F(r);
	}
	e.style.height = "100%";
	let r = b(dr, {
		target: e,
		props: { atlas: t }
	});
	return () => F(r);
}
//#endregion
export { gr as default };
