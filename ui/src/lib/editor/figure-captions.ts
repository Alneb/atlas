// A figure in the editor (lib/equations.ts): off the caret's line, an embed line's block id (`![[gap.png|…]] ^fig-gap`)
// gives way to its caption, "Figure 2. The gap closes", under the picture — as the reading view draws it. On the
// caret's line the id shows, to be edited.
import { RangeSetBuilder, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { FIGURE_LINE, figureCaption, type Equations } from "../equations";

class Caption extends WidgetType {
  constructor(readonly n: string, readonly text: string) { super(); }
  eq(o: Caption) { return o.n === this.n && o.text === this.text; }
  toDOM() {
    const el = document.createElement("span"), b = document.createElement("b");
    el.className = "cm-figure-caption";
    b.textContent = `Figure ${this.n}.`;
    el.append(b, this.text ? ` ${this.text}` : "");
    return el;
  }
}

function captions(view: EditorView, equationsOf: (s: EditorState) => Equations): DecorationSet {
  const { state } = view, b = new RangeSetBuilder<Decoration>();
  const figures = equationsOf(state).figures;
  if (!figures.size) return Decoration.none;
  const caret = state.selection.ranges.map((r) => [state.doc.lineAt(r.from).number, state.doc.lineAt(r.to).number]);
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = state.doc.lineAt(pos);
      pos = line.to + 1;
      if (!line.text.includes("^") || caret.some(([a, z]) => line.number >= a && line.number <= z)) continue;
      const m = FIGURE_LINE.exec(line.text), n = m && figures.get(m[3]);
      if (!m || !n) continue;
      const id = /[ \t]+\^[A-Za-z0-9-]+[ \t]*$/.exec(line.text)!;
      const caption = figureCaption(m[1]);
      b.add(line.from + id.index, line.to, Decoration.replace({ widget: new Caption(n, caption) }));
    }
  }
  return b.finish();
}

export const figureCaptions = (equationsOf: (s: EditorState) => Equations) =>
  ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = captions(view, equationsOf); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = captions(u.view, equationsOf);
    }
  }, { decorations: (v) => v.decorations });
