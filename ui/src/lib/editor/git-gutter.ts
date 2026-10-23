// A thin mark in the gutter of a code file beside every line that differs from what git has:
// green — a new line, blue — a changed one, a red tick — lines were removed here. It compares the
// file as saved with the index (`git diff`), is asked again after each save, and follows the text
// while it is edited. A file git does not know yet gets no marks (every line would be "new").
import { RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { GutterMarker, gutter, type EditorView } from "@codemirror/view";
import { api } from "../api";

import { changedLines, type LineChange } from "./patch-lines";
export { changedLines, type LineChange };

class Mark extends GutterMarker {
  elementClass: string;
  constructor(readonly kind: LineChange) { super(); this.elementClass = `cm-git-${kind}`; }
  eq(o: Mark): boolean { return o.kind === this.kind; }
}
const MARKS: Record<LineChange, Mark> = { added: new Mark("added"), changed: new Mark("changed"), removed: new Mark("removed") };

const setMarks = StateEffect.define<Map<number, LineChange>>();
const marks = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(value, tr) {
    for (const e of tr.effects) {
      if (!e.is(setMarks)) continue;
      const doc = tr.state.doc;
      return RangeSet.of([...e.value].filter(([n]) => n >= 1 && n <= doc.lines).sort((a, b) => a[0] - b[0]).map(([n, kind]) => MARKS[kind].range(doc.line(n).from)));
    }
    return tr.docChanged ? value.map(tr.changes) : value;
  },
});

export const gitGutter: Extension = [marks, gutter({ class: "cm-git-gutter", markers: (v) => v.state.field(marks) })];

/** Asks git again (after the file was loaded or saved) and redraws the marks. Quiet when the vault is not a repository. */
export async function refreshGitGutter(view: EditorView, path: string): Promise<void> {
  if (!view.state.field(marks, false)) return;
  let patch = "";
  try { patch = (await api.gitDiff(path)).patch; } catch { /* no git here, or the file is ignored: no marks */ }
  view.dispatch({ effects: setMarks.of(changedLines(patch)) });
}
