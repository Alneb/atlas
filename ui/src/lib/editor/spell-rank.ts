// Ranking spelling suggestions the way phone keyboards do (AOSP LatinIME's typing scorer, re-derived; no code taken):
// a weighted edit distance — a neighbouring key or a missing accent costs little, a stray letter more — plus how
// common the word is (the language's frequencies, the vault's own uses). The Spelling plugin's suggestions: nspell's,
// the fixes it misses — two letters swapped (teh → the), any common word one slip away — ranked so. Pure: tests/prose.spec.ts.

/** What each kind of slip costs (after AOSP's scoring_params table; swapped letters cheaper, as on a physical
 *  keyboard): a letter missing is likelier than one too many; next keys are common; a missing accent nearly free. */
export const COST = { substitute: 0.38, nearKey: 0.2, accent: 0.03, omit: 0.47, extra: 0.73, double: 0.3, swap: 0.35 };

/** Keys next to each other on a QWERTY board (Spanish ñ beside l). */
const ROWS = ["qwertyuiop", "asdfghjklñ", "zxcvbnm"];
const NEAR = new Map<string, Set<string>>();
ROWS.forEach((row, r) => [...row].forEach((k, i) => {
  const around = new Set<string>();
  for (const dr of [-1, 0, 1]) for (const di of [-1, 0, 1]) {
    const other = ROWS[r + dr]?.[i + di];
    if (other && other !== k) around.add(other);
  }
  NEAR.set(k, around);
}));

/** A letter without its accent (á → a, ñ stays ñ: a letter of its own in Spanish). */
export const fold = (c: string) => (c === "ñ" ? c : c.normalize("NFD").replace(/\p{M}/gu, ""));

function subCost(a: string, b: string): number {
  if (a === b) return 0;
  if (fold(a) === fold(b)) return COST.accent;
  return NEAR.get(fold(a))?.has(fold(b)) ? COST.nearKey : COST.substitute;
}

/** The cost of typing `typed` when `meant` was meant: a weighted Damerau–Levenshtein distance over lower case. */
export function editCost(typed: string, meant: string): number {
  const a = [...typed.toLowerCase()], b = [...meant.toLowerCase()];
  const d: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) d[i][0] = d[i - 1][0] + COST.extra;
  for (let j = 1; j <= b.length; j++) d[0][j] = d[0][j - 1] + COST.omit;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      // a typed letter too many: cheaper when it doubles its neighbour (occured ← ocurred)
      const extra = a[i - 1] === a[i - 2] || a[i - 1] === b[j - 1] ? COST.double : COST.extra;
      let v = Math.min(d[i - 1][j] + extra, d[i][j - 1] + COST.omit, d[i - 1][j - 1] + subCost(a[i - 1], b[j - 1]));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && a[i - 1] !== a[i - 2]) v = Math.min(v, d[i - 2][j - 2] + COST.swap);
      d[i][j] = v;
    }
  }
  return d[a.length][b.length];
}

/** Every spelling one slip away from `word` (lower case): a letter dropped, added, changed, or two swapped. `letters`:
 *  the alphabet to try (the language's, accented letters included). */
export function edits1(word: string, letters: string): string[] {
  const w = word.toLowerCase(), out = new Set<string>();
  for (let i = 0; i <= w.length; i++) {
    const [l, r] = [w.slice(0, i), w.slice(i)];
    if (r) out.add(l + r.slice(1));
    if (r.length > 1) out.add(l + r[1] + r[0] + r.slice(2));
    for (const c of letters) {
      out.add(l + c + r);
      if (r) out.add(l + c + r.slice(1));
    }
  }
  out.delete(w);
  return [...out];
}

export const LETTERS: Record<string, string> = { en: "abcdefghijklmnopqrstuvwxyz", es: "abcdefghijklmnopqrstuvwxyzáéíóúüñ" };

/** How much a candidate's commonness weighs against its distance (AOSP weighs language at ~1.1 of distance). */
const LANG_WEIGHT = 0.9;

/** The candidates in order: least distance plus rarity first. `zipf(w)`: the language's Zipf frequency (0 unknown,
 *  ~8 the commonest); `uses(w)`: the vault's own uses, which make a word as good as common. Keeps the typed word's
 *  capital. */
export function rankSuggestions(typed: string, cands: Iterable<string>, zipf: (w: string) => number, uses: (w: string) => number, max = 6): string[] {
  const low = typed.toLowerCase();
  const scored = new Map<string, number>();
  for (const c of cands) {
    const k = c.toLowerCase();
    if (k === low || scored.has(k)) continue;
    const common = Math.max(zipf(k), uses(c) || uses(k) ? 4 + Math.log2(1 + (uses(c) || uses(k))) : 0);
    scored.set(k, editCost(low, k) + LANG_WEIGHT * (1 - Math.min(common, 8) / 8));
  }
  const cap = /^\p{Lu}/u.test(typed) && !/\p{Lu}/u.test(typed.slice(1));
  return [...scored].sort((a, b) => a[1] - b[1]).slice(0, max).map(([w]) => (cap ? w[0].toUpperCase() + w.slice(1) : w));
}

/** Every spelling of `word` with two neighbouring letters swapped. */
export function swaps(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < word.length; i++) {
    if (word[i] === word[i + 1]) continue;
    out.push(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
  }
  return out;
}

/** The suggestions to show, at most `max`: the dictionary's own, swapped letters it accepts, and every word one slip
 *  away that the language commonly writes — ranked by how likely the slip is and how common the word (spell-rank.ts),
 *  the vault's own words counting as common. */
export function suggestions(word: string, k: { correct: (w: string) => boolean; dictionary: (w: string) => string[]; uses: (w: string) => number; zipf?: (w: string) => number; letters?: string }, max = 6): string[] {
  const zipf = k.zipf ?? (() => 0);
  const cands = new Set<string>([...swaps(word).filter(k.correct), ...k.dictionary(word)]);
  if (k.zipf && k.letters) for (const w of edits1(word, k.letters)) {
    // a word of the vault, a common word, or a listed one the dictionary agrees with (the lists hold common typos too)
    const z = zipf(w);
    if (k.uses(w) > 0 || z >= 3.5 || (z > 0 && k.correct(w))) cands.add(w);
  }
  return rankSuggestions(word, cands, zipf, k.uses, max);
}
