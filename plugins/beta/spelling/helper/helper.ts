// The Spelling plugin's helper (docs/design/DESIGN-spelling-predictor.md): the machine's Hunspell dictionaries, read
// for the page (which checks with them: QuickJS is too slow to load one), and the vault's words counted per language,
// a chunk of notes per call so no call nears the helper's time limit. Nothing is written.
import type { Params } from "atlas-helper";
import { guessLanguage, ownWriting, plainProse, wordsOf } from "../../../../ui/src/lib/editor/prose";

/** Where systems keep Hunspell dictionaries, the setting's folder first. */
const folders = (own: unknown) => [typeof own === "string" ? own.trim() : "", "/usr/share/hunspell", "/usr/share/myspell", "/usr/share/myspell/dicts"].filter(Boolean);

/** Each installed dictionary (`en_US`) with its folder, the first folder holding a name winning. */
async function installed(own: unknown): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const dir of folders(own)) {
    let r;
    try { r = await atlas.exec("ls", [dir]); } catch { return found; } // no `ls` (the phone): no dictionaries
    if (r.status !== 0) continue;
    const names = new Set(r.stdout.split("\n"));
    for (const n of names) {
      const m = /^([A-Za-z]{2,3}(?:[_-][A-Za-z0-9]+)*)\.dic$/.exec(n);
      if (m && names.has(`${m[1]}.aff`) && !found.has(m[1])) found.set(m[1], dir);
    }
  }
  return found;
}

async function dictionaries(p: Params) {
  return [...(await installed(p.folder)).keys()].sort();
}

/** One dictionary's two files, as text. */
async function dictionary(p: Params) {
  const name = String(p.name ?? "");
  const dir = (await installed(p.folder)).get(name);
  if (!dir) throw new Error(`no Hunspell dictionary named ${name}`);
  const cat = async (ext: string) => {
    const r = await atlas.exec("cat", [`${dir}/${name}.${ext}`], { timeout: 30 });
    if (r.status !== 0) throw new Error(r.stderr || `could not read ${name}.${ext}`);
    return r.stdout;
  };
  return { aff: await cat("aff"), dic: await cat("dic") };
}

/** The notes to count, in order (the page asks for them in chunks). */
async function notes() {
  return (await atlas.files(true)).filter((p) => /\.md$/i.test(p) && !p.startsWith(".atlas/"));
}

/** The words of these notes per language: word → [uses, notes using it]. `langs` are the languages with a
 *  dictionary, `fallback` the vault's main one. */
async function count(p: Params) {
  const paths = (p.paths as string[]) ?? [];
  const langs = (p.langs as string[]) ?? ["en"];
  const fallback = String(p.fallback ?? langs[0] ?? "en");
  const out: Record<string, Record<string, [number, number]>> = {};
  for (const path of paths) {
    let text: string;
    try { text = await atlas.read(path); } catch { continue; } // gone since the list
    if (!ownWriting(text)) continue;
    const lang = guessLanguage(text, langs, fallback, /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(text)?.[1]);
    const table = (out[lang] ??= {});
    const seen = new Set<string>();
    for (const { word } of wordsOf(plainProse(text))) {
      const row = (table[word] ??= [0, 0]);
      row[0]++;
      if (!seen.has(word)) { seen.add(word); row[1]++; }
    }
  }
  return out;
}

atlas.methods({ dictionaries, dictionary, notes, count });
