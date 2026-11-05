// The Predictor's model: how often the vault writes each word, and which words follow one or two others, per
// language. The helper hands over each note's sentences as plain words (`packSentences`); they are counted in and out
// here (`addSentences`), so a saved note's old counts can leave. `predict` is what the ghost text shows; a dictionary's
// word list (`Lexicon`) finishes the words the vault does not write often enough.

/** One language's counts. Keys are lower case; `forms` keeps the casing the vault writes most (Wannier, GW). */
export interface Model {
  words: Map<string, number>;
  forms: Map<string, Map<string, number>>;
  /** "a" → next word → count, and "a b" → next word → count */
  next: Map<string, Map<string, number>>;
}
/** A dictionary's lower-case words, sorted (lib/editor/dictionaries.ts `dicStems`). */
export type Lexicon = string[];

export const emptyModel = (): Model => ({ words: new Map(), forms: new Map(), next: new Map() });

/** A text's sentences as lists of words (a sentence ends at . ! ? ; : a line break or a blank). */
export function sentences(text: string, wordsOf: (t: string) => { word: string }[]): string[][] {
  return text.split(/[.!?;:]+(?:\s|$)|\n+/).map((s) => wordsOf(s).map((w) => w.word)).filter((s) => s.length);
}
/** Sentences as one compact text (words by spaces, sentences by lines): what the helper answers and the page keeps. */
export const packSentences = (sents: string[][]) => sents.map((s) => s.join(" ")).join("\n");
export const unpackSentences = (text: string) => text ? text.split("\n").map((s) => s.split(" ")) : [];

/** Counts sentences into the model (`sign` 1) or out of it (-1). */
export function addSentences(m: Model, sents: string[][], sign: 1 | -1 = 1): void {
  const bump = <K>(map: Map<K, number>, k: K) => { const n = (map.get(k) ?? 0) + sign; if (n > 0) map.set(k, n); else map.delete(k); };
  const inner = (outer: Map<string, Map<string, number>>, k: string, w: string) => {
    const into = outer.get(k) ?? outer.set(k, new Map()).get(k)!;
    bump(into, w);
    if (!into.size) outer.delete(k);
  };
  for (const s of sents) {
    const low = s.map((w) => w.toLowerCase());
    low.forEach((w, i) => {
      bump(m.words, w);
      inner(m.forms, w, s[i]);
      if (i >= 1) inner(m.next, low[i - 1], w);
      if (i >= 2) inner(m.next, `${low[i - 2]} ${low[i - 1]}`, w);
    });
  }
}

/** The vault's usual spelling of a word (its case). */
const formOf = (m: Model, w: string) => [...(m.forms.get(w) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? w;

export interface Guess { /** the text to show after the caret */ ghost: string; /** where the first word of it ends */ firstWord: number }

/** The best candidate among `counts` starting with `prefix`, with its share of all that start so; null when none. */
function best(counts: Map<string, number> | undefined, prefix: string): { word: string; n: number; share: number } | null {
  if (!counts) return null;
  let top: [string, number] | null = null, total = 0;
  for (const [w, n] of counts) {
    if (!w.startsWith(prefix) || w === prefix) continue;
    total += n;
    if (!top || n > top[1]) top = [w, n];
  }
  return top ? { word: top[0], n: top[1], share: top[1] / total } : null;
}

/** What to show after `before` (the sentence so far, up to the caret): the rest of the word being typed, and the
 *  next word when the vault is sure of it (twice the uses, most of what follows). `min`: the uses a guess needs. */
export function predict(m: Model, before: string, wordsOf: (t: string) => { word: string }[], opts: { min: number; nextWord: boolean; lexicon?: Lexicon }): Guess | null {
  const sentence = before.split(/[.!?;:]\s|\n/).pop() ?? "";
  const words = wordsOf(sentence).map((w) => w.word);
  const typing = /\p{L}$/u.test(sentence) ? words.pop() ?? "" : "";
  if (typing && !sentence.endsWith(typing)) return null; // the last letters are not a whole word (inside a link…)
  const low = words.map((w) => w.toLowerCase());
  /** The first guess with enough uses: after the last two words, after the last one, then (`alone`) the word alone. */
  const after = (ctx: string[], prefix: string, alone: boolean) => [
    ctx.length >= 2 ? best(m.next.get(`${ctx[ctx.length - 2]} ${ctx[ctx.length - 1]}`), prefix) : null,
    ctx.length >= 1 ? best(m.next.get(ctx[ctx.length - 1]), prefix) : null,
    alone ? best(m.words, prefix) : null,
  ].find((g) => g && g.n >= opts.min) ?? null;

  let ghost = "", firstWord = 0, done: string;
  if (typing) {
    if (typing.length < 2) return null;
    const p = typing.toLowerCase();
    // what the vault writes after these words first; else any word of the vault or the dictionary
    const g = after(low, p, false);
    const word = g && (g.share >= 0.25 || g.n >= opts.min * 3) ? g.word : completeWord(m, opts.lexicon, p, opts.min);
    if (!word) return null;
    // the typed letters stay as typed; the rest as the vault writes the word (all capitals when typed so)
    ghost = formOf(m, word).slice(typing.length);
    if (typing === typing.toUpperCase()) ghost = ghost.toUpperCase();
    firstWord = ghost.length;
    done = word;
  } else {
    if (!opts.nextWord || !/\s$/.test(sentence) || !low.length) return null;
    done = "";
  }
  if (opts.nextWord) {
    const ctx = done ? [...low, done] : low;
    const n = after(ctx, "", false);
    if (n && n.n >= opts.min * 2 && n.share >= 0.6) ghost += (done ? " " : "") + formOf(m, n.word);
  }
  return ghost ? { ghost, firstWord: firstWord || ghost.length } : null;
}

/** The word being typed, finished from every word known: the vault's (used `min` times) and the dictionary's (from
 *  three letters). The vault's most used wins, then the shortest. Letters that are already a whole word (the) are
 *  finished only into a word the vault writes more often (there). */
export function completeWord(m: Model, lex: Lexicon | undefined, prefix: string, min: number): string | null {
  if (prefix.length < 2) return null;
  const uses = (w: string) => m.words.get(w) ?? 0;
  const cands = new Set<string>();
  for (const [w, n] of m.words) if (n >= min && w.length > prefix.length && w.startsWith(prefix)) cands.add(w);
  let whole = uses(prefix) >= min;
  if (lex?.length && prefix.length >= 3) {
    let lo = 0, hi = lex.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (lex[mid] < prefix) lo = mid + 1; else hi = mid; }
    if (lex[lo] === prefix) { whole = true; lo++; }
    for (let i = lo; i < lex.length && i < lo + 5000 && lex[i].startsWith(prefix); i++) cands.add(lex[i]);
  }
  const best = [...cands].sort((a, b) => uses(b) - uses(a) || a.length - b.length || (a < b ? -1 : 1))[0];
  if (!best || (whole && uses(best) <= uses(prefix))) return null;
  return best;
}
