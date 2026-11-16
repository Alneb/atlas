// A note's title is its first `# heading` when that heading says the file's name: edited there, the file is renamed
// too — once the caret leaves the line or the editor, after the text is saved (the tab follows the file). Off with
// `[editor] heading_renames`. The inline title (note-extensions.ts) is hidden while the heading is the title.
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import { Facet, StateField, type EditorState, type Extension } from "@codemirror/state";
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

/** The heading's words when the caret came onto it while it said the file's name; "" when it came onto it saying
 *  something else; null while the caret is elsewhere. Kept in the state, so the inline title (note-extensions.ts) and
 *  the rename below read one value — a note opened with the caret on a heading that is not its name keeps its title. */
const noteName = Facet.define<string, string>({ combine: (v) => v[0] ?? "" });
const armed = StateField.define<string | null>({
  create: (state) => arm(state, null),
  update: (was, tr) => (tr.selection || tr.docChanged ? arm(tr.state, was) : was),
});

function arm(state: EditorState, was: string | null): string | null {
  const h = enabled() ? titleHeading(state) : null;
  if (!h || state.doc.lineAt(state.selection.main.head).number !== h.line) return null;
  return was ?? (norm(h.text) === norm(state.facet(noteName)) ? h.text : "");
}

/** Whether the title heading is being edited (the inline title stays hidden meanwhile, as the words change). */
export function editingTitle(state: EditorState): boolean {
  return !!state.field(armed, false);
}

export function headingTitle(path: string): Extension {
  const name = shownName(path);
  const plugin = ViewPlugin.fromClass(class {
    asked = ""; // the name last asked for: a blur and then the caret leaving rename once
    update(u: ViewUpdate) {
      if (!enabled()) return;
      const was = u.startState.field(armed, false), now = u.state.field(armed, false);
      // the caret left the heading, or the editor lost focus with it there: the words are final
      const done = (was && now == null) || (now && u.focusChanged && !u.view.hasFocus);
      if (!done) return;
      const h = titleHeading(u.state), to = h ? nameFromHeading(h.text) : "";
      if (!to || norm(to) === norm(name) || to === this.asked) return;
      this.asked = to;
      void rename(u.view, to);
    }
  });
  return [noteName.of(name), armed, plugin];

  async function rename(_view: EditorView, to: string) {
    await [...editors.values()].find((e) => e.path === path)?.flush(); // the new heading on disk before the file moves
    await renameTo(path, to);
  }
}
