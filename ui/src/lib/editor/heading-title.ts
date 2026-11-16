// A note's title is its first `# heading` when that heading says the file's name: edited there, the file is renamed
// too — once the caret leaves the line or the editor, after the text is saved (the tab follows the file). Off with
// `[editor] heading_renames`. The inline title (note-extensions.ts) is hidden while the heading is the title.
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import { frontmatterClose } from "./live/live-preview.js";
import { shownName } from "../paths";
import { renameTo } from "../rename-file";
import { editors } from "../registry";
import { settings } from "../settings.svelte";

/** A heading and a name compared as words: case, spaces and emphasis marks do not count. */
const norm = (t: string) => t.replace(/[*_`~]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** The note's first line of text after the frontmatter, when it is a `# heading`: its line number and its words. */
export function titleHeading(state: EditorState): { line: number; text: string } | null {
  const doc = state.doc;
  for (let n = frontmatterClose(doc) + 1; n <= Math.min(doc.lines, 400); n++) {
    const t = doc.line(n).text;
    if (!t.trim()) continue;
    const h = /^#[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(t);
    return h ? { line: n, text: h[1] } : null;
  }
  return null;
}

/** Whether the note's first heading says the file's name — then it is the note's title. */
export function headingRepeats(state: EditorState, name: string): boolean {
  const h = titleHeading(state);
  return !!h && norm(h.text) === norm(name);
}

/** The file name a heading gives: its words without emphasis marks, nor the characters a wikilink cannot carry. */
export function nameFromHeading(text: string): string {
  return text.replace(/[*_`~]/g, "").replace(/[[\]#^|]/g, "").replace(/:/g, " -").replace(/\s+/g, " ").trim();
}

const enabled = () => settings.config?.editor.heading_renames ?? true;

/** Whether the caret stands on the title heading (the inline title stays hidden meanwhile, as the words change). */
export function editingTitle(state: EditorState): boolean {
  if (!enabled()) return false;
  const h = titleHeading(state);
  return !!h && state.doc.lineAt(state.selection.main.head).number === h.line;
}

export function headingTitle(path: string) {
  const name = shownName(path);
  return ViewPlugin.fromClass(class {
    /** The heading's words when the caret came onto it while it said the name; "" when it did not; null: not on it. */
    armed: string | null = null;
    update(u: ViewUpdate) {
      if (!(u.selectionSet || u.docChanged || u.focusChanged) || !enabled()) return;
      const on = u.view.hasFocus && editingTitle(u.state);
      if (on && this.armed === null) {
        const h = titleHeading(u.state)!;
        this.armed = norm(h.text) === norm(name) ? h.text : "";
      } else if (!on && this.armed !== null) {
        const was = this.armed;
        this.armed = null;
        const h = titleHeading(u.state), to = h ? nameFromHeading(h.text) : "";
        if (was && to && norm(to) !== norm(name)) void rename(u.view, to);
      }
    }
  });

  async function rename(_view: EditorView, to: string) {
    await [...editors.values()].find((e) => e.path === path)?.flush(); // the new heading on disk before the file moves
    await renameTo(path, to);
  }
}
