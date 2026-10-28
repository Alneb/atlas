// A day's log drawn as a timeline: each captured line
// (`- 09:05 text`, also after a task box) gets its time in a column on the left and a dot on a line that runs through
// the entries around it; a task's box takes the dot's place, so every marker is in one column and every text starts at
// the same edge. Untimed items (to-dos of older logs) join the timeline when their run of items has a timed one. An entry's indented lines under it (a capture's picture or file) join it on the timeline, their
// embeds as thumbnails. Only in the daily log
// folder (`log_dir`); the file keeps its plain list.
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";

export const LOG_ENTRY = /^(\s*[-*] (?:\[.\] )?)(\d{1,2}:\d{2})(?= )/;
/** A line under an entry that belongs to it: indented, not a list item of its own. */
const MORE = /^\s+(?![-*+] |\d+[.)] )\S/;
/** A top-level item without a time (a to-do written in the log): on the timeline when its run of items has an entry. */
const ITEM = /^[-*] (?:\[.\] )?\S/;
const time = Decoration.mark({ class: "cm-log-time" });
// the markdown under the caret, quieted: an entry's `- ` / `- [ ] `, the source of an embed under it
const quiet = Decoration.mark({ class: "cm-log-src" });
const EMBED = /!\[\[[^\]]*\]\]/g;
const row = (first: boolean, last: boolean) =>
  Decoration.line({ class: `cm-log-entry${first ? " cm-log-first" : ""}${last ? " cm-log-last" : ""}` });
const more = (last: boolean) => Decoration.line({ class: `cm-log-more${last ? " cm-log-last" : ""}` });
const item = (first: boolean, last: boolean) => Decoration.line({ class: `cm-log-entry cm-log-untimed${first ? " cm-log-first" : ""}${last ? " cm-log-last" : ""}` });
const hide = Decoration.replace({}); // a line's indentation off the caret: its text lines up with the entry's

/** What a log line is: an entry, a line of the entry above, an untimed item after them, or neither. */
type Kind = "entry" | "more" | "item" | null;

function build(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  // one pass over the note (a day's log is short): runs of items and their lines; a run with a timed entry is on the line
  const kinds: Kind[] = [null];
  for (let n = 1, start = 1, timed = false; n <= doc.lines + 1; n++) {
    const text = n <= doc.lines ? doc.line(n).text : "";
    const k: Kind = n > doc.lines ? null : LOG_ENTRY.test(text) ? "entry" : ITEM.test(text) ? "item" : kinds[n - 1] && MORE.test(text) ? "more" : null;
    if (k === null) {
      if (!timed) for (let i = start; i < n; i++) kinds[i] = null;
      start = n + 1; timed = false;
    }
    timed ||= k === "entry";
    kinds[n] = k;
  }
  const kind = (n: number): Kind => kinds[n] ?? null;
  const caret = doc.lineAt(view.state.selection.main.head).number;
  // visible ranges can share a line (a rendered block splits the view): each line once, in order
  let next = 1;
  for (const { from, to } of view.visibleRanges) {
    for (let n = Math.max(doc.lineAt(from).number, next), end = doc.lineAt(to).number; n <= end; n++, next = n) {
      const line = doc.line(n);
      const k = kind(n);
      if (!k) continue;
      // the timeline runs on while the next line is an entry or one of this entry's lines
      const last = kind(n + 1) === null;
      if (k === "item") {
        b.add(line.from, line.from, item(kind(n - 1) === null, last));
        continue;
      }
      if (k === "more") {
        b.add(line.from, line.from, more(last));
        const indent = /^\s+/.exec(line.text)![0].length;
        if (n !== caret) b.add(line.from, line.from + indent, hide);
        for (const e of line.text.matchAll(EMBED)) b.add(line.from + e.index, line.from + e.index + e[0].length, quiet);
        continue;
      }
      b.add(line.from, line.from, row(kind(n - 1) === null, last));
      const m = LOG_ENTRY.exec(line.text)!;
      const at = line.from + m[1].length;
      b.add(line.from, at, quiet);
      b.add(at, at + m[2].length, time);
      // the space after the time (the time sits in its column): the text starts at the edge every entry's text does
      if (n !== caret) b.add(at + m[2].length, at + m[2].length + 1, hide);
    }
  }
  return b.finish();
}

export function logLines(isLog: () => boolean) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = isLog() ? build(view) : Decoration.none; }
    update(u: ViewUpdate) { if (isLog() && (u.docChanged || u.viewportChanged || u.selectionSet)) this.decorations = build(u.view); }
  }, { decorations: (v) => v.decorations });
}
