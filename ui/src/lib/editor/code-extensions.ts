// What a code file's editor adds to the shared base (create.ts): its language (loaded lazily), its language server's
// slot, its indentation (indent.ts), brackets, folds, the settings-driven gutters (line numbers, git, indent guides, minimap), the tool bar's
// commands (components/CodeBar.svelte) and the problem counts.
import { Compartment, Prec, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, crosshairCursor, highlightActiveLineGutter, lineNumbers } from "@codemirror/view";
import { bracketMatching, foldGutter, foldKeymap, syntaxHighlighting } from "@codemirror/language";
import { gotoLine, openSearchPanel } from "@codemirror/search";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { LSPPlugin, formatDocument } from "@codemirror/lsp-client";
import { forEachDiagnostic } from "@codemirror/lint";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { showMinimap } from "@replit/codemirror-minimap";
import type { WorkspaceConfig } from "../types";
import type { Problems } from "../state.svelte";
import { gitGutter } from "./git-gutter";
import { atlasHighlight } from "./highlight-style";
import { codeCompletionTab } from "./tab-keys";
import { codeIndent } from "./indent";

/** Settings-driven code options; reconfigured live when the config changes. */
export function codeOptions(c: WorkspaceConfig | null): Extension {
  const e = c?.editor ?? { line_numbers: true, wrap_code: false, indent_guides: true, minimap: true, git_gutter: true };
  return [
    e.line_numbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
    e.git_gutter ? gitGutter : [],
    e.wrap_code ? EditorView.lineWrapping : [],
    e.indent_guides ? indentationMarkers({ thickness: 1, colors: { light: "var(--border)", dark: "var(--border)", activeLight: "var(--border-strong)", activeDark: "var(--border-strong)" } }) : [],
    e.minimap ? showMinimap.compute([], () => ({ create: () => ({ dom: document.createElement("div") }), displayText: "blocks", showOverlay: "mouse-over" })) : [],
  ];
}

export function codeExtensions(lang: Compartment, opts: Compartment, lsp: Compartment, cfg: WorkspaceConfig | null, doc: string): Extension {
  return [
    codeIndent(doc), // ahead of the language's: the file's own indentation wins
    lsp.of([]),
    opts.of(codeOptions(cfg)),
    foldGutter({ openText: "▾", closedText: "▸" }),
    lang.of([]),
    syntaxHighlighting(atlasHighlight),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    codeCompletionTab,
    crosshairCursor(),
    // VS Code's Ctrl+G; the rest of its editing keys are CodeMirror's own (docs/guides/DEVELOPING.md, "Keys")
    Prec.high(keymap.of([{ key: "Mod-g", run: gotoLine }])), // over the search keymap's "find next" (still F3)
    keymap.of([...closeBracketsKeymap, ...foldKeymap, ...completionKeymap]),
    EditorView.editorAttributes.of({ class: "code-cm" }),
  ];
}

/** What the code tab's tool bar runs (components/CodeBar.svelte): the same commands as the keys. */
export const codeTools = {
  find: (v: EditorView) => openSearchPanel(v),
  replace: (v: EditorView) => openReplace(v),
  gotoLine: (v: EditorView) => gotoLine(v),
  /** False when the file has no language server (nothing to format with). */
  format: (v: EditorView) => formatDocument(v),
  hasServer: (v: EditorView) => !!LSPPlugin.get(v),
};

/** The search panel with the caret in its replace field (the panel always has one). */
export function openReplace(v: EditorView): boolean {
  openSearchPanel(v);
  const field = v.dom.querySelector<HTMLInputElement>(".cm-search input[name=replace]");
  field?.focus();
  field?.select();
  return true;
}

export function countProblems(state: EditorState): Problems {
  const p = { errors: 0, warnings: 0 };
  forEachDiagnostic(state, (d) => { if (d.severity === "error") p.errors++; else if (d.severity === "warning") p.warnings++; });
  return p;
}
