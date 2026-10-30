// The completion list's order: how well a snippet answers the letters typed.
import type { Compiled } from "./format";

/** `q`'s letters in order in `s`, the first at the start of one of its words: `lrar` in "left right arrow". */
const fuzzy = (q: string, s: string) => {
  let i = 0;
  for (let j = 0; j < s.length && i < q.length; j++) {
    if (s[j] !== q[i]) continue;
    if (i === 0 && j > 0 && /[a-z]/.test(s[j - 1])) continue; // the first letter starts a word
    i++;
  }
  return i === q.length;
};

/** How well a snippet answers what was typed, best first: its trigger begins so, its name holds it, its name has it
 *  in order. `null`: not at all. Names count from three letters, so a short start lists triggers only. */
export function rank(s: Compiled, typed: string): number | null {
  const trigger = s.plain!.trim();
  if (trigger.startsWith(typed) && trigger !== typed) return 0;
  const lower = typed.toLowerCase(), name = s.name?.toLowerCase();
  if (typed.length < 3 || !name) return null;
  if (name.includes(lower)) return 1;
  return fuzzy(lower, name) ? 2 : null;
}
