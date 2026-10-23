// The HTML inside a note, for the editor's syntax tree: lang-markdown's own HTML grammar, except for a tag too long to be
// written by hand — an image pasted as a `data:` URL is one tag of hundreds of KB, which the grammar read again on every
// keystroke (~27 ms a key on a 4.5 MB note, scripts/dev/profile-ui.mjs, 2026-10-16). Such a tag is left as plain text in
// the tree; the live preview renders it all the same (inlineHtml).
import { html } from "@codemirror/lang-html";
import { LanguageSupport } from "@codemirror/language";
import { NodeType, Parser, Tree, type Input, type PartialParse, type TreeFragment } from "@lezer/common";

/** Longer than this (in characters), an HTML tag or block is not parsed as HTML. */
const LONGEST = 10_000;

class SkipHuge extends Parser {
  constructor(private readonly inner: Parser) { super(); }

  createParse(input: Input, fragments: readonly TreeFragment[], ranges: readonly { from: number; to: number }[]): PartialParse {
    const length = ranges.reduce((n, r) => n + r.to - r.from, 0);
    if (length <= LONGEST) return this.inner.createParse(input, fragments, ranges);
    const end = ranges.length ? ranges[ranges.length - 1].to : input.length;
    return { advance: () => new Tree(NodeType.none, [], [], end - (ranges[0]?.from ?? 0)), parsedPos: end, stopAt: () => {}, stoppedAt: null };
  }
}

/** For `markdown({ htmlTagLanguage })`: HTML as lang-markdown has it (no closing-tag matching), huge tags skipped. */
export function noteHtml(): LanguageSupport {
  const h = html({ matchClosingTags: false });
  // lang-markdown reads only `.language.parser` (for the nested parse) and `.support` from it
  const language = Object.create(h.language, { parser: { value: new SkipHuge(h.language.parser) } });
  return new LanguageSupport(language, h.support);
}
