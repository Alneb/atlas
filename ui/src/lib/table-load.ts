// A workspace table file → rows, for plugins (`atlas.table`): the Table pane's own reader (lib/csv/io.ts), so a plugin
// sees the same header, delimiter and columns the pane shows.
import { loadSheet } from "./csv/io";
import type { Table } from "./table";

export async function loadTable(path: string): Promise<Table> {
  const { sheet } = await loadSheet(path);
  return { header: sheet.header, rows: sheet.rows, numeric: sheet.numeric, delimiterName: sheet.delimiterName };
}
