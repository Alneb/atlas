import { test, expect } from "@playwright/test";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { obsidianMarkdown } from "../src/lib/editor/live/obsidian-syntax.js";
import { livePreview } from "../src/lib/editor/live/live-preview.js";

// A revealed formula's source (live-preview.js): `\left`/`\right` small with their brackets coloured by depth, and the
// whole formula's marks there however the caret came in (from its closing line, the redraw once kept only that line).

const DOC = "# lr\n\n$$\n\\left( a + \\left[ b \\right] \\right)\n$$\n\nText between.\n";
const marks = (s: EditorState) => {
  const out: string[] = [];
  for (const d of s.facet(EditorView.decorations)) if (typeof d !== "function") d.between(0, DOC.length, (f, t, v) => { if (/math-lr/.test(v.spec?.class ?? "")) out.push(`${DOC.slice(f, t)}:${v.spec.class}`); });
  return out;
};

test("\\left and \\right marked by depth, the formula entered from its last line or its first", () => {
  let state = EditorState.create({ doc: DOC, selection: { anchor: DOC.indexOf("Text") }, extensions: [markdown({ base: markdownLanguage, extensions: obsidianMarkdown }), livePreview({})] });
  ensureSyntaxTree(state, DOC.length, 5000);
  expect(marks(state)).toEqual([]); // drawn, not source
  const want = ["\\left:cm-math-lr-cmd", "(:cm-math-lr cm-math-lr-0", "\\left:cm-math-lr-cmd", "[:cm-math-lr cm-math-lr-1",
    "\\right:cm-math-lr-cmd", "]:cm-math-lr cm-math-lr-1", "\\right:cm-math-lr-cmd", "):cm-math-lr cm-math-lr-0"];
  state = state.update({ selection: { anchor: DOC.indexOf("\n$$\n\nText") + 3 } }).state; // onto the closing `$$`
  expect(marks(state)).toEqual(want);
});
