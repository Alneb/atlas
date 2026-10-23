// Zip archives read in the page: the central directory once, then each entry inflated on demand (DecompressionStream).
// Shared by every plugin that opens a zip (Books' EPUB, Manga's CBZ): `import { zipIndex, zipBlob } from "../zip/zip.js"`.
// Stored (0) and deflated (8) entries; ZIP64 is not read (an EPUB or a chapter is never 4 GB).

/** Every entry of the zip in `buf` (an ArrayBuffer) → Map(name → { method, size, at }), in the directory's order. */
export function zipIndex(buf) {
  const v = new DataView(buf);
  let end = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("not a zip file (no central directory)");
  const out = new Map(), dec = new TextDecoder();
  let at = v.getUint32(end + 16, true);
  for (let n = v.getUint16(end + 10, true); n > 0; n--) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error("a damaged zip (central directory)");
    const nameLen = v.getUint16(at + 28, true), extra = v.getUint16(at + 30, true), comment = v.getUint16(at + 32, true);
    out.set(dec.decode(new Uint8Array(buf, at + 46, nameLen)), { method: v.getUint16(at + 10, true), size: v.getUint32(at + 20, true), at: v.getUint32(at + 42, true) });
    at += 46 + nameLen + extra + comment;
  }
  return out;
}

/** One entry's bytes as a Blob (of MIME `type` when given): stored as is, or inflated. */
export async function zipBlob(buf, e, type = "") {
  const v = new DataView(buf);
  const start = e.at + 30 + v.getUint16(e.at + 26, true) + v.getUint16(e.at + 28, true);
  const raw = new Blob([new Uint8Array(buf, start, e.size)]);
  if (e.method === 0) return type ? new Blob([raw], { type }) : raw;
  if (e.method !== 8) throw new Error(`a zip packed in a way not read here (method ${e.method})`);
  const out = await new Response(raw.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
  return type ? new Blob([out], { type }) : out;
}
