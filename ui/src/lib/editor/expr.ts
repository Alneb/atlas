// Inline expressions and section properties in the editor (docs/guides/EXPRESSIONS.md):
//   `= days(note.due)`   inline code that starts with `=` shows its value; the source comes back while
//                        the caret is in it. Right-click the value: copy it, or freeze it as text.
//   key:: value          a property of the section it is in; the key is dimmed so the value reads first
import { Prec, RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { mount, unmount } from "svelte";
import ContextMenu from "../../components/ContextMenu.svelte";
import { exprOf, renderExpr } from "../expr";

const FIELD = /^(\s*(?:[-*+]\s+(?:\[.\]\s+)?)?)([\p{L}_][\p{L}\p{N}_ /-]*?::)(?=\s|$)/u;
const keyMark = Decoration.mark({ class: "cm-field-key" });

// one string per document version, shared by all the expressions of a redraw
const texts = new WeakMap<object, string>();
const textOf = (view: EditorView) => { const d = view.state.doc; let t = texts.get(d); if (t === undefined) texts.set(d, (t = d.toString())); return t; };

class ExprWidget extends WidgetType {
  constructor(readonly expr: string, readonly path: string, readonly line: number) { super(); }
  // every edit redraws (the scope may have changed); lib/expr.ts asks again only when it did
  eq(): boolean { return false; }
  updateDOM(el: HTMLElement, view: EditorView): boolean { renderExpr(el, this.expr, this.path, textOf(view), this.line); return true; }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement("code");
    el.className = "cm-inline-code";
    renderExpr(el, this.expr, this.path, textOf(view), this.line);
    el.addEventListener("contextmenu", (e) => { e.preventDefault(); menu(e, el, view); });
    return el;
  }
  ignoreEvent(): boolean { return false; } // a click puts the caret in the source, which then shows
}

/** The value as a thing of its own (Potluck: results are reified): copy it, or replace the formula by it. */
function menu(e: MouseEvent, el: HTMLElement, view: EditorView): void {
  const value = el.dataset.value ?? "";
  // where the formula is now (the text before it may have changed since the widget was drawn)
  const at = () => { const n = syntaxTree(view.state).resolveInner(view.posAtDOM(el), 1); return n.name === "InlineCode" ? n : n.parent?.name === "InlineCode" ? n.parent : null; };
  const m = mount(ContextMenu, { target: document.body, props: {
    x: e.clientX, y: e.clientY, onclose: () => void unmount(m),
    items: [
      { label: "Copy value", icon: "copy", run: () => void navigator.clipboard.writeText(value).catch(() => {}) },
      { label: "Freeze as text (replace the formula)", icon: "check", run: () => { const n = at(); if (n && value) view.dispatch({ changes: { from: n.from, to: n.to, insert: value } }); } },
      { label: "Edit the formula", icon: "edit", run: () => { const n = at(); if (n) { view.dispatch({ selection: { anchor: n.from + 1 } }); view.focus(); } } },
    ],
  } });
}

function build(view: EditorView, path: string): DecorationSet {
  const { state } = view, sel = state.selection.main;
  const found: { from: number; to: number; deco: Decoration }[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({ from, to, enter: (n) => {
      if (n.name !== "InlineCode") return;
      const expr = exprOf(state.sliceDoc(n.from, n.to).replace(/^`+|`+$/g, "").trim());
      if (expr === null || (sel.from <= n.to && sel.to >= n.from)) return; // the caret is in it: show the source
      found.push({ from: n.from, to: n.to, deco: Decoration.replace({ widget: new ExprWidget(expr, path, state.doc.lineAt(n.from).number) }) });
    } });
    for (let pos = from; pos <= to;) {
      const line = state.doc.lineAt(pos);
      const f = FIELD.exec(line.text);
      if (f && syntaxTree(state).resolveInner(line.from + f[1].length, 1).name !== "FencedCode") found.push({ from: line.from + f[1].length, to: line.from + f[1].length + f[2].length, deco: keyMark });
      pos = line.to + 1;
    }
  }
  const b = new RangeSetBuilder<Decoration>();
  for (const d of found.sort((a, c) => a.from - c.from || a.to - c.to)) b.add(d.from, d.to, d.deco);
  return b.finish();
}

export function expressions(path: string): Extension {
  return Prec.high(ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view, path); }
    update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = build(u.view, path); }
  }, { decorations: (v) => v.decorations }));
}
