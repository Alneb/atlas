// A table's saved views, kept in its companion note (`x.csv` → `x.md`) as one ```table-views``` block, so they are
// Markdown like every other piece of metadata and every device sees the same ones. One view a line, a JSON object
// with its name; columns are named by their header, so a view survives columns moved or added. Only the block is
// rewritten: the owner's text around it is never touched.

export interface TableView {
  name: string;
  /** the quick filter over every column */
  quick?: string;
  /** a column's filter (lib/csv/filter.ts syntax), by header name */
  filters?: Record<string, string>;
  sort?: { col: string; dir: 1 | -1 };
  /** header names hidden */
  hidden?: string[];
  /** the column the rows are grouped by, with sub-totals (lib/csv/group.ts) */
  group?: string;
}

const BLOCK = /(^|\n)```table-views[ \t]*\n([\s\S]*?)(?:^|\n)```[ \t]*(?=\n|$)/;

/** The views in a note, in the block's order; a line that is not a view is skipped. */
export function readViews(md: string): TableView[] {
  const m = BLOCK.exec(md);
  if (!m) return [];
  const out: TableView[] = [];
  for (const line of m[2].split("\n")) {
    try {
      const v = JSON.parse(line);
      if (v && typeof v === "object" && typeof v.name === "string" && v.name.trim()) out.push(clean(v));
    } catch { /* not a view: a blank or a hand-written line */ }
  }
  return out;
}

/** The note with its block holding `views` (added at the end when missing, removed when there are none). */
export function writeViews(md: string, views: TableView[]): string {
  const body = views.map((v) => JSON.stringify(clean(v))).join("\n");
  const block = "```table-views\n" + body + "\n```";
  const m = BLOCK.exec(md);
  if (m) {
    const start = m.index + m[1].length, end = m.index + m[0].length;
    if (!views.length) {
      const before = md.slice(0, start).replace(/\n+$/, ""), after = md.slice(end).replace(/^\n+/, "");
      return before && after ? `${before}\n\n${after}` : before ? `${before}\n` : after;
    }
    return md.slice(0, start) + block + md.slice(end);
  }
  if (!views.length) return md;
  return md.replace(/\s*$/, "") + (md.trim() ? "\n\n" : "") + block + "\n";
}

/** One view in words: `price <5 · sorted by price ▲ · notes hidden`. */
export function describeView(v: TableView): string {
  const parts = [
    ...(v.quick ? [`“${v.quick}” anywhere`] : []),
    ...Object.entries(v.filters ?? {}).map(([c, q]) => `${c} ${q}`),
    ...(v.sort ? [`sorted by ${v.sort.col} ${v.sort.dir === 1 ? "▲" : "▼"}`] : []),
    ...(v.group ? [`grouped by ${v.group}`] : []),
    ...(v.hidden?.length ? [`${v.hidden.join(", ")} hidden`] : []),
  ];
  return parts.join(" · ") || "every row, the file's order";
}

/** A view with its empty parts left out, so the note stays short. */
function clean(v: TableView): TableView {
  const out: TableView = { name: String(v.name).trim() };
  if (v.quick?.trim()) out.quick = v.quick;
  const f = Object.entries(v.filters ?? {}).filter(([, q]) => typeof q === "string" && q.trim());
  if (f.length) out.filters = Object.fromEntries(f);
  if (v.sort && typeof v.sort.col === "string" && (v.sort.dir === 1 || v.sort.dir === -1)) out.sort = { col: v.sort.col, dir: v.sort.dir };
  if (Array.isArray(v.hidden) && v.hidden.length) out.hidden = v.hidden.filter((h) => typeof h === "string");
  if (typeof v.group === "string" && v.group) out.group = v.group;
  return out;
}
