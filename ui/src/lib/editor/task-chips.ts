// A task line's fields as chips in the note (lib/task-chips.ts draws them): on every task line but
// the ones the caret or selection is on, which show their text to edit — the live preview's rule.
// `[editor] task_chips` (on) switches it, read at each redraw.
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { chipEl, chipsOf, type Chip } from "../task-chips";

const TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]\s/;

class ChipWidget extends WidgetType {
  constructor(readonly chip: Chip) { super(); }
  eq(o: ChipWidget) { return o.chip.text === this.chip.text && o.chip.kind === this.chip.kind && o.chip.tone === this.chip.tone; }
  toDOM() { return chipEl(this.chip); }
  ignoreEvent() { return false; } // a click puts the caret there, which shows the text
}

function build(view: EditorView, on: () => boolean): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  if (!on()) return b.finish();
  const { state } = view;
  const editing = new Set(state.selection.ranges.flatMap((r) => {
    const a = state.doc.lineAt(r.from).number, z = state.doc.lineAt(r.to).number;
    return Array.from({ length: z - a + 1 }, (_, i) => a + i);
  }));
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = state.doc.lineAt(pos);
      const task = editing.has(line.number) ? null : TASK.exec(line.text);
      if (task) {
        for (const c of chipsOf(line.text, new Date(), task[1] !== " ")) b.add(line.from + c.from, line.from + c.to, Decoration.replace({ widget: new ChipWidget(c) }));
      }
      pos = line.to + 1;
    }
  }
  return b.finish();
}

export function taskChips(on: () => boolean) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view, on); }
    update(u: ViewUpdate) { if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) this.decorations = build(u.view, on); }
  }, { decorations: (v) => v.decorations });
}
