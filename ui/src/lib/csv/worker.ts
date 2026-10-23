// Parses a table off the page's thread: a run's output can be 100 MB, which would freeze the window for seconds.
// The rows go back in slices: one message of 600 000 rows took the page a whole second to decode (one frozen frame);
// slices of CHUNK rows cost a few ms each, and the page stays responsive between them.
import { parseSheet } from "./parse";

const CHUNK = 20_000;

self.onmessage = (e: MessageEvent<{ bytes: ArrayBuffer; path: string }>) => {
  try {
    const text = new TextDecoder().decode(e.data.bytes);
    const sheet = parseSheet(text, e.data.path, (done) => self.postMessage({ progress: done }));
    for (let i = 0; i < sheet.rows.length; i += CHUNK) self.postMessage({ rows: sheet.rows.slice(i, i + CHUNK), raw: sheet.raw.slice(i, i + CHUNK) });
    self.postMessage({ sheet: { ...sheet, rows: [], raw: [] } });
  } catch (err) {
    self.postMessage({ error: String((err as Error)?.message ?? err) });
  }
};
