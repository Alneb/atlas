// CodeMirror's drawSelection() without its one costly rule. Its theme gives a focused element inside the editor its
// native selection back with `.cm-content :focus ::selection`; a `:focus … ::selection` rule makes the browser restyle
// the whole subtree of any element whose focus changes, so every focus move in or out of a long note (opening the
// command bar, closing it) restyled the note's thousands of elements. Here the same exception is keyed on what the
// element is (a form field or a nested editable), which no focus change touches.
import { EditorView, drawSelection } from "@codemirror/view";
import { Prec, type Extension } from "@codemirror/state";

// as CodeMirror: Firefox 153 ignores a transparent selection (discuss.codemirror.net/t/9838)
const CLEAR = typeof navigator !== "undefined" && /Firefox\/153\./.test(navigator.userAgent) ? "#ffffff01" : "transparent";
const FIELD = ":is(input, textarea, [contenteditable='true'], [contenteditable=''])";

const hideNative = Prec.highest(EditorView.theme({
  ".cm-line": {
    "& ::selection, &::selection": { backgroundColor: `${CLEAR} !important` },
    caretColor: "transparent !important",
  },
  ".cm-content": {
    caretColor: "transparent !important",
    [`& ${FIELD}`]: {
      caretColor: "auto !important",
      "&::selection, & ::selection": { backgroundColor: "Highlight !important" },
    },
  },
}));

/** drawSelection() with the theme above in place of its own (the 4th of its parts, checked: a CodeMirror update that
 * reshapes it fails loudly here instead of bringing the rule back). */
export function drawnSelection(): Extension {
  const parts = drawSelection() as Extension[];
  if (!Array.isArray(parts) || parts.length !== 5) throw new Error("drawSelection() changed shape: update drawn-selection.ts");
  return [parts[0], parts[1], parts[2], hideNative, parts[4]];
}
