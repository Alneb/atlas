// Typing aids for display math in a note.
import type { Command } from "@codemirror/view";
import { mathMode } from "./math-context";

/** Enter after a `$$` that opens a formula alone on its line: the closer comes with it, the caret between. An opener
 *  left unclosed paired with the next formula's own `$$` and turned the text between into math until the closer was
 *  typed. A `$$` that closes a formula (the text above it is in display math) is left alone. */
export const closeDisplayMath: Command = (view) => {
  const r = view.state.selection.main;
  if (!r.empty) return false;
  const line = view.state.doc.lineAt(r.head);
  const m = /^(\s*(?:>\s*)*)\$\$$/.exec(line.text);
  if (!m || r.head !== line.to) return false;
  const before = view.state.doc.sliceString(0, line.from);
  if ((before.match(/^[ \t>]*(```|~~~)/gm)?.length ?? 0) % 2 === 1) return false; // in a code block: text
  if (mathMode(before, line.from) !== null) return false;
  const lead = m[1];
  view.dispatch({ changes: { from: r.head, insert: `\n${lead}\n${lead}$$` }, selection: { anchor: r.head + 1 + lead.length }, userEvent: "input" });
  return true;
};
