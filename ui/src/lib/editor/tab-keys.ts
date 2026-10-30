// Tab in the editor: walking an open completion list (notes) or taking its entry (code), waiting briefly for a list
// still on its way, and Tab itself as in Obsidian and VS Code (a list item or a selection indents; elsewhere a tab).
// Split out of create.ts.
import { EditorView, keymap, runScopeHandlers, type KeyBinding } from "@codemirror/view";
import { EditorSelection, Prec } from "@codemirror/state";
import { indentLess, indentMore, insertTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { acceptCompletion, closeCompletion, completionStatus, currentCompletions, selectedCompletionIndex, moveCompletionSelection, hasNextSnippetField, hasPrevSnippetField } from "@codemirror/autocomplete";
import type { TaskCompletion } from "./md-complete";
import { tabOverList, tabWhileAsking } from "./plugin-hooks";

// a completion list open: Tab and Shift+Tab walk it, Enter takes the entry — over indentation, but never in math or
// over a snippet's own fields: inside \frac{…}{…} Tab still goes to the next field, list or no list
// A Tab typed while the list is still on its way (the task fields and [[ links ask the core) waits
// for it (≤ 250 ms) instead of indenting under it — the list then never showed ("the tab and the
// autocompletion are still kind of broken"); no list: the key goes on to snippets and indentation.
const LIST_WAIT_MS = 250;
let replaying = false;
// Tab as in Obsidian (notes) and VS Code (code): a selection's lines, or a list item, are indented; anywhere
// else a tab (a note) or the way to the next indent stop (code) is typed at the caret. CodeMirror's indentWithTab indented the
// whole line from anywhere in it, instead of typing a tab character.
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s/;
export const tabKey = (md: boolean): KeyBinding => ({
  key: "Tab",
  run: (v) => {
    const { ranges } = v.state.selection;
    if (ranges.some((r) => !r.empty) || (md && ranges.every((r) => LIST_ITEM.test(v.state.doc.lineAt(r.head).text)))) return indentMore(v);
    if (md) return insertTab(v);
    // to the next multiple of the unit, as VS Code: from column 2 of a four-space file, two spaces, not four
    const unit = v.state.facet(indentUnit), state = v.state;
    const change = state.changeByRange((r) => {
      const col = r.head - state.doc.lineAt(r.head).from;
      const insert = unit === "\t" ? unit : " ".repeat(unit.length - (col % unit.length));
      return { changes: { from: r.head, insert }, range: EditorSelection.cursor(r.head + insert.length) };
    });
    v.dispatch(change, { scrollIntoView: true, userEvent: "input" });
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
// `take`: a code file's (Tab takes the entry; no wait for a list not yet shown)
const walkList = (down: boolean, take = false) => (v: EditorView): boolean => {
  // a plugin may hold Tab (the snippets': their stops, out of a bracket in math), and the list is then taken with Enter
  if (replaying || (down ? hasNextSnippetField : hasPrevSnippetField)(v.state) || tabOverList(v)) return false;
  // a list on screen is "pending" while any source still answers (a language server re-asked at every key):
  // it is there to walk all the same — waiting for "active" closed it and indented instead
  const shown = (view: EditorView) => currentCompletions(view.state).length > 0;
  // in code, a list on screen is taken as it is; in a note it may be what was offered before this key, whose answer is
  // on its way: Tab goes to the new list
  const statusOf = (view: EditorView) => (take && shown(view) ? "active" : completionStatus(view.state));
  const status = statusOf(v);
  const act = (view: EditorView) => (take && down ? acceptCompletion(view) : moveCompletionSelection(down)(view));
  if (status === "active" && browsingTasks(v)) return false;
  if (status === "active") return act(v);
  // code (VS Code): no list on screen, Tab indents at once — a language server asked at every key kept a list
  // "pending", and a key typed during the wait dropped the Tab
  if (status !== "pending" || take || tabWhileAsking(v)) return false;
  const t0 = performance.now(), doc = v.state.doc;
  let frames = 0; // frames the list has been open: a later source's answer would reset the selection
  const settle = () => {
    if (v.state.doc !== doc) return; // typed on meanwhile: that key wins
    const now = statusOf(v);
    if (now === "active" && browsingTasks(v)) frames = -1; // replayed below: the Tab indents
    else if (now === "active" && ++frames >= 6) { act(v); return; }
    if (now === "active" && frames >= 0) { requestAnimationFrame(settle); return; }
    if (now === "pending" && performance.now() - t0 < LIST_WAIT_MS) { requestAnimationFrame(settle); return; }
    if (now === "pending" && shown(v)) { act(v); return; } // the answer is late: the list on screen is what there is
    if (now === "pending") closeCompletion(v);
    replaying = true;
    try { runScopeHandlers(v, new KeyboardEvent("keydown", { key: "Tab", shiftKey: !down }), "editor"); } finally { replaying = false; }
  };
  requestAnimationFrame(settle);
  return true;
};
export const completionTab = Prec.highest(keymap.of([{ key: "Tab", run: walkList(true) }, { key: "Shift-Tab", run: walkList(false) }]));
export const codeCompletionTab = Prec.highest(keymap.of([{ key: "Tab", run: walkList(true, true) }, { key: "Shift-Tab", run: walkList(false, true) }]));
