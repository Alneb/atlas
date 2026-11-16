import { $ as e, A as t, B as n, C as r, Ct as i, D as a, E as o, F as s, G as c, H as l, I as u, J as d, K as f, M as p, N as m, O as h, P as g, Q as _, R as v, S as y, St as b, T as x, U as S, V as C, W as w, X as T, Y as E, Z as D, _ as O, _t as k, at as A, b as ee, bt as j, c as M, ct as te, d as N, dt as P, et as F, f as I, ft as L, gt as R, h as z, ht as B, i as V, it as ne, j as re, k as ie, l as H, lt as ae, m as U, mt as W, n as oe, nt as G, o as se, ot as ce, p as K, pt as q, q as J, r as Y, rt as X, s as Z, st as Q, t as le, tt as ue, u as de, ut as $, v as fe, vt as pe, w as me, x as he, xt as ge, y as _e, yt as ve, z as ye } from "./ui-lib/layout.js";
//#region plugins/stable/dav/ui/src/store.svelte.ts
var be = "notes", xe = (e) => {
	try {
		return localStorage.getItem(`atlas-calendar-${e}`);
	} catch {
		return null;
	}
}, Se = (e, t) => {
	try {
		localStorage.setItem(`atlas-calendar-${e}`, t);
	} catch {}
}, Ce = class {
	atlas;
	#e = R(W([]));
	get sources() {
		return A(this.#e);
	}
	set sources(e) {
		B(this.#e, e, !0);
	}
	#t = R(W([]));
	get accounts() {
		return A(this.#t);
	}
	set accounts(e) {
		B(this.#t, e, !0);
	}
	#n = R(W([]));
	get events() {
		return A(this.#n);
	}
	set events(e) {
		B(this.#n, e, !0);
	}
	#r = R("week");
	get view() {
		return A(this.#r);
	}
	set view(e) {
		B(this.#r, e, !0);
	}
	#i = R(W(r(/* @__PURE__ */ new Date())));
	get cursor() {
		return A(this.#i);
	}
	set cursor(e) {
		B(this.#i, e, !0);
	}
	#a = R(!0);
	get loading() {
		return A(this.#a);
	}
	set loading(e) {
		B(this.#a, e, !0);
	}
	#o = R(!1);
	get syncing() {
		return A(this.#o);
	}
	set syncing(e) {
		B(this.#o, e, !0);
	}
	#s = R("");
	get error() {
		return A(this.#s);
	}
	set error(e) {
		B(this.#s, e, !0);
	}
	#c = R(!0);
	get configured() {
		return A(this.#c);
	}
	set configured(e) {
		B(this.#c, e, !0);
	}
	#l = R(null);
	get write() {
		return A(this.#l);
	}
	set write(e) {
		B(this.#l, e, !0);
	}
	#u = R(W(xe("last")));
	get last() {
		return A(this.#u);
	}
	set last(e) {
		B(this.#u, e, !0);
	}
	#d = R(W([]));
	get hidden() {
		return A(this.#d);
	}
	set hidden(e) {
		B(this.#d, e, !0);
	}
	#f = R(W({}));
	get colors() {
		return A(this.#f);
	}
	set colors(e) {
		B(this.#f, e, !0);
	}
	#p = R(W([]));
	get toasts() {
		return A(this.#p);
	}
	set toasts(e) {
		B(this.#p, e, !0);
	}
	#m = R(null);
	get results() {
		return A(this.#m);
	}
	set results(e) {
		B(this.#m, e, !0);
	}
	#h = R("");
	get query() {
		return A(this.#h);
	}
	set query(e) {
		B(this.#h, e, !0);
	}
	#g = R(W(/* @__PURE__ */ new Date()));
	get now() {
		return A(this.#g);
	}
	set now(e) {
		B(this.#g, e, !0);
	}
	#_ = R(W([]));
	get tasks() {
		return A(this.#_);
	}
	set tasks(e) {
		B(this.#_, e, !0);
	}
	#v = R(null);
	get placing() {
		return A(this.#v);
	}
	set placing(e) {
		B(this.#v, e, !0);
	}
	#y = R(!1);
	get narrow() {
		return A(this.#y);
	}
	set narrow(e) {
		B(this.#y, e, !0);
	}
	seq = 0;
	timer;
	constructor(e) {
		this.atlas = e;
		let t = e.plugin.settings;
		this.view = xe("view") ?? String(t.default_view ?? "week"), this.hidden = (t.hidden ?? []).slice();
		for (let e of t.colors ?? []) {
			let t = e.lastIndexOf(":");
			t > 0 && (this.colors[e.slice(0, t).trim()] = e.slice(t + 1).trim());
		}
	}
	get settings() {
		return this.atlas.plugin.settings;
	}
	get first() {
		return a(this.settings.week_start);
	}
	get h12() {
		return I(this.settings.time_format);
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
				let e = me(t, this.first);
				return {
					from: e,
					to: Z(e, 6)
				};
			}
			case "workweek": {
				let e = me(t, 1);
				return {
					from: e,
					to: Z(e, 4)
				};
			}
			case "month": {
				let e = me(new Date(t.getFullYear(), t.getMonth(), 1), this.first);
				return {
					from: e,
					to: Z(e, 41)
				};
			}
			case "agenda": return {
				from: t,
				to: Z(t, 59)
			};
			case "year": return {
				from: new Date(t.getFullYear(), 0, 1),
				to: new Date(t.getFullYear(), 11, 31)
			};
		}
	}
	days() {
		let { from: e, to: t } = this.range(), n = [];
		for (let r = e; r <= t; r = Z(r, 1)) n.push(r);
		return n;
	}
	colorOf(e) {
		if (e === "notes") return this.colors.notes ?? this.colors.Notes ?? "var(--accent)";
		if (e === "tasks") return this.colors.tasks ?? "var(--text-muted)";
		let t = this.sources.find((t) => t.id === e);
		return this.colors[e] ?? this.colors[t?.name ?? ""] ?? t?.shown_color ?? t?.color ?? K(e);
	}
	isHidden(e, t = e) {
		return this.hidden.includes(e) || this.hidden.includes(t);
	}
	async loadSources() {
		try {
			let e = await H(this.atlas, "watch", {}, 30);
			this.sources = e.sources, this.accounts = e.accounts ?? [], this.write = e.write, this.configured = e.configured;
		} catch (e) {
			this.error = e.message;
		}
	}
	async load(e = !1) {
		let { from: t, to: n } = this.range(), r = ++this.seq;
		e || (this.loading = !0);
		try {
			let e = this.sources.filter((e) => !this.isHidden(e.id, e.name)).map((e) => e.id), [i, a] = await Promise.all([H(this.atlas, "range", {
				from: h(t),
				to: h(n),
				sources: e,
				notes: this.showNotes && !this.isHidden("notes", "Notes")
			}, 60), this.isHidden("tasks", "Tasks") ? Promise.resolve([]) : this.deadlines(h(t), h(n))]);
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
					end: h(Z(t, 1)),
					all_day: !0,
					recurring: !1,
					free: !0,
					calendar: se,
					calendar_name: e.props.from === "note" ? "Deadline (note)" : "Task",
					writable: !1,
					task: e
				};
			});
		} catch {
			return [];
		}
	}
	shownEvents() {
		return this.tasks.length ? [...this.events, ...this.tasks] : this.events;
	}
	startPlacing(e) {
		this.placing = e, (this.shown() === "month" || this.shown() === "agenda" || this.shown() === "year") && this.setView("week");
	}
	async timeBlock(e, t) {
		let n = this.placing;
		if (this.placing = null, !n) return !1;
		let r = this.newCalendar() ?? void 0;
		try {
			let i = await H(this.atlas, "time_block", {
				summary: n.title,
				start: o(e),
				end: o(t),
				calendar: r,
				task: {
					path: n.path,
					line: n.line ?? 0,
					text: n.title
				}
			});
			return this.toast(`Time-blocked “${n.title}” · ${i.label}`, "success", void 0, {
				label: "Open the note",
				run: () => this.atlas.open(i.note)
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
					let n = await H(this.atlas, "move_tasks", { note: e.note });
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
			let t = await H(this.atlas, "refresh", { force: e }, 300);
			await this.loadSources(), t.changed && await this.load(!0), t.errors.length && this.toast(t.errors[0], "error");
		} catch (e) {
			this.error ||= e.message;
		} finally {
			this.syncing = !1;
		}
	}
	setView(e) {
		this.view = e, Se("view", e), this.results = null, this.load();
	}
	go(e, t) {
		this.cursor = r(e), t ? this.setView(t) : this.load();
	}
	today() {
		this.go(/* @__PURE__ */ new Date());
	}
	step(e) {
		let t = this.cursor, n = {
			day: () => Z(t, e),
			week: () => Z(t, 7 * e),
			workweek: () => Z(t, 7 * e),
			month: () => M(new Date(t.getFullYear(), t.getMonth(), 1), e),
			agenda: () => Z(t, 30 * e),
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
		e && (this.last = e, Se("last", e));
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
				await H(this.atlas, "undo", { id: e }), this.toast(`${t} undone`);
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
			let r = await H(this.atlas, "create", {
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
			let i = await H(this.atlas, "update", {
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
			return await H(this.atlas, "respond", {
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
				let n = await H(this.atlas, "delete", {
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
			this.results = (await H(this.atlas, "search", { q: e })).events;
		} catch (e) {
			this.toast(e.message, "error");
		}
	}
	static fields(e) {
		let t = N(e), n = de(e);
		return e.all_day ? {
			start: h(t),
			end: h(Z(n, -1))
		} : {
			start: o(t),
			end: o(n)
		};
	}
}, we = e("<span class=\"h svelte-1jq00cd\"> </span>"), Te = e("<button> </button>"), Ee = e("<button class=\"link svelte-1jq00cd\">Set it up…</button>"), De = e("<h3 class=\"svelte-1jq00cd\">Calendars</h3> <ul class=\"svelte-1jq00cd\"><li class=\"none svelte-1jq00cd\"> <!></li></ul>", 1), Oe = e("<span class=\"err svelte-1jq00cd\">!</span>"), ke = F("<svg viewBox=\"0 0 12 12\" width=\"10\" height=\"10\" aria-hidden=\"true\"><path d=\"M2.5 6.5l2.2 2.2L9.5 3.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path></svg>"), Ae = e("<span class=\"ro svelte-1jq00cd\" title=\"A subscription: read-only\"><!></span>"), je = e("<span class=\"ro svelte-1jq00cd\" title=\"Read-only\">ro</span>"), Me = e("<button class=\"pc svelte-1jq00cd\" role=\"option\"></button>"), Ne = e("<div class=\"palette svelte-1jq00cd\" role=\"listbox\" aria-label=\"Colours\"></div>"), Pe = e("<li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\"><span><!></span> <span class=\"name svelte-1jq00cd\"> </span> <!> <!></button> <button class=\"tool small svelte-1jq00cd\" title=\"Colour\"><span class=\"swatch svelte-1jq00cd\"></span></button> <!></li>"), Fe = e("<li class=\"none svelte-1jq00cd\"> </li>"), Ie = e("<h3 class=\"svelte-1jq00cd\"> <!></h3> <ul class=\"svelte-1jq00cd\"></ul>", 1), Le = e("<li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\" title=\"Notes marked important: true with due: / event:\"><span><!></span> <span class=\"name svelte-1jq00cd\">Important notes</span></button></li>"), Re = e("<div class=\"side svelte-1jq00cd\"><button class=\"create atlas-btn primary svelte-1jq00cd\"><!>Create</button> <div class=\"mini svelte-1jq00cd\" aria-label=\"Pick a day\"><div class=\"mhead svelte-1jq00cd\"><span class=\"mtitle svelte-1jq00cd\"> </span> <button class=\"tool svelte-1jq00cd\" aria-label=\"Previous month\"><!></button> <button class=\"tool svelte-1jq00cd\" aria-label=\"Next month\"><!></button></div> <div class=\"mgrid svelte-1jq00cd\"><!> <!></div></div> <!> <!> <h3 class=\"svelte-1jq00cd\">In the vault</h3> <ul class=\"svelte-1jq00cd\"><li class=\"svelte-1jq00cd\"><button class=\"cal svelte-1jq00cd\" role=\"checkbox\" title=\"Open tasks with a 📅 or ⏳ date and notes with due:, on their day (click one to time-block it)\"><span><!></span> <span class=\"name svelte-1jq00cd\">Tasks &amp; deadlines</span></button></li> <!></ul> <button class=\"link add svelte-1jq00cd\"><!>Add an account or a subscription…</button></div>"), ze = {
	hash: "svelte-1jq00cd",
	code: ".side.svelte-1jq00cd {height:100%;overflow-y:auto;padding:12px 10px 24px;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;}.create.svelte-1jq00cd {display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin:0 0 10px 4px;padding:7px 16px;}.mini.svelte-1jq00cd {padding:0 2px 10px;}.mhead.svelte-1jq00cd {display:flex;align-items:center;gap:2px;padding:0 0 4px 6px;}.mtitle.svelte-1jq00cd {flex:1;font-weight:600;font-size:0.9em;color:var(--heading);}.mgrid.svelte-1jq00cd {display:grid;grid-template-columns:repeat(7, 1fr);gap:1px;}.h.svelte-1jq00cd {font-size:0.68em;color:var(--text-faint);text-align:center;padding:2px 0;}.d.svelte-1jq00cd {all:unset;cursor:pointer;text-align:center;font-size:0.76em;line-height:24px;border-radius:999px;font-variant-numeric:tabular-nums;color:var(--text-muted);position:relative;}.d.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.d.other.svelte-1jq00cd {color:var(--text-faint);}.d.on.svelte-1jq00cd {background:var(--accent-soft);color:var(--accent-strong);border-radius:0;}.d.busy.svelte-1jq00cd::after {content:\"\";position:absolute;left:50%;bottom:2px;width:3px;height:3px;border-radius:50%;background:currentColor;transform:translateX(-50%);opacity:0.6;}.d.today.svelte-1jq00cd {background:var(--accent);color:var(--accent-fg);font-weight:700;border-radius:999px;}.d.svelte-1jq00cd:focus-visible, .cal.svelte-1jq00cd:focus-visible, .tool.svelte-1jq00cd:focus-visible, .pc.svelte-1jq00cd:focus-visible, .link.svelte-1jq00cd:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}h3.svelte-1jq00cd {margin:10px 6px 2px;font-size:0.72em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);font-weight:600;}ul.svelte-1jq00cd {list-style:none;margin:0;padding:0;display:grid;gap:1px;}li.svelte-1jq00cd {position:relative;display:flex;align-items:center;}.cal.svelte-1jq00cd {all:unset;flex:1;min-width:0;cursor:pointer;display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:var(--radius-sm);color:var(--text);font-size:0.9em;}.cal.svelte-1jq00cd:hover {background:var(--bg-hover);}.box.svelte-1jq00cd {width:14px;height:14px;border-radius:4px;background:var(--c);border:2px solid var(--c);box-sizing:border-box;display:grid;place-items:center;color:#fff;flex:none;}.box.off.svelte-1jq00cd {background:transparent;}.name.svelte-1jq00cd {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.err.svelte-1jq00cd {color:var(--red);font-weight:700;}.ro.svelte-1jq00cd {color:var(--text-faint);font-size:0.75em;}.tool.svelte-1jq00cd {all:unset;cursor:pointer;padding:5px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-1jq00cd:hover {background:var(--bg-hover);color:var(--text);}.small.svelte-1jq00cd {opacity:0;}li.svelte-1jq00cd:hover .small:where(.svelte-1jq00cd), .small.svelte-1jq00cd:focus-visible {opacity:1;}.swatch.svelte-1jq00cd {width:10px;height:10px;border-radius:50%;background:var(--c);}.palette.svelte-1jq00cd {position:absolute;right:0;top:100%;z-index:20;display:grid;grid-template-columns:repeat(6, 22px);gap:6px;padding:8px;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 24px rgba(0,0,0,.25));}.pc.svelte-1jq00cd {all:unset;cursor:pointer;width:22px;height:22px;border-radius:50%;background:var(--c);}.pc[aria-selected=\"true\"].svelte-1jq00cd {box-shadow:0 0 0 2px var(--bg-elev), 0 0 0 4px var(--c);}.none.svelte-1jq00cd {color:var(--text-faint);font-size:0.85em;padding:4px 6px;gap:6px;flex-wrap:wrap;}.link.svelte-1jq00cd {all:unset;cursor:pointer;color:var(--accent);font-size:0.85em;display:inline-flex;align-items:center;gap:4px;}.add.svelte-1jq00cd {margin:10px 6px 0;}"
};
function Be(e, t) {
	j(t, !0), S(e, ze);
	let n = R(W(/* @__PURE__ */ new Date()));
	te(() => {
		B(n, new Date(t.cal.cursor.getFullYear(), t.cal.cursor.getMonth(), 1), !0);
	});
	let r = k(() => {
		let e = me(A(n), t.cal.first);
		return Array.from({ length: 42 }, (t, n) => Z(e, n));
	}), i = k(() => A(r).slice(0, 7).map((e) => e.toLocaleDateString(void 0, { weekday: "narrow" }))), a = (e) => {
		let n = t.cal.range();
		return e >= n.from && e <= n.to;
	}, o = k(() => new Set(t.cal.events.map((e) => e.start.slice(0, 10)))), s = (e) => `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`, d = [
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
	], f = R(null), p = k(() => [...t.cal.byAccount().map((e) => ({
		title: e.account.name,
		error: e.account.error ?? void 0,
		items: e.items
	})), {
		title: "Subscriptions",
		error: void 0,
		items: t.cal.sources.filter((e) => e.kind === "ics")
	}]), m = k(() => !t.cal.accounts.length), h = k(() => t.cal.showNotes);
	function g(e) {
		return e.error ? `${e.name} — ${e.error}` : e.writable ? e.name : `${e.name} (read-only)`;
	}
	var v = Re(), y = $(v), x = $(y);
	V(x, {
		name: "plus",
		size: 15
	}), ge(), b(y);
	var T = q(y, 2), O = $(T), ee = $(O), N = L(ee, !0), F = q(ee, 2), I = $(F);
	V(I, {
		name: "back",
		size: 14
	}), b(F);
	var z = q(F, 2), ne = $(z);
	V(ne, {
		name: "right",
		size: 14
	}), b(z), b(O);
	var re = q(O, 2), ie = $(re);
	w(ie, 17, () => A(i), c, (e, t) => {
		var n = we(), r = L(n, !0);
		Q(() => E(r, A(t))), D(e, n);
	});
	var H = q(ie, 2);
	w(H, 17, () => A(r), (e) => e.getTime(), (e, r) => {
		var i = Te();
		let c;
		var u = L(i, !0);
		Q((e, t, n, r, a) => {
			c = l(i, 1, "d svelte-1jq00cd", null, c, {
				other: e,
				today: t,
				on: n,
				busy: r
			}), E(u, a);
		}, [
			() => A(r).getMonth() !== A(n).getMonth(),
			() => he(A(r), t.cal.now),
			() => a(A(r)),
			() => A(o).has(s(A(r))),
			() => A(r).getDate()
		]), X("click", i, () => t.cal.go(A(r))), D(e, i);
	}), b(re), b(T);
	var ae = q(T, 2), U = (e) => {
		var n = De(), r = q(P(n), 2), i = $(r), a = $(i, !0), o = q(a), s = (e) => {
			var n = Ee();
			X("click", n, () => t.cal.atlas.plugin.openSettings()), D(e, n);
		};
		J(o, (e) => {
			t.cal.configured || e(s);
		}), b(i), b(r), Q(() => E(a, t.cal.configured ? t.cal.error ? "Not read: see the message beside." : "Reading the server…" : "No account yet.")), D(e, n);
	};
	J(ae, (e) => {
		A(m) && e(U);
	});
	var oe = q(ae, 2);
	w(oe, 17, () => A(p), (e) => e.title, (e, n) => {
		var r = _(), i = P(r), a = (e) => {
			var r = Ie(), i = P(r), a = $(i, !0), o = q(a), s = (e) => {
				var t = Oe();
				Q(() => u(t, "title", A(n).error)), D(e, t);
			};
			J(o, (e) => {
				A(n).error && e(s);
			}), b(i);
			var c = q(i, 2);
			w(c, 21, () => A(n).items, (e) => e.id, (e, n) => {
				var r = Pe(), i = $(r), a = $(i);
				let o, s;
				var c = $(a), p = (e) => {
					var t = ke();
					D(e, t);
				}, m = k(() => !t.cal.isHidden(A(n).id, A(n).name));
				J(c, (e) => {
					A(m) && e(p);
				}), b(a);
				var h = q(a, 2), _ = L(h, !0), v = q(h, 2), y = (e) => {
					var t = Oe();
					Q(() => u(t, "title", A(n).error)), D(e, t);
				};
				J(v, (e) => {
					A(n).error && e(y);
				});
				var x = q(v, 2), S = (e) => {
					var t = Ae(), n = $(t);
					V(n, {
						name: "rss",
						size: 12
					}), b(t), D(e, t);
				}, T = (e) => {
					var t = je();
					D(e, t);
				};
				J(x, (e) => {
					A(n).kind === "ics" ? e(S) : A(n).writable || e(T, 1);
				}), b(i);
				var O = q(i, 2), ee = $(O);
				let j;
				b(O);
				var M = q(O, 2), te = (e) => {
					var r = Ne();
					w(r, 20, () => d, (e) => e, (e, r) => {
						var i = Me();
						let a;
						Q((e) => {
							u(i, "aria-selected", e), u(i, "aria-label", r), a = C(i, "", a, { "--c": r });
						}, [() => t.cal.colorOf(A(n).id) === r]), X("click", i, () => {
							t.cal.setColor(A(n).id, r), B(f, null);
						}), D(e, i);
					}), b(r), D(e, r);
				};
				J(M, (e) => {
					A(f) === A(n).id && e(te);
				}), b(r), Q((e, t, r, c, d) => {
					u(i, "aria-checked", e), u(i, "title", t), o = l(a, 1, "box svelte-1jq00cd", null, o, { off: r }), s = C(a, "", s, { "--c": c }), E(_, A(n).name), u(O, "aria-label", `Colour of ${A(n).name ?? ""}`), j = C(ee, "", j, { "--c": d });
				}, [
					() => !t.cal.isHidden(A(n).id, A(n).name),
					() => g(A(n)),
					() => t.cal.isHidden(A(n).id, A(n).name),
					() => t.cal.colorOf(A(n).id),
					() => t.cal.colorOf(A(n).id)
				]), X("click", i, () => t.cal.toggle(A(n).id, A(n).name)), X("click", O, () => B(f, A(f) === A(n).id ? null : A(n).id, !0)), D(e, r);
			}, (e) => {
				var t = Fe(), r = L(t, !0);
				Q(() => E(r, A(n).error ?? "Reading the server…")), D(e, t);
			}), b(c), Q(() => {
				u(i, "title", A(n).error ?? A(n).title), E(a, A(n).title);
			}), D(e, r);
		};
		J(i, (e) => {
			(A(n).items.length || A(n).title !== "Subscriptions") && e(a);
		}), D(e, r);
	});
	var G = q(oe, 4), ce = $(G), K = $(ce), Y = $(K);
	let le, ue;
	var de = $(Y), fe = (e) => {
		var t = ke();
		D(e, t);
	}, pe = k(() => !t.cal.isHidden(se, "Tasks"));
	J(de, (e) => {
		A(pe) && e(fe);
	}), b(Y), ge(2), b(K), b(ce);
	var _e = q(ce, 2), ye = (e) => {
		var n = Le(), r = $(n), i = $(r);
		let a, o;
		var s = $(i), c = (e) => {
			var t = ke();
			D(e, t);
		}, d = k(() => !t.cal.isHidden(be, "Notes"));
		J(s, (e) => {
			A(d) && e(c);
		}), b(i), ge(2), b(r), b(n), Q((e, t, n) => {
			u(r, "aria-checked", e), a = l(i, 1, "box svelte-1jq00cd", null, a, { off: t }), o = C(i, "", o, { "--c": n });
		}, [
			() => !t.cal.isHidden(be, "Notes"),
			() => t.cal.isHidden(be, "Notes"),
			() => t.cal.colorOf(be)
		]), X("click", r, () => t.cal.toggle(be, "Notes")), D(e, n);
	};
	J(_e, (e) => {
		A(h) && e(ye);
	}), b(G);
	var xe = q(G, 2), Se = $(xe);
	V(Se, {
		name: "plus",
		size: 13
	}), ge(), b(xe), b(v), Q((e, t, n, r) => {
		E(N, e), u(K, "aria-checked", t), le = l(Y, 1, "box svelte-1jq00cd", null, le, { off: n }), ue = C(Y, "", ue, { "--c": r });
	}, [
		() => A(n).toLocaleDateString(void 0, {
			month: "long",
			year: "numeric"
		}),
		() => !t.cal.isHidden(se, "Tasks"),
		() => t.cal.isHidden(se, "Tasks"),
		() => t.cal.colorOf(se)
	]), X("click", y, function(...e) {
		t.oncreate?.apply(this, e);
	}), X("click", F, () => B(n, M(A(n), -1), !0)), X("click", z, () => B(n, M(A(n), 1), !0)), X("click", K, () => t.cal.toggle(se, "Tasks")), X("click", xe, () => t.cal.atlas.plugin.openSettings()), D(e, v), ve();
}
G(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/TimeGrid.svelte
var Ve = e("<button title=\"Open this day\"><span class=\"wd svelte-16enfn0\"> </span> <span class=\"num svelte-16enfn0\"> </span></button>"), He = e("<div class=\"lanecell svelte-16enfn0\" role=\"button\" tabindex=\"-1\" aria-label=\"New all-day event\"></div>"), Ue = e("<span class=\"tbox svelte-16enfn0\" aria-hidden=\"true\"></span>"), We = e("<span class=\"dot svelte-16enfn0\" aria-hidden=\"true\"></span>"), Ge = e("<button><!> </button>"), Ke = e("<div class=\"hl svelte-16enfn0\"> </div>"), qe = e("<span class=\"loc svelte-16enfn0\"> </span>"), Je = e("<div class=\"grip svelte-16enfn0\" role=\"separator\" aria-label=\"Change the end\"></div>"), Ye = e("<div role=\"button\" tabindex=\"0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span> <!> <!></div>"), Xe = e("<div class=\"ev slot-ghost svelte-16enfn0\"><span class=\"t svelte-16enfn0\"> </span> <span class=\"when svelte-16enfn0\"> </span></div>"), Ze = e("<div class=\"now svelte-16enfn0\" aria-hidden=\"true\"></div>"), Qe = e("<div role=\"gridcell\" tabindex=\"-1\"><!> <!> <!></div>"), $e = e("<div class=\"tg svelte-16enfn0\"><div class=\"head svelte-16enfn0\"><div class=\"gutter tz svelte-16enfn0\" title=\"Times in your zone\"></div> <!></div> <div class=\"lane svelte-16enfn0\"><div class=\"gutter label svelte-16enfn0\">all-day</div> <div class=\"lanecols svelte-16enfn0\"><!> <!></div></div> <div class=\"scroll svelte-16enfn0\"><div class=\"body svelte-16enfn0\"><div class=\"gutter hours svelte-16enfn0\"></div> <div class=\"cols svelte-16enfn0\" role=\"grid\" tabindex=\"-1\" aria-label=\"Hours\"></div></div></div></div>"), et = {
	hash: "svelte-16enfn0",
	code: ".tg.svelte-16enfn0 {display:grid;grid-template-rows:auto auto 1fr;height:100%;min-height:0;--gutter: 56px;}.head.svelte-16enfn0, .lane.svelte-16enfn0 {display:grid;grid-template-columns:var(--gutter) 1fr;border-bottom:1px solid var(--border);}.head.svelte-16enfn0 {grid-template-columns:var(--gutter) repeat(var(--n), 1fr);}.gutter.svelte-16enfn0 {color:var(--text-faint);font-size:0.75em;}.tz.svelte-16enfn0 {align-self:end;padding:0 6px 6px;font-size:0.68em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.dayhead.svelte-16enfn0 {all:unset;cursor:pointer;display:flex;align-items:baseline;justify-content:center;gap:6px;padding:6px 2px;color:var(--text-muted);border-left:1px solid var(--border);min-width:0;}.dayhead.svelte-16enfn0:hover {background:var(--bg-hover);}.dayhead.svelte-16enfn0:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.wd.svelte-16enfn0 {font-size:0.78em;text-transform:uppercase;letter-spacing:0.04em;}.num.svelte-16enfn0 {font-size:1.25em;font-weight:600;color:var(--heading);font-variant-numeric:tabular-nums;min-width:1.8em;text-align:center;border-radius:999px;}.dayhead.today.svelte-16enfn0 .wd:where(.svelte-16enfn0) {color:var(--accent-strong);}.dayhead.today.svelte-16enfn0 .num:where(.svelte-16enfn0) {background:var(--accent);color:var(--accent-fg);}.label.svelte-16enfn0 {align-self:center;padding:0 6px;text-align:right;}.lanecols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);grid-auto-rows:22px;row-gap:2px;padding:3px 0;min-height:26px;max-height:120px;overflow-y:auto;}.lanecell.svelte-16enfn0 {grid-row:1 / span var(--rows);border-left:1px solid var(--border);cursor:cell;}.bar.svelte-16enfn0 {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;margin:0 3px;padding:0 8px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));color:var(--text);font-size:0.82em;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px;border-left:3px solid var(--c);}.bar.clipl.svelte-16enfn0 {border-top-left-radius:0;border-bottom-left-radius:0;margin-left:0;}.bar.clipr.svelte-16enfn0 {border-top-right-radius:0;border-bottom-right-radius:0;margin-right:0;}.dot.svelte-16enfn0 {width:6px;height:6px;border-radius:50%;background:var(--c);flex:none;}\n  /* a task of the Tasks & deadlines layer: its box, not an event's colour block */.bar.task.svelte-16enfn0 {background:transparent;border:1px dashed var(--border-strong);border-left-width:1px;color:var(--text-muted);}.bar.task.svelte-16enfn0:hover {background:var(--bg-hover);color:var(--text);}.tbox.svelte-16enfn0 {width:9px;height:9px;border:1.5px solid currentColor;border-radius:3px;flex:none;box-sizing:border-box;}.scroll.svelte-16enfn0 {overflow-y:auto;min-height:0;position:relative;}.body.svelte-16enfn0 {position:relative;display:grid;grid-template-columns:var(--gutter) 1fr;height:calc(24 * var(--hour));}.hours.svelte-16enfn0 {position:relative;}.hl.svelte-16enfn0 {position:absolute;right:8px;transform:translateY(-50%);font-variant-numeric:tabular-nums;white-space:nowrap;}.cols.svelte-16enfn0 {display:grid;grid-template-columns:repeat(var(--n), 1fr);position:relative;touch-action:pan-y;}.col.svelte-16enfn0 {position:relative;border-left:1px solid var(--border);cursor:cell;min-width:0;background-image:repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px var(--hour)), repeating-linear-gradient(to bottom, transparent 0 calc(var(--hour) / 2), color-mix(in srgb, var(--border) 45%, transparent) calc(var(--hour) / 2) calc(var(--hour) / 2 + 1px), transparent calc(var(--hour) / 2 + 1px) var(--hour));}.col.weekend.svelte-16enfn0 {background-color:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.ev.svelte-16enfn0 {position:absolute;box-sizing:border-box;container-type:inline-size;cursor:pointer;border-radius:var(--radius-sm);padding:2px 6px;overflow:hidden;display:flex;flex-direction:column;gap:0;font-size:0.8em;line-height:1.25;background:color-mix(in srgb, var(--c) 24%, var(--bg));border-left:3px solid var(--c);color:var(--text);box-shadow:0 0 0 1px var(--bg);touch-action:none;z-index:calc(1 + var(--depth, 0));}\n  /* drawn over a running event: opaque, with a ring of the page and a shadow so the one under it reads as a separate block */.ev.over.svelte-16enfn0 {box-shadow:0 0 0 1px var(--bg), var(--shadow-sm);}\n  /* a bar is an .ev too (selection, colours) but a grid item in a row: absolute dropped its grid-column (every bar on Monday), a column centred its words */.bar.ev.svelte-16enfn0 {position:relative;flex-direction:row;}.ev.svelte-16enfn0:hover {background:color-mix(in srgb, var(--c) 34%, var(--bg));}.ev.svelte-16enfn0:focus-visible, .ev.sel.svelte-16enfn0, .bar.sel.svelte-16enfn0, .bar.svelte-16enfn0:focus-visible {outline:2px solid var(--c);outline-offset:1px;z-index:40;}.ev.short.svelte-16enfn0 {flex-direction:row;gap:6px;align-items:baseline;}.ev.short.svelte-16enfn0 .t:where(.svelte-16enfn0) {flex:0 1 auto;min-width:2.5em;}.ev.short.svelte-16enfn0 .when:where(.svelte-16enfn0) {flex:0 100 auto;min-width:0;}.ev.ro.svelte-16enfn0 {cursor:default;}.ev.free.svelte-16enfn0 {background:color-mix(in srgb, var(--c) 10%, var(--bg));}.ev.cancel.svelte-16enfn0 .t:where(.svelte-16enfn0), .bar.cancel.svelte-16enfn0 {text-decoration:line-through;opacity:0.7;}.ev.ghosted.svelte-16enfn0 {opacity:0.35;}.t.svelte-16enfn0 {font-weight:600;overflow:hidden;text-overflow:ellipsis;min-width:0;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;flex:none;}.ev.short.svelte-16enfn0 .t:where(.svelte-16enfn0) {display:block;white-space:nowrap;}.when.svelte-16enfn0, .loc.svelte-16enfn0 {color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}.grip.svelte-16enfn0 {position:absolute;left:0;right:0;bottom:0;height:7px;cursor:ns-resize;}.slot-ghost.svelte-16enfn0 {z-index:41;pointer-events:none;box-shadow:var(--shadow-md, 0 4px 16px rgba(0,0,0,.25));background:color-mix(in srgb, var(--c) 40%, var(--bg));}.now.svelte-16enfn0 {position:absolute;left:-1px;right:0;height:2px;background:var(--red);z-index:42;pointer-events:none;}.now.svelte-16enfn0::before {content:\"\";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--red);}\n  /* narrow: the title alone (two lines when tall enough) rather than both cut — the rest is in the tooltip */\n  @container (max-width: 72px) {.when.svelte-16enfn0, .loc.svelte-16enfn0 {display:none;}\n  }\n  @media (prefers-reduced-motion: no-preference) {.ev.svelte-16enfn0 {transition:opacity 120ms var(--ease);} }"
};
function tt(e, t) {
	j(t, !0), S(e, et);
	let n = R(void 0), i = R(void 0), a = k(() => t.days.map((e) => le(t.cal.events, e))), o = k(() => oe(t.cal.shownEvents(), t.days)), s = k(() => Math.max(1, ...A(o).map((e) => e.row + 1))), d = Array.from({ length: 24 }, (e, t) => t), f = (e) => e === 0 ? "" : t.cal.h12 ? new Date(2e3, 0, 1, e).toLocaleTimeString(void 0, {
		hour: "numeric",
		hour12: !0
	}) : String(e).padStart(2, "0"), p = k(() => t.cal.now.getHours() * 60 + t.cal.now.getMinutes()), m = (e) => t.selected !== null && t.selected.uid === e.uid && t.selected.rid === e.rid && t.selected.calendar === e.calendar, h = (e) => e.color ?? t.cal.colorOf(e.calendar), g = (e, t) => `calc(${e * 100}% + ${t}px)`, _ = (e) => [
		e.summary || "(no title)",
		`${x(N(e), t.cal.h12)} – ${x(de(e), t.cal.h12)}`,
		e.location,
		e.calendar_name
	].filter(Boolean).join("\n");
	ie(() => {
		let e = Number(t.cal.settings.day_start ?? 8), r = t.days.some((e) => he(e, t.cal.now)) ? Math.max(0, A(p) / 60 - 2) : e;
		A(n) && (A(n).scrollTop = Math.max(0, r * 48 - 8));
	});
	let v = R(null), y = (e) => Math.round(e / 15) * 15;
	function T(e) {
		let n = A(i).getBoundingClientRect();
		return {
			day: Math.min(t.days.length - 1, Math.max(0, Math.floor((e.clientX - n.left) / n.width * t.days.length))),
			min: Math.min(1440, Math.max(0, (e.clientY - n.top) / 48 * 60))
		};
	}
	function O(e, t, n, r = 0, i = 0) {
		if (e.button !== 0) return;
		e.stopPropagation();
		let a = T(e);
		if (t === "create") {
			let n = Math.floor(a.min / 15) * 15;
			B(v, {
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
		} else B(v, {
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
		if (!A(v) || !A(v).moved && Math.hypot(e.clientX - A(v).x0, e.clientY - A(v).y0) < 4) return;
		let t = T(e), n = A(v);
		if (n.moved = !0, n.kind === "create") {
			let e = y(t.min);
			[n.from, n.to] = e >= n.grab ? [n.grab, Math.max(n.grab + 15, e)] : [e, n.grab + 15];
		} else if (n.kind === "move") {
			let e = y(t.min - n.grab);
			n.day = t.day, n.from = Math.max(0, Math.min(1425, e)), n.to = n.from + n.len;
		} else n.to = Math.max(n.from + 15, y(t.min));
		B(v, { ...n }, !0);
	}
	async function M(e) {
		let n = A(v);
		if (B(v, null), document.body.style.userSelect = "", !n) return;
		let r = (e, n) => new Date(t.days[e].getFullYear(), t.days[e].getMonth(), t.days[e].getDate(), 0, n);
		if (n.kind === "create") {
			if (t.cal.placing) {
				t.cal.timeBlock(r(n.day, n.from), r(n.day, n.to));
				return;
			}
			let e = A(i).getBoundingClientRect(), a = e.width / t.days.length;
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
	function te(e) {
		A(v) && e.key === "Escape" && (B(v, null), document.body.style.userSelect = "", e.stopPropagation());
	}
	function P(e, n) {
		if (e.target.closest(".bar") || t.cal.placing) return;
		let i = t.days[n];
		t.oncreate(r(i), Z(r(i), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var F = $e();
	ne("keydown", ae, te);
	let I;
	var z = $(F), V = $(z);
	V.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ");
	var H = q(V, 2);
	w(H, 17, () => t.days, c, (e, n) => {
		var r = Ve();
		let i;
		var a = $(r), o = L(a, !0), s = q(a, 2), c = L(s, !0);
		b(r), Q((e, t, n) => {
			i = l(r, 1, "dayhead svelte-16enfn0", null, i, { today: e }), E(o, t), E(c, n);
		}, [
			() => he(A(n), t.cal.now),
			() => A(n).toLocaleDateString(void 0, { weekday: "short" }),
			() => A(n).getDate()
		]), X("click", r, () => t.cal.go(A(n), "day")), D(e, r);
	}), b(z);
	var U = q(z, 2);
	let W;
	var G = q($(U), 2), se = $(G);
	w(se, 17, () => t.days, c, (e, t, n) => {
		var r = He();
		C(r, "", {}, { "grid-column": n + 1 }), X("click", r, (e) => P(e, n)), X("keydown", r, () => {}), D(e, r);
	});
	var ce = q(se, 2);
	w(ce, 17, () => A(o), (e) => e.e.calendar + e.e.uid + (e.e.rid ?? "") + e.from, (e, n) => {
		var r = Ge();
		let i, a;
		var o = $(r), s = (e) => {
			var t = Ue();
			D(e, t);
		}, c = (e) => {
			var t = We();
			D(e, t);
		}, d = k(() => fe(A(n).e));
		J(o, (e) => {
			A(n).e.task ? e(s) : A(d) && e(c, 1);
		});
		var f = q(o, 1, !0);
		b(r), Q((e, t) => {
			i = l(r, 1, "bar ev svelte-16enfn0", null, i, {
				task: !!A(n).e.task,
				sel: e,
				clipl: A(n).clippedStart,
				clipr: A(n).clippedEnd,
				cancel: A(n).e.status === "CANCELLED"
			}), u(r, "title", A(n).e.summary), a = C(r, "", a, {
				"--c": t,
				"grid-column": `${A(n).from + 1} / ${A(n).to + 2}`,
				"grid-row": A(n).row + 1
			}), E(f, A(n).e.summary || "(no title)");
		}, [() => m(A(n).e), () => h(A(n).e)]), X("click", r, (e) => t.onselect(A(n).e, e.currentTarget.getBoundingClientRect())), D(e, r);
	}), b(G), b(U);
	var K = q(U, 2), Y = $(K), ue = $(Y);
	w(ue, 20, () => d, (e) => e, (e, t) => {
		var n = Ke();
		let r;
		var i = L(n, !0);
		Q((e) => {
			r = C(n, "", r, { top: `${t * 48}px` }), E(i, e);
		}, [() => f(t)]), D(e, n);
	}), b(ue);
	var pe = q(ue, 2);
	w(pe, 21, () => t.days, c, (e, n, r) => {
		var i = Qe();
		let o;
		var s = $(i);
		w(s, 17, () => A(a)[r], (e) => e.e.calendar + e.e.uid + (e.e.rid ?? ""), (e, n) => {
			let r = k(() => A(n).bottom - A(n).top < 40);
			var i = Ye();
			let a, o;
			var s = $(i), c = L(s, !0), d = q(s, 2), f = L(d), p = q(d, 2), y = (e) => {
				var t = qe(), r = L(t, !0);
				Q(() => E(r, A(n).e.location)), D(e, t);
			};
			J(p, (e) => {
				!A(r) && A(n).e.location && e(y);
			});
			var S = q(p, 2), w = (e) => {
				var t = Je();
				X("pointerdown", t, (e) => O(e, "resize", A(n).e, A(n).top, A(n).bottom)), D(e, t);
			};
			J(S, (e) => {
				A(n).e.writable && !A(n).endsAfter && e(w);
			}), b(i), Q((e, t, s, d, p, m, h, g, _) => {
				a = l(i, 1, "ev svelte-16enfn0", null, a, {
					sel: e,
					short: A(r),
					over: A(n).depth > 0,
					ro: !A(n).e.writable,
					cancel: A(n).e.status === "CANCELLED",
					free: A(n).e.free,
					ghosted: A(v)?.e === A(n).e && A(v).moved
				}), u(i, "title", t), u(i, "aria-label", `${A(n).e.summary ?? ""}, ${s ?? ""}`), o = C(i, "", o, {
					"--c": d,
					top: `${A(n).top / 60 * 48}px`,
					height: p,
					left: m,
					width: h,
					"--depth": A(n).depth
				}), E(c, A(n).e.summary || "(no title)"), E(f, `${g ?? ""}${_ ?? ""}`);
			}, [
				() => m(A(n).e),
				() => _(A(n).e),
				() => x(N(A(n).e), t.cal.h12),
				() => h(A(n).e),
				() => `${Math.max(14, (A(n).bottom - A(n).top) / 60 * 48 - 2)}px`,
				() => g(A(n).box.x, A(n).box.xpx + 1),
				() => g(A(n).box.w, A(n).box.wpx - 3),
				() => x(N(A(n).e), t.cal.h12),
				() => A(r) ? "" : ` – ${x(de(A(n).e), t.cal.h12)}`
			]), X("pointerdown", i, (e) => A(n).startsBefore || A(n).endsAfter ? e.stopPropagation() : O(e, "move", A(n).e, A(n).top, A(n).bottom)), X("click", i, (e) => {
				(A(n).startsBefore || A(n).endsAfter) && t.onselect(A(n).e, e.currentTarget.getBoundingClientRect());
			}), X("keydown", i, (e) => {
				e.key === "Enter" && t.onselect(A(n).e, e.currentTarget.getBoundingClientRect());
			}), D(e, i);
		});
		var c = q(s, 2), d = (e) => {
			var n = Xe();
			let r;
			var i = $(n), a = L(i, !0), o = q(i, 2), s = L(o);
			b(n), Q((e, i, o) => {
				r = C(n, "", r, {
					"--c": e,
					top: `${A(v).from / 60 * 48}px`,
					height: `${(A(v).to - A(v).from) / 60 * 48 - 2}px`,
					left: "1px",
					width: "calc(100% - 3px)"
				}), E(a, A(v).e?.summary ?? t.cal.placing?.title ?? "New event"), E(s, `${i ?? ""} – ${o ?? ""}`);
			}, [
				() => A(v).e ? h(A(v).e) : "var(--accent)",
				() => x(new Date(2e3, 0, 1, 0, A(v).from), t.cal.h12),
				() => x(new Date(2e3, 0, 1, 0, A(v).to), t.cal.h12)
			]), D(e, n);
		};
		J(c, (e) => {
			A(v) && A(v).moved && A(v).day === r && e(d);
		});
		var f = q(c, 2), y = (e) => {
			var t = Ze();
			let n;
			Q(() => n = C(t, "", n, { top: `${A(p) / 60 * 48}px` })), D(e, t);
		}, S = k(() => he(A(n), t.cal.now));
		J(f, (e) => {
			A(S) && e(y);
		}), b(i), Q((e, t) => o = l(i, 1, "col svelte-16enfn0", null, o, {
			today: e,
			weekend: t
		}), [() => he(A(n), t.cal.now), () => A(n).getDay() === 0 || A(n).getDay() === 6]), X("pointerdown", i, (e) => O(e, "create")), D(e, i);
	}), b(pe), re(pe, (e) => B(i, e), () => A(i)), b(Y), b(K), re(K, (e) => B(n, e), () => A(n)), b(F), Q(() => {
		I = C(F, "", I, {
			"--n": t.days.length,
			"--hour": "48px"
		}), W = C(U, "", W, { "--rows": A(s) });
	}), X("pointermove", pe, ee), X("pointerup", pe, M), ne("pointercancel", pe, () => B(v, null)), D(e, F), ve();
}
G([
	"click",
	"keydown",
	"pointermove",
	"pointerup",
	"pointerdown"
]);
//#endregion
//#region plugins/stable/dav/ui/src/MonthView.svelte
var nt = e("<div class=\"wd svelte-13jyj5s\"> </div>"), rt = e("<div role=\"button\" tabindex=\"-1\"><button class=\"num svelte-13jyj5s\" title=\"Open this day\"> </button></div>"), it = e("<button> </button>"), at = e("<button><span class=\"dot svelte-13jyj5s\" aria-hidden=\"true\"></span><span class=\"tm svelte-13jyj5s\"> </span><span class=\"tt svelte-13jyj5s\"> </span></button>"), ot = e("<button class=\"more svelte-13jyj5s\"> </button>"), st = e("<!> <!>", 1), ct = e("<div class=\"week svelte-13jyj5s\"><!> <!> <!></div>"), lt = e("<div class=\"month svelte-13jyj5s\"><div class=\"wds svelte-13jyj5s\"></div> <div class=\"weeks svelte-13jyj5s\"></div></div>"), ut = {
	hash: "svelte-13jyj5s",
	code: ".month.svelte-13jyj5s {display:grid;grid-template-rows:auto 1fr;height:100%;min-height:0;}.wds.svelte-13jyj5s {display:grid;grid-template-columns:repeat(7, 1fr);border-bottom:1px solid var(--border);}.wd.svelte-13jyj5s {padding:6px 8px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-faint);}.weeks.svelte-13jyj5s {display:grid;grid-template-rows:repeat(var(--rows), minmax(96px, 1fr));min-height:0;overflow-y:auto;}.week.svelte-13jyj5s {display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));grid-template-rows:26px repeat(4, 21px) 1fr;row-gap:1px;border-bottom:1px solid var(--border);position:relative;min-height:0;}.cell.svelte-13jyj5s {grid-row:1 / -1;border-left:1px solid var(--border);padding:2px 4px;cursor:cell;min-width:0;}.cell.svelte-13jyj5s:first-child {border-left:0;}.cell.weekend.svelte-13jyj5s {background:color-mix(in srgb, var(--bg-alt) 70%, transparent);}.cell.other.svelte-13jyj5s {background:color-mix(in srgb, var(--bg-alt) 90%, transparent);}.cell.other.svelte-13jyj5s .num:where(.svelte-13jyj5s) {color:var(--text-faint);}.num.svelte-13jyj5s {all:unset;cursor:pointer;font-size:0.82em;font-weight:600;color:var(--text-muted);padding:1px 6px;border-radius:999px;font-variant-numeric:tabular-nums;}.num.svelte-13jyj5s:hover {background:var(--bg-hover);color:var(--text);}.today.svelte-13jyj5s .num:where(.svelte-13jyj5s) {background:var(--accent);color:var(--accent-fg);}.num.svelte-13jyj5s:focus-visible, .bar.svelte-13jyj5s:focus-visible, .line.svelte-13jyj5s:focus-visible, .more.svelte-13jyj5s:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.bar.svelte-13jyj5s, .line.svelte-13jyj5s, .more.svelte-13jyj5s {all:unset;box-sizing:border-box;cursor:pointer;z-index:1;min-width:0;font-size:0.8em;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.bar.svelte-13jyj5s {margin:0 3px;padding:0 7px;border-radius:var(--radius-sm);background:color-mix(in srgb, var(--c) 26%, var(--bg));border-left:3px solid var(--c);color:var(--text);}.bar.clipl.svelte-13jyj5s {margin-left:0;border-top-left-radius:0;border-bottom-left-radius:0;}.bar.clipr.svelte-13jyj5s {margin-right:0;border-top-right-radius:0;border-bottom-right-radius:0;}.line.svelte-13jyj5s {display:flex;align-items:center;gap:5px;margin:0 3px;padding:0 4px;border-radius:var(--radius-sm);color:var(--text);}.line.svelte-13jyj5s:hover, .bar.svelte-13jyj5s:hover {background:color-mix(in srgb, var(--c) 18%, var(--bg-hover));}.sel.svelte-13jyj5s {outline:2px solid var(--c);outline-offset:-1px;}.cancel.svelte-13jyj5s .tt:where(.svelte-13jyj5s) {text-decoration:line-through;opacity:0.7;}.dot.svelte-13jyj5s {width:7px;height:7px;border-radius:50%;background:var(--c);flex:none;}.tm.svelte-13jyj5s {color:var(--text-muted);font-variant-numeric:tabular-nums;flex:none;}.tt.svelte-13jyj5s {overflow:hidden;text-overflow:ellipsis;min-width:0;}.more.svelte-13jyj5s {margin:0 3px;padding:0 6px;color:var(--text-muted);font-weight:600;border-radius:var(--radius-sm);}.more.svelte-13jyj5s:hover {background:var(--bg-hover);color:var(--text);}\n  @container (max-width: 760px) {.tm.svelte-13jyj5s {display:none;} }"
};
function dt(e, t) {
	j(t, !0), S(e, ut);
	let n = k(() => Array.from({ length: Math.ceil(t.days.length / 7) }, (e, n) => t.days.slice(n * 7, n * 7 + 7))), i = k(() => t.cal.cursor.getMonth()), a = (e) => e.color ?? t.cal.colorOf(e.calendar), o = (e) => t.selected !== null && t.selected.uid === e.uid && t.selected.rid === e.rid && t.selected.calendar === e.calendar, s = (e) => e.calendar + e.uid + (e.rid ?? "");
	function d(e) {
		let n = oe(t.cal.shownEvents(), e), r = Math.min(4, Math.max(0, ...n.map((e) => e.row + 1))), i = n.filter((e) => e.row < 4 - !!n.some((e) => e.row >= 4));
		return {
			bars: i,
			used: r,
			cells: e.map((e, a) => {
				let o = Y(t.cal.events, e).filter((e) => !U(e)).sort((e, t) => N(e).getTime() - N(t).getTime()), s = n.filter((e) => e.from <= a && e.to >= a), c = s.filter((e) => !i.includes(e)).length, l = Math.max(0, 4 - r - 1), u = o.length + c <= l + 1 ? o.slice(0, l + 1) : o.slice(0, l);
				return {
					timed: u,
					more: o.length - u.length + c,
					total: o.length + s.length
				};
			})
		};
	}
	function f(e, n) {
		e.target.closest("button") || t.oncreate(r(n), Z(r(n), 1), !0, e.currentTarget.getBoundingClientRect());
	}
	var p = lt();
	let m;
	var h = $(p);
	w(h, 21, () => A(n)[0] ?? [], (e) => e.getDay(), (e, t) => {
		var n = nt(), r = L(n, !0);
		Q((e) => E(r, e), [() => A(t).toLocaleDateString(void 0, { weekday: "short" })]), D(e, n);
	}), b(h);
	var g = q(h, 2);
	w(g, 21, () => A(n), c, (e, n) => {
		let r = k(() => d(A(n)));
		var p = ct(), m = $(p);
		w(m, 17, () => A(n), c, (e, n, r) => {
			var a = rt();
			let o;
			C(a, "", {}, { "grid-column": r + 1 });
			var s = $(a), c = L(s, !0);
			b(a), Q((e, t, n, r, i) => {
				o = l(a, 1, "cell svelte-13jyj5s", null, o, {
					other: e,
					today: t,
					weekend: n
				}), u(a, "aria-label", `New event on ${r ?? ""}`), E(c, i);
			}, [
				() => A(n).getMonth() !== A(i),
				() => he(A(n), t.cal.now),
				() => A(n).getDay() === 0 || A(n).getDay() === 6,
				() => A(n).toLocaleDateString(),
				() => A(n).getDate() === 1 ? A(n).toLocaleDateString(void 0, {
					day: "numeric",
					month: "short"
				}) : A(n).getDate()
			]), X("click", a, (e) => f(e, A(n))), X("keydown", a, () => {}), X("click", s, () => t.cal.go(A(n), "day")), D(e, a);
		});
		var h = q(m, 2);
		w(h, 17, () => A(r).bars, (e) => s(e.e) + e.from, (e, n) => {
			var r = it();
			let i, s;
			var c = L(r, !0);
			Q((e, t) => {
				i = l(r, 1, "bar svelte-13jyj5s", null, i, {
					sel: e,
					clipl: A(n).clippedStart,
					clipr: A(n).clippedEnd
				}), u(r, "title", A(n).e.summary), s = C(r, "", s, {
					"--c": t,
					"grid-column": `${A(n).from + 1} / ${A(n).to + 2}`,
					"grid-row": A(n).row + 2
				}), E(c, A(n).e.summary || "(no title)");
			}, [() => o(A(n).e), () => a(A(n).e)]), X("click", r, (e) => t.onselect(A(n).e, e.currentTarget.getBoundingClientRect())), D(e, r);
		});
		var g = q(h, 2);
		w(g, 17, () => A(r).cells, c, (e, i, c) => {
			var d = st(), f = P(d);
			w(f, 19, () => A(i).timed, (e) => s(e), (e, n, i) => {
				var s = at();
				let d, f;
				var p = q($(s)), m = L(p, !0), h = q(p), g = L(h, !0);
				b(s), Q((e, t, a, o) => {
					d = l(s, 1, "line svelte-13jyj5s", null, d, {
						sel: e,
						cancel: A(n).status === "CANCELLED"
					}), u(s, "title", `${t ?? ""} ${A(n).summary ?? ""}`), f = C(s, "", f, {
						"--c": a,
						"grid-column": c + 1,
						"grid-row": A(r).used + 2 + A(i)
					}), E(m, o), E(g, A(n).summary || "(no title)");
				}, [
					() => o(A(n)),
					() => x(N(A(n)), t.cal.h12),
					() => a(A(n)),
					() => x(N(A(n)), t.cal.h12)
				]), X("click", s, (e) => t.onselect(A(n), e.currentTarget.getBoundingClientRect())), D(e, s);
			});
			var p = q(f, 2), m = (e) => {
				var a = ot();
				let o;
				var s = L(a);
				Q(() => {
					o = C(a, "", o, {
						"grid-column": c + 1,
						"grid-row": A(r).used + 2 + A(i).timed.length
					}), E(s, `+${A(i).more ?? ""} more`);
				}), X("click", a, () => t.cal.go(A(n)[c], "day")), D(e, a);
			};
			J(p, (e) => {
				A(i).more > 0 && e(m);
			}), D(e, d);
		}), b(p), D(e, p);
	}), b(g), b(p), Q(() => m = C(p, "", m, { "--rows": A(n).length })), D(e, p), ve();
}
G(["click", "keydown"]);
//#endregion
//#region plugins/stable/dav/ui/src/AgendaView.svelte
var ft = e("<div class=\"empty svelte-zo3qq8\"> </div>"), pt = e("<span class=\"loc svelte-zo3qq8\"> </span>"), mt = e("<span class=\"ic svelte-zo3qq8\" title=\"Repeats\"><!></span>"), ht = e("<span class=\"ic svelte-zo3qq8\" title=\"From a note\"><!></span>"), gt = e("<li><button><span class=\"dot svelte-zo3qq8\" aria-hidden=\"true\"></span> <span class=\"time svelte-zo3qq8\"> </span> <span class=\"what svelte-zo3qq8\"> <!></span> <!> <!> <span class=\"cal svelte-zo3qq8\"> </span></button></li>"), _t = e("<section><button class=\"date svelte-zo3qq8\" title=\"Open this day\"><span class=\"n svelte-zo3qq8\"> </span> <span class=\"w svelte-zo3qq8\"> <br/> </span></button> <ul class=\"svelte-zo3qq8\"></ul></section>"), vt = e("<div class=\"agenda svelte-zo3qq8\"><!> <!></div>"), yt = {
	hash: "svelte-zo3qq8",
	code: ".agenda.svelte-zo3qq8 {height:100%;overflow-y:auto;padding:6px 0 40px;}.empty.svelte-zo3qq8 {padding:40px;text-align:center;color:var(--text-faint);}.day.svelte-zo3qq8 {display:grid;grid-template-columns:92px 1fr;gap:8px;padding:6px 14px;border-bottom:1px solid var(--border);}.date.svelte-zo3qq8 {all:unset;cursor:pointer;display:flex;gap:8px;align-items:flex-start;padding:4px 0;color:var(--text-muted);}.n.svelte-zo3qq8 {font-size:1.5em;font-weight:650;color:var(--heading);min-width:1.6em;text-align:right;font-variant-numeric:tabular-nums;line-height:1.1;}.w.svelte-zo3qq8 {font-size:0.75em;text-transform:uppercase;letter-spacing:0.04em;line-height:1.35;}.today.svelte-zo3qq8 .n:where(.svelte-zo3qq8) {color:var(--accent-strong);}.date.svelte-zo3qq8:focus-visible, .row.svelte-zo3qq8:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}ul.svelte-zo3qq8 {list-style:none;margin:0;padding:0;display:grid;gap:1px;min-width:0;}.row.svelte-zo3qq8 {all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:10px;width:100%;padding:6px 8px;border-radius:var(--radius-sm);min-width:0;}.row.svelte-zo3qq8:hover {background:var(--bg-hover);}.row.sel.svelte-zo3qq8 {background:color-mix(in srgb, var(--c) 16%, var(--bg));}.dot.svelte-zo3qq8 {width:9px;height:9px;border-radius:50%;background:var(--c);flex:none;}.time.svelte-zo3qq8 {flex:none;width:11.5em;white-space:nowrap;color:var(--text-muted);font-variant-numeric:tabular-nums;font-size:0.9em;}.what.svelte-zo3qq8 {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);}.loc.svelte-zo3qq8 {color:var(--text-muted);}.cancel.svelte-zo3qq8 .what:where(.svelte-zo3qq8) {text-decoration:line-through;opacity:0.7;}.ic.svelte-zo3qq8 {color:var(--text-faint);flex:none;}.cal.svelte-zo3qq8 {flex:none;color:var(--text-faint);font-size:0.8em;max-width:12em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n  @container (max-width: 560px) {.day.svelte-zo3qq8 {grid-template-columns:1fr;gap:0;padding:6px 10px;}.date.svelte-zo3qq8 {padding-bottom:0;}.time.svelte-zo3qq8 {width:auto;min-width:5.5em;}.cal.svelte-zo3qq8 {display:none;}\n  }"
};
function bt(e, n) {
	j(n, !0), S(e, yt);
	let i = t(n, "search", 3, !1), a = k(() => {
		if (i()) {
			let e = /* @__PURE__ */ new Map();
			for (let t of n.events) {
				let n = r(N(t)).getTime();
				e.set(n, [...e.get(n) ?? [], t]);
			}
			return [...e.entries()].map(([e, t]) => ({
				day: new Date(e),
				evs: t
			}));
		}
		let e = [];
		for (let t = n.from; t <= n.to; t = Z(t, 1)) {
			let r = Y(n.events, t).sort((e, t) => Number(!e.all_day) - Number(!t.all_day) || N(e).getTime() - N(t).getTime());
			r.length && e.push({
				day: t,
				evs: r
			});
		}
		return e;
	}), o = (e) => e.color ?? n.cal.colorOf(e.calendar), s = (e) => n.selected !== null && n.selected.uid === e.uid && n.selected.rid === e.rid && n.selected.calendar === e.calendar;
	function c(e, t) {
		if (e.all_day) return "All day";
		let i = N(e), a = de(e);
		return `${he(i, t) ? x(i, n.cal.h12) : "…"} – ${he(a, t) || a.getTime() - r(t).getTime() <= 864e5 && a.getHours() === 0 && a.getMinutes() === 0 ? x(a, n.cal.h12) : "…"}`;
	}
	var u = vt(), d = $(u), f = (e) => {
		var t = ft(), n = L(t, !0);
		Q(() => E(n, i() ? "No event matches." : "Nothing in the coming days.")), D(e, t);
	};
	J(d, (e) => {
		A(a).length || e(f);
	});
	var p = q(d, 2);
	w(p, 17, () => A(a), (e) => e.day.getTime(), (e, t) => {
		var r = _t();
		let i;
		var a = $(r), u = $(a), d = L(u, !0), f = q(u, 2), p = $(f, !0), m = q(p, 2, !0);
		b(f), b(a);
		var h = q(a, 2);
		w(h, 21, () => A(t).evs, (e) => e.calendar + e.uid + (e.rid ?? ""), (e, r) => {
			var i = gt(), a = $(i);
			let u, d;
			var f = q($(a), 2), p = L(f, !0), m = q(f, 2), h = $(m, !0), g = q(h), _ = (e) => {
				var t = pt(), n = L(t);
				Q(() => E(n, ` · ${A(r).location ?? ""}`)), D(e, t);
			};
			J(g, (e) => {
				A(r).location && e(_);
			}), b(m);
			var v = q(m, 2), y = (e) => {
				var t = mt(), n = $(t);
				V(n, {
					name: "repeat",
					size: 13
				}), b(t), D(e, t);
			};
			J(v, (e) => {
				A(r).recurring && e(y);
			});
			var x = q(v, 2), S = (e) => {
				var t = ht(), n = $(t);
				V(n, {
					name: "note",
					size: 13
				}), b(t), D(e, t);
			}, w = k(() => fe(A(r)));
			J(x, (e) => {
				A(w) && e(S);
			});
			var T = q(x, 2), O = L(T, !0);
			b(a), b(i), Q((e, t, n) => {
				u = l(a, 1, "row svelte-zo3qq8", null, u, {
					sel: e,
					cancel: A(r).status === "CANCELLED"
				}), d = C(a, "", d, { "--c": t }), E(p, n), E(h, A(r).summary || "(no title)"), E(O, A(r).calendar_name);
			}, [
				() => s(A(r)),
				() => o(A(r)),
				() => c(A(r), A(t).day)
			]), X("click", a, (e) => n.onselect(A(r), e.currentTarget.getBoundingClientRect())), D(e, i);
		}), b(h), b(r), Q((e, t, n, a) => {
			i = l(r, 1, "day svelte-zo3qq8", null, i, { today: e }), E(d, t), E(p, n), E(m, a);
		}, [
			() => he(A(t).day, n.cal.now),
			() => A(t).day.getDate(),
			() => A(t).day.toLocaleDateString(void 0, { weekday: "short" }),
			() => A(t).day.toLocaleDateString(void 0, {
				month: "short",
				year: A(t).day.getFullYear() === n.cal.now.getFullYear() ? void 0 : "numeric"
			})
		]), X("click", a, () => n.cal.go(A(t).day, "day")), D(e, r);
	}), b(u), D(e, u), ve();
}
G(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/YearView.svelte
var xt = e("<span class=\"h svelte-18a11kl\"> </span>"), St = e("<button> </button>"), Ct = e("<span></span>"), wt = e("<section><button class=\"mname svelte-18a11kl\"> </button> <div class=\"days svelte-18a11kl\"><!> <!></div></section>"), Tt = e("<div class=\"year svelte-18a11kl\"></div>"), Et = {
	hash: "svelte-18a11kl",
	code: ".year.svelte-18a11kl {height:100%;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(210px, 1fr));gap:18px 24px;padding:16px 20px 40px;align-content:start;}.mname.svelte-18a11kl {all:unset;cursor:pointer;font-weight:650;color:var(--heading);margin-bottom:6px;display:block;}.mname.svelte-18a11kl:hover {color:var(--accent-strong);}.days.svelte-18a11kl {display:grid;grid-template-columns:repeat(7, 1fr);gap:2px;}.h.svelte-18a11kl {font-size:0.7em;color:var(--text-faint);text-align:center;}.d.svelte-18a11kl {all:unset;cursor:pointer;text-align:center;font-size:0.78em;padding:3px 0;border-radius:var(--radius-sm);font-variant-numeric:tabular-nums;color:var(--text-muted);background:color-mix(in srgb, var(--accent) calc(var(--k) * 55%), transparent);}.d.svelte-18a11kl:hover {outline:1px solid var(--accent);}.d.svelte-18a11kl:focus-visible {outline:2px solid var(--accent);}.d.today.svelte-18a11kl {background:var(--accent);color:var(--accent-fg);font-weight:700;}"
};
function Dt(e, t) {
	j(t, !0), S(e, Et);
	let n = k(() => t.cal.cursor.getFullYear()), r = k(() => {
		let e = /* @__PURE__ */ new Map();
		for (let r = new Date(A(n), 0, 1); r.getFullYear() === A(n); r = Z(r, 1)) e.set(r.toDateString(), Y(t.cal.events, r).length);
		return e;
	}), i = k(() => Math.max(1, ...A(r).values()));
	function a(e) {
		let r = me(new Date(A(n), e, 1), t.cal.first);
		return Array.from({ length: 42 }, (e, t) => Z(r, t));
	}
	let o = k(() => Array.from({ length: 7 }, (e, n) => Z(me(/* @__PURE__ */ new Date(), t.cal.first), n).toLocaleDateString(void 0, { weekday: "narrow" })));
	var s = Tt();
	w(s, 20, () => Array.from({ length: 12 }, (e, t) => t), (e) => e, (e, s) => {
		var d = wt(), f = $(d), p = L(f, !0), m = q(f, 2), h = $(m);
		w(h, 17, () => A(o), c, (e, t) => {
			var n = xt(), r = L(n, !0);
			Q(() => E(r, A(t))), D(e, n);
		});
		var g = q(h, 2);
		w(g, 17, () => a(s), (e) => e.getTime(), (e, n) => {
			let a = k(() => A(n).getMonth() === s ? A(r).get(A(n).toDateString()) ?? 0 : 0);
			var o = _(), c = P(o), d = (e) => {
				var r = St();
				let o, s;
				var c = L(r, !0);
				Q((e, t, n) => {
					o = l(r, 1, "d svelte-18a11kl", null, o, { today: e }), u(r, "title", `${t ?? ""}: ${A(a) ?? ""} event${A(a) === 1 ? "" : "s"}`), s = C(r, "", s, { "--k": A(a) / A(i) }), E(c, n);
				}, [
					() => he(A(n), t.cal.now),
					() => A(n).toLocaleDateString(),
					() => A(n).getDate()
				]), X("click", r, () => t.cal.go(A(n), "day")), D(e, r);
			}, f = k(() => A(n).getMonth() === s), p = (e) => {
				var t = Ct();
				D(e, t);
			};
			J(c, (e) => {
				A(f) ? e(d) : e(p, -1);
			}), D(e, o);
		}), b(m), b(d), Q((e) => E(p, e), [() => new Date(A(n), s, 1).toLocaleDateString(void 0, { month: "long" })]), X("click", f, () => t.cal.go(new Date(A(n), s, 1), "month")), D(e, d);
	}), b(s), D(e, s), ve();
}
G(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/CalendarPicker.svelte
var Ot = e("<option> </option>"), kt = e("<optgroup></optgroup>"), At = e("<span><span class=\"dot svelte-zssqw9\" aria-hidden=\"true\"></span> <select aria-label=\"Calendar\" class=\"svelte-zssqw9\"><!><!></select></span>"), jt = {
	hash: "svelte-zssqw9",
	code: ".pick.svelte-zssqw9 {display:inline-flex;align-items:center;gap:8px;min-width:0;flex:1;}.pick.compact.svelte-zssqw9 {flex:0 1 auto;}.dot.svelte-zssqw9 {width:12px;height:12px;border-radius:4px;background:var(--c);flex:none;}select.svelte-zssqw9 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 28px 5px 8px;min-width:0;flex:1;color-scheme:light dark;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.compact.svelte-zssqw9 select:where(.svelte-zssqw9) {flex:0 1 auto;max-width:16em;}select.svelte-zssqw9:disabled {opacity:0.6;}select.svelte-zssqw9:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}"
};
function Mt(e, n) {
	j(n, !0), S(e, jt);
	let r = t(n, "value", 15), i = t(n, "disabled", 3, !1), a = t(n, "compact", 3, !1), o = k(() => n.cal.byAccount(!0)), s = k(() => A(o).length > 1), c = (e) => n.cal.sources.find((t) => t.id === e)?.name ?? e;
	var d = At();
	let f;
	var p = $(d);
	let m;
	var h = q(p, 2), g = $(h), y = (e) => {
		var t = Ot(), n = L(t, !0), i = {};
		Q((e) => {
			E(n, e), i !== (i = r()) && (t.value = (t.__value = i) ?? "");
		}, [() => c(r())]), D(e, t);
	}, x = k(() => r() && !A(o).some((e) => e.items.some((e) => e.id === r())));
	J(g, (e) => {
		A(x) && e(y);
	});
	var T = q(g);
	w(T, 17, () => A(o), (e) => e.account.name, (e, t) => {
		var n = _(), r = P(n), i = (e) => {
			var n = kt();
			w(n, 21, () => A(t).items, (e) => e.id, (e, t) => {
				var n = Ot(), r = L(n, !0), i = {};
				Q(() => {
					E(r, A(t).name), i !== (i = A(t).id) && (n.value = (n.__value = i) ?? "");
				}), D(e, n);
			}), b(n), Q(() => u(n, "label", A(t).account.name)), D(e, n);
		}, a = (e) => {
			var n = _(), r = P(n);
			w(r, 17, () => A(t).items, (e) => e.id, (e, t) => {
				var n = Ot(), r = L(n, !0), i = {};
				Q(() => {
					E(r, A(t).name), i !== (i = A(t).id) && (n.value = (n.__value = i) ?? "");
				}), D(e, n);
			}), D(e, n);
		};
		J(r, (e) => {
			A(s) ? e(i) : e(a, -1);
		}), D(e, n);
	}), b(h), ye(h), b(d), Q((e) => {
		f = l(d, 1, "pick svelte-zssqw9", null, f, { compact: a() }), m = C(p, "", m, { "--c": e }), h.disabled = i(), u(h, "title", r());
	}, [() => r() ? n.cal.colorOf(r()) : "transparent"]), v(h, r), D(e, d), ve();
}
//#endregion
//#region plugins/stable/dav/ui/src/Popover.svelte
var Nt = e("<button class=\"atlas-btn primary svelte-id2g6u\"><!>Time-block…</button>"), Pt = e("<div class=\"bar svelte-id2g6u\"><button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <div class=\"head svelte-id2g6u\"><span class=\"tsq svelte-id2g6u\" aria-hidden=\"true\"></span> <div><h2 class=\"svelte-id2g6u\"> </h2> <p class=\"when svelte-id2g6u\"> </p></div></div> <p class=\"line faint svelte-id2g6u\"><!> </p> <div class=\"acts start svelte-id2g6u\"><!> <button class=\"atlas-btn svelte-id2g6u\"><!>Open the note</button></div>", 1), Ft = e("<button class=\"tool svelte-id2g6u\" title=\"Edit (e)\"><!></button> <button class=\"tool svelte-id2g6u\" title=\"Delete (Del)\"><!></button>", 1), It = e("<p class=\"sub svelte-id2g6u\"><!> </p>"), Lt = e("<p class=\"sub warn svelte-id2g6u\">Cancelled</p>"), Rt = e("<button> </button>"), zt = e("<div class=\"answer svelte-id2g6u\" role=\"group\" aria-label=\"Going?\"><span class=\"svelte-id2g6u\">Going?</span> <!></div>"), Bt = e("<a class=\"atlas-btn join svelte-id2g6u\" target=\"_blank\" rel=\"noreferrer\" data-outside=\"\" title=\"Opens in your browser (Teams, Zoom… take it from there)\"><!>Join the meeting</a>"), Vt = e("<a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a>"), Ht = e("<p class=\"line svelte-id2g6u\"><!><!></p>"), Ut = e("<li> <span class=\"faint svelte-id2g6u\">organiser</span></li>"), Wt = e("<li> <span> </span></li>"), Gt = e("<li class=\"faint svelte-id2g6u\"> </li>"), Kt = e("<div class=\"line people svelte-id2g6u\"><!> <ul class=\"svelte-id2g6u\"><!> <!> <!></ul></div>"), qt = e("<p class=\"line desc svelte-id2g6u\"><!><span class=\"svelte-id2g6u\"> </span></p>"), Jt = e("<span aria-hidden=\"true\"></span>"), Yt = e("<li><button><!> </button></li>"), Xt = e("<div class=\"line linked svelte-id2g6u\"><!> <ul aria-label=\"Linked\" class=\"svelte-id2g6u\"></ul></div>"), Zt = e("<li><button class=\"lk svelte-id2g6u\"> </button></li>"), Qt = e("<div class=\"line linked svelte-id2g6u\"><!> <ul aria-label=\"Linked from\" class=\"svelte-id2g6u\"></ul></div>"), $t = e("<button class=\"atlas-btn svelte-id2g6u\"><!>Open the note</button>"), en = e("<button class=\"atlas-btn svelte-id2g6u\" title=\"A note of its own for this event: its time and place as properties, your writing below\"><!>Make a note</button>"), tn = e("<p class=\"line svelte-id2g6u\"><!><a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-id2g6u\"> </a></p>"), nn = e("<div class=\"bar svelte-id2g6u\"><!> <button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <div class=\"head svelte-id2g6u\"><span class=\"sq svelte-id2g6u\"></span> <div><h2> </h2> <p class=\"when svelte-id2g6u\"> </p> <!> <!></div></div> <!> <!> <!> <!> <!> <p class=\"line faint svelte-id2g6u\"><!> </p> <!> <!> <!> <!>", 1), rn = e("<div class=\"bar svelte-id2g6u\"><button class=\"tool svelte-id2g6u\" title=\"Close (Esc)\"><!></button></div> <input class=\"title svelte-id2g6u\" placeholder=\"Add a title\" aria-label=\"Title\"/> <p class=\"when svelte-id2g6u\"> </p> <div class=\"line faint svelte-id2g6u\"><!><!></div> <div class=\"acts svelte-id2g6u\"><button class=\"atlas-btn svelte-id2g6u\">More options</button> <button class=\"atlas-btn primary svelte-id2g6u\">Save</button></div>", 1), an = e("<div class=\"pop svelte-id2g6u\" role=\"dialog\"><!></div>"), on = {
	hash: "svelte-id2g6u",
	code: ".pop.svelte-id2g6u {position:absolute;z-index:50;width:min(360px, calc(100% - 16px));box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:8px 14px 14px;display:grid;gap:8px; animation: svelte-id2g6u-in 120ms var(--ease);}\n  @keyframes svelte-id2g6u-in { from { opacity: 0; transform: translateY(4px); } }\n  @media (prefers-reduced-motion: reduce) {.pop.svelte-id2g6u { animation: none;} }.bar.svelte-id2g6u {display:flex;justify-content:flex-end;gap:2px;margin:0 -8px -4px 0;}.tool.svelte-id2g6u {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;box-sizing:border-box;}.tool.svelte-id2g6u:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-id2g6u:focus-visible {outline:2px solid var(--accent);}.head.svelte-id2g6u {display:flex;gap:12px;align-items:flex-start;}.sq.svelte-id2g6u {width:14px;height:14px;border-radius:4px;background:var(--c);flex:none;margin-top:5px;}h2.svelte-id2g6u {margin:0;font-size:1.15em;font-weight:600;color:var(--heading);overflow-wrap:anywhere;}.cancel.svelte-id2g6u {text-decoration:line-through;}.when.svelte-id2g6u {margin:2px 0 0;color:var(--text-muted);font-size:0.92em;}.sub.svelte-id2g6u {margin:2px 0 0;color:var(--text-faint);font-size:0.85em;display:flex;align-items:center;gap:4px;}.warn.svelte-id2g6u {color:var(--red);}.line.svelte-id2g6u {margin:0;display:flex;gap:10px;align-items:flex-start;color:var(--text);font-size:0.9em;min-width:0;overflow-wrap:anywhere;}.line.svelte-id2g6u .icon {margin-top:2px;color:var(--text-faint);}.desc.svelte-id2g6u span:where(.svelte-id2g6u) {white-space:pre-wrap;max-height:9em;overflow:auto;}.people.svelte-id2g6u ul:where(.svelte-id2g6u) {list-style:none;margin:0;padding:0;display:grid;gap:2px;}.faint.svelte-id2g6u {color:var(--text-faint);}.ps.svelte-id2g6u {font-size:0.8em;color:var(--text-faint);}.ps-accepted.svelte-id2g6u {color:var(--green);}.ps-declined.svelte-id2g6u {color:var(--red);}.ps-tentative.svelte-id2g6u {color:var(--yellow);}a.svelte-id2g6u {color:var(--accent);}.atlas-btn.svelte-id2g6u {display:inline-flex;align-items:center;gap:6px;justify-self:start;}.title.svelte-id2g6u {all:unset;font-size:1.15em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--accent);padding:4px 0;}.title.svelte-id2g6u::placeholder {color:var(--text-faint);font-weight:400;}.join.svelte-id2g6u {text-decoration:none;}.answer.svelte-id2g6u {display:flex;align-items:center;gap:6px;padding:6px 0;font-size:0.9em;}.answer.svelte-id2g6u span:where(.svelte-id2g6u) {color:var(--text-muted);margin-right:auto;}.answer.svelte-id2g6u .chosen:where(.svelte-id2g6u) {background:var(--accent-soft);border-color:var(--accent);color:var(--accent-strong, var(--accent));}.acts.svelte-id2g6u {display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;}.acts.start.svelte-id2g6u {justify-content:flex-start;}.tsq.svelte-id2g6u {width:13px;height:13px;border:1.5px solid var(--text-muted);border-radius:4px;flex:none;margin-top:5px;box-sizing:border-box;}.tsq.small.svelte-id2g6u {width:10px;height:10px;margin:0;border-radius:3px;}.tsq.checked.svelte-id2g6u {background:var(--text-faint);border-color:var(--text-faint);}.linked.svelte-id2g6u ul:where(.svelte-id2g6u) {list-style:none;margin:0;padding:0;display:grid;gap:2px;min-width:0;}.lk.svelte-id2g6u {all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;color:var(--accent);overflow-wrap:anywhere;border-radius:var(--radius-sm);}.lk.svelte-id2g6u:hover {text-decoration:underline;}.lk.svelte-id2g6u:focus-visible {outline:2px solid var(--accent);}.lk.done.svelte-id2g6u {color:var(--text-muted);text-decoration:line-through;}"
};
function sn(e, n) {
	j(n, !0), S(e, on);
	let r = t(n, "e", 3, null), a = t(n, "draft", 3, null), o = R(void 0), c = R(""), d = R(W(n.cal.newCalendar() ?? "")), f = R(void 0), p = R(W({
		left: 0,
		top: 0
	}));
	function m() {
		let e = A(o)?.offsetWidth ?? 340, t = A(o)?.offsetHeight ?? 200, r = n.at.right - n.box.left + 8;
		r + e > n.box.width - 8 && (r = n.at.left - n.box.left - e - 8), r < 8 && (r = Math.max(8, Math.min(n.box.width - e - 8, n.at.left - n.box.left)));
		let i = n.at.top - n.box.top;
		i + t > n.box.height - 8 && (i = Math.max(8, n.box.height - t - 8)), B(p, {
			left: r,
			top: Math.max(8, i)
		}, !0);
	}
	ie(() => {
		m(), A(f)?.focus();
	});
	async function h() {
		if (!a()) return;
		let e = (e) => String(e).padStart(2, "0"), t = (t) => `${t.getFullYear()}-${e(t.getMonth() + 1)}-${e(t.getDate())}T${e(t.getHours())}:${e(t.getMinutes())}`, r = (e) => t(e).slice(0, 10);
		n.onclose(), await n.cal.create({
			summary: A(c).trim() || "(no title)",
			start: a().all_day ? r(a().start) : t(a().start),
			end: a().all_day ? r(a().end) : t(a().end),
			all_day: a().all_day,
			calendar: A(d) || void 0
		});
	}
	let _ = R(null), v = R(!1);
	ie(() => {
		!r() || r().task || r().uid.startsWith("pending-") || r().calendar === "notes" || H(n.cal.atlas, "event", {
			uid: r().uid,
			rid: r().rid,
			start: r().start
		}).then((e) => {
			B(_, e, !0), setTimeout(m, 0);
		}, () => {});
	});
	let T = k(() => A(_)?.note?.path ?? (r() ? fe(r()) : null)), O = k(() => (A(_)?.backlinks?.links ?? []).filter((e) => e.source !== A(T) && !(A(_)?.note?.links ?? []).some((t) => t.path === e.source))), M = (e) => {
		n.cal.atlas.open(e.path, e.line), n.onclose();
	};
	async function te() {
		if (r() && !A(v)) {
			B(v, !0);
			try {
				let e = await H(n.cal.atlas, "event_note", {
					uid: r().uid,
					rid: r().rid,
					start: r().start
				});
				n.cal.atlas.open(e.note), n.onclose();
			} catch (e) {
				n.cal.toast(`No note made: ${e.message}`, "error");
			} finally {
				B(v, !1);
			}
		}
	}
	let N = k(() => r() ? z(r()) : null), F = [
		["ACCEPTED", "Yes"],
		["TENTATIVE", "Maybe"],
		["DECLINED", "No"]
	], I = R(W(r()?.answer));
	async function ne(e) {
		if (!r() || A(I) === e) return;
		let t = A(I);
		B(I, e, !0), await n.cal.respond(r(), e) || B(I, t, !0);
	}
	let ae = k(() => a() ? a().all_day ? `${a().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · all day` : `${a().start.toLocaleDateString(void 0, {
		weekday: "long",
		day: "numeric",
		month: "long"
	})} · ${x(a().start, n.cal.h12)} – ${x(a().end, n.cal.h12)}` : "");
	var U = an();
	let oe;
	var G = $(U), se = (e) => {
		let t = k(() => r().task);
		var i = Pt(), a = P(i), o = $(a), s = $(o);
		V(s, {
			name: "x",
			size: 15
		}), b(o), b(a);
		var c = q(a, 2), l = q($(c), 2), u = $(l), d = L(u, !0), f = q(u, 2), p = L(f);
		b(l), b(c);
		var m = q(c, 2), h = $(m);
		V(h, {
			name: "note",
			size: 14
		});
		var g = q(h, 1, !0);
		b(m);
		var _ = q(m, 2), v = $(_), x = (e) => {
			var r = Nt(), i = $(r);
			V(i, {
				name: "clock",
				size: 14
			}), ge(), b(r), X("click", r, () => {
				n.cal.startPlacing(A(t)), n.onclose();
			}), D(e, r);
		};
		J(v, (e) => {
			A(t).props.from !== "note" && e(x);
		});
		var S = q(v, 2), C = $(S);
		V(C, {
			name: "note",
			size: 14
		}), ge(), b(S), b(_), Q((e, n) => {
			E(d, r().summary || "(no title)"), E(p, `${A(t).props.from === "note" ? "Due" : "Task"} · ${e ?? ""}`), E(g, n);
		}, [() => y(r(), n.cal.h12).replace(" · all day", ""), () => A(t).path.replace(/\.md$/, "")]), X("click", o, function(...e) {
			n.onclose?.apply(this, e);
		}), X("click", S, () => {
			n.cal.atlas.open(A(t).path, A(t).line ?? void 0), n.onclose();
		}), D(e, i);
	}, ce = (e) => {
		var t = nn(), a = P(t), o = $(a), s = (e) => {
			var t = Ft(), i = P(t), a = $(i);
			V(a, {
				name: "pen",
				size: 15
			}), b(i);
			var o = q(i, 2), s = $(o);
			V(s, {
				name: "trash",
				size: 15
			}), b(o), X("click", i, function(...e) {
				n.onedit?.apply(this, e);
			}), X("click", o, () => {
				n.onclose(), n.cal.remove(r());
			}), D(e, t);
		};
		J(o, (e) => {
			r().writable && e(s);
		});
		var c = q(o, 2), d = $(c);
		V(d, {
			name: "x",
			size: 15
		}), b(c), b(a);
		var f = q(a, 2), p = $(f);
		let m;
		var h = q(p, 2), g = $(h);
		let x;
		var S = L(g, !0), j = q(g, 2), R = L(j, !0), z = q(j, 2), B = (e) => {
			var t = It(), n = $(t);
			V(n, {
				name: "repeat",
				size: 12
			});
			var i = q(n);
			b(t), Q((e) => E(i, ` ${e ?? ""}`), [() => ee(r().rrule) || "Repeats"]), D(e, t);
		};
		J(z, (e) => {
			r().recurring && e(B);
		});
		var re = q(z, 2), ie = (e) => {
			var t = Lt();
			D(e, t);
		};
		J(re, (e) => {
			r().status === "CANCELLED" && e(ie);
		}), b(h), b(f);
		var H = q(f, 2), ae = (e) => {
			var t = zt(), n = q($(t), 2);
			w(n, 17, () => F, ([e, t]) => e, (e, t) => {
				var n = k(() => i(A(t), 2));
				let r = () => A(n)[0], a = () => A(n)[1];
				var o = Rt();
				let s;
				var c = L(o, !0);
				Q(() => {
					s = l(o, 1, "atlas-btn svelte-id2g6u", null, s, { chosen: A(I) === r() }), u(o, "aria-pressed", A(I) === r()), E(c, a());
				}), X("click", o, () => void ne(r())), D(e, o);
			}), b(t), D(e, t);
		};
		J(H, (e) => {
			A(I) && e(ae);
		});
		var U = q(H, 2), W = (e) => {
			var t = Bt(), n = $(t);
			V(n, {
				name: "video",
				size: 14
			}), ge(), b(t), Q(() => u(t, "href", A(N))), D(e, t);
		};
		J(U, (e) => {
			A(N) && e(W);
		});
		var oe = q(U, 2), G = (e) => {
			var t = Ht(), n = $(t);
			V(n, {
				name: "pin",
				size: 14
			});
			var i = q(n), a = (e) => {
				var t = Vt(), n = L(t, !0);
				Q(() => {
					u(t, "href", r().location), E(n, r().location);
				}), D(e, t);
			}, o = k(() => /^https?:\/\//.test(r().location)), s = (e) => {
				var t = ue();
				Q(() => E(t, r().location)), D(e, t);
			};
			J(i, (e) => {
				A(o) ? e(a) : e(s, -1);
			}), b(t), D(e, t);
		};
		J(oe, (e) => {
			r().location && e(G);
		});
		var se = q(oe, 2), ce = (e) => {
			var t = Kt(), n = $(t);
			V(n, {
				name: "people",
				size: 14
			});
			var i = q(n, 2), a = $(i), o = (e) => {
				var t = Ut(), n = $(t);
				ge(), b(t), Q(() => E(n, `${r().organizer.name ?? r().organizer.email ?? ""} `)), D(e, t);
			};
			J(a, (e) => {
				r().organizer && e(o);
			});
			var s = q(a, 2);
			w(s, 17, () => (r().attendees ?? []).slice(0, 8), (e) => e.email, (e, t) => {
				var n = Wt(), r = $(n), i = q(r), a = L(i, !0);
				b(n), Q((e, n) => {
					E(r, `${A(t).name ?? A(t).email ?? ""} `), l(i, 1, `ps ps-${e ?? ""}`, "svelte-id2g6u"), E(a, n);
				}, [() => (A(t).partstat ?? "needs-action").toLowerCase(), () => (A(t).partstat ?? "NEEDS-ACTION").toLowerCase().replace("needs-action", "no answer")]), D(e, n);
			});
			var c = q(s, 2), u = (e) => {
				var t = Gt(), n = L(t);
				Q(() => E(n, `and ${(r().attendees?.length ?? 0) - 8} more`)), D(e, t);
			};
			J(c, (e) => {
				(r().attendees?.length ?? 0) > 8 && e(u);
			}), b(i), b(t), D(e, t);
		};
		J(se, (e) => {
			(r().organizer || r().attendees?.length) && e(ce);
		});
		var K = q(se, 2), Y = (e) => {
			var t = qt(), n = $(t);
			V(n, {
				name: "text",
				size: 14
			});
			var i = q(n), a = L(i, !0);
			b(t), Q(() => E(a, r().description)), D(e, t);
		};
		J(K, (e) => {
			r().description && e(Y);
		});
		var Z = q(K, 2), le = $(Z);
		V(le, {
			name: "calendar",
			size: 14
		});
		var de = q(le);
		b(Z);
		var fe = q(Z, 2), pe = (e) => {
			var t = Xt(), n = $(t);
			V(n, {
				name: "link",
				size: 14
			});
			var r = q(n, 2);
			w(r, 21, () => A(_).note.links, (e) => e.link, (e, t) => {
				var n = Yt(), r = $(n);
				let i;
				var a = $(r), o = (e) => {
					var n = Jt();
					let r;
					Q(() => r = l(n, 1, "tsq small svelte-id2g6u", null, r, { checked: A(t).task === "x" })), D(e, n);
				};
				J(a, (e) => {
					A(t).task !== void 0 && e(o);
				});
				var s = q(a, 1, !0);
				b(r), b(n), Q(() => {
					i = l(r, 1, "lk svelte-id2g6u", null, i, { done: A(t).task === "x" }), u(r, "title", A(t).path), E(s, A(t).title);
				}), X("click", r, () => M(A(t))), D(e, n);
			}), b(r), b(t), D(e, t);
		};
		J(fe, (e) => {
			A(_)?.note?.links.length && e(pe);
		});
		var me = q(fe, 2), he = (e) => {
			var t = Qt(), r = $(t);
			V(r, {
				name: "backlink",
				size: 14
			});
			var i = q(r, 2);
			w(i, 21, () => A(O).slice(0, 6), (e) => e.source + e.line, (e, t) => {
				var r = Zt(), i = $(r), a = L(i, !0);
				b(r), Q((e) => {
					u(i, "title", A(t).context), E(a, e);
				}, [() => A(t).source.split("/").pop()?.replace(/\.md$/, "")]), X("click", i, () => {
					n.cal.atlas.open(A(t).source, A(t).line), n.onclose();
				}), D(e, r);
			}), b(i), b(t), D(e, t);
		};
		J(me, (e) => {
			A(O).length && e(he);
		});
		var _e = q(me, 2), ve = (e) => {
			var t = $t(), r = $(t);
			V(r, {
				name: "note",
				size: 14
			}), ge(), b(t), X("click", t, () => {
				n.cal.atlas.open(A(T)), n.onclose();
			}), D(e, t);
		}, ye = (e) => {
			var t = en(), n = $(t);
			V(n, {
				name: "note",
				size: 14
			}), ge(), b(t), Q(() => t.disabled = A(v)), X("click", t, te), D(e, t);
		}, be = k(() => r().calendar !== "notes" && !r().uid.startsWith("pending-"));
		J(_e, (e) => {
			A(T) ? e(ve) : A(be) && e(ye, 1);
		});
		var xe = q(_e, 2), Se = (e) => {
			var t = tn(), n = $(t);
			V(n, {
				name: "link",
				size: 14
			});
			var i = q(n), a = L(i, !0);
			b(t), Q(() => {
				u(i, "href", r().url), E(a, r().url);
			}), D(e, t);
		};
		J(xe, (e) => {
			r().url && e(Se);
		}), Q((e, t) => {
			m = C(p, "", m, { "--c": e }), x = l(g, 1, "svelte-id2g6u", null, x, { cancel: r().status === "CANCELLED" }), E(S, r().summary || "(no title)"), E(R, t), E(de, `${r().calendar_name ?? ""}${r().writable ? "" : " · read-only"}`);
		}, [() => r().color ?? n.cal.colorOf(r().calendar), () => y(r(), n.cal.h12)]), X("click", c, function(...e) {
			n.onclose?.apply(this, e);
		}), D(e, t);
	}, K = (e) => {
		var t = rn(), r = P(t), i = $(r), a = $(i);
		V(a, {
			name: "x",
			size: 15
		}), b(i), b(r);
		var o = q(r, 2);
		s(o), re(o, (e) => B(f, e), () => A(f));
		var l = q(o, 2), u = L(l, !0), p = q(l, 2), m = $(p);
		V(m, {
			name: "calendar",
			size: 14
		});
		var _ = q(m), v = (e) => {
			Mt(e, {
				get cal() {
					return n.cal;
				},
				get value() {
					return A(d);
				},
				set value(e) {
					B(d, e, !0);
				}
			});
		}, y = (e) => {
			var t = ue("No calendar to write to");
			D(e, t);
		};
		J(_, (e) => {
			A(d) ? e(v) : e(y, -1);
		}), b(p);
		var x = q(p, 2), S = $(x), C = q(S, 2);
		b(x), Q(() => {
			E(u, A(ae)), C.disabled = !A(d);
		}), X("click", i, function(...e) {
			n.onclose?.apply(this, e);
		}), X("keydown", o, (e) => {
			e.key === "Enter" ? (e.preventDefault(), h()) : e.key === "Escape" && (e.stopPropagation(), n.onclose());
		}), g(o, () => A(c), (e) => B(c, e)), X("click", S, () => n.onmore(A(c), A(d))), X("click", C, h), D(e, t);
	};
	J(G, (e) => {
		r()?.task ? e(se) : r() ? e(ce, 1) : a() && e(K, 2);
	}), b(U), re(U, (e) => B(o, e), () => A(o)), Q(() => {
		u(U, "aria-label", r() ? r().summary : "New event"), oe = C(U, "", oe, {
			left: `${A(p).left ?? ""}px`,
			top: `${A(p).top ?? ""}px`
		});
	}), D(e, U), ve();
}
G(["click", "keydown"]);
//#endregion
//#region plugins/stable/dav/ui/src/Editor.svelte
var cn = e("<div class=\"scrim svelte-aeatm8\" role=\"presentation\"></div>"), ln = e("<header class=\"svelte-aeatm8\"><h2 class=\"svelte-aeatm8\"> </h2> <button class=\"tool svelte-aeatm8\" aria-label=\"Close\"><!></button></header>"), un = e("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Starts at\"/>"), dn = e("<input class=\"hm svelte-aeatm8\" inputmode=\"numeric\" placeholder=\"HH:MM\" aria-label=\"Ends at\"/>"), fn = e("<option> </option>"), pn = e("<div class=\"row svelte-aeatm8\"><!><span class=\"guests svelte-aeatm8\"> <span class=\"faint svelte-aeatm8\"> </span></span></div>"), mn = e("<div class=\"row svelte-aeatm8\"><!><input placeholder=\"Add guests (addresses, comma-separated): it becomes a meeting\" aria-label=\"Guests\" class=\"svelte-aeatm8\"/></div>"), hn = e("<div class=\"atlas-notice error\"> </div>"), gn = e("<!> <div tabindex=\"-1\"><!> <input class=\"title svelte-aeatm8\" placeholder=\"Add a title\" aria-label=\"Title\"/> <div class=\"row when svelte-aeatm8\"><!> <div class=\"times svelte-aeatm8\"><input type=\"date\" aria-label=\"Starts on\" class=\"svelte-aeatm8\"/> <!> <span class=\"to svelte-aeatm8\">to</span> <!> <input type=\"date\" aria-label=\"Ends on\" class=\"svelte-aeatm8\"/> <label class=\"check svelte-aeatm8\"><input type=\"checkbox\" class=\"svelte-aeatm8\"/> All day</label></div></div> <div class=\"row svelte-aeatm8\"><!> <select aria-label=\"Repeat\" class=\"svelte-aeatm8\"></select></div> <div class=\"row svelte-aeatm8\"><!><input placeholder=\"Add a place\" aria-label=\"Place\" class=\"svelte-aeatm8\"/></div> <div class=\"row svelte-aeatm8\"><!> <!></div> <!> <div class=\"row top svelte-aeatm8\"><!><textarea rows=\"5\" placeholder=\"Add a description\" aria-label=\"Description\" class=\"svelte-aeatm8\"></textarea></div> <p class=\"zone svelte-aeatm8\"> </p> <!> <footer class=\"svelte-aeatm8\"><span class=\"hint svelte-aeatm8\">Ctrl+Enter saves</span> <button class=\"atlas-btn\">Cancel</button> <button class=\"atlas-btn primary\">Save</button></footer></div>", 1), _n = {
	hash: "svelte-aeatm8",
	code: ".scrim.svelte-aeatm8 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 55%, transparent);z-index:70;}.ed.svelte-aeatm8 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(620px, calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 10px 30px rgba(0,0,0,.3));padding:12px 18px 16px;display:grid;gap:12px;}.ed.bare.svelte-aeatm8 {position:static;transform:none;width:auto;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;background:var(--bg);padding:16px;align-content:start;}header.svelte-aeatm8 {display:flex;align-items:center;}h2.svelte-aeatm8 {flex:1;margin:0;font-size:0.85em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.tool.svelte-aeatm8 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;}.tool.svelte-aeatm8:hover {background:var(--bg-hover);}.title.svelte-aeatm8 {all:unset;font-size:1.35em;font-weight:600;color:var(--heading);border-bottom:2px solid var(--border-strong);padding:4px 0;}.title.svelte-aeatm8:focus {border-bottom-color:var(--accent);}.title.svelte-aeatm8:focus-visible {outline:none;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8) {appearance:none;-webkit-appearance:none;padding-right:28px;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 15px) 50%, calc(100% - 10px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.ed.svelte-aeatm8 select:where(.svelte-aeatm8):disabled {opacity:0.6;}.row.svelte-aeatm8 {display:flex;gap:12px;align-items:center;color:var(--text-faint);min-width:0;}.row.top.svelte-aeatm8 {align-items:flex-start;}.times.svelte-aeatm8 {display:flex;flex-wrap:wrap;gap:6px;align-items:center;}.to.svelte-aeatm8 {color:var(--text-muted);}input.svelte-aeatm8:not(.title):not([type=checkbox]), select.svelte-aeatm8, textarea.svelte-aeatm8 {font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:5px 8px;min-width:0;color-scheme:light dark;}.row.svelte-aeatm8 > input:where(.svelte-aeatm8), .row.svelte-aeatm8 > select:where(.svelte-aeatm8), textarea.svelte-aeatm8 {flex:1;}textarea.svelte-aeatm8 {resize:vertical;}input.svelte-aeatm8:focus-visible, select.svelte-aeatm8:focus-visible, textarea.svelte-aeatm8:focus-visible {outline:2px solid var(--accent);outline-offset:-1px;}.hm.svelte-aeatm8 {width:5.5em;font-variant-numeric:tabular-nums;text-align:center;}.check.svelte-aeatm8 {display:flex;gap:6px;align-items:center;color:var(--text);margin-left:6px;}.guests.svelte-aeatm8 {color:var(--text);}.faint.svelte-aeatm8 {color:var(--text-faint);}.zone.svelte-aeatm8 {margin:0;color:var(--text-faint);font-size:0.82em;}footer.svelte-aeatm8 {display:flex;gap:8px;align-items:center;justify-content:flex-end;}.hint.svelte-aeatm8 {flex:1;color:var(--text-faint);font-size:0.82em;}"
};
function vn(e, n) {
	j(n, !0), S(e, _n);
	let r = t(n, "e", 3, null), i = t(n, "title", 3, ""), a = t(n, "guests", 19, () => []), o = t(n, "description", 3, ""), c = t(n, "calendar", 3, ""), d = t(n, "frame", 3, "sheet"), f = W({
		summary: r()?.summary ?? i(),
		all_day: n.allDay,
		sday: n.start.slice(0, 10),
		stime: n.start.slice(11, 16) || "09:00",
		eday: n.end.slice(0, 10),
		etime: n.end.slice(11, 16) || "10:00",
		location: r()?.location ?? "",
		description: r()?.description ?? o(),
		rrule: r()?.rrule ?? "",
		calendar: r()?.calendar ?? (c() || n.cal.newCalendar()) ?? ""
	}), p = (r()?.attendees ?? []).map((e) => e.email).join(", "), h = R(W(r() ? p : a().join(", "))), _ = k(() => new Set(n.cal.accounts.map((e) => (e.user ?? "").toLowerCase()).filter((e) => e.includes("@")))), y = k(() => !!r()?.organizer?.email && !A(_).has(r().organizer.email.toLowerCase())), x = () => A(h).split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes("@")), C = R(void 0), T = R("");
	ie(() => A(C)?.focus());
	let O = k(() => {
		let e = _e(/* @__PURE__ */ new Date(`${f.sday}T12:00`));
		return f.rrule && !e.some((e) => e.value === f.rrule) && e.push({
			value: f.rrule,
			label: ee(f.rrule) || f.rrule
		}), e;
	}), M = k(() => n.cal.writable());
	function te() {
		return {
			start: f.all_day ? f.sday : `${f.sday}T${f.stime}`,
			end: f.all_day ? (() => {
				let e = Z(/* @__PURE__ */ new Date(`${f.eday}T12:00`), 1);
				return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
			})() : `${f.eday}T${f.etime}`
		};
	}
	async function N() {
		let { start: e, end: t } = te();
		if (t <= e && !(f.all_day && t > e)) {
			B(T, "The end is before the start.");
			return;
		}
		let i = A(h).split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
		if (i.length) {
			B(T, `Not an address: ${i.join(", ")}`);
			return;
		}
		let a = !A(y) && A(h) !== p ? x() : void 0, o = {
			summary: f.summary,
			start: e,
			end: t,
			all_day: f.all_day,
			location: f.location,
			description: f.description,
			rrule: f.rrule,
			attendees: a
		};
		if (!r()) {
			n.onclose(), await n.cal.create({
				...o,
				calendar: f.calendar || void 0
			});
			return;
		}
		let s = await n.cal.askScope(r(), "Change");
		s && (n.onclose(), await n.cal.change(r(), {
			...o,
			move_to: f.calendar && f.calendar !== r().calendar ? f.calendar : void 0,
			from_start: r().start
		}, s, "Saved"));
	}
	function F(e) {
		e.key === "Escape" ? (e.stopPropagation(), n.onclose()) : e.key === "Enter" && (e.ctrlKey || e.metaKey) && (e.preventDefault(), N());
	}
	function I(e, t) {
		let n = e.trim().toLowerCase().match(/^(\d{1,2})(?:[:h.]?(\d{2}))?\s*(am|pm|h)?$/);
		if (!n) return t;
		let r = Number(n[1]), i = Number(n[2] ?? 0);
		return n[3] === "pm" && r < 12 && (r += 12), n[3] === "am" && r === 12 && (r = 0), r > 23 || i > 59 ? t : `${String(r).padStart(2, "0")}:${String(i).padStart(2, "0")}`;
	}
	function z() {
		if (`${f.eday}T${f.etime}` <= `${f.sday}T${f.stime}` && (f.eday = f.sday, !f.all_day)) {
			let [e, t] = f.stime.split(":").map(Number);
			f.etime = `${String(Math.min(23, e + 1)).padStart(2, "0")}:${String(t).padStart(2, "0")}`;
		}
	}
	var ne = gn(), H = P(ne), ae = (e) => {
		var t = cn();
		X("click", t, function(...e) {
			n.onclose?.apply(this, e);
		}), D(e, t);
	};
	J(H, (e) => {
		d() === "sheet" && e(ae);
	});
	var U = q(H, 2);
	let oe;
	var G = $(U), se = (e) => {
		var t = ln(), i = $(t), a = L(i, !0), o = q(i, 2), s = $(o);
		V(s, { name: "x" }), b(o), b(t), Q(() => E(a, r() ? "Edit event" : "New event")), X("click", o, function(...e) {
			n.onclose?.apply(this, e);
		}), D(e, t);
	};
	J(G, (e) => {
		d() === "sheet" && e(se);
	});
	var ce = q(G, 2);
	s(ce), re(ce, (e) => B(C, e), () => A(C));
	var K = q(ce, 2), Y = $(K);
	V(Y, { name: "clock" });
	var le = q(Y, 2), ue = $(le);
	s(ue);
	var de = q(ue, 2), fe = (e) => {
		var t = un();
		s(t), X("change", t, () => {
			f.stime = I(f.stime, "09:00"), z();
		}), g(t, () => f.stime, (e) => f.stime = e), D(e, t);
	};
	J(de, (e) => {
		f.all_day || e(fe);
	});
	var me = q(de, 4), he = (e) => {
		var t = dn();
		s(t), X("change", t, () => f.etime = I(f.etime, "10:00")), g(t, () => f.etime, (e) => f.etime = e), D(e, t);
	};
	J(me, (e) => {
		f.all_day || e(he);
	});
	var be = q(me, 2);
	s(be);
	var xe = q(be, 2), Se = $(xe);
	s(Se), ge(), b(xe), b(le), b(K);
	var Ce = q(K, 2), we = $(Ce);
	V(we, { name: "repeat" });
	var Te = q(we, 2);
	w(Te, 21, () => A(O), (e) => e.value, (e, t) => {
		var n = fn(), r = L(n, !0), i = {};
		Q(() => {
			E(r, A(t).label), i !== (i = A(t).value) && (n.value = (n.__value = i) ?? "");
		}), D(e, n);
	}), b(Te), ye(Te), b(Ce);
	var Ee = q(Ce, 2), De = $(Ee);
	V(De, { name: "pin" });
	var Oe = q(De);
	s(Oe), b(Ee);
	var ke = q(Ee, 2), Ae = $(ke);
	V(Ae, { name: "calendar" });
	var je = q(Ae, 2);
	{
		let e = k(() => !!r() && r().recurring);
		Mt(je, {
			get cal() {
				return n.cal;
			},
			get disabled() {
				return A(e);
			},
			get value() {
				return f.calendar;
			},
			set value(e) {
				f.calendar = e;
			}
		});
	}
	b(ke);
	var Me = q(ke, 2), Ne = (e) => {
		var t = pn(), n = $(t);
		V(n, { name: "people" });
		var i = q(n), a = $(i), o = q(a), s = L(o);
		b(i), b(t), Q((e) => {
			E(a, `${e ?? ""} `), E(s, `· organised by ${r()?.organizer?.name ?? r()?.organizer?.email ?? ""}`);
		}, [() => (r()?.attendees ?? []).map((e) => e.name ?? e.email).join(", ")]), D(e, t);
	}, Pe = (e) => {
		var t = mn(), n = $(t);
		V(n, { name: "people" });
		var r = q(n);
		s(r), b(t), g(r, () => A(h), (e) => B(h, e)), D(e, t);
	};
	J(Me, (e) => {
		A(y) ? e(Ne) : e(Pe, -1);
	});
	var Fe = q(Me, 2), Ie = $(Fe);
	V(Ie, { name: "text" });
	var Le = q(Ie);
	pe(Le), b(Fe);
	var Re = q(Fe, 2), ze = L(Re), Be = q(Re, 2), Ve = (e) => {
		var t = hn(), n = L(t, !0);
		Q(() => E(n, A(T))), D(e, t);
	};
	J(Be, (e) => {
		A(T) && e(Ve);
	});
	var He = q(Be, 2), Ue = q($(He), 2), We = q(Ue, 2);
	b(He), b(U), Q((e) => {
		oe = l(U, 1, "ed svelte-aeatm8", null, oe, { bare: d() === "dialog" }), u(U, "role", d() === "sheet" ? "dialog" : "form"), u(U, "aria-label", r() ? "Edit event" : "New event"), u(U, "aria-modal", d() === "sheet" ? "true" : void 0), E(ze, `Times in your zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""}${e ?? ""}`), We.disabled = !A(M).length;
	}, [() => r()?.tzid && r().tzid !== Intl.DateTimeFormat().resolvedOptions().timeZone ? ` · written in ${r().tzid}` : ""]), X("keydown", U, F), g(ce, () => f.summary, (e) => f.summary = e), X("change", ue, z), g(ue, () => f.sday, (e) => f.sday = e), g(be, () => f.eday, (e) => f.eday = e), m(Se, () => f.all_day, (e) => f.all_day = e), v(Te, () => f.rrule, (e) => f.rrule = e), g(Oe, () => f.location, (e) => f.location = e), g(Le, () => f.description, (e) => f.description = e), X("click", Ue, function(...e) {
		n.onclose?.apply(this, e);
	}), X("click", We, N), D(e, ne), ve();
}
G([
	"click",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/Toasts.svelte
var yn = e("<button class=\"svelte-osdry5\"> </button>"), bn = e("<button class=\"svelte-osdry5\">Undo</button>"), xn = e("<div><span class=\"text svelte-osdry5\"> </span> <!> <!> <button class=\"x svelte-osdry5\" aria-label=\"Close\">×</button></div>"), Sn = e("<div class=\"toasts svelte-osdry5\" aria-live=\"polite\"></div>"), Cn = {
	hash: "svelte-osdry5",
	code: ".toasts.svelte-osdry5 {position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:60;display:grid;gap:8px;justify-items:center;pointer-events:none;width:min(560px, calc(100% - 32px));}.toast.svelte-osdry5 {pointer-events:auto;display:flex;align-items:center;gap:12px;padding:9px 10px 9px 14px;border-radius:var(--radius);background:var(--heading);color:var(--bg);box-shadow:var(--shadow-md, var(--shadow-sm));max-width:100%; animation: svelte-osdry5-in 120ms var(--ease);}.toast.error.svelte-osdry5 {background:var(--red);color:#fff;}.text.svelte-osdry5 {min-width:0;overflow-wrap:anywhere;}button.svelte-osdry5 {all:unset;cursor:pointer;font-weight:700;color:var(--accent);padding:2px 6px;border-radius:var(--radius-sm);}.error.svelte-osdry5 button:where(.svelte-osdry5) {color:#fff;text-decoration:underline;}button.svelte-osdry5:hover {background:color-mix(in srgb, currentColor 14%, transparent);}button.svelte-osdry5:focus-visible {outline:2px solid currentColor;}.x.svelte-osdry5 {color:inherit;opacity:0.7;font-weight:400;}\n  @keyframes svelte-osdry5-in { from { opacity: 0; transform: translateY(6px); } }\n  @media (prefers-reduced-motion: reduce) {.toast.svelte-osdry5 { animation: none;} }"
};
function wn(e, t) {
	j(t, !0), S(e, Cn);
	var n = Sn();
	w(n, 21, () => t.cal.toasts, (e) => e.id, (e, n) => {
		var r = xn();
		let i;
		var a = $(r), o = L(a, !0), s = q(a, 2), c = (e) => {
			var r = yn(), i = L(r, !0);
			Q(() => E(i, A(n).action.label)), X("click", r, async () => {
				t.cal.dismiss(A(n).id), await A(n).action?.run();
			}), D(e, r);
		};
		J(s, (e) => {
			A(n).action && e(c);
		});
		var d = q(s, 2), f = (e) => {
			var r = bn();
			X("click", r, async () => {
				t.cal.dismiss(A(n).id), await A(n).undo?.();
			}), D(e, r);
		};
		J(d, (e) => {
			A(n).undo && e(f);
		});
		var p = q(d, 2);
		b(r), Q(() => {
			i = l(r, 1, "toast svelte-osdry5", null, i, { error: A(n).kind === "error" }), u(r, "role", A(n).kind === "error" ? "alert" : "status"), E(o, A(n).text);
		}), X("click", p, () => t.cal.dismiss(A(n).id)), D(e, r);
	}), b(n), D(e, n), ve();
}
G(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/keys.ts
var Tn = (e) => (t) => t.setView(e), En = [
	{
		id: "day",
		title: "Day",
		group: "Views",
		keys: "d, 1",
		run: Tn("day")
	},
	{
		id: "week",
		title: "Week",
		group: "Views",
		keys: "w, 2",
		run: Tn("week")
	},
	{
		id: "workweek",
		title: "Work week",
		group: "Views",
		keys: "x, 3",
		run: Tn("workweek")
	},
	{
		id: "month",
		title: "Month",
		group: "Views",
		keys: "m, 4",
		run: Tn("month")
	},
	{
		id: "agenda",
		title: "Agenda (schedule)",
		group: "Views",
		keys: "a, 5",
		run: Tn("agenda")
	},
	{
		id: "year",
		title: "Year",
		group: "Views",
		keys: "y, 6",
		run: Tn("year")
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
function Dn(e) {
	let t = e.key.toLowerCase(), n = e.key.length === 1 && !/[a-z0-9]/i.test(e.key);
	return [...[
		e.ctrlKey || e.metaKey ? "ctrl" : "",
		e.altKey ? "alt" : "",
		e.shiftKey && !n ? "shift" : ""
	].filter(Boolean), t].join("+");
}
var On = new Map(En.flatMap((e) => (e.keys ?? "").split(",").map((e) => e.trim()).filter(Boolean).map((t) => [t, e])));
function kn(e) {
	return e ? e.split(",").map((e) => e.trim()).filter(Boolean).slice(0, 2).map((e) => e.replace("ctrl+", "Ctrl+").replace("shift+", "⇧").replace("arrowright", "→").replace("arrowleft", "←").replace("escape", "Esc").replace("enter", "Enter").replace("delete", "Del").replace("backspace", "⌫").replace(/^(⇧)?([a-z])$/, (e, t, n) => t ? `⇧${n.toUpperCase()}` : n)) : [];
}
//#endregion
//#region plugins/stable/dav/ui/src/Shortcuts.svelte
var An = e("<kbd class=\"svelte-17nm084\"> </kbd>"), jn = e("<div class=\"row svelte-17nm084\"><span> </span><span class=\"keys svelte-17nm084\"></span></div>"), Mn = e("<section><h3 class=\"svelte-17nm084\"> </h3> <!></section>"), Nn = e("<div class=\"scrim svelte-17nm084\" role=\"presentation\"></div> <div class=\"sheet svelte-17nm084\" role=\"dialog\" aria-label=\"Keyboard shortcuts\" aria-modal=\"true\"><header class=\"svelte-17nm084\"><h2 class=\"svelte-17nm084\">Keyboard shortcuts</h2><button class=\"x svelte-17nm084\" aria-label=\"Close\">×</button></header> <div class=\"cols svelte-17nm084\"></div> <p class=\"hint svelte-17nm084\">Drag on the grid to make an event, drag one to move it, its lower edge to resize (15-minute steps). Esc cancels a drag.</p></div>", 1), Pn = {
	hash: "svelte-17nm084",
	code: ".scrim.svelte-17nm084 {position:absolute;inset:0;background:color-mix(in srgb, var(--bg) 50%, transparent);z-index:70;}.sheet.svelte-17nm084 {position:absolute;z-index:71;left:50%;top:50%;transform:translate(-50%, -50%);width:min(760px, calc(100% - 32px));max-height:calc(100% - 40px);overflow:auto;background:var(--bg-elev);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow-md, 0 8px 30px rgba(0,0,0,.3));padding:14px 18px;}header.svelte-17nm084 {display:flex;align-items:center;}h2.svelte-17nm084 {margin:0;flex:1;font-size:1.1em;color:var(--heading);}h3.svelte-17nm084 {margin:10px 0 4px;font-size:0.75em;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-faint);}.cols.svelte-17nm084 {display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:4px 24px;}.row.svelte-17nm084 {display:flex;justify-content:space-between;gap:8px;padding:3px 0;color:var(--text-muted);}.keys.svelte-17nm084 {display:flex;gap:4px;}kbd.svelte-17nm084 {font:600 0.85em var(--font-mono);padding:1px 6px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:var(--bg);color:var(--text);}.hint.svelte-17nm084 {color:var(--text-faint);font-size:0.86em;margin:12px 0 0;}.x.svelte-17nm084 {all:unset;cursor:pointer;font-size:1.3em;padding:0 6px;color:var(--text-muted);}"
};
function Fn(e, t) {
	j(t, !0), S(e, Pn);
	let n = [...new Set(En.map((e) => e.group))];
	var r = Nn(), i = P(r), a = q(i, 2), o = $(a), s = q($(o));
	b(o);
	var c = q(o, 2);
	w(c, 20, () => n, (e) => e, (e, t) => {
		var n = Mn(), r = $(n), i = L(r, !0), a = q(r, 2);
		w(a, 17, () => En.filter((e) => e.group === t && e.keys), (e) => e.id, (e, t) => {
			var n = jn(), r = $(n), i = L(r, !0), a = q(r);
			w(a, 20, () => kn(A(t).keys), (e) => e, (e, t) => {
				var n = An(), r = L(n, !0);
				Q(() => E(r, t)), D(e, n);
			}), b(a), b(n), Q(() => E(i, A(t).title)), D(e, n);
		}), b(n), Q(() => E(i, t)), D(e, n);
	}), b(c), ge(2), b(a), X("click", i, function(...e) {
		t.onclose?.apply(this, e);
	}), X("click", s, function(...e) {
		t.onclose?.apply(this, e);
	}), D(e, r), ve();
}
G(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/App.svelte
var In = e("<button class=\"tool svelte-1i74804\" title=\"Side panel (s)\" aria-label=\"Side panel\"><!></button>"), Ln = e("<span class=\"spin svelte-1i74804\" aria-label=\"Working\"></span>"), Rn = e("<option> </option>"), zn = e("<select class=\"vsel svelte-1i74804\" aria-label=\"View\"></select>"), Bn = e("<button> </button>"), Vn = e("<div class=\"seg svelte-1i74804\" role=\"group\" aria-label=\"View\"></div>"), Hn = e("<button class=\"tool svelte-1i74804\" title=\"Sync now (r)\" aria-label=\"Sync\"><!></button> <button class=\"tool svelte-1i74804\" title=\"All commands (Ctrl+K)\" aria-label=\"All commands\"><!></button>", 1), Un = e("<span class=\"qprev svelte-1i74804\"><b class=\"svelte-1i74804\"> </b> </span>"), Wn = e("<div class=\"quick svelte-1i74804\"><!> <input placeholder=\"lunch with Ana tomorrow 13:00 · examen 15 nov · réunion lundi à 10h @ D3\" aria-label=\"Quick add\" class=\"svelte-1i74804\"/> <!> <!> <button class=\"atlas-btn primary\">Add</button></div>"), Gn = e("<div class=\"placing svelte-1i74804\" role=\"status\"><span class=\"tbox svelte-1i74804\" aria-hidden=\"true\"></span> <span class=\"ptext svelte-1i74804\">Time-block <b> </b>: drag over the hours it takes, or click where it starts</span> <button class=\"atlas-btn\">Cancel</button></div>"), Kn = e("<aside class=\"side svelte-1i74804\" aria-label=\"Calendars\"><!></aside>"), qn = e("<div class=\"atlas-notice error\"> <div class=\"actions\"><button class=\"atlas-btn\">Try again</button><button class=\"atlas-btn\">Settings…</button></div></div>"), Jn = e("<div class=\"atlas-notice\">No calendar account yet: add one in Settings (its server address, user name and app password; as many as you have) — or subscribe to a public calendar there.<div class=\"actions\"><button class=\"atlas-btn primary\">Settings…</button></div></div>"), Yn = e("<button class=\"fab svelte-1i74804\" aria-label=\"New event\" title=\"New event (c)\"><!></button>"), Xn = e("<div class=\"popscrim svelte-1i74804\" role=\"presentation\"></div> <!>", 1), Zn = e("<div tabindex=\"-1\" role=\"application\" aria-label=\"Calendar\"><header class=\"top svelte-1i74804\"><!> <button class=\"atlas-btn today svelte-1i74804\" title=\"Today (t)\">Today</button> <div class=\"nav svelte-1i74804\"><button class=\"tool svelte-1i74804\" title=\"Previous (k)\" aria-label=\"Previous\"><!></button> <button class=\"tool svelte-1i74804\" title=\"Next (j)\" aria-label=\"Next\"><!></button></div> <h1 class=\"svelte-1i74804\"> </h1> <!> <span class=\"grow svelte-1i74804\"></span> <div><!> <input aria-label=\"Search events\" class=\"svelte-1i74804\"/></div> <!> <button class=\"tool svelte-1i74804\" title=\"Quick add in words (q)\" aria-label=\"Quick add\"><!></button> <!></header> <!> <!> <div class=\"body svelte-1i74804\"><!> <main class=\"view svelte-1i74804\"><!> <!></main></div> <!> <!> <!> <!> <!></div>"), Qn = {
	hash: "svelte-1i74804",
	code: ".calendar.svelte-1i74804:focus {outline:none;}.calendar.svelte-1i74804 {position:relative;height:100%;display:grid;grid-template-rows:auto auto 1fr;color:var(--text);background:var(--bg);font-size:calc(14px * var(--ui-scale, 1));container-type:inline-size;overflow:hidden;}.top.svelte-1i74804 {grid-row:1;display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border);min-width:0;}h1.svelte-1i74804 {margin:0 0 0 4px;font-size:1.2em;font-weight:600;color:var(--heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:6em;flex:0 1 auto;}.nav.svelte-1i74804 {display:flex;}.grow.svelte-1i74804 {flex:1;}.today.svelte-1i74804 {flex:none;}.tool.svelte-1i74804 {all:unset;cursor:pointer;padding:6px;border-radius:var(--radius-sm);color:var(--text-muted);display:grid;place-items:center;min-width:24px;min-height:24px;flex:none;}.tool.svelte-1i74804:hover {background:var(--bg-hover);color:var(--text);}.tool.svelte-1i74804:focus-visible, .seg.svelte-1i74804 button:where(.svelte-1i74804):focus-visible, .fab.svelte-1i74804:focus-visible {outline:2px solid var(--accent);outline-offset:-2px;}.search.svelte-1i74804 {display:flex;align-items:center;gap:6px;background:var(--bg-hover);border:1px solid transparent;border-radius:var(--radius);padding:0 8px;color:var(--text-faint);width:200px;flex:0 1 auto;min-width:70px;}.search.svelte-1i74804:focus-within, .search.on.svelte-1i74804 {border-color:var(--accent);background:var(--bg);color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1;min-width:0;padding:6px 0;color:var(--text);}.search.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.seg.svelte-1i74804 {display:flex;border:1px solid var(--border-strong);border-radius:var(--radius-sm);overflow:hidden;flex:none;}.seg.svelte-1i74804 button:where(.svelte-1i74804) {all:unset;cursor:pointer;padding:4px 10px;font-size:0.86em;color:var(--text-muted);}.seg.svelte-1i74804 button:where(.svelte-1i74804) + button:where(.svelte-1i74804) {border-left:1px solid var(--border);}.seg.svelte-1i74804 button:where(.svelte-1i74804):hover {background:var(--bg-hover);color:var(--text);}.seg.svelte-1i74804 button.on:where(.svelte-1i74804) {background:var(--accent-soft);color:var(--accent-strong);font-weight:600;}.vsel.svelte-1i74804 {appearance:none;-webkit-appearance:none;font:inherit;color:var(--text);background-color:var(--bg);border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:4px 26px 4px 8px;flex:none;background-image:linear-gradient(45deg, transparent 50%, var(--text-muted) 50%), linear-gradient(135deg, var(--text-muted) 50%, transparent 50%);background-position:calc(100% - 14px) 50%, calc(100% - 9px) 50%;background-size:5px 5px;background-repeat:no-repeat;}.spin.svelte-1i74804 {width:12px;height:12px;border-radius:50%;border:2px solid var(--border-strong);border-top-color:var(--accent); animation: svelte-1i74804-spin 0.8s linear infinite;flex:none;}\n  @keyframes svelte-1i74804-spin { to { transform: rotate(360deg); } }\n  @media (prefers-reduced-motion: reduce) {.spin.svelte-1i74804 { animation: none;} }.quick.svelte-1i74804 {grid-row:2;display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--bg-alt);color:var(--accent-strong);min-width:0;flex-wrap:wrap;}.quick.svelte-1i74804 input:where(.svelte-1i74804) {all:unset;flex:1 1 260px;min-width:0;color:var(--text);font-size:1.02em;padding:4px 0;}.quick.svelte-1i74804 input:where(.svelte-1i74804)::placeholder {color:var(--text-faint);}.qprev.svelte-1i74804 {color:var(--text-muted);font-size:0.9em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.qprev.svelte-1i74804 b:where(.svelte-1i74804) {color:var(--text);}.body.svelte-1i74804 {grid-row:3;display:flex;min-height:0;}.placing.svelte-1i74804 {grid-row:2;display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--accent-soft);color:var(--text);min-width:0;flex-wrap:wrap;}.ptext.svelte-1i74804 {flex:1 1 240px;min-width:0;overflow-wrap:anywhere;}.placing.svelte-1i74804 .tbox:where(.svelte-1i74804) {width:11px;height:11px;border:1.5px solid var(--accent-strong);border-radius:3px;flex:none;box-sizing:border-box;}.side.svelte-1i74804 {flex:none;width:248px;border-right:1px solid var(--border);background:var(--bg-alt);min-height:0;}.view.svelte-1i74804 {flex:1;min-width:0;min-height:0;position:relative;display:flex;flex-direction:column;}.view.svelte-1i74804 > * {flex:1;min-height:0;}.view.svelte-1i74804 > .atlas-notice {flex:none;margin:10px 14px;}.popscrim.svelte-1i74804 {position:absolute;inset:0;z-index:49;}.fab.svelte-1i74804 {all:unset;cursor:pointer;position:absolute;right:18px;bottom:22px;z-index:40;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--accent);color:var(--accent-fg);box-shadow:var(--shadow-md, 0 6px 18px rgba(0,0,0,.3));}.narrow.svelte-1i74804 .top:where(.svelte-1i74804) {flex-wrap:wrap;row-gap:6px;padding:8px;}.narrow.svelte-1i74804 h1:where(.svelte-1i74804) {order:10;flex-basis:100%;margin:0;font-size:1.05em;}.narrow.svelte-1i74804 .search:where(.svelte-1i74804) {width:auto;flex:1 1 60px;min-width:60px;}\n  @container (max-width: 1100px) {.seg.svelte-1i74804 button:where(.svelte-1i74804) {padding:4px 7px;} }"
};
function $n(e, t) {
	j(t, !0), S(e, Qn);
	let a = new Ce(t.atlas), c = R(1200), d = R(void 0), m = R(!0), v = R(!1), y = R(void 0), C = R(""), T = R(!1), O = R(""), ee = R(void 0), M = R(null), N = R(""), F = R(null), I = R(null), z = k(() => A(c) < 700), U = k(() => !A(z) && A(c) >= 900 && A(m)), W = k(() => a.shown());
	te(() => {
		a.narrow !== A(z) && (a.narrow = A(z), a.load());
	});
	let oe = [
		["day", "Day"],
		["week", "Week"],
		["workweek", "Work week"],
		["month", "Month"],
		["agenda", "Agenda"],
		["year", "Year"]
	], G = k(() => A(F)?.e ?? null), se = () => A(d)?.getBoundingClientRect() ?? new DOMRect(0, 0, A(c), 800);
	function ce(e, t) {
		B(F, {
			e,
			at: t
		}, !0), B(I, null);
	}
	function K(e, t, n, r) {
		if (!a.newCalendar()) {
			a.toast(a.configured ? "No calendar of your accounts takes new events (all read-only?)" : "Add a calendar account in Settings first", "error");
			return;
		}
		B(F, {
			draft: {
				start: e,
				end: t,
				all_day: n
			},
			at: r
		}, !0);
	}
	function Y() {
		let e = new Date(a.cursor), t = /* @__PURE__ */ new Date(), n = new Date(e.getFullYear(), e.getMonth(), e.getDate(), t.getHours() + 1, 0);
		B(I, {
			start: o(n),
			end: o(new Date(n.getTime() + 36e5)),
			allDay: !1
		}, !0), B(F, null);
	}
	function le(e = A(F)?.e) {
		if (!e) return;
		if (!e.writable) {
			a.toast(`${e.calendar_name || "This calendar"} is read-only`, "error");
			return;
		}
		let t = Ce.fields(e);
		B(I, {
			e,
			start: t.start,
			end: t.end,
			allDay: e.all_day
		}, !0), B(F, null);
	}
	function ue(e, t) {
		let n = A(F)?.draft;
		n && (B(I, n.all_day ? {
			start: h(n.start),
			end: h(Z(n.end, -1)),
			allDay: !0,
			title: e,
			calendar: t
		} : {
			start: o(n.start),
			end: o(n.end),
			allDay: !1,
			title: e,
			calendar: t
		}, !0), B(F, null));
	}
	function de() {
		if (A(v)) {
			B(v, !1);
			return;
		}
		if (a.placing) {
			a.placing = null;
			return;
		}
		if (A(I)) {
			B(I, null);
			return;
		}
		if (A(F)) {
			B(F, null);
			return;
		}
		if (A(T)) {
			B(T, !1);
			return;
		}
		a.results && (B(C, ""), a.search(""));
	}
	function fe() {
		t.atlas.pick({
			placeholder: "Go to a date… (2026-12-01, 15 nov, next monday)",
			tag: "Calendar",
			items: [{
				value: h(/* @__PURE__ */ new Date()),
				title: "Today"
			}, {
				value: h(Z(/* @__PURE__ */ new Date(), 7)),
				title: "In a week"
			}],
			typed: (e) => `Go to “${e}”`,
			onpick: async (e, n) => {
				if (!n) {
					a.go(/* @__PURE__ */ new Date(`${e}T12:00`));
					return;
				}
				try {
					let n = await H(t.atlas, "quick", { text: e });
					a.go(/* @__PURE__ */ new Date(`${n.start.slice(0, 10)}T12:00`));
				} catch (e) {
					a.toast(e.message, "error");
				}
			}
		});
	}
	function pe() {
		t.atlas.pick({
			placeholder: "Do what? (every command of the Calendar pane)",
			tag: "Calendar",
			items: En.filter((e) => e.id !== "palette").map((e) => ({
				value: e.id,
				title: e.title,
				detail: kn(e.keys).join("  ·  ") || void 0,
				section: e.group
			})),
			onpick: (e) => En.find((t) => t.id === e)?.run(a, he)
		});
	}
	function me() {
		B(T, !0), B(N, a.newCalendar() ?? "", !0), B(F, null), setTimeout(() => A(ee)?.focus(), 0);
	}
	let he = {
		create: Y,
		quick: me,
		edit: () => le(),
		remove: () => {
			let e = A(F)?.e;
			e?.writable && (B(F, null), a.remove(e));
		},
		focusSearch: () => {
			A(y)?.focus(), A(y)?.select();
		},
		help: () => B(v, !A(v)),
		palette: pe,
		goto: fe,
		back: de,
		sidebar: () => B(m, !A(m))
	};
	function _e(e) {
		let t = e.target;
		if (t.closest("input, textarea, select, [contenteditable=true]") || !A(d) || !(A(d).contains(t) || t === document.body || t.classList.contains("dv-content-container") && t.contains(A(d))) || [
			"shift",
			"control",
			"alt",
			"meta"
		].includes(e.key.toLowerCase())) return;
		let n = On.get(Dn(e));
		n && (n.id !== "delete" && n.id !== "edit" || A(F)?.e) && (e.preventDefault(), e.stopPropagation(), n.run(a, he));
	}
	let be;
	function xe() {
		clearTimeout(be), be = setTimeout(async () => {
			if (!A(O).trim()) {
				B(M, null);
				return;
			}
			try {
				B(M, await H(t.atlas, "quick", { text: A(O) }), !0);
			} catch {
				B(M, null);
			}
		}, 120);
	}
	async function Se() {
		if (!A(O).trim()) return;
		let e = A(M) ?? await H(t.atlas, "quick", { text: A(O) });
		B(T, !1), B(O, ""), B(M, null), await a.create({
			summary: e.title || "(no title)",
			start: e.start,
			end: e.end,
			all_day: e.all_day,
			rrule: e.rrule,
			location: e.location,
			calendar: A(N) || void 0
		}) && a.go(/* @__PURE__ */ new Date(`${e.start.slice(0, 10)}T12:00`));
	}
	let we = k(() => {
		let e = A(M);
		if (!e) return "";
		let t = new Date(e.all_day ? `${e.start}T00:00` : e.start), n = new Date(e.all_day ? `${e.end}T00:00` : e.end), r = t.toLocaleDateString(void 0, {
			weekday: "short",
			day: "numeric",
			month: "short"
		}), i = (e) => x(e, a.h12);
		return e.all_day ? `${r} · all day` : `${r} · ${i(t)} – ${i(n)}`;
	}), Te;
	function Ee() {
		clearTimeout(Te), Te = setTimeout(() => void a.search(A(C)), 160);
	}
	ie(() => {
		A(d)?.focus({ preventScroll: !0 }), (async () => {
			await a.loadSources(), await a.load(), a.sync(!1);
		})();
		let e = [t.atlas.helper.on("changed", () => {
			a.loadSources(), a.later();
		}), t.atlas.helper.on("moved", (e) => {
			for (let t of e.moved ?? []) a.offerMove(t);
		})], n = setInterval(() => a.now = /* @__PURE__ */ new Date(), 3e4), r = (e) => {
			let t = e.detail ?? {};
			t.date ? a.go(/* @__PURE__ */ new Date(`${t.date}T12:00`), t.view) : t.view && a.setView(t.view), t.quick && me(), t.create && Y(), t.place && a.startPlacing(t.place);
		};
		window.addEventListener("atlas-calendar:show", r);
		let i = window.__atlasCalendarShow;
		return i && (r(new CustomEvent("x", { detail: i })), window.__atlasCalendarShow = void 0), () => {
			e.forEach((e) => e()), clearInterval(n), window.removeEventListener("atlas-calendar:show", r);
		};
	});
	var De = Zn();
	ne("keydown", ae, _e);
	let Oe;
	var ke = $(De), Ae = $(ke), je = (e) => {
		var t = In(), n = $(t);
		V(n, { name: "menu" }), b(t), X("click", t, () => B(m, !A(m))), D(e, t);
	};
	J(Ae, (e) => {
		A(z) || e(je);
	});
	var Me = q(Ae, 2), Ne = q(Me, 2), Pe = $(Ne), Fe = $(Pe);
	V(Fe, { name: "back" }), b(Pe);
	var Ie = q(Pe, 2), Le = $(Ie);
	V(Le, { name: "right" }), b(Ie), b(Ne);
	var Re = q(Ne, 2), ze = L(Re, !0), Ve = q(Re, 2), He = (e) => {
		var t = Ln();
		Q(() => u(t, "title", a.syncing ? "Syncing with the server" : "Reading")), D(e, t);
	};
	J(Ve, (e) => {
		(a.loading || a.syncing) && e(He);
	});
	var Ue = q(Ve, 4);
	let We;
	var Ge = $(Ue);
	V(Ge, {
		name: "search",
		size: 15
	});
	var Ke = q(Ge, 2);
	s(Ke), re(Ke, (e) => B(y, e), () => A(y)), b(Ue);
	var qe = q(Ue, 2), Je = (e) => {
		var t = zn();
		w(t, 21, () => oe, ([e, t]) => e, (e, t) => {
			var n = k(() => i(A(t), 2));
			let r = () => A(n)[0], a = () => A(n)[1];
			var o = Rn(), s = L(o, !0), c = {};
			Q(() => {
				E(s, a()), c !== (c = r()) && (o.value = (o.__value = c) ?? "");
			}), D(e, o);
		}), b(t);
		var r;
		ye(t), Q(() => {
			r !== (r = a.view) && (t.value = (t.__value = r) ?? "", n(t, r));
		}), X("change", t, (e) => a.setView(e.currentTarget.value)), D(e, t);
	}, Ye = (e) => {
		var t = Vn();
		w(t, 21, () => oe, ([e, t]) => e, (e, t) => {
			var n = k(() => i(A(t), 2));
			let r = () => A(n)[0], o = () => A(n)[1];
			var s = Bn();
			let c;
			var d = L(s, !0);
			Q((e) => {
				u(s, "title", `${o() ?? ""} (${e ?? ""})`), c = l(s, 1, "svelte-1i74804", null, c, { on: a.view === r() }), E(d, o());
			}, [() => En.find((e) => e.id === r())?.keys?.split(",")[0]]), X("click", s, () => a.setView(r())), D(e, s);
		}), b(t), D(e, t);
	};
	J(qe, (e) => {
		A(c) < 980 ? e(Je) : e(Ye, -1);
	});
	var Xe = q(qe, 2), Ze = $(Xe);
	V(Ze, { name: "sparkle" }), b(Xe);
	var Qe = q(Xe, 2), $e = (e) => {
		var t = Hn(), n = P(t), r = $(n);
		V(r, { name: "refresh" }), b(n);
		var i = q(n, 2), o = $(i);
		V(o, { name: "keyboard" }), b(i), X("click", n, () => a.sync(!0)), X("click", i, pe), D(e, t);
	};
	J(Qe, (e) => {
		A(z) || e($e);
	}), b(ke);
	var et = q(ke, 2), nt = (e) => {
		var t = Wn(), n = $(t);
		V(n, {
			name: "sparkle",
			size: 15
		});
		var r = q(n, 2);
		s(r), re(r, (e) => B(ee, e), () => A(ee));
		var i = q(r, 2), o = (e) => {
			var t = Un(), n = $(t), r = L(n, !0), i = q(n);
			b(t), Q(() => {
				E(r, A(M).title || "(no title)"), E(i, ` · ${A(we) ?? ""}${A(M).rrule ? " · repeats" : ""}${A(M).location ? ` · ${A(M).location}` : ""}`);
			}), D(e, t);
		};
		J(i, (e) => {
			A(M) && e(o);
		});
		var c = q(i, 2), l = (e) => {
			Mt(e, {
				get cal() {
					return a;
				},
				compact: !0,
				get value() {
					return A(N);
				},
				set value(e) {
					B(N, e, !0);
				}
			});
		};
		J(c, (e) => {
			A(N) && e(l);
		});
		var u = q(c, 2);
		b(t), Q((e) => u.disabled = e, [() => !A(O).trim()]), X("input", r, xe), X("keydown", r, (e) => {
			e.key === "Enter" ? (e.preventDefault(), Se()) : e.key === "Escape" && (e.stopPropagation(), B(T, !1));
		}), g(r, () => A(O), (e) => B(O, e)), X("click", u, Se), D(e, t);
	};
	J(et, (e) => {
		A(T) && e(nt);
	});
	var rt = q(et, 2), it = (e) => {
		var t = Gn(), n = q($(t), 2), r = q($(n)), i = L(r, !0);
		ge(), b(n);
		var o = q(n, 2);
		b(t), Q(() => E(i, a.placing.title)), X("click", o, () => a.placing = null), D(e, t);
	};
	J(rt, (e) => {
		a.placing && e(it);
	});
	var at = q(rt, 2), ot = $(at), st = (e) => {
		var t = Kn();
		Be($(t), {
			get cal() {
				return a;
			},
			oncreate: Y
		}), b(t), D(e, t);
	};
	J(ot, (e) => {
		A(U) && e(st);
	});
	var ct = q(ot, 2), lt = $(ct), ut = (e) => {
		var n = qn(), r = $(n, !0), i = q(r), o = $(i), s = q(o);
		b(i), b(n), Q(() => E(r, a.error)), X("click", o, () => a.load()), X("click", s, () => t.atlas.plugin.openSettings()), D(e, n);
	}, ft = (e) => {
		var n = Jn(), r = q($(n)), i = L(r);
		b(n), X("click", i, () => t.atlas.plugin.openSettings()), D(e, n);
	};
	J(lt, (e) => {
		a.error ? e(ut) : !a.configured && !a.sources.length && e(ft, 1);
	});
	var pt = q(lt, 2), mt = (e) => {
		{
			let t = k(() => r(/* @__PURE__ */ new Date())), n = k(() => r(/* @__PURE__ */ new Date()));
			bt(e, {
				get cal() {
					return a;
				},
				get events() {
					return a.results;
				},
				get from() {
					return A(t);
				},
				get to() {
					return A(n);
				},
				get selected() {
					return A(G);
				},
				onselect: ce,
				search: !0
			});
		}
	}, ht = (e) => {
		{
			let t = k(() => a.days());
			dt(e, {
				get cal() {
					return a;
				},
				get days() {
					return A(t);
				},
				get selected() {
					return A(G);
				},
				onselect: ce,
				oncreate: K
			});
		}
	}, gt = (e) => {
		{
			let t = k(() => a.shownEvents()), n = k(() => a.range().from), r = k(() => a.range().to);
			bt(e, {
				get cal() {
					return a;
				},
				get events() {
					return A(t);
				},
				get from() {
					return A(n);
				},
				get to() {
					return A(r);
				},
				get selected() {
					return A(G);
				},
				onselect: ce
			});
		}
	}, _t = (e) => {
		Dt(e, { get cal() {
			return a;
		} });
	}, vt = (e) => {
		var t = _(), n = P(t);
		f(n, () => A(W) + a.range().from.getTime(), (e) => {
			{
				let t = k(() => a.days());
				tt(e, {
					get cal() {
						return a;
					},
					get days() {
						return A(t);
					},
					get selected() {
						return A(G);
					},
					onselect: ce,
					oncreate: K
				});
			}
		}), D(e, t);
	};
	J(pt, (e) => {
		a.results ? e(mt) : A(W) === "month" ? e(ht, 1) : A(W) === "agenda" ? e(gt, 2) : A(W) === "year" ? e(_t, 3) : e(vt, -1);
	}), b(ct), b(at);
	var yt = q(at, 2), xt = (e) => {
		var t = Yn(), n = $(t);
		V(n, {
			name: "plus",
			size: 22
		}), b(t), X("click", t, Y), D(e, t);
	};
	J(yt, (e) => {
		A(z) && e(xt);
	});
	var St = q(yt, 2), Ct = (e) => {
		var t = Xn(), n = P(t), r = q(n, 2);
		f(r, () => A(F), (e) => {
			{
				let t = k(() => A(F).e ?? null), n = k(() => A(F).draft ?? null), r = k(se);
				sn(e, {
					get cal() {
						return a;
					},
					get e() {
						return A(t);
					},
					get draft() {
						return A(n);
					},
					get at() {
						return A(F).at;
					},
					get box() {
						return A(r);
					},
					onedit: () => le(),
					onmore: ue,
					onclose: () => B(F, null)
				});
			}
		}), X("click", n, () => B(F, null)), D(e, t);
	};
	J(St, (e) => {
		A(F) && e(Ct);
	});
	var wt = q(St, 2), Tt = (e) => {
		{
			let t = k(() => A(I).e ?? null), n = k(() => A(I).title ?? ""), r = k(() => A(I).calendar ?? "");
			vn(e, {
				get cal() {
					return a;
				},
				get e() {
					return A(t);
				},
				get start() {
					return A(I).start;
				},
				get end() {
					return A(I).end;
				},
				get allDay() {
					return A(I).allDay;
				},
				get title() {
					return A(n);
				},
				get calendar() {
					return A(r);
				},
				onclose: () => B(I, null)
			});
		}
	};
	J(wt, (e) => {
		A(I) && e(Tt);
	});
	var Et = q(wt, 2), Ot = (e) => {
		Fn(e, { onclose: () => B(v, !1) });
	};
	J(Et, (e) => {
		A(v) && e(Ot);
	}), wn(q(Et, 2), { get cal() {
		return a;
	} }), b(De), re(De, (e) => B(d, e), () => A(d)), Q((e, t) => {
		Oe = l(De, 1, "calendar svelte-1i74804", null, Oe, { narrow: A(z) }), u(Re, "title", e), E(ze, t), We = l(Ue, 1, "search svelte-1i74804", null, We, { on: !!A(C) }), u(Ke, "placeholder", A(z) ? "" : "Search events");
	}, [() => a.title(), () => a.title()]), X("pointerdown", De, (e) => {
		e.target.closest("input, textarea, select, button, [tabindex='0']") || A(d)?.focus({ preventScroll: !0 });
	}), X("click", Me, () => a.today()), X("click", Pe, () => a.step(-1)), X("click", Ie, () => a.step(1)), X("input", Ke, Ee), X("keydown", Ke, (e) => {
		e.key === "Escape" && (B(C, ""), a.search(""), A(y)?.blur());
	}), g(Ke, () => A(C), (e) => B(C, e)), X("click", Xe, me), p(De, "clientWidth", (e) => B(c, e)), D(e, De), ve();
}
G([
	"pointerdown",
	"click",
	"input",
	"keydown",
	"change"
]);
//#endregion
//#region plugins/stable/dav/ui/src/NewEvent.svelte
var er = e("<div class=\"none svelte-19uhe47\"><p class=\"svelte-19uhe47\">No calendar to write to: add an account (CalDAV, or Outlook / Microsoft 365) in the Calendar's settings.</p> <button class=\"atlas-btn\">Open its settings</button></div>"), tr = e("<p class=\"none svelte-19uhe47\">Loading the calendars…</p>"), nr = {
	hash: "svelte-19uhe47",
	code: ".none.svelte-19uhe47 {padding:16px;display:grid;gap:10px;justify-items:start;color:var(--text-muted);margin:0;}.none.svelte-19uhe47 p:where(.svelte-19uhe47) {margin:0;}"
};
function rr(e, n) {
	j(n, !0), S(e, nr);
	let r = t(n, "seed", 19, () => ({})), i = ce(() => new Ce(n.atlas));
	i.toast = (e, t) => n.atlas.toast("Calendar", e, t === "error" ? "error" : "success");
	let a = R(!1);
	i.loadSources().then(() => B(a, !0));
	let s = /* @__PURE__ */ new Date(), c = new Date(s.getFullYear(), s.getMonth(), s.getDate(), s.getHours() + 1, 0);
	var l = _(), u = P(l), d = (e) => {
		var t = _(), a = P(t), s = (e) => {
			{
				let t = k(() => o(c)), a = k(() => o(new Date(c.getTime() + 36e5))), s = k(() => r().title ?? ""), l = k(() => r().guests ?? []), u = k(() => r().description ?? "");
				vn(e, {
					get cal() {
						return i;
					},
					get start() {
						return A(t);
					},
					get end() {
						return A(a);
					},
					allDay: !1,
					get title() {
						return A(s);
					},
					get guests() {
						return A(l);
					},
					get description() {
						return A(u);
					},
					frame: "dialog",
					get onclose() {
						return n.onclose;
					}
				});
			}
		}, l = k(() => i.writable().length), u = (e) => {
			var t = er(), r = q($(t), 2);
			b(t), X("click", r, () => n.atlas.plugin.openSettings()), D(e, t);
		};
		J(a, (e) => {
			A(l) ? e(s) : e(u, -1);
		}), D(e, t);
	}, f = (e) => {
		var t = tr();
		D(e, t);
	};
	J(u, (e) => {
		A(a) ? e(d) : e(f, -1);
	}), D(e, l), ve();
}
G(["click"]);
//#endregion
//#region plugins/stable/dav/ui/src/view.ts
function ir(e, t) {
	let n = O(t.arg);
	if (n) {
		let r = d(rr, {
			target: e,
			props: {
				atlas: t,
				seed: n,
				onclose: () => t.pane?.close?.()
			}
		});
		return () => T(r);
	}
	e.style.height = "100%";
	let r = d($n, {
		target: e,
		props: { atlas: t }
	});
	return () => T(r);
}
//#endregion
export { ir as default };
