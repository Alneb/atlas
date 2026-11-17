// A book's title, author, series and year read from its file's name, the shapes shelves of downloaded books carry:
// "(Series) Author - Title_ Subtitle-Publisher (Year)", "Author - Year - Title", "Title (Year)". Shape-based, no list
// of publishers: what does not fit stays the name as it is ("70967", an ISBN) — the library shows it so, and a
// book's note (the catalog's) names it properly once it is read. Pure, tested apart (ui/tests/books-names.spec.ts).

/** `{ title, author?, series?, year? }` of a file name without its extension. */
export function bookOfName(name) {
  // "_" for a ":" a file name cannot hold ("Title_ Subtitle", "Title _ subtitle"), else a space; stray punctuation first
  let s = name.replace(/\s?_(?=\s)/g, ":").replace(/_/g, " ").replace(/^[\s)\]}.,;:-]+/, "").replace(/\s+/g, " ").trim();
  let series, year, author;
  // "(Oxford Graduate Texts) …", "[Physics textbook] …"; a bracket of names is the author ("[John R. Taylor] …")
  const lead = /^[([]((?:[^()[\]]|\([^()]*\)){3,})[)\]]\s*/.exec(s); // one bracket inside it may be: "(… (Oxford, England))"
  if (lead) {
    s = s.slice(lead[0].length);
    if (looksLikeNames(lead[1]) && !s.includes(" - ")) author = lead[1].trim();
    else series = lead[1].trim();
  }
  // "… (2010)", "… (2008, Wiley-VCH )"
  const tail = /\s*\((\d{4})(?:\s*,[^)]*)?\)\s*$/.exec(s);
  if (tail) { year = tail[1]; s = s.slice(0, tail.index); }
  const parts = s.split(" - ");
  if (!author && parts.length >= 2 && looksLikeNames(parts[0])) {
    author = parts[0].trim();
    const rest = parts.slice(1);
    if (!year && /^\d{4}$/.test(rest[0]?.trim() ?? "") && rest.length > 1) year = rest.shift().trim(); // "Author - 2004 - Title"
    s = rest.join(" - ");
  }
  // a publisher glued on by a hyphen at the end: "…Physics-Oxford University Press"
  // (only after an author, and only when the title before it is words of its own: "Many-Particle Physics" stays)
  const glued = author ? /-(?=\p{Lu})[^-]{3,60}$/u.exec(s) : null;
  if (glued && s.slice(0, glued.index).trim().split(" ").length >= 2) s = s.slice(0, glued.index);
  const title = s.replace(/\s+:/g, ":").replace(/\s*:\s*$/, "").trim() || name;
  return { title, ...(author ? { author } : {}), ...(series ? { series } : {}), ...(year ? { year } : {}) };
}

/** "Giuseppe Mussardo", "Bruus and Flensberg", "A. Altland, B. Simons": a few capitalised words, no digits. */
function looksLikeNames(s) {
  const words = s.trim().split(/[\s,]+/).filter((w) => !/^(and|&|et|al\.?|von|van|de|der|di|du|la|le)$/i.test(w));
  return words.length >= 1 && words.length <= 8 && !/\d/.test(s) && words.every((w) => /^\p{Lu}/u.test(w));
}
