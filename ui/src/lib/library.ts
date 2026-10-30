// One library page, many libraries (docs/refactor/REFACTOR-libraries.md). A source says what
// its items are and what can be done with one; components/library/Library.svelte draws every source the same way:
// search, sort, tabs, groups and tags at the side, a list or covers, the selected item at the right.

import type { IconName } from "./panes";

/** One thing in a library: a reference, a film, an album. Its `id` is stable (a citekey, a note's path). */
export interface LibraryItem {
  id: string;
  /** May hold inline markup (`$x^2$`, `<i>`): drawn with richTitle. */
  title: string;
  /** The line under the title: authors · year · venue, director · year. */
  sub?: string;
  /** A picture: a vault path or an address, or found later (the catalog's fallback to a note's first picture). */
  cover?: string | (() => Promise<string | null>);
  flags?: { label: string; tone?: "red" }[];
  /** The source's tab it is in (`tabs`). */
  tab?: string;
  /** Collections or shelves. */
  groups?: string[];
  tags?: string[];
  /** What search looks in (lower-cased by the page). */
  text: string;
  /** Values by the source's sort ids. */
  sort: Record<string, string | number>;
  /** The vault file the item is (its note, the drawing): the links to it shown under its card, as under a note. */
  note?: string;
}

/** Something to do with an item: a button in its detail (or a header tool). */
export type LibraryAction = {
  label: string;
  icon?: IconName;
  title?: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
} & (
  | { run: () => unknown }
  /** Asks first (a delete). */
  | { confirm: { title: string; hint?: string; button: string }; run: () => unknown }
  /** Opens a form of the item's fields in the detail. */
  | { edit: LibraryForm }
);

export interface LibraryForm {
  fields: { key: string; label: string; hint?: string; value: string; rows?: number; half?: boolean }[];
  save(values: Record<string, string>): Promise<void>;
}

/** The right-hand pane for the selected item. */
export interface LibraryDetail {
  /** A small line above the title (the item's type, its year). */
  kind?: string;
  title: string;
  /** Lines under the title; `muted` ones in italics (a venue). */
  lines?: { text: string; muted?: boolean }[];
  /** Label / value pairs (a kind's key fields). */
  fields?: [string, string][];
  actions: LibraryAction[];
  links?: { label: string; url: string }[];
  /** A longer text under its own heading (an abstract, a synopsis). */
  body?: { title: string; text: string };
  /** One of a few values, changed in place: a film's shelf (to watch, watched…). */
  choice?: { label: string; options: { label: string; on: boolean; run: () => unknown }[] };
}

export interface LibraryTab { id: string; title: string; always?: boolean }

export interface LibrarySource {
  id: string;
  title: string;
  icon: IconName;
  /** "references": the side's "All references", the empty text. */
  noun: string;
  /** What it is a library of, when its title does not say (lib/libraries.svelte.ts): same-subject libraries show as one. */
  subject?: string;
  load(): Promise<LibraryItem[]>;
  /** Tabs above the list, shown when more than one holds items; a function is asked after each load (the catalog's
   *  kinds are known only then). `always`: shown empty too — a kind of thing the library can hold, its first one added
   *  from there (the catalog's Manga and Anime with no note yet). */
  tabs?: LibraryTab[] | (() => LibraryTab[]);
  /** The side's heading over the groups ("Collections", "Shelves"). */
  groupsTitle?: string;
  /** Groups listed first, in this order, and shown even when empty (a kind's shelves, a place to drop onto). */
  groupOrder?: string[];
  /** Items dragged onto a group at the side go there (a film to another shelf); the page loads again after. */
  regroup?(items: LibraryItem[], group: string): Promise<void>;
  /** How items are drawn; the first is the default, more than one gives a switch. */
  layouts: ("list" | "covers")[];
  /** Sort orders; the first is the default. `desc`: biggest / newest first. */
  sorts: { id: string; label: string; desc?: boolean }[];
  /** The search box's placeholder. */
  search: string;
  /** Shown when the library is empty. */
  empty: string;
  /** Async when it reads more than the item holds (the catalog's service links, from the note's properties). */
  detail(item: LibraryItem): LibraryDetail | Promise<LibraryDetail>;
  /** The add box: an identifier typed in; resolves to the new item's id, to select it. */
  add?: { placeholder: string; busy: string; run(text: string): Promise<string | void> };
  /** Files dropped on the page; resolves to the last new item's id. */
  drop?: { hint: string; accept: RegExp; run(files: File[]): Promise<string | void> };
  /** Buttons in the header that are not about one item (a sync); asked once when the page opens. */
  tools?(): Promise<LibraryAction[]>;
  /** Calls `reload` when the source's files change; returns the unsubscribe. */
  watch?(reload: () => void): () => void;
  /** Single keys on the selected item (j/k and arrows move, built in). */
  keys?: Record<string, (item: LibraryItem) => void>;
  /** Double click / Enter. */
  open?(item: LibraryItem): void;
  /** What can be done with several picked items (dragged over, Ctrl/Shift-clicked); "Open each" is offered with `open`. */
  many?(items: LibraryItem[]): LibraryAction[];
}

/** Sorts by one of the source's orders: numbers as numbers, text by locale; ties by id, so the order is stable. */
export function sortItems(items: LibraryItem[], by: { id: string; desc?: boolean }): LibraryItem[] {
  const val = (i: LibraryItem) => i.sort[by.id] ?? "";
  return [...items].sort((a, b) => {
    const x = val(a), y = val(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
    return (by.desc ? -c : c) || a.id.localeCompare(b.id);
  });
}

/** The words of `q` all in the item's text. */
export function matches(item: LibraryItem, q: string): boolean {
  const hay = item.text.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** A group named as a path (`Server › Books › QFT`): the side shows such groups as a folder tree. */
export const GROUP_SEP = " › ";
export const inGroup = (groups: string[] | undefined, name: string): boolean => (groups ?? []).some((g) => g === name || g.startsWith(name + GROUP_SEP));
export interface GroupRow { path: string; name: string; depth: number; count: number; kids: boolean }
/** The rows of the group tree: every folder on the way, counting what is in it and below; only the children of open
 *  folders listed. */
export function groupTree(groups: [string, number][], open: ReadonlySet<string>): GroupRow[] {
  const nodes = new Map<string, GroupRow>();
  for (const [g, c] of groups) {
    const parts = g.split(GROUP_SEP);
    parts.forEach((name, d) => {
      const path = parts.slice(0, d + 1).join(GROUP_SEP);
      const n = nodes.get(path) ?? { path, name, depth: d, count: 0, kids: false };
      n.count += c;
      if (d < parts.length - 1) n.kids = true;
      nodes.set(path, n);
    });
  }
  const rows = [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path));
  return rows.filter((r) => { const parts = r.path.split(GROUP_SEP); return parts.slice(0, -1).every((_, d) => open.has(parts.slice(0, d + 1).join(GROUP_SEP))); });
}

/** Counts by name, alphabetical: the side's groups and tags. `first`: names put before the rest, in their order, kept
 *  at 0 when nothing is in them. */
export function counted(items: LibraryItem[], pick: (i: LibraryItem) => string[] | undefined, first: string[] = []): [string, number][] {
  const n = new Map<string, number>();
  for (const i of items) for (const x of pick(i) ?? []) n.set(x, (n.get(x) ?? 0) + 1);
  const rest = [...n].filter(([x]) => !first.includes(x)).sort((a, b) => a[0].localeCompare(b[0]));
  return [...first.map((x): [string, number] => [x, n.get(x) ?? 0]), ...rest];
}

/** One library made of several sources about the same thing (the catalog's book notes and the e-books read here): each
 *  source's tabs become tabs of the one page (a source without tabs, one tab under its own title), its items keep
 *  their own detail, opening and moving; what is about the page (add, drop, tools) comes from the sources that have it. */
export function mergeSources(id: string, title: string, icon: IconName, parts: LibrarySource[]): LibrarySource {
  const own = new Map<string, { part: LibrarySource; item: LibraryItem }>();
  const sep = "␟";
  const owner = (item: LibraryItem) => own.get(item.id);
  const declared = (p: LibrarySource) => (typeof p.tabs === "function" ? p.tabs() : p.tabs) ?? [];
  const tabsOf = (p: LibrarySource, i: number): LibraryTab[] => {
    const t = declared(p);
    return t.length ? t.map((x) => ({ ...x, id: `${i}${sep}${x.id}` })) : [{ id: `${i}${sep}`, title: p.title }];
  };
  const byPart = (items: LibraryItem[]) => {
    const m = new Map<LibrarySource, LibraryItem[]>();
    for (const it of items) { const o = owner(it); if (o) m.set(o.part, [...(m.get(o.part) ?? []), o.item]); }
    return m;
  };
  const union = <T>(xs: T[][], key: (x: T) => string) => { const seen = new Set<string>(); return xs.flat().filter((x) => !seen.has(key(x)) && !!seen.add(key(x))); };
  const with_ = <K extends keyof LibrarySource>(k: K) => parts.find((p) => p[k]);
  return {
    id, title, icon,
    noun: parts[0].noun,
    async load() {
      own.clear();
      const lists = await Promise.all(parts.map((p) => p.load().catch(() => [] as LibraryItem[])));
      return lists.flatMap((items, i) => items.map((item) => {
        const merged = { ...item, id: `${i}${sep}${item.id}`, tab: `${i}${sep}${declared(parts[i]).length ? item.tab ?? "" : ""}` };
        own.set(merged.id, { part: parts[i], item });
        return merged;
      }));
    },
    tabs: () => parts.flatMap(tabsOf),
    groupsTitle: parts.map((p) => p.groupsTitle).find(Boolean),
    groupOrder: union(parts.map((p) => p.groupOrder ?? []), (x) => x),
    regroup: parts.some((p) => p.regroup) ? async (items, group) => { for (const [p, xs] of byPart(items)) await p.regroup?.(xs, group); } : undefined,
    layouts: union(parts.map((p) => p.layouts), (x) => x),
    sorts: union(parts.map((p) => p.sorts), (s) => s.id),
    search: parts[0].search,
    empty: parts.map((p) => p.empty).join(" "),
    detail: (item) => { const o = owner(item); return o ? o.part.detail(o.item) : { title: item.title, actions: [] }; },
    add: with_("add")?.add,
    drop: with_("drop")?.drop,
    tools: parts.some((p) => p.tools) ? async () => (await Promise.all(parts.map((p) => p.tools?.() ?? []))).flat() : undefined,
    watch: (reload) => { const offs = parts.map((p) => p.watch?.(reload)); return () => offs.forEach((f) => f?.()); },
    keys: Object.assign({}, ...parts.map((p) => Object.fromEntries(Object.entries(p.keys ?? {}).map(([k, run]) => [k, (item: LibraryItem) => { const o = owner(item); if (o?.part === p) run(o.item); }])))),
    open: (item) => { const o = owner(item); o?.part.open?.(o.item); },
    many: (items) => { const m = byPart(items); if (m.size !== 1) return []; const [[p, xs]] = [...m]; return p.many?.(xs) ?? []; },
  };
}
