// A Bases view's rows gathered by its `groupBy` value (board lanes, the table's / cards' / list's groups): values in
// natural order, "No value" last; an ungrouped view is one group with no title.
import type { BaseRow } from "./gen/BaseRow";
import type { BaseView } from "./gen/BaseView";

export const NO_VALUE = "No value";

export function groupRows(view: BaseView): { title: string | null; rows: BaseRow[] }[] {
  if (!view.group_by) return [{ title: null, rows: view.rows }];
  const m = new Map<string, BaseRow[]>();
  for (const r of view.rows) {
    const g = r.group || NO_VALUE;
    if (!m.has(g)) m.set(g, []);
    m.get(g)!.push(r);
  }
  return [...m]
    .sort(([a], [b]) => (a === NO_VALUE ? 1 : b === NO_VALUE ? -1 : a.localeCompare(b, undefined, { numeric: true })))
    .map(([title, rows]) => ({ title, rows }));
}
