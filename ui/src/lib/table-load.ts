// A workspace table file → parsed rows. The text API caps files at 5 MB; run tables go past it, so
// large ones come through /api/raw. Shared by the Table pane and plugins (`atlas.table`).
import { api, ApiError } from "./api";
import { parseTable, type Table } from "./table";

export async function loadTable(path: string): Promise<Table> {
  const text = await api.file(path).then((f) => f.text, async (e) => {
    if (!(e instanceof ApiError && e.status === 413)) throw e;
    return (await api.raw(path)).text();
  });
  return parseTable(text, path);
}
