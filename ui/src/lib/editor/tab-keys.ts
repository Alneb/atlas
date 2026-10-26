// Tab in the editor: walking an open completion list (notes) or taking its entry (code), waiting briefly for a list
// still on its way, and Tab itself as in Obsidian and VS Code (a list item or a selection indents; elsewhere a tab).
// Split out of create.ts.
import { EditorView, keymap, runScopeHandlers, type KeyBinding } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { indentLess, indentMore, insertTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { acceptCompletion, closeCompletion, completionStatus, currentCompletions, selectedCompletionIndex, moveCompletionSelection, hasNextSnippetField, hasPrevSnippetField } from "@codemirror/autocomplete";
import type { TaskCompletion } from "./md-complete";
import { latexOwnsTab, latexTakesTab } from "./latex-suite";

// a completion list open: Tab and Shift+Tab walk it, Enter takes the entry — over indentation, but never in math or
// over a snippet's own fields: inside \frac{…}{…} Tab still goes to the next field, list or no list
// A Tab typed while the list is still on its way (the task fields and [[ links ask the core) waits
// for it (≤ 250 ms) instead of indenting under it — the list then never showed ("the tab and the
// autocompletion are still kind of broken"); no list: the key goes on to snippets and indentation.
const LIST_WAIT_MS = 250;
let replaying = false;
// Tab as in Obsidian (notes) and VS Code (code): a selection's lines, or a list item, are indented; anywhere
// else a tab (a note) or one indent unit (code) is typed at the caret. CodeMirror's indentWithTab indented the
// whole line from anywhere in it, instead of typing a tab character.
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;
export const tabKey = (md: boolean): KeyBinding => ({
  key: "Tab",
  run: (v) => {
    const { ranges } = v.state.selection;
    if (ranges.some((r) => !r.empty) || (md && ranges.every((r) => LIST_ITEM.test(v.state.doc.lineAt(r.head).text)))) return indentMore(v);
    if (md) return insertTab(v);
    const unit = v.state.facet(indentUnit);
    v.dispatch(v.state.replaceSelection(unit), { scrollIntoView: true, userEvent: "input" });
    return true;
  },
  shift: indentLess,
});

// every task field, offered because nothing typed matched one (Obsidian Tasks' list): Tab there indents
// the task, as in Obsidian, instead of walking the list
const browsingTasks = (v: EditorView) => (currentCompletions(v.state)[0] as TaskCompletion | undefined)?.browsing === true;
// the task list as it opens by itself on a task line, ⏎ still selected: one Escape closes it and reaches vim
// (it is there on every task line now — two Escapes to leave insert mode would be the rule, not the exception)
export const untouchedTaskList = (v: EditorView) =>
  completionStatus(v.state) === "active" && (currentCompletions(v.state)[selectedCompletionIndex(v.state) ?? -1] as TaskCompletion | undefined)?.task?.icon === "new_line";
// what Tab does to an open list: walk it (notes: Tab moves down, Enter takes it) or take
// the entry (code, as VS Code: with one entry, walking did nothing at all)
const walkList = (down: boolean, take = false) => (v: EditorView): boolean => {
  // in math Tab is LaTeX's (stops, tabout, triggers) and a list there is taken with Enter — but a `\command`'s list is
  // walked; a snippet's stops always win
  if (replaying || (down ? hasNextSnippetField : hasPrevSnippetField)(v.state) || latexTakesTab(v)) return false;
  // a list on screen is "pending" while any source still answers (a language server re-asked at every key):
  // it is there to walk all the same — waiting for "active" closed it and indented instead
  const shown = (view: EditorView) => currentCompletions(view.state).length > 0;
  const status = shown(v) ? "active" : completionStatus(v.state);
  const act = (view: EditorView) => (take && down ? acceptCompletion(view) : moveCompletionSelection(down)(view));
  if (status === "active" && browsingTasks(v)) return false;
  if (status === "active") return act(v);
  if (status !== "pending" || latexOwnsTab(v)) return false;
  const t0 = performance.now(), doc = v.state.doc;
  let frames = 0; // frames the list has been open: a later source's answer would reset the selection
  const settle = () => {
    if (v.state.doc !== doc) return; // typed on meanwhile: that key wins
    const now = shown(v) ? "active" : completionStatus(v.state);
    if (now === "active" && browsingTasks(v)) frames = -1; // replayed below: the Tab indents
    else if (now === "active" && ++frames >= 6) { act(v); return; }
    if (now === "active" && frames >= 0) { requestAnimationFrame(settle); return; }
    if (now === "pending" && performance.now() - t0 < LIST_WAIT_MS) { requestAnimationFrame(settle); return; }
    if (now === "pending") closeCompletion(v);
    replaying = true;
    try { runScopeHandlers(v, new KeyboardEvent("keydown", { key: "Tab", shiftKey: !down }), "editor"); } finally { replaying = false; }
  };
  requestAnimationFrame(settle);
  return true;
};
export const completionTab = Prec.highest(keymap.of([{ key: "Tab", run: walkList(true) }, { key: "Shift-Tab", run: walkList(false) }]));
export const codeCompletionTab = Prec.highest(keymap.of([{ key: "Tab", run: walkList(true, true) }, { key: "Shift-Tab", run: walkList(false) }]));
