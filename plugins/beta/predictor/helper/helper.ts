// The Predictor's helper (docs/design/DESIGN-spelling-predictor.md): the vault's notes counted into word and
// word-sequence counts per language, a chunk of notes per call so no call nears the helper's time limit. Nothing is
// written; the page keeps the model in memory.
import type { Params } from "atlas-helper";
import { guessLanguage, ownWriting, plainProse, wordsOf } from "../../../../ui/src/lib/editor/prose";
import { countInto, sentences, type Chunk } from "../ui/src/model";

/** The notes to count, in order (the page asks for them in chunks). */
async function notes() {
  return (await atlas.files(true)).filter((p) => /\.md$/i.test(p) && !p.startsWith(".atlas/"));
}

async function count(p: Params): Promise<Chunk> {
  const langs = (p.langs as string[]) ?? ["en"];
  const fallback = String(p.fallback ?? langs[0] ?? "en");
  const out: Chunk = {};
  for (const path of (p.paths as string[]) ?? []) {
    let text: string;
    try { text = await atlas.read(path); } catch { continue; } // gone since the list
    if (!ownWriting(text)) continue;
    const lang = guessLanguage(text, langs, fallback, /^---[\s\S]*?^lang:\s*([\w-]+)/m.exec(text)?.[1]);
    countInto((out[lang] ??= { words: {}, forms: {}, next: {} }), sentences(plainProse(text), wordsOf));
  }
  return out;
}

atlas.methods({ notes, count });
