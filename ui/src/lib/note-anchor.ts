// A place inside a note, as a link's `#…` names it, the Obsidian way: `[[note#Heading]]` (any level, without case;
// `#A#B` the last part), `[[note#^block]]` (a line ending in ` ^block`). Links, bookmarks and note embeds all find
// headings and sections here. Pure: no I/O.

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** A PDF mark's id (`m-` + 8), a block id in the PDF's note (pdf_marks.rs). */
export const MARK_ID = /^m-[0-9a-z]{8}$/;

/** The note's headings (none inside a code fence): line index, level, text. */
function headings(lines: readonly string[]): { i: number; level: number; text: string }[] {
  const out: { i: number; level: number; text: string }[] = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const m = !fence && HEADING.exec(l);
    if (m) out.push({ i, level: m[1].length, text: norm(m[2]) });
  });
  return out;
}

/** The heading named `name` (`A#B`: the last part), or undefined. */
const headingNamed = (hs: ReturnType<typeof headings>, name: string) => {
  const want = norm(name.split("#").filter(Boolean).pop() ?? "");
  return hs.find((h) => h.text === want);
};

/** The 1-based line `anchor` (a link's part after `#`) names in `md`: a heading, or a `^block`; undefined if none. */
export function anchorLine(md: string, anchor: string): number | undefined {
  const lines = md.split("\n"), a = anchor.trim();
  const i = a.startsWith("^")
    ? lines.findIndex((l) => l.trimEnd().endsWith(` ${a}`) || l.trimEnd() === a)
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
