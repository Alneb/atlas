// The pane's state, one object every view reads (DESIGN-mail-ui §5): the accounts and folders, the list a view shows,
// the cursor and the checked rows, the conversation open, the composers, and the actions — optimistic (the list
// changes at once, the engine is asked behind), each one with an Undo and a rollback with the reason when it fails.
import { call, setting, snoozeTimes, type Account, type Draft, type Folder, type Moved, type PluginApi, type Row, type Thread } from "./api";

export type ViewName = "inbox" | "unimportant" | "starred" | "snoozed" | "drafts" | "sent" | "scheduled" | "attachments" | "folder" | "all";
export interface View { name: ViewName; account: string | null; folder: string | null; label: string }
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

  constructor(atlas: PluginApi) {
    this.atlas = atlas;
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
      query: this.query, quick: this.quick, kind: this.split ? this.kind || "person" : "", pin: this.pinning, ...extra,
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
    this.view = v;
    this.query = "";
    this.quick = "";
    this.kind = "";
    this.checked = [];
    this.cursor = null;
    this.load();
  }

  search(q: string) {
    this.query = q;
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
    this.cursor = id;
    this.openId = id;
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

  close() { this.openId = null; this.open = null; }

  // ----- what the actions act on: the checked conversations, else the open one, else the cursor's

  targets(): Row[] {
    if (this.checked.length) return this.rows.filter((r) => this.checked.includes(r.thread));
    const id = this.openId ?? this.cursor;
    const r = this.rows.find((x) => x.id === id);
    if (r) return [r];
    if (this.open) return [{ id: this.open.messages.at(-1)!.id, thread: this.open.thread } as Row];
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
    const before = this.rows;
    const at = Math.max(0, this.index(rows[0].id));
    const wasOpen = this.openId !== null && rows.some((r) => r.id === this.openId || r.thread === this.open?.thread);
    this.rows = this.rows.filter((r) => !threads.has(r.thread));
    this.total = Math.max(0, this.total - rows.length);
    this.checked = [];
    const next = this.rows[Math.min(at, this.rows.length - 1)] ?? null;
    this.cursor = next?.id ?? null;
    if (wasOpen) {
      if (next && setting(this.atlas, "after_action", "next") === "next") this.read(next.id);
      else this.close();
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
      this.rows = before;
      this.toast(`${label} failed: ${(e as Error).message}`, "error");
    }
  }

  archive(rows = this.targets()) { return this.leave(rows, "Archived", (ids) => this.call("archive", { ids })); }
  trash(rows = this.targets()) {
    const inTrash = rows.every((r) => r.folder_role === "trash");
    if (inTrash && !confirm(`Delete ${rows.length === 1 ? "this conversation" : `${rows.length} conversations`} for good? This cannot be undone.`)) return;
    return this.leave(rows, inTrash ? "Deleted" : "Moved to Trash", (ids) => this.call("trash", { ids }));
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

  async reply(mode: "reply" | "all" | "forward", id = this.open?.messages.at(-1)?.id ?? this.cursor, inline = true) {
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
