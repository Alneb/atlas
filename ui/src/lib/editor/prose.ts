// Prose in a note: the ranges a reader reads as sentences (not math, code, links, tags, HTML or the front matter),
// its words, and the language it is written in. Pure: plugins pass the syntax tree's nodes from the app's own
// CodeMirror (`atlas.editor.codemirror`), so this module bundles without a second copy of the library.

/** Nodes whose text is never prose: checked, counted or predicted by nobody. */
const NOT_PROSE = new Set([
  "FencedCode", "CodeBlock", "InlineCode", "InlineMath", "BlockMath", "HTMLBlock", "HTMLTag", "Comment", "CommentBlock",
  "Link", "Image", "URL", "Autolink", "Wikilink", "Embed", "Tag", "Icon", "Emoji", "Footnote", "FootnoteReference",
]);

/** What `proseRanges` needs from a syntax tree: its nodes in a range (`syntaxTree(state).iterate`). */
export type IterateNodes = (spec: { from: number; to: number; enter(node: { name: string; from: number; to: number }): boolean | void }) => void;

/** The end of a YAML front matter at the start of `text`, or 0. */
export function frontMatterEnd(text: string): number {
  const m = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  return m ? m[0].length : 0;
}

/** The prose ranges within [from, to): the range minus every node that is not prose and the front matter. */
export function proseRanges(iterate: IterateNodes, from: number, to: number, frontEnd = 0): [number, number][] {
  const holes: [number, number][] = frontEnd > from ? [[from, Math.min(frontEnd, to)]] : [];
  iterate({
    from, to,
    enter: (n) => {
      if (!NOT_PROSE.has(n.name)) return;
      holes.push([n.from, n.to]);
      return false;
    },
  });
  holes.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let at = from;
  for (const [a, b] of holes) {
    if (a > at) out.push([at, Math.min(a, to)]);
    at = Math.max(at, b);
  }
  if (at < to) out.push([at, to]);
  return out.filter(([a, b]) => b > a);
}

/** A word: letters (any script, with their accents), an inner apostrophe or hyphen joining two runs. */
const WORD = /\p{L}[\p{L}\p{M}]*(?:['’-]\p{L}[\p{L}\p{M}]*)*/gu;

export interface Word { word: string; from: number; to: number }

/** The words of `text`, positioned from `offset`. A word glued to a digit, an `@`, a `#`, `_` or a `/` (an id, a
 *  mention, a tag, a path) is left out: it is not a word of the language. */
export function wordsOf(text: string, offset = 0): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(WORD)) {
    const before = text[m.index - 1] ?? "", after = text[m.index + m[0].length] ?? "";
    if (/[\p{N}@#_/\\]/u.test(before) || /[\p{N}@_/\\]/u.test(after)) continue;
    if (before === "." && /\p{L}/u.test(text[m.index - 2] ?? "")) continue; // the "ext" of file.ext, the "g" of e.g.
    out.push({ word: m[0], from: offset + m.index, to: offset + m.index + m[0].length });
  }
  return out;
}

/** The languages known by their common short words, for guessing a note's. */
const COMMON: Record<string, Set<string>> = {
  en: new Set("the of and to in is that it for as with was on be by this are from or an at not which have but has can we".split(" ")),
  es: new Set("de la que el en los se del las un por con una para es al lo como más pero sus le ha o este si porque".split(" ")),
  fr: new Set("le la les de des et est un une du en que qui dans pour pas sur au par ce sont avec il elle nous".split(" ")),
};

/** A note's language: its `lang` property when given (`en`, `es-ES` → `es`), else the language whose common
 *  words its text uses most, among `known`; `fallback` when the text says too little. */
export function guessLanguage(text: string, known: string[], fallback: string, lang?: unknown): string {
  const given = typeof lang === "string" ? lang.toLowerCase().split(/[-_]/)[0] : "";
  if (given && known.includes(given)) return given;
  const counts = new Map<string, number>();
  let n = 0;
  for (const { word } of wordsOf(text.slice(0, 20000))) {
    const w = word.toLowerCase();
    for (const l of known) if (COMMON[l]?.has(w)) counts.set(l, (counts.get(l) ?? 0) + 1);
    n++;
  }
  const [best, score] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [fallback, 0];
  return n >= 12 && score >= 3 ? best : fallback;
}

/** Runs of 500+ characters with no space (an embedded data: picture: never prose) taken out by a plain loop: a regex
 *  over such a run makes QuickJS (the plugins' helpers) give up with a null error. `keepOffsets`: as spaces (the
 *  editor's marks keep their places), else dropped (a helper counting words: megabytes of pictures become nothing). */
const LONG_RUN = 500;
export function withoutLongRuns(text: string, keepOffsets: boolean): string {
  let out = "", from = 0, run = -1;
  for (let i = 0; i <= text.length; i++) {
    const c = i === text.length ? 32 : text.charCodeAt(i), space = c <= 32 || c === 160 || c === 0x2028 || c === 0x2029;
    if (!space) { if (run < 0) run = i; continue; }
    if (run >= 0 && i - run >= LONG_RUN) { out += text.slice(from, run) + (keepOffsets ? " ".repeat(i - run) : ""); from = i; }
    run = -1;
  }
  return from ? out + text.slice(from) : text;
}

/** A note's text with what is not prose blanked out, for counting without a syntax tree (a plugin's helper): the
 *  front matter, fences, `$$…$$` and `$…$`, inline code, links' targets, wikilinks, embeds, tags, HTML and URLs.
 *  Blanked with spaces (a line's breaks kept) so sentences do not join across what was removed. */
export function plainProse(text: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  const end = frontMatterEnd(text);
  return blank(text.slice(0, end)) + withoutLongRuns(text.slice(end), true)
    .replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, blank)
    .replace(/\$\$[\s\S]*?\$\$/g, blank)
    .replace(/\$[^$\n]+\$/g, blank)
    .replace(/`[^`\n]+`/g, blank)
    .replace(/!?\[\[[^\]\n]*\]\]/g, blank)
    .replace(/\]\([^)\n]*\)/g, blank)
    .replace(/<[^>\n]+>/g, blank)
    .replace(/https?:\/\/\S+/g, blank)
    .replace(/(^|\s)#[\p{L}\p{N}_/-]+/gu, (m) => blank(m))
    .replace(/%%[\s\S]*?%%/g, blank);
}

/** Is a note the vault owner's own writing, to learn from: not a kept mail (its `message_id` property), whose text is
 *  mostly others' and quoted HTML. Agent files are left out before, by the core's index filter. */
export function ownWriting(text: string): boolean {
  return !/^message_id:/m.test(text.slice(0, frontMatterEnd(text)));
}
