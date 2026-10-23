// Atlas chrome for CodeMirror as a *theme* extension: CM's built-in base theme (light gutters,
// `font-family: monospace`, …) outranks plain stylesheet rules, but not a theme. Values are CSS
// variables, so one theme serves dark and light and follows the settings live.
import { EditorView } from "@codemirror/view";

export const atlasTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--bg)", color: "var(--text)", fontSize: "var(--code-size, 14px)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--code-font, var(--font-mono))", lineHeight: "1.5" },
  ".cm-content": { caretColor: "var(--accent)" },
  ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--accent)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": { backgroundColor: "var(--accent-sel)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--text) 3%, transparent)" },
  ".cm-gutters": { backgroundColor: "var(--bg)", color: "color-mix(in srgb, var(--text-faint) 80%, transparent)", border: "none", fontSize: ".86em" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--accent-strong)", fontWeight: "600" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--bg-active)", border: "none", color: "var(--text-muted)", borderRadius: "4px", padding: "0 6px" },
  ".cm-panels": { backgroundColor: "var(--bg-alt)", color: "var(--text)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  // the Problems list (lint panel): CodeMirror's selected row is light grey — unreadable on dark
  ".cm-panel.cm-panel-lint ul": { maxHeight: "180px" },
  ".cm-panel.cm-panel-lint ul [aria-selected]": { backgroundColor: "var(--accent-soft)", color: "var(--text)" },
  ".cm-panel.cm-panel-lint ul:focus [aria-selected]": { backgroundColor: "var(--accent-soft)", color: "var(--heading)" },
  ".cm-panel.cm-panel-lint li": { padding: "2px 10px", cursor: "pointer" },
  ".cm-panel.cm-panel-lint li:hover": { backgroundColor: "var(--bg-hover)" },
  ".cm-panel.cm-panel-lint button[name=close]": { color: "var(--text-muted)" },
  ".cm-tooltip": { backgroundColor: "var(--bg-elev)", border: "1px solid var(--border-strong)", color: "var(--text)" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent-soft)", color: "var(--text)" },
  // lines that differ from git (git-gutter.ts): a thin bar; a removal is a small tick at the top of the line
  ".cm-git-gutter": { width: "3px", marginRight: "2px" },
  ".cm-git-gutter .cm-gutterElement": { padding: "0" },
  ".cm-git-added": { backgroundColor: "var(--green)" },
  ".cm-git-changed": { backgroundColor: "var(--accent)" },
  ".cm-git-removed": { boxShadow: "inset 0 3px 0 var(--red)" },
  // the formula under the caret, drawn while it is typed (math-preview.ts)
  ".cm-math-preview": { padding: "8px 12px", borderRadius: "var(--radius)", maxWidth: "min(640px, 80vw)", overflowX: "auto", fontSize: "1.05em", boxShadow: "var(--shadow-pop)" },
  // a display formula's drawing in the text (math-preview.ts): no box, no shadow — part of the page, under its source
  ".cm-math-preview.cm-math-preview-block": { boxShadow: "none", borderRadius: "0", maxWidth: "none", padding: "6px 0 10px", textAlign: "center", borderLeft: "2px solid var(--accent-soft)" },
  // the completion list (snippets, commands) is always over a formula's floating drawing, never under it
  ".cm-tooltip.cm-tooltip-autocomplete": { zIndex: "600" }, // CodeMirror gives every tooltip 500
  ".cm-math-preview .stale": { opacity: ".45" },
  ".cm-math-preview .why": { marginTop: "4px", color: "var(--red)", fontFamily: "var(--font-mono)", fontSize: ".72em", whiteSpace: "pre-wrap" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--yellow) 28%, transparent)", outline: "none" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "color-mix(in srgb, var(--orange) 45%, transparent)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--yellow) 16%, transparent)" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--accent-soft)", outline: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)" },
});
