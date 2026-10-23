// Moving a section by its heading (the Outline's drag, Alt+Up/Down). Pure line arithmetic over the
// editor's heading list, so markdown and LaTeX share it; the editor applies the result as one edit.
export interface Head { level: number; text: string; line: number }

/** A section's lines [from, to) and the line it is put in front of (lines + 1 = the end). */
export interface SectionMove { from: number; to: number; dest: number }

/** First line after the section heading `i` opens: the next heading of its level or above. */
export function sectionEnd(heads: Head[], i: number, lines: number): number {
  const next = heads.find((h, k) => k > i && h.level <= heads[i].level);
  return next ? next.line : lines + 1;
}

/** Section `i` in front of heading `before` (heads.length = after the last one); null when that
 *  moves nothing: onto itself, into its own subsections, or to where it already is. */
export function moveBefore(heads: Head[], lines: number, i: number, before: number): SectionMove | null {
  if (!heads[i]) return null;
  const from = heads[i].line, to = sectionEnd(heads, i, lines);
  const dest = before >= heads.length ? lines + 1 : heads[before].line;
  return dest >= from && dest <= to ? null : { from, to, dest };
}

/** Section `i` past its neighbour of the same level, staying under the same parent. */
export function moveBy(heads: Head[], lines: number, i: number, step: -1 | 1): SectionMove | null {
  const level = heads[i]?.level;
  if (level === undefined) return null;
  const sibling = (k: number) => (heads[k] && heads[k].level === level ? k : -1);
  if (step < 0) {
    let k = i - 1;
    while (k >= 0 && heads[k].level > level) k--;
    return sibling(k) < 0 ? null : moveBefore(heads, lines, i, k);
  }
  const k = sibling(heads.findIndex((h, n) => n > i && h.level <= level));
  if (k < 0) return null;
  const after = heads.findIndex((h, n) => n > k && h.level <= level);
  return moveBefore(heads, lines, i, after < 0 ? heads.length : after);
}

/** The line the moved heading ends up on. */
export const landsOn = (m: SectionMove): number => (m.dest > m.from ? m.dest - (m.to - m.from) : m.dest);

/** The text of lines [lo, hi) after the move, and where in it the moved heading starts. Joined by
 *  lines, so a file without a final newline keeps its parts apart; when the part now first ends
 *  without a blank line and the part now last ends with one, that blank line goes between them. */
export function applyMove(line: (n: number) => string, m: SectionMove): { lo: number; hi: number; text: string; head: number } {
  const lo = Math.min(m.from, m.dest), hi = Math.max(m.to, m.dest), up = m.dest < m.from;
  const take = (a: number, b: number) => Array.from({ length: b - a }, (_, k) => line(a + k));
  const moved = take(m.from, m.to), rest = up ? take(m.dest, m.from) : take(m.to, m.dest);
  const first = up ? moved : rest, tail = up ? rest : moved;
  const shift = first[first.length - 1] !== "" && tail.length > 1 && tail[tail.length - 1] === "";
  const last = shift ? ["", ...tail.slice(0, -1)] : tail, lead = shift ? 1 : 0;
  return { lo, hi, text: [...first, ...last].join("\n"), head: up ? 0 : first.join("\n").length + 1 + lead };
}
