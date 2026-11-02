// The page's own logic over the sources Atlas lists (atlas.libraries; their shapes are the plugin API's, ui/src/lib/
// plugin-api.ts): sorting, search, the group tree, the side's counts, and libraries of one subject made one page.
import type { LibraryEntry, LibraryItem, LibrarySource, LibraryTab } from "../../../../../ui/src/lib/plugin-api";

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
export function mergeSources(id: string, title: string, icon: string, parts: LibrarySource[]): LibrarySource {
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

/** A library as the page shows it: one of the vault's, or several of one subject made one (`members`: their ids,
 *  opening any of them opens it). */
export interface Shown extends LibraryEntry { members?: string[] }

const slug = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const subjectOf = (e: LibraryEntry) => e.subject ?? slug(e.title);
const mergedCache = new Map<string, Shown>();
/** Libraries of one subject made one, at the place of the first; the same merged entry while its members stay. */
export function bySubject(list: LibraryEntry[]): Shown[] {
  const groups = new Map<string, LibraryEntry[]>();
  for (const e of list) groups.set(subjectOf(e), [...(groups.get(subjectOf(e)) ?? []), e]);
  return [...groups].map(([s, parts]): Shown => {
    if (parts.length === 1) return parts[0];
    const key = parts.map((p) => p.id).join("\n");
    let m = mergedCache.get(key);
    if (!m || parts.some((p, i) => m!.members![i] !== p.id)) {
      const title = parts.find((p) => slug(p.title) === s)?.title ?? parts[0].title;
      const icon = parts[0].icon;
      m = { id: parts[0].id, title, icon, by: parts[0].by, subject: s, members: parts.map((p) => p.id),
        source: async () => mergeSources(parts[0].id, title, icon, await Promise.all(parts.map((p) => p.source()))) };
      mergedCache.set(key, m);
    }
    return m;
  });
}
