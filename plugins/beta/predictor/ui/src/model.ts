// The Predictor's model: how often the vault writes each word, and which words follow one or two others, per
// language. The helper hands over each note's sentences as plain words (`packSentences`); they are counted in and out
// here (`addSentences`), so a saved note's old counts can leave. `predict` is what the ghost text shows: the candidates
// ranked by an interpolated model (`rank`) — the context, the note being written, the vault, the language at large
// (the core's word frequencies) — and shown only when one is clearly ahead (docs/design/DESIGN-spelling-predictor.md).

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

/** The vault's usual spelling of a word (its case), the open note's first. */
const formOf = (ms: Model[], w: string) => {
  for (const m of ms) { const f = [...(m.forms.get(w) ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0]; if (f) return f; }
  return w;
};

export interface Guess { /** the text to show after the caret */ ghost: string; /** where the first word of it ends */ firstWord: number }

/** What ranks a word: the vault's counts, the open note's (a cache of what is being written now: its names and terms
 *  count at once), the language's general frequencies, a Hunspell word list for the rest. */
export interface Sources {
  min: number;
  nextWord: boolean;
  /** The open note's own counts. */
  note?: Model;
  general?: { freq(w: string): number; withPrefix(p: string, max?: number): string[] };
  lexicon?: Lexicon;
}

/** How sure a completion must be: its share of the probability among every word starting so (the typed letters as a
 *  whole word among them), and how far ahead of the next one. Three letters or more ask less than two. */
const SURE = { share: 0.42, shareShort: 0.6, lead: 1.8 };

/** A model's part in the evidence: its weight, and the uses a word needs in it to count (the vault's `min`: a word
 *  written once is maybe a typo; the open note's words count at once). */
type Part = { m: Model; weight: number; min: number };

/** Counts of the words after `key` (one or two words) in each part, weighted. */
function after(ms: Part[], key: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const { m, weight, min } of ms) for (const [w, n] of m.next.get(key) ?? []) if ((m.words.get(w) ?? 0) >= min) out.set(w, (out.get(w) ?? 0) + n * weight);
  return out;
}

const partsOf = (m: Model, src: Sources): Part[] => [{ m, weight: 1, min: src.min }, ...(src.note ? [{ m: src.note, weight: 2, min: 1 }] : [])];

/** Each candidate's probability of being the word typed, mixed from the evidence by how much of it there is
 *  (Witten-Bell's weight n/(n+k): a context seen once says little, one seen fifty times nearly everything):
 *  after the last two words, else after the last one, else the vault's and note's own counts, else the language's. */
export function rank(cands: string[], parts: { tri: Map<string, number>; bi: Map<string, number>; uni: (w: string) => number; general: (w: string) => number }): [string, number][] {
  const share = (f: (w: string) => number) => {
    const xs = cands.map(f), total = xs.reduce((a, b) => a + b, 0);
    return { of: (i: number) => (total ? xs[i] / total : 0), total };
  };
  const tri = share((w) => parts.tri.get(w) ?? 0), bi = share((w) => parts.bi.get(w) ?? 0);
  const uni = share(parts.uni), gen = share(parts.general);
  const w3 = tri.total / (tri.total + 2), w2 = bi.total / (bi.total + 3), wu = uni.total / (uni.total + 8);
  const p = cands.map((_, i) => {
    const base = gen.total ? wu * uni.of(i) + (1 - wu) * gen.of(i) : uni.of(i);
    return w3 * tri.of(i) + (1 - w3) * (w2 * bi.of(i) + (1 - w2) * base);
  });
  return cands.map((w, i) => [w, p[i]] as [string, number]).sort((a, b) => b[1] - a[1]);
}

/** A word the language knows but seldom writes (in a Hunspell list, not in the frequencies): a little above nothing. */
const RARE = 1e-9;

/** The word being typed, finished: the most likely of every word starting with `prefix` (lower case) — the typed
 *  letters themselves among them, so "the" is not pushed to "there" unless "there" is likelier here — when it is sure
 *  enough (SURE); null otherwise. `ctx`: the sentence's words before it, lower case. */
export function completeWord(m: Model, src: Sources, ctx: string[], prefix: string): string | null {
  if (prefix.length < 2) return null;
  const own = partsOf(m, src);
  const cands = new Set<string>([prefix]);
  for (const { m: x } of own) for (const w of x.words.keys()) if (w.length > prefix.length && w.startsWith(prefix)) cands.add(w);
  for (const w of src.general?.withPrefix(prefix, 40) ?? []) cands.add(w);
  const lex = src.lexicon;
  if (lex?.length && prefix.length >= 3) {
    let lo = 0, hi = lex.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (lex[mid] < prefix) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < lex.length && i < lo + 400 && lex[i].startsWith(prefix); i++) cands.add(lex[i]);
  }
  const list = [...cands];
  const inLex = new Set(lex && prefix.length >= 3 ? list.filter((w) => binaryHas(lex, w)) : []);
  // the vault's own counts: a word used fewer than `min` times there is not yet one of its words (a typo, once)
  const uni = (w: string) => { const v = m.words.get(w) ?? 0; return (v >= src.min ? v : 0) + 2 * (src.note?.words.get(w) ?? 0); };
  const general = (w: string) => src.general?.freq(w) || (inLex.has(w) ? RARE : 0);
  const key2 = ctx.length >= 2 ? `${ctx[ctx.length - 2]} ${ctx[ctx.length - 1]}` : "";
  const ranked = rank(list, { tri: key2 ? after(own, key2) : new Map(), bi: ctx.length ? after(own, ctx[ctx.length - 1]) : new Map(), uni, general });
  const [top, second] = ranked;
  if (!top || top[0] === prefix || top[1] <= 0) return null;
  if (top[0].length - prefix.length < 2) return null; // a letter's gain is not worth a guess on screen
  const need = prefix.length >= 3 ? SURE.share : SURE.shareShort;
  if (top[1] < need || (second && second[1] * SURE.lead > top[1])) return null;
  return top[0];
}

function binaryHas(sorted: string[], w: string): boolean {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < w) lo = mid + 1; else hi = mid; }
  return sorted[lo] === w;
}

/** What to show after `before` (the sentence so far, up to the caret): the rest of the word being typed when it is
 *  likely enough, and the next word when the vault (or the note) is sure of it — twice `min` uses, most of what follows. */
export function predict(m: Model, before: string, wordsOf: (t: string) => { word: string }[], src: Sources): Guess | null {
  const sentence = before.split(/[.!?;:]\s|\n/).pop() ?? "";
  const words = wordsOf(sentence).map((w) => w.word);
  const typing = /\p{L}$/u.test(sentence) ? words.pop() ?? "" : "";
  if (typing && !sentence.endsWith(typing)) return null; // the last letters are not a whole word (inside a link…)
  const low = words.map((w) => w.toLowerCase());
  const models = src.note ? [src.note, m] : [m];

  let ghost = "", firstWord = 0, done: string;
  if (typing) {
    const word = completeWord(m, src, low, typing.toLowerCase());
    if (!word) return null;
    // the typed letters stay as typed; the rest as the vault writes the word (all capitals when typed so)
    ghost = formOf(models, word).slice(typing.length);
    if (typing.length > 1 && typing === typing.toUpperCase()) ghost = ghost.toUpperCase();
    firstWord = ghost.length;
    done = word;
  } else {
    if (!src.nextWord || !/\s$/.test(sentence) || !low.length) return null;
    done = "";
  }
  if (src.nextWord) {
    const ctx = done ? [...low, done] : low;
    const own = partsOf(m, src);
    const next = (key: string) => {
      const counts = after(own, key);
      let top: [string, number] | null = null, total = 0;
      for (const [w, n] of counts) { total += n; if (!top || n > top[1]) top = [w, n]; }
      return top ? { word: top[0], n: top[1], share: top[1] / total } : null;
    };
    const n = [ctx.length >= 2 ? next(`${ctx[ctx.length - 2]} ${ctx[ctx.length - 1]}`) : null, next(ctx[ctx.length - 1])]
      .find((g) => g && g.n >= src.min * 2) ?? null;
    if (n && n.share >= 0.6) ghost += (done ? " " : "") + formOf(models, n.word);
  }
  return ghost ? { ghost, firstWord: firstWord || ghost.length } : null;
}
