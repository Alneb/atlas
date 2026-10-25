// A table written as a new Excel workbook (.xlsx): one sheet, the header as its first row, numbers as numbers, text as
// inline strings, and each `=` formula as Excel's formula with the value Atlas computed beside it (so a reader that
// does not recompute still shows it). References move down a row, the header taking row 1. Never written over an
// existing workbook: its styles, charts and other sheets would be lost. Pure apart from CompressionStream.
import { formulas, isFormula, shiftRows, colName } from "./formula";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  // characters XML 1.0 cannot hold (a control character in a cell) dropped
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const NUM = /^\s*-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i;

/** An Excel sheet name: at most 31 characters, none of `[]:*?/\`. */
export function sheetName(s: string): string {
  return s.replace(/[[\]:*?/\\]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Sheet1";
}

function cell(ref: string, text: string, value: string | null, dr: number): string {
  if (value !== null) {
    const f = `<f>${esc(shiftRows(text.slice(1), dr))}</f>`;
    return NUM.test(value) ? `<c r="${ref}">${f}<v>${Number(value)}</v></c>` : `<c r="${ref}" t="str">${f}<v>${esc(value)}</v></c>`;
  }
  if (text === "") return "";
  if (NUM.test(text)) return `<c r="${ref}"><v>${Number(text)}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}

/** The workbook's parts: a sheet from `header` (null: the file has none) and `rows` (cells as the file holds them,
 *  formulas with their `=`). */
export function workbookParts(name: string, header: string[] | null, rows: string[][]): Record<string, string> {
  const f = formulas(rows), dr = header ? 1 : 0;
  const line = (r: number, cells: string[], computed: (c: number) => string | null) =>
    `<row r="${r}">${cells.map((t, c) => cell(`${colName(c)}${r}`, t ?? "", computed(c), dr)).join("")}</row>`;
  const body = [
    ...(header ? [line(1, header, () => null)] : []),
    ...rows.map((cells, r) => line(r + 1 + dr, cells, (c) => (isFormula(cells[c] ?? "") ? f.shown(r, c) : null))),
  ].join("");
  return {
    "[Content_Types].xml": XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": XML + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${esc(sheetName(name))}" sheetId="1" r:id="rId1"/></sheets><calcPr fullCalcOnLoad="1"/></workbook>`,
    "xl/_rels/workbook.xml.rels": XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": XML + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + `<sheetData>${body}</sheetData></worksheet>`,
  };
}

// ── the zip: each part deflated, with its CRC-32 ─────────────────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflate(b: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([b as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function zipParts(files: Record<string, string>): Promise<Uint8Array> {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], dir: Uint8Array[] = [];
  let at = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name), raw = enc.encode(text), data = await deflate(raw), crc = crc32(raw);
    const head = (sig: number, size: number) => {
      const v = new DataView(new ArrayBuffer(size));
      v.setUint32(0, sig, true);
      return v;
    };
    const local = head(0x04034b50, 30);
    local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 8, true); local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, raw.length, true); local.setUint16(26, n.length, true);
    const central = head(0x02014b50, 46);
    central.setUint16(4, 20, true); central.setUint16(6, 20, true); central.setUint16(8, 0x0800, true); central.setUint16(10, 8, true); central.setUint16(14, 0x21, true);
    central.setUint32(16, crc, true); central.setUint32(20, data.length, true); central.setUint32(24, raw.length, true);
    central.setUint16(28, n.length, true); central.setUint32(42, at, true);
    parts.push(new Uint8Array(local.buffer), n, data);
    dir.push(new Uint8Array(central.buffer), n);
    at += 30 + n.length + data.length;
  }
  const size = dir.reduce((s, d) => s + d.length, 0), end = new DataView(new ArrayBuffer(22));
  const count = Object.keys(files).length;
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, count, true); end.setUint16(10, count, true); end.setUint32(12, size, true); end.setUint32(16, at, true);
  const all = [...parts, ...dir, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let k = 0;
  for (const p of all) { out.set(p, k); k += p.length; }
  return out;
}

/** The table as an .xlsx file's bytes. */
export const writeXlsx = (name: string, header: string[] | null, rows: string[][]) => zipParts(workbookParts(name, header, rows));
