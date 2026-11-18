// The pane's state, one object every view reads (DESIGN-mail-ui §5): the accounts and folders, the list a view shows,
// the cursor and the checked rows, the conversation open, the composers, and the actions — optimistic (the list
// changes at once, the engine is asked behind), each one with an Undo and a rollback with the reason when it fails.
import { Steps } from "../../../../../ui/src/lib/pane-nav";
import { askYes, call, setting, snoozeTimes, type Account, type Draft, type Folder, type Moved, type PluginApi, type Row, type Thread } from "./api";

export type ViewName = "inbox" | "unimportant" | "starred" | "snoozed" | "drafts" | "sent" | "scheduled" | "attachments" | "folder" | "all";
export interface View { name: ViewName; account: string | null; folder: string | null; label: string }
/** Where the pane is, for Back / Forward: the folder or view, the search, the conversation open. */
export interface Place { view: View; query: string; open: number | null }
export type Quick = "" | "unread" | "starred" | "attachments" | "mentions";
export type Kind = "" | "person" | "newsletter" | "notification";
export interface Toast { id: number; text: string; kind: "info" | "error" | "success"; undo?: () => Promise<void>; action?: { label: string; run: () => void }; until: number }
export interface Composer { key: number; draft: Draft; inline: boolean; saving: boolean; savedAt: number | null; sending: boolean; error: string; dirty: boolean }

const PAGE = 100;

export class Mail {
  atlas: PluginApi;
  accounts = $state<Account[]>([]);
  own = $state<string[]>([]);
  folders = $state<Folder[]>([]);
  counts = $state<Record<string, { total: number; unread: number }>>({});
  view = $state<View>({ name: "inbox", account: null, folder: null, label: "Inbox" });
  query = $state("");
  quick = $state<Quick>("");
  kind = $state<Kind>("");
  rows = $state<Row[]>([]);
  total = $state(0);
  unread = $state(0);
  chips = $state<[string, string][]>([]);
  /** a search's order: the best matches first (relevance with recency, the engine's), or the newest first */
  byDate = $state(false);
  loading = $state(false);
  error = $state("");
  /** the row the keyboard is on (its message id) */
  cursor = $state<number | null>(null);
  /** checked conversations, by thread */
  checked = $state<number[]>([]);
  open = $state<Thread | null>(null);
  openId = $state<number | null>(null);
  reading = $state(false);
  readError = $state("");
  composers = $state<Composer[]>([]);
  toasts = $state<Toast[]>([]);
  undos: { label: string; run: () => Promise<void> }[] = [];
  private seq = 1;
  private loadSeq = 0;
  /** the list's end was reached (the total can count a Gmail conversation twice: it never says when to stop) */
  private ended = false;
  private fetchingMore = false;
  private asking = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** Back / Forward through the folders, searches and conversations visited (the app's Back asks it first) */
  steps = new Steps<Place>(() => this.place(), (p) => this.goTo(p));
  /** told after a step, for what the view keeps itself (the search box's text, the narrow layout's screen) */
  stepped: (p: Place) => void = () => {};

  constructor(atlas: PluginApi) {
    this.atlas = atlas;
  }

  place(): Place { return { view: { ...this.view }, query: this.query, open: this.openId }; }

  /** Back to a place: its list (read again only when it is another), then its conversation or none. */
  private goTo(p: Place) {
    const sameList = JSON.stringify(p.view) === JSON.stringify(this.view) && p.query === this.query;
    if (!sameList) {
      Object.assign(this, { view: p.view, query: p.query, quick: "", kind: "", checked: [], cursor: null });
      this.load();
    }
    if (p.open !== null) void this.read(p.open); else this.close();
    this.stepped(p);
  }

  call<T>(method: string, params: Record<string, unknown> = {}, timeout = 120) {
    return call<T>(this.atlas, method, params, timeout);
  }

  get split() { return setting(this.atlas, "split_inbox", false) && this.view.name === "inbox"; }

  // ----- loading

  async start() {
    try {
      const a = await this.call<{ accounts: Account[]; own: string[] }>("watch");
      this.accounts = a.accounts;
      this.own = a.own;
    } catch (e) { this.error = (e as Error).message; }
    await Promise.all([this.loadFolders(), this.load()]);
    this.loadCounts();
  }

  async loadAccounts() {
    try {
      const a = await this.call<{ accounts: Account[]; own: string[] }>("accounts");
      this.accounts = a.accounts;
      this.own = a.own;
    } catch { /* the list says the error */ }
  }
  async loadFolders() {
    try { this.folders = (await this.call<{ folders: Folder[] }>("folders")).folders; } catch { /* kept */ }
  }
  async loadCounts() {
    try { this.counts = await this.call<Record<string, { total: number; unread: number }>>("count"); } catch { /* kept */ }
  }

  private params(extra: Record<string, unknown> = {}) {
    const v = this.view;
    return {
      view: v.name === "folder" ? "" : v.name, account: v.account ?? "", folder: v.folder ?? "",
      query: this.query, quick: this.quick, kind: this.split ? this.kind || "person" : "", pin: this.pinning, by_date: this.byDate, ...extra,
    };
  }

  /** The inbox (no search, no filter) shows its important conversations first, in their own section. */
  get pinning() { return this.view.name === "inbox" && !this.query && !this.quick; }

  /** The list for the view, the search and the filters; `keep`: as many rows as now (a refresh, not a new view). */
  async load(keep = false) {
    const n = ++this.loadSeq;
    this.loading = true;
    try {
      const asked = keep ? Math.max(PAGE, this.rows.length) : PAGE;
      const r = await this.call<{ rows: Row[]; total: number; unread: number; chips: [string, string][] }>("list", this.params({ limit: asked }));
      if (n !== this.loadSeq) return; // a newer list was asked for meanwhile
      this.rows = r.rows;
      this.ended = r.rows.length < asked;
      this.total = r.total;
      this.unread = r.unread;
      this.chips = r.chips;
      this.error = "";
      if (this.cursor === null || !this.rows.some((x) => x.id === this.cursor)) this.cursor = this.rows[0]?.id ?? null;
      this.checked = this.checked.filter((t) => this.rows.some((x) => x.thread === t));
      this.fillSnippets();
    } catch (e) {
      if (n === this.loadSeq) this.error = (e as Error).message;
    } finally {
      if (n === this.loadSeq) this.loading = false;
    }
  }

  /** The next page, appended behind the scroll (no loading state shown: the rows already drawn stay as they are). */
  async more() {
    if (this.loading || this.fetchingMore || this.ended || this.rows.length >= this.total) return;
    this.fetchingMore = true;
    const n = this.loadSeq;
    try {
      const r = await this.call<{ rows: Row[] }>("list", this.params({ limit: PAGE, offset: this.rows.length }));
      if (n !== this.loadSeq) return;
      const have = new Set(this.rows.map((x) => x.thread));
      const fresh = r.rows.filter((x) => !have.has(x.thread));
      if (r.rows.length < PAGE || !fresh.length) this.ended = true;
      if (fresh.length) {
        this.rows = [...this.rows, ...fresh];
        this.fillSnippets();
      }
    } finally { this.fetchingMore = false; }
  }

  /** Rows whose message was never fetched get their snippet (the visible ones: the first page). */
  /** Snippets for rows whose message was never fetched: the given ones (those on screen), else the first. */
  async fillSnippets(rows: Row[] = this.rows) {
    const ids = rows.filter((r) => r.snippet_missing && !this.asking.has(r.id)).slice(0, 40).map((r) => r.id);
    if (!ids.length) return;
    for (const i of ids) this.asking.add(i);
    try {
      const got = await this.call<Record<string, { snippet: string; has_attachments: boolean }>>("snippets", { ids });
      for (const r of this.rows) {
        const g = got[String(r.id)];
        if (g) { r.snippet = g.snippet; r.has_attachments = g.has_attachments; r.snippet_missing = false; }
      }
    } catch { /* the rows stay without */ } finally { for (const i of ids) this.asking.delete(i); }
  }

  /** Something changed on a server (an event): the list, counts and folders again, once for a burst. */
  later(what: "list" | "all" = "all") {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.load(true);
      this.loadCounts();
      if (what === "all") { this.loadFolders(); this.loadAccounts(); }
    }, 250);
  }

  go(v: View) {
    const was = this.place();
    this.view = v;
    this.query = "";
    this.quick = "";
    this.kind = "";
    this.checked = [];
    this.cursor = null;
    this.steps.left(was);
    this.load();
  }

  search(q: string) {
    const was = this.place();
    this.query = q;
    // one step per search, not per letter typed: recorded on starting and on clearing one
    if (!was.query || !q) this.steps.left(was);
    this.load();
  }

  // ----- the cursor and the reader

  index(id: number | null = this.cursor) { return this.rows.findIndex((r) => r.id === id); }
  get current() { return this.rows.find((r) => r.id === this.cursor) ?? null; }

  move(by: number) {
    if (!this.rows.length) return;
    const i = Math.max(0, Math.min(this.rows.length - 1, this.index() + by));
    this.cursor = this.rows[i].id;
    if (i > this.rows.length - 10) this.more();
  }

  async read(id: number) {
    const was = this.place();
    this.cursor = id;
    this.openId = id;
    this.steps.left(was);
    // another conversation: the old one leaves the reader at once (the loading view shows), so Archive or Delete
    // pressed meanwhile never acts on one thing while another is on screen
    if (this.open && !this.open.messages.some((m) => m.id === id)) this.open = null;
    this.reading = true;
    this.readError = "";
    const row = this.rows.find((r) => r.id === id);
    if (row && row.unread) { row.unread = 0; this.unread = Math.max(0, this.unread - 1); }
    try {
      const t = await this.call<Thread>("thread", { id, read: true });
      if (this.openId === id) this.open = t;
    } catch (e) {
      if (this.openId === id) { this.readError = (e as Error).message; this.open = null; }
    } finally {
      if (this.openId === id) this.reading = false;
    }
  }

  close() { const was = this.place(); this.openId = null; this.open = null; this.steps.left(was); }

  // ----- what the actions act on: the checked conversations, else the open one, else the cursor's

  targets(): Row[] {
    if (this.checked.length) return this.rows.filter((r) => this.checked.includes(r.thread));
    const id = this.openId ?? this.cursor;
    const r = this.rows.find((x) => x.id === id);
    if (r) return [r];
    const last = this.open?.messages.at(-1);
    if (this.open && last) return [{ id: last.id, thread: this.open.thread, folder_role: last.folder_role } as Row];
    return [];
  }

  toggle(thread: number) {
    this.checked = this.checked.includes(thread) ? this.checked.filter((t) => t !== thread) : [...this.checked, thread];
  }
  /** Shift-click / Shift+j/k: every row between the cursor and this one checked. */
  extend(to: number) {
    const a = this.index(), b = this.rows.findIndex((r) => r.id === to);
    if (a < 0 || b < 0) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const add = this.rows.slice(lo, hi + 1).map((r) => r.thread);
    this.checked = [...new Set([...this.checked, ...add])];
    this.cursor = to;
  }
  selectWhere(f: "all" | "none" | "read" | "unread" | "starred") {
    const pick = { all: () => true, none: () => false, read: (r: Row) => !r.unread, unread: (r: Row) => r.unread > 0, starred: (r: Row) => r.flagged }[f];
    this.checked = this.rows.filter(pick).map((r) => r.thread);
  }

  // ----- feedback

  toast(text: string, kind: Toast["kind"] = "info", extra: Partial<Toast> = {}) {
    const t: Toast = { id: this.seq++, text, kind, until: Date.now() + (kind === "error" ? 9000 : 6000), ...extra };
    this.toasts = [...this.toasts.slice(-3), t];
    setTimeout(() => (this.toasts = this.toasts.filter((x) => x.id !== t.id)), t.until - Date.now());
    return t;
  }
  dismiss(id: number) { this.toasts = this.toasts.filter((x) => x.id !== id); }

  async undo() {
    const u = this.undos.pop();
    if (!u) { this.toast("Nothing to undo"); return; }
    try {
      await u.run();
      this.toast(`Undone: ${u.label}`, "success");
    } catch (e) { this.toast(`Could not undo: ${(e as Error).message}`, "error"); }
    this.later();
  }

  // ----- actions

  /** Rows leave the list at once (archive, trash, move, snooze); the next one opens if one was open; back on failure. */
  private async leave(rows: Row[], label: string, run: (ids: number[]) => Promise<{ moved: Moved[] }>) {
    if (!rows.length) return;
    const ids = rows.map((r) => r.id);
    const threads = new Set(rows.map((r) => r.thread));
    const before = { rows: this.rows, total: this.total, cursor: this.cursor, seq: this.loadSeq };
    const at = Math.max(0, this.index(rows[0].id));
    const wasOpen = this.openId !== null && rows.some((r) => r.id === this.openId || r.thread === this.open?.thread);
    this.rows = this.rows.filter((r) => !threads.has(r.thread));
    this.total = Math.max(0, this.total - rows.length);
    this.checked = [];
    const next = this.rows[Math.min(at, this.rows.length - 1)] ?? null;
    this.cursor = next?.id ?? null;
    if (wasOpen) {
      // the pane moves by itself: no step back to a conversation that left the list
      this.steps.unrecorded(() => { if (next && setting(this.atlas, "after_action", "next") === "next") this.read(next.id); else this.close(); });
    }
    try {
      const r = await run(ids);
      const moved = r.moved ?? [];
      const n = rows.length;
      const undo = async () => { await this.call("undo", { moved }); };
      if (moved.length) this.undos.push({ label: `${label} ${n === 1 ? "conversation" : `${n} conversations`}`, run: undo });
      this.toast(`${label} ${n === 1 ? "1 conversation" : `${n} conversations`}`, "info", moved.length ? { undo: async () => { this.undos = this.undos.filter((u) => u.run !== undo); await undo(); this.later(); } } : {});
      this.loadCounts();
    } catch (e) {
      // the list asked for since (another folder, a refresh) is not put back under the old rows: read it again
      if (before.seq === this.loadSeq) { this.rows = before.rows; this.total = before.total; this.cursor = before.cursor; }
      else void this.load(true);
      this.toast(`${label} failed: ${(e as Error).message}`, "error");
    }
  }

  archive(rows = this.targets()) { return this.leave(rows, "Archived", (ids) => this.call("archive", { ids })); }
  async trash(rows = this.targets()) {
    const inTrash = rows.every((r) => r.folder_role === "trash");
    if (inTrash && !(await askYes(this.atlas, `Delete ${rows.length === 1 ? "this conversation" : `${rows.length} conversations`} for good? This cannot be undone.`, { ok: "Delete for good", danger: true }))) return;
    return this.leave(rows, inTrash ? "Deleted" : "Moved to Trash", (ids) => this.call("trash", { ids }));
  }
  /** One message of the open conversation to Trash (a draft too), the rest of the conversation staying; with Undo.
   *  The last message going takes the conversation with it, as the conversation's own Delete does. */
  async trashMessage(id: number) {
    const t = this.open;
    if (!t) return;
    if (t.messages.length === 1) {
      // the conversation's last message takes the conversation, listed or not (opened from a note, hidden by a search)
      const row = this.rows.find((r) => r.thread === t.thread) ?? ({ id, thread: t.thread, folder_role: t.messages[0].folder_role } as Row);
      return this.trash([row]);
    }
    const msg = t.messages.find((m) => m.id === id);
    const what = msg?.draft ? "Draft" : "Message";
    t.messages = t.messages.filter((m) => m.id !== id);
    try {
      const r = await this.call<{ moved?: unknown[] }>("trash", { ids: [id], conversation: false });
      const moved = r.moved ?? [];
      const undo = async () => { await this.call("undo", { moved }); };
      if (moved.length) this.undos.push({ label: `${what} to Trash`, run: undo });
      this.toast(moved.length ? `${what} moved to Trash` : `${what} deleted`, "info", moved.length ? { undo: async () => { this.undos = this.undos.filter((u) => u.run !== undo); await undo(); this.later(); if (this.open?.thread === t.thread) this.read(this.cursor ?? id); } } : {});
      this.later();
      this.loadCounts();
    } catch (e) {
      if (msg && this.open?.thread === t.thread) this.open.messages = [...this.open.messages, msg].sort((a, b) => a.date - b.date);
      this.toast(`Could not delete it: ${(e as Error).message}`, "error");
    }
  }

  spam(rows = this.targets()) {
    const isSpam = rows.every((r) => r.folder_role === "junk");
    return this.leave(rows, isSpam ? "Not spam:" : "Spam:", (ids) => this.call(isSpam ? "not_spam" : "spam", { ids }));
  }
  moveTo(path: string, label: string, rows = this.targets()) { return this.leave(rows, `Moved to ${label}:`, (ids) => this.call("move", { ids, to: path })); }
  moveRole(role: string, label: string, rows = this.targets()) { return this.leave(rows, `Moved to ${label}:`, (ids) => this.call("move", { ids, role })); }
  snooze(at: number, rows = this.targets()) {
    const when = new Date(at * 1000).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", hourCycle: "h23", minute: "2-digit" });
    return this.leave(rows, `Snoozed until ${when}:`, (ids) => this.call("snooze", { ids, until: at }));
  }
  unsnooze(rows = this.targets()) { return this.leave(rows, "Back in the inbox:", (ids) => this.call("unsnooze", { ids })); }
  snoozeDefault() { return this.snooze(snoozeTimes()[0].at); }

  /** Flags change in place: read / unread, star. */
  async mark(what: "read" | "starred", on: boolean, rows = this.targets()) {
    if (!rows.length) return;
    const before = rows.map((r) => ({ r, unread: r.unread, flagged: r.flagged }));
    for (const r of rows) {
      if (what === "read") r.unread = on ? 0 : Math.max(1, r.unread);
      else r.flagged = on;
    }
    if (this.open && rows.some((r) => r.thread === this.open!.thread)) {
      const last = this.open.messages.at(-1);
      for (const m of this.open.messages) {
        if (what === "read") m.seen = on;
        else if (!on || m === last) m.flagged = on;
      }
    }
    try {
      await this.call("mark", { ids: rows.map((r) => r.id), [what]: on });
      const label = what === "read" ? (on ? "Marked read" : "Marked unread") : on ? "Starred" : "Unstarred";
      this.undos.push({ label, run: async () => { await this.call("mark", { ids: rows.map((r) => r.id), [what]: !on }); } });
      this.loadCounts();
    } catch (e) {
      for (const b of before) { b.r.unread = b.unread; b.r.flagged = b.flagged; }
      this.toast(`Could not change it: ${(e as Error).message}`, "error");
    }
  }
  toggleRead(rows = this.targets()) { return this.mark("read", rows.some((r) => r.unread > 0), rows); }
  toggleStar(rows = this.targets()) { return this.mark("starred", !rows.some((r) => r.flagged), rows); }

  async label(add: string[], remove: string[], rows = this.targets()) {
    try {
      await this.call("label", { ids: rows.map((r) => r.id), add, remove });
      for (const r of rows) r.labels = [...new Set([...r.labels.filter((l) => !remove.includes(l)), ...add])].sort();
      this.undos.push({ label: "Labels", run: async () => { await this.call("label", { ids: rows.map((r) => r.id), add: remove, remove: add }); } });
    } catch (e) { this.toast(`Could not label: ${(e as Error).message}`, "error"); }
  }

  async importance(important: boolean | null, rows = this.targets()) {
    for (const r of rows) {
      try {
        await this.call("set_importance", { id: r.id, account: r.account, important: !!important, clear: important === null });
      } catch (e) { this.toast(`Could not mark it: ${(e as Error).message}`, "error"); return; }
    }
    this.toast(important ? "Marked important" : important === null ? "Importance cleared" : "Moved to Not important");
    this.later();
  }

  async saveNote(thread = this.open?.thread ?? this.targets()[0]?.thread) {
    if (thread === undefined) return;
    try {
      const r = await this.call<{ path: string }>("save_note", { thread });
      if (this.open?.thread === thread) this.open.saved = r.path;
      const row = this.rows.find((x) => x.thread === thread);
      if (row) row.saved = r.path;
      this.toast("Saved as a note", "success", { action: { label: "Open", run: () => this.atlas.open(r.path, undefined, { beside: true }) } });
    } catch (e) { this.toast(`Could not save it: ${(e as Error).message}`, "error"); }
  }

  /** The open conversation as a note (saved first when it is not yet): what a link to the mail points at. */
  private async noteOfOpen(): Promise<string | null> {
    const t = this.open;
    if (!t) return null;
    if (t.saved) return t.saved;
    await this.saveNote(t.thread);
    return this.open?.thread === t.thread ? this.open.saved ?? null : null;
  }

  /** "Link to an event…": the conversation's note into an event's `links:` — the Calendar's chooser does the rest
   *  (it listens for `atlas-calendar:link`; without the Calendar plugin a toast says so). */
  async linkToEvent() {
    const link = await this.noteOfOpen();
    if (!link) return;
    let heard = false;
    const ack = () => (heard = true);
    window.addEventListener("atlas-calendar:heard", ack, { once: true });
    window.dispatchEvent(new CustomEvent("atlas-calendar:link", { detail: { link, ack: true } }));
    setTimeout(() => { window.removeEventListener("atlas-calendar:heard", ack); if (!heard) this.toast("No Calendar plugin to link the event in: turn it on in Settings → Plugins.", "error"); }, 400);
  }

  /** "Link to a note…": any note — a mail saved as a note too — picked in the palette goes into the `links:` of this
   *  conversation's note (Email's own note, saved first; re-saving keeps the property), the way an event's note keeps
   *  its links. The user's notes are not written: the target shows the mail as a backlink. */
  async linkToNote() {
    const t = this.open;
    if (!t) return;
    if (!this.atlas.pickNote) { this.toast("Linking needs a newer Atlas: copy the link instead.", "error"); return void this.copyLink(); }
    const target = await this.atlas.pickNote({ placeholder: `Link “${t.subject || "this mail"}” to which note or mail?`, tag: "Link to a note" });
    if (!target) return;
    const note = await this.noteOfOpen();
    if (!note) return;
    if (target === note) { this.toast("That is this conversation's own note", "error"); return; }
    try {
      const props = await this.atlas.noteProps(note);
      const links = (Array.isArray(props.links) ? props.links : props.links ? [props.links] : []).map(String);
      const link = `[[${target.replace(/\.md$/i, "")}]]`;
      if (links.some((l) => l.replace(/\|.*\]\]$/, "]]") === link)) { this.toast("Already linked", "success"); return; }
      await this.atlas.writeProperty(note, "links", [...links, link]);
      this.toast(`Linked to ${target.split("/").pop()?.replace(/\.md$/i, "")}`, "success", { action: { label: "Open", run: () => void this.openLinked(target) } });
      void this.loadLinked();
    } catch (e) { this.toast(`Could not link it: ${(e as Error).message}`, "error"); }
  }

  /** A linked note opened: a mail's note opens as the mail in this pane (its conversation), any other note beside. */
  async openLinked(path: string, line?: number) {
    const props = await this.atlas.noteProps(path).catch(() => ({} as Record<string, unknown>));
    if (isMailNote(props)) {
      try {
        const r = await this.call<{ id: number | null }>("find", { message_id: props.message_id, account: props.account });
        if (r.id) { await this.read(r.id); return; }
      } catch { /* not in the index: the note is what is left of it */ }
    }
    this.atlas.open(path, line, { beside: true });
  }

  /** The open conversation's links both ways: what its note links to (`links:`, set by Link) and the notes and events
   *  that link to it (the core's link index). Empty for a conversation never saved (nothing can link to it yet). */
  linked = $state<Linked[]>([]);
  async loadLinked() {
    const t = this.open;
    const note = t?.saved;
    if (!t || !note || !this.atlas.backlinks) { this.linked = []; return; }
    try {
      const [props, back] = await Promise.all([this.atlas.noteProps(note), this.atlas.backlinks(note)]);
      const out = (Array.isArray(props.links) ? props.links : props.links ? [props.links] : []).map(String)
        .map((l) => /^\[\[([^\]|#]+)/.exec(l)?.[1]).filter((x): x is string => !!x).map((x) => (/\.\w+$/.test(x) ? x : `${x}.md`));
      const seen = new Set<string>([note]);
      const rows = [...out.map((source) => ({ source, line: 0, context: "", to: true })), ...back.map((b) => ({ ...b, to: false }))]
        .filter((r) => !seen.has(r.source) && seen.add(r.source)).slice(0, 16);
      const kinds = await Promise.all(rows.map(async (r) => {
        const p = await this.atlas.noteProps(r.source).catch(() => ({} as Record<string, unknown>));
        const kind: Linked["kind"] = p.type === "event" ? "event" : isMailNote(p) ? "mail" : "note";
        return { ...r, kind };
      }));
      if (this.open?.thread === t.thread) this.linked = kinds;
    } catch { if (this.open?.thread === t.thread) this.linked = []; }
  }

  /** "Copy a link": `[[the conversation's note]]`, to paste in any note (the note saved first). */
  async copyLink() {
    const path = await this.noteOfOpen();
    if (!path) return;
    const link = `[[${path.replace(/\.md$/i, "")}]]`;
    try { await navigator.clipboard.writeText(link); this.toast(`Copied ${link} — paste it in a note`, "success"); }
    catch { this.toast(`Copy it by hand: ${link}`, "error"); }
  }

  // ----- composing

  compose(d: Partial<Draft> = {}, inline = false) {
    const account = d.account ?? this.view.account ?? this.accounts.find((a) => a.main)?.name ?? this.accounts[0]?.name ?? "";
    const draft: Draft = { account, from: "", to: "", cc: "", bcc: "", subject: "", body: "", reply_to: null, forward: null, files: [], draft: null, send_at: null, ...d };
    // one inline reply per conversation: a second r goes to the one there
    if (inline) this.composers = this.composers.filter((c) => !c.inline);
    const c: Composer = { key: this.seq++, draft, inline, saving: false, savedAt: null, sending: false, error: "", dirty: false };
    this.composers = [...this.composers, c];
    return c;
  }

  /** A meeting about the open conversation: the Calendar's new-event dialog with its subject and everyone in it but
   *  the user (the Calendar listens for `atlas-calendar:new`; with no Calendar plugin nothing opens, said in a toast). */
  meeting() {
    const t = this.open;
    if (!t) return;
    const own = new Set(this.own.map((a) => a.toLowerCase()));
    const seen = new Set<string>();
    const guests = t.messages.flatMap((m) => [...m.from, ...m.to, ...m.cc]).map((p) => p.addr).filter((a) => {
      const k = a.toLowerCase();
      if (!a.includes("@") || own.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const title = t.subject.replace(/^((re|fwd?|tr|aw|wg)\s*:\s*)+/i, "").trim();
    let heard = false;
    const ack = () => (heard = true);
    window.addEventListener("atlas-calendar:heard", ack, { once: true });
    window.dispatchEvent(new CustomEvent("atlas-calendar:new", { detail: { title, guests, ack: true } }));
    setTimeout(() => { window.removeEventListener("atlas-calendar:heard", ack); if (!heard) this.toast("No Calendar plugin to make the meeting in: turn it on in Settings → Plugins.", "error"); }, 400);
  }

  async reply(mode: "reply" | "all" | "forward", id = this.open?.messages.at(-1)?.id ?? this.cursor, inline = false) {
    if (!id) return;
    try {
      const d = await this.call<Partial<Draft>>("compose_for", { id, mode });
      this.compose(d, inline);
    } catch (e) { this.toast(`Cannot ${mode === "forward" ? "forward" : "reply"}: ${(e as Error).message}`, "error"); }
  }

  async editDraft(id: number) {
    try {
      const d = await this.call<Partial<Draft>>("open_draft", { id });
      this.compose(d, false);
    } catch (e) { this.toast(`Cannot open the draft: ${(e as Error).message}`, "error"); }
  }

  closeComposer(key: number) { this.composers = this.composers.filter((c) => c.key !== key); }
}

/** A note linked with the open conversation: `to` when its note links there, else it links to the mail. */
export type Linked = { source: string; line: number; context: string; to: boolean; kind: "note" | "event" | "mail" };

/** A note Email saved a conversation (or one message) as: opened as the mail, not as the note. */
export function isMailNote(props: Record<string, unknown>): props is Record<string, unknown> & { message_id: string; account: string } {
  return (props.type === "email-thread" || props.type === "email") && typeof props.message_id === "string";
}
