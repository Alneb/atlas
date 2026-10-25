// A small .xlsx made in the tests: a zip with each part deflated (or stored), as Excel writes them.
async function deflate(s: string): Promise<Uint8Array> {
  const stream = new Blob([s]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function zip(files: Record<string, string>, stored: string[] = []): Promise<Uint8Array> {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], dir: Uint8Array[] = [];
  let at = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name), data = stored.includes(name) ? enc.encode(text) : await deflate(text), method = stored.includes(name) ? 0 : 8;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(8, method, true); local.setUint32(18, data.length, true); local.setUint16(26, n.length, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); central.setUint16(10, method, true); central.setUint32(20, data.length, true);
    central.setUint16(28, n.length, true); central.setUint32(42, at, true);
    parts.push(new Uint8Array(local.buffer), n, data);
    dir.push(new Uint8Array(central.buffer), n);
    at += 30 + n.length + data.length;
  }
  const size = dir.reduce((s, d) => s + d.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(10, Object.keys(files).length, true); end.setUint32(12, size, true); end.setUint32(16, at, true);
  const all = [...parts, ...dir, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let k = 0;
  for (const p of all) { out.set(p, k); k += p.length; }
  return out;
}
