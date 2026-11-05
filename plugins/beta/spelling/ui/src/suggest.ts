// Suggestions for a marked word: the dictionary's (nspell's), with the fixes it misses first — two letters swapped
// (teh → the), the commonest typo — and all ranked by how often the vault writes them, so its own words come first.

/** Every spelling of `word` with two neighbouring letters swapped. */
export function swaps(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < word.length; i++) {
    if (word[i] === word[i + 1]) continue;
    out.push(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
  }
  return out;
}

/** The suggestions to show, at most `max`: swaps the dictionary accepts, then its own, each group by the vault's use. */
export function suggestions(word: string, correct: (w: string) => boolean, dictionary: (w: string) => string[], uses: (w: string) => number, max = 6): string[] {
  const byUse = (list: string[]) => list.map((w, i) => [w, uses(w), i] as const).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map(([w]) => w);
  const first = byUse(swaps(word).filter(correct));
  const rest = byUse(dictionary(word));
  return [...new Set([...first, ...rest])].filter((w) => w !== word).slice(0, max);
}
