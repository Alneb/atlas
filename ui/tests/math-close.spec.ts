import { test, expect } from "@playwright/test";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { closeDisplayMath } from "../src/lib/editor/display-math";

// Enter after a lone `$$` that opens a formula brings its closer (display-math.ts), so an opener never
// pairs with the next formula's `$$` and turns the text between into math.

/** Enter at `|` in `doc`: the text after, with the caret as `|`, or null when the command leaves it to the next. */
function enter(doc: string): string | null {
  const at = doc.indexOf("|");
  let state = EditorState.create({ doc: doc.replace("|", ""), selection: { anchor: at } });
  const view = { get state() { return state; }, dispatch: (t: TransactionSpec) => { state = state.update(t).state; } } as unknown as EditorView;
  if (!closeDisplayMath(view)) return null;
  const s = state.doc.toString(), h = state.selection.main.head;
  return s.slice(0, h) + "|" + s.slice(h);
}

test("a lone $$ opener gets its closer; a closer, inline math and a quote's $$ are kept right", () => {
  expect(enter("text\n$$|")).toBe("text\n$$\n|\n$$");
  expect(enter("$$|\n\nmore\n\n$$\nx\n$$")).toBe("$$\n|\n$$\n\nmore\n\n$$\nx\n$$"); // an opener above an existing formula
  expect(enter("$$\nx = 1\n$$|")).toBeNull(); // the closer: Enter is a plain new line
  expect(enter("a $$|")).toBeNull(); // not alone on its line
  expect(enter("$$x|$$")).toBeNull();
  expect(enter("> $$|")).toBe("> $$\n> |\n> $$"); // in a quote, the quote's marks on each line
  expect(enter("```\n$$|")).toBeNull(); // in a code block: text
});
