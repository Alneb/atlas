// The Calendar pane's state: the calendars, the events of the range on screen (from the engine's cache, at once),
// the view and the day it is on, and every change — made on screen first (optimistic), written behind, with an Undo
// in the toast and a roll-back with the reason when the server refuses (UI-STYLE §4).
import { Steps } from "../../../../../ui/src/lib/pane-nav";
import { addDays, addMonths, agendaRange, agendaStep, call, evEnd, evStart, hourCycle, hueColor, isSpan, sameDay, startOfDay, startOfWeek, wall, weekStart, ymd, TASKS, type Account, type Answer, type Ev, type PluginApi, type Source, type Span, type TaskRow } from "./api";

export type View = "day" | "week" | "workweek" | "month" | "agenda" | "year";
export type Scope = "this" | "following" | "all";
export interface Toast { id: number; text: string; kind?: "error" | "success"; undo?: () => Promise<void>; action?: { label: string; run: () => unknown } }
/** An event that moved since its note said (the engine's `moved`): its linked tasks' ⏳ may follow. */
export interface Moved { note: string; uid: string; title: string; from: string; to: string; links: string[] }
/** What the editor or a drag changes (engine edit.rs `Change`). */
export interface Change { summary?: string; start?: string; end?: string; all_day?: boolean; location?: string; description?: string; rrule?: string; from_start?: string; calendar?: string; move_to?: string; attendees?: string[] }

/** A new event before it has a title: its slot. */
export interface Draft { start: Date; end: Date; all_day: boolean }

export const NOTES = "notes";
const stored = (k: string) => { try { return localStorage.getItem(`atlas-calendar-${k}`); } catch { return null; } };
const store = (k: string, v: string) => { try { localStorage.setItem(`atlas-calendar-${k}`, v); } catch { /* a private window */ } };

export class Cal {
  atlas: PluginApi;
  sources = $state<Source[]>([]);
  accounts = $state<Account[]>([]);
  events = $state<Ev[]>([]);
  view = $state<View>("week");
  /** How much the Agenda shows (api.ts `Span`), kept on this device as the view is. */
  span = $state<Span>(isSpan(stored("span")) ? (stored("span") as Span) : "60days");
  cursor = $state(startOfDay(new Date()));
  loading = $state(true);
  syncing = $state(false);
  error = $state("");
  configured = $state(true);
  /** the default calendar for new events (Settings), as the engine resolved it */
  write = $state<string | null>(null);
  /** the calendar the last new event went to (this device), preferred over the default while it can be written */
  last = $state<string | null>(stored("last"));
  hidden = $state<string[]>([]);
  colors = $state<Record<string, string>>({});
  toasts = $state<Toast[]>([]);
  results = $state<Ev[] | null>(null);
  query = $state("");
  now = $state(new Date());
  /** The Tasks & deadlines layer: the core's `from: deadlines` rows of the range, drawn as all-day items. */
  tasks = $state<Ev[]>([]);
  /** A task being time-blocked: the next slot dragged on the hours becomes its event (`timeBlock`). */
  placing = $state<TaskRow | null>(null);
  /** The pane is phone-narrow: one column, so the week shows as a day and the month as the agenda. */
  narrow = $state(false);
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(atlas: PluginApi) {
    this.atlas = atlas;
    const s = atlas.plugin.settings;
    this.view = (stored("view") ?? String(s.default_view ?? "week")) as View;
    this.hidden = ((s.hidden as string[] | undefined) ?? []).slice();
    for (const line of (s.colors as string[] | undefined) ?? []) {
      const i = line.lastIndexOf(":");
      if (i > 0) this.colors[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }

  get settings() { return this.atlas.plugin.settings; }
  get first() { return weekStart(this.settings.week_start); }
  get h12() { return hourCycle(this.settings.time_format); }
  get showNotes() { return this.settings.show_notes === true; }

  /** The view drawn: the chosen one, or its one-column form in a narrow pane. */
  shown(): View {
    if (!this.narrow) return this.view;
    return this.view === "week" || this.view === "workweek" ? "day" : this.view === "month" || this.view === "year" ? "agenda" : this.view;
  }

  /** The days the view shows (first, last inclusive). */
  range(view = this.shown(), cursor = this.cursor): { from: Date; to: Date } {
    switch (view) {
      case "day": return { from: cursor, to: cursor };
      case "week": { const s = startOfWeek(cursor, this.first); return { from: s, to: addDays(s, 6) }; }
      case "workweek": { const s = startOfWeek(cursor, 1); return { from: s, to: addDays(s, 4) }; }
      case "month": { const s = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1), this.first); return { from: s, to: addDays(s, 41) }; }
      case "agenda": return agendaRange(this.span, cursor, this.first);
      case "year": return { from: new Date(cursor.getFullYear(), 0, 1), to: new Date(cursor.getFullYear(), 11, 31) };
    }
  }

  days(): Date[] {
    const { from, to } = this.range();
    const out: Date[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }

  /** A calendar's colour: chosen in the pane, else the server's / the subscription's, else one from its name. */
  colorOf(id: string): string {
    if (id === NOTES) return this.colors[NOTES] ?? this.colors.Notes ?? "var(--accent)";
    if (id === TASKS) return this.colors[TASKS] ?? "var(--text-muted)";
    const s = this.sources.find((x) => x.id === id);
    return this.colors[id] ?? this.colors[s?.name ?? ""] ?? s?.shown_color ?? s?.color ?? hueColor(id);
  }
  isHidden(id: string, name = id) { return this.hidden.includes(id) || this.hidden.includes(name); }

  async loadSources() {
    try {
      const r = await call<{ sources: Source[]; write: string | null; accounts: Account[]; configured: boolean }>(this.atlas, "watch", {}, 30);
      this.sources = r.sources;
      this.accounts = r.accounts ?? [];
      this.write = r.write;
      this.configured = r.configured;
    } catch (e) { this.error = (e as Error).message; }
  }

  /** The range on screen from the cache; `quiet`: no spinner (a refresh behind). */
  async load(quiet = false) {
    const { from, to } = this.range();
    const ask = ++this.seq;
    if (!quiet) this.loading = true;
    try {
      const ids = this.sources.filter((s) => !this.isHidden(s.id, s.name)).map((s) => s.id);
      const [r, tasks] = await Promise.all([
        call<{ events: Ev[] }>(this.atlas, "range", { from: ymd(from), to: ymd(to), sources: ids, notes: this.showNotes && !this.isHidden(NOTES, "Notes") }, 60),
        this.isHidden(TASKS, "Tasks") ? Promise.resolve([]) : this.deadlines(ymd(from), ymd(to)),
      ]);
      if (ask !== this.seq) return; // a newer range was asked meanwhile
      this.events = r.events;
      this.tasks = tasks;
      this.error = "";
    } catch (e) {
      if (ask === this.seq) this.error = (e as Error).message;
    } finally {
      if (ask === this.seq) this.loading = false;
    }
  }

  /** The core's deadlines between two days (open tasks with 📅 or ⏳, notes with `due:`) as all-day items; the deadline
   *  calendars' events are already on the grid. A failure leaves the layer empty: the events still show. */
  private async deadlines(from: string, to: string): Promise<Ev[]> {
    try {
      const r = await this.atlas.view("type: list\nfrom: deadlines\nscheduled: true\n");
      return (r.rows as TaskRow[])
        .filter((x) => x.date && x.date >= from && x.date <= to && x.props.from !== "event" && !x.done && x.path)
        .map((t) => {
          const next = new Date(`${t.date}T12:00`);
          return {
            uid: `task:${t.path}:${t.line ?? 0}`, summary: t.title, start: t.date, end: ymd(addDays(next, 1)), all_day: true, recurring: false, free: true,
            calendar: TASKS, calendar_name: t.props.from === "note" ? "Deadline (note)" : "Task", writable: false, task: t,
          } satisfies Ev;
        });
    } catch { return []; }
  }

  /** A task of the layer ticked through the core (`atlas.tickTask`, as Home ticks: its ✅ date, a repeating one's next
   *  occurrence): gone from the list at once, back with the reason when the core refuses. Null on an Atlas older than
   *  plugin API 31, which has no tick for plugins: the row then has no box. */
  get canTick(): boolean { return typeof (this.atlas as Partial<PluginApi>).tickTask === "function"; }
  async tick(t: TaskRow): Promise<void> {
    if (!this.canTick || t.line == null) return;
    const before = this.tasks;
    this.tasks = before.filter((e) => !(e.task && e.task.path === t.path && e.task.line === t.line));
    try {
      await this.atlas.tickTask(t.path, t.line);
      this.toast(`Done: “${t.title}”`, "success", undefined, { label: "Open the note", run: () => this.atlas.open(t.path, t.line ?? undefined) });
      void this.load(true); // a repeating task's next occurrence
    } catch (e) {
      this.tasks = before;
      this.toast(`Not ticked: ${(e as Error).message}`, "error");
    }
  }

  /** Every item of the range: the events, then the layer's tasks. */
  shownEvents(): Ev[] { return this.tasks.length ? [...this.events, ...this.tasks] : this.events; }

  // ----- tasks into the calendar (DESIGN-calendar-tasks-nudges §2.3)

  /** Time-block a task: the pane waits for a slot dragged on the hours (Esc cancels). */
  startPlacing(t: TaskRow) {
    this.placing = t;
    if (this.shown() === "month" || this.shown() === "agenda" || this.shown() === "year") this.setView("week");
  }

  /** The slot chosen for the task being placed: the event, its note linking the task, the task's ⏳ and link — in one
   *  call to the engine (`time_block`). */
  async timeBlock(start: Date, end: Date): Promise<boolean> {
    const t = this.placing;
    this.placing = null;
    if (!t) return false;
    const calendar = this.newCalendar() ?? undefined;
    try {
      const r = await call<{ note: string; label: string; undo: number }>(this.atlas, "time_block", { summary: t.title, start: wall(start), end: wall(end), calendar, task: { path: t.path, line: t.line ?? 0, text: t.title } });
      this.toast(`Time-blocked “${t.title}” · ${r.label}`, "success", undefined, { label: "Open the note", run: () => this.atlas.open(r.note) });
      return true;
    } catch (e) {
      this.toast(`Not time-blocked: ${(e as Error).message}`, "error");
      return false;
    } finally { await this.load(true); }
  }

  /** An event with linked tasks moved (here, or on another device): offer to move their ⏳ — the lines are the user's,
   *  so it is asked, never done by itself. */
  offerMove(m: Moved) {
    if (!m.links.some((l) => l.includes("#^"))) return;
    const to = new Date(m.to.length > 10 ? m.to : `${m.to}T12:00`);
    const day = to.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    this.toast(`“${m.title}” moved to ${day}`, undefined, undefined, {
      label: "Move ⏳ too",
      run: async () => {
        try {
          const r = await call<{ moved: number; failed: string[] }>(this.atlas, "move_tasks", { note: m.note });
          this.toast(r.failed.length ? `Not moved: ${r.failed.join("; ")}` : `${r.moved === 1 ? "Its task is" : `${r.moved} tasks are`} now ⏳ ${day}`, r.failed.length ? "error" : "success");
        } catch (e) { this.toast(`Not moved: ${(e as Error).message}`, "error"); }
      },
    });
  }

  later(ms = 250) { clearTimeout(this.timer); this.timer = setTimeout(() => void this.load(true), ms); }

  async sync(force = true) {
    this.syncing = true;
    try {
      const r = await call<{ changed: boolean; errors: string[] }>(this.atlas, "refresh", { force }, 300);
      await this.loadSources();
      if (r.changed) await this.load(true);
      if (r.errors.length) this.toast(r.errors[0], "error");
    } catch (e) { this.error ||= (e as Error).message; } // the view's notice (Try again, Settings…), not a second copy in a toast
    finally { this.syncing = false; }
  }

  // ----- moving around

  /** Back / Forward through the views and dates shown (the app's Back asks it first; App.svelte attaches it) */
  steps = new Steps<{ view: View; day: number }>(() => this.spot(), (p) => {
    this.cursor = new Date(p.day);
    this.view = p.view; store("view", p.view); this.results = null; void this.load();
  });
  private spot() { return { view: this.view, day: this.cursor.getTime() }; }

  setView(v: View) {
    const was = this.spot();
    this.view = v; store("view", v); this.results = null; void this.load();
    this.steps.left(was);
  }
  /** The Agenda's length (a day, 3 days, a week, 60 days): the range read again. */
  setSpan(s: Span) {
    this.span = s; store("span", s); void this.load();
  }
  go(d: Date, v?: View) {
    const was = this.spot();
    this.cursor = startOfDay(d);
    if (v) this.steps.unrecorded(() => this.setView(v)); else void this.load();
    this.steps.left(was);
  }
  today() { this.go(new Date()); }
  step(dir: 1 | -1) {
    const c = this.cursor;
    const next = ({
      day: () => addDays(c, dir),
      week: () => addDays(c, 7 * dir),
      workweek: () => addDays(c, 7 * dir),
      month: () => addMonths(new Date(c.getFullYear(), c.getMonth(), 1), dir),
      agenda: () => addDays(c, agendaStep(this.span) * dir),
      year: () => new Date(c.getFullYear() + dir, c.getMonth(), 1),
    } as Record<View, () => Date>)[this.shown()]();
    this.go(next);
  }

  title(narrowView: View = this.shown()): string {
    const { from, to } = this.range(narrowView);
    const c = this.cursor;
    if (narrowView === "day" || (narrowView === "agenda" && sameDay(from, to))) return c.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (narrowView === "month") return c.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (narrowView === "year") return String(c.getFullYear());
    const sameMonth = from.getMonth() === to.getMonth();
    const f = from.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
    return `${f} – ${to.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
  }

  // ----- calendars

  // hidden and colours are kept by id (unique across accounts); a name written by 0.1 still counts
  toggle(id: string, name: string) {
    this.hidden = this.isHidden(id, name) ? this.hidden.filter((h) => h !== id && h !== name) : [...this.hidden, id];
    void this.load(true);
    void this.atlas.plugin.saveSettings({ hidden: this.hidden }).catch(() => {});
  }
  setColor(id: string, color: string) {
    const name = this.sources.find((s) => s.id === id)?.name;
    const next = Object.fromEntries(Object.entries(this.colors).filter(([k]) => k !== name));
    this.colors = { ...next, [id]: color };
    void this.atlas.plugin.saveSettings({ colors: Object.entries(this.colors).map(([k, v]) => `${k}: ${v}`) }).catch(() => {});
  }
  writable(): Source[] { return this.sources.filter((s) => s.kind === "caldav" && s.writable); }
  /** The calendars grouped by account, in Settings' order (`writable`: only those new events can go to). */
  byAccount(writable = false): { account: Account; items: Source[] }[] {
    const pool = writable ? this.writable() : this.sources.filter((s) => s.kind === "caldav");
    const named = this.accounts.map((account) => ({ account, items: pool.filter((s) => s.account === account.name) }));
    const stray = pool.filter((s) => !this.accounts.some((a) => a.name === s.account));
    return [...named, ...(stray.length ? [{ account: { name: "Other" }, items: stray }] : [])].filter((g) => g.items.length || !writable);
  }
  /** Where a new event goes: the calendar used last (while it can be written), else the default. */
  newCalendar(): string | null {
    const ok = (id: string | null) => !!id && this.writable().some((s) => s.id === id);
    return ok(this.last) ? this.last : ok(this.write) ? this.write : (this.writable()[0]?.id ?? null);
  }
  remember(id: string | undefined) {
    if (!id) return;
    this.last = id;
    store("last", id);
  }

  // ----- changes

  toast(text: string, kind?: Toast["kind"], undo?: () => Promise<void>, action?: Toast["action"]) {
    const id = Date.now() + Math.random();
    this.toasts = [...this.toasts.slice(-2), { id, text, kind, undo, action }];
    setTimeout(() => this.dismiss(id), undo || action ? 9000 : kind === "error" ? 12000 : 4000);
  }
  dismiss(id: number) { this.toasts = this.toasts.filter((t) => t.id !== id); }

  private undoer(id: number | undefined, what: string) {
    if (id === undefined) return undefined;
    return async () => {
      try { await call(this.atlas, "undo", { id }); this.toast(`${what} undone`); }
      catch (e) { this.toast(`Not undone: ${(e as Error).message}`, "error"); }
      this.later(0);
    };
  }

  /** Asks "this event / this and following / all" for a recurring event (null: cancelled). */
  askScope(e: Ev, verb: string): Promise<Scope | null> {
    if (!e.recurring || !e.rid) return Promise.resolve("this");
    return new Promise((done) => {
      let picked = false;
      this.atlas.pick({
        placeholder: `${verb} a repeating event: which ones?`, tag: "Repeating",
        items: [
          { value: "this", title: "This event" },
          { value: "following", title: "This and following events" },
          { value: "all", title: "All events" },
        ],
        onpick: (v) => { picked = true; done(v as Scope); },
      });
      // the palette closed without a pick: nothing happens
      const check = () => { if (!picked && !document.querySelector("[data-testid=palette]")) done(null); else if (!picked) setTimeout(check, 300); };
      setTimeout(check, 600);
    });
  }

  async create(c: Change): Promise<boolean> {
    const calendar = c.calendar ?? this.newCalendar() ?? undefined;
    const temp: Ev = {
      uid: `pending-${Date.now()}`, summary: c.summary || "(no title)", start: c.all_day ? c.start!.slice(0, 10) : new Date(c.start!).toISOString(), end: c.all_day ? c.end!.slice(0, 10) : new Date(c.end!).toISOString(),
      all_day: !!c.all_day, recurring: !!c.rrule, free: false, calendar: calendar ?? "", calendar_name: "", writable: true, location: c.location,
    };
    this.events = [...this.events, temp];
    this.remember(calendar);
    try {
      const r = await call<{ undo: number }>(this.atlas, "create", { ...c, calendar } as Record<string, unknown>);
      this.toast(`Added “${temp.summary}”`, undefined, this.undoer(r.undo, "Adding"));
      return true;
    } catch (e) {
      this.toast(`Not added: ${(e as Error).message}`, "error");
      return false;
    } finally { await this.load(true); }
  }

  /** Moves or resizes on screen at once, then writes. */
  async change(e: Ev, c: Change, scope: Scope, what = "Changed") {
    if (c.start && c.end) {
      const i = this.events.indexOf(e);
      const moved: Ev = { ...e, start: c.all_day ?? e.all_day ? c.start.slice(0, 10) : new Date(c.start).toISOString(), end: c.all_day ?? e.all_day ? c.end.slice(0, 10) : new Date(c.end).toISOString() };
      if (i >= 0 && scope === "this") this.events = [...this.events.slice(0, i), moved, ...this.events.slice(i + 1)];
    }
    try {
      if (c.move_to) this.remember(c.move_to);
      const r = await call<{ undo: number }>(this.atlas, "update", { ...c, calendar: e.calendar, href: e.href, uid: e.uid, rid: e.rid, scope, from_start: c.from_start ?? e.start });
      this.toast(`${what} “${c.summary ?? e.summary}”`, undefined, this.undoer(r.undo, what));
    } catch (err) {
      this.toast(`Not saved: ${(err as Error).message}`, "error");
    } finally { await this.load(true); }
  }

  /** Answers a meeting from its card (Exchange tells the organiser); a series is answered as a whole. */
  async respond(e: Ev, partstat: Answer): Promise<boolean> {
    const said = { ACCEPTED: "Going to", TENTATIVE: "Maybe going to", DECLINED: "Declined" }[partstat];
    const before = this.events;
    this.events = this.events.map((x) => (x.uid === e.uid && x.calendar === e.calendar ? { ...x, answer: partstat } : x));
    try {
      await call(this.atlas, "respond", { calendar: e.calendar, href: e.href, partstat });
      this.toast(`${said} “${e.summary}” — the organiser is told`);
      return true;
    } catch (err) {
      this.events = before;
      this.toast(`Not answered: ${(err as Error).message}`, "error");
      return false;
    } finally { await this.load(true); }
  }

  async remove(e: Ev) {
    const scope = await this.askScope(e, "Delete");
    if (!scope) return;
    this.events = this.events.filter((x) => !(x.uid === e.uid && (scope !== "this" || x.rid === e.rid)));
    try {
      const r = await call<{ undo: number }>(this.atlas, "delete", { calendar: e.calendar, href: e.href, uid: e.uid, rid: e.rid, scope });
      this.toast(`Deleted “${e.summary}”`, undefined, this.undoer(r.undo, "Deleting"));
    } catch (err) {
      this.toast(`Not deleted: ${(err as Error).message}`, "error");
    } finally { await this.load(true); }
  }

  /** A copy of `e` at the same time in its own calendar (or the default one when it is read-only), not repeating
   *  guests: the copy is the user's own event, nobody is invited by duplicating. */
  duplicate(e: Ev): Promise<boolean> {
    const s = evStart(e), en = evEnd(e);
    // an all-day end is already the day after, which is what the engine takes
    const at = e.all_day ? { start: ymd(s), end: ymd(en) } : { start: wall(s), end: wall(en) };
    return this.create({ summary: e.summary, ...at, all_day: e.all_day, location: e.location, description: e.description, rrule: e.rrule, calendar: e.writable ? e.calendar : undefined });
  }

  async search(q: string) {
    this.query = q;
    if (!q.trim()) { this.results = null; return; }
    try { this.results = (await call<{ events: Ev[] }>(this.atlas, "search", { q })).events; }
    catch (e) { this.toast((e as Error).message, "error"); }
  }

  /** An event's times as the editor shows them (all-day: the last day inclusive). */
  static fields(e: Ev): { start: string; end: string } {
    const s = evStart(e), en = evEnd(e);
    return e.all_day ? { start: ymd(s), end: ymd(addDays(en, -1)) } : { start: wall(s), end: wall(en) };
  }
}
