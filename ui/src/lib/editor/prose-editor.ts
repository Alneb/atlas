// A small editor for prose outside a note (a mail being written, a comment): Markdown with the note's syntax, wrapped
// lines, undo, and the plugins' editor hooks (plugin-hooks.ts: their keys, completions, raw extensions), so what helps
// in a note (Spelling's marks, the Predictor's ghost, Snippets) helps here too. No live preview, no vim, no file.
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderText, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { obsidianMarkdown } from "./live/obsidian-syntax.js";
import { pluginHooks } from "./plugin-hooks";
import { atlasTheme } from "./theme";

export interface ProseEditorOptions {
  text?: string;
  /** What the plugins are told the text is (`atlas.editor.path`): a `.md` name makes it a note's prose to them. */
  path?: string;
  placeholder?: string;
  /** The text changed (typed, pasted, or a plugin's edit). */
  onChange?: (text: string) => void;
  /** Keys of the host's own, ahead of the editor's (Ctrl+Enter to send). */
  keys?: { key: string; run: () => boolean }[];
  label?: string;
}

export interface ProseEditor {
  view: EditorView;
  text(): string;
  set(text: string): void;
  focus(): void;
  destroy(): void;
}

export function createProseEditor(parent: HTMLElement, o: ProseEditorOptions = {}): ProseEditor {
  const path = o.path ?? "draft.md";
  const extensions: Extension[] = [
    keymap.of((o.keys ?? []).map((k) => ({ key: k.key, run: () => k.run(), preventDefault: true }))),
    pluginHooks(path, /\.(md|markdown)$/i.test(path)),
    markdown({ base: markdownLanguage, extensions: [...obsidianMarkdown], addKeymap: false }),
    history(),
    drawSelection(),
    keymap.of([...historyKeymap, ...defaultKeymap]),
    EditorView.lineWrapping,
    atlasTheme,
    EditorView.contentAttributes.of({ "aria-label": o.label ?? "Text", spellcheck: "false" }),
    o.placeholder ? placeholderText(o.placeholder) : [],
    EditorView.updateListener.of((u) => { if (u.docChanged) o.onChange?.(u.state.doc.toString()); }),
  ];
  const view = new EditorView({ parent, state: EditorState.create({ doc: o.text ?? "", extensions }) });
  return {
    view,
    text: () => view.state.doc.toString(),
    set: (text) => { if (text !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
