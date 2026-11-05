// Whether a word of prose is misspelled, given what knows a spelling (the dictionaries and the vault). Pure: tested
// without a page (tests/prose.spec.ts).

/** Is `word` wrong? `knows(w)` says whether one spelling is right. Skipped: words under 3 letters (et, al, Eq),
 *  acronyms and inner capitals (GW, McDonald). A possessive is its word (pyqcm's → pyqcm); a hyphenated word is right
 *  when it is known whole or each of its parts is (sub-bath, self-energy); a capital at the start may be the
 *  sentence's; a plural of a known word is right. */
export function isWrong(word: string, knows: (w: string) => boolean): boolean {
  const w = word.replace(/['’]s$/u, "");
  if (w.length < 3 || /\p{Lu}/u.test(w.slice(1))) return false;
  const known = (x: string) => knows(x) || (/s$/.test(x) && knows(x.slice(0, -1))); // a plural of a known word (irreps)
  const one = (x: string) => x.length < 3 || /\p{Lu}/u.test(x.slice(1)) || known(x) || (/^\p{Lu}/u.test(x) && known(x.toLowerCase()));
  if (one(w)) return false;
  const parts = w.split(/[-‐]/u);
  return parts.length < 2 || !parts.every(one);
}
