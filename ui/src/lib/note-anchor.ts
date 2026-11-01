// A place inside a note, as a link's `#…` names it, the Obsidian way: `[[note#Heading]]` (any level, without case;
// `#A#B` the last part), `[[note#^block]]` (a line ending in ` ^block`). Links, bookmarks and note embeds all find
// headings and sections here. Pure: no I/O.

import { fences } from "./fence-walk";
import { frontmatterSpan } from "./property-model";

/** An ATX heading: its closing `#`s (after a blank) not part of its text, so `# C#` is "C#"; the one reading every
 *  module uses (code: lib/fence-walk.ts). */
export const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** A PDF mark's id (`m-` + 8), a block id in the PDF's note (pdf_marks.rs). */
export const MARK_ID = /^m-[0-9a-z]{8}$/;

/** The note's headings (none inside a code fence or the frontmatter, whose `# …` are YAML comments): 0-based line
 *  index, level, text as written. */
export function noteHeadings(lines: Iterable<string>): { i: number; level: number; text: string }[] {
  const all = [...lines], text = all[0]?.replace(/^\uFEFF/, "").startsWith("---") ? all.join("\n") : "";
  const f = frontmatterSpan(text);
  const out: { i: number; level: number; text: string }[] = [];
  const code = fences();
  for (let i = f ? text.slice(0, f.end).split("\n").length : 0; i < all.length; i++) {
    const m = !code.code(all[i]) && HEADING.exec(all[i]);
    if (m) out.push({ i, level: m[1].length, text: m[2] });
  }
  return out;
}
const headings = noteHeadings;

/** The heading named `name` (`A#B`: the last part), or undefined. */
const headingNamed = (hs: ReturnType<typeof headings>, name: string) => {
  const want = norm(name.split("#").filter(Boolean).pop() ?? "");
  return hs.find((h) => norm(h.text) === want);
};

/** The 1-based line `anchor` (a link's part after `#`) names in `md`: a heading, or a `^block`; undefined if none. */
export function anchorLine(md: string, anchor: string): number | undefined {
  const lines = md.split("\n"), a = anchor.trim();
  const code = fences(); // a block id in a code fence is an example, as a heading there is
  const i = a.startsWith("^")
    ? lines.findIndex((l) => !code.code(l) && (l.trimEnd().endsWith(` ${a}`) || l.trimEnd() === a))
    : (headingNamed(headings(lines), a)?.i ?? -1);
  return i < 0 ? undefined : i + 1;
}

/** The heading named `name` down to the next heading of its level or above; the whole text when there is none. */
export function sectionOf(md: string, name: string): string {
  const lines = md.split("\n"), hs = headings(lines), at = headingNamed(hs, name);
  if (!at) return md;
  const end = hs.find((h) => h.i > at.i && h.level <= at.level);
  return lines.slice(at.i, end?.i).join("\n");
}
