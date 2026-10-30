// The Calendar pane's state: the calendars, the events of the range on screen (from the engine's cache, at once),
// the view and the day it is on, and every change — made on screen first (optimistic), written behind, with an Undo
// in the toast and a roll-back with the reason when the server refuses (UI-STYLE §4).
import { addDays, addMonths, call, evEnd, evStart, hourCycle, hueColor, startOfDay, startOfWeek, wall, weekStart, ymd, type Account, type Ev, type PluginApi, type Source } from "./api";

export type View = "day" | "week" | "workweek" | "month" | "agenda" | "year";
export type Scope = "this" | "following" | "all";
export interface Toast { id: number; text: string; kind?: "error" | "success"; undo?: () => Promise<void> }
/** What the editor or a drag changes (engine edit.rs `Change`). */
export interface Change { summary?: string; start?: string; end?: string; all_day?: boolean; location?: string; description?: string; rrule?: string; from_start?: string; calendar?: string; move_to?: string }

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
      case "agenda": return { from: cursor, to: addDays(cursor, 59) };
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
      const r = await call<{ events: Ev[] }>(this.atlas, "range", { from: ymd(from), to: ymd(to), sources: ids, notes: this.showNotes && !this.isHidden(NOTES, "Notes") }, 60);
      if (ask !== this.seq) return; // a newer range was asked meanwhile
      this.events = r.events;
      this.error = "";
    } catch (e) {
      if (ask === this.seq) this.error = (e as Error).message;
    } finally {
      if (ask === this.seq) this.loading = false;
    }
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

  setView(v: View) { this.view = v; store("view", v); this.results = null; void this.load(); }
  go(d: Date, v?: View) { this.cursor = startOfDay(d); if (v) this.setView(v); else void this.load(); }
  today() { this.go(new Date()); }
  step(dir: 1 | -1) {
    const c = this.cursor;
    const next = ({
      day: () => addDays(c, dir),
      week: () => addDays(c, 7 * dir),
      workweek: () => addDays(c, 7 * dir),
      month: () => addMonths(new Date(c.getFullYear(), c.getMonth(), 1), dir),
      agenda: () => addDays(c, 30 * dir),
      year: () => new Date(c.getFullYear() + dir, c.getMonth(), 1),
    } as Record<View, () => Date>)[this.shown()]();
    this.go(next);
  }

  title(narrowView: View = this.shown()): string {
    const { from, to } = this.range(narrowView);
    const c = this.cursor;
    if (narrowView === "day") return c.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
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

  toast(text: string, kind?: Toast["kind"], undo?: () => Promise<void>) {
    const id = Date.now() + Math.random();
    this.toasts = [...this.toasts.slice(-2), { id, text, kind, undo }];
    setTimeout(() => this.dismiss(id), undo ? 9000 : kind === "error" ? 12000 : 4000);
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
