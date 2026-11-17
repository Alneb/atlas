// The book's audiobook, the pure part (no DOM, no Atlas): which audiobook the book's note names, and which chapter of
// the text matches a chapter of the audio — by its title, normalised, so "Chapter 1" finds "1. Loomings" and
// "Prologue" finds "PROLOGUE". Chapter-level only (DESIGN-audiobooks.md, "Read along": finer sync later). The native
// reader has the same rules in Java (android/AudioChapters.java); both are tested on one list of cases
// (ui/tests/fixtures/audiobook-chapters.json).

/** The audiobook's item id from the note's properties: the catalog's `audiobookshelf` id, else the item in an
 *  `audiobook` link (`https://abs.example.org/item/<id>`, what the audiobook plugin writes) or a bare id there.
 *  Null when the note names none. */
export function audiobookItem(props) {
  const id = String(props?.audiobookshelf ?? "").trim();
  if (id) return id;
  const link = String(props?.audiobook ?? "").trim();
  const inUrl = /\/item\/([^/?#\s]+)/.exec(link);
  if (inUrl) { try { return decodeURIComponent(inUrl[1]); } catch { return inUrl[1]; } } // a stray "%": as written
  return /^[\w-]{8,}$/.test(link) ? link : null; // a bare id (ids are long); other text (a wikilink, "yes") names none
}

/** A chapter's title made comparable: accents, case and punctuation gone, `&` as "and", spaces collapsed, and a
 *  leading word "chapter" dropped (the audio says "Chapter 3", the contents "3. The Storm"). */
export function normTitle(title) {
  const t = String(title ?? "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return t.replace(/^chapter\s+(?=\S)/, "");
}

/** The index in `titles` of the chapter titled `title`: the first with the same normalised title; else the only one
 *  where one title starts the other at a word's end ("1" ~ "1 loomings", never "1" ~ "10"). -1 when none or several. */
export function matchTitle(titles, title) {
  const want = normTitle(title);
  if (!want) return -1;
  const norms = titles.map(normTitle);
  const same = norms.indexOf(want);
  if (same >= 0) return same;
  const starts = (long, short) => short && long.startsWith(short) && long[short.length] === " ";
  const near = norms.flatMap((n, i) => (starts(n, want) || starts(want, n) ? [i] : []));
  return near.length === 1 ? near[0] : -1;
}

/** A time in seconds as the player shows it: `4:05`, `1:02:03`. */
export function clock(s) {
  s = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), two = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}
