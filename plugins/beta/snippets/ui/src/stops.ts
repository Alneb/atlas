// Tab stops: `$1`, `${2:placeholder}` (placeholders may hold braces: `${1:\hat{O}}`), `$0` the last place, one number
// in several places edited together. The stops of each expanded snippet are a group on a stack, so a snippet expanded
// inside another's stop hands Tab back to the outer one when its own are done. The app's CodeMirror comes in as `cm`.
import type { EditorState, Transaction } from "@codemirror/state";
import type { DecorationSet, EditorView } from "@codemirror/view";

type Span = { from: number; to: number };
/** One snippet's stops, in order (each one or more spans), and the one the caret is at. */
type Group = { stops: Span[][]; at: number };
export interface CM { state: typeof import("@codemirror/state"); view: typeof import("@codemirror/view") }

/** A body read: its text, and its stops as offsets into that text. `visual` fills `${VISUAL}`; `legacy`: `$0` comes first
 *  (LaTeX Suite's order), else last. */
export function parseStops(body: string, visual = "", legacy = false): { text: string; stops: Span[][] } {
  let text = "";
  const byNumber = new Map<number, Span[]>();
  const add = (n: number, s: Span) => (byNumber.get(n) ?? byNumber.set(n, []).get(n)!).push(s);
  for (let i = 0; i < body.length; ) {
    if (body.startsWith("${VISUAL}", i)) { text += visual; i += 9; continue; }
    const plain = /^\$(\d+)/.exec(body.slice(i, i + 6));
    if (plain) { add(Number(plain[1]), { from: text.length, to: text.length }); i += plain[0].length; continue; }
    const open = /^\$\{(\d+)(:|\})/.exec(body.slice(i, i + 8));
    if (open) {
      i += open[0].length;
      const from = text.length;
      if (open[2] === ":") {
        // the placeholder up to the brace that closes `${`, nested braces kept
        let depth = 0;
        for (; i < body.length; i++) {
          const c = body[i];
          if (c === "\\" && i + 1 < body.length) { text += c + body[++i]; continue; }
          if (c === "{") depth++;
          else if (c === "}" && depth-- === 0) break;
          text += c;
        }
        i++; // the closing brace
      }
      add(Number(open[1]), { from, to: text.length });
      continue;
    }
    text += body[i++];
  }
  const order = (n: number) => (!legacy && n === 0 ? Infinity : n);
  const stops = [...byNumber.keys()].sort((a, b) => order(a) - order(b)).map((n) => byNumber.get(n)!);
  // Tab after the last stop leaves the snippet: a stop at its end, unless `$0` says where, or the last one is there
  const last = stops[stops.length - 1];
  if (stops.length && (legacy || !byNumber.has(0)) && !last.some((s) => s.from === text.length)) stops.push([{ from: text.length, to: text.length }]);
  return { text, stops };
}

export function makeStops(cm: CM) {
  const { EditorSelection, StateEffect, StateField } = cm.state;
  const { Decoration, EditorView: View, WidgetType } = cm.view;
  const push = StateEffect.define<Group>();
  const moveTo = StateEffect.define<number>(); // the top group's stop
  const pop = StateEffect.define<null>();
  const clear = StateEffect.define<null>();

  const spanOf = (g: Group): Span => {
    const all = g.stops.flat();
    return { from: Math.min(...all.map((s) => s.from)), to: Math.max(...all.map((s) => s.to)) };
  };

  class EmptyStop extends WidgetType {
    toDOM() { const s = document.createElement("span"); s.className = "cm-snippetFieldPosition"; return s; }
    eq() { return true; }
    ignoreEvent() { return false; }
  }

  const stopsField = StateField.define<Group[]>({
    create: () => [],
    update(groups, tr: Transaction) {
      let out = groups;
      if (tr.docChanged && out.length) {
        out = out.map((g) => ({ at: g.at, stops: g.stops.map((st) => st.map((s) => ({ from: tr.changes.mapPos(s.from, -1), to: tr.changes.mapPos(s.to, 1) }))) }));
      }
      let moved = false;
      for (const e of tr.effects) {
        if (e.is(push)) { out = [...out, e.value]; moved = true; }
        else if (e.is(moveTo) && out.length) { out = [...out.slice(0, -1), { ...out[out.length - 1], at: e.value }]; moved = true; }
        else if (e.is(pop)) { out = out.slice(0, -1); moved = true; }
        else if (e.is(clear)) out = [];
      }
      // the caret left a snippet (a click, an arrow out of it), or reached its end (typed over its closing bracket): its
      // stops go, and those of every snippet it left
      if (tr.selection && !moved) {
        const head = tr.newSelection.main.head;
        while (out.length) {
          const g = out[out.length - 1], s = spanOf(g), end = g.stops[g.stops.length - 1];
          const atEnd = g.at < g.stops.length - 1 && end.length === 1 && end[0].from === end[0].to && head === end[0].from && !g.stops[g.at].some((r) => r.to >= head);
          if (head >= s.from && head <= s.to && !atEnd) break;
          out = out.slice(0, -1);
        }
      }
      return out;
    },
    provide: (f) => View.decorations.from(f, (groups): DecorationSet => {
      const g = groups[groups.length - 1];
      if (!g) return Decoration.none;
      // the stops still ahead, marked as CodeMirror marks its snippet fields
      const marks = g.stops.slice(g.at + 1).flat().map((s) => (s.from === s.to ? Decoration.widget({ widget: new EmptyStop(), side: 1 }).range(s.from) : Decoration.mark({ class: "cm-snippetField" }).range(s.from, s.to)));
      return Decoration.set(marks, true);
    }),
  });

  const selectionOf = (stop: Span[]) => EditorSelection.create(stop.map((s) => EditorSelection.range(s.from, s.to)));

  /** Writes `body` over `from`–`to`, the caret at its first stop. */
  function insert(view: EditorView, body: string, from: number, to: number, visual = "", legacy = false): void {
    const { text, stops } = parseStops(body, visual, legacy);
    const abs = stops.map((st) => st.map((s) => ({ from: from + s.from, to: from + s.to })));
    const changes = { from, to, insert: text };
    if (abs.length < 2) { // no stop, or one place to land on: nothing to Tab through
      view.dispatch({ changes, selection: abs.length ? selectionOf(abs[0]) : { anchor: from + text.length }, scrollIntoView: true, userEvent: "input.complete" });
      return;
    }
    view.dispatch({ changes, selection: selectionOf(abs[0]), effects: push.of({ stops: abs, at: 0 }), scrollIntoView: true, userEvent: "input.complete" });
  }

  /** Tab: the next stop of the innermost snippet; at its last one that snippet is done, and Tab goes on in the one around it. */
  function next(view: EditorView): boolean {
    const groups = view.state.field(stopsField, false);
    const g = groups?.[groups.length - 1];
    if (!g) return false;
    const at = g.at + 1;
    if (at >= g.stops.length) { view.dispatch({ effects: pop.of(null) }); return next(view); }
    const last = at === g.stops.length - 1;
    view.dispatch({ selection: selectionOf(g.stops[at]), effects: last ? pop.of(null) : moveTo.of(at), scrollIntoView: true });
    return true;
  }

  /** Shift+Tab: the stop before, in the innermost snippet. */
  function prev(view: EditorView): boolean {
    const groups = view.state.field(stopsField, false);
    const g = groups?.[groups.length - 1];
    if (!g || g.at === 0) return false;
    view.dispatch({ selection: selectionOf(g.stops[g.at - 1]), effects: moveTo.of(g.at - 1), scrollIntoView: true });
    return true;
  }

  /** Where the span of the current stop that holds the caret ends (a mirrored stop has several), or null. */
  function currentEnd(state: EditorState): number | null {
    const groups = state.field(stopsField, false);
    const g = groups?.[groups.length - 1], head = state.selection.main.head;
    return g?.stops[g.at].find((s) => s.from <= head && head <= s.to)?.to ?? null;
  }

  const active = (state: EditorState): boolean => (state.field(stopsField, false)?.length ?? 0) > 0;
  /** Escape: every snippet's stops dropped. */
  const dropAll = (view: EditorView): void => { if (active(view.state)) view.dispatch({ effects: clear.of(null) }); };

  const theme = View.baseTheme({
    ".cm-snippetField": { backgroundColor: "#8881" },
    ".cm-snippetFieldPosition": { verticalAlign: "text-top", width: 0, height: "1.15em", display: "inline-block", margin: "0 -0.7px -.7em", borderLeft: "1.4px dotted #888" },
  });

  return { extension: [stopsField, theme], insert, next, prev, currentEnd, active, dropAll };
}
