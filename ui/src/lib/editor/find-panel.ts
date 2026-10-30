// The find panel, finished: words written as the rest of the app writes them, "3 of 12" beside the box, and the match
// nearest the caret selected as the query is typed (VS Code's habit; CodeMirror waits for Enter).
import { EditorState, type Extension, type Text } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { getSearchQuery, searchPanelOpen, setSearchQuery, type SearchQuery } from "@codemirror/search";
import { leaveVisual } from "./vim-glue";

const LIMIT = 9999; // counted no further: "9999+"

const phrases = EditorState.phrases.of({
  next: "Next", previous: "Previous", all: "All", "match case": "Match case", regexp: "Regex", "by word": "Whole word",
  replace: "Replace", "replace all": "Replace all", close: "Close",
});

/** Every match's start and end, read once per text and query: a caret move only looks its place up (`at`). */
interface Matches { doc: Text; q: SearchQuery; from: number[]; to: number[] }
function matches(state: EditorState, q: SearchQuery, last: Matches | null): Matches {
  if (last && last.doc === state.doc && last.q.eq(q)) return last;
  const m: Matches = { doc: state.doc, q, from: [], to: [] };
  if (!q.valid) return m;
  const cur = q.getCursor(state);
  for (let r = cur.next(); !r.done && m.from.length < LIMIT; r = cur.next()) { m.from.push(r.value.from); m.to.push(r.value.to); }
  return m;
}

/** Which match the selection is, 1-based (0: none) — a binary search over the starts. */
function at(m: Matches, from: number, to: number): number {
  let lo = 0, hi = m.from.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (m.from[mid] < from) lo = mid + 1; else hi = mid; }
  return m.from[lo] === from && m.to[lo] === to ? lo + 1 : 0;
}

const counter = ViewPlugin.fromClass(class {
  el: HTMLElement | null = null;
  found: Matches | null = null;
  constructor(readonly view: EditorView) { this.draw(); }
  update(u: ViewUpdate) {
    const typed = u.transactions.some((t) => t.effects.some((e) => e.is(setSearchQuery)));
    if (typed) this.jump(u.state);
    const open = searchPanelOpen(u.state);
    if (!open && searchPanelOpen(u.startState)) { this.found = null; this.closed(u.state); }
    if (open !== searchPanelOpen(u.startState) || (open && (typed || u.docChanged || u.selectionSet))) this.draw(); // closed: typing costs nothing
  }
  /** The first match at or after the selection's start, selected (after this update: no dispatch inside one). */
  jump(state: EditorState) {
    const q = getSearchQuery(state);
    if (!q.valid || !searchPanelOpen(state)) return;
    const m = q.getCursor(state, state.selection.main.from).next();
    if (m.done) return;
    const { from, to } = m.value;
    queueMicrotask(() => {
      if (getSearchQuery(this.view.state).eq(q)) this.view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true, userEvent: "select.search" });
    });
  }
  /** Vim: the match find selected put it in visual mode, where the next key ("i", "a"…) was a text object's; closing
   *  find leaves normal mode at the match's start, as `/` does. A selection that is not the match is left alone. */
  closed(state: EditorState) {
    const sel = state.selection.main, q = getSearchQuery(state);
    if (sel.empty || !q.valid) return;
    const m = q.getCursor(state, sel.from).next();
    if (m.done || m.value.from !== sel.from || m.value.to !== sel.to) return;
    queueMicrotask(() => { if (this.view.state.selection.main.eq(sel)) leaveVisual(this.view, sel.from); });
  }
  draw() {
    const panel = this.view.dom.querySelector(".cm-panel.cm-search");
    if (!panel) {
      this.el = null;
      // opened in this update: the panel's DOM comes after this plugin's turn
      if (searchPanelOpen(this.view.state)) requestAnimationFrame(() => { if (this.view.dom.querySelector(".cm-panel.cm-search")) this.draw(); });
      return;
    }
    const q = getSearchQuery(this.view.state);
    if (!this.el || !panel.contains(this.el)) {
      this.el = document.createElement("span");
      this.el.className = "cm-search-count";
      this.el.setAttribute("aria-live", "polite");
      panel.querySelector("input[name=search]")?.after(this.el);
    }
    const state = this.view.state, sel = state.selection.main;
    this.found = matches(state, q, this.found);
    const n = this.found.from.length, i = at(this.found, sel.from, sel.to);
    this.el.textContent = !q.search ? "" : !q.valid ? "Not a valid pattern" : !n ? "No matches" : `${i ? `${i} of ` : ""}${n}${n >= LIMIT ? "+" : ""}`;
    this.el.classList.toggle("none", !!q.search && !n);
  }
  destroy() { this.el?.remove(); this.found = null; }
});

export const findPanel = (): Extension => [phrases, counter];
