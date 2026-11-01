// What a `#tag` in a note's text is: the core's rule (crates/atlas-core/src/tags.rs `inline_tags`, `clean`), so what
// the editor and the reading view draw as a tag is what the tag pane counts and `tag:` finds. Letters, digits, `_`,
// `-` and `/`, at least one of them neither a digit nor `/` (`#1984` is a number, `#1a` a tag), no `//`; after a
// blank, the line's start or one of `( [ , ;` (so `a#b` and a URL's `#section` are not tags) — but not where it starts
// a link's target (`[[#Heading]]`, `[x](#anchor)`).

/** Whether a `#` after `prev` (undefined: the line's start), itself after `before`, may begin a tag. */
export const tagMayFollow = (prev: string | undefined, before?: string): boolean =>
  prev === undefined || (/[\s([,;]/.test(prev) && !((before === "[" && prev === "[") || (before === "]" && prev === "(")));

const BODY = /^[\p{L}\p{N}_/-]+/u;

/** The tag written at the start of `rest` (the text right after a `#`), without the `#`; null when none is. */
export function tagAt(rest: string): string | null {
  const t = BODY.exec(rest)?.[0];
  return t && /[^0-9/]/.test(t) && !t.includes("//") ? t : null;
}
