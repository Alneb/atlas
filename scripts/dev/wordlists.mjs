#!/usr/bin/env node
// wordlists.mjs — the general word frequencies the core serves at /api/words/<lang> (crates/atlas-core/data/words/<lang>.words, words.rs),
// made from wordfreq's "large" lists (https://github.com/rspeer/wordfreq, data CC BY-SA 4.0: a blend of Wikipedia,
// subtitles, news, books, web text and social media, frozen in 2021). Run again only to change the size or add a
// language:
//   node scripts/dev/wordlists.mjs [--top 60000] en es
// The download lands in target/wordfreq/ (git-ignored). The output: one word per line, most frequent first; a line
// `@<n>` starts the words whose frequency is 10^(-n/100) per word of text (wordfreq's centibel buckets), so a reader
// gets both the rank and the frequency in ~5 bytes a word.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const topAt = args.indexOf("--top");
const TOP = topAt >= 0 ? Number(args.splice(topAt, 2)[1]) : 60000;
const langs = args.length ? args : ["en", "es"];
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const cache = path.join(root, "target/wordfreq");
const out = path.join(root, "crates/atlas-core/data/words");

/** The few MessagePack types wordfreq's cBpack uses: arrays, strings, a small map, integers. */
function unpack(buf) {
  let i = 0;
  const str = (n) => { const s = buf.toString("utf8", i, i + n); i += n; return s; };
  const arr = (n) => { const a = new Array(n); for (let k = 0; k < n; k++) a[k] = read(); return a; };
  const map = (n) => { const m = {}; for (let k = 0; k < n; k++) { const key = read(); m[key] = read(); } return m; };
  function read() {
    const b = buf[i++];
    if (b <= 0x7f) return b;
    if (b >= 0xe0) return b - 0x100;
    if ((b & 0xe0) === 0xa0) return str(b & 0x1f);
    if ((b & 0xf0) === 0x90) return arr(b & 0x0f);
    if ((b & 0xf0) === 0x80) return map(b & 0x0f);
    switch (b) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;
      case 0xcc: return buf[i++];
      case 0xcd: { const v = buf.readUInt16BE(i); i += 2; return v; }
      case 0xd9: { const n = buf[i]; i += 1; return str(n); }
      case 0xda: { const n = buf.readUInt16BE(i); i += 2; return str(n); }
      case 0xdb: { const n = buf.readUInt32BE(i); i += 4; return str(n); }
      case 0xdc: { const n = buf.readUInt16BE(i); i += 2; return arr(n); }
      case 0xdd: { const n = buf.readUInt32BE(i); i += 4; return arr(n); }
      case 0xde: { const n = buf.readUInt16BE(i); i += 2; return map(n); }
      default: throw new Error(`messagepack byte 0x${b.toString(16)} at ${i - 1} not handled`);
    }
  }
  return read();
}

/** A word worth predicting or checking: letters (an inner apostrophe or hyphen allowed), no digits. */
const WORD = /^\p{L}+(?:['’-]\p{L}+)*$/u;

/** In a checkout that publishes (publish/lib.mjs, the maintainer's), a word its leak scan would refuse is left out:
 *  the lists are published, and a common word can be someone's name. Elsewhere nothing is left out. */
const lib = path.join(root, "publish/lib.mjs");
const refused = fs.existsSync(lib) ? (await import(lib)).loadDenylist().map((r) => r.re) : [];
const allowed = (w) => refused.every((re) => { re.lastIndex = 0; return !re.test(w); });

for (const lang of langs) {
  fs.mkdirSync(cache, { recursive: true });
  const file = path.join(cache, `large_${lang}.msgpack.gz`);
  if (!fs.existsSync(file)) {
    const url = `https://github.com/rspeer/wordfreq/raw/master/wordfreq/data/large_${lang}.msgpack.gz`;
    console.error(`[wordlists] ${lang}: downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const packed = unpack(zlib.gunzipSync(fs.readFileSync(file)));
  const [header, ...buckets] = packed;
  if (header?.format !== "cB") throw new Error(`${file}: not a cBpack list (${JSON.stringify(header)})`);
  const lines = [];
  let kept = 0;
  for (let n = 0; n < buckets.length && kept < TOP; n++) {
    const words = (buckets[n] ?? []).filter((w) => WORD.test(w) && allowed(w));
    if (!words.length) continue;
    lines.push(`@${n}`);
    for (const w of words) { if (kept++ >= TOP) break; lines.push(w); }
  }
  fs.mkdirSync(out, { recursive: true });
  const target = path.join(out, `${lang}.words`);
  fs.writeFileSync(target, lines.join("\n") + "\n");
  // a sanity check that cannot pass by accident: the commonest words of the language come first
  const head = lines.filter((l) => !l.startsWith("@")).slice(0, 12).join(" ");
  console.error(`[wordlists] ${lang}: ${kept} words, ${(fs.statSync(target).size / 1024).toFixed(0)} KB → ${path.relative(root, target)}; first: ${head}`);
}
