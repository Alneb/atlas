// The editor side of lib/suggestions.ts: a quiet panel under a markdown note while the caret's section
// has a fitting view. Alt+Enter (or a click) inserts it at the end of the section; moving on hides it.
import { EditorView, showPanel, type Panel, keymap } from "@codemirror/view";
import { StateField, StateEffect, type Extension } from "@codemirror/state";
import { suggestFor, type Suggestion } from "../suggestions";

interface Offer { s: Suggestion; at: number }
const setOffer = StateEffect.define<Offer | null>();
const offerField = StateField.define<Offer | null>({
  create: () => null,
  update: (v, tr) => { for (const e of tr.effects) if (e.is(setOffer)) return e.value; return tr.docChanged && v ? null : v; },
  provide: (f) => showPanel.from(f, (o) => (o ? panel(o) : null)),
});

function panel(o: Offer): (view: EditorView) => Panel {
  return (view) => {
    const dom = document.createElement("div");
    dom.className = "atlas-suggest";
    const b = document.createElement("button");
    b.textContent = `💡 ${o.s.label}`;
    b.title = "Insert at the end of this section (Alt+Enter)";
    b.onclick = () => accept(view);
    const k = document.createElement("kbd");
    k.textContent = "Alt+Enter";
    dom.append(b, k);
    return { dom };
  };
}

function accept(view: EditorView): boolean {
  const o = view.state.field(offerField);
  if (!o) return false;
  const line = view.state.doc.lineAt(o.at);
  const pre = line.length ? "\n\n" : "\n";
  view.dispatch({ changes: { from: line.to, insert: pre + o.s.insert }, effects: setOffer.of(null) });
  return true;
}

/** The section around `pos`: from its heading to the next heading of the same or a higher level. */
function sectionAt(doc: EditorView["state"]["doc"], pos: number): { heading: string; from: number; to: number } {
  let start = 1, level = 7, heading = "";
  for (let n = doc.lineAt(pos).number; n >= 1; n--) {
    const m = /^(#{1,6})\s+(.*)/.exec(doc.line(n).text);
    if (m) { start = n; level = m[1].length; heading = m[2]; break; }
  }
  let end = doc.lines;
  for (let n = start + 1; n <= doc.lines; n++) {
    const m = /^(#{1,6})\s/.exec(doc.line(n).text);
    if (m && m[1].length <= level) { end = n - 1; break; }
  }
  // the last non-empty line, so an insert lands after the content
  while (end > start && !doc.line(end).text.trim()) end--;
  return { heading, from: doc.line(start).from, to: doc.line(end).to };
}

export function noteSuggestions(path: string): Extension {
  let t: ReturnType<typeof setTimeout> | undefined;
  let last = "";
  return [
    offerField,
    keymap.of([{ key: "Alt-Enter", run: accept }]),
    EditorView.updateListener.of((u) => {
      if (!u.selectionSet && !u.docChanged) return;
      clearTimeout(t);
      t = setTimeout(() => {
        const st = u.view.state;
        const sec = sectionAt(st.doc, st.selection.main.head);
        const s = suggestFor({ path, heading: sec.heading, text: st.sliceDoc(sec.from, sec.to) })[0];
        const key = s ? `${sec.from}|${s.label}` : "";
        if (key === last && !!st.field(offerField) === !!s) return;
        last = key;
        u.view.dispatch({ effects: setOffer.of(s ? { s, at: sec.to } : null) });
      }, 400);
    }),
    EditorView.theme({
      ".atlas-suggest": { display: "flex", gap: "8px", alignItems: "center", padding: "4px 12px", fontSize: "calc(12.5px * var(--ui-scale, 1))", background: "var(--bg-alt)", borderTop: "1px solid var(--border)" },
      ".atlas-suggest button": { color: "var(--accent)", padding: "0", font: "inherit" },
      ".atlas-suggest kbd": { color: "var(--text-faint)", fontFamily: "var(--font-mono)", fontSize: ".9em" },
    }),
  ];
}
