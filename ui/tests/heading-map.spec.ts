import { test, expect } from "@playwright/test";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import { mapHeadings } from "../src/lib/editor/heading-map";
import { noteHeadings } from "../src/lib/note-anchor";

// Headings carried over an edit must equal a fresh scan, or the edit must ask for one.
const scan = (s: EditorState) => noteHeadings(s.doc.iterLines()).map((h) => ({ level: h.level, text: h.text, line: h.i + 1 }));
const doc = "# A\ntext\n\n## B\nmore\n```\n# not\n```\n### C\n";

test("an edit of plain text moves the headings; one touching a mark asks for a rescan", () => {
  const s0 = EditorState.create({ doc });
  const carry = (spec: TransactionSpec) => {
    const tr = s0.update(spec);
    return { got: mapHeadings(scan(s0), s0.doc, tr.changes, tr.newDoc), want: scan(tr.state) };
  };
  for (const spec of [{ changes: { from: 5, insert: "x\ny\nz" } }, { changes: { from: 4, to: 9 } }, { changes: { from: 19, insert: "\n\n" } }]) {
    const { got, want } = carry(spec);
    expect(got).toEqual(want);
  }
  expect(carry({ changes: { from: 5, insert: "# new\n" } }).got).toBeNull(); // a heading typed
  expect(carry({ changes: { from: 0, to: 1 } }).got).toBeNull(); // a heading's mark removed
  expect(carry({ changes: { from: 3, to: 4 } }).got).toBeNull(); // a heading's line joined to the next
});
