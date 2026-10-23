// A Bases query as plain rows: one object per note, `path` plus a value per column (under the
// column's id, its frontmatter key and its label). Used where data is wanted, not a table:
// expressions (`rows()`), the review block.
import { api } from "./api";
import type { BaseCell } from "./gen/BaseCell";

export type Row = { path: string } & Record<string, unknown>;

function cellValue(c: BaseCell | undefined): unknown {
  switch (c?.t) {
    case undefined: case "null": return null;
    case "bool": case "num": case "text": return c.value;
    case "link": case "date": return c.text;
    case "list": return c.items.map(cellValue);
  }
}

/** The rows of the first view of a Bases query (`this` in it is the note `thisPath`); throws its error. */
export async function queryRows(yaml: string, thisPath?: string): Promise<Row[]> {
  const r = await api.baseQuery(yaml, thisPath);
  if (r.error) throw new Error(r.error);
  const v = r.views[0];
  return (v?.rows ?? []).map((row) => Object.fromEntries([
    ...v.columns.flatMap((c, i) => [c.id, c.key, c.label].filter((k): k is string => !!k).map((k) => [k, cellValue(row.cells[i])])),
    ["path", row.path],
  ]) as Row);
}
