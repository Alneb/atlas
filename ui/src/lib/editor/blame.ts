// "Who changed this line": git blame as a gutter beside the text (GET /api/git/blame). Each run of lines from one
// commit shows its author and date on its first line; the summary and hash on hover; a click opens the commit. The
// markers are a range set mapped through edits, so they stay on their lines while the file is changed.
import { gutter, GutterMarker } from "@codemirror/view";
import { RangeSet, RangeSetBuilder, StateField, type EditorState, type Extension } from "@codemirror/state";
import type { Blame } from "../gen/Blame";

const NOBODY = /^0+$/; // a line not committed yet

class BlameMarker extends GutterMarker {
  constructor(readonly hash: string, readonly label: string, readonly tip: string, readonly open: (hash: string, subject: string) => void, readonly subject: string) { super(); }
  eq(o: GutterMarker): boolean { return o instanceof BlameMarker && o.hash === this.hash && o.label === this.label; }
  toDOM(): Node {
    const el = document.createElement("span");
    el.className = NOBODY.test(this.hash) ? "cm-blame cm-blame-new" : "cm-blame";
    el.textContent = this.label;
    el.title = this.tip;
    if (!NOBODY.test(this.hash)) el.onclick = () => this.open(this.hash, this.subject);
    return el;
  }
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

/** The markers for `b` over the document as it is: one at the first line of each commit's run of lines. */
function markers(state: EditorState, b: Blame, open: (hash: string, subject: string) => void): RangeSet<GutterMarker> {
  const out = new RangeSetBuilder<GutterMarker>();
  let prev = "";
  for (let i = 0; i < b.lines.length && i < state.doc.lines; i++) {
    const hash = b.lines[i];
    if (hash === prev) continue;
    prev = hash;
    const c = b.commits[hash];
    const [label, tip] = NOBODY.test(hash) || !c
      ? ["not committed", "Changed since the last commit"]
      : [`${c.author} · ${day(c.time)}`, `${c.summary}\n${hash.slice(0, 8)} · ${c.author}, ${day(c.time)} — click to open the commit`];
    out.add(state.doc.line(i + 1).from, state.doc.line(i + 1).from, new BlameMarker(hash, label, tip, open, c?.summary ?? ""));
  }
  return out.finish();
}

/** The gutter for `b`, opening a commit with `open`. Put in a compartment; reconfigure with [] to take it away. */
export function blameExtension(b: Blame, open: (hash: string, subject: string) => void): Extension {
  const field = StateField.define<RangeSet<GutterMarker>>({ create: (state) => markers(state, b, open), update: (v, tr) => v.map(tr.changes) });
  return [field, gutter({ class: "cm-blame-gutter", markers: (view) => view.state.field(field) })];
}
