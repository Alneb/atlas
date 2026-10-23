// The editor's Vim glue: the ex commands (:w, :q, :wq, :x) per view, the mode's label for the status bar, a visual
// selection kept across a paste, and the "desktop" key mode (Ctrl+C/X/V/Z/Y/A as everywhere). Split out of create.ts.
import { EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { redo, selectAll, undo } from "@codemirror/commands";
import { getCM, Vim } from "@replit/codemirror-vim";
import { settings } from "../settings.svelte";
import { superOf } from "../keys";

export type VimModeLabel = "NORMAL" | "INSERT" | "VISUAL" | "V-LINE" | "V-BLOCK" | "REPLACE" | "";

// Per-view hooks for the global ex commands (:w, :q, :wq) — vim's ex table is process-wide.
export const exHooks = new WeakMap<EditorView, { save?: () => void; quit?: () => void }>();
let exDefined = false;
export function defineEx(): void {
  if (exDefined) return;
  exDefined = true;
  const hooks = (cm: { cm6?: EditorView }) => (cm.cm6 ? exHooks.get(cm.cm6) : undefined);
  Vim.defineEx("write", "w", (cm: { cm6?: EditorView }) => hooks(cm)?.save?.());
  Vim.defineEx("quit", "q", (cm: { cm6?: EditorView }) => hooks(cm)?.quit?.());
  Vim.defineEx("wq", "wq", (cm: { cm6?: EditorView }) => { const h = hooks(cm); h?.save?.(); h?.quit?.(); });
  Vim.defineEx("xit", "x", (cm: { cm6?: EditorView }) => { const h = hooks(cm); h?.save?.(); h?.quit?.(); });
}

export function modeLabel(e: { mode?: string; subMode?: string } | undefined): VimModeLabel {
  switch (e?.mode) {
    case "insert": return "INSERT";
    case "replace": return "REPLACE";
    case "visual": return e.subMode === "linewise" ? "V-LINE" : e.subMode === "blockwise" ? "V-BLOCK" : "VISUAL";
    default: return "NORMAL";
  }
}

// Vim drops its visual selection on the paste keystroke (Ctrl+V is block-visual, so pasting is
// Ctrl+Shift+V), and the paste then lands at the caret. Remember the selection on the keydown and
// put it back for the paste, so it replaces the selection (or becomes [text](url) in a note).
const visualStash = new WeakMap<EditorView, { from: number; to: number; t: number }>();
export function stashVisual(v: EditorView): void {
  const sel = v.state.selection.main;
  if (!sel.empty && (getCM(v) as { state?: { vim?: { visualMode?: boolean } } } | null)?.state?.vim?.visualMode)
    visualStash.set(v, { from: sel.from, to: sel.to, t: Date.now() });
}
export function restoreVisual(v: EditorView): void {
  const s = visualStash.get(v);
  visualStash.delete(v);
  if (!s || Date.now() - s.t > 1000 || !v.state.selection.main.empty || s.to > v.state.doc.length) return;
  v.dispatch({ selection: { anchor: s.from, head: s.to } });
  // like `p` over a visual selection: back in normal mode once the paste is in
  queueMicrotask(() => { const cm = getCM(v); if (cm?.state.vim?.insertMode) Vim.exitInsertMode(cm as never); });
}

// The second vim mode (`[editor] vim_keys = "desktop"`): the six keys every other program uses
// do what they do everywhere, in normal, visual and insert mode. Copy, cut and paste are the
// browser's own — the key must simply not be taken by vim, and vim's key handler has no "skip this
// one": it returns at once when the editor has no vim state, so the state is put aside for the
// length of this one key event. Undo, redo and select-all are CodeMirror's commands.
export const desktopKeys = Prec.highest(EditorView.domEventHandlers({
  keydown: (e, view) => {
    if (settings.config?.editor.vim_keys !== "desktop" || !e.ctrlKey || e.altKey || superOf(e)) return false;
    const cm = getCM(view) as { state: { vim?: { visualMode?: boolean; insertMode?: boolean } | null } } | null;
    if (!cm?.state.vim) return false; // vim is off: the keys are already the usual ones
    const key = e.key.toLowerCase();
    if (!e.shiftKey && (key === "c" || key === "x" || key === "v")) {
      const vimState = cm.state.vim;
      cm.state.vim = null;
      queueMicrotask(() => {
        cm.state.vim = vimState;
        // after a cut or a paste over a selection there is nothing selected: leave visual mode
        if (key !== "c") setTimeout(() => { if (cm.state.vim?.visualMode && view.state.selection.main.empty) Vim.exitVisualMode(cm as never); }, 0);
      });
      return false; // not handled here: the browser copies, cuts or pastes
    }
    if (key === "z" && !e.shiftKey) return undo(view) || true;
    if (key === "y" || (key === "z" && e.shiftKey)) return redo(view) || true;
    if (key === "a" && !e.shiftKey) return selectAll(view);
    return false;
  },
}));
