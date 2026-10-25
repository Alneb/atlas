// An Excel workbook (.xlsx) read as tables, with nothing but the browser: the file is a zip of XML parts, unzipped
// with DecompressionStream and read with a few patterns (no DOM, so it also runs in a worker). Each sheet gives its
// cells' values as Excel last computed them, and the formulas behind them. Styles, charts and pictures are not read;
// numbers stay numbers (a date stays Excel's day count, as its format lives in the styles). Pure: bytes in, sheets out.

export interface XlsxSheet {
  name: string;
  rows: string[][];
  /** "r,c" (0-based) → the cell's formula, without its `=` */
  formulas: Map<string, string>;
}

// ── the zip ──────────────────────────────────────────────────────────────────────────────────────────────────────
interface Entry { name: string; method: number; size: number; offset: number }

function entries(b: Uint8Array): Map<string, Entry> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not an Excel file (no zip directory)");
  const count = v.getUint16(eocd + 10, true);
  let at = v.getUint32(eocd + 16, true);
  const out = new Map<string, Entry>(), dec = new TextDecoder();
  for (let k = 0; k < count && v.getUint32(at, true) === 0x02014b50; k++) {
    const method = v.getUint16(at + 10, true), size = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), note = v.getUint16(at + 32, true);
    const offset = v.getUint32(at + 42, true), name = dec.decode(b.subarray(at + 46, at + 46 + nameLen));
    out.set(name, { name, method, size, offset });
    at += 46 + nameLen + extra + note;
  }
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function part(b: Uint8Array, dir: Map<string, Entry>, name: string): Promise<string | null> {
  const e = dir.get(name);
  if (!e) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
  const raw = b.subarray(start, start + e.size);
  const bytes = e.method === 0 ? raw : e.method === 8 ? await inflate(raw) : null;
  if (!bytes) throw new Error(`${name}: a compression this reader does not know (${e.method})`);
  return new TextDecoder().decode(bytes);
}

// ── the XML ──────────────────────────────────────────────────────────────────────────────────────────────────────
const unescape = (s: string) => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    : ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" } as Record<string, string>)[e.toLowerCase()]);
const attr = (tag: string, name: string) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? unescape(m[1]) : null; };
/** the text of every `<t>` inside (a rich text run splits a cell's words over several) */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => unescape(m[1] ?? "")).join("");

/** `B12` → [11, 1] */
function place(ref: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
  if (!m) return [-1, -1];
  let c = 0;
  for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64;
  return [Number(m[2]) - 1, c - 1];
}

/** The workbook's sheets, in the workbook's order. */
export async function readXlsx(bytes: ArrayBuffer | Uint8Array): Promise<XlsxSheet[]> {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dir = entries(b);
  const book = await part(b, dir, "xl/workbook.xml");
  if (!book) throw new Error("not an Excel workbook (no xl/workbook.xml)");
  const rels = (await part(b, dir, "xl/_rels/workbook.xml.rels")) ?? "";
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id") ?? "", attr(m[0], "Target") ?? ""]));
  const shared = [...((await part(b, dir, "xl/sharedStrings.xml")) ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const out: XlsxSheet[] = [];
  for (const m of book.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name") ?? `Sheet ${out.length + 1}`, rid = attr(m[0], "r:id") ?? "";
    const t = target.get(rid) ?? "";
    const path = t.startsWith("/") ? t.slice(1) : `xl/${t.replace(/^\.\//, "")}`;
    const xml = await part(b, dir, path);
    if (xml === null) continue; // a chart sheet, or a part that is missing
    const rows: string[][] = [], formulas = new Map<string, string>();
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const head = c[1], body = c[2] ?? "", [r, col] = place(attr(` ${head}`, "r") ?? "");
      if (r < 0) continue;
      const type = attr(` ${head}`, "t"), v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const f = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = texts(body);
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v !== undefined) value = unescape(v);
      while (rows.length <= r) rows.push([]);
      const row = rows[r];
      while (row.length < col) row.push("");
      row[col] = value;
      if (f) formulas.set(`${r},${col}`, unescape(f));
    }
    // rows and columns a format reaches but no value does are left out (Excel keeps styled empty cells)
    while (rows.length && rows[rows.length - 1].every((x) => x === "")) rows.pop();
    let width = 0;
    for (const row of rows) for (let k = row.length - 1; k >= width; k--) if (row[k] !== "") { width = k + 1; break; }
    for (const row of rows) { row.length = Math.min(row.length, width); while (row.length < width) row.push(""); }
    out.push({ name, rows, formulas });
  }
  return out;
}
