// One explorer tab's folder: where it is, the way back and forward, the entries and how the listing is going. The
// loading rules live here: the run's last listing is shown at once and refreshed behind, an answer older than the last
// click is dropped, a login is waited for. panes/Explorer.svelte only draws it (docs/refactor/REFACTOR-explorer.md).
import { basename } from "../paths";
import { ApiError } from "../api";
import { sourceOf, listings, listingKey, parentPath, why, type Entry, type Listed } from "../file-sources.svelte";

export type Loc = { source: string; place: string; path: string };
/** How the folder's listing stands: `nosource` = its plugin is not loaded (yet). */
export type Mode = "loading" | "ready" | "waiting" | "error" | "nosource";
export type Way = "back" | "fwd";

/** What the pane does on the browse's behalf. */
export interface BrowseHooks {
  /** A link that turned out to be a file: open it. */
  file(path: string): void;
  /** A refresh failed while the last listing stays: said to be old. */
  stale(text: string): void;
  /** A listing came: its place is connected. */
  shown(loc: Loc): void;
  /** Moved somewhere else: questions and edits of the folder left are dropped. */
  left(): void;
}

const same = (a: Loc, b: Loc) => a.source === b.source && a.place === b.place && a.path === b.path;
const RETRY_MS = 3000;

export class Browse {
  loc = $state<Loc>({ source: "", place: "", path: "" });
  history = $state<Record<Way, Loc[]>>({ back: [], fwd: [] });
  entries = $state<Entry[]>([]);
  mode = $state<Mode>("loading");
  /** Why it is waiting, or what went wrong. */
  note = $state("");
  refreshing = $state(false);
  /** The selected row, by name (a re-listing keeps it). */
  selName = $state<string | null>(null);

  #hooks: BrowseHooks;
  #seq = 0;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #gone = false;

  constructor(start: Loc, hooks: BrowseHooks) {
    this.loc = { ...start };
    this.#hooks = hooks;
  }

  async go(to: Loc, o: { keep?: string; record?: boolean } = {}): Promise<void> {
    clearTimeout(this.#retry);
    const prev = this.loc;
    if (o.record !== false && this.mode === "ready" && !same(to, prev)) this.history = { back: [...this.history.back, { ...prev }], fwd: [] };
    if (!same(to, prev)) this.#hooks.left(); // a refresh keeps a question still open (replace?)
    this.loc = { ...to };
    const s = sourceOf(to.source);
    if (!s) { this.mode = "nosource"; return; } // the pane goes again once the source is there
    const mine = ++this.#seq, key = listingKey(to.source, to.place, to.path), seen = listings.get(key);
    if (seen) { this.#show(seen, o.keep, prev); this.refreshing = true; }
    else if (same(to, prev) && this.mode === "ready") this.refreshing = true; // a refresh: the rows stay until the answer
    else this.mode = "loading";
    let r: Listed;
    try { r = await s.list(to.place, to.path); } catch (e) {
      if (this.#gone || mine !== this.#seq) return;
      this.refreshing = false;
      if (seen) return this.#hooks.stale(`Not refreshed: ${why(e)}`);
      this.mode = "error"; this.note = e instanceof ApiError && e.status === 404 ? `There is no folder “${to.path}” here.` : why(e); return;
    }
    if ("path" in r) for (const k of new Set([key, listingKey(to.source, to.place, r.path)])) listings.set(k, r);
    if (this.#gone || mine !== this.#seq) return;
    this.refreshing = false;
    if ("waiting" in r) {
      if (!seen) { this.mode = "waiting"; this.note = r.waiting; }
      this.#retry = setTimeout(() => void this.go(to, { ...o, record: false }), RETRY_MS);
      return;
    }
    if ("file" in r) { this.loc = prev; this.#hooks.file(r.file); return; }
    this.#show(r, o.keep ?? (seen ? this.selName ?? undefined : undefined), prev);
    if ("stale" in r && r.stale) void this.go(to, { ...o, record: false, keep: this.selName ?? undefined }); // the server's answer behind it
  }

  #show(r: { path: string; entries: Entry[] }, keep: string | undefined, prev: Loc): void {
    this.loc = { ...this.loc, path: r.path };
    this.entries = r.entries;
    this.mode = "ready";
    this.#hooks.shown(this.loc);
    // coming back up, the folder we were in is selected; otherwise the row asked for, or none (the first)
    const cameUp = prev.source === this.loc.source && prev.place === this.loc.place && prev.path && parentPath(prev.path) === r.path;
    this.selName = keep ?? (cameUp ? basename(prev.path) : null);
  }

  /** The folder read again (its cached listing dropped), the selection kept. */
  reload(keep?: string): Promise<void> {
    listings.delete(listingKey(this.loc.source, this.loc.place, this.loc.path));
    return this.go(this.loc, { keep: keep ?? this.selName ?? undefined, record: false });
  }

  up(): void {
    const p = parentPath(this.loc.path);
    if (p !== this.loc.path) void this.go({ ...this.loc, path: p });
  }
  get atTop(): boolean { return parentPath(this.loc.path) === this.loc.path; }

  travel(way: Way): void {
    const from = this.history[way], to = from.at(-1);
    if (!to) return;
    const other: Way = way === "back" ? "fwd" : "back";
    this.history = { [way]: from.slice(0, -1), [other]: [...this.history[other], { ...this.loc }] } as Record<Way, Loc[]>;
    void this.go(to, { record: false });
  }

  /** The tab closed: answers still on their way are dropped, the login no longer waited for. */
  dispose(): void { this.#gone = true; clearTimeout(this.#retry); }
  get gone(): boolean { return this.#gone; }
}
