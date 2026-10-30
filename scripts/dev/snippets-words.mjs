#!/usr/bin/env node
// Makes plugins/beta/snippets/words.txt: every English and Spanish word the system's Hunspell dictionaries know, its
// inflections included, lower case and without accents, sorted. Only needed when the word list is to be remade.
//   node scripts/dev/snippets-words.mjs [dictionary folder, default /usr/share/hunspell]
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const dir = process.argv[2] ?? "/usr/share/hunspell";
// A short word in a big dictionary is usually a product in math: `dpi` is d\pi. The plugin's own list has the short
// words that are really used.
const MIN_LENGTH = 4;

/** The rules of an .aff file: flag → { cross, kind, rules: [{ strip, add, cond }] }. */
function readAffixes(path) {
  const flags = new Map();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const f = line.trim().split(/\s+/);
    if (f[0] !== "SFX" && f[0] !== "PFX") continue;
    if (f.length === 4 && /^[YN]$/.test(f[2])) { flags.set(f[1], { kind: f[0], cross: f[2] === "Y", rules: [] }); continue; }
    const set = flags.get(f[1]);
    if (!set) continue;
    const add = f[3].split("/")[0], strip = f[2] === "0" ? "" : f[2], cond = f[4] ?? ".";
    set.rules.push({ strip, add: add === "0" ? "" : add, cond: cond === "." ? null : new RegExp(set.kind === "SFX" ? cond + "$" : "^" + cond) });
  }
  return flags;
}

function expand(stem, wordFlags, affixes, emit) {
  emit(stem);
  const sets = [...wordFlags].map((f) => affixes.get(f)).filter(Boolean);
  const apply = (set, w) => {
    const out = [];
    for (const r of set.rules) {
      if (r.cond && !r.cond.test(w)) continue;
      if (set.kind === "SFX") { if (w.endsWith(r.strip)) out.push(w.slice(0, w.length - r.strip.length) + r.add); }
      else if (w.startsWith(r.strip)) out.push(r.add + w.slice(r.strip.length));
    }
    return out;
  };
  for (const s of sets.filter((x) => x.kind === "SFX")) for (const w of apply(s, stem)) {
    emit(w);
    if (s.cross) for (const p of sets) if (p.kind === "PFX" && p.cross) for (const x of apply(p, w)) emit(x);
  }
  for (const p of sets.filter((x) => x.kind === "PFX")) for (const w of apply(p, stem)) emit(w);
}

// A checkout that publishes (it has publish/) leaves out the words its leak scan would refuse: an ordinary word can
// also be a private one.
const denyFile = new URL("../../publish/lib.mjs", import.meta.url);
const deny = existsSync(denyFile) ? (await import(denyFile)).loadDenylist() : [];
const denied = (w) => deny.some(({ re }) => ((re.lastIndex = 0), re.test(w)));

const words = new Set();
const emit = (w) => {
  // proper nouns stay out: they are written with a capital, and a capital is no word to hold a trigger
  if (w !== w.toLowerCase()) return;
  const plain = w.normalize("NFD").replace(/\p{M}/gu, "");
  if (plain.length >= MIN_LENGTH && plain.length <= 24 && /^[a-z]+$/.test(plain)) words.add(plain);
};
for (const lang of ["en_US", "es_ES"]) {
  const before = words.size, affixes = readAffixes(`${dir}/${lang}.aff`);
  for (const line of readFileSync(`${dir}/${lang}.dic`, "utf8").split("\n").slice(1)) {
    const [stem, flags = ""] = line.trim().split(/\s+/)[0].split("/");
    if (stem) expand(stem, flags, affixes, emit);
  }
  console.log(`${lang}: ${words.size - before} new words`);
}
const dropped = [...words].filter(denied);
for (const w of dropped) words.delete(w);
if (dropped.length) console.log(`left out for the leak scan: ${dropped.length} words`);
const sorted = [...words].sort();
writeFileSync(new URL("../../plugins/beta/snippets/words.txt", import.meta.url), sorted.join("\n"));
console.log(`words.txt: ${sorted.length} words, ${(sorted.join("\n").length / 1048576).toFixed(1)} MB`);
