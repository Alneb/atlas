// Parses a table off the page's thread: a run's output can be 100 MB, which would freeze the window for seconds.
// The rows go back in slices: one message of 600 000 rows took the page a whole second to decode (one frozen frame);
// slices of CHUNK rows cost a few ms each, and the page stays responsive between them.
import { parseSheet } from "./parse";
import { readXlsx } from "./xlsx";

const CHUNK = 20_000;

self.onmessage = async (e: MessageEvent<{ bytes: ArrayBuffer; path: string }>) => {
  // an Excel workbook: every sheet, whole (a sheet's rows are what a person types, not a run's output)
  if (/\.xlsx$/i.test(e.data.path)) {
    try { self.postMessage({ sheets: (await readXlsx(e.data.bytes)).map((s) => ({ name: s.name, rows: s.rows, formulas: [...s.formulas] })) }); }
    catch (err) { self.postMessage({ error: String((err as Error)?.message ?? err) }); }
    return;
  }
  try {
    const text = new TextDecoder().decode(e.data.bytes);
    const sheet = parseSheet(text, e.data.path, (done) => self.postMessage({ progress: done }));
    for (let i = 0; i < sheet.rows.length; i += CHUNK) self.postMessage({ rows: sheet.rows.slice(i, i + CHUNK), raw: sheet.raw.slice(i, i + CHUNK) });
    self.postMessage({ sheet: { ...sheet, rows: [], raw: [] } });
  } catch (err) {
    self.postMessage({ error: String((err as Error)?.message ?? err) });
  }
};
