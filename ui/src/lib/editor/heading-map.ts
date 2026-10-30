// Carries a note's headings over an edit that cannot have changed any: no touched line holds a heading's, a fence's or
// a LaTeX section's mark. Typing in a long note then costs no rescan of all its lines on every key.
import type { ChangeSet, Text } from "@codemirror/state";

export interface DocHead { level: number; text: string; line: number }
const MAY_MATTER = /[#`~\\]/;
const MAX_LINES = 200; // a bigger edit (a paste) is rescanned

/** True when lines `from`..`to` of `doc` hold nothing a heading or a fence is made of. */
function plain(doc: Text, from: number, to: number): boolean {
  const a = doc.lineAt(from).number, b = doc.lineAt(to).number;
  if (b - a > MAX_LINES) return false;
  for (let n = a; n <= b; n++) if (MAY_MATTER.test(doc.line(n).text)) return false;
  return true;
}

/** `heads` of `before` moved to `after`, or null when the edit may have changed them (scan again). */
export function mapHeadings(heads: DocHead[], before: Text, changes: ChangeSet, after: Text): DocHead[] | null {
  let ok = true;
  changes.iterChangedRanges((fA, tA, fB, tB) => { ok &&= plain(before, fA, tA) && plain(after, fB, tB); });
  if (!ok) return null;
  return heads.map((h) => ({ ...h, line: after.lineAt(changes.mapPos(before.line(h.line).from, 1)).number }));
}
