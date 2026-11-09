// The Predictor's helper (docs/design/DESIGN-spelling-predictor.md): each note's sentences as plain words, with its
// language, a chunk of notes per call so no call nears the helper's time limit; and a Hunspell dictionary's word list,
// for finishing words the vault does not write often. Nothing is written; the page keeps the model in memory.
import type { Params } from "atlas-helper";
import { guessLanguage, ownWriting, plainProse, withoutLongRuns, wordsOf } from "../../../../ui/src/lib/editor/prose";
import { chooseDictionaries, dicStems, dictionaryFile, installedDictionaries, machineFiles, vaultFiles, type Exec } from "../../../../ui/src/lib/editor/dictionaries";
import { packSentences, sentences } from "../ui/src/model";

const exec: Exec = (cmd, args, opts) => atlas.exec(cmd, args, opts) as unknown as ReturnType<Exec>;
const vault = vaultFiles(atlas), machine = machineFiles(exec);

/** The notes to count, in order (the page asks for them in chunks). */
async function notes() {
  return (await atlas.files(true)).filter((p) => /\.md$/i.test(p) && !p.startsWith(".atlas/"));
}

/** path → { lang, text: its sentences packed }; a note that is not the owner's writing (a kept mail) left out. */
async function count(p: Params) {
  const langs = (p.langs as string[]) ?? ["en"];
  const fallback = String(p.fallback ?? langs[0] ?? "en");
  const out: Record<string, { lang: string; text: string }> = {};
  for (const path of (p.paths as string[]) ?? []) {
    let text: string;
    try { text = withoutLongRuns(await atlas.read(path), false); } catch { continue; } // gone since the list
    if (!ownWriting(text)) continue;
    const lang = guessLanguage(text, langs, fallback, /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(text)?.[1]);
    out[path] = { lang, text: packSentences(sentences(plainProse(text), wordsOf)) };
  }
  return out;
}

/** A language's dictionary words (lower case, without affixes), one per line; "" when none is installed. */
async function lexicon(p: Params) {
  const installed = [...(await installedDictionaries(vault, machine, p.folder)).keys()];
  const names = chooseDictionaries(installed, p.dictionaries).get(String(p.lang ?? "en")) ?? [];
  const words = new Set<string>();
  for (const name of names) for (const w of dicStems(await dictionaryFile(vault, machine, p.folder, name, "dic"))) words.add(w);
  return [...words].join("\n");
}

atlas.methods({ notes, count, lexicon });
