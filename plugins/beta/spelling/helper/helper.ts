// The Spelling plugin's helper (docs/design/DESIGN-spelling-predictor.md): the Hunspell dictionaries (the vault's
// .atlas/dictionaries, then the machine's), read for the page (which checks with them: QuickJS is too slow to load
// one), and the vault's words counted per language, a chunk of notes per call so no call nears the helper's time
// limit. The only write: `keep`, the dictionaries in use copied into the vault for the devices that have none.
import type { Params } from "atlas-helper";
import { guessLanguage, ownWriting, plainProse, wordsOf } from "../../../../ui/src/lib/editor/prose";
import { dictionaryFile, installedDictionaries, keepInVault, machineFiles, vaultFiles, type Exec } from "../../../../ui/src/lib/editor/dictionaries";

const exec: Exec = (cmd, args, opts) => atlas.exec(cmd, args, opts) as unknown as ReturnType<Exec>;
const vault = vaultFiles(atlas), machine = machineFiles(exec);

async function dictionaries(p: Params) {
  return [...(await installedDictionaries(vault, machine, p.folder)).keys()].sort();
}

/** One dictionary's two files, as text. */
async function dictionary(p: Params) {
  const name = String(p.name ?? "");
  return { aff: await dictionaryFile(vault, machine, p.folder, name, "aff"), dic: await dictionaryFile(vault, machine, p.folder, name, "dic") };
}

/** The named dictionaries this machine has and the vault does not, copied into the vault: the names copied. */
async function keep(p: Params) {
  return keepInVault(vault, machine, p.folder, (p.names as string[]) ?? [], (path, text) => atlas.write(path, text));
}

/** The notes to count, in order (the page asks for them in chunks). */
async function notes() {
  return (await atlas.files(true)).filter((p) => /\.md$/i.test(p) && !p.startsWith(".atlas/"));
}

/** Each of these notes' words, with its language: path → { lang, words: word → uses }. Per note, so the page can
 *  take a note's old counts out when it changes and put the new ones in. */
async function count(p: Params) {
  const paths = (p.paths as string[]) ?? [];
  const langs = (p.langs as string[]) ?? ["en"];
  const fallback = String(p.fallback ?? langs[0] ?? "en");
  const out: Record<string, { lang: string; words: Record<string, number> }> = {};
  for (const path of paths) {
    let text: string;
    try { text = await atlas.read(path); } catch { continue; } // gone since the list
    if (!ownWriting(text)) continue;
    const lang = guessLanguage(text, langs, fallback, /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(text)?.[1]);
    const words: Record<string, number> = {};
    for (const { word } of wordsOf(plainProse(text))) words[word] = (words[word] ?? 0) + 1;
    out[path] = { lang, words };
  }
  return out;
}

atlas.methods({ dictionaries, dictionary, keep, notes, count });
