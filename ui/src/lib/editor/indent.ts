// A code file's indentation, read from its text as VS Code does ("detect indentation"): what Tab, Enter and the
// indent commands insert. CodeMirror's default (two spaces) put two-space lines into four-space Python files.
import { indentUnit } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

const FALLBACK = "    "; // VS Code's default for a file with no indented line
const SCAN = 10_000; // lines looked at

/** The file's indent unit: a tab when tab-indented lines are the most, else the most common step between the space
 *  indents of consecutive lines (2, 4, 8…); null when nothing is indented. Pure (tested through the editor). */
export function detectIndent(text: string): string | null {
  let tabs = 0, spaced = 0, prev = 0;
  const steps = new Map<number, number>();
  const lines = text.split("\n", SCAN);
  for (const line of lines) {
    if (!line.trim()) continue; // a blank line says nothing (and keeps the previous width)
    if (line[0] === "\t") { tabs++; prev = 0; continue; }
    const width = line.length - line.trimStart().length;
    if (width) spaced++;
    const step = Math.abs(width - prev);
    if (step > 1 && step <= 8) steps.set(step, (steps.get(step) ?? 0) + 1); // a 1-space shift is alignment, not indent
    prev = width;
  }
  if (!tabs && !spaced) return null;
  if (tabs > spaced) return "\t";
  let best = 0, seen = 0;
  for (const [step, n] of steps) if (n > seen || (n === seen && step < best)) { best = step; seen = n; }
  return best ? " ".repeat(best) : null;
}

/** The indent unit for a code file opened with `text`. */
export const codeIndent = (text: string): Extension => indentUnit.of(detectIndent(text) ?? FALLBACK);
