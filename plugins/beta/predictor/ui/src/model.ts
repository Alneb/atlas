// The Predictor's model: how often the vault writes each word, and which words follow one or two others, per
// language. Counted by the helper (`count` below runs there and in the tests), merged and pruned here; `predict` is
// what the ghost text shows.

/** One language's counts. Keys are lower case; `forms` keeps the casing the vault writes most (Wannier, GW). */
export interface Model {
  words: Map<string, number>;
  forms: Map<string, Map<string, number>>;
  /** "a" → next word → count, and "a b" → next word → count */
  next: Map<string, Map<string, number>>;
}
/** What a chunk of notes gives, per language: plain objects (the helper answers JSON). */
export type Chunk = Record<string, { words: Record<string, number>; forms: Record<string, Record<string, number>>; next: Record<string, Record<string, number>> }>;

export const emptyModel = (): Model => ({ words: new Map(), forms: new Map(), next: new Map() });

/** A text's sentences as lists of words (a sentence ends at . ! ? ; : a line break or a blank). */
export function sentences(text: string, wordsOf: (t: string) => { word: string }[]): string[][] {
  return text.split(/[.!?;:]+(?:\s|$)|\n+/).map((s) => wordsOf(s).map((w) => w.word)).filter((s) => s.length);
}

/** Counts one note's sentences into a chunk's table. */
export function countInto(table: Chunk[string], sents: string[][]): void {
  const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };
  for (const s of sents) {
    const low = s.map((w) => w.toLowerCase());
    low.forEach((w, i) => {
      bump(table.words, w);
      bump((table.forms[w] ??= {}), s[i]);
      if (i >= 1) bump((table.next[low[i - 1]] ??= {}), w);
      if (i >= 2) bump((table.next[`${low[i - 2]} ${low[i - 1]}`] ??= {}), w);
    });
  }
}

/** Adds a chunk into the models. */
export function merge(models: Map<string, Model>, chunk: Chunk): void {
  for (const [lang, t] of Object.entries(chunk)) {
    const m = models.get(lang) ?? models.set(lang, emptyModel()).get(lang)!;
    for (const [w, n] of Object.entries(t.words)) m.words.set(w, (m.words.get(w) ?? 0) + n);
    for (const [w, fs] of Object.entries(t.forms)) {
      const into = m.forms.get(w) ?? m.forms.set(w, new Map()).get(w)!;
      for (const [f, n] of Object.entries(fs)) into.set(f, (into.get(f) ?? 0) + n);
    }
    for (const [k, nx] of Object.entries(t.next)) {
      const into = m.next.get(k) ?? m.next.set(k, new Map()).get(k)!;
      for (const [w, n] of Object.entries(nx)) into.set(w, (into.get(w) ?? 0) + n);
    }
  }
}

/** Drops what was seen once (a typo, a one-off phrase): most of the memory, none of the predictions. */
export function prune(m: Model, min = 2): void {
  for (const [w, n] of m.words) if (n < min) { m.words.delete(w); m.forms.delete(w); }
  for (const [k, nx] of m.next) {
    for (const [w, n] of nx) if (n < min) nx.delete(w);
    if (!nx.size) m.next.delete(k);
  }
  for (const [w, fs] of m.forms) if (fs.size > 1) { const best = [...fs].sort((a, b) => b[1] - a[1])[0]; m.forms.set(w, new Map([best])); }
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
export function predict(m: Model, before: string, wordsOf: (t: string) => { word: string }[], opts: { min: number; nextWord: boolean }): Guess | null {
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
    const g = after(low, p, true);
    if (!g || (g.share < 0.25 && g.n < opts.min * 3)) return null;
    // the typed letters stay as typed; the rest as the vault writes the word (all capitals when typed so)
    ghost = formOf(m, g.word).slice(typing.length);
    if (typing === typing.toUpperCase()) ghost = ghost.toUpperCase();
    firstWord = ghost.length;
    done = g.word;
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
