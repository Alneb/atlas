// A language's general word frequencies (the core's /api/words/<lang>, words.rs): how common a word is in the language
// at large, for the Predictor to rank the words it finishes and for Spelling to rank its suggestions — under the vault's
// own counts, which know the person's words. Parsed once per language and kept for the page's life.

export interface WordFreq {
  lang: string;
  /** How often the language writes `w` (lower case), per word of text; 0 when the list does not have it. */
  freq(w: string): number;
  /** wordfreq's Zipf scale: log10 of uses per billion words (the → ~7.7, a rare word ~2); 0 when unknown. */
  zipf(w: string): number;
  /** The listed words starting with `prefix`, most frequent first, at most `max`. */
  withPrefix(prefix: string, max?: number): string[];
  size: number;
}

/** Reads the list's text: words in frequency order, `@n` lines giving the frequency 10^(-n/100) of the words after. */
export function parseWordFreq(lang: string, text: string): WordFreq {
  const freq = new Map<string, number>();
  let f = 0;
  for (const line of text.split("\n")) {
    if (!line) continue;
    if (line.charCodeAt(0) === 64 /* @ */) { f = Math.pow(10, -Number(line.slice(1)) / 100); continue; }
    if (!freq.has(line)) freq.set(line, f);
  }
  const sorted = [...freq.keys()].sort();
  return {
    lang,
    size: freq.size,
    freq: (w) => freq.get(w) ?? 0,
    zipf: (w) => { const x = freq.get(w); return x ? Math.log10(x) + 9 : 0; },
    withPrefix(prefix, max = 50) {
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < prefix) lo = mid + 1; else hi = mid; }
      const out: string[] = [];
      for (let i = lo; i < sorted.length && sorted[i].startsWith(prefix); i++) out.push(sorted[i]);
      return out.sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0)).slice(0, max);
    },
  };
}

const loaded = new Map<string, Promise<WordFreq | null>>();

/** The list of `lang`, fetched from the core once; null for a language the core has none of (or when it fails). */
export function wordFreq(lang: string, get: (lang: string) => Promise<Response>): Promise<WordFreq | null> {
  let p = loaded.get(lang);
  if (!p) {
    p = get(lang)
      .then((r) => (r.ok ? r.text().then((t) => parseWordFreq(lang, t)) : null))
      .catch((e) => { console.warn(`[atlas] the ${lang} word list did not load`, e); return null; });
    loaded.set(lang, p);
  }
  return p;
}
