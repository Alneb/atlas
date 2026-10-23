// A properties-panel edit, applied to the open note as ONE editor change: the core rewrites only the
// frontmatter (frontmatter.rs: key order, comments and unknown keys kept), and the difference is
// dispatched into the editor, so undo, the dirty mark and the autosave are the editor's own.
import type { EditorView } from "@codemirror/view";
import { api } from "./api";
import type { FrontmatterEdit } from "./types";

/** The smallest change turning `a` into `b` (common prefix and suffix kept). */
export function diff(a: string, b: string): { from: number; to: number; insert: string } | null {
  if (a === b) return null;
  let p = 0;
  const n = Math.min(a.length, b.length);
  while (p < n && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  let s = 0;
  while (s < n - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
  return { from: p, to: a.length - s, insert: b.slice(p, b.length - s) };
}

/** Apply `edit` to the note in `view`. A note edited meanwhile (typing during the request) wins:
 *  the edit is dropped rather than overwrite what was typed, and the caller is told. */
export async function editFrontmatter(view: EditorView, edit: FrontmatterEdit): Promise<boolean> {
  const before = view.state.doc.toString();
  const { text } = await api.editFrontmatter(before, edit);
  if (view.state.doc.toString() !== before) return false;
  const change = diff(before, text);
  if (change) view.dispatch({ changes: change, userEvent: "input.properties" });
  return true;
}
