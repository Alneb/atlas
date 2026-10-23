// A task's box in a note ticks the way Home's list does (the core's `tick_line`, POST /api/task/line): `✅ day` on
// a line written with the Tasks fields, the next occurrence of a recurring one above it; opened again, the date
// goes. The user: "the tasks completion only works in the home capture box, not in notes".
import type { EditorView } from "@codemirror/view";
import { api } from "../api";

const BOX = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;

/** Ticks (or opens again) the task on line `n`: the box flips at once, then the core's line replaces it — unless
 *  the line was edited meanwhile, or the core is unreachable (the flip stays). False when `n` is not a task. */
export function tickTaskLine(view: EditorView, n: number): boolean {
  const line = view.state.doc.line(n);
  const m = BOX.exec(line.text);
  if (!m) return false;
  const done = m[2] === " ";
  const at = line.from + m[1].length + 1;
  view.dispatch({ changes: { from: at, to: at + 1, insert: done ? "x" : " " }, userEvent: "input.task" });
  const flipped = view.state.doc.line(n).text;
  void api.taskLine(line.text, done).then(({ lines }) => {
    if (!view.dom.isConnected || n > view.state.doc.lines) return;
    const now = view.state.doc.line(n);
    const text = lines.join("\n");
    if (now.text === flipped && text !== flipped) view.dispatch({ changes: { from: now.from, to: now.to, insert: text }, userEvent: "input.task" });
  }, () => {});
  return true;
}
