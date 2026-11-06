// The words a vault accepts on top of its dictionaries: a Markdown note (metadata lives in Markdown), one word per
// line in its ```words block, written by "Add to this vault's words" and free to edit by hand.

export const WORDS_NOTE = ".atlas/spelling/words.md";

const BLOCK = /^```words[ \t]*\n([\s\S]*?)^```/m;

/** The words of the note's block. */
export function parseWords(text: string): Set<string> {
  const body = BLOCK.exec(text)?.[1] ?? "";
  return new Set(body.split("\n").map((l) => l.trim()).filter(Boolean));
}

/** The note with `word` taken out of its block (the rest of the note as it was). */
export function removeWord(text: string, word: string): string {
  const words = [...parseWords(text)].filter((w) => w !== word);
  return text.replace(BLOCK, "```words\n" + words.map((w) => w + "\n").join("") + "```");
}

/** The note with `word` added, its words kept sorted; a new note when `text` is empty. */
export function addWord(text: string, word: string): string {
  const words = [...parseWords(text), word].filter((w, i, all) => all.indexOf(w) === i).sort((a, b) => a.localeCompare(b));
  const block = "```words\n" + words.join("\n") + "\n```";
  if (BLOCK.test(text)) return text.replace(BLOCK, block + "\n").replace(/```\n\n$/, "```\n");
  const head = text.trim() ? text.replace(/\s*$/, "\n\n") : "# This vault's words\n\nWords the spell checker takes as right here, one per line.\n\n";
  return head + block + "\n";
}
