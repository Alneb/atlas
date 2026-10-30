// Inlay hints (`textDocument/inlayHint`): what the language server draws inside the code, faint — a parameter's name
// at a call, the type a variable was given. Asked for the visible part a moment after an edit or a scroll; shown
// while `[lsp] inlay_hints` is on (Settings → Code).
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { LSPPlugin } from "@codemirror/lsp-client";
import { settings, onSettings } from "../settings.svelte";

type Hint = { position: { line: number; character: number }; label: string | { value: string }[]; paddingLeft?: boolean; paddingRight?: boolean };

class HintWidget extends WidgetType {
  constructor(readonly text: string, readonly left: boolean, readonly right: boolean) { super(); }
  eq(o: HintWidget): boolean { return o.text === this.text && o.left === this.left && o.right === this.right; }
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-inlay-hint";
    el.textContent = this.text;
    el.classList.toggle("pad-left", this.left);
    el.classList.toggle("pad-right", this.right);
    return el;
  }
  ignoreEvent(): boolean { return false; }
}

const WAIT = 400;
const on = () => settings.config?.lsp.inlay_hints !== false;

export const inlayHints = ViewPlugin.fromClass(class {
  hints: DecorationSet = Decoration.none;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private asked = 0;
  private off: () => void;
  constructor(readonly view: EditorView) {
    this.off = onSettings(() => this.schedule());
  }
  update(u: ViewUpdate): void {
    if (u.docChanged) this.hints = this.hints.map(u.changes);
    if (u.docChanged || u.viewportChanged) this.schedule();
  }
  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.ask(), WAIT);
  }
  async ask(): Promise<void> {
    const n = ++this.asked, view = this.view, p = LSPPlugin.get(view);
    if (!p || !on()) {
      if (this.hints.size) { this.hints = Decoration.none; view.dispatch({}); }
      return;
    }
    p.client.sync();
    const doc = view.state.doc, { from, to } = view.viewport;
    const list = await p.client.request<unknown, Hint[] | null>("textDocument/inlayHint", { textDocument: { uri: p.uri }, range: { start: p.toPosition(from), end: p.toPosition(to) } }).catch(() => null);
    if (n !== this.asked || !list || view.state.doc !== doc) return; // a newer ask, or the text changed meanwhile
    // a server may answer for an older version of the text (or a wrong line): such a hint is dropped, never thrown on
    const marks = list.filter((h) => h.position.line < doc.lines).map((h) => {
      const text = typeof h.label === "string" ? h.label : h.label.map((x) => x.value).join("");
      const line = doc.line(h.position.line + 1);
      return Decoration.widget({ widget: new HintWidget(text, !!h.paddingLeft, !!h.paddingRight), side: 1 }).range(Math.min(line.to, line.from + h.position.character));
    });
    this.hints = Decoration.set(marks, true);
    view.dispatch({});
  }
  destroy(): void {
    clearTimeout(this.timer);
    this.off();
  }
}, { decorations: (v) => v.hints });
